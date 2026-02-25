/**
 * 认证路由 - 登录/登出/获取用户信息
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDb } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

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
            role: user.role,
        },
    });
});

/**
 * GET /api/auth/profile - 获取当前用户信息
 */
router.get('/profile', authMiddleware, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;
