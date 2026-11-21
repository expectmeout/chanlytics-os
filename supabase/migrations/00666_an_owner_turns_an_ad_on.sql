-- 00666 · An owner turns an ad on (decision 0050, calls 3 to 6 and 11; the Ads plan's step 4, items 4 and 5: Turn on,
-- and what comes after).
--
-- New ad drew Turn on grey: nothing made an ad at Meta. This is the ground under the press and the job behind it.
--
--   ads.approved     What the owner approved at the press, kept on the ad (0050, call 3): the service, the picture, the
--                    miles, the total and its end, the three versions of the words, the number a tap opens, the area,
--                    and the declaration (no special kind). What the launch compares Meta's read back with.
--   ads.launch       Where the launch of an ad made here stands, as the job keeps it: its key, its step, when a write of
--                    it went unanswered, and why it stopped where it did. Nothing a page draws but through contracts.
--   ads.shown_on     Where the ad shows, as the platform holds it: Facebook, Instagram, and the rest (the read's own word,
--                    or what a launch named). A drawer says where, never a guess.
--   ad_objects       What Chanlytics made at the platform for an ad (0049's ledger for the launch, with no page): the
--                    campaign, the ad set, the picture and an ad for each version of the words, each with its tagged name
--                    and the platform's id once known. A row is written before its make is sent, so a make whose answer
--                    never came is known to have gone, and is found by its name, never sent again.
--   ad_held_for      The one ad Chanlytics holds for a platform's id: its own, or the ad made here that holds it as one
--                    of its versions. A tap on any version names the one ad the owner made.
--   ad_turn_on       The owner's door (0050, calls 3 and 5): the kept draft, as the press judged it, becomes the ad, in
--                    one transaction with the decision (turn_on_ad), the event (ad.turned_on) and the account's job
--                    asked for at once. The owner alone; one launch an account at a time; the same press twice is
--                    answered once; a draft changed since the press judged it is refused; nothing while AI is stopped.
--   ad_launch_keep   The job's door: what a launch made, sent or left, step by step, and where it ended: made, or
--                    stopped, with what was left at the platform. An end is an event (ad.made, ad.setup_stopped).
--   ad_accounts_stop_launches   A launch stops when its account is disconnected or signed out: what was made is kept
--                    as left at the platform, named and paused, and the ad says it couldn't finish (the plan's 4.7, 8).
--   ads_read_keep    Re-made: it keeps where each ad shows, and a read of an ad made here settles a launch whose last
--                    switch went unanswered (the plan's 4.7, 7: followed until the platform says).
--   ad_named, ad_people_in, ad_bell_causes   Re-made: an ad made here is three ads at the platform, one a version, and
--                    a person who tapped any of them came through the one ad the owner made.
--   decisions.verb   Gains turn_on_ad.
--
-- Nothing here calls the platform. The edge does, as the account's own job, one account at a time
-- (apps/edge/lib/ads/launch.ts).
--
-- Locks. Widening the CHECK on `decisions` reads the table once under a lock that holds its writers for that read;
-- adding columns to `ads` takes its lock for a moment. This file waits three seconds for each and no more. Run again on
-- a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first, then the code. Code ahead of it gets PGRST202 from a door and says Turn on is not
-- ready here; nothing before it names these doors or columns. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------- 1. the owner's press -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request', 'return_to_sequence', 'not_a_customer', 'reply_anyway', 'connect_ad_account',
  'disconnect_ad_account', 'pause_ad', 'resume_ad', 'turn_on_ad'
]));

/* ----------------------------------------------------------------------------------------- 2. the ad's columns -- */

alter table public.ads add column if not exists approved jsonb;
alter table public.ads drop constraint if exists ads_approved_check;
alter table public.ads add constraint ads_approved_check
  check (approved is null or (jsonb_typeof(approved) = 'object' and octet_length(approved::text) <= 20000));
alter table public.ads add column if not exists launch jsonb;
alter table public.ads drop constraint if exists ads_launch_check;
alter table public.ads add constraint ads_launch_check
  check (launch is null or (jsonb_typeof(launch) = 'object' and octet_length(launch::text) <= 4000));
alter table public.ads add column if not exists shown_on text[];
alter table public.ads drop constraint if exists ads_shown_on_check;
alter table public.ads add constraint ads_shown_on_check
  check (shown_on is null or cardinality(shown_on) <= 10);

comment on column public.ads.approved is
  'What the owner approved at Turn on, for an ad made here (00666; decision 0050, call 3): the service, the picture, the miles, the total and its end (end_day, and ends_at in the account''s zone), the three versions of the words, the number a tap opens, the area''s address, the Page, the declaration (none) and the most it may cost. The launch compares what the platform holds with it before anything is switched on. Null for an ad made at the platform.';
comment on column public.ads.launch is
  'Where the launch of an ad made here stands (00666): key (the press''s), step (make, switch, done), since, unknown_at (when one of its writes went unanswered: followed by reading, never sent again), stopped (why it stopped part way) and said (the platform''s own words where it refused). Read through contracts adStateOfRow; null for an ad made at the platform.';
comment on column public.ads.shown_on is
  'Where the ad shows, as the platform holds it (00666): the platforms its ad set names (facebook, instagram, and the rest), as the read found them or a launch named them. Null where it is not known.';

