/**
 * Campaigns' home, the lifecycle (canvas A): the view model the page draws, EXECUTED over fixtures in the real surfaces' shape.
 *
 * Five moments around a customer, each covered or not, with the campaigns that are not one of them in quiet lines under
 * them; and three tiles: who can hear the workspace, what goes out in the next seven days, what came back in the last
 * thirty. Every word and number the page says is made by `campaignsHomeOf`, so the page composes and never derives; a
 * number the workspace could not count is null and never a zero, a surface not read leaves its sections out, and a zero is
 * shown as zero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York (the board's moment): so "tomorrow 10:00" is Saturday the 3rd. */
const NOW = Date.parse("2026-10-03T01:44:00Z");
const DAY = 86_400_000;

/** A playbook as the surface's card holds it. */
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cadence_days: 30,
  last_run_for: "2026-09-14",
  next: "tomorrow 10:00",
  triggerLabel: "Win-back",
  candidates: 0,
  held: 0,
  named: { pool: 5, saidYes: 0 },
  off: null,
  totals: { waiting: null },
  ...over,
});
const pool = (pool, candidates = 0, held = 0, saidYes = pool) => ({ candidates, held, pool, saidYes });
const trigger = (id, over = {}) => ({ id, offered: true, candidates: 0, named: null, ...over });

/** The playbooks surface of the board's workspace: a win-back running, everything else off; 3 visit tomorrow. */
const playbooks = (over = {}) => ({
  rows: [playbook()],
  pools: {
    new_week: pool(0),
    visit_tomorrow: pool(3, 3),
    visited: pool(0),
    quiet_30: pool(5, 0, 0, 0),
    proposal_waiting: pool(0),
  },
  triggers: ["visit_tomorrow", "visited", "quiet_30", "proposal_waiting", "everyone_monthly", "new_week"].map((id) =>
    trigger(id),
  ),
  timezone: ZONE,
  countsRead: true,
  ...over,
});

const run = (over = {}) => ({
  id: "r-1",
  name: "Win-back · Sep 14",
  state: "sent",
  when: "Sep 14 · 10:02 AM",
  scheduled_for: "2026-09-14T14:00:00Z",
  started_at: "2026-09-14T14:02:00Z",
  finished_at: "2026-09-14T14:03:00Z",
  recipient_count: 2,
  playbook_id: "pb-1",
  counts: { sent: 2, replied: 1 },
  ...over,
});

const reach = { people: 29, canHear: 7, saidMessages: 7, saidOffers: 0 };
const report = (over = {}) => ({
  days: 30,
  totals: { sent: 8, delivered: 8, read: 5, replied: 3, optIns: 3, optOuts: 2, ...over },
});
const broadcasts = (over = {}) => ({
  rows: [
    run(),
    run({
      id: "r-2",
      name: "The month's offer · Sep 8",
      when: "Sep 8 · 10:02 AM",
      scheduled_for: "2026-09-08T14:00:00Z",
      started_at: "2026-09-08T14:02:00Z",
      finished_at: "2026-09-08T14:04:00Z",
      recipient_count: 6,
      playbook_id: null,
      counts: { sent: 6, replied: 2 },
    }),
  ],
  number: { present: true },
  optIn: { phrase: "YES OFFERS", link: "https://wa.me/15550100?text=YES%20OFFERS" },
  reach,
  report: report(),
  ...over,
});

/** A starter as WhatsApp holds it once approved: the library's words and slots, which the booking rule reads. */
const template = (name, over = {}) => {
  const s = C.starterByKey(name);
  const id = `t-${name}-${over.language ?? "en_US"}-${over.channel ?? "whatsapp"}`;
  if (!s)
    return {
      id,
      channel: "whatsapp",
      name,
      language: "en_US",
      meta_status: "approved",
      variables: [],
      hidden_at: null,
      ...over,
    };
  const t = C.starterText(s, "en_US");
  return {
    id,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
    hidden_at: null,
    ...over,
  };
};

const LIBRARY = [template("call_text"), template("visit_reminder"), template("winback_offer")];
const input = (over = {}) => ({
  nowMs: NOW,
  tz: ZONE,
  playbooks: playbooks(),
  broadcasts: broadcasts(),
  library: LIBRARY,
  // The workspace's messages (the settings surface's `messages`): the Library's count reads these.
  messages: C.campaignMessagesOf(LIBRARY),
  reachOuts: [],
  ...over,
});
const home = (over = {}) => C.campaignsHomeOf(input(over));
const stage = (h, id) => h.rail.stages.find((s) => s.id === id);

/* -------------------------------------------------- the rail -------------------------------------------------- */

test("five moments in order, each with its caps, name, people, state and the yes it needs", () => {
  const h = home();
  assert.deepEqual(
    h.rail.stages.map((s) => [s.id, s.caps, s.name]),
    [
      ["first_contact", "First contact", "Your receptionist"],
      ["visit", "Visit tomorrow", "Visit reminder"],
      ["after", "After a visit", "How did it go"],
      ["quiet", "Quiet or lapsed", "Win-back"],
      ["proposal", "Proposal out", "Proposal follow-up"],
    ],
  );
  assert.deepEqual(
    h.rail.stages.map((s) => [s.people, s.unit]),
    [
      [0, "this week"],
      [3, "people"],
      [0, "yesterday"],
      [5, "people"],
      [0, "waiting"],
    ],
    "the people at each moment now, from the surface's pools",
  );
  assert.deepEqual(
    h.rail.stages.map((s) => s.needsWords),
    [
      "Answers whoever writes",
      "Reaches a yes to messages",
      "Reaches a yes to messages",
      "Needs a yes to offers",
      "Reaches a yes to messages",
    ],
  );
  assert.deepEqual(
    h.rail.stages.map((s) => s.needs),
    ["none", "messages", "messages", "offers", "messages"],
    "a moment needs what its message's kind asks (purposeOfPlaybook): a visit or a proposal is about their own, a win-back is an offer",
  );
});

