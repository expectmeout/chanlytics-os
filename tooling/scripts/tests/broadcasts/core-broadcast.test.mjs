/**
 * The broadcast batch, run: every branch of one batch through fakes that log
 * their calls. Until now this was the one handler no test executed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { sendBroadcastBatch, BROADCAST_STALL_RETRY_MS, BROADCAST_STALLS_MAX } = await importSrc(
  "packages/core/src/messages/broadcast.ts",
);
const { BROADCAST_CHUNK, BROADCAST_THROTTLE_WAITS_MS, HELD_REASONS, OUTCOME_UNKNOWN } =
  await import("@chanlytics/contracts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const WRITES = new Set(["fail", "startSending", "mark", "deliver", "scheduleNext", "finish", "alert", "sleep"]);

const broadcast = (over = {}) => ({
  id: "b1",
  state: "scheduled",
  name: "Spring offer",
  template_name: "month_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }],
  recipient_count: 2,
  playbook_id: null,
  audience: null,
  ...over,
});
const approved = {
  meta_status: "approved",
  body_preview: "Hi {{1}}, a spring offer from {{2}}.",
  category: "marketing",
};
const contacts = {
  k1: { id: "k1", phone_e164: "+13475550101", erased_at: null, display_name: "Ada Lovelace", wa_profile_name: null },
  k2: { id: "k2", phone_e164: "+13475550102", erased_at: null, display_name: null, wa_profile_name: "Bo" },
};

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    broadcast: broadcast(),
    workspacePaused: false,
    template: approved,
    // UTC, where noon is inside the day's sending hours on any machine the suite runs on.
    facts: { businessName: "Marisa's", bookingLink: "https://book.example/m", timezone: "UTC" },
    batch: [
      { contact_id: "k1", facts: null },
      { contact_id: "k2", facts: null },
    ],
    contacts: (ids) => new Map(ids.filter((id) => contacts[id]).map((id) => [id, contacts[id]])),
    target: (phone) => ({ conversationId: `c-${phone.slice(-2)}` }),
    alreadySent: () => new Map(),
    remaining: 0,
    state: "sending",
    tally: { sent: 2, held: 0 },
    wireUnavailable: null,
    now: () => NOW,
    // No jitter unless a case asks for it: a wait reads as the table's own.
    random: () => 0,
    fail: undefined,
    startSending: true,
    mark: undefined,
    deliver: (d) => ({ outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }),
    scheduleNext: undefined,
    finish: undefined,
    alert: undefined,
    sleep: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now" || name === "random") {
      ports[name] = answer;
      continue;
    }
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return {
    ports,
    log,
    ops: () => log.map((l) => l[0]),
    marks: () => log.filter((l) => l[0] === "mark").map((l) => [l[2], l[3].state, l[3].reason ?? null]),
  };
}
const cmd = (over = {}) => ({ tenantId: "t1", broadcastId: "b1", deadline: NOW + 60_000, ...over });

test("a broadcast that is gone, or in any state but scheduled or sending, sends nothing and touches nothing", async () => {
  const gone = fakes({ broadcast: null });
  await sendBroadcastBatch(gone.ports, cmd());
  assert.deepEqual(gone.ops(), []);
  for (const state of ["pending_approval", "sent", "canceled", "failed"]) {
    const f = fakes({ broadcast: broadcast({ state }) });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(f.ops(), [], state);
  }
});

test("a paused workspace fails the run with its reason and tells the owner, before the template is even read", async () => {
  const { ports, log, ops } = fakes({ workspacePaused: true, template: new Error("must not be read") });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["fail", "alert"]);
  assert.deepEqual(log[0], ["fail", "b1", "paused"]);
  assert.match(log[1][1].body, /paused until billing resumes, so nothing went out/);
});

test("a template Meta withdrew fails the broadcast before a single send; a scheduled run is marked sending first", async () => {
  const { ports, log, ops } = fakes({ template: { ...approved, meta_status: "rejected" } });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["startSending", "fail", "alert"]);
  assert.deepEqual(log[1], ["fail", "b1", "template_not_approved"]);
  assert.match(log[2][1].body, /no longer approved by WhatsApp/);
  const missing = fakes({ template: null });
  await sendBroadcastBatch(missing.ports, cmd());
  assert.deepEqual(missing.ops(), ["startSending", "fail", "alert"]);
  const sending = fakes({ broadcast: broadcast({ state: "sending" }), template: null });
  await sendBroadcastBatch(sending.ports, cmd());
  assert.deepEqual(sending.ops(), ["fail", "alert"], "already sending: not marked again");
});

test("each person goes through the door with the template's purpose, proactive, as a person's words, with their own words in the slots; the row says what happened", async () => {
  const { ports, log, marks } = fakes();
  await sendBroadcastBatch(ports, cmd());
  const sends = log.filter((l) => l[0] === "deliver").map((l) => l[1]);
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0], {
    tenantId: "t1",
    conversationId: "c-01",
    contactId: "k1",
    to: "+13475550101",
    channel: "whatsapp",
    sender: "human",
    kind: "broadcast",
    purpose: "marketing",
    proactive: true,
    body: "Hi Ada, a spring offer from Marisa's.",
    template: { name: "month_offer", language: "en_US", params: ["Ada", "Marisa's"] },
    meta: { source: "broadcast", broadcast_id: "b1", broadcast_name: "Spring offer" },
    holdIfNotTaken: true,
  });
  assert.equal(
    sends[1].body,
    "Hi Bo, a spring offer from Marisa's.",
    "the profile name when no display name is on file",
  );
  // Each person is CLAIMED before the door and settled after it: the first mark
  // is what their row would have been left saying had the run been killed.
  assert.deepEqual(marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  assert.equal(log.filter((l) => l[0] === "mark")[1][3].message_id, "m-k1");
  assert.equal(log.filter((l) => l[0] === "sleep").length, 1, "a breath between two people, none after the last");
  const utility = fakes({
    template: { ...approved, category: "utility" },
    broadcast: broadcast({ playbook_id: "p1", audience: { label: "Win-back" } }),
  });
  await sendBroadcastBatch(utility.ports, cmd());
  const d = utility.log.find((l) => l[0] === "deliver")[1];
  assert.equal(d.purpose, "conversational", "Meta's category decides which yes is needed");
  assert.deepEqual(
    d.meta,
    {
      source: "broadcast",
      broadcast_id: "b1",
      broadcast_name: "Spring offer",
      playbook_id: "p1",
      playbook_name: "Win-back",
    },
    "a run's message names its playbook",
  );
});

test("held with their reason: a row that is gone, erased, no number, no thread and an unfillable slot are held, and none of them reach the door", async () => {
  const rows = {
    k1: { ...contacts.k1, erased_at: "2026-09-01T00:00:00Z" },
    k2: { ...contacts.k2, phone_e164: null },
    k3: contacts.k1 && { ...contacts.k1, id: "k3", phone_e164: "+13475550103" },
    k4: { ...contacts.k1, id: "k4", phone_e164: "+13475550104" },
  };
  // A first name nobody has on file reads "there", so the slot no row can fill is a visit run's word.
  const { ports, log, marks } = fakes({
    broadcast: broadcast({ params: [{ kind: "first_name" }, { kind: "visit_when" }] }),
    batch: [
      { contact_id: "k1", facts: null },
      { contact_id: "k2", facts: null },
      { contact_id: "k3", facts: null },
      { contact_id: "k4", facts: {} },
      { contact_id: "k9", facts: null },
    ],
    contacts: (ids) => new Map(ids.filter((id) => rows[id]).map((id) => [id, rows[id]])),
    target: (phone) => (phone.endsWith("03") ? null : { conversationId: "c" }),
    remaining: 1,
    state: "sending",
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks(), [
    ["k1", "skipped", "erased"],
    ["k2", "skipped", "no_phone"],
    ["k3", "skipped", "no_thread"],
    ["k4", "skipped", "missing_value"],
    ["k9", "skipped", "erased"],
  ]);
  assert.equal(log.filter((l) => l[0] === "deliver").length, 0);
  assert.deepEqual(
    log.at(-1),
    ["scheduleNext", "b1"],
    "and the rest follow in the next batch, at once: this one made progress",
  );
});

test("a cancel that landed between the read and the claim: the row did not change, so nothing is sent and nothing is said", async () => {
  const { ports, ops } = fakes({ startSending: false });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["startSending"]);
});

test("one person's failure is never the batch's: a thread that could not be read leaves them queued, and the rest are reached", async () => {
  const thread = fakes({
    target: (phone) => {
      if (phone.endsWith("01")) throw new Error("PostgREST blip");
      return { conversationId: "c" };
    },
    remaining: 1,
  });
  await sendBroadcastBatch(thread.ports, cmd());
  assert.deepEqual(
    thread.marks(),
    [
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "sent", null],
    ],
    "k1 stays queued for the next batch and is never claimed; k2 is claimed and sent",
  );
  assert.deepEqual(thread.log.at(-1), ["scheduleNext", "b1"], "progress was made, so the rest follow at once");
});

test("a batch whose people could not be read leaves them all queued and waits before the next: trying again this second would spin the ledger", async () => {
  const { ports, log } = fakes({
    contacts: () => {
      throw new Error("PostgREST down");
    },
    remaining: 2,
  });
  await sendBroadcastBatch(ports, cmd());
  assert.ok(!log.some((l) => l[0] === "mark" || l[0] === "deliver"), "nobody is guessed about");
  assert.deepEqual(log.at(-1), ["scheduleNext", "b1", new Date(NOW + BROADCAST_STALL_RETRY_MS), { stalls: 1 }]);
});

test("a batch whose prior sends could not be read is left queued as well: 'could not check' is not 'never sent'", async () => {
  const { ports, log } = fakes({
    alreadySent: () => {
      throw new Error("PostgREST down");
    },
    remaining: 2,
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(log.at(-1), ["scheduleNext", "b1", new Date(NOW + BROADCAST_STALL_RETRY_MS), { stalls: 1 }]);
});

test("a wire that could not be BOUND claims nobody: the batch waits whole, still queued, and nobody is told to reconnect a number that may well be connected", async () => {
  // The workspace's credentials could not be READ (Vault, the database). That
  // is not a number that is absent: nobody knows. A claim settles only to sent
  // or skipped (00182), never back to queued, so the question is asked before
  // anyone is claimed, and the whole batch is left for the next tick the way a
  // batch whose people could not be read is.
  for (const state of ["scheduled", "sending"]) {
    const { ports, log, ops } = fakes({
      broadcast: broadcast({ state }),
      wireUnavailable: "vault unavailable",
      remaining: 2,
      template: new Error("must not be read"),
    });
    await sendBroadcastBatch(ports, cmd());
    assert.deepEqual(ops(), ["scheduleNext"], `${state}: nobody claimed, nothing failed, nobody told`);
    assert.deepEqual(log[0], ["scheduleNext", "b1", new Date(NOW + BROADCAST_STALL_RETRY_MS), { stalls: 1 }]);
  }
  // A number that IS absent is the door's to answer, as it always was (the test below).
  const absent = fakes({
    wireUnavailable: null,
    deliver: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: "no_credentials", messageId: null },
    remaining: 1,
  });
  await sendBroadcastBatch(absent.ports, cmd());
  assert.deepEqual(absent.ops(), ["startSending", "mark", "deliver", "mark", "fail", "alert"]);
  assert.match(absent.log.at(-1)[1].body, /Reconnect the number/);
});

test("a wire that is down stops the run at the first person it cannot reach, says why, and burns nobody else as refused", async () => {
  const { ports, log, marks, ops } = fakes({
    deliver: {
      outcome: "failed",
      reason: "no_credentials",
      status: 503,
      errorBody: "no_credentials",
      messageId: "m-k1",
    },
    remaining: 1,
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "failed", "send_failed"],
  ]);
  assert.deepEqual(
    ops(),
    ["startSending", "mark", "deliver", "mark", "fail", "alert"],
    "one person claimed and through the door, then the run stops",
  );
  assert.deepEqual(log[4], ["fail", "b1", "wire_unavailable"]);
  assert.match(log[5][1].body, /the number is not connected/);
  const token = fakes({
    deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "bad token", messageId: "m-k1" },
  });
  await sendBroadcastBatch(token.ports, cmd());
  assert.deepEqual(
    token.log.find((l) => l[0] === "fail"),
    ["fail", "b1", "wire_unavailable"],
    "a provider refusing the credentials is the wire, not the person",
  );
  assert.match(token.log.at(-1)[1].body, /HTTP 401/);
});

test("the door's answer is the row's: refused holds with the door's reason, failed is a failed row with the message it wrote", async () => {
  const { ports, marks } = fakes({
    deliver: (d) =>
      d.contactId === "k1"
        ? { outcome: "refused", reason: "no_marketing_consent", messageId: null }
        : { outcome: "failed", reason: "provider", status: 500, errorBody: "x", messageId: "m-k2" },
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(
    marks(),
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "skipped", "no_marketing_consent"],
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "failed", "send_failed"],
    ],
    "the door's answer overwrites the claim a moment later",
  );
});

test("a person is claimed BEFORE the wire, so a run killed mid-send cannot reach them again", async () => {
  // deliver records a broadcast's message only once the provider has ACCEPTED
  // it. A run killed in that gap used to leave nothing at all: no message row
  // for alreadySent to find, and a recipient row still saying 'queued' -- so
  // the fresh run jobs/settle schedules sent the same template to the same
  // person a second time, which is the one thing a broadcast must never do.
  // A door that throws is the same case, and it stops the batch there: the
  // job's failure hands the people still queued to a fresh run, where a
  // batch that carried on would claim each of them into the same failure.
  const f = fakes({ deliver: new Error("the runner was killed mid-send") });
  await assert.rejects(sendBroadcastBatch(f.ports, cmd()), /killed mid-send/);
  assert.deepEqual(
    f.ops(),
    ["startSending", "mark", "deliver"],
    "the claim is written before the door is even reached, and nobody after them is claimed",
  );
  assert.deepEqual(
    f.marks(),
    [["k1", "failed", OUTCOME_UNKNOWN]],
    "their row says a run was mid-send here and nobody knows how it went; k2 stays queued",
  );
  // Not 'queued', so no later batch picks them up -- and not a raw enum on the
  // broadcast's own page either.
  assert.equal(HELD_REASONS[OUTCOME_UNKNOWN], "a run that did not finish");
});

test("the deadline: at least one person, no new send after it, and the rest carried by the next batch", async () => {
  let t = NOW;
  const { ports, log, ops } = fakes({
    now: () => t,
    sleep: () => {
      t += 120_000;
    },
    remaining: 1,
  });
  await sendBroadcastBatch(ports, cmd({ deadline: NOW + 60_000 }));
  assert.equal(log.filter((l) => l[0] === "deliver").length, 1, "one send, then the clock had run out");
  assert.equal(ops().at(-1), "scheduleNext");
});

test("people still queued: the next batch is scheduled, unless a cancel landed meanwhile; none left: the broadcast is finished, the tally recorded and the owner told", async () => {
  const more = fakes({ remaining: 3, state: "sending" });
  await sendBroadcastBatch(more.ports, cmd());
  assert.deepEqual(more.log.at(-1), ["scheduleNext", "b1"]);
  const canceled = fakes({ remaining: 3, state: "canceled" });
  await sendBroadcastBatch(canceled.ports, cmd());
  assert.ok(
    !canceled.ops().includes("scheduleNext") && !canceled.ops().includes("finish"),
    "a cancel during the batch stops here",
  );
  const { ports, log } = fakes({ remaining: 0, tally: { sent: 1, held: 1 } });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(log.at(-2), ["finish", "b1", { sent: 1, held: 1 }]);
  const news = log.at(-1)[1];
  // REGRESSION: kept as "job_failed", a finished broadcast was counted into
  // Today's "N jobs did not finish", in warn amber, above everything else.
  assert.equal(news.kind, "broadcast_sent", "a broadcast that went out is not a job that did not finish");
  assert.deepEqual([news.route, news.about], ["broadcasts", { type: "broadcast", id: "b1" }]);
  assert.equal(news.subject, "Broadcast “Spring offer” sent");
  assert.match(
    news.body,
    /^1 of 2 people got it; 1 held back \(no recorded yes, asked to stop, no number, a person had the thread, or a run that did not finish\)\. Replies land in the Inbox\.$/,
    "as many as it reached, of how many",
  );
  assert.equal(BROADCAST_CHUNK, 25);
});

test("every way a broadcast can stop says it stopped, and none of them says a job did not finish", async () => {
  const paused = fakes({ workspacePaused: true });
  await sendBroadcastBatch(paused.ports, cmd());
  const withdrawn = fakes({ template: { ...approved, meta_status: "rejected" } });
  await sendBroadcastBatch(withdrawn.ports, cmd());
  const down = fakes({
    deliver: {
      outcome: "failed",
      reason: "no_credentials",
      status: 503,
      errorBody: "no_credentials",
      messageId: "m-k1",
    },
    remaining: 1,
  });
  await sendBroadcastBatch(down.ports, cmd());
  for (const f of [paused, withdrawn, down]) {
    const n = f.log.at(-1)[1];
    assert.equal(n.kind, "broadcast_stopped");
    assert.equal(n.route, "broadcasts");
    assert.deepEqual(n.about, { type: "broadcast", id: "b1" });
  }
});

test("a resumed batch reads the message a dying run left rather than sending it again", async () => {
  // A run that died between the wire and its bookkeeping left k1 a message row
  // (deliver writes it after the provider accepts) and a queued recipient row.
  // The fresh run jobs/settle schedules finds the row: k1 is marked sent with
  // that message, nothing goes to them twice, and k2 -- who has no row -- is
  // sent as normal.
  const EARLIER = "2026-09-11T11:00:00Z";
  const f = fakes({
    alreadySent: (id, ids) =>
      new Map(id === "b1" && ids.includes("k1") ? [["k1", { id: "m-earlier", sentAt: EARLIER }]] : []),
  });
  await sendBroadcastBatch(f.ports, cmd());
  const sends = f.log.filter((l) => l[0] === "deliver").map((l) => l[1].contactId);
  assert.deepEqual(sends, ["k2"], "k1 is not sent again");
  assert.deepEqual(
    f.marks(),
    [
      ["k1", "sent", null],
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "sent", null],
    ],
    "k1 never reaches the wire, so k1 is never claimed",
  );
  // An hour ago, not now: the broadcast's page lists its people by sent_at, and
  // a resumed run stamping the moment it noticed reorders the whole list.
  assert.deepEqual(
    f.log.find((l) => l[0] === "mark" && l[2] === "k1")[3],
    { state: "sent", message_id: "m-earlier", sent_at: EARLIER },
    "the row it already had, at the time it actually left",
  );
  assert.deepEqual(
    f.ops().filter((o) => o === "finish"),
    ["finish"],
    "and the run completes",
  );
});

test("a proposal follow-up's send (0006): the link each person's run froze fills its slot, the purpose is the template's own, and no link holds the person", async () => {
  const follow = broadcast({
    name: "Proposal follow-up",
    template_name: "proposal_follow_up",
    params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }],
    playbook_id: "pb1",
  });
  const words = {
    meta_status: "approved",
    body_preview: "Hi {{1}}, the proposal from {{2}}: {{3}}.",
    category: "utility",
  };
  const batch = [
    { contact_id: "k1", facts: { proposal_link: "https://docs.example.com/proposal/1" } },
    { contact_id: "k2", facts: null },
  ];
  const utility = fakes({ broadcast: follow, template: words, batch });
  await sendBroadcastBatch(utility.ports, cmd());
  const sent = utility.log.filter((l) => l[0] === "deliver").map((l) => l[1]);
  assert.deepEqual(
    sent.map((d) => [d.contactId, d.purpose, d.template.params]),
    [["k1", "conversational", ["Ada", "Marisa's", "https://docs.example.com/proposal/1"]]],
    "a utility follow-up asks for the yes to hearing from them, with the proposal's own link",
  );
  assert.deepEqual(
    utility.marks().find((m) => m[0] === "k2"),
    ["k2", "skipped", "missing_value"],
    "no link, no bare nudge",
  );
  // Meta filed it as marketing: the send asks for the offers yes, at the door (deliver.ts), whatever the class says.
  const marketing = fakes({ broadcast: follow, template: { ...words, category: "marketing" }, batch: [batch[0]] });
  await sendBroadcastBatch(marketing.ports, cmd());
  assert.deepEqual(
    marketing.log.filter((l) => l[0] === "deliver").map((l) => l[1].purpose),
    ["marketing"],
  );
});

test("a reach-out's run is the reach-out clock's: a broadcast job that reaches one touches nothing, and never ends it as sent", async () => {
  for (const state of ["scheduled", "sending"]) {
    const f = fakes({
      broadcast: broadcast({ state, playbook_id: "p1", audience: { kind: "reach_out", root_id: "p1", step_id: "p1" } }),
    });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(f.ops(), [], state);
  }
});

/* ------------------------------------------------ WhatsApp says "not now" -- */

