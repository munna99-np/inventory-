import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Plus, RefreshCcw } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatCurrency } from '../lib/format'
import { formatAppDate } from '../lib/date'
import { cn } from '../lib/utils'
import { addProjectBankAccount, getProjectProfile } from '../services/projects'
import type { ProjectBankAccount, ProjectProfile } from '../types/projects'

const ACCOUNT_TYPE_LABEL: Record<'company' | 'personal', string> = {
  company: 'Company',
  personal: 'Personal',
}

export default function ConstructionBankAccountsPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [accounts, setAccounts] = useState<ProjectBankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (withSpinner = false) => {
      if (!projectId) return
      if (withSpinner) setRefreshing(true)
      try {
        const next = await getProjectProfile(projectId)
        if (!next) {
          setProject(null)
          setAccounts([])
          setError('Project not found')
          return
        }
        setProject(next)
        setAccounts(next.bankAccounts)
        setError(null)
      } catch (err: any) {
        console.error(err)
        const message = err?.message ?? 'Failed to load bank accounts'
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [projectId]
  )

  useEffect(() => {
    load(true).catch(() => undefined)
  }, [load])

  const goBack = () => {
    if (projectId) navigate(`/construction/${projectId}`)
    else navigate(-1)
  }

  const goAddAccount = () => {
    if (!projectId) return
    navigate(`/construction/${projectId}/bank-accounts/new`)
  }

  const openStatement = (accountId: string) => {
    if (!projectId) return
    navigate(`/construction/${projectId}/accounts/${accountId}`)
  }

  const latestSummary = useMemo(() => {
    if (!project) return null
    const inflow = project.flows.filter((flow) => flow.type === 'payment-in').reduce((acc, flow) => acc + Number(flow.amount || 0), 0)
    const outflow = project.flows.filter((flow) => flow.type === 'payment-out').reduce((acc, flow) => acc + Number(flow.amount || 0), 0)
    const transfers = project.flows.filter((flow) => flow.type === 'transfer').reduce((acc, flow) => acc + Number(flow.amount || 0), 0)
    return { inflow, outflow, transfers }
  }, [project])

  const handleCreateQuickAccount = async () => {
    if (!projectId) return
    try {
      const updated = await addProjectBankAccount(projectId, { label: 'Untitled account', accountType: 'company' })
      setProject(updated)
      setAccounts(updated.bankAccounts)
      toast.success('Account added, open details to edit.')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Failed to add account')
    }
  }

  if (loading && !project) {
    return <div className="grid min-h-[40vh] place-items-center text-muted-foreground">Loading accounts...</div>
  }

  if (error && !project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={goBack} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Unable to load accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => load(true)} className="w-fit gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={goBack} className="w-fit gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="mt-1">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">Bank accounts</h1>
            <p className="text-sm text-muted-foreground">Card view of project accounts and quick statement access.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} className="h-8 gap-1.5 px-3 text-xs">
            <RefreshCcw className={cn('h-3.5 w-3.5', refreshing ? 'animate-spin' : '')} />
            Refresh
          </Button>
          <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={goAddAccount}>
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </Button>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Portfolio summary</CardTitle>
          <p className="text-sm text-muted-foreground">Snapshot of cash flows across all accounts.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Payments in" value={formatCurrency(latestSummary?.inflow ?? 0)} tone="text-emerald-600" />
          <SummaryTile label="Payments out" value={formatCurrency(latestSummary?.outflow ?? 0)} tone="text-rose-600" />
          <SummaryTile label="Transfers" value={formatCurrency(latestSummary?.transfers ?? 0)} tone="text-sky-600" />
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>No accounts yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Add a card to start tracking balances.</p>
            <Button onClick={handleCreateQuickAccount} className="gap-2">
              <Plus className="h-4 w-4" />
              Add blank account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="group relative overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="absolute right-4 top-4 h-32 w-32 rounded-full bg-white/10 blur-xl transition group-hover:bg-white/20" />
              <div className="relative space-y-3">
                <p className="text-xs uppercase tracking-wide text-white/60">{ACCOUNT_TYPE_LABEL[account.accountType || 'personal']}</p>
                <h2 className="text-xl font-semibold">{account.label}</h2>
                <p className="text-sm text-white/70">{account.bankName || 'Bank not set'}</p>
                <div className="space-y-1 text-xs text-white/60">
                  <p>Account number: {account.accountNumber || '--'}</p>
                  <p>Branch: {account.branch || '--'}</p>
                  <p>Added: {formatAppDate(account.createdAt) || '-'}</p>
                </div>
                {account.notes ? <p className="text-xs text-white/70">Notes: {account.notes}</p> : null}
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => openStatement(account.id)} className="gap-2 border-white/40 bg-white/10 text-white hover:bg-white/20">
                    View statement
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type SummaryTileProps = {
  label: string
  value: string
  tone: string
}

function SummaryTile({ label, value, tone }: SummaryTileProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone)}>{value}</p>
    </div>
  )
}
