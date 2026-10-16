/**
 * 00405 on a real Postgres: campaign_ledger, the Campaigns lens' own read. campaign_series counts messages and cannot say
 * people, why sends failed, what was held or how long an approval waited; this counts them, as people and as counts only.
 *
 * The first test builds one busy week (the controller's brief spells out what it must answer); the later ones hold the
 * same read to the funnel (and to its rule of what a reply is, against messages that look like one), to the workspace's
 * own day in a zone east of UTC, to a window that ended and a workspace that has nothing, to the run lead, to the closed
 * words a failure is told in, and to the edge of every bucket. The world they share is _ledger-world.mjs. Each test builds
 * its own workspace; they are removed when the file ends. Every window is the last 7 days in UTC unless a test says
 * otherwise. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { BROADCAST_SCHEDULE_MAX_DAYS } from "@chanlytics/contracts";
import {
  ANON,
  DAY,
  HOUR,
  URL_,
  cleanup,
  dayAt,
  dayFrom,
  db,
  insert,
  localAt,
  member,
  messageRow,
  ok,
  skip,
  skipMembers,
  ymd,
} from "./_answers-world.mjs";
import {
  MINUTE,
  PHONE,
  ZONE,
  busyWeek,
  decide,
  erase,
  hold,
  lab,
  ledger,
  person,
  reply,
  run,
  say,
  send,
  sum,
} from "./_ledger-world.mjs";

after(cleanup);

test(
  "the world of a busy week: people, runs, held, stopped, failed, messages, first replies and waits",
  { skip },
  async () => {
    const { l, runs } = await busyWeek("harbor-ledger-week");
    const r = await ledger(l);
    assert.equal(r.timezone, "UTC");
    assert.equal(r.days, 7);
    assert.deepEqual(r.people, {
      now: { sent_to: 9, wrote_back: 3, counting: 1 },
      before: { sent_to: 3, wrote_back: 1 },
    });
    const runsOf = { now: { moment: 2, broadcast: 1 }, before: { moment: 1, broadcast: 0 } };
    assert.deepEqual(r.runs, runsOf);
    assert.deepEqual(r.held, {
      total: 4,
      skipped: 3,
      failed: 1,
      by_reason: { opted_out: 1, no_phone: 1, send_failed: 1, other: 1 },
    });
    assert.deepEqual(r.stopped, { failed: 2, canceled: 1, by_failure: { paused: 1, "wire_unavailable:sms": 1 } });
    assert.deepEqual(r.failed_sends, {
      total: 3,
      by_code: [
        { channel: "whatsapp", code: 131049, kind: null, n: 2 },
        { channel: "sms", code: 30003, kind: null, n: 1 },
      ],
    });
    const said = JSON.stringify(r);
    assert.ok(!said.includes("0100") && !said.includes("555"), "no number, not the reason's nor the body's, comes out");
    assert.deepEqual(r.by_message, [
      { name: "winback_offer", language: "en_US", sent: 7, mature: 6, replied: 2 },
      { name: "spring_note", language: "en_US", sent: 3, mature: 3, replied: 2 },
    ]);
    assert.deepEqual(r.first_reply, {
      n: 4,
      median_s: 4200,
      buckets: { m15: 1, h1: 1, h4: 1, h24: 0, h72: 1 },
    });
    // 55 and 90 minutes, and twenty hours: the reach-out step's wait counts as any run's does.
    assert.deepEqual(r.approval, { n: 3, median_s: 5400, buckets: { h1: 1, h4: 1, h24: 1, over: 0 } });

    // A deleted playbook leaves its run looking like a one-off: the run keeps its kind from its audience (trap 10).
    ok(await db.from("sequence_batches").update({ step_id: null }).eq("id", runs.M1).select("id"));
    assert.deepEqual((await ledger(l)).runs, runsOf, "a moment whose playbook is gone is still a moment");
  },
);

test("the funnel and this read count one set of sends", { skip }, async () => {
  const { l, sends, runs } = await busyWeek("harbor-ledger-funnel");
  const r = await ledger(l);
  const funnel = ok(await db.rpc("campaign_series", { p_tenant_id: l.tenantId, p_days: 7 }));
  const current = funnel.series.slice(-7);
  assert.equal(sum(current, "replied"), r.first_reply.n, "the funnel's replies are the first replies");
  assert.equal(sum(current, "sent"), sum(r.by_message, "sent"), "the days' sends are the messages' sends");
  assert.equal(
    sum(funnel.by_channel, "sent"),
    sum(r.by_message, "sent"),
    "the channels' sends are the messages' sends",
  );
  assert.ok(r.people.now.sent_to <= sum(r.by_message, "sent"), "a person is at most a send");
  assert.ok(r.people.now.sent_to < sum(r.by_message, "sent"), "and a person on two runs is one person here");
  const matureReplies = sends.filter((s) => s.replied && s.at + 72 * HOUR <= Date.now()).length;
  assert.equal(sum(r.by_message, "replied"), matureReplies, "the messages' replies are the mature replies");
  assert.equal(sends.length, sum(r.by_message, "sent"));

  // An erased person stays one who was sent to: the run's record of them is kept, their thread and message are gone, so
  // they are a send and a person and can never be a reply or a failure. The funnel counts them as a send too.
  const gone = await person(l);
  await send(l, runs.M1, gone, { at: dayAt(5, 9, 40) });
  await erase(l, gone);
  const kept = ok(await db.from("sequence_sends").select("state, message_id").eq("contact_id", gone.contact));
  assert.deepEqual(kept, [{ state: "sent", message_id: null }], "the run's record of them survives, without a message");
  const later = await ledger(l);
  assert.deepEqual(later.people.now, {
    sent_to: r.people.now.sent_to + 1,
    wrote_back: r.people.now.wrote_back,
    counting: r.people.now.counting,
  });
  const [was, now] = [r.by_message, later.by_message].map((rows) => rows.find((m) => m.name === "winback_offer"));
  assert.deepEqual(now, { ...was, sent: was.sent + 1, mature: was.mature + 1 }, "a send and a mature one, not a reply");
  assert.deepEqual(later.first_reply, r.first_reply);
  assert.deepEqual(later.failed_sends, r.failed_sends);
  const funnelLater = ok(await db.rpc("campaign_series", { p_tenant_id: l.tenantId, p_days: 7 })).series.slice(-7);
  assert.equal(
    sum(funnelLater, "sent"),
    sum(later.by_message, "sent"),
    "the funnel counts the erased person's send too",
  );
  assert.equal(sum(funnelLater, "replied"), later.first_reply.n);
});

test("a reply is what the funnel says it is: inbound, from the customer, in their own words", { skip }, async () => {
  const l = await lab("harbor-ledger-lookalikes");
  const at = dayAt(5, 9); // old enough that every send is mature
  const R = await run(l, { name: "Look-alikes", kind: "broadcast", created: at - HOUR, at });
  // A message that looks like a reply and is not, each wrong in one way alone (so each predicate of the probe is needed).
  const outbound = { direction: "outbound", sender: "customer" }; // its direction alone: no writer makes this
  const note = { sender: "system" }; // an inbound row the system wrote, as a call's note is: its sender alone
  const automatic = (claim) => ({ channel: "email", meta: { email: { claim } } }); // its words alone
  const lookalikes = [
    ["an outbound message", outbound],
    ["a call's note", note],
    ...["automated", "auto_reply", "report", "booking_notice", "forwarding_confirmation"].map((claim) => [
      `an email read as ${claim}`,
      automatic(claim),
    ]),
  ];
  const lonely = [];
  for (const [what, shape] of lookalikes) {
    const p = await person(l);
    await send(l, R, p, { at });
    await say(l, p, { at: at + 10 * MINUTE, ...shape });
    lonely.push(what);
  }
  // One person gets all three kinds, then the real reply: it is their first reply, two hours in.
  const mixed = await person(l);
  await send(l, R, mixed, { at });
  await say(l, mixed, { at: at + 10 * MINUTE, ...outbound });
  await say(l, mixed, { at: at + 20 * MINUTE, ...note });
  await say(l, mixed, { at: at + 30 * MINUTE, ...automatic("auto_reply") });
  await reply(l, mixed, at + 2 * HOUR);
  // And an email that a person wrote (a message with no claim, or the claim "person") is a reply on any channel.
  const emailed = await person(l);
  await send(l, R, emailed, { at });
  await say(l, emailed, { at: at + 3 * HOUR, channel: "email", meta: { email: { claim: "person" } } });

  const r = await ledger(l);
  assert.deepEqual(r.people.now, { sent_to: lonely.length + 2, wrote_back: 2, counting: 0 }, lonely.join(", "));
  assert.deepEqual(r.by_message, [
    { name: "winback_offer", language: "en_US", sent: lonely.length + 2, mature: lonely.length + 2, replied: 2 },
  ]);
  assert.deepEqual(r.first_reply, {
    n: 2,
    median_s: 9000,
    buckets: { m15: 0, h1: 0, h4: 2, h24: 0, h72: 0 },
  }); // 2 h and 3 h: the real reply's time, not the look-alike's ten minutes

  // The funnel says the same of the same world.
  const funnel = ok(await db.rpc("campaign_series", { p_tenant_id: l.tenantId, p_days: 7 }));
  assert.equal(sum(funnel.series.slice(-7), "replied"), 2, "the funnel's replies");
  assert.equal(sum(funnel.by_channel, "replied"), 2);
  assert.equal(sum(funnel.series.slice(-7), "sent"), lonely.length + 2);
});

test("the days are the workspace's own: a send at 23:50 local belongs to the day before", { skip }, async () => {
  const l = await lab("harbor-ledger-east", ZONE);
  const { today } = await ledger(l);
  const first = dayFrom(today, -6);
  const late = localAt(dayFrom(first, -1), 23, 50, ZONE); // ten minutes before the window
  const early = localAt(first, 0, 10, ZONE); // ten minutes into it
  const [pLate, pEarly, hLate, hEarly] = [await person(l), await person(l), await person(l), await person(l)];
  assert.notEqual(
    ymd(early),
    first,
    "the early send is on the day before in UTC: only the workspace's zone puts it in",
  );
  const failed = { status: "failed", error: { errors: [{ code: 131049 }] } };
  const [rLate, rEarly] = [
    await run(l, { name: "Late", kind: "broadcast", created: late - 2 * HOUR, at: late }),
    await run(l, { name: "Early", kind: "broadcast", created: early - 2 * HOUR, at: early }),
  ];
  await send(l, rLate, pLate, { at: late, ...failed });
  await send(l, rEarly, pEarly, { at: early, ...failed });
  await hold(l, rLate, hLate, { reason: "opted_out" });
  await hold(l, rEarly, hEarly, { reason: "opted_out" });
  // A run that stopped at each edge, and an approval at each (the run made 70 minutes before the second).
  await run(l, {
    name: "Stopped late",
    kind: "broadcast",
    state: "failed",
    failure: "paused",
    created: late - HOUR,
    at: late,
  });
  await run(l, {
    name: "Stopped early",
    kind: "broadcast",
    state: "failed",
    failure: "paused",
    created: early - HOUR,
    at: early,
  });
  const [wLate, wEarly] = [
    await run(l, { name: "Waited late", kind: "broadcast", created: late - 2 * HOUR, at: late }),
    await run(l, { name: "Waited early", kind: "broadcast", created: early - 70 * MINUTE, at: early }),
  ];
  await decide(l, wLate, "send_broadcast", late, { approved: true });
  await decide(l, wEarly, "send_broadcast", early, { approved: true });

  const r = await ledger(l);
  assert.deepEqual(r.people, {
    now: { sent_to: 1, wrote_back: 0, counting: 0 },
    before: { sent_to: 1, wrote_back: 0 },
  });
  assert.deepEqual(r.runs.now, { moment: 0, broadcast: 1 });
  assert.deepEqual(r.runs.before, { moment: 0, broadcast: 1 });
  assert.equal(r.held.total, 1, "the held person of the run that went out at 00:10 local");
  assert.deepEqual(r.stopped, { failed: 1, canceled: 0, by_failure: { paused: 1 } });
  assert.equal(r.failed_sends.total, 1, "the message made at 00:10 local");
  assert.equal(r.approval.n, 1, "the approval written at 00:10 local");
  assert.equal(r.approval.median_s, 70 * 60);
  assert.equal(r.by_message[0].sent, 1);
});

test("a window that ended is complete, and a quiet workspace answers zeros", { skip }, async () => {
  const l = await lab("harbor-ledger-ended");
  const { today } = await ledger(l);
  const [pOld, pLast, pTail, pAfter, pBefore] = [
    await person(l),
    await person(l),
    await person(l),
    await person(l),
    await person(l),
  ];
  const sends = [
    ["Old", pOld, dayAt(8, 10)],
    ["Last days", pLast, dayAt(4, 15)],
    ["Tail", pTail, dayAt(2, 23, 30)], // half an hour before the window that ends two days ago closes
    ["After", pAfter, dayAt(1, 10), dayAt(4, 8)], // made in the window it would end, and it sent after it
    ["Before", pBefore, dayAt(12, 10)],
  ];
  for (const [name, p, at, created = at - 2 * HOUR] of sends) {
    await send(l, await run(l, { name, kind: "broadcast", created, at }), p, { at });
  }
  await reply(l, pOld, dayAt(8, 12));

  // The window that ended three days ago: nothing after it, and every send in it is 72 hours old by the clock, so none is
  // counting (the replies are all in, whatever the window's end: the funnel's rule).
  const ended = await ledger(l, { p_end: dayFrom(today, -3) });
  assert.equal(ended.end, dayFrom(today, -3));
  assert.equal(ended.today, today, "today is still the real one");
  assert.deepEqual(ended.people, {
    now: { sent_to: 2, wrote_back: 1, counting: 0 },
    before: { sent_to: 1, wrote_back: 0 },
  });
  assert.deepEqual(ended.by_message, [{ name: "winback_offer", language: "en_US", sent: 2, mature: 2, replied: 1 }]);
  // The window that ended two days ago has a send half an hour before its close: that is under 72 hours old now, so it
  // is counting and out of the rate, though the window ended. The sends the clock has matured are not.
  const closing = await ledger(l, { p_end: dayFrom(today, -2) });
  assert.deepEqual(closing.people, {
    now: { sent_to: 3, wrote_back: 1, counting: 1 },
    before: { sent_to: 1, wrote_back: 0 },
  });
  assert.deepEqual(closing.by_message, [{ name: "winback_offer", language: "en_US", sent: 3, mature: 2, replied: 1 }]);
  // The window that ended five days ago holds only sends older than 72 hours: none is counting.
  const older = await ledger(l, { p_end: dayFrom(today, -5) });
  assert.deepEqual(older.people, {
    now: { sent_to: 1, wrote_back: 1, counting: 0 },
    before: { sent_to: 1, wrote_back: 0 },
  });
  assert.deepEqual(older.by_message, [{ name: "winback_offer", language: "en_US", sent: 1, mature: 1, replied: 1 }]);
  assert.equal((await ledger(l, { p_end: dayFrom(today, 5) })).end, today, "a day that has not come is read as today");

  // 90 days reads (a window that ends today holds the sends under 72 hours old: counting, and not in the rate), and a
  // count of days is held to 1..90.
  const long = await ledger(l, { p_days: 90 });
  assert.equal(long.days, 90);
  assert.deepEqual(
    long.people.now,
    { sent_to: 5, wrote_back: 1, counting: 2 },
    "the send of two days ago at 23:30 and yesterday's are still counting",
  );
  assert.deepEqual(
    long.by_message,
    [{ name: "winback_offer", language: "en_US", sent: 5, mature: 3, replied: 1 }],
    "and are out of the rate",
  );
  assert.equal((await ledger(l, { p_days: 500 })).days, 90);
  assert.equal((await ledger(l, { p_days: 0 })).days, 1);

  // A workspace that has nothing answers every part with zeros, no error, nothing null but a median.
  const bare = await ledger(await lab("harbor-ledger-bare"));
  assert.equal(bare.error, undefined);
  assert.deepEqual(bare.people, {
    now: { sent_to: 0, wrote_back: 0, counting: 0 },
    before: { sent_to: 0, wrote_back: 0 },
  });
  assert.deepEqual(bare.runs, { now: { moment: 0, broadcast: 0 }, before: { moment: 0, broadcast: 0 } });
  assert.deepEqual(bare.held, { total: 0, skipped: 0, failed: 0, by_reason: {} });
  assert.deepEqual(bare.stopped, { failed: 0, canceled: 0, by_failure: {} });
  assert.deepEqual(bare.failed_sends, { total: 0, by_code: [] });
  assert.deepEqual(bare.by_message, []);
  assert.deepEqual(bare.first_reply, {
    n: 0,
    median_s: null,
    buckets: { m15: 0, h1: 0, h4: 0, h24: 0, h72: 0 },
  });
  assert.deepEqual(bare.approval, { n: 0, median_s: null, buckets: { h1: 0, h4: 0, h24: 0, over: 0 } });

  // Whose it is to read: nobody's workspace, a stranger's, an anonymous visitor's, and a member's own.
  const unknown = ok(await db.rpc("campaign_ledger", { p_tenant_id: crypto.randomUUID() }));
  assert.deepEqual(unknown, { error: "unknown_tenant" });
  if (ANON) {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await anon.rpc("campaign_ledger", { p_tenant_id: l.tenantId });
    assert.ok(refused.error, "anon may not call it");
    assert.equal(refused.data, null);
  }
  if (!skipMembers) {
    const [stranger, own] = [await member(await lab("harbor-ledger-other")), await member(l)];
    const asked = { p_tenant_id: l.tenantId, p_days: 7 };
    assert.deepEqual(ok(await stranger.rpc("campaign_ledger", asked)), { error: "unknown_tenant" });
    assert.deepEqual(
      ok(await own.rpc("campaign_ledger", asked)),
      await ledger(l),
      "a member reads what the service role reads",
    );
  }
});

/** An interval as the text PostgREST answers it ("37 days", "01:00:00"), in seconds. */
function intervalSeconds(text) {
  const parts = /^(?:(\d+) days?)?\s*(?:(\d+):(\d{2}):(\d{2}))?$/.exec(String(text).trim());
  assert.ok(parts, `an interval of whole days and clock time: ${text}`);
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = parts;
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

test("the lead is contracts' schedule horizon plus a week", { skip }, async () => {
  const lead = intervalSeconds(ok(await db.rpc("campaign_run_lead")));
  assert.equal(lead, (BROADCAST_SCHEDULE_MAX_DAYS + 7) * 86400);

  // The period before's first instant is where the lead is measured from (the earliest send the read looks at).
  const l = await lab("harbor-ledger-lead");
  const prior = dayAt(13, 0);
  const made = [
    ["36 days before", prior - 36 * DAY, true],
    ["38 days before", prior - 38 * DAY, false],
    ["a minute inside the lead", prior - lead * 1000 + MINUTE, true],
    ["a minute outside the lead", prior - lead * 1000 - MINUTE, false],
  ];
  let read = 0;
  for (const [name, created, counted] of made) {
    const at = prior + HOUR;
    await send(l, await run(l, { name, kind: "broadcast", created, at }), await person(l), { at });
    read += counted ? 1 : 0;
    const { people } = await ledger(l);
    assert.equal(people.before.sent_to, read, `a run made ${name} the first instant it is read from: ${counted}`);
  }
  assert.equal((await ledger(l)).people.now.sent_to, 0);
});

test(
  "a failure is told by a code or by one word of a closed set, never by what the provider wrote",
  { skip },
  async () => {
    const l = await lab("harbor-ledger-failures");
    const at = dayAt(4, 9);
    const R = await run(l, { name: "Spring", kind: "broadcast", created: at - HOUR, at });
    const note = `Call ${PHONE}`;
    const cases = [
      ["email", { provider: "bounced", kind: "permanent", note }],
      ["email", { provider: "bounced" }],
      ["email", { provider: "suppressed" }],
      ["email", { provider: `a sentence with ${PHONE} in it` }],
      ["email", { reason: "never_delivered", note }],
      ["sms", { carrier: "canceled" }],
      ["sms", { carrier: "undelivered" }],
      ["sms", null],
      ["sms", { code: "30003", note }],
      ["sms", { provider: "bounced" }], // an email's word on a text is no word of a text's
      ["whatsapp", { carrier: "undelivered" }], // and a text's on WhatsApp
      ["whatsapp", { reason: "orphaned" }],
      ["whatsapp", { outcome: "unknown" }], // a send the provider never answered: it may have gone
      ["sms", { outcome: "unknown", note }],
      ["email", { outcome: "unknown" }],
      ["whatsapp", { outcome: "unknown", reason: "orphaned" }], // the ledger's reason is read before the outcome
      ["email", { code: 30003, provider: "bounced" }], // an email carries no code: its word decides
      ["email", { errors: [{ code: 131049 }] }], // and with no word it is unknown, whatever number it holds
      ["email", { body: "Twilio 30034", reason: "orphaned" }],
      ["whatsapp", {}],
      ["whatsapp", { http_status: 400, body: `{"error":{"code":131047,"message":"${note}"}}` }],
      ["whatsapp", { errors: [{ code: 131049 }], body: note }],
    ];
    for (const [channel, error] of cases) {
      await send(l, R, await person(l), { at, channel, status: "failed", error });
    }
    // A person from before channels went by WhatsApp has no channel on their row, and one whose run held them failed too.
    await send(l, R, await person(l), {
      at,
      channel: "whatsapp",
      recipient: null,
      status: "failed",
      error: { errors: [{ code: 131049 }] },
    });
    await send(l, R, await person(l), { at, status: "delivered" }); // a message that arrived is no failure
    // One whose provider refused it at the wire: the run holds them as failed and their message says why, so both count.
    const refused = await person(l);
    const wire = crypto.randomUUID();
    const wireRow = messageRow(l, wire, {
      conversation: refused.conversation,
      contact: refused.contact,
      channel: "whatsapp",
      at,
    });
    await insert("messages", { ...wireRow, status: "failed", error: { code: 131047 } });
    await insert("sequence_sends", {
      tenant_id: l.tenantId,
      batch_id: R,
      contact_id: refused.contact,
      state: "failed",
      reason: "send_failed",
      message_id: wire,
      sent_at: null,
      channel: "whatsapp",
    });

    const r = await ledger(l);
    const row = (channel, code, kind, n) => ({ channel, code, kind, n });
    // By how many, then channel, then code (a code before none), then the word.
    assert.deepEqual(r.failed_sends, {
      total: 24,
      by_code: [
        row("email", null, "bounced", 3),
        row("email", null, "unknown", 2),
        row("sms", null, "unknown", 2),
        row("whatsapp", 131047, null, 2),
        row("whatsapp", 131049, null, 2),
        row("whatsapp", null, "orphaned", 2),
        row("whatsapp", null, "unknown", 2),
        row("email", null, "never_delivered", 1),
        row("email", null, "orphaned", 1),
        row("email", null, "outcome_unknown", 1),
        row("email", null, "suppressed", 1),
        row("sms", 30003, null, 1),
        row("sms", null, "canceled", 1),
        row("sms", null, "outcome_unknown", 1),
        row("sms", null, "undelivered", 1),
        row("whatsapp", null, "outcome_unknown", 1),
      ],
    });
    assert.equal(JSON.stringify(r).includes("0100"), false, "nothing the provider wrote comes out");
    assert.deepEqual(r.held, { total: 1, skipped: 0, failed: 1, by_reason: { send_failed: 1 } });
  },
);

test("a reason and a failure are told only if they are words of ours; anything else is other", { skip }, async () => {
  const l = await lab("harbor-ledger-words");
  const at = dayAt(3, 9);
  const reasons = [
    ["opted_out", "opted_out"],
    ["no_phone", "no_phone"],
    ["a" + "b".repeat(39), "a" + "b".repeat(39)], // forty characters is the longest
    ["a" + "b".repeat(40), "other"],
    ["Opted_out", "other"],
    ["_leading", "other"],
    ["with space", "other"],
    ["has1digit", "other"],
    [`call ${PHONE}`, "other"],
    ["", "other"],
    [null, "other"],
  ];
  const held = await run(l, { name: "Held", kind: "broadcast", created: at - HOUR, at });
  for (const [reason] of reasons) await hold(l, held, await person(l), { reason });
  await hold(l, held, await person(l), { state: "queued", reason: "opted_out" }); // never reached, not held
  await send(l, held, await person(l), { at }); // sent, not held
  // A run's time is when it started, else when it was to: one scheduled before the window and started in it holds its
  // people in the window; one scheduled in the window and started before it does not.
  const lateStart = await run(l, {
    name: "Late start",
    kind: "broadcast",
    created: at - 10 * DAY,
    at: dayAt(9, 9),
    startedAt: at,
  });
  const earlyStart = await run(l, {
    name: "Early start",
    kind: "broadcast",
    created: dayAt(9, 8),
    at,
    startedAt: dayAt(9, 9),
  });
  await hold(l, lateStart, await person(l), { reason: "opted_out" });
  await hold(l, earlyStart, await person(l), { reason: "no_phone" });
  const expected = { opted_out: 1 };
  for (const [, told] of reasons) expected[told] = (expected[told] ?? 0) + 1;

  const failures = [
    ["paused", "paused"],
    ["wire_unavailable:sms", "wire_unavailable:sms"],
    ["wire_unavailable:email", "wire_unavailable:email"],
    ["run_interrupted", "run_interrupted"],
    ["Paused", "other"],
    ["a:b:c", "other"],
    [":sms", "other"],
    ["throttled:", "other"],
    ["x1", "other"],
    ["paused ", "other"],
    ["wire unavailable", "other"],
    [`call ${PHONE}`, "other"],
    [null, "other"],
  ];
  for (const [failure] of failures) {
    await run(l, { name: "Stopped", kind: "broadcast", state: "failed", failure, created: at - HOUR, at });
  }
  await run(l, { name: "Canceled", kind: "broadcast", state: "canceled", failure: "paused", created: at - HOUR, at });
  const wanted = {};
  for (const [, told] of failures) wanted[told] = (wanted[told] ?? 0) + 1;

  const r = await ledger(l);
  const heldCount = reasons.length + 1;
  assert.deepEqual(r.held, { total: heldCount, skipped: heldCount, failed: 0, by_reason: expected });
  assert.deepEqual(r.stopped, { failed: failures.length, canceled: 1, by_failure: wanted });
  assert.equal(JSON.stringify(r).includes("0100"), false, "nothing a person or a program wrote comes out");
});

test(
  "every bucket takes its upper bound, and a reply is after the send and inside the 72 hours",
  { skip },
  async () => {
    const l = await lab("harbor-ledger-buckets");
    const sentAt = dayAt(5, 10);
    const R = await run(l, { name: "Edges", kind: "broadcast", created: sentAt - HOUR, at: sentAt });
    // Seconds after the send, and where the first reply falls: 15 min, 1 h, 4 h, 24 h, 72 h.
    const replies = [900, 901, 3600, 3601, 14400, 14401, 86400, 86401, 259200];
    for (const seconds of replies) {
      const p = await person(l);
      await send(l, R, p, { at: sentAt });
      // The first of them also wrote again two hours in, before the row of the first was made: the first reply is the first.
      if (seconds === 900) await reply(l, p, sentAt + 2 * HOUR);
      await reply(l, p, sentAt + seconds * 1000);
    }
    const notReplies = [0, 259201]; // at the send, and a second past the window
    for (const seconds of notReplies) {
      const p = await person(l);
      await send(l, R, p, { at: sentAt });
      await reply(l, p, sentAt + seconds * 1000);
    }

    // Waits: made 1 h before the window opens, so each decision falls on or after it (the first, exactly on it).
    const made = dayAt(7, 23);
    const waits = [3600, 3601, 14400, 14401, 86400, 86401, 172800];
    for (const seconds of waits) {
      const waited = await run(l, { name: "Waited", kind: "broadcast", created: made, at: made });
      await decide(l, waited, "send_broadcast", made + seconds * 1000, { approved: true });
    }
    const outside = await run(l, { name: "Waited before", kind: "broadcast", created: made - 5 * DAY, at: made });
    await decide(l, outside, "send_broadcast", made - 1000, { approved: true }); // a second before the window: not in it
    const never = await run(l, { name: "Declined", kind: "broadcast", created: made, at: made });
    await decide(l, never, "send_broadcast", made + 2 * HOUR, { approved: false });

    const r = await ledger(l);
    assert.deepEqual(r.first_reply, {
      n: replies.length,
      median_s: 14400,
      buckets: { m15: 1, h1: 2, h4: 2, h24: 2, h72: 2 },
    });
    const rows = (buckets) => Object.values(buckets).reduce((total, n) => total + n, 0);
    assert.equal(rows(r.first_reply.buckets), r.first_reply.n, "each row is in one bucket");
    assert.deepEqual(r.approval, { n: waits.length, median_s: 14401, buckets: { h1: 1, h4: 2, h24: 2, over: 2 } });
    assert.equal(rows(r.approval.buckets), r.approval.n);
    assert.equal(r.people.now.sent_to, replies.length + notReplies.length);
    assert.equal(r.people.now.wrote_back, replies.length);
  },
);

test(
  "by message: the name and the language apart, most sends first, ties by name, twenty at most",
  { skip },
  async () => {
    const l = await lab("harbor-ledger-messages");
    const at = dayAt(4, 9);
    const names = Array.from({ length: 22 }, (_, i) => `msg_${String(i + 1).padStart(2, "0")}`);
    // [name, language, how many people it went to]: two go to two people, and one name goes out in a second language too.
    const sent = names.map((name) => [name, "en_US", name === "msg_05" || name === "msg_17" ? 2 : 1]);
    sent.push(["msg_03", "es_ES", 1], ["winback_offer", "es_ES", 1]);
    for (const [name, lang, people] of sent) {
      const R = await run(l, { name, kind: "broadcast", template: name, lang, created: at - HOUR, at });
      for (let i = 0; i < people; i += 1) await send(l, R, await person(l), { at });
    }
    const wanted = [...sent]
      .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
      .slice(0, 20)
      .map(([name, language, n]) => ({ name, language, sent: n, mature: n, replied: 0 }));
    const r = await ledger(l);
    assert.deepEqual(r.by_message, wanted);
    assert.equal(r.by_message.length, 20);
    assert.deepEqual(
      r.by_message.slice(0, 2).map((m) => m.name),
      ["msg_05", "msg_17"],
      "the two that went to two people lead",
    );
    assert.deepEqual(
      r.by_message.filter((m) => m.name === "msg_03").map((m) => m.language),
      ["en_US", "es_ES"],
      "a message in two languages is two",
    );
    assert.ok(!r.by_message.some((m) => m.name === "msg_22"), "the twenty-first and beyond are cut");
    const everyone = sent.reduce((total, [, , people]) => total + people, 0);
    assert.equal(r.people.now.sent_to, everyone, "the people are of every message, not of the twenty shown");
  },
);

test("a reply to a send still counting is a reply, and not yet a rate", { skip }, async () => {
  const l = await lab("harbor-ledger-counting");
  const now = Date.now();
  const R = await run(l, { name: "Just now", kind: "broadcast", created: now - 50 * MINUTE, at: now - 40 * MINUTE });
  const p = await person(l);
  await send(l, R, p, { at: now - 30 * MINUTE });
  await reply(l, p, now - 10 * MINUTE);
  const r = await ledger(l);
  assert.deepEqual(
    r.people.now,
    { sent_to: 1, wrote_back: 1, counting: 1 },
    "they wrote back, and the send is still counting",
  );
  assert.deepEqual(r.by_message, [{ name: "winback_offer", language: "en_US", sent: 1, mature: 0, replied: 0 }]);
  assert.deepEqual(r.first_reply, { n: 1, median_s: 1200, buckets: { m15: 0, h1: 1, h4: 0, h24: 0, h72: 0 } });
});

test("a run's kind is told by its audience, or by its playbook; a reach-out step is neither", { skip }, async () => {
  const l = await lab("harbor-ledger-kinds");
  const kinds = [
    ["by its audience, with no playbook left", { audience: { kind: "playbook" }, playbook: false }],
    ["by its playbook, whatever its audience says", { audience: { kind: "everyone" }, playbook: true }],
    ["a one-off to everyone", { audience: { kind: "everyone" }, playbook: false }],
    ["a one-off to a saved list", { audience: { kind: "saved" }, playbook: false }],
    ["a reach-out step, which a playbook may stand behind", { audience: { kind: "reach_out" }, playbook: true }],
  ];
  for (const [i, [name, how]] of kinds.entries()) {
    const at = dayAt(i + 2, 9);
    const R = await run(l, { name, kind: "broadcast", created: at - HOUR, at, ...how });
    await send(l, R, await person(l), { at });
  }
  const r = await ledger(l);
  assert.deepEqual(r.runs.now, { moment: 2, broadcast: 2 });
  assert.deepEqual(r.runs.before, { moment: 0, broadcast: 0 });
});
