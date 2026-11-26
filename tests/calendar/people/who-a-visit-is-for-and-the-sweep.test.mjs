/**
 * A calendar feed and its people: what an event carries, who it is for (a phone beats a name), their visits, the
 * profile's appointment facts, People from a feed, the hourly sweep that adds them, and Booked and Asked-never-booked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
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
  toCalendarVM,
  shiftKey,
} from "@chanlytics/contracts";
import { ROOT, importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import {
  ANA,
  BRAIN,
  GUESTS,
  HARBOR,
  ICS,
  MARIA,
  NOW,
  NO_OWN,
  OWNER,
  PEOPLE,
  ROW,
  TZ,
  detail,
  feed,
  guestFeed,
  peopleHarness,
  profileOf,
  selectOn,
} from "./_people.mjs";

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
    "Their next appointment on the calendar: Tue, Sep 8 · 2:00 – 5:00 PM (Maria Lopez - Balayage). If they ask, confirm it · to change or cancel it, send the booking link · nothing is changed from here.",
  );
  const byName = describeVisits(
    visitsOf(f.items, { id: "x", name: "Maria Lopez", phone: null }, NOW, NO_OWN),
    TZ,
    NOW,
    { hasBookingLink: true },
  );
  assert.ok(byName.includes("Matched by name only · make sure it is them before confirming details."));
  const last = describeVisits(visitsOf(f.items, PEOPLE[2], NOW, NO_OWN), TZ, NOW, { hasBookingLink: true });
  assert.equal(last, "Their last appointment on the calendar: Aug 20 (Daniela Ruiz · Colour).");
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

test("the profile: a Next appointment fact and About rows when the calendar is connected; nothing invented when it is not", () => {
  const now = new Date(NOW);
  const none = toPersonVM(detail(null), TZ, now);
  assert.ok(
    !none.facts.some((f) => f.label === "Next appointment") && !none.about.some((a) => a.k === "Next appointment"),
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
  const fact = vm.facts.find((f) => f.label === "Next appointment");
  assert.deepEqual(
    fact,
    { label: "Next appointment", value: "Tue, Sep 8", meta: "2:00 – 5:00 PM" },
    "the cell is narrow: the time here, the service in About",
  );
  assert.deepEqual(
    vm.about.filter((a) => a.k === "Next appointment" || a.k === "Last appointment"),
    [
      // The next one is marked as the next (`next`), so the page puts its door beside it whatever the word.
      { k: "Next appointment", v: "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage", next: true },
      { k: "Last appointment", v: "Thu, Aug 20 · 10:00 AM – 12:00 PM · Colour" },
    ],
  );
  // The workspace's own word, as Campaigns says it (decision 0041): where it calls a booking a meeting, a meeting.
  const meeting = toPersonVM(
    { ...detail({ timezone: TZ, source: "Google Calendar", state: "ok", next, last }), appointment_word: "meeting" },
    TZ,
    now,
  );
  assert.deepEqual(
    [
      meeting.facts.find((f) => f.label === "Next meeting")?.value,
      meeting.about.map((a) => a.k).filter((k) => /meeting/.test(k)),
    ],
    ["Tue, Sep 8", ["Next meeting", "Last meeting"]],
  );
  const empty = toPersonVM(
    detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null }),
    TZ,
    now,
  );
  assert.deepEqual(
    empty.facts.find((f) => f.label === "Next appointment"),
    { label: "Next appointment", value: "—", meta: "none booked" },
  );
  const down = toPersonVM(
    detail({ timezone: TZ, source: "Google Calendar", state: "unavailable", next: null, last: null }),
    TZ,
    now,
  );
  assert.equal(down.about.find((a) => a.k === "Next appointment").v, "Calendar couldn't be read");
  const byName = toPersonVM(
    detail({ timezone: TZ, source: "Google Calendar", state: "ok", next: { ...next, via: "name" }, last: null }),
    TZ,
    now,
  );
  assert.ok(
    byName.facts.find((f) => f.label === "Next appointment").meta.endsWith("· matched by name"),
    "a name is a guess, and says so in the one set of words every page says a match in",
  );
  assert.equal(down.facts.find((f) => f.label === "Next appointment").meta, "couldn't be read");
});

test("the wiring: the board and the profile read one match; both receptionists are told; the panel says who it is for and where it comes from", async () => {
  // Run, not read (25 Nov 2026): the profile's visits come from the calendar's own feed, matched by the person's number
  // as the board matches (findPersonVisits over contracts visitsIn), and say the calendar by its name, never its address.
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  };
  try {
    const address = "https://calendar.google.com/calendar/ical/harbor/private-abc/basic.ics";
    const { person } = await profileOf({
      tenant_config: [{ tenant_id: HARBOR, config: { brain: BRAIN, calendar: { ical_url: address } } }],
    });
    assert.deepEqual(asked, [address], "the feed the settings name, read once");
    assert.equal(person.visits.source, "Google Calendar", "the calendar's name, never its address");
    assert.equal(person.visits.state, "ok");
    assert.ok(person.visits.next || person.visits.last, "Maria's own visits, found by her number");
    assert.ok(!JSON.stringify(person).includes("private-abc"), "the address never leaves the server");
    const again = await profileOf({
      tenant_config: [{ tenant_id: HARBOR, config: { brain: BRAIN, calendar: { ical_url: address } } }],
    });
    assert.equal(again.person.visits.source, "Google Calendar");
    assert.deepEqual(asked, [address], "one read, kept: the next read of the same calendar asks the feed nothing");
    const { getParsedFeed } = await importSrc("apps/dashboard/src/server/calendar/parsed-feed.ts");
    const [one, two] = [
      await getParsedFeed(HARBOR, address, TZ, new Date(NOW)),
      await getParsedFeed(HARBOR, address, TZ, new Date(NOW)),
    ];
    assert.ok(one.parsed && one.parsed === two.parsed, "and one parse: every reader is handed the same one");
  } finally {
    globalThis.fetch = realFetch;
  }
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
  // The receptionists' own read of a caller's visits (the edge's findVisits: the feed's events and the record's rows for
  // the caller, by the one index) runs in calendar/appointments/the-record-joins-the-feed.test.mjs. A text's turn asks
  // them by the caller's number and name and tells them after who they are: run in calendar/availability.test.mjs ("both
  // receptionists are told what the calendar says"). Phone: the visits in the caller context, and a call for a
  // switched-off channel telling the platform as a text does: run in call-start.test.mjs. The open visit's parts are
  // drawn below. All three pinned as their modules' text until 26 Nov 2026.
  // The board's chip names the calendar ("From your calendar · read just now"), and the address never leaves the
  // server: run through getCalendarWeek and toCalendarVM in calendar-feed.test.mjs.
});

test("the open visit draws who it is for, or what the event names, its rows and its one footnote; how fresh the feed is stays on the board's chip", async () => {
  // The words are the sheet's view model's (visitSheetOf), its footnote one line and its match said only where it is a
  // guess: run in calendar-panel.test.mjs. Here, that the open visit (visit-sheet.tsx over visit.tsx) draws them.
  await peopleHarness();
  const { OpenVisit } = await importSrc("apps/dashboard/src/surfaces/calendar/visit/visit-sheet.tsx");
  const { CALENDAR_VISIT_SHEET_WORDS } = await importSrc("apps/dashboard/src/surfaces/calendar/visit/sheet-view.ts");
  const { fresh, again, byTestId, textOf } = await import("../../_stub-react.mjs");
  const open = (item) => {
    const days = Array.from({ length: 7 }, (_, i) => ({ key: shiftKey("2026-09-06", i), items: [], windows: [] }));
    days[2].items.push({
      id: "e1",
      start: "2026-09-08T18:00:00.000Z",
      end: "2026-09-08T19:30:00.000Z",
      title: "Maria Lopez · Balayage",
      all_day: false,
      location: "12 Pier Rd",
      description: "Bring the colour card",
      person: null,
      ...item,
    });
    const vm = toCalendarVM(
      {
        timezone: TZ,
        from: "2026-09-06",
        to: "2026-09-12",
        feed: {
          present: true,
          state: "ok",
          read_at: "2026-09-06T15:59:00.000Z",
          events: 1,
          recurring_expanded: 0,
          skipped_recurring: 0,
        },
        hours: { tue: { open: "09:00", close: "18:00" } },
        closures: [],
        rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
        booking_link: null,
        days,
      },
      new Date(NOW),
    );
    fresh();
    const tree = again(() =>
      OpenVisit({
        b: vm.days[2].blocks[0],
        day: vm.days[2],
        todayKey: vm.today,
        tz: TZ,
        source: "Google Calendar",
        bookingLink: null,
        moments: null,
        days: vm.days,
        onClose() {},
        onWalk() {},
        flash() {},
      }),
    );
    return { tree, vm };
  };
  const known = open({ person: { id: MARIA, name: "Maria Lopez", via: "phone" } });
  assert.equal(textOf(byTestId(known.tree, "cal-visit-door")).trim(), "Maria Lopez", "the person it is for, a door");
  assert.equal(byTestId(known.tree, "cal-visit-contact"), null);
  assert.ok(
    textOf(byTestId(known.tree, "cal-visit-rows")).includes("12 Pier Rd"),
    "the rows say what the head does not",
  );
  assert.equal(
    textOf(byTestId(known.tree, "cal-visit-footnote")).trim(),
    CALENDAR_VISIT_SHEET_WORDS.foot.feed("Google Calendar"),
    "one footnote: where the visit changes",
  );
  const { line, read } = known.vm.feed;
  for (const said of [line, read].filter(Boolean))
    assert.ok(!textOf(known.tree).includes(said), `the chip's sentence stays on the chip: ${said}`);

  const named = open({ contacts: { phones: ["+13055550142"], emails: [] }, guess: "Maria Lopez" });
  assert.equal(byTestId(named.tree, "cal-visit-person"), null, "nobody in People");
  assert.match(
    textOf(byTestId(named.tree, "cal-visit-contact")),
    /Maria Lopez/,
    "what the event names, in their place",
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

test("one refused number costs one person, never everyone behind them", async () => {
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

  // The board no longer adds people (a read never writes: decision 0047, lane 6); the import door is the member's batch
  // writer that asks the rule now, rather than deciding inline (its verb since decision 0073: server/people/import-people.ts).
  // Run, not read (25 Nov 2026): the door refuses one row's number (22023) and an erased person's (PE001), each
  // skipped with the door's own sentence; anything else stops the batch, and no row after it is asked for.
  const { importPeopleRows } = await importSrc("apps/dashboard/src/server/people/import-people.ts");
  const codes = { "+13055550101": "22023", "+13055550102": "PE001", "+13055550103": "42501" };
  const asked = [];
  const supabase = fakeDb(
    { decisions: [] },
    {},
    {
      import_person: (a) => {
        asked.push(a.p_phone_e164);
        const code = codes[a.p_phone_e164];
        if (code) throw Object.assign(new Error(`refused ${code}`), { code });
        return { contact_id: MARIA, existed: false, email: "none" };
      },
    },
  );
  const ctx = { supabase, userId: "u1", email: "owner@example.com", params: {} };
  const phones = ["+13055550101", "+13055550102", "+13055550199", "+13055550103", "+13055550104"];
  const out = await importPeopleRows(ctx, HARBOR, {
    import_id: "import-1",
    rows: phones.map((phone) => ({ name: "Someone", phone, email: null })),
  });
  assert.deepEqual(
    out.skipped,
    [
      { line: 1, reason: "refused 22023" },
      { line: 2, reason: "refused PE001" },
    ],
    "a number the door refused, and a person who asked to be forgotten: each one row, skipped in the door's words",
  );
  assert.equal(out.added, 1, "the row the door took");
  assert.deepEqual(out.failed, [{ line: 4, message: "refused 42501" }]);
  assert.equal(out.stopped, true, "any other refusal is everyone's: the batch stops");
  assert.deepEqual(asked, phones.slice(0, 4), "and asks for no row after it");
});

test("automatically: an hourly sweep on the edge puts the feed's people in People through one extraction, a read of the board adds nobody, and a press adds one; the profile says where they came from", async () => {
  // The person a calendar adds is made by the database's one door (create_person since 00052, redefined by 00331 and
  // 00342): who may call it, a name filling only an empty one and a yes never taken from a booking are proved on the
  // stack (people/doors/resolve-person.db.test.mjs, database/event-shapes.db.test.mjs "create_person: a person added by
  // hand, by a calendar guest and by a lead"); the hourly sweep is registered and scheduled
  // (ops/sweep-registry.db.test.mjs) and its door run (cron/cron-calendar-door.test.mjs). Pinned as 00052's and 00053's
  // text until 25 Nov 2026, which later migrations had already replaced.
  // The sweep's writer, run over a database in memory through the one door a person is resolved by (resolve_person,
  // decision 0034; 00344): a new person with the appointment on their added event, a known number named and given the
  // address it came with, an address another person holds left theirs, and a person who asked to be erased left erased
  // and counted, never made again. The door itself is proved on a stack (people/doors/resolve-person.db.test.mjs).
  const { addPeopleFromCalendar } = await importSrc("apps/edge/lib/calendar/people.ts");
  const { createHash } = await import("node:crypto");
  const digest = (phone) => createHash("sha256").update(`${HARBOR}:${phone}`, "utf8").digest("hex");
  const tables = {
    contacts: [
      {
        id: MARIA,
        tenant_id: HARBOR,
        phone_e164: "+13055550134",
        display_name: null,
        email: null,
        erased_at: null,
        merged_into_contact_id: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: HARBOR,
        phone_e164: "+13055550177",
        display_name: "Rosa Perez",
        email: "rosa@example.com",
        erased_at: null,
        merged_into_contact_id: null,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        tenant_id: HARBOR,
        phone_e164: null,
        display_name: null,
        email: null,
        erased_at: "2026-09-01T00:00:00.000Z",
        erased_phone_hash: digest("+13055550199"),
        merged_into_contact_id: null,
      },
    ],
    events: [],
  };
  const sweptDb = fakeDb(tables);
  const start = NOW + 2 * 86_400_000;
  const swept = await addPeopleFromCalendar(sweptDb, HARBOR, [
    {
      phone: "+13055550134",
      name: "Maria Lopez",
      title: "Maria Lopez - Balayage",
      uid: "b1",
      start,
      email: "maria@example.com",
    },
    {
      phone: "+13055550155",
      name: "Lola Diaz",
      title: "Lola Diaz - Haircut",
      uid: "b2",
      start,
      email: "rosa@example.com",
    },
    { phone: "+13055550199", name: "Gone Person", title: "Trim", uid: "b3", start, email: null },
  ]);
  assert.deepEqual(swept, { seen: 3, added: 1, named: 1, erased: 1, emailed: 1 }, "what the sweep counts");
  const maria = tables.contacts.find((c) => c.id === MARIA);
  assert.deepEqual(
    [maria.display_name, maria.email],
    ["Maria Lopez", "maria@example.com"],
    "named and given the address",
  );
  const lola = tables.contacts.find((c) => c.phone_e164 === "+13055550155");
  assert.deepEqual(
    [lola.display_name, lola.email],
    ["Lola Diaz", null],
    "made, without the address another person here holds",
  );
  assert.equal(tables.contacts.length, 4, "nobody made twice, and the erased not made again");
  assert.deepEqual(
    tables.events
      .filter((e) => e.kind === "contact.added")
      .map((e) => [e.subject_id, e.data.source, e.data.title, e.data.uid, e.data.start]),
    [[lola.id, "calendar", "Lola Diaz - Haircut", "b2", new Date(start).toISOString()]],
    "the new person's added event carries the appointment, as the profile reads it",
  );
  assert.deepEqual(
    tables.events.filter((e) => e.kind === "person.resolved").map((e) => [e.data.outcome, e.data.assurance]),
    [
      ["filled", "found"],
      ["new", "found"],
    ],
    "each row that went through the door is on the ledger; the erased one was refused before it",
  );
  // The board's read (calendar/week/week.ts getCalendarWeek, and the calendar route) is not a writer any more: it reaches no door
  // (a read never writes, decision 0047 lane 6; the executed proof is calendar-feed.test.mjs and reads-never-write/).
  assert.equal(
    fs.existsSync(path.join(ROOT, "apps/dashboard/src/server/calendar/people-seen.ts")),
    false,
    "the board's own writer is gone",
  );
  // getCalendarWeek reaches no door: run in calendar-feed.test.mjs and reads-never-write/. The door records where a
  // person came from (contact.added), which members cannot write themselves: database/event-shapes.db.test.mjs. The
  // door's own route stays, for a hand, the member's own (POST contacts, operator): people/routes/ ("a person, a list
  // and everyone"). Pinned as the board's, 00053's and the route's text until 25 Nov 2026.
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
  // A visit whose person the board cannot match offers a press, through the verb Add a person commits, never a window
  // global: pressed in reads-never-write/a-visit-the-board-cannot-match-offers-add-to-people.test.mjs.
  // The hand's door has its screen on People now (slice D of the data program): the same route, a number and a name,
  // answering with the person it made or found. Run over People's wire (pinned as people-detail.ts's text until 26 Nov 2026).
  const { onTheWire } = await peopleHarness();
  const { addPerson } = await importSrc("apps/dashboard/src/surfaces/people/people-detail.ts");
  const sent = await onTheWire(() => addPerson({ phone: "+13055550142", name: "Maria Lopez" }));
  assert.deepEqual(
    sent.filter((r) => r.method === "POST").map((r) => [r.route, r.body]),
    [["contacts", { phone: "+13055550142", name: "Maria Lopez" }]],
    "the bridge verb, through the same door",
  );
  // The sweep reads the feed through the same cache (the edge's listFeedItems): run in calendar-counts.test.mjs.
});

test("the profile: Added from the calendar, with the appointment that named them", () => {
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
    "Sep 6, 2026 · from the calendar (Maria Lopez - Balayage)",
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
  // Reports' rule (visit/booked-after-ask.ts visitAnswersAsk, decision 0009): a visit before they asked does not answer it.
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
