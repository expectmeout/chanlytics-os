-- 00280 · A partner's password alone opens the last of the doors a seat opens, and the dashboard can tell it why.
--
-- 00218 hid a partner's seat until the session showed its second factor, and 00261 closed the definer doors that
-- asked memberships or the partner record for the caller. The re-score of 29 September 2026 found what 00261 left,
-- and that no test walked the catalog to find the next one:
--
--   * reach_out_lead_timeline (00242, applied after 00261's file was written) still counted a partner's seat
--     with a password alone, and answered a workspace's lead, its sends and its readings.
--   * partner_invitations_mine, and the partner_invitations_read policy under it, answered a partner account's
--     pending invitations to a session with no second factor (the partner's own reads answer nothing to it).
--   * partner_invite_decline answered a partner account's password alone: the invitation was declined, and the event
--     written, where accepting one (00261's neighbour, partner_invite_accept) asks for the second factor.
--   * A partner signed in with a password alone was told "No workspace found" for a workspace they hold, because
--     the restrictive policy hides the seat from the dashboard's own read of memberships, so its 404 came before
--     the question of the second factor (defect 45). session_has_partner_seat answers, to the caller alone, whether
--     the account holds a partner's seat anywhere, so the door can say what is missing instead.
--
-- Each function is its latest definition with the one clause added, as 00261 did; the policy is made again whole.
-- Every other role is unchanged. second-factor.db.test.mjs walks the catalog: every definer door a session can call
-- that reads the caller's seat asks for the second factor or is named in the list of those that need not, with why.
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_root uuid;
begin
  -- A partner's seat counts for the calling session only once it showed its second factor (0013, 00261).
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.root_id into v_root from public.reach_out_sends s
   where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
   order by s.created_at desc
   limit 1;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'stopped_at', v_lead.reach_out_stopped_at,
    -- Found on a listing (the finder's), or brought on a list of the owner's own with no place (00242).
    'found_on_listing', v_lead.place_id is not null,
    'chain', (select jsonb_build_object('root_id', p.id, 'name', p.name, 'state', p.state)
                from public.playbooks p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.playbooks p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.reach_out_sends s join public.messages m on m.id = s.message_id
                         where s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent'
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.playbooks p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', d.host,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.reach_out_sends x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.root_id = v_root
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.playbook_id
        left join public.playbooks p on p.id = s.playbook_id
        left join public.sending_domains d on d.id = s.domain_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.reach_out_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    'can_stop', v_root is not null and v_lead.reach_out_stopped_at is null
  );
end $$;

-- The partner account's own invitations answer only a session that showed its second factor.
create or replace function public.partner_invitations_mine()
returns table (tenant_id uuid, workspace text, sent_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.tenant_id, t.name, i.sent_at, i.expires_at
    from public.partners p
    join public.partner_invitations i on i.partner_id = p.id
    join public.tenants t on t.id = i.tenant_id
   where p.user_id = auth.uid()
     and p.status = 'active'
     and public.session_shows_second_factor()
     and i.declined_at is null
     and i.expires_at > now()
     and not exists (select 1 from public.partner_tenants pt where pt.tenant_id = i.tenant_id)
     and exists (select 1 from public.memberships m
                  where m.tenant_id = i.tenant_id and m.user_id = i.invited_by and m.role = 'owner')
   order by i.sent_at
$$;

-- Declining an invitation is the partner's act, as joining is (partner_invite_accept, 00225): the second factor first.
create or replace function public.partner_invite_decline(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.partner_invitations;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A partner's seat needs a session that showed its second factor (0013, 00218); answering an invitation does too.
  if not public.session_shows_second_factor() then
    raise exception 'Enter the code from your authenticator app first: a partner signs in with two steps.'
      using errcode = '42501';
  end if;
  select i.* into v_row
    from public.partner_invitations i join public.partners p on p.id = i.partner_id
   where i.tenant_id = p_tenant and p.user_id = v_user
   for update of i;
  if v_row.tenant_id is null then
    raise exception 'There is no invitation for you there.' using errcode = 'P0002';
  end if;
  if v_row.declined_at is not null then
    return;
  end if;
  update public.partner_invitations i set declined_at = now() where i.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.invite_declined', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_row.partner_id, 'by', v_user));
end
$$;

-- The policy under it: an owner reads their workspace's invitations; the partner reads theirs once the session shows it.
drop policy if exists partner_invitations_read on public.partner_invitations;
create policy partner_invitations_read on public.partner_invitations
  for select to authenticated
  using (
    public.is_workspace_owner(tenant_id)
    or partner_id in (
      select p.id from public.partners p
       where p.user_id = (select auth.uid()) and public.session_shows_second_factor()
    )
  );

-- Whether the caller holds a partner's seat, hidden or not: the caller's own seat and nobody else's, so it says
-- nothing about a workspace. The dashboard asks it when a workspace is not found for a session with no second factor.
create or replace function public.session_has_partner_seat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'partner')
$$;

revoke execute on function public.session_has_partner_seat() from public, anon;
grant execute on function public.session_has_partner_seat() to authenticated;
