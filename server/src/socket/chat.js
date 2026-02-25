/**
 * 聊天消息处理模块
 * 处理文字和图片消息的收发和持久化
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
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

    return message;
}

module.exports = { saveMessage };
