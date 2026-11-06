/**
 * Today (apps/dashboard/src/surfaces/today, TSX since decision 0015), EXECUTED on the stub React over the view models the
 * bridge publishes through the seam (surface-values.ts): a line only while a line is down, the day's card
 * (four figures, each with its receipt on hover, focus or a tap; the lines that are not numbers; the period in one
 * line with one door), the queue with one primary verb, the day with its cap, Worth a look with a word for its tone
 * and an Ask door, While you were away over all four queue kinds, a borrowed read that failed saying so, and the
 * composition without a seeded panel. Every sentence with a number is read back from contracts, never typed here.
 * The queue's snooze and resolve run for real over a fetch this test holds (surfaces/inbox/verbs.ts).
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  toTodayVM,
  todayPeriodLine,
  todayRunWords,
  todayRunApproved,
  todayLeaks,
  unreadCount,
  zoneDayKey,
  clockTime,
  toPersonRowVM,
  PEOPLE_LISTS,
  peopleListAction,
  leadQuestionRoute,
  LIFECYCLE_WORDS,
  CHANNELS_DOOR,
} from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  kitPages,
  quiet,
  redrawWanted,
} from "../_legacy-react.mjs";
import { PLAN } from "../_lead-fixtures.mjs";
import { headline as periodHeadline } from "./_headline.mjs";
import { importSrc } from "../_source.mjs";
import { until } from "../shared/_until.mjs";
const { holdAsk } = await importSrc("apps/dashboard/src/surfaces/legacy-verbs.ts");

const ZONE = "America/New_York";
// 4 PM in New York on Friday 18 September 2026.
const NOW = new Date("2026-09-18T20:00:00Z");
const went = [];
const asked = [];
const flashes = [];
const failed = new Set();
const refreshed = [];
installLegacyReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  __surfaceFailed: (k) => failed.has(k),
  __refreshSurface: (k) => refreshed.push(k),
});
// The kit's parts the pages here draw by name or the tests reach (kitParts: the attention row, the record kit ...).
Object.assign(globalThis.window, kitPages);
const { TodayAlertBand } = await import("../../../../apps/dashboard/src/surfaces/today/zones/alert.tsx");
const { TodayHeadFigures } = await import("../../../../apps/dashboard/src/surfaces/today/zones/figures.tsx");
const { TodaySetup } = await import("../../../../apps/dashboard/src/surfaces/today/zones/setup-card.tsx");
const { NeedYou } = await import("../../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { AskFound } = await import("../../../../apps/dashboard/src/surfaces/today/zones/found.tsx");
const { DeskFoot, PhonePins, PhoneSoFar } =
  await import("../../../../apps/dashboard/src/surfaces/today/zones/foot.tsx");
const { DayZone } = await import("../../../../apps/dashboard/src/surfaces/today/zones/day.tsx");
const { useZonesStanding } = await import("../../../../apps/dashboard/src/surfaces/today/zones/head.tsx");
const { standingSaid } = await import("../../../../apps/dashboard/src/surfaces/kit/head/standing.ts");
const { TodayZones } = await import("../../../../apps/dashboard/src/surfaces/today/zones/page.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
// When a run really goes, in the one sentence every receipt says (Today imports it from Campaigns).
const { bcWhenWords } = await import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/when-words.ts");
const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
// The seam's own signal, from the module the TSX reads it through (the stub's own copy is the shell pages'): a surface's rows landed.
const { surfaceMoved: surfaceLanded } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
// The shell's doors and the surfaces Today borrows, which the TSX reads off the window by name when it draws (surfaces/today/shell.ts).
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  askAbout: (a) => asked.push(a),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  useHotkey: () => {},
  refusalToast: (res, lead) => ({ msg: `${lead}: ${res.error}`, tone: "danger" }),
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
// A verb the queue asks of the Inbox goes through the typed client to `fetch`: the workspace it names is this tab's, and
// the refresh a landed write runs reads through the runner (nothing to boot). Any read is refused unless a test holds it.
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refused = () => json(503, { ok: false, error: { code: "unavailable", message: "not read here" } });
globalThis.window.fetch = async () => refused();
const stopRunner = startSurfaces([], () => () => {});
after(() => stopRunner());
const realConsoleError = console.error;
console.error = () => {};
after(() => {
  console.error = realConsoleError;
});
const W = globalThis.window;

/* ------------------------------------ a working day ------------------------------------ */

const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+1 305" },
    { kind: "voice", status: "active", number: "+1 786" },
  ],
  window: {
    days: 1,
    since: "2026-09-18T04:00:00Z",
    since_local: "2026-09-18T00:00:00",
    now_local: "2026-09-18T16:00:00",
  },
  now: {
    escalations_open: 1,
    oldest_open_escalation_at: "2026-09-18T18:20:00Z",
    threads_needing_human: 1,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-18T19:38:00Z",
    last_outbound_at: "2026-09-18T19:38:41Z",
    ...(over.now ?? {}),
  },
  period: {
    messages_in: 9,
    messages_out_ai: 11,
    messages_out_you: 0,
    conversations_active: 6,
    answered_by_ai: 7,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: 34,
    send_failures: 1,
    escalations_new: 1,
    escalation_reasons: { human_token: 1 },
    calls: 3,
    call_seconds: 412,
    call_sentiments: { Positive: 2, Neutral: 1 },
    calls_voicemail: 1,
    new_contacts: 2,
    ...(over.period ?? {}),
  },
  ...(over.channels ? { channels: over.channels } : {}),
});
const msg = (id, dir, body, created_at, over = {}) => ({
  id,
  direction: dir === "in" ? "inbound" : "outbound",
  sender: dir === "in" ? "customer" : "ai",
  type: "text",
  body,
  media: null,
  meta: null,
  status: dir === "in" ? "received" : "delivered",
  channel: "whatsapp",
  created_at,
  ...over,
});
const thread = (id, name, messages, over = {}) => ({
  id,
  state: "open",
  paused_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: null,
  last_message_at: messages.at(-1)?.created_at ?? null,
  contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13055550100" },
  messages,
  ...over,
});
const threads = () => [
  thread("cv-r", "Renata Solís", [
    msg("r1", "in", "Anything Saturday for a gel manicure?", "2026-09-18T13:10:00Z"),
    msg("r2", "ai", "Saturday 10:00 or 2:00 is open.", "2026-09-18T13:10:30Z"),
  ]),
  thread("cv-p", "Priya Nair", [
    msg("p1", "in", "Do you do balayage on Sundays?", "2026-09-18T17:50:00Z"),
    msg("p2", "ai", "We're closed Sundays, but Saturday 1:00 PM is open.", "2026-09-18T17:51:00Z", {
      status: "failed",
    }),
    msg("p3", "ai", "We're closed Sundays, but Saturday 1:00 PM is open.", "2026-09-18T17:52:00Z"),
  ]),
  thread("cv-d", "Dulce Amaro", [
    msg("d0", "in", "Booking for the 12th", "2026-09-09T13:00:00Z", { channel: "sms" }),
    msg("d2", "in", "Can I bring my sister too?", "2026-09-18T17:30:00Z", { channel: "sms" }),
    msg("d3", "ai", "Of course, I'll add her.", "2026-09-18T17:31:00Z", { channel: "sms" }),
  ]),
  thread(
    "cv-a",
    "Ana Reyes",
    [
      msg("a0", "in", "Hi, can I book?", "2026-09-10T14:00:00Z"),
      msg("a2", "in", "I'd rather talk to a person about a refund.", "2026-09-18T18:19:00Z"),
    ],
    { state: "needs_human" },
  ),
];
const escalations = () => [
  {
    id: "e-a",
    conversation_id: "cv-a",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: "2026-09-18T18:20:00Z",
  },
];
const call = (id, over = {}) => ({
  id,
  retell_call_id: `r-${id}`,
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+13475550188",
  from_raw: null,
  to_e164: null,
  started_at: "2026-09-18T19:20:00Z",
  ended_at: "2026-09-18T19:21:00Z",
  duration_ms: 60_000,
  disconnection_reason: "user_hangup",
  sentiment: "Positive",
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about hours.",
  wanted: "Asked about hours.",
  outcome: "handled",
  follow_up: null,
  caller_name: null,
  transcript_object: null,
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  contact: null,
  ...over,
});
const calls = () => [
  call("k1"),
  call("k2", { sentiment: "Neutral" }),
  call("k3", {
    in_voicemail: true,
    sentiment: null,
    summary: null,
    wanted: null,
    outcome: "voicemail",
    started_at: "2026-09-18T19:35:00Z",
    ended_at: "2026-09-18T19:35:30Z",
    duration_ms: 30_000,
  }),
];
const busy = () => toTodayVM(metrics(), threads(), escalations(), calls(), NOW);
/**
 * The playbooks surface with no playbook, as the app publishes it: its rows, and its shape (9 Oct 2026), whose word the
 * day's reminders say.
 */
const noPlaybooks = () => ({ rows: [], shape: { calendar: "feed", hasDeals: false, word: "appointment" } });
const quietDay = () =>
  toTodayVM(
    metrics({
      // The line as the database answers it, a bare E.164 number.
      channels: [{ kind: "whatsapp", status: "active", number: "+12125550142" }],
      now: {
        escalations_open: 0,
        oldest_open_escalation_at: null,
        threads_needing_human: 0,
        last_inbound_at: "2026-09-17T21:39:00Z",
        last_outbound_at: "2026-09-17T21:40:18Z",
      },
      period: {
        messages_in: 0,
        messages_out_ai: 0,
        conversations_active: 0,
        answered_by_ai: 0,
        unanswered_in_window: 0,
        median_reply_seconds_ai: null,
        send_failures: 0,
        escalations_new: 0,
        escalation_reasons: {},
        calls: 0,
        call_seconds: 0,
        call_sentiments: {},
        calls_voicemail: 0,
        new_contacts: 0,
      },
    }),
    [
      thread("cv-old", "Bea Lind", [
        msg("o1", "in", "Thanks!", "2026-09-17T21:39:00Z"),
        msg("o2", "ai", "Any time!", "2026-09-17T21:40:18Z"),
      ]),
    ],
    [],
    [],
    NOW,
  );

