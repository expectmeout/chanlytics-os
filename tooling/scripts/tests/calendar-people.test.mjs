/**
 * The people in the calendar: who an appointment is for, read from the
 * words a booking tool wrote into the owner's calendar.
 *
 * The feed now carries the description, the place and the guests; a phone
 * found anywhere in the event beats a name; a name only counts whole and
 * four letters or more. The same match feeds the board's panel, the
 * person's profile and both receptionists — one person everywhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIcs,
  extractContacts,
  personInText,
  matchPerson,
  visitsOf,
  visitDay,
  visitTime,
  visitLine,
  describeVisits,
  feedSourceLabel,
  eventText,
  toVisitDto,
  toPersonVM,
  afterPersonRefused,
} from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

/**
 * The People page and the table it draws with, each read once for the whole file. The table, its Columns menu and
 * their helpers were lifted out of the page into people-table.jsx (release B of the lead finder), so the strings
 * below live in one file or the other; four reads of the page became one, and the fifth is the table's.
 */
const PEOPLE_PAGE = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
const PEOPLE_TABLE = readCode("apps/dashboard/src/legacy/pages/people-table.jsx");

/**
 * The business's own addresses, for the cases below that are not about them:
 * matching by number, address and name is the same with an empty set. The
 * cases that ARE about them are at the end of this file.
 */
const NO_OWN = new Set();
const TZ = "America/New_York";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:b1",
  "SUMMARY:Maria Lopez - Balayage",
  "DESCRIPTION:Booked via Booksy\\nPhone: (305) 555-0134\\nEmail: maria.lopez",
  " @gmail.com\\nNotes: first time\\, wants ash tones",
  "LOCATION:Melany's Beauty Salon\\, 123 Main St",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T170000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b2",
  "SUMMARY:Haircut",
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Ruiz, Ana: VIP";X-NUM-GUESTS=0:mailto:ana@example.com',
  "ATTENDEE;CN=Melany Owner:mailto:owner@salon.com",
  "DTSTART;TZID=America/New_York:20260910T100000",
  "DTEND;TZID=America/New_York:20260910T110000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b3",
  "SUMMARY:Daniela Ruiz · Colour",
  "DTSTART;TZID=America/New_York:20260820T100000",
  "DTEND;TZID=America/New_York:20260820T120000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b4",
  "SUMMARY:Lunch",
  "DESCRIPTION:Order #2026-09-08 14:00 confirmed 123456789012",
  "DTSTART;TZID=America/New_York:20260909T130000",
  "DTEND;TZID=America/New_York:20260909T133000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const NOW = Date.parse("2026-09-06T16:00:00.000Z");
const feed = () => parseIcs(ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });

test("the feed carries the description, the place and the guests — folded, unescaped, quoted parameters intact", () => {
  const f = feed();
  const maria = f.items.find((i) => i.uid === "b1");
  assert.equal(
    maria.description,
    "Booked via Booksy\nPhone: (305) 555-0134\nEmail: maria.lopez@gmail.com\nNotes: first time, wants ash tones",
  );
  assert.equal(maria.location, "Melany's Beauty Salon, 123 Main St");
  assert.deepEqual(maria.attendees, []);
  const cut = f.items.find((i) => i.uid === "b2");
  assert.deepEqual(
    cut.attendees,
    [
      { name: "Ruiz, Ana: VIP", email: "ana@example.com" },
      { name: "Melany Owner", email: "owner@salon.com" },
    ],
    "a quoted CN may hold : and ;",
  );
  assert.equal(cut.description, null);
  assert.ok(f.items.every((i) => Array.isArray(i.attendees)));
});

test("phones and emails are found wherever they were written; a date, a time and an order number are not phones; an email's digits are not either", () => {
  const f = feed();
  const c = extractContacts(
    f.items.find((i) => i.uid === "b1"),
    NO_OWN,
  );
  assert.deepEqual(c.phones, ["+13055550134"]);
  assert.deepEqual(c.emails, ["maria.lopez@gmail.com"]);
  const g = extractContacts(
    f.items.find((i) => i.uid === "b2"),
    NO_OWN,
  );
  assert.deepEqual(g.emails, ["ana@example.com", "owner@salon.com"]);
  assert.deepEqual(g.names, ["Ruiz, Ana: VIP", "Melany Owner"]);
  const lunch = extractContacts(
    f.items.find((i) => i.uid === "b4"),
    NO_OWN,
  );
  assert.deepEqual(lunch.phones, [], "2026-09-08 14:00 and a bare 12-digit run are not phones");
  assert.deepEqual(
    extractContacts(
      {
        title: "Call +1 305 555 0134 or 305.555.0199",
        description: "user2025@x.com 3055550177 ext",
        location: null,
        attendees: [],
      },
      NO_OWN,
    ).phones,
    ["+13055550134", "+13055550199", "+13055550177"],
  );
});

const PEOPLE = [
  { id: "p-maria", name: "Maria Lopez", phone: "+13055550134" },
  { id: "p-dani", name: "Dani", phone: "+13055550100" },
  { id: "p-daniela", name: "Daniela Ruiz", phone: null },
  { id: "p-ana", name: "Ana", phone: null },
  { id: "p-num", name: "", phone: "+13055550199" },
];

test("a name counts only whole and four letters or more; the longest wins; never a phone made words", () => {
  assert.equal(personInText("Daniela Ruiz · Colour", PEOPLE)?.id, "p-daniela", "Dani is not inside Daniela");
  assert.equal(personInText("Dani · trim", PEOPLE)?.id, "p-dani");
  assert.equal(personInText("Ana Ruiz - haircut", PEOPLE), null, "three letters is not a match");
  assert.equal(personInText("+1 (305) 555-0199", PEOPLE), null, "a phone shown as a name matches nothing");
  assert.equal(personInText("MARIA LOPEZ", PEOPLE)?.id, "p-maria", "case does not matter");
});

test("who it is for: a phone in the event beats the name; a guest's name matches; a name-only match says so", () => {
  const f = feed();
  const maria = matchPerson(
    f.items.find((i) => i.uid === "b1"),
    PEOPLE,
    NO_OWN,
  );
  assert.deepEqual(maria, { id: "p-maria", name: "Maria Lopez", via: "phone" });
  const byPhoneOnly = matchPerson(
    { title: "Balayage", description: "305-555-0199", location: null, attendees: [] },
    PEOPLE,
    NO_OWN,
  );
  assert.deepEqual(
    byPhoneOnly,
    { id: "p-num", name: "+1 (305) 555-0199", via: "phone" },
    "a person known only by number is still found, and labelled by it",
  );
  const cut = matchPerson(
    f.items.find((i) => i.uid === "b2"),
    [...PEOPLE, { id: "p-vip", name: "Ruiz, Ana: VIP", phone: null }],
    NO_OWN,
  );
  assert.deepEqual(cut, { id: "p-vip", name: "Ruiz, Ana: VIP", via: "name" }, "a guest's name");
  assert.equal(
    matchPerson(
      f.items.find((i) => i.uid === "b4"),
      PEOPLE,
      NO_OWN,
    ),
    null,
    "lunch is nobody's",
  );
});

/**
 * An appointment booked through Google: the customer is a guest, and the only
 * thing the event says about them is their address. People holds an email
 * since 00125, so that is enough to know whose appointment it is.
 */
const GUEST_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:g1",
  "SUMMARY:Colour touch-up",
  "ATTENDEE;CN=Front Desk:mailto:owner@salon.com",
  "ATTENDEE:mailto:Sofia.Perez@Gmail.com",
  "DTSTART;TZID=America/New_York:20260911T090000",
  "DTEND;TZID=America/New_York:20260911T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:g2",
  "SUMMARY:Blow-dry",
  "DESCRIPTION:Phone: (305) 555-0134\nEmail: maria.lopez@gmail.com",
  "DTSTART;TZID=America/New_York:20260912T090000",
  "DTEND;TZID=America/New_York:20260912T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:g3",
  "SUMMARY:Daniela Ruiz \u00b7 Colour",
  "DTSTART;TZID=America/New_York:20260913T090000",
  "DTEND;TZID=America/New_York:20260913T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:g4",
  "SUMMARY:Gel manicure",
  "ORGANIZER;CN=Melany Owner:mailto:Melany@Gmail.com",
  "ATTENDEE;CN=Melany Owner;PARTSTAT=ACCEPTED:mailto:melany@gmail.com",
  "ATTENDEE;CN=Ana Gomez;PARTSTAT=NEEDS-ACTION:mailto:ana.gomez@gmail.com",
  "DTSTART;TZID=America/New_York:20260914T090000",
  "DTEND;TZID=America/New_York:20260914T100000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const guestFeed = () =>
  parseIcs(GUEST_ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });

const GUESTS = [
  { id: "p-sofia", name: "Sofia Perez", phone: null, email: "sofia.perez@gmail.com" },
  { id: "p-maria2", name: "Maria Lopez", phone: "+13055550134", email: "maria.lopez@gmail.com" },
  { id: "p-daniela2", name: "Daniela Ruiz", phone: null, email: null },
];

