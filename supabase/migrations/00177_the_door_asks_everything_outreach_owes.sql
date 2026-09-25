-- 00177 · The door asks everything outreach owes.
--
-- Reach out, Part 2.5 (docs/superpowers/plans/2026-09-25-reach-out-part-2-5-hardening.md, PR 1).
--
--   outreach_facts(...)          The send door (core deliver.ts) asks one question of the database for a cold email
--                                and gets every fact in one answer: the lead's stage, whether the address is on the
--                                never-again list, the From domain as Connections set it up, and how much that
--                                domain sent in the window it is handed. Service role only.
--   set_email_marketing(...)     A complaint is a no like an unsubscribe: the same door, source 'complaint'.
--   an erasure                   leaves no email answer on the tombstone (00101's rule, for email), and the address's
--                                never-again row says erased, whatever it said before.
--   messages_guard()             An email whose send timed out may still be settled by its receipt.

set local lock_timeout = '3s';

-- 1. One door for the outreach facts.
create or replace function public.outreach_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_host text,
  p_since timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The lead still being written to wins over one closed; a person the finder never found has none.
    'lead_stage', (
      select l.stage from public.leads l
       where l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
         and l.erased_at is null and l.blanked_at is null
       order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
       limit 1),
    'suppressed', exists (
      select 1 from public.lead_suppressions s
       where s.tenant_id = p_tenant_id and s.kind = 'email'
         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),
    'domain', (
      select jsonb_build_object('state', d.state, 'from_local', d.from_local, 'clean_since', d.clean_since)
        from public.sending_domains d
       where d.tenant_id = p_tenant_id and d.host = lower(btrim(p_host))),
    -- What left from the domain in the window: sent, delivered, read, failed by a bounce or a failure receipt (00176's
    -- own definition), or a send whose outcome is unknown. A refusal at the door, a send the provider never took, or
    -- one it suppressed, never left.
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(btrim(p_host))
         and m.created_at >= p_since
         and (m.status in ('sent', 'delivered', 'read')
              or (m.status = 'failed'
                  and (m.error->>'provider' in ('bounced', 'failed') or coalesce(m.error->>'outcome', '') = 'unknown'))))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) to service_role;
comment on function public.outreach_facts(uuid, uuid, text, text, timestamptz) is
  'The facts the send door asks of a cold email (core deliver.ts): lead_stage, suppressed, domain {state, from_local, clean_since}, sent_since. Service role only.';

-- 2. A complaint is a no, through the unsubscribe's own door (00174, with the source widened).
create or replace function public.set_email_marketing(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_state text,
  p_source text,
  p_message_id uuid default null,
  p_evidence jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business text;
  v_contact  public.contacts%rowtype;
  v_changed  boolean := false;
  v_sent_to  text;
  v_address  text;
  v_lead     record;
begin
  -- The two noes a door can be trusted with: an unsubscribe link pressed, and a complaint the mail provider
  -- reported (00177). "No thanks" in a reply (Part 5) and a member's own reset widen this door when they arrive.
  if p_state is distinct from 'opted_out' or p_source is null or p_source not in ('unsubscribe', 'complaint') then
    raise exception 'set_email_marketing records a no: opted_out, from unsubscribe or complaint' using errcode = '22023';
  end if;
  select t.name into v_business from public.tenants t where t.id = p_tenant_id;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  -- A person who is gone, or asked to be forgotten, receives nothing already: nothing is written about them.
  if not found then
    return jsonb_build_object('changed', false, 'found', false, 'business', v_business);
  end if;
  if v_contact.erased_at is not null then
    return jsonb_build_object('changed', false, 'found', true, 'business', v_business);
  end if;

  if v_contact.email_marketing is distinct from 'opted_out' then
    update public.contacts
       set email_marketing = 'opted_out', email_marketing_source = p_source, email_marketing_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    -- The door's own facts are written last, so no evidence handed in can say another purpose or answer.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            coalesce(p_evidence, '{}'::jsonb)
            || jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_out', 'source', p_source)
            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);
    v_changed := true;
  end if;

  -- The address the email itself went to, read off its frozen request (channels buildEmailRequest), when that
  -- email is this person's: an address changed between the send and the press is still the one that said stop.
  if p_message_id is not null then
    select lower(btrim(coalesce(m.meta->'email'->'request'->'to'->>0, m.meta->'email'->>'to'))) into v_sent_to
      from public.messages m
     where m.id = p_message_id and m.tenant_id = p_tenant_id and m.contact_id = p_contact_id
       and m.channel = 'email' and m.direction = 'outbound';
  end if;

  -- The never-again list, by each address as it is stored (lower-cased, 00125): the finder drops a suppressed
  -- address from every lead it finds later (core leads runner), and the audience (Part 3) skips it.
  for v_address in
    select distinct a from unnest(array[v_contact.email, v_sent_to]) as a where coalesce(a, '') <> ''
  loop
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_address), 'email_opt_out')
    on conflict (tenant_id, kind, hash) do nothing;
  end loop;

  -- The leads still being written to are closed as said no, each with its event. No lead_operations row: the
  -- person's own stop is not the owner's to undo, and the version moves, so an undo of an older step is refused.
  for v_lead in
    update public.leads
       set stage = 'archived', closed_reason = 'said_no', version = version + 1
     where tenant_id = p_tenant_id and contact_id = p_contact_id
       and stage in ('ready', 'nurture') and erased_at is null and blanked_at is null
    returning id
  loop
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
            jsonb_build_object('stage', 'archived', 'reason', 'said_no', 'by', null, 'source', p_source));
  end loop;

  return jsonb_build_object('changed', v_changed, 'found', true, 'business', v_business);
end $$;