/** What Today draws of Reports: the week of 24 messages, up from 19, two of the eighteen who asked on the calendar. */
const headline = (over = {}) =>
  periodHeadline({
    in: 24,
    ai: 21,
    you: 1,
    none: 2,
    calls: 4,
    before: 19,
    booking: { calendar: "ok", days: 7, asked: 18, booked: 2 },
    ...over,
  });
const list = (id, label, count, action = null) => ({ id, label, group: "journey", count, action });
const people = () => ({
  rows: [
    {
      id: "k-cv-a",
      state: "needs_you",
      hasChat: true,
      calls: 0,
      // What the People surface's row says of reaching them (reach-any.ts): said yes to messages, not to offers.
      saidYes: { offers: false, messages: true },
      whyNot: { offers: "no_yes", messages: null },
      consent: {
        state: "opted_in",
        dnc: false,
        label: "Opted in",
        sub: "Reply · Sep 10",
        source: "reply",
        marketing: "unknown",
        marketingSource: null,
        marketingSub: "never asked about offers",
        marketingLabel: "Not asked",
      },
    },
  ],
  lists: [
    list("asked_never_booked", "Asked, never booked", 16, {
      text: "",
      cta: "Text the booking link",
      to: "broadcasts/asked_never_booked",
      enabled: true,
    }),
    list("opted_in", "Said yes to messages", 7, {
      text: "",
      cta: "Get their yes to offers",
      to: "broadcasts/get-yes",
      enabled: true,
    }),
    list("offers_ok", "Can receive offers", 0, null),
    list("quiet", "Quiet 30+ days", 6, { text: "", cta: "Reach out", to: "broadcasts/quiet", enabled: true }),
  ],
  aggregates: { total: 28 },
});
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const run = (id, state, over = {}) => ({
  id,
  // A run is called by its own name (contracts runTitleOf): a campaign's is its campaign's, less the day it ran for.
  name: over.audience?.label ?? "Win-back",
  state,
  playbook_id: "pb-1",
  audience: { label: "Win-back" },
  recipient_count: 3,
  scheduled_for: iso(2 * 3_600_000),
  started_at: null,
  when: "today 6:00 PM",
  counts: { sent: 0, replied: 0 },
  ...over,
});
// The run that went out went out a minute ago: RunsDone keys on the business's day, and three hours ago is yesterday before
// 3 AM. A minute ago is yesterday too in the first minute after midnight, so then it went out a moment ago instead.
const earlierToday = (ms) => {
  const now = Date.now();
  const at = zoneDayKey(now - ms, ZONE) === zoneDayKey(now, ZONE) ? now - ms : now - 1;
  return new Date(at).toISOString();
};
const broadcasts = () => ({
  rows: [
    run("b-wait", "pending_approval"),
    run("b-soon", "scheduled", { audience: { label: "Visit reminder" } }),
    run("b-done", "sent", {
      name: "Save our number",
      playbook_id: null,
      audience: { label: "Everyone" },
      started_at: earlierToday(60_000),
      counts: { sent: 8, replied: 1 },
    }),
  ],
});
const block = (id, t, title, person = null) => ({
  id,
  t,
  dur: 60,
  time: `${t}:00`,
  title,
  person,
  description: null,
  location: null,
  contacts: { phones: [], e164: [], emails: [] },
  guess: null,
  start: "",
  end: "",
});
const calendar = (blocks) => ({
  vm: {
    timezone: ZONE,
    from: "2026-09-18",
    to: "2026-11-19",
    rangeLabel: "",
    monthLabel: "",
    hours: { start: 8, end: 20 },
    days: [
      {
        key: "2026-09-18",
        dow: "Fri",
        date: "Sep 18",
        long: "Friday, September 18",
        dayNum: "18",
        today: true,
        past: false,
        closed: { yes: false, note: null },
        bands: [],
        blocks,
        allDay: [],
        windows: [],
      },
      {
        key: "2026-09-19",
        dow: "Sat",
        date: "Sep 19",
        long: "Saturday, September 19",
        dayNum: "19",
        today: false,
        past: false,
        closed: { yes: false, note: null },
        bands: [],
        blocks: [],
        allDay: [],
        windows: [],
      },
    ],
    today: "2026-09-18",
    now: 16,
    feed: { present: true, state: "ok", line: "", events: blocks.length, source: "Google Calendar" },
    stats: { events: blocks.length, windows: 0, next: "Mon 9:30 AM" },
    rules: "",
    hoursLines: [],
    closuresAhead: [],
    services: [],
    bookingLink: null,
  },
});
const bellRow = (id, kind, title, tone = "", about = null, to = "reports") => ({
  id,
  kind,
  icon: "bell",
  tone,
  unread: true,
  time: "1h",
  title,
  message: "",
  about,
  actions: [{ label: "Open", to, primary: true }],
});

// `today` is the day itself, which the page reads through the seam (setSurfaceValue, surface-values.ts), not off
// `window.TODAY_DATA`; every other key is a surface Today borrows or a verb of the shell, read off the window by name.
const set = (globals) => {
  for (const [k, v] of Object.entries(globals)) {
    if (k === "today") setSurfaceValue("today", v);
    else if (k === "headline") setSurfaceValue("reports_headline", v);
    else if (v === undefined) delete W[k];
    else W[k] = v;
  }
};
const clear = () => {
  set({
    today: undefined,
    __TODAY_SAMPLE: undefined,
    headline: undefined,
    __PEOPLE: undefined,
    __BROADCASTS: undefined,
    __REPLIES: undefined,
    __CALENDAR: undefined,
    __PLAYBOOKS: undefined,
    __SETUP: undefined,
    __GOOGLE: undefined,
    __google: undefined,
    __notifs: undefined,
    __LIVE: undefined,
    __broadcasts: undefined,
  });
  failed.clear();
  refreshed.length = 0;
  went.length = 0;
  asked.length = 0;
  flashes.length = 0;
  W.__DEMO_MODE = false;
};
const draw = (Comp, props = {}) => {
  fresh();
  return W.React.createElement(Comp, props);
};
const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).includes(words));
/** Today's standing said to the frame's head (zones/head.tsx useZonesStanding), drawn as the page draws it. */
function HeadProbe() {
  useZonesStanding();
  return null;
}
/** What Today told the head, drawn over the same cells (`again`), or from nothing (`anew`): its sentence, its Listen. */
const headSaid = (anew = false) => {
  if (anew) fresh();
  again(() => HeadProbe());
  return standingSaid();
};
const headSentence = (anew = false) => headSaid(anew)?.sentence ?? null;
const headListen = (anew = false) => byTestId(headSaid(anew)?.beside ?? null, "today-listen");

/* ------------------------------------ above the work ------------------------------------ */

test("above the work, nothing while every line is up; a line that is down is one band with its one door", () => {
  clear();
  set({ today: busy() });
  const tree = draw(TodayAlertBand);
  assert.equal(byTestId(tree, "today-standing"), null, "the standing line went: no date, no clock, no count");
  assert.equal(byTestId(tree, "today-alert"), null, "and nothing stands in its place while the lines are up");
  assert.equal(textOf(tree), "");
  const down = toTodayVM(
    metrics({ channels: [{ kind: "whatsapp", status: "disconnected", number: "+1 305" }] }),
    [],
    [],
    [],
    NOW,
  );
  set({ today: down });
  const dark = draw(TodayAlertBand);
  const alert = byTestId(dark, "today-alert");
  assert.ok(alert, "a line that is down is the one thing that cannot wait");
  assert.equal(alert.props.role, "alert");
  assert.ok(textOf(alert).startsWith(down.standing.alert), textOf(alert));
  // Its one door (Today in three zones, 2 Nov 2026): where the line is connected again.
  const door = find(alert, (n) => !!n.props?.href && textOf(n).trim() === "Reconnect");
  assert.ok(door, "Reconnect");
  door.props.onClick();
  assert.equal(went.at(-1), CHANNELS_DOOR);
  assert.equal(
    find(dark, (n) => classes(n).includes("live-dot")),
    null,
    "the coral live-dot is the agent's live state, never a status light",
  );
  assert.ok(!/Good (morning|afternoon|evening)/.test(textOf(dark)));
  set({ today: undefined });
  assert.equal(
    draw(TodayAlertBand).rendered,
    null,
    "no seeded hero: without the view model there is nothing above the work",
  );
});

/* ------------------------------------ the day's card ------------------------------------ */

test("what is not a number: never the traffic the figures say, nor a reply that failed (Need you's row) under the head; a run that went out in the day", () => {
  clear();
  set({ today: busy(), headline: headline(), __BROADCASTS: broadcasts() });
  const warned = draw(TodayAlertBand);
  assert.ok(
    !/receptionist answered|reached the phone line|messages? in/.test(textOf(warned)),
    `REGRESSION: the figures say these already: ${textOf(warned)}`,
  );
  assert.ok(
    !/failed to deliver|didn't reach/.test(textOf(warned)),
    "the band is for what stops every customer: a reply that failed is Need you's row, with Try again (today-doors)",
  );
  // A run that went out is said in the day, at the time it went, with what it has earned so far.
  const day = draw(DayZone);
  const run = W.__BROADCASTS.rows[2]; // the run drawn: a second broadcasts() can fall a minute later
  const done = byTestId(day, "today-day-went");
  assert.ok(done, "a run that went out, in the day");
  const at = W.__clock.time(Date.parse(run.started_at));
  assert.ok(textOf(done).includes(`went out at ${at} · ${todayRunWords(run).done.counts}`), textOf(done));
  assert.ok(!textOf(done).includes("—"), "no em dash in a new sentence");
  assert.ok(busy().recap.receipts.length > 0, "the fixture is a day with replies");
  assert.equal(
    all(day, (n) => n.props?.["data-testid"] === "brief-receipt").length +
      all(warned, (n) => n.props?.["data-testid"] === "brief-receipt").length,
    0,
    "no receipt under a summary (7 Oct 2026): what was replied is a question away",
  );
});

