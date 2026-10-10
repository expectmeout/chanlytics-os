-- 00380 · A provider's STOP and its event are one write.
--
-- Three repository functions recorded a no a provider reported on the person's behalf (the carrier's 21610 on a text,
-- at the wire and told late on the status callback; WhatsApp's 131050 on an offer) as two statements on two requests:
-- the contacts row, then the contact.consent_changed event through emitEvent, which logs a write that fails and
-- carries on. An event that was lost left the row stopped with the history silent and, since 00297's trigger derives
-- consent_channels and marketing_channels from that event, the per-channel answer stale: a yes still covering the
-- channels the person had stopped. The record and its event are one transaction now, as ingest_inbound and
-- stop_all_messages write theirs.
--
--   record_provider_stop(p_tenant_id, p_contact_id, p_purpose, p_channel, p_source, p_message_external_id)
--       The row held, then: for `conversational`, consent opted_out, do-not-contact, the source and the time together,
--       and the event {consent, previous, source, channel}; for `marketing`, the answer about offers, its source and
--       its time, and the event with the purpose named. The message the provider refused rides on the event when the
--       caller names it. `previous` is the row's own answer at the moment of the write, never a value the caller read
--       earlier. The predicate the repositories kept: a person already stopped is left as they are and nothing is
--       written, and so is one who was erased. Answers whether it changed. The service role's alone.
--
-- Deploy order: this migration first, before the edge. An edge that calls a function the database does not hold
-- reports the send as it reports any wire it could not write; a late STOP on the status callback is kept and paged and
-- answers 503 (Twilio does not retry it: an operator replays it, #1527), and WhatsApp's 131050 on an offer is not
-- sent again, so that one would be lost. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.record_provider_stop(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_purpose text,
  p_channel text,
  p_source text,
  p_message_external_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.contacts%rowtype;
  v_previous text;
  v_data     jsonb;
begin
  if p_tenant_id is null or p_contact_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_purpose is null or p_purpose not in ('conversational', 'marketing') then
    raise exception 'A stop is about messages on their own visit (conversational) or about offers (marketing).'
      using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_channel, '')), '') is null or nullif(btrim(coalesce(p_source, '')), '') is null then
    raise exception 'A provider''s stop names its channel and its source.' using errcode = '22004';
  end if;
  -- The row, held: two reports of one stop (the wire's refusal and the late callback's) take turns, and the second
  -- finds the person stopped. No key is written, so a message inserted for the person meanwhile does not wait on it
  -- (ingest_inbound holds the row the same way, 00361).
  select * into v_row from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for no key update;
  if not found or v_row.erased_at is not null then
    return false;
  end if;
  if p_purpose = 'conversational' then
    if v_row.consent = 'opted_out' then
      return false;
    end if;
    v_previous := v_row.consent;
    update public.contacts
       set consent = 'opted_out', dnc = true, consent_source = p_source, consent_updated_at = now()
     where id = p_contact_id;
    v_data := jsonb_build_object('consent', 'opted_out', 'previous', v_previous, 'source', p_source,
                                 'channel', p_channel);
  else
    if v_row.marketing_consent = 'opted_out' then
      return false;
    end if;
    v_previous := v_row.marketing_consent;
    update public.contacts
       set marketing_consent = 'opted_out', marketing_consent_source = p_source,
           marketing_consent_updated_at = now()
     where id = p_contact_id;
    v_data := jsonb_build_object('purpose', 'marketing', 'consent', 'opted_out', 'previous', v_previous,
                                 'source', p_source, 'channel', p_channel);
  end if;
  if nullif(btrim(coalesce(p_message_external_id, '')), '') is not null then
    v_data := v_data || jsonb_build_object('message_external_id', p_message_external_id);
  end if;
  -- The same transaction as the row: 00297's trigger empties the channels the answer covered from this row, and the
  -- history says what the provider reported.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id, v_data);
  return true;
end $$;

revoke all on function public.record_provider_stop(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_provider_stop(uuid, uuid, text, text, text, text) to service_role;
comment on function public.record_provider_stop(uuid, uuid, text, text, text, text) is
  'A no a provider reported on the person''s behalf (the carrier''s 21610 on a text, WhatsApp''s 131050 on an offer), recorded with its contact.consent_changed event in one transaction (00380): for conversational, consent opted_out with dnc, the source and the time; for marketing, the answer about offers, its source and its time; the event carries the purpose, the row''s previous answer, the source, the channel and the message the provider refused when named. A person already stopped, or erased, is left as they are and nothing is written. Answers whether it changed. Service role only.';
