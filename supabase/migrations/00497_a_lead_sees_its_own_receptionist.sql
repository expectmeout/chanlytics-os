-- 00497 · A lead sees its own receptionist (decision 0079, L1).
--
--   tenants.status preview   A workspace built for a lead before anyone signs up: no member, no billing row, no
--                            public pages, counted apart in the Console. Claimed, it is active and its claimer's.
--   lead_previews            One row per lead a workspace marked ours (00469) wrote to with its preview: the preview's
--                            workspace, its link's token, its state, its clock (30 days from the first email that
--                            carried it), what the business asked it and what it answered, its calls, what it said was
--                            not right, and who made it theirs. Members of the sender read their own; the doors write.
--   preview_make … _end      The doors: made, built, sent, opened, said, called, not right, claimed (the claimer's own
--                            door), ended. Service role only, but the claim.
--   slug_for_workspace       create_workspace_for's slug, lifted out so a claim names its workspace the same way.
--   lead_convert_by          takes the how `claimed`: a lead whose preview was made theirs.
--   preview_build            A job kind: the preview's receptionist written from the lead and its website read and
--                            worn. Lane 1 beside website_read: a send or a member is waiting on it.
--   previews-sweep           The hourly clock: a preview past its end has its agent deleted at the provider and is
--                            erased by preview_end.
--
-- Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------ 1. a preview -- */

alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('active', 'paused', 'test', 'preview'));

create table if not exists public.lead_previews (
  id                uuid primary key default gen_random_uuid(),
  -- The workspace that wrote to the lead: Chanlytics' own, in this version.
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  lead_id           uuid not null,
  -- The preview's own workspace; null once it is erased.
  preview_tenant_id uuid references public.tenants (id) on delete set null,
  -- The link's last part: 22 base64url characters over 16 random bytes. The link is the invitation, so it is kept.
  token             text not null check (token ~ '^[A-Za-z0-9_-]{22}$'),
  state             text not null default 'building'
                    check (state in ('building', 'ready', 'failed', 'claimed', 'ended')),
  failed_why        text check (failed_why is null or char_length(failed_why) between 1 and 60),
  made_by           uuid,
  built_at          timestamptz,
  first_sent_at     timestamptz,
  ends_at           timestamptz not null default now() + interval '30 days',
  opened_count      integer not null default 0 check (opened_count >= 0),
  opened_at         timestamptz,
  last_opened_at    timestamptz,
  -- [{role: user|assistant, content, then?, at}]: what the business asked and what it answered, twenty of each.
  turns             jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(turns) = 'array' and jsonb_array_length(turns) <= 40),
  asked_count       smallint not null default 0 check (asked_count between 0 and 20),
  tried_at          timestamptz,
  call_count        smallint not null default 0 check (call_count >= 0),
  call_seconds      integer not null default 0 check (call_seconds >= 0),
  -- [{fact, said?, at}]: what the business said was not right, for the sender.
  not_right         jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(not_right) = 'array' and jsonb_array_length(not_right) <= 10),
  claimed_at        timestamptz,
  claimed_by        uuid,
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lead_previews_lead_fkey foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade,
  constraint lead_previews_failed_says_why check ((state = 'failed') = (failed_why is not null)),
  constraint lead_previews_claimed_is_dated check ((state = 'claimed') = (claimed_at is not null)),
  constraint lead_previews_ended_is_dated check ((state = 'ended') = (ended_at is not null))
);
comment on table public.lead_previews is
  'A lead''s own receptionist before they sign up (decision 0079): the preview workspace, its link''s token, its state and clock, what the business asked it and what it answered, its calls, what it said was not right, and who made it theirs. Members of the sender read it; only the preview doors write it.';

create unique index if not exists lead_previews_one_per_lead on public.lead_previews (tenant_id, lead_id);
create unique index if not exists lead_previews_token_key on public.lead_previews (token);
create unique index if not exists lead_previews_preview_tenant_key on public.lead_previews (preview_tenant_id)
  where preview_tenant_id is not null;
create index if not exists lead_previews_ending on public.lead_previews (ends_at)
  where state in ('building', 'ready', 'failed');
