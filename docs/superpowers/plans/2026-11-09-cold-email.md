# Cold email, rebuilt: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline, task by task. No sub-agents (Ruben's rule). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Settings › How it reaches out into the approved Cold email page, make a connected mailbox required, and give the backend what the page promises: one answer for where you stand, an email before anything starts, a draft for a new account, running sequences that ask before their words change, and results that say what works.

**Architecture:** Five stages, each shippable alone, in dependency order. A is the page on today's data, plus one change to when first emails wait. B puts the email first. C makes the pitch a versioned record that sequences point at, which is what lets the app say "old words". D makes it learn. E removes sending by hand. The code's internal names (`reach_out`, `admin/outreach`) stay; only what an owner reads changes.

**Tech stack:** Next.js dashboard, Vercel edge functions, Supabase Postgres, the record kit, Claude through `MODEL_ROUTES`.

**Spec:** the approved canvas, https://claude.ai/artifact/DxdtxQsrGr8QW3PYnVUBzC, source `Claude Video/docs/2026-11-09-cold-email-canvas/project/`. Copy on a board is exact unless a task says otherwise. Boards named below: Main, Fresh, TapLine, Sheets, States, Desk, Changes, Wiring, Across.

## Assumed calls (Ruben, overrule any of these)

1. Microsoft stays halted. The "Tell us" line counts who asks.
2. Writing to one lead from their card stays, through the mailbox. Only the open-your-mail-app fallback goes.
3. A sequence's first run always needs an OK, whatever "Before each batch" says.
4. **Found while checking this plan.** After a sequence's first run, its first emails follow "Before each batch". Today they don't: every batch of first emails waits for an OK whatever you pick (decision 0077, `run-reach-out.ts:45`), so the approved page's "Held 30 minutes so you can stop it" isn't true of the emails it matters most for. The canvas missed this. Task 8 changes the rule to match the canvas. On production, two running sequences in the real `chanlytics` workspace would stop waiting for an OK on their daily first emails and take a 30-minute hold instead. No customer has a sequence to leads. Overrule it and Task 8 goes, and the row reads "First emails: every batch waits for your OK", with the choice for follow-ups.

## Where this differs from the canvas

- **Order:** the canvas put the "old words" notice in phase 2 and records in phase 3. A notice needs to know what a sequence was written from, so the pitch record moves up into Stage C, ahead of the notice.
- **Today's card** shows only once a workspace has started cold email (a search or a sequence), not to everyone. Decision 0113 chose not to nag a business that writes no cold email, and this keeps that.
- **Honest copy until Stage C:** in Stage A "What should they do next?" says it changes answers to replies, and the name's sheet says "New sequences sign with this". Stage C restores the canvas's words once they are true.
- **The stop list's "Add someone else"** arrives in Stage D, with the database change it needs. Stage A shows the counts.
- **"Before each batch"** adds one line the canvas lacks: "For new sequences. Each sequence can change its own." It sets Autonomy's default, and that is all it can truthfully do.
- **More than one pitch:** the record allows it (Wiring), but no board draws choosing between pitches, so nothing offers it until one is drawn.
- **New words** are written when you press "See the new words", not at every save (Wiring says after a save), so saving costs no model call.
- **The first draft** is written in the website read's own model call, not a second pass. A website read before this ships holds no draft, so that account gets "What does your business do?".
- **Replies on a fact** wait for Stage D. Until then a fact's row says `In 34 emails` or `Not used yet`.

## Global constraints

- A sequence to leads requires a connected mailbox. Nothing offers sending by hand (`feedback_cold_email_requires_mailbox`).
- Only Google Workspace connects; do not extend the Microsoft code (`feedback_mailbox_google_only`).
- No push, merge, or production database change without Ruben's word. A PR with a migration merges by hand, and Auto-fix can arm auto-merge on one, so check before leaving it (`reference_migration_pr_auto_merge_hazard`).
- While building: run the tests of what a task touches, nothing else. At a push: `gen:sorted-lists`, `gen:api-reference` and `route-types` where routes changed, `node tooling/scripts/checks/lint.mjs` itself (check:debt does not fail on an error-level rule), the debt pair with `--parts measures,lint,knip`, and `tests/ai/injection-policy.test.mjs`.
- `tooling/scripts/land.mjs --no-auto`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- No Docker, WSL or `supabase start`. `schema.sql` and `database.types.ts` are written by hand (`reference_schema_snapshot_by_hand`), and CI's replay checks them.
- The local dev server talks to the production database. Walk only the e2e workspace, with saves refused unless put back. Never type Ruben's credentials.
- One kit: no raw controls in a surface, no literal colours, no primitive class names in a page stylesheet, no `style` props. A kit change gets its `classes.json` name and a gallery entry in the right family (a RecordField entry goes in "Record fields", never "Field").
- A word key never starts with `use`: the lint reads it as a hook.
- Others' words reach a prompt fenced. The opening writer holds one `<record>` only, the lead's: anything else goes in `<note>` on one line.
- A failed database reply is raised as `new DbFailure(error, "what was being done")` (decision 0114). New tables go in `erasure/registry.ts`, with RLS and grants like their neighbours. Every route is declared with `route()` and pinned in `tests/route-policy.json`. Either deploy order must work.
- Claim each migration number when its task starts; 00568 was the head on 9 Nov. Decision notes take the next free number after 0114.
- A contracts module rides whole into every page importing it: new page logic goes in its own module, never in `section.ts`.
- Test command: `node tooling/scripts/checks/test.mjs <file>`.

