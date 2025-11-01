-- Extensions
create extension if not exists pgcrypto;

-- Utility to resolve the current authenticated user id even inside seeded/migration contexts
create or replace function public.app_user_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif((coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'sub'), '')::uuid,
    auth.uid()
  );
$$;
comment on function public.app_user_id() is 'Resolves the active JWT subject (sub) or falls back to auth.uid(); used to populate owner columns safely during seeds and migrations.';

-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- Accounts
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('personal','company')),
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (owner, name)
);

-- Parties
create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  notes text,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (owner, name)
);

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('personal','work')),
  parent_id uuid references categories(id),
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (owner, scope, name)
);

-- Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  date date not null,
  amount numeric(14,2) not null,
  qty numeric(14,3),
  direction text not null check (direction in ('in','out','transfer')),
  scope text not null check (scope in ('personal','work')),
  mode text,
  category_id uuid references categories(id),
  party_id uuid references parties(id),
  notes text,
  created_at timestamptz not null default now(),
  owner uuid not null default auth.uid() references profiles(id) on delete cascade
);

create index if not exists idx_tx_owner_date on transactions(owner, date);
create index if not exists idx_tx_owner_category on transactions(owner, category_id);
create index if not exists idx_tx_owner_party on transactions(owner, party_id);
create index if not exists idx_tx_owner_account on transactions(owner, account_id);

-- Transfers
create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  from_account uuid not null references accounts(id),
  to_account uuid not null references accounts(id),
  date date not null,
  amount numeric(14,2) not null,
  notes text,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade
);

-- RLS
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table parties enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table transfers enable row level security;

-- Policies: CRUD where owner = auth.uid(); WITH CHECK clauses lock updates to the same owner
create policy sel_profiles_self on profiles for select using (id = auth.uid());
-- Keep profile edits scoped to the authenticated user on both the old and new rows
create policy upd_profiles_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy sel_accounts_owner on accounts for select using (owner = auth.uid());
create policy ins_accounts_owner on accounts for insert with check (owner = auth.uid());
create policy upd_accounts_owner on accounts for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_accounts_owner on accounts for delete using (owner = auth.uid());

create policy sel_parties_owner on parties for select using (owner = auth.uid());
create policy ins_parties_owner on parties for insert with check (owner = auth.uid());
create policy upd_parties_owner on parties for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_parties_owner on parties for delete using (owner = auth.uid());

create policy sel_categories_owner on categories for select using (owner = auth.uid());
create policy ins_categories_owner on categories for insert with check (owner = auth.uid());
create policy upd_categories_owner on categories for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_categories_owner on categories for delete using (owner = auth.uid());

create policy sel_transactions_owner on transactions for select using (owner = auth.uid());
create policy ins_transactions_owner on transactions for insert with check (owner = auth.uid());
create policy upd_transactions_owner on transactions for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_transactions_owner on transactions for delete using (owner = auth.uid());

create policy sel_transfers_owner on transfers for select using (owner = auth.uid());
create policy ins_transfers_owner on transfers for insert with check (owner = auth.uid());
create policy upd_transfers_owner on transfers for update using (owner = auth.uid()) with check (owner = auth.uid());
  create policy del_transfers_owner on transfers for delete using (owner = auth.uid());

-- On auth signup, create profile row
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================
-- Inventory schema (categories, subcategories, items, purchases)
-- Create only if missing
-- =========================

create table if not exists inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  owner uuid not null default public.app_user_id() references profiles(id) on delete cascade,
  unique (owner, name)
);

create table if not exists inventory_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references inventory_categories(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  owner uuid not null default public.app_user_id() references profiles(id) on delete cascade,
  unique (owner, category_id, name)
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid not null references inventory_subcategories(id) on delete cascade,
  name text not null,
  sku text,
  unit text default 'pcs',
  price numeric(12,2) default 0,
  stock numeric(14,3) default 0,
  min_stock numeric(14,3) default 0,
  max_stock numeric(14,3) default 0,
  notes text,
  created_at timestamptz default now(),
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (subcategory_id, name),
  unique (owner, sku)
);

create table if not exists inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete restrict,
  invoice_no text,
  purchase_date date not null default current_date,
  payment_type text check (payment_type in ('cash','credit','bank')),
  discount numeric(14,2) default 0,
  tax_amount numeric(14,2) default 0,
  notes text,
  total_amount numeric(14,2) default 0,
  created_at timestamptz default now(),
  owner uuid not null default auth.uid() references profiles(id) on delete cascade
);

create table if not exists inventory_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references inventory_purchases(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete restrict,
  qty numeric(14,3) not null check (qty > 0),
  rate numeric(12,2) not null check (rate >= 0),
  amount numeric(14,2) generated always as (qty * rate) stored,
  unique (purchase_id, item_id)
);

