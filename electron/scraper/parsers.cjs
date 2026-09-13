const cheerio = require('cheerio');
const { money, safeUrl } = require('../../shared/deals.cjs');

function shippingFrom(text, country) {
  if (!text || /over |above |orders |prime|members|eligible|qualifying|minimum|first order/i.test(text)) return null;
  if (/free (?:shipping|delivery)|delivery free|kostenlos|livraison gratuite/i.test(text)) return 0;
  const match = text.match(/(?:[$€£₹]|Rs\.?|INR|USD|GBP|EUR)\s*[\d.,]+/i);
  return match ? money(match[0], country) : null;
}
function currencyFrom(text, fallback) {
  if (/₹|\bINR\b|\bRs\.?\s*\d/.test(text)) return 'INR';
  if (/US\s*\$|\bUSD\b/.test(text)) return 'USD';
  if (/CA\s*\$|C\$|\bCAD\b/.test(text)) return 'CAD';
  if (/AU\s*\$|A\$|\bAUD\b/.test(text)) return 'AUD';
  if (/€|\bEUR\b/.test(text)) return 'EUR';
  if (/£|\bGBP\b/.test(text)) return 'GBP';
  return fallback;
}
function structuredProducts($, market, store) {
  const products = [];
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 15) return;
    if (Array.isArray(value)) { value.slice(0, 200).forEach(v => visit(v, depth + 1)); return; }
    if ([].concat(value['@type'] || []).includes('Product') && value.offers) {
      for (const offer of [].concat(value.offers)) {
        if (offer.price == null || !value.name) continue;
        const detail = [].concat(offer.shippingDetails || [])[0];
        const shipping = detail?.shippingRate?.currency === (offer.priceCurrency || market.currency) ? money(detail.shippingRate.value, market.country) : null;
        products.push({ title: value.name, price: typeof offer.price === 'string' && /^\d+(\.\d+)?$/.test(offer.price) ? Number(offer.price) : money(offer.price, market.country), currency: offer.priceCurrency || market.currency,
          url: safeUrl(offer.url || value.url || '', store.origin), image: typeof value.image === 'object' && !Array.isArray(value.image) ? value.image.url : value.image,
          rating: value.aggregateRating?.ratingValue, shipping, gtin: value.gtin13 || value.gtin12 || value.gtin,
          available: !/OutOfStock|SoldOut|Discontinued|PreOrder/i.test(offer.availability || ''),
          condition: /NewCondition/.test(offer.itemCondition || '') ? 'new' : /Used|Refurbished/.test(offer.itemCondition || '') ? 'used' : undefined });
      }
    }
    Object.values(value).forEach(v => { if (typeof v === 'object') visit(v, depth + 1); });
  }
  $('script[type="application/ld+json"]').each((_, el) => { try { visit(JSON.parse($(el).html())); } catch {} });
  return products.filter(p => p.url && p.price > 0);
}
function parsePage(html, market, store) {
  const $ = cheerio.load(html);
  const products = structuredProducts($, market, store);
  const add = (el, fields) => {
    const card = $(el);
    const title = fields.title || '';
    const price = money(fields.priceText, market.country);
    const link = safeUrl(fields.link || '', store.origin);
    if (!title || !price || !link || !fields.link || /Shop on eBay/i.test(title)) return;
    if (new URL(link).hostname !== new URL(store.origin).hostname) return;
    products.push({ title: title.replace(/\s+/g, ' ').trim(), price, url: link,
      currency: currencyFrom(fields.priceText, market.currency), image: fields.image || card.find('img').first().attr('src') || '',
      shipping: shippingFrom(fields.shippingText, market.country), rating: parseFloat(String(fields.rating || '').replace(',', '.')),
      condition: fields.condition, available: !/currently unavailable|out of stock|sold out/i.test(fields.availability || '') });
  };
  if (store.id === 'amazon') {
    $('[data-component-type="s-search-result"]').slice(0, 30).each((_, el) => {
      const card = $(el);
      const priceElement = card.find('.a-price').not('.a-text-price').first();
      const whole = priceElement.find('.a-price-whole').text().replace(/[.,\s]+$/, '');
      const fraction = priceElement.find('.a-price-fraction').text();
      const decimal = ['DE', 'FR', 'IT', 'ES', 'BR', 'NL', 'SE', 'PL'].includes(market.country) ? ',' : '.';
      const asin = card.attr('data-asin');
      add(el, { title: card.find('h2').map((_, heading) => $(heading).text().trim()).get().join(' '), priceText: priceElement.find('.a-offscreen').first().text() || `${whole}${fraction ? decimal + fraction : ''}`,
        link: /^[A-Z0-9]{10}$/i.test(asin || '') ? `/dp/${asin}` : card.find('a:has(h2), h2 a, a.a-link-normal.s-no-outline').first().attr('href'), image: card.find('img.s-image').attr('src'), rating: card.find('.a-icon-alt').first().text(),
        shippingText: card.find('[data-cy="delivery-recipe"], [data-cy="delivery-block"]').text() });
    });
  } else if (store.id === 'flipkart') {
    $('[data-id]').slice(0, 50).each((_, el) => {
      const card = $(el);
      const link = card.find('a[href*="/p/"]').first();
      add(el, { title: card.find('.KzDlHZ, ._4rR01T, .s1Q9rs, .wjcEIp').first().text() || card.find('a[title]').first().attr('title') || link.find('img').attr('alt'),
        link: link.attr('href'), priceText: card.find('.Nx9bqj, ._30jeq3').first().text(),
        rating: card.find('.XQDdHH, ._3LWZlK').first().text(), shippingText: card.find('[class*="delivery"]').text() });
    });
  } else if (store.id === 'meesho') {
    $('a[href*="/p/"]').slice(0, 50).each((_, el) => {
      const card = $(el);
      add(el, { title: card.find('p, h4').first().text() || card.find('img').attr('alt'), link: card.attr('href'),
        priceText: card.find('h5, [class*="Price"]').first().text(), shippingText: card.find('[class*="Shipping"], [class*="Delivery"]').text() });
    });
  } else if (store.id === 'ebay') {
    $('.s-item, .s-card').slice(0, 50).each((_, el) => {
      const card = $(el);
      add(el, { title: card.find('.s-item__title, .s-card__title').first().text(), priceText: card.find('.s-item__price, .s-card__price').first().text(),
        link: card.find('a[href*="/itm/"]').first().attr('href'), image: card.find('img').first().attr('src'), shippingText: card.find('.s-item__shipping, .s-card__logistics').first().text(),
        condition: /brand new|new with|new without/i.test(card.find('.SECONDARY_INFO, .s-card__subtitle').text()) ? 'new' : undefined });
    });
  } else if (store.id === 'walmart') {
    $('[data-item-id]').slice(0, 40).each((_, el) => {
      const card = $(el);
      add(el, { title: card.find('[data-automation-id="product-title"]').first().text(),
        priceText: card.find('[itemprop="price"]').attr('content') || card.find('[data-automation-id="product-price"] .w_iUH7').first().text().replace(/^current price\s*/i, ''),
        link: card.find('a[href*="/ip/"]').first().attr('href'), shippingText: card.find('[data-automation-id="fulfillment-badge"]').text() });
    });
  } else if (store.id === 'bestbuy') {
    $('.sku-item, .product-list-item').slice(0, 40).each((_, el) => {
      const card = $(el);
      add(el, { title: card.find('.sku-title a, .product-title').first().text(), priceText: card.find('.priceView-customer-price span, [data-testid="customer-price"]').first().text(),
        link: card.find('.sku-title a, a[href*=".p?skuId="]').first().attr('href'), shippingText: card.find('.fulfillment-shipping-text').text() });
    });
  }
  return products;
}
function parseDetail(html, market, store, url) {
  const $ = cheerio.load(html);
  if (store.id !== 'amazon') return structuredProducts($, market, store);
  const title = $('#productTitle').text().trim();
  const availability = $('#availability').text();
  const priceText = $('#corePriceDisplay_desktop_feature_div .a-price').not('.a-text-price').first().find('.a-offscreen').first().text()
    || $('#corePrice_feature_div .a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice').first().text();
  if (!title || !priceText || /currently unavailable|out of stock|temporarily unavailable/i.test(availability)) return [];
  return [{ title, price: money(priceText, market.country), currency: currencyFrom(priceText, market.currency), url,
    shipping: shippingFrom($('#mir-layout-DELIVERY_BLOCK').text(), market.country),
    image: $('#landingImage').attr('src'), rating: parseFloat($('#acrPopover').attr('title')) }];
}
module.exports = { parsePage, parseDetail, shippingFrom, currencyFrom };
