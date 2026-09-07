-- 00069 · Google listings: a business on Google Maps, watched.
--
-- Most businesses live on Google whether or not they asked to: a name, an
-- address, a rating, a count of reviews, and the five reviews Google shows
-- first. All of it is public — no owner login, no Google approval. Setup
-- finds the listing from the facts the workspace holds, the edge reads it
-- once a day (and on request), and what changed reaches the bell, Today and
-- Reports. Connecting the Business Profile itself (every review, replies) is
-- a later door, gated by Google's own access approval.
--
-- Three tables, all written by the edge with the service role; members read.
-- The reviews and the days hang off the listing, so a listing removed takes
-- what was read from it along.

create table public.google_listings (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,
  place_id         text not null check (char_length(place_id) between 10 and 300),
  name             text not null check (char_length(name) between 1 and 200),
  address          text,
  maps_uri         text,
  business_status  text,
  rating           numeric(2,1) check (rating is null or (rating >= 1 and rating <= 5)),
  review_count     int check (review_count is null or review_count >= 0),
  linked_by        uuid,
  linked_at        timestamptz not null default now(),
  -- The last successful read; the words of the last failure, null once a read succeeds again.
  checked_at       timestamptz,
  check_error      text,
  facts            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index google_listings_due_idx on public.google_listings (checked_at nulls first);
create trigger google_listings_set_updated_at
  before update on public.google_listings
  for each row execute function extensions.moddatetime('updated_at');

alter table public.google_listings enable row level security;
create policy google_listings_member_select on public.google_listings
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
grant select on public.google_listings to authenticated;
comment on table public.google_listings is
  'A workspace''s business on Google Maps, as the public listing says it: the place, the rating, the count, when it was last read. Members read; the edge writes.';

create table public.google_reviews (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.google_listings (tenant_id) on delete cascade,
  review_id        text not null,
  -- Where it was read from: the public listing (five shown), or the owner's Business Profile (all of them, later).
  origin           text not null default 'places' check (origin in ('places', 'profile')),
  rating           smallint check (rating is null or rating between 1 and 5),
  author           text,
  author_uri       text,
  author_photo_uri text,
  body             text,
  language_code    text,
  published_at     timestamptz,
  reply_text       text,
  replied_at       timestamptz,
  maps_uri         text,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (tenant_id, review_id)
);
create index google_reviews_tenant_published_idx on public.google_reviews (tenant_id, published_at desc nulls last);

alter table public.google_reviews enable row level security;
create policy google_reviews_member_select on public.google_reviews
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
grant select on public.google_reviews to authenticated;
comment on table public.google_reviews is
  'Reviews of the workspace''s listing as Google showed them, one row per review, kept from the first time it was seen. Members read; the edge writes.';

create table public.google_listing_days (
  tenant_id    uuid not null references public.google_listings (tenant_id) on delete cascade,
  day          date not null,
  rating       numeric(2,1),
  review_count int not null check (review_count >= 0),
  primary key (tenant_id, day)
);

alter table public.google_listing_days enable row level security;
create policy google_listing_days_member_select on public.google_listing_days
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
grant select on public.google_listing_days to authenticated;
comment on table public.google_listing_days is
  'The listing''s rating and count per local day, one row per read day: the trend, and what a period gained.';

-- The Setup row and the Reports section repaint as the edge writes.
alter publication supabase_realtime add table public.google_listings, public.google_reviews;

-- The bell learns a kind: a review.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review'));

-- The hourly sweep, the same door the calendar, playbooks, deadman and
-- health sweeps use: pg_cron asks the edge, which reads every listing not
-- read for twenty hours. At :37, a minute no other sweep shares.
create or replace function public.trigger_google_sweep()
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
    raise warning 'google sweep not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/google',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.trigger_google_sweep() from public, anon, authenticated;

select cron.schedule('google-listings-sweep', '37 * * * *', $$select public.trigger_google_sweep()$$);
