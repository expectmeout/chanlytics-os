/**
 * A delivery taken in again says nothing new about consent, in the repository's half (packages/db ingestInbound): the
 * channel a START covers (note_yes_on_channel, 00297) and a yes to offers (set_marketing_consent) are written by the
 * call that kept the message, and never by a call that found it held. A text is taken in twice by design (its door,
 * then the inbound_answer job that answers it), and a WhatsApp message again on Meta's redelivery, an operator's replay
 * and an answer taken up later: a yes written again there stood over a no the person had given since. The database's
 * half, ingest_inbound's own STOP and START (00361), is run on Postgres beside this file.
 *
 * Run over a database in memory whose ingest_inbound answers as the function does: new the first time a message id
 * arrives, held every time after.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestInbound } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER = "+15555550142";

/** A workspace whose ingest_inbound keeps each message id once, and whose consent doors record that they were asked. */
function world({ consent = "opted_in", dnc = false } = {}) {
  const held = new Set();
  const db = fakeDb(
    {},
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
          processed: false,
          state: "open",
          paused_until: null,
          consent,
          dnc,
        };
      },
      note_yes_on_channel: () => true,
      set_marketing_consent: () => ({ ok: true }),
    },
  );
  const asked = (name) => db.seen.filter((s) => s.rpc === name);
  return { db, asked };
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

test("a START kept for the first time notes the channel it covers; the same START taken in again notes nothing", async () => {
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

  // The job that answers the text runs the whole inbound phase again with Twilio's own fields.
  const again = await ingestInbound(db, message({ optIn: true }));
  assert.equal(again.is_new, false);
  assert.equal(
    asked("note_yes_on_channel").length,
    1,
    "REGRESSION: a START taken in again wrote its yes again, over a STOP the person had sent since",
  );
  assert.deepEqual(again, { ...first, is_new: false }, "and the caller is still told what the function answered");
});

test("a YES OFFERS kept for the first time records the yes; taken in again it records nothing", async () => {
  const { db, asked } = world();
  await ingestInbound(
    db,
    message({ channel: "whatsapp", messageExternalId: "wamid.offers-1", body: "YES OFFERS", optInMarketing: true }),
  );
  assert.equal(asked("set_marketing_consent").length, 1, "the call that kept it records the yes, with its proof");
  assert.deepEqual(asked("set_marketing_consent")[0].args.p_evidence, {
    channel: "whatsapp",
    message_external_id: "wamid.offers-1",
    words: "YES OFFERS",
  });

  // Meta's redelivery, an operator's replay, an answer taken up later: the same message id.
  await ingestInbound(
    db,
    message({ channel: "whatsapp", messageExternalId: "wamid.offers-1", body: "YES OFFERS", optInMarketing: true }),
  );
  assert.equal(
    asked("set_marketing_consent").length,
    1,
    "REGRESSION: a yes to offers taken in again was written again, over a no the person had given since",
  );
});

test("a message that is new still asks both doors, and a held one asks neither, whatever it carries", async () => {
  const { db, asked } = world();
  const both = { optIn: true, optInMarketing: true, channel: "whatsapp", messageExternalId: "wamid.both-1" };
  await ingestInbound(db, message(both));
  await ingestInbound(db, message(both));
  await ingestInbound(db, message(both));
  assert.deepEqual(
    [asked("note_yes_on_channel").length, asked("set_marketing_consent").length],
    [1, 1],
    "one delivery, one answer, however many times it is taken in",
  );
  assert.equal(asked("ingest_inbound").length, 3, "each delivery is still kept through the function, which says held");
});

test("a yes to offers under a stop is still not recorded, new or held", async () => {
  const { db, asked } = world({ consent: "opted_out", dnc: true });
  await ingestInbound(db, message({ channel: "whatsapp", messageExternalId: "wamid.offers-2", optInMarketing: true }));
  await ingestInbound(db, message({ channel: "whatsapp", messageExternalId: "wamid.offers-2", optInMarketing: true }));
  assert.equal(asked("set_marketing_consent").length, 0);
});
