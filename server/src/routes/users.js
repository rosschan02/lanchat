/**
 * 用户管理路由 - 管理员专用
 * 提供用户增删改查和密码重置接口
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 所有接口都需要管理员权限
router.use(authMiddleware, adminMiddleware);

/**
 * GET /api/users - 获取所有用户列表
 */
router.get('/', (req, res) => {
    const db = getDb();
    const users = db.prepare(`
    SELECT id, username, nickname, avatar, role, status, created_at, updated_at
    FROM users ORDER BY id ASC
  `).all();
    res.json({ users });
});

/**
 * POST /api/users - 创建新用户
 * Body: { username, password, nickname, role }
 */
router.post('/', (req, res) => {
    const { username, password, nickname, role = 'user' } = req.body;

    if (!username || !password || !nickname) {
        return res.status(400).json({ error: '用户名、密码和昵称不能为空' });
    }

    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: '用户名长度需在 3-20 个字符之间' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: '密码长度不能少于 6 个字符' });
    }

    const db = getDb();

    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.status(409).json({ error: '用户名已存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
    INSERT INTO users (username, password, nickname, role)
    VALUES (?, ?, ?, ?)
  `).run(username, hashedPassword, nickname, role);

    res.status(201).json({
        message: '用户创建成功',
        user: { id: result.lastInsertRowid, username, nickname, role },
    });
});

/**
 * PUT /api/users/:id - 修改用户信息
 * Body: { nickname, role, status }
 */
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { nickname, role, status } = req.body;

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 构建动态更新
    const updates = [];
    const values = [];
    if (nickname !== undefined) { updates.push('nickname = ?'); values.push(nickname); }
    if (role !== undefined) { updates.push('role = ?'); values.push(role); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
        return res.status(400).json({ error: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ message: '用户信息已更新' });
});

/**
 * DELETE /api/users/:id - 删除用户
 */
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 不允许删除自己
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: '不能删除当前登录的管理员账号' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: '用户已删除' });
});

/**
 * PUT /api/users/:id/reset-password - 重置用户密码
 * Body: { password }
 */
router.put('/:id/reset-password', (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: '新密码长度不能少于 6 个字符' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        .run(hashedPassword, id);

    res.json({ message: '密码已重置' });
});

module.exports = router;
