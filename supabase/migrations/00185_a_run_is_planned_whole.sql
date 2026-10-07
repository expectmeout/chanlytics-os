-- 00185 · A reach-out's run is planned whole, and a step's followers are the ones it may write to.
--
-- Reach out, Part 3 (the plan's PR 4, after its review).
--
--   reach_out_plan_run(run, sends)   the run and its sends in one transaction, under the run's own id (derived from its
--                                    step and its day, core reachOutRunIdFor). A run made with nothing planned in it
--                                    would hold its chain for good (its first run waits, and nothing more is made), and
--                                    no tick could plan it again: now either both are written or neither is. Another
--                                    tick that made the day's run first is answered {exists}. The sends are this run's
--                                    and this workspace's: their workspace, run, step and root are the run's, and a
--                                    lead or a domain of another workspace is left out.
--   reach_out_followers(...)         keeps to the followers the send door would write to, before its limit: one who wrote
--                                    back, was closed, is on the never-again list, or whose email from the chain bounced
--                                    no longer holds a place at the head of every day's page while the ones behind wait.

set local lock_timeout = '3s';

/* ------------------------------------------------------------ the run -- */

create or replace function public.reach_out_plan_run(p_run jsonb, p_sends jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid := (p_run->>'id')::uuid;
  v_tenant uuid := (p_run->>'tenant_id')::uuid;
  v_step uuid := (p_run->>'playbook_id')::uuid;
  v_root uuid := (p_run->'audience'->>'root_id')::uuid;
begin
  if p_run->'audience'->>'kind' is distinct from 'reach_out' then
    raise exception 'reach_out_plan_run: a run of a reach-out says so in its audience';
  end if;
  -- The step and its chain's root are this workspace's reach-outs.
  if not exists (select 1 from public.playbooks where id = v_step and tenant_id = v_tenant and kind = 'reach_out')
     or not exists (select 1 from public.playbooks where id = v_root and tenant_id = v_tenant and kind = 'reach_out') then
    raise exception 'reach_out_plan_run: step % or root % is no reach-out of workspace %', v_step, v_root, v_tenant;
  end if;
  begin
    insert into public.broadcasts (id, tenant_id, playbook_id, run_for, name, template_id, template_name,
                                   template_language, state, scheduled_for, recipient_count, audience)
    values (v_run, v_tenant, v_step, (p_run->>'run_for')::date, p_run->>'name', (p_run->>'template_id')::uuid,
            p_run->>'template_name', p_run->>'template_language', p_run->>'state',
            (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int, p_run->'audience');
  exception when unique_violation then
    -- Its id (a replay) or its step and day (broadcasts_playbook_run): made already, whole.
    return jsonb_build_object('exists', true);
  end;
  insert into public.reach_out_sends (id, tenant_id, broadcast_id, playbook_id, root_id, lead_id, contact_id, domain_id,
                                      send_at, state, reason)
  select x.id, v_tenant, v_run, v_step, v_root, x.lead_id, x.contact_id, x.domain_id, x.send_at,
         coalesce(x.state, 'planned'), x.reason
    from jsonb_to_recordset(coalesce(p_sends, '[]'::jsonb))
         as x(id uuid, lead_id uuid, contact_id uuid, domain_id uuid, send_at timestamptz, state text, reason text)
   where exists (select 1 from public.leads l where l.id = x.lead_id and l.tenant_id = v_tenant)
     and (x.domain_id is null
          or exists (select 1 from public.sending_domains d where d.id = x.domain_id and d.tenant_id = v_tenant))
  on conflict (broadcast_id, lead_id) do nothing;
  return jsonb_build_object('id', v_run);
end $$;
revoke execute on function public.reach_out_plan_run(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_plan_run(jsonb, jsonb) to service_role;
comment on function public.reach_out_plan_run(jsonb, jsonb) is
  'A reach-out step''s run and its sends, written whole (core runReachOut): {id}, or {exists} when the step already has its run for the day. Service role only.';

/* ------------------------------------------------------- the followers -- */

-- 00184's, with the door's own answer applied before the limit. The facts come back beside each lead, and the step
-- asks the door's mapping of them again (contracts outreachRefusalOf, core runReachOut): this keeps the page to the
-- leads that mapping lets through (a lead still ready or nurture, off the never-again list, who never wrote back),
-- whose email from the chain never bounced or failed for good.
create or replace function public.reach_out_followers(
  p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days int, p_limit int)
returns table (lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid,
               facts jsonb, bounced boolean)
language sql
stable
security definer
set search_path = public
as $$
  select f.lead_id, f.contact_id, f.email, f.region, f.hours, f.parent_message_id, f.facts, f.bounced
    from (
      select l.id as lead_id, s.contact_id, lower(btrim(l.email)) as email, l.region, l.hours,
             s.message_id as parent_message_id, s.sent_at,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.reach_out_sends b join public.messages bm on bm.id = b.message_id
                      where b.root_id = s.root_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed')) as bounced
        from public.reach_out_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.playbook_id = p_parent_id and s.state = 'sent'
         and s.sent_at <= now() - make_interval(days => p_after_days)
         and s.contact_id is not null
         and not exists (select 1 from public.reach_out_sends x where x.playbook_id = p_step_id and x.lead_id = l.id)
    ) f
   where f.facts->>'lead_stage' in ('ready', 'nurture')
     and not coalesce((f.facts->>'suppressed')::boolean, true)
     and not coalesce((f.facts->>'wrote_back')::boolean, true)
     and not f.bounced
   order by f.sent_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;
