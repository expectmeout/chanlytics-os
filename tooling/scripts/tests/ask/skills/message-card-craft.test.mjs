/**
 * The customer message writer behind Ask's message card (propose_sequence's action message, and a plan's message step,
 * which is built by the same action): once Ask's own versions pass every check the card makes, the skill writes them
 * again in the turn's time left, and the card quotes and files its words where they pass the skill's checks and the
 * door's; anywhere else it keeps Ask's, the first draft, as before the skill. One craft call: the skill's purpose, its
 * effort, Ask's route's model, the skill's words as its system prompt, the business and the draft as its brief.
 *
 * Executed through the real registry over a workspace in memory, the model a stream handed in (model-json.ts
 * setModelStream), the edge's answer about email a stubbed fetch, as message-card.test.mjs does. Nothing is sent.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { messageAction } = await import(at("apps/dashboard/src/server/ask/tools/act/message.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/model-json.ts"));
const { GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const C = await import("@chanlytics/contracts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";

/** Harbor Studio: an operator, a WhatsApp number, a mailbox, its tone and services and one note, no message yet. */
const world = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "appointment" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Studio",
          system_prompt: "Answer as the front desk of Harbor Studio.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: {
            tone: "Warm and brief. Friendly, a sentence or two at a time.",
            services: [{ name: "Consultation" }, { name: "Follow-up", price_note: "from $40" }],
            notes: [{ title: "Parking", text: "Free parking behind the building." }],
          },
        },
      },
      version: 1,
    },
  ],
  tenant_channels: [
    {
      id: "ch-wa",
      tenant_id: A,
      kind: "whatsapp",
      status: "active",
      number_e164: "+15550100",
      config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
    },
  ],
  lines: [],
  mailboxes: [{ tenant_id: A, local_part: "harbor" }],
  messages: [],
  calls: [],
  templates: [],
  ...over,
});

/** The card Ask asks for: an offer on WhatsApp and email, its three values, Ask's own words the first draft. */
const ASKED = {
  name: "autumn_offer",
  language: "en",
  category: "marketing",
  versions: {
    whatsapp: { body: "Hi {{1}}, 15% off at {{2}} this October. Book here: {{3}} Reply STOP to opt out." },
    email: { subject: "15% off this October", body: "Hi {{1}}, 15% off at {{2}} this October. Book here: {{3}}" },
  },
  slots: [
    { position: 1, label: "First name", kind: "first_name" },
    { position: 2, label: "Business name", kind: "business_name" },
    { position: 3, label: "Booking link", kind: "booking_link" },
  ],
};

/** The skill's words: every rule kept. */
const WRITTEN = {
  whatsapp: {
    body: "Hi {{1}}, a little something from {{2}}: 15% off this October.\n\nPick a time that suits you here: {{3}}\n\nReply STOP to opt out",
  },
  email: {
    subject: "15% off at {{2}} this October",
    body: "Hi {{1}},\n\nA little something from us: 15% off this October.\n\nPick a time that suits you:\n{{3}}\n\nSee you soon,\n{{2}}",
  },
  sms: { body: "" },
  could_not: "",
};

let calls;
/** The model, answering `said` (or throwing `refused`), one text event and a stop, as the gateway streams them. */
const modelSays = (said, refused = null) =>
  setModelStream(async function* (call) {
    calls.push(call);
    if (refused) throw refused;
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  });

