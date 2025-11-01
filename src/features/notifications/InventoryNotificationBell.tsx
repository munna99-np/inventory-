import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, PackageMinus, RefreshCcw, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../../components/ui/button'
import { supabase } from '../../lib/supabaseClient'
import { formatCurrency } from '../../lib/format'
import { formatAppDateTime } from '../../lib/date'

type NotificationType = 'low-stock' | 'payment'

type NotificationItem = {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt?: string | null
}

const LOW_STOCK_THRESHOLD = 5

function formatTimestamp(value?: string | null) {
  const label = formatAppDateTime(value)
  return label || ''
}

export default function InventoryNotificationBell() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: sessionData, error: sessionError }] = await Promise.all([
        supabase.auth.getUser(),
      ])
      if (sessionError) throw new Error(sessionError.message)
      const ownerId = sessionData.user?.id ?? null

      const lowStockQuery = supabase
        .from('inventory_items')
        .select('id,name,stock,unit')
        .lte('stock', LOW_STOCK_THRESHOLD)
        .order('stock', { ascending: true })
        .limit(20)

      const [lowStockResult, paymentsResult] = await Promise.all([
        ownerId ? lowStockQuery.eq('owner', ownerId) : Promise.resolve({ data: [] as any[], error: null }),
        ownerId
          ? supabase
              .from('inventory_party_ledger')
              .select('id,entry_type,direction,amount,payment_method,created_at, party:parties(name)')
              .eq('owner', ownerId)
              .eq('entry_type', 'payment')
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] as any[], error: null }),
      ])

      if (lowStockResult.error) throw new Error(lowStockResult.error.message)
      if ('error' in paymentsResult && paymentsResult.error) throw new Error(paymentsResult.error.message)

      const items: NotificationItem[] = []

      for (const row of (lowStockResult.data ?? []) as any[]) {
        const stockValue = Number(row?.stock ?? 0)
        items.push({
          id: `low-${row?.id}`,
          type: 'low-stock',
          title: row?.name ?? 'Unknown item',
          message: `Only ${Number.isFinite(stockValue) ? stockValue : 0} ${row?.unit || ''} left in stock`,
          createdAt: null,
        })
      }

      for (const row of ((paymentsResult as any)?.data ?? []) as any[]) {
        const amount = Number(row?.amount ?? 0)
        const direction: 'in' | 'out' = row?.direction === 'in' ? 'in' : 'out'
        const title = direction === 'in' ? 'Payment received' : 'Payment issued'
        const partyName = row?.party?.name || 'Walk-in customer'
        const label = `${partyName} - ${formatCurrency(amount)}`
        items.push({
          id: `payment-${row?.id}`,
          type: 'payment',
          title,
          message: label,
          createdAt: row?.created_at ?? null,
        })
      }

      const sorted = items.sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
        return bTime - aTime
      })

      setNotifications(sorted)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load notifications'
      setError(message)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const badgeCount = notifications.length

  const grouped = useMemo(() => {
    const lowStock = notifications.filter((item) => item.type === 'low-stock')
    const payments = notifications.filter((item) => item.type === 'payment')
    return { lowStock, payments }
  }, [notifications])

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={clsx('relative h-10 w-10 border-slate-200 text-slate-600 hover:bg-muted', {
          'bg-primary/10 text-primary border-primary/20': open,
        })}
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-[4px] text-[10px] font-semibold text-white">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-muted-foreground">Low stock alerts and recent payments</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={clsx('h-8 w-8 text-muted-foreground hover:text-slate-900', {
                'animate-spin': loading,
              })}
              onClick={() => loadNotifications()}
              aria-label="Refresh notifications"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {error && (
              <div className="px-4 py-3 text-sm text-rose-600">{error}</div>
            )}

            {!error && notifications.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
            )}

            {!error && grouped.lowStock.length > 0 && (
              <div className="border-b border-slate-100">
                <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Low stock</p>
                <ul className="divide-y divide-slate-100">
                  {grouped.lowStock.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <PackageMinus className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!error && grouped.payments.length > 0 && (
              <div>
                <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
                <ul className="divide-y divide-slate-100">
                  {grouped.payments.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Wallet className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.message}</p>
                        {item.createdAt && (
                          <p className="text-[11px] text-slate-400">{formatTimestamp(item.createdAt)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
