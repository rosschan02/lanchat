/**
 * Electron 主进程
 * 负责创建窗口、系统托盘、截图功能
 */
const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// 主窗口引用
let mainWindow = null;
let tray = null;

// 判断是否为开发模式
const isDev = !app.isPackaged;

/**
 * 创建主窗口
 */
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        title: 'LanChat',
        // 无默认菜单栏
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // 加载页面
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // 开发模式打开 DevTools
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    // 关闭窗口时最小化到托盘而非退出
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

/**
 * 创建系统托盘
 */
function createTray() {
    // 创建简单的托盘图标（16x16 蓝色圆点）
    const icon = nativeImage.createFromBuffer(
        Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAX0lEQVQ4T2NkoBAwUqifgWoGMDIy/mdgYPjPQCRgZGT8j80FLAwMDP8ZCBjAyMTE+J+BgOvABjAxMTEQ4wJGJiYmwi5gIcYAJmJcQHUDiA4DYsKAaDcQHQbEhAE+FwAAhTQlEUFfMCMAAAAASUVORK5CYII=',
            'base64'
        )
    );

    tray = new Tray(icon);
    tray.setToolTip('LanChat - 局域网聊天');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '打开主窗口',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    // 双击托盘图标显示窗口
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// ===== 截图功能 =====

let screenshotWindow = null;
let currentScreenshotData = null;
let screenshotWindowReady = false;
let isStartingScreenshot = false;

function createScreenshotWindow() {
    if (screenshotWindow && !screenshotWindow.isDestroyed()) {
        return;
    }

    screenshotWindowReady = false;
    screenshotWindow = new BrowserWindow({
        fullscreen: true,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    screenshotWindow.webContents.on('did-finish-load', () => {
        screenshotWindowReady = true;
    });

    screenshotWindow.on('closed', () => {
        screenshotWindow = null;
        screenshotWindowReady = false;
        currentScreenshotData = null;
    });

    if (isDev) {
        screenshotWindow.loadURL('http://localhost:5173/#/screenshot');
    } else {
        screenshotWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
            hash: '/screenshot',
        });
    }
}

function waitForScreenshotWindowReady(timeoutMs = 6000) {
    if (screenshotWindowReady) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        if (!screenshotWindow || screenshotWindow.isDestroyed()) {
            reject(new Error('截图窗口不可用'));
            return;
        }

        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('截图窗口加载超时'));
        }, timeoutMs);

        const onLoad = () => {
            cleanup();
            screenshotWindowReady = true;
            resolve();
        };

        const onClose = () => {
            cleanup();
            reject(new Error('截图窗口已关闭'));
        };

        const cleanup = () => {
            clearTimeout(timer);
            if (screenshotWindow && !screenshotWindow.isDestroyed()) {
                screenshotWindow.webContents.removeListener('did-finish-load', onLoad);
                screenshotWindow.removeListener('closed', onClose);
            }
        };

        screenshotWindow.webContents.once('did-finish-load', onLoad);
        screenshotWindow.once('closed', onClose);
    });
}

function hideScreenshotWindow() {
    if (!screenshotWindow || screenshotWindow.isDestroyed()) {
        return;
    }
    screenshotWindow.hide();
    if (screenshotWindowReady) {
        screenshotWindow.webContents.send('screenshot:reset');
    }
}

/**
 * 启动截图流程
 */
