-- Add inflowSource column to transactions table
-- This column stores the inflow source type for payment-in transactions

alter table transactions add column if not exists inflow_source text;

-- Add check constraint to ensure valid inflow source values
alter table transactions add constraint check_inflow_source_values 
  check (inflow_source is null or inflow_source in (
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

-- Add index on inflow_source for query performance
create index if not exists idx_tx_inflow_source on transactions(owner, inflow_source) where inflow_source is not null;

-- Add comment
comment on column transactions.inflow_source is 'Type of inflow source for payment-in transactions (e.g., client-payment, bank-deposit, owner-investment)';