test("an address is read after the number and before the name, so a customer booked through Google as a guest is still someone", async () => {
  const { indexFeed, visitsIn, allVisitsIn } = await import("@chanlytics/contracts");
  const g = guestFeed();
  const at = (uid) => g.items.find((i) => i.uid === uid);
  const [sofia, maria, daniela] = GUESTS;

  assert.deepEqual(
    matchPerson(at("g1"), GUESTS, NO_OWN),
    { id: "p-sofia", name: "Sofia Perez", via: "email" },
    "a guest's address, in whatever case it was written",
  );
  assert.deepEqual(
    matchPerson(at("g2"), GUESTS, NO_OWN),
    { id: "p-maria2", name: "Maria Lopez", via: "phone" },
    "her number and her address both in the event: the number wins",
  );
  assert.deepEqual(
    matchPerson(at("g3"), GUESTS, NO_OWN),
    { id: "p-daniela2", name: "Daniela Ruiz", via: "name" },
    "a name-only match is what it always was",
  );
  assert.equal(
    matchPerson(
      {
        title: "Colour touch-up",
        description: null,
        location: null,
        attendees: [{ name: null, email: "someone@else.com" }],
      },
      GUESTS,
      NO_OWN,
    ),
    null,
    "an address nobody holds is nobody",
  );

  const index = indexFeed(g.items, NO_OWN);
  assert.deepEqual(
    index.byEmail.get("sofia.perez@gmail.com").map((i) => i.uid),
    ["g1"],
  );
  assert.equal(
    index.byEmail.get("owner@salon.com").length,
    1,
    "the owner's own address is indexed like any other; nobody in People holds it",
  );

  const v = visitsIn(index, sofia, NOW);
  assert.equal(v.next?.title, "Colour touch-up");
  assert.equal(v.next?.via, "email");
  assert.equal(v.last, null);
  assert.deepEqual(
    allVisitsIn(index, maria).map((x) => [x.title, x.via]),
    [["Blow-dry", "phone"]],
    "the number wins here too, and the visit is taken once",
  );
  assert.deepEqual(
    allVisitsIn(index, daniela).map((x) => [x.title, x.via]),
    [["Daniela Ruiz \u00b7 Colour", "name"]],
  );
  assert.deepEqual(
    allVisitsIn(index, { id: "p-none", name: "", phone: null, email: null }),
    [],
    "a person with no address matches none of them",
  );

  assert.ok(
    !describeVisits(v, TZ, NOW).includes("Matched by name only"),
    "an address is exact: it needs no are-you-sure, no more than a number does",
  );
});

/**
 * The owner is on every event their own calendar carries: Google writes them
 * as ORGANIZER and lists them among the guests as well. They are not the
 * customer, and the day they are in People -- which the email channel makes
 * likely, since testing a new inbox means writing to it from your own address
 * -- matching them would hand them every appointment on the calendar.
 */
const OWNER = { id: "p-melany", name: "Melany Owner", phone: null, email: "melany@gmail.com" };
const ANA = { id: "p-ana-g", name: "Ana Gomez", phone: null, email: "ana.gomez@gmail.com" };

test("the organiser is not the customer: the owner's own address and name are off the event, however many ways it names them", async () => {
  const { indexFeed, allVisitsIn, guessName } = await import("@chanlytics/contracts");
  const g = guestFeed();
  const ev = g.items.find((i) => i.uid === "g4");
  const people = [...GUESTS, OWNER, ANA];

  const c = extractContacts(ev, NO_OWN);
  assert.deepEqual(
    c.emails,
    ["ana.gomez@gmail.com"],
    "the organiser's address is off, though it is written as a guest too and in another case",
  );
  assert.deepEqual(
    c.names,
    ["Ana Gomez"],
    "and their name with it: a CN on every event is not a guess at the customer",
  );

  assert.deepEqual(
    matchPerson(ev, people, NO_OWN),
    { id: "p-ana-g", name: "Ana Gomez", via: "email" },
    "the guest is whose appointment it is",
  );
  assert.equal(guessName(ev), "Ana Gomez", "Add to People offers the customer, never the owner");

  const index = indexFeed(g.items, NO_OWN);
  assert.equal(
    index.byEmail.get("melany@gmail.com"),
    undefined,
    "the organiser is not indexed, so no number of events can add up to a match",
  );
  assert.deepEqual(allVisitsIn(index, OWNER), [], "the owner takes none of the appointments on their own calendar");
  assert.deepEqual(
    allVisitsIn(index, ANA).map((x) => [x.title, x.via]),
    [["Gel manicure", "email"]],
  );

  assert.equal(
    matchPerson(
      { title: "Lunch", description: null, location: null, attendees: [], organizer: "melany@gmail.com" },
      people,
      NO_OWN,
    ),
    null,
    "an event that names only the organiser is nobody's",
  );
});

test("their visits: the next one that has not ended, the latest one that has; the words by the business's clock", () => {
  const f = feed();
  const v = visitsOf(f.items, PEOPLE[0], NOW, NO_OWN);
  assert.equal(v.next?.title, "Maria Lopez - Balayage");
  assert.equal(v.next?.via, "phone");
  assert.equal(v.last, null);
  const d = visitsOf(f.items, PEOPLE[2], NOW, NO_OWN);
  assert.equal(d.next, null);
  assert.equal(d.last?.title, "Daniela Ruiz · Colour");
  assert.equal(visitDay(v.next.start, TZ, NOW), "Tue, Sep 8");
  assert.equal(visitDay(NOW + 3_600_000, TZ, NOW), "Today");
  assert.equal(visitDay(NOW + 86_400_000, TZ, NOW), "Tomorrow");
  assert.equal(visitTime(v.next, TZ), "2:00 – 5:00 PM");
  assert.equal(visitTime({ start: v.next.start, end: v.next.end, allDay: true }, TZ), "all day");
  assert.equal(visitLine(v.next, TZ, NOW), "Tue, Sep 8 · 2:00 – 5:00 PM");
  const dto = toVisitDto(v.next);
  assert.equal(dto.start, "2026-09-08T18:00:00.000Z");
  assert.equal(dto.all_day, false);
  assert.equal(visitLine(dto, TZ, NOW), "Tue, Sep 8 · 2:00 – 5:00 PM", "the same words from the wire");
  assert.equal(toVisitDto(null), null);
});

test("the receptionist's lines: the next appointment, the last visit, the rule that nothing changes here, and a name-only match flagged", () => {
  const f = feed();
  const words = describeVisits(visitsOf(f.items, PEOPLE[0], NOW, NO_OWN), TZ, NOW);
  assert.equal(
    words,
    "Their next appointment on the calendar: Tue, Sep 8 · 2:00 – 5:00 PM (Maria Lopez - Balayage). If they ask, confirm it; to change or cancel it, send the booking link — nothing is changed from here.",
  );
  const byName = describeVisits(visitsOf(f.items, { id: "x", name: "Maria Lopez", phone: null }, NOW, NO_OWN), TZ, NOW);
  assert.ok(byName.includes("Matched by name only — make sure it is them before confirming details."));
  const last = describeVisits(visitsOf(f.items, PEOPLE[2], NOW, NO_OWN), TZ, NOW);
  assert.equal(last, "Their last visit on the calendar: Aug 20 (Daniela Ruiz · Colour).");
  assert.equal(describeVisits({ next: null, last: null }, TZ, NOW), null, "nothing to say is null, never a sentence");
});

test("the calendar's name from its address, and a description as plain text", () => {
  assert.equal(feedSourceLabel("https://calendar.google.com/calendar/ical/x/private-abc/basic.ics"), "Google Calendar");
  assert.equal(feedSourceLabel("webcal://p12-caldav.icloud.com/published/2/abc"), "Apple Calendar");
  assert.equal(feedSourceLabel("https://outlook.office365.com/owa/calendar/abc/calendar.ics"), "Outlook");
  assert.equal(feedSourceLabel("https://booksy.example/feed.ics"), "your calendar");
  assert.equal(feedSourceLabel(null), "your calendar");
  assert.equal(
    eventText("<b>Booked</b> via Booksy<br>Phone: 305 &amp; more<p>Notes</p>"),
    "Booked via Booksy\nPhone: 305 & more\nNotes",
  );
  assert.equal(eventText("   "), null);
  assert.equal(eventText("x".repeat(2000)).length, 1500);
});

const ROW = {
  id: "p-maria",
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 0,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: null,
  latest_state: null,
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: null,
  last_message_direction: null,
  last_message_sender: null,
  last_inbound_text: null,
  last_inbound_at: null,
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: null,
  earliest_row_at: null,
  has_backfill: false,
  has_chat: false,
  queued_reply_at: null,
};
const detail = (visits) => ({
  row: ROW,
  identities: [],
  conversations: [],
  calls: [],
  escalations: [],
  decisions: [],
  receptionist_mode: null,
  workspace_reply_mode: "auto",
  ...(visits ? { visits } : {}),
});
const detail_ = (over = {}) => ({
  row: { ...ROW, ...over },
  identities: [],
  conversations: [],
  calls: [],
  escalations: [],
  decisions: [],
  receptionist_mode: null,
  workspace_reply_mode: "auto",
});

