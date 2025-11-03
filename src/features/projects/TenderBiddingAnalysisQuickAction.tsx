import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  FileSpreadsheet,
  Layers,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react"

import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { cn } from "../../lib/utils"
import { formatCurrency } from "../../lib/format"
import { saveTenderAnalysis } from "../../services/projects"
import type { SaveTenderAnalysisResult } from "../../services/projects"
import type { ProjectTenderLine, ProjectTenderRecord, ProjectTenderStatus } from "../../types/projects"
import { TextField } from '@mui/material'

type TenderPricingStrategy = "last" | "avg" | "standard"

type TenderPricingConfig = {
  priceStrategyOrder: TenderPricingStrategy[]
  avgWindowDays: number
  preferSameProjectPrice: boolean
}

type CatalogItem = {
  id: string
  name: string
  sku: string
  unit: string
  lastPrice?: number
  avgPrice30d?: number
  standardRate?: number
  projectLastPrice?: number
  taxProfileId?: string
  category?: string
}

type NormEntry = {
  id: string
  category: "materials" | "labor" | "equipment"
  label: string
  unit: string
  quantity: number
  rate: number
}

type NormBreakdown = {
  materials: NormEntry[]
  labor: NormEntry[]
  equipment: NormEntry[]
}

type TenderLineBase = {
  id: string
  name: string
  unit: string
  quantity: number
  unitPriceSnapshot: number | null
  taxSnapshot: string | null
  needsPrice: boolean
  pricingSource: string
}

type TenderItemLine = TenderLineBase & {
  kind: "item"
  catalogItemId: string | null
}

type TenderServiceLine = TenderLineBase & {
  kind: "service"
  mode: "simple" | "norms"
  breakdown?: NormBreakdown
}

type TenderLine = TenderItemLine | TenderServiceLine

type AuditEntry = {
  id: string
  message: string
  timestamp: Date
}

type BulkPreviewItem = {
  id: string
  name: string
  unit: string
  quantity: number
  matchedItemId: string | null
  confidence: number
  status: "pending" | "matched" | "created"
}

type TenderFormState = {
  tenderNumber: string
  title: string
  projectId: string
  closingDate: string
  status: ProjectTenderStatus
  currency: string
  taxProfileId: string
  createdBy: string
  createdAt: Date
  lastEditedBy: string
  lastEditedAt: Date
}

type StepKey = "create" | "lines" | "review"

const TENDER_STATUSES: ProjectTenderStatus[] = ["draft", "submitted", "awarded", "cancelled"]

const DEFAULT_UNITS = ["pcs", "kg", "bag", "m", "m²", "m³", "hr", "ls"]

const DEFAULT_PRICING_CONFIG: TenderPricingConfig = {
  priceStrategyOrder: ["last", "avg", "standard"],
  avgWindowDays: 30,
  preferSameProjectPrice: true,
}

const STEP_LABELS: Record<StepKey, string> = {
  create: "Tender details",
  lines: "Add lines",
  review: "Review & submit",
}

const CATALOG_SEED: CatalogItem[] = [
  {
    id: "cat-001",
    name: "Ready-mix concrete M30",
    sku: "CON-M30",
    unit: "m³",
    lastPrice: 8450,
    avgPrice30d: 8580,
    standardRate: 8725,
    projectLastPrice: 8420,
    category: "Materials",
    taxProfileId: "tax-vat-13",
  },
  {
    id: "cat-002",
    name: "Formwork labour (carpenter)",
    sku: "LAB-FRM",
    unit: "hr",
    lastPrice: 540,
    avgPrice30d: 525,
    standardRate: 560,
    category: "Labour",
    taxProfileId: "tax-labour",
  },
  {
    id: "cat-003",
    name: "Excavator (20T) hire",
    sku: "EQ-EX20",
    unit: "hr",
    lastPrice: 4600,
    avgPrice30d: 4720,
    standardRate: 4800,
    category: "Equipment",
    taxProfileId: "tax-machinery",
  },
  {
    id: "cat-004",
    name: "Steel rebar TMT 12mm",
    sku: "REB-12",
    unit: "kg",
    lastPrice: 98,
    avgPrice30d: 102,
    standardRate: 105,
    projectLastPrice: 96,
    category: "Materials",
    taxProfileId: "tax-vat-13",
  },
]

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

function createId() {
  return Math.random().toString(36).slice(2, 10)
}

function generateTenderNumber(projectName: string) {
  const prefix = projectName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 4)
  const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, "")
  return `TDR-${prefix || "PRJ"}-${timestamp}-${Math.floor(Math.random() * 900 + 100)}`
}

type SuggestedPrice = {
  price: number | null
  source: string
}

function computeSuggestedPrice(item: CatalogItem, config: TenderPricingConfig): SuggestedPrice {
  const chain = config.priceStrategyOrder
  const history: Array<{ key: TenderPricingStrategy; label: string; value?: number }> = [
    { key: "last", label: "Last purchase price", value: config.preferSameProjectPrice ? item.projectLastPrice ?? item.lastPrice : item.lastPrice },
    { key: "avg", label: `Average (${config.avgWindowDays}d)`, value: item.avgPrice30d },
    { key: "standard", label: "Standard rate", value: item.standardRate },
  ]
  for (const strategy of chain) {
    const match = history.find((entry) => entry.key === strategy && typeof entry.value === "number")
    if (match) {
      return { price: match.value ?? null, source: match.label }
    }
  }
  return { price: null, source: "Needs price" }
}

function fuzzyScore(base: string, query: string) {
  const haystack = base.toLowerCase()
  const needle = query.toLowerCase()
  if (!needle.trim()) return 0
  if (haystack.includes(needle)) return needle.length / haystack.length
  let score = 0
  let pointer = 0
  for (const char of needle) {
    const index = haystack.indexOf(char, pointer)
    if (index === -1) {
      score -= 0.25
    } else {
      score += 0.5
      pointer = index + 1
    }
  }
  score -= Math.abs(haystack.length - needle.length) * 0.02
  return score
}

