# 0107 · A module is short and narrow

**Status:** Accepted by Ruben, 7 November 2026 ("Build layer 4 first"). Built on `org/names-say-what-they-do`, 7 November 2026. No migration, and nothing changes for a customer: every step moves whole statements between
files or adds a check.

## Context

Layer 4 of the road decision 0104 began. Every backend module was measured against a seeded sample of 400 TypeScript files from each of the same eight production monorepos, by one parser, in code lines so comments do not count. The
old limit was 800 physical lines, and `docs/2026-11-06-layer-1-file-tree.md` had read the gap as files several times too long. Measured properly the picture is different:

| Backend                         | Ours before | Ours after | The eight | Reads as                   |
| ------------------------------- | ----------- | ---------- | --------- | -------------------------- |
| Median function, lines          | 4           | 4          | 6-10      | We lead                    |
| Functions over 100 lines        | 0.5%        | 0.5%       | 1.5-4.5%  | We lead                    |
| Functions past cognitive 15     | 3.7%        | 3.7%       | 2.4-5.4%  | Level                      |
| Modules over 500 code lines     | 2.9%, 54    | 2, whole   | 0.3-6%    | Level, then ahead          |
| Modules over 300 code lines     | 10.4%       | 9%         | 1.8-13%   | Upper half                 |
| Median module, code lines       | 69          | 74         | 31-65     | Behind; `contracts` is 117 |
| Exports, 90th percentile        | 15          | 16         | 3-10      | Behind; `contracts` is 22  |
| Modules exporting over 30 names | 42          | 1, by rule | few       | Behind, then level         |

Functions were already short: years of function limits did their work. What was missing was the same discipline for a module. Files crowded under the old limit, 39 between 700 and 800 lines against 23 between 600 and 700, and the widest
modules exported up to 67 names.

## Decision

1. **A backend module holds at most 500 code lines and exports at most 30 names**, held outright by `repo/size/sizes.test.mjs`. ESLint's `max-lines` calls 100 to 500 typical. Three are left whole, each named with its reason: the edge's
   log events (one table an alert greps), contracts' closed sets (declared once on one page) and the one send door (read as one).
2. **A long module is split by moving its statements whole.** Its parts lean one way, each only on those before it, and the tool refuses a split that would make a circle or leave a `let` written from another module. A module named for its
   folder keeps its parts beside it; any other gets a folder of its name. 79 modules became 181 parts, the smallest of 27 code lines, and every importer says which part it means.
3. **A door holds at most 100 code lines.** What six long doors decided for themselves moved behind them. The handlers themselves stayed, and none is over 81 lines.
4. **Cognitive complexity is measured.** The scorecard asked for it twice. `cognitive-complexity` counts functions past 25, so a number can only fall; branches alone miss what deep nesting costs a reader.

## What this does not do

- **The median stays behind.** Splitting the longest modules raised it from 69 to 74, since the parts are mid-sized. Moving it means rethinking `contracts`' modules, not cutting them: layers 5 and 6.
- **Width stays behind the eight's typical module.** The cap takes the worst off; a 90th percentile of 16 against 3-10 is `contracts` and `db` exporting many small things. Layers 5, 6 and 8.
- **13 functions over 150 lines stay** (`leadDb`, `checkSends`, `figuresOf`, `toInboxThreadVM`). They are few against the eight, the existing ratchet counts them, and splitting one changes logic, which no test has run on here.
- **Comments.** Non-code lines are 31% of the backend against 15-27%: layer 13.

## How to reverse

The replay is a script, and `stems.mjs` names each split: remove a module's row and it stays whole. The limits are three constants in `tests/repo/size/_size.mjs`.

## Consequences

A long module now reads as a folder of named parts, so finding a thing means reading a listing instead of scrolling. Importers are longer by a line or two, since a name now says which part it comes from. A new module over a limit fails a test by name. Moved
offenders keep their counts under new paths, so the first check:debt reads them as new.
