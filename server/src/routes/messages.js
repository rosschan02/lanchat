/**
 * 消息历史路由
 * 提供私聊、群聊、频道消息的历史查询
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
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at, m.is_revoked, m.channel_id,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE m.to_user_id = 0 AND m.channel_id IS NULL
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
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at, m.is_revoked, m.channel_id,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    WHERE m.channel_id IS NULL
      AND ((m.from_user_id = ? AND m.to_user_id = ?)
       OR (m.from_user_id = ? AND m.to_user_id = ?))
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(currentUserId, userId, userId, currentUserId, limit, offset);

    res.json({ messages: messages.reverse() });
});

/**
 * GET /api/messages/channel/:channelId - 获取频道历史消息
 * Query: { limit, offset }
 */
router.get('/channel/:channelId', (req, res) => {
    const channelId = parseInt(req.params.channelId, 10);
    if (!Number.isInteger(channelId) || channelId <= 0) {
        return res.status(400).json({ error: '频道 ID 不合法' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const db = getDb();

    const member = db.prepare(`
        SELECT 1
        FROM channel_members
        WHERE channel_id = ? AND user_id = ?
        LIMIT 1
    `).get(channelId, req.user.id);
    if (!member) {
        return res.status(403).json({ error: '无权限访问该频道消息' });
    }

    const messages = db.prepare(`
        SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at, m.is_revoked, m.channel_id,
               u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE m.channel_id = ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
    `).all(channelId, limit, offset);

    res.json({ messages: messages.reverse() });
});

/**
 * GET /api/messages/search - 搜索消息
 * Query: { keyword, chatId (optional), channelId (optional), page, pageSize }
 */
router.get('/search', (req, res) => {
    const { keyword, chatId, channelId, page = 1, pageSize = 20 } = req.query;
    const currentUserId = req.user.id;

    if (!keyword || !keyword.trim()) {
        return res.status(400).json({ error: '请输入搜索关键词' });
    }

    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    const likePattern = `%${keyword.trim()}%`;

    let whereClause = "m.type = 'text' AND m.is_revoked = 0 AND m.content LIKE ?";
    const params = [likePattern];

    if (channelId !== undefined && channelId !== '') {
        const cid = parseInt(channelId, 10);
        if (!Number.isInteger(cid) || cid <= 0) {
            return res.status(400).json({ error: '频道 ID 不合法' });
        }

        const member = db.prepare(`
            SELECT 1
            FROM channel_members
            WHERE channel_id = ? AND user_id = ?
            LIMIT 1
        `).get(cid, currentUserId);
        if (!member) {
            return res.status(403).json({ error: '无权限搜索该频道消息' });
        }

        whereClause += ' AND m.channel_id = ?';
        params.push(cid);
    } else if (chatId !== undefined && chatId !== '') {
        const cid = parseInt(chatId);
        if (cid === 0) {
            whereClause += ' AND m.to_user_id = 0 AND m.channel_id IS NULL';
        } else {
            whereClause += ' AND m.channel_id IS NULL AND ((m.from_user_id = ? AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = ?))';
            params.push(currentUserId, cid, cid, currentUserId);
        }
    } else {
        whereClause += `
            AND (
                (m.channel_id IS NULL AND m.to_user_id = 0)
                OR (m.channel_id IS NULL AND ((m.from_user_id = ? AND m.to_user_id > 0) OR m.to_user_id = ?))
                OR (m.channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = ?))
            )
        `;
        params.push(currentUserId, currentUserId, currentUserId);
    }

    const countResult = db.prepare(
        `SELECT COUNT(*) as total FROM messages m WHERE ${whereClause}`
    ).get(...params);

    const messages = db.prepare(`
        SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at,
               m.channel_id,
               u.username as from_username, u.nickname as from_nickname
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE ${whereClause}
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
        messages: messages.reverse(),
        total: countResult.total,
        page: parseInt(page),
        pageSize: limit,
    });
});

module.exports = router;
