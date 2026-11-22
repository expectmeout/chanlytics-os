/**
 * A request carried into a chat by its code (00680; the Forms plan, 3.4 and 3.5), run as the edge keeps an inbound
 * message (inbound/persist.ts runPgIngest), over a database in memory. The thank-you opens the chat with the visitor's
 * own message, the request's code in brackets at its end.
 *
 * The plan's "done when" leads: a person who continues in WhatsApp is the same person (the number that wrote is added
 * to the request's person BEFORE the message is kept, where they gave an address and no number), and the conversation
 * answers the request, once. A code is good once; without it nothing is linked; a held entry whose code arrives is let
 * through; and a request's code is never the reason a customer's message is lost.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inboundFromWhatsapp } from "@chanlytics/channels/whatsapp";
import { A, FORM, V1, formWorld } from "./_form-requests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { runPgIngest } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/inbound/persist.ts")).href);

const FROM = "13055550142";
const PHONE = `+${FROM}`;
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Ana" } }] };
const message = (body, id = "wamid.rq.1") =>
  inboundFromWhatsapp({ from: FROM, id, type: "text", timestamp: "1790000000", text: { body } }, value);

/**
 * The salon's world, with the database's ingest as it resolves a message's person: found by the number that wrote, else
 * made, each in a conversation of their own. `order` records which door ran when.
 */
function world() {
  const order = [];
  let made;
  const ingest = (a) => {
    order.push("ingest");
    const contacts = made.tables.contacts;
    let person = contacts.find((c) => c.phone_e164 === a.p_phone_e164);
    if (!person) {
      person = { id: `c${contacts.length + 1}`, tenant_id: A, phone_e164: a.p_phone_e164, email: null };
      contacts.push(person);
    }
    const conversations = (made.tables.conversations ??= []);
    let conversation = conversations.find((c) => c.contact_id === person.id);
    if (!conversation) {
      conversation = { id: `conv-${conversations.length + 1}`, tenant_id: A, contact_id: person.id };
      conversations.push(conversation);
    }
    return {
      message_id: `m-${a.p_message_external_id}`,
      conversation_id: conversation.id,
      contact_id: person.id,
      is_new: true,
      processed: false,
      state: "open",
      paused_until: null,
      consent: "unknown",
      dnc: false,
    };
  };
  made = formWorld({ more: { conversations: [] }, rpcs: { ingest_inbound: ingest } });
  const take = (ref, reach, over = {}) =>
    made.db
      .rpc("form_request_take", {
        p_tenant_id: A,
        p_form_id: FORM,
        p_version_id: V1,
        p_ref: ref,
        p_answers: { f4want: "A warm, soft blonde for spring." },
        p_reach: reach,
        p_words: "0".repeat(64),
        ...over,
      })
      .then((r) => r.data);
  const open = async () => (await made.db.rpc("form_requests_open", { p_tenant_id: A })).data.map((r) => r.id);
  return { ...made, order, take, open };
}

const EMAIL_ONLY = { name: "Ana Ruiz", email: "ana.ruiz@example.com", phone: null };

test("she gave an address, then wrote from her phone with the code: the same person, one conversation, and the request is answered", async () => {
  const w = world();
  const taken = await w.take("e-1", EMAIL_ONLY);
  assert.deepEqual(await w.open(), [taken.entry_id]);
  const out = await runPgIngest(
    w.db,
    A,
    message(`Hi Luma Salon, it's Ana. I sent a request: Colour consultation. "A warm, soft blonde" (${taken.code})`),
  );
  assert.equal(w.tables.contacts.length, 1, "no second person is made");
  assert.equal(w.tables.contacts[0].phone_e164, PHONE, "the number that wrote is hers now");
  assert.equal(out.contact_id, taken.contact_id, "the conversation is the request's own person's");
  assert.deepEqual(
    w.tables.form_entry_links.map((l) => [l.kind, l.entry_id, l.conversation_id, l.message_id]),
    [["conversation", taken.entry_id, out.conversation_id, out.message_id]],
  );
  assert.ok(w.tables.form_entries[0].code_used_at, "the code is spent");
  assert.deepEqual(await w.open(), [], "her own message answers the request");
});

