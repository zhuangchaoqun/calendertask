const { app, BrowserWindow, Menu, ipcMain, shell, dialog, Tray, nativeImage, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SIZE_PRESETS = {
  compact: { width: 640, height: 520 },
  standard: { width: 980, height: 760 },
  large: { width: 1380, height: 900 },
};
const MIN_WIDTH = 420;
const MIN_HEIGHT = 360;
const COLLAPSED_SIZE = 78;
const SERVER_HOST = '124.223.175.138';
const UPDATE_URL = `https://${SERVER_HOST}/chaoquncalender/updates/`;
const PINNED_CERT_FINGERPRINT = '84BFA64CB6806A6CE52AC8EF68397442A52BDC8585D7772DBFB3CA90FBDA1149';

let mainWindow;
let tray;
let settingsPath;
let changingWidgetMode = false;
let isQuitting = false;
let updateState = { status: 'idle', version: app.getVersion(), message: '已是最新版本' };

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function setAutoStart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false, name: 'BEIOCalender', path: process.execPath });
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
    collapsed: Boolean(settings.collapsed),
    desktopPinned: settings.desktopPinned !== false,
    update: updateState,
  };
}

function sendDesktopState(window) {
  if (window && !window.isDestroyed()) window.webContents.send('chaoqun:state-changed', currentDesktopState(window));
}

function setCollapsed(window, collapsed) {
  if (!window || window.isDestroyed()) return currentDesktopState(window);
  const settings = readSettings();
  changingWidgetMode = true;
  if (collapsed) {
    const expandedBounds = settings.collapsed && settings.expandedBounds ? settings.expandedBounds : window.getBounds();
    const next = {
      x: expandedBounds.x + expandedBounds.width - COLLAPSED_SIZE,
      y: expandedBounds.y,
      width: COLLAPSED_SIZE,
      height: COLLAPSED_SIZE,
    };
    window.setMinimumSize(COLLAPSED_SIZE, COLLAPSED_SIZE);
    window.setResizable(false);
    window.setMaximizable(false);
    window.setBounds(next);
    writeSettings({ collapsed: true, expandedBounds });
  } else {
    const fallback = SIZE_PRESETS[settings.sizePreset] ?? SIZE_PRESETS.standard;
    const saved = settings.expandedBounds ?? settings.bounds ?? fallback;
    window.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
    window.setResizable(true);
    window.setMaximizable(true);
    window.setBounds({
      x: Number.isFinite(saved.x) ? saved.x : window.getBounds().x,
      y: Number.isFinite(saved.y) ? saved.y : window.getBounds().y,
      width: Math.max(MIN_WIDTH, saved.width ?? fallback.width),
      height: Math.max(MIN_HEIGHT, saved.height ?? fallback.height),
    });
    writeSettings({ collapsed: false });
  }
  changingWidgetMode = false;
  sendDesktopState(window);
  refreshTrayMenu();
  return currentDesktopState(window);
}

function publishUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  sendDesktopState(mainWindow);
}

function fingerprint(value) {
  return String(value || '').replace(/[^a-f0-9]/gi, '').toUpperCase();
}

function configureCertificateVerification(window) {
  window.webContents.session.setCertificateVerifyProc((request, callback) => {
    const actual = fingerprint(request.certificate?.fingerprint256 || request.certificate?.fingerprint);
    if (request.hostname === SERVER_HOST && actual === PINNED_CERT_FINGERPRINT) callback(0);
    else callback(-3);
  });
}

