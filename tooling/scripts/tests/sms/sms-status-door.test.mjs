/**
 * The status door: the carrier's word on a text we sent, proven and recorded.
 *
 * The same world as sms-door.test.mjs: one workspace, one approved texting
 * line whose subaccount token lives in the vault. A status callback signed
 * with that token moves the row by its sid the way a WhatsApp receipt does;
 * one signed with anything else is refused before the row is looked at.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { twilioSignature } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/sms-status.ts"));
after(() => setPg(null));

const DOOR = "https://chanlytics-messaging.vercel.app/api/sms-status";
const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

function world(over = {}) {
  const i = ++seq;
  const T = `dddddddd-0000-4000-8000-${pad(i, 12)}`;
  const LINE = `+1305555${4000 + i}`;
  const TOKEN = `subaccount-token-${i}`;
  const line = {
    id: `eeeeeeee-0000-4000-8000-${pad(i, 12)}`,
    tenant_id: T,
    e164: LINE,
    provider: "twilio",
    subaccount_sid: `AC${pad(i, 32)}`,
    messaging_service_sid: `MG${pad(i, 32)}`,
    sms_state: "active",
    voice_state: "active",
  };
  const sid = `SM${pad(i, 32)}`;
  const row = {
    id: `m-${i}`,
    tenant_id: T,
    conversation_id: "cv-1",
    direction: "outbound",
    sender: "human",
    channel: "sms",
    external_id: sid,
    status: "sent",
    error: null,
    ...(over.row ?? {}),
  };
  const tables = { lines: [line], messages: [row] };
  const db = fakeDb(tables, over.faults ?? {}, {
    get_line_credentials: ({ p_line_id }) => (p_line_id === line.id ? { auth_token: TOKEN } : {}),
  });
  setPg(db);
  const form = (over = {}) => ({
    MessageSid: sid,
    MessageStatus: "delivered",
    From: LINE,
    To: "+16465550100",
    AccountSid: line.subaccount_sid,
    MessagingServiceSid: line.messaging_service_sid,
    ...over,
  });
  const post = async (fields, token = TOKEN, url = DOOR) => {
    const headers = {
      "content-type": "application/x-www-form-urlencoded",
      ...(token ? { "x-twilio-signature": await twilioSignature(token, url, fields) } : {}),
    };
    const res = await door.POST(
      new Request(url, { method: "POST", headers, body: new URLSearchParams(fields).toString() }),
      { waitUntil: () => {} },
    );
    return res.status;
  };
  return { T, LINE, TOKEN, line, row, tables, form, post };
}

test("delivered, read, and a carrier's refusal each land on the row by its sid; the refusal keeps the carrier's code", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "delivered" })), 200);
  assert.equal(w.row.status, "delivered");
  assert.equal(await w.post(w.form({ MessageStatus: "read" })), 200);
  assert.equal(w.row.status, "read");

  const x = world();
  assert.equal(await x.post(x.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 200);
  assert.equal(x.row.status, "failed");
  assert.deepEqual(
    x.row.error,
    { carrier: "undelivered", code: "30007" },
    "the Inbox can say why: the carrier filtered it",
  );
});

test("the interim words say nothing the row does not know: queued, accepted and sending are 200 and leave it alone", async () => {
  const w = world();
  for (const status of ["queued", "accepted", "sending"]) {
    assert.equal(await w.post(w.form({ MessageStatus: status })), 200, status);
    assert.equal(w.row.status, "sent", status);
  }
});

test("proven first: a signature over another token is 403 and the row is untouched; no signature at all is 403; a number no line carries is 404", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "delivered" }), "not-the-token"), 403);
  assert.equal(w.row.status, "sent");
  assert.equal(await w.post(w.form({ MessageStatus: "delivered" }), null), 403);
  assert.equal(
    await w.post(w.form({ MessageStatus: "delivered", From: "+13055550000" })),
    404,
    "the line is the From: an unknown one cannot be authenticated",
  );
  assert.equal(w.row.status, "sent");
});

test("a sid no row carries is let go with a 200: Twilio must not retry it; a form that is not a status is 400", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageSid: "SM" + "9".repeat(32), MessageStatus: "delivered" })), 200);
  assert.equal(w.row.status, "sent");
  assert.equal(await w.post({ From: w.LINE, To: "+16465550100" }), 400);
});

/* ------------------------- a failure the carrier reports later raises its hand ------------------------- */

