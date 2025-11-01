import { supabase } from '../lib/supabaseClient'
import type {
  CreateProjectProfileInput,
  ProjectBankAccount,
  ProjectBankAccountInput,
  ProjectCustomField,
  ProjectCustomFieldInput,
  ProjectFlow,
  ProjectFlowInput,
  ProjectFlowType,
  ProjectParent,
  ProjectParentInput,
  ProjectProfile,
  ProjectStatus,
  ProjectTenderLine,
  ProjectTenderStatus,
  ProjectTenderRecord,
  UpdateProjectProfilePatch,
} from '../types/projects'

const TENDER_STORAGE_KEY = 'construction:tenders:v1'
const PROFILE_STORAGE_KEY = 'construction:project-profiles:v1'
const PROJECT_UPDATED_EVENT = 'construction:projects:changed'
const LEGACY_PROJECTS_KEY = 'projects'
const LEGACY_ESTIMATES_KEY = 'estimates'

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {}
  return null
}

function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {}
  try {
    const bytes = new Uint8Array(8)
    ;(crypto as any).getRandomValues(bytes)
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {}
  return Math.random().toString(36).slice(2)
}

function now(): string {
  return new Date().toISOString()
}

function sanitizeString(value?: string | null): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.toString().trim()
  return trimmed.length ? trimmed : undefined
}

function sanitizeNumber(value?: number | string | null): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = typeof value === 'string' ? Number(value) : value
  if (typeof num !== 'number' || Number.isNaN(num)) return undefined
  return num
}

function normalizeAccountType(value?: string | null): 'personal' | 'company' {
  return value === 'company' ? 'company' : 'personal'
}

function ensureStatus(status?: ProjectStatus): ProjectStatus {
  return status ?? 'draft'
}

function ensureParentRecordDefaults(parent: ProjectParent): ProjectParent {
  const createdAt = parent.createdAt ?? now()
  const updatedAt = parent.updatedAt ?? createdAt
  return {
    id: parent.id ?? generateId(),
    label: sanitizeString(parent.label) ?? 'Unnamed parent',
    description: sanitizeString(parent.description),
    owner: sanitizeString(parent.owner),
    allocation: sanitizeNumber(parent.allocation),
    color: sanitizeString(parent.color),
    createdAt,
    updatedAt,
  }
}

function createParentFromInput(input: ProjectParentInput): ProjectParent {
  return ensureParentRecordDefaults({
    id: generateId(),
    label: input.label,
    description: input.description,
    owner: input.owner,
    allocation: input.allocation,
    color: input.color,
    createdAt: now(),
    updatedAt: now(),
  })
}

function updateParentWithInput(parent: ProjectParent, changes: Partial<ProjectParentInput>): ProjectParent {
  return ensureParentRecordDefaults({
    ...parent,
    label: changes.label !== undefined ? changes.label : parent.label,
    description: changes.description !== undefined ? changes.description : parent.description,
    owner: changes.owner !== undefined ? changes.owner : parent.owner,
    allocation: changes.allocation !== undefined ? changes.allocation : parent.allocation,
    color: changes.color !== undefined ? changes.color : parent.color,
    updatedAt: now(),
  })
}

function ensureBankAccountDefaults(account: ProjectBankAccount): ProjectBankAccount {
  const createdAt = account.createdAt ?? now()
  const updatedAt = account.updatedAt ?? createdAt
  return {
    id: account.id ?? generateId(),
    label: sanitizeString(account.label) ?? 'Account',
    bankName: sanitizeString(account.bankName),
    accountNumber: sanitizeString(account.accountNumber),
    branch: sanitizeString(account.branch),
    notes: sanitizeString(account.notes),
    isPrimary: account.isPrimary ?? false,
    accountType: normalizeAccountType(account.accountType),
    createdAt,
    updatedAt,
  }
}

function createBankAccountFromInput(input: ProjectBankAccountInput): ProjectBankAccount {
  return ensureBankAccountDefaults({
    id: generateId(),
    label: input.label,
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    branch: input.branch,
    notes: input.notes,
    isPrimary: input.isPrimary ?? false,
    accountType: input.accountType,
    createdAt: now(),
    updatedAt: now(),
  })
}

function updateBankAccountWithInput(account: ProjectBankAccount, changes: Partial<ProjectBankAccountInput>): ProjectBankAccount {
  return ensureBankAccountDefaults({
    ...account,
    label: changes.label !== undefined ? changes.label : account.label,
    bankName: changes.bankName !== undefined ? changes.bankName : account.bankName,
    accountNumber: changes.accountNumber !== undefined ? changes.accountNumber : account.accountNumber,
    branch: changes.branch !== undefined ? changes.branch : account.branch,
    notes: changes.notes !== undefined ? changes.notes : account.notes,
    isPrimary: changes.isPrimary !== undefined ? changes.isPrimary : account.isPrimary,
    accountType: changes.accountType !== undefined ? changes.accountType : account.accountType,
    updatedAt: now(),
  })
}

