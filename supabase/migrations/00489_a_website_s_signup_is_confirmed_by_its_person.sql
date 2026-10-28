-- 00489 · A website's sign-up is confirmed by its person (the double opt-in, 28 Oct 2026).
--
-- A website's form brings its person (00488), and an address typed into a form proves nothing: on the first site to
-- post here, 16 of 17 sign-ups were programs typing made-up addresses. So a sign-up asks its person by email to
-- confirm (the edge's door, a sealed link to the dashboard's page /c/<token>), and only their press is a yes to offers
-- by email. This is the database's side of it, one function replaced:
--
--   set_email_offers_yes          takes a third source, confirmed_signup: a sign-up its person confirmed from the
--                                 confirmation email. The door checks the proof itself, since the press names nothing
--                                 but the email: it is an email of this workspace's to this person (or to one merged
--                                 into them) that the edge wrote as a sign-up's confirmation (meta.source
--                                 signup_confirm), it left (sent, delivered or read), it is at most seven days old, and
--                                 the address it went to is the person's address now. And it lifts an unsubscribe, which
--                                 the other two never do: a confirmed sign-up is the "form they sign afresh" this
--                                 function's own comment named, the person's newest act, proven by the press. A STOP is
--                                 not lifted (a START is how that comes back). Refusals by name: not_a_confirmation,
--                                 not_sent, expired, address_changed, stopped.
--
-- Nothing calls the new source until the dashboard's page does, and the page answers "not opened yet" on a database
-- without it (the function refuses a source it does not know by its own words): either deploy order works.
-- Re-runnable: the function is replaced, its grants restated.

set local lock_timeout = '3s';

