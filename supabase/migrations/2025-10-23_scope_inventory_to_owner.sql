-- Scope inventory catalog and purchasing data to individual owners

-- Remove legacy permissive policies if they exist
do $$ begin
  if exists (select 1 from pg_policies where polname = 'rls_all_inv_categories') then
    drop policy rls_all_inv_categories on inventory_categories;
  end if;
  if exists (select 1 from pg_policies where polname = 'rls_all_inv_subcategories') then
    drop policy rls_all_inv_subcategories on inventory_subcategories;
  end if;
  if exists (select 1 from pg_policies where polname = 'rls_all_inv_items') then
    drop policy rls_all_inv_items on inventory_items;
  end if;
  if exists (select 1 from pg_policies where polname = 'rls_all_inv_purchases') then
    drop policy rls_all_inv_purchases on inventory_purchases;
  end if;
  if exists (select 1 from pg_policies where polname = 'rls_all_inv_purchase_items') then
    drop policy rls_all_inv_purchase_items on inventory_purchase_items;
  end if;
end $$;

-- Ensure owner column on inventory_categories
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'inventory_categories'
      and column_name = 'owner'
  ) then
    alter table inventory_categories add column owner uuid;
  end if;
end $$;

with ranked as (
  select distinct on (s.category_id) s.category_id, i.owner
  from inventory_items i
  join inventory_subcategories s on s.id = i.subcategory_id
  where i.owner is not null
  order by s.category_id, i.owner
)
update inventory_categories c
set owner = ranked.owner
from ranked
where c.id = ranked.category_id and c.owner is null;

with fallback as (
  select id from profiles order by created_at asc limit 1
)
update inventory_categories c
set owner = fallback.id
from fallback
where c.owner is null and fallback.id is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_categories_owner_fkey'
  ) then
    alter table inventory_categories
      add constraint inventory_categories_owner_fkey
      foreign key (owner) references profiles(id) on delete cascade;
  end if;
end $$;

alter table inventory_categories alter column owner set default auth.uid();
alter table inventory_categories alter column owner set not null;

do $$ begin
  if exists (
    select 1 from pg_constraint where conname = 'inventory_categories_name_key'
  ) then
    alter table inventory_categories drop constraint inventory_categories_name_key;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_categories_owner_name_key'
  ) then
    alter table inventory_categories
      add constraint inventory_categories_owner_name_key unique (owner, name);
  end if;
end $$;

create index if not exists idx_inventory_categories_owner_name on inventory_categories(owner, lower(name));

-- Ensure owner column on inventory_subcategories
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'inventory_subcategories'
      and column_name = 'owner'
  ) then
    alter table inventory_subcategories add column owner uuid;
  end if;
end $$;

with sub_owner as (
  select distinct on (s.id) s.id, coalesce(i.owner, c.owner) as owner
  from inventory_subcategories s
  left join inventory_items i on i.subcategory_id = s.id and i.owner is not null
  left join inventory_categories c on c.id = s.category_id and c.owner is not null
  where coalesce(i.owner, c.owner) is not null
  order by s.id, coalesce(i.owner, c.owner)
)
update inventory_subcategories s
set owner = sub_owner.owner
from sub_owner
where s.id = sub_owner.id and s.owner is null;

with fallback as (
  select id from profiles order by created_at asc limit 1
)
update inventory_subcategories s
set owner = fallback.id
from fallback
where s.owner is null and fallback.id is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_subcategories_owner_fkey'
  ) then
    alter table inventory_subcategories
      add constraint inventory_subcategories_owner_fkey
      foreign key (owner) references profiles(id) on delete cascade;
  end if;
end $$;

alter table inventory_subcategories alter column owner set default auth.uid();
alter table inventory_subcategories alter column owner set not null;

do $$ begin
  if exists (
    select 1 from pg_constraint where conname = 'inventory_subcategories_category_id_name_key'
  ) then
    alter table inventory_subcategories drop constraint inventory_subcategories_category_id_name_key;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_subcategories_owner_category_id_name_key'
  ) then
    alter table inventory_subcategories
      add constraint inventory_subcategories_owner_category_id_name_key unique (owner, category_id, name);
  end if;
end $$;

create index if not exists idx_inventory_subcategories_owner_category on inventory_subcategories(owner, category_id);

-- Align inventory_items SKU uniqueness with owner scoping
do $$ begin
  if exists (
    select 1 from pg_constraint where conname = 'inventory_items_sku_key'
  ) then
    alter table inventory_items drop constraint inventory_items_sku_key;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_owner_sku_key'
  ) then
    alter table inventory_items
      add constraint inventory_items_owner_sku_key unique (owner, sku);
  end if;
end $$;

create index if not exists idx_inventory_items_owner on inventory_items(owner, subcategory_id);

