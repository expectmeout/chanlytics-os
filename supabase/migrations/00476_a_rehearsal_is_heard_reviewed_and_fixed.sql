-- 00476 · A rehearsal is heard, reviewed and fixed (decision 0069, the onboarding rewiring's lanes 1 and 2).
--
-- An owner talks to the receptionist in the browser before any number is bought, sees how it did against what it was
-- told, and fixes what it got wrong where it went wrong. A real call is reviewed the same way.
--
--   voice_agents           The workspace's receptionist at Retell: the agent and the LLM under it, made the first time
--                          one is needed (a rehearsal, or a number's purchase), so the number answers in the agent the
--                          owner already heard. One row a workspace. The service role alone reads and writes it: the
--                          voice row (tenant_channels) still means a line that answers, and routes the calls.
--   rehearsals             One conversation rehearsed or one real call reviewed: its kind, the provider's call id for a
--                          spoken one (what its webhooks and its tools are matched by), the agent and the settings
--                          version it ran on with the instructions it heard, its transcript, its seconds and its end,
--                          the review and the fixes kept. Members read their workspace's; the doors write. The page
--                          reads a spoken one again every two seconds while its call runs: a call is three minutes at
--                          most, and no other page hears it, so it is no table the workspace is told about.
--   calls.config_version   The settings version a call was composed from, as the inbound webhook answered it. Null for
--                          the calls before this, and for a call whose start the plan could not read.
--   calls (tenant_id, id)  Unique, so a review names its call with the call's workspace (00279's rule).
--   ai_usage_purpose_check contracts MODEL_PURPOSES, with the review and the fix router: 00470's set (Ask's journal)
--                          and the two, so the restatement drops nothing.
--
-- Either deploy order works: an edge that never makes a rehearsal writes no row, a dashboard that never asks reads none,
-- and a call with no version is the calls before this. Re-runnable throughout.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------- 1. the agent before the number -- */

create table if not exists public.voice_agents (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  -- Retell's ids. An agent is minted per workspace and never recycled.
  agent_id   text not null unique check (agent_id ~ '^agent_[A-Za-z0-9]+$'),
  llm_id     text check (llm_id is null or llm_id ~ '^llm_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now()
);
comment on table public.voice_agents is
  'The workspace''s receptionist at Retell (decision 0069): the agent and its LLM, made the first time one is needed (a rehearsal in the browser, or a number''s purchase), so a number bought later answers in the agent the owner already heard. The voice row in tenant_channels is still what routes a call and what says a line answers. The service role alone.';

alter table public.voice_agents enable row level security;
revoke all on public.voice_agents from anon, authenticated;
grant select, insert, update, delete on public.voice_agents to service_role;

/* -------------------------------------------------------------------------------- 2. the rehearsal -- */

-- A reviewed call is named with its workspace (00279): a key names the call's (tenant_id, id), so a review can never
-- point at another workspace's call. The call's pair is unique already by its id; this says so, as 00279's parents do.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calls_tenant_id_id_key' and conrelid = 'public.calls'::regclass
  ) then
    alter table public.calls add constraint calls_tenant_id_id_key unique (tenant_id, id);
  end if;
end
$$;

create table if not exists public.rehearsals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  -- call: spoken in the browser; typed: the typed try, kept when it is reviewed; call_review: a real call reviewed.
  kind           text not null check (kind in ('call', 'typed', 'call_review')),
  -- A spoken rehearsal's call at Retell: its webhooks and its tools find the rehearsal, and its workspace, by it.
  retell_call_id text unique,
  -- A real call reviewed (calls.id), named with its workspace (the key below). An erasure deletes the person's calls
  -- (erase_contact), and their review with them.
  call_id        uuid,
  agent_id       text,
  -- The settings version it ran on (tenant_config_versions), and the instructions it heard, as composed for it.
  config_version integer check (config_version is null or config_version >= 1),
  instructions   text,
  -- [{ role: 'agent' | 'user', content }], in order: written as a spoken one goes, and whole at its end.
  transcript     jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  started_at     timestamptz,
  ended_at       timestamptz,
  -- The provider's seconds for a spoken one: what the free minutes count.
  seconds        integer check (seconds is null or seconds >= 0),
  end_reason     text check (end_reason is null or char_length(end_reason) <= 64),
  review         jsonb check (review is null or jsonb_typeof(review) = 'object'),
  reviewed_at    timestamptz,
  -- Each change kept from it: [{ op, field, said, version, at }].
  fixes          jsonb not null default '[]'::jsonb check (jsonb_typeof(fixes) = 'array'),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rehearsals_kind_names_its_source check (
    (kind = 'call' and retell_call_id is not null and call_id is null)
    or (kind = 'typed' and retell_call_id is null and call_id is null)
    or (kind = 'call_review' and retell_call_id is null and call_id is not null)
  ),
  constraint rehearsals_reviewed check ((review is null) = (reviewed_at is null)),
  constraint rehearsals_call_id_same_workspace foreign key (tenant_id, call_id)
    references public.calls (tenant_id, id) on delete cascade
);
comment on table public.rehearsals is
  'A conversation the owner rehearsed (spoken in the browser, or typed) or a real call reviewed (decision 0069): what it ran on, what was said, how long, how it did, and what was fixed from it. Members read their workspace''s; the doors write. A spoken one''s seconds are the free minutes counted.';

-- The free minutes: a workspace's spoken rehearsals of a window. A reviewed call by its call.
create index if not exists rehearsals_tenant_kind_created on public.rehearsals (tenant_id, kind, created_at desc);
create index if not exists rehearsals_call on public.rehearsals (tenant_id, call_id) where call_id is not null;

drop trigger if exists rehearsals_set_updated_at on public.rehearsals;
create trigger rehearsals_set_updated_at
  before update on public.rehearsals
  for each row execute function extensions.moddatetime('updated_at');

alter table public.rehearsals enable row level security;
drop policy if exists rehearsals_member_select on public.rehearsals;
create policy rehearsals_member_select on public.rehearsals for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.rehearsals from anon, authenticated;
grant select on public.rehearsals to authenticated;
grant select, insert, update, delete on public.rehearsals to service_role;

/* ------------------------------------------------------------------- 3. what a call was composed from -- */

alter table public.calls add column if not exists config_version integer;
alter table public.calls drop constraint if exists calls_config_version_check;
alter table public.calls add constraint calls_config_version_check
  check (config_version is null or config_version >= 1);
comment on column public.calls.config_version is
  'The settings version the call was composed from (tenant_config_versions), as the inbound webhook answered it in the call''s metadata (decision 0069): what a review judges the call against. Null for calls before 00476, and for one whose start could not be planned.';

/* --------------------------------------------------------------------------------- 4. the purposes -- */

-- contracts MODEL_PURPOSES: 00470's set, Ask's journal last, with the review of a rehearsal and the fix router.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route'));
