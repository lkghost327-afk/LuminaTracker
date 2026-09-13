const { words } = require('./deals.cjs');
function sameIdentity(a, b) {
  return Boolean(a.gtin && b.gtin && a.gtin === b.gtin) || words(a.title).join(' ') === words(b.title).join(' ');
}
function compareOffers(result, current = {}) {
  let host = '';
  try { host = new URL(current.url).hostname.replace(/^www\./, ''); } catch {}
  const offers = result.data.filter(p => {
    try { return new URL(p.url).hostname.replace(/^www\./, '') !== host && (!current.platform || p.platform.toLowerCase() !== current.platform.toLowerCase()); } catch { return false; }
  }).slice(0, 8).map(p => {
    const comparable = current.currency === p.currency && sameIdentity(current, p) && ['new', 'used'].includes(p.condition)
      && current.condition === p.condition && Number.isFinite(current.price) && current.price > 0
      && Number.isFinite(current.shipping) && current.shipping >= 0 && Number.isFinite(p.trueCost);
    const saving = comparable ? Math.round((current.price + current.shipping - p.trueCost) * 100) / 100 : null;
    return { ...p, saving: saving > 0 ? saving : null };
  });
  return { offers, market: result.market, sources: result.sources, checkedAt: result.checkedAt, cached: result.cached,
    message: result.message || (offers.length ? 'Compare model, variant, condition and final charges before buying.' : 'No matching offers from other stores were retrieved.') };
}
module.exports = { compareOffers };
