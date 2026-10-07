-- 00209 · A partner hears what changed, once a day.
--
-- Decision 0014 (the first of 0012's later steps). Until now a partner learned that a share was earned, became
-- payable, was taken back by a refund, was paid, or that a workspace was held for review, only by opening their pane.
-- The daily partner clock now also writes each partner one email about what changed since the last one it wrote:
--
--   partners.letters            the partner's own switch; on unless they turn it off on the pane.
--   partners.written_through    every change up to this instant has been written to them. The first letter after
--                               this migration covers what changes after it, never the history before.
--   partner_letters_due         for the edge alone: each partner with news since written_through, their address,
--                               what the news is, and where they stand now.
--   partner_letter_written      for the edge alone: the letter went; move the partner's mark forward (never back).
--   partner_letters_set         the caller's own switch. Turning it on starts from now, so no backlog arrives.
--   trigger_partners_sweep      also calls the edge when a letter is due, not only when something can mature.
--
-- Nothing here is a customer's: it is the platform writing to the person it pays, about their own ledger.

-- ------------------------------------------------------------------------------------------------ the columns

alter table public.partners add column if not exists letters boolean not null default true;
alter table public.partners add column if not exists written_through timestamptz;
-- Every partner that exists when this is applied starts from now: the first letter is about what happens next.
update public.partners set written_through = now() where written_through is null;
alter table public.partners alter column written_through set default now();
alter table public.partners alter column written_through set not null;

comment on column public.partners.letters is
  'Whether the partner is emailed what changed in their ledger, once a day (0014). Theirs to turn off.';
comment on column public.partners.written_through is
  'Every change to this partner''s ledger up to this instant has been written to them, or was not theirs to hear (letters off) (0014).';

-- The partner reads their own switch through partners_self_select (00202); only the functions below write it.

-- ------------------------------------------------------------------------------------------ partner_letters_due

create or replace function public.partner_letters_due(p_now timestamptz default now())
returns table (
  partner_id  uuid,
  email       text,
  code        text,
  status      text,
  since       timestamptz,
  through     timestamptz,
  news        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with who as (
    select p.id, u.email::text as email, p.code, p.status, p.status_why, p.status_at, p.written_through as since
      from public.partners p
      join auth.users u on u.id = p.user_id
     where p.letters
       and p.written_through < p_now
       and coalesce(u.email, '') <> ''
       -- A closed partner hears one thing more: that they were closed.
       and (p.status <> 'closed' or p.status_at > p.written_through)
  ),
  written as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'currency', e.currency,
                                                 'count', e.n, 'cents', e.cents)
                              order by e.kind, e.currency) filter (where e.kind is not null), '[]') as rows
      from who w
      left join lateral (
        select x.kind, x.currency, count(*)::int as n, sum(x.earned_cents)::bigint as cents
          from public.partner_earnings x
         where x.partner_id = w.id and x.created_at > w.since and x.created_at <= p_now and x.state <> 'void'
         group by x.kind, x.currency
      ) e on true
     group by w.id
  ),
  matured as (
    -- Rows that were written before the last letter and became payable since: the thirty days, or a person's yes.
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', m.currency, 'cents', m.cents)
                              order by m.currency) filter (where m.currency is not null), '[]') as rows
      from who w
      left join lateral (
        select x.currency, sum(x.earned_cents)::bigint as cents
          from public.partner_earnings x
         where x.partner_id = w.id and x.state = 'payable'
           and x.created_at <= w.since and x.updated_at > w.since and x.updated_at <= p_now
         group by x.currency
      ) m on true
     group by w.id
  ),
  voided as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', v.currency, 'cents', v.cents)
                              order by v.currency) filter (where v.currency is not null), '[]') as rows
      from who w
      left join lateral (
        select x.currency, sum(x.earned_cents)::bigint as cents
          from public.partner_earnings x
         where x.partner_id = w.id and x.state = 'void' and x.earned_cents > 0
           and x.updated_at > w.since and x.updated_at <= p_now
         group by x.currency
      ) v on true
     group by w.id
  ),
  paid as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', o.currency, 'cents', o.total_cents,
                                                 'reference', o.reference, 'sent_at', o.sent_at)
                              order by o.sent_at) filter (where o.id is not null), '[]') as rows
      from who w
      left join public.partner_payouts o
        on o.partner_id = w.id and o.sent_at > w.since and o.sent_at <= p_now
     group by w.id
  ),
  standing as (
    -- A workspace held for review, or a person's decision on one. The sweep's own "qualified" is the ordinary path,
    -- not news; a person's is the answer to a review.
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('workspace', t.name, 'standing', pt.standing,
                                                 'why', case when pt.standing_by is not null then pt.standing_why end)
                              order by pt.standing_at) filter (where pt.tenant_id is not null), '[]') as rows
      from who w
      left join public.partner_tenants pt
        on pt.partner_id = w.id and pt.standing_at > w.since and pt.standing_at <= p_now
       and (pt.standing in ('review', 'disqualified') or pt.standing_by is not null)
      left join public.tenants t on t.id = pt.tenant_id
     group by w.id
  ),
  brought as (
    select w.id,
           coalesce(jsonb_agg(t.name order by pt.attributed_at) filter (where pt.tenant_id is not null), '[]') as rows
      from who w
      left join public.partner_tenants pt
        on pt.partner_id = w.id and pt.attributed_at > w.since and pt.attributed_at <= p_now
      left join public.tenants t on t.id = pt.tenant_id
     group by w.id
  ),
  now_stand as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', b.currency, 'held', b.held, 'payable', b.payable,
                                                 'paid', b.paid, 'next_payable_at', b.next_at)
                              order by b.currency) filter (where b.currency is not null), '[]') as rows
      from who w
      left join lateral (
        select x.currency,
               coalesce(sum(x.earned_cents) filter (where x.state = 'held'), 0)::bigint as held,
               coalesce(sum(x.earned_cents) filter (where x.state = 'payable'), 0)::bigint as payable,
               coalesce(sum(x.earned_cents) filter (where x.state = 'paid'), 0)::bigint as paid,
               min(x.payable_at) filter (where x.state = 'held') as next_at
          from public.partner_earnings x
         where x.partner_id = w.id and x.state <> 'void'
         group by x.currency
      ) b on true
     group by w.id
  )
  select w.id, w.email, w.code, w.status, w.since, p_now,
         jsonb_build_object(
           'written', wr.rows,
           'matured', m.rows,
           'voided', v.rows,
           'paid', pd.rows,
           'standing', s.rows,
           'brought', br.rows,
           'status', case when w.status_at > w.since and w.status_at <= p_now
                          then jsonb_build_object('status', w.status, 'why', w.status_why) end,
           'balance', ns.rows)
    from who w
    join written wr on wr.id = w.id
    join matured m on m.id = w.id
    join voided v on v.id = w.id
    join paid pd on pd.id = w.id
    join standing s on s.id = w.id
    join brought br on br.id = w.id
    join now_stand ns on ns.id = w.id
   where jsonb_array_length(wr.rows) > 0
      or jsonb_array_length(m.rows) > 0
      or jsonb_array_length(v.rows) > 0
      or jsonb_array_length(pd.rows) > 0
      or jsonb_array_length(s.rows) > 0
      or jsonb_array_length(br.rows) > 0
      or (w.status_at > w.since and w.status_at <= p_now)
   order by w.id
