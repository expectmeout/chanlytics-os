-- 00128 · A sent email learns its ids.
--
-- An email leaves with no Message-ID of ours: the provider mints one and says
-- which on its signed receipts (docs/plans/2026-09-17-email-channel.md, §7).
-- That id is how a customer's reply finds the message it answers
-- (In-Reply-To), and how our own email coming back round a forward is known
-- for ours (00126's index on meta->'email'->>'message_id'), so it belongs on
-- the row.
--
-- It is written here, in one statement, because `meta` is one JSON value and
-- the receipts for one message arrive together: a read-modify-write from the
-- door would let the `delivered` receipt's status stamp (messages_guard keeps
-- each status's time in meta.status_at) and this write overwrite each other.
-- mark_processed (00003) is the same shape for the same reason.
--
-- It moves no status. Whether the row says `sent` is the send's own word to
-- say (deliver.ts finalizes the queued row, and reads a row it did not change
-- as a cancel that won); a receipt that arrived first must not make that read
-- a lie. It answers where the row stands and which thread it is on, which is
-- what the receipt's own handling is decided from (apps/edge email-receipts.ts):
-- no row back means this workspace sent no such email.

create or replace function public.stamp_email_sent(
  p_tenant_id uuid,
  p_message_id uuid,
  p_provider_id text,
  p_rfc_message_id text
) returns table (status text, conversation_id uuid)
language sql
security definer
set search_path = public
as $$
  update messages m
     set external_id = coalesce(m.external_id, p_provider_id),
         meta = jsonb_set(
           coalesce(m.meta, '{}'::jsonb),
           '{email}',
           coalesce(m.meta->'email', '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object('message_id', p_rfc_message_id))
         )
   where m.id = p_message_id
     and m.tenant_id = p_tenant_id
     and m.channel = 'email'
     and m.direction = 'outbound'
  returning m.status, m.conversation_id;
$$;
revoke execute on function public.stamp_email_sent(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.stamp_email_sent(uuid, uuid, text, text) to service_role;
