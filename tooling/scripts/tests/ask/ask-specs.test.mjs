/**
 * The cards' three readings -- the gate a card checks before Approve (PROPOSAL_GATE), whether a committed card's undo
 * is still true to offer (askUndoOpen) and where its Open goes (cardOpenRoute) -- answered over a frozen table.
 *
 * The table was written against a993b71d, before the cards had specs (Ask Rewired, PR 3.2), and its answers are what
 * those three said then. PR 3.2 derives all three from one spec per card kind; the table is what proves the
 * derivation changed no answer. A row that fails here is a card that now opens elsewhere, or offers its undo when it
 * did not, and the change is a change to the product, not to this file.
 *
 * Then the specs themselves (contracts ask-proposals/), executed over a card of every shape each kind makes: every
 * route a spec names is a route the app has, and each is the door of the role the card needs (route-policy.json); and
 * the gate a card checks before Approve lets the roles that role lets (ROLE_PERMS, on the server's own ladder). The two
 * kinds PR 4.6 added (a person's note and details, the Phase 4 plan's D8 and D9) answer the three readings as their
 * family's cards do, and their calls are pinned over the answers their routes really give; so are PR 4.7's two, a list
 * kept by its rule (D10) and a playbook's run waiting for a person (D11), the one of 8 Oct 2026, the channels a
 * playbook that exists goes by, the one of 9 Oct 2026, a playbook that exists changed in place, and the one of 10 Oct
 * 2026, a message written for the Library (its own suite: ask/tools/message-card.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASK_THREAD_VERBS,
  ASK_UNDO_MS,
  MEMBERSHIP_ROLES,
  PROPOSAL_GATE,
  LIFECYCLE_TOAST,
  LIFECYCLE_WORDS,
  PROPOSAL_SPECS,
  PROPOSAL_WORDS,
  ROLE_PERMS,
  ROUTE_KEYS,
  askUndoOpen,
  cardOpenRoute,
  canonicalRoute,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8")).routes;

/**
 * The kinds, in PROPOSAL_SPECS' order: the twenty-one Ask proposed by 14 Oct 2026, then every page's verb the operator
 * made a card (15 Oct 2026, decision 0062); and one no card has.
 */
const KINDS = [
  "reply",
  "steer",
  "thread_verb",
  "person_mode",
  "policy",
  "settings",
  "whisper",
  "invite",
  "broadcast",
  "playbook",
  "lead_search",
  "people_search",
  "reach_out_add",
  "deal",
  "note",
  "person_details",
  "list",
  "run",
  "playbook_channels",
  "playbook_change",
  "message",
  "answer",
  "answer_many",
  "person_mode_many",
  "note_many",
  "person_add",
  "person_merge",
  "person_message",
  "list_member",
  "list_change",
  "list_delete",
  "sequence_step",
  "sequence_step_remove",
  "sequence_words",
  "sequence_leave",
  "sequence_add",
  "sequence_move",
  "lead_search_aim",
  "sequence_send_decide",
  "sequence_send_said",
  "sequence_draft",
  "sequence_new",
  "sequence_make",
  "sequence_start",
  "sequence_end",
  "sequence_discard",
  "sequence_test",
  "playbook_run",
  "booking_request",
  "fact_suggestion",
  "call_hand_over",
  "lead_stage",
  "lead_mark",
  "lead_later",
  "leads_bulk",
  "leads_check",
  "lead_addressee",
  "lead_list",
  "lead_search_more",
  "reach_out_make",
  "reach_out_said",
  "review_reply",
  "review_reply_stop",
  "follow_up",
  "answer_style",
  "teleport",
];

/* ------------------------------------------------------------------ the gate */

test("the gate each kind checks before Approve is the one it checked at a993b71d; a person's note and details, a list, a run, a playbook's channels and change, and a message written, each an operator's, check approve", () => {
  assert.deepEqual(PROPOSAL_GATE, {
    reply: "approve",
    steer: "approve",
    thread_verb: "approve",
    whisper: "approve",
    policy: "autonomy",
    person_mode: "settings",
    settings: "settings",
    invite: "team",
    broadcast: "approve",
    playbook: "approve",
    lead_search: "find",
    people_search: "find",
    reach_out_add: "approve",
    deal: "approve",
    note: "approve",
    person_details: "approve",
    list: "approve",
    run: "approve",
    playbook_channels: "approve",
    playbook_change: "approve",
    message: "approve",
    // The operator (15 Oct 2026): each page's verb gated as its page's button is.
    answer: "approve",
    answer_many: "approve",
    person_mode_many: "settings",
    note_many: "approve",
    person_add: "approve",
    person_merge: "settings",
    person_message: "approve",
    list_member: "approve",
    list_change: "approve",
    list_delete: "approve",
    sequence_step: "approve",
    sequence_step_remove: "approve",
    sequence_words: "approve",
    sequence_leave: "approve",
    sequence_add: "approve",
    sequence_move: "approve",
    lead_search_aim: "approve",
    sequence_send_decide: "approve",
    sequence_send_said: "approve",
    sequence_draft: "approve",
    sequence_new: "approve",
    sequence_make: "approve",
    sequence_start: "approve",
    sequence_end: "approve",
    sequence_discard: "approve",
    sequence_test: "approve",
    playbook_run: "approve",
    booking_request: "approve",
    // A note kept for the receptionist is a change to the settings (decision 0063): the settings gate, a partner up.
    fact_suggestion: "settings",
    call_hand_over: "approve",
    lead_stage: "approve",
    lead_mark: "find",
    lead_later: "approve",
    leads_bulk: "approve",
    leads_check: "find",
    lead_addressee: "find",
    lead_list: "approve",
    lead_search_more: "find",
    reach_out_make: "approve",
    reach_out_said: "approve",
    review_reply: "approve",
    review_reply_stop: "approve",
    follow_up: "approve",
    answer_style: "approve",
  });
});

/* ------------------------------------------------------------ the undo window */

const T = Date.UTC(2026, 8, 26, 12);
const iso = (ms) => new Date(ms).toISOString();
/** What a committed card's outcome may carry for its undo: nothing, a reply's cancel window, a settings version. */
const UNDOS = [
  null,
  {},
  { message_id: "m", cancelable_until: iso(T + 5_000) },
  { message_id: "m", cancelable_until: iso(T) },
  { message_id: "m", cancelable_until: iso(T - 1) },
  { message_id: "m", cancelable_until: "not a time" },
  { config: {}, version_after: 4 },
  { config: {}, version_after: "4" },
];
/** When the card was committed: a minute ago, exactly ten minutes ago, and a moment past ten. */
const ATS = [T - 60_000, T - ASK_UNDO_MS, T - ASK_UNDO_MS - 1];
/** The settings version the tab holds: none loaded, the one a settings card wrote, a later save. */
const VERSIONS = [null, 4, 5];

/**
 * askUndoOpen at a993b71d, per kind: one group per entry of UNDOS, in order; inside a group, for each of ATS, the
 * three VERSIONS -- 1 where the undo was offered. The five kinds since keep the family's ten minutes.
 */
const UNDO_OPEN = {
  reply: "000000000 000000000 111111111 000000000 000000000 000000000 000000000 000000000",
  steer: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  thread_verb: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  person_mode: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  policy: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  settings: "000000000 000000000 000000000 000000000 000000000 000000000 010010000 000000000",
  whisper: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  invite: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  broadcast: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  playbook: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  lead_search: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  people_search: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  reach_out_add: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  deal: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  note: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  person_details: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  list: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  run: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  playbook_channels: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  playbook_change: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  message: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  teleport: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
};