function ensureCustomFieldDefaults(field: ProjectCustomField): ProjectCustomField {
  const createdAt = field.createdAt ?? now()
  const updatedAt = field.updatedAt ?? createdAt
  return {
    id: field.id ?? generateId(),
    label: sanitizeString(field.label) ?? 'Custom field',
    value: field.value ?? '',
    createdAt,
    updatedAt,
  }
}

function createCustomFieldFromInput(input: ProjectCustomFieldInput): ProjectCustomField {
  return ensureCustomFieldDefaults({
    id: generateId(),
    label: input.label,
    value: input.value,
    createdAt: now(),
    updatedAt: now(),
  })
}

function updateCustomFieldWithInput(field: ProjectCustomField, changes: Partial<ProjectCustomFieldInput>): ProjectCustomField {
  return ensureCustomFieldDefaults({
    ...field,
    label: changes.label !== undefined ? changes.label : field.label,
    value: changes.value !== undefined ? changes.value : field.value,
    updatedAt: now(),
  })
}

function ensureFlowDefaults(flow: ProjectFlow): ProjectFlow {
  const createdAt = flow.createdAt ?? now()
  const updatedAt = flow.updatedAt ?? createdAt
  const normalizedType: ProjectFlowType =
    flow.type === 'transfer'
      ? 'transfer'
      : flow.type === 'payment-in' || flow.type === 'payment-out'
        ? flow.type
        : 'payment-out'

  return {
    id: flow.id ?? generateId(),
    type: normalizedType,
    date: flow.date ?? createdAt.slice(0, 10),
    amount: sanitizeNumber(flow.amount) ?? 0,
    currency: sanitizeString(flow.currency),
    accountId: sanitizeString(flow.accountId),
    accountName: sanitizeString(flow.accountName),
    fromAccountId: sanitizeString(flow.fromAccountId),
    fromAccountName: sanitizeString(flow.fromAccountName),
    toAccountId: sanitizeString(flow.toAccountId),
    toAccountName: sanitizeString(flow.toAccountName),
    counterparty: sanitizeString(flow.counterparty),
    categoryId: sanitizeString(flow.categoryId),
    categoryName: sanitizeString(flow.categoryName),
    purpose: sanitizeString(flow.purpose),
    notes: sanitizeString(flow.notes),
    createdAt,
    updatedAt,
  }
}

function createFlowFromInput(input: ProjectFlowInput): ProjectFlow {
  return ensureFlowDefaults({
    id: generateId(),
    type: input.type,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    accountId: input.accountId,
    accountName: input.accountName,
    fromAccountId: input.fromAccountId,
    fromAccountName: input.fromAccountName,
    toAccountId: input.toAccountId,
    toAccountName: input.toAccountName,
    counterparty: input.counterparty,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    purpose: input.purpose,
    notes: input.notes,
    createdAt: now(),
    updatedAt: now(),
  })
}

function updateFlowWithInput(flow: ProjectFlow, changes: Partial<ProjectFlowInput>): ProjectFlow {
  return ensureFlowDefaults({
    ...flow,
    type: changes.type !== undefined ? changes.type : flow.type,
    date: changes.date !== undefined ? changes.date : flow.date,
    amount: changes.amount !== undefined ? changes.amount : flow.amount,
    currency: changes.currency !== undefined ? changes.currency : flow.currency,
    accountId: changes.accountId !== undefined ? changes.accountId : flow.accountId,
    accountName: changes.accountName !== undefined ? changes.accountName : flow.accountName,
    fromAccountId: changes.fromAccountId !== undefined ? changes.fromAccountId : flow.fromAccountId,
    fromAccountName: changes.fromAccountName !== undefined ? changes.fromAccountName : flow.fromAccountName,
    toAccountId: changes.toAccountId !== undefined ? changes.toAccountId : flow.toAccountId,
    toAccountName: changes.toAccountName !== undefined ? changes.toAccountName : flow.toAccountName,
    counterparty: changes.counterparty !== undefined ? changes.counterparty : flow.counterparty,
    categoryId: changes.categoryId !== undefined ? changes.categoryId : flow.categoryId,
    categoryName: changes.categoryName !== undefined ? changes.categoryName : flow.categoryName,
    purpose: changes.purpose !== undefined ? changes.purpose : flow.purpose,
    notes: changes.notes !== undefined ? changes.notes : flow.notes,
    updatedAt: now(),
  })
}

