/**
 * A caller who asked to be called back was dropped when the provider's "call analysed" delivery was lost (the wiring's
 * second audit, R11 S11-3): the hold, the owner's bell and the mail are all made by the webhook's plan for that one
 * delivery, and the calls sweep only ever asked about calls still marked ongoing.
 *
 * Now the sweep asks the provider about a call whose owner was never told, from ten minutes after it ended (the
 * webhook's own time) for two hours, and once the provider has the analysis it runs the webhook's second half on it
 * (settleCall): the hold, the bell and the mail, once, the claim on the call's row keeping them to once whichever comes
 * first. A call it has not analysed yet is asked again next tick; a hang-up, a call already told, one too young or too
 * old is not asked about. When both deliveries are lost, the stale call the sweep closes is settled the same way.
 *
 * The real door, the real sweep, over the voice webhook's world: a database in memory, the provider's read of a call
 * answered from a map, everything else on the wire answered 200.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at, openDoor, wire, ingests, DUPLICATE, NOW, iso } from "./_retell-webhook-world.mjs";

// The door reads its keys at import; openDoor() imports it AFTER these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { deliver, world } = await openDoor();
const calls = await import(at("apps/edge/api/cron/calls.ts"));

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LENGTH = 125_000;

/** The sweep's key, as Vault gives it to the door. */
const KEY = "sweep-key-for-this-file";
const SWEEP = { get_cron_sweep_key: () => KEY };
/** One tick of the calls clock, as pg_cron knocks. */
async function tick() {
  const res = await calls.POST(
    new Request("http://edge/api/cron/calls", { method: "POST", headers: { "x-cron-key": KEY } }),
  );
  return [res.status, await res.json()];
}

/**
 * The wire, with the provider's read of a call answered from `provider`: the call it has, or a 404 for one it does not.
 * Every request is captured, the reads among them.
 */
function line(provider) {
  const w = wire();
  const rest = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const m = /\/v2\/get-call\/([^/?]+)$/.exec(String(url));
    if (!m) return rest(url, init);
    w.calls.push({ url: String(url), init, budgetMs: null });
    const call = provider.get(decodeURIComponent(m[1]));
    return call ? Response.json(call) : Response.json({ message: "call not found" }, { status: 404 });
  };
  return { ...w, reads: () => w.to("/v2/get-call/").map((c) => c.url.slice(c.url.lastIndexOf("/") + 1)) };
}

/**
 * When a call ended `agoMs` before now, after `length` on the line. No recording: its copy is the recordings leg's,
 * proved in the calls sweep's own file, and a copy left pending would be one more read of the provider here.
 */
const when = (agoMs, length = LENGTH) => ({
  start_timestamp: NOW - agoMs - length,
  end_timestamp: NOW - agoMs,
  duration_ms: length,
  recording_url: undefined,
});
/** "call_ended" as the provider sends it: no analysis yet. */
const ended = (w, id, agoMs, over = {}) =>
  w.call(id, { call_status: "ended", disconnection_reason: "user_hangup", ...when(agoMs), ...over });
/** The analysis of a caller who asked to be called back. */
const callBack = {
  call_summary: "Rosa needs someone to call her back about a piano.",
  user_sentiment: "Neutral",
  call_successful: false,
  in_voicemail: false,
  custom_analysis_data: {
    caller_name: "Rosa",
    caller_wanted: "to move a piano on Saturday",
    outcome: "callback_needed",
    follow_up: "Call Rosa back about the piano move on Saturday.",
  },
};
const settles = (candidates, settled, notYet) => ({ candidates, settled, notYet, unroutable: 0, deferred: 0 });