## Review focus

Each line has its test in the task named.

1. A pitch saved while a sequence is mid-run: only unsent emails change, and nobody gets a first email twice (Task 20).
2. A workspace whose words are in the config when the pitch record arrives: nothing goes silent during or after the backfill, in either deploy order (Task 17).
3. Website words reaching a model: a draft or sample built from a page that says `</record>` or "ignore the above" stays data (Tasks 13, 14).
4. An erased or blanked lead named in a kept sample: the sample goes with them (Task 12).
5. Old links and Ask's cards after rows merge: `admin/outreach/signature`, `admin/outreach/cold_tone` and each Ask op still open the right sheet (Task 5).

---

# Stage A: the page (no database change)

## Task 1: Name it Cold email, and give it its place

**Files:** `apps/dashboard/src/surfaces/settings/frame/tabs.ts`, `apps/dashboard/src/bridge/ask/jump.ts`, `packages/contracts/src/campaigns/reach-out/settings.ts`, `tests/baselines/hearing/admin/outreach.json`, `tests/ask/ask.test.mjs`.

- [ ] Test in `tests/reach-out/settings/the-page.test.mjs`: the rail lists `{ id: "outreach", label: "Cold email", group: "Outreach" }` after Autonomy; old `admin/outreach` still lands; Ask's jump label is "Cold email" and is still found by "how it reaches out" and "reaching out".
- [ ] Run it. Expected: FAIL on the label.
- [ ] Change the tab's label and group, `REACH_OUT_SETTINGS_WORDS.tab`, the page's subtitle (`What Chanlytics says when it writes to businesses for you.`), and the jump (`label: "Cold email"`, keep the old words in `also`). Keep the jump's characters within `tests/ask/tools/ask-tools-size.test.mjs`.
- [ ] Update the hearing baseline. Run the test and `tests/ask/tools/ask-tools-size.test.mjs`. Expected: PASS.
- [ ] Commit: `Settings calls it Cold email, in a group of its own`.

## Task 2: One answer for where it stands

**Files:** create `packages/contracts/src/campaigns/reach-out/standing.ts`, name it in the barrel and `browser.generated.ts`; modify `apps/dashboard/src/server/readers/settings.ts`, `settings.ts` (DTO); test `tests/reach-out/settings/where-it-stands.test.mjs`.

**Produces:**
```ts
export type ColdEmailStandingKind = "no_mailbox" | "reconnect" | "held" | "no_address" | "waiting_ok"
  | "month_used" | "no_one_new" | "not_started" | "ready" | "paused" | "sending";
export interface ColdEmailStandingFacts {
  mailboxes: { state: string; held_why: string | null }[];
  hasAddress: boolean;
  heldEmails: number;
  waitingRun: { id: string; planned: number; searchName: string | null } | null;
  month: { sent: number | null; of: number };
  running: { root_id: string; name: string; sent: number; wroteBack: number; interested: number; waitingLeads: number }[];
  hasSearch: boolean;
}
export interface ColdEmailStep { id: "mailbox" | "address" | "people"; done: boolean; title: string; detail: string | null; hint: string | null }
export interface ColdEmailStanding { kind: ColdEmailStandingKind; headline: string; detail: string | null; act: string | null; steps: ColdEmailStep[] }
export function coldEmailStandingOf(facts: ColdEmailStandingFacts): ColdEmailStanding;
```

- [ ] Test, a table of facts → `kind` + `headline`, in this priority, one row per state on the States board: `held` ("Sending paused to protect your name"); `reconnect` ("Your mailbox needs reconnecting"); nothing running and two or more steps left → `not_started` ("3 things before your first email", steps in the order mailbox, address, people); otherwise no live mailbox → `no_mailbox` ("Connect your mailbox to start sending"); no address with `heldEmails: 12` → `no_address` ("12 emails are waiting for your address"), with none held → a step only; `waiting_ok` ("Your first 10 emails are ready for your OK"); `month_used` ("Paused until December 1"); `no_one_new` ("Clinics · Austin has no one new to write to"); every live mailbox paused by its owner → `paused` ("Your mailbox is paused", act "Open Connections"; no board draws it); nothing running and no step left → `ready` ("Ready for your first sequence", act "Start a sequence"); `sending` with detail `Clinics · Austin: 34 sent, 5 replies, 2 interested`. The other words come from the States board.
- [ ] Run it. Expected: FAIL, module missing.
- [ ] Implement it as pure priority checks, its words beside it. `sent`, `wroteBack`, `interested` come from `reach_out_chain_report` step counts, and `heldEmails` from their `held`, for running chains only. `hasAddress` uses the rule the send holds on (`sender/lanes.ts:161`: a business name and an address), moved to one contracts function both read.
- [ ] In `reachOutSettings`, read the reports with `partOrElse` (a report that fails leaves its numbers out, never a made-up 0), and add `standing` to `ReachOutSettingsDto`. Test in `what-the-page-reads.test.mjs`.
- [ ] Run both. Expected: PASS. Commit: `One answer for where cold email stands`.

## Task 3: Sending, in plain words

**Files:** create `packages/contracts/src/campaigns/reach-out/sending.ts`; modify `readers/settings.ts` (`mailboxShown` becomes every live mailbox); test `tests/reach-out/settings/sending-words.test.mjs`.

