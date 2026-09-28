# 0001 · A channel-neutral inbound pipeline

**Status:** decided, not built. Written against commit `b729bdf`, and verified
against the code at it, with the working tree as it stood. Where this note and
the code disagree, the code wins.

## Context

### The engine is a WhatsApp handler that two channels borrow

`handleInbound` (`apps/edge/lib/whatsapp/inbound.ts:53`) is the receptionist.
The file is 879 lines. Its first two parameters are Meta's own shapes —
`WaRawMessage` and `WaChangeValue` — and its first act is to normalise them
(`inbound.ts:65`). Everything below reads the normalised record, never `m`, with
one exception: `m.type` and `m.timestamp` are still read directly in the alert
copy and the staleness check (`inbound.ts:119`, `:470`). The channel is decided
on one line — `const channel: "whatsapp" | "sms" = carrier?.channel ??
"whatsapp"` (`inbound.ts:66`) — so a null carrier means WhatsApp.

SMS gets in by being reshaped. `smsAsWaMessage`
(`packages/channels/src/lines/sms.ts:66`) turns Twilio's form fields into a
`WaRawMessage` whose `from` is bare digits, "so one person is one thread across
both channels" (`sms.ts:63-64`). `apps/edge/api/inbound-sms.ts:76` then calls
`handleInbound(smsAsWaMessage(inbound), {}, ...)` — an **empty**
`WaChangeValue`, a hole the SMS door fills with nothing because there is no
Meta envelope to hand it. What SMS supplies instead is an `InboundCarrier`
(`inbound.ts:43-50`): a wire, a body shaper, a hold, and the carrier's own
consent verdict, built by `carrierFor` (`apps/edge/lib/sms/sms-ingress.ts:132`).

### Email takes a different road and gets no reply

An email arrives at `apps/edge/api/resend-webhook.ts`, is judged by
`planResendEvent` (`apps/edge/lib/email/email-ingress.ts:49`), becomes an
`email_ingest` job, and is taken in by `ingestEmail`
(`packages/core/src/messages/email-ingest.ts:93`) through the handler at
`packages/jobs/src/handlers.ts:333`. The verb's own header says why it stops
there: _"It never answers: until the receptionist drafts email replies, every
email from a person is a person's to answer"_ (`email-ingest.ts:8-10`). It
flags the thread `email_review` and tells the workspace (`:126-143`).

That verb is the house pattern at its best: named ports (`:48`), named
outcomes (`:74`), no module state, and an adapter in `packages/jobs` that knows
the tables. It is the shape the inbound pipeline should grow into.

### The unions, measured — four, not three

| Where                                                  | Union                                 |
| ------------------------------------------------------ | ------------------------------------- |
| `apps/edge/lib/whatsapp/inbound.ts:66`                 | `"whatsapp" \| "sms"`                 |
| `apps/edge/lib/whatsapp/persist.ts:86`, `:118`, `:173` | `"whatsapp" \| "sms"`                 |
| `apps/edge/lib/receptionist/draft-queue.ts:34`         | `"whatsapp" \| "sms"`                 |
| `apps/edge/lib/receptionist/unfinished.ts:58`          | `INLINE_INTAKE = ["whatsapp", "sms"]` |

The fourth is the deadman sweep's, and its comment states the rule this design
must obey: _"A new channel is excluded by construction, which is the safe
direction: a channel is added here only once somebody decides this sweep owns
it"_ (`unfinished.ts:55-57`). Against them, `packages/core/src/deliver.ts` is
already channel-neutral: `Channel` (`:36`) is `"whatsapp" | "sms" | "email"`,
`Sender` (`:71`) owns its own address format, and `Wire` (`:79`) is
three-valued — absent, null, or a function. The way **out** is solved; the way
**in** is not.

### The thread's reply window is a WhatsApp column

`conversations.last_wa_inbound_at` is declared at
`supabase/migrations/00002_conversations.sql:74`, commented _"THE 24h
template-window source (WhatsApp customer-inbound only)"_. It is written in
exactly one place, and only for one channel: the current `ingest_inbound`
(`supabase/migrations/00110_a_texted_answer_keeps_its_evidence.sql:237-245`)
guards the update with `if p_channel = 'whatsapp' then`.

Measured: **76 files** name the column. Outside `tooling/scripts/tests` and
`docs`, **29** — 16 migrations, 9 TypeScript (the conversation route, the Today
and Inbox view models, `server/dto.ts`, `server/verbs.ts`, `ask/proposals.ts`,
`core/conversations/reply.ts`, the generated types, one legacy-bridge sample),
and 4 tooling scripts.

