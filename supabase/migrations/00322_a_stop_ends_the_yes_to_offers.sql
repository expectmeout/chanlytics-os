-- 00322 · A stop ends the yes to offers.
--
-- A person's yes to offers (00095) outlived their STOP. The STOP held every message back through do-not-contact, and
-- the yes to offers stayed on the row: a START, which is a yes to messages about their own visit and nothing more,
-- lifted the block and the offers started again on a yes the person had since taken back (the 4 Oct wiring review,
-- decision D3). Now a no to every message ends each yes to offers with it: the answer about offers, and the answer
-- about offers by email (00299), go back to not asked, and only a new yes of their own, in writing (00100), turns
-- offers on again. A no to offers, and an unsubscribe, stay as they are.
--
-- ONE RULE, IN ONE PLACE. Four doors record a no to every message: ingest_inbound (their own STOP by WhatsApp, text or
-- email), stop_all_messages (the unsubscribe page's second act), set_contact_consent (a member records it) and the
-- carrier's report of a STOP we never heard (packages/db recordCarrierOptOut, a plain update). The rule is a trigger
-- on the change itself, so none of the four is rewritten and a fifth door cannot forget it.
--
-- The source of the answer it writes is 'stop' (contracts STOP_ENDED_OFFERS_SOURCE): how the yes ended, as 'erasure' is
-- for an erased person. The ledger keeps each ending as every consent change is kept, with the purpose named, and
-- 00297's trigger on that entry empties the channels the yes to offers covered. An ending is written a moment after
-- the stop it follows (the clock's time, where the stop's own entry has the transaction's), so a person's page reads
-- them in the order they happened.
--
-- Either deploy order works: an app that does not know the source shows the answer as not asked, which it is.
-- Re-runnable: the function is replaced, the trigger dropped first, and the last statements find nobody a second time.

create or replace function public.contact_stop_ends_offers_yes() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contacts c
     set marketing_consent            = 'unknown',
         marketing_consent_source     = 'stop',
         marketing_consent_updated_at = now()
   where c.id = new.id and c.tenant_id = new.tenant_id and c.marketing_consent = 'opted_in';
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data, created_at)
    values (new.tenant_id, 'contact.consent_changed', 'contact', 'contact', new.id,
            jsonb_build_object('purpose', 'marketing', 'consent', 'unknown', 'previous', 'opted_in',
                               'source', 'stop', 'stopped_by', new.consent_source),
            clock_timestamp());
  end if;
  -- Email's own yes to offers (00299) is a yes to offers too, and ends the same way. An unsubscribe is left a no.
  update public.contacts c
     set email_marketing            = 'unknown',
         email_marketing_source     = 'stop',
         email_marketing_updated_at = now()
   where c.id = new.id and c.tenant_id = new.tenant_id and c.email_marketing = 'opted_in';
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data, created_at)
    values (new.tenant_id, 'contact.consent_changed', 'contact', 'contact', new.id,
            jsonb_build_object('purpose', 'email_marketing', 'consent', 'unknown', 'previous', 'opted_in',
                               'source', 'stop', 'stopped_by', new.consent_source, 'channel', 'email'),
            clock_timestamp());
  end if;
  return null;
exception when others then
  -- The stop is the person's word and is never refused for this: do-not-contact holds every message back while it
  -- stands. A yes left on the row is a warning to read, not a reason to lose the stop.
  raise warning 'contact_stop_ends_offers_yes: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.contact_stop_ends_offers_yes() from public, anon, authenticated;
grant execute on function public.contact_stop_ends_offers_yes() to service_role;
comment on function public.contact_stop_ends_offers_yes() is
  'After a person''s consent becomes opted_out while an answer about offers is a yes (00322): marketing_consent and email_marketing, where opted_in, go back to unknown with the source stop, and a contact.consent_changed entry with the purpose named says so for each (00297''s trigger then empties marketing_channels). A no to offers and an unsubscribe are left as they are. Whichever door recorded the stop: ingest_inbound, stop_all_messages, set_contact_consent or the carrier''s report. A failure warns and never refuses the stop.';

drop trigger if exists contacts_stop_ends_offers_yes on public.contacts;
create trigger contacts_stop_ends_offers_yes
  after update of consent on public.contacts
  for each row
  when (new.consent = 'opted_out' and old.consent is distinct from 'opted_out'
        and (new.marketing_consent = 'opted_in' or new.email_marketing = 'opted_in')
        and new.erased_at is null)
  execute function public.contact_stop_ends_offers_yes();

-- The stops already on record: a person who stopped before this rule, and whose yes to offers is still on the row. A
-- yes dated after their stop is a newer word than the stop and is kept; one with no date is not known to be newer.
with ended as (
  update public.contacts c
     set marketing_consent            = 'unknown',
         marketing_consent_source     = 'stop',
         marketing_consent_updated_at = now()
   where c.consent = 'opted_out' and c.marketing_consent = 'opted_in' and c.erased_at is null
     and (c.marketing_consent_updated_at is null or c.consent_updated_at is null
          or c.marketing_consent_updated_at <= c.consent_updated_at)
  returning c.tenant_id, c.id, c.consent_source
)
insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
select e.tenant_id, 'contact.consent_changed', 'contact', 'contact', e.id,
       jsonb_build_object('purpose', 'marketing', 'consent', 'unknown', 'previous', 'opted_in',
                          'source', 'stop', 'stopped_by', e.consent_source, 'via', 'migration_00322')
  from ended e;

with ended as (
  update public.contacts c
     set email_marketing            = 'unknown',
         email_marketing_source     = 'stop',
         email_marketing_updated_at = now()
   where c.consent = 'opted_out' and c.email_marketing = 'opted_in' and c.erased_at is null
     and (c.email_marketing_updated_at is null or c.consent_updated_at is null
          or c.email_marketing_updated_at <= c.consent_updated_at)
  returning c.tenant_id, c.id, c.consent_source
)
insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
select e.tenant_id, 'contact.consent_changed', 'contact', 'contact', e.id,
       jsonb_build_object('purpose', 'email_marketing', 'consent', 'unknown', 'previous', 'opted_in',
                          'source', 'stop', 'stopped_by', e.consent_source, 'channel', 'email',
                          'via', 'migration_00322')
  from ended e;
