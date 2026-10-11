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
const { BROADCAST_CHUNK, BROADCAST_THROTTLE_WAITS_MS, HELD_REASONS, OUTCOME_UNKNOWN, mayMessageFor } =
  await import("@chanlytics/contracts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
// An email is written before it is sent, and withdrawn when the provider did not take it (step 3): both are writes.
const WRITES = new Set([
  "fail",
  "startSending",
  "mark",
  "deliver",
  "scheduleNext",
  "finish",
  "alert",
  "sleep",
  "queueEmail",
  "withdrawEmail",
]);

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

/** A template row as the message port answers it (db messageVersionRowsOf): every column the batch and contracts read, of the name and language asked. */
const rowOf = (channel, name, language, over = {}) => ({
  id: `${channel}-${name}`,
  channel,
  name,
  language,
  meta_status: "approved",
  category: null,
  variables: [],
  hidden_at: null,
  title: null,
  source: channel === "whatsapp" ? "meta" : "chanlytics",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});
/** The message port over the versions a message holds, each channel's facts made a whole row of the message asked for; `asked` records each read. */
const rowsOf =
  (versions, asked = []) =>
  (name, language) => {
    asked.push([name, language]);
    return Object.entries(versions).map(([channel, v]) => rowOf(channel, name, language, v));
  };

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    broadcast: broadcast(),
    workspacePaused: false,
    message: rowsOf({ whatsapp: approved }),
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
    // Offers by email are not closed on this runtime unless a case says why they are (the campaigns domain unverified).
    offersClosed: null,
    // Nor unknown: the campaigns domain was asked about, unless a case says it could not be (offersUnread).
    offersUnread: null,
    now: () => NOW,
    // No jitter unless a case asks for it: a wait reads as the table's own.
    random: () => 0,
    fail: undefined,
    startSending: true,
    // The claim answers whether it took the person (a compare-and-set): true unless a case says another run did.
    mark: true,
    // Nobody on the run goes another way than the channel asked about, unless a case says so: a hold on one channel then
    // holds that channel's people alone (WhatsApp's template not approved; the workspace's offers and news by email).
    byOtherChannels: false,
    // Nobody on the run was skipped for a hold of the workspace's on email, unless a case says which (contracts EMAIL_HOLDS).
    heldForEmail: [],
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
    // The calls of one write, by name (step 3: the email rows it writes and withdraws).
    of: (name) => log.filter((l) => l[0] === name),
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
  const { ports, log, ops } = fakes({
    workspacePaused: true,
    message: new Error("must not be read"),
    tally: { sent: 0, held: 0 },
  });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["fail", "alert"]);
  assert.deepEqual(log[0], ["fail", "b1", "paused"]);
  assert.match(log[1][1].body, /paused until billing resumes, so nothing went out/);
  // A pause between two batches stops what is left, and says how many it had reached: nothing went out is not true then.
  const later = fakes({ workspacePaused: true, message: new Error("must not be read"), tally: { sent: 3, held: 0 } });
  await sendBroadcastBatch(later.ports, cmd());
  assert.deepEqual(later.log[0], ["fail", "b1", "paused"]);
  assert.match(
    later.log[1][1].body,
    /paused until billing resumes, so the rest was not sent\. 3 people got it\. Resume from Settings/,
  );
});

