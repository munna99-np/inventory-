import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, RefreshCcw, Save } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import MoneyInput from '../components/fields/MoneyInput'
import { cn } from '../lib/utils'
import { getProjectProfile, updateProjectProfile } from '../services/projects'
import type { ProjectProfile } from '../types/projects'

type FormState = {
  name: string
  status: string
  code: string
  client: string
  location: string
  startDate: string
  dueDate: string
  budget?: number
  description: string
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
]

function buildForm(project: ProjectProfile): FormState {
  return {
    name: project.name ?? '',
    status: project.status,
    code: project.code ?? '',
    client: project.client ?? '',
    location: project.location ?? '',
    startDate: project.startDate ? project.startDate.slice(0, 10) : '',
    dueDate: project.dueDate ? project.dueDate.slice(0, 10) : '',
    budget: project.budget,
    description: project.description ?? '',
  }
}

export default function ConstructionProjectOverviewPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const next = await getProjectProfile(projectId)
      if (!next) {
        setProject(null)
        setForm(null)
        setError('Project not found')
        return
      }
      setProject(next)
      setForm(buildForm(next))
      setError(null)
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
    load().catch(() => undefined)
  }, [load])

  const goBack = () => {
    if (projectId) navigate(`/construction/${projectId}`)
    else navigate(-1)
  }

  const handleChange = (patch: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!project || !form) return
    setSaving(true)
    try {
      const updated = await updateProjectProfile(project.id, {
        name: form.name,
        status: form.status as any,
        code: form.code.trim() || undefined,
        client: form.client.trim() || undefined,
        location: form.location.trim() || undefined,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        budget: form.budget,
        description: form.description.trim() || undefined,
      })
      setProject(updated)
      setForm(buildForm(updated))
      toast.success('Project details updated')
      navigate(`/construction/${updated.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !project) {
    return <div className="grid min-h-[40vh] place-items-center text-muted-foreground">Loading project...</div>
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
          <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      </div>
    )
  }

  if (!project || !form) return null

  return (
    <div className="space-y-8 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={goBack} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="mt-1">
          <h1 className="text-2xl font-semibold text-foreground">Project overview</h1>
          <p className="text-sm text-muted-foreground">Update project profile, schedule, and stakeholders.</p>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <p className="text-sm text-muted-foreground">This information is displayed across construction workflows.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Project name" full>
              <Input value={form.name} onChange={(event) => handleChange({ name: event.target.value })} required />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) => handleChange({ status: event.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project code">
              <Input value={form.code} onChange={(event) => handleChange({ code: event.target.value })} placeholder="Optional code" />
            </Field>
            <Field label="Client">
              <Input value={form.client} onChange={(event) => handleChange({ client: event.target.value })} placeholder="Client name" />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(event) => handleChange({ location: event.target.value })} placeholder="Site location" />
            </Field>
            <Field label="Budget">
              <MoneyInput value={form.budget} onChange={(value) => handleChange({ budget: value })} placeholder="0.00" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.startDate} onChange={(event) => handleChange({ startDate: event.target.value })} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.dueDate} onChange={(event) => handleChange({ dueDate: event.target.value })} />
            </Field>
            <Field label="Description" full>
              <textarea
                value={form.description}
                onChange={(event) => handleChange({ description: event.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Summary, milestones, or internal notes"
              />
            </Field>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="submit" className="gap-2" disabled={saving}>
                {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
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
  full?: boolean
}

function Field({ label, children, full = false }: FieldProps) {
  return (
    <div className={cn('space-y-2', full ? 'md:col-span-2' : '')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