test("the profile: a Next visit fact and About rows when the calendar is connected; nothing invented when it is not", () => {
  const now = new Date(NOW);
  const none = toPersonVM(detail(null), TZ, now);
  assert.ok(
    !none.facts.some((f) => f.label === "Next visit") && !none.about.some((a) => a.k === "Next visit"),
    "no calendar, no line",
  );
  const next = {
    id: "b1:1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T21:00:00.000Z",
    title: "Maria Lopez - Balayage",
    all_day: false,
    via: "phone",
  };
  const last = {
    id: "b0:1",
    start: "2026-08-20T14:00:00.000Z",
    end: "2026-08-20T16:00:00.000Z",
    title: "Colour",
    all_day: false,
    via: "name",
  };
  const vm = toPersonVM(detail({ timezone: TZ, source: "Google Calendar", state: "ok", next, last }), TZ, now);
  const fact = vm.facts.find((f) => f.label === "Next visit");
  assert.deepEqual(
    fact,
    { label: "Next visit", value: "Tue, Sep 8", meta: "2:00 – 5:00 PM" },
    "the cell is narrow: the time here, the service in About",
  );
  assert.deepEqual(
    vm.about.filter((a) => a.k === "Next visit" || a.k === "Last visit"),
    [
      { k: "Next visit", v: "Tue, Sep 8 · 2:00 – 5:00 PM · Maria Lopez - Balayage" },
      { k: "Last visit", v: "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour" },
    ],
  );
  const empty = toPersonVM(
    detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null }),
    TZ,
    now,
  );
  assert.deepEqual(
    empty.facts.find((f) => f.label === "Next visit"),
    { label: "Next visit", value: "—", meta: "none booked" },
  );
  const down = toPersonVM(
    detail({ timezone: TZ, source: "Google Calendar", state: "unavailable", next: null, last: null }),
    TZ,
    now,
  );
  assert.equal(down.about.find((a) => a.k === "Next visit").v, "Calendar could not be read");
  const byName = toPersonVM(
    detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: { ...next, via: "name" }, last: null }),
    TZ,
    now,
  );
  assert.ok(byName.facts.find((f) => f.label === "Next visit").meta.endsWith("· by name"));
  assert.equal(down.facts.find((f) => f.label === "Next visit").meta, "could not be read");
});

test("the wiring: the board and the profile read one match; both receptionists are told; the panel says who it is for and where it comes from", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(
    svc.includes("export async function personVisits(") &&
      svc.includes("const v = visitsIn(index, person, now.getTime());"),
    "the profile's visits, from the same feed and match",
  );
  assert.ok(svc.includes("source: feedSourceLabel(url)"), "the calendar's name, never its address");
  assert.ok(!svc.includes("personInTitle"), "the old name-only match is gone");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(
    route.includes("const visits = await personVisits(ctx, tenantId, personLike(row)).catch(") &&
      route.includes("visits: visits ?? undefined,"),
    "never fatal to the profile",
  );
  const edge = readCode("apps/edge/lib/calendar/availability.ts");
  assert.ok(
    /export async function visitsFor\(\s*rt: TenantRuntime,\s*who: \{ phone: string \| null; name: string \| null \}/.test(
      edge,
    ) &&
      /return describeVisits\(\s*visitsOf\(feed\.items, \{ id: "caller", name: who\.name \?\? "", phone: who\.phone, email: null \}, now\.getTime\(\), own\),\s*rt\.timezone,\s*now\.getTime\(\),?\s*\);/.test(
        edge,
      ),
  );
  const wa = readCode("packages/core/src/inbound/answer.ts");
  assert.ok(
    wa.includes("const visits = rt ? await ports.calendar.visits(rt, { phone: e164, name: lead.name }) : null;") &&
      wa.includes("if (visits) leadNote = `${leadNote}\\n${visits}`;"),
    "WhatsApp: with who they are",
  );
  // Phone: the visits in the caller context, and a call for a switched-off
  // channel telling the platform as a text does: run in call-start.test.mjs.
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  for (const id of ["cal-panel-person", "cal-panel-contact", "cal-panel-where", "cal-panel-desc"])
    assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(
    page.includes("From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there."),
    "one line, no feed counts",
  );
  assert.ok(!page.includes("read just now") && !page.includes("feedLine"), "the chip's sentence stays on the chip");
  assert.ok(page.includes("matched by {b.person.via}") && page.includes("Not in People yet"));
  const dto = readCode("packages/contracts/src/calendar.ts");
  assert.ok(
    dto.includes('source: dto.feed.source ?? "your calendar"') &&
      dto.includes('From ${dto.feed.source ?? "your calendar"} · read'),
    "the chip names the calendar",
  );
});

test("the client's name as the event gives it: a guest first, then the title's name-like part, never a service or a plain description", async () => {
  const { guessName } = await import("@chanlytics/contracts");
  const svcs = ["Balayage", "Haircut", "Hair coloring"];
  const t = (title, attendees = []) => guessName({ title, attendees }, svcs);
  assert.equal(t("Maria Lopez - Balayage"), "Maria Lopez");
  assert.equal(t("Balayage · Maria Lopez"), "Maria Lopez");
  assert.equal(t("Haircut with Maria Lopez"), "Maria Lopez");
  assert.equal(t("Booksy: Maria Lopez (Balayage)"), "Maria Lopez");
  assert.equal(t("Ana Ruiz — Haircut"), "Ana Ruiz");
  assert.equal(t("Salon Appointment Hair coloring"), null, "no name in it");
  assert.equal(t("Team training"), null);
  assert.equal(t("Lunch, every day"), null);
  assert.equal(t("Balayage"), null, "a service alone");
  assert.equal(
    t("Haircut", [{ name: "Ruiz, Ana: VIP", email: "ana@example.com" }]),
    "Ruiz, Ana: VIP",
    "a guest's name wins",
  );
  assert.equal(t("Haircut", [{ name: null, email: "ana@example.com" }]), null, "an email is not a name");
});

test("people from a feed: one row per phone inside the window, the soonest upcoming appointment keys it, a name fills in from another", async () => {
  const { peopleFromItems } = await import("@chanlytics/contracts");
  const f = feed();
  const rows = peopleFromItems(f.items, ["Balayage", "Haircut"], NOW);
  assert.deepEqual(
    rows.map((r) => [r.phone, r.name, r.title]),
    [["+13055550134", "Maria Lopez", "Maria Lopez - Balayage"]],
    "only the appointment with a number; lunch's order number is not one",
  );
  const mk = (uid, title, start, description = null) => ({
    start,
    end: start + 3_600_000,
    title,
    allDay: false,
    uid,
    description,
    location: null,
    attendees: [],
  });
  const many = [
    mk("p1", "Balayage", NOW + 5 * 86_400_000, "305-555-0199"),
    mk("p2", "Ana Ruiz - Haircut", NOW + 2 * 86_400_000, "305-555-0199"),
    mk("p3", "Haircut", NOW - 3 * 86_400_000, "305-555-0199"),
    mk("p4", "Old one", NOW - 60 * 86_400_000, "305-555-0177"),
    mk("p5", "Far one", NOW + 120 * 86_400_000, "305-555-0166"),
  ];
  const out = peopleFromItems(many, ["Balayage", "Haircut"], NOW);
  assert.deepEqual(
    out.map((r) => [r.phone, r.name, r.uid]),
    [["+13055550199", "Ana Ruiz", "p2"]],
    "the soonest upcoming keys the row; outside the window is left alone",
  );
  const named = peopleFromItems(
    [
      mk("q1", "Balayage", NOW + 86_400_000, "305-555-0155"),
      mk("q2", "Lola Diaz - Haircut", NOW + 3 * 86_400_000, "305-555-0155"),
    ],
    ["Balayage", "Haircut"],
    NOW,
  );
  assert.deepEqual(
    named.map((r) => [r.name, r.uid]),
    [["Lola Diaz", "q1"]],
    "a later appointment with a name fills in for the one without",
  );
});

