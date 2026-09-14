const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createServer } = require('../server/app.cjs');
const { marketFor } = require('../shared/markets.cjs');
const id = 'b'.repeat(32), origin = 'chrome-extension://' + id;
const fixture = country => ({ market: marketFor(country), data: [{ title: 'Sony WH-1000XM5 Black', price: 20000, shipping: 0, currency: marketFor(country).currency, condition: 'new', platform: 'Flipkart', url: 'https://www.flipkart.com/sony/p/test' }], sources: [], checkedAt: new Date().toISOString() });
async function api(options = {}) {
  let calls = [];
  const server = createServer({ production: true, extensionIds: [id], publisher: 'Test publisher', supportEmail: 'test@example.test',
    engine: { search: async (query, settings) => { calls.push({ query, ...settings }); return fixture(settings.country); } }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port, calls,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
function worker(base, { initial = {}, ipAllowed = false, fetcher } = {}) {
  let listener; let access; const stored = { ...initial }; const requests = []; const registrations = [];
  const event = { addListener() {} };
  const folder = path.join(__dirname, '../release/standalone-extension');
  const context = vm.createContext({ URL, AbortSignal, TextDecoder, Uint8Array, setTimeout, clearTimeout, Intl,
    navigator: { language: 'en-IN' },
    fetch: async (url, options) => { requests.push({ url, options }); if (fetcher) return fetcher(url, options); return fetch(url, { ...options, headers: { ...options.headers, Origin: origin } }); },
    chrome: {
      runtime: { id, getURL: file => origin + '/' + file, getManifest: () => JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'))), onInstalled: event, onStartup: event, onMessage: { addListener(fn) { listener = fn; } } },
      storage: { local: { setAccessLevel: async value => { access = value.accessLevel; }, get: async keys => keys == null ? { ...stored } : Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])), set: async value => Object.assign(stored, value), clear: async () => { for (const key of Object.keys(stored)) delete stored[key]; } } },
      permissions: { contains: async () => ipAllowed, getAll: async () => ({ origins: ['https://*.amazon.in/*'] }), onRemoved: event },
      scripting: { unregisterContentScripts: async () => {}, registerContentScripts: async entries => registrations.push(entries) },
    } });
  context.importScripts = (...files) => { for (const file of files) vm.runInContext(file === 'config.js' ? 'const LUMINA_CONFIG = ' + JSON.stringify({ apiBase: base, privacyUrl: base ? base + '/privacy' : '' }) : fs.readFileSync(path.join(folder, file), 'utf8'), context); };
  vm.runInContext(fs.readFileSync(path.join(folder, 'background.js'), 'utf8'), context);
  const popup = { id, url: origin + '/popup.html' };
  const content = { id, tab: { id: 1 }, frameId: 0, url: 'https://www.amazon.in/dp/B09XS7JWHH' };
  return { stored, requests, registrations, context, content, access: () => access,
    send: (message, sender = popup) => new Promise(resolve => listener(message, sender, resolve)), listener };
}
test('cloud API accepts only allowed extension origins and minimal regional queries', async () => {
  const service = await api({ apiKey: 'server-only-secret' });
  const post = (body, requestOrigin = origin) => fetch(service.base + '/v1/search', { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ query: 'Sony', country: 'IN' }, 'https://evil.test')).status, 403);
    assert.equal((await post({ query: 'Sony', country: 'IN', current: { url: 'https://private.test' } })).status, 400);
    assert.equal((await post({ query: 'Sony', country: 'XX' })).status, 400);
    const response = await post({ query: 'Sony', country: 'GB' });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), origin);
    const body = await response.text(); assert.ok(!body.includes('server-only-secret'));
    assert.equal(service.calls[0].country, 'GB'); assert.equal(service.calls[0].apiKey, 'server-only-secret');
    assert.equal((await fetch(service.base + '/v1/search')).status, 403);
  } finally { await service.close(); }
});
test('cloud quotas stop excess provider calls and reset on the next UTC day', async () => {
  let time = Date.UTC(2026, 8, 13);
  const service = await api({ dailyLimit: 1, now: () => time });
  const post = () => fetch(service.base + '/v1/search', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Sony', country: 'IN' }) });
  try {
    assert.equal((await post()).status, 200); const limited = await post(); assert.equal(limited.status, 429); assert.equal(service.calls.length, 1);
    time += 86400000; assert.equal((await post()).status, 200); assert.equal(service.calls.length, 2);
  } finally { await service.close(); }
});

test('slow comparisons are polled without repeating provider searches or consuming extra quota', async () => {
  let finish, calls = 0, time = Date.now();
  const service = await api({ responseWaitMs: 5, dailyLimit: 1, now: () => time,
    engine: { search: () => { calls++; return new Promise(resolve => { finish = () => resolve(fixture('IN')); }); } } });
  try {
    const response = await fetch(service.base + '/v1/search', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Sony', country: 'IN' }) });
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.pending, true); assert.ok(!JSON.stringify(job).includes('Sony'));
    const url = service.base + '/v1/search/' + job.jobId;
    assert.equal((await fetch(url, { headers: { Origin: origin } })).status, 202);
    assert.equal((await fetch(url, { headers: { Origin: 'chrome-extension://' + 'c'.repeat(32) } })).status, 403);
    finish();
    const result = await fetch(url, { headers: { Origin: origin } });
    assert.equal(result.status, 200); assert.equal((await result.json()).data.length, 1); assert.equal(calls, 1);
    time += 180001;
    assert.equal((await fetch(url, { headers: { Origin: origin } })).status, 404);
  } finally { finish?.(); await service.close(); }
});

test('standalone worker follows pending comparisons and tolerates a cold-start connection failure', async () => {
  const jobId = '12345678-1234-1234-1234-123456789abc';
  let calls = 0;
  const ext = worker('https://api.example.test', { fetcher: async () => {
    calls++;
    if (calls === 1) throw Error('cold start');
    if (calls === 2) return Response.json({ pending: true, jobId }, { status: 202 });
    return Response.json(fixture('IN'));
  } });
  await ext.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
  const response = await ext.send({ type: 'compare', query: 'Sony WH-1000XM5' });
  assert.equal(response.result.offers.length, 1);
  assert.equal(ext.requests[2].options.method, 'GET');
  assert.equal(ext.requests[2].url, 'https://api.example.test/v1/search/' + jobId);
  assert.equal(ext.requests[2].options.body, undefined);
});

test('standalone worker rejects foreign polling URLs and stops polling when consent changes', async () => {
  const ext = worker('https://api.example.test', { fetcher: async () => Response.json({ pending: true, jobId: 'https://evil.test/steal' }, { status: 202 }) });
  await ext.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
  assert.match((await ext.send({ type: 'compare', query: 'Sony' })).error, /invalid comparison status/);
  assert.equal(ext.requests.length, 1);
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const cancellable = worker('https://api.example.test', { fetcher: async () => { started(); return Response.json({ pending: true, jobId: '12345678-1234-1234-1234-123456789abc' }, { status: 202 }); } });
  await cancellable.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
  const comparison = cancellable.send({ type: 'compare', query: 'Sony' });
  await waiting;
  await cancellable.send({ type: 'preferences', values: { enabled: false } });
  assert.match((await comparison).error, /Preferences changed/);
  assert.equal(cancellable.requests.length, 1);
});
test('cloud failure messages never expose upstream secrets and privacy needs publisher information', async () => {
  const service = await api({ supportEmail: '', engine: { search: async () => { throw Error('https://upstream.test?api_key=secret'); } } });
  try {
    const response = await fetch(service.base + '/v1/search', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Sony', country: 'IN' }) });
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('secret'));
    assert.equal((await fetch(service.base + '/privacy')).status, 503);
    assert.equal((await (await fetch(service.base + '/health')).json()).configured, false);
  } finally { await service.close(); }
});
test('standalone worker uses cloud API with no desktop and keeps current URL/price local', async () => {
  const service = await api(); const ext = worker(service.base);
  try {
    const initial = await ext.send({ type: 'settings' }); assert.equal(initial.result.enabled, false); assert.equal(ext.access(), 'TRUSTED_CONTEXTS');
    assert.match((await ext.send({ type: 'compare', query: 'Sony' })).error, /Enable/);
    await ext.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
    const current = { title: 'Sony WH-1000XM5 Black', price: 25000, shipping: 0, currency: 'INR', condition: 'new', platform: 'Amazon', url: 'https://www.amazon.in/dp/B09XS7JWHH?secret=private' };
    const compared = await ext.send({ type: 'compare', query: 'Sony WH-1000XM5', current });
    assert.equal(compared.result.offers[0].saving, 5000);
    assert.deepEqual(JSON.parse(ext.requests[0].options.body), { query: 'Sony WH-1000XM5', country: 'IN' });
    assert.equal(ext.requests[0].url, service.base + '/v1/search');
    assert.equal((await ext.send({ type: 'compare', query: 'Sony WH-1000XM5', current })).result.cached, true); assert.equal(service.calls.length, 1);
    await ext.send({ type: 'preferences', values: { country: 'GB' } });
    assert.equal((await ext.send({ type: 'compare', query: 'Sony WH-1000XM5' })).result.market.currency, 'GBP');
  } finally { await service.close(); }
});
test('automatic comparisons and location detection require opt-in; content scripts cannot change settings', async () => {
  const service = await api(); const ext = worker(service.base);
  try {
    await ext.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
    assert.match((await ext.send({ type: 'compare', query: 'Sony' }, ext.content)).error, /off/);
    assert.match((await ext.send({ type: 'preferences', values: { automatic: true } }, ext.content)).error, /Unsupported/);
    assert.match((await ext.send({ type: 'preferences', values: { ipDetection: true } })).error, /permission/);
    await ext.send({ type: 'preferences', values: { automatic: true } });
    assert.equal(ext.registrations.length, 1);
    assert.ok((await ext.send({ type: 'compare', query: 'Sony WH-1000XM5' }, ext.content)).result);
    assert.match((await ext.send({ type: 'compare', query: 'Sony WH-1000XM5' }, ext.content)).error, /wait/);
    assert.equal(ext.listener({ type: 'settings' }, { id: 'other' }, () => assert.fail()), undefined);
  } finally { await service.close(); }
});
test('legacy pairing is removed, reset clears consent, and missing deployment fails explicitly', async () => {
  const ext = worker('', { initial: { token: 'old-desktop-token', automatic: true } });
  assert.equal((await ext.send({ type: 'settings' })).result.configured, false); assert.equal(ext.stored.token, undefined);
  assert.equal(ext.stored.automatic, false);
  assert.match((await ext.send({ type: 'preferences', values: { enabled: true } })).error, /publisher/);
  await ext.send({ type: 'preferences', values: { country: 'GB' } });
  await ext.send({ type: 'reset' }); assert.equal(ext.stored.country, 'auto'); assert.equal(ext.stored.enabled, false);
  assert.equal(ext.requests.length, 0);
});
test('standalone response validation rejects mixed currencies and calculates totals locally', async () => {
  const ext = worker('https://api.example.test', { fetcher: async () => Response.json({ ...fixture('IN'), data: [
    { ...fixture('IN').data[0], currency: 'USD' }, { ...fixture('IN').data[0], shipping: null, trueCost: 1, url: 'https://www.flipkart.com/sony/p/second' },
  ] }) });
  await ext.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
  const response = await ext.send({ type: 'compare', query: 'Sony WH-1000XM5' });
  assert.equal(response.result.offers.length, 1); assert.equal(response.result.offers[0].trueCost, null); assert.equal(response.result.offers[0].saving, null);
});
test('changing region during a search discards the old response', async () => {
  let finish, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const ext = worker('https://api.example.test', { fetcher: () => { started(); return new Promise(resolve => { finish = () => resolve(Response.json(fixture('IN'))); }); } });
  await ext.send({ type: 'preferences', values: { enabled: true, country: 'IN' } });
  const request = ext.send({ type: 'compare', query: 'Sony WH-1000XM5' });
  await waiting;
  await ext.send({ type: 'preferences', values: { country: 'GB' } });
  finish(); assert.match((await request).error, /Preferences changed/);
});