create index if not exists lead_previews_tried on public.lead_previews (tenant_id, tried_at desc)
  where tried_at is not null;

drop trigger if exists lead_previews_set_updated_at on public.lead_previews;
create trigger lead_previews_set_updated_at before update on public.lead_previews
  for each row execute function extensions.moddatetime('updated_at');

alter table public.lead_previews enable row level security;
drop policy if exists lead_previews_member_select on public.lead_previews;
create policy lead_previews_member_select on public.lead_previews for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.lead_previews from anon, authenticated;
grant select on public.lead_previews to authenticated;
grant select, insert, update, delete on public.lead_previews to service_role;

-- A preview whose row goes (its lead, or the sender, deleted) takes its workspace with it, unless it was made theirs.
create or replace function public.lead_previews_take_their_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.preview_tenant_id is not null then
    delete from public.tenants t where t.id = old.preview_tenant_id and t.status = 'preview';
  end if;
  return old;
end $$;
revoke execute on function public.lead_previews_take_their_workspace() from public, anon, authenticated;
drop trigger if exists lead_previews_take_their_workspace on public.lead_previews;
create trigger lead_previews_take_their_workspace after delete on public.lead_previews
  for each row execute function public.lead_previews_take_their_workspace();

-- A lead blanked or erased (lead_blank, lead_erase, a person's erasure) ends its preview at once: what the business
-- wrote to it and said was not right cleared, its workspace erased. One made theirs is theirs, and stays.
create or replace function public.lead_previews_end_with_their_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  update public.lead_previews p
     set state = 'ended', ended_at = now(), turns = '[]'::jsonb, not_right = '[]'::jsonb
   where p.tenant_id = new.tenant_id and p.lead_id = new.id and p.state in ('building', 'ready', 'failed')
  returning p.preview_tenant_id into v_ws;
  if v_ws is not null then
    delete from public.tenants t where t.id = v_ws and t.status = 'preview';
  end if;
  return new;
end $$;
revoke execute on function public.lead_previews_end_with_their_lead() from public, anon, authenticated;
drop trigger if exists lead_previews_end_with_their_lead on public.leads;
create trigger lead_previews_end_with_their_lead after update of blanked_at, erased_at on public.leads
  for each row when ((new.blanked_at is not null and old.blanked_at is null)
                     or (new.erased_at is not null and old.erased_at is null))
  execute function public.lead_previews_end_with_their_lead();

/* ------------------------------------------------------- 2. the slug, once -- */

-- create_workspace_for's slug, as it stood (00202), so a claim names its workspace by the same rule: lowercase ASCII,
-- single dashes, no leading or trailing dash, the first free of -1 to -50, then a random tail.
create or replace function public.slug_for_workspace(p_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_try  int := 0;
begin
  -- Slug: lowercase ASCII, single dashes, no leading or trailing dash.
  v_base := lower(v_name);
  v_base := translate(
    v_base,
    'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįòóôõöøōŏőùúûüũūŭůñńçćčšž',
    'aaaaaaaaaeeeeeeeeeiiiiiiiiooooooooouuuuuuuunncccsz'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := left(v_base, 40);
  v_base := btrim(v_base, '-');
  if v_base = '' then
    v_base := 'workspace';
  end if;

  -- Collision handling that terminates.
  v_slug := v_base;
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_try := v_try + 1;
    if v_try > 50 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_slug := v_base || '-' || v_try::text;
  end loop;
  return v_slug;
end $$;
comment on function public.slug_for_workspace(text) is
  'A workspace''s slug from its name (create_workspace_for''s rule since 00021, lifted out in 00497 for a preview''s claim): lowercase ASCII, single dashes, at most 40, the first free of -1 to -50, then a random tail. Definer doors only.';
revoke execute on function public.slug_for_workspace(text) from public, anon, authenticated;

create or replace function public.create_workspace_for(
  p_user uuid,
  p_name text,
  p_timezone text default null,
  p_partner_code text default null
)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := p_user;
  v_name    text := btrim(coalesce(p_name, ''));
  v_tz      text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_code    text := nullif(lower(btrim(coalesce(p_partner_code, ''))), '');
  v_slug    text;
  v_owned   int;
  v_id      uuid;
  v_partner public.partners;
  v_why     text;
begin
  -- No user, no workspace: the whole model is "this person becomes the owner".
  if v_user is null then
    raise exception 'A user is required.' using errcode = '28000';
  end if;

  if length(v_name) < 2 then
    raise exception 'A workspace needs a name of at least 2 characters.' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'That name is too long — 120 characters at most.' using errcode = '22023';
  end if;

  -- An unreal zone is not a cosmetic mistake (see 00021). Rejected at the door.
  -- `pg_timezone_names.name` is qualified because this function RETURNS a
  -- column called `name`; every table reference below is aliased for the same
  -- reason.
  if v_tz is not null
     and not exists (select 1 from pg_timezone_names z where z.name = v_tz) then
    raise exception 'Unknown timezone: %', v_tz using errcode = '22023';
  end if;

  -- Anti-abuse, not a product limit.
  select count(*) into v_owned
    from public.memberships m
   where m.user_id = v_user and m.role = 'owner';
  if v_owned >= 10 then
    raise exception 'This account already owns 10 workspaces.' using errcode = '54000';
  end if;

  -- Slug: one rule for every workspace's (slug_for_workspace, 00497).
  v_slug := public.slug_for_workspace(v_name);

  -- The AFTER INSERT trigger from 00017 provisions policies + config here.
  insert into public.tenants (slug, name, timezone)
  values (v_slug, v_name, coalesce(v_tz, 'America/New_York'))
  returning tenants.id into v_id;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_id, v_user, 'owner');

  -- The partner (0012): credited only when the code names an active partner who is not the caller, and only now.
  -- A code that names nobody creditable is recorded as ignored, with why, and the workspace is made all the same:
  -- the link is the partner's affair, never the business's problem.
  if v_code is not null then
    select p.* into v_partner from public.partners p where p.code = v_code;
    if v_partner.id is null then
      v_why := 'unknown';
    elsif v_partner.status <> 'active' then
      v_why := v_partner.status;
    elsif v_partner.user_id = v_user then
      v_why := 'self';
    end if;
    if v_why is null then
      insert into public.partner_tenants (tenant_id, partner_id, code_used)
      values (v_id, v_partner.id, v_code);
      insert into public.memberships (tenant_id, user_id, role)
      values (v_id, v_partner.user_id, 'partner');
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_id, 'partner.attributed', 'workspace', 'tenant', v_id,
              jsonb_build_object('partner_id', v_partner.id, 'code', v_code, 'by', v_user));
    else
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_id, 'partner.code_ignored', 'workspace', 'tenant', v_id,
              jsonb_build_object('code', v_code, 'why', v_why, 'by', v_user));
    end if;
  end if;

  return query
    select t.id, t.slug, t.name, t.status, t.timezone, t.locale
      from public.tenants t
     where t.id = v_id;