function sortFlows(flows: ProjectFlow[]): ProjectFlow[] {
  const prepared = flows.map(ensureFlowDefaults)
  return prepared.sort((a, b) => {
    const timeA = Date.parse(a.date || a.createdAt)
    const timeB = Date.parse(b.date || b.createdAt)
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
      if (timeA === timeB) {
        return (b.updatedAt || '').localeCompare(a.updatedAt || '')
      }
      return timeB - timeA
    }
    if (Number.isNaN(timeA) && !Number.isNaN(timeB)) return 1
    if (!Number.isNaN(timeA) && Number.isNaN(timeB)) return -1
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
}

function ensureProfileDefaults(profile: ProjectProfile): ProjectProfile {
  const createdAt = profile.createdAt ?? now()
  const updatedAt = profile.updatedAt ?? createdAt
  const parents = Array.isArray(profile.parents) ? profile.parents.map(ensureParentRecordDefaults) : []
  const bankAccounts = Array.isArray(profile.bankAccounts) ? profile.bankAccounts.map(ensureBankAccountDefaults) : []
  const customFields = Array.isArray(profile.customFields) ? profile.customFields.map(ensureCustomFieldDefaults) : []
  const flows = Array.isArray(profile.flows) ? sortFlows(profile.flows) : []
  return {
    id: profile.id ?? generateId(),
    name: sanitizeString(profile.name) ?? 'Untitled project',
    code: sanitizeString(profile.code),
    client: sanitizeString(profile.client),
    description: sanitizeString(profile.description),
    location: sanitizeString(profile.location),
    status: ensureStatus(profile.status),
    startDate: sanitizeString(profile.startDate),
    dueDate: sanitizeString(profile.dueDate),
    budget: sanitizeNumber(profile.budget),
    accentColor: sanitizeString(profile.accentColor),
    parents,
    bankAccounts,
    customFields,
    flows,
    createdAt,
    updatedAt,
  }
}

function createProfileFromInput(input: CreateProjectProfileInput): ProjectProfile {
  const ts = now()
  return ensureProfileDefaults({
    id: generateId(),
    name: input.name,
    code: input.code,
    client: input.client,
    description: input.description,
    location: input.location,
    status: input.status ?? 'draft',
    startDate: input.startDate,
    dueDate: input.dueDate,
    budget: input.budget,
    accentColor: input.accentColor,
    parents: (input.parents ?? []).map(createParentFromInput),
    bankAccounts: (input.bankAccounts ?? []).map(createBankAccountFromInput),
    customFields: (input.customFields ?? []).map(createCustomFieldFromInput),
    flows: [],
    createdAt: ts,
    updatedAt: ts,
  })
}

function readLocalProfiles(): ProjectProfile[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item: ProjectProfile) => ensureProfileDefaults(item))
  } catch {
    return []
  }
}

function persistLocalProfiles(list: ProjectProfile[]) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(list.map((item) => ensureProfileDefaults(item))))
  } catch {}
}

function sortProfiles(list: ProjectProfile[]): ProjectProfile[] {
  return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

function emitProjectsUpdated() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PROJECT_UPDATED_EVENT))
    }
  } catch {}
}

export async function listProjectProfiles(): Promise<ProjectProfile[]> {
  return sortProfiles(readLocalProfiles())
}

export async function getProjectProfile(id: string): Promise<ProjectProfile | null> {
  const profiles = readLocalProfiles()
  const found = profiles.find((p) => p.id === id)
  return found ? ensureProfileDefaults(found) : null
}

export async function createProjectProfile(input: CreateProjectProfileInput): Promise<ProjectProfile> {
  const name = sanitizeString(input.name)
  if (!name) throw new Error('Project name is required')
  const profile = createProfileFromInput({ ...input, name })
  const profiles = readLocalProfiles()
  const next = [profile, ...profiles]
  persistLocalProfiles(next)
  emitProjectsUpdated()
  return profile
}

export async function updateProjectProfile(
  id: string,
  patchOrUpdater: UpdateProjectProfilePatch | ((current: ProjectProfile) => UpdateProjectProfilePatch)
): Promise<ProjectProfile> {
  const profiles = readLocalProfiles()
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error('Project not found')
  const current = ensureProfileDefaults(profiles[idx])
  const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(current) : patchOrUpdater
  const next: ProjectProfile = { ...current }
  next.updatedAt = now()
  if (patch.name !== undefined) {
    const sanitized = sanitizeString(patch.name)
    if (sanitized) next.name = sanitized
  }
  if (patch.code !== undefined) next.code = sanitizeString(patch.code)
  if (patch.client !== undefined) next.client = sanitizeString(patch.client)
  if (patch.description !== undefined) next.description = sanitizeString(patch.description)
  if (patch.location !== undefined) next.location = sanitizeString(patch.location)
  if (patch.status !== undefined) next.status = ensureStatus(patch.status)
  if (patch.startDate !== undefined) next.startDate = sanitizeString(patch.startDate)
  if (patch.dueDate !== undefined) next.dueDate = sanitizeString(patch.dueDate)
  if (patch.budget !== undefined) next.budget = sanitizeNumber(patch.budget)
  if (patch.accentColor !== undefined) next.accentColor = sanitizeString(patch.accentColor)
  if (patch.parents !== undefined) next.parents = patch.parents.map(ensureParentRecordDefaults)
  if (patch.bankAccounts !== undefined) next.bankAccounts = patch.bankAccounts.map(ensureBankAccountDefaults)
  if (patch.customFields !== undefined) next.customFields = patch.customFields.map(ensureCustomFieldDefaults)
  if (patch.flows !== undefined) next.flows = sortFlows(patch.flows)
  profiles[idx] = ensureProfileDefaults(next)
  persistLocalProfiles(profiles)
  emitProjectsUpdated()
  return profiles[idx]
}

