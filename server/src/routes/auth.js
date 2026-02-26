/**
 * 认证路由 - 登录/登出/获取用户信息
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDb } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const { updateOnlineUser } = require('../socket/presence');

const router = express.Router();

function queryUserProfile(db, userId) {
    return db.prepare(`
        SELECT id, username, nickname, avatar, bio, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
    `).get(userId);
}

/**
 * POST /api/auth/login - 用户登录
 * Body: { username, password }
 * 返回: { token, user }
 */
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (user.status === 'disabled') {
        return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成 JWT Token
    const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
    );

    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            bio: user.bio || '',
            role: user.role,
        },
    });
});

/**
 * GET /api/auth/profile - 获取当前用户信息
 */
router.get('/profile', authMiddleware, (req, res) => {
    const db = getDb();
    const user = queryUserProfile(db, req.user.id);
    res.json({ user });
});

/**
 * PUT /api/auth/profile - 修改当前用户资料
 * Body: { avatar?: string, bio?: string }
 */
router.put('/profile', authMiddleware, (req, res) => {
    const hasAvatar = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar');
    const hasBio = Object.prototype.hasOwnProperty.call(req.body || {}, 'bio');

    if (!hasAvatar && !hasBio) {
        return res.status(400).json({ error: '没有可更新的资料字段' });
    }

    const updates = [];
    const values = [];

    if (hasAvatar) {
        const avatar = String(req.body.avatar || '').trim();
        if (avatar.length > 500) {
            return res.status(400).json({ error: '头像地址过长' });
        }
        updates.push('avatar = ?');
        values.push(avatar);
    }

    if (hasBio) {
        const bio = String(req.body.bio || '').trim();
        if (bio.length > 300) {
            return res.status(400).json({ error: '简介不能超过 300 个字符' });
        }
        updates.push('bio = ?');
        values.push(bio);
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(req.user.id);

    const db = getDb();
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const user = queryUserProfile(db, req.user.id);
    updateOnlineUser(req.user.id, {
        nickname: user.nickname,
        avatar: user.avatar,
    });

    const io = req.app.get('io');
    if (io) {
        io.emit('user:profile-updated', {
            id: user.id,
            nickname: user.nickname,
            avatar: user.avatar,
            bio: user.bio,
        });
    }

    res.json({
        message: '个人资料已更新',
        user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            bio: user.bio || '',
            role: user.role,
        },
    });
});

module.exports = router;
