-- 00676 · The stop pauses the ads made here, and a yes taken back pauses the ad that shows the person (the content loop
-- PRD v3.1, sections 5.2, 5.3 and 14.1 and its pass 0, with Ruben's call 21 taken on 21 Nov 2026; the Ads plan's G16
-- and its 4.7, points 7 and 8; decision 0050, call 11, for an ad already running).
--
-- Stop everything paused all sending and told the owner how many ads were still on, with one press to pause them all
-- (the Ads plan's G17, approved 18 Nov). Meanwhile an ad kept sending people to a WhatsApp nobody answered, which spent
-- the owner's money for nothing. Call 21 reverses G17: the stop pauses the ads made here in the same act, and turning
-- them back on is never Resume's: it is the owner's own press, which names them. Ads made in Meta's own tools are told
-- of, never paused.
--
--   ads.paused_by, paused_at   Why Chanlytics holds an ad paused, and since when: the stop, a remediation (a yes taken
--                    back), the owner's own Pause, or the owner's one press for them all. Kept by the doors that pause,
--                    and gone the moment the ad is not paused (ads_paused_by_holds), so turning ads back on names only
--                    those the stop paused.
--   ads.way_in, way_in_at   What stands between a running ad made here and AI answering the chat it opens, as the
--                    account's read last worked it out (contracts adWayInOf, the one rule), and since when; null while
--                    AI answers it.
--   remediations, remediation_actions   A cause, and one action for each thing it reached: the act, its outcome, the
--                    place's own words, when Chanlytics started it and when the place confirmed it, kept apart. Ads
--                    alone here; posts join in the content loop's pass 1b.
--   ad_set_intent    Re-made with who pauses (p_by). The stop and a remediation pause only ads made here, at the version
--                    they stand at, whoever pressed. An ad a remediation paused is never turned back on: it runs again
--                    only with another picture (G16).
--   ad_pause_all     Re-made with p_by: the owner's one press (owner_all), as 00671 kept it; the stop, which pauses every
--                    ad made here that is on; and a remediation, which names its ads. The stop and a remediation tell
--                    the owner on the bell (ads_paused).
--   ad_resume_stopped  The owner's one press after a Resume: the ads the stop paused and that stand so, turned back on.
--   ad_launch_cancel The owner cancels an ad while it is set up (4.7, point 8): kept on its launch, which the account's
--                    job reads at its next step and again before every switch, and stops there.
--   ad_launch_keep   Re-made: a launch that stops keeps when; one made all the same after its cancel is paused at once.
--   ad_accounts_stop_launches   Re-made: keeps when a launch stopped.
--   ad_way_in_keep   The account's read keeps each running ad's way in, rings the owner where it closed (in the words
--                    and the money the read hands it), and closes the row once it opened.
--   ads_remediate_files  The walk a yes taken back starts on ads: every ad made here that shows one of the files is
--                    paused, or cancelled while it is set up, each action kept, the owner told.
--   file_yes_take_back  Re-made: a yes for ads taken back walks it, in the same transaction (the seam 00665 marked).
--   ads_settle_remediation   An ad's action is settled once the platform's word says what came of it.
--   ad_bell_causes, ad_bell_ring, ad_bell_words   Re-made with two more causes: a launch that couldn't finish
--                    (ad_unfinished) and one whose last switch went unanswered past a few minutes (ad_unconfirmed). The
--                    ring also closes a way-in row whose ad's run is over.
--   decisions.verb   Gains cancel_ad. notifications.kind gains ad_unfinished, ad_unconfirmed, ad_way_in, ads_paused.
--
-- Locks. Widening the CHECKs on decisions and notifications reads each table once under a lock that holds its writers
-- for that read; adding columns to ads takes its lock for a moment. This file waits three seconds for each and no more.
-- Run again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first, then the code. The code before it calls ad_set_intent and ad_pause_all by name with
-- the arguments they had, which each still takes. Code ahead of it gets PGRST202 from a new door and says the press is
-- not ready here, and the stop keeps what it did before. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------- 1. the verbs and the bell's kinds -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request', 'return_to_sequence', 'not_a_customer', 'reply_anyway', 'connect_ad_account',
  'disconnect_ad_account', 'pause_ad', 'resume_ad', 'turn_on_ad', 'change_ad', 'end_ad', 'cancel_ad'
]));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account', 'footage', 'footage_in',
                           'ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet', 'ad_draft',
                           'ad_unfinished', 'ad_unconfirmed', 'ad_way_in', 'ads_paused']));

/* ----------------------------------------------------------------------------------------- 2. the ad's columns -- */

alter table public.ads add column if not exists paused_by text;
alter table public.ads add column if not exists paused_at timestamptz;
alter table public.ads drop constraint if exists ads_paused_by_check;
alter table public.ads add constraint ads_paused_by_check
  check (paused_by in ('stop', 'remediation', 'owner', 'owner_all'));
alter table public.ads drop constraint if exists ads_paused_by_when;
alter table public.ads add constraint ads_paused_by_when check ((paused_by is null) = (paused_at is null));
alter table public.ads add column if not exists way_in text;
alter table public.ads add column if not exists way_in_at timestamptz;
alter table public.ads drop constraint if exists ads_way_in_check;
alter table public.ads add constraint ads_way_in_check
  check (way_in in ('stopped', 'paused', 'no_number', 'unread', 'blocked'));
alter table public.ads drop constraint if exists ads_way_in_when;
alter table public.ads add constraint ads_way_in_when check ((way_in is null) = (way_in_at is null));

comment on column public.ads.paused_by is
  'Why Chanlytics holds this ad paused (00676; the content loop PRD''s section 5.2): stop (Stop everything paused it), remediation (a yes taken back on its picture: it runs again only with another), owner (its owner''s Pause) or owner_all (the owner''s one press for them all). Null while it is not paused, or where it was paused before 00676 or at the platform. Kept by ad_set_intent; cleared the moment it is not paused (ads_paused_by_holds).';
comment on column public.ads.paused_at is
  'When Chanlytics paused it, for paused_by (00676). Null with paused_by.';
comment on column public.ads.way_in is
  'What stands between a running ad made here and AI answering the WhatsApp chat it opens, as the account''s read last worked it out (00676; decision 0050 call 11; contracts adWayInOf): stopped (AI is stopped), paused (billing paused), no_number (the number it names is not the active one), unread (Meta''s word on the number is not known) or blocked (Meta stops the number sending). Null while AI answers it, or where it is not running. Kept by ad_way_in_keep.';
comment on column public.ads.way_in_at is
  'Since when way_in has stood as it is (00676): the bell rings for unread only once it has stood an hour.';

-- Paused is the only state paused_by speaks of: a turning back on, the platform putting an ad back on after it refused
-- a pause, or a read that finds an adopted ad running, each clears it.
create or replace function public.ads_paused_by_holds()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.intent <> 'paused' then
    new.paused_by := null;
    new.paused_at := null;
  end if;
  return new;
end $$;

revoke all on function public.ads_paused_by_holds() from public, anon, authenticated;
comment on function public.ads_paused_by_holds() is
  'Trigger (00676): an ad that is not paused holds no paused_by: whatever moves its intent off paused clears why it was paused.';

drop trigger if exists ads_paused_by_holds on public.ads;
create trigger ads_paused_by_holds
  before insert or update of intent, paused_by on public.ads
  for each row execute function public.ads_paused_by_holds();

/* --------------------------------------------------------------------------- 3. a cause, and what it started -- */

