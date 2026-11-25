/**
 * The Receptionist lens's rows the nightly's workspace converges to (convergeReceptionist): what the lens makes of
 * them, a second run moving only the dates, nothing a sweep reaches, verify() naming what is wrong; and the eval's
 * Win-back, written only when asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TenantConfigWriteSchema,
  starterByName,
  closedOf,
  missedCallIsNews,
  DAY_MS,
  HOUR_MS,
  MIN_MS,
} from "@chanlytics/contracts";
import * as seed from "../../../tooling/scripts/ops/e2e-workspace.mjs";
import { runOptions, verify, CALL_ID, ALERT_INBOX, WIN_BACK } from "../../../tooling/scripts/ops/e2e-workspace.mjs";
import {
  CAMPAIGNS_PREFIX,
  CAMPAIGN_MESSAGE,
  CASEY,
  MISSED_CALL_ID,
  NOW,
  OWNER,
  RECEPTIONIST_PREFIX,
  ROBIN,
  SAM,
  localOf,
  of,
  personAt,
  personsWords,
  quietLog,
  run,
  sweepUnfinished,
  threadOf,
  world,
} from "./_workspace.mjs";

/* ---- The Receptionist lens's rows (convergeReceptionist) ---- */

test("the Receptionist lens's rows: Sam's conversation holds a week of what the lens draws, every row the seed's and dated from the run", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const cv = threadOf(w.t, T, SAM.phone);
  assert.ok(cv, "Sam has a conversation of his own");
  assert.notEqual(
    cv.id,
    threadOf(w.t, T, ROBIN.phone).id,
    "and Robin's, whose messages the other specs read, is another",
  );
  const sam = personAt(w.t, T, SAM.phone);
  const casey = personAt(w.t, T, CASEY.phone);
  const inSam = of(w.t, "messages", T).filter((m) => m.conversation_id === cv.id);
  // His thread is the Receptionist lens's, and holds the one message the Campaigns run sent him (convergeCampaigns, which
  // runs after), named by its own prefix: what is asked of the Receptionist's rows is asked of the ones it wrote.
  const thread = inSam.filter((m) => String(m.external_id).startsWith(RECEPTIONIST_PREFIX));
  assert.ok(
    inSam.every((m) => m.contact_id === sam.id) && thread.every((m) => m.contact_id === sam.id),
    "every message in it is Sam's and the seed's, named by its prefix",
  );
  assert.deepEqual(
    inSam.filter((m) => !thread.includes(m)).map((m) => m.external_id),
    [`${CAMPAIGNS_PREFIX}out-sam`],
    "and the one the Campaigns run sent him is the only other",
  );
  assert.equal(new Set(thread.map((m) => m.external_id)).size, thread.length, "each once");
  assert.equal(RECEPTIONIST_PREFIX, "e2e-seed-r-");

  // What Sam wrote: five on WhatsApp, three about booking and two about prices, each read and answered by the receptionist;
  // and one email that a program wrote.
  const asks = thread.filter((m) => m.direction === "inbound" && m.channel === "whatsapp");
  assert.deepEqual(
    asks.map((m) => [m.sender, m.status, m.meta.handled]),
    Array(5).fill(["customer", "received", "ai"]),
  );
  assert.deepEqual(
    [asks.filter((m) => m.meta.intent === "booking").length, asks.filter((m) => m.meta.intent === "pricing").length],
    [3, 2],
  );
  const mail = thread.filter((m) => m.channel === "email");
  assert.deepEqual(
    mail.map((m) => [m.direction, m.sender, m.status, m.meta]),
    [["inbound", "customer", "received", { email: { claim: "automated" } }]],
    "the automated email, which is counted nowhere",
  );

  // What the receptionist answered: five replies that went out, four in English and one in Spanish, three of them held
  // for a minute first; and two drafts that never went out, one cancelled with no reason and one steered.
  const ai = thread.filter((m) => m.direction === "outbound" && m.sender === "ai");
  const left = ai.filter((m) => m.status === "delivered");
  assert.equal(left.length, 5);
  assert.deepEqual(
    [left.filter((m) => m.meta.language === "en").length, left.filter((m) => m.meta.language === "es").length],
    [4, 1],
  );
  const held = ai.filter((m) => m.meta.source === "veto_window");
  assert.deepEqual(held.map((m) => [m.status, m.meta.delay_ms]).sort(), [
    ["canceled", 60_000],
    ["canceled", 60_000],
    ["delivered", 60_000],
    ["delivered", 60_000],
    ["delivered", 60_000],
  ]);
  const cancelled = ai.filter((m) => m.status === "canceled");
  assert.equal(cancelled.length, 2);
  assert.equal(cancelled.filter((m) => !m.error).length, 1, "the owner's cancel leaves no reason");
  const steered = cancelled.find((m) => m.error?.reason === "steered");
  assert.ok(steered, "and the steered one says so");
  const replacement = left.find((m) => m.id === steered.error.replaced_by);
  assert.equal(replacement?.meta.source, "steered", "its replacement is the reply that went out, and is not a hold");

  // Two handovers, resolved when they were written: a person's first reply ten minutes after each.
  const escalations = of(w.t, "escalations", T);
  assert.equal(escalations.length, 2);
  const humans = thread.filter((m) => m.sender === "human");
  assert.deepEqual(
    humans.map((m) => [m.direction, m.channel, m.status]),
    Array(2).fill(["outbound", "whatsapp", "delivered"]),
  );
  assert.ok(
    humans.every((m) => !m.meta?.source),
    "a person's own words, not a broadcast's or a reach-out's",
  );
  for (const e of escalations) {
    assert.deepEqual([e.conversation_id, e.reason, e.state], [cv.id, "human_token", "resolved"]);
    assert.ok(e.resolved_at && Date.parse(e.resolved_at) > Date.parse(e.created_at), "resolved at a time of its own");
    assert.equal(
      humans.filter((m) => Date.parse(m.created_at) - Date.parse(e.created_at) === 10 * MIN_MS).length,
      1,
      "one person's reply ten minutes after",
    );
  }

  // The call nobody took, and the send that was held at the door.
  const missed = of(w.t, "calls", T).find((c) => c.retell_call_id === MISSED_CALL_ID);
  assert.equal(MISSED_CALL_ID, "e2e-seed-r-missed");
  assert.deepEqual(
    [missed.status, missed.direction, missed.contact_id, missed.conversation_id, missed.message_id, missed.recording],
    ["not_connected", "inbound", casey.id, null, null, null],
  );
  assert.ok(missed.notified_at, "already notified: nothing for the post-call mail");
  const blocked = of(w.t, "events", T).filter((e) => e.kind === "message.send_blocked");
  assert.deepEqual(
    blocked.map((e) => e.data),
    [{ reason: "human_has_it", purpose: "conversational" }],
  );

  // Dated from the run: inside the seven days the shortest lens period reads, so every period shows them, and past the
  // day the unfinished-message sweep looks back over and the bell keeps a missed call as news. At least three hours
  // before the first conversation's reply, so that conversation stays the newest.
  const robinsReply = Date.parse(threadOf(w.t, T, ROBIN.phone).last_message_at);
  const dated = [
    ...thread.map((m) => m.created_at),
    ...escalations.flatMap((e) => [e.created_at, e.resolved_at]),
    missed.started_at,
  ].map((at) => Date.parse(at));
  for (const at of dated) {
    assert.ok(NOW - at > DAY_MS, `${new Date(at).toISOString()} is past the day the sweeps look back over`);
    assert.ok(NOW - at < 7 * DAY_MS, `${new Date(at).toISOString()} is inside the shortest period`);
    assert.ok(robinsReply - at >= 3 * HOUR_MS, `${new Date(at).toISOString()} is three hours before Robin's reply`);
  }
  assert.equal(cv.last_message_at, new Date(Math.max(...thread.map((m) => Date.parse(m.created_at)))).toISOString());
  assert.equal(
    cv.last_inbound_at,
    new Date(Math.max(...asks.map((m) => Date.parse(m.created_at)))).toISOString(),
    "the last thing the customer wrote",
  );
  assert.ok(
    thread.every((m) => m.status !== "queued") && of(w.t, "jobs", T).length === 0,
    "terminal: nothing waiting to send, no job to send it",
  );
  assert.deepEqual(await verify(w.db, T, w.users.find((u) => u.email === OWNER).id), []);
});

