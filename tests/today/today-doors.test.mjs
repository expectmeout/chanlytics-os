/**
 * Today: doors that open the record, and a day that says only what is true.
 *
 * - "See the thread" beside a reply that failed to deliver opened the Inbox list, not the thread; "Open Live"
 *   beside a call in progress opened Live's list, where the oldest call leads (the wiring audit's A21).
 * - Approving a waiting run said "sending now" when the server had moved it to nine o'clock.
 * - The view model kept the day's three receipts, the quiet day's proof and its way to earlier conversations;
 *   the hero drew one receipt and neither of the others.
 * - With no line connected the queue said the receptionist was "answering on its own" and the hero said the
 *   queue was clear, beside the line pointing at Setup.
 * Run against the contracts and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, setupSteps } from "@chanlytics/contracts";
import { installStubReact, fresh, again, kitPages, press, unmount } from "../_stub-react.mjs";
import { importSrc } from "../_source.mjs";
const { holdAsk } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");

const ZONE = "America/New_York";
const NOW = new Date("2026-09-06T14:00:00Z");

// The metrics read as the-pages-say-only-what-is-true.test.mjs copies it.
const zeroNow = {
  escalations_open: 0,
  oldest_open_escalation_at: null,
  threads_needing_human: 0,
  threads_snoozed: 0,
  threads_awaiting_reply: 0,
  last_inbound_at: null,
  last_outbound_at: null,
};
const busyPeriod = {
  messages_in: 5,
  messages_out_ai: 4,
  messages_out_you: 0,
  conversations_active: 3,
  answered_by_ai: 4,
  answered_by_you: 0,
  unanswered_in_window: 0,
  median_reply_seconds_ai: 40,
  send_failures: 0,
  escalations_new: 0,
  escalation_reasons: {},
  calls: 0,
  call_seconds: 0,
  call_sentiments: {},
  calls_voicemail: 0,
  new_contacts: 0,
};
const quietPeriod = {
  ...busyPeriod,
  messages_in: 0,
  messages_out_ai: 0,
  conversations_active: 0,
  answered_by_ai: 0,
  median_reply_seconds_ai: null,
};
const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+1 305" },
    { kind: "voice", status: "active", number: "+1 786" },
  ],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: { ...zeroNow, last_inbound_at: "2026-09-06T13:00:00Z", last_outbound_at: "2026-09-06T13:01:00Z" },
  period: busyPeriod,
  ...over,
});
const contact = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+17865550181",
  consent: "opted_in",
  dnc: false,
});
const msg = (over = {}) => ({
  id: "m",
  conversation_id: "cv1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Can I move Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: "2026-09-06T12:00:00Z",
  ...over,
});
const conversation = (id, name, messages) => ({
  id,
  state: "open",
  paused_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: "2026-09-06T12:00:00Z",
  last_message_at: "2026-09-06T12:01:00Z",
  contact: contact(`c-${id}`, name),
  messages,
});
/* -------------------------------- the pages, drawn -------------------------------- */

