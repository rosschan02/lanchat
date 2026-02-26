/**
 * 数据库初始化模块
 * 使用 better-sqlite3 创建并初始化 SQLite 数据库
 */
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');

// 数据库文件路径
const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

/**
 * 获取数据库实例（单例模式）
 */
function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        // 开启 WAL 模式提升并发性能
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

/**
 * 初始化数据库表结构
 */
function initDatabase() {
    const db = getDb();

    // 创建用户表
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

    // 创建消息表
    db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER DEFAULT 0,
      type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'file')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (from_user_id) REFERENCES users(id)
    )
  `);

    // 为消息表创建索引，加速查询
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `);

    // 迁移：为 messages 表添加 is_revoked 字段（如果不存在）
    const columns = db.prepare("PRAGMA table_info(messages)").all();
    if (!columns.find(c => c.name === 'is_revoked')) {
        db.exec('ALTER TABLE messages ADD COLUMN is_revoked INTEGER DEFAULT 0');
        console.log('✅ 已添加 is_revoked 字段');
    }

    // 创建默认管理员账号（如果不存在）
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(config.admin.username);
    if (!adminExists) {
        const hashedPassword = bcrypt.hashSync(config.admin.password, 10);
        db.prepare(`
      INSERT INTO users (username, password, nickname, role)
      VALUES (?, ?, '管理员', 'admin')
    `).run(config.admin.username, hashedPassword);
        console.log(`✅ 已创建默认管理员账号: ${config.admin.username}`);
    }

    console.log('✅ 数据库初始化完成');
}

module.exports = { getDb, initDatabase };
