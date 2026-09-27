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
 * family's cards do, and their calls are pinned over the answers their routes really give.
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

/** The fourteen kinds, in AskProposal's order, and one no card has. */
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
  "note",
  "person_details",
  "teleport",
];

/* ------------------------------------------------------------------ the gate */

test("the gate each kind checks before Approve is the one it checked at a993b71d; a person's note and details, an operator's, check approve", () => {
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
    note: "approve",
    person_details: "approve",
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
 * three VERSIONS -- 1 where the undo was offered. The two kinds since keep the family's ten minutes.
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
  note: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
  person_details: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",
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
/**
 * cardOpenRoute at a993b71d, per kind: one answer per entry of CASES, or one answer for them all. The two kinds since
 * open the person they name, as the family's do.
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
  deal: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  note: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
  person_details: [null, null, null, "clients/p1", null, "clients/p1", null, null, null, null, null, null, null, null],
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
  note: { id: "n1" },
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

test("the fourteen kinds each have a spec, and every route a spec names is a route the app has", () => {
  assert.deepEqual(Object.keys(PROPOSAL_SPECS), KINDS.slice(0, 14));
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
    note: ["POST contacts/[id]/notes", "POST contacts/[id]/notes/remove"],
    person_details: ["PUT contacts/[id]/details"],
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
  const saved = { type: "note:saved", detail: { personId: P1 } };
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
