/**
 * The business a person works at trails their name wherever a page names them (decision 0052, its deferred list), and
 * Leads says who at a business is in People.
 *
 * People, the Inbox's list and Conversations drew the trail when 0052 landed; Today's queue, the Calendar's appointment
 * and Live named the same person with nothing after the name. Leads' row said "Talking" with no way to the person it
 * was talking with, and its line under the name said where the business is when the owner already knew it by its people.
 *
 * What is held here, by executing the code:
 *  - the trail is one reading of People's rows (people/business-trail.ts over contracts businessTrailOf): a named
 *    person's business; nothing for a stand-in (their name is the business's), a business removed, someone who works
 *    nowhere, or before People is read; and it follows People read again;
 *  - Today's row (the kit's AttnRow), Live's row and panel draw it dim after the name, and the Calendar's visit under it,
 *    from the facts the board's own read carries of them (calendar-person-facts.ts: the same trail, worked out on the server);
 *  - a business's people (contracts leadPeopleOf): its face is the one with a name of their own most recently in touch,
 *    never the stand-in the finder made while anyone there has a name; the line and the card name two at most; a won
 *    deal anywhere at it makes it a client; and Leads' row draws the Talking stage as the door to that face.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarPersonFactsOf,
  leadPeopleIndex,
  leadPeopleOf,
  matchPerson,
  personLikeOf,
  toCalendarVM,
  toLeadRowVM,
  toLiveCallVM,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, classes, textOf } from "../../_legacy-react.mjs";
import { personDto, personRow, daysAgo, ROW_NOW, ROW_TZ } from "../../consent/_person-row.mjs";

const opened = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false, CHANLY: { nav: (to) => opened.push(to) } });
const S = "../../../../../apps/dashboard/src";
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { businessTrailFor } = await import(`${S}/surfaces/people/business-trail.ts`);
const { AttnRow } = await import(`${S}/surfaces/kit/attention/attn-row.tsx`);
const { LrList } = await import(`${S}/surfaces/live/list.tsx`);
const { LrPanel } = await import(`${S}/surfaces/live/panel.tsx`);
const { OpenVisit } = await import(`${S}/surfaces/calendar/visit/visit-sheet.tsx`);
const { LEAD_COLUMNS } = await import(`${S}/surfaces/leads/cells/columns.tsx`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);
const NOW = new Date(ROW_NOW);
const iso = (ms) => new Date(ms).toISOString();

/* --------------------------------------------- the people --------------------------------------------- */

const LEAD = "l-bloom";
const BUSINESS = "Bloom & Vow Bridal";
/** Someone at the business, as People's row says them: the lead, its name while it stands, where their name came from. */
const atBloom = (id, name, source, over = {}) => ({
  id,
  display_name: name,
  lead_id: LEAD,
  lead_name: BUSINESS,
  lead_gone: false,
  name_source: source,
  ...over,
});
const PRIYA = atBloom("p-priya", "Priya Nair", "signature", { last_message_at: daysAgo(1) });
const STAND_IN = atBloom("p-stand", BUSINESS, "lead", { last_message_at: daysAgo(6) });
const LEAH = atBloom("p-leah", "Leah Brooks", "typed", { last_message_at: daysAgo(2), needs_human: true });
const GONE = { id: "p-gone", display_name: "Sam Ortiz", lead_id: "l-gone", lead_name: null, lead_gone: true };
const NOWHERE = { id: "p-none", display_name: "Dana Cole" };
/** People's rows in People's own order, the latest in touch first. */
const ROWS = [PRIYA, LEAH, STAND_IN, GONE, NOWHERE].map((r) => personRow(r));

/* --------------------------------------------- the trail --------------------------------------------- */

test("the trail is People's own: a named person's business, and nothing for a stand-in, a business removed, someone who works nowhere, or before People is read", () => {
  setSurfaceValue("people", undefined);
  assert.equal(businessTrailFor("p-priya"), null, "People not read yet");
  setSurfaceValue("people", { rows: ROWS });
  assert.equal(businessTrailFor("p-priya"), BUSINESS);
  assert.equal(businessTrailFor("p-leah"), BUSINESS);
  assert.equal(businessTrailFor("p-stand"), null, "a stand-in's name is the business's already");
  assert.equal(businessTrailFor("p-gone"), null, "a business whose details were removed");
  assert.equal(businessTrailFor("p-none"), null, "someone who works nowhere");
  assert.equal(businessTrailFor("somebody People does not hold"), null);
  assert.equal(businessTrailFor(null), null);
  // People read again: the trail follows the rows published, never a copy kept from the first read.
  setSurfaceValue("people", { rows: [personRow({ ...PRIYA, lead_name: "Vow Studio" })] });
  assert.equal(businessTrailFor("p-priya"), "Vow Studio");
  setSurfaceValue("people", { rows: ROWS });
});

