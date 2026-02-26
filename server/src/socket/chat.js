/**
 * 聊天消息处理模块
 * 处理文字、图片、文件消息的收发和持久化
 */
const { getDb } = require('../db/init');

/**
 * 保存消息到数据库
 */
function saveMessage(fromUserId, toUserId, type, content) {
    const db = getDb();
    const result = db.prepare(`
    INSERT INTO messages (from_user_id, to_user_id, type, content)
    VALUES (?, ?, ?, ?)
  `).run(fromUserId, toUserId, type, content);

    // 返回完整的消息对象
    const message = db.prepare(`
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at, m.is_revoked,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

    return message;
}

/**
 * 撤回消息
 */
function revokeMessage(messageId) {
    const db = getDb();
    db.prepare('UPDATE messages SET is_revoked = 1 WHERE id = ?').run(messageId);
}

/**
 * 获取消息（用于撤回校验）
 */
function getMessage(messageId) {
    const db = getDb();
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
}

module.exports = { saveMessage, revokeMessage, getMessage };
