# 0104 · The tree says what it holds

**Status:** Built on the lane `cm-file-tree` (`org/the-tree-says-what-it-holds`), 6 November 2026. No migration, no behaviour
changed: every step is a move, a new file or a rule.

## Context

Ruben, 6 November 2026: a codebase a senior developer would admire and could learn from, one layer at a time, the file tree
first. The tree was measured at `a0d6978b90` against eight production SaaS monorepos (cal.com, documenso, dub, formbricks,
langfuse, midday, trigger.dev, unkey) and four written guides (Turborepo's "Structuring a repository", Node.js Best
Practices section 1, bulletproof-react's "Project structure", domain-driven-hexagon's "Modules"). It met 7 of 12 practices.

It was already ahead on what a check holds: folder sizes, file-name style, the root, the drawn map. It was behind where a
newcomer has to guess: one workspace in nine said what it was; 97 loose files sat at six tree roots, so a root did not say
which were plumbing and which a domain; a repository could be in any of three places; the test suite lived under
`tooling/scripts/tests`, far from the code, with folder names of its own; and `apps/edge/lib/packages/` held five one-line
re-exports that 229 files imported through, left over from when the edge ran built files (decision 0074 ended that).

## Decided

1. **Every module of a backend tree is in a folder.** A root (`packages/<p>/src`, `apps/edge/lib`,
   `apps/dashboard/src/server`) holds its folders and its package's entries, nothing else, so a listing of a root is a list
   of domains. This replaces "a domain earns a folder at its second module" in those trees: one module in a folder is a
   small price for a root that reads as a table of contents, and a domain's second module no longer moves its first.
   `tooling/scripts` and `apps/mobile/src` keep the old rule; neither is a tree of domains in the same sense.
2. **What every domain uses is in `shared/`.** The name contracts already used. Not `platform/`, which was first proposed:
   here that word means the back office (`platform_admins`, `/api/v1/platform/*`), and a folder of plumbing under that name
   would have sat beside routes that mean something else.
3. **One list of domain names, in the glossary,** and a test that holds every tree's folders to it. A name that means the
   same thing is spelled the same in every tree: the dashboard server's `platform/` became `console/`, as contracts, the
   repositories and the pages already said; `models/` and `anthropic-profiles/` became `ai/`; core's `appointments/` became
   `calendar/`; a business's own site is `website/` everywhere.
4. **Campaigns is one domain, its products nested under it,** as the pages already are in `surfaces/campaigns/`:
   `campaigns/{broadcasts,playbooks,sequences,reach-out,templates}`. This moves files only. Whether the five become one
   engine in the code stays with the backend coherence review's lane.
5. **Every repository is at `packages/db/src/repositories/<domain>/`.** The bare `shared/` beside it is what they stand on.
   `realtime.ts` stays at the root: it is a package entry.
6. **The tests are at the top, in `tests/`, a workspace of their own, by domain.** Not by tree, as was first proposed: of
   the suite's files only 42% reach a single tree, and CI already picks a change's tests by the folder named like a part of
   its path, which domain folders feed. A module's tests are found by asking: `node tooling/scripts/tests-of.mjs <file>`
   walks the same import graph CI does. Not beside the code, either: the suite reads each package as its bundle and shares
   its in-memory database and worlds across domains.
7. **The edge imports a package by its name.** `apps/edge/lib/packages/` is gone.
8. **Every workspace has a README** that says what it is, what is where, what it may import, and where its tests are.
9. **`packages/contracts` keeps its name for now.** Its README says what it holds. Most of it is logic (view models, rules,
   words), not contracts; a new name or a split is decided in the next layers, with the import facts in hand.
10. **`docs/README.md` says which pages are living and which are history.** Past plans and specs stay where they are until
    the code's comments stop citing them: 271 files name those paths today.
11. **`src/server/readers/` stays,** the documented one place a read lives, with `ports/` and `public/` as the server's
    other two folders that are not domains. The glossary's list names them as such.

## How it stays true

- `tests/repo/contracts-barrels.test.mjs`: a backend tree's root holds its folders and entries; `packages/db/src` holds no
  repository outside `repositories/<domain>/`.
- `tests/docs/domains-are-named.test.mjs`: every folder directly under a backend tree's root, and under `tests/`, is on the
  glossary's list or the named exceptions.
- `tests/docs/workspaces-say-what-they-are.test.mjs`: every workspace has a README that opens with what it is.
- `tests/docs/docs-index.test.mjs`: every page at the root of `docs/` is on the index.

## What this cost, and what it did not settle

Every open lane meets these moves when it merges main, which is why they land together and once. Files kept their names, so a
sentence naming `deliver-hold.ts` stays true and a fuzzy finder still lands on it; a name said twice (`deliver/deliver.ts`,
`repositories/auth/auth.ts`) is the next layer's to weigh, with the other names.

History was left as written: decisions, plans, specs and scorecards name the paths of their day.