test("a template Meta withdrew fails the broadcast before a single send; a scheduled run is marked sending first", async () => {
  const { ports, log, ops } = fakes({ message: rowsOf({ whatsapp: { ...approved, meta_status: "rejected" } }) });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(ops(), ["startSending", "fail", "alert"]);
  assert.deepEqual(log[1], ["fail", "b1", "template_not_approved"]);
  assert.equal(
    log[2][1].body,
    "WhatsApp refused this message's WhatsApp version. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
  const missing = fakes({ message: [] });
  await sendBroadcastBatch(missing.ports, cmd());
  assert.deepEqual(missing.ops(), ["startSending", "fail", "alert"]);
  const sending = fakes({ broadcast: broadcast({ state: "sending" }), message: [] });
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
    // A person with no visit or proposal kept for them is sent the business's own news (decision D1).
    about: "ours",
    // A broadcast names no moment: nothing for the door to pass the handover pause for (decision D4).
    trigger: null,
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
    message: rowsOf({ whatsapp: { ...approved, category: "utility" } }),
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
      message: new Error("must not be read"),
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
  assert.equal(
    news.body,
    "1 of 2 people got it; 1 held back (no recorded yes, asked to stop, no number, a person had the thread, or a run that did not finish). Replies land in the Inbox.",
    "as many as it reached, of how many, and what a person is held for; a hold on email is not named on a run nobody was held on for one",
  );
  // A run that skipped someone for a hold of the workspace's on email names that hold, and only that one.
  const held = fakes({ remaining: 0, tally: { sent: 1, held: 1 }, heldForEmail: ["email_offers_paused"] });
  await sendBroadcastBatch(held.ports, cmd());
  assert.equal(
    held.log.at(-1)[1].body,
    "1 of 2 people got it; 1 held back (no recorded yes, asked to stop, no number, a person had the thread, offers and news by email are paused, or a run that did not finish). Replies land in the Inbox.",
  );
  assert.ok(held.ops().indexOf("finish") >= 0 && held.log.at(-1)[0] === "alert");
  // Read before the run is closed: a read that fails leaves the run open for the job's next try, the owner's news not lost.
  const unread = fakes({ remaining: 0, tally: { sent: 1, held: 1 }, heldForEmail: new Error("PostgREST down") });
  await assert.rejects(sendBroadcastBatch(unread.ports, cmd()), /PostgREST down/);
  assert.ok(!unread.ops().includes("finish") && !unread.ops().includes("alert"));
  // Nobody held: nothing to ask.
  const none = fakes({ remaining: 0, tally: { sent: 2, held: 0 }, heldForEmail: new Error("never asked") });
  await sendBroadcastBatch(none.ports, cmd());
  assert.ok(none.ops().includes("finish"));
  assert.equal(BROADCAST_CHUNK, 25);
});

test("every way a broadcast can stop says it stopped, and none of them says a job did not finish", async () => {
  const paused = fakes({ workspacePaused: true });
  await sendBroadcastBatch(paused.ports, cmd());
  const withdrawn = fakes({ message: rowsOf({ whatsapp: { ...approved, meta_status: "rejected" } }) });
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
  const utility = fakes({ broadcast: follow, message: rowsOf({ whatsapp: words }), batch });
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
  const marketing = fakes({
    broadcast: follow,
    message: rowsOf({ whatsapp: { ...words, category: "marketing" } }),
    batch: [batch[0]],
  });
  await sendBroadcastBatch(marketing.ports, cmd());
  assert.deepEqual(
    marketing.log.filter((l) => l[0] === "deliver").map((l) => l[1].purpose),
    ["marketing"],
  );
});

test("a review ask's send: the link the workspace's Google listing keeps (00394) fills its slot for each person, and a workspace with none holds them, never a bare ask", async () => {
  const ask = broadcast({ params: [{ kind: "first_name" }, { kind: "review_link" }] });
  const words = { meta_status: "approved", body_preview: "Thanks, {{1}}! A review helps: {{2}}", category: "utility" };
  const link = "https://example.com/review/harbor-studio";
  const facts = (reviewLink) => ({ businessName: "Marisa's", bookingLink: null, reviewLink, timezone: "UTC" });
  const filled = fakes({ broadcast: ask, message: rowsOf({ whatsapp: words }), facts: facts(link) });
  await sendBroadcastBatch(filled.ports, cmd());
  assert.deepEqual(
    filled.log.filter((l) => l[0] === "deliver").map((l) => [l[1].contactId, l[1].template.params]),
    [
      ["k1", ["Ada", link]],
      ["k2", ["Bo", link]],
    ],
  );
  const none = fakes({ broadcast: ask, message: rowsOf({ whatsapp: words }), facts: facts(null) });
  await sendBroadcastBatch(none.ports, cmd());
  assert.equal(none.log.filter((l) => l[0] === "deliver").length, 0);
  assert.deepEqual(none.marks(), [
    ["k1", "skipped", "missing_value"],
    ["k2", "skipped", "missing_value"],
  ]);
});

test("a playbook's run asks the door for the stricter of its moment's class and its message's category, as its enrolment did: a no to offers said after a Win-back enrolled someone holds them at the wire", async () => {
  // The run enrolled by the stricter of the two (contracts enrolPurpose), but the door was handed the message's own
  // category alone: a re-engage or offer moment carrying a utility message went to someone who had since said "no more
  // offers", because a yes to hear from the business was all the door asked for.
  const utility = rowsOf({ whatsapp: { ...approved, category: "utility" } });
  const marketing = rowsOf({ whatsapp: { ...approved, category: "marketing" } });
  const run = (trigger) =>
    broadcast({ playbook_id: "p1", audience: { kind: "playbook", id: "p1", label: "Win-back", trigger } });
  // Ada said yes to hearing from them, and then no to offers; the door's answer is the one predicate's.
  const ada = { ...contacts.k1, consent: "opted_in", dnc: false, marketing_consent: "opted_out" };
  const send = async (b, message) => {
    const f = fakes({
      broadcast: b,
      message,
      batch: [{ contact_id: "k1", facts: null }],
      contacts: () => new Map([["k1", ada]]),
      deliver: (d) => {
        const may = mayMessageFor(ada, d.purpose, { proactive: d.proactive, channel: d.channel, about: d.about });
        return may.ok
          ? { outcome: "sent", messageId: "m-k1", externalId: "wamid" }
          : { outcome: "refused", reason: may.reason, messageId: null };
      },
    });
    await sendBroadcastBatch(f.ports, cmd());
    return [f.log.filter((l) => l[0] === "deliver").map((l) => l[1].purpose), f.marks().at(-1)];
  };
  assert.deepEqual(
    await send(run("quiet_30"), utility),
    [["marketing"], ["k1", "skipped", "no_marketing_consent"]],
    "REGRESSION: a Win-back's utility message asked only the yes to hear from them, and went",
  );
  assert.deepEqual(
    await send(run("visit_tomorrow"), utility),
    [["conversational"], ["k1", "sent", null]],
    "a reminder of their own visit asks the yes to hear from them, as it always did",
  );
  assert.deepEqual(
    await send(run("visit_tomorrow"), marketing),
    [["marketing"], ["k1", "skipped", "no_marketing_consent"]],
    "an offer is an offer, whatever the moment",
  );
  assert.deepEqual(
    await send(broadcast(), utility),
    [["conversational"], ["k1", "sent", null]],
    "a broadcast names no moment: its message decides, as before",
  );
  assert.deepEqual(
    await send(run("a_moment_nobody_knows"), utility),
    [["marketing"], ["k1", "skipped", "no_marketing_consent"]],
    "a moment nobody knows fails closed",
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
  // 20:58 in UTC, inside the hours: the third wait (five minutes) would end at 21:03, after 20:59.
  const { ports, log, ops } = fakes({
    facts: facts("UTC"),
    now: () => Date.parse("2026-09-11T20:58:00Z"),
    deliver: throttled,
    tally: { sent: 0, held: 0 },
  });
  await sendBroadcastBatch(ports, cmd({ waits: 2 }));
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
      return true; // the claim answers that it took the person (a compare-and-set)
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
  // Nor is it KEPT as sent: the kind is what the bell draws (a green tick for broadcast_sent) and what Today counts as
  // "1 broadcast finished". A run that reached nobody did not go out.
  assert.equal(
    news.kind,
    "broadcast_stopped",
    "REGRESSION: reached nobody under the kind of a broadcast that was sent",
  );
  const some = fakes({ remaining: 0, tally: { sent: 2, held: 1 } });
  await sendBroadcastBatch(some.ports, cmd());
  assert.deepEqual(
    [some.log.at(-1)[1].kind, some.log.at(-1)[1].subject],
    ["broadcast_sent", "Broadcast “Spring offer” sent"],
    "one that reached anyone is a broadcast that finished",
  );
});

test("a playbook's run that stops is never told to send it again: every stop says what becomes of it, as the workspace's own stops do", async () => {
  // A playbook's run was made for today, one run to a local day: Run now answers that it already ran, and nothing on any
  // page sends a run again. The stops for the workspace said so (stoppedRunFix); the wire's, the limit's and the day's
  // hours' told its owner to "send it again later".
  const NEXT =
    "It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice.";
  const moment = () =>
    broadcast({
      playbook_id: "p1",
      audience: { kind: "playbook", id: "p1", label: "Win-back", trigger: "everyone_monthly" },
    });
  // The wire stayed unreachable past the last wait.
  const wire = fakes({ broadcast: moment(), facts: facts("UTC"), deliver: notTaken(0), tally: { sent: 4, held: 0 } });
  await sendBroadcastBatch(wire.ports, cmd({ waits: WAITS.length }));
  assert.equal(
    call(wire.log, "alert")[1].body,
    `WhatsApp could not be reached for about an hour, so the rest was not sent. 4 people got it. Nothing is wrong with the number. ${NEXT}`,
  );
  // The same stop of a broadcast the owner made keeps its words (the test above): theirs is sent again.
  const { broadcastFailureFix, playbookRunNext } = await import("@chanlytics/contracts");
  assert.equal(
    playbookRunNext({ playbook_id: null, trigger: null }, "tomorrow"),
    null,
    "a broadcast has no tomorrow's run",
  );
  assert.equal(playbookRunNext({ playbook_id: "p1", trigger: "everyone_monthly" }, "tomorrow"), NEXT);
  assert.match(
    playbookRunNext({ playbook_id: "p1", trigger: "visit_tomorrow" }, "tomorrow"),
    /a reminder belongs to its day, so the people it did not reach will not be sent it later\.$/,
  );
  // The run's own page, for every failure a run can stop with: how many got it, what there is to do, what becomes of it.
  const { BROADCAST_FAILURES } = await import("@chanlytics/contracts");
  // A stop that may outlast tomorrow and is nobody's to end promises no tomorrow: the month's limit met tomorrow's run too.
  const LATER =
    "It does not run again today; the next run that can go reaches the people this one did not, and nobody who got it is sent it twice.";
  assert.equal(playbookRunNext({ playbook_id: "p1", trigger: "everyone_monthly" }, "when_it_can"), LATER);
  const outlasts = new Set(["provider_limit", "template_not_approved"]);
  for (const code of BROADCAST_FAILURES) {
    for (const reached of [0, 3]) {
      const fix = broadcastFailureFix(code, reached, { playbook_id: "p1", trigger: "everyone_monthly" });
      assert.ok(fix.endsWith(outlasts.has(code) ? LATER : NEXT), `${code} (${reached}): ${fix}`);
      assert.doesNotMatch(fix, /send it again|sending it again|try again/i, `${code} (${reached}): ${fix}`);
    }
  }
  assert.equal(
    broadcastFailureFix("throttled:email", 3, { playbook_id: "p1", trigger: "everyone_monthly" }),
    `The first 3 got it. The mail provider lifts these limits on its own. ${NEXT}`,
  );
  assert.equal(
    broadcastFailureFix("after_hours", 0, { playbook_id: "p1", trigger: "everyone_monthly" }),
    `Nobody got it. ${NEXT}`,
  );
  // A broadcast's words are as they were.
  assert.equal(
    broadcastFailureFix("after_hours", 0, { playbook_id: null, trigger: null }),
    "Nobody got it. Send it again tomorrow, inside the day's sending hours.",
  );
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
  assert.deepEqual(
    call(people.log, "fail").slice(1),
    ["b1", "people_unreadable"],
    "its own code: unreadable people are no channel's credentials",
  );
  assert.match(
    call(people.log, "alert")[1].body,
    /^The people on it could not be read for about half an hour, so the rest was not sent\. Nothing is wrong with your channels; send it again later\.$/,
  );
  // A wire's credentials say which wire, in the stored code and in the owner's words, as a failure that names it does.
  const mailbox = fakes({
    batch: [{ contact_id: "k1", facts: null, channel: "email" }],
    wireUnavailable: (c) => (c === "email" ? "mailbox unreadable" : null),
    remaining: 1,
    tally: { sent: 0, held: 0 },
  });
  await sendBroadcastBatch(mailbox.ports, cmd({ stalls: BROADCAST_STALLS_MAX }));
  assert.deepEqual(call(mailbox.log, "fail").slice(1), ["b1", "stalled:email"]);
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
});

/** A run on its way, at the moment the last of the day's sending hours has just ended (20:59 is the last minute). */
const AFTER_NINE = Date.parse("2026-09-11T21:05:00Z");
const BEFORE_NINE = Date.parse("2026-09-11T20:58:00Z");

test("the day's sending hours are asked at the head of every batch: a run still going at 21:00 waits for nine the next morning, and nobody it reached is reached again; a visit's run, whose words name the day, ends; one inside them goes on", async () => {
  // A clean run (no wait, no stall) that has begun, a second batch of a long one, found at 21:05: the rest waits for the
  // open moment, as the pages say sends do. Ending it told the owner to send it again, which reaches the whole list.
  const crossed = fakes({
    broadcast: broadcast({ state: "sending" }),
    facts: facts("UTC"),
    now: () => AFTER_NINE,
    remaining: 40,
    tally: { sent: 25, held: 0 },
  });
  await sendBroadcastBatch(crossed.ports, cmd());
  assert.deepEqual(crossed.ops(), ["scheduleNext"], "nobody sent to, nothing failed, nobody told");
  assert.deepEqual(call(crossed.log, "scheduleNext").slice(1), ["b1", new Date("2026-09-12T09:00:00Z")]);
  // A visit's run ends instead, begun or not: at nine its words ("tomorrow at 2:00 PM") would be a day wrong, which is why a
  // late approval of one is refused (contracts runDayPassed). The owner is told.
  for (const state of ["sending", "scheduled"]) {
    const visit = fakes({
      broadcast: broadcast({ state, audience: { kind: "everyone", trigger: "visit_tomorrow" } }),
      facts: facts("UTC"),
      now: () => AFTER_NINE,
      tally: { sent: state === "sending" ? 25 : 0, held: 0 },
    });
    await sendBroadcastBatch(visit.ports, cmd());
    assert.ok(!visit.ops().includes("deliver") && !visit.ops().includes("scheduleNext"), `${state}: nobody is sent to`);
    assert.deepEqual(call(visit.log, "fail").slice(1), ["b1", "after_hours"], state);
    assert.match(call(visit.log, "alert")[1].body, /^The day's sending hours ran out before it was done/, state);
  }
  // The same run a minute and a half earlier is inside the hours, and goes on as it always did.
  const inside = fakes({
    broadcast: broadcast({ state: "sending" }),
    facts: facts("UTC"),
    now: () => BEFORE_NINE,
    remaining: 40,
  });
  await sendBroadcastBatch(inside.ports, cmd({ deadline: BEFORE_NINE + 60_000 }));
  assert.equal(inside.ops().filter((o) => o === "deliver").length, 2);
  assert.ok(!inside.ops().includes("fail"));
  assert.deepEqual(call(inside.log, "scheduleNext").slice(1), ["b1"], "and the next batch is scheduled as ever");
  // The zone is the business's: 21:05 in UTC is 17:05 in New York, inside the hours there.
  const newYork = fakes({
    broadcast: broadcast({ state: "sending" }),
    facts: facts("America/New_York"),
    now: () => AFTER_NINE,
  });
  await sendBroadcastBatch(newYork.ports, cmd({ deadline: AFTER_NINE + 60_000 }));
  assert.ok(newYork.ops().includes("deliver") && !newYork.ops().includes("fail"));
  // A run that has sent nothing yet (still scheduled) waits the same way, as a send asked for at night is placed at nine
  // when it is made. It is not failed, and nobody is claimed.
  const unstarted = fakes({ broadcast: broadcast({ state: "scheduled" }), facts: facts("UTC"), now: () => AFTER_NINE });
  await sendBroadcastBatch(unstarted.ports, cmd());
  assert.deepEqual(
    unstarted.ops(),
    ["scheduleNext"],
    "nothing else is written: not started, not failed, nobody claimed",
  );
  assert.deepEqual(call(unstarted.log, "scheduleNext").slice(1), ["b1", new Date("2026-09-12T09:00:00Z")]);
  // A run that waited and wakes outside the hours ends even before it has sent (the existing rule, above), whatever its state.
  const waitedAndLate = fakes({
    broadcast: broadcast({ state: "scheduled" }),
    facts: facts("UTC"),
    now: () => AFTER_NINE,
    tally: { sent: 0, held: 0 },
  });
  await sendBroadcastBatch(waitedAndLate.ports, cmd({ waits: 1 }));
  assert.deepEqual(call(waitedAndLate.log, "fail").slice(1), ["b1", "after_hours"]);
});

test("a wait is drawn a little longer at random, so the runs one outage held do not all wake in the same heartbeat", async () => {
  const { ports, log } = fakes({ facts: facts("UTC"), deliver: throttled, random: () => 1 });
  await sendBroadcastBatch(ports, cmd());
  assert.deepEqual(call(log, "scheduleNext").slice(1), ["b1", new Date(NOW + WAITS[0] * 1.2), { waits: 1 }]);
  const stalled = fakes({ wireUnavailable: "vault", remaining: 1, random: () => 0.5 });
  await sendBroadcastBatch(stalled.ports, cmd());
  assert.deepEqual(stalled.log[0][2], new Date(NOW + BROADCAST_STALL_RETRY_MS * 1.1));
});

/* ------------------------- One message, every channel (step 3): a batch goes by each person's channel -- */

/**
 * What a visit's run says of itself when it stops (contracts playbookRunNext): the runs below are a visit reminder's, a
 * playbook's, which nobody sends again. Each said "send it again" after its cause.
 */
const VISIT_RUN_NEXT =
  "It does not run again today, and a reminder belongs to its day, so the people it did not reach will not be sent it later.";

/** A message about their visit: Meta's row, and the text and email versions beside it, each filling the same slots. */
const VISIT_WORDS = "Hi {{1}}, your visit is {{2}}.";
const visitRows = {
  whatsapp: { meta_status: "approved", body_preview: VISIT_WORDS, category: "utility" },
  sms: {
    meta_status: "approved",
    body_preview: VISIT_WORDS,
    category: "utility",
    components: [{ type: "BODY", text: VISIT_WORDS }],
  },
  email: {
    meta_status: "approved",
    body_preview: VISIT_WORDS,
    category: "utility",
    components: [
      { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
      { type: "BODY", text: VISIT_WORDS },
    ],
  },
};
/** The message port over its versions by channel, remembering each read it was asked for: a batch reads the message once. */
const versionsOf = (asked = [], rows = visitRows) => rowsOf(rows, asked);
const reachable = {
  k1: {
    id: "k1",
    phone_e164: "+13475550101",
    email: "ada@example.com",
    erased_at: null,
    display_name: "Ada Lovelace",
    wa_profile_name: null,
  },
  k2: { id: "k2", phone_e164: "+13475550102", email: null, erased_at: null, display_name: null, wa_profile_name: "Bo" },
  k3: {
    id: "k3",
    phone_e164: null,
    email: "cy@example.com",
    erased_at: null,
    display_name: "Cy Twombly",
    wa_profile_name: null,
  },
};
const VISIT = { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" };
const reminder = (over = {}) =>
  broadcast({
    name: "Visit reminder · 2026-09-11",
    template_name: "visit_reminder",
    params: [{ kind: "first_name" }, { kind: "visit_when" }],
    playbook_id: "p1",
    // A playbook run's audience as run-playbook writes it: the playbook, its moment, its name.
    audience: { kind: "playbook", id: "p1", label: "Visit reminder", trigger: "visit_tomorrow" },
    ...over,
  });
const on = (channel, contact_id = "k1", facts = VISIT) => ({ contact_id, facts, channel });
const visitFacts = { businessName: "Marisa's", bookingLink: null, timezone: "UTC", address: "12 Main St, Springfield" };
/** The request the adapter freezes, as these fakes build it from what core hands the port. */
const frozen = (i) => ({
  from: '"Marisa\'s" <marisa@mail.example.com>',
  to: [i.to],
  reply_to: ["r+tok@mail.example.com"],
  subject: i.subject,
  text: `${i.body}\n\n${i.footer}`,
  html: `<p>${i.body}</p>`,
  headers: {},
  tags: [{ name: "cl_message", value: i.messageId }],
  idempotency_key: i.messageId,
});
const world = (over = {}) => {
  const asked = [];
  return {
    asked,
    f: fakes({
      broadcast: reminder(),
      message: versionsOf(asked),
      facts: visitFacts,
      contacts: (ids) => new Map(ids.filter((id) => reachable[id]).map((id) => [id, reachable[id]])),
      targetOfContact: (id) => ({ conversationId: `cv-${id}` }),
      emailRequest: frozen,
      // The link the adapter seals for this person and this email (an offer's foot and headers carry it).
      unsubscribeUrl: ({ messageId, contactId }) => `https://app.example.com/u/${contactId}-${messageId}`,
      queueEmail: { status: "queued" },
      withdrawEmail: undefined,
      monthSent: 0,
      ...over,
    }),
  };
};
const sendsOf = (f) => f.log.filter((l) => l[0] === "deliver").map((l) => l[1]);

test("a text goes on the text version's words, the slots filled, with the STOP line, by the person's number; the version is read once", async () => {
  const { f, asked } = world({ batch: [on("sms"), on("sms", "k2")] });
  await sendBroadcastBatch(f.ports, cmd());
  const [first, second] = sendsOf(f);
  assert.deepEqual(first, {
    tenantId: "t1",
    conversationId: "c-01",
    contactId: "k1",
    to: "+13475550101",
    channel: "sms",
    sender: "human",
    kind: "broadcast",
    purpose: "conversational",
    proactive: true,
    // The run kept their visit (facts.visit_when): the message is about something of theirs (decision D1).
    about: "theirs",
    // The moment the run was made for, which the door asks whether it passes the thread's 24-hour pause (decision D4).
    trigger: "visit_tomorrow",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.\nReply STOP to opt out",
    holdIfNotTaken: true,
    meta: {
      source: "broadcast",
      broadcast_id: "b1",
      broadcast_name: "Visit reminder · 2026-09-11",
      playbook_id: "p1",
      playbook_name: "Visit reminder",
    },
  });
  assert.equal(second.body, "Hi Bo, your visit is tomorrow at 2:00 PM.\nReply STOP to opt out");
  assert.deepEqual(
    asked,
    [["visit_reminder", "en_US"]],
    "the message is read once for the batch: Meta's row for the purpose, and the text's version for both",
  );
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  const es = world({ broadcast: reminder({ template_language: "es" }), batch: [on("sms")] });
  await sendBroadcastBatch(es.f.ports, cmd());
  assert.match(
    sendsOf(es.f)[0].body,
    /\nResponde STOP para darte de baja$/,
    "the STOP line is in the version's language",
  );
});

test("an email is written queued first, frozen from the version's subject and body, with a foot, and then goes through the door by the row's id", async () => {
  const { f, asked } = world({ batch: [on("email")] });
  const requests = [];
  f.ports.emailRequest = async (i) => {
    requests.push(i);
    return frozen(i);
  };
  await sendBroadcastBatch(f.ports, cmd());
  // The row is now written AFTER the claim (a claim that is lost or fails leaves no queued row behind), so the claim leads.
  assert.deepEqual(
    f.ops(),
    ["startSending", "mark", "queueEmail", "deliver", "mark", "finish", "alert"],
    "the claim, then the row: the door sends only from a row its request was frozen for; then the door, the verdict",
  );
  const [request] = requests;
  assert.match(
    request.messageId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "derived, so a resume meets its row",
  );
  assert.deepEqual(request, {
    messageId: request.messageId,
    to: "ada@example.com",
    subject: "Your visit, Ada",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.",
    // The foot now says how to stop these emails (they carry no unsubscribe link).
    footer:
      "You're getting this because of your appointment with Marisa's.\nReply STOP to stop these emails.\nMarisa's · 12 Main St, Springfield",
  });
  const queued = f.of("queueEmail")[0][1];
  assert.deepEqual(queued, {
    id: request.messageId,
    conversationId: "cv-k1",
    contactId: "k1",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.",
    request: frozen(request),
    meta: {
      source: "broadcast",
      broadcast_id: "b1",
      broadcast_name: "Visit reminder · 2026-09-11",
      playbook_id: "p1",
      playbook_name: "Visit reminder",
    },
  });
  const [sent] = sendsOf(f);
  assert.deepEqual(sent, {
    tenantId: "t1",
    conversationId: "cv-k1",
    contactId: "k1",
    to: "ada@example.com",
    channel: "email",
    sender: "human",
    kind: "broadcast",
    purpose: "conversational",
    proactive: true,
    about: "theirs",
    trigger: "visit_tomorrow",
    body: "Hi Ada, your visit is tomorrow at 2:00 PM.",
    messageId: request.messageId,
    email: frozen(request),
    holdIfNotTaken: true,
    meta: queued.meta,
  });
  assert.deepEqual(asked, [["visit_reminder", "en_US"]], "the message is read once for the batch");
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
  assert.equal(f.log.filter((l) => l[0] === "mark")[1][3].message_id, "m-k1");
  // The id is the run's, the person's and how long the run has waited: the same on a resume, a fresh one after a wait.
  const again = world({ batch: [on("email")] });
  const ids = [];
  again.f.ports.emailRequest = async (i) => (ids.push(i.messageId), frozen(i));
  await sendBroadcastBatch(again.f.ports, cmd());
  await sendBroadcastBatch(again.f.ports, cmd({ waits: 1 }));
  await sendBroadcastBatch(again.f.ports, cmd({ stalls: 2 }));
  assert.equal(ids[0], request.messageId, "the same run and person: the same row");
  assert.equal(new Set(ids).size, 3, "a wait or a stall in between is a fresh row");
});

test("an email's foot says why they hear from the business and from whom: the visit, the proposal, or that they have been in touch; the address only when the Business record has one", async () => {
  const footers = async (facts, over = {}) => {
    // Their own first name alone fills the slots: the foot is what is looked at.
    const { f } = world({
      batch: [on("email", "k1", facts)],
      broadcast: reminder({ params: [{ kind: "first_name" }] }),
      ...over,
    });
    const seen = [];
    f.ports.emailRequest = async (i) => (seen.push(i.footer), frozen(i));
    await sendBroadcastBatch(f.ports, cmd());
    return seen;
  };
  // Each foot now carries the line that says how to stop these emails, after the reason and before the address.
  assert.deepEqual(
    await footers({ proposal_link: "https://docs.example.com/p/1" }, { facts: { ...visitFacts, address: null } }),
    ["You're getting this about your proposal from Marisa's.\nReply STOP to stop these emails."],
  );
  assert.deepEqual(await footers(null, { facts: { ...visitFacts, address: "  " } }), [
    "You're getting this because you've been in touch with Marisa's.\nReply STOP to stop these emails.",
  ]);
  assert.deepEqual(await footers(VISIT), [
    "You're getting this because of your appointment with Marisa's.\nReply STOP to stop these emails.\nMarisa's · 12 Main St, Springfield",
  ]);
});

test("the door is told what each message is about, from the run's moment as its enrolment read it (decision D1): a visit's or a follow-up's run is theirs, a broadcast and any other moment the business's own news", async () => {
  const aboutOf = async (audience, batch) => {
    // Their first name alone fills the slots: the run's moment is what is looked at, not what the person's row kept.
    const { f } = world({ batch, broadcast: reminder({ params: [{ kind: "first_name" }], audience }) });
    await sendBroadcastBatch(f.ports, cmd());
    return sendsOf(f).map((d) => [d.contactId, d.channel, d.about]);
  };
  const run = (trigger) => ({ kind: "playbook", id: "p1", label: "A moment", trigger });
  // A visit's run: everyone on it, whatever their row kept, on every channel.
  assert.deepEqual(await aboutOf(run("visit_tomorrow"), [on("email", "k1"), on("whatsapp", "k2", null)]), [
    ["k1", "email", "theirs"],
    ["k2", "whatsapp", "theirs"],
  ]);
  assert.deepEqual(await aboutOf(run("visited"), [on("email", "k1", null)]), [["k1", "email", "theirs"]]);
  // A follow-up's run is about the proposal their deal waits on, a link kept or not (a deal is theirs either way).
  assert.deepEqual(await aboutOf(run("proposal_waiting"), [on("email", "k1", null)]), [["k1", "email", "theirs"]]);
  // Any other moment, and a broadcast (no moment at all), is the business's news, though the row kept a visit.
  assert.deepEqual(await aboutOf(run("everyone_monthly"), [on("email", "k1")]), [["k1", "email", "ours"]]);
  assert.deepEqual(await aboutOf({ kind: "everyone", id: null, label: "Everyone" }, [on("email", "k1")]), [
    ["k1", "email", "ours"],
  ]);
});

test("nowhere to send is held with its reason, on the person's own channel: a text with no number, an email with no address; none of them reach the door or the row", async () => {
  const { f } = world({
    batch: [on("sms", "k3"), on("email", "k2"), on("whatsapp", "k3"), on("email")],
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    f.marks().filter((m) => m[1] === "skipped"),
    [
      ["k3", "skipped", "no_phone"],
      ["k2", "skipped", "no_address"],
      ["k3", "skipped", "no_phone"],
    ],
  );
  assert.equal(f.of("queueEmail").length, 1, "only the person with an address is written to");
  assert.deepEqual(
    sendsOf(f).map((d) => [d.contactId, d.channel]),
    [["k1", "email"]],
  );
});

test("the month's allowance is read once a batch per channel, counted as the batch sends, and a person past it is held on their channel -- never moved", async () => {
  // A broadcast, which the month counts (a visit's message that offers nothing is not held by it: heldByAllowance).
  const counted = reminder({ playbook_id: null, audience: { kind: "everyone", id: null, label: "Everyone" } });
  const text = world({ batch: [on("sms"), on("sms", "k2"), on("whatsapp")], monthSent: 499, broadcast: counted });
  const asked = [];
  const monthSent = text.f.ports.monthSent;
  text.f.ports.monthSent = async (channel) => (asked.push(channel), monthSent(channel));
  await sendBroadcastBatch(text.f.ports, cmd());
  assert.deepEqual(
    text.f.marks().filter((m) => m[1] !== "failed"),
    [
      ["k1", "sent", null],
      ["k2", "skipped", "month_allowance"],
      ["k1", "sent", null],
    ],
    "the 500th text goes, the 501st is held; WhatsApp has no allowance of Chanlytics' (Meta's tier is its limit)",
  );
  assert.deepEqual(asked, ["sms"], "read once, for the first person who needed it");
  assert.deepEqual(
    sendsOf(text.f).map((d) => d.channel),
    ["sms", "whatsapp"],
    "nobody is rerouted to WhatsApp",
  );
  const email = world({ batch: [on("email")], monthSent: 2000, broadcast: counted });
  await sendBroadcastBatch(email.f.ports, cmd());
  assert.deepEqual(email.f.marks(), [["k1", "skipped", "month_allowance"]]);
  assert.equal(email.f.of("queueEmail").length, 0, "no row is written for a send that will not go");
  const wa = world({ batch: [on("whatsapp")], monthSent: new Error("never asked of WhatsApp"), broadcast: counted });
  await sendBroadcastBatch(wa.f.ports, cmd());
  assert.deepEqual(wa.f.marks().at(-1), ["k1", "sent", null]);
});

test("a visit's message is never held by the month: the reminder and the check after a visit go with the month used up, and the month is not even asked", async () => {
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const run = reminder({ audience: { kind: "playbook", id: "p1", label: "Visit reminder", trigger } });
    const text = world({
      broadcast: run,
      batch: [on("sms"), on("sms", "k2"), on("email", "k3")],
      monthSent: new Error("a visit's message never asks the month"),
    });
    await sendBroadcastBatch(text.f.ports, cmd());
    assert.deepEqual(
      sendsOf(text.f).map((d) => [d.contactId, d.channel]),
      [
        ["k1", "sms"],
        ["k2", "sms"],
        ["k3", "email"],
      ],
      `${trigger}: all three go, whatever the month holds`,
    );
    assert.equal(
      text.f.marks().some((m) => m[2] === "month_allowance"),
      false,
      trigger,
    );
  }
  // Every other moment is held at the allowance as it always was, and so is a run that kept no moment (made before it did).
  for (const audience of [
    { kind: "playbook", id: "p1", label: "Proposal follow-up", trigger: "proposal_waiting" },
    { kind: "playbook", id: "p1", label: "Win-back", trigger: "quiet_30" },
    { label: "Visit reminder" },
  ]) {
    const w = world({ broadcast: reminder({ audience }), batch: [on("sms")], monthSent: 500 });
    await sendBroadcastBatch(w.f.ports, cmd());
    assert.deepEqual(
      w.f.marks().filter((m) => m[1] !== "failed"),
      [["k1", "skipped", "month_allowance"]],
      JSON.stringify(audience),
    );
  }
});

test("a version the message no longer has on a channel holds the person there (no channel it can go by); an unsendable email never reaches the door", async () => {
  const noEmail = world({ batch: [on("email")], message: versionsOf([], { whatsapp: visitRows.whatsapp }) });
  await sendBroadcastBatch(noEmail.f.ports, cmd());
  assert.deepEqual(noEmail.f.marks(), [["k1", "skipped", "no_channel"]]);
  // No mailbox here, or words no email may carry: the adapter freezes nothing.
  const noMailbox = world({ batch: [on("email")], emailRequest: null });
  await sendBroadcastBatch(noMailbox.f.ports, cmd());
  assert.deepEqual(noMailbox.f.marks(), [["k1", "skipped", "no_channel"]]);
  assert.equal(noMailbox.f.of("queueEmail").length, 0);
  // A row already there that is no longer queued is not sent again.
  const spent = world({ batch: [on("email")], queueEmail: { status: "canceled" } });
  await sendBroadcastBatch(spent.f.ports, cmd());
  // The row is read after the claim now, so the person is claimed and then settled to skipped.
  assert.deepEqual(spent.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "skipped", "send_failed"],
  ]);
  assert.equal(sendsOf(spent.f).length, 0);
  // A person whose thread is gone: held, by their number or by the person.
  const gone = world({ batch: [on("email"), on("sms")], targetOfContact: null, target: null });
  await sendBroadcastBatch(gone.f.ports, cmd());
  assert.deepEqual(gone.f.marks(), [
    ["k1", "skipped", "no_thread"],
    ["k1", "skipped", "no_thread"],
  ]);
});

test("the door's refusals are the person's row on any channel: a line not approved, an address that stopped, a change of address", async () => {
  for (const [channel, reason] of [
    ["sms", "sms_line_not_active"],
    ["email", "email_suppressed"],
    ["email", "recipient_changed"],
  ]) {
    const { f } = world({ batch: [on(channel)], deliver: { outcome: "refused", reason, messageId: null } });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(f.marks(), [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "skipped", reason],
    ]);
    assert.ok(reason in HELD_REASONS, `${reason} has its words on the run's page`);
  }
});

test("a send the provider did not take goes back and the run waits, in the channel's own words; an email's queued row is withdrawn so nothing is left lost", async () => {
  const notTaken = (status) => () => {
    throw Object.assign(new Error("did not take it"), { name: "NotTakenError", status });
  };
  const pages = [];
  const { f } = world({
    batch: [on("email"), on("email", "k3")],
    deliver: notTaken(0),
    remaining: 2,
    facts: visitFacts,
  });
  f.ports.page = async (key, subject) => pages.push([key, subject]);
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
  ]);
  const withdrawn = f.of("withdrawEmail")[0][1];
  assert.equal(withdrawn, f.of("queueEmail")[0][1].id, "the row it wrote is the row it withdraws");
  assert.equal(f.ops().filter((o) => o === "deliver").length, 1, "nobody after them is sent into the same outage");
  assert.deepEqual(pages, [["unreachable:email", "email: a broadcast could not reach the provider"]]);
  // Past the last wait: said as the mail provider's, not WhatsApp's.
  const spent = world({ batch: [on("email")], deliver: notTaken(0), tally: { sent: 4, held: 0 } });
  await sendBroadcastBatch(spent.f.ports, cmd({ waits: BROADCAST_THROTTLE_WAITS_MS.length }));
  assert.match(
    call(spent.f.log, "alert")[1].body,
    new RegExp(
      `^The mail provider could not be reached for about an hour, so the rest was not sent\\. 4 people got it\\. Nothing is wrong with the mailbox\\. ${VISIT_RUN_NEXT}$`,
    ),
  );
  const limited = world({ batch: [on("sms")], deliver: notTaken(429), tally: { sent: 1, held: 0 } });
  await sendBroadcastBatch(limited.f.ports, cmd({ waits: BROADCAST_THROTTLE_WAITS_MS.length }));
  assert.match(call(limited.f.log, "alert")[1].body, /^The texting provider kept limiting how fast this line may send/);
  assert.equal(limited.f.of("withdrawEmail").length, 0, "a text has no row to withdraw");
});

