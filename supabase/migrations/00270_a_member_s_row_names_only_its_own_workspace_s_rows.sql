-- 00270 · A row a member writes names only its own workspace's rows.
--
-- A member's insert policy asked that the row's own tenant_id be the member's, and a foreign key asked only that the
-- row it names exist: a foreign-key check ignores RLS. So a member of workspace B who knew one of workspace A's ids
-- (a former employee of A) could queue a message in B naming A's conversation and A's person. The orphan sweep then
-- escalated (B, A's thread), taking the thread's one open escalation slot (escalations_one_open is on the
-- conversation alone), so A's own handovers on it never showed; and 00259's moments trigger, which joins the person
-- by id, rewrote A's person's first and last moments (the scorecard of 29 September 2026, review D).
--
-- The member insert policies whose row names another workspace-owned row now ask that the named row is its own
-- workspace's, the way segment_members and broadcast_recipients already did (00044, 00046): a message's thread and
-- person; a broadcast's playbook and template; a recipient's message; a moment's list and template, on insert and on
-- the update its column grant allows; a person's reply policy, its person (a trigger already keeps a policy's subject
-- for life).
-- Each subselect reads under the caller's own RLS, which shows a member only their workspace's rows, so it can never
-- answer for another's. Every other condition of each policy is as its last migration left it (00260, 00046, 00183,
-- 00048, 00029). A decision's undo_of is left as it is: a policy on decisions cannot read decisions without
-- recursing, and nothing reads the link but the ledger's own row.
--
-- And the lead finder's two helpers that name a workspace and asked nobody who called (00140): lead_month and
-- lead_searches_on answered any signed-in person about any workspace id. No session calls either; the finder's own
-- doors (definer functions that check the caller first) and the edge's service role do. Execute leaves
-- authenticated; the doors keep calling them as their owner.
--
-- Re-runnable: each policy is dropped and made again whole.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------- messages -- */

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
    -- and the thread and the person are this workspace's (00270).
    and exists (select 1 from public.conversations c
                 where c.id = messages.conversation_id and c.tenant_id = messages.tenant_id)
    and (messages.contact_id is null
         or exists (select 1 from public.contacts p
                     where p.id = messages.contact_id and p.tenant_id = messages.tenant_id))
  );

/* -------------------------------------------------------------- broadcasts -- */

drop policy if exists broadcasts_acting_insert on public.broadcasts;
create policy broadcasts_acting_insert on public.broadcasts
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and created_by = (select auth.uid())
    -- its playbook and its template are this workspace's (00270).
    and (broadcasts.playbook_id is null
         or exists (select 1 from public.playbooks p
                     where p.id = broadcasts.playbook_id and p.tenant_id = broadcasts.tenant_id))
    and (broadcasts.template_id is null
         or exists (select 1 from public.templates t
                     where t.id = broadcasts.template_id and t.tenant_id = broadcasts.tenant_id))
  );

drop policy if exists broadcast_recipients_acting_insert on public.broadcast_recipients;
create policy broadcast_recipients_acting_insert on public.broadcast_recipients
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and exists (select 1 from public.broadcasts b where b.id = broadcast_id and b.tenant_id = broadcast_recipients.tenant_id)
    and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = broadcast_recipients.tenant_id and c.erased_at is null)
    -- and the message it names, if any, is this workspace's (00270).
    and (broadcast_recipients.message_id is null
         or exists (select 1 from public.messages m
                     where m.id = broadcast_recipients.message_id and m.tenant_id = broadcast_recipients.tenant_id))
  );

/* --------------------------------------------------------------- playbooks -- */

drop policy if exists playbooks_acting_insert on public.playbooks;
create policy playbooks_acting_insert on public.playbooks
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and created_by = (select auth.uid())
    and kind = 'moment'
    -- its list and its template are this workspace's (00270).
    and (playbooks.list_id is null
         or exists (select 1 from public.segments s
                     where s.id = playbooks.list_id and s.tenant_id = playbooks.tenant_id))
    and (playbooks.template_id is null
         or exists (select 1 from public.templates t
                     where t.id = playbooks.template_id and t.tenant_id = playbooks.tenant_id))
  );

-- The column grant (00168) lets a member change a playbook's list and template, so the update asks the same.
drop policy if exists playbooks_acting_update on public.playbooks;
create policy playbooks_acting_update on public.playbooks
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (
    public.is_acting_member(tenant_id)
    and (playbooks.list_id is null
         or exists (select 1 from public.segments s
                     where s.id = playbooks.list_id and s.tenant_id = playbooks.tenant_id))
    and (playbooks.template_id is null
         or exists (select 1 from public.templates t
                     where t.id = playbooks.template_id and t.tenant_id = playbooks.tenant_id))
  );

/* ---------------------------------------------------------------- policies -- */

-- A person's reply policy names the person by subject_id, which no foreign key holds.
drop policy if exists policies_owner_insert_person on public.policies;
create policy policies_owner_insert_person on public.policies
  for insert to authenticated
  with check (
    subject_type = 'contact'
    and subject_id is not null
    and class = 'reply'
    and tenant_id in (select m.tenant_id from public.memberships m
                       where m.user_id = (select auth.uid()) and m.role = 'owner')
    and exists (select 1 from public.contacts p
                 where p.id = policies.subject_id and p.tenant_id = policies.tenant_id)
  );

/* ------------------------------------------------ the lead finder's helpers -- */

revoke execute on function public.lead_month(uuid, timestamptz) from authenticated;
revoke execute on function public.lead_searches_on(uuid) from authenticated;
