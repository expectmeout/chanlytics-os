-- 00077 · what the carriers are told about a business must be asked, not guessed.
--
-- Two fields were being inferred from whether the business has a tax id:
-- its legal form ("has an EIN" became "Limited Liability Corporation") and
-- its company type (which was always "private"). Both are statements about
-- someone's legal entity, made to the carriers in their name, and a
-- corporation or a partnership was being mislabelled. They are collected
-- now, on the enums Twilio publishes, so a wrong one cannot be stored.

alter table public.business_records
  add column if not exists business_type text not null default 'Limited Liability Corporation',
  add column if not exists company_type  text not null default 'private';

alter table public.business_records drop constraint if exists business_records_business_type_check;
alter table public.business_records add constraint business_records_business_type_check
  check (business_type in ('Co-operative', 'Corporation', 'Limited Liability Corporation', 'Non-profit Corporation', 'Partnership'));

alter table public.business_records drop constraint if exists business_records_company_type_check;
alter table public.business_records add constraint business_records_company_type_check
  check (company_type in ('government', 'non-profit', 'private', 'public'));

comment on column public.business_records.business_type is
  'The legal form, on Twilio''s enum. Told to the carriers in the business''s name, so it is asked and never inferred.';
comment on column public.business_records.company_type is
  'Ownership, on Twilio''s enum for the A2P messaging profile.';

-- The sweep that finishes a wait.
--
-- A campaign cannot be filed while the carriers still hold the brand. The
-- status check files it once they are through — but nothing was calling
-- that check, so a registration would have sat in "waiting on carriers"
-- for ever. Hourly, at :23, a minute no other sweep uses.
create or replace function public.trigger_registration_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'registration sweep not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/registrations',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.trigger_registration_sweep() from public, anon, authenticated;

select cron.schedule('registration-sweep', '23 * * * *', $$select public.trigger_registration_sweep()$$);
