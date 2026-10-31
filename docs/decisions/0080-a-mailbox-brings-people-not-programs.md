# 0080 · A mailbox brings people, not programs

**Status:** Decided by Ruben on 30 October 2026 ("Build lane A", after the analysis
`Claude Video/docs/2026-10-30-mailbox-noise-and-phone-load.md` and his question "how can the importing be smarter to
avoid these types of emails appearing on chanlytics? the idea is to get leads and contacts not these types of
service/promo software stuff"); built and merged as #1964 (3c058adbd, 31 October 2026, from the lane
`email/the-mailbox-brings-people-not-programs`), its migration 00495 applied to production at 02:00 UTC that day, before
the merge, on Ruben's "Apply and merge". Written against `5d7e3d533` (#1960). Loose ends tied on
`email/mailbox-sorting-loose-ends`: the six months never keep a draft, and the Left list asks only for the readings it
shows.

## Context

A connected mailbox takes in what a person wrote and leaves the rest (0073 R13 and R19; edge
`email/mailbox/mailbox-sorting.ts` `leftWhy`, asked by the live read `mailbox-sync.ts` and the six months
`imports/mail-history.ts`). Read at `5d7e3d533`, on production's own workspace on 30 October:

- **Each email is judged alone, by headers anyone can leave out.** `classifyReceived` (channels `email/intake.ts`)
  reads Auto-Submitted, Precedence, List-Id, List-Unsubscribe and the sender's local part. 19 machine senders came in
  as people (Vercel 62 emails, Parking Base 22, Twilio 13, Chase, Apple, Alibaba on five addresses), about 70% of the
  Inbox's 916 KB read; none writes those headers.
- **"The workspace knows the sender" counts any contact.** The Updates rule leaves a stranger's notice, and
  `mailSortingFor`'s `knows` is any live contact with the address. The first notice made the contact; every later one
  came from someone known.
- **Nothing reads behaviour.** 62 emails in six months, never answered, through Amazon SES, filed under Updates:
  nothing asks.
- **Unsure is in.** A wrong "in" is a fake person, a Needs-you row, a drafted reply and every phone's read; a wrong
  "left" is one press on "It's a person" (00483, which brings their six months).
- **The six months read every message whole**, a newsletter's HTML with the rest, before it is sorted, and list drafts
  with the mail (`gmailListSince` names no label).

## Decision

1. **A sender is judged once, and the judgement is kept.** One row a sender (`mailbox_sender_reads`, 00495): what it is,
   in a few words what it wanted, when. The live read and every import read it before they judge an email; the owner's
   word (00483 `mailbox_senders`) always comes before it.
2. **The order, for an email outside a thread a reach-out started:** what the workspace said; the business's own
   domain; what the email claims (its headers); the Gmail tab; then the four that are new: **the owner talks with
   them** (in); **a reading kept** (as it said); **others said it** (left, where three or more other workspaces' owners
   said its domain is automated; never a free-mail domain); **sent through a mailing service with nobody behind it**
   (left: Amazon SES, SendGrid, Mailgun, Mailchimp and their kin, read off the Message-ID, the Return-Path and their own
   headers, unless its Reply-To names someone else); Updates from a stranger that answers nothing (left, as before);
   and last, **the model reads the stranger's first email**.
