/**
 * What a sequence's head offers, judged once (decision 0072, contracts sequence-acts.ts), executed on records as GET
 * sequences/:id answers them: every act against every kind of sequence and every state, each offered or not, with why
 * and the act offered in its place; and Turn on asked first, in the words a campaign's Resume asks (decision 7), from the
 * record's first step and its reach (GET sequences/:id/reach): when and to about how many, and that it sends on its own
 * where its class does. What each refusal stands on is held to its door on a replayed stack (sequence-doors.db.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIFECYCLE_WORDS,
  SEQUENCE_ACTS,
  SEQUENCE_ACT_REASONS,
  SEQUENCE_ACT_WHY,
  SEQUENCE_ACT_WORDS,
  sequenceActsOf,
  sequenceResumeAsk,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
// 9:00 AM in New York, before a 10 o'clock run.
const NOW = Date.parse("2026-10-15T13:00:00Z");
const needs = (waiting = 0) => ({
  waiting,
  waiting_people: 0,
  held: 0,
  to_send: 0,
  replies: 0,
  oldest_at: null,
  batches: [],
});
const first = (over = {}) => ({
  id: "p1",
  kind: "moment",
  trigger: "visited",
  state: "running",
  policy_class: "visit_followup",
  run_hour: 10,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  words_ok_at: "2026-09-01T10:00:00.000Z",
  template_name: null,
  template_language: null,
  ...over,
});
const row = (over = {}) => ({
  name: "Thank you",
  starts: "moment",
  mode: "ask",
  first: first(),
  needs: needs(),
  ...over,
});

const AT = { tz: TZ, nowMs: NOW };
/** A record as GET sequences/:id answers it: its row (on, by default), its chain where it writes to leads, its past. */
const rec = (over = {}, past = {}) => ({ sequence: row({ state: "on", ...over }), chain: null, ...past });
/** The paused first step a draft and a paused sequence stand on. */
const asleep = { first: first({ state: "paused" }) };
/** The acts offered, in the head's order. */
const offered = (acts) => Object.keys(acts).filter((k) => acts[k].ok);

test("every act of the head is answered, in its More's order; the reasons are declared once and used both ways, each in a person's words", () => {
  const records = [
    rec(),
    rec({}, { ran: true }),
    rec({ needs: needs(1) }),
    rec({ state: "paused", ...asleep }),
    rec({ state: "draft", ...asleep }),
    rec({ state: "ended", first: null }),
    rec({ starts: "leads" }, { wrote: true }),
    rec({ starts: "leads", state: "draft", ...asleep }, { chain: { steps: [{ n: 0, body: "" }] } }),
    rec({ starts: "date", state: "draft", first: null, once: { channel: "email" } }),
    rec({
      starts: "date",
      first: null,
      date: { batch_id: "b1", state: "scheduled", at: "2026-10-28T13:00:00Z", people: 5 },
    }),
  ];
  const said = new Set();
  for (const r of records) {
    const acts = sequenceActsOf(r, AT);
    assert.deepEqual(Object.keys(acts), [...SEQUENCE_ACTS]);
    for (const offer of Object.values(acts)) {
      if (offer.ok) continue;
      said.add(offer.because);
      if (offer.instead) assert.ok(SEQUENCE_ACTS.includes(offer.instead), offer.instead);
    }
  }
  // Every reason declared is one a record above is refused for, and every one given is declared, with its words.
  assert.deepEqual([...said].sort(), [...SEQUENCE_ACT_REASONS].sort());
  assert.deepEqual(Object.keys(SEQUENCE_ACT_WHY).sort(), [...SEQUENCE_ACT_REASONS].sort());
  for (const reason of SEQUENCE_ACT_REASONS) assert.match(SEQUENCE_ACT_WHY[reason], /^[A-Z].*\.$/, reason);
});

