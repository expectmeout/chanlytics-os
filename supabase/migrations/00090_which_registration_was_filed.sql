-- 00090 · Which of the two registrations this line actually got.
--
-- There are two, and they are not the same product. The standard one has no
-- throughput ceiling. The sole-proprietor one -- for a business with no tax id,
-- which is a great many of the businesses this product is for -- allows one
-- number, one campaign, and about one message a second, with T-Mobile taking a
-- thousand a day.
--
-- Nothing on the row remembered which one was filed, so the texting sentence
-- said the same thing to both: "customers text this number, the receptionist
-- answers." A sole proprietor sending to three hundred people then watches it
-- trickle out over five minutes with no explanation anywhere in the product,
-- and the reasonable conclusion is that Chanlytics is broken.
--
-- It cannot be derived at read time. `brand_type` follows from the business
-- record's tax id, and the record CHANGES: a sole proprietor who incorporates
-- and types their new EIN would read back as standard while the brand the
-- carriers hold is still the narrow one -- promising throughput they do not
-- have, which is worse than saying nothing. What was filed is a fact about the
-- filing, so it is stored beside the other filing receipts.

alter table public.lines add column if not exists reg_sole_prop boolean not null default false;

comment on column public.lines.reg_sole_prop is
  'True when the carrier registration on this line is the SOLE_PROPRIETOR brand rather than the standard one: one number, one campaign, about one message a second. Written when the filing is made, never derived from the business record afterwards -- the record can change and the filed brand cannot.';

-- Written by the edge through the service role, like every other reg_* column.
-- tenant_config's UPDATE grant has been narrowed twice (00037, 00085) and lines
-- has its own; this is a filing receipt, not a member's field, so it is
-- deliberately not granted to `authenticated`. Read the grants rather than
-- assuming them -- a missing grant makes the write succeed and change nothing.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into cols
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'lines'
     and grantee = 'authenticated'
     and privilege_type = 'UPDATE';
  raise notice '00090: reg_sole_prop is service-role only (authenticated may update: %)', coalesce(cols, 'nothing');
end $$;