function findFuzzyMatches(items: CatalogItem[], query: string, limit = 5) {
  return items
    .map((item) => ({
      item,
      score: Math.max(fuzzyScore(item.name, query), fuzzyScore(item.sku, query)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function parseCsv(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((token) => token.trim()))
}

function computeNormsRate(breakdown: NormBreakdown) {
  return [...breakdown.materials, ...breakdown.labor, ...breakdown.equipment].reduce(
    (acc, entry) => acc + entry.quantity * entry.rate,
    0
  )
}

function withAlpha(color: string | undefined, alpha: number) {
  const normalized = color?.startsWith("#") ? color.slice(1) : color
  if (!normalized || normalized.length !== 6) {
    return `rgba(79, 70, 229, ${alpha})`
  }
  const num = parseInt(normalized, 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function tintColor(color: string | undefined, amount: number) {
  const normalized = color?.startsWith("#") ? color.slice(1) : color
  if (!normalized || normalized.length !== 6) return color ?? "#4f46e5"
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

function toIsoString(value?: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}


const currencyOptions = ["NPR", "INR", "USD", "EUR", "GBP"]

export type TenderBiddingAnalysisQuickActionProps = {
  projectId: string
  projectName: string
  accentColor: string
  defaultCurrency: string
}

function buildInitialTender(projectId: string, projectName: string, defaultCurrency: string): TenderFormState {
  const now = new Date()
  return {
    tenderNumber: generateTenderNumber(projectName),
    title: "",
    projectId,
    closingDate: "",
    status: "draft",
    currency: defaultCurrency.toUpperCase(),
    taxProfileId: "",
    createdBy: "You",
    createdAt: now,
    lastEditedBy: "You",
    lastEditedAt: now,
  }
}

export function TenderBiddingAnalysisQuickAction({
  projectId,
  projectName,
  accentColor,
  defaultCurrency,
}: TenderBiddingAnalysisQuickActionProps) {
  const [open, setOpen] = useState(false)
  const [activeStep, setActiveStep] = useState<StepKey>("create")
  const [pricingConfig, setPricingConfig] = useState<TenderPricingConfig>(DEFAULT_PRICING_CONFIG)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(CATALOG_SEED)
  const [tender, setTender] = useState<TenderFormState>(() =>
    buildInitialTender(projectId, projectName, defaultCurrency)
  )
  const [lines, setLines] = useState<TenderLine[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [itemQuery, setItemQuery] = useState("")
  const [itemQuantity, setItemQuantity] = useState("1")
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [creatingCatalogItem, setCreatingCatalogItem] = useState(false)
  const [newItemDraft, setNewItemDraft] = useState({
    name: "",
    sku: "",
    unit: DEFAULT_UNITS[0],
    category: "",
    taxProfileId: "",
    standardRate: "",
  })
  const [activeLinesTab, setActiveLinesTab] = useState<"items" | "civil">("items")
  const [civilMode, setCivilMode] = useState<"simple" | "norms">("simple")
  const [civilDraft, setCivilDraft] = useState({
    name: "",
    unit: "ls",
    quantity: "1",
    rate: "",
  })
  const [normBreakdown, setNormBreakdown] = useState<NormBreakdown>({
    materials: [],
    labor: [],
    equipment: [],
  })
  const [bulkText, setBulkText] = useState("")
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewItem[]>([])
  const [bulkTouched, setBulkTouched] = useState(false)
  const [savingTender, setSavingTender] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<SaveTenderAnalysisResult | null>(null)

  useEffect(() => {
    setTender(buildInitialTender(projectId, projectName, defaultCurrency))
  }, [projectId, projectName, defaultCurrency, open])

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setActiveStep("create")
        setPricingConfig(DEFAULT_PRICING_CONFIG)
        setCatalogItems(CATALOG_SEED)
        setLines([])
        setAuditLog([])
        setItemQuery("")
        setItemQuantity("1")
        setSelectedItemId(null)
        setCreatingCatalogItem(false)
        setNewItemDraft({
          name: "",
          sku: "",
          unit: DEFAULT_UNITS[0],
          category: "",
          taxProfileId: "",
          standardRate: "",
        })
        setActiveLinesTab("items")
        setCivilMode("simple")
        setCivilDraft({ name: "", unit: "ls", quantity: "1", rate: "" })
        setNormBreakdown({ materials: [], labor: [], equipment: [] })
        setBulkText("")
        setBulkPreview([])
        setBulkTouched(false)
        setSavingTender(false)
        setSubmissionResult(null)
      }, 200)
    }
  }, [open])

  const selectedItem = useMemo(
    () => (selectedItemId ? catalogItems.find((item) => item.id === selectedItemId) ?? null : null),
    [catalogItems, selectedItemId]
  )

  const itemSuggestions = useMemo(() => {
    if (!itemQuery.trim()) return catalogItems.slice(0, 5).map((item) => ({ item, score: 1 }))
    return findFuzzyMatches(catalogItems, itemQuery, 8)
  }, [catalogItems, itemQuery])

  const bulkUnmatched = useMemo(() => bulkPreview.filter((entry) => !entry.matchedItemId), [bulkPreview])

  const totals = useMemo(() => {
    const needsPrice = lines.filter((line) => line.needsPrice || !line.unitPriceSnapshot || line.unitPriceSnapshot <= 0).length
    const totalValue = lines.reduce(
      (acc, line) => acc + (line.unitPriceSnapshot && line.quantity ? line.unitPriceSnapshot * line.quantity : 0),
      0
    )
    return {
      needsPrice,
      totalValue,
      itemCount: lines.length,
    }
  }, [lines])

  const allLinesValid = lines.length > 0 && totals.needsPrice === 0

  const pushAudit = (message: string) => {
    setAuditLog((prev) => [{ id: createId(), message, timestamp: new Date() }, ...prev].slice(0, 25))
  }

  const handleCreateTender = () => {
    if (!tender.title.trim()) {
      toast.error("Tender title is required")
      return
    }
    if (!tender.closingDate) {
      toast.error("Closing date is required")
      return
    }
    setTender((prev) => ({ ...prev, lastEditedAt: new Date(), lastEditedBy: prev.createdBy }))
    setActiveStep("lines")
    setSubmissionResult(null)
    pushAudit(`Draft tender ${tender.tenderNumber} created`)
  }

  const handleAddItemLine = () => {
    if (!selectedItem) {
      toast.error("Select an item first")
      return
    }
    const quantity = Number(itemQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than zero")
      return
    }
    const suggestion = computeSuggestedPrice(selectedItem, pricingConfig)
    const newLine: TenderItemLine = {
      id: createId(),
      kind: "item",
      catalogItemId: selectedItem.id,
      name: selectedItem.name,
      unit: selectedItem.unit,
      quantity,
      unitPriceSnapshot: suggestion.price,
      taxSnapshot: selectedItem.taxProfileId ?? tender.taxProfileId,
      needsPrice: !suggestion.price,
      pricingSource: suggestion.source,
    }
    setLines((prev) => [...prev, newLine])
    pushAudit(`Added catalog item "${selectedItem.name}"`)
    setItemQuantity("1")
    setSelectedItemId(null)
    setItemQuery("")
  }

  const handleCreateCatalogItem = () => {
    if (!newItemDraft.name.trim()) {
      toast.error("Item name is required")
      return
    }
    const standardRate = Number(newItemDraft.standardRate)
    const newItem: CatalogItem = {
      id: `new-${createId()}`,
      name: newItemDraft.name.trim(),
      sku: newItemDraft.sku.trim() || `SKU-${createId().toUpperCase()}`,
      unit: newItemDraft.unit,
      standardRate: Number.isFinite(standardRate) && standardRate > 0 ? standardRate : undefined,
      category: newItemDraft.category.trim() || "Uncategorised",
      taxProfileId: newItemDraft.taxProfileId.trim() || undefined,
    }
    setCatalogItems((prev) => [newItem, ...prev])
    setCreatingCatalogItem(false)
    setNewItemDraft({
      name: "",
      sku: "",
      unit: DEFAULT_UNITS[0],
      category: "",
      taxProfileId: "",
      standardRate: "",
    })
    setSelectedItemId(newItem.id)
    pushAudit(`Created new catalog item "${newItem.name}"`)
    toast.success(`Item "${newItem.name}" is ready to use`)
  }

  const handleAddSimpleCivilLine = () => {
    if (!civilDraft.name.trim()) {
      toast.error("Enter a description for the service line")
      return
    }
    const quantity = Number(civilDraft.quantity)
    const rate = Number(civilDraft.rate)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than zero")
      return
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("Rate must be greater than zero")
      return
    }
    const newLine: TenderServiceLine = {
      id: createId(),
      kind: "service",
      mode: "simple",
      name: civilDraft.name.trim(),
      unit: civilDraft.unit,
      quantity,
      unitPriceSnapshot: rate,
      taxSnapshot: tender.taxProfileId,
      needsPrice: rate <= 0,
      pricingSource: "Manual rate",
    }
    setLines((prev) => [...prev, newLine])
    pushAudit(`Added civil work line "${newLine.name}"`)
    setCivilDraft({ name: "", unit: "ls", quantity: "1", rate: "" })
  }

  const handleAddNormLine = () => {
    if (!civilDraft.name.trim()) {
      toast.error("Enter a description for the norm-based line")
      return
    }
    const quantity = Number(civilDraft.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than zero")
      return
    }
    const computedRate = computeNormsRate(normBreakdown)
    if (computedRate <= 0) {
      toast.error("Add at least one cost component")
      return
    }
    const newLine: TenderServiceLine = {
      id: createId(),
      kind: "service",
      mode: "norms",
      name: civilDraft.name.trim(),
      unit: civilDraft.unit,
      quantity,
      unitPriceSnapshot: computedRate,
      taxSnapshot: tender.taxProfileId,
      needsPrice: false,
      pricingSource: "Norm breakdown",
      breakdown: normBreakdown,
    }
    setLines((prev) => [...prev, newLine])
    pushAudit(`Added norms-based line "${newLine.name}"`)
    setCivilDraft({ name: "", unit: "ls", quantity: "1", rate: "" })
    setNormBreakdown({ materials: [], labor: [], equipment: [] })
  }

  const handleBulkPreview = () => {
    if (!bulkText.trim()) {
      toast.error("Paste CSV rows first")
      return
    }
    const rows = parseCsv(bulkText)
    if (!rows.length) {
      toast.error("No rows detected")
      return
    }
    const preview = rows.map((tokens) => {
      const [rawName, rawQty, rawUnit] = tokens
      const name = rawName || ""
      const quantity = Number(rawQty || "0")
      const unit = rawUnit || DEFAULT_UNITS[0]
      const fuzzy = findFuzzyMatches(catalogItems, name, 1)[0]
      return {
        id: createId(),
        name,
        unit,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        matchedItemId: fuzzy && fuzzy.score > 0.5 ? fuzzy.item.id : null,
        confidence: fuzzy ? fuzzy.score : 0,
        status: fuzzy && fuzzy.score > 0.5 ? "matched" : "pending",
      } as BulkPreviewItem
    })
    setBulkPreview(preview)
    setBulkTouched(true)
    pushAudit(`Prepared bulk import preview (${preview.length} rows)`)
  }

  const handleApplyBulkMatches = () => {
    const matched = bulkPreview.filter((entry) => entry.matchedItemId)
    if (!matched.length) {
      toast.error("No matched items to add")
      return
    }
    const additions: TenderLine[] = matched
      .map((entry) => {
        const item = catalogItems.find((catalog) => catalog.id === entry.matchedItemId)
        if (!item) return null
        const suggestion = computeSuggestedPrice(item, pricingConfig)
        return {
          id: createId(),
          kind: "item",
          catalogItemId: item.id,
          name: item.name,
          unit: entry.unit || item.unit,
          quantity: entry.quantity,
          unitPriceSnapshot: suggestion.price,
          taxSnapshot: item.taxProfileId ?? tender.taxProfileId,
          needsPrice: !suggestion.price,
          pricingSource: suggestion.source,
        } satisfies TenderItemLine
      })
      .filter(Boolean) as TenderLine[]
    if (!additions.length) {
      toast.error("Matched entries are no longer valid")
      return
    }
    setLines((prev) => [...prev, ...additions])
    pushAudit(`Imported ${additions.length} lines via CSV`)
    setBulkPreview((prev) =>
      prev.map((entry) => (entry.matchedItemId ? { ...entry, status: "matched" } : entry))
    )
  }

  const handleCreateBulkItems = () => {
    if (!bulkUnmatched.length) {
      toast.error("No unmatched rows pending")
      return
    }
    const newItems = bulkUnmatched.map((entry) => ({
      id: `bulk-${createId()}`,
      name: entry.name || `Bulk item ${entry.id}`,
      sku: `BULK-${createId().toUpperCase()}`,
      unit: entry.unit || DEFAULT_UNITS[0],
      category: "Ad-hoc",
    }))
    setCatalogItems((prev) => [...newItems, ...prev])
    setBulkPreview((prev) =>
      prev.map((entry) => {
        const created = newItems.find((item) => item.name === entry.name)
        if (!entry.matchedItemId && created) {
          return {
            ...entry,
            matchedItemId: created.id,
            confidence: 0.6,
            status: "created",
          }
        }
        return entry
      })
    )
    pushAudit(`Created ${newItems.length} catalog records from bulk import`)
    toast.success(`${newItems.length} item(s) created`)
  }

  const updateLineQuantity = (lineId: string, quantity: number) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, quantity: quantity > 0 ? quantity : line.quantity } : line
      )
    )
  }

  const updateLinePrice = (lineId: string, price: number) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              unitPriceSnapshot: price > 0 ? price : null,
              needsPrice: !(price > 0),
              pricingSource: price > 0 ? "Manual override" : line.pricingSource,
            }
          : line
      )
    )
  }

  const removeLine = (lineId: string) => {
    setLines((prev) => prev.filter((line) => line.id !== lineId))
    pushAudit("Removed a tender line")
  }

  const handleSubmit = async () => {
    if (!allLinesValid) {
      toast.error("Resolve validation issues before submission")
      return
    }
    if (!projectId) {
      toast.error("Project context missing")
      return
    }
    if (savingTender) return
    const lastEditedBy = tender.lastEditedBy || tender.createdBy
    const editedAt = new Date()
    setTender((prev) => ({ ...prev, lastEditedAt: editedAt, lastEditedBy }))
    setSavingTender(true)
    setSubmissionResult(null)
    try {
      const linesPayload: ProjectTenderLine[] = lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        mode: line.kind === "service" ? line.mode : undefined,
        catalogItemId: line.kind === "item" ? line.catalogItemId : null,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPriceSnapshot,
        amount: line.unitPriceSnapshot !== null ? line.unitPriceSnapshot * line.quantity : null,
        pricingSource: line.pricingSource,
        taxSnapshot: line.taxSnapshot ?? null,
        needsPrice: line.needsPrice,
        breakdown: line.kind === "service" && line.mode === "norms" && line.breakdown ? JSON.parse(JSON.stringify(line.breakdown)) : null,
      }))

      const payload: ProjectTenderRecord = {
        tenderNumber: tender.tenderNumber,
        title: tender.title,
        closingDate: tender.closingDate || null,
        status: tender.status,
        currency: tender.currency,
        taxProfileId: tender.taxProfileId || null,
        priceStrategyOrder: [...pricingConfig.priceStrategyOrder],
        avgWindowDays: pricingConfig.avgWindowDays,
        preferSameProjectPrice: pricingConfig.preferSameProjectPrice,
        totalAmount: totals.totalValue,
        lineCount: lines.length,
        createdBy: tender.createdBy || null,
        createdAt: toIsoString(tender.createdAt),
        lastEditedBy: lastEditedBy || null,
        lastEditedAt: editedAt.toISOString(),
        auditTrail: auditLog.map((entry) => ({
          message: entry.message,
          timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp) ?? new Date().toISOString(),
        })),
        lines: linesPayload,
      }

      const result = await saveTenderAnalysis({ projectId, tender: payload })
      setSubmissionResult(result)
      pushAudit(
        `Tender ${tender.tenderNumber} submitted for analysis (${result.stored === "supabase" ? "workspace" : "offline backup"})`
      )
      toast.success(result.stored === "supabase" ? "Tender saved to workspace" : "Tender saved offline (no network)")
      setActiveStep("review")
    } catch (error) {
      console.error(error)
      toast.error("Unable to save tender right now")
      pushAudit(`Tender ${tender.tenderNumber} submission failed`)
    } finally {
      setSavingTender(false)
    }
  }

  const handleStrategyChange = (index: number, value: TenderPricingStrategy) => {
    setPricingConfig((prev) => {
      const order = prev.priceStrategyOrder.filter((strategy) => strategy !== value)
      order.splice(index, 0, value)
      const deduped = Array.from(new Set(order))
      while (deduped.length < 3) {
        (["last", "avg", "standard"] as TenderPricingStrategy[]).forEach((strategy) => {
          if (deduped.length < 3 && !deduped.includes(strategy)) deduped.push(strategy)
        })
      }
      pushAudit("Updated pricing strategy order")
      return {
        ...prev,
        priceStrategyOrder: deduped.slice(0, 3),
      }
    })
  }

  const strategyLabels: Record<TenderPricingStrategy, string> = {
    last: "Last purchase",
    avg: "Avg (30d)",
    standard: "Standard rate",
  }

  const tenderSummary = useMemo(() => {
    return {
      totalValue: totals.totalValue,
      lineCount: lines.length,
      needsPrice: totals.needsPrice,
      ready: lines.filter((line) => !line.needsPrice && line.unitPriceSnapshot && line.unitPriceSnapshot > 0).length,
    }
  }, [totals, lines])

  const accentTone = useMemo(() => resolveTextTone(accentColor), [accentColor])
  const quickActionGradient = useMemo(() => {
    const base = accentColor || "#4f46e5"
    const mid = tintColor(base, 0.32)
    const soft = tintColor(base, 0.58)
    return `linear-gradient(135deg, ${base} 0%, ${mid} 55%, ${soft} 100%)`
  }, [accentColor])

  const quickActionShadow = useMemo(() => {
    return `0 28px 60px -32px ${withAlpha(accentColor || "#4f46e5", 0.65)}`
  }, [accentColor])
  const quickActionTitleClass = accentTone === "dark" ? "text-slate-900" : "text-white"
  const quickActionSubtitleClass = accentTone === "dark" ? "text-slate-700" : "text-white/80"
  const quickActionLabelClass = accentTone === "dark" ? "text-slate-600/90" : "text-white/70"

  const renderStepper = () => {
    const steps: StepKey[] = ["create", "lines", "review"]
    return (
      <div className="hidden w-56 shrink-0 flex-col gap-6 rounded-3xl border border-border/40 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900/90 p-6 text-white/90 shadow-xl lg:flex">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-amber-300" />
          Tender bidding analysis
        </div>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const complete = steps.indexOf(activeStep) > index
            const current = activeStep === step
            return (
              <button
                key={step}
                type="button"
                onClick={() => {
                  if (complete || current) setActiveStep(step)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                  current && "border-amber-300/40 bg-amber-200/15 text-white",
                  complete && "border-emerald-300/30 bg-emerald-200/10 text-emerald-100"
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-sm font-semibold">
                  {complete ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : index + 1}
                </span>
                <span className="text-sm font-medium">{STEP_LABELS[step]}</span>
              </button>
            )
          })}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-xs leading-relaxed text-white/80">
          Configure tenders, capture pricing intelligence, and push only validated lines forward to bidding review.
        </div>
      </div>
    )
  }

  const renderCreateStep = () => (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
        <header className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Create tender shell</h3>
          <p className="text-sm text-muted-foreground">
            Capture high-level tender metadata. Lines are locked after submission, so review carefully.
          </p>
        </header>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tender number</label>
            <Input readOnly value={tender.tenderNumber} className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</label>
            <Input readOnly value={projectName} className="bg-muted/40" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tender title</label>
            <Input
              placeholder="e.g. Tower A structural works"
              value={tender.title}
              onChange={(event) => setTender((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closing date</label>
            <Input
              type="date"
              value={tender.closingDate}
              onChange={(event) => setTender((prev) => ({ ...prev, closingDate: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</label>
            <Select
              value={tender.status}
              onValueChange={(value) =>
                setTender((prev) => ({ ...prev, status: value as ProjectTenderStatus, lastEditedAt: new Date() }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {TENDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currency</label>
            <Select
              value={tender.currency}
              onValueChange={(value) =>
                setTender((prev) => ({ ...prev, currency: value, lastEditedAt: new Date() }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax profile</label>
            <Input
              placeholder="e.g. tax-vat-13"
              value={tender.taxProfileId}
              onChange={(event) =>
                setTender((prev) => ({ ...prev, taxProfileId: event.target.value, lastEditedAt: new Date() }))
              }
            />
          </div>
        </div>
        <footer className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} className="gap-2">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleCreateTender} className="gap-2">
            Continue to lines
            <ArrowRight className="h-4 w-4" />
          </Button>
        </footer>
      </section>
    </div>
  )

  const renderItemMatches = () => (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={itemQuery}
            onChange={(event) => {
              setItemQuery(event.target.value)
              setSelectedItemId(null)
            }}
            placeholder="Search catalog (name, SKU, unit...)"
            className="border-none shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="divide-y divide-border/60">
          {itemSuggestions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No direct match found. Try creating a new item below or adjust the search keywords.
            </div>
          ) : (
            itemSuggestions.map(({ item, score }) => {
              const suggestion = computeSuggestedPrice(item, pricingConfig)
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    selectedItemId === item.id && "bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span className="break-words">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">Match {Math.round(score * 100)}%</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>SKU: {item.sku}</span>
                    <span>Unit: {item.unit}</span>
                    <span>Last: {item.lastPrice ? formatCurrency(item.lastPrice, tender.currency) : "—"}</span>
                    <span>Avg: {item.avgPrice30d ? formatCurrency(item.avgPrice30d, tender.currency) : "—"}</span>
                    <span>Standard: {item.standardRate ? formatCurrency(item.standardRate, tender.currency) : "—"}</span>
                    <span className={cn(suggestion.price ? "text-emerald-600" : "text-rose-600")}>
                      {suggestion.source}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
      {itemQuery.trim() && itemSuggestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-500/60 bg-amber-50/60 p-4 text-sm text-amber-900">
          <p className="font-medium">Fuzzy suggestions</p>
          <p className="text-xs text-amber-900/80">
            We could not find an exact match. Use the create panel below to add it instantly and continue planning.
          </p>
        </div>
      ) : null}
    </div>
  )

  const renderItemForm = () => (
    <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Items & materials</h3>
          <p className="text-xs text-muted-foreground">
            Match lines from your catalog or instantly create missing records with pricing suggestions.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setCreatingCatalogItem((prev) => !prev)}>
          <Plus className="h-4 w-4" />
          {creatingCatalogItem ? "Hide create panel" : "Create new item"}
        </Button>
      </header>
      <div className="mt-6 space-y-5">
        {renderItemMatches()}
        {selectedItem ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground break-words">{selectedItem.name}</p>
                <p className="text-xs text-muted-foreground">Auto-filled from pricing strategy</p>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Quantity</label>
                  <Input value={itemQuantity} onChange={(event) => setItemQuantity(event.target.value)} className="h-9 w-28" />
                </div>
                <div className="text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Unit price snapshot</p>
                  <p className="font-semibold text-foreground">
                    {(() => {
                      const suggestion = computeSuggestedPrice(selectedItem, pricingConfig)
                      return suggestion.price
                        ? formatCurrency(suggestion.price, tender.currency)
                        : "Needs price"
                    })()}
                  </p>
                </div>
                <Button size="sm" className="gap-2 rounded-xl" onClick={handleAddItemLine}>
                  Add line
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {creatingCatalogItem ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Create catalog item
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input
                  value={newItemDraft.name}
                  onChange={(event) => setNewItemDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Item name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SKU</label>
                <Input
                  value={newItemDraft.sku}
                  onChange={(event) => setNewItemDraft((prev) => ({ ...prev, sku: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit</label>
                <Select value={newItemDraft.unit} onValueChange={(value) => setNewItemDraft((prev) => ({ ...prev, unit: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</label>
                <Input
                  value={newItemDraft.category}
                  onChange={(event) => setNewItemDraft((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="Materials / Services..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax profile</label>
                <Input
                  value={newItemDraft.taxProfileId}
                  onChange={(event) => setNewItemDraft((prev) => ({ ...prev, taxProfileId: event.target.value }))}
                  placeholder="e.g. tax-vat-13"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Standard rate</label>
                <Input
                  value={newItemDraft.standardRate}
                  onChange={(event) => setNewItemDraft((prev) => ({ ...prev, standardRate: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" className="gap-2" onClick={handleCreateCatalogItem}>
                Save item
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  const handleAddNormEntry = (category: NormEntry["category"]) => {
    setNormBreakdown((prev) => ({
      ...prev,
      [category]: [
        ...prev[category],
        {
          id: createId(),
          category,
          label: "",
          unit: category === "materials" ? "kg" : "hr",
          quantity: 1,
          rate: 0,
        },
      ],
    }))
    pushAudit(`Added ${category} component to norms builder`)
  }

  const updateNormEntry = (
    category: NormEntry["category"],
    entryId: string,
    field: keyof Omit<NormEntry, "id" | "category">,
    value: string
  ) => {
    setNormBreakdown((prev) => ({
      ...prev,
      [category]: prev[category].map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              [field]:
                field === "label"
                  ? value
                  : field === "unit"
                    ? value
                    : Number(value) > 0
                      ? Number(value)
                      : entry[field],
            }
          : entry
      ),
    }))
  }

  const removeNormEntry = (category: NormEntry["category"], entryId: string) => {
    setNormBreakdown((prev) => ({
      ...prev,
      [category]: prev[category].filter((entry) => entry.id !== entryId),
    }))
  }

  const renderNormTable = (category: NormEntry["category"], label: string, accent: string) => {
    const entries = normBreakdown[category]
    return (
      <div className="rounded-2xl border border-border/60 bg-white/95 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers className={cn("h-4 w-4", accent)} />
            {label}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 px-3 text-xs"
            onClick={() => handleAddNormEntry(category)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground">
            No components yet. Add granular materials, labour, or equipment to compute the blended rate.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-2 rounded-xl border border-border/50 bg-muted/20 p-3 sm:grid-cols-[1.5fr_70px_70px_70px_auto]"
              >
                <Input
                  value={entry.label}
                  onChange={(event) => updateNormEntry(category, entry.id, "label", event.target.value)}
                  placeholder="Description"
                />
                <Input
                  value={entry.unit}
                  onChange={(event) => updateNormEntry(category, entry.id, "unit", event.target.value)}
                  placeholder="Unit"
                />
                <Input
                  value={entry.quantity}
                  onChange={(event) => updateNormEntry(category, entry.id, "quantity", event.target.value)}
                  placeholder="Qty"
                />
                <Input
                  value={entry.rate}
                  onChange={(event) => updateNormEntry(category, entry.id, "rate", event.target.value)}
                  placeholder="Rate"
                />
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>{formatCurrency(entry.quantity * entry.rate || 0, tender.currency)}</span>
                  <button
                    type="button"
                    onClick={() => removeNormEntry(category, entry.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  const renderCivilForm = () => (
    <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Civil works & services</h3>
          <p className="text-xs text-muted-foreground">
            Switch between simple rate entry and norms mode for material-labour-equipment breakdowns.
          </p>
        </div>
        <div className="flex gap-2 rounded-full border border-border/60 bg-muted/40 p-1">
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              civilMode === "simple" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
            onClick={() => setCivilMode("simple")}
          >
            Simple rate
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              civilMode === "norms" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
            onClick={() => setCivilMode("norms")}
          >
            Norms mode
          </button>
        </div>
      </header>
      <div className="mt-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Work description</label>
            <Input
              value={civilDraft.name}
              onChange={(event) => setCivilDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Excavation for foundation"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit</label>
            <Select value={civilDraft.unit} onValueChange={(value) => setCivilDraft((prev) => ({ ...prev, unit: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quantity</label>
            <Input
              value={civilDraft.quantity}
              onChange={(event) => setCivilDraft((prev) => ({ ...prev, quantity: event.target.value }))}
            />
          </div>
          {civilMode === "simple" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate</label>
              <Input
                value={civilDraft.rate}
                onChange={(event) => setCivilDraft((prev) => ({ ...prev, rate: event.target.value }))}
                placeholder="e.g. 1250"
              />
            </div>
          ) : null}
        </div>
        {civilMode === "norms" ? (
          <div className="space-y-4">
            {renderNormTable("materials", "Materials breakdown", "text-sky-500")}
            {renderNormTable("labor", "Labour breakdown", "text-emerald-500")}
            {renderNormTable("equipment", "Equipment breakdown", "text-indigo-500")}
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Calculated rate</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatCurrency(computeNormsRate(normBreakdown), tender.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Per unit</p>
                  <p className="text-sm font-medium text-foreground">{civilDraft.unit}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={civilMode === "simple" ? handleAddSimpleCivilLine : handleAddNormLine}>
            Add line
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  const renderBulkImport = () => (
    <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Bulk add / import</h3>
          <p className="text-xs text-muted-foreground">
            Paste or upload CSV data to seed tender lines. We&apos;ll auto-match catalog references and highlight gaps.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            const element = document.createElement("input")
            element.type = "file"
            element.accept = ".csv,text/csv"
            element.onchange = (event: Event) => {
              const target = event.target as HTMLInputElement
              const file = target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                setBulkText(String(reader.result || ""))
                toast.success(`Loaded ${file.name}`)
              }
              reader.readAsText(file)
            }
            element.click()
          }}
        >
          <UploadCloud className="h-4 w-4" />
          Upload CSV
        </Button>
      </header>
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-3">
          <TextField
            id="outlined-bulk-text"
            label=""
            value={bulkText}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setBulkText(event.target.value)
            }}
            placeholder="Paste CSV rows here (name, quantity, unit)"
            multiline
            minRows={6}
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'transparent',
              },
              '& .MuiOutlinedInput-input': {
                minHeight: '140px',
              },
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" className="gap-2" onClick={handleBulkPreview}>
            <ClipboardPaste className="h-4 w-4" />
            Generate preview
          </Button>
          {bulkPreview.length > 0 ? (
            <>
              <Button size="sm" variant="outline" className="gap-2" onClick={handleApplyBulkMatches}>
                <CheckCircle2 className="h-4 w-4" />
                Add matched lines
              </Button>
              {bulkUnmatched.length > 0 ? (
                <Button size="sm" variant="outline" className="gap-2" onClick={handleCreateBulkItems}>
                  <Plus className="h-4 w-4" />
                  Create unmatched ({bulkUnmatched.length})
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        {bulkTouched ? (
          <div className="overflow-hidden rounded-2xl border border-border/60">
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full divide-y divide-border/60 text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold">Unit</th>
                    <th className="px-3 py-2 text-left font-semibold">Match status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-white">
                  {bulkPreview.map((entry) => {
                    const matched = entry.matchedItemId && catalogItems.find((item) => item.id === entry.matchedItemId)
                    return (
                      <tr key={entry.id}>
                        <td className="px-3 py-2 max-w-[240px] break-words font-medium text-foreground">{entry.name}</td>
                        <td className="px-3 py-2">{entry.quantity}</td>
                        <td className="px-3 py-2 break-words">{entry.unit}</td>
                        <td className="px-3 py-2">
                          {matched ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span className="max-w-[160px] break-words text-left">{matched.name}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                              <span className="max-w-[160px] break-words text-left">Pending match</span>
                              <span className="font-mono text-[11px] text-amber-800">
                                {Math.round(entry.confidence * 100)}%
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  const renderLinesStep = () => (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/60 bg-white/95 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex gap-2 rounded-full border border-border/60 bg-muted/40 p-1 text-xs">
            <button
              type="button"
              className={cn(
                "rounded-full px-3 py-1 font-medium transition",
                activeLinesTab === "items" ? "bg-white shadow-sm" : "text-muted-foreground"
              )}
              onClick={() => setActiveLinesTab("items")}
            >
              Items
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full px-3 py-1 font-medium transition",
                activeLinesTab === "civil" ? "bg-white shadow-sm" : "text-muted-foreground"
              )}
              onClick={() => setActiveLinesTab("civil")}
            >
              Civil works
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            Snapshot pricing preserved per line to protect historical bids.
          </div>
        </div>
      </section>
      {activeLinesTab === "items" ? renderItemForm() : renderCivilForm()}
      {renderBulkImport()}
    </div>
  )

  const renderSummaryTable = () => (
    <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Lines overview</h3>
          <p className="text-xs text-muted-foreground">
            Validate pricing snapshots. Once submitted, historic values remain immutable for audit.
          </p>
        </div>
      </header>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full divide-y divide-border/60 text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Unit</th>
                <th className="px-3 py-2 text-left font-semibold">Qty</th>
                <th className="px-3 py-2 text-left font-semibold">Unit price snapshot</th>
                <th className="px-3 py-2 text-left font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Pricing source</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 bg-white">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No lines yet. Add catalog items or build civil work breakdowns.
                  </td>
                </tr>
              ) : (
                lines.map((line) => {
                  const amount =
                    line.unitPriceSnapshot && line.quantity ? line.unitPriceSnapshot * line.quantity : 0
                  return (
                    <tr key={line.id} className={cn(line.needsPrice && "bg-rose-50/40")}>
                      <td className="px-3 py-3 font-medium text-foreground">
                        {line.kind === "item" ? "Item" : line.mode === "norms" ? "Civil (norms)" : "Civil (simple)"}
                      </td>
                      <td className="px-3 py-3 max-w-[240px] break-words text-sm text-foreground">{line.name}</td>
                      <td className="px-3 py-3 text-sm break-words">{line.unit}</td>
                      <td className="px-3 py-3">
                        <Input
                          value={line.quantity}
                          onChange={(event) => updateLineQuantity(line.id, Number(event.target.value))}
                          className="h-9 w-24"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          value={line.unitPriceSnapshot ?? ""}
                          onChange={(event) => updateLinePrice(line.id, Number(event.target.value))}
                          className={cn("h-9 w-32", line.needsPrice && "border-rose-300")}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-foreground">
                        {formatCurrency(amount, tender.currency)}
                      </td>
                      <td className="px-3 py-3 max-w-[220px] break-words text-xs text-muted-foreground">{line.pricingSource}</td>
                      <td className="px-3 py-3 text-right">
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-rose-600" onClick={() => removeLine(line.id)}>
                          <X className="h-4 w-4" />
                          Remove
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {totals.needsPrice > 0 ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
          {totals.needsPrice} line{totals.needsPrice === 1 ? "" : "s"} marked as “Needs price”. Provide valid rates before submitting.
        </div>
      ) : null}
    </div>
  )

  const renderPricingConfig = () => (
    <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Pricing automation</h3>
          <p className="text-xs text-muted-foreground">
            Control how auto-pricing chooses the snapshot rate for each line. Changes are logged for audit.
          </p>
        </div>
        <Settings2 className="h-5 w-5 text-muted-foreground" />
      </header>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[0, 1, 2].map((position) => {
          const value = pricingConfig.priceStrategyOrder[position]
          return (
            <div key={position} className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {position === 0 ? "Primary strategy" : position === 1 ? "Fallback strategy" : "Final fallback"}
              </label>
              <Select value={value} onValueChange={(newValue) => handleStrategyChange(position, newValue as TenderPricingStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["last", "avg", "standard"] as TenderPricingStrategy[]).map((strategy) => (
                    <SelectItem key={strategy} value={strategy}>
                      {strategyLabels[strategy]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Average window (days)</label>
          <Input
            value={pricingConfig.avgWindowDays}
            onChange={(event) =>
              setPricingConfig((prev) => ({
                ...prev,
                avgWindowDays: Math.max(7, Number(event.target.value) || prev.avgWindowDays),
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prefer same project prices</label>
          <div className="flex h-10 items-center gap-3 rounded-xl border border-border/60 px-4 text-sm">
            <button
              type="button"
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                pricingConfig.preferSameProjectPrice ? "bg-primary/10 text-primary-foreground" : "text-muted-foreground"
              )}
              onClick={() =>
                setPricingConfig((prev) => ({ ...prev, preferSameProjectPrice: !prev.preferSameProjectPrice }))
              }
            >
              {pricingConfig.preferSameProjectPrice ? "Enabled" : "Disabled"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAudit = () => (
    <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
      <header className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Audit trail</h3>
          <p className="text-xs text-muted-foreground">Recorded actions scoped to this project.</p>
        </div>
      </header>
      <ul className="mt-4 space-y-3 text-sm">
        {auditLog.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
            Actions will appear here as you configure the tender.
          </li>
        ) : (
          auditLog.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <p className="font-medium text-foreground break-words">{entry.message}</p>
              <p className="text-xs text-muted-foreground">{TIMESTAMP_FORMAT.format(entry.timestamp)}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  )

  const renderReviewStep = () => (
    <div className="space-y-6">
      {submissionResult ? (
        <div
          className={cn(
            "rounded-2xl border p-4 text-xs",
            submissionResult.stored === "supabase"
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
              : "border-amber-200 bg-amber-50/70 text-amber-700"
          )}
        >
          <span className="font-semibold">
            {submissionResult.stored === "supabase" ? "Saved to workspace database." : "Saved offline (will sync when online)."}
          </span>
          <span className="ml-1 break-all">Reference ID: {submissionResult.id}</span>
        </div>
      ) : null}
      {renderSummaryTable()}
      {renderPricingConfig()}
      {renderAudit()}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" onClick={() => setActiveStep("lines")} className="gap-2">
          Back to lines
        </Button>
        <Button onClick={handleSubmit} disabled={!allLinesValid || savingTender} className="gap-2">
          {savingTender ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              Submit for analysis
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Button
        size="lg"
        className="flex h-auto w-full flex-col items-start gap-1 rounded-3xl border border-transparent px-6 py-5 text-left shadow-lg transition hover:shadow-xl"
        style={{ background: quickActionGradient, boxShadow: quickActionShadow }}
        onClick={() => setOpen(true)}
      >
        <span className={cn("text-sm font-semibold uppercase tracking-[0.3em]", quickActionLabelClass)}>Quick action</span>
        <span className={cn("text-xl font-semibold", quickActionTitleClass)}>Tender bidding analysis</span>
        <span className={cn("text-sm", quickActionSubtitleClass)}>
          Draft tenders, import BOQs, and lock pricing snapshots before submitting for review.
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-md" />
          <DialogContent className="fixed top-1/2 left-1/2 z-[90] h-[90vh] w-[96vw] max-w-7xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-border/40 bg-slate-50/95 p-6 shadow-2xl">
            <div className="flex h-full gap-5 overflow-hidden">
              {renderStepper()}
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/40 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                  <div>
                    <DialogTitle className="text-sm uppercase tracking-[0.35em] text-muted-foreground/80">
                      Tender bidding analysis
                    </DialogTitle>
                    <DialogDescription className="text-2xl font-semibold text-foreground">
                      {STEP_LABELS[activeStep]}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-medium text-primary-foreground">
                      {tender.tenderNumber}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1">
                      {tender.status.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      Close
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {activeStep === "create" ? renderCreateStep() : null}
                {activeStep === "lines" ? (
                  <>
                    {renderLinesStep()}
                    <div className="mt-6 flex justify-end">
                      <Button onClick={() => setActiveStep("review")} className="gap-2">
                        Review summary
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : null}
                {activeStep === "review" ? renderReviewStep() : null}
              </div>
              <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto rounded-3xl border border-border/40 bg-white/90 p-5 shadow-sm lg:flex">
                <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 p-5 text-white shadow-lg">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/70">Snapshot</p>
                  <p className="mt-2 text-3xl font-semibold">{formatCurrency(tenderSummary.totalValue, tender.currency)}</p>
                  <p className="text-xs text-white/80">
                    {tenderSummary.lineCount} line{tenderSummary.lineCount === 1 ? "" : "s"} planned
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
                      Ready: {tenderSummary.ready}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
                      Needs price: {tenderSummary.needsPrice}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-white/95 p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created by</p>
                  <p className="mt-1 font-medium text-foreground">{tender.createdBy}</p>
                  <p className="text-xs text-muted-foreground">{TIMESTAMP_FORMAT.format(tender.createdAt)}</p>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last edited</p>
                    <p className="mt-1 font-medium text-foreground">{tender.lastEditedBy}</p>
                    <p className="text-xs text-muted-foreground">{TIMESTAMP_FORMAT.format(tender.lastEditedAt)}</p>
                  </div>
                </div>
                {auditLog.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
                    <ul className="space-y-2 text-xs">
                      {auditLog.slice(0, 5).map((entry) => (
                        <li key={entry.id} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                          <p className="font-medium text-foreground break-words">{entry.message}</p>
                          <p className="text-[11px] text-muted-foreground">{TIMESTAMP_FORMAT.format(entry.timestamp)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </aside>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  )
}
