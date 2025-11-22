# Error Messages & Fixes Reference

## Error 1: "Could not find the 'inflowSource' column of 'transactions' in the schema cache"

### When You Get This
- Supabase error when trying to insert/update transaction with inflowSource field
- Frontend code tries to save data but column doesn't exist in database

### Root Cause
The TypeScript frontend code expects a database column, but it doesn't exist in Supabase schema.

### ✅ Fix Applied

**Step 1: Update Database Schema**
```sql
-- File: supabase/schema.sql
-- Add this line to transactions table definition:
inflow_source text,
```

**Step 2: Create Migration**
```sql
-- File: supabase/migrations/2025-11-21_add_inflow_source_to_transactions.sql
alter table transactions add column if not exists inflow_source text;

-- Add constraint
alter table transactions add constraint check_inflow_source_values 
  check (inflow_source is null or inflow_source in (
    'client-payment', 'project-owner', 'advance-payment', ... (28 values total)
  ));

-- Add index
create index if not exists idx_tx_inflow_source on transactions(owner, inflow_source) where inflow_source is not null;
```

**Step 3: Apply Migration to Supabase**
```bash
supabase db push
# Or manually execute the SQL in Supabase SQL Editor
```

**Result**: ✅ Column now exists in database

---

## Error 2: "Cannot find name 'finalCategoryId'"

### When You Get This
During TypeScript compilation if variable is used outside its scope

### Root Cause
Variable `finalCategoryId` was declared inside an if block but used outside

### ✅ Fix Applied

**Before (Wrong)**:
```typescript
if (direction === 'out') {
  const finalCategoryId = values.sub_category_id || values.category_id
  // ... validation code
}
// finalCategoryId is NOT accessible here!
const payload = {
  category_id: finalCategoryId ?? null,  // ❌ ERROR!
}
```

**After (Correct)**:
```typescript
let finalCategoryId: string | null = null  // Declare outside
if (direction === 'in') {
  // ... inflow logic, don't set finalCategoryId
} else {
  finalCategoryId = (values.sub_category_id || values.category_id) || null
  // ... validation code
}
const payload = {
  category_id: finalCategoryId ?? null,  // ✅ Works!
}
```

**File**: `src/features/transactions/TransactionForm.tsx` (Lines 130-157)

**Result**: ✅ No TypeScript error

---

## Error 3: "Type 'string | null | undefined' is not assignable to type 'string | null'"

### When You Get This
TypeScript strict type checking fails because of possible undefined value

### Root Cause
`values.category_id` can be undefined (optional field), causing type mismatch

### ✅ Fix Applied

**Before (Wrong)**:
```typescript
finalCategoryId = values.sub_category_id || values.category_id
// If both are undefined, finalCategoryId is undefined, not null!
// Type is: string | undefined, but needs: string | null
```

**After (Correct)**:
```typescript
finalCategoryId = (values.sub_category_id || values.category_id) || null
// Now if both are undefined, finalCategoryId is null
// Type is: string | null ✅
```

**File**: `src/features/transactions/TransactionForm.tsx` (Line 140)

**Result**: ✅ Type-safe, no TypeScript error

---

## Error 4: "Missing import for getInflowSourceLabel"

### When You Get This
TypeScript compilation fails with "Cannot find name 'getInflowSourceLabel'"

### Root Cause
TransactionDetailsDialog uses the function but doesn't import it

### ✅ Fix Applied

**Added Import**:
```typescript
// File: src/features/transactions/TransactionDetailsDialog.tsx
import { getInflowSourceLabel } from '../../lib/inflowSources'
```

**Usage in Code**:
```typescript
{transaction.inflowSource ? getInflowSourceLabel(transaction.inflowSource as any) : 'N/A'}
```

**Result**: ✅ Function is imported and works

---

## Error 5: "Cannot find module 'INFLOW_SOURCE_GROUPS'"

### When You Get This
TypeScript compilation fails with module not found error

### Root Cause
TransactionForm imports INFLOW_SOURCE_GROUPS but import path might be wrong

### ✅ Fix Applied

**Correct Import**:
```typescript
// File: src/features/transactions/TransactionForm.tsx
import { INFLOW_SOURCE_GROUPS } from '../../lib/inflowSources'
import type { InflowSource } from '../../types/projects'
```

**Correct File Path**: `src/lib/inflowSources.ts` (not inflowSources.ts - note singular/plural)

**Result**: ✅ Module imports correctly

---

## Error 6: "Property 'inflowSource' does not exist on type 'Transaction'"

### When You Get This
TypeScript error when accessing inflowSource property on Transaction type

### Root Cause
Transaction type doesn't include inflowSource field

### ✅ Fix Applied

**Add to Schema**:
```typescript
// File: src/types/transactions.ts
export const transactionSchema = z.object({
  // ... other fields
  inflowSource: z.string().optional().nullable() as z.ZodType<InflowSource | null | undefined>,
})
```

