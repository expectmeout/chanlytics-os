-- 00466 · A mailbox is held for its own mail, not its noes (decision 0056, 8; the mailbox P0 review of 20 Oct 2026).
--
-- mailbox_connection_counts (00424, last made in 00451) is what the mailboxes clock holds a connected mailbox by
-- (contracts mailboxHoldOf). Two of its counts said more than they meant:
--
--   unsubscribed   counted a person who unsubscribed AND one who replied no. A polite "no thanks" is a reply, and a
--                  reply helps a mailbox's standing; five of them held a working mailbox. It now counts unsubscribes
--                  alone, and the noes are `said_no`, said on the page and never held on. A person who said no and
--                  then pressed the link is the unsubscribe's, as the door records it (set_email_marketing).
--   bounced        counted a permanent bounce only, and every 5.x.x was permanent, so a receiving server refusing the
--                  SENDER (5.7.x: spam, reputation, SPF, DKIM, DMARC, policy) suppressed a lead who did nothing wrong.
--                  The edge now files such a refusal as kind 'blocked' (channels mailbox-read.ts bounceClassOf): it
--                  never suppresses the address, and it is counted here as `blocked`, which the hold reads beside the
--                  hard bounces, since a mailbox servers refuse is the mailbox's to answer for.
--
-- The signature and every other count are kept, so either deploy order works: an edge before this reads no `blocked` or
-- `said_no` (none), and this before the edge counts no 'blocked' row (none is written yet). Re-runnable.

set local lock_timeout = '3s';

create or replace function public.mailbox_connection_counts(p_mailbox_id uuid, p_since timestamp with time zone)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with ours as (
    select m.id, m.status, m.error, m.meta, m.created_at, s.tenant_id
      from public.sequence_sends s
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.mailbox_id = p_mailbox_id
       and m.created_at >= now() - interval '90 days')
  ), recent as (
    select o.id, o.status, o.error, o.tenant_id from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and public.email_left(o.status, o.error)
     order by o.created_at desc
     limit 500
  ), noes as (
    -- Each person's no in the window, by how they said it; a reply's no undone is no no.
    select e.subject_id, e.data->>'source' as source from recent r
      join public.events e
        on e.tenant_id = r.tenant_id and e.kind = 'contact.consent_changed'
       and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')
       and e.data->>'purpose' = 'email_marketing' and e.data->>'source' in ('unsubscribe', 'reply')
       and e.data->>'message_id' = r.id::text
       and not (e.data->>'source' = 'reply' and exists (
         select 1 from public.events u
          where u.tenant_id = r.tenant_id and u.kind = 'contact.consent_changed'
            and u.created_at >= e.created_at and u.subject_id = e.subject_id
            and u.data->>'purpose' = 'email_marketing' and u.data->>'source' = 'reply_undone'
            and u.data->>'message_id' = e.data->>'message_id'))
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    -- A hard bounce only: a full mailbox or a greylisting server says nothing about the mailbox that wrote.
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'),
    -- A receiving server refusing the sender: the mailbox's own standing, never the address's.
    'blocked', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'blocked'),
    'complained', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)),
    -- A person counts once, however many of the window's emails their noes name, and an unsubscribe of theirs makes
    -- their no an unsubscribe: the door's own rule (set_email_marketing: a reply's no an unsubscribe follows is the
    -- unsubscribe's), so a person who said no and then pressed the link counts toward the hold.
    'unsubscribed', (select count(distinct subject_id) from noes where source = 'unsubscribe'),
    'said_no', (select count(distinct n.subject_id) from noes n where n.source = 'reply'
                  and not exists (select 1 from noes u where u.subject_id = n.subject_id and u.source = 'unsubscribe')))
$$;

revoke all on function public.mailbox_connection_counts(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mailbox_connection_counts(uuid, timestamptz) to service_role;
comment on function public.mailbox_connection_counts(uuid, timestamptz) is
  'Service-role only (the mailboxes clock, and the dashboard''s Setup read): what one connected mailbox''s reach-out emails came to since p_since, within 90 days and its last 500: sent, bounced (hard), blocked (a server refused the sender), complained, unsubscribed, and said_no (replied no, not undone, and unsubscribed from none of them). contracts mailboxHoldOf holds a mailbox on complaints, hard and blocked bounces, and unsubscribes; never on noes.';
