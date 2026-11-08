# 0112 · The checker is told only what it cannot see

**Status:** Accepted by Ruben, 7 November 2026 ("Approve all seven"). Its first two parts are built and merged (#2185, #2190), and its third is built on
`types/layer-7-part-3`, 8 November 2026: every typed rule the lint held is an error but the three layer 9 and the pages still owe, the index check is on in
every project, every edge door declares what is read of its answer, and `as unknown as` is 73 to 3. Point 7 (the ids) is built apart. No migration; nothing
changes for a customer but three readings of a value from outside, which said `[object Object]` where they now say nothing, and a line in the logs where a SQL
function's answer, a JSON column or an edge door's answer does not fit.

## Context

Layer 7 of the road decision 0104 began: the types. The backend (2,026 modules, 131,964 code lines) was measured against the same eight production
codebases as layers 1 to 6 (cal.com, documenso, dub, formbricks, langfuse, midday, trigger.dev, unkey), a seeded sample of 300 server-side files of
each, with TypeScript's compiler reference, typescript-eslint's typed rules, "Parse, don't validate" and Effective TypeScript as the bar.

| Per 1,000 code lines                     | Ours | The eight's median |
| ---------------------------------------- | ---- | ------------------ |
| An assertion that names a type, `x as T` | 12.0 | 6.4                |
| `as unknown as`                          | 0.6  | 0.2                |
| `any` written, or a checker silenced     | 0    | 0.9                |
| A type guard                             | 2.9  | 0.5                |
| Outside data taken as `unknown` first    | 21.7 | 4.6                |

The settings are stricter than all eight's, and only formbricks also lints with types. What was behind was how often the code tells the checker
"trust me": the type checker sorted the backend's 1,671 assertions into 459 that give outside data a shape nothing parsed (89 of them a SQL function's
answer), 258 that narrow a text to a closed set, 282 that give an object a shape, 409 that widen a type that already fit, and 143 that neither type
takes. Two more gaps: the workspace's id has a type of its own that the core verbs take and about 1,400 declarations do not; and 1,721 files are read
by no checker, the 87 browser specs and the node suite's 1,634, where a rename of 5,472 names on 7 November left 34 broken takes that CI found one run
at a time.

## Decision

1. **An assertion that names a type is counted**, per module, and may only fall (`assertions`, `tests/types/_types.mjs`), beside the casts measure's
   three. Each backend package goes below the eight's median; one that stays says why.
2. **A closed set, a table of words and a value from outside are read through a check, not an assertion.** Contracts' readers of an outside value
   (`shared/unknown.ts`) gain `isOneOf` (a member of a closed set), `entryOf` (what a table keeps under a key, never under one every object has),
   `isList` and `listOrEmpty` (a stored list that may not be one), and `textOrEmpty` (a value's text, never `[object Object]`). A type that already
   fits is said by an annotation or `satisfies`.
3. **The typed lint's held rules become errors as their findings go**, and four rules of the strict set hold the backend: no object literal told its
   type and no check that can never fire, held as warnings now (`HELD_STRICT`); no unexplained `x!` and no untyped catch variable once fixed.
   A check that can never fire is fixed last, after outside data is parsed: while an assertion gives a value a shape on trust, the rule reads the
   check it still needs as one that cannot fire.
4. **Outside data is parsed where it comes in**: a provider's answer, a SQL function's answer and a JSON column read into a shape, each by a schema,
   report-only for a week and then refused, as layer 6's doors were. A new SQL function declares the shape it returns.
5. **The checker reads the browser specs.** `e2e/` is compiled in the dashboard's project, whose code the specs drive, and its index reads are the
   `unchecked-index` measure's, which now counts every file a project includes.
6. **The suite takes from the code only what the code has.** `tests/types/tests-take-what-exists.test.mjs` reads every name a test takes (a static
   import, `import()` of a path it builds, `importSrc`, `importBundle`, or a name read off a module held whole) and holds it to the module's exports,
   through the import graph CI already reads (`checks/test-reach.mjs`). The compiler's loose reading of the suite was measured and refused: 14,200
   findings that are fakes by design, three files that crash it, and no sight of a path a test builds.
7. **The workspace's and the person's ids are their types end to end**, made once where the id is checked and carried; the others later, the same way.
   **`exactOptionalPropertyTypes` stays off**: what the wire carries cannot tell absent from undefined.

## What this does not do

- **The parts in layer 8's files wait.** `packages/db`, `apps/edge/lib` and `apps/dashboard/src/server` are being moved by layer 8; the widenings, the
  parsers of outside data, the closed-set columns, the index reads and the ids there follow its change.
- **A page's findings are the frontend's**, but where a held rule has one and nothing else, it is fixed here, so the rule can become an error.
- **The colour model's four assertions stay**: the rule that calls them unneeded misreads a `??`, as the comment over HELD_TYPED says of others.

## How to reverse

A rule is a line in `eslint.config.mjs`; the measure is one entry of `RATCHETS`; the specs leave the dashboard's `include`; the readers are imports.

## Consequences

`no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-member-access` and `restrict-template-expressions` are errors. Assertions fell from 2,160 to 1,917,
contracts' from 501 to 273 and core's from 46 to 32. A test that takes a name the code lost fails in seconds, in every pull request, by the test and the line.

The second part: `packages/db/src/types.ts` is the `Database` the code reads (162 closed columns as their sets, SQL functions' arguments
nullable, a function's table rows typed as that table's), at no cost to the typecheck (the dashboard's check 27.8 s, 29.7 s before);
`readAnswer` and `readColumn` read what the database answers through its shape, report-only (`rpc_answer_unexpected`, `json_column_unexpected`);
`asJson` checks a value on its way to a JSON column and `jsonCopyOf` copies one whose type says nothing; contracts gains `valueAt`, `keysOf`
and `globalSlot`. Assertions fell from 1,942 to 1,406, `as unknown as` from 118 to 73, and core reads its indexes checked.
