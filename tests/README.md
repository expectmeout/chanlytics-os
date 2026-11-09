# @chanlytics/tests

The node suite: the tests that execute the code they prove, and the repository's own rules and ratchets.

## What is where

- `<domain>/`: one folder a domain, under the name the source's folders use (`docs/glossary.md`, The domains). A file is
  named for what it proves. CI picks a change's tests by the folder named like a part of its path, and by what their imports
  reach (`tooling/scripts/checks/changed-tests.mjs`), so a domain's name is also how its tests get run.
- `repo/`, `docs/`, `types/`, `shipping/`, `history/`, `checks/`: the repository's own rules, which every pull request runs.
- `database/` and any `*.db.test.mjs`: what needs a real database. CI runs them against the replayed stack; they skip
  without credentials.
- `_<name>.mjs` at the root: a world or a helper several domains share. One a single domain uses lives in that domain's
  folder.
- `_measures.mjs` and `_ratchet.mjs`: what `corepack pnpm check:debt` measures.
- `baselines/` and `fixtures/`: data, not tests.

## Find a module's tests

```bash
node tooling/scripts/tests-of.mjs packages/core/src/deliver/deliver.ts
```

It walks the import graph CI uses, nearest first.

## Run them

```bash
node tooling/scripts/checks/test.mjs tests/calendar
corepack pnpm test
```

The first runs a file or a folder. The second runs the whole suite, in UTC, and takes about twenty minutes. A test reads each
package as the bundle the launcher builds first.

## What it may import

Anything of ours, and the workspaces' own packages by name.
