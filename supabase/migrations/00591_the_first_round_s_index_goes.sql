-- 00591 · The first round's index goes (decision 0120, D6; 00589, 00590).
--
-- One first email a lead for good (sequence_sends_one_first, 00427) stood in the way of a business tried again once: one
-- a lead a round (sequence_sends_one_first_a_round, 00590) holds what it held, a round apart. Dropped CONCURRENTLY, alone
-- in its file, so no write to sequence_sends waits on it. Re-runnable.
--
-- Deploy order: after 00590. Until this runs, a second first email is refused at the row, and nothing is written.

drop index concurrently if exists public.sequence_sends_one_first;