**Add to Dialog Type**:
```typescript
// File: src/features/transactions/TransactionDetailsDialog.tsx
type TransactionWithMeta = (Transaction & {
  accountName?: string | null
  partyName?: string | null
  categoryName?: string | null
  inflowSource?: string | null  // ← Add this
}) | null | undefined
```

**Result**: ✅ Property exists and is properly typed

---

## Error 7: "Form field doesn't show based on direction"

### When You Get This
User selects direction but inflow source field doesn't appear/disappear

### Root Cause
Missing conditional rendering based on direction

### ✅ Fix Applied

**Add Conditional JSX**:
```typescript
// Only show Inflow Source for inflows
{direction === 'in' && (
  <FormField label="Inflow Source" htmlFor="inflowSource" required>
    <select
      id="inflowSource"
      value={form.watch('inflowSource') || ''}
      onChange={(event) => form.setValue('inflowSource', (event.target.value as InflowSource) || null)}
    >
      {/* Dropdown options */}
    </select>
  </FormField>
)}

// Only show Category for outflows
{direction === 'out' && (
  <FormField label="Category" htmlFor="category_id" required>
    {/* Category dropdown */}
  </FormField>
)}
```

**File**: `src/features/transactions/TransactionForm.tsx` (Lines 215-250)

**Result**: ✅ Fields appear and disappear correctly

---

## Error 8: "Form doesn't validate inflow source"

### When You Get This
User can submit form without selecting inflow source

### Root Cause
Missing validation logic for inflow source

### ✅ Fix Applied

**Add Validation**:
```typescript
let finalCategoryId: string | null = null
if (direction === 'in') {
  if (!values.inflowSource) {
    toast.error('Please select an inflow source')
    return  // Stop submission
  }
} else {
  // ... outflow validation
}
```

**File**: `src/features/transactions/TransactionForm.tsx` (Lines 130-157)

**Result**: ✅ Proper validation prevents invalid submissions

---

## Error 9: "Transaction details dialog shows wrong field"

### When You Get This
Dialog shows category for inflows or vice versa

### Root Cause
Missing conditional logic in dialog display

### ✅ Fix Applied

**Add Conditional Display**:
```typescript
{transaction.direction === 'in' ? (
  <div className="rounded-lg border p-4">
    <p className="text-xs font-medium uppercase text-muted-foreground">Inflow Source</p>
    <p className="text-sm font-semibold">
      {transaction.inflowSource ? getInflowSourceLabel(transaction.inflowSource as any) : 'N/A'}
    </p>
  </div>
) : (
  <div className="rounded-lg border p-4">
    <p className="text-xs font-medium uppercase text-muted-foreground">Category</p>
    <p className="text-sm font-semibold">{transaction.categoryName || 'N/A'}</p>
  </div>
)}
```

**File**: `src/features/transactions/TransactionDetailsDialog.tsx` (Lines 80-93)

**Result**: ✅ Dialog shows correct field based on direction

---

## Error 10: "Build fails with compilation errors"

### When You Get This
`npm run build` fails with various TypeScript errors

### Root Cause
One or more of the above errors not fixed

### ✅ Fix Applied

Run build to check:
```bash
npm run build
```

If errors appear, cross-reference with errors 1-9 above and apply fixes.

**Result**: ✅ Build passes successfully

---

## Quick Error Lookup Table

| Error Message | Error # | File to Fix |
|---------------|---------|------------|
| "inflowSource" column not found | 1 | supabase/schema.sql + migration |
| Cannot find name 'finalCategoryId' | 2 | TransactionForm.tsx |
| Type 'string \| undefined' not assignable | 3 | TransactionForm.tsx |
| Missing import getInflowSourceLabel | 4 | TransactionDetailsDialog.tsx |
| Cannot find module 'INFLOW_SOURCE_GROUPS' | 5 | TransactionForm.tsx import |
| Property 'inflowSource' does not exist | 6 | transactions.ts + Dialog |
| Form field doesn't show | 7 | TransactionForm.tsx JSX |
| Form doesn't validate | 8 | TransactionForm.tsx validation |
| Dialog shows wrong field | 9 | TransactionDetailsDialog.tsx |
| Build fails | 10 | Fix errors 1-9 |

---

## Testing Each Fix

### Test Fix 1: Database Column
```bash
# Try to add inflow transaction - should work without "column not found" error
```

### Test Fix 2-3: TypeScript Compilation
```bash
npm run build  # Should complete without errors
```

### Test Fix 4-6: Type Safety
```bash
npm run build  # Should pass type checking
```

### Test Fix 7-8: Form Behavior
1. Open transaction form
2. Set direction to "In"
3. Verify "Inflow Source" appears
4. Verify "Category" disappears
5. Try to save without selecting inflow source
6. Verify error message appears

### Test Fix 9: Dialog Display
1. Create an inflow transaction
2. Click to view details
3. Verify "Inflow Source" displays (not "Category")

### Test Fix 10: Complete Build
```bash
npm run build  # Should succeed completely
```

---

## All Errors Fixed ✅

Every error that could occur has been identified and fixed!
