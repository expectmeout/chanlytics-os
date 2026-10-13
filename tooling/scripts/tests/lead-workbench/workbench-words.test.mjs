/**
 * The lead workbench's words (00423), run: where a lead stands in its reach-out, one line every page says
 * (reachOutStandingOf, and when its first email goes, reachOutWhenOf: the run and never a minute); what an add said
 * (reachOutAddWords); the pile's progress (leadPileProgressOf); a person's page reading the same line; a lead on a
 * list nothing was written to yet, under its stage on Leads (reachOutLineOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_BACK_WORDS,
  REACH_OUT_WHY_NOT,
  REACH_OUT_WHY_NOT_WORDS,
  leadPileProgressOf,
  reachOutCameWords,
  reachOutDayWords,
  toReachOutLensVM,
  reachOutAddWords,
  reachOutLineOf,
  reachOutPersonOf,
  reachOutStandingOf,
  reachOutWhenOf,
} from "@chanlytics/contracts";

const TZ = "America/Chicago";
// Tuesday 13 October 2026, 10 AM in Chicago.
const NOW = Date.parse("2026-10-13T15:00:00Z");
const story = (over = {}) => ({
  lead_id: "lead-1",
  business_name: "Iron Works",
  stage: "ready",
  closed_reason: null,
  found_at: "2026-10-01T15:00:00Z",
  email_state: "ok",
  resume_at: null,
  booked_at: null,
  stopped_at: null,
  sends: [],
  readings: [],
  conversation_id: null,
  can_stop: false,
  search: { id: "s1", name: "Gyms · Austin", asked: "gyms that open before six", fit: "strong" },
  chain: {
    root_id: "r1",
    name: "Early gyms",
    state: "running",
    fed_by: "list",
    run_hour: 9,
    last_run_for: null,
    waiting_run_id: null,
    steps: [
      { n: 0, after_days: null, hand: null },
      { n: 1, after_days: 4, hand: null },
      { n: 2, after_days: 5, hand: null },
    ],
  },
  ...over,
});
const send = (over = {}) => ({
  id: "s",
  n: 0,
  hand: null,
  state: "sent",
  reason: null,
  send_at: "2026-10-09T14:30:00Z",
  sent_at: "2026-10-09T14:31:00Z",
  angle: null,
  host: null,
  message_id: "m1",
  email_status: "delivered",
  bounced: false,
  left: true,
  ...over,
});
const reading = (over = {}) => ({
  message_id: "m9",
  read_at: "2026-10-12T15:00:00Z",
  intent: "interested",
  claim: "person",
  summary: null,
  undone: false,
  until_at: null,
  stops: true,
  convert: true,
  said_no: false,
  can_undo: false,
  ...over,
});
const line = (t, now = NOW) => reachOutStandingOf(t, now, TZ)?.line;

test("when a lead nothing was written to goes: with its reach-out's run, never at a minute", () => {
  const c = story().chain;
  const search = { ...c, fed_by: "search" };
  assert.equal(reachOutWhenOf(search, Date.parse("2026-10-13T12:00:00Z"), TZ), "goes with today's 9:00 AM run");
  assert.equal(reachOutWhenOf(search, NOW, TZ), "goes with the next run, within the hour", "today's not made yet");
  assert.equal(reachOutWhenOf({ ...search, last_run_for: "2026-10-13" }, NOW, TZ), "goes with tomorrow's 9:00 AM run");
  assert.equal(
    reachOutWhenOf({ ...search, last_run_for: null }, Date.parse("2026-10-14T03:30:00Z"), TZ),
    "goes with tomorrow's 9:00 AM run",
    "past the day's last hour",
  );
  assert.equal(reachOutWhenOf(c, NOW, TZ), "goes with the next run, within the hour, after your say", "a list asks");
  assert.equal(reachOutWhenOf({ ...c, waiting_run_id: "run-1" }, NOW, TZ), "a run waits for your say");
  assert.equal(reachOutWhenOf({ ...c, state: "paused" }, NOW, TZ), "nothing goes while it is paused");
});

test("where a lead stands: one line, the first that holds", () => {
  assert.equal(reachOutStandingOf(story({ chain: null }), NOW, TZ), null, "no reach-out, no line");
  assert.equal(
    line(story({ added_at: "2026-10-13T14:00:00Z" })),
    "Added today · not written yet · goes with the next run, within the hour, after your say",
  );
  const written = story({
    can_stop: true,
    sends: [
      send(),
      send({
        id: "s2",
        n: 1,
        state: "planned",
        sent_at: null,
        left: false,
        send_at: "2026-10-15T14:30:00Z",
        message_id: null,
      }),
    ],
  });
  const w = reachOutStandingOf(written, NOW, TZ);
  assert.match(w.line, /^Email 1 of 3 sent Fri · next Thu/);
  assert.equal(w.stop, true, "Stop writing to them is asked of a lead written to");
  assert.equal(
    line(
      story({ sends: [send(), send({ id: "s2", n: 1, state: "held", sent_at: null, left: false, message_id: null })] }),
    ),
    "Email 1 of 3 sent Fri · the next waits for your say",
  );
  assert.equal(
    line(story({ sends: [send({ state: "held", sent_at: null, left: false })] })),
    "Email 1 waits for your say",
  );
  // An answer: never "still writing" after it (the person page's old line said so while it could stop).
  const answered = reachOutStandingOf(story({ can_stop: true, sends: [send()], readings: [reading()] }), NOW, TZ);
  assert.deepEqual(
    [answered.line, answered.tone, answered.stop],
    ["Wrote back yesterday · interested · the reach-out stopped", "good", false],
  );
  // An automatic reply is not an answer: away only pauses it.
  const away = reading({
    intent: "away",
    claim: "auto_reply",
    stops: false,
    convert: false,
    until_at: "2026-10-20T14:00:00Z",
  });
  assert.match(
    line(story({ can_stop: true, sends: [send()], readings: [away] })),
    /^Away until .* · the reach-out waits$/,
  );
  assert.equal(
    line(story({ sends: [send()], readings: [reading({ intent: "no", said_no: true })] })),
    "Said no yesterday · nothing more will be written",
  );
  assert.match(
    line(story({ booked_at: "2026-10-15T19:00:00Z", readings: [reading()] })),
    /^Booked /,
    "a booking first",
  );
  assert.equal(line(story({ sends: [send({ bounced: true })] })), "Bounced · nothing more will be written");
  assert.match(line(story({ stopped_at: "2026-10-12T15:00:00Z", sends: [send()] })), /^You stopped writing to them /);
  assert.equal(
    line(story({ chain: { ...story().chain, waiting_run_id: "run-1" } })),
    "Not written yet · a run waits for your say",
  );
});

test("a person's page says the same line, never its own", () => {
  const t = story({ can_stop: true, sends: [send()], readings: [reading()] });
  assert.equal(
    reachOutPersonOf(t, NOW, TZ).about,
    "Early gyms · Ready · wrote back yesterday · interested · the reach-out stopped",
  );
});

test("a lead on a list nothing was written to has its line under its stage on Leads", () => {
  const l = {
    lead_id: "lead-1",
    stage: "ready",
    closed_reason: null,
    sent: 0,
    first_sent_at: null,
    last_sent_at: null,
    next_at: null,
    held: false,
    handed: false,
    bounced: false,
    bounced_at: null,
    email_state: "ok",
    reply: null,
    away_until: null,
    resume_at: null,
    booked_at: null,
    stopped_at: null,
    added_at: "2026-10-12T15:00:00Z",
  };
  assert.equal(reachOutLineOf(l, NOW, TZ), "Added yesterday · not written yet");
  assert.equal(reachOutLineOf({ ...l, added_at: null }, NOW, TZ), null);
});

test("what an add said, dry or done, one other reach-out by its name", () => {
  const dry = {
    dry: true,
    added: 0,
    would_add: 2,
    left_out: { already: 1, elsewhere: 1, no_email: 2 },
    leads: [{ lead_id: "x", why: "elsewhere", chain_id: "c", chain_name: "Barres in Austin" }],
    cap: 25,
  };
  assert.deepEqual(reachOutAddWords(dry, "Early gyms"), {
    text: "Adds 2 leads to “Early gyms” · 4 left out: 2 with no email address, 1 already on it, 1 with “Barres in Austin”",
    tone: "plain",
  });
  assert.deepEqual(
    reachOutAddWords({ ...dry, dry: false, added: 1, would_add: undefined, left_out: {}, leads: [] }, "Early gyms"),
    {
      text: "Added 1 lead to “Early gyms”",
      tone: "good",
    },
  );
  assert.equal(reachOutAddWords({ ...dry, would_add: 0 }, "Early gyms").tone, "warn");
  for (const why of REACH_OUT_WHY_NOT) assert.ok(REACH_OUT_WHY_NOT_WORDS[why], `${why} has its words`);
});

test("the pile's progress: decided of the whole, the later ones said, done when nothing is left", () => {
  assert.deepEqual(leadPileProgressOf({ total: 40, added: 9, closed: 3, later: 3, left: 25 }), {
    text: "12 of 40 decided · 3 for later",
    share: 0.3,
    done: false,
  });
  assert.deepEqual(leadPileProgressOf({ total: 0, added: 0, closed: 0, later: 0, left: 0 }), {
    text: "0 of 0 decided",
    share: 0,
    done: true,
  });
});

test("the pile's rail: no, not now, yes; Keep and Leave out are find's, an add goes to its reach-out or a new list", async () => {
  const { leadPileRailOf, leadPileOpen, leadPileFactsOf, LEAD_PILE_WORDS } = await import("@chanlytics/contracts");
  assert.deepEqual(
    leadPileRailOf({ cls: "qualified", target: "Early gyms" }).map((s) => [s.act, s.label, s.key, s.right]),
    [
      ["not_a_fit", "Not a fit", "n", "approve"],
      ["later", "Later", "l", "approve"],
      ["add", "Add to “Early gyms”", "a", "approve"],
    ],
  );
  assert.deepEqual(
    leadPileRailOf({ cls: "qualified", target: null }).map((s) => s.act),
    ["not_a_fit", "later", "hold"],
    "no reach-out yet: held for a new list",
  );
  assert.deepEqual(
    leadPileRailOf({ cls: "review", target: "Early gyms" }).map((s) => [s.act, s.right]),
    [
      ["exclude", "find"],
      ["later", "approve"],
      ["keep", "find"],
    ],
  );
  const row = (over = {}) => ({ cls: "qualified", stage: "ready", chainId: null, laterAt: null, ...over });
  const first = { cls: "qualified", pass: "first" };
  const later = { cls: "qualified", pass: "later" };
  assert.equal(leadPileOpen(row(), first), true);
  assert.equal(leadPileOpen(row({ chainId: "r1" }), first), false, "with a reach-out already: decided");
  assert.equal(leadPileOpen(row({ stage: "archived" }), first), false, "Not a fit: decided");
  assert.equal(leadPileOpen(row({ laterAt: "2026-10-13T15:00:00Z" }), first), false, "put off: not in the first pass");
  assert.equal(leadPileOpen(row({ laterAt: "2026-10-13T15:00:00Z" }), later), true, "but in the later one");
  assert.equal(leadPileOpen(row({ cls: "review" }), { cls: "review", pass: "first" }), true);
  assert.equal(leadPileOpen(row({ cls: "qualified" }), { cls: "review", pass: "first" }), false, "kept: decided");
  assert.deepEqual(leadPileFactsOf({ chain_id: "r1", member: { later_at: null } }), { chainId: "r1", laterAt: null });
  assert.equal(LEAD_PILE_WORDS.writeHeld(3), "Write to the 3");
});

test("what came of it (00423): won on the line and the standing, Back on their own day, the drawer's line, booked at 6 PM, Won in the report", () => {
  const l = {
    lead_id: "lead-1",
    stage: "converted",
    closed_reason: null,
    sent: 2,
    first_sent_at: "2026-10-01T15:00:00Z",
    last_sent_at: "2026-10-05T15:00:00Z",
    next_at: null,
    held: false,
    handed: false,
    bounced: false,
    bounced_at: null,
    email_state: "ok",
    reply: null,
    away_until: null,
    resume_at: null,
    booked_at: "2026-10-08T15:00:00Z",
    won_at: "2026-10-12T15:00:00Z",
    stopped_at: null,
  };
  assert.equal(reachOutLineOf(l, NOW, TZ), "Booked Oct 8 · won Oct 12");
  assert.equal(reachOutLineOf({ ...l, booked_at: null }, NOW, TZ), "Won Oct 12");
  assert.equal(reachOutLineOf({ ...l, won_at: null }, NOW, TZ), "Booked Thu 10:00 AM", "booked alone, as before");
  const won = reachOutStandingOf(story({ booked_at: l.booked_at, won_at: l.won_at, sends: [send()] }), NOW, TZ);
  assert.deepEqual([won.line, won.tone, won.stop], ["Booked Oct 8 · won Oct 12", "good", false]);

  // Not now, and their day has come: back, to write to by hand (decision 9).
  const notNow = reading({ intent: "not_now", stops: true, convert: false });
  const back = reachOutStandingOf(
    story({ resume_at: "2026-10-13T05:00:00Z", sends: [send()], readings: [notNow] }),
    NOW,
    TZ,
  );
  assert.deepEqual([back.line, back.tone], ["Asked to hear from you today · write to them yourself", "warn"]);
  const ahead = reachOutStandingOf(
    story({ resume_at: "2026-10-20T05:00:00Z", sends: [send()], readings: [notNow] }),
    NOW,
    TZ,
  );
  assert.notEqual(ahead.tone, "warn", "before their day, it is a reply like any other");
  const replied = { intent: "not_now", claim: "person", read_at: "2026-10-09T15:00:00Z", undone: false };
  assert.equal(
    reachOutLineOf({ ...l, won_at: null, booked_at: null, reply: replied, resume_at: "2026-10-12T05:00:00Z" }, NOW, TZ),
    "Back · asked to hear from you yesterday",
  );
  assert.equal(
    reachOutLineOf({ ...l, won_at: null, booked_at: null, reply: replied, resume_at: "2026-10-20T05:00:00Z" }, NOW, TZ),
    "Not now · until Oct 20",
  );
  assert.equal(LEAD_BACK_WORDS.line("Iron Works", "today"), "Iron Works asked to hear from you today");

  const counts = { waiting: 3, writing: 9, done: 5, of: 44 };
  assert.equal(
    reachOutCameWords({ counts, fed_by: "search", came: { written: 31, wrote_back: 3, booked: 1, won: 1 } }),
    "44 found · 31 written to · 3 wrote back · 1 booked · 1 won",
  );
  assert.equal(
    reachOutCameWords({ counts, fed_by: "list", came: { written: 0, wrote_back: 0, booked: 0, won: 0 } }),
    "44 on its list · 0 written to",
  );
  assert.equal(reachOutCameWords({ counts, fed_by: "list" }), null, "a read before it says nothing");

  const day = { written: 12, wrote_back: 2, interested: 1, said_no: 0, bounced: 0, held: 0 };
  assert.equal(reachOutDayWords({ ...day, booked: 1 }).body, "12 written · 2 wrote back, 1 interested · 1 booked.");
  assert.equal(reachOutDayWords(day).body, "12 written · 2 wrote back, 1 interested.");

  const step = (over) => ({
    id: "st1",
    n: 0,
    hand: null,
    written: 4,
    delivered: 4,
    bounced: 0,
    businesses: 4,
    wrote_back: 1,
    interested: 1,
    booked: 1,
    said_no: 0,
    handed: 0,
    ...over,
  });
  const dto = (won) => ({
    timezone: TZ,
    days: 30,
    today: "2026-10-13",
    since: "2026-09-14",
    has_reach_out: true,
    totals: { ...step(won === undefined ? {} : { won }), id: undefined, n: undefined, hand: undefined },
    series: [],
    chains: [
      {
        root_id: "r1",
        name: "Early gyms",
        state: "running",
        search: null,
        last_at: null,
        runs: 1,
        steps: [step(won === undefined ? {} : { won })],
      },
    ],
    angles: [],
    other_angles: { written: 0, wrote_back: 0 },
    no_angle: 0,
    domains: [],
  });
  const lens = toReachOutLensVM(dto(1), NOW);
  assert.deepEqual(
    lens.sources.map((s) => s.won),
    ["1", "1"],
    "the reach-out and its step",
  );
  const before = toReachOutLensVM(dto(undefined), NOW);
  assert.deepEqual(
    before.sources.map((s) => s.won),
    ["—", "—"],
    "a database before it: a dash, never a zero",
  );
});
