-- A new tenant was born unconfigurable.
--
-- 00012 seeded the policy matrix and left tenant_config to be created by hand,
-- and BOTH seeds were one-shot backfills over the tenants that existed that
-- day. Nothing has provisioned a tenant since. So a workspace created after
-- 00012 has:
--
--   * zero rows in `policies`. The runtime fails safe (an absent mode reads as
--     'ask', so the receptionist holds everything for a human) — correct, but
--     it means a brand-new tenant's receptionist never answers anyone and the
--     autonomy matrix has nothing to show.
--
--   * no row in `tenant_config`. GET /v1/settings 404s, and PUT is an UPDATE
--     with an optimistic-concurrency guard, so it matches zero rows and the
--     route reports "Someone else saved settings after you loaded them —
--     reload and reapply." Nobody saved anything. The row never existed, and
--     reloading will never fix it. The owner is told a lie about a colleague
--     and given an instruction that cannot work.
--
-- The fix is a primitive plus a trigger, not a checklist item. Tenants get
-- created by migrations, by scripts, and eventually by an onboarding flow, and
-- an invariant that depends on every one of those remembering is an invariant
-- that will be broken. `provision_tenant` is idempotent so the trigger, the
-- backfill below, and any future onboarding code can all call it freely.
--
-- The seeded modes are deliberately the ones 00012 chose: they mirror the
-- edge's actual behaviour, so provisioning a tenant changes nothing about how
-- it behaves — it only makes that behaviour visible and editable.

create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The workspace-level autonomy matrix. Modes mirror the runtime's current
  -- behaviour: replies automatic, money blocked by charter, and the classes
  -- with no enforcer yet ask for a human.
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','ask'), ('campaign','ask'), ('money','never')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  -- An EMPTY config row, not a populated one. A tenant with no brain section
  -- still does not speak — silence over a persona we invented for someone
  -- else. This exists so Settings can be read and written at all.
  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;
end $$;

comment on function public.provision_tenant(uuid) is
  'Idempotently give a tenant its policy matrix and an empty config row. Called by the tenants insert trigger; safe to call again.';

revoke execute on function public.provision_tenant(uuid) from public, anon, authenticated;

-- Every path that creates a tenant gets this, including raw SQL during
-- onboarding. AFTER INSERT so the row is visible to the FK.
create or replace function public.provision_tenant_on_insert() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.provision_tenant(new.id);
  return new;
end $$;

drop trigger if exists tenants_provision on public.tenants;
create trigger tenants_provision
  after insert on public.tenants
  for each row execute function public.provision_tenant_on_insert();

-- Backfill: idempotent, so this also repairs any tenant created between 00012
-- and now, and is a no-op for the ones already seeded.
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.provision_tenant(t.id);
  end loop;
end $$;
