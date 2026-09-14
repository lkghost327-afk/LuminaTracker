const http = require('node:http');
const { isIP } = require('node:net');
const { randomUUID } = require('node:crypto');
const { createSearchEngine } = require('../electron/scraper/index.cjs');
const { marketFor } = require('../shared/markets.cjs');
const { privacyPage } = require('./privacy.cjs');

function createServer({ engine = createSearchEngine(), apiKey = '', extensionIds = [], production = false,
  proxyHops = 0, perMinute = 12, dailyLimit = 100, maxConcurrent = 4, now = Date.now,
  publisher = '', supportEmail = '', responseWaitMs = 8000, jobTtlMs = 180000 } = {}) {
  const allowed = new Set(extensionIds);
  if (extensionIds.some(id => !/^[a-p]{32}$/.test(id))) throw new Error('Invalid extension ID configuration.');
  const clients = new Map();
  const jobs = new Map();
  let busy = 0, day = '', used = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    const respond = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    if (req.method === 'GET' && req.url === '/health') return respond(200, { app: 'LuminaTracker API', version: 1, configured: !production || Boolean(allowed.size && publisher && supportEmail) });
    if (req.method === 'GET' && req.url === '/privacy') {
      if (!publisher || !supportEmail) return respond(503, { error: 'The publisher has not completed the privacy contact information.' });
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(privacyPage(publisher, supportEmail)); return;
    }
    const origin = req.headers.origin || '';
    const match = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
    if (!match || (production && !allowed.has(match[1]))) return respond(403, { error: 'This extension is not enabled on the deal service.' });
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    const time = now();
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(ip => ip.trim()).filter(ip => isIP(ip));
    const ip = proxyHops > 0 && forwarded.length >= proxyHops ? forwarded[forwarded.length - proxyHops] : req.socket.remoteAddress;
    for (const [key, job] of jobs) if (time >= job.expires) jobs.delete(key);
    const poll = req.url.match(/^\/v1\/search\/([a-f0-9-]{36})$/);
    if (poll && req.method === 'GET') {
      const job = jobs.get(poll[1]);
      if (!job || job.origin !== origin || job.ip !== ip) return respond(404, { error: 'This comparison expired. Please search again.' });
      return job.output ? respond(job.output.status, job.output.body) : respond(202, { pending: true, jobId: poll[1] });
    }
    if (req.url !== '/v1/search') return respond(404, { error: 'Unknown operation.' });
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.statusCode = 204; res.end(); return;
    }
    if (req.method !== 'POST') return respond(405, { error: 'POST required.' });
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return respond(415, { error: 'JSON required.' });
    let input;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 4096) { respond(413, { error: 'Request too large.' }); return; } chunks.push(chunk); }
      input = JSON.parse(Buffer.concat(chunks).toString());
      if (!input || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200 || /[\u0000-\u001f]/.test(input.query)) throw new Error();
      if (Object.keys(input).some(key => !['query', 'country'].includes(key))) throw new Error();
      input = { query: input.query.trim(), country: marketFor(input.country).country };
    } catch { return respond(400, { error: 'Provide a product name up to 200 characters and a valid country.' }); }
    const currentDay = new Date(time).toISOString().slice(0, 10);
    if (currentDay !== day) { day = currentDay; used = 0; }
    for (const [key, value] of clients) if (time - value.since >= 60000) clients.delete(key);
    const client = clients.get(ip) || { since: time, count: 0 };
    if (busy >= maxConcurrent || jobs.size >= 200 || client.count >= perMinute || used >= dailyLimit || (!clients.has(ip) && clients.size >= 10000)) {
      res.setHeader('Retry-After', used >= dailyLimit ? '3600' : '60');
      return respond(429, { error: used >= dailyLimit ? 'The deal service has reached its daily search limit. Please try again later.' : 'Too many comparisons. Please wait a minute.' });
    }
    client.count++; clients.set(ip, client); used++; busy++;
    const jobId = randomUUID();
    const job = { origin, ip, expires: time + jobTtlMs, output: null };
    jobs.set(jobId, job);
    const work = Promise.resolve().then(() => engine.search(input.query, { country: input.country, apiKey }))
      .then(result => ({ status: 200, body: { ...result, data: result.data.slice(0, 60) } }))
      .catch(() => ({ status: 502, body: { error: 'Price sources are unavailable. Please try again shortly.' } }))
      .then(output => { job.output = output; busy--; return output; });
    let waitTimer;
    const output = await Promise.race([work, new Promise(resolve => { waitTimer = setTimeout(() => resolve(null), responseWaitMs); })]);
    clearTimeout(waitTimer);
    if (output) { jobs.delete(jobId); respond(output.status, output.body); }
    else respond(202, { pending: true, jobId });
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return server;
}
module.exports = { createServer };
