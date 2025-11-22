import type { InflowSource } from '../types/projects'

export const INFLOW_SOURCE_GROUPS = {
  'Client & Project Related': [
    { value: 'client-payment' as const, label: 'Client Payment' },
    { value: 'project-owner' as const, label: 'Project Owner (Employer)' },
    { value: 'advance-payment' as const, label: 'Advance Payment from Client' },
    { value: 'ra-bill-payment' as const, label: 'RA Bill Payment / Interim Payment Certificate (IPC)' },
    { value: 'variation-payment' as const, label: 'Variation Payment' },
    { value: 'mobilization-advance' as const, label: 'Mobilization Advance' },
    { value: 'retention-release' as const, label: 'Retention Release' },
    { value: 'final-bill-payment' as const, label: 'Final Bill Payment' },
  ],
  'Material & Equipment Related': [
    { value: 'material-refund' as const, label: 'Material Return Refund' },
    { value: 'scrap-sale' as const, label: 'Scrap Material Sale' },
    { value: 'equipment-rental' as const, label: 'Equipment Rental Income' },
    { value: 'equipment-refund' as const, label: 'Equipment Return Refund' },
  ],
  'Subcontractor & Vendor Related': [
    { value: 'subcontractor-refund' as const, label: 'Subcontractor Refund' },
    { value: 'supplier-refund' as const, label: 'Supplier Refund' },
    { value: 'excess-payment-return' as const, label: 'Excess Payment Return' },
    { value: 'security-deposit-return' as const, label: 'Security Deposit Return' },
  ],
  'Bank & Financial Sources': [
    { value: 'bank-deposit' as const, label: 'Bank Deposit' },
    { value: 'bank-loan' as const, label: 'Bank Loan Disbursement' },
    { value: 'overdraft-received' as const, label: 'Overdraft (OD) Received' },
    { value: 'bank-interest' as const, label: 'Bank Interest Income' },
  ],
  'Internal Sources': [
    { value: 'cash-to-bank' as const, label: 'Cash to Bank Transfer' },
    { value: 'bank-to-cash' as const, label: 'Bank to Cash Transfer' },
    { value: 'petty-cash-return' as const, label: 'Petty Cash Return' },
    { value: 'office-income' as const, label: 'Office Income' },
    { value: 'owner-investment' as const, label: 'Owner Investment' },
  ],
  'Other Income': [
    { value: 'misc-income' as const, label: 'Miscellaneous Income' },
    { value: 'penalty-compensation' as const, label: 'Penalty Compensation Received' },
    { value: 'insurance-claim' as const, label: 'Insurance Claim Received' },
    { value: 'tax-return' as const, label: 'Tax Return / VAT Refund' },
  ],
}

export const INFLOW_SOURCE_LABELS: Record<InflowSource, string> = {
  'client-payment': 'Client Payment',
  'project-owner': 'Project Owner (Employer)',
  'advance-payment': 'Advance Payment from Client',
  'ra-bill-payment': 'RA Bill Payment / IPC',
  'variation-payment': 'Variation Payment',
  'mobilization-advance': 'Mobilization Advance',
  'retention-release': 'Retention Release',
  'final-bill-payment': 'Final Bill Payment',
  'material-refund': 'Material Return Refund',
  'scrap-sale': 'Scrap Material Sale',
  'equipment-rental': 'Equipment Rental Income',
  'equipment-refund': 'Equipment Return Refund',
  'subcontractor-refund': 'Subcontractor Refund',
  'supplier-refund': 'Supplier Refund',
  'excess-payment-return': 'Excess Payment Return',
  'security-deposit-return': 'Security Deposit Return',
  'bank-deposit': 'Bank Deposit',
  'bank-loan': 'Bank Loan Disbursement',
  'overdraft-received': 'Overdraft (OD) Received',
  'bank-interest': 'Bank Interest Income',
  'cash-to-bank': 'Cash to Bank Transfer',
  'bank-to-cash': 'Bank to Cash Transfer',
  'petty-cash-return': 'Petty Cash Return',
  'office-income': 'Office Income',
  'owner-investment': 'Owner Investment',
  'misc-income': 'Miscellaneous Income',
  'penalty-compensation': 'Penalty Compensation Received',
  'insurance-claim': 'Insurance Claim Received',
  'tax-return': 'Tax Return / VAT Refund',
}

export function getInflowSourceLabel(source?: InflowSource | string): string {
  if (!source) return 'Not specified'
  return INFLOW_SOURCE_LABELS[source as InflowSource] || (source as string) || 'Not specified'
}

export function getAllInflowSources() {
  return Object.values(INFLOW_SOURCE_GROUPS).flat()
}
