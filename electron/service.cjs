const { EventEmitter } = require('node:events');
const { marketFor, localeCountry, countries, countryCode } = require('../shared/markets.cjs');
const { canonicalUrl, relevance, isAccessoryMismatch, optimizeBundle } = require('../shared/deals.cjs');
const searchEngine = require('./scraper/index.cjs');
const { request } = require('./scraper/transport.cjs');

function selectTrackedOffer(item, products) {
  return products.filter(p => p.country === item.country && p.currency === item.currency && p.price > 0 && p.condition !== 'used')
    .filter(p => item.url ? p.platform === item.platform && (canonicalUrl(p.url) === item.url || (item.catalogId && p.catalogId === item.catalogId))
      : relevance(item.query, p.title) === 1 && !isAccessoryMismatch(item.query, p.title))
    .sort((a, b) => Number(b.trueCost != null) - Number(a.trueCost != null) || (a.trueCost ?? a.price) - (b.trueCost ?? b.price))[0] || null;
}
function createService(db, { engine = searchEngine, locate = () => request('https://ipapi.co/json/', { json: true, signal: AbortSignal.timeout(5000) }), notify = () => {} } = {}) {
  const events = new EventEmitter();
  let detection;
  let detectionAt = 0;
  let runningCheck;
  let interval;
  async function getConfig({ locale, timezone } = {}) {
    const settings = db.getSettings();
    let country = settings.country;
    let locationSource = 'manual';
    if (country === 'auto') {
      if (!detection || Date.now() - detectionAt > 6 * 60 * 60 * 1000) {
        detectionAt = Date.now();
        detection = Promise.resolve().then(locate).then(data => ({ country: countryCode(data.country_code), source: 'IP location' })).catch(() => ({ country: null, source: 'device region' }));
      }
      const located = await detection;
      country = located.country || localeCountry(locale, timezone);
      locationSource = located.source;
    }
    return { settings, market: country ? marketFor(country) : null, countries, locationSource, desktop: false };
  }
  function options(input = {}) {
    const settings = db.getSettings();
    const country = settings.country === 'auto' ? countryCode(input.country) : settings.country;
    return { country, apiKey: settings.provider === 'shopping' ? db.getApiKey() : '', refresh: input.refresh === true };
  }
  async function searchProducts(input, onProgress) { return engine.search(input.query, { ...options(input), onProgress }); }
  function checkDealsNow() {
    if (runningCheck) return runningCheck;
    runningCheck = (async () => {
      const summary = { checked: 0, found: 0, alerts: 0, failed: 0 };
      for (const item of db.getTrackedItems()) {
        if (item.needsReview || !item.country) continue;
        const lastChecked = new Date().toISOString();
        try {
          const settings = db.getSettings();
          const searchOptions = { country: item.country, apiKey: settings.provider === 'shopping' ? db.getApiKey() : '', refresh: true };
          const result = item.url && engine.searchTrackedItem ? await engine.searchTrackedItem(item, searchOptions) : await engine.search(item.query, searchOptions);
          const offer = selectTrackedOffer(item, result.data);
          summary.checked++;
          if (!offer) {
            const blocked = result.sources.length === 0 || result.sources.every(s => s.status !== 'ok' && s.status !== 'empty');
            db.recordCheck(item.id, { lastChecked, status: blocked ? 'unavailable' : 'not_found', message: blocked ? 'Sources unavailable; previous price retained.' : 'No matching listing found; previous price retained.' });
            if (blocked) summary.failed++;
            continue;
          }
          const totalKnown = Number.isFinite(offer.trueCost);
          const alert = totalKnown && item.target_price !== null && offer.trueCost <= item.target_price;
          const notifyNow = alert && (!item.alertActive || offer.trueCost < (item.lastAlertPrice ?? Infinity));
          const saved = db.recordCheck(item.id, { lastChecked, status: totalKnown ? 'ok' : 'shipping_unknown', message: totalKnown ? 'Listing refreshed.' : 'Item price refreshed; shipping is unknown, so no target alert.',
            latestPrice: totalKnown ? offer.trueCost : offer.price, latestUrl: offer.url, latestPlatform: offer.platform, latestTotalKnown: totalKnown,
            ...(totalKnown ? { alertActive: alert, lastAlertPrice: alert ? offer.trueCost : null } : {}) },
          { price: totalKnown ? offer.trueCost : offer.price, itemPrice: offer.price, shipping: offer.shipping, totalKnown, currency: offer.currency, platform: offer.platform, url: offer.url });
          if (!saved) continue;
          summary.found++;
          if (notifyNow && settings.notifications) { await notify(item, offer); summary.alerts++; }
        } catch {
          summary.failed++;
          db.recordCheck(item.id, { lastChecked, status: 'error', message: 'Check failed. Previous price retained.' });
        } finally { events.emit('tracker', db.getTrackedItems()); }
      }
      return summary;
    })().finally(() => { runningCheck = null; });
    return runningCheck;
  }
  function schedule() {
    clearInterval(interval);
    interval = setInterval(() => checkDealsNow().catch(() => {}), db.getSettings().checkInterval * 60000);
    interval.unref?.();
  }
  return {
    events, getConfig, searchProducts,
    updateSettings(input) { const result = db.updateSettings(input); detection = null; engine.clearCache?.(); schedule(); return result; },
    getTrackedItems: db.getTrackedItems, getPriceHistory: db.getPriceHistory,
    addTrackedItem(input) { return db.addTrackedItem(input); }, removeTrackedItem: db.removeTrackedItem, checkDealsNow,
    async optimizeBundle(input) {
      if (!Array.isArray(input.queries) || input.queries.length < 2 || input.queries.length > 6 || input.queries.some(q => typeof q !== 'string' || !q.trim() || q.length > 200)) throw new Error('Enter between 2 and 6 product names.');
      const opts = options(input);
      const queries = input.queries.map(q => q.trim());
      const searches = await Promise.all(queries.map(query => engine.search(query, opts)));
      return { ...optimizeBundle(queries, searches, marketFor(opts.country).currency), sources: searches.flatMap(r => r.sources) };
    },
    start: schedule, stop: () => clearInterval(interval),
  };
}
module.exports = { createService, selectTrackedOffer };
