import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, RefreshCcw, Save } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { addProjectBankAccount, getProjectProfile } from '../services/projects'

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'personal', label: 'Personal' },
] as const

type FormState = {
  label: string
  bankName: string
  branch: string
  accountNumber: string
  accountType: 'company' | 'personal'
  notes: string
}

function createEmptyForm(): FormState {
  return {
    label: '',
    bankName: '',
    branch: '',
    accountNumber: '',
    accountType: 'company',
    notes: '',
  }
}

export default function ConstructionBankAccountsAddPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [form, setForm] = useState<FormState>(createEmptyForm)
  const [saving, setSaving] = useState(false)

  const goBack = () => {
    if (projectId) navigate(`/construction/${projectId}/bank-accounts`)
    else navigate(-1)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    if (!form.label.trim()) {
      toast.error('Account name is required')
      return
    }
    setSaving(true)
    try {
      const project = await getProjectProfile(projectId)
      if (!project) throw new Error('Project not found')
      await addProjectBankAccount(projectId, {
        label: form.label.trim(),
        bankName: form.bankName.trim() || undefined,
        branch: form.branch.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        accountType: form.accountType,
        notes: form.notes.trim() || undefined,
      })
      toast.success('Bank account added')
      navigate(`/construction/${projectId}/bank-accounts`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Failed to add account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={goBack} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="mt-1">
          <h1 className="text-2xl font-semibold text-foreground">Add bank account</h1>
          <p className="text-sm text-muted-foreground">Store institution and owner details for statements.</p>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <p className="text-sm text-muted-foreground">Once saved, the account will appear on the accounts dashboard.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
            <Field label="Account name / owner">
              <Input value={form.label} onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))} required />
            </Field>
            <Field label="Bank name">
              <Input value={form.bankName} onChange={(event) => setForm((prev) => ({ ...prev, bankName: event.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Branch">
              <Input value={form.branch} onChange={(event) => setForm((prev) => ({ ...prev, branch: event.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Account number">
              <Input value={form.accountNumber} onChange={(event) => setForm((prev) => ({ ...prev, accountNumber: event.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Account type">
              <select
                value={form.accountType}
                onChange={(event) => setForm((prev) => ({ ...prev, accountType: event.target.value as 'company' | 'personal' }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional description"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

type FieldProps = {
  label: string
  children: React.ReactNode
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  )
}
