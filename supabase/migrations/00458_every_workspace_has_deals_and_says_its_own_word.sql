-- 00458 · Every workspace has deals, and says its own word for a booking.
--
-- docs/decisions/0008-a-proposal-is-part-of-the-deal.md, amended 18 October 2026 ("Deals for everyone"), and
-- docs/decisions/0041-the-journey-follows-the-business.md, J4. "How customers buy" (tenants.sells_by, 00160) was the one
-- switch the deal layer hung on, and it did three jobs: it hid the deals where a business said its customers book, it let a
-- business that quotes go without a booking link, and it chose the word "meeting" over "appointment". The deals are every
-- workspace's now, a missing booking link is said the same way to everyone, and the word is the workspace's own:
--
--   tenants.appointment_word   appointment, visit, meeting, session or lesson; null where it was never picked, which reads
--                              as the word sells_by gave it (contracts appointmentWordOf) until sells_by goes. The
--                              timezone's shape (00084, 00160): one more column in the session's grant, under the owner's
--                              update policy (00201: the settings permission).
--   the backfill               every workspace that said "some get a proposal first" read "meeting"; it keeps it, stored.
--   set_person_proposal        a link set on a person opens a Proposal out with no open deal in every workspace, as
--                              deal_record always could, not only where sells_by said proposal.
--   the workspace's notice     the tenants row's narrowed update (00431) is told for the word too, so a change in one tab
--                              reaches the others' words.
--
-- tenants.sells_by stays one release, read only as the word's fallback by a page from before this one, and is written by
-- nothing new; a later migration drops it with the fallback.
--
-- Either deploy order works: a dashboard from before this release reads sells_by and draws what it did; this release's
-- dashboard reads the word where the column is, and where it is not (a database this has not reached), derives it from
-- sells_by, as before. Every statement re-runs. The new column takes ACCESS EXCLUSIVE on tenants, which every request
-- reads, so the same lock guard as 00160.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* --------------------------------------------------------------- 1. the word -- */

alter table public.tenants
  add column if not exists appointment_word text
    check (appointment_word is null or appointment_word in ('appointment', 'visit', 'meeting', 'session', 'lesson'));

-- 00084's door, one more column: the owner's update policy stands (00201), and the table-wide UPDATE stays revoked.
grant update (appointment_word) on public.tenants to authenticated;

comment on column public.tenants.appointment_word is
  'What this workspace calls a booking (0041 J4): appointment, visit, meeting, session or lesson. Words only: it changes no moment, run, list or send. Null where never picked, read as appointment (contracts appointmentWordOf). Owner-settable through PATCH workspaces, like the timezone (00084).';

comment on column public.tenants.sells_by is
  'Retired 18 Oct 2026 (0008, amended: deals for everyone). Was how this workspace''s customers buy (booking or proposal), the switch the deal layer hung on. Written by nothing; read only as appointment_word''s fallback, and dropped with it.';

-- Every workspace that said some of its customers get a proposal first read "meeting" (appointmentWordOf): it keeps it.
update public.tenants
   set appointment_word = 'meeting'
 where sells_by = 'proposal'
   and appointment_word is null;

/* ------------------------------------------------ 2. a person's link, everywhere -- */

-- 00160's body, with one condition gone: with no open deal, a link opens a Proposal out in every workspace.
create or replace function public.set_person_proposal(p_contact_id uuid, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_url    text := nullif(btrim(coalesce(p_url, '')), '');
  v_deal   public.deals%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_url is not null and (
       char_length(v_url) not between 10 and 500
       or v_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'That is not a web address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant
    from contacts c
   where c.id = p_contact_id and c.erased_at is null and c.merged_into_contact_id is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set proposal_url = v_url, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.proposal_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_url is not null, 'by', v_user));

  -- The update above holds the person's row, so a second press waits for this one and finds the deal it opened.
  select * into v_deal from deals d
   where d.contact_id = p_contact_id and d.stage in ('proposed', 'won')
   order by (d.stage = 'proposed') desc, d.created_at desc
   limit 1
   for update;
  if v_deal.id is not null then
    if v_deal.stage = 'proposed' and v_deal.proposal_url is distinct from v_url then
      update deals set proposal_url = v_url, version = version + 1 where id = v_deal.id;
    end if;
  elsif v_url is not null then
    insert into deals (tenant_id, contact_id, lead_id, service, stage, proposed_at, proposal_url, source, created_by)
    values (
      v_tenant, p_contact_id,
      (select l.id from leads l where l.contact_id = p_contact_id and l.erased_at is null
        order by l.converted_at desc nulls last limit 1),
      null, 'proposed', now(), v_url, 'person', v_user
    )
    returning * into v_deal;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.proposed', 'deal', 'deal', v_deal.id,
            jsonb_build_object('deal_id', v_deal.id, 'contact_id', p_contact_id, 'stage', 'proposed',
                               'from', null, 'service', null, 'by', v_user));
  end if;
  return jsonb_build_object('contact_id', p_contact_id, 'proposal_url', v_url);
end $$;

revoke execute on function public.set_person_proposal(uuid, text) from public, anon;
grant execute on function public.set_person_proposal(uuid, text) to authenticated;
comment on function public.set_person_proposal(uuid, text) is
  'Owner or operator sets a person''s proposal link; empty clears it. The event records that it changed, never the address. Writes through to the deal (0008): the person''s open proposal takes the link; with no open deal, a Proposal out is opened with it (every workspace has deals, 00458); a client''s deal is left alone.';

/* ----------------------------------------------------- 3. the workspace is told -- */

-- 00431's narrowed update of the workspace's own row, with the word: told when one of the columns a page draws holds
-- something else than it did. packages/db realtime.ts NARROWED_UPDATES lists the same columns.
create or replace trigger workspace_tell_update after update of status, name, timezone, sells_by, appointment_word, logo_path
  on public.tenants
  for each row when (
    old.status is distinct from new.status
    or old.name is distinct from new.name
    or old.timezone is distinct from new.timezone
    or old.sells_by is distinct from new.sells_by
    or old.appointment_word is distinct from new.appointment_word
    or old.logo_path is distinct from new.logo_path
  )
  execute function public.workspace_tell_row_change();
