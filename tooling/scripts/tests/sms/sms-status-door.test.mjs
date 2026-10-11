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
const { setPg, pg } = await import(at("apps/edge/lib/pg.ts"));
const { replayProviderEvent } = await import(at("apps/edge/lib/intake/replay.ts"));
const door = await import(at("apps/edge/api/sms-status.ts"));
after(() => setPg(null));

/** The pager's mail settings: none in this file but where a case listens for the page. */
const MAIL = ["RESEND_API_KEY", "LEAD_TO", "LEAD_FROM"];
for (const k of MAIL) delete process.env[k];

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
  const rpcs = {
    get_line_credentials: ({ p_line_id }) => (p_line_id === line.id ? { auth_token: TOKEN } : {}),
  };
  setPg(fakeDb(tables, over.faults ?? {}, rpcs));
  /** The database well again, over the same rows. */
  const heal = () => setPg(fakeDb(tables, {}, rpcs));
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
  return { T, LINE, TOKEN, line, row, tables, form, post, heal };
}

/**
 * The platform's mailbox, listening: the pager's mail goes through Resend, captured here and answered as delivered.
 * `mail()` is what it was asked to send ({ from, to, subject, text }).
 */
function pagerListening() {
  const saved = Object.fromEntries(MAIL.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    RESEND_API_KEY: "re_test_only",
    LEAD_TO: "ops@platform.test",
    LEAD_FROM: "pager@platform.test",
  });
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  return {
    mail: () => calls.filter((c) => c.url.includes("api.resend.com")).map((c) => JSON.parse(c.init.body)),
    restore: () => {
      globalThis.fetch = real;
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

/** A kept delivery knocks on this door again, as an operator's replay does (api/admin/intake/replay). */
const replayed = async (id) => {
  const res = await replayProviderEvent(
    pg(),
    { provider: "twilio", provider_event_id: id },
    { "/api/sms-status": door.POST },
  );
  return (await res.json()).status;
};

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

/**
 * What the owner was given: the open holds on the thread, the events that tell of them (owner_notice rings the bell from
 * these, after the commit: decision 0043), the bell's rows the door wrote itself, and the ledger's failures.
 */
const raised = (w) => ({
  holds: (w.tables.escalations ?? []).filter((e) => e.state !== "resolved"),
  told: (w.tables.events ?? []).filter((e) => e.kind === "escalation.opened" || e.kind === "escalation.changed"),
  bell: w.tables.notifications ?? [],
  events: (w.tables.events ?? []).filter((e) => e.kind === "message.send_failed"),
});

test("a text the carrier refuses after taking it flags its thread, whose event rings the bell, and writes the ledger, saying why", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 200);
  assert.equal(w.row.status, "failed");
  const { holds, told, bell, events } = raised(w);
  assert.equal(holds.length, 1);
  assert.deepEqual(
    [holds[0].conversation_id, holds[0].reason, holds[0].tenant_id],
    ["cv-1", "send_failed", w.T],
    "the hold a send that fails at the wire raises: the same reason, on the same thread",
  );
  assert.match(holds[0].details, /^A reply from your team was accepted for sending but did not reach them\./);
  assert.match(holds[0].details, /The text was filtered as a possible policy violation \(Twilio error 30007\)\.$/);
  assert.deepEqual(
    told.map((e) => [e.kind, e.subject_type, e.subject_id]),
    [["escalation.opened", "conversation", "cv-1"]],
    "the hold's event, which tells the owner of that thread after the commit, out of Twilio's request",
  );
  assert.deepEqual(bell, [], "and no bell of the door's own beside it");
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
  const { holds, told, events } = raised(w);
  assert.deepEqual([holds.length, told.length, events.length], [1, 1, 1]);
  assert.equal(w.row.status, "failed");

  // Said again after the owner dealt with it, it still raises nothing: it is the same message.
  w.tables.escalations.forEach((e) => (e.state = "resolved"));
  assert.equal(await w.post(fields), 200);
  assert.deepEqual([raised(w).holds.length, raised(w).told.length], [0, 1]);
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
    assert.deepEqual(raised(w), { holds: [], told: [], bell: [], events: [] }, name);
  }
  const ok = world();
  assert.equal(await ok.post(ok.form({ MessageStatus: "delivered" })), 200);
  assert.deepEqual(raised(ok), { holds: [], told: [], bell: [], events: [] }, "a delivery is no news");
});