test("the figures: four in order, each with its clause; nothing said twice; the receipts under them", () => {
  clear();
  const vm = busy();
  set({ today: vm, __BROADCASTS: broadcasts() });
  const tree = draw(PhoneSoFar);
  const card = byTestId(tree, "today-card");
  assert.ok(card);
  const heading = find(card, (n) => n.type === "h2");
  assert.equal(textOf(heading), "Today so far", "a section with its own heading");
  assert.equal(card.props["aria-labelledby"], heading.props.id);
  // Today so far is a phone's (2 Nov 2026), its four by short names in one row; a desk's four stand in the head (H1, 31
  // Oct 2026), by the same short names, each with its clause and its whole label as its title.
  const short = byTestId(card, "today-figures");
  assert.ok(short, "the card's one row of four");
  assert.ok(textOf(byTestId(short, "today-figure-answered")).includes("answered"), "a figure by its short name");
  const head = draw(TodayHeadFigures);
  const figs = vm.figures.map((f) => byTestId(head, `today-figure-${f.id}`));
  assert.deepEqual(
    figs.map((n) => !!n),
    [true, true, true, true],
  );
  for (const [i, f] of vm.figures.entries()) {
    const said = textOf(figs[i]);
    // A count that could not be read is a dash, never a zero (booked, with no calendar's read here).
    const value = f.value === null ? "–" : String(f.value);
    assert.ok(said.includes(value) && said.includes(f.meta) && figs[i].props.title === f.label, said);
    assert.equal(byTestId(head, `today-receipt-${f.id}`), null, "a receipt waits for a hover, a focus or a tap");
  }
  assert.equal(
    byTestId(card, "today-recap"),
    null,
    "what is not a number is said where it is acted on, never in a list here",
  );
});

test("a receipt opens on hover, focus or a tap, says its why with one door, never repeats the figure, and closes on Escape", () => {
  clear();
  const vm = busy();
  set({ today: vm });
  const first = draw(TodayHeadFigures);
  const fig = byTestId(first, "today-figure-answered");
  fig.props.onMouseEnter();
  const hovered = again(() => W.React.createElement(TodayHeadFigures));
  const receipt = byTestId(hovered, "today-receipt-answered");
  assert.ok(receipt, "hover opens it");
  assert.equal(receipt.props.role, "dialog");
  assert.ok(
    byTestId(byTestId(hovered, "today-figures"), "today-receipt-answered"),
    "drawn in the row of figures, so a phone lays it under the row and a desktop anchors it by its place",
  );
  assert.equal(receipt.props["data-i"], 1, "placed by its place in the row, no style of its own");
  const f = vm.figures.find((x) => x.id === "answered");
  assert.ok(textOf(receipt).includes(f.receipt.text));
  assert.doesNotMatch(
    textOf(find(receipt, (n) => classes(n).includes("tc-receipt-t"))),
    new RegExp(`\\b${f.value}\\b`),
    "the receipt adds to the figure; it never says its number again",
  );
  const door = buttons(receipt, f.receipt.door.label)[0];
  assert.ok(door, "one door");
  press(door);
  assert.equal(went.at(-1), f.receipt.door.to);
  assert.equal(byTestId(hovered, "today-receipt-calls"), null, "one at a time");
  byTestId(hovered, "today-figures").props.onMouseLeave();
  const left = again(() => W.React.createElement(TodayHeadFigures));
  assert.equal(byTestId(left, "today-receipt-answered"), null);
  // A tap or a keyboard: the figure is the button.
  const btn = find(byTestId(left, "today-figure-calls"), (n) => n.type === "button");
  assert.equal(btn.props["aria-expanded"], false);
  press(btn);
  const tapped = again(() => W.React.createElement(TodayHeadFigures));
  assert.ok(byTestId(tapped, "today-receipt-calls"));
  assert.equal(find(byTestId(tapped, "today-figure-calls"), (n) => n.type === "button").props["aria-expanded"], true);
  find(byTestId(tapped, "today-figure-calls"), (n) => n.type === "button").props.onKeyDown({ key: "Escape" });
  assert.equal(
    byTestId(
      again(() => W.React.createElement(TodayHeadFigures)),
      "today-receipt-calls",
    ),
    null,
    "Escape closes",
  );
  // A figure with nothing to add is not a button.
  const thin = toTodayVM(
    metrics({
      period: {
        messages_in: 1,
        answered_by_ai: 1,
        conversations_active: 1,
        messages_out_ai: 1,
        send_failures: 0,
        escalations_new: 0,
        escalation_reasons: {},
        calls: 0,
        call_seconds: 0,
        call_sentiments: {},
        calls_voicemail: 0,
        new_contacts: 0,
      },
    }),
    [],
    [],
    [],
    NOW,
  );
  set({ today: thin });
  const plain = draw(TodayHeadFigures);
  assert.equal(
    find(byTestId(plain, "today-figure-calls"), (n) => n.type === "button"),
    null,
    "no receipt, no button",
  );
});

test("the foot: the last seven days in Reports' own numbers with one door; a failed Reports read says so; nothing while it loads", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const tree = draw(PhoneSoFar);
  const line = byTestId(tree, "today-period");
  assert.equal(textOf(line), todayPeriodLine(headline()).text);
  assert.match(textOf(line), /^Last 7 days: 24 messages \(up from 19\), 88% answered by the receptionist, 4 calls\.$/);
  // The line is the one door (the redesign of 1 Nov 2026): the period card had two, then the card's head had one.
  assert.equal(line.type, "a");
  press(line);
  assert.equal(went.at(-1), "reports");
  assert.equal(buttons(tree, "Reports").length, 0, "no second door to Reports on the card");
  // A desk says it once, in the strip at the page's foot (Today in three zones, 2 Nov 2026).
  assert.equal(textOf(byTestId(draw(DeskFoot), "today-period")), todayPeriodLine(headline()).text);
  set({ headline: undefined });
  const loading = draw(PhoneSoFar);
  assert.equal(byTestId(loading, "today-period"), null);
  assert.equal(byTestId(loading, "today-period-failed"), null, "not read yet is not failed");
});

// Decision 0009: any list is a door on Today, pinned by the member (memberships.views.today.pins). The test of it went
// with While you were away's page (the 3 Nov audit, item 61): the foot draws the pins now.
test("the lists a member pinned are doors in the foot, each with People's count, a dash where it cannot be counted; a list that is gone is left out", async () => {
  clear();
  const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  const S3 = "cccccccc-3333-4333-8333-cccccccccccc";
  const lists = {
    lists: [{ id: "quiet", label: "Quiet 30+ days", count: 4 }],
    saved: [
      { id: S2, name: "VIPs", count: 12, unknown: null },
      { id: S3, name: "Booked soon", count: 0, unknown: "No calendar is read." },
    ],
    views: {
      today: {
        pins: ["seg:quiet", `list:${S2}`, `list:${S3}`, "seg:gone", "list:dddddddd-4444-4444-8444-dddddddddddd"],
      },
    },
  };
  try {
    set({ today: busy(), headline: headline(), __PEOPLE: lists });
    setSurfaceValue("people", lists);
    // People's lists' code, as the foot asks for it while Today loads (foot.tsx listsCode), landed.
    await import("../../../../apps/dashboard/src/surfaces/people/people-lists.ts");
    // The drawn element, a link (the kit Button with the route's door), not the Button that draws it.
    const pinsOf = (tree) => all(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === "today-pin");
    await until(() => pinsOf(draw(PhonePins)).length > 0, "the foot's lists' code, and the pins it draws");
    const pins = pinsOf(draw(PhonePins));
    assert.deepEqual(
      pins.map((p) => textOf(p)),
      ["4Quiet 30+ days", "12VIPs", "–Booked soon"],
      "a count where People has one, a dash where it cannot count, a list that is gone left out",
    );
    assert.equal(pins[1].props["aria-label"], "Open VIPs on People");
    press(pins[1]);
    assert.equal(went.at(-1), `clients/list:${S2}`);
    // A desk's foot holds them beside the week.
    assert.equal(pinsOf(draw(DeskFoot)).length, 3);
    // Nothing pinned: no pins on a phone, and a desk's strip holds the week alone.
    const none = { ...lists, views: {} };
    set({ __PEOPLE: none });
    setSurfaceValue("people", none);
    assert.equal(byTestId(draw(PhonePins), "today-pins"), null);
    const strip = draw(DeskFoot);
    assert.equal(pinsOf(strip).length, 0);
    assert.ok(byTestId(strip, "today-period"), "the week stands alone");
  } finally {
    setSurfaceValue("people", undefined);
    set({ __PEOPLE: undefined });
  }
});

test("a quiet day: the tile is four zeros, and the head says nothing needs you and proves the lines are listening", () => {
  clear();
  const vm = quietDay();
  set({ today: vm, headline: headline() });
  const tree = draw(PhoneSoFar);
  assert.ok(byTestId(draw(TodayHeadFigures), "today-figures"), "the tile whole: four zeros (E3), in the head");
  assert.equal(byTestId(tree, "today-quiet-line"), null, "no sentence in the card: the head says the day");
  assert.match(
    vm.proof,
    /^The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later\.$/,
  );
  const said = textOf(headSentence(true));
  // What is listening, and when the last message came and how fast it was answered (the canvas of 2 Nov 2026).
  assert.equal(said, `${vm.quiet.headline} ${vm.quiet.sub}`, said);
  assert.match(said, /The receptionist is on\. Last message yesterday 5:39 PM, answered in 1m 18s\./);
  // And says first what a quiet day means for the person reading it: nothing waits on them (7 Oct 2026).
  assert.ok(said.startsWith("Nothing needs you."), said);
  // The sentence is the whole of it (7 Oct 2026): no list of lines and their numbers under it, and no second door.
  const page = draw(TodayZones);
  assert.equal(byTestId(page, "brief-quiet-proof"), null);
  assert.equal(buttons(page, "earlier conversation").length, 0);
  // No traffic while a handoff waits: not a quiet day, and no figure counted. The tile stands as four zeros, and the
  // messages zero says when the last one came in.
  const waiting = toTodayVM(
    metrics({
      period: {
        messages_in: 0,
        messages_out_ai: 0,
        conversations_active: 0,
        answered_by_ai: 0,
        unanswered_in_window: 0,
        median_reply_seconds_ai: null,
        send_failures: 0,
        escalations_new: 0,
        escalation_reasons: {},
        calls: 0,
        call_seconds: 0,
        call_sentiments: {},
        calls_voicemail: 0,
        new_contacts: 0,
      },
    }),
    threads().slice(3),
    escalations(),
    [],
    NOW,
  );
  assert.equal(waiting.quiet, null);
  // Nothing counted: the tile drawn whole as on any day (the canvas of 2 Nov 2026), booked a dash where it was not read.
  assert.deepEqual(
    waiting.figures.map((f) => f.value),
    [null, 0, 0, 0],
    "nothing counted: the zeros",
  );
  set({ today: waiting });
  const held = draw(PhoneSoFar);
  assert.ok(byTestId(draw(TodayHeadFigures), "today-figures"), "the four zeros");
  assert.equal(byTestId(held, "today-quiet-line"), null);
  const zero = waiting.figures.find((f) => f.id === "answered");
  assert.match(zero.meta, /^nothing today, the last /);
  assert.ok(
    textOf(byTestId(draw(TodayHeadFigures), "today-figure-answered")).includes(zero.meta),
    "REGRESSION: when the last message came in vanished exactly when an owner needed it",
  );
});

