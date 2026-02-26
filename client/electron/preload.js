/**
 * Electron 预加载脚本
 * 安全地暴露 IPC API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 截图功能
    screenshot: {
        // 启动截图
        start: () => ipcRenderer.send('screenshot:start'),
        // 监听截图数据（主进程捕获的全屏截图）
        onData: (callback) => ipcRenderer.on('screenshot:data', (event, data) => callback(data)),
        // 监听截图重置（清理上次选择框）
        onReset: (callback) => ipcRenderer.on('screenshot:reset', () => callback()),
        // 主动获取当前截图数据（避免页面加载时序导致丢消息）
        getData: () => ipcRenderer.invoke('screenshot:getData'),
        // 截图完成 - 发送裁剪后的图片
        complete: (imageDataUrl) => ipcRenderer.send('screenshot:complete', imageDataUrl),
        // 取消截图
        cancel: () => ipcRenderer.send('screenshot:cancel'),
        // 监听截图结果（在聊天窗口中接收截图）
        onCaptured: (callback) => ipcRenderer.on('screenshot:captured', (event, data) => callback(data)),
    },

    // 系统通知
    notification: {
        show: (title, body) => ipcRenderer.send('notification:show', { title, body }),
    },

    // 文件下载
    file: {
        saveAs: (url, filename) => ipcRenderer.invoke('file:saveAs', { url, filename }),
    },

    // 判断是否在 Electron 环境中
    isElectron: true,
});
