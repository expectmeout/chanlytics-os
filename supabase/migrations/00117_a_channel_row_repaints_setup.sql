-- A channel row repaints Setup.
--
-- tenant_channels is written by the WhatsApp connect (admin/whatsapp/connect),
-- by a line's saga at its channel step (edge/lib/lines.ts) and by the
-- platform's release, and Setup's WhatsApp and line rows derive from it -- yet
-- it was the one table those rows read that the database never published, so
-- a number connected in one tab stayed "Connect the WhatsApp number" in the
-- other until a reload. Published now, the way lines (00066), activations
-- (00108) and the business record (00075) are; the client's watch list names
-- it (packages/db realtime.ts) and Setup asks for it. RLS still decides who
-- receives a change: a member of the workspace, nobody else.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tenant_channels') then
    alter publication supabase_realtime add table public.tenant_channels;
  end if;
end $$;