test("what the lens will make of those rows: the hold, the topics, the languages, the handover, the call nobody took", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const messages = of(w.t, "messages", T);
  const calls = of(w.t, "calls", T);
  const count = (rows, key) =>
    rows.reduce((acc, r) => ({ ...acc, [key(r)]: (acc[key(r)] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));

  // receptionist_series reads (00380, the plan's Task 7): the drafts of the window by what became of them,
  const drafts = messages.filter(
    (m) =>
      m.direction === "outbound" && m.sender === "ai" && ["veto_window", "low_confidence"].includes(m.meta?.source),
  );
  assert.deepEqual(
    count(drafts, (m) => (m.status === "canceled" ? (m.error?.reason ?? "canceled") : "sent")),
    { sent: 3, canceled: 1, steered: 1 },
    "three went out as the hold ended, one was cancelled, one steered: five in the hold",
  );
  // the topics of what came in by text or WhatsApp in a person's own words (Robin's message is not stamped),
  const texts = messages.filter(
    (m) =>
      m.direction === "inbound" &&
      m.sender === "customer" &&
      ["whatsapp", "sms"].includes(m.channel) &&
      personsWords(m),
  );
  assert.equal(
    texts.length,
    7,
    "Robin's one, Sam's five and Casey's reply to the Campaigns run (which names no topic)",
  );
  assert.deepEqual(
    count(
      texts.filter((m) => m.meta?.intent),
      (m) => m.meta.intent,
    ),
    { booking: 3, pricing: 2 },
  );
  // the languages of the replies that left (Robin's is not stamped),
  const replies = messages.filter(
    (m) => m.direction === "outbound" && m.sender === "ai" && ["sent", "delivered", "read"].includes(m.status),
  );
  assert.equal(replies.length, 6);
  assert.deepEqual(
    count(
      replies.filter((m) => m.meta?.language),
      (m) => m.meta.language,
    ),
    { en: 4, es: 1 },
  );
  // the handovers: the first reply of a person after each, and how long each took to settle,
  const medians = of(w.t, "escalations", T).map((e) => {
    const first = messages
      .filter(
        (m) =>
          m.conversation_id === e.conversation_id &&
          m.sender === "human" &&
          m.direction === "outbound" &&
          // Written as a person's, and nobody's: a broadcast's send is no answer to a handover (public.automated_send).
          !["broadcast", "reach_out"].includes(m.meta?.source),
      )
      .map((m) => Date.parse(m.created_at))
      .filter((at) => at > Date.parse(e.created_at))
      .sort()[0];
    return {
      replied: (first - Date.parse(e.created_at)) / 1000,
      settled: (Date.parse(e.resolved_at) - Date.parse(e.created_at)) / 1000,
    };
  });
  assert.deepEqual(
    medians.map((m) => m.replied),
    [600, 600],
    "a median of ten minutes",
  );
  assert.deepEqual(
    medians.map((m) => m.settled).sort((a, b) => a - b),
    [3000, 4200],
    "and an hour to settle: two and not more",
  );
  // and the call: a person's, that never connected, and nobody rang them back in the hour after it.
  const missed = calls.find((c) => c.retell_call_id === MISSED_CALL_ID);
  const after = (at) => at > Date.parse(missed.started_at) && at <= Date.parse(missed.started_at) + HOUR_MS;
  assert.ok(
    !messages.some(
      (m) => m.contact_id === missed.contact_id && m.direction === "outbound" && after(Date.parse(m.created_at)),
    ),
  );
  assert.ok(!calls.some((c) => c !== missed && c.contact_id === missed.contact_id && after(Date.parse(c.started_at))));
});

test("the workspace keeps no opening hours, as the local harness's record and the other nightly specs have it: the lens's closed figure asks for them", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const [cfg] = of(w.t, "tenant_config", T);
  assert.equal(cfg.config.brain.profile, undefined, "no profile, so no hours");
  assert.deepEqual(cfg.config, seed.workspaceConfig(), "the config the harness derives its nightly record from");
  assert.ok(TenantConfigWriteSchema.safeParse(cfg.config).success, "a config the settings save accepts");
  assert.deepEqual(cfg.config.notifications, { escalation_emails: [ALERT_INBOX] }, "and the alerts are as they were");

  // Each person's words by the workspace's own day and quarter hour (what receptionist_series counts as arrivals): seven,
  // Robin's one, Sam's five and Casey's reply to the Campaigns run, for the automated email is nobody's arrival. Asked the
  // one question the lens asks of a workspace with no hours (closedOf), the answer is none, which the lens words as a
  // request for them and not as zero.
  const arrivals = of(w.t, "messages", T)
    .filter((m) => m.direction === "inbound" && m.sender === "customer" && personsWords(m))
    .map((m) => ({ d: localOf(m.created_at).day, q: localOf(m.created_at).q, n: 1 }));
  assert.equal(arrivals.length, 7);
  assert.equal(closedOf(arrivals, {}), null);
});