test("the receptionist is always on; a running playbook is on with its clock; the rest are off with Turn on", () => {
  const h = home();
  assert.deepEqual(
    h.rail.stages.map((s) => [s.state, s.stateWords, s.covered]),
    [
      ["always", "Answers · asks for the yes", true],
      ["off", "Off", false],
      ["off", "Off", false],
      ["on", "On · daily 10:00", true],
      ["off", "Off", false],
    ],
  );
  assert.equal(h.rail.coveredWords, "2 of 5 moments covered", "the board's two of five");
  assert.equal(stage(h, "first_contact").act, null, "the receptionist is nobody's to turn on");
  assert.deepEqual(stage(h, "quiet").act, { kind: "open", label: "Open", playbookId: "pb-1" });
  assert.deepEqual(stage(h, "after").act, { kind: "turn_on", label: "Turn on", moment: "visited" });
});

/** What the workspace can send on, as the broadcasts surface reads it (contracts ChannelsReady). */
const ready = (over = {}) => ({
  whatsapp: { ready: false, why: "Connect a WhatsApp number first." },
  sms: { ready: false, why: "No texting line yet." },
  email: { ready: false, why: "Set up email in Settings › Connections first." },
  ...over,
});

test("first contact is covered only where there is a line for the receptionist to answer on; with none it is off, in words", () => {
  // A WhatsApp number is a line, whatever the channels' readiness says.
  assert.equal(stage(home(), "first_contact").covered, true);
  assert.equal(stage(home({ broadcasts: broadcasts({ ready: ready() }) }), "first_contact").state, "always");
  // No number and nothing that can send: the receptionist has nowhere to answer.
  const bare = home({ broadcasts: broadcasts({ number: { present: false }, ready: ready() }) });
  const none = stage(bare, "first_contact");
  assert.deepEqual(
    [none.state, none.covered, none.tone, none.stateWords, none.phoneWords, none.needsWords, none.act],
    ["off", false, "plain", "No line to answer on yet", "Off", "Connect a number or email to answer on", null],
  );
  assert.equal(
    bare.rail.coveredWords,
    "1 of 5 moments covered",
    "only the win-back covers: the receptionist has no line",
  );
  assert.deepEqual(bare.head.sentence.slice(1, 3), [{ b: "1 of 5" }, " moments are covered"]);
  // Any one channel that can send is a line: a texting line, or a mailbox.
  for (const channel of ["sms", "email"]) {
    const line = home({
      broadcasts: broadcasts({ number: { present: false }, ready: ready({ [channel]: { ready: true, why: null } }) }),
    });
    assert.deepEqual(
      [stage(line, "first_contact").state, stage(line, "first_contact").covered],
      ["always", true],
      channel,
    );
  }
  // Where nothing says there is none -- unread, failed, or the channels could not be read -- there is a line, as there was.
  for (const broadcastsRead of [
    undefined,
    null,
    broadcasts({ number: { present: false }, ready: null }),
    broadcasts({ number: { present: false } }),
  ]) {
    const unknown = home({ broadcasts: broadcastsRead });
    assert.deepEqual(
      [stage(unknown, "first_contact").state, stage(unknown, "first_contact").covered],
      ["always", true],
    );
  }
  // An off first contact is no "Turn on", no hint and no line in Coming up: it is nobody's to switch on.
  assert.equal(stage(bare, "first_contact").hint, null);
  assert.equal(
    bare.coming.rows.some((r) => r.id === "off:first_contact"),
    false,
  );
});

test("the head says offers by email are paused while the email channel's own read says so, and nothing otherwise", () => {
  const offers = (paused) => ({
    ok: !paused,
    why: paused ? "Offers by email are paused while complaints and bounces settle." : null,
    paused,
  });
  const withEmail = (o) => broadcasts({ ready: ready({ email: { ready: true, why: null, offers: o } }) });
  const pausedFor = { at: "2026-10-01T00:00:00Z", reason: "complaints" };
  const line = home({ broadcasts: withEmail(offers(pausedFor)) }).head.pausedLine;
  assert.equal(line, C.offersPausedLine({ paused: pausedFor }), "contracts' own sentence, from the read");
  assert.match(line, /Offers and news by email are paused: too many people marked offers as spam\./);
  assert.equal(
    home({ broadcasts: withEmail(offers(null)) }).head.pausedLine,
    null,
    "offers open: a quiet page says nothing",
  );
  assert.equal(home().head.pausedLine, null, "a read that carries no readiness says nothing");
  assert.equal(home({ broadcasts: undefined }).head.pausedLine, null);
  assert.equal(home({ broadcasts: null }).head.pausedLine, null);
  assert.equal(
    home({ broadcasts: broadcasts({ ready: ready({ email: { ready: true, why: null } }) }) }).head.pausedLine,
    null,
    "an email channel read before offers were asked says nothing of them",
  );
});

test("one off moment with people it would reach is the hint: Turn on · 3 tomorrow", () => {
  const h = home();
  assert.equal(stage(h, "visit").hint, "Turn on · 3 tomorrow");
  assert.deepEqual(stage(h, "visit").act, { kind: "turn_on", label: "Turn on · 3 tomorrow", moment: "visit_tomorrow" });
  assert.equal(stage(h, "after").hint, null, "only one is the hint");
  // The first off moment that reaches somebody, in the stages' order; a pool of people nobody can reach is no hint.
  const two = home({
    playbooks: playbooks({
      pools: { ...playbooks().pools, visit_tomorrow: pool(3, 0), visited: pool(2, 2), proposal_waiting: pool(4, 4) },
    }),
  });
  assert.equal(
    stage(two, "visit").hint,
    null,
    "three visit tomorrow, none of whom a run would reach: nothing to promise",
  );
  assert.equal(stage(two, "after").hint, "Turn on · 2 yesterday");
  assert.equal(stage(two, "proposal").hint, null);
});

test("a moment that was not counted says no number, never a zero it did not count", () => {
  const h = home({ playbooks: playbooks({ pools: { quiet_30: null, visit_tomorrow: null } }) });
  assert.equal(stage(h, "visit").people, null);
  assert.equal(stage(h, "quiet").people, null);
  assert.equal(stage(h, "visit").hint, null, "and no hint over a count that was not made");
  assert.equal(stage(h, "after").people, null, "a moment the pools do not hold at all");
});