create table if not exists public.remediations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- What started it (the content loop PRD's 5.3): the seven, one closed set (contracts REMEDIATION_CAUSES).
  cause         text not null check (cause in ('yes_taken_back', 'person_erased', 'owner_removed', 'stop',
                                               'claim_withdrawn', 'connection_lost', 'claim_expired')),
  -- What it is about: a file whose yes was taken back, a person, a post, or the workspace itself.
  subject_type  text not null check (subject_type in ('file', 'person', 'post', 'workspace')),
  subject_id    text not null check (char_length(subject_id) between 1 and 200),
  -- Who started it, where a member did.
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Once no action of it is pending.
  finished_at   timestamptz,
  constraint remediations_id_same_workspace unique (tenant_id, id)
);

create index if not exists remediations_actor_user_id on public.remediations (actor_user_id)
  where actor_user_id is not null;

alter table public.remediations enable row level security;
drop policy if exists remediations_member_select on public.remediations;
create policy remediations_member_select on public.remediations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.remediations from anon, authenticated;
grant select on public.remediations to authenticated;
grant all on public.remediations to service_role;

comment on table public.remediations is
  'A cause and what it started (00676; the content loop PRD''s section 5.3): a yes taken back, a person erased, a take-down the owner asked for, the stop, a claim withdrawn or expired, a connection lost; what it is about, who started it, and when its last action stopped being pending. Kept as the proof a yes was honoured, never what the person wrote. Members read; the doors that start one write it.';

create table if not exists public.remediation_actions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  remediation_id uuid not null,
  -- What it reached: a post up, an ad, a post waiting for its time.
  target_type    text not null check (target_type in ('post', 'ad', 'scheduled_post')),
  target_id      uuid not null,
  act            text not null check (act in ('cancel', 'pause', 'take_down')),
  -- pending until the place says: done, blocked (the place refused), not_possible, needs_person (done by hand there).
  outcome        text not null check (outcome in ('done', 'pending', 'blocked', 'not_possible', 'needs_person')),
  -- The place's own words, where it gave any.
  said           text check (char_length(said) between 1 and 300),
  -- When Chanlytics started it, and when the place confirmed what came of it: two times, kept apart.
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  constraint remediation_actions_one_each unique (tenant_id, remediation_id, target_type, target_id),
  constraint remediation_actions_settled check ((outcome = 'pending') = (finished_at is null)),
  constraint remediation_actions_remediation_same_workspace foreign key (tenant_id, remediation_id)
    references public.remediations (tenant_id, id) on delete cascade
);

-- An ad's pending actions are found by the ad, each time its row moves (ads_settle_remediation).
create index if not exists remediation_actions_pending_by_target
  on public.remediation_actions (tenant_id, target_type, target_id) where outcome = 'pending';

alter table public.remediation_actions enable row level security;
drop policy if exists remediation_actions_member_select on public.remediation_actions;
create policy remediation_actions_member_select on public.remediation_actions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.remediation_actions from anon, authenticated;
grant select on public.remediation_actions to authenticated;
grant all on public.remediation_actions to service_role;

comment on table public.remediation_actions is
  'One action a remediation started on one thing it reached (00676; the content loop PRD''s 5.3 and 8.3): cancel, pause or take down a post, an ad or a waiting post; its outcome, pending until the place says (done, blocked, not_possible, needs_person), with the place''s own words; when Chanlytics started it and when the place confirmed it, kept apart. An ad''s is settled by ads_settle_remediation as its row learns what the platform holds. Members read.';

/* ---------------------------------------------------------------------------------- 4. who pauses, and why -- */

drop function if exists public.ad_set_intent(uuid, uuid, uuid, integer, text);
create or replace function public.ad_set_intent(
  p_tenant_id uuid, p_actor uuid, p_ad_id uuid, p_version integer, p_intent text, p_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad      public.ads;
  v_status  text;
  v_pending boolean;
  v_by      text := coalesce(p_by, 'owner');
  -- The stop and a remediation pause for the workspace, not as a press drawn from a page: at the version the ad is at.
  v_for_all boolean := coalesce(p_by in ('stop', 'remediation'), false);
begin
  if p_intent not in ('on', 'paused') then
    raise exception 'ad_set_intent: intent is on or paused' using errcode = '22023';
  end if;
  if v_by not in ('owner', 'owner_all', 'stop', 'remediation') or (v_for_all and p_intent <> 'paused') then
    raise exception 'ad_set_intent: the owner turns an ad on; the owner, the stop or a remediation pauses one'
      using errcode = '22023';
  end if;
  -- The owner alone pauses an ad or turns one back on (0050, call 2), asked here again whoever knocked. A stop is any
  -- acting member's, since a stop is always free; a remediation is the member's who took back a yes.
  if not coalesce(public.has_permission(p_actor, p_tenant_id,
                                        case v_by when 'stop' then 'autonomy' when 'remediation' then 'settings'
                                                  else 'ads' end), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- One press at a time for an ad: two that arrive together are taken in turn, and the second sees the first.
  select * into v_ad from public.ads a
   where a.id = p_ad_id and a.tenant_id = p_tenant_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- Only what Chanlytics made is paused for the workspace: an ad made in Meta is told of, never paused by itself.
  if v_for_all and v_ad.origin <> 'chanlytics' then
    return jsonb_build_object('outcome', 'not_made', 'version', v_ad.version);
  end if;
  select a.status into v_status from public.ad_accounts a where a.id = v_ad.account_id;
  if v_status is distinct from 'connected' then
    return jsonb_build_object('outcome', 'not_connected');
  end if;
  if v_ad.status <> 'made' or v_ad.platform_ad_id is null then
    return jsonb_build_object('outcome', 'not_made');
  end if;
  v_pending := v_ad.intent_at is not null and (v_ad.told_at is null or v_ad.told_at < v_ad.intent_at);
  -- The same press again: what was asked already stands. Answered once, changed once. A pause a remediation reaches
  -- stands for the remediation from now on, so it is never turned back on with this picture.
  if v_ad.intent = p_intent then
    if v_by = 'remediation' and v_ad.paused_by is distinct from 'remediation' then
      update public.ads a
         set paused_by = 'remediation', paused_at = now(), version = a.version + 1
       where a.id = p_ad_id
      returning * into v_ad;
    end if;
    return jsonb_build_object('outcome', 'same', 'version', v_ad.version, 'pending', v_pending,
                              'account_id', v_ad.account_id, 'platform_ad_id', v_ad.platform_ad_id);
  end if;
  if not v_for_all and v_ad.version is distinct from p_version then
    return jsonb_build_object('outcome', 'stale', 'version', v_ad.version);
  end if;
  -- An ad a remediation paused runs again only with another picture (the Ads plan's G16): never from here.
  if p_intent = 'on' and v_ad.paused_by = 'remediation' then
    return jsonb_build_object('outcome', 'cant_resume', 'version', v_ad.version, 'why', 'picture');
  end if;
  -- Turning back on an ad the platform holds paused is the press that can spend: the rule decides it. Taking back a
  -- pause the platform was never told of spends nothing new, and is always the owner's.
  if p_intent = 'on' and not v_pending
     and not public.ad_may_resume(v_ad.origin, v_ad.platform_state, v_ad.budget_kind, v_ad.ends_at,
                                  v_ad.budget_shared, v_ad.budget_left_minor) then
    return jsonb_build_object('outcome', 'cant_resume', 'version', v_ad.version);
  end if;

  update public.ads a
     set intent = p_intent,
         intent_at = now(),
         -- A press that takes back one the platform was never told of leaves nothing to tell.
         told_at = case when v_pending then now() else a.told_at end,
         paused_by = case when p_intent = 'paused' then v_by end,
         paused_at = case when p_intent = 'paused' then now() end,
         version = a.version + 1
   where a.id = p_ad_id;

  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad', p_ad_id, case p_intent when 'paused' then 'pause_ad' else 'resume_ad' end, 'user', p_actor,
          jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'took_back', v_pending, 'by', v_by,
                             'left_minor', v_ad.budget_left_minor, 'ends_at', v_ad.ends_at));
  if p_intent = 'paused' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.paused', 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'by', p_actor, 'paused_by', v_by));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.resumed', 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'by', p_actor,
                               'left_minor', v_ad.budget_left_minor, 'ends_at', v_ad.ends_at));
  end if;
  return jsonb_build_object('outcome', 'asked', 'version', v_ad.version + 1, 'tell', not v_pending,
                            'account_id', v_ad.account_id, 'platform_ad_id', v_ad.platform_ad_id,
                            'told_at', v_ad.told_at);
