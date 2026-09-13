const axios = require('axios');
let customFetch;
function setFetch(fetcher) { customFetch = fetcher; }
async function request(url, { signal, json = false } = {}) {
  const abort = AbortSignal.any([AbortSignal.timeout(18000), ...(signal ? [signal] : [])]);
  let body;
  let status;
  if (customFetch) {
    const response = await customFetch(url, { signal: abort, headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
    status = response.status;
    if (response.ok) body = json ? await response.json() : await response.text();
  } else {
    const response = await axios.get(url, { signal: abort, timeout: 18000, maxContentLength: 12 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
      validateStatus: () => true, responseType: json ? 'json' : 'text' });
    status = response.status; body = response.data;
  }
  if ([401, 403, 429, 503].includes(status)) throw Object.assign(new Error('Store blocked automated access or is temporarily unavailable. Open the store to check directly.'), { code: 'blocked' });
  if (status < 200 || status >= 300) throw Object.assign(new Error(`Store returned HTTP ${status}.`), { code: 'unavailable' });
  if (!json && /captcha|robot check|automated access|verify you are human|bm-verify|press & hold|access denied|pardon our interruption/i.test(body)) {
    throw Object.assign(new Error('Store requires browser verification. Open the store to check directly.'), { code: 'blocked' });
  }
  return body;
}
module.exports = { request, setFetch };
