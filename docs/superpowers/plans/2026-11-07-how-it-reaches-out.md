# How it reaches out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ruben's rule overrides the skill's defaults: the code is written by hand in one lane, and no lint, typecheck or test runs until Task 9.

**Goal:** A Settings page, *How it reaches out*, beside *How it answers*, holding everything a cold email is written from: what the business offers, the claims it may make, its voice, its sign-off, where it sends from, what a reply sets off, the rules it keeps, what each writer is told, and one real email before any goes.

**Architecture:** One new section of the workspace config, `reach_out`, saved through Settings' existing one saver and read by the three writers that exist today (the sequence drafter, the opening writer at the edge, the reply drafter). One new GET read for what the page shows beyond the config (the mailbox's standing, the month's count, the claims' counts, the learned voice lines, the newest sequence). The page is a fourth part of the business record (`BusinessPart` gains `"outreach"`), drawn by the record kit's cards, rows and folds, in a folder of its own. No migration: the config is JSON, and every count is read, not stored.

**Tech Stack:** TypeScript; Next.js dashboard (`apps/dashboard`); the Vercel edge (`apps/edge`); `@chanlytics/contracts` (zod, pure words and rules); `@chanlytics/db` (Supabase); node:test on the stub React (`tests/`); Playwright (`e2e/`).

**Spec:** the canvas *How it reaches out*, Version 3: https://claude.ai/artifact/D8PWxJnxdSgVmoy4UHAXXu, source `Claude Video/docs/2026-11-07-reaches-out-canvas/project/` (Main, Sheets, Changes, Wiring, Phone). Its words are the page's words. The facts it was checked against are in memory `project_chanlytics_outbound_settings_gap_2026_11_07.md`.

## Global Constraints

- **The lane:** `git -C chanlytics-messaging worktree add ../cm-reaches-out -b reach-out/how-it-reaches-out origin/main`, then `corepack pnpm install --frozen-lockfile` there (tests/ is a workspace package since #2154). First commit: this plan copied to `docs/superpowers/plans/2026-11-07-how-it-reaches-out.md`.
- **Ruben's build rules:** I write every line by hand (no sub-agents for code); no lint, typecheck, test or CI run until Task 9; nothing pushed, no PR, until he has seen it work and said so; one lane, one PR.
- **No migration.** `reach_out` is a JSON section of `tenants.config`. If a task finds it needs a column, stop and say so.
- **Names:** the config section is `reach_out` (as the `reach_out_*` tables and `campaigns/reach-out/` modules), never `outreach`: `config.policy.outreach` is the Autonomy class. The Settings tab id is `outreach`, its label "How it reaches out", icon `send`, group `Receptionist`, between How it answers and Autonomy; its addresses are `admin/outreach` and `admin/outreach/<row>`.
- **Nothing loosens.** The opening's reader, the one-link rule, `REACH_OUT_WORDS_MAX` 120, the 9-to-5 window, `MAILBOX_RAMP` and every hold stay exactly as they are. A workspace with no `reach_out` section behaves as today: every reader falls back (offer ← `business_records.about` ← `config.ask.goal`; tone ← the receptionist's).
- **Limits (contracts, one table):** offer 300 chars, who it's for 120, what you fix 200, a claim 140, claims 5, cold tone 200, signs as `SIGNED_BY_MAX` (60), signature 160 chars and 3 lines, phone 40.
- **File rules the debt check holds:** no file over 800 lines (`folds.ts` 762, `save.tsx` 793, `answers.tsx` 729, `who.tsx` 662 are near it: the page gets its own folder, `apps/dashboard/src/surfaces/settings/outreach/`); no local named `said`, `why`, `who`, `kept`, `asked`; a new contracts export needs `node tooling/scripts/gen/contracts-browser-entry.mjs` then `--check`; a new route needs `corepack pnpm gen:api-reference`.
- **Copy:** the canvas's words, verbatim, held in contracts (`REACH_OUT_SETTINGS_WORDS`); never a sentence typed in a component. Concise; no explainer paragraphs on the page.
- **Decision note:** `docs/decisions/0113-how-it-reaches-out.md` (0112 is on main, 0111 on the unpushed layer-8 branch; renumber at land if taken), with a row in `docs/decisions/README.md`.

## Review Focus