/* --------------------------------------------------------------------------------- 3. what was made at Meta -- */

create table if not exists public.ad_objects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  ad_id       uuid not null,
  -- The part it is: the campaign, the ad set under it, the picture in the account's library, or one ad.
  kind        text not null check (kind in ('campaign', 'set', 'picture', 'ad')),
  -- Which version of the words an ad is (1 to 3); 0 for the parts every version shares.
  version     smallint not null default 0 check (version between 0 and 3),
  -- Its name at the platform, tagged so it can be found again by name (decision 0050, call 6).
  name        text not null check (char_length(name) between 1 and 400),
  -- The platform's own id for it (a picture's is its hash in the account's library). Null until it is known.
  platform_id text check (char_length(platform_id) between 1 and 200),
  -- sent: its make went, and no answer has been heard yet (one that never comes is found by its name, never sent
  -- again). made: the platform named it. refused: the platform made nothing. removed: taken away again when the launch
  -- stopped. left: still at the platform, named and paused, where it could not be removed.
  state       text not null check (state in ('sent', 'made', 'refused', 'removed', 'left')),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ad_objects_one_part unique (tenant_id, ad_id, kind, version),
  constraint ad_objects_ad_id_same_workspace foreign key (tenant_id, ad_id)
    references public.ads (tenant_id, id) on delete cascade
);

-- A tap names one version's id: the ad it is a version of is found by it (ad_held_for).
create index if not exists ad_objects_by_platform_id
  on public.ad_objects (tenant_id, platform_id) where kind = 'ad' and platform_id is not null;

drop trigger if exists ad_objects_set_updated_at on public.ad_objects;
create trigger ad_objects_set_updated_at
  before update on public.ad_objects
  for each row execute function extensions.moddatetime('updated_at');

alter table public.ad_objects enable row level security;
drop policy if exists ad_objects_member_select on public.ad_objects;
create policy ad_objects_member_select on public.ad_objects
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.ad_objects from anon, authenticated;
grant select on public.ad_objects to authenticated;
grant all on public.ad_objects to service_role;

comment on table public.ad_objects is
  'What Chanlytics made at the platform for an ad made here (00666; decision 0049''s ledger for the launch, decision 0050 calls 5 and 6): the campaign, the ad set, the picture and an ad for each version of the words, each with its tagged name, the platform''s id once known, and where it stands (sent, made, refused, removed, left). Written before each make is sent, so a make whose answer never came is found by its name and never sent again. Members read; ad_launch_keep writes.';

/* ----------------------------------------------------------------------- 4. the one ad a platform's id names -- */

create or replace function public.ad_held_for(p_tenant_id uuid, p_platform text, p_platform_ad_id text)
returns uuid
language sql
stable
set search_path = public
as $$
  -- The ad that is this id at the platform; else the ad made here that holds it as one version of its words.
  select coalesce(
           (select a.id
              from public.ads a
             where a.tenant_id = p_tenant_id and a.platform = p_platform and a.platform_ad_id = p_platform_ad_id),
           (select o.ad_id
              from public.ad_objects o
              join public.ads a on a.id = o.ad_id and a.tenant_id = o.tenant_id
             where o.tenant_id = p_tenant_id and o.kind = 'ad' and o.platform_id = p_platform_ad_id
               and a.platform = p_platform
             order by o.created_at
             limit 1))
$$;

revoke all on function public.ad_held_for(uuid, text, text) from public, anon;
grant execute on function public.ad_held_for(uuid, text, text) to authenticated, service_role;
comment on function public.ad_held_for(uuid, text, text) is
  'The one ad Chanlytics holds for a platform''s id for an ad (00666): the ad that is that id, or the ad made here that holds it as one version of its words (ad_objects). An ad made here is three ads at the platform, and a tap on any of them came through the one ad the owner made. Null where Chanlytics holds none. SECURITY INVOKER: the caller''s RLS decides what is read.';

/* -------------------------------------------------------------------------------------- 5. turning it on -- */