const went = [];
const flashes = [];
installStubReact({
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __clock: { zone: () => "America/Chicago", dayKey: () => "2026-09-06", time: () => "9:00 AM" },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
(await import("../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// The record kit, as the app publishes it (surfaces/kit/kit-globals.ts), for the pages that still draw it by name.
Object.assign(globalThis.window, kitPages);
for (const k of ["StatePill", "EmptyState", "FailedRead", "PolicyChip", "StatStrip", "StatCell"])
  globalThis[k] = globalThis.window[k] || (({ children }) => children ?? null);
globalThis.useHotkey = () => {};
globalThis.window.usePPToast = () => [null, (m) => flashes.push(m)];
// Today's zones are TSX (surfaces/today/zones), drawn by import over the day and Setup the seam holds (surface-values.ts).
// Setup's rows are the surface's own (surfaces/setup/rows), imported by the card, not published on the window.
const { TodayAlertBand } = await import("../../apps/dashboard/src/surfaces/today/zones/alert.tsx");
const { TodayHeadFigures } = await import("../../apps/dashboard/src/surfaces/today/zones/figures.tsx");
const { PhoneSoFar } = await import("../../apps/dashboard/src/surfaces/today/zones/foot.tsx");
const { useZonesStanding } = await import("../../apps/dashboard/src/surfaces/today/zones/head.tsx");
const { standingSaid } = await import("../../apps/dashboard/src/surfaces/kit/head/standing.ts");
// The card is a chunk of its own (setup-card-body.tsx), asked for as Today's page loads: drawn here once it is in.
const { TodaySetup, setupCardReady } = await import("../../apps/dashboard/src/surfaces/today/zones/setup-card.tsx");
await setupCardReady;
const { NeedYou } = await import("../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { AskFound } = await import("../../apps/dashboard/src/surfaces/today/zones/found.tsx");
const { TodayZones } = await import("../../apps/dashboard/src/surfaces/today/zones/page.tsx");
const { useTodayArrangement } = await import("../../apps/dashboard/src/surfaces/today/arrangement.ts");
// The module instances the pages use: the seam's store, and the verbs the card's Skip and Hide press (`setupVerbs`).
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { setupVerbs } = await importSrc("apps/dashboard/src/surfaces/setup/surface.ts");
// When a run really goes, in the one sentence every receipt says (Today imports it from Campaigns).
const { bcWhenWords } = await import("../../apps/dashboard/src/surfaces/campaigns/broadcasts/when-words.ts");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => {
  let hit;
  walk(tree, (n) => {
    if (hit === undefined && pred(n)) hit = n;
  });
  return hit;
};
const findAll = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
/** A menu item's act runs its put-off without a promise to wait on: its few awaits settled (the page's timers are stubs). */
const settle = async () => {
  for (let i = 0; i < 8; i++) await null;
};
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const buttonsSaying = (tree, words) => findAll(tree, (n) => n.type === "button" && textOf(n).includes(words));
const mountHero = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => TodayAlertBand());
};
// The day's figures are Today so far's on a phone (PhoneSoFar) and the head's on a desk; a line that is down is said
// under the head (TodayAlertBand), and a reply that failed is a row of Need you (Today in three zones, 2 Nov 2026).
const mountCard = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => PhoneSoFar());
};
/** The day's four figures, which a desk draws in the head beside the greeting (figures.tsx TodayHeadFigures). */
const mountFigures = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => TodayHeadFigures());
};
const mountWarnings = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => TodayAlertBand());
};
/** The page on a desk, whole. */
const mountPage = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => TodayZones());
};
/** What the head says under the greeting, as Today tells it to the frame's head (zones/head.tsx). */
function HeadProbe() {
  useZonesStanding();
  return null;
}
const headSaid = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  again(() => HeadProbe());
  return textOf(standingSaid()?.sentence ?? null);
};
// What is left to set up, one card above the queue (TodaySetup): it reads Setup's surface, not the day's. Drawn as the page
// draws it, its coral the page's arrangement's (today/arrangement.ts).
const SetupAsPage = () => TodaySetup({ coral: useTodayArrangement().coral === "setup" });
const mountSetup = () => {
  fresh();
  return again(() => SetupAsPage());
};
/** Ask found as the page draws it, wide where it leads, its coral the arrangement's. */
const FoundAsPage = ({ wide }) => AskFound({ wide, coral: wide && useTodayArrangement().coral === "found" });
const mountQueue = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => NeedYou());
};
const todayWith = (channels, over = {}) =>
  toTodayVM(metrics({ channels, now: zeroNow, period: quietPeriod, ...over }), [], [], [], NOW);

test("REGRESSION (A21): a reply that failed to deliver opens its thread -- 'See the thread' opened the Inbox list", () => {
  const failed = conversation("cv9", "Rosa Díaz", [
    msg({ id: "m1", conversation_id: "cv9" }),
    msg({
      id: "m2",
      conversation_id: "cv9",
      direction: "outbound",
      sender: "ai",
      body: "Yes, Saturday at 3 works.",
      status: "failed",
      created_at: "2026-09-06T12:01:00Z",
    }),
  ]);
  // A reply that never left raises a hold on its thread (jobs settle.ts, reason send_failed).
  const hold = {
    id: "e9",
    conversation_id: "cv9",
    reason: "send_failed",
    details: null,
    state: "open",
    created_at: "2026-09-06T12:02:00Z",
  };
  const vm = toTodayVM(metrics({ period: { ...busyPeriod, send_failures: 1 } }), [failed], [hold], [], NOW);
  const warn = vm.recap.sentences.find((s) => s.warn);
  assert.equal(warn.to, "inbox/th-cv9", "REGRESSION: the failed send's sentence carried no thread");
  // Need you's row since Today in three zones (2 Nov 2026): the words that failed, sent again with Try again, and its door
  // her thread.
  const row = vm.queue.rows.find((r) => r.conversationId === "cv9");
  assert.equal(row.cta.to, "inbox/th-cv9", "REGRESSION: the row's door opened the Inbox list");
  assert.equal(row.failed.text, "Yes, Saturday at 3 works.");
  const queue = mountQueue(vm);
  assert.ok(buttonsSaying(queue, "Try again").length, textOf(queue));
  assert.equal(textOf(mountWarnings(vm)), "", "and not under the head: the band is for what stops every customer");
});

test("REGRESSION: Today's first screen is the work -- above it stood a greeting, a headline the queue says again, four sentences, a chip repeating its count, an arc and six stat cards, and on a phone the first thing needing a person started 679px down", () => {
  const vm = toTodayVM(metrics(), [conversation("cv1", "Rosa Díaz", [msg({})])], [], [], NOW);
  const standing = mountHero(vm);
  const said = textOf(standing);
  assert.equal(said, "", "nothing stands above the work while every line is up (the standing line went, 23 Sep)");
  assert.ok(!/Good (morning|afternoon|evening)/.test(said), "REGRESSION: a greeting above the work");
  assert.ok(!/need you/.test(said), "REGRESSION: a chip saying the queue's own count, over the queue");
  assert.equal(
    find(standing, (n) => typeof n.type === "function" && n.type.name === "PulseArc"),
    undefined,
    "REGRESSION: an arc saying the answered ratio a third time",
  );
  assert.equal(
    findAll(standing, (n) => typeof n.type === "function" && n.type.name === "StatCell").length,
    0,
    "REGRESSION: six stat cards over the work",
  );

  // In the head, the day's figures (a desk's, beside the greeting); and no pane under the work says them again in words
  // (Your brief's did, the redesign of 1 Nov 2026).
  const figures = mountFigures(vm);
  assert.deepEqual(
    findAll(figures, (n) => /^today-figure-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props["data-testid"]),
    ["today-figure-booked", "today-figure-answered", "today-figure-calls", "today-figure-new"],
    "the day's four figures",
  );
  const page = mountPage(vm);
  assert.equal(
    find(page, (n) => n.props?.["data-testid"] === "today-brief"),
    undefined,
    "no brief beside the work",
  );
  assert.ok(
    !/receptionist answered|reached the phone line/.test(textOf(page)),
    `REGRESSION: the figures say these already: ${textOf(page)}`,
  );
});

