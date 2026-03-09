const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
    selectFolders: () => ipcRenderer.invoke('dialog:selectFolders'),
    selectOutputDir: () => ipcRenderer.invoke('dialog:selectOutputDir'),
    startCompression: (config) => ipcRenderer.invoke('compress:start', config),
    onCompressProgress: (callback) => ipcRenderer.on('compress:progress', (_event, value) => callback(value))
});