test("a code is good once: written again, from anywhere, it links nothing", async () => {
  const w = world();
  const taken = await w.take("e-1", EMAIL_ONLY);
  await runPgIngest(w.db, A, message(`about my request (${taken.code})`));
  await runPgIngest(w.db, A, message(`again (${taken.code})`, "wamid.rq.2"));
  assert.equal(w.tables.form_entry_links.length, 1);
});

test("a message with no code is kept as it always was, and asks the request's doors nothing", async () => {
  const w = world();
  await w.take("e-1", EMAIL_ONLY);
  let asked = 0;
  const rpc = w.db.rpc.bind(w.db);
  w.db.rpc = (name, args) => {
    if (name.startsWith("form_code_")) asked += 1;
    return rpc(name, args);
  };
  const out = await runPgIngest(w.db, A, message("hi! is June 14 free for a balayage?"));
  assert.equal(out.message_id, "m-wamid.rq.1");
  assert.equal(asked, 0);
  assert.equal(w.tables.form_entry_links.length, 0);
  assert.equal(w.tables.contacts.length, 2, "without the code she is whoever her number says: no guess joins them");
});

test("she had typed a number already: nothing of hers is overwritten, and the conversation still answers the request", async () => {
  const w = world();
  const taken = await w.take("e-1", { name: "Ana", email: "ana.ruiz@example.com", phone: "+17865550199" });
  const out = await runPgIngest(w.db, A, message(`hello (${taken.code})`));
  assert.equal(w.tables.contacts[0].phone_e164, "+17865550199", "the number she typed stays hers");
  assert.notEqual(out.contact_id, taken.contact_id, "the number that wrote is another person on record");
  assert.equal(w.tables.form_entry_links[0].kind, "conversation");
  assert.deepEqual(await w.open(), []);
});

test("the person is resolved before the message is kept, and the link is written after", async () => {
  const w = world();
  const taken = await w.take("e-1", EMAIL_ONLY);
  const rpc = w.db.rpc.bind(w.db);
  w.db.rpc = (name, args) => {
    if (name.startsWith("form_code_")) w.order.push(name);
    return rpc(name, args);
  };
  await runPgIngest(w.db, A, message(`hello (${taken.code})`));
  assert.deepEqual(w.order, ["form_code_person", "ingest", "form_code_link"]);
});

test("a held entry whose code arrives in a chat is let through: a person's own phone wrote", async () => {
  const w = world();
  const held = await w.take("e-held", EMAIL_ONLY, { p_held_why: "too_fast" });
  assert.equal(held.outcome, "held");
  const out = await runPgIngest(w.db, A, message(`about my request (${held.code})`));
  const [entry] = w.tables.form_entries;
  assert.deepEqual([entry.state, entry.held_why, entry.contact_id], ["accepted", null, out.contact_id]);
  assert.deepEqual(entry.owed, ["note", "notice"], "everything it should have started starts now");
  assert.deepEqual(
    w.tables.events.map((e) => [e.kind, e.subject_id]),
    [["form_entry.accepted", entry.id]],
  );
});

test("a request's code is never the reason a message is lost: its doors failing, the message is kept all the same", async () => {
  const w = world();
  const taken = await w.take("e-1", EMAIL_ONLY);
  const rpc = w.db.rpc.bind(w.db);
  w.db.rpc = (name, args) =>
    name.startsWith("form_code_")
      ? Promise.resolve({ data: null, error: { message: "the database is away", code: "57P01" } })
      : rpc(name, args);
  const out = await runPgIngest(w.db, A, message(`hello (${taken.code})`));
  assert.equal(out.message_id, "m-wamid.rq.1", "the message landed");
  assert.equal(w.tables.form_entry_links.length, 0);
});
