# ✅ Fix: "Could not find 'inflowSource' column" Error

## Problem
```
Error: Could not find the 'inflowSource' column of 'transactions' in the schema cache
```

This error occurs because the `inflow_source` column hasn't been created in your Supabase database yet.

---

## Solution: Run This SQL in Supabase

### Step 1: Go to Supabase Dashboard
1. Open https://app.supabase.com
2. Select your project
3. Go to **SQL Editor**

### Step 2: Create New Query
Click **New Query** and paste this SQL:

```sql
-- Add inflow_source column if it doesn't exist
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS inflow_source TEXT;

-- Add check constraint for valid values
ALTER TABLE transactions ADD CONSTRAINT check_inflow_source_values 
  CHECK (inflow_source IS NULL OR inflow_source IN (
    'client-payment',
    'project-owner',
    'advance-payment',
    'ra-bill-payment',
    'variation-payment',
    'mobilization-advance',
    'retention-release',
    'final-bill-payment',
    'material-refund',
    'scrap-sale',
    'equipment-rental',
    'equipment-refund',
    'subcontractor-refund',
    'supplier-refund',
    'excess-payment-return',
    'security-deposit-return',
    'bank-deposit',
    'bank-loan',
    'overdraft-received',
    'bank-interest',
    'cash-to-bank',
    'bank-to-cash',
    'petty-cash-return',
    'office-income',
    'owner-investment',
    'misc-income',
    'penalty-compensation',
    'insurance-claim',
    'tax-return'
  ));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tx_inflow_source ON transactions(owner, inflow_source) 
WHERE inflow_source IS NOT NULL;

-- Add comment
COMMENT ON COLUMN transactions.inflow_source IS 'Type of inflow source for payment-in transactions';
```

### Step 3: Click "Run"
- Wait for success message
- You should see: ✓ Success. No rows returned

### Step 4: Verify Column Added
Run this query to confirm:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
  AND column_name = 'inflow_source';
```

Expected result:
```
column_name    | data_type
---------------|-----------
inflow_source  | text
```

---

## If You Get Constraint Error

If you see: `Constraint "check_inflow_source_values" already exists`

Run this to remove it first:

```sql
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_inflow_source_values;
```

Then run the full SQL again.

---

## ⚡ Quick Fix (If Column Exists But Schema Cache Not Updated)

Sometimes Supabase caches the schema. Try this:

1. **In Supabase:** Click the **Refresh** button in SQL Editor
2. **In Your App:** 
   ```bash
   npm run build
   ```
3. **Restart Your App** if running locally

---

## 🔍 Troubleshooting

### Error: "Column already exists"
→ This is OK! The migration already ran. Just continue.

### Error: "Constraint already exists"  
→ Drop it first:
```sql
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_inflow_source_values;
```
Then run the full SQL.

### Still Getting Error After Migration?
1. Verify column exists:
```sql
\d transactions
```
Look for `inflow_source` in the output.

2. If column is there but error persists:
   - Stop your app
   - Run: `npm run build`
   - Restart the app
   - Try again

3. Check if TypeScript compiled:
```bash
npm run build 2>&1 | grep -i error
```

---

## ✅ Verification Checklist

After running the SQL:

- [ ] Ran SQL in Supabase SQL Editor
- [ ] Got "Success" message
- [ ] Ran verify query and saw `inflow_source | text`
- [ ] Refreshed browser
- [ ] Ran `npm run build`
- [ ] Restarted app
- [ ] Test: Create a transaction with direction="inflow"
- [ ] Check: Inflow Source dropdown appears
- [ ] Check: Can select a value
- [ ] Check: Saves without error

---

## 📝 Complete Migration SQL (If Starting Fresh)

If you need to create the entire transactions table from scratch:

```sql
-- Create transactions table with inflow_source
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  qty NUMERIC(14,3),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out', 'transfer')),
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'work')),
  mode TEXT,
  category_id UUID REFERENCES categories(id),
  party_id UUID REFERENCES parties(id),
  inflow_source TEXT CHECK (inflow_source IS NULL OR inflow_source IN (
    'client-payment', 'project-owner', 'advance-payment', 'ra-bill-payment',
    'variation-payment', 'mobilization-advance', 'retention-release', 'final-bill-payment',
    'material-refund', 'scrap-sale', 'equipment-rental', 'equipment-refund',
    'subcontractor-refund', 'supplier-refund', 'excess-payment-return', 'security-deposit-return',
    'bank-deposit', 'bank-loan', 'overdraft-received', 'bank-interest',
    'cash-to-bank', 'bank-to-cash', 'petty-cash-return', 'office-income', 'owner-investment',
    'misc-income', 'penalty-compensation', 'insurance-claim', 'tax-return'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  owner UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tx_owner_date ON transactions(owner, date);
CREATE INDEX IF NOT EXISTS idx_tx_owner_category ON transactions(owner, category_id);
CREATE INDEX IF NOT EXISTS idx_tx_owner_party ON transactions(owner, party_id);
CREATE INDEX IF NOT EXISTS idx_tx_owner_account ON transactions(owner, account_id);
CREATE INDEX IF NOT EXISTS idx_tx_inflow_source ON transactions(owner, inflow_source) 
WHERE inflow_source IS NOT NULL;

-- RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY sel_transactions_own ON transactions FOR SELECT USING (owner = auth.uid());
CREATE POLICY ins_transactions_own ON transactions FOR INSERT WITH CHECK (owner = auth.uid());
CREATE POLICY upd_transactions_own ON transactions FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
CREATE POLICY del_transactions_own ON transactions FOR DELETE USING (owner = auth.uid());
```

---

## 🚀 After Fix

Once the column is created and working:

1. ✅ Column exists in database
2. ✅ Constraint ensures valid values
3. ✅ Index optimizes queries
4. ✅ TypeScript knows about the field
5. ✅ Form shows dropdown
6. ✅ Dialog displays correctly
7. ✅ Error is gone! 🎉

---

## 📞 Still Having Issues?

Try this step-by-step:

### 1. Clear Everything
```bash
# Delete build
rm -r dist

# Delete node_modules (if needed)
rm -r node_modules

# Reinstall
npm install
```

### 2. Rebuild
```bash
npm run build
```

### 3. Restart App
- Stop your dev server (Ctrl+C)
- Start again: `npm run dev`

### 4. Hard Refresh Browser
- Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)
- Or open in private/incognito mode

### 5. Test Again
- Go to `/transactions`
- Create inflow
- Should see dropdown now! ✅

---

## ✨ Success! 

The error should now be fixed and you can use the Inflow Source feature! 🎉

**Still stuck?** Check the logs:
```bash
npm run dev 2>&1 | grep -i error
```
