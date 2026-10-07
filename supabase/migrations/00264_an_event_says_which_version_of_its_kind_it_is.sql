-- 00264 · An event says which version of its kind's data it carries.
--
-- The ledger's rows are read long after they are written: the activity log, Ask's tools, the reports. Each kind's
-- data has a shape, and a shape changes (a field renamed, a count split in two). With nothing on the row to say which
-- shape it was written in, a reader had to guess from the fields it found. Now the writer says: packages/db events.ts
-- holds every kind the product writes from TypeScript with its category and the version of its data, and writes that
-- version here. A kind starts at 1 and is raised when its shape changes.
--
-- Additive: one column with a constant default, so the migrations' own inserts, and every row already written, are
-- version 1. On the partitioned parent, so every partition, the default one and those made later, has it. The fast
-- default rewrites no row. Re-runnable.

set local lock_timeout = '3s';

alter table public.events add column if not exists version smallint not null default 1;
comment on column public.events.version is
  'The version of this kind''s data (packages/db events.ts, 00264): raised when a kind''s shape changes, so a reader can tell an old row from a new one. 1 for every kind to date.';