const WAITS = BROADCAST_THROTTLE_WAITS_MS;
/** The door's answer when Graph refused the send as too many, too fast (channels graphThrottled): nothing was taken. */
const throttled = (d) => ({
  outcome: "failed",
  reason: "provider",
  status: 400,
  errorBody: '{"error":{"code":130429}}',
  messageId: `m-${d.contactId}`,
  throttled: true,
});
const facts = (timezone) => ({ businessName: "Marisa's", bookingLink: null, timezone });
const call = (log, name) => log.find((l) => l[0] === name);

test('WhatsApp\'s "not now" gives the person back to the queue, reaches nobody after them, and the run waits its first wait', async () => {
  const { ports, log, ops, marks } = fakes({
    facts: facts("UTC"),
    deliver: (d) => (d.contactId === "k1" ? throttled(d) : { outcome: "sent", messageId: "m", externalId: "w" }),
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(
    marks(),
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "queued", "throttled"],
    ],
    "claimed before the wire, then released: nothing was taken",
  );
  assert.equal(ops().filter((o) => o === "deliver").length, 1, "the person after them is not sent into the same limit");
  assert.deepEqual(call(log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[0]), { waits: 1 }]);
  assert.ok(!ops().includes("fail") && !ops().includes("finish"), "the run is neither failed nor finished");
});

