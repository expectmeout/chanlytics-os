-- 00412 · A person found as a lead keeps the business and earns a name.
--
-- Decision 0052 (docs/decisions/0052-a-person-found-as-a-lead-keeps-the-business-and-earns-a-name.md), step 1. A lead's
-- first cold email makes its person, named for the business (reach_out_person, 00344), and from then on the person IS
-- the business: nothing kept who answered, nothing tied a second person at the business to it, and nothing said where a
-- person's name came from, so no door could tell which name may replace which.
--
--   contacts.lead_id            The business they work at: a lead (one, the newest), set one way from leads. A lead is the
--                               business record; there is no businesses table. Same-workspace foreign key, set null when
--                               the lead is purged.
--   contacts.lead_settled_at    When a member said where they work ("Link a business…", "Not at this business"): the
--                               link then never moves by itself.
--   contacts.name_source        Where their name came from: typed, import, calendar, signature, wire, lead. Null for a
--                               person whose name nobody has set (the WhatsApp name or the number shows) and for one made
--                               before this, whose source is not known: neither is ever replaced by the engine.
--   contacts.name_settled_at    When a member settled the name (typed it, took a signer's, put the business's back, or
--                               declined a signer): automatic naming never moves a settled name.
--   reach_out_replies.signer_*  Who signed the reply, as the reading found it, and what became of the offer: offered,
--                               adopted, declined, undone; who settled it and when; what the name was before (signer_was:
--                               the source then, or 'none' for a person with no name, for the undo).
--
--   person_name_rank            The order of the sources: lead < wire < signature, calendar, import < typed (and a name
--                               whose source is not known ranks as typed). The engine replaces a strictly lower rank.
--   lead_tells_its_person       The trigger, leads -> contacts and never back: a lead that names a person (its first
--                               email, an Interested call, a person who wrote from its own number or address) sets that
--                               person's lead_id when they have none, or when this lead is newer and nobody settled it.
--   person_name_take            The one writer of a signer's name, by a member's press or automatically.
--   person_name_adopt, _undo,   A member's doors: use the signer's name; put the name back (the business's, or none);
--   _decline                    decline the signer. Operator, owner, partner.
--   person_join_lead,           A member's doors: link a person to a business, or "Not at this business".
--   person_leave_lead
--   resolve_person              00384's, with the name's source written and the rank kept: a name of a strictly higher
--                               rank replaces an unsettled one (a calendar's or a client list's over the business's own).
--   set_person_name             00131's: a typed name is settled.
--   reach_out_reply_of          00237's, answering whether the reply cites our email by its Message-ID.
--   reach_out_reply_apply       00222's: a reply that cites our email from another address at the business links its
--                               writer (its no and its step stay the lead's own person's); the signer, the writer's, is kept
--                               and offered, or taken when the plan says so.
--   people_page, people_list    00276's and 00328's: the business they work at, and the name's source; the search finds
--                               the business's name.
--   workspace_tell_update       00408's row trigger on contacts, with lead_id and name_source among the columns told.
--
-- Events, ids only (0036): contact.named gains source, was, via and the message; contact.business_linked and
-- contact.business_unlinked {lead_id, via}. Either deploy order: an older dashboard reads none of the new columns and
-- calls none of the new doors; an older edge sends no signer and reads no `cited`, and its readings apply as before. The
-- functions copied are copied by a script from their latest migrations, and only the lines named above changed.
-- Every statement re-runs.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------- 1. the columns -- */

alter table public.contacts add column if not exists lead_id uuid;
alter table public.contacts add column if not exists lead_settled_at timestamptz;
alter table public.contacts add column if not exists name_source text;
alter table public.contacts add column if not exists name_settled_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_lead_id_same_workspace') then
    alter table public.contacts
      add constraint contacts_lead_id_same_workspace
      foreign key (tenant_id, lead_id) references public.leads (tenant_id, id) on delete set null (lead_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_name_source_check') then
    alter table public.contacts
      add constraint contacts_name_source_check
      check (name_source is null or name_source in ('typed', 'import', 'calendar', 'signature', 'wire', 'lead'));
  end if;
end $$;

-- Its index, contacts_tenant_lead, is 00413's: built CONCURRENTLY, alone in its file.

comment on column public.contacts.lead_id is
  'The business this person works at (0052): a lead, the newest that named them, set one way from leads (lead_tells_its_person) or by a member (person_join_lead). A lead is the business record; there is no businesses table.';
comment on column public.contacts.lead_settled_at is
  'When a member said where this person works (person_join_lead, person_leave_lead): their lead_id then never moves by itself (0052).';
comment on column public.contacts.name_source is
  'Where display_name came from (0052): typed, import, calendar, signature, wire or lead. Null when no name was set (the WhatsApp name or the number shows) or for a name set before this, whose source is not known. The engine replaces only a strictly lower rank (person_name_rank) and never a settled name.';
comment on column public.contacts.name_settled_at is
  'When a member settled the name (typed it, took a signer''s, put the business''s back, or declined a signer, 0052): automatic naming never moves it.';

alter table public.reach_out_replies add column if not exists signer_name text;
alter table public.reach_out_replies add column if not exists signer_title text;
alter table public.reach_out_replies add column if not exists signer_state text;
alter table public.reach_out_replies add column if not exists signer_was text;
alter table public.reach_out_replies add column if not exists signer_settled_at timestamptz;
alter table public.reach_out_replies add column if not exists signer_settled_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reach_out_replies_signer_check') then
    alter table public.reach_out_replies
      add constraint reach_out_replies_signer_check
      check ((signer_name is null or char_length(signer_name) between 1 and 80)
         and (signer_title is null or (signer_name is not null and char_length(signer_title) between 1 and 80))
         and ((signer_name is null) = (signer_state is null))
         and (signer_state is null or signer_state in ('offered', 'adopted', 'declined', 'undone'))
         and (signer_was is null or signer_was in ('none', 'typed', 'import', 'calendar', 'signature', 'wire', 'lead'))
         and ((signer_settled_at is null) = (signer_state is null or signer_state = 'offered')));
  end if;
end $$;

create index if not exists reach_out_replies_signer_offered
  on public.reach_out_replies (tenant_id, contact_id) where signer_state = 'offered';

comment on column public.reach_out_replies.signer_name is
  'Who signed the reply, as the reading found it in the writer''s own lines and the human-name gate let it through (contracts signerOf, 0052); null when nobody did. Cleared when the person is erased.';
comment on column public.reach_out_replies.signer_state is
  'What became of the signer''s name (0052): offered (the notice "Use this name"), adopted (by a member''s press or automatically), declined, or undone.';

/* ------------------------------------------------------------------------------------------ 2. the rank -- */

create or replace function public.person_name_rank(p_source text)
returns integer
language sql
immutable
set search_path = ''
as $$
  -- A name whose source is not known (null) ranks as a typed one: nothing replaces it.
  select case p_source
           when 'lead' then 1
           when 'wire' then 2
           when 'signature' then 3
           when 'calendar' then 3
           when 'import' then 3
           else 9
         end
$$;

comment on function public.person_name_rank(text) is
  'The order of a name''s sources (0052): the business''s own name (lead) < a wire''s (wire) < a signer''s, a calendar''s or a client list''s < a member''s (typed), and a name whose source is not known ranks as typed. The engine replaces only a strictly lower rank.';

/* ---------------------------------------------------------------------------- 3. leads -> contacts, one way -- */

create or replace function public.lead_tells_its_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null or new.blanked_at is not null then
    return null;
  end if;
  -- The person this lead names works at it, unless they work at another already: a newer lead takes them while nobody
  -- settled where they work. Never writes leads.
  update public.contacts c
     set lead_id = new.id, updated_at = now()
   where c.id = new.contact_id and c.tenant_id = new.tenant_id
     and c.erased_at is null and c.merged_into_contact_id is null
     and c.lead_id is distinct from new.id
     and c.lead_settled_at is null
     and (c.lead_id is null
          or exists (select 1 from public.leads o
                      where o.id = c.lead_id and o.tenant_id = c.tenant_id and o.found_at < new.found_at));
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'contact.business_linked', 'contact', 'contact', new.contact_id,
            jsonb_build_object('lead_id', new.id, 'via', 'lead'));
  end if;
  return null;
end $$;

revoke execute on function public.lead_tells_its_person() from public, anon, authenticated;

comment on function public.lead_tells_its_person() is
  'Decision 0052: a lead that names a person (leads.contact_id: its first email, an Interested call, a person who wrote from its own number or address) sets that person''s lead_id when they work nowhere yet, or when this lead is newer and nobody settled where they work; contact.business_linked {lead_id, via lead}. One way: it never writes leads.';

create or replace trigger leads_tell_their_person
  after insert or update of contact_id on public.leads
  for each row when (new.contact_id is not null)
  execute function public.lead_tells_its_person();

/* -------------------------------------------------------------------------------------- 4. what is there -- */

-- Every person a lead names already works at the newest of them.
update public.contacts c
   set lead_id = x.lead_id
  from (select distinct on (l.tenant_id, l.contact_id) l.tenant_id, l.contact_id, l.id as lead_id
          from public.leads l
         where l.contact_id is not null and l.erased_at is null and l.blanked_at is null
         order by l.tenant_id, l.contact_id, l.found_at desc) x
 where c.id = x.contact_id and c.tenant_id = x.tenant_id and c.lead_id is null;

-- A person still named for their business is a stand-in; a person a client list or a calendar named, that.
update public.contacts c
   set name_source = 'lead'
 where c.name_source is null and c.display_name is not null and c.lead_id is not null
   and exists (select 1 from public.leads l
                where l.id = c.lead_id and l.tenant_id = c.tenant_id
                  and lower(btrim(c.display_name)) = lower(btrim(left(l.business_name, 80))));
update public.contacts c
   set name_source = c.acquired_via
 where c.name_source is null and c.display_name is not null and c.acquired_via in ('import', 'calendar');

/* ------------------------------------------------------------------------------ 5. an erased person's signer -- */

create or replace function public.person_signer_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    update public.reach_out_replies
       set signer_name = null, signer_title = null, signer_state = null, signer_was = null,
           signer_settled_at = null, signer_settled_by = null
     where tenant_id = new.tenant_id and (contact_id = new.id or lead_contact_id = new.id) and signer_name is not null;
  end if;
  return null;
end $$;

revoke execute on function public.person_signer_erase_on_contact() from public, anon, authenticated;

create or replace trigger contacts_erase_takes_signers
  after update of erased_at on public.contacts
  for each row execute function public.person_signer_erase_on_contact();

comment on function public.person_signer_erase_on_contact() is
  'When a person is erased, the name a reply''s reading found as its signer goes with them (0036, 0052).';

/* ----------------------------------------------------------------------- 5b. a signer's name, and its doors -- */

-- The one writer of a signer's name: a member's press (p_via press, p_by the member) or the reading's own plan when
-- automatic naming is on (p_via auto, p_by null). Taken only while the reply still offers it, from a name the engine may
-- replace (the business's own, a wire's, or none), never over a settled name automatically. A press settles the name.
create or replace function public.person_name_take(p_tenant_id uuid, p_contact_id uuid, p_message_id uuid, p_by uuid,
                                                   p_via text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.contacts%rowtype;
  v_reply  public.reach_out_replies%rowtype;
begin
  if p_via is null or p_via not in ('press', 'auto') then
    raise exception 'A signer''s name is taken by a press or automatically.' using errcode = '22023';
  end if;
  select * into v_person from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id and erased_at is null and merged_into_contact_id is null
   for update;
  if not found then
    return jsonb_build_object('named', false, 'why', 'gone');
  end if;
  select * into v_reply from public.reach_out_replies r
   where r.message_id = p_message_id and r.tenant_id = p_tenant_id
     and r.contact_id = p_contact_id
   for update;
  if not found or v_reply.signer_name is null then
    return jsonb_build_object('named', false, 'why', 'no_signer');
  end if;
  if v_reply.signer_state <> 'offered' or v_reply.undone_at is not null then
    return jsonb_build_object('named', false, 'why', 'settled');
  end if;
  if v_person.display_name is not null and public.person_name_rank(v_person.name_source) >= public.person_name_rank('signature') then
    return jsonb_build_object('named', false, 'why', 'named');
  end if;
  if p_via = 'auto' and v_person.name_settled_at is not null then
    return jsonb_build_object('named', false, 'why', 'settled');
  end if;
  update public.contacts
     set display_name = v_reply.signer_name, name_source = 'signature',
         name_settled_at = case when p_via = 'press' then now() end, updated_at = now()
   where id = p_contact_id;
  update public.reach_out_replies
     set signer_state = 'adopted', signer_settled_at = now(), signer_settled_by = p_by,
         signer_was = coalesce(signer_was, case when v_person.display_name is null then 'none' else v_person.name_source end)
   where message_id = p_message_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_strip_nulls(jsonb_build_object('named', true, 'by', p_by, 'source', 'signature',
                                               'was', v_person.name_source, 'via', p_via, 'message_id', p_message_id)));
  return jsonb_build_object('named', true, 'contact_id', p_contact_id, 'name', v_reply.signer_name);
end $$;

revoke execute on function public.person_name_take(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.person_name_take(uuid, uuid, uuid, uuid, text) to service_role;

comment on function public.person_name_take(uuid, uuid, uuid, uuid, text) is
  'Decision 0052: the one writer of a reply''s signer''s name onto its writer (display_name, name_source signature), by a member''s press (settled) or automatically (never over a settled name), only while the reply offers it and only over the business''s own name, a wire''s or none; the reply''s signer adopted, contact.named {source, was, via, message_id}. Answers {named} or {named false, why}.';

-- "Use this name": an acting member (owner, operator, partner) takes the signer's name.
create or replace function public.person_name_adopt(p_contact_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  return public.person_name_take(v_tenant, p_contact_id, p_message_id, v_user, 'press');
end $$;

revoke execute on function public.person_name_adopt(uuid, uuid) from public, anon;
grant execute on function public.person_name_adopt(uuid, uuid) to authenticated, service_role;

comment on function public.person_name_adopt(uuid, uuid) is
  'Use this name (0052): an acting member takes the name a reply was signed with for its writer, through person_name_take (press: the name is settled). Answers {named, name} or {named false, why: gone | no_signer | settled | named}.';

-- Undo: the name the signer replaced goes back (the business's, for a stand-in; none, for a person who had none), and is
-- settled, so the same sign-off is never taken again; the reply's signer is undone.
create or replace function public.person_name_undo(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_person   public.contacts%rowtype;
  v_reply    public.reach_out_replies%rowtype;
  v_business text;
  v_name     text;
  v_source   text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  select * into v_person from public.contacts where id = p_contact_id for update;
  if v_person.name_source is distinct from 'signature' then
    return jsonb_build_object('undone', false, 'why', 'not_a_signer');
  end if;
  select * into v_reply from public.reach_out_replies r
   where r.tenant_id = v_tenant and r.contact_id = p_contact_id
     and r.signer_state = 'adopted'
   order by r.signer_settled_at desc
   limit 1
   for update;
  if not found then
    return jsonb_build_object('undone', false, 'why', 'not_a_signer');
  end if;
  if v_reply.signer_was = 'lead' then
    select left(nullif(btrim(l.business_name), ''), 80) into v_business
      from public.leads l
     where l.id = coalesce(v_person.lead_id, v_reply.lead_id) and l.tenant_id = v_tenant
       and l.erased_at is null and l.blanked_at is null;
  end if;
  v_name := v_business;
  v_source := case when v_business is not null then 'lead' end;
  update public.contacts
     set display_name = v_name, name_source = v_source, name_settled_at = now(), updated_at = now()
   where id = p_contact_id;
  update public.reach_out_replies
     set signer_state = 'undone', signer_settled_at = now(), signer_settled_by = v_user
   where message_id = v_reply.message_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_strip_nulls(jsonb_build_object('named', v_name is not null, 'by', v_user, 'source', v_source,
                                               'was', 'signature', 'via', 'undo', 'message_id', v_reply.message_id)));
  return jsonb_build_object('undone', true, 'contact_id', p_contact_id, 'name', v_name);
end $$;

revoke execute on function public.person_name_undo(uuid) from public, anon;
grant execute on function public.person_name_undo(uuid) to authenticated, service_role;

comment on function public.person_name_undo(uuid) is
  'Undo of Use this name (0052): the name the signer replaced goes back (the business''s, from the lead they work at, while it stands; else none), settled, so that sign-off is never taken again; the reply''s signer undone; contact.named {via undo}. An acting member''s.';

-- The notice's ×: the signer is declined for everyone, and the name is settled so nothing takes it automatically.
create or replace function public.person_name_decline(p_contact_id uuid, p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.contacts where id = p_contact_id for update;
  update public.reach_out_replies r
     set signer_state = 'declined', signer_settled_at = now(), signer_settled_by = v_user
   where r.message_id = p_message_id and r.tenant_id = v_tenant
     and r.contact_id = p_contact_id
     and r.signer_state = 'offered';
  if not found then
    return jsonb_build_object('declined', false, 'why', 'settled');
  end if;
  update public.contacts set name_settled_at = now(), updated_at = now() where id = p_contact_id;
  return jsonb_build_object('declined', true, 'contact_id', p_contact_id);
end $$;

revoke execute on function public.person_name_decline(uuid, uuid) from public, anon;
grant execute on function public.person_name_decline(uuid, uuid) to authenticated, service_role;

comment on function public.person_name_decline(uuid, uuid) is
  'The × on "Use this name" (0052): the reply''s signer declined for everyone and the person''s name settled, so automatic naming never takes it; a different signer later is offered again. An acting member''s.';

/* ------------------------------------------------------------------------- 5c. where a person works, by hand -- */

create or replace function public.person_join_lead(p_contact_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.leads l
                  where l.id = p_lead_id and l.tenant_id = v_tenant and l.erased_at is null and l.blanked_at is null) then
    raise exception 'That business is not in your workspace.' using errcode = 'P0002';
  end if;
  update public.contacts
     set lead_id = p_lead_id, lead_settled_at = now(), updated_at = now()
   where id = p_contact_id and lead_id is distinct from p_lead_id;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.business_linked', 'contact', 'contact', p_contact_id,
            jsonb_build_object('lead_id', p_lead_id, 'via', 'hand', 'by', v_user));
  else
    update public.contacts set lead_settled_at = now() where id = p_contact_id;
  end if;
  return jsonb_build_object('contact_id', p_contact_id, 'lead_id', p_lead_id);
end $$;

revoke execute on function public.person_join_lead(uuid, uuid) from public, anon;
grant execute on function public.person_join_lead(uuid, uuid) to authenticated, service_role;

comment on function public.person_join_lead(uuid, uuid) is
  'Link a business (0052): an acting member says a person works at a lead of their workspace; settled, so the link never moves by itself; contact.business_linked {lead_id, via hand, by}.';

create or replace function public.person_leave_lead(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_lead   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id, c.lead_id into v_tenant, v_lead from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update public.contacts set lead_id = null, lead_settled_at = now(), updated_at = now() where id = p_contact_id;
  if v_lead is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.business_unlinked', 'contact', 'contact', p_contact_id,
            jsonb_build_object('lead_id', v_lead, 'via', 'hand', 'by', v_user));
  end if;
  return jsonb_build_object('contact_id', p_contact_id, 'left', v_lead is not null);
end $$;

revoke execute on function public.person_leave_lead(uuid) from public, anon;
grant execute on function public.person_leave_lead(uuid) to authenticated, service_role;

comment on function public.person_leave_lead(uuid) is
  'Not at this business (0052): an acting member unlinks a person from the lead they work at; settled, so a later lead or reply never links them again by itself; contact.business_unlinked {lead_id, via hand, by}.';

-- Got it (canvas A, Up next): the member a note is for says they read it, and it leaves their Up next. Kept on the note,
-- so every tab and device of theirs agrees; a note for someone else, or for everyone, is never theirs to mark.
alter table public.person_notes add column if not exists for_seen_at timestamptz;

comment on column public.person_notes.for_seen_at is
  'When the member the note is for said Got it (0052, canvas A Up next): the note leaves their Up next; null until then.';

create or replace function public.person_note_seen(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_tenant  uuid;
  v_for     uuid;
  v_contact uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select n.tenant_id, n.for_user_id, n.contact_id into v_tenant, v_for, v_contact from public.person_notes n where n.id = p_note_id;
  -- Any member of the workspace may say they read a note that is for them, a viewer too (the notes' own read, 00157),
  -- through the one member check for a definer door: a partner's seat only on a session that showed its second factor.
  if v_tenant is null or not public.may_read_workspace(v_tenant) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_for is distinct from v_user then
    return jsonb_build_object('error', 'not_yours');
  end if;
  update public.person_notes set for_seen_at = now() where id = p_note_id and for_seen_at is null;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.note_seen', 'contact', 'contact', v_contact,
            jsonb_build_object('note_id', p_note_id, 'by', v_user));
  end if;
  return jsonb_build_object('seen', p_note_id);
end $$;

revoke execute on function public.person_note_seen(uuid) from public, anon;
grant execute on function public.person_note_seen(uuid) to authenticated, service_role;

comment on function public.person_note_seen(uuid) is
  'Got it (0052, canvas A Up next): the member a note is for marks it read; it leaves their Up next. Their own mark: a note for anyone else is not_yours.';

/* ------------------------------------------------------- 6. the one door a person passes, copied from 00384 -- */

create or replace function public.resolve_person(p_tenant_id uuid, p_channel text DEFAULT NULL::text, p_external text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_assurance text DEFAULT 'observed'::text, p_source text DEFAULT 'manual'::text, p_detail jsonb DEFAULT '{}'::jsonb, p_seen_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_user      uuid := auth.uid();
  v_channel   text := nullif(btrim(coalesce(p_channel, '')), '');
  v_external  text := nullif(btrim(coalesce(p_external, '')), '');
  v_digits    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_plus      boolean := left(btrim(coalesce(p_phone, '')), 1) = '+';
  v_phone     text;
  v_email     text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name      text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_assurance text := coalesce(nullif(btrim(p_assurance), ''), 'observed');
  v_source    text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_seen      timestamptz := coalesce(p_seen_at, now());
  v_observed  boolean;              -- they wrote to us, or called: the wire's own word
  v_id        uuid;
  v_by        text;                 -- identity | phone | email | race
  v_row       public.contacts%rowtype;
  v_new_email text;
  v_email_out text;                 -- set | kept | taken | null
  v_filled    text[] := '{}';
  v_identity  text;                 -- added | raised | kept | null
  v_added     boolean;
  v_other     uuid;                 -- the doubt: the other record one of the identities names
  v_other_row public.contacts%rowtype;
  v_seen_as   text;                 -- name | phone | email
  v_doubt_id  uuid;
  v_lead      uuid;                 -- the lead this person turned out to be (step 5)
  v_outcome   text;
  v_existed   boolean;
  -- Where the name this call gives comes from (0052): a calendar, a client list, the business's own name, or a member.
  v_name_src  text := case coalesce(nullif(btrim(p_source), ''), 'manual')
                        when 'calendar' then 'calendar' when 'import' then 'import' when 'lead' then 'lead'
                        else 'typed' end;
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_assurance not in ('observed', 'asserted', 'found') then
    raise exception 'An identity is observed, asserted or found.' using errcode = '22023';
  end if;
  if (v_channel is null) <> (v_external is null) then
    raise exception 'An identity needs its channel and its id.' using errcode = '22023';
  end if;
  if v_channel is not null and v_channel not in ('whatsapp', 'voice', 'sms', 'email', 'instagram') then
    raise exception 'That is not a channel.' using errcode = '22023';
  end if;
  -- The number as contracts normalizePhone reads it: a leading + is the country's word, so eight to fifteen digits
  -- after it are as given; a bare ten digits are North American; eight to fifteen bare digits are as given (00367).
  if v_digits = '' then
    v_phone := null;
  elsif char_length(v_digits) = 10 and not v_plus then
    v_phone := '+1' || v_digits;
  elsif char_length(v_digits) between 8 and 15 then
    v_phone := '+' || v_digits;
  end if;
  if (v_digits <> '' and v_phone is null) or (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_external is null and v_phone is null and v_email is null and v_name is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  v_observed := v_assurance = 'observed';

  -- The erased stay erased on the passive paths (a member typing, a feed, the finder: 00263, 00331). A person who
  -- asked to be forgotten and then writes or calls again is a new person, as the inbound doors have always made them.
  if not v_observed and (
       (v_phone is not null and exists (
          select 1 from contacts c
           where c.tenant_id = p_tenant_id and c.erased_phone_hash = public.erasure_digest(p_tenant_id, v_phone)))
    or (v_email is not null and exists (
          select 1 from contacts c
           where c.tenant_id = p_tenant_id and c.erased_email_hash = public.erasure_digest(p_tenant_id, v_email)))) then
    raise exception 'That person asked to be forgotten.' using errcode = 'PE001';
  end if;

  -- One resolution at a time per identity (the key ingest_inbound and ingest_call lock), per number and per address,
  -- always in this order, so two doors never make one person twice and never wait on each other in a ring.
  if v_external is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|' || v_channel || '|' || v_external, 42));
  end if;
  if v_phone is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|phone|' || v_phone, 42));
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|email|' || v_email, 42));
  end if;

  -- The match: the identity, then the number, then the address.
  if v_external is not null then
    select c.id into v_id
      from contact_identities i
      join contacts c on c.id = i.contact_id
     where i.tenant_id = p_tenant_id and i.channel = v_channel and i.external_id = v_external
       and c.erased_at is null
     limit 1;
    if v_id is not null then
      -- An identity moved by a merge (00326) points at the kept record; one hop is every hop a merge leaves.
      select coalesce(c.merged_into_contact_id, c.id) into v_id from contacts c where c.id = v_id;
      v_by := 'identity';
    end if;
  end if;
  if v_id is null and v_phone is not null then
    select c.id into v_id from contacts c
     where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
       and c.erased_at is null and c.merged_into_contact_id is null
     limit 1;
    if v_id is not null then v_by := 'phone'; end if;
  end if;
  if v_id is null and v_email is not null then
    select c.id into v_id from contacts c
     where c.tenant_id = p_tenant_id and c.email = v_email
       and c.erased_at is null and c.merged_into_contact_id is null
       and (v_phone is null or c.phone_e164 is null)   -- two numbers are two people
     limit 1;
    if v_id is not null then v_by := 'email'; end if;
  end if;

  if v_id is null then
    -- Nobody: they are made, with the address only when nobody here holds it; a held address is a doubt.
    v_new_email := case
      when v_email is not null
       and not exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email)
      then v_email
    end;
    if v_email is not null and v_new_email is null then
      v_email_out := 'taken';
      select c.id into v_other from contacts c
       where c.tenant_id = p_tenant_id and c.email = v_email
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      if v_other is not null then v_seen_as := 'email'; end if;
    end if;
    -- A name alone is never a match: a living record with the same name is a doubt beside the new one.
    if v_name is not null and v_seen_as is null then
      select c.id into v_other from contacts c
       where c.tenant_id = p_tenant_id and lower(c.display_name) = lower(v_name)
         and c.erased_at is null and c.merged_into_contact_id is null and c.display_name is not null
       limit 1;
      if v_other is not null then v_seen_as := 'name'; end if;
    end if;
    begin
      insert into contacts (tenant_id, phone_e164, email, display_name, wa_profile_name, last_seen_at, name_source)
      values (p_tenant_id, v_phone, v_new_email,
              case when v_observed then null else v_name end,
              case when v_observed then v_name end,
              v_seen,
              case when v_observed or v_name is null then null else v_name_src end)
      returning id into v_id;
      v_outcome := 'new';
      v_existed := false;
      if v_new_email is not null then v_email_out := 'set'; end if;
      -- Where they came from, when it was not by writing or calling: the message or the call is that record, and the
      -- first-touch trigger on it says the wire (00306).
      if not v_observed then
        insert into events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
                coalesce(p_detail, '{}'::jsonb)
                || jsonb_build_object('source', v_source, 'by', coalesce(p_detail->>'by', v_user::text)));
      end if;
    exception when unique_violation then
      -- Someone else won the race on the number or the address: theirs is the one, and it is filled below.
      v_id := null;
      if v_phone is not null then
        select c.id into v_id from contacts c
         where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
           and c.erased_at is null and c.merged_into_contact_id is null
         limit 1;
      end if;
      if v_id is null and v_new_email is not null then
        select c.id into v_id from contacts c
         where c.tenant_id = p_tenant_id and c.email = v_new_email
           and c.erased_at is null and c.merged_into_contact_id is null
         limit 1;
      end if;
      if v_id is null then raise; end if;
      v_by := 'race';
      v_email_out := null;
      v_seen_as := null;
      v_other := null;
    end;
  end if;

  if v_outcome is null then
    -- Found. What we did not have is worth keeping; what we have is never overwritten, but a name the wire gave
    -- follows the wire.
    select * into v_row from contacts where id = v_id;
    v_outcome := 'matched';
    v_existed := true;
    if v_name is not null then
      if v_observed then
        if v_row.wa_profile_name is distinct from v_name then
          update contacts set wa_profile_name = v_name, updated_at = now() where id = v_id;
          v_filled := array_append(v_filled, 'wa_profile_name');
        end if;
      -- Empty is filled; a name is replaced only by a name of a strictly higher rank (0052: a calendar or a client
      -- list over the business's own name, a member over either), never a settled one, and never by the same words.
      elsif v_row.display_name is null
         or (v_row.name_settled_at is null
             and public.person_name_rank(v_row.name_source) < public.person_name_rank(v_name_src)
             and lower(v_row.display_name) is distinct from lower(v_name)) then
        update contacts set display_name = v_name, name_source = v_name_src, updated_at = now() where id = v_id;
        v_filled := array_append(v_filled, 'display_name');
      end if;
    end if;
    if v_phone is not null and v_row.phone_e164 is null then
      begin
        update contacts set phone_e164 = v_phone, updated_at = now() where id = v_id;
        v_filled := array_append(v_filled, 'phone_e164');
      exception when unique_violation then
        -- Another person here holds the number: theirs stays theirs, and the pair is a doubt.
        select c.id into v_other from contacts c
         where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone and c.id <> v_id
         limit 1;
        if v_other is not null then v_seen_as := 'phone'; end if;
      end;
    end if;
    if v_email is not null then
      if v_row.email is not null then
        v_email_out := 'kept';
      elsif exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id) then
        v_email_out := 'taken';
        if v_seen_as is null then
          select c.id into v_other from contacts c
           where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id
             and c.erased_at is null and c.merged_into_contact_id is null
           limit 1;
          if v_other is not null then v_seen_as := 'email'; end if;
        end if;
      else
        begin
          perform public.set_person_email(v_id, v_email);
          v_email_out := 'set';
          v_filled := array_append(v_filled, 'email');
        exception when unique_violation then
          v_email_out := 'taken';   -- another line wrote it between the look and the write
        end;
      end if;
    end if;
    if v_observed then
      update contacts set last_seen_at = v_seen where id = v_id and last_seen_at < v_seen;
    end if;
    if cardinality(v_filled) > 0 then v_outcome := 'filled'; end if;
  end if;

  -- The identity, with how sure the door was; one already held is written only when its word gets stronger.
  if v_external is not null then
    insert into contact_identities (tenant_id, contact_id, channel, external_id, assurance)
    values (p_tenant_id, v_id, v_channel, v_external, v_assurance)
    on conflict (tenant_id, channel, external_id) do update
      set assurance = excluded.assurance
      where contact_identities.contact_id = excluded.contact_id
        and (case excluded.assurance when 'observed' then 3 when 'asserted' then 2 else 1 end)
          > (case contact_identities.assurance when 'observed' then 3 when 'asserted' then 2 else 1 end)
    returning (xmax = 0) into v_added;
    v_identity := case when v_added is null then 'kept' when v_added then 'added' else 'raised' end;
  end if;

  -- The doubt: only a pair 0028's door could join, two numbers and two addresses being two people by rule; written
  -- once per pair, whichever way round it was seen, and left alone once settled.
  if v_other is not null then
    select * into v_row from contacts where id = v_id;
    select * into v_other_row from contacts where id = v_other;
    if (v_row.phone_e164 is null or v_other_row.phone_e164 is null or v_row.phone_e164 = v_other_row.phone_e164)
       and (v_row.email is null or v_other_row.email is null or v_row.email = v_other_row.email) then
      insert into person_doubts (tenant_id, contact_id, other_id, seen)
      values (p_tenant_id, least(v_id, v_other), greatest(v_id, v_other), v_seen_as)
      on conflict (tenant_id, contact_id, other_id) do nothing
      returning id into v_doubt_id;
    else
      v_other := null;
      v_seen_as := null;
    end if;
  end if;

  -- The lead this person is (step 5): whenever the door learns something a lead could be matched on (a new person, a
  -- number or an address filled, an identity added), the lead that holds their number or address and names nobody yet
  -- converts onto them, through the one converter. A caller converting a lead itself names it in p_detail and is left to
  -- it; a reach-out's cold first email holds the link off (chanlytics.link_lead). Never at the cost of the arrival: a
  -- link that fails warns and is undone alone.
  if v_outcome = 'new' or cardinality(v_filled) > 0 or v_identity = 'added' then
    begin
      v_lead := public.person_link_lead(p_tenant_id, v_id, v_assurance, v_source, v_outcome = 'new',
                                        nullif(p_detail->>'lead_id', '')::uuid);
    exception when others then
      raise warning 'person_link_lead: %', sqlerrm;
      v_lead := null;
    end;
  end if;

  -- The ledger's row, when the call changed something (00384): a person made, a field filled (the outcome says
  -- either), an identity added or its word raised, a doubt written, or a lead linked. A call that found the person
  -- and learned nothing writes none: the message, the call or the appointment that asked is the record.
  if v_outcome <> 'matched' or v_identity in ('added', 'raised') or v_doubt_id is not null or v_lead is not null then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'person.resolved', 'contact', 'contact', v_id,
            jsonb_build_object(
              'outcome', v_outcome, 'matched_by', v_by, 'source', v_source, 'channel', v_channel,
              'assurance', v_assurance, 'by', v_user, 'filled', to_jsonb(v_filled), 'identity', v_identity,
              'doubt', v_other, 'doubt_seen', v_seen_as, 'lead', v_lead));
  end if;

  return jsonb_build_object(
    'contact_id', v_id, 'outcome', v_outcome, 'existed', v_existed, 'matched_by', v_by,
    'email', v_email_out, 'filled', to_jsonb(v_filled), 'identity', v_identity,
    'doubt', v_other, 'doubt_seen', v_seen_as, 'doubt_id', v_doubt_id, 'lead_id', v_lead);
end $_$;


COMMENT ON FUNCTION public.resolve_person(p_tenant_id uuid, p_channel text, p_external text, p_phone text, p_email text, p_name text, p_assurance text, p_source text, p_detail jsonb, p_seen_at timestamp with time zone) IS 'The one door a person is resolved by (decision 0034): the erasure digests first on the passive paths, then the identity, the number and the address in that order, two numbers being two people; fills what is empty and never overwrites, a name the wire gave following the wire, but a name of a strictly higher rank replaces an unsettled one (0052: person_name_rank; a calendar or a client list over the business''s own name, a member over either) and records where it came from (name_source); never merges, and writes a doubt instead for a pair the merge could join; links the lead holding their number or address whenever it learns one (person_link_lead, 00346); contact.added for a new person a member, a feed or the finder brought, person.resolved when the call changed something (a person made, a field filled, an identity added or raised, a doubt written, a lead linked; 00384). The service role''s and the doors'' alone.';

REVOKE ALL ON FUNCTION public.resolve_person(p_tenant_id uuid, p_channel text, p_external text, p_phone text, p_email text, p_name text, p_assurance text, p_source text, p_detail jsonb, p_seen_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.resolve_person(p_tenant_id uuid, p_channel text, p_external text, p_phone text, p_email text, p_name text, p_assurance text, p_source text, p_detail jsonb, p_seen_at timestamp with time zone) TO service_role;

/* ------------------------------------------------------------ 7. a member's typed name, copied from 00131 -- */

create or replace function public.set_person_name(p_contact_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_name   text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_was    text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  select c.name_source into v_was from contacts c where c.id = p_contact_id;
  -- A member's name is typed and settled (0052): nothing the engine finds replaces it.
  update contacts
     set display_name = v_name, name_source = case when v_name is null then null else 'typed' end,
         name_settled_at = now(), updated_at = now()
   where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_strip_nulls(jsonb_build_object('named', v_name is not null, 'by', v_user,
                                               'source', case when v_name is not null then 'typed' end,
                                               'was', v_was, 'via', 'typed')));
  return jsonb_build_object('contact_id', p_contact_id, 'name', v_name);
end $fn$;

comment on function public.set_person_name(uuid, text) is
  'Owner or operator names a person; empty clears it and the WhatsApp name or the number shows again. The name is typed and settled (0052: name_source typed, name_settled_at): nothing the engine finds replaces it. The event records that the name changed, where it came from and what it replaced, and by whom, never the name.';

revoke execute on function public.set_person_name(uuid, text) from public, anon;
grant execute on function public.set_person_name(uuid, text) to authenticated, service_role;

/* -------------------------------------------------- 8. whose reply it is, and the reading, copied from 00237, 00222 -- */

create or replace function public.reach_out_reply_of(p_tenant_id uuid, p_message_id uuid, p_days int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select m.id, m.conversation_id, coalesce(m.contact_id, c.contact_id) as contact_id, c.contact_id as thread_contact,
           m.created_at, coalesce(m.channel_ts, m.created_at) as received_at, m.body, m.meta
      from public.messages m
      join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
     where m.id = p_message_id and m.tenant_id = p_tenant_id
       and m.channel = 'email' and m.direction = 'inbound' and m.sender = 'customer'
  ), cited as (
    select array_remove(
             array[m.meta->'email'->>'in_reply_to']
             || array(select jsonb_array_elements_text(
                        case when jsonb_typeof(m.meta->'email'->'references') = 'array'
                             then m.meta->'email'->'references' else '[]'::jsonb end)),
             null) as ids
      from m
  ), found as (
    -- The email it answers or cites, by its Message-ID (messages_email_message_id_idx), then its send.
    (select s.id, 1 as how, s.sent_at
       from cited cross join m
       join public.messages o
         on o.tenant_id = p_tenant_id and o.channel = 'email' and o.direction = 'outbound'
        and o.meta->'email'->>'message_id' = any (cited.ids)
       join public.reach_out_sends s on s.message_id = o.id and s.tenant_id = o.tenant_id
      where s.state = 'sent'
        and s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
      order by s.sent_at desc
      limit 1)
    union all
    -- Else the latest email a reach-out sent to the thread's person, as the send names them
    -- (reach_out_sends_contact)...
    (select s.id, 2 as how, s.sent_at
       from m
       join public.reach_out_sends s
         on s.tenant_id = p_tenant_id and s.contact_id = m.thread_contact and s.state = 'sent'
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
    union all
    -- ...or as its lead names them now (leads_tenant_contact).
    (select s.id, 3 as how, s.sent_at
       from m
       join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = m.thread_contact
       join public.reach_out_sends s on s.tenant_id = l.tenant_id and s.lead_id = l.id and s.state = 'sent'
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
  ), one as (
    select f.id, f.how from found f order by f.how, f.sent_at desc limit 1
  )
  select jsonb_build_object(
    'send_id', s.id,
    -- Whether the reply cites our email by its Message-ID (0052): only then is its writer linked to the lead.
    'cited', one.how = 1,
    'lead_id', l.id,
    'lead_contact_id', l.contact_id,
    'lead_email', lower(btrim(l.email)),
    'lead_website', l.website_host,
    'lead_website_root', l.website_root,
    'root_id', s.root_id,
    'playbook_id', s.playbook_id,
    'answered_message_id', s.message_id,
    'answered_text', left(o.body, 600),
    -- The address the email went to, read off its frozen request as the consent door reads it.
    'answered_to', lower(btrim(coalesce(o.meta->'email'->'request'->'to'->>0, o.meta->'email'->>'to'))),
    'business', l.business_name,
    'chain', root.name,
    'signed_by', root.signed_by,
    'sent_at', s.sent_at,
    'tz', t.timezone,
    'conversation_id', m.conversation_id,
    'contact_id', m.contact_id,
    'claim', case when m.meta->'email'->>'claim' in ('person', 'automated', 'auto_reply')
                  then m.meta->'email'->>'claim' else 'person' end,
    'from', m.meta->'email'->>'from',
    -- The From line's own words, and the names a signer can never be: the workspace's and its members' (0052).
    'from_name', m.meta->'email'->>'from_name',
    'workspace', t.name,
    'team', (select coalesce(jsonb_agg(p.display_name), '[]'::jsonb)
               from public.memberships ms
               join public.profiles p on p.user_id = ms.user_id
              where ms.tenant_id = s.tenant_id and btrim(p.display_name) <> ''),
    'subject', m.meta->'email'->>'subject',
    'text', m.body,
    'received_at', m.received_at)
    from one
    join public.reach_out_sends s on s.id = one.id
    join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
    left join public.messages o on o.id = s.message_id and o.tenant_id = s.tenant_id
    left join public.playbooks root on root.id = s.root_id
    left join public.tenants t on t.id = s.tenant_id
    cross join m
$$;
revoke execute on function public.reach_out_reply_of(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reach_out_reply_of(uuid, uuid, int) to service_role;
comment on function public.reach_out_reply_of(uuid, uuid, int) is
  'Whose reply a received email is (Reach out Part 5, G5): the reach-out email it answers or cites, else the latest one sent to its thread''s person, within p_days before it arrived. Answers the send, the lead, the lead''s person, address and website (and whether that website is its host''s root, 00237), whether the reply cites our email by its Message-ID (cited, 0052), the chain, the email it answers (its first 600 characters), the workspace''s zone, and the reply''s own claim, sender, subject and words; null when it answers none. Service role only.';

create or replace function public.reach_out_reply_apply(
  p_tenant_id  uuid,
  p_message_id uuid,
  p_reading    jsonb,
  p_plan       jsonb,
  p_reread     int,
  p_days       int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_of       jsonb;
  v_intent   text := p_reading->>'intent';
  v_unread   text := nullif(p_reading->>'unread', '');
  v_summary  text := nullif(btrim(coalesce(p_reading->>'summary', '')), '');
  v_day      date;
  v_refer    text := nullif(btrim(coalesce(p_reading->>'refer_to', '')), '');
  v_until    timestamptz := nullif(p_plan->>'awayUntil', '')::timestamptz;
  v_tell     boolean := coalesce((p_plan->>'tell')::boolean, false);
  v_reread   int := coalesce(p_reread, 0);
  v_row      public.reach_out_replies%rowtype;
  v_lead     uuid;
  v_person   uuid;
  v_changed  jsonb := '{}'::jsonb;
  v_before   public.contacts%rowtype;
  v_leads    jsonb;
  v_address  text;
  v_domain   text;
  v_skipped  int := 0;
  v_step     jsonb;
  v_consent  jsonb;
  v_hold     record;
  v_holds    jsonb := '[]'::jsonb;
  v_owed     boolean := false;
  -- Who wrote it, whether it cites our email, and who signed it (0052).
  v_writer   uuid;
  v_cited    boolean;
  v_signer   text := left(nullif(btrim(regexp_replace(coalesce(p_reading->'signer'->>'name', ''), '\s+', ' ', 'g')), ''), 80);
  v_title    text := left(nullif(btrim(regexp_replace(coalesce(p_reading->'signer'->>'title', ''), '\s+', ' ', 'g')), ''), 80);
  v_linked   boolean := false;
begin
  if v_intent is null or v_intent not in ('interested', 'question', 'not_now', 'no', 'wrong_person', 'away', 'other') then
    raise exception 'a reading names one of the seven intents' using errcode = '22023';
  end if;
  if v_unread is not null and (v_intent <> 'other' or v_unread not in ('no_model', 'may_not_spend', 'day_spent', 'model_failed')) then
    raise exception 'a reply that was not read is other, and says why' using errcode = '22023';
  end if;
  if v_reread < 0 or v_reread > 3 then
    raise exception 'a reply is read again at most three times' using errcode = '22023';
  end if;
  v_day := case when coalesce(p_reading->>'day', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p_reading->>'day')::date end;

  v_of := public.reach_out_reply_of(p_tenant_id, p_message_id, p_days);
  if v_of is null then
    return jsonb_build_object('applied', false, 'why', 'not_a_reply');
  end if;
  v_lead   := (v_of->>'lead_id')::uuid;
  v_person := (v_of->>'lead_contact_id')::uuid;
  v_writer := (v_of->>'contact_id')::uuid;
  v_cited  := coalesce((v_of->>'cited')::boolean, false);
  -- A reply that cites our email from another address at the business links its writer to the lead (0052, 1b below);
  -- what the reading records (a no, a step, the leads it closes) stays the lead's own person's, as before. A reply that
  -- cites nothing links nobody: nothing is inferred from a domain.
  -- An out-of-office's pause is an automatic reply's alone (the table's CHECK says so too).
  if v_intent <> 'away' or v_of->>'claim' <> 'auto_reply' then
    v_until := null;
  end if;

  -- The lead's person first, before anything takes a lighter lock on them (the row's own keys do): the consent door,
  -- another reading of theirs and the undo all lock them, so two of these never wait on each other in a circle.
  if v_person is not null then
    perform 1 from public.contacts where id = v_person and tenant_id = p_tenant_id for update;
  end if;

  -- 1. The row: once.
  if v_reread = 0 then
    insert into public.reach_out_replies (message_id, tenant_id, conversation_id, contact_id, lead_id, lead_contact_id,
                                          send_id, answered_message_id, claim, intent, summary, named_day, refer_to,
                                          unread, until_at, plan)
    values (p_message_id, p_tenant_id, (v_of->>'conversation_id')::uuid, (v_of->>'contact_id')::uuid, v_lead, v_person,
            (v_of->>'send_id')::uuid, (v_of->>'answered_message_id')::uuid, v_of->>'claim', v_intent,
            left(v_summary, 160), v_day, left(v_refer, 120), v_unread, v_until, coalesce(p_plan, '{}'::jsonb))
    on conflict (message_id) do nothing
    returning * into v_row;
    if v_row.message_id is null then
      return jsonb_build_object('applied', false);
    end if;
  else
    -- A re-read, by compare-and-set: still unread, not undone, and at the re-read before this one.
    select * into v_row from public.reach_out_replies r
     where r.message_id = p_message_id and r.tenant_id = p_tenant_id
     for update;
    if v_row.message_id is null or v_row.unread is null or v_row.undone_at is not null
       or v_row.rereads <> v_reread - 1 then
      return jsonb_build_object('applied', false);
    end if;
    -- Due a notice when the plan tells (news: told once more, the claim taken back), and still due one, in this
    -- reading's words, when the reading before it was owed one the owner was never given (its mail failed). An owed
    -- notice keeps its claim: a run still telling it marks it told, and this stage then has nothing to tell.
    v_owed := coalesce((v_row.plan->>'tell')::boolean, false) and v_row.told_at is null;
    update public.reach_out_replies r
       set intent = v_intent, summary = left(v_summary, 160), named_day = v_day, refer_to = left(v_refer, 120),
           unread = v_unread, until_at = v_until, plan = coalesce(p_plan, '{}'::jsonb),
           rereads = v_reread, reread_at = now(),
           read_at = case when v_unread is null then now() else r.read_at end,
           tell_claimed_at = case when v_tell then null else r.tell_claimed_at end,
           told_at = case when v_tell then null else r.told_at end
     where r.message_id = p_message_id
    returning * into v_row;
    v_tell := v_tell or v_owed;
  end if;

  -- 1b. The writer of a reply that cites our email is at the lead's business (0052): linked, unless a member settled
  -- where they work. Once, on the first reading.
  if v_reread = 0 and v_cited and v_writer is not null and v_writer is distinct from v_person then
    update public.contacts c
       set lead_id = v_lead, updated_at = now()
     where c.id = v_writer and c.tenant_id = p_tenant_id and c.erased_at is null
       and c.lead_id is null and c.lead_settled_at is null;
    v_linked := found;
    if v_linked then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.business_linked', 'contact', 'contact', v_writer,
              jsonb_build_object('lead_id', v_lead, 'via', 'reply', 'message_id', p_message_id));
      v_changed := v_changed || jsonb_build_object('linked', v_writer);
    end if;
  end if;

  -- 1c. The signer, the writer's: kept on the row, offered to the owner (the notice) or taken when the plan says so
  -- (automatic naming, switched off until its evals pass). Only a first reading or a re-read that finally read the reply
  -- has one.
  if v_signer is not null and v_row.signer_name is null then
    update public.reach_out_replies
       set signer_name = v_signer, signer_title = v_title, signer_state = 'offered',
           signer_was = (select case when c.display_name is null then 'none' else c.name_source end
                           from public.contacts c where c.id = v_writer)
     where message_id = p_message_id;
    if coalesce((p_plan->>'adoptSigner')::boolean, false) and v_writer is not null then
      v_changed := v_changed || jsonb_build_object('named',
        public.person_name_take(p_tenant_id, v_writer, p_message_id, null, 'auto')->'named');
    end if;
  end if;

  -- 2. The lead's sends still waiting in live runs: the door would refuse each (wrote back), so none waits for an owner.
  if p_plan->>'skipSends' = 'outreach_wrote_back' then
    with skipped as (
      update public.reach_out_sends s
         set state = 'skipped', reason = 'outreach_wrote_back'
        from public.broadcasts b
       where b.id = s.broadcast_id and b.tenant_id = s.tenant_id
         and b.state in ('pending_approval', 'scheduled', 'sending')
         and s.tenant_id = p_tenant_id and s.lead_id = v_lead and s.state in ('planned', 'held')
      returning 1
    )
    select count(*)::int into v_skipped from skipped;
    v_changed := v_changed || jsonb_build_object('skipped', v_skipped);
  end if;

  -- 3. Talking.
  if coalesce((p_plan->>'convert')::boolean, false) then
    v_changed := v_changed || jsonb_build_object('converted',
      public.lead_convert_by(p_tenant_id, v_lead, 'reply', jsonb_build_object('message_id', p_message_id), false)->'moved');
  end if;

  -- 4. The day they named.
  if nullif(p_plan->>'resumeAt', '') is not null then
    update public.leads set resume_at = (p_plan->>'resumeAt')::timestamptz
     where id = v_lead and tenant_id = p_tenant_id and erased_at is null and blanked_at is null;
  end if;

  -- 5. Said no: the one consent door, then every address the no stands behind and the business's own domain (N6) on
  -- the never-again list. What the undo needs is recorded: the consent it found and whether this no is the one that
  -- changed it (and the email its event names); every row the no stands behind, written now or there before (holds);
  -- the rows this transaction wrote (suppressions: their created_at is its now()); each lead it closed, with its stage
  -- before and the version it was left at. Each held row is written, or locked where it stands, until this commits,
  -- so an undo of another no that also holds it waits, and then sees this one.
  if coalesce((p_plan->>'saidNo')::boolean, false) and v_person is not null then
    select * into v_before from public.contacts where id = v_person and tenant_id = p_tenant_id;
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'stage', l.stage)), '[]'::jsonb) into v_leads
      from public.leads l
     where l.tenant_id = p_tenant_id and l.contact_id = v_person
       and l.stage in ('ready', 'nurture') and l.erased_at is null and l.blanked_at is null;
    v_consent := public.set_email_marketing(p_tenant_id, v_person, 'opted_out', 'reply',
                                            (v_of->>'answered_message_id')::uuid,
                                            jsonb_build_object('reading', p_message_id));
    v_address := lower(btrim(coalesce(p_plan->>'suppressFrom', '')));
    v_domain := lower(btrim(coalesce(p_plan->>'suppressDomain', '')));
    -- The person's address and the one the email went to (the consent door's own two), the lead's, the reply's From;
    -- and the domain. In one order, so two noes that share a row never wait on each other in a circle.
    for v_hold in
      select distinct h.kind, h.hash from (
        select 'email' as kind, public.lead_suppression_hash(p_tenant_id, a) as hash
          from unnest(array[lower(btrim(v_before.email)), lower(btrim(v_of->>'answered_to')),
                            lower(btrim(v_of->>'lead_email')), v_address]) as a
         where a like '%@%'
        union all
        select 'domain', public.lead_suppression_hash(p_tenant_id, v_domain)
         where v_domain <> '' and v_domain not like '%@%'
      ) h
      order by h.kind, h.hash
    loop
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (p_tenant_id, v_hold.kind, v_hold.hash, 'said_no')
      on conflict (tenant_id, kind, hash) do update set what = lead_suppressions.what;
      v_holds := v_holds || jsonb_build_array(jsonb_build_object('kind', v_hold.kind, 'hash', v_hold.hash));
    end loop;
    v_changed := v_changed || jsonb_build_object(
      'consent_was', v_before.email_marketing,
      'consent_source_was', v_before.email_marketing_source,
      'consent_changed', coalesce((v_consent->>'changed')::boolean, false),
      'consent_named', case when coalesce((v_consent->>'changed')::boolean, false)
                            then v_of->>'answered_message_id' end,
      'holds', v_holds,
      -- Only a row a reading wrote is ever the undo's to delete, never an unsubscribe's, a customer's or an erasure's.
      'suppressions', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'hash', x.hash) order by x.kind, x.hash), '[]'::jsonb)
          from public.lead_suppressions x
         where x.tenant_id = p_tenant_id and x.what = 'said_no' and x.kind in ('email', 'domain')
           and x.created_at = now()),
      'leads', (
        select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'stage', b->>'stage', 'version', l.version)), '[]'::jsonb)
          from jsonb_array_elements(v_leads) b
          join public.leads l on l.id = (b->>'id')::uuid and l.tenant_id = p_tenant_id
         where l.stage = 'archived' and l.closed_reason = 'said_no'));
  end if;

  -- 6. A dated step on the lead's person, once per message.
  if jsonb_typeof(p_plan->'step') = 'object' and v_person is not null then
    v_step := public.person_step_from_playbook(p_tenant_id, v_person, (p_plan->'step'->>'dueOn')::date,
                                               p_plan->'step'->>'words', null, p_message_id);
    v_changed := v_changed || jsonb_build_object('step', coalesce(v_step->'note'->>'id', v_step->>'error'));
  end if;

  update public.reach_out_replies
     set plan = coalesce(p_plan, '{}'::jsonb) || jsonb_build_object('tell', v_tell, 'changed', v_changed)
   where message_id = p_message_id;

  -- 7. What happened, on the lead.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'reach_out.replied', 'lead', 'lead', v_lead,
          jsonb_build_object('intent', v_intent, 'message_id', p_message_id, 'lead_id', v_lead,
                             'claim', v_of->>'claim', 'reread', v_reread > 0, 'unread', v_unread,
                             'business', v_of->>'business'));

  return jsonb_build_object('applied', true, 'intent', v_intent, 'unread', v_unread, 'changed', v_changed);
