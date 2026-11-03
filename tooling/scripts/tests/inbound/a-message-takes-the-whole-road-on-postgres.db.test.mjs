/**
 * One customer message, the whole road, on the schema the migrations replay (the inbound review of 3 Nov 2026, D2).
 *
 * The phase tests run the verb over a database in memory, and the database tests prove its pieces one at a time; this
 * runs everything between the provider and the wire for real: the door's half (recordThenSchedule: ingest_inbound, the
 * inbound_answer job), the job's half (answerInboundJob for WhatsApp, as the tick runs it: the routing read again, the
 * runtime, the memory, the person's mode, the gates, the reply turn, the brain's call and layer two, deliver() and the
 * stamp), with only Meta's and Twilio's wires and the model faked. It is the test that catches drift between core's ports
 * and the SQL they call. A text that asks for a person takes the same road and ends in a hold.
 *
 * Runs against the database `supabase start` builds on this machine, never production; skipped without one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and its customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PNID = `pn-gold-${RUN}`;
const LINE = `+1555019${String(Date.now() % 10000).padStart(4, "0")}`;
const SENT = [];
const ASKED = [];
let db;
let T;
let edge;
let routedWa;
let routedSms;

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

/** A model that answers as the record says, and is counted. */
const answering = (text, escalate = false, intent = "hours") => ({
  generateReply: async (ask) => {
    ASKED.push(ask);
    return {
      text,
      escalate,
      ...(escalate ? { reason: "human_token" } : {}),
      meta: { intent, confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" },
      usage: { input_tokens: 40, output_tokens: 12 },
    };
  },
});

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  edge = {
    ...(await import(at("apps/edge/lib/pg.ts"))),
    ...(await import(at("apps/edge/lib/inbound/ports.ts"))),
    ...(await import(at("apps/edge/lib/inbound/arrival.ts"))),
    ...(await import(at("apps/edge/lib/inbound/answer-job.ts"))),
    ...(await import(at("apps/edge/lib/whatsapp/answer-later.ts"))),
    ...(await import(at("packages/channels/dist/index.js"))),
    ...(await import(at("packages/db/dist/index.js"))),
  };
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `gold-${RUN}`, name: "Harbor Nails", timezone: "America/New_York" })
      .select("id")
      .single(),
    "workspace",
  ).id;
  ok(await db.from("billing_accounts").upsert({ tenant_id: T, mode: "direct", status: "active" }), "billing");
  ok(
    await db.from("tenant_config").upsert({
      tenant_id: T,
      config: {
        notifications: { escalation_emails: ["owner@gold.example"] },
        brain: {
          business_name: "Harbor Nails",
          system_prompt: "You are the assistant for Harbor Nails, a nail salon. Be warm and brief.",
          fallbacks: {
            greeting: "Hello from Harbor Nails.",
            error: "One moment, a person will reply.",
            non_text: "Thanks!",
          },
        },
      },
    }),
    "config",
  );
  ok(
    await db
      .from("policies")
      .upsert(
        { tenant_id: T, class: "reply", mode: "auto", limits: {} },
        { onConflict: "tenant_id,class,subject_type,subject_id" },
      ),
    "policy",
  );
  ok(
    await db.from("tenant_channels").insert({ tenant_id: T, kind: "whatsapp", external_id: PNID, number_e164: LINE }),
    "wa line",
  );
  ok(
    await db.from("tenant_channels").insert({ tenant_id: T, kind: "sms", external_id: LINE, number_e164: LINE }),
    "sms line",
  );
  routedWa = (await edge.resolveChannelDetailed(db, "whatsapp", PNID)).channel;
  routedSms = (await edge.resolveChannelDetailed(db, "sms", LINE)).channel;
  assert.ok(routedWa && routedSms, "both lines route to the workspace");

  // The edge's real ports over this database, but for the wires and the model: Meta's sender and the text line's are
  // recorders, the calendar is empty, nobody is mailed or paged.
  edge.setPg(db);
  edge.setInboundPorts(null);
  const real = edge.realPorts();
  edge.setInboundPorts({
    ...real,
    sender: () => async (to, p) => {
      SENT.push({ wire: "whatsapp", to, body: p.body });
      return { ok: true, wamid: `wamid.out.${RUN}.${SENT.length}`, status: 200 };
    },
    typing: undefined,
    brain: async () => answering("We open at 9 on weekdays."),
    calendar: { openings: async () => null, visits: async () => null },
    alertStaff: async () => {},
    page: async () => "sent",
    env: { allowlist: "", modelKey: "sk-test" },
  });
});

