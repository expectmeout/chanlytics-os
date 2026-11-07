# 0108 · A rule is said once

**Status:** Accepted by Ruben, 7 November 2026 ("Build layer 5 first"). Built on `org/names-say-what-they-do`, 7 November 2026. No migration. One thing changes for a caller, named under Decision 2: a door that took an id by a looser shape now takes it by the one shape.

## Context

Layer 5 of the road decision 0104 began. The scorecard's items 3 and 8 say a rule should live in one place and a measure of copies should read bodies, not names. The backend was read by one parser, and a seeded sample of 400 TypeScript files from each of the same eight production monorepos by the same reading.

| Sampled, 400 files                | Ours before | Ours after | The eight | Reads as      |
| --------------------------------- | ----------- | ---------- | --------- | ------------- |
| Functions the same after renaming | 0.3%        | 0.3%       | 0.5-3%    | We lead       |
| Runs of 70 tokens the same        | 0%          | 0%         | 0-8.8%    | Level         |
| Regexes in more than one module   | 6.9%        | 4.7%       | 2.9-24.3% | Near the best |
| Sentences in more than one module | 0.2%        | 0.3%       | 0.5-5%    | We lead       |

The sample moves a little with the tree. Whole, the backend went from 63 functions the same as another to 43, from 31 groups across files to 13, from 18 groups the same as written to 4, from 133 regexes in several modules to 121, and from 69 sentences in several modules to 56, none past two copies. What was left of the regexes is generic: whitespace, an underscore, a trailing slash.

So the codebase was not repeating itself the way the road assumed: it already repeated less than all eight. What it lacked was precision, about two dozen rules each written in several places, and any check that would catch the next copy. The existing measure of copies counts a name declared in three files, so a function copied under a new name passed it.

## Decision

1. **A rule's pattern has one home**, held outright by `repo/rules/rules.test.mjs`, wherever it is written in the backend or the browser's trees: what an id looks like, a workspace's address, a day key, a template's numbered slot, the characters that may not ride into a prompt, a phone number, a US area code, a US ZIP, and how a database says something is not there. A module that looks for one of these inside a longer text is a different test and keeps its own.
2. **The looser id shapes go.** Twelve modules took `/^[0-9a-f-]{36}$/`, which reads thirty-six dashes as an id, and now take `UUID`. Every real id still passes. What changes is that a malformed id is refused at the door it reached instead of at the database, and that a form written without the `i` flag now takes capitals, as Postgres does. Reverse by restoring the literal in a door that needs it, which this test would then name.
3. **A helper written twice is one helper**, by moving it to whichever home the rule belongs to: `recordOrNull`, `recordOrEmpty`, `isoMs`, `sameBytes`, `sameKey`, `isMissingFunction`, `saysMissing`, `once`, `nullsLeftOut`, `theMessage`, `LEAD_OPERATION_UNDO`, and the contexts Ask's two doors read. Functions alike only in shape stay apart: `inParts` and `inChunks` have different constants, and a provider's throttle reading is that provider's.
4. **A sentence said in three or more modules is said once**, in `shared/words.ts` where several trees say it, or in a words module beside the doors that do. Two copies are counted, not chased: a second copy of a sentence is cheap, and we already lead here.
5. **What still falls is counted** (`RULE_RATCHETS`): `same-functions` reads each backend function's body with its names renamed away and its literals kept, routes included, which is what the scorecard asked of the copies measure. `copied-runs` counts tokens in a run of 70 an earlier module holds. `repeated-sentences` counts sentences in several modules. `fetches-outside-a-client` counts each global `fetch` outside `packages/channels`, for layer 12 to move.

## What this does not do

Decision 0027 says where a rule belongs by its kind, and four rules still sit somewhere else. They need a logic change, and three logic-free layers plus this one have had no CI read, so they wait for one:

- Erasure's steps are written in the dashboard's server. They belong in core.
- WhatsApp's gates are decided by the order of the statements, not by asking one question.
- Apify is reached from core directly rather than through a port.
- The conversations guard needs a migration.

Meta's Graph on the edge goes to `packages/channels` in layer 12. 299 SQL functions have no map from a TypeScript rule to the door that enforces it; layer 8 takes that.

## How it was done

Replayable scripts in `dev-tools/layers/layer-5/`. Regexes and sentences were found by the syntax tree, so a string inside a comment or a longer pattern is untouched. Names were renamed by the binder, so a property or a local of the same name is untouched. A pattern with the `g` flag is only shared where its readers use `replace` or `matchAll`, which keep no state, and the script refuses one asked `test` or `exec`. No test, lint or type check has been run on this: by Ruben's word, it is pushed as one with layers 2 to 4 once he approves.

Two probes read the result instead, and neither is a test of behaviour. `names-probe.mjs` reads each module by the binder for a name it uses and nothing in it declares; `load-probe.mjs` loads each module this layer touched. Between them they found six names layer 4's split had left behind: an `export { x }` whose import went with the statements that used it, which would have failed the first build. Those six now say where they come from (`lost-names.mjs`). The API reference generator and layer 3's measure of direction also caught two slips of this layer's own script, both fixed.