**Produces:**
```ts
export interface ColdEmailSending {
  from: string | null; more: number; health: "healthy" | "on_hold" | "reconnect" | "none";
  pace: string | null; ceiling: string | null;
  checks: { ok: boolean; title: string; detail: string }[];
  today: { sent: number; cap: number } | null;
  month: { sent: number; of: number } | null;
}
export function coldEmailSendingOf(mailboxes: MailboxConnectionDto[], month: { sent: number | null; of: number }, nowMs: number, tz: string): ColdEmailSending;
```

- [ ] Test: a new mailbox on a second domain → pace `10 a day now, 20 from Monday`; on the customer's domain at the ceiling → `ceiling` says `That's the most for a mailbox on your main domain.`, and a 7-days-in one never promises 30 (`CUSTOMER_DOMAIN_DAILY_MAX`); DNS missing DMARC → that check not ok; bounces at 0.4% and 4.1% from `counts`; a held mailbox → `on_hold`; month reads `34 sent, of 2,000 included`, never "room for".
- [ ] Run it. Expected: FAIL.
- [ ] Implement it over `mailboxDailyCap`, `MAILBOX_RAMP`, `mailboxHealthWords` and `dns`: no second copy of a rule. "From Monday" is worked out from `sent_days`, and says "in N sending days" where a date can't be promised.
- [ ] Add `sending` to the DTO. Keep `mailbox` until Task 6 stops reading it. Run. Expected: PASS. Commit.

## Task 4: Who never hears from you, counted

**Files:** `packages/db/src/repositories/leads/finder.ts` + barrel, `readers/settings.ts`, `settings.ts`; test `tests/reach-out/settings/who-never.test.mjs`.

- [ ] Test with `fakeDb`: rows of `what` said_no, email_opt_out, customer, erased → `{ said_no: n, asked_to_stop: n, customers: n }`, `erased` never counted, another workspace's never counted.
- [ ] Run. Expected: FAIL.
- [ ] Implement `countLeadSuppressions(db, tenantId)` (members may read, RLS holds it; raise `DbFailure`). Add `never` to the DTO through `partOrElse`.
- [ ] Run. Expected: PASS. Commit.

## Task 5: Two sheets from six rows, and every old address still opens

**Files:** `settings/business/fold-shapes.ts`, `settings/business/folds.ts`, `settings/outreach/fold-tables.ts`, `settings/frame/tabs.ts`, `packages/contracts/src/config/workspace-config/reach-out-change.ts`; tests `each-fold-writes-its-key.test.mjs`, `ask-changes-it.test.mjs`.

**Produces:** folds `sound` (draft `{ tone }`, paths `reach_out.tone`) and `ending` (draft `{ signed_by, signature, phone }`, paths `reach_out.signed_by`, `reach_out.signature`, `reach_out.phone`). `offer`, `who_for`, `fixes`, `proof`, `reply_offer` stay.

- [ ] Test: `ending` opened and saved unchanged writes nothing; a change to one writes only that key; emptied keys go, and the section with its last; a refused signature lands under `signature`, a refused phone under `phone` (`fieldOf`). Old rows open the new folds: `settingsRowRoute("signature")`, `("signed_by")`, `("sign_phone")` → `ending`, `("cold_tone")` → `sound`. Every `ASK_REACH_OUT_ROWS` value is a row that exists, and `set_signature` opens `ending`.
- [ ] Run. Expected: FAIL.
- [ ] Add the two folds through `writeReachOutKey`; drop the three single-key sign-off folds and `cold_tone`; add the aliases to `paneOfRow`/`settingsRowRoute`; update `ASK_REACH_OUT_ROWS` (no Ask tool text changes).
- [ ] Run both test files plus `tests/receptionist/business-tab/business-tab-folds.test.mjs`. Expected: PASS. Commit.

## Task 6: The page, in its new order

**Files:** rewrite `settings/outreach/cards.tsx`; split `offer.tsx` into `pitch.tsx` + `facts.tsx`; replace `writes.tsx` with `sound.tsx` + `ending.tsx`; replace `sends.tsx` with `sending.tsx` + `replies.tsx` + `never.tsx` + `kept.tsx` (rules, exact instructions); create `standing.tsx`; `try.tsx` becomes `sample.tsx`; `apps/dashboard/src/styles/settings.css`; `settings.ts` words; `tests/reach-out/settings/the-page.test.mjs`; `e2e/settings/settings-outreach.spec.ts`; `tests/baselines/on-demand-reads.json`.

**Consumes:** `standing`, `sending`, `never` from Tasks 2-4; `reachOutFold` from `box.tsx`.

- [ ] Test: cards in the order Main draws them (`rec-standing`, `rec-card-sample`, `rec-card-pitch`, `rec-card-facts`, `rec-card-sound`, `rec-card-ending`, `rec-card-sending`, `rec-card-replies`, `rec-card-never`, then the folded rows); exact labels from the copy table on Changes; "Without a mailbox" nowhere; a viewer sees no chevrons and "Only an owner can change these, or connect a mailbox."; amber `standing` for each needs-you kind, quiet for `sending`; with no address the ending's row says `No address yet, and every email needs one.`; `Book through your link` with no booking link says to add one on Details, and with one names it.
- [ ] Run. Expected: FAIL.
- [ ] Build it. `What should they do next?` moves into the pitch card as the `reply_offer` fold (Stage A copy: `Answers to interested replies offer a call.`). `Facts your emails can use` and `Rules every email keeps` take those names. `How your emails end` shows the ending as sent, and the sheet's note says `New sequences sign with this. Signature and phone reach every email as soon as you save.` The sample card keeps today's Try behaviour: it writes on a press, with "Start a sequence to see one" where none runs, until Task 13. Sheets take the Sheets board's words, except the line on what a change reaches, which says today's truth until Task 21: offer `New sequences use this. Running ones use it for their first line.`; who, problem, facts and voice `New sequences use this. Running ones keep their words.` How you sound moves today's learned lines and "Paste an email you wrote" as they are, through the same `sequence_voice` verb.
- [ ] Desk: two columns at the kit's 900px, the sample sticky on the right. Phone: one column, sample after the status. Reuse `.ro-clamp`; port only what's needed from the canvas's `ce.css`, on tokens.
- [ ] Update the e2e spec and the baselines. Run the test file and `tests/repo/trade-neutral.test.mjs`. Expected: PASS.
- [ ] Walk: 390 in Chromium, iPhone size in WebKit, in the e2e workspace with saves refused. Look at the phone and desk against Main and Desk, in both themes (MainDark). Commit.

## Task 7: The sheets that only read, and Before each batch

**Files:** `sending.tsx`, `replies.tsx`, `never.tsx`, `kept.tsx`; test `the-page.test.mjs`.

- [ ] Test: Sending shows the checks, today's meter, month, ceiling, "Open Connections", and "Send more" (with the Sheets board's copy, `get<host>` from `customerDomainWords`); Replies lists the five cases from `writesBackRows`, `Change what's offered` opens the `reply_offer` fold, and a link opens Autonomy, where replies' mode lives; Rules lists the lines from `reachOutRuleLines`, including `Never to your customers, or anyone who said no` and the country line built from `REACH_OUT_COUNTRIES_FREE`/`REFUSED`; Who never hears shows the three counts, and its row says `6 so far.` ("You can add more" waits for Task 24).
- [ ] Test: "Before each batch" offers `SEQUENCE_MODE_WORDS.veto.choice` and `.ask.choice` only (`sequenceModesFor("leads")`), never `auto`; saving writes Autonomy's `outreach` row through the same verb `autonomy/matrix.tsx` saves with; its note reads `For new sequences. Each sequence can change its own.`, under the Sheets board's words.
- [ ] Run. Expected: FAIL. Build them. Run. Expected: PASS. Commit.

