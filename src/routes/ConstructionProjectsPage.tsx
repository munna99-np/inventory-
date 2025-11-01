import type { ProjectProfile, ProjectStatus } from '../types/projects'
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import MoneyInput from '../components/fields/MoneyInput'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { formatCurrency } from '../lib/format'
import {
  createProjectProfile,
  deleteProjectProfile,
  listProjectProfiles,
  summarizeProjectFlows,
} from '../services/projects'
import { toast } from 'sonner'
import { ConstructionWorkspaceTabs } from '../features/projects/ConstructionWorkspaceTabs'

type CreateFormState = {
  name: string
  code: string
  client: string
  location: string
  description: string
  status: ProjectStatus
  startDate: string
  dueDate: string
  budget?: number
  accentColor?: string
}

type FilterStatus = 'all' | ProjectStatus

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'draft', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
]

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Planning',
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
}

const ACCENT_PRESETS = ['#6366f1', '#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#64748b']

function createEmptyForm(): CreateFormState {
  return {
    name: '',
    code: '',
    client: '',
    location: '',
    description: '',
    status: 'draft',
    startDate: '',
    dueDate: '',
    budget: undefined,
    accentColor: ACCENT_PRESETS[0],
  }
}

export default function ConstructionProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(() => createEmptyForm())
  const [createSaving, setCreateSaving] = useState(false)

  const loadProjects = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await listProjectProfiles()
      setProjects(data)
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message ?? 'Failed to load construction projects')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects(true)
    const handler = () => {
      loadProjects(false).catch(() => undefined)
    }
    window.addEventListener('construction:projects:changed', handler)
    return () => {
      window.removeEventListener('construction:projects:changed', handler)
    }
  }, [loadProjects])

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase()
    return projects.filter((project) => {
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter
      if (!term) return matchesStatus
      const haystack = [project.name, project.code, project.client, project.location]
        .map((value) => value?.toLowerCase() ?? '')
        .join(' ')
      return matchesStatus && haystack.includes(term)
    })
  }, [projects, query, statusFilter])

  const portfolioSummary = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.totalBudget += project.budget ?? 0
        const summary = summarizeProjectFlows(project)
        acc.totalSpend += summary.totalAmount
        if (project.status === 'active') acc.active += 1
        if (project.status === 'completed') acc.completed += 1
        return acc
      },
      { totalBudget: 0, totalSpend: 0, active: 0, completed: 0 }
    )
  }, [projects])

  const handleCreateProject = async () => {
    const name = createForm.name.trim()
    if (!name) {
      toast.error('Project name is required')
      return
    }
    setCreateSaving(true)
    try {
      await createProjectProfile({
        name,
        code: createForm.code.trim() || undefined,
        client: createForm.client.trim() || undefined,
        description: createForm.description.trim() || undefined,
        location: createForm.location.trim() || undefined,
        status: createForm.status,
        startDate: createForm.startDate || undefined,
        dueDate: createForm.dueDate || undefined,
        budget: createForm.budget,
        accentColor: createForm.accentColor,
      })
      await loadProjects(false)
      toast.success('Construction project created')
      setCreateForm(createEmptyForm())
      setCreateOpen(false)
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message ?? 'Failed to create project')
    } finally {
      setCreateSaving(false)
    }
  }

  const handleDeleteProject = async (project: ProjectProfile) => {
    const confirmed = window.confirm(`Delete project "${project.name}"? This cannot be undone.`)
    if (!confirmed) return
    try {
      await deleteProjectProfile(project.id)
      setProjects((prev) => prev.filter((item) => item.id !== project.id))
      toast.success('Project removed')
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message ?? 'Failed to delete project')
    }
  }

  return (
    <div className="space-y-8">
      <ConstructionWorkspaceTabs active="projects" />

      <HeroSummary
        projects={projects.length}
        active={portfolioSummary.active}
        completed={portfolioSummary.completed}
        totalBudget={portfolioSummary.totalBudget}
        totalSpend={portfolioSummary.totalSpend}
        onCreate={() => setCreateOpen(true)}
      />

      <Filters
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onRefresh={() => loadProjects(true)}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Project Profiles</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadProjects(true)}>Refresh</Button>
            <Button onClick={() => setCreateOpen(true)}>New Project</Button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-48 rounded-xl border border-dashed border-border/60 bg-muted/30 animate-pulse"
              ></div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-12 text-center text-sm text-muted-foreground">
            <p>No projects match the current filters. Try adjusting the search or create a new project.</p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setCreateOpen(true)}>Create your first project</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate(`/construction/${project.id}`)}
                onDelete={() => handleDeleteProject(project)}
              />
            ))}
          </div>
        )}
      </section>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreateForm(createEmptyForm())
        }}
        form={createForm}
        onFormChange={setCreateForm}
        onSubmit={handleCreateProject}
        saving={createSaving}
      />
    </div>
  )
}