test("one refused number costs one person, never everyone behind them", () => {
  // 22023 is create_person's own refusal of THIS row: a phone that is not in
  // international form, or a name over 80 characters. The read used to `break`
  // on it, so a single short code sitting on the calendar silently kept every
  // later person out of People for as long as it stayed there -- and said so
  // only in a log line nobody reads.
  assert.equal(afterPersonRefused("22023"), "skip");

  // Everything else fails the same way for all forty rows, so proving it forty
  // times during a page load helps nobody.
  for (const code of ["28000", "P0002", "42501", "PGRST202", "57014"]) {
    assert.equal(afterPersonRefused(code), "stop", code);
  }

  // Unknown means unproven, and the safe unknown is the one that does less.
  // It is also the old behaviour, so a client that stops reporting codes
  // degrades to what shipped rather than to forty futile calls.
  assert.equal(afterPersonRefused(undefined), "stop");
  assert.equal(afterPersonRefused(null), "stop");
  assert.equal(afterPersonRefused(""), "stop");

  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(
    svc.includes('if (afterPersonRefused(error.code) === "skip") {') && svc.includes("continue;"),
    "the read must ASK the rule rather than deciding inline",
  );
  // The bare `break` is what this test exists to prevent coming back.
  assert.ok(
    !/if \(error\) \{[^}]*\n\s*break;/.test(svc),
    "a refusal must not end the batch before the rule has been consulted",
  );
  assert.ok(
    /console\.error\(\s*"calendar_people_refused"/.test(svc) &&
      svc.includes("refused, of: rows.length, added: added.length"),
    "and it says once how many people the refusals cost, not once per row",
  );
});

test("automatically: an hourly sweep on the edge and the owner's own read both put the feed's people in People through one extraction; the profile says where they came from; no button", () => {
  const mig = readCode("supabase/migrations/00052_create_person.sql");
  assert.ok(
    mig.includes(
      "create or replace function public.create_person(p_tenant_id uuid, p_phone_e164 text, p_display_name text, p_source text)",
    ),
  );
  assert.ok(
    mig.includes("security definer") &&
      mig.includes("if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then"),
    "owner or operator",
  );
  assert.ok(
    mig.includes("insert into contacts (tenant_id, phone_e164, display_name)") &&
      !/insert into contacts \([^)]*consent|set consent/.test(mig),
    "consent is not touched: a booking is not a yes",
  );
  assert.ok(mig.includes("where id = v_id and display_name is null;"), "a name fills only an empty one");
  const sweep = readCode("supabase/migrations/00053_calendar_people_sweep.sql");
  assert.ok(
    sweep.includes("url     := v_url || '/api/cron/calendar',") &&
      sweep.includes("select cron.schedule('calendar-people-sweep',"),
    "pg_cron calls the edge every hour, like the other sweeps",
  );
  const lib = readCode("apps/edge/lib/calendar/calendar-people.ts");
  assert.ok(
    lib.includes(".insert({ tenant_id: tenantId, phone_e164: r.phone, display_name: r.name })") &&
      lib.includes('if (iErr.code !== "23505") throw') &&
      /kind: "contact\.added",\s*category: "contact"/.test(lib),
    "get-or-create with the service role, an event for each person created",
  );
  assert.ok(lib.includes('.is("display_name", null)'), "a name fills only an empty one");
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(
    /if \(opts\.canAct\)\s*people\.push\(\s*\.\.\.\(await addPeopleSeen\(/.test(svc) &&
      /ctx\.supabase\.rpc\("create_person", \{\s*p_tenant_id: tenantId,\s*p_phone_e164: r\.phone,\s*p_display_name: r\.name \?\? "",\s*p_source: "calendar",\s*p_title: r\.title,?\s*\}\)/.test(
        svc,
      ),
    "an owner's read adds through the door, before the board is matched",
  );
  assert.ok(
    sweep.includes("insert into events (tenant_id, kind, category, subject_type, subject_id, data)") &&
      sweep.includes("'contact.added'"),
    "the door records where a person came from; members cannot write events themselves",
  );
  assert.ok(
    readCode("apps/dashboard/app/api/v1/calendar/route.ts").includes(
      'const canAct = member.role === "owner" || member.role === "operator";',
    ),
    "a viewer's read changes nothing",
  );
  const route = readCode("apps/dashboard/app/api/v1/contacts/route.ts");
  assert.ok(
    route.includes('role: "operator",') && route.includes('ctx.supabase.rpc("create_person"'),
    "the door's own route stays, for a hand",
  );
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(
    detail.includes('.eq("kind", "contact.added")') && detail.includes("added: added.data"),
    "the profile reads where they came from",
  );
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  assert.ok(
    !page.includes("cal-panel-add") && !page.includes("__addPerson"),
    "no button on the CALENDAR: added on its own, deleted from the profile if unwanted",
  );
  assert.ok(page.includes('"Not in People yet — added within the hour"'));
  // The hand's door has its screen on People now (slice D of the data program):
  // the same route, a number and a name, opening the person it made or found.
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/people-detail.ts").includes('return api()("POST contacts", { body });'),
    "the bridge verb, through the same door",
  );
  const edgeAv = readCode("apps/edge/lib/calendar/availability.ts");
  assert.ok(
    /export async function feedItemsFor\(\s*tenantId: string,\s*url: string,\s*tz: string,\s*now = new Date\(\),\s*daysAhead = 14,?\s*\)/.test(
      edgeAv,
    ),
    "the sweep reads the feed through the same cache",
  );
});

test("the profile: Added from your calendar, with the appointment that named them", () => {
  const now = new Date(NOW);
  const vm = toPersonVM(detail(null), TZ, now);
  assert.ok(!vm.about.some((a) => a.k === "Added"));
  const fromCal = toPersonVM(
    { ...detail(null), added: { at: "2026-09-06T14:00:00.000Z", source: "calendar", title: "Maria Lopez - Balayage" } },
    TZ,
    now,
  );
  assert.equal(
    fromCal.about.find((a) => a.k === "Added").v,
    "Sep 6, 2026 · from your calendar (Maria Lopez - Balayage)",
  );
  const byHand = toPersonVM(
    { ...detail(null), added: { at: "2026-09-06T14:00:00.000Z", source: "manual", title: null } },
    TZ,
    now,
  );
  assert.equal(byHand.about.find((a) => a.k === "Added").v, "Sep 6, 2026 · by hand");
});

test("a feed indexed once matches many people the same way the per-item matcher does: number first, whole name second", async () => {
  const { indexFeed, visitsIn } = await import("@chanlytics/contracts");
  const f = feed();
  const index = indexFeed(f.items, NO_OWN);
  for (const p of PEOPLE) {
    const a = visitsOf(f.items, p, NOW, NO_OWN);
    const b = visitsIn(index, p, NOW);
    assert.deepEqual(b, a, p.id);
  }
  assert.equal(index.byPhone.get("+13055550134").length, 1);
  assert.equal(index.texts.length, f.items.length);
});

test("Booked and Asked-never-booked are facts from the calendar on the row: the chip's day, the two lists, the two counts; without a calendar the lists do not exist", async () => {
  const { toPersonRowVM, PEOPLE_LISTS, peopleAggregates } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const next = {
    id: "b1:1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T21:00:00.000Z",
    title: "Balayage",
    all_day: false,
    via: "phone",
  };
  const last = {
    id: "b0:1",
    start: "2026-08-20T14:00:00.000Z",
    end: "2026-08-20T16:00:00.000Z",
    title: "Colour",
    all_day: false,
    via: "phone",
  };
  const cal = (v) => ({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, ...v });
  const asked = { ...ROW, id: "a", last_inbound_at: "2026-09-04T12:00:00.000Z", last_call_at: null };
  const booked = toPersonRowVM({ ...asked, id: "b", visits: cal({ next }) }, TZ, now);
  assert.equal(booked.booked, true);
  assert.equal(booked.nextVisitDay, "Tue, Sep 8");
  assert.equal(booked.nextVisit, "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage");
  assert.equal(booked.askedNotBooked, false, "booked is not asked-never-booked");
  const gap = toPersonRowVM({ ...asked, visits: cal({}) }, TZ, now);
  assert.equal(gap.askedNotBooked, true, "wrote this month, the calendar never had them");
  assert.equal(gap.askedMs, Date.parse("2026-09-04T12:00:00.000Z"));
  const visited = toPersonRowVM({ ...asked, id: "v", visits: cal({ last }) }, TZ, now);
  assert.equal(visited.askedNotBooked, false, "they have been on the calendar before");
  assert.equal(visited.lastVisit, "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour");
  const stale = toPersonRowVM(
    { ...asked, id: "s", last_inbound_at: "2026-07-01T12:00:00.000Z", visits: cal({}) },
    TZ,
    now,
  );
  assert.equal(stale.askedNotBooked, false, "asked more than a month ago is not this list");
  const noCal = toPersonRowVM({ ...asked, id: "n", visits: null }, TZ, now);
  assert.equal(noCal.calendar, "none");
  assert.equal(noCal.askedNotBooked, false, "no calendar: nothing to say");
  const bookedList = PEOPLE_LISTS.find((l) => l.id === "booked");
  const askedList = PEOPLE_LISTS.find((l) => l.id === "asked_never_booked");
  assert.ok(bookedList.needsCalendar && askedList.needsCalendar, "shown only when the calendar is connected");
  assert.ok(bookedList.test(booked) && !bookedList.test(gap));
  assert.ok(askedList.test(gap) && !askedList.test(booked) && !askedList.test(visited));
  assert.deepEqual(
    [...PEOPLE_LISTS].map((l) => l.id).slice(0, 7),
    ["needs_you", "waiting_on_you", "new_week", "booked_week", "booked", "asked_never_booked", "lapsed"],
    "attention, then the journey",
  );
  const agg = peopleAggregates([booked, gap, visited, stale, noCal], NOW);
  assert.equal(agg.booked, 1);
  assert.equal(agg.askedNotBooked, 1);
});

test("asked, then booked: the report's one conversion line, in words that say what was counted", async () => {
  const { bookedAfterAsk, toBookingReportVM } = await import("@chanlytics/contracts");
  const askedMs = Date.parse("2026-09-01T12:00:00.000Z");
  const up = { id: "x", start: NOW + 86_400_000, end: NOW + 2 * 86_400_000, title: "Cut", allDay: false, via: "phone" };
  assert.equal(bookedAfterAsk({ next: up, last: null }, askedMs), true, "an appointment ahead");
  assert.equal(
    bookedAfterAsk({ next: null, last: { ...up, start: askedMs + 86_400_000, end: askedMs + 90_000_000 } }, askedMs),
    true,
    "held since they reached out",
  );
  assert.equal(
    bookedAfterAsk(
      { next: null, last: { ...up, start: askedMs - 30 * 86_400_000, end: askedMs - 29 * 86_400_000 } },
      askedMs,
    ),
    false,
    "a visit before they asked does not answer the ask",
  );
  assert.equal(bookedAfterAsk(null, askedMs), false);
  assert.deepEqual(toBookingReportVM({ calendar: "ok", days: 30, asked: 40, booked: 12 }), {
    present: true,
    calendar: "ok",
    headline: "12 of 40 booked",
    sub: "30% of the people who wrote or called in the last 30 days have an appointment on the calendar",
    words: "of the people who wrote or called in the last 30 days have an appointment on the calendar",
    pct: 30,
    asked: 40,
    booked: 12,
    unbooked: 28,
    rest: "28 of the 40 who asked have nothing on the calendar yet.",
  });
  // The share's other side, said once, for the card that draws the meter: how many are still waiting for a time, in
  // the view model's words and never the page's. One of them is singular; none of them is the good news.
  assert.deepEqual(
    [
      toBookingReportVM({ calendar: "ok", days: 30, asked: 2, booked: 1 }).unbooked,
      toBookingReportVM({ calendar: "ok", days: 30, asked: 2, booked: 1 }).rest,
    ],
    [1, "1 of the 2 who asked has nothing on the calendar yet."],
  );
  assert.deepEqual(
    [
      toBookingReportVM({ calendar: "ok", days: 7, asked: 3, booked: 3 }).unbooked,
      toBookingReportVM({ calendar: "ok", days: 7, asked: 3, booked: 3 }).rest,
    ],
    [0, "Everyone who asked in the last 7 days has an appointment."],
  );
  // A page that draws the share itself (Reports' meter) says the rest in the view model's own words.
  assert.deepEqual(
    [
      null,
      { calendar: "none", days: 30, asked: 0, booked: 0 },
      { calendar: "unavailable", days: 30, asked: 5, booked: 0 },
      { calendar: "ok", days: 7, asked: 0, booked: 0 },
    ].map((d) => [toBookingReportVM(d).calendar, toBookingReportVM(d).words, toBookingReportVM(d).rest]),
    [
      ["none", "", ""],
      ["none", "", ""],
      ["unavailable", "", ""],
      ["ok", "", ""],
    ],
    "which calendar, and no words where nothing was counted",
  );
  assert.equal(toBookingReportVM({ calendar: "ok", days: 7, asked: 0, booked: 0 }).headline, "Nobody asked");
  assert.equal(toBookingReportVM({ calendar: "none", days: 30, asked: 0, booked: 0 }).present, false);
  assert.equal(toBookingReportVM(null).sub, "Connect your calendar under Settings › Business to see who booked.");
  assert.equal(
    toBookingReportVM({ calendar: "unavailable", days: 30, asked: 5, booked: 0 }).sub,
    "Your calendar could not be read.",
  );
});

test("the wiring: the list and the assistant carry appointments from one parsed feed; the report carries the line; Leads and the Deal board retire into People", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(
    svc.includes("const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();") &&
      svc.includes("export async function peopleVisits(") &&
      svc.includes("const index = indexFeed(feed.parsed.items, own);"),
    "one parse, indexed once, for everyone",
  );
  assert.ok(svc.includes("export async function bookingReport(") && svc.includes("bookedAfterAsk("));
  assert.ok(
    readCode("apps/dashboard/app/api/v1/contacts/route.ts").includes(
      "const out = await withVisits(ctx, tenantId, rows);",
    ),
    "the list carries visits and the calendar's state, a page at a time",
  );
  const rep = readCode("apps/dashboard/app/api/v1/reports/route.ts");
  assert.ok(
    rep.includes(".then((rows) => bookingReport(ctx, tenantId, rows, days))") &&
      rep.includes("return { report, booking };"),
    "never fatal to the report",
  );
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(
    tools.includes('list: { type: "string" }') &&
      tools.includes("if (list && !list.test(vmOf.get(r.id)!)) return false;") &&
      tools.includes("next_visit: r.visits?.next"),
    "the assistant answers who booked and who never did",
  );
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(
    sd.includes('(!l.needsCalendar || calendar.state === "ok") &&') &&
      sd.includes("(!l.needsDeals || dealsOn),") &&
      sd.includes("booking: toBookingReportVM(data.booking),"),
  );
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  // Leads came back on 18 Sep 2026 as a SCOPE of People, so the old address lands on that scope, not on the list of clients.
  assert.ok(
    reg.includes('leads: "clients/leads",') &&
      reg.includes('pipeline: "clients",') &&
      reg.includes("w.__surfaceRetired = surfaceRetiredTo;"),
    "retired, and where to",
  );
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(
    shell.includes('if (retiredTo) window.location.hash = "/" + retiredTo;'),
    "a real workspace lands on People",
  );
  // Booked was a stat card above the table as well as a list on the rail; the rail keeps it.
  assert.ok(
    PEOPLE_PAGE.includes('data-testid="row-next-visit"') && PEOPLE_PAGE.includes("asked_never_booked:"),
    "the column and the tips",
  );
  assert.ok(!PEOPLE_PAGE.includes('<StatCell label="Booked"'), "REGRESSION: the rail said it and a card said it again");
  assert.ok(readCode("apps/dashboard/src/legacy/pages/reports-sections.jsx").includes('testid="chart-booking"'));
});

test("a name the owner gives and notes the receptionist reads: two doors, one route, the profile's rename and Notes, the VM's givenName", () => {
  const mig = readCode("supabase/migrations/00054_person_details.sql");
  assert.ok(
    mig.includes("create or replace function public.set_person_name(p_contact_id uuid, p_name text)") &&
      mig.includes("create or replace function public.set_person_notes(p_contact_id uuid, p_notes text)"),
  );
  assert.ok(
    mig.includes("check (notes is null or char_length(notes) between 1 and 600)") &&
      mig.includes("grant select (notes) on public.contacts to authenticated;"),
  );
  assert.ok(mig.includes("'contact.named'") && mig.includes("'contact.noted'"), "each door records who changed what");
  assert.ok(mig.split("not public.is_acting_member(v_tenant)").length === 3, "owner or operator, both doors");
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts");
  assert.ok(route.includes('rate: "person_edit",') && route.includes('role: "operator",'));
  assert.ok(
    /rpc\("set_person_name", \{\s*p_contact_id: id,\s*p_name: name \?\? "",?\s*\}\)/.test(route) &&
      /rpc\("set_person_notes", \{\s*p_contact_id: id,\s*p_notes: notes \?\? "",?\s*\}\)/.test(route),
  );
  assert.ok(
    route.includes('"Send a name, notes, an email address or a proposal link."'),
    "the schema refuses in the same words",
  );
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(
    detail.includes('sb.from("contacts").select("notes, proposal_url").eq("id", id).maybeSingle()') &&
      detail.includes("notes: own.data?.notes ?? null,"),
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(
    bridge.includes("window.__setPersonDetails = setPersonDetails;") && bridge.includes('"PUT contacts/[id]/details"'),
  );
  const page = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  for (const id of [
    "person-rename",
    "person-name-input",
    "person-name-save",
    "person-notes",
    "person-notes-input",
    "person-notes-save",
  ])
    assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes("Notes for the receptionist") && page.includes("used as facts, never read aloud"));
  assert.ok(
    page.includes("<PersonName p={p} canEdit={canRecord} flash={ppFlash} />"),
    "the hero name is the editable one",
  );
  const vm = toPersonVM({ ...detail_(), notes: "  Sees Sofia  " }, TZ, new Date(NOW));
  assert.equal(vm.notes, "Sees Sofia");
  assert.equal(vm.givenName, "Maria Lopez");
  const numbered = toPersonVM(detail_({ display_name: null }), TZ, new Date(NOW));
  assert.equal(numbered.givenName, null, "a number is not a given name");
  assert.equal(numbered.notes, null);
});

test("the journey from visits: Booked this week and Lapsed, in three groups; each list's next step waits for a recorded yes", async () => {
  const { toPersonRowVM, PEOPLE_LISTS, PEOPLE_LIST_GROUPS, peopleListAction, GET_YES_ROUTE } =
    await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const cal = (v) => ({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, ...v });
  const soon = {
    id: "n",
    start: new Date(NOW + 3 * 86_400_000).toISOString(),
    end: new Date(NOW + 3 * 86_400_000 + 3_600_000).toISOString(),
    title: "Cut",
    all_day: false,
    via: "phone",
  };
  const far = {
    ...soon,
    start: new Date(NOW + 20 * 86_400_000).toISOString(),
    end: new Date(NOW + 20 * 86_400_000 + 3_600_000).toISOString(),
  };
  const old = {
    ...soon,
    id: "o",
    start: new Date(NOW - 60 * 86_400_000).toISOString(),
    end: new Date(NOW - 60 * 86_400_000 + 3_600_000).toISOString(),
  };
  const recent = {
    ...old,
    start: new Date(NOW - 10 * 86_400_000).toISOString(),
    end: new Date(NOW - 10 * 86_400_000 + 3_600_000).toISOString(),
  };
  const week = toPersonRowVM({ ...ROW, id: "w", visits: cal({ next: soon }) }, TZ, now);
  const later = toPersonRowVM({ ...ROW, id: "l", visits: cal({ next: far }) }, TZ, now);
  const lapsed = toPersonRowVM({ ...ROW, id: "x", visits: cal({ last: old }) }, TZ, now);
  const regular = toPersonRowVM({ ...ROW, id: "r", visits: cal({ last: recent }) }, TZ, now);
  const back = toPersonRowVM({ ...ROW, id: "b", visits: cal({ last: old, next: far }) }, TZ, now);
  assert.equal(week.nextVisitDays, 3);
  assert.equal(lapsed.lastVisitDays, 60);
  const L = (id) => PEOPLE_LISTS.find((l) => l.id === id);
  assert.ok(L("booked_week").test(week) && !L("booked_week").test(later), "seven days");
  assert.ok(L("booked").test(week) && L("booked").test(later));
  assert.ok(
    L("lapsed").test(lapsed) && !L("lapsed").test(regular) && !L("lapsed").test(back),
    "forty-five days since the chair and nothing ahead",
  );
  assert.ok(L("booked_week").needsCalendar && L("lapsed").needsCalendar);
  assert.deepEqual(
    PEOPLE_LIST_GROUPS.map((g) => g.id),
    ["attention", "journey", "reach"],
  );
  assert.deepEqual(
    PEOPLE_LISTS.filter((l) => l.group === "journey").map((l) => l.id),
    ["new_week", "booked_week", "booked", "asked_never_booked", "lapsed"],
  );
  assert.deepEqual(
    PEOPLE_LISTS.filter((l) => l.group === "attention").map((l) => l.id),
    ["needs_you", "waiting_on_you"],
  );
  assert.deepEqual(
    PEOPLE_LISTS.filter((l) => l.group === "reach").map((l) => l.id),
    ["quiet", "phoned_only", "opted_in", "offers_ok", "opted_out"],
    "two consent lists, because there are two answers",
  );
  assert.ok(PEOPLE_LISTS.every((l) => ["attention", "journey", "reach"].includes(l.group)));
  // The step counts the MARKETING yes, because every one of these steps opens the
  // composer on a promotional send. Counting the conversational answer promised an
  // audience the composer would then refuse -- the same mismatch, one screen
  // earlier. A person who said yes to messages and not to offers is NOT counted.
  const yes = { ...lapsed, consent: { ...lapsed.consent, state: "opted_in", marketing: "opted_in" } };
  const talkOnly = { ...lapsed, consent: { ...lapsed.consent, state: "opted_in", marketing: "unknown" } };
  assert.deepEqual(peopleListAction("lapsed", [lapsed, yes]), {
    text: "1 of 2 on this list said yes to offers — a broadcast reaches them.",
    cta: "Bring them back",
    to: "broadcasts/lapsed",
    enabled: true,
  });
  // Nobody on the list has said yes to offers: the list's own step cannot run, and the step that CAN is the
  // door to that yes. It printed "The phrase and the QR are on Broadcasts" beside a disabled "Win them back".
  assert.deepEqual(peopleListAction("lapsed", [lapsed]), {
    text: "Nobody on this list has said yes to offers yet — a broadcast reaches only that answer.",
    cta: "Get their yes",
    to: GET_YES_ROUTE,
    enabled: true,
  });
  // A yes to messages is not a yes to offers: the broadcast is still not on offer -- the step is the door
  // to the SECOND yes, which is precisely what this person has not given.
  assert.notEqual(
    peopleListAction("lapsed", [talkOnly]).to,
    "broadcasts/lapsed",
    "a yes to messages is not a yes to offers",
  );
  assert.equal(peopleListAction("lapsed", [talkOnly]).to, GET_YES_ROUTE);
  assert.equal(peopleListAction("lapsed", []).text, "Nobody here right now.");
  assert.equal(peopleListAction("lapsed", []).enabled, false, "an empty list has nothing to fix, so no door");
  // Someone here DID say yes to offers and simply has no number: asking them to "get their yes" would ask for an
  // answer they already gave. The list keeps its own step, waiting, and says what is actually missing.
  const yesNoNumber = { ...yes, phone: null };
  const waiting = peopleListAction("lapsed", [yesNoNumber]);
  assert.equal(waiting.to, "broadcasts/lapsed");
  assert.equal(waiting.enabled, false);
  assert.match(waiting.text, /a recorded yes with a number to send to/);
  // The two doors that said "Broadcasts" and meant the QR go to the QR.
  assert.equal(peopleListAction("opted_in", [talkOnly]).to, GET_YES_ROUTE);
  assert.equal(peopleListAction("new_week", [talkOnly]).to, GET_YES_ROUTE);
  assert.equal(
    peopleListAction("opted_in", [yes, talkOnly]).to,
    GET_YES_ROUTE,
    "while anyone on it has the yes to give, the door stays",
  );
  assert.deepEqual(
    peopleListAction("new_week", []),
    {
      text: "Their yes to offers is the phrase and the QR on Broadcasts.",
      cta: "Get their yes",
      to: GET_YES_ROUTE,
      enabled: false,
    },
    "an empty list has answered nothing: its door waits, as before",
  );
  // REGRESSION: once everyone on the list has given that yes, the door asked for an answer they gave (#663's rule).
  // The step is the list's broadcast, in the words every list's broadcast step says it.
  assert.deepEqual(peopleListAction("new_week", [yes]), {
    text: "1 of 1 on this list said yes to offers — a broadcast reaches them.",
    cta: "Use in a broadcast",
    to: "broadcasts/new_week",
    enabled: true,
  });
  assert.deepEqual(
    peopleListAction("opted_in", [yes]),
    {
      text: "1 of 1 on this list said yes to offers — a broadcast reaches them.",
      cta: "Broadcast to everyone who said yes",
      to: "broadcasts",
      enabled: true,
    },
    "the Can receive offers list's own step",
  );
  // Everyone said it and nobody has a number: the broadcast waits, and says what is missing.
  const answeredNoNumber = peopleListAction("opted_in", [yesNoNumber]);
  assert.deepEqual([answeredNoNumber.to, answeredNoNumber.enabled], ["broadcasts", false]);
  assert.match(answeredNoNumber.text, /a recorded yes with a number to send to/);
  assert.deepEqual(peopleListAction("booked_week", [week]), {
    text: "Their appointments are on the Calendar.",
    cta: "See the week",
    to: "calendar",
    enabled: true,
  });
  assert.equal(peopleListAction("asked_never_booked", [yes]).to, "broadcasts/asked_never_booked");
  assert.equal(peopleListAction("booked", [week]), null, "no step for a fact that needs none");
  assert.equal(peopleListAction("opted_out", [week]), null);
});

test("the list page: the rail is grouped, a state is a chip, a list has its step, the view is linkable and remembered", () => {
  assert.ok(
    PEOPLE_PAGE.includes('data-testid="row-next-visit"') && !PEOPLE_PAGE.includes("row-booked"),
    "the column carries the outcome; the chip is gone",
  );
  // The groups themselves are the rail kit's (RailGroup), drawn and counted in people-honest, not read here.
  assert.ok(PEOPLE_PAGE.includes("cl-rail-group-label"));
  assert.ok(
    PEOPLE_PAGE.includes('data-testid="state-filter"') && !PEOPLE_PAGE.includes('{["all", ...PL_TABS].map((t) => ('),
    "one state switcher: the strip, echoed as a chip",
  );
  assert.ok(
    PEOPLE_PAGE.includes('data-testid="list-action"') && PEOPLE_PAGE.includes("window.CHANLY.nav(listStep.to)"),
  );
  assert.ok(
    PEOPLE_PAGE.includes('window.history.replaceState(null, "", next)') &&
      PEOPLE_PAGE.includes('`seg:${listId}` : savedId ? `list:${savedId}` : tab !== "all" ? `state:${tab}`'),
    "linkable",
  );
  assert.ok(
    PEOPLE_PAGE.includes(
      'const PL_VIEW_KEYS = { people: "chanlytics-people-view", leads: "chanlytics-leads-view" };',
    ) &&
      PEOPLE_PAGE.includes("plSaveView(scope, view);") &&
      PEOPLE_PAGE.includes("window.__saveView(page, view)"),
    "remembered: on this device, and on the member's row in the workspace, per scope",
  );
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(
    shell.includes("/^(seg|list|state):/.test(param)") &&
      shell.includes("initialSaved={savedId} initialState={stateId}"),
  );
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("action: peopleListAction(l.id, members)") && sd.includes("groups: PEOPLE_LIST_GROUPS.map("));
  assert.ok(
    sd.includes('(!l.needsCalendar || people.calendar?.state === "ok")'),
    "a calendar list is an audience only with a calendar",
  );
  const ports = readCode("apps/dashboard/src/server/campaign-ports.ts");
  assert.ok(
    // The pool (audience.ts) is everyone with their appointments; ask-turn.test.mjs counts past a thousand through it.
    ports.includes("people: async (now) => (await poolAt(now)).rows,") &&
      ports.includes("(pool ??= audiencePool(ctx, tenantId, await zone(), now))"),
    "the enrol path counts what the page counted, every page of it",
  );
});

test("asked means they reached out: the call they placed counts, a call the owner made does not", async () => {
  const { toPersonRowVM } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const cal = { timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null };
  const theyCalled = toPersonRowVM(
    {
      ...ROW,
      id: "t",
      last_call_at: "2026-09-05T12:00:00.000Z",
      last_inbound_call_at: "2026-09-05T12:00:00.000Z",
      visits: cal,
    },
    TZ,
    now,
  );
  assert.equal(theyCalled.askedMs, Date.parse("2026-09-05T12:00:00.000Z"));
  assert.equal(theyCalled.askedNotBooked, true);
  const weCalled = toPersonRowVM(
    { ...ROW, id: "w", last_call_at: "2026-09-05T12:00:00.000Z", last_inbound_call_at: null, visits: cal },
    TZ,
    now,
  );
  assert.equal(weCalled.askedMs, null, "an outbound call is not them asking");
  assert.equal(weCalled.askedNotBooked, false);
  assert.equal(weCalled.lastContact.label.startsWith("Phoned"), true, "but it is still the last contact");
  const mig = readCode("supabase/migrations/00055_people_list_inbound_call.sql");
  assert.ok(
    mig.includes("drop function if exists public.people_list(uuid, uuid);") &&
      mig.includes("max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,") &&
      mig.includes("last_inbound_call_at    timestamptz,"),
  );
  assert.ok(
    mig.includes("grant execute on function public.people_list(uuid, uuid) to authenticated, service_role;"),
    "a drop loses the grants; they are re-stated",
  );
  assert.ok(
    readCode("apps/dashboard/src/server/calendar.ts").includes(
      "const cands = [r.last_inbound_at, r.last_inbound_call_at ?? null]",
    ),
    "the report counts the same way",
  );
});

test("bulk actions: a selection becomes people on a list, a yes on record (one request each, fifty at most, one refresh), or a file; everyone shown can be kept as a list", () => {
  const bridge = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(
    bridge.includes(
      "export async function setPersonConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult>",
    ) && bridge.includes("const take = [...new Set(ids)].slice(0, 50);"),
  );
  assert.ok(bridge.includes("window.__setPersonConsentMany = setPersonConsentMany;"));
  // The many used to be one request per person, held back from refreshing, with
  // one refresh at the end. They are ONE request now, through the batch door,
  // which the refresh map treats like any other write (slice B of the data
  // program); consent-history.test.mjs runs that door.
  assert.ok(
    bridge.includes("return api()(CONSENT_ROUTE[purpose], { params: { id }, body });") &&
      bridge.includes("api()(MANY_ROUTE[purpose], { body: { ids: take, ...body } })") &&
      !bridge
        .slice(bridge.indexOf("async function recordMany"), bridge.indexOf("export type ReceptionistMany"))
        .includes("refresh: false"),
    "the single and the many both refresh through the map; the many are one request (a view save, which changes no surface, is the one write that holds the map back)",
  );
  for (const id of ["bulk-bar", "bulk-list-name", "bulk-export", "bulk-clear", "save-shown", "save-shown-name"])
    assert.ok(PEOPLE_PAGE.includes(`data-testid="${id}"`), id);
  for (const id of ["select-all", "row-select"]) assert.ok(PEOPLE_TABLE.includes(`data-testid="${id}"`), id);
  // WHICH yes, and how it was given. The bulk action was titled for offers and
  // wrote the conversational column, so a salon recording thirty signed marketing
  // consents changed the one field that does not authorise a promotion.
  assert.ok(
    bridge.includes(
      "export async function setPersonMarketingConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult>",
    ),
  );
  assert.ok(bridge.includes("window.__setPersonMarketingConsentMany = setPersonMarketingConsentMany;"));
  assert.ok(
    PEOPLE_PAGE.includes('{ header: "Yes to messages about their visit\u2026" }') &&
      PEOPLE_PAGE.includes('{ header: "Yes to offers and news\u2026" }'),
    "both asks are offered, and named",
  );
  assert.ok(PEOPLE_PAGE.includes('{ consent: "opted_in", source: source.id },'), "a yes says how it was given");
  assert.ok(
    PEOPLE_PAGE.includes('.filter((s) => s.id !== "customer_message")'),
    "their own message is not something a desk records for them",
  );
  // "A selection never outlives its view" is run, in both scopes: people-honest.test.mjs and leads-honest.test.mjs.
  assert.ok(
    PEOPLE_PAGE.includes(
      'const head = ["Name", "Phone", "Email", "State", "Last contact", "Consent", "Offers", "Next visit", "First contact"];',
    ),
    "the file holds the columns the page shows, nothing invented",
  );
  assert.ok(PEOPLE_PAGE.includes("selectable={canEditLists || canExport}"));
});

test("every visit, oldest first, for the timeline; the profile reads them as Visited and Booked, and the booking link is one step away", async () => {
  const { allVisitsIn, indexFeed } = await import("@chanlytics/contracts");
  const f = feed();
  const index = indexFeed(f.items, NO_OWN);
  const all = allVisitsIn(index, { id: "p", name: "Maria Lopez", phone: "+13055550134" });
  assert.deepEqual(
    all.map((v) => v.title),
    ["Maria Lopez - Balayage"],
  );
  const both = allVisitsIn(index, { id: "q", name: "Daniela Ruiz", phone: null });
  assert.deepEqual(
    both.map((v) => [v.title, v.via]),
    [["Daniela Ruiz · Colour", "name"]],
  );
  const now = new Date(NOW);
  const past = {
    id: "a",
    start: "2026-08-20T14:00:00.000Z",
    end: "2026-08-20T16:00:00.000Z",
    title: "Colour",
    all_day: false,
    via: "phone",
  };
  const ahead = {
    id: "b",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T21:00:00.000Z",
    title: "Balayage",
    all_day: false,
    via: "phone",
  };
  const vm = toPersonVM(
    {
      ...detail_(),
      booking_link: " https://booksy.com/melanys ",
      visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: ahead, last: past, all: [past, ahead] },
      added: { at: "2026-09-01T12:00:00.000Z", source: "calendar", title: "Colour" },
    },
    TZ,
    now,
  );
  const visits = vm.timeline.filter((i) => i.kind === "visit");
  assert.deepEqual(
    visits.map((i) => [i.text, i.who]),
    [
      ["Booked · Balayage", "Calendar"],
      ["Visited · Colour", "Calendar"],
    ],
    "newest first, ahead reads as booked",
  );
  assert.equal(visits[1].sub, "10:00 AM – 12:00 PM · from Google Calendar");
  assert.equal(vm.timeline.find((i) => i.id === "added").text, "Added from your calendar (Colour)");
  assert.equal(vm.bookingLink, "https://booksy.com/melanys");
  assert.equal(vm.replyWindow, null, "no chat, no window");
  const chat = toPersonVM(
    detail_({ has_chat: true, latest_wa_inbound_at: new Date(NOW - 2 * 3_600_000).toISOString() }),
    TZ,
    now,
  );
  assert.deepEqual(chat.replyWindow, { open: true, hoursLeft: 22 });
  const closed = toPersonVM(
    detail_({ has_chat: true, latest_wa_inbound_at: new Date(NOW - 30 * 3_600_000).toISOString() }),
    TZ,
    now,
  );
  assert.deepEqual(closed.replyWindow, { open: false, hoursLeft: 0 });
  const page = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  assert.ok(
    page.includes('data-testid="text-booking-link"') && page.includes('sessionStorage.setItem("chanlytics-compose"'),
    "the button carries the link into the thread",
  );
  // The words are the contract's now (people bookingLinkAction), not the page's:
  // inside the window a reply is carried in, outside it the thread offers the template.
  assert.deepEqual([chat.bookingLinkAction.label, chat.bookingLinkAction.ready], ["Text the booking link", true]);
  assert.deepEqual(
    [closed.bookingLinkAction.label, closed.bookingLinkAction.ready],
    ["Send the booking-link template", false],
  );
  assert.ok(page.includes(': e.kind === "visit" ? <Icon name="calendar" size={12} />'));
  const composer = readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(
    composer.includes('sessionStorage.getItem("chanlytics-compose")') &&
      composer.includes('sessionStorage.removeItem("chanlytics-compose")') &&
      composer.includes("setText((cur) => (cur && cur.trim() ? cur : carried.text));"),
    "only into an empty composer, only once",
  );
  const route = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(
    route.includes('sb.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle()') &&
      route.includes('booking_link: typeof bookingLink === "string"'),
  );
  assert.ok(
    /const all = allVisitsIn\(index, person\)\s*\.map\(\(x\) => toVisitDto\(x\) as VisitDto\)\s*\.slice\(-60\);/.test(
      readCode("apps/dashboard/src/server/calendar.ts"),
    ),
  );
});

