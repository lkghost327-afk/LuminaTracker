import React, { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useCurrency } from '../components/CurrencyContext.jsx'
import { callApi, openExternal, onTrackerUpdate } from '../utils/api.js'
export default function TrackerPage() {
  const { formatPrice, currencyCode, country, config } = useCurrency()
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')
  const historyRequest = useRef(0)
  async function loadItems() { setItems(await callApi('getTrackedItems')) }
  useEffect(() => {
    loadItems().catch(e => setError(e.message))
    const off = onTrackerUpdate(setItems)
    const refresh = () => loadItems().catch(e => setError(e.message))
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 15000)
    return () => { off(); clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    const id = ++historyRequest.current
    setHistory([])
    if (selectedId) callApi('getPriceHistory', selectedId).then(data => { if (id === historyRequest.current) setHistory(data) }).catch(e => setError(e.message))
  }, [selectedId, items])
  async function add(event) {
    event.preventDefault(); setError(''); setAdding(true)
    try { await callApi('addTrackedItem', { query, targetPrice, country }); await loadItems(); setQuery(''); setTargetPrice(''); setMessage('Product added. Check deals to record the first price.') }
    catch (error) { setError(error.message) }
    finally { setAdding(false) }
  }
  async function remove(id) {
    try { await callApi('removeTrackedItem', id); if (selectedId === id) setSelectedId(null); await loadItems() }
    catch (error) { setError(error.message) }
  }
  async function check() {
    setBusy(true); setError(''); setMessage('Checking your tracked products…')
    try {
      const summary = await callApi('checkDealsNow')
      await loadItems()
      setMessage(`${summary.checked} checked · ${summary.found} prices refreshed · ${summary.failed} failed · ${summary.alerts} alerts`)
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  const selected = items.find(item => item.id === selectedId)
  const chartData = history.map(h => ({ ...h, date: new Date(h.recorded_at).toLocaleString(), total: h.totalKnown ? h.price : null, itemOnly: h.totalKnown ? null : h.itemPrice }))
  return <div>
    <div className="tracker-page__header"><div><h1 className="page-title">Price Tracker</h1><p className="page-subtitle">Watch exact listings or monitor a specific product search.</p></div><button className="search-bar__btn" disabled={busy || !items.some(i => !i.needsReview)} onClick={check}>{busy ? 'Checking…' : 'Check deals now'}</button></div>
    <p className="help-text">Checks every {config?.settings.checkInterval || 30} minutes while {config?.desktop ? 'the app is running, including in the system tray' : 'the local server is running'}. Alerts require a matching listing with known shipping. Taxes and checkout-only fees are not included.</p>
    <form className="tracker-form" onSubmit={add}><input aria-label="Product to track" placeholder="Exact product and size, e.g. Sony WH-1000XM5" value={query} onChange={e => setQuery(e.target.value)} maxLength={200} required /><input aria-label="Target price" placeholder={`Target total (${currencyCode || 'choose country'})`} value={targetPrice} onChange={e => setTargetPrice(e.target.value)} style={{ maxWidth: 220 }} type="number" min="0.01" step="0.01" /><button disabled={!country || adding}>{adding ? 'Saving…' : '+ Track'}</button></form>
    {error && <div className="notice notice--error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
    {!items.length && <div className="empty-state"><h2 className="empty-state__title">No tracked items yet</h2><p className="empty-state__subtitle">Track a listing from search results, or add a product above.</p></div>}
    {items.map(item => <div key={item.id} className="tracked-item" style={{ borderColor: selectedId === item.id ? '#888' : undefined }}>
      <button className="tracked-select" onClick={() => setSelectedId(item.id)}><strong className="tracked-item__query">{item.query}</strong><span className="tracked-item__target">{item.needsReview ? 'Legacy tracker: re-add with a country and target; old data is backed up.' : `${item.country} · ${item.currency} · ${item.url ? 'Exact listing' : 'Search monitor'} · ${item.target_price ? `Target ${formatPrice(item.target_price, item.currency)}` : 'No target'}`}</span>
        {item.lastChecked && <span className="help-text">Last check {new Date(item.lastChecked).toLocaleString()} · {item.message}</span>}
        {item.latestPrice != null && <span className="tracker-price">Last observed: {formatPrice(item.latestPrice, item.currency)}{!item.latestTotalKnown && ' + unknown delivery'}</span>}
      </button><div className="tracker-actions">{item.latestUrl && <button className="text-button" onClick={() => openExternal(item.latestUrl).catch(e => setError(e.message))}>View offer ↗</button>}<button className="tracked-item__remove" onClick={() => remove(item.id)}>Remove</button></div>
    </div>)}
    {selected && <div className="chart-container"><h3>Price history: {selected.query}</h3><p className="help-text">{history.length} observations · {selected.currency || 'Legacy item'} · Solid line: listed total; dotted line: item price when shipping is unknown.</p>
      {chartData.length ? <ResponsiveContainer width="100%" height={260}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="date" hide /><YAxis width={95} stroke="#aaa" tickFormatter={v => formatPrice(v, selected.currency)} /><Tooltip contentStyle={{ background: '#171717', border: '1px solid #444' }} formatter={(value, name) => [formatPrice(value, selected.currency), name]} /><Line name="With shipping" dataKey="total" stroke="#8ae6c1" connectNulls={false} dot /><Line name="Item price only" dataKey="itemOnly" stroke="#bbb" strokeDasharray="4 4" connectNulls={false} dot /></LineChart></ResponsiveContainer> : <p className="help-text">No verified observations yet. Use “Check deals now”.</p>}
    </div>}
  </div>
}