test("a paused playbook is paused and not covered; a run waiting on you says so; a follow-up where deals are off runs nothing", () => {
  const paused = home({ playbooks: playbooks({ rows: [playbook({ state: "paused", next: "paused" })] }) });
  assert.deepEqual(
    [stage(paused, "quiet").state, stage(paused, "quiet").stateWords, stage(paused, "quiet").covered],
    ["paused", "Paused", false],
  );
  assert.equal(paused.rail.coveredWords, "1 of 5 moments covered");
  const waiting = home({
    playbooks: playbooks({ rows: [playbook({ totals: { waiting: { id: "r-9", recipient_count: 4 } } })] }),
  });
  assert.deepEqual(
    [stage(waiting, "quiet").state, stage(waiting, "quiet").stateWords, stage(waiting, "quiet").tone],
    ["on", "Waiting on you", "warn"],
  );
  const nodeals = home({
    playbooks: playbooks({
      rows: [playbook({ id: "pb-9", name: "Proposal follow-up", trigger: "proposal_waiting", off: "Deals are off." })],
    }),
  });
  assert.deepEqual(
    [stage(nodeals, "proposal").state, stage(nodeals, "proposal").covered, stage(nodeals, "proposal").act],
    ["not_here", false, null],
  );
});

test("where deals are off and nothing was made on the follow-up, the rail has four moments", () => {
  const pb = playbooks();
  const h = home({
    playbooks: { ...pb, triggers: pb.triggers.filter((t) => t.id !== "proposal_waiting") },
  });
  assert.deepEqual(
    h.rail.stages.map((s) => s.id),
    ["first_contact", "visit", "after", "quiet"],
  );
  assert.equal(h.rail.coveredWords, "2 of 4 moments covered");
  assert.ok(h.head.sentence.some((p) => typeof p === "object" && p.b === "2 of 4"));
});

test("the win-back is one moment by visits or by silence: a playbook on either is the stage, and a new one starts from the one offered", () => {
  const byVisits = home({
    playbooks: playbooks({
      rows: [playbook({ id: "pb-2", trigger: "lapsed" })],
      pools: { ...playbooks().pools, lapsed: pool(7, 5) },
      triggers: playbooks()
        .triggers.map((t) => (t.id === "quiet_30" ? { ...t, offered: false } : t))
        .concat(trigger("lapsed")),
    }),
  });
  assert.equal(stage(byVisits, "quiet").playbookId, "pb-2");
  assert.equal(stage(byVisits, "quiet").people, 7, "counted from the playbook's own moment");
  const none = home({
    playbooks: playbooks({
      rows: [],
      pools: { ...playbooks().pools, lapsed: pool(7, 5) },
      triggers: playbooks()
        .triggers.map((t) => (t.id === "quiet_30" ? { ...t, offered: false } : t))
        .concat(trigger("lapsed")),
    }),
  });
  assert.equal(
    stage(none, "quiet").moment,
    "lapsed",
    "a calendar is connected: the moment offered is the one by visits",
  );
  assert.equal(stage(none, "quiet").state, "off");
});

test("the stage names the playbook the owner made when there is one, and the moment's own words when not", () => {
  const h = home({ playbooks: playbooks({ rows: [playbook({ name: "Come back soon" })] }) });
  assert.equal(stage(h, "quiet").name, "Come back soon");
  assert.equal(stage(h, "visit").name, "Visit reminder");
});

/* ------------------------------------------------ the strips ------------------------------------------------- */

const strip = (h, id) => h.strips.find((s) => s.id === id);

test("the call's text: on while the phone agent has a message to text a caller who asks to book, said otherwise", () => {
  const on = strip(home(), "call_text");
  assert.deepEqual(
    [on.stateWords, on.tone, on.act],
    ["When a caller asks", "ok", { kind: "route", label: "Open", route: "messages" }],
  );
  const none = strip(home({ library: [template("visit_reminder", { variables: [] })] }), "call_text");
  assert.deepEqual([none.stateWords, none.tone], ["No message for it yet", "warn"]);
  assert.equal(
    strip(home({ library: null }), "call_text").stateWords,
    "",
    "a library that failed is the page's failed read",
  );
  assert.equal(strip(home({ library: undefined }), "call_text").stateWords, "", "not read yet: nothing said");
  const unapproved = strip(home({ library: [template("call_text", { meta_status: "pending" })] }), "call_text");
  assert.equal(
    unapproved.stateWords,
    "No message for it yet",
    "one WhatsApp has not approved cannot be texted (bookingTemplate)",
  );
});

test("the month's offer: its playbook's state and act, or a line that turns it on", () => {
  const month = (over) => playbook({ id: "pb-m", name: "The month's offer", trigger: "everyone_monthly", ...over });
  const running = strip(home({ playbooks: playbooks({ rows: [playbook(), month()] }) }), "pb-m");
  assert.deepEqual(
    [running.stateWords, running.act.kind, running.words],
    ["On · every 30 days", "open", "Every 30 days, to a yes to offers"],
  );
  const paused = strip(home({ playbooks: playbooks({ rows: [playbook(), month({ state: "paused" })] }) }), "pb-m");
  assert.deepEqual(
    [paused.stateWords, paused.tone, paused.act],
    ["Paused", "warn", { kind: "resume", label: "Resume", playbookId: "pb-m" }],
  );
  const off = strip(home(), "everyone_monthly");
  assert.deepEqual(
    [off.stateWords, off.act],
    ["Off", { kind: "turn_on", label: "Turn on", moment: "everyone_monthly" }],
  );
  const pb = playbooks();
  const gone = home({ playbooks: { ...pb, triggers: pb.triggers.filter((t) => t.id !== "everyone_monthly") } });
  assert.equal(strip(gone, "everyone_monthly"), undefined, "a moment the workspace is not offered is no line");
});

