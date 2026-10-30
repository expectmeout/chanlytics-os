# A cold email in the owner's voice: the build

The spec is `docs/superpowers/specs/2026-10-30-a-cold-email-in-the-owners-voice-design.md` (v2, decided by Ruben on 30
Oct 2026), and the decision note is 0078. Built on `sequences/the-owners-voice` in the `cm-lead-sending` worktree from
`cf96ac20c`, one branch, one pull request. Migration 00493 goes to production before the merge (`land --applied`).

Each task writes its test first and runs that one file, red, then makes it pass (`node tooling/scripts/checks/test.mjs
<file>`, one file per run, never an empty file argument). Lint, typecheck, format and dead exports run once, in task 8.

## 0. Read the listings' hours (read only; done 30 Oct)

70 leads on production: 36 with hours, every string "Open 24 hours", "Closed" or "H[:MM] AM to H[:MM] PM", days named
Monday to Sunday; 70 with a rating, 65 with 20 reviews or more. `leadFactOf` reads those shapes and nothing else.

## 1. A fact from the listing (contracts)

Files: `packages/contracts/src/reach-out/lead-hours.ts`, `packages/contracts/src/reach-out/index.ts`,
`tooling/scripts/tests/reach-out/reach-out-opening.test.mjs`.

1. Test, made-up listings: 24 hours every day; one close every day; weekdays one close with Saturday shorter and
   Sunday closed; Saturday the same; weekends closed; weekends open; a weekday that differs (no hours fact, the rating
   instead); a missing day; an unreadable string; a rating under 4.0 or under 20 reviews (none); the called-by name;
   every sentence passes `checkOpening` against the record the check builds.
2. `leadFactOf`, its kinds' angles, `facts_used`; the browser entry regenerated.

## 2. The check reads the fact first (edge)

Files: `apps/edge/lib/reach-out/check-one.ts`, `tooling/scripts/tests/reach-out/reach-out-check.test.mjs`.

1. Test: a listing with hours is checked with one call, the reader's, its opening the fact; the reader holding its
   language holds it with no writer; the reader refusing it asks the writer as today; a listing with no fact asks the
   writer first as today.
2. `CheckInput.fact`, built in `checkInputOf`; the fact round in `checkOne`.

## 3. Memory may hold a learned line (database, contracts)

Files: `supabase/migrations/00493_a_memory_line_may_be_learned.sql` (new), `packages/contracts/src/ask-memory/memory.ts`,
the generated files (`gen:schema-sets`, `gen:schema-snapshot`, `gen:db-types`, `gen:data-model` on a throwaway local
stack), `tooling/scripts/tests/ask/ask-memory.db.test.mjs` (a keep as `learned`), `docs/migration-claims.md`.

## 4. The drafter reads the business and the owner (dashboard server)

Files: `apps/dashboard/src/server/sequences/draft.ts`, `apps/dashboard/src/server/sequences/draft-judge.ts`,
`packages/contracts/src/sequences/new-draft.ts`, `apps/dashboard/src/server/ask/tools/act/sequence.ts`,
`tooling/scripts/tests/fixtures/ask-tools-operator.json` (refrozen by script), `tooling/scripts/tests/sequences/sequence-draft.test.mjs`.

1. Test: the user content carries the description, the services, the tone, the memory lines and the started first
   emails, fenced; none of them when the workspace has none; the RULES carry the voice line; the draft answers the
   learned lines as `voice`.
2. The reads beside the others in `draftSequence`; `draftAsked`'s blocks; the RULES line; `propose_sequence`'s words.

## 5. The paste (contracts, dashboard server, route)

Files: `packages/contracts/src/sequences/new-draft.ts`, `packages/contracts/src/sequences/index.ts`,
`packages/contracts/src/ask-proposals/sequences.ts` (the page verb `sequence_voice`),
`apps/dashboard/src/server/sequences/voice.ts` (new), `apps/dashboard/app/api/v1/sequences/voice/route.ts` (new),
`tooling/scripts/tests/route-policy.json`, then `node tooling/scripts/gen/route-types.mjs` and `gen:api-reference`,
`tooling/scripts/tests/sequences/sequence-draft.test.mjs`.

1. Test (fakeDb, the model stubbed): a paste keeps up to three lines as `learned` and answers them; a line already
   kept is not kept twice; memory full says so; a paste under 40 characters is refused before any call.

## 6. The pages

Files: `apps/dashboard/src/surfaces/campaigns/sequences/new/new-voice.tsx` (new), `new-draft.tsx`, `new.css`,
`apps/dashboard/src/surfaces/campaigns/sequences/leads/preview.tsx`, `tooling/scripts/tests/campaigns/*` (New's draft
and the preview).

1. Test (stub React): a draft to leads with no voice draws the paste, Use posts it and drafts again; one with learned
   lines draws the line and Memory; a draft to people draws neither; the preview draws a lead's fact as its opening.
2. Read `.claude/skills/chanlytics-interface/SKILL.md` first: the field, the button and the note from the kit.

## 7. Settings › Memory

`ASK_MEMORY_WORDS.sources.learned`, drawn as the other sources are.

## 8. Checks, docs and landing

1. Lint uncached on the touched files, typecheck, Prettier, the tests of every touched folder.
2. `docs/system-prd.md` (the sequences sheet), decision 0078's status and README row to built.
3. Commit, `land` (migration: no auto-merge), 00493 to production and read back, merge, smoke.
