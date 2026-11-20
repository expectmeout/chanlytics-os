-- 00662 · An ad that can't run is mailed once (decision 0050, call 15; Ruben, 20 November 2026).
--
-- Of the bell's five notices for an owner's ads (00658), the two that stop an ad until the owner fixes something in
-- Meta are mailed as well: Meta didn't approve an ad (ad_refused), and Meta couldn't charge the card for one
-- (ad_unpaid). The three that are news (ended, spent, quiet) stay on the bell. Each row the ring writes for those two
-- says its mail is owed (notifications.mail_due_at, 00409), in the same statement that rings it, so a mail is never
-- lost between the ring and the send. The account's read then mails what is owed, once a cause, and says it went
-- (the edge's lib/ads/mail.ts, through the one mail every notice takes); the business may turn the mail off in
-- Settings › Notifications. A row whose cause clears before its mail goes is owed nothing.
--
--   ad_bell_ring   Re-made from 00658: the same, and the rows of ad_refused and ad_unpaid are written owing their mail.
--
-- No column, kind or index changes: notifications_kind_check is untouched.
--
-- Deploy order: either. Before this, the edge finds no mail owed and sends none; before the edge that sends it, a row
-- owes its mail until that edge's first read of the account sends it. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.ad_bell_ring(p_tenant_id uuid, p_account_id uuid, p_before text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_zone   text;
  v_now    text[];
  v_rung   integer := 0;
  v_closed integer := 0;
  v_n      integer;
  v_gone   record;
begin
  select coalesce(a.timezone, 'UTC') into v_zone
    from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object('rung', 0, 'closed', 0);
  end if;
  v_now := array(select distinct c.kind || ':' || c.cause
                   from public.ad_bell_causes(p_tenant_id, p_account_id, now()) c);

  -- A row whose cause no longer stands closes, for everyone: the ad fixed, paid for, turned back on, written from,
  -- paused, or its total raised. Through the one door that closes rows (00421).
  for v_gone in
    select distinct n.kind, n.subject_id
      from public.notifications n
      join public.ads d on d.id::text = n.subject_id
     where n.tenant_id = p_tenant_id
       and n.kind = any (array['ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet'])
       and n.closed_at is null
       and n.created_at >= now() - interval '30 days'
       and n.subject_type = 'ad'
       and d.tenant_id = p_tenant_id and d.account_id = p_account_id
       and not (n.kind || ':' || public.ad_bell_cause(n.kind, d.id, d.account_id, d.budget_at, d.platform_set_id,
                                                      d.platform_campaign_id) = any (v_now))
  loop
    v_closed := v_closed + public.notifications_close_about(p_tenant_id, array[v_gone.kind], 'ad', v_gone.subject_id);
  end loop;
  -- The account's own rows (00653) close with their cause too: a card Meta can charge again, and an account read
  -- again, which is one Meta signed back in.
  if not ('ad_unpaid:' || p_account_id::text = any (v_now)) then
    v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_account'], 'ad_account',
                                                            p_account_id::text, 'Meta can''t charge your ad account');
  end if;
  v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_account'], 'ad_account',
                                                          p_account_id::text,
                                                          'Meta signed Chanlytics out of your ad account');

  -- What turned since the last look rings, once. Nothing rings on the first look after a connect.
  if p_before is not null then
    with now_causes as (
      select c.kind, c.cause, c.ad_id from public.ad_bell_causes(p_tenant_id, p_account_id, now()) c
    ), fresh as (
      select c.kind, c.cause
        from now_causes c
        left join public.ads d on d.id = c.ad_id
       where not (c.kind || ':' || c.cause = any (p_before))
       group by c.kind, c.cause
      -- A card the account's own standing tells of is the account's row (00653), never an ad's as well.
      having bool_and(c.ad_id is not null)
         -- An ad first seen by this read rings only for Meta's check of it: a run that ended, spent or went quiet
         -- before Chanlytics held it is not news.
         and (c.kind in ('ad_refused', 'ad_unpaid') or bool_or(d.created_at < now()))
    ), named as (
      select distinct on (c.kind, c.cause)
             c.kind, c.cause, d.id, d.name, d.platform_issue, d.ends_at,
             count(*) over (partition by c.kind, c.cause) as many
        from now_causes c
        join fresh f on f.kind = c.kind and f.cause = c.cause
        join public.ads d on d.id = c.ad_id
       order by c.kind, c.cause, d.name, d.id
    ), worded as (
      select w.kind, w.cause, w.id,
             public.ad_bell_words(w.kind, w.name, w.many::integer, w.platform_issue, w.ends_at, v_zone) as said
        from named w
    ), rung as (
      -- The two that stop an ad owe their mail from the moment they ring (00662): the account's read sends it, once.
      insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id,
                                        recipient_user_id, mail_due_at)
      select p_tenant_id, w.kind, w.said ->> 'title', w.said ->> 'body', 'campaigns/ads:ad:' || w.id::text, 'ad',
             w.id::text, h.user_id,
             case when w.kind in ('ad_refused', 'ad_unpaid') then now() end
        from worded w
       cross join public.ad_bell_hearers(p_tenant_id) as h(user_id)
       -- Never a second open row for one cause.
       where not exists (
               select 1
                 from public.notifications o
                 join public.ads od on od.id::text = o.subject_id
                where o.tenant_id = p_tenant_id and o.kind = w.kind and o.recipient_user_id = h.user_id
                  and o.closed_at is null and o.subject_type = 'ad'
                  and o.created_at >= now() - interval '30 days'
                  and od.tenant_id = p_tenant_id
                  and public.ad_bell_cause(o.kind, od.id, od.account_id, od.budget_at, od.platform_set_id,
                                           od.platform_campaign_id) = w.cause)
      returning 1
    )
    select count(*) into v_n from rung;
    v_rung := v_n;
  end if;

  return jsonb_build_object('rung', v_rung, 'closed', v_closed);
end $$;

revoke all on function public.ad_bell_ring(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.ad_bell_ring(uuid, uuid, text[]) to service_role;
comment on function public.ad_bell_ring(uuid, uuid, text[]) is
  'The bell''s five ad notices for one ad account, after a good read (00658, decision 0050 call 15): each cause that stands now (ad_bell_causes) and was not among p_before rings once, a row for each member who may run ads (ad_bell_hearers), naming its first ad and how many more and opening that ad; each open row whose cause no longer stands closes for everyone; the account''s own payment row closes once its card cause has, and its signed-out row once it is read again. p_before null is the first look after a connect: nothing rings. An ad first seen by this read rings only ad_refused and ad_unpaid; a card the account''s standing tells of is the account''s own row. The rows of ad_refused and ad_unpaid are written owing their mail (mail_due_at, 00662), which the account''s read sends once. Closes through notifications_close_about. Answers {rung, closed}. Service role; called by ads_read_keep, which stamps ad_accounts.rung_at once it has rung.';
