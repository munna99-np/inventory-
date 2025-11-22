create table if not exists construction_projects (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  payload jsonb not null,
  owner uuid not null default auth.uid() references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_construction_projects_owner on construction_projects(owner, created_at desc);
create index if not exists idx_construction_projects_client on construction_projects(client_id);

alter table construction_projects enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where polname = 'sel_construction_projects_owner') then
    create policy sel_construction_projects_owner on construction_projects for select using (owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where polname = 'ins_construction_projects_owner') then
    create policy ins_construction_projects_owner on construction_projects for insert with check (owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where polname = 'upd_construction_projects_owner') then
    create policy upd_construction_projects_owner on construction_projects for update using (owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where polname = 'del_construction_projects_owner') then
    create policy del_construction_projects_owner on construction_projects for delete using (owner = auth.uid());
  end if;
end $$;
