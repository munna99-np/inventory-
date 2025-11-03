import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Edit3, FileText, RefreshCcw } from "lucide-react"

import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { formatCurrency } from "../lib/format"
import { cn } from "../lib/utils"
import { getProjectProfile, summarizeProjectFlows } from "../services/projects"
import type { ProjectProfile } from "../types/projects"
import { TenderBiddingAnalysisQuickAction } from "../features/projects/TenderBiddingAnalysisQuickAction"

export default function ConstructionProjectDetailPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (withSpinner = false) => {
      if (!projectId) return
      if (withSpinner) setRefreshing(true)
      try {
        const next = await getProjectProfile(projectId)
        if (!next) {
          setProject(null)
          setError("Project not found")
          return
        }
        setProject(next)
        setError(null)
      } catch (err: any) {
        console.error(err)
        const message = err?.message ?? "Failed to load project"
        setError(message)
        toast.error(message)
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

  const defaultTenderCurrency = useMemo(() => {
    if (!project?.flows?.length) return "NPR"
    const flowCurrency = project.flows.find((flow) => flow.currency)?.currency
    return (flowCurrency ?? "NPR").toUpperCase()
  }, [project?.flows])

  const openOverview = () => {
    if (!project) return
    navigate(`/construction/${project.id}/overview`)
  }

  const openBankAccounts = () => {
    if (!project) return
    navigate(`/construction/${project.id}/bank-accounts`)
  }

  const openPayment = (type: "in" | "out" | "transfer") => {
    if (!project) return
    const base = `/construction/${project.id}/payments`
    const target = type === "in" ? `${base}/in` : type === "out" ? `${base}/out` : `${base}/transfer`
    navigate(target)
  }

  const openStatement = () => {
    if (!project) return
    navigate(`/construction/${project.id}/statement`)
  }

  const openReport = () => {
    if (!project) return
    navigate(`/construction/${project.id}/report`)
  }

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
          <CardContent className="text-sm text-muted-foreground">Open the construction dashboard again to reload the project.</CardContent>
        </Card>
      </div>
    )
  }

  if (loading && !project) {
    return <div className="grid min-h-[40vh] place-items-center text-muted-foreground">Loading project...</div>
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
            <CardTitle>Unable to load project</CardTitle>
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

  const accent = project.accentColor || "#1d4ed8"

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="w-fit gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="mt-1">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">{project.name}</h1>
            <p className="text-sm text-muted-foreground">Construction project hub</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openStatement} className="h-8 gap-1.5 px-3 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Statement
          </Button>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} className="h-8 gap-1.5 px-3 text-xs">
            <RefreshCcw className={cn("h-3.5 w-3.5", refreshing ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="rounded-3xl border border-border/40 bg-white/85 p-6 shadow-sm backdrop-blur" style={{ borderColor: accent }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project overview</h2>
              <p className="mt-2 text-3xl font-semibold text-foreground">{project.status === "completed" ? "Completed" : "In progress"}</p>
              <p className="text-sm text-muted-foreground">
                {project.client ? `Client: ${project.client}` : "Client not set"} | {project.location || "Location not set"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openOverview} className="gap-2">
              <Edit3 className="h-4 w-4" />
              Manage details
            </Button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric label="Payments in" value={formatCurrency(summary.totalPaymentsIn)} note={`${summary.rows.find((row) => row.type === "payment-in")?.count ?? 0} record(s)`} tone="text-emerald-600" />
            <Metric label="Payments out" value={formatCurrency(summary.totalPaymentsOut)} note={`${summary.rows.find((row) => row.type === "payment-out")?.count ?? 0} record(s)`} tone="text-rose-600" />
            <Metric label="Transfers" value={formatCurrency(summary.totalTransfers)} note={`${summary.rows.find((row) => row.type === "transfer")?.count ?? 0} movement(s)`} tone="text-sky-600" />
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/60">
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
          <p className="text-sm text-muted-foreground">Jump straight into the workflow you need.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <ActionCard title="Project overview" description="Update project information and stakeholder details." onClick={openOverview} color="from-slate-600 to-slate-800" />
          <ActionCard title="Bank accounts" description="View cards and manage project accounts." onClick={openBankAccounts} color="from-indigo-500 to-indigo-700" />
          <ActionCard title="Payment in" description="Log incoming funds." onClick={() => openPayment("in")} color="from-emerald-500 to-emerald-700" />
          <ActionCard title="Payment out" description="Record an expense or vendor payment." onClick={() => openPayment("out")} color="from-rose-500 to-rose-700" />
          <ActionCard title="Transfer" description="Move funds between accounts." onClick={() => openPayment("transfer")} color="from-sky-500 to-sky-700" />
          <ActionCard title="Report" description="Review trends, categories, and overall performance." onClick={openReport} color="from-violet-500 to-violet-700" />
          <div className="sm:col-span-3">
            <TenderBiddingAnalysisQuickAction
              projectId={project.id}
              projectName={project.name}
              accentColor={accent}
              defaultCurrency={defaultTenderCurrency}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type MetricProps = {
  label: string
  value: string
  note: string
  tone: string
}

function Metric({ label, value, note, tone }: MetricProps) {
  return (
    <div className="rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold", tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

type ActionCardProps = {
  title: string
  description: string
  onClick: () => void
  color: string
}

function ActionCard({ title, description, onClick, color }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl border border-transparent bg-gradient-to-br p-5 text-left text-white transition hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        color
      )}
    >
      <span className="text-base font-semibold">{title}</span>
      <span className="text-sm text-white/80">{description}</span>
    </button>
  )
}