test("a committed card's undo is offered exactly where it was at a993b71d, for every kind over the frozen table; every kind since keeps the ten minutes, but a first message, cancelable as a reply is", () => {
  const windowOf = (kind) =>
    UNDOS.map((u) =>
      ATS.map((a) => VERSIONS.map((v) => (askUndoOpen(kind, u, a, T, v) ? "1" : "0")).join("")).join(""),
    ).join(" ");
  for (const kind of KINDS.filter((k) => !(k in UNDO_OPEN)))
    assert.equal(windowOf(kind), UNDO_OPEN[kind === "person_message" ? "reply" : "steer"], kind);
  for (const kind of Object.keys(UNDO_OPEN)) {
    const got = UNDOS.map((u) =>
      ATS.map((a) => VERSIONS.map((v) => (askUndoOpen(kind, u, a, T, v) ? "1" : "0")).join("")).join(""),
    ).join(" ");
    assert.equal(got, UNDO_OPEN[kind], kind);
  }
  // An undo record the outcome omits entirely is no undo, as null is.
  for (const kind of KINDS) assert.equal(askUndoOpen(kind, undefined, T, T, 4), false, kind);
});

/* ------------------------------------------------------------------ the Open */

const done = (undo) => ({ state: "done", receipt: "r", atMs: T, undo });
/** A card's payload and, where it was acted on, its outcome. */
const CASES = [
  [undefined, undefined],
  [{}, undefined],
  [{ conversation_id: "c1" }, undefined],
  [{ contact_id: "p1" }, undefined],
  [{ contact_id: "" }, undefined],
  [{ conversation_id: "c1", contact_id: "p1" }, undefined],
  [{ amends: { search_id: "s9" } }, undefined],
  [{ amends: { search_id: "" } }, undefined],
  [{ amends: "s9" }, undefined],
  [{}, done({ search_id: "s1" })],
  [{}, done({ search_id: "" })],
  [{ amends: { search_id: "s9" } }, done({ search_id: "s1" })],
  [{}, done(null)],
  [{}, { state: "failed", receipt: "r", atMs: T, undo: { search_id: "s1" } }],
];
/**
 * cardOpenRoute at a993b71d, per kind: one answer per entry of CASES, or one answer for them all. A person's note and
 * details open the person they name, as the family's do; a list opens People (at the list, once it is made: below), and
 * a run the run it names, the Broadcasts page where none of these cards names one.
 */
const OPEN = {
  reply: null,
  steer: null,
  thread_verb: [null, null, "inbox/th-c1", null, null, "inbox/th-c1", null, null, null, null, null, null, null, null],
  person_mode: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  policy: "admin/autonomy",
  settings: "admin/workspace",
  whisper: null,
  invite: null,
  broadcast: "broadcasts",
  playbook: "outbound",
  lead_search: [
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads:s-s9:c-excluded",
    "clients/leads",
    "clients/leads",
    "clients/leads:s-s1",
    "clients/leads",
    "clients/leads:s-s9:c-excluded",
    "clients/leads",
    "clients/leads:s-s1",
  ],
  // None of the table's payloads names a reach-out: the home. With one, its drawer (the spec's own test below).
  reach_out_add: "outbound",
  // The people card (00430): Leads, and once it started, its search.
  people_search: [
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads",
    "clients/leads:s-s1",
    "clients/leads",
    "clients/leads:s-s1",
    "clients/leads",
    "clients/leads:s-s1",
  ],
  deal: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  note: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  person_details: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  list: "clients",
  run: "broadcasts",
  // None of the table's payloads names a playbook: the home, where the old Playbooks address lands. With one, its drawer
  // (the spec's own test below).
  playbook_channels: "outbound",
  playbook_change: "outbound",
  // The Library, which gives one message no address of its own: before Approve and after it.
  message: "messages",
  teleport: [null, null, "inbox/th-c1", null, null, "inbox/th-c1", null, null, null, null, null, null, null, null],
};

test("a card's Open goes exactly where it went at a993b71d, for every kind over the frozen table, and every kind since where its page shows what it did", () => {
  // The operator's kinds (15 Oct 2026), each to its page: the sequence's record, the person, the lead, the review.
  const open = (kind, payload, outcome) => cardOpenRoute({ kind, payload, ...(outcome ? { outcome } : {}) });
  assert.equal(open("sequence_step", { sequence_id: "q1" }), "campaigns/sequences/q1");
  assert.equal(open("sequence_make", {}, { state: "done", made: { id: "q2" } }), "campaigns/sequences/q2");
  assert.equal(open("sequence_draft", { words: "x" }), "campaigns/sequences/new");
  assert.equal(open("answer", { contact_id: "p1" }), "clients/p1");
  assert.equal(open("person_message", { contact_id: "p1" }, { state: "done", made: { id: "c9" } }), "inbox/th-c9");
  assert.equal(open("call_hand_over", { call_id: "k1" }), "live");
  assert.equal(open("review_reply", { review_id: "rv1" }), "reports/reviews");
  assert.equal(open("review_reply_stop", { review_id: "rv1" }), "reports/reviews");
  assert.equal(open("lead_list", { lead_ids: ["ld1"] }), "clients/leads");
  for (const kind of Object.keys(OPEN)) {
    const want = Array.isArray(OPEN[kind]) ? OPEN[kind] : CASES.map(() => OPEN[kind]);
    const got = CASES.map(([payload, outcome]) =>
      cardOpenRoute({ kind, payload, ...(outcome !== undefined ? { outcome } : {}) }),
    );
    // The same place: a card writes the page's own address now, where the table froze a retired one that lands on it
    // (contracts retiredRouteOf, the Campaigns wiring review's lane 1, 19 Oct 2026).
    const place = (r) => (r === null ? null : canonicalRoute(r));
    assert.deepEqual(got.map(place), want.map(place), kind);
    assert.deepEqual(
      got.filter((r) => r !== null && canonicalRoute(r) !== r),
      [],
      `${kind}: never a retired address`,
    );
  }
});

/* ------------------------------------------------------------------ the specs */

const card = (kind, payload, extra = {}) => ({
  id: "p-1",
  kind,
  needs: "operator",
  title: "t",
  summary: "s",
  payload,
  undo: null,
  ...extra,
});
/** What each route answers, as far as a spec reads it. */
const ANSWER_ALL = {
  message_id: "m1",
  cancelable_until: iso(T + 15_000),
  decision_id: "d1",
  version: 4,
  id: "b1",
  search_id: "s1",
  // POST reach-outs/[id]/leads's (ReachOutAddDto): the add, for its undo.
  op_id: "op1",
  deal: { id: "deal1" },
  note: { id: "n1" },
  // POST templates/message's (WriteMessageAnswer): an email version filed, WhatsApp's in review.
  versions: [
    { channel: "email", id: "v1", state: "approved" },
    { channel: "whatsapp", id: "v2", state: "pending" },
  ],
};
/** A sequence step's doors (the operator's): what the step held before they wrote, for the undo. */
const ANSWERS = {
  sequence_step: { ...ANSWER_ALL, was: { after_days: 2 } },
  sequence_words: { ...ANSWER_ALL, was: { template_id: "t0", params: [] } },
  // POST sequences/[id]/leave's (SequenceDoorAnswer): one taken out, which its undo puts back.
  sequence_leave: { ...ANSWER_ALL, sequence_id: "q1", left: 1 },
};
const TAB = { settings: { config: { brain: {} }, version: 3 } };
const TAB_AFTER = { settings: { config: { brain: {} }, version: 4 } };
/**
 * A playbook's channels changed, as the act builds its card (server/ask/tools/act/playbook-channels.ts): the channels
 * asked, the ones it had for the undo, and whether a run of it already waits. Nothing else of the playbook.
 */