test("a wire that is down stops the run and says which: the mailbox, the texting line; each in its own words", async () => {
  const down = {
    outcome: "failed",
    reason: "no_credentials",
    status: 503,
    errorBody: "no_credentials",
    messageId: "m-k1",
  };
  const email = world({ batch: [on("email"), on("email", "k3")], deliver: down, remaining: 2 });
  await sendBroadcastBatch(email.f.ports, cmd());
  // The failure says which wire (an email's own code), so the run's page says "the mail provider", never "WhatsApp".
  assert.deepEqual(call(email.f.log, "fail").slice(1), ["b1", "wire_unavailable:email"]);
  assert.match(
    call(email.f.log, "alert")[1].body,
    new RegExp(
      `^Email could not be sent from this workspace's mailbox \\(the mailbox is not set up\\), so the rest was not sent\\. Check the mailbox in Settings › Connections\\. ${VISIT_RUN_NEXT}$`,
    ),
  );
  assert.equal(email.f.ops().filter((o) => o === "deliver").length, 1);
  const text = world({ batch: [on("sms")], deliver: { ...down, reason: "provider", status: 401 } });
  await sendBroadcastBatch(text.f.ports, cmd());
  assert.match(
    call(text.f.log, "alert")[1].body,
    /^Texts could not be sent on this workspace's line \(the texting provider answered HTTP 401\)/,
  );
  assert.deepEqual(call(text.f.log, "fail").slice(1), ["b1", "wire_unavailable:sms"]);
  const whatsapp = world({ batch: [on("whatsapp")], deliver: { ...down, reason: "provider", status: 401 } });
  await sendBroadcastBatch(whatsapp.f.ports, cmd());
  assert.deepEqual(
    call(whatsapp.f.log, "fail").slice(1),
    ["b1", "wire_unavailable"],
    "WhatsApp's is the bare code, which is what every run before runs had a channel stored",
  );
});

