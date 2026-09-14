const element = id => document.getElementById(id);
let page = null;
let searchGeneration = 0;
const send = async message => { const response = await chrome.runtime.sendMessage(message); if (response?.error) throw new Error(response.error); return response?.result; };
const status = text => { element('status').textContent = text; };
const format = (amount, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
async function refresh() {
  const settings = await send({ type: 'settings' });
  element('setup').hidden = settings.configured;
  element('consent').hidden = settings.enabled || !settings.configured;
  element('compare').disabled = !settings.enabled || !settings.configured;
  element('automatic').disabled = !settings.enabled;
  element('automatic').checked = settings.automatic;
  element('ip-detection').checked = settings.ipDetection;
  element('disable').hidden = !settings.enabled;
  const select = element('country');
  if (select.options.length === 1) for (const country of settings.countries) { const option = document.createElement('option'); option.value = country.code; option.textContent = country.name + ' · ' + country.currency; select.append(option); }
  select.value = settings.country;
  element('region').textContent = settings.market ? settings.market.country + ' · ' + settings.market.currency + ' · ' + settings.locationSource : 'Choose your shopping country';
  if (settings.privacyUrl) element('privacy').href = settings.privacyUrl;
}
async function readPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !LuminaPage.storeFor(tab.url)) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page-info.js', 'content.js'] });
    page = await chrome.tabs.sendMessage(tab.id, { type: 'page-info' });
    if (page) { element('query').value = page.query; element('page-note').textContent = 'Viewing ' + page.current.platform + '. Enter an exact model for closer matches.'; }
  } catch { element('page-note').textContent = 'Enter a product name, or open a supported shopping page.'; }
}
function render(result) {
  const root = element('results'); root.replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = result.offers.length + ' other-store offers · ' + result.market.currency; root.append(heading);
  const note = document.createElement('p'); note.className = 'muted'; note.textContent = (result.cached ? 'Cached ' : 'Retrieved ') + new Date(result.checkedAt).toLocaleTimeString() + '. ' + result.message; root.append(note);
  for (const offer of result.offers) {
    try { if (new URL(offer.url).protocol !== 'https:') continue; } catch { continue; }
    const article = document.createElement('article');
    const name = document.createElement('h3'); name.textContent = offer.title; article.append(name);
    const price = document.createElement('strong'); price.textContent = format(offer.trueCost ?? offer.price, offer.currency) + (offer.trueCost == null ? ' + unknown delivery' : ' with listed delivery'); article.append(price);
    if (offer.saving > 0) { const saving = document.createElement('p'); saving.textContent = 'Lower listed total by ' + format(offer.saving, offer.currency); article.append(saving); }
    const link = document.createElement('a'); link.href = offer.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'View ' + offer.platform + ' offer ↗'; article.append(document.createElement('br'), link); root.append(article);
  }
  const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Store availability'; details.append(summary);
  for (const source of result.sources) { const p = document.createElement('p'); p.textContent = source.name + ': ' + source.status + ' — ' + source.message; details.append(p); } root.append(details);
}
async function preferences(values) { searchGeneration++; element('results').replaceChildren(); await send({ type: 'preferences', values }); await refresh(); }
const action = task => async () => { try { await task(); } catch (error) { status(error.message); await refresh().catch(() => {}); } };
element('enable').addEventListener('click', action(async () => { await preferences({ enabled: true }); status('Ready. No desktop app needed.'); }));
element('disable').addEventListener('click', action(async () => { await preferences({ enabled: false }); status('Comparisons disabled.'); }));
element('reset').addEventListener('click', action(async () => { searchGeneration++; await send({ type: 'reset' }); element('results').replaceChildren(); await refresh(); status('Local preferences cleared.'); }));
element('country').addEventListener('change', action(async () => { await preferences({ country: element('country').value }); status('Country updated.'); }));
element('ip-detection').addEventListener('change', action(async () => {
  const enabled = element('ip-detection').checked;
  if (enabled && !await chrome.permissions.request({ origins: ['https://ipapi.co/*'] })) { element('ip-detection').checked = false; return; }
  await preferences({ ipDetection: enabled }); status('Country detection updated.');
}));
element('automatic').addEventListener('change', action(async () => {
  const enabled = element('automatic').checked;
  if (enabled && !await chrome.permissions.request({ origins: chrome.runtime.getManifest().optional_host_permissions.filter(host => host !== 'https://ipapi.co/*') })) { element('automatic').checked = false; return; }
  await preferences({ automatic: enabled }); status(enabled ? 'Automatic comparisons enabled. Reload existing shopping tabs.' : 'Automatic comparisons disabled.');
}));
element('search-form').addEventListener('submit', async event => {
  event.preventDefault(); element('compare').disabled = true; element('results').replaceChildren(); status('Checking stores in your region… Some searches can take up to two minutes.');
  const generation = ++searchGeneration;
  try { const query = element('query').value.trim(); const result = await send({ type: 'compare', query, current: query === page?.query ? page.current : {} }); if (generation === searchGeneration) { render(result); status(''); } }
  catch (error) { if (generation === searchGeneration) status(error.message); }
  finally { await refresh().catch(() => {}); }
});
refresh().then(readPage).catch(error => status(error.message));
