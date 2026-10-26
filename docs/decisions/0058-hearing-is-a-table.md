# 0058 · Hearing is a table

**Status:** Built on the lane `wiring/hearing-is-a-table` from main's `ca41d8e6f`, 13 October 2026, and merged in #1583:
lane R4 of the
wiring's second audit (`Claude Video/docs/2026-10-12-chanlytics-wiring-second-audit.md`, findings S3-8 and X2-4),
taken up as the next lane after R1, R2, R3 and R12 merged (Ruben, 13 October 2026: "continue where the other agent left off"). Amends 0047, point 4 (the coverage test) and the rule behind
`onlyOnItsPage`. The number is the next free one after the lead workbench's 0057. Where this note and the code disagree,
the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

0047 made a surface declare the kinds of record it draws, and a coverage test follow its reads to their tables. The
second audit (12 October 2026) found three places where the rule was a list nothing showed whole, or a reason nothing
checked:

- **Which page hears what was a rule over three lists**: the pages that own what they draw, what each leaves to its own
  page, and the panes that read another page's surface. To learn whether a person's page hears People's rows, you had to
  run the rule in your head. A person's page, Campaigns' home and Connections draw records they never hear, and nothing
  showed it.
- **The coverage test's baseline held its pairs under reasons nothing checked.** When the audit read it on 12 October
  2026 it held 184:
  - 148 of the pairs sat on tables the feed already carries.
  - Six of the reasons were false: People "does not draw" lines and mailboxes; the Campaigns home "forgets" on a consent
    write.
  - An `omit` counted as covering a table the surface's own routes read, which is how People's false omit got through.
- **A read made outside a registered surface was held to nothing**: a person's page, a run's sheet, Settings › Activity.

## Decision

1. **A page's hearing is a row.**
   - `PAGE_HEARS`, beside the registry's other tables in `apps/dashboard/src/legacy-bridge/surface-registry.ts`, names, for each family of addresses, the surfaces
     whose page it is. Those surfaces hear their page-only kinds there and keep them for their page elsewhere.
   - `routeFamilyOf` (surface-registry.ts) makes an address a family:
     - a person's page on any tab is one;
     - a Reports lens over any days is one;
     - a Settings pane with any row after it is one;
     - Settings with no pane is the pane it opens;
     - anything else is its page.
   - `ownsTheScreen` reads the table.
   - Every family the registry names has a row (its routes, its draws, a person's page, Leads' scope, an address that
     moved). A row holds its family's own surface.
2. **The table was written from the rule and held equal to it before the rule went.**
   - The table and the old rule were compared on 98 addresses: every shape the address registry opens, a person's every
     tab, odd params and unknown words. 0 differ.
   - The lane's review found one more address, the word `person` where a person's id goes. It is People's, as it was, and
     is pinned.
   - Nothing changed on screen.
   - From here, two tests hold the table:
     - the addresses whose family is not their first word are pinned to their family (`FAMILY_OF`);
     - each family's golden records whose page it is, as `ownsTheScreen` answers there.
3. **Each page has a golden**, `tooling/scripts/tests/baselines/hearing/<family>.json`.
   - It holds the surfaces that own the family's address, as `ownsTheScreen` answers there.
   - For every notice the feed sends, one line: the surfaces it reads and the GET routes their modules name. A message's
     update is split by its status, and a call's turn is apart from its end.
   - A cell changed is a line changed in review, with its cost in reads. `UPDATE_HEARING=1` writes them.
   - `borrows.json` beside them holds, for each folder of pages and for the modules at the pages' root, the surfaces it
     draws. That covers `useSurface`, `surfaceValue` and `useMoved` (one key or a list) and the window globals an
     override publishes (read as a property or named in a string).
4. **An omit covers nothing.** A table a surface's own routes read is covered only by the surface hearing it. The eleven
   pairs this brought to light are in the baseline.
5. **Every exception in `reads-not-heard.json` says what kind it is, and what it claims is checked:**
   - `seat`: the caller's own seat and what is private to them (the test checks its tables);
   - `account`: the workspace's row, its plan, the partner's account, or other workspaces' rows (the test checks its
     tables);
   - `unfed`: the feed does not tell the table (the test checks it is not WATCHED), with what reads it again or the
     finding owed it;
   - `over-read`: read and not drawn, with the DTO field it feeds, which the surface's own module never reads; or drawn
     only as it rides with a table the surface hears;
   - `owed`: drawn and not heard, naming the finding or the lane that closes it. The owed pairs are counted in the file,
     and the count may only fall.

   A group's `rereadAfter` names writes whose refresh row must re-read the surface. Its `heardWith` names tables the
   surface must hear.

6. **Every GET route the browser code names is a registered surface's, or `baselines/on-demand-reads.json` lists it**,
   with its kind, how it stays fresh and why that is enough. The kinds are `link`, `search`, `boot`, `surface`,
   `on-open` and `owed`; a `surface` read is a helper a registered surface's module imports, and the test checks the
   import. The list may only fall.
7. **The tracer lives at `tooling/scripts/trace-routes.mjs`**, where a generator can reach it (lane R7 derives what a
   write changes from it). It also names the surfaces the shell registers and the module each comes from, so no test
   keeps that list by hand.

