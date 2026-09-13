importScripts('config.js', 'core.js', 'page-info.js');
const recent = new Map();
const cache = new Map();
const pending = new Map();
let preferenceGeneration = 0;
const DEFAULTS = { schemaVersion: 2, enabled: false, automatic: false, country: 'auto', ipDetection: false };
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const data = await chrome.storage.local.get(null);
  if (data.schemaVersion !== 2) { await chrome.storage.local.clear(); await chrome.storage.local.set(DEFAULTS); }
})();
async function settings() { await ready; return { ...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS)) }; }
const hasService = () => Boolean(LUMINA_CONFIG.apiBase);
let ipCache;
async function resolveMarket(prefs) {
  let country = prefs.country === 'auto' ? null : prefs.country;
  let locationSource = country ? 'manual' : 'device region';
  if (!country && prefs.enabled && prefs.ipDetection && await chrome.permissions.contains({ origins: ['https://ipapi.co/*'] })) {
    if (!ipCache || Date.now() - ipCache.time > 21600000) {
      try {
        const response = await fetch('https://ipapi.co/country/', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw Error();
        const value = (await response.text()).trim();
        ipCache = { country: LuminaCore.countryCode(value), time: Date.now() };
      } catch { ipCache = { country: null, time: Date.now() }; }
    }
    country = ipCache.country;
    if (country) locationSource = 'IP estimate';
  }
  country ||= LuminaCore.localeCountry(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone);
  return { market: country ? LuminaCore.marketFor(country) : null, locationSource };
}
async function registerAutomatic() {
  await chrome.scripting.unregisterContentScripts({ ids: ['lumina-automatic'] }).catch(() => {});
  const prefs = await settings();
  if (!prefs.enabled || !prefs.automatic) return;
  const granted = await chrome.permissions.getAll();
  const matches = chrome.runtime.getManifest().optional_host_permissions.filter(origin => origin !== 'https://ipapi.co/*' && granted.origins?.includes(origin));
  if (matches.length) await chrome.scripting.registerContentScripts([{ id: 'lumina-automatic', matches, js: ['page-info.js', 'content.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
}
chrome.runtime.onInstalled.addListener(() => registerAutomatic().catch(() => {}));
chrome.runtime.onStartup.addListener(() => registerAutomatic().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => registerAutomatic().catch(() => {}));
async function readJSON(response) {
  const reader = response.body.getReader(); const parts = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2000000) throw Error('The price response was too large.'); parts.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const part of parts) { buffer.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}
async function search(query, market) {
  const generation = preferenceGeneration;
  const key = JSON.stringify([query.toLowerCase(), market.country]);
  const previous = cache.get(key);
  if (previous && Date.now() - previous.time < 120000) return { ...previous.result, cached: true };
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    let response;
    try {
      response = await fetch(LUMINA_CONFIG.apiBase + '/v1/search', { method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, country: market.country }), signal: AbortSignal.timeout(25000) });
    } catch { throw Error('The online deal service is unavailable. Please try again shortly.'); }
    const body = await readJSON(response);
    if (!response.ok) throw Error(typeof body.error === 'string' ? body.error.slice(0, 300) : 'The deal service could not complete this comparison.');
    if (!Array.isArray(body.data) || body.market?.country !== market.country || body.market?.currency !== market.currency || !Number.isFinite(Date.parse(body.checkedAt))) throw Error('The deal service returned an invalid region or price response.');
    const products = body.data.slice(0, 60).filter(p => p && typeof p.title === 'string' && typeof p.price === 'number').map(p => LuminaCore.normalizeProduct({
      title: p.title, price: p.price, currency: p.currency, shipping: typeof p.shipping === 'number' ? p.shipping : null,
      url: p.url, image: p.image, platform: typeof p.platform === 'string' ? p.platform.slice(0, 80) : 'Store',
      condition: ['new', 'used'].includes(p.condition) ? p.condition : 'unknown', gtin: typeof p.gtin === 'string' ? p.gtin.slice(0, 30) : undefined,
    }, market, { id: 'online', name: 'Store' }, body.checkedAt)).filter(Boolean);
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, 20).map(s => ({ name: String(s.name || 'Store').slice(0, 80), status: String(s.status || 'unknown').slice(0, 30), message: String(s.message || '').slice(0, 300) })) : [];
    const result = { market, data: LuminaCore.rankProducts(products, query), sources, checkedAt: body.checkedAt, cached: Boolean(body.cached), message: typeof body.message === 'string' ? body.message.slice(0, 300) : '' };
    if (result.data.length && generation === preferenceGeneration) { cache.set(key, { result, time: Date.now() }); if (cache.size > 30) cache.delete(cache.keys().next().value); }
    return result;
  })().finally(() => pending.delete(key));
  pending.set(key, task); return task;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || sender.id !== chrome.runtime.id) return;
  const popup = sender.url === chrome.runtime.getURL('popup.html');
  const content = Boolean(sender.tab && sender.frameId === 0 && LuminaPage.storeFor(sender.url));
  if (!popup && !content) return;
  (async () => {
    const prefs = await settings();
    if (message.type === 'settings') {
      if (content) return { enabled: prefs.enabled, automatic: prefs.automatic, configured: hasService() };
      return { ...prefs, ...await resolveMarket(prefs), countries: LuminaCore.countries, configured: hasService(), privacyUrl: LUMINA_CONFIG.privacyUrl };
    }
    if (message.type === 'reset' && popup) {
      preferenceGeneration++;
      await chrome.storage.local.clear(); await chrome.storage.local.set(DEFAULTS); cache.clear(); ipCache = null; recent.clear(); await registerAutomatic(); return { reset: true };
    }
    if (message.type === 'preferences' && popup) {
      const value = message.values || {}; const next = { ...prefs };
      if ('country' in value) next.country = value.country === 'auto' ? 'auto' : LuminaCore.countryCode(value.country);
      for (const key of ['enabled', 'automatic', 'ipDetection']) if (key in value) { if (typeof value[key] !== 'boolean') throw Error('Invalid preference.'); next[key] = value[key]; }
      if (next.ipDetection && !await chrome.permissions.contains({ origins: ['https://ipapi.co/*'] })) throw Error('Allow country detection in the browser permission prompt first.');
      if (!next.enabled) next.automatic = false;
      if (next.enabled && !hasService()) throw Error('The publisher has not configured the online deal service yet.');
      preferenceGeneration++; await chrome.storage.local.set(next); cache.clear(); ipCache = null; await registerAutomatic(); return next;
    }
    if (message.type === 'compare') {
      if (!hasService()) throw Error('The publisher has not configured the online deal service yet.');
      if (!prefs.enabled) throw Error('Enable comparisons in the extension first.');
      if (content && !prefs.automatic) throw Error('Automatic comparisons are off.');
      if (typeof message.query !== 'string' || !message.query.trim() || message.query.length > 200 || /[\u0000-\u001f]/.test(message.query)) throw Error('Enter a product name up to 200 characters.');
      if (content) {
        const last = recent.get(sender.tab.id);
        if (last && Date.now() - last < 15000) throw Error('Please wait before another automatic comparison.');
        recent.set(sender.tab.id, Date.now()); if (recent.size > 100) recent.delete(recent.keys().next().value);
      }
      const generation = preferenceGeneration;
      const { market } = await resolveMarket(prefs);
      if (!market) throw Error('Choose your country in the extension.');
      const result = await search(message.query.trim(), market);
      if (generation !== preferenceGeneration) throw Error('Preferences changed. Compare again using your current settings.');
      const c = message.current || {};
      const current = { title: typeof c.title === 'string' ? c.title.slice(0, 400) : '', url: LuminaCore.safeUrl(content ? sender.url : c.url),
        platform: typeof c.platform === 'string' ? c.platform.slice(0, 80) : '', currency: c.currency, condition: c.condition, price: c.price, shipping: c.shipping, gtin: c.gtin };
      return LuminaCore.compareOffers(result, current);
    }
    throw Error('Unsupported extension operation.');
  })().then(result => reply({ result })).catch(error => reply({ error: error.message }));
  return true;
});
