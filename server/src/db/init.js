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
 * 确保 messages 表结构支持 file 类型消息和频道字段
 * 兼容早期版本 schema
 */
function ensureMessagesTableSchema(db) {
    const table = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'"
    ).get();
    if (!table || !table.sql) {
        return;
    }

    const supportsFileType = /check\s*\(\s*type\s+in\s*\(\s*'text'\s*,\s*'image'\s*,\s*'file'\s*\)\s*\)/i
        .test(table.sql);

    const columns = db.prepare("PRAGMA table_info(messages)").all();
    const hasIsRevoked = columns.some((column) => column.name === 'is_revoked');
    const hasChannelId = columns.some((column) => column.name === 'channel_id');

    // 旧表约束不支持 file，执行重建迁移
    if (!supportsFileType) {
        const migrate = db.transaction(() => {
            db.exec(`
                CREATE TABLE messages_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  from_user_id INTEGER NOT NULL,
                  to_user_id INTEGER DEFAULT 0,
                  type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'file')),
                  content TEXT NOT NULL,
                  created_at TEXT DEFAULT (datetime('now', 'localtime')),
                  is_revoked INTEGER DEFAULT 0,
                  channel_id INTEGER DEFAULT NULL,
                  FOREIGN KEY (from_user_id) REFERENCES users(id)
                )
            `);

            const isRevokedExpr = hasIsRevoked ? 'COALESCE(is_revoked, 0)' : '0';
            const channelIdExpr = hasChannelId ? 'channel_id' : 'NULL';
            db.exec(`
                INSERT INTO messages_new (id, from_user_id, to_user_id, type, content, created_at, is_revoked, channel_id)
                SELECT id,
                       from_user_id,
                       COALESCE(to_user_id, 0),
                       CASE
                         WHEN type IN ('text', 'image', 'file') THEN type
                         ELSE 'text'
                       END,
                       content,
                       created_at,
                       ${isRevokedExpr},
                       ${channelIdExpr}
                FROM messages
            `);

            db.exec('DROP TABLE messages');
            db.exec('ALTER TABLE messages_new RENAME TO messages');
        });

        migrate();
        console.log('✅ 已迁移 messages 表，支持 file 消息类型');
        return;
    }

    // 新约束表但缺少撤回字段，补齐
    if (!hasIsRevoked) {
        db.exec('ALTER TABLE messages ADD COLUMN is_revoked INTEGER DEFAULT 0');
        console.log('✅ 已添加 is_revoked 字段');
    }

    if (!hasChannelId) {
        db.exec('ALTER TABLE messages ADD COLUMN channel_id INTEGER DEFAULT NULL');
        console.log('✅ 已添加 channel_id 字段');
    }
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
      is_revoked INTEGER DEFAULT 0,
      channel_id INTEGER DEFAULT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id)
    )
  `);

    // 创建频道表
    db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

    // 创建频道成员关系表
    db.exec(`
    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      added_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (channel_id, user_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (added_by) REFERENCES users(id)
    )
  `);

    // 兼容旧版本 schema
    ensureMessagesTableSchema(db);

    // 为消息表创建索引，加速查询
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
  `);

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
