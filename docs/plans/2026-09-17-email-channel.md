# Email: a fourth channel, and the business keeps its address

Status: plan for review, not code. Version 1, 17 September 2026. Grounded in the channel code as it stands at `dba05e3e` (every seam below is named by file and line), in Resend's receiving and domains documentation, Google's OAuth scope classes, Microsoft's Graph consent rules, and RFCs 3834, 5322, 7489 and 8617. Where a fact is assumed rather than read, the sentence says so.

## 0. What this plan decides

- **Email is a message channel, not a second product.** A message row carries `channel = 'email'` the way it carries `sms`; the thread, the dispatcher, the jobs ledger, the consent axes, the Inbox and the receptionist are the ones that exist. The database already allows the value (`messages.channel`, `tenant_channels.kind`, `contact_identities.channel`, `00002_conversations.sql:12,56,91`); the code does not.
- **A person may have a phone, an email, or both.** Today a contact is keyed by phone (`contacts_tenant_phone_uq`, `00002:44-45`) and erasure hashes the phone (`erasure.ts:11`). That is the one structural change, and it goes first and alone.
- **The business keeps its address.** Inbound arrives by a copy the owner routes to a Chanlytics intake address; outbound leaves as the business's own identity once its domain is verified, or as a Chanlytics-hosted identity until then. No mailbox login, no mailbox-read permission, in the default and own-domain modes.
- **Autonomy depends on what Chanlytics can observe.** In the forwarding modes the receptionist cannot see a reply the owner sends from Gmail. The product says so, replies happen in the Chanlytics Inbox, an unknown parent message holds the thread for a person instead of asserting that a person answered, and the owner can route outgoing copies too. Mailbox sync through Google's or Microsoft's API is the mode for owners who must keep replying from their own client, and it is built when a customer pays for it.
- **Email starts in draft mode.** A wrong email is forwarded and kept. The receptionist's first email replies are held for approval per workspace until the owner loosens the dial, and the hold window before an autonomous email send is minutes, not the 15 seconds WhatsApp uses.
- **Store for review and allow the AI to answer are two thresholds.** Every verified delivery is stored. Only a message whose provenance the trust policy accepts is offered to the receptionist.
- **Automated mail is classified, not discarded.** Auto-replies and responder loops are recorded and never answered; bounces move delivery state; a known lead-source notification (a website form, a marketplace) runs a configured parser; unrecognised bulk mail is kept out of the receptionist's reach.

## 1. The summary

- **One thread per person.** Voice, WhatsApp and SMS already interleave in one conversation; email joins them. The Inbox shows an envelope glyph and the subject line on an email bubble and nothing else changes.
- **Three modes an owner picks from, by how they work.** Hosted (a Chanlytics address, nothing to set up), keep your address (a routing rule in plus their own domain out), and keep working in your mail client (mailbox sync, later). Native Gmail sending is a capability inside the second mode, not a fourth mode.
- **Resend carries both directions.** Sending is the API the platform already calls from `notify.ts`; receiving is Resend's inbound webhook on a Chanlytics subdomain, with the message body fetched afterwards, in a job.
- **Ownership is what exists.** A thread the owner takes is paused and assigned, and the dispatcher re-reads that at fire time (`deliver.ts:214,224`). Email adds the signals it can see and holds when it cannot.
- **Reminders pick a channel.** WhatsApp where a person has opted in, SMS once the campaign is approved, email where that is what they gave. One order, one rule for owners to understand.
- **The receptionist reads email as untrusted input,** the way it reads a WhatsApp message, with two new limits: no attachment reaches the model unless a rule names its type, and no address inside an email becomes a recipient unless a configured parser says so.

## 2. What the owner experiences

Take the moving company. It runs `info@bestmovers.com` on Google Workspace, gets forty emails a day, half of them from Thumbtack and its website form, and the owner answers from the phone between jobs.

**Setup gains one row, "Email".** Not started reads: "Customers who write to you by email get no receptionist yet." The verb opens a chooser:

> **How should the receptionist handle email?**
> 1. **Give me a Chanlytics address.** `bestmovers@mail.chanlytics.com` answers today. Put it on your site, or forward your existing address to it.
> 2. **Keep my address.** Forward a copy of `info@bestmovers.com` to Chanlytics, and send replies as `info@bestmovers.com` once your domain is verified. Two DNS records, or we send as Chanlytics until then.
> 3. **Keep working in Gmail or Outlook.** Connect the mailbox so the receptionist sees what you send and stays out of the way. Coming later; ask us.

**Path 1.** The row reads "Receiving at bestmovers@mail.chanlytics.com · replies go out from that address" the moment it is chosen. A card says "Send it an email from your phone, then open the reply in the Inbox." Replies carry a Reply-To that routes straight back into the same thread, so a customer who answers is answered.

**Path 2** is two cards, each with its own state:

- **Incoming: forward a copy.** Per provider, the exact clicks. Gmail: Settings, Forwarding, add `bestmovers@in.chanlytics.com`. Gmail then emails a confirmation code to that address, and the card shows it: "Gmail asks you to confirm. Enter 482 913 in Gmail's forwarding settings." Workspace with staff: the admin's routing rule, an exact copy of every message to `info@`, no per-user setup. Microsoft 365: a mail-flow rule, and a note that some tenants block external forwarding until an admin allows it. The card turns "Verified" when the first forwarded message arrives, the way the forwarding row for calls verifies on the first forwarded call.
- **Outgoing: send as yourself.** "Add these records at your domain registrar" with the DKIM and return-path records Resend hands back, then "Checking" until Resend reports the domain verified, then one aligned test: the receptionist emails the workspace's own intake address from `info@bestmovers.com` and reads the authentication result on what comes back. Only a passing, aligned result turns the card "Sending as info@bestmovers.com". Until then replies go out as `Best Movers <bestmovers@mail.chanlytics.com>` with Reply-To the intake address, and the card says so.

