import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { cn } from '../lib/utils'
import { formatCurrency } from '../lib/format'
import { TextField } from '@mui/material'
import { ConstructionWorkspaceTabs } from '../features/projects/ConstructionWorkspaceTabs'
import {
  getTenderAnalysis,
  listProjectProfiles,
  listTenderAnalyses,
  saveTenderAnalysis,
  searchTenderLineSuggestions,
  type TenderAnalysisSummary,
  type TenderLineSuggestion,
} from '../services/projects'
import type { ProjectTenderRecord, ProjectTenderStatus } from '../types/projects'

type TenderDetailsForm = {
  projectId: string
  tenderNumber: string
  title: string
  closingDate: string
  status: ProjectTenderStatus
  currency: string
  taxProfileId: string
  createdBy: string
}

type LineFormState = {
  name: string
  unit: string
  quantity: string
  rate: string
  vendor: string
  notes: string
}

type LineEntry = {
  id: string
  name: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
  vendor?: string
  notes?: string
  pricingSource?: string
  suggestionSource?: string
}

type TenderMeta = {
  id?: string
  storage?: 'supabase' | 'local'
  createdAt: string
  createdBy?: string | null
  lastEditedAt: string
  lastEditedBy?: string | null
}

type ProjectOption = {
  id: string
  name: string
}

const TENDER_STATUSES: ProjectTenderStatus[] = ['draft', 'submitted', 'awarded', 'cancelled']

const STATUS_LABELS: Record<ProjectTenderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  awarded: 'Awarded',
  cancelled: 'Cancelled',
}

const UNIT_OPTIONS = [
  'pcs',
  'kg',
  'bag',
  'm',
  'm2',
  'm3',
  'ft2',
  'ft3',
  'ton',
  'hr',
  'day',
  'week',
  'month',
  'ls',
]

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function generateTenderNumber(seed?: string) {
  const date = new Date()
  const stamp =
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).slice(2, 5).toUpperCase()
  const prefix = seed ? seed.slice(0, 3).toUpperCase() : 'TN'
  return `${prefix}-${stamp}-${random}`
}

function createLineId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 10)
}

function parseNumber(value: string) {
  if (!value) return Number.NaN
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return Number.NaN
  return Number.parseFloat(normalized)
}

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function createInitialDetails(projectId = ''): TenderDetailsForm {
  return {
    projectId,
    tenderNumber: generateTenderNumber(projectId),
    title: '',
    closingDate: '',
    status: 'draft',
    currency: 'NPR',
    taxProfileId: '',
    createdBy: '',
  }
}

function createEmptyLineForm(): LineFormState {
  return {
    name: '',
    unit: 'pcs',
    quantity: '',
    rate: '',
    vendor: '',
    notes: '',
  }
}