end $$;

revoke all on function public.ad_set_intent(uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.ad_set_intent(uuid, uuid, uuid, integer, text, text) to service_role;
comment on function public.ad_set_intent(uuid, uuid, uuid, integer, text, text) is
  'Service-role only: an ad paused or turned back on (00652, 00676; decision 0050 calls 1, 2 and 9, the Ads plan''s C1 and G16). p_by says who: owner (the default: the owner''s press, with the version it was drawn from), owner_all (the owner''s one press for them all), stop (Stop everything, any acting member''s: has_permission autonomy) or remediation (a yes taken back: has_permission settings); the stop and a remediation pause only ads made here, at the version they stand at. Keeps what was asked with when and, for a pause, paused_by and paused_at; bumps the version; writes the decision (pause_ad, resume_ad, with by) and the event (ad.paused with paused_by, ad.resumed) in one transaction. An ad a remediation paused is refused cant_resume with why picture. Answers outcome: asked, with the new version and whether the platform is to be told; same where what was asked already stands (a remediation still marks a standing pause its own); stale; cant_resume; not_allowed; not_connected; not_made (also an ad made at the platform, for the stop or a remediation); not_found.';

/* ------------------------------------------------------------------ 5. a pause for them all, and the way back -- */

-- The bell's row for ads Chanlytics paused for the workspace (the content loop PRD's 12.5, ads_paused): one row for each
-- member who may run ads, but the one who acted, who was answered already, naming the first ad and how many more. It is
-- about money, so its mail is owed from the moment it rings (the account's read sends it, 00664).
create or replace function public.ad_bell_paused(p_tenant_id uuid, p_actor uuid, p_ads uuid[], p_why text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first public.ads;
  v_said  jsonb;
  v_rung  integer;
begin
  if p_why not in ('stop', 'remediation') then
    raise exception 'ad_bell_paused: the stop or a remediation' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_ads), 0) = 0 then
    return 0;
  end if;
  select * into v_first from public.ads a
   where a.tenant_id = p_tenant_id and a.id = any (p_ads)
   order by a.name, a.id
   limit 1;
  if not found then
    return 0;
  end if;
  v_said := public.ad_bell_words('ads_paused_' || p_why, v_first.name, cardinality(p_ads), null, null, null);
  insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id, recipient_user_id,
                                    mail_due_at)
  select p_tenant_id, 'ads_paused', v_said ->> 'title', v_said ->> 'body', 'campaigns/ads:ad:' || v_first.id::text,
         'ad', v_first.id::text, h.user_id, now()
    from public.ad_bell_hearers(p_tenant_id) as h(user_id)
   where h.user_id is distinct from p_actor;
  get diagnostics v_rung = row_count;
  return v_rung;
end $$;

