import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ArrowLeft, Download, RefreshCcw } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { formatCurrency } from '../lib/format'
import { formatAppDate, formatAppDateTime } from '../lib/date'
import { cn } from '../lib/utils'
import { getProjectProfile } from '../services/projects'
import type { ProjectBankAccount, ProjectFlow, ProjectFlowType, ProjectProfile } from '../types/projects'

const FLOW_TYPE_META: Record<ProjectFlowType, { label: string; badgeClass: string; amountClass: string }> = {
  'payment-in': { label: 'Payment In', badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700', amountClass: 'text-emerald-600' },
  'payment-out': { label: 'Payment Out', badgeClass: 'border-rose-200 bg-rose-50 text-rose-700', amountClass: 'text-rose-600' },
  transfer: { label: 'Transfer', badgeClass: 'border-sky-200 bg-sky-50 text-sky-700', amountClass: 'text-sky-600' },
}

type PdfRgb = { r: number; g: number; b: number }

const DEFAULT_PDF_ACCENT: PdfRgb = { r: 37, g: 99, b: 235 }

function parseColorToPdfRgb(color?: string | null): PdfRgb | null {
  if (!color) return null
  const input = color.trim()
  if (!input) return null
  if (input.startsWith('#')) {
    const hex = input.slice(1)
    if (hex.length === 3) {
      const [r, g, b] = hex.split('').map((char) => parseInt(char + char, 16))
      if ([r, g, b].some((value) => Number.isNaN(value))) return null
      return { r, g, b }
    }
    if (hex.length === 6) {
      const [r, g, b] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((segment) => parseInt(segment, 16))
      if ([r, g, b].some((value) => Number.isNaN(value))) return null
      return { r, g, b }
    }
    return null
  }
  const rgbMatch = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch) {
    const [, rStr, gStr, bStr] = rgbMatch
    const [r, g, b] = [Number(rStr), Number(gStr), Number(bStr)]
    if ([r, g, b].some((value) => Number.isNaN(value))) return null
    return { r, g, b }
  }
  return null
}

function resolvePdfTone(rgb: PdfRgb): 'dark' | 'light' {
  const normalize = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  }
  const luminance =
    0.2126 * normalize(rgb.r) + 0.7152 * normalize(rgb.g) + 0.0722 * normalize(rgb.b)
  return luminance > 0.6 ? 'dark' : 'light'
}

function lightenPdfRgb(rgb: PdfRgb, ratio: number): PdfRgb {
  const clamp = Math.max(0, Math.min(1, ratio))
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * clamp),
    g: Math.round(rgb.g + (255 - rgb.g) * clamp),
    b: Math.round(rgb.b + (255 - rgb.b) * clamp),
  }
}

function darkenPdfRgb(rgb: PdfRgb, ratio: number): PdfRgb {
  const clamp = Math.max(0, Math.min(1, ratio))
  return {
    r: Math.round(rgb.r * (1 - clamp)),
    g: Math.round(rgb.g * (1 - clamp)),
    b: Math.round(rgb.b * (1 - clamp)),
  }
}

type FiltersState = {
  type: 'all' | ProjectFlowType
  from: string
  to: string
  search: string
  accountId: string
}

function formatDate(value?: string | null) {
  const label = formatAppDate(value)
  return label || value || '--'
}