## Calls made here, each with its undo

- **The table is in the surface registry, not a module of its own.** The audit named `surface-pages.ts`, but
  `legacy-bridge` is over its count of modules (tree-shape.json); the registry is where the routes' other tables are. It
  moves out with the folder's split by domain.
- **The tracer is a module at `tooling/scripts`' root, not in `lib/`.** The audit named `lib/`, but a folder earns its
  place at its second module. It moves into a folder with its second sibling.
- **A cell names a surface, not a surface's kinds.** Kind-aware cells came with their first user, Campaigns' home in lane
  R5b (amended below).
- **The audit's age bound on unfed tables (`maxAgeMin`) is not written.**
  - A number nothing enforces is the kind of claim S3-8 found false.
  - An unfed group says instead what reads it again (`heardWith`, `rereadAfter`), which is checked.
  - The bound comes with lane R9's rolling heal, which is what would enforce it.
- **A golden counts routes, not requests.** A surface's read may ask fewer routes than its module names, and People
  walks its pages. "Routes" is the most a read asks, never a guess at less.
- **The borrow scan is kept by folder, not by family.** Which family a folder of pages draws is the routes' to say, and a
  map from folders to families would be one more list kept by hand. R5 and R10 read the scan beside the goldens.
- **An over-read's field is checked in the surface's own module, where the read lands.** A whole folder of pages uses
  the same words for other things (`counts` is also a sentence's), so a folder-wide check would fail on words, not on
  reads. A page reading the field through the published value is the review's to see.
- **The families come from the registry's own tables** (its routes, its draws, the moved addresses, a person's page,
  Leads' scope). The address registry's shapes and a person's tabs are checked to land in them. A new address that hears
  like its page (a lens with no read of its own) needs no row, and one that hears differently has a draw, and so a row.
- **Two answers of the old rule are kept, and left to R5:**
  - a pane Settings does not list hears less than Settings with none;
  - a review opened by an id the lens does not parse falls to the Overview.

## Tests

- `shell/hearing/page-hears.test.mjs`: the families, the pinned addresses, the rows, the goldens and the borrow scan.
- `shell/hearing/reads-are-heard.test.mjs`: the kinds and the claims.
- `shell/hearing/every-read-says-how-it-stays-fresh.test.mjs`: the reads outside the surfaces.
- `shell/hearing/a-route-is-followed-to-its-tables.test.mjs`: the tracer and `registeredSurfaces` on a repository in
  miniature.

## Amended on 14 October 2026: a person's page hears its person (R5a)

- **A person's page is a surface of its own** (`personOverride`, people-detail.ts): the one person on screen, read again
  when what the page draws of them that People hears on its own list alone changes. That is the person, a hold, a call,
  a run, the campaigns, the rules, the facts, their business and a reach-out reply. It closes W-thread-wait-step-1,
  W-person-list-lead-1 and W-review-facts-rules-7.
  - Its family's row is `clients/person: ["workspace", "person"]`. People's whole book is still not read again for one
    person.
  - A row made now (a lead run's leads, an import's people) is not the person on screen and reads nothing. Neither does
    a live call's transcript turn.
- **A take-over, a hand-back, a snooze and a wake** move no message clock. The page reads its person again when a thread of
  theirs the Inbox held stands otherwise, in the fields the Inbox's own derivation wrote (their-thread.ts).
- **A new claim, `heardBy`, in `reads-not-heard.json`:** an over-read drawn only as another surface that hears it on this
  surface's page reads the page again. The test checks that the named surface hears the table there. A person's visits,
  deals and steps are People's (heard on every page). Their messages and threads are the Inbox's.
- **The person's read is a registered surface's now**, and it left `on-demand-reads.json`.
- **The owed count rose from 121 to 125** with the new surface's honest rows:
  - the roster's names, People's and Sent's;
  - the search names a business card shows (R5: a search's name told apart from its members);
  - the mailbox a lead's emails left from (R6).

## Amended on 14 October 2026: Campaigns' home hears what it counts (R5b)

- **A cell may name kinds** (`PageCell = true | RecordKind[]`). This replaces "a cell names a surface" above. A page that
  draws part of what a surface counts hears what moves that part, and leaves the rest to the surface's own page
  (`ownsTable`).
  - The first such cell is Sent's runs on Campaigns' home:
    `broadcasts: ["person", "facts", "rules", "channel", "billing", "visit"]`. These kinds repaint who can hear you, the
    pause on offers and the send-once composer.
  - A message, a thread or a hold is left to Sent. The home reads its replies from its own 30 days, so a message there
    never re-reads the runs and every page of People behind them.
- **What a surface let pass is kept by table** (`missedWhileAway` holds the tables, or `"all"` for a pass kept whole).
  The page that owns one of those tables reads it once as it comes on screen. A message the runs let pass on Campaigns
  waits for Sent. A person's answer they let pass on Today is read as Campaigns comes back.
- **The pause line and Today's runs read one source.**
  - The home's pause line reads the playbooks' reading first (contracts `readyOf`), as the channels line does, so a pause
    by the gates reaches it while the home is open.
  - Today's runs take `paused` from Today's own standing, the flag its band reads, and fall back to Sent's reading.
- **Campaigns' 30 days and the Campaigns lens hear a person's answer.** That is an update of a person, never a person made:
  the feed tells an answer as an update, and a person made would read the dearest of the lenses for every arrival. The
  owed group W-person-list-lead-8 left the baseline, and the owed count fell from 125 to 123.
- **Closed:** W-review-facts-rules-2, W-campaign-run-template-reachout-1, W-person-list-lead-2, W-person-list-lead-8 and
  S3-2.
- **Left, each with its reason:**
  - The Calendar's cells (W-person-list-lead-6, W-thread-wait-step-7, W-visit-deal-2) waited for the Calendar's own lane,
    which rebuilt the visit panel they draw (#1585). They landed in R5c, below.
  - Today's People cell is R10's: its cost is the heaviest read there is, and R10 weighs it on the numbers.
  - Delivered and read ticks (S3-5) are R9's: the runner has no quiet window by status, and a tick per message would read
    Sent's ledger once per receipt.

## Amended on 14 October 2026: the rest declare what they draw, and the bell reads nothing (R5c)

- **Setup is heard where its rows are drawn** (`fresh: "its-page"`).
  - Its rarest records stay heard on every page, plus the team (`always`): a channel, the plan, Google's profile and
    listing, a call ending, a seat or an invitation. Today's card is Setup's.
  - What its rows state is heard on Start and Today's card, and kept for them elsewhere: the templates' verdicts, the
    settings and the rules, a visit, a person's answer and their deals (who can receive an offer, `offers_email_reach`).
  - The first WhatsApp message is a message or a thread made while the number is on and none has arrived
    (`awaitsFirstMessage`). It is closed while Setup is unread, and for good once one has arrived, so a busy workspace
    never reads Setup for a message. Its read is the whole workspace's, so a burst is read once it quietens, and at least
    every ten seconds while it lasts.
  - Connections draws Setup's calendar row, and hears what moves it there (`setup: ["facts", "visit"]`). Its WhatsApp
    row is worded from Settings' channels read, which hears no message yet (S3-1, R6).
  - It no longer hears the bell's rows: its read never read them, and each cost two routes on every page.
  - A person erased reads Setup where it is drawn (refresh-map.ts `setupIfDrawn`).
- **Settings hears runs and playbooks where the Library is drawn** (`fresh: "its-page"`, its own kinds `always`).
  - The Library says what sends each message and how many it sent. Its page and Settings' panes hear a run or a playbook
    move: a page's own surface is whole on its row, so a pane pays for it too.
  - Campaigns' home hears them too: a message's drawer there is the Library's pane, which says what sends it.
  - A Google link, refresh or unlink made from Connections reads Settings too: whether the listing has a review link is
    a fact of its read (S1-4, the writer's tab).
- **The rules are heard where a rule is drawn.**
  - Google's surface and the Reviews lens hear it (a review reply's choice to draft), and so do the reach-outs (a
    chain's mode).
  - Five pages read the rules only through the book's reply modes (`everyone()`, `effective_reply_mode`) and never draw
    one: the Calendar, Reports, the headline, the People lens and the Receptionist lens. They are an over-read, checked
    by the field, not owed.
- **The board hears a person changed** (`person`, still `live`: one read, a few a day). A stop takes "Text the link" off a
  visit at once. A person made is no visit's until the next read matches them.
- **The other surfaces:**
  - Conversations hears a call starting, ending or filed again (not a transcript turn).
  - Today's headline hears the calendar settings its booking line reads.
  - The composers hear the lists To offers, and so does Sent's cell on Campaigns' home.
  - People hears a run on its page (Follow-up to approve), and a reach-out's reply on every page (the signer the Inbox
    thread a bell row opens offers, from People's rows). An open person's page reloads with People's read, so the
    person's own surface no longer reads a reply (`heardBy`).
  - The Campaigns lens hears the templates its paused and rejected tile counts.
  - Today's queue redraws on a reach-out reply read (no read).
- **The bell reads its rows and nothing else** (S10-8). `notice-re-reads.ts` is gone: every table its four kinds were
  about is told (00408) and heard by the pages that draw it, so a row only read them a second time.
  `a-bell-row-s-news-is-heard-where-it-is-drawn.test.mjs` runs each kind's change through the pages that draw it, and a
  kind the edge adds without a line there is a red build.
- **The owed count fell from 123 to 93.** Setup's reads of the book's holds and steps joined the book's group, and the
  rules' five pages became an over-read.
- **Closed:**
  - S3-4, S3-6, S10-8 and X3-2;
  - W-review-facts-rules-4, -5 and -8;
  - W-person-list-lead-6 and -7;
  - W-channel-team-plus-2;
  - W-campaign-run-template-reachout-2, -5, -7, -9 and -10.
- **Closed in part:**
  - S4-3: the holds and steps Setup reads are People's book, R5's book group.
  - S1-1: the signer is heard; the thread's own read carrying it is not built.
  - S1-4: the sweep's rare link waits for Settings' next read.
  - W-thread-wait-step-7: a first message's thread link on the board waits for its five-minute read, in the book group.
  - W-visit-deal-2: a stop takes the link off at once; the WhatsApp window judged at draw time waits, bounded by the
    board's five-minute read.
  - W-thread-wait-step-3: Start and Today's card follow the first message; Connections' WhatsApp row is Settings' channels
    read (S3-1, R6).
- **Left, each with its reason:**
  - X2-1, X2-2, X2-3 and W-campaign-run-template-reachout-8 are not declarations: a sheet, a pane and a door that read on
    their own clocks, lane R5d.
  - W-person-list-lead-5 (People hearing a lead) is R10's: leads are told on every batch of a lead run, so People's book
    would be read every few seconds.

## Amended on 14 October 2026: the sheets and panes that read on their own clocks follow what moves them (R5d)

None of these is a surface: each is read as a person opens it, about one run, one search, one lead or one chain, or a log
the feed never tells. Each was then kept as it was first read.

- **A run's sheet follows Sent's runs while its report can still move** (contracts `runStillMoving`): while the run is
  underway, and for the reply window after it ended, as the replies, yeses and stops counted to it arrive. It stopped
  following at the last send (X2-2). Its delivery ticks are read with the next of those (R9's quiet window).
- **A reach-out's open parts follow Leads and the reach-outs** (`read-again.ts`, `useReadAgain`). These are the Leads
  door's count and the sheet's, painted from the last read and read again behind (X2-1). They are also the lines under a
  lead's stage, the lead's story in the peek, and a chain's report open on Campaigns (W-campaign-run-template-reachout-8).
  - Each is read again at most once in thirty seconds, and once more as the window ends for whatever was heard inside it,
    so the last change of a burst is read too: Leads' lines used to drop it.
  - A read again that fails leaves what was read standing.
- **Settings › Activity reads its first page again each minute while open, and as the tab comes back**
  (`settings/activity/newer.ts`). The events and the decisions are on no feed. What is newer is offered above the lines
  (the kit's Notice, "Newer activity · Show it"), never moved in under the reader (X2-3).
- **`on-demand-reads.json` owes nothing now.**
  - The run's sheet is a read that `follows` a surface, a kind added here. It names the surface, and a module beside it
    must hear that surface's event.
  - Activity is `on-open`, with its minute.
- **Closed:** X2-1, X2-2, X2-3 and W-campaign-run-template-reachout-8.

## Amended on 14 October 2026: the silent records are told, and one read of the channels (R6)

- **00431 tells four records the feed held back or told too much of.** Each update is narrowed as 00408's are: told when a
  column a page draws moved, never for a stamp.
  - **A mailbox:** told when it is made, and when its address, its sender, its reply mode, its pause, Gmail's forwarding
    code or its intake's error moved. Not the stamp every email puts on it.
  - **A review:** told when it is answered, by the receptionist, a teammate or on Google. Today's line, the bell's "New on
    Google" and the Reviews lens close at once. Not the sync's stamp on every review.
  - **A lead round:** told when its state, its question, its wait or its ending moved, never for its counters. A search no
    longer reads Today and Leads again every few seconds, in every tab.
  - **The workspace's own row:** told when its name, zone, buying model or logo moved, beside its status.
  - `packages/db` realtime.ts says the narrowed columns once (`narrowedUpdates`), and the database test holds the triggers
    to it instead of a copy of its own.
- **The channels are one read** (`surfaces/channels/surface.ts`, live). Settings, Live and both composers each read GET
  channels for themselves, and Settings heard none of its tables. So a number Meta flagged, or a line that finished setting
  up, stayed as first read on the very page the bell's row opens.
  - Connections' WhatsApp and phone rows, the Library's number notice and a message's drawer read the channels value.
  - Live and both composers follow it (`followChannels`): each is made again of it as it is published, so a page read
    beside it for the same notice never keeps an older number.
  - Connections takes when a customer last came in as the later of the channels read's time and Setup's, which hears the
    first call and the first message (X3-3).
  - The composers read neither the channels nor the settings for themselves any more: their number, the business's name
    and links follow the two reads (S10-9). Sent asks 3 routes where it asked 5, the playbooks 1 where they asked 3.
  - Settings hears the channel rows, the line and the listing on its pages (the Business pane's facts, the review link),
    and Sent's and the playbooks' pages hear the listing for it (`settings: ["review"]`).
- **The false omits are gone:**
  - People hears the text line and the mailbox its reach is counted against.
  - Today hears the mailbox its email chip draws.
  - Setup hears its Email row's mailbox.
  - The Calendar hears the mailbox its Business tab's forwarding code is kept on.
- **Leads hears on its own scope** (`its-page`), and is kept for it elsewhere.
- **The carriers' hourly sweep writes a line only when its answer moved.**
- **A zone or buying model saved reads Sent's composer and Campaigns' 30 days where they are drawn** (S4-5).
- **The owed count fell from 93 to 84**, by hand: the check run banks it, with the goldens. The channels read's "last came in"
  times are owed to R9's age bound.
- **Closed:**
  - W-channel-team-plus-1, W-channel-team-plus-3;
  - W-review-facts-rules-1, W-review-facts-rules-3;
  - S3-1, S3-3, S4-1, S4-4, S4-5, S10-5, S10-9;
  - X3-3.
- **Left, with its reason:** S4-6 (the readiness and consent writes read the composers where they are drawn). It is cost
  alone, and it moves every pin of every readiness and consent write, which only a run of the tests can hold. It goes with
  the check run.

## Amended on 14 October 2026: a write is its own notice (R7)

- **A write reads what the page on screen draws, and leaves the rest for the pages that draw it.** The write path has its own
  rule (surface-registry.ts `drawsTheScreen`, `drawnHere`): a surface the page's family owns (PAGE_HEARS) or its route
  draws beside its own (ROUTE_DRAWS), read at once; any other, left until a page that draws it comes on screen or is
  reached for (readWhatWasMissed, warmWhatItDraws), read there once. Not `whereDrawn`, whose keep waits for a surface's
  own page: Today draws Sent's runs and the playbooks' counts and owns neither, so a visit marked on the Calendar would
  have left Today's day strip on the old count.
- **Campaigns' two composers are read where they are drawn** (`composersIfDrawn`): a yes or a stop, a person's details, a
  deal, an import, a list, a visit marked, a channel opened, a settings save, a mode saved and a zone or buying model
  saved each read them on Today, the Inbox (Sent's runs), Campaigns, Sent and the Library, and leave them elsewhere. A
  settings save made on Settings read twelve routes, four of them for pages nobody had open; a visit marked on the
  Calendar waited for both composers before the press let go (S10-6). People's reach and rows are read as before.
- **A mode saved reads the Reviews lens where it is on screen and forgets it elsewhere, and People's rows on People's
  pages** (W-review-facts-rules-9). The rules' notice is one per save with no row, so every tab's Settings also reads a
  person's own mode: accepted. The `person_mode` rate holds those writes to a person's pace, and a notice that said its
  scope (the workspace or a person) would be the way to tell them apart, if it is ever wanted.
- **A zone or a buying model saved reads the Calendar where it is drawn** (its times and its "today", and Today's day card
  drawn from it), **and a settings save reads Today's headline where Today is on screen** (its Booking gap reads the
  calendar link and the zone): W-visit-deal-4. The baseline's group that said "PATCH workspaces re-reads the pages that
  draw them" of fifteen surfaces is split: the three the write does not read (Leads, the reach-outs, a person's page) say
  so in a group of their own, and a test now holds every reason that names a write to the write's row (reads-are-heard).
- **Stage A: the rows are derived and set beside the hand rows** (a-write-is-its-own-notice.test.mjs over
  _write-reach.mjs). What a write changes is the tracer's; what a change reads is the runner's own router's. For every row
  and every family of addresses, the surfaces its own notice would read against the ones its row names, kept as a golden
  (`baselines/writes/reach.json`, by UPDATE_HEARING=1): `extra` (named, reached by no change), `door` (reached only through
  an edge door) and `missing` (reached, not named: the feed's notice reads it a moment later). A narrowed table's update
  is a tell unless listed as a stamp, with why: the tracer sees no columns.
- **Stage B: production says what each request touched.** The database client notes each table a request's calls touch
  and how, and each SQL function it calls (packages/db `touchOfCall`, channels `noteTouch`); one answered line in twenty
  carries them, with the method and the page it was asked from (`route_answered`: `tables`, `page`; names only). A
  script reads a file of them (tooling/scripts/ops/write-shadow.mjs): the tables a route touched that its trace does not
  name, and each sampled write's derived reads against its row on that page. A week of it is stage C's evidence.
- **The table has a module of its own**: `PAGE_HEARS` is in `apps/dashboard/src/legacy-bridge/hearing/page-hears.ts`, which the
  registry imports and re-exports, so the registry keeps the rules that read it under the file limit.
- **Stage C is not built.** It replaces rows cluster by cluster (threads, people, campaigns, settings, setup, leads) with
  the derivation where the golden and the shadow week explain every difference, and keeps the hand rows with the
  derivation as their test where they do not.
- **Closed:** W-visit-deal-4, W-review-facts-rules-9, S10-6, and R6's S4-6 (the readiness and consent writes read the
  composers where they are drawn).
- **Left, with its reason:** the trace does not enter `tenantFacts` (server/tenant.ts, a file of the wrapper), so it sees no
  read of the zone under the Calendar's read; the zone's re-read of the Calendar is listed as explained (reads-are-heard
  `NOT_READ`), owed to the trace. Today's day strip and the home's composer do not hear a teammate's visit or answer on
  Today (the playbooks and Sent's runs are not Today's), a live-feed gap the audit names apart from these.

## Amended on 14 October 2026: time is a notice (R8)

- **The runner keeps one clock** (`apps/dashboard/src/legacy-bridge/hearing/clock.ts`, started with the surfaces). What a page
  says of the clock moves with no record changing, so no notice of the feed ever told it: a visit that was "Next" under way, a
  WhatsApp window under six hours, a message an hour unanswered, a step due at midnight, a campaign past its last day. A
  surface now says how it keeps up with the moment beside how it hears its records:
  - **`rederive(now)`:** made again from what its last read held, with no request. It runs at each minute's turn while a
    page that draws it is on screen, as such a page comes on screen or the tab comes back, and wherever it is drawn or not
    once the business's day has turned since it was made. Today, the Calendar, People, the playbooks and Sent's runs have one;
    each publishes only what moved (`shareUnchanged`), and a hidden tab makes nothing.
  - **`readEveryMs`:** read again once it is that old, on any page that draws it. The Calendar's five-minute read was a timer
    inside the board's own effect, so Today's strip, drawn from the same read, was as old as its last read. A person's page
    is read every five minutes while it is open.
  - **`validUntil`:** read again once what the server made by the read's own clock stops being true. People's split of next
    and last visit is re-split at once on the rows (contracts `visitsAt`), and read again, no sooner than a quarter of an hour
    after its read, for who is booked again after.
  - **`readAtMidnight`** now covers the Calendar and the playbooks (the day's window and who a moment's run would pick), beside
    Today and its headline.
- **Whether a campaign runs is one rule** (contracts `campaignRunsOn`): on, not past its last day by the business's day,
  and its moment one that runs here. The home's reading carries it on every card (`runs`), which every page reads:
  - Sent's week ahead;
  - the Library's lists, and what sends a message ("ended — nothing more goes out");
  - Run now, and the composer's forecast;
  - Today's day strip;
  - the visit sheet's reminder;
  - People's follow-up facts;
  - Ask's rows and suggestions.

  A campaign's next run says none once its day is past the last (`nextRunLabel`).

- **Two tests hold it:**
  - `a-campaign-runs-by-one-rule.test.mjs` counts, on the syntax tree, every `.state` compared with "running" outside the
    rule's module and the lifecycle module. The thirteen files left say what theirs is for: a state written, a reach-out's
    chain, a lead search, the Calendar's per-day forecast.
  - `time-is-a-notice.test.mjs` runs the clock over a stand-in window and clock. It also holds every surface whose module
    hands the moment to a builder to a way of keeping up with it, or to a list that says why. Most of that list is owed to
    R9's rolling read: the ages of Settings' sends, the channels, Leads, the reach-outs, the replies and Setup.
- **The server's "valid until" header was not needed:**
  - People's next visit is re-split from what the rows carry, and read again by `validUntil`.
  - The Calendar's feed is read every five minutes where it is drawn.
  - The playbooks' counts are read at midnight.
- **Closed:** W-visit-deal-1, S1-3, S2-2, S2-3, W-thread-wait-step-5.

## Amended on 14 October 2026: a feed that heals, and a hidden page that costs nothing (R9)

- **One pass reads everything again** (`apps/dashboard/src/legacy-bridge/hearing/passes.ts`). It serves:
  - a return to the tab;
  - the network back;
  - the feed's first join and its rejoins;
  - a page coming in front;
  - the business's day turning.

  Each of them built its own burst, outside the boot's lanes, and a phone's resume read the same surfaces twice. The pass reads
  through the boot's four lanes, in the page's order, and remembers for each surface the moment a read must have begun after.
  A surface read since (by the pass, a notice or a write) is skipped. A pass asked for while one is out is its next round, and a
  return, the network back or a page shown meanwhile joins it at the moment it began. It reads what the runner's `readHere`
  reads: a surface read only where it is drawn, or heard only on its page, and not drawn here, is kept for its page. People,
  Sent's runs and the playbooks are no longer read at every return to Today (S2-7, S10-7).

- **The feed's first join reads what it may have missed.** The feed replays nothing from before a join, and every read of the
  boot begins before it. Once the boot is in, what tells of a customer's message or a call, was read before the join and is not
  a dear read is read once more (`caughtUpAtJoin`). The rest wait for their next notice or the rolling heal: reading all of them
  again would read the whole boot twice on every cold open (S2-4).
- **A tab that could not say its workspace joins as soon as a later read says it** (a Retry, a return). Until then it says the
  feed is down, once the boot is in. It joined nothing for good, and said nothing (S2-6).
- **A read that fails is asked for again.** A read asked for after the boot (a notice, a write, a pass) that fails is retried at
  two seconds and at ten, then left to the status line. One that lands in part stands as not refreshing, and the rest is asked
  for: `apply` answers "partial" (Today, when its calls or searches could not be read).
- **Every surface has a word on the status line.** The shell starts every surface with its word (`SURFACE_LABELS`, shell.ts),
  and `shell-status.test.mjs` holds the list to the shell's. It named a dozen; the bell, Settings, Campaigns and Leads stopped
  refreshing in silence (S2-5).
- **The rolling heal.** The clock (R8) reads again any surface the feed tells of (live or its-page, not one read only where it is
  drawn) that the page on screen draws, once its last read is a quarter of an hour old. A missed notice, a dropped one or a read
  that failed for good heals while somebody is looking. R8's list of surfaces owed a way to keep up falls to the partner's pane.
- **A hidden page reads only what says itself** (S10-3, S8-9). A page is hidden when its document is hidden, or, in the phone app,
  when its tab is behind another: each tab is a page kept open once visited, and the shell now tells each one whether it is in
  front (contracts ShellMessage `front`, `hearing/front.ts`).
  - Of what the feed tells, a hidden page reads only who is looking, the Inbox, a call in progress and the bell. Those say
    themselves in the title, the badge and the phone's icon.
  - The rest it holds, and reads as it comes back in front. Back within half a minute, with every surface live and the feed up,
    it reads only what it held; after longer, or with the feed down, it reads everything again.
  - The clock makes nothing while the page is hidden.
- **What the feed told a refresh of reaches its read** (`apply(heard)`). On a delivery's receipts alone (a message's update to
  sent, delivered or read: `deliveryTicksOnly`), the Inbox and Conversations read the threads, whose last words carry the ticks.
  They keep the holds and the calls of their last read: three requests where one tells. A read queued behind one already out
  reads everything (S10-2).
- **The dear reads wait longer for a burst.** People, Sent's runs and the playbooks name a twelve-second longest wait
  (`DEAR_READ_LONGEST_WAIT_MS`), so a sending run reads them once in twelve seconds, not every three (S10-2).
- **Live hears a turn of a call only where it is drawn** (S10-4). A call starting or ending is read wherever the tab is. A turn of
  one under way is read on Live's page, or once Live's read is five minutes old, which keeps the top bar's and Today's lines of
  the call honest while a long call runs. Elsewhere the turn is kept for Live's page. The audit asked for the heartbeat's age;
  Live's read is what carries the heartbeat, so its age is the measure.
- **A read the document's head started is as new as the page's start** (`performance.timeOrigin`), not the moment a surface
  took it. A surface that shares it is never taken for newer than it is (client/api.ts `prefetchedFrom`).
- **Tests:**
  - `shell/feed/one-pass-reads-everything-again.test.mjs` (the pass over a stand-in runner);
  - `shell/feed/the-runner-heals.test.mjs` (retries, partial reads, the joins, a hidden page, what the feed told a read);
  - `shell/feed/what-the-feed-said-narrows-the-read.test.mjs` (Conversations over a wire, Live's turn rule);
  - `time-is-a-notice.test.mjs`'s heal;
  - `shell-status.test.mjs`'s words and joins;
  - `app-bridge.test.mjs`'s `front`.

  `surface-boot.test.mjs` hears one more listener, and its feed-routing test, `message-fan-out.test.mjs` and the Reports
  lenses' runner tests run on a page on screen.

- **Closed:** S2-5, S2-6, S2-7, S8-9, S10-2, S10-3, S10-4, S10-7, and S2-4 in part.
- **Left, with its reason:**
  - S2-4's full answer is the feed's own replay from the load's start (0019 step 4), owed to a proof on the local stack.
  - The measure the audit asked for first (whether a covered WebView says it is hidden, logged through the vitals) was not
    taken: the shell's `front` says it whatever the WebView does.

## Amended on 14 October 2026: a count made of receipts is read once they quieten (S3-5), and a read writes nothing (S11-8)

- **The runner has a quiet window by status.** A surface that counts receipts rather than drawing each tick names
  `receiptsQuietMs`. A read asked by receipts alone (`deliveryTicksOnly`) then waits for them to quieten, 5 seconds
  (`RECEIPTS_QUIET_MS`), and at most 30 seconds from the first (`RECEIPTS_LONGEST_WAIT_MS`). Anything else is read at the
  surface's own pace, so a reply among the receipts is not held back.
- **The counts made of receipts hear them.** Sent's runs, the playbooks, Campaigns' 30 days and the Campaigns lens name
  `COUNTED_RECEIPTS` (delivered and read; run_counts reads them off the messages, while what was sent or failed is the
  run's own rows, heard as a send). Each hears them on its own page and keeps them for it elsewhere, as it does an
  arrival. The Inbox and Conversations draw each tick at once, as before.
- **The ideas for a first search are a GET that writes nothing and a POST that writes.** `GET lead-suggestions` says
  what was written and whether it is `due`; `POST lead-suggestions` (an owner's or a partner's, as a search is) claims, asks
  the model and keeps. The Leads page asks for the POST only when the GET says `due` and the member may find. The read
  that never writes holds it with no exception.
- **Closed:** S3-5, S11-8.
- **Left, with its reason:**
  - R10's condition is met: Today's pinned lists still count from People's last read (W-person-list-lead-3). A count that
    agrees with People's rail needs the rail's own rows, visits and context on the server, which is R10's lane.

## Amended on 14 October 2026: borrowed figures from small reads (R10)

- **Today's pinned lists are counted on their own.** `GET people/list-counts?lists=…` counts each pinned list on the
  server over the pool People's lists are counted on (`readers/audience-pool.ts` `listCounts`, `poolList`, contracts'
  `membersOf`), for the member asking, with the calendar's last good read (a count decides nothing). A list that can't be
  counted there, or a token that names none, is null.
- **`today_pins` reads it.** It is drawn on Today alone and on demand, and asks the server nothing when nothing is pinned.
  It hears on Today what the lists are made of: a person, a thread, a hold, a call, a visit, a step, a deal, a list, the
  channels, the settings and the workspace's row. Its waits are a dear read's (2 s, at most 12 s).
- **The chips take its counts** where it holds a token (contracts `todayPins`), and People's otherwise. Erasing a person,
  which the feed is not told of, reads it where it is drawn (`pinsIfDrawn`).
- **A page that names someone People does not hold asks for People again.** This covers Leads' Talking door and the people
  at a lead, the business trailing a name, and the Inbox header's facts (`want-person.ts`). It asks once for each person,
  at most once a minute whoever asks, and nothing before People's first read.
- **Closed:** W-person-list-lead-3, W-person-list-lead-5.
- **Left, with its reason:**
  - People's own rows still come from its whole book: a person's facts read by id (`people/facts?ids=`) is what the audit
    named for the Inbox header and the Calendar panel. The Calendar reads no People any more (its board carries the person's
    facts), and the Inbox header now asks for People once where it names someone new.

## Amended on 15 October 2026: the last six findings, and the owed reads the narrowed feed makes cheap

The second audit's six findings nothing had built (S9-9, S9-10, X6-1, X6-2, X6-3, W-visit-deal-5), the two it left to Ruben
(S9-7, S9-8, decided as recommended), and the owed reads (`reads-not-heard.json`) that page-scoped hearing now closes cheaply,
since 00431 narrowed what the feed tells of templates, mailboxes, memberships and the rest.

- **Today hears People's person** (`PAGE_HEARS.today`: `people: ["person"]`). People's rows are the steps due on Today and the
  names Worth a look gives, so a customer who says STOP, is renamed, merged or erased is read again there; Worth a look's "Yours
  to follow up" named someone who had just asked to stop until People was opened (W-visit-deal-5). A message or a hold on Today
  still reads none of People.
- **The owed reads closed, each where its surface is drawn** (`fresh: "its-page"`, or on every page where the surface is
  `live`):
  - People hears a call's start and end (its last contact and call count; never a transcript turn) and the team (who wrote a
    note, whom a step is for);
  - a person's page hears the team and the connected mailbox a business's emails left from;
  - Sent hears a deal, the templates its pool counts and the team; the playbooks hear a deal;
  - Settings hears the visits the Business pane states;
  - the replies hear the mailbox a reply came to; the reach-outs hear a template and a deal;
  - Campaigns' 30 days and the Campaigns lens hear a deal won, and the mailboxes their reach-outs left from.
- **A person's edit or a channel's change reads People only where it is drawn** (refresh map `peopleIfDrawn`, S4-6):
  `personAndThreads`, `peopleAndAudiences` and `readiness` read every page of the book behind a name edit, a yes, a Settings
  save or a mailbox's rename, wherever it was pressed; People is read now where the page on screen draws it, and left for the
  next page that does.
- **One builder per receipt, one guard per act** (S9-9, S9-10): contracts `whenItGoes` and `runApprovedTail` are the one
  sentence of when a send goes and what an approve did, for Sent, Today, a drawer and Ask's card; a deal's stage, the Inbox's
  lists and a calendar step that waits on the owner each say their one word (`DEAL_STAGE_WORDS`, `INBOX_BUCKET_WORDS`,
  Setup's "Waiting on you"). Today's run rows wait while their Approve or Cancel is on its way, and the run verbs are one
  intent each (decision 0035). A step Done the door refused reads again what drew the step.
- **The demo's Inbox is a demo's** (X6-1, X6-2): a real session holds no seeded thread from boot, and the boot gate waits on
  none; the bell takes each source's backlog once that source is read.
- **Every link to a visit opens it** (S9-7): the Inbox header's visit is a door of its own beside the head on a desk, and
  Today's Next opens the appointment it names.
- **A STOP is one tone on a run's sheet too** (S9-8): its figure and filter say STOP's words, in STOP's tone.
- **Left, with its reason:** the owed groups that need a narrower notice than the feed sends (a lead's name told apart from a
  lead run's batches, a playbook's name from its run stamps, a search's name from its members), `people_list`'s columns, a
  templated send told apart from every message, the chains' timelines, and the channels' age (R9's heal bounds it).

## What comes next

- **R5** changes cells one at a time and reads each golden's difference:
  - a person's page becomes a surface of its own (done, R5a, above);
  - Campaigns' home hears the people, facts and channels it counts (done, R5b, above);
  - Setup, Settings and Reports declare the rest (done, R5c, above);
  - the sheets and panes that read on their own clocks follow what moves them (done, R5d, above).
- **R6** tells the silent records and makes the channels one read (done, above).
- **R7** derives the rows and holds them to production (stages A and B done, above); stage C after a shadow week.
- **R8** makes time a notice: one clock, and one rule for whether a campaign runs (done, above).
- **R9** makes the feed heal and a hidden page cost nothing: one pass, retries, the rolling heal, a hidden page's hold (done,
  above); the feed's replay is owed.
- **S3-5 and S11-8** (done, above).
- **R10:** Today's pinned lists counted on their own, and the pages that name someone new asking for People (done, above).
- **The last six and the cheap owed reads** (done, above, 15 October).
- The owed count falls as they land.
