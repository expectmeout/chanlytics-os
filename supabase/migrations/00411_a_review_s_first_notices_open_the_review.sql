-- 00411 · A review's first notices open the review (wiring plan, task 5.2; finding A2b).
--
-- A notice of a new review is kept about the review's row and opens it: the Reviews lens with that review drawn first and its
-- reply box open (`reports/reviews:<row id>`, contracts reviewRoute), as the Google sync writes it from now on (edge
-- google-rows.ts aboutReview). The rows the bell kept before were about Google's own id for the review and opened the lens at
-- its top (`reports/reviews`), so a press on one landed on the whole list and not on the review it named. (The bell closes
-- either once the review is answered: reviewNoticeIsAbout takes both ids.) The bell keeps a row ninety days
-- (purge_notifications), so this says the ones still kept the way the sync now writes them: about the review's row, opening
-- it, where the workspace holds a row for that Google id.
--
-- Left as they are: a notice of several reviews, or of ratings alone, which names no review and opens the lens; and a notice of
-- a review the workspace holds no row for any more (00392), which has no review to open.
--
-- Data only. Either deploy order: the edge writes this shape whatever the database holds, and this says the older rows the same
-- way. Re-runnable: a row said once no longer opens `reports/reviews` and is not read again.
set local lock_timeout = '3s';

update public.notifications n
   set route = 'reports/reviews:' || g.id::text,
       subject_id = g.id::text
  from public.google_reviews g
 where n.kind = 'review'
   and n.subject_type = 'review'
   and n.route = 'reports/reviews'
   and g.tenant_id = n.tenant_id
   and g.review_id = n.subject_id;
