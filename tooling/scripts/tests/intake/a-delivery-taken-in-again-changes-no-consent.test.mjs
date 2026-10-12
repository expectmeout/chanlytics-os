/**
 * A delivery taken in again says nothing new about consent, and a yes that did not land is written by the visit that
 * finds it missing, in the repository's half (packages/db ingestInbound): the channel a START covers (note_yes_on_channel,
 * 00297) and a yes to offers (set_marketing_consent) are OWED by a message until they are written. The call that kept the
 * message writes them; a message that is still unhandled is taken in again by design (a text's door, then the
 * inbound_answer job that answers it; Meta's redelivery; an operator's replay), and that visit writes the ones the ledger
 * does not hold for the message, each once, and raises if it cannot. A handled message is never asked again: a yes
 * written again there stood over a no the person had given since. The database's half, ingest_inbound's own STOP and
 * START (00361), is run on Postgres beside this file.
 *
 * Run over a database in memory whose ingest_inbound answers as the function does: new the first time a message id
 * arrives, held every time after, unhandled until the world says it was handled; and whose consent doors keep the
 * contact.consent_changed line the real ones keep, naming the message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestInbound } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER = "+15555550142";

/**
 * A workspace whose ingest_inbound keeps each message id once, and whose consent doors record that they were asked and
 * write their line on the ledger. `failing` names the doors that refuse (a database blip) until `heal()`.
 */
function world({ consent = "opted_in", dnc = false } = {}) {
  const held = new Set();
  const handled = new Set();
  const failing = new Set();
  const tables = { events: [] };
  const line = (data) =>
    tables.events.push({
      tenant_id: T,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: PERSON,
      data,
    });
  const db = fakeDb(
    tables,
    {},
    {
      ingest_inbound: (a) => {
        const isNew = !held.has(a.p_message_external_id);
        held.add(a.p_message_external_id);
        return {
          message_id: `m-${a.p_message_external_id}`,
          conversation_id: "conv-1",
          contact_id: PERSON,
          is_new: isNew,
          processed: handled.has(a.p_message_external_id),
          state: "open",
          paused_until: null,
          consent,
          dnc,
        };
      },
      note_yes_on_channel: (a) => {
        if (failing.has("note_yes_on_channel")) throw new Error("connection reset");
        line({
          consent: "opted_in",
          source: "customer_message",
          channel: a.p_channel,
          message_external_id: a.p_message_external_id,
        });
        return true;
      },
      set_marketing_consent: (a) => {
        if (failing.has("set_marketing_consent")) throw new Error("connection reset");
        line({ purpose: "marketing", consent: "opted_in", source: "customer_message", ...a.p_evidence });
        return { ok: true };
      },
    },
  );
  const asked = (name) => db.seen.filter((s) => s.rpc === name);
  return {
    db,
    asked,
    tables,
    fail: (name) => failing.add(name),
    heal: () => failing.clear(),
    finish: (id) => handled.add(id),
  };
}

/** A customer's message as a door hands it to the repository. */
const message = (over) => ({
  tenantId: T,
  channel: "sms",
  identityExternalId: CUSTOMER,
  phoneE164: CUSTOMER,
  waProfileName: null,
  messageExternalId: "SM-start-1",
  type: "text",
  body: "START",
  channelTs: new Date().toISOString(),
  ...over,
});

const offers = (over) =>
  message({
    channel: "whatsapp",
    messageExternalId: "wamid.offers-1",
    body: "YES OFFERS",
    optInMarketing: true,
    ...over,
  });

/** The AnswerNotKept the repository raises for a yes that did not land. */
const notKept = (e) => e.name === "AnswerNotKept";

test("a START kept for the first time notes the channel it covers; the same START taken in again, still unhandled, finds it on the ledger and notes nothing", async () => {
  const { db, asked } = world();
  const first = await ingestInbound(db, message({ optIn: true }));
  assert.equal(first.is_new, true);
  assert.equal(asked("note_yes_on_channel").length, 1, "the call that kept it writes the yes on its channel");
  assert.deepEqual(asked("note_yes_on_channel")[0].args, {
    p_tenant_id: T,
    p_contact_id: PERSON,
    p_channel: "sms",
    p_message_external_id: "SM-start-1",
    p_words: "START",
  });

  // The job that answers the text runs the whole inbound phase again with Twilio's own fields: the message is not yet
  // handled, so it asks the ledger, which names the message, and writes nothing.
  const again = await ingestInbound(db, message({ optIn: true }));
  assert.equal(again.is_new, false);
  assert.equal(
    asked("note_yes_on_channel").length,
    1,
    "REGRESSION: a START taken in again wrote its yes again, over a STOP the person had sent since",
  );
  assert.deepEqual(again, { ...first, is_new: false }, "and the caller is still told what the function answered");
});

test("a YES OFFERS kept for the first time records the yes; taken in again, unhandled or handled, it records nothing", async () => {
  const { db, asked, finish } = world();
  await ingestInbound(db, offers());
  assert.equal(asked("set_marketing_consent").length, 1, "the call that kept it records the yes, with its proof");
  assert.deepEqual(asked("set_marketing_consent")[0].args.p_evidence, {
    channel: "whatsapp",
    message_external_id: "wamid.offers-1",
    words: "YES OFFERS",
  });

  // The job that answers it, Meta's redelivery, an operator's replay: the same message id, not yet handled.
  await ingestInbound(db, offers());
  // And once it was answered, whatever comes after.
  finish("wamid.offers-1");
  await ingestInbound(db, offers());
  assert.equal(
    asked("set_marketing_consent").length,
    1,
    "REGRESSION: a yes to offers taken in again was written again, over a no the person had given since",
  );
});

