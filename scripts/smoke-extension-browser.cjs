// Actual Edge extension test in a disposable browser profile. No Electron app runs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createServer } = require('../server/app.cjs');
const { marketFor } = require('../shared/markets.cjs');
const root = path.resolve(__dirname, '..');
const browser = process.env.LUMINA_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let sequence = 0; const pending = new Map();
    ws.addEventListener('error', reject, { once: true });
    ws.addEventListener('message', event => { const msg = JSON.parse(event.data); const callback = pending.get(msg.id); if (callback) { pending.delete(msg.id); msg.error ? callback.reject(Error(msg.error.message)) : callback.resolve(msg.result); } });
    ws.addEventListener('open', () => resolve({ close: () => ws.close(), send(method, params = {}) { return new Promise((yes, no) => { const id = ++sequence; pending.set(id, { resolve: yes, reject: no }); ws.send(JSON.stringify({ id, method, params })); }); } }));
  });
}
(async () => {
  if (!fs.existsSync(browser)) throw Error('Set LUMINA_TEST_BROWSER to a Chromium browser that supports loading unpacked extensions.');
  let queries = []; let child, browserCDP, pageCDP; let stderr = '';
  const service = createServer({ engine: { search: async (query, { country }) => { queries.push({ query, country }); return { market: marketFor(country), data: [{ title: 'Sony WH-1000XM5 Black', price: 20000, shipping: 0, currency: marketFor(country).currency, condition: 'new', platform: 'Flipkart', url: 'https://www.flipkart.com/sony/p/test' }], sources: [], checkedAt: new Date().toISOString() }; } } });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const apiBase = 'http://127.0.0.1:' + service.address().port;
  const temp = path.join(root, 'tmp', 'standalone-browser'); fs.mkdirSync(temp, { recursive: true });
  const profile = fs.mkdtempSync(path.join(temp, 'profile-'));
  const extension = path.join(root, 'release', 'standalone-extension-dev');
  const timeout = setTimeout(() => { console.error('Extension browser test timed out.'); if (child) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); process.exit(1); }, 55000);
  try {
    const build = spawnSync(process.execPath, ['scripts/build-extension.mjs', '--dev', '--api-url', apiBase], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (build.status !== 0) throw Error(build.stderr || build.stdout);
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--remote-debugging-port=0', '--disable-extensions-except=' + extension, '--load-extension=' + extension, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
    if (!fs.existsSync(portFile)) throw Error('Browser did not start: ' + stderr);
    const [port, socket] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    const base = 'http://127.0.0.1:' + port;
    browserCDP = await connect('ws://127.0.0.1:' + port + socket);
    let worker;
    for (let i = 0; i < 100; i++) {
      const workers = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') && t.url.endsWith('/background.js'));
      for (const candidate of workers) {
        const inspect = await connect(candidate.webSocketDebuggerUrl);
        const info = await inspect.send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true });
        inspect.close();
        if (info.result.value === 'LuminaTracker — Compare Shopping Offers (Development)') { worker = candidate; break; }
      }
      if (worker) break; await delay(100);
    }
    if (!worker) throw Error('This browser did not load the unpacked extension. ' + stderr);
    // URL.origin is null for chrome-extension in Node; preserve the observed host explicitly.
    const popupURL = 'chrome-extension://' + new URL(worker.url).hostname + '/popup.html';
    const target = await (await fetch(base + '/json/new?' + encodeURIComponent(popupURL), { method: 'PUT' })).json();
    pageCDP = await connect(target.webSocketDebuggerUrl);
    const evaluate = async expression => { const result = await pageCDP.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(document.getElementById("enable"))')) break; await delay(50); }
    assert.ok(await evaluate('Boolean(document.getElementById("enable") && chrome.runtime?.sendMessage)'), 'The actual extension popup loaded');
    const result = await evaluate(`(async () => {
      const prefs = await chrome.runtime.sendMessage({ type: 'preferences', values: { enabled: true, country: 'IN' } });
      if (prefs.error) throw Error(prefs.error);
      const comparison = await chrome.runtime.sendMessage({ type: 'compare', query: 'Sony WH-1000XM5', current: { title: 'Sony WH-1000XM5 Black', price: 25000, shipping: 0, condition: 'new', currency: 'INR', platform: 'Amazon', url: 'https://www.amazon.in/dp/B09XS7JWHH' } });
      if (comparison.error) throw Error(comparison.error);
      await refresh(); render(comparison.result);
      return { heading: document.querySelector('h1').textContent, enabled: !document.getElementById('compare').disabled, offers: document.querySelectorAll('#results article').length, saving: comparison.result.offers[0].saving, desktopRequired: document.body.textContent.includes('Keep the desktop app running') };
    })()`);
    assert.equal(result.heading, 'LuminaTracker'); assert.equal(result.enabled, true); assert.equal(result.offers, 1); assert.equal(result.saving, 5000); assert.equal(result.desktopRequired, false); assert.deepEqual(queries, [{ query: 'Sony WH-1000XM5', country: 'IN' }]);
    const screenshot = await pageCDP.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(temp, 'popup-test.png'), Buffer.from(screenshot.data, 'base64'));
    console.log('Actual Edge standalone extension passed:', JSON.stringify(result));
  } finally {
    clearTimeout(timeout); pageCDP?.close();
    if (browserCDP) { await Promise.race([browserCDP.send('Browser.close').catch(() => {}), delay(1500)]); browserCDP.close(); }
    else if (child) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    service.closeAllConnections(); await new Promise(resolve => service.close(resolve));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
