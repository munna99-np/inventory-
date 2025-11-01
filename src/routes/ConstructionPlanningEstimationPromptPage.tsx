import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Check, Copy, Eye, EyeOff, FileText } from "lucide-react"

import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { getProjectProfile } from "../services/projects"
import type { ProjectProfile } from "../types/projects"

type Highlight = {
  label: string
  detail: string
}

type SectionDescriptor = {
  title: string
  description?: string
  items: string[]
}

const contextHighlights: Highlight[] = [
  {
    label: "Stack",
    detail: "Postgres (Supabase), Drizzle ORM (TypeScript), Next.js + shadcn/ui, Expo (optional).",
  },
  {
    label: "Scope",
    detail: "BOQ import & versioning, resource norms (material/labour/equipment), baseline budget by WBS/Cost Code, Gantt/Schedule with milestones/activities, target vs actual progress linkage, and change/variation control.",
  },
  {
    label: "Security",
    detail: "Multi-project, multi-site, project-scoped RLS.",
  },
  {
    label: "Data Standards",
    detail: "All records carry project_id, created_by, timestamps, soft delete.",
  },
]

const coreSections: SectionDescriptor[] = [
  {
    title: "Data Model (DDL + Drizzle)",
    items: [
      "Tables: boq_headers, boq_lines, estimate_versions, estimate_lines, wbs_nodes, cost_codes, resource_norms, rates_catalog, schedule_activities, activity_predecessors, activity_resources, progress_snapshots, budget_baselines, budget_revisions, variation_orders, attachments.",
      "Keys & indexes, FK relations, enums (uom, resource_type, activity_type, dependency_type, progress_method).",
    ],
  },
  {
    title: "RLS Policies",
    items: ["Tenant/project scoped read/write.", "Role tags (planner, pm, finance, viewer)."],
  },
  {
    title: "Triggers & Functions",
    items: [
      "On estimate_lines upsert -> rollup estimate totals to estimate_versions and to budget_baselines.",
      "On schedule_activities change -> recompute critical path fields (ES/EF/LS/LF, total/free float) and store in columns.",
      "On budget_revisions approve -> snapshot into progress_snapshots with variance fields.",
    ],
  },
  {
    title: "Views",
    items: ["v_project_budget_summary", "v_wbs_cost_variance", "v_schedule_health (spi_cpi_like)."],
  },
  {
    title: "Importers & Validators",
    items: [
      "BOQ Import from CSV/XLSX: mapping (Item Code, Description, WBS, Cost Code, Qty, UoM, Rate, Amount, Remarks).",
      "Duplicate detection, UoM normalization, WBS path validation, rounding rules.",
      "Sample CSV and schema validation code.",
    ],
  },
  {
    title: "Estimation & Budgeting Logic",
    items: [
      'Multi-version estimates (e.g., "Concept", "Detailed", "Tender", "Revised-1"). Version status: draft|review|approved|archived.',
      "Resource take-off: per WBS activity, apply resource_norms (e.g., cement kg/m3, labour hr/m2, equipment hr/m3).",
      "Rate build-ups (materials + labour + equipment + overhead/contingency %).",
      "Baseline budget freeze with hash + approver log; revisions with reason codes.",
      "Variation Orders: link to WBS, quantify delta, route for approval, effect on time & cost.",
    ],
  },
  {
    title: "Scheduling (Gantt) & Critical Path",
    items: [
      "Activity fields: activity_code, wbs_id, name, duration_days, calendar_id, start, finish, progress_method (qty|percent|milestone), percent_complete, is_milestone, constraints, responsible_role.",
      "Predecessors: FS/SS/FF/SF with lag.",
      "Calculate ES/EF/LS/LF, Total Float, identify critical.",
      "Calendar support (workdays/holidays).",
      "Progress entry by quantities or %.",
    ],
  },
  {
    title: "APIs (REST or tRPC)",
    items: [
      "POST /boq/import, GET /boq/:id, POST /estimates, PATCH /estimates/:id/status,",
      "POST /estimate-lines/bulk, POST /schedule/activities, POST /schedule/recalc-cpm,",
      "POST /budget/baseline, POST /budget/revisions, POST /variations, GET /dashboards/planning.",
      "Include request/response DTOs, pagination, filtering (by project, wbs, status), and auth guards.",
    ],
  },
  {
    title: "3-way Linkages",
    items: ["WBS <-> Estimate lines <-> Schedule activities."],
  },
  {
    title: "UI Flows (Next.js + shadcn/ui)",
    items: [
      "BOQ & Estimate Workspace: left = WBS tree, center = grid editor (qty, rate, amount, version), right = resource build-up & attachments.",
      "Schedule (Gantt): activity table + interactive Gantt; predecessors editor; CPM recalc button.",
      "Baseline & Revisions: compare views (Delta Qty, Delta Rate, Delta Cost, Delta Time).",
      "Variations: create -> quantify -> approval trail -> baseline impact preview.",
    ],
  },
  {
    title: "Dashboards",
    items: [
      "Estimation: Budget by WBS, top cost drivers, contingency usage.",
      "Schedule: critical path list, slippage alerts, SPI-like (planned vs. actual progress).",
    ],
  },
  {
    title: "Accessibility & Offline Notes",
    items: ["Accessibility & offline notes."],
  },
]