test("the calls read failed: Need you says so where its calls stand, once", () => {
  clear();
  set({ today: toTodayVM(metrics(), threads(), escalations(), null, NOW), __BROADCASTS: { rows: [] } });
  const tree = draw(NeedYou);
  assert.ok(byTestId(tree, "today-calls-failed"));
  assert.equal(all(tree, (n) => String(n.props?.className || "").includes("empty-failed")).length, 1);
  set({ today: busy() });
  assert.equal(byTestId(draw(NeedYou), "today-calls-failed"), null, "a calls read that landed is not failed");
});

/* ------------------------------------ the queue ------------------------------------ */

test("the queue: no count badge over the rows, its groups each with how many, one primary verb, the runs in contracts' words, the approval toast too", async () => {
  clear();
  const approved = { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) };
  set({
    today: busy(),
    __BROADCASTS: broadcasts(),
    __broadcasts: {
      approve: async () => ({ ok: true, data: approved }),
      cancel: async () => ({ ok: true, data: {} }),
    },
  });
  const tree = draw(NeedYou);
  const queue = byTestId(tree, "today-queue");
  assert.equal(
    find(queue, (n) => classes(n).includes("tq-count")),
    null,
    "REGRESSION: a number over the rows that say it",
  );
  // How many need you is the head's sentence (the badge's number), never a second line here: each group says its own.
  assert.equal(
    find(queue, (n) => classes(n).includes("tq-sub")),
    null,
    "no line of parts under the title",
  );
  const group = (id) => textOf(find(byTestId(queue, id), (n) => classes(n).includes("ny-group-n")));
  assert.equal(group("today-group-ok"), "1", "the run waiting for a word: a run that goes on its own waits on no word");
  assert.equal(byTestId(queue, "queue-call"), null, "a call worth a listen waits on nobody: it is Ask found's");
  const rows = all(queue, (n) => classes(n).includes("cl-attn-row"));
  // A row's one coral is its own verb, or, on a row worked in place (decision 0071), the kit's primary in its work.
  const primary = rows.filter((r) =>
    find(
      r,
      (n) =>
        (classes(n).includes("cl-attn-cta") && classes(n).includes("primary")) || classes(n).includes("btn-primary"),
    ),
  );
  assert.equal(primary.length, 1, "the first row carries the page's one primary verb");
  assert.equal(primary[0], rows[0]);
  const waiting = byTestId(queue, "brief-run-row");
  const w = todayRunWords(broadcasts().rows[0]);
  assert.ok(
    textOf(waiting).includes(w.waiting.sentence) && textOf(waiting).includes(w.waiting.status[0]),
    textOf(waiting),
  );
  // Two rows: the person waiting, then the run waiting for a word. The run under its veto window is the day's, at its
  // time (decision 0064), never a row here. Everything fits, and no foot says so: a foot says only what was cut.
  assert.equal(byTestId(queue, "brief-run-soon"), null, "a run that goes on its own is the day's row");
  assert.equal(
    find(queue, (n) => classes(n).includes("tq-foot")),
    null,
    "nothing was cut: no foot",
  );
  assert.equal(all(queue, (n) => classes(n).includes("cl-attn-row")).length, 2, "the card is two rows");
  await press(buttons(waiting, "Approve")[0]);
  const t = todayRunApproved("Win-back", 3, bcWhenWords(approved));
  assert.match(t.rest, /scheduled for/, "the server moved it, and the sentence says when");
  assert.equal(textOf(flashes.at(-1).msg), `${t.lead} ${t.rest}`);
  assert.ok(!textOf(flashes.at(-1).msg).includes("sending now"));
  // The broadcasts read failed: the queue's rows are current, and it says the runs could not be read.
  set({ __BROADCASTS: undefined });
  failed.add("broadcasts");
  const broke = draw(NeedYou);
  assert.match(textOf(byTestId(broke, "today-runs-failed")), /Couldn't read the campaign runs/);
  // `rows` above counted the run's row too (it is an AttnRow as well); the runs are a FailedRead now, so what must stand is the
  // queue's own, less the call worth a listen, which is Ask found's and drawn only when that line is opened.
  assert.equal(
    all(broke, (n) => classes(n).includes("cl-attn-row")).length,
    busy().queue.rows.filter((r) => r.kind !== "call").length,
    "the rows themselves stand",
  );
});

test("a reach-out's run waiting on Today is opened, never approved from the row (D6): its sheet counts and names each send first", async () => {
  clear();
  const approvals = [];
  const opened = [];
  set({
    today: busy(),
    __BROADCASTS: {
      rows: [
        run("b-reach", "pending_approval", { audience: { kind: "reach_out", label: "Movers nearby" } }),
        run("b-wait", "pending_approval"),
      ],
    },
    __broadcasts: {
      approve: async (id) => (approvals.push(id), { ok: true, data: { recipient_count: 3 } }),
      cancel: async () => ({ ok: true, data: {} }),
    },
    __nav: (to) => opened.push(to),
  });
  // Both waiting for an OK are one row (the run review's item 5, the Campaigns wiring review's rule D): it opens the first,
  // whose screen walks the rest, and approves nothing.
  let queue = byTestId(draw(NeedYou), "today-queue");
  const folded = byTestId(queue, "brief-runs-row");
  assert.ok(folded, "two runs waiting for an OK are one row");
  assert.equal(all(queue, (n) => n.props?.["data-testid"] === "brief-run-row").length, 0, "and no row a run");
  assert.ok(textOf(folded).includes("2 runs wait for your OK"), textOf(folded));
  assert.equal(buttons(folded, "Approve").length, 0, "no one-tap send of a reach-out from Today, folded or not");
  went.length = 0;
  press(buttons(folded, "Open")[0]);
  assert.deepEqual(went, ["campaigns/sequences/b-reach/runs/b-reach"], "the first, at its home");
  // A reach-out's run alone is opened, never approved from the row (D6).
  set({
    __BROADCASTS: {
      rows: [run("b-reach", "pending_approval", { audience: { kind: "reach_out", label: "Movers nearby" } })],
    },
  });
  queue = byTestId(draw(NeedYou), "today-queue");
  const reach = byTestId(queue, "brief-run-row");
  assert.equal(buttons(reach, "Approve").length, 0, "no one-tap send of a reach-out from Today");
  assert.equal(buttons(reach, "Open").length, 1, "the row opens the run");
  assert.equal(buttons(reach, "See who's on it").length, 0, "one door, not the same door twice");
  // A playbook's run alone keeps its Approve, in the one word every screen says for it (decision 19): with its count.
  set({ __BROADCASTS: { rows: [run("b-wait", "pending_approval")] } });
  const playbook = byTestId(byTestId(draw(NeedYou), "today-queue"), "brief-run-row");
  assert.equal(buttons(playbook, "Approve").length, 1);
  assert.equal(textOf(buttons(playbook, "Approve")[0]), LIFECYCLE_WORDS.ledger.approve(3));
  assert.equal(textOf(buttons(playbook, "Approve")[0]), "Approve all 3");
  assert.deepEqual(approvals, [], "nothing was approved by drawing the card");
});

test("a run's Approve from the queue is said the moment the server takes it, with what it scheduled, not after the runs are read again", async () => {
  clear();
  let reread = () => {};
  const accepted = { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) };
  set({
    today: busy(),
    __BROADCASTS: broadcasts(),
    __broadcasts: {
      approve: (_id, opts = {}) => {
        if (opts.onAccepted) opts.onAccepted(accepted);
        return new Promise((r) => {
          reread = () => r({ ok: true, data: accepted });
        });
      },
      cancel: async (id, opts = {}) => {
        canceled.push(id);
        if (opts.onAccepted) opts.onAccepted({ was: "scheduled" });
        return { ok: true, data: { was: "scheduled" } };
      },
    },
  });
  const canceled = [];
  const waiting = byTestId(byTestId(draw(NeedYou), "today-queue"), "brief-run-row");
  const done = press(buttons(waiting, "Approve")[0]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(flashes.length, 1, "said at acceptance");
  const t = todayRunApproved("Win-back", 3, bcWhenWords(accepted));
  assert.equal(textOf(flashes[0].msg), `${t.lead} ${t.rest}`);
  reread();
  await done;
  assert.equal(flashes.length, 1, "and said once");
  // The way back, as Send once's toast offers it: the approved run goes in an hour, so it is canceled, never yet stopped.
  assert.equal(flashes[0].action?.label, "Cancel it", "REGRESSION: an approval's toast offered no way back");
  await flashes[0].action.onClick();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(canceled, ["b-wait"], "the run just approved");
  assert.match(textOf(flashes.at(-1).msg), /canceled — nothing will send/);
});

test("REGRESSION (S9-10): a run's Approve on Today waits while it is on its way -- a second press approved again, as Sent's once did", async () => {
  clear();
  const approvals = [];
  let land = () => {};
  set({
    today: busy(),
    __BROADCASTS: broadcasts(),
    __broadcasts: {
      approve: (id) => {
        approvals.push(id);
        return new Promise((r) => {
          land = () => r({ ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } });
        });
      },
      cancel: async () => ({ ok: true, data: {} }),
    },
  });
  const row = () =>
    byTestId(
      byTestId(
        again(() => W.React.createElement(NeedYou)),
        "today-queue",
      ),
      "brief-run-row",
    );
  const first = byTestId(byTestId(draw(NeedYou), "today-queue"), "brief-run-row");
  const done = press(buttons(first, "Approve")[0]);
  press(buttons(first, "Approve")[0]);
  assert.equal(approvals.length, 1, "REGRESSION: the second press asked the server again, which refused it");
  const waiting = buttons(row(), "Approve")[0];
  assert.equal(waiting.props.disabled, true, "the verb waits while the first is on its way");
  assert.equal(waiting.props["aria-busy"], true);
  land();
  await done;
  assert.equal(buttons(row(), "Approve")[0].props.disabled, false, "and is offered again once it has landed");
  assert.equal(approvals.length, 1);
});

