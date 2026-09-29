-- 00260 · A message's media is the edge's to write.
--
-- A member may queue an outbound message on the session client (00015, messages_acting_member_insert): as themselves,
-- outbound, as a person, queued. The policy never said a word about `media`, and the dashboard's media route signs
-- whatever `media.storage_path` a message holds with the service role, which reads every workspace's objects. So a
-- member of one workspace could queue a message whose media named another workspace's call recording or photo
-- (`<their tenant>/…`), mark it stored, and open it through their own route: a read of another business's customers
-- across the tenant line (the scorecard, 26 and 28 September 2026).
--
-- Two fences, one here and one in the signer. Here: a message a member writes carries no media. Nothing a member
-- sends has one (the dashboard's reply and draft rows never set it); the edge writes it with the service role when an
-- attachment arrives, and a member's UPDATE is column-granted to status and error alone (00037), so it cannot add one
-- later. In the dashboard (apps/dashboard/src/server/conversations/media.ts, signedMediaUrl): a path outside the
-- workspace that asks is never signed. Call recordings have no member write at all (00007: select only).
--
-- Re-runnable; the policy is replaced whole, its other conditions as 00015 left them.

drop policy if exists messages_acting_member_insert on public.messages;
create policy messages_acting_member_insert on public.messages
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and direction = 'outbound'
    and sender = 'human'
    -- you may only write yourself as the sender, and only as something not yet
    -- sent: 'sent' is the job's word to say, after the wire accepted it.
    and sent_by = (select auth.uid())
    and status = 'queued'
    -- and no attachment: the edge stores one, under the workspace's own path, with the service role.
    and media is null
  );