test("playbooks on a list, and any other that still runs, are lines of their own; a stage's playbook is not said twice", () => {
  const h = home({
    playbooks: playbooks({
      rows: [
        playbook(),
        playbook({ id: "pb-l", name: "Regulars", trigger: "saved_list", triggerLabel: "VIP regulars" }),
        playbook({ id: "pb-w", name: "Welcome", trigger: "new_week", triggerLabel: "Welcome" }),
        playbook({
          id: "pb-a",
          name: "Old list",
          trigger: "saved_list",
          triggerLabel: "Bridal",
          state: "paused",
          listArchived: true,
        }),
      ],
    }),
  });
  assert.deepEqual(
    h.strips.map((s) => s.id),
    ["call_text", "everyone_monthly", "pb-l", "pb-a", "pb-w"],
    "the call's text, the month's offer, the lists, then any other moment",
  );
  assert.equal(strip(h, "pb-l").words, "On a list · VIP regulars");
  assert.deepEqual(
    [strip(h, "pb-a").stateWords, strip(h, "pb-a").tone, strip(h, "pb-a").act.kind],
    ["Its list is archived", "warn", "open"],
  );
  assert.equal(strip(h, "pb-w").kind, "moment");
  assert.equal(strip(h, "pb-1"), undefined, "the win-back is the rail's");
});

test("a reach-out is a line: on, waiting on you, or paused with Resume", () => {
  const chain = (over = {}) => ({
    root_id: "ch-1",
    name: "Cold email to studios",
    search: { id: "s-1", name: "Studios near us" },
    state: "running",
    steps: [{}, {}],
    next: { waiting_run_id: null },
    ...over,
  });
  const on = strip(home({ reachOuts: [chain()] }), "ch-1");
  assert.deepEqual(
    [on.kind, on.words, on.stateWords, on.tone],
    ["reach_out", "Cold email to Studios near us · 2 steps", "On", "ok"],
  );
  assert.equal(
    strip(home({ reachOuts: [chain({ next: { waiting_run_id: "r-3" } })] }), "ch-1").stateWords,
    "Waiting on you",
  );
  const paused = strip(home({ reachOuts: [chain({ state: "paused" })] }), "ch-1");
  assert.deepEqual(
    [paused.stateWords, paused.act],
    ["Paused", { kind: "resume", label: "Resume", playbookId: "ch-1" }],
  );
  assert.equal(
    home({ reachOuts: null }).strips.some((s) => s.kind === "reach_out"),
    false,
    "a read that failed draws none",
  );
});

/* ------------------------------------------------- the head -------------------------------------------------- */

test("the head: the page's line with the moments covered and who can hear, and the Library with its count", () => {
  const h = home();
  assert.equal(h.head.title, "Campaigns");
  assert.deepEqual(h.head.sentence, [
    "What goes out on its own as a customer reaches a moment, and what you send yourself. ",
    { b: "2 of 5" },
    " moments are covered",
    ", and ",
    { b: "7 of your 29" },
    " people can hear from you",
    ".",
  ]);
  assert.deepEqual(h.head.library, { label: "Library", count: 3 });
  assert.equal(h.head.newMessage, "New message");
  const noReach = home({ broadcasts: undefined });
  assert.deepEqual(
    noReach.head.sentence.slice(-2),
    [" moments are covered", "."],
    "who can hear is not said before it is counted",
  );
});

/** A reach-out whose two steps each wrote an email, which the Library lists beside WhatsApp's rows. */
const emailChain = () => ({
  root_id: "ch-2",
  name: "Cold email to studios",
  search: { id: "s-1", name: "Studios near us" },
  state: "running",
  signed_by: "Sam",
  steps: [
    { id: "ch-2", n: 0, after_days: null, subject: "Quick one", body: "Hello", template_id: "t1" },
    { id: "n1", n: 1, after_days: 4, subject: null, body: "Checking in", template_id: "t2" },
  ],
  next: { waiting_run_id: null },
});

test("the library's count is the Library page's own: a message for each language, the emails of the reach-outs, never a hidden one or the sample", () => {
  const rows = [
    template("call_text"),
    template("call_text", { language: "es" }),
    template("visit_reminder"),
    template("hello_world"),
    template("old_offer", { hidden_at: "2026-09-01T00:00:00Z" }),
  ];
  const messages = C.campaignMessagesOf(rows);
  assert.equal(C.libraryCount(messages, 0), 3, "two languages of one name are two, a hidden one and the sample none");
  assert.equal(C.libraryCount(messages, 2), 5, "and the emails a reach-out writes are listed beside them");
  assert.equal(C.libraryCount(null, 2), null, "a read that failed is no zero");
  assert.equal(C.libraryCount(undefined, 0), null);
  assert.equal(C.libraryCount([], 0), 0);
  assert.equal(C.isLibrarySample("hello_world"), true);
  assert.equal(C.isLibrarySample("call_text"), false);
  // A message is one however many channels it has versions on, and needs no WhatsApp row to be counted.
  const email = (name, over = {}) => template(name, { channel: "email", ...over });
  assert.equal(
    C.libraryCount(C.campaignMessagesOf([...rows, email("visit_reminder"), email("call_text")]), 0),
    3,
    "an email beside a WhatsApp version is the same message, not another",
  );
  assert.equal(
    C.libraryCount(C.campaignMessagesOf([...rows, email("harbor_note")]), 0),
    4,
    "a message written for email alone is counted",
  );
  assert.equal(
    C.libraryCount(C.campaignMessagesOf([...rows, email("fall_note", { hidden_at: "2026-09-01T00:00:00Z" })]), 0),
    3,
    "and a hidden one is not, with or without a WhatsApp row",
  );
  assert.equal(
    C.libraryCount(C.campaignMessagesOf([email("hello_world")]), 0),
    0,
    "the sample is nobody's, on any channel",
  );
  // The home's Library act carries that count: the same function, over the same messages and the chains' emails.
  const h = home({ library: rows, messages, reachOuts: [emailChain()] });
  assert.equal(h.head.library.count, 5, "three messages and the two emails");
  assert.equal(
    home({ library: rows, messages, reachOuts: null }).head.library.count,
    3,
    "chains that could not be read list no emails, as the page has it",
  );
  assert.equal(home({ library: rows, messages, reachOuts: undefined }).head.library.count, 3);
  assert.equal(home({ messages: null }).head.library.count, null, "messages that could not be read are no zero");
});

