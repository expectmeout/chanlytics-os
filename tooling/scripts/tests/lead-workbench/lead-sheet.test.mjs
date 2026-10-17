/**
 * The lead sheet (canvas B v2, "The Workbench"; the refined canvas, 17 Oct 2026), run: which of the canvas's states a lead
 * is in, by its own record, the add door's answer and its story (leadSheetStateOf); what stopped (leadSheetClosedOf); the
 * fit as a meter, a check read shaded apart, its word only when it is news; three reach cells; where they stand in their
 * sequence and the word beside the name, in Sequences' words; the sequence box; the dock, which holds only what needs
 * you, its keys named and a press that would fail off with why, and nothing when nothing does; the end of a pile; their
 * steps on the record's rail of days; Change's options; a row's place on Leads; and the dock as the page draws it, its
 * keys named to a screen reader and drawn nowhere (canvas B: "keys, drawn nowhere").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId } from "../_legacy-react.mjs";

const {
  leadSheetStateOf,
  leadSheetClosedOf,
  leadSheetFitOf,
  leadSheetCellsOf,
  leadSheetDockOf,
  leadSheetPlaceOf,
  leadSheetWordOf,
  leadSheetBoxOf,
  leadLinePlaceOf,
  leadSheetEndRailOf,
  leadSheetTrackOf,
  leadSheetOptionsOf,
  leadSheetReasonsOf,
  leadSheetStandOf,
  LEAD_SHEET_WORDS: W,
  LEAD_DOCK_WORDS: D,
  LEAD_PLACE_WORDS: P,
} = contracts;

const lead = (over = {}) => ({
  cls: "qualified",
  stage: "ready",
  emailState: "ok",
  hasEmail: true,
  canCall: true,
  inSequence: false,
  ...over,
});
const stateOf = (over = {}, more = {}) =>
  leadSheetStateOf({ lead: lead(over), check: undefined, email: null, story: null, ...more });

test("the state: its record first, then the add door's answer, then what its email says", () => {
  assert.equal(stateOf({ cls: "review" }), "review");
  assert.equal(stateOf({ cls: "excluded" }), "closed");
  assert.equal(stateOf({ stage: "converted" }), "replied");
  assert.equal(stateOf({}, { story: { replied: true, bounced: false } }), "replied");
  assert.equal(stateOf({ stage: "archived" }), "closed");
  assert.equal(stateOf({ inSequence: true }), "sequence");
  // The door's answer, never a second reading of the address on the page.
  assert.equal(stateOf({}, { check: { why: "elsewhere", chain_name: "Gyms" } }), "elsewhere");
  assert.equal(stateOf({}, { check: { why: "already", chain_name: null } }), "sequence");
  assert.equal(stateOf({}, { check: { why: "no_email", chain_name: null } }), "phone");
  assert.equal(stateOf({ canCall: false }, { check: { why: "no_email", chain_name: null } }), "closed");
  assert.equal(stateOf({}, { check: { why: "unconfirmed", chain_name: null } }), "gap");
  assert.equal(stateOf({}, { check: { why: "customer", chain_name: null } }), "closed");
  // Before the door answers: no address and a number is a call; an address being checked is finding one.
  assert.equal(stateOf({ hasEmail: false }), "phone");
  assert.equal(stateOf({ emailState: "checking" }), "finding");
  assert.equal(stateOf({}, { email: { blocked: "Its words need their city", note: null } }), "gap");
  assert.equal(stateOf({}, { email: { blocked: null, note: "Greets them as there" } }), "gap");
  assert.equal(stateOf({}, { check: null, email: { blocked: null, note: null } }), "ready");
});

test("what stopped, plainly, and the one fix that exists for it", () => {
  assert.equal(
    leadSheetClosedOf({ lead: lead({ cls: "excluded" }), closedReason: null, blocked: null }).fix,
    "put_back",
  );
  const closed = leadSheetClosedOf({ lead: lead({ stage: "archived" }), closedReason: "not_a_fit", blocked: null });
  assert.equal(closed.title, "Not a fit");
  assert.equal(closed.fix, "ready");
  assert.equal(
    leadSheetClosedOf({ lead: lead({ emailState: "invalid" }), closedReason: null, blocked: null }).fix,
    "call",
  );
  const nothing = leadSheetClosedOf({
    lead: lead({ hasEmail: false, canCall: false }),
    closedReason: null,
    blocked: null,
  });
  assert.equal(nothing.fix, null);
  assert.equal(
    leadSheetClosedOf({ lead: lead(), closedReason: null, blocked: "They're already a customer, so Add is off." }).line,
    "They're already a customer, so Add is off.",
  );
});

const dot = (answer, how = "seen") => ({ answer, how });
const peek = (over = {}) => ({
  checkDots: [dot("yes"), dot("yes"), dot("unknown", "read"), dot("yes", "read")],
  checksSummary: "3 checks passed · 1 couldn't tell",
  fit: { word: "Strong fit", cls: "strong", sentence: "An independent salon" },
  stage: "ready",
  ...over,
});

test("the fit: the meter alone for a strong fit, a check read shaded apart; its word only when it is news", () => {
  const strong = leadSheetFitOf(peek(), "ready");
  assert.deepEqual(strong.meter, ["ok", "ok", "warn", "read", "rest"], "a check Claude read is softer than one seen");
  assert.equal(strong.pill, null);
  assert.equal(strong.tip, "3 checks passed · 1 couldn't tell");
  assert.equal(
    leadSheetFitOf(peek({ fit: { word: "Worth a look", cls: "look", sentence: "" } }), "ready").pill.label,
    "Worth a look",
  );
  assert.equal(leadSheetFitOf(peek(), "review").pill.label, "Needs review");
  assert.equal(leadSheetFitOf(peek(), "sequence").pill.label, "Contacted");
  assert.equal(leadSheetFitOf(peek(), "replied").pill.label, "Talking");
});

test("the reach cells: email, phone and site, a second word only where the dot is not ok", () => {
  const slot = (state, word) => ({ state, value: null, word, tip: `${word} tip`, copy: false });
  const cells = leadSheetCellsOf({
    slots: { mailbox: slot("checking", "checking"), phone: slot("ok", "agrees") },
    reach: { email: { tip: "Being checked." }, phone: { tip: "Same on its listing and website." } },
    links: {
      website: { label: "luxelane.example.com", href: "https://luxelane.example.com" },
      instagram: { label: "@luxe", href: "x" },
    },
    company: null,
  });
  assert.deepEqual(
    cells.map((c) => [c.key, c.word, c.tone]),
    [
      ["email", "checking", "info"],
      ["phone", null, "ok"],
      ["site", "+ Insta", "ok"],
    ],
  );
  assert.equal(cells[1].tip, "Same on its listing and website.");
});

const dockFacts = (over = {}) => ({
  state: "ready",
  place: null,
  pile: null,
  target: "Salon owners · Queens",
  blocked: null,
  canCall: true,
  canLater: true,
  closed: null,
  reply: null,
  tz: "America/New_York",
  nowMs: Date.parse("2026-10-16T14:00:00Z"),
  ...over,
});
const dockOf = (over) => leadSheetDockOf(dockFacts(over));
const acts = (r) => r.acts.map((s) => s.act);

test("the dock holds what needs you: ✕, Later and Add for a lead to decide on; a press that would fail is off and says why", () => {
  const ready = dockOf();
  assert.equal(ready.x, true);
  assert.deepEqual(acts(ready), ["not_a_fit", "later", "add"]);
  assert.deepEqual(
    ready.acts.map((s) => s.key),
    ["n", "l", "a"],
  );
  assert.deepEqual([ready.line, ready.fact], [D.ready.line, D.ready.fact], "the consequence, said before the press");
  const off = dockOf({ state: "gap", blocked: "Its words need their city" });
  assert.equal(off.acts[2].off, "Its words need their city");
  assert.equal(off.fact, "Its words need their city", "why, in the dock's own line");
  const checking = dockOf({ state: "finding" });
  assert.equal(checking.waiting, true);
  assert.equal(checking.acts.at(-1).off, D.checking.fact, "Add waits for the mailbox's check");
  assert.deepEqual(acts(dockOf({ state: "phone" })), ["not_a_fit", "call"]);
  assert.equal(dockOf({ state: "phone", canCall: false }), null);
  assert.deepEqual(acts(dockOf({ state: "review" })), ["exclude", "keep"]);
  assert.deepEqual(acts(dockOf({ state: "elsewhere" })), ["sequence"]);
  assert.deepEqual(acts(dockOf({ state: "replied" })), ["call", "thread"]);
  assert.deepEqual(acts(dockOf({ state: "replied", canCall: false })), ["thread"]);
  const closed = dockOf({ state: "closed", closed: { title: "Left out", line: "", fix: "put_back" } });
  assert.deepEqual(acts(closed), ["put_back"]);
  assert.equal(dockOf({ state: "closed", closed: { title: "Asked to stop", line: "", fix: null } }), null);
  // A lead seen through no search has no Later: two acts at most, so nothing takes its place.
  assert.deepEqual(acts(dockOf({ canLater: false })), ["not_a_fit", "add"]);
});

test("in a sequence the dock holds only what needs you there, and nothing while it runs", () => {
  const place = (group, over = {}) => ({
    group,
    step: 1,
    sendId: null,
    hold: null,
    holdDetail: null,
    runId: null,
    line: "",
    ...over,
  });
  assert.deepEqual(acts(dockOf({ state: "sequence", place: place("waiting") })), ["approve"]);
  assert.deepEqual(acts(dockOf({ state: "sequence", place: place("held", { sendId: "s1", hold: "unbacked_fact" }) })), [
    "decide",
  ]);
  assert.deepEqual(acts(dockOf({ state: "sequence", place: place("to_send", { runId: "b1" }) })), ["open_draft"]);
  const replied = dockOf({
    state: "sequence",
    place: place("replied"),
    reply: { intent: "question", readAt: "2026-10-16T13:00:00Z" },
  });
  assert.deepEqual(acts(replied), ["call", "thread"]);
  assert.match(replied.fact, /^A question · /);
  for (const g of ["next", "in", "done", "left"])
    assert.equal(dockOf({ state: "sequence", place: place(g) }), null, `${g}: nothing needs you`);
});

test("in a pile and out of one: a first pile holds for a new list, a search that writes is Its sequence, none is New", () => {
  assert.deepEqual(acts(dockOf({ pile: "first", target: null })), ["not_a_fit", "later", "hold"]);
  assert.deepEqual(acts(dockOf({ pile: "search" })), ["not_a_fit", "sequence"]);
  // No sequence takes leads by hand: one is made in Sequences, from this lead, and the trip comes back.
  const none = dockOf({ target: null });
  assert.deepEqual(acts(none), ["not_a_fit", "later", "new_sequence"]);
  assert.equal(none.line, D.noSequence.line);
});

test("the end of a pile: the later ones, the way out, and where the work lands", () => {
  const slots = (r) => r.slots.map((s) => s.act);
  assert.equal(leadSheetEndRailOf({ later: 2, held: 0, target: "Gyms" }).slots.at(-1).label, W.approveIn("Gyms"));
  assert.deepEqual(slots(leadSheetEndRailOf({ later: 2, held: 0, target: "Gyms" })), [
    "later_again",
    "leave",
    "open_target",
  ]);
  assert.deepEqual(slots(leadSheetEndRailOf({ later: 0, held: 3, target: null })), ["leave", "write_held"]);
  assert.deepEqual(slots(leadSheetEndRailOf({ later: 0, held: 0, target: null })), ["leave"]);
});

const NOW = Date.parse("2026-10-16T14:00:00Z");
const send = (n, over = {}) => ({
  id: `s-${n}`,
  n,
  hand: null,
  state: "sent",
  reason: null,
  send_at: null,
  sent_at: null,
  angle: null,
  host: null,
  message_id: null,
  email_status: null,
  bounced: false,
  left: false,
  ...over,
});
const story = (over = {}) => ({
  lead_id: "l-1",
  business_name: "Luxe Lane Salon",
  stage: "nurture",
  closed_reason: null,
  found_at: null,
  email_state: "ok",
  resume_at: null,
  booked_at: null,
  stopped_at: null,
  chain: {
    root_id: "root-1",
    name: "Salon owners · Queens",
    state: "running",
    steps: [
      { n: 0, after_days: null, hand: null },
      { n: 1, after_days: 4, hand: null },
      { n: 2, after_days: 3, hand: "call" },
    ],
  },
  search: null,
  conversation_id: null,
  sends: [send(0, { sent_at: "2026-10-12T13:10:00Z", left: true })],
  readings: [],
  can_stop: true,
  ...over,
});

test("their steps on the record's rail of days: done, the next one, and still to come", () => {
  const track = leadSheetTrackOf(story(), NOW, "America/New_York");
  assert.equal(track.name, "Salon owners · Queens");
  assert.equal(track.rootId, "root-1");
  assert.deepEqual(
    track.steps.map((s) => [s.day, s.label, s.look]),
    [
      [1, "First email", "done"],
      [5, "Follow-up", "next"],
      [8, "A call for you", "later"],
    ],
    "each step's day, as the record counts it: Day 1, then each wait added",
  );
  assert.match(track.steps[0].when, /Oct 12/);
  assert.equal(leadSheetTrackOf(story({ chain: null }), NOW, "America/New_York"), null);
});

test("Change: each sequence fed by a list, with what its email would come to for this lead", () => {
  const chain = (id, body) => ({
    root_id: id,
    name: id,
    steps: [
      { id: `${id}-0`, n: 0, after_days: null, subject: "Hi", body, template_id: null, state: "running", hand: null },
    ],
    state: "running",
    next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
    fed_by: "list",
    owner_sends: true,
    mailboxes: [],
    gap_minutes: 20,
    signed_by: "Rae",
  });
  const options = leadSheetOptionsOf({
    chains: [chain("a", "Hi {{business}}"), chain("b", "Hi {{first name}}"), chain("c", "In {{city}}")],
    picked: "b",
    lead: {
      business_name: "Luxe",
      city: null,
      kind: "place",
      facts: {},
      to: "a@example.com",
      emailState: "ok",
      canCall: true,
      canChoose: false,
    },
    workspace: { businessName: "Rae's", bookingLink: null },
    nowMs: NOW,
    tz: "UTC",
  });
  assert.deepEqual(
    options.map((o) => [o.rootId, o.fill === W.fills, o.fill === W.greets, o.tone, o.on]),
    [
      ["a", true, false, "ok", false],
      ["b", false, true, "ok", true],
      ["c", false, false, "warn", false],
    ],
  );
});

test("the reasons to write now are the listing's own signals; where they stand says what Add would do", () => {
  assert.deepEqual(
    leadSheetReasonsOf({ rated: { low: "29% at 1–2 stars" }, claimedNote: "Not claimed", company: null }).map(
      (r) => r.tone,
    ),
    ["warn", "info"],
  );
  assert.deepEqual(leadSheetReasonsOf({ rated: null, claimedNote: "x", company: { people: [] } }), []);
  const stand = leadSheetStandOf({ track: null, state: "ready", target: "Gyms", searchWrites: null, closed: null });
  assert.equal(stand.title, "Not in a sequence yet");
  assert.match(stand.line, /Gyms/);
});

test("where they stand in their sequence, in the words its Leads tab files them under", () => {
  const tz = "America/New_York";
  const at = (o) => leadSheetPlaceOf(story(o), NOW, tz);
  assert.equal(leadSheetPlaceOf(story({ chain: null }), NOW, tz), null, "outside a sequence: no place");
  const queued = at({ sends: [], added_at: "2026-10-16T10:00:00Z" });
  assert.deepEqual(
    [queued.group, queued.line],
    ["next", "Step 1 goes in its next batch"],
    "on its list, nothing planned yet",
  );
  assert.equal(at({}).group, "in", "between steps");
  const held = at({ sends: [send(0, { state: "held", reason: "unbacked_fact" })] });
  assert.deepEqual([held.group, held.sendId, held.hold], ["held", "s-0", "unbacked_fact"]);
  assert.match(held.line, /^Step 1 held: /);
  const drafted = at({ sends: [send(0, { state: "drafted", run_id: "b-1" })] });
  assert.deepEqual([drafted.group, drafted.runId], ["to_send", "b-1"]);
  const waits = at({
    chain: { ...story().chain, waiting_run_id: "b-2" },
    sends: [send(0, { state: "planned", send_at: "2026-10-17T13:00:00Z" })],
  });
  assert.equal(waits.group, "waiting", "a planned email in a batch that waits for an OK");
  assert.equal(at({ sends: [send(0, { state: "planned", send_at: "2026-10-17T13:00:00Z" })] }).group, "next");
  const reading = {
    message_id: "m",
    read_at: "2026-10-16T12:00:00Z",
    intent: "interested",
    claim: "person",
    summary: null,
    undone: false,
    until_at: null,
    stops: true,
    convert: false,
    said_no: false,
    can_undo: true,
  };
  assert.equal(at({ readings: [reading] }).group, "replied", "a reply that asks for an answer comes first");
  assert.notEqual(at({ readings: [{ ...reading, intent: "no" }] }).group, "replied", "a no asks for none");
  // Taken out between steps: no send of theirs moved, and their place (00455) says they left, and why.
  const takenOut = at({ place: { id: "e1", state: "left", why: "removed", next_at: null } });
  assert.deepEqual([takenOut.group, takenOut.line], ["left", "Taken out"]);
  const stopped = at({ stopped_at: "2026-10-15T12:00:00Z" });
  assert.deepEqual([stopped.group, stopped.line], ["left", "You stopped writing"]);
  const done = at({
    sends: [0, 1, 2].map((n) => send(n, { sent_at: "2026-10-12T13:10:00Z", left: true })),
  });
  assert.equal(done.group, "done", "every step went");
});

test("the word beside the name, and the sequence box: Joins, In or Left, by name, with its one line", () => {
  const place = {
    group: "held",
    step: 1,
    sendId: "s",
    hold: "chain",
    holdDetail: null,
    runId: null,
    line: "Step 1 held: …",
  };
  assert.deepEqual(leadSheetWordOf({ state: "sequence", place, closed: null }), { word: P.held, tone: "warn" });
  assert.deepEqual(leadSheetWordOf({ state: "ready", place: null, closed: null }), { word: "Ready", tone: "plain" });
  assert.equal(leadSheetWordOf({ state: "review", place: null, closed: null }).word, "To review");
  assert.equal(leadSheetWordOf({ state: "sequence", place: { ...place, group: "next" }, closed: null }).tone, "ok");
  const base = {
    state: "ready",
    place: null,
    inSequence: null,
    elsewhere: null,
    target: { rootId: "r1", name: "Portland bookshops" },
    searchWrites: null,
    canChange: true,
    closed: null,
  };
  assert.deepEqual((({ verb, name, line, change }) => ({ verb, name, line, change }))(leadSheetBoxOf(base)), {
    verb: "Joins",
    name: "Portland bookshops",
    line: "Step 1 after your OK",
    change: true,
  });
  const inIt = leadSheetBoxOf({ ...base, state: "sequence", place, inSequence: { rootId: "r2", name: "Indie shops" } });
  assert.deepEqual(
    [inIt.verb, inIt.name, inIt.rootId, inIt.line, inIt.change],
    ["In", "Indie shops", "r2", place.line, false],
  );
  assert.equal(leadSheetBoxOf({ ...base, state: "phone" }).verb, "Can't join");
  assert.equal(leadSheetBoxOf({ ...base, state: "review" }).line, "Once you keep it");
  assert.equal(leadSheetBoxOf({ ...base, target: null }).verb, null, "no sequence takes leads you add yet");
});

test("a row's place on Leads says the same words from the open search's lines", () => {
  const line = (over = {}) => ({
    lead_id: "l",
    stage: "ready",
    closed_reason: null,
    sent: 0,
    first_sent_at: null,
    last_sent_at: null,
    next_at: null,
    held: false,
    handed: false,
    bounced: false,
    bounced_at: null,
    email_state: "ok",
    reply: null,
    away_until: null,
    resume_at: null,
    booked_at: null,
    stopped_at: null,
    ...over,
  });
  const tz = "America/New_York";
  const word = (over, waits = false) => leadLinePlaceOf(line(over), waits, NOW, tz)?.word ?? null;
  assert.equal(word({}), null, "nothing done with it yet");
  assert.equal(word({ held: true }), P.held);
  assert.equal(word({ drafted: 1 }), P.to_send);
  assert.equal(word({ added_at: "2026-10-16T10:00:00Z" }, true), P.waiting);
  assert.equal(word({ next_at: "2026-10-17T13:00:00Z" }), P.next);
  assert.equal(word({ sent: 1, last_sent_at: "2026-10-12T13:00:00Z" }), P.in);
  assert.equal(word({ stopped_at: "2026-10-15T12:00:00Z", sent: 1 }), P.left);
  assert.equal(
    word({ sent: 1, reply: { intent: "question", claim: "person", read_at: "2026-10-16T12:00:00Z", undone: false } }),
    P.replied,
  );
});

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const G = globalThis;
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(G, { CHANLY: { nav: () => {}, R: {} }, canDo: () => true, gate: () => ({}) });
const { SheetDock } = await import("../../../../apps/dashboard/src/surfaces/leads/sheet/dock.tsx");

test("the dock as the page draws it: each act names its key to a screen reader, and no key is drawn", () => {
  fresh();
  const dock = dockOf();
  const pressed = [];
  const tree = again(() => G.React.createElement(SheetDock, { dock, busy: false, onRun: (s) => pressed.push(s.act) }));
  assert.equal(byTestId(tree, "lead-sheet-not_a_fit").props["aria-keyshortcuts"], "N");
  assert.equal(byTestId(tree, "lead-sheet-later").props["aria-keyshortcuts"], "L");
  assert.equal(byTestId(tree, "lead-sheet-add").props["aria-keyshortcuts"], "A");
  assert.deepEqual(
    all(tree, (n) => n.type === "kbd"),
    [],
    "keys live in the ? sheet, never drawn (canvas B)",
  );
  byTestId(tree, "lead-sheet-add").props.onClick();
  assert.deepEqual(pressed, ["add"]);
  const off = again(() =>
    G.React.createElement(SheetDock, {
      dock: dockOf({ blocked: "Its words need their city" }),
      busy: false,
      onRun: () => {},
    }),
  );
  assert.equal(byTestId(off, "lead-sheet-add").props.disabled, true);
  assert.equal(byTestId(off, "lead-sheet-add").props.title, "Its words need their city");
});
