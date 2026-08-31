const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');

const SITE_URL = 'https://daylight-tasks.zhuangchaoqun.chatgpt.site';
const SITE_ORIGIN = new URL(SITE_URL).origin;

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 880,
    minHeight: 620,
    title: 'Daylight Calendar',
    backgroundColor: '#07101e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once('ready-to-show', () => window.show());
  window.loadURL(SITE_URL);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE_ORIGIN)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SITE_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Daylight',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => window.reload() },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '窗口透明度',
      submenu: [100, 90, 80, 70, 60, 50].map((value) => ({
        label: `${value}%`,
        type: 'radio',
        checked: value === 100,
        click: () => window.setOpacity(value / 100)
      }))
    }
  ]));
}

ipcMain.on('daylight:set-opacity', (event, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  window.setOpacity(Math.min(1, Math.max(0.45, Number(value) || 1)));
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