export async function deleteProjectProfile(id: string): Promise<ProjectProfile[]> {
  const profiles = readLocalProfiles()
  const filtered = profiles.filter((p) => p.id !== id)
  persistLocalProfiles(filtered)
  emitProjectsUpdated()
  return sortProfiles(filtered)
}

export async function addProjectParent(projectId: string, input: ProjectParentInput): Promise<ProjectProfile> {
  if (!sanitizeString(input.label)) throw new Error('Parent title is required')
  const parent = createParentFromInput(input)
  return updateProjectProfile(projectId, (current) => ({ parents: [...current.parents, parent] }))
}

export async function updateProjectParent(
  projectId: string,
  parentId: string,
  changes: Partial<ProjectParentInput>
): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    parents: current.parents.map((parent) => (parent.id === parentId ? updateParentWithInput(parent, changes) : parent)),
  }))
}

export async function removeProjectParent(projectId: string, parentId: string): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    parents: current.parents.filter((parent) => parent.id !== parentId),
  }))
}

export async function addProjectBankAccount(projectId: string, input: ProjectBankAccountInput): Promise<ProjectProfile> {
  if (!sanitizeString(input.label)) throw new Error('Account label is required')
  const account = createBankAccountFromInput(input)
  return updateProjectProfile(projectId, (current) => ({ bankAccounts: [...current.bankAccounts, account] }))
}

export async function updateProjectBankAccount(
  projectId: string,
  accountId: string,
  changes: Partial<ProjectBankAccountInput>
): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    bankAccounts: current.bankAccounts.map((account) => (account.id === accountId ? updateBankAccountWithInput(account, changes) : account)),
  }))
}

export async function removeProjectBankAccount(projectId: string, accountId: string): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    bankAccounts: current.bankAccounts.filter((account) => account.id !== accountId),
  }))
}

export async function addProjectCustomField(projectId: string, input: ProjectCustomFieldInput): Promise<ProjectProfile> {
  if (!sanitizeString(input.label)) throw new Error('Field label is required')
  const field = createCustomFieldFromInput({ label: input.label, value: input.value ?? '' })
  return updateProjectProfile(projectId, (current) => ({ customFields: [...current.customFields, field] }))
}

export async function updateProjectCustomField(
  projectId: string,
  fieldId: string,
  changes: Partial<ProjectCustomFieldInput>
): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    customFields: current.customFields.map((field) => (field.id === fieldId ? updateCustomFieldWithInput(field, changes) : field)),
  }))
}

export async function removeProjectCustomField(projectId: string, fieldId: string): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    customFields: current.customFields.filter((field) => field.id !== fieldId),
  }))
}

export async function recordProjectFlow(projectId: string, input: ProjectFlowInput): Promise<ProjectProfile> {
  if (!sanitizeNumber(input.amount)) throw new Error('Amount is required')
  const flow = createFlowFromInput(input)
  return updateProjectProfile(projectId, (current) => ({ flows: sortFlows([flow, ...current.flows]) }))
}

export async function updateProjectFlow(
  projectId: string,
  flowId: string,
  changes: Partial<ProjectFlowInput>
): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    flows: sortFlows(current.flows.map((flow) => (flow.id === flowId ? updateFlowWithInput(flow, changes) : flow))),
  }))
}

export async function removeProjectFlow(projectId: string, flowId: string): Promise<ProjectProfile> {
  return updateProjectProfile(projectId, (current) => ({
    flows: current.flows.filter((flow) => flow.id !== flowId),
  }))
}

export type ProjectFlowSummaryRow = {
  key: string
  label: string
  type: ProjectFlowType
  totalAmount: number
  count: number
}

export type ProjectFlowSummary = {
  totalAmount: number
  totalPaymentsIn: number
  totalPaymentsOut: number
  totalTransfers: number
  netCash: number
  rows: ProjectFlowSummaryRow[]
}

