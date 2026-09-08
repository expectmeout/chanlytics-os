-- 00075 · the business on record, and what the carriers made of it.
--
-- One record per workspace, because every registration asks the same
-- questions: the 10DLC brand, a toll-free verification, a hosted-SMS
-- authorization and a port all want the legal name, the tax id, the
-- address, the site and a person who signs. Collected once, shown once.
--
-- The receipts live on the line, because a registration is filed for the
-- number that will carry the traffic.

create table public.business_records (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,
  legal_name       text not null,
  trade_name       text,
  -- Null means a sole proprietor with no tax id: a different brand type,
  -- not a missing field.
  ein              text,
  street           text not null,
  street_secondary text,
  city             text not null,
  region           text not null,
  postal_code      text not null,
  country          text not null default 'US',
  website_url      text not null,
  industry         text not null default 'PROFESSIONAL',
  contact_first_name text not null,
  contact_last_name  text not null,
  contact_email      text not null,
  contact_phone      text not null,
  contact_title      text not null default 'Owner',
  contact_job_position text not null default 'Director',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger business_records_set_updated_at
  before update on public.business_records
  for each row execute function extensions.moddatetime('updated_at');

alter table public.business_records enable row level security;
create policy business_records_member_select on public.business_records
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
comment on table public.business_records is
  'What every carrier registration asks of a business, kept once per workspace. Members read; the edge writes.';

alter publication supabase_realtime add table public.business_records;

-- The receipts, one column per thing the registration made, so a resumed
-- run repeats no call and pays no fee twice.
alter table public.lines add column if not exists profile_sid    text;
alter table public.lines add column if not exists a2p_profile_sid text;
alter table public.lines add column if not exists brand_sid      text;
alter table public.lines add column if not exists campaign_sid   text;
-- Where the registration stopped, in the same shape the provisioning step uses.
alter table public.lines add column if not exists reg_step       text
  check (reg_step is null or reg_step in ('profile','business','representative','address','document','primary','submit','a2p_profile','brand','campaign'));
-- A mock registration is Twilio's free test registry: no fee, no real
-- routing, gone in thirty days. The row says which kind it is so nobody
-- mistakes a rehearsal for the real thing.
alter table public.lines add column if not exists reg_mock       boolean not null default false;
