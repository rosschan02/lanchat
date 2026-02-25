/**
 * Socket.IO 初始化和事件处理
 * 处理用户连接、消息收发、在线状态
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db/init');
const { saveMessage } = require('./chat');
const {
    userOnline, userOfflineBySocketId,
    getOnlineUsers, getUserSocketId,
} = require('./presence');

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
         * data: { to: number, type: 'text'|'image', content: string }
         * to=0 表示群聊
         */
        socket.on('chat:message', (data) => {
            const { to, type, content } = data;

            if (!content || !type) return;

            // 保存消息到数据库
            const message = saveMessage(user.id, to || 0, type, content);

            if (to === 0) {
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
        });

        /**
         * 正在输入提示
         * data: { to: number }
         */
        socket.on('chat:typing', (data) => {
            const { to } = data;
            if (to === 0) {
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
