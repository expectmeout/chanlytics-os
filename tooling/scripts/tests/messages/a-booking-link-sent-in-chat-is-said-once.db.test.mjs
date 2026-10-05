/**
 * 00313 on a real Postgres: a booking link sent in chat is said once (the Reports lenses spec, K7, the chat half). The
 * trigger is on the message row, so the writers are the real ones: the send door (core deliver.ts, which writes a row as
 * sent or finalizes a queued one) over the real repository writer (db recordOutbound), and a row written straight, as a
 * backfill or a campaign writes it. One predicate, message_carries_link, is the rule: the words hold the link without its
 * scheme, as stored. It is the receptionist's own check (layerTwo in packages/core/src/inbound/steps.ts) wherever the
 * scheme is present, and it also counts what the voice tool and the Inbox's template write, which strip the scheme before
 * they fill the slot (sendBookingLinkOnCall in apps/edge/lib/voice/call-booking-link.ts, queueReply in
 * packages/core/src/conversations/reply.ts): those two are sent here with the words their own code builds, through the
 * same contracts functions.
 * What is proved:
 *   - the rule, case by case, and that it is never a match on everything (no link, an empty one, a scheme alone);
 *   - the event is written once, when a row becomes sent (written as sent, or a queued one finalized) on whatsapp or sms,
 *     and never for a draft that was canceled or failed, an email, an inbound message, a campaign's or a reach-out's
 *     send, or a backfilled row; a later delivered, read or repeated sent writes no second one;
 *   - each workspace's own link: another workspace's link says nothing;
 *   - it sits beside the first touch of 00306 on the same table, and neither takes the other's place;
 *   - a ledger that cannot take the event does not take the message with it, on a row written as sent and on one that
 *     becomes sent (a transaction on this machine's database that never commits, through the CLI, as
 *     team-changes-and-their-audit.db.test.mjs does).
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { firstNameOf, inboxSlots, renderTemplate, resolveParams } from "@chanlytics/contracts";
import { recordOutbound } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes messages and events"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];

const { deliver } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const stamp = Date.now();
const LINK = "https://book.example.com/harbor";
/**
 * The link as the voice tool and the Inbox's template fill their slot: the scheme stripped (sendBookingLinkOnCall in
 * call-booking-link.ts, queueReply in reply.ts).
 */