create table if not exists inventory_sale_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null,
  invoice_date timestamptz not null default now(),
  party_name text,
  payment_method text not null check (payment_method in ('cash','online','cheque','credit')),
  status text not null check (status in ('paid','pending','failed')),
  total_amount numeric(14,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz default now(),
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (owner, invoice_no)
);

create index if not exists idx_inventory_sale_invoices_owner_date on inventory_sale_invoices(owner, invoice_date desc);

-- Customer/Party ledger to persist sales, purchases, payments, and adjustments per party
create table if not exists inventory_party_ledger (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('sale','purchase','payment','adjustment')),
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null check (amount >= 0),
  payment_method text,
  reference_table text,
  reference_id uuid,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  owner uuid not null default auth.uid() references profiles(id) on delete cascade
);

create index if not exists idx_inventory_party_ledger_party_date on inventory_party_ledger(party_id, entry_date desc);
create index if not exists idx_inventory_party_ledger_reference on inventory_party_ledger(reference_table, reference_id);
create index if not exists idx_inventory_party_ledger_owner_date on inventory_party_ledger(owner, entry_date desc);
comment on table inventory_party_ledger is 'Stores per-party sales, purchases, payments, and manual adjustments for the inventory ledger feature';
comment on column inventory_party_ledger.entry_type is 'Ledger entry classification (sale, purchase, payment, adjustment)';
comment on column inventory_party_ledger.direction is 'Indicates whether the entry increases (in) or decreases (out) the customer balance';
comment on column inventory_party_ledger.payment_method is 'Original payment medium captured for the entry (cash, credit, cheque, etc.)';
comment on column inventory_party_ledger.metadata is 'Additional JSON metadata such as invoice numbers or billing status';

-- Stock adjustment triggers
create or replace function public.fn_inventory_adjust_stock() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update inventory_items set stock = coalesce(stock,0) + new.qty where id = new.item_id;
    return new;
  elsif tg_op = 'UPDATE' then
    update inventory_items set stock = coalesce(stock,0) + (new.qty - old.qty) where id = new.item_id;
    return new;
  elsif tg_op = 'DELETE' then
    update inventory_items set stock = coalesce(stock,0) - old.qty where id = old.item_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_inv_pi_ins on inventory_purchase_items;
create trigger trg_inv_pi_ins after insert on inventory_purchase_items
for each row execute procedure public.fn_inventory_adjust_stock();

drop trigger if exists trg_inv_pi_upd on inventory_purchase_items;
create trigger trg_inv_pi_upd after update of qty on inventory_purchase_items
for each row execute procedure public.fn_inventory_adjust_stock();

drop trigger if exists trg_inv_pi_del on inventory_purchase_items;
create trigger trg_inv_pi_del after delete on inventory_purchase_items
for each row execute procedure public.fn_inventory_adjust_stock();

alter table inventory_categories enable row level security;
alter table inventory_subcategories enable row level security;
alter table inventory_items enable row level security;
alter table inventory_purchases enable row level security;
alter table inventory_purchase_items enable row level security;
alter table inventory_sale_invoices enable row level security;
alter table inventory_party_ledger enable row level security;

create policy sel_inventory_categories_owner on inventory_categories for select using (owner = auth.uid());
create policy ins_inventory_categories_owner on inventory_categories for insert with check (owner = auth.uid());
create policy upd_inventory_categories_owner on inventory_categories for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_inventory_categories_owner on inventory_categories for delete using (owner = auth.uid());

create policy sel_inventory_subcategories_owner on inventory_subcategories for select using (owner = auth.uid());
create policy ins_inventory_subcategories_owner on inventory_subcategories for insert with check (
  owner = auth.uid() and exists (
    select 1 from inventory_categories c where c.id = category_id and c.owner = auth.uid()
  )
);
create policy upd_inventory_subcategories_owner on inventory_subcategories for update using (owner = auth.uid()) with check (
  owner = auth.uid() and exists (
    select 1 from inventory_categories c where c.id = category_id and c.owner = auth.uid()
  )
);
create policy del_inventory_subcategories_owner on inventory_subcategories for delete using (owner = auth.uid());

create policy sel_inventory_items_owner on inventory_items for select using (owner = auth.uid());
create policy ins_inventory_items_owner on inventory_items for insert with check (owner = auth.uid());
create policy upd_inventory_items_owner on inventory_items for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_inventory_items_owner on inventory_items for delete using (owner = auth.uid());

create policy sel_inventory_purchases_owner on inventory_purchases for select using (owner = auth.uid());
create policy ins_inventory_purchases_owner on inventory_purchases for insert with check (
  owner = auth.uid() and (
    party_id is null or exists (
      select 1 from parties p where p.id = party_id and p.owner = auth.uid()
    )
  )
);
create policy upd_inventory_purchases_owner on inventory_purchases for update using (owner = auth.uid()) with check (
  owner = auth.uid() and (
    party_id is null or exists (
      select 1 from parties p where p.id = party_id and p.owner = auth.uid()
    )
  )
);
create policy del_inventory_purchases_owner on inventory_purchases for delete using (owner = auth.uid());

