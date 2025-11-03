import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { offlineStorage } from '../lib/offlineStorage'
import { syncService } from '../lib/syncService'
import type { Transaction } from '../types/transactions'

export type TxFilters = {
  accountId?: string
  categoryId?: string
  partyId?: string
  scope?: 'personal' | 'work'
  direction?: 'in' | 'out' | 'transfer'
  mode?: string
  from?: string
  to?: string
  search?: string
}

// Supabase returns NUMERIC fields as strings; convert them so downstream math stays reliable.
function normaliseTransaction(row: any): Transaction {
  const amount = typeof row.amount === 'string' ? parseFloat(row.amount) : row.amount
  const qtyRaw = typeof row.qty === 'string' ? parseFloat(row.qty) : row.qty
  const qty = Number.isFinite(qtyRaw) ? qtyRaw : null
  return {
    ...row,
    amount: Number.isFinite(amount) ? amount : 0,
    qty,
  } as Transaction
}

function buildQuery(activeFilters: TxFilters) {
  let query = supabase
    .from('transactions')
    .select('id,account_id,date,amount,qty,direction,scope,mode,category_id,party_id,notes')
    .order('date', { ascending: false })

  if (activeFilters.accountId) query = query.eq('account_id', activeFilters.accountId)
  if (activeFilters.categoryId) {
    if (activeFilters.categoryId === 'uncategorized') query = query.is('category_id', null)
    else query = query.eq('category_id', activeFilters.categoryId)
  }
  if (activeFilters.partyId) query = query.eq('party_id', activeFilters.partyId)
  if (activeFilters.scope) query = query.eq('scope', activeFilters.scope)
  if (activeFilters.direction) query = query.eq('direction', activeFilters.direction)
  if (activeFilters.mode) query = query.eq('mode', activeFilters.mode)
  if (activeFilters.from) query = query.gte('date', activeFilters.from)
  if (activeFilters.to) query = query.lte('date', activeFilters.to)
  if (activeFilters.search) query = query.ilike('notes', `%${activeFilters.search}%`)

  return query
}

function applyFilters(items: Transaction[], filters: TxFilters): Transaction[] {
  let filtered = [...items]

  if (filters.accountId) {
    filtered = filtered.filter((t) => t.account_id === filters.accountId)
  }
  if (filters.categoryId) {
    if (filters.categoryId === 'uncategorized') {
      filtered = filtered.filter((t) => !t.category_id)
    } else {
      filtered = filtered.filter((t) => t.category_id === filters.categoryId)
    }
  }
  if (filters.partyId) {
    filtered = filtered.filter((t) => t.party_id === filters.partyId)
  }
  if (filters.scope) {
    filtered = filtered.filter((t) => t.scope === filters.scope)
  }
  if (filters.direction) {
    filtered = filtered.filter((t) => t.direction === filters.direction)
  }
  if (filters.mode) {
    filtered = filtered.filter((t) => t.mode === filters.mode)
  }
  if (filters.from) {
    const fromDateStr = String(filters.from)
    filtered = filtered.filter((t) => {
      const txDate = typeof t.date === 'string' ? t.date : (t.date instanceof Date ? t.date.toISOString().slice(0, 10) : String(t.date))
      return txDate >= fromDateStr
    })
  }
  if (filters.to) {
    const toDateStr = String(filters.to)
    filtered = filtered.filter((t) => {
      const txDate = typeof t.date === 'string' ? t.date : (t.date instanceof Date ? t.date.toISOString().slice(0, 10) : String(t.date))
      return txDate <= toDateStr
    })
  }
  if (filters.search) {
    const searchLower = filters.search.toLowerCase()
    filtered = filtered.filter((t) => t.notes?.toLowerCase().includes(searchLower))
  }

  // Sort by date descending
  return filtered.sort((a, b) => {
    const dateA = typeof a.date === 'string' ? a.date : (a.date instanceof Date ? a.date.toISOString() : String(a.date))
    const dateB = typeof b.date === 'string' ? b.date : (b.date instanceof Date ? b.date.toISOString() : String(b.date))
    return dateB > dateA ? 1 : -1
  })
}