test("the table: identity that says who, Offers where First contact was, Visits that never go blank, actions on hover, keyboard rows, a header that sticks, cards when narrow", async () => {
  const { toPersonRowVM } = await import("@chanlytics/contracts");
  const now = new Date(NOW);
  const cal = (v) => ({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null, ...v });
  const last = {
    id: "b0:1",
    start: "2026-08-20T14:00:00.000Z",
    end: "2026-08-20T16:00:00.000Z",
    title: "Colour",
    all_day: false,
    via: "phone",
  };
  const row = toPersonRowVM(
    { ...ROW, has_chat: true, latest_wa_inbound_at: new Date(NOW - 3_600_000).toISOString(), visits: cal({ last }) },
    TZ,
    now,
  );
  assert.equal(row.lastVisitDay, "Thu, Aug 20");
  assert.deepEqual(row.replyWindow, { open: true, hoursLeft: 23 });
  assert.equal(toPersonRowVM({ ...ROW, has_chat: false }, TZ, now).replyWindow, null);
  // First contact left the identity cell (22 Sep, Ruben: the row read jam-packed) for a column of its own that is off
  // until a member asks for it, so Offers still holds the place on screen it took from First contact.
  assert.ok(
    PEOPLE_PAGE.includes('{ key: "since", label: "First contact", sortable: false, on: false,'),
    "First contact is a column a member may choose, not on screen by default",
  );
  assert.ok(
    PEOPLE_PAGE.includes("cl-row-avatar-glyph") && PEOPLE_PAGE.includes('data-testid="row-name-them"'),
    "a number is not initials; it can be named",
  );
  assert.ok(
    PEOPLE_PAGE.includes('<span className="cl-row-last-visit">Last · {p.lastVisitDay}</span>'),
    "a visit behind them when nothing is ahead",
  );
  assert.ok(
    PEOPLE_PAGE.includes(
      'const PL_OFFERS = { opted_in: ["Yes", "yes"], opted_out: ["No", "no"], unknown: ["Not asked", "unasked"] };',
    ),
  );
  assert.ok(
    PEOPLE_PAGE.includes('data-testid="row-open-thread"') &&
      PEOPLE_PAGE.includes('data-testid="row-booking-link"') &&
      PEOPLE_PAGE.includes('sessionStorage.setItem("chanlytics-compose"'),
    "the row's own next steps",
  );
  assert.ok(PEOPLE_PAGE.includes("title={plWhen(p.lastContact.at)}"), "the exact time on hover");
  // A row no longer counts threads and calls ("no messages yet" was that count at zero): the profile has them.
  assert.ok(PEOPLE_TABLE.includes("`${total} ${total === 1 ? words.one : words.many}`"), "honest words");
  assert.ok(
    PEOPLE_PAGE.includes('(p.quote || "").toLowerCase().includes(needle)') &&
      PEOPLE_PAGE.includes('(p.nextVisit || "").toLowerCase().includes(needle)'),
    "search finds words on the row",
  );
  const css = readCode("apps/dashboard/src/legacy/styles/clients.css");
  assert.ok(
    css.includes("overflow: clip;") &&
      css.includes('grid-template-areas: "sel name state" "sel last visits" "sel offers offers";'),
    "a header that sticks; cards under 900px",
  );
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(
    svc.includes("booking_link: pv.bookingLink,") &&
      svc.includes("const bookingLink = cfg?.brain?.booking_link?.trim() || null;"),
    "the list envelope carries the link",
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes("bookingLink: data.booking_link ?? null,"),
  );
});