test("Today's row draws the business dim after the name, inside the name's own line, so a short line cuts it first", () => {
  fresh();
  const row = h(AttnRow, { person: { name: "Priya Nair", initials: "PN" }, name: "Priya Nair", trail: BUSINESS });
  const who = find(row, (n) => classes(n).includes("cl-attn-who"));
  const trail = byTestId(who, "attention-business");
  assert.ok(trail, "inside the name's line, which ellipsises from its end");
  assert.ok(classes(trail).includes("cl-attn-trail"));
  assert.equal(textOf(trail).trim(), `· ${BUSINESS}`);
  assert.equal(textOf(who).replace(/\s+/g, " "), `Priya Nair · ${BUSINESS}`);
  assert.equal(byTestId(h(AttnRow, { name: "Dana Cole" }), "attention-business"), null, "nothing where there is none");
  assert.equal(byTestId(h(AttnRow, { name: "Dana Cole", trail: null }), "attention-business"), null);
});

/* --------------------------------------------- Live --------------------------------------------- */

/** A call in progress from someone People holds (or nobody it does). */
const liveCall = (contactId, name) =>
  toLiveCallVM(
    {
      id: `k-${contactId ?? "none"}`,
      retell_call_id: `r-${contactId ?? "none"}`,
      direction: "inbound",
      call_type: "phone_call",
      status: "ongoing",
      from_e164: "+13055550100",
      from_raw: null,
      to_e164: "+13055550123",
      started_at: iso(ROW_NOW - 60_000),
      ended_at: null,
      updated_at: iso(ROW_NOW - 5_000),
      duration_ms: null,
      disconnection_reason: null,
      sentiment: null,
      call_successful: null,
      in_voicemail: false,
      summary: null,
      transcript_object: null,
      recording: null,
      conversation_id: "c1",
      contact_id: contactId,
      message_id: null,
      contact: contactId ? { display_name: name, wa_profile_name: null, phone_e164: "+13055550100" } : null,
      wanted: null,
      outcome: null,
      follow_up: null,
      caller_name: null,
    },
    ROW_TZ,
    NOW,
  );

test("Live's row and its panel trail the caller's name with their business, from People's rows", () => {
  setSurfaceValue("people", { rows: ROWS });
  fresh();
  const calls = [liveCall("p-priya", "Priya Nair"), liveCall("p-none", "Dana Cole")];
  const list = again(() =>
    LrList({ live: calls, line: null, lineRead: true, activeId: null, elapsedOf: () => 5, onSelect() {} }),
  );
  const rows = all(list, (n) => n.props?.["data-testid"] === "live-row");
  assert.equal(rows.length, 2);
  const who = find(rows[0], (n) => classes(n).includes("lm-row-who"));
  const trail = byTestId(who, "live-row-business");
  assert.ok(trail, "the caller who works at a business, inside the name's line, so a short row cuts it first");
  assert.ok(classes(trail).includes("lm-row-trail"));
  assert.equal(textOf(trail).trim(), `· ${BUSINESS}`);
  assert.equal(byTestId(rows[1], "live-row-business"), null, "someone who works nowhere");

  fresh();
  const panel = again(() => LrPanel({ c: calls[0], elapsed: 5, nowMs: ROW_NOW }));
  assert.equal(textOf(byTestId(panel, "lm-head-business")).trim(), `· ${BUSINESS}`);
  fresh();
  assert.equal(
    byTestId(
      again(() => LrPanel({ c: calls[1], elapsed: 5, nowMs: ROW_NOW })),
      "lm-head-business",
    ),
    null,
  );
});

/* --------------------------------------------- the Calendar --------------------------------------------- */

/**
 * The Calendar's block for an appointment titled `title`, matched by the board's own path (personLikeOf, matchPerson), with
 * the facts the read attaches from the same People row (calendar-week.ts: calendarPersonFactsOf).
 */