end $$;

comment on function public.create_workspace_for(uuid, text, text, text) is
  'Create a workspace and make p_user its owner, in one transaction; with p_partner_code, credit the partner it names and seat them on the team (0012). Service role only; create_workspace wraps it for signed-in callers.';

-- Service role alone: a signed-in caller must not name another user as owner.
revoke execute on function public.create_workspace_for(uuid, text, text, text) from public, anon, authenticated;

/* -------------------------------------------------------------- 3. the doors -- */

-- Made: the preview's workspace and its row, or the row that stands. The name is the one the lead is called by
-- (contracts leadCalledByOf) and the zone its region's, both read by the caller.
create or replace function public.preview_make(
  p_tenant_id uuid,
  p_lead_id   uuid,
  p_name      text,
  p_timezone  text,
  p_by        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_tz   text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_lead public.leads%rowtype;
  v_row  public.lead_previews%rowtype;
  v_ws   uuid;
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.ours) then
    raise exception 'Only Chanlytics'' own workspace makes previews.' using errcode = '42501';
  end if;
  select * into v_lead from public.leads l where l.id = p_lead_id and l.tenant_id = p_tenant_id for update;
  if not found or v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_row from public.lead_previews p where p.tenant_id = p_tenant_id and p.lead_id = p_lead_id;
  if found then
    return jsonb_build_object('id', v_row.id, 'token', v_row.token, 'state', v_row.state,
                              'preview_tenant_id', v_row.preview_tenant_id, 'made', false);
  end if;
  if v_lead.kind <> 'place' then
    raise exception 'A preview is for a business that takes bookings.' using errcode = '22023';
  end if;
  if v_lead.stage not in ('ready', 'nurture') then
    raise exception 'This lead is closed.' using errcode = '22023';
  end if;
  if length(v_name) < 2 then
    raise exception 'A preview needs the business''s name.' using errcode = '22023';
  end if;
  if v_tz is not null and not exists (select 1 from pg_timezone_names z where z.name = v_tz) then
    v_tz := null;
  end if;
  -- Its own slug until it is claimed: a preview holds no business's name on /b/.
  -- The AFTER INSERT trigger from 00017 provisions its policies and config.
  insert into public.tenants (slug, name, timezone, status)
  values ('preview-' || replace(gen_random_uuid()::text, '-', ''), v_name, coalesce(v_tz, 'America/New_York'),
          'preview')
  returning id into v_ws;
  insert into public.lead_previews (tenant_id, lead_id, preview_tenant_id, token, made_by)
  values (p_tenant_id, p_lead_id, v_ws,
          left(translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_'), 22), p_by)
  returning * into v_row;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'preview.made', 'lead', 'lead', p_lead_id,
          jsonb_build_object('preview_id', v_row.id, 'by', p_by));
  return jsonb_build_object('id', v_row.id, 'token', v_row.token, 'state', v_row.state,
                            'preview_tenant_id', v_ws, 'made', true);
end $$;
comment on function public.preview_make(uuid, uuid, text, text, uuid) is
  'A lead''s preview (0079): its workspace (status preview, no member, its own slug) and its row in building, or the row that stands. Only a workspace marked ours makes one, for a place lead that is ready or in nurture. Answers {id, token, state, preview_tenant_id, made}. Service role only.';

-- Built: ready, its clock from now (or from the first email, where one went first), or failed and why.
create or replace function public.preview_built(p_id uuid, p_ok boolean, p_why text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_why text := left(nullif(btrim(coalesce(p_why, '')), ''), 60);
begin
  if p_ok then
    update public.lead_previews p
       set state = 'ready', built_at = now(), ends_at = coalesce(p.first_sent_at, now()) + interval '30 days'
     where p.id = p_id and p.state = 'building';
  else
    update public.lead_previews p
       set state = 'failed', failed_why = coalesce(v_why, 'build_failed')
     where p.id = p_id and p.state = 'building';
  end if;
  return found;
end $$;
comment on function public.preview_built(uuid, boolean, text) is
  'A preview''s build answered (0079): ready, its thirty days from now or from the first email that carried it, or failed with why. Only a building preview moves. Service role only.';

-- Sent: the first email that carried it starts its thirty days.
create or replace function public.preview_sent(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_previews p
     set first_sent_at = now(), ends_at = now() + interval '30 days'
   where p.id = p_id and p.first_sent_at is null and p.state in ('building', 'ready');
  return found;
end $$;
comment on function public.preview_sent(uuid) is
  'The first email that carried a preview (0079): stamped once, its thirty days counted from it. Service role only.';

-- Opened: counted by the page's own script, while it is open to try.
create or replace function public.preview_opened(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.lead_previews p
     set opened_count = p.opened_count + 1, opened_at = coalesce(p.opened_at, now()), last_opened_at = now()
   where p.id = p_id and p.state = 'ready'
  returning p.opened_count into v_n;
  return v_n;
end $$;
comment on function public.preview_opened(uuid) is
  'A preview''s page drawn in a browser (0079): counted by the page''s own script, so a scanner''s fetch is no open. Answers the count, or null for a preview not open to try. Service role only.';

-- Said: a message and its answer, twenty at most, the first one the moment it was tried.
create or replace function public.preview_said(p_id uuid, p_text text, p_reply jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_said text := btrim(coalesce(p_reply->>'text', ''));
  v_row  public.lead_previews%rowtype;
begin
  if char_length(v_text) not between 1 and 500 or v_said = '' then
    raise exception 'A message and its answer are needed.' using errcode = '22023';
  end if;
  select * into v_row from public.lead_previews p where p.id = p_id for update;
  if not found or v_row.state <> 'ready' then
    raise exception 'This preview has ended.' using errcode = 'P0002';
  end if;
  if v_row.asked_count >= 20 then
    raise exception 'That''s all a preview answers.' using errcode = '54000';
  end if;
  update public.lead_previews p
     set turns = p.turns
                 || jsonb_build_array(
                      jsonb_build_object('role', 'user', 'content', v_text, 'at', now()),
                      jsonb_strip_nulls(jsonb_build_object('role', 'assistant', 'content', left(v_said, 2000),
                                                           'then', p_reply->'then', 'at', now()))),
         asked_count = p.asked_count + 1,
         tried_at = coalesce(p.tried_at, now())
   where p.id = p_id;
  return v_row.asked_count + 1;
end $$;
comment on function public.preview_said(uuid, text, jsonb) is
  'A message to a preview and its receptionist''s answer (0079), kept in its turns: twenty at most (54000 past them), the first stamping tried_at. Refused for a preview not open to try (P0002). Answers the count. Service role only.';

-- Called: a call on the preview's workspace ended, its seconds counted.
create or replace function public.preview_called(p_preview_tenant_id uuid, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_previews p
     set call_count = p.call_count + 1, call_seconds = p.call_seconds + greatest(0, coalesce(p_seconds, 0)),
         tried_at = coalesce(p.tried_at, now())
   where p.preview_tenant_id = p_preview_tenant_id and p.state = 'ready';
  return found;
end $$;
comment on function public.preview_called(uuid, integer) is
  'A call to a preview ended (0079): one more call and its seconds, the first stamping tried_at. Service role only.';

-- Not right: what the business said is wrong, for the sender; the receptionist is never changed by it.
create or replace function public.preview_not_right(p_id uuid, p_fact text, p_said text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fact text := btrim(coalesce(p_fact, ''));
  v_said text := nullif(btrim(coalesce(p_said, '')), '');
  v_row  public.lead_previews%rowtype;
begin
  if char_length(v_fact) not between 1 and 80 or char_length(coalesce(v_said, '')) > 300 then
    raise exception 'Say which fact is not right.' using errcode = '22023';
  end if;
  select * into v_row from public.lead_previews p where p.id = p_id for update;
  if not found or v_row.state <> 'ready' then
    raise exception 'This preview has ended.' using errcode = 'P0002';
  end if;
  if jsonb_array_length(v_row.not_right) >= 10 then
    raise exception 'That''s all a preview keeps.' using errcode = '54000';
  end if;
  update public.lead_previews p
     set not_right = p.not_right || jsonb_build_array(
                       jsonb_strip_nulls(jsonb_build_object('fact', v_fact, 'said', v_said, 'at', now())))
   where p.id = p_id;
  return jsonb_array_length(v_row.not_right) + 1;
end $$;
comment on function public.preview_not_right(uuid, text, text) is
  'What a business said is not right on its preview (0079): kept for the sender, ten at most, never written into the receptionist. Service role only.';

-- Claimed: the claimer's own door. The first claim wins; the row is locked before anything is read of it.
create or replace function public.preview_claim(p_token text)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_row   public.lead_previews%rowtype;
  v_name  text;
  v_owned int;
  v_slug  text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from public.lead_previews p where p.token = p_token for update;
  if not found then
    raise exception 'This preview was not found.' using errcode = 'P0002';
  end if;
  select t.name into v_name from public.tenants t where t.id = v_row.preview_tenant_id;
  if v_row.state = 'claimed' then
    raise exception '% is already set up.', coalesce(v_name, 'This business') using errcode = '55000';
  end if;
  if v_row.state <> 'ready' or v_name is null then
    raise exception 'This preview has ended.' using errcode = '55000';
  end if;
  -- Anti-abuse, as create_workspace_for's.
  select count(*) into v_owned from public.memberships m where m.user_id = v_user and m.role = 'owner';
  if v_owned >= 10 then
    raise exception 'This account already owns 10 workspaces.' using errcode = '54000';
  end if;
  v_slug := public.slug_for_workspace(v_name);
  update public.tenants t set status = 'active', slug = v_slug
   where t.id = v_row.preview_tenant_id and t.status = 'preview';
  if not found then
    raise exception 'This preview has ended.' using errcode = '55000';
  end if;
  insert into public.memberships (tenant_id, user_id, role) values (v_row.preview_tenant_id, v_user, 'owner');
  update public.lead_previews p set state = 'claimed', claimed_at = now(), claimed_by = v_user where p.id = v_row.id;
  -- The sender's side: the lead is converted, its places leave every sequence and what was planned is skipped, as
  -- reach_out_lead_stop skips it.
  perform public.lead_convert_by(v_row.tenant_id, v_row.lead_id, 'claimed',
                                 jsonb_build_object('preview_id', v_row.id));
  perform public.sequence_enrollments_leave(
    v_row.tenant_id,
    array(select e.id from public.sequence_enrollments e
           where e.tenant_id = v_row.tenant_id and e.lead_id = v_row.lead_id and e.state = 'in'),
    'made_it_theirs', null);
  update public.sequence_sends s
     set state = 'skipped', reason = 'made_it_theirs'
    from public.sequence_batches b
   where s.lead_id is not null and b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
     and s.tenant_id = v_row.tenant_id and s.lead_id = v_row.lead_id and s.state in ('planned', 'held', 'drafted');
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'preview.claimed', 'lead', 'lead', v_row.lead_id,
          jsonb_build_object('preview_id', v_row.id)),
         (v_row.preview_tenant_id, 'preview.claimed', 'workspace', 'tenant', v_row.preview_tenant_id,
          jsonb_build_object('by', v_user));
  return query
    select t.id, t.slug, t.name, t.status, t.timezone, t.locale
      from public.tenants t
     where t.id = v_row.preview_tenant_id;
end $$;
comment on function public.preview_claim(text) is
  'Make it mine (0079): the signed-in caller claims a ready preview by its token. The first claim wins (the row is locked first); the workspace becomes active under its own slug with the caller as owner; the sender''s lead is converted (claimed), its places leave every sequence and its planned sends are skipped (made_it_theirs). At most ten owned, as create_workspace_for. Answers the workspace as /api/v1/workspaces lists it.';

-- Ended: its words cleared, its workspace erased; the counts stay.
create or replace function public.preview_end(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lead_previews%rowtype;
begin
  select * into v_row from public.lead_previews p where p.id = p_id for update;
  if not found or v_row.state in ('claimed', 'ended') then
    return false;
  end if;
  update public.lead_previews p
     set state = 'ended', ended_at = now(), turns = '[]'::jsonb, not_right = '[]'::jsonb
   where p.id = p_id;
  if v_row.preview_tenant_id is not null then
    delete from public.tenants t where t.id = v_row.preview_tenant_id and t.status = 'preview';
  end if;
  return true;
end $$;
comment on function public.preview_end(uuid) is
  'A preview past its thirty days (0079): ended, its turns and not-right lines cleared, its workspace deleted (everything of it cascades); its counts and dates kept. A claimed one is never ended. Its agent at the provider is the sweep''s to delete first. Service role only.';

revoke execute on function public.preview_make(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.preview_built(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.preview_sent(uuid) from public, anon, authenticated;
revoke execute on function public.preview_opened(uuid) from public, anon, authenticated;
revoke execute on function public.preview_said(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.preview_called(uuid, integer) from public, anon, authenticated;
revoke execute on function public.preview_not_right(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.preview_end(uuid) from public, anon, authenticated;
revoke execute on function public.preview_claim(text) from public, anon;
grant execute on function public.preview_make(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.preview_built(uuid, boolean, text) to service_role;
grant execute on function public.preview_sent(uuid) to service_role;
grant execute on function public.preview_opened(uuid) to service_role;
grant execute on function public.preview_said(uuid, text, jsonb) to service_role;
grant execute on function public.preview_called(uuid, integer) to service_role;
grant execute on function public.preview_not_right(uuid, text, text) to service_role;
grant execute on function public.preview_end(uuid) to service_role;
grant execute on function public.preview_claim(text) to authenticated;

/* ------------------------------------------------------- 4. a claim converts -- */

create or replace function public.lead_convert_by(
  p_tenant_id uuid,
  p_lead_id   uuid,
  p_how       text,
  p_data      jsonb default null,
  p_any_stage boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  if p_how is null or p_how not in ('call', 'reply', 'booking', 'deal', 'arrived', 'added', 'claimed') then
    raise exception 'how must be call, reply, booking, deal, arrived, added or claimed' using errcode = '22023';
  end if;
  update public.leads l
     set stage        = 'converted',
         closed_reason = null,
         converted_at = coalesce(l.converted_at, now()),
         contacted_at = coalesce(l.contacted_at, now()),
         version      = l.version + 1
   where l.id = p_lead_id and l.tenant_id = p_tenant_id
     and l.erased_at is null and l.blanked_at is null
     and (l.stage in ('ready', 'nurture') or coalesce(p_any_stage, false))
  returning * into v_lead;
  if not found then
    return jsonb_build_object('moved', false, 'version',
      (select l.version from public.leads l where l.id = p_lead_id and l.tenant_id = p_tenant_id));
  end if;
  -- The door's own fact is written last, so no data handed in can say another way.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,
          coalesce(p_data, '{}'::jsonb) || jsonb_build_object('how', p_how));
  return jsonb_build_object('moved', true, 'version', v_lead.version);
end $$;

comment on function public.lead_convert_by(uuid, uuid, text, jsonb, boolean) is
  'A lead''s conversion, written once for every door that converts (Reach out Part 5, G19; the person door''s link since 00346): a ready or nurture lead (any, with p_any_stage) becomes converted, closed_reason null, converted_at and contacted_at kept or now, version + 1, with lead.converted {how} and what the caller adds. how is call, reply, booking, deal, arrived (their person wrote or called) added (their person was named by a member, a file, the calendar or the finder) or claimed (their preview made theirs, 00497). Answers {moved, version}. Called only by definer doors; nobody holds EXECUTE.';

/* --------------------------------------------------------- 5. the build job -- */

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver', 'booking_read', 'inbound_answer', 'history_import', 'website_read', 'preview_build'));

alter table public.jobs alter column lane set expression as (
  case
    when kind = 'inbound_answer' then 0
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read', 'booking_read', 'website_read', 'preview_build') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts', 'history_import') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
);
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read, a booking notice read, a website read for Check, 00479, a lead''s preview built, 00497), 2 bulk (a history brought in, 00478, among it). Generated from kind and payload; an event_deliver runs in its subscription''s lane (payload.lane, 00334), a text''s answer in a reply''s (inbound_answer, 00347); null for a kind the case does not name, claimed last.';

/* ------------------------------------------------------------- 6. the clock -- */

-- Every hour the clock asks the edge only when a preview is past its end, and records that it looked otherwise.
create or replace function public.trigger_previews_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from lead_previews p where p.state in ('building', 'ready', 'failed') and p.ends_at < now()
     ) then
    return public.request_sweep('previews', '/api/cron/previews');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('previews', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_previews_sweep() from public, anon, authenticated;
comment on function public.trigger_previews_sweep() is
  'The previews sweep''s clock (0079). Calls the edge (/api/cron/previews) only when a preview is past its thirty days; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every hour, recording itself each time: three hours is three missed ticks.
  ('previews', 'previews-sweep', interval '3 hours', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('previews-sweep') where exists (select 1 from cron.job where jobname = 'previews-sweep');
select cron.schedule('previews-sweep', '41 * * * *', $$select public.trigger_previews_sweep()$$);
