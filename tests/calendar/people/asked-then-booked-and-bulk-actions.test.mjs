/**
 * The report's asked-then-booked line, the journey from visits in three groups with each list's next step, and People's
 * bulk actions over a selection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPersonVM, personActs, PEOPLE_LISTS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { DESK, PHONE, cascadeOf, declared, element } from "../../_css.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { logLineOf } from "../../_log-lines.mjs";
import { fresh, again, all, byTestId, classes, find, press, textOf } from "../../_stub-react.mjs";
import {
  BRAIN,
  HARBOR,
  MARIA,
  NOW,
  NO_OWN,
  ROW,
  TZ,
  detail_,
  feed,
  peopleHarness,
  peopleLoaded,
  profileOf,
  profileUi,
  reportsRoute,
  selectOn,
} from "./_people.mjs";

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
    sub: "30% of the people who wrote or called in the last 30 days have booked",
    words: "of the people who wrote or called in the last 30 days have booked",
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
    [0, "Everyone who asked in the last 7 days has booked."],
  );
  // One day (Month on the 1st): "1 day", never "1 days", in each place the card names its period.
  assert.equal(
    toBookingReportVM({ calendar: "ok", days: 1, asked: 2, booked: 1 }).words,
    "of the people who wrote or called in the last 1 day have booked",
  );
  assert.equal(
    toBookingReportVM({ calendar: "ok", days: 1, asked: 3, booked: 3 }).rest,
    "Everyone who asked in the last 1 day has booked.",
  );
  assert.equal(
    toBookingReportVM({ calendar: "ok", days: 1, asked: 0, booked: 0 }).sub,
    "nobody wrote or called in the last 1 day",
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
  assert.equal(toBookingReportVM(null).sub, "Add a calendar link under Settings › Hours & booking to see who booked.");
  assert.equal(
    toBookingReportVM({ calendar: "unavailable", days: 30, asked: 5, booked: 0 }).sub,
    "Couldn't load the calendar.",
  );
});

test("the wiring: the list and the assistant carry appointments from one parsed feed; the report carries the line; Leads and the Deal board retire into People", async () => {
  // One parse, kept for everyone: run in "the wiring: the board and the profile" above (a second read asks the feed
  // nothing). Everyone's visits off it with the record laid on (peopleVisitsOf, bookedAfterAsk):
  // calendar/appointments/the-record-joins-the-feed.test.mjs. The report's line: GET reports, run below. Pinned as
  // parsed-feed.ts's and people-visits.ts's text until 25 Nov 2026.
  // The list carries visits and the calendar's state, a page at a time: GET contacts runs through its reader in
  // ask/readers/, its two stages read from the query log and its payload compared key for key.
  // The report carries the line, and is never fatal for it: GET reports, run. The series, the booking line and the
  // deals, in that order; People read once, for the line and the deals alike, and the deals read after the line's
  // calendar lookup; a lookup that fails costs the line, said in the log, never the report.
  const reportOf = async (faults = {}) => {
    const supabase = fakeDb(
      {
        memberships: [
          { user_id: "u1", tenant_id: HARBOR, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
        ],
        tenants: [{ id: HARBOR, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
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
  assert.deepEqual(Object.keys(whole.out), ["report", "booking", "deals", "profile"]);
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
  // The assistant answers who booked and who never did: people.search runs over a feed in ask/turn/, its
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
    "no deal on file: no deal list",
  );
  assert.ok(
    dealLists.every((id) => listsOf({ hasDeals: true }).includes(id)),
    "a deal on file: every deal list",
  );
  // Run, not read (25 Nov 2026): the Reports page draws the booking line from its view model
  // (reports/page/periods-reviews-and-every-state.test.mjs, "asked, then booked"), and its Receptionist lens the chart
  // (reports/lenses/reports-lens-page.test.mjs); Leads and the Deal board retired into People, where the old addresses
  // land (shell/surfaces/surface-registry.test.mjs, surfaceRetiredTo).
  // The frame moves a real workspace there, in place (pinned as shell-hooks.ts's text until 26 Nov 2026): the route
  // resolved as the frame resolves it, over the registry's own answer, and its move handed to the bridge's address.
  await peopleHarness();
  const { bridgeHolds } = await import("../../shell/_bridge-holds.mjs");
  const { surfaceRetiredTo } = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  const { routeAt } = await importSrc("apps/dashboard/src/surfaces/frame/shell-routes.ts");
  const { useRouteMoves } = await importSrc("apps/dashboard/src/surfaces/frame/shell-hooks.ts");
  const moves = [];
  bridgeHolds({
    parts: {
      surfaceRetired: surfaceRetiredTo,
      shell: { route: () => "today", href: (r) => r, go: (r, o) => moves.push([r, o]), hear: () => () => {} },
    },
  });
  try {
    for (const page of ["leads", "pipeline"]) {
      moves.length = 0;
      fresh();
      again(() => (useRouteMoves(routeAt({ page, param: null })), null));
      const to = surfaceRetiredTo(page, null);
      assert.match(to, /^clients(\/|$)/, `${page} retired into People`);
      assert.deepEqual(moves, [[to, { replace: true }]], `${page}: a real workspace lands there, in place`);
    }
    moves.length = 0;
    fresh();
    again(() => (useRouteMoves(routeAt({ page: "clients", param: null })), null));
    assert.deepEqual(moves, [], "and People itself stays");
  } finally {
    bridgeHolds({ parts: { surfaceRetired: undefined, shell: undefined } });
  }
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
});

test("a name the owner gives and notes the receptionist reads: two doors, one route, the profile's rename and Notes, the VM's givenName", async () => {
  // The two doors (set_person_name and set_person_notes since 00054, redefined by 00131, 00157 and 00413) and who may
  // call them, the notes' length and who changed what on the ledger: proved on the stack
  // (notes/person-notes.db.test.mjs). The route's policy is route-policy.json's (routes/route-policy.test.mjs), and that it
  // sends a name and notes through their doors and refuses an empty change runs through the route itself
  // (people/routes/, "details: an operator where the person lives"). Pinned as 00054's and the route's text until 25 Nov
  // 2026.
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
  const { byTestId } = ui.LR;
  assert.deepEqual(await ui.writes(() => ui.setPersonDetails(MARIA, { name: "Maria Lopez" })), [
    ["PUT", `/api/v1/contacts/${MARIA}/details`, { name: "Maria Lopez" }],
  ]);
  // The hero name is the editable one: whoever may record is drawn the name as the box it is typed in, from the first
  // draw, its pencil after it (pressing moves nothing); anyone else is shown the name and nothing to change it with.
  const maria = toPersonVM(detail_(), TZ, new Date(NOW));
  const hero = (canRecord) => () => ui.hero(ui.ctx(maria, { canRecord }), () => {}, false);
  const named = ui.drawn(hero(true));
  for (const id of ["person-rename", "person-name-input"]) assert.ok(byTestId(named.tree, id), id);
  assert.equal(byTestId(named.tree, "person-name-input").props.contentEditable, "plaintext-only", "typed in place");
  const viewer = ui.drawn(hero(false)).tree;
  assert.ok(!byTestId(viewer, "person-rename") && !byTestId(viewer, "person-name-input"), "a viewer's is a name alone");
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
  const {
    toPersonRowVM,
    PEOPLE_LISTS,
    PEOPLE_LIST_GROUPS,
    peopleListAction,
    GET_YES_ROUTE,
    channelsReady,
    noChannelWords,
  } = await import("@chanlytics/contracts");
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
  // Who can be sent what is a fact of the row as it is built (against the workspace's channels: reach-any.ts), so each of
  // these is built from its answers, not changed after it.
  const lapsedWith = (over, ready = null) =>
    toPersonRowVM({ ...ROW, id: "x", visits: cal({ last: old }), ...over }, TZ, now, null, ready);
  const yes = lapsedWith({ consent: "opted_in", marketing_consent: "opted_in" });
  const talkOnly = lapsedWith({ consent: "opted_in", marketing_consent: null });
  assert.deepEqual(peopleListAction("lapsed", [lapsed, yes]), {
    text: "1 of 2 on this list said yes to offers · an offer reaches them.",
    cta: "Bring them back",
    to: "campaigns/sequences/new:once:to:lapsed",
    enabled: true,
  });
  // Nobody on the list has said yes to offers: the list's own step cannot run, and the step that CAN is the
  // door to that yes. It printed "The phrase and the QR are on Broadcasts" beside a disabled "Win them back".
  assert.deepEqual(peopleListAction("lapsed", [lapsed]), {
    text: "Nobody on this list has said yes to offers yet · an offer reaches only that answer.",
    cta: "Get their yes",
    to: GET_YES_ROUTE,
    enabled: true,
  });
  // A yes to messages is not a yes to offers: the broadcast is still not on offer -- the step is the door
  // to the SECOND yes, which is precisely what this person has not given.
  assert.notEqual(
    peopleListAction("lapsed", [talkOnly]).to,
    "campaigns/sequences/new:once:to:lapsed",
    "a yes to messages is not a yes to offers",
  );
  assert.equal(peopleListAction("lapsed", [talkOnly]).to, GET_YES_ROUTE);
  assert.equal(peopleListAction("lapsed", []).text, "Nobody here right now.");
  assert.equal(peopleListAction("lapsed", []).enabled, false, "an empty list has nothing to fix, so no door");
  // Someone here DID say yes to offers and simply has no number: asking them to "get their yes" would ask for an
  // answer they already gave. The list keeps its own step, waiting, and says what is actually missing.
  const yesNoNumber = lapsedWith({ consent: "opted_in", marketing_consent: "opted_in", phone_e164: null });
  const waiting = peopleListAction("lapsed", [yesNoNumber]);
  assert.equal(waiting.to, "campaigns/sequences/new:once:to:lapsed");
  assert.equal(waiting.enabled, false);
  assert.match(waiting.text, /a recorded yes with a number to send to/);
  // Someone DID say yes and has a number, and the workspace has no channel to send an offer on now (its WhatsApp number is
  // not connected: a text carries none): what is missing is the channel, and the step says so (reach-any.ts).
  const noWhatsApp = channelsReady({
    whatsapp: null,
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: false, domain: false },
  });
  const noChannel = peopleListAction("lapsed", [
    lapsedWith({ consent: "opted_in", marketing_consent: "opted_in" }, noWhatsApp),
  ]);
  assert.deepEqual([noChannel.enabled, noChannel.text], [false, noChannelWords("this list", "marketing")]);
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
      text: "Their yes to offers is the phrase and the QR under Get their yes.",
      cta: "Get their yes",
      to: GET_YES_ROUTE,
      enabled: false,
    },
    "an empty list has answered nothing: its door waits, as before",
  );
  // REGRESSION: once everyone on the list has given that yes, the door asked for an answer they gave (#663's rule).
  // The step is the list's broadcast, in the words every list's broadcast step says it.
  assert.deepEqual(peopleListAction("new_week", [yes]), {
    text: "1 of 1 on this list said yes to offers · an offer reaches them.",
    cta: "Send them a message",
    to: "campaigns/sequences/new:once:to:new_week",
    enabled: true,
  });
  assert.deepEqual(
    peopleListAction("opted_in", [yes]),
    {
      text: "1 of 1 on this list said yes to offers · an offer reaches them.",
      cta: "Message everyone who said yes",
      // The composer, on Everyone: the door names this list, which the composer reads as Everyone, and a door that
      // names a list wins over a draft kept in the tab. `broadcasts` alone is the Sent room, with nothing to write in.
      to: "campaigns/sequences/new:once:to:offers_ok",
      enabled: true,
    },
    "the Can receive offers list's own step",
  );
  // Everyone said it and nobody has a number: the broadcast waits, and says what is missing.
  const answeredNoNumber = peopleListAction("opted_in", [yesNoNumber]);
  assert.deepEqual(
    [answeredNoNumber.to, answeredNoNumber.enabled],
    ["campaigns/sequences/new:once:to:offers_ok", false],
  );
  assert.match(answeredNoNumber.text, /a recorded yes with a number to send to/);
  assert.deepEqual(peopleListAction("booked_week", [week]), {
    text: "Their bookings are on the Calendar.",
    cta: "See the week",
    to: "calendar",
    enabled: true,
  });
  assert.equal(peopleListAction("asked_never_booked", [yes]).to, "campaigns/sequences/new:once:to:asked_never_booked");
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
  // Offers waits in the Columns menu until a member asks for it, so this member has: the heading pressed below is drawn
  // from their column choice, which the whole view carries beside the sort.
  plSaveView("people", { columns: { offers: true } });
  const sent = await onTheWire(async () => {
    const kept = drawn();
    press(find(kept.tree, (n) => classes(n).includes("dtable-sort") && textOf(n).includes("Offers")));
    kept.draw();
  });
  const device = JSON.parse(globalThis.localStorage.getItem("chanlytics-people-view"));
  assert.deepEqual(
    [device.sortBy, device.sortDir, device.columns],
    ["offers", "asc", { offers: true }],
    "on this device: Offers' first press goes Yes first, and the column stays",
  );
  const put = sent.find((r) => r.method === "PUT" && r.route === "views/people");
  assert.deepEqual(
    [put?.body.view.sortBy, put?.body.view.sortDir, Object.keys(put?.body.view)],
    ["offers", "asc", ["sortBy", "sortDir", "columns"]],
    "and on the member's row in the workspace, the whole view",
  );
  assert.deepEqual(put.body.view.columns, { offers: true }, "the sort does not lose the columns");
  // The frame's route (people-route.tsx): the addresses that take a view of People, and what each hands the page.
  const { peopleTakes } = await importSrc("apps/dashboard/src/surfaces/people/chrome.ts");
  for (const param of ["seg:needs_you", "list:sample-regulars", "state:quiet"])
    assert.equal(peopleTakes(param), true, param);
  assert.equal(peopleTakes("c-1"), true, "a person is the page's too, but not a view of People: it draws their page");
  assert.equal(peopleTakes("leads:s-1"), true, "Leads is the page's too: its other scope (decision 0015, step 9)");
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

  // A calendar list is an audience only with a calendar to read it from. Who each audience reaches is its own surface
  // since #1713, and how each is counted its shape (audiences-shape.ts), run here over People's read with a calendar
  // and without (pinned as its text until 26 Nov 2026).
  const { audiencesOf } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/audiences-shape.ts");
  const listsOffered = (calendar) =>
    audiencesOf({
      bc: { ready: null },
      heard: { touched_at: null },
      people: { people: [], calendar, consult_first: false, has_deals: false },
      saved: { lists: [] },
      tz: TZ,
      everyone: [],
    })
      .audiences.filter((a) => a.kind === "list")
      .map((a) => a.id);
  const onlyCalendar = PEOPLE_LISTS.filter((l) => l.needsCalendar && !l.needsConsultFirst && !l.needsDeals).map(
    (l) => l.id,
  );
  assert.ok(onlyCalendar.length > 0, "the lists this pins exist");
  const withCalendarRead = listsOffered({ state: "ok", source: "your calendar" });
  assert.ok(
    onlyCalendar.every((id) => withCalendarRead.includes(id)),
    "with a calendar read, its lists are audiences",
  );
  for (const state of ["none", "unavailable"])
    assert.ok(
      onlyCalendar.every((id) => !listsOffered({ state, source: "your calendar" }).includes(id)),
      `with the calendar ${state}, none of them`,
    );
  // The enrol path counts what the page counted, every page of it: the broadcast's ports over the pool, run in
  // calendar/calendar-counts.test.mjs ("a broadcast's send enrols from the pool the page counts from").
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
  // Still the last contact, but nobody phoned us: the row said "Phoned" over a call we placed (the 2 Oct 2026 audit).
  assert.equal(weCalled.lastContact.label.startsWith("Called them"), true, "but it is still the last contact");
  // people_list's last inbound call (00055, the function redefined since through 00680) is read on the stack by every
  // suite that lists People there (consent/email-offers.db.test.mjs, messages/a-released-person-is-tried-again.db): pinned
  // as 00055's text until 25 Nov 2026. The report counts the same way: run over its reader in
  // calendar/calendar-counts.test.mjs ("the booking report: asked, then booked"), pinned here as its text until 26 Nov 2026.
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
  // surface, is the one write that does). Run with the frame's runner up, which reads what the map names after a write
  // lands (pinned as people-detail.ts's text until 26 Nov 2026).
  const { setPersonConsent, saveView } = await importSrc("apps/dashboard/src/surfaces/people/people-detail.ts");
  const { startSurfaces } = await importSrc("apps/dashboard/src/bridge/surface-runner.ts");
  const stop = startSurfaces([], () => () => {});
  try {
    const readsAfter = async (write) => {
      const wire = await onTheWire(write);
      const at = wire.findIndex((r) => r.method !== "GET");
      return wire
        .slice(at + 1)
        .filter((r) => r.method === "GET")
        .map((r) => r.route);
    };
    for (const [what, write] of [
      ["one person's yes", () => setPersonConsent("p0", said)],
      ["a selection's yes", () => setPersonConsentMany(["p0", "p1"], said)],
      ["a selection's yes to offers", () => setPersonMarketingConsentMany(["p0", "p1"], said)],
    ]) {
      const read = await readsAfter(write);
      // What the map names for a yes, where it is drawn: the threads, Today, Reports (People itself is read where its page is).
      assert.ok(
        read.includes("conversations") && read.includes("today"),
        `${what}: the map's surfaces read again: ${read.join(", ")}`,
      );
    }
    assert.deepEqual(
      await readsAfter(() => saveView("people", { sort: "name" })),
      [],
      "a view save reads nothing again",
    );
  } finally {
    stop();
  }
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
  // The bar's menus are the kit's Menu, found by the words on their button; a group's heading is a `header` item here.
  const { Menu } = await importSrc("apps/dashboard/src/surfaces/kit/menu/menu.tsx");
  const menuOf = (words) => {
    const m = find(bar, (n) => n.type === Menu && textOf(n.props.trigger).trim() === words);
    return {
      items: m.props.groups.flatMap((g) => [
        ...(g.header ? [{ header: g.header }] : []),
        ...g.items.map((i) => ({ ...i, onClick: i.onSelect })),
      ]),
    };
  };
  menuOf("Add to list")
    .items.find((i) => i.label === "New list…")
    .onClick();
  assert.ok(byTestId(picking.draw(), "bulk-list-name"), "a new list is named where it is made");
  // WHICH yes, and how it was given. The bulk action was titled for offers and wrote the conversational column, so a
  // salon recording thirty signed marketing consents changed the one field that does not authorise a promotion.
  const yes = menuOf("Messages").items;
  assert.deepEqual(
    yes
      .filter((i) => i.header)
      .map((i) => i.header)
      .slice(0, 2),
    ["Yes to messages…", "Yes to offers and news…"],
    "both asks are offered, and named, before the receptionist's modes the same menu holds",
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
  // A selection never outlives its view is run, in both scopes: people/people-page/ and leads/finder/page/.
  // The file holds the columns the page shows, nothing invented.
  // Who they are and whether they may be messaged lead every file; after them come the table's shown columns that say
  // something in a file, in the table's order (the Name, Phone and Email columns are those first three, never repeated).
  assert.equal(
    plCsv([], []),
    "Name,Phone,Email,Consent,Offers",
    "with no column shown the file holds who they are and the consent, nothing invented",
  );
  const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
  const { columnsIn, shownColumnsOf, visibilityOf } = await importSrc(
    "apps/dashboard/src/surfaces/kit/table/columns.ts",
  );
  // The columns a desk draws for what the workspace is, with the member's choices (kit/table/columns.ts).
  const plShownColumns = (columns, choices, x) =>
    shownColumnsOf(columnsIn(columns, x), visibilityOf(columns, choices), []);
  assert.equal(
    plCsv([], plShownColumns(PL_COLUMNS, {}, { withCalendar: true })),
    "Name,Phone,Email,Consent,Offers,State,Next step,Last contact,Next appointment",
    "the columns the page shows by default, a calendar's appointments among them, in the workspace's word",
  );
  assert.equal(
    plCsv([], plShownColumns(PL_COLUMNS, {}, { withCalendar: true, word: "meeting" }))
      .split(",")
      .at(-1),
    "Next meeting",
    "in the workspace's word, as the column's heading says it",
  );
  assert.equal(
    plCsv([], plShownColumns(PL_COLUMNS, {}, { withCalendar: false })),
    "Name,Phone,Email,Consent,Offers,State,Next step,Last contact",
    "and no Visits where there is no calendar",
  );
  assert.equal(
    plCsv([], plShownColumns(PL_COLUMNS, { offers: true, email: true, state: false }, { withCalendar: false })),
    "Name,Phone,Email,Consent,Offers,Next step,Last contact",
    "a column the member shows joins the file, one they hide leaves it, and Email is not said twice",
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
      ["Past · Colour", "Calendar"],
    ],
    "newest first, ahead reads as booked, behind as Past: the one word the Calendar's panel says it in",
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
  assert.equal(vm.timeline.find((i) => i.id === "added").text, "Added from the calendar (Colour)");
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
    "the send carries the link into the conversation",
  );
  assert.deepEqual(ui.went, ["inbox/th-1"]);
  assert.ok(
    personActs({ ...chat, openThread: "inbox/th-1", bookingLink: "https://book.example.com/marisas" }).some(
      (a) => a.id === "booking" && a.label === "Send booking link",
    ),
    "the page's More menu offers it, in plain words, once there is a conversation to open (personActs)",
  );
  assert.ok(!chat.acts.some((a) => a.id === "booking"), "and none without a conversation to open it in");
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
  // What a page carries reaches the thread it names, once (inbox/carried-reply.ts, the hand-over every page writes and the
  // composer reads). Run.
  const carriedReply = await importSrc("apps/dashboard/src/surfaces/inbox/carried-reply.ts");
  carriedReply.carryReply("inbox/th-c9", "Hello");
  assert.equal(carriedReply.takeCarriedReply("th-other"), null, "another conversation takes nothing");
  assert.equal(
    carriedReply.takeCarriedReply("th-c9"),
    "Hello",
    "the conversation it names takes it, by its route or its id",
  );
  assert.equal(carriedReply.takeCarriedReply("th-c9"), null, "and only once");
  // The composer takes it, and only into an empty box: the Inbox's reply box drawn (thread/composer.tsx), the state its
  // effect sets drawn again, as React draws it (pinned as its text until 26 Nov 2026).
  const { Composer } = await importSrc("apps/dashboard/src/surfaces/inbox/thread/composer.tsx");
  const thread = { id: "th-c9", real: true, who: "Maria", primaryChannel: "whatsapp", hasChat: true, windowOpen: true };
  const boxOf = (reply) => {
    ui.LR.fresh();
    ui.LR.again(() => Composer({ thread, reply }));
    return ui.LR.find(
      ui.LR.again(() => Composer({ thread, reply })),
      (n) => n.type === "textarea",
    ).props.value;
  };
  carriedReply.carryReply("inbox/th-c9", "Here is the link to book.");
  assert.equal(boxOf(""), "Here is the link to book.", "an empty box takes the words carried in");
  carriedReply.carryReply("inbox/th-c9", "Here is the link to book.");
  assert.equal(boxOf("We open at 9."), "We open at 9.", "a box with words in it keeps them");
  assert.equal(carriedReply.takeCarriedReply("th-c9"), null, "the words carried are taken either way, once");
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
  // The timeline's visits are every one of theirs the season holds, oldest first, the latest sixty of them: a daily
  // appointment of Maria's since 2025 is a season of them (pinned as person-visits.ts's text until 26 Nov 2026).
  const daily = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:daily",
    "SUMMARY:Maria Lopez - Blow-dry",
    "DESCRIPTION:+1 305 555 0134",
    "DTSTART:20250101T150000Z",
    "DTEND:20250101T160000Z",
    "RRULE:FREQ=DAILY",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(daily, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    const { person } = await profileOf({
      tenant_config: [
        { tenant_id: HARBOR, config: { brain: BRAIN, calendar: { ical_url: "https://cal.example/daily.ics" } } },
      ],
    });
    const starts = person.visits.all.map((v) => Date.parse(v.start));
    assert.equal(starts.length, 60, "the latest sixty");
    assert.deepEqual(
      starts,
      [...starts].sort((a, b) => a - b),
      "oldest first",
    );
    assert.ok(starts[0] > Date.now() - 60 * 86_400_000, "the latest of the season, not its first");
  } finally {
    globalThis.fetch = realFetch;
  }
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
  const { DataTable } = await importSrc("apps/dashboard/src/surfaces/kit/table/data-table.tsx");
  const { useTableState } = await importSrc("apps/dashboard/src/surfaces/kit/table/state.ts");
  const { useDataTable } = await importSrc("apps/dashboard/src/surfaces/kit/table/use-data-table.ts");
  const { went } = await peopleHarness();
  const cellOf = (key, p, x = {}) => {
    fresh();
    return again(() => PL_COLUMNS.find((c) => c.key === key).cell(p, { attention: {}, onOpen() {}, ...x }));
  };
  // First contact left the identity cell (22 Sep, Ruben: the row read jam-packed) for a column of its own that is off
  // until a member asks for it (Offers took its place on screen then, and has since gone the same way); it sorts by its day.
  const since = PL_COLUMNS.find((c) => c.key === "since");
  assert.deepEqual(
    [since.label, !!since.sort, since.on],
    ["First contact", true, false],
    "First contact is a column a member may choose, not on screen by default",
  );
  // A number is not initials; it can be named.
  const unnamed = toPersonRowVM({ ...ROW, display_name: null }, TZ, now);
  const bare = cellOf("name", unnamed);
  assert.ok(
    all(bare, (n) => classes(n).includes("face-glyph")).length && byTestId(bare, "row-name-them"),
    "a number is not initials; it can be named",
  );
  assert.equal(byTestId(cellOf("name", row), "row-name-them"), null, "somebody named has initials and nothing to name");
  assert.match(textOf(cellOf("visits", row)), /Last · Thu, Aug 20/, "a visit behind them when nothing is ahead");
  assert.deepEqual(
    { opted_in: offersOf("opted_in"), opted_out: offersOf("opted_out"), unknown: offersOf("unknown") },
    // The word and the dot's tone: a yes the quiet green, a no and not asked plain (8 Oct 2026). No class of the
    // answer's own: "yes" is a class the public consent page styles (app/globals.css).
    { opted_in: ["Yes", "ok"], opted_out: ["No", "plain"], unknown: ["Not asked", "plain"] },
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
    "the link is carried into the conversation's composer",
  );
  assert.deepEqual(went, [`inbox/${talking.threadId}`]);
  assert.equal(byTestId(cellOf("actions", talking, { bookingLink: null, drop: null }), "row-booking-link"), null);
  // The exact time is in the cell's tip, by the business's clock.
  const at = cellOf("last", talking).props["data-tip"];
  assert.equal(at, plWhen(talking.lastContact.at), "the exact time on hover");
  assert.match(at, /^[A-Z][a-z]{2} \d{1,2}, 2026 · \d{1,2}:\d{2} [AP]M$/);
  // A row no longer counts threads and calls ("no messages yet" was that count at zero): the profile has them.
  const NAME = [PL_COLUMNS[0]];
  const ROWS = [talking];
  function Foot({ total }) {
    const state = useTableState({
      scope: "people",
      columns: NAME,
      first: { by: "name", dir: "asc" },
      saved: null,
      landed: true,
      store: { load: () => ({}), save() {}, saver: () => () => {} },
    });
    const model = useDataTable({ state, columns: NAME, data: ROWS });
    return globalThis.React.createElement(DataTable, {
      table: model.table,
      rows: model.rows,
      state,
      columns: NAME,
      ctx: { attention: {}, onOpen() {} },
      total,
      noun: "person",
      sortBy: "name",
      sortDir: "asc",
      onSort() {},
      onOpen() {},
      filtered: false,
      onClearFilters() {},
    });
  }
  const footOf = (total) => {
    fresh();
    return textOf(again(() => globalThis.React.createElement(Foot, { total })));
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
  // The header that sticks is the kit's table's (kit.css, the gallery's Table family holds it); the cards are People's,
  // asked of its sheet as the build's parser reads it (tests/_css.mjs cascadeOf; pinned as clients.css's text until 26
  // Nov 2026): at 900px and under a row is a card of three lines, and over it a table's row.
  const areasAt = (width) =>
    cascadeOf(["apps/dashboard/src/styles/clients.css"], { ...DESK, width }).given(element(".cl-table", "tbody", "tr"))[
      "grid-template-areas"
    ];
  const card = declared('grid-template-areas: "sel name state" "sel last visits" "sel offers offers"');
  assert.deepEqual(
    [areasAt(PHONE.width), areasAt(900), areasAt(901)],
    [card["grid-template-areas"], card["grid-template-areas"], undefined],
    "cards under 900px",
  );
  // The link as the settings hold it, trimmed, on the list's envelope: run over its reader in
  // calendar/calendar-counts.test.mjs ("People's list carries the workspace's own booking link"). The page holds what the
  // envelope carried, run over People's own read (pinned as the three modules' text until 26 Nov 2026):
  const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
  const { bridgeHolds, surfaceValue } = await import("../../shell/_bridge-holds.mjs");
  // Who is looking, at which workspace, in its zone: as the workspace read holds it.
  bridgeHolds({
    who: {
      workspaces: [{ id: HARBOR, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
      activeWorkspaceId: HARBOR,
    },
  });
  const realFetch = globalThis.fetch;
  const envelope = (booking_link) => async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    const data =
      path === "/api/v1/contacts"
        ? {
            people: [],
            page: { q: null, offset: 0, limit: 1000, total: 0, has_more: false },
            calendar: { state: "none", source: "your calendar" },
            ...(booking_link === undefined ? {} : { booking_link }),
            has_deals: false,
          }
        : path === "/api/v1/segments"
          ? { lists: [] }
          : path === "/api/v1/views"
            ? { views: {} }
            : null;
    return data
      ? new Response(JSON.stringify({ ok: true, data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      : new Response(JSON.stringify({ ok: false, error: { code: "not_found" } }), { status: 404 });
  };
  try {
    for (const [said, held] of [
      ["https://book.example.com/marisas", "https://book.example.com/marisas"],
      [null, null],
      [undefined, null],
    ]) {
      globalThis.fetch = envelope(said);
      await peopleOverride.apply();
      assert.equal(surfaceValue("people").bookingLink, held, `the envelope's ${said}: the page's ${held}`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
