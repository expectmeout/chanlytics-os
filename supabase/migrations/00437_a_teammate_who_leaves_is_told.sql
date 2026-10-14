-- 00437 · A teammate who leaves is told to the owner, from the event (the wiring's second audit, R11 W-channel-team-plus-5).
--
-- A member who left a workspace by their own hand disappeared from Settings > Team in an open tab, and nothing else said
-- so: no line on the bell, nothing on Today. Joining writes member.joined and is told from it (00410, core team_notice);
-- leaving wrote a remove_member decision and no event, and the one member.left there was (a deleted account, the
-- dashboard's saidLeft) had no subscriber.
--
--   team_leave                 also writes member.left {by, how: "left", had_role} in the leave's own transaction, about
--                              the workspace, as the deleted account's does. Not team_remove: an owner who removes a member
--                              did it.
--   notifications_kind_check   00410's list, with `member_left` (a teammate left: a line on the bell that opens Settings >
--                              Team, no mail, no phone). Contracts SERVER_NOTIFICATION_KINDS, NOTIFICATION_DELIVERY
--                              ("bell").
--   event_subscriptions        member.left -> team_notice, lane 2, as member.joined: news for the bell, nobody waiting.
--
-- Deploy order: this migration first, or either. An edge from before does not know member_left, and a delivery to it is
-- kept for the edge that does (00334). Re-runnable.

set local lock_timeout = '3s';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice','opted_out','booking','member_joined','member_left'));

create or replace function public.team_leave(p_tenant_id uuid, p_actor uuid, p_via text default null) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_member public.memberships%rowtype;
  v_owners integer;
  v_audit  jsonb;
begin
  select * into v_member from public.memberships m
   where m.tenant_id = p_tenant_id and m.user_id = p_actor
   for update;
  if v_member.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- The team's turn (00277 team_take_turn's lock, without its owner check: any member may leave), then the count.
  perform pg_advisory_xact_lock(hashtextextended('memberships_keep_an_owner:' || p_tenant_id::text, 0));
  if v_member.role = 'owner' then
    select count(*) into v_owners from public.memberships m where m.tenant_id = p_tenant_id and m.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  delete from public.memberships where id = v_member.id;
  -- Carrying the role they held, as team_remove's does: the membership row is gone.
  v_audit := public.team_decision(p_tenant_id, p_actor, 'membership', v_member.id, 'remove_member',
                                  jsonb_build_object('removed_user_id', v_member.user_id, 'had_role', v_member.role,
                                                     'left', true),
                                  p_via, null);
  -- The fact the owner is told from (core team_notice), in the leave's own transaction (00437).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'member.left', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('by', p_actor, 'how', 'left', 'had_role', v_member.role));
  return jsonb_build_object('left', true) || v_audit;
end $$;

comment on function public.team_leave(p_tenant_id uuid, p_actor uuid, p_via text) is
  'A member leaves a workspace (00371, 00437): the membership, a remove_member decision with left, and member.left {by, how: left, had_role}, which the owner is told from, in one transaction; the last owner stays (last_owner). Service role: the route passes the session''s verified user as p_actor.';

insert into public.event_subscriptions (kind, subscriber, lane)
values ('member.left', 'team_notice', 2)
on conflict (kind, subscriber) do nothing;