function runDesktopHelper(window, mode) {
  if (process.platform !== 'win32' || !window || window.isDestroyed()) return;
  const handle = window.getNativeWindowHandle();
  const numericHandle = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-helper.ps1')
    : path.join(__dirname, 'desktop-helper.ps1');
  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass', '-File', helper, '-Handle', numericHandle.toString(), '-Mode', mode,
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function setDesktopPinned(window, enabled) {
  const pinned = Boolean(enabled);
  writeSettings({ desktopPinned: pinned });
  window?.setSkipTaskbar(true);
  if (window && !window.isDestroyed()) {
    runDesktopHelper(window, pinned ? 'attach' : 'detach');
    if (!pinned) window.moveTop();
  }
  setTimeout(() => sendDesktopState(window), 250);
  refreshTrayMenu();
  return pinned;
}

function showCalendar() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.showInactive();
  if (readSettings().desktopPinned !== false) runDesktopHelper(mainWindow, 'attach');
}

function refreshTrayMenu() {
  if (!tray) return;
  const settings = readSettings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌面日历', click: showCalendar },
    { label: settings.collapsed ? '展开日历' : '折叠为桌面图标', click: () => { showCalendar(); setCollapsed(mainWindow, !settings.collapsed); } },
    { type: 'separator' },
    { label: '固定在桌面壁纸层', type: 'checkbox', checked: settings.desktopPinned !== false, click: (item) => setDesktopPinned(mainWindow, item.checked) },
    { label: '开机自动启动', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    { label: '退出 BEIOCalender', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const logo = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 20, height: 20 });
  tray = new Tray(logo);
  tray.setToolTip('BEIOCalender · 桌面日历');
  tray.on('click', showCalendar);
  refreshTrayMenu();
}

function configureUpdates() {
  if (!app.isPackaged) {
    publishUpdateState({ status: 'development', message: '开发模式不检查更新' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL });
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', message: '正在检查更新…' }));
  autoUpdater.on('update-available', (info) => publishUpdateState({ status: 'downloading', version: info.version, message: `正在下载 ${info.version}…` }));
  autoUpdater.on('download-progress', (progress) => publishUpdateState({ status: 'downloading', message: `正在下载 ${Math.round(progress.percent)}%` }));
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'current', version: app.getVersion(), message: '已是最新版本' }));
  autoUpdater.on('update-downloaded', (info) => publishUpdateState({ status: 'ready', version: info.version, message: `版本 ${info.version} 已下载，点击安装` }));
  autoUpdater.on('error', () => publishUpdateState({ status: 'error', message: '暂时无法连接更新服务器' }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 12_000);
}

function applySize(window, preset) {
  const size = SIZE_PRESETS[preset] ?? SIZE_PRESETS.standard;
  window.setSize(size.width, size.height, true);
  window.center();
  writeSettings({ sizePreset: preset });
  if (readSettings().collapsed) setCollapsed(window, false);
}

