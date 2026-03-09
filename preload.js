const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
    selectOutputDir: () => ipcRenderer.invoke('dialog:selectOutputDir'),
    startCompression: (config) => ipcRenderer.invoke('compress:start', config),
    onCompressProgress: (callback) => ipcRenderer.on('compress:progress', (_event, value) => callback(value))
});
