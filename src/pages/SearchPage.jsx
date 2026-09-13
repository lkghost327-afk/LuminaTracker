import React, { useState, useRef, useEffect } from 'react'
import ProductCard from '../components/ProductCard.jsx'
import { searchProducts, openExternal } from '../utils/api.js'
import { useCurrency } from '../components/CurrencyContext.jsx'
export default function SearchPage() {
  const { country, currencyCode, config, loading: locating, error: configError, refreshConfig } = useCurrency()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('relevance')
  const [platform, setPlatform] = useState('All')
  const [view, setView] = useState('grid')
  const request = useRef(0)
  const abort = useRef()
  useEffect(() => () => { request.current++; abort.current?.abort() }, [])
  async function runSearch(event, refresh = false) {
    event?.preventDefault()
    if (!query.trim() || !country) return
    const id = ++request.current
    abort.current?.abort(); abort.current = new AbortController()
    setLoading(true); setError(''); setResult(null); setPlatform('All')
    try {
      const data = await searchProducts(query.trim(), { country, refresh, signal: abort.current.signal, onProgress: data => { if (request.current === id) setResult(data) } })
      if (request.current === id) setResult(data)
    } catch (error) { if (request.current === id && error.name !== 'AbortError') setError(error.message) }
    finally { if (request.current === id) setLoading(false) }
  }
  const products = result?.data || []
  const platforms = ['All', ...new Set(products.map(p => p.platform))]
  const visible = products.filter(p => platform === 'All' || p.platform === platform).sort((a, b) => {
    if (sort === 'price') return (a.trueCost ?? a.price) - (b.trueCost ?? b.price)
    if (sort === 'rating') return (b.rating || 0) - (a.rating || 0)
    if (sort === 'deal') { const tiers = { S: 5, A: 4, B: 3, C: 2, F: 1 }; return (tiers[b.dealScore] || 0) - (tiers[a.dealScore] || 0) || b.relevance - a.relevance }
    return b.relevance - a.relevance || (a.trueCost ?? a.price) - (b.trueCost ?? b.price)
  })
  return <div>
    <div className="hero">
      <div className="hero__glow" />
      <div className="market-label">{locating ? 'Finding your country…' : country ? `${config.countries.find(c => c.code === country)?.name || country} · ${currencyCode} · ${config.locationSource}` : 'Choose your country in Settings'}</div>
      <h1 className="hero__title">Find Your Best Deal</h1>
      <p className="hero__subtitle">Fresh listings from your region. Real prices. Clear comparisons.</p>
      <form className="search-bar" onSubmit={runSearch}>
        <span className="search-bar__icon" aria-hidden="true">⌕</span>
        <input className="search-bar__input" aria-label="Search products" placeholder="Try a model, brand or product name…" value={query} onChange={e => setQuery(e.target.value)} maxLength={200} required />
        <button className="search-bar__btn" disabled={!query.trim() || !country || locating || loading}>{loading ? 'Searching…' : 'Find deals'}</button>
      </form>
      <p className="help-text">Include the exact model and size for closer matches. Shipping and taxes can depend on your delivery address.</p>
    </div>
    {(error || configError) && <div className="notice notice--error" role="alert">{error || configError}{configError && <button onClick={refreshConfig}>Retry connection</button>}</div>}
    {loading && <div className="notice" role="status"><span className="live-dot" /> Checking stores — {result?.sources.length || 0} of {result?.totalSources || (config?.settings.provider === 'shopping' ? 1 : config?.market?.stores.length)} complete. Listings appear as sources respond.</div>}
    {result && <>
      <div className="results-heading"><div><strong>{products.length} matching listings</strong><p className="help-text">{result.cached ? 'Cached' : 'Retrieved'} {new Date(result.checkedAt).toLocaleTimeString()} · {currencyCode}{result.cached ? ' · up to 2 minutes old' : ''}</p></div>
        <button className="sort-btn" disabled={loading} onClick={e => runSearch(e, true)}>Refresh prices</button></div>
      <div className="source-statuses">{result.sources.map(source => <div key={source.id} className={`source-status source-status--${source.status}`}><div><strong>{source.name}</strong><span>{source.status === 'ok' ? `${source.count} listings` : source.status.replaceAll('_', ' ')}</span></div><p>{source.message}</p><button className="text-button" onClick={() => openExternal(source.url).catch(e => setError(e.message))}>Open store ↗</button></div>)}</div>
      {result.message && <div className="notice">{result.message}</div>}
    </>}
    {products.length > 0 && <>
      <div className="filter-bar"><div className="platform-filters">{platforms.map(p => <button key={p} onClick={() => setPlatform(p)} className={`platform-pill ${platform === p ? 'platform-pill--active' : ''}`}>{p}</button>)}</div>
        <div className="filter-bar__right"><label className="sr-only" htmlFor="sort">Sort listings</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="relevance">Closest match</option><option value="price">Lowest listed cost</option><option value="deal">Comparable deals</option><option value="rating">Highest rating</option></select><button className="sort-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? 'List view' : 'Grid view'}</button></div></div>
      <div className={view === 'grid' ? 'products-grid' : 'products-list'}>{visible.map(product => <ProductCard key={`${product.platform}-${product.url}`} product={product} viewMode={view} />)}</div>
    </>}
    {!loading && !error && result && !products.length && <div className="empty-state"><div className="empty-state__icon">⌕</div><h2 className="empty-state__title">No live prices retrieved</h2><p className="empty-state__subtitle">Try a precise product name, open a store above, or connect Google Shopping in Settings. Blocked stores cannot provide reliable prices.</p></div>}
    {!result && !loading && !error && <div className="empty-state"><div className="empty-state__icon">✧</div><h2 className="empty-state__title">Your next deal starts here</h2><p className="empty-state__subtitle">{config?.market?.stores.map(s => s.name).join(' · ') || 'Regional shopping search'}<br />We show when a price was retrieved and whether delivery costs are known.</p></div>}
  </div>
}
