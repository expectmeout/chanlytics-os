/**
 * A laptop or a preview with EDGE_PROVIDERS=model reaches the model through the edge it names, and no other provider
 * (apps/dashboard/src/server/env.ts deploymentFrom, `modelLive`).
 *
 * Until 3 Nov 2026 the one word that let a laptop ask the model was `live`, which opens every provider door with it: a
 * real send, Checkout, a number bought, a template synced, a word into a live call. So nobody set it against
 * production's edge, a change to Ask's prompt or answer format could be measured only after it landed, and a format the
 * API refused on every turn (#2046) shipped and was found after (#2051). Here the deployment says `model`, with an edge's
 * address and its secret: Ask's turn and its warm run through the real gateway onto a captured edge and answer, and every
 * door `live` opens answers "not here" without a request reaching the edge.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { verifyEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../../_log-lines.mjs";

const SECRET = "edge-secret-for-this-file";
const EDGE = "https://edge.example.com";
// A laptop (no VERCEL_ENV) that may ask the model, pointed at an edge with its secret; no key rides beside the token.
process.env.EDGE_PROVIDERS = "model";
process.env.EDGE_URL = EDGE;
process.env.EDGE_CALL_SECRET = SECRET;
for (const k of ["DIAG_KEY", "VERCEL_ENV", "ASK_MODEL", "ASK_MORNINGS"]) delete process.env[k];
// The answer comes as its format, a text block of JSON (ASK_ANSWER_TOOL off), as ask-turn.test.mjs's turns do.
process.env.ASK_ANSWER_TOOL = "off";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { deployment } = await importSrc("apps/dashboard/src/server/env.ts");
const { streamModel } = await importSrc("apps/dashboard/src/server/ask/gateway.ts");
const { runAskTurn } = await importSrc("apps/dashboard/src/server/ask/loop.ts");
const { runRound } = await importSrc("apps/dashboard/src/server/ask/round.ts");
const { warmAskModel } = await importSrc("apps/dashboard/src/server/ask/warm.ts");
const { workspaceFacts } = await importSrc("apps/dashboard/src/server/ask/prompt.ts");
const { runTool, buildProposal } = await importSrc("apps/dashboard/src/server/ask/tools/index.ts");
const { readerCache } = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { edgeBilling } = await importSrc("apps/dashboard/src/server/workspace/billing.ts");
const { edgeGoogle } = await importSrc("apps/dashboard/src/server/connections/google.ts");
const { edgeLines, lineCodesFor } = await importSrc("apps/dashboard/src/server/connections/lines.ts");
const { edgeMailboxes } = await importSrc("apps/dashboard/src/server/connections/mailbox-connections.ts");
const { whatsappSignupConfig, connectWhatsApp, checkWhatsAppStanding } = await importSrc(
  "apps/dashboard/src/server/connections/whatsapp.ts",
);
const { syncTemplates, createTemplate, deleteTemplate } = await importSrc(
  "apps/dashboard/src/server/campaigns/meta-templates.ts",
);
const { runPlaybookNow } = await importSrc("apps/dashboard/src/server/campaigns/playbook-run.ts");
const { previewReachOut } = await importSrc("apps/dashboard/src/server/campaigns/reach-outs.ts");
const { whisperLiveCall, stopLiveCall, handOverLiveCall } = await importSrc(
  "apps/dashboard/src/server/conversations/live-call.ts",
);
const { steerDraft } = await importSrc("apps/dashboard/src/server/conversations/thread-control.ts");
const { tellPlatformOfSetupRequest, tellOwnerLive } = await importSrc("apps/dashboard/src/server/workspace/tell.ts");
const { sendHandoverInvite } = await importSrc("apps/dashboard/src/server/workspace/handover.ts");
const { sendPartnerInvite } = await importSrc("apps/dashboard/src/server/workspace/partner-invite.ts");
const { notifyPlatformSignup } = await importSrc("apps/dashboard/src/server/platform/signup.ts");
const { sendAlertTest } = await importSrc("apps/dashboard/src/server/workspace/alerts.ts");

beforeEach(() => readerCache.clear());

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "11111111-1111-4111-8111-111111111111";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const NONE = { kind: "none", id: "", label: "" };
const HEADLINE = "You're welcome.";

/** The answer's JSON as the model writes it (ASK_ANSWER_FORMAT): a Say and nothing else. */
const ANSWER = JSON.stringify({
  say: { headline: HEADLINE, detail: "" },
  show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
  do: { open: { source: NONE, label: "", now: false }, next: [] },
  language: "en",
});