create or replace function public.ad_turn_on(
  p_tenant_id uuid, p_actor uuid, p_key uuid, p_draft_at timestamptz, p_ad jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.ad_accounts;
  v_draft   public.ad_drafts;
  v_same    public.ads;
  v_ad      uuid;
  v_name    text;
  v_total   bigint;
  v_ends    timestamptz;
  v_due     timestamptz;
  v_asked   integer;
begin
  if p_key is null or p_ad is null or jsonb_typeof(p_ad) <> 'object' or jsonb_typeof(p_ad -> 'approved') <> 'object' then
    raise exception 'ad_turn_on: a key, and the ad with what was approved' using errcode = '22023';
  end if;
  -- The owner alone turns an ad on (0050, call 2): asked here again, whoever knocked.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- The same press twice is answered once: the ad the first one made, wherever it has got to.
  select * into v_same from public.ads a
   where a.tenant_id = p_tenant_id and a.origin = 'chanlytics' and a.launch ->> 'key' = p_key::text;
  if found then
    return jsonb_build_object('outcome', 'same', 'ad_id', v_same.id, 'status', v_same.status);
  end if;
  select * into v_account from public.ad_accounts a
   where a.tenant_id = p_tenant_id and a.platform = 'meta' and a.status = 'connected'
   for update;
  if not found or v_account.external_id is null or v_account.currency is null then
    return jsonb_build_object('outcome', 'not_connected');
  end if;
  -- While AI is stopped, no ad is turned on (0050, call 11): nobody would answer the people it brings.
  if exists (select 1 from public.tenants t where t.id = p_tenant_id and t.sending_stopped_at is not null) then
    return jsonb_build_object('outcome', 'stopped');
  end if;
  -- One launch an account at a time: the platform takes few calls an account, and the job makes one after another.
  if exists (select 1 from public.ads a
              where a.tenant_id = p_tenant_id and a.account_id = v_account.id and a.status = 'sending') then
    return jsonb_build_object('outcome', 'busy');
  end if;
  -- The draft the press judged, as it was then: one changed since, or already turned on, is not this press's.
  select * into v_draft from public.ad_drafts d where d.tenant_id = p_tenant_id for update;
  if not found or v_draft.account_id <> v_account.id or v_draft.updated_at is distinct from p_draft_at then
    return jsonb_build_object('outcome', 'stale');
  end if;

  v_name := nullif(left(btrim(coalesce(p_ad ->> 'name', '')), 500), '');
  v_total := nullif(p_ad ->> 'total_minor', '')::bigint;
  v_ends := nullif(p_ad ->> 'ends_at', '')::timestamptz;
  if v_name is null or v_total is null or v_total <= 0 or v_ends is null or v_ends <= now() then
    raise exception 'ad_turn_on: a name, a total and an end still ahead' using errcode = '22023';
  end if;

  insert into public.ads (
    tenant_id, account_id, platform, origin, name, door, status, intent, intent_at, told_at,
    budget_kind, budget_minor, budget_left_minor, budget_at, budget_shared, ends_at, approved, launch, shown_on, said
  )
  values (
    p_tenant_id, v_account.id, 'meta', 'chanlytics', v_name, 'whatsapp', 'sending', 'on', now(), now(),
    'total', v_total, v_total, 'set', false, v_ends, p_ad -> 'approved',
    jsonb_build_object('key', p_key::text, 'step', 'make', 'since', now()),
    case when jsonb_typeof(p_ad -> 'shown_on') = 'array'
         then array(select jsonb_array_elements_text(p_ad -> 'shown_on')) end,
    case when jsonb_typeof(p_ad -> 'said') = 'object' then p_ad -> 'said' end
  )
  returning id into v_ad;
  -- The draft is the ad now: New ad opens on a fresh one, and a draft left for the owner has been seen to.
  delete from public.ad_drafts d where d.id = v_draft.id;
  update public.notifications n
     set closed_at = now()
   where n.tenant_id = p_tenant_id and n.kind = 'ad_draft' and n.closed_at is null;

  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad', v_ad, 'turn_on_ad', 'user', p_actor,
          jsonb_build_object('platform', 'meta', 'name', v_name, 'total_minor', v_total,
                             'currency', v_account.currency, 'ends_at', v_ends,
                             'declared', coalesce(p_ad -> 'approved' -> 'declared', '"none"'::jsonb)));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'ad.turned_on', 'ads', 'ad', v_ad,
          jsonb_build_object('platform', 'meta', 'name', v_name, 'by', p_actor, 'total_minor', v_total,
                             'ends_at', v_ends));

  -- The account's job, at once (and never before the platform allows a call): the launch is its first work.
  if not exists (select 1 from public.job_kinds k where k.kind = 'ad_read' and k.paused_at is not null) then
    v_due := greatest(now(), coalesce(v_account.read_after, '-infinity'::timestamptz));
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'ad_read', v_due, jsonb_build_object('account_id', v_account.id::text))
    on conflict do nothing;
    get diagnostics v_asked = row_count;
    if v_asked = 0 then
      update public.jobs j
         set due_at = v_due, updated_at = now()
       where j.tenant_id = p_tenant_id and j.kind = 'ad_read' and j.state = 'scheduled'
         and j.payload ->> 'account_id' = v_account.id::text and j.due_at > v_due;
    end if;
  end if;
  return jsonb_build_object('outcome', 'kept', 'ad_id', v_ad, 'status', 'sending');
end $$;