export function summarizeProjectFlows(project: ProjectProfile): ProjectFlowSummary {
  const totals = {
    totalAmount: 0,
    inwards: 0,
    outwards: 0,
    transfers: 0,
  }
  const counts = {
    inwards: 0,
    outwards: 0,
    transfers: 0,
  }

  project.flows.forEach((flow) => {
    const amount = sanitizeNumber(flow.amount) ?? 0
    totals.totalAmount += amount
    const type = flow.type
    switch (type) {
      case 'payment-in':
        totals.inwards += amount
        counts.inwards += 1
        break
      case 'transfer':
        totals.transfers += amount
        counts.transfers += 1
        break
      default:
        totals.outwards += amount
        counts.outwards += 1
        break
    }
  })

  const rows: ProjectFlowSummaryRow[] = [
    { key: 'payment-in', label: 'Payments in', type: 'payment-in', totalAmount: totals.inwards, count: counts.inwards },
    { key: 'payment-out', label: 'Payments out', type: 'payment-out', totalAmount: totals.outwards, count: counts.outwards },
    { key: 'transfer', label: 'Transfers', type: 'transfer', totalAmount: totals.transfers, count: counts.transfers },
  ]

  return {
    totalAmount: totals.totalAmount,
    totalPaymentsIn: totals.inwards,
    totalPaymentsOut: totals.outwards,
    totalTransfers: totals.transfers,
    netCash: totals.inwards - totals.outwards,
    rows,
  }
}

export type ProjectLineInput = {
  item_id?: string
  name: string
  sku?: string | null
  unit?: string | null
  qty: number
  rate: number
}

export async function saveProject(params: { name: string; notes?: string; lines: ProjectLineInput[] }) {
  const total = params.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0)
  try {
    const { data: proj, error } = await supabase
      .from('projects')
      .insert({ name: params.name, notes: params.notes || null, total_amount: total })
      .select('id')
      .single()
    if (error) throw error
    const projectId = proj!.id as string
    const items = params.lines.map((l) => ({
      project_id: projectId,
      item_id: l.item_id || null,
      name: l.name,
      sku: l.sku || null,
      unit: l.unit || null,
      qty: Number(l.qty || 0),
      rate: Number(l.rate || 0),
      amount: Number(l.qty || 0) * Number(l.rate || 0),
    }))
    const { error: e2 } = await supabase.from('project_items').insert(items)
    if (e2) throw e2
    return { id: projectId, stored: 'supabase' as const }
  } catch {
    const storage = getStorage()
    if (!storage) throw new Error('Failed to save project')
    try {
      const id = generateId()
      const nowIso = now()
      const rec = {
        id,
        name: params.name,
        notes: params.notes || null,
        total_amount: total,
        created_at: nowIso,
        lines: params.lines,
      }
      const prev = JSON.parse(storage.getItem(LEGACY_PROJECTS_KEY) || '[]')
      prev.unshift(rec)
      storage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify(prev))
      return { id, stored: 'local' as const }
    } catch {
      throw new Error('Failed to save project')
    }
  }
}

export type EstimateLineInput = {
  name: string
  unit?: string | null
  qty: number
  rate: number
}

export async function saveEstimate(params: { name: string; notes?: string; lines: EstimateLineInput[] }) {
  const total = params.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0)
  try {
    const { data: est, error } = await supabase
      .from('estimates')
      .insert({ name: params.name, notes: params.notes || null, total_amount: total })
      .select('id')
      .single()
    if (error) throw error
    const estimateId = est!.id as string
    const rows = params.lines.map((l, idx) => ({
      estimate_id: estimateId,
      sn: idx + 1,
      name: l.name,
      unit: l.unit || null,
      qty: Number(l.qty || 0),
      rate: Number(l.rate || 0),
      amount: Number(l.qty || 0) * Number(l.rate || 0),
    }))
    const { error: e2 } = await supabase.from('estimate_items').insert(rows)
    if (e2) throw e2
    return { id: estimateId, stored: 'supabase' as const }
  } catch {
    const storage = getStorage()
    if (!storage) throw new Error('Failed to save estimate')
    try {
      const id = generateId()
      const nowIso = now()
      const rec = {
        id,
        name: params.name,
        notes: params.notes || null,
        total_amount: total,
        created_at: nowIso,
        lines: params.lines,
      }
      const prev = JSON.parse(storage.getItem(LEGACY_ESTIMATES_KEY) || '[]')
      prev.unshift(rec)
      storage.setItem(LEGACY_ESTIMATES_KEY, JSON.stringify(prev))
      return { id, stored: 'local' as const }
    } catch {
      throw new Error('Failed to save estimate')
    }
  }
}

