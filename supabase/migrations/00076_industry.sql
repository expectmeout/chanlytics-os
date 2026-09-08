-- 00076 · the industry is Twilio's enum, spelled Twilio's way.
--
-- The column defaulted to 'PROFESSIONAL', which Twilio refuses at the
-- evaluation with "The Business Industry is invalid" — after the profile,
-- the business, the person, the address and the document have all been
-- made. The value it accepts is PROFESSIONAL_SERVICES; the code now maps
-- anything unknown onto it rather than letting a typo reach the carriers.

alter table public.business_records alter column industry set default 'PROFESSIONAL_SERVICES';
update public.business_records set industry = 'PROFESSIONAL_SERVICES' where industry = 'PROFESSIONAL';
