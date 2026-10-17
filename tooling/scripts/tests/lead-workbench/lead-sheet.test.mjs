/**
 * The lead sheet (canvas B v2, "The Workbench"), run: which of the canvas's states a lead is in, by its own record, the
 * add door's answer and its story (leadSheetStateOf); what stopped (leadSheetClosedOf); the fit as a meter with its word
 * only when it is news; three reach cells; the rail's three places for each state, in a pile and out of one, its keys
 * named and a press that would fail off with why; the end of a pile; their steps in a sequence; Change's options; and the
 * rail as the page draws it, its keys named to a screen reader and drawn nowhere (canvas B: "keys, drawn nowhere").
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
  leadSheetRailOf,
  leadSheetEndRailOf,
  leadSheetTrackOf,
  leadSheetOptionsOf,
  leadSheetReasonsOf,
  leadSheetStandOf,
  LEAD_SHEET_WORDS: W,
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

const peek = (over = {}) => ({
  checkDots: ["yes", "yes", "unknown", "yes"],
  checksSummary: "3 checks passed · 1 couldn't tell",
  fit: { word: "Strong fit", cls: "strong", sentence: "An independent salon" },
  stage: "ready",
  ...over,
});

test("the fit: the meter alone for a strong fit; its word only when it is news; the stage once it has moved", () => {
  const strong = leadSheetFitOf(peek(), "ready");
  assert.deepEqual(strong.meter, ["ok", "ok", "warn", "ok", "rest"]);
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

const facts = (over = {}) => ({
  state: "ready",
  pile: null,
  target: "Salon owners · Queens",
  blocked: null,
  canCall: true,
  canDraft: true,
  canLater: true,
  closed: null,
  monthLeft: 212,
  ...over,
});
const railOf = (over) => leadSheetRailOf(facts(over));
const acts = (r) => r.slots.map((s) => s.act);

test("the rail holds what can honestly be done: ✕, Later and Add; a press that would fail is off and says why", () => {
  const ready = railOf();
  assert.equal(ready.x, true);
  assert.deepEqual(acts(ready), ["not_a_fit", "later", "add"]);
  assert.deepEqual(
    ready.slots.map((s) => s.key),
    ["n", "l", "a"],
  );
  const off = railOf({ state: "gap", blocked: "Its words need their city" });
  assert.equal(off.slots[2].off, "Its words need their city");
  assert.deepEqual(acts(railOf({ state: "phone" })), ["not_a_fit", "later", "call"]);
  assert.deepEqual(acts(railOf({ state: "review" })), ["exclude", "later", "keep"]);
  assert.equal(railOf({ state: "review" }).slots[2].sub, W.keepSub(212));
  assert.deepEqual(acts(railOf({ state: "elsewhere" })), ["sequence", "later", "next"]);
  assert.deepEqual(acts(railOf({ state: "sequence" })), ["sequence", "stop", "next"]);
  assert.deepEqual(acts(railOf({ state: "replied" })), ["thread", "call", "next"]);
  assert.deepEqual(acts(railOf({ state: "replied", canCall: false })), ["thread", "next"]);
  const closed = railOf({ state: "closed", closed: { title: "Left out", line: "", fix: "put_back" } });
  assert.deepEqual(acts(closed), ["put_back", "later", "next"]);
});

test("in a pile and out of one: a first pile holds for a new list, a search that writes is Its sequence, no target is a call", () => {
  assert.deepEqual(acts(railOf({ pile: "first", target: null })), ["not_a_fit", "later", "hold"]);
  assert.deepEqual(acts(railOf({ pile: "search" })), ["not_a_fit", "sequence", "next"]);
  // Out of a pile with no sequence taking leads by hand: the yes is a call, else a draft for their own inbox, else Add off.
  assert.equal(railOf({ target: null }).slots[2].act, "call");
  assert.equal(railOf({ target: null, canCall: false }).slots[2].act, "draft");
  const none = railOf({ target: null, canCall: false, canDraft: false });
  assert.equal(none.slots[2].act, "add");
  assert.equal(none.slots[2].off, W.noTarget);
  // A lead seen through no search has no Later: Next in its place.
  assert.equal(railOf({ canLater: false }).slots[1].act, "next");
});

test("the end of a pile: the later ones, the way out, and where the work lands", () => {
  assert.deepEqual(acts(leadSheetEndRailOf({ later: 2, held: 0, target: "Gyms" })), [
    "later_again",
    "leave",
    "open_target",
  ]);
  assert.deepEqual(acts(leadSheetEndRailOf({ later: 0, held: 3, target: null })), ["leave", "write_held"]);
  assert.deepEqual(acts(leadSheetEndRailOf({ later: 0, held: 0, target: null })), ["leave"]);
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

test("their steps in a sequence: done, the next one, and still to come", () => {
  const track = leadSheetTrackOf(story(), NOW, "America/New_York");
  assert.equal(track.name, "Salon owners · Queens");
  assert.equal(track.rootId, "root-1");
  assert.deepEqual(
    track.steps.map((s) => [s.label, s.look]),
    [
      ["Email 1", "done"],
      ["Email 2", "next"],
      ["A call for you", "later"],
    ],
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

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const G = globalThis;
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(G, { CHANLY: { nav: () => {}, R: {} }, canDo: () => true, gate: () => ({}) });
const { SheetRail } = await import("../../../../apps/dashboard/src/surfaces/leads/sheet/rail.tsx");

test("the rail as the page draws it: each place names its key to a screen reader, and no key is drawn", () => {
  fresh();
  const rail = railOf();
  const pressed = [];
  const tree = again(() => G.React.createElement(SheetRail, { rail, busy: false, onRun: (s) => pressed.push(s.act) }));
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
    G.React.createElement(SheetRail, {
      rail: railOf({ blocked: "Its words need their city" }),
      busy: false,
      onRun: () => {},
    }),
  );
  assert.equal(byTestId(off, "lead-sheet-add").props.disabled, true);
  assert.equal(byTestId(off, "lead-sheet-add").props.title, "Its words need their city");
});
