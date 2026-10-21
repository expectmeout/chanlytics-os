/**
 * The Sequences page's verbs (decision 0060, contracts ask-proposals/sequences.ts), executed through the one table every
 * sheet and card commits by (verbSpec): each makes the call its door takes, says its receipt from the door's answer, and
 * keeps an undo that is the door's own way back, or none where nothing comes back (a step taken away, a draft let go).
 * What a step's verb sends is what its door takes: the route's own body (server/sequences/bodies.ts) parses it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HAND_WORDS_MAX, SEQUENCE_FLOW_WORDS, verbSpec } from "@chanlytics/contracts";

const { NEW_STEP_BODY, STEP_CHANGE_BODY } = await import("../../../../apps/dashboard/src/server/sequences/bodies.ts");

const TAB = { settings: null };
const SEQ = "11111111-1111-4111-8111-111111111111";
const STEP = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const card = (kind, payload) => ({
  kind,
  card: { id: "", kind, payload, step: null, summary: "" },
  spec: verbSpec(kind),
});
const commit = (kind, payload) => {
  const c = card(kind, payload);
  return c.spec.commit(c.card, TAB);
};
/** What a door's body refuses, each issue's words; none where it takes it. */
const refusedBy = (body, sent) => {
  const r = body.safeParse(sent);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

test("a step after the last is added, a step changed, and each undo is the door's way back", () => {
  const s = verbSpec("sequence_step");
  assert.deepEqual(
    commit("sequence_step", { sequence_id: SEQ, template_id: MSG, after_days: 3, only_if: ["no_reply"] }),
    {
      route: "POST sequences/[id]/steps",
      params: { id: SEQ },
      body: { after_days: 3, only_if: ["no_reply"], template_id: MSG },
    },
  );
  assert.deepEqual(commit("sequence_step", { sequence_id: SEQ, step_id: STEP, after_days: 5 }), {
    route: "PUT sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
    body: { after_days: 5 },
  });
  assert.deepEqual(commit("sequence_step", { sequence_id: SEQ }), { refused: SEQUENCE_FLOW_WORDS.sayWhatStepDoes });
  const added = card("sequence_step", { sequence_id: SEQ, template_id: MSG, after_days: 3 }).card;
  assert.equal(s.receipt(added, { place: 2 }), "Step 2 added");
  const kept = s.undo.record(added, { id: STEP, decision_id: "d1" }, TAB);
  assert.deepEqual(s.undo.call(kept, TAB), {
    route: "DELETE sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
  });
  const changed = card("sequence_step", { sequence_id: SEQ, step_id: STEP, after_days: 5 }).card;
  const back = s.undo.record(changed, { id: STEP, was: { after_days: 3, only_if: [] }, decision_id: "d2" }, TAB);
  assert.deepEqual(s.undo.call(back, TAB).body, { after_days: 3, only_if: [] });
});

test("a call or a note for the team is a step too (decision 0065 step 6): added with its words and no message, changed, and put back as it was", () => {
  const s = verbSpec("sequence_step");
  const call = { kind: "call", words: "Ask how the cut held up" };
  // Added at the end: its words in place of a message, so no template rides with it.
  const added = commit("sequence_step", {
    sequence_id: SEQ,
    after_days: 3,
    only_if: ["no_booking"],
    hand: { kind: "call", words: "  Ask how the cut held up " },
  });
  assert.deepEqual(added, {
    route: "POST sequences/[id]/steps",
    params: { id: SEQ },
    body: { after_days: 3, only_if: ["no_booking"], hand: call },
  });
  assert.equal("template_id" in added.body, false);
  assert.deepEqual(refusedBy(NEW_STEP_BODY, added.body), [], "the add door takes it");
  // Neither a message nor what to do: refused before it is sent, in the step's own words.
  for (const hand of [undefined, null, { kind: "call", words: "  " }, { kind: "visit", words: "Come in" }])
    assert.deepEqual(commit("sequence_step", { sequence_id: SEQ, after_days: 3, hand }), {
      refused: SEQUENCE_FLOW_WORDS.sayWhatStepDoes,
    });
  // Changed: a note's words, alone where nothing else changed.
  const note = { kind: "note", words: "Send the aftercare sheet" };
  const change = commit("sequence_step", { sequence_id: SEQ, step_id: STEP, hand: note });
  assert.deepEqual(change, {
    route: "PUT sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
    body: { hand: note },
  });
  assert.deepEqual(refusedBy(STEP_CHANGE_BODY, change.body), []);
  // A call's change undone: its words as they were, and never a message's values, nor the channels 00465's `was` names
  // (the first step's), which the door refuses on a call.
  const changed = card("sequence_step", { sequence_id: SEQ, step_id: STEP, hand: note }).card;
  const wasCall = s.undo.record(
    changed,
    {
      id: STEP,
      was: { after_days: 3, only_if: ["no_booking"], channels: ["whatsapp"], name: "Win back", hand: call, params: [] },
      decision_id: "d7",
    },
    TAB,
  );
  const back = s.undo.call(wasCall, TAB);
  assert.deepEqual(back.body, { after_days: 3, only_if: ["no_booking"], name: "Win back", hand: call });
  assert.equal("params" in back.body, false);
  assert.deepEqual(refusedBy(STEP_CHANGE_BODY, back.body), [], "the change door takes the way back");
  // A message's change undone: its values as they were, and no hand of null for the door to refuse.
  const message = card("sequence_step", { sequence_id: SEQ, step_id: STEP, after_days: 5 }).card;
  const wasMessage = s.undo.record(
    message,
    { id: STEP, was: { after_days: 3, only_if: [], hand: null, params: [{ kind: "first_name" }] }, decision_id: "d8" },
    TAB,
  );
  const put = s.undo.call(wasMessage, TAB);
  assert.deepEqual(put.body, { after_days: 3, only_if: [], params: [{ kind: "first_name" }] });
  assert.equal("hand" in put.body, false);
  assert.deepEqual(refusedBy(STEP_CHANGE_BODY, put.body), []);
});

test("the step doors take a message or a call or a note, exactly one, and a call or a note with no message's values or channels", () => {
  const call = { kind: "call", words: "Ask how the cut held up" };
  const add = (body) => refusedBy(NEW_STEP_BODY, { after_days: 3, ...body });
  assert.deepEqual(add({ template_id: MSG, params: ["@first_name"], channels: ["whatsapp"] }), []);
  assert.deepEqual(add({ hand: call, only_if: ["no_booking"] }), []);
  assert.deepEqual(NEW_STEP_BODY.parse({ after_days: 3, hand: { ...call, words: ` ${call.words} ` } }).hand, call);
  // Both, or neither: the step verb's own refusal.
  assert.deepEqual(add({ template_id: MSG, hand: call }), [SEQUENCE_FLOW_WORDS.sayWhatStepDoes]);
  assert.deepEqual(add({}), [SEQUENCE_FLOW_WORDS.sayWhatStepDoes]);
  // A call has no message to fill or carry.
  assert.deepEqual(add({ hand: call, params: [] }), [SEQUENCE_FLOW_WORDS.valuesOnHand]);
  assert.deepEqual(add({ hand: call, channels: ["email"] }), [SEQUENCE_FLOW_WORDS.valuesOnHand]);
  // Its words are 1 to HAND_WORDS_MAX characters, as the database holds them, and it is a call or a note.
  const words = (w) => add({ hand: { kind: "note", words: w } });
  assert.deepEqual(words("x".repeat(HAND_WORDS_MAX)), []);
  for (const w of ["", "   ", "x".repeat(HAND_WORDS_MAX + 1)]) assert.notDeepEqual(words(w), [], `“${w.slice(0, 9)}…”`);
  for (const hand of [{ kind: "visit", words: "Come in" }, { kind: "call" }, { ...call, when: "today" }])
    assert.notDeepEqual(add({ hand }), [], JSON.stringify(hand));
  // A change may name a call's words, and must name something.
  assert.deepEqual(refusedBy(STEP_CHANGE_BODY, { hand: call }), []);
  assert.notDeepEqual(refusedBy(STEP_CHANGE_BODY, {}), [], "nothing named, nothing to change");
  assert.notDeepEqual(refusedBy(STEP_CHANGE_BODY, { hand: null }), [], "a hand of null is no change the door takes");
  assert.notDeepEqual(refusedBy(STEP_CHANGE_BODY, { hand: { kind: "call", words: "" } }), []);
});

test("a step taken away and people taken out say what the door did, and keep no undo", () => {
  assert.deepEqual(commit("sequence_step_remove", { sequence_id: SEQ, step_id: STEP }), {
    route: "DELETE sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
  });
  assert.equal(verbSpec("sequence_step_remove").receipt(null, { removed: 2 }), "2 steps taken away");
  assert.equal(verbSpec("sequence_step_remove").undo, undefined);
  assert.deepEqual(commit("sequence_leave", { sequence_id: SEQ, enrollment_ids: ["e1", 7, "e2"] }), {
    route: "POST sequences/[id]/leave",
    params: { id: SEQ },
    body: { enrollment_ids: ["e1", "e2"] },
  });
  assert.equal(verbSpec("sequence_leave").receipt({ payload: {} }, { left: 0 }), "Nobody was still in it");
  // A lead on its list that nothing has been planned for yet comes off it through the same door (00455).
  assert.deepEqual(commit("sequence_leave", { sequence_id: SEQ, lead_ids: ["l1", null] }), {
    route: "POST sequences/[id]/leave",
    params: { id: SEQ },
    body: { enrollment_ids: [], lead_ids: ["l1"] },
  });
  assert.equal(verbSpec("sequence_leave").receipt({ payload: { lead_ids: ["l1"] } }, { left: 1 }), "1 lead taken out");
  assert.equal(
    verbSpec("sequence_leave").receipt({ payload: { enrollment_ids: ["e1", "e2"] } }, { left: 2 }),
    "2 people taken out",
  );
  assert.ok("refused" in commit("sequence_leave", { sequence_id: SEQ }), "nobody named is no leave");
});

test("a leave's undo puts them back through its own door, and says what stays out (00450)", () => {
  const u = verbSpec("sequence_leave").undo;
  const c = card("sequence_leave", { sequence_id: SEQ, enrollment_ids: ["e1"] }).card;
  assert.equal(u.label(c), "Put them back");
  const kept = u.record(c, { left: 2, sequence_id: SEQ, decision_id: "d9" }, TAB);
  assert.deepEqual(kept, { sequence_id: SEQ, decision_id: "d9" });
  assert.deepEqual(u.call(kept, TAB), { route: "POST sequences/[id]/return", params: { id: SEQ } });
  assert.equal(u.record(c, { left: 0, sequence_id: SEQ, decision_id: "d9" }, TAB), null, "nobody left: no undo");
  assert.equal(u.receipt({ back: 2, sends_out: 0 }, kept), "2 people put back");
  assert.equal(u.receipt({ back: 1, sends_out: 1 }, kept), "1 person put back · 1 email left out stays out");
  assert.match(u.receipt({ back: 0, sends_out: 0 }, kept), /Nobody could be put back/);
});

test("a step's new words say whether they wait for WhatsApp, and the undo gives back the words it had", () => {
  const s = verbSpec("sequence_words");
  const c = card("sequence_words", {
    sequence_id: SEQ,
    step_id: STEP,
    template_id: MSG,
    params: [{ kind: "first_name" }],
  });
  assert.deepEqual(s.commit(c.card, TAB).body, { template_id: MSG, params: [{ kind: "first_name" }] });
  assert.match(s.receipt(c.card, { waits: true }), /wait for WhatsApp/);
  const kept = s.undo.record(c.card, { was: { template_id: "old", params: [] }, decision_id: "d3" }, TAB);
  assert.deepEqual(s.undo.call(kept, TAB).body, { template_id: "old", params: [] });
});

test("a draft is asked for, never made; keeping it makes the sequence whole, and its undo takes it away again", () => {
  assert.deepEqual(commit("sequence_draft", { words: "Thank them", previous: { name: "Win-back", steps: 2 } }), {
    route: "POST sequences/draft",
    body: { words: "Thank them", previous: { name: "Win-back", steps: 2 } },
  });
  assert.deepEqual(commit("sequence_draft", { words: "" }), { refused: "Say what it should do." });
  // The choices already made, which Ask keeps (decision 0065): the kind, the audience and who; nothing else rides.
  const who = { kind: "list", token: "seg:clients", label: "Clients" };
  assert.deepEqual(commit("sequence_draft", { words: "Tell them", kind: "once", audience: "people", who, list: who }), {
    route: "POST sequences/draft",
    body: { words: "Tell them", kind: "once", audience: "people", who },
  });

  // New's draft is made through its one door, whole; one with no step is refused before it is sent.
  const made = verbSpec("sequence_new");
  const body = {
    kind: "once",
    audience: "people",
    name: "Spring offer",
    who,
    steps: [{ does: "message" }],
    start: true,
  };
  assert.deepEqual(made.commit(card("sequence_new", body).card, TAB), { route: "POST sequences/new", body });
  assert.deepEqual(commit("sequence_new", { ...body, steps: [] }), { refused: "Add a step." });
  assert.equal(
    made.receipt(card("sequence_new", body).card, { made: SEQ, state: "on" }),
    "“Spring offer” is on its way",
  );
  assert.equal(
    made.receipt(card("sequence_new", { ...body, start: false }).card, { made: SEQ, state: "draft" }),
    "“Spring offer” is a draft: nothing goes yet",
  );
  assert.equal(made.made(card("sequence_new", body).card, { made: SEQ }), SEQ);
  assert.equal(verbSpec("sequence_draft").undo, undefined);

  const make = verbSpec("sequence_make");
  const first = { name: "Welcome", trigger: "visited", template_id: MSG, params: [], run_hour: 10 };
  const then = [{ after_days: 28, only_if: ["no_booking"], template_id: MSG, params: [] }];
  const c = card("sequence_make", { first, then, start: false });
  assert.deepEqual(make.commit(c.card, TAB), { route: "POST sequences", body: { first, then, start: false } });
  assert.deepEqual(commit("sequence_make", { first: { trigger: "visited" } }), {
    refused: "Say what starts it and the message it sends first.",
  });
  assert.equal(make.receipt(c.card, { id: SEQ, state: "draft" }), "Kept as a draft: nothing goes yet");
  assert.equal(make.receipt(c.card, { id: SEQ, state: "on" }), "The sequence is on");
  assert.equal(make.made(c.card, { id: SEQ }), SEQ);
  assert.equal(
    make.open(c.card, { state: "done", receipt: "", atMs: 0, made: { kind: "sequence_make", id: SEQ } }),
    `campaigns/sequences/${SEQ}`,
  );
  const kept = make.undo.record(c.card, { id: SEQ, decision_id: "d4" }, TAB);
  assert.deepEqual(make.undo.call(kept, TAB), { route: "DELETE sequences/[id]", params: { id: SEQ } });
});

test("a draft is started through the campaign's own door, paused as its undo, and let go with no way back", () => {
  const start = verbSpec("sequence_start");
  const c = card("sequence_start", { sequence_id: SEQ, name: "Welcome" });
  assert.deepEqual(start.commit(c.card, TAB), {
    route: "PUT playbooks/[id]",
    params: { id: SEQ },
    body: { state: "running" },
  });
  assert.equal(start.receipt(c.card, {}), "“Welcome” is on");
  const kept = start.undo.record(c.card, { decision_id: "d5" }, TAB);
  assert.deepEqual(start.undo.call(kept, TAB).body, { state: "paused" });
  assert.deepEqual(commit("sequence_discard", { sequence_id: SEQ }), {
    route: "DELETE sequences/[id]",
    params: { id: SEQ },
  });
  assert.equal(verbSpec("sequence_discard").undo, undefined);
  assert.equal(verbSpec("sequence_discard").open({ payload: {} }, null), "campaigns/sequences");
});

test("an email the check held is decided, and one handed over said of, through one verb each, whichever page presses", () => {
  const SEND = "44444444-4444-4444-8444-444444444444";
  assert.deepEqual(commit("sequence_send_decide", { send_id: SEND, decision: "include", name: "Bloom Bar" }), {
    route: "POST reach-out-sends/[id]/decide",
    params: { id: SEND },
    body: { decision: "include" },
  });
  // A door the held do not have, or no email, is never sent.
  assert.ok("refused" in commit("sequence_send_decide", { send_id: SEND, decision: "send_twice" }));
  assert.ok("refused" in commit("sequence_send_decide", { decision: "skip" }));
  const decide = verbSpec("sequence_send_decide");
  const said = (decision) =>
    decide.receipt(card("sequence_send_decide", { send_id: SEND, decision, name: "Bloom Bar" }).card, {});
  assert.deepEqual(["include", "rewrite", "skip", "not_a_fit"].map(said), [
    "Bloom Bar's email goes as written",
    "Bloom Bar's opening is written again",
    "Bloom Bar is left out of this batch",
    "Bloom Bar is set aside: not a fit",
  ]);
  assert.equal(decide.undo, undefined, "an email let go may be on its way: nothing to undo");
  // Open is the run that holds the email, its sheet in Sent.
  assert.equal(
    decide.open({ payload: { send_id: SEND, run_id: SEQ } }, null),
    `campaigns/sequences/${SEQ}/runs/${SEQ}`,
  );
  assert.equal(decide.open({ payload: { send_id: SEND } }, null), null);

  assert.deepEqual(commit("sequence_send_said", { send_id: SEND, outcome: "sent", name: "Bloom Bar" }), {
    route: "POST reach-out-sends/[id]/said",
    params: { id: SEND },
    body: { outcome: "sent" },
  });
  assert.ok("refused" in commit("sequence_send_said", { send_id: SEND, outcome: "maybe" }));
  const sent = verbSpec("sequence_send_said");
  const c = card("sequence_send_said", { send_id: SEND, outcome: "sent", name: "Bloom Bar" }).card;
  // The receipt is the To send list's own sentence (contracts toSendSaidWords), from what the door answered.
  assert.match(sent.receipt(c, { said: true, state: "sent", since: null }), /Bloom Bar/);
  assert.notEqual(
    sent.receipt(c, { said: true, state: "sent", since: null }),
    sent.receipt(c, { said: false, state: "sent" }),
    "a second word says how it already stands",
  );
});

test("Run now runs the first step through the campaign's own door, says what came of it, and cancels a run that sends", () => {
  const RUN = "55555555-5555-4555-8555-555555555555";
  assert.deepEqual(commit("playbook_run", { playbook_id: SEQ, name: "Welcome" }), {
    route: "POST playbooks/[id]/run",
    params: { id: SEQ },
  });
  assert.ok("refused" in commit("playbook_run", { name: "Welcome" }), "no campaign named, nothing runs");
  const run = verbSpec("playbook_run");
  const c = card("playbook_run", { playbook_id: SEQ, name: "Welcome", timezone: "America/New_York" }).card;
  const at = "2026-10-15T15:00:00Z";
  assert.match(
    run.receipt(c, { outcome: "sent", eligible: 12, broadcast_id: RUN, scheduled_for: at, moved_from: null }),
    /^Welcome — 12 people, /,
  );
  assert.equal(run.receipt(c, { outcome: "held", eligible: 1 }), "Welcome — 1 person waiting for your approval");
  assert.equal(run.receipt(c, { outcome: "empty", eligible: 0 }), "Welcome — nobody new to send to right now");
  // A run that sends is canceled as an approved one is; one that waits, or found nobody, keeps no undo.
  const kept = run.undo.record(c, { outcome: "sent", broadcast_id: RUN, decision_id: "d6" }, TAB);
  assert.deepEqual(run.undo.call(kept, TAB), { route: "POST broadcasts/[id]/cancel", params: { id: RUN } });
  assert.equal(run.undo.record(c, { outcome: "held", broadcast_id: RUN }, TAB), null);
  assert.equal(run.undo.record(c, { outcome: "empty" }, TAB), null);
});

test("Send me a test mails the step's message to whoever pressed it: the door's call, its receipt naming the address, no undo", () => {
  assert.deepEqual(commit("sequence_test", { sequence_id: SEQ, step_id: STEP }), {
    route: "POST sequences/[id]/steps/[step]/test",
    params: { id: SEQ, step: STEP },
  });
  assert.ok("refused" in commit("sequence_test", { sequence_id: SEQ }), "no step named, nothing is mailed");
  const t = verbSpec("sequence_test");
  assert.equal(t.receipt(null, { to: "ada@example.com" }), "Test sent to ada@example.com");
  assert.equal(t.undo, undefined, "nothing reached a customer and nothing was kept");
  assert.equal(t.open({ payload: { sequence_id: SEQ } }, null), `campaigns/sequences/${SEQ}`);
});

test("End it ends a customer's sequence through the campaign's own door, says so, and keeps no undo: its steps are gone", () => {
  assert.deepEqual(commit("sequence_end", { sequence_id: SEQ, name: "Win-back" }), {
    route: "DELETE playbooks/[id]",
    params: { id: SEQ },
  });
  assert.ok("refused" in commit("sequence_end", {}), "no sequence named, nothing ended");
  const c = card("sequence_end", { sequence_id: SEQ, name: "Win-back" });
  assert.equal(c.spec.receipt(c.card, { deleted: true, id: SEQ }), "“Win-back” has ended");
  assert.equal(c.spec.undo, undefined);
});
