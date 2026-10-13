/**
 * Campaigns' ledger (spec 2026-10-09 §4.1): every campaign of a workspace in one list, grouped by the moment it stands
 * on in the journey's order, then Lists & offers, Reach-outs and, past seven rows, the one-off sends. EXECUTED through
 * contracts' campaignsHomeOf over fixtures in the surfaces' shape: one campaign per moment, three on one, a deleted
 * playbook's run, the chains absent, failed and past twenty, the counts, the sort keys, six rows and seven.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York: "tomorrow 10:00 AM" is Saturday the 3rd, 14:00 UTC. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

/** A playbook as the playbooks surface's card holds it. */
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cadence_days: 30,
  cap_per_run: 25,
  last_run_for: "2026-09-14",
  next: "tomorrow 10:00 AM",
  triggerLabel: "Win-back",
  candidates: 4,
  held: 0,
  named: { pool: 5, saidYes: 4 },
  off: null,
  totals: { waiting: null },
  ...over,
});
const pool = (n, candidates = 0) => ({ candidates, held: 0, pool: n, saidYes: n });
const TRIGGERS = ["visit_tomorrow", "visited", "quiet_30", "proposal_waiting", "everyone_monthly", "saved_list"].map(
  (id) => ({ id, offered: true, candidates: 0, named: null }),
);
const playbooks = (rows, over = {}) => ({
  rows,
  pools: {
    new_week: pool(2),
    visit_tomorrow: pool(3, 3),
    visited: pool(1),
    quiet_30: pool(5, 4),
    proposal_waiting: pool(0),
  },
  triggers: TRIGGERS,
  timezone: ZONE,
  countsRead: true,
  ...over,
});
/** A run waiting on the person, as the broadcasts surface lists it: made for the business's day (2 Oct in New York). */
const run = (over = {}) => ({
  id: "r-1",
  name: "Win-back · Oct 2",
  state: "pending_approval",
  when: "tomorrow 10:00 AM",
  scheduled_for: "2026-10-03T14:00:00Z",
  started_at: null,
  finished_at: null,
  recipient_count: 7,
  playbook_id: "pb-1",
  counts: { sent: 0, replied: 0 },
  run_for: "2026-10-02",
  ...over,
});
const broadcasts = (rows = []) => ({
  rows,
  number: { present: true },
  optIn: { phrase: "YES OFFERS", link: null },
  reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 4 },
});
/** One campaign's last 30 days as campaign_series' `sources` say them. */
const source = (id, sent, replied, kind = "playbook", name = id) => ({
  id,
  kind,
  name,
  sent,
  replied,
  lastAt: "2026-09-28T15:00:00Z",
});
const report = (sources = []) => ({
  days: 30,
  totals: { sent: 0, delivered: 0, read: 0, replied: 0, optIns: 0, optOuts: 0 },
  sources,
});
/** A reach-out's chain as the reach-outs surface holds it, as far as its row reads it. */
const chain = (root_id, over = {}) => ({
  root_id,
  name: `Reach out · ${root_id}`,
  search: { id: "s-1", name: "Trainers" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: null,
  steps: [{}, {}],
  mailboxes: [],
  next: { waiting_run_id: null },
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const input = (over = {}) => ({
  nowMs: NOW,
  tz: ZONE,
  playbooks: playbooks([playbook()]),
  broadcasts: broadcasts(),
  library: [],
  messages: [],
  reachOuts: [],
  report: report(),
  shape: { calendar: "feed", dealsOn: true, word: "appointment" },
  chains: undefined,
  ...over,
});
const ledger = (over = {}) => C.campaignsHomeOf(input(over)).ledger;
const group = (l, id) => l.groups.find((g) => g.id === id);
const row = (l, id) => l.groups.flatMap((g) => g.rows).find((r) => r.id === id);

test("one campaign per moment: the journey's groups in order, then Lists & offers and Reach-outs; each campaign once", () => {
  const rows = [
    playbook({ id: "pb-v", name: "Reminder", trigger: "visit_tomorrow", named: { pool: 3, saidYes: 3 } }),
    playbook({ id: "pb-a", name: "Check-in", trigger: "visited" }),
    playbook(),
  ];
  const l = ledger({ playbooks: playbooks(rows) });
  assert.deepEqual(
    l.groups.map((g) => g.id),
    ["first_contact", "before", "after", "proposal", "quiet", "lists", "reach_out"],
  );
  assert.deepEqual(
    group(l, "before").rows.map((r) => r.id),
    ["pb-v"],
  );
  assert.deepEqual(group(l, "proposal").rows, [], "an empty moment draws, with its Turn on");
  assert.deepEqual(group(l, "proposal").add, { kind: "turn_on", label: "Turn on", moment: "proposal_waiting" });
  assert.deepEqual([group(l, "before").caps, group(l, "before").meta], ["Appointment tomorrow", "1 campaign · 1 on"]);
  assert.deepEqual(l.counts, { all: 3, running: 3, needs: 0, paused: 0 });
  const v = row(l, "pb-v");
  assert.deepEqual(
    [v.kind, v.status, v.stateWords, v.tone, v.hint],
    ["playbook", "on", "On · daily 10:00 AM", "ok", "The day before an appointment on the calendar"],
  );
  assert.deepEqual(v.people, { n: 3, unit: "people" });
  assert.deepEqual(v.open, { kind: "open", label: "Open", playbookId: "pb-v" });
  assert.equal(v.act, null, "no switch on a row (decision 5): a running campaign's act is its drawer");
  assert.deepEqual(v.next, { words: "tomorrow 10:00 AM", atMs: Date.parse("2026-10-03T14:00:00Z") });
  assert.equal(v.results, "none", "counted, and nothing went in the period");
  assert.ok(v.search.includes("reminder") && v.search.includes("appointment tomorrow"), v.search);
  assert.deepEqual([l.period, l.results, l.tools, l.sentOnce], ["Last 30 days", "read", false, null]);
  assert.equal(l.words, C.LIFECYCLE_WORDS.ledger);
});

test("First contact holds the receptionist and the call's text as rows of their own kind: never counted, no Turn on, each a door", () => {
  const l = ledger();
  const fc = group(l, "first_contact");
  assert.equal(fc.add, null);
  const [receptionist, callText] = fc.rows;
  assert.deepEqual(
    [receptionist.kind, receptionist.status, receptionist.stateWords, receptionist.open, receptionist.results],
    [
      "receptionist",
      "always",
      "Answers · asks for the yes",
      { kind: "route", label: "Open", route: "admin/workspace" },
      "uncounted",
    ],
    "the receptionist opens its settings: every row on the list opens something (11 Oct 2026)",
  );
  assert.deepEqual(
    [callText.kind, callText.stateWords, callText.tone, callText.open],
    ["call_text", "No message for it yet", "warn", { kind: "route", label: "Open", route: "messages" }],
    "with no message for it, the Library, where one is written",
  );
  assert.equal(l.counts.needs, 0, "the call's text is not a campaign: its amber is not a campaign needing you");
});

/** The call's text as WhatsApp holds it once approved: the starter's words and slots, which the booking rule reads. */
const callTextTemplate = (over = {}) => {
  const s = C.starterByKey("call_text");
  const t = C.starterText(s, "en_US");
  return {
    id: "t-call-text",
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
    hidden_at: null,
    ...over,
  };
};

test("the call's text says what the library holds: one WhatsApp approved is on, one it has not is none yet, and a library unread or failed says nothing", () => {
  const callText = (library) => row(ledger({ library }), "call_text");
  const on = callText([callTextTemplate()]);
  assert.deepEqual([on.status, on.stateWords, on.tone], ["always", "Live", "ok"]);
  // Its door opens the message in a drawer of its own over the home, by its name (11 Oct 2026: never the Library's page).
  assert.deepEqual(on.open, { kind: "route", label: "Open", route: `campaigns/message:${callTextTemplate().name}` });
  const unapproved = callText([callTextTemplate({ meta_status: "pending" })]);
  assert.deepEqual(
    [unapproved.status, unapproved.stateWords, unapproved.tone],
    ["off", "No message for it yet", "warn"],
    "one WhatsApp has not approved cannot be texted (bookingTemplate)",
  );
  for (const library of [undefined, null])
    assert.deepEqual(
      [callText(library).stateWords, callText(library).tone],
      ["", "plain"],
      `${library}: the page's failed read says it, or nothing is known yet`,
    );
});

test("the month's offer not offered here is no row, and the chains a read could not reach are no rows: the group stands with its door", () => {
  const pb = playbooks([playbook()]);
  const notOffered = ledger({ playbooks: { ...pb, triggers: pb.triggers.filter((t) => t.id !== "everyone_monthly") } });
  assert.equal(row(notOffered, "everyone_monthly"), undefined, "a moment the workspace is not offered is no line");
  assert.deepEqual(group(notOffered, "lists").rows, [], "and Lists & offers holds nothing in its place");
  assert.equal(group(notOffered, "lists").meta, "No campaign yet");
  const offered = row(ledger(), "everyone_monthly");
  assert.deepEqual(
    [offered.kind, offered.stateWords, offered.act],
    ["offer", "Off", { kind: "turn_on", label: "Turn on", moment: "everyone_monthly" }],
  );
  const failed = C.campaignsHomeOf(input({ reachOuts: null }));
  assert.deepEqual(group(failed.ledger, "reach_out").rows, [], "a read that failed draws no chain");
  assert.deepEqual(group(failed.ledger, "reach_out").add, {
    kind: "route",
    label: "Find businesses to write to",
    route: "clients/leads",
  });
  assert.equal(failed.failed.chains.surface, "reach_outs", "the page says the read failed, with its Retry");
  // Its line says nothing of chains it could not see, unread or failed: "—", never "No campaign yet".
  for (const [what, reachOuts] of [
    ["failed", null],
    ["unread", undefined],
  ])
    assert.equal(
      group(ledger({ reachOuts }), "reach_out").meta,
      "—",
      `${what}: REGRESSION: the group said No campaign yet beside its couldn't-read notice`,
    );
  assert.equal(group(ledger({ reachOuts: [] }), "reach_out").meta, "No campaign yet", "read, and none: said");
  assert.equal(group(ledger({ reachOuts: [chain("ro-1")] }), "reach_out").meta, "1 campaign · 1 on");
});

test("three campaigns on one moment: all in its group, the stage's lead first, the group saying how they stand", () => {
  const rows = [
    playbook({ id: "pb-p", name: "Win-back · paused", state: "paused", next: "paused" }),
    playbook(),
    playbook({
      id: "pb-l",
      name: "Win-back · by visits",
      trigger: "lapsed",
      totals: { waiting: { id: "r-1", recipient_count: 7 } },
    }),
  ];
  const over = { playbooks: playbooks(rows), broadcasts: broadcasts([run({ playbook_id: "pb-l" })]) };
  const l = ledger(over);
  const quiet = group(l, "quiet");
  assert.deepEqual(
    quiet.rows.map((r) => r.id),
    ["pb-1", "pb-p", "pb-l"],
    "the lead (a running one, the newest of them) first, then the rest as they came",
  );
  assert.equal(quiet.meta, "3 campaigns · 1 on · 1 waiting · 1 paused");
  const paused = row(l, "pb-p");
  assert.deepEqual([paused.status, paused.tone, paused.next], ["paused", "plain", { words: "Paused", atMs: null }]);
  assert.equal(paused.act.kind, "resume");
  assert.deepEqual(paused.act.ask, {
    question: "Resume Win-back · paused?",
    detail: "Next run tomorrow 10:00 AM, about 4 people",
  });
  const waiting = row(l, "pb-l");
  assert.deepEqual(
    [waiting.status, waiting.stateWords, waiting.tone],
    ["waiting", "Waiting for your approval", "warn"],
  );
  assert.deepEqual(
    waiting.waiting,
    { runId: "r-1", people: 7, refusal: null },
    "approved or skipped on its row (decision 14)",
  );
  assert.deepEqual(waiting.next, { words: "Waiting for your approval", atMs: NOW });
  assert.deepEqual(l.counts, { all: 3, running: 2, needs: 1, paused: 1 });
  const stage = C.campaignsHomeOf(input(over)).rail.stages.find((s) => s.id === "quiet");
  assert.deepEqual(stage.bar, { on: 1, waiting: 1, paused: 1, of: 3 });
});

test("Resume under auto says in full that it sends on its own (decision 7); under ask, or with the mode unread, when and how many alone", () => {
  const rows = [playbook({ id: "pb-p", state: "paused", next: "paused", policy_class: "reengage" })];
  const detail = (modes) => row(ledger({ playbooks: playbooks(rows, { modes }) }), "pb-p").act.ask.detail;
  assert.equal(
    detail({ reengage: "auto" }),
    "Next run tomorrow 10:00 AM, about 4 people. It sends on its own: nothing will wait for your approval.",
  );
  assert.equal(detail({ reengage: "ask" }), "Next run tomorrow 10:00 AM, about 4 people");
  assert.equal(detail(null), "Next run tomorrow 10:00 AM, about 4 people", "unread: the mode is not guessed");
  // A moment that could not be counted: when alone, never "about 0 people" nobody counted.
  const uncounted = [playbook({ id: "pb-u", state: "paused", next: "paused", candidates: null, named: null })];
  assert.equal(
    row(ledger({ playbooks: playbooks(uncounted) }), "pb-u").act.ask.detail,
    "Next run tomorrow 10:00 AM",
    "REGRESSION: the question said about 0 people of a moment the server could not count",
  );
  assert.equal(
    C.LIFECYCLE_WORDS.ledger.resume.detail("tomorrow 10:00 AM", 0),
    "Next run tomorrow 10:00 AM, about 0 people",
  );
});

test("a workspace paused is one reading: a row and Coming up's line refuse the same run, whichever surface says it", () => {
  const open = { ready: true, why: null };
  const ready = (paused) => ({ whatsapp: open, sms: open, email: open, paused });
  const rows = [playbook({ id: "pb-w", totals: { waiting: { id: "r-1", recipient_count: 7 } } })];
  for (const [what, pbPaused, bcPaused] of [
    ["the broadcasts' readiness alone", false, true],
    ["the playbooks' readiness alone", true, false],
  ]) {
    const home = C.campaignsHomeOf(
      input({
        playbooks: playbooks(rows, { ready: ready(pbPaused) }),
        broadcasts: { ...broadcasts([run({ playbook_id: "pb-w" })]), ready: ready(bcPaused) },
      }),
    );
    const line = home.coming.rows.find((r) => r.id === "run:r-1");
    assert.equal(line.waiting.refusal, C.CAMPAIGNS_PAUSED_WORDS, `${what}: Coming up refuses it`);
    assert.deepEqual(
      row(home.ledger, "pb-w").waiting,
      line.waiting,
      `${what}: REGRESSION: the row offered Approve while Coming up refused the same run`,
    );
  }
  const neither = C.campaignsHomeOf(
    input({
      playbooks: playbooks(rows, { ready: ready(false) }),
      broadcasts: { ...broadcasts([run({ playbook_id: "pb-w" })]), ready: ready(false) },
    }),
  );
  assert.deepEqual(row(neither.ledger, "pb-w").waiting, { runId: "r-1", people: 7, refusal: null });
});

test("the counts are campaigns': running, needing you (a run waiting or an archived list, the one amber) and paused", () => {
  const rows = [
    playbook({ id: "pb-w", totals: { waiting: { id: "r-1", recipient_count: 7 } } }),
    playbook({
      id: "pb-a",
      name: "Regulars",
      trigger: "saved_list",
      triggerLabel: "Regulars",
      state: "paused",
      listArchived: true,
    }),
    playbook({ id: "pb-m", name: "Monthly", trigger: "everyone_monthly", state: "paused" }),
    playbook({ id: "pb-o", name: "Follow-up", trigger: "proposal_waiting", off: "Deals are off." }),
  ];
  const l = ledger({ playbooks: playbooks(rows), reachOuts: [chain("ro-1", { state: "paused" })] });
  assert.deepEqual(l.counts, { all: 5, running: 1, needs: 2, paused: 3 });
  const archived = row(l, "pb-a");
  assert.deepEqual(
    [archived.kind, archived.stateWords, archived.tone, archived.act],
    ["list", "Its list is archived", "warn", null],
  );
  const off = row(l, "pb-o");
  assert.deepEqual([off.status, off.stateWords, off.act], ["not_here", "Not running here", null]);
  assert.equal(row(l, "pb-m").kind, "offer");
  assert.equal(row(l, "everyone_monthly"), undefined, "the month's offer made is its own row, not the Turn on line");
});

test("a deleted playbook's run and a one-off send are the period's sent-once, a footer under seven rows; a playbook's source naming no row is in none", () => {
  const l = ledger({
    report: report([
      source("b-old", 12, 2, "broadcast", "Win-back · Sep 14"),
      source("b-news", 30, 4, "broadcast", "Autumn news"),
      source("pb-gone", 9, 1),
    ]),
  });
  assert.deepEqual(l.sentOnce, { n: 2, open: { kind: "route", label: "Sent", route: "broadcasts" } });
  assert.equal(group(l, "sent_once"), undefined, "under seven rows: the footer, no group");
  assert.equal(row(l, "pb-gone"), undefined);
  assert.equal(l.counts.all, 1);
});

test("six rows keep the page short; the seventh brings the tools, and the one-off sends become a group counted under All", () => {
  const lists = (n) =>
    Array.from({ length: n }, (_, i) =>
      playbook({ id: `pb-${i}`, name: `List ${i}`, trigger: "saved_list", triggerLabel: `List ${i}` }),
    );
  const sources = [source("b-1", 30, 4, "broadcast", "Autumn news")];
  const six = ledger({ playbooks: playbooks(lists(6)), report: report(sources) });
  assert.deepEqual([six.counts.all, six.tools, six.sentOnce?.n], [6, false, 1]);
  const seven = ledger({ playbooks: playbooks(lists(7)), report: report(sources) });
  assert.deepEqual([seven.counts.all, seven.tools, seven.sentOnce], [8, true, null]);
  const once = group(seven, "sent_once");
  assert.deepEqual(
    once.rows.map((r) => [r.id, r.kind, r.results]),
    [["b-1", "sent_once", { kind: "sent", sent: 30, replied: 4 }]],
  );
  assert.deepEqual(once.rows[0].open, { kind: "route", label: "Open", route: "broadcasts/run:b-1" });
  assert.equal(once.meta, "1 send · last 30 days");
});

test("a reach-out's numbers: written, businesses and wrote back from its own totals; absent or failed say —; past the report's twenty it still says its numbers or Nothing sent", () => {
  const chains = [chain("ro-1"), chain("ro-2"), chain("ro-21")];
  const res = (l, id) => row(l, id).results;
  assert.equal(res(ledger({ reachOuts: chains, chains: undefined }), "ro-1"), "uncounted", "not read yet");
  assert.equal(res(ledger({ reachOuts: chains, chains: null }), "ro-1"), "uncounted", "could not be read");
  const every = ledger({
    reachOuts: chains,
    chains: {
      complete: true,
      byRoot: {
        "ro-1": { written: 40, businesses: 18, wroteBack: 6 },
        "ro-2": { written: 0, businesses: 0, wroteBack: 0 },
      },
    },
  });
  assert.deepEqual(res(every, "ro-1"), { kind: "written", written: 40, businesses: 18, wroteBack: 6 });
  assert.equal(res(every, "ro-2"), "none", "a chain that wrote nothing is Nothing sent, businesses or not");
  assert.equal(res(every, "ro-21"), "none", "every chain counted: one past twenty that wrote nothing says so");
  const twenty = ledger({
    reachOuts: chains,
    chains: { complete: false, byRoot: { "ro-1": { written: 40, businesses: 18, wroteBack: 6 } } },
  });
  assert.equal(res(twenty, "ro-21"), "uncounted", "from the report's twenty: one not among them may be past them");
  // A database before 00404 (or a fixture from before it) counts no businesses: null, whether the key is absent or null.
  const before = ledger({
    reachOuts: chains,
    chains: {
      complete: true,
      byRoot: { "ro-1": { written: 40, wroteBack: 6 }, "ro-2": { written: 9, businesses: null, wroteBack: 2 } },
    },
  });
  assert.deepEqual(res(before, "ro-1"), { kind: "written", written: 40, businesses: null, wroteBack: 6 });
  assert.deepEqual(res(before, "ro-2"), { kind: "written", written: 9, businesses: null, wroteBack: 2 });
  const W = C.LIFECYCLE_WORDS.ledger;
  assert.equal(W.results(res(every, "ro-1")), "18 businesses · 6 wrote back", "every share is of businesses");
  assert.equal(W.results({ kind: "written", written: 9, businesses: 1, wroteBack: 1 }), "1 business · 1 wrote back");
  assert.equal(
    W.results({ kind: "written", written: 4, businesses: 0, wroteBack: 0 }),
    "0 businesses · 0 wrote back",
    "a zero is a count, said as one",
  );
  assert.equal(W.results(res(before, "ro-1")), "40 written · 6 wrote back", "the old line where businesses is unknown");
  assert.equal(W.results({ kind: "written", written: 9, businesses: null, wroteBack: 2 }), "9 written · 2 wrote back");
  assert.equal(W.results({ kind: "sent", sent: 212, replied: 48 }), "212 sent · 48 replied");
  assert.equal(W.results("none"), "Nothing sent");
  assert.equal(W.results("uncounted"), "—");
  assert.deepEqual(group(every, "reach_out").add, {
    kind: "route",
    label: "Find businesses to write to",
    route: "clients/leads",
  });
  const paused = row(ledger({ reachOuts: [chain("ro-p", { state: "paused" })] }), "ro-p");
  assert.deepEqual([paused.status, paused.tone, paused.act.kind], ["paused", "plain", "resume"]);
  const waits = row(ledger({ reachOuts: [chain("ro-w", { next: { waiting_run_id: "r-9" } })] }), "ro-w");
  assert.deepEqual(
    [waits.status, waits.waiting, waits.act],
    ["waiting", null, { kind: "route", label: "Open the run", route: "broadcasts/run:r-9" }],
    "a chain's run is decided on its own page",
  );
});

test("a reach-out's People cell is who is in it now (00426): its waiting and writing in words, sorted by both, the done alone where nobody else is left, — where not counted; its hint says what feeds it and its steps in words", () => {
  const call = { hand: { kind: "call", words: "Ring them" } };
  const note = { hand: { kind: "note", words: "Drop by" } };
  const l = ledger({
    reachOuts: [
      chain("ro-list", { fed_by: "list", people: { waiting: 17, writing: 9, done: 5 }, steps: [{}, {}, {}, call] }),
      chain("ro-search", { fed_by: "search", people: { waiting: 0, writing: 5, done: 2 } }),
      chain("ro-done", { people: { waiting: 0, writing: 0, done: 4 }, steps: [{}, call, note] }),
      chain("ro-none", { people: { waiting: 0, writing: 0, done: 0 }, steps: [{}, call, call] }),
      chain("ro-failed", { people: null }),
      chain("ro-old"),
    ],
  });
  const at = (id) => row(l, id);
  assert.deepEqual(at("ro-list").people, { n: 26, unit: "businesses", words: "17 waiting · 9 writing" });
  assert.equal(at("ro-list").hint, "Its own list · 3 emails and a call", "a list its owner adds to");
  assert.equal(
    C.ledgerPeopleWords(at("ro-list").people),
    "17 waiting · 9 writing",
    "the phone's line and the fold say it",
  );
  assert.match(C.ledgerPhoneLine(at("ro-list"), "Reach-outs"), /17 waiting · 9 writing$/);
  assert.equal(at("ro-search").people.words, "5 writing", "nobody waiting: not said");
  assert.equal(at("ro-search").hint, "Cold email to Trainers · 2 emails", "a search's says the search");
  assert.equal(at("ro-done").people.words, "4 done");
  assert.equal(at("ro-done").hint, "Cold email to Trainers · 1 email, a call and a note");
  assert.equal(at("ro-none").people.words, "Nobody yet");
  assert.equal(at("ro-none").hint, "Cold email to Trainers · 1 email and 2 calls");
  for (const id of ["ro-failed", "ro-old"]) {
    assert.deepEqual(at(id).people, { n: null, unit: "businesses" }, `${id}: never a zero nobody counted`);
    assert.equal(C.ledgerPeopleWords(at(id).people), null);
  }
});

test("the sort keys: Next puts a waiting run first, then the soonest, paused last; Name; People now; Replied", () => {
  const mk = (id, over) => ({
    id,
    name: id,
    status: "on",
    people: { n: 1, unit: "people" },
    results: "none",
    next: { words: "", atMs: 10 },
    ...over,
  });
  const rows = [
    mk("paused", { status: "paused", next: { words: "Paused", atMs: null } }),
    mk("later", {
      next: { words: "", atMs: 20 },
      people: { n: 9, unit: "people" },
      results: { kind: "sent", sent: 10, replied: 5 },
    }),
    mk("waiting", { status: "waiting", next: { words: "Waiting on you", atMs: 30 } }),
    mk("soon", { people: { n: null, unit: "people" }, results: "uncounted" }),
    mk("chain", {
      results: { kind: "written", written: 40, businesses: 18, wroteBack: 6 },
      next: { words: "—", atMs: null },
    }),
  ];
  const ids = (by) => [...rows].sort(C.ledgerOrder(by)).map((r) => r.id);
  assert.deepEqual([...C.LEDGER_SORTS], ["next", "name", "people", "replied"]);
  assert.deepEqual(ids("next"), ["waiting", "soon", "later", "chain", "paused"]);
  assert.deepEqual(ids("name"), ["chain", "later", "paused", "soon", "waiting"]);
  assert.deepEqual(
    ids("people"),
    ["later", "chain", "paused", "waiting", "soon"],
    "the most first, one not counted last",
  );
  assert.deepEqual(
    ids("replied"),
    ["chain", "later", "paused", "waiting", "soon"],
    "a chain's wrote back beside replied",
  );
  // The sort reads wrote back, never the businesses a chain wrote to: more businesses, fewer answers, sorts after.
  const wide = mk("wide", { results: { kind: "written", written: 300, businesses: 100, wroteBack: 2 } });
  const narrow = mk("narrow", { results: { kind: "written", written: 20, businesses: 8, wroteBack: 5 } });
  assert.deepEqual(
    [wide, narrow].sort(C.ledgerOrder("replied")).map((r) => r.id),
    ["narrow", "wide"],
  );
});

test("without a calendar the appointment groups say they need one, with its door and no Turn on; a campaign made there before runs nothing here", () => {
  const l = ledger({
    shape: { calendar: "none", dealsOn: true, word: "appointment" },
    playbooks: playbooks([playbook(), playbook({ id: "pb-r", name: "Reminder", trigger: "visit_tomorrow" })]),
  });
  for (const id of ["before", "after"])
    assert.deepEqual(
      group(l, id).add,
      { kind: "route", label: "Connect your calendar", route: "admin/workspace/calendar" },
      id,
    );
  assert.equal(group(l, "after").meta, "Needs your calendar");
  assert.equal(group(l, "before").meta, "1 campaign · 1 not running here");
  const r = row(l, "pb-r");
  assert.deepEqual(
    [r.status, r.stateWords, r.hint, r.channels],
    ["not_here", "Not running here", "Needs your calendar", []],
  );
  // No figure, as its moment's card has none (D44): never the pool it was last counted at, nor a zero.
  assert.deepEqual(r.people, { n: null, unit: "people" }, "REGRESSION: the row kept the 5 its card no longer says");
  const card = C.campaignsHomeOf(
    input({
      shape: { calendar: "none", dealsOn: true, word: "appointment" },
      playbooks: playbooks([playbook(), playbook({ id: "pb-r", name: "Reminder", trigger: "visit_tomorrow" })]),
    }),
  ).rail.stages.find((s) => s.id === "before");
  assert.equal(card.people, null, "the card and its rows agree");
  assert.deepEqual(row(l, "pb-1").people, { n: 5, unit: "people" }, "a moment that can be counted keeps its figure");
});

test("before the playbooks are read the ledger holds nothing; the period's numbers say they are reading or failed", () => {
  const empty = ledger({ playbooks: undefined, shape: undefined });
  assert.deepEqual([empty.groups, empty.counts, empty.tools], [[], { all: 0, running: 0, needs: 0, paused: 0 }, false]);
  assert.equal(ledger({ report: undefined }).results, "reading");
  assert.equal(ledger({ report: null }).results, "failed");
  assert.equal(row(ledger({ report: null }), "pb-1").results, "uncounted");
  assert.deepEqual(row(ledger({ report: report([source("pb-1", 212, 48)]) }), "pb-1").results, {
    kind: "sent",
    sent: 212,
    replied: 48,
  });
});

test("the drawer's kicker is the campaign's group: its moment's caption, Lists & offers, Reach-outs", () => {
  const home = C.campaignsHomeOf(
    input({
      playbooks: playbooks([
        playbook(),
        playbook({ id: "pb-l", name: "Regulars", trigger: "saved_list", triggerLabel: "Regulars" }),
      ]),
      reachOuts: [chain("ro-1")],
    }),
  );
  assert.equal(C.lifecycleKicker(home, "pb-1"), "Quiet or lapsed");
  assert.equal(C.lifecycleKicker(home, "pb-l"), "Lists & offers");
  assert.equal(C.lifecycleKicker(home, "ro-1"), "Reach-outs");
  assert.equal(C.lifecycleKicker(home, "nobody"), "Campaign");
});

test("a status tab counts what it shows: the counts and the page's filter read one predicate", () => {
  const rows = [
    { kind: "playbook", status: "waiting", tone: "warn" },
    { kind: "list", status: "on", tone: "warn" },
    { kind: "playbook", status: "paused", tone: "plain" },
    { kind: "playbook", status: "on", tone: "ok" },
    { kind: "sent_once", status: "on", tone: "plain" },
    // The call's text with no message is amber, but it is First contact's own row, not a campaign: no tab counts it.
    { kind: "call_text", status: "off", tone: "warn" },
    // Nor the receptionist's, nor a one-off send's, whatever their tone or state: they stand under All alone.
    { kind: "receptionist", status: "always", tone: "warn" },
    { kind: "sent_once", status: "waiting", tone: "warn" },
    { kind: "sent_once", status: "paused", tone: "plain" },
  ];
  assert.deepEqual([...C.LEDGER_STATUSES], ["all", "needs", "paused"]);
  assert.deepEqual(
    rows.map((r) => C.ledgerRowIn(r, "needs")),
    [true, true, false, false, false, false, false, false, false],
    "a run waiting, an archived list",
  );
  assert.deepEqual(
    rows.map((r) => C.ledgerRowIn(r, "paused")),
    [false, false, true, false, false, false, false, false, false],
  );
  assert.ok(
    rows.every((r) => C.ledgerRowIn(r, "all")),
    "All holds the one-off sends too: the rows add up to what came back",
  );
  // And the ledger's own counts are that predicate's, over a real home.
  const l = ledger({ playbooks: playbooks([playbook(), playbook({ id: "pb-p", state: "paused", next: "paused" })]) });
  const all = l.groups.flatMap((g) => g.rows);
  for (const s of ["needs", "paused"]) assert.equal(l.counts[s], all.filter((r) => C.ledgerRowIn(r, s)).length, s);
});

test("the ledger's names to a screen reader are contracts' too", () => {
  const W = C.LIFECYCLE_WORDS.ledger;
  assert.deepEqual(
    [W.label, W.tabs.label, W.strip, W.find],
    ["Your campaigns", "Campaigns by state", "Campaigns by moment", "Search campaigns"],
  );
});

test("how many campaigns is one count: the receptionist, the call's text and an offer not made yet are no campaign", () => {
  const l = ledger({ playbooks: playbooks([playbook(), playbook({ id: "pb-p", state: "paused", next: "paused" })]) });
  const all = l.groups.flatMap((g) => g.rows);
  assert.equal(all.filter(C.isLedgerCampaign).length, l.counts.all, "the All tab's figure is the rows it counts");
  assert.deepEqual(
    all
      .filter((r) => !C.isLedgerCampaign(r))
      .map((r) => r.kind)
      .sort(),
    ["call_text", "offer", "receptionist"],
  );
});

test("a phone row says its moment, its next run and who is at it, in one line; a run that waits says so once, on its pill", () => {
  const rows = [
    playbook({ id: "pb-v", name: "Reminder", trigger: "visit_tomorrow", named: { pool: 7, saidYes: 7 } }),
    playbook(),
    playbook({ id: "pb-p", state: "paused", next: "paused" }),
    playbook({ id: "pb-w", trigger: "lapsed", totals: { waiting: { id: "r-1", recipient_count: 7 } } }),
  ];
  const l = ledger({ playbooks: playbooks(rows), broadcasts: broadcasts([run({ playbook_id: "pb-w" })]) });
  const line = (id) => {
    const g = l.groups.find((x) => x.rows.some((r) => r.id === id));
    return C.ledgerPhoneLine(row(l, id), g.caps);
  };
  assert.equal(line("pb-v"), "Appointment tomorrow · tomorrow 10:00 AM · 7 people");
  assert.equal(
    line("pb-p"),
    "Quiet or lapsed · Paused · 5 people",
    "a paused row's end is its Resume: the line says it rests",
  );
  assert.equal(line("pb-w"), "Quiet or lapsed · 5 people", "Waiting for your approval is the pill's, said once");
  assert.equal(
    line("receptionist"),
    `First contact · ${row(l, "receptionist").people.n} this week`,
    "no next run: none said",
  );
  // A figure nobody counted is no figure: the line leaves it out, never "0 people".
  const uncounted = ledger({
    shape: { calendar: "none", dealsOn: true, word: "appointment" },
    playbooks: playbooks([playbook({ id: "pb-r", name: "Reminder", trigger: "visit_tomorrow" })]),
  });
  assert.equal(C.ledgerPhoneLine(row(uncounted, "pb-r"), "Appointment tomorrow"), "Appointment tomorrow");
});

test("who is at a row's moment is said one way, on a phone's line and a desk's fold: one person is a person", () => {
  assert.equal(C.ledgerPeopleWords({ n: 1, unit: "people" }), "1 person");
  assert.equal(C.ledgerPeopleWords({ n: 7, unit: "people" }), "7 people");
  assert.equal(C.ledgerPeopleWords({ n: 0, unit: "people" }), "0 people", "a zero counted is a zero");
  assert.equal(C.ledgerPeopleWords({ n: 3, unit: "this week" }), "3 this week", "a moment's own unit as it says it");
  assert.equal(C.ledgerPeopleWords({ n: null, unit: "people" }), null, "nobody counted: nothing said, never a 0");
  const one = ledger({
    playbooks: playbooks([
      playbook({ id: "pb-v", name: "Reminder", trigger: "visit_tomorrow", named: { pool: 1, saidYes: 1 } }),
    ]),
  });
  assert.equal(
    C.ledgerPhoneLine(row(one, "pb-v"), "Appointment tomorrow"),
    "Appointment tomorrow · tomorrow 10:00 AM · 1 person",
  );
});

test("the composer says what a moment already holds, never the campaign being changed nor a list's", () => {
  const rows = [
    { id: "a", name: "Win-back", trigger: "quiet_30", state: "running" },
    { id: "b", name: "Old win-back", trigger: "lapsed", state: "paused" },
    { id: "c", name: "Visit reminder", trigger: "visit_tomorrow", state: "running" },
  ];
  assert.deepEqual(C.momentHoldsWords(rows, "quiet_30", null), ["Win-back · On", "Old win-back · Paused"]);
  assert.deepEqual(C.momentHoldsWords(rows, "lapsed", null), ["Win-back · On", "Old win-back · Paused"], "one moment");
  assert.deepEqual(C.momentHoldsWords(rows, "quiet_30", "a"), ["Old win-back · Paused"]);
  assert.deepEqual(C.momentHoldsWords(rows, "visited", null), []);
  assert.deepEqual(
    C.momentHoldsWords(
      [...rows, { id: "d", name: "Spring list", trigger: "saved_list", state: "running" }],
      "saved_list",
      null,
    ),
    [],
    "a list holds as many as it is given",
  );
  assert.equal(C.LIFECYCLE_WORDS.compose.turnOn("Appointment reminder"), "Turn on Appointment reminder");
  assert.equal(C.LIFECYCLE_WORDS.compose.calendar.door.label, C.LIFECYCLE_WORDS.needsCalendar.door, "one spelling");
  assert.equal(C.LIFECYCLE_WORDS.compose.calendar.door.to, C.CALENDAR_SETTING_ROUTE);
  assert.equal(C.LIFECYCLE_WORDS.compose.number.door.to, C.CHANNELS_DOOR);
});

test("D1-campaign-state: a paused campaign with a run waiting is shown waiting, with its Approve, whether or not it is paused", () => {
  const rows = [
    playbook({ id: "pb-pw", state: "paused", next: "paused", totals: { waiting: { id: "r-1", recipient_count: 7 } } }),
    playbook({ id: "pb-p", state: "paused", next: "paused", trigger: "visited" }),
  ];
  const home = C.campaignsHomeOf(
    input({ playbooks: playbooks(rows), broadcasts: broadcasts([run({ playbook_id: "pb-pw" })]) }),
  );
  const l = home.ledger;
  // The row: waiting first, in the one phrase, amber, with the run's Approve and Skip; Resume stays the campaign's own act.
  const both = row(l, "pb-pw");
  assert.deepEqual(
    [both.status, both.stateWords, both.phoneWords, both.tone],
    ["waiting", C.RUN_WAITING_WORDS, C.RUN_WAITING_WORDS, "warn"],
  );
  assert.deepEqual(
    both.waiting,
    { runId: "r-1", people: 7, refusal: null },
    "the home's row has the Approve its drawer has",
  );
  assert.equal(both.next.words, C.RUN_WAITING_WORDS);
  assert.equal(both.act.kind, "resume", "it is still paused: Resume is kept beside the run");
  // A paused campaign with nothing waiting is still Paused, grey, with Resume.
  const paused = row(l, "pb-p");
  assert.deepEqual(
    [paused.status, paused.stateWords, paused.tone, paused.waiting],
    ["paused", "Paused", "plain", null],
  );
  assert.equal(paused.act.kind, "resume");
  // The counts and the meter count it as waiting, not paused; the rail says the same word as the row.
  assert.deepEqual(l.counts, { all: 2, running: 1, needs: 1, paused: 1 });
  const stage = home.rail.stages.find((s) => s.playbookId === "pb-pw");
  assert.deepEqual([stage.stateWords, stage.tone, stage.waits], [C.RUN_WAITING_WORDS, "warn", true]);
  assert.equal(stage.covered, false, "a paused campaign covers nothing, whatever waits");
  // Library's used-by line reads the same order: a run waiting outranks paused, and says it in the run's phrase.
  assert.equal(
    C.templateUseNote({
      playbooks: [{ name: "Win-back", paused: true, waiting: true, runs: "" }],
      broadcasts: 0,
      recent: [],
      booking: false,
    }),
    "a run is waiting for your approval",
  );
});

test("D1-campaign-state: a reach-out with a run waiting is shown waiting whether or not it is paused, with its run's door", () => {
  const l = ledger({
    reachOuts: [
      chain("c-pw", { state: "paused", next: { waiting_run_id: "r-9" } }),
      chain("c-p", { state: "paused" }),
      chain("c-w", { next: { waiting_run_id: "r-8" } }),
      chain("c-on"),
    ],
  });
  const states = (id) => [row(l, id).status, row(l, id).stateWords, row(l, id).tone];
  assert.deepEqual(states("c-pw"), ["waiting", C.RUN_WAITING_WORDS, "warn"]);
  assert.deepEqual(row(l, "c-pw").act, {
    kind: "route",
    label: C.LIFECYCLE_WORDS.ledger.openRun,
    route: "broadcasts/run:r-9",
  });
  assert.deepEqual(states("c-p"), ["paused", "Paused", "plain"]);
  assert.equal(row(l, "c-p").act.kind, "resume");
  assert.deepEqual(states("c-w"), ["waiting", C.RUN_WAITING_WORDS, "warn"]);
  assert.deepEqual(states("c-on"), ["on", "On", "ok"]);
});
