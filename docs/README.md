# The docs

Where to read what. The pages under "Living" describe the code as it is; a change that makes one wrong corrects it. The
folders under "History" are the record of how it got here: they name the paths of their day, and nothing should be built from
them without checking the code.

## Living

| Page                                         | What it is for                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [architecture.md](architecture.md)           | How it is wired, and where to look for each concern                                                                |
| [glossary.md](glossary.md)                   | The words, and the one list of domain names every tree's folders use                                               |
| [naming.md](naming.md)                       | The grammar every name follows                                                                                     |
| [runbook.md](runbook.md)                     | Run it, test it, deploy it, roll it back                                                                           |
| [system-prd.md](system-prd.md)               | The as-built reference, sheet by sheet                                                                             |
| [conversation-flow.md](conversation-flow.md) | What happens to a message, step by step                                                                            |
| [inbound-gates.md](inbound-gates.md)         | The order every message is taken through, gate by gate (generated: `corepack pnpm gen:inbound-gates`)              |
| [data-flow.md](data-flow.md)                 | The paths data takes, hop by hop, and where a request's name reaches                                               |
| [lead-finder.md](lead-finder.md)             | How the lead finder works                                                                                          |
| [voice.md](voice.md)                         | How a call works                                                                                                   |
| [takeover.md](takeover.md)                   | The quality checklist: could a senior developer take this over tomorrow                                            |
| [debt.md](debt.md)                           | Every number the build holds, what it measures, and what retires it                                                |
| [api.md](api.md)                             | What each route takes (generated: `corepack pnpm gen:api-reference`)                                               |
| [data-model.md](data-model.md)               | The tables, and who owns each (generated: `corepack pnpm gen:data-model`)                                          |
| [sql-map.md](sql-map.md)                     | The SQL functions, who may call each and who does (generated: `corepack pnpm gen:sql-map`)                         |
| [capacity.md](capacity.md)                   | What each clock can do, and what that comes to when the platform is full (generated: `corepack pnpm gen:capacity`) |
| [tree.md](tree.md)                           | What is where (generated: `node tooling/scripts/gen/docs-tree.mjs`)                                                |
| [decisions/](decisions/README.md)            | What is decided and why, and which of it is built. A note stays once it is                                         |

## What is measured

No page lists the code's numbers by hand: each is measured where it runs, and an inventory of any of them is one of these
read, not a new page.

- **Every number the build holds**, on main each night: the summary of `.github/workflows/register.yml`, and its weekly
  issue. [debt.md](debt.md) says what each one measures and what retires it.
- **What runs on a schedule and what each run proves**: the table under "What CI proves" in [runbook.md](runbook.md). A
  night is read as a week of them, not one run: the browser checks, the database suites, the kit and the evals each have
  their own.
- **What a page weighs**: CI's Build and bundle job on every pull request, each page against its ceiling, and
  `.github/workflows/bundle-week.yml` for main beside main a week before.
- **How long a page takes to be drawn**: for customers, the field data ("See how fast the pages are" in
  [runbook.md](runbook.md)); for the nightly, its own log, one line a page
  (`e2e/production/page-speed-budgets.spec.ts`), held to `tests/baselines/page-speed-budgets.json`.

## History

| Folder                                             | What it holds                                                   |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [plans/](plans/)                                   | Past programs' plans                                            |
| [superpowers/](superpowers/)                       | Past specs and implementation plans, one set per feature        |
| [scorecard/](scorecard/)                           | The codebase scorecard as it was last scored                    |
| [system-map.md](system-map.md)                     | What called what, measured on 13 September 2026                 |
| [voice-agent-settings.md](voice-agent-settings.md) | A design note for the phone receptionist's settings, superseded |

## Other

`mockup/` holds early design material, `store/` the app store listings, and `images/` the pictures the pages use.
