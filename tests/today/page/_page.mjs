/**
 * The world the tests of page/ share. Split by behaviour from today-page.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * Today (apps/dashboard/src/surfaces/today, TSX since decision 0015; Today, calm, 19 Nov 2026), EXECUTED on the stub React
 * over the view models the bridge publishes through the seam (surface-values.ts): a line only while a line is down, the
 * page's one card and its one primary verb, the lines under it, what AI found, the pins, a borrowed read that failed
 * saying so, and the composition without a seeded panel. Every sentence with a number is read back from contracts, never typed here.
 * The queue's snooze and resolve run for real over a fetch this test holds (surfaces/inbox/verbs.ts).
 */
import { after } from "node:test";
import { toTodayVM, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, classes, kitPages } from "../../_stub-react.mjs";
import { headline as periodHeadline } from "../_headline.mjs";
import { importSrc } from "../../_source.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

export const { holdAsk } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");

export const ZONE = "America/New_York";

// 4 PM in New York on Friday 18 September 2026.
export const NOW = new Date("2026-09-18T20:00:00Z");

export const went = [];

export const asked = [];

export const flashes = [];

export const failed = new Set();

export const refreshed = [];

bridgeHolds({
  parts: { surfaceState: () => "live", surfaceFailed: (k) => failed.has(k), refreshSurface: (k) => refreshed.push(k) },
});
installStubReact({});

// The kit's parts the pages here draw by name or the tests reach (kitParts: the attention row, the record kit ...).
Object.assign(globalThis.window, kitPages);

export const { TodayAlertBand } = await import("../../../apps/dashboard/src/surfaces/today/zones/alert.tsx");

export const { TodaySetup } = await import("../../../apps/dashboard/src/surfaces/today/zones/setup-card.tsx");

export const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");

export const { AskFound } = await import("../../../apps/dashboard/src/surfaces/today/zones/found.tsx");

export const { DayCameTo, TodayPins } = await import("../../../apps/dashboard/src/surfaces/today/zones/foot.tsx");

export const { useTodayArrangement } = await import("../../../apps/dashboard/src/surfaces/today/arrangement.ts");

/** Who waits on you as the page draws it, with the card its arrangement names (Today, calm). */
export const NeedYouOnToday = () => NeedYou({ card: useTodayArrangement().card });

/**
 * What AI found as the page draws it where it holds the card: its first row the card, the rest lines (`held`); or, where
 * something else holds the card, its rows all lines.
 */
export const FoundOnToday = ({ held = true } = {}) =>
  W.React.createElement(
    "div",
    null,
    held ? W.React.createElement(AskFound, { part: "lead", held }) : null,
    W.React.createElement(AskFound, { part: "lines", held }),
  );

export const { DayZone } = await import("../../../apps/dashboard/src/surfaces/today/zones/day.tsx");

export const { useZonesStanding } = await import("../../../apps/dashboard/src/surfaces/today/zones/head.tsx");

export const { standingSaid } = await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");

export const { TodayZones } = await import("../../../apps/dashboard/src/surfaces/today/zones/page.tsx");

export const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

// When a run really goes, in the one sentence every receipt says (Today imports it from Campaigns).
export const { bcWhenWords } = await import("../../../apps/dashboard/src/surfaces/campaigns/broadcasts/when-words.ts");

export const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");

// The seam's own signal, from the module the TSX reads it through (the stub's own copy is the shell pages'): a surface's rows landed.
export const { surfaceMoved: surfaceLanded } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");

// The shell's doors and the surfaces Today borrows, which the TSX reads off the window by name when it draws (surfaces/today/shell.ts).
bridgeHolds({
  parts: { clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) } },
});
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  askAbout: (a) => asked.push(a),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  useHotkey: () => {},
  refusalToast: (res, lead) => ({ msg: `${lead}: ${res.error}`, tone: "danger" }),
});

// A verb the queue asks of the Inbox goes through the typed client to `fetch`: the workspace it names is this tab's, and
// the refresh a landed write runs reads through the runner (nothing to boot). Any read is refused unless a test holds it.
bridgeHolds({
  who: {
    workspaces: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
    activeWorkspaceId: "t1",
  },
});
Object.assign(globalThis, {});

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const refused = () => json(503, { ok: false, error: { code: "unavailable", message: "not read here" } });

globalThis.window.fetch = async () => refused();

export const stopRunner = startSurfaces([], () => () => {});

after(() => stopRunner());

export const realConsoleError = console.error;

console.error = () => {};

after(() => {
  console.error = realConsoleError;
});

export const W = globalThis.window;

/* ------------------------------------ a working day ------------------------------------ */

