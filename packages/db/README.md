# @chanlytics/db

The one place a table is typed. A caller asks for a fact and never spells a table; row-level security decides reads on a
member's session client, and the service role's writes go through `shared/tenant-db.ts` where they can.

## What is where

- `repositories/<domain>/`: each repository under its domain, nothing loose.
- `shared/`: what every repository stands on: the service client, the workspace-scoped client, the pager, the seam to
  the process's logger.
- `realtime.ts`: the live feed, a package entry of its own so a page can load it alone.
- `database.types.ts`: generated from the schema (`corepack pnpm gen:db-types`), never edited.

## What it may import

`@chanlytics/contracts` alone.

## Tests

`tests/<domain>/`, and `tests/database/` for what needs a real database: the `*.db.test.mjs` suites, which CI runs
against the replayed stack and which skip without credentials.
