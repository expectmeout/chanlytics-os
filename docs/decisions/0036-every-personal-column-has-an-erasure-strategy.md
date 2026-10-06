# 0036 · Every personal column has an erasure strategy

**Status:** Proposed on 6 October 2026, not built: the registry 0031's invariant 10 names ("every table has a tenant, a
floor and an erasure strategy") and leaves to a note of its own. Written against commit
`163f367` (main, 6 October 2026) with Phase 1's pull request (#1447) on it. Where this note and the code disagree,
the code wins.

## Context

An erasure (`DELETE /api/v1/contacts/:id`) runs its legs in order: the block, the copies keyed on the number, Storage,
the rows in one transaction (`erase_contact`), then the best-effort legs
(`apps/dashboard/src/server/people/erase-contact.ts`). What each leg reaches is written in its own code: the tables
`erase_contact` deletes from, the payload fields the jobs scrub overwrites, the needles the Ask scrub and the intake
ledger's scrub look for. Nothing says which columns a person's number, address or words can reach, so a new column
that holds them is erased only if its author remembers. The intake ledger (00336) is the latest example: its scrub was
wired by hand, and a review found the first draft's matching too narrow.

The tenancy proof (`tooling/scripts/tests/database/tenancy.db.test.mjs`) already holds every table to a workspace and a
floor; the third part of invariant 10 has no holder.

## Decision

A registry in `packages/db` names, for every column of every workspace table that can hold a person's data, one
strategy:

- **with the person**: the row goes when `erase_contact` deletes the person's rows;
- **scrubbed**: overwritten or deleted by a named leg, by the person's id or by needle;
- **as a digest**: kept only as a hash an erasure cannot reverse (the block's digests, 00263);
- **by age**: removed by a retention clock within its stated days (contracts `RETENTION_DAYS`), and named on the
  privacy page;
- **not personal**: holds nothing of a person, said once.

A test reads the schema the migrations build and fails a column no entry names. Today's unclassified columns are a
baseline that may only fall, so the registry fills table by table and a new personal column arrives with its strategy.

## Steps

1. **The registry and its ratchet**, seeded with what the legs reach today: `erase_contact`'s tables, the jobs scrub's
   fields, the Ask scrub's, the intake ledger's.
2. **Erasure completeness, on a real Postgres:** a person's number and address seeded into every column the registry
   says can hold them, an erasure run, and every such column searched for the needles afterwards. The number on the
   back office: needles left after an erasure, target zero.
3. **The rest classified**, table by table, until the baseline is empty.

## Tests

- The registry test fails an unnamed column, and a named one the schema no longer has.
- The completeness test above, which proves each strategy by running the erasure.

## Consequences

- Adding a column that can hold a person's words means saying how it is erased, in the same change.
- The privacy page's retention paragraph and the registry's "by age" entries must agree; the registry can hold them
  to contracts' `RETENTION_DAYS`, as the purge tests do.

## Open questions

- Should a person's words in a workspace's own notes and messages be scrubbed, or deleted with the person? Today
  `erase_contact` deletes the rows that belong to the person; words about them elsewhere are a product question.