test("a provider's 401 or 403 on a broadcast's email pages the platform, as a reply's does, and the owner is not told to fix a mailbox that was never at fault", async () => {
  for (const status of [401, 403]) {
    const pages = [];
    const refused = {
      outcome: "failed",
      reason: "provider",
      status,
      errorBody: '{"name":"restricted_api_key"}',
      messageId: "m-k1",
    };
    const { f } = world({ batch: [on("email"), on("email", "k3")], deliver: refused, remaining: 2 });
    f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      pages.map((p) => p.slice(0, 2)),
      [["provider_auth:email", `email rejected a send with ${status}`]],
      `${status}: the same key and subject a reply's refusal is paged under (core send.ts)`,
    );
    assert.match(
      pages[0][2],
      /^Tenant t1, broadcast b1, everyone not yet sent still queued\. Credentials, not content\.$/,
    );
    const said = call(f.log, "alert")[1].body;
    assert.equal(
      said,
      `Email could not be sent: the mail provider refused the platform's key (HTTP ${status}), so the rest was not sent. The platform has been told, and nothing in your mailbox needs changing. ${VISIT_RUN_NEXT}`,
    );
    assert.doesNotMatch(said, /Check the mailbox/);
    assert.deepEqual(call(f.log, "fail").slice(1), ["b1", "wire_unavailable:email"]);
    assert.equal(f.ops().filter((o) => o === "deliver").length, 1, "the run stopped at the first person");
  }
  // WhatsApp's and a text's credentials are the owner's own: they page too (a refused key is paged on any wire), and the
  // owner is told to reconnect, as before.
  const pages = [];
  const { f } = world({
    batch: [on("sms")],
    deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "", messageId: "m-k1" },
  });
  f.ports.page = async (key) => pages.push(key);
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(pages, ["provider_auth:sms"]);
  assert.ok(
    call(f.log, "alert")[1].body.endsWith(`Check the line in Settings › Channels. ${VISIT_RUN_NEXT}`),
    call(f.log, "alert")[1].body,
  );
  // A pager that throws does not turn a run that stopped for it into one that failed to say so.
  const broken = world({
    batch: [on("email")],
    deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "", messageId: "m-k1" },
  });
  broken.f.ports.page = async () => {
    throw new Error("pager down");
  };
  await sendBroadcastBatch(broken.f.ports, cmd());
  assert.deepEqual(call(broken.f.log, "fail").slice(1), ["b1", "wire_unavailable:email"]);
  assert.ok(broken.f.ops().includes("alert"), "the owner is still told");
});

test("each wire is asked about only when someone in the batch goes by it: a mailbox that could not be read holds the emails, and never a WhatsApp-only batch", async () => {
  const asked = [];
  const wireUnavailable = (channel) => (asked.push(channel), channel === "email" ? "mailbox unreadable" : null);
  const mixed = world({ batch: [on("whatsapp"), on("email", "k3")], wireUnavailable, remaining: 2 });
  await sendBroadcastBatch(mixed.f.ports, cmd());
  assert.deepEqual(asked, ["whatsapp", "email"], "each channel the batch goes by, once");
  assert.deepEqual(mixed.f.ops(), ["scheduleNext"], "nobody claimed, nothing failed, nobody told");
  assert.deepEqual(mixed.f.log[0].slice(0, 2), ["scheduleNext", "b1"]);
  asked.length = 0;
  const whatsApp = world({ batch: [on("whatsapp")], wireUnavailable });
  await sendBroadcastBatch(whatsApp.f.ports, cmd());
  assert.deepEqual(asked, ["whatsapp"]);
  assert.ok(whatsApp.f.ops().includes("deliver"), "the email wire is nobody's business here");
  // Past the cap the owner is told which wire: the mailbox, not WhatsApp's credentials.
  const capped = world({ batch: [on("email")], wireUnavailable, remaining: 1, tally: { sent: 5, held: 0 } });
  await sendBroadcastBatch(capped.f.ports, cmd({ stalls: BROADCAST_STALLS_MAX }));
  assert.match(
    call(capped.f.log, "alert")[1].body,
    /^This workspace's mailbox could not be read for about half an hour/,
  );
});

test("one batch, three channels: each person goes by their own, the claims and verdicts are the same, and a run with no channel on its rows is WhatsApp's", async () => {
  const { f } = world({
    batch: [on("whatsapp"), on("sms", "k2"), on("email", "k3"), { contact_id: "k2", facts: VISIT }],
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    sendsOf(f).map((d) => [d.contactId, d.channel, d.to, d.template ? "template" : "words"]),
    [
      ["k1", "whatsapp", "+13475550101", "template"],
      ["k2", "sms", "+13475550102", "words"],
      ["k3", "email", "cy@example.com", "words"],
      ["k2", "whatsapp", "+13475550102", "template"],
    ],
    "a row with no channel (a run made before) is WhatsApp's",
  );
  assert.equal(f.marks().filter((m) => m[1] === "sent").length, 4);
});

/* ---------- The review of the send pipeline (3 Oct): the mail provider's limit, WhatsApp's template, the queued row, the claim -- */

/** The door's answer when the mail provider's day or month is used up (channels resendLimitOf). */
const quota = (limit) => (d) => ({
  outcome: "failed",
  reason: "provider",
  status: 429,
  errorBody: JSON.stringify({ name: `${limit}_quota_exceeded` }),
  messageId: `m-${d.contactId}`,
  limit,
});

test("the mail provider's day or month used up gives the claim back and stops the run, saying so: nobody after is burned as refused", async () => {
  for (const [limit, said] of [
    [
      "daily",
      new RegExp(
        `^The mail provider's limit for the day was reached, so the rest was not sent\\. 4 people got it\\. It resets on its own\\. ${VISIT_RUN_NEXT}$`,
      ),
    ],
    [
      "monthly",
      new RegExp(
        `^The mail provider's limit for the month was reached, so the rest was not sent\\. 4 people got it\\. It resets with the new month\\. ${VISIT_RUN_NEXT}$`,
      ),
    ],
  ]) {
    const pages = [];
    const { f } = world({
      batch: [on("email"), on("email", "k3"), on("email", "k2")],
      deliver: quota(limit),
      remaining: 3,
      tally: { sent: 4, held: 0 },
    });
    f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "throttled"],
      ],
      `${limit}: the claim goes back, so the person stays queued; nobody is marked send_failed`,
    );
    assert.equal(f.ops().filter((o) => o === "deliver").length, 1, `${limit}: nobody after them is tried`);
    assert.deepEqual(call(f.log, "fail").slice(1), ["b1", "provider_limit"]);
    assert.match(call(f.log, "alert")[1].body, said);
    assert.ok(!f.ops().includes("scheduleNext"), `${limit}: stopped, not waiting: the limit outlasts any wait`);
    // The one page a reply's limit gives (core provider-page.ts): the same key and subject, the run named in its body.
    assert.deepEqual(pages, [
      [
        "provider_quota:email",
        `email: the ${limit} sending limit is used up`,
        "Tenant t1, broadcast b1, everyone not yet sent still queued. Every workspace's email is refused until it resets or the plan grows.",
      ],
    ]);
  }
  // A playbook's run that is not a visit's: the day's limit is over by tomorrow's run; the month's is not, and its alert
  // promised a run that would meet the same limit.
  for (const [limit, end] of [
    [
      "daily",
      "It resets on its own. It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice.",
    ],
    [
      "monthly",
      "It resets with the new month. It does not run again today; the next run that can go reaches the people this one did not, and nobody who got it is sent it twice.",
    ],
  ]) {
    const { f } = world({
      broadcast: forMoment("everyone_monthly"),
      batch: [on("email"), on("email", "k3")],
      deliver: quota(limit),
      remaining: 2,
      tally: { sent: 4, held: 0 },
    });
    await sendBroadcastBatch(f.ports, cmd());
    const said = call(f.log, "alert")[1].body;
    assert.ok(said.endsWith(end), `${limit}: ${said}`);
    assert.doesNotMatch(said, /send it again/i);
  }
  const { BROADCAST_FAILURE_WORDS } = await import("@chanlytics/contracts");
  assert.ok("provider_limit" in BROADCAST_FAILURE_WORDS, "the page has words for it");
});