end $$;

revoke execute on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int) to service_role;
comment on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int) is
  'A reply''s reading and its plan (contracts readingPlan), applied once in one transaction (Reach out Part 5, G6-G11): the lead''s waiting sends skipped (wrote back), Talking through lead_convert_by, resume_at, a no through set_email_marketing (reply) with the reply''s From and the business''s own domain on the never-again list, a dated step, and reach_out.replied. A reply that cites our email from another address at the business links its writer to the lead (0052); its no, its step and the leads it closes stay the lead''s own person''s. The signer the reading found is its writer''s: kept on the row and offered (the notice), or taken for the writer when the plan says adoptSigner (automatic naming). A re-read applies by compare-and-set on the row still unread. Records what it changed for the undo. Answers {applied}. Service role only.';

/* -------------------------------------------------------- 9. People, by the business too, copied from 00276, 00328 -- */

create or replace function public.people_page(p_tenant_id uuid, p_contact_id uuid, p_query text, p_limit integer,
                                              p_offset integer, p_after_at timestamptz, p_after_added timestamptz,
                                              p_after_id uuid)
returns table (
  id                           uuid,
  display_name                 text,
  wa_profile_name              text,
  phone_e164                   text,
  email                        text,
  consent                      text,
  consent_source               text,
  consent_updated_at           timestamptz,
  dnc                          boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
  in_touch_at                  timestamptz,
  added_at                     timestamptz
)
language plpgsql
stable
set search_path = public
set enable_sort = off
as $$
#variable_conflict use_column
declare
  -- The search, read once rather than for each person the walk tests: its words, and its digits.
  v_words  text := nullif(trim(p_query), '');
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  -- One person, by their key: no order to keep, so nothing here sorts. The query and the cursor page a list; a named
  -- person is their row alone.
  if p_contact_id is not null then
    return query
      select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
             c.consent, c.consent_source, c.consent_updated_at, c.dnc,
             c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
             pm.in_touch_at, pm.added_at
        from person_moments pm
        join contacts c on c.id = pm.contact_id
       where pm.contact_id = p_contact_id
         and pm.tenant_id = p_tenant_id
         and c.tenant_id = p_tenant_id
         and c.erased_at is null
         and c.merged_into_contact_id is null;
    return;
  end if;

  -- Everyone else: the walk down person_moments_order to the end of the page. With sorting off it is the only plan,
  -- whatever the planner thinks the workspace holds.
  return query
    select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
           c.consent, c.consent_source, c.consent_updated_at, c.dnc,
           c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
           pm.in_touch_at, pm.added_at
      from person_moments pm
      -- Each person's contact row, looked up by its key as the walk reaches them. The limit keeps it a look-up: joined
      -- any other way, a plan made without the arguments can read the workspace's contacts once and hold them, and
      -- compare every one with each person the walk reaches.
      cross join lateral (
        select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
               c.consent, c.consent_source, c.consent_updated_at, c.dnc,
               c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at
          from contacts c
         where c.id = pm.contact_id
           and c.tenant_id = p_tenant_id
           and c.erased_at is null
           and c.merged_into_contact_id is null
           -- The search: a name, their name on WhatsApp, their email address, or
           -- three digits of the number, the way the page's own box matches.
           -- Nothing else is indexed here; the page still narrows by state and
           -- list over what it holds.
           and (
             v_words is null
             or c.display_name ilike '%' || v_words || '%'
             or c.wa_profile_name ilike '%' || v_words || '%'
             or c.email ilike '%' || v_words || '%'
             -- The business they work at (0052): "bloom" finds the people at Bloom & Vow.
             or exists (select 1 from leads l
                         where l.id = c.lead_id and l.tenant_id = p_tenant_id
                           and l.erased_at is null and l.blanked_at is null
                           and l.business_name ilike '%' || v_words || '%')
             or (length(v_digits) >= 3
                 and regexp_replace(coalesce(c.phone_e164, ''), '\D', '', 'g') like '%' || v_digits || '%')
           )
         limit 1
      ) c
     where pm.tenant_id = p_tenant_id
       -- After the cursor: just past the last row the caller holds. Without one, a place past every row, so the
       -- comparison is always the index's own condition, whatever the plan.
       and (pm.in_touch_at, pm.added_at, pm.contact_id)
           < (coalesce(p_after_at, 'infinity'), coalesce(p_after_added, 'infinity'),
              coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
     order by pm.in_touch_at desc, pm.added_at desc, pm.contact_id desc
     limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
     offset greatest(coalesce(p_offset, 0), 0);
end
$$;

drop function if exists public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid);

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0,
                                              p_after_at timestamptz default null, p_after_added timestamptz default null, p_after_id uuid default null)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  email                   text,
  -- When that address stopped being sent to (00126: a permanent bounce, a complaint, the provider's own suppression), or
  -- null: a campaign does not pick email for a person whose address is dead, so the door never has to refuse them.
  email_suppressed_at     timestamptz,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
  -- The channels each yes covers (00297; null: a yes recorded before they were kept, which covers WhatsApp alone), and
  -- when the receptionist first asked for the yes to offers.
  consent_channels             text[],
  marketing_channels           text[],
  offers_asked_at              timestamptz,
  -- Email's own answer about offers (00174), how it was given and when (00299): People's rows judge an offer by email by it.
  email_marketing              text,
  email_marketing_source       text,
  email_marketing_updated_at   timestamptz,
  channels                text[],
  conversation_count      integer,
  escalation_count        integer,
  needs_human             boolean,
  open_escalation_reason  text,
  open_escalation_since   timestamptz,
  latest_conversation_id  uuid,
  latest_state            text,
  latest_paused_until     timestamptz,
  latest_assignee_user_id uuid,
  latest_snooze_until     timestamptz,
  latest_wa_inbound_at    timestamptz,
  last_message_at         timestamptz,
  last_message_direction  text,
  last_message_sender     text,
  last_inbound_text       text,
  last_inbound_at         timestamptz,
  -- The wire of that message (00298): the channel they last wrote on, which a campaign reaches them on first.
  last_inbound_channel    text,
  -- When they last wrote words that were a person's own (00299): last_inbound_at less an automatic reply, a list's mail and a
  -- delivery report (message_is_a_persons_words). The one fact of "they wrote" that relationshipOnRecord reads.
  last_wrote_at           timestamptz,
  last_call_at            timestamptz,
  last_inbound_call_at    timestamptz,
  last_inbound_call_summary text,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  message_channels        text[],
  queued_reply_at         timestamptz,
  came_from               text,
  -- The newest open or current deal (proposed or won), else the newest of any (0004).
  deal_id                 uuid,
  deal_stage              text,
  deal_service            text,
  deal_proposed_at        timestamptz,
  deal_decided_at         timestamptz,
  deal_ended_at           timestamptz,
  deal_amount_cents       integer,
  deal_per                text,
  -- Its link, the last day it stands, and why they passed (0008).
  deal_proposal_url       text,
  deal_valid_until        date,
  deal_lost_reason        text,
  -- Every open deal (0029): a proposal out or a client, one per service, newest first, each with the columns the one
  -- deal above carries. The row still shows one deal; the Pipeline, the deal lists and the follow-up read them all.
  open_deals              jsonb,
  -- The earliest open step on them (0007, amended): by its day, then as it was written.
  step_id                 uuid,
  step_body               text,
  step_due_on             date,
  step_for_user_id        uuid,
  step_deal_id            uuid,
  -- The row's place in the order (0021): when they were last in touch (-infinity for never), and when they were added.
  -- A caller pages on by passing the last row's two and its id as p_after_at, p_after_added and p_after_id.
  in_touch_at             timestamptz,
  added_at                timestamptz,
  -- The business they work at (0052): the lead, its name while it stands (null once erased or blanked: lead_gone), and
  -- where their name came from and whether it is settled.
  lead_id                 uuid,
  lead_name               text,
  lead_gone               boolean,
  name_source             text,
  name_settled_at         timestamptz,
  -- A reply's signer offered as their name (0052): the newest one nobody has settled.
  signer_message_id       uuid,
  signer_name             text,
  signer_title            text,
  signer_read_at          timestamptz
)
language sql
stable
set search_path = public
as $$
  -- The page first (0021): its people, in the kept order, after the cursor or the offset, and nobody else. Every read
  -- below is for them alone.
  with page as (
    select p.id, p.display_name, p.wa_profile_name, p.phone_e164, p.email,
           p.consent, p.consent_source, p.consent_updated_at, p.dnc,
           p.marketing_consent, p.marketing_consent_source, p.marketing_consent_updated_at,
           p.in_touch_at, p.added_at
      from people_page(p_tenant_id, p_contact_id, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) p
  ),
  ev as not materialized (
    select m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           e.at, e.moved_in as backfill, e.spoken,
           -- Whether the words are a person's own, not an automatic reply or a list's mail (00299).
           public.message_is_a_persons_words(m.meta) as persons_words
      from messages m
      -- When it happened, whether the customer saw or said it, and whether it came with a history moved in: the one
      -- statement of the three (00259), which the kept moments read too.
      cross join lateral message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email, ch.email_suppressed_at,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    ch.consent_channels, ch.marketing_channels, ch.offers_asked_at,
    ch.email_marketing, ch.email_marketing_source, ch.email_marketing_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at, lw.channel,
    ma.last_wrote_at,
    lk.last_at,
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how they were added, else how a history moved in
    -- began, else their first spoken event.
    case
      when ad.source = 'calendar' then 'calendar'
      when ad.source = 'lead' then 'lead'
      when ad.source = 'import' then 'import'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    od.deals,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at,
    ch.lead_id, case when not coalesce(ld.gone, false) then ld.business_name end, coalesce(ld.gone, false),
    ch.name_source, ch.name_settled_at,
    sg.message_id, sg.signer_name, sg.signer_title, sg.read_at
  from page c
  left join lateral (
    -- What each yes covers, when offers were asked for (00297), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at,
           k.email_marketing, k.email_marketing_source, k.email_marketing_updated_at,
           k.lead_id, k.name_source, k.name_settled_at
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
  left join lateral (
    -- The business they work at (0052), by its key: its name, and whether it was erased or blanked since.
    select l.business_name, (l.erased_at is not null or l.blanked_at is not null) as gone
      from leads l
     where l.id = ch.lead_id and l.tenant_id = p_tenant_id
  ) ld on true
  left join lateral (
    -- A reply's signer offered as their name (0052), the newest: the reply's writer's alone, as the name's doors match
    -- it; offered rows are few, and found by reach_out_replies_signer_offered.
    select r.message_id, r.signer_name, r.signer_title, r.read_at
      from reach_out_replies r
     where r.tenant_id = p_tenant_id and r.signer_state = 'offered' and r.undone_at is null
       and r.contact_id = c.id
     order by r.read_at desc
     limit 1
  ) sg on true
  left join lateral (
    -- How they were added, when a door added them: their first contact.added
    -- event, should a door ever write two.
    select coalesce(e.data->>'source', 'manual') as source
      from events e
     where e.tenant_id = p_tenant_id
       and e.subject_type = 'contact'
       and e.subject_id = c.id
       and e.kind = 'contact.added'
     order by e.created_at
     limit 1
  ) ad on true
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    select e.at, e.direction, e.sender
      from ev e
     where e.contact_id = c.id and e.at is not null and e.spoken
     order by e.at desc
     limit 1
  ) lm on true
  left join lateral (
    select e.at, e.body, e.channel
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.spoken and e.body is not null
     order by e.at desc
     limit 1
  ) li on true
  left join lateral (
    -- Where they last WROTE: the wire of their newest own words. Not a call's note (the system's row, never spoken)
    -- and not a program writing from their address (persons_words): an out-of-office made email "where they last
    -- wrote", and a campaign then went there. contracts lastWroteOn is its twin.
    select e.channel
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.sender = 'customer' and e.spoken and e.persons_words
     order by e.at desc
     limit 1
  ) lw on true
  left join lateral (
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- When they last wrote words of their own (00299), the statement has_relationship makes of "they wrote".
           max(e.at) filter (where e.direction = 'inbound' and e.spoken and e.at is not null and e.body is not null
                               and e.persons_words) as last_wrote_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel,
           -- The first row of a history moved in, in the order it was written: a call's note is a call, anything else its wire.
           (array_agg(case when e.type = 'call_summary' then 'call' else e.channel end order by e.created_at)
              filter (where e.backfill))[1] as backfill_first
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  left join lateral (
    -- The one deal the row shows: open or current first, then the newest.
    -- pickCurrentDeal in contracts orders a person's list the same way.
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per,
           d.proposal_url, d.valid_until, d.lost_reason
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  left join lateral (
    -- Every open deal (0029), newest first: a person may hold one per service (deals_open_uq), and the one above hid the
    -- rest. Null for someone with none open.
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'stage', d.stage, 'service', d.service, 'proposed_at', d.proposed_at,
             'decided_at', d.decided_at, 'ended_at', d.ended_at, 'amount_cents', d.amount_cents, 'per', d.per,
             'currency', d.currency, 'proposal_url', d.proposal_url, 'valid_until', d.valid_until,
             'lost_reason', d.lost_reason
           ) order by d.created_at desc) as deals
      from deals d
     where d.contact_id = c.id
       and d.stage in ('proposed', 'won')
  ) od on true
  left join lateral (
    -- Their next step: the earliest open one, by its day, then the one written first. A step is a note with a day,
    -- for the team only, so the receptionist never reads it; the list carries it for the Pipeline and Today.
    select n.id, n.body, n.due_on, n.for_user_id, n.deal_id
      from person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id = c.id
       and n.due_on is not null
       and n.done_at is null
     order by n.due_on, n.created_at, n.id
     limit 1
  ) st on true
  order by c.in_touch_at desc, c.added_at desc, c.id desc
