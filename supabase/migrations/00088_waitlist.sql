-- 00088 · A queue for people we are not ready for yet.
--
-- Signup has had exactly two postures: open to anyone, or closed behind an
-- invite code. On production it was OPEN — SIGNUP_CODE unset — which is the
-- right posture eventually and the wrong one before the product can carry the
-- people it lets in.
--
-- The missing third posture is the one every launch actually wants: take the
-- address, say when you will be in touch, and let a person in when there is
-- room. Without it the only way to slow arrivals is a wall, and a wall loses
-- the very people who wanted the product enough to type their email.
--
-- Deliberately small. Not a marketing list, not a CRM: a queue you drain, with
-- enough on each row to decide who to invite next and to see that you did.

create table public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  -- What they said they run. Optional, because a required field here costs
  -- more sign-ups than the answer is worth, and the address is the point.
  business     text,
  -- Where they came from, when the page says. A launch that cannot tell which
  -- channel filled the queue learns nothing from filling it.
  source       text,
  created_at   timestamptz not null default now(),
  -- Stamped when an invite is sent, so the queue shows what is left rather
  -- than everything that ever arrived. Null is "still waiting".
  invited_at   timestamptz,
  invited_by   uuid references auth.users (id) on delete set null
);

-- One row per address. A person who signs up three times is impatient, not
-- three people, and a duplicate would be invited three times.
create unique index waitlist_email_idx on public.waitlist (lower(email));
-- The queue is read in arrival order, oldest first, filtered to the ones still
-- waiting. That is the only query this table has.
create index waitlist_waiting_idx on public.waitlist (created_at) where invited_at is null;

alter table public.waitlist enable row level security;
-- No policies at all: deny-all, exactly like public.jobs (00002) and
-- public.platform_admins (00001). This table holds the addresses of people who
-- are not customers yet and have no workspace to be scoped to, so there is no
-- membership that could make a row legitimately readable by a session. The
-- signup route writes it with the service role; the back office reads it the
-- same way.
revoke all on public.waitlist from anon, authenticated;

comment on table public.waitlist is
  'People who asked for a workspace while sign-up was closed. Service-role only: deny-all RLS, no policies, because nobody here has a workspace to be scoped to yet. Drained oldest-first; invited_at is the stamp that takes a row out of the queue.';
comment on column public.waitlist.invited_at is
  'When an invite was sent. Null means still waiting, and the partial index on that predicate is what makes the queue cheap to read.';
