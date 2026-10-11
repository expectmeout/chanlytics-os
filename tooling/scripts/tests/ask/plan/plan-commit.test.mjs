/**
 * A plan's cards, committed (the marketing manager's spec §5.4): Ask's plan is a group of ordinary cards, each stamped
 * with the plan it is a step of (AskProposal.plan). The silent steps (a message filed for the Library, a note for the
 * receptionist, a change to a campaign) are approved together by commitPlan, in step order, each under its step's key
 * (`plan:<id>:<n>`), the first refusal or failure ending the run; a send is its own press through commitProposal, and a
 * token in its payload (`@step:n`) is filled with what step n made, or refused while step n has made nothing yet or was
 * undone. What a card made is its spec's to say (ProposalSpec.made): a message's version, which a send names it by.
 *
 * EXECUTED: the real commit walk (legacy-bridge ask/commit.ts) over the real specs, through the typed client bound to a
 * fake fetch that answers as the routes answer, so what is proved is what leaves the tab: the route, the body, the key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
// Read as a module, so a name contracts does not say yet is a failing assertion, not a file that will not load.
const C = await import("@chanlytics/contracts");
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const commit = await import(at("apps/dashboard/src/legacy-bridge/ask/commit.ts"));
const { commitProposal } = commit;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const V = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const PB = "88888888-8888-4888-8888-888888888888";
const B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const L1 = "5e5e5e5e-0000-4000-8000-000000000001";
const D = (n) => `dddddddd-dddd-4ddd-8ddd-ddddddddddd${n}`;
const PLAN = "plan-0f1e2d3c";
const NOW = Date.parse("2026-10-11T14:00:00Z");
const MADE_AT = new Date(NOW - 3_600_000).toISOString();

const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const refusal = (status, code, message) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), { status });

/** What POST templates/message answers (WriteMessageAnswer): each version filed, email first, WhatsApp's in review. */
const FILED = {
  name: "offer",
  language: "en_US",
  versions: [
    { channel: "email", id: V(1), state: "approved" },
    { channel: "whatsapp", id: V(2), state: "pending" },
  ],
};

/** The routes a plan's cards reach, answered as the server answers them. */
const ANSWERS = {
  "POST /api/v1/templates/message": FILED,
  "PUT /api/v1/settings": { config: {}, version: 4 },
  [`PUT /api/v1/playbooks/${PB}`]: {
    id: PB,
    name: "This month's offer",
    state: "paused",
    was: { state: "running" },
    decision_id: D(1),
  },
  "POST /api/v1/broadcasts": {
    id: B1,
    name: "Offer: 10% off every service all November",
    state: "scheduled",
    recipient_count: 40,
    scheduled_for: "2026-11-01T15:00:00.000Z",
    scheduled_ahead: true,
    decision_id: D(2),
  },
};

/**
 * A tab: the typed client on a fake fetch that records every request, and the few window parts the committer touches.
 * `answer` answers a request; the default is ANSWERS, and a route this test does not answer is a failure.
 */