test("REGRESSION: approving a waiting run the server moved to nine says so on Today -- the toast said 'sending now'", async () => {
  globalThis.window.__BROADCASTS = {
    rows: [
      {
        id: "b-w",
        state: "pending_approval",
        playbook_id: "pb-1",
        name: "Win-back",
        audience: { label: "Win-back" },
        recipient_count: 3,
        scheduled_for: null,
        started_at: null,
        counts: { sent: 0, replied: 0 },
      },
    ],
  };
  const approved = { recipient_count: 3, scheduled_for: "2026-09-15T13:00:00Z", moved_from: "2026-09-15T02:00:00Z" };
  globalThis.window.__broadcasts = { approve: async () => ({ ok: true, data: approved }) };
  try {
    const tree = mountQueue(toTodayVM(metrics(), [], [], [], NOW));
    const row = find(tree, (n) => n.props?.["data-testid"] === "brief-run-row");
    await buttonsSaying(row, "Approve")[0].props.onClick();
    const said = textOf(flashes.at(-1).msg);
    assert.ok(!said.includes("sending now"), `REGRESSION: ${said}`);
    // The one sentence for when a send really goes (campaigns/broadcasts/when.tsx): the server moved it to nine.
    assert.ok(said.includes(bcWhenWords(approved)) && /messages go out/.test(said), said);
  } finally {
    delete globalThis.window.__BROADCASTS;
    delete globalThis.window.__broadcasts;
  }
});

test("the day's receipts are the view model's still, and no part of the page draws them", () => {
  const names = ["Rosa Díaz", "Nina Park", "Ada Lovelace"];
  const convs = names.map((name, i) =>
    conversation(`cv${i}`, name, [
      msg({ id: `in${i}`, conversation_id: `cv${i}`, created_at: `2026-09-06T1${i}:00:00Z` }),
      msg({
        id: `out${i}`,
        conversation_id: `cv${i}`,
        direction: "outbound",
        sender: "ai",
        body: `See you at ${i + 2}pm.`,
        status: "sent",
        created_at: `2026-09-06T1${i}:01:00Z`,
      }),
    ]),
  );
  const vm = toTodayVM(metrics(), convs, [], [], NOW);
  assert.equal(vm.recap.receipts.length, 3, "the fixture is a day with three replies");
  // The hero drew one of the three, then the brief all three, under its summary, in a third size of text (Ruben,
  // 7 Oct 2026: "too cluttered and busy"). What was replied is a question away: Ask reads the receipts.
  assert.equal(findAll(mountPage(vm), (n) => n.props?.["data-testid"] === "brief-receipt").length, 0);
});

test("a quiet day says what is listening in the head's sentence, and draws no list of lines", () => {
  const yesterday = conversation("cv1", "Rosa Díaz", [
    msg({ created_at: "2026-09-05T12:00:00Z" }),
    msg({
      id: "m-answer",
      direction: "outbound",
      sender: "ai",
      status: "delivered",
      created_at: "2026-09-05T12:01:00Z",
    }),
  ]);
  const vm = toTodayVM(metrics({ now: zeroNow, period: quietPeriod }), [yesterday], [], [], NOW);
  assert.ok(vm.quiet && vm.quiet.launchpad, "the fixture is a quiet day with an earlier conversation");
  // The list of lines and their numbers ("WhatsApp: +1 … · on") and the door to earlier conversations stood under the
  // summary as a block of their own. The head says the day; which lines are on is Connections' to say.
  const said = headSaid(vm);
  assert.ok(said.startsWith("Nothing needs you."), said);
  assert.ok(said.includes(vm.quiet.sub), `what is listening: ${said}`);
  const page = mountPage(vm);
  assert.ok(!find(page, (n) => n.props?.["data-testid"] === "brief-quiet-proof"));
  assert.equal(buttonsSaying(page, "earlier conversation").length, 0);
});