revoke all on function public.ad_bell_paused(uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.ad_bell_paused(uuid, uuid, uuid[], text) to service_role;
comment on function public.ad_bell_paused(uuid, uuid, uuid[], text) is
  'The bell''s ads_paused row (00676; the content loop PRD''s 12.5): the ads Chanlytics paused for the stop or a remediation, told to each member who may run ads but the one who acted, naming the first and how many more, opening that ad, its mail owed at once. Answers how many rows it wrote. Called by ad_pause_all.';

drop function if exists public.ad_pause_all(uuid, uuid, jsonb);
create or replace function public.ad_pause_all(p_tenant_id uuid, p_actor uuid, p_presses jsonb,
                                               p_by text default 'owner_all')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by      text := coalesce(p_by, 'owner_all');
  v_ad      uuid;
  v_version integer;
  v_kept    jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_paused  uuid[] := '{}';
begin
  if v_by not in ('owner_all', 'stop', 'remediation') then
    raise exception 'ad_pause_all: by owner_all, stop or remediation' using errcode = '22023';
  end if;
  -- The owner's press and a remediation name their ads; the stop names none, since it pauses every one made here.
  if v_by <> 'stop'
     and (jsonb_typeof(p_presses) is distinct from 'array' or jsonb_array_length(p_presses) not between 1 and 200) then
    raise exception 'ad_pause_all: between 1 and 200 ads' using errcode = '22023';
  end if;
  -- Asked once here before anything is kept, and by the door for each ad: the owner alone pauses ads with a press
  -- (0050, call 2); a stop is any acting member's; a remediation is the member's who took back a yes.
  if not coalesce(public.has_permission(p_actor, p_tenant_id,
                                        case v_by when 'stop' then 'autonomy' when 'remediation' then 'settings'
                                                  else 'ads' end), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- In the ads' own order, as ids and not as text in any collation: two presses over the same ads lock them in the same
  -- order, so neither waits on the other. An id that is not one refuses the whole set before anything is kept.
  for v_ad, v_version in
    select (p.value ->> 'ad_id')::uuid, (p.value ->> 'version')::integer
      from jsonb_array_elements(case when v_by = 'stop' then '[]'::jsonb else p_presses end) p
    union all
    -- The stop: every ad made here that is on, of every connected account. An ad made in Meta is told of, never paused.
    select a.id, a.version
      from public.ads a
      join public.ad_accounts c on c.id = a.account_id
     where v_by = 'stop' and a.tenant_id = p_tenant_id and a.origin = 'chanlytics' and a.status = 'made'
       and a.intent = 'on' and c.status = 'connected'
    order by 1
  loop
    v_kept := public.ad_set_intent(p_tenant_id, p_actor, v_ad, v_version, 'paused',
                                   case v_by when 'owner_all' then 'owner_all' else v_by end);
    -- A pause Meta is to be told of goes at Meta's pace, by its account's read, as one Meta would not take at once.
    if v_kept ->> 'outcome' = 'asked' and coalesce((v_kept ->> 'tell')::boolean, false) then
      perform public.ad_tell_ask(p_tenant_id, v_ad);
    end if;
    if v_kept ->> 'outcome' = 'asked' then
      v_paused := v_paused || v_ad;
    end if;
    v_out := v_out || jsonb_build_array(v_kept || jsonb_build_object('ad_id', v_ad));
  end loop;
  -- What Chanlytics paused for the workspace is told to the owner, who may not be who pressed the stop.
  if v_by in ('stop', 'remediation') then
    perform public.ad_bell_paused(p_tenant_id, p_actor, v_paused, v_by);
  end if;
  return jsonb_build_object('outcome', 'kept', 'ads', v_out);
end $$;

revoke all on function public.ad_pause_all(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.ad_pause_all(uuid, uuid, jsonb, text) to service_role;
comment on function public.ad_pause_all(uuid, uuid, jsonb, text) is
  'Service-role only: ads paused together, each through ad_set_intent, in one transaction, in the ads'' own order (00671, 00676; the content loop PRD''s 14.1, call 21). p_by: owner_all (the default: the owner''s one press, p_presses naming each {ad_id, version}, 1 to 200), stop (Stop everything: every ad made here that is on, of every connected account, whoever pressed it; p_presses unread) or remediation (the ads p_presses names). Each kept pause the platform is to be told of asks for its account''s read (ad_tell_ask), which tells the platform at its pace; the stop and a remediation tell the owner on the bell (ad_bell_paused). The platform is asked nothing here. Answers outcome kept with ads, what ad_set_intent answered for each with its ad_id; not_allowed, with nothing kept.';

create or replace function public.ad_resume_stopped(p_tenant_id uuid, p_actor uuid, p_presses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_press jsonb;
  v_ad    uuid;
  v_row   public.ads;
  v_kept  jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_gone  record;
begin
  if jsonb_typeof(p_presses) is distinct from 'array' or jsonb_array_length(p_presses) not between 1 and 200 then
    raise exception 'ad_resume_stopped: between 1 and 200 ads' using errcode = '22023';
  end if;
  -- Turning ads back on spends: the owner's alone (0050, call 2), asked here before anything is kept.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- Never while AI is stopped: nobody would answer the people an ad brings.
  if exists (select 1 from public.tenants t where t.id = p_tenant_id and t.sending_stopped_at is not null) then
    return jsonb_build_object('outcome', 'stopped');
  end if;
  for v_press in
    select p.value from jsonb_array_elements(p_presses) p order by (p.value ->> 'ad_id')::uuid
  loop
    v_ad := (v_press ->> 'ad_id')::uuid;
    select * into v_row from public.ads a
     where a.id = v_ad and a.tenant_id = p_tenant_id
     for update;
    -- Only an ad the stop paused, and still so: one the owner paused since, or a remediation did, is theirs to say.
    if not found or v_row.intent <> 'paused' or v_row.paused_by is distinct from 'stop' then
      v_kept := jsonb_build_object('outcome', 'not_stopped', 'version', v_row.version);
    else
      v_kept := public.ad_set_intent(p_tenant_id, p_actor, v_ad, (v_press ->> 'version')::integer, 'on');
      if v_kept ->> 'outcome' = 'asked' and coalesce((v_kept ->> 'tell')::boolean, false) then
        perform public.ad_tell_ask(p_tenant_id, v_ad);
      end if;
    end if;
    v_out := v_out || jsonb_build_array(v_kept || jsonb_build_object('ad_id', v_ad));
  end loop;
  -- A row about an ad that is no longer paused has nothing left to tell: it closes, for everyone.
  for v_gone in
    select distinct n.subject_id
      from public.notifications n
      join public.ads d on d.id::text = n.subject_id
     where n.tenant_id = p_tenant_id and n.kind = 'ads_paused' and n.closed_at is null and n.subject_type = 'ad'
       and d.tenant_id = p_tenant_id and d.intent <> 'paused'
  loop
    perform public.notifications_close_about(p_tenant_id, array['ads_paused'], 'ad', v_gone.subject_id);
  end loop;
  return jsonb_build_object('outcome', 'kept', 'ads', v_out);
end $$;

revoke all on function public.ad_resume_stopped(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_resume_stopped(uuid, uuid, jsonb) to service_role;
comment on function public.ad_resume_stopped(uuid, uuid, jsonb) is
  'Service-role only: the owner turns back on the ads Stop everything paused, after Resume, as a press of its own that names them (00676; the content loop PRD''s 14.1, call 21: Resume never turns an ad on). Each ad ({ad_id, version}, 1 to 200) that the stop paused and that stands so is turned on through ad_set_intent, in the ads'' own order, its account''s read asked to tell the platform at its pace; any other answers not_stopped. An ads_paused row about an ad no longer paused closes. Answers outcome kept with ads; stopped while AI is stopped and not_allowed for anyone but the owner, each with nothing kept.';

/* ---------------------------------------------------------------- 6. a launch cancelled while it is set up -- */

create or replace function public.ad_launch_cancel(p_tenant_id uuid, p_actor uuid, p_ad_id uuid,
                                                   p_by text default 'owner')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad public.ads;
  v_by text := coalesce(p_by, 'owner');
begin
  if v_by not in ('owner', 'remediation') then
    raise exception 'ad_launch_cancel: by the owner or a remediation' using errcode = '22023';
  end if;
  if not coalesce(public.has_permission(p_actor, p_tenant_id, case v_by when 'owner' then 'ads' else 'settings' end),
                  false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  select * into v_ad from public.ads a
   where a.id = p_ad_id and a.tenant_id = p_tenant_id and a.origin = 'chanlytics'
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- Made already: it is the ad now, and its Pause stops it. Stopped already: there is nothing left to cancel.
  if v_ad.status = 'made' then
    return jsonb_build_object('outcome', 'made', 'version', v_ad.version);
  end if;
  if v_ad.status <> 'sending' then
    return jsonb_build_object('outcome', 'stopped', 'version', v_ad.version);
  end if;
  if v_ad.launch ? 'cancel' then
    return jsonb_build_object('outcome', 'same', 'version', v_ad.version);
  end if;
  update public.ads a
     set launch = coalesce(a.launch, '{}'::jsonb)
                  || jsonb_build_object('cancel', jsonb_build_object('at', now(), 'by', v_by)),
         version = a.version + 1
   where a.id = p_ad_id
  returning * into v_ad;
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad', p_ad_id, 'cancel_ad', 'user', p_actor,
          jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'by', v_by));
  -- Its account's job takes it up within a minute: the launch stops at its next step and removes what it made.
  update public.ad_accounts c
     set next_read_at = least(coalesce(c.next_read_at, 'infinity'::timestamptz), now() + interval '1 minute')
   where c.id = v_ad.account_id and c.tenant_id = p_tenant_id;
  return jsonb_build_object('outcome', 'asked', 'version', v_ad.version);
end $$;

revoke all on function public.ad_launch_cancel(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ad_launch_cancel(uuid, uuid, uuid, text) to service_role;
comment on function public.ad_launch_cancel(uuid, uuid, uuid, text) is
  'Service-role only: an ad made here cancelled while it is set up (00676; the Ads plan''s 4.7, point 8), by its owner (has_permission ads) or by a remediation (has_permission settings). Keeps {at, by} as the launch''s cancel, bumps the version, writes the decision cancel_ad and brings its account''s job within a minute; the job stops the launch at its next step and before any switch, and removes what it made, or leaves it named and paused (ad_launch_keep). Nothing is sent to the platform here. Answers outcome: asked; same (asked already); made (too late: it is made, and Pause stops it); stopped (its launch ended already); not_found; not_allowed.';

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

  -- Where it ends, once: a launch made or stopped stays so. Its platform ids and word come with a made one; a stopped
  -- one keeps when it stopped, which the bell reads (00676).
  if v_status is not null and v_ad.status = 'sending' then
    update public.ads a
       set status = v_status,
           platform_campaign_id = coalesce(nullif(p_kept ->> 'campaign_id', ''), a.platform_campaign_id),
           platform_set_id = coalesce(nullif(p_kept ->> 'set_id', ''), a.platform_set_id),
           platform_ad_id = coalesce(nullif(p_kept ->> 'platform_ad_id', ''), a.platform_ad_id),
           platform_state = coalesce(nullif(left(p_kept ->> 'platform_state', 100), ''), a.platform_state),
           launch = coalesce(a.launch, '{}'::jsonb) || coalesce(p_kept -> 'launch', '{}'::jsonb)
                    || case when v_status = 'failed' then jsonb_build_object('stopped_at', now())
                            else '{}'::jsonb end,
           read_at = case when v_status = 'made' then now() else a.read_at end
     where a.id = p_ad_id
    returning * into v_ad;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, case v_status when 'made' then 'ad.made' else 'ad.setup_stopped' end, 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name,
                               'why', v_ad.launch ->> 'stopped', 'said', v_ad.launch ->> 'said',
                               'left', (select count(*) from public.ad_objects o
                                         where o.ad_id = p_ad_id and o.state = 'left')));
    -- Made all the same after it was cancelled (the cancel came after its last switch went): it is paused at once, by
    -- whoever cancelled it, and Meta is told at its pace. Nothing the owner cancelled is left running.
    if v_status = 'made' and v_ad.launch ? 'cancel' then
      update public.ads a
         set intent = 'paused', intent_at = now(),
             paused_by = case when v_ad.launch -> 'cancel' ->> 'by' = 'remediation' then 'remediation' else 'owner' end,
             paused_at = now(), version = a.version + 1
       where a.id = p_ad_id
      returning * into v_ad;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'ad.paused', 'ads', 'ad', p_ad_id,
              jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'paused_by', v_ad.paused_by,
                                 'cancelled', true));
      perform public.ad_tell_ask(p_tenant_id, p_ad_id);
    end if;
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
  'Service-role only: what the launch of an ad made here came to, step by step (00666, 00676; decision 0050, calls 5 and 6). objects: each part as the job saw it (ad_objects: written sent before its make goes, then made with the platform''s id, refused, removed or left); a part made after the launch stopped is kept as left. status: made (with campaign_id, set_id, platform_ad_id and the platform''s word) or failed, once, from sending, with the event ad.made or ad.setup_stopped; a failed one keeps launch.stopped_at; one made after its cancel (ad_launch_cancel) is paused at once by whoever cancelled it, told at the platform''s pace. launch: merged into ads.launch (step, unknown_at, stopped, said). While the launch is still on its way, and once it is made, its account''s next read is brought within a minute. Answers {status, intent, launch}; status not_found for an ad that is not one made here.';

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
                    || jsonb_build_object('stopped', case new.status when 'revoked' then 'signed_out' else 'disconnected' end,
                                          'stopped_at', now())
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
  'Trigger (00666, 00676): an ad account disconnected by its owner or signed out by the platform stops every launch of its ads still on its way. The ad is failed with why (disconnected, signed_out) and when (stopped_at), every part it made is kept as left at the platform (named and paused there), and an ad.setup_stopped event says so. Nothing is sent to the platform after.';

/* ------------------------------------------------------------------------- 7. a running ad's way in, kept -- */

create or replace function public.ad_way_in_keep(p_tenant_id uuid, p_account_id uuid, p_ways jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved  integer;
  v_rung   integer := 0;
  v_closed integer := 0;
  v_gone   record;
begin
  if jsonb_typeof(p_ways) is distinct from 'array' then
    raise exception 'ad_way_in_keep: the ways are an array' using errcode = '22023';
  end if;
  -- Each ad as the read judged it: what stands in the way, or nothing (null) where AI answers it or it does not run.
  -- Since when is kept only where it moved, so an unknown word keeps the moment it was first not known.
  with given as (
    select (w.value ->> 'ad_id')::uuid as ad_id, nullif(w.value ->> 'way_in', '') as way_in
      from jsonb_array_elements(p_ways) w
  ), moved as (
    update public.ads a
       set way_in = g.way_in,
           way_in_at = case when g.way_in is null then null else now() end
      from given g
     where a.id = g.ad_id and a.tenant_id = p_tenant_id and a.account_id = p_account_id
       and a.origin = 'chanlytics' and a.way_in is distinct from g.way_in
    returning a.id
  )
  select count(*) into v_moved from moved;

  -- A row whose way in opened again, or whose ad stopped running, closes for everyone.
  for v_gone in
    select distinct n.subject_id
      from public.notifications n
      join public.ads d on d.id::text = n.subject_id
     where n.tenant_id = p_tenant_id and n.kind = 'ad_way_in' and n.closed_at is null and n.subject_type = 'ad'
       and n.created_at >= now() - interval '30 days'
       and d.tenant_id = p_tenant_id and d.account_id = p_account_id
       and (d.way_in is null or d.intent <> 'on' or d.status <> 'made')
  loop
    v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_way_in'], 'ad', v_gone.subject_id);
  end loop;

  -- A way in that closed rings once, for each member who may run ads, in the words the read handed (they say how much
  -- the ad can still spend, in its account's own money). Meta's word on the number not known rings only once it has
  -- stood an hour, so one read that could not tell wakes nobody. Never a second open row for one ad.
  with said as (
    select (w.value ->> 'ad_id')::uuid as ad_id,
           nullif(left(btrim(coalesce(w.value ->> 'title', '')), 200), '') as title,
           nullif(left(btrim(coalesce(w.value ->> 'body', '')), 600), '') as body
      from jsonb_array_elements(p_ways) w
  ), owed as (
    select d.id, s.title, s.body
      from said s
      join public.ads d on d.id = s.ad_id
     where d.tenant_id = p_tenant_id and d.account_id = p_account_id and d.origin = 'chanlytics'
       and d.status = 'made' and d.intent = 'on' and d.way_in is not null
       and s.title is not null and s.body is not null
       and d.way_in_at <= now() - case when d.way_in = 'unread' then interval '1 hour' else interval '0 seconds' end
  ), rung as (
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id,
                                      recipient_user_id, mail_due_at)
    select p_tenant_id, 'ad_way_in', o.title, o.body, 'campaigns/ads:ad:' || o.id::text, 'ad', o.id::text, h.user_id,
           now()
      from owed o
     cross join public.ad_bell_hearers(p_tenant_id) as h(user_id)
     where not exists (select 1 from public.notifications x
                        where x.tenant_id = p_tenant_id and x.kind = 'ad_way_in' and x.recipient_user_id = h.user_id
                          and x.subject_type = 'ad' and x.subject_id = o.id::text and x.closed_at is null
                          and x.created_at >= now() - interval '30 days')
    returning 1
  )
  select count(*) into v_rung from rung;
  return jsonb_build_object('moved', v_moved, 'rung', v_rung, 'closed', v_closed);
end $$;

revoke all on function public.ad_way_in_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_way_in_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ad_way_in_keep(uuid, uuid, jsonb) is
  'Service-role only: what stands between each running ad made here and AI answering the chat it opens, as one read of its account worked it out (00676; decision 0050 call 11; contracts adWayInOf). p_ways: [{ad_id, way_in (null where AI answers it or it does not run), title, body}]; way_in and way_in_at are kept where they moved. An ad on whose way in is closed rings the bell''s ad_way_in once for each member who may run ads, in the words handed (which say what it can still spend), its mail owed at once; unread rings only once it has stood an hour. A row closes once its way in opened or its ad stopped running. Answers {moved, rung, closed}.';

/* ------------------------------------------------------------------------ 8. a yes taken back, walked on ads -- */

create or replace function public.ads_remediate_files(p_tenant_id uuid, p_actor uuid, p_cause text,
                                                      p_subject_id text, p_files uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rem     uuid;
  v_ad      public.ads;
  v_kept    jsonb;
  v_act     text;
  v_outcome text;
  v_pause   jsonb := '[]'::jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_one     jsonb;
begin
  if p_cause not in ('yes_taken_back', 'person_erased') then
    raise exception 'ads_remediate_files: a yes taken back or a person erased' using errcode = '22023';
  end if;
  -- Every ad made here that shows one of the files and has not ended: running or paused, or still being set up.
  for v_ad in
    select * from public.ads a
     where a.tenant_id = p_tenant_id and a.origin = 'chanlytics' and a.status in ('sending', 'made')
       and a.intent in ('on', 'paused')
       and a.approved ->> 'picture' = any (array(select f::text from unnest(p_files) f))
     order by a.id
  loop
    if v_rem is null then
      insert into public.remediations (tenant_id, cause, subject_type, subject_id, actor_user_id)
      values (p_tenant_id, p_cause, 'file', p_subject_id, p_actor)
      returning id into v_rem;
    end if;
    if v_ad.status = 'sending' then
      -- Still being set up: its launch is cancelled, stops at its next step, and removes what it made.
      v_act := 'cancel';
      v_kept := public.ad_launch_cancel(p_tenant_id, p_actor, v_ad.id, 'remediation');
      v_outcome := case when v_kept ->> 'outcome' in ('asked', 'same') then 'pending' else 'not_possible' end;
    else
      v_act := 'pause';
      v_pause := public.ad_pause_all(p_tenant_id, p_actor,
                                     jsonb_build_array(jsonb_build_object('ad_id', v_ad.id, 'version', v_ad.version)),
                                     'remediation') -> 'ads';
      v_kept := coalesce(v_pause -> 0, '{}'::jsonb);
      v_outcome := case
        -- Paused now: pending until Meta's word says so (a pause Meta was never told the undoing of stands at once).
        when v_kept ->> 'outcome' = 'asked' then
          case when coalesce((v_kept ->> 'tell')::boolean, false) then 'pending' else 'done' end
        -- Paused already: done where Meta was told, else pending with that pause.
        when v_kept ->> 'outcome' = 'same' then
          case when coalesce((v_kept ->> 'pending')::boolean, false) then 'pending' else 'done' end
        -- Its account is not connected: Chanlytics can no longer pause it, and the owner pauses it in Meta.
        when v_kept ->> 'outcome' = 'not_connected' then 'needs_person'
        else 'not_possible'
      end;
    end if;
    insert into public.remediation_actions (tenant_id, remediation_id, target_type, target_id, act, outcome,
                                            finished_at)
    values (p_tenant_id, v_rem, 'ad', v_ad.id, v_act, v_outcome,
            case when v_outcome <> 'pending' then now() end);
    v_one := jsonb_build_object('ad_id', v_ad.id, 'name', v_ad.name, 'act', v_act, 'outcome', v_outcome);
    v_out := v_out || jsonb_build_array(v_one);
  end loop;
  if v_rem is not null
     and not exists (select 1 from public.remediation_actions r where r.remediation_id = v_rem and r.outcome = 'pending')
  then
    update public.remediations m set finished_at = now() where m.id = v_rem;
  end if;
  return v_out;
end $$;

revoke all on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) to service_role;
comment on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) is
  'The walk a yes taken back starts on ads (00676; the Ads plan''s G16, the content loop PRD''s 5.3): every ad made here that shows one of p_files (ads.approved picture) and has not ended is paused for the remediation (ad_pause_all by remediation, which tells the owner on the bell), or, still being set up, its launch cancelled (ad_launch_cancel by remediation). One remediation of p_cause about the file p_subject_id, one action an ad: pending until the platform''s word settles it (ads_settle_remediation), done where nothing is left to tell, needs_person where its account is not connected. Answers [{ad_id, name, act, outcome}]. Called by file_yes_take_back.';

create or replace function public.file_yes_take_back(p_tenant_id uuid, p_file_id uuid, p_uses text[] default null,
                                                     p_held text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_uses  text[] := public.file_yes_uses(p_uses, true);
  v_files uuid[];
  v_back  integer;
  v_held  jsonb := '[]'::jsonb;
  v_live  jsonb := '[]'::jsonb;
  v_ads   jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if not (v_uses <@ array['post', 'ad', 'reply', 'cold_email']) then
    raise exception 'A yes is for posts, ads, replies or cold emails.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  if not exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id and f.removed_at is null)
  then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  -- The file, and every piece drawn from it: a post's photo, a video's clips and photos (files.made names each).
  select array_agg(f.id order by f.id) into v_files
    from public.files f
   where f.tenant_id = p_tenant_id and f.removed_at is null
     and (f.id = p_file_id or (f.source = 'made' and p_file_id::text = any (public.file_drawn_from(f.made))));
  update public.file_consents c
     set taken_back_at = now(), taken_back_by = v_actor
   where c.tenant_id = p_tenant_id and c.file_id = any (v_files) and c.use = any (v_uses) and c.taken_back_at is null;
  get diagnostics v_back = row_count;
  perform public.file_yes_restate(p_tenant_id, v_files);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.changed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_file_id, 'by', v_actor,
                             'said', jsonb_build_object('taken_back', to_jsonb(v_uses))));
  if 'post' = any (v_uses) then
    -- 1. Every post of them still waiting is held, in this same transaction (the PRD's section 8).
    with held as (
      update public.posts p
         set status = 'held', updated_at = now(),
             held_reason = left(coalesce(nullif(btrim(p_held), ''), 'Someone in it took back their yes.'), 300)
       where p.tenant_id = p_tenant_id and p.file_id = any (v_files)
         and p.status = any (array['queued', 'preparing'])
      returning p.id, p.file_id, p.place, p.kind, p.scheduled_for
    )
    select coalesce(jsonb_agg(jsonb_build_object('post_id', h.id, 'file_id', h.file_id, 'place', h.place,
                                                 'kind', h.kind, 'at', h.scheduled_for)
                              order by h.scheduled_for, h.id), '[]'::jsonb)
      into v_held
      from held h;
    -- 2. Every one already up, or past holding on its way, is answered: the owner takes each down where it is.
    select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'file_id', p.file_id, 'place', p.place,
                                                 'kind', p.kind, 'status', p.status, 'permalink', p.permalink,
                                                 'at', coalesce(p.published_at, p.scheduled_for))
                              order by coalesce(p.published_at, p.scheduled_for) desc, p.id), '[]'::jsonb)
      into v_live
      from public.posts p
     where p.tenant_id = p_tenant_id and p.file_id = any (v_files)
       and p.status = any (array['publishing', 'checking', 'published']);
  end if;
  -- 3. G16 (the Ads plan): every ad made here that shows one of them is paused, in this same transaction, or cancelled
  -- while it is set up, as a remediation, and the owner is told (00676). It runs again only with another picture.
  if 'ad' = any (v_uses) then
    v_ads := public.ads_remediate_files(p_tenant_id, v_actor, 'yes_taken_back', p_file_id::text, v_files);
  end if;
  return jsonb_build_object('taken_back', v_back, 'uses', to_jsonb(v_uses), 'files', to_jsonb(v_files),
                            'held', v_held, 'live', v_live, 'ads', v_ads);
