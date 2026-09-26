/**
 * The cards' three readings -- the gate a card checks before Approve (PROPOSAL_GATE), whether a committed card's undo
 * is still true to offer (askUndoOpen) and where its Open goes (cardOpenRoute) -- answered over a frozen table.
 *
 * The table was written against a993b71d, before the cards had specs (Ask Rewired, PR 3.2), and its answers are what
 * those three said then. PR 3.2 derives all three from one spec per card kind; the table is what proves the
 * derivation changed no answer. A row that fails here is a card that now opens elsewhere, or offers its undo when it
 * did not, and the change is a change to the product, not to this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_UNDO_MS, PROPOSAL_GATE, askUndoOpen, cardOpenRoute } from "@chanlytics/contracts";

/** The twelve kinds, in AskProposal's order, and one no card has. */
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
  "deal",
  "teleport",
];

/* ------------------------------------------------------------------ the gate */

test("the gate each kind checks before Approve is the one it checked at a993b71d", () => {
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
    deal: "approve",
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
 * three VERSIONS -- 1 where the undo was offered.
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
  deal: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  teleport: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
};

test("a committed card's undo is offered exactly where it was at a993b71d, for every kind over the frozen table", () => {
  for (const kind of KINDS) {
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
/** cardOpenRoute at a993b71d, per kind: one answer per entry of CASES, or one answer for them all. */
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
  deal: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  teleport: [null, null, "inbox/th-c1", null, null, "inbox/th-c1", null, null, null, null, null, null, null, null],
};

test("a card's Open goes exactly where it went at a993b71d, for every kind over the frozen table", () => {
  for (const kind of KINDS) {
    const want = Array.isArray(OPEN[kind]) ? OPEN[kind] : CASES.map(() => OPEN[kind]);
    const got = CASES.map(([payload, outcome]) =>
      cardOpenRoute({ kind, payload, ...(outcome !== undefined ? { outcome } : {}) }),
    );
    assert.deepEqual(got, want, kind);
  }
});