test("a message that is new still asks both doors, and its repeats ask neither once the ledger holds its answers, whatever it carries", async () => {
  const { db, asked, finish } = world();
  const both = { optIn: true, optInMarketing: true, channel: "whatsapp", messageExternalId: "wamid.both-1" };
  await ingestInbound(db, message(both));
  await ingestInbound(db, message(both));
  finish("wamid.both-1");
  await ingestInbound(db, message(both));
  assert.deepEqual(
    [asked("note_yes_on_channel").length, asked("set_marketing_consent").length],
    [1, 1],
    "one delivery, one answer, however many times it is taken in",
  );
  assert.equal(asked("ingest_inbound").length, 3, "each delivery is still kept through the function, which says held");
});

test("a YES OFFERS whose write failed at the door is written by the job's visit, once, and never after it was handled", async () => {
  const { db, asked, tables, fail, heal, finish } = world();
  fail("set_marketing_consent");
  // The door of a text: a job follows, so the message is kept, the failure is left owed and the customer is answered.
  const door = await ingestInbound(db, offers({ jobFollows: true }));
  assert.equal(door.is_new, true);
  assert.deepEqual(tables.events, [], "nothing landed");

  // The job's visit: the database is back. The ledger names no line for the message, so the yes is written, with its proof.
  heal();
  const job = await ingestInbound(db, offers());
  assert.equal(job.is_new, false);
  assert.equal(asked("set_marketing_consent").length, 2, "tried at the door, written by the job");
  assert.deepEqual(
    tables.events.map((e) => [e.data.purpose, e.data.consent, e.data.message_external_id]),
    [["marketing", "opted_in", "wamid.offers-1"]],
  );

  // Handled now; a retry of the job, a redelivery, asks nothing.
  finish("wamid.offers-1");
  await ingestInbound(db, offers());
  await ingestInbound(db, offers());
  assert.equal(asked("set_marketing_consent").length, 2);
  assert.equal(tables.events.length, 1);
});

test("a yes that fails on the visit nothing else repeats is raised after the log, the message kept; the retry writes it", async () => {
  const { db, asked, tables, fail, heal } = world();
  fail("set_marketing_consent");
  // A WhatsApp message answered in its webhook has no job after it: the failure travels up, the webhook answers 503 and
  // Meta sends the message again.
  await assert.rejects(ingestInbound(db, offers()), notKept);
  assert.equal(asked("ingest_inbound").length, 1, "the message was kept before the yes was asked");

  heal();
  const redelivery = await ingestInbound(db, offers());
  assert.equal(redelivery.is_new, false);
  assert.equal(tables.events.length, 1, "the redelivery finds the message unhandled and writes the yes");
  assert.equal(asked("set_marketing_consent").length, 2);
});

test("a job's visit that cannot write the yes raises, so the ledger tries the job again", async () => {
  const { db, fail } = world();
  fail("set_marketing_consent");
  await ingestInbound(db, offers({ jobFollows: true }));
  for (let attempt = 0; attempt < 3; attempt++)
    await assert.rejects(ingestInbound(db, offers()), notKept, `attempt ${attempt + 1} of the job`);
});

test("both answers are asked before the failure is told: a channel note that fails does not cost the offers yes its try", async () => {
  const { db, asked, tables, fail } = world();
  fail("note_yes_on_channel");
  await assert.rejects(
    ingestInbound(
      db,
      message({ channel: "whatsapp", messageExternalId: "wamid.both-2", optIn: true, optInMarketing: true }),
    ),
    (e) =>
      notKept(e) && /consent_channel_write_failed/.test(e.message) && !/marketing_consent_write_failed/.test(e.message),
  );
  assert.equal(asked("set_marketing_consent").length, 1);
  assert.deepEqual(
    tables.events.map((e) => e.data.purpose),
    ["marketing"],
  );
});

test("a START whose note failed is noted by the next visit; the offers line of the same message is not mistaken for its answer", async () => {
  const { db, asked, tables, fail, heal } = world();
  fail("note_yes_on_channel");
  const both = { optIn: true, optInMarketing: true, channel: "whatsapp", messageExternalId: "wamid.both-3" };
  await ingestInbound(db, message({ ...both, jobFollows: true }));
  heal();
  await ingestInbound(db, message(both));
  assert.equal(asked("note_yes_on_channel").length, 2, "the offers line names the message but is another question");
  assert.equal(
    asked("set_marketing_consent").length,
    1,
    "and the offers yes, written the first time, is not written again",
  );
  assert.deepEqual(
    tables.events.map((e) => e.data.purpose ?? "visit"),
    ["marketing", "visit"],
  );
});

test("a yes to offers under a stop is still not recorded, new or held", async () => {
  const { db, asked } = world({ consent: "opted_out", dnc: true });
  await ingestInbound(db, message({ channel: "whatsapp", messageExternalId: "wamid.offers-2", optInMarketing: true }));
  await ingestInbound(db, message({ channel: "whatsapp", messageExternalId: "wamid.offers-2", optInMarketing: true }));
  assert.equal(asked("set_marketing_consent").length, 0);
});

test("a message that carries no answer asks nothing of the ledger or the doors, on any visit", async () => {
  const { db, asked } = world();
  await ingestInbound(db, message({ body: "what time do you open?" }));
  await ingestInbound(db, message({ body: "what time do you open?" }));
  assert.deepEqual(
    db.seen.filter((s) => s.rpc !== "ingest_inbound"),
    [],
  );
  assert.equal(asked("ingest_inbound").length, 2);
});