function createWindow() {
  const settings = readSettings();
  const preset = SIZE_PRESETS[settings.sizePreset] ?? SIZE_PRESETS.standard;
  const savedBounds = settings.collapsed ? {} : (settings.bounds ?? {});
  const window = new BrowserWindow({
    width: savedBounds.width ?? preset.width,
    height: savedBounds.height ?? preset.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'BEIOCalender',
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  configureCertificateVerification(window);
  window.setAlwaysOnTop(settings.desktopPinned === false && Boolean(settings.alwaysOnTop), 'floating');
  window.setOpacity(Math.min(1, Math.max(0.45, Number(settings.opacity) || 1)));
  window.once('ready-to-show', () => {
    window.showInactive();
    if (settings.desktopPinned !== false) setTimeout(() => runDesktopHelper(window, 'attach'), 200);
  });
  window.loadFile(path.join(__dirname, 'offline', 'index.html'));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  let saveBoundsTimer;
  const rememberBounds = () => {
    if (changingWidgetMode || readSettings().collapsed) return;
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!window.isDestroyed() && !window.isMaximized()) writeSettings({ bounds: window.getBounds() });
    }, 250);
  };
  window.on('move', rememberBounds);
  window.on('resize', rememberBounds);
  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    setCollapsed(window, true);
  });
  window.webContents.once('did-finish-load', () => {
    if (settings.collapsed) setCollapsed(window, true);
    else sendDesktopState(window);
    refreshTrayMenu();
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'BEIOCalender',
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
ipcMain.handle('chaoqun:set-desktop-pinned', (event, enabled) => setDesktopPinned(BrowserWindow.fromWebContents(event.sender), enabled));
ipcMain.handle('chaoqun:set-collapsed', (event, collapsed) => setCollapsed(BrowserWindow.fromWebContents(event.sender), Boolean(collapsed)));
ipcMain.handle('chaoqun:check-for-updates', async () => {
  if (!app.isPackaged) return updateState;
  await autoUpdater.checkForUpdates().catch(() => undefined);
  return updateState;
});
ipcMain.on('chaoqun:install-update', () => {
  if (updateState.status === 'ready') autoUpdater.quitAndInstall(false, true);
});
ipcMain.on('chaoqun:move-by', (event, deltaX, deltaY) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isMaximized()) return;
  const bounds = window.getBounds();
  window.setPosition(bounds.x + Math.round(Number(deltaX) || 0), bounds.y + Math.round(Number(deltaY) || 0));
});
ipcMain.on('chaoqun:resize-by', (event, edge, deltaX, deltaY) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isMaximized()) return;
  const bounds = window.getBounds();
  const dx = Math.round(Number(deltaX) || 0);
  const dy = Math.round(Number(deltaY) || 0);
  const next = { ...bounds };
  if (edge.includes('e')) next.width = Math.max(MIN_WIDTH, bounds.width + dx);
  if (edge.includes('s')) next.height = Math.max(MIN_HEIGHT, bounds.height + dy);
  if (edge.includes('w')) {
    next.width = Math.max(MIN_WIDTH, bounds.width - dx);
    next.x = bounds.x + (bounds.width - next.width);
  }
  if (edge.includes('n')) {
    next.height = Math.max(MIN_HEIGHT, bounds.height - dy);
    next.y = bounds.y + (bounds.height - next.height);
  }
  window.setBounds(next);
});
ipcMain.on('chaoqun:set-opacity', (event, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const opacity = Math.min(1, Math.max(0.45, Number(value) || 1));
  if (window) window.setOpacity(opacity);
  writeSettings({ opacity });
});
ipcMain.on('chaoqun:minimize', (event) => setCollapsed(BrowserWindow.fromWebContents(event.sender), true));
ipcMain.on('chaoqun:close', (event) => setCollapsed(BrowserWindow.fromWebContents(event.sender), true));
ipcMain.handle('chaoqun:export-backup', async (_event, contents) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 BEIOCalender 本地备份',
    defaultPath: `BEIOCalender-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, String(contents), 'utf8');
  return true;
});
ipcMain.handle('chaoqun:import-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 BEIOCalender 本地备份',
    properties: ['openFile'],
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return fs.readFileSync(result.filePaths[0], 'utf8');
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.zhuangchaoqun.chaoquncalender');
  settingsPath = path.join(app.getPath('userData'), 'widget-settings.json');
  const settings = readSettings();
  if (typeof settings.autoStart !== 'boolean') setAutoStart(true);
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Alt+H', showCalendar);
  configureUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', showCalendar);
app.on('before-quit', () => { isQuitting = true; });

app.on('certificate-error', (event, _webContents, url, _error, certificate, callback) => {
  let host = '';
  try { host = new URL(url).hostname; } catch { callback(false); return; }
  const fingerprint = String(certificate.fingerprint256 || certificate.fingerprint || '').replace(/[^a-f0-9]/gi, '').toUpperCase();
  if (host === SERVER_HOST && fingerprint === PINNED_CERT_FINGERPRINT) {
    event.preventDefault();
    callback(true);
    return;
  }
  callback(false);
});

app.on('window-all-closed', () => {
  // The tray owns the app lifetime. Use its Exit item to quit explicitly.
});

app.on('will-quit', () => globalShortcut.unregisterAll());