test("each wait follows the last, a clean batch starts the count again, and past the last wait the run stops and says why", async () => {
  const mid = fakes({ facts: facts("UTC"), deliver: throttled });
  await sendBroadcastBatch(mid.ports, cmd({ waits: 2 }));
  assert.deepEqual(call(mid.log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[2]), { waits: 3 }]);

  const clean = fakes({ facts: facts("UTC"), remaining: 5 });
  await sendBroadcastBatch(clean.ports, cmd({ waits: 3 }));
  assert.deepEqual(call(clean.log, "scheduleNext").slice(1), ["b1"], "the next batch starts now, and from zero");

  const last = fakes({ facts: facts("UTC"), deliver: throttled, tally: { sent: 3, held: 0 } });
  await sendBroadcastBatch(last.ports, cmd({ waits: WAITS.length }));
  assert.ok(!last.ops().includes("scheduleNext"), "nothing more is scheduled");
  assert.deepEqual(call(last.log, "fail").slice(1), ["b1", "throttled"]);
  const alert = call(last.log, "alert")[1];
  assert.equal(alert.kind, "broadcast_stopped");
  assert.equal(alert.subject, "Broadcast “Spring offer” stopped");
  assert.match(
    alert.body,
    /^WhatsApp kept limiting how fast this number may send for about an hour, so the rest was not sent\. 3 people got it\. WhatsApp lifts these limits on its own; send it again later\.$/,
  );
});

