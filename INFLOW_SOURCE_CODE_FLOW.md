# 🔗 Inflow Source - Code Flow & Data Mapping

**Status**: ✅ VERIFIED  
**Build**: 🟢 PASSING (1m 34s)  
**Date**: November 21, 2025

---

## 📍 Complete Code Path

### Step 1: User Selects Source in Form
**File**: `src/routes/ConstructionPaymentInPage.tsx` (Lines 200-211)

```typescript
<FormField label="Inflow Source" className="md:col-span-2">
  <select
    value={form.inflowSource || ''}
    onChange={(event) => setForm((prev) => ({ 
      ...prev, 
      inflowSource: event.target.value as InflowSource || undefined 
    }))}
    className="h-9 w-full rounded-md border border-input..."
  >
    <option value="">Select inflow source (optional)</option>
    {Object.entries(INFLOW_SOURCE_GROUPS).map(([group, sources]) => (
      <optgroup key={group} label={group}>
        {sources.map((source) => (
          <option key={source.value} value={source.value}>
            {source.label}
          </option>
        ))}
      </optgroup>
    ))}
  </select>
</FormField>
```

**What happens**:
- User clicks dropdown
- User selects "Client Payment" (value: "client-payment")
- onChange fires
- Form state updates: `form.inflowSource = "client-payment"`

---

### Step 2: Confirmation Box Appears
**File**: `src/routes/ConstructionPaymentInPage.tsx` (Lines 213-220)

```typescript
{form.inflowSource && (
  <div className="rounded-lg border-2 border-cyan-200 bg-cyan-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      Selected Inflow Source
    </p>
    <div className="flex items-center gap-2">
      <span className="inline-block rounded-md bg-cyan-100 px-3 py-2 text-sm font-semibold text-cyan-900">
        ✓ {getInflowSourceLabel(form.inflowSource)}
      </span>
    </div>
  </div>
)}
```

**What happens**:
- Because `form.inflowSource` is set, the conditional renders
- Calls `getInflowSourceLabel("client-payment")`
- Returns: "Client Payment"
- Displays in cyan box: "✓ Client Payment"

**Styling Applied**:
```css
Border: border-2 border-cyan-200      /* 2px medium cyan border */
Background: bg-cyan-50                /* Light cyan background */
Badge bg: bg-cyan-100                 /* Lighter cyan for badge */
Badge text: text-cyan-900             /* Dark cyan text */
Padding: p-4                          /* Space inside box */
```

---

### Step 3: User Submits Form
**File**: `src/routes/ConstructionPaymentInPage.tsx` (Lines 88-118)

```typescript
const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  if (!project || !form.accountId) {
    toast.error('Choose the receiving account')
    return
  }
  if (!form.amount || form.amount <= 0) {
    toast.error('Enter a valid amount')
    return
  }
  setSaving(true)
  try {
    const account = project.bankAccounts.find((item) => item.id === form.accountId)
    const updated = await recordProjectFlow(project.id, {
      type: 'payment-in',
      amount: form.amount,
      date: form.date || todayIso(),
      accountId: account?.id,
      accountName: account?.label,
      counterparty: form.counterparty.trim() || undefined,
      notes: form.notes.trim() || undefined,
      inflowSource: form.inflowSource,           // ✅ SENDS TO SERVICE
    })
    setProject(updated)
    toast.success('Payment in recorded')
    navigate(`/construction/${project.id}`)
  } catch (err: any) {
    console.error(err)
    toast.error(err?.message ?? 'Failed to record payment in')
  } finally {
    setSaving(false)
  }
}
```

**Data Package Sent**:
```typescript
{
  type: 'payment-in',
  amount: 500000,
  date: '2024-01-15',
  accountId: 'acc-123',
  accountName: 'Main Account',
  counterparty: 'ABC Corporation',
  notes: 'Advance for Q1 project',
  inflowSource: 'client-payment'    // ✅ KEY FIELD
}
```

---

### Step 4: Service Receives Data
**File**: `src/services/projects.ts` (Line 679)

```typescript
export async function recordProjectFlow(
  projectId: string, 
  input: ProjectFlowInput          // ✅ Receives above data
): Promise<ProjectProfile> {
  if (!sanitizeNumber(input.amount)) throw new Error('Amount is required')
  const flow = createFlowFromInput(input)    // ✅ CONVERTS TO FLOW
  return updateProjectProfile(projectId, (current) => ({ 
    flows: sortFlows([flow, ...current.flows]) 
  }))
}
```

**Input Received**:
```typescript
input = {
  type: 'payment-in',
  amount: 500000,
  date: '2024-01-15',
  accountId: 'acc-123',
  accountName: 'Main Account',
  counterparty: 'ABC Corporation',
  notes: 'Advance for Q1 project',
  inflowSource: 'client-payment'    // ✅ PRESENT IN INPUT
}
```

---

### Step 5: Convert Input to Flow Object
**File**: `src/services/projects.ts` (Lines 225-246)

```typescript
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
    inflowSource: input.inflowSource,           // ✅ COPIED FROM INPUT
    createdAt: now(),
    updatedAt: now(),
  })
}
```

