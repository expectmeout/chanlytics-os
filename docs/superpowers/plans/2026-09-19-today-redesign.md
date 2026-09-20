# Today Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the page called Today about today, as the approved spec (`docs/superpowers/specs/2026-09-19-today-redesign-design.md`) describes: the work first, then a card whose subject is the day (four figures, each with its receipt), then what is left over; every sentence with a number from contracts, every borrowed read that fails saying so, and a `today-sample` so the standalone mockup draws the real page.

**Architecture:** Two PRs (the five wrong things shipped first as #686). **A (data):** `packages/contracts/src/today.ts` gains the day's figures and their receipts, the ungated proof, the threads waiting with nothing back, one derivation of the escalations, the period line, the runs' words, Worth a look's tag, people, "and N more" and Ask prompt, and the four-kind dedupe; the dead fields go; `legacy-bridge/today-sample.ts` publishes what the page reads and the mockup builds it like `reports-sample`. **B (page):** the three bands drawn from the view model with no sentence composed on the page, the stylesheet rewritten, the tests moved with the code they pin (the pins move, they never multiply), the nightly spec rewritten, the docs.

**Tech Stack:** TypeScript contracts built with tsup (dists committed), legacy React classic scripts (compiled by Next in the app, loaded by Babel in `Chanlytics.html`), node:test with tsx on the shared stub React (`_legacy-react.mjs`), esbuild for the mockup's sample bundle, Playwright (nightly only).

---

## Ground rules for every task (read once)

- **Worktree:** `C:/Users/Ruben/Documents/Claude Projects/Claude Video/cm-gutter` (its own `node_modules`; parked on `design/today-next`). Never work in the shared `chanlytics-messaging` checkout: other sessions switch its branch.
- **Shell:** Git Bash. `jq` does not exist here; use `node -e` or `gh --template`. No heredoc inside `&&` chains.
- **pnpm:** call it as `corepack pnpm ...`.
- **Contracts are consumed through their dist.** Tests import `@chanlytics/contracts`, which resolves to `packages/contracts/dist/index.js`. After any change in `packages/*/src`, run `corepack pnpm --filter "./packages/*" build` before testing, and commit a package's `dist/` only where `git diff -w --ignore-cr-at-eol -- packages/<pkg>/dist` shows a real change.
- **One test file:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`.
- **Everything:** `corepack pnpm test`, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `node tooling/scripts/check-dist.mjs`.
- **The pins move, they never multiply.** `source-scan-ratchet.test.mjs` counts `readCode(`/`readRaw(` calls per test file against `tooling/scripts/tests/source-scan-baseline.json`. A NEW test file may call neither (budget 0). In an existing file the count may not rise; the path or string inside an existing call may change; one `readCode(file)` call can serve any number of assertions. When a count falls (a call deleted, a file deleted), run `UPDATE_SOURCE_SCAN_BASELINE=1 corepack pnpm test` and commit the rewritten baseline in the same PR.
- **Legacy files load twice.** Every legacy `.jsx` is listed in `apps/dashboard/src/legacy-bridge/manifest.ts` **and** `apps/dashboard/src/legacy/Chanlytics.html`, in the same order (`legacy-harness.test.mjs`); every edited file's `?v=N` in `Chanlytics.html` goes up by one. A `.js` tag (the samples) is outside the two-list rule and inside the cache-buster rule (`?v=` required).
- **Copy:** no em dashes in new UI strings; sentence case; each number once; a sentence with a number in it lives in contracts, never in a page.
- **Stub React:** `_legacy-react.mjs` renders children before parents and keys hooks by call order: no React context; `fresh()` before each draw, `again(draw)` for a re-render over the same cells; `window === globalThis`, so a classic script's `Object.assign(window, {...})` makes names the next script reads bare.
- **Commits:** end every message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **CI:** a PR needs its checks green: Typecheck (build, dist drift, typecheck, lint, `pnpm test`, Next build), Secret scan, Migrations replay (a no-op here: no `supabase/` change), plus the Vercel deploys. Count the checks; a CONFLICTING PR runs no Actions. A job that fails in 2s with "recent account payments have failed" is GitHub billing, not code.
- **No migration, no new read.** Every field this plan reads is already in the payloads Today fetches (spec section 6).

## The contract every task writes against

Names and wording here are final; a task that needs something else says so in its output instead of inventing it.

**Where this plan departs from the spec's names, and why** (the spec's intent holds in every case):
- Spec 6 names the figures helper `todayDay(metrics, calls, ...)`; that name is the schedule helper's (`todayDay(cal, playbooks, people)`, pinned by today-day and calendar-honest). The figures are `TodayVM.figures` and `TodayVM.proof`, computed inside `toTodayVM`, which already holds the metrics, the threads and the calls.
- Spec 5/6 name one helper `todayRunsLine(runs)`; the page says seven different things about a run, so there are three: `todayRunWords(run)` (a row's sentence, meta and status for the waiting, scheduled and done states), `todayRunsSub(n)` ("2 runs waiting") and `todayRunApproved(label, n, when)` (the toast).
- Spec 4.5's quiet line reads "No customer has written yet today."; the page keeps contracts' `quiet.headline` "Nothing has come in yet today." because the quiet state also means no call came in (and metrics-truth's message pins it). The proof follows it on the same line.
- Spec 4.5 lists the fourth figure as "anyone new"; under a number the word is `new people` ("2 new people").
- Spec 5's two sentences that said WhatsApp over a count spanning every wire were fixed in #686 (`ask/tools.ts` names every wire; the "WhatsApp" strings left in `today.ts` are the window row's, whose window is WhatsApp's). Nothing to do here.
- Spec 4.5's phone receipt is "a panel that opens under the row of figures": the receipt is drawn as the last child of the row of figures (not inside its figure), so a phone lays it under the row (`grid-column: 1 / -1`) and a desktop anchors it under its figure by index (`--i`).
- Spec 4.6 says the unanswered row "names who was ignored" from the query's own identities; the count is Reports' over its period and the names are the threads Today holds with nothing back right now, two different populations. The page therefore draws the names under a "Waiting now" lead (`TodayLeakVM.people`'s doc makes that binding) and never as the count's subjects.
- Spec 5 frames the run sentences as relocations; they are also a wording change ("3 people · nothing sends until you say so" → "3 people. Nothing sends until you say so."), to sentence case and the queue's own grammar. Nothing pinned the old strings.
- Spec 3 says "Coral marks live state only": the day module's "Needs you" flag and flagged count, Setup's not-answering dot and the beats' default dot were accent and are not live; they move to `--danger`/`--warn`/`--ink-faint` in Task B8. The now marker on the schedule's rail and the call in progress stay accent: they are live.

### Contracts (`packages/contracts/src/today.ts`), after PR A

- `TodayVM` loses `standing.greeting`, `pulse`, the top-level `launchpad` and `updatedAt`. It gains:
  - `figures: TodayFigureVM[] | null`: the day's four figures in this order: `messages`, `answered`, `calls`, `new`; null when `messages_in + calls + new_contacts === 0` (a day with nothing at all draws no row of zeros).
  - `proof: string`: `todayProof(m.now, tz, now)`, always computed, never gated on the queue: `"The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later."`, `"The last message arrived 4:52 PM."`, or `"No messages have arrived yet."`.
  - `noReply: TodayNoReplyVM[]`: threads where the customer wrote last, nothing went back for `NO_REPLY_AFTER_MS` (one hour) or more, nobody holds the thread (`standingOf` says `quiet` or `needs_you`: a snoozed thread, an archived one, a paused one and one a teammate claimed are excluded), and no queue row is about it (an escalation's thread and a closing window's thread are the queue's); oldest first; `{ conversationId, who, sinceMs, to: "inbox/th-<id>" }`.
- `TodayFigureVM = { id: "messages" | "answered" | "calls" | "new"; label; value: number; meta: string; receipt: { text: string; door: { label: string; to: string } | null } | null }`. The words:

| id | label | value | meta (always under the figure) | receipt text (hover, focus, tap) | door |
|---|---|---|---|---|---|
| messages | customer messages | `messages_in` | `last at {tzClock(last_inbound_at)}` + `, answered in {secondsPhrase(gap)}` when the last reply came within the hour after it; `none yet` with no inbound | the day's inbound customer messages the page holds, by wire (a message with no wire named is WhatsApp): when they account for the figure, `All by WhatsApp.` for one wire, else `2 by WhatsApp, 1 by email and 1 by text.` (counts descending, then by name; `wireWord` lowercases every wire but WhatsApp); when the page holds fewer than the figure, `The one the Inbox holds came by WhatsApp.`, `The 2 the Inbox holds both came by WhatsApp.` (`all` past two) for one wire, else `Of the 4 in the Inbox: ...`; null when the read holds none | Open the Inbox → `inbox` |
| answered | answered by the receptionist | `answered_by_ai` | `typically in {secondsPhrase(median)}` + `, {escalations_new} handed over` (or `none handed over` when it answered and never stopped); `none answered yet` with a message in and nothing answered; `nothing to answer yet` with nothing in | today's open escalations as the read came (not the queue's list, which drops the ones a teammate holds), by reason (`period.escalation_reasons` is every open escalation whatever its age, and is not read): `Asked for a person: once; sent something the receptionist can't read: once.` (first reason capitalised); then `{n} handovers already resolved.` when `escalations_new` exceeds them; then `It sent {messages_out_ai} messages in all.` when it sent more than it answered, `One reply each.` when the two are equal, nothing when it sent fewer; null with nothing to say | See the handovers → `inbox` (null when `escalations_new` is 0) |
| calls | calls | `calls` | `{n} min on the phone` (`under a minute on the phone` under 60s; nothing at 0s) + `, {v} to voicemail`; `none connected` with calls and no seconds and no voicemail; `none yet` with no call | `The voice provider read {andList(moods)}.` where a mood is `all of them as positive` when it is every call (`it as positive` for one call), else `2 as positive`; then `{andList(names)} reached voicemail.` for the callers the calls read holds in voicemail, each once, up to three then `and N more`, never a withheld or unknown caller; null with neither | Open the calls → `conversations/phone` |
| new | new people | `new_contacts` | only when the threads whose first real message is the customer's and today are exactly `new_contacts`: one wire `on WhatsApp` (one person), `both on WhatsApp` (two), `all on WhatsApp` (more), several `on WhatsApp and email`; `first contact today` when they differ; `nobody new yet` at zero | when they agree: `{andList(first three names, then "N more")} wrote for the first time today.`; null otherwise (a person who existed before and wrote for the first time today is not new, and a name is said only for someone the figure counts) | Open People → `clients/seg:new_week` |

  A receipt adds to its figure: it never contains the figure's value or any number in its clause (a contracts test checks every figure on every fixture with a word-bounded regex).
- `TodayQueueRowVM` gains `conversationId: string | null` (handoff, callback, window: the thread; call: the call's thread or null) and `callId: string | null` (callback: the call-back's newest call; call: the call; else null).
- **One derivation of the escalations:** `escRecords` is read once per open escalation (who, waited, warn, the customer's words, the call-back's call, the closing time); `needsYou.rows` (Ask's) and the queue's handoff and call-back rows are both drawn from it. Where they disagreed on a call-back, Ask's row now carries the to-do the phone receptionist left as its `quote` when the thread has no customer words, and `meta: "Phone"` for a call-back with no thread.
- `todayProof(live: { last_inbound_at; last_outbound_at }, tz, now): string` (exported; also `quiet.sub`'s second sentence, so the two cannot drift).
- `todayPeriodLine(r: ReportsLike | null): { text: string; to: "reports" } | null`: `Last {range}: {in} customer messages ({compare}), {pct}% answered by the receptionist, median reply {medianLabel}, {calls} calls.`; each part only where it is true (`compare` from the messages tile when Reports gives one, the share when anything was answered, the median when there were replies, the calls when there were any); `Last {range}: nobody wrote or called.` on an empty period; null without Reports. Never touches `r.campaigns`.
- `todayRunWords(r: RunLike): TodayRunWordsVM` for the queue's run rows and the card's "what ran": `{ people: "3 people", waiting: { sentence: "3 people. Nothing sends until you say so.", status: ["Waiting for your approval"] }, soon: { meta: "Playbook · sends today 9:00 AM", sentence: "3 people. Stop it if you'd rather not.", status: ["Scheduled", "sends today 9:00 AM"] }, done: { counts: "6 sent, 1 replied", still: boolean } }`; `todayRunsSub(n): string | null` (`"2 runs waiting"`, null at 0); `todayRunApproved(label, n, when): { lead, rest }` (`{ lead: "Win-back", rest: "approved: 3 people, sending now" }`: the page sets the lead in bold). `RunLike` is only what the words read: `state`, `recipient_count`, `when`, `counts`. The page keeps its filters (which rows wait, which are scheduled, which went out today); it composes no sentence with a number.
- `todayLeaks(reports, people, noReply = [], max = TODAY_LEAK_MAX): { rows: TodayLeakVM[]; more: number; moreLine: string | null }` (`moreLine` is `"and 2 more"`, null at 0). `TodayLeakVM` gains `tag` (never-booked `Booking gap`, unanswered `No reply`, unreachable `Reach`, quiet `Gone quiet`), `icon` (`calendar`, `alert`, `users`, `clock`), `people` (the unanswered row only: up to two of `noReply` as `{ id: conversationId, name: who, to }`), and `ask: "{text} {math}. Why is that?"` (the sentence and its arithmetic, for Ask). Texts, maths, doors and floors unchanged (owner-signals pins the unreachable sentence and its two doors).
- `todayAwayGrouped(rows, inQueue: readonly (string | { conversationId?: string | null; callId?: string | null })[] = [], max = 5)`: a bell row is dropped when it is about a queued thread (kept `about.type === "conversation"`, a derived `needs:th-<cv>` key, or a door `inbox/th-<cv>`: a held draft is keyed by its message) or a queued call (kept `about.type === "call"`, a derived `call:<id>` key, `callOfKey` in `notifications.ts` beside `conversationOfNeedsKey`). Strings still work as conversation ids.
- `ReportsLike.vm` gains optional `replyTime?: { count: number; medianLabel: string }`, `period?: { now: string }`, `calls?: { total: number }` and `answered.share?: number | null`; `WeekTileLike` gains optional `compare?: string | null`. The period line reads each of them from the view model Reports draws and derives nothing a second time (no percentage of its own, no parsing of a tile's value).
- Kept until PR B removes them with the page: `todayWeek`, `todayJourney`, `todayDayFacts`, `todayDayLine`, `todayAway` and their types. Kept for Ask: `standing.headline/detail/tone/chips`, `needsYou`, `windowClosing`, `recap` (`line`, `sentences`, `facts`, `receipts`), `calls`, `quiet` (its `launchpad` is the quiet card's one door and stays).
- `legacy-bridge/today.ts` publishes `window.__today = { day: todayDay, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved, leaks: todayLeaks, awayGrouped: todayAwayGrouped, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway }` after PR A, and `{ day, periodLine, runs, runsSub, runApproved, leaks, awayGrouped }` after PR B.

### The page (PR B)

- Files keep their names (the pins outside Today read them): `dashboard-a.jsx` (the composition), `dashboard-a-brief.jsx` (`HeroBrief` = the standing line, `TodayCard`, `SetupLine`, `ReviewLine`, `RunsDone`), `dashboard-a-command.jsx` (`AgentCommand` = the queue), `dashboard-a-day.jsx` (the schedule), `dashboard-a-week.jsx` (`TodayLeaks`, `TodayAway`). Deleted from them: `HeroBriefSeed`, `PulseArc`, `BriefBeats`, `TodayRecapBody`, `AgentCommandSeed`, `DecisionRow`, `AC_BUCKETS`, `TodayPulse`, `TodayJourney`. `dashboard-a-live.jsx`, `dashboard-a-fleet.jsx` and `dashboard-a-ask.jsx` stay as they are (mockup-only surfaces, no longer mounted from Today).
- Test ids kept verbatim: `today-standing`, `today-queue`, `queue-<kind>`, `queue-snooze`, `queue-resolve`, `brief-live-call`, `brief-run-row`, `brief-run-soon`, `brief-run-done`, `brief-setup`, `brief-review`, `brief-receipt`, `brief-quiet-proof`, `brief-calls-failed`, `today-recap` (the card's list of what is not a number, so `thread.spec.ts` keeps its `.brief-beat` + "failed to deliver" + "See the thread" reading), `today-day`, `today-day-frame`, `today-day-item`, `today-day-reminders`, `today-leaks`, `today-leak-<id>`, `today-away`, `today-away-row`, `today-away-empty`. New: `today-card` (a `section` labelled by its `h2#today-card-title`), `today-figures`, `today-figure-<id>`, `today-receipt-<id>`, `today-quiet-line`, `today-period`, `today-leaks-more`, `today-leak-ask-<id>`, `today-day-more`; and one FailedRead per borrowed read: `today-period-failed` (Reports, at the card's foot), `today-leaks-failed` (Reports or People, in Worth a look), `today-day-failed` (the calendar, where the day goes), `today-runs-failed` (the broadcasts, under the queue's rows), beside the existing `brief-calls-failed` (Today's own calls read).
- Classes kept because `e2e/signals.ts` and `thread.spec.ts` read them: `.cl-attn-row/.cl-attn-who/.cl-attn-sentence/.cl-attn-status/.cl-attn-cta`, `.brief-beat`, `.tl-text`, `.tl-math`, `.tl-acts`, `.ta-title`, `.tq-count` and `.tq-foot` inside the away card, the `warn` tone class on `.ta-row`. Classes gone: `.tw-*`, `.tj-*`, `.today-recap-line`, `.today-recap-when`, `.rp2-tiles` on Today, the queue's `.tq-count`.
- CSS strings pinned by suites outside Today that must stay byte-exact in `dashboard-a-v2.css`: `.brief-beat-text { flex: 1; min-width: 0; }` (polish); `.ask-card` must stay absent (ask). Strings pinned by Today's own suites change with the code (their tests are rewritten here).
- The standing dot is `.today-standing-dot` (ok, static) and `.today-standing-dot.down` (danger with a danger ring, pulsing only when motion is allowed); `.live-dot` (accent) is no longer on this page.

## File map

| File | PR | Responsibility |
|---|---|---|
| `packages/contracts/src/today.ts` (modify) | A | figures, proof, noReply, one escalation derivation, queue row ids, `todayPeriodLine`, `todayRunWords`/`todayRunsSub`/`todayRunApproved`, `todayLeaks` v2, `todayAwayGrouped` v2, dead fields removed; B: `todayWeek`, `todayJourney`, `todayDayFacts`, `todayDayLine`, `todayAway` removed |
| `packages/contracts/src/notifications.ts` (modify) | A | `CALL_KEY_PREFIX`, `callOfKey` |
| `packages/contracts/dist/**` (rebuilt) | A, B | committed dist |
| `apps/dashboard/src/legacy-bridge/today.ts` (modify) | A, B | what `window.__today` publishes |
| `apps/dashboard/src/legacy-bridge/today-sample.ts` (create) | A | the mockup's Today: a sample workspace through the same view models, and `installTodaySample` |
| `tooling/scripts/serve-legacy.mjs` (modify) | A | builds `data/today-sample.js` beside `data/reports-sample.js` |
| `apps/dashboard/src/legacy/Chanlytics.html` (modify) | A, B | the sample tag; `?v=` bumps |
| `tooling/scripts/tests/today-vm.test.mjs` (modify, 0 pins) | A, B | the view model: figures, proof, noReply, one derivation, the fields gone |
| `tooling/scripts/tests/today-leaks.test.mjs` (modify, 0 pins) | A | leaks v2, away v2, period line, run words |
| `tooling/scripts/tests/today-sample.test.mjs` (create, 0 pins) | A | the sample adds up; the bundle publishes it |
| `tooling/scripts/tests/legacy-harness.test.mjs` (modify, 4 pins, unchanged count) | A | both sample tags, in order |
| `tooling/scripts/tests/today-day.test.mjs`, `today-week.test.mjs` (modify) | A | the bridge's install string moves |
| `apps/dashboard/src/legacy/pages/dashboard-a.jsx` (rewrite) | B | the three bands |
| `apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx` (rewrite) | B | standing line, the Today card, Setup/Review/Runs lines |
| `apps/dashboard/src/legacy/pages/dashboard-a-command.jsx` (rewrite) | B | the queue, one primary verb, run words from contracts |
| `apps/dashboard/src/legacy/pages/dashboard-a-day.jsx` (modify) | B | five rows and a tail |
| `apps/dashboard/src/legacy/pages/dashboard-a-week.jsx` (rewrite) | B | Worth a look v2, While you were away v2 |
| `apps/dashboard/src/legacy/styles/dashboard-a-v2.css` (rewrite of the Today sections) | B | the look; dead seed rules gone (grep-verified) |
| `apps/dashboard/src/legacy/styles/mobile.css` (modify) | B | the phone rules for the new classes |
| `tooling/scripts/tests/today-page.test.mjs` (create, 0 pins) | B | the three bands drawn from a view model: every state |
| `tooling/scripts/tests/today-queue.test.mjs`, `today-day.test.mjs`, `today-calls-strip.test.mjs` (modify, counts not raised) | B | pins follow the code |
| `tooling/scripts/tests/today-week.test.mjs` (delete), `today-doors.test.mjs`, `today-away-page.test.mjs`, `the-pages-say-only-what-is-true.test.mjs` (modify) | B | the period card's tests go; the rest move to the card |
| `tooling/scripts/tests/source-scan-baseline.json` (re-banked) | B | the ratchet after the deletions |
| `e2e/today.spec.ts` (rewrite) | B | nightly |
| `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md` (modify) | B | docs |

---

# Part A: data (PR A)

### Task A1: Branch

- [ ] **Step 1: Branch from the spec branch so the spec and this plan land with PR A**

```bash
cd "C:/Users/Ruben/Documents/Claude Projects/Claude Video/cm-gutter"
git fetch -q origin
git checkout -b feat/today-data design/today-next
git rebase -q origin/main
git log --oneline -4
```
Expected: the spec and plan commits on top of `origin/main`.

### Task A2: The view model: figures, proof, who is waiting, one derivation, the fields gone

**Files:**
- Modify: `packages/contracts/src/today.ts`, `packages/contracts/src/notifications.ts`
- Test: `tooling/scripts/tests/today-vm.test.mjs` (modify; it holds no source pin)

- [ ] **Step 1: Write the failing tests.** In `tooling/scripts/tests/today-vm.test.mjs`:

  (a) Delete these assertions and tests, which pin fields the spec removes: line 67 `assert.equal(vm.pulse, null, ...)`; line 207 `assert.equal(vm.standing.greeting, "Good evening.");` (the test keeps its two eyebrow assertions and is retitled `"the clock comes from the TENANT's timezone, not the reader's"`); line 270 `assert.equal(vm.pulse, null);`; the whole test `"the pulse arc is the answered-by-AI ratio, only when messages came in"` (lines 273-277).

  (b) Append:

```js
/* ------------------------------ the day's figures, the proof, who is waiting ------------------------------ */

const at = (iso, over = {}) => ({ id: `m-${iso}`, direction: "inbound", sender: "customer", type: "text", body: "Hi, can I book?", media: null, meta: null, status: "received", channel: "whatsapp", created_at: iso, ...over });
const thread = (id, name, messages, over = {}) => ({ id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false, last_wa_inbound_at: null, last_message_at: messages.at(-1)?.created_at ?? null, contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13055550100" }, messages, ...over });
const callRow = (id, over = {}) => ({ id, retell_call_id: `r-${id}`, direction: "inbound", call_type: null, status: "ended", from_e164: "+13475550188", from_raw: null, to_e164: null, started_at: "2026-08-27T13:20:00Z", ended_at: "2026-08-27T13:21:00Z", duration_ms: 60_000, disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false, summary: "Asked about hours.", transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null, ...over });
/** A working day: nine messages, seven answered, two handed over, three calls, two new people. */
const busyDay = () => metrics({
  now: { escalations_open: 2, oldest_open_escalation_at: "2026-08-27T12:50:00Z", last_inbound_at: "2026-08-27T14:38:00Z", last_outbound_at: "2026-08-27T14:38:41Z" },
  period: { messages_in: 9, messages_out_ai: 11, messages_out_you: 1, conversations_active: 6, answered_by_ai: 7, answered_by_you: 1, unanswered_in_window: 1, median_reply_seconds_ai: 34, escalations_new: 2, escalation_reasons: { human_token: 1, non_text: 1 }, calls: 3, call_seconds: 412, call_sentiments: { Positive: 2, Neutral: 1 }, calls_voicemail: 1, new_contacts: 2 },
});
const busyThreads = () => [
  thread("cv-r", "Renata Solís", [at("2026-08-27T09:10:00Z"), at("2026-08-27T09:10:30Z", { direction: "outbound", sender: "ai", status: "delivered" })]),
  thread("cv-m", "Marco Ibáñez", [at("2026-08-27T11:00:00Z", { channel: "email" }), at("2026-08-27T11:02:00Z", { direction: "outbound", sender: "ai", status: "delivered", channel: "email" })]),
  thread("cv-d", "Dulce Amaro", [at("2026-08-20T09:00:00Z", { channel: "sms" }), at("2026-08-20T09:00:20Z", { direction: "outbound", sender: "ai", status: "delivered", channel: "sms" }), at("2026-08-27T12:00:00Z", { channel: "sms" })]),
  thread("cv-a", "Ana Reyes", [at("2026-08-20T09:00:00Z"), at("2026-08-27T14:50:00Z")], { state: "needs_human" }),
];
const busyCalls = () => [callRow("k1", { sentiment: "Positive" }), callRow("k2", { sentiment: "Neutral", started_at: "2026-08-27T12:00:00Z" }), callRow("k3", { in_voicemail: true, sentiment: null, summary: null, contact: { display_name: "Kenia Duarte", wa_profile_name: null, phone_e164: "+13475550199" }, started_at: "2026-08-27T13:50:00Z" })];
/** The two handovers the metrics count, as the escalations read holds them: both opened today, both still open. */
const busyEsc = () => [
  { id: "e-a", conversation_id: "cv-a", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T14:51:00Z" },
  { id: "e-d", conversation_id: "cv-d", reason: "non_text", details: null, state: "open", created_at: "2026-08-27T12:05:00Z" },
];

test("the day's four figures, each with the clause under it and the why behind it", () => {
  const vm = toTodayVM(busyDay(), busyThreads(), busyEsc(), busyCalls(), NOW);
  assert.deepEqual(vm.figures.map((f) => [f.id, f.label, f.value]), [["messages", "customer messages", 9], ["answered", "answered by the receptionist", 7], ["calls", "calls", 3], ["new", "new people", 2]]);
  const by = Object.fromEntries(vm.figures.map((f) => [f.id, f]));
  assert.equal(by.messages.meta, "last at 10:38 AM, answered in 41s", "the proof rides the messages figure");
  // The threads the page holds carry four of today's nine: the receipt says what it counted, by wire, most first.
  assert.deepEqual(by.messages.receipt, { text: "Of the 4 in the Inbox: 2 by WhatsApp, 1 by email and 1 by text.", door: { label: "Open the Inbox", to: "inbox" } }, "never an absolute claim from a partial read");
  assert.equal(by.answered.meta, "typically in 34s, 2 handed over");
  assert.deepEqual(by.answered.receipt, { text: "Asked for a person: once; sent something the receptionist can't read: once. It sent 11 messages in all.", door: { label: "See the handovers", to: "inbox" } }, "the reasons are today's escalations as the page holds them, never period.escalation_reasons, which counts every open one whatever its age");
  assert.equal(by.calls.meta, "7 min on the phone, 1 to voicemail");
  assert.deepEqual(by.calls.receipt, { text: "The voice provider read 2 as positive and 1 as neutral. Kenia Duarte reached voicemail.", door: { label: "Open the calls", to: "conversations/phone" } });
  assert.equal(by.new.meta, "on email and WhatsApp", "the wires the new people wrote on: most first, then by name, the one rule every split here follows");
  assert.deepEqual(by.new.receipt, { text: "Renata Solís and Marco Ibáñez wrote for the first time today.", door: { label: "Open People", to: "clients/seg:new_week" } });
  assert.equal(vm.proof, "The last message arrived 10:38 AM, and the receptionist answered 41s later.");
});

test("a receipt adds to its figure: it never says the figure's own number again", () => {
  const fixtures = [
    toTodayVM(busyDay(), busyThreads(), busyEsc(), busyCalls(), NOW),
    toTodayVM(metrics({ now: { last_inbound_at: "2026-08-27T14:38:00Z", last_outbound_at: "2026-08-27T14:38:41Z" }, period: { messages_in: 4, messages_out_ai: 4, answered_by_ai: 4, median_reply_seconds_ai: 20, calls: 2, call_seconds: 120, call_sentiments: { Positive: 2 }, new_contacts: 1 } }), busyThreads().slice(0, 1), [], [callRow("k1"), callRow("k2")], NOW),
  ];
  for (const vm of fixtures) {
    for (const f of vm.figures) {
      if (!f.receipt) continue;
      assert.doesNotMatch(f.receipt.text, new RegExp(`\\b${f.value}\\b`), `${f.id}: the receipt says ${f.value} again: ${f.receipt.text}`);
    }
  }
  const same = fixtures[1].figures.find((f) => f.id === "answered");
  assert.equal(same.receipt.text, "One reply each.", "four answered with four sent: the count is not said twice");
  const one = fixtures[1].figures.find((f) => f.id === "messages");
  assert.equal(one.receipt.text, "The one the Inbox holds came by WhatsApp.", "one of four held: what it counted, not 'All by WhatsApp'");
  const all = fixtures[1].figures.find((f) => f.id === "calls");
  assert.equal(all.receipt.text, "The voice provider read all of them as positive.", "two of two: not '2 as positive' beside the figure 2");
  const held = toTodayVM(metrics({ period: { messages_in: 1, messages_out_ai: 1, answered_by_ai: 1, conversations_active: 1, new_contacts: 1 } }), busyThreads().slice(0, 1), [], [], NOW);
  assert.equal(held.figures.find((f) => f.id === "messages").receipt.text, "All by WhatsApp.", "one held of one: the whole day, so the absolute is true");
  assert.equal(held.figures.find((f) => f.id === "new").meta, "on WhatsApp");
});

test("the sentences stay true where the SQL's counts and the page's rows disagree", () => {
  // Two handovers opened today, both resolved since: the read (state=open) holds neither, and the receipt counts them rather than naming a reason it cannot see.
  const resolved = toTodayVM(busyDay(), busyThreads(), [], busyCalls(), NOW).figures.find((f) => f.id === "answered");
  assert.equal(resolved.meta, "typically in 34s, 2 handed over");
  assert.equal(resolved.receipt.text, "2 handovers already resolved. It sent 11 messages in all.");
  // One reply answered three asks: nothing to say about it.
  const grouped = toTodayVM(metrics({ period: { messages_in: 3, messages_out_ai: 1, answered_by_ai: 3, conversations_active: 1 } }), [], [], [], NOW).figures.find((f) => f.id === "answered");
  assert.equal(grouped.meta, "none handed over");
  assert.equal(grouped.receipt, null, "REGRESSION: 'One reply each.' over one reply to three messages");
  // One call: "it", not "all of them".
  const single = toTodayVM(metrics({ period: { calls: 1, call_seconds: 90, call_sentiments: { Positive: 1 } } }), [], [], [callRow("k1")], NOW).figures.find((f) => f.id === "calls");
  assert.equal(single.receipt.text, "The voice provider read it as positive.");
  // Every call to voicemail, nobody on the phone; the same number twice is one caller; a withheld caller is counted, never named.
  const vmail = [callRow("v1", { in_voicemail: true, sentiment: null, duration_ms: 0 }), callRow("v2", { in_voicemail: true, sentiment: null, duration_ms: 0 }), callRow("v3", { in_voicemail: true, sentiment: null, duration_ms: 0, from_e164: null, contact: null })];
  const voicemail = toTodayVM(metrics({ period: { calls: 3, call_seconds: 0, call_sentiments: {}, calls_voicemail: 3 } }), [], [], vmail, NOW).figures.find((f) => f.id === "calls");
  assert.equal(voicemail.meta, "3 to voicemail", "REGRESSION: 'under a minute on the phone' with nobody on the phone");
  assert.equal(voicemail.receipt.text, "+1 (347) 555-0188 reached voicemail.", "one caller, once; the withheld one is in the clause's count");
  // A person who existed before and wrote for the first time today is not new: no name beside "nobody new yet".
  const notNew = toTodayVM(metrics({ period: { messages_in: 1, messages_out_ai: 1, answered_by_ai: 1, conversations_active: 1, new_contacts: 0 } }), busyThreads().slice(0, 1), [], [], NOW).figures.find((f) => f.id === "new");
  assert.deepEqual([notNew.meta, notNew.receipt], ["nobody new yet", null], "REGRESSION: 'nobody new yet' beside a named person");
  // Two new people counted, one thread held: no wire claimed for two from one, no name for the one the page cannot see.
  const partial = toTodayVM(metrics({ period: { messages_in: 2, messages_out_ai: 2, answered_by_ai: 2, conversations_active: 2, new_contacts: 2 } }), busyThreads().slice(0, 1), [], [], NOW).figures.find((f) => f.id === "new");
  assert.deepEqual([partial.meta, partial.receipt], ["first contact today", null]);
  // Four new people, all held: three named, the fourth counted.
  const four = busyThreads().slice(0, 2).concat([thread("cv-n3", "Noor Haddad", [at("2026-08-27T10:00:00Z")]), thread("cv-n4", "Iris Kowalski", [at("2026-08-27T10:30:00Z")])]);
  const many = toTodayVM(metrics({ period: { messages_in: 4, conversations_active: 4, new_contacts: 4 } }), four, [], [], NOW).figures.find((f) => f.id === "new");
  assert.equal(many.receipt.text, "Renata Solís, Marco Ibáñez, Noor Haddad and 1 more wrote for the first time today.", "one 'and', as andList says it");
  assert.equal(many.meta, "on WhatsApp and email", "three on WhatsApp, one by email: most first");
  // A handover opened today that a teammate has taken over is still open: named by its reason, never counted as resolved.
  const claimed = busyThreads().map((c) => (c.id === "cv-a" ? { ...c, assignee_user_id: "u-teammate", assignee_is_me: false } : c));
  const taken = toTodayVM(metrics({ period: { messages_in: 2, messages_out_ai: 2, answered_by_ai: 2, conversations_active: 2, escalations_new: 1 } }), claimed, [busyEsc()[0]], [], NOW).figures.find((f) => f.id === "answered");
  assert.equal(taken.receipt.text, "Asked for a person: once. One reply each.", "REGRESSION: '1 handover already resolved' over a colleague mid-reply");
  // Two of nine held, both by WhatsApp: what the page holds, said once.
  const twoHeld = toTodayVM(busyDay(), [busyThreads()[0], thread("cv-b", "Bea Lind", [at("2026-08-27T12:30:00Z")])], [], [], NOW).figures.find((f) => f.id === "messages");
  assert.equal(twoHeld.receipt.text, "The 2 the Inbox holds both came by WhatsApp.", "REGRESSION: 'Of the 2 in the Inbox: 2 by WhatsApp.'");
});

test("a figure with nothing to add has no receipt; a day with nothing at all has no figures, and the proof is still said", () => {
  // The SQL counted one message nobody has answered; the conversations read holds no thread for it, so there is nothing to split.
  const thin = toTodayVM(metrics({ period: { messages_in: 1, conversations_active: 1 } }), [], [], [], NOW);
  const by = Object.fromEntries(thin.figures.map((f) => [f.id, f]));
  assert.equal(by.messages.meta, "none yet", "no last_inbound_at in this read");
  assert.equal(by.messages.receipt, null, "no thread to split by wire");
  assert.equal(by.answered.meta, "none answered yet", "a message came in and nothing answered it yet");
  assert.equal(by.answered.receipt, null, "no handover, nothing sent");
  assert.equal(by.calls.meta, "none yet");
  assert.equal(by.calls.receipt, null);
  assert.equal(by.new.meta, "nobody new yet");
  assert.equal(by.new.receipt, null);
  const none = toTodayVM(metrics(), [], [], [], NOW);
  assert.equal(none.figures, null, "no row of zeros");
  assert.equal(none.proof, "No messages have arrived yet.");
  assert.ok(none.quiet.sub.endsWith(" connected. No messages have arrived yet."), `the quiet card's sentence ends with the same proof: ${none.quiet.sub}`);
  const quietLater = toTodayVM(metrics({ now: { last_inbound_at: "2026-08-26T21:39:00Z", last_outbound_at: "2026-08-26T21:40:18Z" } }), [], [], [], NOW);
  assert.equal(quietLater.proof, "The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later.");
  assert.ok(quietLater.quiet.sub.endsWith(quietLater.proof), quietLater.quiet.sub);
  for (const vm of [thin, none]) for (const gone of ["pulse", "launchpad", "updatedAt"]) assert.ok(!(gone in vm), `${gone} has no reader`);
  assert.ok(!("greeting" in none.standing), "no greeting above the work");
});

test("who is waiting with nothing back: the customer wrote last an hour ago or more, nobody replied, nobody holds the thread, and it is not the queue's", () => {
  const vm = toTodayVM(busyDay(), busyThreads(), [], busyCalls(), NOW);
  assert.deepEqual(vm.noReply.map((r) => [r.who, r.conversationId, r.to]), [["Dulce Amaro", "cv-d", "inbox/th-cv-d"]], "Dulce wrote at 8am with nothing back; Ana wrote ten minutes ago and may still get her answer");
  assert.equal(vm.noReply[0].sinceMs, Date.parse("2026-08-27T12:00:00Z"));
  const esc = [{ id: "e1", conversation_id: "cv-d", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T12:05:00Z" }];
  assert.deepEqual(toTodayVM(busyDay(), busyThreads(), esc, busyCalls(), NOW).noReply, [], "a thread the queue holds is not said twice");
  const snoozed = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, state: "snoozed" } : c));
  assert.deepEqual(toTodayVM(busyDay(), snoozed, [], busyCalls(), NOW).noReply, [], "a snoozed thread waits on purpose");
  // A teammate has it (standing.ts: a flagged thread with a claim is theirs), or a person paused the receptionist to reply themselves: not waiting on nobody.
  const theirs = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, state: "needs_human", assignee_user_id: "u-teammate", assignee_is_me: false } : c));
  assert.deepEqual(toTodayVM(busyDay(), theirs, [], busyCalls(), NOW).noReply, [], "REGRESSION: a thread a colleague is answering, listed as ignored");
  const paused = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, paused_until: "2026-08-27T18:00:00Z" } : c));
  assert.deepEqual(toTodayVM(busyDay(), paused, [], busyCalls(), NOW).noReply, [], "a person is on it");
  const archived = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, state: "archived" } : c));
  assert.deepEqual(toTodayVM(busyDay(), archived, [], busyCalls(), NOW).noReply, [], "REGRESSION: a filed-away thread listed as waiting");
  const two = busyThreads().map((c) => (c.id === "cv-a" ? { ...c, state: "open", messages: [at("2026-08-27T09:00:00Z"), at("2026-08-27T11:30:00Z")] } : c));
  assert.deepEqual(toTodayVM(busyDay(), two, [], busyCalls(), NOW).noReply.map((r) => r.who), ["Ana Reyes", "Dulce Amaro"], "oldest wait first");
});