test("a call back whose 'call analysed' never came is settled by the sweep once the provider has the analysis: the hold, the bell and the mail, once; the next tick asks nothing, and the delivery that comes after all is a duplicate", async () => {
  const w = world();
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: { notifications: { escalation_emails: ["owner@harbor.test"] } },
  });
  const provider = new Map();
  const net = line(provider);
  try {
    const id = w.callId("lost");
    w.open({}, SWEEP);
    // The call ends twenty minutes ago, and its "call analysed" delivery is lost.
    const res = await deliver("call_ended", ended(w, id, 20 * MIN));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    const row = w.tables.calls[0];
    assert.deepEqual(
      [row.status, row.summary, row.notified_at, !!row.conversation_id],
      ["ended", null, null, true],
      "ended, unanalysed, in the caller's thread, and its owner never told",
    );
    assert.deepEqual([w.tables.escalations.length, w.tables.notifications.length], [0, 0]);

    provider.set(id, w.analysed(id, { ...when(20 * MIN), call_analysis: callBack }));
    const [status, body] = await tick();
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body.settles, settles(1, 1, 0));
    assert.deepEqual(net.reads(), [id], "the provider was asked for the one call");

    const thread = w.tables.conversations.find((c) => c.id === row.conversation_id);
    assert.equal(thread.state, "needs_human", "on Needs you");
    assert.equal(
      thread.paused_until,
      iso(NOW - 20 * MIN + DAY),
      "held for the default day, measured from the call's end, not from the tick that settled it",
    );
    assert.deepEqual(
      w.tables.escalations.map((e) => [e.conversation_id, e.reason, e.details]),
      [[thread.id, "callback", "Call Rosa back about the piano move on Saturday."]],
      "the call back is a hold with its to-do, as the delivery would have made it",
    );
    assert.deepEqual(
      w.tables.notifications.map((n) => [n.kind, n.subject_type, n.subject_id, n.title]),
      [["call", "conversation", thread.id, "Rosa phoned · 2 min · needs a call back"]],
      "the owner's bell, about the thread",
    );
    assert.deepEqual(
      net.mail().map((m) => m.subject),
      ["Rosa phoned · 2 min · needs a call back"],
    );
    assert.ok(row.notified_at, "claimed: the notice is this call's, once");
    assert.equal(row.summary, callBack.call_summary, "and the row has the analysis");

    // The next tick: the row is claimed, so nothing is asked.
    const [, next] = await tick();
    assert.deepEqual(next.settles, settles(0, 0, 0));
    assert.equal(net.reads().length, 1);

    // The delivery comes after all, over the refusals Postgres would give a second hold and a second line.
    w.tables.escalations[0].state = "open";
    w.open(
      {
        "escalations.insert": DUPLICATE("escalations_one_open"),
        "messages.insert": DUPLICATE("messages_tenant_external_uq"),
      },
      SWEEP,
    );
    const late = await deliver("call_analyzed", w.analysed(id, { ...when(20 * MIN), call_analysis: callBack }));
    assert.deepEqual([late.status, await late.json()], [200, { ok: true, duplicate: true }]);
    assert.deepEqual(
      [w.tables.escalations.length, w.tables.notifications.length, net.mail().length],
      [1, 1, 1],
      "told once, whichever came first",
    );
  } finally {
    net.restore();
  }
});

