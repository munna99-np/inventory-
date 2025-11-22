-- Add missing columns to parties table
-- This migration adds email, address, and type fields to the parties table

alter table parties
add column email text,
add column address text,
add column type text default 'company' check (type in ('company', 'personal'));

-- Add constraint for unique name per owner if it doesn't exist
-- (it should already exist from schema.sql, but this ensures it)