test("a customer's sequence: Start from a draft, Pause when on, Turn on when paused; End it once it ran, Discard while it never did, in any state", () => {
  const draft = sequenceActsOf(rec({ state: "draft", ...asleep }), AT);
  assert.deepEqual(offered(draft), ["start", "discard", "rename"]);
  // A draft never ran: it needs no read of its past to be let go of, and is never ended.
  assert.deepEqual(draft.end, { ok: false, because: "never_ran", instead: "discard" });
  assert.deepEqual(draft.turn_on, { ok: false, because: "not_paused", instead: "start" });
  assert.deepEqual(draft.pause, { ok: false, because: "not_on" });

  const ran = sequenceActsOf(rec({}, { ran: true }), AT);
  assert.deepEqual(offered(ran), ["pause", "end", "run_now", "rename"]);
  assert.deepEqual(ran.discard, { ok: false, because: "ran", instead: "end" });
  assert.deepEqual(ran.start, { ok: false, because: "not_a_draft" });

  // On and never ran (turned on a minute ago, or nobody to reach yet): Discard, which its door takes, in place of End.
  const fresh = sequenceActsOf(rec({}, { ran: false }), AT);
  assert.deepEqual(offered(fresh), ["pause", "discard", "run_now", "rename"]);
  assert.deepEqual(fresh.end, { ok: false, because: "never_ran", instead: "discard" });

  // Its past unread: nothing it might refuse is offered, and End, which goes the same either way, still is.
  const unread = sequenceActsOf(rec(), AT);
  assert.deepEqual(unread.discard, { ok: false, because: "unread" });
  assert.equal(unread.end.ok, true);

  const paused = sequenceActsOf(rec({ state: "paused", ...asleep }, { ran: true }), AT);
  assert.deepEqual(offered(paused), ["turn_on", "end", "rename"]);
  assert.deepEqual(paused.start, { ok: false, because: "not_a_draft", instead: "turn_on" });
  assert.deepEqual(paused.run_now, { ok: false, because: "not_today" });

  const ended = sequenceActsOf(rec({ state: "ended", first: null }, { ran: true }), AT);
  assert.deepEqual(offered(ended), []);
  for (const act of SEQUENCE_ACTS.slice(0, 7)) assert.deepEqual(ended[act], { ok: false, because: "ended" }, act);
  assert.deepEqual(ended.cancel_send, { ok: false, because: "not_a_one_off" });
});

test("Run now while its first step runs on the business's day, a moment's or a list's, never over a batch that waits", () => {
  assert.equal(sequenceActsOf(rec(), AT).run_now.ok, true);
  assert.equal(sequenceActsOf(rec({ starts: "list" }), AT).run_now.ok, true);
  assert.deepEqual(sequenceActsOf(rec({ first: first({ until: "2026-10-01" }) }), AT).run_now, {
    ok: false,
    because: "not_today",
  });
  assert.deepEqual(sequenceActsOf(rec({ needs: needs(1) }), AT).run_now, { ok: false, because: "batch_waiting" });
  assert.deepEqual(sequenceActsOf(rec({ starts: "leads" }), AT).run_now, { ok: false, because: "to_leads" });
});

test("a sequence to leads: Start once no email is left to write, paused never ended, let go of while it has written nothing, renamed like any", () => {
  const unwritten = { steps: [{ n: 0, subject: "Hello", body: "" }] };
  const draft = sequenceActsOf(rec({ starts: "leads", state: "draft", ...asleep }, { chain: unwritten }), AT);
  assert.deepEqual(draft.start, { ok: false, because: "email_to_write" });
  assert.deepEqual(offered(draft), ["discard", "rename"]);
  assert.equal(
    sequenceActsOf(
      rec({ starts: "leads", state: "draft", ...asleep }, { chain: { steps: [{ n: 0, body: "Hi" }] } }),
      AT,
    ).start.ok,
    true,
  );

  const on = (wrote) => sequenceActsOf(rec({ starts: "leads" }, wrote === undefined ? {} : { wrote }), AT);
  assert.deepEqual(offered(on(false)), ["pause", "discard", "rename"]);
  assert.deepEqual(on(true).discard, { ok: false, because: "wrote", instead: "pause" });
  assert.deepEqual(on(undefined).discard, { ok: false, because: "unread" });
  assert.deepEqual(on(true).end, { ok: false, because: "to_leads", instead: "pause" });
});