const blockFor = (title, dto) => {
  const matched = matchPerson(
    { title, description: null, location: null, attendees: [] },
    [personLikeOf(dto)],
    new Set(),
  );
  const person = matched ? { ...matched, facts: calendarPersonFactsOf(dto, ROW_TZ, ROW_NOW) } : null;
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: `2026-09-${String(20 + i).padStart(2, "0")}`, items: [], windows: [] });
  days[1].items.push({
    id: "e1",
    start: "2026-09-21T18:00:00.000Z",
    end: "2026-09-21T19:30:00.000Z",
    title,
    all_day: false,
    person,
  });
  const vm = toCalendarVM(
    {
      timezone: ROW_TZ,
      from: "2026-09-20",
      to: "2026-09-26",
      feed: {
        present: true,
        state: "ok",
        read_at: "2026-09-20T14:58:00.000Z",
        events: 1,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      hours: { mon: { open: "09:00", close: "18:00" } },
      closures: [],
      rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
      booking_link: null,
      days,
    },
    NOW,
  );
  return { block: vm.days[1].blocks[0], vm };
};
const visitFor = (title, dto) => {
  const { block, vm } = blockFor(title, dto);
  assert.ok(block.person, `the fixture's appointment is matched: ${title}`);
  fresh();
  return again(() =>
    OpenVisit({
      b: block,
      day: vm.days[1],
      todayKey: vm.today,
      tz: ROW_TZ,
      source: "your calendar",
      bookingLink: null,
      moments: null,
      days: vm.days,
      onClose() {},
      onWalk() {},
      flash() {},
    }),
  );
};
/** The quiet line under the visit's person: their business, and how the board matched them where that is a guess. */
const underName = (tree) =>
  textOf(find(byTestId(tree, "cal-visit-person"), (n) => classes(n).includes("cal-visit-quiet"))).trim();

test("the Calendar's visit says the person's business under their name, from the board's own read, and how it matched them where that is a guess", () => {
  const priya = personDto({ ...PRIYA, phone_e164: "+13055550111" });
  // Matched by the number the event carries: their name, then the business under it.
  let visit = visitFor("Fitting +1 305 555 0111", priya);
  assert.equal(textOf(byTestId(visit, "cal-visit-door")).trim(), "Priya Nair");
  assert.equal(underName(visit), BUSINESS);
  // The title names them: matched by a name, which is a guess, said after the business.
  visit = visitFor("Priya Nair · Fitting", priya);
  assert.match(underName(visit), new RegExp(`^${BUSINESS} · `));
  // Someone who works nowhere: no business.
  visit = visitFor("Dana Cole · Fitting", personDto({ ...NOWHERE }));
  assert.ok(!underName(visit).includes(BUSINESS));
});

test("a booking from one of the business's own addresses is its own person's, said as their business; a colleague and a business removed carry none", () => {
  // People's row (00418): the business's address and the ones the finder read off its site, on its own person alone.
  const standIn = personDto({
    ...STAND_IN,
    lead_emails: ["hello@bloomandvow.example", "Bookings@BloomAndVow.example "],
  });
  const like = personLikeOf(standIn);
  assert.deepEqual(like.businessEmails, ["hello@bloomandvow.example", "bookings@bloomandvow.example"]);
  const booking = (email) => ({
    title: "Consultation",
    description: null,
    location: null,
    attendees: [{ email, name: null }],
  });
  const matched = matchPerson(booking("bookings@bloomandvow.example"), [like], new Set());
  assert.equal(matched?.id, "p-stand");
  assert.equal(matched?.via, "business", "the business's address, never theirs: a guess the receptionist confirms");
  // Their own address still wins, and is theirs.
  const own = personLikeOf(personDto({ ...PRIYA, email: "priya@example.com" }));
  assert.equal(matchPerson(booking("priya@example.com"), [own, like], new Set())?.via, "email");
  // A colleague's row carries none, and nor does a business removed.
  assert.deepEqual(personLikeOf(personDto({ ...PRIYA })).businessEmails, []);
  assert.deepEqual(
    personLikeOf(personDto({ ...GONE, lead_emails: ["hello@gone.example"] })).businessEmails,
    [],
    "a business removed is nobody's",
  );
  // The business's own address of the WORKSPACE is never anyone's, whoever's lead names it.
  assert.equal(
    matchPerson(booking("bookings@bloomandvow.example"), [like], new Set(["bookings@bloomandvow.example"])),
    null,
  );
});