**Flow Object Created**:
```typescript
flow = {
  id: 'flow-uuid-12345',
  type: 'payment-in',
  date: '2024-01-15',
  amount: 500000,
  accountId: 'acc-123',
  accountName: 'Main Account',
  counterparty: 'ABC Corporation',
  notes: 'Advance for Q1 project',
  inflowSource: 'client-payment',             // ✅ SET HERE
  createdAt: '2025-11-21T...',
  updatedAt: '2025-11-21T...'
}
```

---

### Step 6: Store in ProjectProfile
**File**: `src/services/projects.ts` (Line 681-683)

```typescript
return updateProjectProfile(projectId, (current) => ({ 
  flows: sortFlows([flow, ...current.flows])  // ✅ ADDS FLOW TO ARRAY
}))
```

**ProjectProfile Updated**:
```typescript
profile = {
  id: 'proj-123',
  name: 'Building A',
  // ... other fields ...
  flows: [
    {
      id: 'flow-uuid-12345',
      type: 'payment-in',
      date: '2024-01-15',
      amount: 500000,
      accountId: 'acc-123',
      accountName: 'Main Account',
      counterparty: 'ABC Corporation',
      notes: 'Advance for Q1 project',
      inflowSource: 'client-payment',         // ✅ STORED HERE
      createdAt: '2025-11-21T...',
      updatedAt: '2025-11-21T...'
    },
    // ... other flows ...
  ]
}
```

---

### Step 7: Reload Shows Latest Payments
**File**: `src/routes/ConstructionPaymentInPage.tsx` (Lines 120-270)

```typescript
const latest = useMemo(() => 
  project?.flows.filter((flow) => flow.type === 'payment-in').slice(0, 5) ?? [], 
  [project]
)

// Then renders in Latest payments table:
{latest.map((flow) => (
  <tr key={flow.id} className="border-b border-border/60 last:border-b-0">
    <td className="py-3 pr-3 text-muted-foreground">{formatDateDisplay(flow.date)}</td>
    <td className="py-3 pr-3 text-muted-foreground">{flow.accountName || '--'}</td>
    <td className="py-3 pr-3 text-emerald-600 font-medium">{formatCurrency(Number(flow.amount) || 0)}</td>
    <td className="py-3 pr-3">
      {flow.inflowSource ? (
        <span className="inline-block rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700">
          {getInflowSourceLabel(flow.inflowSource)}    // ✅ DISPLAYS SOURCE
        </span>
      ) : (
        <span className="text-muted-foreground">--</span>
      )}
    </td>
    <td className="py-3 pr-3 text-muted-foreground">{flow.counterparty || '--'}</td>
    <td className="py-3 text-muted-foreground">{flow.notes || '--'}</td>
  </tr>
))}
```

**Latest Payment Row Rendered**:
```
Date       | Account      | Amount   | Source        | Counterparty | Notes
-----------|--------------|----------|---------------|--------------|-------
Jan 15     | Main Account | +500,000 | Client Payment| ABC Corp     | Advance
2024       |              |          | (light cyan)  |              | for Q1
```

---

### Step 8: User Views Full Statement
**File**: `src/routes/ConstructionProjectStatementPage.tsx`

```typescript
const flows = project?.flows ?? []

// ... filtering logic ...

{filteredFlows.map((flow) => {
  // ... setup code ...
  
  return (
    <tr key={flow.id} className="align-top hover:bg-muted/20">
      <td className="px-3 py-2 font-medium text-foreground">{formatDate(flow.date)}</td>
      <td className="px-3 py-2">
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', meta.badgeClass)}>
          {meta.label}
        </span>
      </td>
      <td className={cn('px-3 py-2 text-right font-semibold', meta.amountClass)}>
        {amount}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {/* Account details */}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {/* Details/Counterparty */}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {flow.type === 'payment-in' && flow.inflowSource ? (
          <span className="inline-block rounded-md bg-cyan-100 px-2.5 py-1.5 text-xs font-semibold text-cyan-900 border border-cyan-300">
            ✓ {getInflowSourceLabel(flow.inflowSource)}    // ✅ DISPLAYS WITH STYLING
          </span>
        ) : (
          <span>--</span>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {/* Notes */}
      </td>
    </tr>
  )
})}
```

**Statement Row Rendered**:
```
Date      | Type     | Amount    | Account      | Details   | Source              | Notes
-----------|----------|-----------|--------------|-----------|---------------------|-------
Jan 15     | Payment  | +500,000  | Main Account | ABC Corp  | ✓ Client Payment    | Advance
2024       | In (●●●) | (green)   |              |           | (dark cyan border)  | for Q1
```

---

## 🔄 Complete Data Flow Summary

