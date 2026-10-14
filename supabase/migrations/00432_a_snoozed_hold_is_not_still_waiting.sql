-- 00432 · A snoozed hold is not "still waiting".
--
-- The wiring's second audit, lane R11 (S7-6). Two hours after a hold opens, the deadman (00018) mails the owner and pushes
-- every phone of the workspace "Still waiting: a customer has had no answer for N hours", even where the owner snoozed
-- that thread on purpose: the Inbox, the badge and Today all say it is not waiting on them. A snoozed thread is left out
-- of the candidates, and its hold left unstamped (deadman_alerted_at stays null), so it is raised by itself when the
-- snooze wakes and the hold is still open.
--
-- A thread a teammate took is NOT left out: an abandoned take-over would then be silent everywhere. Warning its holder
-- first and the workspace after a second window, in other words, is decision 0003 step 4's, not built here.
--
-- The same signature, so its grants stand (service_role alone, 00018). Re-runnable.

create or replace function public.deadman_candidates(p_older_than interval default '02:00:00'::interval)
returns table (
  escalation_id uuid,
  tenant_id uuid,
  conversation_id uuid,
  reason text,
  details text,
  opened_at timestamptz,
  phone_e164 text
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.tenant_id, e.conversation_id, e.reason, e.details, e.created_at, c.phone_e164
    from escalations e
    join conversations v on v.id = e.conversation_id
    left join contacts c on c.id = v.contact_id
   where e.state = 'open'
     and e.deadman_alerted_at is null
     and e.created_at < now() - p_older_than
     and v.state <> 'snoozed'
   order by e.created_at
   limit 50;
$$;
revoke execute on function public.deadman_candidates(interval) from public, anon, authenticated;