test("WhatsApp's template not approved holds WhatsApp's people alone: the people on email and text go on their versions, with the message's own purpose", async () => {
  const rejected = { ...visitRows, whatsapp: { ...visitRows.whatsapp, meta_status: "rejected" } };
  const mixed = world({
    batch: [on("whatsapp", "k2"), on("email"), on("sms", "k2")],
    message: versionsOf([], rejected),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(mixed.f.ports, cmd());
  assert.deepEqual(mixed.f.marks(), [
    ["k2", "skipped", "template_not_approved"],
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  assert.deepEqual(
    sendsOf(mixed.f).map((d) => [d.channel, d.purpose]),
    [
      ["email", "conversational"],
      ["sms", "conversational"],
    ],
    "the purpose stays the message's own category, Meta's row's, though that row is not approved",
  );
  assert.ok(!mixed.f.ops().includes("fail"), "the run is not failed: somebody on it can still be reached");
  assert.ok(mixed.f.ops().includes("finish"));
  assert.ok("template_not_approved" in HELD_REASONS, "and the run's page says why the WhatsApp people were held");
  // A message with no category anywhere has none to keep: marketing, as purposeOfTemplate fails closed.
  const gone = world({
    batch: [on("email")],
    message: versionsOf([], {
      email: { ...visitRows.email, category: null },
      sms: { ...visitRows.sms, category: null },
    }),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(gone.f.ports, cmd());
  assert.equal(sendsOf(gone.f)[0].purpose, "marketing");
  // The question is the RUN's, not the batch's: a batch of WhatsApp people on a run that has email people is held, and the run goes on.
  const onlyWhatsApp = world({
    batch: [on("whatsapp"), on("whatsapp", "k2")],
    message: versionsOf([], rejected),
    byOtherChannels: true,
    remaining: 1,
  });
  await sendBroadcastBatch(onlyWhatsApp.f.ports, cmd());
  assert.deepEqual(onlyWhatsApp.f.marks(), [
    ["k1", "skipped", "template_not_approved"],
    ["k2", "skipped", "template_not_approved"],
  ]);
  assert.ok(onlyWhatsApp.f.ops().includes("scheduleNext"), "the run goes on to its email people");
  // A run with nobody else on it fails as it always did, before a single send.
  const alone = world({ batch: [on("whatsapp")], message: versionsOf([], rejected), byOtherChannels: false });
  await sendBroadcastBatch(alone.f.ports, cmd());
  assert.deepEqual(alone.f.ops(), ["startSending", "fail", "alert"]);
  assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "template_not_approved"]);
  // The question is asked only when the template is not approved.
  const approvedRun = world({
    batch: [on("email")],
    byOtherChannels: new Error("never asked of an approved template"),
  });
  await sendBroadcastBatch(approvedRun.f.ports, cmd());
  assert.ok(approvedRun.f.ops().includes("finish"));
});

test("an email's queued row is written only once its person is claimed, and none is left queued on a path that does not send it", async () => {
  const claim = (patch) => patch.state === "failed" && patch.reason === OUTCOME_UNKNOWN;
  // The claim throws: nobody is claimed, so no row was written for them; the next person is reached.
  const claimThrows = world({
    batch: [on("email"), on("email", "k3")],
    mark: (_b, k, patch) => {
      if (claim(patch) && k === "k1") throw new Error("PostgREST blip");
      return true;
    },
    remaining: 1,
  });
  await sendBroadcastBatch(claimThrows.f.ports, cmd());
  assert.deepEqual(
    claimThrows.f.of("queueEmail").map((q) => q[1].contactId),
    ["k3"],
    "no row for the person whose claim failed",
  );
  // The claim is lost to another run (a compare-and-set answers false): no row, no send, no mark of theirs; the batch goes on.
  const lost = world({
    batch: [on("email"), on("email", "k3")],
    mark: (_b, k, patch) => !(claim(patch) && k === "k1"),
  });
  await sendBroadcastBatch(lost.f.ports, cmd());
  assert.deepEqual(
    lost.f.of("queueEmail").map((q) => q[1].contactId),
    ["k3"],
  );
  assert.deepEqual(
    sendsOf(lost.f).map((d) => d.contactId),
    ["k3"],
    "the person another run took is that run's to send to",
  );
  assert.deepEqual(
    lost.f.marks().filter((m) => m[0] === "k1"),
    [["k1", "failed", OUTCOME_UNKNOWN]],
    "only the attempt: nothing is settled for a person who is not ours",
  );
  // The row cannot be written: nothing was written and nothing left, so the claim goes back and they wait queued.
  const writeFails = world({ batch: [on("email")], queueEmail: new Error("insert failed"), remaining: 1 });
  await sendBroadcastBatch(writeFails.f.ports, cmd());
  assert.deepEqual(writeFails.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
  ]);
  assert.equal(writeFails.f.ops().filter((o) => o === "deliver").length, 0);
  // The door throws before the wire: the row it did not settle is withdrawn, the claim stands (nobody knows whether it
  // left), and the run stops there rather than claim the next person into the same failure.
  const doorThrows = world({ batch: [on("email"), on("email", "k3")], deliver: new Error("wire read failed") });
  await assert.rejects(sendBroadcastBatch(doorThrows.f.ports, cmd()), /wire read failed/);
  assert.deepEqual(
    doorThrows.f.of("withdrawEmail").map((w) => w[1]),
    [doorThrows.f.of("queueEmail")[0][1].id],
    "the row it wrote is the row it withdraws",
  );
  assert.deepEqual(doorThrows.f.marks(), [["k1", "failed", OUTCOME_UNKNOWN]]);
  assert.equal(doorThrows.f.of("queueEmail").length, 1, "nobody after them is written a row");
  // A withdrawal that fails is logged and never the run's failure: the run still waits, as for any send handed back.
  const stuck = world({
    batch: [on("email")],
    deliver: notTaken(0),
    withdrawEmail: new Error("db down"),
    remaining: 1,
  });
  await sendBroadcastBatch(stuck.f.ports, cmd());
  assert.deepEqual(stuck.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
  ]);
  assert.ok(stuck.f.ops().includes("scheduleNext"));
});

test("the claim is a compare-and-set: a person another run took first is not sent", async () => {
  const taken = fakes({
    mark: (_b, k, patch) => !(patch.state === "failed" && patch.reason === OUTCOME_UNKNOWN && k === "k1"),
  });
  await sendBroadcastBatch(taken.ports, cmd());
  assert.deepEqual(
    taken.log.filter((l) => l[0] === "deliver").map((l) => l[1].contactId),
    ["k2"],
    "k1 was taken by another run: only k2 is sent",
  );
  assert.deepEqual(taken.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
});

/* ---------- The review of 4 Oct: offers by email with no verified campaigns domain; a released person's new id -- */

/** Meta's row and the email version of a message that is an OFFER: marketing, so it needs the campaigns domain. */
const offerRows = {
  whatsapp: { ...visitRows.whatsapp, category: "marketing" },
  email: { ...visitRows.email, category: "marketing" },
};

test("offers by email, where the deployment names a campaigns domain the provider does not verify, do not stop a run that also goes another way: the platform is paged once, each person going by email is skipped for it before they are claimed, and everyone else is sent", async () => {
  const pages = [];
  const asked = [];
  const others = [];
  const { f } = world({
    batch: [on("email"), on("whatsapp", "k2"), on("email", "k3")],
    message: versionsOf([], offerRows),
    offersClosed: () => (asked.push("asked"), "the campaigns domain campaigns.example.com is not verified for sending"),
    byOtherChannels: (_id, than) => (others.push(than), true),
    heldForEmail: ["email_marketing_disabled"],
    remaining: 0,
    tally: { sent: 1, held: 2 },
  });
  f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
  await sendBroadcastBatch(f.ports, cmd());
  assert.ok(!f.ops().includes("fail"), "the run is not failed: the owner is not told to send it again");
  assert.equal(asked.length, 1, "asked once for the batch");
  assert.deepEqual(others, ["email"], "who else is on the run is asked once, of email");
  assert.deepEqual(
    f.marks(),
    [
      ["k1", "skipped", "email_marketing_disabled"],
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "sent", null],
      ["k3", "skipped", "email_marketing_disabled"],
    ],
    "the email people are skipped with the door's own reason, never claimed, never held as having no channel; the WhatsApp person behind them is reached",
  );
  assert.deepEqual(
    sendsOf(f).map((d) => d.contactId),
    ["k2"],
    "nothing by email left",
  );
  assert.equal(f.of("queueEmail").length, 0, "no email row was written for a person who cannot be sent one");
  assert.ok(f.ops().includes("finish"), "the run finishes, and says what happened to the others");
  assert.equal(call(f.log, "alert")[1].kind, "broadcast_sent");
  assert.match(
    call(f.log, "alert")[1].body,
    /1 of 3 people got it; 2 held back \(.*offers and news by email can't leave yet/,
  );
  assert.deepEqual(pages, [
    [
      "campaigns_domain_unverified",
      "email: a broadcast's offers could not leave, the campaigns domain is not verified",
      "Tenant t1, broadcast b1: its offers and news by email are skipped person by person while this lasts, and the run goes on for everyone else: the campaigns domain campaigns.example.com is not verified for sending.",
    ],
  ]);
  // The page has words for a run that an earlier build stopped with it, and they say what is wrong: not WhatsApp, not the mailbox.
  const { broadcastFailureWords, broadcastFailureFix, BROADCAST_FAILURES } = await import("@chanlytics/contracts");
  assert.match(broadcastFailureWords("campaigns_domain_unverified"), /not verified with the mail provider/);
  assert.match(broadcastFailureFix("campaigns_domain_unverified"), /Nothing is wrong with your mailbox/);
  assert.ok(BROADCAST_FAILURES.includes("email_offers_paused"), "a run of email alone stops for a pause on offers too");

  // A run of email alone stops, before anyone is claimed, saying so: everyone left would be held alike, each a skip that
  // is final, and the run would end as having reached nobody.
  const alonePages = [];
  const alone = world({
    // A broadcast the owner made: it is sent again once the domain is verified (a playbook's run is told its own next step).
    broadcast: broadcast(),
    batch: [on("email"), on("email", "k3")],
    message: versionsOf([], offerRows),
    offersClosed: "the campaigns domain campaigns.example.com is not verified for sending",
    byOtherChannels: (_id, than) => than !== "email",
    remaining: 2,
    tally: { sent: 3, held: 0 },
  });
  alone.f.ports.page = async (key, subject, body) => alonePages.push([key, subject, body]);
  await sendBroadcastBatch(alone.f.ports, cmd());
  assert.deepEqual(alone.f.ops(), ["startSending", "fail", "alert"], "nobody claimed, nothing held, nothing scheduled");
  assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "campaigns_domain_unverified"]);
  assert.equal(
    call(alone.f.log, "alert")[1].body,
    "The domain offers by email go out from is not verified with the mail provider right now, so the rest was not sent. 3 people got it. Nothing is wrong with your mailbox, and the platform has been told; send it again once the domain is verified.",
  );
  assert.deepEqual(alonePages, [
    [
      "campaigns_domain_unverified",
      "email: a broadcast's offers could not leave, the campaigns domain is not verified",
      "Tenant t1, broadcast b1 stopped, everyone not yet sent still queued: the campaigns domain campaigns.example.com is not verified for sending.",
    ],
  ]);

  // Asked only when it matters: an offer, and somebody in the batch going by email. A visit message leaves from the mail
  // domain, which is not in question; a WhatsApp-only batch has no email in it.
  const counted = (rows, batch) => {
    const asks = [];
    const w = world({
      batch,
      message: versionsOf([], rows),
      offersClosed: () => (asks.push(1), "closed"),
    });
    return sendBroadcastBatch(w.f.ports, cmd()).then(() => ({ asks: asks.length, ops: w.f.ops() }));
  };
  assert.equal((await counted(visitRows, [on("email")])).asks, 0, "a visit message is not an offer");
  assert.ok((await counted(visitRows, [on("email")])).ops.includes("deliver"), "and it goes");
  assert.equal((await counted(offerRows, [on("whatsapp")])).asks, 0, "an offer by WhatsApp has no email in it");
  assert.equal((await counted(offerRows, [on("email")])).asks, 1);
  // Open (null): the offers are sent as ever, from the lane the adapter holds.
  const open = world({ batch: [on("email")], message: versionsOf([], offerRows), offersClosed: null });
  await sendBroadcastBatch(open.f.ports, cmd());
  assert.ok(open.f.ops().includes("deliver"));
});

test("offers by email whose campaigns domain could not be asked about wait a minute and ask again, nobody claimed; a visit's email in the same state goes", async () => {
  const pages = [];
  const unread = "the campaigns domain campaigns.example.com could not be checked";
  const { f } = world({
    batch: [on("email"), on("email", "k3")],
    message: versionsOf([], offerRows),
    offersUnread: unread,
    offersClosed: new Error("not asked: an unread domain is no answer"),
    remaining: 2,
  });
  f.ports.page = async (key, subject, body) => pages.push([key, subject, body]);
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(f.ops(), ["startSending", "scheduleNext"], "nobody claimed, nothing held, nothing failed");
  assert.deepEqual(call(f.log, "scheduleNext").slice(-1), [{ stalls: 1 }], "a stall, carrying the count");
  assert.deepEqual(pages, [
    [
      "campaigns_domain_unread",
      "email: a broadcast's offers wait, the campaigns domain could not be checked",
      `Tenant t1, broadcast b1 waits, everyone still queued: ${unread}.`,
    ],
  ]);
  // A visit's email is not an offer, and leaves from the mail domain: it is not held for the campaigns domain.
  const visit = world({ batch: [on("email")], message: versionsOf([], visitRows), offersUnread: unread });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.ok(visit.f.ops().includes("deliver"), "and it goes");
});

test("a person released and re-batched is sent under a new email id, whatever the run's own counters say: not skipped as send_failed having never been sent; a run resumed with no release keeps its id", async () => {
  // The database's guard, as the fakes stand in for it: every release of a claim (queued again) adds one to the person's
  // attempt, which the batch reads with the queued people (00301).
  const attempts = new Map();
  const rows = new Map();
  const ids = [];
  let door = "not taken";
  const { f } = world({
    batch: () => [{ ...on("email"), attempt: attempts.get("k1") ?? 0 }],
    mark: (_id, contactId, patch) => {
      if (patch.state === "queued") attempts.set(contactId, (attempts.get(contactId) ?? 0) + 1);
      return true;
    },
    queueEmail: (row) => {
      ids.push(row.id);
      if (rows.has(row.id)) return { status: rows.get(row.id) };
      rows.set(row.id, "queued");
      return { status: "queued" };
    },
    withdrawEmail: (id) => rows.set(id, "canceled"),
    deliver: (d) => {
      if (door === "not taken") throw Object.assign(new Error("did not take it"), { name: "NotTakenError", status: 0 });
      rows.set(d.messageId, "sent");
      return { outcome: "sent", messageId: d.messageId, externalId: "re_1" };
    },
    remaining: 1,
  });
  // Batch 1, at wait 0: the provider does not take it. The email's row is withdrawn, the person released: attempt 1.
  await sendBroadcastBatch(f.ports, cmd());
  assert.equal(rows.get(ids[0]), "canceled");
  assert.equal(attempts.get("k1"), 1);
  // Batch 2: a clean batch between had the run's waits start again, so it is read at wait 0 as batch 1 was. Under the id
  // derived from the waits it was the id of the withdrawn row: found canceled, skipped as send_failed, never sent.
  door = "takes it";
  await sendBroadcastBatch(f.ports, cmd());
  assert.notEqual(ids[1], ids[0], "a new id for the new attempt");
  assert.deepEqual(
    f.marks().filter((m) => m[1] === "skipped"),
    [],
    "nobody is skipped as send_failed",
  );
  assert.equal(f.marks().at(-1)?.[1], "sent");
  assert.equal(rows.get(ids[1]), "sent");
  // A run resumed after a kill releases nobody: the same attempt, so the same id, whatever the run carried. It is how a
  // resumed batch finds the email it was sending.
  const resumed = [];
  const again = world({
    batch: [{ ...on("email"), attempt: 2 }],
    emailRequest: (i) => (resumed.push(i.messageId), frozen(i)),
  });
  await sendBroadcastBatch(again.f.ports, cmd());
  await sendBroadcastBatch(again.f.ports, cmd({ waits: 3, stalls: 1 }));
  assert.equal(new Set(resumed).size, 1, "no release, no new id");
  // And each attempt is its own: attempt 3 is not attempt 2.
  const third = world({
    batch: [{ ...on("email"), attempt: 3 }],
    emailRequest: (i) => (resumed.push(i.messageId), frozen(i)),
  });
  await sendBroadcastBatch(third.f.ports, cmd());
  assert.equal(new Set(resumed).size, 2);
  // A database that has not reached 00301 has no attempt to read: the id is named as it was, by the waits and the stalls.
  const old = [];
  const before = world({ batch: [on("email")], emailRequest: (i) => (old.push(i.messageId), frozen(i)) });
  await sendBroadcastBatch(before.f.ports, cmd());
  await sendBroadcastBatch(before.f.ports, cmd());
  await sendBroadcastBatch(before.f.ports, cmd({ waits: 1 }));
  assert.equal(old[0], old[1], "the same wait, the same row");
  assert.notEqual(old[2], old[0], "a wait is a fresh row, as before the column");
});

test("a broadcast's email id is named by the person's attempt, as reach-out's sends are; a database with no attempt to read keeps the id it always had", async () => {
  const { broadcastEmailId } = await importSrc("packages/core/src/campaigns/reach-out-ids.ts");
  const { uuidV5 } = await importSrc("packages/core/src/uuid-v5.ts");
  const of = (over = {}) =>
    broadcastEmailId({ broadcastId: "b1", contactId: "k1", attempt: 0, waits: 0, stalls: 0, ...over });
  // The run and the person and the attempt: the same three, the same id; any one different, a different one.
  assert.equal(await of(), await of());
  assert.notEqual(await of({ attempt: 1 }), await of());
  assert.notEqual(await of({ contactId: "k2" }), await of());
  assert.notEqual(await of({ broadcastId: "b2" }), await of());
  // What the run carried is not in it: a clean batch starts its waits at nothing and a resumed run keeps its attempt.
  assert.equal(await of({ attempt: 2, waits: 3, stalls: 1 }), await of({ attempt: 2 }));
  // No attempt to read (a database before 00301): the waits and the stalls, as before the column.
  assert.equal(
    await of({ attempt: undefined, waits: 2, stalls: 1 }),
    await uuidV5("broadcast_email:b1:k1:2:1"),
    "the id every run before the column was written under",
  );
  assert.notEqual(await of({ attempt: undefined }), await of({ attempt: 0 }), "the two names never meet");
});

/* ------------- Decision D4: the day-before reminder given back for a live hold; workspace-wide refusals stop the run -- */

/** The door answering that somebody holds the thread: for a day-before reminder, which passes the 24-hour pause, only a live hold can. */
const heldBy = (reason) => (d) => ({ outcome: "refused", reason, messageId: d.messageId ?? null });
/** A playbook run's audience for a moment, as run-playbook writes it. */
const forMoment = (trigger) =>
  broadcast({ playbook_id: "p1", audience: { kind: "playbook", id: "p1", label: "A moment", trigger } });
const { BROADCAST_HOLD_WAIT_MS } = await import("@chanlytics/contracts");

test("a day-before reminder the door held for a live hold is given back, not skipped, and the run tries them again after the hold's wait", async () => {
  const { f } = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1 });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    f.marks(),
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "queued", "not_taken"],
    ],
    "claimed, then given back: nothing left, so nothing is final",
  );
  assert.ok(!f.ops().includes("fail"), "the run goes on, and is not failed");
  assert.deepEqual(
    call(f.log, "scheduleNext").slice(1),
    ["b1", new Date(NOW + BROADCAST_HOLD_WAIT_MS), {}],
    "the next batch is placed after the hold's wait, not at once and not as a stall",
  );
  // The wait is drawn a little longer at random, as every wait is.
  const drawn = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1, random: () => 1 });
  await sendBroadcastBatch(drawn.f.ports, cmd());
  assert.deepEqual(call(drawn.f.log, "scheduleNext")[2], new Date(NOW + BROADCAST_HOLD_WAIT_MS * 1.2));
  // What the run was carrying (its waits and its stalls) is kept, not reset by the hold.
  const carried = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1 });
  await sendBroadcastBatch(carried.f.ports, cmd({ waits: 2, stalls: 1 }));
  assert.deepEqual(call(carried.f.log, "scheduleNext")[3], { waits: 2, stalls: 1 });
  // The tried-again person is sent when the hold has gone: the same person, a second batch.
  let held = true;
  const again = world({
    batch: [on("whatsapp")],
    deliver: (d) =>
      held ? heldBy("human_has_it")(d) : { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" },
    remaining: 1,
  });
  await sendBroadcastBatch(again.f.ports, cmd());
  held = false;
  again.f.ports.remaining = async () => 0;
  await sendBroadcastBatch(again.f.ports, cmd());
  assert.deepEqual(again.f.marks().at(-1), ["k1", "sent", null]);
  assert.ok(again.f.ops().includes("finish"), "and the run finishes");
});

