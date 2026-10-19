-- 00461 · A run that is decided closes its notice (the Inbox's run review, 19 Oct 2026).
--
-- The bell keeps a row about a run (kind 'playbook', subject 'broadcast' and the run's id) when it waits for its owner's
-- approval (the edge's playbooks.ts notify and reach-out run-context.ts notifyWaiting), and later when a going reach-out
-- run's check holds emails for the owner's say (held-notice.ts). Once the run was approved, skipped, or skipped by the
-- night's sweep, the row stayed open for every member, on every device and on the phone's icon: only a tab that held the
-- run among Sent's runs closed it (contracts notice-closes.ts), and nothing closed it on the server, as 00421 closes a hold's.
--
--   batch_closes_its_notices   a trigger: a run that leaves pending_approval (approved, skipped, or skipped by the sweep,
--                              whoever does it) closes the open 'playbook' rows about it through 00421's one door
--                              (notifications_close_about); so does a run that ends (sent, canceled, failed), a
--                              held-emails row among them, since nothing about it can be asked any more. A run that
--                              leaves pending_approval has no held-emails row yet: those are kept only for a going run.
--                              Never fails the change: a failure is a warning, as escalation_closes_its_notices'.
--
-- Then the bell's window is closed once over what already ended: 'playbook' rows about a run that has ended. Rows about a
-- run going now stay open, since one may be a held-emails row still asking; the browser judges those, as it did. A one-off
-- scan of thirty days of notifications across workspaces, re-runnable: it closes only rows still open.
--
-- Deploy order: either. The apps read closed_at already (00421); before this, a decided run's row closed only in a browser
-- that held the run.

create or replace function public.batch_closes_its_notices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (OLD.state = 'pending_approval' and NEW.state <> 'pending_approval')
     or (NEW.state in ('sent', 'canceled', 'failed') and OLD.state not in ('sent', 'canceled', 'failed')) then
    perform public.notifications_close_about(NEW.tenant_id, array['playbook'], 'broadcast', NEW.id::text);
  end if;
  return null;
exception when others then
  raise warning 'batch_closes_its_notices: %', sqlerrm;
  return null;
end $$;

comment on function public.batch_closes_its_notices() is
  'Closes the open playbook rows about a run when it leaves pending_approval (approved, skipped, or skipped by the sweep, whoever does it) or ends (sent, canceled, failed), through notifications_close_about (00461). Never fails the change: a failure is a warning.';

revoke all on function public.batch_closes_its_notices() from public, anon, authenticated;

drop trigger if exists batch_closes_its_notices on public.sequence_batches;
create trigger batch_closes_its_notices
  after update of state on public.sequence_batches
  for each row
  when (old.state is distinct from new.state)
  execute function public.batch_closes_its_notices();

-- The bell's window, closed once over the runs that already ended.
update public.notifications n
   set closed_at = now()
  from public.sequence_batches b
 where n.kind = 'playbook'
   and n.subject_type = 'broadcast'
   and n.closed_at is null
   and n.created_at >= now() - interval '30 days'
   and b.tenant_id = n.tenant_id
   and b.id::text = n.subject_id
   and b.state in ('sent', 'canceled', 'failed');
