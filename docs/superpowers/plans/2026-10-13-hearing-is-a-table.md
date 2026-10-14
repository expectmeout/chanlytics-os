# Hearing is a table the tests walk (wiring audit R4)

Lane R4 of the wiring second audit (`Claude Video/docs/2026-10-12-chanlytics-wiring-second-audit.md`), findings S3-8 and
X2-4. Branch `wiring/hearing-is-a-table` off main `ca41d8e6f`. Nothing changes on screen: every page hears what it heard
before, and the tests prove it. R5 then changes cells of the table one at a time and reads the goldens' difference.

## Tasks

1. **The tracer, where a generator can reach it.** `_reads.mjs`'s trace moves to `tooling/scripts/trace-routes.mjs`. The audit
   said `tooling/scripts/lib/`, but a folder earns its place at its second module (CLAUDE.md, "Where new code goes"). The
   test helpers stay in `_reads.mjs`. `registeredSurfaces(root)` reads `LegacyApp.tsx`'s SURFACES list and its imports, so
   the hand copies in reads-are-heard, declared-reads-are-what-was-heard and message-fan-out go.
2. **An omit is not a hearing.** `unheardReads` counts only the tables a surface hears. A table its own routes read and its
   `omit` leaves out is now a read nobody hears, and it needs a baseline row. Measure how many flip, and give each a row.
3. **The baseline says what kind of exception each row is.** Each group of `reads-not-heard.json` gets a `kind`:
   - `unfed`: a table the feed does not tell (the test checks it is not WATCHED), with `maxAgeMin`, the oldest the read may be;
   - `seat`: the caller's own seat and name;
   - `account`: the workspace's own row and its plan;
   - `over-read`: read for a check or a join, and not drawn, with `field`, the DTO field the table feeds or `null`;
   - `owed`: work not done, with `finding` (an audit id or a lane). The count of owed pairs is written in the file and may
     only fall.
   A row that says the writer's tab re-reads it names the writes (`rereadAfter`), and the test runs each write's refresh
   row and checks that it names the surface.
4. **Route families and PAGE_HEARS.**
   - `routeFamilyOf(route)` (surface-registry.ts, beside the other parses of a route) maps an address to the family its
     hearing depends on. A person's page on any tab is one family, a Reports lens over any days is one family, and a
     Settings pane with its row is one family.
   - `ROUTE_FAMILIES` is derived from ROUTE_SURFACE, ROUTE_DRAWS, the moved and pane-owned addresses, and the scopes.
   - `PAGE_HEARS` (surface-registry.ts, beside ROUTE_SURFACE and ROUTE_DRAWS: legacy-bridge is over its count of modules) says, for each family, the surfaces that hear their page-only kinds there.
   - `ownsTheScreen` reads the table. OWNS_WHAT_IT_DRAWS, LEFT_TO_THEIR_PAGE and PANE_OWNS go, and their reasons move
     onto the cells.
   - Proof, in this order: the equality test runs the old rule against the table over every sample address (from the
     address registry's shapes, the person tabs and the odd params) before the switch; the goldens recorded on the old
     rule are unchanged after it.
5. **The goldens.** `baselines/hearing/<family>.json` holds, for each family:
   - the route asked;
   - the surfaces that own it;
   - for each notice the feed sends (table and event, a message's update by status, a call's turn apart), the surfaces
     read and the requests that costs (each read surface's GET routes);
   - the borrow scan: the surfaces the family's page modules draw, through useSurface, surfaceValue, useMoved and the
     window globals.
   A borrowed surface the family does not read (routeSurfaces) is listed in the golden, so R5 sees it. UPDATE_BASELINES=1
   rewrites the goldens, and a review reads the difference.
6. **No GET outside the registry unsaid (X2-4).** Every GET route literal under `apps/dashboard/src` is either in a
   registered surface's module or in `baselines/on-demand-reads.json`, which says how the read stays fresh and why that
   is enough. The file may only fall.
7. **Docs.**
   - Decision 0058 "Hearing is a table" (amends 0047 point 4).
   - Its row in the decisions README.
   - Rows in docs/debt.md for the new baselines.
   - architecture.md's "How a page hears" names the table.
8. **Checks, once, at the end:**
   - the touched tests;
   - typecheck, lint, dead exports and prettier;
   - the dashboard build and check:bundle.

## Calls made here (each can be undone)

- **Where the tracer goes.** It is a root module, not `lib/`, because of the folder rule.
- **PAGE_HEARS cells.** Each cell names a surface. Making a cell list kinds (ownsKind) comes with R5a, its first user.
- **What a golden counts.** It counts requests as each read surface's GET routes, the most a read asks, not the pages
  People walks. A `when` that reads the row is asked with the row a notice carries: a message's status, a call's status.
