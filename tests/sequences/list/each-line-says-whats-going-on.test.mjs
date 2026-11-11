/**
 * Each sequence row says what's going on (decision 0128; the canvas "Sequences: lines that tell the truth", calls S1 to S9).
 *
 * A row's line is the first of these that is true: what waits on you and since when; a twin; a one-off's day; a paused
 * one's people; what goes next and to how many; who is in it; that every lead is through; what it sent; what starts it.
 * Never a bare zero. Needs you lists the longest wait first, whatever Sort says; the groups and Type share one set of
 * names; a search also finds a sequence by its lead search or list. Ask reads the same line.
 *
 * Run on rows as GET sequences answers them, in New York on Wednesday 11 Nov 2026 at 3:00 PM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEQUENCE_LIST_WORDS,
  SEQUENCE_WORDS,
  byLongestWait,
  needsWords,
  sequenceGroupOf,
  sequenceMatches,
  sequenceRowLine,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-11-11T20:00:00Z");
const CLOCK = { tz: TZ, nowMs: NOW };
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const FIRST = {
  id: "seq",
  kind: "moment",
  trigger: "proposal_waiting",
  state: "running",
  policy_class: "deal",
  run_hour: 9,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  source_search_id: null,
  source_name: null,
  owner_sends: false,
  until: null,
  words_ok_at: null,
  template_name: "proposal_follow_up",
  template_language: "en_US",
};
const row = (over = {}) => ({
  id: "seq",
  name: "Proposal follow-up",
  starts: "moment",
  state: "on",
  mode: "veto",
  created_at: "2026-11-03T14:03:51Z",
  first: FIRST,
  date: null,
  steps: 2,
  unwritten: 0,
  channels: ["email"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 0,
  ...over,
});
const lead = (over = {}) =>
  row({ starts: "leads", first: { ...FIRST, kind: "reach_out", trigger: "lead_first" }, ...over });
const batch = (over = {}) => ({
  id: "b1",
  step_id: "step-2",
  run_for: null,
  at: "2026-11-08T18:05:01Z",
  people: 2,
  audience: { kind: "reach_out", trigger: null },
  ...over,
});
const line = (r, twin = null) => sequenceRowLine(r, { tz: TZ, nowMs: NOW, word: "meeting", twin });

test("what waits on you says what it is and since when", () => {
  const followUps = lead({
    needs: { ...NONE, waiting: 1, waiting_people: 2, oldest_at: "2026-11-08T18:05:03Z", batches: [batch()] },
  });
  assert.equal(line(followUps), "2 follow-ups wait for your OK · since Sun");
  const firsts = lead({
    needs: {
      ...NONE,
      waiting: 1,
      waiting_people: 12,
      oldest_at: "2026-11-09T14:00:00Z",
      batches: [batch({ step_id: "seq", people: 12 })],
    },
  });
  assert.equal(line(firsts), "12 first emails wait for your OK · since Mon");
  const held = lead({ needs: { ...NONE, held: 1, oldest_at: "2026-10-30T21:05:03Z" } });
  assert.equal(line(held), "1 email held for your look · since Oct 30", "REGRESSION: it said “1 held”");
  assert.equal(
    line(lead({ needs: { ...NONE, to_send: 3, oldest_at: "2026-11-11T14:05:00Z" } })),
    "3 emails for you to send · since 9:05 AM",
  );
  assert.equal(
    line(lead({ needs: { ...NONE, to_send: 1, oldest_at: "2026-11-10T15:00:00Z" } })),
    "1 email for you to send · since yesterday",
  );
  assert.equal(
    line(lead({ needs: { ...NONE, replies: 2, oldest_at: "2026-11-09T14:00:00Z" } })),
    "2 wrote back · answer them",
  );
});

test("a customer's batch says until tonight, when it lapses, and counts people", () => {
  const r = row({
    needs: {
      ...NONE,
      waiting: 1,
      waiting_people: 14,
      oldest_at: "2026-11-11T14:00:00Z",
      batches: [batch({ step_id: "seq", people: 14, audience: { kind: "playbook", trigger: "quiet_30" } })],
    },
  });
  assert.equal(line(r), "14 people wait for your OK · until tonight");
});

test("two kinds at once keep today's short words, with no date; a batch naming nobody yet is the batch", () => {
  // A customer's sequence: an OK to a cold email's batch whose every email is held would send nothing, and is said as held.
  const both = { ...NONE, waiting: 1, held: 2, replies: 1, oldest_at: "2026-11-08T18:05:03Z" };
  assert.equal(needsWords(row({ needs: both }), CLOCK), "waits for your OK · 2 held · 1 wrote back · answer them");
  const allHeld = { ...NONE, waiting: 1, held: 7, batches: [batch({ people: 0 })] };
  assert.equal(needsWords(lead({ needs: allHeld }), CLOCK), "7 emails held for your look");
  const planning = { ...NONE, waiting: 1, batches: [batch({ people: 0 })] };
  assert.equal(needsWords(lead({ needs: planning }), CLOCK), "The next batch waits for your OK");
  assert.equal(needsWords(row(), CLOCK), "", "nothing needs you: no words");
});

test("what goes next says when and to how many; a time already come is going out now", () => {
  assert.equal(
    line(row({ next: { id: "n", at: "2026-11-12T14:00:00Z", people: 6, state: "scheduled", place: 1 } })),
    "Next tomorrow 9:00 AM · 6 people",
  );
  assert.equal(
    line(lead({ next: { id: "n", at: "2026-11-11T19:00:00Z", people: 18, state: "sending", place: 1 } })),
    "Going out now · 18 people",
  );
  assert.equal(
    line(row({ first: { ...FIRST, trigger: "visit_soon" }, coming: { at: "2026-11-13T15:00:00Z", people: 3 } })),
    "Next Fri 10:00 AM · 3 people",
  );
  assert.equal(
    line(row({ next: { id: "n", at: "2026-11-12T14:00:00Z", people: 0, state: "scheduled", place: 1 } })),
    "Next tomorrow 9:00 AM",
  );
});

test("never a bare zero: a cold email with every lead through says so, and what it waits for", () => {
  const through = { id: "l", at: "2026-11-06T17:56:00Z", sent: 0, replied: 0 };
  assert.equal(
    line(
      lead({ last: through, first: { ...FIRST, kind: "reach_out", trigger: "lead_first", source_search_id: "srch" } }),
    ),
    "All leads through · waits for new ones",
    "REGRESSION: it said “Nov 6 · 0 sent · 0 replied”",
  );
  assert.equal(line(lead({ last: { ...through, sent: 7 } })), "All leads through · add more");
  assert.equal(line(lead()), "No leads yet · add some");
  assert.equal(line(lead({ in_it: 3 })), "3 in it");
  assert.equal(
    line(row({ last: { id: "l", at: "2026-10-30T14:00:00Z", sent: 40, replied: 6 } })),
    "Oct 30 · 40 sent · 6 replied",
  );
  assert.equal(
    line(row({ last: { id: "l", at: "2026-10-30T14:00:00Z", sent: 0, replied: 0 } })),
    "Starts when a proposal waits",
  );
});

test("nobody yet says what starts it, in the business's own word", () => {
  assert.equal(line(row()), "Starts when a proposal waits", "REGRESSION: it said “Nobody yet”");
  assert.equal(line(row({ first: { ...FIRST, trigger: "visit_tomorrow" } })), "Sends the day before each meeting");
  assert.equal(line(row({ first: { ...FIRST, trigger: "visited" } })), "Sends after each meeting you mark kept");
  assert.equal(
    line(row({ starts: "list", first: { ...FIRST, trigger: "list", list_name: "Regulars" } })),
    "Starts when someone joins Regulars",
  );
  assert.equal(
    line(row({ starts: "list", first: { ...FIRST, trigger: "list" } })),
    "Starts when someone joins its list",
  );
  const moments = [
    "visit_tomorrow",
    "visit_soon",
    "visited",
    "visit_missed",
    "asked_no_booking",
    "quiet_30",
    "lapsed",
    "new_week",
    "phoned_only",
    "everyone_monthly",
    "proposal_waiting",
    "slot_opened",
  ];
  for (const trigger of moments) {
    const sentence = line(row({ first: { ...FIRST, trigger } }));
    assert.ok(
      sentence !== "Starts at its moment" && sentence.length <= 44,
      `${trigger}: its own short words, short enough for a phone row: ${sentence}`,
    );
  }
});

test("a paused one says who waits for it, or what starts it and that nobody waits", () => {
  assert.equal(line(row({ state: "paused", in_it: 3 })), "3 wait for it to turn on");
  assert.equal(line(row({ state: "paused", in_it: 1 })), "1 waits for it to turn on");
  assert.equal(
    line(row({ state: "paused", first: { ...FIRST, trigger: "visit_tomorrow" } })),
    "Before a meeting · nobody waits on it",
  );
});

test("drafts say which is which; an ended one says what it sent", () => {
  assert.equal(line(row({ state: "draft" })), "Ready to start · made Nov 3");
  assert.equal(
    line(lead({ state: "draft", unwritten: 2, created_at: "2026-11-11T18:32:19Z" })),
    "2 emails to write · made Nov 11",
  );
  assert.equal(
    line(row({ state: "draft", starts: "date", once: { who: { kind: "everyone", label: "everyone" } } })),
    "Kept as a draft · nothing goes until you send it",
  );
  assert.equal(
    line(row({ state: "ended", last: { id: "l", at: "2026-10-30T14:00:00Z", sent: 40, replied: 6 } })),
    "Oct 30 · 40 sent · 6 replied",
  );
  assert.equal(line(row({ state: "ended" })), "Sent nothing");
});

test("a one-off that failed needs you, and says when it didn't go", () => {
  const failed = row({
    starts: "date",
    date: { batch_id: "d", state: "failed", at: "2026-11-09T15:00:00Z", people: 186 },
  });
  assert.equal(sequenceGroupOf(failed), "needs");
  assert.equal(line(failed), "Didn’t go · 186 people · Mon");
  const scheduled = row({
    starts: "date",
    date: { batch_id: "d", state: "scheduled", at: "2026-11-13T15:00:00Z", people: 212 },
  });
  assert.equal(sequenceGroupOf(scheduled), "dates");
});

test("a twin still says what each person would get twice", () => {
  const reminder = row({ first: { ...FIRST, trigger: "visit_tomorrow" } });
  assert.equal(line(reminder, { id: "a", name: "Meeting reminder" }), "Two reminders go to each person");
});

test("Needs you lists the longest wait first, a row with no age after those with one; ties keep their order", () => {
  const waiting = lead({
    id: "a",
    needs: { ...NONE, waiting: 1, waiting_people: 2, oldest_at: "2026-11-08T18:05:03Z", batches: [batch()] },
  });
  const held = lead({ id: "b", needs: { ...NONE, held: 1, oldest_at: "2026-10-30T21:05:03Z" } });
  const failed = row({
    id: "c",
    starts: "date",
    date: { batch_id: "d", state: "failed", at: "2026-11-09T15:00:00Z", people: 186 },
  });
  const twin = row({ id: "t" });
  const twin2 = row({ id: "t2" });
  assert.deepEqual(
    [waiting, twin, failed, twin2, held].sort(byLongestWait).map((r) => r.id),
    ["b", "a", "c", "t", "t2"],
  );
});

test("one set of names, a Sort that says Needs you keeps its own order, and a search over the lead search and list", () => {
  assert.deepEqual(
    [SEQUENCE_WORDS.groups.customers, SEQUENCE_WORDS.groups.leads, SEQUENCE_WORDS.groups.dates],
    [SEQUENCE_LIST_WORDS.types.customers, SEQUENCE_LIST_WORDS.types.leads, SEQUENCE_LIST_WORDS.types.once],
  );
  assert.deepEqual(
    [SEQUENCE_LIST_WORDS.types.customers, SEQUENCE_LIST_WORDS.types.leads, SEQUENCE_LIST_WORDS.types.once],
    ["Your customers", "Cold email", "One-off sends"],
  );
  assert.equal(SEQUENCE_LIST_WORDS.sorts.needsFirst, "Needs you always lists the longest wait first.");
  const auto = lead({
    name: "Auto Shop Cold Outreach",
    first: { ...FIRST, search_name: "Auto shops in Queens", source_name: "Queens repair", list_name: null },
  });
  assert.equal(sequenceMatches(auto, "auto"), true);
  assert.equal(sequenceMatches(auto, "QUEENS"), true, "by the lead search, whatever the case");
  assert.equal(sequenceMatches(auto, "repair"), true, "by the search it adds from");
  assert.equal(sequenceMatches(row({ starts: "list", first: { ...FIRST, list_name: "Regulars" } }), "regul"), true);
  assert.equal(sequenceMatches(auto, "brooklyn"), false);
  assert.equal(sequenceMatches(auto, "  "), true, "no words keep every row");
});