test("a wait that would end outside the day's sending hours stops the run rather than send tomorrow what was written for today", async () => {
  // 12:00Z is 21:00 in Tokyo: the next try would fall after 20:59.
  const { ports, log, ops } = fakes({ facts: facts("Asia/Tokyo"), deliver: throttled, tally: { sent: 0, held: 0 } });
  await sendBroadcastBatch(ports, cmd());
  assert.ok(!ops().includes("scheduleNext"));
  assert.deepEqual(call(log, "fail").slice(1), ["b1", "throttled"]);
  assert.match(
    call(log, "alert")[1].body,
    /until the day's sending hours ran out, so the rest was not sent\. Nobody got it\./,
  );
});

test("a release the database refuses (no 00216 yet) still stops the batch and waits: one person keeps the claim, nobody else is burned", async () => {
  const { ports, log, ops } = fakes({
    facts: facts("UTC"),
    deliver: throttled,
    mark: (_id, _contact, patch) => {
      if (patch.state === "queued")
        throw new Error("broadcast_recipients.state is terminal (failed -> queued refused)");
    },
  });
  await sendBroadcastBatch(ports, cmd());
  assert.equal(ops().filter((o) => o === "deliver").length, 1);
  assert.deepEqual(call(log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[0]), { waits: 1 }]);
});