test("a waiting run whose day has passed is no row of Need you: nobody is asked for what the verb refuses, and the sweep skips it", async () => {
  // approveRun refuses a playbook's run on a later day than it was made for (contracts runApprovalRefusal). Today's row
  // offered Approve all the same, and the press answered "Not approved" over a 409. Since Today in three zones (2 Nov 2026)
  // such a run is not Today's at all: it waits on nobody, the hourly sweep skips it, and Sent and the Inbox say why.
  clear();
  const approvals = [];
  const stale = zoneDayKey(Date.now() - 3 * 86_400_000, ZONE);
  const rows = broadcasts().rows.map((r) => (r.id === "b-wait" ? { ...r, run_for: stale } : r));
  set({
    today: busy(),
    __BROADCASTS: { ...broadcasts(), rows },
    __broadcasts: {
      approve: async (id) => {
        approvals.push(id);
        return { ok: true, data: {} };
      },
      cancel: async () => ({ ok: true, data: {} }),
    },
  });
  const queue = byTestId(draw(NeedYou), "today-queue");
  assert.equal(byTestId(queue, "brief-run-row"), null, "REGRESSION: a row over a run the verb refuses");
  assert.equal(buttons(queue, "Approve").length, 0);
  assert.equal(byTestId(queue, "today-group-ok"), null, "nothing waits for your OK");
  // The words the runs' own pages say it in are contracts' still.
  const w = todayRunWords(rows[0]);
  assert.deepEqual([w.late.meta, w.late.status], ["Campaign · too late to approve", ["Too late to approve"]]);
  assert.deepEqual(approvals, []);
  // The bell's row about one run says where it goes.
  const { verbForRoute } = await import("@chanlytics/contracts");
  assert.deepEqual(
    [verbForRoute("campaigns/sequences/b-wait/runs/b-wait"), verbForRoute("broadcasts")],
    ["Open the run", "Open Sequences"],
  );
});

test("every person is a row of their group, the run waiting for a word in To decide after them; the foot counts only what is cut", () => {
  clear();
  // Four people waiting, all under a week: the first is Up next, the other three wait on you.
  const vm = busy();
  const first = vm.queue.rows[0];
  vm.queue.rows = ["one", "two", "three", "four"].map((w) => ({
    ...first,
    id: `q-${w}`,
    who: `Person ${w}`,
    cta: { ...first.cta },
    also: null,
  }));
  vm.queue.more_people = 0;
  set({ today: vm, __BROADCASTS: broadcasts() });
  const queue = byTestId(draw(NeedYou), "today-queue");
  const rows = all(queue, (n) => classes(n).includes("cl-attn-row"));
  assert.equal(rows.length, 5, "four people and the run");
  assert.deepEqual(
    rows.map((r) => r.props["data-testid"]).map((d) => d.startsWith("queue-")),
    [true, true, true, true, false],
    "the people first",
  );
  assert.equal(rows[4].props["data-testid"], "brief-run-row", "then the run waiting for a word, in To decide");
  const count = (id) => textOf(find(byTestId(queue, id), (n) => classes(n).includes("ny-group-n")));
  assert.deepEqual(
    all(byTestId(queue, "today-group-next"), (n) => classes(n).includes("cl-attn-who")).map(textOf),
    ["Person one"],
    "Up next is one, and says no count",
  );
  assert.equal(
    find(byTestId(queue, "today-group-next"), (n) => classes(n).includes("ny-group-n")),
    null,
  );
  assert.equal(count("today-group-waiting"), "3");
  assert.equal(count("today-group-ok"), "1");
  // Nothing was cut, and no foot says so; the run about to go is the day's.
  assert.equal(
    find(queue, (n) => classes(n).includes("tq-foot")),
    null,
  );

  // Nothing is dropped in silence: the people past the five drawn are counted, with the door to the rest.
  vm.queue.rows = ["one", "two", "three", "four", "five", "six", "seven", "eight"].map((w) => ({
    ...first,
    id: `q-${w}`,
    who: `Person ${w}`,
    conversationId: `cv-${w}`,
    cta: { ...first.cta },
    also: null,
  }));
  set({ today: vm });
  const more = byTestId(draw(NeedYou), "today-queue");
  assert.match(textOf(find(more, (n) => classes(n).includes("tq-foot"))), /^2 more waiting/);
  assert.doesNotMatch(textOf(find(more, (n) => classes(n).includes("tq-foot"))), /more to decide/);
});

test("a search waiting on you is a row of the queue like a person: its name, its wait, its question, one Answer that opens it", () => {
  clear();
  // Stopped to ask at 1 PM, three hours before NOW.
  const waiting = {
    id: "s-wait",
    name: "Personal trainers in Austin",
    asked: PLAN.asked,
    asked_on: "2026-09-17T15:00:00Z",
    plan: PLAN,
    plan_version: 1,
    round: {
      id: "rd1",
      seq: 1,
      purpose: "find",
      state: "waiting_on_owner",
      ending: null,
      question: { sentence: "Most of the first 25 are chain gyms. Include them?", criterion_key: "chains" },
      target: 20,
      counted: 25,
      qualified: 20,
      review: 0,
      excluded: 5,
      emails_checked: 0,
      with_phone: 18,
      ending_pending: false,
      waiting_since: "2026-09-18T17:00:00Z",
      cost_usd: 1.2,
      ended_at: null,
      undo_op_id: null,
      undo_version: null,
      nearby: [],
    },
  };
  const vm = toTodayVM(metrics(), threads(), escalations(), calls(), NOW, [waiting]);
  set({ today: vm, __BROADCASTS: { rows: [] } });
  const queue = byTestId(draw(NeedYou), "today-queue");
  const row = byTestId(queue, "queue-search");
  assert.ok(row, "the search is drawn by the same row as every person");
  assert.equal(textOf(find(row, (n) => classes(n).includes("cl-attn-who"))), waiting.name);
  assert.ok(textOf(row).includes("3h"), `how long it has waited: ${textOf(row)}`);
  assert.ok(textOf(row).includes(waiting.round.question.sentence), "the question, as the search asked it");
  assert.ok(
    find(byTestId(queue, "today-group-ok"), (n) => n === row),
    "a question waits for your OK, as a run does",
  );
  press(buttons(row, "Answer")[0]);
  assert.equal(went.at(-1), leadQuestionRoute("s-wait"), "straight to the search, open on its question");
});

/* ------------------------------------ the day ------------------------------------ */

test("the day listens for what it draws: the calendar, the playbooks, the runs and Today's own read, and not People", () => {
  // The day drew once with the calendar and never again where it heard nothing else land. Who is coming and when they
  // were last in are the board's own read's now (calendar-person-facts.ts), and who comes back is Today's (Today in three
  // zones, 2 Nov 2026): People's book is no read of the day's. The day, Listen's words and To do read the one derivation
  // (zones/day-vm.ts useDayVm).
  clear();
  set({ today: busy(), __CALENDAR: calendar([block("b9", 9, "Slot 9")]), __PLAYBOOKS: noPlaybooks() });
  draw(DayZone);
  for (const key of ["calendar", "playbooks", "broadcasts", "today"]) {
    quiet();
    surfaceLanded(key);
    assert.ok(redrawWanted(), `the day redraws when ${key} lands`);
  }
  // A surface nothing here draws from is none of its business.
  for (const key of ["people", "billing"]) {
    quiet();
    surfaceLanded(key);
    assert.ok(!redrawWanted(), `the day does not redraw for ${key}`);
  }
});

test("each band of Today is drawn again when a surface it draws from lands, and by no other's", () => {
  // The shell drew whole on every surface's read; a band now names the surfaces it draws (useSurface) and moves on those.
  clear();
  set({ today: busy(), __CALENDAR: calendar([block("b9", 9, "Slot 9")]), __PLAYBOOKS: noPlaybooks() });
  const bands = [
    ["the alert line", TodayAlertBand, ["today"]],
    ["Today so far", PhoneSoFar, ["today", "reports_headline"]],
    ["the setup card", TodaySetup, ["setup"]],
    // Need you is Today's own rows, the runs, and To do's steps (People's) and visits to mark (the Calendar's).
    ["Need you", NeedYou, ["today", "broadcasts", "people", "calendar"]],
    ["the day", DayZone, ["broadcasts", "calendar", "playbooks", "today"]],
    ["Ask found", AskFound, ["reports_headline", "people", "today", "ask_morning"], { wide: false }],
    ["the pins", PhonePins, ["people"]],
  ];
  for (const [name, Band, drawnFrom, props] of bands) {
    draw(Band, props);
    for (const key of drawnFrom) {
      quiet();
      surfaceLanded(key);
      assert.ok(redrawWanted(), `${name} is drawn again when ${key} lands`);
    }
    for (const stranger of ["billing", "inbox", "conversations"].filter((s) => !drawnFrom.includes(s))) {
      quiet();
      surfaceLanded(stranger);
      assert.ok(!redrawWanted(), `${name} is not drawn again for ${stranger}`);
    }
  }
});

/* ------------------------------------ Ask found ------------------------------------ */

/** The rows Ask found draws, each by what it is (its testid's source), and a row's parts. */
const foundRowsOf = (tree) =>
  all(tree, (n) => /^today-found-(rule|noticed|call|tried|idea)$/.test(n.props?.["data-testid"] ?? ""));
const tagOf = (row) => textOf(find(row, (n) => classes(n).includes("tz-idea-kind")));
const sentenceOf = (row) => byTestId(row, "today-found-sentence");
const actOf = (row) => byTestId(row, "today-found-act");

const withNobodyAnswered = () =>
  toTodayVM(
    metrics(),
    [...threads(), thread("cv-q", "Quinn Lowe", [msg("q1", "in", "Anyone there?", "2026-09-18T17:30:00Z")])],
    escalations(),
    calls(),
    NOW,
  );
