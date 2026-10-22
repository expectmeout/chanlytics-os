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
import { toTodayVM, toLiveVM, setupSteps } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, kitPages } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

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
// A call on the line now, as the calls route returns it (live-page-controls.test.mjs), against the real clock.
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const liveCall = () => ({
  id: "c-live",
  retell_call_id: "call_abc123def456",
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  from_e164: "+16465550123",
  from_raw: null,
  to_e164: "+13055550100",
  started_at: ago(90_000),
  ended_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [{ role: "user", content: "Hi, is Marisa in?" }],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: ago(90_000),
  updated_at: ago(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
});

/* -------------------------------- the pages, drawn -------------------------------- */

const went = [];
const flashes = [];
installLegacyReact({
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __clock: { dayKey: () => "2026-09-06", time: () => "9:00 AM" },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// The record kit, as the app publishes it (surfaces/kit/kit-globals.ts), for the pages that still draw it by name.
Object.assign(globalThis.window, kitPages);
for (const k of ["StatePill", "EmptyState", "FailedRead", "PolicyChip", "StatStrip", "StatCell"])
  globalThis[k] = globalThis.window[k] || (({ children }) => children ?? null);
globalThis.useHotkey = () => {};
globalThis.window.usePPToast = () => [null, (m) => flashes.push(m)];
// Today's pages are TSX (surfaces/today/pages), drawn by import over the day and Setup the seam holds (surface-values.ts).
// Setup's rows are the surface's own (surfaces/setup/rows), imported by the card, not published on the window.
const { HeroBrief } = await import("../../../../apps/dashboard/src/surfaces/today/pages/brief.tsx");
const { TodayCard } = await import("../../../../apps/dashboard/src/surfaces/today/pages/card.tsx");
const { TodayBriefPane } = await import("../../../../apps/dashboard/src/surfaces/today/pages/brief-pane.tsx");
// The card is a chunk of its own (setup-card-body.tsx), asked for as Today's page loads: drawn here once it is in.
const { TodaySetup, setupCardReady } =
  await import("../../../../apps/dashboard/src/surfaces/today/pages/setup-card.tsx");
await setupCardReady;
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
// The module instances the pages use: the seam's store, and the verbs the card's Skip and Hide press (`setupVerbs`).
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { setupVerbs } = await importSrc("apps/dashboard/src/surfaces/setup/surface.ts");
// When a run really goes, in the one sentence every receipt says (Today imports it from Campaigns).
const { bcWhenWords } = await import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/when-words.ts");

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
  return again(() => HeroBrief());
};
// The day's figures are the day's card (TodayCard); its lines (the receipts, the proof, a reply that failed) are the
// brief's, beside the queue (TodayBriefPane, canvas E3).
const mountCard = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => TodayCard());
};
const mountBrief = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => TodayBriefPane());
};
// What is left to set up, one card above the queue (TodaySetup): it reads Setup's surface, not the day's.
const mountSetup = () => {
  fresh();
  return again(() => TodaySetup());
};
const mountQueue = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  return again(() => AgentCommand());
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
  const vm = toTodayVM(metrics({ period: { ...busyPeriod, send_failures: 1 } }), [failed], [], [], NOW);
  const warn = vm.recap.sentences.find((s) => s.warn);
  assert.equal(warn.to, "inbox/th-cv9", "REGRESSION: the failed send's sentence carried no thread");
  buttonsSaying(mountBrief(vm), "See the thread")[0].props.onClick();
  assert.equal(went.at(-1), "inbox/th-cv9");
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

  // Under the work: the day's figures, and only the lines they do not carry.
  const card = mountCard(vm);
  assert.ok(
    find(card, (n) => n.props?.["data-testid"] === "today-figure-messages"),
    "the day's figures",
  );
  const beats = findAll(
    mountBrief(vm),
    (n) => typeof n.props?.className === "string" && n.props.className.includes("brief-beat-text"),
  ).map(textOf);
  assert.ok(
    !beats.some((b) => /receptionist answered|reached the phone line|messages? in/.test(b)),
    `REGRESSION: the figures say these already: ${beats.join(" | ")}`,
  );
});