test("Listen stands beside the greeting, the kit head's `beside`, never at the sentence's end (the canvases of 1 Nov 2026)", () => {
  // Ask's voice, as the bridge publishes it: the device can speak, so Listen is drawn.
  holdAsk({
    canSpeak: () => true,
    state: () => "idle",
    watchSpeech: () => () => {},
    speak: async () => {},
    stopSpeaking() {},
  });
  try {
    const conv = conversation("cv1", "Rosa Díaz", [msg({ created_at: "2026-09-06T12:00:00Z" })]);
    setSurfaceValue("today", toTodayVM(metrics(), [conv], [], [], NOW));
    fresh();
    again(() => HeadProbe());
    const said = standingSaid();
    const listen = find(said.beside, (n) => n.props?.["data-testid"] === "today-listen");
    assert.ok(listen, "Listen, beside the greeting (a phone's frame stands it beside the bell)");
    assert.ok(!find(said.sentence, (n) => n.props?.["data-testid"] === "today-listen"), "not in the sentence");
    // On a phone the date beside them says the hour, its day short (the canvas: "Tue, Nov 3 · 8:05 AM"); every other
    // page's phone date is the day alone (kit/head/frame-head.tsx).
    assert.equal(said.dateHour, true);
  } finally {
    holdAsk(undefined);
  }
});

test("the address says the hour too, from the frame's first draw: a phone's date keeps one form as Today comes in", async () => {
  const { todayChrome } = await import("../../apps/dashboard/src/surfaces/today/chrome.ts");
  const { crumbsShown, forgetStanding } = await import("../../apps/dashboard/src/surfaces/kit/head/standing.ts");
  forgetStanding();
  const { crumbs, head } = todayChrome();
  crumbsShown(crumbs, false, head);
  assert.equal(
    standingSaid()?.dateHour,
    true,
    "REGRESSION: a phone's date said 'TUESDAY, NOVEMBER 3' until the page was in, then 'TUE, NOV 3 · 8:05 AM'",
  );
  forgetStanding();
});

/** A workspace's Setup read, as the surface publishes it (surfaces/setup/surface.ts): Setup's own view model over a DTO. */
const setupSurface = (over = {}) => {
  const dto = {
    business: {
      name: null,
      hours: false,
      services: 0,
      bookingLink: false,
      address: false,
      handoff: null,
      broken: false,
      receptionist: "none",
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0, offers: 0, offersSaidYes: 0 },
    requests: { line: null },
    ...over,
  };
  return { dto, role: "owner", later: [], rests: {}, vm: setupSteps({ ...dto, later: [], rests: {} }, NOW.getTime()) };
};
/** Setup's value on the seam (what `useSurface("setup")` answers): the card reads it there, not off the window. */
const feedSetup = (value) => setSurfaceValue("setup", value);

test("REGRESSION: with no line connected, Today does not say the receptionist is answering -- one sentence, and one door to finishing setting up", () => {
  feedSetup(setupSurface());
  try {
    const vm = todayWith([]);
    const hero = mountHero(vm);
    const recap = mountCard(vm);
    const queue = mountQueue(vm);
    const setup = mountSetup();
    const said = textOf(hero) + textOf(recap) + textOf(queue) + textOf(setup);
    assert.ok(
      !said.includes("answering on its own"),
      "REGRESSION: the queue said the receptionist was answering, with no line to answer on",
    );
    assert.ok(!said.includes("Queue clear — nothing needs you"), "nor that the queue was clear, as if all were well");
    assert.equal(buttonsSaying(setup, "Continue setting up").length, 1, "one door to the first run");
    const dot = find(setup, (n) => n.props?.className === "setup-card-dot");
    assert.equal(dot.props["aria-label"], "Not answering yet", "and the state it stands in, as its dot's name");
    assert.ok(textOf(setup).includes("Your business"), "it names the very next step");
    assert.equal(dot.props["data-tone"], "warn");
    assert.equal(
      [hero, recap, queue, setup].reduce((n, t) => n + buttonsSaying(t, "Open Setup").length, 0),
      0,
      "and none to the tab that is gone",
    );
    buttonsSaying(setup, "Continue setting up")[0].props.onClick();
    assert.equal(went.at(-1), "start");
  } finally {
    feedSetup(undefined);
  }
});