**`replyWindow` is not WhatsApp-only.**
`packages/contracts/src/policy.ts:153-160` already takes the reply channel and
answers `{ open: true, closesAtIso: null }` for `"sms"` and `"email"`, falling
through to `waWindow` over `last_wa_inbound_at` otherwise. WhatsApp-only are
the _window_ and the _column it reads_. The function is the right seam and
needs no new caller — it needs a different fact underneath it.

### The doors, the frozen contract and the rest of the seams

`apps/edge/api/whatsapp.ts` declares its contract in its header:
_"process-then-200 in-invocation under maxDuration 60; Meta retries + dedupe
make replays safe"_ (`:15-17`). The observable rule is two lines: `if
(unrecorded > 0) return json(503, ...)` (`:240`) else `json(200, { ok: true })`
(`:241`). `tooling/scripts/golden-edge.mjs:62-103` pins the handshake, the two
401s, a signed status payload, a dropped non-allowlisted text and raw-byte HMAC
against a deployed URL. Three node tests execute the doors over a database in
memory: `whatsapp-door.test.mjs` (597 lines, 11 tests), `sms-door.test.mjs`
(469 lines, 9 tests) and `inbound-executed.test.mjs` (471 lines, 26 tests), the
last running `handleInbound` itself through `setInboundPorts`
(`apps/edge/lib/whatsapp/ports.ts:65`).

The seams are ready. `replyPosture` (`apps/edge/lib/receptionist/reply-posture.ts:55`) and
`effectiveReplyMode` (`:80`) are pure and dependency-free; `loadTenantRuntime`
(`apps/edge/lib/tenant-runtime.ts:162`) is the one door to the control plane;
`InboundPorts` (`apps/edge/lib/whatsapp/ports.ts:26`) already names everything
the handler reaches outside itself; `steps.ts` holds the pure decisions; and
`pgSink` (`persist.ts:167`) is the sink every branch reports through.
`contact_identities.channel` has allowed `whatsapp | voice | sms | email |
instagram` since `00002_conversations.sql:56` — but `messages.channel` has
not: `00002_conversations.sql:91` allows `whatsapp | voice | sms | email |
system`, and no later migration widens it.

## Decision

One `InboundMessage` shape, produced by one adapter per channel in
`packages/channels`. The pipeline — normalise, ingest, posture, brain, deliver —
becomes verbs over ports in `packages/core/src/inbound/`, the way
`packages/core/src/conversations` and `packages/core/src/campaigns` already work:
a port named for what it means, never for the table it touches, with the
adapter that knows both at the edge. The doors shrink to what two of the three
already are — verify the wire, build the ports, hand over the verdict — with
`planSmsIngress` and `planResendEvent` as the model, and the WhatsApp door's
frozen HTTP contract unchanged.

Email joins the pipeline in **draft mode**. `mailboxes.reply_mode`
(`supabase/migrations/00126_a_workspace_has_a_mailbox.sql:41`) already exists,
defaults to `'draft'` and has no reader in TypeScript. The receptionist
composes, the draft waits, a person sends: nothing sends itself on a channel
whose sender verification we do not control, which is what
`email-ingest.ts:10-11` reserves.

The reply window stops being a column and becomes a per-channel policy. The
fact the policy needs is "when did this person last write on _this_ wire",
which `messages` already holds. The column stays, written as it is, until every
reader is off it.

Instagram and Messenger DMs slot in **at the door, not at the pipeline**. They
arrive on Meta's Graph webhook family, signed the same way
(`x-hub-signature-256` over the raw body, `apps/edge/api/whatsapp.ts:79-85`),
routed by a page or account id the way `WABA_FIELDS`
(`apps/edge/lib/whatsapp/waba-events.ts:26`) routes account news by WABA id. Shared: the
signature scheme, the envelope walk, the 503-vs-200 ack rule, and — once this
lands — the whole pipeline behind the adapter. **Not** shared: the message
shape (no `wa_id`, no phone number); the identity (an account-scoped id under
`contact_identities.channel = 'instagram'`, never a number); the reply window
(its own rule, not WhatsApp's template rule); the sender (a different Graph
endpoint); and the consent model (no carrier, no STOP keyword obligation). A DM
also has **no row today** — `messages.channel` refuses `'instagram'` — so the
first Meta-DM slice starts with a migration on that CHECK.

## Shape

### The message

```ts
// packages/channels/src/inbound.ts — new
export type InboundChannel = "whatsapp" | "sms" | "email" | "instagram";

