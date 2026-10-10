-- 00383 · What a run and a reach-out kept of a person goes with them.
--
-- Decision 0036, step 3: the 195 columns that could hold a person's words and named no erasure strategy were read one
-- by one (10 October 2026). Three kept words of a person or a lead that no leg of an erasure, and no clock, reached:
--
--   broadcast_recipients.facts     the words a run resolved for each person when it was made: a visit's time and
--                                  service and the calendar's key for it, a proposal's link (core recipientFacts,
--                                  contracts proposalFactsFor). An erased person stays as a tombstone, so the row's
--                                  cascade never fires, and deals_erase_on_contact blanks the deal's link and not the
--                                  run's copy of it. Now cleared when the person is erased (broadcast_recipients_on_erase).
--                                  The send reads them only while the row is queued, and skips an erased person before
--                                  it does (core messages/broadcast.ts).
--   reach_out_sends.opening, .angle, .hold_detail
--                                  the model's opening for one lead, its angle and the checker's note on it, written from
--                                  the lead's record (its name, its city, what its listing said). lead_blank, the one
--                                  function erasure and retention blank a lead through, now blanks them with it.
--   lead_preferences.example       a business name an owner's preference copied from a lead (00140). Nothing writes it
--                                  yet; lead_blank clears it with the lead it came from.
--
-- lead_blank finds both by the lead's workspace and the lead, which reach_out_sends_lead (tenant_id, lead_id) serves
-- and lead_preferences_from_lead below: Postgres 17 seeks no index by its second column (00256), and the nightly purge
-- blanks hundreds of leads a run.
--
-- Re-runnable. Either deploy order: nothing reads what is cleared once its person or its lead is gone.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------- a run's words for an erased person */

create or replace function public.broadcast_recipients_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    update public.broadcast_recipients r
       set facts = null
     where r.tenant_id = NEW.tenant_id and r.contact_id = NEW.id and r.facts is not null;
  end if;
  return null;
end $$;

revoke all on function public.broadcast_recipients_on_erase() from public, anon, authenticated;
comment on function public.broadcast_recipients_on_erase() is
  'When a person is erased, the words each run kept for them (a visit''s time, service and calendar key, a proposal''s link) are cleared; the row keeps its state and reason, which the run''s counts read (00383).';

drop trigger if exists contacts_erase_clears_run_words on public.contacts;
create trigger contacts_erase_clears_run_words
  after update of erased_at on public.contacts
  for each row execute function public.broadcast_recipients_on_erase();

/* ------------------------------------------------------------------------------ a lead blanked, all of it */

-- Small, and written by nothing yet: built in place.
create index if not exists lead_preferences_from_lead
  on public.lead_preferences (tenant_id, from_lead_id) where from_lead_id is not null;

create or replace function public.lead_blank(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
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
         facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null, rank = null, neighborhood = null, logo_url = null, mark_path = null
   where id = p_lead_id
  returning tenant_id into v_tenant;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  -- What a reach-out wrote from the lead's record, and the checker's note on it (00383). The send keeps its state, its
  -- reason and the digest of the words it checked.
  update public.reach_out_sends
     set opening = null, angle = null, hold_detail = null
   where tenant_id = v_tenant and lead_id = p_lead_id
     and (opening is not null or angle is not null or hold_detail is not null);
  -- A preference's example copied from this lead (00383).
  update public.lead_preferences
     set example = null
   where tenant_id = v_tenant and from_lead_id = p_lead_id and example is not null;
  return v_n;
end $$;

revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;
comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, a reach-out''s opening, angle and note written from it, and a preference''s example copied from it (00383), keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';
