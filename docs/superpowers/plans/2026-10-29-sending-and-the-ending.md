# Sending and the ending: the build

The spec is `docs/superpowers/specs/2026-10-29-sending-and-the-ending-design.md` (lane 3 of the cold email redesign,
decisions D4, D7, D10 and D11, approved by Ruben on 29 Oct 2026), and the decision note is 0077. Written against
`b2ce4d6d4`, built on `sequences/how-a-cold-email-ends` in the `cm-lead-sending` worktree, one local branch, one pull
request at the end. No commit or push until Ruben's word. The migration takes its number only when the lane is about
to push (`Claude Video/docs/migration-claims.md`), and goes to production by hand before the merge, on his word
(task 9).

Each task writes its test first and runs that one file, red, then makes it pass (`node tooling/scripts/checks/test.mjs
<file>`, one file per run, never an empty file argument). Lint, typecheck, format and dead exports run once, in task 9.

## 1. The ending's rule (contracts)

Files: `packages/contracts/src/reach-out/reach-out-ending.ts` (new), `packages/contracts/src/reach-out/index.ts`,
`tooling/scripts/tests/reach-out/reach-out-ending.test.mjs` (new).

1. Test: `coldEndingOf` for the name; for a mailbox; a first email whose signature has a link ends with the name; a
   follow-up keeps that signature; words whose last line is `{{your name}}` get no second name; an empty Signed line
   gets no sign-off; a mailbox with no signature words falls back to the name.
2. `coldEndingOf({ signsWith, signedBy, signature, first, body })` as the spec says, reading `linkCount` and
   `slotCount` from `reach-out-words.ts`; `REACH_OUT_SIGNS_WITH = ["name", "mailbox"] as const` and its type.
3. Run `node tooling/scripts/gen/contracts-browser-entry.mjs` after the export, or the app answers 500.

## 2. The chain's shape (contracts)

Files: `packages/contracts/src/reach-out/reach-out-schemas.ts`, `reach-out-dtos.ts`, `reach-out-draft.ts`,
`packages/contracts/src/sequences/sequence-lead-build.ts`, `packages/contracts/src/sequences/sequence-test.ts`,
`tooling/scripts/tests/campaigns/lead-sequence-build.test.mjs`.

1. Test (pace): one new mailbox gives "10 · one every 30 min" and "9 · one every 60 min"; two give "20 · one every 30
   min" and "18 · one every 60 min"; a saved 12 shows its own choice, "10 · one every 12 min".
2. `leadPaceChoicesOf(mailboxes, saved)`: the slowest gap per count, the saved one added where it is none of them.
3. `ReachOutChainSchema.signs_with` (default `name`), `ReachOutDraft.signs_with`, `reachOutDraftOf` and
   `reachOutChainBodyOf`; `ReachOutChainDto.signs_with` and `mailbox_choices` (`ReachOutMailboxChoice`).
4. The words in `LEAD_BUILD_WORDS.runs` the spec names; `leadStepTestMail`'s `ending`.

## 3. A signature's lines (channels)

Files: `packages/channels/src/mailbox/mailbox-signature.ts`, `tooling/scripts/tests/email/mailboxes/mailbox-signature.test.mjs`.

1. Read the stored HTML of the signature whose lines ran together (production, read only, through the edge's admin read
   or the Settings sheet's source): note its shape (table cells, spans, `<br>`), keep none of its words.
2. Test: a synthetic signature of that shape (a made-up name, example.com, a 555-01xx number) reads line by line, and the
   two shapes the test holds today read as they do now.
3. The converter's selectors: each table cell and each block on its own line; nothing else changes.

## 4. The database

Files: `supabase/migrations/<next>_a_cold_email_ends_as_its_sequence_says.sql` (new),
`tooling/scripts/tests/reach-out-sheet/a-sequence-ends-as-it-chooses.db.test.mjs` (new), then the generated files.

1. Test (db, against the local stack): the column, its default `name` and its check; `reach_out_save` keeps
   `signs_with` and leaves it when the body has no key; `sequence_create_leads` ticks only the connected mailboxes whose
   SPF and DKIM are not missing, every connected one when none is, and writes `gap_minutes` 20.
2. The migration: the column; `reach_out_save` as 00472 wrote it with the two lines; `sequence_create_leads` as 00465
   wrote it with the gap and the mailbox list; comments; a lock timeout as the recent files set it.
3. `corepack pnpm gen:db-types`, `gen:schema-sets`, `gen:schema-snapshot`, `gen:data-model`; the ledger and
   `migration-claims.md` only at push.

## 5. The send, the owner's draft and the preview (db and edge)

Files: `packages/db/src/repositories/reach-out.ts` (`sendStanding`), `apps/edge/lib/reach-out/request.ts`,
`apps/edge/lib/reach-out/sender.ts`, `apps/edge/lib/reach-out/preview.ts`, `apps/edge/lib/reach-out/preview-run.ts`,
`tooling/scripts/tests/reach-out/reach-out-request.test.mjs`, the preview door's test.

1. Test (request): words, "Ruben", foot for `name`; words, signature, foot for `mailbox`; a first email from a mailbox
   whose signature has a link ends with "Ruben"; the owner's draft carries the sign-off and no signature.
2. Test (preview): the preview's email ends as the send's would, from the first mailbox the chain writes from.
3. `sendStanding` reads `signs_with`; `RequestInput.signsWith`, `DraftInput.signsWith`; `reachOutRequest` and
   `reachOutDraft` take their ending from `coldEndingOf`; the sender passes the root's choice.
4. The preview's body gains `signs_with` and `mailbox_id`, each checked as the others are; `previewOne` writes from that
   mailbox's row (read by id, this workspace's) or the stand-in with no signature.

