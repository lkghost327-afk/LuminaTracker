import React from 'react'

const NAV_ITEMS = [
  { id: 'search', icon: '🔍', label: 'Search' },
  { id: 'tracker', icon: '📡', label: 'Tracker' },
  { id: 'bundle', icon: '📦', label: 'Bundle' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar({ active, onNavigate }) {
  return (
    <nav className="sidebar">
      {NAV_ITEMS.slice(0, 3).map((item) => (
        <button
          key={item.id}
          className={`sidebar__item ${active === item.id ? 'sidebar__item--active' : ''}`}
          onClick={() => onNavigate(item.id)}
          title={item.label}
          aria-label={item.label}
        >
          {item.icon}
        </button>
      ))}
      <div className="sidebar__spacer" />
      <button
        className={`sidebar__item ${active === 'settings' ? 'sidebar__item--active' : ''}`}
        onClick={() => onNavigate('settings')}
        title="Settings"
        aria-label="Settings"
      >
        ⚙️
      </button>
    </nav>
  )
}
