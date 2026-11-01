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
  stateOf,
  leadQuestionRoute,
  LIFECYCLE_WORDS,
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
const { HeroBrief } = await import("../../../../apps/dashboard/src/surfaces/today/pages/brief.tsx");
const { TodayCard, TodayHeadFigures } = await import("../../../../apps/dashboard/src/surfaces/today/pages/card.tsx");
const { TodaySetup } = await import("../../../../apps/dashboard/src/surfaces/today/pages/setup-card.tsx");
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
const { TodayLeaks } = await import("../../../../apps/dashboard/src/surfaces/today/pages/leaks.tsx");
const { TodayPins } = await import("../../../../apps/dashboard/src/surfaces/today/pages/pins.tsx");
const { TodayAway } = await import("../../../../apps/dashboard/src/surfaces/today/pages/away.tsx");
const { TodayDay } = await import("../../../../apps/dashboard/src/surfaces/today/pages/day-card.tsx");
const { TodayWarnings } = await import("../../../../apps/dashboard/src/surfaces/today/phone/warnings.tsx");
const { useTodayStanding } = await import("../../../../apps/dashboard/src/surfaces/today/pages/today-head.tsx");
const { standingSaid } = await import("../../../../apps/dashboard/src/surfaces/kit/head/standing.ts");
const { DashboardA } = await import("../../../../apps/dashboard/src/surfaces/today/pages/today-page.tsx");
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
  ]),
  thread("cv-d", "Dulce Amaro", [
    msg("d0", "in", "Booking for the 12th", "2026-09-09T13:00:00Z", { channel: "sms" }),
    msg("d2", "in", "Can I bring my sister too?", "2026-09-18T17:30:00Z", { channel: "sms" }),
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
    [thread("cv-old", "Bea Lind", [msg("o1", "in", "Thanks!", "2026-09-17T21:39:00Z")])],
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
/** Today's standing said to the frame's head (pages/today-head.tsx), drawn as the page draws it. */
function HeadProbe() {
  useTodayStanding();
  return null;
}
/** The head's one sentence as Today said it, drawn over the same cells (`again`), or from nothing (`draw`). */
const headSentence = (anew = false) => {
  if (anew) fresh();
  again(() => HeadProbe());
  return standingSaid()?.sentence ?? null;
};
/** The head's Listen, as the sentence ends with it. */
const headListen = (anew = false) => byTestId(headSentence(anew), "today-listen");

/* ------------------------------------ above the work ------------------------------------ */

test("above the work, nothing while every line is up; a line that is down is one red line with its own dot", () => {
  clear();
  set({ today: busy() });
  const tree = draw(HeroBrief);
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
  const dark = draw(HeroBrief);
  const alert = byTestId(dark, "today-alert");
  assert.ok(alert, "a line that is down is the one thing that cannot wait");
  assert.equal(alert.props.role, "alert");
  assert.equal(textOf(alert), down.standing.alert);
  assert.ok(find(alert, (n) => classes(n).includes("today-alert-dot")));
  assert.equal(
    find(dark, (n) => classes(n).includes("live-dot")),
    null,
    "the coral live-dot is the agent's live state, never a status light",
  );
  assert.ok(!/Good (morning|afternoon|evening)/.test(textOf(dark)));
  set({ today: undefined });
  assert.equal(
    draw(HeroBrief).rendered,
    null,
    "no seeded hero: without the view model there is nothing above the work",
  );
});

/* ------------------------------------ the day's card ------------------------------------ */

test("what is not a number: never the traffic the figures say; a reply that failed to deliver under the head, with its door to the thread; a run that went out in the day", () => {
  clear();
  set({ today: busy(), headline: headline(), __BROADCASTS: broadcasts() });
  const warned = draw(TodayWarnings);
  const lines = all(warned, (n) => n.props?.["data-testid"] === "today-failed-reply").map(textOf);
  assert.ok(
    !lines.some((b) => /receptionist answered|reached the phone line|messages? in/.test(b)),
    `REGRESSION: the figures say these already: ${lines.join(" | ")}`,
  );
  const failedLine = all(warned, (n) => n.props?.["data-testid"] === "today-failed-reply").find((n) =>
    textOf(n).includes("failed to deliver"),
  );
  assert.ok(failedLine, "the one line that must never be quiet");
  press(buttons(failedLine, "See the thread")[0]);
  assert.equal(went.at(-1), "inbox/th-cv-p", "the thread of the reply that failed, not the Inbox list");
  // A run that went out is said in the day, at the time it went, with what it has earned so far.
  const day = draw(TodayDay);
  const run = broadcasts().rows[2];
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
  const tree = draw(TodayCard);
  const card = byTestId(tree, "today-card");
  assert.ok(card);
  const heading = find(card, (n) => n.type === "h2");
  assert.equal(textOf(heading), "Today so far", "a section with its own heading");
  assert.equal(card.props["aria-labelledby"], heading.props.id);
  // The card is a phone's (the redesign of 1 Nov 2026), its four by their short names in one row; a desk's four stand in
  // the head beside the greeting (the page heads canvas, H1, 31 Oct 2026), each with its whole label and clause.
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
    assert.ok(said.includes(String(f.value)) && said.includes(f.label) && said.includes(f.meta), `${f.id}: ${said}`);
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
  const fig = byTestId(first, "today-figure-messages");
  fig.props.onMouseEnter();
  const hovered = again(() => W.React.createElement(TodayHeadFigures));
  const receipt = byTestId(hovered, "today-receipt-messages");
  assert.ok(receipt, "hover opens it");
  assert.equal(receipt.props.role, "dialog");
  assert.ok(
    byTestId(byTestId(hovered, "today-figures"), "today-receipt-messages"),
    "drawn in the row of figures, so a phone lays it under the row and a desktop anchors it by index",
  );
  assert.equal(receipt.props.style["--i"], 0);
  const f = vm.figures.find((x) => x.id === "messages");
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
  assert.equal(byTestId(hovered, "today-receipt-answered"), null, "one at a time");
  byTestId(hovered, "today-figures").props.onMouseLeave();
  const left = again(() => W.React.createElement(TodayHeadFigures));
  assert.equal(byTestId(left, "today-receipt-messages"), null);
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
  const tree = draw(TodayCard);
  const line = byTestId(tree, "today-period");
  assert.equal(textOf(line), todayPeriodLine(headline()).text);
  assert.match(textOf(line), /^Last 7 days: 24 messages \(up from 19\), 88% answered by the receptionist, 4 calls\.$/);
  // The line is the one door (the redesign of 1 Nov 2026): the period card had two, then the card's head had one.
  assert.equal(line.type, "a");
  press(line);
  assert.equal(went.at(-1), "reports");
  assert.equal(buttons(tree, "Reports").length, 0, "no second door to Reports on the card");
  set({ headline: undefined });
  const loading = draw(TodayCard);
  assert.equal(byTestId(loading, "today-period"), null);
  assert.equal(byTestId(loading, "today-period-failed"), null, "not read yet is not failed");
});

test("a quiet day: the tile is four zeros, and the head says nothing needs you and proves the lines are listening", () => {
  clear();
  const vm = quietDay();
  set({ today: vm, headline: headline() });
  const tree = draw(TodayCard);
  assert.ok(byTestId(draw(TodayHeadFigures), "today-figures"), "the tile whole: four zeros (E3), in the head");
  assert.equal(byTestId(tree, "today-quiet-line"), null, "no sentence in the card: the head says the day");
  assert.match(
    vm.proof,
    /^The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later\.$/,
  );
  const said = textOf(headSentence(true));
  assert.ok(said.includes(vm.proof), `the head says the proof: ${said}`);
  // And says first what a quiet day means for the person reading it: nothing waits on them (7 Oct 2026).
  assert.ok(said.startsWith("Nothing needs you."), said);
  // The sentence is the whole of it (7 Oct 2026): no list of lines and their numbers under it, and no second door.
  const page = draw(DashboardA);
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
  assert.equal(waiting.figures, null);
  assert.ok(waiting.zero_figures, "nothing counted: the zeros");
  set({ today: waiting });
  const held = draw(TodayCard);
  assert.ok(byTestId(draw(TodayHeadFigures), "today-figures"), "the four zeros");
  assert.equal(byTestId(held, "today-quiet-line"), null);
  const zero = waiting.zero_figures.find((f) => f.id === "messages");
  assert.match(zero.meta, /^none today, the last /);
  assert.ok(
    textOf(byTestId(draw(TodayHeadFigures), "today-figure-messages")).includes(zero.meta),
    "REGRESSION: when the last message came in vanished exactly when an owner needed it",
  );
});

test("the calls read failed: Need you says so where its calls stand, once", () => {
  clear();
  set({ today: toTodayVM(metrics(), threads(), escalations(), null, NOW), __BROADCASTS: { rows: [] } });
  const tree = draw(AgentCommand);
  assert.ok(byTestId(tree, "today-calls-failed"));
  assert.equal(all(tree, (n) => String(n.props?.className || "").includes("empty-failed")).length, 1);
  set({ today: busy() });
  assert.equal(byTestId(draw(AgentCommand), "today-calls-failed"), null, "a calls read that landed is not failed");
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
  const tree = draw(AgentCommand);
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
  const broke = draw(AgentCommand);
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
  let queue = byTestId(draw(AgentCommand), "today-queue");
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
  queue = byTestId(draw(AgentCommand), "today-queue");
  const reach = byTestId(queue, "brief-run-row");
  assert.equal(buttons(reach, "Approve").length, 0, "no one-tap send of a reach-out from Today");
  assert.equal(buttons(reach, "Open").length, 1, "the row opens the run");
  assert.equal(buttons(reach, "See who's on it").length, 0, "one door, not the same door twice");
  // A playbook's run alone keeps its Approve, in the one word every screen says for it (decision 19): with its count.
  set({ __BROADCASTS: { rows: [run("b-wait", "pending_approval")] } });
  const playbook = byTestId(byTestId(draw(AgentCommand), "today-queue"), "brief-run-row");
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
  const waiting = byTestId(byTestId(draw(AgentCommand), "today-queue"), "brief-run-row");
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
        again(() => W.React.createElement(AgentCommand)),
        "today-queue",
      ),
      "brief-run-row",
    );
  const first = byTestId(byTestId(draw(AgentCommand), "today-queue"), "brief-run-row");
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

test("a waiting run whose day has passed is opened from the queue, never approved: its row says why, in the verb's words", async () => {
  // approveRun refuses a playbook's run on a later day than it was made for (contracts runApprovalRefusal). Today's row
  // offered Approve all the same, and the press answered "Not approved" over a 409.
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
  const waiting = byTestId(byTestId(draw(AgentCommand), "today-queue"), "brief-run-row");
  assert.equal(buttons(waiting, "Approve").length, 0, "REGRESSION: Approve over a run the verb refuses");
  const w = todayRunWords(rows[0]);
  assert.deepEqual([w.late.meta, w.late.status], ["Campaign · too late to approve", ["Too late to approve"]]);
  const said = textOf(waiting);
  assert.ok(said.includes(w.late.status[0]) && said.includes("that day has passed"), said);
  assert.ok(!said.includes(w.waiting.sentence), "and not that nothing sends until you say so");
  went.length = 0;
  press(buttons(waiting, "Open")[0]);
  assert.deepEqual(went, ["campaigns/sequences/b-wait/runs/b-wait"], "it opens the run, where Skip is");
  assert.deepEqual(approvals, []);
  // The bell's row about one run says where it goes.
  const { verbForRoute } = await import("@chanlytics/contracts");
  assert.deepEqual(
    [verbForRoute("campaigns/sequences/b-wait/runs/b-wait"), verbForRoute("broadcasts")],
    ["Open the run", "Open Sequences"],
  );
});

test("every person is a row of their group, the run waiting for a word in Your OK after them; the foot counts only what is cut", () => {
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
  const queue = byTestId(draw(AgentCommand), "today-queue");
  const rows = all(queue, (n) => classes(n).includes("cl-attn-row"));
  assert.equal(rows.length, 5, "four people and the run");
  assert.deepEqual(
    rows.map((r) => r.props["data-testid"]).map((d) => d.startsWith("queue-")),
    [true, true, true, true, false],
    "the people first",
  );
  assert.equal(rows[4].props["data-testid"], "brief-run-row", "then the run waiting for a word, in Your OK");
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

  // Nothing is dropped in silence: the people past what the day holds are counted, with the door to the rest.
  vm.queue.more_people = 2;
  set({ today: vm });
  const more = byTestId(draw(AgentCommand), "today-queue");
  assert.match(textOf(find(more, (n) => classes(n).includes("tq-foot"))), /^2 more in the Inbox/);
  assert.doesNotMatch(textOf(find(more, (n) => classes(n).includes("tq-foot"))), /more run/);
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
  const queue = byTestId(draw(AgentCommand), "today-queue");
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

test("the day listens for People too: it reads People for a visit that needs someone and a person's channel, and on a cold boot People lands last", () => {
  // The boot reads what Today draws right after its own surface, People last (surface-registry.ts ROUTE_DRAWS):
  // the day drew once with the calendar and never again, so the flag and the glyphs a person's row carries were
  // missing until something else redrew it. The day, Listen's words and the queue read the one derivation (day.tsx useDayVm).
  clear();
  set({ today: busy(), __CALENDAR: calendar([block("b9", 9, "Slot 9")]), __PLAYBOOKS: noPlaybooks() });
  draw(TodayDay);
  for (const key of ["calendar", "playbooks", "people"]) {
    quiet();
    surfaceLanded(key);
    assert.ok(redrawWanted(), `the day redraws when ${key} lands`);
  }
  // A surface nothing here draws from is none of its business: Billing's read moves nothing.
  quiet();
  surfaceLanded("billing");
  assert.ok(!redrawWanted(), "the day does not redraw for a surface it does not draw");
});

test("each band of Today is drawn again when a surface it draws from lands, and by no other's", () => {
  // The shell drew whole on every surface's read; a band now names the surfaces it draws (useSurface) and moves on those.
  clear();
  set({ today: busy(), __CALENDAR: calendar([block("b9", 9, "Slot 9")]), __PLAYBOOKS: noPlaybooks() });
  const bands = [
    ["the alert line", HeroBrief, ["today"]],
    ["the day's card", TodayCard, ["today", "reports_headline"]],
    ["the setup card", TodaySetup, ["setup"]],
    // The queue's head is the one count of what needs you (0048), made of the Inbox's threads; its visits to mark are the Calendar's.
    ["the queue", AgentCommand, ["today", "broadcasts", "people", "calendar", "inbox"]],
    ["the day", TodayDay, ["broadcasts", "calendar", "playbooks", "people"]],
    ["Worth a look", TodayLeaks, ["reports_headline", "people", "today"]],
    ["the pins", TodayPins, ["people"]],
  ];
  for (const [name, Band, drawnFrom] of bands) {
    draw(Band);
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

/* ------------------------------------ worth a look ------------------------------------ */

test("worth a look: the tone once, as the row's pill; who is waiting as chips; Ask why with the row's own facts; the doors; the count past the cap", () => {
  clear();
  const vm = busy();
  // The chrome bridge, as the app publishes it, so the one pill draws the row's tone.
  set({ today: vm, headline: headline(), __PEOPLE: people(), __chrome: { state: stateOf } });
  const tree = draw(TodayLeaks);
  const band = byTestId(tree, "today-leaks");
  const { rows, moreLine } = todayLeaks(headline(), people(), vm.noReply);
  assert.equal(rows.length, 2);
  // Worth a look asks for a look; a failure is red on every other badge, and these rows are not failures.
  for (const l of rows) assert.ok(["warn", "info"].includes(l.tone), `${l.id} is ${l.tone}`);
  for (const l of rows) {
    const row = byTestId(band, `today-leak-${l.id}`);
    assert.ok(row, l.id);
    const tag = find(row, (n) => n.type === "span" && classes(n).includes("tl-tag"));
    assert.equal(textOf(tag), l.tag);
    assert.ok(
      classes(tag).includes("pill") && classes(tag).includes(`pill-${l.tone}`),
      "the tone is the row's one pill",
    );
    assert.equal(
      find(row, (n) => classes(n).includes("tl-glyph")),
      null,
      "no tile: it said the pill's tone a second time",
    );
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-text"))), l.text);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-math"))), l.math);
    press(byTestId(row, `today-leak-ask-${l.id}`));
    assert.deepEqual(asked.at(-1), { prompt: l.ask });
    assert.ok(buttons(row, l.cta.label).length === 1);
    // One left edge and one column of pills (Ruben, 24 Sep: "the badges can be better placed"): the pill is the row's
    // own, placed in its corner, never inside a line with the sentence; the arithmetic, the names and the doors are the
    // row's foot; the doors are words, not buttons with a button's padding.
    assert.ok(
      (row.props.children || []).flat().some((c) => c === tag || (c && c.rendered === tag)),
      "the pill belongs to the row, not to a line beside the sentence",
    );
    const foot = find(row, (n) => classes(n).includes("tl-foot"));
    assert.ok(foot, "a foot");
    assert.ok(
      find(foot, (n) => classes(n).includes("tl-math")),
      "the arithmetic is the foot's",
    );
    const acts = find(foot, (n) => classes(n).includes("tl-acts"));
    const doors = all(acts, (n) => n.type === "button");
    assert.ok(doors.length >= 2, "Ask why and the row's own door");
    assert.ok(
      doors.every((d) => classes(d).includes("tl-act") && !classes(d).includes("btn")),
      "the doors are words",
    );
    assert.ok(classes(doors.at(-1)).includes("tl-act-go"), "the row's own door is last, in ink");
  }
  assert.equal(rows[0].id, "never-booked");
  assert.equal(rows[1].id, "unanswered");
  const waiting = all(byTestId(band, "today-leak-unanswered"), (n) => classes(n).includes("tl-person"));
  assert.ok(
    waiting.length > 0 && waiting.every((b) => classes(b).includes("chip")),
    "a person waiting is a name: the one chip",
  );
  assert.deepEqual(
    waiting.map(textOf),
    ["Dulce Amaro", "Priya Nair"],
    "who is waiting with nothing back, from the threads the page holds: the reply to Priya failed, so nothing reached her",
  );
  assert.equal(
    textOf(find(byTestId(band, "today-leak-unanswered"), (n) => classes(n).includes("tl-people-lead"))),
    "Waiting now",
    "named as waiting now, never as the count's own subjects: the count is Reports' over its period",
  );
  press(waiting[0]);
  assert.equal(went.at(-1), "inbox/th-cv-d");
  assert.equal(textOf(byTestId(band, "today-leaks-more")).trim(), moreLine);
  assert.equal(moreLine, "and 2 more", "the reach row and the quiet row qualified too; the cap is two");
  set({
    headline: headline({
      in: 23,
      ai: 23,
      you: 0,
      none: 0,
      booking: { calendar: "ok", days: 7, asked: 18, booked: 17 },
    }),
    __PEOPLE: { ...people(), lists: [list("quiet", "Quiet 30+ days", 1, null)] },
  });
  const calm = draw(TodayLeaks);
  assert.ok(byTestId(calm, "today-period"), "a workspace with nothing wrong gets the week alone");
  assert.equal(
    find(calm, (n) => classes(n).includes("tsec-title")),
    null,
    "with no name of its own, and no congratulation",
  );
  set({ headline: headline(), __PEOPLE: undefined });
  failed.add("people");
  assert.match(textOf(byTestId(draw(TodayLeaks), "today-leaks-failed")), /Couldn't read People/);
  failed.clear();
  assert.equal(draw(TodayLeaks).rendered, null, "not read yet is not failed");
  set({ __chrome: undefined });
});

test("worth a look names no one a reply from a lead read as a wrong person: the replies the page already holds are laid over who waits, and a failed read excludes nobody", () => {
  clear();
  const vm = busy();
  set({ today: vm, headline: headline(), __PEOPLE: people(), __chrome: { state: stateOf } });
  const waiting = () =>
    all(byTestId(draw(TodayLeaks), "today-leak-unanswered"), (n) => classes(n).includes("tl-person")).map(textOf);
  const reading = (conversation_id, intent) => ({ conversation_id, intent, undone: false, claim: "person" });
  assert.deepEqual(waiting(), ["Dulce Amaro", "Priya Nair"], "the fixture: the threads the view model lists");
  // The replies surface (legacy-bridge/reach-out/replies.ts) holds the readings; Today reads none of its own.
  set({ __REPLIES: { replies: [reading("cv-d", "wrong_person")], mailbox: null } });
  assert.deepEqual(waiting(), ["Priya Nair"], "they are not the one to ask: nobody there is waiting");
  set({ __REPLIES: { replies: [reading("cv-d", "not_now")], mailbox: null } });
  assert.deepEqual(waiting(), ["Dulce Amaro", "Priya Nair"], "a not-now is still someone to answer");
  // Not read yet, or read and failed (the surface holds null): nobody is taken for gone.
  set({ __REPLIES: null });
  assert.deepEqual(waiting(), ["Dulce Amaro", "Priya Nair"]);
  set({ __REPLIES: undefined });
  assert.deepEqual(waiting(), ["Dulce Amaro", "Priya Nair"]);
  // The count is Reports' over its period and is not touched: only the names under it are.
  set({ __REPLIES: { replies: [reading("cv-d", "wrong_person")], mailbox: null } });
  assert.match(textOf(byTestId(draw(TodayLeaks), "today-leak-unanswered")), /never got an answer at all/);
  clear();
  set({ __chrome: undefined });
});

test("worth a look on a phone: the arithmetic waits behind the sentence, and the sentence is its door", () => {
  // On a phone the arithmetic is a receipt, not a decision (Ruben, 22 Sep: the band read as wordy, in a second
  // font). The words stay in the row, hidden, so Ask and a phone run read the same line as a desk does.
  clear();
  const vm = busy();
  set({ today: vm, headline: headline(), __PEOPLE: people() });
  const had = W.matchMedia;
  W.matchMedia = (q) => ({ matches: q === "(max-width: 720px)" });
  try {
    const { rows } = todayLeaks(headline(), people(), vm.noReply);
    const [first, second] = rows;
    const mathOf = (tree, id) => find(byTestId(tree, `today-leak-${id}`), (n) => classes(n).includes("tl-math"));
    let tree = draw(TodayLeaks);
    assert.equal(all(tree, (n) => classes(n).includes("tsec-sub")).length, 0, "no subtitle over the rows");
    const door = byTestId(tree, `today-leak-text-${first.id}`);
    assert.equal(door.type, "button", "the sentence is the door");
    assert.equal(textOf(door), first.text);
    assert.equal(door.props["aria-expanded"], false);
    assert.equal(door.props["aria-controls"], mathOf(tree, first.id).props.id);
    assert.equal(mathOf(tree, first.id).props.hidden, true, "the arithmetic waits");
    assert.equal(textOf(mathOf(tree, first.id)), first.math, "in the row's own words");
    assert.equal(mathOf(tree, second.id).props.hidden, true);
    press(door);
    tree = again(() => W.React.createElement(TodayLeaks));
    assert.equal(byTestId(tree, `today-leak-text-${first.id}`).props["aria-expanded"], true);
    assert.equal(mathOf(tree, first.id).props.hidden, false, "one press shows it");
    assert.equal(mathOf(tree, second.id).props.hidden, true, "and only it");
    press(byTestId(tree, `today-leak-text-${first.id}`));
    tree = again(() => W.React.createElement(TodayLeaks));
    assert.equal(mathOf(tree, first.id).props.hidden, true, "a second press puts it away");
  } finally {
    if (had === undefined) delete W.matchMedia;
    else W.matchMedia = had;
  }
  // A desk keeps the sentence a span and the arithmetic in view.
  const desk = draw(TodayLeaks);
  const { rows } = todayLeaks(headline(), people(), vm.noReply);
  assert.equal(byTestId(desk, `today-leak-text-${rows[0].id}`), null);
  assert.equal(
    find(byTestId(desk, `today-leak-${rows[0].id}`), (n) => classes(n).includes("tl-math")).props.hidden,
    false,
  );
});

test("REGRESSION: worth a look over People's real rows -- a yes to offers with no number to send one to is not 'nobody has said yes', and there is no door to ask for it again", () => {
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
  // A week that booked and answered, so the reach row is not under the cap.
  const R = headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } });
  set({ today: busy(), headline: R, __PEOPLE: P });
  const reach = byTestId(draw(TodayLeaks), "today-leak-unreachable");
  assert.ok(reach, "nobody can be sent an offer: the row stands");
  const want = todayLeaks(R, P).rows.find((l) => l.id === "unreachable");
  assert.equal(textOf(find(reach, (n) => classes(n).includes("tl-text"))), want.text);
  assert.equal(textOf(find(reach, (n) => classes(n).includes("tl-math"))), want.math);
  assert.ok(
    !/has said yes to offers/.test(textOf(reach)),
    `REGRESSION: Ana said yes to offers, and the row said nobody had: ${textOf(reach)}`,
  );
  assert.deepEqual(buttons(reach, "Get their yes"), [], "REGRESSION: a door asking Ana for the yes she gave");
  press(buttons(reach, "Open People")[0]);
  assert.equal(went.at(-1), "clients/seg:opted_in", "the number is People's list, and the door opens it");
});

test("worth a look, in every workspace: the consultations row names the count's own people under its own lead, each to their page, and its door is the Pipeline", () => {
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
  // A week that booked and answered, so the consultations are the one row.
  const R = headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } });
  set({ today: busy(), headline: R, __PEOPLE: P });
  const want = todayLeaks(R, P).rows.find((l) => l.id === "consults-waiting");
  assert.ok(want, "three consultations this week, nothing after any");
  const row = byTestId(draw(TodayLeaks), "today-leak-consults-waiting");
  assert.ok(row, "the row is drawn");
  assert.equal(textOf(find(row, (n) => classes(n).includes("tl-tag"))), "Next step");
  assert.equal(textOf(find(row, (n) => classes(n).includes("tl-text"))), want.text);
  assert.equal(textOf(find(row, (n) => classes(n).includes("tl-math"))), want.math);
  assert.equal(want.text, "3 consultations in the last week with nothing booked or proposed since.");
  assert.equal(
    textOf(find(row, (n) => classes(n).includes("tl-people-lead"))),
    "Consultation with",
    "not 'Waiting now': these are the count's own people, and the lead is contracts'",
  );
  const chips = all(row, (n) => classes(n).includes("tl-person"));
  assert.deepEqual(chips.map(textOf), ["Abel Cruz", "Bea Ortiz"], "two, the oldest first, as the Pipeline lists them");
  assert.deepEqual(
    chips.map((c) => c.props.title),
    ["Open Abel Cruz in People", "Open Bea Ortiz in People"],
    "each says where it goes: their page, not a thread",
  );
  press(chips[0]);
  assert.equal(went.at(-1), "clients/p-a");
  press(buttons(row, "See who")[0]);
  assert.equal(went.at(-1), "clients/pipeline", "the door is the Pipeline, whose number the row re-prints");
});

