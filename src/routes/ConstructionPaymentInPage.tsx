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
import type { ProjectProfile, InflowSource } from '../types/projects'
import { INFLOW_SOURCE_GROUPS, getInflowSourceLabel } from '../lib/inflowSources'
import { TextField } from '@mui/material'

type FormState = {
  accountId: string
  amount?: number
  date: string
  counterparty: string
  notes: string
  inflowSource?: InflowSource
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
    accountId: '',
    amount: undefined,
    date: todayIso(),
    counterparty: '',
    notes: '',
  }
}

export default function ConstructionPaymentInPage() {
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
      setForm((prev) => ({ ...prev, accountId: prev.accountId || next.bankAccounts[0]?.id || '' }))
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!project || !form.accountId) {
      toast.error('Choose the receiving account')
      return
    }
    if (!form.amount || form.amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSaving(true)
    try {
      const account = project.bankAccounts.find((item) => item.id === form.accountId)
      const updated = await recordProjectFlow(project.id, {
        type: 'payment-in',
        amount: form.amount,
        date: form.date || todayIso(),
        accountId: account?.id,
        accountName: account?.label,
        counterparty: form.counterparty.trim() || undefined,
        notes: form.notes.trim() || undefined,
        inflowSource: form.inflowSource,
      })
      setProject(updated)
      toast.success('Payment in recorded')
      navigate(`/construction/${project.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Failed to record payment in')
    } finally {
      setSaving(false)
    }
  }

  const accounts = useMemo(() => project?.bankAccounts ?? [], [project])
  const latest = useMemo(() => project?.flows.filter((flow) => flow.type === 'payment-in').slice(0, 5) ?? [], [project])

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
            <h1 className="text-2xl font-semibold text-foreground">Record payment in</h1>
            <p className="text-sm text-muted-foreground">Capture client deposits and other inflows.</p>
          </div>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Payment details</CardTitle>
          <p className="text-sm text-muted-foreground">All fields can be edited later from the statement page.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Receiving account">
                <select
                  value={form.accountId}
                  onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
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
              <FormField label="Counterparty">
                <Input value={form.counterparty} onChange={(event) => setForm((prev) => ({ ...prev, counterparty: event.target.value }))} placeholder="Customer or source" />
              </FormField>
              <FormField label="Inflow Source" className="md:col-span-2">
                <select
                  value={form.inflowSource || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, inflowSource: event.target.value as InflowSource || undefined }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select inflow source (optional)</option>
                  {Object.entries(INFLOW_SOURCE_GROUPS).map(([group, sources]) => (
                    <optgroup key={group} label={group}>
                      {sources.map((source) => (
                        <option key={source.value} value={source.value}>
                          {source.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </FormField>
            </div>

            {/* Inflow Source Display Badge */}
            {form.inflowSource && (
              <div className="rounded-lg border-2 border-cyan-200 bg-cyan-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Selected Inflow Source</p>
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded-md bg-cyan-100 px-3 py-2 text-sm font-semibold text-cyan-900">
                    ✓ {getInflowSourceLabel(form.inflowSource)}
                  </span>
                </div>
              </div>
            )}

            <FormField label="Notes">
              <TextField
                id="outlined-notes"
                label=""
                value={form.notes}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }}
                placeholder="Optional reference"
                multiline
                rows={3}
                fullWidth
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Record payment in
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Latest payments in</CardTitle>
          <p className="text-sm text-muted-foreground">Reference the most recent inflows at a glance.</p>
        </CardHeader>
        <CardContent>
          {latest.length === 0 ? (
            <div className="grid min-h-[140px] place-items-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Counterparty</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((flow) => (
                    <tr key={flow.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pr-3 text-muted-foreground">{formatDateDisplay(flow.date)}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{flow.accountName || '--'}</td>
                      <td className="py-3 pr-3 text-emerald-600 font-medium">{formatCurrency(Number(flow.amount) || 0)}</td>
                      <td className="py-3 pr-3">
                        {flow.inflowSource ? (
                          <span className="inline-block rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700">
                            {getInflowSourceLabel(flow.inflowSource)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{flow.counterparty || '--'}</td>
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
  className?: string
}

function FormField({ label, children, className }: FormFieldProps) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-muted-foreground ${className || ''}`}>
      {label}
      {children}
    </label>
  )
}
