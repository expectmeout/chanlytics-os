# 0111 · The data layer holds the data

**Status:** Accepted by Ruben, 7 November 2026 ("Approve all five", "Yes, build it", "Keep going, one PR"). Built on `data/the-data-layer`, 7 November 2026, not landed. Nine
migrations wait for Ruben's word to be applied to production, in one batch; nothing else changes for a customer.

## Context

Layer 8 of the road decision 0104 began: scorecard categories 11 (database architecture) and 12 (multi-tenancy), measured against Supabase's own guides (row level security, the database
linter's lints, going into production), the Postgres manual and the same eight production monorepos as decision 0110. The database itself was the strongest part of the backend: every
business's rows apart in every table, proved in real sessions. The gaps were around it:

| Practice                                                   | Before               | After                                                |
| ---------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| A statement naming a table or a SQL function, outside `db` | 525                  | 19, all in files other lanes hold                    |
| A link between tables with no index that serves it         | 77                   | 0, and 1 named with why (`jobs.kind`)                |
| A table read by two rules of one kind                      | 3                    | 0                                                    |
| SQL functions mapped (who may call each, who does)         | none                 | `docs/sql-map.md`, held current; 2 dead ones dropped |
| A list that stops at the 1,000-row cap says so             | no                   | `db_answer_at_cap`, logged where it happens          |
| Shapes of a page of results                                | 4                    | 2: the one shape, and People's (the speed plan's)    |
| A database call whose failure is dropped                   | 59                   | 3, in the inbound lane's files                       |
| A service-role statement that names no workspace           | 28 edge, 7 dashboard | 1 (the inbound lane's), 0                            |
| Delivery records kept past what the privacy page promises  | for ever             | 30 days, as `RETENTION_DAYS` says                    |

## Decision

1. **A table is read and written in `packages/db` alone, and so is a SQL function called by name and the media bucket.** A route, a server module, an edge library, core and the jobs runner
   reach the data through a named function of its domain (`@chanlytics/db/<domain>`). Two domains are new: `google` (the profile, the listing and its days, the reviews) and `ops` (the
   pager's memory, the sweeps' doors, the platform's health and the back office). A function is the query and nothing more: the caller keeps what it does with the answer, its words for a
   failure and its log line, so nothing a customer sees moves.
2. **A data function hands back its answer, not its statement.** Each is `async` and resolves to `{ data, error, count }`. A statement's own type declared the whole schema, a megabyte or more
   a module, and the dashboard's typecheck ran out of memory reading them; the answer's type is the rows alone. A function never returns a statement for its caller to finish: where a
   caller narrowed it, the narrowing is a parameter (`listCallRows`, `listActivityEvents`), and a write that only sometimes claims is a function of its own (`claimBroadcastSend`).
3. **Where a reader the speed plan holds shares a function's columns, the columns live with the function** (`CALL_COLUMNS`, `MESSAGE_COLUMNS`, `THREAD_MESSAGE_COLUMNS`, `DEAL_DTO_COLUMNS`)
   and the dashboard's module re-exports them, so one list of columns stands for one shape.
4. **Every link has an index that serves it, or a reason.** 76 indexes, six of them built `CONCURRENTLY` alone in their files on the busy tables; `LINKS_LEFT_UNINDEXED` names the one left.
   A migration from 00557 that locks a table sets `lock_timeout` (`tests/database/migrations.test.mjs`).
5. **One rule a read.** The three tables read by two rules of one kind each have one, joined by OR; a FOR ALL write rule became three.
6. **The SQL is mapped.** `docs/sql-map.md` (`gen:sql-map`) names each function, who may call it and who does; a function nothing calls fails the test unless `KEPT_WITH_NO_CALLER` says why.
7. **A list that stops at the cap says so.** `namedFetch` logs `db_answer_at_cap` when a GET with no range answers exactly 1,000 rows.
8. **One shape for a page of results**: `PageInfo { limit, has_more, next_cursor, total? }` in contracts.
9. **A failed database call is read where it is made**: thrown, or logged and answered, with why. Layer 9 then raises them one way.
10. **A service-role statement names its workspace** (`tenantDb`) or says it reads every workspace on purpose (`platformWide`); the dashboard's are counted now too.
11. **Delivery records go with the evidence**: `purge_events` deletes `event_deliveries` done or failed past the evidence's 30 days.

## What this does not do

- **The speed plan's readers keep their statements** (`server/readers/{people,today,playbooks,person,inbox,conversations}.ts`): O13 and O14 move them as they rebuild those reads.
- **The inbound lane's files keep theirs** (`receptionist/steer.ts`, the jobs handlers it changes): #2065 holds them.
- **`rate_hits` keeps no primary key.** It is an unlogged sliding counter; a key would add a column and a write to every request and serve nothing.
- **A lead finder's door called by a name in a variable** (the edge's `leadDb`, `callsOn`) is not counted by the measure and stays where it is, beside the port it fills.

## How to reverse

Each data function is a named export; inlining one back is a copy of its body into its caller. The migrations are forward-only: an index is dropped by a new migration, a merged rule split by
another.

## Consequences

`packages/db` holds 423 new functions, in 50 new modules and 15 that grew. A reader finds every statement of a table by its domain. A test that read a statement's text where it was made reads it where it lives
now, and says so. Production's batch, on Ruben's word: migrations 00557 to 00565 (renumbered above whatever is claimed then), applied by the CLI.