/* ------------------------------------ while you were away ------------------------------------ */

test("while you were away: drawn wherever the bell is, deduped over every queue kind, the head the bell's own number", () => {
  clear();
  const vm = busy();
  const rows = [
    bellRow("needs:th-cv-a", "needs_you", "Ana Reyes needs you", "warn"),
    bellRow("call:k3", "missed_call", "Missed call · +1 (347) 555-0188", "warn", null, "conversations/cv-k3"),
    bellRow("n:1", "review", "1 new rating on Google", "ok"),
    // The run the queue holds for a word, said again by the bell: the fifth queue kind the away card hides. The bell says
    // "Campaign" (decision 19); a row kept before that says "Playbook", and is the queue's too.
    bellRow("n:2", "playbook", "Playbook “Win-back” is ready: 3 people", "ok", null, "outbound"),
    bellRow("n:3", "playbook", "Campaign “Win-back” is ready: 3 people", "ok", null, "outbound"),
  ];
  const api = {
    feed: () => rows,
    onChange: () => () => {},
    read() {},
    dismiss() {},
    seenAll() {},
    unread: () => unreadCount(rows),
    older: () => 0,
  };
  // The queue draws the Win-back run held for a word (broadcasts()), so the bell's "is ready" about it is the queue's.
  set({ today: vm, __notifs: api, __BROADCASTS: broadcasts() });
  W.__DEMO_MODE = true;
  const tree = draw(TodayAway);
  assert.ok(
    byTestId(tree, "today-away"),
    "the mockup's sample publishes a bell too: the card no longer hides in a demo",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "today-away-row").map((n) =>
      textOf(find(n, (m) => classes(m).includes("ta-title"))),
    ),
    ["1 new rating on Google"],
    "the handoff's row and the missed call are the queue's",
  );
  assert.equal(textOf(find(tree, (n) => classes(n).includes("tq-count"))).trim(), "5", "the bell's own number");
  assert.match(
    textOf(find(tree, (n) => classes(n).includes("tq-foot"))),
    /4 more in the bell, already in the queue above/,
  );
  assert.ok(buttons(tree, "Mark all read").length === 1);
  W.__DEMO_MODE = false;
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
  const demo = draw(DashboardA);
  for (const id of ["today-queue", "today-warnings"])
    assert.ok(byTestId(demo, id), `${id}: its own view model still draws`);
  for (const id of [
    "today-day",
    "today-period",
    "brief-run-row",
    "brief-run-done",
    "today-leaks",
    "today-away",
    "today-away-row",
  ])
    assert.equal(byTestId(demo, id), null, `${id}: not drawn from the sample, which nothing reads any more`);
  for (const name of ["__PEOPLE", "__BROADCASTS", "__CALENDAR", "__PLAYBOOKS", "__notifs"])
    assert.equal(
      W[name],
      undefined,
      `${name}: the mockup's other pages switch to their real variants on the bridge's names`,
    );
  // A workspace never reads the sample: the same globals outside a demo session draw nothing borrowed.
  W.__DEMO_MODE = false;
  const real = draw(DashboardA);
  for (const id of ["today-day", "today-period", "brief-run-row", "today-leaks", "today-away"])
    assert.equal(byTestId(real, id), null, `${id}: never from the sample outside a demo`);
  assert.ok(byTestId(real, "today-queue") && byTestId(real, "today-warnings"), "its own view model still draws");
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
  const tree = draw(DashboardA);
  const order = ["today-queue", "today-day", "today-leaks", "today-away"].map((id) => byTestId(tree, id));
  assert.ok(order.every(Boolean), "every band");
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
  // day's, at its time (decision 0064). What Ask would do is Ask found's, at Need you's foot (decision 0071): nothing it
  // suggests outranks a person who has been waiting (decision 0070), and it has no band of its own.
  const work = find(tree, (n) => classes(n).includes("dash-a-v2-work"));
  // Which of the two comes first is whether anyone waits on you (today-doors.test.mjs holds both turns).
  assert.deepEqual(work.props.children.map(name).sort(), ["AgentCommand", "tq tps"]);
  assert.ok(
    byTestId(byTestId(tree, "today-leaks"), "today-period"),
    "the week at Worth a look's foot, its one door to Reports (the day's card that stood there with one line is gone)",
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
  vm.queue.rows = vm.queue.rows.map((r, i) =>
    i === 0
      ? { ...r, also: { label: "Snooze", verb: "snooze", conversationId: r.conversationId, escalationId: null } }
      : r,
  );
  vm.queue.more_people = 1;
  set({ today: vm, __BROADCASTS: broadcasts() });
  const queue = byTestId(draw(AgentCommand), "today-queue");
  const foot = find(queue, (n) => classes(n).includes("tq-foot"));
  assert.ok(foot, "one person past what the day holds: the foot says so");
  assert.match(textOf(foot), /^1 more in the Inbox/);
  const seeAll = buttons(foot, "See all");
  assert.equal(seeAll.length, 1);
  press(seeAll[0]);
  assert.equal(went.at(-1), "inbox");
  assert.equal(all(queue, (n) => n.props?.["data-testid"] === "queue-snooze").length, 0, "one verb a row (E3)");
  assert.equal(all(queue, (n) => classes(n).includes("cl-attn-row")).length, 2, "the person and the run");
  assert.equal(byTestId(queue, "today-queue-count"), null, "how many need you is the head's sentence, said once");
});

