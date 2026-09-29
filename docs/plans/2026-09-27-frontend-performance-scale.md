# Frontend, performance and scale, to ten

**Status.** Written against `main` at `7a4fdbfb` (27 September 2026) for the three categories the
scorecard of 26 September left at 5: 17 Frontend architecture, 19 Performance, 36 Scalability. Every
number below was measured at that commit; the organization categories have their own plan
(`2026-09-26-organization-and-code-health.md`). Two items are owned elsewhere and are only
referenced here: the sweep ceilings (#1146) and the shell's exit, decision 0015 (#1172). Two more were settled
after it was written, and say so where they stand: contracts shaking (19), measured and dropped, and lanes (36),
now decision 0018.

## 1. The scorecard against the code

| Claim | At `7a4fdbfb` |
| --- | --- |
| The shell is outside the checks | 124 script-mode JSX files, 52,888 lines: outside the typecheck and Prettier, with only the hooks rules of lint. `manifest.ts` is 124 ordered side-effect imports. |
| The effect lint misses most custom hooks | `exhaustive-deps` knows five of the shell's effect aliases. 83 of 259 `use…Effect` calls are not checked. Widening the alias to `^use[A-Z][A-Za-z]*Effect$` surfaces 86 dependency warnings (27 become 113), led by `ask-real.jsx` (18) and `leads-map.jsx` (10). |
| Real surfaces carry the mockup | 37 `t.real` forks in 7 files; `__DEMO_MODE` in 22 files; five real surfaces read demo seeds at runtime, which is what keeps `legacy/demo/` in the real manifest (0015 names them). |
| Phone breakpoints disagree | `max-width` at 900px (46 uses), 720 (29), 640 (23), 760 (9), and four more values. |
| No accessibility lint | No `jsx-a11y` anywhere. |
| The boot ships a monolith | The shell's chunk is 1.63 MB (477 KB gzipped) and still carries the demo code. The contracts package ships to the browser whole: 521 KB, 31 uses of one field name alone. zod ships once, 382 KB. MapLibre is 1 MB and already lazy. CSS is 713 KB across eight files. |
| Every status report re-renders the shell | True, and load-bearing (below). |
| One message refetches seven surfaces | Seven surfaces take the default trio (`messages`, `conversations`, `escalations`). The realtime publication streams 24 tables to every open tab. |
| Sweeps have global ceilings | `PLAYBOOKS_PER_TICK`, `CALENDAR_PER_TICK`: #1146 makes them due-aware. |
| Jobs are never purged | No code or migration deletes a finished job. It is also why the erasure scrub had to page (#1175). |

**The status notifier is not a bug to delete.** `setStatus` notifies every listener even when the status
is unchanged, and `LegacyApp` re-renders the whole shell on each notice. The scorecard's step, "notify only
on a real status change", would break the shell: a surface publishes its fresh data on `window` and then
calls `setStatus`, and that notice is the only thing that makes the pages read the new data (the
workspace list in `LegacyApp`, the person page's `__onSurfaceReady`, the route gate). The fix is a
per-surface data signal that only the pages drawing that surface listen to, which is the shell's exit
work, not a one-line change.

## 2. What 10 means, and the test that holds it

### 17 · Frontend architecture

10 is: every real surface is a TSX module on an App Router route with typed imports and no demo twin;
the shell's remaining JSX is linted for hooks, undefined names and accessibility against baselines that
may only fall; one set of breakpoints, as tokens.

- **Lint per file, not per total.** A baseline of warnings by file and rule (`baselines/lint-warnings.json`)
  replaces the single `--max-warnings` cap, so no file can gain a warning while another loses one. With it
  in place the effect alias widens to every `use…Effect` hook and its 86 findings are held, not hidden;
  `exhaustive-deps` becomes an error for new code.
- **The shell's names.** `no-undef` over the shell, with `/* global */` headers as the declarations, behind
  the same baseline: a misspelt global is a runtime `ReferenceError` today.
- **Accessibility.** The jsx-a11y rules behind the baseline. `eslint-plugin-jsx-a11y` supports ESLint 9 at most, and
  its last release was October 2024; its maintained fork, `eslint-plugin-jsx-a11y-x`, supports the ESLint 10 the
  repository runs, so the fork it is (decided 27 September).
- **The exit.** 0015's steps: Inbox, Today, People first; each surface's seed twin deleted as it moves, which
  lets `legacy/demo/` leave the real manifest.
- Held by: the lint baseline, the harness test, the surface registry test, and the ratchets that already
  hold window globals and publishers.

### 19 · Performance

10 is: a budget on what the workspace route ships that may only fall, field data for the pages people
use, and no whole-shell re-render or whole-surface refetch for an event that concerns one surface.

- **A bundle budget in CI.** After the dashboard build (already in the Typecheck job), a check measures the
  client JavaScript and CSS the workspace route loads, gzipped, against a baseline that may only fall; a
  feature that must grow it raises it in the same diff, with the reason.
- **Contracts shaken: measured, and dropped.** Built with one entry per domain, code splitting and `sideEffects`,
  contracts made the workspace route's JavaScript larger, not smaller: 1,014.3 KB gzipped against 1,006.4 KB
  (#1175's tree, 27 September). The shell loads every surface at once, so the browser uses most of the package: by
  the strings in the client's chunks, about 1,091 KB of the split build's 1,297 KB reached it, and only about 58 KB
  was surely left out. The saving is the shell's exit (0015), one surface at a time.
- **Demo on demand.** Once the five seed readers are gone (0015), `manifest-demo.ts` behind a dynamic import.
- **One surface's data, one surface's re-render.** A per-surface data signal replaces the global notice
  (above); message events go to the surfaces that draw messages. Each surface's freshness is a product
  rule, so each move says what it drops.
- **Field data: built, in the database rather than the logs.** Each page load's LCP, INP, CLS, FCP and TTFB, from
  Next's own web-vitals hook, sent as one beacon when the page is hidden and kept under the browser's own ids
  (`page_vitals`, 00252); the back office shows the 75th percentile of each, over every page and over each page a load
  landed on. The logs were the first idea, and they cannot hold a percentile: Vercel keeps runtime logs for an hour to
  a few days, by plan, unless a paid add-on or a drain keeps them longer, and nothing here computes a p75 from a log
  line. Speed Insights would, as a paid add-on with a new dependency; the table costs a row per metric per load, kept
  thirty days and read within a fixed bound.

### 36 · Scalability

10 is: no sweep, table or read whose cost grows with the platform instead of the work due; a broadcast
that backs off when the provider says so; replies never queued behind bulk work.

- **Due-aware sweeps.** #1146.
- **A purge clock.** Finished jobs past their use deleted on a schedule, registered in `sweep_status`
  like every sweep, with a test that a job still referenced is kept; old `events` partitions dropped.
- **Backpressure.** A 429 or a tier refusal stops and reschedules a broadcast instead of failing each
  remaining recipient (verify the current path first: only the workspace pause is read in the batch).
- **Lanes and fairness.** Replies first, round-robin between workspaces, a few claims in parallel per
  tick. A design note first: it is the ledger every send goes through. That note is 0018, decided: it measures
  how late each job starts (built with the note), puts replies ahead of bulk work, puts every other workspace's bulk
  work before a workspace's second job, and claims in parallel only if the numbers still ask for it.
- **Rollups.** Per-workspace daily rollups behind `metrics_summary` and `people_list`, with keyset paging. Found on
  the way (27 September), a CTE that a later read looked in once per row, materialised, so each look scanned all of
  it: `people_list`'s messages, once per person (its three reads for 2,000 people with ten messages each, modelled on
  PGlite: 12.9 s against 95 ms), and `first_replies`' replies, twice per question, under Today and Reports (a week of
  2,800 questions: 21.3 s against 124 ms). 00250 reads each row through its own index. It also looks each person's
  door up for them: read once and joined, the door that added each person was looped through for every person, since
  Postgres 17 plans a SQL function without the values it is called with and expected one person here (10,000 people,
  modelled on Postgres 16 with production's partitions of `events`: the first page in 2.1 s against 0.75 s; PGlite
  plans with the values and never showed it). And a report drew each day of
  its two periods from a scan of every source, `report_series` running its whole contacts pass again for every day
  (90 days of 400 people, modelled on PGlite: 20.9 s against 179 ms): 00251 reads each source once and groups it by
  the day, in `report_series` and `campaign_series`. What remains of `people_list` grows with the workspace's history
  once per page, and is what the rollups are for.
- **Realtime.** A channel per surface instead of one subscription carrying 24 tables to every tab.

## 3. The order

1. **Instrument** (one pull request, after #1172 lands, since both touch `docs/debt.md`): the per-file
   lint baseline with the wider effect alias, and the bundle budget. Nothing a customer sees changes.
2. **Frontend**: `no-undef` over the shell, then the jsx-a11y rules, then 0015's first surfaces once no open pull
   request holds a page the address would move.
3. **Performance**: the per-surface data signal with the first surface that moves in 0015. Contracts
   tree-shaking was measured and dropped (§2).
4. **Scale**: the purge clock (00215), then backpressure (00216), then the ledger's design note (0018).

Each step is its own pull request, proven by a test that runs the code, with the full check line green.
