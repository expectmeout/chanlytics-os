-- 00102 · The money lock holds.
--
-- The charter's first line -- the receptionist never decides money -- rests on
-- enforce_money_lock (00012), which checks one thing: a policies row of class
-- 'money' may not carry a mode other than 'never'. It never asked WHICH row was
-- being written. policies_owner_update lets an owner change every column, so
--
--   update policies set subject_type = 'contact', subject_id = gen_random_uuid()
--    where class = 'money'
--
-- moves the workspace's money row out of the workspace's scope with the
-- trigger's blessing (the mode is still 'never'), and the runtime, finding no
-- workspace row for the class, reads its mode as 'ask' (00017). The lock was a
-- lock on a door that could be carried away.
--
-- A policy row's identity -- whose it is, which class, which subject -- is set
-- when it is made and never changes; only its mode and limits do. Every writer
-- already behaves that way: the matrix writes mode and limits, and the
-- per-person door upserts on the full key, which is an update that changes
-- nothing about identity. So the database says so, for every writer there will
-- ever be: one guard, on insert and update, in place of the mode-only check.
--
-- Not a column grant, though that is the shape 00037 used for messages.
-- PostgREST's upsert-on-conflict SETS every column it was handed, identity
-- included, so a grant on (mode, limits) alone would refuse the person door for
-- writing back the values already there. A trigger that compares old and new
-- is the same rule without the side effect.

create or replace function public.enforce_money_lock() returns trigger
language plpgsql as $$
begin
  if new.class = 'money' and new.mode <> 'never' then
    raise exception 'money decisions are owner-only by charter — the mode is locked to never';
  end if;
  if tg_op = 'UPDATE' and (
       new.tenant_id    is distinct from old.tenant_id
    or new.class        is distinct from old.class
    or new.subject_type is distinct from old.subject_type
    or new.subject_id   is distinct from old.subject_id
  ) then
    raise exception 'a policy row keeps its workspace, class and subject for life — make another row instead';
  end if;
  return new;
end $$;

comment on function public.enforce_money_lock() is
  'Before insert or update on policies: a money row is always mode never, and no row changes its workspace, class or subject. The trigger policies_money_lock (00012) runs it.';