function tab(answer = null) {
  const sent = [];
  const client = createApi({
    fetch: async (url, init) => {
      const key = `${init.method} ${String(url).replace(/\?.*$/, "")}`;
      const s = {
        key,
        body: init.body ? JSON.parse(init.body) : undefined,
        via: init.headers["x-via"],
        idem: init.headers["idempotency-key"],
      };
      sent.push(s);
      if (answer) return answer(key, init, s);
      const data = ANSWERS[key];
      if (!data) throw new Error(`the card reached a route this test does not answer: ${key}`);
      return envelope(data);
    },
    workspace: () => A,
    onSignedOut: () => {},
    onChooseWorkspace: () => {},
    refresh: async () => {},
    now: () => 1_000,
  });
  const win = {
    __SETTINGS: { config: { brain: { business_name: "Harbor", profile: {} } }, version: 3 },
    location: { hash: "", pathname: "/w/harbor" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
  };
  return { client, win, sent };
}

/** A card stamped as step `step` of the plan: four steps, the first three silent, the last its send. */
const stamped = (kind, step, payload, over = {}) => ({
  id: `p-${step}`,
  kind,
  needs: "operator",
  title: "t",
  summary: "the summary",
  payload,
  undo: null,
  made_at: MADE_AT,
  plan: { id: PLAN, step, of: 4, silent: kind !== "broadcast" },
  ...over,
});

/** Step 1: the offer's message, written for the Library. */
const message = stamped("message", 1, {
  name: "offer",
  language: "en_US",
  category: "marketing",
  versions: {
    whatsapp: { body: "Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}}" },
    email: { subject: "An offer from {{2}}", body: "Hi {{1}},\n\nAn offer from {{2}}: {{3}}\n\nBook here: {{4}}" },
  },
  slots: [
    { position: 1, label: "First name", kind: "first_name" },
    { position: 2, label: "Business name", kind: "business_name" },
    { position: 3, label: "The offer", kind: "text" },
    { position: 4, label: "Booking link", kind: "booking_link" },
  ],
});
/** Step 2: the receptionist's note about the offer, until its last day. */
const note = stamped("settings", 2, {
  change: {
    op: "add_note",
    title: "Offer: 10% off every service all November",
    text: "The offer: 10% off every service all November. It runs from Nov 1 to Nov 30.",
    until: "2026-11-30",
  },
});
/** Step 3: the month's offer, paused while the offer runs. */
const pause = stamped("playbook_change", 3, { playbook_id: PB, playbook_name: "This month's offer", state: "paused" });
/** Step 4: the send, naming the message step 1 writes. */
const send = stamped("broadcast", 4, {
  template_id: C.stepToken(1),
  params: ["@first_name", "@business_name", "10% off every service all November.", "@booking_link"],
  audience_kind: "list",
  audience_id: "offers_ok",
  scheduled_for: "2026-11-01T15:00:00.000Z",
  name: "Offer: 10% off every service all November",
  channels: ["whatsapp", "email"],
});

const keys = (t) => t.sent.map((s) => [s.key, s.idem]);

test("the plan's words: a step it waits for, an undone step and a stop are each said in the product's voice", () => {
  assert.equal(typeof C.PROPOSAL_WORDS.planUndone, "string");
  assert.match(C.PROPOSAL_WORDS.waitsForStep(2), /step 2\b/);
  assert.match(C.PROPOSAL_WORDS.planStopped(2, "Someone saved the settings first."), /step 2\b/);
  assert.ok(
    C.PROPOSAL_WORDS.planStopped(2, "Someone saved the settings first.").includes("Someone saved the settings first."),
    "a stop says why, in the refusal's own words",
  );
});

test("the silent steps commit together, in step order, each under its step's key; the message's version is what step 1 made; the send is not among them", async () => {
  const t = tab();
  // Handed in any order, with the send among them: only the silent ones go, by their step.
  const run = await commit.commitPlan(t.win, [send, pause, note, message], {}, { client: t.client, nowMs: NOW });
  assert.deepEqual(keys(t), [
    ["POST /api/v1/templates/message", `plan:${PLAN}:1`],
    ["PUT /api/v1/settings", `plan:${PLAN}:2`],
    [`PUT /api/v1/playbooks/${PB}`, `plan:${PLAN}:3`],
  ]);
  assert.ok(
    t.sent.every((s) => s.via === "ask"),
    "every call marked as a card's",
  );
  assert.equal(run.stoppedAt, null);
  assert.deepEqual(
    run.results.map((r) => [r.step, r.result.ok, r.id]),
    [
      [1, true, V(1)],
      [2, true, null],
      [3, true, null],
    ],
    "a message names the version the door filed first (any version names the message); a note and a pause make nothing a step names",
  );
  assert.deepEqual(run.results[0].result.made, { kind: "message", id: V(1) }, "the commit's result says what it made");
  assert.equal(run.results[1].result.made, null);
  // Every step committed is in the run's made, the ones that made nothing a token names with no id.
  assert.deepEqual(run.made, {
    1: { kind: "message", id: V(1) },
    2: { kind: "settings", id: null },
    3: { kind: "playbook_change", id: null },
  });
  assert.deepEqual([run.done, run.undone], [[], []]);
  // Each step's own receipt and undo, as its card's own press would have them.
  assert.equal(run.results[2].result.receipt, C.PROPOSAL_SPECS.playbook_change.receipt(pause, ANSWERS[keys(t)[2][0]]));
  assert.deepEqual(run.results[2].result.undo, { playbook_id: PB, was: { state: "running" }, decision_id: D(1) });
});

test("a step refused or failed stops the run there: later steps are not sent, stoppedAt names it, and its result says the plan stopped at it", async () => {
  const failing = tab((key) =>
    key === "PUT /api/v1/settings"
      ? refusal(409, "conflict", "Someone saved the settings first. Open Settings and try again.")
      : envelope(ANSWERS[key]),
  );
  const run = await commit.commitPlan(failing.win, [message, note, pause], {}, { client: failing.client, nowMs: NOW });
  assert.deepEqual(
    keys(failing).map(([k]) => k),
    ["POST /api/v1/templates/message", "PUT /api/v1/settings"],
    "step 3 is never sent",
  );
  assert.equal(run.stoppedAt, 2);
  assert.deepEqual(
    run.results.map((r) => [r.step, r.result.ok, r.id]),
    [
      [1, true, V(1)],
      [2, false, null],
    ],
  );
  assert.equal(
    run.results[1].result.message,
    C.PROPOSAL_WORDS.planStopped(2, "Someone saved the settings first. Open Settings and try again."),
  );
  assert.equal(run.results[1].result.status, 409, "the route's refusal is kept whole beneath the words");

  // Refused by its spec before anything is sent (Settings not loaded in this tab): the same stop, at the same step.
  const cold = tab();
  cold.win.__SETTINGS = null;
  const coldRun = await commit.commitPlan(cold.win, [message, note, pause], {}, { client: cold.client, nowMs: NOW });
  assert.deepEqual(
    keys(cold).map(([k]) => k),
    ["POST /api/v1/templates/message"],
  );
  assert.equal(coldRun.stoppedAt, 2);
  assert.equal(
    coldRun.results[1].result.message,
    C.PROPOSAL_WORDS.planStopped(2, "Settings are not loaded yet — open Settings once and try again."),
  );
});

test("a silent step may name what an earlier silent step made: its token is filled from the run's own made, and a step it names that made nothing stops the run", async () => {
  // No plan writes such a step today (a change names the campaign it changes); the token is filled wherever the
  // payload holds it, so the run's own made is what any later silent step reads.
  const named = stamped("playbook_change", 2, { playbook_id: C.stepToken(1), state: "paused" });
  const t = tab((key) => envelope(key === `PUT /api/v1/playbooks/${V(1)}` ? { id: V(1), state: "paused" } : FILED));
  const run = await commit.commitPlan(t.win, [named, message], {}, { client: t.client, nowMs: NOW });
  assert.deepEqual(keys(t), [
    ["POST /api/v1/templates/message", `plan:${PLAN}:1`],
    [`PUT /api/v1/playbooks/${V(1)}`, `plan:${PLAN}:2`],
  ]);
  assert.equal(run.stoppedAt, null);

  // Step 1 was committed but filed nothing (every version refused): it is done and made nothing a token can name, so
  // step 2 is refused in words that say so (waiting for step 1 would never help), and is not sent.
  const none = tab(() =>
    envelope({ name: "offer", language: "en_US", versions: [], refused: { channel: "email", words: "x" } }),
  );
  const stopped = await commit.commitPlan(none.win, [message, named], {}, { client: none.client, nowMs: NOW });
  assert.deepEqual(
    keys(none).map(([k]) => k),
    ["POST /api/v1/templates/message"],
  );
  assert.deepEqual(stopped.results[0].result.made, null);
  assert.deepEqual(stopped.made, { 1: { kind: "message", id: null } });
  assert.equal(stopped.stoppedAt, 2);
  assert.equal(stopped.results[1].result.message, C.PROPOSAL_WORDS.planStopped(2, C.PROPOSAL_WORDS.stepMadeNothing(1)));
});

test("a step already in made is never sent again: a press after a note was approved on its own sends only the rest, and a press after every step sends nothing and says they were done", async () => {
  const t = tab();
  // The note was approved on its own press (it made nothing a token names).
  const run = await commit.commitPlan(
    t.win,
    [message, note, pause],
    { 2: { kind: "settings", id: null } },
    { client: t.client, nowMs: NOW },
  );
  assert.deepEqual(keys(t), [
    ["POST /api/v1/templates/message", `plan:${PLAN}:1`],
    [`PUT /api/v1/playbooks/${PB}`, `plan:${PLAN}:3`],
  ]);
  assert.deepEqual([run.done, run.undone, run.stoppedAt], [[2], [], null]);
  assert.deepEqual(
    run.results.map((r) => r.step),
    [1, 3],
  );

  // Pressed again with what that press made: every step is done, so nothing leaves the tab, whatever a key's life.
  const again = tab();
  const twice = await commit.commitPlan(again.win, [message, note, pause], run.made, {
    client: again.client,
    nowMs: NOW,
  });
  assert.deepEqual(again.sent, [], "REGRESSION: a second press sent a step that was done");
  assert.deepEqual(
    [twice.results, twice.done, twice.undone, twice.stoppedAt, twice.made],
    [[], [1, 2, 3], [], null, run.made],
  );
});

test("a silent step the owner undid is never run again: the group's press skips it and approves the rest, and a step that names it stops there with the plan's words", async () => {
  const t = tab();
  const run = await commit.commitPlan(
    t.win,
    [message, note, pause],
    { 2: { undone: true } },
    { client: t.client, nowMs: NOW },
  );
  assert.deepEqual(
    keys(t).map(([k]) => k),
    ["POST /api/v1/templates/message", `PUT /api/v1/playbooks/${PB}`],
    "the note the owner took back is not written again",
  );
  assert.deepEqual([run.done, run.undone, run.stoppedAt], [[], [2], null]);
  assert.deepEqual(run.made[2], { undone: true }, "and stays undone in what the run hands back");
});

test("what a step made survives a reload: the outcome a commit records keeps it through the outcome's schema (an older outcome reads as made nothing), and planMadeOf rebuilds the plan's made from the cards' outcomes in one pass", async () => {
  const t = tab();
  const run = await commit.commitPlan(t.win, [message, note, pause], {}, { client: t.client, nowMs: NOW });
  // The outcome each card records (the Line's record of an Approve), read back through the route's schema.
  const recorded = run.results.map((r) =>
    C.AskProposalOutcomeSchema.parse({
      state: "done",
      receipt: r.result.receipt,
      atMs: 1,
      undo: r.result.undo,
      made: r.result.made,
    }),
  );
  assert.deepEqual(recorded[0].made, { kind: "message", id: V(1) }, "kept, not stripped");
  assert.equal(recorded[1].made, null);
  // An outcome saved before outcomes kept what was made reads as having made nothing.
  const older = C.AskProposalOutcomeSchema.parse({ state: "done", receipt: "Paused", atMs: 1 });
  assert.equal(older.made, null);

  const reloaded = [
    { ...message, outcome: recorded[0] },
    { ...note, outcome: recorded[1] },
    { ...pause, outcome: older },
    { ...send, outcome: null },
    // Another plan's card in the same turn, undone there, is not this plan's step.
    stamped("message", 1, message.payload, {
      id: "p-other",
      plan: { id: "plan-other", step: 1, of: 1, silent: true },
      outcome: { state: "undone", receipt: "x", atMs: 1 },
    }),
  ];
  assert.deepEqual(C.planMadeOf(PLAN, reloaded), run.made, "the same made the press handed back");
  // An undone card is undone in it.
  assert.deepEqual(
    C.planMadeOf(PLAN, [{ ...note, outcome: { state: "undone", receipt: "Previous settings are back", atMs: 2 } }]),
    { 2: { undone: true } },
  );
  // A card dismissed or failed made nothing: it is not in made, and may be pressed again.
  assert.deepEqual(
    C.planMadeOf(PLAN, [
      { ...note, outcome: { state: "failed", receipt: "x", atMs: 2 } },
      { ...pause, outcome: { state: "dismissed", receipt: "Not now", atMs: 2 } },
    ]),
    {},
  );
  // Pressed after the reload, on this plan's cards: nothing is sent again.
  const after = tab();
  const pressed = await commit.commitPlan(after.win, reloaded.slice(0, 4), C.planMadeOf(PLAN, reloaded), {
    client: after.client,
    nowMs: NOW,
  });
  assert.deepEqual([after.sent, pressed.done], [[], [1, 2, 3]]);
});

test("two presses that each know nothing was made (two tabs at once, a reload before an outcome was kept) send the same keys, and the routes answer the first press: nothing is filed twice", async () => {
  // The write routes keep a card's answer under its key (server/route.ts onceForKey: a card's key, whatever its body).
  // What made says is the guard for as long as a plan lives; the key is the guard for the press that cannot know it.
  const kept = new Map();
  const filed = {};
  const t = tab((key, init) => {
    const k = init.headers["idempotency-key"];
    if (!kept.has(k)) {
      filed[key] = (filed[key] ?? 0) + 1;
      kept.set(k, ANSWERS[key]);
    }
    return envelope(kept.get(k));
  });
  const cards = [message, note, pause];
  const first = await commit.commitPlan(t.win, cards, {}, { client: t.client, nowMs: NOW });
  const firstKeys = keys(t);
  const second = await commit.commitPlan(t.win, cards, {}, { client: t.client, nowMs: NOW });
  assert.deepEqual(keys(t).slice(firstKeys.length), firstKeys, "the second press sends the first's keys, in its order");
  assert.deepEqual(Object.values(filed), [1, 1, 1], "REGRESSION: a second press filed a step again");
  assert.deepEqual(second, first, "and is answered with what the first made");
  // A step pressed on its own (after a stop) goes under the same key as the group's press of it.
  await commitProposal(t.win, note, t.client, { nowMs: NOW });
  assert.equal(t.sent.at(-1).idem, `plan:${PLAN}:2`);
  assert.equal(filed["PUT /api/v1/settings"], 1);
});

test("a send names what earlier steps made: refused while a step it names has made nothing, sent with the ids once they have, under its step's key", async () => {
  const listed = stamped("broadcast", 4, { ...send.payload, audience_kind: "saved", audience_id: C.stepToken(2) });
  const t = tab();
  // Step 1 made the message; step 2's list is not made yet.
  const made = { 1: { kind: "message", id: V(1) } };
  assert.deepEqual(await commitProposal(t.win, listed, t.client, { nowMs: NOW, made }), {
    ok: false,
    message: C.PROPOSAL_WORDS.waitsForStep(2),
  });
  assert.deepEqual(t.sent, [], "nothing leaves the tab");
  // Nothing made at all: it waits for the first step it names.
  assert.deepEqual(await commitProposal(t.win, listed, t.client, { nowMs: NOW }), {
    ok: false,
    message: C.PROPOSAL_WORDS.waitsForStep(1),
  });
  assert.deepEqual(t.sent, []);

  const r = await commitProposal(t.win, listed, t.client, {
    nowMs: NOW,
    made: { ...made, 2: { kind: "list", id: L1 } },
  });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(keys(t), [["POST /api/v1/broadcasts", `plan:${PLAN}:4`]]);
  assert.deepEqual(t.sent[0].body.template_id, V(1));
  assert.deepEqual(t.sent[0].body.audience, { kind: "saved", id: L1 });
  assert.equal(r.receipt, C.PROPOSAL_SPECS.broadcast.receipt(listed, ANSWERS["POST /api/v1/broadcasts"]));
  assert.deepEqual(listed.payload.template_id, "@step:1", "the card itself is left as it was");
});

test("a send whose step was undone is refused in words and sends nothing: never a send to a message that is gone", async () => {
  const t = tab();
  assert.deepEqual(await commitProposal(t.win, send, t.client, { nowMs: NOW, made: { 1: { undone: true } } }), {
    ok: false,
    message: C.PROPOSAL_WORDS.planUndone,
  });
  // A silent step naming an undone one stops the run with the same words.
  const named = stamped("playbook_change", 2, { playbook_id: C.stepToken(1), state: "paused" });
  const run = await commit.commitPlan(t.win, [named], { 1: { undone: true } }, { client: t.client, nowMs: NOW });
  assert.equal(run.stoppedAt, 2);
  assert.equal(run.results[0].result.message, C.PROPOSAL_WORDS.planStopped(2, C.PROPOSAL_WORDS.planUndone));
  assert.deepEqual(t.sent, []);
});

test("a card of no plan keeps its own key and its payload as written, tokens and all", async () => {
  const bare = { ...send, plan: undefined, id: "p-9" };
  const t = tab();
  const r = await commitProposal(t.win, bare, t.client, { nowMs: NOW, made: { 1: { kind: "message", id: V(1) } } });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(keys(t), [["POST /api/v1/broadcasts", "p-9"]]);
  assert.equal(t.sent[0].body.template_id, "@step:1", "only a plan's card is filled; the route judges the rest");
});
