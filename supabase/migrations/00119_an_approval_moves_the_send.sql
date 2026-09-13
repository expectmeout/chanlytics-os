-- An approval moves the send, and the row says so.
--
-- Approving an ask-mode run schedules the send at the next open moment (an
-- approval at night goes at nine) and records that time on the ledger and
-- the receipt -- but the session role could update a broadcast's `state`
-- alone (00046), so the row kept the sweep's assembly time, and the
-- Broadcasts page read a scheduled run dated the day before it goes. The
-- release now writes the time with the state.

grant update (state, scheduled_for) on public.broadcasts to authenticated;