create or replace function public.set_email_offers_yes(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_source     text,
  p_message_id uuid default null,
  p_evidence   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact  public.contacts%rowtype;
  v_previous text;
  v_ask      record;
  v_sent_to  text;
  v_facts    jsonb := '{}'::jsonb;
  v_person   uuid := p_contact_id;
begin
  -- A yes to offers is in writing and only in writing (00100): their own message, a form they signed, or a sign-up they
  -- confirmed from the email it sent them.
  if p_source is null or p_source not in ('customer_message', 'form', 'confirmed_signup') then
    raise exception 'set_email_offers_yes records a yes given in writing: customer_message, form or confirmed_signup'
      using errcode = '22023';
  end if;
  if p_source = 'confirmed_signup' and p_message_id is null then
    raise exception 'set_email_offers_yes: a confirmed sign-up names the email it was confirmed from' using errcode = '22023';
  end if;

  -- The confirmation itself, before the person: the email names who it went to. A person merged since is the one the
  -- email's row moved to (merge_people moves every message), reached from the person the link names.
  if p_source = 'confirmed_signup' then
    select m.contact_id, m.status, m.created_at,
           lower(btrim(coalesce(m.meta->'email'->'request'->'to'->>0, m.meta->'email'->'to'->>0))) as sent_to,
           m.meta->'signup_confirm' as asked
      into v_ask
      from public.messages m
     where m.id = p_message_id and m.tenant_id = p_tenant_id
       and m.channel = 'email' and m.direction = 'outbound'
       and m.meta->>'source' = 'signup_confirm';
    if not found or v_ask.contact_id is null or not (
         v_ask.contact_id = p_contact_id
         or exists (select 1 from public.contacts c
                     where c.id = p_contact_id and c.tenant_id = p_tenant_id
                       and c.merged_into_contact_id = v_ask.contact_id)
       ) then
      return jsonb_build_object('changed', false, 'found', false, 'refused', 'not_a_confirmation');
    end if;
    v_person := v_ask.contact_id;
    v_sent_to := v_ask.sent_to;
  end if;

  select * into v_contact from public.contacts c
   where c.id = v_person and c.tenant_id = p_tenant_id
   for update;
  if not found then
    return jsonb_build_object('changed', false, 'found', false);
  end if;
  -- A person who asked to be forgotten, or is being, is written nothing.
  if v_contact.erased_at is not null or v_contact.erasing_since is not null then
    return jsonb_build_object('changed', false, 'found', true);
  end if;

  if p_source = 'confirmed_signup' then
    -- An email that never left reached no inbox, and its link proves nothing.
    if v_ask.status not in ('sent', 'delivered', 'read') then
      return jsonb_build_object('changed', false, 'found', true, 'refused', 'not_sent');
    end if;
    -- Seven days: a sign-up is answered in minutes, and a week covers someone who reads their mail once a week. After
    -- that, signing up again sends a new one.
    if v_ask.created_at < now() - interval '7 days' then
      return jsonb_build_object('changed', false, 'found', true, 'refused', 'expired');
    end if;
    -- The yes is the address's that pressed: one the person no longer has is not theirs to say yes for.
    if v_sent_to is null or v_sent_to is distinct from v_contact.email then
      return jsonb_build_object('changed', false, 'found', true, 'refused', 'address_changed');
    end if;
    -- A STOP is a no to every message, and only their START takes it back.
    if v_contact.consent = 'opted_out' or v_contact.dnc then
      return jsonb_build_object('changed', false, 'found', true, 'refused', 'stopped');
    end if;
    v_facts := jsonb_build_object('sent_to', v_sent_to, 'signed_up', coalesce(v_ask.asked->'form', 'null'::jsonb));
  -- An unsubscribe is the person's no, and a yes in an email NEVER overwrites it: the message that says YES OFFERS may be
  -- forged, mis-sent or old, and nothing but the person's own act (the owner's, on their page, or a form they sign afresh,
  -- which is a confirmed sign-up) may put offers back on for someone who pressed Unsubscribe. A refusal, said by name so
  -- the caller can log it.
  elsif v_contact.email_marketing = 'opted_out' then
    return jsonb_build_object('changed', false, 'found', true, 'refused', 'unsubscribed');
  end if;
  -- Once: a yes already given writes no second event.
  if v_contact.email_marketing = 'opted_in' then
    return jsonb_build_object('changed', false, 'found', true);
  end if;
  v_previous := v_contact.email_marketing;
  update public.contacts
     set email_marketing = 'opted_in', email_marketing_source = p_source, email_marketing_updated_at = now()
   where id = v_person and tenant_id = p_tenant_id;
  -- The door's own facts are written last, so no evidence handed in can say another purpose or answer; the channel is
  -- email, whatever the evidence says (a yes by email is a yes on that channel). A confirmed sign-up's address and form
  -- are read off the email, never taken from the caller.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', v_person,
          coalesce(p_evidence, '{}'::jsonb)
          || v_facts
          || jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_in', 'source', p_source,
                                'previous', v_previous, 'channel', 'email')
          || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);
  return jsonb_build_object('changed', true, 'found', true);
end $$;

revoke all on function public.set_email_offers_yes(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_offers_yes(uuid, uuid, text, uuid, jsonb) to service_role;
comment on function public.set_email_offers_yes(uuid, uuid, text, uuid, jsonb) is
  'The email yes: a person who asked for offers by email in writing (YES OFFERS in their own message, a form they signed, or a website sign-up they confirmed from its email, 00489) is opted_in to them (contacts.email_marketing), once, with a contact.consent_changed event of purpose email_marketing and the channel email as its evidence. A person erased or being erased is left alone. One who unsubscribed (email_marketing opted_out) is refused (refused: unsubscribed) unless the yes is a confirmed sign-up, their newest act. confirmed_signup names its email (p_message_id), and the door proves it: the edge''s sign-up confirmation (meta.source signup_confirm) to this person or one merged into them, left (else not_sent), at most seven days old (else expired), to their address now (else address_changed), and never over a STOP (stopped); the event carries the address and the form, read off the email. Any other email is not_a_confirmation. The caller proves the sender of a customer_message before it asks (the receiving side''s authentication of the From domain: channels senderAuthenticated). Service role only.';
