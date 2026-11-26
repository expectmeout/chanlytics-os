/**
 * A failure Meta reports later raises its hand, and a receipt or an echo the database did not keep comes again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOOR,
  GREETING,
  accepted,
  answer,
  deliver,
  digestOf,
  echoed,
  holds,
  kind,
  knock,
  later,
  listening,
  now,
  realPorts,
  receptionist,
  runAnswers,
  setInboundPorts,
  sign,
  text,
  told,
  world,
} from "./_door.mjs";

test("a WhatsApp message Meta then reports failed flags its thread, whose event rings the bell, and writes the ledger, saying why", async () => {
  const w = world();
  const { row, errors, failed } = accepted(w);
  w.open();
  receptionist();
  assert.deepEqual(await answer(await deliver(failed())), [200, { ok: true }]);
  assert.deepEqual([row.status, row.error], ["failed", { errors }]);

  assert.equal(holds(w).length, 1);
  const [hold] = holds(w);
  assert.deepEqual([hold.conversation_id, hold.reason], [`cv-${w.i}`, "send_failed"]);
  assert.match(hold.details, /^A reply from your team was accepted for sending but did not reach them\. /);
  assert.match(hold.details, /they haven't written in 24 hours.* reaches them\.$/);
  assert.deepEqual(
    told(w).map((e) => [e.kind, e.subject_type, e.subject_id]),
    [["escalation.opened", "conversation", `cv-${w.i}`]],
    "the hold's event, which tells the owner after the commit, out of Meta's request",
  );
  assert.deepEqual(w.tables.notifications, [], "and no bell of the door's own beside it");
  const failures = kind(w.tables, "message.send_failed");
  assert.equal(failures.length, 1);
  assert.deepEqual(
    [failures[0].subject_id, failures[0].data.reason, failures[0].data.outcome],
    [row.id, "receipt", "refused"],
  );
});

test("the same failure said twice, in one delivery or two, raises once", async () => {
  const w = world();
  const { row, failed } = accepted(w);
  w.open();
  receptionist();
  await deliver(failed());
  await deliver(failed());
  const twice = failed();
  twice.entry[0].changes[0].value.statuses.push(twice.entry[0].changes[0].value.statuses[0]);
  await deliver(twice);
  assert.equal(row.status, "failed");
  assert.deepEqual([holds(w).length, told(w).length, kind(w.tables, "message.send_failed").length], [1, 1, 1]);
});

test("the same failure twice in the FIRST delivery, while the row still says sent, raises once", async () => {
  // The case above sends its doubled delivery after the row has failed, where the row alone says it was seen. Here
  // both copies arrive together on a row that is still `sent`: each read it as news, so the owner had two bells and
  // the ledger two failures for one message.
  const w = world();
  const { row, failed } = accepted(w);
  w.open();
  receptionist();
  const twice = failed();
  twice.entry[0].changes[0].value.statuses.push({ ...twice.entry[0].changes[0].value.statuses[0] });
  assert.deepEqual(await answer(await deliver(twice)), [200, { ok: true }]);
  assert.equal(row.status, "failed");
  assert.deepEqual(
    [holds(w).length, told(w).length, kind(w.tables, "message.send_failed").length],
    [1, 1, 1],
    "REGRESSION: two bells and two ledger rows for one message",
  );
});

test("a campaign's message, a customer's row and a delivery raise nothing; the failure still lands on the row", async () => {
  for (const [name, over] of [
    ["a broadcast's send", { meta: { source: "broadcast", broadcast_id: "b1", broadcast_name: "Spring" } }],
    ["a reach-out's step", { meta: { source: "reach_out" } }],
    ["a system note", { sender: "system" }],
  ]) {
    const w = world();
    const { row, failed } = accepted(w, over);
    w.open();
    receptionist();
    assert.deepEqual(await answer(await deliver(failed())), [200, { ok: true }], name);
    assert.equal(row.status, "failed", name);
    assert.deepEqual(
      [holds(w).length, w.tables.notifications.length, kind(w.tables, "message.send_failed").length],
      [0, 0, 0],
      name,
    );
  }
  const ok = world();
  const { row, wamid } = accepted(ok);
  ok.open();
  receptionist();
  await deliver(
    ok.change({ statuses: [{ id: wamid, status: "delivered", timestamp: now(), recipient_id: ok.customer() }] }),
  );
  assert.deepEqual([row.status, holds(ok).length, ok.tables.notifications.length], ["delivered", 0, 0]);
});

test("a flag the database would not take leaves the message as it was and the delivery unacknowledged, so Meta says it again; the bell is not rung for a thread that is not flagged", async () => {
  const w = world();
  const { row, failed } = accepted(w);
  w.open({ "escalations.insert": { message: "the database is down" } });
  receptionist();
  await listening(async (log) => {
    assert.deepEqual(await answer(await deliver(failed())), [503, { ok: false, unrecorded: 1 }]);
    assert.ok(log.said("pg_escalation_failed").length >= 1, "and it is said");
  });
  assert.deepEqual([row.status, row.error], ["sent", null]);
  assert.deepEqual(
    [holds(w).length, w.tables.notifications.length, kind(w.tables, "message.send_failed").length],
    [0, 0, 0],
  );

  // Meta redelivers, the database is back: the failure lands and is raised, once.
  w.open();
  assert.deepEqual(await answer(await deliver(failed())), [200, { ok: true }]);
  assert.deepEqual([row.status, holds(w).length, told(w).length], ["failed", 1, 1]);
});

test("a failure that is the person's own no to offers (131050) is recorded as that no and is not a send the owner has to fix: no hold, no bell, no failure on the ledger", async () => {
  const w = world();
  w.tables.contacts.push({
    id: "k1",
    tenant_id: w.T,
    consent: "opted_in",
    dnc: false,
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    erased_at: null,
  });
  const { row, wamid } = accepted(w, { contact_id: "k1" });
  w.open();
  receptionist();
  const stopped = [{ code: 131050, title: "User stopped marketing messages", message: "stopped" }];
  const receipt = { id: wamid, status: "failed", timestamp: now(), recipient_id: w.customer(), errors: stopped };
  assert.deepEqual(await answer(await deliver(w.change({ statuses: [receipt] }))), [200, { ok: true }]);
  assert.deepEqual([row.status, row.error], ["failed", { errors: stopped }], "the receipt is kept as it always was");
  assert.equal(w.tables.contacts[0].marketing_consent, "opted_out", "and it is their no to offers (wiring W4)");
  assert.deepEqual(
    [holds(w).length, w.tables.notifications.length, kind(w.tables, "message.send_failed").length],
    [0, 0, 0],
    "their answer, not a send that failed",
  );
});

test("a receipt or an owner's echo on a number the database could not answer for is not acknowledged: 503 with the count, no pause said that did not happen, and Meta's redelivery lands once the read works", async () => {
  // Only messages were counted: a failed receipt went to a workspace of none and flagged nothing, an echo was not
  // kept and still said it paused the thread, and both were answered 200, so Meta never sent either again.
  const w = world();
  const { row, failed } = accepted(w);
  const to = w.customer();
  const echo = echoed(w, to, `wamid.${w.i}.echo-blip`);
  w.open({ "tenant_channels.select": { message: "connection terminated unexpectedly" } });
  receptionist();
  await listening(async (log) => {
    assert.deepEqual(
      await answer(await deliver(failed())),
      [503, { ok: false, unrecorded: 1 }],
      "REGRESSION: acknowledged, and the failure never flagged",
    );
    assert.deepEqual(
      await answer(await deliver(echo)),
      [503, { ok: false, unrecorded: 1 }],
      "REGRESSION: acknowledged, and the owner's reply never kept",
    );
    assert.deepEqual(log.said("wa_paused_by_echo"), [], "no pause is said that did not happen");
    assert.deepEqual(
      log.said("wa_skip_routing_failed").map((l) => l.fields),
      [
        { phone_number_id: w.PHONE_ID, receipts: 1 },
        { phone_number_id: w.PHONE_ID, echoes: 1 },
      ],
    );
  });
  assert.deepEqual([row.status, holds(w).length, w.tables.contacts.length], ["sent", 0, 0], "nothing was written");

  // Meta sends both again, and the database answers: the failure is flagged and the owner's words pause the thread.
  w.open();
  assert.deepEqual(await answer(await deliver(failed())), [200, { ok: true }]);
  assert.deepEqual([row.status, holds(w).length], ["failed", 1]);
  assert.deepEqual(await answer(await deliver(echo)), [200, { ok: true }]);
  const [contact] = w.tables.contacts;
  assert.equal(contact.phone_e164, `+${to}`);
  const thread = w.tables.conversations.find((c) => c.contact_id === contact.id);
  assert.equal(thread.state, "needs_human");
  assert.ok(Date.parse(thread.paused_until) > Date.now(), "the receptionist steps back for the owner");
  assert.equal(w.tables.messages.filter((m) => m.meta?.echo).length, 1);
});

test("an owner's echo whose pause the database would not take is not acknowledged and leaves no words behind, so Meta's redelivery pauses the thread; a replay after that moves nothing", async () => {
  // The write's failures were logged inside it and the door answered 200: the words were kept, the thread was not
  // paused, and the receptionist answered over the owner. A redelivery would have found the words and stopped there.
  const w = world();
  w.open({ "conversations.update": { message: "the database is down" } });
  receptionist();
  const echo = echoed(w, w.customer(), `wamid.${w.i}.echo-refused`, "I'll call you in five minutes.");
  await listening(async (log) => {
    assert.deepEqual(
      await answer(await deliver(echo)),
      [503, { ok: false, unrecorded: 1 }],
      "REGRESSION: acknowledged with no pause",
    );
    assert.deepEqual(log.said("wa_paused_by_echo"), []);
    assert.deepEqual(
      log.said("record_echo_pause_failed").map((l) => l.fields.unwound),
      [true],
      "the words without their pause are taken back out, and it says so",
    );
  });
  assert.equal(w.tables.messages.length, 0, "so the redelivery is a new echo, not a replay that pauses nothing");

  w.open();
  assert.deepEqual(await answer(await deliver(echo)), [200, { ok: true }]);
  const [thread] = w.tables.conversations;
  assert.equal(thread.state, "needs_human");
  const until = thread.paused_until;
  assert.ok(Date.parse(until) > Date.now(), "paused for the owner");
  assert.equal(w.tables.messages.length, 1, "and the owner's words kept, once");

  // The same echo once more: kept whole already, so nothing moves.
  assert.deepEqual(await answer(await deliver(echo)), [200, { ok: true }]);
  assert.deepEqual([w.tables.messages.length, w.tables.conversations[0].paused_until], [1, until]);
});

test("the delivery is kept as it came under the body's digest, with no workspace, before the verdict (00336); a wrong signature keeps nothing", async () => {
  const w = world();
  w.open();
  receptionist();
  const raw = JSON.stringify(
    w.change({ messages: [text(w.customer(), `wamid.${w.i}.kept`, "do you take walk-ins?")] }),
  );
  assert.deepEqual(await answer(await knock(raw, { "x-hub-signature-256": sign(raw, "another-apps-secret") })), [
    401,
    { ok: false, error: "bad_signature" },
  ]);
  assert.equal((w.tables.provider_events ?? []).length, 0, "nothing kept for bytes Meta did not sign");
  assert.deepEqual(await answer(await knock(raw)), [200, { ok: true }]);
  const [kept, ...more] = w.tables.provider_events;
  assert.equal(more.length, 0);
  assert.deepEqual(
    [
      kept.provider,
      kept.provider_event_id.startsWith("sha256:"),
      kept.door,
      kept.url,
      kept.tenant_id,
      kept.verified,
      Object.keys(kept.headers),
      kept.body,
    ],
    ["meta", true, "/api/whatsapp", DOOR, null, true, ["x-hub-signature-256"], raw],
    "Meta names no delivery and a batch may span workspaces: the body's digest is the key, and the workspace is none",
  );
});

/* ------------------------------- answered after the acknowledgement (0031, Phase 3) */