revoke all on function public.ad_turn_on(uuid, uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.ad_turn_on(uuid, uuid, uuid, timestamptz, jsonb) to service_role;
comment on function public.ad_turn_on(uuid, uuid, uuid, timestamptz, jsonb) is
  'Service-role only: an owner turns an ad on (00666; decision 0050, calls 3 and 5). The workspace''s kept draft, as the press judged it (p_draft_at, its updated_at then), becomes an ad made here: status sending, intent on, its total and end, what was approved, where it shows and its first words, and the launch''s key. In one transaction: the draft goes, a draft left for the owner stops waiting on the bell, the decision (turn_on_ad) and the event (ad.turned_on) are written, and the account''s job (ad_read, which launches first) is asked for at once. Answers outcome: kept with the ad''s id; same with the ad a press of this key made; not_allowed for anyone but the owner (has_permission ads, asked here); not_connected; stopped while AI is stopped (tenants.sending_stopped_at); busy while another ad of the account is being set up; stale where the draft changed since, or was turned on already.';

/* ------------------------------------------------------------------------------------ 6. the launch, kept -- */

create or replace function public.ad_launch_keep(p_tenant_id uuid, p_ad_id uuid, p_kept jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad     public.ads;
  v_status text;
  v_part   jsonb;
begin
  if p_kept is null or jsonb_typeof(p_kept) <> 'object' then
    raise exception 'ad_launch_keep: what was kept is an object' using errcode = '22023';
  end if;
  v_status := nullif(p_kept ->> 'status', '');
  if v_status is not null and v_status not in ('made', 'failed') then
    raise exception 'ad_launch_keep: a launch ends made or failed' using errcode = '22023';
  end if;
  select * into v_ad from public.ads a
   where a.id = p_ad_id and a.tenant_id = p_tenant_id and a.origin = 'chanlytics'
   for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Each part as the job saw it: written before its make is sent, then what came of it. Whatever exists at the
  -- platform is kept, even for a launch already stopped: a part made after the stop is left there, named.
  for v_part in select * from jsonb_array_elements(coalesce(p_kept -> 'objects', '[]'::jsonb)) loop
    insert into public.ad_objects as o (tenant_id, ad_id, kind, version, name, platform_id, state, sent_at)
    values (p_tenant_id, p_ad_id, v_part ->> 'kind', coalesce((v_part ->> 'version')::smallint, 0),
            left(v_part ->> 'name', 400), nullif(v_part ->> 'platform_id', ''),
            case when v_ad.status = 'failed' and v_part ->> 'state' = 'made' then 'left' else v_part ->> 'state' end,
            case when v_part ->> 'state' = 'sent' then now() end)
    on conflict (tenant_id, ad_id, kind, version) do update
       set platform_id = coalesce(excluded.platform_id, o.platform_id),
           state = excluded.state,
           sent_at = coalesce(o.sent_at, excluded.sent_at);
  end loop;

  -- Where it ends, once: a launch made or stopped stays so. Its platform ids and word come with a made one.
  if v_status is not null and v_ad.status = 'sending' then
    update public.ads a
       set status = v_status,
           platform_campaign_id = coalesce(nullif(p_kept ->> 'campaign_id', ''), a.platform_campaign_id),
           platform_set_id = coalesce(nullif(p_kept ->> 'set_id', ''), a.platform_set_id),
           platform_ad_id = coalesce(nullif(p_kept ->> 'platform_ad_id', ''), a.platform_ad_id),
           platform_state = coalesce(nullif(left(p_kept ->> 'platform_state', 100), ''), a.platform_state),
           launch = coalesce(a.launch, '{}'::jsonb) || coalesce(p_kept -> 'launch', '{}'::jsonb),
           read_at = case when v_status = 'made' then now() else a.read_at end
     where a.id = p_ad_id
    returning * into v_ad;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, case v_status when 'made' then 'ad.made' else 'ad.setup_stopped' end, 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name,
                               'why', v_ad.launch ->> 'stopped', 'said', v_ad.launch ->> 'said',
                               'left', (select count(*) from public.ad_objects o
                                         where o.ad_id = p_ad_id and o.state = 'left')));
  elsif p_kept ? 'launch' then
    update public.ads a
       set launch = coalesce(a.launch, '{}'::jsonb) || (p_kept -> 'launch')
     where a.id = p_ad_id
    returning * into v_ad;
  end if;

  -- A launch still on its way is taken up again soon by its account's job, whatever pace the account is read at; one
  -- just made is read soon, so the page says what the platform says of it.
  if v_ad.status = 'sending' or v_status = 'made' then
    update public.ad_accounts c
       set next_read_at = least(coalesce(c.next_read_at, 'infinity'::timestamptz), now() + interval '1 minute')
     where c.id = v_ad.account_id and c.tenant_id = p_tenant_id;
  end if;
  return jsonb_build_object('status', v_ad.status, 'intent', v_ad.intent, 'launch', v_ad.launch);
end $$;

revoke all on function public.ad_launch_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_launch_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ad_launch_keep(uuid, uuid, jsonb) is
  'Service-role only: what the launch of an ad made here came to, step by step (00666; decision 0050, calls 5 and 6). objects: each part as the job saw it (ad_objects: written sent before its make goes, then made with the platform''s id, refused, removed or left); a part made after the launch stopped is kept as left. status: made (with campaign_id, set_id, platform_ad_id and the platform''s word) or failed, once, from sending, with the event ad.made or ad.setup_stopped. launch: merged into ads.launch (step, unknown_at, stopped, said). While the launch is still on its way, and once it is made, its account''s next read is brought within a minute, so the job takes it up again and the page says what the platform says. Answers {status, intent, launch}; status not_found for an ad that is not one made here.';

/* ------------------------------------------------------------- 7. a disconnect, or a sign-out, stops a launch -- */

