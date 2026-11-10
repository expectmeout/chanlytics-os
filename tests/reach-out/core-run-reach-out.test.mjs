/**
 * A reach-out step's run (Reach out, Part 3): runReachOut over fakes for its ports. Who it writes to, the run it makes
 * and whether it waits (decision 0064: a step whose words are new waits for its owner, any other goes by its sequence's
 * mode), and when each email is planned, in its lead's own hours; and the ids a send and its email get.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { runReachOut, sendIdFor, sendMessageId, getReachOutRunId } = await importSrc(
  "packages/core/src/campaigns/index.ts",
);

const NOW = Date.parse("2026-09-28T11:00:00Z"); // a Monday, 6 AM in Austin, 4 AM in Los Angeles
/** When its owner last let a batch of a step's words go (00462 words_ok_at): its words seen. */
const SEEN = "2026-09-21T15:00:00Z";
const RUN = await getReachOutRunId("p1", "2026-09-28");
const lead = (id, over = {}) => ({
  lead_id: id,
  email: `${id}@fixture.example`,
  business_name: `Biz ${id}`,
  city: "Austin",
  region: "TX",
  hours: [],
  ...over,
});
const root = (over = {}) => ({
  id: "p1",
  root_id: "p1",
  tenant_id: "t1",
  name: "Movers in Austin",
  trigger: "lead_first",
  state: "running",
  lead_search_id: "s1",
  fed_by: "search",
  include_unconfirmed: false,
  after_playbook_id: null,
  after_days: null,
  gap_minutes: 12,
  mailbox_ids: [],
  cap_per_run: 25,
  template_id: "tpl1",
  template_name: "reach_first",
  template_language: "en",
  // Its words new to its owner (00462): its first run waits for them.
  words_ok_at: null,
  ...over,
});
function ports(over = {}) {
  const made = { runs: [], sends: [], told: [], going: [], held: [], recorded: [], passed: [] };
  return {
    made,
    ports: {
      now: () => NOW,
      workspaceZone: "America/New_York",
      mode: "veto",
      maySpend: true,
      alreadyRan: async () => false,
      waitingSteps: async () => new Set(),
      audience: async () => [lead("a"), lead("b", { region: "CA" })],
      followers: async () => [],
      passOver: async (rootId, leads) => (made.passed.push([rootId, leads]), leads.length),
      mailboxes: async () => ({ senders: [{ id: "d1", cap: 30, recent: [] }], gone: new Set() }),
      planRun: async (run, sends) => (made.runs.push(run), made.sends.push(...sends), { id: run.id }),
      recordRun: async (run, counts) => void made.recorded.push([run.id, run.state, counts]),
      notifyWaiting: async (runId, n, firstAt) => void made.told.push([runId, n, firstAt]),
      notifyGoes: async (runId, n, firstAt) => (made.going.push([runId, n, firstAt]), true),
      holdForOk: async (runId) => (made.held.push(runId), true),
      ...over,
    },
  };
}
const day = { runFor: "2026-09-28" };

