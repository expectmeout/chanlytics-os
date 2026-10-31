# 0054 · A dependency is taken when it is the job's standard

**Status:** Decided, 12 October 2026 (Ruben: "i did not know we had a no dependency rule as it is 2026 there are lots
of deps that may help throughout chanlytics ... go with all of your best decisions"). Built with the note: the rule,
and web-vitals, taken by 0053's step 1. Each other dependency below is taken in the change named for it. Written
against commit `b220a8b74` (main, 12 October 2026, after #1563). Where this note and the code disagree, the code wins.

## Context

`CLAUDE.md`'s "What not to introduce" said: "A new dependency where the repository already solves the problem
(charts, calendar parsing, phone formatting are hand-rolled on purpose)." Read as a rule against dependencies, it has
kept the tree small: the dashboard's runtime dependencies at `b220a8b74` are Base UI, ElevenLabs' client, MapLibre with
PMTiles and Protomaps' basemaps, Supabase's clients, Next and React, `qrcode`, `server-only` and zod; the edge adds
Anthropic's SDK and Stripe; the packages add `html-to-text`. The rest is the repository's own, and some of it does a
job a maintained library does better:

- **Calendar feeds** (`packages/contracts/src/calendar/feed.ts`, run on the server alone) read RRULE "in the forms a
  salon's calendar actually carries". A rule it does not understand (a numbered BYDAY such as Google's "monthly on the
  second Tuesday", BYSETPOS, a list of BYMONTHDAY, BYMONTH, an hourly rule) keeps its first occurrence and loses the
  rest, counted for the diagnostic. A lost occurrence is busy time the receptionist cannot see, so it may offer a time
  that is taken.
- **Phone numbers** (`packages/contracts/src/shared/phone.ts`, 23 importers) make a bare ten digits American and keep
  any other eight to fifteen digits as written after a `+`. A national number from elsewhere ("07700 900123") becomes
  `+07700900123`, which is no number. Every workspace is in the pilot's market today.
- **The page's data** is held by six caches of the shell's own (0053's review, section 3.4), about 2,000 lines with
  six sets of rules.
- **Field data** used Next's `useReportWebVitals`, which reports neither a move between pages nor what an interaction
  waited on (0053).

And some is right as it is: the CSV reader (`imports/csv.ts`: a byte-order mark, the delimiter found, quoted newlines,
each row's line), the time-zone arithmetic over `Intl` (`calendar/zone-math.ts`, with Windows' zone names in
`ics-zones.ts`), the charts over the validated palette (`charts.css`), and the lists that already draw a window of their rows
(`surfaces/people/table/row-window.ts`).

## Decision

A dependency is taken when it does a job the product needs better than the code the repository would keep, and:

1. **It is the job's standard**: maintained, widely used, released within the year, with a licence the build allows
   (`tooling/scripts/checks/licences.mjs`). A new licence is read by a person before it joins the list.
2. **One per job.** A second library for a job is refused, and the code it replaces leaves in the change that takes it
   (one predicate per rule).
3. **Pinned exactly**, no caret, in the package that imports it (`shipping/package-dependencies.test.mjs`); Dependabot
   raises it. No install script runs: pnpm 10 runs none it is not told to, and one that needs it is argued.
4. **Behind a seam of ours** wherever more than one module would call it: `useSurface` for the cache, `normalizePhone`
   for numbers, `parseIcs` for feeds. The rest of the tree never imports the library, so it can be changed in one place.
5. **On the server where it can be.** In the browser, its gzipped bytes are argued in the pull request (`Bundle:
<why>`), it is loaded where it is used, and a library of parts is imported by its part, never its index (as Base UI
   is).
6. **A tool of the build or the tests** is taken on the same terms, but its bytes are nobody's: what it costs is CI's
   minutes.

## The candidates, each decided

| Dependency                                 | Its job here                                                                                                                                                  | Decision                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-vitals`                               | The browser's five, with each one's element and phase, and moves between pages                                                                                | **Taken**, 6.2.3, by 0053's step 1: the dashboard, in its own chunk after the page has loaded                                                                                                                                                 |
| `@tanstack/react-query` and its persister  | One cache for every page's reads: one read at a time per key, stale while it is read again, prefetch, a notice that patches or marks a key, kept in IndexedDB | **Taken in 0053's step 6**, behind `useSurface`, surface by surface, each proved equal by value; the six caches leave as it arrives                                                                                                           |
| `ical.js` (Mozilla, MPL-2.0)               | RFC 5545 recurrence: every rule a feed carries, its exceptions and its time zones                                                                             | **Taken in a calendar lane of its own**, on the server: first as the tests' oracle over the forms `parseIcs` reads, proved equal; then `parseIcs` hands it the rules it does not understand, and the diagnostic's count of them falls to none |
| `libphonenumber-js`, its smallest metadata | A number in its country's national form, with the workspace's country as the region; whether a number can exist                                               | **Taken before the first workspace outside the North American numbering plan opens** (a launch gate), behind `normalizePhone`, on the server first; the browser's bytes are argued in that lane                                               |
| `fast-check`                               | Property tests for the parsers the repository keeps: CSV, feeds, zone arithmetic, phone numbers, the price figures                                            | **Taken, for the tests alone**, with the first change that touches one of those parsers                                                                                                                                                       |
| `@axe-core/playwright` (MPL-2.0)           | Accessibility checked in the browser journeys                                                                                                                 | **Taken, for the tests alone**, with the next change to the browser journeys (`e2e/`)                                                                                                                                                         |
| `babel-plugin-react-compiler`              | Memoization the compiler writes                                                                                                                               | **Measured, not taken yet** (18 Oct 2026): with the lists windowed, React draws ~40 ms of a phone's 800 ms refresh, and pages read stores and `window` as they draw, which it would freeze                                                    |
| Sentry (`@sentry/nextjs`)                  | Client and server errors with their source-mapped stacks, grouped and alerted on; a request's trace across the apps                                           | **Recommended; Ruben's**: an account and a plan. The client-error door (`api/v1/client-errors`) logs a line and stays until then                                                                                                              |
| Firecrawl (its scrape API, no SDK)         | A business's page as a browser draws it, its main content as Markdown, on the provider's network: the website read, a booking page, a mark, an opening        | **Taken 31 Oct 2026** (Ruben: "we are not a website reading software"): `firecrawlReader` in channels `site-reads.ts`, through `providerFetch`, its key on the edge alone; the Logo row's read moves to the edge next                         |
| TypeScript's native compiler               | Typecheck time in CI                                                                                                                                          | **Measured before it is taken**: against 6.0.3 on the same tree, taken if no diagnostic differs; one catalog line                                                                                                                             |
| `@tanstack/react-virtual`                  | A window of a long list's rows                                                                                                                                | **Taken 18 Oct 2026**, 3.14.13, its core alone, behind `kit/rows/shown-rows.ts`: People's and Leads' table, the Inbox's list, Conversations'. Desk Leads drew 288-360 ms of rows a switch                                                     |
| `papaparse`                                | CSV                                                                                                                                                           | **Not taken**: `imports/csv.ts` does the job; property tests hold it                                                                                                                                                                          |
| A date library, or Temporal's polyfill     | Dates and time zones                                                                                                                                          | **Not taken**: `Intl` and `zone-math.ts` do the job; Temporal arrives without a dependency once every browser the app supports ships it                                                                                                       |
| A chart library                            | Charts                                                                                                                                                        | **Not taken**: the validated palette (`charts.css`) and the charts drawn over it are the design                                                                                                                                               |
| A bundle analyzer                          | What a chunk holds                                                                                                                                            | **Not needed**: Next's own (`next experimental-analyze`), for 0053's step 7                                                                                                                                                                   |

## Steps

1. The rule (this note, and `CLAUDE.md`'s line), with web-vitals taken (0053, step 1).
2. Each row above in the change it names. That change says what it replaces, its licence, its bytes where the browser
   pays them, and the seam that holds it.

## Tests

The build already holds what the rule needs: the licences (`checks/licences.mjs`, in CI), each package's imports
against its `package.json`, the audit (`pnpm audit --prod --audit-level high`), and the bundle's budget
(`check:bundle`). Each change that takes a dependency proves the job it does as any change does.

## Risks

- **A library's update is a change to the product**: Dependabot's pull request runs the tests of what it touches, and
  one under a seam is held by that seam's tests.
- **A dependency of a dependency**: the audit and the licence check read the whole tree; an advisory with no fix is
  named in `pnpm-workspace.yaml` with its day.
- **The browser's budget**: the workspace route's JavaScript was about 97% of its ceiling on 9 October 2026. A library
  the browser pays for waits for 0053's step 7 split, or brings its own saving.

## Not decided here

- Sentry's account and plan (Ruben's).
- Which country a workspace says it is in, where `libphonenumber-js` reads its region: the lane that takes it.