## Task 8: After the first run, first emails follow your choice

Assumed call 4. If Ruben overrules it, skip this task, and Task 7's row reads `First emails: every batch waits for your OK`, with its choice for follow-ups.

**Files:** `packages/core/src/campaigns/run-reach-out.ts`, `packages/contracts/src/campaigns/sequences/words/flow.ts`, `packages/contracts/src/campaigns/sequences/lead-build/steps.ts`, `packages/contracts/src/campaigns/reach-out/leads/standing.ts`, `packages/contracts/src/leads/card.ts`, `apps/dashboard/src/surfaces/campaigns/sequences/leads/runs-sheet.tsx`, `docs/decisions/0077-a-cold-email-ends-as-its-sequence-says.md`; tests `tests/reach-out/core-run-reach-out.test.mjs`, `tests/sequences/sequence-words.test.mjs`, `tests/campaigns/lead-sequence-build.test.mjs`, `tests/leads/workbench/workbench-words.test.mjs`, `tests/leads/workbench/lead-card.test.mjs`.

- [ ] Test in `core-run-reach-out.test.mjs`, replacing "a chain fed by a list asks before every first email": list-fed, `words_ok_at` empty, mode `veto` → asks; list-fed, `words_ok_at` set, mode `veto` → a batch held `PLAYBOOK_VETO_DELAY_MS` that goes unless stopped; mode `ask` → asks; an unknown mode → asks; a follow-up step behaves as it does today.
- [ ] Test the words: a sequence's line, its How it runs sheet and a lead card's "Goes tomorrow from 9 AM" say what the run will do for that sequence's mode and words, never "asks you before each first email" for a veto sequence whose words are OK. How it runs has one row, `Before each batch`, with the same two choices as the Cold email page.
- [ ] Run. Expected: FAIL.
- [ ] Remove the `fed_by === "list"` clause at `run-reach-out.ts:45`, keeping `fed_by` for the words that name a list. Replace `asksFirstEmail`, `firstEmails` and `followUpModes` with `SEQUENCE_MODE_WORDS`. Amend 0077 (its fourth finding and item 5) with Ruben's word and the date.
- [ ] Run those tests plus `tests/sequences/sequence-record-reads.test.mjs`. Expected: PASS. Commit.
- [ ] Before this reaches production, tell Ruben again which of the `chanlytics` workspace's sequences will start going after a hold, so he can set them to `Ask me` first.

## Task 9: A mailbox is required

**Files:** `campaigns/sequences/new/new-sheets.tsx`, `new-model.ts`, `new-draft.tsx`; `packages/contracts/src/campaigns/sequences/new-draft/checks.ts`, `lead-build/steps.ts`, `reach-out/sheet/words.ts`; `apps/dashboard/src/server/campaigns/sequences/bodies.ts`; `apps/dashboard/src/server/ask/tools/act/leads/cold-email-card.ts`, `sequence/cold-email.ts`; `surfaces/leads/sheet/dock-asks.tsx`; tests in `tests/sequences/`, `tests/ask/`, `tooling/evals/ask-cases.json`.