test("the card once it answers: Setup's own rows, WhatsApp first, folded to the next step and opened by its chevron, and Hide puts them all off for a week", async () => {
  const put = [];
  feedSetup(
    setupSurface({
      business: {
        name: "Harbor Moving",
        hours: true,
        services: 2,
        bookingLink: true,
        address: true,
        handoff: null,
        broken: false,
        receptionist: "set",
      },
      channels: {
        whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
        voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-07T14:00:00Z" },
      },
    }),
  );
  // The put-off is the surface's own verb (surface.ts setupVerbs.later), which the card and its rows both press: stood in
  // for here, on the one object they import, and given back after.
  const realLater = setupVerbs.later;
  setupVerbs.later = async (ids, change) => {
    put.push([ids, change]);
    // A put-off saved hands back its own undo, which puts its rows back as they stood (surface.ts writeEntries).
    return { ok: true, message: "", undo: async () => (put.push([ids, "undo"]), { ok: true, message: "" }) };
  };
  try {
    const card = mountSetup();
    const rows = findAll(card, (n) => /^setup-row-/.test(n.props?.["data-testid"] ?? ""));
    assert.equal(rows[0].props["data-testid"], "setup-row-whatsapp", "WhatsApp leads: it sends the booking link");
    assert.ok(rows.length > 1, "and what else is left follows it");
    // The card's compact rows (canvas R10): the next one's act coral, the others outlined, each with its Skip.
    const verbs = rows.map((r) => find(r, (n) => n.props?.["data-testid"] === "setup-verb"));
    assert.equal(verbs[0].props.className, "setup-card-btn primary");
    assert.ok(verbs.slice(1).every((v) => v.props.className === "setup-card-btn"));
    // Each row's Skip is a menu that says both choices before either is pressed (the refined canvas, 31 Oct 2026).
    const skipOf = (r) => find(r, (n) => Array.isArray(n.props?.groups) && /^Skip /.test(n.props?.label ?? ""));
    assert.ok(rows.every(skipOf), "each row can be skipped");
    const [week, good] = skipOf(rows[0]).props.groups[0].items;
    assert.deepEqual([week.label, good.label], ["For a week", "I don't need this"]);
    assert.match(week.meta, /^It comes back on \w{3}, \w{3} \d{1,2}\.$/, "the day it comes back, before the press");
    assert.equal(good.meta, "It's in Settings › Connections.", "and where it is set up from then");
    good.onSelect();
    await settle();
    assert.deepEqual(put.at(-1), [["whatsapp"], { on: true, why: "answer" }], "I don't need this: off for good");
    assert.equal(textOf(flashes.at(-1).msg), "Off your list. It's in Settings › Connections.");
    week.onSelect();
    await settle();
    assert.deepEqual(put.at(-1), [["whatsapp"], { on: true, why: "week" }], "For a week: a week, every time");
    assert.equal(textOf(find(card, (n) => n.props?.["data-testid"] === "today-setup-left")), `${rows.length} left`);
    // The count rides beside the first row's words too (canvas P9's phone), where no width draws it now: a phone draws
    // every row under the head's count, and hides each row's words.
    const aside = (r) => find(r, (n) => n.props?.className === "setup-card-aside");
    assert.ok(textOf(aside(rows[0])).endsWith(`${rows.length} left`));
    assert.ok(!aside(rows[1]), "and only there");
    // The chevron folds the card and opens it, as often as the owner likes: nothing is put off.
    const before = put.length;
    const fold = find(card, (n) => n.props?.["data-testid"] === "today-setup-fold");
    assert.equal(fold.props["aria-expanded"], true, "open until it is folded");
    fold.props.onClick();
    const folded = again(() => SetupAsPage());
    assert.equal(
      findAll(folded, (n) => /^setup-row-/.test(n.props?.["data-testid"] ?? "")).length,
      1,
      "folded: what is next",
    );
    assert.equal(
      find(folded, (n) => n.props?.["data-testid"] === "today-setup-hide"),
      undefined,
      "Hide with its rows",
    );
    assert.equal(find(folded, (n) => n.props?.["data-testid"] === "today-setup-fold").props["aria-expanded"], false);
    find(folded, (n) => n.props?.["data-testid"] === "today-setup-fold").props.onClick();
    const open = again(() => SetupAsPage());
    assert.equal(findAll(open, (n) => /^setup-row-/.test(n.props?.["data-testid"] ?? "")).length, rows.length, "open");
    assert.equal(put.length, before, "folding put nothing off");
    const hide = find(open, (n) => n.props?.["data-testid"] === "today-setup-hide");
    assert.equal(textOf(hide), "Hide for a week");
    await hide.props.onClick();
    assert.deepEqual(put.at(-1)[1], { on: true, why: "week" }, "a week for every row, never for good");
    const ids = rows.map((r) => r.props["data-testid"].slice("setup-row-".length));
    assert.deepEqual(put.at(-1)[0], ids, "Hide puts every row on the card off at once");
    const waiting = " Until it is set up, only calls to your receptionist's own number are answered.";
    assert.match(
      textOf(flashes.at(-1).msg),
      new RegExp(
        `^Finish setting up is hidden until \\w{3}, \\w{3} \\d{1,2}\\.${ids.includes("keep") ? waiting : ""}$`,
      ),
      "and says the day it comes back, never sending anyone to Setting up",
    );
    await flashes.at(-1).undo();
    assert.deepEqual(put.at(-1), [ids, "undo"], "its Undo is the put-off's own: every row back as it stood");
  } finally {
    setupVerbs.later = realLater;
    feedSetup(undefined);
  }
});

test("a press anywhere on the card's head folds it, and one on its own buttons stays theirs: a press stretched over the line with CSS reached a mouse and never a finger (8 Nov 2026)", () => {
  const realElement = globalThis.Element;
  globalThis.Element = class {
    constructor(inButton) {
      this.inButton = inButton;
    }
    closest(selector) {
      return selector === "button" && this.inButton ? {} : null;
    }
  };
  feedSetup(answeringSetup());
  const open = () =>
    find(
      again(() => SetupAsPage()),
      (n) => n.props?.["data-testid"] === "today-setup-fold",
    ).props["aria-expanded"];
  const pressHead = (inButton) =>
    find(
      again(() => SetupAsPage()),
      (n) => String(n.props?.className ?? "").includes("setup-card-head"),
    ).props.onClick({ target: new globalThis.Element(inButton) });
  try {
    mountSetup();
    assert.equal(open(), true, "open until it is folded");
    pressHead(false);
    assert.equal(open(), false, "the words on its line fold it");
    pressHead(true);
    assert.equal(
      open(),
      false,
      "the chevron and Hide are their own presses: this would have folded and opened it at once",
    );
    pressHead(false);
    assert.equal(open(), true, "and they open it again");
  } finally {
    globalThis.Element = realElement;
    feedSetup(undefined);
  }
});