const GOES_BY = {
  playbook_id: "pb1",
  name: "Visit reminder",
  channels: ["whatsapp", "email"],
  was: ["whatsapp"],
  run_waits: false,
};
/** A playbook's change, as the act builds its card (server/ask/tools/act/playbook-change.ts): what it changes, and what it held. */
const CHANGE = {
  playbook_id: "pb1",
  playbook_name: "Win-back",
  name: "Past clients",
  run_hour: 9,
  was: { name: "Win-back", run_hour: 10 },
  run_waits: false,
  timezone: "America/New_York",
};
/** A card of every shape each kind makes: each thread verb, a lead search new and answering, a deal with its step. */
const SHAPES = {
  reply: [card("reply", { conversation_id: "c1", text: "On our way.", who: "Rosa" })],
  steer: [card("steer", { message_id: "m1", instruction: "shorter" })],
  thread_verb: ASK_THREAD_VERBS.map((verb) =>
    card("thread_verb", { verb, conversation_id: "c1", escalation_id: "e1", until: iso(T + 86_400_000) }),
  ),
  person_mode: [card("person_mode", { contact_id: "p1", mode: "never", previous: "auto", who: "Rosa" })],
  policy: [card("policy", { class: "reply", mode: "ask", previous: { mode: "auto", min_confidence: 0.6 } })],
  settings: [card("settings", { change: { op: "add_note", title: "Parking", text: "Round the back." } })],
  whisper: [card("whisper", { call_id: "k1", text: "Saturday is full" })],
  invite: [card("invite", { email: "ada@example.com", role: "viewer" })],
  broadcast: [card("broadcast", { template_id: "t1", audience_kind: "everyone", name: "Friday" })],
  playbook: [card("playbook", { trigger: "quiet_30", template_id: "t1", name: "Win-back" })],
  lead_search: [
    card("lead_search", { plan: { count: 50, terms: ["dentists"] } }),
    card("lead_search", { plan: { count: 50 }, amends: { search_id: "s9", name: "Dentists" } }),
  ],
  people_search: [card("people_search", { plan: { count: 50, name: "Office managers" } })],
  reach_out_add: [card("reach_out_add", { root_id: "r1", name: "Spring dentists", lead_ids: ["l1", "l2"] })],
  deal: [
    card("deal", { contact_id: "p1", stage: "won", who: "Maria" }, { step: { body: "Call", due_on: "2026-10-01" } }),
  ],
  note: [
    card("note", { contact_id: "p1", body: "Prefers mornings.", team_only: false, who: "Rosa" }),
    card("note", { contact_id: "p1", body: "Owes a callback.", team_only: true, who: "Rosa" }),
  ],
  person_details: [
    card("person_details", { contact_id: "p1", who: "Rosa", name: "Rosa Díaz", previous: { name: "Rosa" } }),
    card("person_details", {
      contact_id: "p1",
      who: "Rosa",
      name: "Rosa Díaz",
      email: "rosa@example.com",
      previous: { name: null, email: null },
    }),
  ],
  list: [card("list", { name: "Lapsed", rule: { v: 2, all: [{ field: "last_visit", op: "more_than", days: 60 }] } })],
  run: [
    card("run", { broadcast_id: "b1", verb: "approve", name: "Win-back · 2026-09-26", people: 12 }),
    card("run", { broadcast_id: "b1", verb: "skip", name: "Win-back · 2026-09-26", people: 12 }),
  ],
  playbook_channels: [card("playbook_channels", GOES_BY)],
  playbook_change: [card("playbook_change", CHANGE)],
  message: [
    card("message", {
      name: "october_offer",
      language: "en_US",
      category: "marketing",
      versions: { whatsapp: { body: "Hi {{1}}" }, email: { subject: "Hi", body: "Hi {{1}}" } },
      slots: [{ position: 1, label: "First name", example: "Dani", kind: "first_name" }],
    }),
  ],
  // The operator (15 Oct 2026): every page's verb, as the act builds its card.
  answer: [
    card("answer", { contact_id: "p1", who: "Rosa", purpose: "conversational", consent: "opted_in", source: "spoken" }),
    card("answer", { contact_id: "p1", who: "Rosa", purpose: "marketing", consent: "opted_in", source: "form" }),
  ],
  answer_many: [
    card("answer_many", { ids: ["p1", "p2"], purpose: "conversational", consent: "opted_out", source: "spoken" }),
    card("answer_many", { ids: ["p1"], purpose: "marketing", consent: "unknown" }),
  ],
  person_mode_many: [card("person_mode_many", { ids: ["p1", "p2"], mode: "never" })],
  note_many: [card("note_many", { ids: ["p1", "p2"], append: "Class of 12 Sep" })],
  person_add: [card("person_add", { phone: "+15555550100", name: "Rosa" })],
  person_merge: [card("person_merge", { contact_id: "p1", merge: "p2", who: "Rosa", other: "Rosa D." })],
  person_message: [
    card("person_message", { contact_id: "p1", wire: "whatsapp", text: "Saturday works.", who: "Rosa" }),
  ],
  list_member: [
    card("list_member", { list_id: "l1", name: "Regulars", who: "Rosa", add: ["p1"] }),
    card("list_member", { list_id: "l1", name: "Regulars", who: "Rosa", remove: ["p1"] }),
  ],
  list_change: [card("list_change", { list_id: "l1", name: "Past clients", was: { name: "Lapsed" } })],
  list_delete: [card("list_delete", { list_id: "l1", name: "Lapsed" })],
  sequence_step: [
    card("sequence_step", { sequence_id: "q1", template_id: "t1", after_days: 3 }),
    card("sequence_step", { sequence_id: "q1", step_id: "st1", after_days: 5 }),
  ],
  sequence_step_remove: [card("sequence_step_remove", { sequence_id: "q1", step_id: "st1" })],
  sequence_words: [card("sequence_words", { sequence_id: "q1", step_id: "st1", template_id: "t1", params: [] })],
  sequence_leave: [card("sequence_leave", { sequence_id: "q1", enrollment_ids: ["e1"] })],
  sequence_add: [card("sequence_add", { sequence_id: "q1", lead_ids: ["ld1"], name: "Bookstore intro" })],
  sequence_move: [card("sequence_move", { sequence_id: "q1", lead_id: "ld1", name: "Bookstore intro" })],
  lead_search_aim: [
    card("lead_search_aim", { search_id: "s1", sequence_id: "q1", name: "Bookstore intro", was: null }),
  ],
  sequence_send_decide: [card("sequence_send_decide", { send_id: "sd1", decision: "include", name: "Dock Dental" })],
  sequence_send_said: [card("sequence_send_said", { send_id: "sd1", outcome: "sent", name: "Dock Dental" })],
  sequence_draft: [card("sequence_draft", { words: "Thank them the day after, then ask for a review" })],
  sequence_new: [
    card("sequence_new", {
      kind: "sequence",
      audience: "people",
      name: "Thank you",
      who: { kind: "moment", trigger: "visited", label: "the day after a visit" },
      steps: [
        {
          name: "",
          after_days: null,
          only_if: [],
          does: "message",
          message: { template_id: "t1", params: [], written: null },
          email: null,
          hand: "",
        },
      ],
      start: false,
    }),
  ],
  sequence_make: [card("sequence_make", { first: { trigger: "visited", template_id: "t1" }, then: [], start: false })],
  sequence_start: [card("sequence_start", { sequence_id: "q1", name: "After a visit" })],
  sequence_end: [card("sequence_end", { sequence_id: "q1", name: "After a visit" })],
  sequence_discard: [card("sequence_discard", { sequence_id: "q1" })],
  sequence_test: [card("sequence_test", { sequence_id: "q1", step_id: "s1" })],
  playbook_run: [card("playbook_run", { playbook_id: "pb1", name: "Win-back", timezone: "America/New_York" })],
  booking_request: [
    card("booking_request", { conversation_id: "c1", booked: true, who: "Rosa" }),
    card("booking_request", { conversation_id: "c1", booked: false, who: "Rosa" }),
  ],
  fact_suggestion: [
    card("fact_suggestion", { suggestion_id: "fs1", keep: true, title: "Mondays" }),
    card("fact_suggestion", { suggestion_id: "fs1", keep: false, title: "Mondays" }),
  ],
  call_hand_over: [card("call_hand_over", { call_id: "k1", who: "Rosa" })],
  lead_stage: [card("lead_stage", { lead_id: "ld1", search_id: "s1", input: { move: "ready" }, who: "Dock Dental" })],
  lead_mark: [
    card("lead_mark", { search_id: "s1", lead_ids: ["ld1", "ld2"], mark: "keep" }),
    card("lead_mark", { search_id: "s1", lead_ids: ["ld1"], mark: "exclude" }),
    card("lead_mark", { search_id: "s1", lead_ids: ["ld1"], mark: "put_back" }),
  ],
  lead_later: [card("lead_later", { lead_id: "ld1", search_id: "s1", who: "Dock Dental" })],
  leads_bulk: [card("leads_bulk", { body: { by: "ids", action: "contacted", ids: ["ld1"] } })],
  leads_check: [card("leads_check", { lead_ids: ["ld1"] })],
  lead_addressee: [card("lead_addressee", { lead_id: "ld1", person: 1, who: "Dock Dental", person_name: "Ana" })],
  lead_list: [card("lead_list", { name: "Salons near you", lead_ids: ["ld1", "ld2"] })],
  lead_search_more: [
    card("lead_search_more", { search_id: "s1", purpose: "topup", plan: { count: 50 }, name: "Dentists" }),
  ],
  reach_out_make: [
    card("reach_out_make", {
      chain: { name: "Spring dentists", search_id: "s1", steps: [{ subject: "Hello", body: "Hi {{first_name}}" }] },
    }),
  ],
  reach_out_said: [card("reach_out_said", { lead_id: "ld1", intent: "interested", who: "Dock Dental" })],
  review_reply: [card("review_reply", { review_id: "rv1", comment: "Thank you, Ana!", who: "Ana P." })],
  review_reply_stop: [card("review_reply_stop", { review_id: "rv1" })],
  follow_up: [
    card("follow_up", {
      follow_ups: [{ id: "f1", said: "the search", prompt: "Say what it found", wake: "search_done" }],
      previous: [],
      said: "the search",
    }),
  ],
  answer_style: [card("answer_style", { words: "Short answers, in Spanish", previous: "" })],
};

