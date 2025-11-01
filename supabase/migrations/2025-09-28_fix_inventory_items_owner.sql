-- Align inventory_items ownership with profiles and row level security

-- Ensure owner column exists
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_items'
      and column_name = 'owner'
  ) then
    alter table public.inventory_items add column owner uuid;
  end if;
end
$$;

-- Backfill legacy rows with an existing profile when available
with fallback as (
  select id
  from public.profiles
  order by created_at asc
  limit 1
)
update public.inventory_items items
set owner = fallback.id
from fallback
where items.owner is null
  and fallback.id is not null;

-- Apply foreign key to profiles
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_owner_fkey'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_owner_fkey
      foreign key (owner) references public.profiles(id) on delete cascade;
  end if;
end
$$;

-- Set default ownership and enforce presence
alter table public.inventory_items alter column owner set default auth.uid();
alter table public.inventory_items alter column owner set not null;

-- Helpful indexes for per-owner lookups
create index if not exists idx_inventory_items_owner_subcategory on public.inventory_items (owner, subcategory_id);
create index if not exists idx_inventory_items_owner_name on public.inventory_items (owner, lower(name));

-- Refresh row level security policies
do $$
begin
  if exists (select 1 from pg_policies where polname = 'rls_inventory_items_all') then
    drop policy rls_inventory_items_all on public.inventory_items;
  end if;
  if exists (select 1 from pg_policies where polname = 'inventory_items_policy') then
    drop policy inventory_items_policy on public.inventory_items;
  end if;
end
$$;

create policy if not exists sel_inventory_items_owner
  on public.inventory_items
  for select
  using (owner = auth.uid());

create policy if not exists ins_inventory_items_owner
  on public.inventory_items
  for insert
  with check (owner = auth.uid());

create policy if not exists upd_inventory_items_owner
  on public.inventory_items
  for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy if not exists del_inventory_items_owner
  on public.inventory_items
  for delete
  using (owner = auth.uid());

-- Ensure row level security is active
alter table public.inventory_items enable row level security;

-- Guarantee every auth user has a profile for FK integrity
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);
