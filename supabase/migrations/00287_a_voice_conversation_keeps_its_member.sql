-- 00287 · A voice conversation keeps its member.
--
-- Ask spoken (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1, §3.3, §6): the brain door the voice agent
-- calls has no cookie, and must still run Ask's turn as the signed-in member under RLS. So the route that starts a
-- voice conversation keeps one row per conversation: whose it is, which thread it lands in, the member's access token
-- sealed with a key the database never holds (AES-256-GCM under the dashboard's ASK_VOICE_SECRET), when that token
-- expires (an hour at most), the page the person was on, the language, and the two columns the brain door claims a
-- turn with, so the vendor's retries run one turn once.
--
--   ask_voice_sessions          one row per voice conversation. The member's own under RLS (their rows, in a
--                               workspace they belong to, as ask_threads); the brain door reads a row by its id on
--                               the service role, which also claims the turn and ends the row. Nothing else reads it.
--   id                          the sha256 hex of a 32-byte random value the browser holds for the conversation and
--                               hands the vendor as the extra body; the plain value is never stored.
--   token_cipher                the access token, sealed; useless without the dashboard's key.
--   token_expires_at            the token's own exp: a row past it opens nothing.
--   conversation_id             the vendor's conversation id, written at the mint; the post-call webhook names it.
--   turn_key / turn_started_at  the claim: the sha256 of the last user message and when its turn began. A claim
--                               stands for the turn's budget (45 s); a request with the same key meanwhile follows
--                               the thread instead of running the turn again.
--   duration_s, ended_at        what the end of the conversation writes (the browser's end, or the webhook's).
--
-- A row is deleted when its conversation ends, and the expired ones are swept (00288, the voice sweep). Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.ask_voice_sessions (
  id               text primary key,
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  user_id          uuid not null,
  thread_id        uuid not null references public.ask_threads (id) on delete cascade,
  conversation_id  text,
  token_cipher     text not null,
  token_expires_at timestamptz not null,
  surface          text,
  scope            jsonb,
  context          jsonb,
  language         text not null default 'en',
  turn_key         text,
  turn_started_at  timestamptz,
  duration_s       integer,
  created_at       timestamptz not null default now(),
  ended_at         timestamptz,
  constraint ask_voice_sessions_id_is_sha256 check (id ~ '^[0-9a-f]{64}$'),
  constraint ask_voice_sessions_language_check check (language in ('en', 'es', 'other'))
);
comment on table public.ask_voice_sessions is
  'One row per voice conversation of Ask: whose it is, its thread, the member''s access token sealed under the dashboard''s key, and the turn the brain door claims. The member''s own under RLS; the brain door reads it on the service role (apps/dashboard/src/server/ask/voice-session.ts).';

create index if not exists ask_voice_sessions_thread_idx on public.ask_voice_sessions (thread_id);
create index if not exists ask_voice_sessions_expiry_idx on public.ask_voice_sessions (token_expires_at);

alter table public.ask_voice_sessions enable row level security;

-- Their own rows, in a workspace they belong to, as ask_messages (00040): the member starts, reads and ends a session
-- of their own; nothing of another person's is visible, whatever the workspace.
drop policy if exists ask_voice_sessions_own_select on public.ask_voice_sessions;
create policy ask_voice_sessions_own_select on public.ask_voice_sessions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.memberships m
       where m.user_id = (select auth.uid()) and m.tenant_id = ask_voice_sessions.tenant_id
    )
  );

drop policy if exists ask_voice_sessions_own_insert on public.ask_voice_sessions;
create policy ask_voice_sessions_own_insert on public.ask_voice_sessions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ask_threads t
       where t.id = ask_voice_sessions.thread_id
         and t.user_id = (select auth.uid())
         and t.tenant_id = ask_voice_sessions.tenant_id
    )
  );

drop policy if exists ask_voice_sessions_own_update on public.ask_voice_sessions;
create policy ask_voice_sessions_own_update on public.ask_voice_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists ask_voice_sessions_own_delete on public.ask_voice_sessions;
create policy ask_voice_sessions_own_delete on public.ask_voice_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- A column grant is a fence (00121): the member writes the row's identity and what the page knows, and later only
-- what an end writes; the claim and the duration are the service role's.
revoke all on public.ask_voice_sessions from public, anon, authenticated;
grant select, delete on public.ask_voice_sessions to authenticated;
grant insert (id, tenant_id, user_id, thread_id, conversation_id, token_cipher, token_expires_at, surface, scope, context, language)
  on public.ask_voice_sessions to authenticated;
grant update (surface, scope, context, ended_at) on public.ask_voice_sessions to authenticated;
grant all on public.ask_voice_sessions to service_role;