test("a failure that is not a throttle keeps its claim as a failed send and the batch goes on, as before", async () => {
  const { ports, marks } = fakes({
    facts: facts("UTC"),
    deliver: (d) => ({
      outcome: "failed",
      reason: "provider",
      status: 0,
      errorBody: "timeout",
      messageId: `m-${d.contactId}`,
    }),
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "failed", "send_failed"],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "failed", "send_failed"],
  ]);
});

/* --------------------------------------- WhatsApp never reached, and runs that stall (E:0, E:1, 29 Sep) -- */

/** What the door throws when the provider provably did not take the send (core NotTakenError): 0 is no answer at all. */
const notTaken = (status) => () => {
  throw Object.assign(new Error(`deliver: the whatsapp provider did not take it (${status || "no answer"})`), {
    name: "NotTakenError",
    status,
  });
};

test("a send that never reached WhatsApp gives the person back and the run waits, instead of burning the list; the platform is paged", async () => {
  // Before (the scorecard's E:0): every person was marked failed/send_failed and the run finished as "sent".
  const { ports, log, ops, marks } = fakes({
    facts: facts("UTC"),
    deliver: notTaken(0),
    remaining: 2,
    page: undefined,
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(
    marks(),
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "queued", "not_taken"],
    ],
    "claimed before the wire, then given back: nothing left",
  );
  assert.equal(
    ops().filter((o) => o === "deliver").length,
    1,
    "the person after them is not sent into the same outage",
  );
  assert.deepEqual(call(log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[0]), { waits: 1 }]);
  assert.ok(!ops().includes("fail") && !ops().includes("finish") && !ops().includes("alert"), "not failed, not sent");
  const pages = [];
  const paged = fakes({ facts: facts("UTC"), deliver: notTaken(0), remaining: 2 });
  paged.ports.page = async (key, subject) => pages.push([key, subject]);
  await sendBroadcastBatch(paged.ports, cmd());
  assert.deepEqual(pages, [["unreachable:whatsapp", "whatsapp: a broadcast could not reach the provider"]]);
});

