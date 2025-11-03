import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export type TxFilters = {
  accountId?: string
  categoryId?: string
  partyId?: string
  scope?: 'personal' | 'work'
  direction?: 'in' | 'out'
  mode?: string
  from?: string
  to?: string
  search?: string
}

function normaliseTransaction(row: any) {
  const amount = typeof row.amount === 'string' ? parseFloat(row.amount) : row.amount
  return {
    ...row,
    amount: Number.isFinite(amount) ? amount : 0,
  }
}

function buildQuery(activeFilters: TxFilters) {
  let query = supabase
    .from('transactions')
    .select('id,account_id,date,amount,direction,scope,mode,category_id,party_id,notes')
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

export function useTransactions(filters: TxFilters = {}) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeFilters = useMemo(() => filters, [JSON.stringify(filters)])

  useEffect(() => {
    let active = true

    async function fetchTransactions() {
      setLoading(true)
      setError(null)
      try {
        const { data: rows, error: err } = await buildQuery(activeFilters)
        
        if (!active) return
        
        if (err) {
          setError(err.message)
          setLoading(false)
          return
        }

        const normalized = (rows || []).map(normaliseTransaction)
        setData(normalized)
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to load transactions')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchTransactions()

    return () => {
      active = false
    }
  }, [activeFilters])

  return { data, loading, error }
}
