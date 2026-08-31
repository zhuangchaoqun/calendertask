const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SITE_URL = 'https://daylight-tasks.zhuangchaoqun.chatgpt.site';
const SITE_ORIGIN = new URL(SITE_URL).origin;
const SIZE_PRESETS = {
  compact: { width: 760, height: 620 },
  standard: { width: 980, height: 760 },
  large: { width: 1380, height: 900 },
};

let mainWindow;
let settingsPath;

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function setAutoStart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false, name: 'chaoquncalender', path: process.execPath });
  writeSettings({ autoStart: enabled });
  return app.getLoginItemSettings().openAtLogin;
}

function currentDesktopState(window) {
  const settings = readSettings();
  return {
    autoStart: app.getLoginItemSettings().openAtLogin,
    alwaysOnTop: window?.isAlwaysOnTop() ?? false,
    sizePreset: settings.sizePreset ?? 'standard',
    opacity: window?.getOpacity() ?? settings.opacity ?? 1,
  };
}

function applySize(window, preset) {
  const size = SIZE_PRESETS[preset] ?? SIZE_PRESETS.standard;
  window.setSize(size.width, size.height, true);
  window.center();
  writeSettings({ sizePreset: preset });
}

function createWindow() {
  const settings = readSettings();
  const preset = SIZE_PRESETS[settings.sizePreset] ?? SIZE_PRESETS.standard;
  const savedBounds = settings.bounds ?? {};
  const window = new BrowserWindow({
    width: savedBounds.width ?? preset.width,
    height: savedBounds.height ?? preset.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 680,
    minHeight: 520,
    title: 'chaoquncalender',
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.setAlwaysOnTop(Boolean(settings.alwaysOnTop), 'floating');
  window.setOpacity(Math.min(1, Math.max(0.45, Number(settings.opacity) || 1)));
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

  let saveBoundsTimer;
  const rememberBounds = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!window.isDestroyed() && !window.isMaximized()) writeSettings({ bounds: window.getBounds() });
    }, 250);
  };
  window.on('move', rememberBounds);
  window.on('resize', rememberBounds);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'chaoquncalender',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => window.reload() },
        { label: '恢复默认大小', click: () => applySize(window, 'standard') },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
  ]));

  return window;
}

ipcMain.handle('chaoqun:get-desktop-state', (event) => currentDesktopState(BrowserWindow.fromWebContents(event.sender)));
ipcMain.handle('chaoqun:set-auto-start', (_event, enabled) => setAutoStart(Boolean(enabled)));
ipcMain.handle('chaoqun:set-size', (event, preset) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) applySize(window, preset);
  return currentDesktopState(window);
});
ipcMain.handle('chaoqun:set-always-on-top', (event, enabled) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.setAlwaysOnTop(Boolean(enabled), 'floating');
  writeSettings({ alwaysOnTop: Boolean(enabled) });
  return Boolean(window?.isAlwaysOnTop());
});
ipcMain.on('chaoqun:set-opacity', (event, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const opacity = Math.min(1, Math.max(0.45, Number(value) || 1));
  if (window) window.setOpacity(opacity);
  writeSettings({ opacity });
});
ipcMain.on('chaoqun:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('chaoqun:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

app.whenReady().then(() => {
  settingsPath = path.join(app.getPath('userData'), 'widget-settings.json');
  const settings = readSettings();
  if (typeof settings.autoStart !== 'boolean') setAutoStart(true);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
