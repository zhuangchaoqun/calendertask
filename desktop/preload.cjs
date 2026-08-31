const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daylightDesktop', {
  isDesktop: true,
  getState: () => ipcRenderer.invoke('chaoqun:get-desktop-state'),
  setOpacity: (value) => ipcRenderer.send('chaoqun:set-opacity', value),
  setAutoStart: (enabled) => ipcRenderer.invoke('chaoqun:set-auto-start', enabled),
  setSize: (preset) => ipcRenderer.invoke('chaoqun:set-size', preset),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('chaoqun:set-always-on-top', enabled),
  moveBy: (deltaX, deltaY) => ipcRenderer.send('chaoqun:move-by', deltaX, deltaY),
  resizeBy: (edge, deltaX, deltaY) => ipcRenderer.send('chaoqun:resize-by', edge, deltaX, deltaY),
  minimize: () => ipcRenderer.send('chaoqun:minimize'),
  close: () => ipcRenderer.send('chaoqun:close'),
});
