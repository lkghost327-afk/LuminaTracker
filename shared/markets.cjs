const currencies = require('country-to-currency');

// Storefronts are selected by country; prices are never silently converted.
const AMAZON = { IN: 'amazon.in', US: 'amazon.com', GB: 'amazon.co.uk', CA: 'amazon.ca', AU: 'amazon.com.au', DE: 'amazon.de', FR: 'amazon.fr', IT: 'amazon.it', ES: 'amazon.es', JP: 'amazon.co.jp', BR: 'amazon.com.br', MX: 'amazon.com.mx', NL: 'amazon.nl', SE: 'amazon.se', PL: 'amazon.pl', SG: 'amazon.sg', AE: 'amazon.ae', SA: 'amazon.sa' };
const EBAY = { US: 'ebay.com', GB: 'ebay.co.uk', CA: 'ebay.ca', AU: 'ebay.com.au', DE: 'ebay.de', FR: 'ebay.fr', IT: 'ebay.it', ES: 'ebay.es' };
function countryCode(value) {
  const code = String(value || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !currencies[code]) throw new Error('Choose a valid country.');
  return code;
}
function marketFor(value) {
  const country = countryCode(value);
  const stores = [];
  if (AMAZON[country]) stores.push({ id: 'amazon', name: 'Amazon', origin: `https://www.${AMAZON[country]}`, path: '/s', param: 'k' });
  if (country === 'IN') stores.push(
    { id: 'flipkart', name: 'Flipkart', origin: 'https://www.flipkart.com', path: '/search', param: 'q' },
    { id: 'meesho', name: 'Meesho', origin: 'https://www.meesho.com', path: '/search', param: 'q' });
  if (EBAY[country]) stores.push({ id: 'ebay', name: 'eBay', origin: `https://www.${EBAY[country]}`, path: '/sch/i.html', param: '_nkw' });
  if (country === 'US') stores.push(
    { id: 'walmart', name: 'Walmart', origin: 'https://www.walmart.com', path: '/search', param: 'q' },
    { id: 'bestbuy', name: 'Best Buy', origin: 'https://www.bestbuy.com', path: '/site/searchpage.jsp', param: 'st' });
  return { country, currency: currencies[country], stores };
}
function searchUrl(store, query) {
  const url = new URL(store.path, store.origin);
  url.searchParams.set(store.param, query);
  if (store.id === 'ebay') { url.searchParams.set('LH_BIN', '1'); url.searchParams.set('LH_ItemCondition', '1000'); }
  return url.href;
}
function localeCountry(locale, timezone) {
  if (['Asia/Calcutta', 'Asia/Kolkata'].includes(timezone)) return 'IN';
  try { const region = new Intl.Locale(locale).region; if (region && currencies[region]) return region; } catch {}
  return null;
}
const countries = Object.keys(currencies).filter(code => /^[A-Z]{2}$/.test(code)).map(code => {
  let name = code;
  try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch {}
  return { code, name, currency: currencies[code] };
}).sort((a, b) => a.name.localeCompare(b.name));
module.exports = { marketFor, searchUrl, countryCode, localeCountry, countries };
