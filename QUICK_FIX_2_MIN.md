# ⚡ QUICK FIX - 2 Minutes to Success

## The Problem
```
❌ Error: Could not find the 'inflowSource' column
```
When clicking "Add Transaction" with Direction = "Inflow"

---

## The Solution (2 Steps)

### Step 1: Supabase (90 seconds)

**URL**: https://app.supabase.com → SQL Editor → New Query

**Paste & Run**:
```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS inflow_source TEXT;
ALTER TABLE transactions ADD CONSTRAINT check_inflow_source_values CHECK (inflow_source IS NULL OR inflow_source IN ('client-payment','project-owner','advance-payment','ra-bill-payment','variation-payment','mobilization-advance','retention-release','final-bill-payment','material-refund','scrap-sale','equipment-rental','equipment-refund','subcontractor-refund','supplier-refund','excess-payment-return','security-deposit-return','bank-deposit','bank-loan','overdraft-received','bank-interest','cash-to-bank','bank-to-cash','petty-cash-return','office-income','owner-investment','misc-income','penalty-compensation','insurance-claim','tax-return'));
CREATE INDEX IF NOT EXISTS idx_tx_inflow_source ON transactions(owner, inflow_source) WHERE inflow_source IS NOT NULL;
```

**Wait for**: ✅ Success

---

### Step 2: Your App (30 seconds)

```bash
npm run build
```

**Wait for**: Built successfully

---

## Test It! (30 seconds)

1. Go to `/transactions`
2. Click "Add Transaction"
3. Direction = "Inflow"
4. Select "Inflow Source"
5. Fill fields and click "Add Transaction"
6. ✅ Success!

---

## That's It!

**Total time**: ~2 minutes
**Errors after**: 0
**Feature**: ✅ Working!

---

## If It Still Doesn't Work

### Check 1
```bash
npm run build 2>&1 | Select-String "error"
```
Should show no errors.

### Check 2
Browser F12 Console - any red errors?

### Check 3
In Supabase, run:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'transactions' AND column_name = 'inflow_source';
```
Should return: `inflow_source`

---

## Documentation

- `INFLOW_SOURCE_ERROR_FIXED.md` - Full details
- `FIX_INFLOW_SOURCE_ERROR.md` - Detailed guide
- `SUPABASE_FIX_INSTRUCTIONS.md` - Supabase help

---

## Code Changed

**File**: `src/features/transactions/TransactionForm.tsx`

Added field name mapping:
```typescript
const { sub_category_id: _ignoredSubCategory, inflowSource, ...rest } = values
const payload = {
  ...rest,
  inflow_source: inflowSource ?? null,  // ← Fix!
}
```

---

**Done!** 🚀