test("the door's 429 is WhatsApp's \"not now\": the person goes back as throttled and the run waits as for any throttle", async () => {
  const { ports, log, marks } = fakes({ facts: facts("UTC"), deliver: notTaken(429) });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(marks().at(-1), ["k1", "queued", "throttled"]);
  assert.deepEqual(call(log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[0]), { waits: 1 }]);
});

test("a WhatsApp that stays unreachable past the last wait stops the run and says so, with how many it reached", async () => {
  const { ports, log, ops } = fakes({ facts: facts("UTC"), deliver: notTaken(0), tally: { sent: 4, held: 0 } });
  await sendBroadcastBatch(ports, cmd({ waits: WAITS.length }));
  assert.ok(!ops().includes("scheduleNext"));
  assert.deepEqual(call(log, "fail").slice(1), ["b1", "wire_unavailable"]);
  assert.match(
    call(log, "alert")[1].body,
    /^WhatsApp could not be reached for about an hour, so the rest was not sent\. 4 people got it\. Nothing is wrong with the number; send it again later\.$/,
  );
});

test("a run that reached nobody is not said to be sent: the finish says none of them got it", async () => {
  const { ports, log } = fakes({ remaining: 0, tally: { sent: 0, held: 3 } });
  await sendBroadcastBatch(ports, cmd());
  const news = log.at(-1)[1];
  assert.equal(news.subject, "Broadcast “Spring offer” reached nobody");
  assert.match(news.body, /^None of the 3 people on it got it: each was held back/);
});