test("the bell's rows carry no dismiss of their own; Mark all read stays", () => {
  clear();
  const rows = [
    bellRow("n:1", "review", "1 new rating on Google", "ok"),
    bellRow("n:2", "quality", "Quality rating flagged", "warn"),
  ];
  const api = { ...emptyBell(), feed: () => rows, unread: () => unreadCount(rows) };
  set({ today: busy(), __notifs: api });
  const glass = draw(TodayAway);
  assert.equal(all(glass, (n) => n.props?.["data-testid"] === "today-away-row").length, 2, "the same rows");
  assert.equal(all(glass, (n) => classes(n).includes("ta-x")).length, 0, "no dismiss (E3)");
  assert.equal(buttons(glass, "Mark all read").length, 1);
});

test("the head: Listen is absent where the device cannot play audio, and the sentence stands alone", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const silent = headSentence(true);
  assert.equal(byTestId(silent, "today-listen"), null, "no voice on this device: no Listen");
  assert.ok(byTestId(silent, "today-head-lead"), "the sentence stands alone");
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
  W.__ask = s.stub;
  globalThis.__ask = s.stub;
  try {
    const listen = headListen(true);
    assert.ok(listen, "a voice: Listen, at the end of the head's sentence");
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
    delete W.__ask;
    delete globalThis.__ask;
  }
});