test("the receptionist's reply is said as the receptionist's, and a thread already held for something else is held for this", async () => {
  const w = world({ row: { sender: "ai" } });
  w.tables.escalations = [
    { id: "e0", tenant_id: w.T, conversation_id: "cv-1", reason: "human_token", details: "asked", state: "open" },
  ];
  assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30005" })), 200);
  const { holds, told } = raised(w);
  assert.equal(holds.length, 1, "one open hold per thread");
  assert.equal(holds[0].reason, "send_failed", "the reason a person is needed for has changed under them");
  assert.match(holds[0].details, /^The receptionist's reply was accepted for sending/);
  assert.deepEqual(
    told.map((e) => [e.kind, e.subject_id, e.data]),
    [["escalation.changed", "e0", { from: "human_token", to: "send_failed" }]],
    "told as the hold's new reason",
  );
});

test("a flag the database would not take is a 503 with the row untouched; Twilio never says it again, so the report is kept, the platform is paged with the key that replays it, and the replay lands once the database is well", async () => {
  // The door answered 503 and waited for a retry that Twilio does not make for a 5xx: the reply the carrier refused
  // stayed `sent`, its thread unflagged, and nobody was told.
  const w = world({ faults: { "escalations.insert": { message: "the database is down" } } });
  const pager = pagerListening();
  try {
    assert.equal(await w.post(w.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 503);
    assert.equal(w.row.status, "sent", "the row did not move: the replay finds it as it was");
    assert.equal(w.row.error, null);
    assert.deepEqual(raised(w), { holds: [], told: [], bell: [], events: [] });

    const key = `${w.row.external_id}:undelivered`;
    assert.deepEqual(
      w.tables.provider_events.map((e) => [e.provider, e.provider_event_id, e.door, e.tenant_id]),
      [["twilio", key, "/api/sms-status", w.T]],
      "kept as it came, under the key it is replayed by",
    );
    assert.deepEqual(
      (w.tables.operator_pages ?? []).map((p) => p.key),
      [`sms_status_unrecorded:${w.T}`],
      "REGRESSION: a 503 Twilio never retries, and nobody was told",
    );
    const [page] = pager.mail();
    assert.match(page.subject, /A text's delivery report could not be recorded/);
    assert.ok(page.text.includes(`"provider_event_id":"${key}"`), "the page names the delivery to replay");
    assert.ok(!page.text.includes(w.LINE) && !page.text.includes("6465550100"), "and never a number");

    // A second report lost in the same window is on the log, and pages nobody twice.
    w.tables.messages.push({ ...w.row, id: "m-2", external_id: "SM" + "2".repeat(32) });
    assert.equal(await w.post(w.form({ MessageSid: "SM" + "2".repeat(32), MessageStatus: "failed" })), 503);
    assert.equal(pager.mail().length, 1);

    // The database is well again, and the kept delivery knocks on the door as it came: its signature holds, the thread
    // is flagged and the row fails, once.
    w.heal();
    assert.equal(await replayed(key), 200);
    assert.equal(w.row.status, "failed");
    assert.deepEqual(w.row.error, { carrier: "undelivered", code: "30007" });
    const { holds, told, events } = raised(w);
    assert.deepEqual([holds.length, told.length, events.length], [1, 1, 1]);
  } finally {
    pager.restore();
  }
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

test("a late STOP is written for our own text and its person alone: not over a newer answer, an erased person, or a row that is not ours; a database that refuses it is a 503 and the replay lands", async () => {
  const stop = (w) => w.form({ MessageStatus: "undelivered", ErrorCode: "21610" });
  const person = (w, id, over = {}) => ({
    id,
    tenant_id: w.T,
    consent: "opted_in",
    dnc: false,
    consent_source: "customer_message",
    consent_updated_at: "2026-09-01T10:00:00Z",
    erased_at: null,
    ...over,
  });
  const sentAt = "2026-10-01T10:00:00Z";
  const made = (row, contacts, more = {}) => {
    const w = world({ row: { created_at: sentAt, ...row }, ...more });
    w.tables.contacts = contacts(w);
    w.tables.events = [];
    w.tables.escalations = [];
    return w;
  };

  // The row names no person: their thread does.
  const byThread = made({ contact_id: null }, (w) => [person(w, "k-9")]);
  byThread.tables.conversations = [{ id: "cv-1", tenant_id: byThread.T, contact_id: "k-9" }];
  assert.equal(await byThread.post(stop(byThread)), 200);
  assert.equal(byThread.tables.contacts[0].consent, "opted_out", "the thread's person");

  // No person at all, an erased one, a message that came IN, and one that was not a text: nothing is written.
  const nobody = made({ contact_id: null }, () => []);
  nobody.tables.conversations = [];
  assert.equal(await nobody.post(stop(nobody)), 200);
  const erased = made({ contact_id: "k-2" }, (w) => [
    person(w, "k-2", { consent: "unknown", dnc: true, erased_at: "2026-09-20T00:00:00Z" }),
  ]);
  assert.equal(await erased.post(stop(erased)), 200);
  const inbound = made({ contact_id: "k-4", direction: "inbound", sender: "customer" }, (w) => [person(w, "k-4")]);
  assert.equal(await inbound.post(stop(inbound)), 200);
  for (const w of [nobody, erased, inbound]) assert.equal(w.tables.events.length, 0);
  assert.deepEqual([erased.tables.contacts[0].consent, inbound.tables.contacts[0].consent], ["unknown", "opted_in"]);

  // They sent START after the text was written: a report said again must not stop them a second time.
  const back = made({ contact_id: "k-5" }, (w) => [person(w, "k-5", { consent_updated_at: "2026-10-02T09:00:00Z" })]);
  assert.equal(await back.post(stop(back)), 200);
  assert.deepEqual([back.tables.contacts[0].consent, back.tables.events.length], ["opted_in", 0]);

  // A database that cannot read the person: 503, with the row already moved, and the platform paged. Twilio does not
  // say it again: the kept delivery's replay records the STOP.
  const down = made({ contact_id: "k-3" }, (w) => [person(w, "k-3")], {
    faults: { "contacts.select": { message: "contacts is away" } },
  });
  assert.equal(await down.post(stop(down)), 503);
  assert.equal(down.tables.contacts[0].consent, "opted_in");
  assert.deepEqual(
    down.tables.operator_pages.map((p) => p.key),
    [`sms_status_unrecorded:${down.T}`],
    "the platform is told",
  );
  down.heal();
  assert.equal(await replayed(`${down.row.external_id}:undelivered`), 200);
  assert.deepEqual([down.tables.contacts[0].consent, down.tables.messages[0].status], ["opted_out", "failed"]);
});
