/**
 * The heartbeat, run against fakes of everything it touches.
 *
 * Each case is a behaviour the old runner and sweep got wrong at least once, or
 * one this design exists to keep: a job claimed is a job started; a send whose
 * run died is never sent again; a failure is recorded even when telling
 * somebody about it fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runTick, lateFields } from "../../../../packages/jobs/src/tick.ts";
import {
  RUN_INTERRUPTED,
  MAX_ATTEMPTS,
  UNKNOWN_KIND_WAIT_MS,
  UNKNOWN_KIND_GIVE_UP_MS,
} from "../../../../packages/jobs/src/ledger.ts";

const job = (id, kind = "line_provision", attempts = 1) => ({
  id,
  tenant_id: "t1",
  kind,
  payload: {},
  due_at: "2026-01-01T00:00:00Z",
  attempts,
});

const OPTS = { claimForMs: 20_000, yieldAtMs: 45_000, leaseSeconds: 90 };

/**
 * The ledger as a queue, and every port recorded. `claim` hands out one job per
 * call, in order, which is the contract claim_due_jobs(1, ...) keeps.
 */
function fakes(jobs, o = {}) {
  const queue = [...jobs];
  const trail = [];
  const calls = {
    claim: [],
    dispatch: [],
    complete: [],
    fail: [],
    defer: [],
    deferUnknown: [],
    settle: [],
    alert: [],
    log: [],
  };
  const has = (set, id) => (set ?? new Set()).has(id);
  let reading = 0;
  const ports = {
    claim: async (lease) => {
      calls.claim.push(lease);
      const j = queue.shift() ?? null;
      trail.push(j ? `claim ${j.id}` : "claim nothing");
      return j;
    },
    dispatch: async (j, deadline) => {
      trail.push(`run ${j.id}`);
      calls.dispatch.push([j.id, deadline]);
      if (has(o.throwOn, j.id)) throw new Error(`boom ${j.id}`);
      return has(o.unknown, j.id) ? "unknown_kind" : "done";
    },
    complete: async (j) => {
      calls.complete.push(j.id);
      if (has(o.completeThrows, j.id)) throw new Error("connection reset");
      return !has(o.completeLost, j.id);
    },
    fail: async (j, reason) => {
      calls.fail.push([j.id, reason]);
      return !has(o.failLost, j.id);
    },
    defer: async (j, untilIso, reason) => {
      calls.defer.push([j.id, untilIso, reason]);
      if (has(o.deferThrows, j.id)) throw new Error("connection reset");
      return !has(o.deferLost, j.id);
    },
    deferUnknown: async (j, untilIso, reason) => {
      calls.deferUnknown.push([j.id, untilIso, reason]);
      return !has(o.deferLost, j.id);
    },
    settle: async (j, certain) => {
      calls.settle.push([j.id, certain]);
      return o.settled ?? [{ what: "message", changed: true }];
    },
    alert: async (j, news) => {
      if (o.alertThrows) throw new Error("mail down");
      calls.alert.push({ id: j.id, ...news });
    },
    log: {
      info: (e, f) => calls.log.push(["info", e, f]),
      warn: (e, f) => calls.log.push(["warn", e, f]),
      error: (e, f) => calls.log.push(["error", e, f]),
    },
    now: () => (o.clock ? o.clock(reading++) : 0),
    // No jitter unless a case asks for it, so a wait reads as the table's own.
    random: o.random ?? (() => 0),
  };
  const logged = (level, event) => calls.log.some(([l, e]) => l === level && e === event);
  return { ports, calls, queue, trail, logged };
}

test("every due job runs once, in order, and is recorded done; the tick ends when nothing is due", async () => {
  const { ports, calls } = fakes([job("a"), job("b"), job("c")]);
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(
    calls.dispatch.map(([id]) => id),
    ["a", "b", "c"],
  );
  assert.deepEqual(calls.complete, ["a", "b", "c"]);
  assert.deepEqual(calls.claim, [90, 90, 90, 90], "each claim carries the lease; the fourth finds nothing");
  assert.deepEqual(counts, {
    claimed: 3,
    done: 3,
    failed: 0,
    gaveUp: 0,
    deferred: 0,
    lateMs: { line_provision: 0 },
    replyLateMs: 0,
  });
});