1. **A workspace with no `reach_out` section** (every existing one): the drafter's prompt, the check's opening input and the reply draft are byte-for-byte what they are today. Pinned in Task 5 (`draftAsked` with and without the section; `checkWorkspaceOf` fallbacks).
2. **A number inside `{{opening}}` or another slot** ("4.9 from 186 reviews" is the opening's, written per business): never counted against the step's words. Pinned in Task 2 (`unbackedNumbers` on words holding `{{opening}}`).
3. **A claim removed while a running step still carries it:** the step keeps its words and its past sends still count on the row; only the next save of those words refuses the number. Pinned in Task 2 (the refusal) and Task 3 (the count reads sends, not the claim list).
4. **No mailbox and no started sequence:** Where it sends from draws the by-hand row alone, Try it says to start a sequence first with a door to New, and nothing throws. Pinned in Task 3 (the read) and Task 7 (the sheet).
5. **A reply offer of "call" on a sequence nobody signed:** the steer names the mailbox's name, else "me"; never an empty name in the draft. Pinned in Task 5.

---

### Task 0: The lane

**Files:** none of the repo's.

- [ ] **Step 1:** `git -C "C:/Users/Ruben/Documents/Claude Projects/Claude Video/chanlytics-messaging" fetch origin main`, then the worktree command in Global Constraints, then `corepack pnpm install --frozen-lockfile` in `Claude Video/cm-reaches-out`.
- [ ] **Step 2:** Copy this file to `docs/superpowers/plans/2026-11-07-how-it-reaches-out.md` in the lane.
- [ ] **Step 3: Commit** `docs: the plan for How it reaches out`.

---

### Task 1: The `reach_out` section, its limits and its words

**Files:**
- Modify: `packages/contracts/src/config/workspace-config/config-schema.ts` (beside `AskConfigSchema`, line 132, and wherever `ask` is named, `TenantConfigSchema` line 134 and `TenantConfigWriteSchema` line 246)
- Modify: `packages/contracts/src/config/workspace-config/config-rules.ts` (beside `ASK_GOAL_MAX`, line 100)
- Create: `packages/contracts/src/campaigns/reach-out/settings.ts`
- Modify: `packages/contracts/src/campaigns/reach-out/index.ts` (export the new module), then regenerate `packages/contracts/src/browser.generated.ts`
- Test: `tests/campaigns/reach-out/settings.test.mjs`

**Interfaces:**
- Produces: `REACH_OUT_LIMITS = { offer: 300, whoFor: 120, fixes: 200, claim: 140, claims: 5, tone: 200, signature: 160, signatureLines: 3, phone: 40 } as const` (config-rules.ts).
- Produces: `ReachOutConfigSchema` (zod, `.strip()`, every field optional): `offer`, `who_for`, `fixes`, `tone`, `signed_by` (max `SIGNED_BY_MAX`), `signature`, `phone` as strings at their limits; `proof: z.array(z.string().max(claim)).max(claims)`; `reply_offer: z.enum(REPLY_OFFERS)`. `TenantConfig["reach_out"]` is its inferred type, `ReachOutConfig`.
- Produces (settings.ts): `REPLY_OFFERS = ["booking_link", "call", "answer"] as const`; `type ReplyOffer`; `reachOutOfferOf(config: { reach_out?: ReachOutConfig; ask?: { goal?: string } } | null, about: string | null): string | null` = the first non-empty of `reach_out.offer`, `about`, `ask.goal`, trimmed; `reachOutToneOf(config): string | null` = `reach_out.tone` else `brain.profile.tone`; `reachOutBackingOf(config, businessName: string | null): string[]` = the claims plus the business name; `reachOutSignatureProblem(text: string): "too_long" | "too_many_lines" | "link" | null` (lines by `\n` after trim; a link by `linksIn` from `words/limits.ts`); `REACH_OUT_SETTINGS_WORDS` (below); `ReachOutSettingsDto` (the shape Task 3 answers, below).

The words, verbatim from the canvas (keys are the implementer's; the strings are not):

- Cards: `What you offer` / `What every first email is about`; `Proof you stand behind` / `The only claims it may make about you`; `How it writes` / `Your voice in cold emails`; `Sign-off` / `Under every email`; `Where it sends from` / `Your own mailbox, never ours`; `When a lead writes back` / `Read as it arrives. Nothing replies on its own.`; `Rules it always keeps` / `They keep your emails out of spam`; `What it's told` / `What each writer reads, and its share`; `Try it on a lead` / `Before a business does`.
- Rows: `Your offer`, `Who it's for`, `What you fix for them`; proof foot `One per email, word for word. It never makes one up.`, add `Add a claim`, count `In {n} emails` / `Not used yet`; `Tone` hint `Cold emails only. How it answers keeps its own.`; `How you write` act `Paste an email`, meta `Learned from {n} emails you sent · Also in Memory`; `Signs as` hint `Or the name on the mailbox. A sequence can sign its own.`; `Signature`; `Phone in the signature` empty `Not added`; `At the bottom` value `Your address, and a way to say no` hint `The law asks for both, so it's always added.` act `Address on Details`; `Mailbox`, `This month` value `{n} of 2,000 first emails`, `Without a mailbox` value `To send hands you up to 30 a day, and you send them` act `To send`; the mailbox row's act `Connections`.
- Writes back: `Interested, or a question` value `Your sequence stops for them. An answer is drafted for you to send, offering your booking link` (the last clause by reply offer: `offering your booking link` / `offering a call with you` / `and nothing more`), hint `Drafts follow Autonomy › Replies: {mode}.`; `Not now` `A thanks is drafted. A step on Today says to write again on the day they named`; `No` `Marked Said no. Their address and their company are never written to again`; `Wrong person` `A step on Today names who to write to instead`; `Away` `Waits, and writes again the day they're back`.
- Rules (7): `Says only what their listing or website shows, never a guess`; `No prices, discounts or dates`; `No link in the first email, one at most after`; `Under 120 words, no line in capitals. Ask keeps its own to 80, follow-ups to 50`; `Arrives 9 to 5 their time, while they're open`; `A new mailbox sends 10 a day, then 20, 30 and 40, a week apart`; `Listens 30 days for a reply, and stops the moment one comes`. Head mark `Always on`.
- Told: row value `Three writers: the sequence's words, the line about each business, and an answer to a reply`; toggles `The words` / `The line about them` / `An answer`; hints `Written once by Ask when you make a sequence in New: the same words for every business it goes to.` / `Written for each business as its email comes due, then read back by a second reader. One that guesses is written again; one that still does is held for you.` / `Written by the receptionist as How it answers is told, with the thread and the lead's note. Signed as the sequence signs.`; foot `Their listing and website are read as facts, never as orders.`
- Try it: row key `Write one for a lead you have`, value `See it, where each line came from, and fix the row that wrote it`, act `Write one`; legend `Their listing` / `Your offer` / `Your proof` / `Added for you`; checks `{n} of 80 words, no link, no price, nothing guessed`, `The line about them leans on {facts}`; next `Then, {d} days later, if they don't reply`; foot buttons `Write another` / `Open the sequence`; acts `Another lead`; none `Start a sequence first: its first email is what Try it writes.` act `New`; hint `Nothing is sent or kept. It spends Ask's day as a lead's draft does.`
- Refusals: signature `Three lines at most, and no link.`; a number `"{n}" is a number nothing of yours backs. Put it in Proof you stand behind, or leave it out.`; the gap line `Add what you offer, so cold emails have something to say`.

- [ ] **Step 1: Write the failing test** `tests/campaigns/reach-out/settings.test.mjs`

```js
test("the section parses, strips, and holds its limits", () => {
  const parsed = TenantConfigSchema.parse({ reach_out: { offer: "Evening cleaning", proof: ["We clean 40 clinics"], reply_offer: "call", stray: 1 } });
  assert.deepEqual(parsed.reach_out, { offer: "Evening cleaning", proof: ["We clean 40 clinics"], reply_offer: "call" });
  assert.throws(() => TenantConfigSchema.parse({ reach_out: { proof: Array(6).fill("x") } }));
  assert.throws(() => TenantConfigSchema.parse({ reach_out: { reply_offer: "fax" } }));
});
test("the offer falls back: section, then about, then goal", () => {
  assert.equal(reachOutOfferOf({ reach_out: { offer: " A " }, ask: { goal: "G" } }, "B"), "A");
  assert.equal(reachOutOfferOf({ ask: { goal: "G" } }, "B"), "B");
  assert.equal(reachOutOfferOf({ ask: { goal: "G" } }, null), "G");
  assert.equal(reachOutOfferOf(null, null), null);
});
test("the tone falls back to the receptionist's", () => {
  assert.equal(reachOutToneOf({ brain: { profile: { tone: "Warm" } } }), "Warm");
  assert.equal(reachOutToneOf({ reach_out: { tone: "Direct" }, brain: { profile: { tone: "Warm" } } }), "Direct");
});
test("a signature is three lines, no link", () => {
  assert.equal(reachOutSignatureProblem("Maya Ortiz\nOwner\nBrightline"), null);
  assert.equal(reachOutSignatureProblem("a\nb\nc\nd"), "too_many_lines");
  assert.equal(reachOutSignatureProblem("Maya · brightline.com"), "link");
});
test("the backing is the claims and the name", () => {
  assert.deepEqual(reachOutBackingOf({ reach_out: { proof: ["40 clinics"] } }, "Brightline"), ["40 clinics", "Brightline"]);
});
```

- [ ] **Step 2: Implement** the schema, the limits and `settings.ts` as the Interfaces say.
- [ ] **Step 3:** `node tooling/scripts/gen/contracts-browser-entry.mjs`.
- [ ] **Step 4: Commit** `feat(contracts): the reach_out config section, its limits and the page's words`.

---

### Task 2: A number in the words must be backed

**Files:**
- Create: `packages/contracts/src/campaigns/reach-out/words/numbers.ts`
- Modify: `packages/contracts/src/campaigns/reach-out/words/limits.ts` (`validateReachOutWords`, line 57; `wordsIssueWords`, line 61; `ColdProblem` union)
- Modify: `apps/dashboard/src/server/campaigns/sequences/doors.ts:170` (the owner's words, saved)
- Modify: `apps/dashboard/src/server/campaigns/sequences/draft-judge.ts:268` (Ask's drafted steps)
- Test: `tests/campaigns/reach-out/words-numbers.test.mjs`

**Interfaces:**
- Produces: `numberForms(text: string): Set<string>` (every number in the text in the forms `recordNumbers` in `words/opening.ts` already produces: as written, with commas, with one decimal); `unbackedNumbers(body: string, backing: readonly string[]): string[]` (numbers in `slotsOut(REACH_OUT_SLOT_SET, body)` whose forms meet none of the backing's; each as written, once, in order).
- Produces: `validateReachOutWords(input, first, backing?: readonly string[] | null)`: with a backing given, one issue `{ field: "body", problem: "unbacked_number", slot: <the number> }` per unbacked number, after the existing issues. Without a backing, exactly today's answer.
- Consumes: `reachOutBackingOf` (Task 1). In `doors.ts` the backing is built from the stored config and the business's name (`findBusiness`, `chain-acts.ts`); in `draft-judge.ts` from `DraftKnown.proof` and `known.business`.

- [ ] **Step 1: Write the failing test**

```js
test("a number nothing backs is named, once, as written", () => {
  assert.deepEqual(unbackedNumbers("We clean 40 clinics and 1,204 rooms", ["We clean 40 clinics"]), ["1,204"]);
  assert.deepEqual(unbackedNumbers("Since 2015, 4.9 stars", ["since 2015", "4.9 out of 5"]), []);
});
test("a slot's number is the slot's, never the words'", () => {
  assert.deepEqual(unbackedNumbers("{{opening}}\n{{business}} in {{city}}, 5 days a week", ["5 days a week"]), []);
  assert.deepEqual(unbackedNumbers("{{opening}}\nWe clean 40 clinics", []), ["40"]);
});
test("validateReachOutWords refuses it only when asked to", () => {
  const words = { subject: "Evening cleaning", body: "{{opening}}\nWe clean 40 clinics." };
  assert.deepEqual(validateReachOutWords(words, true), []);
  assert.deepEqual(validateReachOutWords(words, true, []), [{ field: "body", problem: "unbacked_number", slot: "40" }]);
  assert.equal(wordsIssueWords({ field: "body", problem: "unbacked_number", slot: "40" }), '"40" is a number nothing of yours backs. Put it in Proof you stand behind, or leave it out.');
});
```

- [ ] **Step 2: Implement** `numbers.ts`, the third parameter, the problem and its sentence; pass the backing at the two call sites.
- [ ] **Step 3: Commit** `feat(reach-out): a number in a step's words must stand in a claim or the business's name`.

---

### Task 3: What the page reads beyond the config

**Files:**
- Create: `packages/db/src/repositories/campaigns/reach-out/proof.ts`
- Create: `apps/dashboard/src/server/readers/reach-out-settings.ts`
- Create: `apps/dashboard/app/api/v1/settings/reach-out/route.ts`
- Modify: `packages/contracts/src/shell/route-prefetch.ts:145` (add `"admin/outreach": [...SETTINGS_READ, "partner", "setup", "settings/reach-out"]`)
- Modify: `apps/dashboard/src/surfaces/settings/frame/pane-reads.ts` (a kept read for `settings/reach-out`, as Team's partner read is kept)
- Test: `tests/receptionist/reach-out-settings.test.mjs` (the reader on `tests/_fake-db.mjs`), `tests/shell/surfaces/route-prefetch.test.mjs` (the new address)

**Interfaces:**
- Produces (contracts, Task 1's `ReachOutSettingsDto`): `{ mailbox: { address: string; provider: string; pill: string; day: string; ramp: string | null } | null; month: { sent: number; of: number }; by_hand_per_day: number; claims: { text: string; sends: number }[]; voice: { id: string; text: string }[]; sequence: { root_id: string; name: string; search_id: string | null; include_unconfirmed: boolean; signed_by: string | null; signs_with: "name" | "mailbox"; mailbox_id: string | null; first: { subject: string | null; body: string }; after_days: number | null } | null; autonomy_reply_mode: string }`.
- Produces (db): `countSendsCarrying(db, tenantId, claims: readonly string[]): Promise<Map<string, number>>`: for each claim, the sends whose step's words (`findEmailWordsByTemplate`, `sheet.ts:115`, by the step's template) contain the claim trimmed, case-sensitive; a state the chain report counts as written. One query for the sends and their step ids, the words read once per template.
- Produces (server): `reachOutSettings: Reader<undefined, ReachOutSettingsDto>` named `"reach_out_settings"`; reads `listMailboxConnectionsOf` → `mailboxConnectionDtoOf` → `mailboxWords(dto, rc.now, tz)` for the first mailbox that `mailboxSendsNow`, else the first, else null; `readMonthSent(db, tenantId, rc.now)` with `of: REACH_OUT_MONTH_EMAILS`; `by_hand_per_day: REACH_OUT_DRAFTS_PER_DAY`; `askMemoryLines(db, tenantId, ASK_MEMORY_LIMITS.liveMax)` filtered `source === "learned"`; `listChains(ctx, tenantId)` → the newest with `state === "running"` whose first step is an email; `autonomy_reply_mode` from `listPolicies` class `reply`.
- The route: `GET /api/v1/settings/reach-out`, `read({ scope: workspace, handle })` as `settings/route.ts` does; members read.

- [ ] **Step 1: Write the failing test**

```js
test("the read with nothing: no mailbox, no sequence, an empty month", async () => {
  const dto = await readWith(fakeDb({ mailboxes: [], chains: [], sends: [], memory: [] }));
  assert.equal(dto.mailbox, null);
  assert.equal(dto.sequence, null);
  assert.deepEqual(dto.month, { sent: 0, of: 2000 });
  assert.equal(dto.by_hand_per_day, 30);
});
test("a claim counts the sends of the steps that carry it, word for word", async () => {
  const dto = await readWith(fakeDb({ claims: ["We clean 40 clinics."], steps: [{ body: "{{opening}}\nWe clean 40 clinics." }, { body: "{{opening}}\nWe clean many clinics." }], sendsPerStep: [9, 5] }));
  assert.deepEqual(dto.claims, [{ text: "We clean 40 clinics.", sends: 9 }]);
});
test("only learned lines are the voice", async () => {
  const dto = await readWith(fakeDb({ memory: [{ id: "1", text: "You keep it short", source: "learned" }, { id: "2", text: "Parking", source: "ask" }] }));
  assert.deepEqual(dto.voice, [{ id: "1", text: "You keep it short" }]);
});
```

- [ ] **Step 2: Implement** the three files and the two modifications.
- [ ] **Step 3:** `corepack pnpm gen:api-reference`.
- [ ] **Step 4: Commit** `feat(settings): the reach-out read: mailbox standing, the month, the claims' counts, the voice, the newest sequence`.

---

### Task 4: The page

**Files:**
- Modify: `apps/dashboard/src/surfaces/settings/frame/tabs.ts` (`SET_TABS`, `ROW_PANES`, `SECTIONS_WITH_ROWS`)
- Modify: `apps/dashboard/src/surfaces/settings/frame/page.tsx:92` (`id === "outreach"` draws `PaneWorkspace part="outreach"`)
- Modify: `apps/dashboard/src/surfaces/settings/business/tab.tsx` (`BusinessPart` gains `"outreach"`; `parts.includes("outreach")` draws `<OutreachCards>`)
- Modify: `apps/dashboard/src/surfaces/settings/business/save.tsx:117` (`Config.reach_out?: ReachOutConfig`)
- Modify: `apps/dashboard/src/surfaces/settings/business/fold-shapes.ts` (`FoldName` gains the ten below; `DraftOf` their draft shapes; `BT_PATHS_OF` spreads `REACH_OUT_PATHS`)
- Modify: `apps/dashboard/src/surfaces/settings/business/folds.ts` (`BT_DRAFT_OF`, `BT_WRITE`, `BT_PROBLEMS_OF` each spread the outreach folder's table: three lines)
- Create: `apps/dashboard/src/surfaces/settings/outreach/folds.ts`, `cards.tsx`, `offer.tsx`, `proof.tsx`, `writes.tsx`, `sign-off.tsx`, `sends-from.tsx`, `writes-back.tsx`, `rules.tsx`, `reads.ts`
- Test: `tests/receptionist/outreach/outreach-page.test.mjs` (on `tests/_business-tab-harness.mjs`, drawn as `business-tab-answers.test.mjs` draws How it answers, with part `outreach`)

**Interfaces:**
- Folds (ids = `FoldName`s = row ids = `ROW_PANES` keys): `offer`, `who_for`, `fixes`, `proof`, `cold_tone`, `signed_by`, `signature`, `phone`, `reply_offer`; row ids without a fold: `voice`, `sends_from`, `told`, `try`. All map to pane `outreach`.
- Produces (`outreach/folds.ts`): `REACH_OUT_DRAFT_OF`, `REACH_OUT_WRITE`, `REACH_OUT_PROBLEMS_OF`, `REACH_OUT_PATHS` keyed by those ids, in the shapes `BT_DRAFT_OF`, `BT_WRITE`, `BT_PROBLEMS_OF`, `BT_PATHS_OF` take (`folds.ts:161, 345, 527`; `fold-shapes.ts:198`). Each writes under `next.reach_out` (a helper `putReachOut(next: Config, key, value)` like `btPutProfile`), trimmed, `undefined` when empty; `proof` is a list fold like `notes` (rows of one text each; a blank row dropped on save); problems from `REACH_OUT_LIMITS` through `btRefusalOf`'s sentence shape, and `reachOutSignatureProblem` → the signature refusal sentence.
- Produces (`outreach/reads.ts`): `reachOutSettingsNow(): ReachOutSettingsDto | null` (the pane read kept by Task 3's pane-reads) and `useReachOutRead()` (draws again when it lands).
- Produces (`outreach/cards.tsx`): `OutreachCards({ brain, config, base, canEdit, flash, saver, door })` drawing, in order: offer, proof, writes, sign-off, sends-from, writes-back, rules, told (Task 6), try (Task 7). Card test ids `rec-card-offer`, `rec-card-proof`, `rec-card-writes`, `rec-card-sign-off`, `rec-card-sends-from`, `rec-card-writes-back`, `rec-card-rules`, `rec-card-told`, `rec-card-try`.
- `writes.tsx`: the voice row lists `dto.voice` lines, meta from the words, act `Paste an email` opens a fold whose body is one textarea and whose save calls the door `new-voice.tsx` calls, through the bridge's `api()("POST sequences/voice", { body: { text } })` (never the Campaigns verbs module: it would ride into the Settings page), then reads the pane read again; the Memory door `navigate("admin/memory")`.
- `sends-from.tsx`: read-only rows from the dto; `Connections` → `navigate("admin/integrations")`; `To send` → `navigate(TO_SEND_ROUTE)`; the head pill = `dto.mailbox.pill` with the kit's tone, absent with no mailbox; with no mailbox the Mailbox row's value is the empty word `Not connected` and its act `Connections`.
- `writes-back.tsx`: six rows; the first's act opens the `reply_offer` fold (a `RecordToggleGroup` of the three offers, words from `REPLY_OFFER_WORDS`); the other five carry the lock mark (`Icon name="lock"`, `aria-label="Always"`) and no act; the hint names `dto.autonomy_reply_mode` through `POLICY_MODE_WORDS[mode].head` and its Autonomy door `navigate("admin/autonomy")`.
- `sign-off.tsx`: `At the bottom` act navigates `settingsRowRoute("address")`.
- Prefill is the folds' `draftOf`: `offer` opens with `reachOutOfferOf(config, factsNow().about)` when the section has none; `signed_by` with `dto.sequence?.signed_by`; `signature` with `brain.profile.name` and `brain.business_name` on two lines; `phone` with `brain.phone_display`. (The page says the prefilled value in the row too, in the dim ink of a fact not yet saved: `rec-row-empty` with the prefill as its text.)

- [ ] **Step 1: Write the failing test** (the harness's fixture gains `reach_out: { offer: "After-hours cleaning", proof: ["We clean 40 clinics across Austin today."], signed_by: "Maya" }` and a stand-in `settings/reach-out` answer with one claim at 9 sends)

```js
test("the page draws its nine cards in order", () => {
  const tree = drawn("outreach");
  assert.deepEqual(all(tree, "section.rec-card").map((c) => c.props["data-testid"]), ["rec-card-offer", "rec-card-proof", "rec-card-writes", "rec-card-sign-off", "rec-card-sends-from", "rec-card-writes-back", "rec-card-rules", "rec-card-told", "rec-card-try"]);
});
test("a claim's row says how many emails carried it", () => {
  assert.equal(textOf(byTestId(drawn("outreach"), "rec-row-proof-0-meta")), "In 9 emails");
});
test("saving the offer sends one key under reach_out and nothing else changes", async () => {
  const tree = drawn("outreach");
  press(byTestId(tree, "rec-row-offer-act"));
  type(byTestId(again(), "rec-field-offer"), "Evening cleaning for clinics");
  press(byTestId(again(), "rec-fold-offer-save"));
  assert.equal((await saved()).config.reach_out.offer, "Evening cleaning for clinics");
  assert.deepEqual((await saved()).config.brain, fixture.config.brain);
});
test("a signature with a link is refused with the page's sentence", () => { /* opens signature, types "brightline.com", asserts the refusal text under the field */ });
test("the five fixed rows of When a lead writes back have no act", () => {
  const rows = ["not_now", "no", "wrong_person", "away"].map((id) => byTestId(drawn("outreach"), `rec-row-${id}`));
  for (const row of rows) assert.equal(find(row, ".rec-row-act"), null);
});
test("Connections and To send are doors", () => {
  press(byTestId(drawn("outreach"), "rec-row-sends_from-act"));
  assert.deepEqual(went.at(-1), "admin/integrations");
});
test("the rail lists it under Receptionist, after How it answers", () => {
  const ids = SET_TABS.map((t) => t.id);
  assert.equal(ids[ids.indexOf("receptionist") + 1], "outreach");
  assert.equal(paneOfRow("offer"), "outreach");
});
```

- [ ] **Step 2: Implement** the tab, the pane, the folder, the folds' registration (three spreads in `folds.ts`, one in `fold-shapes.ts`), and the cards with the words from `REACH_OUT_SETTINGS_WORDS`.
- [ ] **Step 3: Commit** `feat(settings): How it reaches out: the page, its cards and its folds`.

---

### Task 5: The three writers read it

**Files:**
- Modify: `apps/dashboard/src/server/drafts/sequence.ts` (`getOwner` line ~216; `draftAsked` line 183; `LEAD_RULES`; `draftSequence` line ~19 → extract `readDraftKnown(rc): Promise<DraftKnown>` so Task 6 composes without the model)
- Modify: `apps/dashboard/src/server/drafts/sequence-rewrite.ts:124` (the same known)
- Modify: `apps/dashboard/src/server/campaigns/sequences/draft-judge.ts` (`DraftKnown` gains `offer`, `whoFor`, `fixes`, `proof: string[]`; `draftKept` judges numbers with `reachOutBackingOf`)
- Modify: `apps/edge/lib/campaigns/reach-out/check-one.ts:405` (`checkWorkspaceOf`)
- Modify: `apps/edge/lib/campaigns/reach-out/reply-draft.ts` (`instruction`)
- Create: `packages/contracts/src/campaigns/reach-out/reply-offer.ts`
- Modify: `apps/dashboard/src/server/campaigns/reach-outs/reach-outs.ts:163` (`signedBy`), `apps/dashboard/src/server/ask/tools/act/sequence/cold-email.ts:75` (`signerOf`)
- Modify: `apps/dashboard/src/server/leads/draft.ts` (the peek's draft reads the offer, what you fix and the proof; its numbers judged)
- Test: the files `node tooling/scripts/tests-of.mjs` names for `sequence.ts`, `check-one.ts`, `reply-draft.ts`, `leads/draft.ts` (add cases there), plus `tests/campaigns/reach-out/reply-offer.test.mjs`

**Interfaces:**
- Produces (contracts `reply-offer.ts`): `replyOfferSteer(offer: ReplyOffer | undefined, signer: string | null): string | null`: `booking_link` and undefined → `null` (today's draft); `call` → `Offer a short call with ${signer ?? "me"} in the next few days, and no link.`; `answer` → `Answer what they asked and offer nothing more: no link, no call.`
- `getOwner` returns, beside today's: `offer: reachOutOfferOf(config, about)`, `whoFor`, `fixes`, `proof` (the section's, `[]` when none), `tone: reachOutToneOf(config)`. `draftAsked` tells them as data: `What it offers: …`, `Who it writes to: …`, `What it fixes for them: …`, and `What it can prove, in its owner's words; use one at most, word for word:` followed by the claims as fenced lines; each line absent when its value is. `LEAD_RULES` gains the sentence: `A number about the owner's business stands in the words only inside one of the claims it can prove, word for word; never another.`
- `checkWorkspaceOf`: `what_we_do: reachOutOfferOf(config, about)`, `tone: reachOutToneOf(config)`.
- `reply-draft.ts`: `instruction: replyOfferSteer(config.reach_out?.reply_offer, signer)`, the config by `findWorkspaceNameAndConfig(db, tenantId)` as `check-one.ts` reads it, the signer the chain's `signed_by` (`ask.signature` already handed to the draft, `core/messages/reply-read.ts:78`).
- `signedBy` for a new draft and Ask's `signerOf`: `config.reach_out?.signed_by` first, today's answer after.

- [ ] **Step 1: Write the failing tests**

```js
test("a workspace without the section is told exactly what it is told today", () => {
  const before = draftAsked(knownOf({ reach_out: undefined }), ask);
  assert.equal(before, SNAPSHOT_FROM_MAIN); // captured once from origin/main's draftAsked on the same fixture
});
test("the offer, what it fixes and the proof are told as data, one line each", () => {
  const told = draftAsked(knownOf({ reach_out: { offer: "Evening cleaning", fixes: "Cleaners who come in during hours", proof: ["We clean 40 clinics."] } }), ask);
  assert.match(told, /What it offers: .*Evening cleaning/);
  assert.match(told, /use one at most, word for word:\n- .*We clean 40 clinics\./);
});
test("the check's workspace falls back from the section to about to the goal", async () => {
  assert.equal((await checkWorkspaceOf(dbWith({ about: "B", config: { ask: { goal: "G" } } }), T)).opening.what_we_do, "B");
  assert.equal((await checkWorkspaceOf(dbWith({ about: null, config: { reach_out: { offer: "A" } } }), T)).opening.what_we_do, "A");
});
test("the reply steer names the signer, else me", () => {
  assert.equal(replyOfferSteer("call", null), "Offer a short call with me in the next few days, and no link.");
  assert.equal(replyOfferSteer("booking_link", "Maya"), null);
});
test("a drafted step with an unbacked number is not kept", () => { /* draftKept with proof [] and a body "We clean 40 clinics" → the step refused with the page's sentence */ });
```

- [ ] **Step 2: Implement** the readers and the steer.
- [ ] **Step 3: Commit** `feat(reach-out): the drafter, the check and the reply draft read What you offer, Proof and the cold tone`.

---

### Task 6: What it's told

**Files:**
- Create: `packages/contracts/src/campaigns/reach-out/told.ts`
- Modify: `packages/contracts/src/campaigns/reach-out/opening.ts:175` (`openingUserContent` becomes `openingUserParts(params): ToldPart[]` + `openingUserContent = parts' texts joined`; `reachOutExampleRecord(): OpeningRecord` from `EXAMPLE_LEAD`)
- Modify: `apps/dashboard/src/server/drafts/sequence.ts` (`draftAskedParts(known, ask): ToldPart[]`; `draftAsked` joins them)
- Create: `apps/dashboard/src/server/settings/reach-out-told.ts`, `apps/dashboard/app/api/v1/settings/reach-out/told/route.ts`
- Create: `apps/dashboard/src/surfaces/settings/outreach/told.tsx`
- Test: `tests/campaigns/reach-out/told.test.mjs`; cases in the page test

**Interfaces:**
- Produces (contracts): `interface ToldPart { id: string; label: string; note: string; text: string; row?: string; door?: string }`; `TOLD_KINDS = ["words", "opening", "reply"] as const`; `toldShares(parts: readonly ToldPart[]): { id: string; share: number }[]` (percent of characters, rounded, summing to 100 as `blockShareWords`' inputs do); `ReachOutToldDto = { kind: ToldKind; parts: ToldPart[] }`.
- The parts, by kind (ids fixed; labels and notes from the canvas): `words` → `rules` (Chanlytics keeps these for every business; no row), `offer` (row `offer`), `proof` (row `proof`), `writes` (row `cold_tone`), `examples` (Emails you sent before), `sources` (Your searches and lists; door `leads`), `asked` (What you asked for); `opening` → `rules`, `business` (row `offer`), `words` (Your words for this step; door: the newest sequence), `listing`, `website`, `reason`, `searched`; `reply` → `answers` (door `admin/receptionist`), `link` (row `booking_link`), `thread`, `signed` (row `signed_by`).
- `GET /api/v1/settings/reach-out/told?kind=words|opening|reply` → `ReachOutToldDto`: `words` from `readDraftKnown(rc)` and `draftAskedParts(known, { words: "(what you type in New)" })` with `LEAD_RULES` as the `rules` part; `opening` from `openingSystemPrompt()` (rules) and `openingUserParts({ record: reachOutExampleRecord(), workspace: checkWorkspaceOf-like inputs read in the dashboard, words: the newest sequence's first step or `REACH_OUT_FIRST_WORDS` })`; `reply` from `resolveSystemPrompt(brain, "email", tz, now, policy, known, "draft")` cut as `findPromptPreview` cuts the receptionist's, plus the thread and signed parts as fixed notes.
- UI (`told.tsx`): the row, and a `RecordSheet` (title `What it's told`, one ×) with a `RecordToggleGroup` of the three kinds; each part a `RecordDisclosure` line with its `Meter` (share) and its door (`navigate(settingsRowRoute(row))` or the door's address); the kind's hint under the toggle; the foot sentence on `opening`.

- [ ] **Step 1: Write the failing test**

```js
test("the words' parts are these, in this order, and share 100", () => {
  const parts = draftAskedParts(knownFixture, { words: "x" });
  assert.deepEqual(parts.map((p) => p.id), ["rules", "offer", "proof", "writes", "examples", "sources", "asked"]);
  assert.equal(toldShares(parts).reduce((n, s) => n + s.share, 0), 100);
  assert.equal(parts.map((p) => p.text).join("\n\n"), draftAsked(knownFixture, { words: "x" }));
});
test("the opening's parts carry the example record and the owner's words", () => {
  const parts = openingUserParts({ record: reachOutExampleRecord(), workspace: W, words: REACH_OUT_FIRST_WORDS });
  assert.deepEqual(parts.map((p) => p.id), ["rules", "business", "words", "listing", "website", "reason", "searched"].filter((id) => parts.some((p) => p.id === id)));
  assert.equal(parts.map((p) => p.text).join("\n"), openingUserContent({ record: reachOutExampleRecord(), workspace: W, words: REACH_OUT_FIRST_WORDS }));
});
```

- [ ] **Step 2: Implement** the parts, the route, the sheet.
- [ ] **Step 3:** `node tooling/scripts/gen/contracts-browser-entry.mjs`; `corepack pnpm gen:api-reference`.
- [ ] **Step 4: Commit** `feat(settings): What it's told, writer by writer, from the prompts the writers are given`.

---

### Task 7: Try it on a lead

**Files:**
- Create: `apps/dashboard/src/surfaces/settings/outreach/try.tsx`
- Modify: `packages/contracts/src/campaigns/reach-out/told.ts` (`tryPartsOf`)
- Test: cases in the page test; `tests/campaigns/reach-out/told.test.mjs` for `tryPartsOf`

**Interfaces:**
- Consumes: `POST reach-outs/preview` (`ReachOutPreviewSchema`: `search_id`, `index`, `include_unconfirmed`, `words`, `signed_by`, `signs_with`, `mailbox_id`, `language: "en"`) and `ReachOutPreviewDto`; `dto.sequence` from Task 3; `EmailParts` (`campaigns/sequences/place/email-as.tsx`) and the lead card's `LeadCardPart` shape.
- Produces (contracts): `tryPartsOf(parts: readonly LeadCardPart[], claims: readonly string[]): (LeadCardPart & { source: "them" | "offer" | "proof" | "added" })[]`: the opening part is `them`; a text part equal to a claim (trimmed) is `proof`; a text part holding a claim is split around it; a value or a hole is `added`; the rest `offer`.
- The sheet: opens with `index 0` on `dto.sequence.search_id`; `Another lead` → `index + 1` up to `REACH_OUT_PREVIEW_INDEX_MAX`, then disabled; `Write another` → the same index again; `Open the sequence` → `navigate` to the sequence's address (`campaigns/sequences/address.ts`); the legend, the email (From/To/Subject from the preview), the checks (`emailWordCount` of the words, `linkCount`, the preview's `facts_used` through the words), the next step from `dto.sequence.after_days` and the chain's second step when there is one, the hint. With `dto.sequence === null`: the none words and a `New` door (the New page's address from `campaigns/sequences/address.ts`), no call made. A refused preview (`REACH_OUT_REFUSALS.*`) is the sheet's one line, with `Write another`.

- [ ] **Step 1: Write the failing test**

```js
test("a sentence equal to a claim is proof, the opening is them, a value is added", () => {
  const parts = tryPartsOf([{ kind: "opening", text: "Lakeside has a 4.9." }, { kind: "text", text: "I run Brightline. We clean 40 clinics across Austin today. Worth a call?" }, { kind: "value", text: "Maya" }], ["We clean 40 clinics across Austin today."]);
  assert.deepEqual(parts.map((p) => p.source), ["them", "offer", "proof", "offer", "added"]);
});
test("the sheet posts the newest sequence's first email for the first business, then the next", async () => {
  const tree = drawn("outreach", { previews: [previewFixture] });
  press(byTestId(tree, "rec-row-try-act"));
  assert.deepEqual(posted.at(-1), { route: "POST reach-outs/preview", body: { search_id: "s1", index: 0, include_unconfirmed: false, words: fixture.sequence.first, signed_by: "Maya", signs_with: "name", mailbox_id: null, language: "en" } });
  press(byTestId(again(), "ro-try-another"));
  assert.equal(posted.at(-1).body.index, 1);
});
test("with no started sequence the sheet says to start one and calls nothing", () => { /* dto.sequence null → the none sentence, the New door, posted.length === 0 */ });
```

- [ ] **Step 2: Implement** `tryPartsOf` and the sheet.
- [ ] **Step 3: Commit** `feat(settings): Try it on a lead: one real email through the preview door, each line marked by its source`.

---

### Task 8: The gap line, Ask's reach, the decision note

**Files:**
- Modify: `packages/contracts/src/config/business-tab/business-gap.ts:61` (`StandingInputs` gains `reach_out_offer: string | null`; the last row `offer`, words from `REACH_OUT_SETTINGS_WORDS.gap`)
- Modify: `apps/dashboard/src/surfaces/settings/business/tab.tsx` (`businessGapPane` and `BtGap` hand the offer in: `reachOutOfferOf(config, factsNow().about)`)
- Modify: `apps/dashboard/src/server/ask/tools/act/settings.ts:182` (`ANSWERS_OPS` gains `set_offer`, `set_who_for`, `set_fixes`, `add_claim`, `remove_claim`, `set_cold_tone`, `set_signed_by`, `set_signature`, `set_phone`, `set_reply_offer`; `answersChangeOf` cases; the schema's fields `offer`, `who_for`, `fixes`, `claim`, `cold_tone`, `signed_by`, `signature`, `phone`, `reply_offer: z.enum(REPLY_OFFERS)`; two examples)
- Modify: `packages/contracts/src/ask/settings-change.ts` (the change union at line 80, the op→row table at 97, the op list at 237, the words at 294 and the apply at 349) and `packages/contracts/src/ask/schemas.ts:121` (one `z.object` per new op): each new op writes `config.reach_out` through `ReachOutConfigSchema`; `remove_claim` by exact text
- Modify: `apps/dashboard/src/server/ask/tools/read/settings.ts` (the settings read Ask answers from gains the section's rows, as it names How it answers' rows)
- Create: `docs/decisions/0113-how-it-reaches-out.md`; Modify: `docs/decisions/README.md`
- Test: the file `tests-of` names for `business-gap.ts`; the file that proves the answers-row card (`set_assistant_name`'s test), two cases

- [ ] **Step 1: Write the failing tests**

```js
test("the one gap, once everything else is there, is the offer", () => {
  assert.deepEqual(businessGap({ ...everythingFilled, reach_out_offer: null }), { row: "offer", words: "Add what you offer, so cold emails have something to say" });
  assert.equal(businessGap({ ...everythingFilled, reach_out_offer: "Evening cleaning" }), null);
});
test("Ask's card sets the offer and adds a claim under reach_out", async () => {
  assert.equal((await applied({ op: "set_offer", offer: "Evening cleaning" })).reach_out.offer, "Evening cleaning");
  assert.deepEqual((await applied({ op: "add_claim", claim: "We clean 40 clinics." })).reach_out.proof, ["We clean 40 clinics."]);
});
```

- [ ] **Step 2: Implement**, and write the decision note: context (the review of 7 Nov: three writers, the reply plan fixed in code, `about` with no row), the decision (one section, one page, the three readers, numbers backed by proof, nothing loosened), the calls (under Receptionist; replies stay drafts; proof the only place for numbers; their preview stays ours), status "Built in lane cm-reaches-out, not landed".
- [ ] **Step 3: Commit** `feat(settings): the gap line, Ask's rows and decision 0113 for How it reaches out`.

---

### Task 9: Whole, then checked, then walked

The one task that runs anything (Ruben's rule). Nothing is pushed in it.

- [ ] **Step 1:** `corepack pnpm typecheck`; fix what it names.
- [ ] **Step 2:** The tests, one file per command, `node tooling/scripts/checks/test.mjs <file>`: every file this plan created, every file `node tooling/scripts/tests-of.mjs <module>` names for each modified module, `tests/shell/surfaces/route-prefetch.test.mjs`, `tests/routes/api-reference.test.mjs`, `tests/repo/rules/rules.test.mjs`. Expected: every one passes.
- [ ] **Step 3:** `node tooling/scripts/gen/contracts-browser-entry.mjs --check`; `corepack pnpm gen:api-reference` leaves `docs/api.md` unchanged.
- [ ] **Step 4:** Write `e2e/settings/settings-outreach.spec.ts` as `settings-business.spec.ts` is written: open `/#/admin/outreach`, `rec-card-offer` on screen; the nine cards present; open the offer fold, type, cancel, `expectRecordUnchanged`; open What it's told, switch the three kinds, close with its one ×; Try it on a stand-in `**/api/v1/reach-outs/preview*` route (fulfilled, never the real door), the email drawn with its legend; `expectNoSidewaysScroll` on a phone viewport. Run it against the local dev server (`.claude/launch.json`, the e2e workspace), after `reference_local_e2e_next_dev_overlay`.
- [ ] **Step 5:** The real app: `preview_start` the dashboard, the page on a desk and at 390 px, light and dark; every fold saved once on the e2e workspace and put back; Try it once on a real lead; screenshots to `docs/2026-11-07-reaches-out-canvas/shots/built-*.png`. Note what the canvas showed that the app does not.
- [ ] **Step 6:** On the committed branch holding all of origin/main, the in-place `check:debt` pair (`reference_check_debt_symlink_eperm`); fix what it names; `corepack pnpm check:local`.
- [ ] **Step 7: Commit** `test(settings): How it reaches out, end to end`, then show Ruben the shots and the lane. Push, the PR and the merge wait for his word.

---

## Self-review (done while writing)

- **Spec coverage:** every card of the canvas has a task (offer/proof/writes/sign-off/sends-from/writes-back/rules → Task 4; told → 6; try → 7); the wiring board's four panes map to Tasks 1-3, 5, 2, 3+7+6+8; the Changes board's "moves" are in Task 5 (sign-off default, what you do, the goal, the lead's own draft) and Task 4 (the voice paste). The phone needs nothing of its own: the list and the rows are the kit's. The canvas's "written twice" line in Try it is drawn only if `ReachOutPreviewDto` says the opening was written again; if it does not, the line is not drawn (Task 7).
- **Types:** `ReachOutConfig`, `ReachOutSettingsDto`, `ToldPart`, `ReplyOffer`, `reachOutOfferOf`, `reachOutToneOf`, `reachOutBackingOf` are named the same in every task that uses them.
- **Proportion:** the plan carries words the spec fixes and test assertions; no function bodies.
