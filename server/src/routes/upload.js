/**
 * 文件上传路由
 * 处理图片上传并返回访问 URL
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 按日期创建子目录
        const dateDir = new Date().toISOString().slice(0, 10);
        const dir = path.join(uploadDir, dateDir);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    },
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
    if (config.upload.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('不支持的文件类型'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: config.upload.maxSize },
});

/**
 * POST /api/upload - 上传图片
 * FormData: file
 * 返回: { url }
 */
router.post('/', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的文件' });
    }

    // 构建访问 URL（相对路径）
    const dateDir = new Date().toISOString().slice(0, 10);
    const url = `/uploads/${dateDir}/${req.file.filename}`;

    res.json({ url, filename: req.file.originalname });
});

// 错误处理
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件大小不能超过 10MB' });
        }
    }
    if (err.message === '不支持的文件类型') {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

module.exports = router;
