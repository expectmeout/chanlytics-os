-- 00548 · An erased person leaves their sequences (decision 0036; 5 Nov 2026: eleven people found by lead search were
-- erased, and ten of their places in a sequence still said "in").
--
-- An erasure ended no place. A lead's later step finds whom it writes to by the email its step before sent
-- (reach_out_followers joins the message), and erase_contact deletes that email with the person: the step never saw
-- them again, so it never passed them over (00455), and their place stood for good, counted among the sequence's
-- people, its next step's day behind it. An email still planned for them waited for the sender to refuse it for
-- another reason (no_parent, lead_gone), and a customer's place for its next step's day, to leave for one too.
--
--   sequence_enrollments_on_erase     As a person or a lead is erased, each place of theirs that still stands leaves
--                                     as erased, through the door every leave goes through
--                                     (sequence_enrollments_leave, 00441): a send of theirs not yet gone is skipped
--                                     with the same word, and a run left with nothing to send ends by its own
--                                     trigger (00532). In the erasure's transaction, as its jobs are withdrawn.
--   contacts_erase_leaves_sequences   A customer's places: the person's own.
--   leads_erase_leaves_sequences      A lead's places, when the lead itself is erased: an erased person's lead is,
--                                     unless someone else at the business stands in (leads_erase_on_contact), and so
--                                     is one its owner erases on Leads (lead_erase).
--
-- The places an erasure before this left standing are not touched here:
-- tooling/scripts/ops/erasure/erased-leave-sequences.mjs ends them, dry run first.
--
-- Deploy order: either. No app calls or reads anything new. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.sequence_enrollments_on_erase() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    perform public.sequence_enrollments_leave(
      NEW.tenant_id,
      array(select e.id from public.sequence_enrollments e
             where e.tenant_id = NEW.tenant_id and e.state = 'in'
               and case when TG_TABLE_NAME = 'leads' then e.lead_id = NEW.id
                        else e.lead_id is null and e.contact_id = NEW.id end),
      'erased', null);
  end if;
  return null;
end $$;

comment on function public.sequence_enrollments_on_erase() is
  'When a person or a lead is erased, each place of theirs that still stands in a sequence leaves as erased (sequence_enrollments_leave), and a send of theirs not yet gone is skipped with it (00548). A person''s own places are a customer''s; a lead''s go when the lead is erased.';

drop trigger if exists contacts_erase_leaves_sequences on public.contacts;
create trigger contacts_erase_leaves_sequences after update of erased_at on public.contacts
  for each row execute function public.sequence_enrollments_on_erase();

drop trigger if exists leads_erase_leaves_sequences on public.leads;
create trigger leads_erase_leaves_sequences after update of erased_at on public.leads
  for each row execute function public.sequence_enrollments_on_erase();

revoke all on function public.sequence_enrollments_on_erase() from public, anon, authenticated;
grant execute on function public.sequence_enrollments_on_erase() to service_role;