test("a send's id is its run and its lead; an attempt's email id is its send and its number, each stable", async () => {
  const a = await sendIdFor(RUN, "lead-a");
  assert.equal(a, await sendIdFor(RUN, "lead-a"));
  assert.notEqual(a, await sendIdFor(RUN, "lead-b"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const m0 = await sendMessageId(a, 0);
  assert.equal(m0, await sendMessageId(a, 0), "a retry of one attempt meets its own row");
  assert.notEqual(m0, await sendMessageId(a, 1), "a deferred send's next attempt is a new row, under a new key");
  assert.notEqual(m0, a);
});

test("a step's first run, its words new, waits for its owner, with every send planned in its lead's own hours", async () => {
  const { ports: p, made } = ports();
  const out = await runReachOut(p, root(), day);
  assert.deepEqual(out, { outcome: "held", reason: "waiting_for_you", planned: 2 });
  assert.equal(made.runs.length, 1);
  const run = made.runs[0];
  assert.equal(run.id, RUN, "its step and its day: a replay meets its own run");
  assert.deepEqual(made.recorded, [[RUN, "pending_approval", { planned: 2, skipped: 0 }]]);
  assert.equal(run.state, "pending_approval");
  assert.deepEqual(run.audience, { kind: "reach_out", root_id: "p1", step_id: "p1", search_id: "s1" });
  assert.deepEqual(
    [run.tenant_id, run.playbook_id, run.run_for, run.name, run.template_name, run.recipient_count],
    ["t1", "p1", "2026-09-28", "Movers in Austin · 2026-09-28", "reach_first", 2],
  );
  const by = Object.fromEntries(made.sends.map((s) => [s.lead_id, s]));
  assert.equal(by.a.send_at, "2026-09-28T14:30:00.000Z", "9:30 in Austin (Central)");
  assert.equal(by.b.send_at, "2026-09-28T16:30:00.000Z", "9:30 in California");
  assert.equal(run.scheduled_for, "2026-09-28T14:30:00.000Z", "the run says when its first email goes");
  for (const s of made.sends) {
    assert.deepEqual(
      [s.state, s.mailbox_id, s.root_id, s.playbook_id, s.broadcast_id, s.tenant_id, s.contact_id],
      ["planned", "d1", "p1", "p1", RUN, "t1", null],
    );
    assert.equal(s.id, await sendIdFor(RUN, s.lead_id), "a replayed run meets its own rows");
  }
  assert.deepEqual(made.told, [[RUN, 2, Date.parse("2026-09-28T14:30:00Z")]]);
});

test("a chain fed by a list: its first run asks, then first emails follow Before each batch, as its later steps do", async () => {
  const inHours = Date.parse("2026-09-28T15:00:00Z"); // 10 AM in Austin
  const newWords = ports({ now: () => inHours, audience: async () => [lead("a")] });
  const out = await runReachOut(newWords.ports, root({ fed_by: "list", words_ok_at: null }), day);
  assert.deepEqual(out, { outcome: "held", reason: "waiting_for_you", planned: 1 }, "the first run needs an OK");
  assert.equal(newWords.made.runs[0].state, "pending_approval");
  assert.equal(
    newWords.made.sends[0].send_at,
    "2026-09-28T15:00:00.000Z",
    "no thirty minutes: it goes when they say yes",
  );
  assert.equal(newWords.made.told.length, 1, "its owner is told a run waits");

  const held = ports({ now: () => inHours, audience: async () => [lead("a")] });
  const after = await runReachOut(held.ports, root({ fed_by: "list", words_ok_at: SEEN }), day);
  assert.deepEqual(after, { outcome: "sent", planned: 1 }, "words seen, it holds for a stop");
  assert.equal(held.made.runs[0].state, "scheduled");
  assert.equal(held.made.sends[0].send_at, "2026-09-28T15:30:00.000Z", "thirty minutes to stop it");

  for (const mode of ["ask", "something else", null]) {
    const asked = ports({ mode, now: () => inHours, audience: async () => [lead("a")] });
    const said = await runReachOut(asked.ports, root({ fed_by: "list", words_ok_at: SEEN }), day);
    assert.deepEqual(said, { outcome: "held", reason: "waiting_for_you", planned: 1 }, `a mode of ${mode} asks`);
  }

  const later = ports({
    now: () => inHours,
    followers: async () => [
      {
        ...lead("a"),
        contact_id: "ka",
        parent_message_id: "ma",
        facts: { lead_stage: "ready", suppressed: false, wrote_back: false },
        bounced: false,
      },
    ],
  });
  const step = root({
    id: "p2",
    trigger: "after_step",
    fed_by: "list",
    lead_search_id: null,
    after_playbook_id: "p1",
    after_days: 3,
    words_ok_at: SEEN,
  });
  const next = await runReachOut(later.ports, step, day);
  assert.deepEqual(next, { outcome: "sent", planned: 1 }, "a follow-up whose words were seen holds for a stop");
  assert.equal(later.made.runs[0].state, "scheduled");
});

test("a run of a step whose words were seen gives thirty minutes and tells its owner when it goes; one whose sequence asks for every batch waits; new words wait again", async () => {
  const inHours = Date.parse("2026-09-28T15:00:00Z"); // 10 AM in Austin
  const later = ports({ now: () => inHours, audience: async () => [lead("a")] });
  const out = await runReachOut(later.ports, root({ words_ok_at: SEEN }), day);
  assert.deepEqual(out, { outcome: "sent", planned: 1 });
  assert.equal(later.made.runs[0].state, "scheduled");
  assert.equal(later.made.sends[0].send_at, "2026-09-28T15:30:00.000Z", "thirty minutes to stop it first");
  assert.deepEqual(later.made.told, [], "it asks nothing of them");
  assert.deepEqual(
    later.made.going,
    [[later.made.runs[0].id, 1, Date.parse("2026-09-28T15:30:00.000Z")]],
    "Before each batch says they are told it is ready: the run, how many, and when it goes",
  );
  assert.deepEqual(
    later.made.recorded,
    [[later.made.runs[0].id, "scheduled", { planned: 1, skipped: 0 }]],
    "on the record",
  );
  const asked = ports({ mode: "ask", now: () => inHours, audience: async () => [lead("a")] });
  assert.equal((await runReachOut(asked.ports, root({ words_ok_at: SEEN }), day)).reason, "waiting_for_you");
  assert.equal(asked.made.runs[0].state, "pending_approval");
  assert.equal(asked.made.sends[0].send_at, "2026-09-28T15:00:00.000Z", "waiting for its owner, it plans from now");
  assert.deepEqual(asked.made.going, [], "a run that waits is told as waiting, never as going");
  // A later step whose words changed (its words_ok_at cleared) waits once, under Holds it too.
  const changed = ports({ now: () => inHours, audience: async () => [lead("a")] });
  assert.equal((await runReachOut(changed.ports, root(), day)).reason, "waiting_for_you");
});

test("a batch nobody could be told of does not go by itself: it waits for its owner's OK, and they are told it waits", async () => {
  const inHours = Date.parse("2026-09-28T15:00:00Z");
  const bells = {
    "the bell is down": async () => {
      throw new Error("the bell is down");
    },
    "the bell answers that nobody was told": async () => false,
  };
  for (const [what, notifyGoes] of Object.entries(bells)) {
    const quiet = ports({ now: () => inHours, audience: async () => [lead("a")], notifyGoes });
    assert.deepEqual(
      await runReachOut(quiet.ports, root({ words_ok_at: SEEN }), day),
      { outcome: "held", reason: "waiting_for_you", planned: 1 },
      what,
    );
    assert.equal(quiet.made.runs.length, 1, "the run is made and on the ledger");
    assert.deepEqual(quiet.made.held, [RUN], `${what}: held for its owner's OK`);
    assert.deepEqual(
      quiet.made.recorded,
      [[RUN, "pending_approval", { planned: 1, skipped: 0 }]],
      `${what}: on the record as waiting, never as a batch the system sent by itself`,
    );
    assert.deepEqual(
      quiet.made.told,
      [[RUN, 1, Date.parse("2026-09-28T15:30:00.000Z")]],
      `${what}: its owner is told it waits`,
    );
  }
});

test("a batch that could be neither told of nor held is never lost: it goes at its time, on the record as going", async () => {
  const inHours = Date.parse("2026-09-28T15:00:00Z");
  const holds = {
    "the hold fails": async () => {
      throw new Error("the database is down");
    },
    "the run had already moved on": async () => false,
  };
  for (const [what, holdForOk] of Object.entries(holds)) {
    const stuck = ports({
      now: () => inHours,
      audience: async () => [lead("a")],
      notifyGoes: async () => false,
      holdForOk,
    });
    assert.deepEqual(
      await runReachOut(stuck.ports, root({ words_ok_at: SEEN }), day),
      { outcome: "sent", planned: 1 },
      what,
    );
    assert.deepEqual(stuck.made.recorded, [[RUN, "scheduled", { planned: 1, skipped: 0 }]], what);
    assert.deepEqual(stuck.made.told, [], `${what}: nothing waits, so nothing is said to wait`);
  }
});

test("a waiting bell that fails costs a held batch nothing: it still waits, on the record", async () => {
  const quiet = ports({
    now: () => Date.parse("2026-09-28T15:00:00Z"),
    audience: async () => [lead("a")],
    notifyGoes: async () => false,
    notifyWaiting: async () => {
      throw new Error("the bell is down");
    },
  });
  assert.deepEqual(await runReachOut(quiet.ports, root({ words_ok_at: SEEN }), day), {
    outcome: "held",
    reason: "waiting_for_you",
    planned: 1,
  });
  assert.deepEqual(quiet.made.recorded, [[RUN, "pending_approval", { planned: 1, skipped: 0 }]]);
});

test("a run its owner sends by hand is never said to go, and never held", async () => {
  const byHand = ports({
    now: () => Date.parse("2026-09-28T15:00:00Z"),
    audience: async () => [lead("a")],
    draftLoad: async () => ({ today: 0, open: 0 }),
    notifyGoes: async () => false,
  });
  await runReachOut(byHand.ports, root({ words_ok_at: SEEN, owner_sends: true }), day);
  assert.equal(byHand.made.runs.length, 1);
  assert.deepEqual(byHand.made.going, [], "its owner sends it: nothing goes without them");
  assert.deepEqual(byHand.made.held, [], "and nothing is held from them");
});

test("nothing is assembled while a run of the chain waits, a chain is paused, or the workspace may not spend", async () => {
  const cases = [
    [{ waitingSteps: async () => new Set(["p1"]) }, root(), { outcome: "held", reason: "waiting_for_you", planned: 0 }],
    [{}, root({ state: "paused" }), { outcome: "off", reason: "paused", planned: 0 }],
    [{ maySpend: false }, root(), { outcome: "held", reason: "billing", planned: 0 }],
    [{ alreadyRan: async () => true }, root(), { outcome: "empty", reason: "already_ran", planned: 0 }],
    [{ audience: async () => [] }, root(), { outcome: "empty", reason: "nobody", planned: 0 }],
    [
      { mailboxes: async () => ({ senders: [], gone: new Set() }) },
      root(),
      { outcome: "held", reason: "no_mailbox", planned: 0 },
    ],
    [
      { mailboxes: async () => ({ senders: [{ id: "d1", cap: 0, recent: [] }], gone: new Set() }) },
      root(),
      { outcome: "held", reason: "no_mailbox", planned: 0 },
    ],
  ];
  for (const [over, step, want] of cases) {
    const { ports: p, made } = ports(over);
    assert.deepEqual(await runReachOut(p, step, day), want, JSON.stringify(want));
    assert.deepEqual([made.runs, made.sends, made.told, made.recorded], [[], [], [], []], "nothing written");
  }
});

test("a sequence its owner set to send on its own goes at once, with no hold and no bell; its new words still wait (0120)", async () => {
  const inHours = Date.parse("2026-09-28T15:00:00Z"); // 10 AM in Austin
  const alone = ports({ mode: "auto", now: () => inHours, audience: async () => [lead("a")] });
  const out = await runReachOut(alone.ports, root({ words_ok_at: SEEN }), day);
  assert.deepEqual(out, { outcome: "sent", planned: 1 });
  assert.equal(alone.made.runs[0].state, "scheduled");
  assert.equal(alone.made.sends[0].send_at, "2026-09-28T15:00:00.000Z", "no thirty minutes: nobody is to stop it");
  assert.deepEqual(alone.made.going, [], "nothing to be told of in time to stop");
  assert.deepEqual(alone.made.told, [], "and nothing asked");
  assert.deepEqual(alone.made.held, []);
  assert.deepEqual(
    alone.made.recorded,
    [[alone.made.runs[0].id, "scheduled", { planned: 1, skipped: 0 }]],
    "on the record, as the system's send",
  );
  // Its words new to its owner: the first batch of them waits, whatever the sequence says.
  const fresh = ports({ mode: "auto", now: () => inHours, audience: async () => [lead("a")] });
  const first = await runReachOut(fresh.ports, root({ words_ok_at: null }), day);
  assert.deepEqual(first, { outcome: "held", reason: "waiting_for_you", planned: 1 });
  assert.equal(fresh.made.runs[0].state, "pending_approval");
});

test("a run that waits holds new first emails and its own step, never the follow-ups to people already written to (0120)", async () => {
  const inHours = Date.parse("2026-09-28T15:00:00Z");
  const follower = {
    ...lead("a"),
    contact_id: "ka",
    parent_message_id: "ma",
    facts: { lead_stage: "ready", suppressed: false, wrote_back: false },
    bounced: false,
  };
  const after = root({
    id: "p2",
    trigger: "after_step",
    fed_by: "list",
    lead_search_id: null,
    after_playbook_id: "p1",
    after_days: 3,
    words_ok_at: SEEN,
  });
  const held = { outcome: "held", reason: "waiting_for_you", planned: 0 };
  // A first email waits for its owner: no new business is written to, and the follow-up still goes.
  const firstWaits = () =>
    ports({ now: () => inHours, waitingSteps: async () => new Set(["p1"]), followers: async () => [follower] });
  assert.deepEqual(await runReachOut(firstWaits().ports, root({ words_ok_at: SEEN }), day), held);
  const goesOn = firstWaits();
  assert.deepEqual(await runReachOut(goesOn.ports, after, day), { outcome: "sent", planned: 1 });
  assert.equal(goesOn.made.runs.length, 1, "the people already written to are not left waiting behind it");
  // A follow-up waits for its owner: its own step makes no second run, and no new business is written to either.
  const nudgeWaits = () =>
    ports({ now: () => inHours, waitingSteps: async () => new Set(["p2"]), followers: async () => [follower] });
  const again = nudgeWaits();
  assert.deepEqual(await runReachOut(again.ports, after, day), held, "under Ask me they never pile up");
  assert.equal(again.made.runs.length, 0);
  assert.deepEqual(await runReachOut(nudgeWaits().ports, root({ words_ok_at: SEEN }), day), held);
  // Another follow-up step of the chain is held by neither.
  const third = { ...after, id: "p3", after_playbook_id: "p2" };
  assert.deepEqual(await runReachOut(nudgeWaits().ports, third, day), { outcome: "sent", planned: 1 });
});

test("leads with no hour to be written in, or no room in any mailbox, make no run; a run another tick made first plans nothing", async () => {
  const closed = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => ({
    day: d,
    hours: "Closed",
  }));
  const shut = ports({ audience: async () => [lead("a", { hours: closed })] });
  assert.deepEqual(await runReachOut(shut.ports, root(), day), { outcome: "empty", reason: "nobody", planned: 0 });
  assert.deepEqual(shut.made.runs, []);
  // A mailbox whose day is spent for the week: the leads wait for tomorrow's run.
  const week = Array.from({ length: 8 * 30 }, (_, i) => NOW - 60_000 + i * 45 * 60_000);
  const full = ports({ mailboxes: async () => ({ senders: [{ id: "d1", cap: 1, recent: week }], gone: new Set() }) });
  assert.deepEqual(await runReachOut(full.ports, root(), day), { outcome: "held", reason: "no_room", planned: 0 });
  assert.deepEqual(full.made.runs, []);
  const raced = ports({ planRun: async () => "exists" });
  assert.deepEqual(await runReachOut(raced.ports, root(), day), {
    outcome: "empty",
    reason: "already_ran",
    planned: 0,
  });
  assert.deepEqual([raced.made.told, raced.made.recorded], [[], []], "another tick's run: not told or recorded twice");
});

test("a run takes the step's share of leads, and a lead whose state has no zone keeps the business's hours", async () => {
  const many = ports({ audience: async () => Array.from({ length: 10 }, (_, i) => lead(`l${i}`)) });
  assert.equal((await runReachOut(many.ports, root({ cap_per_run: 3 }), day)).planned, 3);
  const nowhere = ports({ audience: async () => [lead("a", { region: null })] });
  await runReachOut(nowhere.ports, root(), day);
  assert.equal(nowhere.made.sends[0].send_at, "2026-09-28T13:30:00.000Z", "9:30 in New York, the workspace's zone");
});

test("a step writes to the leads sent the step before; one refused for good is passed over, someone away only skipped", async () => {
  const step = root({
    id: "p2",
    trigger: "after_step",
    lead_search_id: null,
    after_playbook_id: "p1",
    after_days: 3,
    words_ok_at: SEEN,
  });
  const f = (id, over = {}) => ({
    lead_id: id,
    contact_id: `k${id}`,
    email: `${id}@x.example`,
    region: "TX",
    hours: [],
    parent_message_id: `m${id}`,
    facts: { lead_stage: "ready", suppressed: false, wrote_back: false },
    bounced: false,
    mailbox_id: "d1",
    country: "US",
    ...over,
  });
  const { ports: p, made } = ports({
    audience: async () => assert.fail("a step reads its followers, never the search"),
    followers: async () => [
      f("a"),
      f("b", { facts: { lead_stage: "ready", suppressed: false, wrote_back: true } }),
      f("c", { bounced: true }),
      f("d", { facts: { lead_stage: "archived", suppressed: false, wrote_back: false } }),
      f("e", { facts: { lead_stage: "ready", suppressed: true, wrote_back: false } }),
      // An automatic out-of-office (00226): skipped outreach_away, which the followers pass over after the day.
      f("w", { facts: { lead_stage: "ready", suppressed: false, wrote_back: false, away: true } }),
      f("n", { facts: { lead_stage: "nurture", suppressed: false, wrote_back: false } }),
    ],
  });
  const out = await runReachOut(p, step, day);
  assert.equal(out.planned, 2);
  assert.deepEqual(
    made.sends.filter((s) => s.state === "planned").map((s) => [s.lead_id, s.contact_id, s.playbook_id, s.root_id]),
    [
      ["a", "ka", "p2", "p1"],
      ["n", "kn", "p2", "p1"],
    ],
  );
  // Each one refused for good is passed over with why (00455): its place in the chain ends, so the record says where
  // they went and tomorrow's read no longer returns them. A skipped send would have put them back in (a send made
  // places its person), so none is written for them.
  assert.deepEqual(made.passed, [
    [
      "p1",
      [
        { lead_id: "b", why: "outreach_wrote_back" },
        { lead_id: "c", why: "outreach_bounced" },
        { lead_id: "d", why: "outreach_lead_closed" },
        { lead_id: "e", why: "outreach_suppressed" },
      ],
    ],
  ]);
  // Someone away is only skipped on the step: the followers take them back after the day their reply names.
  assert.deepEqual(
    made.sends
      .filter((s) => s.state === "skipped")
      .map((s) => [s.lead_id, s.reason, s.mailbox_id, s.send_at, s.contact_id]),
    [["w", "outreach_away", null, null, "kw"]],
  );
  assert.equal(made.runs[0].recipient_count, 2, "the run counts who it writes to");
  assert.deepEqual(made.runs[0].audience, { kind: "reach_out", root_id: "p1", step_id: "p2", search_id: null });
  assert.deepEqual(made.recorded, [[made.runs[0].id, "scheduled", { planned: 2, skipped: 1 }]]);
});

test("a step whose every follower is refused plans nothing, and still passes each over", async () => {
  const step = root({
    id: "p2",
    trigger: "after_step",
    lead_search_id: null,
    after_playbook_id: "p1",
    after_days: 3,
    words_ok_at: SEEN,
  });
  const stopped = {
    lead_id: "s",
    contact_id: "ks",
    email: "s@x.example",
    region: "TX",
    hours: [],
    parent_message_id: "ms",
    facts: { lead_stage: "ready", suppressed: false, wrote_back: false, stopped: true },
    bounced: false,
    mailbox_id: "d1",
    country: "US",
  };
  const { ports: p, made } = ports({ followers: async () => [stopped] });
  assert.deepEqual(await runReachOut(p, step, day), { outcome: "empty", reason: "nobody", planned: 0 });
  assert.deepEqual(made.passed, [["p1", [{ lead_id: "s", why: "outreach_stopped" }]]]);
  assert.deepEqual(made.runs, [], "no run is made for nobody");
});

test("a lead that keeps no open hour all week is skipped, and the step's share goes to the next", async () => {
  const closed = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => ({
    day: d,
    hours: "Closed",
  }));
  const { ports: p, made } = ports({
    audience: async () => [lead("shut", { hours: closed }), lead("a"), lead("b"), lead("c")],
  });
  const out = await runReachOut(p, root({ cap_per_run: 2 }), day);
  assert.equal(out.planned, 2);
  assert.deepEqual(
    made.sends.map((s) => [s.lead_id, s.state, s.reason ?? null]),
    [
      ["a", "planned", null],
      ["b", "planned", null],
      ["shut", "skipped", "closed_every_day"],
    ],
  );
});