$$;

revoke execute on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, import, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_contact_id names one person, their row alone. The page is chosen before it is read (0021, people_page): its people come from person_moments in one whole order, latest contact first (in_touch_at, -infinity for never), then the newest added (added_at), then the id, falling, at most p_limit (1000) of them after p_offset or after the cursor p_after_at, p_after_added, p_after_id (the last row''s in_touch_at, added_at and id); every other column is read for them alone. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008); `open_deals` carries every open deal (proposed or won, one per service), newest first, in the same fields (0029), null with none open. The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written. `consent_channels` and `marketing_channels` are the channels each yes covers (00297; null: a yes recorded before the channels were kept, which covers WhatsApp alone) and `offers_asked_at` is when the receptionist first asked for the yes to offers. `last_inbound_channel` is the channel of the last written message they sent themselves (their own words: not an automatic reply or a list''s mail) (whatsapp, sms or email; null when they have sent none): the channel a campaign reaches them on first (00298, contracts'' reachFor). `last_wrote_at` is when they last wrote words that were a person''s own, an automatic reply, a list''s mail or a delivery report left out (00299, message_is_a_persons_words): the fact of "they wrote" that contracts'' relationshipOnRecord reads. `email_suppressed_at` is when their address stopped being sent to (a bounce, a complaint; null while it is good): a campaign does not pick email for a person who has it. `email_marketing`, `email_marketing_source` and `email_marketing_updated_at` are the person''s own answer about offers by email (00174, 00299): an offer by email goes to someone who has not unsubscribed and who asked for offers by email or has a relationship with the business on record (contracts'' mayMessageFor). `lead_id`, `lead_name` and `lead_gone` are the business they work at (0052: the lead, its name while it stands, and whether it was erased or blanked since); p_query matches its name too. `name_source` is where their name came from (typed, import, calendar, signature, wire, lead) and `name_settled_at` when a member settled it. `signer_*` is the newest reply signer offered as their name (the notice Use this name), null with none.';

