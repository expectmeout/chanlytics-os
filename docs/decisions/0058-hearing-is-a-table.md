# 0058 · Hearing is a table

**Status:** Built on the lane `wiring/hearing-is-a-table` from main's `ca41d8e6f`, 13 October 2026: lane R4 of the
wiring's second audit (`Claude Video/docs/2026-10-12-chanlytics-wiring-second-audit.md`, findings S3-8 and X2-4),
taken up as the next lane after R1, R2, R3 and R12 merged (Ruben, 13 October 2026: "continue where the other agent left off"). Amends 0047, point 4 (the coverage test) and the rule behind
`onlyOnItsPage`. The number is the next free one after the lead workbench's 0057. Where this note and the code disagree,
the code wins.

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
- **A cell names a surface, not a surface's kinds.** Kind-aware cells (ownsKind) come with their first user, Campaigns'
  home in lane R5b (Sent's runs heard there for some kinds and left to Sent for a message).
  The golden is already per notice, so the change will show as lines.
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

## What comes next

- **R5** changes cells one at a time and reads each golden's difference:
  - a person's page becomes a surface of its own (done, R5a, above);
  - Campaigns' home hears the people, facts and channels it counts;
  - Setup, Settings and Reports declare the rest.
- **R6** removes the false omits the baseline now names.
- The owed count falls as they land.