-- Ensure owner column on inventory_purchases
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'inventory_purchases'
      and column_name = 'owner'
  ) then
    alter table inventory_purchases add column owner uuid;
  end if;
end $$;

update inventory_purchases pur
set owner = p.owner
from parties p
where pur.party_id = p.id
  and p.owner is not null
  and pur.owner is null;

with fallback as (
  select id from profiles order by created_at asc limit 1
)
update inventory_purchases pur
set owner = fallback.id
from fallback
where pur.owner is null and fallback.id is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_purchases_owner_fkey'
  ) then
    alter table inventory_purchases
      add constraint inventory_purchases_owner_fkey
      foreign key (owner) references profiles(id) on delete cascade;
  end if;
end $$;

alter table inventory_purchases alter column owner set default auth.uid();
alter table inventory_purchases alter column owner set not null;

create index if not exists idx_inventory_purchases_owner_date on inventory_purchases(owner, purchase_date desc);

-- Replace inventory RLS policies with owner-aware rules
create policy if not exists sel_inventory_categories_owner
  on inventory_categories
  for select
  using (owner = auth.uid());

create policy if not exists ins_inventory_categories_owner
  on inventory_categories
  for insert
  with check (owner = auth.uid());

create policy if not exists upd_inventory_categories_owner
  on inventory_categories
  for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy if not exists del_inventory_categories_owner
  on inventory_categories
  for delete
  using (owner = auth.uid());

create policy if not exists sel_inventory_subcategories_owner
  on inventory_subcategories
  for select
  using (owner = auth.uid());

create policy if not exists ins_inventory_subcategories_owner
  on inventory_subcategories
  for insert
  with check (
    owner = auth.uid()
    and exists (
      select 1 from inventory_categories c
      where c.id = category_id
        and c.owner = auth.uid()
    )
  );

create policy if not exists upd_inventory_subcategories_owner
  on inventory_subcategories
  for update
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and exists (
      select 1 from inventory_categories c
      where c.id = category_id
        and c.owner = auth.uid()
    )
  );

create policy if not exists del_inventory_subcategories_owner
  on inventory_subcategories
  for delete
  using (owner = auth.uid());

create policy if not exists sel_inventory_items_owner
  on inventory_items
  for select
  using (owner = auth.uid());

create policy if not exists ins_inventory_items_owner
  on inventory_items
  for insert
  with check (owner = auth.uid());

create policy if not exists upd_inventory_items_owner
  on inventory_items
  for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy if not exists del_inventory_items_owner
  on inventory_items
  for delete
  using (owner = auth.uid());

create policy if not exists sel_inventory_purchases_owner
  on inventory_purchases
  for select
  using (owner = auth.uid());

create policy if not exists ins_inventory_purchases_owner
  on inventory_purchases
  for insert
  with check (
    owner = auth.uid()
    and (
      party_id is null
      or exists (
        select 1 from parties p
        where p.id = party_id
          and p.owner = auth.uid()
      )
    )
  );

create policy if not exists upd_inventory_purchases_owner
  on inventory_purchases
  for update
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and (
      party_id is null
      or exists (
        select 1 from parties p
        where p.id = party_id
          and p.owner = auth.uid()
      )
    )
  );

create policy if not exists del_inventory_purchases_owner
  on inventory_purchases
  for delete
  using (owner = auth.uid());

create policy if not exists sel_inventory_purchase_items_owner
  on inventory_purchase_items
  for select
  using (
    exists (
      select 1 from inventory_purchases pur
      where pur.id = purchase_id
        and pur.owner = auth.uid()
    )
  );

create policy if not exists ins_inventory_purchase_items_owner
  on inventory_purchase_items
  for insert
  with check (
    exists (
      select 1 from inventory_purchases pur
      where pur.id = purchase_id
        and pur.owner = auth.uid()
    )
  );

create policy if not exists upd_inventory_purchase_items_owner
  on inventory_purchase_items
  for update
  using (
    exists (
      select 1 from inventory_purchases pur
      where pur.id = purchase_id
        and pur.owner = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from inventory_purchases pur
      where pur.id = purchase_id
        and pur.owner = auth.uid()
    )
  );

create policy if not exists del_inventory_purchase_items_owner
  on inventory_purchase_items
  for delete
  using (
    exists (
      select 1 from inventory_purchases pur
      where pur.id = purchase_id
        and pur.owner = auth.uid()
    )
  );

-- Ensure the inventory tables remain protected by RLS
alter table inventory_categories enable row level security;
alter table inventory_subcategories enable row level security;
alter table inventory_items enable row level security;
alter table inventory_purchases enable row level security;
alter table inventory_purchase_items enable row level security;

-- Guarantee every auth user has a matching profile for new foreign keys
insert into profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);
