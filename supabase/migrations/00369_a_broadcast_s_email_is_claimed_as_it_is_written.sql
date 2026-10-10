-- 00369 · A broadcast's email is claimed as it is written, and the claim's own words say so.
--
-- The claim on a queued row (00352, messages.sending_at) said a broadcast's row carries none. A broadcast's email is
-- now written already claimed, so a member's call-back (00362), which takes only a row nobody has claimed, cannot
-- cancel it while the provider is answering. Words only; either deploy order works. Re-runnable.

set local lock_timeout = '3s';

comment on column public.messages.sending_at is 'When the one run that took this queued row to the wire claimed it (00352): set where status = ''queued'' and it is null, so a second job naming the row sends nothing, and a member''s call-back takes only a row nobody has claimed (00362). Cleared only when the provider provably did not take the message. A broadcast''s email is claimed as it is written (00369). Null on a row no job sent (an inbound message, a direct answer).';