/* --------------------------------------------------- 10. Combine: one human, two doors, copied from 00365 -- */

create or replace function public.merge_people(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  k          public.contacts%rowtype;
  m          public.contacts%rowtype;
  k_conv     public.conversations%rowtype;
  m_conv     public.conversations%rowtype;
  v_stop     boolean;
  v_consent  text;
  v_offers   text;
  v_email    text;
  v_offers_ended boolean;
  v_email_ended  boolean;
  v_take_control boolean;
  v_n        int;
  v_counts   jsonb := '{}'::jsonb;
  v_decision uuid;
  -- Combine (0052): the record we wrote to at a business and the person who answered from their own address there.
  v_combine  boolean := false;
  v_swap     public.contacts%rowtype;
  v_swap_id  uuid;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different records to merge.' using errcode = '22023';
  end if;

  -- Both rows, locked in id order, so two merges that name the same pair wait for each other and never deadlock.
  perform 1 from contacts c where c.id in (p_keep, p_merge) order by c.id for update;
  select * into k from contacts where id = p_keep;
  select * into m from contacts where id = p_merge;
  -- A stranger learns nothing: no such record, another workspace's, or not a member, all read as not found (00027).
  if k.id is null or m.id is null or k.tenant_id is distinct from m.tenant_id then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  v_tenant := k.tenant_id;
  if not exists (select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  -- OWNER, as erase_contact is: it cannot be undone.
  if not exists (
    select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user and s.role = 'owner'
  ) then
    raise exception 'Only an owner can merge two records.' using errcode = '42501';
  end if;

  if k.erased_at is not null or k.erasing_since is not null
     or m.erased_at is not null or m.erasing_since is not null then
    raise exception 'One of these people was deleted, so there is nothing to merge.' using errcode = '22023';
  end if;
  if k.merged_into_contact_id is not null or m.merged_into_contact_id is not null then
    raise exception 'One of these records was already merged into another.' using errcode = '22023';
  end if;
  -- Combine (0052, amending 0028): a stand-in (named for the business, by its lead) that never wrote, and a person who
  -- works at the same lead, are one human: the stand-in's address is the business's, the person's their own. For
  -- exactly this pair two addresses are no sign of two people, and the person is the one kept, with their own name
  -- and address, whichever of the two pages the owner pressed it from.
  v_combine := k.lead_id is not null and k.lead_id = m.lead_id
    and (coalesce(k.name_source, '') = 'lead') <> (coalesce(m.name_source, '') = 'lead')
    and not exists (select 1 from messages x
                     where x.tenant_id = v_tenant and x.direction = 'inbound'
                       and x.contact_id = case when k.name_source = 'lead' then k.id else m.id end);
  if v_combine and k.name_source = 'lead' then
    v_swap := k; k := m; m := v_swap;
    v_swap_id := p_keep; p_keep := p_merge; p_merge := v_swap_id;
  end if;
  if k.phone_e164 is not null and m.phone_e164 is not null and k.phone_e164 <> m.phone_e164 then
    raise exception 'These two records have different phone numbers, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if k.email is not null and m.email is not null and k.email <> m.email and not v_combine then
    raise exception 'These two records have different email addresses, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
      from deals a
      join deals b on b.tenant_id = a.tenant_id and coalesce(b.service, '') = coalesce(a.service, '')
     where a.tenant_id = v_tenant and a.contact_id = p_keep and b.contact_id = p_merge
       and a.stage in ('proposed', 'won') and b.stage in ('proposed', 'won')
  ) then
    raise exception 'Both records have an open deal for the same service. Close or move one of them first.'
      using errcode = '22023';
  end if;

  /* ---- THE MARK FIRST. From here the guard's exception is true for these two threads, and the merged row holds no
     number and no address: one address, one person (contacts_tenant_phone_uq, contacts_tenant_email_uq), and the
     inbound door, which finds a person by identity and then by number, cannot find the merged row again. Its
     answers are read into the kept record below (k and m hold them) and cleared here, so one person is counted
     once wherever a count reads the table. */
  update contacts
     set merged_into_contact_id = p_keep, phone_e164 = null, email = null,
         consent = 'unknown', consent_source = null, consent_updated_at = null, dnc = false,
         consent_channels = '{}'::text[],
         marketing_consent = 'unknown', marketing_consent_source = null, marketing_consent_updated_at = null,
         marketing_channels = '{}'::text[], offers_asked_at = null,
         email_marketing = 'unknown', email_marketing_source = null, email_marketing_updated_at = null
   where id = p_merge;

  update contact_identities set contact_id = p_keep
   where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('identities', v_n);

  /* ---- THE THREAD. One per person (conversations_tenant_id_contact_id_key). */
  select * into k_conv from conversations where tenant_id = v_tenant and contact_id = p_keep for update;
  select * into m_conv from conversations where tenant_id = v_tenant and contact_id = p_merge for update;
  if m_conv.id is not null and k_conv.id is null then
    -- The kept person had none: the merged one's thread is theirs, whole.
    update conversations set contact_id = p_keep where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'taken');
  elsif m_conv.id is not null then
    -- One open escalation per thread (escalations_one_open): where both had one, the kept thread's stands and the
    -- merged thread's is resolved by the owner who merged them.
    if exists (select 1 from escalations e where e.conversation_id = k_conv.id and e.state = 'open') then
      update escalations
         set state = 'resolved', resolved_by_user_id = v_user
       where tenant_id = v_tenant and conversation_id = m_conv.id and state = 'open';
    end if;
    update escalations set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update messages set conversation_id = k_conv.id, contact_id = p_keep
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('messages', v_n);
    update calls set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update reach_out_replies set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    -- The reply turn is the thread's own (one row per thread): a reply being written on the merged thread goes on
    -- as the kept thread's where the kept thread holds none, and the kept thread's own stands otherwise.
    update reply_turns set conversation_id = k_conv.id
     where conversation_id = m_conv.id
       and not exists (select 1 from reply_turns t where t.conversation_id = k_conv.id);
    delete from reply_turns where conversation_id = m_conv.id;
    -- Nothing scheduled or running may name a thread that is about to stop existing: it names the kept one.
    update jobs
       set payload = payload || jsonb_build_object('conversation_id', k_conv.id::text)
     where tenant_id = v_tenant and state in ('scheduled', 'fired')
       and payload->>'conversation_id' = m_conv.id::text;
    update decisions set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update events set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update notifications set subject_id = k_conv.id::text
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id::text;
    update notifications set route = 'inbox/th-' || k_conv.id::text
     where tenant_id = v_tenant and route = 'inbox/th-' || m_conv.id::text;
    -- The kept thread takes the later of each clock, stays held if either was (a hold with no end stays one), is
    -- as open as the more open one, keeps who it was assigned to, and is answered by whoever was answering either
    -- (the later hold on it wins: a person typing, or a call in progress).
    v_take_control := k_conv.control_kind is null
                      or (m_conv.control_until is not null and m_conv.control_until > k_conv.control_until);
    update conversations
       set last_message_at    = greatest(k_conv.last_message_at, m_conv.last_message_at),
           last_inbound_at    = greatest(k_conv.last_inbound_at, m_conv.last_inbound_at),
           last_wa_inbound_at = greatest(k_conv.last_wa_inbound_at, m_conv.last_wa_inbound_at),
           paused_until       = case
                                  when (k_conv.state = 'needs_human' and k_conv.paused_until is null)
                                    or (m_conv.state = 'needs_human' and m_conv.paused_until is null) then null
                                  else greatest(k_conv.paused_until, m_conv.paused_until)
                                end,
           assignee_user_id   = coalesce(k_conv.assignee_user_id, m_conv.assignee_user_id),
           control_kind       = case when v_take_control then m_conv.control_kind else k_conv.control_kind end,
           control_by         = case when v_take_control then m_conv.control_by else k_conv.control_by end,
           control_ref        = case when v_take_control then m_conv.control_ref else k_conv.control_ref end,
           control_until      = case when v_take_control then m_conv.control_until else k_conv.control_until end,
           state = case
                     when 'needs_human' in (k_conv.state, m_conv.state) then 'needs_human'
                     when 'open' in (k_conv.state, m_conv.state) then 'open'
                     when 'snoozed' in (k_conv.state, m_conv.state) then 'snoozed'
                     else 'archived'
                   end,
           snooze_until = case
                            when 'needs_human' in (k_conv.state, m_conv.state)
                              or 'open' in (k_conv.state, m_conv.state) then null
                            else greatest(k_conv.snooze_until, m_conv.snooze_until)
                          end
     where id = k_conv.id;
    delete from conversations where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'folded');
  end if;

  /* ---- THE PERSON'S OWN ROWS. */
  update messages set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update calls set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('calls', v_n);
  update deals set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('deals', v_n);
  update leads set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  -- Their visits (00345), whatever made them: no key of appointments names its person, so every one moves.
  update appointments set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('appointments', v_n);
  -- A reach-out's note is kept once per person and send (person_notes_reach_out_once): one the kept person already
  -- holds stays with the merged row.
  update person_notes n set contact_id = p_keep
   where n.tenant_id = v_tenant and n.contact_id = p_merge
     and not (n.source = 'reach_out' and exists (
       select 1 from person_notes h
        where h.contact_id = p_keep and h.source = 'reach_out' and h.source_id = n.source_id));
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', v_n);
  update reach_out_sends set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update reach_out_replies set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update reach_out_replies set lead_contact_id = p_keep where tenant_id = v_tenant and lead_contact_id = p_merge;
  -- A list holds a person once (segment_members_pkey): the kept person joins the lists they were not on.
  insert into segment_members (segment_id, contact_id, tenant_id, added_by, added_at)
  select s.segment_id, p_keep, s.tenant_id, s.added_by, s.added_at
    from segment_members s
   where s.tenant_id = v_tenant and s.contact_id = p_merge
  on conflict (segment_id, contact_id) do nothing;
  delete from segment_members where tenant_id = v_tenant and contact_id = p_merge;
  -- A run names a person once (broadcast_recipients_pkey): a run both were on keeps the merged row's line as it is.
  update broadcast_recipients r set contact_id = p_keep
   where r.tenant_id = v_tenant and r.contact_id = p_merge
     and not exists (
       select 1 from broadcast_recipients h where h.broadcast_id = r.broadcast_id and h.contact_id = p_keep);
  -- A person's own receptionist mode, one per class. A policy row keeps
  -- its subject for life (00029's guard), so the kept person gets a row of their own and the merged one's goes.
  insert into policies (tenant_id, class, mode, subject_type, subject_id, limits)
  select p.tenant_id, p.class, p.mode, 'contact', p_keep, p.limits
    from policies p
   where p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge
     and not exists (
       select 1 from policies h
        where h.tenant_id = v_tenant and h.class = p.class and h.subject_type = 'contact' and h.subject_id = p_keep);
  -- Where both set one for a class, the stricter stands (never over ask over veto over auto): the most careful answer.
  update policies h
     set mode = p.mode
    from policies p
   where h.tenant_id = v_tenant and h.subject_type = 'contact' and h.subject_id = p_keep
     and p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge and p.class = h.class
     and array_position(array['auto', 'veto', 'ask', 'never'], p.mode)
       > array_position(array['auto', 'veto', 'ask', 'never'], h.mode);
  delete from policies where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  -- The ledger and the audit are the person's: what the merged record answered, and what was decided about it.
  update events set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update decisions set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update notifications set subject_id = p_keep::text
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge::text;
  update jobs
     set payload = payload || jsonb_build_object('contact_id', p_keep::text)
   where tenant_id = v_tenant and state in ('scheduled', 'fired') and payload->>'contact_id' = p_merge::text;

  /* ---- CONSENT (D5): the most careful answer wins on each question. contracts' mergedAnswers is this, case by case. */
  v_stop := k.consent = 'opted_out' or k.dnc or m.consent = 'opted_out' or m.dnc;
  v_consent := case
                 when v_stop then 'opted_out'
                 when 'opted_in' in (k.consent, m.consent) then 'opted_in'
                 else 'unknown'
               end;
  v_offers := case
                when 'opted_out' in (k.marketing_consent, m.marketing_consent) then 'opted_out'
                when v_stop then 'unknown'
                when 'opted_in' in (k.marketing_consent, m.marketing_consent) then 'opted_in'
                else 'unknown'
              end;
  v_email := case
               when 'opted_out' in (k.email_marketing, m.email_marketing) then 'opted_out'
               when v_stop then 'unknown'
               when 'opted_in' in (k.email_marketing, m.email_marketing) then 'opted_in'
               else 'unknown'
             end;

  -- A yes that ends here because the merged person is stopped: how 00323 says a yes ended.
  v_offers_ended := v_offers = 'unknown' and 'opted_in' in (k.marketing_consent, m.marketing_consent);
  v_email_ended := v_email = 'unknown' and 'opted_in' in (k.email_marketing, m.email_marketing);

  -- The ledger first: 00297's trigger on each entry rewrites the channel lists, and the update below is the last word.
  if v_consent is distinct from k.consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('consent', v_consent, 'previous', k.consent, 'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_offers is distinct from k.marketing_consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'marketing', 'consent', v_offers, 'previous', k.marketing_consent,
                               'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_email is distinct from k.email_marketing then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'email_marketing', 'consent', v_email, 'previous', k.email_marketing,
                               'source', 'merge', 'merged_from', p_merge, 'channel', 'email'));
  end if;

  /* ---- THE KEPT RECORD, in one statement: what it lacked, and the answers. Each answer keeps how and when it was
     given from the record that gave it; a yes a stop ended says so as 00323 does; an answer neither record gave as it
     now stands (a stop held by do-not-contact alone) says the merge. */
  update contacts
     set phone_e164      = coalesce(k.phone_e164, m.phone_e164),
         email           = coalesce(k.email, m.email),
         display_name    = coalesce(k.display_name, m.display_name),
         wa_profile_name = coalesce(k.wa_profile_name, m.wa_profile_name),
         notes           = coalesce(k.notes, m.notes),
         proposal_url    = coalesce(k.proposal_url, m.proposal_url),
         first_seen_at   = least(k.first_seen_at, m.first_seen_at),
         last_seen_at    = greatest(k.last_seen_at, m.last_seen_at),
         acquired_via    = case when k.acquired_via is not null then k.acquired_via else m.acquired_via end,
         acquired_ref    = case when k.acquired_via is not null then k.acquired_ref else m.acquired_ref end,
         consent         = v_consent,
         dnc             = v_stop,
         consent_source  = case
                             when k.consent = v_consent then k.consent_source
                             when m.consent = v_consent then m.consent_source
                             else 'merge'
                           end,
         consent_updated_at = case
                                when k.consent = v_consent then k.consent_updated_at
                                when m.consent = v_consent then m.consent_updated_at
                                else now()
                              end,
         consent_channels = case
                              when v_consent <> 'opted_in' then '{}'::text[]
                              else public.consent_channels_union(
                                case when k.consent = 'opted_in' then coalesce(k.consent_channels, '{whatsapp}') end,
                                case when m.consent = 'opted_in' then coalesce(m.consent_channels, '{whatsapp}') end)
                            end,
         marketing_consent = v_offers,
         marketing_consent_source = case
                                      when v_offers_ended then 'stop'
                                      when k.marketing_consent = v_offers then k.marketing_consent_source
                                      else m.marketing_consent_source
                                    end,
         marketing_consent_updated_at = case
                                          when v_offers_ended then now()
                                          when k.marketing_consent = v_offers then k.marketing_consent_updated_at
                                          else m.marketing_consent_updated_at
                                        end,
         marketing_channels = case
                                when v_offers <> 'opted_in' then '{}'::text[]
                                else public.consent_channels_union(
                                  case when k.marketing_consent = 'opted_in'
                                       then coalesce(k.marketing_channels, '{whatsapp}') end,
                                  case when m.marketing_consent = 'opted_in'
                                       then coalesce(m.marketing_channels, '{whatsapp}') end)
                              end,
         email_marketing = v_email,
         email_marketing_source = case
                                    when v_email_ended then 'stop'
                                    when k.email_marketing = v_email then k.email_marketing_source
                                    else m.email_marketing_source
                                  end,
         email_marketing_updated_at = case
                                        when v_email_ended then now()
                                        when k.email_marketing = v_email then k.email_marketing_updated_at
                                        else m.email_marketing_updated_at
                                      end,
         offers_asked_at = least(k.offers_asked_at, m.offers_asked_at)
   where id = p_keep;
  -- A suppressed address stays suppressed. Taking the address clears the flag (a changed address is a new one to the
  -- trigger), so it is put back in a statement that does not name the address.
  if k.email is null and m.email is not null and m.email_suppressed_at is not null then
    update contacts
       set email_suppressed_at = m.email_suppressed_at, email_suppressed_reason = m.email_suppressed_reason
     where id = p_keep;
  end if;

  -- What the lists page by (0021), for both rows: the kept person's moments now hold the merged one's words and calls.
  perform public.person_moments_recompute(array[p_keep, p_merge]);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.merged', 'contact', 'contact', p_keep,
          v_counts || jsonb_build_object('merged', p_merge) || case when v_combine then jsonb_build_object('combine', true) else '{}'::jsonb end);
  insert into decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_keep, 'merge', 'user', v_user,
          jsonb_build_object('merged', p_merge, 'counts', v_counts))
  returning id into v_decision;

  return jsonb_build_object(
    'contact_id', p_keep, 'merged', p_merge, 'tenant_id', v_tenant, 'decision_id', v_decision,
    'consent', v_consent, 'marketing_consent', v_offers, 'email_marketing', v_email, 'counts', v_counts);
