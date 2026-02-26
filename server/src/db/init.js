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
 * 确保 users 表包含资料字段
 */
function ensureUsersTableSchema(db) {
    const columns = db.prepare("PRAGMA table_info(users)").all();
    const hasBio = columns.some((column) => column.name === 'bio');
    if (!hasBio) {
        db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
        console.log('✅ 已添加 users.bio 字段');
    }
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
    const hasReplyToMessageId = columns.some((column) => column.name === 'reply_to_message_id');
    const hasEditedAt = columns.some((column) => column.name === 'edited_at');

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
                  reply_to_message_id INTEGER DEFAULT NULL,
                  edited_at TEXT DEFAULT NULL,
                  FOREIGN KEY (from_user_id) REFERENCES users(id),
                  FOREIGN KEY (reply_to_message_id) REFERENCES messages(id)
                )
            `);

            const isRevokedExpr = hasIsRevoked ? 'COALESCE(is_revoked, 0)' : '0';
            const channelIdExpr = hasChannelId ? 'channel_id' : 'NULL';
            const replyToExpr = hasReplyToMessageId ? 'reply_to_message_id' : 'NULL';
            const editedAtExpr = hasEditedAt ? 'edited_at' : 'NULL';
            db.exec(`
                INSERT INTO messages_new (
                    id, from_user_id, to_user_id, type, content, created_at,
                    is_revoked, channel_id, reply_to_message_id, edited_at
                )
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
                       ${channelIdExpr},
                       ${replyToExpr},
                       ${editedAtExpr}
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

    if (!hasReplyToMessageId) {
        db.exec('ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER DEFAULT NULL');
        console.log('✅ 已添加 reply_to_message_id 字段');
    }

    if (!hasEditedAt) {
        db.exec('ALTER TABLE messages ADD COLUMN edited_at TEXT DEFAULT NULL');
        console.log('✅ 已添加 edited_at 字段');
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
      bio TEXT DEFAULT '',
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
      reply_to_message_id INTEGER DEFAULT NULL,
      edited_at TEXT DEFAULT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (reply_to_message_id) REFERENCES messages(id)
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

    // 频道公告（每个频道最多一条，更新即覆盖）
    db.exec(`
    CREATE TABLE IF NOT EXISTS channel_announcements (
      channel_id INTEGER PRIMARY KEY,
      content TEXT NOT NULL,
      updated_by INTEGER NOT NULL,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

    // 会话已读状态：chat_key 支持 group / private:{userId} / channel:{channelId}
    db.exec(`
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id INTEGER NOT NULL,
      chat_key TEXT NOT NULL,
      last_read_message_id INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (user_id, chat_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

    // 兼容旧版本 schema
    ensureUsersTableSchema(db);
    ensureMessagesTableSchema(db);

    // 为消息表创建索引，加速查询
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id);
    CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_reads_chat_key ON chat_reads(chat_key);
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
