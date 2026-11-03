-- An opening is written again as its owner says (3 Nov 2026: "it did not ask me for input"; Claude Video's
-- docs/2026-11-03-one-ai-rewrite.md, step 1).
--
-- Rewrite the opening put the email back to be checked and nothing more: the check took the listing's own fact first
-- (decision 0078), so an owner who turned that sentence down got it, or one like it, back, and nothing they could say
-- reached the writer. Now the press says what was asked, on the send:
--
--   sequence_sends.rewrite_asked   What its owner asked when they pressed Rewrite: what should change (their words, 280
--                                  characters at most, or none), who and when, and the opening it replaced with how it
--                                  stood (`was`), so Undo puts back exactly that. The check reads it: the listing's fact
--                                  is not offered again, and the writer is told what was turned down and what to change.
--                                  Cleared by Undo, and by lead_blank with the opening it was written from.
--   reach_out_send_decide          Takes `p_change` with a rewrite (only with one); the opening it replaces is kept once,
--                                  so a second press while the first is written still undoes to the first.
--   reach_out_send_rewrite_undo    The member's Undo: the opening and its standing before the rewrite, back, while the
--                                  email waits; a check still running for the rewrite writes nothing (its version moved).
--   sequence_sends.website_says    What the business's own website said when the check last read it for this email, so
--                                  writing its opening again reads no page: a rewrite is the writer and the reader
--                                  alone. Cleared by lead_blank with the opening it was written from.
--   sequence_unchecked             Takes `p_send_ids`: the check of the sends a person pressed, now, whatever their day.
--   lead_blank                     Re-created from 00451: clears rewrite_asked and website_says with the opening.
--
-- Deploy order: this migration first, applied before the merge as every one is (land.mjs --applied). An edge or a
-- dashboard from before it calls every door it re-creates by the names and arguments it always did, so either app may
-- deploy after it in either order. Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------- 1. what was asked -- */

alter table public.sequence_sends add column if not exists rewrite_asked jsonb;

alter table public.sequence_sends drop constraint if exists sequence_sends_rewrite_asked_shape;
alter table public.sequence_sends add constraint sequence_sends_rewrite_asked_shape check (
  rewrite_asked is null
  or (jsonb_typeof(rewrite_asked) = 'object'
      and (rewrite_asked->'change' is null or jsonb_typeof(rewrite_asked->'change') = 'null'
           or char_length(rewrite_asked->>'change') between 1 and 280)
      and octet_length(rewrite_asked::text) <= 4000)
) not valid;
alter table public.sequence_sends validate constraint sequence_sends_rewrite_asked_shape;

comment on column public.sequence_sends.rewrite_asked is
  'What its owner asked when they pressed Rewrite the opening (00505): {change, by, at, was}, where change is their words (280 characters at most) or null and was the opening it replaced with how it stood, for Undo. The check reads it: the listing''s fact is not offered again and the writer is told. Cleared by Undo and by lead_blank.';

alter table public.sequence_sends add column if not exists website_says text;

alter table public.sequence_sends drop constraint if exists sequence_sends_website_says_shape;
alter table public.sequence_sends add constraint sequence_sends_website_says_shape check (
  website_says is null or char_length(website_says) between 1 and 800
) not valid;
alter table public.sequence_sends validate constraint sequence_sends_website_says_shape;

comment on column public.sequence_sends.website_says is
  'What the business''s own website said when the check last read it for this email (00505), so writing its opening again reads no page. Null where it was never read, or said nothing. Cleared by lead_blank.';

/* ------------------------------------------------------------------------------------------------ 2. the press -- */

drop function if exists public.reach_out_send_decide(uuid, text);
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

comment on function public.reach_out_send_decide(uuid, text, text) is
  'A member''s answer to one held or waiting email of a live run: include it, rewrite its opening (with what should change, 280 characters at most, kept on the send with the opening it replaced, 00505), skip it, or set its business aside as not a fit.';

revoke execute on function public.reach_out_send_decide(uuid, text, text) from public, anon;
grant execute on function public.reach_out_send_decide(uuid, text, text) to authenticated, service_role;

/* ------------------------------------------------------------------------------------------------------ 3. Undo -- */

