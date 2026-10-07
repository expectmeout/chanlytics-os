-- 00346 · The reviews on record are read once for a report (Reports, the Reviews lens).
--
-- The lens counted the owner's Business Profile reviews from seven requests of the dashboard's own (the period's rows, two
-- counts, the oldest, the ones that wait, who answered, what was held) with the window cut at a UTC midnight a day early
-- so the workspace's zone could decide where a day starts in the browser's fold. It is one function now, as report_series
-- (00304) and campaign_series (00329) are: SECURITY INVOKER, so the caller's RLS decides what a member reads, the window
-- said once in the workspace's own zone, one statement, so one snapshot (the edge's delete and upsert of a sync cannot
-- straddle it). It answers the day each profile review was written in that zone, whether it has a reply and how long the
-- reply took, who wrote it, the counts the record holds, whether the record is the whole of Google's, and the oldest few
-- that wait with why a reply written for one was held. Contracts folds the answer (toReviewsReportVM).
--
-- Who wrote a reply is the receptionist's own event (google.replied, by: "receptionist", filed under the review row by
-- review-answers.ts) while the reply on the row is the one the event wrote: a reply rewritten on Google moves replied_at
-- (Google's updateTime), and the event no longer names the writer. The event counts only within six hours of replied_at.
--
-- google_connections.reviews_complete is the sync's word that the record holds every review Google lists: the profile
-- sync (apps/edge/lib/google/profile-sync.ts) sets it true when Google's list ended on a full pass, with no page left, and
-- false when the pages it may read ran out first. The history of the record cannot be told from review_count (Places and
-- the Business Profile write it on different bases) nor from the oldest review's date (a sync reads the newest, so the
-- record is not contiguous). The column defaults false, so a workspace the edge has not synced since reads as it did:
-- the record starts where the connection began. Apply this before the edge deploys: its sync writes the column.

alter table public.google_connections
  add column if not exists reviews_complete boolean not null default false;

comment on column public.google_connections.reviews_complete is
  'True when the last successful sync read the whole of Google''s list of this location''s reviews (no page was left), so the reviews on record are all of them; false when it stopped at its page limit, and before the first sync.';

create or replace function public.reviews_ledger(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz        text;
  v_days      integer := least(greatest(coalesce(p_days, 30), 1), 92);
  v_today     date;
  v_since     date;         -- the period's first day
  v_prior     date;         -- the period before's first day
  v_read_from timestamptz;  -- the instant the period before begins, in the zone
  -- The most reviews that wait the answer lists: contracts REVIEWS_WAITING_SHOWN, which the database test holds to this.
  v_waiting_shown constant integer := 5;
  -- How far a receptionist's event may be from the reply it wrote: Google's updateTime on the reply moves when the owner
  -- rewrites it on Google, and the event then names a reply that is no longer there.
  v_slack     constant interval := interval '6 hours';
  v_result    jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_today     := (now() at time zone v_tz)::date;
  v_since     := v_today - (v_days - 1);
  v_prior     := v_since - v_days;
  v_read_from := (v_prior::timestamp) at time zone v_tz;

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'days', v_days,
    'on_record', jsonb_build_object(
      'profile', c.profile,
      'places', c.places,
      'oldest_day', to_char((c.oldest at time zone v_tz)::date, 'YYYY-MM-DD'),
      'complete', coalesce((select g.reviews_complete from google_connections g where g.tenant_id = p_tenant_id), false)),
    -- The profile's reviews dated from the period before's first day, each on its day in the zone, oldest first.
    'written', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', w.id,
                 'd', to_char(w.d, 'YYYY-MM-DD'),
                 'rating', w.rating,
                 'replied', w.replied,
                 'secs', w.secs,
                 'by', w.by) order by w.published_at, w.id)
               from (select r.id, r.rating, r.published_at,
                            (r.published_at at time zone v_tz)::date as d,
                            (r.reply_text is not null) as replied,
                            case when r.reply_text is not null and r.replied_at >= r.published_at
                                 then extract(epoch from (r.replied_at - r.published_at))::integer end as secs,
                            case when r.reply_text is not null and ev.writer = 'receptionist'
                                  and abs(extract(epoch from (ev.wrote_at - r.replied_at))) <= extract(epoch from v_slack)
                                 then 'receptionist' end as by
                       from google_reviews r
                       -- The reply's last event, whoever wrote it: a person's reply through Chanlytics files one with no `by`.
                       left join lateral (
                         select e.data->>'by' as writer, e.created_at as wrote_at
                           from events e
                          where e.tenant_id = r.tenant_id and e.kind = 'google.replied'
                            and e.subject_type = 'review' and e.subject_id = r.id
                          order by e.created_at desc, e.id desc
                          limit 1) ev on true
                      where r.tenant_id = p_tenant_id and r.origin = 'profile' and r.published_at >= v_read_from) w), '[]'::jsonb),
    'waiting_total', c.waiting,
    -- The oldest that wait, the ones with no date last: the columns the Google read draws a review by, and why a reply
    -- written for it was held (google.reply_held), where one was.
    'waiting', coalesce((select jsonb_agg(to_jsonb(q) order by q.published_at asc nulls last, q.id)
                 from (select r.id, r.review_id, r.origin, r.rating, r.author, r.author_uri, r.author_photo_uri, r.body,
                              r.language_code, r.published_at, r.reply_text, r.replied_at, r.maps_uri, r.first_seen_at,
                              (select e.data->>'why'
                                 from events e
                                where e.tenant_id = r.tenant_id and e.kind = 'google.reply_held'
                                  and e.subject_type = 'review' and e.subject_id = r.id
                                  and e.data->>'why' is not null
                                order by e.created_at desc, e.id desc
                                limit 1) as held
                         from google_reviews r
                        where r.tenant_id = p_tenant_id and r.origin = 'profile' and r.reply_text is null
                        order by r.published_at asc nulls last, r.id
                        limit v_waiting_shown) q), '[]'::jsonb)
  ) into v_result
  from (select count(*) filter (where origin = 'profile')                            as profile,
               count(*) filter (where origin = 'places')                             as places,
               min(published_at) filter (where origin = 'profile')                   as oldest,
               count(*) filter (where origin = 'profile' and reply_text is null)     as waiting
          from google_reviews
         where tenant_id = p_tenant_id) c;

  return v_result;
end $$;

revoke all on function public.reviews_ledger(uuid, integer) from public, anon;
grant execute on function public.reviews_ledger(uuid, integer) to authenticated;

comment on function public.reviews_ledger(uuid, integer) is
  'Reports › Reviews: the profile''s reviews from the period before''s first day (each on its day in the workspace''s zone, with whether it has a reply, how long the reply took, and who wrote it: the receptionist where its own event is within six hours of the reply), the counts of each origin and the day of the oldest, whether the record is all of Google''s, and the oldest five that wait for a reply with why a reply written for one was held. One statement, under the caller''s RLS.';