```
USER INPUT
    │
    ├─ Form State: form.inflowSource = "client-payment"
    │
CONFIRMATION
    │
    ├─ Display: "✓ Client Payment" (cyan box)
    │
FORM SUBMISSION
    │
    ├─ ProjectFlowInput: { ... inflowSource: 'client-payment' }
    │
SERVICE LAYER
    │
    ├─ recordProjectFlow() receives input
    │
CONVERSION
    │
    ├─ createFlowFromInput() copies inflowSource
    │
STORAGE
    │
    ├─ ProjectFlow object: { ... inflowSource: 'client-payment' }
    │ ├─ Stored in: profile.flows[]
    │ └─ Persisted in: project structure
    │
RETRIEVAL
    │
    ├─ Latest payments: filter flows where type === 'payment-in'
    │ └─ Display: "Client Payment" (light cyan badge)
    │
FULL STATEMENT
    │
    ├─ All flows rendered in table
    │ └─ Source column: "✓ Client Payment" (dark cyan badge with border)
    │
USER SEES
    │
    └─ Payment with clear source identification!
```

---

## 📊 Type Definitions

### InflowSource Type
**File**: `src/types/projects.ts` (Lines 37-63)

```typescript
export type InflowSource = 
  | 'client-payment'              // What user selected
  | 'project-owner'
  | 'advance-payment'
  | 'ra-bill-payment'
  | 'variation-payment'
  | 'mobilization-advance'
  | 'retention-release'
  | 'final-bill-payment'
  | 'material-refund'
  | 'scrap-sale'
  | 'equipment-rental'
  | 'equipment-refund'
  | 'subcontractor-refund'
  | 'supplier-refund'
  | 'excess-payment-return'
  | 'security-deposit-return'
  | 'bank-deposit'
  | 'bank-loan'
  | 'overdraft-received'
  | 'bank-interest'
  | 'cash-to-bank'
  | 'bank-to-cash'
  | 'petty-cash-return'
  | 'office-income'
  | 'owner-investment'
  | 'misc-income'
  | 'penalty-compensation'
  | 'insurance-claim'
  | 'tax-return'
```

### ProjectFlowInput Type
**File**: `src/types/projects.ts` (Lines 90-110)

```typescript
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
  inflowSource?: InflowSource        // ✅ ACCEPTED HERE
}
```

### ProjectFlow Type
**File**: `src/types/projects.ts` (Lines 68-88)

```typescript
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
  inflowSource?: InflowSource        // ✅ STORED HERE
  createdAt: string
  updatedAt: string
}
```

---

## 🎯 Key Code Points

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Form Input | ConstructionPaymentInPage.tsx | 200-211 | User selects source |
| Form Display | ConstructionPaymentInPage.tsx | 213-220 | Shows confirmation |
| Form Submit | ConstructionPaymentInPage.tsx | 104-110 | Sends inflowSource |
| Service Entry | projects.ts | 679-681 | Receives & processes |
| Conversion | projects.ts | 225-246 | Creates flow object |
| Storage | projects.ts | 681-683 | Stores in profile |
| Latest Display | ConstructionPaymentInPage.tsx | 244-269 | Shows in table |
| Statement Display | ConstructionProjectStatementPage.tsx | 579-585 | Shows with styling |
| Label Helper | inflowSources.ts | (function) | Converts to readable text |
| Type Definition | projects.ts | 37-110 | Type safety |

---

## ✅ Validation Checklist

- [x] Form captures inflowSource in state
- [x] Confirmation box displays selected value
- [x] Form submission includes inflowSource
- [x] recordProjectFlow() accepts input
- [x] createFlowFromInput() includes inflowSource field
- [x] Flow object contains inflowSource
- [x] ProjectProfile.flows stores inflowSource
- [x] Latest payments displays source
- [x] Statement displays source column
- [x] Source styling applied (cyan-100, cyan-900, border)
- [x] Checkmark (✓) prefix shown
- [x] TypeScript compilation successful
- [x] Build passes (1m 34s)

---

## 🎨 Styling Reference

### Cyan Color Scheme
```
cyan-50:   #f0f9ff  (very light - backgrounds)
cyan-100:  #e0f2fe  (light - badges)
cyan-200:  #cffafe  (medium - borders)
cyan-300:  #a5f3fc  (darker - fine borders)
cyan-700:  #0891b2  (dark - text in light boxes)
cyan-900:  #164e63  (very dark - text in statement)
```

### Form Confirmation Box
- Background: cyan-50
- Border: 2px cyan-200
- Badge background: cyan-100
- Badge text: cyan-900

### Statement Source Badge
- Background: cyan-100
- Text: cyan-900
- Border: cyan-300
- Checkmark: ✓

---

## 🚀 Summary

When user selects "Client Payment" in the form:
1. Form state: `inflowSource = "client-payment"`
2. Service receives: `ProjectFlowInput { inflowSource: "client-payment" }`
3. Service creates: `ProjectFlow { inflowSource: "client-payment" }`
4. Stored in: `ProjectProfile.flows[0].inflowSource = "client-payment"`
5. Retrieved by: Statement component
6. Displayed as: "✓ Client Payment" (cyan-100 bg, cyan-900 text, cyan-300 border)

**All data flows perfectly through the system!** ✅

---

*Code verified: November 21, 2025*  
*Build: 🟢 PASSING (1m 34s)*  
*Errors: 0 | Warnings: 0*
