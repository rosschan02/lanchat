/**
 * 频道管理路由
 * 普通用户可查看自己加入的频道；管理员可创建频道并维护成员
 */
const express = require('express');
const { getDb } = require('../db/init');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getUserSocketId } = require('../socket/presence');

const router = express.Router();

function parsePositiveInt(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

function normalizeMemberIds(memberIds) {
    if (!Array.isArray(memberIds)) {
        return [];
    }

    return [...new Set(
        memberIds
            .map((id) => parseInt(id, 10))
            .filter((id) => Number.isInteger(id) && id > 0)
    )];
}

function assertUsersExist(db, userIds) {
    if (userIds.length === 0) {
        return true;
    }
    const placeholders = userIds.map(() => '?').join(',');
    const count = db.prepare(`SELECT COUNT(*) as count FROM users WHERE id IN (${placeholders})`).get(...userIds).count;
    return count === userIds.length;
}

function getChannelMembers(db, channelId) {
    return db.prepare(`
        SELECT u.id, u.username, u.nickname
        FROM channel_members cm
        INNER JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = ?
        ORDER BY u.id ASC
    `).all(channelId);
}

function getChannelMemberIds(db, channelId) {
    return db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?')
        .all(channelId)
        .map((row) => row.user_id);
}

function isChannelMember(db, channelId, userId) {
    return !!db.prepare(`
        SELECT 1
        FROM channel_members
        WHERE channel_id = ? AND user_id = ?
        LIMIT 1
    `).get(channelId, userId);
}

function emitToUsers(req, userIds, event, payload) {
    const io = req.app.get('io');
    if (!io) return;

    userIds.forEach((userId) => {
        const socketId = getUserSocketId(userId);
        if (socketId) {
            io.to(socketId).emit(event, payload);
        }
    });
}

function emitChannelUpdated(req, userIds) {
    emitToUsers(req, userIds, 'channel:updated');
}

function queryAnnouncement(db, channelId) {
    return db.prepare(`
        SELECT ca.channel_id, ca.content, ca.updated_by, ca.updated_at, u.nickname as updated_by_nickname
        FROM channel_announcements ca
        LEFT JOIN users u ON u.id = ca.updated_by
        WHERE ca.channel_id = ?
    `).get(channelId) || null;
}

// 认证后可访问
router.use(authMiddleware);

/**
 * GET /api/channels - 获取当前用户加入的频道
 */
router.get('/', (req, res) => {
    const db = getDb();
    const channels = db.prepare(`
        SELECT c.id, c.name, c.created_by, c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) as member_count
        FROM channels c
        INNER JOIN channel_members me ON me.channel_id = c.id
        WHERE me.user_id = ?
        ORDER BY c.id ASC
    `).all(req.user.id);

    res.json({ channels });
});

/**
 * GET /api/channels/admin - 管理员获取所有频道和成员
 */
router.get('/admin', adminMiddleware, (req, res) => {
    const db = getDb();
    const channels = db.prepare(`
        SELECT c.id, c.name, c.created_by, c.created_at, c.updated_at,
               cb.nickname as created_by_nickname,
               (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) as member_count
        FROM channels c
        LEFT JOIN users cb ON cb.id = c.created_by
        ORDER BY c.id ASC
    `).all();

    const members = db.prepare(`
        SELECT cm.channel_id, u.id, u.username, u.nickname
        FROM channel_members cm
        INNER JOIN users u ON u.id = cm.user_id
        ORDER BY cm.channel_id ASC, u.id ASC
    `).all();

    const memberMap = {};
    members.forEach((item) => {
        if (!memberMap[item.channel_id]) {
            memberMap[item.channel_id] = [];
        }
        memberMap[item.channel_id].push({
            id: item.id,
            username: item.username,
            nickname: item.nickname,
        });
    });

    res.json({
        channels: channels.map((channel) => ({
            ...channel,
            members: memberMap[channel.id] || [],
        })),
    });
});

/**
 * GET /api/channels/:id/announcement - 获取频道公告
 */
router.get('/:id/announcement', (req, res) => {
    const channelId = parsePositiveInt(req.params.id);
    if (!channelId) {
        return res.status(400).json({ error: '频道 ID 不合法' });
    }

    const db = getDb();
    if (!isChannelMember(db, channelId, req.user.id)) {
        return res.status(403).json({ error: '无权限查看该频道公告' });
    }

    const announcement = queryAnnouncement(db, channelId);
    res.json({ announcement });
});

/**
 * PUT /api/channels/:id/announcement - 更新频道公告（管理员）
 * Body: { content }
 */
router.put('/:id/announcement', adminMiddleware, (req, res) => {
    const channelId = parsePositiveInt(req.params.id);
    if (!channelId) {
        return res.status(400).json({ error: '频道 ID 不合法' });
    }

    const db = getDb();
    const exists = db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId);
    if (!exists) {
        return res.status(404).json({ error: '频道不存在' });
    }

    const content = String(req.body?.content || '').trim();
    if (content.length > 500) {
        return res.status(400).json({ error: '公告内容不能超过 500 个字符' });
    }

    if (!content) {
        db.prepare('DELETE FROM channel_announcements WHERE channel_id = ?').run(channelId);
    } else {
        db.prepare(`
            INSERT INTO channel_announcements (channel_id, content, updated_by, updated_at)
            VALUES (?, ?, ?, datetime('now', 'localtime'))
            ON CONFLICT(channel_id)
            DO UPDATE SET
                content = excluded.content,
                updated_by = excluded.updated_by,
                updated_at = datetime('now', 'localtime')
        `).run(channelId, content, req.user.id);
    }

    const announcement = queryAnnouncement(db, channelId);
    const memberIds = getChannelMemberIds(db, channelId);
    emitToUsers(req, memberIds, 'channel:announcement', { channelId, announcement });

    res.json({
        message: content ? '频道公告已更新' : '频道公告已清空',
        announcement,
    });
});

