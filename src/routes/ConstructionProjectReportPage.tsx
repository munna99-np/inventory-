import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import { ArrowLeft, BarChart3, FileDown, LineChart, Palette, RefreshCcw, Table2 } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { StatCard } from '../components/ui/stat-card'
import { formatCurrency } from '../lib/format'
import { formatAppDate, formatAppDateTime } from '../lib/date'
import { cn } from '../lib/utils'
import { getProjectProfile, summarizeProjectFlows } from '../services/projects'
import type { ProjectBankAccount, ProjectFlow, ProjectProfile } from '../types/projects'

type CategoryAggregate = {
  key: string
  label: string
  amount: number
  count: number
  share?: number
}

type CategoryBreakdown = {
  total: number
  rows: CategoryAggregate[]
}

type AccountAggregate = {
  key: string
  label: string
  bankName?: string
  kind: 'linked' | 'archived' | 'virtual' | 'unlinked'
  isArchived: boolean
  totalIn: number
  totalOut: number
  transferIn: number
  transferOut: number
  activity: number
  net: number
  count: number
}

type TimelinePoint = {
  key: string
  label: string
  inflow: number
  outflow: number
  transfers: number
  net: number
  activity: number
  count: number
}

export default function ConstructionProjectReportPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(
    async (withSpinner = false) => {
      if (!projectId) return
      setError(null)
      if (withSpinner) setRefreshing(true)
      try {
        setLoading(true)
        const profile = await getProjectProfile(projectId)
        if (!profile) {
          setError('Project not found')
          setProject(null)
        } else {
          setProject(profile)
        }
      } catch (err) {
        console.error(err)
        setProject(null)
        setError('Unable to load report')
        toast.error('Unable to load report right now')
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

  const summary = useMemo(() => (project ? summarizeProjectFlows(project) : null), [project])

  const flowCounts = useMemo(() => {
    if (!project) return { in: 0, out: 0, transfer: 0, total: 0 }
    let inCount = 0
    let outCount = 0
    let transferCount = 0
    project.flows.forEach((flow) => {
      if (flow.type === 'payment-in') inCount += 1
      else if (flow.type === 'payment-out') outCount += 1
      else transferCount += 1
    })
    return { in: inCount, out: outCount, transfer: transferCount, total: project.flows.length }
  }, [project])

  const categoryBreakdown = useMemo(() => {
    if (!project) {
      return { inflow: { total: 0, rows: [] }, outflow: { total: 0, rows: [] } }
    }

    const inflow = new Map<string, CategoryAggregate>()
    const outflow = new Map<string, CategoryAggregate>()

    project.flows.forEach((flow) => {
      if (flow.type === 'transfer') return
      const keyBase = flow.categoryId || flow.categoryName || 'uncategorised'
      const key = `${flow.type}:${keyBase.toLowerCase()}`
      const label = flow.categoryName?.trim() || 'Uncategorised'
      const amount = ensureNumber(flow.amount)
      if (amount <= 0) return
      const targetMap = flow.type === 'payment-in' ? inflow : outflow
      const existing = targetMap.get(key) ?? { key, label, amount: 0, count: 0 }
      existing.amount += amount
      existing.count += 1
      targetMap.set(key, existing)
    })

    const inflowTotal = Array.from(inflow.values()).reduce((sum, row) => sum + row.amount, 0)
    const outflowTotal = Array.from(outflow.values()).reduce((sum, row) => sum + row.amount, 0)

    const sortRows = (rows: CategoryAggregate[], total: number) =>
      rows
        .map((row) => ({
          ...row,
          share: total > 0 ? row.amount / total : 0,
        }))
        .sort((a, b) => b.amount - a.amount)

    return {
      inflow: { total: inflowTotal, rows: sortRows(Array.from(inflow.values()), inflowTotal) },
      outflow: { total: outflowTotal, rows: sortRows(Array.from(outflow.values()), outflowTotal) },
    }
  }, [project])

  const accountBreakdown = useMemo(() => {
    if (!project) return [] as AccountAggregate[]

    const index = new Map<string, ProjectBankAccount>()
    project.bankAccounts.forEach((account) => {
      if (!account?.id) return
      index.set(account.id, account)
    })

    const aggregates = new Map<string, AccountAggregate>()

    const ensureAggregate = (key: string, meta: Omit<AccountAggregate, 'totalIn' | 'totalOut' | 'transferIn' | 'transferOut' | 'activity' | 'net' | 'count'>) => {
      if (!aggregates.has(key)) {
        aggregates.set(key, {
          key,
          label: meta.label,
          bankName: meta.bankName,
          kind: meta.kind,
          isArchived: meta.isArchived,
          totalIn: 0,
          totalOut: 0,
          transferIn: 0,
          transferOut: 0,
          activity: 0,
          net: 0,
          count: 0,
        })
      }
      return aggregates.get(key)!
    }

    const resolveAccount = (id?: string | null, name?: string | null, context: 'standard' | 'transfer' = 'standard'): Omit<AccountAggregate, 'totalIn' | 'totalOut' | 'transferIn' | 'transferOut' | 'activity' | 'net' | 'count'> => {
      if (id) {
        const account = index.get(id)
        if (account) {
          return { key: `linked:${id}`, label: account.label, bankName: account.bankName, kind: 'linked', isArchived: false }
        }
        return { key: `archived:${id}`, label: name?.trim() || 'Archived account', bankName: undefined, kind: 'archived', isArchived: true }
      }
      if (name && name.trim().length) {
        const trimmed = name.trim()
        return { key: `virtual:${trimmed.toLowerCase()}`, label: trimmed, bankName: undefined, kind: 'virtual', isArchived: false }
      }
      const fallbackKey = context === 'transfer' ? '__transfer_unlinked__' : '__unlinked__'
      const label = context === 'transfer' ? 'Unlinked transfer account' : 'Unlinked entry'
      return { key: fallbackKey, label, bankName: undefined, kind: 'unlinked', isArchived: true }
    }

    // Ensure existing accounts are represented even if inactive
    project.bankAccounts.forEach((account) => {
      if (!account?.id) return
      ensureAggregate(`linked:${account.id}`, {
        key: `linked:${account.id}`,
        label: account.label,
        bankName: account.bankName,
        kind: 'linked',
        isArchived: false,
      })
    })

    project.flows.forEach((flow) => {
      const amount = ensureNumber(flow.amount)
      if (amount <= 0) return

      if (flow.type === 'transfer') {
        const fromMeta = resolveAccount(flow.fromAccountId, flow.fromAccountName, 'transfer')
        const toMeta = resolveAccount(flow.toAccountId, flow.toAccountName, 'transfer')

        const fromAgg = ensureAggregate(fromMeta.key, fromMeta)
        fromAgg.transferOut += amount
        fromAgg.activity += amount
        fromAgg.net -= amount
        fromAgg.count += 1

        const toAgg = ensureAggregate(toMeta.key, toMeta)
        toAgg.transferIn += amount
        toAgg.activity += amount
        toAgg.net += amount
        toAgg.count += 1
        return
      }

      const meta = resolveAccount(flow.accountId, flow.accountName, 'standard')
      const agg = ensureAggregate(meta.key, meta)
      if (flow.type === 'payment-in') {
        agg.totalIn += amount
        agg.net += amount
      } else {
        agg.totalOut += amount
        agg.net -= amount
      }
      agg.activity += amount
      agg.count += 1
    })

    return Array.from(aggregates.values())
      .filter((row) => row.activity > 0 || row.kind === 'linked')
      .sort((a, b) => {
        if (b.activity !== a.activity) return b.activity - a.activity
        return a.label.localeCompare(b.label)
      })
  }, [project])

  const timeline = useMemo(() => {
    if (!project) return [] as TimelinePoint[]
    const points = new Map<string, TimelinePoint>()
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })

    project.flows.forEach((flow) => {
      const baseDate = flow.date ?? flow.createdAt
      if (!baseDate) return
      const parsed = new Date(baseDate)
      if (Number.isNaN(parsed.getTime())) return
      const monthKey = `${parsed.getUTCFullYear()}-${parsed.getUTCMonth()}`
      const monthStart = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1))
      const amount = ensureNumber(flow.amount)
      if (amount <= 0) return

      if (!points.has(monthKey)) {
        points.set(monthKey, {
          key: monthKey,
          label: formatter.format(monthStart),
          inflow: 0,
          outflow: 0,
          transfers: 0,
          net: 0,
          activity: 0,
          count: 0,
        })
      }

      const entry = points.get(monthKey)!
      entry.count += 1
      entry.activity += amount
      if (flow.type === 'payment-in') {
        entry.inflow += amount
        entry.net += amount
      } else if (flow.type === 'payment-out') {
        entry.outflow += amount
        entry.net -= amount
      } else {
        entry.transfers += amount
      }
    })

    return Array.from(points.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [project])

  const totalActivity = useMemo(
    () => accountBreakdown.reduce((sum, row) => sum + row.activity, 0),
    [accountBreakdown]
  )
  const activeAccounts = accountBreakdown.filter((row) => row.activity > 0 && row.kind !== 'unlinked').length
  const totalAccounts = project?.bankAccounts?.length ?? 0
  const netCash = summary ? summary.netCash : 0
  const budgetValue = project?.budget ?? null
  const budgetProvided = typeof budgetValue === 'number'
  const resolvedBudget = budgetProvided && Number.isFinite(budgetValue) ? Math.max(budgetValue, 0) : 0
  const totalOutflow = summary?.totalPaymentsOut ?? 0
  const budgetRatio = resolvedBudget > 0 ? totalOutflow / resolvedBudget : 0
  const budgetRemaining = resolvedBudget > 0 ? Math.max(0, resolvedBudget - totalOutflow) : 0
  const [accent, setAccent] = useState(project?.accentColor ?? '#6366f1')
  const colorInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (project?.accentColor) {
      setAccent(project.accentColor)
    }
  }, [project?.accentColor])

  const goToDrilldown = useCallback(
    (scope: 'category' | 'account' | 'month', ref: string, label: string, extras: Record<string, string> = {}) => {
      if (!project) return
      const params = new URLSearchParams({ scope, ref })
      if (label) params.set('label', label)
      Object.entries(extras).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      navigate(`/construction/${project.id}/report/drilldown?${params.toString()}`)
    },
    [navigate, project]
  )

  const handleCategoryDrilldown = useCallback(
    (row: CategoryAggregate) => {
      const flowType = row.key.startsWith('payment-out') ? 'payment-out' : 'payment-in'
      goToDrilldown('category', row.key, row.label, { flowType })
    },
    [goToDrilldown]
  )

  const handleAccountDrilldown = useCallback(
    (account: AccountAggregate) => {
      goToDrilldown('account', account.key, account.label, account.bankName ? { bank: account.bankName } : {})
    },
    [goToDrilldown]
  )

  const handleTimelineDrilldown = useCallback(
    (point: TimelinePoint) => {
      goToDrilldown('month', point.key, point.label)
    },
    [goToDrilldown]
  )

  const sortedFlows = useMemo(() => {
    if (!project?.flows) return [] as ProjectFlow[]
    return [...project.flows].sort((a, b) => {
      const aTime = getFlowTimestamp(a)
      const bTime = getFlowTimestamp(b)
      return bTime - aTime
    })
  }, [project?.flows])

  const exportReport = useCallback(() => {
    if (!project || !summary) return
    try {
      setExporting(true)
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const margin = 48
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const contentWidth = pageWidth - margin * 2
      const textColor = { r: 15, g: 23, b: 42 }

      let cursorY = margin

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(textColor.r, textColor.g, textColor.b)
      doc.text(project.name, margin, cursorY)

      cursorY += 26
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text('Construction project financial report', margin, cursorY)

      cursorY += 18
      doc.setFontSize(10)
      const metaLines = [
        `Report generated: ${new Date().toLocaleString()}`,
        `Project code: ${project.code || 'N/A'}`,
        `Total records: ${flowCounts.total}`,
      ]
      metaLines.forEach((line) => {
        doc.text(line, margin, cursorY)
        cursorY += 14
      })

      cursorY += 6

      const metricBlocks = [
        {
          label: 'Total inflow',
          value: formatCurrency(summary.totalPaymentsIn),
          hint: `${flowCounts.in} payment${flowCounts.in === 1 ? '' : 's'} received`,
          fill: [236, 253, 245],
          text: [6, 95, 70],
        },
        {
          label: 'Total outflow',
          value: formatCurrency(summary.totalPaymentsOut),
          hint: `${flowCounts.out} payment${flowCounts.out === 1 ? '' : 's'} sent`,
          fill: [254, 242, 242],
          text: [190, 18, 60],
        },
        {
          label: 'Net cash',
          value: formatCurrency(netCash),
          hint: netCash >= 0 ? 'Positive balance' : 'Negative balance',
          fill: [240, 249, 255],
          text: netCash >= 0 ? [24, 100, 171] : [190, 18, 60],
        },
        {
          label: 'Transfers',
          value: formatCurrency(summary.totalTransfers),
          hint: `${flowCounts.transfer} internal movement${flowCounts.transfer === 1 ? '' : 's'}`,
          fill: [238, 242, 255],
          text: [49, 46, 129],
        },
      ]

      const blockGap = 20
      const blockWidth = (contentWidth - blockGap) / 2
      const blockHeight = 74
      let cardY = cursorY

      metricBlocks.forEach((block, index) => {
        const column = index % 2
        const blockX = margin + column * (blockWidth + blockGap)
        if (index > 0 && column === 0) {
          cardY += blockHeight + 16
        }
        const [fillR, fillG, fillB] = block.fill
        doc.setFillColor(fillR, fillG, fillB)
        doc.setDrawColor(222, 226, 230)
        doc.roundedRect(blockX, cardY, blockWidth, blockHeight, 10, 10, 'FD')

        const [textR, textG, textB] = block.text
        doc.setTextColor(textR, textG, textB)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(block.label.toUpperCase(), blockX + 16, cardY + 20)

        doc.setFontSize(16)
        doc.text(block.value, blockX + 16, cardY + 40)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.text(block.hint, blockX + 16, cardY + 58)
      })

      doc.setTextColor(textColor.r, textColor.g, textColor.b)
      cursorY = cardY + blockHeight + 32

      if (cursorY > pageHeight - margin - 140) {
        doc.addPage()
        cursorY = margin
        doc.setTextColor(textColor.r, textColor.g, textColor.b)
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('Category highlights', margin, cursorY)

      cursorY += 18
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)

      const inflowHighlights =
        categoryBreakdown.inflow.rows.length > 0
          ? categoryBreakdown.inflow.rows.slice(0, 4)
          : null
      const outflowHighlights =
        categoryBreakdown.outflow.rows.length > 0
          ? categoryBreakdown.outflow.rows.slice(0, 4)
          : null

      const boxGap = 16
      const boxWidth = (contentWidth - boxGap) / 2
      const boxHeight = 18 + 4 * 18 + 16 // header + up to 4 rows + padding
      const leftBoxX = margin
      const rightBoxX = margin + boxWidth + boxGap

      if (!inflowHighlights && !outflowHighlights) {
        doc.text('No category activity recorded yet.', margin, cursorY)
        cursorY += 16
      } else {
        // Inflow box
        if (inflowHighlights) {
          doc.setFillColor(236, 253, 245)
          doc.setDrawColor(167, 243, 208)
          doc.roundedRect(leftBoxX, cursorY, boxWidth, boxHeight, 8, 8, 'FD')
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(6, 95, 70)
          doc.text('Top inflow categories', leftBoxX + 12, cursorY + 16)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(15, 23, 42)
          inflowHighlights.forEach((row, idx) => {
            const y = cursorY + 16 + 14 + idx * 18
            doc.text(`${row.label}`, leftBoxX + 12, y)
            const amount = formatCurrency(row.amount)
            doc.text(amount, leftBoxX + boxWidth - 12, y, { align: 'right' })
          })
        }

        // Outflow box
        if (outflowHighlights) {
          doc.setFillColor(254, 242, 242)
          doc.setDrawColor(254, 202, 202)
          doc.roundedRect(rightBoxX, cursorY, boxWidth, boxHeight, 8, 8, 'FD')
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(153, 27, 27)
          doc.text('Top spending categories', rightBoxX + 12, cursorY + 16)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(15, 23, 42)
          outflowHighlights.forEach((row, idx) => {
            const y = cursorY + 16 + 14 + idx * 18
            doc.text(`${row.label}`, rightBoxX + 12, y)
            const amount = formatCurrency(row.amount)
            doc.text(amount, rightBoxX + boxWidth - 12, y, { align: 'right' })
          })
        }

        cursorY += boxHeight + 16
      }

      cursorY += 16

      const bottomLimit = pageHeight - margin
      const headerHeight = 26
      const rowLineHeight = 14

      const ensureSpace = (required: number) => {
        if (cursorY + required > bottomLimit) {
          doc.addPage()
          cursorY = margin
          doc.setTextColor(textColor.r, textColor.g, textColor.b)
        }
      }

      ensureSpace(60)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('Transactions', margin, cursorY)
      cursorY += 18

      if (sortedFlows.length === 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.text('No transactions recorded for this project yet.', margin, cursorY)
      } else {
        type TableRow = {
          index: string
          type: ProjectFlow['type']
          typeLabel: string
          date: string
          amount: string
          account: string
          category: string
          notes: string
        }

        const typePalette: Record<ProjectFlow['type'], { fill: [number, number, number]; border: [number, number, number]; text: [number, number, number]; label: string }> = {
          'payment-in': { fill: [236, 253, 245], border: [167, 243, 208], text: [6, 95, 70], label: 'Payment In' },
          'payment-out': { fill: [254, 242, 242], border: [251, 207, 232], text: [159, 18, 57], label: 'Payment Out' },
          transfer: { fill: [240, 249, 255], border: [191, 219, 254], text: [30, 64, 175], label: 'Transfer' },
        }

        const columns: { key: keyof TableRow; header: string; width: number; align: 'left' | 'right' }[] = [
          { key: 'index', header: '#', width: 24, align: 'left' },
          { key: 'date', header: 'Date', width: 72, align: 'left' },
          { key: 'typeLabel', header: 'Type', width: 86, align: 'left' },
          { key: 'amount', header: 'Amount', width: 82, align: 'right' },
          { key: 'account', header: 'Account', width: 120, align: 'left' },
          { key: 'category', header: 'Category', width: 112, align: 'left' },
          { key: 'notes', header: 'Notes', width: contentWidth - (24 + 72 + 86 + 82 + 120 + 112), align: 'left' },
        ]

        const rows: TableRow[] = sortedFlows.slice(0, 60).map((flow, index) => {
          const meta = typePalette[flow.type]
          const dateLabel =
            formatAppDate(flow.date) ||
            formatAppDate(flow.createdAt) ||
            (flow.createdAt ? formatAppDateTime(new Date(flow.createdAt)) : '--')
          const accountLabel =
            flow.type === 'transfer'
              ? `${flow.fromAccountName ?? 'Unlinked'} -> ${flow.toAccountName ?? 'Unlinked'}`
              : flow.accountName ?? 'Unlinked account'
          const categoryLabel = flow.categoryName ?? 'Uncategorised'
          const notes = flow.notes?.trim() ?? ''
          return {
            index: String(index + 1),
            type: flow.type,
            typeLabel: meta.label,
            date: dateLabel,
            amount: formatCurrency(ensureNumber(flow.amount)),
            account: accountLabel,
            category: categoryLabel,
            notes,
          }
        })

        const drawHeader = () => {
          ensureSpace(headerHeight)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          let x = margin
          doc.setDrawColor(179, 186, 197)
          columns.forEach((column) => {
            doc.rect(x, cursorY, column.width, headerHeight)
            const textX = column.align === 'right' ? x + column.width - 8 : x + 8
            const options = column.align === 'right' ? { align: 'right' as const } : undefined
            doc.text(column.header, textX, cursorY + 17, options)
            x += column.width
          })
          cursorY += headerHeight
        }

        drawHeader()
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)

        rows.forEach((row) => {
          const typeMeta = typePalette[row.type]
          const cellLines: string[][] = columns.map((column) => {
            const text = String(row[column.key] ?? '')
            return doc.splitTextToSize(text, column.width - 12) as string[]
          })
          const lineCount = Math.max(...cellLines.map((lines) => Math.max(lines.length, 1)))
          const rowHeight = lineCount * rowLineHeight + 10

          ensureSpace(rowHeight)

          let x = margin
          columns.forEach((column, columnIndex) => {
            const isTypeCell = column.key === 'typeLabel'
            const borderColor = isTypeCell ? typeMeta.border : [210, 214, 220]
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
            doc.rect(x, cursorY, column.width, rowHeight)

            const textLines = cellLines[columnIndex]
            textLines.forEach((line: string, lineIndex: number) => {
              const textY = cursorY + 8 + rowLineHeight * (lineIndex + 1) - 4
              const textX = column.align === 'right' ? x + column.width - 8 : x + 8
              const options = column.align === 'right' ? { align: 'right' as const } : undefined
              if (isTypeCell) {
                doc.setTextColor(typeMeta.text[0], typeMeta.text[1], typeMeta.text[2])
                doc.text(line, textX, textY, options)
                doc.setTextColor(textColor.r, textColor.g, textColor.b)
              } else {
                doc.text(line, textX, textY, options)
              }
            })

            x += column.width
          })

          cursorY += rowHeight
        })

        if (sortedFlows.length > rows.length) {
          ensureSpace(20)
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(9)
          const remaining = sortedFlows.length - rows.length
          doc.text(`+ ${remaining} more transaction${remaining === 1 ? '' : 's'} not shown in this summary.`, margin, cursorY + 12)
        }
      }

      const filename = `${project.name.replace(/\s+/g, '-').toLowerCase()}-report.pdf`
      doc.save(filename)
    } catch (err) {
      console.error(err)
      toast.error('Unable to export report right now')
    } finally {
      setExporting(false)
    }
  }, [project, summary, netCash, flowCounts, categoryBreakdown, sortedFlows])

  if (!projectId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Missing project</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Open the construction dashboard again to reload the project.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading && !project) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-muted-foreground">
        Preparing report...
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Unable to load report</CardTitle>
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

  if (!project || !summary) return null

  const mostActiveAccount = accountBreakdown[0]
  const largestNetAccount = accountBreakdown.length
    ? [...accountBreakdown].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0]
    : undefined

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Analytics workspace</p>
          <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            Explore cash trends, spotlight critical categories, and keep every account in check.
          </p>
        </div>
      </div>

      <Card
        className="overflow-hidden border-none text-white shadow-xl"
        style={{ background: buildGradient(accent), boxShadow: `0 28px 70px -32px ${accent}90` }}
      >
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2 max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.4em] text-white/70">Project analytics</p>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-white">{project.name}</h2>
              <p className="text-sm text-white/80">
                A real-time snapshot of inflows, outflows, and transfers with quick access to deeper drilldowns.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={colorInputRef}
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="hidden"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => colorInputRef.current?.click()}
                className="h-8 gap-1.5 px-3 text-xs rounded-lg border border-white/20 bg-white/20 text-white hover:bg-white/30"
              >
                <Palette className="h-3.5 w-3.5" />
                Theme
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={exportReport}
                disabled={exporting}
                className="h-8 gap-1.5 px-3 text-xs rounded-lg border border-white/20 bg-white/20 text-white hover:bg-white/30 disabled:opacity-70"
              >
                <FileDown className={cn('h-3.5 w-3.5', exporting ? 'animate-pulse' : '')} />
                {exporting ? 'Exporting...' : 'Export PDF'}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <QuickStat
              label="Total inflow"
              value={formatCurrency(summary.totalPaymentsIn)}
              hint={`${flowCounts.in} record${flowCounts.in === 1 ? '' : 's'}`}
              tone="positive"
              accentColor={accent}
            />
            <QuickStat
              label="Total outflow"
              value={formatCurrency(summary.totalPaymentsOut)}
              hint={`${flowCounts.out} record${flowCounts.out === 1 ? '' : 's'}`}
              tone="negative"
              accentColor={accent}
            />
            <QuickStat
              label="Net cash position"
              value={formatCurrency(netCash)}
              hint={netCash >= 0 ? 'Overall surplus' : 'Overall deficit'}
              tone={netCash >= 0 ? 'positive' : 'negative'}
              accentColor={accent}
            />
            <QuickStat
              label="Transfers processed"
              value={formatCurrency(summary.totalTransfers)}
              hint={`${flowCounts.transfer} movement${flowCounts.transfer === 1 ? '' : 's'}`}
              accentColor={accent}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/construction/${project.id}`)}
              className="gap-2 rounded-xl border border-white/20 bg-white/15 text-white hover:bg-white/25"
            >
              <Table2 className="h-4 w-4" />
              Project hub
            </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/construction/${project.id}/statement`)}
                className="gap-2 rounded-xl border border-white/20 bg-white/15 text-white hover:bg-white/25"
              >
              <BarChart3 className="h-4 w-4" />
              Statement
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
              className="gap-2 rounded-xl border border-white/20 bg-white/15 text-white hover:bg-white/25 disabled:opacity-70"
            >
              <RefreshCcw className={cn('h-4 w-4', refreshing ? 'animate-spin' : '')} />
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {budgetProvided ? (
        <Card className="border border-border/60 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
          <CardContent className="grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Budget progress</h2>
              <p className="text-sm text-white/80">
                {resolvedBudget > 0
                  ? `Track how expenses compare to the approved budget of ${formatCurrency(resolvedBudget)}.`
                  : 'Set a project budget to keep spending on track.'}
              </p>
              <ProgressBar
                value={budgetRatio}
                label={
                  resolvedBudget > 0
                    ? `${Math.min(100, budgetRatio * 100).toFixed(1)}% used`
                    : 'Awaiting budget'
                }
              />
            </div>
            <div className="grid gap-3">
              <StatCard
                title="Budget utilised"
                value={formatCurrency(totalOutflow)}
                subtitle={
                  resolvedBudget > 0
                    ? `${formatPercent(budgetRatio)} of budget`
                    : 'Budget not set'
                }
                percent={budgetRatio * 100}
                icon={<BarChart3 className="h-5 w-5" />}
                accent="rgba(252, 211, 77, 1)"
                variant="inverted"
              />
              <StatCard
                title="Budget remaining"
                value={formatCurrency(budgetRemaining)}
                subtitle={
                  resolvedBudget > 0 ? 'Balance available for future spend' : 'Set a budget to unlock tracking'
                }
                percent={resolvedBudget > 0 ? Math.max(0, ((resolvedBudget - totalOutflow) / resolvedBudget) * 100) : 0}
                icon={<LineChart className="h-5 w-5" />}
                accent="rgba(96, 165, 250, 1)"
                variant="inverted"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Category breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Understand where cash is coming from and how it is being spent.
          </p>
        </CardHeader>
        <CardContent>
          {categoryBreakdown.inflow.rows.length === 0 && categoryBreakdown.outflow.rows.length === 0 ? (
            <EmptyState message="No category data yet. Add incoming or outgoing payments with categories to see insights." />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <CategoryList
                title="Top inflow categories"
                tone="positive"
                data={categoryBreakdown.inflow}
                onSelect={handleCategoryDrilldown}
                accentColor={accent}
                budget={resolvedBudget}
              />
              <CategoryList
                title="Top spending categories"
                tone="negative"
                data={categoryBreakdown.outflow}
                onSelect={handleCategoryDrilldown}
                accentColor={accent}
                budget={resolvedBudget}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Account activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Monitor how funds move through bank accounts, including transfers.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <InsightMetric label="Active accounts" value={`${activeAccounts}`} hint={`${totalAccounts} linked`} />
            <InsightMetric
              label="Most active account"
              value={mostActiveAccount?.label ?? 'No activity yet'}
              hint={mostActiveAccount ? formatCurrency(mostActiveAccount.activity) + ' total movement' : undefined}
            />
            <InsightMetric
              label="Largest net position"
              value={largestNetAccount?.label ?? 'No activity'}
              hint={largestNetAccount ? formatCurrency(largestNetAccount.net) : undefined}
            />
          </div>

          {accountBreakdown.length === 0 ? (
            <EmptyState message="No account activity recorded yet." />
          ) : (
            <div className="space-y-3">
              {accountBreakdown.map((account) => (
                <AccountRow
                  key={account.key}
                  account={account}
                  totalActivity={totalActivity}
                  onSelect={handleAccountDrilldown}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Monthly activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Month-by-month summary of inflows, outflows, and transfer volume.
          </p>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <EmptyState message="Add payments or transfers to start building a timeline." />
          ) : (
            <div className="space-y-3">
              {timeline.map((point) => (
                <TimelineRow key={point.key} point={point} onSelect={handleTimelineDrilldown} />
              ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}

function InsightMetric({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const toneStyles =
    tone === 'positive'
      ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
      : tone === 'negative'
        ? 'border-rose-200/70 bg-rose-50 text-rose-700'
        : 'border-border/60 bg-muted/30 text-foreground'

  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm transition-colors', toneStyles)}>
      <p className="text-xs uppercase tracking-wide text-current/70">{label}</p>
      <p className="mt-2 text-lg font-semibold text-current">{value}</p>
      {hint ? <p className="text-xs text-current/70">{hint}</p> : null}
    </div>
  )
}

function CategoryList({
  title,
  tone,
  data,
  onSelect,
  accentColor,
  budget,
}: {
  title: string
  tone: 'positive' | 'negative'
  data: CategoryBreakdown
  onSelect?: (row: CategoryAggregate) => void
  accentColor: string
  budget?: number | null
}) {
  const baseColor =
    tone === 'positive'
      ? blendColors(accentColor, '#10b981', 0.35)
      : blendColors(accentColor, '#ef4444', 0.35)
  const gradient = buildGradient(baseColor)
  const textClass = tone === 'positive' ? 'text-emerald-600' : 'text-rose-600'
  const limited = data.rows.slice(0, 6)
  const total = data.total
  const budgetCap = budget && budget > 0 ? budget : null
  return (
    <div className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <span className={cn('text-xs font-medium uppercase tracking-wide', textClass)}>
          {formatCurrency(total)}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {limited.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data yet.</p>
        ) : (
          limited.map((row) => {
            const denominator =
              tone === 'negative' && budgetCap
                ? budgetCap
                : total || 1
            const shareRatio = denominator > 0 ? row.amount / denominator : 0
            const width = Math.min(100, Math.max(0, shareRatio * 100))
            const shareLabel =
              tone === 'negative' && budgetCap
                ? `${formatPercentUnbounded(row.amount / budgetCap)} of budget`
                : `${formatPercent(row.share ?? (total > 0 ? row.amount / total : 0))} of total`
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onSelect?.(row)}
                className="group w-full rounded-xl border border-transparent bg-muted/20 p-3 text-left transition hover:-translate-y-1 hover:border-border/70 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span className="font-medium">{row.label}</span>
                  <span>{formatCurrency(row.amount)}</span>
                </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${width}%`, background: gradient }}
                />
              </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>{shareLabel}</span>
                  <span>
                    {row.count} record{row.count === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function AccountRow({
  account,
  totalActivity,
  onSelect,
}: {
  account: AccountAggregate
  totalActivity: number
  onSelect?: (account: AccountAggregate) => void
}) {
  const netTone = account.net >= 0 ? 'text-emerald-600' : 'text-rose-600'
  const activityShare = totalActivity > 0 ? account.activity / totalActivity : 0
  const volume = formatCurrency(account.activity)
  const net = formatCurrency(account.net)
  const surface = '#ffffff'
  return (
    <button
      type="button"
      onClick={() => onSelect?.(account)}
      className="group w-full rounded-2xl border border-border/40 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      style={{ background: surface }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{account.label}</p>
          <div className="mt-1 text-xs text-muted-foreground">
            {account.bankName ? <span>{account.bankName}</span> : null}
            {account.bankName && account.kind !== 'linked' ? <span className="mx-1">â€¢</span> : null}
            <span className="capitalize">{account.kind === 'linked' ? 'Linked' : account.kind}</span>
            {account.isArchived ? <span className="ml-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Archived</span> : null}
          </div>
        </div>
        <div className="text-right">
          <p className={cn('text-sm font-semibold', netTone)}>{net}</p>
          <p className="text-xs text-muted-foreground">Net position</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <p className="font-semibold text-emerald-600">{formatCurrency(account.totalIn + account.transferIn)}</p>
          <p>Inflows incl. transfers</p>
        </div>
        <div>
          <p className="font-semibold text-rose-600">{formatCurrency(account.totalOut + account.transferOut)}</p>
          <p>Outflows incl. transfers</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">{volume}</p>
          <p>Total movement</p>
        </div>
      </div>
      <div className="mt-4 space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{account.count} record{account.count === 1 ? '' : 's'}</span>
          <span>{formatPercent(activityShare)} of tracked activity</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/80 transition-all"
            style={{ width: `${Math.min(100, activityShare * 100)}%` }}
          />
        </div>
      </div>
    </button>
  )
}

function TimelineRow({
  point,
  onSelect,
}: {
  point: TimelinePoint
  onSelect?: (point: TimelinePoint) => void
}) {
  const netTone = point.net >= 0 ? 'text-emerald-600' : 'text-rose-600'
  const totalDirectional = point.inflow + point.outflow
  const inflowShare = totalDirectional > 0 ? point.inflow / totalDirectional : 0
  const outflowShare = totalDirectional > 0 ? point.outflow / totalDirectional : 0
  return (
    <button
      type="button"
      onClick={() => onSelect?.(point)}
      className="group w-full rounded-2xl border border-border/60 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{point.label}</p>
          <p className="text-xs text-muted-foreground">{point.count} record{point.count === 1 ? '' : 's'} - {formatCurrency(point.activity)} activity</p>
        </div>
        <div className={cn('text-sm font-semibold', netTone)}>{formatCurrency(point.net)}</div>
      </div>
      <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="font-semibold text-emerald-600">Inflow: {formatCurrency(point.inflow)}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${Math.min(100, inflowShare * 100)}%` }} />
          </div>
        </div>
        <div className="hidden text-center text-[10px] uppercase tracking-wide text-muted-foreground/70 sm:block">
          vs
        </div>
        <div>
          <p className="font-semibold text-rose-600 text-right sm:text-left">Outflow: {formatCurrency(point.outflow)}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-rose-500/80" style={{ width: `${Math.min(100, outflowShare * 100)}%` }} />
          </div>
        </div>
      </div>
      {point.transfers > 0 ? (
        <p className="mt-3 text-[11px] text-sky-600">
          Transfers moved {formatCurrency(point.transfers)} within accounts.
        </p>
      ) : null}
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">{message}</p>
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-white/70">
        <span>Progress</span>
        <span>{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-lime-300 transition-all"
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  )
}

function ensureNumber(value?: number | null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  const safe = Math.min(1, Math.max(0, value))
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: safe >= 0.1 ? 0 : 1,
    maximumFractionDigits: 1,
  })
  return formatter.format(safe)
}

function formatPercentUnbounded(value: number) {
  if (!Number.isFinite(value)) return '0%'
  const percentage = value * 100
  const abs = Math.abs(percentage)
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${formatter.format(percentage)}%`
}

function getFlowTimestamp(flow: ProjectFlow) {
  const value = flow.date ?? flow.createdAt
  if (!value) return 0
  const date = new Date(value)
  const timestamp = date.getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function QuickStat({
  label,
  value,
  hint,
  tone = 'neutral',
  accentColor,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative' | 'neutral'
  accentColor?: string
}) {
  const base = accentColor ?? '#6366f1'
  const toneBase =
    tone === 'positive'
      ? blendColors(base, '#10b981', 0.35)
      : tone === 'negative'
        ? blendColors(base, '#ef4444', 0.35)
        : base
  const gradient = buildGradient(toneBase)

  return (
    <div
      className="rounded-2xl border border-white/20 p-4 shadow-lg shadow-black/10 backdrop-blur transition duration-200 text-white"
      style={{ background: gradient }}
    >
      <p className="text-[11px] uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-white/80">{hint}</p> : null}
    </div>
  )
}

function buildGradient(color: string) {
  const mix = tint(color, 0.35)
  const soft = tint(color, 0.65)
  return `linear-gradient(135deg, ${color} 0%, ${mix} 55%, ${soft} 100%)`
}

function tint(color: string, amount: number) {
  const rgb = parseHex(color)
  if (!rgb) return color
  const blend = (component: number) => Math.round(component + (255 - component) * amount)
  return rgbToCss(blend(rgb.r), blend(rgb.g), blend(rgb.b))
}

function blendColors(colorA: string, colorB: string, ratio: number) {
  const a = parseHex(colorA)
  const b = parseHex(colorB)
  if (!a || !b) return colorA
  const mix = (componentA: number, componentB: number) =>
    Math.round(componentA + (componentB - componentA) * ratio)
  return rgbToCss(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b))
}

function parseHex(color: string) {
  if (!color) return null
  let hex = color.startsWith('#') ? color.slice(1) : color
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (hex.length !== 6) return null
  const num = Number.parseInt(hex, 16)
  if (Number.isNaN(num)) return null
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

function rgbToCss(r: number, g: number, b: number) {
  return `rgb(${clampColor(r)}, ${clampColor(g)}, ${clampColor(b)})`
}

function clampColor(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}