test("Ask found ranks what the workspace's own counts say first: each row its tag, its one door and its sentence, the arithmetic and Not today on a press, three drawn and the rest said", () => {
  clear();
  const vm = withNobodyAnswered();
  set({ today: vm, headline: headline(), __PEOPLE: people() });
  // Every rule that holds, not the old pane's two (Today in three zones, 2 Nov 2026): Ask found ranks and draws three.
  const { rows: rules } = todayLeaks(headline(), people(), vm.noReply, Number.POSITIVE_INFINITY);
  assert.ok(
    rules.length > 3,
    `the fixture holds more rules than Ask found draws: ${rules.map((l) => l.id).join(", ")}`,
  );
  const ranked = [...rules.filter((l) => l.tone === "warn"), ...rules.filter((l) => l.tone !== "warn")];
  const tree = draw(AskFound, { wide: false });
  const pane = byTestId(tree, "today-ask-found");
  assert.ok(pane, "Ask found is a zone of its own");
  const rows = foundRowsOf(pane);
  assert.equal(rows.length, 3, "three drawn");
  // The rest: the rules past three, and the calls worth a listen the day holds, ranked after them.
  const calls = vm.queue.rows.filter((r) => r.kind === "call" || r.kind === "tried").length;
  assert.match(textOf(pane), new RegExp(`and ${rules.length + calls - 3} more`), "the rest are said, never dropped");
  for (const [i, row] of rows.entries()) {
    const l = ranked[i];
    assert.equal(row.props["data-testid"], "today-found-rule", `${l.id}: a rule's row`);
    assert.equal(tagOf(row), l.tag, "what it is, in a word");
    assert.equal(textOf(sentenceOf(row)), l.text, "its sentence, the count's own");
    assert.equal(textOf(actOf(row)).trim(), l.cta.label, "its one door");
    assert.equal(sentenceOf(row).props["aria-expanded"], false, "the arithmetic waits behind the sentence");
  }
  // The first row's sentence, pressed: its arithmetic, in the row's own words, and Not today beside it.
  press(sentenceOf(rows[0]));
  const opened = foundRowsOf(again(() => W.React.createElement(AskFound, { wide: false })));
  assert.equal(sentenceOf(opened[0]).props["aria-expanded"], true);
  assert.ok(textOf(opened[0]).includes(ranked[0].math), textOf(opened[0]));
  assert.ok(byTestId(opened[0], "today-found-rest"), "Not today, beside the why");
  assert.equal(byTestId(opened[1], "today-found-rest"), null, "and only on the row pressed");
  // Ask why beside it: the row's own words and its arithmetic go to Ask (the AskFound board: "Ask why stays").
  press(byTestId(opened[0], "today-found-ask"));
  assert.deepEqual(asked.at(-1), { prompt: ranked[0].ask }, "REGRESSION: a rule's row had lost Ask why");
  // Who a rule names opens with it, each a door to their page, under the words that say who they are.
  const naming = ranked.slice(0, 3).findIndex((l) => l.people.length > 0);
  assert.ok(naming >= 0, "the fixture's rules name someone");
  press(sentenceOf(foundRowsOf(again(() => W.React.createElement(AskFound, { wide: false })))[naming]));
  const named = byTestId(
    foundRowsOf(again(() => W.React.createElement(AskFound, { wide: false })))[naming],
    "today-found-people",
  );
  for (const p of ranked[naming].people) assert.ok(textOf(named).includes(p.name), `${p.name} is named`);
  if (ranked[naming].peopleLead) assert.ok(textOf(named).includes(ranked[naming].peopleLead));
  press(buttons(named, ranked[naming].people[0].name)[0]);
  assert.equal(went.at(-1), ranked[naming].people[0].to);
  // Its door goes where the count is.
  press(actOf(opened[0]));
  assert.equal(went.at(-1), ranked[0].cta.to);
  // Nothing read yet, nothing failed: a pane with nothing to rank draws nothing.
  set({ today: undefined, headline: undefined, __PEOPLE: undefined });
  assert.equal(byTestId(draw(AskFound, { wide: false }), "today-ask-found"), null, "nothing to rank, no pane");
});

test("REGRESSION: Ask found over People's real rows -- a yes to offers with no number to send one to is not 'nobody has said yes', and there is no door to ask for it again", () => {
  clear();
  const at = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  const row = (id, name, over = {}) =>
    toPersonRowVM(
      {
        id,
        display_name: name,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
        consent: "opted_in",
        consent_source: "in_person",
        consent_updated_at: at(20),
        dnc: false,
        marketing_consent: null,
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
        channels: ["whatsapp"],
        conversation_count: 1,
        escalation_count: 0,
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        latest_conversation_id: null,
        latest_state: "open",
        latest_paused_until: null,
        latest_assignee_user_id: null,
        latest_snooze_until: null,
        latest_wa_inbound_at: null,
        last_message_at: at(3),
        last_message_direction: "inbound",
        last_message_sender: "customer",
        last_inbound_text: "Thanks!",
        last_inbound_at: at(3),
        last_call_at: null,
        call_count: 0,
        call_seconds: 0,
        first_contact_at: at(30),
        earliest_row_at: at(30),
        has_backfill: false,
        has_chat: true,
        queued_reply_at: null,
        ...over,
      },
      ZONE,
      NOW,
    );
  const rows = [
    row("p1", "Rosa Diaz", { phone_e164: "+13055550101" }),
    row("p2", "Mia Chen", { phone_e164: "+13055550102" }),
    row("p3", "Ivy Park", { phone_e164: "+13055550103" }),
    // Wrote in by email and said yes to both there: an address, and no number.
    row("p4", "Ana Reyes", {
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: at(20),
    }),
  ];
  // The People surface as the bridge publishes it (surface-data.ts publishPeople), with no calendar.
  const P = {
    rows,
    lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar).map((l) => {
      const members = rows.filter(l.test);
      return {
        id: l.id,
        label: l.label,
        group: l.group,
        count: members.length,
        ids: members.map((r) => r.id),
        action: peopleListAction(l.id, members),
      };
    }),
    aggregates: { total: rows.length },
  };
  // A week that booked and answered, so the reach row is the rule that stands.
  const R = headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } });
  set({ today: busy(), headline: R, __PEOPLE: P });
  const want = todayLeaks(R, P).rows.find((l) => l.id === "unreachable");
  assert.ok(want, "nobody can be sent an offer: the rule stands");
  const reach = foundRowsOf(draw(AskFound, { wide: false })).find((r) => textOf(sentenceOf(r)) === want.text);
  assert.ok(reach, "its row in Ask found");
  assert.ok(
    !/has said yes to offers/.test(textOf(reach)),
    `REGRESSION: Ana said yes to offers, and the row said nobody had: ${textOf(reach)}`,
  );
  assert.equal(textOf(actOf(reach)).trim(), "See them", "REGRESSION: a door asking Ana for the yes she gave");
  press(actOf(reach));
  assert.equal(went.at(-1), "clients/seg:opted_in", "the number is People's list, and the door opens it");
});

test("Ask found, in every workspace: the consultations with nothing after them are a rule's row, the count's own words, its door the Pipeline", () => {
  clear();
  const DAY = 86_400_000;
  // The page asks contracts with the clock it runs on, so the consultations ended within the last week of now.
  const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
  const consulted = (id, name, days) =>
    toPersonRowVM(
      {
        id,
        display_name: name,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
        consent: "opted_in",
        consent_source: "in_person",
        consent_updated_at: ago(20),
        dnc: false,
        marketing_consent: null,
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
        channels: ["whatsapp"],
        conversation_count: 1,
        escalation_count: 0,
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        latest_conversation_id: null,
        latest_state: "open",
        latest_paused_until: null,
        latest_assignee_user_id: null,
        latest_snooze_until: null,
        latest_wa_inbound_at: null,
        last_message_at: ago(days + 1),
        last_message_direction: "inbound",
        last_message_sender: "customer",
        last_inbound_text: "See you then",
        last_inbound_at: ago(days + 1),
        last_call_at: null,
        call_count: 0,
        call_seconds: 0,
        first_contact_at: ago(30),
        earliest_row_at: ago(30),
        has_backfill: false,
        has_chat: true,
        queued_reply_at: null,
        visits: {
          timezone: ZONE,
          source: "Google Calendar",
          state: "ok",
          next: null,
          last: {
            id: `v-${id}`,
            start: new Date(Date.parse(ago(days)) - 3_600_000).toISOString(),
            end: ago(days),
            title: "Consultation",
            all_day: false,
            via: "phone",
            consultation: true,
          },
        },
      },
      ZONE,
      new Date(),
    );
  const rows = [consulted("p-b", "Bea Ortiz", 2), consulted("p-a", "Abel Cruz", 4), consulted("p-c", "Cora Diaz", 1)];
  const P = { rows, lists: [], aggregates: { total: rows.length } };
  // A week that booked and answered, so the consultations are the one rule.
  const R = headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } });
  set({ today: busy(), headline: R, __PEOPLE: P });
  const want = todayLeaks(R, P).rows.find((l) => l.id === "consults-waiting");
  assert.ok(want, "three consultations this week, nothing after any");
  assert.equal(want.text, "3 consultations in the last week with nothing booked or proposed since.");
  const row = foundRowsOf(draw(AskFound, { wide: false })).find((r) => textOf(sentenceOf(r)) === want.text);
  assert.ok(row, "the row is drawn");
  assert.equal(tagOf(row), "Next step");
  press(actOf(row));
  assert.equal(went.at(-1), "clients/pipeline", "the door is the Pipeline, whose number the row re-prints");
});

/* ------------------------------------ since you looked ------------------------------------ */