end $$;

comment on function public.merge_people(p_keep uuid, p_merge uuid) is 'An owner merges two records of one person (decision 0028): the kept record takes the other''s identities, thread (folded into its own), deals, leads, visits, notes, lists, receptionist mode and ledger; the other is left marked merged_into_contact_id with no number or address. Consent is the most careful answer on each question (D5), each change written to the ledger with the source merge. Refuses two different phone numbers or email addresses, an erased or already merged record, and two open deals for one service; Combine (0052) takes a stand-in that never wrote and a person at the same lead with two addresses, the person kept whichever was named to keep (the answer''s contact_id). One transaction; never undone. The caller is auth.uid(); a stranger is told not found.';

revoke all on function public.merge_people(uuid, uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated, service_role;

/* ---------------------------------- 11. a lead's yes is never a member's, for its people too, copied from 00142 -- */

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_evidence   jsonb default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.contacts%rowtype;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb := p_evidence;
begin
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- A yes to offers is written, or it is not a yes to offers (00100).
  if p_consent = 'opted_in' and p_source not in ('form', 'customer_message') then
    raise exception 'a yes to offers must be in writing: a form the customer signed, or their own message' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  -- A signed-in caller must be allowed to act in this workspace. No session at
  -- all is the edge, holding the service key, recording what a customer texted.
  if auth.uid() is not null and not public.is_acting_member(p_tenant_id) then
    raise exception 'Not allowed to act in this workspace.' using errcode = '42501';
  end if;

  -- A member's evidence is read from the message they name, never handed in.
  if auth.uid() is not null and p_evidence is not null then
    raise exception 'The evidence is read from their message. Name the message instead.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if auth.uid() is not null and p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  -- 0052: and for everyone who works at a lead (contacts.lead_id: linked by a reply that cited ours, or by a member's
  -- hand); "Not at this business" (person_leave_lead) lifts it, for anyone but the lead's own person.
  if auth.uid() is not null and p_consent = 'opted_in'
     and (exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = p_tenant_id)
          or exists (select 1 from public.contacts k
                      where k.id = p_contact_id and k.tenant_id = p_tenant_id and k.lead_id is not null)) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;

  -- The message, read here: theirs, to this workspace, on a written wire. A
  -- call's note is the system's, and a reply is ours.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- `dnc` is deliberately NOT touched (00095): declining offers is not a
  -- request to stop hearing about your own appointment.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named.
  -- Consent events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

