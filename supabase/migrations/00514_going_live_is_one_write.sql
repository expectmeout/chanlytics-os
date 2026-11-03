-- Going live is one write (decision 0091, the onboarding PRD of 3 Nov 2026).
--
-- An owner's activation of a channel (00108, the first run's Finish and Setup's own Activate) was two writes from the
-- dashboard: the row, on the member's session, then its event on the service role. A death between them left a
-- capability switched on with no record of who did it, and the service role sat in a request path for a workspace's
-- own data. Now capability_activate and capability_deactivate write the row and its event in one transaction, on the
-- member's session, under the permission the row's own policy asks (disconnect: an owner, or the partner who brought
-- it). capability_activate also says whether this is the workspace's first activation of any channel, which is when the
-- first run's Finish tells the owner they are live, whichever channel it is (WhatsApp alone included).
--
-- What an activation means is unchanged and said plainly: the owner's word that a channel is theirs. The receptionist
-- answers a channel from the moment it connects; nothing at runtime reads this row. Deploy order: this first. A
-- dashboard before it writes the row and the event as it always did. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.capability_activate(p_tenant_id uuid, p_capability text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_first boolean;
  v_at    timestamptz := now();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'disconnect') then
    raise exception 'Only an owner can switch a channel on.' using errcode = '42501';
  end if;
  if p_capability is null or p_capability not in ('voice', 'whatsapp', 'sms') then
    raise exception 'No such capability.' using errcode = '22023';
  end if;
  -- The first of any channel, ever: the moment the first run's Finish tells the owner they are live.
  v_first := not exists (select 1 from public.capability_activations where tenant_id = p_tenant_id);
  insert into public.capability_activations (tenant_id, capability, activated_at, activated_by, deactivated_at, note)
  values (p_tenant_id, p_capability, v_at, v_user, null, left(p_note, 200))
  on conflict (tenant_id, capability) do update
     set activated_at = excluded.activated_at,
         activated_by = excluded.activated_by,
         deactivated_at = null,
         note = excluded.note;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'capability.activated', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('capability', p_capability, 'by', v_user));
  return jsonb_build_object('capability', p_capability, 'activated_at', v_at, 'first', v_first);
end $$;
revoke all on function public.capability_activate(uuid, text, text) from public, anon;
grant execute on function public.capability_activate(uuid, text, text) to authenticated, service_role;
comment on function public.capability_activate(uuid, text, text) is
  'An owner (or the partner who brought it) switches a channel on (00108, 00514): the activation row and capability.activated in one transaction, on the member''s session. Returns {capability, activated_at, first}: first is true for the workspace''s first activation of any channel, when the first run''s Finish says it is live.';

create or replace function public.capability_deactivate(p_tenant_id uuid, p_capability text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_at   timestamptz := now();
  v_n    integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'disconnect') then
    raise exception 'Only an owner can switch a channel off.' using errcode = '42501';
  end if;
  update public.capability_activations
     set deactivated_at = v_at
   where tenant_id = p_tenant_id and capability = p_capability and deactivated_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('error', 'not_activated');
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'capability.deactivated', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('capability', p_capability, 'by', v_user));
  return jsonb_build_object('capability', p_capability, 'deactivated_at', v_at);
end $$;
revoke all on function public.capability_deactivate(uuid, text) from public, anon;
grant execute on function public.capability_deactivate(uuid, text) to authenticated, service_role;
comment on function public.capability_deactivate(uuid, text) is
  'An owner (or the partner who brought it) takes a channel''s activation back (00108, 00514): the row''s deactivated_at and capability.deactivated in one transaction. {error: not_activated} when none stood. The row stays; the history does.';
