# 0105 · Names say what they do and what they hold

**Status:** Accepted by Ruben, 6 November 2026. Its first step, the checks, is built on `org/names-are-checked`. No migration,
and nothing changes for a customer: every step is a rule or a rename.

## Context

Layer 2 of the road decision 0104 began. The backend's names were measured at `9346d03b40` against the same eight production
monorepos (cal.com, documenso, dub, formbricks, langfuse, midday, trigger.dev, unkey), with Google's TypeScript Style Guide,
Swift's API Design Guidelines, Effective Go, typescript-eslint's naming-convention rule and Node.js Best Practices. It met 4 of
12 practices. The scorecard's 8 of 10 had counted written rules, and most of the checks `docs/naming.md` promised were never
built.

It leads on types, closed sets and file names that say what they hold: no backend file is called `utils`, where the eight run 1
to 8%. It is behind where a reader meets a name in the code, on 6 November 2026:

| Measure, backend                                | Ours | The eight |
| ----------------------------------------------- | ---- | --------- |
| Async exported functions that start with a verb | 54%  | 73-97%    |
| Exported functions with a one-letter parameter  | 26%  | 0-6%      |
| Locals that are one letter                      | 18%  | 1-3%      |
| Capital one-letter locals, per 1,000 lines      | 0.72 | 0         |
| Files whose name starts with their folder's     | 11%  | 0-2%      |

The eight's code measures are a seeded sample of 150 `.ts` files each. The record is
`Claude Video/docs/2026-11-06-layer-2-names.md` beside this repository.

## Decided

1. **A function that reaches outside starts with its verb, and a pure one may be a noun.** Swift's guidelines draw this line:
   a side effect reads as a verb phrase, and a function without one may read as a noun phrase. So `idsOf(rows)` stays, and
   `heldNoticesOf(db, id)` becomes `listHeldNotices`, since its name hid a database call. Putting a verb on every function, as
   most of the eight do, would rename about 3,900 and lose names that read well. A read says `list` for many, `find` for one
   or null, `get` for one or it throws.
2. **The names change now, not only the numbers.** Checks first, so nothing grows; then renames, one kind to a pull request, by
   TypeScript's own rename service from a map a person reads.
3. **`apps/edge` keeps its name,** and says in its README and the glossary that it means the edge of our system, not Vercel's Edge
   Runtime. Renaming it would touch the Vercel project's root directory and 441 files for little gain. Reversible at any time.
4. **`door` stays,** defined, with the term other codebases use beside it. It is consistent, and on about 12,000 lines.
5. **A value is named for what it holds.** `why`, `who`, `said` and their kind leave locals and parameters. A property on the wire
   keeps its name until the API's layer moves its domain.
6. **The backend and contracts move now; the browser's code later.** The checks count the browser's too, so it cannot grow; its
   prefixes (`bt`, `pl`, `bc`, `ix`) and short names go with the frontend's own layers.

What never changes in this layer: a string, a log event, a wire name, a table, a job kind.

## How it is held

Eight measures in `check:debt` (`tests/repo/names/_names.mjs`): `short-names`, `async-verb-first`, `value-names`,
`file-repeats-folder`, `type-casing`, `boolean-names`, `exported-twice` and `house-words`. Three rule tests: route segments against
the glossary (`repo/names/route-words.test.mjs`), the schema's names (`repo/names/sql-names.test.mjs`, reading
`supabase/schema.sql`, so with no stack) and file names that say nothing (`docs/file-names.test.mjs`). And
`@typescript-eslint/naming-convention` in the lint, a warning until the last one goes.

## What it costs

An open lane meets each rename when it merges main: git follows a moved file, not a renamed function. The rename map is a file, so
a lane can run the same rename first. A surface's shape hash moves when a type it holds is renamed, so that surface's cached rows
are read once again on the next load.
