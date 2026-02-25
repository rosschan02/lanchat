import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    // 开发服务器端口
    server: {
        port: 5173,
    },
    // 生产构建输出到 dist 目录，供 Electron 加载
    base: './',
    build: {
        outDir: 'dist',
    },
});