const real = globalThis.fetch;
beforeEach(async () => {
  calls = [];
  readerCache.clear();
  globalThis.fetch = async (url) => {
    if (!String(url).endsWith("/api/admin/email/wire")) throw new Error(`nothing else is reachable: ${url}`);
    return new Response(JSON.stringify({ ok: true, ready: true, offers: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  await emailWire({ fresh: true });
});
after(() => {
  globalThis.fetch = real;
  setModelStream(null);
});

/** A tool context for a turn that began `ago` ms before now (the loop's clock: the turn's start). */
function contextOf(tables, ago = 1_000) {
  const supabase = fakeDb(tables, {}, {});
  return newToolContext(
    { supabase, userId: USER, email: "ada@example.com", params: {} },
    A,
    "operator",
    TZ,
    new Date(Date.now() - ago),
  );
}

async function propose(input = ASKED, { tables = world(), ago } = {}) {
  return buildProposal(contextOf(tables, ago), "propose_sequence", { action: "message", ...input });
}

test("the skill writes the card's words: one craft call at high effort, and the card quotes and files what it wrote", async () => {
  modelSays(WRITTEN);
  const r = await propose();
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.deepEqual(p.payload.versions, {
    whatsapp: { body: WRITTEN.whatsapp.body },
    email: { subject: WRITTEN.email.subject, body: WRITTEN.email.body },
  });
  assert.equal(p.payload.name, "autumn_offer");
  assert.equal(p.payload.category, "marketing");
  assert.deepEqual(
    p.payload.slots.map((s) => [s.position, s.kind]),
    [
      [1, "first_name"],
      [2, "business_name"],
      [3, "booking_link"],
    ],
    "the values are the card's, kept",
  );
  assert.match(
    p.summary,
    /a little something from the business: 15% off this October/,
    "the card quotes the skill's words",
  );
  assert.ok(p.payload.said.some((row) => row.words.includes("Pick a time that suits you")));
  // What its Approve sends: the skill's words, through the door the card always used.
  const commit = C.PROPOSAL_SPECS.message.commit(p);
  assert.equal(commit.route, "POST templates/message");
  assert.deepEqual(commit.body.versions, p.payload.versions);

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.purpose, "message_draft");
  assert.equal(call.effort, "high");
  assert.equal(call.request.model, C.MODEL_ROUTES.ask.model, "the writer is the model Ask's route asks");
  assert.equal(call.request.max_tokens, C.CUSTOMER_MESSAGE_SKILL.craft.maxTokens);
  assert.equal(call.request.output_config.effort, "high");
  assert.deepEqual(call.request.output_config.format.schema, C.MESSAGE_CRAFT_JSON_SCHEMA);
  assert.equal(call.request.system, C.craftSystem(C.CUSTOMER_MESSAGE_SKILL));
  const brief = call.request.messages[0].content;
  assert.match(brief, /^The business: Harbor Studio\./, "the business's own name, from its settings");
  assert.match(brief, /Its tone, in its own words: Warm and brief\./);
  assert.match(brief, /Its services: Consultation, Follow-up\./);
  assert.doesNotMatch(brief, /\$40/, "a service's price note is never handed to the writer");
  assert.match(brief, /<record>\n- Parking: Free parking behind the building\.\n<\/record>/);
  assert.match(
    brief,
    /<record>\nWhatsApp:\nHi \{\{1\}\}, 15% off at \{\{2\}\}/,
    "Ask's own versions, fenced, are the draft",
  );
  assert.doesNotMatch(brief, /reused/, "a card of its own is no plan's shell");
  assert.ok(call.signal instanceof AbortSignal, "bounded by the turn's time left");
});

test("words the skill's checks refuse are never shown: the card keeps Ask's first draft", async () => {
  const cases = [
    [
      "a price the draft does not hold",
      { ...WRITTEN, whatsapp: { body: WRITTEN.whatsapp.body.replace("this October", "this October, packs from $45") } },
    ],
    [
      "an offer without its opt-out line",
      { ...WRITTEN, whatsapp: { body: "Hi {{1}}, 15% off at {{2}} this October. Book: {{3}} today" } },
    ],
    ["a version left empty", { ...WRITTEN, email: { subject: "", body: "" } }],
    ["a value it was not given", { ...WRITTEN, email: { ...WRITTEN.email, body: `${WRITTEN.email.body} {{4}}` } }],
  ];
  for (const [why, said] of cases) {
    readerCache.clear();
    modelSays(said);
    const r = await propose();
    assert.equal(r.isError, false, `${why}: ${r.result}`);
    assert.deepEqual(r.proposal.payload.versions, ASKED.versions, why);
  }
});

test("a craft call that does not answer keeps the first draft: the gateway's refusal, an answer out of shape, a refusal", async () => {
  modelSays(
    null,
    new GatewayRefused({ kind: "bad_request", message: "400 tenant_id, user_id and a purpose required" }),
  );
  assert.deepEqual(
    (await propose()).proposal.payload.versions,
    ASKED.versions,
    "an edge that does not know the purpose yet",
  );
  readerCache.clear();
  modelSays({ whatsapp: "not the shape" });
  assert.deepEqual((await propose()).proposal.payload.versions, ASKED.versions, "an answer out of shape");
  readerCache.clear();
  setModelStream(async function* (call) {
    calls.push(call);
    yield { type: "stop", stopReason: "refusal" };
  });
  assert.deepEqual((await propose()).proposal.payload.versions, ASKED.versions, "the model's own refusal");
  readerCache.clear();
  modelSays(null, new TypeError("a fault no one meant"));
  const faulted = await propose();
  assert.equal(faulted.isError, false, "a fault in the writer never costs the card");
  assert.deepEqual(faulted.proposal.payload.versions, ASKED.versions);
});

test("with too little of the turn left, nothing is read or asked and the card keeps the first draft", async () => {
  modelSays(WRITTEN);
  const r = await propose(ASKED, { ago: C.ASK_TURN_BUDGET_MS - 15_000 });
  assert.deepEqual(r.proposal.payload.versions, ASKED.versions);
  assert.equal(calls.length, 0, "a call that would be cut is never started");
});

test("a draft the card refuses is refused as before, and nothing is spent on writing it again", async () => {
  modelSays(WRITTEN);
  const r = await propose({ ...ASKED, versions: { ...ASKED.versions, sms: { body: "15% off this October" } } });
  assert.equal(r.isError, true);
  assert.equal(calls.length, 0);
});

test("a workspace whose settings cannot be read keeps the first draft: no words written in nobody's voice", async () => {
  modelSays(WRITTEN);
  const tables = world({ tenant_config: [{ tenant_id: A, config: { brain: { profile: { tone: 7 } } }, version: 1 }] });
  const r = await propose(ASKED, { tables });
  assert.deepEqual(r.proposal.payload.versions, ASKED.versions);
  assert.equal(calls.length, 0);
});

test("in a turn the writer reads the owner's own words, and ends before the turn the loop hands it", async () => {
  modelSays(WRITTEN);
  const question = "Send our regulars 15% off everything this October";
  const t = { ...contextOf(world()), question, endsAt: Date.now() + C.ASK_TURN_BUDGET_MS };
  const made = await messageAction.build(t, messageAction.input.parse(ASKED));
  assert.equal(made.isError, false, made.result);
  assert.match(
    calls[0].request.messages[0].content,
    new RegExp(`What the owner asked Ask, in their own words: "${question}"`),
  );

  readerCache.clear();
  calls = [];
  // A turn whose end is near (a spoken one, or one far along): too little left to write in, nothing asked.
  const late = { ...contextOf(world()), question, endsAt: Date.now() + 15_000 };
  const kept = await messageAction.build(late, messageAction.input.parse(ASKED));
  assert.deepEqual(kept.proposal.payload.versions, ASKED.versions);
  assert.equal(calls.length, 0);
});

test("a plan's message step is written too, as the shell its later offers reuse: around the offer's value, its values kept", async () => {
  const shell = {
    name: "offer",
    language: "en",
    category: "marketing",
    versions: {
      whatsapp: {
        body: "Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.\n\nReply STOP to opt out",
      },
    },
    slots: [
      { position: 1, label: "First name", kind: "first_name" },
      { position: 2, label: "Business name", kind: "business_name" },
      { position: 3, label: "The offer", kind: "text" },
      { position: 4, label: "Booking link", kind: "booking_link" },
    ],
  };
  const written = {
    ...WRITTEN,
    whatsapp: {
      body: "Hi {{1}}, all of us at {{2}} have something for you this time: {{3}}\n\nPick a time here: {{4}}, or reply with a day that suits you.\n\nReply STOP to opt out",
    },
    email: { subject: "", body: "" },
  };
  modelSays(written);
  const t = { ...contextOf(world()), step: 1 };
  const made = await messageAction.build(t, messageAction.input.parse(shell));
  assert.equal(made.isError, false, made.result);
  assert.deepEqual(made.proposal.payload.versions, { whatsapp: { body: written.whatsapp.body } });
  assert.deepEqual(
    made.proposal.payload.slots.map((s) => [s.position, s.label, s.kind]),
    shell.slots.map((s) => [s.position, s.label, s.kind]),
    "the offer's value stays the typed value later offers fill",
  );
  assert.match(calls[0].request.messages[0].content, /reused for every later offer/);
});
