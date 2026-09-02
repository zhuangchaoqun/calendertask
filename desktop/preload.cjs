const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daylightDesktop', {
  isDesktop: true,
  getState: () => ipcRenderer.invoke('chaoqun:get-desktop-state'),
  setOpacity: (value) => ipcRenderer.send('chaoqun:set-opacity', value),
  setAutoStart: (enabled) => ipcRenderer.invoke('chaoqun:set-auto-start', enabled),
  setSize: (preset) => ipcRenderer.invoke('chaoqun:set-size', preset),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('chaoqun:set-always-on-top', enabled),
  setDesktopPinned: (enabled) => ipcRenderer.invoke('chaoqun:set-desktop-pinned', enabled),
  setCollapsed: (collapsed) => ipcRenderer.invoke('chaoqun:set-collapsed', collapsed),
  checkForUpdates: () => ipcRenderer.invoke('chaoqun:check-for-updates'),
  installUpdate: () => ipcRenderer.send('chaoqun:install-update'),
  onStateChanged: (callback) => ipcRenderer.on('chaoqun:state-changed', (_event, state) => callback(state)),
  moveBy: (deltaX, deltaY) => ipcRenderer.send('chaoqun:move-by', deltaX, deltaY),
  resizeBy: (edge, deltaX, deltaY) => ipcRenderer.send('chaoqun:resize-by', edge, deltaX, deltaY),
  exportBackup: (contents) => ipcRenderer.invoke('chaoqun:export-backup', contents),
  importBackup: () => ipcRenderer.invoke('chaoqun:import-backup'),
  minimize: () => ipcRenderer.send('chaoqun:minimize'),
  close: () => ipcRenderer.send('chaoqun:close'),
});
