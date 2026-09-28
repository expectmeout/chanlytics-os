-- 00236 · A person reads their Ask threads only while they belong to the workspace.
--
-- 00040 kept the membership check on the write side only ("a member who has since been removed loses the workspace,
-- not the memory of asking"): a turn then held the person's own words and the answer's. Since Ask Rewired's PR 5.3,
-- each answer also keeps the turn exactly as the model read it (ask_messages.content.raw): the page's rows, whole
-- threads and call transcripts — the workspace's customers, not the person's questions. Someone removed from the team
-- could have read all of it with their own session until the ninety-day purge.
--
-- So the reads now ask what the writes always asked: the row is the person's own AND its workspace is one they belong
-- to. Nothing is deleted: the rows wait for the purge (00040's purge_ask), and a person added back reads them again.
-- A removed member's update or delete by id is refused with them, since both read the row first. The definer doors
-- (purge_ask, scrub_ask_for_contact) are unchanged; grants are unchanged.

drop policy if exists ask_threads_own_select on public.ask_threads;
create policy ask_threads_own_select on public.ask_threads
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.memberships m
                 where m.user_id = (select auth.uid()) and m.tenant_id = ask_threads.tenant_id)
  );

drop policy if exists ask_messages_own_select on public.ask_messages;
create policy ask_messages_own_select on public.ask_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.memberships m
                 where m.user_id = (select auth.uid()) and m.tenant_id = ask_messages.tenant_id)
  );