/**
 * POST /api/channels - 创建频道并设置成员（管理员）
 * Body: { name, memberIds: number[] }
 */
router.post('/', adminMiddleware, (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
        return res.status(400).json({ error: '频道名称不能为空' });
    }
    if (name.length > 30) {
        return res.status(400).json({ error: '频道名称不能超过 30 个字符' });
    }

    const db = getDb();
    const memberIds = normalizeMemberIds(req.body?.memberIds);
    if (!memberIds.includes(req.user.id)) {
        memberIds.push(req.user.id);
    }

    if (!assertUsersExist(db, memberIds)) {
        return res.status(400).json({ error: '包含不存在的用户' });
    }

    try {
        const result = db.transaction(() => {
            const inserted = db.prepare(`
                INSERT INTO channels (name, created_by)
                VALUES (?, ?)
            `).run(name, req.user.id);
            const channelId = inserted.lastInsertRowid;

            const insertMemberStmt = db.prepare(`
                INSERT INTO channel_members (channel_id, user_id, added_by)
                VALUES (?, ?, ?)
            `);
            memberIds.forEach((userId) => {
                insertMemberStmt.run(channelId, userId, req.user.id);
            });

            return { channelId };
        })();

        const channel = db.prepare(`
            SELECT c.id, c.name, c.created_by, c.created_at, c.updated_at,
                   (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) as member_count
            FROM channels c
            WHERE c.id = ?
        `).get(result.channelId);

        const members = getChannelMembers(db, result.channelId);
        emitChannelUpdated(req, memberIds);

        res.status(201).json({
            message: '频道创建成功',
            channel: { ...channel, members },
        });
    } catch (err) {
        if (String(err.message || '').includes('UNIQUE constraint failed: channels.name')) {
            return res.status(409).json({ error: '频道名称已存在' });
        }
        console.error('创建频道失败:', err);
        return res.status(500).json({ error: '创建频道失败' });
    }
});

/**
 * PUT /api/channels/:id - 修改频道（管理员）
 * Body: { name?, memberIds? }
 */
router.put('/:id', adminMiddleware, (req, res) => {
    const channelId = parsePositiveInt(req.params.id);
    if (!channelId) {
        return res.status(400).json({ error: '频道 ID 不合法' });
    }

    const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
    const hasMembers = Object.prototype.hasOwnProperty.call(req.body || {}, 'memberIds');
    if (!hasName && !hasMembers) {
        return res.status(400).json({ error: '没有需要更新的内容' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId);
    if (!existing) {
        return res.status(404).json({ error: '频道不存在' });
    }

    let nextName = null;
    if (hasName) {
        nextName = String(req.body?.name || '').trim();
        if (!nextName) {
            return res.status(400).json({ error: '频道名称不能为空' });
        }
        if (nextName.length > 30) {
            return res.status(400).json({ error: '频道名称不能超过 30 个字符' });
        }
    }

    let nextMemberIds = null;
    const oldMemberIds = db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?').all(channelId)
        .map((row) => row.user_id);

    if (hasMembers) {
        nextMemberIds = normalizeMemberIds(req.body?.memberIds);
        if (!nextMemberIds.includes(req.user.id)) {
            nextMemberIds.push(req.user.id);
        }
        if (!assertUsersExist(db, nextMemberIds)) {
            return res.status(400).json({ error: '包含不存在的用户' });
        }
    }

    try {
        db.transaction(() => {
            if (hasName) {
                db.prepare(`
                    UPDATE channels
                    SET name = ?, updated_at = datetime('now', 'localtime')
                    WHERE id = ?
                `).run(nextName, channelId);
            } else {
                db.prepare("UPDATE channels SET updated_at = datetime('now', 'localtime') WHERE id = ?")
                    .run(channelId);
            }

            if (hasMembers) {
                db.prepare('DELETE FROM channel_members WHERE channel_id = ?').run(channelId);
                const insertMemberStmt = db.prepare(`
                    INSERT INTO channel_members (channel_id, user_id, added_by)
                    VALUES (?, ?, ?)
                `);
                nextMemberIds.forEach((userId) => {
                    insertMemberStmt.run(channelId, userId, req.user.id);
                });
            }
        })();
    } catch (err) {
        if (String(err.message || '').includes('UNIQUE constraint failed: channels.name')) {
            return res.status(409).json({ error: '频道名称已存在' });
        }
        console.error('更新频道失败:', err);
        return res.status(500).json({ error: '更新频道失败' });
    }

    const channel = db.prepare(`
        SELECT c.id, c.name, c.created_by, c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) as member_count
        FROM channels c
        WHERE c.id = ?
    `).get(channelId);
    const members = getChannelMembers(db, channelId);
    const affectedUsers = [...new Set([...oldMemberIds, ...(nextMemberIds || oldMemberIds)])];
    emitChannelUpdated(req, affectedUsers);

    res.json({
        message: '频道已更新',
        channel: { ...channel, members },
    });
});

module.exports = router;
