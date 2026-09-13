import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'vite';
import { deflateRawSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const { privacyPage } = require('../server/privacy.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argument = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const development = args.includes('--dev');
const store = args.includes('--store');
const apiInput = argument('--api-url') || process.env.LUMINA_API_URL || '';
const publisher = process.env.PUBLISHER_NAME || '';
const email = process.env.SUPPORT_EMAIL || '';
let apiBase = '';
if (apiInput) {
  const url = new URL(apiInput);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (!development && (url.protocol !== 'https:' || local || !url.hostname.includes('.') || /\.(test|invalid|example|local)$/.test(url.hostname) || /(^|\.)example\.(com|org|net)$/.test(url.hostname) || /^\d[\d.]+$/.test(url.hostname))) || (development && (!local || url.protocol !== 'http:'))) throw Error('Use a public HTTPS service origin, or --dev with an HTTP localhost origin.');
  apiBase = url.origin;
}
if (store) {
  if (development || !apiBase || !publisher.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Store packaging requires a production API URL, PUBLISHER_NAME and SUPPORT_EMAIL.');
  const response = await fetch(apiBase + '/health', { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const health = await response.json();
  if (!response.ok || health.app !== 'LuminaTracker API' || !health.configured) throw Error('The online service is not ready for store submission.');
  const policy = await fetch(apiBase + '/privacy', { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const html = await policy.text();
  if (!policy.ok || !html.includes(email)) throw Error('The deployed privacy page does not match SUPPORT_EMAIL.');
}
const outName = development ? 'standalone-extension-dev' : 'standalone-extension';
const out = path.join(root, 'release', outName);
await fs.mkdir(out, { recursive: true });
const manifest = JSON.parse((await fs.readFile(path.join(root, 'extension/manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
manifest.host_permissions = apiBase ? [apiBase + '/*'] : [];
manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'none'; connect-src https://ipapi.co" + (apiBase ? ' ' + apiBase : '') + ';';
if (development) manifest.name += ' (Development)';
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
const config = { apiBase, privacyUrl: apiBase ? apiBase + '/privacy' : '', development };
await fs.writeFile(path.join(out, 'config.js'), 'const LUMINA_CONFIG = Object.freeze(' + JSON.stringify(config) + ');\n');
const files = ['background.js', 'page-info.js', 'content.js', 'popup.html', 'popup.js', 'popup.css', 'icon.png'];
for (const file of files) await fs.copyFile(path.join(root, 'extension', file), path.join(out, file));
await fs.writeFile(path.join(out, 'privacy.html'), privacyPage(publisher || 'LuminaTracker (publisher details pending)', email || 'Support contact will be provided before publication.'));
await fs.writeFile(path.join(out, 'third-party-notices.txt'), 'country-to-currency\n\n' + await fs.readFile(path.join(root, 'node_modules/country-to-currency/LICENSE.txt'), 'utf8'));
await build({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: out, emptyOutDir: false, minify: false,
  lib: { entry: path.join(root, 'extension-src/core.js'), name: 'LuminaCore', formats: ['iife'], fileName: () => 'core.js' },
  commonjsOptions: { include: [/node_modules/, /shared/] } } });
// Deterministic ZIP with an explicit file list; no credentials or local profiles can enter it.
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
const names = [...files, 'manifest.json', 'config.js', 'core.js', 'privacy.html', 'third-party-notices.txt'].sort();
const entries = [], central = []; let offset = 0;
for (const file of names) {
  const raw = await fs.readFile(path.join(out, file)), packed = deflateRawSync(raw), name = Buffer.from(file), crc = crc32(raw);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(8, 10); record.writeUInt16LE(33, 14);
  record.writeUInt32LE(crc, 16); record.writeUInt32LE(packed.length, 20); record.writeUInt32LE(raw.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
  entries.push(header, name, packed); central.push(record, name); offset += header.length + name.length + packed.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const zip = path.join(root, 'release', 'LuminaTracker-' + outName + '.zip');
await fs.writeFile(zip, Buffer.concat([...entries, directory, end]));
console.log('Built ' + outName + ' (' + (apiBase || 'service not configured') + ').');
console.log('ZIP: ' + zip);
if (!apiBase) console.log('This preview cannot retrieve deals until a hosted API URL is configured.');