test("a person whose reminder waits does not hold up the others: the rest of the batch goes on, and the next batch waits only when nobody else is left", async () => {
  // Two people in the batch: the first held, the second sent. Everyone else the run has is the held person: wait for the hold.
  const held = (d) =>
    d.contactId === "k1"
      ? heldBy("human_has_it")(d)
      : { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" };
  const { f } = world({ batch: [on("whatsapp"), on("whatsapp", "k2")], deliver: held, remaining: 1 });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "queued", "not_taken"],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
  ]);
  assert.deepEqual(call(f.log, "scheduleNext").slice(1, 3), ["b1", new Date(NOW + BROADCAST_HOLD_WAIT_MS)]);
  // More people are still queued beyond this batch: the next batch is not held back for one person.
  const more = world({ batch: [on("whatsapp"), on("whatsapp", "k2")], deliver: held, remaining: 7 });
  await sendBroadcastBatch(more.f.ports, cmd());
  assert.deepEqual(call(more.f.log, "scheduleNext").slice(1), ["b1"], "at once, as any batch with people left");
});

test("a held reminder whose claim could not be given back is skipped, human_has_it, not counted as waiting: nobody is queued for the run to try again", async () => {
  // The release is the database's to refuse (no 00216/00282 yet, a guard that will not move the row): it throws, or says no.
  for (const [what, refuse] of [
    ["throws", () => Promise.reject(new Error("broadcast_recipients.state is terminal (failed -> queued refused)"))],
    ["answers no", () => false],
  ]) {
    const { f } = world({
      batch: [on("whatsapp")],
      deliver: heldBy("human_has_it"),
      remaining: 0,
      mark: (_b, _k, patch) => (patch.state === "queued" ? refuse() : true),
    });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "not_taken"],
        ["k1", "skipped", "human_has_it"],
      ],
      `a release that ${what}: the person is skipped, as for a hold that has run out of day`,
    );
    assert.ok(
      !f.ops().includes("scheduleNext"),
      `a release that ${what}: no wait is placed for a person who is not queued`,
    );
    assert.ok(f.ops().includes("finish"), `a release that ${what}: nobody is left, so the run finishes`);
  }
  // Given back, as always, when the database takes the release: the person is queued and the run waits for the hold.
  const taken = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), remaining: 1 });
  await sendBroadcastBatch(taken.f.ports, cmd());
  assert.deepEqual(taken.f.marks().at(-1), ["k1", "queued", "not_taken"]);
  assert.ok(taken.f.ops().includes("scheduleNext"));
});

test("a day-before reminder still held at the end of the sending day is skipped, human_has_it, as before; every other moment skips a held thread at once", async () => {
  // 8:55 PM: the next try would fall at 9:05 PM, outside the day's sending hours (the day the reminder is for is over).
  const LATE = Date.parse("2026-09-11T20:55:00Z");
  const late = world({ batch: [on("whatsapp")], deliver: heldBy("human_has_it"), now: () => LATE });
  await sendBroadcastBatch(late.f.ports, cmd({ deadline: LATE + 60_000 }));
  assert.deepEqual(late.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "skipped", "human_has_it"],
  ]);
  assert.ok(late.f.ops().includes("finish") && !late.f.ops().includes("scheduleNext"));
  // Any other moment, and a broadcast: no pause is passed, so a held thread is the person's own refusal, final.
  for (const [what, b] of [
    ["the after-visit message", forMoment("visited")],
    ["a win-back", forMoment("quiet_30")],
    ["the month's offer", forMoment("everyone_monthly")],
    ["a proposal's follow-up", forMoment("proposal_waiting")],
    ["a plain broadcast", broadcast()],
  ]) {
    const w = world({ broadcast: b, batch: [on("whatsapp")], deliver: heldBy("human_has_it") });
    await sendBroadcastBatch(w.f.ports, cmd());
    assert.deepEqual(
      w.f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "skipped", "human_has_it"],
      ],
      what,
    );
    assert.ok(!w.f.ops().includes("scheduleNext"), `${what}: nothing is waited for`);
  }
  // The door is told the moment, which is all it needs to pass the pause (contracts passesHandoverPause).
  const sent = world({ batch: [on("whatsapp")] });
  await sendBroadcastBatch(sent.f.ports, cmd());
  assert.equal(sendsOf(sent.f)[0].trigger, "visit_tomorrow");
});

