-- A card's outcome, kept with the turn that proposed it.
--
-- An Ask turn may propose an action (a reply, a steer, a setting) as a card
-- the person approves or dismisses. What happened to the card is part of the
-- turn's record: reopening the thread must show "Sent" or "Not now", never a
-- fresh Approve on a reply that already went out. That is the ONE update a
-- message ever takes, and the grant is scoped to the column that carries it.

create policy ask_messages_own_update on public.ask_messages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant update (content) on public.ask_messages to authenticated;
