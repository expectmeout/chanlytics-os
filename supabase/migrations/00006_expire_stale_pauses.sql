-- I1 (audit): pauses set by the EDGE (escalation, non-text ack) scheduled no
-- pause_expire job, so PG could sit at needs_human forever while the Blob pause
-- expired after 24h and the receptionist quietly resumed — the dashboard then
-- claimed "you own this thread" on a thread the AI was actively answering.
-- A cheap sweeper covers every pause regardless of who set it.

create or replace function public.expire_stale_pauses() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update conversations c
       set state = 'open', paused_until = null, assignee_user_id = null
     where c.state = 'needs_human'
       and c.paused_until is not null
       and c.paused_until < now()
       and not exists (
         select 1 from escalations e
          where e.conversation_id = c.id and e.state = 'open')
    returning c.id, c.tenant_id
  )
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  select tenant_id, 'conversation.pause_expired', 'conversation', 'conversation', id, '{}'::jsonb
    from expired;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.expire_stale_pauses() from public, anon, authenticated;

select cron.schedule('expire-stale-pauses', '*/15 * * * *', $$select public.expire_stale_pauses()$$);