3. **"The owner talks with them" is narrow and certain:** the business sent their address an email (a person's send,
   the owner's own from the mailbox, or one Chanlytics sent for them); or they are on another wire with the business
   (WhatsApp, a text, a call, Instagram); or a door the owner chose made them (the calendar, a lead, by hand, the
   website, an ad). A person a mailbox's own mail made is not known, so one slip no longer opens the door for sixty.
4. **The model's reading:** Haiku 5.5, the purpose `sender_read`, its thinking off, one read a sender. It is told the
   business's name and its own words about what it does (`business_records.about`), the sender, where its replies go,
   the subject, the first words, and what the headers say (a mailing service, the Gmail tab, answers something). It
   answers one of:
   - `inquiry`: someone asking about the business's own services, prices, a booking or a quote. **In.**
   - `person`: someone writing to the business as a person (a customer, a supplier, a partner). **In.**
   - `pitch`: someone selling to the business. **Left**, listed as "Selling to you".
   - `notice`: a program's mail: an account, a bill, a receipt, a shipment, a report, a newsletter. **Left.**
   - `relayed`: a program passing on someone's message (a website form, a marketplace). **Left**, listed as "A form or
     a tool passed on a message", with what was asked beside it, so a lead is seen. Bringing the person behind it in is
     the next step (below).
     With `about`: under twelve words of what they wanted, no names and no contact details. No model (no key, a
     workspace the model may not answer for, no answer): the email is judged as before, and nothing is kept, so it is
     asked again. Who may be read for is the receptionist's rule (`workspaceMayUseModels`: open to its customers), not
     reach-out's spend: a mailbox is connected in the first run, inside the free trial reach-out waits out, and a reading
     costs a hundredth of a cent.
5. **The six months read like a person would.** Gmail lists what the owner sent first, then the rest (`-in:sent
-in:drafts`), so whom the owner wrote to is known before their mail is judged; a received message is read by its
   headers alone (`format=metadata`), and only what may come in is read whole. Microsoft's road is left as it is (halted,
   27 Oct).
6. **What the owner is told:** the Brought in card's line says "414 emails · 4 asked about your services and never got
   an answer · since Jun 7" (`asked`: the inquiries the six months found, every one from someone the owner never wrote
   to); the set-aside line says "195 newsletters, notices and pitches set aside". "Left in your mailbox" says the new
   reasons, and what a pitch or a relayed message wanted.
7. **Not a person, where the owner is.** The thread's Actions menu offers it for a person with an address: it opens
   their page with Not a person asked (the same door, 00483), since it deletes.

## Shape

- **00495** `a_mailbox_reads_each_sender_once`: `mailbox_sender_reads` (tenant, address, kind, about, read_at; members
  read, the service role writes); `mailbox_left.why` takes `service`, `pitch`, `notice`, `relayed`, `others_said`;
  `ai_usage.purpose` takes `sender_read`; `sender_domain_said_automated(tenant, domain)` (the service role's: other
  workspaces' owners, three or more); `mailbox_senders_on_erase` re-created to take a person's reading with them.
- **contracts:** `MODEL_PURPOSES` + route, the reading's schema and words (`email/sender-reading.ts`),
  `MAILBOX_LEFT_WHY_WORDS`, `ImportCounts.asked` and the line's words.
- **channels:** `gmailHead` and `gmailHeadOf` (a message by its headers, labels and snippet), `sentByAService`, `replyToElsewhere`; `MailWindow.only` (what the mailbox sent, or the rest).
- **db:** `senderReadingOf`, `keepSenderReading`, `talksWith`, `domainSaidAutomated`; `mailboxSendersOf` with `about`.
- **edge:** `mailbox-sorting.ts` (the order above, `MailSorting.read`), `mailbox-reader.ts` (askJson), `mail-history.ts`
  (phases, headers first), the sync passing its line to the reader.
- **dashboard:** the Actions item; Left in your mailbox's words and `about`.

## Steps

All in one lane, one pull request, no step on its own.

## Tests

The sorting's order case by case (a reading kept, owner-known by each road, the service rule and its Reply-To
exception, others said, the model's five kinds, no model); the six months' phases, the head read and the counts; the
Left list's `about`; the Actions item; the migration replayed with its erasure leg.

## Risks

- **A real stranger sent through a mailing service is left.** A person's own mail never goes through SES or SendGrid;
  a form relayed through one carries a Reply-To and is read by the model. The Left list is one press from coming in.
- **The model calls a customer a pitch.** Listed, one press away; the owner's word wins after.
- **Spend:** one read a sender, ~1,000 tokens on Haiku 5.5; a six-month mailbox with 300 strangers is cents.
- **Reading twice:** a received message that may come in is read twice (headers, then whole): more requests for kept
  mail, far fewer bytes for left mail, which is most of a mailbox.

## Open questions

- **The person behind a relayed message:** bring them in (their thread, what they asked), on both roads; their address
  from the Reply-To or the model's reading. The intake resolves a person by From today (core `email-ingest.ts`).
- **The people who came in before this:** sort them again and offer them in one list (his taps, for now).