type LocalTenderCacheEntry = {
  id: string
  projectId: string
  tender: ProjectTenderRecord
  storedAt: string
  updatedAt: string
}

function ensureTenderStatus(status?: ProjectTenderStatus): ProjectTenderStatus {
  return status === 'submitted' || status === 'awarded' || status === 'cancelled' ? status : 'draft'
}

function ensureTenderRecord(record: ProjectTenderRecord): ProjectTenderRecord {
  const createdAt = record.createdAt ?? now()
  const lastEditedAt = record.lastEditedAt ?? createdAt
  const priceStrategyOrder =
    Array.isArray(record.priceStrategyOrder) && record.priceStrategyOrder.length > 0
      ? (record.priceStrategyOrder as ProjectTenderRecord['priceStrategyOrder'])
      : ['last', 'avg', 'standard']
  const lines: ProjectTenderLine[] = Array.isArray(record.lines)
    ? record.lines.map((line) => {
        const quantity = Number(line.quantity ?? 0)
        const unitPrice =
          line.unitPrice !== undefined && line.unitPrice !== null ? Number(line.unitPrice) : null
        const amount =
          line.amount !== undefined && line.amount !== null
            ? Number(line.amount)
            : unitPrice !== null
              ? unitPrice * quantity
              : null
        return {
          id: line.id ?? generateId(),
          kind: line.kind ?? 'item',
          mode: line.kind === 'service' ? line.mode ?? 'simple' : undefined,
          catalogItemId: line.catalogItemId ?? null,
          name: sanitizeString(line.name) ?? 'Unnamed item',
          unit: sanitizeString(line.unit) ?? '',
          quantity,
          unitPrice,
          amount,
          pricingSource: sanitizeString(line.pricingSource) ?? 'manual entry',
          taxSnapshot: line.taxSnapshot ?? null,
          needsPrice: Boolean(line.needsPrice),
          breakdown: line.breakdown ?? null,
        }
      })
    : []

  return {
    tenderNumber: sanitizeString(record.tenderNumber) ?? `TN-${createdAt.slice(0, 10)}`,
    title: sanitizeString(record.title) ?? 'Untitled tender',
    closingDate: record.closingDate ?? null,
    status: ensureTenderStatus(record.status),
    currency: sanitizeString(record.currency) ?? 'NPR',
    taxProfileId: sanitizeString(record.taxProfileId) ?? null,
    priceStrategyOrder,
    avgWindowDays: Number(record.avgWindowDays ?? 30),
    preferSameProjectPrice: record.preferSameProjectPrice ?? true,
    totalAmount: Number(record.totalAmount ?? lines.reduce((acc, line) => acc + (line.amount ?? 0), 0)),
    lineCount: Number(record.lineCount ?? lines.length),
    createdBy: sanitizeString(record.createdBy) ?? null,
    createdAt,
    lastEditedBy: sanitizeString(record.lastEditedBy) ?? record.createdBy ?? null,
    lastEditedAt,
    auditTrail: Array.isArray(record.auditTrail)
      ? record.auditTrail
          .filter((entry) => entry && typeof entry.message === 'string')
          .map((entry) => ({
            message: sanitizeString(entry.message) ?? 'Updated',
            timestamp: entry.timestamp ?? createdAt,
          }))
      : [],
    lines,
  }
}

function readLocalTenderCache(): LocalTenderCacheEntry[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(TENDER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') return null
        const id = typeof entry.id === 'string' ? entry.id : null
        const projectId = typeof entry.projectId === 'string' ? entry.projectId : null
        const tender = entry.tender as ProjectTenderRecord | undefined
        if (!id || !projectId || !tender) return null
        const storedAt =
          typeof entry.storedAt === 'string' ? entry.storedAt : tender.createdAt ?? now()
        const updatedAt =
          typeof entry.updatedAt === 'string'
            ? entry.updatedAt
            : tender.lastEditedAt ?? storedAt
        return {
          id,
          projectId,
          tender: ensureTenderRecord(tender),
          storedAt,
          updatedAt,
        }
      })
      .filter(Boolean) as LocalTenderCacheEntry[]
  } catch {
    return []
  }
}

function writeLocalTenderCache(entries: LocalTenderCacheEntry[]) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(TENDER_STORAGE_KEY, JSON.stringify(entries))
  } catch {}
}

export type TenderAnalysisSummary = {
  id: string
  projectId: string
  tenderNumber: string
  title: string
  status: ProjectTenderStatus
  currency: string
  closingDate: string | null
  totalAmount: number
  lineCount: number
  updatedAt: string
  storage: 'supabase' | 'local'
  lastEditedBy?: string | null
}

export type TenderAnalysisDetail = {
  id: string
  projectId: string
  tender: ProjectTenderRecord
  storage: 'supabase' | 'local'
}

