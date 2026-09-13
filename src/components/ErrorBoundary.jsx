import React from 'react'
export default class ErrorBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('LuminaTracker interface error:', error) }
  render() {
    if (this.state.failed) return <div className="notice notice--error" role="alert">The interface could not load. Your saved trackers are stored separately.<button className="sort-btn" onClick={() => window.location.reload()}>Reload app</button></div>
    return this.props.children
  }
}