end $$;
revoke all on function public.file_yes_take_back(uuid, uuid, text[], text) from public, anon;
grant execute on function public.file_yes_take_back(uuid, uuid, text[], text) to authenticated, service_role;
comment on function public.file_yes_take_back(uuid, uuid, text[], text) is
  'A member''s door, with the settings permission (00665, 00676; the content PRD''s section 8): the yes for each use named (every use where none is) taken back on a file and on every piece drawn from it, every post of them still waiting held with p_held''s words, and, for ads, every ad made here that shows one of them paused or cancelled as a remediation (ads_remediate_files, the Ads plan''s G16), in one transaction. Answers {taken_back, uses, files, held, live (posts up or on their way), ads ([{ad_id, name, act, outcome}])}.';

create or replace function public.ads_settle_remediation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settled integer;
begin
  -- An ad's action stays pending until the platform's word says what came of it (the content loop PRD's 8.3): a pause
  -- is done once the platform holds the ad paused, or removed; a cancel once its launch stopped, or the ad it made all
  -- the same is held paused. A pause the platform refused put the ad back on: blocked, in the platform's words.
  update public.remediation_actions r
     set outcome = case when new.status = 'made' and new.intent = 'on' and r.act = 'pause' then 'blocked' else 'done' end,
         said = case when new.status = 'made' and new.intent = 'on' and r.act = 'pause'
                     then nullif(left(btrim(coalesce(new.platform_issue, '')), 300), '') else r.said end,
         finished_at = now()
   where r.tenant_id = new.tenant_id and r.target_type = 'ad' and r.target_id = new.id and r.outcome = 'pending'
     and (   (r.act = 'pause' and new.status = 'made' and new.intent = 'on')
          or (r.act = 'cancel' and new.status = 'failed')
          or (new.status = 'made' and new.intent = 'paused'
              and upper(coalesce(new.platform_state, '')) in ('PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'ARCHIVED',
                                                              'DELETED')));
  get diagnostics v_settled = row_count;
  -- A remediation is finished once none of its actions is pending.
  if v_settled > 0 then
    update public.remediations m
       set finished_at = now()
     where m.tenant_id = new.tenant_id and m.finished_at is null
       and m.id in (select r.remediation_id from public.remediation_actions r
                     where r.tenant_id = new.tenant_id and r.target_type = 'ad' and r.target_id = new.id)
       and not exists (select 1 from public.remediation_actions x
                        where x.remediation_id = m.id and x.outcome = 'pending');
  end if;
  return new;
end $$;

revoke all on function public.ads_settle_remediation() from public, anon, authenticated;
comment on function public.ads_settle_remediation() is
  'Trigger (00676; the content loop PRD''s 8.3): an ad''s pending remediation actions settled as its row learns what the platform holds. A pause is done once the platform''s word says paused or removed, or blocked (with the platform''s words) where the platform put it back on; a cancel is done once its launch stopped, or the ad it made is held paused. A remediation is finished once none of its actions is pending. The time Chanlytics started each and the time it was settled are kept apart.';

drop trigger if exists ads_settle_remediation on public.ads;
create trigger ads_settle_remediation
  after update of intent, status, platform_state, told_at on public.ads
  for each row when (
    old.intent is distinct from new.intent or old.status is distinct from new.status
    or old.platform_state is distinct from new.platform_state or old.told_at is distinct from new.told_at)
  execute function public.ads_settle_remediation();

/* -------------------------------------------------------------------- 9. the bell: a launch that didn't finish -- */

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
    select d.id, d.platform, d.platform_ad_id, d.platform_state, d.intent, d.door, d.origin, d.launch, account.zone,
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
  union all
  -- An ad made here whose last switch went unanswered, and no read has said since, past the few minutes the page
  -- follows it before it says "Couldn't confirm it's on" (contracts live.ts UNCONFIRMED_AFTER_MS).
  select 'ad_unconfirmed', a.own_key, a.id
    from ad a
   where a.origin = 'chanlytics' and not a.run_over
     and (a.launch ->> 'unknown_at')::timestamptz <= p_at - interval '5 minutes'
  union all
  -- A launch that stopped part way, in its last 30 days, but where its owner cancelled it: they know (00676).
  select 'ad_unfinished', d.id::text, d.id
    from public.ads d
   where d.tenant_id = p_tenant_id and d.account_id = p_account_id and d.origin = 'chanlytics' and d.status = 'failed'
     and coalesce(d.launch -> 'cancel' ->> 'by', '') <> 'owner'
     and (d.launch ->> 'stopped_at')::timestamptz <= p_at
     and (d.launch ->> 'stopped_at')::timestamptz > p_at - interval '30 days'
$$;

revoke all on function public.ad_bell_causes(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ad_bell_causes(uuid, uuid, timestamptz) to service_role;
comment on function public.ad_bell_causes(uuid, uuid, timestamptz) is
  'Every ad of one ad account under each of the bell''s ad causes at a moment, with the cause''s key (00658, 00666, 00676): ad_refused (the platform''s word DISAPPROVED, its run not over), ad_unpaid (PENDING_BILLING_INFO, its run not over; and the account itself, with no ad, where its standing says the platform can''t charge it), ad_spent (its total spent), ad_ended (on, and past its last day with money left), ad_quiet (running, opening a chat Chanlytics receives, spending on each of the seven days before today in the account''s zone, and nobody wrote from it, or from any version of an ad made here, since the first of them), ad_unconfirmed (an ad made here whose last switch went unanswered five minutes or more before the moment), ad_unfinished (a launch here that stopped part way at or before the moment, in the 30 days before it, not cancelled by its owner). A run is over as contracts adStateOf says. Read from the rows as they stand; the read''s door asks it before and after it keeps.';

create or replace function public.ad_bell_words(p_kind text, p_name text, p_many integer, p_said text,
                                                p_ends_at timestamptz, p_zone text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with n as (
    select '“' || case when char_length(p_name) > 80 then left(p_name, 79) || '…' else p_name end || '”'
             || case when p_many > 1 then ' and ' || (p_many - 1)::text || ' more' else '' end as named,
           p_many > 1 as several,
           nullif(left(btrim(coalesce(p_said, '')), 300), '') as said,
           to_char(p_ends_at at time zone coalesce(p_zone, 'UTC'), 'Dy FMDD Mon') as last_day
  )
  select case p_kind
           when 'ad_refused' then jsonb_build_object(
             'title', n.named || ' not approved by Meta',
             'body', coalesce('Meta said: “' || n.said || '” ', 'Meta didn''t say why. ')
                     || 'Fix it in Meta, and Meta checks it again.')
           when 'ad_unpaid' then jsonb_build_object(
             'title', n.named || ' can''t run',
             'body', 'Meta couldn''t charge your card. Fix the payment method in Meta.')
           when 'ad_ended' then jsonb_build_object(
             'title', n.named || ' ended',
             'body', case when n.several then 'They ran until ' || n.last_day || ', and Meta stopped showing them.'
                          else 'It ran until ' || n.last_day || ', and Meta stopped showing it.' end)
           when 'ad_spent' then jsonb_build_object(
             'title', n.named || case when n.several then ' spent their total' else ' spent its total' end,
             'body', case when n.several then 'Meta stopped showing them. Raise the total in Meta to run them longer.'
                          else 'Meta stopped showing it. Raise the total in Meta to run it longer.' end)
           when 'ad_quiet' then jsonb_build_object(
             'title', n.named || ' brought no one in 7 days',
             'body', 'It ran all 7 days, and Meta charges while it runs. Pause it, or change it in Meta.')
           when 'ad_unconfirmed' then jsonb_build_object(
             'title', n.named || ': couldn''t confirm it''s on',
             'body', 'Meta didn''t answer when Chanlytics turned it on, so it may be on or still paused. Open it and press Check.')
           when 'ad_unfinished' then jsonb_build_object(
             'title', n.named || ' couldn''t finish',
             'body', 'Chanlytics stopped setting it up before it ran, so nothing was spent. Open it to see why.')
           when 'ads_paused_stop' then jsonb_build_object(
             'title', n.named || case when n.several then ' paused' else ' paused' end,
             'body', case when n.several
                          then 'AI was stopped, so Chanlytics paused them: nobody would answer the people they bring. Turn them back on from Ads once AI runs again.'
                          else 'AI was stopped, so Chanlytics paused it: nobody would answer the people it brings. Turn it back on from Ads once AI runs again.' end)
           when 'ads_paused_remediation' then jsonb_build_object(
             'title', n.named || ' paused',
             'body', case when n.several
                          then 'Someone in their picture took back their yes for ads, so Chanlytics paused them. They run again only with another picture.'
                          else 'Someone in its picture took back their yes for ads, so Chanlytics paused it. It runs again only with another picture.' end)
         end
    from n
$$;

revoke all on function public.ad_bell_words(text, text, integer, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.ad_bell_words(text, text, integer, text, timestamptz, text) to service_role;
comment on function public.ad_bell_words(text, text, integer, text, timestamptz, text) is
  'The title and body of one of the bell''s ad notices (00658, 00676): which ad, quoted and cut to fit, with how many more a cause holds; what happened, Meta''s own words in quotes where it refused one; and the one thing to do. ads_paused_stop and ads_paused_remediation word the ads_paused row (ad_bell_paused). ad_way_in''s words are the read''s (ad_way_in_keep), since they say an amount in the account''s own money.';

create or replace function public.ad_bell_ring(p_tenant_id uuid, p_account_id uuid, p_before text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_zone   text;
  v_now    text[];
  v_rung   integer := 0;
  v_closed integer := 0;
  v_n      integer;
  v_gone   record;
begin
  select coalesce(a.timezone, 'UTC') into v_zone
    from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object('rung', 0, 'closed', 0);
  end if;
  v_now := array(select distinct c.kind || ':' || c.cause
                   from public.ad_bell_causes(p_tenant_id, p_account_id, now()) c);

  -- A row whose cause no longer stands closes, for everyone: the ad fixed, paid for, turned back on, written from,
  -- paused, or its total raised; a switch confirmed. Through the one door that closes rows (00421).
  for v_gone in
    select distinct n.kind, n.subject_id
      from public.notifications n
      join public.ads d on d.id::text = n.subject_id
     where n.tenant_id = p_tenant_id
       and n.kind = any (array['ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet', 'ad_unconfirmed',
                               'ad_unfinished'])
       and n.closed_at is null
       and n.created_at >= now() - interval '30 days'
       and n.subject_type = 'ad'
       and d.tenant_id = p_tenant_id and d.account_id = p_account_id
       and not (n.kind || ':' || public.ad_bell_cause(n.kind, d.id, d.account_id, d.budget_at, d.platform_set_id,
                                                      d.platform_campaign_id) = any (v_now))
  loop
    v_closed := v_closed + public.notifications_close_about(p_tenant_id, array[v_gone.kind], 'ad', v_gone.subject_id);
  end loop;
  -- The account's own rows (00653) close with their cause too: a card Meta can charge again, and an account read
  -- again, which is one Meta signed back in.
  if not ('ad_unpaid:' || p_account_id::text = any (v_now)) then
    v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_account'], 'ad_account',
                                                            p_account_id::text, 'Meta can''t charge your ad account');
  end if;
  v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_account'], 'ad_account',
                                                          p_account_id::text,
                                                          'Meta signed Chanlytics out of your ad account');

  -- What turned since the last look rings, once. Nothing rings on the first look after a connect.
  if p_before is not null then
    with now_causes as (
      select c.kind, c.cause, c.ad_id from public.ad_bell_causes(p_tenant_id, p_account_id, now()) c
    ), fresh as (
      select c.kind, c.cause
        from now_causes c
        left join public.ads d on d.id = c.ad_id
       where not (c.kind || ':' || c.cause = any (p_before))
       group by c.kind, c.cause
      -- A card the account's own standing tells of is the account's row (00653), never an ad's as well.
      having bool_and(c.ad_id is not null)
         -- An ad first seen by this read rings only for Meta's check of it: a run that ended, spent or went quiet
         -- before Chanlytics held it is not news.
         and (c.kind in ('ad_refused', 'ad_unpaid') or bool_or(d.created_at < now()))
    ), named as (
      select distinct on (c.kind, c.cause)
             c.kind, c.cause, d.id, d.name, d.platform_issue, d.ends_at,
             count(*) over (partition by c.kind, c.cause) as many
        from now_causes c
        join fresh f on f.kind = c.kind and f.cause = c.cause
        join public.ads d on d.id = c.ad_id
       order by c.kind, c.cause, d.name, d.id
    ), worded as (
      select w.kind, w.cause, w.id,
             public.ad_bell_words(w.kind, w.name, w.many::integer, w.platform_issue, w.ends_at, v_zone) as said
        from named w
    ), rung as (
      -- The two that stop an ad owe their mail from the moment they ring (00664): the account's read sends it, once.
      insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id,
                                        recipient_user_id, mail_due_at)
      select p_tenant_id, w.kind, w.said ->> 'title', w.said ->> 'body', 'campaigns/ads:ad:' || w.id::text, 'ad',
             w.id::text, h.user_id,
             case when w.kind in ('ad_refused', 'ad_unpaid') then now() end
        from worded w
       cross join public.ad_bell_hearers(p_tenant_id) as h(user_id)
       -- Never a second open row for one cause.
       where not exists (
               select 1
                 from public.notifications o
                 join public.ads od on od.id::text = o.subject_id
                where o.tenant_id = p_tenant_id and o.kind = w.kind and o.recipient_user_id = h.user_id
                  and o.closed_at is null and o.subject_type = 'ad'
                  and o.created_at >= now() - interval '30 days'
                  and od.tenant_id = p_tenant_id
                  and public.ad_bell_cause(o.kind, od.id, od.account_id, od.budget_at, od.platform_set_id,
                                           od.platform_campaign_id) = w.cause)
      returning 1
    )
    select count(*) into v_n from rung;
    v_rung := v_n;
  end if;

  return jsonb_build_object('rung', v_rung, 'closed', v_closed);
end $$;

revoke all on function public.ad_bell_ring(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.ad_bell_ring(uuid, uuid, text[]) to service_role;
comment on function public.ad_bell_ring(uuid, uuid, text[]) is
  'The bell''s ad notices for one ad account, after a good read (00658, 00664, 00676; decision 0050 call 15): each cause that stands now (ad_bell_causes) and was not among p_before rings once, a row for each member who may run ads (ad_bell_hearers), naming its first ad and how many more and opening that ad; each open row whose cause no longer stands closes for everyone (ad_unconfirmed once a read settles the switch, ad_unfinished after 30 days); the account''s own payment row closes once its card cause has, and its signed-out row once it is read again. p_before null is the first look after a connect: nothing rings. An ad first seen by this read rings only ad_refused and ad_unpaid; a card the account''s standing tells of is the account''s own row. The rows of ad_refused and ad_unpaid are written owing their mail (mail_due_at, 00664), which the account''s read sends once. Closes through notifications_close_about. Answers {rung, closed}. Service role; called by ads_read_keep, which stamps ad_accounts.rung_at once it has rung.';

/* ------------------------------------------------------------------ 10. the page hears why an ad is paused -- */

-- An ad's update is told when what its row draws moved: now why it is paused, and its way in, too.
create or replace trigger workspace_tell_update
  after update of name, intent, status, platform_state, platform_issue, budget_kind, budget_minor, budget_left_minor,
                  budget_shared, ends_at, intent_at, told_at, launch, shown_on, change, paused_by, way_in
  on public.ads
  for each row when (
    old.name is distinct from new.name or old.intent is distinct from new.intent
    or old.status is distinct from new.status or old.platform_state is distinct from new.platform_state
    or old.platform_issue is distinct from new.platform_issue or old.budget_kind is distinct from new.budget_kind
    or old.budget_minor is distinct from new.budget_minor
    or old.budget_left_minor is distinct from new.budget_left_minor
    or old.budget_shared is distinct from new.budget_shared or old.ends_at is distinct from new.ends_at
    or old.intent_at is distinct from new.intent_at or old.told_at is distinct from new.told_at
    or old.launch is distinct from new.launch or old.shown_on is distinct from new.shown_on
    or old.change is distinct from new.change or old.paused_by is distinct from new.paused_by
    or old.way_in is distinct from new.way_in)
  execute function public.workspace_tell_row_change();
