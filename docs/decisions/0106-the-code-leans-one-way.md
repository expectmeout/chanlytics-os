# 0106 · The code leans one way

**Status:** Accepted by Ruben, 7 November 2026 ("if layer 2 is done continue next layer"). Built on `org/names-say-what-they-do`, 7 November 2026. No migration, and nothing changes
for a customer: every step is a move, a rename of an import or a check.

## Context

Layer 3 of the road decision 0104 began. The backend's dependencies were measured against the same eight production monorepos (cal.com, documenso, dub, formbricks, langfuse,
midday, trigger.dev, unkey), with Turborepo's guidance on internal packages, bulletproof-react's one-way rule and the dependency rule of hexagonal design.

The packages were already clean: one way, as in all eight. Inside each tree they were not:

| A tree's folders in one circle | Ours, before | Ours, after | The eight                                                  |
| ------------------------------ | ------------ | ----------- | ---------------------------------------------------------- |
| `apps/dashboard/src/server`    | 18 of 20     | 0 of 23     | midday 0%, documenso 17%, langfuse 18%, unkey 45%, cal 46% |
| `apps/edge/lib`                | 22 of 24     | 0 of 25     | trigger.dev 44-58%, dub 60%, formbricks 68%                |
| `packages/db` repositories     | 5 of 12      | 0 of 26     |                                                            |
| `packages/core`, `jobs`        | 2 and 2      | 0 and 0     |                                                            |
| `packages/contracts`           | 37 of 37     | 33 of 37    | held by a number, for the API's layer                      |
| `apps/dashboard/src/surfaces`  | 16 of 20     | 16 of 20    | held by a number, for the frontend pillar                  |

Two more differences stood out. `packages/contracts` was 29% of the code, where the biggest shared package of cal.com, documenso and dub runs 18-20%, and 113 of its modules were reached by one tree
alone. And `@chanlytics/db` offered 1,038 names through one barrel and `@chanlytics/channels` 655, where cal.com, documenso, formbricks and midday reach their biggest package by subpath and never by its root,
as Turborepo advises.

## Decision

1. **The packages have a written order.** `log`, `contracts`, `db`, `channels`, `core`, `jobs`, each leaning only on those the map names (`docs/architecture.md`, "Which way the code
   leans"). `repo/boundaries/boundaries.test.mjs` reads it against each manifest and against the page.
2. **The logger is a package of its own, under everything.** It sat in `channels`, so a verb in `core` that wanted a log line imported the package that holds the providers. Twenty-one
   of core's twenty-four values from `channels` were `logger` and `errField`. With it gone, core's wall names no exception for logging.
3. **No value import runs in a circle in the backend**, held outright. The browser's one circle is counted (`module-circles`), and circles once types count are too (`type-circles`).
4. **A backend tree's domains lean one way**, held outright in `core`, `db`, `channels`, `jobs`, `apps/edge/lib` and `apps/dashboard/src/server`. What every domain stands on is in the tree's
   `shared/`, and `shared/` imports no domain, in every tree.
5. **A shared package holds what two trees use.** A module of `contracts` that one tree alone reaches moves to that tree: 90 did, 927 KB, Ads' whole page among them. A schema stays, since a
   parser is the contract and the API's reference reads it. `one-tree-contracts` counts the 11 left, each held by a module that stayed.
6. **`db` and `channels` are reached by their domains.** `import { x } from "@chanlytics/db/people"` says what it leans on, and each domain's barrel is the face it shows. The root barrels
   are gone. Bundles for the node suite split, so one breaker and one logger context stand however many entries a process loads.
7. **A door stays thin**, counted: `long-doors` holds each door over a hundred lines.

## What this does not do

- **`contracts` keeps its name and its root.** Its name now says what it holds: what two trees agree on. Its root stays because the browser's entry is built from it (decision 0024), and its
  folders still lean both ways: promoting 105 modules to `shared/` only took the circle from 33 folders to 21, so moving them would have emptied its domains for little. Layer 6, the API's,
  takes both.
- **`surfaces` and `bridge` stay as they are.** The bridge makes 107 value imports back into the surfaces, so moving its files would rename the problem. The frontend pillar takes them, held
  by `module-circles`, `type-circles` and `domain-circles` until then. Layer 1 had deferred the bridge's folder to this layer; this moves it again, with that reason.
- **Core's HTTP statuses, the four model clients and the job row's request id stay.** Layers 9, 12 and 10 take them.

## How to reverse

Each step is a script in the build's replay, so a step can be left out and the rest rebuilt. Reversing a domain's entry is a line in its manifest and one rewrite of its importers.

## Consequences

A reader can read `apps/dashboard/src/server` and `apps/edge/lib` from `shared/` upward. A new import against the order fails a test by name. New domains: `server/drafts`, `server/posts`,
`server/setup`, `server/settings`, `edge/connections`. Moved offenders keep their counts under new paths, so the first check:debt reads them as new.
