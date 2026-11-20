-- 00658 · A draft ad is kept, and one left for the owner rings their bell (the Ads plan's step 4, the parts New ad's
-- first build left out: 6.2, 6.3, G6 and G18; decision 0050, calls 2 and 12).
--
-- New ad held its draft in the tab's own storage, so a draft lived on one device, an operator or a partner could not
-- leave one for the owner, and AI's own turn could not make one. The workspace now keeps its draft, with its words.
--
--   ad_drafts               The workspace's one draft of a new ad: what was chosen (the service by its name, the
--                           picture, the miles, the amount, the end, the words, the answers to Meta's special-kind
--                           question), as New ad last sent it, for the ad account it was drafted for. Read back on any
--                           device. Nothing in it is trusted: every read judges it afresh from the business as it stands
--                           (server/ads/draft.ts), and so will Turn on's press. Members read it; only ad_draft_keep
--                           writes it.
--   ad_draft_keep           A member's door: an owner, an operator, or a partner on a session that showed its second
--                           factor (is_acting_member). They may draft, which touches no platform (0050, call 2). The
--                           draft kept, in place of the one before. Kept with its words by someone who may not turn it
--                           on, it rings the bell of each member who may (the owner), once while their row stays open
--                           (0050's ad_waits_for_owner, kind ad_draft here). Kept by the owner, those rows close: they
--                           have it.
--   notifications.kind      Gains ad_draft.
--   ad_accounts.most_minor  The most the owner said any ad may cost, in the account's own currency (the plan's G6): until
--                           they say one, a draft's amount is never above the largest total turned on.
--   ad_account_most         The owner's door: their most kept for the connected account, or let go with null.
--
-- The bell's line is never the reason a draft is not kept: one that cannot be written is a warning.
--
-- Locks. Widening the CHECK on `notifications` reads the table once under a lock that holds its writers for that read;
-- adding a column to `ad_accounts` takes its lock for a moment. This file waits three seconds for each and no more. Run
-- again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first, then the code. Code ahead of it reads no kept draft and keeps none (a missing table or
-- door is read as none), as before it. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------- 1. the bell's kind -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account', 'footage', 'footage_in', 'ad_draft']));

/* ------------------------------------------------------------------------------------------ 2. the draft row -- */

create table if not exists public.ad_drafts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  -- The ad account it was drafted for: its money is that account's currency. A draft for an account no longer
  -- connected is not offered; the next one kept takes its place.
  account_id  uuid not null,
  -- What New ad chose, as server/ads/draft-shape.ts holds it. Never trusted: judged afresh at every read.
  draft       jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 20000),
  -- Who kept it last: an owner, or someone who left it for one.
  kept_by     uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One draft a workspace (the plan's 4.6): + New, AI's line and AI's own turn all open the same one.
  constraint ad_drafts_one_a_workspace unique (tenant_id),
  constraint ad_drafts_account_id_same_workspace foreign key (tenant_id, account_id)
    references public.ad_accounts (tenant_id, id) on delete cascade
);

-- The key to its account is looked up by both columns (the fence above).
create index if not exists ad_drafts_account on public.ad_drafts (tenant_id, account_id);

drop trigger if exists ad_drafts_set_updated_at on public.ad_drafts;
create trigger ad_drafts_set_updated_at
  before update on public.ad_drafts
  for each row execute function extensions.moddatetime('updated_at');

alter table public.ad_drafts enable row level security;
drop policy if exists ad_drafts_member_select on public.ad_drafts;
create policy ad_drafts_member_select on public.ad_drafts
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A member reads their workspace's draft; ad_draft_keep is how one is written.
revoke all on public.ad_drafts from anon, authenticated;
grant select on public.ad_drafts to authenticated;
grant all on public.ad_drafts to service_role;

comment on table public.ad_drafts is
  'A workspace''s one draft of a new ad (00658; the Ads plan''s 4.6, 6.2 and G18): what New ad chose and the ad writer''s words, for the ad account it was drafted for. Members read it; ad_draft_keep writes it. Never trusted: every read, and Turn on''s press, judges it afresh from the business as it stands.';
comment on column public.ad_drafts.draft is
  'What New ad chose, as server/ads/draft-shape.ts holds it: the service by its name, the picture''s file id, the miles, the amount in minor units, the end day, the words (three versions or none) and the answers to Meta''s special-kind question.';
comment on column public.ad_drafts.kept_by is
  'The member who kept it last (auth.uid() at ad_draft_keep): the owner, or someone who left it for the owner.';

/* ------------------------------------------------------------------------------------ 3. keeping it, the bell -- */

