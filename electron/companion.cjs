const http = require('node:http');
const fs = require('node:fs');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { safeUrl } = require('../shared/deals.cjs');
const { compareOffers } = require('../shared/comparison.cjs');
const PORT = 38467;
function getPairingToken(file, storage) {
  if (!storage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
  if (fs.existsSync(file)) {
    try { return storage.decryptString(Buffer.from(fs.readFileSync(file, 'utf8'), 'base64')); }
    catch { throw new Error('The saved browser pairing key could not be decrypted.'); }
  }
  const token = randomBytes(32).toString('hex');
  fs.writeFileSync(file, storage.encryptString(token).toString('base64'), { mode: 0o600 });
  return token;
}
function createCompanion(service, { token, port = PORT } = {}) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('Invalid companion token.');
  const expected = Buffer.from(token);
  let busy = 0;
  let requests = [];
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const respond = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const address = server.address();
    if (req.headers.host !== `127.0.0.1:${address?.port}` || origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return respond(403, { error: 'Extension access only.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return respond(204, {});
    }
    const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return respond(401, { error: 'Pair the extension using the code in LuminaTracker Settings.' });
    if (req.method === 'GET' && req.url === '/status') return respond(200, { app: 'LuminaTracker', version: 1 });
    if (req.method !== 'POST' || req.url !== '/compare') return respond(404, { error: 'Unknown companion operation.' });
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return respond(415, { error: 'JSON required.' });
    requests = requests.filter(t => Date.now() - t < 60000);
    if (busy >= 2 || requests.length >= 12) return respond(429, { error: 'Too many comparisons. Wait a moment before trying again.' });
    requests.push(Date.now()); busy++;
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 12000) throw new Error('Comparison request too large.'); }
      const input = JSON.parse(body);
      if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200) throw new Error('Enter a product name up to 200 characters.');
      const config = await service.getConfig({ locale: String(input.locale || '').slice(0, 40), timezone: String(input.timezone || '').slice(0, 80) });
      if (!config.market) throw new Error('Choose your country in the desktop app Settings.');
      const result = await service.searchProducts({ query: input.query, country: config.market.country });
      const c = input.current || {};
      const current = { title: typeof c.title === 'string' ? c.title.slice(0, 400) : '', url: safeUrl(c.url),
        platform: String(c.platform || '').slice(0, 80), currency: c.currency, condition: c.condition, price: c.price, shipping: c.shipping, gtin: c.gtin };
      respond(200, compareOffers(result, current));
    } catch (error) { respond(400, { error: error.message }); }
    finally { busy--; }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return {
    start: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server.address().port)); }),
    stop: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}
module.exports = { createCompanion, getPairingToken, compareOffers, PORT };
