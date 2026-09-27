-- 00223 · An out-of-office pauses a chain.
--
-- Reach out, Part 5 (docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md, PR 4; G8 and Ruben's N1). 00222
-- reads an automatic reply as away and records when the chain may go on (reach_out_replies.until_at), and does nothing
-- with it. Now the chain waits for it:
--
--   outreach_lead_facts   00220's, whole, with `away`: an automatic reply read as away, from this person or answering
--                         the send's own lead, whose until_at is still ahead and which was not undone. The send door
--                         refuses a cold email to such a lead (outreach_away), and so does the step's own mapping of
--                         the facts (contracts outreachRefusalOf).
--   reach_out_followers   00185's, whole, with the away left out, and a send the door skipped `outreach_away` passed
--                         over when it asks whether the lead is already on this step: after the day, the step takes
--                         the lead back.
--
-- Only an automatic reply pauses (N1). A person who writes that they are away wrote back, and 00222 stops the chain
-- with a step for the day they are back.
--
-- Every statement re-runs. Nothing here alters a table, so nothing waits on a lock a live workspace holds.

/* ---------------------------------------------------------- the facts -- */

-- 00220's lead facts, unchanged but for `away`.
create or replace function public.outreach_lead_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_lead_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The send's own lead when it names one (a reach-out's always does); else the lead still being written to wins.
    'lead_stage', coalesce(
      (select l.stage from public.leads l
        where p_lead_id is not null and l.id = p_lead_id and l.tenant_id = p_tenant_id
          and l.contact_id = p_contact_id and l.erased_at is null and l.blanked_at is null),
      (select l.stage from public.leads l
        where p_lead_id is null and l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
          and l.erased_at is null and l.blanked_at is null
        order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
        limit 1)),
    'suppressed', public.lead_address_suppressed(p_tenant_id, p_to),
    'wrote_back', exists (select 1 from public.outreach_wrote_back(p_tenant_id, array[p_contact_id])),
    -- An automatic out-of-office (00222, G8) whose day is still ahead: from this person, or answering the send's lead
    -- from another address of the business. Two arms, so the first can use reach_out_replies_away.
    'away', exists (select 1 from public.reach_out_replies r
                     where r.tenant_id = p_tenant_id and r.contact_id = p_contact_id
                       and r.intent = 'away' and r.claim = 'auto_reply'
                       and r.until_at > now() and r.undone_at is null)
            or (p_lead_id is not null
                and exists (select 1 from public.reach_out_replies r
                             where r.tenant_id = p_tenant_id and r.lead_id = p_lead_id
                               and r.intent = 'away' and r.claim = 'auto_reply'
                               and r.until_at > now() and r.undone_at is null))
  )
$$;
revoke execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) to service_role;
comment on function public.outreach_lead_facts(uuid, uuid, text, uuid) is
  'A cold email''s facts about its lead: lead_stage (the send''s own lead when named, else the one still being written to), suppressed, wrote_back (00181), away (an automatic out-of-office whose day is still ahead, 00223). Service role only.';

/* ------------------------------------------------------ the followers -- */

-- 00185's, unchanged but for the away: a lead whose automatic reply says they are away is left out until the day it
-- names, and a send the door skipped `outreach_away` does not count as the lead being on this step, so the step takes
-- them back after that day.
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
         and not exists (select 1 from public.reach_out_sends x
                          where x.playbook_id = p_step_id and x.lead_id = l.id
                            and not (x.state = 'skipped' and x.reason = 'outreach_away'))
    ) f
   where f.facts->>'lead_stage' in ('ready', 'nurture')
     and not coalesce((f.facts->>'suppressed')::boolean, true)
     and not coalesce((f.facts->>'wrote_back')::boolean, true)
     and not coalesce((f.facts->>'away')::boolean, false)
     and not f.bounced
   order by f.sent_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;
