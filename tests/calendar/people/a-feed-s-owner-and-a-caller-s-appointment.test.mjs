/**
 * A Google feed names its owner and never takes a meeting by its title's words, and a caller's appointment told to a
 * receptionist with no booking link is changed through the door.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractContacts, matchPerson, describeVisits, toPersonVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { ICS, NOW, NO_OWN, OWNER_ADDR, OWNER_URL, PEOPLE, TZ, detail_, guestFeed, meetings } from "./_people.mjs";

test("a Google feed names its owner, and a calendar that is not a person names nobody", async () => {
  const { calendarOwnerOf } = await import("@chanlytics/contracts");
  assert.equal(calendarOwnerOf(OWNER_URL), OWNER_ADDR);
  assert.equal(
    calendarOwnerOf(OWNER_URL.replace("ruben%40rjcapital.example", "RUBEN%40RJCapital.example")),
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
  assert.deepEqual(visitsIn(index, owner, NOW), { next: null, last: null, near: [], missed: null });
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

test("a visit's title drops the person's own name, and nothing else: on Tom's page it is Consultation", async () => {
  // The one rule every page says a visit's title by (visit/service.ts), which the calendar's serviceOf and People's
  // visitTitleFor were two more of.
  const { visitTitleWithout } = await import("../../../packages/contracts/src/calendar/visit/service");
  const visitTitleFor = (title, name) => visitTitleWithout(title, [name]);
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
  const { findVisits, forgetFeeds } = await import("../../../apps/edge/lib/calendar/availability.ts");
  const { setPg } = await importSrc("apps/edge/lib/shared/pg.ts");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  // The record is a database in memory with nothing on it, whatever the run's credentials: with the nightly's, the
  // real database was asked for this made-up workspace and refused its id, so the visits went unsaid.
  setPg(fakeDb({ appointments: [] }));
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
    // What the runtime always carries beside the config (tenant-runtime.ts): here, nothing known.
    known: { workspace: null, channels: [], listing: null },
  });
  const maria = { phone: PEOPLE[0].phone, name: null };
  try {
    // Asked from a chat (calendar/availability.ts linkOfferedOn): any link is one it can send in the thread.
    const noLink = await findVisits(rt(quotes), maria, "chat", new Date(NOW));
    assert.ok(
      noLink.includes("to change or cancel it, say the team will follow up · nothing is changed from here."),
      noLink,
    );
    const linked = await findVisits(
      rt({ ...quotes, booking_link: "https://book.example/luna" }),
      maria,
      "chat",
      new Date(NOW),
    );
    assert.ok(linked.includes("to change or cancel it, send the booking link"), linked);
    const unknown = await findVisits(rt(null), maria, "chat", new Date(NOW));
    assert.ok(unknown.includes("send the booking link"), "nothing known: the link, as the call itself is told");
    // On a call the link goes by WhatsApp alone: with no WhatsApp line it is the team, as with no link (offersLinkOn).
    const call = await findVisits(
      rt({ ...quotes, booking_link: "https://book.example/luna" }),
      maria,
      "call",
      new Date(NOW),
    );
    assert.ok(call.includes("say the team will follow up"), call);
    assert.ok(!call.includes("booking link"), call);
  } finally {
    globalThis.fetch = realFetch;
    forgetFeeds();
    setPg(null);
  }
});

test("the receptionist's match by name is what it was: a first name of four letters finds the visit and says so; only a message that is sent judges it by the full name (fullNameKey)", async () => {
  const { indexFeed, visitsIn } = await import("@chanlytics/contracts");
  const { fullNameKey, visitServiceOf } = await importSrc("packages/contracts/src/calendar/visit/service.ts");
  const index = indexFeed(guestFeed().items, NO_OWN);
  const first = visitsIn(index, { id: "p-first", name: "Daniela", phone: null, email: null }, NOW);
  assert.deepEqual([first.next?.title, first.next?.via], ["Daniela Ruiz · Colour", "name"]);
  assert.ok(describeVisits(first, TZ, NOW, { hasBookingLink: true }).includes("Matched by name only"));
  // What a message may rest on: two words or more, first and last of two letters, written the one way; nothing else.
  assert.deepEqual(
    [
      "Maria",
      "Maria L.",
      "  maria   LOPEZ ",
      "Maria Lopez",
      "Mary Ann Lee",
      "+1 305 555 0100",
      "x@y.com",
      "",
      "   ",
      null,
      undefined,
    ].map(fullNameKey),
    [null, null, "maria lopez", "maria lopez", "mary ann lee", null, null, null, null, null, null],
  );
  // The service, without the name the title carries.
  assert.equal(visitServiceOf("Daniela Ruiz · Colour", ["Daniela Ruiz"]), "Colour");
});

test("a visit a member said they missed, or kept, says so on the timeline: never 'Past visit' over a member's word (0002 step 8)", () => {
  const visit = (id, day, said) => ({
    id,
    start: `2026-08-${day}T14:00:00.000Z`,
    end: `2026-08-${day}T16:00:00.000Z`,
    title: "Colour",
    all_day: false,
    via: "phone",
    ...(said ? { said } : {}),
  });
  const missed = visit("m", "10", "missed");
  const kept = visit("k", "20", "kept");
  const vm = toPersonVM(
    {
      ...detail_(),
      visits: {
        timezone: TZ,
        source: "Google Calendar",
        state: "ok",
        next: null,
        last: kept,
        missed,
        all: [missed, kept],
      },
    },
    TZ,
    new Date(NOW),
  );
  assert.deepEqual(
    vm.timeline.filter((i) => i.kind === "visit").map((i) => i.text),
    ["Kept · Colour", "Missed · Colour"],
  );
});
