-- 00543 · A lead's email can be its own (decision 0096; 4 Nov 2026: "click to begin editing this specific email within the
-- sequence", Claude Video's docs/2026-11-04-edit-a-lead-s-email-in-place.md).
--
-- A send has only ever held the line written for it: the rest of its email is its step's words, read as it goes. Now a
-- member can type one lead's email on that lead's sheet, and everyone else still gets the step's.
--
--   sequence_lead_words         What this lead gets at this step instead. Kept for the lead and the step, not for one send:
--                               Take out then Put back and a run canceled each make a new send (00502, sequence_sends_one_first),
--                               and none exists before a lead is added or for a step not planned yet. Written as a step's
--                               words are, its slots kept, so a sign-off and a preview read as they always did (contracts
--                               leadWordsFromBox). Members read them; only the door writes.
--   sequence_lead_words_set     The door: a body saves, none puts the step's words back. Refused once the email has gone
--                               (claimed, queued, sent) or is its owner's to send. It moves no state: a held email stays held
--                               until its owner includes it, one waiting for an OK still waits for it. A check under way
--                               writes nothing (its version moved), and one done takes the mark of these words (R5).
--   reach_out_send_decide       Rewrite refuses words that hold no line: there is no opening to write.
--   lead_blank, lead_person_forget, lead_person_leg     Delete them: they may name the lead and its people.
--
-- Deploy order: this migration first, applied before the merge as every one is (land.mjs --applied). An edge or a dashboard
-- from before it calls every door it re-creates by the names and arguments it always did, and reads the step's words. The
-- edge that reads this table should be up before a member saves here: both hosts build from the one merge, so check both
-- name it (smoke) before leaning on it. Re-runnable.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------------------- 1. the words -- */

create table if not exists public.sequence_lead_words (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  step_id    uuid not null,
  lead_id    uuid not null,
  subject    text,
  body       text not null,
  written_by uuid,
  written_at timestamptz not null default now(),
  primary key (step_id, lead_id),
  constraint sequence_lead_words_step_id_same_workspace foreign key (tenant_id, step_id)
    references public.sequence_steps (tenant_id, id) on delete cascade,
  constraint sequence_lead_words_lead_id_same_workspace foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade,
  constraint sequence_lead_words_subject_check check (subject is null or char_length(subject) between 1 and 80),
  constraint sequence_lead_words_body_check check (char_length(body) between 1 and 1200)
);

create index if not exists sequence_lead_words_lead on public.sequence_lead_words (tenant_id, lead_id);

alter table public.sequence_lead_words enable row level security;
revoke all on public.sequence_lead_words from anon, authenticated;
grant select on public.sequence_lead_words to authenticated;
grant all on public.sequence_lead_words to service_role;

drop policy if exists sequence_lead_words_member_select on public.sequence_lead_words;
create policy sequence_lead_words_member_select on public.sequence_lead_words for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

comment on table public.sequence_lead_words is
  'Decision 0096: one lead''s own words at one step of a sequence, typed on the lead''s sheet: what that lead gets there in place of the step''s words. Kept for the lead and the step, not for one send, so they stand through Take out and Put back and a run canceled, before the lead is added, and for a step not planned yet. Written as a step''s words are, its slots kept. lead_blank deletes them.';

/* --------------------------------------------------------------------------------------------------- 2. the door -- */

