const desktop = () => window.lumina;
export async function callApi(method, input, { onProgress, signal } = {}) {
  if (desktop()) {
    const requestId = crypto.randomUUID();
    const unsubscribe = method === 'searchProducts' && onProgress
      ? desktop().onSearchProgress(event => { if (event.requestId === requestId && !signal?.aborted) onProgress(event.result); }) : () => {};
    try {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      return await desktop()[method](method === 'searchProducts' ? { ...input, requestId } : input);
    } finally { unsubscribe(); }
  }
  let response;
  try {
    response = await fetch('/api/lumina', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, input }), signal: AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('The local search service is unavailable. Start LuminaTracker with npm run electron:dev or npm run dev.');
  }
  if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', result;
    const consume = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      if (event.progress) onProgress?.(event.progress);
      if (event.result) result = event.result;
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(consume);
      }
      buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
    } finally { reader.releaseLock(); }
    if (!result) throw new Error('Search ended before all sources responded. Try again.');
    return result;
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Open the desktop app or start the local development server to use live search.');
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
export const searchProducts = (query, options = {}) => {
  const { onProgress, signal, ...input } = options;
  return callApi('searchProducts', { query, ...input }, { onProgress, signal });
};
export const openExternal = async url => {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Invalid product link.');
  if (desktop()) await desktop().openExternal(target.href);
  else window.open(target.href, '_blank', 'noopener,noreferrer');
};
export const onTrackerUpdate = callback => desktop()?.onTrackerUpdate(callback) || (() => {});