type HeroSummaryProps = {
  projects: number
  active: number
  completed: number
  totalBudget: number
  totalSpend: number
  onCreate: () => void
}

function HeroSummary({ projects, active, completed, totalBudget, totalSpend, onCreate }: HeroSummaryProps) {
  const gradient = 'linear-gradient(135deg, rgba(59,130,246,0.95), rgba(126,34,206,0.95))'
  return (
    <div
      className="rounded-3xl border border-white/10 bg-primary/90 text-primary-foreground shadow-xl"
      style={{ backgroundImage: gradient }}
    >
      <div className="p-6 md:p-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.25em] text-white/70">Construction cockpit</p>
          <h1 className="text-2xl md:text-3xl font-semibold">Design beautiful project profiles & control every transfer</h1>
          <p className="text-sm text-white/80">
            Keep unlimited projects, capture custom inputs, link bank accounts, and monitor each payment or transfer with richly detailed reports.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-white/80">
            <SummaryStat label="Total projects" value={projects.toString()} />
            <SummaryStat label="Active" value={active.toString()} />
            <SummaryStat label="Completed" value={completed.toString()} />
            <SummaryStat label="Portfolio spend" value={formatCurrency(totalSpend)} />
            <SummaryStat label="Portfolio budget" value={formatCurrency(totalBudget)} className="sm:col-span-2" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90" onClick={onCreate}>
            Create Project
          </Button>
          <p className="text-xs text-white/70 max-w-xs text-right">
            Configure accents, add parent hierarchies, attach accounts, and log every transaction with one click.
          </p>
        </div>
      </div>
    </div>
  )
}

type SummaryStatProps = {
  label: string
  value: string
  className?: string
}