export type TenderLineSuggestion = {
  id: string
  name: string
  unit: string
  quantity?: number
  unitPrice?: number | null
  amount?: number | null
  lastUsedAt?: string
  tenderId?: string
  tenderNumber?: string
  currency?: string
  storage: 'supabase' | 'local'
}

export type SaveTenderAnalysisParams = {
  id?: string
  projectId: string
  tender: ProjectTenderRecord
}

export type SaveTenderAnalysisResult = {
  id: string
  stored: 'supabase' | 'local'
}

export async function listTenderAnalyses(options: {
  projectId?: string
} = {}): Promise<TenderAnalysisSummary[]> {
  const { projectId } = options
  const summaries: TenderAnalysisSummary[] = []
  try {
    let query = supabase
      .from('construction_tenders')
      .select('id, project_id, tender_number, title, status, currency, closing_date, total_amount, line_count, updated_at, payload')
      .order('updated_at', { ascending: false })
      .limit(100)
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    const { data, error } = await query
    if (error) throw error
    if (Array.isArray(data)) {
      data.forEach((row: any) => {
        const payload = row.payload as Partial<ProjectTenderRecord> | null
        const totalAmount =
          row.total_amount !== null && row.total_amount !== undefined
            ? Number(row.total_amount)
            : Number(payload?.totalAmount ?? 0)
        const lineCount =
          row.line_count !== null && row.line_count !== undefined
            ? Number(row.line_count)
            : Number(payload?.lineCount ?? payload?.lines?.length ?? 0)
        const updatedAt =
          row.updated_at ??
          payload?.lastEditedAt ??
          payload?.createdAt ??
          now()
        summaries.push({
          id: row.id as string,
          projectId: row.project_id as string,
          tenderNumber: row.tender_number as string,
          title: row.title as string,
          status: ensureTenderStatus(row.status as ProjectTenderStatus),
          currency: (row.currency as string) ?? payload?.currency ?? 'NPR',
          closingDate: (row.closing_date as string | null) ?? payload?.closingDate ?? null,
          totalAmount,
          lineCount,
          updatedAt,
          storage: 'supabase',
          lastEditedBy: payload?.lastEditedBy ?? null,
        })
      })
    }
  } catch (error) {
    console.warn('listTenderAnalyses: falling back to local cache', error)
  }

  const localEntries = readLocalTenderCache().filter((entry) => !projectId || entry.projectId === projectId)
  localEntries.forEach((entry) => {
    summaries.push({
      id: entry.id,
      projectId: entry.projectId,
      tenderNumber: entry.tender.tenderNumber,
      title: entry.tender.title,
      status: entry.tender.status,
      currency: entry.tender.currency,
      closingDate: entry.tender.closingDate ?? null,
      totalAmount: Number(entry.tender.totalAmount ?? 0),
      lineCount: entry.tender.lines.length,
      updatedAt: entry.updatedAt ?? entry.storedAt,
      storage: 'local',
      lastEditedBy: entry.tender.lastEditedBy ?? null,
    })
  })

  return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function getTenderAnalysis(params: {
  id: string
  storage: 'supabase' | 'local'
}): Promise<TenderAnalysisDetail | null> {
  if (params.storage === 'local') {
    const entry = readLocalTenderCache().find((item) => item.id === params.id)
    if (!entry) return null
    return {
      id: entry.id,
      projectId: entry.projectId,
      tender: ensureTenderRecord(entry.tender),
      storage: 'local',
    }
  }
  try {
    const { data, error } = await supabase
      .from('construction_tenders')
      .select('id, project_id, payload')
      .eq('id', params.id)
      .single()
    if (error) throw error
    if (!data) return null
    const payload = (data as any).payload as ProjectTenderRecord | null
    if (payload) {
      return {
        id: data.id as string,
        projectId: data.project_id as string,
        tender: ensureTenderRecord(payload),
        storage: 'supabase',
      }
    }
    return null
  } catch (error) {
    console.error('getTenderAnalysis supabase error', error)
    return null
  }
}

export async function searchTenderLineSuggestions(
  query: string,
  options: { projectId?: string; limit?: number } = {}
): Promise<TenderLineSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const limit = Math.max(3, options.limit ?? 8)
  const results: TenderLineSuggestion[] = []
  try {
    let builder = supabase
      .from('construction_tender_lines')
      .select(
        'id, name, unit, quantity, unit_price, amount, created_at, tender:construction_tenders(id, tender_number, currency, project_id, updated_at)'
      )
      .ilike('name', `%${trimmed}%`)
      .order('created_at', { ascending: false })
      .limit(limit * 2)
    if (options.projectId) {
      builder = builder.eq('project_id', options.projectId)
    }
    const { data, error } = await builder
    if (error) throw error
    if (Array.isArray(data)) {
      data.forEach((row: any) => {
        results.push({
          id: row.id as string,
          name: row.name as string,
          unit: (row.unit as string) ?? '',
          quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : undefined,
          unitPrice:
            row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : null,
          amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
          lastUsedAt: (row.tender?.updated_at as string) ?? (row.created_at as string),
          tenderId: row.tender?.id as string | undefined,
          tenderNumber: row.tender?.tender_number as string | undefined,
          currency: row.tender?.currency as string | undefined,
          storage: 'supabase',
        })
      })
    }
  } catch (error) {
    console.warn('searchTenderLineSuggestions supabase error', error)
  }

  const lowercase = trimmed.toLowerCase()
  readLocalTenderCache()
    .filter((entry) => !options.projectId || entry.projectId === options.projectId)
    .forEach((entry) => {
      entry.tender.lines.forEach((line) => {
        if (!line.name.toLowerCase().includes(lowercase)) return
        results.push({
          id: `${entry.id}:${line.id}`,
          name: line.name,
          unit: line.unit ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount ?? null,
          lastUsedAt: entry.tender.lastEditedAt ?? entry.updatedAt,
          tenderId: entry.id,
          tenderNumber: entry.tender.tenderNumber,
          currency: entry.tender.currency,
          storage: 'local',
        })
      })
    })

  const dedup = new Map<string, TenderLineSuggestion>()
  results
    .sort((a, b) => {
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
      return bTime - aTime
    })
    .forEach((item) => {
      const key = `${item.name.toLowerCase()}|${item.unit.toLowerCase()}|${item.unitPrice ?? 'n/a'}`
      if (!dedup.has(key)) dedup.set(key, item)
    })

  return Array.from(dedup.values()).slice(0, limit)
}