$$;

comment on function public.partner_letters_due(timestamptz) is
  'For the edge alone (0014): each partner with letters on, an address, and a change to their ledger since written_through -- shares and reversals written, shares that became payable or void, payouts sent, workspaces brought, held for review or decided by a person, their own status -- with where they stand now.';

revoke execute on function public.partner_letters_due(timestamptz) from public, anon, authenticated;
grant execute on function public.partner_letters_due(timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------- partner_letter_written

create or replace function public.partner_letter_written(p_partner uuid, p_through timestamptz)
returns boolean
language sql
security definer
set search_path = public
as $$
  -- Forward only: a slow tick finishing after a faster one never moves the mark back.
  with moved as (
    update public.partners
       set written_through = p_through
     where id = p_partner and written_through < p_through
    returning id
  )
  select exists (select 1 from moved)
$$;

comment on function public.partner_letter_written(uuid, timestamptz) is
  'For the edge alone (0014): the letter through p_through went; the partner''s mark moves forward to it, never back.';

revoke execute on function public.partner_letter_written(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.partner_letter_written(uuid, timestamptz) to service_role;

-- ------------------------------------------------------------------------------------------ partner_letters_set

create or replace function public.partner_letters_set(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_on    boolean;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_on is null then
    raise exception 'Say on or off.' using errcode = '22023';
  end if;
  -- Turning it on starts from now: what changed while it was off is on the pane, not in a first long letter.
  update public.partners
     set letters = p_on,
         written_through = case when p_on and not letters then greatest(written_through, now()) else written_through end
   where user_id = v_user
  returning letters into v_on;
  if v_on is null then
    raise exception 'You are not a partner.' using errcode = 'P0002';
  end if;
  return v_on;
end $$;

comment on function public.partner_letters_set(boolean) is
  'The calling partner turns their daily letter on or off (0014). On starts from now.';

revoke execute on function public.partner_letters_set(boolean) from public, anon;
grant execute on function public.partner_letters_set(boolean) to authenticated;

-- ------------------------------------------------------------------------------------------------ the clock

create or replace function public.trigger_partners_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only when something can be judged or can mature, or a partner has a letter due: a share held behind a review or
  -- a paused partner is not due, and asking the edge about it every day would be asking for nothing.
  if exists (select 1 from public.partner_tenants pt
              where pt.standing is null
                and exists (select 1 from public.partner_earnings e where e.tenant_id = pt.tenant_id))
     or exists (select 1 from public.partner_earnings e
                  join public.partners p on p.id = e.partner_id and p.status = 'active'
                 where e.state = 'held' and e.payable_at <= now()
                   and (e.tenant_id is null
                        or exists (select 1 from public.partner_tenants pt
                                    where pt.tenant_id = e.tenant_id and pt.standing in ('qualified', 'disqualified'))))
     or exists (select 1 from public.partner_letters_due(now())) then
    return public.request_sweep('partners', '/api/cron/partners', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('partners', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_partners_sweep() from public, anon, authenticated;
comment on function public.trigger_partners_sweep() is
  'The partner clock (0012, P3; 0014). Calls the edge once a day when a workspace awaits its standing, an earning can mature, or a partner has a letter due; otherwise records that it looked.';