test("a WhatsApp message is recorded, its answer scheduled as a job and acknowledged: nothing is answered in the door, and the job answers it on the workspace's own wire", async () => {
  const w = world();
  w.tables.jobs = [];
  const db = w.open();
  const seen = receptionist();
  const from = w.customer();
  const m = text(from, `wamid.${w.i}.later`, "do you have Saturday morning?");
  const contacts = [{ wa_id: from, profile: { name: "Dana" } }];
  assert.deepEqual(await answer(await deliver(w.change({ contacts, messages: [m] }))), [200, { ok: true }]);
  assert.deepEqual(seen.ingested, [{ tenantId: w.T, body: "do you have Saturday morning?" }], "recorded in the door");
  assert.deepEqual(seen.sent, [], "and nothing answered there: Meta has its 200 before the model is asked anything");
  assert.equal(w.tables.jobs.length, 1, "one job, for the one message");
  const [job] = w.tables.jobs;
  assert.deepEqual(
    [job.tenant_id, job.kind, job.dedupe_key],
    [w.T, "inbound_answer", `inbound_answer:m-${m.id}`],
    "the text's kind and key: once per message, in the reply lane",
  );
  // The request the door served rides with it, as with every job scheduled while one is served: the job runs under it,
  // so the knock, the answer and the send are one search in the log.
  const { request_id: asked, ...carried } = job.payload;
  assert.match(asked, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    carried,
    {
      // The message as Meta sent it, and the two facts of its envelope the normaliser reads; no other message of the
      // batch, no status, nothing else of the change.
      wa: {
        message: m,
        value: { metadata: { display_phone_number: w.LINE.slice(1), phone_number_id: w.PHONE_ID }, contacts },
      },
      // The wire its job answers on, said (lib/intake/answer-job.ts jobWireOf).
      wire: "whatsapp",
      // Named, so an erasure cancels a job still waiting and scrubs one finished.
      message_id: `m-${m.id}`,
      conversation_id: "conv-1",
      contact_id: "k-1",
    },
    "what its job needs to take it up again",
  );

  // The job's half, as the tick hands it over: the routing read again, the receptionist run with the same world.
  seen.ingested.length = 0;
  await later.answerInboundJob(db, { id: "job-1", tenant_id: w.T, kind: job.kind, payload: job.payload, attempts: 1 });
  assert.deepEqual(seen.ingested, [{ tenantId: w.T, body: "do you have Saturday morning?" }], "taken up again");
  assert.deepEqual(
    seen.sent,
    [{ tenantId: w.T, to: from, body: GREETING, meta: { ack: true, fallback: "no_model" } }],
    "answered by its job, as the door would have answered it",
  );
  assert.deepEqual(seen.wires.at(-1), { phoneId: w.PHONE_ID, accessToken: `token-${w.T}` }, "on its own number");
});

