import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import InventoryNav from '../features/inventory/InventoryNav'
import {
  getPartyLedgerStatement,
  type PartyLedgerSummary,
  type PartyLedgerEntry,
} from '../services/inventoryItems'
import { formatCurrency } from '../lib/format'
import { cn } from '../lib/utils'
import { formatAppDate } from '../lib/date'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, Wallet2, ShoppingBag, History, CreditCard } from 'lucide-react'

function formatDate(value: string | null | undefined) {
  const label = formatAppDate(value)
  return label || value || 'N/A'
}

type StatementLedgerStatus = { label: string; amount: number; className: string }

function resolveLedgerStatus(summary: PartyLedgerSummary): StatementLedgerStatus {
  if (summary.creditAmount > 0.01) {
    return {
      label: 'Credit',
      amount: summary.creditAmount,
      className: 'border border-emerald-200 bg-emerald-50 text-emerald-600',
    }
  }
  if (summary.dueAmount > 0.01) {
    return {
      label: 'Due',
      amount: summary.dueAmount,
      className: 'border border-amber-200 bg-amber-50 text-amber-600',
    }
  }
  return {
    label: 'Settled',
    amount: 0,
    className: 'border border-slate-200 bg-slate-100 text-slate-600',
  }
}



function getStatusStyles(status?: string | null) {
  if (!status) return 'border-slate-200 bg-slate-50 text-slate-600'
  const normalized = status.trim().toLowerCase()
  if (normalized === 'credit') return 'border-rose-200 bg-rose-50 text-rose-600'
  if (normalized === 'pay' || normalized === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-600'
  if (normalized === 'pending') return 'border-amber-200 bg-amber-50 text-amber-600'
  return 'border-indigo-200 bg-indigo-50 text-indigo-600'
}

export default function CustomerStatementPage() {
  const navigate = useNavigate()
  const { partyId } = useParams<{ partyId: string }>()
  const [summary, setSummary] = useState<PartyLedgerSummary | null>(null)
  const [entries, setEntries] = useState<PartyLedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ledgerStatus = summary ? resolveLedgerStatus(summary) : null

  useEffect(() => {
    if (!partyId) {
      setError('Customer not found')
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { summary: summaryData, entries: entryData } = await getPartyLedgerStatement(partyId)
        if (cancelled) return
        setSummary(summaryData)
        setEntries(entryData)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load customer statement'
        setError(message)
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [partyId])

  return (
    <div className="space-y-6">
      <InventoryNav />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <ArrowLeft className="h-4 w-4" /> Back to inventory
            </button>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Customer statement</h1>
            {summary && <p className="text-sm text-muted-foreground">Customer: <span className="font-medium text-slate-800">{summary.partyName}</span></p>}
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total sold</span>
                  <History className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="mt-2 text-lg font-semibold text-emerald-600">{formatCurrency(summary.totalSold)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total purchased</span>
                  <ShoppingBag className="h-4 w-4 text-rose-400" />
                </div>
                <div className="mt-2 text-lg font-semibold text-rose-600">{formatCurrency(summary.totalPurchased)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Payments</span>
                  <CreditCard className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-lg font-semibold text-emerald-600">{formatCurrency(summary.paymentsReceived)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Issued:{' '}
                  <span className="font-semibold text-rose-600">{formatCurrency(summary.paymentsIssued)}</span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Balance</span>
                  <Wallet2 className="h-4 w-4 text-indigo-400" />
                </div>
                <div className={cn('mt-2 text-lg font-semibold', summary.balance > 0 ? 'text-emerald-600' : summary.balance < 0 ? 'text-rose-600' : 'text-slate-600')}>
                  {formatCurrency(summary.balance)}
                </div>
                {ledgerStatus && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 uppercase font-semibold', ledgerStatus.className)}>
                      {ledgerStatus.label}
                    </span>
                    {ledgerStatus.amount > 0 ? (
                      <span className={cn(
                        'font-semibold',
                        summary.balance > 0 ? 'text-emerald-600' : summary.balance < 0 ? 'text-rose-600' : 'text-slate-600'
                      )}>
                        {formatCurrency(ledgerStatus.amount)}
                      </span>
                    ) : (
                      <span className="text-slate-500">No dues</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Transaction history</h2>
              <p className="text-sm text-muted-foreground">All sales, purchases, and payments recorded with this customer.</p>
              <div className="mt-4 space-y-3">
                {entries.map((entry) => {
                  const billingStatus =
                    typeof entry.metadata?.billingStatus === 'string' ? entry.metadata.billingStatus : null
                  const paymentMethod =
                    typeof entry.paymentMethod === 'string' && entry.paymentMethod.trim().length
                      ? entry.paymentMethod
                      : 'method not set'
                  return (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{formatDate(entry.entryDate)}</div>
                        <div className="mt-1 inline-flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                            {entry.entryType}
                          </span>
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-500">
                            {paymentMethod}
                          </span>
                        </div>
                        {entry.notes && <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>}
                      </div>
                      <div className={cn('text-lg font-semibold', entry.direction === 'in' ? 'text-emerald-600' : 'text-rose-600')}>
                        {entry.direction === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
                      </div>
                    </div>
                    {billingStatus && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                        <span>Status:</span>
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 font-semibold', getStatusStyles(billingStatus))}>
                          {billingStatus}
                        </span>
                      </div>
                    )}
                    </div>
                  )
                })}
                {entries.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-12 text-center text-sm text-muted-foreground">
                    No transactions recorded yet.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-muted-foreground">
            Customer details not available.
          </div>
        )}
      </div>
    </div>
  )
}
