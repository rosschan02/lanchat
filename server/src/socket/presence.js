/**
 * 在线状态管理模块
 * 维护在线用户列表，处理上线/下线事件
 */

// 在线用户映射: userId -> { socketId, userInfo }
const onlineUsers = new Map();

/**
 * 用户上线
 */
function userOnline(userId, socketId, userInfo) {
    onlineUsers.set(userId, { socketId, ...userInfo });
}

/**
 * 更新在线用户资料
 */
function updateOnlineUser(userId, patch = {}) {
    const existing = onlineUsers.get(userId);
    if (!existing) return false;
    onlineUsers.set(userId, { ...existing, ...patch });
    return true;
}

/**
 * 用户下线
 */
function userOffline(userId) {
    onlineUsers.delete(userId);
}

/**
 * 通过 socketId 找到对应的 userId 并下线
 */
function userOfflineBySocketId(socketId) {
    for (const [userId, data] of onlineUsers.entries()) {
        if (data.socketId === socketId) {
            onlineUsers.delete(userId);
            return userId;
        }
    }
    return null;
}

/**
 * 获取在线用户列表
 */
function getOnlineUsers() {
    const users = [];
    for (const [userId, data] of onlineUsers.entries()) {
        users.push({
            id: userId,
            username: data.username,
            nickname: data.nickname,
            avatar: data.avatar,
            online: true,
        });
    }
    return users;
}

/**
 * 判断用户是否在线
 */
function isUserOnline(userId) {
    return onlineUsers.has(userId);
}

/**
 * 获取用户的 socketId
 */
function getUserSocketId(userId) {
    const user = onlineUsers.get(userId);
    return user ? user.socketId : null;
}

module.exports = {
    userOnline,
    updateOnlineUser,
    userOffline,
    userOfflineBySocketId,
    getOnlineUsers,
    isUserOnline,
    getUserSocketId,
};
