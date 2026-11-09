/**
 * The freedom check (contracts freedomOf, D17 and D33 of the answers canvas): what may run with no press, asked the same way every
 * time. Run as it is, over worlds written here. The two that matter most: nothing runs while the switch is off, and a turn that
 * read a stranger's words never runs anything but a record, whatever the member's rows say.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_ALONE_DAY_MAX, ASK_KIND_TRAITS, askPressOf, freedomOf } from "@chanlytics/contracts";

const world = (over = {}) => ({
  may: true,
  rows: { reply: "auto", campaign: "veto", reviews: "ask" },
  alone: true,
  stopped: false,
  open: true,
  aloneToday: 0,
  undosThisWeek: 0,
  moved: false,
  takesBack: true,
  newWords: false,
  count: null,
  ...over,
});
const asked = { by: "asked", strangers: false };
const card = (kind, over = {}) => ({ kind, payload: {}, origin: asked, ...over });

test("nothing runs while the switch is off: the owner has not chosen, so every card waits for its press", () => {
  for (const kind of ["reply", "note", "person_message"]) {
    const v = freedomOf(card(kind), world({ alone: false }));
    assert.equal(v.answer, "ask", kind);
    assert.equal(v.why, "switch_off", kind);
  }
});

test("a record runs when the switch is on, a reply follows its row, and every answer says why", () => {
  assert.deepEqual(freedomOf(card("note"), world()), { answer: "run", why: "keep", row: null });
  assert.deepEqual(freedomOf(card("reply"), world()), { answer: "run", why: "row_auto", row: "reply" });
  assert.deepEqual(freedomOf(card("reply"), world({ rows: { reply: "veto" } })), {
    answer: "hold",
    why: "row_veto",
    row: "reply",
  });
  assert.deepEqual(freedomOf(card("reply"), world({ rows: { reply: "ask" } })), {
    answer: "ask",
    why: "row_ask",
    row: "reply",
  });
  assert.deepEqual(freedomOf(card("reply"), world({ rows: { reply: "never" } })), {
    answer: "no",
    why: "row_never",
    row: "reply",
  });
  assert.equal(freedomOf(card("reply"), world({ rows: {} })).why, "row_ask", "a row it has none of asks");
});

test("what is locked always waits: money, consent, cold email, a search, settings, the team, anything final", () => {
  for (const kind of [
    "reach_out_make",
    "lead_search",
    "people_search",
    "leads_check",
    "settings",
    "policy",
    "invite",
    "answer",
    "person_merge",
    "list_delete",
    "sequence_end",
    "broadcast",
  ]) {
    const v = freedomOf(card(kind), world());
    assert.equal(v.answer, "ask", kind);
    assert.equal(v.why, "locked", kind);
  }
});

test("D33: only the member's own words may run alone; the model's idea and a follow-up wait, and no stamp at all waits", () => {
  assert.equal(freedomOf(card("reply", { origin: { by: "idea", strangers: false } }), world()).why, "idea");
  assert.equal(freedomOf(card("reply", { origin: { by: "follow_up", strangers: false } }), world()).why, "follow_up");
  assert.equal(freedomOf(card("reply", { origin: undefined }), world()).why, "idea", "a card made before the stamp");
});

test("D33: a turn that read a stranger's words runs a record and nothing else, whatever the rows say", () => {
  const strangers = { by: "asked", strangers: true };
  assert.equal(freedomOf(card("reply", { origin: strangers }), world()).why, "strangers");
  assert.equal(freedomOf(card("person_message", { origin: strangers }), world()).why, "strangers");
  assert.equal(freedomOf(card("note", { origin: strangers }), world()).answer, "run", "a note is only a record");
});

test("a stop and a live call go at once, whatever else is true, Stop everything among it", () => {
  for (const kind of ["whisper", "call_hand_over", "review_reply_stop", "sequence_leave"]) {
    assert.equal(freedomOf(card(kind), world({ alone: false, stopped: true, open: false })).answer, "run", kind);
  }
});

test("Stop everything holds everything else, and a role that may not press it is told no", () => {
  assert.equal(freedomOf(card("reply"), world({ stopped: true })).why, "stopped");
  assert.equal(freedomOf(card("note"), world({ stopped: true })).why, "stopped");
  assert.deepEqual(freedomOf(card("note"), world({ may: false })), { answer: "no", why: "role", row: null });
});

test("new words wait for a person once, however the row is set", () => {
  assert.equal(freedomOf(card("reply"), world({ newWords: true })).why, "new_words");
});

test("many people: a record over too many, or an unknown number, asks", () => {
  assert.equal(freedomOf(card("note_many"), world({ count: 5 })).answer, "run");
  assert.equal(freedomOf(card("note_many"), world({ count: 26 })).why, "many");
  assert.equal(freedomOf(card("leads_bulk"), world({ count: null })).why, "many");
});

test("is now a good time, and can it be taken back", () => {
  assert.equal(freedomOf(card("reply"), world({ open: false })).why, "closed");
  assert.equal(freedomOf(card("note"), world({ open: false })).answer, "run", "a record is no bother at night");
  assert.equal(freedomOf(card("reply"), world({ aloneToday: ASK_ALONE_DAY_MAX })).why, "day_limit");
  assert.equal(freedomOf(card("reply"), world({ undosThisWeek: 2 })).why, "undos");
  assert.equal(freedomOf(card("reply"), world({ moved: true })).why, "moved");
  assert.equal(freedomOf(card("reply"), world({ takesBack: false })).why, "no_way_back");
});

test("a sequence's own class is its row", () => {
  const p = card("playbook", { payload: { policy_class: "campaign" } });
  assert.deepEqual(freedomOf(p, world()), { answer: "hold", why: "row_veto", row: "campaign" });
});

test("every kind has its row in the one table, and a press that says what it does", () => {
  for (const [kind, traits] of Object.entries(ASK_KIND_TRAITS)) {
    assert.ok(traits.shape && traits.reach && traits.alone && traits.press, kind);
    assert.equal(typeof askPressOf({ kind, payload: {} }), "string", kind);
  }
  assert.equal(Object.keys(ASK_KIND_TRAITS).length, 72);
  assert.equal(askPressOf({ kind: "playbook_change", payload: { state: "paused" } }), "pause");
  assert.equal(askPressOf({ kind: "run", payload: { verb: "skip" } }), "skip");
  assert.equal(askPressOf({ kind: "booking_request", payload: { booked: false } }), "cant");
  assert.equal(askPressOf({ kind: "thread_verb", payload: { verb: "snooze" } }), "snooze");
});