/**
 * Every route a kind's spec reaches over its shapes: its commit, a second call, and the undo of what it kept, whose calls
 * may be several (a message's versions, one each).
 */
function routesOf(kind) {
  const spec = PROPOSAL_SPECS[kind];
  const ANSWER = ANSWERS[kind] ?? ANSWER_ALL;
  const seen = [];
  for (const p of SHAPES[kind]) {
    // A batch commits as several calls of one route (the operator: fifty people, or a lead each, a request).
    for (const commit of [spec.commit(p, TAB)].flat()) {
      assert.ok(commit.route, `${kind}: every shape here commits (${commit.refused})`);
      seen.push({ route: commit.route, by: "commit" });
    }
    const then = spec.then?.(p, ANSWER);
    if (then) seen.push({ route: then.route, by: "then" });
    const record = spec.undo?.record(p, ANSWER, TAB) ?? null;
    if (record) {
      for (const undo of [spec.undo.call(record, TAB_AFTER)].flat()) {
        assert.ok(undo.route, `${kind}: every undo kept here can be sent (${undo.refused})`);
        seen.push({ route: undo.route, by: "undo" });
      }
    }
  }
  return seen;
}

test("leads added to a reach-out from a card (00426): the add door with the leads alone, a receipt that says the run still waits for its say, an undo that takes them back at the version it made, and its drawer", () => {
  const spec = PROPOSAL_SPECS.reach_out_add;
  const p = card("reach_out_add", { root_id: "r1", name: "Spring dentists", lead_ids: ["l1", 7, "l2"] });
  assert.deepEqual(spec.commit(p, TAB), {
    route: "POST reach-outs/[id]/leads",
    params: { id: "r1" },
    body: { lead_ids: ["l1", "l2"] },
  });
  assert.equal(
    spec.receipt(p, { added: 2 }),
    "Added 2 leads to “Spring dentists”. Nothing goes to them until you give its next batch your OK.",
  );
  assert.equal(
    spec.receipt(p, { added: 1 }),
    "Added 1 lead to “Spring dentists”. Nothing goes to them until you give its next batch your OK.",
  );
  assert.equal(spec.receipt(p, { added: 0 }), "None could be added to “Spring dentists”.");
  assert.deepEqual(spec.undo.record(p, { op_id: "op1", version: 2 }), { op_id: "op1", version: 2 });
  assert.equal(spec.undo.record(p, { added: 0 }), null, "nothing added, nothing to take back");
  assert.deepEqual(spec.undo.call({ op_id: "op1", version: 2 }), {
    route: "POST lead-operations/[id]/undo",
    params: { id: "op1" },
    body: { version: 2 },
  });
  assert.equal(spec.open(p, null), "campaigns/sequences/r1");
  assert.equal(spec.needs, "operator");
});

test("a playbook's channels, changed from a card: the playbook's own PUT with the channels alone, the drawer's sentence as its receipt, and an undo that puts back the ones it had", () => {
  const spec = PROPOSAL_SPECS.playbook_channels;
  const p = card("playbook_channels", GOES_BY);
  assert.deepEqual([spec.needs, spec.gate], ["operator", "approve"]);
  // The channels and nothing else: the route judges them against the playbook as it stands and writes them alone, so
  // a card approved after the playbook was edited puts nothing of an older copy back.
  assert.deepEqual(spec.commit(p, TAB), {
    route: "PUT playbooks/[id]",
    params: { id: "pb1" },
    body: { channels: ["whatsapp", "email"] },
  });
  // The channels are the card's own, in the product's order, whatever order they were named in and whatever else is
  // there: a payload that carries more of a playbook (a card made before this change) sends none of it.
  const loose = card("playbook_channels", {
    ...GOES_BY,
    channels: ["email", "carrier-pigeon", "whatsapp"],
    body: { name: "An older copy", run_hour: 9 },
  });
  assert.deepEqual(spec.commit(loose, TAB).body, { channels: ["whatsapp", "email"] });
  // The drawer's own sentence (LIFECYCLE_TOAST.channels), whole: with what a run that already waits keeps.
  const sentence = (parts) => parts.map((x) => (typeof x === "string" ? x : x.b)).join("");
  assert.equal(spec.receipt(p, {}), "Visit reminder goes by WhatsApp and Email now");
  assert.equal(spec.receipt(p, {}), sentence(LIFECYCLE_TOAST.channels("Visit reminder", ["whatsapp", "email"], false)));
  const waits = card("playbook_channels", { ...GOES_BY, run_waits: true });
  assert.equal(
    spec.receipt(waits, {}),
    "Visit reminder goes by WhatsApp and Email now · the run that waits keeps the channels it was made with",
  );
  assert.equal(
    spec.receipt(waits, {}),
    sentence(LIFECYCLE_TOAST.channels("Visit reminder", ["whatsapp", "email"], true)),
  );
  // A card with no name says what a person calls it, a campaign (the moment spec, D19).
  assert.equal(
    spec.receipt(card("playbook_channels", { ...GOES_BY, name: undefined }), {}),
    "The campaign goes by WhatsApp and Email now",
  );
  assert.equal(spec.undo.label(p), "Put it back to WhatsApp");
  assert.equal(spec.undo.window, "ten_minutes");
  const kept = spec.undo.record(p, {}, TAB);
  assert.deepEqual(kept, { playbook_id: "pb1", was: ["whatsapp"] });
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), {
    route: "PUT playbooks/[id]",
    params: { id: "pb1" },
    body: { channels: ["whatsapp"] },
  });
  assert.equal(spec.undo.receipt({}), "Its channels are as they were");
  assert.equal(spec.open(p, null), "campaigns/sequences/pb1", "its record, where the Goes by row is");
  // A card with no playbook, or no channel it knows, commits nothing; an undo with nothing to put back says so.
  for (const broken of [
    { ...GOES_BY, playbook_id: null },
    { ...GOES_BY, channels: [] },
    { ...GOES_BY, channels: "whatsapp" },
  ])
    assert.deepEqual(spec.commit(card("playbook_channels", broken), TAB), { refused: PROPOSAL_WORDS.cannotApprove });
  assert.deepEqual(spec.undo.call({ ...kept, was: [] }, TAB_AFTER), { refused: PROPOSAL_WORDS.noUndo });
  assert.equal(spec.open(card("playbook_channels", { ...GOES_BY, playbook_id: null }), null), "campaigns/sequences");
});

