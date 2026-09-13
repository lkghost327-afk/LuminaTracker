import React, { useState } from 'react'
import { callApi, openExternal } from '../utils/api.js'
import { useCurrency } from '../components/CurrencyContext.jsx'
export default function BundlePage() {
  const { country, formatPrice } = useCurrency()
  const [items, setItems] = useState(['', ''])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  async function optimize(event) {
    event.preventDefault(); setLoading(true); setResults(null); setError('')
    try { setResults(await callApi('optimizeBundle', { queries: items.map(q => q.trim()).filter(Boolean), country, refresh: true })) }
    catch (error) { setError(error.message) }
    finally { setLoading(false) }
  }
  const price = value => formatPrice(value, results?.currency)
  return <div><h1 className="page-title">Bundle Comparison</h1><p className="page-subtitle">Compare listed costs for 2–6 products in your region.</p>
    <p className="help-text">Use exact models and sizes. Totals include known shipping per listing. Combined shipping, checkout discounts and taxes are not assumed.</p>
    <div className="bundle-page__intro"><form onSubmit={optimize}><div className="bundle-items">{items.map((item, i) => <div key={i} className="bundle-input-row"><input aria-label={`Bundle item ${i + 1}`} placeholder={`Product ${i + 1}: model and size`} value={item} maxLength={200} disabled={loading} onChange={e => setItems(previous => previous.map((p, n) => n === i ? e.target.value : p))} />{items.length > 2 && <button type="button" className="bundle-remove-btn" disabled={loading} aria-label={`Remove item ${i + 1}`} onClick={() => setItems(previous => previous.filter((_, n) => n !== i))}>×</button>}</div>)}</div><div className="card-actions"><button className="sort-btn" type="button" disabled={items.length >= 6 || loading} onClick={() => setItems(previous => [...previous, ''])}>+ Add item</button><button className="search-bar__btn" disabled={!country || loading || items.filter(q => q.trim()).length < 2}>{loading ? 'Comparing stores…' : 'Compare bundle'}</button></div></form></div>
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    {results && <div className="bundle-results"><div className="bundle-result-card"><span className="product-card__platform">Lowest listed combination found</span><div className="bundle-total">{results.complete ? price(results.mixedTotal) : 'Incomplete bundle'}</div>{results.breakdown.map((row, i) => <div key={i} className="bundle-row"><strong>{row.query}</strong>{row.cheapest ? <button className="text-button" onClick={() => openExternal(row.cheapest.url).catch(e => setError(e.message))}>{price(row.cheapest.trueCost)} · {row.cheapest.platform} ↗</button> : <span className="help-text">{row.allOptions.length ? 'Shipping unknown — no reliable total' : 'No matching listing found'}</span>}</div>)}</div>
      {results.singleStoreOptions.slice(0, 3).map(option => <div key={option.platform} className="bundle-result-card"><span className="product-card__platform">All from {option.platform}</span><div className="bundle-total">{price(option.total)}</div>{option.items.map((item, i) => <div className="bundle-row" key={i}><span>{item.title}</span><button className="text-button" onClick={() => openExternal(item.url).catch(e => setError(e.message))}>{price(item.trueCost)} ↗</button></div>)}</div>)}
      {!results.singleStoreOptions.length && <div className="notice">No complete single-store total could be verified.</div>}
    </div>}
  </div>
}
