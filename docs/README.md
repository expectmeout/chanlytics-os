# The docs

Where to read what. The pages under "Living" describe the code as it is; a change that makes one wrong corrects it. The
folders under "History" are the record of how it got here: they name the paths of their day, and nothing should be built from
them without checking the code.

## Living

| Page                                         | What it is for                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| [architecture.md](architecture.md)           | How it is wired, and where to look for each concern                        |
| [glossary.md](glossary.md)                   | The words, and the one list of domain names every tree's folders use       |
| [naming.md](naming.md)                       | The grammar every name follows                                             |
| [runbook.md](runbook.md)                     | Run it, test it, deploy it, roll it back                                   |
| [system-prd.md](system-prd.md)               | The as-built reference, sheet by sheet                                     |
| [conversation-flow.md](conversation-flow.md) | What happens to a message, step by step                                    |
| [lead-finder.md](lead-finder.md)             | How the lead finder works                                                  |
| [voice.md](voice.md)                         | How a call works                                                           |
| [takeover.md](takeover.md)                   | The quality checklist: could a senior developer take this over tomorrow    |
| [debt.md](debt.md)                           | Every number the build holds, what it measures, and what retires it        |
| [api.md](api.md)                             | What each route takes (generated: `corepack pnpm gen:api-reference`)       |
| [data-model.md](data-model.md)               | The tables, and who owns each (generated: `corepack pnpm gen:data-model`)  |
| [tree.md](tree.md)                           | What is where (generated: `node tooling/scripts/gen/docs-tree.mjs`)        |
| [decisions/](decisions/README.md)            | What is decided and why, and which of it is built. A note stays once it is |

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
