-- 00280 · A broadcast is assembled whole, and a send WhatsApp never received goes back in the queue.
--
--   assemble_broadcast(tenant, run, people, send_at)
--        the run, its people and its send job in one transaction (core assembleRun). They were three writes with a
--        compensating fail between them, so a function that died after the first left a run with no people, or people
--        with no job: a broadcast shown as scheduled that nothing would ever send. Now all three are written or none
--        is. A member's session is asked what the insert policies ask (is_acting_member, 00218) and the run is theirs
--        (created_by is the caller); the service role (a playbook's run, the edge) names who made it. Every person
--        must be one of the workspace's, not erased, as broadcast_recipients_acting_insert requires (00046): one who is
--        not refuses the whole run. So must its template and its playbook (00270 asks it of a session's insert; a
--        foreign key ignores row security, and this door, a definer, asks it of every caller). The job is the ledger's
--        own row (jobs.lane derives its lane, 00286).
--   broadcast_recipients_guard()
--        00216's, with a second release: a claim may go back to queued as `not_taken` too, when the send never reached
--        WhatsApp at all (a connection that never opened; providerFetch's `retryable`). Nothing left, as with
--        `throttled`, and the release still names why, so no other writer frees a claim whose send may have gone.
--
-- Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------ the run, whole -- */

create or replace function public.assemble_broadcast(
  p_tenant uuid,
  p_run jsonb,
  p_recipients jsonb,
  p_send_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := (select auth.uid());
  v_id uuid;
  v_asked int := jsonb_array_length(coalesce(p_recipients, '[]'::jsonb));
  v_enrolled int;
begin
  if v_by is not null and not public.is_acting_member(p_tenant) then
    raise exception 'assemble_broadcast: not an acting member of workspace %', p_tenant using errcode = '42501';
  end if;
  if (p_run->>'template_id') is not null and not exists (
       select 1 from public.templates t where t.id = (p_run->>'template_id')::uuid and t.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the template is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  if (p_run->>'playbook_id') is not null and not exists (
       select 1 from public.playbooks b where b.id = (p_run->>'playbook_id')::uuid and b.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the playbook is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  insert into public.broadcasts (tenant_id, name, template_id, template_name, template_language, params, audience,
                                 state, scheduled_for, recipient_count, created_by, playbook_id, run_for)
  values (p_tenant, p_run->>'name', (p_run->>'template_id')::uuid, p_run->>'template_name',
          p_run->>'template_language', coalesce(p_run->'params', '[]'::jsonb), coalesce(p_run->'audience', '{}'::jsonb),
          p_run->>'state', (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int,
          coalesce(v_by, (p_run->>'created_by')::uuid), (p_run->>'playbook_id')::uuid, (p_run->>'run_for')::date)
  returning id into v_id;

  insert into public.broadcast_recipients (broadcast_id, contact_id, tenant_id, facts)
  select v_id, x.contact_id, p_tenant, x.facts
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(contact_id uuid, facts jsonb)
   where exists (select 1 from public.contacts c
                  where c.id = x.contact_id and c.tenant_id = p_tenant and c.erased_at is null);
  get diagnostics v_enrolled = row_count;
  if v_enrolled <> v_asked then
    raise exception 'assemble_broadcast: % of the % people are not this workspace''s to send to', v_asked - v_enrolled,
      v_asked using errcode = '42501';
  end if;

  if p_send_at is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant, 'broadcast_send', p_send_at, jsonb_build_object('broadcast_id', v_id));
  end if;
  return v_id;
end $$;
revoke execute on function public.assemble_broadcast(uuid, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.assemble_broadcast(uuid, jsonb, jsonb, timestamptz) to authenticated, service_role;
comment on function public.assemble_broadcast(uuid, jsonb, jsonb, timestamptz) is
  'A broadcast''s run, its people and its send job (when p_send_at is set) in one transaction (core assembleRun): all or none. A session must be an acting member and is the run''s created_by; every person must be the workspace''s and not erased. Returns the run''s id.';

/* ------------------------------------------------------------- the release -- */

create or replace function public.broadcast_recipients_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    -- The claim, settled: the one failed that is not a verdict.
    if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state in ('sent', 'skipped') then
      return NEW;
    end if;
    -- Or released, when WhatsApp did not take the send -- too many, too fast, or never reached at all: nothing was
    -- taken, and the release says which.
    if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state = 'queued'
       and NEW.reason in ('throttled', 'not_taken') then
      return NEW;
    end if;
    if OLD.state in ('sent', 'skipped', 'failed') then
      raise exception 'broadcast_recipients.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    -- From queued the CHECK admits only sent, skipped and failed.
  end if;
  return NEW;
end $$;
comment on function public.broadcast_recipients_guard() is
  'queued -> sent|skipped|failed, once; a claim (failed, outcome_unknown) -> sent|skipped, or back to queued as throttled or not_taken when WhatsApp did not take it; sent, skipped and other failures are final. A same-state update is not a move.';
