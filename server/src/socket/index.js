/**
 * Socket.IO 初始化和事件处理
 * 处理用户连接、消息收发、在线状态
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db/init');
const { saveMessage, revokeMessage, getMessage } = require('./chat');
const {
    userOnline, userOfflineBySocketId,
    getOnlineUsers, getUserSocketId,
} = require('./presence');
const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'file']);

function replyAck(ack, payload) {
    if (typeof ack === 'function') {
        ack(payload);
    }
}

function isValidFileMessageContent(content) {
    if (typeof content !== 'string' || !content.trim()) {
        return false;
    }

    try {
        const parsed = JSON.parse(content);
        return parsed
            && typeof parsed.name === 'string'
            && parsed.name.trim().length > 0
            && typeof parsed.url === 'string'
            && parsed.url.trim().length > 0;
    } catch (err) {
        return false;
    }
}

function parseChannelId(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

function getChannelMemberIds(db, channelId) {
    return db.prepare(`
        SELECT user_id
        FROM channel_members
        WHERE channel_id = ?
    `).all(channelId).map((row) => row.user_id);
}

function isUserInChannel(db, channelId, userId) {
    return !!db.prepare(`
        SELECT 1
        FROM channel_members
        WHERE channel_id = ? AND user_id = ?
        LIMIT 1
    `).get(channelId, userId);
}

function emitToUsers(io, userIds, event, payload) {
    userIds.forEach((userId) => {
        const socketId = getUserSocketId(userId);
        if (socketId) {
            io.to(socketId).emit(event, payload);
        }
    });
}

/**
 * 初始化 Socket.IO 事件处理
 */