test("a one-off: let go of while it is kept as a draft, cancelled while it waits for its day, sent again once it went; nothing else", () => {
  const once = (over) => rec({ starts: "date", first: null, ...over });
  const kept = sequenceActsOf(once({ state: "draft", once: { channel: "email" } }), AT);
  assert.deepEqual(offered(kept), ["discard"]);
  assert.deepEqual(kept.start, { ok: false, because: "one_off" });
  assert.deepEqual(kept.send_again, { ok: false, because: "not_sent" });

  const day = (state) => ({ batch_id: "b1", state, at: "2026-10-28T13:00:00Z", people: 5 });
  assert.deepEqual(offered(sequenceActsOf(once({ date: day("scheduled") }), AT)), ["cancel_send"]);
  // Going, it would reach some of its people and not others: it is not cancelled half way.
  assert.deepEqual(sequenceActsOf(once({ date: day("sending") }), AT).cancel_send, {
    ok: false,
    because: "not_scheduled",
  });
  const went = sequenceActsOf(once({ date: day("sent"), last: { id: "b1", at: NOW, sent: 5, replied: 0 } }), AT);
  assert.deepEqual(offered(went), ["send_again"]);
  assert.deepEqual(went.discard, { ok: false, because: "one_off" });
});

test("Turn on asks when it runs next and to about how many, says a sequence that sends on its own in full, and a first batch that waits", () => {
  const W = LIFECYCLE_WORDS.ledger.resume;
  // The record as GET sequences/:id answers it, and the reach GET sequences/:id/reach answers beside it.
  const rec = (over = {}, firstOver = {}) => ({
    sequence: row({ first: first({ state: "paused", ...firstOver }), ...over }),
    last_run_for: null,
  });
  const reach = (over = {}) => ({ candidates: 14, cap_per_run: null, paused: false, ...over });
  const at = { tz: TZ, nowMs: NOW };
  const asked = sequenceResumeAsk(rec(), reach(), at);
  assert.equal(asked.question, SEQUENCE_ACT_WORDS.resumeAsk("Thank you"));
  assert.equal(asked.detail, "Next run today 10:00 AM, about 14 people");
  assert.equal(asked.yes, SEQUENCE_ACT_WORDS.resumeYes);
  assert.equal(
    sequenceResumeAsk(rec({ mode: "auto" }), reach(), at).detail,
    `Next run today 10:00 AM, about 14 people. ${W.auto}`,
  );
  // Its words new to the owner (decision 0064): its next batch waits for an OK whatever the mode, and says so.
  assert.equal(
    sequenceResumeAsk(rec({ mode: "auto" }, { words_ok_at: null }), reach(), at).detail,
    `Next run today 10:00 AM, about 14 people. ${W.asksFirst}`,
  );
  // A run sends its cap and no more: "about" counts the next run's share, as the home's rows do.
  assert.equal(
    sequenceResumeAsk(rec({}, { trigger: "quiet_30" }), reach({ cap_per_run: 5 }), at).detail,
    "Next run today 10:00 AM, about 5 people",
  );
  // It ran today: its next run is tomorrow's, from the record's last_run_for.
  assert.match(sequenceResumeAsk({ ...rec(), last_run_for: "2026-10-15" }, reach(), at).detail, /^Next run tomorrow/);
  // A moment that could not be counted says when alone, never "about 0 people".
  assert.equal(sequenceResumeAsk(rec(), reach({ candidates: null }), at).detail, "Next run today 10:00 AM");
  // A workspace paused for billing says so instead of a time, as the home's rows do.
  assert.doesNotMatch(sequenceResumeAsk(rec(), reach({ paused: true }), at).detail, /10:00 AM/);
  // Unread, or none to read: the question alone, nothing guessed.
  assert.equal(sequenceResumeAsk(rec(), undefined, at).detail, null);
  assert.equal(sequenceResumeAsk(rec(), null, at).detail, null);
  // A sequence to leads says what a reach-out's Resume says, and reads no reach.
  assert.equal(sequenceResumeAsk(rec({ starts: "leads" }), undefined, at).detail, W.chain);
});