test("a second run changes nothing but the dates: the Receptionist rows move a day with the run, and none is added", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const undated = (rows) =>
    JSON.stringify(rows)
      .replace(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g, '"<date>"')
      .replace(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g, '"<id>"');
  const byKey = (key) => (a, b) => (String(key(a)) < String(key(b)) ? -1 : 1);
  const picture = () => ({
    messages: of(w.t, "messages", T).sort(byKey((m) => m.external_id)),
    conversations: of(w.t, "conversations", T).sort(byKey((c) => c.last_message_at)),
    escalations: of(w.t, "escalations", T).sort(byKey((e) => e.created_at)),
    calls: of(w.t, "calls", T).sort(byKey((c) => c.retell_call_id)),
    events: of(w.t, "events", T).filter((e) => e.kind === "message.send_blocked"),
    config: of(w.t, "tenant_config", T).map((r) => r.config),
  });
  const dates = () => ({
    messages: Object.fromEntries(of(w.t, "messages", T).map((m) => [m.external_id, Date.parse(m.created_at)])),
    escalations: of(w.t, "escalations", T)
      .sort(byKey((e) => e.created_at))
      .map((e) => [Date.parse(e.created_at), Date.parse(e.resolved_at)]),
    calls: Object.fromEntries(of(w.t, "calls", T).map((c) => [c.retell_call_id, Date.parse(c.started_at)])),
  });
  const first = { shape: undated(picture()), dates: dates() };
  await run(w, { now: NOW + DAY_MS });
  assert.equal(undated(picture()), first.shape, "the same rows, but for their dates and their ids");
  const next = dates();
  for (const [id, at] of Object.entries(first.dates.messages))
    assert.equal(next.messages[id] - at, DAY_MS, `${id} moved a day`);
  assert.deepEqual(
    next.escalations.map((pair, i) => pair.map((at, j) => at - first.dates.escalations[i][j])),
    [
      [DAY_MS, DAY_MS],
      [DAY_MS, DAY_MS],
    ],
  );
  for (const [id, at] of Object.entries(first.dates.calls))
    assert.equal(next.calls[id] - at, DAY_MS, `${id} moved a day`);
});