test("after the first run, with the calendar in, the card's last row is the door to the appointment reminder; without one there is none", async () => {
  const answering = {
    business: {
      name: "Harbor Moving",
      hours: true,
      services: 2,
      bookingLink: true,
      address: true,
      handoff: null,
      broken: false,
      receptionist: "set",
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-07T14:00:00Z" },
    },
  };
  const put = [];
  const realLater = setupVerbs.later;
  setupVerbs.later = async (ids, change) => {
    put.push([ids, change]);
    return { ok: true, message: "", undo: async () => ({ ok: true, message: "" }) };
  };
  try {
    feedSetup(setupSurface(answering));
    const none = mountSetup();
    assert.ok(
      find(none, (n) => n.props?.["data-testid"] === "today-setup"),
      "the card is drawn",
    );
    assert.equal(
      find(none, (n) => n.props?.["data-testid"] === "today-setup-remind"),
      undefined,
      "no calendar: no reminder to offer",
    );
    feedSetup(setupSurface({ ...answering, calendar: { state: "ok" } }));
    const card = mountSetup();
    const row = find(card, (n) => n.props?.["data-testid"] === "today-setup-remind");
    assert.ok(row, "the reminder's row, the last in Setup's list");
    assert.equal(row.props.className, "setup-card-row", "drawn as Setup's rows are");
    // Its name whole and short, both drawn and one shown: the short one beside a phone's pill (the phone pass, 3 Nov 2026).
    const nameIn = (cls) => textOf(find(row, (n) => n.props?.className === cls));
    assert.deepEqual([nameIn("setup-card-long"), nameIn("setup-card-short")], ["The day-before reminder", "Reminders"]);
    assert.ok(textOf(row).includes("Your calendar is in. Remind each customer the day before."));
    const rows = findAll(card, (n) => /^setup-row-/.test(n.props?.["data-testid"] ?? "")).length;
    assert.equal(
      textOf(find(card, (n) => n.props?.["data-testid"] === "today-setup-left")),
      `${rows + 1} left`,
      "counted with Setup's rows",
    );
    const remind = find(card, (n) => n.props?.["data-testid"] === "today-setup-remind-go");
    assert.ok(remind, "one door to the appointment reminder");
    assert.equal(textOf(remind), "Turn on");
    remind.props.onClick();
    assert.equal(went.at(-1), "campaigns/sequences/new:moment:visit_tomorrow");
    const skip = find(row, (n) => Array.isArray(n.props?.groups) && n.props?.label === "Skip The day-before reminder");
    assert.ok(skip, "its Skip is the card's menu, as a row's is");
    skip.props.groups[0].items[0].onSelect();
    await settle();
    assert.deepEqual(
      put.at(-1),
      [["remind-skipped"], { on: true, why: "week" }],
      "For a week puts the reminder off, as a row is put off",
    );
    const hide = find(card, (n) => n.props?.["data-testid"] === "today-setup-hide");
    await hide.props.onClick();
    assert.ok(put.at(-1)[0].includes("remind-skipped"), "and Hide puts it off with the rows");
    assert.equal(put.at(-1)[0].length, rows + 1, "every row on the card, and the reminder");
  } finally {
    setupVerbs.later = realLater;
    feedSetup(undefined);
  }
});

test("the card draws nothing before Setup is read, nor once its read failed -- the seam holds undefined, then null", () => {
  for (const held of [undefined, null]) {
    feedSetup(held);
    try {
      const card = mountSetup();
      assert.equal(textOf(card), "", `nothing to say while Setup holds ${held}`);
      assert.equal(
        find(card, (n) => n.props?.["data-testid"] === "today-setup"),
        undefined,
        `no card while Setup holds ${held}`,
      );
    } finally {
      feedSetup(undefined);
    }
  }
});

test("REGRESSION: an email-only workspace is not told nothing can come in, nor that the receptionist is answering", () => {
  feedSetup({ vm: { line: null, readiness: { answering: false } } });
  try {
    const vm = todayWith([
      { kind: "email", status: "active", number: null, address: "bestmovers@mail.chanlytics.com" },
    ]);
    // With nothing in Need you the head says what the day is (Today in three zones, 2 Nov 2026).
    const said = [headSaid(vm), textOf(mountHero(vm)), textOf(mountQueue(vm))].join(" ");
    assert.equal(
      vm.standing.lines.text,
      "1 of 1 line connected",
      "REGRESSION: the page counted the routing rows, and email is not one (the count is contracts', for Ask)",
    );
    assert.ok(!/nothing can come in/i.test(said), "email comes in");
    assert.ok(
      !/answering on its own|receptionist is on/i.test(said),
      `the receptionist does not answer email: ${said}`,
    );
    assert.ok(!/nothing needs you/i.test(said), `the heading does not reassure over a line nobody answers: ${said}`);
    assert.match(said, /each email waits in Need you/);
  } finally {
    feedSetup(undefined);
  }
});

