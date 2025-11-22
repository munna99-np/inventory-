# Construction Project Inflow Source - Quick Reference

## Feature Summary
Inflow Source tracking for project payment-in transactions, displayed in:
- ✅ Payment form (dropdown selection)
- ✅ Project detail page (latest 5 payments table)
- ✅ Project statement (all transactions table)
- ✅ PDF exports (included in report)

## User Flows

### Recording a Payment with Source
```
Project Card
  ↓ Click "Payment in" Quick Action
    ↓ Fill: Amount, Account, Date, Counterparty
      ↓ Select "Inflow Source" dropdown (28 options)
        ↓ Submit form
          ↓ Source appears in "Latest Payments In" section
```

### Viewing Sources
```
Project Detail Page
  ├─ "Latest payments in" card
  │  └─ Shows up to 5 recent payment-in with source badge
  │
  └─ Click "Statement" button
     └─ Project Statement
        └─ "Source" column shows badge for each payment-in
           └─ Export to PDF includes all source data
```

## 28 Available Inflow Sources

| Client Payments | Financing | Owner Contributions |
|---|---|---|
| Client Payment | Bank Loan | Owner Capital |
| Client Advance | Owner Loan | Owner Draw Return |
| Client Refund | Equipment Financing | Owner Investment |

| Insurance & Claims | Other Construction | Other |
|---|---|---|
| Insurance Claim | Subcontractor Return | Interest Income |
| Insurance Recovery | Supplier Return | Other Income |
| Work Warranty Claim | Material Salvage | |

## Technical Details

### Files Modified
| File | Changes |
|------|---------|
| `src/routes/ConstructionProjectDetailPage.tsx` | Added Latest Payments section |
| `src/routes/ConstructionProjectStatementPage.tsx` | Added Source column to table + PDF |

### Shared Resources
- **Function**: `getInflowSourceLabel()` - Converts source code to label
- **Data**: `INFLOW_SOURCE_GROUPS` - 28 categorized options
- **Type**: `InflowSource` - Union of all 28 values

### Color Scheme
```
Source Badge: Cyan
├─ Background: rgb(240, 253, 250)  [cyan-50]
├─ Text:       rgb(34, 197, 194)   [cyan-700]
└─ Style:      0.375rem rounded, 0.75rem font, 500 weight
```

## Display Examples

### Latest Payments Table (Project Detail)
```
Date       | Account      | Amount   | Source        | Counterparty | Notes
-----------|--------------|----------|---------------|--------------|-------
2024-01-15 | Main Account | NPR 5,00,000 | [Client Payment] | ABC Corp | Advance
2024-01-10 | Site Account | NPR 2,00,000 | [Bank Loan]      | XYZ Bank | Q1
```

### Statement Table (Project Statement)
```
Date       | Type      | Amount | Account | Details | Source      | Notes
-----------|-----------|--------|---------|---------|-------------|------
2024-01-15 | Payment In | +5L    | Main    | ABC Corp| [Client Pmt]| Advance
2024-01-10 | Payment In | +2L    | Site    | XYZ Bank| [Bank Loan] | Q1
2024-01-05 | Payment Out| -50K   | Main    | Vendor  | [Expense]   | —
```

### PDF Export
Includes source column in "Detailed Transactions" table.

## Testing Quick Checks
- [ ] Form: Dropdown shows all 28 options in 6 groups
- [ ] Form: Selection saves with submit
- [ ] Detail: Latest table shows up to 5 payments
- [ ] Detail: Source badge displays with cyan color
- [ ] Statement: Source column visible after Details
- [ ] Statement: Cyan badge for payment-in sources
- [ ] Statement: "--" shown for payment-out/transfer
- [ ] PDF: Export includes source column
- [ ] Build: `npm run build` completes successfully

## Styling Reference

### Badge Component
```tsx
<span className="inline-block rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700">
  {getInflowSourceLabel(flow.inflowSource)}
</span>
```

### Table Header
```tsx
<th className="px-3 py-2 font-medium">Source</th>
```

### Conditional Display
```tsx
{flow.type === 'payment-in' && flow.inflowSource ? (
  <span className="... bg-cyan-50 ...">
    {getInflowSourceLabel(flow.inflowSource)}
  </span>
) : (
  <span>--</span>
)}
```

## Build Status
- **Build Time**: ~1m 35s
- **Errors**: 0
- **Warnings**: 0
- **Status**: ✅ PASSING

## Related Features (Implemented Previously)
- ✅ Transaction inflow source (same 28 sources)
- ✅ Account management source display
- ✅ Payment form source selection
- ✅ Activity stream source badges

## Future Ideas (Not Implemented)
- Filter statement by source
- Source-based analytics/charts
- Source templates per project
- Source requirement rules
- Inflow trend analysis

---

**Last Updated**: 2024 | **Status**: ✅ Complete