function SummaryStat({ label, value, className }: SummaryStatProps) {
  return (
    <div className={`rounded-xl bg-black/20 px-4 py-3 ${className ?? ''}`}>
      <p className="text-[11px] uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

type FiltersProps = {
  query: string
  onQueryChange: (value: string) => void
  statusFilter: FilterStatus
  onStatusChange: (value: FilterStatus) => void
  onRefresh: () => void
}

function Filters({ query, onQueryChange, statusFilter, onStatusChange, onRefresh }: FiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 items-center gap-3">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by project name, client, location..."
          className="h-11 rounded-xl"
        />
        {query && (
          <Button variant="ghost" onClick={() => onQueryChange('')} className="h-11">
            Clear
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(value) => onStatusChange(value as FilterStatus)}>
          <SelectTrigger className="w-40 h-11 rounded-xl">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-11" onClick={onRefresh}>
          Sync
        </Button>
      </div>
    </div>
  )
}

type CreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: CreateFormState
  onFormChange: Dispatch<SetStateAction<CreateFormState>>
  onSubmit: () => void
  saving: boolean
}

function CreateProjectDialog({ open, onOpenChange, form, onFormChange, onSubmit, saving }: CreateProjectDialogProps) {
  const updateForm = (patch: Partial<CreateFormState>) => {
    onFormChange((prev) => ({ ...prev, ...patch }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-3xl bg-white/95 p-6 shadow-2xl">
        <DialogTitle className="text-xl font-semibold">Create construction project profile</DialogTitle>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project name</label>
            <Input
              value={form.name}
              onChange={(event) => updateForm({ name: event.target.value })}
              placeholder="e.g. Lakeside Residency Tower"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project code</label>
            <Input
              value={form.code}
              onChange={(event) => updateForm({ code: event.target.value })}
              placeholder="Optional code"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Client / Owner</label>
            <Input
              value={form.client}
              onChange={(event) => updateForm({ client: event.target.value })}
              placeholder="Client name"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</label>
            <Input
              value={form.location}
              onChange={(event) => updateForm({ location: event.target.value })}
              placeholder="Project location"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
            <Select value={form.status} onValueChange={(value) => updateForm({ status: value as ProjectStatus })}>
              <SelectTrigger className="mt-1 h-11">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget</label>
            <MoneyInput value={form.budget} onChange={(value) => updateForm({ budget: value })} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Start date</label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(event) => updateForm({ startDate: event.target.value })}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Due date</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => updateForm({ dueDate: event.target.value })}
              className="mt-1 h-11"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
            <textarea
              value={form.description}
              onChange={(event) => updateForm({ description: event.target.value })}
              placeholder="Short note about the project, milestones, or deliverables"
              className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={3}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Accent palette</label>
            <div className="mt-2 flex flex-wrap gap-3">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateForm({ accentColor: color })}
                  className="h-10 w-10 rounded-full border-2 transition-all"
                  style={{
                    background: color,
                    borderColor: form.accentColor === color ? '#ffffff' : 'rgba(255,255,255,0.35)',
                    boxShadow: form.accentColor === color ? `0 0 0 4px ${color}55` : 'none',
                  }}
                  aria-label={`Select accent ${color}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create project'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ProjectCardProps = {
  project: ProjectProfile
  onOpen: () => void
  onDelete: () => void
}

function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const summary = useMemo(() => summarizeProjectFlows(project), [project])
  const accent = project.accentColor ?? '#6366f1'
  const gradient = accentGradient(accent)
  const budget = project.budget ?? 0
  const spend = summary.totalAmount
  const progress = budget ? Math.min(100, Math.round((spend / budget) * 100)) : 0
  const overspend = budget ? spend > budget : false
  const featuredFields = project.customFields.slice(0, 3)

  return (
    <Card className="relative flex h-full flex-col overflow-hidden border border-border/80 bg-card/80">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-start justify-between gap-3">
          <span className="text-lg font-semibold leading-snug">{project.name}</span>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium text-white shadow-sm"
            style={{ background: gradient }}
          >
            {STATUS_LABEL[project.status]}
          </span>
        </CardTitle>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {project.code && <p className="font-medium text-foreground/80">#{project.code}</p>}
          <p>
            {project.client ? <span className="font-medium text-foreground">Client:</span> : null}{' '}
            {project.client || 'Not assigned'}
          </p>
          <p>
            {project.location ? <span className="font-medium text-foreground">Location:</span> : null}{' '}
            {project.location || 'TBD'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="mt-5 flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Budget" value={budget ? formatCurrency(budget) : 'Not set'} />
          <Metric
            label="Spent"
            value={formatCurrency(spend)}
            highlight={overspend}
          />
          <Metric label="Parents" value={project.parents.length.toString()} />
          <Metric label="Accounts" value={project.bankAccounts.length.toString()} />
        </div>
        {budget ? (
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted/60">
              <div
                className={`h-full rounded-full transition-all ${overspend ? 'bg-red-500' : ''}`}
                style={{
                  width: `${Math.min(progress, 100)}%`,
                  background: overspend ? undefined : gradient,
                }}
              ></div>
            </div>
          </div>
        ) : null}
        {project.description ? (
          <p className="text-sm text-muted-foreground line-clamp-3">{project.description}</p>
        ) : null}
        {featuredFields.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {featuredFields.map((field) => (
              <span key={field.id} className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                <span className="font-medium text-foreground/80">{field.label}:</span> {field.value}
              </span>
            ))}
            {project.customFields.length > featuredFields.length ? (
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                +{project.customFields.length - featuredFields.length} more
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600 hover:bg-red-50">
            Delete
          </Button>
          <Button size="sm" onClick={onOpen}>
            Open profile
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type MetricProps = {
  label: string
  value: string
  highlight?: boolean
}

function Metric({ label, value, highlight }: MetricProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs">
      <p className="uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${highlight ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function accentGradient(color: string): string {
  try {
    const shadow = adjustColor(color, -0.25)
    return `linear-gradient(135deg, ${color}, ${shadow})`
  } catch {
    return 'linear-gradient(135deg, #6366f1, #4338ca)'
  }
}

function adjustColor(color: string, amount: number): string {
  let hex = color.trim()
  if (!hex.startsWith('#')) return color
  hex = hex.slice(1)
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  const num = parseInt(hex, 16)
  if (Number.isNaN(num)) return color
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount)
    g = Math.round(g + (255 - g) * amount)
    b = Math.round(b + (255 - b) * amount)
  } else {
    const factor = 1 + amount
    r = Math.round(r * factor)
    g = Math.round(g * factor)
    b = Math.round(b * factor)
  }
  const clamp = (value: number) => Math.min(255, Math.max(0, value))
  const hexString = ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)
  return `#${hexString}`
}









