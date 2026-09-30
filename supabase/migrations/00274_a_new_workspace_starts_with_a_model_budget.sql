-- 00274 · A new workspace starts with a day's model budget.
--
-- Category 39 (29 September 2026): the receptionist had no default day cap, so a new workspace could spend the
-- platform's model key without a bound until its owner set one (00183 seeded the reply row with the reply cap and the
-- pause alone). A workspace made from now on starts with max_llm_tokens_day at 1,000,000 tokens in a rolling day: the
-- Autonomy pane's "1M" step, so the dial shows what is stored, and the owner changes it there. Over it the receptionist
-- stops, holds every new message for a person as "budget" and says so to the owner (reply-gates.ts), as it always has
-- at a cap the owner set.
--
-- Existing workspaces keep what they have: a cap on a live receptionist is the owner's to choose (the pull request
-- names the one statement that would give them the default, for Ruben).
--
-- provision_tenant is 00183's, word for word, with the one key added. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24, "max_llm_tokens_day": 1000000}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','ask'), ('campaign','ask'), ('reviews','ask'), ('money','never'), ('follow_up','ask'),
    ('outreach','veto')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;
