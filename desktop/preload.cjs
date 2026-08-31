const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daylightDesktop', {
  setOpacity(value) {
    ipcRenderer.send('daylight:set-opacity', value);
  }
});