create or replace function public.reach_out_send_rewrite_undo(p_send_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_send public.sequence_sends%rowtype;
  v_run  text;
  v_was  jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  select state into v_run from public.sequence_batches where id = v_send.batch_id;
  if v_run is null or v_run not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  if v_send.state not in ('held', 'planned') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  v_was := v_send.rewrite_asked->'was';
  if v_was is null or jsonb_typeof(v_was) <> 'object' or nullif(v_was->>'opening', '') is null then
    raise exception 'There is no earlier opening to put back.' using errcode = '22023';
  end if;
  -- As it stood before the press: its words, the check's reading of them and its state. The version moves on, so a
  -- check still writing the rewrite writes nothing (recordCheck writes only onto the version it read).
  update public.sequence_sends
     set opening = v_was->>'opening',
         angle = v_was->>'angle',
         facts_used = coalesce(array(select jsonb_array_elements_text(coalesce(v_was->'facts_used', '[]'::jsonb))), '{}'),
         state = case when v_was->>'state' = 'held' then 'held' else 'planned' end,
         reason = v_was->>'reason',
         hold_detail = v_was->>'hold_detail',
         checked_at = (v_was->>'checked_at')::timestamptz,
         checked_words = v_was->>'checked_words',
         check_gen = check_gen + 1, claimed_at = null, check_started_at = null, check_after = null,
         check_tries = 0, check_first_at = null,
         rewrite_asked = null
   where sequence_sends.lead_id is not null and ( id = p_send_id);
  return jsonb_build_object('send_id', p_send_id, 'opening', v_was->>'opening',
                            'state', case when v_was->>'state' = 'held' then 'held' else 'planned' end);
end $$;

comment on function public.reach_out_send_rewrite_undo(uuid) is
  'A member''s Undo of Rewrite the opening (00505): the opening it replaced and how it stood (its reading, state and hold), back, while the email waits in a live run; a check still writing the rewrite writes nothing.';

revoke execute on function public.reach_out_send_rewrite_undo(uuid) from public, anon;
grant execute on function public.reach_out_send_rewrite_undo(uuid) to authenticated, service_role;

/* ------------------------------------------------------------------------------- 4. the check of a pressed send -- */

drop function if exists public.sequence_unchecked(integer, integer, integer, uuid);
create or replace function public.sequence_unchecked(p_limit integer, p_per_workspace integer, p_ahead_minutes integer,
                                                    p_tenant_id uuid default null, p_send_ids uuid[] default null)
returns table(send jsonb, check_gen integer, template_id uuid, template_language text, signed_by text,
              included_for text[], business_name text, category text, city text, region text, rating numeric,
              reviews integer, website_host text, hours jsonb, about text, email text, why_it_fits text,
              what_you_asked text, site_listings integer, name_listings integer, email_domain_shared boolean,
              reviews_dist jsonb, claimed boolean)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if coalesce(p_limit, 0) <= 0 or coalesce(p_per_workspace, 0) <= 0 then
    return;
  end if;
  with candidates as (
    select s.id,
           row_number() over (partition by s.tenant_id
                              order by coalesce(s.check_after, s.created_at), s.send_at, s.id) as turn,
           coalesce(s.check_after, s.created_at) as waiting_since
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
      join public.sequence_steps p on p.id = s.step_id
      join public.sequence_steps r on r.id = s.sequence_id
     where s.lead_id is not null and s.state = 'planned' and s.checked_at is null
       and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       and (s.check_after is null or s.check_after <= now())
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
       -- A send a person pressed is checked now, whatever its day (00505); the clock's own wait for its day otherwise.
       and (p_send_ids is not null or b.state = 'pending_approval'
            or s.send_at <= now() + make_interval(mins => greatest(coalesce(p_ahead_minutes, 0), 0)))
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
       and (p_send_ids is null or s.id = any (p_send_ids))
  ), picked as (
    select c.id from candidates c
     where c.turn <= p_per_workspace
     order by c.turn, c.waiting_since, c.id
     limit p_limit
  ), locked as (
    select s.id from public.sequence_sends s
     where s.id in (select id from picked)
     for update of s skip locked
  ), leased as (
    update public.sequence_sends s
       set check_started_at = now()
      from locked
     where s.id = locked.id and s.state = 'planned' and s.checked_at is null
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from leased;

  return query
  select to_jsonb(s), s.check_gen, p.template_id, p.template_language, r.signed_by,
         array(select distinct x
                 from public.sequence_sends o, unnest(o.included_for) as x
                where o.tenant_id = s.tenant_id and o.sequence_id = s.sequence_id and o.lead_id = s.lead_id
                order by x),
         rec.business_name, rec.category, rec.city, rec.region, rec.rating, rec.reviews, rec.website_host,
         rec.hours, rec.about, rec.email, rec.why_it_fits, rec.what_you_asked,
         rec.site_listings, rec.name_listings, rec.email_domain_shared, rec.reviews_dist, rec.claimed
    from public.sequence_sends s
    join public.sequence_steps p on p.id = s.step_id
    join public.sequence_steps r on r.id = s.sequence_id
    cross join lateral public.reach_out_record(s.tenant_id, r.lead_search_id, s.lead_id) rec
   where s.id = any (v_ids)
   order by s.send_at, s.id;
end $$;

comment on function public.sequence_unchecked(integer, integer, integer, uuid, uuid[]) is
  'The sends to leads the check clock takes this tick, leased under their row locks, round-robin by workspace, each with its words'' step, the name its sequence signs with, the holds its owner included it past and its business''s record (00197 reach_out_unchecked over sequence_sends); with p_send_ids, those sends alone and whatever their day (00505: the check of a pressed rewrite). Service role only (0060).';

revoke all on function public.sequence_unchecked(integer, integer, integer, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.sequence_unchecked(integer, integer, integer, uuid, uuid[]) to service_role;

/* -------------------------------------------------------------------------- 5. what was asked goes with the lead -- */

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

comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, a reach-out''s opening, angle and note written from it, and a preference''s example copied from it (00391), a reach-out''s drafts, one still waiting skipped as its lead gone (00429), and a company''s people and key (00430), and what its owner asked of an opening with the one it replaced (00505), keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';
