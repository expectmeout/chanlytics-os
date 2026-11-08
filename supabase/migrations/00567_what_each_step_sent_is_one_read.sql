-- 00567 · What each step sent is one read.
--
-- How it reaches out says beside each claim how many emails carried it (decision 0113): the emails sent from the steps
-- whose words hold the claim. packages/db asked one count for each such step, side by side, so a workspace with fifty
-- sequences that carry a claim asked fifty counts every time the page opened. This is one statement, however many steps.
--
-- The caller's own read, as sequence_batch_counts is: no definer, so a member counts what sequence_sends' policy shows
-- them, and asks nothing of another workspace. sequence_sends_step (step_id, state) serves it. Nothing changes on a page
-- until the code that asks it is deployed, and the code that asks it deploys after this.

create or replace function public.sequence_sent_by_step(p_tenant_id uuid, p_step_ids uuid[])
returns table (step_id uuid, sent bigint)
language sql
stable
set search_path = ''
as $$
  select s.step_id, count(*)
    from public.sequence_sends s
   where s.tenant_id = p_tenant_id
     and s.step_id = any (p_step_ids)
     and s.state = 'sent'
   group by s.step_id
$$;

comment on function public.sequence_sent_by_step(uuid, uuid[]) is
  'How many emails each step sent (decision 0113, 00567): one read of the sends, what How it reaches out counts beside a claim, under the row security of whoever asks. Sent alone: a planned, held or skipped send never reached anyone; a step that sent nothing is not in the answer.';

revoke all on function public.sequence_sent_by_step(uuid, uuid[]) from public, anon;
grant execute on function public.sequence_sent_by_step(uuid, uuid[]) to authenticated, service_role;