test("a job is claimed only when it is about to run", async () => {
  // Claiming a batch and working through it is the tempting shape. Kill the
  // function halfway and every job behind the running one comes back looking
  // like a run that died mid-send, so a reply nobody ever tried to send is
  // failed as "outcome unknown". One claim, one run, then the next claim.
  const { ports, trail } = fakes([job("a"), job("b")]);
  await runTick(ports, OPTS);
  assert.deepEqual(trail, ["claim a", "run a", "claim b", "run b", "claim nothing"]);
});

test("a handler that throws is failed, settled as an unknown outcome and reported; the rest still run", async () => {
  const { ports, calls } = fakes([job("a", "outbound_send"), job("b", "outbound_send"), job("c", "outbound_send")], {
    throwOn: new Set(["b"]),
  });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(
    calls.dispatch.map(([id]) => id),
    ["a", "b", "c"],
  );
  assert.deepEqual(calls.fail, [["b", "boom b"]]);
  assert.deepEqual(calls.settle, [["b", false]], "it ran, so whether it sent is not known");
  assert.equal(calls.alert.length, 1);
  assert.equal(calls.alert[0].subject, "A message may not have been sent", "the owner's words, never the job's name");
  assert.equal(calls.alert[0].route, "inbox", "on the page the message lives on");
  assert.match(calls.alert[0].body, /^It stopped and will not start again on its own\./, "the bell's line comes first");
  assert.match(calls.alert[0].body, /Reference: job b \(outbound_send\): boom b\.$/, "the id and the error close it");
  assert.match(
    calls.alert[0].body,
    /marked failed, so it is no longer shown as on its way/,
    "and what became of the message",
  );
  assert.deepEqual(counts, {
    claimed: 3,
    done: 2,
    failed: 1,
    gaveUp: 0,
    deferred: 0,
    lateMs: { outbound_send: 0 },
    replyLateMs: 0,
  });
  assert.deepEqual(calls.defer, [], "a send is never kept to be tried again: a second try could reach a person twice");
});

/* ------------------------------------------------- an intake is tried again */

const MIN = 60_000;
const at = (ms) => new Date(ms).toISOString();

test("an email intake that throws is kept and tried again later, not failed: its lease is put off, and nothing is settled or told", async () => {
  // 18 Sep 2026: the deployment's key could send but not read, so the fetch
  // was refused with 401, the job was failed for good, and the email was lost.
  const { ports, calls, logged } = fakes([job("i", "email_ingest", 1), job("j", "email_ingest", 2)], {
    throwOn: new Set(["i", "j"]),
  });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(
    calls.defer,
    [
      ["i", at(5 * MIN), "boom i"],
      ["j", at(30 * MIN), "boom j"],
    ],
    "five minutes after the first try, thirty after the second, with why kept on the row",
  );
  assert.deepEqual(
    [calls.fail, calls.settle, calls.alert],
    [[], [], []],
    "not failed, so nothing to settle and nobody to tell yet",
  );
  assert.ok(logged("warn", "job_deferred"));
  assert.deepEqual(counts, {
    claimed: 2,
    done: 0,
    failed: 0,
    gaveUp: 0,
    deferred: 2,
    lateMs: { email_ingest: 0 },
    replyLateMs: 0,
  });
});

test("the last try of an intake fails it for good and tells the owner how many tries it took", async () => {
  const { ports, calls } = fakes([job("i", "email_ingest", MAX_ATTEMPTS)], { throwOn: new Set(["i"]) });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(calls.defer, []);
  assert.deepEqual(calls.fail, [["i", "boom i"]]);
  assert.deepEqual(
    calls.settle,
    [["i", false]],
    "settled as a failure is: the mailbox says so, and the thread is held",
  );
  assert.match(
    calls.alert[0].body,
    new RegExp(`^It stopped after ${MAX_ATTEMPTS} tries and will not start again on its own`),
  );
  assert.equal(calls.alert[0].subject, "An email could not be taken in");
  assert.deepEqual(counts, { claimed: 1, done: 0, failed: 1, gaveUp: 0, deferred: 0, lateMs: {}, replyLateMs: 0 });
});