/* --------------------------------------------- Leads --------------------------------------------- */

test("a business's people: its face is the one with a name of their own most recently in touch, never the stand-in while anyone there has a name", () => {
  const index = leadPeopleIndex(ROWS);
  // The lead's own person is the stand-in the finder made; Priya answered and was named, and Leah waits on you.
  const vm = leadPeopleOf({ id: LEAD, contactId: "p-stand" }, index);
  assert.deepEqual(vm.door, { id: "p-priya", name: "Priya Nair" }, "the face, by name");
  assert.deepEqual(vm.order, ["p-priya", "p-leah", "p-stand"], "the face, whoever waits on you, then the rest");
  assert.equal(vm.line, `3 people · Priya Nair, Leah Brooks`, "the stand-in is counted, never named");
  assert.equal(vm.card, "In People · Priya Nair, Leah Brooks");
  assert.equal(vm.client, null);

  // Only the stand-in: it is the door, unnamed (its name is the business's); the row's line keeps where the business is,
  // which says more than a count of the business we wrote to, and the card counts it.
  const alone = leadPeopleOf({ id: LEAD, contactId: "p-stand" }, leadPeopleIndex([personRow(STAND_IN)]));
  assert.deepEqual(alone.door, { id: "p-stand", name: null });
  assert.equal(alone.line, null);
  assert.equal(alone.card, "In People · 1");

  // Nobody at it: nothing at all.
  assert.deepEqual(leadPeopleOf({ id: "l-other", contactId: null }, index), {
    door: null,
    line: null,
    card: null,
    client: null,
    order: [],
  });
  // A business removed since is nobody's: its people are not listed under it.
  assert.equal(leadPeopleOf({ id: "l-gone", contactId: null }, index).line, null);

  // Three named: two names, then how many more.
  const more = leadPeopleOf(
    { id: LEAD, contactId: null },
    leadPeopleIndex([PRIYA, LEAH, atBloom("p-ana", "Ana Ruiz", "typed")].map((r) => personRow(r))),
  );
  assert.equal(more.line, "3 people · Priya Nair, Leah Brooks and 1 more");
});

test("a won deal with anyone at the business makes it a client, the one whose deal it is the Client pill's door", () => {
  const won = personRow({
    ...LEAH,
    deal_id: "d1",
    deal_stage: "won",
    deal_service: "Bridal",
    deal_proposed_at: daysAgo(10),
    deal_decided_at: daysAgo(2),
  });
  assert.equal(won.deal?.stage, "won", "the fixture's deal is won");
  const vm = leadPeopleOf(
    { id: LEAD, contactId: "p-stand" },
    leadPeopleIndex([personRow(PRIYA), won, personRow(STAND_IN)]),
  );
  assert.equal(vm.client, "p-leah", "not the lead's own person: whoever won it");
});

/** A lead as the Leads page's row says it, Talking, its own person the stand-in. */
const talking = () =>
  toLeadRowVM(
    {
      id: LEAD,
      search_id: "s1",
      search_name: "Bridal shops",
      place_id: "ChIJbloom",
      business_name: BUSINESS,
      category: "Bridal shop",
      city: "Austin",
      state: "TX",
      street: null,
      postal_code: "78704",
      phone: "+15125550101",
      phone_agrees: true,
      phone_wrong: false,
      email: "hello@bloomandvow.example.com",
      email_state: "ok",
      email_checked_at: daysAgo(3),
      website: "bloomandvow.example.com",
      instagram: null,
      rating: 4.9,
      reviews: 40,
      stage: "converted",
      closed_reason: null,
      contact_id: "p-stand",
      last_outcome: null,
      last_note: null,
      contacted_at: daysAgo(4),
      converted_at: daysAgo(2),
      places: 1,
      found_at: daysAgo(9),
      exported_at: null,
      version: 1,
      member: {
        class: "qualified",
        fit: "strong",
        reason: "Independent shop",
        excluded_by: null,
        distance_m: 1500,
        counted: true,
        checks: [],
        other_emails: [],
      },
    },
    ROW_TZ,
    NOW,
  );
