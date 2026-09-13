import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { callApi } from '../utils/api.js'
const CurrencyContext = createContext()
export function CurrencyProvider({ children }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refreshConfig = useCallback(async () => {
    setError('')
    try {
      const result = await callApi('getConfig', { locale: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      setConfig(result)
      return result
    } catch (error) { setError(error.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refreshConfig() }, [refreshConfig])
  const updateSettings = async input => {
    await callApi('updateSettings', input)
    return refreshConfig()
  }
  const currencyCode = config?.market?.currency
  const formatPrice = (amount, currency = currencyCode) => {
    if (amount == null || !Number.isFinite(Number(amount))) return 'Unknown'
    if (!currency) return String(amount)
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  }
  return <CurrencyContext.Provider value={{ config, country: config?.market?.country, currencyCode, formatPrice, loading, error, refreshConfig, updateSettings }}>{children}</CurrencyContext.Provider>
}
export function useCurrency() { return useContext(CurrencyContext) }