/** One inbound customer message, whatever brought it. */
export interface InboundMessage {
  channel: InboundChannel;
  /** The provider's id for this delivery: the replay gate. */
  externalId: string;
  /** How this person is known here: a wa_id, E.164 digits, an address, an IGSID. */
  identity: { externalId: string; phoneE164: string | null; email: string | null };
  profileName: string | null;
  /** "text or attachment" — what messages.type stores. */
  type: "text" | "media";
  /** What KIND arrived, which is not the same question (whatsapp.ts:70-83). */
  kind: "text" | "media" | "reaction" | "location" | "contacts" | "system" | "unsupported";
  rawType: string;
  body: string | null;
  channelTsIso: string | null;
  media: MediaRef | null;
  consent: { optOut: boolean; optIn: boolean; optInMarketing: boolean };
  /** Anything only this channel has: an email's headers, a DM's story reply. */
  extra: Record<string, unknown>;
}
```

`NormalizedInbound` (`packages/channels/src/whatsapp.ts:64-94`) is this shape
already, minus the channel and with `waId`/`phoneDigits` in place of
`identity`. The adapter is a rename plus a widening, not an invention.

### The module layout

```
packages/channels/src/inbound.ts   InboundMessage, InboundChannel, MediaRef
packages/channels/src/whatsapp.ts  + inboundFromWhatsapp(m, value)
packages/channels/src/lines/sms.ts + inboundFromSms(s, nowMs)  (replaces smsAsWaMessage)
packages/channels/src/email.ts     + inboundFromEmail(e)       (IncomingEmail -> InboundMessage)
packages/channels/src/meta-dm.ts   + inboundFromMetaDm(m)      (later)

