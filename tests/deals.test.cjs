const { test } = require('node:test');
const assert = require('node:assert/strict');
const { marketFor, localeCountry } = require('../shared/markets.cjs');
const { money, safeUrl, normalizeProduct, rankProducts, relevance, optimizeBundle } = require('../shared/deals.cjs');
const { parsePage, shippingFrom } = require('../electron/scraper/parsers.cjs');
const { providerProducts, createSearchEngine } = require('../electron/scraper/index.cjs');
const product = (extra = {}) => ({ title: 'Sony WH-1000XM5 Black', price: 25000, shipping: 0, trueCost: 25000, currency: 'INR', country: 'IN', condition: 'new', platform: 'Amazon', url: 'https://www.amazon.in/dp/B09XS7JWHH', ...extra });
test('regional storefronts never mix Indian and US stores', () => {
  assert.equal(marketFor('IN').currency, 'INR');
  assert.deepEqual(marketFor('IN').stores.map(s => s.id), ['amazon', 'flipkart', 'meesho']);
  assert.equal(marketFor('GB').currency, 'GBP');
  assert.match(marketFor('GB').stores[0].origin, /amazon.co.uk/);
  assert.equal(marketFor('CA').currency, 'CAD');
  assert.throws(() => marketFor('XX'));
  assert.equal(localeCountry('en-US', 'Asia/Kolkata'), 'IN');
  assert.equal(localeCountry('en-GB'), 'GB');
  assert.equal(localeCountry('en'), null);
});
test('prices parse Indian grouping and decimal cents without concatenating ranges', () => {
  assert.equal(money('₹1,29,999.99', 'IN'), 129999.99);
  assert.equal(money('$1,299.95'), 1299.95);
  assert.equal(money('1.299,95 €', 'DE'), 1299.95);
  assert.equal(money('$10.00 to $30.00'), null);
  assert.equal(money('$20/month'), null);
  assert.equal(money('EMI ₹999'), null);
  assert.equal(money(Infinity), null);
});
test('missing delivery stays unknown and conditional free delivery is not zero', () => {
  assert.equal(shippingFrom('', 'IN'), null);
  assert.equal(shippingFrom('Free delivery on orders above ₹499', 'IN'), null);
  assert.equal(shippingFrom('Free delivery', 'IN'), 0);
  assert.equal(shippingFrom('₹40 delivery', 'IN'), 40);
  const item = normalizeProduct(product({ shipping: null }), marketFor('IN'), { id: 'amazon' }, 'now');
  assert.equal(item.trueCost, null);
  assert.equal(item.freeShipping, false);
});
test('reject invalid URLs, mismatched currencies and nonfinite prices', () => {
  assert.equal(safeUrl('', 'https://www.amazon.in'), '');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  for (const extra of [{ currency: 'USD' }, { price: Infinity }, { price: -1 }, { url: 'file:///etc/passwd' }, { available: false }]) {
    assert.equal(normalizeProduct(product(extra), marketFor('IN'), { id: 'amazon' }, 'now'), null);
  }
});
test('relevance rejects wrong models, wrong capacity, cases and replacement parts', () => {
  const products = [product(), product({ title: 'Sony WH-1000XM4', url: 'https://shop.test/4' }), product({ title: 'Case for Sony WH-1000XM5', url: 'https://shop.test/case' })];
  assert.equal(rankProducts(products, 'Sony WH-1000XM5').length, 1);
  assert.equal(relevance('iPhone 13', 'iPhone 130'), 0);
  assert.equal(relevance('iPhone 13 128GB', 'iPhone 13 256GB'), 0);
  assert.equal(relevance('Sony WH1000XM5', 'Sony WH-1000XM5'), 1);
  assert.equal(relevance('Sony WH-1000XM5', 'Sony WF-1000XM5 Earbuds'), 0);
  assert.equal(relevance('iPhone 16 Pro', 'iPhone 16'), 0);
});
test('grades require matching identity, currency, condition and known shipping', () => {
  const result = rankProducts([
    product({ price: 20000, trueCost: 20000 }),
    product({ platform: 'Flipkart', url: 'https://www.flipkart.com/sony/p/test', price: 30000, trueCost: 30000 }),
    product({ title: 'Sony WH-1000XM5 Silver', platform: 'eBay', url: 'https://shop.test/silver', trueCost: 15000 }),
    product({ platform: 'Meesho', url: 'https://www.meesho.com/sony/p/test', trueCost: null, shipping: null }),
  ], 'Sony WH-1000XM5');
  assert.equal(result.find(p => p.platform === 'Amazon').dealScore, 'S');
  assert.equal(result.find(p => p.platform === 'eBay').dealScore, undefined);
  assert.equal(result.find(p => p.platform === 'Meesho').dealScore, undefined);
  const uncertain = rankProducts([product({ condition: 'unknown' }), product({ condition: 'unknown', platform: 'Flipkart', url: 'https://shop.test/uncertain' })], 'Sony WH-1000XM5');
  assert.ok(uncertain.every(p => p.dealScore == null));
});
test('Amazon parser preserves fractional cents and current heading markup', () => {
  const market = marketFor('IN');
  const html = '<div data-component-type="s-search-result"><a href="/dp/B09XS7JWHH"><h2><span>Sony WH-1000XM5</span></h2></a><span class="a-price"><span class="a-price-whole">24,990.</span><span class="a-price-fraction">99</span></span><span class="a-icon-alt">4.5 out of 5 stars</span></div>';
  const parsed = parsePage(html, market, market.stores[0]);
  assert.equal(parsed[0].price, 24990.99);
  assert.equal(parsed[0].rating, 4.5);
  assert.equal(parsed[0].shipping, null);
  assert.equal(parsed[0].url, 'https://www.amazon.in/dp/B09XS7JWHH');
});
test('JSON-LD graph offers parse numeric schema prices independently of locale', () => {
  const market = marketFor('DE');
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Product', name: 'Sony headphones', url: '/dp/B09XS7JWHH', offers: { price: '199.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } }] })}</script>`;
  assert.equal(parsePage(html, market, market.stores[0])[0].price, 199.99);
});
test('Amazon brand heading does not hide the model and ASIN removes sponsored duplicates', () => {
  const market = marketFor('IN');
  const html = '<div data-component-type="s-search-result" data-asin="B09XS7JWHH"><h2>Sony</h2><a href="/sspa/click?ad=123"><h2>WH-1000XM5 Black</h2></a><span class="a-price"><span class="a-offscreen">₹27,989</span></span></div>';
  const p = parsePage(html, market, market.stores[0])[0];
  assert.equal(p.title, 'Sony WH-1000XM5 Black');
  assert.equal(p.url, 'https://www.amazon.in/dp/B09XS7JWHH');
});
test('bundles choose cheapest per store and never total missing products as zero', () => {
  const queries = ['Sony WH-1000XM5 Black', 'Keyboard'];
  const searches = [{ data: [product({ trueCost: 30000 }), product({ trueCost: 25000, url: 'https://shop.test/cheaper' })] }, { data: [product({ title: 'Keyboard', trueCost: 1000, url: 'https://shop.test/keyboard' })] }];
  const result = optimizeBundle(queries, searches, 'INR');
  assert.equal(result.mixedTotal, 26000);
  assert.equal(result.singleStoreOptions[0].total, 26000);
  assert.equal(optimizeBundle(queries, [searches[0], { data: [] }], 'INR').mixedTotal, null);
  assert.equal(optimizeBundle(queries, [searches[0], { data: [product({ title: 'Keyboard', trueCost: null })] }], 'INR').mixedTotal, null);
});
test('shopping provider retains native currency, source and comparison-page provenance', () => {
  const p = providerProducts({ shopping_results: [{ title: 'Sony WH-1000XM5', price: '₹24,990', extracted_price: 24990, source: 'Croma', product_link: 'https://www.google.com/search?ibp=oshop', delivery: 'Free delivery' }] }, marketFor('IN'))[0];
  assert.equal(p.currency, 'INR'); assert.equal(p.shipping, 0); assert.equal(p.linkType, 'comparison'); assert.equal(p.platform, 'Croma');
});
test('partial failures preserve successes, deduplicate concurrent requests and stream progress', async () => {
  let calls = 0;
  const fixture = '<div data-component-type="s-search-result"><h2><a href="/dp/B09XS7JWHH">Sony WH-1000XM5</a></h2><span class="a-price"><span class="a-offscreen">₹24,990.99</span></span></div>';
  const engine = createSearchEngine({ fetchPage: async url => { calls++; if (url.includes('amazon')) return fixture; throw Object.assign(new Error('blocked'), { code: 'blocked' }); } });
  const progress = [];
  const [a, b] = await Promise.all([engine.search('Sony WH-1000XM5', { country: 'IN', onProgress: p => progress.push(p) }), engine.search('Sony WH-1000XM5', { country: 'IN' })]);
  assert.equal(calls, 3); assert.equal(a.data.length, 1); assert.deepEqual(a, b); assert.equal(progress.length, 3);
  assert.equal(a.sources.filter(s => s.status === 'blocked').length, 2);
  assert.equal((await engine.search('Sony WH-1000XM5', { country: 'IN' })).cached, true);
  await engine.search('Sony WH-1000XM5', { country: 'IN', refresh: true }); assert.equal(calls, 6);
});
test('hanging stores are aborted and never replaced with fake listings', async () => {
  let aborted = 0;
  const engine = createSearchEngine({ timeoutMs: 20, fetchPage: (_url, { signal }) => new Promise(() => signal.addEventListener('abort', () => aborted++)) });
  const result = await engine.search('Sony', { country: 'IN' });
  assert.equal(result.data.length, 0); assert.equal(aborted, 3); assert.ok(result.sources.every(s => s.status === 'timeout'));
});
test('exact trackers fetch the product page and do not read recommendations as its price', async () => {
  let fetched;
  const engine = createSearchEngine({ fetchPage: async url => { fetched = url; return '<h1 id="productTitle">Sony WH-1000XM5 Black</h1><div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">₹27,989</span></span></div><div id="mir-layout-DELIVERY_BLOCK">FREE delivery</div><div class="recommendation">₹199</div>'; } });
  const result = await engine.searchTrackedItem(product({ query: 'Sony WH-1000XM5' }), {});
  assert.equal(fetched, 'https://www.amazon.in/dp/B09XS7JWHH');
  assert.equal(result.data[0].trueCost, 27989);
});