test("Since you looked: one line under the head's sentence, what the receptionist answered and the bell's news since the member looked, opened in place", () => {
  clear();
  const seen = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const last = { who: "Ana Torres", text: "Saturday at 10 works.", at: new Date(Date.now() - 600_000).toISOString() };
  const vm = toTodayVM(metrics(), threads(), escalations(), calls(), NOW, null, {
    since: { seen_at: seen, answered: { count: 6, last } },
  });
  // The bell's news since then: a review. A row from before the member looked is not news.
  const rows = [
    { ...bellRow("n:1", "review", "1 new rating on Google", "ok"), at: Date.now() - 3_600_000, message: "Five stars" },
    { ...bellRow("n:0", "review", "An older rating", "ok"), at: Date.now() - 5 * 3_600_000 },
  ];
  let marked = 0;
  const api = {
    feed: () => rows,
    onChange: () => () => {},
    read() {},
    dismiss() {},
    seenAll: () => void (marked += 1),
    unread: () => unreadCount(rows),
    older: () => 0,
  };
  set({ today: vm, __notifs: api });
  const line = byTestId(headSaid(true)?.after ?? null, "today-since");
  assert.ok(line, "the line under the sentence");
  assert.match(textOf(line), /^Since .+6 answered.*1 review/, textOf(line));
  assert.equal(byTestId(headSaid()?.after ?? null, "today-since-list"), null, "closed until pressed");
  press(line);
  const list = byTestId(headSaid()?.after ?? null, "today-since-list");
  assert.ok(list, "opened in place");
  assert.match(textOf(list), /The receptionist answered 6/);
  assert.match(textOf(list), /Last, to Ana Torres: “Saturday at 10 works\.”/);
  assert.match(textOf(list), /1 new rating on Google/);
  assert.doesNotMatch(textOf(list), /An older rating/, "before the member looked is not news");
  assert.equal(marked, 0, "opening the line marks nothing seen: the bell's close is the member looking");
  // A member who never looked: no line.
  set({
    today: toTodayVM(metrics(), threads(), escalations(), calls(), NOW, null, {
      since: { seen_at: null, answered: null },
    }),
  });
  assert.equal(byTestId(headSaid(true)?.after ?? null, "today-since"), null);
});

/* ------------------------------------ the mockup ------------------------------------ */

// The mockup's sample of Today's borrowed surfaces (`window.__TODAY_SAMPLE`) is deleted (decision 0015, step 4): the
// standalone mockup no longer draws Today, so a demo session's sample is no source of anything. What is left of this
// test is its second half, which still holds as it was, and the first half turned round.
test("the mockup no longer draws Today: a demo session's sample is not read, the borrowed surfaces come from the bridge's names alone", () => {
  clear();
  const bell = {
    feed: () => [bellRow("n:1", "review", "1 new rating on Google", "ok")],
    onChange: () => () => {},
    read() {},
    dismiss() {},
    seenAll() {},
    unread: () => 1,
    older: () => 0,
  };
  set({
    today: busy(),
    __TODAY_SAMPLE: {
      __PEOPLE: people(),
      __BROADCASTS: broadcasts(),
      __CALENDAR: calendar([block("b9", 9, "Gloss")]),
      __PLAYBOOKS: noPlaybooks(),
      __clock: W.__clock,
      __notifs: bell,
    },
  });
  W.__DEMO_MODE = true;
  const demo = draw(TodayZones);
  assert.ok(byTestId(demo, "today-queue"), "today-queue: its own view model still draws");
  for (const id of ["today-day", "today-period", "brief-run-row", "today-day-went", "today-pin", "today-found-rule"])
    assert.equal(byTestId(demo, id), null, `${id}: not drawn from the sample, which nothing reads any more`);
  for (const name of ["__PEOPLE", "__BROADCASTS", "__CALENDAR", "__PLAYBOOKS", "__notifs"])
    assert.equal(
      W[name],
      undefined,
      `${name}: the mockup's other pages switch to their real variants on the bridge's names`,
    );
  // A workspace never reads the sample: the same globals outside a demo session draw nothing borrowed.
  W.__DEMO_MODE = false;
  const real = draw(TodayZones);
  for (const id of ["today-day", "today-period", "brief-run-row", "today-pin", "today-found-rule"])
    assert.equal(byTestId(real, id), null, `${id}: never from the sample outside a demo`);
  assert.ok(byTestId(real, "today-queue"), "its own view model still draws");
});

/* ------------------------------------ the composition ------------------------------------ */

test("the page is its bands and nothing seeded", () => {
  clear();
  set({
    today: busy(),
    headline: headline(),
    __PEOPLE: people(),
    __BROADCASTS: broadcasts(),
    __CALENDAR: calendar([block("b9", 9, "Gloss")]),
    __PLAYBOOKS: noPlaybooks(),
    __notifs: {
      feed: () => [],
      onChange: () => () => {},
      read() {},
      dismiss() {},
      seenAll() {},
      unread: () => 0,
      older: () => 0,
    },
  });
  W.__DEMO_MODE = true;
  const tree = draw(TodayZones);
  const order = ["today-queue", "today-day", "today-ask-found", "today-foot"].map((id) => byTestId(tree, id));
  assert.ok(order.every(Boolean), "every zone: Need you, the day, Ask found, and the strip under them");
  assert.equal(byTestId(tree, "today-card"), null, "Today so far is a phone's: a desk's four figures are in the head");
  const names = all(tree, (n) => typeof n.type === "function").map((n) => n.type.name);
  for (const seeded of [
    "NowPlayingRail",
    "TrustReview",
    "SegmentPulse",
    "AgentFleet",
    "AmbientDock",
    "HeroBriefSeed",
    "AgentCommandSeed",
    "TodayPulse",
    "TodayJourney",
    "PulseArc",
    "BriefBeats",
    "TodayBriefPane",
    "TodayGoing",
  ])
    assert.ok(!names.includes(seeded), `${seeded} is gone from Today`);
  const name = (c) => (typeof c.type === "function" ? c.type.name : String(c.props.className));
  // What is left to set up, with what came in before Chanlytics (decision 0073, T-today), is one card in the work's column,
  // never across the page (canvas R10): under Need you while someone waits on you. What goes on its own today is the
  // day's, at its time (decision 0064). What Ask would do is Ask found's, under the day (Today in three zones, 2 Nov 2026):
  // nothing it suggests outranks a person who has been waiting (decision 0070).
  const work = find(tree, (n) => classes(n).includes("tz-col"));
  // Which of the two comes first is whether anyone waits on you (today-doors.test.mjs holds both turns).
  assert.deepEqual(
    work.props.children
      .filter(Boolean)
      .map(name)
      .map((n) => n.replace(" tz-setup-lead", ""))
      .sort(),
    ["NeedYou", "tq tps tz-setup"],
  );
  assert.ok(
    byTestId(byTestId(tree, "today-foot"), "today-period"),
    "the week in the strip at the page's foot, its one door to Reports",
  );
  assert.equal(
    all(tree, (n) => n.props?.["data-testid"] === "today-recap").length,
    0,
    "what is not a number is said where it is acted on: under the head, in the day, never a list of its own",
  );
  W.__DEMO_MODE = false;
});

/* ------------------------------------ Glass (canvas E3) ------------------------------------ */

// Glass is the one look since Classic retired (the plan's step 5.7, 2 October 2026): what the review of Today against E3
// (1 October 2026) gave it is what the page draws, with no stamp on the document to ask for: the queue's foot whatever
// was cut and one verb a row, the bell's rows without a dismiss, Listen where the device can speak (in the head's sentence
// since the redesign of 1 Nov 2026), and the bento, with the day beside the work since then.
const emptyBell = () => ({
  feed: () => [],
  onChange: () => () => {},
  read() {},
  dismiss() {},
  seenAll() {},
  unread: () => 0,
  older: () => 0,
});

test("the queue's foot says only what is cut, with its door to the rest, and a row carries its one verb", () => {
  clear();
  // Ana's row asks a second thing of you (snooze): the row still carries one verb; the thread's acts are the Inbox's.
  const vm = busy();
  const first = vm.queue.rows.find((r) => r.kind === "handoff");
  vm.queue.rows = [
    { ...first, also: { label: "Snooze", verb: "snooze", conversationId: first.conversationId, escalationId: null } },
    ...["b", "c", "d", "e", "f", "g"].map((w) => ({
      ...first,
      id: `q-${w}`,
      who: `Person ${w}`,
      conversationId: `cv-${w}`,
      also: null,
    })),
  ];
  set({ today: vm, __BROADCASTS: broadcasts() });
  const queue = byTestId(draw(NeedYou), "today-queue");
  const foot = find(queue, (n) => classes(n).includes("tq-foot"));
  assert.ok(foot, "one person past the five drawn: the foot says so");
  assert.match(textOf(foot), /^1 more waiting/);
  const seeAll = buttons(foot, "See all");
  assert.equal(seeAll.length, 1);
  press(seeAll[0]);
  assert.equal(went.at(-1), "inbox");
  assert.equal(all(queue, (n) => n.props?.["data-testid"] === "queue-snooze").length, 0, "one verb a row (E3)");
  assert.equal(
    all(queue, (n) => classes(n).includes("cl-attn-row")).length,
    7,
    "Up next, the five waiting, and the run",
  );
  assert.equal(byTestId(queue, "today-queue-count"), null, "how many need you is the head's sentence, said once");
});

test("the head: Listen is absent where the device cannot play audio, and the sentence stands alone", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const said = headSaid(true);
  assert.equal(said.beside, undefined, "no voice on this device: nothing beside the greeting");
  assert.ok(byTestId(said.sentence, "today-head-lead"), "the sentence stands alone");
});

/** Ask's voice stood in for (legacy-bridge/ask/speech.ts as the pane reads it off window.__ask): the clip lands when the test says. */
function speechStub() {
  const spoken = [];
  const stops = [];
  let state = "idle";
  const watchers = new Set();
  const move = (s) => {
    state = s;
    for (const w of watchers) w();
  };
  let land = null;
  let fail = null;
  const stub = {
    canSpeak: () => true,
    state: () => state,
    watchSpeech: (on) => {
      watchers.add(on);
      return () => watchers.delete(on);
    },
    speak: (text, purpose) => {
      spoken.push({ text, purpose });
      move("loading");
      return new Promise((resolve, reject) => {
        land = () => {
          move("speaking");
          resolve();
        };
        fail = (why) => {
          move("idle");
          reject(new Error(why));
        };
      });
    },
    stopSpeaking: () => {
      stops.push(1);
      move("idle");
    },
  };
  return {
    stub,
    spoken,
    stops,
    land: () => land && land(),
    fail: (why) => fail && fail(why),
    /** The clip finished on its own. */
    ends: () => move("idle"),
  };
}
const settled = () => new Promise((r) => setImmediate(r));