test("the head's Listen: a mouse gone down on it asks for the brief's clips before the click lands; a finger going down, which may be a scroll beginning, asks nothing, nor does a press on Stop, nor a bridge that does not warm", () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  const warmed = [];
  s.stub.warmSpeech = (text, purpose) => warmed.push({ text, purpose });
  W.__ask = s.stub;
  globalThis.__ask = s.stub;
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
    delete W.__ask;
    delete globalThis.__ask;
  }
});

test("the head's Listen: a clip that could not be made says why beside it, in the server's words, and nothing else speaks; the next press tries again", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  W.__ask = s.stub;
  globalThis.__ask = s.stub;
  try {
    press(headListen(true));
    s.fail("Voice is off while this workspace is paused or its plan has ended.");
    await settled();
    const sentence = headSentence();
    const listen = byTestId(sentence, "today-listen");
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
    delete W.__ask;
    delete globalThis.__ask;
  }
});

test("the head's Listen: a head said again while the clip plays (Today redrew itself) says Stop and stops nothing; the clip ending on its own lets go", async () => {
  clear();
  set({ today: busy(), headline: headline() });
  const s = speechStub();
  W.__ask = s.stub;
  globalThis.__ask = s.stub;
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
    delete W.__ask;
    delete globalThis.__ask;
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
  W.__ask = s.stub;
  globalThis.__ask = s.stub;
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
    delete W.__ask;
    delete globalThis.__ask;
  }
});

