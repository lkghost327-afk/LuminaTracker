// Exercises the real production renderer, sandboxed preload and IPC with an isolated profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const packaged = process.argv.includes('--packaged');
const appRoot = packaged ? path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app.asar') : path.join(__dirname, '..');
const root = path.join(__dirname, '..', 'tmp', 'electron-smoke');
fs.mkdirSync(root, { recursive: true });
const profile = fs.mkdtempSync(path.join(root, 'profile-'));
app.setPath('userData', profile);
const { createDatabase } = require(path.join(appRoot, 'electron', 'database.cjs'));
createDatabase(path.join(profile, 'luminatracker_db.json')).updateSettings({ country: 'IN', notifications: false });
const deadline = setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1); }, 60000);
require(path.join(appRoot, 'electron', 'main.cjs'));
app.whenReady().then(async () => {
  try {
    let window;
    for (let i = 0; i < 100; i++) {
      window = BrowserWindow.getAllWindows()[0];
      if (window) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(window, 'main window created');
    const errors = [];
    window.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
    if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const config = await window.lumina.getConfig({ locale: 'en-US' });
      const added = await window.lumina.addTrackedItem({ query: 'Smoke test product', country: 'IN', targetPrice: 1234 });
      const tracked = await window.lumina.getTrackedItems();
      const history = await window.lumina.getPriceHistory(added.id);
      await window.lumina.removeTrackedItem(added.id);
      return { desktop: config.desktop, currency: config.market.currency, bridge: typeof window.lumina.searchProducts, tracked: tracked.length, history: history.length, removed: (await window.lumina.getTrackedItems()).length, nodeExposed: typeof window.require, heading: document.querySelector('h1')?.textContent };
    })()`);
    assert.equal(result.desktop, true); assert.equal(result.currency, 'INR'); assert.equal(result.bridge, 'function');
    assert.equal(result.tracked, 1); assert.equal(result.history, 0); assert.equal(result.removed, 0);
    assert.equal(result.nodeExposed, 'undefined'); assert.equal(result.heading, 'Find Your Best Deal');
    const { safeStorage } = require('electron');
    const token = safeStorage.decryptString(Buffer.from(fs.readFileSync(path.join(profile, 'browser-pairing.enc'), 'utf8'), 'base64'));
    const status = await fetch('http://127.0.0.1:38467/status', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(status.status, 200); assert.equal((await status.json()).app, 'LuminaTracker');
    assert.equal((await fetch('http://127.0.0.1:38467/status')).status, 401);
    result.companion = 'authenticated';
    if (packaged) {
      const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(appRoot), 'browser-extension', 'manifest.json'), 'utf8'));
      assert.equal(manifest.manifest_version, 3);
      result.packaged = true;
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('Desktop production smoke passed:', JSON.stringify(result));
    clearTimeout(deadline); app.quit();
  } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); }
});
