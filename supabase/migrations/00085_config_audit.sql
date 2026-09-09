-- 00085 · Who changed what the receptionist says, and when.
--
-- tenant_config carries `version` and `updated_at` and nothing else: no
-- updated_by, no event. For a table whose contents ARE the words a business's
-- customers hear -- the hours it quotes, the number it publishes, the rules it
-- follows, the prompt it is given -- "who changed this" was unanswerable. On a
-- workspace with three people and an owner who can invite more, that is the one
-- audit question that will eventually be asked, and it could not be.
--
-- Two halves, deliberately:
--
--   updated_by  the CURRENT state's author, on the row itself. One join to a
--               name, no scan, and the Business pane can say "last changed by
--               Ruben, two days ago" without reading a log.
--   an event    the CHANGE, in the events ledger every other consequential act
--               in this product already lands in, carrying which fields moved.
--               Fields, not values: the config holds a business's own words and
--               its booking link, and a ledger is read by more people than a
--               settings pane is.
--
-- Nullable, and no backfill. Every config written before this had no author
-- recorded and inventing one would be worse than the gap: null means "before we
-- kept track", which is true, and the pane says exactly that.

alter table public.tenant_config
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

comment on column public.tenant_config.updated_by is
  'Who last wrote this config. Null for rows written before 00085, and for writes the platform makes on a workspace''s behalf. The change itself is in events (kind = settings.changed).';

-- The route writes it through the session client, so the column needs its own
-- door beside `config` and `version` -- the same shape 00037 used, and the same
-- trap: without the grant the UPDATE succeeds and writes nothing.
--
-- Read the current grants rather than assuming them: this table's update grant
-- has been narrowed once already, and re-granting a column list from memory is
-- how one gets dropped.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into cols
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'tenant_config'
     and grantee = 'authenticated'
     and privilege_type = 'UPDATE';
  if cols is null then
    -- No column-scoped grant yet: this table has never been narrowed, so the
    -- grant that exists is table-wide and updated_by is already covered.
    raise notice '00085: tenant_config has no column-scoped UPDATE grant; nothing to widen';
  else
    execute format('grant update (updated_by) on public.tenant_config to authenticated');
    raise notice '00085: widened tenant_config UPDATE grant with updated_by (had: %)', cols;
  end if;
end $$;
