/**
 * A lead's row in a table (contracts leads/sheet/lead-row-status.ts, the table review of 5 Nov 2026): the one status
 * its Stage cell says and the one press it offers, case by case, in the words the sheet and the sequence already use.
 * Pure: the clock is an argument. Every name and number here is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_DOCK_WORDS,
  LEAD_LEFT_OUT_WORD,
  LEAD_REVIEW_WORD,
  formatPhoneLocal,
  leadFootOf,
  leadGroupOf,
  leadRowActOf,
  leadStatusOf,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-11-05T15:00:00Z");
const CLOCK = { tz: "America/New_York", nowMs: NOW };
const SEQ = "Local: your receptionist is built";

/** A moment so many hours before the clock, as the read says when a lead was contacted. */
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();
/** What a status says, apart from who said it. */
const wordsOf = ({ word, tone, line }) => ({ word, tone, line });

/** A lead's row, as much of it as the rules read: ready, with a checked address and a good number, unless said. */
const lead = (over = {}) => ({
  cls: "qualified",
  state: "ready",
  stageLabel: "Not contacted",
  contactedAt: null,
  waitsOn: null,
  fitLabel: "Strong fit",
  email: "hello@quix.example",
  emailState: "ok",
  phone: "+17185550142",
  phoneWrong: false,
  ...over,
});
/** Its place in a sequence, as sequence_places_of answers it. */
const place = (group, over = {}) => ({
  lead_id: "l1",
  sequence_id: "s1",
  name: SEQ,
  state: "on",
  group,
  place: 1,
  at: null,
  why: null,
  ...over,
});

test("one status: left out and review say why, a standing place is the sequence's own word, else the lead's stage", () => {
  const cases = [
    [
      lead({ cls: "excluded", fitLabel: "A chain" }),
      null,
      { word: LEAD_LEFT_OUT_WORD, tone: "plain", line: "A chain" },
    ],
    [
      lead({ cls: "review", state: "review", waitsOn: "The mailbox would not say" }),
      null,
      { word: LEAD_REVIEW_WORD, tone: "warn", line: "The mailbox would not say" },
    ],
    [lead(), place("waiting"), { word: "Waits for your OK", tone: "warn", line: `Step 1 · ${SEQ}` }],
    [
      lead(),
      place("queued", { why: "unchecked" }),
      { word: "Not planned", tone: "warn", line: `Their address couldn't be checked · ${SEQ}` },
    ],
    [lead(), place("queued"), { word: "In sequence", tone: "ok", line: `In its next batch · ${SEQ}` }],
    [lead(), place("in"), { word: "In sequence", tone: "ok", line: `Between steps · ${SEQ}` }],
    [lead({ state: "contacted", contactedAt: hoursAgo(3) }), null, { word: "Contacted", tone: "info", line: "3h ago" }],
    [lead({ state: "contacted" }), null, { word: "Contacted", tone: "info", line: null }],
    [lead({ state: "talking" }), null, { word: "Talking", tone: "ok", line: null }],
    [lead({ state: "out", stageLabel: "Said no" }), null, { word: "Said no", tone: "plain", line: null }],
    [lead(), null, { word: "Not contacted", tone: "quiet", line: null }],
  ];
  for (const [l, p, said] of cases)
    assert.deepEqual(wordsOf(leadStatusOf(l, p, CLOCK)), said, `${l.state} / ${p?.group}`);
  assert.deepEqual(
    [
      leadStatusOf(lead({ cls: "review" }), null, CLOCK).by,
      leadStatusOf(lead(), place("in"), CLOCK).by,
      leadStatusOf(lead({ state: "talking" }), null, CLOCK).by,
      leadStatusOf(lead({ state: "talking" }), place("in"), CLOCK).by,
    ],
    ["class", "place", "stage", "place"],
    "who said it: Talking is a door to its person only where the stage itself says it",
  );
});