/** What the owner was given: the open holds on the thread, the bell's rows, and the ledger's failures. */
const raised = (w) => ({
  holds: (w.tables.escalations ?? []).filter((e) => e.state !== "resolved"),
  bell: w.tables.notifications ?? [],
  events: (w.tables.events ?? []).filter((e) => e.kind === "message.send_failed"),
});

test("a text the carrier refuses after taking it flags its thread, rings the bell and writes the ledger, saying why", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 200);
  assert.equal(w.row.status, "failed");
  const { holds, bell, events } = raised(w);
  assert.equal(holds.length, 1);
  assert.deepEqual(
    [holds[0].conversation_id, holds[0].reason, holds[0].tenant_id],
    ["cv-1", "send_failed", w.T],
    "the hold a send that fails at the wire raises: the same reason, on the same thread",
  );
  assert.match(holds[0].details, /^A reply from your team was accepted for sending but did not reach them\./);
  assert.match(holds[0].details, /The text was filtered as a possible policy violation \(Twilio error 30007\)\.$/);
  assert.equal(bell.length, 1);
  assert.deepEqual(
    [bell[0].kind, bell[0].route, bell[0].subject_type, bell[0].subject_id],
    ["handoff", "inbox/th-cv-1", "conversation", "cv-1"],
    "a hand-off that opens that thread, as the send's own does",
  );
  assert.match(bell[0].body, /Twilio error 30007/);
  assert.equal(events.length, 1);
  assert.deepEqual(
    [events[0].subject_id, events[0].data.reason, events[0].data.outcome],
    [w.row.id, "receipt", "refused"],
  );
});

test("the same receipt twice raises once: a message already failed is a receipt seen before", async () => {
  const w = world();
  const fields = w.form({ MessageStatus: "undelivered", ErrorCode: "30003" });
  assert.equal(await w.post(fields), 200);
  assert.equal(await w.post(fields), 200, "Twilio retries a callback it could not deliver");
  assert.equal(await w.post(w.form({ MessageStatus: "failed", ErrorCode: "30003" })), 200, "and may say it twice");
  const { holds, bell, events } = raised(w);
  assert.deepEqual([holds.length, bell.length, events.length], [1, 1, 1]);
  assert.equal(w.row.status, "failed");

  // Said again after the owner dealt with it, it still raises nothing: it is the same message.
  w.tables.escalations.forEach((e) => (e.state = "resolved"));
  assert.equal(await w.post(fields), 200);
  assert.deepEqual([raised(w).holds.length, raised(w).bell.length], [0, 1]);
});

test("a campaign's text, a customer's row and a delivered text raise nothing, and the failure still lands on the row", async () => {
  for (const [name, row] of [
    ["a broadcast's send", { meta: { source: "broadcast", broadcast_id: "b1", broadcast_name: "Spring" } }],
    ["a playbook run's send", { meta: { source: "broadcast", playbook_id: "p1", playbook_name: "Win-back" } }],
    ["a system note", { sender: "system" }],
  ]) {
    const w = world({ row });
    assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 200, name);
    assert.equal(w.row.status, "failed", name);
    assert.deepEqual(raised(w), { holds: [], bell: [], events: [] }, name);
  }
  const ok = world();
  assert.equal(await ok.post(ok.form({ MessageStatus: "delivered" })), 200);
  assert.deepEqual(raised(ok), { holds: [], bell: [], events: [] }, "a delivery is no news");
});