A third card, off by default: **"Copy me on every email the receptionist sends"**, which BCCs the owner's address. And a sentence under both: "Replies you send from Gmail are invisible to the receptionist. Reply from the Inbox, or route outgoing copies too (Workspace and Microsoft 365 admins can)."

**Path 3** is a "tell us" button that records the request the way a line request does (`setup_request`, `00123`), until the mode is built.

**In the Inbox,** a customer's email shows as a bubble with the envelope glyph and its subject above the first line. The receptionist's draft sits at the top of the thread as drafts do, with "Send" and "Edit", and a held draft's reason reads "Email replies wait for you until you switch the dial." A website-form lead shows as a card: the parsed name, phone, move date and addresses, and "Start the conversation" which writes the first outbound as a reply to the lead.

**On a person's page,** Channels reads "WhatsApp · Email" and the email address sits under the phone. Erasure erases both.

## 3. Facts the plan stands on

| Fact | Detail | Source |
|---|---|---|
| Resend receiving | Receiving works at a verified domain or the account's `<id>.resend.app` subdomain; one MX record at the receiving domain with the lowest priority; the inbound domain must be a subdomain when the root already has a mail host, or the root's mail is captured; each arrival is a signed `email.received` webhook carrying metadata, and the body, headers and attachments are fetched by API afterwards; attachment download URLs expire | Resend docs: Receiving, Custom receiving domains, Get email content, email.received |
| Resend sending | `POST /emails` takes `from`, `to`, `reply_to`, `subject`, `text`, `html`, `headers`, `attachments`; the response carries the message id; `In-Reply-To` and `References` thread a reply; idempotency keys are honoured for 24 hours; the outgoing RFC `Message-ID` is exposed on webhooks and retrieval | Resend docs: Send email, Reply to receiving emails, Idempotency keys |
| Resend domains | A domain is created by API, verified by DKIM and return-path records the API returns, and reports `verified`; many domains per account; a per-domain region | Resend docs: Domains API |
| Webhook proof | Resend signs webhooks (Svix headers `svix-id`, `svix-timestamp`, `svix-signature`, HMAC-SHA256 over `id.timestamp.body` with the endpoint secret); the raw body must be used | Resend docs: Verify webhook requests |
| Google scopes | `gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.insert`, `gmail.metadata`, `gmail.settings.*` and `mail.google.com` are restricted: verification plus a periodic security assessment under the App Defense Alliance CASA framework, at the level Google assigns. `gmail.send` is sensitive, not restricted: verification, no assessment | Google Cloud Help, Restricted scopes; Google for Developers, Gmail API scopes |
| Google forwarding | Gmail forwards new mail (not spam) to a confirmed address; the confirmation is an email with a code to the destination; filters can forward a subset. Workspace admins can route an inbound copy (dual delivery) and add recipients on outbound mail | Gmail Help, Automatic forwarding; Workspace Help, Routing, Dual delivery |
| Microsoft | Delegated `Mail.Read` and `Mail.Send` do not require admin consent by the permission reference, but the default consent policy keeps a new app's `Mail.Read` behind admin consent in most tenants; application-level `Mail.Send` needs admin consent and should be scoped by an application access policy; Defender's outbound spam policy blocks automatic external forwarding by default | Microsoft Learn: Graph permissions reference, App consent policies, Outbound spam policies |
| Auto-submitted mail | `Auto-Submitted: auto-replied` marks an automatic response; `auto-generated` marks mail a program produced; responders must not answer either, and must not answer mail with `Precedence: list` or `bulk`; a responder's own mail is marked | RFC 3834 |
| Threading | A reply carries a new `Message-ID`, `In-Reply-To` naming the parent and `References` carrying the chain | RFC 5322 §3.6.4 |
| DMARC | Passes on an aligned SPF or DKIM result; under strict DKIM alignment the signing domain must equal the From domain; multiple DMARC records at one name are treated as none | RFC 7489 §3.1, §6.6.3 |
| ARC | A valid ARC chain preserves upstream results across a forwarder; trusting them is the receiver's decision about the sealing intermediary, not a property of the chain | RFC 8617 |
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

## 5. Identity: a person may have a phone, an email, or both

**Decision: the address lives on the contact, beside the phone.** `contacts.email` mirrors `contacts.phone_e164` in every respect: nullable, unique per workspace where present, erased by digest. The `contact_identities` table already allows an email identity, but nothing reads it, `getOrCreateContact` does not know it, People does not count it and erasure does not clear it; a second home for the same fact is how the two drift. It stays for the day a person has two emails.

```sql
-- 00125_a_person_may_have_an_email.sql
alter table public.contacts
  add column email text,
  add column erased_email_hash text;
create unique index contacts_tenant_email_uq
  on public.contacts (tenant_id, email) where email is not null;
create index contacts_tenant_erased_email
  on public.contacts (tenant_id, erased_email_hash) where erased_email_hash is not null;
alter table public.contacts
  add constraint contacts_reachable check (phone_e164 is not null or email is not null or erased_at is not null);
comment on column public.contacts.email is 'Lower-cased, trimmed, one per workspace; a person may have this and no phone.';
```

