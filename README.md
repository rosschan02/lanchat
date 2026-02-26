# LanChat - 局域网聊天工具

基于 Electron + Vue 3 + Node.js + Socket.IO + SQLite 的局域网即时通讯工具。

## 功能特性

- 🔐 账号密码登录认证
- 👥 实时在线用户列表
- 💬 群聊和私聊
- #️⃣ 频道聊天（管理员创建频道并管理成员）
- 📷 图片发送
- 📎 文件发送与下载（桌面端支持“另存为”）
- 😀 表情面板（含最近使用）
- @ 提及提醒与未读标记
- 💬 消息回复/引用与编辑（2 分钟内可编辑，管理员不受限）
- ✅ 已读回执与未读分割线（私聊/频道）
- 📌 会话置顶、🔕 免打扰与草稿保存
- 📣 频道公告置顶展示（管理员可编辑）
- ↩️ 消息撤回（2 分钟内可撤回，管理员不受限）
- 🔎 聊天记录关键词搜索（当前会话/全部会话）
- 👤 个人资料修改（头像上传 + 简介），聊天消息展示用户头像
- ✂️ 系统级截图（支持工具栏一键截图与 Ctrl+Shift+A）
- 🔔 系统托盘和消息通知
- 📜 聊天记录持久化
- 👨‍💼 后台管理（用户管理 + 频道管理）

## 技术栈

### 客户端
| 技术 | 版本 |
|------|------|
| Vue | 3.5.x |
| Vite | 6.x |
| Electron | 35.x |
| Element Plus | 2.13.x |
| Pinia | 2.3.x |
| Axios | 1.8.x |
| Socket.IO Client | 4.8.x |

### 服务端
| 技术 | 版本 |
|------|------|
| Express | 4.21.x |
| Socket.IO | 4.8.x |
| better-sqlite3 | 12.x |
| JSON Web Token | 9.x |

## 项目结构

```
lanchat/
├── server/     # 服务端 (Node.js + Express + Socket.IO + SQLite)
├── client/     # 客户端 (Electron + Vue 3 + Element Plus)
├── CHANGELOG.md
└── README.md
```

## 快速开始

### 1. 启动服务端

```bash
cd server
npm install
npm start
```

服务端默认运行在 `http://0.0.0.0:3000`，首次启动会自动创建数据库和管理员账号（admin / admin123）。

### 2. 启动客户端（开发模式）

```bash
cd client
npm install
npm run electron:dev
```

### 3. 打包客户端

```bash
cd client
npm run electron:build
```

打包后的安装文件在 `client/dist-electron/` 目录下。

## 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |

## 配置说明

服务端配置文件：`server/.env`

```
PORT=3000                    # 服务端口
JWT_SECRET=your_secret_key   # JWT 密钥
JWT_EXPIRES_IN=7d            # Token 有效期
ADMIN_USERNAME=admin         # 默认管理员用户名
ADMIN_PASSWORD=admin123      # 默认管理员密码
```