const analyticsSections: SectionDescriptor[] = [
  {
    title: "KPIs & Reports (SQL views + endpoints)",
    items: [
      "Budget Utilization by WBS/Cost Code; Cost variance; Top 10 activities by cost/time risk.",
      "Planned vs Actual curves (S-Curve data endpoint).",
      "Version comparison report; Variation impact report; Resource demand histogram.",
    ],
  },
  {
    title: "Seed Data & Test Cases",
    items: [
      "Provide seed.sql + small sample CSVs (BOQ, norms).",
      "Unit tests for CPM calc, estimate rollup, importer validation.",
    ],
  },
  {
    title: "Non-functional",
    items: [
      "Performance tips (indexes, materialized views), concurrency notes, audit logging, and error handling patterns.",
      "Clearly mark TODOs where assumptions were made.",
    ],
  },
  {
    title: "Output Expectations",
    items: [
      "SQL (Postgres DDL + triggers)",
      "Drizzle schema (TypeScript)",
      "API route handlers (TypeScript)",
      "Minimal Next.js pages/components (Gantt stub OK)",
      "Seed/test files and sample CSVs (inline)",
      "Use Nepali project context (multi-project), but keep code & comments in English.",
    ],
  },
]

type SubPromptOption = {
  label: string
  prompt: string
}

const subPromptOptions: SubPromptOption[] = [
  {
    label: "A) SQL + Drizzle Only",
    prompt:
      'Generate Postgres DDL and Drizzle schema for the Planning & Estimation module covering the tables, enums, and indexes described above, with RLS per project_id, approval workflows, triggers for CPM fields, and rollups. Include seed data and views.',
  },
  {
    label: "B) CPM Engine",
    prompt:
      "Write a server-side CPM calculation function (TypeScript) that computes ES/EF/LS/LF, total float, and critical path for schedule_activities with predecessors (FS/SS/FF/SF plus lag). Include tests and handle cycles with validation errors.",
  },
  {
    label: "C) BOQ Importer",
    prompt:
      "Create a Next.js API route /api/boq/import that accepts CSV or XLSX, validates columns, normalizes UoM, maps WBS paths, detects duplicates, and inserts into boq_lines within a transaction. Provide Zod schema, sample file, and error responses.",
  },
  {
    label: "D) Estimate Workspace UI",
    prompt:
      "Build a Next.js page app/projects/[id]/estimation with WBS tree (left), estimate grid (center), and resource build-up panel (right) using shadcn/ui. Include version switcher, approve button (role-guarded), and diff view between versions.",
  },
  {
    label: "E) Baseline & Revision Flow",
    prompt:
      "Implement endpoints and database logic to freeze a baseline (budget_baselines) and create a revision with reason codes; show compare reports by WBS (qty, rate, cost deltas). Include approval trail and audit logs.",
  },
  {
    label: "F) Reports & Dashboards",
    prompt:
      "Provide SQL views plus API endpoints for v_project_budget_summary, v_wbs_cost_variance, v_schedule_health, and an S-curve data endpoint (planned versus actual). Add a dashboard page consuming these.",
  },
]

