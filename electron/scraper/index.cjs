const { marketFor, searchUrl } = require('../../shared/markets.cjs');
const { normalizeProduct, rankProducts, safeUrl, money, canonicalUrl } = require('../../shared/deals.cjs');
const { request } = require('./transport.cjs');
const { parsePage, parseDetail, shippingFrom, currencyFrom } = require('./parsers.cjs');

function providerProducts(body, market) {
  return (body.shopping_results || []).map(p => ({
    title: p.title, price: p.extracted_price ?? money(p.price, market.country),
    currency: currencyFrom(p.price || '', market.currency), platform: p.source || 'Google Shopping',
    url: safeUrl(p.link || p.product_link), linkType: p.link ? 'store' : 'comparison',
    image: p.thumbnail, rating: p.rating, shipping: shippingFrom(p.delivery, market.country),
    catalogId: p.product_id, condition: p.second_hand_condition ? 'used' : undefined,
  }));
}
function createSearchEngine({ fetchPage = request, timeoutMs = 20000, providerTimeoutMs = 100000, cacheMs = 120000, now = () => Date.now() } = {}) {
  const cache = new Map();
  const pending = new Map();
  let active = 0;
  const queue = [];
  async function limited(fn) {
    if (active >= 4) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await fn(); } finally { if (queue.length) queue.shift()(); else active--; }
  }
  async function search(query, { country, apiKey = '', refresh = false, onProgress } = {}) {
    if (typeof query !== 'string' || !query.trim() || query.trim().length > 200) throw new Error('Enter a product name between 1 and 200 characters.');
    query = query.trim();
    const market = marketFor(country);
    const key = JSON.stringify([country, query.toLowerCase(), apiKey]);
    const cached = cache.get(key);
    if (!refresh && cached && now() - cached.time < cacheMs) return { ...cached.result, cached: true };
    if (pending.has(key)) {
      const entry = pending.get(key);
      if (onProgress) entry.listeners.add(onProgress);
      return entry.promise;
    }
    const entry = { listeners: new Set(onProgress ? [onProgress] : []) };
    entry.promise = (async () => {
      const sources = apiKey ? [{ id: 'shopping', name: 'Google Shopping' }] : market.stores;
      const statuses = [];
      const products = [];
      await Promise.all(sources.map(source => limited(async () => {
        const checkedAt = new Date(now()).toISOString();
        const status = { id: source.id, name: source.name, status: 'empty', count: 0, checkedAt,
          url: source.id === 'shopping' ? `https://www.google.com/search?tbm=shop&gl=${country.toLowerCase()}&q=${encodeURIComponent(query)}` : searchUrl(source, query) };
        const controller = new AbortController();
        const sourceTimeout = source.id === 'shopping' ? providerTimeoutMs : timeoutMs;
        let timer;
        try {
          const work = async () => {
            if (source.id === 'shopping') {
              const url = new URL('https://serpapi.com/search.json');
              Object.entries({ engine: 'google_shopping_light', q: query, gl: country.toLowerCase(), hl: 'en', api_key: apiKey, ...(refresh ? { no_cache: 'true' } : {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
              const body = await fetchPage(url.href, { signal: controller.signal, json: true, timeoutMs: sourceTimeout });
              if (body.error) throw Object.assign(new Error('The shopping provider could not complete this search. Please try again later.'), { code: 'provider_error' });
              return providerProducts(body, market);
            }
            return parsePage(await fetchPage(status.url, { signal: controller.signal }), market, source);
          };
          const raw = await Promise.race([work(), new Promise((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('This price source took too long. Please try again later.'), { code: 'timeout' })); }, sourceTimeout);
          })]);
          const valid = raw.map(p => normalizeProduct(p, market, source, checkedAt)).filter(Boolean);
          const ranked = rankProducts(valid, query);
          products.push(...ranked);
          status.count = ranked.length;
          status.status = ranked.length ? 'ok' : 'empty';
          status.message = ranked.length ? `${ranked.length} relevant listings retrieved` : 'No usable matching listings. The page may require JavaScript or its layout may have changed.';
        } catch (error) {
          if (controller.signal.aborted || ['ERR_CANCELED', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code) || ['AbortError', 'TimeoutError'].includes(error.name)) error = { code: 'timeout', message: 'This price source took too long. Please try again later.' };
          status.status = ['blocked', 'timeout', 'provider_error', 'unavailable'].includes(error.code) ? error.code : 'error';
          status.message = status.status === 'error' ? 'Could not connect to this source. Check your connection and try again.' : error.message;
        } finally { clearTimeout(timer); }
        statuses.push(status);
        const snapshot = { query, market, data: rankProducts(products, query), sources: [...statuses], totalSources: sources.length, checkedAt, cached: false };
        for (const listener of entry.listeners) { try { listener(snapshot); } catch {} }
      })));
      const result = { query, market, data: rankProducts(products, query), sources: statuses, totalSources: sources.length,
        checkedAt: new Date(now()).toISOString(), cached: false,
        message: sources.length ? '' : 'Direct store search is not available in this country yet. Connect Google Shopping in Settings for regional listings.' };
      if (result.data.length) {
        cache.set(key, { time: now(), result });
        if (cache.size > 50) cache.delete(cache.keys().next().value);
      }
      return result;
    })().finally(() => pending.delete(key));
    pending.set(key, entry);
    return entry.promise;
  }
  async function searchTrackedItem(item, options) {
    const market = marketFor(item.country);
    const safe = safeUrl(item.url);
    const store = safe && market.stores.find(s => new URL(s.origin).hostname === new URL(safe).hostname && s.name === item.platform);
    if (!store || options.apiKey) return search(item.query, { ...options, country: item.country });
    return limited(async () => {
      const checkedAt = new Date(now()).toISOString();
      try {
        const html = await fetchPage(safe, { signal: AbortSignal.timeout(timeoutMs) });
        const data = parseDetail(html, market, store, safe).map(p => normalizeProduct(p, market, store, checkedAt)).filter(p => p && canonicalUrl(p.url) === canonicalUrl(safe));
        return { data, sources: [{ status: data.length ? 'ok' : 'empty', name: store.name, checkedAt }] };
      } catch (error) { return { data: [], sources: [{ status: error.code || 'error', name: store.name, checkedAt }] }; }
    });
  }
  return { search, searchTrackedItem, clearCache: () => cache.clear() };
}
const engine = createSearchEngine();
module.exports = { createSearchEngine, providerProducts, search: engine.search, searchTrackedItem: engine.searchTrackedItem, clearCache: engine.clearCache };