/** One round as the API streams it through the edge: the usage, one text block, the stop. */
function answerStream(text) {
  const frame = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    frame("message_start", {
      message: {
        id: "msg_laptop",
        model: "claude-opus-5-5",
        usage: { input_tokens: 12, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }),
    frame("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    frame("content_block_delta", { index: 0, delta: { type: "text_delta", text } }),
    frame("content_block_stop", { index: 0 }),
    frame("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } }),
    frame("message_stop", {}),
  ].join("");
}

/**
 * The edge, captured: every request kept with its door and body, the model's door answered with a stream of `text`,
 * any other door with an empty 200 (which no test below wants to see).
 */
function edge(text = ANSWER) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    seen.push({ origin: u.origin, path: u.pathname, init, body: init.body ? JSON.parse(init.body) : null });
    if (u.pathname === "/api/admin/llm")
      return new Response(answerStream(text), { status: 200, headers: { "content-type": "text/event-stream" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { seen, restore: () => (globalThis.fetch = real) };
}

/** A request to the model's door: a token for that door only, naming the workspace and the person, and no key. */
function assertModelKnock(req) {
  assert.equal(req.origin, EDGE, "the edge EDGE_URL names");
  assert.equal(req.path, "/api/admin/llm");
  assert.equal(req.init.headers["x-diag-key"], undefined, "no key rides beside the token");
  const v = verifyEdgeToken(SECRET, req.init.headers["x-edge-token"], "/api/admin/llm");
  assert.equal(v.ok, true, "a token minted for the model's door");
  assert.deepEqual([v.claims.ws, v.claims.user], [W, P]);
}

/** The workspace the turn and the warm read: its name and zone, a configuration row, no policies. */
const world = () => ({
  supabase: fakeDb({
    tenants: [{ id: W, name: "Harbor", timezone: TZ }],
    tenant_config: [{ tenant_id: W, config: { brain: { business_name: "Harbor Moving" } }, version: 1 }],
    policies: [],
  }),
  userId: P,
  email: "ada@example.com",
  params: {},
});

/** The loop's ports with the real round: the gateway, its stream and the edge are the code under test. */
const realRound = {
  round: runRound,
  context: async () => ({ blocks: [], refs: [], rows: 0, chars: 0, stamp: 1, failed: false, warm: "none" }),
  shape: async () => "The workspace: Harbor · zone America/New_York",
  tool: runTool,
  propose: buildProposal,
};

/** What the server logged while `fn` ran: each line's event and fields. */
async function logged(fn) {
  const lines = [];
  const was = { log: console.log, warn: console.warn, error: console.error };
  for (const m of ["log", "warn", "error"])
    console[m] = (...args) => {
      const line = logLineOf(args);
      if (line) lines.push({ event: line.event, ...fieldsOf(line) });
    };
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, was);
  }
}

test("EDGE_PROVIDERS=model on a laptop: the model may be reached, no provider may", () => {
  assert.deepEqual(deployment, { env: "development", providersLive: false, modelLive: true });
});

test("a round goes to the model's door on the edge EDGE_URL names, with a token for that door and nothing else", async () => {
  const e = edge();
  try {
    const events = [];
    for await (const ev of streamModel({
      tenantId: W,
      userId: P,
      request: { max_tokens: 10, system: "s", messages: [] },
    }))
      events.push(ev);
    assert.equal(e.seen.length, 1);
    assertModelKnock(e.seen[0]);
    assert.equal(e.seen[0].body.purpose, "ask");
    assert.ok(
      events.some((ev) => ev.type === "stop" && ev.stopReason === "end_turn"),
      "the stream is read to its stop",
    );
  } finally {
    e.restore();
  }
});

test("Ask's turn runs through the real gateway and answers, where without the switch it said it answers only on production", async () => {
  const e = edge();
  try {
    const events = [];
    const r = await runAskTurn(
      {
        ctx: world(),
        tenantId: W,
        role: "owner",
        facts: workspaceFacts("Harbor", TZ, null, NOW, []),
        timezone: TZ,
        personLabel: "ada@example.com (owner)",
        language: "en",
        scope: null,
        // People's page reads nothing of its own before the model, and these words name no other page: the model's door
        // is the only request the turn makes.
        surface: "people",
        history: [],
        text: "Thanks, that is all.",
        emit: (ev) => events.push(ev),
        now: NOW,
      },
      realRound,
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.text, HEADLINE);
    assert.notEqual(r.text, "Ask only answers on the production dashboard.");
    assert.equal(r.rounds, 1);
    assert.equal(e.seen.length, 1, "one round, one request, all of it to the model's door");
    assertModelKnock(e.seen[0]);
    assert.equal(e.seen[0].body.purpose, "ask");
    assert.equal(e.seen[0].body.tenant_id, W);
  } finally {
    e.restore();
  }
});

test("the warm writes the turn's head through the same door, and logs that it warmed, not that it was refused", async () => {
  const e = edge();
  try {
    const member = { tenantId: W, role: "owner", facts: null };
    const { result, lines } = await logged(() => warmAskModel(world(), member, realRound));
    assert.deepEqual(result, { warmed: true });
    assert.deepEqual(
      lines.map((l) => l.event),
      ["ask_model_warmed"],
      JSON.stringify(lines),
    );
    assert.equal(e.seen.length, 1);
    assertModelKnock(e.seen[0]);
    assert.equal(e.seen[0].body.purpose, "ask_warm");
  } finally {
    e.restore();
  }
});

test("every door `live` opens answers not here under `model`, and none of them reaches the edge", async () => {
  const e = edge();
  const asker = { workspace: W, user: P };
  try {
    const preview = { ok: false, reason: "preview" };
    const notHere = { status: 503, body: { ok: false, error: "preview" } };
    // A send, a sign-up, a number, a template, a live call, a draft rewritten, a Checkout, a mailbox signed in.
    assert.deepEqual(await runPlaybookNow(W, "playbook-1", P), preview, "a playbook run sends");
    assert.deepEqual(await previewReachOut(W, P, { lead_id: "lead-1" }), preview, "a reach-out's preview");
    assert.deepEqual(await syncTemplates(W, P), preview, "a template sync");
    assert.deepEqual(
      await createTemplate(W, P, {
        name: "t",
        language: "en",
        category: "UTILITY",
        components: [],
        body: "b",
        examples: [],
      }),
      preview,
      "a template filed with Meta",
    );
    assert.deepEqual(await deleteTemplate(W, "template-1", P), preview, "a template deleted at Meta");
    assert.deepEqual(await connectWhatsApp(W, P, { code: "c" }), preview, "a WhatsApp number connected");
    assert.deepEqual(await checkWhatsAppStanding(W, P), preview, "a number's standing asked of Meta");
    assert.equal((await whatsappSignupConfig(asker)).reason, "preview", "WhatsApp's sign-up");
    assert.deepEqual(await whisperLiveCall("call-1", { text: "hi", trigger: false }, asker), preview, "a whisper");
    assert.deepEqual(await stopLiveCall("call-1", asker), preview, "a live call ended");
    assert.deepEqual(await handOverLiveCall("call-1", "+15555550123", asker), preview, "a live call handed over");
    assert.deepEqual(await steerDraft("message-1", "shorter", asker), preview, "a draft rewritten");
    assert.deepEqual(await edgeBilling({ op: "sync", tenant_id: W, user_id: P }), notHere, "Checkout");
    assert.deepEqual(await edgeGoogle({ op: "refresh", tenant_id: W, user_id: P }), notHere, "Google");
    assert.deepEqual(await edgeLines({ op: "buy", tenant_id: W, user_id: P }), notHere, "a number bought");
    assert.deepEqual(await lineCodesFor(W, P), { ok: true, codes: [] }, "a line's texted codes");
    assert.deepEqual(await edgeMailboxes({ op: "connect", tenant_id: W, user_id: P }), notHere, "a mailbox");
    // The platform's notices: each says it did not go.
    assert.equal(await tellPlatformOfSetupRequest(W, "a phone line", "ada@example.com", P), false);
    assert.equal(await tellOwnerLive(W, P), false);
    // An address with an account, so the edge's letter is the only way it could go.
    const svc = { rpc: async () => ({ data: "an-account", error: null }) };
    const { result: handedOver, lines } = await logged(() => sendHandoverInvite(W, "owner@example.com", P, { svc }));
    assert.equal(handedOver, false);
    assert.deepEqual(lines, [], "refused by the deployment, not failed on the way");
    assert.equal(await sendPartnerInvite(W, P, {}), false);
    assert.equal(await notifyPlatformSignup(W, "ada@example.com", P), undefined);
    assert.deepEqual(await sendAlertTest(W, P), { sent: false, to: 0, why: "not_live" });
    assert.deepEqual(
      e.seen.map((r) => r.path),
      [],
      "nothing but the model reaches the edge",
    );
  } finally {
    e.restore();
  }
});