create or replace function public.sequence_lead_words_set(p_step_id uuid, p_lead_id uuid, p_subject text default null,
                                                          p_body text default null, p_checked_words text default null,
                                                          p_needs_line boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_step public.sequence_steps%rowtype;
  v_send public.sequence_sends%rowtype;
  v_was  public.sequence_lead_words%rowtype;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_step from public.sequence_steps where id = p_step_id;
  if not found or not public.is_acting_member(v_step.tenant_id) then
    raise exception 'That step has gone.' using errcode = 'P0002';
  end if;
  if v_step.kind <> 'reach_out' or v_step.hand is not null then
    raise exception 'Only an email takes words.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.leads l
                  where l.id = p_lead_id and l.tenant_id = v_step.tenant_id
                    and l.erased_at is null and l.blanked_at is null) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  -- The lead's latest send at this step, held against a claim while its words change: a claim waits, or finds them.
  select * into v_send from public.sequence_sends s
   where s.tenant_id = v_step.tenant_id and s.lead_id = p_lead_id and s.step_id = p_step_id
   order by s.created_at desc, s.id desc
   limit 1
   for update;
  if v_send.state in ('claimed', 'queued', 'sent', 'handed') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  if v_send.state = 'drafted' then
    raise exception 'It''s yours to send now: change it in your mail app.' using errcode = '22023';
  end if;
  select * into v_was from public.sequence_lead_words w
   where w.step_id = p_step_id and w.lead_id = p_lead_id
   for update;
  if p_body is null then
    delete from public.sequence_lead_words w where w.step_id = p_step_id and w.lead_id = p_lead_id;
  else
    insert into public.sequence_lead_words as w (tenant_id, step_id, lead_id, subject, body, written_by)
    values (v_step.tenant_id, p_step_id, p_lead_id, p_subject, p_body, v_user)
    on conflict (step_id, lead_id) do update
      set subject = excluded.subject, body = excluded.body, written_by = excluded.written_by, written_at = now();
  end if;
  if v_send.state in ('planned', 'held') then
    if p_needs_line and v_send.opening is null and v_send.checked_at is not null then
      -- Checked with no line, and these words name one: back to be checked, as words changed always are (R5).
      perform public.reach_out_recheck(array[v_send.id], v_step.tenant_id);
    else
      -- A check under way read other words, and writes nothing now. One done stands: what it held about the business still
      -- holds, and a held email stays held for its owner's answer. Its mark is of these words, so the sender sends them.
      update public.sequence_sends s
         set check_gen = s.check_gen + 1, check_started_at = null,
             checked_words = case when s.checked_at is not null then p_checked_words else s.checked_words end
       where s.id = v_send.id;
    end if;
  end if;
  return jsonb_build_object(
    'step_id', p_step_id,
    'lead_id', p_lead_id,
    'send_id', v_send.id,
    'was', case when v_was.step_id is null then null
                else jsonb_build_object('subject', v_was.subject, 'body', v_was.body) end);
end $$;

comment on function public.sequence_lead_words_set(uuid, uuid, text, text, text, boolean) is
  'One lead''s own words at one step of a sequence (00543, decision 0096), typed on the lead''s sheet: a body saves them, none puts the step''s words back. Refused once that email has gone or is its owner''s to send. Moves no send''s state. Answers what stood before, for Undo.';