export const metrics = (over = {}) => ({
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

export const msg = (id, dir, body, created_at, over = {}) => ({
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

export const thread = (id, name, messages, over = {}) => ({
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

export const threads = () => [
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

export const escalations = () => [
  {
    id: "e-a",
    conversation_id: "cv-a",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: "2026-09-18T18:20:00Z",
  },
];

export const call = (id, over = {}) => ({
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

export const calls = () => [
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

export const busy = () => toTodayVM(metrics(), threads(), escalations(), calls(), NOW);

/**
 * The playbooks surface with no playbook, as the app publishes it: its rows, and its shape (9 Oct 2026), whose word the
 * day's reminders say.
 */
export const noPlaybooks = () => ({ rows: [], shape: { calendar: "feed", hasDeals: false, word: "appointment" } });

export const quietDay = () =>
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
export const headline = (over = {}) =>
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

export const list = (id, label, count, action = null) => ({ id, label, group: "journey", count, action });

export const people = () => ({
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

export const iso = (ms) => new Date(Date.now() + ms).toISOString();

export const run = (id, state, over = {}) => ({
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
export const earlierToday = (ms) => {
  const now = Date.now();
  const at = zoneDayKey(now - ms, ZONE) === zoneDayKey(now, ZONE) ? now - ms : now - 1;
  return new Date(at).toISOString();
};

export const broadcasts = () => ({
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

export const block = (id, t, title, person = null) => ({
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

export const calendar = (blocks) => ({
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

export const bellRow = (id, kind, title, tone = "", about = null, to = "reports") => ({
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
// `window.TODAY_DATA`, and `calendar`, `setup` and `playbooks` are those surfaces' values, read there too (window mirrors,
// `__CALENDAR`, `__SETUP` and `__PLAYBOOKS`, until 12 Nov 2026); every other key is a surface Today borrows or a verb of the shell, read off the window
// by name.
export const set = (globals) => {
  for (const [k, v] of Object.entries(globals)) {
    if (k === "today" || k === "calendar" || k === "setup" || k === "playbooks") setSurfaceValue(k, v);
    else if (k === "headline") setSurfaceValue("reports_headline", v);
    else if (k === "__BROADCASTS") {
      setSurfaceValue("broadcasts", v);
      if (v === undefined) delete W[k];
      else W[k] = v;
    } else if (v === undefined) delete W[k];
    else W[k] = v;
  }
};

export const clear = () => {
  bridgeHolds({
    values: { people: undefined, broadcasts: undefined, live: undefined },
    reads: { reach_out_replies: undefined },
    parts: { bell: undefined, broadcasts: undefined },
  });
  set({
    today: undefined,
    __TODAY_SAMPLE: undefined,
    headline: undefined,
    calendar: undefined,
    playbooks: undefined,
    setup: undefined,
    __GOOGLE: undefined,
    __google: undefined,
  });
  failed.clear();
  refreshed.length = 0;
  went.length = 0;
  asked.length = 0;
  flashes.length = 0;
};

export const draw = (Comp, props = {}) => {
  fresh();
  return W.React.createElement(Comp, props);
};

export const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).includes(words));

/** The page's one card (Today, calm), and the lines of a list, by the list's test id; not a line folded away. */
export const cardOf = (tree) => byTestId(tree, "today-card");

export const linesIn = (tree, list) =>
  all(byTestId(tree, list), (n) => classes(n).includes("calm-line") && !n.props["data-folded"]);

export const nameOf = (line) => textOf(find(line, (n) => classes(n).includes("calm-name")));

/** Today's standing said to the frame's head (zones/head.tsx useZonesStanding), drawn as the page draws it. */
export function HeadProbe() {
  useZonesStanding();
  return null;
}

/** What Today told the head, drawn over the same cells (`again`), or from nothing (`anew`): its sentence, its Listen. */
export const headSaid = (anew = false) => {
  if (anew) fresh();
  again(() => HeadProbe());
  return standingSaid();
};

export const headSentence = (anew = false) => headSaid(anew)?.sentence ?? null;

export const headListen = (anew = false) => byTestId(headSaid(anew)?.beside ?? null, "today-listen");

/* ------------------------------------ Ask found ------------------------------------ */

/**
 * Where a finding of AI's stands on the page, by its head: the page's card, or a line of AI found's; and its door, the
 * card's act or the line itself.
 */
export const foundRowOf = (tree, head) =>
  [cardOf(tree), ...linesIn(tree, "today-ask-found")].find(
    (r) => r && (textOf(find(r, (n) => classes(n).includes("calm-title")) ?? null) === head || nameOf(r) === head),
  ) ?? null;

export const foundDoorOf = (row) =>
  row?.props["data-testid"] === "today-card"
    ? byTestId(row, "today-found-act")
    : find(row, (n) => typeof n.props?.href === "string");

export const withNobodyAnswered = () =>
  toTodayVM(
    metrics(),
    [...threads(), thread("cv-q", "Quinn Lowe", [msg("q1", "in", "Anyone there?", "2026-09-18T17:30:00Z")])],
    escalations(),
    calls(),
    NOW,
  );

/** Ask's voice stood in for (bridge/ask/speech.ts as the pane reads it off window.__ask): the clip lands when the test says. */
export function speechStub() {
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

export const settled = () => new Promise((r) => setImmediate(r));