test("Ask's new campaign opens its drawer once it is made, by the id the route answered; before then the home", () => {
  const spec = PROPOSAL_SPECS.playbook;
  assert.equal(
    spec.open(card("playbook", {}), done({ playbook_id: "pb9", decision_id: "d9" })),
    "campaigns/sequences/pb9",
  );
  assert.equal(
    spec.open(card("playbook", {}), null),
    "campaigns/sequences",
    "not approved yet: Sequences, which the old address lands on",
  );
  assert.equal(spec.open(card("playbook", {}), done(null)), "campaigns/sequences");
  assert.equal(
    spec.open(card("playbook", {}), done({ playbook_id: "" })),
    "campaigns/sequences",
    "an empty id names nothing",
  );
  // The id is the one the commit kept for its undo: what the route answered when it made the campaign.
  assert.deepEqual(spec.undo.record(card("playbook", {}), { id: "pb9", decision_id: "d9" }), {
    playbook_id: "pb9",
    decision_id: "d9",
  });
});

test("every kind has a spec -- the twenty-one Ask proposed and every page's verb the operator made a card -- and every route a spec names is a route the app has", () => {
  // The table is the pages' verbs and then the kinds only Ask's cards commit (page-specs.ts, ask-only.ts): every kind, once.
  assert.deepEqual(Object.keys(PROPOSAL_SPECS).sort(), KINDS.slice(0, -1).sort());
  const named = Object.fromEntries(
    Object.keys(PROPOSAL_SPECS).map((k) => [k, [...new Set(routesOf(k).map((x) => x.route))].sort()]),
  );
  assert.deepEqual(named, {
    reply: ["POST conversations/[id]/reply", "POST messages/[id]/cancel-send"],
    steer: ["POST messages/[id]/steer"],
    thread_verb: [
      "POST conversations/[id]/archive",
      "POST conversations/[id]/hand-back",
      "POST conversations/[id]/snooze",
      "POST conversations/[id]/take-over",
      "POST conversations/[id]/wake",
      "POST escalations/[id]/resolve",
    ],
    person_mode: ["PUT contacts/[id]/receptionist"],
    policy: ["PUT policies"],
    settings: ["PUT settings"],
    whisper: ["POST calls/[id]/whisper"],
    invite: ["POST team/invite"],
    broadcast: ["POST broadcasts", "POST broadcasts/[id]/cancel"],
    playbook: ["DELETE playbooks/[id]", "POST playbooks"],
    lead_search: ["POST lead-searches", "POST lead-searches/[id]/answer", "POST lead-searches/[id]/stop"],
    people_search: ["POST lead-searches/[id]/stop", "POST lead-searches/people"],
    reach_out_add: ["POST lead-operations/[id]/undo", "POST reach-outs/[id]/leads"],
    deal: ["POST contacts/[id]/deal", "POST contacts/[id]/notes"],
    note: ["POST contacts/[id]/notes", "POST contacts/[id]/notes/remove"],
    person_details: ["PUT contacts/[id]/details"],
    list: ["DELETE segments/[id]", "POST segments"],
    run: ["POST broadcasts/[id]/approve", "POST broadcasts/[id]/cancel"],
    playbook_channels: ["PUT playbooks/[id]"],
    playbook_change: ["PUT playbooks/[id]"],
    message: ["DELETE templates/versions/[id]", "POST templates/message"],
    answer: ["PUT contacts/[id]/consent", "PUT contacts/[id]/marketing-consent"],
    answer_many: ["PUT contacts/consent", "PUT contacts/marketing-consent"],
    person_mode_many: ["PUT contacts/receptionist"],
    note_many: ["PUT contacts/notes"],
    person_add: ["POST contacts"],
    person_merge: ["POST contacts/[id]/merge"],
    person_message: ["POST messages/[id]/cancel-send", "POST people/[id]/message"],
    list_member: ["PUT segments/[id]"],
    list_change: ["PUT segments/[id]"],
    list_delete: ["DELETE segments/[id]"],
    sequence_step: [
      "DELETE sequences/[id]/steps/[step]",
      "POST sequences/[id]/steps",
      "PUT sequences/[id]/steps/[step]",
    ],
    sequence_step_remove: ["DELETE sequences/[id]/steps/[step]"],
    sequence_words: ["POST sequences/[id]/steps/[step]/words"],
    sequence_leave: ["POST sequences/[id]/leave", "POST sequences/[id]/return"],
    sequence_add: ["POST lead-operations/[id]/undo", "POST sequences/[id]/leads"],
    sequence_move: ["POST sequences/[id]/move"],
    lead_search_aim: ["POST lead-searches/[id]/aim"],
    sequence_send_decide: ["POST reach-out-sends/[id]/decide"],
    sequence_send_said: ["POST reach-out-sends/[id]/said"],
    sequence_draft: ["POST sequences/draft"],
    sequence_new: ["POST sequences/new"],
    sequence_make: ["DELETE sequences/[id]", "POST sequences"],
    sequence_start: ["PUT playbooks/[id]"],
    sequence_end: ["DELETE playbooks/[id]"],
    sequence_discard: ["DELETE sequences/[id]"],
    sequence_test: ["POST sequences/[id]/steps/[step]/test"],
    playbook_run: ["POST playbooks/[id]/run"],
    booking_request: ["POST conversations/[id]/booking-request"],
    fact_suggestion: ["POST fact-suggestions/[id]"],
    call_hand_over: ["POST calls/[id]/hand-over"],
    lead_stage: ["POST lead-operations/[id]/undo", "POST leads/[id]/stage"],
    lead_mark: ["POST leads/[id]/exclude", "POST leads/[id]/keep", "POST leads/[id]/put-back"],
    lead_later: ["POST lead-operations/[id]/undo", "POST leads/[id]/later"],
    leads_bulk: ["POST lead-operations/[id]/undo", "POST leads/bulk"],
    leads_check: ["POST leads/check-again"],
    lead_addressee: ["POST leads/[id]/addressee"],
    lead_list: ["POST lead-searches/chosen"],
    lead_search_more: ["POST lead-searches/[id]/more", "POST lead-searches/[id]/stop"],
    reach_out_make: ["POST reach-outs"],
    reach_out_said: ["POST reach-outs/leads/[id]/said"],
    review_reply: ["POST google/reviews/[id]/reply"],
    review_reply_stop: ["POST google/reviews/[id]/stop"],
    follow_up: ["PUT views/[page]"],
    answer_style: ["PUT views/[page]"],
  });
  for (const routes of Object.values(named)) for (const r of routes) assert.ok(ROUTE_KEYS.includes(r), r);
});