## 6. The chain read, the test mail and the preview request (dashboard server)

Files: `apps/dashboard/src/server/campaigns/reach-outs.ts`, `apps/dashboard/src/server/sequences/test-mail.ts`, the
preview's route and server call, their tests.

1. Test: `chainsOf` answers `signs_with` and `mailbox_choices` (picked by `reachOutWritesFrom`, removed ones aside, DNS,
   day, ramp, signature words and whether they hold a link); the test mail's text holds the ending.
2. Build them from the rows `chainsOf` reads now; the signature's words from channels `mailboxSignatureOf`.
3. The preview request carries `signs_with` and the first picked mailbox's id. Regenerate the typed client and
   `docs/api.md` if a route's input changed.

## 7. How it runs (dashboard surface)

Files: `apps/dashboard/src/surfaces/campaigns/sequences/leads/runs-sheet.tsx`, `use-chain.ts` if it must carry the new
keys, `build.css` (layout only, tokens only), `tooling/scripts/tests/campaigns/lead-sequence-build.test.mjs`.

1. Test (sheet): the mailbox rows with their ticks, days, states and DNS lines; the last tick cannot be taken off; a
   sequence that names none says every mailbox; "Every batch of first emails waits for your OK" and Follow-ups with its
   two choices; Ends with offers the name and the first picked mailbox's signature, with the link line.
2. Draw them from the kit only (Picker, LinkButton, Switch for the ticks); Set up DNS opens Settings › Connections (the
   spec's open question decides whether its DNS sheet opens with it).
3. The words from contracts only; the receipts as the sheet's saves give them now.

## 8. The decision note and the docs

Files: `docs/decisions/0077-a-cold-email-ends-as-its-sequence-says.md`, `docs/decisions/README.md`,
`docs/glossary.md` (Ends with, Follow-ups, if the glossary names How it runs' rows), `docs/system-prd.md` if How it
runs is described there.

The note's status moves from "decided, not built" to "built on the lane" when task 7 passes.

## 9. Proof

1. `corepack pnpm -r typecheck`; `LINT_CACHE=0 corepack pnpm lint` (no new error; warnings at the baseline);
   `corepack pnpm format`; `corepack pnpm check:dead-exports`.
2. The tests of every folder touched, one file per run, then `node tooling/scripts/checks/changed-tests.mjs`.
3. The db suites touched, against the local stack (`corepack pnpm test:db` with the stack up).
4. `check:debt` by hand where it cannot run here (no new copies, no file over 800 lines, no function over 150).
5. Look at the sheet in the real app (the dashboard dev server on this lane, signed in as Ruben's workspace through
   `dev-tools/live-signin.mjs`), in light and dark, desk and 390 px: the rows, the last tick, the ending's two choices,
   and the record's preview ending as a send would.
6. Then Ruben's word to commit, and `node tooling/scripts/land.mjs --title ... --body-file ...` (a pull request that adds
   a migration merges by hand, or with `--applied` once it is on production). The PR says the ending of every live
   sequence changes at deploy, and what to apply: the migration goes to production **before** the merge, on his word,
   as 00490 did, since the edge's `sendStanding` selects the new column. After that the two apps deploy in either order:
   a dashboard before the edge saves a key the old edge ignores, and an edge before the dashboard reads `name`.
