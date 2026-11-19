# 0049 · Ads are records, and a person is counted once

**Status:** Decided on 11 October 2026 (Ruben: the review's fourteen calls, approved as recommended). Steps P0a and P0b are built
(18 November 2026: migration 00644, an ad tap keeps what the ad said; migration 00645, the `ads` permission, with the
shared rules, the one Meta client and the one sign-in state helper), and so is call 2's line on a page (migration
00646: a person's page and the Ads page name the ad someone came through). Of step P1 the records are built
(19 November 2026: migration 00648, `ad_accounts`, `ads` and `ad_days`); the rest of it is not. Four
things stay open and are named under "Not decided here": the price, health and cosmetic businesses, which notices also
email, and the consent line's wording, which is counsel's. This is the records half of Campaigns › Ads on the Wiring
Blueprint (`Claude Video/docs/2026-10-11-chanlytics-wiring-blueprint.md`); 0050 decides how money is spent. It leans on
0047 (a page hears the record it draws) and 0048 (one list of what needs you), both drafted in another lane and not on
main when this was written (#1564 built both, 12 October 2026); each place that depends on one says so. Written against commit `132ab95eb` (main, 11 October 2026), and the
paths below were read at it. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).
Amended on 18 November 2026 by "No click id yet, and totals counted whole" (below): calls 6 and 11, the shape of
`ad_entries`, step P0a and one risk. Steps P0a and P0b are written as they were built: the "As built, 18 November
2026" sections (below) say
where that differs from what was first drawn.

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
   out when read, never stored: a stored `booked_at` would stay after a visit is cancelled. It uses the match the pages
   already use (`peopleVisitsOf`: the record and the feed, by number or address), made in the database so that a total
   is never cut short, and a test holds the two to the same answer. It inherits two limits and says them: a
   workspace with booking notices and no calendar link has no visits to read, so Booked is a dash there (0002 leaves that
   case to Ruben), and an appointment that matches no person is in no ad's number. The totals are counted whole, and the
   list
   of people is read a page at a time. _Amended 18 November 2026: a read was bounded to 2,000 people, which would have
   cut a growing business's totals short._
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
11. **Retention.** `ad_days` is kept 25 months (`RETENTION_DAYS.ad_days`, said on the privacy page). No click id is kept
    yet. When one is, it is kept 90 days and then nulled, and goes at once with an erasure. The ad's words on an entry
    go with the person. _Amended 18 November 2026: a click id was kept from the first step._
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
- `ad_entries`: one row each time someone reaches the workspace through an ad. `contact_id` (cascade; not built: see "As
  built", below), `ad_id` (null for
  an ad not yet adopted), `platform`, `platform_ad_id` (the raw reference), `kind` (`chat`, `number`, `call`), `new_person`
  (00306's test), `external_ref` (a form lead's id, unique with workspace and platform, so a replay does nothing),
  `message_id` (the message that carried it, one entry a message, so a delivery handled twice does nothing),
  and `said`: the referral's headline, body, media type and link, each bounded, with `said_at`, the moment the words
  arrived. `click_id` is not in the first
  migration: it arrives with the step that tells a platform who booked (0050, call 16; amended 18 November 2026).

**Why `ad_entries` beside the columns.** `acquired_*` says first, once, which ad, and survives an erasure as a count. It
cannot hold the click id (personal, needed to send an outcome back), what the ad said (the receptionist needs it), a
repeat tap, a form's replay key, or an ad Chanlytics did not make. The click id is not put on a message row, which is
not edited once written. The click id is one of those reasons from the day it is kept, not before.

**Security.** Members read their workspace's rows and are granted no write; a forbidden UPDATE does not raise, so every
write is a `security definer` door that checks the role. A member cannot read `credentials_ref`. A platform's token is a
Vault secret, `ad-creds-<account id>`, put, read and dropped only by service-role functions the edge calls (the
`wa-creds-`, `line-creds-` and `google-creds-` precedents). The dashboard holds no token and calls no platform. The
tenancy suite and the erasure registry name the new tables: `ad_entries.said` goes with the person. A click id, once
it is kept, goes with the person and also by age.

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

**P0a · Keep what the referral says (no page, no platform).** `adReferralOf` returns the same two fields plus the
headline, body, media type and link, and no click id, each bounded and read defensively; anything odd is dropped field
by field, and a
bad referral still costs a message nothing. `persist.ts` keeps `meta.referral` exactly as now. The database opens the
entry itself, in the message's own transaction, where the first-touch stamp is written. After the ingest, the edge
calls `ad_entry_keep` (keyed by the message id) with the rest. One migration holds `ad_entries`, that function, and the
trigger taught `source: 'ad'`. There is no purge yet, since nothing is kept that ages out. A failed enrichment loses
the ad's words and never the entry or a count, and each one that fails is counted on its row: an entry with no
`said_at` is one whose words never arrived. _Both orders:_
an edge ahead of the migration gets `PGRST202` from `ad_entry_keep` and ignores it (the 00364 precedent); a database
ahead of the edge opens entries whose words never arrive. History accrues from the first click-to-WhatsApp after the
step. _As built, 18 November 2026: a nightly reconcile was drawn here, rebuilding the entries whose keep had failed._

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
trigger for `ad`, and the each-workspace-is-told equality. The database's total of who booked equals the pages' match on
the same people.

## Risks

- **First touch credits one ad.** An owner who runs two ads sees the first one credited. The page says so.
- **A post may arrive as `post`.** Whether an ad made from an Instagram post arrives as `source_type = 'ad'` is not known;
  00306 stamps a post by its wire. It is checked on a real delivery before P2 ships that creative path, and the trigger
  then treats a `source_id` that matches a known ad as an ad whatever its type.
- **A missed lead is lost.** Meta keeps a lead 90 days and does not replay a missed webhook, so the hourly sweep lists
  each form's leads as a backstop (0050).
- **Booked costs a join,** made in the database. A workspace with no calendar link shows a dash.
- **A bare reference.** Rows written by 00306 hold a bare id. The reader prefixes it; nothing rewrites it.
- **An offer matched by name.** Services have no key, so a renamed service reads as a change to the ad's offer. The
  drawer says "Services changed" and does not guess. A key in Services would end it, and is another lane's.

## Not decided here

- The price of Ads, and whether it is a plan's or an add-on.
- Health and cosmetic businesses: whether they may keep a click id at all, and the platforms' extra gates (0050).
- Which notices also email (0050 lists the five).
- The wording of the form's consent line, which is counsel's. Nothing ships past a draft.

## Amended 18 November 2026 · No click id yet, and totals counted whole

Ruben, 18 November 2026, to nine changes found while the build plan for Ads was written
(`docs/plans/2026-11-18-ads.md`):
"Approve as written". Two of them are this note's. Nothing in this note is built, so nothing built changes.

- **No click id yet.** This note leaves open whether health and cosmetic businesses may keep a click id at all, and the
  product has no way to tell such a business apart. The id has one use, sending an outcome back to a platform, which is
  a later step and off for those businesses. So the first step keeps the ad's name and words, which every business can
  keep, and the click id waits for the step that needs it and for that decision. What is given up is known: a tap made
  before that step cannot be reported to the platform afterwards.
- **Totals counted whole.** A read bounded to 2,000 people was honest about its limit, and still partial exactly when a
  business grows. Totals are counted in the database. The list of people stays paged. How the match is made in the
  database is the design of the step that builds it; what must hold is that the total is whole and agrees with the
  match the pages already use.

## As built, 18 November 2026 · The entry is opened with the message

Step P0a was built on 18 November 2026 (`supabase/migrations/00644_an_ad_tap_keeps_what_the_ad_said.sql`). Two things
in it are not as this note first drew them. Each is the mechanism of a step and no call of Ruben's, so it is said here,
where the code and the note would otherwise disagree.

- **What was drawn.** The edge made the entry after the ingest, and a nightly reconcile found the people stamped `ad`
  with no entry and rebuilt one.
- **What was built.** One door writes the table, `ad_entry_keep`, by the message's id. The trigger that writes the
  first-touch stamp (`messages_note_first_touch`) calls it in the message's own transaction, which opens the entry. The
  edge calls it again after the ingest, with what the ad said. It reads the ad and `new_person` from the message's own
  row, so either caller opens the same entry.
- **Why.** The reconcile has to find its candidates among `messages` or `contacts`. That is a read of every workspace's
  recent messages each night, or an index on one of the two busiest tables, which the runbook builds alone and
  `CONCURRENTLY`. Opening the entry where the stamp is written needs no read and no clock, and leaves no hour in which
  a person counted for an ad has no entry.
- **What still holds.** One entry for each message, however often it is delivered. A failed keep loses the ad's words
  and never the entry or a count. Each failure is counted: an entry with no `said_at` is one whose words never arrived,
  and the edge logs `ad_entry_keep_failed`. `new_person` is 00306's test. Either deploy order.
- **The shape: an entry names its message, and no person.** The Shape above drew `contact_id`. An entry made by a
  message is that message's, so its person is the message's person, kept in one place. Two people combined then need
  nothing moved, and an erasure, which deletes the person's messages, takes the entry with them. A column for the
  person would be a second copy to keep true at every merge, and a second writer of the table (0031: one record, one
  door). The step that adds an entry with no message (a form lead's) brings its own way to name its person.
- **Two things the shape gained.** `message_id`, which is the key the door is called by, and `said_at`.
- **No event of its own.** An entry is part of the message that carried it, whose door writes that message's events in
  the same transaction. Nothing hears an entry (Hearing, above, names the records the Ads surface hears).
- **Read on Meta's pages, not on a delivery.** A message from a click-to-WhatsApp ad carries `headline`, `body`,
  `media_type` and `source_url`. One from a click-to-Instagram ad carries `ads_context_data` with `ad_title` and a
  `photo_url` or a `video_url`, and no words and no link. Production held no message with an ad's referral on
  18 November 2026, so neither has been seen on a real delivery yet.

## As built, 18 November 2026 · The shared rules, the permission and the one Meta client

Step P0b was built on 18 November 2026 (`supabase/migrations/00645_an_owner_may_run_ads.sql`). Nothing a customer sees
changes with it, and nothing checks the permission yet. Where it is not as this note first drew it, it is said here.

- **The permission.** `ads` is the owner's alone in `ROLE_PERMS` and in SQL's `has_permission`, in one change. The
  database test that holds the two equal (`tests/leads/engine/lead-engine.db.test.mjs`) needed no edit: it reads every
  permission from `ROLE_PERMS`.
- **Money.** `minorPerUnit(currency)` in `packages/contracts/src/ads/money.ts` reads how many minor units a currency
  holds from the runtime's own currency table (a hundred to the dollar, one to the yen, a thousand to the dinar). The
  constant that read every currency as a hundred is gone. An amount is said exact; only the cost for each person, an
  average nobody approved, is rounded. Nothing stores an exponent: it is read from the code. The Shape's "currency and
  its exponent" on `ad_accounts` therefore needs no column unless a platform's exponent ever differs from ISO 4217's.
- **The badge.** `adStateOf` reads three words kept side by side, with the two facts that end a run (its last day, its
  total): where Chanlytics is with making the ad (`draft`, `sending`, `failed`, `made`), what the owner asked (`on`,
  `paused`, `ended`), and the platform's own word, kept as the platform gave it. In order: what Chanlytics is still
  doing; a run that is over; what the platform will not run until the owner acts; then the platform's word against what
  was asked. Every word Meta's reference lists for an ad (`effective_status`, twelve of them, read on Meta's page on
  18 November 2026) is read, and a type test holds the list. A word Chanlytics does not know, and no word yet, are In
  review, never On. Google's and TikTok's words join with the steps that read their ads. `draft` is in the rule's
  answer and joins the page's own set with the step that draws drafts (0050, P2).
- **Two readings that are not states.** The plan's "Couldn't confirm it's on" (its C7) and "Left in Meta" arrive with
  the steps that can know them. Neither is in `adStateOf` yet.
- **An ad account's badge.** `adAccountStateOf` reads the account's `status` and when its token runs out: not connected,
  to be chosen, connected, or needing to be connected again (access taken back, or a token run out).
- **Booked.** `bookedAfterTouch(touchAt, visits)` is in `packages/contracts/src/ads/`, and reads each visit's start and
  its status in the record.
- **The cost rule lives with Reports.** `adCostRule` is in `packages/contracts/src/reports/ad-cost.ts`, beside
  `REPORT_MIN_N`, which it keeps. Reports leans on Ads (the lens's address), and a rule in `ads/` that read Reports'
  minimum would have joined the two in a circle (decision 0110). Every reader takes it from the package's root, as
  before. The Ads page's totals carry its answer, so the page has no cost rule of its own.
- **Not moved in this step.** This note drew "the platform rules, the words" and "the record kinds declared once" in
  `packages/contracts/src/ads/`. The page's models, rules and words have lived in the dashboard's own tree since they
  were found to have one reader. They return as the server's reader becomes the second (step P1), and the record
  kinds are declared with the tables that hold them.
- **`providerFetch` did not learn `tiktok`.** It learns a provider with the step that first calls it.
- **The one Meta client.** `packages/channels/src/meta/` (`@chanlytics/channels/meta`): the dialog, the code traded for
  a business's token, what the token may do, whose it is, the proof every call carries, and the one reader of Graph's
  error. Instagram's module keeps Instagram's own part and reads the rest from it. One wording differs: an error from
  Meta that comes with no words of its own is said as "Meta refused the request" by the client's three parsers, where
  it was "Instagram refused the request".
- **The one sign-in state helper.** `packages/channels/src/tokens/sign-in-state.ts`, moved word for word out of
  Google's module, so a state signed before a deploy proves itself after it. `signStateFor` and `verifyStateFor`
  are what Instagram's and Meta's connects share, and what an ad account's connect will use.

## As built, 18 November 2026 · An ad has one name, and two pages say it

Call 2 was built on 18 November 2026 (`supabase/migrations/00646_a_page_names_the_ad_someone_came_through.sql`), the
last part of the plan's step 1. Until Chanlytics holds the ad itself (step P1), an ad's name is the headline its taps
kept.

- **One place names an ad.** `ad_named(tenant, ref)` reads a first touch's reference and answers the ad's platform and
  its name: the headline the newest entry kept for it, or none. A reference keyed by its platform (`meta:<id>`) is read
  by its key, and a bare id, which a WhatsApp or Instagram message carries, is Meta's. So call 4's two ways of writing
  a reference name the same ad, and nothing is rewritten.
- **The newest headline, not the person's own.** An owner who rewrote the ad sees today's words on every page. A
  person's page and the report then call one ad one thing.
- **The person's page.** The line of where they came from ends with the ad: "Wrote on WhatsApp · Nov 18 · from an ad
  (Spring colour offer)", or "from an ad you run in Meta" where no entry kept a headline. The read asks for a person an
  ad brought and nobody else, and a name that cannot be read never fails the page.
- **The Ads page, nothing connected.** Under its count it says which ads: "5 people from Spring colour offer and 2
  people from an ad you run in Meta." It reads this from the people report's own answer (`first_came.by_ad`, added to
  `people_series`), so its rows are the same people the report counts under "An ad", and it says them only where they
  add up to that count. The ads nobody can name are one row a platform, which is call 5's "one quiet line".
- **What the report counts, it counts as before.** The people report reaches on WhatsApp, SMS, email and calls. A
  person who first wrote on Instagram after tapping an ad is stamped `ad`, and is in neither the report's "An ad" nor
  this split until the report counts Instagram. That is the report's, and is not changed here.

## As built, 19 November 2026 · The records under Connect

The first part of step P1 was built on 19 November 2026 (`supabase/migrations/00648_a_business_s_ads_are_kept.sql`):
three tables and an account's token, with no door yet. Nothing a customer sees changes with it. Where it is not as the
Shape above first drew it, it is said here.

- **No `credentials_ref`, and no column grant.** The Shape drew a pointer to the token on the account's row and a grant
  that hid it from members. A token's secret is named for its account (`ad-creds-<account id>`), so the pointer said
  nothing the id does not, and writing it made the token's function a second writer of the account. Three functions
  keep the token (`ad_credentials_put`, `_get`, `_drop`), the service role's alone, and they write no table. A member
  reads the whole row, and nothing on it says where a token is kept.
- **Which account is which.** A workspace holds one live account a platform; one it disconnected stays, with its ads,
  so what those ads brought keeps its name, and connecting the same account again finds its row. A platform's account
  is held by one workspace while it is connected or its access was only taken back by the platform; the owner's
  disconnect lets it go.
- **`standing` and `config` are the platform's facts, not the checks.** `standing` holds typed words for what the
  platform says of the account itself (for Meta: whether it is active, and whether it has a payment method). `config`
  holds the platform's ids and facts beside it: the business, the Page the ads run as, the number that Page is linked
  to, the account's own spending limit. The five checks a card draws (the plan's G2) are read from the two in one
  place in contracts, with what Chanlytics knows itself: which number AI answers.
