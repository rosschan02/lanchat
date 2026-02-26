/**
 * JWT 认证中间件
 * 验证请求头中的 Bearer Token
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db/init');

/**
 * 通用认证中间件 - 验证 JWT Token
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, config.jwt.secret);

        // 查找用户确认存在且未被禁用
        const db = getDb();
        const user = db.prepare(`
            SELECT id, username, nickname, avatar, bio, role, status
            FROM users
            WHERE id = ?
        `).get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: '用户不存在' });
        }
        if (user.status === 'disabled') {
            return res.status(403).json({ error: '账号已被禁用' });
        }

        // 将用户信息附加到请求对象
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: '认证令牌无效或已过期' });
    }
}

/**
 * 管理员权限中间件 - 必须先经过 authMiddleware
 */
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
}

module.exports = { authMiddleware, adminMiddleware };
