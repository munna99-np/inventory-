-- Harden owner-scoped policies so rows cannot leak between tenants

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

alter policy upd_profiles_self on profiles
  using (id = auth.uid())
  with check (id = auth.uid());

alter policy upd_accounts_owner on accounts
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_parties_owner on parties
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_categories_owner on categories
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy ins_transactions_owner on transactions
  with check (
    owner = auth.uid()
    and exists (
      select 1 from accounts a where a.id = account_id and a.owner = auth.uid()
    )
    and (
      category_id is null
      or exists (
        select 1 from categories c where c.id = category_id and c.owner = auth.uid()
      )
    )
    and (
      party_id is null
      or exists (
        select 1 from parties p where p.id = party_id and p.owner = auth.uid()
      )
    )
  );

alter policy upd_transactions_owner on transactions
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and exists (
      select 1 from accounts a where a.id = account_id and a.owner = auth.uid()
    )
    and (
      category_id is null
      or exists (
        select 1 from categories c where c.id = category_id and c.owner = auth.uid()
      )
    )
    and (
      party_id is null
      or exists (
        select 1 from parties p where p.id = party_id and p.owner = auth.uid()
      )
    )
  );

alter policy ins_transfers_owner on transfers
  with check (
    owner = auth.uid()
    and exists (
      select 1 from accounts a where a.id = from_account and a.owner = auth.uid()
    )
    and exists (
      select 1 from accounts a where a.id = to_account and a.owner = auth.uid()
    )
  );

alter policy upd_transfers_owner on transfers
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and exists (
      select 1 from accounts a where a.id = from_account and a.owner = auth.uid()
    )
    and exists (
      select 1 from accounts a where a.id = to_account and a.owner = auth.uid()
    )
  );

alter policy upd_inventory_sale_invoices_owner on inventory_sale_invoices
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy ins_inventory_party_ledger_owner on inventory_party_ledger
  with check (
    owner = auth.uid()
    and exists (
      select 1 from parties p where p.id = party_id and p.owner = auth.uid()
    )
  );

alter policy upd_inventory_party_ledger_owner on inventory_party_ledger
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and exists (
      select 1 from parties p where p.id = party_id and p.owner = auth.uid()
    )
  );

alter policy upd_staff_owner on staff
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_staff_adv_owner on staff_advances
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_staff_sal_owner on staff_salaries
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_staff_att_owner on staff_attendance
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_construction_tenders_owner on construction_tenders
  using (owner = auth.uid())
  with check (owner = auth.uid());

alter policy upd_construction_tender_lines_owner on construction_tender_lines
  using (
    exists (
      select 1
      from construction_tenders t
      where t.id = construction_tender_lines.tender_id
        and t.owner = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from construction_tenders t
      where t.id = construction_tender_lines.tender_id
        and t.owner = auth.uid()
    )
  );
