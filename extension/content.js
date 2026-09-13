(() => {
  if (globalThis.__luminaContent) return;
  globalThis.__luminaContent = true;
  let lastSignature = '';
  let timer;
  let widget;
  let generation = 0;
  const send = message => chrome.runtime.sendMessage(message);
  const format = (amount, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  function render(result) {
    widget?.remove();
    if (!result.offers?.length) return;
    widget = document.createElement('div');
    widget.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:calc(100vw - 40px)';
    const shadow = widget.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}.box{font:13px/1.5 system-ui,sans-serif;background:#111b19;color:#f2fff9;padding:18px;width:300px;max-width:calc(100vw - 76px);border:1px solid #5a8b78;border-radius:16px;box-shadow:0 8px 35px #0005}h2{font-size:16px;margin:2px 25px 10px 0}p{color:#b7cfc4;font-size:12px;margin:8px 0}a{color:#a9f0d2;text-decoration:none;display:block;padding:8px 0;border-top:1px solid #ffffff20}a:hover{text-decoration:underline}button{float:right;border:0;background:none;color:#eee;cursor:pointer;font-size:19px}small{font-size:11px;color:#acc0b6}';
    const box = document.createElement('section'); box.className = 'box'; box.setAttribute('aria-label', 'LuminaTracker offers');
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss LuminaTracker'); close.onclick = () => widget.remove(); box.append(close);
    const heading = document.createElement('h2');
    const cheaper = result.offers.filter(p => p.saving > 0);
    heading.textContent = cheaper.length ? 'Lower listed totals found' : 'Offers on other stores'; box.append(heading);
    const note = document.createElement('p'); note.textContent = `LuminaTracker · ${result.market.country} · ${result.market.currency}`; box.append(note);
    for (const offer of result.offers.slice(0, 3)) {
      try { if (new URL(offer.url).protocol !== 'https:') continue; } catch { continue; }
      const link = document.createElement('a'); link.href = offer.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `${offer.platform}: ${format(offer.trueCost ?? offer.price, offer.currency)}${offer.trueCost == null ? ' + delivery' : ''}${offer.saving ? ` · save ${format(offer.saving, offer.currency)}` : ''} ↗`;
      link.title = offer.title; box.append(link);
    }
    const footer = document.createElement('small'); footer.textContent = 'Confirm model, variant and checkout charges. More details in the extension toolbar.'; box.append(footer);
    shadow.append(style, box); document.documentElement.append(widget);
  }
  async function scan() {
    let page;
    try { page = LuminaPage.detect(document, location.href); } catch { return; }
    if (!page) { widget?.remove(); lastSignature = ''; generation++; return; }
    const signature = JSON.stringify([location.href, page.query]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const currentGeneration = ++generation;
    widget?.remove();
    try {
      const { result: settings } = await send({ type: 'settings' });
      if (!settings?.enabled || !settings.automatic || !settings.configured) return;
      const response = await send({ type: 'compare', ...page, locale: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (currentGeneration === generation && response.result) render(response.result);
    } catch { /* Automatic checks stay quiet when the online service is unavailable. */ }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'page-info') { try { reply(LuminaPage.detect(document, location.href)); } catch { reply(null); } }
  });
  const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = null; scan(); }, 1200); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearTimeout(timer); });
  scan();
})();