test("the Receptionist rows delete their own last night's before they are written, whoever left them: run alone over its own rows it adds nothing", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.users.find((u) => u.email === OWNER).id;
  const cv = threadOf(w.t, T, SAM.phone);
  const tables = ["conversations", "messages", "escalations", "calls", "events", "jobs"];
  const counted = () => tables.map((table) => of(w.t, table, T).length);
  const before = counted();
  // What a spec could leave in Sam's thread, and an event of another kind, which the seed does not own.
  w.t.messages.push({ id: "stray-m", tenant_id: T, conversation_id: cv.id, sender: "customer", direction: "inbound" });
  w.t.events.push({
    id: "other-event",
    tenant_id: T,
    kind: "contact.noted",
    data: {},
    created_at: new Date(NOW).toISOString(),
  });
  await seed.convergeReceptionist(w.db, T, ownerId, NOW + DAY_MS);
  assert.equal(
    w.t.messages.some((m) => m.id === "stray-m"),
    false,
    "gone with the thread it was in",
  );
  assert.deepEqual(
    counted().map((n, i) => n - before[i]),
    [0, -1, 0, 0, 1, 0],
    "the same rows again, but for the one message the Campaigns run sent Sam, which went with his thread, and the other event is not the seed's to delete",
  );
  assert.notEqual(threadOf(w.t, T, SAM.phone).id, cv.id, "a conversation of its own, written afresh");
  assert.ok(
    (await verify(w.db, T, ownerId)).some((p) => /Campaigns|run/.test(p)),
    "and verify names the run it left without a message",
  );
  // The run is written after the Receptionist's rows, and writing it again puts that message back.
  await seed.convergeCampaigns(w.db, T, ownerId, NOW + DAY_MS);
  assert.deepEqual(await verify(w.db, T, ownerId), []);
});

