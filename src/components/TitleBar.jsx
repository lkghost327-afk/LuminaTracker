import React from 'react'

export default function TitleBar() {
  const isElectron = typeof window !== 'undefined' && window.lumina

  return (
    <div className="titlebar">
      <div className="titlebar__logo">
        <div className="titlebar__logo-icon" />
        <span>LuminaTracker</span>
      </div>
      {isElectron && <div className="titlebar__controls">
        <button className="titlebar__btn" onClick={() => isElectron && window.lumina.minimize()} title="Minimize">─</button>
        <button className="titlebar__btn" onClick={() => isElectron && window.lumina.maximize()} title="Maximize">□</button>
        <button className="titlebar__btn titlebar__btn--close" onClick={() => isElectron && window.lumina.close()} title="Close">✕</button>
      </div>}
    </div>
  )
}