export default function ConstructionProjectStatementPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const initialAccountFilter = searchParams.get('account') ?? ''
  const [filters, setFilters] = useState<FiltersState>({ type: 'all', from: '', to: '', search: '', accountId: initialAccountFilter })

  useEffect(() => {
    const load = async () => {
      if (!projectId) {
        setNotFound(true)
        setProject(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setNotFound(false)
      try {
        const current = await getProjectProfile(projectId)
        if (!current) {
          setNotFound(true)
          setProject(null)
        } else {
          setProject(current)
        }
      } catch (error) {
        console.error(error)
        toast.error('Unable to load statement at the moment')
        setNotFound(true)
        setProject(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  const flows = project?.flows ?? []
  const projectAccounts = project?.bankAccounts ?? []
  const projectAccountMap = useMemo(() => {
    const map = new Map<string, ProjectBankAccount>()
    projectAccounts.forEach((account) => {
      if (account?.id) map.set(account.id, account)
    })
    return map
  }, [projectAccounts])
  const accountFilterOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>()
    projectAccounts.forEach((account) => {
      if (account?.id) map.set(account.id, { id: account.id, label: account.label })
    })
    flows.forEach((flow) => {
      if (flow.accountId && !map.has(flow.accountId)) {
        map.set(flow.accountId, { id: flow.accountId, label: flow.accountName ?? 'Archived account' })
      }
      if (flow.fromAccountId && !map.has(flow.fromAccountId)) {
        map.set(flow.fromAccountId, { id: flow.fromAccountId, label: flow.fromAccountName ?? 'Archived account' })
      }
      if (flow.toAccountId && !map.has(flow.toAccountId)) {
        map.set(flow.toAccountId, { id: flow.toAccountId, label: flow.toAccountName ?? 'Archived account' })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [projectAccounts, flows])
  const accountFilterLabel = useMemo(() => {
    if (!filters.accountId) return 'All accounts'
    const option = accountFilterOptions.find((item) => item.id === filters.accountId)
    if (!option) return 'Selected account'
    const accountInfo = projectAccountMap.get(option.id)
    return accountInfo?.bankName ? `${option.label} - ${accountInfo.bankName}` : option.label
  }, [filters.accountId, accountFilterOptions, projectAccountMap])
  const periodLabel = useMemo(() => {
    if (filters.from || filters.to) {
      const start = filters.from ? formatDate(filters.from) : 'Beginning'
      const end = filters.to ? formatDate(filters.to) : 'Latest'
      return `${start} -> ${end}`
    }
    return 'Full history'
  }, [filters.from, filters.to])
  const typeFilterLabel = useMemo(() => {
    if (filters.type === 'all') return 'All types'
    return FLOW_TYPE_META[filters.type].label
  }, [filters.type])
  const hasAccountOptions = accountFilterOptions.length > 0
  const hasActiveFilters =
    filters.type !== 'all' ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.search.trim()) ||
    Boolean(filters.accountId)

  const filteredFlows = useMemo<ProjectFlow[]>(() => {
    return flows.filter((flow) => {
      if (filters.type !== 'all' && flow.type !== filters.type) return false

      if (filters.from) {
        if (!flow.date || flow.date < filters.from) return false
      }

      if (filters.to) {
        if (!flow.date || flow.date > filters.to) return false
      }

      if (filters.accountId) {
        const matchesAccount =
          (flow.type === 'transfer' &&
            (flow.fromAccountId === filters.accountId || flow.toAccountId === filters.accountId)) ||
          (flow.type !== 'transfer' && flow.accountId === filters.accountId)
        if (!matchesAccount) return false
      }

      if (filters.search.trim()) {
        const haystack = [
          flow.notes,
          flow.counterparty,
          flow.purpose,
          flow.accountName,
          flow.fromAccountName,
          flow.toAccountName,
          flow.categoryName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(filters.search.trim().toLowerCase())) return false
      }
      return true
    })
  }, [flows, filters])

  const totals = useMemo(() => {
    return filteredFlows.reduce(
      (acc, flow) => {
        if (flow.type === 'payment-in') {
          acc.in += flow.amount
        } else if (flow.type === 'payment-out') {
          acc.out += flow.amount
        } else {
          acc.transfers += flow.amount
        }
        acc.count += 1
        acc.net = acc.in - acc.out
        return acc
      },
      { in: 0, out: 0, transfers: 0, net: 0, count: 0 }
    )
  }, [filteredFlows])

  const countByType = useMemo(
    () =>
      filteredFlows.reduce(
        (acc, flow) => {
          acc[flow.type] += 1
          return acc
        },
        { 'payment-in': 0, 'payment-out': 0, transfer: 0 } as Record<ProjectFlowType, number>
      ),
    [filteredFlows]
  )

  const totalFlowCount = filteredFlows.length

  const clearFilters = () => setFilters({ type: 'all', from: '', to: '', search: '', accountId: '' })

  useEffect(() => {
    const next = new URLSearchParams(window.location.search)
    if (filters.accountId) next.set('account', filters.accountId)
    else next.delete('account')
    setSearchParams(next, { replace: true })
  }, [filters.accountId, setSearchParams])

  const handleRefresh = async () => {
    if (!projectId) return
    setRefreshing(true)
    try {
      const current = await getProjectProfile(projectId)
      if (!current) {
        setNotFound(true)
        setProject(null)
      } else {
        setProject(current)
        setNotFound(false)
      }
    } catch (error) {
      console.error(error)
      toast.error('Unable to refresh statement right now')
    } finally {
      setRefreshing(false)
    }
  }

  const handleExportPdf = () => {
    if (!project) return
    if (filteredFlows.length === 0) {
      toast.info('No entries to export with the selected filters.')
      return
    }

    setExporting(true)
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const now = new Date()
      const marginX = 48
      const headerHeight = 110
      const baseText: PdfRgb = { r: 31, g: 41, b: 55 }
      const accentRgb = parseColorToPdfRgb(project.accentColor) ?? DEFAULT_PDF_ACCENT
      const headerTone = resolvePdfTone(accentRgb)
      const headerText: PdfRgb = headerTone === 'dark' ? baseText : { r: 255, g: 255, b: 255 }
      const tableHeader = darkenPdfRgb(accentRgb, 0.35)
      const stripeFill = lightenPdfRgb(accentRgb, 0.88)
      const infoSurface: PdfRgb = { r: 248, g: 250, b: 252 }
      const outline: PdfRgb = { r: 226, g: 232, b: 240 }
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b)
      doc.rect(0, 0, pageWidth, headerHeight, 'F')

      doc.setTextColor(headerText.r, headerText.g, headerText.b)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.text(project.name, marginX, 54)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text('Project statement export', marginX, 76)
      doc.setFontSize(10)
      doc.text(`Generated: ${formatDateTime(now)}`, marginX, 94)
      doc.text(`Entries exported: ${totalFlowCount}`, marginX, 110)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(baseText.r, baseText.g, baseText.b)
      const metaLines = [
        `Account filter: ${accountFilterLabel}`,
        `Period: ${periodLabel}`,
        `Type filter: ${typeFilterLabel}`,
      ]
      const trimmedSearch = filters.search.trim()
      if (trimmedSearch) {
        metaLines.push(`Search query: ${trimmedSearch}`)
      }

      const infoPaddingX = 18
      const infoPaddingY = 18
      const infoLineHeight = 16
      const infoHeight = infoPaddingY * 2 + infoLineHeight * (metaLines.length + 1)
      let cursorY = headerHeight + 24
      const boxWidth = pageWidth - marginX * 2

      doc.setFillColor(infoSurface.r, infoSurface.g, infoSurface.b)
      doc.setDrawColor(outline.r, outline.g, outline.b)
      doc.roundedRect(marginX, cursorY, boxWidth, infoHeight, 10, 10, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.text('Filters applied', marginX + infoPaddingX, cursorY + infoPaddingY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      metaLines.forEach((line, index) => {
        doc.text(line, marginX + infoPaddingX, cursorY + infoPaddingY + 18 + index * infoLineHeight)
      })

      cursorY += infoHeight + 24

      autoTable(doc, {
        startY: cursorY,
        head: [['Summary', 'Value']],
        body: [
          ['Payments in', `${formatCurrency(totals.in)} — ${formatCountLabel(countByType['payment-in'])}`],
          ['Payments out', `${formatCurrency(totals.out)} — ${formatCountLabel(countByType['payment-out'])}`],
          ['Transfers', `${formatCurrency(totals.transfers)} — ${formatCountLabel(countByType.transfer, 'transfer')}`],
          ['Net cash', `${formatCurrency(totals.net)} — ${formatCountLabel(totalFlowCount)}`],
        ],
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          fontSize: 11,
          cellPadding: { top: 8, right: 12, bottom: 8, left: 12 },
          textColor: [baseText.r, baseText.g, baseText.b],
          fillColor: [255, 255, 255],
          lineColor: [outline.r, outline.g, outline.b],
          lineWidth: 0.6,
          halign: 'left',
          cellWidth: 'wrap',
          overflow: 'linebreak',
        },
        headStyles: {
          fontStyle: 'bold',
          fontSize: 11,
          fillColor: [tableHeader.r, tableHeader.g, tableHeader.b],
          textColor: 255,
          halign: 'left',
          valign: 'middle',
        },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'left' },
        },
      })

      const docAny = doc as any
      cursorY = (docAny.lastAutoTable?.finalY ?? cursorY) + 24

      autoTable(doc, {
        startY: cursorY,
        head: [['Date', 'Type', 'Account(s)', 'Details', 'Amount', 'Notes']],
        body: filteredFlows.map((flow) => {
          const accounts =
            flow.type === 'transfer'
              ? `${flow.fromAccountName ?? projectAccountMap.get(flow.fromAccountId ?? '')?.label ?? 'Unlinked'} -> ${
                  flow.toAccountName ?? projectAccountMap.get(flow.toAccountId ?? '')?.label ?? 'Unlinked'
                }`
              : flow.accountName ?? projectAccountMap.get(flow.accountId ?? '')?.label ?? 'Unlinked account'
          const detail =
            flow.type === 'transfer'
              ? flow.purpose || '--'
              : [flow.counterparty, flow.categoryName].filter(Boolean).join(' • ') || 'Uncategorised'
          const amountDisplay =
            flow.type === 'payment-in'
              ? `+${formatCurrency(flow.amount)}`
              : flow.type === 'payment-out'
                ? `-${formatCurrency(flow.amount)}`
                : formatCurrency(flow.amount)
          return [
            formatDate(flow.date),
            FLOW_TYPE_META[flow.type].label,
            accounts,
            detail,
            amountDisplay,
            flow.notes ? flow.notes.replace(/\s+/g, ' ').trim() : '',
          ]
        }),
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          fontSize: 10,
          cellPadding: { top: 8, right: 10, bottom: 8, left: 10 },
          textColor: [baseText.r, baseText.g, baseText.b],
          fillColor: [255, 255, 255],
          lineColor: [outline.r, outline.g, outline.b],
          lineWidth: 0.5,
          valign: 'top',
          cellWidth: 'wrap',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [tableHeader.r, tableHeader.g, tableHeader.b],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 11,
          valign: 'middle',
        },
        alternateRowStyles: { fillColor: [stripeFill.r, stripeFill.g, stripeFill.b] },
        columnStyles: {
          4: { halign: 'right', fontStyle: 'bold' },
        },
      })

      const accountSlug = filters.accountId ? slugify(accountFilterLabel) : 'all'
      doc.save(`${slugify(project.name)}-${accountSlug}-statement.pdf`)
      toast.success('Statement exported as PDF')
    } catch (error) {
      console.error(error)
      toast.error('Failed to generate PDF statement')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-muted-foreground">
        Loading statement...
      </div>
    )
  }

  if (notFound || !projectId || !project) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Statement not available.
        </div>
        <Button variant="ghost" onClick={() => navigate('/construction')} className="w-fit">
          Back to projects
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate(`/construction/${projectId}`)}
        className="w-fit gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to project
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
        <p className="text-sm text-muted-foreground">Comprehensive statement of all logged payments and transfers.</p>
        <p className="text-xs text-muted-foreground">Period: {periodLabel}</p>
        <p className="text-xs text-muted-foreground">Account filter: {accountFilterLabel}</p>
        <p className="text-xs text-muted-foreground">Type: {typeFilterLabel}</p>
      </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Payments in"
            value={formatCurrency(totals.in)}
            hint={formatCountLabel(countByType['payment-in'])}
            tone="positive"
          />
          <SummaryTile
            label="Payments out"
            value={formatCurrency(totals.out)}
            hint={formatCountLabel(countByType['payment-out'])}
            tone="negative"
          />
          <SummaryTile
            label="Transfers"
            value={formatCurrency(totals.transfers)}
            hint={formatCountLabel(countByType.transfer, 'transfer')}
          />
          <SummaryTile
            label="Net cash"
            value={formatCurrency(totals.net)}
            hint={formatCountLabel(totalFlowCount)}
            tone={totals.net >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      <Card className="border border-border/70">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Filters</CardTitle>
              <p className="text-xs text-muted-foreground">Use filters to drill into specific movements.</p>
            </div>
            <Button variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Type</label>
              <Select value={filters.type} onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value as FiltersState['type'] }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="payment-in">Payment In</SelectItem>
                  <SelectItem value="payment-out">Payment Out</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Account</label>
              <Select
                value={filters.accountId || 'all'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, accountId: value === 'all' ? '' : value }))}
                disabled={!hasAccountOptions}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-64">
                  <SelectItem value="all">All accounts</SelectItem>
                  {accountFilterOptions.map((option) => {
                    const accountInfo = projectAccountMap.get(option.id)
                    const archived = !accountInfo
                    const displayLabel =
                      archived && option.label.toLowerCase().includes('archived')
                        ? option.label
                        : archived
                          ? `${option.label} (archived)`
                          : option.label
                    return (
                      <SelectItem key={option.id} value={option.id}>
                        {displayLabel}
                        {accountInfo?.bankName ? ` - ${accountInfo.bankName}` : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {!hasAccountOptions ? (
                <p className="text-xs text-muted-foreground">No account activity recorded yet.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">From</label>
              <Input type="date" value={filters.from} onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">To</label>
              <Input type="date" value={filters.to} onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Search</label>
              <Input
                placeholder="Search notes, purpose, accounts..."
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                className="h-10"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border/70">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Statement entries</CardTitle>
            <p className="text-xs text-muted-foreground">Download or inspect every payment and transfer captured for this project.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button size="sm" onClick={handleExportPdf} disabled={exporting || filteredFlows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Preparing...' : 'Export PDF'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Account(s)</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredFlows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-xs text-muted-foreground" colSpan={6}>
                      No entries match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredFlows.map((flow) => {
                    const meta = FLOW_TYPE_META[flow.type]
                    const amount =
                      flow.type === 'payment-in'
                        ? '+' + formatCurrency(flow.amount)
                        : flow.type === 'payment-out'
                          ? '-' + formatCurrency(flow.amount)
                          : formatCurrency(flow.amount)
                    const account = flow.accountId ? projectAccountMap.get(flow.accountId) : undefined
                    const fromAccount = flow.fromAccountId ? projectAccountMap.get(flow.fromAccountId) : undefined
                    const toAccount = flow.toAccountId ? projectAccountMap.get(flow.toAccountId) : undefined
                    const categoryBadgeClass =
                      flow.type === 'payment-in'
                        ? 'bg-emerald-100 text-emerald-700'
                        : flow.type === 'payment-out'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-sky-100 text-sky-700'
                    const accountArchived = Boolean(flow.accountId && !account)
                    const fromArchived = Boolean(flow.fromAccountId && !fromAccount)
                    const toArchived = Boolean(flow.toAccountId && !toAccount)

                    return (
                      <tr key={flow.id} className="align-top hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-foreground">{formatDate(flow.date)}</td>
                        <td className="px-3 py-2">
                          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', meta.badgeClass)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className={cn('px-3 py-2 text-right font-semibold', meta.amountClass)}>{amount}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {flow.type === 'transfer' ? (
                            <div className="grid gap-2">
                              <div className="space-y-0.5">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">From</p>
                                <p className="font-medium text-foreground">{flow.fromAccountName ?? fromAccount?.label ?? 'Unlinked account'}</p>
                                {fromAccount?.bankName ? <p className="text-xs text-muted-foreground">{fromAccount.bankName}</p> : null}
                                {fromArchived ? <p className="text-xs text-amber-600">Account archived</p> : null}
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">To</p>
                                <p className="font-medium text-foreground">{flow.toAccountName ?? toAccount?.label ?? 'Unlinked account'}</p>
                                {toAccount?.bankName ? <p className="text-xs text-muted-foreground">{toAccount.bankName}</p> : null}
                                {toArchived ? <p className="text-xs text-amber-600">Account archived</p> : null}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">{flow.accountName ?? account?.label ?? 'Unlinked account'}</p>
                              {account?.bankName ? <p className="text-xs text-muted-foreground">{account.bankName}</p> : null}
                              {accountArchived ? <p className="text-xs text-amber-600">Account archived</p> : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {flow.type === 'transfer' ? (
                            flow.purpose ? <span className="font-medium text-foreground">{flow.purpose}</span> : <span>--</span>
                          ) : (
                            <div className="space-y-1">
                              {flow.counterparty ? <p className="text-sm font-medium text-foreground">{flow.counterparty}</p> : null}
                              {flow.categoryName ? (
                                <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', categoryBadgeClass)}>
                                  {flow.categoryName}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Uncategorised</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {flow.notes ? <p className="max-w-xs whitespace-pre-wrap">{flow.notes}</p> : <span>--</span>}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative'
}) {
  const valueClass =
    tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-rose-600' : 'text-foreground'
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function formatCountLabel(count: number, singular = 'entry', plural?: string) {
  const resolvedPlural =
    plural ??
    (singular.endsWith('y') ? singular.slice(0, singular.length - 1) + 'ies' : `${singular}s`)
  const label = count === 1 ? singular : resolvedPlural
  return `${count} ${label}`
}

function formatDateTime(value: Date) {
  const label = formatAppDateTime(value)
  return label || value.toISOString()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}