const masterPromptText = `You are a senior systems architect. Build the Planning & Estimation module for a construction ERP integrated with Projects, WBS/Cost Codes, Items, Vendors, and Finance.

Context

Stack: Postgres (Supabase), Drizzle ORM (TypeScript), Next.js + shadcn/ui, Expo (optional).
Scope: BOQ import & versioning, resource norms (material/labour/equipment), baseline budget by WBS/Cost Code, Gantt/Schedule with milestones/activities, target vs actual progress linkage, and change/variation control.
Multi-project, multi-site, project-scoped RLS.
All records carry project_id, created_by, timestamps, soft delete.

Deliverables (produce all)

Data Model (DDL + Drizzle)
Tables: boq_headers, boq_lines, estimate_versions, estimate_lines, wbs_nodes, cost_codes, resource_norms, rates_catalog, schedule_activities, activity_predecessors, activity_resources, progress_snapshots, budget_baselines, budget_revisions, variation_orders, attachments.
Keys & indexes, FK relations, enums (uom, resource_type, activity_type, dependency_type, progress_method).

RLS policies: tenant/project scoped read/write, role tags (planner, pm, finance, viewer).

Triggers/Functions:
On estimate_lines upsert -> rollup estimate totals to estimate_versions and to budget_baselines.
On schedule_activities change -> recompute critical path fields (ES/EF/LS/LF, total/ free float) and store in columns.
On budget_revisions approve -> snapshot into progress_snapshots with variance fields.

Views: v_project_budget_summary, v_wbs_cost_variance, v_schedule_health (spi_cpi_like).

Importers & Validators
BOQ Import from CSV/XLSX: mapping (Item Code, Description, WBS, Cost Code, Qty, UoM, Rate, Amount, Remarks).
Duplicate detection, UoM normalization, WBS path validation, rounding rules.
Sample CSV and schema validation code.

Estimation & Budgeting Logic
Multi-version estimates (e.g., "Concept", "Detailed", "Tender", "Revised-1"). Version status: draft|review|approved|archived.
Resource take-off: per WBS activity, apply resource_norms (e.g., cement kg/m3, labour hr/m2, equipment hr/m3).
Rate build-ups (materials + labour + equipment + overhead/contingency %).
Baseline budget freeze with hash + approver log; revisions with reason codes.
Variation Orders: link to WBS, quantify delta, route for approval, effect on time & cost.

Scheduling (Gantt) & Critical Path
Activity fields: activity_code, wbs_id, name, duration_days, calendar_id, start, finish, progress_method (qty|percent|milestone), percent_complete, is_milestone, constraints, responsible_role.
Predecessors: FS/SS/FF/SF with lag.
Calculate ES/EF/LS/LF, Total Float, identify critical.
Calendar support (workdays/holidays).
Progress entry by quantities or %.

APIs (REST or tRPC)
POST /boq/import, GET /boq/:id, POST /estimates, PATCH /estimates/:id/status,
POST /estimate-lines/bulk, POST /schedule/activities, POST /schedule/recalc-cpm,
POST /budget/baseline, POST /budget/revisions, POST /variations, GET /dashboards/planning.
Include request/response DTOs, pagination, filtering (by project, wbs, status), and auth guards.
3-way linkages: WBS <-> Estimate lines <-> Schedule activities.

UI Flows (Next.js + shadcn/ui)
BOQ & Estimate Workspace: left = WBS tree, center = grid editor (qty, rate, amount, version), right = resource build-up & attachments.
Schedule (Gantt): activity table + interactive Gantt; predecessors editor; CPM recalc button.
Baseline & Revisions: compare views (Delta Qty, Delta Rate, Delta Cost, Delta Time).
Variations: create -> quantify -> approval trail -> baseline impact preview.

Dashboards:
Estimation: Budget by WBS, top cost drivers, contingency usage.
Schedule: critical path list, slippage alerts, SPI-like (planned vs. actual progress).

Accessibility & offline notes.

KPIs & Reports (SQL views + endpoints)
Budget Utilization by WBS/Cost Code; Cost variance; Top 10 activities by cost/time risk.
Planned vs Actual curves (S-Curve data endpoint).
Version comparison report; Variation impact report; Resource demand histogram.

Seed Data & Test Cases
Provide seed.sql + small sample CSVs (BOQ, norms).
Unit tests for CPM calc, estimate rollup, importer validation.

Non-functional
Performance tips (indexes, materialized views), concurrency notes, audit logging, and error handling patterns.
Clearly mark TODOs where assumptions were made.

Output everything as:
SQL (Postgres DDL + triggers)
Drizzle schema (TypeScript)
API route handlers (TypeScript)
Minimal Next.js pages/components (Gantt stub OK)
Seed/test files and sample CSVs (inline)
Use Nepali project context (multi-project), but keep code & comments in English.

Sub-Prompts (when you want parts only)
A) SQL + Drizzle Only
"Generate Postgres DDL and Drizzle schema for the Planning & Estimation module covering the tables/enums/indices described above, with RLS per project_id, approval workflows, triggers for CPM fields, and rollups. Include seed data and views."
B) CPM Engine
"Write a server-side CPM calculation function (TypeScript) that computes ES/EF/LS/LF, total float, and critical path for schedule_activities with predecessors (FS/SS/FF/SF + lag). Include tests and handle cycles with validation errors."
C) BOQ Importer
"Create a Next.js API route /api/boq/import that accepts CSV/XLSX, validates columns, normalizes UoM, maps WBS paths, detects duplicates, and inserts into boq_lines within a transaction. Provide Zod schema, sample file, and error responses."
D) Estimate Workspace UI
"Build a Next.js page app/projects/[id]/estimation with WBS tree (left), estimate grid (center), and resource build-up panel (right) using shadcn/ui. Include version switcher, approve button (role-guarded), and diff view between versions."
E) Baseline & Revision Flow
"Implement endpoints and DB logic to freeze a baseline (budget_baselines) and create a revision with reason codes; show compare report by WBS (qty, rate, cost deltas). Include approval trail and audit logs."
F) Reports & Dashboards
"Provide SQL views + API endpoints for: v_project_budget_summary, v_wbs_cost_variance, v_schedule_health, and an S-curve data endpoint (planned vs actual). Add a dashboard page consuming these."

ek dam ramro UI look like a professional design and fixed all error and issue
`

export default function ConstructionPlanningEstimationPromptPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [project, setProject] = useState<ProjectProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(true)
  const [copiedSubPrompt, setCopiedSubPrompt] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
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
    }
  }, [projectId])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  const accent = useMemo(() => project?.accentColor ?? "#6d28d9", [project?.accentColor])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(masterPromptText)
      setCopied(true)
      toast.success("Master prompt copied to clipboard")
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      console.error(err)
      toast.error("Unable to copy prompt")
    }
  }, [])

  const handleCopySubPrompt = useCallback(async (option: SubPromptOption) => {
    try {
      await navigator.clipboard.writeText(option.prompt)
      setCopiedSubPrompt(option.label)
      toast.success(`${option.label} copied`)
      setTimeout(() => setCopiedSubPrompt(null), 2500)
    } catch (err) {
      console.error(err)
      toast.error("Unable to copy sub-prompt")
    }
  }, [])

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
            <Button onClick={load} className="w-fit gap-2">
              <ArrowLeft className="h-4 w-4 rotate-180" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRaw((prev) => !prev)} className="gap-2">
            {showRaw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showRaw ? "Hide raw prompt" : "Show raw prompt"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      </div>

      <Card
        className="border-0 bg-gradient-to-br from-white via-white/90 to-white/70 p-[1px] shadow-xl"
        style={{ borderColor: accent }}
      >
        <div
          className="rounded-[1.45rem] border border-white/60 bg-white/90 p-8 shadow-lg backdrop-blur"
          style={{ borderColor: accent }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                Master Prompt
              </span>
              <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
                Planning & Estimation (Construction ERP)
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                You are a senior systems architect. Deliver a full-stack Planning & Estimation module tightly
                integrated with Projects, WBS/Cost Codes, Items, Vendors, Finance, and Nepali multi-project delivery needs.
              </p>
            </div>
            <div className="min-w-[220px] rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="font-semibold text-primary">Project context</p>
              <p className="mt-1 text-muted-foreground">
                {project ? project.name : `Project ID: ${projectId}`}
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4 text-primary" />
                Blueprint created for planners, PMs, finance, and executive dashboards.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {contextHighlights.map((highlight) => (
          <div
            key={highlight.label}
            className="rounded-2xl border border-border/60 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{highlight.label}</p>
            <p className="mt-2 text-sm text-foreground">{highlight.detail}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <header>
          <h2 className="text-xl font-semibold text-foreground">Solution scope & architecture</h2>
          <p className="text-sm text-muted-foreground">
            Core deliverables spanning database, application logic, integrations, and user experience.
          </p>
        </header>
        <div className="grid gap-4 xl:grid-cols-2">
          {coreSections.map((section) => (
            <SectionCard key={section.title} {...section} accent={accent} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-xl font-semibold text-foreground">Analytics, governance & quality</h2>
          <p className="text-sm text-muted-foreground">
            Reporting, testing, and delivery guardrails required for a production-grade ERP rollout.
          </p>
        </header>
        <div className="grid gap-4 xl:grid-cols-2">
          {analyticsSections.map((section) => (
            <SectionCard key={section.title} {...section} accent={accent} />
          ))}
        </div>
      </section>

      <Card className="border border-primary/30 bg-primary/5">
        <CardHeader>
      <CardTitle className="text-base font-semibold text-primary">Sub-prompts for modular delivery</CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="space-y-3 text-sm text-muted-foreground">
        {subPromptOptions.map((option) => (
          <li
            key={option.label}
            className="space-y-2 rounded-xl border border-primary/10 bg-white/70 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
              <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{option.label}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 py-1 text-xs"
                onClick={() => handleCopySubPrompt(option)}
              >
                {copiedSubPrompt === option.label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSubPrompt === option.label ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{option.prompt}</p>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>

      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/60 p-6 shadow-sm">
        <p className="text-sm font-semibold text-amber-900">Design expectation</p>
        <p className="mt-2 text-sm text-amber-800">
          ek dam ramro UI look like a professional design and fixed all error and issue
        </p>
      </div>

      {showRaw && (
        <Card className="border border-border/60 bg-white/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Raw master prompt</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[480px] overflow-x-auto whitespace-pre-wrap rounded-xl border border-dashed border-border/60 bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
{masterPromptText}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SectionCard({ title, description, items, accent }: SectionDescriptor & { accent: string }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-white/90 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/50" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
