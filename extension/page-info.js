/* Shared, dependency-free page extraction. All DOM data is untrusted. */
(() => {
  const domains = {
    'amazon.in': ['Amazon', 'INR'], 'amazon.com': ['Amazon', 'USD'], 'amazon.co.uk': ['Amazon', 'GBP'],
    'amazon.ca': ['Amazon', 'CAD'], 'amazon.com.au': ['Amazon', 'AUD'], 'amazon.de': ['Amazon', 'EUR'],
    'amazon.fr': ['Amazon', 'EUR'], 'amazon.it': ['Amazon', 'EUR'], 'amazon.es': ['Amazon', 'EUR'],
    'amazon.co.jp': ['Amazon', 'JPY'], 'amazon.com.br': ['Amazon', 'BRL'], 'amazon.com.mx': ['Amazon', 'MXN'],
    'amazon.nl': ['Amazon', 'EUR'], 'amazon.se': ['Amazon', 'SEK'], 'amazon.pl': ['Amazon', 'PLN'],
    'amazon.sg': ['Amazon', 'SGD'], 'amazon.ae': ['Amazon', 'AED'], 'amazon.sa': ['Amazon', 'SAR'],
    'flipkart.com': ['Flipkart', 'INR'], 'meesho.com': ['Meesho', 'INR'], 'ebay.com': ['eBay', 'USD'],
    'ebay.co.uk': ['eBay', 'GBP'], 'ebay.ca': ['eBay', 'CAD'], 'ebay.com.au': ['eBay', 'AUD'],
    'ebay.de': ['eBay', 'EUR'], 'ebay.fr': ['eBay', 'EUR'], 'ebay.it': ['eBay', 'EUR'], 'ebay.es': ['eBay', 'EUR'],
    'walmart.com': ['Walmart', 'USD'], 'bestbuy.com': ['Best Buy', 'USD'],
  };
  function storeFor(value) {
    try { const url = new URL(value); if (url.protocol !== 'https:') return null; return Object.entries(domains).find(([domain]) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))?.[1] || null; } catch { return null; }
  }
  function schemaProducts(value, result = [], depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12 || result.length > 30) return result;
    if ([].concat(value['@type'] || []).includes('Product')) result.push(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') schemaProducts(child, result, depth + 1);
    return result;
  }
  function amount(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  function detect(doc, value) {
    const store = storeFor(value);
    if (!store) return null;
    const url = new URL(value);
    const detail = /\/(?:dp|gp\/product|p|itm|ip)\/|\.p(?:$|\?)/i.test(url.pathname + url.search);
    if (!detail) {
      if (!/\/s$|\/search|\/sch\//.test(url.pathname)) return null;
      const query = ['k', 'q', '_nkw', 'st'].map(p => url.searchParams.get(p)).find(Boolean)?.trim();
      return query ? { query: query.slice(0, 200), current: { title: query, url: url.origin + url.pathname, platform: store[0], currency: store[1], price: null, shipping: null, condition: 'unknown' }, kind: 'search' } : null;
    }
    const candidates = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      if (script.textContent.length > 500000) continue;
      try { schemaProducts(JSON.parse(script.textContent), candidates); } catch {}
    }
    const heading = doc.querySelector('#productTitle, h1')?.textContent.replace(/\s+/g, ' ').trim();
    const product = candidates.find(p => { try { return p.url && new URL(p.url, url).pathname === url.pathname; } catch { return false; } }) || candidates.find(p => p.name === heading) || (candidates.length === 1 ? candidates[0] : null);
    const title = (heading || product?.name || '').trim();
    if (!title) return null;
    const offers = [].concat(product?.offers || []);
    // Multiple variants need a checkout selection; do not guess a current price.
    const offer = offers.length === 1 ? offers[0] : {};
    const currency = offer.priceCurrency || doc.querySelector('meta[property="product:price:currency"]')?.content || store[1];
    const price = amount(offer.price ?? doc.querySelector('meta[property="product:price:amount"], meta[itemprop="price"]')?.content);
    const details = [].concat(offer.shippingDetails || []);
    const rate = details.length === 1 ? details[0].shippingRate : null;
    const shipping = rate?.currency === currency ? amount(rate.value) : null;
    const condition = /NewCondition/.test(offer.itemCondition || '') ? 'new' : /Used|Refurbished/.test(offer.itemCondition || '') ? 'used' : 'unknown';
    return { query: title.slice(0, 200), kind: 'product', current: { title: title.slice(0, 400), url: url.origin + url.pathname, platform: store[0], currency, price, shipping, condition, gtin: product?.gtin13 || product?.gtin12 || product?.gtin } };
  }
  globalThis.LuminaPage = { storeFor, schemaProducts, amount, detect };
})();