comment on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) is
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. A yes must be written (form or their own message), and never for a person a lead you found is linked to: theirs comes from their own message through the edge, or the yes page (decision 19). A signed-in member''s "their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words; p_evidence is the edge''s alone, for an answer the customer texted. Never touches dnc.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) to authenticated, service_role;

create or replace function public.set_contact_consent(
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_erased   timestamptz;
  v_before   text;
  v_dnc      boolean;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_consent is null or p_consent not in ('opted_in', 'opted_out', 'unknown') then
    raise exception 'Consent must be opted_in, opted_out or unknown.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'Source must say how the answer was given.' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at, c.consent into v_tenant, v_erased, v_before
    from contacts c where c.id = p_contact_id;
  -- A stranger learns nothing: not a member reads as not found (00027's
  -- rule). Viewers read only, so they are strangers to this door too.
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  if v_erased is not null then
    raise exception 'This person was deleted.' using errcode = 'P0002';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  -- 0052: and for everyone who works at a lead (contacts.lead_id: linked by a reply that cited ours, or by a member's
  -- hand); "Not at this business" (person_leave_lead) lifts it, for anyone but the lead's own person.
  if p_consent = 'opted_in'
     and (exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = v_tenant)
          or exists (select 1 from public.contacts k
                      where k.id = p_contact_id and k.tenant_id = v_tenant and k.lead_id is not null)) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;

  -- The message, read here, as the offers door reads it.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = v_tenant
       and c.tenant_id = v_tenant
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- dnc follows the answer the way the ingest sets it: a no is a no on every
  -- channel, and a yes or a reset lifts the operator's own block.
  v_dnc := (p_consent = 'opted_out');
  update contacts
     set consent = p_consent, dnc = v_dnc,
         consent_source = p_source, consent_updated_at = now()
   where id = p_contact_id;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('consent', p_consent, 'source', p_source, 'previous', v_before,
                             'by', v_user, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'contact_id', p_contact_id, 'consent', p_consent, 'dnc', v_dnc,
    'source', p_source, 'previous', v_before, 'updated_at', now());
