# Bookings arrive by email

**Status.** Written 7 October 2026 against main `a80e79d1c` (00342 the last migration then; this lane's was 00343
until #1464 landed on main with that number and #1465 took 00344 on its branch, so it is **00345**, the two gaps argued
in `supabase/migrations-ledger.json`). Builds
decision 0002's record and the one universal input every booking tool already produces. One branch
(`bookings/arrive-by-email`), one migration, one pull request when every step below is built and proved. Nothing is
pushed until Ruben has seen it on the local app. Analysis and evidence:
`Claude Video/docs/2026-10-06-chanlytics-calendar-wiring.md` (v3).

**Built, 7 October, uncommitted on the branch:** steps 1 to 6 as listed (the record and the ledger, with an erasure's
hand, `appointments_scrub`; the claim; the intake branch and the `booking_read` job over the edge's reader; the board
drawing rows beside the feed, on realtime; the "Bookings by email" line and note in Settings › Business; a caller's own
visit said from the record), plus step 7's comment and decision-note fixes. Generated files regenerated from a replayed
stack (schema snapshot, database types, schema sets, unique keys, data model, API reference); the three ratchets that
moved banked or cleared. **Later the same day, on Ruben's "go on 1 to 4":** section 6's refinements A to D, in the
same branch and the same migration (the mailbox's four `forward_confirm_*` columns, the `booking_notice` notification
kind). Packages built, both apps typechecked, lint and the ratchets green, every touched test file green, dead exports
unchanged, the database suites the schema touches green on the replayed stack. Not yet: Ruben's look on the local app
(port 3301) with a real notice forwarded, the bundle budget's numbers (a dashboard build), and the e2e specs' nightly
run.

## 1. Why

Every booking tool emails the business when a client books, changes or cancels. The one we have evidence from, Booksy,
writes nothing into any calendar (its help centre documents only a one-time import), so a Booksy salon's appointments
reach the product only this way. The notice carries what a calendar event never promises: the client's name, phone and
email, the service, the staff member, the time, the price, the add-ons and the note. Acuity and Fresha send theirs to
any address the owner lists; Booksy, Square, Vagaro and GlossGenius send to the owner's own inbox, so the owner forwards
with one filter. The workspace already has an address (00126) and an inbound door that routes a forward by its envelope.