create policy sel_inventory_purchase_items_owner on inventory_purchase_items for select using (
  exists (
    select 1 from inventory_purchases p where p.id = purchase_id and p.owner = auth.uid()
  )
);
create policy ins_inventory_purchase_items_owner on inventory_purchase_items for insert with check (
  exists (
    select 1 from inventory_purchases p where p.id = purchase_id and p.owner = auth.uid()
  )
);
create policy upd_inventory_purchase_items_owner on inventory_purchase_items for update using (
  exists (
    select 1 from inventory_purchases p where p.id = purchase_id and p.owner = auth.uid()
  )
) with check (
  exists (
    select 1 from inventory_purchases p where p.id = purchase_id and p.owner = auth.uid()
  )
);
create policy del_inventory_purchase_items_owner on inventory_purchase_items for delete using (
  exists (
    select 1 from inventory_purchases p where p.id = purchase_id and p.owner = auth.uid()
  )
);

-- Staff/Employees
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  role text,
  joined_on date,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade
);

create table if not exists staff_advances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  amount numeric(14,2) not null check (amount > 0),
  notes text,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade
);
create index if not exists idx_staff_adv_owner_date on staff_advances(owner, date);
create index if not exists idx_staff_adv_staff on staff_advances(staff_id);

create table if not exists staff_salaries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  period date not null, -- use first day of month
  amount numeric(14,2) not null check (amount >= 0),
  paid_on date,
  notes text,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (owner, staff_id, period)
);
create index if not exists idx_staff_sal_owner_period on staff_salaries(owner, period);
create index if not exists idx_staff_sal_staff on staff_salaries(staff_id);

create table if not exists staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','leave')),
  notes text,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  unique (owner, staff_id, date)
);
create index if not exists idx_staff_att_owner_date on staff_attendance(owner, date);
create index if not exists idx_staff_att_staff on staff_attendance(staff_id);

-- RLS
alter table staff enable row level security;
alter table staff_advances enable row level security;
alter table staff_salaries enable row level security;
alter table staff_attendance enable row level security;

-- Policies (updates also enforce owner consistency via WITH CHECK)
create policy sel_staff_owner on staff for select using (owner = auth.uid());
create policy ins_staff_owner on staff for insert with check (owner = auth.uid());
create policy upd_staff_owner on staff for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_staff_owner on staff for delete using (owner = auth.uid());

create policy sel_staff_adv_owner on staff_advances for select using (owner = auth.uid());
create policy ins_staff_adv_owner on staff_advances for insert with check (owner = auth.uid());
create policy upd_staff_adv_owner on staff_advances for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_staff_adv_owner on staff_advances for delete using (owner = auth.uid());

create policy sel_staff_sal_owner on staff_salaries for select using (owner = auth.uid());
create policy ins_staff_sal_owner on staff_salaries for insert with check (owner = auth.uid());
create policy upd_staff_sal_owner on staff_salaries for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy del_staff_sal_owner on staff_salaries for delete using (owner = auth.uid());

create policy sel_staff_att_owner on staff_attendance for select using (owner = auth.uid());

create policy ins_staff_att_owner on staff_attendance for insert with check (owner = auth.uid());

create policy upd_staff_att_owner on staff_attendance for update using (owner = auth.uid()) with check (owner = auth.uid());

create policy del_staff_att_owner on staff_attendance for delete using (owner = auth.uid());




do $$ begin
  if not exists (
    select 1 from pg_policies where polname = 'sel_inventory_sale_invoices_owner'
  ) then
    create policy sel_inventory_sale_invoices_owner on inventory_sale_invoices for select using (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'ins_inventory_sale_invoices_owner'
  ) then
    create policy ins_inventory_sale_invoices_owner on inventory_sale_invoices for insert with check (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'upd_inventory_sale_invoices_owner'
  ) then
    create policy upd_inventory_sale_invoices_owner on inventory_sale_invoices for update using (owner = auth.uid()) with check (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'del_inventory_sale_invoices_owner'
  ) then
    create policy del_inventory_sale_invoices_owner on inventory_sale_invoices for delete using (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'sel_inventory_party_ledger_owner'
  ) then
    create policy sel_inventory_party_ledger_owner on inventory_party_ledger for select using (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'ins_inventory_party_ledger_owner'
  ) then
    create policy ins_inventory_party_ledger_owner on inventory_party_ledger for insert with check (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'upd_inventory_party_ledger_owner'
  ) then
    create policy upd_inventory_party_ledger_owner on inventory_party_ledger for update using (owner = auth.uid()) with check (owner = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'del_inventory_party_ledger_owner'
  ) then
    create policy del_inventory_party_ledger_owner on inventory_party_ledger for delete using (owner = auth.uid());
  end if;
end $$;