Rules the code enforces, in `packages/contracts/src/identity.ts` (new, pure):

- `normalizeEmail(raw): string | null` lowercases, trims, refuses anything without one `@` and a dot after it, refuses display-name forms (the parser strips them before this is called), and keeps the local part's case-folding to lowercase because Gmail and every modern host ignore case; a workspace that needs case-sensitive locals is not a customer of this product.
- `erasedEmailHash(tenantId, email)` beside `erasedPhoneHash`, the same digest over `${tenantId}:${email}`. `apps/edge/lib/erased.ts` gains the email tombstone check, and `beginErasure` (`apps/dashboard/src/server/service.ts`) writes both digests.
- `getOrCreateContact` gains an `email` identifier and the same insert-then-reselect it uses for the phone. A message from an email that matches an existing contact's email joins that contact. A message from a person already known by phone who now writes by email creates a second contact; the owner merges them from the person's page, which already exists (`merged_into_contact_id`). The product does not guess that two identifiers are one person.
- Every reader that assumes a phone is audited once, and the list is short because the map found it: `broadcast.ts:164` (`to`), `send.ts:6` (`to_phone`), `people.ts` (display and channels), `calendar-people.ts` (the visits match), `erased.ts`, the export route, the person's page.

Generated types are regenerated locally and committed with the migration, or CI refuses (`check-db-types.mjs`).

## 6. Mailboxes, addresses and domains

**Decision: a `mailboxes` table, one row per workspace at first, shaped like `lines`.** A line is a phone number with per-capability states; a mailbox is an address with per-direction states. The same saga discipline, the same Vault functions, the same Setup grammar.

```sql
-- 00126_a_workspace_has_a_mailbox.sql
create table public.mailboxes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  mode             text not null default 'hosted' check (mode in ('hosted','own_domain','mailbox_sync')),
  intake_local     text not null,                     -- bestmovers  → bestmovers@in.chanlytics.com
  intake_token     text not null,                     -- opaque, for r+<token>@in.chanlytics.com
  from_local       text not null,                     -- bestmovers  → bestmovers@mail.chanlytics.com until the domain verifies
  from_name        text not null,
  own_domain       text,                              -- bestmovers.com
  own_from         text,                              -- info@bestmovers.com
  domain_state     text not null default 'none' check (domain_state in ('none','records_pending','verified','aligned','failed')),
  inbound_state    text not null default 'none' check (inbound_state in ('none','instructed','receiving')),
  outbound_state   text not null default 'none' check (outbound_state in ('none','hosted','own')),
  reply_mode       text not null default 'draft' check (reply_mode in ('draft','veto','auto')),
  owner_copy       boolean not null default false,
  provider_ref     text,                              -- Resend domain id
  credentials_ref  text,                              -- Vault name, as lines.credentials_ref
  last_error       text,
  state_since      timestamptz not null default now(),
  facts            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index mailboxes_tenant_uq on public.mailboxes (tenant_id);           -- one per workspace, for now
create unique index mailboxes_intake_local_uq on public.mailboxes (intake_local);
create unique index mailboxes_intake_token_uq on public.mailboxes (intake_token);
alter table public.mailboxes enable row level security;
create policy mailboxes_member_select on public.mailboxes for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
alter publication supabase_realtime add table public.mailboxes;
-- put_mailbox_credentials / get_mailbox_credentials: the 00066 functions, keyed 'mailbox-creds-<id>'.
```

Two subdomains, two purposes, two environment variables on the edge:

| Name | Value | Purpose |
|---|---|---|
| `EMAIL_INTAKE_DOMAIN` | `in.chanlytics.com` | receives; one MX record to Resend, nothing else ever sends from it |
| `EMAIL_SEND_DOMAIN` | `mail.chanlytics.com` | the hosted sending identity; DKIM and return path verified in Resend |
| `RESEND_WEBHOOK_SECRET` | from the Resend dashboard | proves every inbound and receipt webhook |

Why two: the receiving subdomain must carry Resend's MX as its lowest-priority record, and mixing a sending identity onto it would make every bounce and every reply a receive. Why neither is the root: the root's MX is Google Workspace and its mail stays there.

**Addresses a workspace owns:**

- `intake_local@in.chanlytics.com`, the address the owner forwards to. Derived from the workspace slug, editable once.
- `r+<intake_token>@in.chanlytics.com`, the Reply-To on hosted-mode sends. The token is 20 random base32 characters, per workspace, rotatable; it names the workspace, never a thread. The thread comes from the headers.
- `from_local@mail.chanlytics.com`, the hosted sender.
- `own_from`, the business's own address, used as From only while `domain_state = 'aligned'`.