end $$;

comment on function public.set_contact_consent(uuid, text, text, text, uuid) is
  'Owner or operator records a customer''s answer about messages on their own visit (not offers, which are set_marketing_consent''s since 00095): consent, dnc and the source together, plus the contact.consent_changed event. Never a yes for a person a lead you found is linked to: theirs comes from their own message through the edge, or the yes page (decision 19). "Their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words. The ledger row is the route''s.';

revoke execute on function public.set_contact_consent(uuid, text, text, text, uuid) from public, anon;
grant  execute on function public.set_contact_consent(uuid, text, text, text, uuid) to authenticated;

/* -------------------------------------------- 12. who a call reached, its name, copied from 00344 -- */

drop function if exists public.lead_set_stage(uuid, text, text, text, text, text);

create or replace function public.lead_set_stage(p_lead_id uuid, p_stage text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_fit_reason text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_spoke_with text DEFAULT NULL::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_made     jsonb;
  v_existed  boolean := false;
  v_convert  boolean := coalesce(p_outcome = 'interested', false);   -- the one act that makes a person (§9.6)
  v_stage    text;
  v_hash     text;
  v_supp     boolean := false;
  v_op       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  -- A stranger learns nothing: not a member reads as not found (00027's rule).
  -- Viewers read only, so they are strangers to this door too.
  if not found or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed') then
    raise exception 'reason must be one of the closed reasons' using errcode = '22023';
  end if;
  if p_fit_reason is not null and p_fit_reason not in ('chain', 'wrong_kind', 'too_far', 'customer', 'other') then
    raise exception 'fit_reason must be chain, wrong_kind, too_far, customer or other' using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in ('interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number', 'emailed') then
    raise exception 'outcome must be one of the six, or emailed' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                                 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);
  v_stage  := case when v_convert then 'converted' else p_stage end;

  if v_convert then
    -- A real conversation. The person whose number this is, else the person
    -- whose address it is, else a new one named for the business.
    if v_lead.contact_id is not null then
      v_contact := v_lead.contact_id;
      v_existed := true;
    else
      -- The person, through the one door (00342, 00344): whose number this is, else whose address, else a new one
      -- named for the business, as the finder's word (found), with the lead on the added event (what People reads
      -- back as "A lead you found", 00138), the address filled where nobody here holds it, and a person who asked to
      -- be forgotten refused (PE001). A number not in international form is no number.
      v_made := public.resolve_person(
        v_lead.tenant_id, null, null,
        case when v_lead.phone_e164 ~ '^\+[1-9][0-9]{7,14}$' then v_lead.phone_e164 end,
        v_lead.email, left(nullif(v_lead.business_name, ''), 80), 'found', 'lead',
        jsonb_build_object('lead_id', p_lead_id));
      v_contact := (v_made->>'contact_id')::uuid;
      v_existed := coalesce((v_made->>'existed')::boolean, false);
    end if;
  end if;

  -- Who they spoke with (0052): the person the call reached is named so, a member's typed name, settled; a person still
  -- named for the business is renamed, never one with a name of their own. Never a name for a call that made no one.
  if v_convert and v_contact is not null and nullif(btrim(coalesce(p_spoke_with, '')), '') is not null then
    update public.contacts
       set display_name = left(btrim(p_spoke_with), 80), name_source = 'typed', name_settled_at = now(), updated_at = now()
     where id = v_contact and tenant_id = v_lead.tenant_id
       and (display_name is null or name_source = 'lead');
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_lead.tenant_id, 'contact.named', 'contact', 'contact', v_contact,
              jsonb_build_object('named', true, 'by', v_user, 'source', 'typed', 'was', 'lead', 'via', 'call'));
    end if;
  end if;

  -- One statement, so the version moves exactly once however the lead was
  -- worked, and a stage that was not named is kept (wrong_number). A conversion
  -- is lead_convert_by's (its stage, closed reason, days and version), below.
  update public.leads
     set stage         = case when v_convert then stage else coalesce(v_stage, stage) end,
         closed_reason = case when v_convert then closed_reason
                              when v_stage = 'archived' then p_reason
                              when v_stage is not null then null
                              else closed_reason end,
         phone_wrong   = (phone_wrong or coalesce(p_outcome, '') = 'wrong_number'),
         contact_id    = coalesce(v_contact, contact_id),
         contacted_at  = case when not v_convert and coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,
         last_outcome  = coalesce(p_outcome, last_outcome),
         last_note     = case when p_outcome is not null then p_note else last_note end,
         version       = case when v_convert then version else version + 1 end
   where id = p_lead_id
  returning * into v_lead;

  if v_convert then
    -- Erased or blanked since it was read above: nothing converts, and the door says so rather than claim it.
    if not coalesce((public.lead_convert_by(v_lead.tenant_id, p_lead_id, 'call',
                       jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'by', v_user), true)->>'moved')::boolean, false) then
      raise exception 'This lead is gone.' using errcode = 'P0002';
    end if;
    select * into v_lead from public.leads where id = p_lead_id;
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id,
            jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', v_user));
  elsif p_outcome = 'emailed' then
    -- S12: what is recorded is that the OWNER said they sent it.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('by', v_user));
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id,
            jsonb_build_object('why', p_fit_reason, 'by', v_user));
    -- "Already a customer" hides the place from every future search (§0.4,
    -- S8). The hash is A's keyed digest, so the collect's suppression read
    -- refuses the place byte for byte.
    if p_reason = 'customer' and v_lead.place_id is not null then
      v_hash := public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id);
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (v_lead.tenant_id, 'place', v_hash, 'customer')
      on conflict (tenant_id, kind, hash) do nothing;
      v_supp := found;
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id,
            jsonb_build_object('stage', v_stage, 'reason', p_reason, 'by', v_user));
  end if;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (v_lead.tenant_id, 'stage', null, array[p_lead_id], v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                             'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id,
                             'converted', v_convert, 'suppressed', v_supp, 'place_hash', v_hash),
          v_lead.version, v_user)
  returning id into v_op;

  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                            'contact_id', v_lead.contact_id, 'existed', v_existed, 'converted', v_convert,
                            'op_id', v_op, 'version', v_lead.version);