revoke execute on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) to service_role;
comment on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) is
  'The door a no from email goes through: an unsubscribe pressed, or a complaint the provider reported (00177). Records opted_out once, puts the address and the one the email went to on the never-again list, closes the leads still being written to as said no. Service role only.';

-- 3. An erased person keeps no email answer, and the address they had is on the never-again list as erased. Before
--    the row is written, beside 00125's contact_email_on_erase (which clears the address): OLD still holds it.
create or replace function public.email_marketing_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    if new.email_marketing is distinct from 'unknown' then
      new.email_marketing := 'unknown';
      new.email_marketing_source := 'erasure';
      new.email_marketing_updated_at := now();
    end if;
    if old.email is not null then
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (old.tenant_id, 'email', public.lead_suppression_hash(old.tenant_id, old.email), 'erased')
      on conflict (tenant_id, kind, hash) do update set what = 'erased';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.email_marketing_on_erase() from public, anon, authenticated;
drop trigger if exists contacts_erase_clears_email_marketing on public.contacts;
create trigger contacts_erase_clears_email_marketing
  before update of erased_at on public.contacts
  for each row execute function public.email_marketing_on_erase();

-- The leads' own erasure (00140) wrote its rows "on conflict do nothing", so an earlier opt-out row stayed an opt-out
-- and the finder's erased-address check never saw it. From now on it says erased, and what exists is upgraded.
create or replace function public.leads_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    for r in select l.id, l.place_id, l.phone_e164, l.email from public.leads l where l.tenant_id = NEW.tenant_id and l.contact_id = NEW.id loop
      if r.place_id is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'place', public.lead_suppression_hash(NEW.tenant_id, r.place_id), 'erased') on conflict (tenant_id, kind, hash) do update set what = 'erased';
      end if;
      if r.phone_e164 is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'phone', public.lead_suppression_hash(NEW.tenant_id, r.phone_e164), 'erased') on conflict (tenant_id, kind, hash) do update set what = 'erased';
      end if;
      if r.email is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'email', public.lead_suppression_hash(NEW.tenant_id, r.email), 'erased') on conflict (tenant_id, kind, hash) do update set what = 'erased';
      end if;
      perform public.lead_blank(r.id);
      update public.leads set erased_at = now() where id = r.id;
    end loop;
  end if;
  return NEW;
end $$;
revoke execute on function public.leads_erase_on_contact() from public, anon, authenticated;

-- What exists, upgraded. A lead's own address is blanked when it is erased (lead_blank), so the erased address is read
-- from the contact's erased_email_hash (00125), which is the same keyed digest as lead_suppression_hash.
update public.lead_suppressions s
   set what = 'erased'
  from public.contacts c
 where c.erased_at is not null and c.erased_email_hash is not null
   and s.tenant_id = c.tenant_id and s.kind = 'email' and s.hash = c.erased_email_hash
   and s.what <> 'erased';
-- And an erased person erased before this keeps no email answer either, as 00101 did for the offers answer.
update public.contacts
   set email_marketing = 'unknown', email_marketing_source = 'erasure', email_marketing_updated_at = now()
 where erased_at is not null and email_marketing is distinct from 'unknown';

-- 4. An email whose send timed out may still be settled by its receipt (00111's guard, with one exception).
create or replace function public.messages_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_rank int;
  new_rank int;
  unknown  boolean;
begin
  if NEW.conversation_id is distinct from OLD.conversation_id
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.channel     is distinct from OLD.channel
     or NEW.direction   is distinct from OLD.direction
     or NEW.sender      is distinct from OLD.sender
     or NEW.type        is distinct from OLD.type
     or NEW.body        is distinct from OLD.body
     or NEW.template_name is distinct from OLD.template_name
     or NEW.channel_ts  is distinct from OLD.channel_ts
     or NEW.created_at  is distinct from OLD.created_at
     or (OLD.external_id is not null and NEW.external_id is distinct from OLD.external_id)
  then
    raise exception 'messages content columns are immutable (P3)';
  end if;
  -- Terminal, but for one row: an email whose send timed out (00177). The provider may have taken it, so its
  -- receipt may still say what became of it; until one does, it stays failed with outcome 'unknown'.
  unknown := OLD.status = 'failed' and OLD.channel = 'email' and coalesce(OLD.error->>'outcome', '') = 'unknown';
  if OLD.status in ('failed','canceled') and NEW.status is distinct from OLD.status
     and not (unknown and NEW.status in ('sent', 'delivered', 'read')) then
    raise exception 'messages.status is terminal (% -> % rejected)', OLD.status, NEW.status;
  end if;
  -- A message that has left the building cannot be un-sent. 'canceled' asserts
  -- it never went out; on a delivered row that assertion is false, and it also
  -- hides the row from the bot's own history.
  if OLD.status in ('sent','delivered','read') and NEW.status = 'canceled' then
    raise exception 'a message that was already sent cannot be canceled (% -> % rejected)', OLD.status, NEW.status;
  end if;
  old_rank := case when unknown then 1 else case OLD.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end end;
  new_rank := case NEW.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  if new_rank < old_rank then
    raise exception 'messages.status is monotone (% -> % rejected)', OLD.status, NEW.status;
  end if;
  if NEW.status is distinct from OLD.status then
    NEW.status_updated_at := now();
    -- Each status keeps its own time: status_updated_at knows only the
    -- latest, and "delivered at 10:32, read at 10:40" is what a recipient's
    -- line on a broadcast shows. meta.status_at.<status> = now(), on the row
    -- the receipt already updates.
    NEW.meta := coalesce(NEW.meta, '{}'::jsonb)
      || jsonb_build_object('status_at',
           coalesce(NEW.meta->'status_at', '{}'::jsonb) || jsonb_build_object(NEW.status, now()));
  end if;
  return NEW;
end $$;