test("the run is its step and its day, whatever tick makes it: a replay meets the run it made", async () => {
  const one = ports();
  const two = ports();
  await runReachOut(one.ports, root(), day);
  await runReachOut(two.ports, root(), day);
  assert.equal(one.made.runs[0].id, two.made.runs[0].id);
  assert.deepEqual(
    one.made.sends.map((s) => s.id),
    two.made.sends.map((s) => s.id),
  );
  assert.notEqual(one.made.runs[0].id, await getReachOutRunId("p1", "2026-09-29"), "the next day's is another");
});

test("a later step's lead keeps the mailbox its chain wrote from; one whose mailbox is gone is skipped, never written to from another (decision 0056)", async () => {
  const step = root({
    id: "p2",
    trigger: "after_step",
    lead_search_id: null,
    after_playbook_id: "p1",
    after_days: 3,
    words_ok_at: SEEN,
  });
  const f = (id, mailbox) => ({
    lead_id: id,
    contact_id: `k${id}`,
    email: `${id}@x.example`,
    region: "TX",
    hours: [],
    parent_message_id: `m${id}`,
    facts: { lead_stage: "ready", suppressed: false, wrote_back: false },
    bounced: false,
    mailbox_id: mailbox,
    country: "US",
  });
  const asked = [];
  const { ports: p, made } = ports({
    followers: async () => [f("a", "d1"), f("b", "d2"), f("c", "gone-1")],
    mailboxes: async (_step, also) => {
      asked.push([...also].sort());
      return {
        senders: [
          { id: "d1", cap: 30, recent: [] },
          { id: "d2", cap: 30, recent: [] },
          { id: "d3", cap: 30, recent: [] },
        ],
        gone: new Set(["gone-1"]),
      };
    },
  });
  const out = await runReachOut(p, step, day);
  assert.equal(out.planned, 2);
  assert.deepEqual(asked, [["d1", "d2", "gone-1"]], "the step's mailboxes, and every one its leads keep");
  const by = Object.fromEntries(made.sends.map((s) => [s.lead_id, s]));
  assert.deepEqual([by.a.state, by.a.mailbox_id], ["planned", "d1"], "the same mailbox, so the nudge is in its thread");
  assert.deepEqual([by.b.state, by.b.mailbox_id], ["planned", "d2"]);
  assert.deepEqual([by.c.state, by.c.reason, by.c.mailbox_id], ["skipped", "mailbox_gone", null]);
});
