const path = require('node:path');
const { createDatabase } = require('./database.cjs');
const { createService } = require('./service.cjs');
module.exports = function liveApi() {
  function configure(server) {
    const db = createDatabase(path.join(__dirname, '..', '.lumina-dev', 'data.json'), {
      encrypt() { throw new Error('Save your provider key in the desktop app, where Windows encrypts it.'); },
    });
    const service = createService(db);
    service.start();
    server.httpServer?.once('close', () => service.stop());
    server.middlewares.use('/api/lumina', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.method !== 'POST' || !/^application\/json\b/.test(req.headers['content-type'] || '')) throw new Error('POST JSON requests only.');
        const host = req.headers.host || '';
        if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) throw new Error('Local application requests only.');
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 16384) throw new Error('Request too large.'); }
        const { method, input } = JSON.parse(body);
        const allowed = ['getConfig', 'updateSettings', 'searchProducts', 'optimizeBundle', 'getTrackedItems', 'addTrackedItem', 'removeTrackedItem', 'getPriceHistory', 'checkDealsNow'];
        if (!allowed.includes(method)) throw new Error('Unknown operation.');
        if (method === 'searchProducts') {
          res.setHeader('Content-Type', 'application/x-ndjson');
          const result = await service.searchProducts(input, result => { if (!res.destroyed) res.write(JSON.stringify({ progress: result }) + '\n'); });
          res.end(JSON.stringify({ result }) + '\n');
        } else res.end(JSON.stringify({ result: await service[method](input) }));
      } catch (error) {
        if (!res.headersSent) res.statusCode = 400;
        res.end(JSON.stringify({ error: error.message }) + '\n');
      }
    });
  }
  return { name: 'lumina-live-api', configureServer: configure, configurePreviewServer: configure };
};
