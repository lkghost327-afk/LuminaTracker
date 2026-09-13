const { createServer } = require('./app.cjs');
function integer(name, fallback, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error('Invalid ' + name);
  return value;
}
const production = process.env.NODE_ENV === 'production';
const server = createServer({ production, apiKey: process.env.SERPAPI_KEY || '',
  extensionIds: (process.env.ALLOWED_EXTENSION_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  proxyHops: integer('TRUST_PROXY_HOPS', 0, 5), dailyLimit: integer('DAILY_SEARCH_LIMIT', 100, 100000),
  perMinute: integer('SEARCHES_PER_MINUTE', 12, 1000), maxConcurrent: integer('MAX_CONCURRENT_SEARCHES', 4, 20),
  publisher: process.env.PUBLISHER_NAME || '', supportEmail: process.env.SUPPORT_URL || process.env.SUPPORT_EMAIL || '' });
server.listen(integer('PORT', 8787, 65535), production ? '0.0.0.0' : '127.0.0.1', () => console.log('LuminaTracker API listening on port ' + server.address().port));
const close = () => { server.close(); setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 22000).unref(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