test("a billing pause the door meets stops the run, once, and gives the person back, never skipping everyone left; a playbook's run is told its own next step, not to send it again", async () => {
  const stopped = async (b) => {
    const { f } = world({
      broadcast: b,
      batch: [on("whatsapp"), on("whatsapp", "k2")],
      deliver: heldBy("paused"),
      remaining: 2,
    });
    const pages = [];
    f.ports.page = async (...args) => pages.push(args);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "not_taken"],
      ],
      "the person the door was asked about is given back, and nobody after them is claimed",
    );
    assert.equal(sendsOf(f).length, 1, "the run stopped at the first refusal");
    assert.deepEqual(call(f.log, "fail").slice(1), ["b1", "paused"]);
    const alerts = f.log.filter((l) => l[0] === "alert");
    assert.equal(alerts.length, 1, "the owner is told once");
    assert.equal(alerts[0][1].kind, "broadcast_stopped");
    assert.ok(!f.ops().includes("scheduleNext") && !f.ops().includes("finish"), "stopped, not waiting or done");
    assert.equal(pages.length, 0, "a billing pause is the owner's, not the platform's");
    return alerts[0][1].body;
  };
  assert.equal(
    await stopped(broadcast()),
    "The workspace is paused until billing resumes, so the rest was not sent. 2 people got it. Resume from Settings › Billing and send it again.",
  );
  // A playbook's run was made for today: Run now answers that it already ran, and sending its message again by hand reaches
  // the whole list. Tomorrow's run reaches who this one did not (a stopped run touched only the people it had sent to).
  assert.match(
    await stopped(forMoment("quiet_30")),
    /Resume from Settings › Billing\. It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice\.$/,
  );
  assert.doesNotMatch(await stopped(forMoment("everyone_monthly")), /send it again/i);
  // A visit's message belongs to the day of the visit: tomorrow's run is for tomorrow's visits, so these are not reached later.
  assert.match(
    await stopped(forMoment("visit_tomorrow")),
    /a reminder belongs to its day, so the people it did not reach will not be sent it later\.$/,
  );
  assert.doesNotMatch(await stopped(forMoment("visited")), /send it again|tomorrow's run reaches/i);
  // The same pause met at the head, before anyone is claimed: the same words, once.
  const head = fakes({ broadcast: forMoment("quiet_30"), workspacePaused: true, tally: { sent: 0, held: 0 } });
  await sendBroadcastBatch(head.ports, cmd());
  assert.deepEqual(head.ops(), ["fail", "alert"]);
  assert.match(
    call(head.log, "alert")[1].body,
    /^The workspace is paused until billing resumes, so nothing went out\. Resume from Settings › Billing\. It does not run again today;/,
  );
});

test("a pause on offers and news by email, or a campaigns domain that cannot be used, skips the email person the door asked about and the run goes on: a WhatsApp person behind them is sent, the run is not failed, and it says so when it finishes", async () => {
  for (const reason of ["email_offers_paused", "email_marketing_disabled"]) {
    const others = [];
    const { f } = world({
      message: versionsOf([], offerRows),
      batch: [on("email"), on("whatsapp", "k2"), on("email", "k3")],
      deliver: (d) =>
        d.channel === "email"
          ? heldBy(reason)(d)
          : { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" },
      byOtherChannels: (_id, than) => (others.push(than), true),
      heldForEmail: [reason],
      remaining: 0,
      tally: { sent: 1, held: 2 },
    });
    const pages = [];
    f.ports.page = async (...args) => pages.push(args);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "skipped", reason],
        ["k2", "failed", OUTCOME_UNKNOWN],
        ["k2", "sent", null],
        ["k3", "failed", OUTCOME_UNKNOWN],
        ["k3", "skipped", reason],
      ],
      `${reason}: each email person is skipped with that reason, final, and the WhatsApp person is sent`,
    );
    assert.deepEqual(
      sendsOf(f).map((d) => [d.contactId, d.channel]),
      [
        ["k1", "email"],
        ["k2", "whatsapp"],
        ["k3", "email"],
      ],
      `${reason}: the door was asked about each, in order`,
    );
    assert.ok(!f.ops().includes("fail"), `${reason}: the run is not failed`);
    assert.deepEqual(others, ["email"], `${reason}: who else is on the run is asked once a batch, not of each person`);
    assert.deepEqual(
      f.log.filter((l) => l[0] === "alert").map((l) => l[1].kind),
      ["broadcast_sent"],
      `${reason}: the owner is told once, that it finished`,
    );
    assert.ok(f.ops().includes("finish") && !f.ops().includes("scheduleNext"), `${reason}: finished, not stopped`);
    assert.equal(pages.length, 0, `${reason}: nobody is paged for a person's refusal`);
    // The owner's news says what held them back, in words the run's own page uses.
    assert.match(call(f.log, "alert")[1].body, /1 of 3 people got it; 2 held back \(/);
    assert.ok(call(f.log, "alert")[1].body.includes(HELD_REASONS[reason]), reason);
  }
  assert.equal(HELD_REASONS.email_offers_paused, "offers and news by email are paused");
  assert.equal(
    HELD_REASONS.email_marketing_disabled,
    "offers and news by email can't leave yet: the campaigns domain isn't switched on",
  );
});

test("a pause on offers and news by email, or a campaigns domain that cannot be used, stops a run of email alone at the first person the door refuses, who is given back: nobody is skipped for good, and a playbook's run is not told to send it again", async () => {
  const stopped = async (reason, b) => {
    const { f } = world({
      broadcast: b ?? broadcast(),
      message: versionsOf([], offerRows),
      batch: [on("email"), on("email", "k2")],
      deliver: heldBy(reason),
      // Nobody on the run goes another way than email (the default answer): the hold is everyone's.
      remaining: 2,
    });
    const pages = [];
    f.ports.page = async (...args) => pages.push(args);
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks(),
      [
        ["k1", "failed", OUTCOME_UNKNOWN],
        ["k1", "queued", "not_taken"],
      ],
      `${reason}: the person the door was asked about is given back, and nobody after them is claimed`,
    );
    assert.equal(sendsOf(f).length, 1, `${reason}: the run stopped at the first refusal`);
    const alerts = f.log.filter((l) => l[0] === "alert");
    assert.equal(alerts.length, 1, `${reason}: the owner is told once`);
    assert.equal(alerts[0][1].kind, "broadcast_stopped");
    assert.match(alerts[0][1].subject, /^Broadcast “.+” stopped$/, reason);
    assert.ok(
      !f.ops().includes("scheduleNext") && !f.ops().includes("finish"),
      `${reason}: stopped, not waiting or done`,
    );
    return { failure: call(f.log, "fail")[2], body: alerts[0][1].body, pages };
  };
  const paused = await stopped("email_offers_paused");
  assert.equal(paused.failure, "email_offers_paused");
  assert.equal(
    paused.body,
    "Offers by email are paused while complaints and bounces settle, so the rest was not sent. 2 people got it. Check your list for old or wrong addresses; offers by email come back on once it looks right. Send it again then.",
  );
  assert.equal(paused.pages.length, 0, "a gate's pause was paged where it tripped");
  const closed = await stopped("email_marketing_disabled");
  assert.equal(closed.failure, "campaigns_domain_unverified");
  assert.match(closed.body, /not verified with the mail provider right now.*Nothing is wrong with your mailbox/);
  assert.deepEqual(
    closed.pages.map((p) => [p[0], p[2]]),
    [
      [
        "campaigns_domain_unverified",
        "Tenant t1, broadcast b1 stopped, everyone not yet sent still queued: the door refused an offer by email (email_marketing_disabled): this runtime holds no verified campaigns domain.",
      ],
    ],
    "the platform hears of a domain",
  );
  // A playbook's run was made for today: it is not sent again by hand, and tomorrow's run reaches who this one did not.
  const playbook = await stopped("email_offers_paused", forMoment("everyone_monthly"));
  assert.match(
    playbook.body,
    /offers by email come back on once it looks right\. It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice\.$/,
  );
  assert.doesNotMatch(playbook.body, /send it again/i);
  // The run's own page says the same next step.
  const { broadcastFailureFix } = await import("@chanlytics/contracts");
  assert.equal(
    broadcastFailureFix("email_offers_paused", 2, { playbook_id: "p1", trigger: "everyone_monthly" }),
    "Check your list for old or wrong addresses; offers by email come back on once it looks right. It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice.",
  );
  assert.match(
    broadcastFailureFix("email_offers_paused", 2, { playbook_id: null, trigger: null }),
    /^The first 2 got it, then/,
  );
});

test("a person's own refusal skips them with its reason and the run goes on to the next", async () => {
  // The person's own: skipped with the reason, and the run goes on to the next.
  for (const reason of ["opted_out", "not_opted_in", "no_marketing_consent", "email_suppressed", "recipient_changed"]) {
    const { f } = world({ batch: [on("whatsapp"), on("whatsapp", "k2")], deliver: heldBy(reason) });
    await sendBroadcastBatch(f.ports, cmd());
    assert.deepEqual(
      f.marks().filter((m) => m[1] === "skipped"),
      [
        ["k1", "skipped", reason],
        ["k2", "skipped", reason],
      ],
      reason,
    );
    assert.ok(!f.ops().includes("fail"), reason);
  }
});

/* ---------- Decision D2: the business's own news by email is an offer at the batch's head and in its foot -- */

const NEWS_WORDS = "Hi {{1}}, a note from the business.";
const newsRows = {
  whatsapp: { meta_status: "approved", body_preview: NEWS_WORDS, category: "utility" },
  email: {
    meta_status: "approved",
    body_preview: NEWS_WORDS,
    category: "utility",
    components: [
      { type: "HEADER", format: "TEXT", text: "A note, {{1}}" },
      { type: "BODY", text: NEWS_WORDS },
    ],
  },
};
/** A broadcast of news: a utility message, no moment, one slot. */
const news = (over = {}) => {
  const made = [];
  const w = world({
    broadcast: broadcast({
      template_name: "a_note",
      params: [{ kind: "first_name" }],
      playbook_id: null,
      audience: null,
    }),
    message: versionsOf([], newsRows),
    emailRequest: (i) => (made.push(i), frozen(i)),
    ...over,
  });
  return { ...w, made };
};

