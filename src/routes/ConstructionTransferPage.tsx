import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, RefreshCcw, Save } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import MoneyInput from '../components/fields/MoneyInput'
import { formatCurrency } from '../lib/format'
import { formatAppDate } from '../lib/date'
import { getProjectProfile, recordProjectFlow } from '../services/projects'
import type { ProjectProfile } from '../types/projects'

type FormState = {
  fromAccountId: string
  toAccountId: string
  amount?: number
  date: string
  notes: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateDisplay(value?: string): string {
  const label = formatAppDate(value)
  return label || '--'
}

function createEmptyForm(): FormState {
  return {
    fromAccountId: '',
    toAccountId: '',
    amount: undefined,
    date: todayIso(),
    notes: '',
  }
}

export default function ConstructionTransferPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [form, setForm] = useState<FormState>(createEmptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProject = useCallback(async () => {
    if (!projectId) return
    try {
      const next = await getProjectProfile(projectId)
      if (!next) {
        setProject(null)
        setError('Project not found')
        return
      }
      setProject(next)
      setError(null)
      setForm((prev) => ({
        ...prev,
        fromAccountId: prev.fromAccountId || next.bankAccounts[0]?.id || '',
        toAccountId:
          prev.toAccountId && prev.toAccountId !== prev.fromAccountId
            ? prev.toAccountId
            : next.bankAccounts.find((account) => account.id !== (prev.fromAccountId || next.bankAccounts[0]?.id))?.id || '',
      }))
    } catch (err: any) {
      console.error(err)
      const message = err?.message ?? 'Failed to load project'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadProject().catch(() => undefined)
  }, [loadProject])

  const goBack = () => {
    if (projectId) navigate(`/construction/${projectId}`)
    else navigate(-1)
  }

  const accounts = useMemo(() => project?.bankAccounts ?? [], [project])
  const availableTargets = accounts.filter((account) => account.id !== form.fromAccountId)
  const latestTransfers = useMemo(() => project?.flows.filter((flow) => flow.type === 'transfer').slice(0, 5) ?? [], [project])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!project || !form.fromAccountId || !form.toAccountId) {
      toast.error('Choose both accounts')
      return
    }
    if (form.fromAccountId === form.toAccountId) {
      toast.error('Select different accounts')
      return
    }
    if (!form.amount || form.amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSaving(true)
    try {
      const fromAccount = project.bankAccounts.find((account) => account.id === form.fromAccountId)
      const toAccount = project.bankAccounts.find((account) => account.id === form.toAccountId)
      const updated = await recordProjectFlow(project.id, {
        type: 'transfer',
        amount: form.amount,
        date: form.date || todayIso(),
        fromAccountId: fromAccount?.id,
        fromAccountName: fromAccount?.label,
        toAccountId: toAccount?.id,
        toAccountName: toAccount?.label,
        notes: form.notes.trim() || undefined,
      })
      setProject(updated)
      toast.success('Transfer recorded')
      navigate(`/construction/${project.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Failed to record transfer')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !project) {
    return <div className="grid min-h-[40vh] place-items-center text-muted-foreground">Loading...</div>
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
            <CardTitle>Unable to load project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={loadProject} className="w-fit gap-2">
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={goBack} className="w-fit gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="mt-1">
            <h1 className="text-2xl font-semibold text-foreground">Record transfer</h1>
            <p className="text-sm text-muted-foreground">Move balances between project accounts.</p>
          </div>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Transfer details</CardTitle>
          <p className="text-sm text-muted-foreground">Funds stay within the project but shift between accounts.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="From account">
                <select
                  value={form.fromAccountId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      fromAccountId: event.target.value,
                      toAccountId:
                        prev.toAccountId && prev.toAccountId !== event.target.value
                          ? prev.toAccountId
                          : accounts.find((account) => account.id !== event.target.value)?.id || '',
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="To account">
                <select
                  value={form.toAccountId}
                  onChange={(event) => setForm((prev) => ({ ...prev, toAccountId: event.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select</option>
                  {availableTargets.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Amount">
                <MoneyInput value={form.amount} onChange={(value) => setForm((prev) => ({ ...prev, amount: value }))} placeholder="0.00" />
              </FormField>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional reference"
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Record transfer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Latest transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {latestTransfers.length === 0 ? (
            <div className="grid min-h-[140px] place-items-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
              No transfers recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Route</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTransfers.map((flow) => (
                    <tr key={flow.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pr-3 text-muted-foreground">{formatDateDisplay(flow.date)}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{`${flow.fromAccountName || '--'} -> ${flow.toAccountName || '--'}`}</td>
                      <td className="py-3 pr-3 text-sky-600">{formatCurrency(Number(flow.amount) || 0)}</td>
                      <td className="py-3 text-muted-foreground">{flow.notes || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type FormFieldProps = {
  label: string
  children: React.ReactNode
}

function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  )
}
