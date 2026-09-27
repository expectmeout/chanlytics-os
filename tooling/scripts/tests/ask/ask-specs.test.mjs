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
 * the gate a card checks before Approve lets the roles that role lets (ROLE_PERMS, on the server's own ladder).
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
  PROPOSAL_SPECS,
  ROLE_PERMS,
  ROUTE_KEYS,
  askUndoOpen,
  cardOpenRoute,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8")).routes;

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
const ANSWER = {
  message_id: "m1",
  cancelable_until: iso(T + 15_000),
  decision_id: "d1",
  version: 4,
  id: "b1",
  search_id: "s1",
  deal: { id: "deal1" },
};
const TAB = { settings: { config: { brain: {} }, version: 3 } };
const TAB_AFTER = { settings: { config: { brain: {} }, version: 4 } };
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
  deal: [
    card("deal", { contact_id: "p1", stage: "won", who: "Maria" }, { step: { body: "Call", due_on: "2026-10-01" } }),
  ],
};

/** Every route a kind's spec reaches over its shapes: its commit, a second call, and the undo of what it kept. */
function routesOf(kind) {
  const spec = PROPOSAL_SPECS[kind];
  const seen = [];
  for (const p of SHAPES[kind]) {
    const commit = spec.commit(p, TAB);
    assert.ok(commit.route, `${kind}: every shape here commits (${commit.refused})`);
    seen.push({ route: commit.route, by: "commit" });
    const then = spec.then?.(p, ANSWER);
    if (then) seen.push({ route: then.route, by: "then" });
    const record = spec.undo?.record(p, ANSWER, TAB) ?? null;
    if (record) {
      const undo = spec.undo.call(record, TAB_AFTER);
      assert.ok(undo.route, `${kind}: every undo kept here can be sent (${undo.refused})`);
      seen.push({ route: undo.route, by: "undo" });
    }
  }
  return seen;
}

test("the twelve kinds each have a spec, and every route a spec names is a route the app has", () => {
  assert.deepEqual(Object.keys(PROPOSAL_SPECS), KINDS.slice(0, 12));
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
    deal: ["POST contacts/[id]/deal", "POST contacts/[id]/notes"],
  });
  for (const routes of Object.values(named)) for (const r of routes) assert.ok(ROUTE_KEYS.includes(r), r);
});

test("a spec's `needs` is the policy role of every route it names; the one exception is the lead search's stop, an operator's door undoing a partner's card", () => {
  for (const [kind, spec] of Object.entries(PROPOSAL_SPECS)) {
    for (const { route, by } of routesOf(kind)) {
      const role = POLICY[route]?.role;
      if (kind === "lead_search" && route === "POST lead-searches/[id]/stop") {
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
      .map(([k, s]) => [k, s.needs]),
    [
      ["person_mode", "owner"],
      ["settings", "partner"],
      ["invite", "owner"],
      ["lead_search", "partner"],
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
      if (kind === "person_mode" && role === "partner") {
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
