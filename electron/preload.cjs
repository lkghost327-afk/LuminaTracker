const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('lumina', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  openExternal: url => ipcRenderer.invoke('shell:openExternal', url),
  getConfig: input => ipcRenderer.invoke('config:get', input),
  updateSettings: input => ipcRenderer.invoke('config:update', input),
  copyExtensionPairing: () => ipcRenderer.invoke('extension:pairing'),
  openExtensionFolder: () => ipcRenderer.invoke('extension:folder'),
  searchProducts: input => ipcRenderer.invoke('search:products', input),
  onSearchProgress: callback => subscribe('search:progress', callback),
  optimizeBundle: input => ipcRenderer.invoke('bundle:optimize', input),
  getTrackedItems: () => ipcRenderer.invoke('tracker:getAll'),
  addTrackedItem: input => ipcRenderer.invoke('tracker:add', input),
  removeTrackedItem: id => ipcRenderer.invoke('tracker:remove', id),
  getPriceHistory: id => ipcRenderer.invoke('tracker:history', id),
  checkDealsNow: () => ipcRenderer.invoke('tracker:checkNow'),
  onTrackerUpdate: callback => subscribe('tracker:updated', callback),
});