const cellCtx = (over = {}) => ({
  onOpen() {},
  onOpenPerson: (id) => opened.push(`person:${id}`),
  onExpand() {},
  values: false,
  mixedFits: false,
  hasCenter: false,
  canFind: true,
  peopleRows: ROWS,
  stageShown: false,
  reachOut: null,
  onCall() {},
  onCopy() {},
  onCopyPhone() {},
  onLogCall() {},
  onWarm() {},
  onKeep() {},
  onExclude() {},
  onPutBack() {},
  callMenu: null,
  ...over,
});

test("Leads' row: a Talking lead's stage is the door to the person it is talking with, and the line under its name says who is in People", () => {
  const l = talking();
  assert.equal(l.state, "talking");
  const business = LEAD_COLUMNS.find((c) => c.key === "business");
  fresh();
  const cell = business.cell(l, cellCtx());
  const door = byTestId(cell, "lead-talking-door");
  assert.ok(door, "the stage is a door");
  // Beside the business's name it is "Talking" alone: the line under the name says who, and a name in the tag cut the
  // business's own name short on the page.
  assert.equal(textOf(door).trim(), "Talking");
  assert.equal(door.props.title, "Open Priya Nair in People");
  opened.length = 0;
  door.props.onClick({ stopPropagation() {} });
  assert.deepEqual(opened, ["person:p-priya"], "it opens the face, never the stand-in");
  assert.equal(textOf(byTestId(cell, "lead-sub")), "3 people · Priya Nair, Leah Brooks");

  // The Stage column, when it is drawn, is the same door, and has the room to name them.
  const stage = LEAD_COLUMNS.find((c) => c.key === "stage");
  assert.match(
    textOf(byTestId(stage.cell(l, cellCtx({ stageShown: true })), "lead-talking-door")),
    /Talking · Priya Nair/,
  );

  // Before People is read: the stage is words, and the line says where the business is.
  const cold = business.cell(l, cellCtx({ peopleRows: [] }));
  assert.equal(byTestId(cold, "lead-talking-door"), null);
  assert.equal(textOf(byTestId(cold, "lead-sub")), l.sub);
});

test("a page that names someone People does not hold yet asks for People again: once for each person, once a minute whoever asks, and nothing before People's first read (the wiring's second audit, R10, W-person-list-lead-5)", async (t) => {
  // Leads' Talking door, the business beside a name, the people at a lead and the Inbox header read People's rows, and
  // People is not read again on those pages: a person a reply made, or linked to a business since, had no door and no
  // business until People was opened.
  const { wantPerson, forgetWantedPeople } = await import(`${S}/surfaces/people/want-person.ts`);
  const asked = [];
  const keep = globalThis.window.__refreshSurface;
  globalThis.window.__refreshSurface = async (key) => {
    asked.push(key);
  };
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const settle = () => t.mock.timers.tick(1);
  try {
    forgetWantedPeople();
    setSurfaceValue("people", undefined);
    wantPerson("p-new");
    settle();
    assert.deepEqual(asked, [], "before People's first read: that read is on its way");
    setSurfaceValue("people", { rows: ROWS });
    wantPerson("p-priya");
    wantPerson(null);
    settle();
    assert.deepEqual(asked, [], "someone People holds, or no one: nothing asked");
    // Asked from a draw: the read is asked for after it.
    assert.equal(businessTrailFor("p-new"), null, "the trail draws nothing yet");
    assert.deepEqual(asked, [], "never from inside the draw");
    settle();
    assert.deepEqual(asked, ["people"], "and then People is read again");
    wantPerson("p-new");
    t.mock.timers.tick(2 * 60_000);
    assert.deepEqual(asked, ["people"], "once for each person: one People will never hold costs one read");
    // Another, within the minute of an ask: waits for the minute.
    wantPerson("p-other");
    settle();
    wantPerson("p-third");
    settle();
    assert.deepEqual(asked, ["people", "people"], "a minute after the last, another person asks again");
    wantPerson("p-fourth");
    settle();
    assert.deepEqual(asked, ["people", "people"], "and the next waits for its minute");
    t.mock.timers.tick(60_000);
    wantPerson("p-fourth");
    settle();
    assert.deepEqual(asked, ["people", "people", "people"]);
  } finally {
    t.mock.timers.reset();
    globalThis.window.__refreshSurface = keep;
    forgetWantedPeople();
    setSurfaceValue("people", { rows: ROWS });
  }
});
