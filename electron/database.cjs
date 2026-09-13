const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { marketFor, countryCode } = require('../shared/markets.cjs');
const { canonicalUrl } = require('../shared/deals.cjs');
const DEFAULT_SETTINGS = { country: 'auto', checkInterval: 30, notifications: true, provider: 'direct' };
function createDatabase(file, { encrypt = value => value, decrypt = value => value } = {}) {
  let data = { version: 2, settings: { ...DEFAULT_SETTINGS }, tracked_items: [], price_history: [] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const validate = raw => {
    if (!raw || !Array.isArray(raw.tracked_items) || !Array.isArray(raw.price_history)) throw new Error('Invalid database structure');
    return raw;
  };
  if (fs.existsSync(file)) {
    try { data = validate(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    catch {
      // Preserve the unreadable original before using a backup. Never silently reset user data.
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
      try { data = validate(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))); }
      catch { throw new Error(`Could not read local data. Original preserved at ${file}.corrupt-*. Restore a valid backup before restarting.`); }
    }
  }
  if (data.version !== 2) {
    fs.copyFileSync(file, `${file}.v1-backup`);
    // Legacy history mixed currencies and could be simulated; retain it in the backup only.
    data.price_history = [];
    data.tracked_items = data.tracked_items.map(item => ({ ...item, target_price: null, country: null, currency: null, needsReview: true }));
    data.version = 2;
  }
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  function commit(next) {
    const temporary = `${file}.tmp`;
    const fd = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(next, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(temporary, file);
    data = next;
  }
  commit(data);
  function transaction(fn) { const next = structuredClone(data); const result = fn(next); commit(next); return result; }
  return {
    getSettings: () => ({ ...data.settings, apiKey: undefined, hasApiKey: Boolean(data.settings.apiKey) }),
    getApiKey: () => data.settings.apiKey ? decrypt(data.settings.apiKey) : '',
    updateSettings(input) {
      return transaction(next => {
        const settings = next.settings;
        if (input.country !== undefined) settings.country = input.country === 'auto' ? 'auto' : countryCode(input.country);
        if (input.checkInterval !== undefined) {
          if (![5, 15, 30, 60].includes(Number(input.checkInterval))) throw new Error('Choose a tracking interval of 5, 15, 30 or 60 minutes.');
          settings.checkInterval = Number(input.checkInterval);
        }
        if (input.notifications !== undefined) settings.notifications = input.notifications === true;
        if (input.provider !== undefined) {
          if (!['direct', 'shopping'].includes(input.provider)) throw new Error('Invalid search provider.');
          settings.provider = input.provider;
        }
        if (input.apiKey !== undefined) {
          if (typeof input.apiKey !== 'string' || input.apiKey.length > 300) throw new Error('Invalid API key.');
          settings.apiKey = input.apiKey.trim() ? encrypt(input.apiKey.trim()) : '';
        }
        if (settings.provider === 'shopping' && !settings.apiKey) throw new Error('Enter a SerpApi key to enable Google Shopping.');
        return { ...settings, apiKey: undefined, hasApiKey: Boolean(settings.apiKey) };
      });
    },
    getTrackedItems: () => structuredClone([...data.tracked_items].reverse()),
    addTrackedItem(input) {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query || query.length > 200) throw new Error('Enter a product name up to 200 characters.');
      const market = marketFor(input.country);
      const target = input.targetPrice === '' || input.targetPrice == null ? null : Number(input.targetPrice);
      if (target !== null && (!Number.isFinite(target) || target <= 0)) throw new Error('Target price must be greater than zero.');
      if (data.tracked_items.length >= 100) throw new Error('You can track up to 100 products.');
      const url = input.url ? canonicalUrl(input.url) : null;
      if (input.url && !url) throw new Error('Invalid product link.');
      if (data.tracked_items.some(p => p.country === market.country && p.query.toLowerCase() === query.toLowerCase() && p.url === url)) throw new Error('This product is already tracked.');
      const item = { id: randomUUID(), query, target_price: target, country: market.country, currency: market.currency,
        url, platform: url ? String(input.platform || '').slice(0, 100) : null, catalogId: input.catalogId || null,
        created_at: new Date().toISOString(), lastChecked: null, status: 'pending', alertActive: false };
      return transaction(next => { next.tracked_items.push(item); return item; });
    },
    removeTrackedItem(id) { return transaction(next => { next.tracked_items = next.tracked_items.filter(p => p.id !== id); next.price_history = next.price_history.filter(p => p.item_id !== id); return { success: true }; }); },
    getPriceHistory: id => structuredClone(data.price_history.filter(p => p.item_id === id).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))),
    recordCheck(id, update, observation) {
      return transaction(next => {
        const item = next.tracked_items.find(p => p.id === id);
        if (!item) return false;
        Object.assign(item, update);
        if (observation) {
          if (observation.currency !== item.currency || !(observation.price > 0)) throw new Error('Invalid price observation.');
          next.price_history.push({ ...observation, id: randomUUID(), item_id: id, recorded_at: update.lastChecked });
          const keep = new Set(next.price_history.filter(p => p.item_id === id).slice(-1000).map(p => p.id));
          next.price_history = next.price_history.filter(p => p.item_id !== id || keep.has(p.id));
        }
        return true;
      });
    },
  };
}
module.exports = { createDatabase, DEFAULT_SETTINGS };