test("the head's Listen reads the brief's words in Ask's voice, says it is getting the voice until the clip plays, Stop while it does, and a second press stops it", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    const listen = headListen(true);
    assert.ok(listen, "a voice: Listen, beside the greeting");
    assert.match(textOf(listen), /Listen\d+:\d\d/, "with how long it takes to hear");
    assert.equal(listen.props["aria-pressed"], false);
    press(listen);
    assert.equal(s.spoken.length, 1, "one clip asked for");
    // The brief's words: who needs you first, and what the page says under the head of its own, which a voice read
    // aloud would leave out: a reply that failed to deliver (contracts todayBriefWords).
    assert.match(s.spoken[0].text, /^Ana Reyes needs you/);
    assert.match(s.spoken[0].text, /failed to deliver/);
    assert.equal(s.spoken[0].purpose, "brief");
    const loading = headListen();
    assert.match(textOf(loading), /Getting Ask's voice/, "getting the voice until the clip plays");
    assert.equal(loading.props["aria-busy"], true);
    assert.equal(loading.props["aria-pressed"], false, "not Stop yet");
    s.land();
    await settled();
    const playing = headListen();
    assert.equal(playing.props["aria-pressed"], true);
    assert.match(textOf(playing), /Stop/, "Stop while it plays");
    press(playing);
    assert.equal(s.stops.length, 1, "Stop stops the clip");
    assert.equal(headListen().props["aria-pressed"], false);
    assert.equal(s.spoken.length, 1, "and asked for nothing more");
  } finally {
    holdAsk(undefined);
  }
});

test("the head's Listen: a mouse gone down on it asks for the brief's clips before the click lands; a finger going down, which may be a scroll beginning, asks nothing, nor does a press on Stop, nor a bridge that does not warm", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  const warmed = [];
  s.stub.warmSpeech = (text, purpose) => warmed.push({ text, purpose });
  holdAsk(s.stub);
  try {
    const listen = headListen(true);
    listen.props.onPointerDown({ pointerType: "touch", button: 0 });
    listen.props.onPointerDown({ pointerType: "mouse", button: 2 });
    assert.deepEqual(warmed, [], "a touch, or the mouse's other button, asks nothing");
    listen.props.onPointerDown({ pointerType: "mouse", button: 0 });
    assert.equal(warmed.length, 1);
    assert.equal(warmed[0].purpose, "brief");
    assert.match(warmed[0].text, /^Ana Reyes needs you/, "the words the click will read");
    assert.equal(s.spoken.length, 0, "nothing read: that is the click's");
    // While it reads, the button is Stop: a press going down on it asks for nothing.
    press(listen);
    s.land();
    headListen().props.onPointerDown({ pointerType: "mouse", button: 0 });
    assert.equal(warmed.length, 1);
    // A bridge from before the warm: the press still reads, and the pointer going down breaks nothing.
    delete s.stub.warmSpeech;
    s.stub.stopSpeaking();
    const older = headListen();
    assert.doesNotThrow(() => older.props.onPointerDown({ pointerType: "mouse", button: 0 }));
  } finally {
    holdAsk(undefined);
  }
});

test("the head's Listen: a clip that could not be made says why beside it, in the server's words, and nothing else speaks; the next press tries again", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    press(headListen(true));
    s.fail("Voice is off while this workspace is paused or its plan has ended.");
    await settled();
    const sentence = headSentence();
    const listen = headListen();
    assert.equal(listen.props["aria-pressed"], false, "back to Listen");
    assert.match(textOf(listen), /^Listen/, "and it says Listen, not Stop");
    const why = byTestId(sentence, "today-listen-why");
    assert.ok(why, "why, beside the button");
    assert.match(textOf(why), /paused or its plan has ended/, "in the server's words");
    assert.equal(s.stops.length, 0, "nothing to stop");
    assert.equal("speechSynthesis" in W && W.speechSynthesis, false, "the browser's own voice is not asked");
    press(listen);
    assert.equal(s.spoken.length, 2, "the next press tries again");
    assert.equal(byTestId(headSentence(), "today-listen-why"), null, "and the old reason is gone");
  } finally {
    holdAsk(undefined);
  }
});

test("the head's Listen: a head said again while the clip plays (Today redrew itself) says Stop and stops nothing; the clip ending on its own lets go", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    press(headListen(true));
    s.land();
    await settled();
    // Today redraws from nothing (its data moved): a fresh head finds the clip playing and says Stop.
    const redrawn = headListen(true);
    assert.equal(redrawn.props["aria-pressed"], true, "a head said again finds the clip playing");
    assert.equal(s.stops.length, 0, "and stops nothing");
    s.ends();
    assert.equal(headListen().props["aria-pressed"], false, "the clip ending lets go of Stop");
  } finally {
    holdAsk(undefined);
  }
});

test("Listen reads the brief: who needs you with the oldest wait, the calendar's day, what came in, the run waiting", () => {
  clear();
  set({
    today: busy(),
    headline: headline(),
    __BROADCASTS: broadcasts(),
    __CALENDAR: calendar([block("b17", 17, "Color", { id: "p1", name: "Dulce Amaro" })]),
  });
  const s = speechStub();
  holdAsk(s.stub);
  try {
    press(headListen(true));
    const said = s.spoken[0].text;
    // Who needs you first: Ana's handoff is the queue's one person waiting (busy()), and the headline's detail about her
    // wait folds into the same sentence rather than naming her twice.
    assert.match(said, /^Ana Reyes needs you, waiting since \d/, said);
    assert.ok(!said.includes("Ana Reyes has been waiting"), `said once: ${said}`);
    // The call worth a listen, then the day: one appointment to come, with whom, and when.
    assert.match(said, /One call is worth a listen\. 1 appointment today: next is Dulce Amaro at /, said);
    // Then what came in (the recap's line), then the run waiting for a word.
    assert.ok(said.includes(busy().recap.line), said);
    assert.match(said, /Win-back is waiting for your approval: .*Waits for your OK until the end of its day/, said);
  } finally {
    holdAsk(undefined);
  }
});

test("a quiet day: the four figures as zeros in the head, and no quiet sentence in the card's", () => {
  clear();
  set({ today: quietDay(), headline: headline() });
  assert.equal(byTestId(byTestId(draw(PhoneSoFar), "today-card"), "today-quiet-line"), null, "the tile is the figures");
  const glass = draw(TodayHeadFigures);
  assert.deepEqual(
    all(glass, (n) => classes(n).includes("tc-fig-n")).map(textOf),
    ["–", "0", "0", "0"],
    "the zeros, booked a dash where the day's bookings were not read",
  );
  assert.equal(
    all(glass, (n) => n.type === "button" && classes(n).includes("tc-fig-btn")).length,
    0,
    "no receipt to open: none of the four is a button",
  );
});

test("the bento (Today in three zones, 2 Nov 2026): what cannot wait over all of it, Need you beside the day with Ask found under it, the strip under them", () => {
  clear();
  set({
    today: busy(),
    headline: headline(),
    __PEOPLE: people(),
    __BROADCASTS: broadcasts(),
    __CALENDAR: calendar([block("b9", 9, "Gloss")]),
    __PLAYBOOKS: noPlaybooks(),
    __notifs: emptyBell(),
  });
  const tree = draw(TodayZones);
  const name = (c) => (typeof c.type === "function" ? c.type.name : String(c.props.className));
  const page = find(tree, (n) => classes(n).includes("dash-a-v2-glass"));
  assert.ok(page, "the Glass composition");
  assert.deepEqual(page.props.children.map(name), ["TodayAlertBand", "tz-bento", "DeskFoot"]);
  const [work, side] = find(tree, (n) => classes(n).includes("tz-bento")).props.children;
  assert.ok(work.props.children.filter(Boolean).map(name).includes("NeedYou"), "Need you leads the work's column");
  assert.deepEqual(
    side.props.children.filter(Boolean).map(name),
    ["DayZone", "AskFound"],
    "the day, Ask found under it",
  );
  assert.ok(byTestId(tree, "today-day"), "the day, with its calendar");
  // Your brief's pane, Going today, the day's card on a desk, While you were away and Worth a look are gone: what they
  // said is said where it is acted on (the head's Since you looked, Ask found's rows).
  for (const gone of ["today-brief", "today-going", "today-card", "today-live", "today-away", "today-leaks"])
    assert.equal(byTestId(tree, gone), null, gone);
});

// LAST in the file: a surface's failure cannot be taken back (surface-status.ts has no reset), so every test above saw the headline unfailed.
test("a headline whose read failed says so where its week would be, on a phone's card and in a desk's strip; one that landed clears it", async () => {
  const { setStatus } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
  clear();
  set({ today: busy(), headline: undefined, __PEOPLE: people() });
  setStatus("reports_headline", "seeded");
  const broke = draw(PhoneSoFar);
  assert.equal(byTestId(broke, "today-period"), null);
  assert.match(textOf(byTestId(broke, "today-period-failed")), /Couldn't read Reports/);
  // A desk with nothing pinned said nothing at all: the strip stood only for a week or a pin.
  assert.match(textOf(byTestId(draw(DeskFoot), "today-period-failed")), /Couldn't read Reports/);
  // The shell's door maps its argument through the routes' surfaces and knows no `reports_headline`: it says nothing of this one.
  assert.equal(failed.has("reports_headline"), false, "the page does not ask the stand-in");
  set({ headline: headline() });
  setStatus("reports_headline", "live");
  assert.equal(byTestId(draw(PhoneSoFar), "today-period-failed"), null, "a headline that landed is not failed");
  // People that could not be read: Ask found's rules stand on it, so it says so in its place rather than ranking nothing
  // as if nothing were worth a look; nothing else on the page says it. Read through the seam's status, never the shell's
  // route door, which knows People as `clients`.
  set({ __PEOPLE: undefined });
  setStatus("people", "seeded");
  assert.match(textOf(byTestId(draw(AskFound, { wide: false }), "today-found-failed")), /Couldn't read People/);
  assert.equal(failed.has("people"), false, "the page does not ask the stand-in");
  set({ __PEOPLE: people() });
  setStatus("people", "live");
  assert.equal(byTestId(draw(AskFound, { wide: false }), "today-found-failed"), null, "People read: nothing to say");
});
