import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Download, RefreshCcw } from "lucide-react"

import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { formatCurrency } from "../lib/format"
import { formatAppDate } from "../lib/date"
import { cn } from "../lib/utils"
import { getProjectProfile } from "../services/projects"
import { createProfessionalPDF, addProfessionalTable, addSummarySection, savePDF } from "../lib/pdfExport"
import { getInflowSourceLabel } from "../lib/inflowSources"
import type { ProjectBankAccount, ProjectFlow, ProjectProfile } from "../types/projects"

function formatDateDisplay(value?: string): string {
  const label = formatAppDate(value)
  return label || "--"
}

export default function ConstructionBankAccountStatementPage() {
  const navigate = useNavigate()
  const { projectId, accountId } = useParams<{ projectId: string; accountId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [account, setAccount] = useState<ProjectBankAccount | null>(null)
  const [flows, setFlows] = useState<ProjectFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setRefreshing(true)
    try {
      const next = await getProjectProfile(projectId)
      if (!next) {
        setError("Project not found")
        setProject(null)
        setAccount(null)
        setFlows([])
        return
      }
      setProject(next)
      const foundAccount = next.bankAccounts.find((item) => item.id === accountId)
      if (!foundAccount) {
        setError("Bank account not found")
        setAccount(null)
        setFlows([])
        return
      }
      setAccount(foundAccount)
      setFlows(
        next.flows.filter((flow) => flow.accountId === foundAccount.id || flow.fromAccountId === foundAccount.id || flow.toAccountId === foundAccount.id)
      )
      setError(null)
    } catch (err: any) {
      console.error(err)
      const message = err?.message ?? "Failed to load statement"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId, accountId])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  const summary = useMemo(() => {
    return flows.reduce(
      (acc, flow) => {
        const amount = Number(flow.amount) || 0
        if (flow.type === "payment-in") {
          acc.paymentIn += amount
        } else if (flow.type === "payment-out") {
          acc.paymentOut += amount
        } else {
          acc.transfers += amount
        }
        return acc
      },
      { paymentIn: 0, paymentOut: 0, transfers: 0 }
    )
  }, [flows])

  const netCash = summary.paymentIn - summary.paymentOut

  const goBack = () => {
    if (projectId) navigate(`/construction/${projectId}/bank-accounts`)
    else navigate(-1)
  }

  const handleExportPdf = () => {
    if (!account || !project) return
    
    const doc = createProfessionalPDF({
      title: `${project.name} - ${account.label}`,
      subtitle: 'Bank Account Statement',
      generatedAt: new Date(),
      orientation: 'landscape',
    })

    // Add summary section
    let currentY = 90
    currentY = addSummarySection(doc, 'Summary', [
      ['Net cash', formatCurrency(netCash)],
      ['Payments in', formatCurrency(summary.paymentIn)],
      ['Payments out', formatCurrency(summary.paymentOut)],
      ['Transfers', formatCurrency(summary.transfers)],
    ], currentY)

    // Add flows table
    if (flows.length > 0) {
      currentY += 10
      const body = flows.map((flow) => [
        formatDateDisplay(flow.date),
        flow.type === 'payment-in' ? 'Payment in' : flow.type === 'payment-out' ? 'Payment out' : 'Transfer',
        formatCurrency(Number(flow.amount) || 0),
        flow.type === 'payment-in' && flow.inflowSource ? getInflowSourceLabel(flow.inflowSource) : (flow.counterparty || '—'),
        flow.type === 'payment-in' && flow.inflowSource ? getInflowSourceLabel(flow.inflowSource) : (flow.categoryName || flow.purpose || '—'),
        flow.type === 'transfer'
          ? `${flow.fromAccountName || '—'} → ${flow.toAccountName || '—'}`
          : flow.accountName || '—',
        flow.notes || flow.purpose || '—',
      ])

      addProfessionalTable(doc, {
        title: 'Detailed Transactions',
        head: ['Date', 'Type', 'Amount', 'Inflow Source / Counterparty', 'Category / Source', 'Account Route', 'Notes'],
        body,
        columnStyles: {
          2: { halign: 'right', fontStyle: 'bold' },
        },
        alternateRows: true,
      }, currentY)
    }

    savePDF(doc, `${account.label}-statement`)
  }

  if (loading && !project) {
    return <div className="grid min-h-[40vh] place-items-center text-muted-foreground">Loading statement...</div>
  }

  if (error && (!project || !account)) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={goBack} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Unable to load statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()} className="w-fit gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!project || !account) return null

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={goBack} className="w-fit gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="mt-1">
            <h1 className="text-2xl font-semibold text-foreground">{account.label}</h1>
            <p className="text-sm text-muted-foreground">Bank statement for {project.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={refreshing} className="gap-2">
            <RefreshCcw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <p className="text-sm text-muted-foreground">Overview of cash flowing through this account.</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <SummaryTile label="Net cash" value={formatCurrency(netCash)} tone={netCash >= 0 ? "text-emerald-600" : "text-rose-600"} />
          <SummaryTile label="Payment in" value={formatCurrency(summary.paymentIn)} tone="text-emerald-600" />
          <SummaryTile label="Payment out" value={formatCurrency(summary.paymentOut)} tone="text-rose-600" />
          <SummaryTile label="Transfers" value={formatCurrency(summary.transfers)} tone="text-sky-600" />
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          {flows.length === 0 ? (
            <div className="grid min-h-[200px] place-items-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
              No cash movement recorded for this account yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Counterparty</th>
                    <th className="py-2 pr-3 font-medium">Category / Source</th>
                    <th className="py-2 pr-3 font-medium">Account route</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {flows.map((flow) => (
                    <tr key={flow.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pr-3 text-muted-foreground">{formatDateDisplay(flow.date)}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                            flow.type === "payment-in"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : flow.type === "payment-out"
                                ? "border border-rose-200 bg-rose-50 text-rose-700"
                                : "border border-sky-200 bg-sky-50 text-sky-700"
                          )}
                        >
                          {flow.type === "payment-in" ? "Payment in" : flow.type === "payment-out" ? "Payment out" : "Transfer"}
                        </span>
                      </td>
                      <td className={cn(
                        "py-3 pr-3 font-semibold",
                        flow.type === "payment-out" ? "text-rose-600" : flow.type === "payment-in" ? "text-emerald-600" : "text-sky-600"
                      )}>
                        {formatCurrency(Number(flow.amount) || 0)}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {flow.type === "payment-in" && flow.inflowSource ? (
                          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                            {getInflowSourceLabel(flow.inflowSource)}
                          </span>
                        ) : (
                          flow.counterparty || "--"
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="text-muted-foreground">{flow.categoryName || flow.purpose || "--"}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="text-muted-foreground">
                          {flow.type === "transfer"
                            ? `${flow.fromAccountName || "--"} -> ${flow.toAccountName || "--"}`
                            : flow.accountName || "--"}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">{flow.notes || flow.purpose || "--"}</td>
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

type SummaryTileProps = {
  label: string
  value: string
  tone: string
}

function SummaryTile({ label, value, tone }: SummaryTileProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", tone)}>{value}</p>
    </div>
  )
}