export function useTransactions(filters: TxFilters = {}) {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(!syncService.isConnected())

  const serializedFilters = useMemo(() => JSON.stringify(filters), [filters])

  const refetch = useMemo(() => {
    return async () => {
      const activeFilters = JSON.parse(serializedFilters) as TxFilters
      setLoading(true)
      setError(null)
      
      try {
        // Try offline first
        const offlineData = await offlineStorage.get<Transaction>('transactions')
        const offlineArray = Array.isArray(offlineData) ? offlineData : []
        
        if (offlineArray.length > 0) {
          const filtered = applyFilters(offlineArray.map(normaliseTransaction), activeFilters)
          setData(filtered)
        }

        // If online, fetch from server
        if (syncService.isConnected() && isSupabaseConfigured) {
          try {
            const { data: serverData, error: serverError } = await buildQuery(activeFilters)
            
            if (serverError) {
              if (offlineArray.length === 0) {
                setError(serverError.message)
                setData([])
              }
              return
            }

            const normalized = ((serverData as any) || []).map(normaliseTransaction)
            
            if (normalized.length > 0) {
              await offlineStorage.save('transactions', normalized)
            }
            
            setData(normalized)
            setError(null)
          } catch (err: unknown) {
            if (offlineArray.length === 0) {
              const message = err instanceof Error ? err.message : 'Failed to load transactions'
              setError(message)
              setData([])
            }
          }
        } else if (offlineArray.length === 0) {
          setError('Offline - no cached data available')
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load transactions'
        setError(message)
        setData([])
      } finally {
        setLoading(false)
      }
    }
  }, [serializedFilters])

  useEffect(() => {
    // Listen to online/offline status changes
    const unsubscribe = syncService.onStatusChange((online) => {
      setIsOffline(!online)
      if (online) {
        // When coming online, sync and refetch
        syncService.sync().then(() => {
          refetch()
        })
      }
    })
    return () => {
      unsubscribe()
    }
  }, [refetch])

  useEffect(() => {
    let isMounted = true
    const activeFilters = JSON.parse(serializedFilters) as TxFilters

    const fetch = async () => {
      setLoading(true)
      setError(null)

      try {
        // First, try to load from offline storage for instant display
        const offlineData = await offlineStorage.get<Transaction>('transactions')
        const offlineArray = Array.isArray(offlineData) ? offlineData : []
        
        if (offlineArray.length > 0 && isMounted) {
          const filtered = applyFilters(offlineArray.map(normaliseTransaction), activeFilters)
          setData(filtered)
          setLoading(false)
        }

        // If online and Supabase is configured, fetch from server
        if (syncService.isConnected() && isSupabaseConfigured) {
          try {
            const { data: serverData, error: serverError } = await buildQuery(activeFilters)
            if (!isMounted) return

            if (serverError) {
              // If server error but we have offline data, use that
              if (offlineArray.length === 0) {
                setError(serverError.message)
                setData([])
              }
              return
            }

            const normalized = ((serverData as any) || []).map(normaliseTransaction)
            
            // Save to offline storage
            if (normalized.length > 0) {
              await offlineStorage.save('transactions', normalized)
            }

            // Update UI
            if (isMounted) {
              setData(normalized)
              setError(null)
            }
          } catch (err: unknown) {
            // Network error - use offline data if available
            if (offlineArray.length === 0 && isMounted) {
              const message = err instanceof Error ? err.message : 'Failed to load transactions'
              setError(message)
              setData([])
            }
          }
        } else if (offlineArray.length === 0 && isMounted) {
          // Offline and no cached data
          if (!isSupabaseConfigured) {
            setError('Database not configured')
          } else {
            setError('Offline - no cached data available')
          }
        }
      } catch (err: unknown) {
        if (!isMounted) return
        const message = err instanceof Error ? err.message : 'Failed to load transactions'
        setError(message)
        setData([])
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetch()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedFilters])

  return { data, loading, error, refetch, isOffline }
}
