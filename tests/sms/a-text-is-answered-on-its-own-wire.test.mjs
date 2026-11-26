/**
 * A text is taken in, held and answered on its own wire, run: the receptionist's world on a texting line
 * (inbound/_world.mjs, the real handler and gates), and the sink's door (lib/inbound/persist.ts pgSink) over the send
 * door's database in memory (messages/deliver/_deliver.mjs). Pinned as the message path's, persist.ts's and the
 * outbound writer's text in sms.test.mjs until 26 Nov 2026.
 *
 * Where the rest of that wiring is run: the held line's place in the order (after consent, before anything that speaks)
 * in inbound/the-gates-run-in-their-order.test.mjs; the text answered through the line's own wire, never WhatsApp's, in
 * sms-door.test.mjs; a person's reply on the wire the customer last wrote on, with no window on a text, in
 * conversations/reply/core-reply.test.mjs; the routing row keyed on the number and the line's two webhooks built from one
 * address in lines/lines-saga.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { world, text, ingested } from "../inbound/_world.mjs";
import { answers, veto } from "../inbound/phases/_fixtures.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { T, person, tables, thread, outreachRpc } from "../messages/deliver/_deliver.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { pgSink } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/inbound/persist.ts")).href);
const { recordOutbound } = await import(
  pathToFileURL(path.join(ROOT, "packages/db/src/repositories/channels/ingest.ts")).href
);

/** A texting line as the SMS door hands it to the receptionist: its wire, its words as they are, approved or held. */
const line = (held = null) => ({
  channel: "sms",
  send: async () => ({ ok: true, wamid: "SM1", status: 201 }),
  body: (t) => t,
  held,
});

test("every way a text is taken in records it on its own wire: answered, a STOP, held for the carriers", async () => {
  const wires = [];
  const ingest = async (_db, _tenant, n) => {
    wires.push(n.channel);
    return ingested(n);
  };
  await world({ carrier: line(), ingest }).run(text("when do you open?", "SM-a"));
  await world({ carrier: line(), ingest }).run(text("STOP", "SM-b"));
  await world({
    carrier: line({ reason: "carriers", details: "The line is not approved for texting yet." }),
    ingest,
  }).run(text("hello?", "SM-c"));
  assert.equal(wires.length, 6, "the door's record and the job's, for each of the three");
  assert.deepEqual([...new Set(wires)], ["sms"]);
});

test("a reply held for its window is written for the text's own wire, and one that leaves goes on it", async () => {
  const held = world({ env: { modelKey: "sk-test" }, rt: veto, queue: true, carrier: line() });
  await held.run(text("when do you open?", "SM-d"), answers("We open at 9."));
  assert.deepEqual(held.seen.queuedOn, ["sms"], "the draft's job sends it as a text");
  const now = world({ env: { modelKey: "sk-test" }, carrier: line() });
  await now.run(text("when do you open?", "SM-e"), answers("We open at 9."));
  assert.deepEqual(
    now.seen.sent.map((s) => [s.channel, s.body]),
    [["sms", "We open at 9."]],
  );
});

test("the sink's door sends on this message's wire as the receptionist answering, a reply unless the caller says otherwise", async () => {
  const ing = { message_id: "m-in", conversation_id: "c1", contact_id: "k1", is_new: true };
  const sent = [];
  const wire = { sms: async (to, p) => (sent.push({ to, body: p.body }), { ok: true, wamid: "SM9", status: 201 }) };
  // A person who has said no yes to anything yet: an answer to their own message is owed them all the same.
  const t = tables({ conversations: [thread({ contacts: person({ consent: "unknown" }) })] });
  const sink = pgSink(fakeDb(t, {}, outreachRpc(t)), T, ing, null, "sms", wire);
  const out = await sink.deliver("+13475550101", "We open at 9.");
  assert.equal(out.outcome, "sent", JSON.stringify(out));
  assert.deepEqual(sent, [{ to: "+13475550101", body: "We open at 9." }], "on the text's own wire");
  const [row] = t.messages;
  assert.deepEqual(
    [row.channel, row.sender, row.direction, row.meta?.reply_to],
    ["sms", "ai", "outbound", "m-in"],
    "the row says its wire, who wrote it, and what it answers",
  );
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.data?.sender]),
    [["message.sent", "ai"]],
    "an answer, about something of theirs, to a person who never said yes: no conversation started",
  );
  // The purpose is the caller's: the one marketing send (a YES OFFERS confirmation) is asked the marketing rules, and
  // offers never go by text.
  const offer = await pgSink(fakeDb(tables(), {}, outreachRpc(tables())), T, ing, null, "sms", wire).deliver(
    "+13475550101",
    "You're in for offers.",
    undefined,
    "marketing",
  );
  assert.notEqual(offer.outcome, "sent", "an offer is refused on a text");
  assert.equal(sent.length, 1, "and the wire is not asked");
  // No wire named: the receptionist's own, WhatsApp.
  const wa = [];
  const w2 = tables();
  await pgSink(fakeDb(w2, {}, outreachRpc(w2)), T, ing, null, undefined, {
    whatsapp: async (to, p) => (wa.push(p), { ok: true, wamid: "wamid.9", status: 200 }),
  }).deliver("+13475550101", "We open at 9.");
  assert.deepEqual([wa.length, w2.messages[0]?.channel], [1, "whatsapp"]);
});

test("an outbound row says its wire: WhatsApp unless the writer names another", async () => {
  const t = { messages: [] };
  const write = (over) =>
    recordOutbound(fakeDb(t), {
      tenantId: T,
      conversationId: "c1",
      contactId: "k1",
      sender: "ai",
      body: "We open at 9.",
      externalId: `x-${t.messages.length}`,
      ...over,
    });
  await write({});
  await write({ channel: "sms" });
  assert.deepEqual(
    t.messages.map((m) => m.channel),
    ["whatsapp", "sms"],
  );
});
