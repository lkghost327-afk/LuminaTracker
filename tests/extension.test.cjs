const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const { createCompanion, compareOffers } = require('../electron/companion.cjs');
const extension = path.join(__dirname, '..', 'extension');
const token = 'a'.repeat(64);
const origin = `chrome-extension://${'b'.repeat(32)}`;
const offer = extra => ({ title: 'Sony WH-1000XM5 Black', price: 20000, shipping: 0, trueCost: 20000, currency: 'INR', country: 'IN', condition: 'new', platform: 'Flipkart', url: 'https://www.flipkart.com/sony/p/test', ...extra });
const result = data => ({ data, market: { country: 'IN', currency: 'INR' }, sources: [], checkedAt: new Date().toISOString() });
test('extension manifest uses MV3 and optional shopping-site access', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, []);
  assert.ok(!manifest.permissions.includes('history'));
  assert.ok(!manifest.optional_host_permissions.includes('<all_urls>'));
  for (const file of ['background.js', 'popup.html', 'popup.js', 'content.js', 'page-info.js', 'icon.png']) assert.ok(fs.existsSync(path.join(extension, file)));
});
test('savings require matching identity, currency and known delivery, excluding current store', () => {
  const current = { ...offer({ price: 25000, platform: 'Amazon', url: 'https://www.amazon.in/dp/B09XS7JWHH' }) };
  const compared = compareOffers(result([offer(), offer({ currency: 'USD' }), offer({ title: 'Sony WH-1000XM5 Silver' }), offer({ trueCost: null, shipping: null }), offer({ platform: 'Amazon', url: current.url })]), current);
  assert.equal(compared.offers.length, 4);
  assert.equal(compared.offers[0].saving, 5000);
  assert.ok(compared.offers.slice(1).every(p => p.saving === null));
  assert.equal(compareOffers(result([offer()]), { ...current, shipping: null }).offers[0].saving, null);
  assert.equal(compareOffers(result([offer({ condition: 'unknown' })]), { ...current, condition: 'unknown' }).offers[0].saving, null);
  assert.equal(compareOffers(result([offer({ condition: 'used' })]), current).offers[0].saving, null);
});
test('companion rejects unauthorized callers and exposes only regional comparison', async () => {
  let queried;
  const service = { getConfig: async () => ({ market: { country: 'IN' } }), searchProducts: async input => { queried = input; return result([offer()]); } };
  const companion = createCompanion(service, { token, port: 0 });
  const port = await companion.start(); const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(base + '/status')).status, 401);
    assert.equal((await fetch(base + '/status', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.test' } })).status, 403);
    const headers = { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + '/tracker', { method: 'POST', headers, body: '{}' })).status, 404);
    const response = await fetch(base + '/compare', { method: 'POST', headers, body: JSON.stringify({ query: 'Sony WH-1000XM5', current: {}, country: 'US' }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(queried.country, 'IN'); assert.equal((await response.json()).offers.length, 1);
    const invalid = await fetch(base + '/compare', { method: 'POST', headers, body: JSON.stringify({ query: 'a'.repeat(201) }) });
    assert.equal(invalid.status, 400);
  } finally { await companion.stop(); }
});
function documentFrom(html) {
  const $ = cheerio.load(html);
  const wrap = el => el ? { textContent: $(el).text(), content: $(el).attr('content') } : null;
  return { querySelector: selector => wrap($(selector)[0]), querySelectorAll: selector => $(selector).toArray().map(wrap) };
}
test('page extraction distinguishes shopping searches, variants and non-shopping pages', () => {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(extension, 'page-info.js'), 'utf8'), context);
  const detect = context.LuminaPage.detect;
  assert.equal(context.LuminaPage.storeFor('https://www.amazon.in.evil.test/dp/test'), null);
  assert.equal(detect(documentFrom('<h1>Private mail</h1>'), 'https://mail.test/inbox'), null);
  assert.equal(detect(documentFrom(''), 'https://www.amazon.in/s?k=Sony%20WH-1000XM5').query, 'Sony WH-1000XM5');
  assert.equal(detect(documentFrom(''), 'https://www.amazon.in/gp/cart/view.html'), null);
  const product = { '@type': 'Product', name: 'Sony WH-1000XM5 Black', offers: { price: '24990', priceCurrency: 'INR', shippingDetails: { shippingRate: { value: 0, currency: 'INR' } }, itemCondition: 'https://schema.org/NewCondition' } };
  const html = `<h1>Sony WH-1000XM5 Black</h1><script type="application/ld+json">${JSON.stringify(product)}</script>`;
  const detected = detect(documentFrom(html), 'https://www.amazon.in/dp/B09XS7JWHH');
  assert.equal(detected.current.price, 24990); assert.equal(detected.current.shipping, 0); assert.equal(detected.current.currency, 'INR');
  product.offers = [{ price: 24990 }, { price: 29990 }];
  const multiple = detect(documentFrom(`<h1>Sony</h1><script type="application/ld+json">${JSON.stringify(product)}</script>`), 'https://www.amazon.in/dp/B09XS7JWHH');
  assert.equal(multiple.current.price, null);
});
