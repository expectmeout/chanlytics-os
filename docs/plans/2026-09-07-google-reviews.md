# Google reviews: the listing found from facts, watched, and read where the owner already looks

Status: both steps shipped 2026-09-07 (#203 the public listing, #204 the Business Profile), each invisible until its key or client is set on the edge (§7). Grounded in the legacy portal's Google Business Profile integration (`chanlytics-portal-private`: `lib/api/integrations/gbp.ts`, `app/api/integrations/gbp/*`, `project-reviews-integration.md`), the OS's own doors (Vault, the edge, pg_cron sweeps, Setup rows, the bell), and Google's current documentation (sources at the end).

## 1. The summary

- **Two steps, in this order.** First the public listing: found once from the business name and address Setup already holds, read every day by the edge, shown where the owner already looks. Second, later, the owner's Google Business Profile over OAuth: every review, replies, and the receptionist drafting replies under Autonomy. The first needs a Places API key on the edge and nothing from the owner. The second needs a Google Cloud project with the Business Profile APIs approved for access (a project starts at 0 requests a minute until Google approves it) and a consent screen, so it waits.
- **No menu item.** A Setup row ("Your Google listing"), a section on Reports ("Google reviews"), one line on Today the morning a review lands, a row on the bell, and a card on Integrations. Nothing else.
- **Honest about what Google shows.** Place Details returns at most five reviews, sorted by relevance, with no way to ask for the newest. The count of ratings is exact. So "new" is said two ways: a review is new when it was not on record and was written since the previous check; ratings without words are counted from the count. The first read after linking is history and raises nothing.
- **The old integration, done the OS way.** The portal kept access and refresh tokens as plain columns per user, carried the workspace through cookies, and pushed the sync to n8n. Here a credential goes through a Vault door the service role alone may call, the edge holds every key, the sweep is pg_cron calling the edge with the Vault-held sweep key, and every row is tenant-scoped under RLS from the first migration.

## 2. What the owner experiences

Setup gains one optional row after "The first yes":

> **Your Google listing** · Not started
> Find your business on Google so new reviews reach you here. · Uses the name and address on record
> **Find it**

"Find it" opens a card under the row. It searches with the name and address on record and shows what Google found: "Northside Movers · 1200 Harbor Blvd, Brooklyn". One tap on "This is it" links the listing and reads it at once. If the first search misses, the card takes a few words ("Northside Movers Brooklyn") and searches again. The row then reads:

> **Your Google listing** · Ready
> Northside Movers · 4.8 ★ · 213 reviews on Google · Checked just now · New reviews reach your bell and Reports
> **Open Reports**

From then on, every hour, the sweep reads every listing that has not been read for twenty hours. A new review becomes a row on the bell ("New on Google: ★★★★★ from Ana — 'Fast, careful, and on time.'"), a line on Today the next morning, and a row in Reports › Google reviews, which shows the rating now, the count, what was gained in the period, the newest review, the reviews gained day by day, and the latest reviews with their words. Integrations shows the listing with "Check now" and "Remove".

Without the Places key on the edge, none of this appears: no row, no section, no card. The product never draws a button that opens nothing.

## 3. Facts the plan stands on

| Fact | Detail | Source |
|---|---|---|
| Text Search (New) | `POST https://places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` and `X-Goog-FieldMask`; body `textQuery`, `pageSize` (1–20; `maxResultCount` is deprecated), `languageCode`, `regionCode`, `locationBias`; fields `places.id`, `places.displayName`, `places.formattedAddress`, `places.googleMapsUri`, `places.businessStatus` are Pro SKU, `places.rating` and `places.userRatingCount` Enterprise | Places API docs, Text Search |
| Place Details (New) | `GET https://places.googleapis.com/v1/places/{id}` with the same headers; `rating` and `userRatingCount` are Enterprise; `reviews` is Enterprise + Atmosphere; query parameters are only `languageCode`, `regionCode`, `sessionToken` — no review sort | Places API docs, Place Details and places.get |
| Reviews | "List of reviews about this place, sorted by relevance. A maximum of 5 reviews can be returned." A review carries `name` (`places/{place}/reviews/{review}`), `rating`, `text.text`, `originalText`, `authorAttribution.displayName/uri/photoUri`, `publishTime`, `relativePublishTimeDescription`, `googleMapsUri`, `flagContentUri` | Places API reference, Place resource |
| Pricing | Free monthly usage per SKU: Essentials 10,000, Pro 5,000, Enterprise 1,000 calls; past that, Place Details Enterprise + Atmosphere is $20 per 1,000 and Text Search Pro $25.60 per 1,000. One search per workspace ever; one details read per workspace per day | Google Maps Platform pricing |
| Business Profile APIs | Access is requested through the GBP API contact form ("Application for Basic API Access"); a project starts at 0 QPM and moves to 300 QPM on approval. Scope `https://www.googleapis.com/auth/business.manage`. Locations: `GET mybusinessbusinessinformation.googleapis.com/v1/accounts/{account}/locations?readMask=…`; the output-only `metadata` carries `placeId`, `mapsUri`, `newReviewUri`. Reviews: `GET mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews` (pageSize ≤ 50, `orderBy` `updateTime desc` default or `rating desc`), response `reviews[]`, `averageRating`, `totalReviewCount`; reply `PUT …/reviews/{id}/reply {comment}`, delete reply `DELETE` | GBP prerequisites, Business Information and v4 reviews references |
| Google OAuth (web server) | Authorize at `https://accounts.google.com/o/oauth2/v2/auth` with `access_type=offline` and `prompt=consent` for a refresh token, `state` against CSRF; tokens at `https://oauth2.googleapis.com/token`; revoke at `https://oauth2.googleapis.com/revoke`; the refresh token is returned on the first authorization | Google Identity docs |

## 4. What exists, and what the old portal taught

The portal's integration worked once and taught three things worth keeping: connect-time workspace capture (its callback validated the team from the connect step, not the current cookie), location selection from the Business Information API, and a normalised reviews table with the raw payload beside it. Three things not to repeat: tokens in plain columns readable by the session role, `debug=1` diagnostics inside a production route, and the sync living in an n8n workflow nobody in this repo can read.

The OS already has every seam the feature needs: `tenant_config.brain.business_name` and `profile.address` (the facts to search with), the Setup contract with rows read from facts, the edge with `x-diag-key` verbs and `x-cron-key` sweeps, `recordNotification` for the bell with `verbForRoute`, the Reports page with its section grammar and tile strip, Today's beats, the Integrations pane, realtime `WATCHED` tables, and the Vault door pattern (`put_channel_credentials`, `put_line_credentials`) for the second step.

## 5. Step one: the public listing (this change)

**Data (migration 00069).** `google_listings` (one per workspace: `place_id`, `name`, `address`, `maps_uri`, `rating`, `review_count`, `business_status`, `linked_by`, `linked_at`, `checked_at`, `check_error`, `facts`), `google_reviews` (one per shown review: `review_id`, `origin` places|profile, `rating`, `author`, `body`, `language_code`, `published_at`, `reply_text`, `replied_at`, `maps_uri`, `first_seen_at`, `last_seen_at`; unique per workspace and review), `google_listing_days` (the rating and the count per local day, for the trend and "gained in period"). Members read under RLS; the edge writes with the service role. Reviews and days hang off the listing, so removing it removes them. The bell learns the kind `review`. An hourly sweep at :37 calls `/api/cron/google` through `trigger_google_sweep()` with the Vault-held key, like the calendar sweep.

**Vendor code (packages/channels).** `google-places.ts`: the two requests as pure builders pinned to the documented URLs, headers and field masks, the parsers, and an HTTP port so tests run without a network. `google-sync.ts`: `planListingCheck` — given the listing as it was, the review ids on record, and a fresh read, it decides the listing patch, the day snapshot, the review upserts, which reviews are new (not on record, written since the previous check less a two-day slack), how many ratings were gained by the count, and the bell rows: one per new review up to three, else one summary; a count-only gain says "N new ratings" and explains why the words are missing; the first read raises nothing.

**Edge.** `lib/google.ts` (the key, the readiness, `checkListing` = read → plan → write → bell → event, `listingsDue`), `api/admin/google.ts` (`status`, `search`, `link`, `unlink`, `refresh`; diagnostic key only), `api/cron/google.ts` (the sweep: due listings, oldest first, forty per tick, each failure kept on its row as `check_error` and retried next hour). Env: `GOOGLE_PLACES_API_KEY`.

**Dashboard.** `GET /api/v1/google` (members: readiness, the listing, the latest twenty reviews, ninety days of snapshots), `POST /api/v1/google/search` (owner; the query defaults to the name and address on record), `POST` and `DELETE /api/v1/google/link` (owner), `POST /api/v1/google/refresh` (operator). Rate buckets `google_search`, `google_link`, `google_refresh`. Setup's DTO gains `google` (readiness and the listing) and its contract the row. A `google` surface override feeds `window.__GOOGLE`, refreshed on the two tables' realtime events; the bridge publishes `window.__google` (the view model, `find`, `link`, `unlink`, `refresh`, the words).

**Surfaces.** Setup row and finder card; Reports › Google reviews (four tiles, gained day by day with a table twin, the latest reviews with a table twin; an honest card when nothing is linked); Today's beat for a review first seen in the last thirty-six hours; the bell row (kind `review`, route `reports`); Integrations card (the listing, Check now, Remove; Business Profile named as not available yet).

**Honesty rules.** No listing, no numbers. Fewer than two days of snapshots, "gained" reads "—" and says why. A review that reappears through a relevance shift is never announced. The section names its source: "the five reviews Google shows first". Nothing renders when the platform has no key.

## 6. Step two: the Business Profile (shipped in #204; live once Google approves the project)

`google_connections` (one per workspace: the Google account, the location resource name, scopes, `connected_by`, `connected_at`, `revoked_at`, `last_error`, `last_synced_at`), the refresh token in Vault through `put_google_credentials` / `get_google_credentials` (service role only). Owner starts at `GET /api/v1/google/connect` (a signed `state` naming the workspace and the person), Google returns to `GET /api/v1/google/callback`, the dashboard proves the state and hands the code to the edge, which exchanges it, lists the accounts and locations, matches the location to the linked `place_id` through `metadata.placeId`, stores the token, and syncs the full review history into the same `google_reviews` table with `origin = 'profile'`. Replies become a verb (`reply_review`, subject `review`) with the receptionist drafting under a `reviews` Autonomy class. Integrations shows Connect, the account, the location, Disconnect (revoking the token). Needs from Ruben: a Google Cloud project with the three Business Profile APIs enabled and access approved, an OAuth client (web) with the callback URL, `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` on the edge.

## 7. What it needs from Ruben

- A Google Maps Platform API key with **Places API (New)** enabled, restricted to that API, set on the edge as `GOOGLE_PLACES_API_KEY`. Until then the feature is invisible.
- Later, for step two: the Google Cloud project, the access request, the OAuth client.

## 8. Verification

- Unit: the request builders against the documented shapes; the parsers; the planner's truth table (first read, a new review, an old review resurfacing, a count-only gain, more than three new); the view model (tiles, gained, the Today line's rules); the Setup row in each state; the bell's look and verb; the wiring pins (keys, roles, buckets, env manifest, `WATCHED`, the migration's policies, publication and sweep minute).
- e2e on production: `/api/v1/google` answers with readiness and never a key; with no key the row, the section and the card are absent; with a key and no listing, Setup offers "Find it" and Reports the honest card.
- Once the key exists: link a probe workspace to a real listing, read it, remove it.

## Sources

- Places API (New): Text Search — https://developers.google.com/maps/documentation/places/web-service/text-search
- Places API (New): Place Details — https://developers.google.com/maps/documentation/places/web-service/place-details
- Places API (New): places.get and the Place resource — https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/get, https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places
- Google Maps Platform pricing — https://developers.google.com/maps/billing-and-pricing/pricing
- Business Profile APIs prerequisites — https://developers.google.com/my-business/content/prereqs
- Business Information API, locations — https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations
- Google My Business API v4, reviews — https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list, https://developers.google.com/my-business/content/review-data
- OAuth 2.0 for web server applications — https://developers.google.com/identity/protocols/oauth2/web-server
