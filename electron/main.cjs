const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell, net, safeStorage, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createDatabase } = require('./database.cjs');
const { createService } = require('./service.cjs');
const { safeUrl } = require('../shared/deals.cjs');
const { setFetch } = require('./scraper/transport.cjs');
const { createCompanion, getPairingToken, PORT } = require('./companion.cjs');
let mainWindow;
let tray;
let service;
let companion;
let pairingToken;
let companionError = 'Starting browser companion…';
let isQuitting = false;
const isDev = process.env.NODE_ENV === 'development';
const icon = path.join(__dirname, '..', 'public', 'icon.png');
const appUrl = isDev ? 'http://localhost:5173' : pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
function trusted(event) {
  const url = event.senderFrame?.url;
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !(isDev ? url?.startsWith(`${appUrl}/`) : url === appUrl)) throw new Error('Untrusted application request.');
}
async function openExternal(url) {
  const safe = safeUrl(url);
  if (!safe) throw new Error('Only valid HTTPS links can be opened.');
  await shell.openExternal(safe);
}
function registerIPC() {
  const handle = (name, fn) => ipcMain.handle(name, async (event, input) => { trusted(event); return fn(input, event); });
  handle('window:minimize', () => mainWindow.minimize());
  handle('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  handle('window:close', () => mainWindow.close());
  handle('window:isMaximized', () => mainWindow.isMaximized());
  handle('shell:openExternal', openExternal);
  handle('config:get', async input => ({ ...await service.getConfig(input), desktop: true }));
  handle('config:update', input => service.updateSettings(input));
  handle('extension:pairing', () => {
    if (companionError) throw new Error(companionError);
    clipboard.writeText(pairingToken);
    return { port: PORT };
  });
  handle('extension:folder', async () => {
    const folder = app.isPackaged ? path.join(process.resourcesPath, 'browser-extension') : path.join(__dirname, '..', 'release', 'standalone-extension');
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
  });
  handle('search:products', (input, event) => service.searchProducts(input, result => {
    if (!event.sender.isDestroyed()) event.sender.send('search:progress', { requestId: input.requestId, result });
  }));
  handle('bundle:optimize', input => service.optimizeBundle(input));
  handle('tracker:getAll', () => service.getTrackedItems());
  handle('tracker:add', input => service.addTrackedItem(input));
  handle('tracker:remove', id => service.removeTrackedItem(id));
  handle('tracker:history', id => service.getPriceHistory(id));
  handle('tracker:checkNow', () => service.checkDealsNow());
}
function showWindow() { if (mainWindow?.isDestroyed()) createWindow(); mainWindow.show(); mainWindow.focus(); }
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 650, frame: false,
    backgroundColor: '#0a0a0f', icon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url).catch(() => {}); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== appUrl && url !== `${appUrl}/`) { event.preventDefault(); openExternal(url).catch(() => {}); } });
  if (isDev) mainWindow.loadURL(appUrl); else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.on('close', event => { if (!isQuitting && tray) { event.preventDefault(); mainWindow.hide(); } });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => mainWindow && showWindow());
  app.whenReady().then(() => {
    app.setAppUserModelId('com.luminatracker.app');
    setFetch((url, options) => net.fetch(url, options));
    const db = createDatabase(path.join(app.getPath('userData'), 'luminatracker_db.json'), {
      encrypt(value) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure key storage is unavailable on this computer.');
        return safeStorage.encryptString(value).toString('base64');
      },
      decrypt(value) { return safeStorage.decryptString(Buffer.from(value, 'base64')); },
    });
    service = createService(db, { notify(item, offer) {
      if (!Notification.isSupported()) return;
      const format = value => new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency }).format(value);
      const notification = new Notification({ title: 'LuminaTracker price alert', body: `${item.query}: ${format(offer.trueCost)} on ${offer.platform}. Target: ${format(item.target_price)}.`, icon });
      notification.on('click', () => openExternal(offer.url).catch(() => {}));
      notification.show();
    } });
    registerIPC();
    createWindow();
    try {
      pairingToken = getPairingToken(path.join(app.getPath('userData'), 'browser-pairing.enc'), safeStorage);
      companion = createCompanion(service, { token: pairingToken });
      companion.start().then(() => { companionError = ''; }).catch(() => { companionError = 'The browser companion port is unavailable. Close other LuminaTracker instances and restart.'; });
    } catch (error) { companionError = error.message; }
    try {
      tray = new Tray(icon);
      tray.setToolTip('LuminaTracker');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show LuminaTracker', click: showWindow },
        { label: 'Check Deals Now', click: () => service.checkDealsNow().catch(() => {}) },
        { type: 'separator' }, { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
      ]));
      tray.on('double-click', showWindow);
    } catch (error) { console.error('Tray unavailable:', error.message); }
    service.events.on('tracker', items => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tracker:updated', items); });
    service.start();
    service.checkDealsNow().catch(() => {});
    app.on('activate', showWindow);
  }).catch(error => { console.error('Unable to start LuminaTracker:', error.message); require('electron').dialog.showErrorBox('LuminaTracker could not start', error.message); app.quit(); });
}
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('before-quit', () => { isQuitting = true; service?.stop(); companion?.stop(); });