test("no sweep or job reaches the Receptionist rows: the unfinished-message sweep, the note sweep, the bell and the deadman", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const cv = threadOf(w.t, T, SAM.phone);
  const robinsMessages = new Set(
    of(w.t, "messages", T)
      .filter((m) => m.conversation_id === threadOf(w.t, T, ROBIN.phone).id)
      .map((m) => m.id),
  );

  // The unfinished-message sweep (every ten minutes, from the deadman tick) looks back a day for a text nobody finished
  // with: asked a few minutes after the seed and for two days on, it opens no escalation, tells nobody and stamps none of
  // Sam's. (Robin's, two hours old and answered, it stamps handled, as it always has.)
  const raised = [];
  const stamped = [];
  const told = [];
  const sweep = (after) =>
    sweepUnfinished({
      db: w.db,
      L: quietLog,
      upsertEscalation: async (...args) => {
        raised.push(args);
        return { created: true };
      },
      markProcessed: async (_db, _tenant, id) => {
        stamped.push(id);
      },
      notify: async (...args) => {
        told.push(args);
        return true;
      },
      loadTenantNotifications: async () => ({ notifications: null }),
      reachesTenant: () => true,
      deadline: Infinity,
      now: () => NOW + after,
    });
  for (const after of [4 * MIN_MS, 23 * HOUR_MS, 26 * HOUR_MS, 50 * HOUR_MS]) {
    assert.deepEqual(
      await sweep(after),
      { unanswered: 0, orphaned: 0, told: 0 },
      `${after / HOUR_MS} hours after the seed`,
    );
  }
  assert.deepEqual([raised, told], [[], []], "no escalation raised, nobody told");
  assert.ok(stamped.length > 0, "the sweep did read the workspace: it stamped Robin's answered text");
  assert.ok(
    stamped.every((id) => robinsMessages.has(id)),
    "and the only message it stamps is Robin's",
  );
  // The same sweep does catch a text of Sam's that is inside its day and has no reply and no stamp, so the silence above is its own.
  const lone = {
    id: "lone",
    tenant_id: T,
    conversation_id: cv.id,
    contact_id: personAt(w.t, T, SAM.phone).id,
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "Hello?",
    status: "received",
    created_at: new Date(NOW - 5 * HOUR_MS).toISOString(),
    meta: {},
  };
  w.t.messages.push(lone);
  assert.equal((await sweep(0)).unanswered, 1, "a text five hours old with no answer is raised");
  assert.equal(raised.length, 1);
  w.t.messages.splice(w.t.messages.indexOf(lone), 1);

  // The note sweep (00159, note_candidates) reads a conversation whose newest customer message is between six hours and
  // seven days old and newer than its last look, and a call that was notified, is on a person, came in and ended within
  // three days and was not looked at. Each of Sam's is stamped as looked at, so it waits for a message that never comes.
  const missed = of(w.t, "calls", T).find((c) => c.retell_call_id === MISSED_CALL_ID);
  const threadWaits = (c, now) =>
    Date.parse(c.last_inbound_at) < now - 6 * HOUR_MS &&
    Date.parse(c.last_inbound_at) > now - 7 * DAY_MS &&
    (c.note_checked_at == null || Date.parse(c.note_checked_at) < Date.parse(c.last_inbound_at));
  const callWaits = (c, now) =>
    c.note_checked_at == null &&
    c.notified_at != null &&
    c.contact_id != null &&
    c.direction === "inbound" &&
    Date.parse(c.ended_at) > now - 3 * DAY_MS;
  assert.ok(cv.note_checked_at, "Sam's conversation is stamped as read");
  assert.ok(missed.note_checked_at, "and the call is");
  for (const after of [0, 7 * HOUR_MS, 3 * DAY_MS]) {
    assert.equal(threadWaits(cv, NOW + after), false, `the conversation, ${after / HOUR_MS} hours on`);
    assert.equal(callWaits(missed, NOW + after), false, `the call, ${after / HOUR_MS} hours on`);
  }
  // Without the stamp both would wait, so the stamp is what keeps a model from being asked about them.
  assert.equal(threadWaits({ ...cv, note_checked_at: null }, NOW), true);
  assert.equal(callWaits({ ...missed, note_checked_at: null }, NOW), true);

  // The bell raises a "missed call" row for a dial that never connected for a day (missedCallIsNews), and the deadman
  // pages the platform for an escalation open two hours: this call is past its day, and no escalation is open.
  assert.equal(missedCallIsNews({ missed: true, live: false, startedAtMs: Date.parse(missed.started_at) }, NOW), false);
  assert.deepEqual(
    of(w.t, "escalations", T).filter((e) => e.state !== "resolved"),
    [],
  );
  assert.deepEqual(
    [of(w.t, "jobs", T).length, of(w.t, "messages", T).filter((m) => m.status === "queued").length],
    [0, 0],
  );
});