end $$;

revoke execute on function public.lead_set_stage(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.lead_set_stage(uuid, text, text, text, text, text, text) to authenticated, service_role;
comment on function public.lead_set_stage(uuid, text, text, text, text, text, text) is
  'Operator. The one door for a lead''s stage, its six call outcomes, "Did you send it?" and Not a fit. A click to converted marks Talking and nothing else: contact_id stays null and the answer says converted false (§9.6). Only outcome interested makes a person -- the one whose number this is when the workspace has them, else whose address, else a new one named for the business with source lead -- and links it; p_spoke_with (0052) names the person the call reached, typed and settled, or renames one still named for the business. wrong_number marks the number and keeps the stage. reason customer hides the place from every future search. Writes one lead_operations row (kind stage) with the lead''s new version.';

/* --------------------------------------------- 13. erasure at a business, copied from 00177 and 00391 -- */

create or replace function public.lead_person_leg(p_lead_id uuid, p_email text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- What a lead holds of one person (0052): their address, as its own or among its others, their number, and the note of
  -- the call. The place, its name and the others' are kept; nothing is banned.
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

revoke execute on function public.lead_person_leg(uuid, text, text) from public, anon, authenticated;

comment on function public.lead_person_leg(uuid, text, text) is
  'Erasure of one of several people at a business (0052): their address (its own or among its others), their number and the call''s note leave the lead, which stays the others''; no place is banned. Called by leads_erase_on_contact.';

create or replace function public.leads_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_next uuid;
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    for r in select l.id, l.place_id, l.phone_e164, l.email from public.leads l where l.tenant_id = NEW.tenant_id and l.contact_id = NEW.id loop
      -- One of several people at the business (0052): their own leg, not the lead's blank; the lead stays the
      -- others', its first person the one most lately touched, and no place is banned.
      select c.id into v_next from public.contacts c
       where c.tenant_id = NEW.tenant_id and c.lead_id = r.id and c.id <> NEW.id
         and c.erased_at is null and c.erasing_since is null and c.merged_into_contact_id is null
       order by c.updated_at desc
       limit 1;
      if v_next is not null then
        perform public.lead_person_leg(r.id, OLD.email, OLD.phone_e164);
        update public.leads set contact_id = v_next, version = version + 1 where id = r.id;
        continue;
      end if;
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
    -- A person who works at a lead they are not the first person of (0052): the same leg on it.
    if OLD.lead_id is not null
       and not exists (select 1 from public.leads l where l.id = OLD.lead_id and l.contact_id = NEW.id) then
      perform public.lead_person_leg(OLD.lead_id, OLD.email, OLD.phone_e164);
    end if;
  end if;
  return NEW;
end $$;

revoke execute on function public.leads_erase_on_contact() from public, anon, authenticated;

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
  -- What a reach-out wrote from the lead's record, and the checker's note on it (00391). The send keeps its state, its
  -- reason and the digest of the words it checked.
  update public.reach_out_sends
     set opening = null, angle = null, hold_detail = null
   where tenant_id = v_tenant and lead_id = p_lead_id
     and (opening is not null or angle is not null or hold_detail is not null);
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

revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;

/* ------------------------------------------- 14. the page hears the business and the name (0047's list, plus two) -- */

-- 00408's row trigger on contacts, with lead_id and name_source added to the columns a page draws.
create or replace trigger workspace_tell_update after update of
  display_name, wa_profile_name, phone_e164, email, notes, proposal_url, consent, consent_source, consent_updated_at, dnc, marketing_consent, marketing_consent_source, marketing_consent_updated_at, email_marketing, email_marketing_source, email_marketing_updated_at, consent_channels, marketing_channels, email_suppressed_at, email_suppressed_reason, merged_into_contact_id, erased_at, lead_id, name_source on public.contacts
  for each row when (old.display_name is distinct from new.display_name or old.wa_profile_name is distinct from new.wa_profile_name or old.phone_e164 is distinct from new.phone_e164 or old.email is distinct from new.email or old.notes is distinct from new.notes or old.proposal_url is distinct from new.proposal_url or old.consent is distinct from new.consent or old.consent_source is distinct from new.consent_source or old.consent_updated_at is distinct from new.consent_updated_at or old.dnc is distinct from new.dnc or old.marketing_consent is distinct from new.marketing_consent or old.marketing_consent_source is distinct from new.marketing_consent_source or old.marketing_consent_updated_at is distinct from new.marketing_consent_updated_at or old.email_marketing is distinct from new.email_marketing or old.email_marketing_source is distinct from new.email_marketing_source or old.email_marketing_updated_at is distinct from new.email_marketing_updated_at or old.consent_channels is distinct from new.consent_channels or old.marketing_channels is distinct from new.marketing_channels or old.email_suppressed_at is distinct from new.email_suppressed_at or old.email_suppressed_reason is distinct from new.email_suppressed_reason or old.merged_into_contact_id is distinct from new.merged_into_contact_id or old.erased_at is distinct from new.erased_at or old.lead_id is distinct from new.lead_id or old.name_source is distinct from new.name_source)
  execute function public.workspace_tell_row_change();