/** One idea of Ask's to approve: Ask found's one row. */
const idea = () => ({
  id: "p-1",
  kind: "message",
  needs: "operator",
  title: "Write to Rosa",
  summary: "Write to Rosa, as Ask would send it.",
  payload: {},
  undo: null,
});
/** Ask's morning, offered, with these cards. */
const morningWith = (...cards) => ({
  fetchedAt: Date.now(),
  dto: {
    day: "2026-09-06",
    state: "quiet",
    offered: true,
    thread_id: null,
    message_id: "m-1",
    headline: "",
    detail: "",
    cards,
    findings: [],
    rested: {},
    lately: [],
  },
});

/** A workspace answering, with WhatsApp and more still to set up: the card's rows. */
const answeringSetup = () =>
  setupSurface({
    business: {
      name: "Harbor Moving",
      hours: true,
      services: 2,
      bookingLink: true,
      address: true,
      handoff: null,
      broken: false,
      receptionist: "set",
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-07T14:00:00Z" },
    },
  });

test("while someone waits on you, what is left to set up stands under the queue, open as the owner left it, its acts quiet (the live walk's TODAY-1, 27 Oct 2026; the refined canvas, 31 Oct)", () => {
  const rowsOf = (t) => findAll(t, (n) => /^setup-row-/.test(n.props?.["data-testid"] ?? ""));
  const byId = (t, id) => find(t, (n) => n.props?.["data-testid"] === id);
  const held = { ...conversation("cv5", "Rosa Díaz", [msg({ conversation_id: "cv5" })]), state: "needs_human" };
  const hold = {
    id: "e5",
    conversation_id: "cv5",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: "2026-09-06T12:00:30Z",
  };
  const rosaWaits = () => toTodayVM(metrics(), [held], [hold], [], NOW);
  feedSetup(answeringSetup());
  setSurfaceValue("today", rosaWaits());
  try {
    const card = mountSetup();
    assert.ok(byId(card, "today-setup"), "the card stands");
    // It folded itself while someone waited, and its Show opened it for the visit while Hide put every row off for a
    // week: two presses that read as one toggle. It stays open now, under the queue, until its chevron folds it.
    assert.ok(rowsOf(card).length > 1, "open: nothing folds it but its chevron");
    assert.equal(byId(card, "today-setup-show"), undefined, "no Show");
    const verbs = findAll(card, (n) => n.props?.["data-testid"] === "setup-verb");
    assert.ok(
      verbs.every((v) => v.props.className === "setup-card-btn"),
      "the coral is the queue's while someone waits: every act here is quiet",
    );
  } finally {
    setSurfaceValue("today", undefined);
    feedSetup(undefined);
  }
  // The page: the work first while anyone waits on the owner, the chores first while nobody does, by the one count
  // (needs-you.ts: Need you's rows above To do and the runs waiting, from Today's own read; production, 27 Oct 2026: three
  // people waited and the chores led). Setting up and what was brought in are one card (the redesign of 1 Nov 2026).
  const work = () => {
    fresh();
    const page = again(() => TodayZones());
    const col = find(page, (n) => String(n.props?.className ?? "").includes("tz-col"));
    return col.props.children.filter(Boolean).map((c) => c.type.name ?? c.props["data-testid"]);
  };
  setSurfaceValue("today", todayWith([]));
  setSurfaceValue("ask_morning", morningWith(idea()));
  assert.deepEqual(
    work(),
    ["today-setting-up", "NeedYou", "ColdEmailNote", "AskFound"],
    "nobody waits on a quiet day: the chores lead, and Ask found stands wide in the work's column",
  );
  setSurfaceValue("ask_morning", undefined);
  assert.deepEqual(
    work(),
    ["today-setting-up", "NeedYou", "ColdEmailNote", "AskFound", "DayZone"],
    "and where Ask found has nothing either, the day stands in the one column rather than beside an empty one",
  );
  // Need you draws its pane while anyone waits: the page's arrangement knows it before anything draws (today/arrangement.ts).
  setSurfaceValue("today", rosaWaits());
  assert.deepEqual(work(), ["NeedYou", "ColdEmailNote", "today-setting-up"], "Rosa waits: the work leads");
  // A run waiting for a word is someone waiting too: a one-off broadcast waits until it is decided.
  const oneOff = {
    id: "b-one",
    state: "pending_approval",
    playbook_id: null,
    name: "VIP news",
    audience: { kind: "list", label: "VIPs" },
    recipient_count: 12,
    scheduled_for: null,
    when: "",
    started_at: null,
    created_at: "2026-09-06T10:00:00Z",
    counts: { sent: 0, replied: 0 },
  };
  // The campaigns' read, on the seam and on the window as the app holds it (campaigns/broadcasts/surface.ts mirrors it):
  // the count reads the one, the list's rows the other.
  setSurfaceValue("today", toTodayVM(metrics(), [], [], [], NOW));
  setSurfaceValue("broadcasts", { rows: [oneOff] });
  globalThis.window.__BROADCASTS = { rows: [oneOff] };
  try {
    assert.deepEqual(
      work(),
      ["NeedYou", "ColdEmailNote", "today-setting-up"],
      "a run waits for your OK: the work leads",
    );
  } finally {
    setSurfaceValue("broadcasts", undefined);
    globalThis.window.__BROADCASTS = undefined;
    setSurfaceValue("today", undefined);
  }
});

