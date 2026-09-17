# Email: a fourth channel, and the business keeps its address

Status: approved plan, version 2, 17 September 2026. Version 1 (PR #600) was reviewed twice from outside and once against the code; this version folds in what those reviews got right and says where the code already answered them. Grounded in the channel code at `b3f3feed` (every seam below is named by file and line), in Resend's receiving, domains, webhooks and suppression documentation, and in RFCs 3834, 5322, 7489, 8601 and 8617. Where a fact is assumed rather than read, the sentence says so, and phase E0 exists to turn each assumption into a fixture before anything is built on it.

## 0. What this plan decides

- **Email is a message channel, not a second product.** A message row carries `channel = 'email'` the way it carries `sms`; the thread, the dispatcher, the jobs ledger, the consent axes, the Inbox and the receptionist are the ones that exist. The database already allows the value (`messages.channel`, `tenant_channels.kind`, `contact_identities.channel`, `00002_conversations.sql:12,56,91`); the code does not.
- **A person may have a phone, an email, or both.** Today a contact is keyed by phone (`contacts_tenant_phone_uq`, `00002:44-45`) and erasure hashes the phone (`erasure.ts:11`). That is the one structural change, and it goes first and alone.
- **The first release is one working conversation.** Receive, understand, draft, approve, send, receive the customer's reply, on a hosted address, draft-first. Marketing, reminders by email, lead parsers, owner copies, native sending and mailbox sync each come later, one at a time, when a customer's work needs them.
- **The business keeps its address.** Inbound arrives by a copy the owner routes to a Chanlytics address; outbound leaves as the business's own identity once its domain is verified and bound to that workspace, or as the hosted identity until then. No mailbox login and no mailbox-read permission in either mode.
- **Classification says what a message claims to be. Verified evidence decides what it may change.** No class of inbound mail, the owner's own included, changes a thread's state, a contact's reachability or a Setup row on the strength of a From header.
- **One timeline per person, one reply context per email.** Two unrelated email chains from one customer sit on one timeline; a reply to either uses that email's parent, subject and confirmed recipient, never the other's. The model writes the body. The server owns the envelope.
- **Replaying intake never creates a second customer message, and always finishes interrupted work on the first.** The provider's delivery id is the delivery key; the RFC Message-ID is threading and duplicate evidence, never the sole key.
- **Autonomy is the most restrictive of everything that applies.** Email starts in draft mode; a mailbox's dial can tighten the workspace's policy and never loosen it; in forwarding modes the receptionist cannot see a reply the owner sends from Gmail, the product says so, and an unknown parent holds the thread for a person instead of asserting that a person answered.
- **A domain failure after go-live holds sends and tells the owner.** The From address never changes silently. Switching to the hosted identity is an explicit act.

## 1. The summary

- **One subdomain, one provider.** `mail.chanlytics.com` sends and receives through Resend; the root's MX stays with Google Workspace. One signed webhook endpoint on the edge takes every Resend event and dispatches by type.
- **One mailbox per workspace,** hosted or own-domain, with the reply dial on it.
- **Intake is a pointer, then a job.** The door proves the webhook and enqueues; the job fetches the message, establishes what it is and what may be trusted, persists it, and resumes from where an interrupted run stopped.
- **The receptionist drafts; a person sends.** Drafts sit at the top of the thread as they do today, with the envelope the server built shown beside them. Veto and auto arrive later, capped by the workspace's own policy.
- **Ownership is what exists.** A thread the owner takes is paused and assigned, and the dispatcher re-reads that at fire time (`deliver.ts:214,224,293`). Email adds no state machine.
- **Sends are reproducible.** The complete request is persisted before the first attempt and retried unchanged; an edit is a new send.
- **Delivery and suppression are separate facts.** A delivered email that later draws a complaint stays delivered, and the address gains a suppression with its reason.

## 2. What the owner experiences

Take the moving company. It runs `info@bestmovers.com` on Google Workspace, and the owner answers from the phone between jobs.

**Setup gains one row, "Email".** Not started reads: "Customers who write to you by email get no receptionist yet." The verb opens a chooser:

> **How should the receptionist handle email?**
> 1. **Give me a Chanlytics address.** `bestmovers@mail.chanlytics.com` receives today. Put it on your site, or forward your existing address to it.
> 2. **Keep my address.** Forward a copy of `info@bestmovers.com` to Chanlytics, and send replies as `info@bestmovers.com` once your domain is verified. Until then replies go out from your Chanlytics address, and the card says so.
> 3. **Keep working in Gmail or Outlook.** Tell us. It is not built, and the button records that you asked.

**Path 1.** The row reads "Receiving at bestmovers@mail.chanlytics.com" the moment it is chosen, because that address really receives. A card says "Send it an email from your phone, then open the draft in the Inbox." Replies go out from the same address with a Reply-To that routes straight back, so a customer who answers is answered.

**Path 2** is two cards, each with its own state:

- **Incoming: forward a copy.** Per provider, the exact clicks. Gmail: Settings, Forwarding, add the Chanlytics address; Gmail then emails a confirmation code to that address, and once that message's origin is verified the card shows the code. Workspace with staff: the admin's routing rule. Microsoft 365: a mail-flow rule, with the note that many tenants block external forwarding until an admin allows it. The first forwarded message turns the card to "A message arrived". It turns to "Forwarding works" only after a test the card offers: the owner sends an email with a one-time word in the subject to their own business address, and it arrives here.
- **Outgoing: send as yourself.** The owner names the exact sender. The domain is bound to this workspace, the DNS records Resend returns are shown, verification is started once and its status read until it settles, and one real message is sent to an outside mailbox the operator inspects before own-domain sending is switched on. During the first customers this is assisted, by a person, on purpose.

One sentence sits under both: "Replies you send from Gmail are invisible to the receptionist. Take the conversation over here first, or reply from the Inbox."

If the domain later stops verifying, the row says "Sending is paused: the records at bestmovers.com are missing", new sends are held as drafts, and a button offers "Use the Chanlytics address for now". Nothing switches by itself. The row shows when the last message arrived and offers the connection test; a quiet week is not a fault.

**In the Inbox,** a customer's email shows as a bubble with the envelope glyph and its subject above the first line. The receptionist's draft sits at the top of the thread with Send and Edit, the subject and recipient the server chose shown above it, and "Replying to: Quote for my apartment move" when the person has more than one email chain. A changed recipient asks to be confirmed.

**On a person's page,** the email address sits under the phone and can be set or corrected there. Erasure erases both.

## 3. Facts the plan stands on

| Fact | Detail | Source |
|---|---|---|
| Resend receiving | Receiving works at a verified domain, including one already verified for sending, once receiving is enabled and its MX is published; the MX must be the lowest-priority record at that name, so a domain whose root already has a mail host receives on a subdomain; each arrival is a signed `email.received` webhook carrying metadata, and the body, headers and attachments are fetched by API afterwards; attachment download URLs expire. Which recipient field is authoritative for forwarded and multi-recipient mail is not documented to the precision routing needs: E0 settles it | Resend docs: Receiving, Custom receiving domains, Get email content, email.received |
| Resend sending | `POST /emails` takes `from`, `to`, `reply_to`, `subject`, `text`, `html`, `headers`, `tags`, `attachments`; the response id is the provider's email id, a different thing from the RFC `Message-ID`, which Resend reports on the sent event and on retrieval (since 8 July 2026); idempotency keys are honoured for 24 hours and a reused key with a changed payload is an error | Resend docs: Send email, Idempotency keys; changelog, Message-ID for sent emails |
| Resend domains | A domain is created by API and returns the DKIM and return-path records to publish; `POST /domains/{id}/verify` starts an asynchronous verification, and status is read with `GET /domains/{id}`; domains and volume are limited by plan, and inbound messages and every additional outbound recipient count toward usage | Resend docs: Domains API, Verify domain, Account quotas and limits |
| Webhook proof | Resend signs webhooks (Svix headers `svix-id`, `svix-timestamp`, `svix-signature`; HMAC-SHA256 over `id.timestamp.body` with the endpoint secret; the raw body must be used); delivery is at least once and unordered | Resend docs: Verify webhook requests, Managing webhooks |
| Google scopes | `gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.insert`, `gmail.metadata`, `gmail.settings.*` and `mail.google.com` are restricted: verification plus a periodic security assessment under the App Defense Alliance CASA framework, at the level Google assigns. `gmail.send` is sensitive, not restricted: verification, no assessment | Google Cloud Help, Restricted scopes; Google for Developers, Gmail API scopes |
| Google forwarding | Gmail forwards new mail (not spam) to a confirmed address; the confirmation is an email with a code to the destination; filters can forward a subset. Workspace admins can route an inbound copy (dual delivery) and add recipients on outbound mail | Gmail Help, Automatic forwarding; Workspace Help, Routing, Dual delivery |
| Microsoft | Delegated `Mail.Read` and `Mail.Send` do not require admin consent by the permission reference, but the default consent policy keeps a new app's `Mail.Read` behind admin consent in most tenants; application-level `Mail.Send` needs admin consent and should be scoped by an application access policy; Defender's outbound spam policy blocks automatic external forwarding by default | Microsoft Learn: Graph permissions reference, App consent policies, Outbound spam policies |
| Auto-submitted mail | `Auto-Submitted: auto-replied` marks an automatic response to a message, which is what a receptionist's reply is; `auto-generated` marks mail a program produced on its own, which is what a marketplace lead is; responders answer neither, nor mail with `Precedence: list` or `bulk` | RFC 3834 |
| Threading | A reply carries a new `Message-ID`, `In-Reply-To` naming the parent and `References` carrying the chain | RFC 5322 §3.6.4 |
| DMARC | Passes on an aligned SPF or DKIM result; under strict DKIM alignment the signing domain must equal the From domain; multiple DMARC records at one name are treated as none | RFC 7489 §3.1, §6.6.3 |
| ARC and Authentication-Results | A valid ARC chain preserves upstream results across a forwarder, and trusting them is the receiver's decision about the sealer; an `Authentication-Results` header is evidence only when the party that wrote it is inside the receiver's trust boundary. A provider-signed webhook proves the event came from the provider, not that every assertion inside the email is true | RFC 8617, RFC 8601 |
| Suppression | Resend reports `email.bounced`, `email.complained`, `email.failed` and `email.suppressed` as distinct events and keeps a team-wide suppression list; a complaint says nothing about whether the address exists | Resend docs: Email suppressions, webhook event reference |
| Delivery | Authentication passing does not place a message in the inbox; reputation, content and recipient filtering decide the rest | Resend knowledge base |
| This repo's own mail | `chanlytics.com` is verified in Resend for sending (DKIM live, return path on `send.chanlytics.com`), mail is on Google Workspace, and the domain publishes two DMARC records, both `p=none`; `notify.ts` sends plain text only and discards the message id | Resend account, DNS, `apps/edge/lib/notify.ts:82-107` |

## 4. What exists, and where email meets it

The channel is half built by accident of good design. What follows is every seam, by file and line, so the phases in §15 are honest about their size.

| Seam | Where | State today |
|---|---|---|
| Channel union at the wire | `packages/core/src/deliver.ts:36` | `Channel = "whatsapp" \| "sms"` |
| The sender port | `deliver.ts:66,74` | `Sender = (to, WirePayload) => SendResult`; `Wire = Partial<Record<Channel, Sender \| null>>`; `undefined` = no such channel, `null` = no credentials here |
| The wire payload | `deliver.ts:60-63` | `{ body, template? }`; no subject, no headers |
| The refusal gate, in order | `deliver.ts:188-226` | erased → channel policy (`sms_carries_no_promotions`, :198) → consent by purpose (`mayMessageFor`) → a person's own reply passes → workspace paused → assignee holds a draft → thread pause holds every non-draft, non-system send → `superseded_by_human` (:293) |
| Sender choice | `deliver.ts:309-313` | three-state lookup; a new channel with no wire fails as `no_sender_for_channel` at runtime, not at compile time |
| The outbound row | `packages/db/src/repositories/ingest.ts:117-173` | `recordOutbound` takes `channel?: "whatsapp" \| "sms"` (:132), defaults to WhatsApp (:141) |
| Receipts | `ingest.ts:340-359` | `recordStatusByExternalId(db, tenantId, externalId, status, errorDetail?)`, channel-agnostic, monotone by trigger |
| The receipt door pattern | `apps/edge/api/sms-status.ts` (76 lines) | prove, resolve the line from `From`, map the status, move the row; 503 when the database is down so the provider retries; 2xx for anything it must not retry |
| The signature pattern | `apps/edge/api/retell-webhook.ts:152-197` | verify two body forms, log the verdict, record a refused delivery at most once a minute, 401 |
| The Resend call | `apps/edge/lib/notify.ts:32,82-107` | `POST https://api.resend.com/emails` with `{from,to,subject,text}`; returns a boolean |
| The inbound road | `apps/edge/lib/whatsapp/inbound.ts:43-63` | `InboundCarrier { channel: "sms"; send; body; held; consent? }` is how SMS rides the WhatsApp handler; `handleInbound(m, value, tenantId, routed, isEnvDefault, routingFailed, carrier, ports)` |
| The road's gates | `inbound.ts:153-983` | short code, pilot allowlist, persist, wires bound (:209-212), dedupe (:256), person mode, consent and STOP (:327-396), carrier hold (:402), non-text, vision, staleness, opt-in confirmation (:586, WhatsApp-conditional), thread pause and rate cap (:622), token budget (:650), workspace paused (:672), persona hold (:692), brain (:740, `resolveSystemPrompt(brainCfg, "whatsapp", …)` at :787), layer two, hold or veto and the queue (:843-901, `queueReply(... channel)` at :869), dispatch |
| The SMS door pair | `apps/edge/api/inbound-sms.ts` (the wire), `apps/edge/lib/sms-ingress.ts` (the judgement: `planSmsIngress`, `carrierFor`) | the exact pair an email door mirrors |
| The SMS adapter | `packages/channels/src/sms.ts:66-72` | `smsAsWaMessage(SmsInbound, nowMs): WaRawMessage` |
| Jobs | `packages/contracts/src/enums.ts:48-64`, `packages/jobs/src/handlers.ts:287-292`, `ledger.ts:57`, `supabase/migrations/00109:15-17` | four kinds; a kind arrives with its handler, its caller and the CHECK together; `SPEAKS_TO_A_PERSON` names the kinds that never retry after a lost run; the `outbound_send` payload names `to_phone` (`packages/core/src/messages/send.ts:6`) and reads the channel off the row (:35) |
| Consent | `packages/contracts/src/consent.ts:52-88` | `mayMessageFor(contact, purpose, { proactive })`: marketing fails closed, conversational fails open; the one channel override lives at `deliver.ts:198` |
| Broadcasts and playbooks | `packages/core/src/messages/broadcast.ts:164-165` | `to: c.phone_e164`, `channel: "whatsapp"`, hardcoded |
| Templates | `deliver.ts:377` | `templatePurpose` reads WhatsApp templates only |
| People | `packages/contracts/src/people.ts:255-269,1235` | `PersonChannel = "whatsapp" \| "voice"`; Channels renders a two-way ternary |
| Facts | `packages/contracts/src/facts.ts:61-71,85-98` | `KnownFacts.channels[].number_e164`; no email fact |
| Setup | `packages/contracts/src/setup.ts:401-680` | eleven rows from one function; the dashboard and the back office both read it (`legacy-bridge/setup.ts:98`, `platform.ts`) |
| The Inbox | `packages/contracts/src/viewmodels.ts:580` | `channel: onPhone ? "phone" : m.channel === "sms" ? "sms" : "whatsapp"` collapses everything else to WhatsApp; `inbox-thread.jsx:269,590` already map `"mail"` to the envelope icon; `surface-data.ts:307` is where the real label `email: "Email"` goes |
| Contacts | `00002:28-45` | no email column; the phone index is partial, so `getOrCreateContact` (`ingest.ts:175-…`) is insert-then-reselect |
| Messages | `00002:86-147` | `channel` allows `email`; no subject column; `messages_guard` makes content immutable and status monotone |
| Identities | `00002:52-61` | `contact_identities (tenant_id, channel, external_id)` unique, allows `email`; nothing reads it today |
| Erasure | `packages/contracts/src/erasure.ts:11-15`, `00124:23-25` | `erasedPhoneHash(tenantId, phoneE164)`; `contacts.erased_phone_hash` |
| Vault | `00066:53-100` | `put_line_credentials` merges one secret per saga step; `get_line_credentials` reads it; service role only |
| Generated types | `tooling/scripts/check-db-types.mjs:1-39` | every migration is followed by `supabase start && corepack pnpm gen:db-types`, committed with it |
| Tests | `tooling/scripts/tests/_fake-db.mjs`, `sms-status-door.test.mjs` | the double and the door-test shape |

Already right and untouched: the enums (`enums.ts:14,20`), the three database CHECKs, the mock labels (`inbox-data.jsx:549`), the channel icon type (`contracts/channels.ts:79`).

Four facts the reviews asked about, read from the code:

- **The retry gate skips on purpose.** `inbound.ts:250-259` returns on any message it has seen and says why: a missed auto-reply beats a double text, so the processed mark is deliberately not consulted; the unfinished sweep (`apps/edge/lib/unfinished.ts`) hands the orphan to a person. The ingest result already carries `processed` (`ingest.ts:42-43`), which is what the email job resumes on.
- **Message metadata is writable.** `messages_guard` (`00002:114-147`, amended in `00003`, `00015`, `00098`, `00111`) freezes content columns and an `external_id` once set; `meta` is where the processed mark lives today.
- **The WhatsApp brain holds no tools.** `apps/edge/lib/brain.ts` returns words, a confidence and a hand-off token; nothing it does while drafting is irreversible.
- **A contact changes through a door.** `00054_person_details.sql`: `set_person_name`, `set_person_notes`, definer functions for an owner or operator that record an event. `00101` extends erasure by trigger rather than by recreating `erase_contact`. `00121` fences `contacts` by column grant. E1 follows all three.

## 5. Identity: a person may have a phone, an email, or both

**Decision: the address lives on the contact, beside the phone.** `contacts.email` mirrors `contacts.phone_e164`: nullable, unique per workspace where present, erased with the row, remembered after erasure only as a keyed digest. The `contact_identities` table allows an email identity, but nothing reads it for lookup, People does not count it and erasure does not clear it by address; a second home for the same fact is how the two drift.

The migration follows the person-doors pattern the repository already has (`00054_person_details.sql`), not a bare column:

- `contacts.email text`, held to its stored shape by a CHECK (trimmed, lower-cased, one `@`, 3 to 254 characters), unique per workspace by a partial index, and added to the column grant `authenticated` reads (`00121`).
- `contacts.erased_email_hash text`, the digest `beginErasure` writes beside the phone's, indexed like `00124`'s.
- **An erased row holds no address,** by trigger, the way `00101` clears the marketing answer: whatever path erases the row, the address goes with it, and `erase_contact`, the one path the right to be forgotten runs through, is not recreated to add a column.
- `set_person_email(p_contact_id, p_email)`, a definer door for an owner or operator that validates, stores, refuses a second person with the same address in the owner's words, and records `contact.email_set`. An empty address clears it.
- `people_list` returns `email` and its search matches it.

Rules the code enforces, in `packages/contracts/src/identity.ts` (new, pure):

- `normalizeEmail(raw): string | null` trims, lower-cases, and refuses anything that is not one local part, one `@` and a dotted domain, or that carries a control character. It keeps dots and plus tags: `a.b+c@x.com` and `ab@x.com` are different people to this product. Lower-casing the local part is a product policy stated here, not a claim about SMTP.
- `whyNotAnEmail(raw)` says which kind of not-an-address it was given, in the product's words, as `whyNotAPhone` does.
- `erasedEmailHash(tenantId, email)` beside `erasedPhoneHash`, one private digest function under both.
- A message from an address that matches a contact joins that contact. A person known by phone who now writes by email is a second contact until the owner merges them; the product does not guess that two identifiers are one person.

**No reachable-contact CHECK.** Production has no live contact without a phone today, but a constraint that a row must have one identifier buys nothing the doors do not already enforce, and it would make every future identifier a migration of that constraint.

**The phone-assumption audit is part of E1,** not a follow-up: every reader that assumes a live contact has a phone is fixed or made to refuse visibly. WhatsApp audiences exclude a person with no phone, with the reason; the Inbox composer refuses a channel the person cannot be reached on; labels fall back name, WhatsApp name, phone, email. Broadcast and playbook routing are otherwise unchanged. No `preferred_channel`, no `reachFor`: an inbound email already knows its channel.

Generated types are regenerated with the migration and committed with it, or CI refuses (`check-db-types.mjs`).

## 6. The mailbox, its addresses and its domain

**One `mailboxes` row per workspace, shaped like a line but smaller.** Only state something reads:

| Column | Meaning |
|---|---|
| `tenant_id` | unique: one mailbox per workspace at launch; a second is a migration and a routing decision, on purpose |
| `local_part` | `bestmovers`: the hosted address, sending and receiving; unique across the platform; never reassigned to another workspace |
| `reply_token`, `reply_token_prev` | the opaque part of `r+<token>@…`; a rotation keeps the previous token routing until it is revoked, so old reply chains keep working; a compromise revokes at once |
| `mode` | `hosted` or `own_domain` |
| `from_name` | the display name |
| `forwarded_address` | the business address the owner routes from, when there is one |
| `own_from`, `own_domain` | the exact sender and its domain; `own_domain` is unique across the platform, which is the binding that stops a second workspace sending as a domain the shared Resend account already verified for the first |
| `provider_domain_id`, `domain_status` | Resend's id and the status last read: `none`, `pending`, `verified`, `failed` |
| `own_sending` | `off`, `on`, `held`: `on` only after the assisted test; `held` when a live domain stops verifying |
| `forwarding_verified_at`, `last_received_at` | the nonce test's time, and the last arrival |
| `reply_mode` | `draft`, `veto`, `auto`; default `draft` |
| `last_error`, timestamps | as `lines` |

RLS: members read, the service role writes, and the routes that change the sender identity or the dial are owner-only. No Vault functions: every launch workspace sends through the platform's Resend key, which stays where the platform's secrets already live. Per-workspace credentials arrive with the native connection that needs them.

**One subdomain.** `EMAIL_DOMAIN=mail.chanlytics.com` on the edge, verified in Resend for sending and enabled for receiving, with Resend's MX as that subdomain's only MX. The root `chanlytics.com` keeps Google's. Bounces return to the return-path subdomain Resend assigns, not to the receiving address, so one subdomain does both jobs without a loop.

**Addresses a workspace owns:** `local_part@mail.chanlytics.com`, published and sent from; `r+<reply_token>@mail.chanlytics.com`, the Reply-To in hosted mode. The token routes a message to a workspace. It does not authenticate a sender and it names no thread: the thread is found from the email's own parent headers, checked against this workspace's and this contact's messages only.

**Resolving a delivery to a workspace** uses the exact recipient address the platform assigned, from the recipient field E0 proves authoritative for forwarded, direct and multi-recipient mail. When one delivery names two workspaces' addresses, each gets its own job. No routing by display name, by a header the sender writes, or by a model.

**The own-domain flow** (`packages/channels/src/email-domain.ts`, the pure plan; `apps/edge/lib/email-domain.ts`, the steps): bind the domain to the workspace (the unique index is the lock) → `POST /domains` → show exactly the returned records → `POST /domains/{id}/verify` once → read `GET /domains/{id}` on the ten-minute sweep until it settles, rate-limited when the owner presses Refresh → the operator's outside-mailbox test → `own_sending = 'on'`. A later failure sets `held`, pages nobody, and says so on the row; the owner's explicit switch sets `mode = 'hosted'`. A send that was already attempted keeps its frozen request whatever happens to the mailbox afterwards.

## 7. Outbound: the wire

**The port stays; the payload carries an envelope the server built.**

```ts
// packages/core/src/deliver.ts
export type Channel = "whatsapp" | "sms" | "email";

/** What one email reply is a reply to. Built by the server from stored rows, never from model output. */
export interface EmailEnvelope {
  subject: string;
  /** The Chanlytics message being answered, and its RFC id and chain when it has them. */
  parentMessageId: string;
  inReplyTo: string | null;
  references: string[];
  /** Who wrote the words, which decides Auto-Submitted. */
  actor: "ai" | "human";
}

export interface WirePayload {
  body: string;
  template?: TemplateSend;
  /** Required on the email wire and refused at runtime when absent; meaningless elsewhere. */
  email?: EmailEnvelope;
}
```

`buildReplyEnvelope(parent, contact, tenantId)` in `packages/core/src/messages/email-reply.ts` is the only constructor: it refuses a parent from another workspace or another contact, derives `Re: <parent subject>` without stacking prefixes, carries the parent's `References` plus its Message-ID, and takes the recipient from the contact's stored address, not from the parent's headers. A reply whose recipient differs from the parent's sender is a confirmation in the Inbox, not a silent send. No reply-all: other participants are kept on the row for the owner to see.

**`emailSender(mailbox): Sender | null`** (`packages/channels/src/email-resend.ts`, the HTTP; `packages/channels/src/email.ts`, the pure request builder):

- From: `own_from` while `own_sending = 'on'`, else the hosted address; `from_name` as the display name. While `held`, the sender is `null` and the dispatcher's existing `no_credentials` failure surfaces it; nothing falls back.
- Reply-To: the reply-token address in hosted mode; the business address in own-domain mode once forwarding is verified.
- Headers: `In-Reply-To`, `References`; `Auto-Submitted: auto-replied` when `actor` is `ai` (RFC 3834's word for an automatic response to a message), absent for a person's own reply. No client-minted Message-ID: Resend reports the one it used on the sent event, and the receipts door stores it.
- Tags: the internal message id and the tenant id, so every receipt names the row it belongs to without a lookup by provider id, and a receipt that arrives before the send's own write still finds its row.
- Body: plain text, with an escaped paragraph-only HTML twin. The signature is composed from the profile. The model's output is text in a text field; it is never parsed for headers.
- **The frozen request.** Before the first attempt the complete request (from, to, reply-to, subject, text, html, headers, tags, idempotency key) is written to the queued row's `meta.email.request`. A retry sends those bytes. An owner's edit, or a changed identity, cancels the row and creates a new one with a new approval. The idempotency key is the row id; Resend honours it for 24 hours and refuses a reused key with a changed payload, which is the behaviour a frozen request wants.

**Refusals added to the dispatcher,** beside `deliver.ts:198`:

```ts
if (d.channel === "email" && d.purpose === "marketing") return "email_marketing_disabled";
if (d.channel === "email" && f.contact.email_suppressed_at) return "email_suppressed";
```

Marketing by email does not exist until a release of its own delivers opt-out handling and consent rules; it is refused at the door, not hidden in a menu. `outbound_send` on an email row stays under `SPEAKS_TO_A_PERSON` (`ledger.ts:57`): a run that died mid-send is not replayed blindly. Within Resend's 24 hours the frozen request and its key make one bounded retry safe; after that the row is reconciled against receipts, or a person looks.

**Receipts** arrive at the one webhook door (§8) and are handled inline, the `sms-status.ts` way, because they are small, idempotent and resolved by tag: `email.sent` stores Resend's id and the RFC Message-ID; `email.delivered` moves the row; `email.delivery_delayed` is interim; `email.bounced` (permanent), `email.complained` and `email.suppressed` write `contacts.email_suppressed_at` and `email_suppressed_reason` (`hard_bounce`, `complaint`, `provider`) for the address that was the target, and only `bounced` and `failed` move the row to `failed`. A complaint after delivery leaves the row delivered. A corrected address clears the suppression, because it is a different address. A `429` is read for its kind: a rate limit waits out `retry-after` inside the job's deadline, an exhausted quota is a hold the operator is paged about.

## 8. Inbound: the door, the job, the road

### The door

`apps/edge/api/resend-webhook.ts`, one endpoint, one secret (`RESEND_WEBHOOK_SECRET`):

1. Read the raw body, bounded at 256 KB (the event is metadata). Verify the Svix signature over `id.timestamp.body` with Web Crypto, constant-time, timestamp within five minutes: the house pattern the Meta, Twilio and Retell doors use (`packages/channels/src/email.ts` `verifyResendWebhook`), pure and tested against signed samples. A failure is 401 and one `webhook.auth` row a minute at most, as `retell-webhook.ts:177-194` does.
2. Dispatch by type. Receipt types: §7, inline, 503 when the database is down. `email.received`: step 3.
3. Resolve each recipient address to a mailbox. For each, insert one `email_ingest` job with `{ mailbox_id, received_id }`, unique on that pair, so a replayed webhook inserts nothing and a delivery to two workspaces inserts two. No match: 200 and a counted, rate-limited `email.unroutable` event, not a row per hostile message.
4. 200 once the jobs are written; 503 when they cannot be.

### The job

`emailIngest(ctx, job)` in `packages/jobs/src/handlers.ts`, the judgement in `apps/edge/lib/email-ingress.ts`, in stages that each leave a durable mark, so a retry resumes:

1. **Erasure and limits.** A tombstoned address (`erased_email_hash`) is dropped before anything is stored. Size caps: 1 MB of text considered, 10 MB and five attachments recorded as metadata, the rest noted on the row and dropped.
2. **Fetch.** The received email by id: headers, text, html, attachment list. HTML becomes text through a maintained converter, with no network fetches. A failed fetch fails the job, which retries (`email_ingest` does not speak to a person).
3. **Persist.** `ingest_inbound` with the Resend received id as `external_id`, the RFC Message-ID, parent ids, subject, participants and the automatic-mail markers in `meta.email`. The existing uniqueness on `(tenant_id, external_id)` makes a replay find the row. A different received id carrying a Message-ID this workspace has already stored from the same sender is a duplicate candidate: identical text is dropped with a note, different text is kept and flagged for a person.
4. **Resume, not skip.** The ingest result already says `processed` (`ingest.ts:42-43`). The WhatsApp road deliberately ignores it, because there a missed auto-reply beats a double text (`inbound.ts:250-259`). Email is draft-first, a second draft is harmless and a lost customer email is not, so this job continues when the row exists and `processed` is false, and returns only when it is true.
5. **Establish what it is, then what may be trusted** (`classifyInbound`, `trustOf`; pure, in `packages/channels/src/email.ts`). Classification names the claim; nothing acts on it until its own evidence is checked:

| Claim | Evidence required before any effect | Effect |
|---|---|---|
| Our own send returning (a forward loop, a dual delivery) | the Message-ID or the tagged id is in this workspace's ledger | none; the job is done |
| The owner's outgoing copy | arrives through the mailbox's configured outgoing-copy route, authenticated as E0 defines, and names a customer this workspace has a thread with | recorded as the owner's message; the thread is paused; never inferred from a From header alone |
| A forwarding confirmation | the provider's authenticated origin, and a forwarding setup pending on this mailbox | the code is shown on the Setup card; nothing else |
| A delivery report by email | none sufficient | recorded for a person; automatic suppression comes only from Resend's signed receipt events |
| An automatic reply (`Auto-Submitted: auto-replied`, out-of-office markers) | none needed to do less | stored, never answered, not a customer turn |
| A configured lead source (later) | the source's verified origin and a parser this workspace approved | a review card; no outreach without a person |
| Other automated or bulk mail (`auto-generated`, `Precedence: list`/`bulk`, `List-Id`) | none needed to do less | stored, kept from the receptionist |
| A customer's email | the trust policy E0 establishes from what Resend really exposes; until then, none passes | offered to the receptionist; otherwise stored and escalated as `email_review` in the owner's words |

A lead notification is tested before the generic automated rule, because a marketplace lead is automated mail; a genuine auto-reply is tested before both. Stored is the low bar. Answered is the high one.

6. **Contact.** By the normalized From address; the display name from the header's phrase, never from the body.
7. **The road.** The narrowest shared function after channel-specific parsing and identity resolution: an `InboundCarrier` with `channel: "email"` and the adapter `emailAsWaMessage`, as SMS did (`sms.ts:66-72`, `inbound.ts:43-50`), with the four channel unions widened together (`deliver.ts:36`, `ingest.ts:132`, `inbound.ts:44,66`) and a source-scan rule that forbids a fifth. Every place the road treats `from` as E.164 is audited before the carrier is switched on; an address never travels in a field downstream code reads as a phone number. Consent, the rate cap and the token budget apply unchanged. The opt-in confirmation gate stays WhatsApp-conditional.
8. **The brain.** `resolveSystemPrompt(brainCfg, "email", …)` gains an email style block: address the person by name, write paragraphs, no emoji, no signature, no subject. Quoted history is cut from the turn the model reads and kept on the stored row. The WhatsApp brain holds no tools today, so drafting executes nothing; the rule is written down for the day it does: in draft mode the model may propose an action and may not perform one.
9. **Hold.** `effectiveReplyMode(workspacePolicy, mailbox.reply_mode)` returns the more restrictive of the two (`packages/contracts/src/reply-mode.ts`, ten lines, tested over the matrix). `draft` escalates `email_draft` with the draft attached and queues nothing. `veto` and `auto` are switched on in a later release, with a five-minute delay for veto, through the existing delayed job and the dispatcher's fire-time re-read.
10. **Mark processed.** Last, and only after the draft or the escalation is durable.

## 9. Ownership: what the receptionist can see, and what it does when it cannot

**What exists is reused.** `paused_until`, `assignee_user_id` and `superseded_by_human` are re-read at fire time (`deliver.ts:214,224,293`); a person's own reply passes every pause by design (`kindOf`, `deliver.ts:114-118`); Today's queue omits an owned thread. Pressing Send on a draft is the human path and is recorded as one. Scheduled AI work never acquires that bypass: the draft row's sender stays `ai` and its `kind` stays `draft`.

**What email adds is one sentence and one hold.** The sentence is on the Setup card: replies sent from another mail client are invisible here. The hold is `email_review`, raised when a customer's email names a parent this workspace never stored: "This email refers to messages Chanlytics has not seen. Read the conversation before replying." It does not claim the owner replied. An outgoing copy establishes that a person is handling a thread only under the evidence in §8's table.

**Mailbox sync** is the mode for owners who will not change where they reply. It is built when a customer pays for it, one provider first, with a freshness check that holds the receptionist on a connection that has gone quiet on the provider's side, not the customer's.

## 10. The Inbox, People, Setup and Settings

- **View model.** `viewmodels.ts:580` becomes a map over channels instead of a third nested ternary. An email entry carries `subject`, its participants, and "context missing" when its parent is unknown. `surface-data.ts:307` adds `email: "Email"`; the two `channelIcon` copies (`inbox-thread.jsx:269,590`) learn `email`.
- **The draft.** Shows the subject and recipient the server built, the email it answers when there is more than one chain, and states that are true: waiting for you, sending, accepted by the provider, delivered, held, suppressed. "Sent" is never said of a queued job.
- **People.** The address on the person's page, settable there; `PersonChannel` gains `"email"` when the person has email messages; suppressed addresses say why.
- **Setup.** One row, `email`, in `setup.ts` beside `whatsapp`; the back office reads the same row.
- **Settings › Channels › Email.** The identity in use, forwarding's state and last arrival, the dial with the workspace policy that caps it visible beside it, the connection test, the explicit hosted switch.
- **Routes.** `POST mailboxes`, `PUT mailboxes/[id]` (owner), `POST mailboxes/[id]/domain`, `POST mailboxes/[id]/test`, `POST mailboxes/[id]/rotate-token`; `PUT contacts/[id]/details` accepts `email`. Each declared in `route-policy.json`.

## 11. Channel choice, reminders and outreach

Replies stay on the channel the customer wrote on. A failed email never becomes a text.

Broadcast and playbook routing are unchanged in this plan; a person with no phone is excluded from a WhatsApp audience with a visible reason. **Reminders by email are the first follow-on,** because they were asked for: a visit reminder to a person whose only address is email. That release defines the purpose-and-channel rule (`reachFor`), tests its whole matrix, and is the point at which `broadcast.ts:164-165` stops assuming a phone. Marketing by email is a separate release after that, with its unsubscribe path.

## 12. Migrations, generated types and the sets

Numbers are taken from the branch at the time, not reserved here.

| Migration | Content |
|---|---|
| A person may have an email (E1) | `contacts.email`, its CHECK, the partial unique index, the column grant, `erased_email_hash` and its index, the erase trigger, `set_person_email`, `people_list` returning and searching the address |
| A workspace has a mailbox (E2/E3) | `mailboxes` with its RLS and realtime; `contacts.email_suppressed_at`, `email_suppressed_reason`; `jobs.kind` gains `email_ingest` with its `(mailbox_id, received_id)` uniqueness; `escalations.reason` gains `email_review`, `email_draft`; an expression index on `messages ((meta->'email'->>'message_id'))` per tenant, for parent lookup, not uniqueness |

`messages_guard` freezes content columns and an `external_id` once set; `meta` and `status` are writable, which is where the processed mark, the frozen request, the RFC id Resend reports and the receipts already live or will. No trigger is bypassed. After each migration: the local type generation and `gen-schema-sets.mjs`, committed with it; `EVENT_KINDS`, `ESCALATION_REASONS`, `JOB_KINDS`, the dispatcher's refusals and `route-policy.json` registered by the tests that bind them.

## 13. Security and abuse

- Nothing derives a recipient, a tenant, a sender identity, an approval or a permission from model output or from a header the sender writes.
- Trust gates every state-changing path: ownership, forwarding codes, suppression, lead parsing, and the receptionist's turn.
- Signatures use the house Web Crypto pattern, tested against signed samples. Address headers and HTML are parsed by maintained libraries, not by regular expressions; HTML is reduced to text with no network fetches, and quoted history stays out of the model's turn.
- Attachments are metadata to the model. Owners download them through an authenticated, workspace-scoped route with an attachment disposition; nothing renders on the application's origin, and nothing claims to have been scanned.
- The reply token is long, random, rotatable with a grace alias, revocable at once, and never reassigned. It lets a stranger write into a workspace's Inbox as a customer, which the published address already does, and nothing more.
- Every receptionist reply is marked `auto-replied` and never answered when it returns; auto-replies and bulk mail are never answered; more than five emails from one sender in ten minutes holds the thread under the existing `rate_cap`.
- Intake byte limits are separate from the model's token budget; a refused message keeps its metadata and a visible reason.
- The platform's own domain: the two DMARC records at `chanlytics.com` (read from DNS on 17 September, both `p=none`) become one record with reporting, every legitimate sender is inventoried, and the policy tightens on evidence, not on a date.

## 14. Tests

The same three layers the SMS channel has (pure in `packages/channels` and `packages/contracts`, doors with `_fake-db.mjs`, the nightly browser walk), with these launch invariants each pinned by name:

1. The exact advertised hosted address receives and completes a reply round trip.
2. A real Gmail forward routes to the right workspace; forged recipient and `Received` fields cannot reach another's.
3. A replayed webhook inserts nothing; one delivery to two workspaces inserts two jobs.
4. A crash after the message is stored resumes drafting; it does not return as a duplicate.
5. A spoofed owner, forwarding code, lead source or delivery report causes no privileged effect.
6. An auto-replied message is never answered; a configured lead is a review card even though it is automated.
7. Two subjects from one person keep distinct parent and recipient context; a changed recipient asks.
8. Draft mode sends nothing and executes nothing.
9. A take-over or a stricter policy before dispatch blocks scheduled AI work; a person's Send passes by the existing rule.
10. A send the provider accepted before a client timeout is not repeated; past the recovery window it becomes a person's.
11. Out-of-order receipts and a late complaint keep the delivery evidence and write the right suppression.
12. A quiet mailbox stays connected; only a failed probe or a provider error changes its health.
13. An erasure during a pending ingest or send cannot be undone by the late job.
14. Losing a live domain holds own-domain sends; the From never changes by itself.

Plus the source-scan ratchet against a new `"whatsapp" | "sms"` literal union outside `enums.ts`, and the golden test for the composed email prompt.

## 15. Delivery order

Each phase is one plan to completion, merged on green and seen live before the next begins.

| Phase | Outcome | Needs from Ruben |
|---|---|---|
| **E0 Provider proof** | Fixtures from real mail, committed: a direct send, a Gmail forward, a Workspace routed copy, an auto-reply, a reply to our send. Settles which field is the authoritative recipient, what authentication evidence Resend exposes, the RFC Message-ID on the sent event, tag round-trip on receipts, receipt ordering. The trust policy in §8 is written from these, not before | `mail.chanlytics.com` added to Resend for sending and receiving, its DNS records published, the webhook endpoint and its secret |
| **E1 Identity** | `contacts.email` with its door, trigger, digest and search; the person's page sets it; the phone-assumption audit closed | nothing |
| **E2 + E3 The round trip** | Behind a per-workspace flag: mailbox (hosted), the webhook door, `email_ingest` with resumption, classification and trust, the carrier, the email prompt block, draft, Send with the frozen request, receipts and suppression, the Inbox and Setup | the flag on for the test workspace, then for one real one |
| **E4 Own domain, assisted** | Domain binding, records, verification, the outside-mailbox test, forwarding's nonce test, hold on failure, the explicit hosted switch | the first customer who wants it |
| **Later, one at a time** | Reminders by email; veto and auto; one real lead source from a real customer's samples; owner copies; Gmail send-only; mailbox sync for one provider | a customer's need |

## 16. What must be true first, and what is decided

Decided: one mailbox per workspace; `mail.chanlytics.com` sends and receives; draft-first; no email marketing, no cross-channel fallback, no parser editor, no mailbox sync at launch; own-domain setup is assisted; no silent sender change.

Console work, Ruben's, before E0 can run:

1. Resend: add `mail.chanlytics.com`, enable receiving on it, publish the DKIM, return-path and MX records it returns (the MX on the subdomain only).
2. Resend: one webhook endpoint at the edge's `/api/resend-webhook` for `email.received`, `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`; its signing secret on the edge as `RESEND_WEBHOOK_SECRET`.
3. DNS: one DMARC record at `chanlytics.com` with reporting, in place of the two.

## Appendix A: names added

| Kind | Names |
|---|---|
| Env (edge) | `EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET` |
| Job kinds | `email_ingest` |
| Refusals | `email_marketing_disabled`, `email_suppressed` |
| Escalation reasons | `email_review`, `email_draft` |
| Event kinds | `contact.email_set`, `email.received`, `email.unroutable`, `email.suppressed`, `mailbox.forwarding_verified`, `mailbox.domain_verified`, `mailbox.domain_held` |
| Edge door | `api/resend-webhook.ts` |
| Edge libs | `lib/email-ingress.ts`, `lib/email-domain.ts` |
| Channels | `email.ts` (pure), `email-resend.ts` (HTTP), `email-domain.ts` (pure plan) |
| Core | `messages/email-reply.ts` (`buildReplyEnvelope`) |
| Contracts | `identity.ts`, `reply-mode.ts`; additions to `enums.ts`, `people.ts`, `setup.ts`, `viewmodels.ts`, `erasure.ts` |
| Tables | `mailboxes`; columns on `contacts` |
| Routes | `mailboxes` (create, update, domain, test, rotate-token); `contacts/[id]/details` accepts `email` |

## Appendix B: what this plan does not build

- Email marketing, its unsubscribe path, or email in Broadcasts.
- A lead-parser table, editor or seeded marketplace parsers; the first parser is written from a real customer's samples when there is one.
- Owner copies by BCC. They double a workspace's counted volume when forwarded back, and they are not a Sent folder.
- `preferred_channel`, `reachFor`, or any change to how WhatsApp and SMS sends are routed.
- Per-workspace credentials in Vault, Gmail or Microsoft connections, or a second mailbox per workspace.
- A shared team inbox, rich HTML composition, attachments sent by the receptionist, calendar invitations.
- Email for the platform's own notifications, which keep `notify.ts` and the `chanlytics.com` senders.