test("the business's own news by email carries an offer's foot and its link, as an offer does; a visit's email keeps the visit's foot", async () => {
  const { f, made } = news({ batch: [on("email", "k1", null)] });
  await sendBroadcastBatch(f.ports, cmd());
  assert.equal(made.length, 1);
  assert.deepEqual(
    Object.keys(made[0].offer ?? {}).sort(),
    ["footerHtml", "unsubscribeUrl"],
    "the offer's request: link and HTML foot",
  );
  assert.match(made[0].offer.unsubscribeUrl, /^https:\/\/app\.example\.com\/u\/k1-/);
  assert.equal(
    made[0].footer.split("\n").slice(0, 2).join("\n"),
    "You're a customer of Marisa's.\nMarisa's · 12 Main St, Springfield",
    "why they get it, and who and where",
  );
  assert.match(made[0].footer, /\nUnsubscribe: https:\/\/app\.example\.com\/u\//);
  assert.doesNotMatch(made[0].footer, /Reply STOP/);
  assert.equal(sendsOf(f)[0].about, "ours");
  assert.equal(
    sendsOf(f)[0].purpose,
    "conversational",
    "the message's own purpose is kept: the door decides what it is",
  );
  // A person who asked for offers by email says so.
  const asked = news({
    batch: [on("email", "k1", null)],
    contacts: (ids) => new Map(ids.map((id) => [id, { ...reachable[id], email_marketing: "opted_in" }])),
  });
  await sendBroadcastBatch(asked.f.ports, cmd());
  assert.match(asked.made[0].footer, /^You asked for offers from Marisa's\./);
  // A visit's email (the same words, a run made for the day before) has no link, and the visit foot's way out.
  const seen = [];
  const visit = world({ batch: [on("email")], emailRequest: (i) => (seen.push(i), frozen(i)) });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.equal(seen[0].offer, undefined, "no offer's link or HTML foot");
  assert.match(seen[0].footer, /Reply STOP/);
});

test("the business's own news by email is held when the business has no postal address or no link can be sealed, as an offer is; a visit's email is sent without either", async () => {
  const noAddress = news({ batch: [on("email", "k1", null)], facts: { ...visitFacts, address: null } });
  await sendBroadcastBatch(noAddress.f.ports, cmd());
  assert.deepEqual(noAddress.f.marks(), [["k1", "skipped", "no_business_address"]], "held before anyone is claimed");
  assert.equal(noAddress.made.length, 0);
  assert.equal(noAddress.f.of("queueEmail").length, 0);
  assert.ok("no_business_address" in HELD_REASONS);
  const noLink = news({ batch: [on("email", "k1", null)], unsubscribeUrl: null });
  await sendBroadcastBatch(noLink.f.ports, cmd());
  assert.deepEqual(noLink.f.marks(), [["k1", "skipped", "no_channel"]]);
  // The visit's run in the same workspace: no address needed, no link asked for.
  const visit = world({ batch: [on("email")], facts: { ...visitFacts, address: null }, unsubscribeUrl: null });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.deepEqual(visit.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
});

test("the batch's head holds news by email as it holds an offer: a campaigns domain the provider does not verify skips the email people, one that could not be asked waits; a visit's run and a WhatsApp-only batch are not asked", async () => {
  const closed = news({
    batch: [on("email", "k1", null), on("whatsapp", "k2", null)],
    offersClosed: "campaigns.example.com is not verified",
    byOtherChannels: true,
  });
  closed.f.ports.page = async () => undefined;
  await sendBroadcastBatch(closed.f.ports, cmd());
  assert.ok(!closed.f.ops().includes("fail"), "the run is not failed");
  assert.deepEqual(
    closed.f.marks(),
    [
      ["k1", "skipped", "email_marketing_disabled"],
      ["k2", "failed", OUTCOME_UNKNOWN],
      ["k2", "sent", null],
    ],
    "the email person is held for it, never claimed; the WhatsApp person is sent",
  );
  assert.deepEqual(
    sendsOf(closed.f).map((d) => d.channel),
    ["whatsapp"],
  );
  // News by email alone stops the run with that said, as an offer's does: nobody is claimed or held.
  const alone = news({ batch: [on("email", "k1", null)], offersClosed: "campaigns.example.com is not verified" });
  await sendBroadcastBatch(alone.f.ports, cmd());
  assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "campaigns_domain_unverified"]);
  assert.deepEqual(alone.f.marks(), [], "nobody is claimed or held");
  assert.equal(sendsOf(alone.f).length, 0);
  const unread = news({
    batch: [on("email", "k1", null)],
    offersUnread: "the provider could not be asked",
    remaining: 1,
  });
  await sendBroadcastBatch(unread.f.ports, cmd());
  assert.ok(!unread.f.ops().includes("fail") && unread.f.ops().includes("scheduleNext"), "waits and asks again");
  assert.deepEqual(unread.f.marks(), []);
  // A visit's email is not an offer: the same closed domain does not hold it.
  const visit = world({ batch: [on("email")], offersClosed: "campaigns.example.com is not verified" });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.deepEqual(visit.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
  // Nobody in the batch goes by email: the campaigns domain is never asked about.
  const whatsapp = news({
    batch: [on("whatsapp", "k1", null)],
    offersClosed: new Error("never asked"),
    offersUnread: new Error("never asked"),
  });
  await sendBroadcastBatch(whatsapp.f.ports, cmd());
  assert.equal(sendsOf(whatsapp.f).length, 1);
});

/* ---------- A message needs no WhatsApp row (Lane 1): the batch reads the message once, and each person goes on their version -- */

test("a message with no WhatsApp row and a utility category goes to its email and text people on their own versions, as a message about their visit, and nobody is skipped for a WhatsApp row it has not got", async () => {
  const asked = [];
  const own = world({
    batch: [on("email"), on("sms", "k2"), on("email", "k3")],
    message: versionsOf(asked, { email: visitRows.email, sms: visitRows.sms }),
    // The adapter answers from the run's people: the email and the text people are not WhatsApp's.
    byOtherChannels: true,
  });
  await sendBroadcastBatch(own.f.ports, cmd());
  assert.deepEqual(own.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
    ["k2", "failed", OUTCOME_UNKNOWN],
    ["k2", "sent", null],
    ["k3", "failed", OUTCOME_UNKNOWN],
    ["k3", "sent", null],
  ]);
  assert.deepEqual(
    sendsOf(own.f).map((d) => [d.contactId, d.channel, d.purpose]),
    [
      ["k1", "email", "conversational"],
      ["k2", "sms", "conversational"],
      ["k3", "email", "conversational"],
    ],
    "the own rows' category is the message's: a visit's words ask the yes to hearing from them, not the offers yes",
  );
  assert.ok(!own.f.ops().includes("fail"), "the run is not failed for a WhatsApp row it never had");
  assert.ok(own.f.ops().includes("finish"));
  assert.deepEqual(asked, [["visit_reminder", "en_US"]], "the message is read once for the batch");
});

test("a marketing message with no WhatsApp row is an offer by email as any is: held for the business's postal address without one; a utility one goes without", async () => {
  const noAddress = { ...visitFacts, address: null };
  const offer = world({
    batch: [on("email")],
    facts: noAddress,
    message: versionsOf([], { email: { ...visitRows.email, category: "marketing" } }),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(offer.f.ports, cmd());
  assert.deepEqual(offer.f.marks(), [["k1", "skipped", "no_business_address"]], "held before anyone is claimed");
  assert.equal(offer.f.of("queueEmail").length, 0);
  assert.equal(sendsOf(offer.f).length, 0);
  const visit = world({
    batch: [on("email")],
    facts: noAddress,
    message: versionsOf([], { email: visitRows.email }),
    byOtherChannels: true,
  });
  await sendBroadcastBatch(visit.f.ports, cmd());
  assert.deepEqual(visit.f.marks(), [
    ["k1", "failed", OUTCOME_UNKNOWN],
    ["k1", "sent", null],
  ]);
  assert.equal(sendsOf(visit.f)[0].purpose, "conversational");
});

test("a message whose WhatsApp row is waiting, or whole to nobody, holds its WhatsApp people alone: the people on email go on their version and the run is not failed", async () => {
  const held = {
    pending: { ...visitRows.whatsapp, meta_status: "pending" },
    // Approved by Meta, but with a picture for a heading, which this product cannot put on the wire (contracts templateBlocked).
    blocked: {
      ...visitRows.whatsapp,
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: VISIT_WORDS },
      ],
    },
  };
  for (const [why, whatsapp] of Object.entries(held)) {
    const asked = [];
    const mixed = world({
      batch: [on("whatsapp"), on("email", "k3")],
      message: versionsOf(asked, { whatsapp, email: visitRows.email }),
      byOtherChannels: true,
    });
    await sendBroadcastBatch(mixed.f.ports, cmd());
    assert.deepEqual(
      mixed.f.marks(),
      [
        ["k1", "skipped", "template_not_approved"],
        ["k3", "failed", OUTCOME_UNKNOWN],
        ["k3", "sent", null],
      ],
      why,
    );
    assert.deepEqual(
      sendsOf(mixed.f).map((d) => [d.contactId, d.channel, d.purpose]),
      [["k3", "email", "conversational"]],
      why,
    );
    assert.ok(!mixed.f.ops().includes("fail"), `${why}: the run is not failed, somebody on it can be reached`);
    assert.ok(mixed.f.ops().includes("finish"), why);
    assert.deepEqual(asked, [["visit_reminder", "en_US"]], `${why}: one read`);
  }
});

test("a message whose only row is a WhatsApp one that cannot be sent, with everyone on the run going by WhatsApp, fails the run before a single send, and the owner is told why in the message's own words", async () => {
  const stopped = async (message) => {
    const alone = world({ batch: [on("whatsapp")], message, byOtherChannels: false });
    await sendBroadcastBatch(alone.f.ports, cmd());
    assert.deepEqual(alone.f.ops(), ["startSending", "fail", "alert"]);
    assert.deepEqual(call(alone.f.log, "fail").slice(1), ["b1", "template_not_approved"]);
    const alert = call(alone.f.log, "alert")[1];
    assert.deepEqual(
      [alert.kind, alert.route, alert.about],
      ["broadcast_stopped", "broadcasts", { type: "broadcast", id: "b1" }],
    );
    assert.equal(alert.subject, "Broadcast “Visit reminder · 2026-09-11” stopped");
    return alert.body;
  };
  assert.equal(
    await stopped(versionsOf([], { whatsapp: { ...visitRows.whatsapp, meta_status: "pending" } })),
    "WhatsApp is still reviewing this message's WhatsApp version. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
  assert.equal(
    await stopped(versionsOf([], { whatsapp: { ...visitRows.whatsapp, meta_status: "rejected" } })),
    "WhatsApp refused this message's WhatsApp version. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
  assert.equal(
    await stopped(
      versionsOf([], {
        whatsapp: {
          ...visitRows.whatsapp,
          components: [
            { type: "HEADER", format: "IMAGE" },
            { type: "BODY", text: VISIT_WORDS },
          ],
        },
      }),
    ),
    "This message's WhatsApp version has a picture for a heading, so it cannot be sent from here. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
  // The message has no row at all (the workspace removed its last version): it has no WhatsApp version to send.
  assert.equal(
    await stopped([]),
    "This message has no WhatsApp version. Everyone on this run goes by WhatsApp, so nothing was sent.",
  );
});

test("a read of the message that throws leaves the batch unsent and the error up, for the job to try again: the run is neither failed nor told WhatsApp withdrew it", async () => {
  const timeout = new Error("canceling statement due to statement timeout");
  const lost = world({ batch: [on("whatsapp"), on("email", "k3")], message: timeout, byOtherChannels: false });
  await assert.rejects(sendBroadcastBatch(lost.f.ports, cmd()), timeout);
  assert.deepEqual(lost.f.ops(), ["startSending"], "marked sending, as the batch's first write; nothing else written");
  assert.deepEqual(lost.f.marks(), [], "nobody is claimed or held");
});

/* --------------------------------------------------------------------- an appointment asked again (decision 0002) */

test("a reminder asks its appointment again at the send: one cancelled, or gone from the calendar or moved after the run read it, holds its person (appointment_changed) and nobody else; one that stands, one the record has not written, a run drawn before the record, and one whose row is older than the run go; the rows are read once for the batch, and a read that fails holds nobody", async () => {
  const start = "2026-09-12T14:00:00.000Z";
  const read = "2026-09-11T13:05:00.000Z"; // the run read the calendar the day before
  const older = "2026-09-11T12:23:00.000Z"; // the hourly sync before the run
  const later = "2026-09-11T13:23:00.000Z"; // the one after it
  const drawn = (key) => ({ ...VISIT, appointment: key, visit_start: start, appointment_read_at: read });
  const batch = [
    on("sms", "k1", drawn("cancelled-one")),
    on("sms", "k2", drawn("stands")),
    on("sms", "k3", drawn("not-written")),
    on("sms", "k4", VISIT),
  ];
  const rows = new Map([
    ["cancelled-one", { status: "cancelled", starts_at: start, vanished_at: null, updated_at: older }],
    ["stands", { status: "booked", starts_at: start, vanished_at: null, updated_at: older }],
  ]);
  const asked = [];
  const { f } = world({
    batch,
    appointments: (keys) => {
      asked.push(keys);
      return rows;
    },
    contacts: (ids) =>
      new Map(
        ids.map((id) => [
          id,
          { ...reachable.k1, id, phone_e164: `+1347555010${id.slice(1)}`, display_name: `Person ${id}` },
        ]),
      ),
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(asked, [["cancelled-one", "stands", "not-written"]], "one read, the batch's keys once each");
  assert.deepEqual(
    f.marks().filter(([, state]) => state !== "failed"),
    [
      ["k1", "skipped", "appointment_changed"],
      ["k2", "sent", null],
      ["k3", "sent", null],
      ["k4", "sent", null],
    ],
  );
  assert.equal(HELD_REASONS.appointment_changed, "their appointment moved or was cancelled");

  // Gone from the calendar, or moved, at a read after the run's: held too.
  for (const row of [
    { status: "booked", starts_at: start, vanished_at: later, updated_at: later },
    { status: "booked", starts_at: "2026-09-12T15:00:00.000Z", vanished_at: null, updated_at: later },
  ]) {
    const { f: g } = world({ batch: [on("sms", "k1", drawn("x"))], appointments: () => new Map([["x", row]]) });
    await sendBroadcastBatch(g.ports, cmd());
    assert.deepEqual(
      g.marks().filter(([, s]) => s !== "failed"),
      [["k1", "skipped", "appointment_changed"]],
    );
  }

  // The row is the older read: the owner moved the visit, or put it back, after the sync and before the run, and the
  // run's words say the time it saw. Sent, never held for the record's older word.
  for (const row of [
    { status: "booked", starts_at: "2026-09-12T13:00:00.000Z", vanished_at: null, updated_at: older },
    { status: "booked", starts_at: start, vanished_at: older, updated_at: older },
  ]) {
    const { f: g } = world({ batch: [on("sms", "k1", drawn("x"))], appointments: () => new Map([["x", row]]) });
    await sendBroadcastBatch(g.ports, cmd());
    assert.deepEqual(
      g.marks().filter(([, s]) => s !== "failed"),
      [["k1", "sent", null]],
    );
  }

  // A read that fails holds nobody: the run read the live calendar when it drew them.
  const { f: h } = world({ batch: [on("sms", "k1", drawn("x"))], appointments: new Error("statement timeout") });
  await sendBroadcastBatch(h.ports, cmd());
  assert.deepEqual(
    h.marks().filter(([, s]) => s !== "failed"),
    [["k1", "sent", null]],
  );
});

/* ---------------------------------------------- the week's breath, at the wire (a send by hand) */

test("a person a send by hand left out for the week's breath is skipped at the wire with its reason and sent nothing, whatever the hold after the run did; a row with no such mark is sent as before", async () => {
  const { LEFT_OUT_FACTS, RECIPIENT_REASON_HEARD } = await import("@chanlytics/contracts");
  const f = fakes({
    batch: [
      // Marked in the run's own write (core createBroadcast); the hold after it lost the race to this batch.
      { contact_id: "k1", facts: LEFT_OUT_FACTS },
      // A row of the older shape, written before the breath: no facts at all.
      { contact_id: "k2", facts: null },
    ],
  });
  await sendBroadcastBatch(f.ports, cmd());
  assert.deepEqual(
    f.marks().filter(([, state]) => state !== "failed"),
    [
      ["k1", "skipped", RECIPIENT_REASON_HEARD],
      ["k2", "sent", null],
    ],
  );
  assert.deepEqual(
    f.of("deliver").map(([, d]) => d.contactId),
    ["k2"],
    "nothing went to the person left out",
  );
  assert.equal(HELD_REASONS[RECIPIENT_REASON_HEARD], "not sent: heard from you within the week");
});