test("two messages of one thread in one delivery are two jobs, and Meta is answered before either is asked of the model", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const from = w.customer();
  const body = w.change({
    messages: [text(from, `wamid.${w.i}.one`, "hi"), text(from, `wamid.${w.i}.two`, "are you open today?")],
  });
  assert.deepEqual(await answer(await deliver(body)), [200, { ok: true }]);
  assert.deepEqual(seen.sent, [], "nothing is asked of the model inside Meta's request");
  assert.deepEqual(
    w.tables.jobs.map((j) => j.dedupe_key),
    [`inbound_answer:m-wamid.${w.i}.one`, `inbound_answer:m-wamid.${w.i}.two`],
    "one job a message: the thread's reply turn lets the newer one answer both (core inbound/turn.ts)",
  );
  await runAnswers(w, db);
  assert.equal(seen.ingested.length, 4, "each recorded, and each taken up by its job");
});

test("an answer job says it is about to speak before Meta is called, on its own row; a job whose number is another workspace's now, or that names no message, fails by name and answers nothing", async () => {
  const w = world();
  w.tables.jobs = [
    { id: "job-9", tenant_id: w.T, kind: "inbound_answer", state: "fired", attempts: 1, spoke_at: null },
  ];
  const db = w.open();
  const seen = receptionist();
  // The same world, with a sink that puts the words on the wire it was handed, as the real one does: what the wire
  // sees when it is called is what the job's row held at that moment.
  const base = realPorts();
  const atTheWire = [];
  setInboundPorts({
    ...base,
    sender: () => async () => {
      atTheWire.push(w.tables.jobs[0].spoke_at);
      return { ok: true, wamid: "wamid.out", status: 200 };
    },
    persist: {
      ...base.persist,
      sink: (...args) => ({
        ...base.persist.sink(...args),
        deliver: async (to, body) => {
          const sent = await args[5].whatsapp(to, { body });
          return { outcome: sent.ok ? "sent" : "failed", messageId: "m-out", externalId: sent.wamid };
        },
      }),
    },
  });
  const from = w.customer();
  const payload = {
    wa: {
      message: text(from, `wamid.${w.i}.spoke`, "hello?"),
      value: { metadata: { phone_number_id: w.PHONE_ID } },
    },
    message_id: "m-in",
  };
  const claimed = { id: "job-9", tenant_id: w.T, kind: "inbound_answer", payload, attempts: 1 };
  await later.answerInboundJob(db, claimed);
  assert.equal(atTheWire.length, 1, "one reply left");
  assert.ok(atTheWire[0], "and the row already said the job spoke when the wire was called");
  assert.equal(claimed.spoke_at, w.tables.jobs[0].spoke_at, "the claim the runner judges a retry from says so too");

  // Refused by name, before anything is read as a message or said.
  seen.sent.length = 0;
  const job = (over) => ({ id: "job-x", tenant_id: w.T, kind: "inbound_answer", attempts: 1, payload, ...over });
  await assert.rejects(
    later.answerInboundJob(db, job({ tenant_id: "cccccccc-0000-4000-8000-000000000000" })),
    /another workspace's now/,
  );
  await assert.rejects(
    later.answerInboundJob(db, job({ payload: { wa: { message: { id: "", from } } } })),
    /names no WhatsApp message/,
  );
  await assert.rejects(
    later.answerInboundJob(db, job({ payload: { wa: { message: payload.wa.message, value: {} } } })),
    /which number was written to/,
  );
  await assert.rejects(
    later.answerInboundJob(
      db,
      job({ payload: { wa: { ...payload.wa, value: { metadata: { phone_number_id: w.stranger } } } } }),
    ),
    /could not be read, or is not active/,
  );
  assert.equal(atTheWire.length, 1, "nothing more was said");
});