packages/core/src/inbound/ports.ts    the ports the verbs read the world through
packages/core/src/inbound/ingest.ts   ingestMessage() — persist first, replay gate, thread
packages/core/src/inbound/answer.ts   answerInbound() — the gates, the model turn, layer two
packages/core/src/inbound/index.ts
```

`answerInbound` keeps the gate order `docs/conversation-flow.md` §5.1 records,
because the order is the product. What changes is that it reads
`InboundMessage` and a `ChannelCapabilities` record instead of a carrier:

```ts
export interface ChannelCapabilities {
  channel: InboundChannel;
  /** The words shaped for this wire: the SMS footer, an email's quoted reply. */
  body(text: string, isFirstReply: boolean): string;
  /** Every message held for a person for now (an unapproved SMS line). */
  held: { reason: string; details: string } | null;
  /** May the receptionist send here with no person: false for email at first. */
  mayAutoSend: boolean;
  window: "always_open" | "wa_24h";
}
```

### The reply window

```sql
-- the per-channel fact that replaces conversations.last_wa_inbound_at
create table public.conversation_channel_state (
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  channel         text not null check (channel in ('whatsapp','sms','email','instagram')),
  last_inbound_at timestamptz not null,
  primary key (conversation_id, channel)
);
```

`ingest_inbound` writes this row for **every** channel and goes on writing
`last_wa_inbound_at` exactly as today, for as long as a reader remains.
`replyWindow` keeps its signature; only the value handed to its second argument
changes, from the column to this table's `whatsapp` row.

## Steps

The README rule governs every step: the two apps deploy independently, so each
must be correct whichever goes first.

**1 · Extract, with no behaviour change.** Move the body of `handleInbound`
into `packages/core/src/inbound/answer.ts` behind the existing `InboundPorts`,
leaving `apps/edge/lib/whatsapp/inbound.ts` a shim with the same export and
signature. No line of `apps/edge/api/whatsapp.ts` changes, so
`golden-edge.mjs:62-103` sees the same surface. _Both orders:_ the dashboard
does not import this path, and the edge carries its own committed `dist`.

**2 · `InboundMessage` beside `WaRawMessage`.** Add the type and
`inboundFromWhatsapp` / `inboundFromSms`; the pipeline accepts either shape for
one release, converting at the boundary. Delete nothing. _Both orders:_ a new
exported type changes no wire and no row.

**3 · The doors become adapters.** `apps/edge/api/inbound-sms.ts` calls
`inboundFromSms` and stops passing `{}` as a Meta envelope;
`apps/edge/api/whatsapp.ts` calls `inboundFromWhatsapp` inside its existing
per-message `try`, keeping the `IngestFailed` count and the 503 (`:217`).
_Both orders:_ the dashboard is not involved.

**4 · The per-channel row.** Ship the migration and have `ingest_inbound` write
`conversation_channel_state` **in addition to** `last_wa_inbound_at`. Nothing
reads it yet. _Both orders:_ both apps ignore a table they have never heard of,
and the column they do read keeps its old value and its old writer. This is the
step that makes the column change safe in either direction, and the reason the
column is not dropped here.

**5 · Readers move.** `packages/core/src/conversations/reply.ts:170`,
`packages/contracts/src/viewmodels.ts:695`, `packages/contracts/src/people.ts`
(`:815`, `:1479`) and `apps/dashboard/src/server/ask/proposals.ts:200` read the
new fact through one accessor; `replyWindow`'s signature does not change.
_Both orders:_ an older edge still writes both facts, an older dashboard still
reads the column, and the column is still written.

**6 · Email joins the pipeline in draft mode.** `ingestEmail` keeps its replay
gate and its `email_review` flag and gains a branch: when `mailboxes.reply_mode`
is `'draft'`, hand the message to `answerInbound` with `mayAutoSend: false` and
queue the reply through `queueDraft` with `channel: "email"`. Widen
`draft-queue.ts:34` and `persist.ts` in the same change: that is the day the
capability widens, and `docs/conversation-flow.md` G19 is explicit that the
union is narrow because the capability is. Add `"email"` to `INLINE_INTAKE`
(`unfinished.ts:58`) **only here**, after deciding what the sweep says about an
email — G11 is the record of getting that wrong once.

**7 · Drop the column.** Only once step 5 has stood long enough that no
deployed dashboard reads it, and after `ingest_inbound` stops writing it. A
separate change, shipped alone.

**8 · Meta DMs.** Widen `messages.channel` to accept `'instagram'`, add
`inboundFromMetaDm`, add the door. The pipeline needs no change if 1-6 landed.

## Tests

**Convert.** `tooling/scripts/tests/sms.test.mjs:207-210` asserts on **source
text**: it matches `reply.ts` for a literal statement. It breaks on any rename
and proves nothing about behaviour; it becomes a behavioural test through
`core-reply.test.mjs`.

**Keep meaningful.** `whatsapp-door.test.mjs` must go on asserting the same
eleven outcomes through the same POST — the two 401s, the handshake, a routed
number, a number the database says is not ours, a number it could not answer
for (503 with the count), the environment's number riding the blip out, WABA
news, receipts, the two echo cases and the ack rule. Nothing in steps 1-3 may
change what it calls or what it asserts. `sms-door.test.mjs`'s nine cases
likewise; "a text on an approved line is answered on that line" is the one that
proves step 3's adapter swap preserved the footer and the E.164 shaping.
`inbound-executed.test.mjs`'s 26 cases run the engine over `setInboundPorts`,
so after step 1 they run the **core** verb with the same fakes: the import
moves, the assertions do not.

**New.**

- `inbound-shape.test.mjs`: `inboundFromWhatsapp` and `inboundFromSms` produce
  the same `InboundMessage` for the same words, and an SMS carries no `waId`.
- `reply-window.test.mjs` gains a case per channel against the new table, its
  four existing cases green through the accessor; plus a database test that
  step 4's dual write keeps both facts in step.
- `email-draft.test.mjs`: an email on a `draft` mailbox produces a queued
  message with `channel: "email"` and sends nothing; with no mailbox row it
  behaves exactly as today.

## Risks

- **The live line.** Step 1 is a pure move and the only step that touches the
  hot path; it ships alone, with `inbound-executed`'s 26 cases green.
- **The frozen contract.** Meta App Review pinned `process-then-200`. A step
  that changes _when_ the door answers, not only what it answers, is out of
  scope here.
- **A missed auto-reply beats a double text** (`inbound.ts:231`). Email's
  intake resumes; WhatsApp's skips. Step 6 puts them in one pipeline, and the
  two must stay separate facts about the channel, not one rule that wins.
- **Dual-writing a fact** costs a second write on the ingest path, the path
  that must never wait: one upsert on a two-column primary key, inside a
  function that already writes three rows.
- **The union that is a guard.** Widening `draft-queue.ts` before the email
  wire and its consent model exist admits email to a half-built road. Step 6 is
  one change for that reason.

## Open questions for the owner

1. **Does the receptionist ever send an email on its own?** This note says no,
   at first — `mayAutoSend: false`. `mailboxes.reply_mode` already permits
   `'veto'` and `'auto'`. Should a business be able to turn it up, and what
   proves the sender is who they say they are before we do?
2. **What does the deadman sweep say about an email?** Its words today — _"The
   receptionist never answered this"_ (`unfinished.ts:143`) — are wrong for a
   channel not meant to answer. Should the sweep own email at all, or is the
   mailbox's own health the only watch?
3. **Is a DM the same person as a phone number?** `conversations` is
   `unique (tenant_id, contact_id)` — one thread per person per workspace,
   across every channel — and a DM gives an account-scoped id and no number. Do
   we merge it into a contact, or keep them apart until somebody says so?
4. **Which channel does a reply go back on** when a person has written on two?
   `replyChannelOf` answers "where they last wrote", so a customer who emails
   and then texts has their email answered by text.
5. **How long may step 4's dual write stand?** It is the only thing making the
   column change safe in both deploy orders, and also a second copy of one fact.