test("the sweep asks only about a call it can settle: ended past the webhook's ten minutes and inside two hours, longer than a hang-up, its owner never told; one the provider has not analysed yet is asked again next tick, and settled when it has", async () => {
  const w = world();
  const provider = new Map();
  const net = line(provider);
  try {
    w.open({}, SWEEP);
    const id = (tag) => w.callId(tag);
    const from = (n) => `+1646555014${n}`;
    const delivered = async (event, call) => {
      const res = await deliver(event, call);
      assert.equal(res.status, 200, `${event} ${call.call_id}`);
    };
    await delivered("call_ended", ended(w, id("pending"), 20 * MIN, { from_number: from(1) }));
    await delivered("call_ended", ended(w, id("early"), 5 * MIN, { from_number: from(2) }));
    await delivered("call_ended", ended(w, id("old"), 3 * HOUR, { from_number: from(3) }));
    await delivered("call_ended", ended(w, id("hangup"), 20 * MIN, { from_number: from(4), ...when(20 * MIN, 8_000) }));
    // Told the usual way: its analysis came.
    await delivered("call_analyzed", w.analysed(id("told"), { from_number: from(5), ...when(20 * MIN) }));
    assert.equal(w.tables.notifications.length, 1, "the one whose analysis came was told");

    // The provider has not analysed the pending call yet: it says the call ended, nothing more.
    provider.set(id("pending"), ended(w, id("pending"), 20 * MIN, { from_number: from(1) }));
    const [s1, b1] = await tick();
    assert.equal(s1, 200, JSON.stringify(b1));
    assert.deepEqual(b1.settles, settles(1, 0, 1));
    assert.deepEqual(
      net.reads(),
      [id("pending")],
      "not the call five minutes old (the webhook's time), the one three hours old (past the two), the hang-up, or the call already told",
    );
    assert.equal(w.tables.notifications.length, 1, "nothing settled, nobody told yet");

    // It has now.
    provider.set(id("pending"), w.analysed(id("pending"), { from_number: from(1), ...when(20 * MIN) }));
    const [s2, b2] = await tick();
    assert.equal(s2, 200, JSON.stringify(b2));
    assert.deepEqual(b2.settles, settles(1, 1, 0));
    assert.deepEqual(net.reads(), [id("pending"), id("pending")]);
    const pending = w.tables.calls.find((c) => c.retell_call_id === id("pending"));
    assert.ok(pending.notified_at, "claimed");
    assert.equal(w.tables.notifications.length, 2, "the owner told of it, once");
    assert.equal(w.tables.escalations.length, 0, "a call answered asks for no hold");

    const [, b3] = await tick();
    assert.deepEqual(b3.settles, settles(0, 0, 0), "and never asked about again");
    assert.equal(net.reads().length, 2);
  } finally {
    net.restore();
  }
});

test("both deliveries lost: a call left 'ongoing' that the provider says has ended with its analysis is settled as the webhook would have settled it, ingested once, the call back held and its owner told once", async () => {
  const w = world();
  const provider = new Map();
  const net = line(provider);
  try {
    const id = w.callId("silent");
    w.open({}, SWEEP);
    const started = await deliver(
      "call_started",
      w.call(id, { call_status: "ongoing", start_timestamp: NOW - 20 * MIN - LENGTH }),
    );
    assert.equal(started.status, 200);
    const row = w.tables.calls[0];
    assert.equal(row.status, "ongoing");
    // Nobody has heard from it for ten minutes: the sweep's stale leg asks about it.
    row.updated_at = iso(NOW - 10 * MIN);

    provider.set(id, w.analysed(id, { ...when(20 * MIN), call_analysis: callBack }));
    const db = w.open({}, SWEEP);
    const [status, body] = await tick();
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual([body.candidates, body.closed], [1, 1], "asked about, and closed");
    assert.deepEqual(body.settles, settles(0, 0, 0), "settled by the stale leg, so the settle leg finds it told");
    assert.deepEqual(net.reads(), [id], "one read of the provider");
    assert.equal(ingests(db).length, 1, "ingested once, by the settle, not again beside it");
    assert.deepEqual([row.status, row.summary, !!row.notified_at], ["ended", callBack.call_summary, true]);
    const thread = w.tables.conversations.find((c) => c.id === row.conversation_id);
    assert.equal(thread.state, "needs_human");
    assert.deepEqual(
      w.tables.escalations.map((e) => [e.conversation_id, e.reason]),
      [[thread.id, "callback"]],
    );
    assert.deepEqual(
      w.tables.notifications.map((n) => n.title),
      ["Rosa phoned · 2 min · needs a call back"],
    );
  } finally {
    net.restore();
  }
});