The product stores nothing about an appointment today: every page, reply and playbook re-parses the iCal feed. A notice
has no feed to be re-derived from, so this is also where 0002's `appointments` table is built, as the one record every
later reader (People, Reports, playbooks, the receptionist's open times) moves onto. Those readers are a later lane; this
one writes the record, draws it on the board and tells a caller their own next visit.

Nothing here is Booksy's. The sender list names the tools so a forward is recognised; the read is the model's and the
same for every tool; the fixtures are de-identified notices as the tools really write them.

## 2. The rule

A booking notice never becomes a conversation. It becomes an appointment row, or a row held for a person with the reason,
and nothing is dropped. The receptionist never books: a notice is the tool's word about a booking the tool made.

## 3. Steps

Each step is built and proved on this branch before the next. "Both orders" means the step is correct whichever of the
two apps deploys first (README rule).

### Step 1 · The record (migration `003NN_an_appointment_is_a_record.sql`, number taken at push time)

- [ ] `appointments` as 0002 drew it, plus the notice's fields: `tool`, `staff`, `client_name`, `client_phone` (E.164),
      `client_email`, `price`, `note`, `notice_id` (the provider's id for the delivery: the replay gate), `held_reason`
      (null when read whole; else why a person must look). `source` gains `booking_email`.
- [ ] Indexes: `(tenant_id, source, external_id)` unique where not null; `(tenant_id, notice_id)` unique where not
      null; `(tenant_id, starts_at)`; `(tenant_id, contact_id, starts_at)`; `(tenant_id, client_phone, starts_at)`.
- [ ] RLS member select; grants per 00339 (`select` to authenticated, all four to service_role); `moddatetime` on
      `updated_at`; 0002's guard trigger; `comment on table`; `alter publication supabase_realtime add table`.
- [ ] `jobs.kind` gains `booking_read`; `jobs_booking_read_once` on `(payload->>'received_id')` where kind =
      'booking_read' and state <> 'failed' (00222's pattern). `ai_usage.purpose` gains `booking_read`.
- [ ] Generated: `supabase/schema.sql`, `database.types.ts`, schema sets, `docs/data-model.md`; `tenancy.db.test.mjs`
      and `privileges.db.test.mjs` know the table; `appointments.db.test.mjs` proves the guard and the unique indexes.
- [ ] Both orders: a table neither app writes yet.

### Step 2 · The claim (contracts + channels)

- [ ] `packages/contracts/src/appointments/notice.ts`: `BOOKING_TOOLS` (sender domain → tool), `bookingNoticeOf(email)`:
      the sender's domain is a tool's, or the subject is a forward (`Fwd:`, `FW:`) whose body names a tool's domain. Null
      for everything else. A tool named here is only a recognised sender; nothing else about it is known.
- [ ] channels `classifyReceived` takes the subject and text beside the headers and answers `booking_notice` before the
      automated checks (a bounce stays a report). `EmailClaim` gains the word; `message-author.ts` notes it.
- [ ] Tests: a Booksy notice, a forwarded copy, an Acuity notice; a person's email from gmail; a bounce.

### Step 3 · The intake branch and the read (core + jobs + edge)

- [ ] `ingestEmail`: a `booking_notice` claim schedules one `booking_read` for the delivery (`ports.readBooking`),
      stamps the mailbox and answers `kept_as_booking`. No message row, no conversation, no flag.
- [ ] Pure, in contracts `appointments/notice.ts`: `NOTICE_SCHEMA` (the JSON shape the model answers), `noticePrompt`
      (system and user words: the notice's text, the business's zone, today's date), `noticeAnswerOf` (the answer read
      strictly: kind booked | changed | cancelled, client name/phone/email, service, staff, start and end as local
      clock times made instants in the business's zone, price, note, previous start; a missing start or client is a
      `held` with its reason), `appointmentKey(tool, client, startMs)`.
- [ ] core `appointments/notice-read.ts` `readBookingNotice(ports, cmd)`: `mayRead` first (no model, may not spend) →
      a held row with that reason; the model asked once through `ports.ask`; the answer read; then by kind: booked →
      upsert on the key (a repeat delivery finds its `notice_id` and does nothing); changed → the row at the previous
      start moves, else a new booked row; cancelled → the row at that start is cancelled, else a cancelled row is kept
      so the fact is. The client is matched or made by phone through `ports.personFor` (the calendar sweep's own rules:
      a name fills only an empty one, an erased person is not brought back). Outcome words for the log.
- [ ] jobs `booking-read.ts` handler over `ctx.bookings` (ask with `purpose: "booking_read"`, `mayRead`, `personFor`),
      injected by the edge in `jobs-tick.ts` beside `replies`. `MODEL_PURPOSES` gains `booking_read` (Haiku 4.5,
      Sonnet fallback, the read bound). `LOG_EVENTS` gains `booking_notice_read`, `booking_notice_held`.
- [ ] Tests: core verb over fake ports with a de-identified Booksy notice (new, changed, cancelled), a repeat delivery,
      a change for a booking never seen, a cancel for one never seen, a held read; jobs handler over a fake context.
- [ ] Both orders: an older edge never schedules the kind; a newer one scheduling it against an older ledger is refused
      by the CHECK, so step 1 deploys first.

### Step 4 · The board (dashboard)

- [ ] db `repositories/appointments.ts`: `appointmentsBetween`, `appointmentsHeld`, `appointmentUpsert`,
      `appointmentMove`, `appointmentCancel`, `appointmentByKey`, `appointmentsForPerson`.
- [ ] contracts: `itemOfAppointment(row)` makes a `FeedItem` of a row (title `<service> · <client>`, the note as the
      description, the client's phone and email as the contacts, `uid` `appt:<id>`), `mergeItems(feed, rows)` drops a
      feed event that is the same visit (same client phone or email, starts within fifteen minutes). `CalendarItemDto`
      gains optional `source: "calendar" | "notice"` and `tool`. `CalendarFeedDto` gains `notices: { tool, last_at,
      held }`.
- [ ] `calendar-week.ts`: the rows for the span read beside the feed (`fresh` and the cache untouched), merged, drawn.
      The board's "No calendar connected" card says instead, when notices have arrived, that bookings arrive by email
      from the tool, the board shows them, and the receptionist still names no open time. Held notices are counted on
      the card. The panel shows a notice's row with its person, phone, email, service, staff and note.
- [ ] `calendarOverride.refreshOnTables = ["appointments"]`: a row written is a board repainted.
- [ ] Tests: `calendar-week` union and dedupe; the words; `calendar-honest` for the card.

### Step 5 · Settings › Business

- [ ] "Bookings by email" beside "Calendar it reads": the workspace's address with a copy button, the last notice
      ("from Booksy, 2 h ago" / "none yet"), held count, and a fold "Where to send them" with one line per tool
      (Acuity: Calendar notifications › Send booking notifications to; Fresha: Online bookings › Notifications; Booksy,
      Square, Vagaro, GlossGenius: a filter in Gmail or Outlook that forwards the tool's booking emails here).
- [ ] Reads `GET calendar`'s `feed.notices` and `GET connections`' address: no new route.

### Step 6 · The receptionist knows the caller's own visit (edge)

- [ ] `visitsFor(rt, who)`: the caller's rows (by phone, else email) beside the feed's, through `describeVisits`, so
      "Their next appointment is Thursday at 3 PM" is said for a booking that arrived by email. Nothing about open
      times changes: with no calendar the receptionist still names none.
- [ ] Tests: `availability-tool`'s visits with rows.

### Step 7 · Decision 0002, dists, generated files

- [ ] 0002's status block says what is built (steps 1, 2 and 7 of its own list) and what this lane left to the readers
      lane. The `availability.ts` and `calendar-people.ts` comments stop saying Booksy syncs to a calendar.
- [ ] `packages/*/dist` rebuilt after Prettier; `docs/api.md`; `browser.generated.ts` checked; bundle budget rows.

## 4. Not in this lane

The receptionist's open times from rows (needs the "every booking goes through my tool" setting and the Booksy
hand-booking test), People's visits, Reports' booked line and the playbooks reading rows: the readers lane. The iCal
feed written into the table: the same lane. A bell notification kind for a notice: not until an owner asks. Google's
button: a later convenience.

## 5. Risks

- **The model misreads a notice.** The read is strict, a bad read is held for a person, and the row keeps the subject
  and the delivery id so the email can be opened. Nothing is dropped and nothing is invented.
- **A forward loop.** Our own mail coming back is already refused (`ours`); a notice forwarded twice is one row by its
  key, and a repeat delivery by its `notice_id`.
- **A tool's email changes shape.** The read is the model's, not a regex, and the fixture test says what a change broke.
- **Cost.** One short read per notice, on the small model, under the workspace's spend gate.

## 6. The review of 7 October, and what it found

Ruben: "review for refinements ... backend to frontend ... best modern practices end to end". Read against the built
lane, and against what a modern booking-ingestion feature owes its owner.

**Defects, fixed in the lane the same day.**

- The board did not repaint live. The dashboard's live feed is not the `supabase_realtime` publication but a per-table
  trigger (00265, `workspace_tell_changes`) and a row in `WATCHED` (packages/db realtime.ts). 00345 now makes the three
  triggers and names the table, and `each-workspace-is-told-what-changed.db.test.mjs` holds them equal.
- A forged "booking" could write a visit. Anyone who knew the workspace's address could mail it a notice from a spoofed
  tool address. The intake now trusts a notice two ways only: the tool's own mail, proved its own by the receiving side
  (`senderAuthenticated`: an aligned DMARC pass, or a DKIM pass signed by the From domain, which a Gmail filter's
  forward keeps intact), or a forward by hand from a member of the workspace (`member_has_address`, 00345). Anything
  else is taken in as the automated email it looks like, for a person to read: nothing lost, nothing booked on a
  stranger's word. Four cases in `core-email-ingest.test.mjs`.
- A delivery the provider no longer had when the read ran left no trace. It is now a held notice (`gone`) under the
  tool the intake recognised, which the job's payload carries.

**Refinements proposed, in order of value. Ruben said go on A to D the same day ("go on 1 to 4"); E to G wait.**

- [x] **A. "Where your bookings come from", one fold.** Built 7 October in Settings › Business, the fold after
      "Calendar it reads" (`open-bookings.tsx`): a tool picker (kept as `config.bookings.tool`, the schema holding it
      to contracts `BOOKING_TOOL_IDS`), the workspace's address inline with Copy, and a door to Connections when the
      workspace has none yet (the mailbox door itself stays on Connections; a second copy of it here was not worth a
      second writer); the steps for the chosen tool (`BOOKING_TOOL_STEPS`: a recipient the tool takes, or a forward,
      with Gmail's note, and the way to see it work at once, `BOOKING_TRY_NOTE`: a forward by hand from a member's own
      address); the row states the tool as its value and, under it, one mark and the next thing to do, from the
      Calendar's own view model (`feed.notices.row`: an address to make, a forward to confirm, emails to look at, the
      last email's age, or waiting for the first). The tool's name reaches the board's card and the panel. Not built:
      a row of Setup's, and the receptionist's "book on Booksy" (its wording is the sells-by lane's).
- [x] **B. Gmail's forwarding confirmation, surfaced.** Built: the intake claims Google's notice
      (`forwarding_confirmation`, contracts `forwardingConfirmationOf`), trusted from the proved sender only, and keeps
      the account, the code and the link on the mailbox (`mailboxes.forward_confirm_*`); the fold shows "Gmail asks to
      confirm forwarding here" with the code and "Confirm in Gmail"; the first notice read lets the confirmation go.
- [x] **C. Held notices are a list, not a count.** Built: the fold lists each held notice (tool, subject, when, why)
      with "Read again" (`POST calendar/notices/[id]/read-again`, one more `booking_read` for a held one) and
      "Dismiss" (`…/dismiss`, outcome `dismissed`); a bell notification of the `booking_notice` kind, once per notice,
      when one is held for a reason a person can act on. The board's card keeps the count.
- [x] **D. The source, visible and subtle.** Built as words, not a glyph: a block that arrived by email names its tool
      on its second line, in its title and in its label ("booked through Booksy"), carries `data-tool` for a test or
      a stylesheet to find it, and the legend reads "Taken, from your calendar or your booking tool". The tool's
      initial as a mark waits on a kit entry for it.

**The pass over A to D, 7 October (Ruben: "make sure the ux ui is clean not cluttered or confusing and super easy for
users to connect and use as intended").** Walked as a first-time owner, against the heuristics (status visible, next
step first, one quiet signal a row, nothing the kit does not draw). Found and fixed: the row passed a component as its
value, so it never said "Not set up" (a row's value is null to be empty: the tool is the value now, the signal its
child); the signal said "waiting" when the real blocker was no address to send to, or a forward Gmail was holding
(`feed.notices.row` says the next thing to do first); the fold's steps were a bare list where the calendar fold draws
its guides (`bt-feed-guide`, numbered, with a heading), and nothing told an owner how to see it work at once (the hand
forward, one sentence); a held email's three facts and two presses ran on one line (each is now its own lines,
`.bt-bookings-*` layout rules alone); a refused Read again or Dismiss said nothing (said under the list); the bell
named the tool by its id ("booksy") and said "could not be read" where the fold says "needs a look"; the board's card
said "notices" where everything else says "booking emails"; the hold reasons and the Gmail sentence read as the
reader's words, not an owner's. Kept: the mailbox door on Connections (an address is chosen once and cannot be
changed, so it is not made in passing), and one row for the whole of it. A second look the same day (Ruben: "copy
clean concise, smart indicators on hover or click"): the row's mark carries its own word under a pointer and for a
screen reader (`row.label`: Working, Needs you, Waiting), as the calendar row's mark carries the Calendar page's; a
held email's sender waits under a pointer on its subject; the hold reasons say what to do, never that it will happen
(a held read runs again only on Read again: the job ends on a hold); the Gmail and try-it sentences and both hints
are a line shorter; and the board's card keeps one door whose words are what is next there ("Look at them" with
emails held, "Add a calendar" as the quiet extra once emails work, the address otherwise). Held to by
`business-tab-open.test.mjs` (the row's three states, the mark's word, the fold's parts) and `calendar.test.mjs`
(the row's words).

**A row is taken time for everyone who names an open time (found before the push, 7 October).** The board subtracted
the record's rows from the open times it draws as "the receptionist would offer", and nobody else did: the
receptionist on the edge, Ask's openings and the prompt's preview read the feed alone, so beside a calendar that
reads, the receptionist could offer an hour Booksy had emailed as booked, while the board showed it taken. One rule
now (contracts `busyOfAppointments`) over one span (`offeringHorizon`, the days on offer), read by each of the four:
the edge's `openingsData` (`recordBusy` in `apps/edge/lib/calendar/availability.ts`), and on the dashboard
`server/calendar/record-busy.ts`, which Ask's openings and the prompt's preview are handed as a port (`taken`: they
still read nothing of the database themselves) and the board reads where its span does not cover the days on offer,
so the next open time is right on a board turned to another month. Subtracting only ever removes a time. A record
that cannot be read is none, logged (`availability_record_failed` on the edge): the feed's openings are still said, as
before the record, and no reply is held for it. With no calendar nothing is offered and nothing of the record is
read: that is still E, below. Held to by `availability-tool.test.mjs` (the edge: an emailed hour left out, a
cancelled one not, a failed read falls back and is logged), `calendar-counts.test.mjs` and `prompt-preview.test.mjs`
(the port), and `ask/readers.test.mjs` (the reader under RLS; the board, in its week and turned to December).

- [ ] **E. Open times from the record, when the owner says so.** A workspace setting, off by default: "Every booking
      goes through my booking tool". With it on and no calendar, the rows are the taken time and the receptionist
      offers windows. After the pilot salon's hand-booking test says whether Booksy emails those too.
- [ ] **F. Two fuses.** A daily cap on notice reads per workspace (the reply reader's pattern, `takeReplyRead`), and a
      retention clock on `appointment_notices` (the ledger, not the visits) at ninety days.
- [ ] **G. The readers lane** as section 4 lists it: the feed written into the table, People, Reports and the playbooks
      on rows, `kept` by time.

Recommended: A, B, C and D as one continuation of this lane (about two days), E after the pilot salon's test, F with the readers
lane. What is already in keeping with modern practice and stays: one idempotent job per delivery with a ledger and a
dedupe key, structured outputs held to a strict shape, RLS with service-role writes, an erasure leg beside the
columns, the live feed, and the record as the one thing every reader reads.

**One whole-branch review before the merge, and what it changed (7 October).** An independent read of the branch,
with the pull request open and its checks green, found the trust rule above wrong in the one way that mattered, and
nine smaller things. Each was checked against the code before it was changed.

- **A forward by hand was trusted on a From line anyone can write.** The member's address was asked of the workspace,
  and whether the sender was proved was not: an owner's address over a quoted `From: Booksy` booked, moved or
  cancelled a visit. And the deployment could prove no sender at all (`EMAIL_AUTHSERV_ID` is not set on production),
  so the forged path was the only one that would have worked. Now three things, each one a stranger cannot supply:
  the sender is proved, whichever way the notice came; the tool is the one the workspace named (so a workspace that
  set nothing up reads nothing, and its email is what it was before); and a forward by hand is a member's. Until the
  deployment can prove a sender, no notice is read, and each is kept for a person (docs/runbook.md says how to set it).
- **The tool is a section of its own in the config** (`bookings.tool`). As a key of `calendar` it made a calendar
  section with no address, which a build from before this could not parse, and a config that does not parse is a
  receptionist that says nothing: either deploy order, and a rollback.
- **A read that threw was never tried again.** The kind had no waits, so the first throw failed the job and nothing
  was left of the delivery. It is tried twice more, and the last try holds the notice for a person.
- **A tool's email about no booking is set aside, not held**: a filter forwards a tool's receipts and its newsletter
  too, and each rang the bell. An email written to a client about a visit of their own somewhere else is one of
  those (an owner's own appointment at another business, booked on the same tool, is forwarded like the rest).
- **A time withdrawn and booked again is a visit again.** Its key named the ended row, which does not come back, and
  the time was offered to someone else.
- A number the table refuses is no number (the visit is kept by the name and the address); an end more than half a
  day off, and a day its month does not have, are misreads; an erasure finds a visit by the number as the visit
  keeps it; "Working" means a notice became a visit; Gmail's confirmation is shown for three days.

Known, and left for the pilot to say more about: a change whose email names no old time is written as a booking at the
new time and the old row stays until it passes (moving the client's only other visit would be a guess that frees a
taken hour when wrong); a cancellation that names its client differently from the booking is kept as the fact and
ends nothing; a tool's notice proves the tool, and with the tool named and the sender proved, a notice the same tool
sends about another business's booking is told apart by its words alone (the reader's "written to the client" rule).