create or replace function public.ad_draft_keep(p_tenant_id uuid, p_account_id uuid, p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_id      uuid;
  v_words   integer;
  v_name    text;
  v_service text;
  v_rung    integer := 0;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Operators and partners may draft (0050, call 2): an acting member, a partner only once their session showed its
  -- second factor. A viewer reads.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or octet_length(p_draft::text) > 20000 then
    raise exception 'A draft is an object of at most 20,000 bytes.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_accounts a where a.id = p_account_id and a.tenant_id = p_tenant_id) then
    return jsonb_build_object('kept', false, 'draft_id', null, 'rung', 0);
  end if;
  insert into public.ad_drafts as d (tenant_id, account_id, draft, kept_by)
  values (p_tenant_id, p_account_id, p_draft, v_actor)
  on conflict (tenant_id) do update
     set account_id = excluded.account_id, draft = excluded.draft, kept_by = excluded.kept_by
  returning d.id into v_id;
  if public.has_permission(v_actor, p_tenant_id, 'ads') then
    -- The owner has it now: what told them it waited is closed.
    update public.notifications n
       set closed_at = now()
     where n.tenant_id = p_tenant_id and n.kind = 'ad_draft' and n.closed_at is null;
    return jsonb_build_object('kept', true, 'draft_id', v_id, 'rung', 0);
  end if;
  v_words := case when jsonb_typeof(p_draft -> 'versions') = 'array' then jsonb_array_length(p_draft -> 'versions')
                  else 0 end;
  -- Left with its words, it waits for whoever may turn it on: one row each, never a second while one is open.
  if v_words > 0 then
    begin
      select nullif(btrim(p.display_name), '') into v_name from public.profiles p where p.user_id = v_actor;
      -- The service as the writer named it in a few words, where it did: a service's own name can run to a sentence.
      v_service := coalesce(nullif(btrim(p_draft ->> 'label'), ''), nullif(btrim(p_draft ->> 'service'), ''));
      if char_length(v_service) > 120 then
        v_service := left(v_service, 119) || '…';
      end if;
      insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id,
                                        recipient_user_id)
      select p_tenant_id, 'ad_draft', coalesce(v_name, 'Someone on your team') || ' left you a draft ad',
             coalesce('For ' || v_service || '. ', '') || 'It runs only once you turn it on.',
             'campaigns/ads:new', 'ad_draft', v_id::text, m.user_id
        from public.memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id <> v_actor
         and public.has_permission(m.user_id, p_tenant_id, 'ads')
         and not exists (
               select 1 from public.notifications n
                where n.tenant_id = p_tenant_id and n.kind = 'ad_draft' and n.recipient_user_id = m.user_id
                  and n.closed_at is null);
      get diagnostics v_rung = row_count;
    exception when others then
      -- The bell's line never costs the draft its keeping.
      raise warning 'ad_draft_keep: %', sqlerrm;
    end;
  end if;
  return jsonb_build_object('kept', true, 'draft_id', v_id, 'rung', v_rung);
end $$;

revoke all on function public.ad_draft_keep(uuid, uuid, jsonb) from public, anon;
grant execute on function public.ad_draft_keep(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.ad_draft_keep(uuid, uuid, jsonb) is
  'A member''s door (00658; decision 0050, call 2): the workspace''s draft of a new ad kept for an ad account of its own, in place of the one before. An acting member alone (is_acting_member: an owner, an operator, a partner whose session showed its second factor). Kept with its words by a member who may not run ads, it rings each owner''s bell (kind ad_draft, opening New ad), once while their row is open; kept by an owner, those rows close. Answers {kept, draft_id, rung}; kept false, and nothing written, for an account not of this workspace.';

/* ----------------------------------------------------------------------------------- 4. the owner's most (G6) -- */

alter table public.ad_accounts add column if not exists most_minor bigint;
alter table public.ad_accounts drop constraint if exists ad_accounts_most_minor_check;
alter table public.ad_accounts add constraint ad_accounts_most_minor_check check (most_minor is null or most_minor > 0);
comment on column public.ad_accounts.most_minor is
  'The most the owner said any ad may cost, in this account''s minor units (00658; the Ads plan''s G6), said once in a sentence to AI. Null until they say one: a draft''s amount is then never above the largest total turned on. Written only by ad_account_most.';

create or replace function public.ad_account_most(p_tenant_id uuid, p_most_minor bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kept integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- What an ad may spend is the owner's alone (0050, call 2).
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'ads'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_most_minor is not null and p_most_minor <= 0 then
    raise exception 'The most an ad may cost is more than nothing.' using errcode = '22023';
  end if;
  update public.ad_accounts a
     set most_minor = p_most_minor
   where a.tenant_id = p_tenant_id and a.platform = 'meta' and a.status = 'connected';
  get diagnostics v_kept = row_count;
  return v_kept > 0;
end $$;

revoke all on function public.ad_account_most(uuid, bigint) from public, anon;
grant execute on function public.ad_account_most(uuid, bigint) to authenticated, service_role;
comment on function public.ad_account_most(uuid, bigint) is
  'The owner''s door (00658; the Ads plan''s G6): the most any ad may cost, in the connected Meta account''s minor units, kept on that account, or let go with null. The owner alone (caller_has_permission ads). True where a connected account took it.';