after(async () => {
  if (skip || !edge) return;
  edge.setInboundPorts(null);
  edge.setPg(null);
  if (!T) return;
  await db.from("jobs").delete().eq("tenant_id", T);
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

/** The workspace's answer job for a message, claimed as the tick claims one: fired, its first try. */
async function claimed(messageId) {
  const row = ok(
    await db
      .from("jobs")
      .select("id, tenant_id, kind, payload, state")
      .eq("tenant_id", T)
      .eq("kind", "inbound_answer")
      .eq("payload->>message_id", messageId)
      .single(),
    "job",
  );
  assert.equal(row.state, "scheduled", "the door scheduled it");
  ok(
    await db
      .from("jobs")
      .update({ state: "fired", attempts: 1, lease_until: new Date(Date.now() + 60_000).toISOString() })
      .eq("id", row.id),
    "claim",
  );
  return { id: row.id, tenant_id: row.tenant_id, kind: row.kind, payload: row.payload, attempts: 1 };
}

const messagesOf = async (conversationId) =>
  ok(
    await db
      .from("messages")
      .select("id, direction, sender, channel, body, status, external_id, meta")
      .eq("tenant_id", T)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    "messages",
  );

test("a WhatsApp message: recorded at the door, answered by its job, once, on the wire it came", { skip }, async () => {
  const from = "13055550188";
  const m = {
    from,
    id: `wamid.gold.${RUN}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: "When do you open?" },
  };
  const value = {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: PNID, display_phone_number: LINE.slice(1) },
    contacts: [{ wa_id: from, profile: { name: "Ana" } }],
  };

  // The door's half: recorded, its answer scheduled, nothing said.
  await edge.recordWhatsapp(db, m, value, routedWa);
  assert.equal(SENT.length, 0, "the door says nothing");
  const inbound = ok(
    await db.from("messages").select("id, conversation_id, meta").eq("tenant_id", T).eq("external_id", m.id).single(),
    "the message",
  );
  assert.equal(inbound.meta.processed_at ?? null, null, "kept, and not yet answered");

  // The job's half, as the tick runs it.
  const job = await claimed(inbound.id);
  await edge.answerInboundJob(db, job, Date.now() + 40_000);

  assert.deepEqual(
    SENT.map((s) => [s.wire, s.to, s.body]),
    [["whatsapp", from, "We open at 9 on weekdays."]],
    "one reply, to the person, on WhatsApp",
  );
  assert.equal(ASKED.at(-1).userText, "When do you open?");
  assert.ok(ASKED.at(-1).systemPrompt.includes("Harbor Nails"), "the workspace's own prompt");
  assert.equal(ASKED.at(-1).call.subjectId, inbound.conversation_id, "the turn is the thread's");

  const rows = await messagesOf(inbound.conversation_id);
  const reply = rows.find((r) => r.direction === "outbound");
  assert.equal(reply.status, "sent");
  assert.equal(reply.channel, "whatsapp");
  assert.equal(reply.body, "We open at 9 on weekdays.");
  assert.equal(reply.meta.reply_to, inbound.id, "the reply names the message it answers");
  const done = rows.find((r) => r.id === inbound.id);
  assert.ok(done.meta.processed_at, "the message is stamped processed");
  assert.equal(done.meta.handled, "ai", "and says what it became");
  const spoke = ok(await db.from("jobs").select("spoke_at").eq("id", job.id).single(), "spoke");
  assert.ok(spoke.spoke_at, "the job said it would speak before Meta was called");
  const holds = ok(await db.from("escalations").select("id").eq("tenant_id", T), "holds");
  assert.deepEqual(holds, [], "nobody was asked");

  // The same job run again (a runner that died after the reply) says nothing twice.
  await edge.answerInboundJob(db, { ...job, attempts: 1, spoke_at: spoke.spoke_at }, Date.now() + 40_000);
  assert.equal(SENT.length, 1, "nothing is said twice");
});

test(
  "a text that asks for a person: recorded, answered with its first-text footer, and held for the owner",
  { skip },
  async () => {
    const before = SENT.length;
    const texted = [];
    const carrier = {
      channel: "sms",
      send: async (to, body) => {
        texted.push({ to, body });
        return { ok: true, wamid: `SMout${RUN}${texted.length}`, status: 201 };
      },
      body: (text, first) => (first ? `${text}\n\nReply STOP to opt out.` : text),
      held: null,
    };
    const inbound = edge.inboundFromSms({
      messageSid: `SMgold${RUN}`,
      from: "+13055550189",
      to: LINE,
      body: "Can I talk to someone about a refund?",
      numMedia: 0,
      mediaTypes: [],
      optOutType: null,
      messagingServiceSid: null,
      accountSid: null,
    });
    const ports = {
      ...edge.realPorts(),
      brain: async () => answering("A person from Harbor Nails will reply here.", true, "other"),
    };
    const arrival = { inbound, carrier };
    const ing = await edge.recordThenSchedule(
      db,
      arrival,
      routedSms,
      { twilio: { MessageSid: inbound.externalId } },
      ports,
    );
    assert.ok(ing?.is_new, "kept at the door");
    await edge.answerArrival(arrival, routedSms, ports, Date.now() + 40_000);

    assert.equal(SENT.length, before, "nothing left on WhatsApp");
    assert.equal(texted.length, 1, "one text back");
    assert.ok(texted[0].body.endsWith("Reply STOP to opt out."), "the first text to a person carries the footer");

    const holds = ok(
      await db
        .from("escalations")
        .select("reason, state")
        .eq("tenant_id", T)
        .eq("conversation_id", ing.conversation_id),
      "holds",
    );
    assert.equal(holds.length, 1, "one hold");
    assert.equal(holds[0].state, "open");
    const rows = await messagesOf(ing.conversation_id);
    const done = rows.find((r) => r.id === ing.message_id);
    assert.equal(done.meta.handled, "handoff", "the message says it went to a person");
    const reply = rows.find((r) => r.direction === "outbound");
    assert.equal(reply.channel, "sms");
    assert.equal(reply.meta.reply_to, ing.message_id);
    const thread = ok(
      await db.from("conversations").select("paused_until").eq("id", ing.conversation_id).single(),
      "thread",
    );
    assert.ok(
      thread.paused_until && Date.parse(thread.paused_until) > Date.now(),
      "the receptionist steps out of the thread",
    );
  },
);