function formatDisplayDate(value?: string | null) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return dateFormatter.format(parsed)
}
export default function ConstructionPriceAnalysisPage() {
  const navigate = useNavigate()
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [detailsForm, setDetailsForm] = useState<TenderDetailsForm>(() => createInitialDetails())
  const [lineForm, setLineForm] = useState<LineFormState>(() => createEmptyLineForm())
  const [lines, setLines] = useState<LineEntry[]>([])
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<TenderAnalysisSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [summarySearch, setSummarySearch] = useState('')
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null)
  const [meta, setMeta] = useState<TenderMeta>(() => {
    const nowIso = new Date().toISOString()
    return { createdAt: nowIso, lastEditedAt: nowIso }
  })
  const [existingRecord, setExistingRecord] = useState<ProjectTenderRecord | null>(null)
  const [suggestions, setSuggestions] = useState<TenderLineSuggestion[]>([])
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState<TenderLineSuggestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingTender, setLoadingTender] = useState(false)

  const selectedSummary = useMemo(
    () => (selectedSummaryId ? summaries.find((summary) => summary.id === selectedSummaryId) ?? null : null),
    [selectedSummaryId, summaries]
  )

  const filteredSummaries = useMemo(() => {
    const term = summarySearch.trim().toLowerCase()
    if (!term) return summaries
    return summaries.filter((summary) => {
      const title = summary.title.toLowerCase()
      const number = summary.tenderNumber.toLowerCase()
      return title.includes(term) || number.includes(term)
    })
  }, [summaries, summarySearch])

  const totals = useMemo(() => {
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0)
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)
    return {
      amount: totalAmount,
      quantity: totalQuantity,
      count: lines.length,
    }
  }, [lines])

  const canSave = Boolean(detailsForm.projectId && detailsForm.title.trim() && lines.length > 0 && !saving)
  const canExport = lines.length > 0
  const currentProject = projectOptions.find((option) => option.id === detailsForm.projectId)
  useEffect(() => {
    let active = true
    setProjectsLoading(true)
    listProjectProfiles()
      .then((profiles) => {
        if (!active) return
        const options = profiles.map<ProjectOption>((profile) => ({ id: profile.id, name: profile.name }))
        setProjectOptions(options)
        if (options.length > 0) {
          setDetailsForm((prev) => {
            if (prev.projectId) return prev
            return { ...prev, projectId: options[0].id }
          })
        }
      })
      .catch((error) => {
        console.error(error)
        if (active) toast.error('Unable to load construction projects')
      })
      .finally(() => {
        if (active) setProjectsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const loadSummaries = useCallback(
    async (projectFilter?: string) => {
      setSummariesLoading(true)
      try {
        const list = await listTenderAnalyses(projectFilter ? { projectId: projectFilter } : {})
        setSummaries(list)
      } catch (error) {
        console.error(error)
        toast.error('Unable to fetch tender analyses register')
      } finally {
        setSummariesLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    loadSummaries(detailsForm.projectId || undefined).catch(() => undefined)
  }, [detailsForm.projectId, loadSummaries])

  useEffect(() => {
    const name = lineForm.name.trim()
    if (name.length < 2) {
      setSuggestions([])
      setSuggestionLoading(false)
      return
    }
    let cancelled = false
    setSuggestionLoading(true)
    const handle = window.setTimeout(() => {
      searchTenderLineSuggestions(name, { projectId: detailsForm.projectId || undefined, limit: 6 })
        .then((items) => {
          if (!cancelled) setSuggestions(items)
        })
        .catch((error) => {
          console.error(error)
          if (!cancelled) setSuggestions([])
        })
        .finally(() => {
          if (!cancelled) setSuggestionLoading(false)
        })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [lineForm.name, detailsForm.projectId])

  useEffect(() => {
    if (activeSuggestion && lineForm.name.trim() !== activeSuggestion.name) {
      setActiveSuggestion(null)
    }
  }, [activeSuggestion, lineForm.name])
  const handleApplySuggestion = (suggestion: TenderLineSuggestion) => {
    setActiveSuggestion(suggestion)
    setLineForm((prev) => ({
      ...prev,
      name: suggestion.name,
      unit: suggestion.unit || prev.unit,
      rate:
        suggestion.unitPrice !== null && suggestion.unitPrice !== undefined
          ? String(suggestion.unitPrice)
          : prev.rate,
      quantity: prev.quantity || (suggestion.quantity ? String(suggestion.quantity) : ''),
    }))
  }

  const handleResetTender = () => {
    const projectId = detailsForm.projectId
    setDetailsForm(createInitialDetails(projectId))
    const nowIso = new Date().toISOString()
    setMeta({ createdAt: nowIso, lastEditedAt: nowIso })
    setLineForm((prev) => ({ ...createEmptyLineForm(), unit: prev.unit }))
    setLines([])
    setActiveSuggestion(null)
    setEditingLineId(null)
    setExistingRecord(null)
    setSelectedSummaryId(null)
  }

  const handleAddOrUpdateLine = () => {
    const name = lineForm.name.trim()
    if (!name) {
      toast.error('Add a line description before saving')
      return
    }
    const unit = lineForm.unit.trim() || 'pcs'
    const quantity = parseNumber(lineForm.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }
    const rate = parseNumber(lineForm.rate)
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error('Enter a valid unit price')
      return
    }
    const amount = quantity * rate
    const vendor = lineForm.vendor.trim() || undefined
    const notes = lineForm.notes.trim() || undefined
    const pricingSource = activeSuggestion
      ? `${activeSuggestion.storage === 'supabase' ? 'Workspace' : 'Offline'} ${
          activeSuggestion.tenderNumber ? `· ${activeSuggestion.tenderNumber}` : ''
        }`.trim()
      : undefined
    const entry: LineEntry = {
      id: editingLineId ?? createLineId(),
      name,
      unit,
      quantity,
      unitPrice: rate,
      amount,
      vendor,
      notes,
      pricingSource,
      suggestionSource: pricingSource,
    }
    setLines((prev) => {
      if (editingLineId) {
        return prev.map((line) => (line.id === editingLineId ? entry : line))
      }
      return [...prev, entry]
    })
    setLineForm((prev) => ({ ...createEmptyLineForm(), unit: prev.unit }))
    setEditingLineId(null)
    setActiveSuggestion(null)
  }

  const handleEditLine = (lineId: string) => {
    const line = lines.find((entry) => entry.id === lineId)
    if (!line) return
    setLineForm({
      name: line.name,
      unit: line.unit,
      quantity: line.quantity ? String(line.quantity) : '',
      rate: line.unitPrice ? String(line.unitPrice) : '',
      vendor: line.vendor ?? '',
      notes: line.notes ?? '',
    })
    setEditingLineId(lineId)
    setActiveSuggestion(null)
  }

  const handleRemoveLine = (lineId: string) => {
    setLines((prev) => prev.filter((line) => line.id !== lineId))
    if (editingLineId === lineId) {
      setEditingLineId(null)
      setLineForm((prev) => ({ ...createEmptyLineForm(), unit: prev.unit }))
    }
  }

  const handleSelectSummary = async (summary: TenderAnalysisSummary) => {
    setLoadingTender(true)
    try {
      const detail = await getTenderAnalysis({ id: summary.id, storage: summary.storage })
      if (!detail) {
        toast.error('Unable to load this tender analysis')
        return
      }
      const tender = detail.tender
      setSelectedSummaryId(summary.id)
      setExistingRecord(tender)
      setDetailsForm({
        projectId: detail.projectId,
        tenderNumber: tender.tenderNumber,
        title: tender.title,
        closingDate: tender.closingDate ?? '',
        status: tender.status,
        currency: tender.currency,
        taxProfileId: tender.taxProfileId ?? '',
        createdBy: tender.createdBy ?? '',
      })
      setMeta({
        id: detail.id,
        storage: detail.storage,
        createdAt: tender.createdAt ?? new Date().toISOString(),
        createdBy: tender.createdBy ?? null,
        lastEditedAt: tender.lastEditedAt ?? new Date().toISOString(),
        lastEditedBy: tender.lastEditedBy ?? null,
      })
      setLines(
        tender.lines.map((line) => {
          const metaInfo =
            line.breakdown && typeof line.breakdown === 'object' ? (line.breakdown as Record<string, unknown>) : null
          const vendor =
            metaInfo && typeof metaInfo.vendor === 'string' && metaInfo.vendor.trim() ? metaInfo.vendor.trim() : undefined
          const notes =
            metaInfo && typeof metaInfo.notes === 'string' && metaInfo.notes.trim() ? metaInfo.notes.trim() : undefined
          const unitPrice = line.unitPrice !== null && line.unitPrice !== undefined ? Number(line.unitPrice) : 0
          const quantity = Number(line.quantity ?? 0)
          const amount = line.amount !== null && line.amount !== undefined ? Number(line.amount) : unitPrice * quantity
          return {
            id: line.id ?? createLineId(),
            name: line.name,
            unit: line.unit ?? '',
            quantity,
            unitPrice,
            amount,
            vendor,
            notes,
            pricingSource: line.pricingSource ?? undefined,
            suggestionSource: line.pricingSource ?? undefined,
          }
        })
      )
      setLineForm(createEmptyLineForm())
    } catch (error) {
      console.error(error)
      toast.error('Unable to open tender analysis record')
    } finally {
      setLoadingTender(false)
    }
  }
  const handleExport = () => {
    if (!canExport) {
      toast.error('Add at least one line before exporting')
      return
    }
    const headers = ['SN', 'Item', 'Quantity', 'Unit', 'Unit price', 'Total', 'Vendor', 'Notes', 'Source']
    const rows = lines.map((line, index) => [
      index + 1,
      line.name,
      line.quantity,
      line.unit,
      line.unitPrice,
      line.amount,
      line.vendor ?? '',
      line.notes ?? '',
      line.pricingSource ?? line.suggestionSource ?? 'Manual entry',
    ])
    const footer = ['', 'Totals', totals.quantity, '', '', totals.amount, '', '', '']
    const csv = [headers, ...rows, footer].map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${detailsForm.tenderNumber || 'tender-analysis'}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    toast.success('Export ready (CSV opens in Excel)')
  }

  const handlePersist = async (status: ProjectTenderStatus) => {
    if (!detailsForm.projectId) {
      toast.error('Select a project before saving')
      return
    }
    const title = detailsForm.title.trim()
    if (!title) {
      toast.error('Tender title is required')
      return
    }
    if (lines.length === 0) {
      toast.error('Add at least one line to the register')
      return
    }
    const nowIso = new Date().toISOString()
    const tenderNumber = detailsForm.tenderNumber.trim() || generateTenderNumber(currentProject?.name)
    const createdBy = detailsForm.createdBy.trim() || existingRecord?.createdBy || meta.createdBy || null
    const lastEditedBy =
      detailsForm.createdBy.trim() || existingRecord?.lastEditedBy || meta.lastEditedBy || createdBy || null
    const auditTrail = [
      {
        message: status === 'draft' ? 'Draft saved from price analysis workspace' : 'Submitted from price analysis workspace',
        timestamp: nowIso,
      },
      ...(existingRecord?.auditTrail ?? []),
    ].slice(0, 20)
    const record: ProjectTenderRecord = {
      tenderNumber,
      title,
      closingDate: detailsForm.closingDate ? detailsForm.closingDate : null,
      status,
      currency: detailsForm.currency.trim() || 'NPR',
      taxProfileId: detailsForm.taxProfileId.trim() || null,
      priceStrategyOrder: existingRecord?.priceStrategyOrder ?? ['last', 'avg', 'standard'],
      avgWindowDays: existingRecord?.avgWindowDays ?? 30,
      preferSameProjectPrice: existingRecord?.preferSameProjectPrice ?? true,
      totalAmount: totals.amount,
      lineCount: lines.length,
      createdBy,
      createdAt: existingRecord?.createdAt ?? meta.createdAt ?? nowIso,
      lastEditedBy,
      lastEditedAt: nowIso,
      auditTrail,
      lines: lines.map((line) => ({
        id: line.id,
        kind: 'item',
        catalogItemId: null,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        pricingSource: line.pricingSource ?? line.suggestionSource ?? 'Manual entry',
        taxSnapshot: null,
        needsPrice: false,
        breakdown: line.vendor || line.notes ? { vendor: line.vendor ?? null, notes: line.notes ?? null } : null,
      })),
    }
    setSaving(true)
    try {
      const result = await saveTenderAnalysis({
        id: meta.id,
        projectId: detailsForm.projectId,
        tender: record,
      })
      toast.success(status === 'draft' ? 'Draft saved to workspace register' : 'Tender analysis sent to report')
      setMeta({
        id: result.id,
        storage: result.stored,
        createdAt: record.createdAt ?? nowIso,
        createdBy: record.createdBy ?? null,
        lastEditedAt: record.lastEditedAt ?? nowIso,
        lastEditedBy: record.lastEditedBy ?? null,
      })
      setExistingRecord(record)
      setDetailsForm((prev) => ({ ...prev, tenderNumber, status }))
      setSelectedSummaryId(result.id)
      await loadSummaries(detailsForm.projectId || undefined)
    } catch (error) {
      console.error(error)
      toast.error('Unable to save tender analysis right now')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-6 pb-16">
      <ConstructionWorkspaceTabs active="price-analysis" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-foreground">Tender bidding analysis</h1>
          <p className="text-sm text-muted-foreground">
            Prepare tender line items with historical pricing, then push the snapshot to the project report.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetTender} className="h-8 gap-1.5 px-3 text-xs">
            <RefreshCcw className="h-3.5 w-3.5" />
            New Tender
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={() => navigate(`/construction/${detailsForm.projectId || ''}/report`)}
            disabled={!detailsForm.projectId}
          >
            Go to Report
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="border border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Tender details</CardTitle>
              <p className="text-sm text-muted-foreground">
                Fill the tender header once, then add or edit line items as you gather pricing.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project
                  </label>
                  <Select
                    value={detailsForm.projectId}
                    onValueChange={(value) => setDetailsForm((prev) => ({ ...prev, projectId: value }))}
                    disabled={projectsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={projectsLoading ? 'Loading projects…' : 'Choose a project'} />
                    </SelectTrigger>
                    <SelectContent>
                      {projectOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tender number
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={detailsForm.tenderNumber}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({ ...prev, tenderNumber: event.target.value }))
                      }
                      placeholder="Auto-generated"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          tenderNumber: generateTenderNumber(currentProject?.name),
                        }))
                      }
                    >
                      Regenerate
                    </Button>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Title
                  </label>
                  <Input
                    value={detailsForm.title}
                    onChange={(event) => setDetailsForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="e.g. FY2025 Civil package — Phase II"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Closing date
                  </label>
                  <Input
                    type="date"
                    value={detailsForm.closingDate}
                    onChange={(event) => setDetailsForm((prev) => ({ ...prev, closingDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Currency
                  </label>
                  <Input
                    value={detailsForm.currency}
                    onChange={(event) => setDetailsForm((prev) => ({ ...prev, currency: event.target.value }))}
                    placeholder="NPR"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </label>
                  <Select
                    value={detailsForm.status}
                    onValueChange={(value) => setDetailsForm((prev) => ({ ...prev, status: value as ProjectTenderStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TENDER_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tax profile (optional)
                  </label>
                  <Input
                    value={detailsForm.taxProfileId}
                    onChange={(event) =>
                      setDetailsForm((prev) => ({ ...prev, taxProfileId: event.target.value }))
                    }
                    placeholder="e.g. VAT-13"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Prepared by
                  </label>
                  <Input
                    value={detailsForm.createdBy}
                    onChange={(event) =>
                      setDetailsForm((prev) => ({ ...prev, createdBy: event.target.value }))
                    }
                    placeholder="Your name or initials"
                  />
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Created</span>
                  <span>{formatDisplayDate(meta.createdAt)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Last edited</span>
                  <span>{formatDisplayDate(meta.lastEditedAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Search pricing register & add lines</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pull historical rates or enter fresh supplier quotes. Everything rolls up into the report snapshot.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(0,1fr))]">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Item / description
                  </label>
                  <Input
                    value={lineForm.name}
                    onChange={(event) => setLineForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Search or describe the item"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Unit
                  </label>
                  <Select value={lineForm.unit} onValueChange={(value) => setLineForm((prev) => ({ ...prev, unit: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quantity
                  </label>
                  <Input
                    value={lineForm.quantity}
                    onChange={(event) => setLineForm((prev) => ({ ...prev, quantity: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Unit price
                  </label>
                  <Input
                    value={lineForm.rate}
                    onChange={(event) => setLineForm((prev) => ({ ...prev, rate: event.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Vendor / source
                  </label>
                  <Input
                    value={lineForm.vendor}
                    onChange={(event) => setLineForm((prev) => ({ ...prev, vendor: event.target.value }))}
                    placeholder="Supplier or note"
                  />
                </div>
                <div className="md:col-span-3 space-y-2">
                  <TextField
                    id="outlined-notes"
                    label="Notes"
                    value={lineForm.notes}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setLineForm((prev) => ({ ...prev, notes: event.target.value }))
                    }}
                    placeholder="Add remarks, spec references, or evaluation notes"
                    multiline
                    rows={4}
                    fullWidth
                  />
                </div>
              </div>

              {lineForm.name.trim().length >= 2 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggestions</p>
                    {suggestionLoading ? (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Fetching rates...
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                    {suggestionLoading ? null : suggestions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No matching historical entries yet.</p>
                    ) : (
                      suggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => handleApplySuggestion(suggestion)}
                          className={cn(
                            'w-full rounded-xl border border-border/60 bg-white px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5',
                            activeSuggestion?.id === suggestion.id && 'border-primary bg-primary/5'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">{suggestion.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Unit {suggestion.unit || 'n/a'} ·{' '}
                                {suggestion.unitPrice !== null && suggestion.unitPrice !== undefined
                                  ? formatCurrency(suggestion.unitPrice, detailsForm.currency)
                                  : 'No rate recorded'}
                              </p>
                            </div>
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {suggestion.tenderNumber ? suggestion.tenderNumber : 'Historic entry'} ·{' '}
                            {suggestion.lastUsedAt ? formatDisplayDate(suggestion.lastUsedAt) : 'No date'}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {editingLineId ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingLineId(null)
                      setLineForm((prev) => ({ ...createEmptyLineForm(), unit: prev.unit }))
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
                <Button onClick={handleAddOrUpdateLine} className="gap-2 rounded-lg">
                  {editingLineId ? (
                    <>
                      <Pencil className="h-4 w-4" />
                      Update line
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add line
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Professional register</CardTitle>
              <p className="text-sm text-muted-foreground">
                Serialised line items ready for client-facing summaries and export.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-[880px] w-full divide-y divide-border/60 text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">SN</th>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                      <th className="px-3 py-2 text-left font-semibold">Unit</th>
                      <th className="px-3 py-2 text-right font-semibold">Unit price</th>
                      <th className="px-3 py-2 text-right font-semibold">Total</th>
                      <th className="px-3 py-2 text-left font-semibold">Vendor</th>
                      <th className="px-3 py-2 text-left font-semibold">Notes</th>
                      <th className="px-3 py-2 text-left font-semibold">Source</th>
                      <th className="px-3 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-white">
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-6 text-center text-sm text-muted-foreground">
                          No entries yet. Use the form above to add tender lines.
                        </td>
                      </tr>
                    ) : (
                      lines.map((line, index) => (
                        <tr key={line.id} className="hover:bg-muted/30">
                          <td className="px-3 py-3 text-xs font-semibold text-muted-foreground">{index + 1}</td>
                          <td className="px-3 py-3 max-w-[220px] break-words font-medium text-foreground">
                            {line.name}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{line.quantity.toLocaleString()}</td>
                          <td className="px-3 py-3 text-sm">{line.unit}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatCurrency(line.unitPrice, detailsForm.currency)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold text-primary">
                            {formatCurrency(line.amount, detailsForm.currency)}
                          </td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">{line.vendor ?? '—'}</td>
                          <td className="px-3 py-3 max-w-[220px] break-words text-sm text-muted-foreground">
                            {line.notes ?? '—'}
                          </td>
                          <td className="px-3 py-3 max-w-[160px] break-words text-xs text-muted-foreground">
                            {line.pricingSource ?? line.suggestionSource ?? 'Manual entry'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() => handleEditLine(line.id)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRemoveLine(line.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Lines</span>
                  <span className="font-semibold text-foreground">{totals.count}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Quantity total</span>
                  <span className="font-semibold text-foreground">{totals.quantity.toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Grand total</span>
                  <span className="text-lg font-semibold text-primary">
                    {formatCurrency(totals.amount, detailsForm.currency)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport} disabled={!canExport} className="h-8 gap-1.5 px-3 text-xs">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePersist('draft')}
                  disabled={!canSave}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Draft
                </Button>
                <Button size="sm" onClick={() => handlePersist('submitted')} disabled={!canSave} className="h-8 gap-1.5 px-3 text-xs">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Send to Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full border border-border/60">
          <CardHeader className="flex flex-col gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Saved analyses</CardTitle>
              <p className="text-sm text-muted-foreground">
                Browse recent drafts or submitted tenders. Pick one to continue editing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute inset-y-0 left-2 h-4 w-4 self-center text-muted-foreground" />
                <Input
                  value={summarySearch}
                  onChange={(event) => setSummarySearch(event.target.value)}
                  placeholder="Search by title or number"
                  className="pl-8"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => loadSummaries(detailsForm.projectId || undefined)}
                disabled={summariesLoading}
              >
                {summariesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
              {summariesLoading ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading register…
                </div>
              ) : filteredSummaries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
                  No stored analyses for this project yet.
                </div>
              ) : (
                filteredSummaries.map((summary) => (
                  <button
                    key={`${summary.storage}:${summary.id}`}
                    type="button"
                    onClick={() => handleSelectSummary(summary)}
                    className={cn(
                      'w-full rounded-2xl border border-border/60 bg-white px-4 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5',
                      selectedSummary && selectedSummary.id === summary.id && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground break-words">{summary.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {summary.tenderNumber} · {STATUS_LABELS[summary.status]}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(summary.totalAmount, detailsForm.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDisplayDate(summary.updatedAt)} · {summary.lineCount} line
                          {summary.lineCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Stored in {summary.storage === 'supabase' ? 'workspace' : 'offline cache'}
                    </div>
                  </button>
                ))
              )}
            </div>
            {loadingTender ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading tender details…
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

