/**
 * 消息历史路由
 * 提供私聊和群聊消息的历史查询
 */
const express = require('express');
const { getDb } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/messages/group - 获取群聊历史消息
 * Query: { limit, offset }
 */
router.get('/group', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const db = getDb();
    const messages = db.prepare(`
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE m.to_user_id = 0
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

    // 反转为时间升序，方便前端渲染
    res.json({ messages: messages.reverse() });
});

/**
 * GET /api/messages/private/:userId - 获取与某用户的私聊历史
 * Query: { limit, offset }
 */
router.get('/private/:userId', (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const db = getDb();
    const messages = db.prepare(`
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE (m.from_user_id = ? AND m.to_user_id = ?)
       OR (m.from_user_id = ? AND m.to_user_id = ?)
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(currentUserId, userId, userId, currentUserId, limit, offset);

    res.json({ messages: messages.reverse() });
});

module.exports = router;