export async function saveTenderAnalysis(
  params: SaveTenderAnalysisParams
): Promise<SaveTenderAnalysisResult> {
  const { id, projectId, tender } = params
  const payload = ensureTenderRecord(tender)
  try {
    const upsertData: Record<string, unknown> = {
      project_id: projectId,
      tender_number: payload.tenderNumber,
      title: payload.title,
      closing_date: payload.closingDate ?? null,
      status: payload.status,
      currency: payload.currency,
      tax_profile_id: payload.taxProfileId ?? null,
      price_strategy_order: payload.priceStrategyOrder,
      avg_window_days: payload.avgWindowDays,
      prefer_same_project_price: payload.preferSameProjectPrice,
      total_amount: payload.totalAmount,
      line_count: payload.lines.length,
      payload,
    }
    if (id) {
      upsertData.id = id
    }
    const { data, error } = await supabase
      .from('construction_tenders')
      .upsert(upsertData, { onConflict: 'id' })
      .select('id')
      .single()
    if (error) throw error
    const tenderId = (data?.id ?? id ?? generateId()) as string
    const { error: deleteError } = await supabase
      .from('construction_tender_lines')
      .delete()
      .eq('tender_id', tenderId)
    if (deleteError) throw deleteError
    if (payload.lines.length > 0) {
      const rows = payload.lines.map((line, index) => ({
        tender_id: tenderId,
        project_id: projectId,
        sn: index + 1,
        kind: line.kind,
        mode: line.kind === 'service' ? line.mode ?? null : null,
        catalog_item_id: line.catalogItemId ?? null,
        name: line.name,
        unit: line.unit,
        quantity: Number(line.quantity ?? 0),
        unit_price: line.unitPrice ?? null,
        amount: line.amount ?? null,
        pricing_source: line.pricingSource ?? null,
        tax_snapshot: line.taxSnapshot ?? null,
        breakdown: line.breakdown ?? null,
        needs_price: line.needsPrice ?? false,
      }))
      const { error: insertError } = await supabase.from('construction_tender_lines').insert(rows)
      if (insertError) throw insertError
    }
    return { id: tenderId, stored: 'supabase' }
  } catch (error) {
    const storage = getStorage()
    if (!storage) throw error
    try {
      const cache = readLocalTenderCache()
      const cacheId = id ?? generateId()
      const nowIso = now()
      const nextEntry: LocalTenderCacheEntry = {
        id: cacheId,
        projectId,
        tender: payload,
        storedAt:
          cache.find((entry) => entry.id === cacheId)?.storedAt ?? payload.createdAt ?? nowIso,
        updatedAt: payload.lastEditedAt ?? nowIso,
      }
      const existingIndex = cache.findIndex((entry) => entry.id === cacheId)
      if (existingIndex >= 0) {
        cache[existingIndex] = nextEntry
      } else {
        cache.unshift(nextEntry)
      }
      writeLocalTenderCache(cache)
      return { id: cacheId, stored: 'local' }
    } catch {
      throw error
    }
  }
}

