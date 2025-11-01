export type ProjectStatus = 'draft' | 'active' | 'on-hold' | 'completed'

export type ProjectParent = {
  id: string
  label: string
  description?: string
  owner?: string
  allocation?: number
  color?: string
  createdAt: string
  updatedAt: string
}

export type ProjectBankAccount = {
  id: string
  label: string
  bankName?: string
  accountNumber?: string
  branch?: string
  notes?: string
  isPrimary?: boolean
  accountType?: 'personal' | 'company'
  createdAt: string
  updatedAt: string
}

export type ProjectCustomField = {
  id: string
  label: string
  value: string
  createdAt: string
  updatedAt: string
}

export type ProjectFlowType = 'payment-in' | 'payment-out' | 'transfer'

export type ProjectFlow = {
  id: string
  type: ProjectFlowType
  date: string
  amount: number
  currency?: string
  accountId?: string
  accountName?: string
  fromAccountId?: string
  fromAccountName?: string
  toAccountId?: string
  toAccountName?: string
  counterparty?: string
  categoryId?: string
  categoryName?: string
  purpose?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type ProjectFlowInput = {
  type: ProjectFlowType
  date: string
  amount: number
  currency?: string
  accountId?: string
  accountName?: string
  fromAccountId?: string
  fromAccountName?: string
  toAccountId?: string
  toAccountName?: string
  counterparty?: string
  categoryId?: string
  categoryName?: string
  purpose?: string
  notes?: string
}

export type ProjectProfile = {
  id: string
  name: string
  code?: string
  client?: string
  description?: string
  location?: string
  status: ProjectStatus
  startDate?: string
  dueDate?: string
  budget?: number
  accentColor?: string
  parents: ProjectParent[]
  bankAccounts: ProjectBankAccount[]
  customFields: ProjectCustomField[]
  flows: ProjectFlow[]
  createdAt: string
  updatedAt: string
}

export type CreateProjectProfileInput = {
  name: string
  code?: string
  client?: string
  description?: string
  location?: string
  status?: ProjectStatus
  startDate?: string
  dueDate?: string
  budget?: number
  accentColor?: string
  parents?: ProjectParentInput[]
  bankAccounts?: ProjectBankAccountInput[]
  customFields?: ProjectCustomFieldInput[]
}

export type UpdateProjectProfilePatch = Partial<Omit<ProjectProfile, 'id' | 'createdAt' | 'parents' | 'bankAccounts' | 'customFields' | 'flows'>> & {
  parents?: ProjectParent[]
  bankAccounts?: ProjectBankAccount[]
  customFields?: ProjectCustomField[]
  flows?: ProjectFlow[]
}

export type ProjectParentInput = {
  label: string
  description?: string
  owner?: string
  allocation?: number
  color?: string
}

export type ProjectBankAccountInput = {
  label: string
  bankName?: string
  accountNumber?: string
  branch?: string
  notes?: string
  isPrimary?: boolean
  accountType?: 'personal' | 'company'
}

export type ProjectCustomFieldInput = {
  label: string
  value: string
}

export type ProjectTenderStatus = 'draft' | 'submitted' | 'awarded' | 'cancelled'

export type ProjectTenderLine = {
  id: string
  kind: 'item' | 'service'
  mode?: 'simple' | 'norms'
  catalogItemId?: string | null
  name: string
  unit: string
  quantity: number
  unitPrice: number | null
  amount: number | null
  pricingSource: string
  taxSnapshot?: string | null
  needsPrice: boolean
  breakdown?: Record<string, unknown> | null
}

export type ProjectTenderRecord = {
  tenderNumber: string
  title: string
  closingDate?: string | null
  status: ProjectTenderStatus
  currency: string
  taxProfileId?: string | null
  priceStrategyOrder: string[]
  avgWindowDays: number
  preferSameProjectPrice: boolean
  totalAmount: number
  lineCount: number
  createdBy?: string | null
  createdAt?: string | null
  lastEditedBy?: string | null
  lastEditedAt?: string | null
  auditTrail?: Array<{ message: string; timestamp: string }>
  lines: ProjectTenderLine[]
}