create or replace function public.ad_accounts_stop_launches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nothing more is sent to the platform for this account: a launch on its way stops where it is, and whatever it made
  -- stays there, named and paused, for the owner to see and remove in Meta (the plan's 4.7, 8).
  with stopped as (
    update public.ads a
       set status = 'failed',
           launch = coalesce(a.launch, '{}'::jsonb)
                    || jsonb_build_object('stopped', case new.status when 'revoked' then 'signed_out' else 'disconnected' end)
     where a.tenant_id = new.tenant_id and a.account_id = new.id and a.status = 'sending'
    returning a.id, a.platform, a.name
  ), left_there as (
    update public.ad_objects o
       set state = 'left'
     where o.tenant_id = new.tenant_id and o.ad_id in (select s.id from stopped s) and o.state in ('sent', 'made')
    returning o.ad_id
  )
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select new.tenant_id, 'ad.setup_stopped', 'ads', 'ad', s.id,
         jsonb_build_object('platform', s.platform, 'name', s.name,
                            'why', case new.status when 'revoked' then 'signed_out' else 'disconnected' end,
                            'left', (select count(*) from left_there l where l.ad_id = s.id))
    from stopped s;
  return new;
end $$;

revoke all on function public.ad_accounts_stop_launches() from public, anon, authenticated;
comment on function public.ad_accounts_stop_launches() is
  'Trigger (00666): an ad account disconnected by its owner or signed out by the platform stops every launch of its ads still on its way. The ad is failed with why (disconnected, signed_out), every part it made is kept as left at the platform (named and paused there), and an ad.setup_stopped event says so. Nothing is sent to the platform after.';

drop trigger if exists ad_accounts_stop_launches on public.ad_accounts;
create trigger ad_accounts_stop_launches
  after update of status on public.ad_accounts
  for each row when (old.status = 'connected' and new.status in ('disconnected', 'revoked'))
  execute function public.ad_accounts_stop_launches();

/* ------------------------------------------------------------------------- 8. the page hears a launch move -- */

-- An ad's update is told when what its row draws moved: now its launch and where it shows too.
create or replace trigger workspace_tell_update
  after update of name, intent, status, platform_state, platform_issue, budget_kind, budget_minor, budget_left_minor,
                  budget_shared, ends_at, intent_at, told_at, launch, shown_on
  on public.ads
  for each row when (
    old.name is distinct from new.name or old.intent is distinct from new.intent
    or old.status is distinct from new.status or old.platform_state is distinct from new.platform_state
    or old.platform_issue is distinct from new.platform_issue or old.budget_kind is distinct from new.budget_kind
    or old.budget_minor is distinct from new.budget_minor
    or old.budget_left_minor is distinct from new.budget_left_minor
    or old.budget_shared is distinct from new.budget_shared or old.ends_at is distinct from new.ends_at
    or old.intent_at is distinct from new.intent_at or old.told_at is distinct from new.told_at
    or old.launch is distinct from new.launch or old.shown_on is distinct from new.shown_on)
  execute function public.workspace_tell_row_change();

/* ------------------------------------------------------------- 9. a tap on any version is the one ad's -- */

create or replace function public.ad_named(p_tenant_id uuid, p_ref text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
           'platform', r.platform,
           'name', coalesce(
                     (select a.name
                        from public.ads a
                       where a.id = public.ad_held_for(p_tenant_id, r.platform, r.ad)),
                     (select e.said ->> 'headline'
                        from public.ad_entries e
                       where e.tenant_id = p_tenant_id
                         and e.platform = r.platform
                         and e.platform_ad_id = r.ad
                         and e.said ? 'headline'
                       order by e.created_at desc
                       limit 1)))
    from public.ad_ref_parts(p_ref) r
$$;

comment on function public.ad_named(uuid, text) is
  'The ad a first touch names (contacts.acquired_ref), as a page says it (decision 0049, call 2; 00646, 00651): its platform, and its name. An ad Chanlytics holds (ads, 00648) says its own name, the one its owner gave it at the platform, and an ad made here says it for each version of its words (ad_held_for, 00666); one it does not hold says the headline the newest entry kept for it (ad_entries.said, 00644), or null where none did: an ad Chanlytics cannot name yet. The reference is read by ad_ref_parts. The one place an ad gets its name, so a person''s page, the people report and the Ads page cannot call one ad two things. Names nobody and counts nothing. SECURITY INVOKER: the caller''s RLS decides what is read.';

create or replace function public.ad_people_in(p_tenant_id uuid, p_days integer, p_end date)
returns table (contact_id uuid, first_at timestamptz, ad_id uuid, booked boolean)
language sql
stable
set search_path = public
as $$
  with win as (
    -- The window people_series reads (00646): its days in the workspace's own zone, ending today or the earlier day asked.
    select ((e.day - (e.days - 1))::timestamp) at time zone e.tz as start_at,
           ((e.day + 1)::timestamp) at time zone e.tz as stop_at
      from (select t.timezone as tz,
                   least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  -- Who reached the business in the window, as the people report reads it: their own words, or a call that connected.
  reached as (
    select m.contact_id
      from messages m, win w
     where m.tenant_id = p_tenant_id
       and coalesce(m.meta->>'backfill', 'false') <> 'true'
       and m.created_at >= w.start_at and m.created_at < w.stop_at
       and m.direction = 'inbound' and m.sender = 'customer'
       and m.channel in ('whatsapp', 'sms', 'email')
       and public.message_is_a_persons_words(m.meta)
    union
    select k.contact_id
      from calls k, win w
     where k.tenant_id = p_tenant_id
       and k.started_at >= w.start_at and k.started_at < w.stop_at
       and k.direction = 'inbound'
       and public.call_connected(k.status, k.duration_ms)
  ),
  -- The new ones an ad brought: a first moment in the window, alive, not merged away, first touch an ad.
  came as (
    select c.id as contact_id, f.first_at, c.phone_e164, c.email, r.platform, r.ad
      from public.contact_first_moments(p_tenant_id) f
      join win w on f.first_at >= w.start_at and f.first_at < w.stop_at
      join contacts c on c.id = f.contact_id
     cross join lateral public.ad_ref_parts(c.acquired_ref) r
     where c.tenant_id = p_tenant_id
       and c.erased_at is null
       and c.merged_into_contact_id is null
       and c.acquired_via = 'ad'
       and c.id in (select x.contact_id from reached x)
  )
  select x.contact_id, x.first_at, a.id,
         exists (select 1
                   from appointments v
                  where v.tenant_id = p_tenant_id
                    and v.starts_at > x.first_at
                    and v.status not in ('cancelled', 'proposed')
                    and (v.contact_id = x.contact_id
                         or (v.contact_id is null
                             and ((v.client_phone is not null and v.client_phone = x.phone_e164)
                                  or (v.client_email is not null and lower(v.client_email) = lower(x.email))))))
    from came x
    left join ads a on a.id = public.ad_held_for(p_tenant_id, x.platform, x.ad)
$$;

revoke all on function public.ad_people_in(uuid, integer, date) from public, anon;
grant execute on function public.ad_people_in(uuid, integer, date) to authenticated, service_role;
comment on function public.ad_people_in(uuid, integer, date) is
  'The people an ad brought in a window, a row a person (00651; decision 0049, calls 5 and 6): the same people people_series counts under "An ad" (a first moment in the window, reached the business in it, alive, not merged away, first touch an ad), each with the ad Chanlytics holds for their first touch (ad_held_for, 00666: an ad made here for a tap on any version of its words; null where it holds none) and whether they have booked since: a visit in the record (appointments) that starts after their first touch and is neither cancelled nor only asked for, theirs by the record''s link or, where a visit names no person, by its number or address. Worked out when read, kept nowhere. SECURITY INVOKER: the caller''s RLS decides what is read.';

create or replace function public.ad_bell_causes(p_tenant_id uuid, p_account_id uuid, p_at timestamptz)
returns table (kind text, cause text, ad_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with account as (
    select a.id, coalesce(a.timezone, 'UTC') as zone,
           coalesce(a.standing ->> 'funding' = 'none' or a.standing ->> 'account' = 'unsettled', false) as unpaid
      from public.ad_accounts a
     where a.id = p_account_id and a.tenant_id = p_tenant_id
  ), held as (
    select d.id, d.platform, d.platform_ad_id, d.platform_state, d.intent, d.door, account.zone,
           public.ad_bell_cause('ad_refused', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as own_key,
           public.ad_bell_cause('ad_unpaid', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as card_key,
           public.ad_bell_cause('ad_spent', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as budget_key,
           public.ad_bell_cause('ad_ended', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as set_key,
           (p_at at time zone account.zone)::date as today,
           coalesce(d.budget_kind = 'total'
                    and (case when d.budget_left_minor is null then 0
                              else d.budget_minor - d.budget_left_minor end) >= d.budget_minor, false) as finished,
           coalesce((d.ends_at at time zone account.zone)::date < (p_at at time zone account.zone)::date,
                    false) as past_end,
           coalesce(d.platform_state in ('ARCHIVED', 'DELETED'), false) as removed
      from public.ads d, account
     where d.tenant_id = p_tenant_id and d.account_id = p_account_id and d.status = 'made'
  ), ad as (
    select h.*, (h.finished or h.past_end or h.removed or h.intent = 'ended') as run_over from held h
  )
  -- Meta didn't approve it, and its run is not over.
  select 'ad_refused', a.own_key, a.id
    from ad a
   where a.platform_state = 'DISAPPROVED' and not a.run_over
  union all
  -- Meta couldn't charge the card for it, its run not over. The account's own standing says the same of every ad, so
  -- it is the same cause, kept without an ad: the ring tells of an ad's card only where the account does not.
  select 'ad_unpaid', a.card_key, a.id
    from ad a
   where a.platform_state = 'PENDING_BILLING_INFO' and not a.run_over
  union all
  select 'ad_unpaid', public.ad_bell_cause('ad_unpaid', null, account.id, null, null, null), null::uuid
    from account
   where account.unpaid
  union all
  -- The total it sits under is spent.
  select 'ad_spent', a.budget_key, a.id
    from ad a
   where a.finished and not a.removed
  union all
  -- It was on, and reached its last day with money left: ended by its run, not by its owner or the platform's bin.
  select 'ad_ended', a.set_key, a.id
    from ad a
   where a.past_end and not a.finished and not a.removed and a.intent = 'on'
  union all
  -- It ran every one of the seven days before today in its account's zone, it is still running, a tap on it opens a
  -- chat Chanlytics receives, and nobody wrote from it in those days or today so far.
  select 'ad_quiet', a.own_key, a.id
    from ad a
   where not a.run_over and a.platform_state = 'ACTIVE' and a.door in ('whatsapp', 'instagram')
     and (select count(*) from public.ad_days x
           where x.tenant_id = p_tenant_id and x.ad_id = a.id
             and x.day >= a.today - 7 and x.day < a.today and x.spend_minor > 0) = 7
     and not exists (select 1 from public.ad_entries e
                      where e.tenant_id = p_tenant_id and e.platform = a.platform
                        and (e.platform_ad_id = a.platform_ad_id
                             or e.platform_ad_id in (select o.platform_id from public.ad_objects o
                                                      where o.tenant_id = p_tenant_id and o.ad_id = a.id
                                                        and o.kind = 'ad' and o.platform_id is not null))
                        and e.created_at >= ((a.today - 7)::timestamp at time zone a.zone)
                        and e.created_at < p_at)
$$;

revoke all on function public.ad_bell_causes(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ad_bell_causes(uuid, uuid, timestamptz) to service_role;
comment on function public.ad_bell_causes(uuid, uuid, timestamptz) is
  'Every made ad of one ad account under each of the bell''s five ad causes at a moment, with the cause''s key (00658): ad_refused (the platform''s word DISAPPROVED, its run not over), ad_unpaid (PENDING_BILLING_INFO, its run not over; and the account itself, with no ad, where its standing says the platform can''t charge it), ad_spent (its total spent), ad_ended (on, and past its last day with money left), ad_quiet (running, opening a chat Chanlytics receives, spending on each of the seven days before today in the account''s zone, and nobody wrote from it, or from any version of an ad made here, since the first of them; 00666). A run is over as contracts adStateOf says. Read from the rows as they stand; the read''s door asks it before and after it keeps.';

/* ------------------------------------------- 10. the read keeps where an ad shows, and settles a launch -- */

create or replace function public.ads_read_keep(p_tenant_id uuid, p_account_id uuid, p_read jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.ad_accounts;
  v_outcome text;
  v_adopted integer := 0;
  v_moved   integer := 0;
  v_days    integer := 0;
  v_before  text[];
  v_rang    boolean := false;
begin
  select * into v_account from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id
   for update;
  if not found or v_account.status <> 'connected' then
    return jsonb_build_object('outcome', 'not_connected');
  end if;

  -- What stood for the bell at its last look (00658), measured before anything is written. None before the first look
  -- after a connect. The bell's measure never costs the read.
  if v_account.rung_at is not null and v_account.rung_at >= coalesce(v_account.connected_at, '-infinity'::timestamptz) then
    begin
      v_before := array(select distinct c.kind || ':' || c.cause
                          from public.ad_bell_causes(p_tenant_id, p_account_id, v_account.rung_at) c);
    exception when others then
      raise warning 'ads_read_keep: %', sqlerrm;
      v_before := null;
    end;
  end if;

  -- The account's own part first: its standing and facts, or that the read failed and when to ask again.
  v_outcome := public.ad_account_read_keep(p_tenant_id, p_account_id, coalesce(p_read -> 'account', '{}'::jsonb));

  if v_outcome <> 'failed' then
    -- Each ad the platform listed: made on first sight (adopted, 0049 call 10), written over after. What the owner
    -- asked of an ad found in their account follows what the platform holds, unless a press of theirs here is still
    -- on its way to the platform (an ask newer than the telling): that press wins until it is told.
    with given as (
      select g.* from jsonb_to_recordset(coalesce(p_read -> 'ads', '[]'::jsonb)) as g(
        platform_ad_id text, name text, door text, platform_set_id text, platform_campaign_id text,
        budget_kind text, budget_minor bigint, budget_left_minor bigint, budget_at text, budget_shared boolean,
        starts_at timestamptz, ends_at timestamptz, platform_state text, platform_issue text, intent text, said jsonb,
        shown_on text[]
      )
      where g.platform_ad_id is not null and g.platform_ad_id <> ''
    ), stood as (
      select a.id, a.platform_state from public.ads a
       where a.tenant_id = p_tenant_id and a.platform = v_account.platform
         and a.platform_ad_id in (select g.platform_ad_id from given g)
    ), written as (
      insert into public.ads as a (
        tenant_id, account_id, platform, origin, name, door, platform_ad_id, platform_set_id, platform_campaign_id,
        budget_kind, budget_minor, budget_left_minor, budget_at, budget_shared, starts_at, ends_at,
        status, intent, platform_state, platform_issue, said, shown_on, read_at
      )
      select p_tenant_id, p_account_id, v_account.platform, 'platform',
             coalesce(nullif(left(btrim(coalesce(g.name, '')), 500), ''), g.platform_ad_id),
             coalesce(g.door, 'other'), g.platform_ad_id, g.platform_set_id, g.platform_campaign_id,
             g.budget_kind, g.budget_minor, g.budget_left_minor, g.budget_at, g.budget_shared, g.starts_at, g.ends_at,
             'made', coalesce(g.intent, 'paused'), g.platform_state, nullif(left(coalesce(g.platform_issue, ''), 2000), ''),
             g.said, g.shown_on, now()
        from given g
      on conflict (tenant_id, platform, platform_ad_id) do update
         set name = case when a.origin = 'platform' then excluded.name else a.name end,
             door = case when a.origin = 'platform' then excluded.door else a.door end,
             platform_set_id = excluded.platform_set_id,
             platform_campaign_id = excluded.platform_campaign_id,
             budget_kind = excluded.budget_kind,
             budget_minor = excluded.budget_minor,
             budget_left_minor = excluded.budget_left_minor,
             budget_at = excluded.budget_at,
             budget_shared = excluded.budget_shared,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             intent = case when a.origin = 'platform' and (a.intent_at is null or a.told_at >= a.intent_at)
                           then excluded.intent else a.intent end,
             platform_state = excluded.platform_state,
             platform_issue = excluded.platform_issue,
             said = case when a.origin = 'platform' then excluded.said else a.said end,
             shown_on = coalesce(excluded.shown_on, a.shown_on),
             -- An ad made here whose last switch went unanswered is settled by this read: the platform has said.
             launch = case when a.origin = 'chanlytics' and a.launch ? 'unknown_at' then a.launch - 'unknown_at'
                           else a.launch end,
             read_at = now()
      returning a.id, a.name, a.platform_state, (xmax = 0) as made
    ), told as (
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      select p_tenant_id, 'ad.state_changed', 'ads', 'ad', w.id,
             jsonb_build_object('platform', v_account.platform, 'name', w.name, 'from', s.platform_state,
                                'to', w.platform_state)
        from written w join stood s on s.id = w.id
       where s.platform_state is distinct from w.platform_state
      returning 1
    )
    select (select count(*) from written w where w.made), (select count(*) from told)
      into v_adopted, v_moved;

    -- Each day the platform gave, for an ad this workspace holds: made, or written over until it is settled. A day
    -- of an ad the read did not adopt is left out, never guessed a home.
    with given as (
      select d.* from jsonb_to_recordset(coalesce(p_read -> 'days', '[]'::jsonb)) as d(
        platform_ad_id text, day date, spend_minor bigint, impressions bigint, clicks bigint, platform_results bigint
      )
      where d.platform_ad_id is not null and d.day is not null
    ), written as (
      insert into public.ad_days as x (tenant_id, ad_id, day, spend_minor, impressions, clicks, platform_results, read_at)
      select p_tenant_id, a.id, g.day, greatest(coalesce(g.spend_minor, 0), 0), greatest(coalesce(g.impressions, 0), 0),
             greatest(coalesce(g.clicks, 0), 0), g.platform_results, now()
        from given g
        join public.ads a
          on a.tenant_id = p_tenant_id and a.platform = v_account.platform and a.platform_ad_id = g.platform_ad_id
      on conflict (ad_id, day) do update
         set spend_minor = excluded.spend_minor, impressions = excluded.impressions, clicks = excluded.clicks,
             platform_results = excluded.platform_results, read_at = now()
       where not x.settled
      returning 1
    )
    select count(*) into v_days from written;

    -- The look back has passed these days: the platform's numbers for them have stopped moving.
    if nullif(p_read ->> 'settled_before', '') is not null then
      update public.ad_days x
         set settled = true
        from public.ads a
       where a.id = x.ad_id and a.tenant_id = p_tenant_id and a.account_id = p_account_id
         and x.tenant_id = p_tenant_id and x.day < (p_read ->> 'settled_before')::date and not x.settled;
    end if;

    -- The bell (00658): what turned since its last look rings, and what cleared closes. A ring that fails leaves the
    -- last look where it was, so the next good read rings it; it never costs this read what it learned.
    begin
      perform public.ad_bell_ring(p_tenant_id, p_account_id, v_before);
      v_rang := true;
    exception when others then
      raise warning 'ads_read_keep: %', sqlerrm;
    end;
  end if;

  -- When it is read next, and looked back over next: the edge's pace, never before the platform allows. Whether the
  -- platform's notices are subscribed is kept as the read found it, and when the bell last looked, where it rang.
  update public.ad_accounts a
     set next_read_at = greatest(
           coalesce(nullif(p_read ->> 'next_read_at', '')::timestamptz, now() + interval '1 hour'),
           coalesce(a.read_after, '-infinity'::timestamptz)),
         settle_at = coalesce(nullif(p_read ->> 'settle_at', '')::timestamptz, a.settle_at),
         notices_at = case p_read ->> 'notices' when 'subscribed' then now() when 'dropped' then null else a.notices_at end,
         rung_at = case when v_rang then now() else a.rung_at end
   where a.id = p_account_id;

  return jsonb_build_object('outcome', v_outcome, 'adopted', v_adopted, 'moved', v_moved, 'days', v_days);
end $$;

revoke all on function public.ads_read_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ads_read_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ads_read_keep(uuid, uuid, jsonb) is
  'Service-role only: what one read of a connected ad account learned, kept in one transaction (00650, 00658, decision 0049). account: handed to ad_account_read_keep (its standing and facts, or that the read failed). ads: each made on first sight as an adopted ad (origin platform) or written over by its platform id, with the budget it sits under and where it shows (00666); a read of an ad made here settles a launch whose last switch went unanswered; what the owner asked of an adopted ad follows the platform unless a press of theirs is still on its way; an ad.state_changed event only where the platform''s word moved. days: each made or written over until settled, for ads this workspace holds. settled_before: the account''s days before it are marked settled. Then, for a read that did not fail, the bell: what stood at its last look (ad_bell_causes, measured before anything is written) is handed to ad_bell_ring, and a bell that fails is a warning, never the read''s failure. next_read_at, settle_at and notices are kept on the account, and rung_at where the bell rang. Answers {outcome, adopted, moved, days}; outcome not_connected, and nothing written, for an account that is not connected.';