**Resolving a delivery to a workspace** uses the recipient address the platform assigned, matched against `intake_local` or `intake_token`, taken from the envelope recipient Resend reports for the delivery (assumed: the `to` field of `email.received` is the envelope recipient, to be confirmed in E3's first test against a real forward, because a forwarded message's header `To` still names the owner's address). It never uses `received_for`, a sender's display name, or any header the sender writes.

**The own-domain saga** (`packages/channels/src/email-domain.ts`, pure plan; `apps/edge/lib/email-domain.ts`, the steps):

1. `create`: `POST /domains { name: own_domain, region }` → `provider_ref`, the records → `domain_state = 'records_pending'`, `facts.records = [...]` for the Setup card.
2. `verify`: the sweep asks `GET /domains/{id}/verify` every ten minutes while pending → `'verified'`.
3. `align`: send one message from `own_from` to the workspace's own intake address with a nonce in the subject; the ingest sees the nonce, reads the authentication results on what arrived (assumed: the retrieved received email exposes headers; if it does not, Resend's own DKIM verification on the domain stands in and the state is named `'verified'` only) → `'aligned'`, `outbound_state = 'own'`.
4. On a later failure of any kind (the records removed, Resend reporting the domain failed) the mailbox falls back to `outbound_state = 'hosted'` and pages nobody; the Setup card says "Sending as Chanlytics again: the records at bestmovers.com are missing", the way a rotated Twilio token is named rather than mistaken for carrier silence (`apps/edge/lib/sms.ts:45-86`).

## 7. Outbound: the wire

**The payload grows, the port does not.**

```ts
// packages/core/src/deliver.ts
export type Channel = "whatsapp" | "sms" | "email";

export interface WirePayload {
  body: string;
  template?: TemplateSend;
  /** Email only. Absent on a wire that has no subject. */
  email?: { subject: string; inReplyTo: string | null; references: string[]; unsubscribe: boolean };
}
```

`Sender` stays `(to, WirePayload) => Promise<SendResult>`; `to` is an address on the email wire, as the doc at `Delivery.to` already allows ("each wire shapes it"). `SendResult.wamid` carries Resend's id, which is the `external_id` the receipts door updates by, exactly as a wamid is.

**`emailSender(mailbox, secret): Sender | null`** in `packages/channels/src/email-resend.ts`, with the pure request builder in `packages/channels/src/email.ts`:

