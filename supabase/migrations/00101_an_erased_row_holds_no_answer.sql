-- An erased row holds no answer about anybody.
--
-- 00095 wrote erase_marketing_consent "to clear the marketing answer as part of
-- an erasure", and left erase_contact alone on purpose: recreating the one path
-- a person's right to be forgotten runs through, to add two columns, was a risk
-- with no upside. Nothing ever called it. Every tombstone since has kept the
-- answer about offers, where it came from and when. `dnc = true` still blocked
-- every send, so this was never a correctness fix; it is what the erasure
-- promises.
--
-- A trigger rather than a caller, the way 00044 takes an erased person out of
-- every list: whatever path erases a row, the answer goes with it, and no route
-- has to remember to ask. The clearing itself stays in erase_marketing_consent,
-- so what an erasure does to the answer is written in one place.

create or replace function public.marketing_consent_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    perform public.erase_marketing_consent(new.id);
  end if;
  return new;
end $$;

create trigger contacts_erase_clears_marketing
  after update of erased_at on public.contacts
  for each row execute function public.marketing_consent_on_erase();

-- Rows erased before the trigger existed. Production had none on 2026-09-10;
-- this is here so the rule holds on every database the migrations replay on.
do $$
begin
  perform public.erase_marketing_consent(c.id)
     from public.contacts c
    where c.erased_at is not null
      and c.marketing_consent_source is distinct from 'erasure';
end $$;
