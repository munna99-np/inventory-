import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatCurrency as baseFormatCurrency } from '../lib/format'
import { download } from '../lib/csv'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type SaleRow = { id: string; date: string; customer: string; subTotal: number }
type PurchaseRow = { id: string; date: string; supplier: string; subTotal: number }

type MonthRow = {
  monthKey: string
  label: string
  sales: number
  purchases: number
  outputVat: number
  inputVat: number
  netVat: number
  remark: string
  dueDate: string
  filingStatus: 'On-Time' | 'Pending' | 'Late'
}

function formatNPR(value: number) {
  try {
    return new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return baseFormatCurrency(value, 'NPR', 'en-NP')
  }
}

function getYearMonths(year: number) {
  const months: { key: string; label: string; start: Date; end: Date }[] = []
  for (let m = 0; m < 12; m += 1) {
    const start = new Date(Date.UTC(year, m, 1))
    const end = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59, 999))
    const label = start.toLocaleString('en-NP', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    months.push({ key: `${year}-${String(m + 1).padStart(2, '0')}`, label, start, end })
  }
  return months
}

function computeDueDate(monthEnd: Date) {
  // Due date = 25th of next month (Nepal IRD monthly VAT filing)
  const d = new Date(monthEnd)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(25)
  return d
}

function filingStatusForMonth(dueDate: Date) {
  const today = new Date()
  if (today <= dueDate) return 'Pending'
  // In real apps, use actual filing records to detect On-Time vs Late. Here we mark as Late after due date.
  return 'Late'
}

