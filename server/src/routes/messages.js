/**
 * 消息历史路由
 * 提供私聊、群聊、频道消息的历史查询
 */
const express = require('express');
const { getDb } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

const MESSAGE_SELECT_SQL = `
    SELECT m.id, m.from_user_id, m.to_user_id, m.type, m.content, m.created_at, m.is_revoked, m.channel_id,
           m.reply_to_message_id, m.edited_at,
           u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar,
           rm.type as reply_type, rm.content as reply_content, rm.from_user_id as reply_from_user_id,
           ru.nickname as reply_from_nickname
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
    LEFT JOIN users ru ON ru.id = rm.from_user_id
`;

function parsePositiveInt(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

function isChannelMember(db, channelId, userId) {
    return !!db.prepare(`
        SELECT 1
        FROM channel_members
        WHERE channel_id = ? AND user_id = ?
        LIMIT 1
    `).get(channelId, userId);
}

/**
 * GET /api/messages/group - 获取群聊历史消息
 * Query: { limit, offset }
 */
router.get('/group', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const db = getDb();
    const messages = db.prepare(`
        ${MESSAGE_SELECT_SQL}
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
        ${MESSAGE_SELECT_SQL}
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
    const channelId = parsePositiveInt(req.params.channelId);
    if (!channelId) {
        return res.status(400).json({ error: '频道 ID 不合法' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const db = getDb();

    if (!isChannelMember(db, channelId, req.user.id)) {
        return res.status(403).json({ error: '无权限访问该频道消息' });
    }

    const messages = db.prepare(`
        ${MESSAGE_SELECT_SQL}
        WHERE m.channel_id = ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
    `).all(channelId, limit, offset);

    res.json({ messages: messages.reverse() });
});

/**
 * GET /api/messages/read-state - 获取指定会话的已读状态
 * Query:
 *  - 群聊: { chatId: 0 }
 *  - 私聊: { chatId: userId }
 *  - 频道: { channelId }
 */
router.get('/read-state', (req, res) => {
    const db = getDb();
    const currentUserId = req.user.id;
    const hasChannel = req.query.channelId !== undefined && req.query.channelId !== '';
    const hasChat = req.query.chatId !== undefined && req.query.chatId !== '';

    if (!hasChannel && !hasChat) {
        return res.status(400).json({ error: '缺少会话参数' });
    }

    if (hasChannel) {
        const channelId = parsePositiveInt(req.query.channelId);
        if (!channelId) {
            return res.status(400).json({ error: '频道 ID 不合法' });
        }
        if (!isChannelMember(db, channelId, currentUserId)) {
            return res.status(403).json({ error: '无权限查看该频道已读状态' });
        }
        const chatKey = `channel:${channelId}`;
        const records = db.prepare(`
            SELECT cr.user_id, cr.chat_key, cr.last_read_message_id, cr.updated_at,
                   u.nickname
            FROM chat_reads cr
            LEFT JOIN users u ON u.id = cr.user_id
            WHERE cr.chat_key = ?
              AND cr.user_id IN (SELECT user_id FROM channel_members WHERE channel_id = ?)
        `).all(chatKey, channelId);
        return res.json({ records });
    }

    const chatId = parseInt(req.query.chatId, 10);
    if (!Number.isInteger(chatId) || chatId < 0) {
        return res.status(400).json({ error: '会话 ID 不合法' });
    }

    if (chatId === 0) {
        const records = db.prepare(`
            SELECT cr.user_id, cr.chat_key, cr.last_read_message_id, cr.updated_at,
                   u.nickname
            FROM chat_reads cr
            LEFT JOIN users u ON u.id = cr.user_id
            WHERE cr.chat_key = 'group'
        `).all();
        return res.json({ records });
    }

    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(chatId);
    if (!targetUser) {
        return res.status(404).json({ error: '目标用户不存在' });
    }

    const selfKey = `private:${chatId}`;
    const peerKey = `private:${currentUserId}`;
    const records = db.prepare(`
        SELECT cr.user_id, cr.chat_key, cr.last_read_message_id, cr.updated_at,
               u.nickname
        FROM chat_reads cr
        LEFT JOIN users u ON u.id = cr.user_id
        WHERE (cr.user_id = ? AND cr.chat_key = ?)
           OR (cr.user_id = ? AND cr.chat_key = ?)
    `).all(currentUserId, selfKey, chatId, peerKey);

    res.json({ records });
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
        const cid = parsePositiveInt(channelId);
        if (!cid) {
            return res.status(400).json({ error: '频道 ID 不合法' });
        }

        if (!isChannelMember(db, cid, currentUserId)) {
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