test("a spec's `needs` is the policy role of every route it names; the exceptions are a lead search's stop, an operator's door undoing a partner's card, and a follow-up, a member's own view kept by an operator's card", () => {
  for (const [kind, spec] of Object.entries(PROPOSAL_SPECS)) {
    for (const { route, by } of routesOf(kind)) {
      const role = POLICY[route]?.role;
      if (kind === "follow_up" || kind === "answer_style") {
        // Any member keeps their own views (PUT views/[page], a viewer's door); Ask's cards are an operator's and above,
        // since a viewer is offered no act (the operator, 15 Oct 2026).
        assert.deepEqual([route, role, spec.needs], ["PUT views/[page]", "viewer", "operator"]);
        continue;
      }
      if (
        (kind === "lead_search" || kind === "people_search" || kind === "lead_search_more") &&
        route === "POST lead-searches/[id]/stop"
      ) {
        // Stopping a search spends nothing, so any operator may; the card that started it was a partner's.
        assert.deepEqual([by, role, spec.needs], ["undo", "operator", "partner"]);
        continue;
      }
      assert.equal(spec.needs, role, `${kind}: ${route} (${by})`);
    }
  }
  // What the four above operator are, and each names what it does for the refusal below it.
  assert.deepEqual(
    Object.entries(PROPOSAL_SPECS)
      .filter(([, s]) => s.needs !== "operator")
      .map(([k, s]) => [k, s.needs])
      .sort(([a], [b]) => a.localeCompare(b)),
    [
      ["fact_suggestion", "partner"],
      ["invite", "owner"],
      ["lead_addressee", "partner"],
      ["lead_mark", "partner"],
      ["lead_search", "partner"],
      ["lead_search_more", "partner"],
      ["leads_check", "partner"],
      ["people_search", "partner"],
      ["person_merge", "owner"],
      ["person_mode", "owner"],
      ["person_mode_many", "owner"],
      ["settings", "partner"],
    ],
  );
  for (const [kind, spec] of Object.entries(PROPOSAL_SPECS))
    assert.equal(!!spec.doing, spec.needs !== "operator", `${kind}: words for a refusal only above operator`);
});

test("the gate a card checks before Approve lets exactly the roles its `needs` lets, by the server's own ladder; the one exception is a person's mode, whose gate a partner passes and whose route is an owner's", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { roleAtLeast } = await import(
    new URL("../../../../apps/dashboard/src/server/with-route.ts", import.meta.url).href
  );
  for (const [kind, spec] of Object.entries(PROPOSAL_SPECS)) {
    for (const role of MEMBERSHIP_ROLES) {
      const gate = ROLE_PERMS[role][spec.gate];
      const needs = roleAtLeast(role, spec.needs);
      if ((kind === "person_mode" || kind === "person_mode_many" || kind === "person_merge") && role === "partner") {
        // Its gate is `settings`, which a partner holds; its route (PUT contacts/[id]/receptionist) is an owner's.
        // The builder refuses a partner, so no partner is handed the card: Ask threads are the member's own.
        assert.deepEqual([spec.gate, gate, needs], ["settings", true, false]);
        continue;
      }
      assert.equal(gate, needs, `${kind} for a ${role}: gate ${spec.gate} against needs ${spec.needs}`);
    }
  }
  // The ladder knows its four rungs and nothing else: a role it has never heard of stands on none.
  for (const odd of ["", "constructor", "admin"]) assert.equal(roleAtLeast(odd, "viewer"), false, odd);
});

/* ------------------------------------------------ a person's note and details */

const P1 = "abababab-abab-4aba-8aba-abababababa1";
const N1 = "efefefef-1111-4111-8111-efefefefefef";
/**
 * What `POST contacts/[id]/notes` answers: `{ note }`, the row the door wrote as the page reads it (writtenNote over
 * toNoteDto, server/people/person-notes.ts), every field PersonNoteDto has.
 */
const WRITTEN = {
  note: {
    id: N1,
    body: "Prefers mornings.",
    author_kind: "member",
    author_name: null,
    mine: true,
    for_user_id: null,
    for_name: null,
    for_me: false,
    team_only: false,
    state: "kept",
    source: "page",
    version: 1,
    created_at: "2026-09-27T14:00:00.000Z",
    updated_at: "2026-09-27T14:00:00.000Z",
    due_on: null,
    done_at: null,
    done_by_name: null,
    done_by_me: false,
    deal_id: null,
  },
};

test("a note (D8): the words and who reads them to the notes route, nothing else; the undo takes away the note the door wrote, by the id it answered; a card that does not say who reads it is never sent", () => {
  const spec = PROPOSAL_SPECS.note;
  // The one event a person's card says (0047): the person's page and the Pipeline's peek follow People, as they follow every card.
  const saved = { type: "surface:clients" };
  const forReceptionist = card("note", { contact_id: P1, body: "Prefers mornings.", team_only: false, who: "Rosa" });
  const forTeam = card("note", { contact_id: P1, body: "Owes us a callback.", team_only: true, who: "Rosa" });
  assert.deepEqual(spec.commit(forReceptionist, TAB), {
    route: "POST contacts/[id]/notes",
    params: { id: P1 },
    body: { body: "Prefers mornings.", team_only: false },
    refresh: "behind",
    events: [saved],
  });
  assert.deepEqual(spec.commit(forTeam, TAB).body, { body: "Owes us a callback.", team_only: true });
  assert.equal(spec.receipt(forReceptionist, WRITTEN), "Rosa · Note added");
  assert.equal(spec.receipt(forTeam, WRITTEN), "Rosa · Note added · Team only");
  assert.equal(spec.undo.label(forReceptionist), "Delete it");
  const kept = spec.undo.record(forReceptionist, WRITTEN, TAB);
  assert.deepEqual(kept, { contact_id: P1, note_id: N1 });
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), {
    route: "POST contacts/[id]/notes/remove",
    params: { id: P1 },
    body: { note_id: N1 },
    refresh: "behind",
    events: [saved],
  });
  assert.equal(spec.undo.receipt({ removed: N1 }), "Note deleted");
  // The route answers `{ note: null }` when the door wrote none: nothing to take away, so no undo is kept.
  assert.equal(spec.undo.record(forReceptionist, { note: null }, TAB), null);
  // Who reads it is the card's to say (D8): without it the route would default to the receptionist, which nobody
  // chose, so such a card is refused before anything is sent; and a card with no words has nothing to write.
  for (const team_only of [undefined, null, "false", 0])
    assert.deepEqual(spec.commit(card("note", { contact_id: P1, body: "x", team_only, who: "Rosa" }), TAB), {
      refused: "This card cannot be approved from here.",
    });
  assert.ok("refused" in spec.commit(card("note", { contact_id: P1, body: "", team_only: true }), TAB));
});