test("an intake that could not be kept is not failed either: the claim's own lease brings it back", async () => {
  // A write that failed leaves the claim's ninety-second lease on the row, and
  // a run that lost the row to another has nothing of its own to fail.
  for (const o of [{ deferThrows: new Set(["i"]) }, { deferLost: new Set(["i"]) }]) {
    const { ports, calls, logged } = fakes([job("i", "email_ingest", 1)], { throwOn: new Set(["i"]), ...o });
    const counts = await runTick(ports, OPTS);
    assert.equal(calls.defer.length, 1);
    assert.deepEqual([calls.fail, calls.settle, calls.alert], [[], [], []]);
    assert.ok(o.deferThrows ? logged("error", "job_defer_write_failed") : logged("warn", "job_defer_lost_race"));
    assert.equal(counts.deferred, 1);
  }
});

test("internal work not written to be run again still fails on its first throw", async () => {
  // line_provision is the internal kind with no waits in RETRY_WAITS_MS: its
  // saga reads its own receipts, so a resumed run repeats nothing and a throw
  // is a failure to tell somebody about rather than something to sit out.
  const { ports, calls } = fakes([job("a", "line_provision", 1), job("b", "line_provision", 1)], {
    throwOn: new Set(["a", "b"]),
  });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(calls.defer, []);
  assert.deepEqual(
    calls.fail.map(([id]) => id),
    ["a", "b"],
  );
  assert.match(calls.alert[0].body, /^It stopped and will not start again on its own\./, "a first try says no count");
  assert.equal(counts.failed, 2);
});

test("a kind this runner does not know is kept for the runner that will, its claim given back, not failed", async () => {
  // A newer deploy wrote it (its kind arrived with its handler, caller and CHECK) and this edge is the older one: it
  // waits five minutes and is looked at again, so the edge and the database may deploy in either order.
  const now = Date.parse("2026-01-01T01:00:00Z");
  const { ports, calls, logged } = fakes([job("a", "made_up")], { unknown: new Set(["a"]), clock: () => now });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(calls.deferUnknown, [["a", at(now + UNKNOWN_KIND_WAIT_MS), "unknown job kind made_up"]]);
  assert.deepEqual([calls.complete, calls.fail, calls.settle, calls.alert, calls.defer], [[], [], [], [], []]);
  assert.ok(logged("warn", "job_kind_unknown_deferred"));
  assert.equal(counts.deferred, 1);
  assert.equal(counts.failed, 0);
});

test("a kind nobody has known for a day is failed as never run, and never recorded done", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z") + UNKNOWN_KIND_GIVE_UP_MS;
  const { ports, calls } = fakes([job("a", "made_up")], { unknown: new Set(["a"]), clock: () => now });
  await runTick(ports, OPTS);
  assert.deepEqual(calls.deferUnknown, []);
  assert.deepEqual(calls.complete, []);
  assert.deepEqual(calls.fail, [["a", "unknown job kind made_up"]]);
  assert.deepEqual(calls.settle, [["a", true]], "nothing ran, so that much is certain");
  assert.equal(calls.alert[0].subject, "Something in the background did not finish");
  assert.equal(calls.alert[0].route, "today", "a job with no words of its own says so on Today");
});

test("a wait is drawn a little longer at random, on the tick as in the table", async () => {
  const { ports, calls } = fakes([job("i", "email_ingest", 1)], { throwOn: new Set(["i"]), random: () => 1 });
  await runTick(ports, OPTS);
  assert.deepEqual(calls.defer, [["i", at(6 * MIN), "boom i"]], "five minutes, and a fifth more at the longest draw");
});

/* ------------------------------------------------- slots side by side (0018, step 4) */

/**
 * A ledger whose jobs run until the case lets each go, so what is claimed while others run can be read. `trail` says
 * each claim and each run in the order they happened.
 */
