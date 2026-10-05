# Ecosystem Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the defects and wiring gaps found by the 2 Oct 2026 end-to-end audit (`Claude Video/chanlytics-ecosystem-audit-2026-10-02.md`), so every page reads one fact one way and what the backend stores reaches the owner.

**Architecture:** Every fact a page says gets ONE derivation in `packages/contracts` (standing, escalation words, call attempt words, needs-you count, status words), and every surface reads it. The SQL metrics stop counting a run's sends as the owner's. The edge resolves what it opened when a later reading closes it, and raises what it used to drop (a failure reported after the send). Dead or misleading affordances say what is true or go.

**Tech Stack:** TypeScript (contracts, dashboard, edge), PostgreSQL migrations (forward-only, `CREATE OR REPLACE FUNCTION`), node:test suites under `tooling/scripts/tests` (run one file: `node tooling/scripts/checks/test.mjs <file>`), the dashboard dev server at `localhost:3304` (`audit-app` + `audit-signin` in the session's launch.json) for what is observable.

**Rules this plan keeps (CLAUDE.md):** rebuild `packages/*/dist` after a contracts change and commit only dists with a real diff; a closed set is declared once; no literal customer; `node tooling/scripts/checks/test.mjs <file>` per touched test, never the whole suite locally; no push until Ruben approves.

**Decisions taken (so nobody re-decides them mid-task):**
- A run's send (playbook/broadcast) stays `sender='human'` on the row; the SQL that counts "you" excludes `meta->>'source' = 'broadcast'`. A new sender value would break `messageAuthor`'s run words.
- Conversations' pill reads `standingOf` through a new `standing` field; `outcome` keeps its three values for the rows that are not flagged.
- The escalation reason has two forms in ONE module: the label (a sentence for a row) and the clause (for chips and "Escalated · …"). `reasonShort` stays exported from `people/person-row-facts.ts` and delegates.
- A reach-out reply read as `no` resolves the thread's `email_review` escalation and archives the thread; `wrong_person` / `not_now` resolve the escalation only. An `auto_reply` never opened one.
- `messages.error` reaches the browser as one sentence (`sendFailureWords`), never the raw JSON.
- Features the audit listed but did not ask for (snooze picker, unarchive, assign-to-teammate, resend invite, note-suggestion counts on People) are NOT in this plan; they are listed under "Follow-ups" at the end.

---

## Batch 1 — one standing, one vocabulary (contracts, pure)

### Task 1: One escalation vocabulary

**Files:**
- Modify: `packages/contracts/src/conversations/escalations.ts`
- Modify: `packages/contracts/src/people/person-row-facts.ts:18-43`
- Create: `packages/contracts/src/conversations/escalations.type-test.ts`
- Test: `tooling/scripts/tests/conversations/escalation-words.test.mjs` (new)

- [ ] **Step 1: Write the failing test**

```js
// tooling/scripts/tests/conversations/escalation-words.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCALATION_REASON_LABELS, ESCALATION_REASON_SHORT, ESCALATION_SUMMARIES, reasonShort, SCHEMA_SETS } from "@chanlytics/contracts";

test("every stored reason has a label, a clause and a summary, and nothing else does", () => {
  const stored = [...SCHEMA_SETS["escalations.reason"]].sort();
  for (const map of [ESCALATION_REASON_LABELS, ESCALATION_REASON_SHORT, ESCALATION_SUMMARIES]) {
    assert.deepEqual(Object.keys(map).sort(), stored);
  }
});

test("the clause is the label's own words, not a second vocabulary", () => {
  // The audit's four: Reports said "Flagged by you" where the Inbox said "Flagged manually".
  assert.equal(reasonShort("manual"), "flagged by hand");
  assert.equal(reasonShort("state_unavailable"), "the receptionist could not read this thread");
  assert.equal(reasonShort("person_hold"), "you handle this person");
  assert.equal(reasonShort("deadman"), "nobody picked this up");
  assert.equal(reasonShort("nonsense"), "nonsense");
});
```

- [ ] **Step 2: Run it to see it fail** — `node tooling/scripts/checks/test.mjs tooling/scripts/tests/conversations/escalation-words.test.mjs` → FAIL (`ESCALATION_REASON_SHORT` is not exported).

- [ ] **Step 3: Add the clause map beside the labels** in `escalations.ts`, keyed by the same closed set, and type both:

```ts
import type { SchemaSet } from "../shared/schema-sets";
export type EscalationReason = SchemaSet<"escalations.reason">;

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = { /* existing 19 entries, unchanged */ };

/** The same reason as a clause for a chip or "Escalated · …": the label's own words, lower-cased, never a second vocabulary. */
export const ESCALATION_REASON_SHORT: Record<EscalationReason, string> = {
  human_token: "asked for a person",
  refusal: "the receptionist declined to answer",
  brain_error: "the receptionist hit an error",
  non_text: "sent a voice note or photo",
  send_failed: "reply failed to deliver",
  policy_block: "held by your reply setting",
  policy_ask: "set to Ask me first",
  person_hold: "you handle this person",
  rate_cap: "too many replies too fast",
  deadman: "nobody picked this up",
  manual: "flagged by hand",
  opt_out: "asked to stop",
  state_unavailable: "the receptionist could not read this thread",
  stale: "arrived hours late",
  budget: "the day's model budget is used up",
  callback: "needs a call back",
  paused: "the workspace is paused until billing resumes",
  carriers: "the carriers have not approved this line",
  email_review: "wrote by email",
};
export function reasonShort(reason: string | null | undefined): string {
  if (!reason) return "";
  return (ESCALATION_REASON_SHORT as Record<string, string>)[reason] ?? reason.replace(/_/g, " ");
}
```

`ESCALATION_SUMMARIES` gets the same `Record<EscalationReason, string>` type. In `person-row-facts.ts` delete `REASON_SHORT` and `reasonShort`, and `export { reasonShort } from "../conversations/escalations";` so every caller (`today-queue.ts:13`, `today-figures.ts:12`, `reports.ts:16`, `person-timeline.ts:14`, `person-row.ts:48`, `person-receptionist.ts:9`, `person-cards.ts:19`) keeps its import. Export `ESCALATION_REASON_SHORT` from `conversations/index.ts`.

- [ ] **Step 4: Type test** `escalations.type-test.ts`: `Holds<Exactly<keyof typeof ESCALATION_REASON_SHORT, EscalationReason>>` as `identity.type-test.ts` does.

- [ ] **Step 5: Run the new test and the ones that pin the old clauses** — grep `tooling/scripts/tests` for `flagged by you|memory was unavailable|held for you|no answer in time|message arrived late|reply limit reached` and update each expectation to the new clause. Run each touched file.

- [ ] **Step 6: Commit** `git commit -m "One escalation vocabulary: the clause is the label's own words"`

### Task 2: Conversations' pill reads the one standing

**Files:**
- Modify: `packages/contracts/src/conversations/conversation-vm.ts:43-70, 72, 120-128`
- Modify: `packages/contracts/src/shell/tone.ts:179-188` (thread labels and tones)
- Modify: `apps/dashboard/src/surfaces/inbox/conversations-surface.ts:59-92`
- Modify: `apps/dashboard/src/surfaces/inbox/pages/conversations-page.tsx:74-95`
- Test: `tooling/scripts/tests/conversations/conversation-vm.test.mjs`

- [ ] **Step 1: Failing tests** (append to conversation-vm.test.mjs):

```js
test("an open escalation on an open thread is Needs you here as it is in the Inbox", () => {
  const dto = convo({ state: "open", messages: [inbound("Hi"), aiReply("Someone will follow up.")] });
  const vm = toConversationVM(dto, { id: "e1", reason: "human_token", details: null, state: "open", created_at: NOW_ISO }, TZ, NOW);
  assert.equal(vm.standing, "needs_you");
  assert.equal(vm.outcome, "escalated");
});
test("a thread you took over is yours, not Needs you", () => {
  const dto = convo({ state: "open", paused_until: LATER, assignee_user_id: "me", assignee_is_me: true, messages: [inbound("Hi")] });
  const vm = toConversationVM(dto, { id: "e1", reason: "human_token", details: null, state: "open", created_at: NOW_ISO }, TZ, NOW);
  assert.equal(vm.standing, "yours");
});
test("no escalation: the pill is open or handled as before", () => {
  const vm = toConversationVM(convo({ state: "open", messages: [inbound("Hi"), aiReply("Yes")] }), null, TZ, NOW);
  assert.equal(vm.standing, "quiet");
  assert.equal(vm.outcome, "handled");
});
```

(`convo`, `inbound`, `aiReply` are the file's existing fixture helpers; reuse them.)

- [ ] **Step 2: Implement.** `toConversationVM(dto, escalation: EscalationDto | null, tz, now)`; compute `const v = standingOf({ state, paused_until, assignee_user_id, assignee_is_me, open_escalation: !!escalation }, now.getTime())`; add `standing: v.standing` to `ConversationVM`; `const needsHuman = v.flagged;` replaces the `state === "needs_human" || paused` line; `outcome` = `v.flagged ? "escalated" : …` unchanged otherwise. Every existing caller of `toConversationVM` gains the `null`/escalation argument (grep `toConversationVM(` across apps, packages, tooling).

- [ ] **Step 3: The surface passes the escalation.** In `conversations-surface.ts` read `GET escalations` (`state: "open"`) beside conversations (the Inbox override already does; the read-sharing window merges the two) and map `byConv`; `toConversationVM(c, byConv.get(c.id) ?? null, tz)`.

- [ ] **Step 4: The pill.** In `tone.ts` thread labels add `yours: "You have it"`, `theirs: "A teammate has it"` (tones: yours `info`, theirs `plain`, matching the Inbox's pills in `thread/status.tsx`). In `conversations-page.tsx` the pill reads `standing` first: `needs_you` → `escalated`, `yours`/`theirs` → those values, `snoozed` → `snoozed`, `quiet` → the existing open/handled branch.

- [ ] **Step 5: Run** conversation-vm.test.mjs, `conversations/inbox/conversations-doors.test.mjs`, `conversations/inbox/calls-in-the-thread.test.mjs`, `shell/the-pages-say-only-what-is-true.test.mjs`. Commit.

### Task 3: A call attempt's words know its direction

**Files:**
- Modify: `packages/contracts/src/conversations/call-dto.ts` (add `callAttemptWords`)
- Modify: `packages/contracts/src/today/notifications.ts:123-137`
- Modify: `packages/contracts/src/voice/live.ts:217, 264-265`
- Modify: `packages/contracts/src/people/person-timeline.ts:223-246`
- Modify: `packages/contracts/src/conversations/call-vm.ts:96, 180-182, 196-204`
- Modify: `packages/contracts/src/shell/tone.ts:197-205`
- Test: `tooling/scripts/tests/voice/calls/call-outcomes.test.mjs`, `tooling/scripts/tests/today/notifications.test.mjs`

- [ ] **Step 1: Failing tests**

```js
// call-outcomes.test.mjs
test("a dial WE placed that never connected is not a missed call", () => {
  const vm = toCallVM(call({ direction: "outbound", status: "not_connected", from_e164: BUSINESS, to_e164: "+12125550161" }), TZ, NOW);
  assert.equal(vm.outcome, "missed");
  assert.equal(vm.snippet.startsWith("Outbound call"), true);
  assert.equal(callAttemptWords("outbound"), "Call didn't connect");
  assert.equal(callAttemptWords("inbound"), "Missed call");
});
test("a voicemail and an errored call have their own outcome, not handled", () => {
  assert.equal(toCallVM(call({ in_voicemail: true, outcome: "voicemail" }), TZ, NOW).outcome, "voicemail");
  assert.equal(toCallVM(call({ status: "error", duration_ms: 0 }), TZ, NOW).outcome, "failed");
});
// notifications.test.mjs
test("a missed-call row names the CUSTOMER's number, whichever way the call went", () => {
  const items = buildNotificationFeed({ calls: [{ callId: "k1", cvId: "cv-k1", who: "Zed", number: "+1 (212) 555-0195", direction: "outbound", missed: true, live: false, startedAtMs: NOW_MS - 1000 }], now: NOW_MS });
  assert.equal(items[0].title, "Call didn't connect · Zed");
  assert.match(items[0].message, /555-0195/);
});
```

- [ ] **Step 2: Implement.** `call-dto.ts`: `export function callAttemptWords(direction: "inbound" | "outbound"): string { return direction === "outbound" ? "Call didn't connect" : "Missed call"; }`. `live.ts`: `number: withheld ? null : (dto.direction === "outbound" ? formatPhoneDisplay(dto.to_e164) : (phone ?? dto.from_raw))`, and `LiveCallVM` gains `direction` (it has it). `notifications.ts` `FeedCall` gains `direction?: "inbound" | "outbound"`; title `${callAttemptWords(c.direction ?? "inbound")} · ${c.who}`. `person-timeline.ts:237` → `callAttemptWords(k.direction)`. `call-vm.ts`: `outcome` union gains `"voicemail" | "failed"`; ladder: live → missed → failed (`dto.status === "error"`) → abandoned → callback → voicemail (`dto.in_voicemail`) → handled. `tone.ts` call labels: `voicemail: "Reached voicemail"`, `failed: "Call failed"`; `conversations-page.tsx:74-95` draws the two with `StatePill kind="call"`.

- [ ] **Step 3: Run** the two test files plus `voice/calls/call-lifecycle.test.mjs`, `voice/live/live-vm.test.mjs`, `conversations/inbox/calls-in-the-thread.test.mjs`. Commit.

### Task 4: The bell quotes the customer

**Files:**
- Modify: `packages/contracts/src/today/notifications.ts:39-56, 87-105`
- Test: `tooling/scripts/tests/today/notifications.test.mjs`

- [ ] **Step 1: Failing test** — a thread with `preview: "Of course, someone will reply shortly."` (the receptionist's) and `ask: { kind: "wrote", label: "They wrote", text: "I need a person", quoted: true }` yields `message === 'They wrote: “I need a person”'`; with `ask.kind === "sent"` → `They sent: Voice note`; with `ask.kind === "call"` → `From the call: …`; with `ask: null` → `"Flagged for a person."`.
- [ ] **Step 2: Implement.** `FeedThread` gains `ask?: InboxThreadVM["ask"]`; message = `t.ask ? (t.ask.quoted ? `${t.ask.label}: “${t.ask.text}”` : `${t.ask.label}: ${t.ask.text}`) : "Flagged for a person."`. Drop the `preview` read for this row.
- [ ] **Step 3: Run** notifications.test.mjs, `today/today-away-page.test.mjs`. Commit.

### Task 5: The snoozed band says the real reason

**Files:**
- Modify: `apps/dashboard/src/surfaces/inbox/thread/status.tsx:145`
- Test: `tooling/scripts/tests/conversations/inbox/inbox-status.test.mjs`

- [ ] **Step 1: Failing test** — render the status for a real snoozed thread with `subject: "Reply failed to deliver"` and `escalationId: "e1"`: the band text contains `"Reply failed to deliver — that's still waiting for you."` and not `"asked for a person"`.
- [ ] **Step 2: Implement** — `{thread.escalationId && thread.subject ? ` ${thread.subject} — that's still waiting for you.` : ""}`.
- [ ] **Step 3: Run** and commit.

### Task 6: A system note is a note, not a receptionist reply

**Files:**
- Modify: `packages/contracts/src/conversations/inbox-thread.ts:120-169, 294-330`
- Modify: `packages/contracts/src/conversations/conversation-vm.ts:112-116`
- Test: `tooling/scripts/tests/conversations/inbox/inbox-words.test.mjs`, `conversation-vm.test.mjs`

- [ ] **Step 1: Failing tests** — a `type: "note", sender: "system"` row: the Inbox timeline entry is `{ type: "event", kind: "note", body: "Note: Patch test required…" }` with no `agentName`/`status`; `lastWordOf` of a thread whose last row is that note says "They wrote last — no reply yet." when the customer wrote before it; Conversations `last` skips it (pill `open`).
- [ ] **Step 2: Implement** — in both mappers treat `m.type === "note"` like `call_summary` for `chat`/`last`; the Inbox timeline maps it to the event entry above.
- [ ] **Step 3: Run** both files + `conversations/inbox/one-thread.test.mjs`. Commit.

### Task 7: The person page is honest about an opted-out person and the reason

**Files:**
- Modify: `packages/contracts/src/people/person-reach.ts:106-116` (+ its two callers at `person-cards.ts:452`, `deals/pipeline/pipeline-peek.ts:97`)
- Modify: `packages/contracts/src/people/person-cards.ts:289-297, 254-258, 246-247`
- Create: `optOutWords(who)` in `packages/contracts/src/consent/consent.ts` beside `ASKED_TO_STOP`; use it from `apps/dashboard/src/surfaces/inbox/thread/composer.tsx:349`
- Modify: `packages/contracts/src/people/person-timeline.ts:258-268` (escalation `details`, resolved by/when)
- Test: `tooling/scripts/tests/people/people-vm.test.mjs` (person cards), `tooling/scripts/tests/consent/opt-out.test.mjs`

- [ ] **Step 1: Failing tests**
  - `repliesWords("Text", null, { optedOut: true })` → `optOutWords("Ben")` text: `"Ben asked to stop receiving messages. Nothing can be sent — they can text START to opt back in."`; `repliesWords("Email", null, { optedOut: false })` → "Any time, by email" (unchanged).
  - `rightNowOf` for `open_escalation_reason: "opt_out"` has `detail === ESCALATION_SUMMARIES.opt_out` (no "Paused until someone answers").
  - `lastExchangeOf` reply `who === "Your team"` for a human sender; customer text through `messageWords` (an email's quoted chain removed).
  - escalation timeline item for a resolved row: `sub === "Resolved by your team · 3:41 AM"` when `resolved_by_user_id` is set; open with details: `text` ends with ` · “<details clipped at 120>”`.
- [ ] **Step 2: Implement** as named. `repliesWords(via, window, { optedOut })` — third argument required (a split concept gets a required param). The person reader (`apps/dashboard/src/server/readers/person.ts:98-102`) must select `details, resolved_by_user_id, updated_at` for escalations — add them to the select and to `PersonDetailDto.escalations`.
- [ ] **Step 3: Run** the touched tests + `people/person-identity.test.mjs`. Commit.

### Task 8: The call count and the attempt agree

**Files:**
- Modify: `packages/contracts/src/people/person-cards.ts` (`personFactsOf`, the History fact) and `personRowOf:106`
- Test: `tooling/scripts/tests/people/people-vm.test.mjs`

- [ ] **Step 1: Failing test** — a profile with one `not_connected` call and no connected call: the History fact reads `"0 conversations · 0 calls, 1 didn't connect"`.
- [ ] **Step 2: Implement** — count `attempts = d.calls.filter(k => k.status === "not_connected").length` into the context and append `, ${attempts} didn't connect` when > 0.
- [ ] **Step 3: Run; commit.**

### Task 9: One word per wire on Reports, and "Phoned" only when they phoned

**Files:**
- Modify: `packages/contracts/src/reports/reports.ts:43`, `apps/dashboard/src/surfaces/reports/series.ts:19` — read `THREAD_CHANNEL_WORDS.sms` ("Text")
- Modify: `packages/contracts/src/people/person-row-facts.ts:60-70` — "Phoned" when `last_inbound_call_at === last_call_at`, else "Called"
- Test: `tooling/scripts/tests/reports/*` that pins "SMS" (grep), `people/people-vm.test.mjs`

- [ ] Steps: failing test → implement → run → commit.

---

## Batch 2 — Today and the counts

### Task 10: One needs-you count

**Files:**
- Modify: `packages/contracts/src/conversations/standing.ts` (add `conversationWaitsOnYou`)
- Modify: `apps/dashboard/src/surfaces/today/surface.ts:88-90`
- Modify: `apps/dashboard/src/surfaces/inbox/rules.ts:44-54` (comment only: the DTO twin is contracts')
- Test: `tooling/scripts/tests/conversations/inbox/inbox-counts.test.mjs`

- [ ] **Step 1: Failing test** — `conversationWaitsOnYou(dto, null, now)` is true for a thread whose only outbound is a queued AI draft with `meta.delay_ms` putting `sendsAt` after `now`, false once `now` passes it, true for an open escalation nobody has, false for a teammate's.
- [ ] **Step 2: Implement**
```ts
export function conversationWaitsOnYou(dto: ConversationDto, escalation: EscalationDto | null, now: Date): boolean {
  if (threadStanding(dto, escalation, now).needsYou) return true;
  return dto.messages.some((m) => isHeldDraft(m) && replyWaitsOnYou({ endsAtMs: draftSendsAtMs(m) }, now.getTime()));
}
```
(lives in `inbox-thread.ts` beside `threadStanding`, since it needs the DTO; export it.) Today's publish: `const needs = convData.conversations.filter((c) => conversationWaitsOnYou(c, openByConv.get(c.id) ?? null, now)).length`.
- [ ] **Step 3: Run; commit.**

### Task 11: The brief and the queue count people

**Files:**
- Modify: `packages/contracts/src/today/today-queue.ts:172-210` (add `morePeople`)
- Modify: `packages/contracts/src/today/today-vm.ts:163`
- Modify: `packages/contracts/src/today/today-brief-words.ts:56-75` (use `queue.morePeople`)
- Modify: `apps/dashboard/src/surfaces/today/pages/queue.tsx:255-260` (head count = `vm.queue.waiting + runsCount`; foot "N more in the Inbox" = people cut only, "N calls worth a listen" said apart)
- Test: `tooling/scripts/tests/today/today-vm.test.mjs`, `today/today-page.test.mjs`

- [ ] **Step 1: Failing tests** — 20 handoffs + 4 calls + 1 search: `queue.morePeople === 14` (20 − 6 drawn), `queue.more === 19`; the brief says "…and 17 more need you" (20 people − 3 named); the brief says "4 calls are worth a listen." even though none of the four is among the six drawn rows.
- [ ] **Step 2: Implement** — `morePeople = queueAll.filter(r => PEOPLE_KINDS.has(r.kind)).slice(TODAY_QUEUE_MAX_PEOPLE…)`: count people rows not in `rows`; brief `names(people, vm.queue.morePeople)`; calls sentence counts `vm.queue.parts`' call count (expose `calls: earN` on the queue VM) instead of drawn rows. Move `PEOPLE_KINDS` to `today-queue.ts` and export; the brief imports it.
- [ ] **Step 3: Run; commit.**

### Task 12: "Oldest waiting since" names the thread it times

**Files:**
- Modify: `packages/contracts/src/today/today-facts.ts:248`
- Test: `tooling/scripts/tests/today/today-vm.test.mjs`

- [ ] **Step 1: Failing test** — two open escalations, the older one on a thread you took over: `standing.detail` names the one waiting on you and its own time.
- [ ] **Step 2: Implement** — `oldest: tzSince(escRecords[0]?.e.created_at ?? null, tz, now)` (records are sorted oldest first); keep `metrics.now.oldest_open_escalation_at` only when `escRecords` is empty and the count is not (an escalation whose thread the page did not load).
- [ ] **Step 3: Run; commit.**

### Task 13: Nobody is "waiting now" on an auto-reply

**Files:**
- Modify: `packages/contracts/src/today/today-rows.ts:98-123`
- Test: `tooling/scripts/tests/today/today-leaks.test.mjs`

- [ ] **Step 1: Failing test** — a thread whose last message is `{ sender: "customer", channel: "email", meta: { email: { claim: "auto_reply" } } }` is not in `todayNoReply`.
- [ ] **Step 2: Implement** — after the sender check: `if (last.meta?.email && (last.meta.email as { claim?: string }).claim === "auto_reply") return [];`.
- [ ] **Step 3: Run; commit.**

### Task 14: Receipts are the receptionist's

**Files:**
- Modify: `packages/contracts/src/today/today-rows.ts:136-157` (`x.sender === "ai"`)
- Test: `tooling/scripts/tests/today/today-vm.test.mjs`

- [ ] Failing test: a human reply newer than an AI reply is not a receipt. Implement. Run. Commit.

### Task 15: A bell group counts what it is about

**Files:**
- Modify: `packages/contracts/src/today/today-away.ts:212-226, 304-319`
- Test: `tooling/scripts/tests/today/today-away-page.test.mjs`

- [ ] Failing test: 16 `handoff` rows with the same `about.id` → title `"1 conversation needs you"` and `count === 16`, `ids.length === 16`. Implement: `subjects = new Set(members.map(m => m.about?.id ?? idOf(m))).size`; title uses `subjects` with `noun[subjects === 1 ? 0 : 1]`. Run. Commit.

### Task 16: One m:ss, one median, one transcript clock

**Files:**
- Modify: `packages/contracts/src/shared/clock.ts` (export `mmss(ms)` = floor minutes, zero-padded seconds)
- Replace the copies: `apps/dashboard/src/surfaces/inbox/pages/conversations-page.tsx:147`, `surfaces/inbox/thread/call.tsx:44`, `surfaces/live/call-parts.tsx:8`, `surfaces/today/pages/live-now.ts:16`, `surfaces/today/pages/brief-pane.tsx:40`, `surfaces/campaigns/broadcasts/ledger.tsx:350`, `packages/contracts/src/setup/first-run-try.ts:216`, `packages/contracts/src/voice/live.ts:202` (round → the same floor as `call-vm.ts:172`)
- Median words: `packages/contracts/src/reports/reports.ts:242-249` reads `today-bands.ts:24-29`'s `secondsPhrase` (move it to `shared/time.ts` as `spanWords`)
- Test: `tooling/scripts/tests/shell/surfaces/one-clock.test.mjs` (add: `mmss(41_600) === "0:41"` and Live's transcript time equals Conversations' for the same turn)

- [ ] Failing test → implement → run `one-clock.test.mjs`, `voice/live/live-vm.test.mjs`, `today/today-vm.test.mjs` → commit.

---

## Batch 3 — the backend tells the truth (SQL, edge, DTOs)

### Task 17: A run's send is not "you" (migration 00285)

**Files:**
- Create: `supabase/migrations/00285_a_run_s_send_is_not_the_owner_s_reply.sql`
- Modify: `supabase/schema.sql` (the three function bodies, edited to what the migration makes them)
- Test: `tooling/scripts/tests/repo/*` migration tests run on CI; locally `node tooling/scripts/checks/test.mjs tooling/scripts/tests/db/migrations-forward-only.test.mjs` (or whichever file holds the numbering/duplicate check — grep `migrations` under tests/repo)

- [ ] **Step 1:** Copy the current bodies of `first_replies` (schema.sql:2232-2277), `metrics_summary` (~6860-7010) and `report_series` (~13440-13600) into the migration as `CREATE OR REPLACE FUNCTION`, with these edits only:
  - `first_replies.sent`: `and coalesce(o.meta->>'source', '') <> 'broadcast'` on the human side (an AI reply never carries it, but add the predicate to the whole CTE: a run never "answers").
  - `metrics_summary.out_sent` and `report_series.out_sent`: same predicate.
  - `metrics_summary.calls_win` and `report_series.calls_w`: `and status not in ('not_connected', 'error')`.
  - Header comment: why (the audit: "You sent 4 replies yourself" counted a 1 AM playbook reminder; Reports counted an errored dial as a call).
- [ ] **Step 2:** Edit `supabase/schema.sql` in place to the same bodies (the snapshot the stack would regenerate; say so in the PR).
- [ ] **Step 3:** Run the migration-shape tests; commit.

### Task 18: A reading closes what the intake opened

**Files:**
- Modify: `apps/edge/lib/reach-out/reply-read.ts` (after the reading is kept: resolve `email_review` on the thread for `no` / `wrong_person` / `not_now`; archive the conversation on `no`)
- Modify: `packages/core/src/reach-out/*` or the ports file the reader uses (add `resolveEscalation(tenantId, conversationId, reason)` and `archiveConversation(tenantId, conversationId)` ports backed by existing db repository functions — grep `resolveEscalation` / `archive` in `packages/db/src/repositories/thread.ts`)
- Test: `tooling/scripts/tests/reach-out/reply-read.test.mjs` (existing file for the reader; add cases)

- [ ] **Step 1: Failing tests** — a reply read as `no`: the fake db's `escalations` row for that conversation is `resolved` and the conversation `archived`; read as `wrong_person`: resolved, state unchanged; read as `interested`: untouched.
- [ ] **Step 2: Implement** through the reader's ports; the resolve is reason-guarded (`reason = 'email_review'`, `state = 'open'`) and counted (RLS: a forbidden UPDATE is silent — select and count, CLAUDE.md).
- [ ] **Step 3: Run; commit.**

### Task 19: A failed send says why, and a late failure raises its hand

**Files:**
- Modify: `apps/dashboard/src/server/dto.ts:18-19` (`error` in `MESSAGE_COLUMNS` and `MessageDto`)
- Create: `packages/contracts/src/conversations/send-failure.ts` — `sendFailureWords(error: unknown, channel): string | null` mapping WhatsApp codes (131047 re-engagement window, 131026 not on WhatsApp, 131053 media, 132xxx template, 100 parameter), Twilio codes (30003 unreachable, 30005 unknown number, 30006 landline, 30007 carrier filtered, 21610 opted out), email receipts (bounce/complaint), the orphan note, else the provider's own title/message, else null
- Modify: `packages/contracts/src/conversations/inbox-thread.ts` (timeline `failedWhy` on a failed bubble; `lastWordOf` appends the words), `conversation-vm.ts` (same on the bubble), `apps/dashboard/src/surfaces/inbox/thread/timeline.tsx` (draw `failedWhy` under "Didn't send")
- Modify: `apps/edge/api/whatsapp.ts:185-191` and `apps/edge/api/sms-status.ts:73-78` — after recording a `failed` status, `upsertEscalation(db, tenantId, conversationId, "send_failed", sendFailureWords(error, channel))` and `notify(... kind: "handoff" ...)` through the same helper the deliver failure path uses (find it in `packages/core/src/messages/send.ts:229-258` and lift it to a shared function in `apps/edge/lib/receptionist/` so both doors and deliver call one)
- Modify: `packages/db/src/realtime.ts:34` — `messages` UPDATE events reach the feed when `status` changed (filter in the trigger's row payload if 00265 carries it; else in the client filter)
- Test: `tooling/scripts/tests/messages/message-delivery-honesty.test.mjs` (words), `tooling/scripts/tests/sms/sms-door.test.mjs` (late failure opens the escalation), a WhatsApp status test beside it

- [ ] Failing tests → implement → run the three → commit.

### Task 20: What the DTO hides: a hold, a stopped address

**Files:**
- Modify: `apps/dashboard/src/server/dto.ts:15-16` (conversation columns gain `control_kind, control_until`; contact gains `email_suppressed_at, email_suppressed_reason`)
- Modify: `packages/contracts/src/conversations/thread-dto.ts` (the fields), `inbox-thread.ts` (VM `held: { kind: "call" | "person"; untilMs: number } | null`, `emailStopped: string | null` in the words of `email-receipts.ts`'s reasons)
- Modify: `apps/dashboard/src/surfaces/inbox/thread/status.tsx` (a quiet line while `held.kind === "call"`: "A call is answering this thread · until h:mm"), `composer.tsx` (email refused before the send: "Email to them stopped: <reason>. Write on another wire.")
- Test: `conversations/inbox/inbox-status.test.mjs`, `conversations/veto-ui.test.mjs`

- [ ] Failing tests → implement → run → commit.

### Task 21: The phone badge counts only what this member may read

**Files:**
- Modify: `packages/jobs/src/handlers.ts:285-300` (`.or("recipient_user_id.is.null,recipient_user_id.eq.<user>")`)
- Test: `tooling/scripts/tests/jobs/push-*.test.mjs` (grep `badge`)

- [ ] Failing test → implement → run → commit.

---

## Batch 4 — templates and the notifications pane

### Task 22: A template Meta will refuse is never chosen

**Files:**
- Modify: `packages/contracts/src/templates/template-order.ts:110-120` (`!templateBlocked(t)`), `inbox-templates.ts:28-54` (count `blocked` and say it in `hidden`)
- Test: `tooling/scripts/tests/templates/*.test.mjs` (grep `bookingTemplate`)

- [ ] Failing tests (a picture-headed approved template is not the booking template and is "Not offered: 1 WhatsApp will refuse (a picture for a heading)") → implement → run → commit.

### Task 23: The composer opens on the thread's language, says why it is empty, and keeps Meta's words

**Files:**
- Modify: `apps/dashboard/src/surfaces/inbox/thread/composer.tsx` (default = first sendable whose language matches the last AI reply's `meta.language` (`es` → `es`), else English, else the first; empty-picker words from `templates.counts`)
- Modify: `apps/dashboard/src/server/readers/templates.ts:50-60` (the non-`all` read answers `{ templates, counts: { pending, rejected, paused, disabled } }`), and its route type (`node tooling/scripts/gen/route-types.mjs`)
- Modify: `apps/dashboard/src/surfaces/campaigns/templates/message-row.tsx:169` (`reason.replace(/_/g, " ").replace(/\.\s*$/, "")`, no lower-casing)
- Test: `conversations/inbox/thread-controls.test.mjs`, `conversations/veto-ui.test.mjs`

- [ ] Failing tests → implement → run → commit.

### Task 24: Quality moves on the webhook, and the Inbox reads templates once

**Files:**
- Modify: `apps/edge/lib/whatsapp/waba-events.ts` (handle `message_template_quality_update`: `templates.quality = event.new_quality_score` by `meta_id`)
- Modify: `apps/dashboard/src/surfaces/inbox/surface.ts:68` (a module-level `{ at, value }` cache: re-read templates at most once a minute unless the override is told `templates` changed)
- Test: `tooling/scripts/tests/whatsapp/waba-events.test.mjs`, `conversations/inbox/inbox-server.test.mjs`

- [ ] Failing tests → implement → run → commit.

### Task 25: The notifications pane documents every kind the edge mails

**Files:**
- Modify: `packages/contracts/src/today/notification-kinds.ts` (rows keyed by `ServerNotificationKind`; a type test that every kind has a row; groups: Customers, Reach-outs, Your number and templates, Campaigns and searches, Your business, To Chanlytics)
- Modify: `apps/dashboard/src/legacy/pages/settings.jsx:1619` ("Sent from the Chanlytics alert address.")
- Create: `packages/contracts/src/today/notification-kinds.type-test.ts`
- Test: `tooling/scripts/tests/today/notification-kinds.test.mjs` (every `SERVER_NOTIFICATION_KINDS` member appears in exactly one row)

- [ ] Failing test → implement → run → commit.

---

## Batch 5 — Ask, the edge, the bridge, the frame

### Task 26: Names and counts Ask quotes are the pages'

- `apps/dashboard/src/server/ask/tools/act/thread-verb.ts:39-44`, `deal.ts:82`, `person.ts:54-55` → `personName(contact)`.
- `apps/dashboard/src/server/ask/tools/read/threads.ts:50`, `context/day.ts:37,131` → `isHeldDraft(m) && draftSendsAtMs(m) > now`.
- `apps/dashboard/src/server/ask/tools/act/whisper.ts:20` → `callerName(call)`.
- Tests: `tooling/scripts/tests/ask/readers.test.mjs`, `ask/ask-tool-names.test.mjs`.

### Task 27: The edge names the saved customer, the bridge counts a live call by the heartbeat

- `apps/edge/lib/voice/call-event.ts:318` → `callerName({ from_e164, from_raw, contact })` (saved name first, the spoken name only when there is none).
- `apps/dashboard/src/legacy-bridge/app-bridge.ts:98-101` → count `liveStillUp`.
- Tests: `voice/calls/call-lifecycle.test.mjs`, `mobile/app-bridge.test.mjs` (grep).

### Task 28: The bell sees every call the page holds

- `apps/dashboard/src/legacy-bridge/notifications.ts:124-131` — calls from `CONVERSATIONS_DATA.CONVERSATIONS` rows that carry `callId` (mapped to `FeedCall`: `callId`, `cvId: row.id`, `who`, `number: row.whoShort`…, `direction`, `missed`, `live`, `startedAtMs: row.ts`), unioned with `__LIVE.now` for the live ones.
- Test: `today/notifications.test.mjs` ("the bridge" case gains a call beyond the eighth).

### Task 29: Conversations rows carry the reach-out reading

- `apps/dashboard/src/surfaces/inbox/pages/conversations-page.tsx` — apply `TODAY_HELPERS.withReplies`-style mapping (`legacy-bridge/reach-out/replies.ts`) by `threadId` to draw the Interested / Said no chip the Inbox rows draw.
- Test: `conversations/inbox/inbox-reach.test.mjs`.

### Task 30: Words that promised what is not there

- `apps/dashboard/src/surfaces/today/pages/strip.tsx:52-60` — "Follow the call".
- `apps/dashboard/src/legacy/pages/integrations-real.jsx:176-182` — Instagram and Deposits rows draw a quiet "Not yet" word instead of a Connect button.
- `apps/dashboard/src/legacy-bridge/surface-registry.ts` — `admin/memory` classified demo.
- `apps/dashboard/src/surfaces/people/page/screen.tsx:316` — Export CSV disabled with the reason drawn as its hint text (the kit's `gate` pattern).
- `apps/dashboard/src/surfaces/routes.ts:39-40`, `legacy/pages/app-routes.jsx:291-293` — the comment says the true reason (the demo's acts open demo-only flows), not "Ask is a no-op".
- `e2e/shell/no-fabricated-data.spec.ts` — rename "an unfinished surface says so" to what it checks and point it at a demo route.
- `packages/contracts/src/workspace/activity.ts` — wording for `partner.*`, `lead.stage`, `lead.emailed`, `lead.call`, `lead.not_a_fit`, `channel.connected`, `workspace.activated`.
- `tooling/scripts/ops/e2e-workspace.mjs:713` — `notifications` (and its marks/reads) in the nightly clear list, before `convergeLeads` writes the bell's rows.
- Tests: `shell/the-pages-say-only-what-is-true.test.mjs`, `workspace/activity.test.mjs` (grep), `e2e/e2e-workspace.test.mjs`.

---

## Batch 6 — the phone row, dists, proof, review

### Task 31: The Today queue row on a phone gives the name room

- Read `.claude/skills/chanlytics-interface/SKILL.md` first.
- `apps/dashboard/src/legacy/styles/dashboard-a-v2.css` (the `.tq` phone block): the row's name column `min-width: 0; flex: 1 1 auto`, the act `flex: 0 0 auto` at the kit's compact size; the chip line wraps.
- Prove with the dev server at 375px (screenshot) — `style-values.json` must not rise.

### Task 32: Dists, typecheck, lint, touched tests, the app

- `corepack pnpm --filter "./packages/*" build`; keep only dists with a real diff (`git diff -w --stat packages/*/dist`).
- `corepack pnpm -r typecheck`; `corepack pnpm lint`; every touched test file once more; `node tooling/scripts/gen/route-types.mjs --check`.
- Open `localhost:3304/w/chanlytics-e2e/{inbox,today,conversations,people/<id>,reports}` with the filler data and record what changed (screenshots + text), including the dark theme.
- One combined review round (requesting-code-review), fix, done. No push.

### Task 33: The wiring review

- Write `docs/superpowers/specs/2026-10-02-wiring-review.md`: the end-to-end flow per wire (WhatsApp, SMS, email, voice) from door → plan → core → db → realtime → surface → VM → page → bell/push, what is orchestrated well, where it is duplicated or inverted, and the recommended target shape with the smallest moves to reach it. Published for Ruben as the answer to "is this the best orchestration".

---

## Follow-ups (not in this plan)

- Snooze with a chosen time; unarchive; assign a thread to a teammate (decision 0003).
- Resend a real invitation (needs a route).
- A count or alert for the receptionist's suggested notes outside the person page.
- `people_list`'s `queued_at` counting only the receptionist's own draft (00276 is a large function; its own migration).
- Caller name / email offered to the person's record with one press (a verb; today only Ask's `person_details` applies them).
- `today-clock.ts` folded into `shared/clock.ts`.
- `notifications.from` wired to a verified sending domain, or the field removed.