test("a quiet day: the four figures as zeros in the head, and no quiet sentence in the card's", () => {
  clear();
  set({ today: quietDay(), headline: headline() });
  assert.equal(byTestId(byTestId(draw(TodayCard), "today-card"), "today-quiet-line"), null, "the tile is the figures");
  const glass = draw(TodayHeadFigures);
  assert.deepEqual(
    all(glass, (n) => classes(n).includes("tc-fig-n")).map(textOf),
    ["0", "0", "0", "0"],
    "the four zeros",
  );
  assert.equal(
    all(glass, (n) => n.type === "button" && classes(n).includes("tc-fig-btn")).length,
    0,
    "no receipt to open: none of the four is a button",
  );
});

test("the bento (the redesign of 1 Nov 2026): what cannot wait over all of it, the work beside the day and the bell, Worth a look beside the pins", () => {
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
  const tree = draw(DashboardA);
  const name = (c) => (typeof c.type === "function" ? c.type.name : String(c.props.className));
  const page = find(tree, (n) => classes(n).includes("dash-a-v2-glass"));
  assert.ok(page, "the Glass composition");
  assert.deepEqual(page.props.children.map(name), [
    "TodayWarnings",
    "dash-a-v2-work",
    "dash-a-v2-side",
    "dash-a-v2-bottom",
  ]);
  const side = find(tree, (n) => classes(n).includes("dash-a-v2-side"));
  assert.deepEqual(side.props.children.map(name), ["TodayDay", "TodayAway"], "the day beside the work, then the bell");
  assert.ok(byTestId(tree, "today-day"), "the day's card, with its calendar");
  const bottom = find(tree, (n) => classes(n).includes("dash-a-v2-bottom"));
  assert.deepEqual(bottom.props.children.map(name), ["TodayLeaks", "TodayPins"]);
  // Your brief's pane, Going today and the day's card on a desk are gone: what they said is said where it is acted on.
  for (const gone of ["today-brief", "today-going", "today-card", "today-live"])
    assert.equal(byTestId(tree, gone), null, gone);
});

// LAST in the file: a surface's failure cannot be taken back (surface-status.ts has no reset), so every test above saw the headline unfailed.
test("a headline whose read failed says so where its lines would be, on the card and in Worth a look; one that landed clears it", async () => {
  const { setStatus } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
  clear();
  set({ today: busy(), headline: undefined, __PEOPLE: people() });
  setStatus("reports_headline", "seeded");
  const broke = draw(TodayCard);
  assert.equal(byTestId(broke, "today-period"), null);
  assert.match(textOf(byTestId(broke, "today-period-failed")), /Couldn't read Reports/);
  assert.match(textOf(byTestId(draw(TodayLeaks), "today-leaks-failed")), /Couldn't read Reports/);
  // The shell's door maps its argument through the routes' surfaces and knows no `reports_headline`: it says nothing of this one.
  assert.equal(failed.has("reports_headline"), false, "the page does not ask the stand-in");
  set({ headline: headline() });
  setStatus("reports_headline", "live");
  assert.equal(byTestId(draw(TodayCard), "today-period-failed"), null, "a headline that landed is not failed");
});