test("a run that keeps stalling carries the count, and past the cap it stops and tells the owner instead of waiting for ever", async () => {
  // Before (E:1): a vault out from 7:50 PM to 11 PM re-queued the run every minute, a hundred and ninety times.
  const pages = [];
  const next = fakes({ wireUnavailable: "vault unavailable", remaining: 2 });
  next.ports.page = async (_key, _subject, body) => pages.push(body);
  await sendBroadcastBatch(next.ports, cmd({ stalls: 7, waits: 2 }));
  assert.deepEqual(
    next.log[0],
    ["scheduleNext", "b1", new Date(NOW + BROADCAST_STALL_RETRY_MS), { waits: 2, stalls: 8 }],
    "the eighth stall in a row, and the waits it had, carried",
  );

  const cap = fakes({ wireUnavailable: "vault unavailable", remaining: 2, tally: { sent: 5, held: 0 } });
  cap.ports.page = async (_key, _subject, body) => pages.push(body);
  await sendBroadcastBatch(cap.ports, cmd({ stalls: BROADCAST_STALLS_MAX }));
  assert.match(pages[0], /^Broadcast b1 waits, everyone still queued/, "a run that will try again says it waits");
  assert.match(
    pages[1],
    /^Broadcast b1 stopped after waiting the most it may, everyone still queued/,
    "and one that will not says so",
  );
  assert.deepEqual(cap.ops(), ["fail", "alert"], "nothing more is scheduled");
  assert.deepEqual(call(cap.log, "fail").slice(1), ["b1", "stalled"]);
  const alert = call(cap.log, "alert")[1];
  assert.equal(alert.kind, "broadcast_stopped");
  assert.match(
    alert.body,
    /^This workspace's WhatsApp credentials could not be read for about half an hour, so the rest was not sent\. 5 people got it\. /,
  );

  // The people's read failing past the cap says so too, and a tally that cannot be read still leaves the owner told.
  const people = fakes({
    contacts: () => {
      throw new Error("PostgREST down");
    },
    remaining: 2,
    tally: new Error("PostgREST down"),
  });
  await sendBroadcastBatch(people.ports, cmd({ stalls: BROADCAST_STALLS_MAX }));
  assert.deepEqual(call(people.log, "fail").slice(1), ["b1", "stalled"]);
  assert.match(
    call(people.log, "alert")[1].body,
    /^The people on it could not be read for about half an hour, so the rest was not sent\. Nothing is wrong/,
  );
});

