# 0017 · A lead's reply is drafted on its reading

**Status:** decided with the Part 5 plan (its G13 and G14, after the plan's two reviews on 27 September 2026, under
the spec's decision 6). Step 2 is built (the plan's PR 5, 28 September 2026; its As built note says where it departed
from the Shape below); step 3 waits on 0001's step 6. Written against commit `e48ccecb` (main, 27 September 2026, after #1188), and every file
and line below was read at it. Where this note and the code disagree, the code wins. It is Reach out Part 5's
(`docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md`, G13 and G14), and PR 5 of that plan builds it. The
plan named it 0016, which #1177 has since taken for a partner's handover, so it takes 0017.

## Context

### Draft mode for email is decided, and not built

Decision 0001's step 6 (`docs/decisions/0001-channel-neutral-inbound.md:269-278`) says how email joins the
receptionist: `ingestEmail` hands the message to `answerInbound` with `mayAutoSend: false`, and the reply is queued
through `queueDraft` with `channel: "email"`, widening `draft-queue.ts:35` and `persist.ts` in the same change. Its
status is "decided, not built" (`0001:3`). No code names `mayAutoSend` yet.

### Every receptionist draft today is a row that sends itself

`queueDraft` (`apps/edge/lib/receptionist/draft-queue.ts:43-76`) writes an `ai` message `queued`, then schedules its
`outbound_send` for when the veto window ends. The draft is a send with a delay: nothing needs a person to press Send,
and a `queued` row with no job is the orphan its own comment guards against (`:44-50`). Its channel is
`whatsapp | sms` (`:35`). The Inbox seeds the composer from such a draft (`inbox-thread.jsx:166`,
`reply={thread.veto ? thread.veto.draft : ""}`).

### A reply to a reach-out must never send without its owner

The reach-out spec's decision 6 (`docs/superpowers/specs/2026-09-25-reach-out-design.md` §3, Ruben, 25 September
2026): a reply is read before it is answered; the classifier only stops and labels; the receptionist drafts; the owner
sends. §4.7 names the drafts: the answer for interested and a question, a one-line thanks for not now.

So a lead thread's draft cannot be a `queueDraft` row: that row sends itself when its window ends. And it cannot wait
for 0001's step 6, which is the whole of email draft mode: every mailbox's `reply_mode`, the sweep's words for an email
(`INLINE_INTAKE`, `unfinished.ts:58`), and the widened persistence.

### What the brain needs, and what it reads

- The brain is `generateReply(history, userText, systemPrompt, fallbackText, leadNote?, nowNote?, image?, steer?)`
  (`apps/edge/lib/receptionist/brain.ts:95`), on `BRAIN_MODEL`, Claude Opus 5 (`:20`). `leadNote` is a separate system
  block, so the business's profile above it keeps its prompt cache (`:100-107`).
- The workspace's prompt is `resolveSystemPrompt(brain, channel, tz, …)`, whose channel is `"whatsapp" | "voice"`
  (`packages/contracts/src/config/config.ts:1600-1602`). There is no email style.
- `loadTenantRuntime(db, routed: RoutedChannel)` (`apps/edge/lib/tenant-runtime.ts:164`) reads the tenant's config,
  policies, zone and channels by `routed.tenantId`. `routed.kind` matters only to the WhatsApp credentials it resolves:
  for any other kind it looks the tenant's WhatsApp channel up itself (`:128-145`). `RoutedChannel` is
  `packages/db/src/repositories/routing.ts:5-14`; the admin eval builds one by hand (`apps/edge/api/admin/eval.ts:100-108`).

### The gates `answerInbound` asks

`answerInbound` (`packages/core/src/inbound/answer.ts:88`) asks, among others: a runtime read and a reply posture
(`replyPosture`, `:105`; `packages/core/src/inbound/reply-posture.ts:32`); a brain and a config that parses
(`rt.brain`, `:113`; `rt.configBroken`, `:671`); the day's token budget, read inline over `tokensLast24h` (`:611-630`;
`apps/edge/lib/receptionist/budget.ts:120`); and, for what leaves, the pilot allowlist, the reply window, consent, a
thread paused for a person and the reply cap. Usage is written as `usage.llm_tokens` by the WhatsApp persistence
(`apps/edge/lib/whatsapp/persist.ts:354`).

## Decision

A lead thread's draft is **text on its reading**, `reach_out_replies.draft`, never a message row. It is made by
`generateReply` over the workspace's own prompt with a lead note, and it leaves only as a person's own reply: the thread's
composer is seeded with it, and the owner's Send goes through the reply route as that person's reply (`kind: "reply"`),
through the one send door (`packages/core/src/deliver.ts`). Nothing sends it by itself: there is no job, no window and
no `queued` row.

It is drafted only for what §4.7 names: interested and a question (the answer, from the business's facts) and not now
(a line of thanks and nothing else). Contracts' `readingPlan` says which (`draft: "answer" | "thanks" | null`,
`packages/contracts/src/reach-out/reach-out-replies.ts`), and a re-read of a reply never drafts.