test("the rows the lens adds leave the other specs' first reads where they were: Robin's thread is the newest and the answered call the latest", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  // The Inbox and the exports spec read the newest conversation (GET conversations, newest first) and the latest call.
  const newest = of(w.t, "conversations", T).sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))[0];
  assert.equal(newest.contact_id, personAt(w.t, T, ROBIN.phone).id);
  const latest = of(w.t, "calls", T).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0];
  assert.equal(latest.retell_call_id, CALL_ID, "a call with a transcript, which the call export reads");
});

test("verify() names an open escalation, a queued message, a missed call that connected, a handover with no time to it and a blocked send that is gone", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  const said = async () => (await verify(w.db, T, ownerId)).join(" | ");
  const [first, second] = of(w.t, "escalations", T);

  // What a spec that went wrong, or a person poking at the workspace, could leave.
  first.state = "open";
  first.resolved_at = null;
  assert.match(await said(), /open escalation/, "the deadman would page the platform for it");
  first.state = "resolved";
  first.resolved_at = new Date(Date.parse(first.created_at) + HOUR_MS).toISOString();
  assert.equal(await said(), "");

  second.resolved_at = null;
  assert.match(await said(), /resolved/, "resolved before records were kept is unknown to the lens");
  second.resolved_at = new Date(Date.parse(second.created_at) + HOUR_MS).toISOString();

  w.t.messages.push({
    id: "queued-by-hand",
    tenant_id: T,
    conversation_id: first.conversation_id,
    sender: "ai",
    direction: "outbound",
    status: "queued",
  });
  assert.match(await said(), /queued/, "a send job would pick it up");
  w.t.messages.pop();

  const missed = of(w.t, "calls", T).find((c) => c.retell_call_id === MISSED_CALL_ID);
  missed.status = "ended";
  assert.match(await said(), /never connected/);
  missed.status = "not_connected";
  w.t.calls.splice(w.t.calls.indexOf(missed), 1);
  assert.match(await said(), /never connected/, "and a call that is not there at all");
  w.t.calls.push(missed);

  const blocked = w.t.events.findIndex((e) => e.kind === "message.send_blocked");
  const [event] = w.t.events.splice(blocked, 1);
  assert.match(await said(), /blocked/, "the one event the writer files best-effort and never throws");
  w.t.events.push(event);
  assert.equal(await said(), "");

  // Every one of them put back by the next run.
  first.state = "open";
  second.resolved_at = null;
  missed.status = "ended";
  w.t.messages.push({ id: "q2", tenant_id: T, conversation_id: first.conversation_id, status: "queued" });
  assert.notEqual(await said(), "");
  await run(w, { now: NOW + DAY_MS });
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the next run puts it back");
});

