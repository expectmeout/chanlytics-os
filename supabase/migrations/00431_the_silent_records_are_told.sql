-- 00431 · The silent records are told: a mailbox made, a review answered, a round that moved, the workspace's own row.
--
-- The wiring's second audit, lane R6 (decision 0058; 0047's step 1 again, after 00408). Four records a page draws were
-- still told too little, or too much:
--
--   mailboxes       INSERT; UPDATE of the address, the sender's name,    a mailbox made in another tab reached nobody
--                   its reply mode, the pause on offers, the Gmail       (Today's email line, Start's and Connections'
--                   forwarding code and the intake's error               Email row); the forwarding code Gmail mails
--                                                                         reached the Calendar's Business tab only at a
--                                                                         return; an intake failing, and mail flowing
--                                                                         again, reached Connections the same way
--                                                                         (W-channel-team-plus-3, S4-4)
--   google_reviews  UPDATE of the reply                                  a review answered by the receptionist, a
--                                                                         teammate or another tab stayed "waiting for a
--                                                                         reply" on Today, the bell and Reports' Reviews
--                                                                         (S4-1, W-review-facts-rules-1)
--   lead_rounds     UPDATE of what a round is and what it waits on,      every statement of a lead run told, so a
--                   never its counters                                   search re-read Today and Leads every few
--                                                                         seconds in every tab, for counters neither
--                                                                         draws (S10-5)
--   tenants         UPDATE of the name, the zone, how customers buy      a rename, a zone or a buying model changed
--                   and the logo, beside the status                      elsewhere reached the sidebar and the
--                                                                         workspace list only at a return (S4-5)
--
-- Their updates are 00408's row triggers: AFTER UPDATE OF the columns a page draws, WHEN one of them is distinct, so a
-- stamp moves nothing. Not mailboxes.last_received_at, which every email writes; not a review's last_seen_at, which
-- the daily sync puts on every review; not a round's allowance, cost or judge's tokens, which each batch of a run moves
-- (Leads still hears a run's progress through its members and leads, told by the same commit). A round's insert and
-- delete stay 00265's statement triggers: every one is a round begun or gone. A mailbox's insert is a statement
-- trigger in 00265's shape: a mailbox is made once a workspace.
--
-- packages/db realtime.ts lists the events (WATCHED) and, once, the columns each narrowed update is told for
-- (NARROWED_UPDATES); database/each-workspace-is-told-what-changed.db.test.mjs holds the triggers equal to both.
--
-- What it costs. A notice a rare write makes (a mailbox made or its code, a reply, a rename) is a few a week; a lead run
-- that told every statement now tells the few times a round changes its state, its question or its wait.
--
-- Either deploy order works: a notice nobody hears is dropped with its day's partition, and a dashboard that listens
-- before this applies hears less, as it did.
--
-- The lock: a trigger made on a table takes SHARE ROW EXCLUSIVE until commit, and lead_rounds is written by every batch
-- of a run: 00408's 3 s guard. If it times out nothing was applied and the owner runs it again when the line is quiet.
-- `create or replace trigger`, so no moment passes between a drop and a make. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

-- A mailbox made: told to its workspace as 00265's statements are.
create or replace trigger workspace_tell_insert after insert on public.mailboxes
  referencing new table as changed
  for each statement execute function public.workspace_tell_changes();

do $$
declare
  w record;
begin
  -- The narrowed updates (00408's shape): told when a column a page draws holds something else than it did. A round's
  -- update replaces 00265's statement trigger of the same name, which told every write of every batch.
  for w in
    select *
      from (values
        -- The mailbox as the pages draw it: its address and sender's name and how replies go (Connections, Start, the
        -- Calendar's Booking tool row), the pause on offers (the composers, People), the code Gmail mails to confirm a
        -- forward (the Calendar's Business tab) and the intake's error, set and cleared (Connections' Email row). Not
        -- last_received_at, which every email writes.
        ('mailboxes', array[
          'local_part', 'from_name', 'reply_mode',
          'offers_paused_at', 'offers_paused_reason', 'offers_resumed_at',
          'forward_confirm_account', 'forward_confirm_code', 'forward_confirm_link', 'forward_confirm_at',
          'last_error']),
        -- A review answered, by the receptionist, a teammate or on Google. Not last_seen_at, which the sync stamps on all.
        ('google_reviews', array['reply_text', 'replied_at']),
        -- What a round is and what it waits on, as Leads (lead_searches_view) and Today draw it. Not its allowance, cost
        -- or judge's tokens and model, which each batch of a run moves.
        ('lead_rounds', array[
          'state', 'ending', 'ending_pending', 'question', 'answered', 'target', 'nearby', 'waiting_since',
          'ended_at', 'plan_version']),
        -- The workspace's own row: its status, and its name, zone, buying model and logo (the sidebar, the workspace
        -- list, the shell's clock). Not left_empty_at or updated_at, which no page draws.
        ('tenants', array['status', 'name', 'timezone', 'sells_by', 'logo_path'])
      ) as narrowed (tbl, cols)
  loop
    execute format(
      'create or replace trigger workspace_tell_update after update of %s on public.%I '
      'for each row when (%s) execute function public.workspace_tell_row_change()',
      (select string_agg(format('%I', c), ', ') from unnest(w.cols) as c),
      w.tbl,
      (select string_agg(format('old.%1$I is distinct from new.%1$I', c), ' or ') from unnest(w.cols) as c));
  end loop;
end $$;
