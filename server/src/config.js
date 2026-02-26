/**
 * 服务端配置文件
 * 从 .env 文件读取配置，提供默认值
 */
require('dotenv').config();

module.exports = {
  // 服务端口
  port: parseInt(process.env.PORT) || 3000,

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'lanchat_default_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // 默认管理员账号
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },

  // 上传文件配置
  upload: {
    // 最大文件大小 50MB
    maxSize: 50 * 1024 * 1024,
    // 禁止上传的文件扩展名
    blockedExtensions: ['.exe', '.bat', '.sh', '.cmd', '.msi', '.dll', '.com', '.vbs', '.ps1'],
  },
};