test("the eval's Win-back (the moment spec, A8): written only under --seed-win-back, which the check of production does not pass; then one campaign on silence, paused so no sweep runs it, on a message of its own, written once however often the workspace converges", async () => {
  // The script's arguments: the check of production's (.github/workflows/nightly-e2e.yml) are --apply alone.
  assert.deepEqual(runOptions(["node", "e2e-workspace.mjs", "--apply"]), { apply: true, seedWinBack: false });
  assert.deepEqual(runOptions(["node", "e2e-workspace.mjs", "--apply", "--seed-win-back"]), {
    apply: true,
    seedWinBack: true,
  });
  assert.deepEqual(
    runOptions(["node", "e2e-workspace.mjs", "--seed-win-back"]),
    { apply: false, seedWinBack: true },
    "the flag alone is a dry run all the same",
  );

  const w = world();
  // Production's converge (--apply alone): no Win-back, no message for it.
  const { tenantId: T } = await run(w);
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(of(w.t, "playbooks", T), [], "merging seeds nothing");
  // The Campaigns lens's run has a message of its own, and the Win-back's is not it.
  const winBackMessages = () => of(w.t, "templates", T).filter((m) => m.name === WIN_BACK.template);
  assert.deepEqual(winBackMessages(), [], "nor a message for it");
  assert.deepEqual(
    of(w.t, "templates", T).map((m) => m.name),
    [CAMPAIGN_MESSAGE.name],
    "the run's message is the only one",
  );
  // A dry run under the flag says what it would add, and adds nothing.
  const before = JSON.stringify(w.t);
  const dry = await run(w, { apply: false, seedWinBack: true });
  assert.equal(JSON.stringify(w.t), before, "a dry run writes nothing");
  assert.ok(
    dry.did.some((line) => line.includes("would add the eval's Win-back")),
    dry.did.join(" | "),
  );

  // Ruben's run by hand (--apply --seed-win-back), twice: one campaign, one message.
  const seeded = await run(w, { seedWinBack: true });
  assert.ok(seeded.did.includes("added the eval's Win-back, paused"), seeded.did.join(" | "));
  await run(w, { seedWinBack: true, now: NOW + 86_400_000 });
  const playbooks = of(w.t, "playbooks", T);
  assert.deepEqual(
    playbooks.map((p) => [p.name, p.trigger, p.state, p.policy_class]),
    [[WIN_BACK.name, "quiet_30", "paused", "reengage"]],
  );
  const [winBack] = playbooks;
  const messages = winBackMessages();
  assert.equal(messages.length, 1, "one message, written once");
  const [message] = messages;
  assert.equal(winBack.template_id, message.id);
  assert.deepEqual(
    [message.name, message.channel, message.meta_status, message.source],
    [WIN_BACK.template, "whatsapp", "approved", "chanlytics"],
  );
  // A message of its own, no starter's: Ask's setup never takes it for a starter on file (contracts startersForTrigger).
  assert.equal(starterByName(WIN_BACK.template), null);
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the seeded state passes its own check");

  // Paused, the hourly sweep never takes it: at its hour it is not due, where the same campaign running would be.
  const due = async () =>
    (
      await w.db.rpc("sequence_steps_due", {
        p_kind: "moment",
        p_at: new Date(NOW + 6 * 3_600_000).toISOString(),
        p_last_hour: 20,
        p_limit: 50,
        p_tenant_id: T,
      })
    ).data;
  assert.deepEqual(await due(), [], "11:00 in the workspace's zone, past its 10:00: paused, never due");

  // A spec that resumed, renamed or retimed it is named by verify(), and put back by the nightly's own converge, which
  // still adds nothing.
  Object.assign(winBack, { state: "running", name: "Past clients", run_hour: 9 });
  assert.equal((await due()).length, 1, "running, the sweep would take it");
  assert.ok(
    (await verify(w.db, T, ownerId)).some((p) => p.includes("Win-back")),
    "verify names a Win-back left running",
  );
  const putBack = await run(w, { now: NOW + 2 * 86_400_000 });
  assert.ok(putBack.did.includes("put the eval's Win-back back, paused"), putBack.did.join(" | "));
  assert.deepEqual(
    of(w.t, "playbooks", T).map((p) => [p.name, p.state, p.run_hour]),
    [[WIN_BACK.name, "paused", 10]],
  );
  assert.equal(winBackMessages().length, 1, "and no second message");
  assert.equal(
    of(w.t, "templates", T).filter((m) => m.name === CAMPAIGN_MESSAGE.name).length,
    1,
    "nor a second one for the Campaigns run",
  );
  assert.deepEqual(await due(), []);
});