test("a kept app's chats and contacts: kept as they came and handed to the history job by the delivery's key, the same bytes again scheduling nothing twice; a number no workspace holds has nothing to bring", async () => {
  const w = world();
  Object.assign(w.tables, { provider_events: [], jobs: [] });
  w.open();
  const chats = JSON.stringify(
    w.change(
      { history: [{ metadata: { phase: 0, progress: 10 }, threads: [{ id: w.customer(), messages: [] }] }] },
      { field: "history" },
    ),
  );
  const key = digestOf(chats);
  assert.deepEqual(await answer(await knock(chats)), [200, { ok: true }]);
  assert.deepEqual(
    w.tables.provider_events.map((e) => [e.provider, e.provider_event_id]),
    [["meta", key]],
    "the copy the job brings it from",
  );
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.tenant_id, j.kind, j.payload.source, j.payload.connection_id, j.payload.seq]),
    [[w.T, "history_import", "whatsapp_history", key, `${key.slice(7, 23)}:1`]],
  );
  // Meta sends the same bytes again: the same run, scheduled once.
  assert.deepEqual(await answer(await knock(chats)), [200, { ok: true }]);
  assert.equal(w.tables.jobs.length, 1);
  // The contacts: the same road, as their own source.
  const contacts = w.change(
    {
      state_sync: [
        { type: "contact", action: "add", contact: { full_name: "Dana Reyes", phone_number: w.customer() } },
      ],
    },
    { field: "smb_app_state_sync" },
  );
  assert.deepEqual(await answer(await deliver(contacts)), [200, { ok: true }]);
  assert.deepEqual(
    w.tables.jobs.map((j) => j.payload.source),
    ["whatsapp_history", "whatsapp_contacts"],
  );
  // A number no workspace holds: acknowledged, and nothing to bring.
  assert.deepEqual(await answer(await deliver(w.change({ history: [] }, { field: "history", phoneId: w.stranger }))), [
    200,
    { ok: true },
  ]);
  assert.equal(w.tables.jobs.length, 2);
});

test("a kept app's history whose copy could not be taken is not acknowledged, so Meta sends it again; nor is one whose number the database could not route", async () => {
  const notKept = world();
  Object.assign(notKept.tables, { provider_events: [], jobs: [] });
  notKept.open({ "provider_events.upsert": { message: "connection terminated unexpectedly" } });
  const body = notKept.change({ history: [{ metadata: { phase: 0 }, threads: [] }] }, { field: "history" });
  assert.deepEqual(await answer(await deliver(body)), [503, { ok: false, unrecorded: 1 }]);
  assert.equal(notKept.tables.jobs.length, 0, "a part with no copy to bring from would bring nothing");

  const unread = world();
  Object.assign(unread.tables, { provider_events: [], jobs: [] });
  unread.open({ "tenant_channels.select": { message: "connection terminated unexpectedly" } });
  const contacts = unread.change({ state_sync: [] }, { field: "smb_app_state_sync" });
  assert.deepEqual(await answer(await deliver(contacts)), [503, { ok: false, unrecorded: 1 }]);
  assert.equal(unread.tables.jobs.length, 0);
});
