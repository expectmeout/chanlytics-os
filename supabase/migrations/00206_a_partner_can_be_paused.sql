-- 00206 · A partner can be paused, and a pause takes their seat on every workspace they brought.
--
-- Decision 0012, Risks: "the platform can pause a partner (status = 'paused' demotes their partner memberships to
-- viewer and keeps a record to restore)". 00202 gave partners a status and the terms say Chanlytics can pause one;
-- nothing set it, and a paused partner kept the settings of every business they brought. This is the verb.
--
--   partner_tenants.seat_held_at  when a pause took the partner's seat on this workspace: their membership is a
--                                 viewer's until they are restored, and only a seat held this way is given back.
--   partner_status_set            a platform admin pauses, closes or restores a partner, with why. Paused or closed:
--                                 every partner seat of theirs becomes a viewer's, and what they held in those
--                                 workspaces' conversations is released, as when a member leaves (00132). Active: the
--                                 seats a pause took are given back where they are still a viewer's. Earnings keep
--                                 being written while paused and mature only for an active partner (00203); a closed
--                                 partner earns nothing new.

alter table public.partner_tenants add column if not exists seat_held_at timestamptz;
comment on column public.partner_tenants.seat_held_at is
  'When pausing the partner took their seat on this workspace (0012): their membership is a viewer''s until partner_status_set restores it. Null when the seat was never taken.';

create or replace function public.partner_status_set(p_partner uuid, p_status text, p_why text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner   public.partners;
  v_why       text := nullif(btrim(coalesce(p_why, '')), '');
  v_tenants   uuid[];
  v_seats     int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'closed') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;
  if v_why is null or length(v_why) > 500 then
    raise exception 'Say why, in at most 500 characters.' using errcode = '22023';
  end if;
  select * into v_partner from public.partners where id = p_partner for update;
  if v_partner.id is null then
    raise exception 'No such partner.' using errcode = 'P0002';
  end if;

  if p_status in ('paused', 'closed') then
    -- Every seat they hold as partner becomes a viewer's, and the workspace remembers the pause took it.
    with taken as (
      update public.memberships m
         set role = 'viewer'
        from public.partner_tenants pt
       where pt.partner_id = p_partner and m.tenant_id = pt.tenant_id
         and m.user_id = v_partner.user_id and m.role = 'partner'
      returning m.tenant_id
    )
    select coalesce(array_agg(tenant_id), '{}') into v_tenants from taken;
    v_seats := coalesce(array_length(v_tenants, 1), 0);
    update public.partner_tenants set seat_held_at = now()
     where partner_id = p_partner and tenant_id = any (v_tenants);
    -- What they held there is released, as it is when a member leaves (00132): a viewer answers nobody.
    update public.conversations set assignee_user_id = null
     where tenant_id = any (v_tenants) and assignee_user_id = v_partner.user_id;
    update public.conversations
       set control_kind = null, control_by = null, control_ref = null, control_until = null
     where tenant_id = any (v_tenants) and control_kind = 'person' and control_by = v_partner.user_id;
  else
    -- Restored: the seats a pause took come back, where the owner has not removed them since.
    with given as (
      update public.memberships m
         set role = 'partner'
        from public.partner_tenants pt
       where pt.partner_id = p_partner and pt.seat_held_at is not null and m.tenant_id = pt.tenant_id
         and m.user_id = v_partner.user_id and m.role = 'viewer'
      returning m.tenant_id
    )
    select coalesce(array_agg(tenant_id), '{}') into v_tenants from given;
    v_seats := coalesce(array_length(v_tenants, 1), 0);
    update public.partner_tenants set seat_held_at = null where partner_id = p_partner and seat_held_at is not null;
  end if;

  update public.partners set status = p_status where id = p_partner;

  -- Recorded against the person on every workspace whose seat moved: its members see who changed their team.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select t, 'platform.acted', 'platform', 'tenant', t,
         jsonb_build_object('action', 'partner_status', 'status', p_status, 'from', v_partner.status,
                            'by', auth.uid())
    from unnest(v_tenants) as t;

  return jsonb_build_object('partner_id', p_partner, 'status', p_status, 'from', v_partner.status, 'seats', v_seats);
end $$;

comment on function public.partner_status_set(uuid, text, text) is
  'A platform admin pauses, closes or restores a partner (0012), with why. A pause or a close makes each of their partner seats a viewer''s and releases what they held there; a restore gives back the seats a pause took. Recorded as platform.acted on each workspace whose seat moved.';

revoke execute on function public.partner_status_set(uuid, text, text) from public, anon;
grant execute on function public.partner_status_set(uuid, text, text) to authenticated;