revoke execute on function public.sequence_lead_words_set(uuid, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.sequence_lead_words_set(uuid, uuid, text, text, text, boolean) to authenticated, service_role;

/* --------------------------------------------------------------------------------- 3. Rewrite, and what is erased -- */

create or replace function public.reach_out_send_decide(p_send_id uuid, p_decision text, p_change text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_send   public.sequence_sends%rowtype;
  v_run    text;
  v_change text := nullif(btrim(coalesce(p_change, '')), '');
  v_was    jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  if v_change is not null and p_decision is distinct from 'rewrite' then
    raise exception 'Only a rewrite takes words.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_change, '')) > 280 then
    raise exception 'Say it in 280 characters or fewer.' using errcode = '22023';
  end if;
  select state into v_run from public.sequence_batches where id = v_send.batch_id;
  if v_run is null or v_run not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  if v_send.state not in ('held', 'planned') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  case p_decision
    when 'include' then
      if v_send.state <> 'held' or v_send.reason = 'check_unavailable' then
        raise exception 'Only an email the check held for a reason is included.' using errcode = '22023';
      end if;
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      update public.sequence_sends
         set state = 'planned', reason = null, hold_detail = null,
             included_for = array(select distinct x from unnest(included_for || v_send.reason) x order by x)
       where sequence_sends.lead_id is not null and ( id = p_send_id);
    when 'rewrite' then
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      -- Words typed for this lead that hold no line have no opening to write: they are the member's (00543).
      if exists (select 1 from public.sequence_lead_words w
                  where w.step_id = v_send.step_id and w.lead_id = v_send.lead_id
                    and w.body !~* '\{\{\s*opening\s*\}\}') then
        raise exception 'You wrote this email. Use the sequence''s words first.' using errcode = '22023';
      end if;
      -- The opening it replaces, as it stood, kept once: a second press while the first is written undoes to the first.
      v_was := case
        when v_send.opening is null and v_send.rewrite_asked ? 'was' then v_send.rewrite_asked->'was'
        when v_send.opening is null then null
        else jsonb_build_object('opening', v_send.opening, 'angle', v_send.angle, 'facts_used', to_jsonb(v_send.facts_used),
                                'state', v_send.state, 'reason', v_send.reason, 'hold_detail', v_send.hold_detail,
                                'checked_at', v_send.checked_at, 'checked_words', v_send.checked_words)
      end;
      perform public.reach_out_recheck(array[p_send_id], v_send.tenant_id);
      update public.sequence_sends
         set rewrite_asked = jsonb_strip_nulls(jsonb_build_object('change', v_change, 'by', auth.uid(), 'at', now(),
                                                                  'was', v_was))
       where sequence_sends.lead_id is not null and ( id = p_send_id) and state = 'planned';
    when 'skip' then
      update public.sequence_sends set state = 'skipped', reason = 'owner_skipped' where sequence_sends.lead_id is not null and ( id = p_send_id);
    when 'not_a_fit' then
      perform public.lead_set_stage(v_send.lead_id, 'archived', 'not_a_fit',
                                    case when v_send.reason = 'chain' then 'chain' else 'other' end);
      update public.sequence_sends set state = 'skipped', reason = 'not_a_fit' where sequence_sends.lead_id is not null and ( id = p_send_id);
    else
      raise exception 'Include, rewrite, skip or not a fit.' using errcode = '22023';
  end case;
  return jsonb_build_object('send_id', p_send_id, 'decision', p_decision);
end $$;

create or replace function public.lead_blank(p_lead_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_n      integer;
  v_tenant uuid;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now()),
         -- What the listing showed about the business goes with the rest (D2).
         about = null, hours = '[]'::jsonb, image_url = null, price = null, reviews_dist = null,
         facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null, rank = null, neighborhood = null, logo_url = null, mark_path = null,
         -- A company's people and its key go with the rest (00430), so the company found again is new, as a place is.
         facts = '{}'::jsonb, source_key = null
   where id = p_lead_id
  returning tenant_id into v_tenant;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  -- What a reach-out wrote from the lead's record, and the checker's note on it (00391), and what its owner asked of
  -- its opening with the one it replaced and what its website said (00505). The send keeps its state, its reason and the
  -- digest of the words it checked.
  update public.sequence_sends
     set opening = null, angle = null, hold_detail = null, rewrite_asked = null, website_says = null
   where sequence_sends.lead_id is not null and ( tenant_id = v_tenant and lead_id = p_lead_id
     and (opening is not null or angle is not null or hold_detail is not null or rewrite_asked is not null
          or website_says is not null));
  -- The words a member typed for this lead at a step (00543): the lead's, and they go with its details.
  delete from public.sequence_lead_words where tenant_id = v_tenant and lead_id = p_lead_id;
  -- A draft handed to its owner names them and their address (00429): one still waiting to be sent is skipped as its
  -- lead gone, and every draft of theirs is cleared. The email they sent is a message, and goes as messages go.
  update public.sequence_sends
     set state = case when state = 'drafted' then 'skipped' else state end,
         reason = case when state = 'drafted' then 'lead_gone' else reason end,
         draft = null
   where sequence_sends.lead_id is not null and ( tenant_id = v_tenant and lead_id = p_lead_id and draft is not null);
  -- A person still named for the business (a stand-in, 0052) keeps nothing of it: the name goes with the place, and
  -- their address or number is what names them again.
  update public.contacts
     set display_name = null, name_source = null, updated_at = now()
   where tenant_id = v_tenant and lead_id = p_lead_id and name_source = 'lead';
  -- A preference's example copied from this lead (00391).
  update public.lead_preferences
     set example = null
   where tenant_id = v_tenant and from_lead_id = p_lead_id and example is not null;
  return v_n;
end $$;

create or replace function public.lead_person_forget(p_tenant_id uuid, p_email text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_e text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_n integer;
begin
  if v_e is null then
    return 0;
  end if;
  update public.sequence_sends
     set state = case when state = 'drafted' then 'skipped' else state end,
         reason = case when state = 'drafted' then 'lead_gone' else reason end,
         draft = null
   where sequence_sends.lead_id is not null and ( tenant_id = p_tenant_id and draft is not null and lower(btrim(coalesce(draft->>'to', ''))) = v_e);
  -- The words a member typed for a company that names this person may name them (00543).
  delete from public.sequence_lead_words w
   using public.leads l
   where l.id = w.lead_id and w.tenant_id = p_tenant_id and l.tenant_id = p_tenant_id and l.kind = 'company'
     and exists (select 1 from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) p
                  where lower(btrim(coalesce(p->>'email', ''))) = v_e);
  update public.leads l
     set facts = jsonb_set(jsonb_set(l.facts, '{people}', (
                   select coalesce(jsonb_agg(x.p order by x.n), '[]'::jsonb)
                     from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) with ordinality as x(p, n)
                    where lower(btrim(coalesce(x.p->>'email', ''))) <> v_e)),
                 '{addressee}', case
                   when jsonb_typeof(l.facts->'addressee') is distinct from 'number' then 'null'::jsonb
                   when lower(btrim(coalesce(l.facts->'people'->((l.facts->>'addressee')::integer)->>'email', ''))) = v_e
                     then 'null'::jsonb
                   else to_jsonb((l.facts->>'addressee')::integer - (
                     select count(*)::integer
                       from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) with ordinality as x(p, n)
                      where x.n - 1 < (l.facts->>'addressee')::integer
                        and lower(btrim(coalesce(x.p->>'email', ''))) = v_e))
                 end),
         email = case when lower(btrim(coalesce(l.email, ''))) = v_e then null else l.email end,
         email_state = case when lower(btrim(coalesce(l.email, ''))) = v_e then 'none' else l.email_state end,
         version = l.version + 1
   where l.tenant_id = p_tenant_id and l.kind = 'company' and l.erased_at is null and l.blanked_at is null
     and exists (select 1 from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) p
                  where lower(btrim(coalesce(p->>'email', ''))) = v_e);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.lead_person_leg(p_lead_id uuid, p_email text, p_phone text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  -- What a lead holds of one person (0052): their address, as its own or among its others, their number, and the note of
  -- the call, and the words a member typed for this lead, which may name them (00543). The place, its name and the
  -- others' are kept; nothing is banned.
  delete from public.sequence_lead_words where lead_id = p_lead_id;
  update public.leads l
     set email = case when p_email is not null and lower(l.email) = lower(p_email) then null else l.email end,
         email_state = case when p_email is not null and lower(l.email) = lower(p_email) then 'none' else l.email_state end,
         email_alternates = coalesce((select jsonb_agg(a) from jsonb_array_elements(l.email_alternates) a
                                       where p_email is null or lower(coalesce(a->>'email', '')) <> lower(p_email)),
                                     '[]'::jsonb),
         phone_e164 = case when p_phone is not null and l.phone_e164 = p_phone then null else l.phone_e164 end,
         last_note = null,
         version = l.version + 1
   where l.id = p_lead_id;
end $$;