test("the toasts the home raises are contracts' words: a name in the page's emphasis, a new playbook's run said where it now is, a phrase a browser would not copy said whole", () => {
  const T = C.LIFECYCLE_TOAST;
  assert.deepEqual(T.resumed("Win-back"), [{ b: "Win-back" }, " resumed"]);
  assert.deepEqual(T.changed("Win-back"), [{ b: "Win-back" }, " changed"]);
  const running = T.running("Win-back");
  assert.deepEqual(running[0], { b: "Win-back" });
  assert.match(
    running[1],
    /its next run is under Coming up, by your clock/,
    "there is no card now: the run is in Coming up",
  );
  assert.ok(!/card/.test(running[1]), "nothing points at a card the page no longer has");
  assert.equal(T.phraseCopied, "Phrase copied");
  assert.equal(T.copyFailed("YES OFFERS"), "Couldn't copy, the phrase is: YES OFFERS");
  assert.equal(T.nameless, "It");
  assert.equal(C.LIFECYCLE_WORDS.reading, "Reading…");
});

/* ---------------------------------------------- who can hear you ---------------------------------------------- */

test("who can hear you: In People, can get your messages, said yes to offers, each with what its yes opens", () => {
  const t = home().reach;
  assert.deepEqual(
    t.rungs.map((r) => [r.id, r.label, r.n]),
    [
      ["people", "In People", 29],
      ["messages", "Can get your messages", 7],
      ["offers", "Said yes to offers", 0],
    ],
  );
  assert.deepEqual(
    t.rungs.map((r) => r.opens),
    [
      null,
      "Opens: visit reminder, how did it go, proposal follow-up",
      "Opens: win-back, the month's offer, your notes",
    ],
  );
  assert.deepEqual(
    t.rungs.map((r) => Math.round(r.share * 100)),
    [100, 24, 0],
  );
  assert.deepEqual(
    t.rungs.map((r) => r.tone),
    ["plain", "plain", "warn"],
    "none who said yes to offers is the one rung that asks to be seen",
  );
  assert.deepEqual([`${t.phone.n} ${t.phone.of}`, t.phone.offers.words], ["7 of 29 can hear you", "0 to offers"]);
  assert.equal(t.phone.offers.tone, "warn", "none to offers is the phone's one line that asks to be seen");
});

test("the receptionist's note and the doors to the yes are drawn only where there is a number to ask on", () => {
  const t = home().reach;
  assert.equal(
    t.yes.note,
    "Your receptionist now asks for it. Once a person, inside a conversation they started. At the desk, the code or the phrase does the same.",
  );
  assert.deepEqual(
    t.yes.code,
    { kind: "route", label: "Show the code", route: "broadcasts/get-yes" },
    "the get-yes address the ledger's section answers",
  );
  assert.deepEqual([t.yes.phrase, t.yes.copy], ["YES OFFERS", "Copy the phrase"]);
  assert.match(t.phone.note, /asks for the yes to offers/);
  const none = home({
    broadcasts: broadcasts({ number: { present: false }, optIn: { phrase: "YES OFFERS", link: null } }),
  }).reach;
  assert.deepEqual([none.yes, none.phone.note], [null, null]);
  assert.equal(none.rungs.length, 3, "the ladder stands without a number");
});