test("REGRESSION: a row says one status, never the stage beside the place -- Not contacted stood before Not planned", () => {
  const said = leadStatusOf(lead(), place("queued", { why: "unchecked" }), CLOCK);
  assert.equal(said.word, "Not planned");
  assert.doesNotMatch(`${said.word} ${said.line}`, /Not contacted/);
});

test("a place that is over speaks only for a lead whose own stage says nothing, and wrote back is said whatever the stage", () => {
  const over = place("left", { why: "removed" });
  assert.deepEqual(wordsOf(leadStatusOf(lead({ state: "contacted", contactedAt: hoursAgo(48) }), over, CLOCK)), {
    word: "Contacted",
    tone: "info",
    line: "2d ago",
  });
  assert.equal(leadStatusOf(lead(), over, CLOCK).line, SEQ, "not contacted: where it was taken out of");
  assert.notEqual(leadStatusOf(lead(), over, CLOCK).tone, "quiet");
  assert.equal(leadStatusOf(lead({ state: "contacted" }), place("replied"), CLOCK).word, "Wrote back");
  assert.equal(
    leadStatusOf(lead({ cls: "excluded" }), place("waiting"), CLOCK).word,
    LEAD_LEFT_OUT_WORD,
    "left out first",
  );
});

test("the one press a row offers, by what the row knows", () => {
  const pick = { name: SEQ };
  const cases = [
    [lead({ cls: "excluded" }), null, pick, { kind: "put_back", label: "Put back" }],
    [lead({ cls: "review", state: "review" }), null, pick, { kind: "keep", label: "Keep" }],
    [lead(), place("waiting"), pick, { kind: "open", label: "Review" }],
    [lead(), place("held"), pick, { kind: "open", label: "Review" }],
    [lead(), place("to_send"), pick, { kind: "open", label: "Send it" }],
    [lead(), place("replied"), pick, { kind: "open", label: LEAD_DOCK_WORDS.answer }],
    [lead(), place("queued", { why: "unchecked" }), pick, { kind: "call", label: "Call" }],
    [lead({ phone: null }), place("queued", { why: "unchecked" }), pick, { kind: "open", label: "See why" }],
    [lead(), place("queued"), pick, null],
    [lead(), place("next"), pick, null],
    [lead(), place("in"), pick, null],
    [lead(), place("done"), pick, null],
    [lead(), place("left", { why: "removed" }), pick, null],
    [lead(), null, pick, { kind: "add", label: `Add to ${SEQ}` }],
    [lead(), null, null, { kind: "pick", label: "Add to a sequence" }],
    [lead({ emailState: "catch_all" }), null, pick, { kind: "add", label: `Add to ${SEQ}` }],
    [lead({ email: null, emailState: "none" }), null, pick, { kind: "call", label: "Call" }],
    [lead({ emailState: "invalid" }), null, pick, { kind: "call", label: "Call" }],
    [lead({ email: null, emailState: "none", phone: null }), null, pick, null],
    [lead({ email: null, emailState: "none", phoneWrong: true }), null, pick, null],
    [lead({ emailState: "checking" }), null, pick, null],
    [lead({ state: "contacted" }), null, pick, null],
    [lead({ state: "talking" }), null, pick, null],
    [lead({ state: "out" }), null, pick, null],
  ];
  for (const [l, p, k, act] of cases)
    assert.deepEqual(leadRowActOf(l, p, k), act, `${l.cls} ${l.state} ${l.emailState} / ${p?.group} ${p?.why ?? ""}`);
});

test("a number in a list is said as its own country writes it, and any other as it always was", () => {
  assert.equal(formatPhoneLocal("+17184199255"), "(718) 419-9255");
  assert.equal(formatPhoneLocal("+442079460958"), "+442 079 460 958");
  assert.equal(formatPhoneLocal(""), null);
  assert.equal(formatPhoneLocal(null), null);
});