test("a person's details (D9): only the fields the card changes to the details route; the receipt says what the route stored; the undo sets back what the builder read, an empty field to nothing, since the route clears with an empty string", () => {
  const spec = PROPOSAL_SPECS.person_details;
  const people = { type: "surface:clients" };
  const email = card("person_details", {
    contact_id: P1,
    who: "Rosa",
    email: "rosa@example.com",
    previous: { email: null },
  });
  const both = card("person_details", {
    contact_id: P1,
    who: "Rosa",
    name: "Rosa Díaz",
    email: "rosa@example.com",
    previous: { name: "Rosa", email: "old@example.com" },
  });
  assert.deepEqual(spec.commit(email, TAB), {
    route: "PUT contacts/[id]/details",
    params: { id: P1 },
    body: { email: "rosa@example.com" },
    events: [people],
  });
  assert.deepEqual(spec.commit(both, TAB).body, { name: "Rosa Díaz", email: "rosa@example.com" });
  // What `PUT contacts/[id]/details` answers: the id and each field it wrote, as the door stored it.
  assert.equal(spec.receipt(email, { contact_id: P1, email: "rosa@example.com" }), "Rosa · Email: rosa@example.com");
  assert.equal(
    spec.receipt(both, { contact_id: P1, name: "Rosa Díaz", email: "rosa@example.com" }),
    "Rosa · Name: Rosa Díaz · Email: rosa@example.com",
  );
  assert.equal(spec.undo.label(email), "Set it back");
  const cleared = spec.undo.record(email, { contact_id: P1, email: "rosa@example.com" }, TAB);
  assert.deepEqual(cleared, { contact_id: P1, email: "" }, "an address they did not have goes again");
  assert.deepEqual(spec.undo.call(cleared, TAB_AFTER), {
    route: "PUT contacts/[id]/details",
    params: { id: P1 },
    body: { email: "" },
    events: [people],
  });
  const back = spec.undo.record(both, { contact_id: P1, name: "Rosa Díaz", email: "rosa@example.com" }, TAB);
  assert.deepEqual(back, { contact_id: P1, name: "Rosa", email: "old@example.com" });
  assert.deepEqual(spec.undo.call(back, TAB_AFTER).body, { name: "Rosa", email: "old@example.com" });
  assert.equal(spec.undo.receipt({}), "Set back");
  // A card that does not carry what a field was keeps no undo: nothing is cleared on a guess.
  assert.equal(spec.undo.record(card("person_details", { contact_id: P1, name: "Rosa Díaz" }), {}, TAB), null);
  // Nothing to change, nothing sent; notes and a proposal's link are never this card's, whatever it carries.
  assert.deepEqual(spec.commit(card("person_details", { contact_id: P1, who: "Rosa", previous: {} }), TAB), {
    refused: "This card cannot be approved from here.",
  });
  assert.deepEqual(
    spec.commit(
      card("person_details", { contact_id: P1, name: "Rosa", notes: "x", proposal: "https://x.example.com" }),
      TAB,
    ).body,
    { name: "Rosa" },
  );
  assert.deepEqual(spec.undo.call({ contact_id: P1 }, TAB), { refused: "This one has no undo." });
});

/* ------------------------------------------------------------- a list and a run (PR 4.7) */

const L1 = "5e5e5e5e-0000-4000-8000-000000000001";
const RULE = { v: 2, all: [{ field: "last_visit", op: "more_than", days: 60 }] };
/** What `POST segments` answers: the list it made, SavedListDto, kept by its rule and with nobody put on it by hand. */
const MADE = { id: L1, name: "Lapsed regulars", ids: [], rule: RULE, archived_at: null };

test("a list (D10): the name and the rule to the lists route, a list that keeps itself current; the receipt is People's; the undo deletes it by the id the route answered, and says so, or that it was archived when something came to depend on it; Open goes to the list once it is made", () => {
  const spec = PROPOSAL_SPECS.list;
  const p = card("list", { name: "Lapsed regulars", rule: RULE, cannot: "regulars", count: 4 });
  assert.deepEqual(spec.commit(p, TAB), { route: "POST segments", body: { name: "Lapsed regulars", rule: RULE } });
  assert.equal(spec.receipt(p, MADE), "Lapsed regulars made. It keeps itself current.");
  assert.equal(spec.undo.label(p), "Delete it");
  const kept = spec.undo.record(p, MADE, TAB);
  assert.deepEqual(kept, { list_id: L1 }, "the route answers no ledger row: the undo names none");
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), { route: "DELETE segments/[id]", params: { id: L1 } });
  // What `DELETE segments/[id]` answers, both ways (segments/[id]/route.ts): deleted, or archived with what paused and
  // what reads it.
  assert.equal(spec.undo.receipt({ deleted: true, id: L1 }), "Deleted. The people stay.");
  assert.equal(
    spec.undo.receipt({ archived: true, id: L1, paused: ["Win-back"], on_it: ["Win-back"], read_by: [] }),
    "Archived, not deleted: Win-back paused. It comes back from Archived under your lists.",
  );
  assert.equal(
    spec.undo.receipt({ archived: true, id: L1, paused: [], on_it: [], read_by: ["Talkers", "Quiet"] }),
    "Archived, not deleted: Talkers, Quiet reads it. It comes back from Archived under your lists.",
  );
  assert.equal(
    spec.undo.receipt({ archived: true, id: L1, paused: [], on_it: ["Win-back"], read_by: [] }),
    "Archived, not deleted: a campaign runs on it. It comes back from Archived under your lists.",
  );
  // Open: People before it is made, the list itself once it is (the commit kept its id), People again once undone.
  assert.equal(cardOpenRoute(p), "clients");
  assert.equal(cardOpenRoute({ ...p, outcome: done(kept) }), `clients/list:${L1}`);
  assert.equal(cardOpenRoute({ ...p, outcome: { state: "undone", receipt: "r", atMs: T, undo: null } }), "clients");
  // A route that answered no id keeps no undo; a card with no rule, or no name, is never sent (a list kept by hand is
  // made on People, where its people are picked).
  assert.equal(spec.undo.record(p, {}, TAB), null);
  for (const payload of [
    { name: "Lapsed", rule: null },
    { name: "", rule: RULE },
    { name: "Lapsed", rule: "x" },
  ])
    assert.deepEqual(spec.commit(card("list", payload), TAB), { refused: "This card cannot be approved from here." });
});

const RUN = "88888888-8888-4888-8888-888888888881";
/** What `POST broadcasts/[id]/approve` answers (core approveRun's ApproveReceipt): now, or moved to the next open hour. */
const APPROVED = {
  id: RUN,
  state: "scheduled",
  recipient_count: 12,
  scheduled_for: "2026-09-26T18:00:00.000Z",
  moved_from: null,
  decision_id: "d-approve",
};
/** What `POST broadcasts/[id]/cancel` answers (core cancelBroadcast's CancelReceipt), from the state it left. */
const CANCELED = (was) => ({ id: RUN, state: "canceled", was, decision_id: "d-cancel" });

