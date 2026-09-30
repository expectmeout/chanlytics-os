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
  personActs,
  stateOf,
  PEOPLE_LISTS,
  ROLE_PERMS,
} from "@chanlytics/contracts";
import { importSrc, readCode } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";
import {
  installLegacyReact,
  installRoleStore,
  fresh,
  again,
  all,
  byTestId,
  classes,
  find,
  press,
  textOf,
} from "../_legacy-react.mjs";

// The profile's route runs below over a database in memory; a module that ever builds a service client reads these,
// and nothing dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const personRoute = await importSrc("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
const reportsRoute = await importSrc("apps/dashboard/app/api/v1/reports/route.ts");
// The reports route counts against its bucket: this instance's memory, never a store dialled.
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
setRateStore(memoryStore());

/**
 * People's page, drawn rather than read: the real TSX (apps/dashboard/src/surfaces/people/) on the shared stub React
 * (_legacy-react.mjs), over the sample business's people (sample.ts) through the surface's own mapping (surface-map.ts).
 * The page was one legacy file (people.jsx, with people-table.jsx beside it) that these pins scanned; it is a folder of
 * TSX now, and what it shows is asked of what it draws. Installed on first use, so the tests that do not draw it keep the
 * bare node they had: the role store (who is acting), the toast and the shell's move (CHANLY.nav, recorded in `went`).
 */
/** The shell's moves (`CHANLY.nav`) both worlds below record: one window, so the last to install its `nav` is the one called. */
const moved = [];
let harness = null;
async function peopleHarness() {
  if (harness) return harness;
  installLegacyReact();
  installRoleStore(globalThis.window);
  const went = moved;
  Object.assign(globalThis.window, {
    mayAtLeast: (rung) => globalThis.window.ST_STORE.mayAtLeast(rung),
    canDo: (action) => !!ROLE_PERMS[globalThis.window.__ME.role]?.[action],
    gate: () => ({}),
    usePPToast: () => [null, () => {}],
    CHANLY: { nav: (route) => went.push(route) },
  });
  const src = (p) => importSrc(`apps/dashboard/src/surfaces/${p}`);
  const { setSurfaceValue } = await src("surface-values.ts");
  const { peopleSample } = await src("people/sample.ts");
  const { PeopleReal } = await src("people/page/people-real.tsx");
  const drawn = (props = {}, { role = "owner" } = {}) => {
    globalThis.window.__ME = { role };
    setSurfaceValue("people", peopleSample(new Date(NOW)));
    fresh();
    const draw = (over = {}) => again(() => PeopleReal({ onNavigate() {}, onOpenProfile() {}, ...props, ...over }));
    return { draw, tree: draw() };
  };
  const { PeopleRoute } = await src("people/people-route.tsx");
  // The frame's route for an address of People's: the page it draws for the params the address names.
  const routed = (pathname) => {
    globalThis.window.__ME = { role: "owner" };
    setSurfaceValue("people", peopleSample(new Date(NOW)));
    fresh();
    return again(() => globalThis.React.createElement(PeopleRoute, { pathname }));
  };
  /**
   * What `run` sends, recorded as { method, route, body } (the route as the client names it, `views/people`), each answered as
   * the server does: a batch done for every id it was sent, anything else `{}`. The wire is the tab's fetch, put back after.
   */
  const onTheWire = async (run) => {
    const sent = [];
    const fetched = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      sent.push({
        method: init.method || "GET",
        route: new URL(url, "https://app.chanlytics.com").pathname.replace(/^\/api\/v1\//, ""),
        body,
      });
      const data = Array.isArray(body?.ids) ? { done: body.ids.length, failed: [], skipped: [] } : {};
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      await run();
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      globalThis.fetch = fetched;
    }
    return sent;
  };
  harness = { went, drawn, routed, onTheWire, setSurfaceValue, sample: () => peopleSample(new Date(NOW)) };
  return harness;
}

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
  "LOCATION:Marisa's Beauty Salon\\, 123 Main St",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T170000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b2",
  "SUMMARY:Haircut",
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Ruiz, Ana: VIP";X-NUM-GUESTS=0:mailto:ana@example.com',
  "ATTENDEE;CN=Marisa Owner:mailto:owner@salon.com",
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