- **An ad's `door` is wider than the three an ad made here can have.** An ad found in the owner's account can open a
  website, Messenger or an Instagram chat. The column says what a tap opens (`whatsapp`, `instagram`, `messenger`,
  `call`, `form`, `website`, `other`), and a page counts people only where the tap ends in a message Chanlytics
  receives.
- **The budget an ad sits under** (the plan's C1) is five columns: its kind and amount, what the platform says is left
  of a total, whether the campaign or the part under it holds it, and whether other ads spend from it.
- **Three words, and two moments.** `status`, `intent` and `platform_state` are as drawn. `intent_at` and `told_at`
  say when the owner last asked and when the platform was last told: an ask newer than the telling is on its way,
  which is how a change made inside Meta's thirty seconds for one ad is kept and sent later.
- **Not in this file.** The offer's snapshot, `copy`, `area` and `approved` arrive with the step that makes an ad here
  (0050, P2), and so does `ad_objects`. `ad_days` holds no reach: it is not additive, and reading it costs a call of
  Meta's small allowance that nothing draws yet.
- **An entry and its ad are joined when read,** by the platform and its own id for the ad, which both hold.
  `ad_entries.ad_id` stays unwritten, so an entry keeps its one writer (0031).
- **Kept 25 months** is a promise once something removes a day at that age: the purge arrives with the read that first
  writes a day, and `RETENTION_DAYS` names it then.

## As built, 19 November 2026 · Connect

The second part of step P1 (`supabase/migrations/00649_an_owner_connects_their_ad_account.sql`, the edge's
`lib/ads/`, the dashboard's `src/server/ads/` and the card in `src/surfaces/campaigns/ads/connect/`). An owner presses
Connect, signs in at Meta in Meta's own window, and the card says which ad account and Page were found and what each of
the five checks reads. Where it is not as first drawn, it is said here.

- **Meta's window, and the page behind it waits.** Connect opens Meta's sign-in in a window of its own, with the app's
  saved sign-in for ads. The Ads page stays where it was and the card says it is checking; when the window closes the
  card reads again. A browser that opens no window is taken to Meta in the same tab and comes back to the same page.
- **Three doors write the account,** each with its event in the same transaction, each the service role's:
  `ad_account_connect` (the owner's sign-in and, where two accounts could both be meant, their answer),
  `ad_account_read_keep` (what a look at Meta learned) and `ad_account_revoked` (Meta took access back). The connect
  door asks the `ads` permission itself, whoever knocked.
- **Which account is meant** is decided on the edge (`lib/ads/pick.ts`): the Page is the one the business shared, or,
  of several, the one whose WhatsApp number is the number AI answers; the account is the one that has run that Page's
  ads. Only where two accounts are left is the owner asked, once, and the row waits as `choosing` until they answer.
- **An account another workspace holds is refused,** in words that say where to disconnect it. A second account beside
  one connected is refused too: changing accounts is Disconnect, then Connect.
- **Every call to Meta is sent once.** The ads interface counts every call against a small allowance (60 points an
  account, decaying over five minutes), so a call that fails is not sent again by the client: the account keeps what
  Meta said of its pace (`usage_pct`, `read_after`) and nothing asks before `read_after`. It has its own breaker name
  (`meta_ads`), so a slow ads interface never holds back a customer's message.
- **Money is converted in one place.** Meta counts some currencies in other units than the standard does (whole pesos
  for COP, hundredths for BHD). The wire (`packages/channels/src/ads/meta-account.ts`) converts to the standard's
  minor units, and nothing after it sees Meta's.
- **"Link them" opens Meta.** Linking a Page to a WhatsApp number needs a code Meta sends to that number, so it is not
  one press of ours. The card opens Meta's page for it and looks again when the owner is back.
- **Meta's call when an owner removes Chanlytics** (`apps/edge/api/ads/deauthorize.ts`) is signed with the app's secret
  and names the person at Meta, never the account. Every account that person connected is marked signed out, and the
  next read of each confirms it.
- **Where Connect shows** (D7) is a list on the edge, `ADS_WORKSPACES`, beside the saved sign-in's id
  (`META_ADS_CONFIG_ID`) and the address Meta returns to (`META_ADS_REDIRECT_URI`). With any of the three unset the
  card says the account is not connected and offers nothing.
- **Activity has a family, Ads,** for the account's events and the presses to come.
- **The saved sign-in asks five permissions** (`ads_read`, `ads_management`, `pages_manage_ads`,
  `pages_read_engagement`, `pages_show_list`; made 19 November at Meta, ad accounts required, Pages not) and not
  `instagram_basic`. So a Page's Instagram account is asked only where the sign-in may read it: asked without the
  permission, the field can cost the whole answer. Where it may not, the card says nothing of Instagram.
- **An account is asked only what those five reach** (the first real Connect, 19 November). Asked for the business that
  owns it (`business{id}`), Meta refused the whole answer ("Requires business_management permission to access the
  field"), and its reference page says nothing of that. The business is the sign-in's own (`/me`'s
  `client_business_id`), kept with the token and on the row at Connect; a read writes its config key by key, so it
  stands. `business_management` is not asked for: the product needs none of what it gives.
- **A shared account Meta would not describe is not "none shared".** Where Meta refuses the list of what was shared, or
  refuses every account on it that could be the one meant, Connect answers `accounts_unreadable` and the card says it
  couldn't read the ad account, with Connect again; only where every shared account was read and none can run ads does
  it say Meta shared none.

## As built, 19 November 2026 · Money has one count on every runtime

Call 9 keeps an amount as whole minor units of its currency. `minorPerUnit` (contracts `ads/money.ts`) first read how
many make a unit from the runtime's own currency table (Intl). That table moves between versions: the forint and the
Colombian peso hold a hundred in the data Node 22 ships and one in Node 24's, which CI showed on this step's first
run. An amount is kept by one runtime and read by another (the edge writes what an ad spent, a browser of any age
says it), so an amount kept under one count and read under the other would be a hundred times off. The rule is now
ISO 4217's own list, written in the module: the same on every runtime, before any real amount is kept. Nothing changes
for a currency every table agrees on (the dollar, the euro, the pound, the yen).

## As built, 19 November 2026 · Reading

The third part of step P1 (`supabase/migrations/00650_an_account_s_ads_are_read_on_a_clock.sql`, the wire in
`packages/channels/src/ads/meta-read.ts`, the read in `apps/edge/lib/ads/`). A connected account's ads appear on their
own, with what each spent, and stay true without anyone pressing anything. Where it is not as the Shape first drew it,
it is said here.

- **Each account is its own job, `ad_read`.** The clock (`ads-sweep`, every five minutes, only while an account is
  connected) reads no platform: it hands each account whose row says a read is due its job, one an account, an hourly
  read spread over five minutes by a hash of the account. The three paces are one read at three depths, chosen by the
  account's own row: every hour the three days Meta is still counting; every fifteen minutes while an ad is being
  checked or is in its first two days; and once a day, at four in the morning in the account's zone, the last fourteen
  days, which marks the days before them settled. An account's first read looks back thirty days.
- **One door keeps a read, whole or not at all** (`ads_read_keep`): the account's facts, each ad, each day, the days
  now settled and the next read's time, in one transaction. A read that stops part way writes none of it: the account
  keeps why, the page keeps its last good numbers, and the read is due again in fifteen minutes or when Meta allows.
- **A read that keeps failing is tried less and less often.** Its next try waits half as long as the account has gone
  without a good read, from fifteen minutes up to a day, read from the account's own row (nothing counts the tries).
  A call Meta refuses counts against the app, so one it will keep refusing is not sent every quarter of an hour. A
  good read, or the owner's own look from the card, starts the hourly pace again, and the card's look asks for the
  ads' read at once where the reads had been failing.
- **A connected account whose token is not kept is marked signed out** (`how: no_token`): no try mends it, and the
  page then says the one thing that does, Connect again.
- **The most one read takes** is five hundred ads and three thousand ad-days. Past either it keeps what it read and
  says what it could not vouch for (`cut` on the read's line): whether an ad has its budget to itself is left unsaid,
  so it is never turned back on from here; and the days are left open, never marked settled, so a figure built on them
  says "so far". The hourly read's three days always fit.
- **Which ads are adopted** (the plan's G3): every ad Meta lists that is not archived or deleted, up to five hundred;
  every ad this workspace already holds that the list no longer names, asked for by name, so one archived since says
  so; and every ad a day in the window names, so one that ran and was archived is still counted.
- **The budget an ad sits under** is read from the ad set, or from the campaign above it where the ad set holds none.
  It is shared where another ad that is not gone sits under the same holder.
- **What the owner asked of an adopted ad follows Meta** (on, paused, ended), unless a press of theirs here is still on
  its way to Meta: that press wins until Meta is told.
- **A day** holds what the ad spent, how often it was shown, the taps that opened what it leads to, and Meta's own
  count of what the ad asks for: the chats it says were started for an ad that opens a chat, the forms for one that
  opens a form, nothing for any other.
- **Meta's pace is kept, not tested.** Every answer's usage figures are read. At three quarters of an allowance the
  read stops before its next question, so what is left is there for an owner's press. A call Meta slows ends the read:
  the account keeps the moment before which it is not asked again, the job ends well, and nothing sends the same calls
  twice.
- **Meta's notices are heard at `/api/ads/meta`,** believed only under Meta's signature. A notice only says where to
  look: the account it names is asked for its read, no sooner than two minutes after its last, and what changed is read
  from Meta, never taken from the notice. An account is subscribed by its daily read, where its sign-in may change ads.
- **The clock holds each workspace it hands a read to.** Its one statement takes, first, the lock a job's own
  reference to its workspace takes. A workspace being removed at that moment is passed over; without it, one workspace
  leaving in the same instant refused the statement, and with it every other account's read for that turn (CI met
  this on 19 November, between two suites).
- **A read that waits is brought forward, never doubled.** One read an account waits or runs at a time. Where a notice,
  a press that Meta will take in thirty seconds, or a change Meta gave no answer to asks for the read while one waits
  for a later moment (the clock spreads an hourly read over five minutes; a failing one waits longer), that read's
  time is moved up to the ask's.
- **`ad_days` is not on the live feed.** The Shape drew it as a table notice of its own. A read moves the account's
  `read_at` in the same transaction, and a page that hears the account reads the days again: one notice a read.
- **Events.** `ad.state_changed`, only where Meta's word for an ad moved. An ad seen for the first time writes none: a
  hundred adopted ads are not a hundred lines of Activity.
- **Kept 760 days**, about 25 months (`RETENTION_DAYS.ad_days`, `purge_ad_days` nightly, said on the privacy page).
- **Not built here:** reach, which is not additive and nothing draws yet. And one real hourly read of a real account
  has not been timed: that waits for the saved sign-in, and is owed before the loop is relied on (the plan's 6.6).

## As built, 19 November 2026 · The page, and Reports

The last parts of step P1 (`supabase/migrations/00651_the_ads_page_counts_the_people_an_ad_brought.sql`, the readers
in `apps/dashboard/src/server/readers/ads-page.ts`, the page in `apps/dashboard/src/surfaces/campaigns/ads/live/`).
With an account connected, Campaigns › Ads is the owner's own ads: each with where it stands, what Meta says it spent,
who Chanlytics counts it brought and who of them booked. Where it is not as first drawn, it is said here.

- **The people are counted in the database, whole, and they are Reports' people.** `ad_people_in` is the one place the
  page's people come from: a first moment in the window, reached the business in it, alive, not merged away, first
  touch an ad. That is the set `people_series` counts under "An ad", written the same way, and a database test holds
  the two equal: the page's ads plus the unnamed line is Reports › People's number.
- **Every one of them is on the page, whichever ad holds them.** An ad the counts name that the account's list of
  five hundred did not hold is read by its id and listed. An ad of an ad account the workspace connected before this
  one is not this page's to list, and its money may be in another currency: its people are counted in the head and
  said on one quiet line of their own ("came from an ad in an ad account you connected before this one"), and its
  spend is in no sum.
- **Booked is read from the visits record** (`appointments`, decision 0002), which holds the calendar feed's visits
  too: a visit that starts after the first touch and is neither cancelled nor only asked for, theirs by the record's
  own link or, where a visit names no person, by its number or address. A workspace with no visits in the record
  shows no bookings.
- **Two readers, not six.** `adsPage` answers the page, an ad's drawer and Reports › Ads from one read, so the three
  cannot disagree; `adPeople` lists one ad's people, fifty at a time. `adAccounts` and `adChecks` are the card's one
  reader (`adAccount`).
- **The page is a new, small one beside the mockup, as the canvas draws it,** not the mockup re-fed: the mockup's model
  is built on an ad made here (its offer, its area, its words), which an ad found in Meta does not have. A demo
  session still draws the mockup. The mockup's pieces the plan lists to remove are not removed yet.
- **A page counts thirty days,** the same thirty wherever it is drawn. Reports › Ads does not follow the report's
  period yet.
- **The page reads when it opens, when the owner comes back to the tab, and after a press.** It does not hear the
  live feed yet: the tables are told (00650) and the kinds are declared, and registering the surface is owed.
- **An ad's name** is its own once Chanlytics holds it (`ad_named` reads `ads.name` first), so a person's page, the
  report and the Ads page say one name.
- **Not built in this step:** AI's one line and the amber line for who is waiting (they arrive with the step that
  makes an ad, and with 0048's waits), the page's keyboard cursor, and "their numbers" beyond spend, shown, taps and
  Meta's own count.