/* -------------------------------------------------------------------------- *
 * The business's own addresses: never a customer's.
 *
 * FOUND LIVE, 18 Sep 2026. The owner wrote to their salon's new email address
 * to test it -- the first thing anybody does with a new inbox -- and so became
 * a person in People. Their workspace reads their own Google Calendar, and #626
 * had taken the ORGANISER off every event, which covered them only where they
 * were the organiser. On every meeting somebody else had sent them they were a
 * GUEST, so each became one of their "visits": "Visited · New voicemail
 * notification received", "Last visit: Today". And the playbooks read visits
 * the same way, to decide who is thanked after a visit.
 * -------------------------------------------------------------------------- */

const OWNER_ADDR = "ruben@rjcapital.io";
const OWNER_URL = "https://calendar.google.com/calendar/ical/ruben%40rjcapital.io/private-0123456789abcdef/basic.ics";
/** Meetings on the owner's own calendar, organised by other people, with the owner invited. */
const MEETINGS_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:m1",
  "DTSTART:20260908T160000Z",
  "DTEND:20260908T170000Z",
  "SUMMARY:Amazon Review",
  "ORGANIZER;CN=Greg Man:mailto:greg@agency.example",
  "ATTENDEE;CN=Ruben Segura:mailto:ruben@rjcapital.io",
  "ATTENDEE;CN=Greg Man:mailto:greg@agency.example",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:m2",
  "DTSTART:20260909T140000Z",
  "DTEND:20260909T143000Z",
  "SUMMARY:Meeting with Ruben Segura",
  "ORGANIZER:mailto:calendly@notify.example",
  "ATTENDEE;CN=Ruben:mailto:RUBEN@rjcapital.io",
  "END:VEVENT",
  // A real appointment: a customer, with the owner copied on it.
  "BEGIN:VEVENT",
  "UID:m3",
  "DTSTART:20260910T180000Z",
  "DTEND:20260910T190000Z",
  "SUMMARY:Balayage",
  "ORGANIZER:mailto:bookings@salon-tool.example",
  "ATTENDEE;CN=Ana Gomez:mailto:ana.gomez@gmail.com",
  "ATTENDEE;CN=Ruben:mailto:ruben@rjcapital.io",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const meetings = () =>
  parseIcs(MEETINGS_ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });

test("a Google feed names its owner, and a calendar that is not a person names nobody", async () => {
  const { calendarOwnerOf } = await import("@chanlytics/contracts");
  assert.equal(calendarOwnerOf(OWNER_URL), OWNER_ADDR);
  assert.equal(
    calendarOwnerOf(OWNER_URL.replace("ruben%40rjcapital.io", "RUBEN%40RJCapital.io")),
    OWNER_ADDR,
    "in one spelling",
  );
  assert.equal(
    calendarOwnerOf("https://calendar.google.com/calendar/ical/abc123%40group.calendar.google.com/private-x/basic.ics"),
    null,
    "a shared calendar is not a person",
  );
  assert.equal(
    calendarOwnerOf(
      "https://calendar.google.com/calendar/ical/en.usa%23holiday%40import.calendar.google.com/public/basic.ics",
    ),
    null,
    "nor is an imported one",
  );
  assert.equal(
    calendarOwnerOf("https://outlook.office365.com/owa/calendar/abc/def/calendar.ics"),
    null,
    "another provider's address does not say whose it is",
  );
  assert.equal(
    calendarOwnerOf("https://calendar.google.com/calendar/ical/%E0%A4%A/private-x/basic.ics"),
    null,
    "an address that does not decode is nobody's",
  );
  for (const nothing of [null, undefined, ""]) assert.equal(calendarOwnerOf(nothing), null);
});

