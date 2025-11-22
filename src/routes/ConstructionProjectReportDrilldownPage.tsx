import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import jsPDF from "jspdf"
import { ArrowLeft, Filter, FileDown, FileSpreadsheet, Loader2, RefreshCcw } from "lucide-react"

import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { formatAppDate, formatAppDateTime } from "../lib/date"
import { formatCurrency } from "../lib/format"
import { cn } from "../lib/utils"
import { savePDF } from "../lib/pdfExport"
import {
  getProjectProfile,
  getTenderAnalysis,
  listTenderAnalyses,
  type TenderAnalysisSummary,
} from "../services/projects"
import type {
  ProjectBankAccount,
  ProjectFlow,
  ProjectFlowType,
  ProjectProfile,
  ProjectTenderRecord,
  ProjectTenderStatus,
} from "../types/projects"
import { TenderBiddingAnalysisQuickAction } from "../features/projects/TenderBiddingAnalysisQuickAction"

type DrilldownScope = "category" | "account" | "month"

type FiltersState = {
  type: "all" | ProjectFlowType
  from: string
  to: string
  search: string
  accountKey: string
  categoryKey: string
}

type TrendPoint = {
  key: string
  label: string
  inflow: number
  outflow: number
  transfer: number
  net: number
  total: number
}

const ACCOUNT_FILTER_ALL = "__all_accounts__"
const CATEGORY_FILTER_ALL = "__all_categories__"

type MetricCard = {
  key: string
  label: string
  value: string
  hint: string
  tone: "positive" | "negative" | "neutral"
  featured?: boolean
  emphasize?: boolean
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" })
const TENDER_STATUS_LABELS: Record<ProjectTenderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  awarded: "Awarded",
  cancelled: "Cancelled",
}

export default function ConstructionProjectReportDrilldownPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const scopeParam = searchParams.get("scope")
  const refParam = searchParams.get("ref") ?? ""
  const presetLabel = searchParams.get("label") ?? ""
  const presetFlowType = searchParams.get("flowType")
  const scope: DrilldownScope | null =
    scopeParam === "category" || scopeParam === "account" || scopeParam === "month" ? scopeParam : null

  const initialType = isFlowType(presetFlowType) ? presetFlowType : "all"

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FiltersState>({
    type: initialType,
    from: "",
    to: "",
    search: "",
    accountKey: "",
    categoryKey: "",
  })
  const [exporting, setExporting] = useState(false)
  const [tenderSummaries, setTenderSummaries] = useState<TenderAnalysisSummary[]>([])
  const [tenderSummaryLoading, setTenderSummaryLoading] = useState(false)
  const [tenderDetailLoading, setTenderDetailLoading] = useState(false)
  const [activeTender, setActiveTender] = useState<ProjectTenderRecord | null>(null)
  const [activeTenderMeta, setActiveTenderMeta] = useState<{ id: string; storage: "supabase" | "local" } | null>(null)

  useEffect(() => {
    if (!projectId) return
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const profile = await getProjectProfile(projectId)
        if (!profile) {
          setProject(null)
          setError("Project not found")
        } else {
          setProject(profile)
        }
      } catch (err) {
        console.error(err)
        setProject(null)
        setError("Unable to prepare drilldown")
        toast.error("Unable to load report data")
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => undefined)
  }, [projectId])

  useEffect(() => {
    setFilters({
      type: initialType,
      from: "",
      to: "",
      search: "",
      accountKey: "",
      categoryKey: "",
    })
  }, [initialType, refParam, scope])

  const refresh = useCallback(
    async (withSpinner = true) => {
      if (!projectId) return
      try {
        if (withSpinner) setRefreshing(true)
        const profile = await getProjectProfile(projectId)
        if (!profile) {
          setProject(null)
          setError("Project not found")
        } else {
          setProject(profile)
          setError(null)
        }
      } catch (err) {
        console.error(err)
        setError("Unable to refresh data")
        toast.error("Unable to refresh data right now")
      } finally {
        setRefreshing(false)
      }
    },
    [projectId]
  )

  const loadTenderSummaries = useCallback(async () => {
    if (!projectId) return
    setTenderSummaryLoading(true)
    try {
      const summaries = await listTenderAnalyses({ projectId })
      setTenderSummaries(summaries)
    } catch (error) {
      console.error(error)
      toast.error("Unable to load tender analyses for this project")
    } finally {
      setTenderSummaryLoading(false)
    }
  }, [projectId])

  const openTenderSummary = useCallback(
    async (summary: TenderAnalysisSummary) => {
      setTenderDetailLoading(true)
      try {
        const detail = await getTenderAnalysis({ id: summary.id, storage: summary.storage })
        if (!detail) {
          toast.error("Unable to open tender analysis")
          return
        }
        setActiveTender(detail.tender)
        setActiveTenderMeta({ id: detail.id, storage: summary.storage })
      } catch (error) {
        console.error(error)
        toast.error("Unable to load tender analysis detail")
      } finally {
        setTenderDetailLoading(false)
      }
    },
    []
  )

  const accountMap = useMemo(() => {
    const map = new Map<string, ProjectBankAccount>()
    project?.bankAccounts.forEach((account) => {
      if (account?.id) map.set(account.id, account)
    })
    return map
  }, [project?.bankAccounts])

  const baseFlows = useMemo(() => {
    if (!project || !scope || !refParam) return [] as ProjectFlow[]
    return project.flows.filter((flow) => matchesScope(flow, scope, refParam))
  }, [project, scope, refParam])

  const defaultTenderCurrency = useMemo(() => {
    if (!project) return "NPR"
    const flowCurrency = project.flows.find((flow) => flow.currency)?.currency
    return (flowCurrency ?? "NPR").toUpperCase()
  }, [project])

  useEffect(() => {
    loadTenderSummaries().catch(() => undefined)
  }, [loadTenderSummaries])

  useEffect(() => {
    if (tenderSummaries.length === 0) {
      setActiveTender(null)
      setActiveTenderMeta(null)
      return
    }
    if (!activeTenderMeta || !tenderSummaries.some((summary) => summary.id === activeTenderMeta.id)) {
      openTenderSummary(tenderSummaries[0]).catch(() => undefined)
    }
  }, [tenderSummaries, activeTenderMeta, openTenderSummary])

  const handleExportTender = () => {
    if (!activeTender) {
      toast.error("Select a tender record first")
      return
    }
    const headers = ["SN", "Item", "Quantity", "Unit", "Unit price", "Total", "Vendor", "Notes", "Source"]
    const rows = activeTender.lines.map((line, index) => {
      const breakdown =
        line.breakdown && typeof line.breakdown === "object" ? (line.breakdown as Record<string, unknown>) : null
      const vendor =
        breakdown && typeof breakdown.vendor === "string" && breakdown.vendor.trim() ? breakdown.vendor.trim() : ""
      const notes =
        breakdown && typeof breakdown.notes === "string" && breakdown.notes.trim() ? breakdown.notes.trim() : ""
      const quantity = Number(line.quantity ?? 0)
      const unitPrice =
        line.unitPrice !== null && line.unitPrice !== undefined ? Number(line.unitPrice) : undefined
      const amount =
        line.amount !== null && line.amount !== undefined
          ? Number(line.amount)
          : unitPrice !== undefined
            ? unitPrice * quantity
            : undefined
      return [
        index + 1,
        line.name,
        quantity,
        line.unit ?? "",
        unitPrice ?? "",
        amount ?? "",
        vendor,
        notes,
        line.pricingSource ?? "Manual entry",
      ]
    })
    const footer = [
      "",
      "Totals",
      activeTender.lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0),
      "",
      "",
      activeTender.totalAmount ?? activeTender.lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0),
      "",
      "",
      "",
    ]
    const csv = [headers, ...rows, footer].map((row) => row.map(escapeCsvValue).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${activeTender.tenderNumber || "tender-analysis"}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    toast.success("Tender analysis exported (CSV)")
  }

  const detailLabel = useMemo(() => {
    if (presetLabel) return presetLabel
    if (!scope || !refParam) return ""
    if (scope === "category") {
      const parsed = parseCategoryRef(refParam)
      const sample = baseFlows.find((flow) => matchesCategory(flow, parsed))
      if (sample?.categoryName) return sample.categoryName
      if (sample?.categoryId) return `Category ${sample.categoryId.slice(0, 6)}`
      return parsed.code === "uncategorised" ? "Uncategorised" : parsed.code
    }
    if (scope === "account") {
      const parsed = parseAccountRef(refParam)
      if (parsed.kind === "linked" || parsed.kind === "archived") {
        const account = parsed.id ? accountMap.get(parsed.id) : undefined
        if (account) return account.label
      }
      const sample = baseFlows[0]
      if (sample) {
        if (parsed.kind === "virtual" && sample.accountName) return sample.accountName
        if (parsed.kind === "linked" || parsed.kind === "archived") {
          const label =
            accountMap.get(parsed.id ?? "")?.label ?? sample.accountName ?? sample.fromAccountName ?? sample.toAccountName
          if (label) return label
        }
      }
      return parsed.label
    }
    const sample = baseFlows[0]
    if (!sample) return ""
    const monthStart = getMonthStart(sample)
    return monthStart ? dateFormatter.format(monthStart) : ""
  }, [presetLabel, scope, refParam, baseFlows, accountMap])

  const headline = useMemo(() => {
    switch (scope) {
      case "category":
        return "Category insight"
      case "account":
        return "Account spotlight"
      case "month":
        return "Monthly performance"
      default:
        return "Report detail"
    }
  }, [scope])

  const accent = project?.accentColor ?? "#6366f1"
  const accentShadow = withAlpha(accent, 0.45)
  const accentTone = useMemo(() => resolveTextTone(accent), [accent])
  const accentPrimaryTextClass = accentTone === "dark" ? "text-slate-900" : "text-white"
  const accentMutedTextClass = accentTone === "dark" ? "text-slate-600/80" : "text-white/70"
  const accentBadgeClass =
    accentTone === "dark"
      ? "border-slate-300/70 bg-white/70 text-slate-700"
      : "border-white/30 bg-white/20 text-white/80"
  const accentControlClass =
    accentTone === "dark"
      ? "border-slate-200 bg-white/70 text-slate-900 hover:bg-white disabled:text-slate-400"
      : "border-white/20 bg-white/15 text-white hover:bg-white/25 disabled:text-white/70"

  const filteredFlows = useMemo(() => {
    return baseFlows.filter((flow) => {
      if (filters.type !== "all" && flow.type !== filters.type) return false
      const date = getFlowDate(flow)
      if (filters.from) {
        const fromDate = new Date(filters.from)
        fromDate.setHours(0, 0, 0, 0)
        if (!date || date.getTime() < fromDate.getTime()) return false
      }
      if (filters.to) {
        const toDate = new Date(filters.to)
        toDate.setHours(23, 59, 59, 999)
        if (!date || date.getTime() > toDate.getTime()) return false
      }
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const haystack = [
          flow.notes,
          flow.purpose,
          flow.counterparty,
          flow.categoryName,
          flow.accountName,
          flow.fromAccountName,
          flow.toAccountName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (filters.accountKey) {
        if (!matchesAccountFilter(flow, filters.accountKey)) return false
      }
      if (filters.categoryKey) {
        if (!matchesCategoryFilter(flow, filters.categoryKey)) return false
      }
      return true
    })
  }, [baseFlows, filters])

  const stats = useMemo(() => computeStats(filteredFlows), [filteredFlows])

  const trend = useMemo(() => computeTrend(filteredFlows), [filteredFlows])

  const tableRows = useMemo(() => {
    return [...filteredFlows].sort((a, b) => {
      const aDate = getFlowDate(a)?.getTime() ?? 0
      const bDate = getFlowDate(b)?.getTime() ?? 0
      return bDate - aDate
    })
  }, [filteredFlows])

  const accountOptions = useMemo(() => buildAccountOptions(baseFlows, accountMap), [baseFlows, accountMap])
  const categoryOptions = useMemo(() => buildCategoryOptions(baseFlows), [baseFlows])

  const fallbackTitle = scope === "category" ? "Selected category" : scope === "account" ? "Selected account" : "Selected period"
  const fallbackNoun = scope === "category" ? "category" : scope === "account" ? "account" : "selection"
  const resolvedTitle = detailLabel?.trim().length ? detailLabel : fallbackTitle
  const resolvedNoun = detailLabel?.trim().length ? detailLabel : fallbackNoun
  const highlightCategory = scope === "category"

  const metricCards: MetricCard[] = [
    {
      key: "total",
      label:
        scope === "category"
          ? `${resolvedTitle} cash flow`
          : scope === "account"
            ? `${resolvedTitle} total`
            : "Total volume",
      value: formatCurrency(stats.totalVolume),
      hint: `${stats.count} record${stats.count === 1 ? "" : "s"}`,
      tone: "neutral",
      featured: true,
    },
    {
      key: "inflow",
      label: "Payments in",
      value: formatCurrency(stats.inflow),
      hint:
        stats.inCount > 0
          ? `${stats.inCount} inflow${stats.inCount === 1 ? "" : "s"} - ${resolvedTitle}`
          : `No inflows for this ${resolvedNoun}`,
      tone: stats.inflow > 0 ? "positive" : "neutral",
      emphasize: highlightCategory && stats.inflow > 0,
    },
    {
      key: "outflow",
      label: "Payments out",
      value: formatCurrency(stats.outflow),
      hint:
        stats.outCount > 0
          ? `${stats.outCount} outflow${stats.outCount === 1 ? "" : "s"} - ${resolvedTitle}`
          : `No outflows for this ${resolvedNoun}`,
      tone: stats.outflow > 0 ? "negative" : "neutral",
      emphasize: highlightCategory && stats.outflow > 0,
    },
    {
      key: "net",
      label: "Net position",
      value: formatCurrency(stats.net),
      hint: stats.net >= 0 ? "Cash coming in" : "Cash going out",
      tone: stats.net >= 0 ? "positive" : "negative",
      emphasize: highlightCategory,
    },
  ]

  const exportDrilldown = useCallback(() => {
    if (!project) return
    try {
      setExporting(true)
      const doc = new jsPDF({ unit: "pt", format: "a4" })
      const margin = 48
      const headerHeight = 108
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const baseText = { r: 31, g: 41, b: 55 }
      const outline = { r: 226, g: 232, b: 240 }
      const surface = { r: 248, g: 250, b: 252 }
      const accentColor = project.accentColor ?? "#4f46e5"
      const accentRgb = parseColorToRgb(accentColor) ?? { r: 79, g: 70, b: 229 }
      const headerTone = resolveTextTone(accentColor)
      const headerTextRgb = headerTone === "dark" ? baseText : { r: 255, g: 255, b: 255 }
      const stripeColor = parseColorToRgb(tint(accentColor, 0.88)) ?? { r: 243, g: 246, b: 255 }
      const infoWidth = pageWidth - margin * 2
      const generatedLabel = new Date().toLocaleString()

      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b)
      doc.rect(0, 0, pageWidth, headerHeight, "F")

      doc.setTextColor(headerTextRgb.r, headerTextRgb.g, headerTextRgb.b)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(21)
      doc.text(project.name, margin, 52)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(12)
      doc.text(`${headline} export`, margin, 72)
      doc.setFontSize(10)
      const focusSummary = detailLabel ? `Focus: ${detailLabel}` : "Focus: Unspecified"
      doc.text(focusSummary, margin, 90)
      doc.text(`Generated: ${generatedLabel}`, margin, 106)

      doc.setTextColor(baseText.r, baseText.g, baseText.b)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      let cursorY = headerHeight + 24

      const scopeLabel = scope === "category" ? "Category" : scope === "account" ? "Account" : "Month"
      const infoLines = [
        `Scope: ${scopeLabel}`,
        `Records exported: ${stats.count}`,
        `Filters — type: ${filters.type === "all" ? "All" : filters.type}, from: ${filters.from || "N/A"}, to: ${filters.to || "N/A"}`,
      ]
      if (filters.accountKey) {
        infoLines.push(`Account filter: ${filters.accountKey}`)
      }
      if (filters.categoryKey) {
        infoLines.push(`Category filter: ${filters.categoryKey}`)
      }
      if (filters.search) {
        infoLines.push(`Search query: ${filters.search}`)
      }

      const infoPaddingX = 18
      const infoPaddingY = 18
      const infoLineHeight = 16
      const infoHeight = infoPaddingY * 2 + infoLineHeight * (infoLines.length + 1)

      doc.setFillColor(surface.r, surface.g, surface.b)
      doc.setDrawColor(outline.r, outline.g, outline.b)
      doc.roundedRect(margin, cursorY, infoWidth, infoHeight, 10, 10, "FD")

      doc.setFont("helvetica", "bold")
      doc.text("Export context", margin + infoPaddingX, cursorY + infoPaddingY)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      infoLines.forEach((line, index) => {
        doc.text(line, margin + infoPaddingX, cursorY + infoPaddingY + 18 + index * infoLineHeight)
      })

      cursorY += infoHeight + 24

      const contentWidth = infoWidth
      const summaryBlocks = [
        {
          label: "Total volume",
          value: formatCurrency(stats.totalVolume),
          hint: `${stats.count} record${stats.count === 1 ? "" : "s"}`,
          emphasize: false,
        },
        {
          label: "Payments in",
          value: formatCurrency(stats.inflow),
          hint: stats.inCount ? `${stats.inCount} inflow${stats.inCount === 1 ? "" : "s"}` : "No inflows recorded",
          emphasize: highlightCategory && stats.inflow > 0,
        },
        {
          label: "Payments out",
          value: formatCurrency(stats.outflow),
          hint: stats.outCount ? `${stats.outCount} outflow${stats.outCount === 1 ? "" : "s"}` : "No outflows recorded",
          emphasize: highlightCategory && stats.outflow > 0,
        },
        {
          label: "Net position",
          value: formatCurrency(stats.net),
          hint: stats.net >= 0 ? "Positive net movement" : "Negative net movement",
          emphasize: highlightCategory,
        },
      ] as const

      const blockGap = 20
      const blockWidth = (contentWidth - blockGap) / 2
      const blockHeight = 72
      let blockY = cursorY

      summaryBlocks.forEach((block, index) => {
        const column = index % 2
        const blockX = margin + column * (blockWidth + blockGap)
        if (index > 0 && column === 0) {
          blockY += blockHeight + 16
        }
        const fill = block.emphasize ? stripeColor : surface
        const borderColor = block.emphasize ? accentRgb : outline

        doc.setFillColor(fill.r, fill.g, fill.b)
        doc.setDrawColor(borderColor.r, borderColor.g, borderColor.b)
        doc.roundedRect(blockX, blockY, blockWidth, blockHeight, 10, 10, "FD")

        doc.setTextColor(baseText.r, baseText.g, baseText.b)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        doc.text(block.label.toUpperCase(), blockX + 16, blockY + 20)

        doc.setFontSize(16)
        doc.text(block.value, blockX + 16, blockY + 40)

        if (block.hint) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(10)
          const hintLines = doc.splitTextToSize(block.hint, blockWidth - 32)
          doc.text(hintLines, blockX + 16, blockY + 58)
        }
      })

      cursorY = blockY + blockHeight + 36

      doc.setTextColor(baseText.r, baseText.g, baseText.b)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(14)
      doc.text("Transactions", margin, cursorY)

      cursorY += 18

      type TableRow = {
        index: string
        date: string
        type: string
        amount: string
        account: string
        category: string
        notes: string
      }

      const columns: { key: keyof TableRow; header: string; width: number; align: "left" | "right" }[] = [
        { key: "index", header: "#", width: 26, align: "left" },
        { key: "date", header: "Date", width: 70, align: "left" },
        { key: "type", header: "Type", width: 70, align: "left" },
        { key: "amount", header: "Amount", width: 68, align: "right" },
        { key: "account", header: "Account", width: 94, align: "left" },
        { key: "category", header: "Category", width: 78, align: "left" },
        { key: "notes", header: "Notes", width: 92, align: "left" },
      ]

      const rows: TableRow[] = filteredFlows.slice(0, 40).map((flow, index) => {
        const meta = resolveFlowTypeMeta(flow.type)
        const date =
          formatAppDate(flow.date) ||
          formatAppDate(flow.createdAt) ||
          (flow.createdAt ? formatAppDateTime(new Date(flow.createdAt)) : "--")
        const amount = formatCurrency(flow.amount || 0)
        const account =
          flow.type === "transfer"
            ? `${flow.fromAccountName ?? "Unlinked"} -> ${flow.toAccountName ?? "Unlinked"}`
            : flow.accountName ?? "Unlinked account"
        return {
          index: `${index + 1}`,
          date,
          type: meta.label,
          amount,
          account,
          category: flow.categoryName ?? "Uncategorised",
          notes: flow.notes ? flow.notes.trim() : "",
        }
      })

      const headerRowHeight = 26
      const rowLineHeight = 14
      const bottomLimit = pageHeight - margin

      const drawHeader = () => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b)
        doc.setLineWidth(0.8)
        let x = margin
        columns.forEach((column) => {
          doc.setDrawColor(accentRgb.r, accentRgb.g, accentRgb.b)
          doc.rect(x, cursorY, column.width, headerRowHeight, "S")
          const headerX = column.align === "right" ? x + column.width - 8 : x + 8
          const headerOptions = column.align === "right" ? { align: "right" as const } : undefined
          doc.text(column.header, headerX, cursorY + 17, headerOptions)
          x += column.width
        })
        doc.setTextColor(baseText.r, baseText.g, baseText.b)
        doc.setLineWidth(0.5)
        cursorY += headerRowHeight
      }

      drawHeader()
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)

      rows.forEach((row) => {
        const cellLines: string[][] = columns.map((column) =>
          doc.splitTextToSize(row[column.key], column.width - 12) as string[]
        )
        const lineCount = Math.max(...cellLines.map((lines) => Math.max(lines.length, 1)))
        const rowHeight = lineCount * rowLineHeight + 10

        if (cursorY + rowHeight > bottomLimit) {
          doc.addPage()
          doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b)
          doc.rect(0, 0, pageWidth, 24, "F")
          cursorY = margin
          doc.setTextColor(baseText.r, baseText.g, baseText.b)
          drawHeader()
          doc.setFont("helvetica", "normal")
          doc.setFontSize(10)
        }

        let x = margin
        columns.forEach((column, columnIndex) => {
          doc.setDrawColor(outline.r, outline.g, outline.b)
          doc.rect(x, cursorY, column.width, rowHeight, "S")
          const lines = cellLines[columnIndex]
          lines.forEach((line, lineIndex) => {
            const textY = cursorY + 8 + rowLineHeight * (lineIndex + 1) - 4
            const textX = column.align === "right" ? x + column.width - 8 : x + 8
            const options = column.align === "right" ? { align: "right" as const } : undefined
            doc.text(line, textX, textY, options)
          })
          x += column.width
        })
        cursorY += rowHeight
      })

      if (filteredFlows.length > rows.length) {
        cursorY += 20
        doc.setFont("helvetica", "italic")
        doc.setFontSize(9)
        const remaining = filteredFlows.length - rows.length
        doc.text(`+ ${remaining} more transaction${remaining === 1 ? "" : "s"} not shown in this summary.`, margin, cursorY)
      }

      savePDF(doc, `${project.name}-${scope}-drilldown`)
    } catch (err) {
      console.error(err)
      toast.error("Unable to export drilldown right now")
    } finally {
      setExporting(false)
    }
  }, [project, headline, detailLabel, filters, stats, filteredFlows, scope])

  const showAccountFilter = scope !== "account" && accountOptions.length > 1
  const showCategoryFilter = scope === "account" && categoryOptions.length > 1

  if (!projectId || !scope || !refParam) {
    return (
      <div className="space-y-4">
        <Button variant='ghost' onClick={() => navigate(-1)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Drilldown unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A valid drilldown scope was not provided. Return to the report and choose a category, account, or month again.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading && !project) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-muted-foreground">
        Preparing detailed analytics...
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="space-y-4">
        <Button variant='ghost' onClick={() => navigate(-1)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Unable to load drilldown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => refresh(true)} className="w-fit gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/construction/${projectId}/report`)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to report
        </Button>
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">{headline}</p>
          <h1 className="text-2xl font-semibold text-foreground">{detailLabel || 'Focused insight'}</h1>
          <p className="text-sm text-muted-foreground">
            Apply filters, review trend charts, and inspect every transaction powering this metric.
          </p>
        </div>
      </div>

      <Card
        className={cn("overflow-hidden border-none shadow-xl", accentPrimaryTextClass)}
        style={{ background: buildGradient(accent), boxShadow: `0 28px 70px -34px ${accentShadow}` }}
      >
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className={cn("text-[11px] uppercase tracking-[0.4em]", accentMutedTextClass)}>{headline}</p>
              <h2 className={cn("text-3xl font-semibold", accentPrimaryTextClass)}>{detailLabel || "Focused insight"}</h2>
              <span className={cn("inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide", accentBadgeClass)}>
                {scope === "category" ? "Category" : scope === "account" ? "Account" : "Month"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={exportDrilldown}
                disabled={exporting}
                className={cn("gap-2 rounded-xl disabled:opacity-70", accentControlClass)}
              >
                <FileDown className={cn("h-4 w-4", exporting ? "animate-pulse" : "")} />
                {exporting ? "Preparing..." : "Export PDF"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refresh(true)}
                disabled={refreshing}
                className={cn("gap-2 rounded-xl disabled:opacity-70", accentControlClass)}
              >
                <RefreshCcw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, type: initialType, from: "", to: "", search: "", accountKey: "", categoryKey: "" }))
                }
                className={cn("gap-2 rounded-xl", accentControlClass)}
              >
                <Filter className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((metric) => (
              <HeroMetric
                key={metric.key}
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
                tone={metric.tone}
                accentColor={accent}
                featured={metric.featured}
                emphasize={metric.emphasize}
              />
            ))}
          </div>
      </CardContent>
    </Card>

      {project ? (
        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Launch tender bidding analysis without leaving this drilldown.
            </p>
          </CardHeader>
      <CardContent>
        <TenderBiddingAnalysisQuickAction
          projectId={project.id}
          projectName={project.name}
          accentColor={accent}
          defaultCurrency={defaultTenderCurrency}
        />
      </CardContent>
    </Card>
  ) : null}

      {project ? (
        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>Tender analyses register</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review saved tender summaries for this project, export snapshots, or jump back to price analysis.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span>{tenderSummaries.length} record{tenderSummaries.length === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>{activeTender ? `Viewing ${activeTender.tenderNumber}` : "Select a tender to view"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadTenderSummaries()}
                  disabled={tenderSummaryLoading}
                  className="gap-2"
                >
                  {tenderSummaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate("/construction/price-analysis")}
                >
                  Open price analysis
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
              <div className="space-y-2">
                {tenderSummaries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-xs text-muted-foreground">
                    No tender analyses stored yet. Save a draft from price analysis to see it here.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {tenderSummaries.map((summary) => (
                      <button
                        key={`${summary.storage}:${summary.id}`}
                        type="button"
                        className={cn(
                          "w-full rounded-xl border border-border/60 bg-white px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5",
                          activeTenderMeta?.id === summary.id && "border-primary bg-primary/5"
                        )}
                        onClick={() => openTenderSummary(summary).catch(() => undefined)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground break-words">{summary.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {summary.tenderNumber} · {TENDER_STATUS_LABELS[summary.status]}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p className="font-semibold text-primary">
                              {formatCurrency(summary.totalAmount, defaultTenderCurrency)}
                            </p>
                            <p>{formatTenderDate(summary.updatedAt)}</p>
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {summary.storage === "supabase" ? "Workspace" : "Offline"} · {summary.lineCount} line
                          {summary.lineCount === 1 ? "" : "s"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {activeTender ? activeTender.title : "Tender detail"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activeTender ? `${activeTender.tenderNumber} · ${TENDER_STATUS_LABELS[activeTender.status]}` : "Select a tender to inspect"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleExportTender}
                      disabled={!activeTender}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </div>
                {tenderDetailLoading ? (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading tender…
                  </div>
                ) : activeTender ? (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="min-w-[640px] w-full divide-y divide-border/60 text-sm">
                        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">SN</th>
                            <th className="px-3 py-2 text-left font-semibold">Item</th>
                            <th className="px-3 py-2 text-right font-semibold">Qty</th>
                            <th className="px-3 py-2 text-left font-semibold">Unit</th>
                            <th className="px-3 py-2 text-right font-semibold">Rate</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                            <th className="px-3 py-2 text-left font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 bg-white">
                          {activeTender.lines.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-3 py-5 text-center text-xs text-muted-foreground">
                                No lines captured for this tender.
                              </td>
                            </tr>
                          ) : (
                            activeTender.lines.map((line, index) => {
                              const breakdown =
                                line.breakdown && typeof line.breakdown === "object"
                                  ? (line.breakdown as Record<string, unknown>)
                                  : null
                              const vendor =
                                breakdown && typeof breakdown.vendor === "string" ? breakdown.vendor : ""
                              const notes =
                                breakdown && typeof breakdown.notes === "string" ? breakdown.notes : ""
                              const qty = Number(line.quantity ?? 0)
                              const unitPrice =
                                line.unitPrice !== null && line.unitPrice !== undefined
                                  ? Number(line.unitPrice)
                                  : undefined
                              const amount =
                                line.amount !== null && line.amount !== undefined
                                  ? Number(line.amount)
                                  : unitPrice !== undefined
                                    ? unitPrice * qty
                                    : undefined
                              return (
                                <tr key={line.id ?? `${index}-${line.name}`} className="hover:bg-muted/20">
                                  <td className="px-3 py-3 text-xs text-muted-foreground">{index + 1}</td>
                                  <td className="px-3 py-3 text-sm font-medium text-foreground">{line.name}</td>
                                  <td className="px-3 py-3 text-right tabular-nums">{qty.toLocaleString()}</td>
                                  <td className="px-3 py-3 text-sm text-muted-foreground">{line.unit ?? ""}</td>
                                  <td className="px-3 py-3 text-right tabular-nums">
                                    {unitPrice !== undefined ? formatCurrency(unitPrice, defaultTenderCurrency) : "—"}
                                  </td>
                                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-primary">
                                    {amount !== undefined ? formatCurrency(amount, defaultTenderCurrency) : "—"}
                                  </td>
                                  <td className="px-3 py-3 text-xs text-muted-foreground break-words">
                                    {vendor ? `${vendor}${notes ? ` · ${notes}` : ""}` : notes || "—"}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">
                        Total ({activeTender.lines.length} line{activeTender.lines.length === 1 ? "" : "s"})
                      </span>
                      <span className="font-semibold text-primary">
                        {formatCurrency(activeTender.totalAmount, defaultTenderCurrency)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-xs text-muted-foreground">
                    Select a tender summary from the left to review its line items.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Filters</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tune the dataset to highlight the exact timeframe, account, or tag you want to inspect.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flow type</label>
            <Select
              value={filters.type}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value as FiltersState['type'] }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="payment-in">Payments in</SelectItem>
                <SelectItem value="payment-out">Payments out</SelectItem>
                <SelectItem value="transfer">Transfers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From</label>
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To</label>
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</label>
            <Input
              placeholder="Notes, counterparty, reference..."
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
          </div>
          {showAccountFilter ? (
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</label>
              <Select
                value={filters.accountKey || ACCOUNT_FILTER_ALL}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    accountKey: value === ACCOUNT_FILTER_ALL ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACCOUNT_FILTER_ALL}>All accounts</SelectItem>
                  {accountOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : showCategoryFilter ? (
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</label>
              <Select
                value={filters.categoryKey || CATEGORY_FILTER_ALL}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    categoryKey: value === CATEGORY_FILTER_ALL ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATEGORY_FILTER_ALL}>All categories</SelectItem>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Result count</label>
              <div className="flex h-10 items-center rounded-xl border border-dashed border-border/60 px-4 text-sm text-muted-foreground">
                {filteredFlows.length} item{filteredFlows.length === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Detailed list of every movement included in this drilldown, sorted with the newest first.
            </p>
          </CardHeader>
          <CardContent className="overflow-hidden">
            {tableRows.length === 0 ? (
              <EmptyState message="No transactions match the current filters. Adjust the filters above to broaden the view." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/50 bg-white shadow-sm">
                <table className="min-w-[760px] w-full divide-y divide-border/60 text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold text-right">Amount</th>
                      <th className="px-4 py-3 font-semibold">Account</th>
                      <th className="px-4 py-3 font-semibold">Category / Counterparty</th>
                      <th className="px-4 py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 bg-white">
                    {tableRows.map((flow) => {
                      const meta = resolveFlowTypeMeta(flow.type)
                      const displayDate =
                        formatAppDate(flow.date) ||
                        formatAppDate(flow.createdAt) ||
                        (flow.createdAt ? formatAppDateTime(new Date(flow.createdAt)) : "--")
                      const amount = formatCurrency(flow.amount || 0)
                      const accountLabel =
                        flow.type === "transfer"
                          ? `${flow.fromAccountName ?? "Unlinked"} -> ${flow.toAccountName ?? "Unlinked"}`
                          : flow.accountName ?? "Unlinked account"
                      return (
                        <tr key={flow.id} className="align-top transition-colors odd:bg-white even:bg-slate-50/60 hover:bg-muted/40">
                          <td className="whitespace-nowrap px-4 py-4 align-top text-sm font-semibold text-foreground">
                            {displayDate}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                                meta.badge
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className={cn("whitespace-nowrap px-4 py-4 text-right align-top text-sm font-semibold", meta.amount)}>
                            {amount}
                          </td>
                          <td className="px-4 py-4 align-top text-sm text-foreground">
                            {flow.type === "transfer" ? (
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{flow.fromAccountName ?? "Unlinked account"}</p>
                                <p className="font-medium text-foreground">
                                  {"->"} {flow.toAccountName ?? "Unlinked account"}
                                </p>
                              </div>
                            ) : (
                              <span className="font-medium text-foreground">{accountLabel}</span>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top text-sm leading-6 text-foreground">
                            <div className="space-y-1">
                              {flow.counterparty ? (
                                <p className="text-sm font-semibold text-foreground">{flow.counterparty}</p>
                              ) : null}
                              {flow.categoryName ? (
                                <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {flow.categoryName}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Uncategorised</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                            {flow.notes ? (
                              <p className="max-w-xs whitespace-pre-wrap leading-relaxed">{flow.notes}</p>
                            ) : (
                              <span className="text-xs text-muted-foreground/70">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>Trend overview</CardTitle>
            <p className="text-sm text-muted-foreground">
              Monthly breakdown of inflows, outflows, and transfers for this selection.
            </p>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <EmptyState message="Add more activity or broaden the filters to build a timeline trend." />
            ) : (
              <div className="space-y-4">
                {trend.map((point) => {
                  const inflowPct = point.total > 0 ? point.inflow / point.total : 0
                  const outflowPct = point.total > 0 ? point.outflow / point.total : 0
                  const transferPct = point.total > 0 ? point.transfer / point.total : 0
                  return (
                    <div key={point.key} className="rounded-2xl border border-border/50 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{point.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(point.total)} total - {formatCurrency(point.net)} net
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase",
                            point.net >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          )}
                        >
                          {point.net >= 0 ? "Positive" : "Negative"}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                        <StackedBar label="Inflow" value={inflowPct} tone="positive" amount={formatCurrency(point.inflow)} />
                        <StackedBar label="Outflow" value={outflowPct} tone="negative" amount={formatCurrency(point.outflow)} />
                        <StackedBar label="Transfers" value={transferPct} tone="neutral" amount={formatCurrency(point.transfer)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function computeStats(flows: ProjectFlow[]) {
  const summary = {
    totalVolume: 0,
    inflow: 0,
    outflow: 0,
    transfer: 0,
    net: 0,
    average: 0,
    count: flows.length,
    inCount: 0,
    outCount: 0,
  }
  if (flows.length === 0) return summary
  flows.forEach((flow) => {
    const amount = ensureNumber(flow.amount)
    summary.totalVolume += amount
    if (flow.type === "payment-in") {
      summary.inflow += amount
      summary.net += amount
      summary.inCount += 1
    } else if (flow.type === "payment-out") {
      summary.outflow += amount
      summary.net -= amount
      summary.outCount += 1
    } else {
      summary.transfer += amount
    }
  })
  summary.average = summary.totalVolume / flows.length
  return summary
}

function computeTrend(flows: ProjectFlow[]): TrendPoint[] {
  const map = new Map<string, TrendPoint>()
  flows.forEach((flow) => {
    const monthStart = getMonthStart(flow)
    if (!monthStart) return
    const key = monthStart.toISOString()
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: dateFormatter.format(monthStart),
        inflow: 0,
        outflow: 0,
        transfer: 0,
        net: 0,
        total: 0,
      })
    }
    const entry = map.get(key)!
    const amount = ensureNumber(flow.amount)
    entry.total += amount
    if (flow.type === "payment-in") {
      entry.inflow += amount
      entry.net += amount
    } else if (flow.type === "payment-out") {
      entry.outflow += amount
      entry.net -= amount
    } else {
      entry.transfer += amount
    }
  })
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

function matchesScope(flow: ProjectFlow, scope: DrilldownScope, ref: string) {
  if (scope === "category") {
    return matchesCategory(flow, parseCategoryRef(ref))
  }
  if (scope === "account") {
    return matchesAccount(flow, parseAccountRef(ref))
  }
  return matchesMonth(flow, ref)
}

function matchesCategory(flow: ProjectFlow, ref: { type: ProjectFlowType; code: string }) {
  if (flow.type !== ref.type) return false
  const candidate = (flow.categoryId || flow.categoryName || "uncategorised").toString().trim().toLowerCase()
  return candidate === ref.code
}

function matchesAccount(flow: ProjectFlow, ref: ReturnType<typeof parseAccountRef>) {
  const matchId = (id?: string | null) => !!id && (id === ref.id || ref.id === id)
  const matchName = (name?: string | null) => !!name && name.trim().toLowerCase() === ref.label.toLowerCase()

  if (ref.kind === "linked" || ref.kind === "archived") {
    return matchId(flow.accountId) || matchId(flow.fromAccountId) || matchId(flow.toAccountId)
  }
  if (ref.kind === "virtual") {
    return matchName(flow.accountName) || matchName(flow.fromAccountName) || matchName(flow.toAccountName)
  }
  if (ref.kind === "transfer-unlinked") {
    return (
      flow.type === "transfer" &&
      !flow.fromAccountId &&
      !flow.toAccountId &&
      !flow.fromAccountName &&
      !flow.toAccountName
    )
  }
  return flow.type !== "transfer" && !flow.accountId && !flow.accountName
}

function matchesMonth(flow: ProjectFlow, ref: string) {
  const monthStart = getMonthStart(flow)
  if (!monthStart) return false
  const [yearStr, monthStr] = ref.split("-")
  const year = Number(yearStr)
  const monthIndex = Number(monthStr)
  return monthStart.getUTCFullYear() === year && monthStart.getUTCMonth() === monthIndex
}

function getMonthStart(flow: ProjectFlow) {
  const date = getFlowDate(flow)
  if (!date) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function getFlowDate(flow: ProjectFlow) {
  const value = flow.date ?? flow.createdAt
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseCategoryRef(ref: string) {
  const [type, ...rest] = ref.split(":")
  const code = rest.join(":") || "uncategorised"
  const flowType: ProjectFlowType = type === "payment-out" ? "payment-out" : "payment-in"
  return { type: flowType, code }
}

function parseAccountRef(ref: string) {
  if (ref === "__transfer_unlinked__") {
    return { kind: "transfer-unlinked" as const, label: "Unlinked transfer" }
  }
  if (ref === "__unlinked__") {
    return { kind: "unlinked" as const, label: "Unlinked entry" }
  }
  if (ref.startsWith("linked:")) {
    const id = ref.slice(7)
    return { kind: "linked" as const, id, label: `Account ${id.slice(0, 6)}` }
  }
  if (ref.startsWith("archived:")) {
    const id = ref.slice(9)
    return { kind: "archived" as const, id, label: `Archived ${id.slice(0, 6)}` }
  }
  if (ref.startsWith("virtual:")) {
    const label = ref.slice(8)
    return { kind: "virtual" as const, label }
  }
  return { kind: "virtual" as const, label: ref }
}

function matchesAccountFilter(flow: ProjectFlow, key: string) {
  const [kind, value] = key.split(":")
  if (kind === "id") {
    return [flow.accountId, flow.fromAccountId, flow.toAccountId].some((id) => id === value)
  }
  if (kind === "name") {
    const target = value.toLowerCase()
    return [flow.accountName, flow.fromAccountName, flow.toAccountName]
      .filter(Boolean)
      .some((name) => name!.trim().toLowerCase() === target)
  }
  if (kind === "unlinked" && value === "transfer") {
    return (
      flow.type === "transfer" &&
      !flow.fromAccountId &&
      !flow.toAccountId &&
      !flow.fromAccountName &&
      !flow.toAccountName
    )
  }
  return flow.type !== "transfer" && !flow.accountId && !flow.accountName
}

function matchesCategoryFilter(flow: ProjectFlow, key: string) {
  const [kind, value] = key.split(":")
  if (kind === "id") {
    return flow.categoryId === value
  }
  if (kind === "name") {
    return (flow.categoryName ?? "").trim().toLowerCase() === value
  }
  return !flow.categoryId && !flow.categoryName
}

function buildAccountOptions(flows: ProjectFlow[], accountMap: Map<string, ProjectBankAccount>) {
  const map = new Map<string, { key: string; label: string }>()
  const push = (id?: string | null, name?: string | null) => {
    if (id) {
      const label = accountMap.get(id)?.label ?? name ?? `Account ${id.slice(0, 6)}`
      map.set(`id:${id}`, { key: `id:${id}`, label })
      return
    }
    if (name && name.trim().length) {
      const trimmed = name.trim()
      map.set(`name:${trimmed.toLowerCase()}`, { key: `name:${trimmed.toLowerCase()}`, label: trimmed })
      return
    }
    map.set("unlinked:standard", { key: "unlinked:standard", label: "Unlinked entries" })
  }
  flows.forEach((flow) => {
    if (flow.type === "transfer") {
      push(flow.fromAccountId, flow.fromAccountName)
      push(flow.toAccountId, flow.toAccountName)
    } else {
      push(flow.accountId, flow.accountName)
    }
  })
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function buildCategoryOptions(flows: ProjectFlow[]) {
  const map = new Map<string, { key: string; label: string }>()
  flows.forEach((flow) => {
    if (flow.categoryId) {
      map.set(`id:${flow.categoryId}`, { key: `id:${flow.categoryId}`, label: flow.categoryName ?? flow.categoryId })
    } else if (flow.categoryName) {
      const value = flow.categoryName.trim().toLowerCase()
      map.set(`name:${value}`, { key: `name:${value}`, label: flow.categoryName })
    } else {
      map.set("none:uncategorised", { key: "none:uncategorised", label: "Uncategorised" })
    }
  })
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function resolveFlowTypeMeta(type: ProjectFlowType): { label: string; badge: string; amount: string } {
  if (type === "payment-in") {
    return {
      label: "Payment In",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      amount: "text-emerald-600",
    }
  }
  if (type === "payment-out") {
    return {
      label: "Payment Out",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      amount: "text-rose-600",
    }
  }
  return {
    label: "Transfer",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    amount: "text-sky-600",
  }
}

function ensureNumber(value?: number | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return 0
}

function formatTenderDate(value?: string | null) {
  if (!value) return "Not set"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return formatAppDate(parsed)
}

function escapeCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function isFlowType(value: string | null): value is ProjectFlowType {
  return value === "payment-in" || value === "payment-out" || value === "transfer"
}

function HeroMetric({
  label,
  value,
  hint,
  tone = "neutral",
  accentColor,
  featured = false,
  emphasize = false,
}: {
  label: string
  value: string
  hint?: string
  tone?: "positive" | "negative" | "neutral"
  accentColor?: string
  featured?: boolean
  emphasize?: boolean
}) {
  const baseColor = accentColor ?? "#6366f1"
  const featuredTone = resolveTextTone(baseColor)
  const featuredPrimaryTextClass = featuredTone === "dark" ? "text-slate-900" : "text-white"
  const featuredMutedTextClass = featuredTone === "dark" ? "text-slate-600/80" : "text-white/80"
  const emphasizeRing = emphasize
    ? cn(
        "ring-2 ring-offset-2 ring-offset-background",
        tone === "positive" ? "ring-emerald-300/60" : tone === "negative" ? "ring-rose-300/60" : "ring-indigo-300/60"
      )
    : null

  const containerClass = cn(
    "flex h-full flex-col justify-between rounded-2xl border p-5 transition-shadow duration-200 ease-out",
    featured
      ? cn("border-transparent shadow-xl shadow-black/15", featuredPrimaryTextClass)
      : "border-border/60 bg-white text-foreground shadow-sm hover:shadow-md",
    emphasizeRing ?? undefined
  )

  const labelClass = featured
    ? cn("text-[11px] font-semibold uppercase tracking-[0.25em] break-words", featuredMutedTextClass)
    : "text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground break-words"

  const amountClass = featured
    ? cn("text-3xl font-semibold leading-tight tracking-tight break-words", featuredPrimaryTextClass)
    : cn(
        "text-2xl font-semibold leading-tight break-words",
        tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-rose-600" : "text-foreground"
      )

  const hintClass = featured ? cn("text-xs break-words", featuredMutedTextClass) : "text-xs text-muted-foreground break-words"

  return (
    <div className={containerClass} style={featured ? { background: buildGradient(baseColor) } : undefined}>
      <div className="space-y-3">
        <p className={labelClass}>{label}</p>
        <p className={amountClass}>{value}</p>
      </div>
      {hint ? <p className={hintClass}>{hint}</p> : null}
    </div>
  )
}

function buildGradient(color: string) {
  const mid = tint(color, 0.35)
  const soft = tint(color, 0.6)
  const overlay = "rgba(15, 23, 42, 0.28)"
  return `linear-gradient(135deg, ${overlay}, ${overlay}), linear-gradient(135deg, ${color} 0%, ${mid} 55%, ${soft} 100%)`
}

function withAlpha(color: string, alpha: number) {
  const normalized = color?.startsWith("#") ? color.slice(1) : color
  if (normalized.length !== 6) {
    return `rgba(99, 102, 241, ${alpha})`
  }
  const num = parseInt(normalized, 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function tint(color: string, amount: number) {
  const normalized = color?.startsWith("#") ? color.slice(1) : color
  if (normalized.length !== 6) return color
  const num = parseInt(normalized, 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  const mix = (component: number) => Math.round(component + (255 - component) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

type RGB = { r: number; g: number; b: number }

function parseColorToRgb(color?: string): RGB | null {
  if (!color) return null
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      const [r, g, b] = hex.split("").map((char) => parseInt(char + char, 16))
      if ([r, g, b].some((value) => Number.isNaN(value))) return null
      return { r, g, b }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if ([r, g, b].some((value) => Number.isNaN(value))) return null
      return { r, g, b }
    }
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch) {
    const [, rStr, gStr, bStr] = rgbMatch
    const r = Number(rStr)
    const g = Number(gStr)
    const b = Number(bStr)
    if ([r, g, b].some((value) => Number.isNaN(value))) return null
    return { r, g, b }
  }
  return null
}

function toRelativeLuminance({ r, g, b }: RGB) {
  const normalize = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  }
  const [nr, ng, nb] = [normalize(r), normalize(g), normalize(b)]
  return 0.2126 * nr + 0.7152 * ng + 0.0722 * nb
}

function resolveTextTone(color?: string): "dark" | "light" {
  const rgb = parseColorToRgb(color)
  if (!rgb) return "light"
  const luminance = toRelativeLuminance(rgb)
  return luminance > 0.6 ? "dark" : "light"
}

function StackedBar({
  label,
  value,
  amount,
  tone,
}: {
  label: string
  value: number
  amount: string
  tone: "positive" | "negative" | "neutral"
}) {
  const clamped = Math.max(0, Math.min(1, value))
  const toneClass =
    tone === "positive"
      ? "from-emerald-500/80 to-emerald-400/80"
      : tone === "negative"
        ? "from-rose-500/80 to-rose-400/80"
        : "from-sky-500/70 to-sky-400/70"
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span>{amount}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all", toneClass)} style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
      {message}
    </p>
  )
}



