-- 00394 · A listing keeps its review link.
--
-- A connected Business Profile's location says where a customer leaves the business a review (`metadata.newReviewUri`,
-- packages/channels google-profile.ts parseLocations), and the bind that makes it the workspace's listing dropped it:
-- google_listings kept the place's `maps_uri` alone. It is kept now, beside it, for a message's `review_link` slot to be
-- filled from (contracts ParamSpec, core refuseWithoutReviewLink): null until a profile's location is bound, and again
-- when a listing is linked to a place by the public read, which gives none.
--
-- The table's policies and grants cover the column (00069: members read, the edge writes with the service role).
-- Applied before the merge (runbook, "Apply a migration", step 4): the edge writes the column. A read before it is
-- applied is no link (db reviewLinkOf). Re-runnable.

set local lock_timeout = '3s';

alter table public.google_listings add column if not exists new_review_uri text null;

comment on column public.google_listings.new_review_uri is
  'Where a customer leaves this business a review on Google: the bound Business Profile location''s newReviewUri, null until one is bound or when the place was linked by the public read. Filled into a message''s review_link slot.';