function held(jobs) {
  const w = fakes(jobs);
  const release = new Map();
  // Claimed and not yet finished: "claimed" must mean "started", so this may never pass the slots.
  let open = 0;
  let most = 0;
  const claim = w.ports.claim;
  w.ports.claim = async (lease) => {
    const j = await claim(lease);
    if (j) most = Math.max(most, (open += 1));
    return j;
  };
  w.ports.dispatch = async (j) => {
    w.trail.push(`run ${j.id}`);
    w.calls.dispatch.push([j.id]);
    await new Promise((resolve) => release.set(j.id, resolve));
    open -= 1;
    return "done";
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { ...w, release, settle, most: () => most };
}

test("with three slots three jobs run side by side, and a fourth is claimed only when a slot is free to run it", async () => {
  const w = held([job("a"), job("b"), job("c"), job("d"), job("e")]);
  const tick = runTick(w.ports, { ...OPTS, slots: 3 });
  await w.settle();
  assert.deepEqual(
    w.calls.dispatch.map(([id]) => id),
    ["a", "b", "c"],
    "three running at once, no more",
  );
  assert.deepEqual(
    w.queue.map((j) => j.id),
    ["d", "e"],
    "d and e were never claimed while every slot was busy",
  );
  w.release.get("b")();
  await w.settle();
  assert.deepEqual(
    w.queue.map((j) => j.id),
    ["e"],
    "b's slot, free, claimed d and runs it",
  );
  for (const id of ["a", "c", "d"]) w.release.get(id)();
  await w.settle();
  w.release.get("e")();
  const counts = await tick;
  assert.equal(w.most(), 3, "never more claimed and unfinished than there are slots: each claim was a run starting");
  assert.deepEqual(w.calls.complete.sort(), ["a", "b", "c", "d", "e"]);
  assert.equal(counts.claimed, 5);
  assert.equal(counts.done, 5);
});

test("a second slot opens only when a claim found work: a quiet ledger is asked once", async () => {
  const { ports, calls } = fakes([]);
  const counts = await runTick(ports, { ...OPTS, slots: 3 });
  assert.deepEqual(calls.claim, [90]);
  assert.equal(counts.claimed, 0);
});

test("a claim that throws in one slot stops every slot claiming; the jobs already running finish, and the tick throws", async () => {
  const w = held([job("a"), job("b")]);
  let asked = 0;
  const claim = w.ports.claim;
  w.ports.claim = async (lease) => {
    asked += 1;
    if (asked === 3) throw new Error("claim_due_jobs: connection refused");
    return claim(lease);
  };
  const tick = runTick(w.ports, { ...OPTS, slots: 3 });
  await w.settle();
  w.release.get("a")();
  w.release.get("b")();
  await assert.rejects(tick, /connection refused/, "the route answers 503, which sweep_health() reads");
  assert.deepEqual(w.calls.complete.sort(), ["a", "b"], "what was running was recorded, not abandoned");
  assert.equal(asked, 3, "and nothing more was claimed after the ledger failed");
});

test("a throw that gets out of a job's own bookkeeping stops the slots, and the jobs beside it are still recorded before the tick throws", async () => {
  // complete fails and the log that would say so is down too: runOne cannot catch what it cannot report.
  const w = held([job("a"), job("b"), job("c")]);
  w.ports.complete = async (j) => {
    w.calls.complete.push(j.id);
    if (j.id === "a") throw new Error("connection reset");
    return true;
  };
  w.ports.log.error = () => {
    throw new Error("the log is down");
  };
  const tick = runTick(w.ports, { ...OPTS, slots: 2 });
  const outcome = tick.then(
    () => "returned",
    (e) => e.message,
  );
  await w.settle();
  w.release.get("a")();
  await w.settle();
  w.release.get("b")();
  assert.equal(
    await outcome,
    "the log is down",
    "the tick throws, so the route answers 503 and sweep_health() sees it",
  );
  assert.deepEqual(w.calls.complete.sort(), ["a", "b"], "b, which was running beside it, was recorded");
  assert.deepEqual(
    w.queue.map((j) => j.id),
    ["c"],
    "and nothing more was claimed once it threw",
  );
});

test("a send whose run died is never run a second time", async () => {
  for (const kind of ["outbound_send", "broadcast_send"]) {
    const { ports, calls } = fakes([job("a", kind, 2)]);
    const counts = await runTick(ports, OPTS);
    assert.deepEqual(calls.dispatch, [], `${kind}: running it again could reach a real person twice`);
    assert.deepEqual(calls.fail, [["a", RUN_INTERRUPTED]]);
    assert.deepEqual(calls.settle, [["a", false]]);
    assert.deepEqual(
      [calls.alert[0].kind, calls.alert[0].subject, calls.alert[0].route],
      kind === "outbound_send"
        ? ["job_failed", "A message may not have been sent", "inbox"]
        : ["job_failed", "A broadcast stopped partway", "broadcasts"],
      "the one alert that IS a job not finishing says so itself, in the owner's words, on the work's own page",
    );
    assert.equal(counts.gaveUp, 1);
  }
  const { ports, calls } = fakes([job("a", "outbound_send", 2)]);
  await runTick(ports, OPTS);
  assert.match(
    calls.alert[0].body,
    /may or may not have reached the customer/,
    "the owner is told to look before sending again",
  );
});

test("internal work whose run died is run again, and given up past the cap", async () => {
  const { ports, calls } = fakes([job("a", "line_provision", 2), job("b", "line_provision", MAX_ATTEMPTS + 1)]);
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(
    calls.dispatch.map(([id]) => id),
    ["a"],
  );
  assert.deepEqual(calls.complete, ["a"]);
  assert.deepEqual(calls.fail, [["b", RUN_INTERRUPTED]]);
  assert.equal(counts.done, 1);
  assert.equal(counts.gaveUp, 1);
});

test("claiming stops when the window closes, and every handler gets the same yield deadline", async () => {
  // now(): the start, then one reading before each claim.
  const readings = [1_000, 1_000, 5_000, 21_001];
  const { ports, calls, queue } = fakes([job("a"), job("b"), job("c")], {
    clock: (i) => readings[Math.min(i, readings.length - 1)],
  });
  await runTick(ports, OPTS);
  assert.deepEqual(
    calls.dispatch,
    [
      ["a", 46_000],
      ["b", 46_000],
    ],
    "start + yieldAtMs, for everything this tick runs",
  );
  assert.deepEqual(
    queue.map((j) => j.id),
    ["c"],
    "c was never claimed, so it is simply still due for the next tick",
  );
});

test("a completion that matched no row is logged, not thrown, and not counted done", async () => {
  const { ports, calls, logged } = fakes([job("a")], { completeLost: new Set(["a"]) });
  const counts = await runTick(ports, OPTS);
  assert.equal(counts.done, 0);
  assert.ok(logged("warn", "job_complete_lost_race"));
  assert.deepEqual(calls.fail, []);
});

test("a completion that could not be written is not reported as the job failing", async () => {
  // The work was done. Calling it failed would send an owner a false alarm and
  // mark a delivered message failed; the lease brings the row back instead.
  const { ports, calls, logged } = fakes([job("a", "outbound_send")], { completeThrows: new Set(["a"]) });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(calls.fail, []);
  assert.deepEqual(calls.alert, []);
  assert.ok(logged("error", "job_complete_write_failed"));
  assert.deepEqual(counts, {
    claimed: 1,
    done: 0,
    failed: 0,
    gaveUp: 0,
    deferred: 0,
    lateMs: { outbound_send: 0 },
    replyLateMs: 0,
  });
});

test("a failure another run already recorded is not settled or announced twice", async () => {
  const { ports, calls, logged } = fakes([job("a")], { throwOn: new Set(["a"]), failLost: new Set(["a"]) });
  await runTick(ports, OPTS);
  assert.deepEqual(calls.settle, []);
  assert.deepEqual(calls.alert, []);
  assert.ok(logged("warn", "job_fail_lost_race"));
});

test("an alert that cannot be sent does not un-record the failure", async () => {
  const { ports, calls, logged } = fakes([job("a")], { throwOn: new Set(["a"]), alertThrows: true });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(
    calls.fail.map(([id]) => id),
    ["a"],
  );
  assert.equal(counts.failed, 1);
  assert.ok(logged("error", "job_alert_failed"));
});

test("a settlement that could not be written reaches the owner as exactly that", async () => {
  const { ports, calls, logged } = fakes([job("a", "outbound_send")], {
    throwOn: new Set(["a"]),
    settled: [{ what: "message", changed: false, error: "permission denied" }],
  });
  await runTick(ports, OPTS);
  assert.match(calls.alert[0].body, /could not be updated \(permission denied\)/);
  assert.ok(logged("error", "job_settle_failed"));
});

test("a settlement that throws still leaves the owner told", async () => {
  const { ports, calls, logged } = fakes([job("a", "outbound_send")], { throwOn: new Set(["a"]) });
  ports.settle = async () => {
    throw new Error("socket hang up");
  };
  await runTick(ports, OPTS);
  assert.match(calls.alert[0].body, /could not be checked/);
  assert.ok(logged("error", "job_settle_failed"));
});

test("a ledger that cannot be claimed from ends the tick with the error", async () => {
  const { ports } = fakes([]);
  ports.claim = async () => {
    throw new Error("claim_due_jobs: connection refused");
  };
  await assert.rejects(runTick(ports, OPTS), /connection refused/, "the route answers 503, which sweep_health() reads");
});

/* ------------------------------------------------ how late a claim came (0018) */

test("how late each kind's first claim came is kept at its worst; a claim before its due time waited none, and a row claimed again waited none either", async () => {
  // The clock reads ten seconds past midnight throughout. Two replies were due
  // ten and five seconds earlier; a broadcast batch is not due for another ten;
  // a line setup comes back for its second try (a lease that ran out), which is
  // a run that died, not a wait in the queue.
  const at = (id, kind, dueAt, attempts = 1) => ({ ...job(id, kind, attempts), due_at: dueAt });
  const { ports } = fakes(
    [
      at("a", "outbound_send", "2026-01-01T00:00:00Z"),
      at("b", "outbound_send", "2026-01-01T00:00:05Z"),
      at("c", "broadcast_send", "2026-01-01T00:00:20Z"),
      at("d", "line_provision", "2025-12-31T23:00:00Z", 2),
    ],
    { clock: () => Date.parse("2026-01-01T00:00:10Z") },
  );
  const counts = await runTick(ports, OPTS);
  assert.equal(counts.claimed, 4, "all four were claimed and run");
  assert.deepEqual(counts.lateMs, { outbound_send: 10_000, broadcast_send: 0 });
});

test("the reply lane's worst wait is read from the claimed row's lane, apart from its kind's: a late cold email is not a late reply", async () => {
  // outbound_send is both. The database says which (jobs.lane, 00286): 0 a reply, 2 bulk. A row with no lane (a
  // database that has not applied it yet, or a kind the lane case does not name) counts for its kind alone.
  const at = (id, kind, dueAt, lane) => ({ ...job(id, kind, 1), due_at: dueAt, lane });
  const { ports } = fakes(
    [
      at("a", "outbound_send", "2026-01-01T00:00:08Z", 0),
      at("b", "outbound_send", "2026-01-01T00:00:00Z", 2),
      at("c", "email_ingest", "2026-01-01T00:00:03Z", 0),
      at("d", "push_receipts", "2025-12-31T00:00:00Z", 2),
      at("e", "push_send", "2025-12-31T00:00:00Z", undefined),
    ],
    { clock: () => Date.parse("2026-01-01T00:00:10Z") },
  );
  const counts = await runTick(ports, OPTS);
  assert.equal(counts.replyLateMs, 7_000, "the email that waited seven seconds, not the cold email that waited ten");
  assert.equal(counts.lateMs.outbound_send, 10_000, "the kind's number is still the worse of the two");
});

test("a due time that cannot be read is no wait at all, rather than a line that says NaN", async () => {
  const { ports } = fakes([{ ...job("a", "outbound_send"), due_at: "not a time" }], {
    clock: () => Date.parse("2026-01-01T00:00:10Z"),
  });
  const counts = await runTick(ports, OPTS);
  assert.deepEqual(counts.lateMs, {});
});

test("the heartbeat's line carries each kind's worst wait as a field of its own, since a log line is flat", () => {
  assert.deepEqual(lateFields({ outbound_send: 10_000, broadcast_send: 0 }), {
    late_ms_outbound_send: 10_000,
    late_ms_broadcast_send: 0,
  });
  assert.deepEqual(lateFields({}), {});
});