- [ ] Test: New has no "you send" choice; with no mailbox it shows `Connect your mailbox` and returns to the same draft after connecting; `POST reach-outs` with `owner_sends: true` is refused in words for a NEW sequence, while an existing by-hand one still runs and saves (until Task 27); Ask's card offers no by-hand sequence and names the mailbox; the lead card's draft sends through the mailbox or asks to connect, with no `mailto`; "Google or Microsoft" is gone from `sheet/words.ts`; New and Ask's card take their mailbox and address answers from `coldEmailStandingOf`, so they say what the page says.
- [ ] Run. Expected: FAIL. Implement it. Keep `ask-tools-size` and `tests/fixtures/ask-tools-operator.json` green. Run. Expected: PASS. Commit.

## Task 10: The road to a mailbox

**Files:** create `settings/outreach/connect.tsx`; `packages/contracts/src/email/mailbox-connect.ts` (words only); `apps/dashboard/app/api/v1/settings/reach-out/provider-wanted/route.ts` + `tests/route-policy.json`; `DASHBOARD_LOG_EVENTS` or `emitEvent` literal as the code conventions say.

- [ ] Test: the sheet carries the three promises from Fresh; `free_mail` opens "That's a personal address", `not_workspace` opens "Not on Google Workspace?"; the words are the owner's, with no "Exchange" or "Microsoft 365 admin" on this path; "Tell us" posts a provider name (short, trimmed, role-gated, rate-limited), records one event, stores nothing else.
- [ ] Run. Expected: FAIL. Implement it over the existing Google connect start, returning to `admin/outreach`. Run `gen:api-reference` and `route-types`. Run. Expected: PASS. Commit.

## Task 11: Ways in, and one word

**Files:** `surfaces/today/setup-card-code.ts` and its card; `surfaces/leads/page/`; `surfaces/setup/first-run/golive/`; `surfaces/reports/lenses/campaigns-reach-outs.tsx`; `packages/contracts/src/shell/` route words; `docs/glossary.md`, `docs/system-prd.md`; `docs/decisions/` (amend 0113, new note: a mailbox is required) + `README.md`.

- [ ] Test: Today's card appears only with a search or sequence AND a needs-you standing, and never for a business with neither; it shows the same headline as the page. Leads and New link to Cold email. Owner-read words "Reach-outs", "reach-out" and "first emails" read "Cold email" where an owner reads them; storage, routes and Ask tool names are unchanged, and old addresses still land.
- [ ] Run. Expected: FAIL. Implement it. Run those tests plus `tests/docs/`. Expected: PASS. Commit.

**Stage A gate:** show Ruben on a phone. Push on his word.

**The end-to-end review of Stage A (9 Nov 2026), and where it differs from the tasks above, on purpose:**

- Setting up has four steps, not three: "Say what you sell" joined the mailbox, the address and the people, since an
  email with nothing to say is the first thing a reply notices. A workspace that has written before is never held back
  by it alone.
