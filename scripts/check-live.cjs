const fs = require('node:fs');
const path = require('node:path');
const { search } = require('../electron/scraper/index.cjs');
const country = process.argv[2] || 'IN';
const query = process.argv.slice(3).join(' ') || 'Sony WH-1000XM5';
search(query, { country, refresh: true, onProgress: result => {
  const last = result.sources.at(-1);
  console.log(`${last.name}: ${last.status} (${last.count} listings)`);
} }).then(result => {
  const report = { checkedAt: result.checkedAt, country, query, sources: result.sources, listings: result.data.slice(0, 5) };
  fs.mkdirSync(path.join(__dirname, '..', 'tmp'), { recursive: true });
  const filename = `live-check-${country}.json`;
  fs.writeFileSync(path.join(__dirname, '..', 'tmp', filename), JSON.stringify(report, null, 2));
  console.log(`${result.data.length} live listings. Report: tmp/${filename}`);
  if (!result.data.length) process.exitCode = 2;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
