import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, RefreshCcw, Save, Search } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import MoneyInput from '../components/fields/MoneyInput'
import { useCategories } from '../hooks/useCategories'
import { formatCurrency } from '../lib/format'
import { formatAppDate } from '../lib/date'
import { cn } from '../lib/utils'
import { getProjectProfile, recordProjectFlow } from '../services/projects'
import type { ProjectProfile } from '../types/projects'
import type { Category } from '../types/categories'

type FormState = {
  accountId: string
  categoryId: string
  amount?: number
  date: string
  counterparty: string
  notes: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateDisplay(value?: string): string {
  const label = formatAppDate(value)
  return label || '--'
}

function buildCategoryPath(id: string, map: Map<string, Category>): string {
  const parts: string[] = []
  let current = map.get(id)
  while (current) {
    parts.unshift(current.name)
    current = current.parent_id ? map.get(current.parent_id) : undefined
  }
  return parts.join(' / ')
}

function createEmptyForm(): FormState {
  return {
    accountId: '',
    categoryId: '',
    amount: undefined,
    date: todayIso(),
    counterparty: '',
    notes: '',
  }
}

export default function ConstructionPaymentOutPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [form, setForm] = useState<FormState>(createEmptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: categories } = useCategories()

  const categoriesMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories.forEach((category) => map.set(category.id, category))
    return map
  }, [categories])

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return categories
    return categories.filter((category) => buildCategoryPath(category.id, categoriesMap).toLowerCase().includes(term))
  }, [categories, categoriesMap, search])

  const selectedCategoryName = form.categoryId ? buildCategoryPath(form.categoryId, categoriesMap) : ''

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
      toast.error('Select a paying account')
      return
    }
    if (!form.categoryId) {
      toast.error('Select a category')
      return
    }
    if (!form.amount || form.amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSaving(true)
    try {
      const account = project.bankAccounts.find((item) => item.id === form.accountId)
      const categoryName = selectedCategoryName || undefined
      const updated = await recordProjectFlow(project.id, {
        type: 'payment-out',
        amount: form.amount,
        date: form.date || todayIso(),
        accountId: account?.id,
        accountName: account?.label,
        categoryId: form.categoryId,
        categoryName,
        purpose: categoryName,
        counterparty: form.counterparty.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      setProject(updated)
      toast.success('Payment out recorded')
      navigate(`/construction/${project.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Failed to record payment out')
    } finally {
      setSaving(false)
    }
  }

  const accounts = useMemo(() => project?.bankAccounts ?? [], [project])
  const latest = useMemo(() => project?.flows.filter((flow) => flow.type === 'payment-out').slice(0, 5) ?? [], [project])

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
            <h1 className="text-2xl font-semibold text-foreground">Record payment out</h1>
            <p className="text-sm text-muted-foreground">Capture expenses and vendor payments.</p>
          </div>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
          <p className="text-sm text-muted-foreground">Assign each payment to an account and category.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Paying account">
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
              <FormField label="Vendor / counterparty">
                <Input value={form.counterparty} onChange={(event) => setForm((prev) => ({ ...prev, counterparty: event.target.value }))} placeholder="Supplier or payee" />
              </FormField>
            </div>
            <FormField label="Category">
              <div className="rounded-xl border border-border/60 bg-muted/10">
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search categories"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredCategories.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">No categories found.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {filteredCategories.map((category) => {
                        const path = buildCategoryPath(category.id, categoriesMap)
                        const active = form.categoryId === category.id
                        return (
                          <li key={category.id}>
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, categoryId: category.id }))}
                              className={cn(
                                'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition',
                                active ? 'bg-primary/10 font-medium text-foreground' : 'hover:bg-muted/30'
                              )}
                            >
                              <span>{path}</span>
                              {active ? <span className="text-[10px] uppercase text-primary">Selected</span> : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                {selectedCategoryName ? (
                  <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    Chosen category: {selectedCategoryName}
                  </div>
                ) : null}
              </div>
            </FormField>
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
                Record payment out
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Latest payments out</CardTitle>
          <p className="text-sm text-muted-foreground">A quick view of the most recent expenses.</p>
        </CardHeader>
        <CardContent>
          {latest.length === 0 ? (
            <div className="grid min-h-[140px] place-items-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Vendor</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((flow) => (
                    <tr key={flow.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pr-3 text-muted-foreground">{formatDateDisplay(flow.date)}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{flow.accountName || '--'}</td>
                      <td className="py-3 pr-3 text-rose-600">{formatCurrency(Number(flow.amount) || 0)}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{flow.categoryName || '--'}</td>
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
}

function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  )
}