- Today's line is decided by its own read: two reads say whether a workspace has started cold email (a search or a
  sequence), and nothing else is read for one that has not (Task 11's rule, without asking the browser).
- Who never hears counts all three by address: said no, asked to stop, and customers (Task 4).
- The rule that a mailbox is required is the database's too (00585), and Start and Turn back on are held to it.
- Still owed: the gate above, on his phone. The connect helpers move out of Settings with Stage B, as planned.

---

# Stage B: the email first

## Task 12: Keep a sample

**Files:** `supabase/migrations/<claimed>_a_sample_email_is_kept.sql`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md`; create `packages/db/src/repositories/campaigns/reach-out/sample.ts` + barrel; `erasure/registry.ts`; test `tests/reach-out/settings/a-kept-sample.test.mjs`.

**Produces:** table `reach_out_samples(tenant_id uuid primary key, fingerprint text not null, lead_id uuid null references leads on delete cascade, sample jsonb not null, made_at timestamptz not null default now())`, member select, service-role write. Functions `findKeptSample(db, tenantId)`, `keepSample(db, row)`.

- [ ] Test: keep and find one row per workspace; another workspace's never reads; blanking a lead removes its sample (trigger on `leads.blanked_at`/`erased_at`, or inside `lead_blank`, whichever the replay proves); the registry names every column.
- [ ] Run. Expected: FAIL. Write them. Run. Expected: PASS (the database half is CI's). Commit.

## Task 13: Write a sample with nothing started

**Files:** `apps/edge/lib/campaigns/reach-out/preview.ts`, `preview-run.ts`, `packages/contracts/src/campaigns/reach-out/edge-doors.ts`; create `apps/dashboard/src/server/drafts/sample.ts`; `apps/dashboard/app/api/v1/settings/reach-out/sample/route.ts`; `readers/settings.ts`; test `tests/reach-out/settings/the-sample.test.mjs`.

**Produces:**
```ts
export const coldEmailFingerprint: (inputs: { offer: string | null; who_for: string | null; fixes: string | null; next: string | null; facts: readonly string[]; tone: string | null; ending: string }) => string;
export interface ColdEmailSampleDto { fingerprint: string; stale: boolean; to: { name: string; example: boolean }; first: { subject: string | null; parts: TryPart[]; ending: string; foot: string }; next: { after_days: number; parts: TryPart[] } | null; check: string }
```

- [ ] Test: with a running sequence it writes from that sequence's words; with none it drafts words once through `draftSequenceFrom` from the pitch; with no search it uses `reachOutExampleRecord()` and says so; a kept sample whose fingerprint matches costs no model call; a changed row marks it `stale`; past Ask's day it keeps the last and says so, never an error; a held one returns the hold's words; website words containing `</record>` stay fenced; a viewer's open reads the kept sample and never writes one.
- [ ] Run. Expected: FAIL.
- [ ] `previewOne` takes `searchId` or a `record`; the door's body allows either. The route's `route()` declares `spend`, operator role, rate. Run `gen:api-reference`, `route-types`. Run. Expected: PASS. Commit.

## Task 14: A first draft, and facts found

**Files:** `packages/contracts/src/imports/business-reads.ts`, `apps/edge/lib/imports/website-read.ts`; `packages/contracts/src/ai/models/routes.ts` (route `pitch_draft`, Haiku, as `website_read`); create `apps/dashboard/src/server/drafts/pitch.ts` + `app/api/v1/settings/reach-out/draft-pitch/route.ts`; `readers/settings.ts`; tests `tests/reach-out/settings/the-first-draft.test.mjs`, `tests/imports/`.

**Produces:** `BusinessReadFacts` gains `pitch: { offer: string | null; who_for: string | null; fixes: string | null } | null` and `claims: string[]`, in the read's existing model call (no second call); `businessReadFactsOf` reads a row from before them as null and `[]`. DTO gains `draft` and `found_facts: { text: string; from: "website" | "google_profile" }[]`.

- [ ] Test: the schema and system prompt ask for them "only from what the pages say"; the same data-not-instructions rule holds a page saying "ignore the above"; `draft` shows only while the section holds no offer; a read from before this has `pitch: null`, and the page offers the no-website door; `found_facts` omits what the owner already has, and takes the rating from `google_listings` (`rating`, `review_count`: no call out, and no row means no such fact); `POST draft-pitch { words }` makes one call, fences the words, returns a draft, and stores nothing.
- [ ] Run. Expected: FAIL. Implement it. Run those plus `tests/ai/injection-policy.test.mjs`. Expected: PASS. Commit.

## Task 15: The sample and the draft on the page

**Files:** `settings/outreach/email-preview.tsx`, `pitch.tsx`, `standing.tsx`, `facts.tsx`; `apps/dashboard/src/server/campaigns/sequences/test-mail.ts`; test `the-page.test.mjs`.

- [ ] Test: Fresh's four phones, in order. A draft shows `We drafted your pitch from your website` and "Use this pitch" saves all its keys in one save; editing a draft row stays unsaved until then; with no website, "What does your business do?" drafts through Task 14, beside `Add your website so it can read it` and `Fill it in myself`. Facts shows found facts with Add, and with none saved takes the "No facts yet" sheet's words. The sample has First email / Follow-up tabs, marks and legend, `Checked: nothing guessed, no link, no price`, a held state; tapping a marked line opens what wrote it (`words` → the pitch, `proof` → facts, ending → `ending`), the line under it says Tap on a phone and Click at a desk, and "their listing" says it comes from their listing; "Email it to me" mails only the member; an example business says so. Auto-writes at most once per fingerprint, never past the day's budget.
- [ ] Run. Expected: FAIL. Build it. Run. Expected: PASS. Walk on a phone. Commit.

## Task 16: New starts from the pitch, and Leads from who it's for

**Files:** `apps/dashboard/src/server/drafts/sequence.ts`, `campaigns/sequences/new/`, `packages/contracts/src/campaigns/sequences/new-draft/checks.ts`, `surfaces/leads/finder/`; tests `tests/sequences/sequence-draft.test.mjs`, `tests/leads/`.

- [ ] Test: `POST sequences/draft` with no typed line writes from the pitch, with a line takes it as extra; with neither pitch nor line it asks for one; New shows "Written from your pitch" with a door here. A new search with an empty box offers who-for as one press, never filled by itself.
- [ ] Run. Expected: FAIL. Implement it. Run. Expected: PASS. Commit.

**Stage B gate:** show Ruben. Migration on his word; PR merges by hand.

---

# Stage C: the pitch is a record, and sequences ask

## Task 17: Pitches, versions and facts

**Files:** `supabase/migrations/<claimed>_a_pitch_is_a_record.sql`, `schema.sql`, `database.types.ts`, `docs/data-model.md`, `docs/sql-map.md`; create `packages/db/src/repositories/campaigns/pitch.ts` + barrel; `erasure/registry.ts`; create `packages/contracts/src/campaigns/reach-out/pitch.ts`; test `tests/reach-out/pitch/the-record.test.mjs`.

**Produces:**
- `pitches(id, tenant_id, name, is_default, created_at)`, at most one default per workspace.
- `pitch_versions(id, pitch_id, tenant_id, n, offer, who_for, fixes, next_step, tone, fact_ids uuid[], source text check (source in ('owner','draft','ask','backfill')), created_by, created_at)`, unique `(pitch_id, n)`, append only.
- `pitch_facts(id, tenant_id, pitch_id, words, source, vouched_at, removed_at, kind text default 'words')`.
- `sequences.pitch_version_id uuid null references pitch_versions`, `sequences.pitch_kept_version_id uuid null`.
- SQL `pitch_write(p_tenant_id, p_changes jsonb, p_source text)` (definer, role-checked, in one transaction) adds a version only when something changed, and answers it. A new definer door: gate it or name it in `NOT_A_SEATS_DOOR` (`reference_definer_door_second_factor_catalog`).
- `findLivePitch(db, tenantId)`, `findPitchVersion(db, id)`, `writePitch(db, tenantId, changes, source)`.
- Backfill: one default pitch and version per workspace with a `reach_out` section, keys copied, config untouched.

- [ ] Test: a no-change write adds no version; each change adds one, with the facts' ids; a removed fact stays for history; another workspace's can't read or write; a member below operator is refused by the door's words (`DbFailure` keeps them); the backfill makes the same words the writers read today, and is re-runnable.
- [ ] Test the deploy order: writers read the live version, else the config's `reach_out`, so old code and new code both write sensible emails until Task 27 drops the fallback.
- [ ] Run. Expected: FAIL. Write them. Run. Expected: PASS (database half is CI's). Commit.

## Task 18: The page and Ask write the record

**Files:** `settings/outreach/box.tsx`, `pitch.tsx`, `facts.tsx`, `sound.tsx`, `fold-tables.ts`; `settings/business/gestures/editor.tsx` (`opensOn` checked ahead of the `door` branch); create `app/api/v1/settings/reach-out/pitch/route.ts`; `packages/contracts/src/ask/proposals/workspace.ts`, `reach-out-change.ts`; tests `each-fold-writes-its-key.test.mjs`, `ask-changes-it.test.mjs`.

- [ ] Test: pitch rows, facts and tone save through the route, using BtFold's `door` and the same limits (`reachOutProblems`); a fold that opened on a fallback saved unchanged writes nothing; sign-off keys still save in the config. Each Ask pitch op writes a version with source `ask`, opens the same row, and leaves Ask's tool text as it was.
- [ ] Run. Expected: FAIL. Implement it. Run plus `tests/ask/tools/ask-tools-size.test.mjs`. Expected: PASS. Commit.

## Task 19: Every writer reads the version

**Files:** `drafts/sequence.ts`, `leads/draft.ts`, `drafts/reach-out-told.ts`, `drafts/sequence-rewrite.ts`, `apps/edge/lib/campaigns/reach-out/check-one.ts`, `sender/lanes.ts`, `apps/edge/lib/drafts/writer.ts`, `apps/edge/lib/shared/tenant-runtime.ts`, `packages/contracts/src/campaigns/reach-out/section.ts`, `opening.ts`; `apps/dashboard/src/server/campaigns/reach-outs/chain-acts.ts`; tests `tests/reach-out/settings/the-writers-read-it.test.mjs`, `tests/reach-out/reach-out-check.test.mjs`, `tests/reach-out/reach-out-opening.test.mjs`.

- [ ] Test: a new sequence stamps the live version; a running sequence's opening writer reads ITS version, not the newest; the drafter is told `next_step` and writes the ask from it ("Worth a ten-minute call next week?" for a call, a reply for "Just reply", no link in a first email for booking); answers to replies read the same word; "What they do" stays `<note>` and one `<record>`; `checkWorkspaceOf` caches per tick and reads each version once.
- [ ] Test: a sequence with no own `signed_by` signs with the workspace's name at send; one with its own keeps it; `no_signed_by` still holds where neither exists.
- [ ] Run. Expected: FAIL. Implement it. Run those plus `tests/ai/injection-policy.test.mjs`. Expected: PASS. Commit.

## Task 20: "Old words", and approving new ones

**Files:** `readers/settings.ts`; create `apps/dashboard/src/server/drafts/new-words.ts`, `app/api/v1/sequences/[id]/new-words/route.ts`; `chain-acts.ts`; `settings/outreach/standing.tsx`, create `new-words.tsx`; `campaigns/sequences/leads/runs-sheet.tsx`; test `tests/reach-out/pitch/old-words.test.mjs`.

- [ ] Test: a running sequence below the live version, not kept, shows `Clinics · Austin still sends your old words`; "Keep them" sets `pitch_kept_version_id`, and it asks again only on a newer version; the route rewrites each email step from the new version through the rewrite's rules, one model call a step, returns Now/New, saves nothing.
- [ ] Test: "Use the new" goes through `saveChain` (judged like typed words, `words_ok_at` reset so the batch waits for an OK), stamps the version; leads with `own_words` keep theirs; **a lead already sent the first email gets no second first email** (`sequence_sends_one_first`); sent emails are untouched; follow-ups not yet sent use the new words.
- [ ] Run. Expected: FAIL. Build it, with TapLine's copy. Sheets say `New emails use this as soon as you save. You'll be asked about <name>, which is already running.` A sequence's sheet says `Written from your pitch, <date>`. Run. Expected: PASS. Walk. Commit.

## Task 21: The true words

**Files:** `settings.ts`, `pitch.tsx`, `ending.tsx`; test `the-page.test.mjs`.

- [ ] Test: the canvas's copy returns: "Emails ask for a call, and answers to interested replies offer one."; ending's note `Every email uses this as soon as you save. Your address comes from Details.`
- [ ] Run. Expected: FAIL. Change them. Run. Expected: PASS. Commit.

**Stage C gate:** show Ruben. Migration on his word; PR merges by hand.

---

# Stage D: it learns

## Task 22: Results per pitch, fact and opening

**Files:** migration `<claimed>_what_each_fact_earned.sql` (`sequence_steps.fact_ids uuid[]`, SQL read `cold_email_results`), `schema.sql`, `database.types.ts`; `chain-acts.ts` (stamp at save, by the words a step holds); `readers/settings.ts`; `facts.tsx`; `surfaces/reports/lenses/campaigns-reach-outs.tsx`; test `tests/reach-out/pitch/results.test.mjs`.

- [ ] Test: a fact's row reads `In 34 emails, 5 replies` and survives an edit to its words; counted once per lead; a read that fails leaves the line out, never a 0; per pitch version and per opening style; Reports links here. Replaces `stepsCarrying`'s text match.
- [ ] Run. Expected: FAIL. Implement as one grouping query, tested at volume by its index. Run. Expected: PASS. Commit.

## Task 23: Facts that stay true

**Files:** `pitch.ts` (contracts), `facts.tsx`, `apps/dashboard/src/server/campaigns/sequences/numbers.ts`, `drafts/sequence.ts`; test `tests/reach-out/pitch/facts-stay-true.test.mjs`.

- [ ] Test: a fact vouched for over a year ago asks `Still true?` with Yes (bumps `vouched_at`) and Remove; a `listing_rating` fact reads `google_listings` when an email is written, and `numberBacking` accepts that number and refuses a stale one; a listing that can't be read leaves that fact out of the email.
- [ ] Run. Expected: FAIL. Implement it. Run. Expected: PASS. Commit.

## Task 24: Your own entries on the stop list

**Files:** migration `<claimed>_an_owner_adds_to_the_stop_list.sql` (`what` gains `owner`), `schema.sql`, `database.types.ts`; create `app/api/v1/settings/reach-out/never/route.ts`; `never.tsx`, `readers/settings.ts`; test `tests/reach-out/settings/who-never.test.mjs`.

- [ ] Test: adding `competitor.example` or `a@competitor.example` stores the hash with `what: owner` through `lead_suppression_hash`; `lead_addresses_suppressed` then refuses both forms; a free mail domain as a whole is refused in words; the sheet shows counts and says `so this shows how many, not who`; adding leaves running sends for that address held, not sent.
- [ ] Run. Expected: FAIL. Implement it, with its SQL door. Run. Expected: PASS. Commit.

## Task 25: A name for each mailbox

**Files:** migration `<claimed>_a_mailbox_signs_as_someone.sql` (`mailbox_connections.signed_by text null`, within `SIGNED_BY_MAX`), `schema.sql`, `database.types.ts`; `sender/lanes.ts`, `reach-out/rules.ts` (`coldEndingOf`), `preview.ts`; `sending.tsx`; test `tests/reach-out/settings/a-name-per-mailbox.test.mjs`.

- [ ] Test: order is the sequence's own name, then the mailbox's, then the workspace's; a sequence sharing two mailboxes signs each email with that mailbox's; `{{your name}}` in the words reads the same name; the sample matches what's sent.
- [ ] Run. Expected: FAIL. Implement it. Run. Expected: PASS. Commit.

## Task 26: One suggestion at a time

**Files:** create `packages/contracts/src/campaigns/reach-out/suggestion.ts`; `settings/outreach/standing.tsx`; test `tests/reach-out/pitch/one-suggestion.test.mjs`.

- [ ] Test: from results only, no model: no facts after 20 emails → add one; a fact in 50+ emails with no replies while another earns them → try the other; an empty who-for → fill it. Never more than one, never with a needs-you standing showing, dismissal remembered per suggestion. No new Ask tool (the owner tools are near their ceiling); Ask reads the same results through its existing read.
- [ ] Run. Expected: FAIL. Implement it. Run. Expected: PASS. Commit.

**Stage D gate:** show Ruben. Migrations on his word; PR merges by hand.

---

# Stage E: sending by hand goes

## Task 27: Remove it

Nothing here is reachable after Task 9, except by the two demo sequences.

**Files:** create `tooling/scripts/ops/demos-leave-by-hand.mjs`. Delete `surfaces/campaigns/reach-out/to-send.tsx`, `surfaces/waits/to-send-part.tsx`, and `owner_sends`, `REACH_OUT_DRAFTS_PER_DAY`, `TO_SEND_ROUTE` and their branches across about 120 files, including tests: `run-reach-out.ts`, `replan.ts`, `run-context.ts`, `sender/sender.ts`, `approval.ts`, `draft.ts`, `dtos.ts`, `lead-build/mailboxes.ts`, `lead-build/steps.ts`, `sheet/chain.ts`, `sheet/words.ts`, `runs-sheet.tsx`, `lead-steps.tsx`, `preview.tsx`, `see/over.ts`, `waits/rows.ts`, `waits/wait-rows.tsx`, `inbox/rules.ts`, `inbox/store.ts`, `shell/address.ts`, `tooling/scripts/e2e-harness/copy-states.mjs`, `tooling/evals/ask-cases.json`. Remove the config fallback from Task 17.
- [ ] Script (dry-run by default, backup first, `--apply`): gives `chanlytics-demo` and `chanlytics-demo-quiet` a `paused` example.com mailbox and points their by-hand steps at it. Applied on Ruben's word only, before this PR merges.
- [ ] Test: `inbox/to-send` lands on Campaigns; Today and Inbox draw no To send part; no row in production holds `owner_sends` (asserted by the script's read-back).
- [ ] Remove the code. Run the tests of every touched folder, the typecheck, and `lint.mjs`. Expected: PASS. Commit.

## Task 28: Drop the column

**Files:** migration `<claimed>_nobody_sends_by_hand.sql` (drop `sequence_steps.owner_sends`, `p_chain->>'owner_sends'` from `sequence_create_leads`), `schema.sql`, `database.types.ts`, `docs/data-model.md`, `docs/sql-map.md`.

- [ ] Only after Task 27 is live on production. Test: `sequence_create_leads` takes a chain with no such key. Run. Expected: PASS. PR merges by hand, on Ruben's word.