function initSocket(io) {
    // Socket.IO 认证中间件
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('未提供认证令牌'));
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            const db = getDb();
            const user = db.prepare(
                'SELECT id, username, nickname, avatar, role, status FROM users WHERE id = ?'
            ).get(decoded.userId);

            if (!user || user.status === 'disabled') {
                return next(new Error('用户不存在或已被禁用'));
            }

            socket.user = user;
            next();
        } catch (err) {
            return next(new Error('认证令牌无效'));
        }
    });

    io.on('connection', (socket) => {
        const user = socket.user;
        console.log(`🟢 用户上线: ${user.nickname} (${user.username})`);

        // 注册在线状态
        userOnline(user.id, socket.id, {
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
        });

        // 广播用户上线
        socket.broadcast.emit('user:joined', {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
        });

        // 发送在线用户列表给当前用户
        socket.emit('user:list', getOnlineUsers());

        // ===== 聊天消息处理 =====

        /**
         * 接收聊天消息
         * data: { to: number, type: 'text'|'image'|'file', content: string, channelId?: number }
         * to=0 表示群聊
         */
        socket.on('chat:message', (data, ack) => {
            const to = Number.isInteger(data?.to) ? data.to : parseInt(data?.to, 10) || 0;
            const type = typeof data?.type === 'string' ? data.type.trim() : '';
            const content = typeof data?.content === 'string' ? data.content : '';
            const channelId = parseChannelId(data?.channelId);
            const db = getDb();

            if (!ALLOWED_MESSAGE_TYPES.has(type) || !content.trim()) {
                replyAck(ack, { ok: false, error: '消息格式不合法' });
                return;
            }
            if (to < 0) {
                replyAck(ack, { ok: false, error: '目标会话不合法' });
                return;
            }
            if (type === 'file' && !isValidFileMessageContent(content)) {
                replyAck(ack, { ok: false, error: '文件消息格式不合法' });
                return;
            }
            if (channelId && to !== 0) {
                replyAck(ack, { ok: false, error: '频道消息目标不合法' });
                return;
            }
            if (channelId && !isUserInChannel(db, channelId, user.id)) {
                replyAck(ack, { ok: false, error: '你不在该频道中' });
                return;
            }

            let message;
            try {
                // 保存消息到数据库
                message = saveMessage(user.id, to, type, content, channelId);
            } catch (err) {
                console.error('保存消息失败:', err);
                replyAck(ack, { ok: false, error: '消息保存失败' });
                socket.emit('chat:error', { error: '消息保存失败，请重试' });
                return;
            }

            // 检测 @提及
            if (type === 'text' && content.includes('@')) {
                const allUsers = channelId
                    ? db.prepare(`
                        SELECT u.id, u.nickname
                        FROM users u
                        INNER JOIN channel_members cm ON cm.user_id = u.id
                        WHERE cm.channel_id = ?
                    `).all(channelId)
                    : db.prepare('SELECT id, nickname FROM users').all();
                const mentionedUsers = allUsers.filter(u =>
                    content.includes(`@${u.nickname}`) && u.id !== user.id
                );

                mentionedUsers.forEach(mentionedUser => {
                    const mentionSocketId = getUserSocketId(mentionedUser.id);
                    if (mentionSocketId) {
                        io.to(mentionSocketId).emit('chat:mentioned', {
                            messageId: message.id,
                            from: user.nickname,
                            chatId: channelId ? `channel:${channelId}` : (to || 0),
                        });
                    }
                });
            }

            if (channelId) {
                const memberIds = getChannelMemberIds(db, channelId);
                emitToUsers(io, memberIds, 'chat:message', message);
            } else if (to === 0) {
                // 群聊消息 - 广播所有人
                io.emit('chat:message', message);
            } else {
                // 私聊消息 - 发送给目标用户和自己
                const targetSocketId = getUserSocketId(to);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('chat:message', message);
                }
                // 发送给自己
                socket.emit('chat:message', message);
            }

            replyAck(ack, { ok: true, id: message.id });
        });

        /**
         * 正在输入提示
         * data: { to: number, channelId?: number }
         */
        socket.on('chat:typing', (data) => {
            const to = Number.isInteger(data?.to) ? data.to : parseInt(data?.to, 10) || 0;
            const channelId = parseChannelId(data?.channelId);
            const db = getDb();

            if (channelId) {
                if (!isUserInChannel(db, channelId, user.id)) {
                    return;
                }
                const members = getChannelMemberIds(db, channelId).filter((id) => id !== user.id);
                emitToUsers(io, members, 'chat:typing', {
                    from: user.id,
                    fromNickname: user.nickname,
                    channelId,
                });
            } else if (to === 0) {
                socket.broadcast.emit('chat:typing', {
                    from: user.id,
                    fromNickname: user.nickname,
                });
            } else {
                const targetSocketId = getUserSocketId(to);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('chat:typing', {
                        from: user.id,
                        fromNickname: user.nickname,
                    });
                }
            }
        });

        /**
         * 撤回消息
         * data: { messageId: number }
         */
        socket.on('chat:revoke', (data) => {
            const { messageId } = data;
            const message = getMessage(messageId);
            if (!message) return;

            // 校验权限：自己的消息 2 分钟内，或管理员无限制
            const isOwner = message.from_user_id === user.id;
            const isAdmin = user.role === 'admin';
            const withinTimeLimit = (Date.now() - new Date(message.created_at).getTime()) < 2 * 60 * 1000;

            if (!isOwner && !isAdmin) return;
            if (isOwner && !isAdmin && !withinTimeLimit) return;

            revokeMessage(messageId);

            const revokeEvent = {
                messageId,
                revokedBy: user.nickname,
                chatId: message.channel_id ? `channel:${message.channel_id}` : message.to_user_id,
            };

            if (message.channel_id) {
                const memberIds = getChannelMemberIds(getDb(), message.channel_id);
                emitToUsers(io, memberIds, 'chat:revoked', revokeEvent);
            } else if (message.to_user_id === 0) {
                io.emit('chat:revoked', revokeEvent);
            } else {
                const targetSocketId = getUserSocketId(message.to_user_id);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('chat:revoked', revokeEvent);
                }
                const fromSocketId = getUserSocketId(message.from_user_id);
                if (fromSocketId) {
                    io.to(fromSocketId).emit('chat:revoked', revokeEvent);
                }
            }
        });

        // ===== 断开连接处理 =====

        socket.on('disconnect', () => {
            console.log(`⚫ 用户下线: ${user.nickname} (${user.username})`);
            const userId = userOfflineBySocketId(socket.id);
            if (userId) {
                // 广播用户下线
                socket.broadcast.emit('user:left', { id: userId });
            }
        });
    });
}

module.exports = { initSocket };
