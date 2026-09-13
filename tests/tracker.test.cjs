const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../electron/database.cjs');
const { createService, selectTrackedOffer } = require('../electron/service.cjs');
const root = path.join(__dirname, '..', 'tmp', 'tests');
fs.mkdirSync(root, { recursive: true });
function database() { return createDatabase(path.join(fs.mkdtempSync(path.join(root, 'db-')), 'data.json')); }
const offer = (extra = {}) => ({ title: 'Sony WH-1000XM5', price: 20000, shipping: 100, trueCost: 20100, platform: 'Amazon', url: 'https://www.amazon.in/dp/B09XS7JWHH', country: 'IN', currency: 'INR', condition: 'new', ...extra });
test('tracked items persist native currency, reject invalid targets and deduplicate', () => {
  const db = database();
  const item = db.addTrackedItem({ query: 'Sony WH-1000XM5', targetPrice: 22000, country: 'IN' });
  assert.equal(item.currency, 'INR'); assert.equal(item.target_price, 22000);
  assert.throws(() => db.addTrackedItem({ query: 'Sony WH-1000XM5', country: 'IN' }), /already/);
  assert.throws(() => db.addTrackedItem({ query: 'Keyboard', targetPrice: -20, country: 'IN' }));
  assert.throws(() => db.addTrackedItem({ query: 'Keyboard', targetPrice: 'NaN', country: 'IN' }));
  const gb = db.addTrackedItem({ query: 'Sony WH-1000XM5', targetPrice: 250, country: 'GB' });
  assert.equal(gb.currency, 'GBP'); assert.notEqual(gb.id, item.id);
});
test('legacy uncertain prices are backed up and trackers require review', () => {
  const dir = fs.mkdtempSync(path.join(root, 'legacy-'));
  const file = path.join(dir, 'data.json');
  const old = { tracked_items: [{ id: 1, query: 'Headphones', target_price: 100 }], price_history: [{ item_id: 1, price: 50 }] };
  fs.writeFileSync(file, JSON.stringify(old));
  const db = createDatabase(file);
  assert.equal(db.getTrackedItems()[0].needsReview, true);
  assert.equal(db.getTrackedItems()[0].target_price, null);
  assert.equal(db.getPriceHistory(1).length, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.v1-backup`)), old);
});
test('corrupt data is preserved instead of silently overwritten', () => {
  const dir = fs.mkdtempSync(path.join(root, 'corrupt-'));
  const file = path.join(dir, 'data.json'); fs.writeFileSync(file, '{bad');
  assert.throws(() => createDatabase(file), /Could not read local data/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
  assert.ok(fs.readdirSync(dir).some(f => f.includes('.corrupt-')));
});
test('API keys are transformed at rest and never exposed by settings reads', () => {
  const file = path.join(fs.mkdtempSync(path.join(root, 'secret-')), 'data.json');
  const db = createDatabase(file, { encrypt: v => Buffer.from(v).toString('base64'), decrypt: v => Buffer.from(v, 'base64').toString() });
  db.updateSettings({ provider: 'shopping', apiKey: 'test-only-provider-secret' });
  assert.equal(db.getSettings().apiKey, undefined); assert.equal(db.getSettings().hasApiKey, true);
  assert.equal(db.getApiKey(), 'test-only-provider-secret');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('test-only-provider-secret'));
  assert.throws(() => db.updateSettings({ provider: 'shopping', apiKey: '' }));
  assert.equal(db.getApiKey(), 'test-only-provider-secret');
});
test('exact listing trackers cannot switch to a cheaper accessory or another store', () => {
  const item = { query: 'Sony WH-1000XM5', url: offer().url, platform: 'Amazon', country: 'IN', currency: 'INR' };
  assert.equal(selectTrackedOffer(item, [offer({ url: 'https://www.amazon.in/dp/B09XS7JWHA', title: 'Case for Sony WH-1000XM5', price: 200 }), offer()]).price, 20000);
  assert.equal(selectTrackedOffer(item, [offer({ platform: 'Flipkart' }), offer({ currency: 'USD' })]), null);
});
test('checks coalesce, persist observations, deduplicate alerts and notify on a further drop', async () => {
  const db = database();
  const item = db.addTrackedItem({ query: 'Sony WH-1000XM5', country: 'IN', targetPrice: 21000 });
  let current = offer(); let searches = 0; let alerts = 0;
  const engine = { search: async () => { searches++; await new Promise(resolve => setTimeout(resolve, 5)); return { data: [current], sources: [{ status: 'ok' }] }; } };
  const service = createService(db, { engine, notify: () => alerts++ });
  await Promise.all([service.checkDealsNow(), service.checkDealsNow()]);
  assert.equal(searches, 1); assert.equal(alerts, 1); assert.equal(db.getPriceHistory(item.id)[0].price, 20100);
  await service.checkDealsNow(); assert.equal(alerts, 1);
  current = offer({ trueCost: 20000, price: 19900 }); await service.checkDealsNow(); assert.equal(alerts, 2);
  assert.equal(db.getTrackedItems()[0].latestPrice, 20000);
});
test('unknown shipping records item prices without triggering target alerts', async () => {
  const db = database(); const item = db.addTrackedItem({ query: 'Sony WH-1000XM5', country: 'IN', targetPrice: 30000 });
  let alerts = 0;
  const service = createService(db, { engine: { search: async () => ({ data: [offer({ shipping: null, trueCost: null })], sources: [{ status: 'ok' }] }) }, notify: () => alerts++ });
  await service.checkDealsNow();
  assert.equal(alerts, 0); assert.equal(db.getPriceHistory(item.id)[0].totalKnown, false); assert.equal(db.getTrackedItems()[0].status, 'shipping_unknown');
});
test('one store failure does not stop the remaining tracked products', async () => {
  const db = database();
  db.addTrackedItem({ query: 'Sony WH-1000XM5', country: 'IN' });
  db.addTrackedItem({ query: 'Keyboard', country: 'IN' });
  const service = createService(db, { engine: { search: async query => { if (query === 'Keyboard') throw new Error('offline'); return { data: [offer()], sources: [{ status: 'ok' }] }; } } });
  const result = await service.checkDealsNow();
  assert.equal(result.failed, 1); assert.equal(result.found, 1);
  assert.equal(db.getTrackedItems().find(p => p.query === 'Keyboard').status, 'error');
});
test('automatic country selection and manual override use correct currencies', async () => {
  const db = database(); const service = createService(db, { locate: async () => ({ country_code: 'IN' }) });
  assert.equal((await service.getConfig({ locale: 'en-US' })).market.currency, 'INR');
  service.updateSettings({ country: 'GB' });
  assert.equal((await service.getConfig()).market.currency, 'GBP'); service.stop();
  const other = createService(database(), { locate: async () => { throw new Error('offline'); } });
  assert.equal((await other.getConfig({ locale: 'en-AU' })).market.currency, 'AUD');
  assert.equal((await other.getConfig({ locale: 'en' })).market, null);
});
