import React, { useState } from 'react'
import { useCurrency } from './CurrencyContext.jsx'
import { callApi, openExternal } from '../utils/api.js'
export default function ProductCard({ product, viewMode }) {
  const { formatPrice } = useCurrency()
  const [imgError, setImgError] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const price = value => formatPrice(value, product.currency)
  async function track(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      await callApi('addTrackedItem', { query: product.title.slice(0, 200), targetPrice: target || null, country: product.country, url: product.url, platform: product.platform, catalogId: product.catalogId })
      setSaved(true); setTracking(false); setMessage('Added to your tracker.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <article className={`product-card ${viewMode === 'list' ? 'product-card--list' : ''}`}>
    {product.dealScore && <div className={`deal-badge deal-badge--${product.dealScore}`} title={product.dealExplanation}>{product.dealScore}</div>}
    <div className="product-card__image-wrap">{product.image && !imgError ? <img className="product-card__image product-card__image--loaded" src={product.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgError(true)} /> : <div className="product-card__image-placeholder">No image available</div>}</div>
    <div className="product-card__body">
      <div className="product-card__platform-row"><span className="product-card__platform">{product.platform}</span><span className="help-text">{product.condition === 'unknown' ? 'Check condition' : product.condition}</span></div>
      <h3 className="product-card__title">{product.title}</h3>
      {product.rating > 0 && <div className="rating"><span className="rating__stars">★</span><span className="rating__value">{product.rating.toFixed(1)} / 5</span></div>}
      <div className="product-card__footer"><div><div className="product-card__price">{price(product.price)}</div>{product.trueCost !== null && product.shipping > 0 && <div className="product-card__true-cost">With delivery: {price(product.trueCost)}</div>}</div></div>
      <p className="shipping-detail">{product.shipping === null ? 'Delivery cost unknown · confirm at store' : product.shipping === 0 ? 'Free delivery listed' : `Delivery: ${price(product.shipping)}`}</p>
      <p className="help-text">Retrieved {new Date(product.fetchedAt).toLocaleTimeString()}{product.dealScore ? ` · ${product.comparisonCount} matching listings compared` : ' · No comparable deal grade'}</p>
      <div className="card-actions"><button className="search-bar__btn" onClick={() => openExternal(product.url).catch(e => setMessage(e.message))}>{product.linkType === 'comparison' ? 'View offer' : 'View at store'} ↗</button><button className="sort-btn" disabled={saved} onClick={() => setTracking(!tracking)}>{saved ? 'Tracked ✓' : 'Track price'}</button></div>
      {tracking && <form className="inline-track" onSubmit={track}><label>Target total ({product.currency})<input aria-label={`Target for ${product.title}`} type="number" min="0.01" step="0.01" placeholder="Optional" value={target} onChange={e => setTarget(e.target.value)} /></label><button className="sort-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></form>}
      {message && <p className="help-text" role="status">{message}</p>}
    </div>
  </article>
}
