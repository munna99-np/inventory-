import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export type DashboardData = {
  totalIncome: number
  totalExpense: number
  net: number
  accounts: Array<{
    account: any
    balance: number
  }>
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    
    async function fetchData() {
      setLoading(true)
      try {
        const [accRes, txRes, trRes] = await Promise.all([
          supabase.from('accounts').select('id,name,kind,opening_balance,is_active').order('name'),
          supabase.from('transactions').select('id,account_id,amount,direction'),
          supabase.from('transfers').select('from_account,to_account,amount'),
        ])
        
        if (!active) return
        
        if (accRes.error) {
          setError(accRes.error.message)
          setLoading(false)
          return
        }
        if (txRes.error) {
          setError(txRes.error.message)
          setLoading(false)
          return
        }
        if (trRes.error) {
          setError(trRes.error.message)
          setLoading(false)
          return
        }

        const accounts = accRes.data || []
        const txns = txRes.data || []
        const transfers = trRes.data || []

        const totalIncome = txns.filter((t: any) => t.direction === 'in').reduce((s: number, t: any) => s + (t.amount || 0), 0)
        const totalOutRaw = txns.filter((t: any) => t.direction === 'out').reduce((s: number, t: any) => s + (t.amount || 0), 0)
        const totalExpense = Math.abs(totalOutRaw)
        const net = totalIncome - totalExpense

        const byAccountTx = new Map<string, number>()
        for (const t of txns) {
          const current = byAccountTx.get(t.account_id) || 0
          byAccountTx.set(t.account_id, current + (t.amount || 0))
        }

        const byAccountTr = new Map<string, number>()
        for (const tr of transfers) {
          const fromCurrent = byAccountTr.get(tr.from_account) || 0
          const toCurrent = byAccountTr.get(tr.to_account) || 0
          byAccountTr.set(tr.from_account, fromCurrent - (tr.amount || 0))
          byAccountTr.set(tr.to_account, toCurrent + (tr.amount || 0))
        }

        const accountsBalances = accounts.map((a: any) => {
          const deltaTx = byAccountTx.get(a.id) || 0
          const deltaTr = byAccountTr.get(a.id) || 0
          const balance = (a.opening_balance || 0) + deltaTx + deltaTr
          return { account: a, balance }
        })

        setData({ totalIncome, totalExpense, net, accounts: accountsBalances })
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to load dashboard data')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchData()
    
    return () => {
      active = false
    }
  }, [])

  return { data, loading, error }
}
