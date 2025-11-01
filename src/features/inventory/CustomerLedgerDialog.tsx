import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import MoneyInput from '../../components/fields/MoneyInput'
import {
  listPartyLedgerSummaries,
  listPartyLedgerEntries,
  recordLedgerPayment,
  getPartyLedgerSummary,
  type PartyLedgerSummary,
  type PartyLedgerEntry,
} from '../../services/inventoryItems'
import { formatCurrency } from '../../lib/format'
import { formatAppDate } from '../../lib/date'
import { toast } from 'sonner'
import { Loader2, UserRound, ArrowLeft, RefreshCcw, Wallet2, CreditCard, History, ArrowRight, FileText, ShoppingBag } from 'lucide-react'
import { cn } from '../../lib/utils'

type CustomerLedgerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PaymentFormState = {
  amount?: number
  paymentMethod: string
  notes: string
  direction: 'out' | 'in'
  entryDate: string
}

const paymentOptions = [
  { label: 'Cash', value: 'cash' },
  { label: 'Online', value: 'online' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Credit', value: 'credit' },
  { label: 'Other', value: 'other' },
]

function formatDate(value: string | null | undefined) {
  const label = formatAppDate(value)
  return label || value || 'N/A'
}

function balanceColor(balance: number) {
  if (balance > 0.01) return 'text-emerald-600'
  if (balance < -0.01) return 'text-rose-600'
  return 'text-slate-500'
}

type LedgerStatus = { label: string; amount: number; badgeClass: string }

function ledgerStatus(summary: PartyLedgerSummary): LedgerStatus {
  if (summary.creditAmount > 0.01) {
    return {
      label: 'Credit',
      amount: summary.creditAmount,
      badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }
  if (summary.dueAmount > 0.01) {
    return {
      label: 'Due',
      amount: summary.dueAmount,
      badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
    }
  }
  return {
    label: 'Settled',
    amount: 0,
    badgeClass: 'border border-slate-200 bg-slate-100 text-slate-600',
  }
}

function EntryBadge({ entry }: { entry: PartyLedgerEntry }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (entry.entryType === 'sale') return <span className={cn(base, 'bg-emerald-50 text-emerald-700')}>Sale</span>
  if (entry.entryType === 'purchase') return <span className={cn(base, 'bg-rose-50 text-rose-700')}>Purchase</span>
  if (entry.entryType === 'payment') return <span className={cn(base, entry.direction === 'out' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700')}>{entry.direction === 'out' ? 'Payment received' : 'Payment issued'}</span>
  return <span className={cn(base, 'bg-slate-100 text-slate-600 capitalize')}>{entry.entryType}</span>
}

export default function CustomerLedgerDialog({ open, onOpenChange }: CustomerLedgerDialogProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [summaries, setSummaries] = useState<PartyLedgerSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedSummary, setSelectedSummary] = useState<PartyLedgerSummary | null>(null)
  const [entries, setEntries] = useState<PartyLedgerEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentState, setPaymentState] = useState<PaymentFormState>({
    amount: undefined,
    paymentMethod: 'cash',
    notes: '',
    direction: 'out',
    entryDate: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    if (!open) {
      setSelectedSummary(null)
      setEntries([])
      setSearch('')
      return
    }
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await listPartyLedgerSummaries()
        setSummaries(rows)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load customer ledger'
        setError(message)
        setSummaries([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open])

  const filteredSummaries = useMemo(() => {
    if (!search.trim()) return summaries
    const q = search.trim().toLowerCase()
    return summaries.filter((summary) => summary.partyName.toLowerCase().includes(q))
  }, [summaries, search])

  const selectedStatus = selectedSummary ? ledgerStatus(selectedSummary) : null

  const loadEntries = async (summary: PartyLedgerSummary) => {
    setEntriesLoading(true)
    try {
      const [rows, refreshedSummary] = await Promise.all([
        listPartyLedgerEntries(summary.partyId),
        getPartyLedgerSummary(summary.partyId).catch(() => summary),
      ])
      setEntries(rows)
      setSelectedSummary(refreshedSummary)
      setSummaries((prev) => {
        let found = false
        const next = prev.map((current) => {
          if (current.partyId === refreshedSummary.partyId) {
            found = true
            return refreshedSummary
          }
          return current
        })
        return found ? next : [...next, refreshedSummary]
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load ledger entries')
    } finally {
      setEntriesLoading(false)
    }
  }

  const handlePaymentSubmit = async () => {
    if (!selectedSummary) return
    try {
      await recordLedgerPayment({
        partyId: selectedSummary.partyId,
        amount: paymentState.amount || 0,
        paymentMethod: paymentState.paymentMethod,
        direction: paymentState.direction,
        notes: paymentState.notes || null,
        entryDate: paymentState.entryDate,
      })
      toast.success(paymentState.direction === 'out' ? 'Payment recorded' : 'Payment issued')
      setPaymentOpen(false)
      setPaymentState((state) => ({ ...state, amount: undefined, notes: '' }))
      await loadEntries(selectedSummary)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record payment')
    }
  }

  const resetPaymentForm = () => {
    setPaymentState({ amount: undefined, paymentMethod: 'cash', notes: '', direction: 'out', entryDate: new Date().toISOString().slice(0, 10) })
  }

  const closeDialog = (value: boolean) => {
    if (!value) {
      setSelectedSummary(null)
      setEntries([])
      resetPaymentForm()
    }
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <DialogContent className="fixed left-1/2 top-1/2 w-[96vw] max-w-6xl max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-white p-0 shadow-2xl focus:outline-none sm:w-[90vw] sm:max-h-[92vh] sm:rounded-2xl">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <UserRound className="h-5 w-5 text-indigo-500" />
                  Customer ledger
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => closeDialog(false)} aria-label="Close">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={async () => {
                    setLoading(true)
                    try {
                      const rows = await listPartyLedgerSummaries()
                      setSummaries(rows)
                      toast.success('Customer list refreshed')
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to refresh customers')
                    } finally {
                      setLoading(false)
                    }
                  }} aria-label="Refresh customers">
                    <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
              {!selectedSummary ? (
                <div className="space-y-5">
                  <div className="sticky top-0 z-10 space-y-3 bg-white pb-4">
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search customers by name"
                      className="h-10"
                    />
                    {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                  </div>
                  {loading ? (
                    <div className="grid place-items-center py-16 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {filteredSummaries.map((summary) => {
                        const status = ledgerStatus(summary)
                        return (
                          <div
                            key={summary.partyId}
                            className="group flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate text-base font-semibold text-slate-900">{summary.partyName}</h3>
                                  <p className="text-xs text-muted-foreground">Last activity: {formatDate(summary.lastActivity)}</p>
                                </div>
                                <div className="text-right">
                                  <div className={cn('text-sm font-semibold', balanceColor(summary.balance))}>
                                    {formatCurrency(summary.balance)}
                                  </div>
                                  <span className={cn('mt-1 inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', status.badgeClass)}>
                                    <span>{status.label}</span>
                                    {status.amount > 0 && <span>{formatCurrency(status.amount)}</span>}
                                  </span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2">
                                  <div className="text-[11px] uppercase tracking-wide text-emerald-600">Total sold</div>
                                  <div className="text-sm font-semibold text-emerald-700">{formatCurrency(summary.totalSold)}</div>
                                </div>
                                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-2">
                                  <div className="text-[11px] uppercase tracking-wide text-rose-600">Total purchased</div>
                                  <div className="text-sm font-semibold text-rose-700">{formatCurrency(summary.totalPurchased)}</div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                <span>Payments received: {formatCurrency(summary.paymentsReceived)}</span>
                                <span>Payments issued: {formatCurrency(summary.paymentsIssued)}</span>
                              </div>
                            </div>
                            <div className="mt-4 flex justify-end">
                              <Button size="sm" onClick={() => loadEntries(summary)} className="gap-2">
                                View ledger <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                      {!loading && filteredSummaries.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-muted-foreground">
                          No customers found. Try a different search.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="sticky top-0 z-10 flex flex-col gap-4 bg-white pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSummary(null)
                          setEntries([])
                          resetPaymentForm()
                        }}
                        className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back to customers
                      </button>
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-slate-900">{selectedSummary.partyName}</h2>
                        <p className="text-xs text-muted-foreground">
                          Ledger balance:{' '}
                          <span className={balanceColor(selectedSummary.balance)}>{formatCurrency(selectedSummary.balance)}</span>
                        </p>
                        {selectedStatus && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 uppercase', selectedStatus.badgeClass)}>
                              {selectedStatus.label}
                            </span>
                            {selectedStatus.amount > 0 ? (
                              <span className={cn('text-sm', balanceColor(selectedSummary.balance))}>{formatCurrency(selectedStatus.amount)}</span>
                            ) : (
                              <span className="text-slate-500">No dues</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPaymentOpen(true)} className="gap-2">
                        <Wallet2 className="h-4 w-4" /> Record payment
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          closeDialog(false)
                          navigate(`/inventory/customers/${selectedSummary.partyId}`)
                        }}
                      >
                        <FileText className="h-4 w-4" /> Statement
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => loadEntries(selectedSummary)}
                        aria-label="Refresh ledger"
                      >
                        <RefreshCcw className={cn('h-4 w-4', entriesLoading && 'animate-spin')} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Total sold</span>
                        <History className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div className="mt-2 text-lg font-semibold text-emerald-600">{formatCurrency(selectedSummary.totalSold)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Total purchased</span>
                        <ShoppingBag className="h-4 w-4 text-rose-400" />
                      </div>
                      <div className="mt-2 text-lg font-semibold text-rose-600">{formatCurrency(selectedSummary.totalPurchased)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Payments</span>
                        <CreditCard className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="mt-2 text-lg font-semibold text-emerald-600">{formatCurrency(selectedSummary.paymentsReceived)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Issued:{' '}
                        <span className="font-semibold text-rose-600">{formatCurrency(selectedSummary.paymentsIssued)}</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Balance</span>
                        <Wallet2 className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div className={cn('mt-2 text-lg font-semibold', balanceColor(selectedSummary.balance))}>{formatCurrency(selectedSummary.balance)}</div>
                      {selectedStatus && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedStatus.amount > 0 ? (
                            <span className="font-semibold">
                              {selectedStatus.label}:{' '}
                              <span className={balanceColor(selectedSummary.balance)}>{formatCurrency(selectedStatus.amount)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">All clear</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {entriesLoading ? (
                    <div className="grid place-items-center py-16 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {entries.map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                {formatDate(entry.entryDate)}
                                <EntryBadge entry={entry} />
                              </div>
                              {entry.paymentMethod && (
                                <div className="mt-1 text-xs text-muted-foreground">Payment method: <span className="font-medium text-slate-700">{entry.paymentMethod}</span></div>
                              )}
                            </div>
                            <div className={cn('text-lg font-semibold', entry.direction === 'in' ? 'text-emerald-600' : 'text-rose-600')}>
                              {entry.direction === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
                            </div>
                          </div>
                          {entry.notes && <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>}
                          {entry.metadata?.billingStatus && (
                            <div className="mt-2 text-[11px] uppercase tracking-wide text-indigo-500">Status: {entry.metadata.billingStatus}</div>
                          )}
                        </div>
                      ))}
                      {entries.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-muted-foreground">
                          No ledger entries for this customer yet.
                        </div>
                      )}
                    </div>
                  )}

                  {paymentOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 sm:p-6">
                      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-slate-900">Record payment</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Update the ledger when you receive or issue money.</p>
                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Amount</label>
                            <MoneyInput value={paymentState.amount} onChange={(value) => setPaymentState((state) => ({ ...state, amount: value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Payment method</label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                              value={paymentState.paymentMethod}
                              onChange={(event) => setPaymentState((state) => ({ ...state, paymentMethod: event.target.value }))}
                            >
                              {paymentOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <button
                              type="button"
                              onClick={() => setPaymentState((state) => ({ ...state, direction: 'out' }))}
                              className={cn('rounded-md border px-3 py-2 text-center font-medium transition', paymentState.direction === 'out' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}
                            >
                              Receive from customer
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentState((state) => ({ ...state, direction: 'in' }))}
                              className={cn('rounded-md border px-3 py-2 text-center font-medium transition', paymentState.direction === 'in' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}
                            >
                              Pay or refund customer
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {paymentState.direction === 'out'
                              ? 'Use when the customer gives you money or you want to apply credit towards their dues.'
                              : 'Use when you issue a refund or advance, increasing what you owe the customer.'}
                          </p>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Payment date</label>
                            <Input
                              type="date"
                              value={paymentState.entryDate}
                              onChange={(event) => setPaymentState((state) => ({ ...state, entryDate: event.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Notes</label>
                            <Input
                              value={paymentState.notes}
                              onChange={(event) => setPaymentState((state) => ({ ...state, notes: event.target.value }))}
                              placeholder="Optional note"
                            />
                          </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                          <Button variant="outline" onClick={() => { setPaymentOpen(false); resetPaymentForm() }}>Cancel</Button>
                          <Button onClick={handlePaymentSubmit} disabled={!paymentState.amount}>Save payment</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