test("the business's own addresses: where it is alerted, and whose calendar it reads", async () => {
  const { ownAddressesOf } = await import("@chanlytics/contracts");
  assert.deepEqual(
    [
      ...ownAddressesOf({
        notifications: { escalation_emails: [" Owner@Salon.example ", "staff@salon.example"] },
        calendar: { ical_url: OWNER_URL },
      }),
    ].sort(),
    ["owner@salon.example", OWNER_ADDR, "staff@salon.example"],
  );
  assert.deepEqual(
    [...ownAddressesOf({ calendar: { ical_url: OWNER_URL } })],
    [OWNER_ADDR],
    "no alert addresses is still the calendar's owner",
  );
  assert.deepEqual([...ownAddressesOf(null)], [], "no config is nobody");
});

test("REGRESSION: the owner invited to meetings on their own calendar is not a customer who visited", async () => {
  const { indexFeed, allVisitsIn, visitsIn, ownAddressesOf } = await import("@chanlytics/contracts");
  const own = ownAddressesOf({ calendar: { ical_url: OWNER_URL } });
  const owner = { id: "p-ruben", name: "", phone: null, email: OWNER_ADDR };
  const ana = { id: "p-ana", name: "Ana Gomez", phone: null, email: "ana.gomez@gmail.com" };
  const f = meetings();

  // What it did before: every meeting the owner was a guest on was a visit.
  assert.equal(allVisitsIn(indexFeed(f.items, NO_OWN), owner).length, 3, "the defect, as it was");

  const index = indexFeed(f.items, own);
  assert.deepEqual(allVisitsIn(index, owner), [], "none of the meetings on their own calendar is a visit");
  assert.deepEqual(visitsIn(index, owner, NOW), { next: null, last: null });
  assert.equal(index.byEmail.get(OWNER_ADDR), undefined, "and the address is not indexed at all");
  // A customer on an event the owner is copied on is still that customer's.
  assert.deepEqual(
    allVisitsIn(index, ana).map((v) => [v.title, v.via]),
    [["Balayage", "email"]],
  );
});

test("a NAMED owner does not take a meeting by the words in its title either", async () => {
  const { indexFeed, allVisitsIn, ownAddressesOf } = await import("@chanlytics/contracts");
  const own = ownAddressesOf({ calendar: { ical_url: OWNER_URL } });
  // The day they give themselves a name on their own page, "Meeting with Ruben
  // Segura" would match it through the TEXT, which taking the address off the
  // event does not touch. A namesake who is not the business's shows the route
  // is live through an index that has already dropped the address...
  const index = indexFeed(meetings().items, own);
  const namesake = { id: "p-other", name: "Ruben Segura", phone: null, email: "somebody.else@example.com" };
  assert.ok(
    allVisitsIn(index, namesake).some((v) => v.via === "name"),
    "the name route still finds a person by the title's words",
  );
  // ...and the owner, named the same, takes nothing: it is the PERSON who is
  // the business's, not only the address they are held under.
  const named = { id: "p-ruben", name: "Ruben Segura", phone: null, email: OWNER_ADDR };
  assert.deepEqual(allVisitsIn(index, named), []);
});

test("the Calendar never labels an appointment as the owner's, and still finds the customer on it", async () => {
  const { ownAddressesOf } = await import("@chanlytics/contracts");
  const own = ownAddressesOf({ notifications: { escalation_emails: [OWNER_ADDR] } });
  const people = [
    { id: "p-ruben", name: "", phone: null, email: OWNER_ADDR },
    { id: "p-ana", name: "Ana Gomez", phone: null, email: "ana.gomez@gmail.com" },
  ];
  const [amazon, meeting, balayage] = ["m1", "m2", "m3"].map((uid) => meetings().items.find((i) => i.uid === uid));
  assert.equal(matchPerson(amazon, people, own), null, "a meeting the owner was invited to is nobody's appointment");
  assert.equal(matchPerson(meeting, people, own), null);
  assert.deepEqual(
    matchPerson(balayage, people, own),
    { id: "p-ana", name: "Ana Gomez", via: "email" },
    "the customer, even with the owner's address listed first on the event",
  );
  assert.deepEqual(
    extractContacts(balayage, own).emails,
    ["ana.gomez@gmail.com"],
    "the owner's address is not among the event's contacts shown on the board",
  );
  assert.ok(!extractContacts(balayage, own).names.includes("Ruben"), "nor their name among its guests");
});
