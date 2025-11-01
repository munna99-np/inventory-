-- Scope parties uniqueness to each owner to avoid cross-tenant conflicts

do $$ begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'parties_name_key'
  ) then
    alter table parties drop constraint parties_name_key;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'parties_owner_name_key'
  ) then
    alter table parties add constraint parties_owner_name_key unique (owner, name);
  end if;
end $$;
