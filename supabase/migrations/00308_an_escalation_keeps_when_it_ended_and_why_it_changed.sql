-- 00308 · An escalation keeps when it ended, and why it changed.
--
-- The Reports lenses spec, K4. A thread has one open escalation, so a new reason replaces the old on the same row, and
-- resolving it sets a state and not a time: both histories were lost. Now escalations.resolved_at is stamped once by a
-- trigger when state goes from open to resolved, so every writer is held (a row cannot reopen: escalations_guard, 00106),
-- and an escalation.changed { from, to } event is written when a reason replaces another (an opening or a refresh writes
-- none). Triggers, not the TypeScript writers: OLD is the row's own, which a read before the write could not promise. The
-- event's insert traps its own failure: a failed replacement is a hold with a stale reason and nobody told, the worse
-- failure (upsertEscalation's comments). No backfill: a row resolved before reads null, never zero. Either deploy order works.
--
-- The stamp is its own function, not a line in escalations_guard: the guard is the state machine (which edges exist), the
-- stamp is a fact kept about one of them, and a rule that changed would otherwise change the other. It fires on an update
-- of `state` only, and does one comparison; it reads nothing and writes nothing but its own column, so it has nothing to
-- trap. The change event fires only when a reason actually replaces another (the WHEN), which is the rare edge of an
-- escalation's life: an opening, a refresh and a resolve never reach the function.
--
-- The lock. The column is added first and takes ACCESS EXCLUSIVE on escalations, held to commit (a re-run takes it too, before it
-- finds the column there); that is the lock that stops the receptionist's upserts on every handoff, and everything after it in
-- this file runs under it and waits for nothing else. The triggers are created with `create or replace trigger`, which on its
-- own takes only SHARE ROW EXCLUSIVE (writers wait, readers do not), where a `drop trigger if exists` first would take ACCESS
-- EXCLUSIVE; so the file's hold is one table, one wait, bounded by the 3 s guard of 00259, and there is no second table for a
-- customer's write to be holding while this file waits. If it times out nothing was applied and the owner re-runs the file,
-- when the line is quiet. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.escalations add column if not exists resolved_at timestamptz;

comment on column public.escalations.resolved_at is
  'When the escalation was resolved (K4), stamped once by escalations_stamp_resolved when state goes from open to resolved. Null while open, and for every row resolved before 00308: unknown, never zero.';

create or replace function public.escalations_stamp_resolved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if OLD.state = 'open' and NEW.state = 'resolved' and NEW.resolved_at is null then
    NEW.resolved_at := now();
  end if;
  return NEW;
end $$;

create or replace trigger escalations_stamp_resolved before update of state on public.escalations
  for each row execute function public.escalations_stamp_resolved();
comment on function public.escalations_stamp_resolved() is
  'Stamps resolved_at once, when state goes from open to resolved, whoever writes it (K4).';

create or replace function public.escalations_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (NEW.tenant_id, 'escalation.changed', 'conversation', 'escalation', NEW.id,
          jsonb_build_object('from', OLD.reason, 'to', NEW.reason));
  return null;
exception when others then
  raise warning 'escalations_note_change: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.escalations_note_change() from public, anon, authenticated;
comment on function public.escalations_note_change() is
  'Writes escalation.changed { from, to } when a reason replaces another on an escalation (K4). Never fails the update: a failure is a warning.';

create or replace trigger escalations_note_change after update of reason on public.escalations
  for each row when (old.reason is distinct from new.reason)
  execute function public.escalations_note_change();
