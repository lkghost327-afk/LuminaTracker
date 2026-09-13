function money(value, country = 'US') {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value || '').trim();
  // Ranges, monthly payments and installments are not a single purchase price.
  if (/\d\s*(?:to|–|—|-)\s*[$€£₹]?\s*\d|\/\s*(?:mo|month)|per month|\bEMI\b/i.test(text)) return null;
  const match = text.match(/\d[\d\s,.\u00a0]*/);
  if (!match) return null;
  let numeric = match[0].replace(/[\s\u00a0]/g, '').replace(/[.,]+$/, '');
  if (['DE', 'FR', 'IT', 'ES', 'BR', 'NL', 'SE', 'PL'].includes(country)) numeric = numeric.replace(/\./g, '').replace(',', '.');
  else numeric = numeric.replace(/,/g, '');
  const number = Number(numeric);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function safeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const url = new URL(value, base); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function canonicalUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  const amazon = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (amazon) return `${url.origin}/dp/${amazon[1].toUpperCase()}`;
  const ebay = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/);
  if (ebay) return `${url.origin}/itm/${ebay[1]}`;
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref|tag$|aff|tracking|spm|sr$|qid$|otracker|iid$)/i.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.href;
}
function words(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/(\p{L})-(?=\d)/gu, '$1').replace(/(\d)\s+(gb|tb|ml|kg|mm|inch)\b/g, '$1$2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}
const STOP = new Set(['the', 'a', 'an', 'and', 'with', 'for', 'of', 'in', 'on', 'by', 'buy', 'price', 'best', 'new']);
function relevance(query, title) {
  const wanted = words(query).filter(w => !STOP.has(w));
  const actual = words(title);
  if (!wanted.length) return 0;
  const compact = actual.join('');
  // Missing model numbers and capacities are hard mismatches.
  const numericMatch = w => /^\d+$/.test(w) ? actual.includes(w) : actual.some((_, i) => [actual[i], actual.slice(i, i + 2).join(''), actual.slice(i, i + 3).join('')].some(part => part === w || part.endsWith(w) && !/\d/.test(part.slice(0, -w.length))));
  if (wanted.some(w => /\d/.test(w) && !numericMatch(w))) return 0;
  if (wanted.some(w => ['pro', 'max', 'ultra', 'plus', 'mini', 'lite'].includes(w) && !actual.includes(w))) return 0;
  return wanted.filter(w => actual.includes(w) || (w.length >= 4 && compact.includes(w))).length / wanted.length;
}
function isAccessoryMismatch(query, title) {
  const accessories = /\b(case|cover|protector|replacement|earpads|ear pad|strap|sleeve|skin|compatible|for parts)\b/i;
  return accessories.test(title) && !accessories.test(query);
}
function comparisonKey(p) {
  // Be conservative: only identical titles or explicit catalog identities compare.
  return [p.currency, p.condition || 'unknown', p.gtin ? `gtin:${p.gtin}` : words(p.title).join(' ')].join('|');
}
function normalizeProduct(raw, market, source, now) {
  const price = money(raw.price, market.country);
  const currency = raw.currency || market.currency;
  const url = canonicalUrl(raw.url);
  if (!raw.title || !(price > 0) || !url || currency !== market.currency || raw.available === false) return null;
  const shipping = raw.shipping == null ? null : money(raw.shipping, market.country);
  const rating = Number(raw.rating);
  const condition = raw.condition || (/\b(refurbished|renewed|used|pre-owned|open box)\b/i.test(raw.title) ? 'used' : 'unknown');
  return {
    ...raw, title: String(raw.title).trim().slice(0, 400), price, currency, country: market.country, url,
    platform: raw.platform || source.name, source: source.id, image: safeUrl(Array.isArray(raw.image) ? raw.image[0] : raw.image),
    rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : null,
    shipping, freeShipping: shipping === 0, trueCost: shipping === null ? null : Math.round((price + shipping) * 100) / 100,
    condition, fetchedAt: now, dealScore: null,
  };
}
function rankProducts(products, query) {
  const unique = new Map();
  for (const p of products) {
    const score = relevance(query, p.title);
    if (score < 0.6 || isAccessoryMismatch(query, p.title)) continue;
    const key = `${p.platform}|${p.url}`;
    const previous = unique.get(key);
    if (!previous || (previous.shipping == null && p.shipping != null)) unique.set(key, { ...p, relevance: score });
  }
  const listings = [...unique.values()];
  const groups = new Map();
  for (const p of listings) { const key = comparisonKey(p); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); }
  for (const group of groups.values()) {
    const known = group.filter(p => Number.isFinite(p.trueCost) && ['new', 'used'].includes(p.condition));
    if (new Set(known.map(p => p.platform)).size < 2) continue;
    const average = known.reduce((sum, p) => sum + p.trueCost, 0) / known.length;
    for (const p of known) {
      const ratio = p.trueCost / average;
      p.dealScore = ratio <= 0.8 ? 'S' : ratio <= 0.9 ? 'A' : ratio <= 1.05 ? 'B' : ratio <= 1.2 ? 'C' : 'F';
      p.comparisonCount = known.length;
      p.dealExplanation = `Compared with ${known.length} matching listings with known shipping; not a historical low.`;
    }
  }
  return listings.sort((a, b) => b.relevance - a.relevance || (a.trueCost ?? a.price) - (b.trueCost ?? b.price));
}
function optimizeBundle(queries, searches, currency) {
  const breakdown = queries.map((query, i) => {
    const allOptions = (searches[i]?.data || []).filter(p => p.currency === currency && p.price > 0 && relevance(query, p.title) === 1 && !isAccessoryMismatch(query, p.title) && p.condition !== 'used');
    const known = allOptions.filter(p => Number.isFinite(p.trueCost)).sort((a, b) => a.trueCost - b.trueCost);
    return { query, allOptions, cheapest: known[0] || null };
  });
  const complete = breakdown.every(b => b.cheapest);
  const platforms = [...new Set(breakdown.flatMap(b => b.allOptions.map(p => p.platform)))];
  const singleStoreOptions = platforms.map(platform => {
    const items = breakdown.map(b => b.allOptions.filter(p => p.platform === platform && Number.isFinite(p.trueCost)).sort((a, b) => a.trueCost - b.trueCost)[0]);
    return { platform, items, total: items.every(Boolean) ? items.reduce((s, p) => s + p.trueCost, 0) : null };
  }).filter(p => p.total !== null).sort((a, b) => a.total - b.total);
  return { breakdown, complete, mixedTotal: complete ? breakdown.reduce((s, b) => s + b.cheapest.trueCost, 0) : null, singleStoreOptions, currency };
}
module.exports = { money, safeUrl, canonicalUrl, words, relevance, isAccessoryMismatch, comparisonKey, normalizeProduct, rankProducts, optimizeBundle };