export default function VATAuditorReportPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [query, setQuery] = useState<string>('')
  const [advanced, setAdvanced] = useState<boolean>(false)

  const months = useMemo(() => getYearMonths(year), [year])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const base = (import.meta as any).env?.VITE_API_BASE || ''
      const makeUrl = (path: string, withYear = true) => withYear ? `${base}${path}?year=${year}` : `${base}${path}`
      const safeJson = async (res: Response, label: string) => {
        if (!res.ok) throw new Error(`${label} HTTP ${res.status}`)
        const ct = res.headers.get('content-type') || ''
        const text = await res.text()
        if (!/application\/json/i.test(ct)) {
          const snippet = text.slice(0, 120).replace(/\s+/g, ' ')
          throw new Error(`${label} responded non-JSON. Hint: ${snippet}`)
        }
        try {
          return JSON.parse(text)
        } catch (e) {
          throw new Error(`${label} invalid JSON`)
        }
      }

      // Fallback candidates to handle different backends: with/without year, api prefix, pluralization
      const salesCandidates = [
        makeUrl('/inventory/sales', true),
        makeUrl('/inventory/sales', false),
        makeUrl('/api/inventory/sales', true),
        makeUrl('/api/inventory/sales', false),
        makeUrl('/inventory/sale', true),
        makeUrl('/inventory/sale', false),
      ]
      const purchaseCandidates = [
        makeUrl('/inventory/purchases', true),
        makeUrl('/inventory/purchases', false),
        makeUrl('/api/inventory/purchases', true),
        makeUrl('/api/inventory/purchases', false),
        makeUrl('/inventory/purchase', true),
        makeUrl('/inventory/purchase', false),
      ]

      const fetchWithFallback = async (label: 'Sales API' | 'Purchases API', candidates: string[]) => {
        const errors: string[] = []
        for (const url of candidates) {
          try {
            const res = await fetch(url, { headers: { Accept: 'application/json' } })
            return await safeJson(res, label)
          } catch (e: any) {
            errors.push(`${url}: ${e?.message || 'error'}`)
            continue
          }
        }
        throw new Error(`${label} failed. Tried: ${errors.join(' | ')}`)
      }

      const [salesJson, purchasesJson] = await Promise.all([
        fetchWithFallback('Sales API', salesCandidates),
        fetchWithFallback('Purchases API', purchaseCandidates),
      ])
      setSales(Array.isArray(salesJson) ? salesJson : [])
      setPurchases(Array.isArray(purchasesJson) ? purchasesJson : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load data')
      setSales([])
      setPurchases([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  const monthRows: MonthRow[] = useMemo(() => {
    const rows: MonthRow[] = []
    const VAT_RATE = 0.13
    for (const m of months) {
      const monthSales = sales
        .filter((r) => {
          const d = new Date(r.date)
          return d >= m.start && d <= m.end
        })
        .filter((r) => !query.trim() || r.customer?.toLowerCase?.().includes(query.toLowerCase()))
      const monthPurchases = purchases
        .filter((r) => {
          const d = new Date(r.date)
          return d >= m.start && d <= m.end
        })
        .filter((r) => !query.trim() || r.supplier?.toLowerCase?.().includes(query.toLowerCase()))
      const salesTotal = monthSales.reduce((acc, r) => acc + (Number(r.subTotal) || 0), 0)
      const purchasesTotal = monthPurchases.reduce((acc, r) => acc + (Number(r.subTotal) || 0), 0)
      let outputVat = salesTotal * VAT_RATE
      let inputVat = purchasesTotal * VAT_RATE
      if (advanced) {
        // Placeholder hook for advanced rules (zero-rated/exempt/non-claimable). Extend here as needed.
        outputVat = outputVat
        inputVat = inputVat
      }
      const netVat = outputVat - inputVat
      const remark = netVat >= 0 ? '' : 'VAT Credit (Carried Forward)'
      const dueDate = computeDueDate(m.end)
      const filingStatus = filingStatusForMonth(dueDate)
      rows.push({
        monthKey: m.key,
        label: m.label,
        sales: salesTotal,
        purchases: purchasesTotal,
        outputVat,
        inputVat,
        netVat,
        remark,
        dueDate: dueDate.toLocaleDateString('en-NP'),
        filingStatus,
      })
    }
    return rows
  }, [months, sales, purchases])

  const yearly = useMemo(() => {
    const scoped = monthRows.filter((r) => monthFilter === 'all' ? true : r.monthKey === monthFilter)
    const totalSales = scoped.reduce((a, r) => a + r.sales, 0)
    const totalPurchases = scoped.reduce((a, r) => a + r.purchases, 0)
    const totalOutput = scoped.reduce((a, r) => a + r.outputVat, 0)
    const totalInput = scoped.reduce((a, r) => a + r.inputVat, 0)
    const net = totalOutput - totalInput
    return { totalSales, totalPurchases, totalOutput, totalInput, net }
  }, [monthRows, monthFilter])

  function exportExcel() {
    // Create simple HTML sheet for compatibility; many spreadsheet apps open it fine.
    const header = `
      <tr>
        <th>Month</th>
        <th>Sales (NPR)</th>
        <th>Output VAT</th>
        <th>Purchases (NPR)</th>
        <th>Input VAT</th>
        <th>Net VAT</th>
        <th>Remark</th>
        <th>Due date</th>
        <th>Status</th>
      </tr>`
    const body = monthRows
      .map((r) => `
        <tr>
          <td>${r.label}</td>
          <td>${r.sales.toFixed(2)}</td>
          <td>${r.outputVat.toFixed(2)}</td>
          <td>${r.purchases.toFixed(2)}</td>
          <td>${r.inputVat.toFixed(2)}</td>
          <td>${r.netVat.toFixed(2)}</td>
          <td>${r.remark}</td>
          <td>${r.dueDate}</td>
          <td>${r.filingStatus}</td>
        </tr>`)
      .join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>VAT Auditor Report ${year}</title></head><body><table>${header}${body}</table></body></html>`
    download(`vat_auditor_${year}.xls`, html, 'application/vnd.ms-excel;charset=utf-8')
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    doc.setFontSize(14)
    doc.text(`VAT Auditor Report - ${year}`, 40, 32)
    autoTable(doc, {
      startY: 48,
      head: [[
        'Month', 'Sales (NPR)', 'Output VAT', 'Purchases (NPR)', 'Input VAT', 'Net VAT', 'Remark', 'Due date', 'Status',
      ]],
      body: monthRows.map((r) => [
        r.label,
        formatNPR(r.sales),
        formatNPR(r.outputVat),
        formatNPR(r.purchases),
        formatNPR(r.inputVat),
        formatNPR(r.netVat),
        r.remark,
        r.dueDate,
        r.filingStatus,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [[ 'Annual Summary', '', '', '', '' ]],
      body: [
        ['Total Sales', formatNPR(yearly.totalSales), 'Total Purchases', formatNPR(yearly.totalPurchases), ''],
        ['Total Output VAT', formatNPR(yearly.totalOutput), 'Total Input VAT', formatNPR(yearly.totalInput), ''],
        ['Net VAT', formatNPR(yearly.net), yearly.net < 0 ? 'VAT Credit (Carried Forward)' : '', '', ''],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] },
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
      theme: 'striped',
    })
    doc.save(`vat_auditor_${year}.pdf`)
  }

  const years = useMemo(() => {
    const now = new Date().getFullYear()
    const start = now - 4
    return Array.from({ length: 6 }, (_, i) => start + i)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">VAT Auditor Report</h1>
          <p className="text-sm text-muted-foreground">13% VAT computation with monthly and annual summaries for IRD compliance.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="h-9 rounded-md border px-3 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select className="h-9 rounded-md border px-3 text-sm" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="all">All months</option>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <input className="h-9 rounded-md border px-3 text-sm" placeholder="Filter customer/supplier" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground ml-2">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Advanced VAT rules
          </label>
          <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button variant="secondary" onClick={exportExcel} disabled={loading || monthRows.length === 0}>Export Excel</Button>
          <Button onClick={exportPdf} disabled={loading || monthRows.length === 0}>Export PDF</Button>
        </div>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card/80 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Sales ({monthFilter==='all'?'All':months.find(m=>m.key===monthFilter)?.label})</div>
          <div className="mt-1 text-2xl font-semibold">{formatNPR(yearly.totalSales)}</div>
        </div>
        <div className="rounded-xl border bg-card/80 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold">{formatNPR(yearly.totalPurchases)}</div>
        </div>
        <div className="rounded-xl border bg-card/80 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Output VAT</div>
          <div className="mt-1 text-2xl font-semibold">{formatNPR(yearly.totalOutput)}</div>
        </div>
        <div className="rounded-xl border bg-card/80 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Net VAT</div>
          <div className={`mt-1 text-2xl font-semibold ${yearly.net>=0?'text-emerald-700':'text-rose-700'}`}>{formatNPR(yearly.net)}</div>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading VAT report…</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="min-w-[900px] text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Sales (NPR)</th>
                  <th className="px-3 py-2 text-right">Output VAT</th>
                  <th className="px-3 py-2 text-right">Purchases (NPR)</th>
                  <th className="px-3 py-2 text-right">Input VAT</th>
                  <th className="px-3 py-2 text-right">Net VAT</th>
                  <th className="px-3 py-2 text-left">Remark</th>
                  <th className="px-3 py-2 text-left">Due date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.filter((r)=> monthFilter==='all' ? true : r.monthKey===monthFilter).map((r) => (
                  <tr key={r.monthKey} className="border-t bg-background/80 hover:bg-muted/30">
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-right">{formatNPR(r.sales)}</td>
                    <td className="px-3 py-2 text-right">{formatNPR(r.outputVat)}</td>
                    <td className="px-3 py-2 text-right">{formatNPR(r.purchases)}</td>
                    <td className="px-3 py-2 text-right">{formatNPR(r.inputVat)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${r.netVat>=0?'text-emerald-700':'text-rose-700'}`}>{formatNPR(r.netVat)}</td>
                    <td className="px-3 py-2">{r.remark}</td>
                    <td className="px-3 py-2">{r.dueDate}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.filingStatus==='On-Time'?'bg-emerald-100 text-emerald-700': r.filingStatus==='Pending'?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}`}>
                        {r.filingStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yearly Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Annual Sales</div>
                <div className="mt-1 text-lg font-semibold">{formatNPR(yearly.totalSales)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Purchases</div>
                <div className="mt-1 text-lg font-semibold">{formatNPR(yearly.totalPurchases)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Output VAT</div>
                <div className="mt-1 text-lg font-semibold">{formatNPR(yearly.totalOutput)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Input VAT</div>
                <div className="mt-1 text-lg font-semibold">{formatNPR(yearly.totalInput)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Net VAT</div>
                <div className="mt-1 text-lg font-semibold">{formatNPR(yearly.net)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">IRD Filing Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-[600px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-left">Due date</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((r) => (
                    <tr key={r.monthKey} className="border-t">
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2">{r.dueDate}</td>
                      <td className="px-3 py-2">{r.filingStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>VAT is applied at 13% in Nepal. Output VAT = 13% of taxable sales; Input VAT = 13% of eligible purchases.</li>
            <li>Monthly VAT filing due date is the 25th of the following month (IRD).</li>
            <li>If Input VAT exceeds Output VAT, the difference is VAT Credit carried forward to the next period.</li>
            <li>Zero-rated or exempt supplies do not attract VAT; input tax attributable to exempt supplies may be non-claimable under advanced rules.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}