- From: `own_from` while aligned, else `from_local@mail.chanlytics.com`, with `from_name` as the display name.
- Reply-To: the intake token address in hosted mode; the owner's own address in own-domain mode (their inbox gets the reply and forwards it back, and the customer sees the address they know).
- Headers: `Message-ID` minted by the wire as `<{messageId}@{sendDomain}>` so the ledger knows its own mail on sight, `In-Reply-To` and `References` from the payload, `Auto-Submitted: auto-generated` on every receptionist send (RFC 3834 asks it of responders; a human's reply from the Inbox does not carry it), `List-Unsubscribe` and `List-Unsubscribe-Post` when `unsubscribe` is set.
- Body: plain text always; a minimal HTML twin (paragraphs and links, no styling) because Gmail renders plain text worse than it should. The signature block is composed from the profile (name, address, phone, booking link) the way `composeSystemPrompt` reads it, not typed.
- Idempotency-Key: the message row's id. Resend keeps it 24 hours; the ledger's own guard (`finalizeQueued` on `status = 'queued'`, `deliver.ts:277-286`) is the durable one.
- BCC: the owner's address when `owner_copy` is on. The ingest recognises the echo by Message-ID (§8) and never answers it.

**The dispatcher's channel rule** gets an email sibling beside `deliver.ts:198`:

```ts
if (d.channel === "email" && d.purpose === "marketing" && !d.emailUnsubscribe) return "email_marketing_needs_unsubscribe";
```

A marketing email without a working unsubscribe never leaves, whatever the consent row says; the wire sets the header and the ingest honours the one-click POST at `/api/email-unsubscribe/<token>` by writing `marketing_consent = 'opted_out'` with source `email_unsubscribe`. Conversational email (a reply, a reminder for a booked visit) needs no unsubscribe, and needs no prior consent when it answers a message, by the same `mayMessageFor` rule the other channels use.

**Broadcasts stop assuming a phone.** `broadcast.ts:164-165` becomes `to: addressFor(c, channel)`, `channel: channelFor(c, purpose, lines)` (§11). A template on the email channel is a subject and a body with the same `{{1}}` parameters; `templates.channel` already exists and `templatePurpose` (`deliver.ts:377`) reads the row's channel instead of `"whatsapp"`.

**Receipts:** `apps/edge/api/email-status.ts`, the `sms-status.ts` shape line for line. Verify the Svix signature over the raw body (`packages/channels/src/email.ts` `verifyResendWebhook(secret, headers, rawBody)`, constant-time compare, timestamp within five minutes), map `email.sent → sent`, `email.delivered → delivered`, `email.bounced → failed` with `{ bounce: type, code }`, `email.complained → failed` with `{ complaint: true }`, `email.delivery_delayed → interim`; `recordStatusByExternalId` moves the row. A hard bounce or a complaint also writes `contacts.email_state = 'undeliverable'` (a column on `00125`, `check in ('ok','undeliverable')`) and the dispatcher refuses the address afterwards with a new refusal `email_undeliverable`, the way `dnc` refuses a phone.

**The `outbound_send` job** keeps its name. Its payload's `to_phone` is renamed `to` with the old key read for one release, and `sendQueued` (`send.ts:35`) already reads the channel off the row. `email_ingest` (§8) joins `JOB_KINDS`, `HANDLERS` and the CHECK in `00126`; `outbound_send` on the email channel joins nothing new because `SPEAKS_TO_A_PERSON` (`ledger.ts:57`) already names it.

## 8. Inbound: the door, the job, the road

**The door is a wire, not a judgement.** `apps/edge/api/inbound-email.ts`:

1. Read the raw body. Verify the Svix signature. A failure is 401 and a `webhook.auth` row at most once a minute, as the Retell door does.
2. Parse the `email.received` event: Resend's email id, the envelope recipient, the sender, the subject, the Message-ID.
3. Resolve the mailbox from the recipient (§6). Unknown recipient → 200 and a `email.unroutable` event on the platform tenant; Resend must not retry a message no workspace owns.
4. Insert an `email_ingest` job with `{ mailbox_id, received_id, message_id_header }` and a uniqueness rule on `received_id` in the payload (a partial unique index on `jobs ((payload->>'received_id')) where kind = 'email_ingest'`), so a replayed webhook is a duplicate insert, swallowed.
5. 200.

Nothing else happens in the request. The WhatsApp door processes inline because Meta's delivery is the whole message and its latency budget is seconds; Resend's event is a pointer, the fetch can fail, and an email answered in two minutes is fast.

**The job is the judgement.** `packages/jobs/src/handlers.ts` gains `emailIngest(ctx, job)`, which calls `apps/edge/lib/email-ingress.ts` through the same `ctx` seams the other handlers use:

1. **Fetch.** `GET /emails/receiving/{id}` for headers, text and html; attachments listed, downloaded only when a rule wants them (§13), stored under the workspace's Storage prefix as WhatsApp media is. A fetch that fails is a job failure with the reason, retried by the ledger's rules (`email_ingest` is not in `SPEAKS_TO_A_PERSON`, so it retries up to three times), and the deadman's unfinished sweep (`apps/edge/lib/unfinished.ts`) already names a customer message with no answer after three minutes; it learns the email channel's longer bar of thirty.
2. **Dedupe.** By RFC Message-ID per workspace (`messages.external_id` holds it for inbound email; the partial unique index `messages_tenant_external_uq` does the rest). A forwarded copy and a dual-delivery copy of the same message are one message.
3. **Classify.** In this order, the first match wins, in `packages/channels/src/email.ts` `classifyInbound(headers, mailbox, ledger)`, pure and tested:

| Class | Test | Treatment |
|---|---|---|
| `own_echo` | `Message-ID` matches a row this workspace sent, or `From` is the mailbox's own sender and the id is in the ledger | recorded as nothing; the job is done |
| `owner_reply` | `From` is `own_from` or the owner's address, id not in the ledger | recorded as an outbound `human` message with `meta.source = "mail_client"`; the thread is paused for the workspace's pause window and an escalation `owner_replied_by_email` is raised; nothing is answered |
| `forwarding_confirmation` | `From` is `forwarding-noreply@google.com` (and Microsoft's equivalent) | the code is extracted to `mailboxes.facts.forwarding_code`; the Setup card shows it; nothing else |
| `bounce` | `Content-Type: multipart/report; report-type=delivery-status`, or `From` matches `mailer-daemon@`/`postmaster@` | the referenced Message-ID's row moves to `failed`; the address is marked undeliverable when the DSN says permanent |
| `auto_reply` | `Auto-Submitted` other than `no`, or `X-Autoreply`, or `Precedence: auto_reply` | stored as inbound with `meta.email.automatic = "reply"`, never answered, never counted as a customer turn |
| `list_or_bulk` | `Precedence: list\|bulk`, `List-Id`, `List-Unsubscribe` present | stored, held from the receptionist, `meta.email.automatic = "bulk"` |
| `lead_source` | `From` and subject match a configured parser (§8.1) | parsed into a lead card |
| `customer` | none of the above | offered to the road |

4. **Trust.** A `customer` message is offered to the receptionist only when the authentication results Resend reports carry `dkim=pass` for the From domain, or `spf=pass` on an unforwarded delivery, or an ARC chain sealed by a forwarder the mailbox has verified (Google's or Microsoft's seal on the first forwarded message the owner confirmed). Anything else is stored and escalated as `email_review` with the reason in the owner's words ("this arrived without a valid signature; read it before anyone answers"). Stored is the low bar; answered is the high one.
5. **Contact.** `getOrCreateContact` by the normalized From address; the display name from the From header's phrase, never from the body.
6. **The road.** An `InboundCarrier` for email, and the adapter that makes an email look like a message the road knows:

```ts
// apps/edge/lib/email-ingress.ts
export function emailCarrier(mailbox: Mailbox, sender: EmailSender | null, held: Held | null): InboundCarrier {
  return {
    channel: "email",
    send: (to, body, email) => sender.send(to, body, email),
    body: (text) => text,                      // no footer; the signature is composed by the wire
    held,                                      // "records pending" holds nothing: hosted sending always works
    consent: null,
  };
}
// packages/channels/src/email.ts
export function emailAsWaMessage(e: EmailInbound, nowMs: number): WaRawMessage   // the sms.ts:66 pattern
```

`handleInbound` takes the carrier's channel as a third value and the four hardcoded unions (`inbound.ts:44,66`, `ingest.ts:132`, `deliver.ts:36`) widen together. The road's gates apply unchanged: STOP words are not an email idiom, so `resolveConsent` reads the unsubscribe path instead (a one-click POST or the word "unsubscribe" alone in a reply); the opt-in confirmation gate (`inbound.ts:586`) stays WhatsApp-conditional; the rate cap and the token budget count email turns as turns.

7. **The brain.** `resolveSystemPrompt(brainCfg, "email", …)` composes an email block: address the person by name when known, a subject line the model returns as its first line (`Subject: …`, stripped and stored on `meta.email.subject`), paragraphs instead of one line, no emoji, a closing without a signature (the wire adds it), the same rules block. The persona's channel word in `composeSystemPrompt` already exists for `whatsapp` and `sms`.
8. **Hold and send.** `holdPlan` reads `mailbox.reply_mode`: `draft` queues nothing and escalates `email_draft` with the draft attached, the Inbox shows it at the top with Send and Edit; `veto` queues with a five-minute delay (`EMAIL_VETO_DELAY_MS`), the receipt says "sends in 5 minutes unless you cancel"; `auto` sends. Every send goes through `deliver()` as a `draft` or `answer`, so the pause and assignee gates hold it at fire time.

### 8.1 Lead sources: automated mail that is a customer

A moving company's leads arrive as machine mail from Thumbtack, Angi, Yelp, HomeAdvisor and its own website form. Each is a known sender with a stable subject and a body layout. A `lead_parsers` table (E5) holds, per workspace, `{ source, from_pattern, subject_pattern, fields: [{ name, kind: "phone"|"email"|"date"|"text", regex }] }`; a parsed lead creates the contact from the parsed phone or email (never from an address found loose in the body), stores the message as `type = 'note'` with the fields in `meta.lead`, and shows a lead card in the Inbox with "Start the conversation". The receptionist may draft the first outreach only under the workspace's `veto` or `auto` mode and only to the parsed contact. The product ships with parsers for the four marketplaces above and a generic "website form" parser that reads `Name:`, `Phone:`, `Email:` lines; the owner adds one by pasting a sample email and naming the fields, and the parser is tested against that sample before it is saved.

## 9. Ownership: what the receptionist can see, and what it does when it cannot

**What exists.** A thread the owner takes is paused and assigned (`conversations.paused_until`, `assignee_user_id`). `deliver()` re-reads both at fire time and refuses a queued reply with `human_has_it` (`deliver.ts:214,224`) and a newer human message with `superseded_by_human` (:293). A reply from the Inbox takes the thread. Today's queue omits an owned thread. None of that changes.

**What email adds.**

- `owner_reply` (§8.3) is the signal the forwarding modes can see: an outgoing copy the admin routes, or the customer's reply quoting a parent the ledger never sent. The first is certain and pauses the thread; the second is a hold, `email_review`, in the owner's words: "The customer is replying to something you sent from your mail client. Read the thread before the receptionist does."
- The contract on the Setup card and in the mode chooser: "Replies you send from Gmail are invisible to the receptionist. Reply from the Inbox, or route outgoing copies too."
- **Mailbox sync (mode 3) is the mode for owners who will not change where they reply.** Gmail's `history.list` from the last stored `historyId`, Microsoft's change notifications with subscription renewal, both with a freshness check the deadman reports on: a connection that has not answered in an hour holds the receptionist on that mailbox rather than letting it answer blind. It is specified here so the two earlier modes leave room for it, and it is built when a customer pays for it, because it brings Google's restricted-scope assessment, Microsoft admin consent, and a second provider's failure modes.

## 10. The Inbox, People, Setup and Settings

- **View model.** `viewmodels.ts:580` becomes a four-way map (`phone`, `sms`, `email`, `whatsapp`). `TimelineEntry` gets `subject` from `meta.email.subject` and renders it as a first line in `tl-msg-subject`. `surface-data.ts:307` adds `email: "Email"`. The two `channelIcon` copies (`inbox-thread.jsx:269,590`) already return `mail` for `mail`; they learn `email`. The thread's channel chips list email when the person has written by it.
- **People.** `PersonChannel` gains `"email"`; `channelsOf` adds it when the row has an email; the Channels line at `people.ts:1235` becomes a map over labels. The person's page shows the address under the phone, with "Undeliverable since <date>" when the state says so. The `people_list` RPC returns `email` and `email_state`.
- **Setup.** One row, `email`, added in `setup.ts` beside `whatsapp` (:587); required `false`; states: not started → "waiting on you" while forwarding is instructed or records are pending → "waiting on us" during the alignment test → ready. The forwarding code, the records and the mode sentence come from `mailboxes.facts`. The back office reads the same row.
- **Settings › Channels.** An "Email" card with the mode, the addresses, the dial (`reply_mode`), the "copy me" toggle, and "Route a different address" to change `own_from`. The autonomy page's dials stay per class; email's dial is per mailbox because the risk is per channel, and the card says which is which.
- **Routes.** `GET setup` grows the mailbox fields; `POST mailboxes` (create with mode), `PUT mailboxes/[id]` (mode, from, reply_mode, owner_copy), `POST mailboxes/[id]/domain` (start the saga), `POST mailboxes/[id]/rotate-intake` (a new token); `POST lead-parsers`, `PUT lead-parsers/[id]` in E5. Each declared in `route-policy.json` by the test that writes it; `spend: false` on all of them, because Resend domains cost nothing.

## 11. Channel choice for reminders and outreach

`packages/contracts/src/reach.ts` (new, pure):

```ts
export type Reach = { channel: Channel; to: string } | null;
export function reachFor(person, purpose: SendPurpose, lines: { sms_active: boolean; whatsapp: boolean; email: boolean }): Reach
```

Order: the channel the person last wrote on, if it may carry this purpose; then WhatsApp with the consent the purpose needs; then SMS when the line's campaign is active and the purpose is conversational (the line carries no promotions, `deliver.ts:198`); then email when the address is deliverable and, for marketing, the person has marketing consent. `null` refuses the send with the existing `not_opted_in` or `no_marketing_consent` reasons. A person's page shows "Reaches them by: WhatsApp" and lets the owner pin a channel, stored on `contacts.preferred_channel` (`00125`, nullable, checked against `CHANNEL_KINDS`).

Visit playbooks (`run-playbook.ts`) call `reachFor(person, purposeOfPlaybook(cls), lines)` per recipient and drop the ones it refuses with the reason in the run's `dropped`, as `#580` records. A reminder by email is the same template words with a subject composed from the trigger ("Your appointment tomorrow at Melany's Beauty Salon").

## 12. Migrations, generated types and the sets

| Migration | Content |
|---|---|
| `00125_a_person_may_have_an_email.sql` | `contacts.email`, `erased_email_hash`, `email_state`, `preferred_channel`, the two partial indexes, the reachable constraint; `people_list` returns the new columns |
| `00126_a_workspace_has_a_mailbox.sql` | `mailboxes`, its RLS and realtime, `put_mailbox_credentials`/`get_mailbox_credentials`, `jobs.kind` CHECK gains `email_ingest`, the `email_ingest` payload uniqueness index, `escalations.reason` CHECK gains `email_review`, `email_draft`, `owner_replied_by_email` |
| `00127_lead_parsers.sql` (E5) | `lead_parsers`, RLS, and the seeded marketplace parsers as rows on the platform tenant that every workspace may copy |

After each: `supabase start && corepack pnpm gen:db-types`, `node tooling/scripts/gen-schema-sets.mjs`, both committed with the migration. `EVENT_KINDS` gains `email.received`, `email.held`, `email.unroutable`, `email.bounced`, `email.complained`, `mailbox.forwarding_verified`, `mailbox.domain_verified`, `mailbox.domain_aligned`, `mailbox.domain_lost`, each bound to its emitter by `event-kinds.test.mjs`.

## 13. Security and abuse

- **Every email body is untrusted input to the model,** as a WhatsApp body is. The receptionist's tools do not include "send to an address"; the sender port takes a contact the road resolved, so a body that says "forward this to accounting@…" has nothing to act on. Layer two's refusal classes apply.
- **Attachments never reach the model** unless a lead parser names a type it reads (none do in E5; a PDF quote is E6 at the earliest). They are stored, shown in the Inbox as files, and virus-scanned by nothing, so the Inbox opens them in a new tab and never inline. Size cap 10 MB per message, five attachments, the rest dropped with a note on the row.
- **HTML is reduced to text** by one converter (`packages/channels/src/email-text.ts`, no dependency) before it is stored as `body`; tracking pixels and remote images are never fetched.
- **The intake token is a capability.** It is long, random, per workspace, rotatable from Settings, and a message to a token that does not exist is dropped at the door. It names a workspace, never a thread; the thread is found by headers, so a token in the wild lets a stranger write into the workspace's Inbox as a customer (which a public intake address already allows) and nothing more.
- **Loops.** Every receptionist send carries `Auto-Submitted: auto-generated` and is never answered when it comes back; `own_echo` catches the BCC copy and dual delivery; `auto_reply` catches out-of-office; a thread that receives more than five inbound emails in ten minutes from one sender is held with `rate_cap`, as WhatsApp's daily cap holds it.
- **Rate and budget.** The per-thread daily cap and the workspace's token budget (`inbound.ts:622-670`) count email turns as turns. Resend's own sending quota is read from the `429` it returns and surfaces as `send_failed`.
- **RLS and Vault.** `mailboxes` is member-readable and service-written; the Resend API key stays the platform's; a per-workspace secret (a Gmail token in mode 3) lives in Vault under the mailbox's `credentials_ref`, read only by the two functions.
- **The platform's own domain** publishes one DMARC record at `p=quarantine`, then `p=reject`, and `mail.chanlytics.com` and `in.chanlytics.com` carry their own SPF so a spoof of either fails on both axes. This is a console change and is listed in §16.

## 14. Tests

The same three layers the SMS channel has.

- **Pure, in `packages/channels`:** `classifyInbound` against a fixture folder of real headers (a Gmail forward, a Workspace dual delivery, a Microsoft forward, an out-of-office, a DSN, a Thumbtack lead, a BCC echo, our own send); `verifyResendWebhook` against a signed sample and its four wrong forms; `emailAsWaMessage`; the request builder's headers (a reply threads, a marketing send carries List-Unsubscribe, a receptionist send carries Auto-Submitted, a human's does not); `normalizeEmail`; `reachFor` over the consent and line matrix.
- **Doors, in `tooling/scripts/tests` with `_fake-db.mjs`:** `inbound-email-door.test.mjs` (proven first: a wrong signature is 401 and no job; an unknown recipient is 200 and no job; a valid event inserts exactly one `email_ingest` job and a replay inserts none), `email-status-door.test.mjs` (the `sms-status-door` four, plus bounce and complaint marking the address), `email-ingest.test.mjs` (the job through the road: a customer email in `draft` mode leaves a held draft and no send; in `auto` mode a send through a fake wire with the right headers; an `owner_reply` pauses; an `auto_reply` answers nothing; a duplicate Message-ID is one row).
- **Golden:** the composed email prompt for the salon's config, beside the DR golden test, so a wording change is a reviewed change.
- **Nightly:** `e2e/email.spec.ts` on the test workspace: the Setup row's states, the Settings card, an inbound fixture posted to the door with a real signature from the E2E secret, the draft in the Inbox, Send, the outbound row, and the receipt door moving it to delivered.
- **Source scan:** the ratchet forbids a new `"whatsapp" | "sms"` literal union outside `enums.ts`.

## 15. Delivery order

Each phase is one plan to completion, merged on green, and nothing in a later phase is started before the earlier one is live and seen.

| Phase | Scope | PRs | Size |
|---|---|---|---|
| **E1 Identity** | `00125`, `identity.ts`, `getOrCreateContact` by email, erasure of both, People and the person's page, the phone-assumption audit, `reachFor` with email refused until E2 | 2 | 2 days |
| **E2 Outbound** | `Channel` widened in the four places, `WirePayload.email`, `emailSender`, `mailboxes` (`00126`) in hosted mode only, the receipts door, `email_undeliverable`, broadcasts and playbooks by `reachFor`, the Settings card (mode 1) and the Setup row | 3 | 3 days |
| **E3 Inbound** | the door, `email_ingest`, `classifyInbound` and the trust policy, the carrier and adapter, the brain's email block, `reply_mode` and the five-minute veto, the Inbox rendering, the forwarding cards with Gmail's code, `owner_reply` and `email_review` | 4 | 6 to 7 days |
| **E4 Own domain** | the domain saga, the aligned test, own-domain sending, fallback to hosted, the outgoing-copy instructions | 2 | 3 days |
| **E5 Lead sources** | `lead_parsers`, the four marketplace parsers and the form parser, the lead card, "Start the conversation" | 2 | 4 days |
| **E6 Mailbox sync** | Gmail history sync and Microsoft notifications, Vault tokens, freshness in the deadman, Google verification and assessment, Microsoft publisher verification | 3 | 1 to 2 weeks plus the review clocks |

Gates before E3 is called done: a complete round trip on the test workspace (customer email in, draft, send, customer reply, threaded back); replay, echo, out-of-office and duplicate delivery each leaving one row and no send; take-over cancelling a queued email at fire time; a stale forwarding setup (no message in seven days after "receiving") turning the Setup row back to "waiting on you"; a hostile email (instructions in the body, a fake From matching the owner's address without a valid signature) producing a held message and no action.

## 16. What must be true first, and open decisions

Console work, all Ruben's:

1. Resend: add `in.chanlytics.com` as a receiving domain and publish its MX; add `mail.chanlytics.com` as a sending domain and publish its DKIM and return-path records; create the webhook endpoint for `email.received`, `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed` pointing at the edge, and put its secret on the edge as `RESEND_WEBHOOK_SECRET`.
2. DNS: replace the two DMARC records at `chanlytics.com` with one (`v=DMARC1; p=quarantine; rua=mailto:hi@chanlytics.com`), and move to `p=reject` after a quiet month.
3. Google Cloud: begin OAuth verification for `gmail.send` on the existing client the day E2 merges. It costs nothing and its clock is weeks.

Decisions this plan needs from Ruben:

- **One mailbox per workspace at launch** (the unique index in `00126`), or several from the start. One is the honest size; the schema does not forbid the second.
- **The hosted sending domain's name.** `mail.chanlytics.com` reads as infrastructure; `hello.chanlytics.com` reads as a person. The plan uses `mail`.
- **Whether email marketing exists at launch at all.** The plan builds the unsubscribe path because a marketing send without it is a rule broken, but hides marketing email from Broadcasts until a workspace asks, the way the SMS line carries no promotions.
- **Which four marketplaces** the seeded parsers cover. The plan names Thumbtack, Angi, Yelp and HomeAdvisor from the moving trade; a salon's would be Booksy, Fresha and Google Business Profile messages, which are not email.

## Appendix A: names added

| Kind | Names |
|---|---|
| Env (edge) | `EMAIL_INTAKE_DOMAIN`, `EMAIL_SEND_DOMAIN`, `RESEND_WEBHOOK_SECRET`, `EMAIL_VETO_DELAY_MS` |
| Job kinds | `email_ingest` |
| Refusals | `email_marketing_needs_unsubscribe`, `email_undeliverable` |
| Escalation reasons | `email_review`, `email_draft`, `owner_replied_by_email` |
| Event kinds | `email.received`, `email.held`, `email.unroutable`, `email.bounced`, `email.complained`, `mailbox.forwarding_verified`, `mailbox.domain_verified`, `mailbox.domain_aligned`, `mailbox.domain_lost` |
| Edge doors | `api/inbound-email.ts`, `api/email-status.ts`, `api/email-unsubscribe.ts` |
| Edge libs | `lib/email-ingress.ts`, `lib/email-domain.ts` |
| Channels | `email.ts` (pure), `email-resend.ts` (http), `email-domain.ts` (pure plan), `email-text.ts` (html to text) |
| Contracts | `identity.ts`, `reach.ts`; additions to `enums.ts`, `consent.ts`, `people.ts`, `setup.ts`, `facts.ts`, `viewmodels.ts`, `erasure.ts` |
| Tables | `mailboxes`, `lead_parsers`; columns on `contacts` |
| Routes | `mailboxes` (create, update, domain, rotate-intake), `lead-parsers` (create, update) |

## Appendix B: what this plan does not build

- A shared team inbox with per-agent assignment beyond the thread's one assignee.
- Rich HTML composition, images in signatures, or attachments sent by the receptionist.
- Calendar invitations by email; the booking link is the product's answer.
- Reading the owner's mailbox for anything but the conversations the receptionist is in (E6 scopes its sync to threads it knows).
- Email for the platform's own notifications; those keep `notify.ts` and the `chanlytics.com` senders, which a separate one-day change fixes (one sender per kind, the salon's sandbox override removed).