async function startScreenshot() {
    if (isStartingScreenshot) {
        return;
    }

    isStartingScreenshot = true;
    const { desktopCapturer, screen } = require('electron');

    try {
        createScreenshotWindow();
        await waitForScreenshotWindowReady();

        if (screenshotWindowReady) {
            screenshotWindow.webContents.send('screenshot:reset');
        }

        // 隐藏主窗口（避免截到自己的窗口）
        if (mainWindow && mainWindow.isVisible()) {
            mainWindow.hide();
            // 适当等待一帧，避免截图中出现主窗口残影
            await new Promise((resolve) => setTimeout(resolve, 60));
        }

        // 获取主显示器信息
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        const scaleFactor = primaryDisplay.scaleFactor || 1;
        const captureWidth = Math.max(1, Math.floor(width));
        const captureHeight = Math.max(1, Math.floor(height));

        // 捕获全屏
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: captureWidth, height: captureHeight },
        });

        if (sources.length === 0) {
            mainWindow.show();
            return;
        }

        // 优先匹配主显示器，避免多屏时拿错源
        const source =
            sources.find((item) => item.display_id === String(primaryDisplay.id)) ||
            sources.find((item) => !item.thumbnail.isEmpty()) ||
            sources[0];

        if (!source || source.thumbnail.isEmpty()) {
            throw new Error('未获取到可用的屏幕画面');
        }

        const screenImage = source.thumbnail.toDataURL();
        currentScreenshotData = {
            image: screenImage,
            width,
            height,
            scaleFactor,
        };

        if (!screenshotWindow || screenshotWindow.isDestroyed()) {
            throw new Error('截图窗口不可用');
        }

        screenshotWindow.show();
        screenshotWindow.focus();
        screenshotWindow.webContents.send('screenshot:data', currentScreenshotData);
    } catch (err) {
        console.error('截图失败:', err);
        currentScreenshotData = null;
        hideScreenshotWindow();
        if (mainWindow) mainWindow.show();
    } finally {
        isStartingScreenshot = false;
    }
}

// ===== IPC 事件处理 =====

ipcMain.on('screenshot:start', () => {
    startScreenshot();
});

ipcMain.handle('screenshot:getData', () => {
    return currentScreenshotData;
});

// 截图完成（用户选取了区域）
ipcMain.on('screenshot:complete', (event, imageDataUrl) => {
    hideScreenshotWindow();
    currentScreenshotData = null;
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        // 将截图数据发送给主窗口
        mainWindow.webContents.send('screenshot:captured', imageDataUrl);
    }
});

// 截图取消
ipcMain.on('screenshot:cancel', () => {
    hideScreenshotWindow();
    currentScreenshotData = null;
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }
});
// 显示系统通知
ipcMain.on('notification:show', (event, { title, body }) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
        const notification = new Notification({ title, body });
        notification.on('click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            }
        });
        notification.show();
    }
});

// 文件保存对话框
ipcMain.handle('file:saveAs', async (event, { url, filename }) => {
    const { dialog, net } = require('electron');
    const fs = require('fs');
    
    // 显示保存对话框
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [
            { name: '所有文件', extensions: ['*'] }
        ]
    });
    
    if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
    }
    
    try {
        // 下载文件
        const fileUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (!settled) {
                    settled = true;
                    resolve(result);
                }
            };

            const request = net.request(fileUrl);
            
            request.on('response', (response) => {
                const statusCode = response.statusCode || 0;
                const chunks = [];

                response.on('data', (chunk) => chunks.push(chunk));
                response.on('error', (err) => {
                    finish({ success: false, error: err.message });
                });
                response.on('end', () => {
                    if (statusCode < 200 || statusCode >= 300) {
                        finish({ success: false, error: `下载失败，HTTP ${statusCode}` });
                        return;
                    }

                    try {
                        const buffer = Buffer.concat(chunks);
                        fs.writeFileSync(result.filePath, buffer);
                        finish({ success: true, path: result.filePath });
                    } catch (err) {
                        finish({ success: false, error: err.message });
                    }
                });
            });

            request.on('error', (err) => {
                finish({ success: false, error: err.message });
            });
            
            request.end();
        });
    } catch (err) {
        console.error('文件保存失败:', err);
        return { success: false, error: err.message };
    }
});

// ===== 应用生命周期 =====

app.whenReady().then(() => {
    createMainWindow();
    createTray();
    createScreenshotWindow();

    // 注册截图全局快捷键 Ctrl+Shift+A
    globalShortcut.register('Ctrl+Shift+A', () => {
        startScreenshot();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow();
    }
});

app.on('will-quit', () => {
    // 注销所有快捷键
    globalShortcut.unregisterAll();
});
