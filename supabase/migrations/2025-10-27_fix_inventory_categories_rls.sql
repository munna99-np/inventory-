-- Purpose: enforce tenant isolation for inventory categories/subcategories, even when records
--          are inserted via service keys or SQL seeds that do not populate auth.uid().

-- helper to safely resolve the active subject (`sub`) or fall back to auth.uid()
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

-- check/alter owner column
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_categories'
      and column_name = 'owner'
  ) then
    alter table public.inventory_categories
      add column owner uuid;
  end if;
end
$$;

alter table public.inventory_categories
  alter column owner set default public.app_user_id();

alter table public.inventory_subcategories
  alter column owner set default public.app_user_id();

-- keep owner-scoped uniqueness
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'inventory_categories_name_key'
      and conrelid = 'public.inventory_categories'::regclass
  ) then
    alter table public.inventory_categories
      drop constraint inventory_categories_name_key;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_categories_owner_name_key'
      and conrelid = 'public.inventory_categories'::regclass
  ) then
    alter table public.inventory_categories
      add constraint inventory_categories_owner_name_key
        unique (owner, name);
  end if;
end
$$;

-- enforce FK constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_categories_owner_fkey'
      and conrelid = 'public.inventory_categories'::regclass
  ) then
    alter table public.inventory_categories
      add constraint inventory_categories_owner_fkey
        foreign key (owner) references public.profiles(id)
        on delete cascade;
  end if;
end
$$;

-- enable RLS
alter table public.inventory_categories enable row level security;

-- create all policies
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_categories'
      and polname = 'sel_inventory_categories_owner'
  ) then
    drop policy sel_inventory_categories_owner on public.inventory_categories;
  end if;
  create policy sel_inventory_categories_owner
    on public.inventory_categories
    for select
    using (owner = auth.uid());

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_categories'
      and polname = 'ins_inventory_categories_owner'
  ) then
    drop policy ins_inventory_categories_owner on public.inventory_categories;
  end if;
  create policy ins_inventory_categories_owner
    on public.inventory_categories
    for insert
    with check (owner = auth.uid());

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_categories'
      and polname = 'upd_inventory_categories_owner'
  ) then
    drop policy upd_inventory_categories_owner on public.inventory_categories;
  end if;
  create policy upd_inventory_categories_owner
    on public.inventory_categories
    for update
    using (owner = auth.uid())
    with check (owner = auth.uid());

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_categories'
      and polname = 'del_inventory_categories_owner'
  ) then
    drop policy del_inventory_categories_owner on public.inventory_categories;
  end if;
  create policy del_inventory_categories_owner
    on public.inventory_categories
    for delete
    using (owner = auth.uid());
end
$$;

-- backfill owners for legacy rows (service-role inserts, seeds, etc.)
with resolved as (
  select
    c.id,
    coalesce(
      c.owner,
      (
        select s.owner
        from public.inventory_subcategories s
        where s.category_id = c.id
          and s.owner is not null
        order by s.created_at asc
        limit 1
      ),
      (
        select p.id
        from public.profiles p
        order by p.created_at asc
        limit 1
      )
    ) as resolved_owner
  from public.inventory_categories c
)
update public.inventory_categories c
set owner = r.resolved_owner
from resolved r
where c.id = r.id
  and r.resolved_owner is not null
  and c.owner is distinct from r.resolved_owner;

with resolved_sub as (
  select
    s.id,
    coalesce(
      s.owner,
      c.owner
    ) as resolved_owner
  from public.inventory_subcategories s
  left join public.inventory_categories c
    on c.id = s.category_id
)
update public.inventory_subcategories s
set owner = r.resolved_owner
from resolved_sub r
where s.id = r.id
  and r.resolved_owner is not null
  and s.owner is distinct from r.resolved_owner;

alter table public.inventory_categories
  alter column owner set not null;

alter table public.inventory_subcategories
  alter column owner set not null;

do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from (
    select 1 from public.inventory_categories where owner is null
    union all
    select 1 from public.inventory_subcategories where owner is null
  ) pending;

  if missing_count > 0 then
    raise exception 'Inventory owner backfill left % rows without owners; update those rows manually and rerun.', missing_count;
  end if;
end
$$;
