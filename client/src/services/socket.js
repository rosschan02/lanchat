/**
 * Socket.IO 客户端封装
 * 管理 WebSocket 连接和事件监听
 */
import { io } from 'socket.io-client';
import { getServerUrl } from './api';

let socket = null;

/**
 * 建立 Socket 连接
 */
export function connectSocket(token) {
    if (socket && socket.connected) {
        return socket;
    }

    socket = io(getServerUrl(), {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
        console.log('✅ WebSocket 已连接');
    });

    socket.on('connect_error', (err) => {
        console.error('❌ WebSocket 连接失败:', err.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('⚠️ WebSocket 已断开:', reason);
    });

    return socket;
}

/**
 * 断开 Socket 连接
 */
export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

/**
 * 获取当前 Socket 实例
 */
export function getSocket() {
    return socket;
}

/**
 * 发送聊天消息
 */
export function sendMessage(to, type, content, options = {}) {
    if (socket && socket.connected) {
        socket.emit('chat:message', {
            to,
            type,
            content,
            channelId: options.channelId,
            replyToMessageId: options.replyToMessageId,
        });
    }
}

/**
 * 撤回消息
 */
export function revokeMessage(messageId) {
    if (socket && socket.connected) {
        socket.emit('chat:revoke', { messageId });
    }
}

/**
 * 编辑消息
 */
export function editMessage(messageId, content, ack) {
    if (socket && socket.connected) {
        socket.emit('chat:edit', { messageId, content }, ack);
        return;
    }
    if (typeof ack === 'function') {
        ack({ ok: false, error: '连接已断开' });
    }
}

/**
 * 发送正在输入提示
 */
export function sendTyping(to, options = {}) {
    if (socket && socket.connected) {
        socket.emit('chat:typing', { to, channelId: options.channelId });
    }
}

/**
 * 标记会话已读
 */
export function markChatRead(to, options = {}, ack) {
    if (socket && socket.connected) {
        socket.emit('chat:read', { to, channelId: options.channelId }, ack);
        return;
    }
    if (typeof ack === 'function') {
        ack({ ok: false, error: '连接已断开' });
    }
}