test("the receptionist's reply is said as the receptionist's, and a thread already held for something else is held for this", async () => {
  const w = world({ row: { sender: "ai" } });
  w.tables.escalations = [
    { id: "e0", tenant_id: w.T, conversation_id: "cv-1", reason: "human_token", details: "asked", state: "open" },
  ];
  assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30005" })), 200);
  const { holds, bell } = raised(w);
  assert.equal(holds.length, 1, "one open hold per thread");
  assert.equal(holds[0].reason, "send_failed", "the reason a person is needed for has changed under them");
  assert.match(holds[0].details, /^The receptionist's reply was accepted for sending/);
  assert.equal(bell.length, 1);
});

test("a flag the database would not take is a 503 with the row untouched, so the carrier says it again", async () => {
  const w = world({ faults: { "escalations.insert": { message: "the database is down" } } });
  assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 503);
  assert.equal(w.row.status, "sent", "the row did not move: the next callback finds it as it was");
  assert.equal(w.row.error, null);
  assert.deepEqual(raised(w), { holds: [], bell: [], events: [] });
});

test("a STOP the carrier tells us late (21610) is the person's STOP: recorded as the send door records one, and raised as nothing", async () => {
  // Twilio took the text and then reported it undelivered with 21610: the person had replied STOP to the number. At
  // the wire that code is their STOP (core deliver.ts). Told late it was a failed send to the owner, a hold on the
  // thread, and nothing recorded, so the next text went to them too.
  const w = world({ row: { contact_id: "k-1" } });
  w.tables.contacts = [
    { id: "k-1", tenant_id: w.T, consent: "opted_in", dnc: false, consent_source: "customer_message", erased_at: null },
  ];
  w.tables.events = [];
  w.tables.escalations = [];
  const stop = w.form({ MessageStatus: "undelivered", ErrorCode: "21610" });
  assert.equal(await w.post(stop), 200);
  const [k] = w.tables.contacts;
  assert.deepEqual(
    [k.consent, k.dnc, k.consent_source],
    ["opted_out", true, "carrier"],
    "the three consent columns, as a STOP is written, with the carrier as its source",
  );
  assert.equal(w.tables.messages[0].status, "failed", "the row still says what became of the text");
  assert.deepEqual(
    w.tables.events.map((e) => [e.kind, e.subject_id, e.data.consent, e.data.source, e.data.previous, e.data.channel]),
    [["contact.consent_changed", "k-1", "opted_out", "carrier", "opted_in", "sms"]],
    "one ledger row, the shape the send door's has, and no message.send_failed beside it",
  );
  assert.equal(w.tables.escalations.length, 0, "no hold: the owner has nothing to fix");

  // Twilio says it again: nothing more is written.
  assert.equal(await w.post(stop), 200);
  assert.equal(w.tables.events.length, 1);
});

test("a late STOP for a text nobody knows, or a person already erased, writes nothing; a database that refuses it is a 503", async () => {
  const unknown = world({ row: { contact_id: null } });
  unknown.tables.contacts = [];
  unknown.tables.events = [];
  assert.equal(await unknown.post(unknown.form({ MessageStatus: "undelivered", ErrorCode: "21610" })), 200);
  assert.equal(unknown.tables.events.length, 0);

  const erased = world({ row: { contact_id: "k-2" } });
  erased.tables.contacts = [
    {
      id: "k-2",
      tenant_id: erased.T,
      consent: "unknown",
      dnc: true,
      consent_source: "erasure",
      erased_at: "2026-09-01T00:00:00Z",
    },
  ];
  erased.tables.events = [];
  assert.equal(await erased.post(erased.form({ MessageStatus: "undelivered", ErrorCode: "21610" })), 200);
  assert.deepEqual([erased.tables.contacts[0].consent, erased.tables.events.length], ["unknown", 0]);

  const down = world({ row: { contact_id: "k-3" }, faults: { "contacts.select": { message: "contacts is away" } } });
  down.tables.contacts = [{ id: "k-3", tenant_id: down.T, consent: "opted_in", dnc: false, erased_at: null }];
  down.tables.events = [];
  assert.equal(
    await down.post(down.form({ MessageStatus: "undelivered", ErrorCode: "21610" })),
    503,
    "the carrier says it again",
  );
});
