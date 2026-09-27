-- 00217 · A partner's second factor can be reset by the platform.
--
-- Merged as 00215 (#1192). Production had already recorded 00215 for the
-- finished-jobs purge (#1175), and the CLI applies by version, so this one was
-- skipped there and never applied. Renumbered, statements unchanged; every one
-- of them is re-runnable, so a database that did run it runs it again harmlessly.
--
-- Decision 0013, M2. A partner signs in with a second factor (an authenticator app); one who loses it cannot work
-- until a person at Chanlytics removes it, and they enrol again at their next sign-in. The factor itself lives in
-- Supabase Auth and is removed there, by the dashboard's service client; this records who asked for it and why, and
-- tells the caller whose account to act on.
--
--   partners                  gains second_factor_reset_at, _by, _why: the last reset, kept on the partner as their
--                             status is (00207).
--   partner_second_factor_reset  a platform admin's: checks the caller, records the reset, writes platform.acted on
--                             each workspace the partner sits on as partner, and answers the partner's account id.

alter table public.partners add column if not exists second_factor_reset_at timestamptz;
alter table public.partners
  add column if not exists second_factor_reset_by uuid references auth.users (id) on delete set null;
alter table public.partners add column if not exists second_factor_reset_why text;

comment on column public.partners.second_factor_reset_at is
  'When a person at Chanlytics last removed this partner''s second factor (0013), so they could enrol again. The why is second_factor_reset_why, the who second_factor_reset_by.';

create or replace function public.partner_second_factor_reset(p_partner uuid, p_why text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.partners;
  v_why     text := nullif(btrim(coalesce(p_why, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  if v_why is null or length(v_why) > 500 then
    raise exception 'Say why, in at most 500 characters.' using errcode = '22023';
  end if;
  select * into v_partner from public.partners where id = p_partner for update;
  if v_partner.id is null then
    raise exception 'No such partner.' using errcode = 'P0002';
  end if;
  if v_partner.user_id is null then
    raise exception 'That partner erased their account: there is no sign-in to reset.' using errcode = '55000';
  end if;

  update public.partners
     set second_factor_reset_at = now(), second_factor_reset_by = auth.uid(), second_factor_reset_why = v_why
   where id = p_partner;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select m.tenant_id, 'platform.acted', 'platform', 'tenant', m.tenant_id,
         jsonb_build_object('action', 'partner_second_factor_reset', 'partner_id', p_partner, 'by', auth.uid())
    from public.memberships m
   where m.user_id = v_partner.user_id and m.role = 'partner';

  return v_partner.user_id;
end $$;

comment on function public.partner_second_factor_reset(uuid, text) is
  'A platform admin records the reset of a partner''s second factor (0013, M2), with why, and learns whose account to act on: the dashboard then removes the factor in Supabase Auth. Written as platform.acted on each workspace the partner sits on.';

revoke execute on function public.partner_second_factor_reset(uuid, text) from public, anon;
grant execute on function public.partner_second_factor_reset(uuid, text) to authenticated;