test("one coral across setting up and Ask found (the Moments board: else setting up, else Ask found's first act): the card's first act while it draws one, folded or open", () => {
  setSurfaceValue("ask_morning", morningWith(idea()));
  setSurfaceValue("today", todayWith([]));
  feedSetup(answeringSetup());
  const isCoral = (v) => /(^| )primary( |$)/.test(String(v.props.className ?? ""));
  const foundAct = () => {
    fresh();
    return find(
      again(() => FoundAsPage({ wide: true })),
      (n) => n.props?.["data-testid"] === "today-found-act",
    );
  };
  try {
    const card = mountSetup();
    const verbs = findAll(card, (n) => n.props?.["data-testid"] === "setup-verb");
    assert.ok(verbs.some(isCoral), "nobody waits: the card's first act is the coral");
    assert.equal(foundAct().props.variant, "quiet", "REGRESSION: Ask found's first act stood coral beside the card's");
    // Folded, the card still says what is next (8 Nov 2026), so its act keeps the coral.
    const open = mountSetup();
    press(find(open, (n) => n.props?.["data-testid"] === "today-setup-fold"));
    again(() => SetupAsPage());
    assert.equal(foundAct().props.variant, "quiet", "the card folded: its next step still holds the coral");
    // Unfolded again for the tests after this one: the fold is kept on the device.
    press(find(mountSetup(), (n) => n.props?.["data-testid"] === "today-setup-fold"));
  } finally {
    unmount();
    feedSetup(undefined);
    setSurfaceValue("ask_morning", undefined);
    setSurfaceValue("today", undefined);
  }
});

/** A batch to leads waiting for an OK, as the broadcasts surface holds it, or one beside it. */
const leadBatch = (over = {}) => ({
  id: "b-lead",
  state: "pending_approval",
  sequence_id: "seq-1",
  playbook_id: null,
  name: "Movers nearby",
  audience: { kind: "reach_out", label: "Movers nearby" },
  recipient_count: 17,
  held: 2,
  scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
  when: "today 6:00 PM",
  started_at: null,
  created_at: "2026-09-06T10:00:00Z",
  counts: { sent: 0, replied: 0 },
  ...over,
});

test("a batch to leads says when it goes and what the last earned, offers no Approve, and its Decide opens the emails an OK does not send", () => {
  globalThis.window.__BROADCASTS = {
    rows: [
      leadBatch(),
      leadBatch({
        id: "b-old",
        state: "sent",
        held: 0,
        started_at: "2026-09-01T10:00:00Z",
        counts: { sent: 20, replied: 3 },
      }),
    ],
  };
  try {
    const row = find(
      mountQueue(toTodayVM(metrics(), [], [], [], NOW)),
      (n) => n.props?.["data-testid"] === "brief-run-row",
    );
    assert.ok(row, "the batch is a row");
    const said = textOf(row);
    assert.match(
      said,
      /17 businesses. Waits for your OK; the first goes today 6:00 PM. Last batch: 20 sent, 3 replied./,
    );
    assert.deepEqual(buttonsSaying(row, "Approve"), [], "a batch to leads is never approved from a row");
    went.length = 0;
    buttonsSaying(row, "Decide 2")[0].props.onClick();
    assert.deepEqual(went, ["campaigns/sequences/seq-1/people"]);
  } finally {
    globalThis.window.__BROADCASTS = undefined;
  }
});

test("Ask found holds what Ask noticed, tagged as no idea of a model's, and says what came of an idea approved", () => {
  const noticed = {
    id: "finding-fell-seq-1",
    kind: "fix",
    needs: "operator",
    title: "Replies fell on Movers nearby",
    summary: "1 of 20 replied.",
    line: "1 of 20 replied.",
    payload: { door: "Look at it", to: "campaigns/sequences/seq-1" },
    undo: null,
  };
  setSurfaceValue("ask_morning", {
    fetchedAt: Date.now(),
    dto: {
      day: "2026-09-06",
      state: "quiet",
      offered: true,
      thread_id: null,
      message_id: null,
      headline: "",
      detail: "",
      cards: [],
      findings: [noticed],
      rested: {},
      lately: [{ title: "Find gyms", said: "Found 40 gyms" }],
    },
  });
  try {
    // Ask found is Today's third zone (Today in three zones, 2 Nov 2026): its rows stand open, under the day.
    setSurfaceValue("today", toTodayVM(metrics(), [], [], [], NOW));
    fresh();
    const found = again(() => AskFound({ wide: false }));
    const row = find(found, (n) => n.props?.["data-testid"] === "today-found-noticed");
    assert.ok(row, "what Ask noticed is a row of its own");
    assert.match(textOf(row), /Ask noticed/);
    assert.equal(buttonsSaying(row, "Look at it").length, 1, "its door, never an Approve");
    assert.equal(buttonsSaying(row, "Approve").length, 0);
    assert.match(
      textOf(find(found, (n) => n.props?.["data-testid"] === "today-found-came")),
      /Find gyms.*Found 40 gyms/,
    );
  } finally {
    setSurfaceValue("ask_morning", undefined);
    setSurfaceValue("today", undefined);
  }
});