**The gates it asks again,** of `answerInbound`'s:

- a brain configured and a config that parses (`rt.brain`, `rt.configBroken`);
- the workspace's reply posture (`replyPosture`), so a disabled workspace drafts nothing;
- the day's token budget. Its rule, "used ≥ cap stops", moves out of `answer.ts:611-620` into contracts
  (`tokenBudgetSpent(limits, used)`), so the receptionist and the draft ask one predicate;
- the workspace may spend (`workspaceMaySpend`, Part 4's one reading).

**The gates it does not ask, and why:** the pilot allowlist, a short code, the reply window, consent, a thread paused
for a person and the reply cap are all about a message leaving, and a draft does not leave. The owner's Send asks the
door, which asks them.

**What it spends:** the receptionist's day of tokens. Its `usage.llm_tokens` event is written through the one writer,
which moves from `whatsapp/persist.ts` into `receptionist/budget.ts`. With no `max_llm_tokens_day` set, drafts are
bounded by the reads: one draft per reading, at most `REACH_OUT_READS_PER_DAY` (200) readings a workspace a day.

**When nothing is drafted:** no brain, a spent budget, a workspace that may not spend, or an answer that escalates,
refuses or fails. The reading says why (`draft_why`), and the thread still has the reply for the owner to answer.

## Shape

- **Core:** `draftReply` in `packages/core/src/messages/reply-read.ts`, a verb over `ReplyReadPorts`: it reads the
  reading's plan, asks the draft port, and records the text or the reason with a compare-and-set on the reading's stage.
  No database client, provider or environment inside it.
- **The edge:** `apps/edge/lib/reach-out/reply-read.ts` builds the ports. The draft port loads the runtime with a
  `RoutedChannel` built from the workspace's mailbox, `{ kind: "email", channelId: mailbox.id, tenantId: the workspace's
tenant, externalId: the mailbox's address, numberE164: null, credentialsRef: null, config: {} }` (`tenantId` is required,
  `routing.ts:7`, and is what `loadTenantRuntime` reads everything by), and calls `generateReply` with
  `resolveSystemPrompt(brain, "whatsapp", tz, …)` and a lead note that says: this is an email answering a business that
  wrote back to the owner's reach-out; what the reach-out said; plain paragraphs, no emoji, no subject; end with the
  chain's `signed_by`; for not now, one line of thanks and nothing else. No wire is bound from the `RoutedChannel`: a
  draft sends nothing.
- **The store:** `reach_out_replies.draft`, `draft_state`, `draft_why` (the plan's PR 3 table; PR 5 fills them).
- **The page:** the thread's composer is seeded from the reading's draft (the plan's PR 7), as it is from a veto draft
  today.

## Steps

1. **This note** (the plan's PR 1), with the contracts that say which reading drafts (`readingPlan`).
2. **The draft** (the plan's PR 5): `tokenBudgetSpent` in contracts and the receptionist asking it; the usage writer in
   `budget.ts`; `draftReply` and its port; the job's draft stage between the apply and the notice. _Either order:_ an
   older edge never drafts, and a reading with no draft is what the page already handles (PR 7 reads `draft` as
   optional).
3. **When 0001's step 6 lands,** a lead thread's draft becomes a draft of that mechanism with `mayAutoSend: false`;
   `reach_out_replies.draft` is read from it, and this path (the draft port, `draftReply`, the lead note's email
   wording) is removed in the same change. Until then there are two paths to the brain, and this note is the record of
   the second.

## Tests

- Contracts: `readingPlan` drafts an answer for interested and a question, thanks for not now, and nothing for any
  other intent, an automatic reply, an unread reply or a re-read (`tooling/scripts/tests/reach-out-replies/`).
- PR 5: the verb over fake ports (a draft recorded; each gate that says no records its reason and drafts nothing; a
  thrown brain records `failed` and never throws the reading away); the edge port builds its `RoutedChannel` from the
  mailbox and binds no wire; `tokenBudgetSpent` is the one predicate the receptionist and the draft ask.

## Risks

- **Two paths to the brain** while both stand. A change to the receptionist's gates has to be made in both until step 3.
  The gates are listed here so a reviewer can hold them together.
- **The draft's prompt is the WhatsApp one.** `resolveSystemPrompt` has no email style, and the lead note carries the
  email's shape. Email's own style block is a change of its own that no note decides yet (0001 names none; its step 8
  is Meta DMs).
- **The budget's read fails open.** `tokensLast24h` answers 0 when its read fails (`budget.ts:133-135`), so a draft
  made while usage cannot be read is not held by the cap. The reads' own cap (200 a day) still bounds it.
- **The brain is Opus-class**, where the reading is Haiku: each interested, question or not-now reply costs one brain
  call. That is the receptionist's cost for any message it answers.

## Open questions for the owner

None: the spec's decision 6 and Ruben's N1–N6 (27 September 2026) settle what drafts and who sends.