test("who can hear you draws no ladder before the broadcasts are read, or when they could not be, or when its people could not be counted, and says which", () => {
  const out = home({ broadcasts: undefined }).reach;
  assert.deepEqual(
    [out.read, out.rungs, out.yes, out.phone],
    ["reading", null, null, null],
    "not read yet: reading, quietly",
  );
  assert.equal(home({ broadcasts: undefined }).failed.reach, null, "and not failed");
  const failed = home({ broadcasts: null }).reach;
  assert.deepEqual([failed.read, failed.rungs], ["failed", null], "a read that failed is its own state");
  assert.deepEqual(home({ broadcasts: null }).failed.reach, {
    what: "who can hear you",
    body: "The ladder shows once it reads. Everything else here is current.",
    surface: "broadcasts",
  });
  const uncounted = home({ broadcasts: broadcasts({ reach: null }) });
  assert.deepEqual([uncounted.reach.read, uncounted.reach.rungs], ["failed", null], "its people could not be counted");
  assert.equal(uncounted.failed.reach.surface, "broadcasts", "and its Retry reads the broadcasts again");
  assert.equal(uncounted.failed.coming, null, "the runs were read: only the ladder failed");
  assert.equal(home().reach.read, "read");
  const empty = home({
    broadcasts: broadcasts({ reach: { people: 0, canHear: 0, saidMessages: 0, saidOffers: 0 } }),
  }).reach;
  assert.deepEqual(
    empty.rungs.map((r) => [r.n, r.share]),
    [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    "a workspace with nobody in People is zeroes, not a division by nothing",
  );
});

test("what a yes opens names only the moments this workspace has: not the follow-up where deals are off", () => {
  const pb = playbooks();
  const h = home({ playbooks: { ...pb, triggers: pb.triggers.filter((t) => t.id !== "proposal_waiting") } });
  assert.equal(h.reach.rungs[1].opens, "Opens: visit reminder, how did it go");
});

test("reachCountsOf counts everyone once from each row's own answers", () => {
  const row = (messages, offers, canHear) => ({
    saidYes: { messages, offers },
    canReceive: { messages: canHear, offers: false },
  });
  assert.deepEqual(C.reachCountsOf([row(true, false, true), row(true, true, false), row(false, false, false)]), {
    people: 3,
    canHear: 1,
    saidMessages: 2,
    saidOffers: 1,
  });
  assert.deepEqual(C.reachCountsOf([]), { people: 0, canHear: 0, saidMessages: 0, saidOffers: 0 });
});

/* ------------------------------------------------- coming up ------------------------------------------------- */

const coming = (over) => home(over).coming;

test("coming up: a running moment's next run with who will get it, and an off moment with people waiting offering Turn on", () => {
  const t = coming();
  assert.deepEqual(
    t.rows.map((r) => [r.kind, r.what, r.when, r.pill]),
    [
      ["moment", "Win-back", { day: "Tomorrow", at: "10:00" }, { tone: "warn", label: "Nobody" }],
      ["off", "Visit reminder", { day: "Every", at: "day" }, null],
    ],
    "the visit reminder has 3 waiting and is off; how did it go has none and is not a line",
  );
  assert.equal(t.rows[0].why, "0 of 5 will get it · none said yes to offers");
  assert.equal(t.rows[1].why, "Off · 3 people visit tomorrow");
  assert.deepEqual(t.rows[1].act, { kind: "turn_on", label: "Turn on", moment: "visit_tomorrow" });
  assert.deepEqual(t.rows[0].act, { kind: "open", label: "Open", playbookId: "pb-1" });
  assert.equal(t.rules, "Sends wait for 9:00–20:59 · one a week per person, across every moment");
});

test("coming up while the workspace is paused (billing) says so where a time stood, for every running moment, and promises nobody", () => {
  const ready = {
    whatsapp: { ready: true, why: null },
    sms: { ready: false, why: "x" },
    email: { ready: false, why: "y" },
  };
  // The playbooks surface's own readiness says it, or the broadcasts' (the home reads either).
  for (const [what, over] of [
    ["the playbooks' readiness", { playbooks: playbooks({ ready: { ...ready, paused: true } }) }],
    ["the broadcasts' readiness", { broadcasts: broadcasts({ ready: { ...ready, paused: true } }) }],
  ]) {
    const t = coming(over);
    const win = t.rows.find((r) => r.what === "Win-back");
    assert.deepEqual(win.when, { day: "Paused", at: "for billing" }, `${what}: no "Tomorrow 10:00"`);
    assert.equal(win.why, "The workspace is paused, so nothing goes until billing resumes", what);
    assert.deepEqual(win.pill, { tone: "warn", label: "Workspace paused" }, what);
    assert.deepEqual(win.act, { kind: "open", label: "Open", playbookId: "pb-1" }, "its door is the same");
    // Who will get it is not said: nobody does, until billing resumes.
    assert.ok(!win.why.includes("will get it"), what);
    // The moments that are off still offer Turn on, as before.
    assert.ok(
      t.rows.some((r) => r.kind === "off"),
      what,
    );
  }
  // Not paused (or not known to be), the row is the time it was.
  for (const over of [
    {},
    { playbooks: playbooks({ ready: { ...ready, paused: false } }) },
    { playbooks: playbooks({ ready: null }), broadcasts: broadcasts({ ready: null }) },
  ])
    assert.deepEqual(coming(over).rows[0].when, { day: "Tomorrow", at: "10:00" });
  // The card's own label, from the surface, is the one the rows are made from: a pause leaves it unparseable as a time, and the
  // row says paused all the same.
  const labelled = coming({
    playbooks: playbooks({ rows: [playbook({ next: "after billing resumes" })], ready: { ...ready, paused: true } }),
  });
  assert.deepEqual(labelled.rows[0].when, { day: "Paused", at: "for billing" });
  // A moment that runs nothing here is no line, paused or not.
  const archived = coming({
    playbooks: playbooks({ rows: [playbook({ listArchived: true })], ready: { ...ready, paused: true } }),
  });
  assert.ok(!archived.rows.some((r) => r.kind === "moment"));
});

test("a moment that reaches people says how many, and who waits out the week; a count that failed says so", () => {
  const sends = coming({
    playbooks: playbooks({ rows: [playbook({ candidates: 3, held: 2, named: { pool: 5, saidYes: 5 } })] }),
  });
  assert.equal(sends.rows[0].why, "3 of 5 will get it · 2 heard from you this week and wait");
  assert.deepEqual(sends.rows[0].pill, { tone: "ok", label: "3 people" });
  // A run sends its cap and no more: the next run's share is what "will get it" promises, and the rest wait for later
  // runs. A new win-back with 300 quiet people said "300 will get it" over a run that sends 25.
  const capped = coming({
    playbooks: playbooks({
      rows: [playbook({ candidates: 300, held: 4, cap_per_run: 25, named: { pool: 420, saidYes: 380 } })],
    }),
  });
  assert.equal(
    capped.rows[0].why,
    "25 of 420 will get it · up to 275 more on later runs, 25 a run · 4 heard from you this week and wait",
  );
  // A visit's moment has no cap: a reminder is owed to everyone with a visit, and tomorrow's visits have no later run.
  const visits = coming({
    playbooks: playbooks({
      rows: [
        playbook({
          trigger: "visit_tomorrow",
          candidates: 40,
          held: 0,
          cap_per_run: 25,
          named: { pool: 40, saidYes: 40 },
        }),
      ],
    }),
  });
  assert.equal(visits.rows[0].why, "40 of 40 will get it");
  assert.deepEqual(visits.rows[0].pill, { tone: "ok", label: "40 people" });
  assert.deepEqual(capped.rows[0].pill, { tone: "ok", label: "25 people" });
  // Under the cap, or a card drawn without one, the count is said whole, as before.
  const under = coming({
    playbooks: playbooks({
      rows: [playbook({ candidates: 3, held: 0, cap_per_run: 25, named: { pool: 5, saidYes: 5 } })],
    }),
  });
  assert.equal(under.rows[0].why, "3 of 5 will get it");
  const heard = coming({
    playbooks: playbooks({ rows: [playbook({ candidates: 0, held: 2, named: { pool: 5, saidYes: 5 } })] }),
  });
  assert.deepEqual(
    [heard.rows[0].why, heard.rows[0].pill.label],
    ["2 heard from you this week and wait", "Waiting out the week"],
  );
  const unread = coming({ playbooks: playbooks({ rows: [playbook({ candidates: null, held: null, named: null })] }) });
  assert.deepEqual([unread.rows[0].why, unread.rows[0].pill], ["Who it reaches could not be counted", null]);
  const nobodyOn = coming({ playbooks: playbooks({ rows: [playbook({ named: { pool: 0, saidYes: 0 } })] }) });
  assert.equal(nobodyOn.rows[0].why, "Nobody is on it yet");
});

test("a paused or archived playbook has no next run; today's run says today", () => {
  const rows = [
    playbook({ id: "a", state: "paused", next: "paused" }),
    playbook({ id: "b", trigger: "saved_list", listArchived: true }),
    playbook({ id: "c", next: "today 20:00", candidates: 1, held: 0, named: { pool: 1, saidYes: 1 } }),
  ];
  const t = coming({ playbooks: playbooks({ rows }) });
  assert.deepEqual(
    t.rows.filter((r) => r.kind === "moment").map((r) => [r.id, r.when]),
    [["moment:c", { day: "Today", at: "20:00" }]],
  );
  const within = coming({
    playbooks: playbooks({ rows: [playbook({ next: "today, within the hour", candidates: 2, held: 0 })] }),
  });
  assert.deepEqual(within.rows[0].when, { day: "Today", at: "Within the hour" });
});

test("a scheduled run and a run waiting on you are lines, in time order, and stand for their playbook's own line", () => {
  const rows = [
    run({
      id: "r-s",
      state: "scheduled",
      name: "Autumn hours",
      playbook_id: null,
      scheduled_for: "2026-10-06T14:00:00Z",
      recipient_count: 22,
      started_at: null,
      finished_at: null,
    }),
    run({
      id: "r-w",
      state: "pending_approval",
      name: "Win-back · Oct 3",
      playbook_id: "pb-1",
      scheduled_for: "2026-10-03T14:00:00Z",
      recipient_count: 4,
      started_at: null,
      finished_at: null,
    }),
    run({
      id: "r-far",
      state: "scheduled",
      name: "Next month",
      playbook_id: null,
      scheduled_for: "2026-10-20T14:00:00Z",
      started_at: null,
      finished_at: null,
    }),
  ];
  const t = coming({ broadcasts: broadcasts({ rows: [...rows, ...broadcasts().rows] }) });
  assert.deepEqual(
    t.rows.map((r) => [r.kind, r.what, r.pill && r.pill.label]),
    [
      ["run", "Win-back", "Waiting on you"],
      ["run", "Autumn hours", "22 people"],
      ["off", "Visit reminder", null],
    ],
    "the win-back's own line gives way to its run, named for the playbook; a run past the week is not here",
  );
  assert.deepEqual(t.rows[0].act, { kind: "route", label: "Open", route: "broadcasts/run:r-w" });
  assert.deepEqual(t.rows[1].when, { day: "Tue", at: "10:00 AM" });
});

test("coming up is left out before the playbooks are read", () => {
  assert.equal(coming({ playbooks: undefined }), null);
});

test("coming up never says nothing is set to go out for a week it could not see: the runs are the broadcasts' read, out or failed", () => {
  // Nothing scheduled and no moment running: read, it is "nothing is set to go out in the next 7 days".
  const idle = {
    playbooks: playbooks({ rows: [], pools: {}, triggers: [] }),
    broadcasts: broadcasts({ rows: [] }),
  };
  const read = coming(idle);
  assert.deepEqual(
    [read.read, read.rows.length, read.empty],
    ["read", 0, "Nothing is set to go out in the next 7 days."],
  );
  // The same workspace with its broadcasts not read yet: reading, and no sentence about an empty week.
  const reading = coming({ ...idle, broadcasts: undefined });
  assert.deepEqual([reading.read, reading.rows, reading.empty], ["reading", [], null]);
  assert.match(reading.rules, /one a week per person/, "what the sending rules say is true of any week");
  // Failed: its own state, the kit's failed read in the tile, with the surface its Retry reads.
  const failed = coming({ ...idle, broadcasts: null });
  assert.deepEqual([failed.read, failed.rows, failed.empty], ["failed", [], null]);
  assert.deepEqual(home({ ...idle, broadcasts: null }).failed.coming, {
    what: "what is coming up",
    body: "What is coming shows once it reads. Everything else here is current.",
    surface: "broadcasts",
  });
  assert.equal(home({ ...idle, broadcasts: undefined }).failed.coming, null, "unread has not failed");
  // A moment running with its next run is not said while the runs that would stand for it are unread: no half a week.
  assert.equal(coming({ broadcasts: undefined }).rows.length, 0);
  assert.ok(coming().rows.length > 0, "read, the week has its lines");
});

/* ------------------------------------------------ what came back ----------------------------------------------- */

const results = (over) => home(over).results;

test("what came back: the funnel from what was sent, who said yes and who asked to stop, and the latest runs each linking to its run", () => {
  const t = results();
  assert.deepEqual(t.headline, { n: 3, words: "wrote back, of 8 sent" });
  assert.deepEqual(
    t.funnel.map((f) => [f.label, f.n, f.share]),
    [
      ["Sent", 8, 1],
      ["Delivered", 8, 1],
      ["Read", 5, 5 / 8],
      ["Replied", 3, 3 / 8],
    ],
  );
  assert.equal(t.yes, "3 said yes · 2 asked to stop");
  assert.deepEqual(
    t.runs.map((r) => [r.name, r.words, r.result, r.route]),
    [
      ["Win-back", "Sep 14 · 10:02 AM · 2 sent", "1 reply", "broadcasts/run:r-1"],
      ["The month's offer · Sep 8", "Sep 8 · 10:02 AM · 6 sent", "2 replies", "broadcasts/run:r-2"],
    ],
    "newest first; a playbook's run is named for it, a run sent by hand keeps its own name",
  );
  assert.equal(t.days, 30);
  assert.equal(t.quiet, false);
});

test("where a text or an email went too (0030), the funnel's read is a share of WhatsApp's own sends and a line says so; with nothing by WhatsApp there is no read to show", () => {
  const mixed = results({ broadcasts: broadcasts({ report: report({ readOf: 6 }) }) });
  assert.deepEqual(
    mixed.funnel.map((f) => [f.id, f.n, f.share]),
    [
      ["sent", 8, 1],
      ["delivered", 8, 1],
      ["read", 5, 5 / 6],
      ["replied", 3, 3 / 8],
    ],
  );
  assert.equal(mixed.funnel.find((f) => f.id === "read").meter, "Read: 5 of WhatsApp's 6");
  assert.equal(mixed.readNote, "Read is of WhatsApp's 6: a text or an email keeps no read receipt.");
  const noWhatsApp = results({ broadcasts: broadcasts({ report: report({ read: 0, readOf: 0 }) }) });
  assert.deepEqual(
    noWhatsApp.funnel.map((f) => f.id),
    ["sent", "delivered", "replied"],
  );
  assert.equal(noWhatsApp.readNote, "These went by text or email, which keep no read receipt.");
  // WhatsApp alone, or a report from before the channels were counted: as it always was, and no line.
  assert.deepEqual(
    [results().readNote, results({ broadcasts: broadcasts({ report: report({ readOf: 8 }) }) }).readNote],
    [null, null],
  );
  assert.equal(results().funnel.find((f) => f.id === "read").meter, "Read: 5");
  // What a screen reader hears the list as: its steps, a read where there is one.
  assert.deepEqual(
    [results().funnelLabel, noWhatsApp.funnelLabel],
    ["Sent, delivered, read and replied", "Sent, delivered and replied"],
  );
  assert.equal(results({ broadcasts: broadcasts({ report: null }) }).funnelLabel, null, "no funnel, no label");
});

test("a zero is shown as zero, and a period with nothing in it is said once", () => {
  const zero = results({
    broadcasts: broadcasts({
      rows: [],
      report: report({ sent: 0, delivered: 0, read: 0, replied: 0, optIns: 0, optOuts: 0 }),
    }),
  });
  assert.deepEqual(zero.headline, { n: 0, words: "messages sent in 30 days" });
  assert.equal(zero.funnel, null, "no bars over nothing sent");
  assert.equal(zero.yes, "0 said yes · 0 asked to stop");
  assert.equal(zero.quiet, true);
  const noReplies = results({ broadcasts: broadcasts({ rows: [run({ counts: { sent: 2, replied: 0 } })] }) });
  assert.equal(noReplies.runs[0].result, "0 replies");
});

test("a report that could not be read leaves its numbers out and the runs stand; the home says so in `failed`", () => {
  const t = results({ broadcasts: broadcasts({ report: null }) });
  assert.deepEqual([t.headline, t.funnel, t.yes, t.quiet], [null, null, null, false]);
  assert.equal(t.runs.length, 2);
  assert.equal(t.read, "read", "the tile was read: only its numbers could not be");
  assert.equal(home({ broadcasts: broadcasts({ report: null }) }).failed.results, null, "the broadcasts were read");
});

test("what came back says it is reading before the broadcasts are read, and that it could not when they failed, with the period in words", () => {
  const out = results({ broadcasts: undefined });
  assert.deepEqual(
    [out.read, out.note, out.days, out.headline, out.funnel, out.yes, out.runs, out.quiet],
    ["reading", "30 days", 30, null, null, null, [], false],
    "never 'nothing went out' for a period it could not see",
  );
  const failed = results({ broadcasts: null });
  assert.deepEqual([failed.read, failed.headline, failed.quiet, failed.runs], ["failed", null, false, []]);
  assert.deepEqual(home({ broadcasts: null }).failed.results, {
    what: "what came back",
    body: "The numbers show once they read. Everything else here is current.",
    surface: "broadcasts",
  });
  assert.equal(home({ broadcasts: undefined }).failed.results, null);
  assert.equal(results().note, "30 days");
  assert.equal(results({ broadcasts: broadcasts({ report: report({}) }) }).read, "read");
  assert.equal(
    results({ broadcasts: broadcasts({ report: { days: 1, totals: report().totals } }) }).note,
    "1 day",
    "the period is counted in its own words",
  );
});

/* --------------------------------------------- reads that failed ---------------------------------------------- */

test("a read that failed is said where its data would be, in contracts' words, with the surface its Retry reads", () => {
  const none = { templates: null, counts: null, chains: null, report: null, reach: null, coming: null, results: null };
  assert.deepEqual(home().failed, none, "everything read: nothing to say");
  assert.deepEqual(
    home({ playbooks: undefined, broadcasts: undefined, library: undefined, reachOuts: undefined }).failed,
    none,
    "a surface not read yet has not failed",
  );
  assert.deepEqual(home({ library: null }).failed.templates, {
    what: "your templates",
    body: "The call's text and the Library's count show once they read. Everything else here is current.",
    surface: "settings",
  });
  assert.deepEqual(home({ playbooks: playbooks({ countsRead: false }) }).failed.counts, {
    what: "who each moment reaches",
    body: "The moments show who they reach once it reads. Everything else here is current.",
    surface: "playbooks",
  });
  assert.deepEqual(home({ reachOuts: null }).failed.chains, {
    what: "your reach-outs",
    body: "The moments above are current.",
    surface: "reach_outs",
  });
  assert.deepEqual(home({ broadcasts: broadcasts({ report: null }) }).failed.report, {
    what: "this period's numbers",
    body: "The runs below stand.",
    surface: "broadcasts",
  });
  // One failing leaves the others alone: a failed library is not a failed report.
  const one = home({ library: null }).failed;
  assert.deepEqual(
    [one.counts, one.chains, one.report, one.reach, one.coming, one.results],
    [null, null, null, null, null, null],
  );
  // The broadcasts failing is said in each tile made from it, and in no other.
  const b = home({ broadcasts: null }).failed;
  assert.deepEqual([b.templates, b.counts, b.chains, b.report], [null, null, null, null]);
  assert.deepEqual(
    [b.reach?.surface, b.coming?.surface, b.results?.surface],
    ["broadcasts", "broadcasts", "broadcasts"],
  );
});

test("only a run that went out in the period is a line: not one scheduled, not one older than the thirty days; three at most", () => {
  const many = Array.from({ length: 5 }, (_, i) =>
    run({
      id: `r-${i}`,
      name: `Run ${i}`,
      playbook_id: null,
      finished_at: new Date(NOW - (i + 1) * DAY).toISOString(),
      started_at: null,
      scheduled_for: new Date(NOW - (i + 1) * DAY).toISOString(),
    }),
  );
  const old = run({ id: "r-old", name: "Old", playbook_id: null, finished_at: new Date(NOW - 45 * DAY).toISOString() });
  const queued = run({ id: "r-q", name: "Queued", state: "scheduled", playbook_id: null });
  const t = results({ broadcasts: broadcasts({ rows: [old, queued, ...many] }) });
  assert.deepEqual(
    t.runs.map((r) => r.name),
    ["Run 0", "Run 1", "Run 2"],
  );
});