test("one reading of each escalation: Ask's row and the queue's row agree, and a call-back carries the to-do it left", () => {
  const cb = [{ id: "e2", conversation_id: "cv-k", reason: "callback", details: "Call back to confirm Saturday 10:00.", state: "open", created_at: "2026-08-27T14:30:00Z" }];
  const kenia = thread("cv-k", "Kenia Duarte", [], { state: "needs_human" });
  const call = callRow("k9", { conversation_id: "cv-k", started_at: "2026-08-27T14:20:00Z", wanted: "Asked for a gel manicure Saturday.", outcome: "callback_needed" });
  const vm = toTodayVM(busyDay(), [...busyThreads(), kenia], cb, [...busyCalls(), call], NOW);
  const ask = vm.needsYou.rows[0];
  const queue = vm.queue.rows.find((r) => r.kind === "callback");
  assert.equal(ask.who, queue.who);
  assert.equal(ask.quote, "Call back to confirm Saturday 10:00.", "the to-do the phone receptionist left, which Ask never saw");
  assert.equal(ask.meta, "Phone · +1 (305) 555-0100");
  assert.deepEqual([queue.conversationId, queue.callId], ["cv-k", "k9"], "the row says which thread and which call it is about");
  assert.deepEqual([queue.sentence, queue.cta.to], ["Call back to confirm Saturday 10:00.", "conversations/cv-k9"]);
  const handoff = toTodayVM(busyDay(), busyThreads(), [{ id: "e3", conversation_id: "cv-a", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T14:51:00Z" }], [], NOW);
  assert.deepEqual([handoff.queue.rows[0].conversationId, handoff.queue.rows[0].callId], ["cv-a", null]);
  assert.equal(handoff.needsYou.rows[0].quote, "Hi, can I book?", "the customer's own words first");
  const ear = toTodayVM(busyDay(), busyThreads(), [], busyCalls(), NOW).queue.rows.find((r) => r.kind === "call");
  assert.deepEqual([ear.callId, ear.conversationId], ["k3", null], "a call worth a listen names its call");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-vm.test.mjs
```
Expected: the five new tests FAIL (`vm.figures` is undefined); the deleted assertions are gone.

- [ ] **Step 3: `notifications.ts`: a call's key beside the thread's.** After `conversationOfNeedsKey` add:

```ts
/** A derived missed-call row's key: this prefix plus the call's id (buildNotificationFeed). */
export const CALL_KEY_PREFIX = "call:";

/** The call a derived missed-call row stands for, or null. */
export function callOfKey(key: string): string | null {
  return key.startsWith(CALL_KEY_PREFIX) ? key.slice(CALL_KEY_PREFIX.length) : null;
}
```

- [ ] **Step 4: `today.ts`: the types.**

  (a) In `TodayQueueRowVM`, after the `kind` line add:

```ts
  /** The thread this row is about; null for a call with no thread. The away card drops a bell row about the same thread. */
  conversationId: string | null;
  /** The call this row is about: a call-back's newest call, a call worth a listen; null otherwise. */
  callId: string | null;
```

  (b) Replace the whole `TodayVM` interface (from `export interface TodayVM {` to its closing `}`) with:

```ts
export type TodayFigureId = "messages" | "answered" | "calls" | "new";

/**
 * One of the day's four figures: the number, its word, the clause always drawn under it, and the why behind it with
 * one door. A receipt adds to its figure and never repeats its number or its clause, so nothing is said twice and
 * nothing an owner needs lives only behind a hover.
 */
export interface TodayFigureVM {
  id: TodayFigureId;
  label: string;
  value: number;
  meta: string;
  receipt: { text: string; door: { label: string; to: string } | null } | null;
}

/** A thread where the customer wrote last and nothing went back for an hour or more, and nobody was handed it. */
export interface TodayNoReplyVM {
  conversationId: string;
  who: string;
  sinceMs: number;
  to: string;
}

/** A message with nothing back for this long is one nobody answered; the receptionist answers in seconds. */
export const NO_REPLY_AFTER_MS = 3_600_000;

export interface TodayVM {
  standing: {
    eyebrow: string;
    chips: Array<{ text: string; ok: boolean }>;
    /**
     * The wires, counted, in one sentence: "2 of 3 lines connected", "no lines
     * connected yet". `down` is true when one of them is off, the dot beside
     * it. The PAGE counted the chips, so the count could not be told about a
     * wire that is not a tenant_channels row, and email was invisible in it.
     */
    lines: { text: string; down: boolean };
    alert: string | null;
    /** Ask reads these three; the page draws none of them. */
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
  };
  /** Ask's rows: the same escalations the queue draws, read once. */
  needsYou: { count: number; hint: string; rows: TodayNeedsRowVM[]; empty: string | null } | null;
  windowClosing: { label: string; hint: string; rows: Array<{ id: string; text: string; to: string }> } | null;
  /** Ask reads the sentences and the facts; the page draws the sentences that are not numbers and the receipts. */
  recap: {
    label: string;
    line: string;
    sentences: TodaySentenceVM[];
    facts: TodayFactVM[];
    receipts: Array<{ at: string; text: string; to: string }>;
  } | null;
  /** The day's own figures, in order: customer messages, answered by the receptionist, calls, new people. Null on a day with nothing at all. */
  figures: TodayFigureVM[] | null;
  /** When the last message arrived and how long the answer took. Always said: on a day with traffic it is the messages figure's clause, on a quiet day the card's line. */
  proof: string;
  /** Who is waiting with nothing back, oldest first, for Worth a look to name. */
  noReply: TodayNoReplyVM[];
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  /** Whether the calls read succeeded; false means the rows above omit the phone, and the card says so. */
  callsRead: boolean;
  /** Everything that asks for a person, in one row grammar, longest wait first: the rows, the rest as a count, and what the rows hold in words. */
  queue: { rows: TodayQueueRowVM[]; more: number; parts: string[]; empty: TodayQueueEmptyVM };
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
  } | null;
}
```

- [ ] **Step 5: `today.ts`: the words helpers and `todayProof`.** Replace the block from `/** "41s" / "1m 12s". Seconds are exact here — this is a measured median. */` through the `SENT` constant (`const SENT = ["sent", "delivered", "read"];`) with:

```ts
/** "41s" / "1m 12s". Seconds are exact here: this is a measured median. */
function secondsPhrase(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

/** "once", "twice", "3 times". */
const timesWord = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A wire's word inside a sentence: "by WhatsApp", "by email", "by text". */
const wireWord = (w: string): string => (w === "WhatsApp" ? w : w.toLowerCase());

/** Counts by key, most first, then by name; a count that is not a positive number is nothing. */
const counted = (o: Record<string, unknown> | null | undefined): Array<[string, number]> =>
  Object.entries(o ?? {})
    .map(([k, v]): [string, number] => [k, Math.max(0, Math.round(Number(v) || 0))])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const tally = (xs: readonly string[]): Array<[string, number]> => counted(xs.reduce<Record<string, number>>((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {}));

/** A caller the voice provider could not name is counted in the clause, never named in the receipt by these words. */
const UNNAMED_CALLER = new Set(["Caller ID withheld", "Unknown caller", "Unknown"]);

/** How long after the last message the last reply went out, when it did within the hour; null otherwise. */
function replyGapSeconds(live: { last_inbound_at: string | null; last_outbound_at: string | null }): number | null {
  if (!live.last_outbound_at || !live.last_inbound_at) return null;
  const gap = Math.round((new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1000);
  return gap > 0 && gap < 3600 ? gap : null;
}

/**
 * The proof the lines are listening: when the last message arrived and how long the receptionist took to answer it.
 * Always said, never gated on the queue: on this workspace (no traffic, three open escalations) it was suppressed
 * exactly when an owner needed it. On a day with traffic it is the messages figure's clause; on a quiet day the
 * card's line, and the quiet card's own sentence ends with it, so the two cannot drift.
 */
export function todayProof(live: { last_inbound_at: string | null; last_outbound_at: string | null }, tz: string, now: Date): string {
  const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
  if (!lastIn) return "No messages have arrived yet.";
  const gap = replyGapSeconds(live);
  return `The last message arrived ${lastIn}${gap !== null ? `, and the receptionist answered ${secondsPhrase(gap)} later` : ""}.`;
}

const SENT = ["sent", "delivered", "read"];

/**
 * The day's four figures, from the fields Today has fetched on every load and never read (period.new_contacts,
 * call_sentiments, calls_voicemail, messages_out_ai) and from the threads, calls and escalations the page holds.
 * Null on a day with nothing at all: a row of zeros is a product that died overnight, not a fact.
 *
 * A figure is the SQL's count over the whole day; the page holds the newest hundred threads and the open
 * escalations. So a receipt makes an absolute claim ("All by WhatsApp.", "both on WhatsApp") only when what the page
 * holds accounts for the figure's own total, and otherwise says what it is counting ("Of the 4 in the Inbox: ...").
 */
function figuresOf(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  callsInWindow: CallDto[],
  /** The escalations read as it came (state=open): not `openEsc`, which drops the ones a person has taken over. */
  escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>,
  tz: string,
  now: Date,
): TodayFigureVM[] | null {
  const p = m.period;
  const live = m.now;
  if (p.messages_in + p.calls + p.new_contacts === 0) return null;
  const windowMs = new Date(m.window.since).getTime();
  const fresh = (x: { created_at: string; meta: Record<string, unknown> | null }) => x.meta?.backfill !== true && new Date(x.created_at).getTime() >= windowMs;

  // Customer messages: the proof as the clause, the wires as the why. A message with no wire named is WhatsApp, which
  // is what every row was before the column said (viewmodels.ts writtenChannelOf). The receipt says nothing when the
  // read holds none of today's messages, and says what it counted when the read holds fewer than the figure.
  const gap = replyGapSeconds(live);
  const lastAt = tzClock(live.last_inbound_at, tz, now);
  const wires = tally(conversations.flatMap((c) => c.messages.filter((x) => x.direction === "inbound" && x.sender === "customer" && fresh(x)).map((x) => threadChannelWords([x]))));
  const held = wires.reduce((s, [, n]) => s + n, 0);
  const split = andList(wires.map(([w, n]) => `${n} by ${wireWord(w)}`));
  const messages: TodayFigureVM = {
    id: "messages",
    label: "customer messages",
    value: p.messages_in,
    meta: lastAt ? `last at ${lastAt}${gap !== null ? `, answered in ${secondsPhrase(gap)}` : ""}` : "none yet",
    receipt: wires.length
      ? {
          // What the page holds, said once: never "Of the 4 in the Inbox: 4 by WhatsApp."
          text: held !== p.messages_in
            ? held === 1
              ? `The one the Inbox holds came by ${wireWord(wires[0][0])}.`
              : wires.length === 1
                ? `The ${held} the Inbox holds ${held === 2 ? "both" : "all"} came by ${wireWord(wires[0][0])}.`
                : `Of the ${held} in the Inbox: ${split}.`
            : wires.length === 1 ? `All by ${wireWord(wires[0][0])}.` : `${split}.`,
          door: { label: "Open the Inbox", to: "inbox" },
        }
      : null,
  };

  // Answered by the receptionist: how fast and how often it stopped as the clause; why it stopped and what it sent as
  // the why. The clause is the SQL's count of handovers opened today; the reasons are today's escalations as the page
  // holds them (the open ones: the read is state=open), so a handover already resolved is counted, not named.
  // period.escalation_reasons is every OPEN escalation whatever its age (00037_hygiene.sql), so it is not read here:
  // a clause about today with a breakdown about all time contradicted itself on the first workspace that opened it.
  // The raw read, not the queue's list: a handover a teammate has taken over is still open, not resolved.
  const todays = escalations.filter((e) => e.state === "open" && new Date(e.created_at).getTime() >= windowMs);
  const reasons = tally(todays.map((e) => e.reason));
  const resolved = Math.max(0, p.escalations_new - todays.length);
  const answeredMeta = [
    p.median_reply_seconds_ai !== null ? `typically in ${secondsPhrase(p.median_reply_seconds_ai)}` : "",
    p.escalations_new ? `${p.escalations_new} handed over` : p.answered_by_ai ? "none handed over" : "",
  ].filter(Boolean).join(", ") || (p.messages_in ? "none answered yet" : "nothing to answer yet");
  // One sentence, so only its first reason is capitalised: "Asked for a person: once; sent something the receptionist can't read: once."
  const whyStopped = reasons.length ? `${reasons.map(([r, n], i) => `${i === 0 ? capitalize(reasonShort(r) || r) : reasonShort(r) || r}: ${timesWord(n)}`).join("; ")}.` : "";
  const resolvedNote = resolved && p.escalations_new ? `${plural(resolved, "handover")} already resolved.` : "";
  // answered_by_ai counts the asks it answered and messages_out_ai the messages it sent: equal is one reply each, more
  // is more than one thing said; fewer means one reply answered several asks, which is not worth a sentence.
  const sentNote = p.messages_out_ai > p.answered_by_ai ? `It sent ${plural(p.messages_out_ai, "message")} in all.` : p.messages_out_ai && p.messages_out_ai === p.answered_by_ai ? "One reply each." : "";
  const answeredWhy = [whyStopped, resolvedNote, sentNote].filter(Boolean);
  const answered: TodayFigureVM = {
    id: "answered",
    label: "answered by the receptionist",
    value: p.answered_by_ai,
    meta: answeredMeta,
    receipt: answeredWhy.length
      ? { text: answeredWhy.join(" "), door: p.escalations_new ? { label: "See the handovers", to: "inbox" } : null }
      : null,
  };

  // Calls: the time and the voicemails as the clause; the moods and who reached voicemail as the why. A caller is
  // named once, by name or number; a withheld or unknown caller is in the clause's count and never in the sentence.
  const moods = counted(p.call_sentiments);
  const moodOf = ([mood, n]: [string, number]) => (n === p.calls ? (p.calls === 1 ? `it as ${mood.toLowerCase()}` : `all of them as ${mood.toLowerCase()}`) : `${n} as ${mood.toLowerCase()}`);
  const moodWords = moods.length ? `The voice provider read ${andList(moods.map(moodOf))}.` : "";
  const voicemail = [...new Map(callsInWindow.filter((c) => c.in_voicemail).map((c) => [c.contact_id ?? c.from_e164 ?? c.id, toCallVM(c, tz, now).who])).values()].filter((who) => !UNNAMED_CALLER.has(who));
  const voicemailWords = voicemail.length ? `${andList(voicemail.length > 3 ? [...voicemail.slice(0, 3), `${voicemail.length - 3} more`] : voicemail)} reached voicemail.` : "";
  const callsMeta = [
    p.call_seconds > 0 ? (p.call_seconds < 60 ? "under a minute on the phone" : `${Math.round(p.call_seconds / 60)} min on the phone`) : "",
    p.calls_voicemail ? `${p.calls_voicemail} to voicemail` : "",
  ].filter(Boolean).join(", ") || (p.calls ? "none connected" : "none yet");
  const calls: TodayFigureVM = {
    id: "calls",
    label: "calls",
    value: p.calls,
    meta: callsMeta,
    receipt: moodWords || voicemailWords ? { text: [moodWords, voicemailWords].filter(Boolean).join(" "), door: { label: "Open the calls", to: "conversations/phone" } } : null,
  };

  // New people: the threads whose first real message is the customer's and today. The figure is the SQL's count of
  // contacts created today; the threads the page holds may be fewer (a name is said only for a person the figure
  // counts) or more (someone who existed before and wrote for the first time today is not new), so a wire or a name
  // is said only when the two agree.
  const newThreads = conversations.filter((c) => {
    const first = [...c.messages].filter((x) => x.meta?.backfill !== true).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return !!first && first.sender === "customer" && fresh(first);
  });
  const agree = p.new_contacts > 0 && newThreads.length === p.new_contacts;
  const newWires = tally(newThreads.map((c) => threadChannelWords(c.messages)));
  const names = agree ? newThreads.map((c) => contactName(c)) : [];
  const said = names.slice(0, 3);
  const newPeople: TodayFigureVM = {
    id: "new",
    label: "new people",
    value: p.new_contacts,
    meta: !p.new_contacts
      ? "nobody new yet"
      : !agree
        ? "first contact today"
        : newWires.length === 1
          ? `${p.new_contacts === 1 ? "on" : p.new_contacts === 2 ? "both on" : "all on"} ${wireWord(newWires[0][0])}`
          : `on ${andList(newWires.map(([w]) => wireWord(w)))}`,
    receipt: said.length
      ? { text: `${andList(names.length > 3 ? [...said, `${names.length - 3} more`] : said)} wrote for the first time today.`, door: { label: "Open People", to: "clients/seg:new_week" } }
      : null,
  };
  return [messages, answered, calls, newPeople];
}
```

  Then, at the top of the file, the import line `import { channelKindWords, CHANNEL_ANSWERED } from "./channels";` stays, and the `reasonShort` import stays; `capitalize`, `plural`, `timesWord`, `wireWord`, `counted`, `tally` and `UNNAMED_CALLER` are the new module privates above; `standingOf` (already imported) now also decides who is waiting.

- [ ] **Step 6: `today.ts`: `toTodayVM` reads the escalations once and returns the new fields.** Replace the whole function (from `export function toTodayVM(` to the `}` that closes it, just before `/* ------------------------------ the day ---------------------------------- */`) with:

```ts
export function toTodayVM(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  escalations: Array<EscalationDto & { conversation_id: string }>,
  calls: CallDto[] | null,
  now = new Date(),
): TodayVM {
  const tz = m.workspace.timezone;
  const p = m.period;
  const live = m.now;
  // Null: the calls read failed. The card says so rather than counting none.
  const callsRead = calls !== null;
  const callDtos = calls ?? [];

  // now_local is a naive tenant-local wall clock ("2026-08-27T11:00:19"), so
  // parsing it as a local Date yields the salon's own hour and weekday.
  const localNow = new Date(m.window.now_local);
  const valid = !Number.isNaN(localNow.getTime());
  const clock = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const datePart = valid
    ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} · ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "";

  // One normalisation of the wires for the five things Today says about them:
  // the chips, the count above the work, the alert, the empty queue and the
  // quiet day's proof. The label is channels.ts's, so "sms" cannot reach a page.
  const wires = m.channels.map((c) => ({
    kind: c.kind,
    label: channelKindWords(c.kind),
    on: c.status === "active",
    where: c.address ?? c.number ?? null,
  }));
  const chips = wires.map((w) => ({ text: `${w.label} ${w.on ? "connected" : "disconnected"}`, ok: w.on }));
  const down = wires.filter((w) => !w.on);
  const on = wires.filter((w) => w.on);
  const up = on.length;
  // The count lives here because the sentence has a number in it. The page
  // counted its own chips, which is why "2 of 2 lines connected" was said on a
  // workspace with three. A wire that could not be read is not a smaller
  // whole: the line says so instead of a count that is short by one.
  const lines = {
    text: m.linesRead === false
      ? "the email line could not be counted"
      : wires.length
        ? `${up} of ${wires.length} ${wires.length === 1 ? "line" : "lines"} connected`
        : "no lines connected yet",
    down: down.length > 0,
  };

  // The alert is the one place Today raises its voice, and it SUPPRESSES every
  // reassuring line — "nothing needs you" is a lie while the number is dark.
  const alert =
    m.workspace.status === "paused"
      ? "This workspace is paused — the receptionist is not answering anything."
      : down.length
        ? `${andList(down.map((w) => w.label))} ${down.length > 1 ? "are" : "is"} disconnected — messages coming in are not being answered.`
        : null;

  // What an empty queue means HERE. The page chose between three of these by
  // counting chips: an email-only workspace was told nothing could come in,
  // and counting email would have told it the receptionist was answering on
  // its own, which it does not do for email. The heading's own words ride
  // with it, so the two are decided once.
  const answered = on.filter((w) => CHANNEL_ANSWERED.has(w.kind));
  const queueEmpty: TodayQueueEmptyVM =
    m.workspace.status === "paused"
      ? { title: "Nothing in the queue — the workspace is paused, so nothing is being answered.", sub: "nothing in the queue", glyph: "alert", tone: "warn", testid: "today-queue-empty-paused" }
      : down.length
        ? { title: "Nothing in the queue — new messages go unanswered until the line is back.", sub: "nothing in the queue", glyph: "alert", tone: "warn", testid: "today-queue-empty-down" }
        : wires.length === 0
          ? { title: "Nothing in the queue — nothing can come in until a line is connected.", sub: "nothing in the queue", glyph: "phone", tone: "", testid: "today-queue-empty-unconnected" }
          : answered.length === 0
            ? on.every((w) => w.kind === "email")
              ? { title: `Nothing in the queue. ${EMAIL_NOT_ANSWERED_SENTENCE}`, sub: "nothing in the queue", glyph: "mail", tone: "", testid: "today-queue-empty-unanswered" }
              : { title: "Nothing in the queue — no line the receptionist answers is connected.", sub: "nothing in the queue", glyph: "phone", tone: "", testid: "today-queue-empty-unanswered" }
            : { title: "All caught up — the receptionist is answering on its own.", sub: "nothing needs you", glyph: "check", tone: "ok", testid: "today-queue-empty-ok" };

  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = escalations
    .filter((e) => e.state === "open")
    // One rule (standing.ts): a handoff a person has already taken over is
    // theirs, not the queue's. An escalation whose thread the page did not
    // load keeps its place — unknown is not "handled".
    .filter((e) => {
      const conv = byConv.get(e.conversation_id);
      if (!conv) return true;
      return standingOf({
        state: conv.state, paused_until: conv.paused_until, assignee_user_id: conv.assignee_user_id,
        assignee_is_me: conv.assignee_is_me, open_escalation: true,
      }, now.getTime()).standing === "needs_you";
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest waiting first
  // The one number every surface shows for "need you": the Inbox badge counts
  // the same threads by the same rule.
  const needsYouCount = openEsc.length;

  const sinceMs = new Date(m.window.since).getTime();
  const callsInWindow = callDtos.filter(
    (c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs,
  );
  const callMinutes = Math.round(p.call_seconds / 60);

  // The newest call a thread holds: a call-back's row opens it, and a call-back with no thread is named by it.
  const callByConv = new Map<string, CallDto>();
  for (const c of callDtos) {
    if (!c.conversation_id) continue;
    const prev = callByConv.get(c.conversation_id);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) callByConv.set(c.conversation_id, c);
  }
  const say = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

  // ONE reading of each open escalation. Ask's rows (needsYou) and the queue's handoff and call-back rows were two
  // derivations of the same list, and they disagreed on a call-back: Ask never saw the to-do the phone receptionist
  // left, and named a caller with no thread "Unknown" where the queue named the call.
  const escRecords = openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);
    const call = e.reason === "callback" ? callByConv.get(e.conversation_id) ?? null : null;
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : undefined;
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    return {
      e,
      conv,
      call,
      waitedMs,
      warn: waitedMs > 30 * 60000,
      since: tzSince(e.created_at, tz, now) ?? "",
      // her own words, never a generated characterization of them
      quote: lastCustomer ? clipAtWord(messageText(lastCustomer), QUOTE_MAX) : "",
      who: conv ? contactName(conv) : call ? toCallVM(call, tz, now).who : e.reason === "callback" ? "Unknown caller" : "Unknown",
      closes: win?.open ? tzClock(win.closesAtIso, tz, now) : null,
    };
  });

  const needsRows: TodayNeedsRowVM[] = escRecords.map((r) => ({
    id: `th-${r.e.conversation_id}`,
    conversationId: r.e.conversation_id,
    escalationId: r.e.id,
    who: r.who,
    reason: ESCALATION_REASON_LABELS[r.e.reason] ?? r.e.reason,
    waited: formatWaited(r.waitedMs),
    warn: r.warn,
    // The customer's words; for a call-back with none, the to-do the phone receptionist left.
    quote: r.quote || (r.e.reason === "callback" ? say(r.e.details) : ""),
    // A call-back is the phone's, whatever wire the thread's words travelled; the queue's row says "Phone" too.
    meta: r.e.reason === "callback" ? (r.conv ? contactMeta(r.conv, "Phone") : "Phone") : r.conv ? contactMeta(r.conv, threadChannelWords(r.conv.messages)) : "WhatsApp",
    windowNote: r.closes ? `Reply window closes ${r.closes}` : null,
    to: `inbox/th-${r.e.conversation_id}`,
  }));

  // Threads where the customer spoke last and the free-reply window is running
  // out. Rendered ONLY when at least one qualifies — an empty deadline board
  // manufactures anxiety on a calm day.
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const closingConvs = conversations
    .filter((c) => {
      if (escSet.has(c.id)) return false;
      const last = c.messages[c.messages.length - 1];
      if (!last || last.sender !== "customer") return false;
      const w = waWindow(c.last_wa_inbound_at, now);
      return w.open && w.closesAtIso
        ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * 3600 * 1000
        : false;
    });
  const closingRows = closingConvs.map((c) => {
      const w = waWindow(c.last_wa_inbound_at, now);
      const mins = w.closesAtIso
        ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / 60000))
        : 0;
      return {
        id: `wc-${c.id}`,
        text: `${contactName(c)} — window closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} (in ${formatWaited(mins * 60000)})`,
        to: `inbox/th-${c.id}`,
      };
    });

  // Who is waiting with nothing back: the customer wrote last an hour ago or more, nobody replied, nobody holds the
  // thread (the one rule, standing.ts: a thread a person paused or claimed is not waiting on nobody), and no queue
  // row is about it (an escalation's thread and a closing window's thread are the queue's; nothing on this page is
  // said twice). The identity was in the conversations read all along and only the count survived into the view model.
  const closingSet = new Set(closingConvs.map((c) => c.id));
  const noReply: TodayNoReplyVM[] = conversations
    .flatMap((c) => {
      // Archived is filed away, which standingOf reads as quiet; it is not waiting on anybody.
      if (escSet.has(c.id) || closingSet.has(c.id) || c.state === "archived") return [];
      const { standing } = standingOf({
        state: c.state, paused_until: c.paused_until, assignee_user_id: c.assignee_user_id,
        assignee_is_me: c.assignee_is_me, open_escalation: false,
      }, now.getTime());
      if (standing !== "quiet" && standing !== "needs_you") return [];
      const last = c.messages[c.messages.length - 1];
      if (!last || last.sender !== "customer") return [];
      const lastMs = new Date(last.created_at).getTime();
      if (now.getTime() - lastMs < NO_REPLY_AFTER_MS) return [];
      return [{ conversationId: c.id, who: contactName(c), sinceMs: lastMs, to: `inbox/th-${c.id}` }];
    })
    .sort((a, b) => a.sinceMs - b.sinceMs);

  const proof = todayProof(live, tz, now);
  const figures = figuresOf(m, conversations, callsInWindow, escalations, tz, now);

  const traffic = p.messages_in + p.calls + p.messages_out_you;
  const isQuiet = traffic === 0 && needsYouCount === 0 && !alert;

  // Ask's four facts. A zero is a real measurement, and "—" is a real "not enough data yet"; never a delta, a
  // percentage or a sparkline: a jump from 1 message to 3 is not "+200%".
  const facts: TodayFactVM[] = [
    { label: "Messages in", value: String(p.messages_in) },
    { label: "Answered by the receptionist", value: `${p.answered_by_ai} of ${p.messages_in}` },
    p.median_reply_seconds_ai === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: secondsPhrase(p.median_reply_seconds_ai) },
    { label: "Calls", value: p.calls ? `${p.calls}${callMinutes ? ` · ${callMinutes} min` : ""}` : "0" },
  ];
  // The day's traffic as one sentence, for Ask; the page draws the figures instead.
  const trafficParts: string[] = [];
  if (p.messages_in > 0) {
    trafficParts.push(
      `${p.messages_in} message${p.messages_in === 1 ? "" : "s"} in, ${p.answered_by_ai} answered by the receptionist${
        p.median_reply_seconds_ai === null ? "" : `, typically in ${secondsPhrase(p.median_reply_seconds_ai)}`
      }`,
    );
  }
  if (p.calls) {
    trafficParts.push(
      `${p.calls} call${p.calls === 1 ? "" : "s"}${callMinutes ? `, ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""}`,
    );
  }
  const trafficLine = trafficParts.length ? `${trafficParts.join(". ")}.` : "Nothing has come in yet today.";

  /* ---- the quiet day: prove we are listening, don't show a row of zeroes ---- */
  if (isQuiet) {
    const names = andList(wires.map((w) => w.label));
    const pluralVerb = wires.length > 1 ? "are" : "is";
    // A workspace with no wire yet is a new owner's first Today — it must not
    // read " is connected." with nothing in front of it, and it must not name
    // the only two wires this sentence used to know about.
    const sub = wires.length === 0
      ? "No line is connected yet, so nothing can come in."
      : `${names} ${pluralVerb} connected. ${proof}`;
    return {
      standing: {
        eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
        chips,
        lines,
        alert: null,
        headline: "Nothing has come in yet today.",
        detail: null,
        tone: "calm",
      },
      needsYou: null,
      windowClosing: null,
      recap: { label: "Today so far", line: "Nothing has come in yet today.", sentences: [], facts, receipts: [] },
      figures: null,
      proof,
      noReply,
      calls: null,
      callsRead,
      queue: { rows: [], more: 0, parts: [], empty: queueEmpty },
      quiet: {
        headline: "Nothing has come in yet today.",
        sub,
        proof: [
          ...(wires.length === 0 ? [{ label: "Lines", value: "none connected yet" }] : []),
          ...wires.map((w) => ({
            label: w.label,
            // "on" / "off" in the owner's words, never the column's value. A
            // wire with nothing to name it by says only that: "connected · on"
            // was two words for one fact.
            value: w.where ? `${w.where} · ${w.on ? "on" : "off"}` : w.on ? "on" : "off",
          })),
          { label: "Checked", value: "just now" },
        ],
        launchpad: conversations.length
          ? {
              label: `Nothing waiting. ${conversations.length} earlier conversation${
                conversations.length === 1 ? "" : "s"
              } →`,
              to: "conversations",
            }
          : null,
      },
    };
  }

  /* ---- headline ladder: first match wins ---- */
  const oldest = tzSince(live.oldest_open_escalation_at, tz, now);
  let headline: string;
  let detail: string | null = null;
  let tone: "needs" | "calm" | "alert" = "calm";

  if (alert) {
    headline = "Check your connection before anything else.";
    tone = "alert";
  } else if (needsYouCount > 1) {
    headline = `${needsYouCount} conversations need you.`;
    if (oldest) detail = `The oldest has been waiting since ${oldest}.`;
    tone = "needs";
  } else if (needsYouCount === 1) {
    headline = "One conversation needs you";
    const who = needsRows[0]?.who;
    if (who && oldest) detail = `${who} has been waiting since ${oldest}.`;
    tone = "needs";
  } else {
    const bits: string[] = [];
    if (p.messages_in) {
      bits.push(
        `${p.messages_in} message${p.messages_in === 1 ? "" : "s"}${
          p.conversations_active
            ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}`
            : ""
        }`,
      );
    }
    if (p.calls) bits.push(`${p.calls} call${p.calls === 1 ? "" : "s"}`);
    // "Handled everything" only when the receptionist did: a message you
    // answered yourself, or one nobody answered, is not the receptionist's.
    const allByReceptionist = p.unanswered_in_window === 0 && p.messages_out_you === 0;
    headline = bits.length
      ? allByReceptionist
        ? `The receptionist handled everything — ${bits.join(" and ")} today. Nothing needs you.`
        : `${bits.join(" and ")} today. Nothing needs you right now.`
      : "Nothing needs you.";
    if (p.median_reply_seconds_ai !== null && p.messages_in > 0) {
      detail = `It answered ${p.answered_by_ai} of the ${p.messages_in} on its own, typically in about ${secondsPhrase(
        p.median_reply_seconds_ai,
      )}.`;
    }
  }

  /* ---- Ask's recap sentences: only what the HEADLINE does not already say. When nothing needs you, the headline
     is "The receptionist handled everything — N messages and M calls", so repeating those counts here would be the
     brief reading its own first line back. When something DOES need you, the headline is spent on that. ---- */
  const sentences: TodaySentenceVM[] = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (p.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      // Not "the WhatsApp receptionist": answered_by_ai is first_replies with
      // no channel predicate (00037_hygiene.sql), so an email it answered is
      // in this count. Every other sentence in this file already says just
      // "the receptionist".
      text: `The receptionist answered ${p.answered_by_ai} message${p.answered_by_ai === 1 ? "" : "s"}${
        p.conversations_active
          ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}`
          : ""
      }.`,
      traffic: true,
    });
  }
  if (p.calls && !headlineCoversTraffic) {
    sentences.push({
      text: `${p.calls} caller${p.calls === 1 ? "" : "s"} reached the phone line${
        callMinutes ? ` — ${callMinutes} minute${callMinutes === 1 ? "" : "s"} total` : ""
      }.`,
      traffic: true,
    });
  }
  if (p.messages_out_you) {
    sentences.push({ text: `You sent ${p.messages_out_you} repl${p.messages_out_you === 1 ? "y" : "ies"} yourself.` });
  }
  // A reply that never reached the customer is the one line that must never be
  // quiet — the send already escalated, but a card saying "handled everything"
  // while a message died in transit would be a lie of omission.
  if (p.send_failures) {
    // The thread of the newest reply that failed, when the conversations read holds it: "See the thread"
    // opened the Inbox list, where the owner had to go looking.
    const lastFailed = conversations
      .flatMap((c) =>
        c.messages
          .filter((x) => x.direction === "outbound" && x.status === "failed" && x.meta?.backfill !== true && new Date(x.created_at).getTime() >= sinceMs)
          .map((x) => ({ conv: c, at: x.created_at })),
      )
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    sentences.push({
      text: `${p.send_failures} repl${p.send_failures === 1 ? "y" : "ies"} failed to deliver — the customer got no answer.`,
      warn: true,
      ...(lastFailed ? { to: `inbox/th-${lastFailed.conv.id}` } : {}),
    });
  }

  // Receipts quote the message that actually went out. She is spot-checking
  // tone, not reading a report — a summary of the reply defeats the purpose.
  //
  // Backfilled rows are excluded for the same reason the SQL excludes them:
  // their created_at is the moment the IMPORT ran, so the first live load
  // rendered weeks-old replies as "sent at 1:59 AM today". A receipt whose
  // timestamp is wrong is worse than no receipt.
  const receipts = conversations
    .flatMap((c) =>
      c.messages
        .filter(
          (x) =>
            x.direction === "outbound" &&
            SENT.includes(String(x.status)) &&
            x.meta?.backfill !== true &&
            new Date(x.created_at).getTime() >= sinceMs,
        )
        .map((x) => ({ conv: c, msg: x })),
    )
    .sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at))
    .slice(0, 3)
    .map(({ conv, msg }) => ({
      at: tzTime(msg.created_at, tz) ?? "",
      text: `replied to ${contactName(conv)}: “${messageText(msg).slice(0, 90)}”`,
      to: `inbox/th-${conv.id}`,
    }));

  /* ---- calls worth an ear: rows ONLY for the ones that need one.
     A call that went fine is a line in the aggregate, not a row demanding
     attention — the whole point of the region is that it stays short. ---- */
  const NEEDS_EAR = ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"];
  const callRows: TodayCallRowVM[] = callsInWindow
    // A dial that never connected is not a call, so it is not a call worth an ear.
    .filter((c) => c.status !== "not_connected")
    .map((c) => ({ c, vm: toCallVM(c, tz, now) }))
    .filter(
      ({ c, vm }) =>
        vm.live ||
        c.in_voicemail ||
        c.sentiment === "Negative" ||
        !c.summary ||
        // Somebody rang and left with nothing. Measured before writing this:
        // with a provider summary the row was not worth an ear at all, since
        // `user_hangup` is not in NEEDS_EAR and rightly so — every ordinary
        // call ends that way. Without one it did arrive, as "No summary from
        // the voice provider", which reads as our glitch rather than as the
        // day's one lost customer whose number the business already has.
        abandonedCall(c) ||
        (c.disconnection_reason ? NEEDS_EAR.includes(c.disconnection_reason) : false),
    )
    .map(({ c, vm }) => {
      const endedMs = c.ended_at ? new Date(c.ended_at).getTime() : NaN;
      const analysisDue = !c.summary && Number.isFinite(endedMs) && now.getTime() - endedMs < ANALYSIS_GRACE_MS;
      return {
        id: c.id,
        who: vm.who,
        at: tzTime(c.started_at, tz) ?? "",
        duration: vm.duration ?? "",
        note: vm.live
          ? "In progress right now"
          : c.in_voicemail
            ? "Reached voicemail"
            // BEFORE the summary branches, deliberately. A caller gone in six
            // seconds has no summary and never will have much of one, so the
            // chain below would have said "summary on its way" and buried the
            // only fact worth acting on.
            : abandonedCall(c)
              ? `Hung up after ${spokenDuration(c.duration_ms)} — they left with nothing`
              : c.sentiment === "Negative"
                ? "Caller sentiment: Negative — the voice provider's own read"
                : analysisDue
                  ? "Summary on its way from the voice provider"
                  : !c.summary
                    ? "No summary from the voice provider"
                    : (DISCONNECTION_LABELS[c.disconnection_reason ?? ""] ?? "Ended early"),
        to: vm.live ? "live" : `conversations/cv-${c.id}`,
      };
    });

  /* ---- the queue: everything that asks for a person, in one row grammar.
     The longest wait first; a closing window by how soon it closes; a call
     worth an ear last. Six on Today, the rest a count for the Inbox link. ---- */
  const queueAll: TodayQueueRowVM[] = [];
  for (const r of escRecords) {
    const e = r.e;
    if (e.reason === "callback") {
      // The phone receptionist could not finish it: the to-do it left is the
      // sentence, the call itself is where the verb goes, Done resolves it.
      queueAll.push({
        id: `q-${e.id}`, kind: "callback", conversationId: e.conversation_id, callId: r.call ? r.call.id : null,
        who: r.who, initials: initialsOf(r.who), channel: "Phone",
        when: `waited ${formatWaited(r.waitedMs)}`,
        sentence: say(e.details) || "The caller needs a call back.", quoted: false,
        status: ["Needs a call back", `since ${r.since}`], tone: "escalated", warn: r.warn,
        cta: { label: "Open the call", to: r.call ? `conversations/cv-${r.call.id}` : `inbox/th-${e.conversation_id}` },
        also: { label: "Done", verb: "resolve", conversationId: e.conversation_id, escalationId: e.id },
        waitedMs: r.waitedMs,
      });
      continue;
    }
    queueAll.push({
      id: `q-${e.id}`, kind: "handoff", conversationId: e.conversation_id, callId: null,
      who: r.who, initials: initialsOf(r.who), channel: r.conv ? threadChannelWords(r.conv.messages) : "WhatsApp",
      when: `waited ${formatWaited(r.waitedMs)}`,
      sentence: r.quote || (ESCALATION_REASON_LABELS[e.reason] ?? e.reason), quoted: !!r.quote,
      status: ["Escalated", reasonShort(e.reason) || e.reason, `since ${r.since}`, ...(r.closes ? [`reply window closes ${r.closes}`] : [])],
      tone: "escalated", warn: r.warn,
      cta: { label: "Open and reply", to: `inbox/th-${e.conversation_id}` },
      also: { label: "Snooze", verb: "snooze", conversationId: e.conversation_id, escalationId: e.id },
      waitedMs: r.waitedMs,
    });
  }
  for (const c of closingConvs) {
    const w = waWindow(c.last_wa_inbound_at, now);
    const leftMs = w.closesAtIso ? Math.max(60000, new Date(w.closesAtIso).getTime() - now.getTime()) : 0;
    const last = [...c.messages].reverse().find((x) => x.sender === "customer");
    const who = contactName(c);
    queueAll.push({
      // "WhatsApp" is right here even when the last written message came by
      // email: the row is about WhatsApp's window (waWindow on the thread's
      // last WhatsApp inbound), which is the one wire that has one. The
      // handoff row above names the wire the reply would go out on instead.
      id: `q-w-${c.id}`, kind: "window", conversationId: c.id, callId: null, who, initials: initialsOf(who), channel: "WhatsApp",
      when: `closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} · in ${formatWaited(leftMs)}`,
      sentence: last ? clipAtWord(messageText(last), QUOTE_MAX) : "They wrote last, and the free reply window is closing.", quoted: !!last,
      status: ["Reply window closing", "they wrote last"], tone: "warn", warn: leftMs < 2 * 3600000,
      cta: { label: "Open thread", to: `inbox/th-${c.id}` }, also: null,
      // After every escalation (which waited ≥ 0), the soonest to close first.
      waitedMs: -leftMs,
    });
  }
  for (const r of callRows) {
    if (r.to === "live") continue;
    const c = callsInWindow.find((k) => k.id === r.id);
    const wanted = say(c?.wanted);
    queueAll.push({
      id: `q-c-${r.id}`, kind: "call", conversationId: c?.conversation_id ?? null, callId: r.id, who: r.who, initials: initialsOf(r.who), channel: "Phone",
      when: `${r.at}${r.duration ? ` · ${r.duration}` : ""}`,
      sentence: wanted || r.note, quoted: false,
      status: [wanted ? r.note : "Worth a listen"], tone: "warn", warn: false,
      cta: { label: "Open the call", to: r.to }, also: null,
      waitedMs: Number.NEGATIVE_INFINITY,
    });
  }
  queueAll.sort((a, b) => b.waitedMs - a.waitedMs);
  const countOf = (...kinds: TodayQueueRowVM["kind"][]) => queueAll.filter((r) => kinds.includes(r.kind)).length;
  const needN = countOf("handoff", "callback");
  const winN = countOf("window");
  const earN = countOf("call");
  const parts = [
    needN ? `${needN} need you` : "",
    winN ? `${winN} reply window${winN === 1 ? "" : "s"} closing` : "",
    earN ? `${earN} call${earN === 1 ? "" : "s"} worth a listen` : "",
  ].filter(Boolean);
  const queue = { rows: queueAll.slice(0, TODAY_QUEUE_MAX), more: Math.max(0, queueAll.length - TODAY_QUEUE_MAX), parts, empty: queueEmpty };

  return {
    standing: {
      eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
      chips,
      lines,
      alert,
      headline,
      detail,
      tone,
    },
    needsYou: {
      count: needsYouCount,
      hint: "The receptionist stopped and asked for a human.",
      rows: needsRows,
      empty: needsRows.length
        ? null
        : p.unanswered_in_window === 0 && p.messages_out_you === 0
          ? "Nothing needs you. The receptionist answered every message that came in, and nobody asked for a person."
          : "Nothing needs you right now — nobody asked for a person.",
    },
    windowClosing: closingRows.length
      ? {
          label: "Reply window closing",
          hint: "WhatsApp only lets you write freely for 24 hours after someone messages you. After that it's an approved template.",
          rows: closingRows,
        }
      : null,
    recap: { label: "Today so far", line: trafficLine, sentences, facts, receipts },
    figures,
    proof,
    noReply,
    callsRead,
    calls: p.calls
      ? {
          line: `${p.calls} call${p.calls === 1 ? "" : "s"} today${
            callMinutes ? ` · ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""
          }.`,
          rows: callRows,
        }
      : null,
    queue,
    quiet: null,
  };
}
```

  (The pins that still hold, by design: `standingOf({` (standing.test), no `live.escalations_open` (standing.test), `import { ANALYSIS_GRACE_MS } from "./live"` (calls-hardening), and five `tzClock(` calls (polish: the definition, the escalation record's `closes`, the closing row's text, the messages figure's `last at`, the window row's `when`). `today-calls-strip.test.mjs` pins `for (const e of openEsc) {`, which is now `for (const r of escRecords) {`; that suite is rewritten in PR B, Task B9; in PR A its assertion is updated in Step 8 below.)

- [ ] **Step 7: Build and run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-vm.test.mjs tooling/scripts/tests/today-queue.test.mjs tooling/scripts/tests/today-doors.test.mjs tooling/scripts/tests/the-pages-say-only-what-is-true.test.mjs tooling/scripts/tests/metrics-truth.test.mjs tooling/scripts/tests/empty-failed.test.mjs tooling/scripts/tests/abandoned-calls.test.mjs tooling/scripts/tests/call-lifecycle.test.mjs tooling/scripts/tests/runs-honest.test.mjs tooling/scripts/tests/gate-reason.test.mjs tooling/scripts/tests/refusals-on-the-page.test.mjs tooling/scripts/tests/ask-turn.test.mjs
```
Expected: all PASS. If `today-vm`'s "the day's four figures" fails on the messages meta, check the fixture clock: `NOW` is 11:00 New York and `last_inbound_at` 14:38Z is 10:38 AM; `tzClock` gives a bare time for the same day.

- [ ] **Step 8: Move the one pin the new loop broke.** In `tooling/scripts/tests/today-calls-strip.test.mjs`, the assertion `const esc = vm.indexOf("for (const e of openEsc) {");` becomes `const esc = vm.indexOf("for (const r of escRecords) {");` (the count of `readRaw(` calls is unchanged). Run it: `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-calls-strip.test.mjs` → PASS.

- [ ] **Step 9: Typecheck (the Ask tool and the bridge still compile against the VM) and commit**

```bash
corepack pnpm -r typecheck
git add packages/contracts/src/today.ts packages/contracts/src/notifications.ts tooling/scripts/tests/today-vm.test.mjs tooling/scripts/tests/today-calls-strip.test.mjs
git commit -m "Today's view model: the day's four figures with their receipts, the proof ungated, who is waiting, one reading of the escalations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task A3: The period line, the runs' words, Worth a look v2, the four-kind dedupe

**Files:**
- Modify: `packages/contracts/src/today.ts`
- Test: `tooling/scripts/tests/today-leaks.test.mjs` (modify; it holds no source pin)

- [ ] **Step 1: Write the failing tests.** In `tooling/scripts/tests/today-leaks.test.mjs`:

  (a) The import line becomes:
```js
import { todayLeaks as todayLeaksV2, todayAwayGrouped, todayPeriodLine, todayRunWords, todayRunsSub, todayRunApproved, toBroadcastVM, unreadCount, TODAY_LEAK_MAX, SERVER_NOTIFICATION_KINDS, serverNotificationRows } from "@chanlytics/contracts";
// The mockup's sample is a real ReportsSurface (reportDto through toReportVM): the round trip the period line is tested on.
import { reportsSample } from "../../../apps/dashboard/src/legacy-bridge/reports-sample.ts";

// v2 returns { rows, more } and takes who is waiting before the cap; the rules pinned below are about the rows, so
// they read them through this and stay as written.
const todayLeaks = (r, p, max) => todayLeaksV2(r, p, [], max).rows;
```
  Nothing else in the existing tests changes: every `todayLeaks(a, b)` and `todayLeaks(a, b, 4)` now goes through the wrapper.

  (b) Append:

```js
/* ------------------------------ worth a look, v2 ------------------------------ */

test("each row wears a word and an icon for its tone, and offers Ask its own facts with their arithmetic", () => {
  const { rows } = todayLeaksV2(reports(), people());
  assert.deepEqual(rows.map((l) => [l.id, l.tag, l.icon]), [["never-booked", "Booking gap", "calendar"], ["unanswered", "No reply", "alert"]]);
  assert.equal(rows[0].ask, "18 people wrote or called in the last 30 days. Not one of them is on the calendar. 0 of 18 booked · 17 on Asked, never booked. Why is that?", "the sentence and the arithmetic under it, so Ask grounds the answer in the same numbers");
  assert.equal(rows[1].ask, "4 customer messages never got an answer at all. of 21 in the last 30 days · the receptionist answered 16, you answered 1. Why is that?");
  const { rows: reach } = todayLeaksV2(reports({ vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } }, booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 } }), people());
  assert.deepEqual(reach.map((l) => [l.id, l.tag, l.icon]), [["unreachable", "Reach", "users"], ["quiet", "Gone quiet", "clock"]]);
  assert.equal(reach[0].text, "7 people have said yes to messages, but nobody has said yes to offers.", "the sentence the nightly pins stays");
  assert.deepEqual([reach[0].cta.label, reach[0].also.label], ["Open People", "Get their yes to offers"], "and so do its two doors");
});

test("a third problem is counted, not dropped in silence", () => {
  const all = todayLeaksV2(reports(), people(), [], 4);
  assert.equal(all.rows.length, 4);
  assert.equal(all.more, 0);
  const two = todayLeaksV2(reports(), people());
  assert.equal(two.rows.length, TODAY_LEAK_MAX);
  assert.equal(two.more, 2, "the two it did not draw");
  assert.equal(two.moreLine, "and 2 more", "said by contracts, drawn by the page");
  assert.equal(todayLeaksV2(reports(), people(), [], 3).moreLine, "and 1 more");
  assert.equal(all.moreLine, null);
  assert.deepEqual(todayLeaksV2(null, null), { rows: [], more: 0, moreLine: null });
});

test("the unanswered row names who is waiting NOW, up to two, from the threads Today holds: not the count's own subjects", () => {
  const waiting = [
    { conversationId: "cv-d", who: "Dulce Amaro", sinceMs: 1, to: "inbox/th-cv-d" },
    { conversationId: "cv-r", who: "Renata Solís", sinceMs: 2, to: "inbox/th-cv-r" },
    { conversationId: "cv-x", who: "Ana", sinceMs: 3, to: "inbox/th-cv-x" },
  ];
  const row = todayLeaksV2(reports(), people(), waiting).rows.find((l) => l.id === "unanswered");
  assert.deepEqual(row.people, [{ id: "cv-d", name: "Dulce Amaro", to: "inbox/th-cv-d" }, { id: "cv-r", name: "Renata Solís", to: "inbox/th-cv-r" }]);
  assert.equal(row.text, "4 customer messages never got an answer at all.", "the count stays Reports' over its period; the names are the threads waiting right now, and the page says so");
  assert.deepEqual(todayLeaksV2(reports(), people()).rows.find((l) => l.id === "unanswered").people, []);
  assert.deepEqual(todayLeaksV2(reports(), people(), waiting).rows.find((l) => l.id === "never-booked").people, [], "only the unanswered row names people");
});

/* ------------------------------ while you were away, v2 ------------------------------ */

test("the dedupe covers all four queue kinds: a closing window's thread, a call worth a listen, a call-back's call", () => {
  const rows = [
    bell("n:1", "handoff", "Zoe Martin needs you", "warn", { type: "conversation", id: "cv-1" }),
    { ...bell("draft:m-9", "held_draft", "A reply to Renata is waiting for you"), actions: [{ label: "Review", to: "inbox/th-cv-w", primary: true }] },
    { ...bell("call:k-3", "missed_call", "Missed call · Kenia", "warn"), actions: [{ label: "See the call", to: "conversations/cv-k-3", primary: true }] },
    bell("n:7", "call", "+1 (929) 370-9606 phoned", "", { type: "call", id: "k-9" }),
    bell("n:8", "review", "1 new rating on Google", "ok"),
    // A row as serverNotificationRows shapes it: its door on `to`, nothing on `about`.
    { ...bell("n:9", "handoff", "Priya Nair needs you", "warn"), to: "inbox/th-cv-p" },
  ];
  const queue = [
    { conversationId: "cv-1", callId: null },                 // a handoff
    { conversationId: "cv-w", callId: null },                 // a reply window closing
    { conversationId: null, callId: "k-3" },                  // a call worth a listen
    { conversationId: "cv-k", callId: "k-9" },                // a call-back and its call
    { conversationId: "cv-p", callId: null },                 // a handoff whose bell row names its thread only by its door
  ];
  const out = todayAwayGrouped(rows, queue, 5);
  assert.deepEqual(out.groups.map((g) => g.row.id), ["n:8"], "every row about something the queue above holds is dropped");
  assert.equal(out.total, 6, "and still counted on the head, because it is still in the bell");
  assert.equal(out.queued, 5);
  assert.equal(out.foot, "5 more in the bell, already in the queue above");
  const strings = todayAwayGrouped(rows, ["cv-1"], 5);
  assert.deepEqual(strings.groups.map((g) => g.row.id), ["call:k-3", "n:9", "draft:m-9", "n:7", "n:8"], "a bare string is still a conversation id; the warnings sort first, as ever");
});

/* ------------------------------ the period, in one line ------------------------------ */

test("the last seven days in one sentence, in Reports' own numbers and words, each read from the view model Reports draws", () => {
  const r = reports({ vm: { tiles: [{ id: "messages", label: "Customer messages", value: "23", meta: "", delta: null, spark: [], compare: "up from 19" }, { id: "calls", label: "Calls", value: "4", meta: "", delta: null, spark: [], compare: null }], answered: { totals: { in: 23, ai: 21, you: 1, none: 1 }, share: 21 / 23 }, replyTime: { count: 21, medianLabel: "34s" }, calls: { total: 4 }, period: { now: "Last 7 days" }, rangeLabel: "7 days" } });
  assert.deepEqual(todayPeriodLine(r), { text: "Last 7 days: 23 customer messages (up from 19), 91% answered by the receptionist, median reply 34s, 4 calls.", to: "reports" });
  const quiet = reports({ vm: { tiles: [], answered: { totals: { in: 0, ai: 0, you: 0, none: 0 }, share: null }, empty: true, period: { now: "Last 30 days" }, rangeLabel: "30 days" } });
  assert.equal(todayPeriodLine(quiet).text, "Last 30 days: nobody wrote or called.");
  const noReplies = reports({ vm: { tiles: [{ id: "messages", label: "Customer messages", value: "1", meta: "", delta: null, spark: [] }], answered: { totals: { in: 1, ai: 0, you: 1, none: 0 }, share: 0 }, replyTime: { count: 0, medianLabel: "—" }, calls: { total: 1 }, rangeLabel: "7 days" } });
  assert.equal(todayPeriodLine(noReplies).text, "Last 7 days: 1 customer message, 0% answered by the receptionist, 1 call.", "no median without a reply; no comparison without one; the singulars; the lead from the range when Reports gives no period words");
  assert.equal(todayPeriodLine(null), null);
  assert.equal(todayPeriodLine(reports({ vm: { answered: undefined } })), null, "nothing to count from: no line rather than a zero");
  assert.equal(todayPeriodLine(reports({ campaigns: null })).to, "reports", "the offers' read failing touches nothing here (#686's first defect)");
});

test("the period line reads the view model Reports itself draws: a round trip through toReportVM", () => {
  // The mockup's sample is a real ReportsSurface: reportDto → toReportVM, nothing typed by hand.
  const surface = reportsSample(7, "2026-09-18");
  const { vm } = surface;
  const line = todayPeriodLine(surface);
  assert.equal(line.to, "reports");
  assert.ok(line.text.startsWith(`${vm.period.now}: ${vm.answered.totals.in} customer messages`), line.text);
  assert.ok(line.text.includes(`% answered by the receptionist`) && line.text.includes(`${Math.round(vm.answered.share * 100)}%`), "Reports' own share, rounded as its tile is");
  assert.ok(line.text.includes(`median reply ${vm.replyTime.medianLabel}`), line.text);
  assert.ok(line.text.endsWith(`${vm.calls.total} call${vm.calls.total === 1 ? "" : "s"}.`), line.text);
  assert.ok(!line.text.includes("—"), "no em dash in a new sentence");
});

/* ------------------------------ the runs' words ------------------------------ */

test("the sentences the queue and the card say about a playbook's run come from here, without an em dash", () => {
  const run = { id: "b1", state: "pending_approval", playbook_id: "pb-1", name: "Win-back", audience: { label: "Win-back" }, recipient_count: 3, scheduled_for: "2026-09-15T13:00:00Z", started_at: null, when: "today 9:00 AM", counts: { sent: 0, replied: 0 } };
  const w = todayRunWords(run);
  assert.equal(w.people, "3 people");
  assert.deepEqual(w.waiting, { sentence: "3 people. Nothing sends until you say so.", status: ["Waiting for your approval"] });
  assert.deepEqual(w.soon, { meta: "Playbook · sends today 9:00 AM", sentence: "3 people. Stop it if you'd rather not.", status: ["Scheduled", "sends today 9:00 AM"] });
  for (const s of [w.waiting.sentence, w.soon.sentence, w.soon.meta, ...w.waiting.status, ...w.soon.status]) assert.ok(!s.includes("—"), `an em dash in a new sentence: ${s}`);
  assert.deepEqual(todayRunWords({ ...run, state: "sent", counts: { sent: 6, replied: 1 } }).done, { counts: "6 sent, 1 replied", still: false });
  assert.deepEqual(todayRunWords({ ...run, state: "sending", recipient_count: 1, counts: { sent: 1, replied: 0 } }).done, { counts: "1 sent", still: true });
  assert.equal(todayRunWords({ ...run, recipient_count: 1 }).people, "1 person");
  assert.equal(todayRunsSub(2), "2 runs waiting");
  assert.equal(todayRunsSub(1), "1 run waiting");
  assert.equal(todayRunsSub(0), null);
  assert.deepEqual(todayRunApproved("Win-back", 3, "sending now"), { lead: "Win-back", rest: "approved: 3 people, sending now" }, "the name apart, for the page to set in bold");
});

test("the runs' words read a real broadcast view model: a round trip through toBroadcastVM", () => {
  const dto = { id: "b1", name: "Win-back · 2026-09-18", template_id: "t-1", template_name: "quick_note", template_language: "en", params: [], audience: { kind: "playbook", id: "pb-1", label: "Win-back" }, state: "scheduled", scheduled_for: "2026-09-18T17:00:00Z", started_at: null, finished_at: null, recipient_count: 3, failure: null, created_at: "2026-09-18T15:00:00Z", playbook_id: "pb-1", run_for: "2026-09-18", counts: { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 } };
  const vm = toBroadcastVM(dto, "America/New_York", new Date("2026-09-18T15:30:00Z"));
  assert.match(vm.when, /^today .*1:00 PM$/, "the business's clock, as toBroadcastVM says it");
  const w = todayRunWords(vm);
  assert.equal(w.soon.meta, `Playbook · sends ${vm.when}`);
  assert.deepEqual(w.soon.status, ["Scheduled", `sends ${vm.when}`]);
  assert.equal(w.people, "3 people");
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-leaks.test.mjs
```
Expected: FAIL (`todayPeriodLine` not exported; `.rows` of an array is undefined).

- [ ] **Step 3: `today.ts`: `ReportsLike` and the period line.** In `ReportsLike`, inside `vm`, the `answered?:` line becomes

```ts
    answered?: { totals: { in: number; ai: number; you: number; none: number }; share?: number | null };
```

  and after the `reasons?:` field add:

```ts
    /** The reply time as Reports computes it; the period line says the median once. */
    replyTime?: { count: number; medianLabel: string };
    /** Reports' own words for the period ("Last 7 days"), so the foot line never spells them a second time. */
    period?: { now: string };
    /** Reports' own count of the period's calls: a number, never a tile's formatted value. */
    calls?: { total: number };
```

  In `WeekTileLike`, after `spark: number[];` add:

```ts
  /** The period before, in counts ("up from 99"), as Reports says it; null with nothing to compare. */
  compare?: string | null;
```

  Then, directly before `/** A People list as the People surface publishes it. */`, add:

```ts
/**
 * The last seven (or thirty, or ninety) days in one sentence at the foot of the day's card, with a door to Reports,
 * which was rebuilt on 19 September to carry exactly this material. Every number is one Reports prints, read from the
 * view model Reports itself draws and never derived a second time here: its period words (`period.now`), the messages
 * tile's comparison in counts, its `answered.share` rounded as its tile rounds it, its `replyTime.medianLabel`, its
 * `calls.total`. It never reads `campaigns`: that read fails on its own (#686), and a period line that dereferenced it
 * took the whole page down.
 */
export function todayPeriodLine(r: ReportsLike | null): { text: string; to: "reports" } | null {
  if (!r || !r.vm) return null;
  const v = r.vm;
  const lead = v.period?.now ?? `Last ${v.rangeLabel}`;
  if (v.empty) return { text: `${lead}: nobody wrote or called.`, to: "reports" };
  const a = v.answered;
  if (!a) return null;
  const messages = v.tiles.find((t) => t.id === "messages");
  const parts = [`${a.totals.in} customer message${a.totals.in === 1 ? "" : "s"}${messages?.compare ? ` (${messages.compare})` : ""}`];
  if (a.share !== undefined && a.share !== null) parts.push(`${Math.round(a.share * 100)}% answered by the receptionist`);
  if (v.replyTime && v.replyTime.count > 0) parts.push(`median reply ${v.replyTime.medianLabel}`);
  const callCount = v.calls ? v.calls.total : 0;
  if (callCount) parts.push(`${callCount} call${callCount === 1 ? "" : "s"}`);
  return { text: `${lead}: ${parts.join(", ")}.`, to: "reports" };
}

/* ------------------------------ the runs' words ------------------------------ */

/** A broadcast or a playbook's run as the broadcasts surface publishes it (toBroadcastVM), as far as the words read it. */
export interface RunLike {
  state: string;
  recipient_count: number;
  /** "today 9:00 AM" / "Sep 12 · 10:00 AM", by the business's clock (toBroadcastVM). */
  when: string;
  counts: { sent: number; replied: number };
}

export interface TodayRunWordsVM {
  /** "3 people" */
  people: string;
  /** A run waiting for a word. */
  waiting: { sentence: string; status: string[] };
  /** A run under the veto window: scheduled, not yet sending. */
  soon: { meta: string; sentence: string; status: string[] };
  /** A run that went out today: what it earned so far, and whether it is still sending. */
  done: { counts: string; still: boolean };
}

/**
 * Every sentence with a number the queue and the day's card say about a playbook's run. The page kept seven of
 * them (dashboard-a-command.jsx, dashboard-a-brief.jsx); the rule that a number's sentence lives in contracts was
 * stated in this file's own header and enforced next door on Reports. The page keeps deciding WHICH rows wait, are
 * scheduled or went out today; it composes none of their words. The words are sentences now ("3 people. Nothing
 * sends until you say so."), where the page had a middle dot and no capital.
 */
export function todayRunWords(r: RunLike): TodayRunWordsVM {
  const people = `${r.recipient_count} ${r.recipient_count === 1 ? "person" : "people"}`;
  const sent = `${r.counts.sent} sent`;
  return {
    people,
    waiting: { sentence: `${people}. Nothing sends until you say so.`, status: ["Waiting for your approval"] },
    soon: { meta: `Playbook · sends ${r.when}`, sentence: `${people}. Stop it if you'd rather not.`, status: ["Scheduled", `sends ${r.when}`] },
    done: { counts: r.counts.replied ? `${sent}, ${r.counts.replied} replied` : sent, still: r.state === "sending" },
  };
}

/** "2 runs waiting" beside the queue's own parts; null when none waits. */
export function todayRunsSub(n: number): string | null {
  return n ? `${n} run${n === 1 ? "" : "s"} waiting` : null;
}

/**
 * The toast when a waiting run is approved: the audience's name, which the page sets in bold, then who it reaches
 * and when it really goes (bcWhenWords). Two parts, so the page keeps its typography without composing the number.
 */
export function todayRunApproved(label: string, n: number, when: string): { lead: string; rest: string } {
  return { lead: label, rest: `approved: ${n} ${n === 1 ? "person" : "people"}, ${when}` };
}
```

- [ ] **Step 4: `today.ts`: Worth a look v2.** Replace `TodayLeakVM` with:

```ts
export interface TodayLeakVM {
  id: TodayLeakId;
  tone: "danger" | "warn" | "info";
  /** The tone as a word, so severity never rides on colour alone: "Booking gap", "No reply", "Reach", "Gone quiet". */
  tag: string;
  /** The tone's icon (the legacy Icon set). */
  icon: "calendar" | "alert" | "users" | "clock";
  /** The problem, in one sentence, with the number in it. */
  text: string;
  /** The arithmetic behind the sentence, so nobody has to take it on faith. */
  math: string;
  /**
   * Who is waiting NOW with nothing back, up to two, on the unanswered row: the threads Today holds. They are not the
   * count's own subjects (the count is Reports' over its period), so the page draws them under "Waiting now" and
   * never as the people the sentence counts.
   */
  people: Array<{ id: string; name: string; to: string }>;
  /** What "Ask why" asks: the row's own sentence and its arithmetic. Ask grounds every citation in what it read. */
  ask: string;
  /** The door. */
  cta: { label: string; to: string };
  /** The act, when the list this is about has one it can actually run. */
  also: { label: string; to: string } | null;
}

/** The rows that made the cut, how many qualified past the cap, and the line that says so ("and 2 more"). */
export interface TodayLeaksVM {
  rows: TodayLeakVM[];
  more: number;
  moreLine: string | null;
}
```

  Replace the `todayLeaks` function (from its doc comment `/**\n * In this order, and the order is the point` through the closing `}`) with:

```ts
/**
 * In this order, and the order is the point: the first two both cost a
 * customer, and the one that costs more of them comes first. A person who
 * asked and never got onto the calendar is the business's whole purpose
 * missed; a message nobody answered is one conversation. Then the two that
 * cost a chance rather than a customer.
 */
const LEAK_ORDER: readonly TodayLeakId[] = ["never-booked", "unanswered", "unreachable", "quiet"];

const askWhy = (text: string, math: string): string => `${text} ${math}. Why is that?`;

export function todayLeaks(
  reports: ReportsLike | null,
  people: PeopleListsLike | null,
  /** Who is waiting with nothing back, from the day's view model (`noReply`); the unanswered row names two of them. */
  noReply: readonly TodayNoReplyVM[] = [],
  max = TODAY_LEAK_MAX,
): TodayLeaksVM {
  const found = new Map<TodayLeakId, TodayLeakVM>();
  const list = (id: string) => (people ? people.lists.find((l) => l.id === id) ?? null : null);
  const step = (id: string) => {
    const l = list(id);
    return l && l.action && l.action.enabled && l.count > 0 ? { label: l.action.cta, to: l.action.to } : null;
  };

  const b = reports ? reports.booking : null;
  // Five is the floor: two people who did not book is a quiet week, not a leak.
  if (reports && b && b.present && b.pct !== null && (b.asked ?? 0) >= 5 && b.pct <= 25) {
    const asked = b.asked ?? 0;
    const booked = b.booked ?? 0;
    const never = list("asked_never_booked");
    const text = booked === 0
      ? `${asked} people wrote or called in the last ${reports.vm.rangeLabel}. Not one of them is on the calendar.`
      : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.vm.rangeLabel} got onto the calendar.`;
    const math = never ? `${b.headline} · ${never.count} on Asked, never booked` : b.headline;
    found.set("never-booked", {
      id: "never-booked",
      tone: "danger",
      tag: "Booking gap",
      icon: "calendar",
      text,
      math,
      people: [],
      ask: askWhy(text, math),
      cta: { label: "See who", to: never ? `clients/seg:${never.id}` : "clients" },
      also: step("asked_never_booked"),
    });
  }

  const a = reports && reports.vm.answered ? reports.vm.answered.totals : null;
  // Two, not one: a single message nobody answered can be a wrong number or a
  // STOP, and this rule has no act to offer, only a door to Reports where the
  // tile already prints the figure. Two is a pattern. The count is Reports'
  // over its period; the names are the threads waiting right now.
  if (reports && a && a.none >= 2) {
    const text = `${a.none} customer message${a.none === 1 ? "" : "s"} never got an answer at all.`;
    const math = `of ${a.in} in the last ${reports.vm.rangeLabel} · the receptionist answered ${a.ai}, you answered ${a.you}`;
    found.set("unanswered", {
      id: "unanswered",
      tone: "danger",
      tag: "No reply",
      icon: "alert",
      text,
      math,
      people: noReply.slice(0, 2).map((r) => ({ id: r.conversationId, name: r.who, to: r.to })),
      ask: askWhy(text, math),
      cta: { label: "Open Reports", to: "reports" },
      also: null,
    });
  }

  // A yes to hearing from the business is not a yes to an offer, and a list
  // nobody can be mailed reads as a broken composer one screen later.
  const yes = list("opted_in");
  const offers = list("offers_ok");
  // Three, for the same reason: one person who said yes is not yet a list.
  if (yes && offers && yes.count >= 3 && offers.count === 0) {
    const text = `${yes.count} ${yes.count === 1 ? "person has" : "people have"} said yes to messages, but nobody has said yes to offers.`;
    const math = "a broadcast reaches only the second yes · 0 can receive one";
    found.set("unreachable", {
      id: "unreachable",
      tone: "warn",
      tag: "Reach",
      icon: "users",
      text,
      math,
      people: [],
      ask: askWhy(text, math),
      cta: { label: "Open People", to: `clients/seg:${yes.id}` },
      also: yes.action && yes.action.enabled ? { label: yes.action.cta, to: yes.action.to } : null,
    });
  }

  const quiet = list("quiet");
  if (quiet && quiet.count >= 5) {
    const text = `${quiet.count} people have not heard from you in 30 days.`;
    const math = people && people.aggregates ? `of ${people.aggregates.total} in People` : "on the Quiet 30+ days list";
    found.set("quiet", {
      id: "quiet",
      tone: "info",
      tag: "Gone quiet",
      icon: "clock",
      text,
      math,
      people: [],
      ask: askWhy(text, math),
      cta: { label: "See who", to: `clients/seg:${quiet.id}` },
      also: step("quiet"),
    });
  }

  const all = LEAK_ORDER.map((id) => found.get(id)).filter((x): x is TodayLeakVM => !!x);
  const more = Math.max(0, all.length - max);
  // A third problem is counted, never dropped in silence; the page draws this line, it does not compose it.
  return { rows: all.slice(0, max), more, moreLine: more ? `and ${more} more` : null };
}
```

- [ ] **Step 5: `today.ts`: the four-kind dedupe.** Change the import from `./notifications` to `import { conversationOfNeedsKey, callOfKey, unreadCount } from "./notifications";`. In `AwayRowLike`, after `about?: ...;` add:

```ts
  /** Where the row's button goes (the bell's rows carry it as actions[0].to): a held draft is keyed by its message and names its thread only here. */
  to?: string;
  actions?: Array<{ to: string }>;
```

  Before `todayAwayGrouped` add:

```ts
/** What a queue row is about, for the away card's dedupe: its thread, its call, or both. A bare string is a thread. */
export type AwayQueueRef = string | { conversationId?: string | null; callId?: string | null };
```

  Two doc comments outside the head say the old one-kind rule; they change too. In `TodayAwayVM`, `/** Of \`more\`, the ones dropped because their conversation is in the queue above. */` becomes `/** Of \`more\`, the ones dropped because the queue above already holds what they are about: their thread or their call. */`. In the function's doc comment above `export function todayAwayGrouped`, the sentence `a conversation already sitting\n * in the queue at the top of this page is NOT repeated here;` becomes `a row about anything already sitting\n * in the queue at the top of this page (its thread or its call) is NOT repeated here;`.

  Replace the head of `todayAwayGrouped` (from `export function todayAwayGrouped<T extends AwayRowLike>(` through the line `const fresh = rows.filter((r) => r.unread && !aboutQueued(r));`) with:

```ts
export function todayAwayGrouped<T extends AwayRowLike>(
  rows: readonly T[],
  inQueue: readonly AwayQueueRef[] = [],
  max = 5,
): TodayAwayVM<T> {
  const convs = new Set(inQueue.flatMap((q) => { const id = typeof q === "string" ? q : q.conversationId; return id ? [id] : []; }));
  const callsQueued = new Set(inQueue.flatMap((q) => (typeof q === "string" || !q.callId ? [] : [q.callId])));
  const idOf = (r: T) => r.id ?? r.key ?? "";
  // A row about a conversation says so in three different ways, and only one of
  // them is `about`. A KEPT row (the edge wrote it) carries the subject; a
  // DERIVED "needs you" row is computed from the Inbox this browser holds and
  // carries nothing but its key; a DERIVED held draft is keyed by its message
  // and names its thread only through its door. A call is a kept row's subject
  // or a derived missed call's key. Reading `about` alone printed the three
  // conversations at the top of the page again, here; reading the thread key
  // alone covered two of the queue's four kinds, so a closing window's thread
  // printed again and a call's row never could be covered.
  const door = (r: T) => r.to ?? (r.actions && r.actions[0] ? r.actions[0].to : undefined);
  const aboutQueued = (r: T) => {
    if (r.about && r.about.type === "conversation" && convs.has(r.about.id)) return true;
    if (r.about && r.about.type === "call" && callsQueued.has(r.about.id)) return true;
    const cv = conversationOfNeedsKey(idOf(r));
    if (cv !== null && convs.has(cv)) return true;
    const call = callOfKey(idOf(r));
    if (call !== null && callsQueued.has(call)) return true;
    const to = door(r);
    return !!to && to.startsWith("inbox/th-") && convs.has(to.slice("inbox/th-".length));
  };
  const fresh = rows.filter((r) => r.unread && !aboutQueued(r));
```

- [ ] **Step 6: Build and run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-leaks.test.mjs tooling/scripts/tests/today-away-page.test.mjs tooling/scripts/tests/today-week.test.mjs tooling/scripts/tests/today-vm.test.mjs
```
Expected: PASS. (`today-away-page` and `today-week` still call the old shapes: `todayAwayGrouped(rows, ["cv-1"])` with strings works; `todayLeaks` is not drawn by those two files' pages.) `dashboard-a-week.jsx` still reads `window.__today.leaks(R, P)` as an array: it renders nothing wrong until PR B because `rows.length` is undefined on the object, so `TodayLeaks` returns null. That is PR A's known, temporary state on the live page: Worth a look is blank between PR A and PR B. **Decision:** ship PR A and PR B the same day (Task B10 merges within hours); if PR B slips a day, add `if (!rows.length) return null;` → `const { rows } = window.__today.leaks(R, P); if (!rows.length) return null;` to `dashboard-a-week.jsx` in PR A (a one-line change with its `?v=` bump).

- [ ] **Step 6b: The page reads the rows, so Worth a look never blanks between the PRs.** In `apps/dashboard/src/legacy/pages/dashboard-a-week.jsx` line 33, `const rows = window.__today.leaks(R, P);` becomes `const { rows } = window.__today.leaks(R, P);` (the pin `"window.__today.leaks(R, P)"` in `today-week.test.mjs` still matches). In `apps/dashboard/src/legacy/Chanlytics.html`, `pages/dashboard-a-week.jsx?v=4` becomes `?v=5`. This is not optional: `e2e/owner-signals.spec.ts` expects the unreachable row on the nightly's workspace, and the nightly runs on its own clock between the two merges. Run `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-week.test.mjs tooling/scripts/tests/today-away-page.test.mjs tooling/scripts/tests/legacy-harness.test.mjs` → PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
corepack pnpm -r typecheck
git add packages/contracts/src/today.ts tooling/scripts/tests/today-leaks.test.mjs apps/dashboard/src/legacy/pages/dashboard-a-week.jsx apps/dashboard/src/legacy/Chanlytics.html
git commit -m "Today: the period in one line, the runs' words, Worth a look with a word for its tone, who is waiting and an Ask door, the away card deduped over all four queue kinds

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task A4: The bridge publishes the new helpers

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/today.ts`, `tooling/scripts/tests/today-day.test.mjs:71`, `tooling/scripts/tests/today-week.test.mjs:145`

- [ ] **Step 1: Replace `apps/dashboard/src/legacy-bridge/today.ts` with**

```ts
/**
 * Today's helpers for the legacy page, computed in contracts from the
 * surfaces the page already holds — the calendar, the playbooks, the people,
 * Reports, the bell, the broadcasts. Published on window the way the
 * calendar's verbs are, so the page composes and never derives. The mockup's
 * sample (today-sample.ts) publishes the same object, so the two cannot drift.
 *
 * `facts`, `dayLine`, `week`, `journey` and `away` are the period card's and
 * the journey's; they leave with those cards in the page PR.
 */
import { todayDay, todayDayFacts, todayDayLine, todayWeek, todayJourney, todayAway, todayAwayGrouped, todayLeaks, todayPeriodLine, todayRunWords, todayRunsSub, todayRunApproved } from "@chanlytics/contracts";

export const TODAY_HELPERS = { day: todayDay, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved, leaks: todayLeaks, awayGrouped: todayAwayGrouped, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway };
export type TodayHelpers = typeof TODAY_HELPERS;

declare global {
  interface Window {
    __today?: TodayHelpers;
  }
}

export function installToday(): void {
  window.__today = TODAY_HELPERS;
}
```

- [ ] **Step 2: Move the two pins on the install string.** In `tooling/scripts/tests/today-day.test.mjs` line 71 and `tooling/scripts/tests/today-week.test.mjs` line 145, the one `readCode(...).includes(...)` assertion becomes two `includes` on the same read (the count of `readCode(` calls is unchanged):

```js
  const bridge = readCode("apps/dashboard/src/legacy-bridge/today.ts");
  assert.ok(bridge.includes("export const TODAY_HELPERS = { day: todayDay, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved, leaks: todayLeaks, awayGrouped: todayAwayGrouped, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway };") && bridge.includes("window.__today = TODAY_HELPERS;"));
```

- [ ] **Step 3: Run and commit**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-day.test.mjs tooling/scripts/tests/today-week.test.mjs tooling/scripts/tests/today-away-page.test.mjs
corepack pnpm -r typecheck
git add apps/dashboard/src/legacy-bridge/today.ts tooling/scripts/tests/today-day.test.mjs tooling/scripts/tests/today-week.test.mjs
git commit -m "The bridge publishes Today's period line, run words and the two-shape helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task A5: The mockup's Today: `today-sample.ts`, built like `reports-sample`

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/today-sample.ts`
- Modify: `tooling/scripts/serve-legacy.mjs`, `apps/dashboard/src/legacy/Chanlytics.html`, `tooling/scripts/tests/legacy-harness.test.mjs:153-157`
- Test: `tooling/scripts/tests/today-sample.test.mjs` (create; it calls neither `readCode(` nor `readRaw(`)

The standalone mockup (`Chanlytics.html`, served by `serve-legacy.mjs`) has no bridge, so `window.TODAY_DATA` was never set there and Today drew its seeded hero. The sample is a small workspace's day passed through the same view models a real one goes through, published on `window` only where the app's globals are absent, so the mockup draws the one Today page there is. Its metrics are COUNTED from the threads and calls it holds, so the receipts under the figures add up whatever hour the mockup is opened.

- [ ] **Step 1: Write the failing test** at `tooling/scripts/tests/today-sample.test.mjs`:

```js
/**
 * The mockup's Today, EXECUTED: a sample workspace through the view models a real one goes through. The same moment
 * gives the same day; every figure agrees with the threads and calls under it; the bundle serve-legacy.mjs builds
 * publishes the same sample and installs it where the app's globals are absent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { todayLeaks, todayAwayGrouped, unreadCount } from "@chanlytics/contracts";
import { todaySample, installTodaySample } from "../../../apps/dashboard/src/legacy-bridge/today-sample.ts";

// 4 PM in New York on Friday 18 September 2026: every "minutes ago" in the sample lands on this day.
const NOW = Date.parse("2026-09-18T20:00:00Z");

test("the same moment is the same day, kept rather than rebuilt on every draw", () => {
  const a = todaySample(NOW);
  assert.equal(a, todaySample(NOW));
  assert.notEqual(a, todaySample(NOW + 60_000), "another moment is another day");
  assert.equal(a.TODAY_DATA.standing.eyebrow.split(" · ").at(-1), "Melany's Beauty Salon");
});

test("every figure agrees with the threads and calls under it", () => {
  const s = todaySample(NOW);
  const t = s.TODAY_DATA;
  const since = Date.parse(s.metrics.window.since);
  const inboundToday = s.conversations.flatMap((c) => c.messages).filter((m) => m.direction === "inbound" && m.sender === "customer" && Date.parse(m.created_at) >= since);
  const by = Object.fromEntries(t.figures.map((f) => [f.id, f]));
  assert.equal(by.messages.value, inboundToday.length, "the messages figure is the messages the read holds");
  assert.equal(by.messages.value, s.metrics.period.messages_in);
  const split = by.messages.receipt.text.match(/\d+/g).map(Number).reduce((a, n) => a + n, 0);
  assert.equal(split, inboundToday.length, `the receipt's wires add up to the figure: ${by.messages.receipt.text}`);
  assert.equal(by.answered.value, s.metrics.period.answered_by_ai);
  assert.equal(by.calls.value, s.calls.length, "one figure per call");
  assert.equal(by.calls.value, s.metrics.period.calls);
  assert.match(by.calls.receipt.text, /reached voicemail\.$/, "the caller who reached voicemail is named");
  assert.equal(by.new.value, 2);
  assert.match(by.new.receipt.text, /^Renata Solís and Marco Ibáñez wrote for the first time today\.$/);
  assert.equal(t.proof.startsWith("The last message arrived "), true);
  for (const f of t.figures) if (f.receipt) assert.doesNotMatch(f.receipt.text, new RegExp(`\\b${f.value}\\b`), `${f.id}: the receipt repeats the figure`);
});

test("the queue holds one of each kind, and Worth a look names who is waiting", () => {
  const s = todaySample(NOW);
  const t = s.TODAY_DATA;
  assert.deepEqual(t.queue.rows.map((r) => r.kind), ["handoff", "callback", "window", "call"]);
  assert.deepEqual(t.noReply.map((r) => r.who), ["Dulce Amaro"], "Sofía's thread is the closing window's; Ana's is the handoff's; Dulce is the one nobody answered");
  const leaks = todayLeaks(s.__REPORTS, s.__PEOPLE, t.noReply);
  assert.ok(leaks.rows.some((l) => l.id === "unreachable"), `seven said yes to messages and nobody to offers: ${leaks.rows.map((l) => l.id)}`);
  const away = todayAwayGrouped(s.bell, t.queue.rows.map((r) => ({ conversationId: r.conversationId, callId: r.callId })), 5);
  assert.equal(away.total, unreadCount(s.bell));
  assert.equal(away.queued, 3, "the handoff's row, the call-back's row and the missed call are the queue's");
  assert.deepEqual(away.groups.map((g) => g.row.kind), ["number", "review", "broadcast_sent"], "a warning first, then the news");
  assert.ok(s.__CALENDAR.vm.feed.state === "ok" && s.__CALENDAR.vm.days.find((d) => d.today).blocks.length === 6, "six on the calendar today: the day module's cap has something to cut");
  assert.equal(s.__BROADCASTS.rows.map((r) => r.state).sort().join(","), "pending_approval,scheduled,sent");
});

test("it installs only where the app's globals are absent", () => {
  const win = { TODAY_DATA: "the app's" };
  installTodaySample(win, NOW);
  assert.equal(win.TODAY_DATA, "the app's", "never over the bridge's own");
  assert.equal(typeof win.__today.periodLine, "function");
  assert.equal(win.__notifs.feed().length, todaySample(NOW).bell.length);
  win.__notifs.read(win.__notifs.feed()[0].id);
  assert.equal(win.__notifs.unread(), todaySample(NOW).bell.length - 1, "a read mark holds in memory");
  assert.equal(win.__clock.dayKey(NOW), "2026-09-18");
});

test("the mockup's bundle publishes the same sample and never bundles the bridge's api", async () => {
  const { todaySampleBundle } = await import("../serve-legacy.mjs");
  const js = await todaySampleBundle();
  assert.ok(!js.includes("legacy-bridge/api.ts"), "zone.ts and notifications.ts import ./api; the sample must import neither");
  const win = {};
  vm.runInNewContext(js, { window: win, console, Date, Intl });
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(win.__todaySample(NOW).TODAY_DATA), plain(todaySample(NOW).TODAY_DATA));
  assert.ok(win.TODAY_DATA && win.__today && win.__notifs && win.__clock, "installed at load, for the page scripts that follow");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-sample.test.mjs
```
Expected: FAIL, "Cannot find module .../today-sample.ts".

- [ ] **Step 3: Write `apps/dashboard/src/legacy-bridge/today-sample.ts`**

```ts
/**
 * The mockup's Today: a sample workspace's day through the same view models a real one goes through, so the
 * standalone mockup (Chanlytics.html, served by tooling/scripts/serve-legacy.mjs, which builds this as
 * data/today-sample.js) draws the one Today page there is. The app never loads it: a workspace draws its own day.
 *
 * Every figure agrees with its parts: the metrics are COUNTED from the threads and calls below, so the receipts add
 * up whatever hour the mockup is opened. Every moment is said relative to `nowMs`, so the day is always today.
 *
 * It imports contracts, reports-sample and the bridge's today.ts, and nothing that imports ./api: this is a browser
 * bundle with no session behind it.
 */
import {
  toTodayVM,
  toCalendarVM,
  toPersonRowVM,
  peopleAggregates,
  peopleListAction,
  PEOPLE_LISTS,
  toBroadcastVM,
  toLiveVM,
  zoneDayKey,
  clockTime,
  agoLabel,
  SERVER_KEY_PREFIX,
  NEEDS_KEY_PREFIX,
  CALL_KEY_PREFIX,
  type MetricsSummaryDto,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
  type CalendarWeekDto,
  type CalendarVM,
  type PersonRowDto,
  type PersonRowVM,
  type PeopleAggregates,
  type BroadcastDto,
  type BroadcastVM,
  type LiveVM,
  type BellRow,
  type TodayVM,
  type PlaybookCardLike,
} from "@chanlytics/contracts";
import { reportsSample } from "./reports-sample";
import { TODAY_HELPERS } from "./today";
import type { ReportsSurface } from "./surface-data";

const ZONE = "America/New_York";
const MIN = 60_000;

export interface TodaySample {
  TODAY_DATA: TodayVM;
  __CALENDAR: { vm: CalendarVM; fetchedAt: number };
  __PLAYBOOKS: { rows: PlaybookCardLike[] };
  __PEOPLE: {
    rows: PersonRowVM[];
    lists: Array<{ id: string; label: string; group: string; count: number; ids: string[]; action: { text: string; cta: string; to: string; enabled: boolean } | null }>;
    aggregates: PeopleAggregates;
    calendar: { state: "ok"; source: string };
  };
  __BROADCASTS: { rows: BroadcastVM[] };
  __REPORTS: ReportsSurface;
  __LIVE: LiveVM;
  /** The bell as the topbar would hold it: three kept rows and three derived ones the queue already shows. */
  bell: BellRow[];
  metrics: MetricsSummaryDto;
  conversations: ConversationDto[];
  escalations: Array<EscalationDto & { conversation_id: string }>;
  calls: CallDto[];
}

/** "YYYY-MM-DDTHH:MM:SS" on the business's clock: the naive wall time metrics_summary reports as now_local. */
function naiveLocal(ms: number, zone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Midnight of the business's day, as an instant. */
function midnightMs(ms: number, zone: string): number {
  const local = naiveLocal(ms, zone);
  const offset = Date.parse(`${local}Z`) - ms;
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) - offset;
}

const phone = (last4: string) => `+1305555${last4}`;

function build(nowMs: number): TodaySample {
  const now = new Date(nowMs);
  const today = zoneDayKey(nowMs, ZONE);
  const midnight = midnightMs(nowMs, ZONE);
  /** An instant `min` minutes before now. */
  const ago = (min: number) => new Date(nowMs - min * MIN).toISOString();
  /** An instant at h:mm today on the business's clock. */
  const at = (h: number, m = 0, dayOffset = 0) => new Date(midnight + dayOffset * 24 * 60 * MIN + (h * 60 + m) * MIN).toISOString();

  const contact = (id: string, name: string | null, last4: string, over: Partial<ConversationDto["contact"]> = {}) => ({ id, display_name: name, wa_profile_name: null, phone_e164: phone(last4), consent: "opted_in", dnc: false, marketing_consent: null, ...over });
  const msg = (id: string, dir: "in" | "ai" | "failed", body: string, created_at: string, channel = "whatsapp") => ({
    id, direction: dir === "in" ? "inbound" as const : "outbound" as const, sender: dir === "in" ? "customer" as const : "ai" as const, type: "text", body, media: null, meta: null,
    status: dir === "in" ? "received" : dir === "failed" ? "failed" : "delivered", channel, created_at,
  });
  const thread = (id: string, c: ConversationDto["contact"], messages: ConversationDto["messages"], over: Partial<ConversationDto> = {}): ConversationDto => ({
    id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false, last_wa_inbound_at: null, last_message_at: messages.at(-1)?.created_at ?? null, contact: c, messages, ...over,
  });

  // Eight threads: two people new today, one email, one text, one nobody answered, one handed over, one call-back,
  // one reply window closing, one reply that failed to deliver.
  const conversations: ConversationDto[] = [
    thread("cv-renata", contact("k-renata", "Renata Solís", "0101"), [msg("m-r1", "in", "Hi! Do you have anything for a gel manicure this Saturday?", ago(410)), msg("m-r2", "ai", "Hi Renata! Saturday I have 10:00 and 2:00 open for a gel manicure. Which suits you?", ago(409))]),
    thread("cv-marco", contact("k-marco", "Marco Ibáñez", "0102", { phone_e164: null, email: "marco@example.com" }), [msg("m-m1", "in", "Do you do men's cuts? Looking for something this week.", ago(300), "email"), msg("m-m2", "ai", "We do. This week I have Thursday 5:30 PM and Friday 11:00 AM. Shall I hold one?", ago(298), "email")]),
    thread("cv-dulce", contact("k-dulce", "Dulce Amaro", "0103"), [msg("m-d0", "in", "Booking for the 12th please", at(9, 0, -9), "sms"), msg("m-d1", "ai", "Done: the 12th at 3:00 PM.", at(9, 1, -9), "sms"), msg("m-d2", "in", "Can I bring my sister too?", ago(150), "sms")]),
    thread("cv-ana", contact("k-ana", "Ana Reyes", "0104"), [msg("m-a0", "in", "Hi, can I book a balayage?", at(10, 0, -8)), msg("m-a1", "ai", "Of course. Friday 10:30 AM is open.", at(10, 1, -8)), msg("m-a2", "in", "I'd rather talk to a person about a refund for last time.", ago(95))], { state: "needs_human", last_wa_inbound_at: ago(95) }),
    thread("cv-kenia", contact("k-kenia", "Kenia Duarte", "0105"), [], { state: "needs_human" }),
    thread("cv-priya", contact("k-priya", "Priya Nair", "0106"), [msg("m-p1", "in", "Do you do balayage on Sundays?", ago(130)), msg("m-p2", "failed", "We're closed Sundays, but Saturday 1:00 PM is open if that works.", ago(129))], { last_wa_inbound_at: ago(130) }),
    thread("cv-bea", contact("k-bea", "Bea Lind", "0107"), [msg("m-b1", "in", "Thanks, see you tomorrow!", ago(20)), msg("m-b2", "ai", "See you tomorrow at 9:00, Bea.", ago(19))], { last_wa_inbound_at: ago(20) }),
    thread("cv-sofia", contact("k-sofia", "Sofía Mendes", "0108"), [msg("m-s1", "in", "Can you hold the 3 PM for me? I'll confirm tonight.", ago(21 * 60))], { last_wa_inbound_at: ago(21 * 60) }),
  ];
  const escalations: Array<EscalationDto & { conversation_id: string }> = [
    { id: "e-ana", conversation_id: "cv-ana", reason: "human_token", details: null, state: "open", created_at: ago(94) },
    { id: "e-kenia", conversation_id: "cv-kenia", reason: "callback", details: "Call back to confirm Saturday 10:00.", state: "open", created_at: ago(40) },
  ];
  const call = (id: string, startedMin: number, durationS: number, over: Partial<CallDto> = {}): CallDto => ({
    id, retell_call_id: `r-${id}`, direction: "inbound", call_type: "phone_call", status: "ended", from_e164: phone("0199"), from_raw: null, to_e164: "+13055550100",
    started_at: ago(startedMin), ended_at: new Date(nowMs - startedMin * MIN + durationS * 1000).toISOString(), updated_at: new Date(nowMs - startedMin * MIN + durationS * 1000).toISOString(),
    duration_ms: durationS * 1000, disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false,
    summary: "The caller asked about opening hours and booked nothing.", wanted: "Asked about opening hours.", outcome: "handled", follow_up: null, caller_name: null,
    transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null, ...over,
  });
  const calls: CallDto[] = [
    call("k-tomas", 60, 250, { from_e164: phone("0110"), contact: { display_name: "Tomás Vega", wa_profile_name: null, phone_e164: phone("0110") }, contact_id: "k-tomas" }),
    call("k-kenia", 45, 125, { from_e164: phone("0105"), sentiment: "Neutral", conversation_id: "cv-kenia", contact_id: "k-kenia", contact: { display_name: "Kenia Duarte", wa_profile_name: null, phone_e164: phone("0105") }, summary: "The caller asked for a gel manicure on Saturday and wants a call back to confirm.", wanted: "Asked for a gel manicure Saturday.", outcome: "callback_needed", follow_up: "Call back to confirm Saturday 10:00.", caller_name: "Kenia" }),
    call("k-voicemail", 25, 30, { from_e164: "+13475550188", sentiment: null, in_voicemail: true, summary: null, wanted: null, outcome: "voicemail", disconnection_reason: "voicemail_reached" }),
  ];

  // The metrics as metrics_summary would count them, from the same rows.
  const since = new Date(midnight).toISOString();
  const inbound = conversations.flatMap((c) => c.messages.filter((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight));
  const outAi = conversations.flatMap((c) => c.messages.filter((m) => m.direction === "outbound" && Date.parse(m.created_at) >= midnight));
  const answered = conversations.filter((c) => c.messages.some((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight) && c.messages.some((m) => m.direction === "outbound" && m.status === "delivered" && Date.parse(m.created_at) >= midnight)).length;
  const lastIn = inbound.map((m) => m.created_at).sort().at(-1) ?? null;
  const lastOut = outAi.filter((m) => m.status === "delivered").map((m) => m.created_at).sort().at(-1) ?? null;
  const tallyOf = (xs: readonly string[]) => xs.reduce<Record<string, number>>((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {});
  const metrics: MetricsSummaryDto = {
    workspace: { name: "Melany's Beauty Salon", timezone: ZONE, status: "active" },
    channels: [
      { kind: "whatsapp", status: "active", number: "+1 (305) 555-0100" },
      { kind: "voice", status: "active", number: "+1 (305) 555-0100" },
      { kind: "email", status: "active", address: "hello@melanys.example" },
    ],
    window: { days: 1, since, since_local: `${today}T00:00:00`, now_local: naiveLocal(nowMs, ZONE) },
    now: {
      escalations_open: escalations.length, oldest_open_escalation_at: escalations[0].created_at, threads_needing_human: escalations.length, threads_snoozed: 0, threads_awaiting_reply: 1,
      last_inbound_at: lastIn, last_outbound_at: lastOut,
    },
    period: {
      messages_in: inbound.length, messages_out_ai: outAi.length, messages_out_you: 0,
      conversations_active: conversations.filter((c) => c.messages.some((m) => Date.parse(m.created_at) >= midnight)).length,
      answered_by_ai: answered, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 34, send_failures: outAi.filter((m) => m.status === "failed").length,
      escalations_new: escalations.length, escalation_reasons: tallyOf(escalations.map((e) => e.reason)),
      calls: calls.length, call_seconds: calls.reduce((s, c) => s + (c.duration_ms ?? 0) / 1000, 0), call_sentiments: tallyOf(calls.map((c) => c.sentiment).filter((x): x is string => !!x)),
      calls_voicemail: calls.filter((c) => c.in_voicemail).length, new_contacts: 2,
    },
  };

  // The calendar: six today (the day module's cap cuts one), three tomorrow, two open times today.
  const person = (id: string, name: string) => ({ id, name, via: "phone" as const });
  const item = (id: string, h: number, m: number, dur: number, title: string, who: { id: string; name: string; via: "phone" } | null = null, dayOffset = 0) => ({ id, start: at(h, m, dayOffset), end: at(h, m + dur, dayOffset), title, all_day: false, person: who });
  const dayKey = (offset: number) => zoneDayKey(midnight + offset * 24 * 60 * MIN + 12 * 60 * MIN, ZONE);
  const calendarDto: CalendarWeekDto = {
    timezone: ZONE, from: dayKey(0), to: dayKey(6),
    feed: { present: true, state: "ok", read_at: now.toISOString(), events: 9, recurring_expanded: 0, skipped_recurring: 0, source: "Google Calendar" },
    hours: null, closures: [], rules: null, services: [], booking_link: null,
    next_opening: { start: at(13, 0), end: at(13, 30) },
    days: [
      { key: dayKey(0), items: [item("a1", 9, 0, 60, "Gloss", person("k-bea", "Bea Lind")), item("a2", 10, 30, 90, "Balayage", person("k-ana", "Ana Reyes")), item("a3", 12, 0, 45, "Cut"), item("a4", 14, 0, 60, "Gel manicure", person("k-renata", "Renata Solís")), item("a5", 15, 30, 30, "Consultation"), item("a6", 17, 0, 90, "Color", person("k-dulce", "Dulce Amaro"))], windows: [{ start: at(13, 0), end: at(13, 30) }, { start: at(16, 0), end: at(17, 0) }] },
      { key: dayKey(1), items: [item("b1", 9, 30, 60, "Cut", person("k-marco", "Marco Ibáñez"), 1), item("b2", 11, 0, 60, "Gloss", null, 1), item("b3", 15, 0, 60, "Gel manicure", person("k-priya", "Priya Nair"), 1)], windows: [{ start: at(12, 0, 1), end: at(15, 0, 1) }, { start: at(16, 0, 1), end: at(18, 0, 1) }] },
      ...[2, 3, 4, 5, 6].map((d) => ({ key: dayKey(d), items: [], windows: [] })),
    ],
  };

  // People: the eight above, and six who have gone quiet. Seven said yes to messages and nobody to offers, which is
  // the Worth-a-look row the nightly pins on the salon's own workspace.
  const row = (id: string, name: string, last4: string, over: Partial<PersonRowDto> = {}): PersonRowDto => ({
    id, display_name: name, wa_profile_name: null, phone_e164: phone(last4), email: null, consent: "opted_in", consent_source: "keyword", consent_updated_at: at(9, 0, -30), dnc: false,
    channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: null, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: null,
    last_message_at: null, last_message_direction: null, last_message_sender: null, last_inbound_text: null, last_inbound_at: null, last_call_at: null,
    call_count: 0, call_seconds: 0, first_contact_at: at(9, 0, -30), earliest_row_at: at(9, 0, -30), has_backfill: false, has_chat: true, queued_reply_at: null, ...over,
  });
  const fromThread = (c: ConversationDto, over: Partial<PersonRowDto> = {}) => {
    const last = c.messages.at(-1);
    const lastIn = [...c.messages].reverse().find((m) => m.direction === "inbound");
    return row(c.contact.id, c.contact.display_name ?? "", (c.contact.phone_e164 ?? phone("0000")).slice(-4), {
      phone_e164: c.contact.phone_e164, email: c.contact.email ?? null, latest_conversation_id: c.id, latest_state: c.state,
      last_message_at: last?.created_at ?? null, last_message_direction: last?.direction ?? null, last_message_sender: last?.sender ?? null,
      last_inbound_text: lastIn?.body ?? null, last_inbound_at: lastIn?.created_at ?? null, latest_wa_inbound_at: c.last_wa_inbound_at ?? null,
      first_contact_at: c.messages[0]?.created_at ?? null, earliest_row_at: c.messages[0]?.created_at ?? null, has_chat: c.messages.length > 0, ...over,
    });
  };
  const peopleDtos: PersonRowDto[] = [
    ...conversations.filter((c) => c.id !== "cv-kenia").map((c) => fromThread(c, c.id === "cv-ana" ? { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: ago(94), escalation_count: 1 } : {})),
    row("k-kenia", "Kenia Duarte", "0105", { has_chat: false, channels: ["voice"], call_count: 1, call_seconds: 125, last_call_at: ago(45), first_contact_at: ago(45), earliest_row_at: ago(45), latest_conversation_id: "cv-kenia", latest_state: "needs_human", needs_human: true, open_escalation_reason: "callback", open_escalation_since: ago(40), escalation_count: 1 }),
    row("k-tomas", "Tomás Vega", "0110", { has_chat: false, channels: ["voice"], call_count: 1, call_seconds: 250, last_call_at: ago(60), first_contact_at: at(9, 0, -12), earliest_row_at: at(9, 0, -12), consent: null }),
    ...["Lucía Ferreira", "Noor Haddad", "Iris Kowalski", "Camila Duarte", "Zoe Martin", "Emily Chen"].map((name, i) => row(`k-quiet-${i}`, name, `02${String(i).padStart(2, "0")}`, { last_message_at: at(11, 0, -(40 + i * 3)), last_message_direction: "outbound", last_message_sender: "ai", last_inbound_at: at(10, 50, -(40 + i * 3)), last_inbound_text: "Thanks!", first_contact_at: at(10, 0, -(90 + i)), earliest_row_at: at(10, 0, -(90 + i)), consent: i < 5 ? "opted_in" : null })),
  ];
  const peopleRows = peopleDtos.map((d) => toPersonRowVM(d, ZONE, now));
  const lists = PEOPLE_LISTS.map((l) => {
    const members = peopleRows.filter((v) => l.test(v));
    return { id: l.id, label: l.label, group: l.group, count: members.length, ids: members.map((v) => v.id), action: peopleListAction(l.id, members) };
  });

  // Broadcasts: a run waiting for a word, one under the veto window, one that went out this morning.
  const broadcast = (id: string, name: string, label: string, state: BroadcastDto["state"], recipient_count: number, over: Partial<BroadcastDto> = {}): BroadcastDto => ({
    id, name, template_id: "t-1", template_name: "quick_note", template_language: "en", params: [], audience: { kind: "playbook", id: "pb-1", label }, state,
    scheduled_for: ago(-120), started_at: null, finished_at: null, recipient_count, failure: null, created_at: ago(180), playbook_id: "pb-1", run_for: today,
    counts: { queued: recipient_count, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 }, ...over,
  });
  const broadcasts: BroadcastDto[] = [
    broadcast("b-winback", `Win-back · ${today}`, "Win-back", "pending_approval", 6, { playbook_id: "pb-quiet", audience: { kind: "playbook", id: "pb-quiet", label: "Win-back" } }),
    broadcast("b-visit", `Visit reminder · ${today}`, "Visit reminder", "scheduled", 3, { playbook_id: "pb-visit", audience: { kind: "playbook", id: "pb-visit", label: "Visit reminder" }, scheduled_for: ago(-90) }),
    broadcast("b-number", "Save our number", "Everyone who said yes", "sent", 8, { playbook_id: null, audience: { kind: "everyone", id: null, label: "Everyone who said yes" }, scheduled_for: ago(185), started_at: ago(180), finished_at: ago(178), counts: { queued: 0, sent: 8, skipped: 0, failed: 0, delivered: 8, read: 5, replied: 1 } }),
  ];

  const playbooks: PlaybookCardLike[] = [
    { trigger: "visit_tomorrow", state: "running", candidates: 3, next: `today ${clockTime(nowMs + 90 * MIN, ZONE)}` },
    { trigger: "quiet_30", state: "running", candidates: 6, next: `tomorrow ${clockTime(midnight + 34 * 60 * MIN, ZONE)}` },
  ];

  // The bell: three the edge kept, three this browser derives about rows the queue already holds.
  const bellRow = (id: string, kind: BellRow["kind"], title: string, message: string, tone: BellRow["tone"], icon: string, minAgo: number, to: string, action: string, about: BellRow["about"] = null): BellRow => ({
    id, kind, icon, tone, unread: true, time: agoLabel(nowMs - minAgo * MIN, nowMs), title, message, about, actions: [{ label: action, to, primary: true }],
  });
  const bell: BellRow[] = [
    bellRow(`${SERVER_KEY_PREFIX}n-1`, "review", "1 new rating on Google", "Five stars from Bea L.: \"Always on time and the color lasts.\"", "ok", "star", 200, "reports", "Open Reports"),
    bellRow(`${SERVER_KEY_PREFIX}n-2`, "number", "Your WhatsApp number's quality rating was flagged", "Meta rates the number medium. Nothing is blocked; sends go on.", "warn", "shield", 320, "admin/integrations", "Open Connections"),
    bellRow(`${SERVER_KEY_PREFIX}n-3`, "broadcast_sent", "Save our number went out to 8 people", "1 replied so far.", "ok", "bolt", 178, "broadcasts/run:b-number", "Open the run", { type: "broadcast", id: "b-number" }),
    bellRow(`${NEEDS_KEY_PREFIX}cv-ana`, "needs_you", "Ana Reyes needs you", "I'd rather talk to a person about a refund for last time.", "warn", "alert", 94, "inbox/th-cv-ana", "Open"),
    bellRow(`${NEEDS_KEY_PREFIX}cv-kenia`, "needs_you", "Kenia Duarte needs a call back", "Call back to confirm Saturday 10:00.", "warn", "alert", 40, "inbox/th-cv-kenia", "Open"),
    bellRow(`${CALL_KEY_PREFIX}k-voicemail`, "missed_call", "Missed call · +1 (347) 555-0188", "Reached voicemail, 30s.", "warn", "phone", 25, "conversations/cv-k-voicemail", "See the call"),
  ];

  const reports = reportsSample(7, today);
  return {
    TODAY_DATA: toTodayVM(metrics, conversations, escalations, calls, now),
    __CALENDAR: { vm: toCalendarVM(calendarDto, now), fetchedAt: nowMs },
    __PLAYBOOKS: { rows: playbooks },
    __PEOPLE: { rows: peopleRows, lists, aggregates: peopleAggregates(peopleRows, nowMs), calendar: { state: "ok", source: "Google Calendar" } },
    __BROADCASTS: { rows: broadcasts.map((b) => toBroadcastVM(b, ZONE, now)) },
    __REPORTS: reports,
    __LIVE: toLiveVM(calls, null, ZONE, now),
    bell,
    metrics,
    conversations,
    escalations,
    calls,
  };
}

const kept = new Map<number, TodaySample>();

/** The sample as of `nowMs`: the same moment gives the same day, kept rather than rebuilt on every draw. */
export function todaySample(nowMs: number = Date.now()): TodaySample {
  const hit = kept.get(nowMs);
  if (hit) return hit;
  const built = build(nowMs);
  kept.set(nowMs, built);
  return built;
}

/** The bell as Today and the topbar read it, over the sample's rows, with this page's read marks kept in memory. */
function sampleBell(rows: BellRow[]) {
  const read = new Set<string>();
  const dismissed = new Set<string>();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((cb) => cb());
  const feed = () => rows.filter((r) => !dismissed.has(r.id)).map((r) => ({ ...r, unread: r.unread && !read.has(r.id) }));
  return {
    feed,
    unread: () => feed().filter((r) => r.unread).length,
    seenAll: () => { rows.forEach((r) => read.add(r.id)); notify(); },
    read: (key: string) => { read.add(key); notify(); },
    dismiss: (key: string) => { dismissed.add(key); notify(); },
    restore: (key: string) => { dismissed.delete(key); notify(); },
    onChange: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
  };
}

/**
 * Publishes the sample where the app's globals are absent, and nothing where they stand: the app boots its own
 * surfaces from the bridge, and this file is never loaded there. The mockup loads it before its page scripts.
 */
export function installTodaySample(win: Record<string, unknown>, nowMs: number = Date.now()): void {
  const s = todaySample(nowMs);
  const put = (key: string, value: unknown) => { if (win[key] === undefined) win[key] = value; };
  for (const key of ["TODAY_DATA", "__CALENDAR", "__PLAYBOOKS", "__PEOPLE", "__BROADCASTS", "__REPORTS", "__LIVE"] as const) put(key, s[key]);
  put("__today", TODAY_HELPERS);
  put("__notifs", sampleBell(s.bell));
  put("__clock", { dayKey: (ms: number) => zoneDayKey(ms, ZONE), time: (ms: number) => clockTime(ms, ZONE) });
  // The verbs a row offers land nowhere in a mockup; they answer as the edge would after a success.
  put("__inboxVerb", async () => ({ ok: true, data: {} }));
  put("__broadcasts", { approve: async (id: string) => ({ ok: true, data: { recipient_count: s.__BROADCASTS.rows.find((r) => r.id === id)?.recipient_count ?? 0 } }), cancel: async () => ({ ok: true, data: {} }) });
  put("__refreshSurface", () => {});
  put("__refreshPlaybooks", () => {});
  put("__surfaceFailed", () => false);
}
```

- [ ] **Step 4: `serve-legacy.mjs` builds both samples.** Replace the block from `const SAMPLE = path.join(...)` through the end of `reportsSampleBundle` (the `return built.js; }`) with:

```js
const CONTRACTS = path.join(REPO, "packages/contracts/dist/index.js");

/**
 * The demo's samples, for the mockup: legacy-bridge/reports-sample.ts and legacy-bridge/today-sample.ts (a sample
 * business through the same contracts functions a real workspace's numbers go through) bundled for the browser,
 * with contracts from its dist as the app reads it. Chanlytics.html loads them as data/*-sample.js; each publishes
 * its function on window (`__reportsSample`, `__todaySample`), and Today's installs its surfaces where the app's
 * globals are absent, so the mockup shows the one Reports page and the one Today page there are. Built on the first
 * request, and again when the sample or the contracts dist changes.
 */
const SAMPLES = {
  "/data/reports-sample.js": { entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/reports-sample.ts"), globalName: "__RS", footer: "window.__reportsSample = __RS.reportsSample;" },
  "/data/today-sample.js": { entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/today-sample.ts"), globalName: "__TS", footer: "window.__todaySample = __TS.todaySample; __TS.installTodaySample(window);" },
};
const built = new Map();

async function sampleBundle(route) {
  const s = SAMPLES[route];
  const stamp = [s.entry, CONTRACTS].map((f) => fs.statSync(f).mtimeMs).join(":");
  const hit = built.get(route);
  if (hit && hit.stamp === stamp) return hit.js;
  const { build } = await import("esbuild");
  const out = await build({
    entryPoints: [s.entry],
    bundle: true,
    format: "iife",
    globalName: s.globalName,
    platform: "browser",
    target: "es2020",
    write: false,
    logLevel: "silent",
    alias: { "@chanlytics/contracts": CONTRACTS },
    footer: { js: s.footer },
  });
  built.set(route, { stamp, js: out.outputFiles[0].text });
  return built.get(route).js;
}

export const reportsSampleBundle = () => sampleBundle("/data/reports-sample.js");
export const todaySampleBundle = () => sampleBundle("/data/today-sample.js");
```

  In `serve()`, replace the `if (rel === "/data/reports-sample.js") { ... return; }` block with:

```js
      if (SAMPLES[rel]) {
        sampleBundle(rel).then(
          (js) => send(res, 200, TYPES[".js"], js),
          (e) => send(res, 500, "text/plain", `${rel.slice("/data/".length)} could not be built: ${e.message}`),
        );
        return;
      }
```

  And the header comment's line `One file is built rather than read: \`data/reports-sample.js\`, the demo's Reports (see reportsSampleBundle below).` becomes `Two files are built rather than read: \`data/reports-sample.js\` and \`data/today-sample.js\`, the demo's Reports and Today (see SAMPLES below).`

- [ ] **Step 5: `Chanlytics.html`.** After the line `<script src="data/reports-sample.js?v=1"></script>` add:

```html
  <!-- The demo's Today: legacy-bridge/today-sample.ts through contracts, built by the same server; it installs its surfaces where the app's globals are absent -->
  <script src="data/today-sample.js?v=1"></script>
```

- [ ] **Step 6: `legacy-harness.test.mjs`.** The sample test (line 153) becomes:

```js
test("the mockup draws Reports and Today from their samples, loaded right after the stand-ins (serve-legacy.mjs builds them)", () => {
  // Plain scripts, outside the .jsx lists above: the bridge never loads them, because a workspace draws its own numbers.
  const tags = [...html.matchAll(/<script[^>]*\bsrc="([^"?]+)[^"]*"/g)].map((m) => m[1]);
  assert.equal(tags[tags.indexOf(STUBS) + 1], "data/reports-sample.js", "the demo's Reports reads window.__reportsSample");
  assert.equal(tags[tags.indexOf(STUBS) + 2], "data/today-sample.js", "the demo's Today reads what installTodaySample published");
});
```

- [ ] **Step 7: Run**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-sample.test.mjs tooling/scripts/tests/reports-sample.test.mjs tooling/scripts/tests/legacy-harness.test.mjs
```
Expected: PASS. If the bundle test fails with a `legacy-bridge/api.ts` path in the output, a bridge import crept in: the sample may import only `@chanlytics/contracts`, `./reports-sample`, `./today` and types. If `toCalendarVM` complains about `hours: null`, read `packages/contracts/src/calendar.ts` `toCalendarVM` (it reads `dto.hours ?? {}`) and pass `{}` instead. If `PEOPLE_LISTS[].test` needs a field `toPersonRowVM` did not set from these DTOs, the failing list's `test` in `people.ts:848-870` names it; add it to `row()`.

  Then look at it once: `node tooling/scripts/serve-legacy.mjs 3215` in the worktree, open `http://localhost:3215/Chanlytics.html#/today` in the built-in browser (`preview_start` with a `url`), confirm the standing line reads the sample's eyebrow and the queue holds four rows plus two runs, stop the server. (The mockup's page is still the OLD page in PR A; the redesign lands in PR B, Task B12 looks again.)

- [ ] **Step 8: Typecheck and commit**

```bash
corepack pnpm -r typecheck
git add apps/dashboard/src/legacy-bridge/today-sample.ts tooling/scripts/serve-legacy.mjs apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/today-sample.test.mjs
git commit -m "The mockup's Today: a sample workspace through the same view models, installed where the app's globals are absent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task A6: Dist, the whole suite, PR A

- [ ] **Step 1: Rebuild the dist and keep only the real diff**

```bash
corepack pnpm --filter "./packages/*" build
git status --short packages/*/dist
git diff -w --ignore-cr-at-eol --stat -- packages/contracts/dist
```
Expected: `packages/contracts/dist/*` changed (today.ts and notifications.ts moved). For every OTHER package's dist listed by `git status`, run `git diff -w --ignore-cr-at-eol -- packages/<pkg>/dist`; if it prints nothing, `git checkout -- packages/<pkg>/dist`.

- [ ] **Step 2: Everything**

```bash
node tooling/scripts/check-dist.mjs
corepack pnpm test
corepack pnpm -r typecheck
corepack pnpm lint
```
Expected: all green. `source-scan-ratchet` passes: today-vm, today-leaks and today-sample hold no pins; today-day/today-week/today-calls-strip/legacy-harness kept their counts.

- [ ] **Step 3: Commit the dist, push, open PR A**

```bash
git add packages/contracts/dist
git commit -m "contracts dist: Today's figures, period line, run words, leaks v2, four-kind dedupe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/today-data
```

  Then, in Git Bash (the body through a file, never a heredoc inside an `&&` chain):

```bash
cat > "$TMPDIR/pr-a.md" <<'EOF'
Data for the Today redesign (`docs/superpowers/specs/2026-09-19-today-redesign-design.md`, plan `docs/superpowers/plans/2026-09-19-today-redesign.md`, Part A). No page changes: the live page draws exactly what it drew, from a view model that now also carries what the page PR draws.

**Contracts (`today.ts`)**
- `figures`: the day's four figures (customer messages, answered by the receptionist, calls, new people), each with the clause always under it and the why behind it with one door; null on a day with nothing at all. A contracts test proves a receipt never repeats its figure's number.
- `proof`: when the last message arrived and how long the answer took, always computed (it was gated on the queue, so it vanished exactly when an owner needed it); the quiet card's own sentence ends with it.
- `noReply`: who is waiting with nothing back, for Worth a look to name.
- One reading of each escalation: Ask's rows and the queue's rows agree; a call-back carries the to-do the phone receptionist left.
- Queue rows carry `conversationId` and `callId`; `todayAwayGrouped` dedupes over all four queue kinds (spec 4.7, deferred from #686).
- `todayPeriodLine`: the last 7 days in one sentence, never touching `campaigns`.
- `todayRunWords`, `todayRunsSub`, `todayRunApproved`: every sentence with a number the page said about a run.
- `todayLeaks` returns `{ rows, more }`; rows carry a tone word, an icon, who is waiting and an Ask prompt.
- Gone, with no reader: `standing.greeting`, `pulse`, `launchpad`, `updatedAt`.

**The mockup**: `legacy-bridge/today-sample.ts`, built by `serve-legacy.mjs` as `data/today-sample.js` like the Reports sample, installs a sample day where the app's globals are absent.

**Tests**: today-vm (+5), today-leaks (+6), today-sample (new), legacy-harness extended; pins moved, none added.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --repo <owner>/<repo> --base main --head feat/today-data --title "Today redesign, part A: the day's figures with their receipts, the proof ungated, the period in one line, the mockup's sample" --body-file "$TMPDIR/pr-a.md"
```
  (`<owner>/<repo>` is `git remote get-url origin` without the host; `$TMPDIR` is the session scratchpad.)

- [ ] **Step 4: CI, then merge.** Read the checks with `gh pr checks <n> --repo <owner>/<repo>` until every one of Typecheck, Secret scan, Migrations replay and the two Vercel deploys is green (count them: a CONFLICTING PR runs no Actions; a red in 2s is billing). Then:

```bash
gh pr merge <n> --repo <owner>/<repo> --squash --delete-branch
```
  Record the merge commit in the plan's wrap-up notes (Task B13).

---

# Part B: the page (PR B)

Part B starts after PR A is merged. Read `## The contract every task writes against` again before B4.

### Task B1: Branch

- [ ] **Step 1**

```bash
cd "C:/Users/Ruben/Documents/Claude Projects/Claude Video/cm-gutter"
git fetch -q origin
git checkout -q -B feat/today-page origin/main
git log --oneline -1
```
Expected: PR A's squash commit at the top.

### Task B2: Contracts for the page: the day's cap, the period card's helpers gone, the bridge's final shape

**Files:**
- Modify: `packages/contracts/src/today.ts`, `apps/dashboard/src/legacy-bridge/today.ts`
- Test: `tooling/scripts/tests/today-day.test.mjs` (modify), `tooling/scripts/tests/today-week.test.mjs` (delete), `tooling/scripts/tests/calendar-honest.test.mjs:608` (modify), `tooling/scripts/tests/today-away-page.test.mjs` (modify)

- [ ] **Step 1: Write the failing test.** In `tooling/scripts/tests/today-day.test.mjs`:

  (a) The import line becomes `import { todayDay, TODAY_DAY_MAX } from "@chanlytics/contracts";`.

  (b) Delete the test `"the facts beside the recap's: appointments today with the next open time or the closure, and what is booked ahead"` (the helper it tests goes).

  (c) Append, before the wiring test:

```js
test("five rows on Today, the rest a line to the Calendar: what is over goes first, what is coming stays", () => {
  const blocks = [8, 9, 10, 11, 13, 14, 16, 18].map((h) => block(`b${h}`, h, `${h}:00`, `Slot ${h}`));
  const vm = todayDay(cal([day("2026-09-06", { today: true, blocks })]), [], null);
  const [today] = vm.frames;
  assert.equal(TODAY_DAY_MAX, 5);
  assert.deepEqual(today.items.map((i) => i.title), ["Slot 10", "Slot 11", "Slot 13", "Slot 14", "Slot 16"], "at ten: what is on now and the four coming; the two over and the last of the evening are the three cut");
  const noon = todayDay(cal([day("2026-09-06", { today: true, blocks })], { now: 12 }), [], null).frames[0];
  assert.deepEqual(noon.items.map((i) => i.title), ["Slot 11", "Slot 13", "Slot 14", "Slot 16", "Slot 18"], "at noon: the four coming, then the most recent of what is over, back in the day's order");
  assert.equal(today.more, 3);
  assert.equal(today.moreLine, "3 more on the Calendar");
  assert.equal(today.summary.booked, "8 booked", "the summary counts the day, not the rows drawn");
  const few = todayDay(cal([day("2026-09-06", { today: true, blocks: blocks.slice(0, 3) })]), [], null).frames[0];
  assert.deepEqual([few.more, few.moreLine], [0, null]);
});
```

  (d) In the wiring test, the `bridge` assertion (Task A4) becomes the final shape, and the brief assertions move to the card:

```js
  const bridge = readCode("apps/dashboard/src/legacy-bridge/today.ts");
  assert.ok(bridge.includes("export const TODAY_HELPERS = { day: todayDay, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved, leaks: todayLeaks, awayGrouped: todayAwayGrouped };") && bridge.includes("window.__today = TODAY_HELPERS;"));
```
  and
```js
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(!brief.includes("dayLine") && !brief.includes("<DayFacts />"), "the day's numbers are the card's figures now, not a sentence or a strip of stat cards");
  assert.ok(!brief.includes("CalendarLine") && !brief.includes('data-testid="brief-calendar"'), "the one-line calendar beat is the module now");
```
  (The number of `readCode(`/`readRaw(` calls in the file is unchanged: 8.)

  (e) Add to the page pins in the wiring test (same `page` read): `'data-testid="today-day-more"'`, `"d.moreLine"`.

  (f) In the same wiring test's CSS assertion, the media pin `"@media (max-width: 900px) {\n  .dash-a-v2-core { grid-template-columns: 1fr; }"` becomes `"@media (max-width: 1180px) {\n  .dash-a-v2-core, .dash-a-v2-foot { grid-template-columns: 1fr; }"` (spec 4.1: one column below 1180px; Task B8 writes exactly that block).

- [ ] **Step 2: Delete `tooling/scripts/tests/today-week.test.mjs`** (`git rm tooling/scripts/tests/today-week.test.mjs`): the period card, the journey and `todayAway` leave with the page.

- [ ] **Step 3: `calendar-honest.test.mjs` line 608.** `assert.equal(todayDayFacts(vm, null)[0].hint, "next open time today 3:30 PM", ...)` becomes `assert.equal(todayDay(vm, null).nextOpening, "today 3:30 PM", "REGRESSION: Today's day said 'next opening'");` and `todayDayFacts` leaves that file's import list.

- [ ] **Step 4: `today-away-page.test.mjs`.** The import becomes `import { todayAwayGrouped, todayDay, todayLeaks, todayPeriodLine, todayRunWords, todayRunsSub, todayRunApproved, unreadCount } from "@chanlytics/contracts";`; in `draw`, `globalThis.__today = { awayGrouped: todayAwayGrouped, day: todayDay, leaks: todayLeaks, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved };` and `globalThis.TODAY_DATA = { queue: { rows: cvs.map((id) => ({ conversationId: id, callId: null })) } };` (the page reads the row's own ids now, not `also.conversationId`).

- [ ] **Step 5: Run and watch them fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-day.test.mjs tooling/scripts/tests/today-away-page.test.mjs
```
Expected: FAIL (`TODAY_DAY_MAX` undefined; the bridge string).

- [ ] **Step 6: `today.ts`.**

  (a) In `TodayDayFrameVM`, after `open: string[];` add:

```ts
  /** How many of the day's entries the cap left out, and the line that says so ("2 more on the Calendar"). */
  more: number;
  moreLine: string | null;
```

  (b) Before `export function todayDay(` add:

```ts
/** Rows on Today's day card; the Calendar has the rest. */
export const TODAY_DAY_MAX = 5;

/**
 * The `max` entries worth the card: everything still to come first, then what is over, most recent first, back in the
 * day's order. At ten with seven appointments the eight o'clock goes before anything ahead does.
 */
function capDay(items: TodayDayItemVM[], max: number): TodayDayItemVM[] {
  if (items.length <= max) return items;
  const keep = new Set<string>();
  for (const i of items) if (i.phase !== "past" && keep.size < max) keep.add(i.id);
  for (const i of [...items].reverse()) if (i.phase === "past" && keep.size < max) keep.add(i.id);
  return items.filter((i) => keep.has(i.id));
}
```

  (c) `todayDay`'s signature gains `max = TODAY_DAY_MAX` after `people`, and in the frame it builds, `items` becomes the capped list while the summary counts the day:

```ts
    const items = [...d.allDay.map((b) => item(b, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
    const shown = capDay(items, max);
    const more = items.length - shown.length;
    return {
      key: d.key,
      label: `${d.today ? "Today" : "Tomorrow"} · ${d.long}`,
      today: d.today,
      past: d.past,
      closed: d.closed,
      items: shown,
      more,
      moreLine: more ? `${more} more on the Calendar` : null,
      summary: items.length ? { booked: `${items.length} booked`, flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null } : null,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label),
    };
```

  (d) Delete, whole: `todayDayFacts` and `todayDayLine` (with the comment `/** The day's own numbers as one sentence, beside the recap's: they were stat cards in the hero, over the work. */`), `TodayWeekViewVM`, `TodayWeekVM`, `todayWeek`, `TodayJourneyRowVM`, `TodayJourneyVM`, `todayJourney`, `todayAway`. Keep `WeekTileLike`, `ReportsLike` (`todayPeriodLine` and `todayLeaks` read them), `JourneyListLike` (`PeopleListsLike` reads it), `TodayFactVM` (Ask's facts). Then `corepack pnpm --filter "./packages/*" build` and fix any unused import tsc names (`clockLabel` and `durationLabel` stay: `todayDay` uses them).

- [ ] **Step 7: The bridge's final shape.** `apps/dashboard/src/legacy-bridge/today.ts` becomes:

```ts
/**
 * Today's helpers for the legacy page, computed in contracts from the
 * surfaces the page already holds — the calendar, the playbooks, the people,
 * Reports, the bell, the broadcasts. Published on window the way the
 * calendar's verbs are, so the page composes and never derives. The mockup's
 * sample (today-sample.ts) publishes the same object, so the two cannot drift.
 */
import { todayDay, todayAwayGrouped, todayLeaks, todayPeriodLine, todayRunWords, todayRunsSub, todayRunApproved } from "@chanlytics/contracts";

export const TODAY_HELPERS = { day: todayDay, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved, leaks: todayLeaks, awayGrouped: todayAwayGrouped };
export type TodayHelpers = typeof TODAY_HELPERS;

declare global {
  interface Window {
    __today?: TodayHelpers;
  }
}

export function installToday(): void {
  window.__today = TODAY_HELPERS;
}
```
  And in `today-sample.ts`, the import of `TODAY_HELPERS` stays (the sample publishes the same object) and the header sentence about `facts`, `dayLine`, `week`, `journey`, `away` in the bridge file is gone with them.

- [ ] **Step 8: Build and run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-day.test.mjs tooling/scripts/tests/today-vm.test.mjs tooling/scripts/tests/today-leaks.test.mjs tooling/scripts/tests/today-sample.test.mjs tooling/scripts/tests/calendar-honest.test.mjs
corepack pnpm -r typecheck
```
Expected: today-day PASS except its wiring test's page pins (`today-day-more`, `d.moreLine`: Task B6 adds them) and its `brief` assertions (Task B4). today-away-page fails until B7. calendar-honest PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/today.ts apps/dashboard/src/legacy-bridge/today.ts tooling/scripts/tests/today-day.test.mjs tooling/scripts/tests/calendar-honest.test.mjs tooling/scripts/tests/today-away-page.test.mjs
git rm -q tooling/scripts/tests/today-week.test.mjs
git commit -m "Today's contracts for the page: five rows on the day and a line to the Calendar; the period card's helpers go with it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B3: The page test, written first

**Files:**
- Create: `tooling/scripts/tests/today-page.test.mjs` (it calls neither `readCode(` nor `readRaw(`)

- [ ] **Step 1: Write it**

```js
/**
 * Today, EXECUTED on the stub React over the view models the bridge publishes: the standing line, the day's card
 * (four figures, each with its receipt on hover, focus or a tap; the lines that are not numbers; the period in one
 * line with one door), the queue with one primary verb, the day with its cap, Worth a look with a word for its tone
 * and an Ask door, While you were away over all four queue kinds, a borrowed read that failed saying so, and the
 * composition without a seeded panel. Every sentence with a number is read back from contracts, never typed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, todayPeriodLine, todayRunWords, todayRunApproved, todayLeaks, unreadCount, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";

const ZONE = "America/New_York";
// 4 PM in New York on Friday 18 September 2026.
const NOW = new Date("2026-09-18T20:00:00Z");
const went = [];
const asked = [];
const flashes = [];
const failed = new Set();
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: (k) => failed.has(k), __refreshSurface: () => {} });
const L = "../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
const { TODAY_HELPERS } = await import("../../../apps/dashboard/src/legacy-bridge/today.ts");
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  askAbout: (a) => asked.push(a),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  useHotkey: () => {},
  refusalToast: (res, lead) => ({ msg: `${lead}: ${res.error}`, tone: "danger" }),
  __today: TODAY_HELPERS,
  __clock: { dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
await import(`${L}/pages/attention-bits.jsx`);
await import(`${L}/pages/dashboard-a-brief.jsx`);
await import(`${L}/pages/dashboard-a-command.jsx`);
await import(`${L}/pages/dashboard-a-day.jsx`);
await import(`${L}/pages/dashboard-a-week.jsx`);
await import(`${L}/pages/dashboard-a.jsx`);
const W = globalThis.window;

/* ------------------------------------ a working day ------------------------------------ */

const metrics = (over = {}) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }, { kind: "voice", status: "active", number: "+1 786" }],
  window: { days: 1, since: "2026-09-18T04:00:00Z", since_local: "2026-09-18T00:00:00", now_local: "2026-09-18T16:00:00" },
  now: { escalations_open: 1, oldest_open_escalation_at: "2026-09-18T18:20:00Z", threads_needing_human: 1, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: "2026-09-18T19:38:00Z", last_outbound_at: "2026-09-18T19:38:41Z", ...(over.now ?? {}) },
  period: { messages_in: 9, messages_out_ai: 11, messages_out_you: 0, conversations_active: 6, answered_by_ai: 7, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 34, send_failures: 1, escalations_new: 1, escalation_reasons: { human_token: 1 }, calls: 3, call_seconds: 412, call_sentiments: { Positive: 2, Neutral: 1 }, calls_voicemail: 1, new_contacts: 2, ...(over.period ?? {}) },
  ...(over.channels ? { channels: over.channels } : {}),
});
const msg = (id, dir, body, created_at, over = {}) => ({ id, direction: dir === "in" ? "inbound" : "outbound", sender: dir === "in" ? "customer" : "ai", type: "text", body, media: null, meta: null, status: dir === "in" ? "received" : "delivered", channel: "whatsapp", created_at, ...over });
const thread = (id, name, messages, over = {}) => ({ id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false, last_wa_inbound_at: null, last_message_at: messages.at(-1)?.created_at ?? null, contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13055550100" }, messages, ...over });
const threads = () => [
  thread("cv-r", "Renata Solís", [msg("r1", "in", "Anything Saturday for a gel manicure?", "2026-09-18T13:10:00Z"), msg("r2", "ai", "Saturday 10:00 or 2:00 is open.", "2026-09-18T13:10:30Z")]),
  thread("cv-p", "Priya Nair", [msg("p1", "in", "Do you do balayage on Sundays?", "2026-09-18T17:50:00Z"), msg("p2", "ai", "We're closed Sundays, but Saturday 1:00 PM is open.", "2026-09-18T17:51:00Z", { status: "failed" })]),
  thread("cv-d", "Dulce Amaro", [msg("d0", "in", "Booking for the 12th", "2026-09-09T13:00:00Z", { channel: "sms" }), msg("d2", "in", "Can I bring my sister too?", "2026-09-18T17:30:00Z", { channel: "sms" })]),
  thread("cv-a", "Ana Reyes", [msg("a0", "in", "Hi, can I book?", "2026-09-10T14:00:00Z"), msg("a2", "in", "I'd rather talk to a person about a refund.", "2026-09-18T18:19:00Z")], { state: "needs_human" }),
];
const escalations = () => [{ id: "e-a", conversation_id: "cv-a", reason: "human_token", details: null, state: "open", created_at: "2026-09-18T18:20:00Z" }];
const call = (id, over = {}) => ({ id, retell_call_id: `r-${id}`, direction: "inbound", call_type: "phone_call", status: "ended", from_e164: "+13475550188", from_raw: null, to_e164: null, started_at: "2026-09-18T19:20:00Z", ended_at: "2026-09-18T19:21:00Z", duration_ms: 60_000, disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false, summary: "Asked about hours.", wanted: "Asked about hours.", outcome: "handled", follow_up: null, caller_name: null, transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null, ...over });
const calls = () => [call("k1"), call("k2", { sentiment: "Neutral" }), call("k3", { in_voicemail: true, sentiment: null, summary: null, wanted: null, outcome: "voicemail", started_at: "2026-09-18T19:35:00Z", ended_at: "2026-09-18T19:35:30Z", duration_ms: 30_000 })];
const busy = () => toTodayVM(metrics(), threads(), escalations(), calls(), NOW);
const quietDay = () => toTodayVM(metrics({ now: { escalations_open: 0, oldest_open_escalation_at: null, threads_needing_human: 0, last_inbound_at: "2026-09-17T21:39:00Z", last_outbound_at: "2026-09-17T21:40:18Z" }, period: { messages_in: 0, messages_out_ai: 0, conversations_active: 0, answered_by_ai: 0, unanswered_in_window: 0, median_reply_seconds_ai: null, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 } }), [thread("cv-old", "Bea Lind", [msg("o1", "in", "Thanks!", "2026-09-17T21:39:00Z")])], [], [], NOW);

const tile = (id, value, compare = null) => ({ id, label: id, value, meta: "", delta: null, spark: [], compare });
const reports = () => ({
  vm: { days: 7, rangeLabel: "7 days", since: "Sep 12", until: "Sep 18", empty: false, tiles: [tile("messages", "24", "up from 19"), tile("calls", "4")], answered: { totals: { in: 24, ai: 21, you: 1, none: 2 } }, replyTime: { count: 21, medianLabel: "34s" }, reasons: [] },
  campaigns: null,
  booking: { present: true, headline: "2 of 18 booked", sub: "", pct: 11, asked: 18, booked: 2 },
});
const list = (id, label, count, action = null) => ({ id, label, group: "journey", count, action });
const people = () => ({
  rows: [{ id: "k-cv-a", state: "needs_you", hasChat: true, calls: 0 }],
  lists: [list("asked_never_booked", "Asked, never booked", 16, { text: "", cta: "Text the booking link", to: "broadcasts/asked_never_booked", enabled: true }), list("opted_in", "Said yes to messages", 7, { text: "", cta: "Get their yes to offers", to: "broadcasts/get-yes", enabled: true }), list("offers_ok", "Can receive offers", 0, null), list("quiet", "Quiet 30+ days", 6, { text: "", cta: "Reach out", to: "broadcasts/quiet", enabled: true })],
  aggregates: { total: 28 },
});
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const run = (id, state, over = {}) => ({ id, name: `${id} · run`, state, playbook_id: "pb-1", audience: { label: "Win-back" }, recipient_count: 3, scheduled_for: iso(2 * 3_600_000), started_at: null, when: "today 6:00 PM", counts: { sent: 0, replied: 0 }, ...over });
// The run that went out went out a minute ago: RunsDone keys on the business's day, and three hours ago is yesterday before 3 AM.
const broadcasts = () => ({ rows: [run("b-wait", "pending_approval"), run("b-soon", "scheduled", { audience: { label: "Visit reminder" } }), run("b-done", "sent", { name: "Save our number", playbook_id: null, audience: { label: "Everyone" }, started_at: iso(-60_000), counts: { sent: 8, replied: 1 } })] });
const block = (id, t, title, person = null) => ({ id, t, dur: 60, time: `${t}:00`, title, person, description: null, location: null, contacts: { phones: [], e164: [], emails: [] }, guess: null, start: "", end: "" });
const calendar = (blocks) => ({ vm: { timezone: ZONE, from: "2026-09-18", to: "2026-11-19", rangeLabel: "", monthLabel: "", hours: { start: 8, end: 20 }, days: [{ key: "2026-09-18", dow: "Fri", date: "Sep 18", long: "Friday, September 18", dayNum: "18", today: true, past: false, closed: { yes: false, note: null }, bands: [], blocks, allDay: [], windows: [] }, { key: "2026-09-19", dow: "Sat", date: "Sep 19", long: "Saturday, September 19", dayNum: "19", today: false, past: false, closed: { yes: false, note: null }, bands: [], blocks: [], allDay: [], windows: [] }], today: "2026-09-18", now: 16, feed: { present: true, state: "ok", line: "", events: blocks.length, source: "Google Calendar" }, stats: { events: blocks.length, windows: 0, next: "Mon 9:30 AM" }, rules: "", hoursLines: [], closuresAhead: [], services: [], bookingLink: null } });
const bellRow = (id, kind, title, tone = "", about = null, to = "reports") => ({ id, kind, icon: "bell", tone, unread: true, time: "1h", title, message: "", about, actions: [{ label: "Open", to, primary: true }] });

const set = (globals) => { for (const [k, v] of Object.entries(globals)) { if (v === undefined) delete W[k]; else W[k] = v; } };
const clear = () => { set({ TODAY_DATA: undefined, __REPORTS: undefined, __PEOPLE: undefined, __BROADCASTS: undefined, __CALENDAR: undefined, __PLAYBOOKS: undefined, __SETUP: undefined, __GOOGLE: undefined, __google: undefined, __notifs: undefined, __LIVE: undefined, __broadcasts: undefined, __inboxVerb: undefined }); failed.clear(); went.length = 0; asked.length = 0; flashes.length = 0; W.__DEMO_MODE = false; };
const draw = (Comp, props = {}) => { fresh(); return W.React.createElement(Comp, props); };
const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).includes(words));
const texts = (tree, cls) => all(tree, (n) => classes(n).includes(cls)).map(textOf);

/* ------------------------------------ the standing line ------------------------------------ */

test("the standing line: the day, the time, the lines counted, its own dot; no greeting, no headline, no live-dot", () => {
  clear();
  set({ TODAY_DATA: busy() });
  const tree = draw(W.HeroBrief);
  const line = byTestId(tree, "today-standing");
  assert.ok(line);
  assert.match(textOf(line), /Melany's Beauty Salon/);
  assert.match(textOf(line), /2 of 2 lines connected/);
  assert.ok(!/Good (morning|afternoon|evening)/.test(textOf(line)));
  assert.ok(!textOf(line).includes(busy().standing.headline), "Ask reads the headline; the page draws the work instead");
  const dot = find(line, (n) => classes(n).includes("today-standing-dot"));
  assert.ok(dot && !classes(dot).includes("down"));
  assert.equal(find(tree, (n) => classes(n).includes("live-dot")), null, "the coral live-dot is the agent's live state, never a status light");
  const down = toTodayVM(metrics({ channels: [{ kind: "whatsapp", status: "disconnected", number: "+1 305" }] }), [], [], [], NOW);
  set({ TODAY_DATA: down });
  const dark = draw(W.HeroBrief);
  assert.ok(classes(find(dark, (n) => classes(n).includes("today-standing-dot"))).includes("down"));
  assert.ok(textOf(dark).includes(down.standing.alert));
  set({ TODAY_DATA: undefined });
  assert.equal(draw(W.HeroBrief).rendered, null, "no seeded hero: without the view model there is nothing above the work");
});

/* ------------------------------------ the day's card ------------------------------------ */

test("the card: four figures in order, each with its clause; nothing said twice; the receipts and the not-numbers under them", () => {
  clear();
  const vm = busy();
  set({ TODAY_DATA: vm, __BROADCASTS: broadcasts() });
  const tree = draw(W.TodayCard);
  const card = byTestId(tree, "today-card");
  assert.ok(card);
  const heading = find(card, (n) => n.type === "h2");
  assert.equal(textOf(heading), "Today so far", "a section with its own heading");
  assert.equal(card.props["aria-labelledby"], heading.props.id);
  const figs = vm.figures.map((f) => byTestId(card, `today-figure-${f.id}`));
  assert.deepEqual(figs.map((n) => !!n), [true, true, true, true]);
  for (const [i, f] of vm.figures.entries()) {
    const said = textOf(figs[i]);
    assert.ok(said.includes(String(f.value)) && said.includes(f.label) && said.includes(f.meta), `${f.id}: ${said}`);
    assert.equal(byTestId(card, `today-receipt-${f.id}`), null, "a receipt waits for a hover, a focus or a tap");
  }
  // The lines that are not numbers: a reply that failed to deliver with its door to the thread; what ran today in
  // contracts' words; the receipts. Never the traffic the figures already say.
  const beats = texts(byTestId(card, "today-recap"), "brief-beat-text");
  assert.ok(!beats.some((b) => /receptionist answered|reached the phone line|messages? in/.test(b)), `REGRESSION: the figures say these already: ${beats.join(" | ")}`);
  const failedBeat = all(card, (n) => classes(n).includes("brief-beat")).find((n) => textOf(n).includes("failed to deliver"));
  assert.ok(failedBeat, "the one line that must never be quiet");
  press(buttons(failedBeat, "See the thread")[0]);
  assert.equal(went.at(-1), "inbox/th-cv-p", "the thread of the reply that failed, not the Inbox list");
  const done = byTestId(card, "brief-run-done");
  assert.ok(done);
  const words = todayRunWords(broadcasts().rows[2]).done;
  assert.ok(textOf(done).includes(`went out at ${W.__clock.time(Date.parse(broadcasts().rows[2].started_at))}: ${words.counts}`), textOf(done));
  assert.ok(!textOf(done).includes("—"), "no em dash in a new sentence");
  assert.equal(all(card, (n) => n.props?.["data-testid"] === "brief-receipt").length, vm.recap.receipts.length, "every receipt the view model kept");
});

test("a receipt opens on hover, focus or a tap, says its why with one door, never repeats the figure, and closes on Escape", () => {
  clear();
  const vm = busy();
  set({ TODAY_DATA: vm });
  const first = draw(W.TodayCard);
  const fig = byTestId(first, "today-figure-messages");
  fig.props.onMouseEnter();
  const hovered = again(() => W.React.createElement(W.TodayCard));
  const receipt = byTestId(hovered, "today-receipt-messages");
  assert.ok(receipt, "hover opens it");
  assert.equal(receipt.props.role, "dialog");
  assert.ok(byTestId(byTestId(hovered, "today-figures"), "today-receipt-messages"), "drawn in the row of figures, so a phone lays it under the row and a desktop anchors it by index");
  assert.equal(receipt.props.style["--i"], 0);
  const f = vm.figures.find((x) => x.id === "messages");
  assert.ok(textOf(receipt).includes(f.receipt.text));
  assert.doesNotMatch(textOf(find(receipt, (n) => classes(n).includes("tc-receipt-t"))), new RegExp(`\\b${f.value}\\b`), "the receipt adds to the figure; it never says its number again");
  const door = buttons(receipt, f.receipt.door.label)[0];
  assert.ok(door, "one door");
  press(door);
  assert.equal(went.at(-1), f.receipt.door.to);
  assert.equal(byTestId(hovered, "today-receipt-answered"), null, "one at a time");
  byTestId(hovered, "today-figures").props.onMouseLeave();
  const left = again(() => W.React.createElement(W.TodayCard));
  assert.equal(byTestId(left, "today-receipt-messages"), null);
  // A tap or a keyboard: the figure is the button.
  const btn = find(byTestId(left, "today-figure-calls"), (n) => n.type === "button");
  assert.equal(btn.props["aria-expanded"], false);
  press(btn);
  const tapped = again(() => W.React.createElement(W.TodayCard));
  assert.ok(byTestId(tapped, "today-receipt-calls"));
  assert.equal(find(byTestId(tapped, "today-figure-calls"), (n) => n.type === "button").props["aria-expanded"], true);
  find(byTestId(tapped, "today-figure-calls"), (n) => n.type === "button").props.onKeyDown({ key: "Escape" });
  assert.equal(byTestId(again(() => W.React.createElement(W.TodayCard)), "today-receipt-calls"), null, "Escape closes");
  // A figure with nothing to add is not a button.
  const thin = toTodayVM(metrics({ period: { messages_in: 1, answered_by_ai: 1, conversations_active: 1, messages_out_ai: 1, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 } }), [], [], [], NOW);
  set({ TODAY_DATA: thin });
  const plain = draw(W.TodayCard);
  assert.equal(find(byTestId(plain, "today-figure-calls"), (n) => n.type === "button"), null, "no receipt, no button");
});

test("the foot: the last seven days in Reports' own numbers with one door; a failed Reports read says so; nothing while it loads", () => {
  clear();
  set({ TODAY_DATA: busy(), __REPORTS: reports() });
  const tree = draw(W.TodayCard);
  const line = byTestId(tree, "today-period");
  assert.equal(textOf(line), todayPeriodLine(reports()).text);
  assert.match(textOf(line), /^Last 7 days: 24 customer messages \(up from 19\), 88% answered by the receptionist, median reply 34s, 4 calls\.$/);
  press(buttons(tree, "Open Reports")[0]);
  assert.equal(went.at(-1), "reports");
  assert.equal(buttons(tree, "Open Reports").length, 1, "one door to Reports on the card: the period card had two");
  set({ __REPORTS: undefined });
  failed.add("reports");
  const broke = draw(W.TodayCard);
  assert.equal(byTestId(broke, "today-period"), null);
  assert.match(textOf(byTestId(broke, "today-period-failed")), /Couldn't read Reports/);
  failed.clear();
  const loading = draw(W.TodayCard);
  assert.equal(byTestId(loading, "today-period"), null);
  assert.equal(byTestId(loading, "today-period-failed"), null, "not read yet is not failed");
});

test("a quiet day: the card says nothing came in, proves the lines are listening, and keeps its one door; no figures", () => {
  clear();
  const vm = quietDay();
  set({ TODAY_DATA: vm });
  const tree = draw(W.TodayCard);
  assert.equal(byTestId(tree, "today-figures"), null, "no row of zeros");
  const line = textOf(byTestId(tree, "today-quiet-line"));
  assert.ok(line.includes("Nothing has come in yet today.") && line.includes(vm.proof), line);
  assert.match(vm.proof, /^The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later\.$/);
  const proof = byTestId(tree, "brief-quiet-proof");
  assert.match(textOf(proof), /WhatsApp/);
  assert.match(textOf(proof), /· on/);
  press(buttons(tree, "earlier conversation")[0]);
  assert.equal(went.at(-1), "conversations");
  // No traffic while a handoff waits: not a quiet day, and no figure to hang the proof on. The card still says it.
  const waiting = toTodayVM(metrics({ period: { messages_in: 0, messages_out_ai: 0, conversations_active: 0, answered_by_ai: 0, unanswered_in_window: 0, median_reply_seconds_ai: null, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 } }), threads().slice(3), escalations(), [], NOW);
  assert.equal(waiting.quiet, null);
  assert.equal(waiting.figures, null);
  set({ TODAY_DATA: waiting });
  const held = draw(W.TodayCard);
  assert.equal(byTestId(held, "today-figures"), null);
  assert.ok(textOf(byTestId(held, "today-quiet-line")).includes(waiting.proof), "REGRESSION: the proof vanished exactly when an owner needed it");
});

test("the calls read failed: the card says so under the figures, once", () => {
  clear();
  set({ TODAY_DATA: toTodayVM(metrics(), threads(), escalations(), null, NOW) });
  const tree = draw(W.TodayCard);
  assert.ok(byTestId(tree, "brief-calls-failed"));
  assert.equal(all(tree, (n) => String(n.props?.className || "").includes("empty-failed")).length, 1);
});

/* ------------------------------------ the queue ------------------------------------ */

test("the queue: no count badge over the rows, one primary verb, the runs in contracts' words, the approval toast too", async () => {
  clear();
  set({ TODAY_DATA: busy(), __BROADCASTS: broadcasts(), __broadcasts: { approve: async () => ({ ok: true, data: { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) } }), cancel: async () => ({ ok: true, data: {} }) }, bcWhenWords: () => "scheduled for Mon 9:00 AM" });
  const tree = draw(W.AgentCommand);
  const queue = byTestId(tree, "today-queue");
  assert.equal(find(queue, (n) => classes(n).includes("tq-count")), null, "REGRESSION: a number over the rows that say it");
  assert.match(textOf(find(queue, (n) => classes(n).includes("tq-sub"))), /1 need you · 1 call worth a listen · 2 runs waiting/, "the parts from contracts, the runs' count from contracts");
  const rows = all(queue, (n) => classes(n).includes("cl-attn-row"));
  const primary = rows.filter((r) => find(r, (n) => classes(n).includes("cl-attn-cta") && classes(n).includes("primary")));
  assert.equal(primary.length, 1, "the first row carries the page's one primary verb");
  assert.equal(primary[0], rows[0]);
  const waiting = byTestId(queue, "brief-run-row");
  const w = todayRunWords(broadcasts().rows[0]);
  assert.ok(textOf(waiting).includes(w.waiting.sentence) && textOf(waiting).includes(w.waiting.status[0]), textOf(waiting));
  const soon = byTestId(queue, "brief-run-soon");
  assert.ok(textOf(soon).includes(todayRunWords(broadcasts().rows[1]).soon.meta));
  await press(buttons(waiting, "Approve")[0]);
  const t = todayRunApproved("Win-back", 3, "scheduled for Mon 9:00 AM");
  assert.equal(textOf(flashes.at(-1).msg), `${t.lead} ${t.rest}`);
  assert.ok(!textOf(flashes.at(-1).msg).includes("sending now"));
  delete W.bcWhenWords;
  // The broadcasts read failed: the queue's rows are current, and it says the runs could not be read.
  set({ __BROADCASTS: undefined });
  failed.add("broadcasts");
  const broke = draw(W.AgentCommand);
  assert.match(textOf(byTestId(broke, "today-runs-failed")), /Couldn't read the playbook runs/);
  assert.equal(all(broke, (n) => classes(n).includes("cl-attn-row")).length, rows.length, "the rows themselves stand");
});

/* ------------------------------------ the day ------------------------------------ */

test("the day: five rows and a line to the Calendar; a failed calendar read says so where the day would be", () => {
  clear();
  set({ TODAY_DATA: busy(), __CALENDAR: calendar([8, 9, 10, 11, 13, 14, 17].map((h) => block(`b${h}`, h, `Slot ${h}`))), __PLAYBOOKS: { rows: [] } });
  const tree = draw(W.TodayDay);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "today-day-item").length, 5);
  const more = byTestId(tree, "today-day-more");
  assert.equal(textOf(more).trim(), "2 more on the Calendar");
  press(more);
  assert.equal(went.at(-1), "calendar");
  set({ __CALENDAR: undefined });
  failed.add("calendar");
  const broke = draw(W.TodayDay);
  assert.ok(byTestId(broke, "today-day-failed"));
  assert.match(textOf(broke), /Couldn't read the calendar/);
  failed.clear();
  assert.equal(draw(W.TodayDay).rendered, null, "not read yet: the Calendar page's card says why");
});

/* ------------------------------------ worth a look ------------------------------------ */

test("worth a look: a word and an icon for the tone, who is waiting, Ask why with the row's own facts, the doors, and the count past the cap", () => {
  clear();
  const vm = busy();
  set({ TODAY_DATA: vm, __REPORTS: reports(), __PEOPLE: people() });
  const tree = draw(W.TodayLeaks);
  const band = byTestId(tree, "today-leaks");
  const { rows, moreLine } = todayLeaks(reports(), people(), vm.noReply);
  assert.equal(rows.length, 2);
  for (const l of rows) {
    const row = byTestId(band, `today-leak-${l.id}`);
    assert.ok(row, l.id);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-tag"))), l.tag);
    assert.equal(find(row, (n) => n.type === "Icon").props.name, l.icon);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-text"))), l.text);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-math"))), l.math);
    press(byTestId(row, `today-leak-ask-${l.id}`));
    assert.deepEqual(asked.at(-1), { prompt: l.ask });
    assert.ok(buttons(row, l.cta.label).length === 1);
  }
  assert.equal(rows[0].id, "never-booked");
  assert.equal(rows[1].id, "unanswered");
  const waiting = all(byTestId(band, "today-leak-unanswered"), (n) => classes(n).includes("tl-person"));
  assert.deepEqual(waiting.map(textOf), ["Dulce Amaro"], "who is waiting with nothing back, from the threads the page holds");
  assert.equal(textOf(find(byTestId(band, "today-leak-unanswered"), (n) => classes(n).includes("tl-people-lead"))), "Waiting now", "named as waiting now, never as the count's own subjects: the count is Reports' over its period");
  press(waiting[0]);
  assert.equal(went.at(-1), "inbox/th-cv-d");
  assert.equal(textOf(byTestId(band, "today-leaks-more")).trim(), moreLine);
  assert.equal(moreLine, "and 1 more", "the reach row qualified too; the cap is two");
  set({ __REPORTS: { ...reports(), vm: { ...reports().vm, answered: { totals: { in: 23, ai: 23, you: 0, none: 0 } } }, booking: { present: true, headline: "17 of 18 booked", sub: "", pct: 94, asked: 18, booked: 17 } }, __PEOPLE: { ...people(), lists: [list("quiet", "Quiet 30+ days", 1, null)] } });
  assert.equal(draw(W.TodayLeaks).rendered, null, "a workspace with nothing wrong gets no band at all");
  set({ __REPORTS: undefined, __PEOPLE: people() });
  failed.add("reports");
  assert.match(textOf(byTestId(draw(W.TodayLeaks), "today-leaks-failed")), /Couldn't read Reports/);
  failed.clear();
  set({ __REPORTS: reports(), __PEOPLE: undefined });
  failed.add("people");
  assert.match(textOf(byTestId(draw(W.TodayLeaks), "today-leaks-failed")), /Couldn't read People/);
  failed.clear();
  assert.equal(draw(W.TodayLeaks).rendered, null, "not read yet is not failed");
});

/* ------------------------------------ while you were away ------------------------------------ */

test("while you were away: drawn wherever the bell is, deduped over every queue kind, the head the bell's own number", () => {
  clear();
  const vm = busy();
  const rows = [
    bellRow("needs:th-cv-a", "needs_you", "Ana Reyes needs you", "warn"),
    bellRow("call:k3", "missed_call", "Missed call · +1 (347) 555-0188", "warn", null, "conversations/cv-k3"),
    bellRow("n:1", "review", "1 new rating on Google", "ok"),
  ];
  const api = { feed: () => rows, onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {}, unread: () => unreadCount(rows) };
  set({ TODAY_DATA: vm, __notifs: api });
  W.__DEMO_MODE = true;
  const tree = draw(W.TodayAway);
  assert.ok(byTestId(tree, "today-away"), "the mockup's sample publishes a bell too: the card no longer hides in a demo");
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "today-away-row").map((n) => textOf(find(n, (m) => classes(m).includes("ta-title")))), ["1 new rating on Google"], "the handoff's row and the missed call are the queue's");
  assert.equal(textOf(find(tree, (n) => classes(n).includes("tq-count"))).trim(), "3", "the bell's own number");
  assert.match(textOf(find(tree, (n) => classes(n).includes("tq-foot"))), /2 more in the bell, already in the queue above/);
  assert.ok(buttons(tree, "Mark all read").length === 1);
  W.__DEMO_MODE = false;
});

/* ------------------------------------ the composition ------------------------------------ */

test("the page is three bands and nothing seeded: the standing line, the queue with the day, the card, worth a look with away", () => {
  clear();
  set({ TODAY_DATA: busy(), __REPORTS: reports(), __PEOPLE: people(), __BROADCASTS: broadcasts(), __CALENDAR: calendar([block("b9", 9, "Gloss")]), __PLAYBOOKS: { rows: [] }, __notifs: { feed: () => [], onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {}, unread: () => 0 } });
  W.__DEMO_MODE = true;
  const tree = draw(W.DashboardA);
  const order = ["today-standing", "today-queue", "today-day", "today-card", "today-leaks", "today-away"].map((id) => byTestId(tree, id));
  assert.ok(order.every(Boolean), "every band");
  const names = all(tree, (n) => typeof n.type === "function").map((n) => n.type.name);
  for (const seeded of ["NowPlayingRail", "TrustReview", "SegmentPulse", "AgentFleet", "AmbientDock", "HeroBriefSeed", "AgentCommandSeed", "TodayPulse", "TodayJourney", "PulseArc", "BriefBeats"]) assert.ok(!names.includes(seeded), `${seeded} is gone from Today`);
  const core = find(tree, (n) => classes(n).includes("dash-a-v2-core"));
  assert.deepEqual(core.props.children.filter((c) => c && typeof c.type === "function").map((c) => c.type.name), ["AgentCommand", "TodayDay"]);
  const foot = find(tree, (n) => classes(n).includes("dash-a-v2-foot"));
  assert.deepEqual(foot.props.children.filter((c) => c && typeof c.type === "function").map((c) => c.type.name), ["TodayLeaks", "TodayAway"]);
  assert.equal(buttons(byTestId(tree, "today-card"), "Open Reports").length, 1, "the card's one door to Reports (Worth a look's unanswered row keeps its own, to the tile that prints the figure)");
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "today-recap").length, 1, "the not-numbers live in one place");
  W.__DEMO_MODE = false;
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs
```
Expected: FAIL from the first test (`today-standing-dot` absent; `TodayCard` undefined).

### Task B4: The standing line and the day's card (`dashboard-a-brief.jsx`)

**Files:**
- Rewrite: `apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx`

- [ ] **Step 1: Replace the whole file with**

```jsx
/* global React, Icon, FailedRead */
// Today's first band and its third: the standing line above the work, and the day's own card under it.
//
// The standing line says the day and the time the business keeps, and whether its lines are up: one line, where a
// hero with a greeting, a headline the queue says again, four sentences, a chip repeating the queue's count, an arc
// and six stat cards used to stand (on a phone the first thing that needed a person started 679px down).
//
// The card is about the day: four figures from the view model, each with the clause under it and the why behind it
// on hover, focus or a tap, with one door; then the lines that are not numbers (a reply that never reached anyone,
// what Setup still wants, a review that landed, what ran, the receipts); then the last seven days in one line with the
// one door to Reports on the page. Every sentence with a number is contracts' (toTodayVM, todayPeriodLine,
// todayRunWords); this file draws them. A borrowed read that failed says so where its line would be (FailedRead).
const useTcTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

// A playbook's run or a broadcast that went out today, with what it has earned so far. The runs that wait for a word,
// and the ones under a Stop, are rows of the queue (dashboard-a-command.jsx). Today, and the time it went, are the
// business's (window.__clock), not the browser's; the counts are contracts' words (todayRunWords).
const RunsDone = ({ nav }) => {
  useTcTick("surface:broadcasts");
  const all = (window.__BROADCASTS && window.__BROADCASTS.rows) || [];
  const C = window.__clock;
  const done = all.filter((r) => (r.state === "sent" || r.state === "sending") && r.started_at && C.dayKey(Date.parse(r.started_at)) === C.dayKey(Date.now())).slice(0, 2);
  const timeOf = (iso) => C.time(Date.parse(iso));
  return done.map((r) => {
    const w = window.__today.runs(r).done;
    return (
      <div key={`run-${r.id}`} className="brief-beat" data-testid="brief-run-done">
        <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
        <span className="brief-beat-text">
          <b>{r.playbook_id ? r.audience.label : r.name}</b> {r.playbook_id ? "ran" : "went out"} at {timeOf(r.started_at)}: {w.counts}{w.still ? " · still sending" : ""}
        </span>
        <button className="brief-chip" onClick={() => nav(`broadcasts/run:${r.id}`)}>Open <Icon name="arrow-right" size={10} /></button>
      </div>
    );
  });
};

// Setup's one line while something on the Setup page is open: the count and the next verb, from the Setup surface
// (contracts/setup.ts). Rows the owner put off for later are not counted. Gone the moment everything is ready.
const SetupLine = ({ nav }) => {
  useTcTick("surface:setup");
  const S = window.__SETUP;
  if (!S || !S.vm.line) return null;
  return (
    <div className="brief-beat" data-testid="brief-setup">
      {/* Not answering yet is a warning, not live state: never the coral accent. */}
      <span className="brief-beat-dot" style={S.vm.readiness.answering ? undefined : { background: "var(--warn)" }} />
      <span className="brief-beat-text">{S.vm.line}</span>
      <button className="brief-chip" onClick={() => nav("admin/setup")}>Open Setup <Icon name="arrow-right" size={10} /></button>
    </div>
  );
};

// A review on Google, the morning it lands: first seen in the last day and a half, written recently, not part of the
// first read (contracts/google.ts reviewIsNew). From the Google surface, which boots with the rest. Gone once it is
// old news.
const ReviewLine = ({ nav }) => {
  useTcTick("surface:google");
  const G = window.__GOOGLE;
  if (!G || !G.dto.listing || !window.__google) return null;
  const line = window.__google.vm(G.dto, 30).todayLine;
  if (!line) return null;
  return (
    <div className="brief-beat" data-testid="brief-review">
      <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
      <span className="brief-beat-text">{line.text}</span>
      <button className="brief-chip" onClick={() => nav(line.to)}>Open Reports <Icon name="arrow-right" size={10} /></button>
    </div>
  );
};

// The standing line: the day and the time the business keeps, and whether its lines are up. One line, above the work.
const TodayStanding = ({ vm }) => {
  const { standing } = vm;
  return (
    <header className="today-standing" data-testid="today-standing">
      <span>{standing.eyebrow}</span>
      {/* Counted in contracts: this page counted its own chips, and the chips are the routing rows, so an email line
          was never in the total. The dot is this line's own: quiet when every line is up, red with a ring when one is
          down; the coral live-dot is the agent's live state, never a status light. */}
      <span className="today-standing-lines">
        <span className={`today-standing-dot${standing.lines.down ? " down" : ""}`} aria-hidden="true" />
        {standing.lines.text}
      </span>
      {/* A line that is down is the one thing here that cannot wait for the card under the work. */}
      {standing.alert && <span className="today-standing-alert">{standing.alert}</span>}
    </header>
  );
};

const HeroBrief = () => {
  useTcTick("surface:today");
  return window.TODAY_DATA ? <TodayStanding vm={window.TODAY_DATA} /> : null;
};

// One figure: the number, its word and the clause under it. With a receipt it is a button: hover opens the receipt,
// Enter or Space and a tap toggle it, Escape closes it. The receipt itself is drawn by the card as the last child of
// the row of figures (TodayReceipt), so a desktop anchors it under this figure by index and a phone lays it under the
// row. A figure with nothing to add is not a button.
const TodayFigure = ({ f, i, open, setOpen }) => {
  const has = !!f.receipt;
  const on = has && open === f.id;
  const body = (
    <>
      <span className="tc-fig-n tabular">{f.value}</span>
      <span className="tc-fig-w">{f.label}</span>
      <span className="tc-fig-m">{f.meta}</span>
    </>
  );
  return (
    <div className={`tc-fig${on ? " open" : ""}`} onMouseEnter={has ? () => setOpen(f.id) : undefined} data-testid={`today-figure-${f.id}`} data-i={i}>
      {has ? (
        <button
          type="button"
          className="tc-fig-btn"
          aria-expanded={on}
          aria-controls={on ? `today-receipt-${f.id}` : undefined}
          onClick={() => setOpen(on ? null : f.id)}
          onFocus={() => setOpen(f.id)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); }}
        >
          {body}
        </button>
      ) : (
        <div className="tc-fig-btn">{body}</div>
      )}
    </div>
  );
};

// The open figure's receipt: its why and one door. Under its figure on a desktop (`--i` places it), under the row on
// a phone (dashboard-a-v2.css .tc-receipt). It adds to the figure and never repeats its number: contracts proves that,
// so nothing an owner needs lives only behind a hover.
const TodayReceipt = ({ f, i, last, nav }) => (
  <div className="tc-receipt" role="dialog" id={`today-receipt-${f.id}`} aria-label={`Why ${f.value} ${f.label}`} style={{ "--i": i }} data-last={last ? "true" : undefined} data-testid={`today-receipt-${f.id}`}>
    <p className="tc-receipt-t">{f.receipt.text}</p>
    {f.receipt.door && (
      <button type="button" className="tc-receipt-door" onClick={() => nav(f.receipt.door.to)}>
        {f.receipt.door.label} <Icon name="arrow-right" size={10} />
      </button>
    )}
  </div>
);

const TodayCard = () => {
  useTcTick("surface:today,surface:reports");
  const [open, setOpen] = React.useState(null);
  const vm = window.TODAY_DATA;
  if (!vm) return null;
  const { recap, quiet, figures } = vm;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const R = window.__REPORTS;
  const period = R && window.__today ? window.__today.periodLine(R) : null;
  // Not read yet is not failed: the foot is silent while Reports loads and says so when its read failed.
  const reportsFailed = !R && !!(window.__surfaceFailed && window.__surfaceFailed("reports"));
  return (
    <section className="today-card" data-testid="today-card" aria-labelledby="today-card-title">
      <div className="tc-head">
        <h2 className="tc-title" id="today-card-title">{recap ? recap.label : "Today so far"}</h2>
        {/* No figures to hang the proof on (a quiet day, or no traffic while an escalation waits, which is the
            reference workspace's own state): nothing came in, and the proof the lines are listening. On a day with
            traffic the proof is the messages figure's clause. */}
        {!figures && <span className="tc-line" data-testid="today-quiet-line">{quiet ? quiet.headline : recap ? recap.line : "Nothing has come in yet today."} {vm.proof}</span>}
      </div>
      {/* The row of figures owns the open receipt: leaving the row closes it (the receipt is inside the row, so moving
          onto it does not), and so does focus leaving the row. */}
      {figures && (
        <div
          className="tc-figs"
          data-testid="today-figures"
          onMouseLeave={() => setOpen(null)}
          onBlur={(e) => { if (e.relatedTarget && e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(null); }}
        >
          {figures.map((f, i) => <TodayFigure key={f.id} f={f} i={i} open={open} setOpen={setOpen} />)}
          {figures.map((f, i) => (open === f.id && f.receipt ? <TodayReceipt key={`r-${f.id}`} f={f} i={i} last={i === figures.length - 1} nav={nav} /> : null))}
        </div>
      )}
      {/* The lines that are not numbers. thread.spec reads a failed reply here by this testid and .brief-beat. */}
      <div className="brief-beats tc-beats" data-testid="today-recap">
        {quiet && (vm.standing.chips.length > 0 || quiet.launchpad) && (
          <div className="brief-beat" data-testid="brief-quiet-proof">
            <span className="brief-beat-dot" />
            <span className="brief-beat-text">
              {quiet.proof.filter((pr) => pr.label !== "Checked").map((pr) => `${pr.label}: ${pr.value}`).join(" · ")}
            </span>
            {quiet.launchpad && <button className="brief-chip" onClick={() => nav(quiet.launchpad.to)}>{quiet.launchpad.label}</button>}
          </div>
        )}
        <SetupLine nav={nav} />
        <ReviewLine nav={nav} />
        {/* Everything the figures do not carry, crucially a reply that failed to deliver: the one line that must never be quiet. */}
        {(recap ? recap.sentences : []).filter((sn) => !sn.traffic).map((sn, i) => (
          <div key={`sn-${i}`} className="brief-beat">
            <span className="brief-beat-dot" style={sn.warn ? { background: "var(--danger)" } : undefined} />
            <span className="brief-beat-text" style={sn.warn ? { color: "var(--danger)" } : undefined}>{sn.text}</span>
            {sn.warn && (
              <button className="brief-chip" onClick={() => nav(sn.to || "inbox")}>See the thread <Icon name="arrow-right" size={10} /></button>
            )}
          </div>
        ))}
        <RunsDone nav={nav} />
        {vm.callsRead === false && <FailedRead kind="line" what="the phone line's calls" body="The day's other numbers are current." surface="today" testid="brief-calls-failed" />}
        {(recap ? recap.receipts : []).map((r, i) => (
          <div key={i} className="brief-beat" data-testid="brief-receipt">
            <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
            <span className="brief-beat-text">{r.at}: {r.text}</span>
            <button className="brief-chip" onClick={() => nav(r.to)}>Open <Icon name="arrow-right" size={10} /></button>
          </div>
        ))}
      </div>
      {(period || reportsFailed) && (
        <div className="tc-foot">
          {period ? (
            <>
              <span className="tc-foot-text" data-testid="today-period">{period.text}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => nav(period.to)}>Open Reports <Icon name="arrow-right" size={11} /></button>
            </>
          ) : (
            <FailedRead kind="line" what="Reports" body="The day's own numbers above are current." surface="reports" testid="today-period-failed" />
          )}
        </div>
      )}
    </section>
  );
};

Object.assign(window, { HeroBrief, TodayCard });
```

  Pins this file keeps for suites outside Today: `<SetupLine nav={nav} />`, `data-testid="brief-setup"` (setup.test), `<ReviewLine nav={nav} />`, `data-testid="brief-review"` (google.test), `data-testid="brief-run-done"`, `{r.playbook_id ? "ran" : "went out"}` (playbooks.test), `standing.lines.text` (metrics-truth), `<RunsDone nav={nav} />` (today-queue), no `"Queue clear — nothing needs you"` (standing.test), no `dayLine` (today-day, B2).

- [ ] **Step 2: Run the page test's card tests**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs
```
Expected: the standing-line and the five card tests PASS; the queue, day, leaks, away and composition tests still FAIL (B5 to B8).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx tooling/scripts/tests/today-page.test.mjs
git commit -m "Today: the standing line with its own dot, and the day's card: four figures with their receipts, the not-numbers, the period in one line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B5: The queue (`dashboard-a-command.jsx`)

**Files:**
- Rewrite: `apps/dashboard/src/legacy/pages/dashboard-a-command.jsx`

- [ ] **Step 1: Replace the whole file with**

```jsx
/* global React, Icon, EmptyState, FailedRead */
// Today's queue: everything that asks for a person, in one row grammar (attention-bits.jsx AttnRow), the longest
// wait first: WhatsApp handoffs, callers who need a call back, reply windows closing, calls worth an ear (contracts
// today.ts queue), and the playbook runs that wait for a word or sit under a Stop (the broadcasts surface). A call in
// progress rides above the list while it lasts. The first row carries the page's one primary verb; the rest wear
// theirs quietly. Every sentence with a number is contracts' (todayRunWords, todayRunsSub, todayRunApproved).
//
// It was Agent Command: a seeded bar with Now/Soon buckets, an insight line, decision rows with Approve/Decline, and
// a count badge over a list that already says its count. The seed left with the mockup's stand-in: the mockup draws
// this page from its sample (legacy-bridge/today-sample.ts).
const useSurfaceTick = (name) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(name, bump);
    return () => window.removeEventListener(name, bump);
  }, [name]);
};

const AgentCommand = () => {
  useSurfaceTick("surface:today");
  return window.TODAY_DATA ? <TodayQueue vm={window.TODAY_DATA} /> : null;
};

const tqClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const LiveRail = ({ nav }) => {
  useSurfaceTick("surface:live");
  const [nowMs, setNowMs] = React.useState(Date.now());
  const L = window.__LIVE;
  // The heartbeat rule, re-applied between refreshes, the way the Live page does.
  const live = L ? L.now.filter((c) => nowMs - (c.heartbeatAtMs || c.startedAtMs || 0) < L.heartbeatMs) : [];
  const count = live.length;
  React.useEffect(() => {
    if (!count) return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [count]);
  if (!count) return null;
  return live.map((c) => {
    const last = [...c.transcript].reverse().find((t) => t.speaker !== "whisper");
    const elapsed = Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
    return (
      <div key={c.callId} className="tq-live" data-testid="brief-live-call">
        <span className="live-dot" />
        <span className="tq-live-text">
          <b>{c.who}</b> is on the line · {tqClock(elapsed)}
          {last ? <span className="tq-live-last"> · {last.speaker === "client" ? c.whoShort : "Receptionist"}: &ldquo;{last.text.slice(0, 90)}&rdquo;</span> : null}
        </span>
        {/* The call's own door (live/<callId>): Live's list opens on the oldest call, which may not be this one. */}
        <button className="cl-attn-cta primary" onClick={() => nav(`live/${c.callId}`)}>Open Live</button>
      </div>
    );
  });
};

// A playbook's run that waits for a person, or one under the veto window (scheduled, not yet sending) as rows of the
// same grammar, with Approve or Stop where the button goes. What already went out is a line of the day's card. The
// page keeps deciding WHICH rows wait or are scheduled; the words are contracts' (todayRunWords).
const runRows = (nav, flash, verbKind) => {
  const all = (window.__BROADCASTS && window.__BROADCASTS.rows) || [];
  const waiting = all.filter((r) => r.state === "pending_approval");
  const soon = all.filter((r) => r.state === "scheduled" && r.playbook_id && Date.parse(r.scheduled_for) > Date.now());
  const words = (r) => window.__today.runs(r);
  const can = window.canDo && window.canDo("approve");
  const stop = async (r) => {
    if (!can || !window.__broadcasts) return;
    const res = await window.__broadcasts.cancel(r.id);
    if (res.ok && window.__refreshPlaybooks) window.__refreshPlaybooks();
    flash(res.ok ? { msg: <><b>{r.audience.label}</b> stopped: nothing sends</> } : window.refusalToast(res, "Not stopped"));
  };
  const approve = async (r) => {
    if (!can || !window.__broadcasts) return;
    const res = await window.__broadcasts.approve(r.id);
    if (res.ok && window.__refreshPlaybooks) window.__refreshPlaybooks();
    const n = res.ok ? (res.data.recipient_count || r.recipient_count) : 0;
    // When it really goes (broadcasts-real.jsx bcWhenWords): the server moves a send outside 9:00-20:59 to nine.
    const when = res.ok && window.bcWhenWords ? window.bcWhenWords(res.data) : "sending now";
    const t = window.__today.runApproved(r.audience.label, n, when);
    flash(res.ok ? { msg: <><b>{t.lead}</b> {t.rest}</> } : window.refusalToast(res, "Not approved"));
  };
  // Each row opens its own run (broadcasts/run:<id>): who is on it, and what it has done so far.
  return [
    ...waiting.map((r) => (
      <window.AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta="Playbook · ready"
        sentence={words(r).waiting.sentence}
        status={words(r).waiting.status}
        tone="escalated"
        cta={{ label: "Approve", kind: verbKind(), onClick: () => approve(r), gate: window.gate("approve", "approve a run") }}
        also={{ label: "See who's on it", onClick: () => nav(`broadcasts/run:${r.id}`) }}
        onOpen={() => nav(`broadcasts/run:${r.id}`)}
        testid="brief-run-row"
      />
    )),
    ...soon.map((r) => (
      <window.AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta={words(r).soon.meta}
        sentence={words(r).soon.sentence}
        status={words(r).soon.status}
        tone="warn"
        cta={{ label: "Open", kind: verbKind(), onClick: () => nav(`broadcasts/run:${r.id}`) }}
        also={{ label: "Stop", onClick: () => stop(r), gate: window.gate("approve", "stop a run") }}
        onOpen={() => nav(`broadcasts/run:${r.id}`)}
        testid="brief-run-soon"
      />
    )),
  ];
};

const TodayQueue = ({ vm }) => {
  useSurfaceTick("surface:broadcasts");
  const [toastNode, ppFlash] = window.usePPToast();
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const verb = async (r, which) => {
    if (!(window.canDo && window.canDo("approve"))) return;
    const res = await window.__inboxVerb(
      { conversationId: r.also.conversationId, escalationId: r.also.escalationId, who: r.who },
      which, {},
    );
    ppFlash(res.ok
      ? { msg: which === "snooze" ? <><b>{r.who}</b> snoozed: hidden until they wake or reply</> : <><b>{r.who}</b>: done, the receptionist has the thread back</> }
      : window.refusalToast(res, which === "snooze" ? "Not snoozed" : "Not resolved"));
  };
  const rows = vm.queue.rows;
  // One primary verb on the page: the first row's. Every other verb is drawn, quietly.
  let primaryLeft = true;
  const verbKind = () => { const k = primaryLeft ? "primary" : "ghost"; primaryLeft = false; return k; };
  const drawn = rows.map((r) => (
    <window.AttnRow
      key={r.id}
      initials={r.initials}
      glyph={r.channel === "Phone" && /^[+\d(]/.test(r.who) ? "phone" : null}
      name={r.who}
      meta={`${r.channel} · ${r.when}`}
      sentence={r.sentence}
      quoted={r.quoted}
      status={r.status}
      tone={r.tone}
      cta={{ label: r.cta.label, kind: verbKind(), onClick: () => nav(r.cta.to) }}
      also={r.also ? { label: r.also.label, onClick: () => verb(r, r.also.verb), gate: window.gate("approve", r.also.verb === "snooze" ? "snooze a conversation" : "resolve a conversation"), testid: `queue-${r.also.verb}` } : null}
      onOpen={() => nav(r.cta.to)}
      testid={`queue-${r.kind}`}
    />
  ));
  const runs = runRows(nav, ppFlash, verbKind);
  const total = rows.length + runs.length + vm.queue.more;
  return (
    <section className="tq" data-testid="today-queue">
      {/* No count over the rows: the sentence says what they hold, and the rows are right under it. */}
      <div className="tq-head">
        <span className="tq-title">Your queue</span>
        <span className="tq-sub">
          {[...vm.queue.parts, window.__today.runsSub(runs.length)].filter(Boolean).join(" · ") || vm.queue.empty.sub}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => nav("inbox")}>Open Inbox <Icon name="arrow-right" size={11} /></button>
      </div>
      <LiveRail nav={nav} />
      <div className="tq-list">
        {drawn}
        {runs}
        {/* The broadcasts read failed: the rows above stand, and the runs that may be waiting are said to be unread. */}
        {!window.__BROADCASTS && window.__surfaceFailed && window.__surfaceFailed("broadcasts") && (
          <FailedRead kind="line" className="tq-failed" what="the playbook runs" body="The rows above are current." surface="broadcasts" testid="today-runs-failed" />
        )}
        {/* What an empty queue means is a sentence about the wires, so contracts says it: a dark line, no line, a line
            the receptionist does not answer (email), or the receptionist holding the floor. */}
        {total === 0 && (
          <EmptyState
            kind="line"
            glyph={vm.queue.empty.glyph}
            tone={vm.queue.empty.tone || undefined}
            title={vm.queue.empty.title}
            testid={vm.queue.empty.testid}
          />
        )}
      </div>
      {vm.queue.more > 0 && (
        <div className="tq-foot">
          <span>{vm.queue.more} more in the Inbox</span>
          <button className="cl-attn-cta ghost" onClick={() => nav("inbox")}>See all</button>
        </div>
      )}
      {toastNode}
    </section>
  );
};

window.AgentCommand = AgentCommand;
```

  Pins kept for suites outside Today: `<span className="tq-title">Your queue</span>`, `vm.queue.parts` (standing.test); `testid="brief-run-row"`, `r.state === "pending_approval"` (playbooks.test); `testid="brief-run-soon"`, `Date.parse(r.scheduled_for) > Date.now()` (starter-templates); `data-testid="today-queue"`, `<TodayQueue vm={window.TODAY_DATA} />`, `vm.queue.rows`, `data-testid="brief-live-call"`, `surface:live`, `surface:broadcasts`, `verb(r, r.also.verb)`, `<LiveRail nav={nav} />` before `{rows.map(` (today-queue, today-calls-strip: note the rows are drawn as `drawn` now; Task B9 moves that one pin to `rows.map((r) => (`), `nav(\`live/${c.callId}\`)`. The refusal words (`Not snoozed`, `Not approved`, `Not stopped`) are `refusalToast`'s (refusals-on-the-page).

  `{vm.queue.more} more in the Inbox` stays as it was: it is contracts' number in the page's four words, and the spec's deletions table does not name it; leave it.

- [ ] **Step 2: Run**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs
```
Expected: the queue test PASSES too. (`gate-reason`, `refusals-on-the-page`, `runs-honest`, `today-doors` and `the-pages-say` still fail: their harnesses have no `__today`; Task B9.)

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/pages/dashboard-a-command.jsx
git commit -m "Today's queue: no count over the rows, one primary verb, the runs' words from contracts; Agent Command's seed is gone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B6: The day (`dashboard-a-day.jsx`): the cap's tail and a failed read

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/dashboard-a-day.jsx`

- [ ] **Step 1: Three edits.**

  (a) The first line becomes `/* global React, Icon, FailedRead */`, and the header comment gains, after "nothing is booked or changed from here.": ` Five rows at most, the rest a line to the Calendar (contracts TODAY_DAY_MAX); a calendar read that failed says so where the day would be.`

  (b) Between `const P = window.__PLAYBOOKS;` and the guard `if (!C || !C.vm || C.vm.feed.state !== "ok" || !window.__today) return null;` insert (the guard's text stays byte for byte: calendar.test pins it):

```jsx
  // The read failed, and the module would otherwise be silent about it: FailedRead, with the one Retry, where the day goes.
  if (!C && window.__surfaceFailed && window.__surfaceFailed("calendar")) {
    return (
      <section className="td-day" data-testid="today-day-failed">
        <FailedRead kind="card" what="the calendar" body="The queue and the day's numbers are current." surface="calendar" testid="today-day-failed-read" />
      </section>
    );
  }
```

  (c) After the `{d.open.length > 0 && (...)}` block inside the frame, before the frame's closing `</div>`, insert:

```jsx
          {d.more > 0 && (
            <button className="td-day-more" onClick={() => nav("calendar")} data-testid="today-day-more">
              <span>{d.moreLine}</span>
              <Icon name="arrow-right" size={10} />
            </button>
          )}
```

- [ ] **Step 2: Run**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs tooling/scripts/tests/today-day.test.mjs tooling/scripts/tests/calendar-honest.test.mjs tooling/scripts/tests/calendar.test.mjs
```
Expected: the page test's day test PASSES; today-day's wiring test still fails on the CSS pin `.td-day-more` only if you added one (you did not; it passes); calendar suites PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/pages/dashboard-a-day.jsx
git commit -m "Today's day: five rows and a line to the Calendar; a failed calendar read says so

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B7: Worth a look and While you were away (`dashboard-a-week.jsx`)

**Files:**
- Rewrite: `apps/dashboard/src/legacy/pages/dashboard-a-week.jsx`

- [ ] **Step 1: Replace the whole file with**

```jsx
/* global React, Icon, FailedRead */
// Below the day's card: the few things worth a look that no row above says on its own, and what happened while the
// owner was away. Each reads a surface the page already holds (Reports, People, the bell) and the words are
// contracts/today.ts todayLeaks / todayAwayGrouped through window.__today. Nothing is computed on the page; every
// number here is the same number on the page it links to. The period card and the journey that stood here are gone:
// the period is one line at the foot of the day's card, and the reach list's one fact is a row below.
const useTwTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

const twNav = (to) => window.appNavigate && window.appNavigate(to);
const twFailed = (key) => !!(window.__surfaceFailed && window.__surfaceFailed(key));

// Worth a look: two pages read together.
//
// "18 wrote or called" lives on Reports and "17 asked, never booked" lives on People, and neither page can say they
// are the same eighteen people. This band is the only place on Today that puts two numbers beside each other, and
// it prints the arithmetic under every sentence so nobody has to take it on faith. Each row wears a word and an icon
// for its tone (never colour alone), names who is waiting where the page holds them, and offers Ask its own facts:
// "Ask why" asks the row's sentence, so Ask grounds the answer in what it can read. It is gone entirely on a
// workspace with nothing wrong: there is no congratulation state. A third problem is a line, never silence.
const TodayLeaks = () => {
  useTwTick("surface:reports,surface:clients,surface:today");
  const R = window.__REPORTS;
  const P = window.__PEOPLE;
  const T = window.TODAY_DATA;
  if (!window.__today) return null;
  const broke = (!R && twFailed("reports")) ? ["Reports", "reports"] : (!P && twFailed("people")) ? ["People", "people"] : null;
  if (broke) {
    return (
      <section className="tsec tl" data-testid="today-leaks">
        <div className="tsec-head"><span className="tsec-title">Worth a look</span></div>
        <FailedRead kind="line" className="tl-failed" what={broke[0]} body="The queue and the day's card are current." surface={broke[1]} testid="today-leaks-failed" />
      </section>
    );
  }
  if (!R || !P) return null;
  const { rows, moreLine } = window.__today.leaks(R, P, T ? T.noReply : []);
  if (!rows.length) return null;
  return (
    <section className="tsec tl" data-testid="today-leaks">
      <div className="tsec-head">
        <span className="tsec-title">Worth a look</span>
        <span className="tsec-sub">from Reports and People, read together</span>
      </div>
      <div className="tl-list">
        {rows.map((l) => (
          <div key={l.id} className={`tl-row tl-${l.tone}`} data-testid={`today-leak-${l.id}`}>
            <span className={`tl-glyph tl-${l.tone}`} aria-hidden="true"><Icon name={l.icon} size={13} /></span>
            <span className="tl-body">
              <span className="tl-tag">{l.tag}</span>
              <span className="tl-text">{l.text}</span>
              <span className="tl-math tabular">{l.math}</span>
              {/* Who is waiting right now, from the threads Today holds: not the count's own subjects (the count is Reports' over
                  its period), so the lead says so and the names are never drawn as the people the sentence counts. */}
              {l.people.length > 0 && (
                <span className="tl-people">
                  <span className="tl-people-lead">Waiting now</span>
                  {l.people.map((p) => <button key={p.id} type="button" className="tl-person" onClick={() => twNav(p.to)} title={`Open ${p.name}'s thread`}>{p.name}</button>)}
                </span>
              )}
            </span>
            <span className="tl-acts">
              <button className="btn btn-sm btn-ghost" onClick={() => window.askAbout && window.askAbout({ prompt: l.ask })} data-testid={`today-leak-ask-${l.id}`}>Ask why</button>
              {l.also && <button className="btn btn-sm btn-ghost" onClick={() => twNav(l.also.to)}>{l.also.label}</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => twNav(l.cta.to)}>{l.cta.label} <Icon name="arrow-right" size={11} /></button>
            </span>
          </div>
        ))}
      </div>
      {moreLine && <div className="tsec-note" data-testid="today-leaks-more">{moreLine}</div>}
    </section>
  );
};

// What happened while the owner was away: the bell's unread rows, as Today reads them.
//
// It showed the newest five, which on a real workspace was five identical "No conversation happened" cards from one
// number, while a WhatsApp quality downgrade and three failed jobs sat under the cap, and the three conversations at
// the top of this very page were said again here. A row about anything the queue above holds (a handoff's thread, a
// call-back's call, a closing window's thread, a call worth a listen) is dropped, like rows group and say how many,
// and a warning never sorts below good news.
//
// The head is the bell's own number, so the two badges on this screen never disagree, and the foot accounts for
// every unread row that is not drawn, including the ones the queue above already holds. Both sentences come from
// contracts; this file draws them. It draws wherever a bell is published: the mockup's sample publishes one too.
const TodayAway = () => {
  const api = window.__notifs || null;
  const [rows, setRows] = React.useState(() => (api ? api.feed() : []));
  React.useEffect(() => {
    if (!api) return undefined;
    const refresh = () => setRows(api.feed());
    refresh();
    return api.onChange(refresh);
  }, [api]);
  if (!api || !window.__today) return null;
  const T = window.TODAY_DATA;
  // What each queue row is about: its thread, its call, or both (contracts AwayQueueRef).
  const inQueue = T ? T.queue.rows.map((r) => ({ conversationId: r.conversationId, callId: r.callId })) : [];
  const { groups, total, foot, empty } = window.__today.awayGrouped(rows, inQueue, 5);
  // A group is read and dismissed whole: its rows say one thing, so they go together.
  const open = (g, to) => { g.ids.forEach((id) => api.read(id)); twNav(to); };
  const drop = (g) => g.ids.forEach((id) => api.dismiss(id));
  return (
    <section className="tsec ta" data-testid="today-away">
      <div className="tsec-head">
        <span className="tsec-title">While you were away</span>
        <span className={`tq-count ${total ? "" : "calm"}`}>{total}</span>
        {total > 0 && <button className="btn btn-ghost btn-sm" onClick={() => api.seenAll()}>Mark all read</button>}
      </div>
      {empty ? (
        <div className="tq-empty" data-testid="today-away-empty"><Icon name={empty.icon} size={14} /> {empty.text}</div>
      ) : (
        <div className="ta-list">
          {groups.map((g) => {
            const n = g.row;
            const act = n.actions && n.actions[0];
            return (
              <div key={n.id} className={`ta-row ${n.tone}`} data-testid="today-away-row" data-count={g.count}>
                <span className={`tbn-icon ${n.tone}`}><Icon name={n.icon} size={13} /></span>
                <button className="ta-main" onClick={() => act && open(g, act.to)} title={act ? act.label : undefined}>
                  <span className="ta-line1">
                    <span className="ta-title">{g.title || n.title}</span>
                    <span className="ta-time tabular">{n.time}</span>
                  </span>
                  <span className="ta-msg">{g.count > 1 ? `newest: ${n.title}` : n.message}</span>
                </button>
                <button className="ta-x" onClick={() => drop(g)} title={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"} aria-label={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {foot && <div className="tq-foot"><span>{foot}</span></div>}
    </section>
  );
};

Object.assign(window, { TodayLeaks, TodayAway });
```

- [ ] **Step 2: Run**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs tooling/scripts/tests/today-away-page.test.mjs
```
Expected: the leaks and away tests PASS; the composition test still fails (B8).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/pages/dashboard-a-week.jsx
git commit -m "Worth a look with a word for its tone, who is waiting and an Ask door; While you were away deduped over every queue kind, drawn wherever a bell is

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B8: The composition, the stylesheet, the phone, the cache keys

**Files:**
- Rewrite: `apps/dashboard/src/legacy/pages/dashboard-a.jsx`
- Modify: `apps/dashboard/src/legacy/styles/dashboard-a-v2.css`, `apps/dashboard/src/legacy/styles/mobile.css:101-115`, `apps/dashboard/src/legacy/Chanlytics.html`

- [ ] **Step 1: `dashboard-a.jsx` becomes**

```jsx
/* global React, HeroBrief, AgentCommand, TodayDay, TodayCard, TodayLeaks, TodayAway */
// Today. Three bands, in this order, and the order is the argument: the work first (a phone puts nothing above it),
// then the day's own card, then what is left over. Analysis never outranks a person who has been waiting eleven days.
//
//   the standing line
//   the queue (8 of 12)          | the day (4 of 12)
//   the day's card (12)
//   worth a look (7)             | while you were away (5)
//
// The seeded panels that stood here (a fake live call, invented appointments, an 8-agent fleet, a pinned dock, a
// trust review, a segment pulse) are gone from this page. The mockup draws the same page from its sample
// (legacy-bridge/today-sample.ts); the seed files stay loaded for the surfaces that still use them.
const DashboardA = () => (
  <div className="dash-a-v2">
    <HeroBrief />
    <div className="dash-a-v2-core">
      <AgentCommand />
      <TodayDay />
    </div>
    <TodayCard />
    <div className="dash-a-v2-foot">
      <TodayLeaks />
      <TodayAway />
    </div>
  </div>
);

window.DashboardA = DashboardA;
```

- [ ] **Step 2: The stylesheet's head.** In `apps/dashboard/src/legacy/styles/dashboard-a-v2.css`, replace lines 1-13 (the header comment and `.dash-a-v2`) with:

```css
/* ============================================================
   TODAY — the standing line, the queue with the day, the day's
   card, Worth a look with While you were away
   ============================================================ */

.dash-a-v2 {
  padding: var(--gutter-page) var(--gutter-page) 120px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: var(--measure-wide);
  position: relative;
}
```
  (Spec 4.1: a 12-column grid with 12px gaps, left-aligned at `--measure-wide`, `--gutter-page` at the sides; the hard-coded 32px moved the left edge 4px between tabs.)

  Then delete the whole `HERO BRIEF` section (from `/* ------------------------------------------------------------\n   HERO BRIEF` through `.brief-spark { display: block; margin-top: 6px; }`) and put in its place:

```css
/* Today's standing line: the date, the time and whether the lines are up, one line above the work, where a hero
   with a greeting, a headline, four sentences, a chip, an arc and six stat cards used to stand. */
.today-standing {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 2px 0 6px;
  font-size: 11.5px;
  color: var(--ink-dim);
}
.today-standing-lines { display: inline-flex; align-items: center; gap: 6px; }
.today-standing-alert { color: var(--danger); font-weight: 500; }
/* Its own dot: quiet green when every line is up; red with a ring when one is down. Never the coral live-dot, which
   is the agent's live state (components.css). The ring pulses only where motion is welcome. */
.today-standing-dot { position: relative; width: 7px; height: 7px; border-radius: 999px; background: var(--ok); flex: none; }
.today-standing-dot.down { background: var(--danger); }
.today-standing-dot.down::before { content: ""; position: absolute; inset: -3px; border-radius: 999px; border: 1.5px solid var(--danger); opacity: 0.45; }
@media (prefers-reduced-motion: no-preference) {
  .today-standing-dot.down::before { animation: today-ring 1.6s var(--ease-out) infinite; }
}
@keyframes today-ring { from { transform: scale(0.7); opacity: 0.6; } to { transform: scale(1.6); opacity: 0; } }
```

- [ ] **Step 3: The grids.** Replace the `CORE GRID` block (`.dash-a-v2-core { ... }` with its comment) with:

```css
/* ------------------------------------------------------------
   THE GRIDS — the queue with the day (8 | 4), then worth a look
   with while you were away (7 | 5); one card alone takes the row
   ------------------------------------------------------------ */
.dash-a-v2-core {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.dash-a-v2-foot {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 12px;
  align-items: start;
}
.dash-a-v2-foot > :only-child { grid-column: 1 / -1; }
```

  In the `Brief beats` block that stays (`.brief-beats`, `.brief-beat`, `.brief-beat-dot`, `.brief-beat-text`, `.brief-chip*`; `.brief-beat-acts` and `.brief-beat-done` go with `BriefBeats`), `.brief-beat-dot`'s `background: var(--accent)` becomes `background: var(--ink-faint)`: a bullet is not live state. `.brief-beat-text { flex: 1; min-width: 0; }` stays byte for byte (polish.test).

- [ ] **Step 4: The seed's rules go, where nothing reads them.** The sections `AGENT COMMAND`, `Agent Command v2`, `DECISION ROW` (from `/* ------------------------------------------------------------\n   AGENT COMMAND` to the line before `/* ------------------------------------------------------------` that opens the rail section, about lines 178-732), `Agent Command — title row`, `Policy chip on Command rows` and `Decide motion` (about lines 1622-1631, 1726-1731, 1748-1752) styled `dashboard-a-command.jsx`'s seed. Before deleting each, prove nothing else reads it:

```bash
node -e '
const fs=require("fs"),cp=require("child_process");
const css=fs.readFileSync("apps/dashboard/src/legacy/styles/dashboard-a-v2.css","utf8");
const files=cp.execSync("git ls-files apps/dashboard/src/legacy/pages apps/dashboard/src/legacy/components").toString().trim().split("\n");
const jsx=files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const classes=[...new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m=>m[1]))];
const dead=classes.filter(c=>!jsx.includes(c));
console.log(dead.join("\n"));'
```
  This prints every class the stylesheet names that no `.jsx` mentions as a substring. Delete the rules for the `brief-*` (all but `brief-beat*` and `brief-chip*`), `pulse-arc*`, `ac-*`, `dr-*`, `dec-*`, `ghost-row`, `ghost-tag`, `today-recap*`, `tw-*` and `tj-*` classes it lists; leave every class it lists that another loaded file could compose at runtime (`tl-danger`, `tl-warn`, `tl-info`, `ta-row`'s tones, `td-item`'s phases, `tq-count`'s `calm`, `pill-*`, `is-*` on files that stay). Keep the rail, fleet, dock, ask and `cmd-` sections: `dashboard-a-live.jsx`, `dashboard-a-fleet.jsx` and `dashboard-a-ask.jsx` stay in both lists. Two pins must hold afterwards: `.brief-beat-text { flex: 1; min-width: 0; }` is present (polish.test) and `.ask-card` is absent (ask.test).

- [ ] **Step 5: The Today section.** Replace everything from `/* ---- Today's queue: one list in the strip's row grammar` to the end of the file with:

```css
/* ---- Today's queue: one list in the strip's row grammar --------------------- */
.tq { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; }
.tq-head { display: flex; align-items: baseline; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--bg-sunken); }
.tq-title { font-size: 13px; font-weight: 500; color: var(--ink); }
/* The count is the away card's head (the bell's own number); the queue's head has no number over rows that say it. */
.tq-count { font-size: 16px; font-weight: 500; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.tq-count.calm { color: var(--ink-muted); }
.tq-sub { flex: 1; min-width: 0; font-size: 11.5px; color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tq-list { display: flex; flex-direction: column; }
.tq-list .cl-attn-row:first-child { border-top: none; }
.tq-empty { display: flex; align-items: center; gap: 8px; padding: 22px 16px; color: var(--ink-muted); font-size: 12.5px; }
.tq-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-top: 1px solid var(--line); background: var(--bg-sunken); font-size: 11.5px; color: var(--ink-dim); }
.tq-live { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--accent-soft); font-size: 12.5px; color: var(--ink); }
.tq-live .live-dot { width: 7px; height: 7px; }
.tq-live-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tq-live-last { color: var(--ink-muted); }
/* The one FailedRead under the rows (the broadcasts read): .empty-line's own padding is 12px 0, which puts it against the card's edge. */
.tq-failed { padding: 10px 16px; border-top: 1px solid var(--line); }

/* ---- The day beside the queue: today and tomorrow from the calendar --------- */
.td-day { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; }
.td-day-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--bg-sunken); }
.td-day-head .btn { margin-left: auto; }
.td-day-title { font-size: 13px; font-weight: 500; color: var(--ink); }
.td-day-sub { order: 3; flex-basis: 100%; font-size: 11.5px; color: var(--ink-dim); }
.td-day-sub:empty { display: none; }
.td-frame { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px 14px; border-top: 1px solid var(--line); }
.td-frame:first-of-type { border-top: none; }
.td-frame-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.td-frame-label { font-size: 12px; font-weight: 500; color: var(--ink-muted); min-width: 0; }
.td-frame.today .td-frame-label { color: var(--ink); }
.td-frame-note { flex: none; font-size: 10.5px; color: var(--ink-dim); white-space: nowrap; }
/* "1 needs you" and the flag on a person are a warning, not live state: danger ink, never the coral accent. */
.td-frame-note .warn { color: var(--danger-ink); font-weight: 500; }
/* The schedule: a time column, a rail with a dot per entry and the now
   marker, the name first with the service and length under it, a red line
   when that person's thread needs someone, the channel they use at the end.
   Long words wrap inside their own column; a title past two lines is cut. */
.td-items { position: relative; display: flex; flex-direction: column; }
.td-items::before { content: ""; position: absolute; left: 69px; top: 10px; bottom: 10px; width: 2px; background: var(--line); }
.td-item { display: grid; grid-template-columns: 56px 12px minmax(0, 1fr) auto; column-gap: 8px; align-items: start; width: 100%; padding: 7px 0; border: none; background: transparent; font: inherit; color: var(--ink); text-align: left; cursor: pointer; position: relative; }
.td-item:hover .td-item-title { text-decoration: underline; text-underline-offset: 2px; }
.td-item-time { font-family: var(--font-mono); font-size: 11px; color: var(--ink-dim); white-space: nowrap; text-align: right; padding-top: 2px; font-variant-numeric: tabular-nums; }
.td-item-rail { position: relative; width: 12px; height: 17px; }
.td-item-rail::after { content: ""; position: absolute; left: 3px; top: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); box-shadow: 0 0 0 2px var(--bg-raised); }
.td-item-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.td-item-title { font-size: 12.5px; font-weight: 500; line-height: 1.3; color: var(--ink); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.td-item-sub { font-size: 11px; line-height: 1.35; color: var(--ink-dim); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.td-item-flag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--danger-ink); }
.td-item-flag::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--danger); flex: none; }
.td-item-glyph { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg-sunken); color: var(--ink-dim); display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
.td-item.past { opacity: 0.55; }
.td-item.now .td-item-time { color: var(--accent); }
.td-item.now .td-item-rail::after { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.td-item.next .td-item-rail::after { background: var(--ink-muted); }
.td-empty { font-size: 11.5px; color: var(--ink-faint); }
.td-open { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; }
.td-open-label { color: var(--ink-dim); margin-right: 2px; }
.td-window { color: var(--ok); border: 1px dashed var(--ok); border-radius: 999px; padding: 1px 8px; font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
/* The cap's tail: the rest of the day is on the Calendar, one line, one door. */
.td-day-more { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; padding: 2px 0; border: none; background: transparent; font: inherit; font-size: 11.5px; color: var(--ink-muted); cursor: pointer; }
.td-day-more:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
.td-day-foot { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 10px 16px; border: none; border-top: 1px solid var(--line); background: var(--bg-sunken); color: var(--ink-muted); font-size: 11.5px; cursor: pointer; }
.td-day-foot span { flex: 1; min-width: 0; }
.td-day-foot:hover { color: var(--ink); }

/* ---- The day's card: four figures, each with its receipt; the lines that are not numbers; the period in one line -- */
/* overflow stays visible: the receipt is a popover that leaves the card's box. The foot draws its own bottom radius. */
.today-card { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); display: flex; flex-direction: column; }
.tc-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; padding: 12px 18px 0; }
/* The card's own heading (an h2, for the outline), at the size every card title on the page has. */
.tc-title { margin: 0; font-size: 13px; font-weight: 500; line-height: inherit; color: var(--ink); }
.tc-line { font-size: 13px; line-height: 1.5; color: var(--ink-muted); max-width: 72ch; }
/* The row of figures is the receipt's frame: the receipt is its last child, absolutely placed under its figure. */
.tc-figs { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 14px 18px 6px; }
.tc-fig { min-width: 0; }
/* The figure is the button when it has a receipt: the hit area is the whole figure, padded past its words. */
.tc-fig-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: calc(100% + 20px); margin: -8px -10px; padding: 8px 10px; border: none; border-radius: 10px; background: transparent; font: inherit; color: inherit; text-align: left; }
button.tc-fig-btn { cursor: pointer; transition: background 110ms; }
button.tc-fig-btn:hover, .tc-fig.open > button.tc-fig-btn { background: var(--bg-sunken); }
button.tc-fig-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.tc-fig-n { font-size: 22px; font-weight: 500; letter-spacing: -0.025em; line-height: 1.1; color: var(--ink); }
.tc-fig-w { font-size: 12.5px; line-height: 1.3; color: var(--ink-muted); }
.tc-fig-m { font-size: 12px; line-height: 1.35; color: var(--ink-dim); overflow-wrap: anywhere; }
/* The receipt: a popover under its figure on a desktop, placed by the figure's index (--i, set by the page over four
   equal columns); a panel under the row on a phone (the media rule below). One sentence, one door. The last figure's
   opens to the left so it stays inside the page. */
.tc-receipt { position: absolute; z-index: 5; top: calc(100% - 2px); left: calc(18px + var(--i, 0) * 25%); width: 312px; max-width: calc(100vw - 2 * var(--gutter-page)); padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg-raised); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 8px; }
.tc-receipt[data-last="true"] { left: auto; right: 18px; }
.tc-receipt-t { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--ink); }
.tc-receipt-door { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: transparent; font: inherit; font-size: 12px; font-weight: 500; color: var(--ink-muted); cursor: pointer; }
.tc-receipt-door:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
/* Every control here takes the house focus ring (spec 8). */
.tc-receipt-door:focus-visible, .tl-person:focus-visible, .td-day-more:focus-visible, .ta-main:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 6px; }
.tc-beats { padding: 10px 18px 14px; margin-top: 0; }
.tc-beats:empty { display: none; }
.tc-foot { display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-top: 1px solid var(--line); background: var(--bg-sunken); border-radius: 0 0 var(--radius-lg) var(--radius-lg); font-size: 12px; color: var(--ink-muted); }
.tc-foot-text { flex: 1; min-width: 0; line-height: 1.45; }
.tc-foot .empty-line { padding: 0; flex: 1; }

/* ---- Below the card: worth a look, away ----------------------------------- */
.tsec { background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; }
.tsec-head { display: flex; align-items: baseline; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--bg-sunken); }
.tsec-head .btn { margin-left: auto; }
.tsec-title { font-size: 13px; font-weight: 500; color: var(--ink); white-space: nowrap; }
.tsec-sub { min-width: 0; font-size: 11.5px; color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tsec-note { padding: 10px 16px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--ink-dim); }

/* ---- Worth a look: the page's one place where two numbers meet ------------- */
/* Deliberately quiet. A red panel shouting at a salon owner every morning is noise within a week; a glyph and a word
   for the tone, the sentence, and the arithmetic under it in the tone's own ink is read once and believed. */
.tl-list { display: flex; flex-direction: column; }
.tl-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: start; gap: 0 12px; padding: 12px 14px 12px 16px; border-top: 1px solid var(--line); }
.tl-row:first-child { border-top: none; }
.tl-glyph { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 7px; margin-top: 1px; color: var(--ink-muted); background: var(--bg-sunken); }
.tl-glyph.tl-danger { color: var(--danger-ink); background: var(--danger-soft); }
.tl-glyph.tl-warn { color: var(--warn-ink); background: var(--warn-soft); }
.tl-glyph.tl-info { color: var(--info-ink); background: var(--info-soft); }
.tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tl-tag { font-family: var(--font-mono); font-size: 9.5px; font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-dim); }
.tl-row.tl-danger .tl-tag { color: var(--danger-ink); }
.tl-row.tl-warn .tl-tag { color: var(--warn-ink); }
.tl-text { font-size: 13.5px; line-height: 1.45; color: var(--ink); font-weight: 500; max-width: 78ch; }
.tl-math { font-size: 11.5px; line-height: 1.4; color: var(--ink-dim); }
.tl-people { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; }
.tl-people-lead { font-size: 11px; color: var(--ink-dim); }
.tl-person { font: inherit; font-size: 11.5px; color: var(--ink-muted); background: var(--bg-sunken); border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; cursor: pointer; }
.tl-person:hover { color: var(--ink); border-color: var(--line-strong); }
.tl-acts { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex: none; flex-wrap: wrap; }
.tl-failed { padding: 10px 16px; }

/* ---- While you were away: the bell, grouped, warnings first ---------------- */
.ta-list { display: flex; flex-direction: column; }
.ta-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 10px; padding: 11px 12px 11px 14px; border-top: 1px solid var(--line); }
.ta-row:first-child { border-top: none; }
.ta-row:hover { background: var(--bg-hover); }
.ta-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 0; border: none; background: transparent; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.ta-line1 { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.ta-title { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 500; color: var(--ink); line-height: 1.35; overflow-wrap: anywhere; }
.ta-main:hover .ta-title { text-decoration: underline; text-underline-offset: 2px; }
.ta-time { flex: none; font-size: 11px; color: var(--ink-faint); }
.ta-msg { font-size: 11.5px; line-height: 1.4; color: var(--ink-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ta-msg:empty { display: none; }
.ta-row.warn .ta-title { color: var(--warn-ink); }
/* Dismiss is out of the way until a pointer is on the row, and always there for a finger, which has no hover to
   reveal it with. */
.ta-x { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: -2px -2px 0 0; border: none; border-radius: var(--radius-sm); background: transparent; color: var(--ink-faint); cursor: pointer; flex: none; transition: opacity 120ms var(--ease-out), color 120ms, background 120ms; }
.ta-x:hover { color: var(--danger); background: var(--danger-soft); }
@media (hover: hover) {
  .ta-x { opacity: 0; }
  .ta-row:hover .ta-x, .ta-row:focus-within .ta-x { opacity: 1; }
}
/* legacy.css gives every button 44px of HEIGHT on a coarse pointer; a 24px-wide glyph is still a 24px-wide target,
   and this one throws a row away. */
@media (pointer: coarse) { .ta-x { width: 44px; margin-right: -8px; } }
.ta-row[data-count="1"] .ta-msg { color: var(--ink-dim); }
.ta-row:not([data-count="1"]) .ta-title { letter-spacing: -0.005em; }

/* Below 1180px each row is one column, in the same order (spec 4.1). today-day.test pins this block's first two lines. */
@media (max-width: 1180px) {
  .dash-a-v2-core, .dash-a-v2-foot { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  /* A phone puts nothing above the work it can help with: the head is one line with its door on it, and the
     sentence under it, not three stacked rows. */
  .tq-head { flex-wrap: wrap; row-gap: 2px; padding-bottom: 10px; }
  .tq-head .btn { order: 2; }
  .tq-sub { order: 3; flex-basis: 100%; white-space: normal; }
  /* The line an owner decides from wraps on a phone rather than truncates: at 390px the box is 286px and a
     three-segment status measures 427-460px, and what an ellipsis eats from the right is the deadline (spec 4.3). */
  .tq-list .cl-attn-status { white-space: normal; overflow: visible; text-overflow: clip; }
  /* Two figures a row, and the receipt a panel in the flow under the row: a popover has nowhere to go on a phone. */
  .tc-figs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
  .tc-receipt { position: static; grid-column: 1 / -1; width: auto; max-width: none; box-shadow: none; background: var(--bg-sunken); border-color: var(--line); }
  .tc-receipt[data-last="true"] { right: auto; }
  .tc-foot { flex-wrap: wrap; }
}
@media (max-width: 640px) {
  .tl-row { grid-template-columns: 24px minmax(0, 1fr); }
  .tl-acts { grid-column: 2; justify-content: flex-start; padding-top: 8px; }
}
```
  The strings pinned by today-day's wiring test hold in this text: `@media (max-width: 1180px) {\n  .dash-a-v2-core, .dash-a-v2-foot { grid-template-columns: 1fr; }` (moved in Task B2 (f)) and the `.td-*` rules named there; `.tq-live {` and `.tq-list .cl-attn-row:first-child { border-top: none; }` hold for today-queue.

- [ ] **Step 6: `mobile.css`.** The `/* ---------- Today ---------- */` block (lines 101-115) becomes:

```css
  /* ---------- Today ---------- */
  .dash-a-v2 { padding: 16px 16px 96px; }
  .dash-a-v2-core, .dash-a-v2-foot { grid-template-columns: 1fr; }
  .rail { position: static; }
  .fleet-grid { grid-template-columns: 1fr 1fr; }
  /* The real queue's head and its call in progress wrap on a phone; they held one line and cut the words off. */
  .tq-head { flex-wrap: wrap; }
  .tq-sub { flex-basis: 100%; white-space: normal; }
  .tq-live { flex-wrap: wrap; }
  .tq-live-text { white-space: normal; }
```
  (`.brief-body`, `.brief-pulse`, `.ac-rail`, `.ac-buckets` and `.dec-outcomes` styled the seed; `.rail` and `.fleet-grid` are the mockup's other surfaces and stay.)

- [ ] **Step 7: `Chanlytics.html` cache keys.** `styles/dashboard-a-v2.css?v=23` → `24`; `styles/mobile.css?v=12` → `13`; `pages/dashboard-a-brief.jsx?v=15` → `16`; `pages/dashboard-a-command.jsx?v=26` → `27`; `pages/dashboard-a-day.jsx?v=1` → `2`; `pages/dashboard-a-week.jsx?v=5` → `6` (PR A moved it to 5); `pages/dashboard-a.jsx?v=9` → `10`. The two lists stay identical: no file was added or removed.

- [ ] **Step 8: Run**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/polish.test.mjs tooling/scripts/tests/ask.test.mjs tooling/scripts/tests/today-day.test.mjs
```
Expected: today-page PASSES whole (12 tests); legacy-harness, polish and ask PASS; today-day PASSES (its CSS pins are in the text above).

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/src/legacy/pages/dashboard-a.jsx apps/dashboard/src/legacy/styles/dashboard-a-v2.css apps/dashboard/src/legacy/styles/mobile.css apps/dashboard/src/legacy/Chanlytics.html
git commit -m "Today: three bands and nothing seeded; the stylesheet for the card, the receipts, Worth a look; the phone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B9: The pins follow the code; the baseline is re-banked

**Files:**
- Modify: `tooling/scripts/tests/today-queue.test.mjs`, `today-calls-strip.test.mjs`, `today-doors.test.mjs`, `the-pages-say-only-what-is-true.test.mjs`, `runs-honest.test.mjs`, `gate-reason.test.mjs`, `refusals-on-the-page.test.mjs`, `source-scan-baseline.json`

Every file below either holds no `readCode(`/`readRaw(` call or keeps its count; the strings inside existing calls move with the code.

- [ ] **Step 1: The harnesses that render the queue get the bridge's helpers.** In each of `today-doors.test.mjs` (after the `await import(.../dashboard-a-command.jsx)` line), `the-pages-say-only-what-is-true.test.mjs` (same place, line 177), `runs-honest.test.mjs` (after line 164), `gate-reason.test.mjs` (after line 191) and `refusals-on-the-page.test.mjs` (after line 196), add:

```js
const { TODAY_HELPERS } = await import("../../../apps/dashboard/src/legacy-bridge/today.ts");
globalThis.window.__today = TODAY_HELPERS;
```
  (The queue's run rows read `window.__today.runs`; these five drew them before contracts owned the words.) In `refusals-on-the-page.test.mjs` also give the harness a `refusalToast` if it has none: check with `grep -n "refusalToast" tooling/scripts/tests/refusals-on-the-page.test.mjs`; it loads data-bits, which publishes one, so nothing to add.

- [ ] **Step 2: `today-doors.test.mjs`.**
  - `const mountRecap = ...` becomes `const mountCard = (vm) => { globalThis.window.TODAY_DATA = vm; cells = []; seq = 0; return globalThis.window.TodayCard(); };` and every `mountRecap(` becomes `mountCard(`; the comment above it: `// The day's lines (its receipts, the proof, a reply that failed) sit in the day's card under the work (TodayCard).`
  - The header's third bullet becomes `- The view model kept the day's three receipts, the quiet day's proof and its way to earlier conversations; the hero drew one receipt and neither of the others.` (unchanged) and the file's second test's card half becomes:

```js
  // Under the work: the day's figures, and only the lines they do not carry.
  const card = mountCard(vm);
  assert.ok(find(card, (n) => n.props?.["data-testid"] === "today-figure-messages"), "the day's figures");
  const beats = findAll(card, (n) => typeof n.props?.className === "string" && n.props.className.includes("brief-beat-text")).map(textOf);
  assert.ok(!beats.some((b) => /receptionist answered|reached the phone line|messages? in/.test(b)), `REGRESSION: the figures say these already: ${beats.join(" | ")}`);
```
  - In the test `"REGRESSION: approving a waiting run..."`, `textOf(flashes.at(-1).msg)` still reads the toast: it is a string now, and `textOf` returns strings as they are.

- [ ] **Step 3: `the-pages-say-only-what-is-true.test.mjs`.** In `mountToday` (line 184-194), `TodayRecapBody` becomes `TodayCard` and the comment `// The day's own lines sit under the work now, in the recap; the hero is the standing line above it.` becomes `// The day's card sits under the work; the hero is the standing line above it.`. In the D5 test (line 439), `globalThis.window.TodayRecapBody()` becomes `globalThis.window.TodayCard()`, and the assertion becomes `assert.ok(said.includes("went out at 1:30 AM: 8 sent, 1 replied") && said.includes("Spring offer"), ...)` (the colon is contracts' `todayRunWords`; the em dash was the page's).

- [ ] **Step 4: `runs-honest.test.mjs` line 345-346.** The comment becomes `// What ran today is a line of the day's card, under the work (TodayCard); it was a beat of the hero above it.` and `globalThis.window.TodayRecapBody()` becomes `globalThis.window.TodayCard()`.

- [ ] **Step 5: `today-queue.test.mjs`** (7 reads, unchanged count). In the wiring test:
  - `const real = queue.slice(queue.indexOf("const LiveRail"), queue.indexOf("const AgentCommandSeed"));` becomes `const real = queue.slice(queue.indexOf("const LiveRail"));` and its assertion message `"the real section is the queue, not a command bar; the seed keeps its title for the demo"` becomes `"the queue, not a command bar; the seed is gone"`. Add: `assert.ok(!real.includes("tq-count"), "no count over rows that say it");`
  - `assert.ok(brief.includes("<RunsDone nav={nav} />") && brief.includes('data-testid="brief-run-done"'), "what went out today stays a receipt in the hero");` keeps its strings; its message becomes `"what went out today is a line of the day's card"`.
  - The header comment's last sentence `The hero keeps the narrative; the rows live in the queue, drawn by the same component as People's strip.` becomes `The standing line stays above; the rows live in the queue, drawn by the same component as People's strip.`

- [ ] **Step 6: `today-calls-strip.test.mjs`** (6 reads, unchanged count). `const rows = queue.indexOf("{rows.map((r) => (");` becomes `const rows = queue.indexOf("const drawn = rows.map((r) => (");` (the rows are built before the JSX that places them under the rail: the assertion that the rail comes first still reads the source order of `<LiveRail nav={nav} />` against where the rows are placed, so also change `rail` to `queue.indexOf("<LiveRail nav={nav} />")` and `rows` to `queue.indexOf("{drawn}")`, keeping `rail < rows`).

- [ ] **Step 7: Run everything, then re-bank the ratchet**

```bash
corepack pnpm test
```
Expected: one failure only: `source-scan-ratchet` says `today-week.test.mjs` left the baseline (its 6 reads are gone, so the total fell). Then:

```bash
UPDATE_SOURCE_SCAN_BASELINE=1 corepack pnpm test
git diff --stat -- tooling/scripts/tests/source-scan-baseline.json
```
Expected: the baseline loses the `today-week.test.mjs` line and nothing else changes (today-page and today-sample are absent, at 0; no count rose). If any other count changed, a pin was added somewhere above: find it and move it into an existing read instead.

- [ ] **Step 8: Commit**

```bash
git add tooling/scripts/tests
git commit -m "Today's tests follow the code: the card replaces the recap, the queue's seed is gone, the period card's suite goes; the ratchet re-banked

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B10: The nightly (`e2e/today.spec.ts`)

**Files:**
- Rewrite: `e2e/today.spec.ts`

Playwright runs only in `nightly-e2e.yml` with Ruben's `E2E_*` secrets; `e2e-shape.test.mjs` reads the file now (every `page.request` line must go through `apiGet(`), and `corepack pnpm exec tsc -p e2e --noEmit` types it if that project exists (check `ls e2e/tsconfig.json`; otherwise `corepack pnpm -r typecheck` covers it).

- [ ] **Step 1: Replace the file with**

```ts
import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { expectAwayAddsUp, expectLeaksWellFormed, expectNoQueueRepeat, expectWarningsFirst } from "./signals";

/**
 * Today on a real workspace: the work first, then the day's own card (four figures, each with its receipt), then
 * what is left over. Everything that asks for a person is one queue in the strip's row grammar; every number is one
 * the page it links to prints; nothing is said twice.
 */
test.describe("Today on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
  });

  test("the standing line, then one queue: every row a sentence, a state line and a verb; one primary verb; no seed", async ({ page }) => {
    await expect(page.getByTestId("today-standing")).toBeVisible();
    await expect(page.getByTestId("today-standing")).toContainText(/lines? connected|could not be counted|no lines connected yet/);
    const queue = page.getByTestId("today-queue");
    await expect(queue).toBeVisible();
    const rows = queue.locator(".tq-list .cl-attn-row");
    const n = await rows.count();
    for (const row of await rows.all()) {
      expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
      expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
      await expect(row.locator(".cl-attn-cta")).toHaveCount(await row.locator(".cl-attn-cta").count() > 1 ? 2 : 1);
    }
    await expect(queue.locator(".tq-list .cl-attn-cta.primary")).toHaveCount(Math.min(1, n));
    await expect(queue.locator(".tq-head .tq-count")).toHaveCount(0);
    if (n === 0) await expect(queue.locator('[data-testid^="today-queue-empty-"]')).toBeVisible();
    await expect(page.getByText("Agent Command")).toHaveCount(0);
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toHaveCount(0);
    // Nothing invented: no dollar amounts anywhere on a page with no revenue column.
    for (const cell of await page.locator(".today-standing, .today-card, .tsec").allInnerTexts()) expect(cell).not.toMatch(/\$\d/);
  });

  test("the day's card: four figures with their clauses, or the quiet line with its proof; a receipt on hover adds to its figure", async ({ page }) => {
    const card = page.getByTestId("today-card");
    await expect(card).toBeVisible();
    const figures = card.locator('[data-testid^="today-figure-"]');
    const n = await figures.count();
    if (n === 0) {
      await expect(card.getByTestId("today-quiet-line")).toContainText(/^Nothing has come in yet today\. (The last message arrived .+|No messages have arrived yet\.)/);
      return;
    }
    expect(n).toBe(4);
    for (const id of ["messages", "answered", "calls", "new"]) {
      const fig = card.getByTestId(`today-figure-${id}`);
      await expect(fig.locator(".tc-fig-n")).toHaveText(/^\d+$/);
      expect((await fig.locator(".tc-fig-m").innerText()).trim().length).toBeGreaterThan(0);
      await expect(card.getByTestId(`today-receipt-${id}`)).toHaveCount(0);
      if ((await fig.locator("button.tc-fig-btn").count()) === 0) continue;
      await fig.hover();
      const receipt = card.getByTestId(`today-receipt-${id}`);
      await expect(receipt).toBeVisible();
      await expect(receipt).toHaveAttribute("role", "dialog");
      const value = (await fig.locator(".tc-fig-n").innerText()).trim();
      expect((await receipt.locator(".tc-receipt-t").innerText()).trim()).not.toMatch(new RegExp(`\\b${value}\\b`));
      await expect(receipt.locator("button")).toHaveCount(await receipt.locator("button").count() ? 1 : 0);
      await page.mouse.move(0, 0);
      await expect(receipt).toHaveCount(0);
    }
  });

  test("the period line is Reports' own number, said once, with the page's one door to Reports", async ({ page }) => {
    const line = page.getByTestId("today-period");
    const failed = page.getByTestId("today-period-failed");
    await expect(line.or(failed)).toBeVisible({ timeout: 15_000 });
    if ((await line.count()) === 0) return;
    const said = (await line.innerText()).trim();
    const m = /^Last (7|30|90) days: (\d+) customer messages?/.exec(said);
    expect(m, said).not.toBeNull();
    const door = page.getByTestId("today-card").getByRole("button", { name: /Open Reports/ });
    await expect(door).toHaveCount(1);
    await door.click();
    await expect(page).toHaveURL(/#\/reports/);
    await page.waitForLoadState("networkidle");
    // Reports' messages tile, over the same range, prints the same count.
    await expect(page.getByTestId("rp-tile-messages").locator(".rp-tile-value").or(page.locator('[data-testid="rp-tile-messages"]'))).toContainText(m![2]);
  });

  test("the day beside the queue: at most five rows and a line to the Calendar; nothing without a feed", async ({ page }) => {
    const day = page.getByTestId("today-day");
    await day.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
    if ((await day.count()) === 0) {
      const res = await apiGet(page, "/api/v1/calendar");
      const cal = ((await res.json()).data?.calendar as { feed?: { state?: string } } | undefined)?.feed;
      expect(cal?.state, "no day module, so the feed must not be readable").not.toBe("ok");
      return;
    }
    await expect(day).toBeVisible();
    const frames = day.getByTestId("today-day-frame");
    await expect(frames).toHaveCount(2);
    await expect(frames.first()).toContainText(/^Today · /);
    for (const frame of await frames.all()) {
      const items = await frame.getByTestId("today-day-item").count();
      expect(items).toBeLessThanOrEqual(5);
      const more = frame.getByTestId("today-day-more");
      if ((await more.count()) > 0) {
        await expect(more).toHaveText(/^\d+ more on the Calendar$/);
        expect(items).toBe(5);
      }
    }
    await expect(day.getByRole("button", { name: /Open Calendar/ })).toBeVisible();
  });

  test("worth a look: every row a claim with its arithmetic, a word for its tone, an Ask door that asks the row's own sentence", async ({ page }) => {
    const rows = await expectLeaksWellFormed(page);
    if (rows.length === 0) return;
    for (const r of rows) {
      const row = page.getByTestId(`today-leak-${r.id}`);
      await expect(row.locator(".tl-tag")).toHaveText(/^(Booking gap|No reply|Reach|Gone quiet)$/);
      expect(r.doors).toContain("Ask why");
    }
    await page.getByTestId(`today-leak-ask-${rows[0].id}`).click();
    // The shell's Ask palette (ask-real.jsx, testid ask-real as ask.spec and phone.spec read it) opens on the row's own question.
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    await expect(ask).toContainText(rows[0].text.slice(0, 40), { timeout: 15_000 });
  });

  test("while you were away: nothing in the queue is said twice, the count adds up, and a warning is never below good news", async ({ page }) => {
    await expect(page.getByTestId("today-queue")).toBeVisible();
    await expectNoQueueRepeat(page);
    await expectAwayAddsUp(page);
    await expectWarningsFirst(page);
  });
});

test.describe("Today on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the work first: the queue starts on the first screen; a receipt is a panel in the flow, not a popover", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const queue = page.getByTestId("today-queue");
    await expect(queue).toBeVisible();
    const box = await queue.boundingBox();
    expect(box!.y, "the queue's head is on the first screen").toBeLessThan(844 - 120);
    // The line an owner decides from wraps; nothing is cut from its right.
    for (const status of await queue.locator(".tq-list .cl-attn-status").all()) {
      expect(await status.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await status.innerText()).toBe(true);
    }
    const fig = page.getByTestId("today-card").locator("button.tc-fig-btn").first();
    if ((await fig.count()) === 0) return;
    await fig.scrollIntoViewIfNeeded();
    await fig.tap();
    const receipt = page.getByTestId("today-card").locator('[data-testid^="today-receipt-"]');
    await expect(receipt).toBeVisible();
    const position = await receipt.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("static");
  });
});
```

  One thing to check against the code before committing, and to adjust in the spec (not in the app): the Reports page's messages tile testid and value class for the third test (`grep -n 'data-testid={`rp-tile-\|rp-tile-value' apps/dashboard/src/legacy/pages/reports-sections.jsx`); name what Reports draws.

  The other eleven specs that visit `#/today` (`grep -ln "#/today" e2e/*.ts`) read only what this page keeps: `today-standing` (setup, sidebar, workspace-create), `brief-setup` (setup), `brief-run-row` (playbooks), `today-leak-unreachable` with its two doors (owner-signals), `today-recap` with a `.brief-beat` saying "failed to deliver" and "See the thread" (thread), `.cl-attn-who`, `.ta-title`, `.tq-count` and `.tq-foot` inside `today-away` (signals.ts); ask, csp, notifications, phone and team-card use the route only to reach the shell. `e2e/signals.ts` needs no change: its `readLeaks` reads `.tl-text`, `.tl-math` and `.tl-acts button`, all kept ("Ask why" joins the doors it lists).

- [ ] **Step 2: Shape and types**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/e2e-shape.test.mjs
corepack pnpm -r typecheck
```
Expected: PASS. (The spec itself runs in the nightly; the merge does not wait for it.)

- [ ] **Step 3: Commit**

```bash
git add e2e/today.spec.ts
git commit -m "Today's nightly: the figures and their receipts, the period line against Reports, the day's cap, Ask why, the phone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B11: Docs

**Files:**
- Modify: `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md:661`

- [ ] **Step 1: `CLAUDE.md`.** In `## UI patterns`, after the **Charts** bullet, add:

```markdown
- **Today** is three bands in this order (`pages/dashboard-a.jsx`): the standing line (`dashboard-a-brief.jsx` HeroBrief), the queue with the day beside it (`dashboard-a-command.jsx`, `dashboard-a-day.jsx`), the day's card (`dashboard-a-brief.jsx` TodayCard: four figures from `TODAY_DATA.figures`, each with the clause under it and its receipt on hover, focus or a tap, then the lines that are not numbers, then `__today.periodLine` with the page's one door to Reports), then Worth a look and While you were away (`dashboard-a-week.jsx`). Every sentence with a number is contracts' (`today.ts`: `toTodayVM`, `todayDay`, `todayPeriodLine`, `todayRunWords`, `todayLeaks`, `todayAwayGrouped`, published as `window.__today` by `legacy-bridge/today.ts` `TODAY_HELPERS`); the page composes and never derives. A borrowed read that failed says so where its line would be (`FailedRead` with `window.__surfaceFailed`). The standalone mockup draws the same page from `legacy-bridge/today-sample.ts`, which `serve-legacy.mjs` builds as `data/today-sample.js` and which installs its surfaces only where the app's globals are absent. Never add a `readCode`/`readRaw` pin in a new Today test: `today-page.test.mjs` and `today-sample.test.mjs` execute the page and the sample on the stub React instead.
```

- [ ] **Step 2: `docs/system-prd.md` line 661.** The Today row becomes:

```markdown
| Today | `#/today` | One line above the work; the queue (handoffs, call-backs, reply windows closing, calls worth a listen, runs waiting) beside the day from the calendar, five rows and a line to the Calendar; the day's card: four figures (customer messages, answered by the receptionist, calls, new people) each with the clause under it and its receipt on hover, the lines that are not numbers, the last seven days in one line; Worth a look (Reports and People read together, with who is waiting and an Ask door) and what happened while away, deduped against the queue. `metrics_summary` in the business's own timezone; open escalations read once for Ask and the page | Open or snooze a queue row, resolve, approve a held playbook run, ask why; every door opens the record |
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/CLAUDE.md docs/system-prd.md
git commit -m "Docs: Today's three bands, the card's receipts, the sample

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task B12: Look at it

The mockup draws the real page from the sample now, so the look is checked there, not in the app (no session needed).

- [ ] **Step 1: A temporary launch entry.** Add to `.claude/launch.json` in the worktree, inside `configurations`:

```json
    {
      "name": "today-mockup",
      "runtimeExecutable": "node",
      "runtimeArgs": ["tooling/scripts/serve-legacy.mjs", "3215"],
      "port": 3215
    }
```

- [ ] **Step 2: Open it.** `preview_start` with `{ name: "today-mockup" }`, then `navigate` to `http://localhost:3215/Chanlytics.html#/today`. Read `read_console_messages` with `onlyErrors: true`: expected none (a `ReferenceError` here means a page file names a component the sample did not install; a 500 on `data/today-sample.js` prints esbuild's message in the response body). Then the spec's four looks (section 9): `resize_window` to `{ width: 1440, height: 900 }`, screenshot; hover the first figure and screenshot again (the receipt under it, 312px, one door); `{ width: 1180, height: 900 }` (one column, the order kept), screenshot; `preset: "mobile"`, reload, screenshot the first screen (the queue's head visible; nothing above the work but the standing line) and tap a figure (the receipt a panel under the row of figures); then `colorScheme: "dark"` at 1440 and screenshot (the tone inks and the soft fills hold; no coral but the live dot). Set the viewport back with `preset: "desktop"` and `colorScheme: "light"`.

  What to look for, against the spec's section 5 and the canvas generator (`plan2/canvas/gen.mjs` in the previous session's scratchpad; the artifact itself is under the other account): the card's four figures on one row at 22px, the meta at 12px dim under each; the receipt a quiet popover, not a tooltip; Worth a look rows with a glyph, a tag, the sentence, the maths and the doors right-aligned; the away card with the bell's number; no coral anywhere but the live call's dot. Fix what reads wrong in the CSS (Task B8's block), re-check, and re-run `today-page.test.mjs` if a class name changed.

- [ ] **Step 3: Put the launch file back and stop the server**

```bash
git checkout -- .claude/launch.json
```
  and `preview_stop` with the server id.

### Task B13: PR B, merge, wrap up

- [ ] **Step 1: Dist and everything**

```bash
corepack pnpm --filter "./packages/*" build
git diff -w --ignore-cr-at-eol --stat -- packages/contracts/dist
node tooling/scripts/check-dist.mjs
corepack pnpm test
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm --filter @chanlytics/dashboard build
```
Expected: green; the Next build compiles the legacy pages (a classic-script mistake shows here, not in node). Commit the dist (contracts only, real diff) if it changed.

- [ ] **Step 2: Push and open PR B**

```bash
git push -u origin feat/today-page
cat > "$TMPDIR/pr-b.md" <<'EOF'
The Today redesign's page (`docs/superpowers/specs/2026-09-19-today-redesign-design.md`; plan Part B). Data landed in the part A PR.

**Three bands, in this order**: the standing line (its own dot, never the coral live-dot); the queue (no count over the rows, one primary verb, the runs' words from contracts) beside the day (five rows and a line to the Calendar); the day's card (four figures, each with the clause under it and its receipt on hover, focus or a tap, then the lines that are not numbers, then the last 7 days in one line with the page's one door to Reports); Worth a look (a word and an icon for the tone, who is waiting, Ask why) beside While you were away (deduped over all four queue kinds, drawn wherever a bell is).

**Gone**: the seeded hero, Agent Command's seed, the pulse arc, the period card (its three reads, six tiles and second Open Reports), the journey, the greeting; `todayWeek`, `todayJourney`, `todayDayFacts`, `todayDayLine`, `todayAway`. Nothing seeded is mounted on Today; the mockup draws the same page from the sample.

**Every borrowed read that fails says so** (`FailedRead` for Reports at the card's foot and in Worth a look, for the calendar where the day goes).

**Tests**: `today-page.test.mjs` (new, executes every band on the stub React, 0 source pins), `today-doors`/`today-queue`/`today-calls-strip`/`today-day`/`today-away-page`/the-pages-say/runs-honest moved with the code, `today-week` deleted, ratchet re-banked (930 → 924). Nightly `today.spec.ts` rewritten (desktop and a phone).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --repo <owner>/<repo> --base main --head feat/today-page --title "Today redesign, part B: the work first, the day's card with its receipts, what is left over" --body-file "$TMPDIR/pr-b.md"
```

- [ ] **Step 3: CI and merge**, as in A6 Step 4 (count the checks; a CONFLICTING PR runs no Actions). Then `gh pr merge <n> --repo <owner>/<repo> --squash --delete-branch`.

- [ ] **Step 4: Wrap up.**
  - Park the worktree: `git checkout -q design/today-next && git fetch -q origin && git rebase -q origin/main` (the spec branch is now behind main; its two commits are in PR A).
  - Update the memory note `project_chanlytics_today_redesign.md`: PR A and PR B numbers and merge commits, "SHIPPED", the nightly spec unread until the next nightly, and the fact that the canvas artifact lives under the other account.
  - Tell Ruben: the two PRs, what the nightly will read, and the one thing left for him: nothing (no migration, no secret, no switch).
