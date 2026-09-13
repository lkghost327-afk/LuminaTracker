import React, { useState, useEffect } from 'react'
import { useCurrency } from '../components/CurrencyContext.jsx'
import { openExternal } from '../utils/api.js'
export default function SettingsPage() {
  const { config, updateSettings, refreshConfig, error: configError } = useCurrency()
  const [country, setCountry] = useState('auto')
  const [interval, setIntervalValue] = useState(30)
  const [notifications, setNotifications] = useState(true)
  const [provider, setProvider] = useState('direct')
  const [apiKey, setApiKey] = useState('')
  const [removeKey, setRemoveKey] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [extensionMessage, setExtensionMessage] = useState('')
  useEffect(() => { if (config) { setCountry(config.settings.country); setIntervalValue(config.settings.checkInterval); setNotifications(config.settings.notifications); setProvider(config.settings.provider) } }, [config])
  async function save(event) {
    event.preventDefault(); setSaving(true); setMessage(''); setError('')
    try {
      await updateSettings({ country, checkInterval: Number(interval), notifications, provider, ...(removeKey ? { apiKey: '' } : apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })
      setApiKey(''); setRemoveKey(false); setMessage('Settings saved.')
    } catch (error) { setError(error.message) }
    finally { setSaving(false) }
  }
  return <div><h1 className="page-title">Settings</h1><p className="page-subtitle">Local stores, accurate currencies and checks that suit you.</p>
    {(error || configError) && <div className="notice notice--error" role="alert">{error || configError}{configError && <button onClick={refreshConfig}>Retry</button>}</div>}
    <form onSubmit={save} className="settings-form">
      <section className="bundle-page__intro"><h2>Shopping region</h2><label>Country<select value={country} onChange={e => setCountry(e.target.value)}><option value="auto">Detect automatically</option>{config?.countries.map(c => <option key={c.code} value={c.code}>{c.name} — {c.currency}</option>)}</select></label><p className="help-text">Automatic mode estimates your country using your public IP through ipapi.co, then falls back to your device region. A VPN can affect detection. Choose a country to override it. Storefronts and prices follow that country's currency.</p><p className="help-text">Current: {config?.market ? `${config.countries.find(c => c.code === config.market.country)?.name} · ${config.market.currency} (${config.locationSource})` : 'No country detected — choose one above.'}</p></section>
      <section className="bundle-page__intro"><h2>Price sources</h2><label>Search source<select value={provider} onChange={e => setProvider(e.target.value)}><option value="direct">Direct retailer pages — no API key</option><option value="shopping">Google Shopping via SerpApi — API key required</option></select></label><p className="help-text">Direct search reads public retailer pages and reports blocked or unsupported sources. Google Shopping provides regional offers across more stores; it requires your own SerpApi account and uses its search quota. Neither source guarantees a checkout price.</p>
        <p className="help-text">Direct stores for your current country: {config?.market?.stores.map(s => s.name).join(', ') || 'None yet — use the shopping provider.'}</p>
        {(provider === 'shopping' || config?.settings.hasApiKey) && <><label>SerpApi key {config?.settings.hasApiKey && '(saved)'}<input type="password" autoComplete="off" value={apiKey} onChange={e => { setApiKey(e.target.value); setRemoveKey(false) }} placeholder={config?.settings.hasApiKey ? 'Leave blank to keep saved key' : 'Paste your API key'} disabled={!config?.desktop} /></label><p className="help-text">{config?.desktop ? 'Your key is encrypted using the operating system and never returned to the interface.' : 'Save provider keys in the desktop app, where operating system encryption is available.'}</p>{config?.settings.hasApiKey && <label className="checkbox-label"><input type="checkbox" checked={removeKey} onChange={e => { setRemoveKey(e.target.checked); if (e.target.checked) setProvider('direct') }} />Remove saved key</label>}</>}
        <button type="button" className="text-button" onClick={() => openExternal('https://serpapi.com/google-shopping-api').catch(e => setError(e.message))}>Provider documentation ↗</button>
      </section>
      <section className="bundle-page__intro"><h2>Background tracking</h2><label>Check every<select value={interval} onChange={e => setIntervalValue(e.target.value)}>{[5, 15, 30, 60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={notifications} onChange={e => setNotifications(e.target.checked)} />Desktop price alerts</label><p className="help-text">The desktop app keeps checking in the system tray. It must remain running and online. Alerts use the tracked item's original currency and known delivery cost; repeated alerts are suppressed until a new drop. Browser development mode does not send desktop notifications.</p></section>
      <button className="search-bar__btn" disabled={saving || !config}>{saving ? 'Saving…' : 'Save settings'}</button>{message && <p className="notice" role="status">{message}</p>}
    </form>
    <section className="bundle-page__intro"><h2>Standalone browser extension</h2><p className="help-text">Compare products in Chrome, Edge, Brave or another Chromium browser. The extension uses an online deal service and has its own region preferences. It works without launching this desktop app.</p><ol className="help-text" style={{ paddingLeft: 20 }}><li>Open the built extension folder below.</li><li>In your browser's Extensions page, enable Developer mode and choose Load unpacked. Select that folder.</li><li>Open the extension and enable comparisons. Choose your country and optionally enable automatic shopping-site offers.</li></ol><p className="help-text">No desktop pairing is needed. Preview builds show Service setup pending until the publisher deploys the online service. A browser-store release will include the service address.</p><div className="card-actions"><button className="sort-btn" disabled={!config?.desktop} onClick={async () => { try { await window.lumina.openExtensionFolder() } catch (e) { setExtensionMessage(e.message) } }}>Open extension folder</button></div>{extensionMessage && <p className="help-text" role="status">{extensionMessage}</p>}</section>
    <section className="bundle-page__intro"><h2>How prices are compared</h2><p className="help-text">Grades compare matching titles or product identifiers in the same currency, condition and known shipping cost. S: at least 20% below the matching average; A: at least 10% below; B: within 5% above; C: up to 20% above; F: more than 20% above. A grade is not a claim about an all-time low. Confirm model, variant, seller and final charges at checkout.</p></section>
    <section className="bundle-page__intro"><h2>Your data</h2><p className="help-text">Tracked products, observations and settings are stored in a local JSON file with a backup. Searches are sent to the selected retailers or shopping provider. Automatic country detection contacts ipapi.co. Product images load from their source websites. There is no LuminaTracker cloud account.</p></section>
  </div>
}
