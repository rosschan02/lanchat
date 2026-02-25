/**
 * LanChat 服务端入口
 * 启动 Express + Socket.IO 服务
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./db/init');
const { initSocket } = require('./socket/index');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');

// 创建 Express 应用
const app = express();
const server = http.createServer(app);

// 创建 Socket.IO 实例
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    // 设置最大消息体大小为 10MB（用于图片）
    maxHttpBufferSize: 10 * 1024 * 1024,
});

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件（上传的图片）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== 路由 =====
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toLocaleString('zh-CN') });
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

// ===== 初始化 =====

// 初始化数据库
initDatabase();

// 初始化 Socket.IO
initSocket(io);

// 启动服务器
server.listen(config.port, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`  🚀 LanChat 服务端已启动`);
    console.log(`  📡 地址: http://0.0.0.0:${config.port}`);
    console.log(`  📅 时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log('========================================');
});
