import React, { useState, lazy, Suspense } from 'react'
import TitleBar from './components/TitleBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import SearchPage from './pages/SearchPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { CurrencyProvider, useCurrency } from './components/CurrencyContext.jsx'
const TrackerPage = lazy(() => import('./pages/TrackerPage.jsx'))
const BundlePage = lazy(() => import('./pages/BundlePage.jsx'))
function Workspace() {
  const [page, setPage] = useState('search')
  const [visited, setVisited] = useState(['search'])
  const { country, config } = useCurrency()
  const pages = { search: SearchPage, tracker: TrackerPage, bundle: BundlePage, settings: SettingsPage }
  const navigate = value => { setVisited(prev => prev.includes(value) ? prev : [...prev, value]); setPage(value) }
  return <><TitleBar /><div className="app"><div className="layout"><Sidebar active={page} onNavigate={navigate} /><main className="main-content"><Suspense fallback={<p className="notice">Loading…</p>}>{visited.map(id => {
    const Page = pages[id]
    return <div key={id} hidden={id !== page}><Page key={id === 'search' || id === 'bundle' ? `${country}-${config?.settings.provider}` : id} /></div>
  })}</Suspense></main></div></div></>
}
export default function App() { return <ErrorBoundary><CurrencyProvider><Workspace /></CurrencyProvider></ErrorBoundary> }
