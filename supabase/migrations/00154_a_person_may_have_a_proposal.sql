-- 00154 · A person may have a proposal.
--
-- A business that talks its way to a booked time also talks its way to a
-- priced piece of work: a move, a package, a project. The owner writes that
-- up somewhere else -- a document, a quote tool -- and what the customer
-- needs from the receptionist is the way to it. So a proposal is a LINK on
-- the person, the way booking is a link on the workspace (00012): nothing is
-- uploaded, nothing is stored but the address, and the receptionist sends the
-- address in its own words and states none of the figures behind it (the
-- no-prices rule, contracts policy.ts, is untouched).
--
-- One column, beside the notes (00054) and the address (00125): a second home
-- for one fact is how two homes drift. The CHECK holds the STORED shape only
-- -- trimmed, a web address, no whitespace, at most 500 characters, the
-- workspace's booking link's own cap (config.ts). What is and is not a link is
-- decided once, in packages/contracts/src/link.ts (normalizeLink), and every
-- writer goes through it; the constraint is what stops a writer that did not.

alter table public.contacts
  add column if not exists proposal_url text;

alter table public.contacts drop constraint if exists contacts_proposal_url_check;
alter table public.contacts add constraint contacts_proposal_url_check
  check (proposal_url is null or (
    proposal_url = btrim(proposal_url)
    and char_length(proposal_url) between 10 and 500
    and proposal_url ~ '^https?://[^[:space:]]+$'
  ));

comment on column public.contacts.proposal_url is
  'The owner''s proposal for this person, as a web address (normalizeLink stores it). The receptionist sends the address when they ask about price or the proposal, and states none of its figures. Never a file.';

-- An erased row holds no proposal: a trigger in 00125's shape, so whatever
-- path erases a row takes the address with it, and the one function the right
-- to be forgotten runs through is not recreated to add a column.
create or replace function public.contact_proposal_on_erase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    new.proposal_url := null;
  end if;
  return new;
end $$;

drop trigger if exists contacts_erase_clears_proposal on public.contacts;
create trigger contacts_erase_clears_proposal
  before update of erased_at on public.contacts
  for each row execute function public.contact_proposal_on_erase();

-- The door. Owner or operator, like the name, the notes and the address. An
-- empty address clears it. The event says THAT a proposal was set or cleared
-- and by whom, never the address: events outlive an erasure (00027), and an
-- address can name a person.
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
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_url is not null and (
       char_length(v_url) not between 10 and 500
       or v_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'That is not a web address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set proposal_url = v_url, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.proposal_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_url is not null, 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'proposal_url', v_url);
end $$;

revoke execute on function public.set_person_proposal(uuid, text) from public, anon;
grant execute on function public.set_person_proposal(uuid, text) to authenticated;
comment on function public.set_person_proposal(uuid, text) is
  'Owner or operator sets a person''s proposal link; empty clears it. The event records that it changed, never the address.';