test("REGRESSION (A21): Open Live beside a call in progress opens that call -- it opened Live's list, where the oldest call leads", () => {
  globalThis.window.__LIVE = toLiveVM([liveCall()], [], ZONE, new Date());
  try {
    buttonsSaying(mountQueue(toTodayVM(metrics(), [], [], [], NOW)), "Open Live")[0].props.onClick();
    assert.equal(went.at(-1), "live/c-live");
  } finally {
    delete globalThis.window.__LIVE;
  }
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

test("the brief is one summary: the day's receipts are the view model's still, and none is drawn under it", () => {
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
  // 7 Oct 2026: "too cluttered and busy"). What was replied is a question away now: the follow-up asks Ask.
  const brief = mountBrief(vm);
  assert.equal(findAll(brief, (n) => n.props?.["data-testid"] === "brief-receipt").length, 0);
  assert.ok(
    find(brief, (n) => n.props?.["data-testid"] === "today-brief-line"),
    "the summary stands",
  );
});

test("a quiet day says its proof in the summary, and draws no list of lines under it", () => {
  const yesterday = conversation("cv1", "Rosa Díaz", [msg({ created_at: "2026-09-05T12:00:00Z" })]);
  const vm = toTodayVM(metrics({ now: zeroNow, period: quietPeriod }), [yesterday], [], [], NOW);
  assert.ok(vm.quiet && vm.quiet.launchpad, "the fixture is a quiet day with an earlier conversation");
  const hero = mountBrief(vm);
  // The list of lines and their numbers ("WhatsApp: +1 … · on") and the door to earlier conversations stood under the
  // summary as a block of their own. The summary says the day; which lines are on is Connections' to say.
  assert.ok(!find(hero, (n) => n.props?.["data-testid"] === "brief-quiet-proof"));
  assert.equal(buttonsSaying(hero, "earlier conversation").length, 0);
  assert.ok(textOf(find(hero, (n) => n.props?.["data-testid"] === "today-brief-line")).length > 0);
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
  return { dto, role: "owner", later: [], vm: setupSteps({ ...dto, later: [] }, NOW.getTime()) };
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
    assert.equal(dot.props["aria-label"], "Next: your business", "and the step it opens on, as its dot's name");
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

test("the card once it answers: Setup's own rows, WhatsApp first, and Hide puts them all off for this person", async () => {
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
  setupVerbs.later = async (ids, on) => {
    put.push([ids, on]);
    return { ok: true, message: "" };
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
    assert.ok(
      rows.every((r) => find(r, (n) => n.props?.className === "setup-card-skip")),
      "each row can be skipped",
    );
    assert.equal(textOf(find(card, (n) => n.props?.["data-testid"] === "today-setup-left")), `${rows.length} left`);
    // The count rides beside the first row's words too (canvas P9's phone), where no width draws it now: a phone draws
    // every row under the head's count, and hides each row's words.
    const aside = (r) => find(r, (n) => n.props?.className === "setup-card-aside");
    assert.ok(textOf(aside(rows[0])).endsWith(`${rows.length} left`));
    assert.ok(!aside(rows[1]), "and only there");
    const hide = find(card, (n) => n.props?.["data-testid"] === "today-setup-hide");
    await hide.props.onClick();
    assert.equal(put.at(-1)[1], true);
    const ids = rows.map((r) => r.props["data-testid"].slice("setup-row-".length));
    assert.deepEqual(put.at(-1)[0], ids, "Hide puts every row on the card off at once");
    assert.equal(
      textOf(flashes.at(-1).msg),
      `All ${ids.length} put off. They stay in Setting up for when you're ready.`,
      "and says so",
    );
    await flashes.at(-1).undo();
    assert.deepEqual(put.at(-1), [ids, false], "its Undo takes them all back");
  } finally {
    setupVerbs.later = realLater;
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
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-07T14:00:00Z" },
    },
  };
  const put = [];
  const realLater = setupVerbs.later;
  setupVerbs.later = async (ids, on) => {
    put.push([ids, on]);
    return { ok: true, message: "" };
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
    const rowsWithout = findAll(none, (n) => /^setup-row-/.test(n.props?.["data-testid"] ?? "")).length;
    feedSetup(setupSurface({ ...answering, calendar: { state: "ok" } }));
    const card = mountSetup();
    const row = find(card, (n) => n.props?.["data-testid"] === "today-setup-remind");
    assert.ok(row, "the reminder's row, the last in Setup's list");
    assert.equal(row.props.className, "setup-card-row", "drawn as Setup's rows are");
    assert.ok(
      textOf(row).startsWith("The day-before reminderYour calendar is in. Remind each customer the day before."),
    );
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
    const skip = find(card, (n) => n.props?.["data-testid"] === "today-setup-remind-skip");
    await skip.props.onClick();
    assert.deepEqual(put.at(-1), [["remind-skipped"], true], "Skip puts the reminder off, as a row is put off");
    const hide = find(card, (n) => n.props?.["data-testid"] === "today-setup-hide");
    await hide.props.onClick();
    assert.ok(put.at(-1)[0].includes("remind-skipped"), "and Hide puts it off with the rows");
    assert.equal(put.at(-1)[0].length, rowsWithout + 1);
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
    const said = textOf(mountHero(vm)) + textOf(mountQueue(vm));
    assert.equal(
      vm.standing.lines.text,
      "1 of 1 line connected",
      "REGRESSION: the page counted the routing rows, and email is not one (the count is contracts', for Ask)",
    );
    assert.ok(!said.includes("nothing can come in"), "email comes in");
    assert.ok(!said.includes("answering on its own"), "the receptionist does not answer email");
    assert.ok(!said.includes("nothing needs you"), `the heading does not reassure over a line nobody answers: ${said}`);
    assert.match(said, /every email waits for you in the Inbox/);
  } finally {
    feedSetup(undefined);
  }
});