/** Harbor, its owner, and Maria Lopez in its People: her profile's route runs over them (profileOf). */
const HARBOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MARIA = "11111111-1111-4111-8111-111111111111";
const BRAIN = {
  business_name: "Harbor",
  system_prompt: "Answer as the front desk of Harbor: brief and warm.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
/**
 * Maria's profile as GET contacts/:id answers it, run over a database in memory holding her row, her workspace and
 * `tables` beside them, `faults` failing a read the way PostgREST fails: what it answered, every query it asked, and
 * what it logged, by event.
 */
async function profileOf(tables = {}, faults = {}) {
  const supabase = fakeDb(
    {
      memberships: [
        {
          user_id: "u1",
          tenant_id: HARBOR,
          role: "owner",
          tenants: { slug: "harbor" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      tenants: [{ id: HARBOR, name: "Harbor", timezone: TZ, sells_by: null }],
      contacts: [
        {
          id: MARIA,
          tenant_id: HARBOR,
          phone_e164: "+13055550134",
          display_name: "Maria Lopez",
          notes: null,
          proposal_url: null,
        },
      ],
      tenant_config: [{ tenant_id: HARBOR, config: { brain: BRAIN } }],
      ...tables,
    },
    faults,
    {
      people_list: (a) =>
        a.p_tenant_id === HARBOR && a.p_contact_id === MARIA
          ? [{ id: MARIA, display_name: "Maria Lopez", phone_e164: "+13055550134", consent: "opted_in", dnc: false }]
          : [],
    },
  );
  const lines = [];
  const was = console.error;
  console.error = (...args) => {
    const line = logLineOf(args);
    lines.push(line ? { event: line.event, rest: [fieldsOf(line)] } : { event: args[0], rest: args.slice(1) });
  };
  try {
    const { person } = await personRoute.GET.run(
      new Request(`http://localhost/api/v1/contacts/${MARIA}?workspace=${HARBOR}`),
      { supabase, userId: "u1", email: "owner@example.com", params: { id: MARIA } },
    );
    const logged = (event) => lines.filter((l) => l.event === event).map((l) => l.rest);
    return { person, seen: supabase.seen, logged };
  } finally {
    console.error = was;
  }
}
/** Whether `q` is a select on `table` filtered by every `[column, value]` named. */
const selectOn = (q, table, ...eqs) =>
  q.table === table &&
  q.op === "select" &&
  eqs.every(([col, val]) => q.filters.some(([op, c, v]) => op === "eq" && c === col && v === val));

test("the feed carries the description, the place and the guests — folded, unescaped, quoted parameters intact", () => {
  const f = feed();
  const maria = f.items.find((i) => i.uid === "b1");
  assert.equal(
    maria.description,
    "Booked via Booksy\nPhone: (305) 555-0134\nEmail: maria.lopez@gmail.com\nNotes: first time, wants ash tones",
  );
  assert.equal(maria.location, "Marisa's Beauty Salon, 123 Main St");
  assert.deepEqual(maria.attendees, []);
  const cut = f.items.find((i) => i.uid === "b2");
  assert.deepEqual(
    cut.attendees,
    [
      { name: "Ruiz, Ana: VIP", email: "ana@example.com" },
      { name: "Marisa Owner", email: "owner@salon.com" },
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
  assert.deepEqual(g.names, ["Ruiz, Ana: VIP", "Marisa Owner"]);
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
  "ORGANIZER;CN=Marisa Owner:mailto:Marisa@Example.com",
  "ATTENDEE;CN=Marisa Owner;PARTSTAT=ACCEPTED:mailto:marisa@example.com",
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
    !describeVisits(v, TZ, NOW, { hasBookingLink: true }).includes("Matched by name only"),
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
const OWNER = { id: "p-marisa", name: "Marisa Owner", phone: null, email: "marisa@example.com" };
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
    index.byEmail.get("marisa@example.com"),
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
      { title: "Lunch", description: null, location: null, attendees: [], organizer: "marisa@example.com" },
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
  const words = describeVisits(visitsOf(f.items, PEOPLE[0], NOW, NO_OWN), TZ, NOW, { hasBookingLink: true });
  assert.equal(
    words,
    "Their next appointment on the calendar: Tue, Sep 8 · 2:00 – 5:00 PM (Maria Lopez - Balayage). If they ask, confirm it; to change or cancel it, send the booking link — nothing is changed from here.",
  );
  const byName = describeVisits(
    visitsOf(f.items, { id: "x", name: "Maria Lopez", phone: null }, NOW, NO_OWN),
    TZ,
    NOW,
    { hasBookingLink: true },
  );
  assert.ok(byName.includes("Matched by name only — make sure it is them before confirming details."));
  const last = describeVisits(visitsOf(f.items, PEOPLE[2], NOW, NO_OWN), TZ, NOW, { hasBookingLink: true });
  assert.equal(last, "Their last visit on the calendar: Aug 20 (Daniela Ruiz · Colour).");
  assert.equal(
    describeVisits({ next: null, last: null }, TZ, NOW, { hasBookingLink: true }),
    null,
    "nothing to say is null, never a sentence",
  );
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
/** What People has loaded, for the surface's mapping (surfaces/people/surface-map.ts): `ROW` in Harbor's zone, a calendar that reads, no deals. */
const peopleLoaded = (over = {}) => ({
  tz: TZ,
  people: [ROW],
  page: null,
  saved: [],
  calendar: { state: "ok", source: "Google Calendar" },
  bookingLink: null,
  dealsOn: false,
  consultFirst: false,
  dealPace: null,
  followUp: null,
  views: {},
  viewsRead: true,
  ...over,
});
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

/**
 * The person's page as TSX (surfaces/people/person), drawn on the stub React the page tests share, for the cases below that
 * read what the profile draws or asks: the parts it is made of, each drawn over a person's view model, and its courier run
 * over a wire that records the write. Nothing else in this file draws, so the stub is installed when it is first asked for.
 */
let profileWorld = null;
async function profileUi() {
  if (profileWorld) return profileWorld;
  const LR = await import("../_legacy-react.mjs");
  LR.installLegacyReact({ __DEMO_MODE: false, __chrome: { state: stateOf } });
  const went = moved;
  Object.assign(globalThis, {
    __WORKSPACES: [{ id: HARBOR, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
    __ACTIVE_WORKSPACE: HARBOR,
    CHANLY: { nav: (to) => went.push(to) },
  });
  const P = "apps/dashboard/src/surfaces/people";
  const { hero, openWith } = await importSrc(`${P}/person/hero.tsx`);
  const { PersonNotes } = await importSrc(`${P}/person/notes.tsx`);
  const { PersonTimeline } = await importSrc(`${P}/person/timeline.tsx`);
  const { setPersonDetails } = await importSrc(`${P}/people-detail.ts`);
  const { Icon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");
  const quietly = async (fn) => {
    const was = console.error;
    console.error = () => {};
    try {
      return await fn();
    } finally {
      console.error = was;
    }
  };
  // What a write reads again after it lands (loaded by the client on a first write): loaded now, so a write's answer is
  // not waiting on a module's first load while the test waits on the write.
  await quietly(() => importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts"));
  /** What the page hands each of its parts: the person, and who is looking. */
  const ctx = (p, over = {}) => ({
    p,
    dealP: p,
    first: "Maria",
    who: "Maria",
    isOwner: true,
    canRecord: true,
    flash() {},
    load() {},
    error: null,
    onBack() {},
    del: { open: false, typed: "", busy: false, error: null },
    setDel() {},
    ...over,
  });
  /** The writes a courier's call made over a wire that takes every write, with what each carried. */
  const writes = async (call) => {
    const asked = [];
    const kept = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      asked.push([
        method,
        new URL(String(url), "https://app.chanlytics.com").pathname,
        init.body ? JSON.parse(init.body) : null,
      ]);
      const body =
        method === "GET" ? { ok: false, error: { code: "not_found", message: "not here" } } : { ok: true, data: {} };
      return new Response(JSON.stringify(body), {
        status: method === "GET" ? 404 : 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      await quietly(async () => {
        await call();
        for (let i = 0; i < 12; i += 1) await LR.settle();
      });
    } finally {
      globalThis.fetch = kept;
    }
    return asked.filter(([method]) => method !== "GET");
  };
  /** A tree drawn afresh, and the way to draw it again over the state it kept, as React does after a press. */
  const drawn = (thunk) => {
    LR.fresh();
    return { tree: LR.again(thunk), again: () => LR.again(thunk) };
  };
  profileWorld = { LR, went, ctx, writes, drawn, hero, openWith, PersonNotes, PersonTimeline, setPersonDetails, Icon };
  return profileWorld;
}

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
      { k: "Next visit", v: "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage" },
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

test("the wiring: the board and the profile read one match; both receptionists are told; the panel says who it is for and where it comes from", async () => {
  // The board (calendar-week.ts) and the profile (person-visits.ts), and the lookup that names the calendar for the
  // profile (calendar-settings.ts).
  const svc = ["calendar-settings", "calendar-week", "person-visits"]
    .map((m) => readCode(`apps/dashboard/src/server/calendar/${m}.ts`))
    .join("\n");
  assert.ok(
    svc.includes("export async function personVisits(") &&
      svc.includes("const v = visitsIn(index, person, now.getTime());"),
    "the profile's visits, from the same feed and match",
  );
  assert.ok(svc.includes("source: feedSourceLabel(url)"), "the calendar's name, never its address");
  assert.ok(!svc.includes("personInTitle"), "the old name-only match is gone");
  // Never fatal to the profile: a calendar that cannot even be looked up costs its visits, said in the log with who
  // they were for, and the profile stands. Run; their visits are read in the same round as the rest
  // (person-read-one-round.test.mjs).
  const lookupDown = await profileOf({}, { "tenants.select": { message: "down" } });
  assert.equal(lookupDown.person.row.id, MARIA, "the profile stands");
  assert.equal(lookupDown.person.visits, undefined, "without its visits");
  assert.deepEqual(
    lookupDown.logged("person_visits_failed").map(([fields]) => fields),
    [{ contact: MARIA, error: "down" }],
  );
  const edge = readCode("apps/edge/lib/calendar/availability.ts");
  assert.ok(
    /export async function visitsFor\(\s*rt: TenantRuntime,\s*who: \{ phone: string \| null; name: string \| null \}/.test(
      edge,
    ) &&
      /return describeVisits\(\s*visitsOf\(feed\.items, \{ id: "caller", name: who\.name \?\? "", phone: who\.phone, email: null \}, now\.getTime\(\), own\),\s*rt\.timezone,\s*now\.getTime\(\),[^;]*\);/.test(
        edge,
      ),
  );
  const wa = readCode("packages/core/src/inbound/model-turn.ts");
  assert.ok(
    wa.includes("const visits = rt ? await ports.calendar.visits(rt, { phone: e164, name: lead.name }) : null;") &&
      wa.includes("if (visits) leadNote = `${leadNote}\\n${visits}`;"),
    "WhatsApp: with who they are",
  );
  // Phone: the visits in the caller context, and a call for a switched-off
  // channel telling the platform as a text does: run in call-start.test.mjs.
  const page = readCode("apps/dashboard/src/surfaces/calendar/panel.tsx");
  for (const id of ["cal-panel-person", "cal-panel-contact", "cal-panel-where", "cal-panel-desc"])
    assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(
    page.includes("From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there."),
    "one line, no feed counts",
  );
  assert.ok(!page.includes("read just now") && !page.includes("feedLine"), "the chip's sentence stays on the chip");
  assert.ok(page.includes("matched by {person.via}") && page.includes("Not in People yet"));
  const dto = readCode("packages/contracts/src/calendar/calendar.ts");
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

test("an appointment with one number and one address carries the address to the person; two addresses, or none, carry nothing", async () => {
  const { peopleFromItems } = await import("@chanlytics/contracts");
  const at = Date.parse("2026-09-25T15:00:00Z");
  // Ten digits: a seven-digit number is not one to phoneFrom. The rule under test is the address, not the number.
  const one = {
    uid: "u1",
    title: "Gel manicure — Ana (646) 555-0101 ana@example.com",
    description: "",
    location: "",
    attendees: [],
    organizer: null,
    start: at,
    end: at + 3_600_000,
    allDay: false,
  };
  const two = { ...one, uid: "u2", description: "cc bob@example.com" };
  const none = { ...one, uid: "u3", title: "Gel manicure — Ana (646) 555-0101" };
  const [a] = peopleFromItems([one], ["Gel manicure"], at - 86_400_000);
  assert.equal(a.email, "ana@example.com");
  const [b] = peopleFromItems([two], ["Gel manicure"], at - 86_400_000);
  assert.equal(b.email, null, "two addresses: whose is it?");
  const [c] = peopleFromItems([none], ["Gel manicure"], at - 86_400_000);
  assert.equal(c.email, null, "no address on the event");
  // Two appointments name the same number: the one that keys the row has no address, the other does, so it fills in.
  const later = { ...none, uid: "u4", start: at + 7 * 86_400_000, end: at + 7 * 86_400_000 + 3_600_000 };
  const [d] = peopleFromItems([later, one], ["Gel manicure"], at + 86_400_000);
  assert.deepEqual(
    [d.uid, d.email],
    ["u4", "ana@example.com"],
    "the upcoming one keys the row; the address rides along",
  );
  // Two numbers and one address on ONE event: whose is it? Neither's.
  const pair = { ...one, uid: "u5", description: "+1 (646) 555-0199" };
  assert.deepEqual(
    peopleFromItems([pair], ["Gel manicure"], at - 86_400_000).map((r) => r.email),
    [null, null],
    "two numbers on one event: the address is neither's",
  );
  // The same rule across the feed: an address beside one number on one appointment and beside another on the
  // next is a co-host's or the booking page's, not the first customer's with a refusal for everyone after.
  const otherNumber = {
    ...one,
    uid: "u6",
    title: "Gel manicure — Bea (646) 555-0199 ana@example.com",
    start: at + 86_400_000,
    end: at + 86_400_000 + 3_600_000,
  };
  assert.deepEqual(
    peopleFromItems([one, otherNumber], ["Gel manicure"], at - 86_400_000).map((r) => [r.phone, r.email]),
    [
      ["+16465550101", null],
      ["+16465550199", null],
    ],
    "an address that rode with two numbers across the feed is nobody's",
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

  const svc = readCode("apps/dashboard/src/server/calendar/people-seen.ts");
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
    /log\.error\(\s*"calendar_people_refused"/.test(svc) &&
      /refused,\s*of: rows\.length,\s*added: added\.length/.test(svc),
    "and it says once how many people the refusals cost, not once per row",
  );
});

test("automatically: an hourly sweep on the edge and the owner's own read both put the feed's people in People through one extraction; the profile says where they came from; no button", async () => {
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
    lib.includes(".insert({ tenant_id: tenantId, phone_e164: r.phone, display_name: r.name, email })") &&
      lib.includes('if (iErr.code !== "23505") throw') &&
      /emitEvent\(\s*db,\s*tenantId,\s*"contact\.added",\s*"contact",\s*created\.id,/.test(lib),
    "get-or-create with the service role, an event for each person created",
  );
  assert.ok(lib.includes('.is("display_name", null)'), "a name fills only an empty one");
  // An owner's read (calendar-week.ts calendarWeek) and the door it adds through (people-seen.ts addPeopleSeen).
  const svc = ["calendar-week", "people-seen"]
    .map((m) => readCode(`apps/dashboard/src/server/calendar/${m}.ts`))
    .join("\n");
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
      "const canAct = !!ROLE_PERMS[member.role]?.approve;",
    ),
    "a viewer's read changes nothing",
  );
  const route = readCode("apps/dashboard/app/api/v1/contacts/route.ts");
  assert.ok(
    route.includes('role: "operator",') && route.includes('ctx.supabase.rpc("create_person"'),
    "the door's own route stays, for a hand",
  );
  // The profile reads where they came from: the door's contact.added row for them. Somebody else's, and another kind
  // of row about them, each older, are not it. Run.
  const cameFrom = await profileOf({
    events: [
      {
        tenant_id: HARBOR,
        kind: "contact.added",
        subject_type: "contact",
        subject_id: MARIA,
        data: { source: "calendar", title: "Balayage" },
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        tenant_id: HARBOR,
        kind: "contact.added",
        subject_type: "contact",
        subject_id: "22222222-2222-4222-8222-222222222222",
        data: { source: "manual" },
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        tenant_id: HARBOR,
        kind: "contact.named",
        subject_type: "contact",
        subject_id: MARIA,
        data: {},
        created_at: "2026-07-01T00:00:00Z",
      },
    ],
  });
  assert.deepEqual(
    cameFrom.person.added,
    { at: "2026-09-01T00:00:00Z", source: "calendar", title: "Balayage" },
    "the profile reads where they came from",
  );
  assert.ok(
    cameFrom.seen.some((q) => selectOn(q, "events", ["kind", "contact.added"], ["subject_id", MARIA])),
    "from the events, the contact.added row of this person",
  );
  const page = readCode("apps/dashboard/src/surfaces/calendar/panel.tsx");
  assert.ok(
    !page.includes("cal-panel-add") && !page.includes("__addPerson"),
    "no button on the CALENDAR: added on its own, deleted from the profile if unwanted",
  );
  assert.ok(page.includes('"Not in People yet — added within the hour"'));
  // The hand's door has its screen on People now (slice D of the data program):
  // the same route, a number and a name, opening the person it made or found.
  assert.ok(
    readCode("apps/dashboard/src/surfaces/people/people-detail.ts").includes(
      'return api()("POST contacts", { body });',
    ),
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
  // Reports' rule (calendar-people.ts visitAnswersAsk, decision 0009): a visit before they asked does not answer it.
  const visited = toPersonRowVM({ ...asked, id: "v", visits: cal({ last }) }, TZ, now);
  assert.equal(visited.askedNotBooked, true, "a visit before they asked does not answer it");
  assert.equal(visited.lastVisit, "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour");
  const answered = toPersonRowVM(
    {
      ...asked,
      id: "w",
      visits: cal({ last: { ...last, start: "2026-09-05T14:00:00.000Z", end: "2026-09-05T16:00:00.000Z" } }),
    },
    TZ,
    now,
  );
  assert.equal(answered.askedNotBooked, false, "a visit since they asked answers it");
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
  assert.ok(askedList.test(gap) && askedList.test(visited) && !askedList.test(booked) && !askedList.test(answered));
  assert.deepEqual(
    [...PEOPLE_LISTS].map((l) => l.id).slice(0, 8),
    ["needs_you", "waiting_on_you", "steps_due", "new_week", "booked_week", "booked", "asked_never_booked", "lapsed"],
    "attention, then the journey",
  );
  const agg = peopleAggregates([booked, gap, visited, answered, stale, noCal], NOW);
  assert.equal(agg.booked, 1);
  assert.equal(agg.askedNotBooked, 2);
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

test("the wiring: the list and the assistant carry appointments from one parsed feed; the report carries the line; Leads and the Deal board retire into People", async () => {
  // One parse (parsed-feed.ts); everyone's visits and the report's line (people-visits.ts).
  const svc = ["parsed-feed", "people-visits"]
    .map((m) => readCode(`apps/dashboard/src/server/calendar/${m}.ts`))
    .join("\n");
  assert.ok(
    svc.includes("const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();") &&
      svc.includes("export async function peopleVisits(") &&
      svc.includes(
        "peopleVisitsOf(feed.parsed.items, rows, { timezone, source, own, services, rules }, now.getTime())",
      ),
    "one parse, indexed once, for everyone",
  );
  assert.ok(svc.includes("export async function bookingReport(") && svc.includes("bookedAfterAsk("));
  // The list carries visits and the calendar's state, a page at a time: GET contacts runs through its reader in
  // readers.test.mjs, its two stages read from the query log and its payload compared key for key.
  // The report carries the line, and is never fatal for it: GET reports, run. The series, the booking line and the
  // deals, in that order; People read once, for the line and the deals alike, and the deals read after the line's
  // calendar lookup; a lookup that fails costs the line, said in the log, never the report.
  const reportOf = async (faults = {}) => {
    const supabase = fakeDb(
      {
        memberships: [
          { user_id: "u1", tenant_id: HARBOR, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
        ],
        tenants: [{ id: HARBOR, name: "Harbor", timezone: TZ, sells_by: "proposal" }],
        tenant_config: [{ tenant_id: HARBOR, config: { brain: BRAIN } }],
        policies: [],
        deals: [],
      },
      faults,
      { report_series: (a) => ({ days: a.p_days }), people_list: () => [] },
    );
    const lines = [];
    const was = console.error;
    console.error = (...args) => lines.push({ event: logLineOf(args)?.event ?? args[0], rest: args.slice(1) });
    try {
      const out = await reportsRoute.GET.run(new Request(`http://localhost/api/v1/reports?workspace=${HARBOR}`), {
        supabase,
        userId: "u1",
        email: "owner@example.com",
        params: {},
      });
      return { out, asked: supabase.seen.map((q) => q.rpc ?? q.table), logged: lines.map((l) => l.event) };
    } finally {
      console.error = was;
    }
  };
  const whole = await reportOf();
  assert.deepEqual(Object.keys(whole.out), ["report", "booking", "deals"]);
  assert.deepEqual(whole.out.booking, { calendar: "none", days: 30, asked: 0, booked: 0 });
  assert.equal(whole.asked.filter((x) => x === "people_list").length, 1, "People read once for the whole report");
  assert.ok(
    whole.asked.lastIndexOf("tenant_config") < whole.asked.indexOf("deals"),
    `the deals read after the booking line's: ${whole.asked.join(", ")}`,
  );
  const lineDown = await reportOf({ "tenant_config.select": { message: "down" } });
  assert.deepEqual(
    [lineDown.out.report, lineDown.out.booking, lineDown.logged.includes("booking_report_failed")],
    [{ days: 30 }, null, true],
    "never fatal to the report",
  );
  // The assistant answers who booked and who never did: people.search runs over a feed in ask-turn.test.mjs, its
  // Booked and Asked, never booked lists judged over the People page's own rows.
  // People's lists are the mapping's (surface-map.ts), run: a calendar list is there only where a calendar reads, a deal
  // list only where deals are on. The Reports surface carries the booking line as the report answered it.
  const { peopleSurfaceOf } = await importSrc("apps/dashboard/src/surfaces/people/surface-map.ts");
  const listsOf = (over) => peopleSurfaceOf(peopleLoaded(over), null, new Date(NOW)).lists.map((l) => l.id);
  const only = (need) =>
    PEOPLE_LISTS.filter(
      (l) => !!l[need] && ["needsCalendar", "needsConsultFirst", "needsDeals"].every((n) => n === need || !l[n]),
    ).map((l) => l.id);
  const [calendarLists, dealLists] = [only("needsCalendar"), only("needsDeals")];
  assert.ok(calendarLists.length > 0 && dealLists.length > 0, "the lists this pins exist");
  const withCalendar = listsOf({});
  assert.ok(
    calendarLists.every((id) => withCalendar.includes(id)),
    "with a calendar read, its lists",
  );
  for (const state of ["none", "unavailable"])
    assert.ok(
      calendarLists.every((id) => !listsOf({ calendar: { state, source: "your calendar" } }).includes(id)),
      `with the calendar ${state}, none of them`,
    );
  assert.ok(
    dealLists.every((id) => !withCalendar.includes(id)),
    "deals off: no deal list",
  );
  assert.ok(
    dealLists.every((id) => listsOf({ dealsOn: true }).includes(id)),
    "deals on: every deal list",
  );
  assert.ok(
    readCode("apps/dashboard/src/surfaces/reports/surface.ts").includes("booking: toBookingReportVM(data.booking),"),
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
    shell.includes("if (retiredTo) window.CHANLY.address.go(retiredTo, { replace: true });"),
    "a real workspace lands on People",
  );
  // Booked was a stat card above the table as well as a list on the rail; the rail keeps it.
  const { drawn } = await peopleHarness();
  const page = drawn().tree;
  assert.ok(
    byTestId(page, "row-next-visit") &&
      /nothing on your calendar since answers it/.test(PEOPLE_LISTS.find((l) => l.id === "asked_never_booked").tip),
    "the column and the tips",
  );
  assert.ok(
    !all(page, (n) => typeof n.type === "function" && n.type.name === "StatCell").length &&
      !/Booked/.test(textOf(byTestId(page, "people-standing"))),
    "REGRESSION: the rail said it and a card said it again",
  );
  assert.ok(readCode("apps/dashboard/src/surfaces/reports/sections.tsx").includes('testid="chart-booking"'));
});

test("a name the owner gives and notes the receptionist reads: two doors, one route, the profile's rename and Notes, the VM's givenName", async () => {
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
  // The profile reads the owner's notes and their proposal link off the person's own row: the two columns people_list
  // does not carry. None written is none. Run.
  const noted = await profileOf({
    contacts: [
      {
        id: MARIA,
        tenant_id: HARBOR,
        phone_e164: "+13055550134",
        display_name: "Maria Lopez",
        notes: "Sees Sofia",
        proposal_url: "https://docs.example.com/p/maria",
      },
    ],
  });
  assert.deepEqual([noted.person.notes, noted.person.proposal_url], ["Sees Sofia", "https://docs.example.com/p/maria"]);
  const [own] = noted.seen.filter((q) => selectOn(q, "contacts", ["id", MARIA]));
  assert.ok(
    ["notes", "proposal_url"].every((c) => own.columns.split(", ").includes(c)),
    `the person's own row, for its two columns: ${own.columns}`,
  );
  assert.deepEqual(
    [(await profileOf()).person.notes, (await profileOf({ contacts: [] })).person.notes],
    [null, null],
    "none written: none",
  );
  // The profile's courier asks the details door this route answers. Run, on the page's own TSX (surfaces/people/person).
  const ui = await profileUi();
  const { byTestId, press } = ui.LR;
  assert.deepEqual(await ui.writes(() => ui.setPersonDetails(MARIA, { name: "Maria Lopez" })), [
    ["PUT", `/api/v1/contacts/${MARIA}/details`, { name: "Maria Lopez" }],
  ]);
  // The hero name is the editable one: whoever may record is offered the pencil, then the box and its Save; anyone else
  // is shown the name and nothing to change it with.
  const maria = toPersonVM(detail_(), TZ, new Date(NOW));
  const hero = (canRecord) => () => ui.hero(ui.ctx(maria, { canRecord }), () => {}, false);
  const named = ui.drawn(hero(true));
  assert.ok(byTestId(named.tree, "person-rename"), "person-rename");
  press(byTestId(named.tree, "person-rename"));
  const renaming = named.again();
  for (const id of ["person-name-input", "person-name-save"]) assert.ok(byTestId(renaming, id), id);
  assert.equal(byTestId(ui.drawn(hero(false)).tree, "person-rename"), null, "a viewer's is a name and no pencil");
  // The notes are a composer: the box, and Save once something is typed.
  const notes = ui.drawn(() =>
    globalThis.React.createElement(ui.PersonNotes, {
      p: maria,
      canEdit: true,
      isOwner: true,
      flash() {},
      onChanged() {},
    }),
  );
  for (const id of ["person-notes", "person-notes-input"]) assert.ok(byTestId(notes.tree, id), id);
  assert.equal(byTestId(notes.tree, "person-notes-save"), null, "nothing to save until something is typed");
  byTestId(notes.tree, "person-notes-input").props.onChange({ target: { value: "Sees Sofia" } });
  assert.ok(byTestId(notes.again(), "person-notes-save"), "person-notes-save");
  // The notes are a list now (0007): each dated and signed, the field they moved from no longer drawn.
  const note = {
    id: "n1",
    body: "Sees Sofia",
    author_kind: "member",
    author_name: "Maria",
    mine: false,
    for_user_id: null,
    for_name: null,
    for_me: false,
    team_only: false,
    state: "kept",
    source: "page",
    version: 1,
    created_at: new Date(NOW - 3_600_000).toISOString(),
    updated_at: new Date(NOW - 3_600_000).toISOString(),
  };
  const vm = toPersonVM({ ...detail_(), notes: "  Old field  ", person_notes: [note] }, TZ, new Date(NOW));
  assert.deepEqual(
    vm.noteList.map((n) => [n.body, n.who]),
    [["Sees Sofia", "Maria"]],
  );
  assert.equal(vm.givenName, "Maria Lopez");
  const numbered = toPersonVM(detail_({ display_name: null }), TZ, new Date(NOW));
  assert.equal(numbered.givenName, null, "a number is not a given name");
  assert.deepEqual(numbered.noteList, [], "no notes, no list");
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
  // This week is Monday to Sunday by the workspace's clock (decision 0009): NOW is a Sunday, so the week is today, and
  // a visit on Wednesday is next week's.
  const later_today = {
    ...soon,
    start: new Date(NOW + 3 * 3_600_000).toISOString(),
    end: new Date(NOW + 4 * 3_600_000).toISOString(),
  };
  const today = toPersonRowVM({ ...ROW, id: "t", visits: cal({ next: later_today }) }, TZ, now);
  assert.ok(L("booked_week").test(today), "a visit later today is this week's");
  assert.ok(!L("booked_week").test(week) && !L("booked_week").test(later), "Monday to Sunday, not the next seven days");
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
    // The journey continues past the booking (0004): the four deal lists, each drawn only where deals are a thing.
    [
      "new_week",
      "booked_week",
      "booked",
      "asked_never_booked",
      "lapsed",
      "consultation_booked",
      "proposal_out",
      "clients",
      "deal_passed",
      "deal_ended",
    ],
  );
  assert.deepEqual(
    PEOPLE_LISTS.filter((l) => l.group === "attention").map((l) => l.id),
    // And a step whose day has come (0007, amended): every workspace's.
    ["needs_you", "waiting_on_you", "steps_due"],
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

test("the list page: the rail is grouped, a state is a chip, a list has its step, the view is linkable and remembered", async () => {
  const { PEOPLE_LIST_GROUPS, peopleListAction } = await import("@chanlytics/contracts");
  const { went, drawn, routed, sample, onTheWire } = await peopleHarness();
  const page = drawn().tree;
  assert.ok(byTestId(page, "row-next-visit"), "the column carries the outcome");
  assert.equal(byTestId(page, "row-booked"), null, "the chip is gone");
  // The groups themselves are the rail kit's (RailGroup), drawn and counted in people-honest; here, that the rail says them.
  assert.deepEqual(
    all(page, (n) => classes(n).includes("cl-rail-group-label")).map(textOf),
    PEOPLE_LIST_GROUPS.map((g) => g.label),
    "the rail is grouped",
  );
  // One state switcher: the strip, echoed as a chip once a state is picked, and the chip's x shows everyone.
  assert.equal(byTestId(page, "state-filter"), null, "no chip until a state is picked");
  const quiet = drawn({ initialState: "quiet" });
  const chip = byTestId(quiet.tree, "state-filter");
  assert.match(textOf(chip), /Quiet/);
  press(find(chip, (n) => classes(n).includes("chip-x")));
  assert.equal(byTestId(quiet.draw(), "state-filter"), null, "one state switcher: the strip, echoed as a chip");
  // A list has its step: the button goes where the list's own action says, through the shell's move.
  const needsYou = drawn({ initialSegment: "needs_you" });
  const step = byTestId(needsYou.tree, "list-action");
  const listed = sample().lists.find((l) => l.id === "needs_you");
  assert.ok(listed.action, "the list carries its step");
  went.length = 0;
  press(find(step, (n) => n.type === "button"));
  assert.deepEqual(went, [listed.action.to]);
  // Linkable: the view is said in the address, replaced and never pushed (Back leaves People).
  const replaced = [];
  globalThis.location.pathname = "/w/studio/people";
  globalThis.location.hash = "";
  globalThis.history = {
    replaceState: (_s, _t, url) => replaced.push(url),
    pushState: (_s, _t, url) => replaced.push(`push ${url}`),
  };
  drawn({ initialSegment: "needs_you" });
  drawn({ initialSaved: "sample-regulars" });
  drawn({ initialState: "quiet" });
  assert.deepEqual(
    replaced,
    ["/w/studio/people/seg:needs_you", "/w/studio/people/list:sample-regulars", "/w/studio/people/state:quiet"],
    "linkable",
  );
  // Remembered: on this device, per scope, and on the member's row in the workspace (a save of the whole view).
  const { plSaveView, plLoadView } = await importSrc("apps/dashboard/src/surfaces/people/hooks/view-store.ts");
  plSaveView("leads", { sortBy: "stage" });
  assert.deepEqual(
    [plLoadView("leads"), globalThis.localStorage.getItem("chanlytics-leads-view")],
    [{ sortBy: "stage" }, '{"sortBy":"stage"}'],
  );
  assert.doesNotMatch(
    globalThis.localStorage.getItem("chanlytics-people-view") ?? "",
    /stage/,
    "People's view is its own",
  );
  const sent = await onTheWire(async () => {
    const kept = drawn();
    press(find(kept.tree, (n) => classes(n).includes("cl-th-sort") && textOf(n).includes("Offers")));
    kept.draw();
  });
  assert.equal(
    JSON.parse(globalThis.localStorage.getItem("chanlytics-people-view")).sortBy,
    "offers",
    "on this device",
  );
  const put = sent.find((r) => r.method === "PUT" && r.route === "views/people");
  assert.deepEqual(
    [put?.body.view.sortBy, put?.body.view.sortDir, Object.keys(put?.body.view)],
    ["offers", "desc", ["sortBy", "sortDir", "columns"]],
    "and on the member's row in the workspace, the whole view",
  );
  // The frame's route (people-route.tsx): the addresses that take a view of People, and what each hands the page.
  const { peopleTakes } = await importSrc("apps/dashboard/src/surfaces/people/chrome.ts");
  for (const param of ["seg:needs_you", "list:sample-regulars", "state:quiet"])
    assert.equal(peopleTakes(param), true, param);
  assert.equal(peopleTakes("c-1"), true, "a person is the page's too, but not a view of People: it draws their page");
  assert.equal(peopleTakes("leads:s-1"), false, "Leads stays with the frame");
  assert.match(textOf(byTestId(routed("/w/studio/people/list:sample-regulars"), "saved-filter")), /Regulars/);
  assert.ok(byTestId(routed("/w/studio/people/seg:needs_you"), "smart-filter"));
  assert.ok(byTestId(routed("/w/studio/people/state:quiet"), "state-filter"));
  // The list carries its step and the rail its groups: the surface's mapping (surface-map.ts), run over the sample's people.
  const surface = sample();
  for (const l of surface.lists)
    assert.deepEqual(
      l.action,
      peopleListAction(
        l.id,
        surface.rows.filter((r) => l.ids.includes(r.id)),
      ),
      `${l.id}: its own step`,
    );
  assert.deepEqual(
    surface.groups,
    PEOPLE_LIST_GROUPS.map((g) => ({ id: g.id, label: g.label })),
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/surfaces/broadcasts.ts").includes(
      '(!l.needsCalendar || people.calendar?.state === "ok")',
    ),
    "a calendar list is an audience only with a calendar",
  );
  const ports = readCode("apps/dashboard/src/server/ports/campaign-ports.ts");
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
    readCode("apps/dashboard/src/server/calendar/people-visits.ts").includes(
      "const cands = [r.last_inbound_at, r.last_inbound_call_at ?? null]",
    ),
    "the report counts the same way",
  );
});

test("bulk actions: a selection becomes people on a list, a yes on record (one request each, fifty at most, one refresh), or a file; everyone shown can be kept as a list", async () => {
  const { setPersonConsentMany, setPersonMarketingConsentMany } = await importSrc(
    "apps/dashboard/src/surfaces/people/people-detail.ts",
  );
  const { plCsv } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  const { CONSENT_SOURCES } = await import("@chanlytics/contracts");
  const { drawn, onTheWire } = await peopleHarness();
  // The many used to be one request per person, held back from refreshing, with one refresh at the end. They are ONE
  // request now, through the batch door, fifty at most (a longer selection sends its first fifty, once each), the route
  // chosen by which yes it is; consent-history.test.mjs runs that door. Run over the wire, not read.
  const sixty = Array.from({ length: 60 }, (_, i) => `p${i}`);
  const said = { consent: "opted_in", source: "in_person" };
  const sent = await onTheWire(async () => {
    assert.deepEqual(await setPersonConsentMany([...sixty, "p0"], said), {
      ok: true,
      done: 50,
      failed: 0,
      message: undefined,
    });
    await setPersonMarketingConsentMany(sixty, said);
  });
  assert.deepEqual(
    sent.filter((r) => r.method === "PUT").map((r) => [r.route, r.body.ids.length, r.body.consent, r.body.source]),
    [
      ["contacts/consent", 50, "opted_in", "in_person"],
      ["contacts/marketing-consent", 50, "opted_in", "in_person"],
    ],
    "one request each, fifty at most, and the yes to offers is written to its own door",
  );
  // The single and the many both refresh through the map: none of them holds it back (a view save, which changes no
  // surface, is the one write that does).
  const bridge = readCode("apps/dashboard/src/surfaces/people/people-detail.ts");
  assert.ok(
    bridge.includes("return api()(CONSENT_ROUTE[purpose], { params: { id }, body });") &&
      !bridge
        .slice(bridge.indexOf("async function recordMany"), bridge.indexOf("export type ReceptionistMany"))
        .includes("refresh: false"),
    "the single and the many both refresh through the map",
  );
  // The page selects: a box for each row and one for all of them, for whoever may act on a selection (a member who may
  // edit lists, or export) -- and for nobody else.
  const owner = drawn();
  assert.ok(byTestId(owner.tree, "select-all") && byTestId(owner.tree, "row-select"), "the table selects");
  assert.ok(byTestId(drawn({}, { role: "operator" }).tree, "select-all"), "an operator edits lists: selectable");
  assert.equal(
    byTestId(drawn({}, { role: "viewer" }).tree, "select-all"),
    null,
    "a viewer edits nothing and exports nothing",
  );
  const picking = drawn();
  byTestId(picking.tree, "row-select").props.onChange();
  const bar = byTestId(picking.draw(), "bulk-bar");
  for (const id of ["bulk-export", "bulk-clear"]) assert.ok(byTestId(bar, id), id);
  // Add to a list, or make one: the box that takes the new list's name.
  const menuOf = (label) => find(bar, (n) => n.props?.label === label && Array.isArray(n.props.items));
  menuOf("Add to list")
    .props.items.find((i) => i.label === "New list…")
    .onClick();
  assert.ok(byTestId(picking.draw(), "bulk-list-name"), "a new list is named where it is made");
  // WHICH yes, and how it was given. The bulk action was titled for offers and wrote the conversational column, so a
  // salon recording thirty signed marketing consents changed the one field that does not authorise a promotion.
  const yes = menuOf("Record a yes").props.items;
  assert.deepEqual(
    yes.filter((i) => i.header).map((i) => i.header),
    ["Yes to messages about their visit…", "Yes to offers and news…"],
    "both asks are offered, and named",
  );
  const own = CONSENT_SOURCES.find((s) => s.id === "customer_message").label;
  assert.ok(!yes.some((i) => i.label === own), "their own message is not something a desk records for them");
  const byDesk = yes.find((i) => i.label === CONSENT_SOURCES.find((s) => s.id === "in_person").label);
  const recorded = await onTheWire(async () => {
    await byDesk.onClick();
  });
  assert.deepEqual(
    recorded.filter((r) => r.method === "PUT").map((r) => [r.route, r.body.consent, r.body.source, r.body.ids.length]),
    [["contacts/consent", "opted_in", "in_person", 1]],
    "a yes says how it was given",
  );
  // A selection never outlives its view is run, in both scopes: people-honest.test.mjs and leads-honest.test.mjs.
  // The file holds the columns the page shows, nothing invented.
  assert.equal(
    plCsv([]),
    "Name,Phone,Email,State,Last contact,Consent,Offers,Next visit,First contact",
    "the file holds the columns the page shows, nothing invented",
  );
  // Everyone shown can be kept as a list: a view that filters offers Save these, and its box takes the name.
  const filtered = drawn({ initialSegment: "needs_you" });
  press(byTestId(filtered.tree, "save-shown"));
  assert.ok(byTestId(filtered.draw(), "save-shown-name"), "everyone shown can be kept as a list");
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
      booking_link: " https://book.example.com/marisas ",
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
  // What has not ended is Coming up too, above History: marked on the timeline, and said in the leaf's words.
  assert.deepEqual(
    visits.map((i) => !!i.ahead),
    [true, false],
    "the booked visit is ahead; the visit that happened is not",
  );
  assert.equal(vm.comingUp.length, 1);
  const up = vm.comingUp[0];
  assert.equal(up.title, "Balayage");
  assert.equal(up.id, visits[0].id, "the same visit the timeline holds");
  assert.equal(up.to, visits[0].link.to, "a door to its day, as its timeline row is");
  assert.ok(visits[0].sub.startsWith(up.time), `the time the row says: ${up.time}`);
  assert.match(up.month, /^[A-Z][a-z]{2}$/);
  assert.match(up.date, /^\d{1,2}$/);
  assert.ok(["Today", "Tomorrow"].includes(up.day) || /^[A-Z][a-z]{2}$/.test(up.day), up.day);
  assert.equal(vm.timeline.find((i) => i.id === "added").text, "Added from your calendar (Colour)");
  assert.equal(vm.bookingLink, "https://book.example.com/marisas");
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
  // The send carries the link into the thread: the words wait in the tab for the thread's composer, which opens.
  const ui = await profileUi();
  ui.went.length = 0;
  ui.openWith({ p: { ...chat, openThread: "inbox/th-1" } })("Here is the link");
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem("chanlytics-compose")),
    { threadId: "th-1", text: "Here is the link" },
    "the send carries the link into the thread",
  );
  assert.deepEqual(ui.went, ["inbox/th-1"]);
  assert.ok(
    personActs({ ...chat, openThread: "inbox/th-1", bookingLink: "https://book.example.com/marisas" }).some(
      (a) => a.id === "booking" && a.label === "Send booking link",
    ),
    "the page's More menu offers it, in plain words, once there is a thread to open (personActs)",
  );
  assert.ok(!chat.acts.some((a) => a.id === "booking"), "and none without a thread to open it in");
  // The words are the contract's now (people bookingLinkAction), not the page's:
  // inside the window a reply is carried in, outside it the thread offers the approved message.
  assert.deepEqual([chat.bookingLinkAction.label, chat.bookingLinkAction.ready], ["Text the booking link", true]);
  assert.deepEqual([closed.bookingLinkAction.label, closed.bookingLinkAction.ready], ["Send the booking link", false]);
  // A visit's mark on the timeline is the calendar.
  const timeline = ui.drawn(() =>
    globalThis.React.createElement(ui.PersonTimeline, { items: vm.timeline, initials: vm.initials }),
  );
  const marks = ui.LR.all(
    timeline.tree,
    (n) => typeof n.props?.className === "string" && n.props.className.startsWith("cl-tl-mark"),
  );
  assert.equal(
    marks.filter((m) => ui.LR.find(m, (n) => n.type === ui.Icon && n.props.name === "calendar")).length,
    visits.length,
    "each visit's mark is the calendar",
  );
  const composer = readCode("apps/dashboard/src/surfaces/inbox/thread/composer.tsx");
  assert.ok(
    composer.includes('sessionStorage.getItem("chanlytics-compose")') &&
      composer.includes('sessionStorage.removeItem("chanlytics-compose")') &&
      composer.includes("setText((cur) => (cur && cur.trim() ? cur : said));"),
    "only into an empty composer, only once",
  );
  // The profile carries the workspace's own booking link, from its settings, trimmed; none set, or a blank one, is no
  // link to send. Run.
  const linked = await profileOf({
    tenant_config: [
      { tenant_id: HARBOR, config: { brain: { ...BRAIN, booking_link: " https://book.example.com/marisas " } } },
    ],
  });
  assert.equal(linked.person.booking_link, "https://book.example.com/marisas");
  assert.ok(
    linked.seen.some((q) => selectOn(q, "tenant_config", ["tenant_id", HARBOR])),
    "read from the workspace's own settings",
  );
  for (const brain of [BRAIN, { ...BRAIN, booking_link: "  " }]) {
    const none = await profileOf({ tenant_config: [{ tenant_id: HARBOR, config: { brain } }] });
    assert.equal(none.person.booking_link, null, "no link to send");
  }
  assert.ok(
    /const all = allVisitsIn\(index, person\)\s*\.map\(\(x\) => toVisitDto\(x\) as VisitDto\)\s*\.slice\(-60\);/.test(
      readCode("apps/dashboard/src/server/calendar/person-visits.ts"),
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
  // The table's own cells, drawn (surfaces/people/cells/columns.tsx) on the stub React the page test draws on.
  const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
  const { offersOf, plMatcher, plWhen } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  const { PeopleTable } = await importSrc("apps/dashboard/src/surfaces/people/table/table.tsx");
  const { went } = await peopleHarness();
  const cellOf = (key, p, x = {}) => {
    fresh();
    return again(() => PL_COLUMNS.find((c) => c.key === key).cell(p, { attention: {}, onOpen() {}, ...x }));
  };
  // First contact left the identity cell (22 Sep, Ruben: the row read jam-packed) for a column of its own that is off
  // until a member asks for it, so Offers still holds the place on screen it took from First contact.
  const since = PL_COLUMNS.find((c) => c.key === "since");
  assert.deepEqual(
    [since.label, since.sortable, since.on],
    ["First contact", false, false],
    "First contact is a column a member may choose, not on screen by default",
  );
  // A number is not initials; it can be named.
  const unnamed = toPersonRowVM({ ...ROW, display_name: null }, TZ, now);
  const bare = cellOf("name", unnamed);
  assert.ok(
    all(bare, (n) => classes(n).includes("cl-row-avatar-glyph")).length && byTestId(bare, "row-name-them"),
    "a number is not initials; it can be named",
  );
  assert.equal(byTestId(cellOf("name", row), "row-name-them"), null, "somebody named has initials and nothing to name");
  assert.match(textOf(cellOf("visits", row)), /Last · Thu, Aug 20/, "a visit behind them when nothing is ahead");
  assert.deepEqual(
    { opted_in: offersOf("opted_in"), opted_out: offersOf("opted_out"), unknown: offersOf("unknown") },
    { opted_in: ["Yes", "yes"], opted_out: ["No", "no"], unknown: ["Not asked", "unasked"] },
  );
  // The row's own next steps: the thread, and the booking link carried into it, inside the reply window.
  const talking = toPersonRowVM(
    {
      ...ROW,
      has_chat: true,
      conversation_count: 1,
      latest_conversation_id: "cv1",
      latest_state: "open",
      last_message_at: new Date(NOW - 3_600_000).toISOString(),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_at: new Date(NOW - 3_600_000).toISOString(),
      last_inbound_text: "Can I move Saturday to 11?",
      latest_wa_inbound_at: new Date(NOW - 3_600_000).toISOString(),
      visits: cal({ last }),
    },
    TZ,
    now,
  );
  const link = "https://book.example.com/marisas";
  const acts = cellOf("actions", talking, { bookingLink: link, drop: null });
  assert.ok(byTestId(acts, "row-open-thread") && byTestId(acts, "row-booking-link"), "the row's own next steps");
  went.length = 0;
  press(byTestId(acts, "row-booking-link"));
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem("chanlytics-compose")),
    { threadId: talking.threadId, text: `Here's the link to book your appointment: ${link}` },
    "the link is carried into the thread's composer",
  );
  assert.deepEqual(went, [`inbox/${talking.threadId}`]);
  assert.equal(byTestId(cellOf("actions", talking, { bookingLink: null, drop: null }), "row-booking-link"), null);
  // The exact time is on hover, by the business's clock.
  const at = cellOf("last", talking).props.title;
  assert.equal(at, plWhen(talking.lastContact.at), "the exact time on hover");
  assert.match(at, /^[A-Z][a-z]{2} \d{1,2}, 2026 · \d{1,2}:\d{2} [AP]M$/);
  // A row no longer counts threads and calls ("no messages yet" was that count at zero): the profile has them.
  const footOf = (total) => {
    fresh();
    return textOf(
      again(() =>
        PeopleTable({
          columns: [PL_COLUMNS[0]],
          ctx: { attention: {}, onOpen() {} },
          rows: [talking],
          total,
          noun: "person",
          sortBy: "name",
          sortDir: "asc",
          onSort() {},
          onOpen() {},
          filtered: false,
          onClearFilters() {},
        }),
      ),
    );
  };
  assert.match(footOf(1), /(^|\D)1 person$/, "honest words");
  assert.match(footOf(2), /(^|\D)2 people$/, "honest words");
  // Search finds words on the row: what they last said, and the day they are coming.
  const ahead = {
    id: "b1:1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T21:00:00.000Z",
    title: "Balayage",
    all_day: false,
    via: "phone",
  };
  const booked = toPersonRowVM({ ...ROW, visits: cal({ next: ahead, last }) }, TZ, now);
  assert.ok(plMatcher("saturday")(talking), "what they last said");
  assert.ok(!plMatcher("saturday")({ ...talking, quote: null }), "and only that: the words are the row's own");
  const day = booked.nextVisit.toLowerCase().split(" · ")[0];
  assert.ok(plMatcher(day)(booked), "the day they are coming");
  assert.ok(!plMatcher(day)({ ...booked, nextVisit: null }), "and only that: the day is the row's own");
  const css = readCode("apps/dashboard/src/legacy/styles/clients.css");
  assert.ok(
    css.includes("overflow: clip;") &&
      css.includes('grid-template-areas: "sel name state" "sel last visits" "sel offers offers";'),
    "a header that sticks; cards under 900px",
  );
  // The link as the settings hold it (calendar-settings.ts calendarOf), on the list's envelope (people-visits.ts).
  const svc = ["calendar-settings", "people-visits"]
    .map((m) => readCode(`apps/dashboard/src/server/calendar/${m}.ts`))
    .join("\n");
  assert.ok(
    svc.includes("booking_link: pv.bookingLink,") &&
      svc.includes("const bookingLink = cfg?.brain?.booking_link?.trim() || null;"),
    "the list envelope carries the link",
  );
  assert.ok(
    readCode("apps/dashboard/src/surfaces/people/surface.ts").includes("bookingLink: data.booking_link ?? null,"),
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

test("a visit's title drops the person's own name at its end, and nothing else: on Tom's page it is Consultation", async () => {
  const { visitTitleFor } = await import("../../../../packages/contracts/src/people/person-row.ts");
  assert.equal(visitTitleFor("Consultation · Tom Baker", "Tom Baker"), "Consultation", "a booking app's title");
  assert.equal(visitTitleFor("Color treatment - tom baker", "Tom Baker"), "Color treatment", "any case, any dash");
  assert.equal(visitTitleFor("Consultation · Tom", "Tom Baker"), "Consultation · Tom", "not a part of the name");
  assert.equal(visitTitleFor("Tom Baker", "Tom Baker"), "Tom Baker", "a title that is only the name stays");
  assert.equal(visitTitleFor("Balayage", "Tom Baker"), "Balayage", "a title without it stays");
  assert.equal(visitTitleFor("Cut · Mary-Jane Lee", "Mary-Jane Lee"), "Cut", "a hyphen inside the name is the name's");
  assert.equal(
    visitTitleFor("Cut · +1 917 555 0116", "+1 917 555 0116"),
    "Cut · +1 917 555 0116",
    "a number is not a name",
  );
  assert.equal(visitTitleFor("Maria Lopez - Balayage", "Maria Lopez"), "Balayage", "or at its start");
  assert.equal(visitTitleFor("Maria Lopezz - Balayage", "Maria Lopez"), "Maria Lopezz - Balayage", "not a longer word");
});

test("a caller's appointment, told to a receptionist with no booking link, is changed through the team; with a link, or with no config to know by, by the link", async () => {
  const { visitsFor, forgetFeeds } = await import("../../../../apps/edge/lib/calendar/availability.ts");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  const quotes = {
    business_name: "Luna Studio",
    system_prompt: "Answer as the front desk of Luna Studio, warmly and briefly, and never a price.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const rt = (brain) => ({
    tenantId: "t-visits-no-link",
    calendar: { ical_url: "https://calendar.example.com/luna.ics" },
    timezone: TZ,
    notifications: null,
    brain,
  });
  const maria = { phone: PEOPLE[0].phone, name: null };
  try {
    const noLink = await visitsFor(rt(quotes), maria, new Date(NOW));
    assert.ok(
      noLink.includes("to change or cancel it, say the team will follow up — nothing is changed from here."),
      noLink,
    );
    const linked = await visitsFor(rt({ ...quotes, booking_link: "https://book.example/luna" }), maria, new Date(NOW));
    assert.ok(linked.includes("to change or cancel it, send the booking link"), linked);
    const unknown = await visitsFor(rt(null), maria, new Date(NOW));
    assert.ok(unknown.includes("send the booking link"), "nothing known: the link, as the call itself is told");
  } finally {
    globalThis.fetch = realFetch;
    forgetFeeds();
  }
});
