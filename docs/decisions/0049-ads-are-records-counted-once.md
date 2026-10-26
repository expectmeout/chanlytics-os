# 0049 · Ads are records, and a person is counted once

**Status:** Decided on 11 October 2026 (Ruben: the review's fourteen calls, approved as recommended), nothing built. Four
things stay open and are named under "Not decided here": the price, health and cosmetic businesses, which notices also
email, and the consent line's wording, which is counsel's. This is the records half of Campaigns › Ads on the Wiring
Blueprint (`Claude Video/docs/2026-10-11-chanlytics-wiring-blueprint.md`); 0050 decides how money is spent. It leans on
0047 (a page hears the record it draws) and 0048 (one list of what needs you), both drafted in another lane and not on
main when this was written (#1564 built both, 12 October 2026); each place that depends on one says so. Written against commit `132ab95eb` (main, 11 October 2026), and the
paths below were read at it. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

Chanlytics hears of an ad once today: when someone taps it and writes on WhatsApp. Nothing else about an ad is known.

- **The referral keeps two fields.** `adReferralOf` (`packages/channels/src/whatsapp.ts:132`) keeps the referral's
  `source_id` and `source_type` and drops the headline, the link and the click id on purpose. The message row carries
  the two as `meta.referral` (`apps/edge/lib/whatsapp/persist.ts`), and a trigger reads them.
- **The stamp is once, and for WhatsApp.** 00306 sets `contacts.acquired_via` and `acquired_ref` through
  `person_set_first_touch`, for the message or call that made the person. `ad` means a click-to-WhatsApp referral of
  type `ad`, and `acquired_ref` is that ad's bare id. 00307 stamps a person added at a door from their `contact.added`
  event, gives `manual` to a source it does not know, and the first stamp wins.
- **Reports says "An ad"** (`FIRST_CAME_WORDS`, `packages/contracts/src/reports/people/people-words.ts`). Nothing says
  which ad, what it cost, or whether anyone booked.
- **There is no ad, no account and no day of spend.** "Campaign" is the playbooks family (glossary), so it cannot name an
  ad. The visits record (0002) has its readers since 11 October 2026; Reports' booking line counts a person as booked
  after they asked (`bookedAfterAsk`), as of today.
- **The review.** The Ads review of 11 October 2026 (`Claude Video/docs/2026-10-11-chanlytics-ads-end-to-end-review.md`
  and its readers' reports) found that the records map onto mechanisms the repository has. This note keeps them.

## Decision

Ads are three records and one facet of a person. Of the review's fourteen calls, 1, 7, 10, 13 and 14 are this note's;
2, 3, 4, 8, 9, 11 and 12 are 0050's; 5 and 6 are how the page reads and are not decided here.

1. **Three records.** An **ad account** is the owner's own account on one platform, connected once (home: Settings ›
   Connections). An **ad** is what the owner asked for and what the platform says of it (home: Campaigns › Ads, address
   `campaigns/ads:ad:<id>`, our uuid and never the platform's id). An **ad result** is a platform's day for one ad.
   Each has one badge in one set of words in contracts (`adAccountStateOf`, `adStateOf`); no page works its own out. An
   ad is On, In review, Paused, Needs you, Ended, Finished, Draft, Setting up or Couldn't finish. "Too early to judge"
   is a reading from counts and age, never stored and never a state.
2. **One facet of a person: came through an ad.** No new kind of record. The person's page names the ad when Chanlytics
   knows it ("Spring offer") and says "an ad you run in Meta" when it does not.
3. **A platform's day and our count are joined when read, never kept as one number.** `ad_days` holds the platform's
   half: spend, impressions, clicks and its own result count, in the account's currency and zone. Our half, the people
   who first got in touch that day and how many have booked since, is worked out from `contacts` and the visits record
   at each read and kept nowhere. Every figure says whose it is. The platform's count (chats, calls, forms) is labelled
   as theirs: Meta's chat count includes someone who tapped twice.
4. **First touch, widened.** `acquired_via = 'ad'` meant a WhatsApp click-to-chat ad. From this note it means a person
   who first reached the workspace through a paid ad on any platform, a form included. `acquired_ref` is keyed
   `meta:<id>`, `google:<id>` or `tiktok:<id>`; one written before this note is a bare Meta id and is read as
   `meta:<id>`, never rewritten. The set already holds `ad`; only the CHECK's comment changes, and `FIRST_CAME_WORDS`
   stays one word. `events_note_first_touch` learns the source `ad` first, or a form lead made through `resolve_person`
   would be stamped `manual` and keep it.
5. **A person is counted once, for the ad they first got in touch through.** Every count of people per ad reads
   `contacts.acquired_*`, so the Ads page and Reports › People's "An ad" cannot disagree, and a test ties them. A second
   tap on another ad adds an entry and moves no count. People from an ad Chanlytics cannot name (an `acquired_ref` that
   matches no `ads` row) are one quiet line, so the page's total always reconciles with Reports. `ad_entries` enriches
   and counts nothing.
6. **Booked (an ad's).** A person is booked from an ad when they are counted for that ad and the visits record holds a
   visit for them that starts after their first touch and is not cancelled. A visit ahead, kept, missed, or past and not
   marked all count; a request (`proposed`) does not; a later message never un-books. The page's window chooses the
   people by the day they first got in touch, and whether they have booked is read at the read. It answers a different
   question from Reports' booking line (`bookedAfterAsk`: on an ask, as of today), so it has its own function in
   contracts, `bookedAfterTouch(touchAt, visits)`, its own glossary word, and the two never share a label. It is worked
   out when read, never stored: a stored `booked_at` would stay after a visit is cancelled. It uses the existing match
   (`peopleVisitsOf`, over the record and the feed, by number or address), so it inherits two limits and says them: a
   workspace with booking notices and no calendar link has no visits to read, so Booked is a dash there (0002 leaves that
   case to Ruben), and an appointment that matches no person is in no ad's number. A read is bounded to 2,000 people and
   says "first 2,000" past it.
7. **The cost words are one rule, `adCostRule`.** The cost for each person who booked is the spend of the ads whose
   people Chanlytics can count, over the people who booked from them. Under `REPORT_MIN_N` (5) booked it is a dash that
   says "only N".
   While any of the last 14 days is in a figure it says "so far", because Meta's counts keep moving for days and Google
   buckets a call by the day of the click; an ad is settled 14 days after it ends. An ad under 5 booked is never ranked.
8. **Google's calls stay Google's count.** A "Call you" ad shows the calls Google counted, as Google's. They are left
   out of Got in touch, Booked and the cost for each person; the ad's spend stays in Spent. A workspace holds one live
   line (00195), and a caller on it carries no ad. This holds until a call-tracking number is decided, which is Ruben's.
9. **Money is never converted.** An amount is an integer in the currency's minor units with its ISO code and exponent
   (a yen account is not multiplied by 100). Spend adds within one currency; with two the page shows each and no total.
   A platform's own counts are never added to one another or to ours.
10. **Existing ads are adopted, read-only.** An ad found in the owner's account is an `ads` row with
    `origin = 'platform'`: drawn, counted, and open to Pause and Resume alone (0050).
11. **Retention.** `ad_days` is kept 25 months (`RETENTION_DAYS.ad_days`, said on the privacy page). A click id is kept
    90 days and then nulled, and goes at once with an erasure; the ad's words on an entry go with the person.
12. **The receptionist hears the ad as an origin, and two things from it.** The person's part of its brief gains one
    sentence: they first wrote after tapping an ad, the ad's headline (fenced as data like any wire text), the service it
    is about, and whether it still runs. Terms, prices and hours come from Services and Hours as before. 0039 keeps that
    part of every turn thirty days, so what it was told about an ad can be read back.
13. **Reports.** Ads gets its own lens between Campaigns and Reviews, shown once an account is connected or an ad has
    run. Overview gains one fact; People's "An ad" row becomes a door into the lens.

## Shape

Storage says `tenant_id`; every table below carries it, `on delete cascade`. The columns are a sketch, and the migration
is the record. Money is `bigint` minor units beside a `currency`.

- `ad_accounts`: one row per connected account. `platform` (`meta`, `google`, `tiktok`; a closed set), `external_id`,
  `name`, `currency` and its exponent, `timezone`, `status` (`choosing`, `connected`, `revoked`, `disconnected`),
  `standing` (typed words only: funding, account, Page, WhatsApp linked, identity), `config` (the platform's own ids, one
  shape per platform), `token_expires_at`, `credentials_ref`, `read_at`, `read_error`. Its platform and external id are
  unique across workspaces: a second workspace to claim one is refused `ad_account_taken`, as a WhatsApp number is. One
  account per platform per workspace in v1.
- `ads`: one row per ad as the owner thinks of it. Its account and `platform` (a composite key, so they cannot differ),
  `origin` (`chanlytics` or `platform`), `name`, `door` (`whatsapp`, `call`, `form`), the offer as a snapshot
  (`service_name`, `price_note`), `copy`, `area`, the budget (`budget_kind` `total` or `daily`, `budget_minor`),
  `starts_on`, `ends_on`, what the owner asked (`intent`) beside what the platform says (`platform_state`,
  `platform_issue`) and Chanlytics's own `status`, `approved` (0050), `platform_ad_id` (unique with `tenant_id`), and
  `version`. The two words are stored side by side and the badge is derived once. Services have no key, so a later
  change to the offer is read by name and said as "Services changed".
- `ad_objects`: what Chanlytics made in the owner's account for an ad, each with the platform's id and a state. It is
  0050's ledger, not a record: no page, no address.
- `ad_days`: key `(ad_id, day)`, the day in the account's zone, with `spend_minor`, `impressions`, `clicks`,
  `platform_results`, `read_at`, `settled`. Reach is not additive; it is read daily onto the ad and drawn only in the
  drawer's "their numbers".
- `ad_entries`: one row each time someone reaches the workspace through an ad. `contact_id` (cascade), `ad_id` (null for
  an ad not yet adopted), `platform`, `platform_ad_id` (the raw reference), `kind` (`chat`, `number`, `call`), `new_person`
  (00306's test), `external_ref` (a form lead's id, unique with workspace and platform, so a replay does nothing),
  `click_id`, and `said`: the referral's headline, body, media type and link, each bounded.

**Why `ad_entries` beside the columns.** `acquired_*` says first, once, which ad, and survives an erasure as a count. It
cannot hold the click id (personal, needed to send an outcome back), what the ad said (the receptionist needs it), a
repeat tap, a form's replay key, or an ad Chanlytics did not make. The click id is not put on a message row, which is
not edited once written.

**Security.** Members read their workspace's rows and are granted no write; a forbidden UPDATE does not raise, so every
write is a `security definer` door that checks the role. A member cannot read `credentials_ref`. A platform's token is a
Vault secret, `ad-creds-<account id>`, put, read and dropped only by service-role functions the edge calls (the
`wa-creds-`, `line-creds-` and `google-creds-` precedents). The dashboard holds no token and calls no platform. The
tenancy suite and the erasure registry name the new tables: `ad_entries.click_id` and `.said` go with the person, and the
click id also by age.

**The read sweep** follows the channel-quality clock (00315). `trigger_ads_sweep` asks the edge only when a connected
account exists. One door, three tiers: every 15 minutes for an ad being set up, in review or in its first 48 hours;
hourly for every connected account; daily at the account's 04:00 for a 14-day re-read, which sets `settled`. An account is
read by one SQL door that upserts its days, sets states and standing, and writes an event only when something changed. A
failed read keeps the last good numbers and writes words to `read_error`; a revoked token sets `revoked`. Google's
quota is shared by every workspace (the Explorer level is 2,880 operations a day for the whole Cloud project, read at
the platform's page on 11 October 2026), so the Google budget comes from one counter, not from the account, and the tick
skips Google when the day's share is spent. The page never calls a platform; "Check now" is a POST.

**Events** are `domain.verb` and never change once shipped: `ad_account.connected`, `.chosen`, `.standing`, `.revoked`,
`.disconnected`; `ad.drafted`, `.changed`, `.turned_on`, `.published`, `.failed`, `.unwound`, `.state_changed`,
`.paused`, `.resumed`, `.budget_changed`, `.end_changed`, `.ended`, `.drifted`, `.copied`, `.reached`. Activity gets a
family, Ads. `ad_days` is told as a table notice only: a read is not a fact anyone acts on.

**Readers** are `adsPage`, `adDrawer`, `adPeople`, `adAccounts`, `adsReport` and `adChecks` in
`apps/dashboard/src/server/readers/`, the one read path pages and Ask share. The page model is pure and lives in
`packages/contracts/src/ads/`. Ask's `campaigns` read gains `ads` and `ad`, so the number Ask says is the number the
page shows.

**Hearing.** The Ads surface declares at birth the records it draws (ad account, ad, ad result, person, visit, hold),
as 0047 asks. Until 0047 lands it uses `refreshOnTables` in the shape 0047 converts, and adds nothing to the baseline of
reads that are not heard, which the wiring lane keeps and which may only fall. The "Waiting on you" tile reads `waitsOf`
of 0048 and counts nothing a second way; if 0048 has not landed when P1 is built, the tile waits.

## Steps

Each ships alone, in either deploy order.

**P0a · Keep what the referral says (no page, no platform).** `adReferralOf` returns the same two fields plus a click
id, headline, body, media type and link, each bounded and read defensively; anything odd is dropped field by field, and a
bad referral still costs a message nothing. `persist.ts` keeps `meta.referral` exactly as now. After the ingest, the edge
calls `ad_entry_keep` (keyed by the message id) with the rest. One migration holds `ad_entries`, that function, the
trigger taught `source: 'ad'`, and the 90-day purge. A nightly reconcile finds people stamped `ad` with no entry and
rebuilds one from the message's `source_id`, so a failed enrichment loses a click id and never a count. _Both orders:_
an edge ahead of the migration gets `PGRST202` from `ad_entry_keep` and ignores it (the 00364 precedent); a database
ahead of the edge has a table nothing writes. History accrues from the first click-to-WhatsApp after the step.

**P0b · Contracts and the permission.** `packages/contracts/src/ads/` (states, money, `bookedAfterTouch`, `adCostRule`,
the platform rules, the words), the record kinds declared once, the `ads` permission in `ROLE_PERMS` and in SQL's
`has_permission` together (0050; a database test holds the two equal, so neither goes alone), one Meta Graph client and
one OAuth-state helper extracted from the code that owns them today, and `providerFetch` learning `tiktok`. _Both
orders:_ types and a permission nothing yet checks.

**P1 · Meta, read.** Connect through Meta's login with the token in Vault; choose the account, Page and Instagram
account; adopt the owner's own ads; the sweep; the Ads page real and honest (figures, ledger, a read-only drawer, People
it brought, the line for ads Chanlytics cannot name); the Connections block; bell rows for a revoked token and a payment
problem; and the Reports lens in its first form, which draws only what Chanlytics counts. It ships after the visits
reach every reader (the wiring blueprint's L1.1) and once the surface hears what it draws. _Both orders:_ a dashboard
ahead of the migration reads no account and draws the page as it is today; an edge ahead has no clock to call it.

P2 to P5 (Meta launch, Google, TikTok, Ask and the full lens) are 0050's steps.

## Tests

Contracts: `bookedAfterTouch` for a visit ahead, kept, missed, past and unmarked, cancelled, `proposed`, and one before
first touch; `adCostRule` at 4, 5 and a settling window; `adStateOf` per platform word, exhaustive by a type test. Reader:
a person who taps two ads is counted once, for the first; the Ads total plus the unnamed line equals Reports › People's
"An ad". Edge: a referral with odd fields keeps what is sound, and the same message twice leaves one entry. Database:
RLS and the column grant, no `authenticated` execute on a credential function, `ad_account_taken`, the first-touch
trigger for `ad`, and the each-workspace-is-told equality.

## Risks

- **First touch credits one ad.** An owner who runs two ads sees the first one credited. The page says so.
- **A post may arrive as `post`.** Whether an ad made from an Instagram post arrives as `source_type = 'ad'` is not known;
  00306 stamps a post by its wire. It is checked on a real delivery before P2 ships that creative path, and the trigger
  then treats a `source_id` that matches a known ad as an ad whatever its type.
- **A missed lead is lost.** Meta keeps a lead 90 days and does not replay a missed webhook, so the hourly sweep lists
  each form's leads as a backstop (0050).
- **Booked costs a join.** It is bounded at 2,000 people. A workspace with no calendar link shows a dash.
- **A bare reference.** Rows written by 00306 hold a bare id. The reader prefixes it; nothing rewrites it.
- **An offer matched by name.** Services have no key, so a renamed service reads as a change to the ad's offer. The
  drawer says "Services changed" and does not guess. A key in Services would end it, and is another lane's.

## Not decided here

- The price of Ads, and whether it is a plan's or an add-on.
- Health and cosmetic businesses: whether they may keep a click id at all, and the platforms' extra gates (0050).
- Which notices also email (0050 lists the five).
- The wording of the form's consent line, which is counsel's. Nothing ships past a draft.