const SLOT = LINK.replace(/^https?:[/][/]/, "");
let db;
let harbor; // { tenantId, contactId, conversationId, phone }
let acme;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** A workspace with its booking link on file, one person who may be messaged, and their thread. */
async function world(slug, link, phone) {
  const tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${stamp}`, name: `${slug} test` })
      .select("id")
      .single(),
  ).id;
  ok(
    await db
      .from("tenant_config")
      .upsert({ tenant_id: tenantId, config: { brain: { booking_link: link } } }, { onConflict: "tenant_id" }),
  );
  const contactId = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone, consent: "opted_in" })
      .select("id")
      .single(),
  ).id;
  const conversationId = ok(
    await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contactId }).select("id").single(),
  ).id;
  return { tenantId, contactId, conversationId, phone };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  harbor = await world("harbor-link", LINK, "+15550136501");
  acme = await world("acme-link", "https://acme.example.com/book", "+15550136502");
});

after(async () => {
  if (skip) return;
  for (const w of [harbor, acme]) {
    if (!w) continue;
    await db.from("events").delete().eq("tenant_id", w.tenantId);
    await db.from("tenants").delete().eq("id", w.tenantId);
  }
});

const wire = {
  whatsapp: async () => ({ ok: true, wamid: `wamid.k7.${stamp}.${++seq}`, status: 200 }),
};
/** A send through the one door, as the receptionist's sink sends: written as sent, after it has left. */
const send = (over = {}) =>
  deliver(
    { db, wire },
    {
      tenantId: harbor.tenantId,
      conversationId: harbor.conversationId,
      contactId: harbor.contactId,
      to: harbor.phone,
      channel: "whatsapp",
      sender: "ai",
      purpose: "conversational",
      proactive: false,
      body: `Book here: ${LINK}`,
      ...over,
    },
  );
/** A message row written straight, as a backfill or a campaign writes one. */
const rowOf = (over = {}, w = harbor) => ({
  tenant_id: w.tenantId,
  conversation_id: w.conversationId,
  contact_id: w.contactId,
  channel: "whatsapp",
  direction: "outbound",
  sender: "human",
  type: "text",
  body: `Book: ${LINK}`,
  status: "sent",
  meta: {},
  ...over,
});
const insert = async (over, w) => ok(await db.from("messages").insert(rowOf(over, w)).select("id").single()).id;
const queue = (over, w) => insert({ status: "queued", ...over }, w);
const move = async (id, status) => ok(await db.from("messages").update({ status }).eq("id", id).select("id"));
/** The booking_link.sent events of a message. */
const links = async (messageId, w = harbor) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("tenant_id", w.tenantId)
      .eq("kind", "booking_link.sent")
      .eq("subject_id", messageId),
  );
const said = (channel, sender) => [{ category: "message", subject_type: "message", data: { channel, sender } }];

const CASES = [
  // the receptionist's own check, with the scheme present (layerTwo in steps.ts)
  ["Book here: https://book.example.com/harbor", LINK, true, "verbatim, with its scheme"],
  ["Book here: http://book.example.com/harbor", LINK, true, "the other scheme: the host and path are the link"],
  // what the voice tool and the Inbox's template write: the scheme stripped (sendBookingLinkOnCall in
  // call-booking-link.ts, queueReply in reply.ts)
  ["Book here: book.example.com/harbor", LINK, true, "a template's slot has no scheme"],
  ["Hi there, it's Harbor. Pick a time: book.example.com/harbor — any time suits.", LINK, true, "in a sentence"],
  ["see book.example.com/harbor/, thanks", LINK, true, "a closing slash after it"],
  ["(book.example.com/harbor)", LINK, true, "in brackets"],
  ["book.example.com/harbor?src=wa", LINK, true, "a query after it"],
  ["https://book.example.com/harbor/classes", LINK, true, "a page under it holds it, as steps.ts holds it"],
  ["book.example.com/harbor-classes", LINK, true, "a longer name that starts with it holds it, as steps.ts does"],
  ["notbook.example.com/harbor", LINK, true, "a substring, as steps.ts: the rule never splits words"],
  // the link as stored
  [
    "book.example.com/harbor/",
    "https://book.example.com/harbor/",
    true,
    "a link stored with its slash is held with it",
  ],
  [
    "book.example.com/harbor",
    "https://book.example.com/harbor/",
    false,
    "so the words without that slash do not hold it",
  ],
  ["https://book.example.com/harbor", "book.example.com/harbor", true, "a link stored without a scheme"],
  ["book.example.com/harbor", "http://book.example.com/harbor", true, "stored as http"],
  [
    "Book: book.example.com/harbor.",
    "https://book.example.com/harbor ",
    false,
    "read as stored: a space kept on the link is part of it",
  ],
  [
    "BOOK.EXAMPLE.COM/HARBOR.",
    LINK,
    false,
    "case is kept as stored: another spelling is not the link (steps.ts keeps it too)",
  ],
  [
    "Book.example.com",
    "HTTPS://Book.example.com",
    false,
    "the scheme is stripped as the senders strip it: lower case only",
  ],
  ["x.example.com/abc", "https://x.example.com/a.c", false, "a dot in a link is a dot, not a pattern"],
  ["a.b/c(d)", "https://a.b/c(d)", true, "brackets in a link are text, not a pattern"],
  ["https://x.example.com/a+b?c=1", "https://x.example.com/a+b?c=1", true, "a plus and a question mark are text"],
  // not the link
  ["We open at nine.", LINK, false, "no link"],
  ["book.example.com", LINK, false, "the host alone"],
  ["https://book.example.com/", LINK, false, "the site's front page"],
  ["book.example.com/harb", LINK, false, "part of it"],
  ["", LINK, false, "empty words"],
  [null, LINK, false, "no words"],
  // never a match on everything
  ["https://book.example.com/harbor", null, false, "none on file"],
  ["https://book.example.com/harbor", "", false, "an empty one"],
  ["words  with spaces https://x.example.com", "  ", false, "a blank one, though the words hold spaces"],
  ["see https://x.example.com", "https://", false, "a scheme and nothing else"],
  ["see http://x.example.com", "http://", false, "the other scheme and nothing else"],
];

test(
  "the predicate: the words hold the link without its scheme, as stored; never a match on everything",
  { skip },
  async () => {
    for (const [body, link, want, why] of CASES)
      assert.equal(ok(await db.rpc("message_carries_link", { p_body: body, p_link: link })), want, why);
    // The receptionist's own check (layerTwo in steps.ts: replyText.includes(booking_link)) is one spelling of this rule: wherever
    // it says yes for a link that is one (not blank, not a scheme alone), so does this, whatever else the words hold.
    const receptionist = (body, link) =>
      !!link && link.replace(/^https?:[/][/]/, "").trim() !== "" && String(body ?? "").includes(link);
    for (const [body, link] of CASES)
      if (receptionist(body, link))
        assert.equal(
          ok(await db.rpc("message_carries_link", { p_body: body, p_link: link })),
          true,
          `${body} | ${link}`,
        );
  },
);

test(
  "the receptionist's reply that carries the link is said once, when it has left; the same words without it say nothing",
  { skip },
  async () => {
    const sent = await send({});
    assert.equal(sent.outcome, "sent");
    assert.deepEqual(await links(sent.messageId), said("whatsapp", "ai"));
    assert.deepEqual(await links((await send({ body: "We open at nine." })).messageId), []);
    assert.deepEqual(await links((await send({ body: "Book at book.example.com/harb" })).messageId), []);
    assert.deepEqual(
      await links((await send({ body: `Book: ${LINK}`, sender: "system" })).messageId),
      said("whatsapp", "system"),
    );
  },
);

test(
  "a queued reply says it when it is finalized, not when it is queued; a canceled or failed one never does; the words without the scheme count",
  { skip },
  async () => {
    const words = "Here you go: book.example.com/harbor";
    const queued = await recordOutbound(db, {
      tenantId: harbor.tenantId,
      conversationId: harbor.conversationId,
      contactId: harbor.contactId,
      sender: "human",
      body: words,
      externalId: null,
      status: "queued",
    });
    assert.deepEqual(await links(queued), [], "queued: nothing has left");
    const out = await send({ messageId: queued, sender: "human", body: words });
    assert.equal(out.outcome, "sent");
    assert.deepEqual(await links(queued), said("whatsapp", "human"));
    for (const status of ["canceled", "failed"]) {
      const draft = await queue({ body: words });
      await move(draft, status);
      assert.deepEqual(await links(draft), [], `a draft that ${status}`);
    }
  },
);

test("one event per message: a delivered, a read and a repeated sent write no second one", { skip }, async () => {
  const id = await queue({ body: `Book: ${SLOT}` });
  await move(id, "sent");
  assert.equal((await links(id)).length, 1, "the move to sent");
  await move(id, "sent"); // a receipt that says sent again
  await move(id, "delivered");
  await move(id, "read");
  assert.equal((await links(id)).length, 1, "a later receipt");
  const written = (await send({})).messageId;
  await move(written, "delivered");
  await move(written, "read");
  assert.equal((await links(written)).length, 1, "a row written as sent, then delivered and read");
});

test(
  "the voice tool's WhatsApp link, with the words its own code builds, counts; so does a text, with its own channel",
  { skip },
  async () => {
    // sendBookingLinkOnCall (call-booking-link.ts): the template's slots are filled from the workspace's facts, the link with
    // its scheme stripped, and the row keeps the template's words filled (renderTemplate), or "[booking link] ..." when there are none.
    const template = {
      name: "booking_link",
      language: "en_US",
      body_preview:
        "Hi {{1}}, it's {{2}}. Here's the link to book your appointment: {{3}} — pick any time that suits you.",
      variables: [
        { position: 1, label: "First name", example: "Dani" },
        { position: 2, label: "Business name", example: "Luna Studio" },
        { position: 3, label: "Booking link", example: "https://booksy.com/luna-studio" },
      ],
    };
    const params = resolveParams(inboxSlots(template), {
      firstName: null,
      businessName: "Harbor Studio",
      bookingLink: SLOT,
    });
    const body = renderTemplate(template.body_preview, params) || `[booking link] ${params.join(" — ")}`;
    assert.ok(
      body.includes(SLOT) && !body.includes("https://"),
      `the words carry the link without its scheme: ${body}`,
    );
    const voice = await send({
      body,
      template: { name: template.name, language: template.language, params },
      meta: { source: "voice_booking_link", call_id: null },
    });
    assert.equal(voice.outcome, "sent");
    assert.deepEqual(await links(voice.messageId), said("whatsapp", "ai"));
    const text = await recordOutbound(db, {
      tenantId: harbor.tenantId,
      conversationId: harbor.conversationId,
      contactId: harbor.contactId,
      sender: "ai",
      body: `Book: ${LINK}`,
      externalId: null,
      channel: "sms",
    });
    assert.deepEqual(await links(text), said("sms", "ai"));
  },
);

test(
  "the Inbox's template, queued with the words its own code builds and finalized by the door, counts; a template that takes no link does not",
  { skip },
  async () => {
    // queueReply (reply.ts): the slots the Inbox fills (the first name, the business name, the link with its scheme stripped),
    // the words renderTemplate gives them, queued as a human's template (core-ports.ts queue), then sent by the job.
    const inbox = async (template) => {
      const params = resolveParams(inboxSlots(template), {
        firstName: firstNameOf("Dani Fox", null),
        businessName: "Harbor Studio",
        bookingLink: SLOT,
      });
      const body = renderTemplate(template.body_preview, params) || `[template ${template.name}]`;
      const messageId = await queue({
        type: "template",
        body,
        template_name: template.name,
        template_vars: { language: template.language, params },
        content_hash: `hash-${++seq}`,
      });
      assert.deepEqual(await links(messageId), [], "queued: nothing has left");
      const out = await send({
        messageId,
        sender: "human",
        body,
        template: { name: template.name, language: template.language, params },
      });
      assert.equal(out.outcome, "sent");
      return { messageId, body };
    };
    const slots = [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "Business name", example: "Luna Studio" },
      { position: 3, label: "Booking link", example: "https://booksy.com/luna-studio" },
    ];
    const withLink = await inbox({
      name: "visit_booking",
      language: "en_US",
      body_preview: "Hi {{1}}, thanks for getting in touch with {{2}}. Book here: {{3}}",
      variables: slots,
    });
    assert.ok(!withLink.body.includes("https://") && withLink.body.includes(SLOT), withLink.body);
    assert.deepEqual(await links(withLink.messageId), said("whatsapp", "human"));
    const without = await inbox({
      name: "thanks_visit",
      language: "en_US",
      body_preview: "Hi {{1}}, thank you for visiting {{2}}.",
      variables: slots.slice(0, 2),
    });
    assert.deepEqual(await links(without.messageId), [], without.body);
  },
);

test(
  "what is not a reply says nothing: a campaign, a reach-out, a backfilled row, an email, the customer's own words, a system line",
  { skip },
  async () => {
    for (const [what, over] of [
      ["a broadcast", { meta: { source: "broadcast" } }],
      ["a reach-out", { meta: { source: "reach_out" } }],
      ["a backfilled row", { meta: { backfill: "true" } }],
      ["an email", { channel: "email" }],
      ["a system line", { channel: "system" }],
      ["the customer", { direction: "inbound", sender: "customer", status: "received" }],
      // Not a row the writers make, but the direction is asked all the same: an inbound row is never a send of ours.
      ["an inbound row that says sent", { direction: "inbound", sender: "customer", status: "sent" }],
    ]) {
      assert.deepEqual(await links(await insert(over)), [], `${what}, written as sent`);
      if (over.status !== "received") {
        const draft = await queue({ ...over, status: "queued" });
        await move(draft, "sent");
        assert.deepEqual(await links(draft), [], `${what}, finalized`);
      }
    }
    // The same words as a person's reply, to show the rows above are the only difference.
    assert.equal((await links(await insert({}))).length, 1);
  },
);

test(
  "each workspace's own link: another workspace's says nothing, and one statement of many rows is read row by row",
  { skip },
  async () => {
    const theirs = "https://acme.example.com/book";
    assert.deepEqual(
      await links(await insert({ body: `Book: ${LINK}` }, acme), acme),
      [],
      "Harbor's link in Acme's thread",
    );
    assert.deepEqual(await links(await insert({ body: `Book: ${theirs}` }, harbor), harbor), [], "Acme's in Harbor's");
    assert.equal((await links(await insert({ body: `Book: ${theirs}` }, acme), acme)).length, 1, "Acme's own link");
    const rows = ok(
      await db
        .from("messages")
        .insert([
          rowOf({ body: `One: ${LINK}` }),
          rowOf({ body: "Two: nothing here" }),
          rowOf({ body: `Three: ${LINK}`, meta: { source: "broadcast" } }),
          rowOf({ body: `Four: ${SLOT}`, sender: "ai" }),
          rowOf({ body: `Five: ${LINK}`, direction: "inbound", sender: "customer", status: "received" }),
        ])
        .select("id, body"),
    );
    const got = {};
    for (const r of rows) got[r.body.split(":")[0]] = (await links(r.id)).length;
    assert.deepEqual(got, { One: 1, Two: 0, Three: 0, Four: 1, Five: 0 });
  },
);

test(
  "a workspace with no booking link on file says nothing, nor does one whose link is blank; a link is what the workspace holds, whatever its shape",
  { skip },
  async () => {
    const hold = async (brain) =>
      ok(
        await db
          .from("tenant_config")
          .upsert({ tenant_id: harbor.tenantId, config: { brain } }, { onConflict: "tenant_id" }),
      );
    try {
      await hold({});
      assert.deepEqual(await links((await send({})).messageId), [], "no link in its config");
      await hold({ booking_link: "  " });
      assert.deepEqual(
        await links((await send({ body: "Book  here: please  call us" })).messageId),
        [],
        "a blank link",
      );
      await hold({ booking_link: "https://" });
      assert.deepEqual(
        await links((await send({ body: "Book here: https://x.example.com" })).messageId),
        [],
        "a scheme alone",
      );
      ok(await db.from("tenant_config").delete().eq("tenant_id", harbor.tenantId));
      assert.deepEqual(await links((await send({})).messageId), [], "no configuration at all");
      // Nothing in the trigger asks whether the words look like a link: a host with no dot in it is held as stored.
      await hold({ booking_link: "https://bookings/harbor" });
      assert.equal(
        (await links((await send({ body: "Book: bookings/harbor" })).messageId)).length,
        1,
        "a dotless host",
      );
    } finally {
      await hold({ booking_link: LINK });
    }
    assert.equal((await links((await send({})).messageId)).length, 1, "and it says it again once the link is on file");
  },
);

test(
  "the trigger sits beside the first touch of 00306 on the same table, and neither takes the other's place",
  { skip },
  async () => {
    // A person who writes first: ingest_inbound makes them and stamps how they first reached us (messages_note_first_touch,
    // an inbound customer row). The customer pasting the link says nothing; the reply that carries it says it once.
    const phone = "+15550136503";
    const digits = phone.slice(1);
    const taken = ok(
      await db.rpc("ingest_inbound", {
        p_tenant_id: harbor.tenantId,
        p_channel: "whatsapp",
        p_identity_external_id: digits,
        p_phone_e164: phone,
        p_wa_profile_name: null,
        p_message_external_id: `wamid.k7.in.${stamp}`,
        p_type: "text",
        p_body: `is this your link? ${LINK}`,
        p_channel_ts: null,
        p_media: null,
        p_meta: { raw_type: "text" },
        p_opt_out: false,
        p_opt_in: false,
      }),
    );
    assert.deepEqual(await links(taken.message_id), [], "the customer's own words");
    const person = ok(await db.from("messages").select("contact_id").eq("id", taken.message_id).single()).contact_id;
    const touch = async () =>
      ok(await db.from("contacts").select("acquired_via").eq("id", person).single()).acquired_via;
    assert.equal(await touch(), "whatsapp", "their first touch is kept");
    const conv = ok(
      await db.from("messages").select("conversation_id").eq("id", taken.message_id).single(),
    ).conversation_id;
    const reply = await send({ conversationId: conv, contactId: person, to: phone });
    assert.equal(reply.outcome, "sent");
    assert.deepEqual(await links(reply.messageId), said("whatsapp", "ai"));
    assert.equal(await touch(), "whatsapp", "and the reply leaves it as it was");
    // One statement, an inbound customer row and an outbound reply: each trigger reads its own row.
    const both = ok(
      await db
        .from("messages")
        .insert([
          rowOf({
            conversation_id: conv,
            contact_id: person,
            body: `Again ${LINK}`,
            direction: "inbound",
            sender: "customer",
            status: "received",
          }),
          rowOf({ conversation_id: conv, contact_id: person, body: `Reply ${LINK}`, sender: "ai" }),
        ])
        .select("id, direction"),
    );
    for (const r of both) assert.equal((await links(r.id)).length, r.direction === "outbound" ? 1 : 0, r.direction);
  },
);

test(
  "a ledger that cannot take the event does not take the message with it: it is on record and no event is written, as written and as sent",
  { skip },
  async () => {
    const t = harbor.tenantId;
    const row = (
      tag,
      status,
    ) => `insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, meta)
    values ('${t}', '${harbor.conversationId}', '${harbor.contactId}', 'whatsapp', 'outbound', 'ai', 'text', 'Book: ${LINK} ${tag}', '${status}', '{}'::jsonb);`;
    const leave = (tag) =>
      `update public.messages set status = 'sent' where tenant_id = '${t}' and body like '%${tag}';`;
    const count = (tag) => `(select count(*) from public.events e join public.messages m on m.id = e.subject_id
    where e.kind = 'booking_link.sent' and m.body like '%${tag}')`;
    const status = (tag) => `(select status from public.messages where body like '%${tag}')`;
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${t}') then raise exception 'not_this_database'; end if;
    ${row("ctl-insert", "sent")}
    ${row("ctl-update", "queued")}
    ${leave("ctl-update")}
    seen := seen || jsonb_build_object('control_insert', ${count("ctl-insert")}, 'control_update', ${count("ctl-update")});
    create function public.__link_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __link_refused before insert on public.events
      for each row when (new.kind = 'booking_link.sent' and new.tenant_id = '${t}') execute function public.__link_refused();
    begin
      ${row("trap-insert", "sent")}
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('rows', (select count(*) from public.messages where body like '%trap-insert'), 'events', ${count("trap-insert")});
    ${row("trap-update", "queued")}
    begin
      ${leave("trap-update")}
      seen := seen || jsonb_build_object('update_raised', false);
    exception when others then
      seen := seen || jsonb_build_object('update_raised', true, 'update_message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('update_status', ${status("trap-update")}, 'update_events', ${count("trap-update")});
  `);
    assert.deepEqual(
      [seen.control_insert, seen.control_update],
      [1, 1],
      `a working ledger writes both: ${JSON.stringify(seen)}`,
    );
    assert.deepEqual([seen.raised, seen.rows, seen.events], [false, 1, 0], JSON.stringify(seen));
    assert.deepEqual(
      [seen.update_raised, seen.update_status, seen.update_events],
      [false, "sent", 0],
      JSON.stringify(seen),
    );
  },
);
