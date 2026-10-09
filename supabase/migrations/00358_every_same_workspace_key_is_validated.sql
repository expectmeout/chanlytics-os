-- 00358 · Every key that names a row of its own workspace is validated.
--
-- 00279 replaced each foreign key between two workspace tables with one that names the workspace too, and added them
-- NOT VALID: every row written or changed since is held to its key, and no row that was already there was read. Its
-- header left the rest for later: "each is validated once, after production is known to hold no child that names
-- another workspace's parent". 00289 and 00306 added theirs the same way. Until a key is validated the database
-- vouches only for the rows written since it was added, and a reader of the schema is told the key is not to be
-- trusted.
--
-- Production was read on 9 October 2026 (a count, for each of the keys, of the children that name no parent of their
-- own workspace): 52 keys not valid, and not one row that breaks one. So each is validated here. Validating reads the
-- child table once while writes to it continue (its lock stops only another change to the table's shape), and from
-- then on the key is the database's word for every row.
--
-- A database that does hold such a row fails here, naming the key and so the table to look in, and nothing is changed:
-- the migration is one transaction. Re-runnable: a key that is valid is not one this finds.

set local lock_timeout = '3s';

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as child, c.conname
      from pg_constraint c
     where c.contype = 'f'
       and not c.convalidated
       and c.connamespace = 'public'::regnamespace
     order by c.conrelid::regclass::text, c.conname
  loop
    execute format('alter table %s validate constraint %I', r.child, r.conname);
  end loop;
end $$;
