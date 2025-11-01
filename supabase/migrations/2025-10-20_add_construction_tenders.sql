create table if not exists construction_tenders (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  tender_number text not null,
  title text not null,
  closing_date date,
  status text not null check (status in ('draft','submitted','awarded','cancelled')),
  currency text not null,
  tax_profile_id text,
  price_strategy_order text[] not null,
  avg_window_days integer not null default 30,
  prefer_same_project_price boolean not null default true,
  total_amount numeric not null default 0,
  line_count integer not null default 0,
  payload jsonb not null,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_construction_tenders_owner on construction_tenders(owner, created_at desc);
create index if not exists idx_construction_tenders_project on construction_tenders(project_id);

create table if not exists construction_tender_lines (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references construction_tenders(id) on delete cascade,
  project_id text not null,
  sn integer not null,
  kind text not null,
  mode text,
  catalog_item_id text,
  name text not null,
  unit text,
  quantity numeric not null,
  unit_price numeric,
  amount numeric,
  pricing_source text,
  tax_snapshot text,
  breakdown jsonb,
  needs_price boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_construction_tender_lines_tender on construction_tender_lines(tender_id);
create index if not exists idx_construction_tender_lines_project on construction_tender_lines(project_id);

alter table construction_tenders enable row level security;
alter table construction_tender_lines enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where polname = 'sel_construction_tenders_owner') then
    create policy sel_construction_tenders_owner on construction_tenders for select using (owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where polname = 'ins_construction_tenders_owner') then
    create policy ins_construction_tenders_owner on construction_tenders for insert with check (owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where polname = 'upd_construction_tenders_owner') then
    create policy upd_construction_tenders_owner on construction_tenders for update using (owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where polname = 'del_construction_tenders_owner') then
    create policy del_construction_tenders_owner on construction_tenders for delete using (owner = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where polname = 'sel_construction_tender_lines_owner') then
    create policy sel_construction_tender_lines_owner on construction_tender_lines for select using (
      exists (
        select 1 from construction_tenders t where t.id = construction_tender_lines.tender_id and t.owner = auth.uid()
      )
    );
  end if;
  if not exists (select 1 from pg_policies where polname = 'ins_construction_tender_lines_owner') then
    create policy ins_construction_tender_lines_owner on construction_tender_lines for insert with check (
      exists (
        select 1 from construction_tenders t where t.id = construction_tender_lines.tender_id and t.owner = auth.uid()
      )
    );
  end if;
  if not exists (select 1 from pg_policies where polname = 'upd_construction_tender_lines_owner') then
    create policy upd_construction_tender_lines_owner on construction_tender_lines for update using (
      exists (
        select 1 from construction_tenders t where t.id = construction_tender_lines.tender_id and t.owner = auth.uid()
      )
    );
  end if;
  if not exists (select 1 from pg_policies where polname = 'del_construction_tender_lines_owner') then
    create policy del_construction_tender_lines_owner on construction_tender_lines for delete using (
      exists (
        select 1 from construction_tenders t where t.id = construction_tender_lines.tender_id and t.owner = auth.uid()
      )
    );
  end if;
end $$;