test("a run (D11): approve and skip are the run's own doors, approve's undo is a broadcast's cancel and a skip keeps none; the receipts are the Broadcasts page's, when it goes by the business's clock the card carries; a card that says no verb is never sent", () => {
  const spec = PROPOSAL_SPECS.run;
  const run = { broadcast_id: RUN, name: "Win-back · 2026-09-26", people: 12, timezone: "America/New_York" };
  const approve = card("run", { ...run, verb: "approve" });
  const skip = card("run", { ...run, verb: "skip" });
  assert.deepEqual(spec.commit(approve, TAB), { route: "POST broadcasts/[id]/approve", params: { id: RUN } });
  assert.deepEqual(spec.commit(skip, TAB), { route: "POST broadcasts/[id]/cancel", params: { id: RUN } });
  assert.equal(spec.receipt(approve, APPROVED), "Win-back · 2026-09-26 approved — 12 people, sending now");
  // Approved at 23:30 in New York, it goes at nine the next morning, said from the moment it was approved.
  assert.equal(
    spec.receipt(approve, {
      ...APPROVED,
      recipient_count: 1,
      scheduled_for: "2026-09-27T13:00:00.000Z",
      moved_from: "2026-09-27T03:30:00.000Z",
    }),
    "Win-back · 2026-09-26 approved — 1 person, scheduled for tomorrow 9:00 AM — messages go out between 9:00 and 20:59 by your clock",
  );
  assert.equal(spec.receipt(skip, CANCELED("pending_approval")), "Win-back · 2026-09-26 skipped — nothing will send");
  // A run that moved on before the skip landed: the cancel says what it did to it, in the page's words.
  assert.equal(spec.receipt(skip, CANCELED("scheduled")), "Win-back · 2026-09-26 canceled — nothing will send");
  assert.equal(spec.receipt(skip, CANCELED("sending")), "Win-back · 2026-09-26 stops after this batch");
  assert.equal(spec.undo.label(approve), "Cancel it, if it has not finished");
  assert.equal(spec.undo.label(skip), null, "a skip has nothing to undo");
  const kept = spec.undo.record(approve, APPROVED, TAB);
  assert.deepEqual(kept, { broadcast_id: RUN, decision_id: "d-approve" }, "the approval's ledger row, for undo_of");
  assert.equal(spec.undo.record(skip, CANCELED("pending_approval"), TAB), null);
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), PROPOSAL_SPECS.broadcast.undo.call(kept, TAB_AFTER));
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), { route: "POST broadcasts/[id]/cancel", params: { id: RUN } });
  assert.equal(spec.undo.receipt(CANCELED("scheduled")), "Canceled — nothing will send");
  assert.equal(spec.undo.receipt(CANCELED("sending")), "Stopped — it ends after this batch");
  assert.equal(cardOpenRoute(approve), `campaigns/sequences/${RUN}/runs/${RUN}`, "the run's sheet");
  // No verb, or one it does not know, is no card to send: the verb has no default.
  for (const verb of [undefined, null, "", "cancel", "Approve"])
    assert.deepEqual(spec.commit(card("run", { ...run, verb }), TAB), {
      refused: "This card cannot be approved from here.",
    });
  assert.ok("refused" in spec.commit(card("run", { verb: "approve" }), TAB), "nor a card that names no run");
});

/* ------------------------------------------------ a playbook's change, and a new one's starter (the moment spec) */

test("a playbook's change from a card (A5): its own PUT with what it changes and nothing else, the drawer's sentence as its receipt, and an undo that puts back what the route found", () => {
  const spec = PROPOSAL_SPECS.playbook_change;
  const p = card("playbook_change", CHANGE);
  assert.deepEqual([spec.needs, spec.gate], ["operator", "approve"]);
  assert.deepEqual(spec.commit(p, TAB), {
    route: "PUT playbooks/[id]",
    params: { id: "pb1" },
    body: { name: "Past clients", run_hour: 9 },
  });
  // A payload that carries more of a playbook sends none of it; one that changes nothing, or names no playbook, is never sent.
  const loose = card("playbook_change", { ...CHANGE, trigger: "lapsed", template_id: "t9", state: null });
  assert.deepEqual(spec.commit(loose, TAB).body, { name: "Past clients", run_hour: 9 });
  for (const broken of [
    { ...CHANGE, playbook_id: null },
    { playbook_id: "pb1", playbook_name: "Win-back", was: {} },
  ])
    assert.deepEqual(spec.commit(card("playbook_change", broken), TAB), { refused: PROPOSAL_WORDS.cannotApprove });
  const sentence = (parts) => parts.map((x) => (typeof x === "string" ? x : x.b)).join("");
  // The route answers the name it stored; a pause and a resume say the drawer's own words.
  assert.equal(spec.receipt(p, { name: "Past clients" }), sentence(LIFECYCLE_TOAST.changed("Past clients")));
  const pause = card("playbook_change", {
    playbook_id: "pb1",
    playbook_name: "Win-back",
    state: "paused",
    was: { state: "running" },
  });
  const resume = card("playbook_change", {
    playbook_id: "pb1",
    playbook_name: "Win-back",
    state: "running",
    was: { state: "paused" },
  });
  assert.equal(spec.receipt(pause, { name: "Win-back" }), sentence(LIFECYCLE_TOAST.paused("Win-back")));
  assert.equal(spec.receipt(resume, {}), sentence(LIFECYCLE_TOAST.resumed("Win-back")));
  assert.deepEqual(
    [spec.undo.label(p), spec.undo.label(pause), spec.undo.label(resume), spec.undo.window],
    ["Put it back", "Resume it", "Pause it again", "ten_minutes"],
  );
  // Undoing a pause resumes it under its class's mode (D7): where the card read that mode as auto, the undo says in full
  // that it sends on its own, in the Resume ask's own sentence; any other mode says nothing more, and a card made where
  // the mode could not be read (null) claims none.
  const pausedUnder = (mode) => spec.undo.label(card("playbook_change", { ...pause.payload, mode }));
  assert.equal(pausedUnder("auto"), `Resume it. ${LIFECYCLE_WORDS.ledger.resume.auto}`);
  assert.equal(pausedUnder("ask"), "Resume it");
  assert.equal(pausedUnder(null), "Resume it");
  // The undo puts back what the route found when it wrote (its `was`), the card's copy only where a route answers none.
  // And the ledger row the change wrote, which its undo names (undo_of).
  const kept = spec.undo.record(p, { was: { name: "Spring win-back", run_hour: 11 }, decision_id: "d-change" }, TAB);
  assert.deepEqual(kept, {
    playbook_id: "pb1",
    was: { name: "Spring win-back", run_hour: 11 },
    decision_id: "d-change",
  });
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), {
    route: "PUT playbooks/[id]",
    params: { id: "pb1" },
    body: { name: "Spring win-back", run_hour: 11 },
  });
  assert.deepEqual(spec.undo.record(p, {}, TAB).was, CHANGE.was);
  // A route that wrote nothing (somebody made the same change first) answers an empty `was`: no undo is offered, since one
  // would undo what somebody else did.
  assert.equal(spec.undo.record(p, { was: {}, decision_id: null }, TAB), null);
  assert.deepEqual(spec.undo.call({ playbook_id: "pb1", was: {} }, TAB_AFTER), { refused: PROPOSAL_WORDS.noUndo });
  assert.equal(spec.undo.receipt({}), "It is as it was");
  assert.equal(spec.open(p, null), "campaigns/sequences/pb1", "its record");
});

test("a playbook card (A0, the landing rule): a starter it names is committed in place of a message, it opens in the composer on its moment before Approve, and in the new drawer after, from the undo the commit kept", () => {
  const spec = PROPOSAL_SPECS.playbook;
  const onStarter = card("playbook", {
    trigger: "quiet_30",
    starter_key: "winback_reply",
    name: null,
    run_hour: 10,
    cap_per_run: 25,
  });
  const body = spec.commit(onStarter, TAB).body;
  assert.equal(body.starter_key, "winback_reply");
  assert.equal("template_id" in body, false, "no message: the route files the starter first");
  assert.equal(spec.commit(card("playbook", { trigger: "quiet_30", template_id: "t1" }), TAB).body.template_id, "t1");
  assert.equal(spec.open(onStarter, null), "campaigns/sequences/new:moment:quiet_30");
  assert.equal(spec.open(onStarter, done({ playbook_id: "pb9", decision_id: "d1" })), "campaigns/sequences/pb9");
  assert.equal(spec.open(card("playbook", {}), null), "campaigns/sequences");
  // The receipt says the starter's WhatsApp version went for review, where the route says it did, naming the reviewer as
  // every sentence a person reads does (WhatsApp, never Meta); and "Campaign", the word a person reads.
  const submitted = spec.receipt(onStarter, { name: "Win-back", starter: { status: "submitted" } });
  assert.ok(submitted.endsWith(" · its starter's WhatsApp version is with WhatsApp for review"), submitted);
  assert.doesNotMatch(submitted, /Meta/);
  assert.doesNotMatch(spec.receipt(onStarter, { name: "Win-back" }), /review/);
  assert.match(spec.receipt(onStarter, { name: "Win-back" }), /^Campaign “Win-back” is running/);
});