test("a run that waited and wakes outside the day's sending hours stops there, rather than send tonight what was written for today", async () => {
  // 12:00Z is 21:00 in Tokyo. A stall or a wait brought the run here; nobody is sent to.
  for (const carry of [{ waits: 1 }, { stalls: 3 }]) {
    const { ports, log, ops } = fakes({ facts: facts("Asia/Tokyo"), tally: { sent: 2, held: 0 } });
    await sendBroadcastBatch(ports, cmd(carry));
    assert.ok(!ops().includes("deliver") && !ops().includes("scheduleNext"), JSON.stringify(carry));
    assert.deepEqual(call(log, "fail").slice(1), ["b1", "after_hours"]);
    assert.match(
      call(log, "alert")[1].body,
      /day's sending hours ran out.*2 people got it\. Send it again tomorrow\.$/,
    );
  }
  // A run that never waited goes on as it always did: the hours are the approval's to keep.
  const fresh = fakes({ facts: facts("Asia/Tokyo"), remaining: 0 });
  await sendBroadcastBatch(fresh.ports, cmd());
  assert.ok(fresh.ops().includes("deliver"));
});

test("a wait is drawn a little longer at random, so the runs one outage held do not all wake in the same heartbeat", async () => {
  const { ports, log } = fakes({ facts: facts("UTC"), deliver: throttled, random: () => 1 });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(call(log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[0] * 1.2), { waits: 1 }]);
  const stalled = fakes({ wireUnavailable: "vault", remaining: 1, random: () => 0.5 });
  await sendBroadcastBatch(stalled.ports, cmd());
  assert.deepEqual(stalled.log[0][2], new Date(NOW + BROADCAST_STALL_RETRY_MS * 1.1));
});