test("the queue's heads: needs you and in a sequence with the view's counts, then the rest under their stage's word", () => {
  const counts = { needs: 2, in: 5, none: 20 };
  const row = (over = {}) => ({ cls: "qualified", stage: "ready", statusGroup: null, ...over });
  assert.deepEqual(leadGroupOf(row({ statusGroup: "needs" }), counts), { key: "needs", label: "Needs you", count: 2 });
  assert.deepEqual(leadGroupOf(row({ statusGroup: "in" }), counts), { key: "in", label: "In a sequence", count: 5 });
  assert.deepEqual(leadGroupOf(row(), counts), { key: "ready", label: "Not contacted", count: null });
  assert.deepEqual(leadGroupOf(row({ stage: "nurture" }), counts), { key: "nurture", label: "Contacted", count: null });
  assert.deepEqual(leadGroupOf(row({ stage: "converted" }), counts), {
    key: "converted",
    label: "Talking",
    count: null,
  });
  assert.deepEqual(leadGroupOf(row({ stage: "archived" }), counts), { key: "archived", label: "Closed", count: null });
  assert.equal(leadGroupOf(row({ statusGroup: "needs" }), null).count, null, "no count where the view's was not read");
  assert.equal(leadGroupOf(row({ cls: "review" }), counts), null, "a review's rows are not the queue's");
  assert.equal(leadGroupOf(row({ cls: "excluded" }), counts), null);
});

test("under a head that says it, a row stops repeating it: Not contacted says nothing, In sequence gives way to its step", () => {
  const at = new Date(NOW + 2 * 86_400_000).toISOString();
  const placed = (group, over = {}) => ({
    lead_id: "l1",
    sequence_id: "s1",
    name: SEQ,
    state: "running",
    group,
    place: 2,
    at,
    why: null,
    ...over,
  });
  assert.equal(leadStatusOf(lead(), null, CLOCK, true).word, "", "Not contacted: the head said it");
  const step = leadStatusOf(lead(), placed("next"), CLOCK, true);
  assert.notEqual(step.word, "In sequence");
  assert.match(step.word, /^Step 2 /, "the step and when");
  assert.equal(step.line, SEQ, "and under it the sequence");
  assert.equal(step.tone, "ok");
  assert.equal(
    leadStatusOf(lead(), placed("waiting"), CLOCK, true).word,
    "Waits for your OK",
    "what needs you says what",
  );
  const barred = placed("queued", { why: "unchecked" });
  assert.equal(leadStatusOf(lead(), barred, CLOCK, true).word, "Not planned");
  const asked = lead({ state: "contacted", contactedAt: hoursAgo(3) });
  assert.deepEqual(wordsOf(leadStatusOf(asked, null, CLOCK, true)), { word: "3h ago", tone: "quiet", line: null });
  assert.equal(leadStatusOf(lead(), placed("next"), CLOCK).word, "In sequence", "and with no head, as before");
  assert.equal(leadStatusOf(lead(), null, CLOCK).word, "Not contacted");
});

test("the foot says what the view holds, and names none it could not read", () => {
  assert.deepEqual(leadFootOf({ status_groups: { needs: 2, in: 3, none: 22 }, with_email: 23, with_phone: 25 }), [
    "2 need you",
    "23 you can email",
    "25 by phone",
  ]);
  assert.deepEqual(leadFootOf({ status_groups: { needs: 1, in: 0, none: 0 }, with_email: 1, with_phone: 0 }), [
    "1 needs you",
    "1 you can email",
    "0 by phone",
  ]);
  assert.deepEqual(
    leadFootOf({ status_groups: { needs: 0, in: 0, none: 9 }, with_email: 9, with_phone: 2 }),
    ["9 you can email", "2 by phone"],
    "nobody waiting is not said",
  );
  assert.deepEqual(leadFootOf({ view: 9, matching: 9, excluded_by: {} }), [], "a database before 00552 said none");
  assert.deepEqual(leadFootOf(null), []);
});
