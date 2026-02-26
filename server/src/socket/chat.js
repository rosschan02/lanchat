/**
 * 聊天消息处理模块
 * 处理消息的持久化、编辑、撤回与已读状态
 */
const { getDb } = require('../db/init');

const MESSAGE_SELECT_BY_ID_SQL = `
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at, m.is_revoked,
           m.channel_id, m.reply_to_message_id, m.edited_at,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar,
           rm.type as reply_type, rm.content as reply_content, rm.from_user_id as reply_from_user_id,
           ru.nickname as reply_from_nickname
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
    LEFT JOIN users ru ON ru.id = rm.from_user_id
    WHERE m.id = ?
`;

/**
 * 保存消息到数据库
 */
function saveMessage(fromUserId, toUserId, type, content, channelId = null, replyToMessageId = null) {
    const db = getDb();
    const result = db.prepare(`
    INSERT INTO messages (from_user_id, to_user_id, type, content, channel_id, reply_to_message_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(fromUserId, toUserId, type, content, channelId, replyToMessageId);

    // 返回完整的消息对象
    return db.prepare(MESSAGE_SELECT_BY_ID_SQL).get(result.lastInsertRowid);
}

/**
 * 撤回消息
 */
function revokeMessage(messageId) {
    const db = getDb();
    db.prepare('UPDATE messages SET is_revoked = 1 WHERE id = ?').run(messageId);
}

/**
 * 编辑消息内容
 */
function editMessage(messageId, content) {
    const db = getDb();
    db.prepare(`
        UPDATE messages
        SET content = ?, edited_at = datetime('now', 'localtime')
        WHERE id = ?
    `).run(content, messageId);
}

/**
 * 获取消息（用于撤回校验）
 */
function getMessage(messageId) {
    const db = getDb();
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
}

/**
 * 更新某会话已读游标
 */
function upsertChatRead(userId, chatKey, lastReadMessageId) {
    const db = getDb();
    db.prepare(`
        INSERT INTO chat_reads (user_id, chat_key, last_read_message_id, updated_at)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(user_id, chat_key)
        DO UPDATE SET
            last_read_message_id = CASE
                WHEN excluded.last_read_message_id > chat_reads.last_read_message_id THEN excluded.last_read_message_id
                ELSE chat_reads.last_read_message_id
            END,
            updated_at = datetime('now', 'localtime')
    `).run(userId, chatKey, lastReadMessageId);
}

module.exports = {
    saveMessage,
    revokeMessage,
    editMessage,
    getMessage,
    upsertChatRead,
};
