/**
 * The assistant's turn, executed without a model.
 *
 * runAskTurn is the loop: the snapshot, the rounds, the reads in parallel,
 * the proposals, the finish, and every way a turn ends without one. Every
 * door around it was executed; the turn itself was read for its text. Here
 * the model round is scripted through the ports the loop now takes (the move
 * whatsapp/ports.ts made for the receptionist's handler), the read tools and
 * the proposal builders run for real against the database in memory, and
 * the round's own gathering runs on a fake event stream.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { ASK_MAX_ROUNDS, ASK_MODEL, EVERYONE_LABEL, NO_NUMBER_REACH, noNumberWords } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAskTurn, foldHistory, proposalsAnswer, askPorts } = await import(
  at("apps/dashboard/src/server/ask/loop.ts")
);
const { runRound, replayBlocks } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const { runTool, newToolContext, READ_TOOLS } = await import(at("apps/dashboard/src/server/ask/tools.ts"));
const { buildProposal, ACT_TOOLS } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
const { buildSnapshot } = await import(at("apps/dashboard/src/server/ask/snapshot.ts"));
const { workspaceFacts, ASK_RULES } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";
const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
const K2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc8";
const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const contact = {
  id: P1,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
};
const conversation = (id, over = {}) => ({
  id,
  tenant_id: A,
  contact_id: P1,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: iso(NOW.getTime() - 3600_000),
  last_message_at: iso(NOW.getTime() - 3600_000),
  contacts: contact,
  ...over,
});
const message = (id, conversation_id, over = {}) => ({
  id,
  conversation_id,
  tenant_id: A,
  direction: "inbound",
  sender: "client",
  type: "text",
  body: "Are you open Saturday?",
  media: null,
  meta: null,
  status: "delivered",
  created_at: iso(NOW.getTime() - 3600_000),
  channel_ts: iso(NOW.getTime() - 3600_000),
  channel: "whatsapp",
  ...over,
});
const call = (id, over = {}) => ({
  id,
  tenant_id: A,
  retell_call_id: "r1",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+15555550100",
  from_raw: null,
  to_e164: "+19295550100",
  started_at: iso(NOW.getTime() - 7200_000),
  ended_at: iso(NOW.getTime() - 7000_000),
  duration_ms: 200_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about Saturday.",
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: "Rosa",
  transcript_object: [],
  recording: null,
  conversation_id: C1,
  contact_id: P1,
  message_id: null,
  updated_at: iso(NOW.getTime()),
  contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100" },
  ...over,
});

function tables(over = {}) {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: TZ }],
    tenant_config: [
      {
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor Moving",
            booking_link: "https://book.example/harbor",
            system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
          },
        },
        version: 1,
      },
    ],
    tenant_channels: [],
    policies: [],
    conversations: [conversation(C1)],
    escalations: [],
    messages: [message(M1, C1)],
    calls: [call(K1)],
    contacts: [{ ...contact, tenant_id: A, erased_at: null }],
    templates: [],
    segments: [],
    segment_members: [],
    playbooks: [],
    ...over,
  };
}
const RPCS = {
  people_list: () => [],
  metrics_summary: () => ({ error: "not modelled here" }),
  report_series: () => ({ error: "not modelled here" }),
};
const ctxFor = (t = tables(), rpcs = RPCS, faults = {}) => ({
  supabase: fakeDb(t, faults, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

const ROUND = (blocks, extra = {}) => ({ blocks, stopReason: "tool_use", streamError: null, ...extra });
const finish = (answer, extra = {}, id = "f1") => ({
  type: "tool_use",
  id,
  name: "finish",
  text: "",
  json: JSON.stringify({ answer, citations: [], followups: [], navigate: null, language: "en", ...extra }),
});
const tool = (name, input, id = `t-${name}`) => ({ type: "tool_use", id, name, text: "", json: JSON.stringify(input) });
const prose = (text) => ({ type: "text", id: "", name: "", text, json: "" });

/** The model, scripted: each call takes the next round; the requests are kept for the assertions. */
function scripted(rounds) {
  const requests = [];
  const round = async (c, onAnswer) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onAnswer) : r;
  };
  return { round, requests };
}
const ports = (round, extra = {}) => ({
  round,
  snapshot: async () => "The day: two threads, one call.",
  tool: runTool,
  propose: buildProposal,
  ...extra,
});

function turn(ctx, over = {}) {
  const events = [];
  const input = {
    ctx,
    tenantId: A,
    role: "operator",
    facts: workspaceFacts("Harbor", TZ, ctx.supabase ? null : null, []),
    timezone: TZ,
    personLabel: "ada@example.com (operator)",
    language: "en",
    scope: null,
    surface: "today",
    history: [],
    text: "Who needs me?",
    emit: (ev) => events.push(ev),
    now: NOW,
    ...over,
  };
  return { input, events };
}

test("a read, then the answer: the read runs for real, its rows enter the read set, the second round carries the tool result, and a citation of a row that was read is kept", async () => {
  const ctx = ctxFor();
  const s = scripted([
    ROUND([tool("list_threads", { filter: "recent" })]),
    ROUND([
      finish("Rosa asked about Saturday; nobody else is waiting.", {
        citations: [
          { kind: "thread", id: C1, label: "Rosa" },
          { kind: "thread", id: C2, label: "nobody" },
        ],
        followups: ["Reply to Rosa?"],
      }),
    ]),
  ]);
  const { input, events } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.answer, "Rosa asked about Saturday; nobody else is waiting.");
  assert.deepEqual([r.rounds, r.tools], [2, ["list_threads"]]);
  assert.deepEqual(
    r.citations.map((c) => [c.kind, c.id, c.to]),
    [["thread", C1, `inbox/th-${C1}`]],
    "the thread the read returned may be cited; the one it did not is dropped",
  );
  assert.deepEqual(r.followups, ["Reply to Rosa?"]);
  assert.equal(r.ungrounded, false);
  assert.equal(s.requests.length, 2);
  assert.deepEqual(s.requests[0].tool_choice, { type: "any" });
  assert.equal(s.requests[0].model, ASK_MODEL);
  assert.ok(
    s.requests[0].system.some((b) => b.text === "The day: two threads, one call." && b.cache_control),
    "the snapshot rides in, cached",
  );
  const second = s.requests[1].messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.deepEqual(
    second.at(-1).content.map((c) => [c.type, c.tool_use_id, c.is_error]),
    [["tool_result", "t-list_threads", false]],
    "the read's result goes back under the call's id",
  );
  assert.ok(
    JSON.parse(second.at(-1).content[0].content).threads.some((t) => t.conversation_id === C1),
    "with the rows the fake database holds",
  );
  assert.ok(
    events.some((e) => e.t === "trace"),
    "the palette is told a read is running",
  );
});

test("a viewer is offered the read tools and finish only; an operator the act tools too", async () => {
  const viewer = scripted([ROUND([finish("Nothing waiting.")])]);
  await runAskTurn(turn(ctxFor(), { role: "viewer" }).input, ports(viewer.round));
  const names = viewer.requests[0].tools.map((t) => t.name);
  assert.ok(
    names.includes("finish") &&
      names.includes("list_threads") &&
      !names.some((n) => n.startsWith("propose_") || n === "draft_reply"),
  );
  const op = scripted([ROUND([finish("Nothing waiting.")])]);
  await runAskTurn(turn(ctxFor()).input, ports(op.round));
  assert.deepEqual(
    op.requests[0].tools.map((t) => t.name),
    [...READ_TOOLS.map((t) => t.name), ...ACT_TOOLS.map((t) => t.name), "finish"],
  );
});

test("a finish beside a read is set aside: that answer was written before its read, so the model answers next round with the rows", async () => {
  const s = scripted([
    ROUND([tool("get_settings", {}), finish("We open at nine.")]),
    ROUND([finish("Monday 9:00 to 17:00; the other days are not set.")]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual(
    [r.answer, r.rounds, r.tools],
    ["Monday 9:00 to 17:00; the other days are not set.", 2, ["get_settings"]],
  );
});

test("an act tool beside the finish stands: the proposal is built for real, the answer is the model's, one round", async () => {
  const s = scripted([
    ROUND([
      tool("propose_policy", { class: "reply", mode: "ask" }),
      finish("I proposed asking you first on every reply."),
    ]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual([r.answer, r.rounds, r.failed], ["I proposed asking you first on every reply.", 1, false]);
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.title, p.needs]),
    [["policy", "Autonomy: reply", "operator"]],
  );
  assert.deepEqual(r.tools, ["propose_policy"]);
});

test("proposals alone are the answer: every card made, no second round; a refused proposal keeps the round and the model must say why", async () => {
  const alone = scripted([ROUND([tool("propose_invite", { email: "ada@example.com", role: "viewer" })])]);
  const { input, events } = turn(ctxFor());
  const r = await runAskTurn(input, ports(alone.round));
  assert.equal(r.rounds, 1);
  assert.equal(r.proposals.length, 1);
  assert.equal(r.answer, proposalsAnswer(r.proposals, false));
  assert.ok(
    r.answer.startsWith("Invite ada@example.com: As viewer") &&
      r.answer.endsWith("It's a card: approve it, change it or dismiss it."),
  );
  assert.ok(
    events.some((e) => e.t === "delta" && e.text === r.answer),
    "the cards' words are streamed as the answer",
  );
  assert.equal(r.ungrounded, false, "a proposal is checked against the workspace: it counts as a read");

  const refused = scripted([
    ROUND([tool("propose_invite", { email: "not-an-address", role: "viewer" })]),
    ROUND([finish("That is not an email address; give me one and I will propose the invitation.")]),
  ]);
  const r2 = await runAskTurn(turn(ctxFor()).input, ports(refused.round));
  assert.deepEqual([r2.rounds, r2.proposals.length, r2.failed], [2, 0, false]);
  const back = refused.requests[1].messages.at(-1).content[0];
  assert.deepEqual([back.type, back.is_error], ["tool_result", true]);
  assert.match(back.content, /not an email address/);
});

test("every refusal of the gateway ends the turn in its sentence, in the person's language, and says why in the result", async () => {
  const cases = [
    [
      { kind: "preview" },
      "Ask only answers on the production dashboard.",
      "Ask solo responde en el panel de producción.",
    ],
    [
      { kind: "budget", used: 5, cap: 5 },
      "Ask has used its daily budget. Try again tomorrow; the pages still work.",
      "Ask usó su presupuesto diario. Vuelve mañana; las páginas siguen funcionando.",
    ],
    [{ kind: "no_key" }, "Ask is not connected to a model yet.", "Ask no está conectado a un modelo todavía."],
    [
      { kind: "unreachable", message: "ECONNREFUSED" },
      "I could not reach the model. Try again in a moment.",
      "No pude llegar al modelo. Inténtalo de nuevo en un momento.",
    ],
    [
      { kind: "bad_request", message: "400 messages: too long" },
      "The model refused the question. Try it another way.",
      "El modelo rechazó la pregunta. Inténtalo de otra forma.",
    ],
  ];
  for (const [refusal, en, es] of cases) {
    const r = await runAskTurn(
      turn(ctxFor()).input,
      ports(async () => {
        throw new GatewayRefused(refusal);
      }),
    );
    assert.deepEqual([r.answer, r.failed, r.failure, r.rounds], [en, true, refusal.kind, 1], refusal.kind);
    const r2 = await runAskTurn(
      turn(ctxFor(), { language: "es" }).input,
      ports(async () => {
        throw new GatewayRefused(refusal);
      }),
    );
    assert.equal(r2.answer, es, `${refusal.kind} in Spanish`);
  }
});

test("a strict-tools rejection retries the same round without strict, like the receptionist's format fallback", async () => {
  let n = 0;
  const requests = [];
  const round = async (c) => {
    requests.push(c.request);
    if (n++ === 0)
      throw new GatewayRefused({ kind: "bad_request", message: "400 tools.2.strict: Extra inputs are not permitted" });
    return ROUND([finish("Nothing waiting.")]);
  };
  const r = await runAskTurn(turn(ctxFor()).input, ports(round));
  assert.deepEqual(
    [r.answer, r.failed, r.rounds],
    ["Nothing waiting.", false, 1],
    "the retried round is the same round",
  );
  assert.equal(requests[0].tools.find((t) => t.name === "finish").strict, true);
  assert.equal(requests[1].tools.find((t) => t.name === "finish").strict, undefined, "without strict the second time");
});

test("a stream that broke before any block ends the turn; one that broke after the finish arrived still answers; a refusal stop reason is its own sentence", async () => {
  const empty = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { streamError: "socket hang up" })),
  );
  assert.deepEqual(
    [empty.answer, empty.failed, empty.failure],
    ["The connection to the model dropped. Try again.", true, "socket hang up"],
  );
  const late = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([finish("Nothing waiting.")], { streamError: "socket hang up" })),
  );
  assert.deepEqual([late.answer, late.failed], ["Nothing waiting.", false]);
  const refused = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { stopReason: "refusal" })),
  );
  assert.deepEqual([refused.answer, refused.failed, refused.failure], ["I can't answer that here.", true, "refusal"]);
});

test("the last round forces the finish; a model that reads through every round ends in a stated failure", async () => {
  const s = scripted(Array.from({ length: ASK_MAX_ROUNDS }, () => ROUND([tool("get_settings", {})])));
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual(
    [r.answer, r.failed, r.failure, r.rounds],
    ["I did not reach an answer. Try again.", true, "rounds_exhausted", ASK_MAX_ROUNDS],
  );
  assert.deepEqual(s.requests.at(-1).tool_choice, { type: "tool", name: "finish" }, "the last round may only finish");
  assert.deepEqual(s.requests.at(-2).tool_choice, { type: "any" });
  assert.equal(r.tools.length, ASK_MAX_ROUNDS, "every read ran");
});

test("a finish the parser refuses: the model's prose beside it is the answer, or a stated failure when there was none; prose with no call is the answer, unverified", async () => {
  const bare = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([{ type: "tool_use", id: "f1", name: "finish", text: "", json: "{}" }])),
  );
  assert.deepEqual(
    [bare.answer, bare.failed, bare.failure],
    ["I could not shape the answer. Ask again.", true, "finish: empty answer"],
  );
  const withProse = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () =>
      ROUND([
        prose("Two threads are waiting on you."),
        { type: "tool_use", id: "f1", name: "finish", text: "", json: "{}" },
      ]),
    ),
  );
  assert.deepEqual([withProse.answer, withProse.failed], ["Two threads are waiting on you.", false]);
  const proseOnly = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([prose("Nothing to read for that.")], { stopReason: "end_turn" })),
  );
  assert.deepEqual([proseOnly.answer, proseOnly.failed, proseOnly.failure], ["Nothing to read for that.", false, null]);
  const nothing = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { stopReason: "end_turn" })),
  );
  assert.deepEqual(
    [nothing.answer, nothing.failed, nothing.failure],
    ["I found nothing to read for that question.", true, "no_tool_no_text"],
  );
});

test("a snapshot that fails costs the snapshot, never the turn; a round that throws something other than a refusal is the turn's stated failure", async () => {
  const s = scripted([ROUND([finish("Nothing waiting.")])]);
  const r = await runAskTurn(
    turn(ctxFor()).input,
    ports(s.round, {
      snapshot: async () => {
        throw new Error("snapshot query timed out");
      },
    }),
  );
  assert.deepEqual([r.answer, r.failed], ["Nothing waiting.", false]);
  assert.ok(!s.requests[0].system.some((b) => b.text.startsWith("The day:")), "no snapshot block");
  const broken = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => {
      throw new TypeError("blocks is not iterable");
    }),
  );
  assert.deepEqual(
    [broken.answer, broken.failed, broken.failure, broken.rounds],
    ["Something went wrong while answering. Try again.", true, "blocks is not iterable", 0],
  );
});

test("the prefetch: a question that names a report reads it before the model is asked, and the read rides in as data", async () => {
  const s = scripted([ROUND([finish("Quiet week.")])]);
  const t = tables();
  const r = await runAskTurn(
    turn(ctxFor(t, { ...RPCS, report_series: () => ({ error: "empty" }) }), { text: "How did the last 7 days go?" })
      .input,
    ports(s.round),
  );
  assert.equal(r.failed, false);
  // The report function answered with an error, so the prefetch was dropped, not the turn.
  assert.deepEqual(r.tools, []);
  const s2 = scripted([ROUND([finish("Two playbooks run.")])]);
  const r2 = await runAskTurn(turn(ctxFor(t), { text: "Which playbooks are running?" }).input, ports(s2.round));
  assert.deepEqual(r2.tools, ["list_playbooks"], "a read that succeeded is on the turn's tools");
  assert.ok(
    s2.requests[0].system.some((b) => b.text.includes("list_playbooks")),
    "and in the first round's block",
  );
});

test("the history is folded so no two neighbours share a role and the person speaks first", () => {
  assert.deepEqual(
    foldHistory(
      [
        { role: "assistant", text: "Hi" },
        { role: "user", text: "a" },
        { role: "user", text: "b" },
        { role: "assistant", text: "c" },
      ],
      "d",
    ),
    [
      { role: "user", content: "a\nb" },
      { role: "assistant", content: "c" },
      { role: "user", content: "d" },
    ],
  );
  assert.deepEqual(foldHistory([], "d"), [{ role: "user", content: "d" }]);
});

test("REGRESSION: the assistant's people search says when someone was last in touch -- it handed ago the time since, and said Dec 31, 1969 of everyone", async () => {
  const wrote = iso(NOW.getTime() - 2 * 3600_000);
  const rosa = {
    id: P1,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+13055550100",
    consent: "opted_in",
    consent_source: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: C1,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: wrote,
    last_message_at: wrote,
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Are you open Saturday?",
    last_inbound_at: wrote,
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: wrote,
    earliest_row_at: wrote,
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
  };
  const tc = newToolContext(ctxFor(tables(), { ...RPCS, people_list: () => [rosa] }), A, "operator", TZ, NOW);
  const r = await runTool(tc, { name: "search_people", input: { query: "rosa" } });
  assert.equal(r.isError, false, r.result);
  assert.deepEqual(
    JSON.parse(r.result).people.map((p) => [p.name, p.last_contact]),
    [["Rosa", "2h ago"]],
  );
});

test("the round gathers the stream: blocks in order, the finish's answer streamed as it grows, the stop reason, and an error after the start kept beside the blocks", async () => {
  async function* stream() {
    yield { type: "block_start", index: 0, block: { type: "text" } };
    yield { type: "text", index: 0, text: "Let me look." };
    yield { type: "block_start", index: 1, block: { type: "tool_use", id: "f1", name: "finish" } };
    yield { type: "input_json", index: 1, partial: '{"answer": "Two thr' };
    yield { type: "input_json", index: 1, partial: 'eads wait", "citations": []}' };
    yield { type: "block_stop", index: 1 };
    yield { type: "stop", stopReason: "tool_use" };
  }
  const deltas = [];
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, (d) => deltas.push(d), stream);
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.name, b.text, b.json]),
    [
      ["text", "", "Let me look.", ""],
      ["tool_use", "finish", "", '{"answer": "Two threads wait", "citations": []}'],
    ],
  );
  assert.deepEqual([r.stopReason, r.streamError], ["tool_use", null]);
  assert.deepEqual(deltas, ["Two thr", "eads wait"], "the answer's words, as they arrive");
  async function* broken() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "error", message: "connection reset" };
  }
  const b = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, broken);
  assert.deepEqual(
    [b.blocks.length, b.blocks[0].name, b.streamError, b.stopReason],
    [1, "list_threads", "connection reset", null],
  );
});

test("the round keeps a thinking block whole -- its words and its signature, or a redacted block's data -- and hands every block back in the order written", async () => {
  async function* stream() {
    yield { type: "block_start", index: 0, block: { type: "thinking" } };
    yield { type: "thinking", index: 0, thinking: "The day " };
    yield { type: "thinking", index: 0, thinking: "is in the snapshot." };
    yield { type: "signature", index: 0, signature: "sig-1" };
    yield { type: "block_stop", index: 0 };
    yield { type: "block_start", index: 1, block: { type: "redacted_thinking", data: "EmwKAhgB" } };
    yield { type: "block_stop", index: 1 };
    yield { type: "block_start", index: 2, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 2, partial: '{"filter":"recent"}' };
    yield { type: "block_stop", index: 2 };
    yield { type: "stop", stopReason: "tool_use" };
  }
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, stream);
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.thinking, b.signature, b.data, b.name]),
    [
      ["thinking", "The day is in the snapshot.", "sig-1", undefined, ""],
      ["redacted_thinking", undefined, undefined, "EmwKAhgB", ""],
      ["tool_use", undefined, undefined, undefined, "list_threads"],
    ],
  );
  assert.deepEqual(
    replayBlocks(r.blocks),
    [
      { type: "thinking", thinking: "The day is in the snapshot.", signature: "sig-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t1", name: "list_threads", input: { filter: "recent" } },
    ],
    "what the next request carries back: every block, unmodified, in order",
  );
  assert.deepEqual(
    replayBlocks([{ type: "text", id: "", name: "", text: "", json: "" }]),
    [{ type: "text", text: " " }],
    "an empty text block still goes back as a space, as before: the API refuses an empty one",
  );
});

test("the fourteen reads run against the database in memory: each answers in its shape or refuses in words, and a read that fails says so to the model rather than throwing", async () => {
  const t = tables({
    escalations: [
      {
        id: E1,
        tenant_id: A,
        conversation_id: C1,
        reason: "human_token",
        details: "asked for a person",
        state: "open",
        created_at: iso(NOW.getTime() - 1800_000),
      },
    ],
  });
  const ctx = ctxFor(t);
  const tc = newToolContext(ctx, A, "operator", TZ, NOW);
  const run = (name, input = {}) => runTool(tc, { name, input });
  const out = {};
  for (const name of READ_TOOLS.map((d) => d.name))
    out[name] = await run(name, {
      conversation_id: C1,
      contact_id: P1,
      call_id: K1,
      filter: "recent",
      query: "rosa",
      days: 7,
      day: "today",
      service: "",
    });
  assert.deepEqual(
    Object.keys(out).sort(),
    [
      "get_calendar",
      "get_call",
      "get_openings",
      "get_person",
      "get_report",
      "get_settings",
      "get_thread",
      "get_today",
      "list_audiences",
      "list_calls",
      "list_lead_searches",
      "list_playbooks",
      "list_threads",
      "search_people",
    ],
    "the read tools the loop offers",
  );
  const threads = JSON.parse(out.list_threads.result);
  assert.equal(out.list_threads.isError, false, out.list_threads.result);
  assert.deepEqual(
    threads.threads.map((x) => [x.conversation_id, x.who, x.state]),
    [[C1, "Rosa", "needs you"]],
  );
  assert.ok(tc.read.thread.has(C1), "a read row enters the read set, so it may be cited");
  const thread = JSON.parse(out.get_thread.result);
  assert.equal(out.get_thread.isError, false, out.get_thread.result);
  assert.equal(thread.conversation_id ?? thread.thread?.conversation_id ?? C1, C1);
  assert.equal(out.get_call.isError, false, out.get_call.result);
  assert.ok(tc.read.call.has(K1));
  assert.equal(out.list_calls.isError, false, out.list_calls.result);
  assert.equal(out.get_settings.isError, false, out.get_settings.result);
  assert.ok(out.get_settings.result.includes("Harbor Moving"));
  assert.equal(out.get_openings.isError, false, out.get_openings.result);
  assert.ok(out.get_openings.result.includes("No calendar feed"), "no feed, said plainly");
  assert.equal(out.get_calendar.isError, false, out.get_calendar.result);
  assert.equal(out.list_audiences.isError, false, out.list_audiences.result);
  assert.equal(out.list_playbooks.isError, false, out.list_playbooks.result);
  assert.equal(out.list_lead_searches.isError, false, out.list_lead_searches.result);
  assert.deepEqual(
    JSON.parse(out.list_lead_searches.result).searches,
    [],
    "no search asked for yet, said as an empty list",
  );
  assert.deepEqual(JSON.parse(out.search_people.result).people, [], "nobody matched in an empty people list");
  assert.equal(out.get_person.isError, true);
  assert.match(out.get_person.result, /no such person/);
  assert.equal(out.get_report.isError, true);
  assert.match(out.get_report.result, /report unavailable/);
  assert.equal(out.get_today.isError, true, "the metrics function answered an error: the read fails in words");
  assert.match(out.get_today.result, /that read failed/);
  assert.deepEqual(await run("teleport"), {
    result: JSON.stringify({ error: "unknown tool teleport" }),
    isError: true,
    label: "Running teleport",
  });
  const faulted = newToolContext(
    ctxFor(tables(), RPCS, { "calls.select": { message: "permission denied" } }),
    A,
    "operator",
    TZ,
    NOW,
  );
  const failed = await runTool(faulted, { name: "list_calls", input: { filter: "recent" } });
  assert.deepEqual(
    [failed.isError, JSON.parse(failed.result).error],
    [true, "that read failed; say so and answer with what you have"],
  );
  assert.equal((await run("get_report", { days: 12 })).result, JSON.stringify({ error: "days must be 7, 30 or 90" }));
  assert.equal(
    (await run("get_thread", { conversation_id: "nope" })).result,
    JSON.stringify({ error: "conversation_id must be an id a tool returned" }),
  );
});

test("the caller who hung up in seconds: list_calls finds them under their own word, and the day's snapshot carries them into the first round", async () => {
  // Filed `handled`, because it was. Nothing in the product said the salon
  // had lost a booking an hour ago from a number it already has.
  const quick = call(K2, {
    retell_call_id: "r2",
    started_at: iso(NOW.getTime() - 3600_000),
    ended_at: iso(NOW.getTime() - 3594_000),
    duration_ms: 6_000,
    summary: null,
  });
  const tc = newToolContext(ctxFor(tables({ calls: [call(K1), quick] })), A, "operator", TZ, NOW);
  const listed = async (filter) => JSON.parse((await runTool(tc, { name: "list_calls", input: { filter } })).result);

  assert.deepEqual(
    (await listed("abandoned")).calls.map((c) => [c.call_id, c.abandoned]),
    [[K2, true]],
    "the two-hundred-second call ended the same way and is not one of these",
  );
  assert.deepEqual(
    (await listed("missed")).calls,
    [],
    "REGRESSION: reaching the receptionist and leaving is not a dial that never connected",
  );
  const today = (await listed("today")).calls;
  assert.deepEqual(today.map((c) => c.call_id).sort(), [K1, K2].sort());
  assert.equal(
    today.find((c) => c.call_id === K1).abandoned,
    undefined,
    "an ordinary call carries no flag at all, so the block costs nothing on a normal day",
  );

  const snap = await buildSnapshot(tc, TZ, null);
  assert.deepEqual([snap.counts.abandoned_today, snap.counts.missed_today, snap.counts.calls_today], [1, 0, 2]);
  assert.equal(snap.calls_today.find((c) => c.call_id === K2).abandoned, true);
  assert.equal(snap.calls_today.find((c) => c.call_id === K1).abandoned, undefined);
  assert.match(snap.note, /marked abandoned/, "the model reads the block cold, so the block says what the mark means");
});

test("the proposal builders run against the database in memory: each kind is a card with its door and its undo, or a refusal in the model's words", async () => {
  const t = tables({
    messages: [
      message(M1, C1),
      message("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", C1, {
        direction: "outbound",
        sender: "ai",
        status: "queued",
        body: "Yes, Saturday 9 to 5.",
      }),
    ],
    conversations: [
      conversation(C1),
      conversation(C2, { state: "snoozed", snooze_until: iso(NOW.getTime() + 86_400_000), assignee_user_id: USER }),
    ],
    escalations: [
      {
        id: E1,
        tenant_id: A,
        conversation_id: C1,
        reason: "human_token",
        details: "asked for a person",
        state: "open",
        created_at: iso(NOW.getTime() - 1800_000),
      },
    ],
    calls: [call(K1, { status: "ongoing", ended_at: null })],
    policies: [
      {
        id: "p-reply",
        tenant_id: A,
        class: "reply",
        mode: "auto",
        subject_type: null,
        subject_id: null,
        limits: { min_confidence: 0.6 },
        updated_at: iso(NOW.getTime()),
      },
    ],
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "saturday_hours",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "We are open Saturday 9 to 5.",
        hidden_at: null,
      },
    ],
  });
  const tc = newToolContext(
    ctxFor(t, {
      ...RPCS,
      people_list: () => [
        {
          id: P1,
          display_name: "Rosa",
          wa_profile_name: null,
          phone_e164: "+15555550100",
          consent: "opted_in",
          consent_source: "desk",
          marketing_consent: "opted_in",
          marketing_consent_source: "desk",
          marketing_consent_updated_at: iso(NOW.getTime() - 86_400_000),
          consent_updated_at: iso(NOW.getTime() - 86_400_000),
          dnc: false,
          channels: ["whatsapp"],
          conversation_count: 1,
          escalation_count: 0,
          needs_human: false,
          open_escalation_reason: null,
          open_escalation_since: null,
          latest_conversation_id: C1,
          latest_state: "open",
          latest_paused_until: null,
          latest_assignee_user_id: null,
          latest_snooze_until: null,
          latest_wa_inbound_at: iso(NOW.getTime() - 3600_000),
          last_message_at: iso(NOW.getTime() - 3600_000),
          last_message_direction: "inbound",
          last_message_sender: "client",
          last_inbound_text: "Are you open Saturday?",
          last_inbound_at: iso(NOW.getTime() - 3600_000),
          last_call_at: null,
          last_outbound_call_at: null,
          last_inbound_call_at: null,
          created_at: iso(NOW.getTime() - 86_400_000 * 40),
        },
      ],
    }),
    A,
    "owner",
    TZ,
    NOW,
  );
  const p = (name, input) => buildProposal(tc, name, input);

  const steer = await p("propose_steer", {
    message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
    instruction: "shorter",
  });
  assert.equal(steer.isError, false, steer.result);
  assert.deepEqual(
    [steer.proposal.kind, steer.proposal.payload.conversation_id, steer.proposal.payload.current, steer.proposal.undo],
    ["steer", C1, "Yes, Saturday 9 to 5.", null],
  );
  assert.match((await p("propose_steer", { message_id: M1, instruction: "shorter" })).result, /not waiting any more/);

  const snooze = await p("propose_thread_verb", { conversation_id: C1, verb: "snooze" });
  assert.equal(snooze.isError, false, snooze.result);
  assert.equal(
    snooze.proposal.payload.until,
    "2026-09-15T14:00:00.000Z",
    "tomorrow at ten in the business's zone (New York, so 14:00Z), whatever zone the server runs in",
  );
  assert.match((await p("propose_thread_verb", { conversation_id: C1, verb: "wake" })).result, /not snoozed/);
  assert.equal((await p("propose_thread_verb", { conversation_id: C2, verb: "wake" })).isError, false);
  assert.equal(
    (await p("propose_thread_verb", { conversation_id: C2, verb: "hand_back" })).proposal.title,
    "Hand Rosa's thread back to the receptionist",
  );
  assert.match((await p("propose_thread_verb", { conversation_id: C1, verb: "hand_back" })).result, /nobody has taken/);
  const resolve = await p("propose_thread_verb", { conversation_id: C1, verb: "resolve" });
  assert.deepEqual([resolve.proposal.payload.escalation_id, resolve.proposal.undo], [E1, null]);
  assert.match((await p("propose_thread_verb", { conversation_id: C2, verb: "resolve" })).result, /no open escalation/);
  assert.match(
    (await p("propose_thread_verb", { conversation_id: C1, verb: "delete" })).result,
    /verb must be one of take_over, hand_back, snooze, wake, archive, resolve/,
  );

  const mode = await p("propose_person_mode", { contact_id: P1, mode: "never" });
  assert.deepEqual(
    [mode.proposal.kind, mode.proposal.needs, mode.proposal.payload.previous, mode.proposal.summary],
    ["person_mode", "owner", "inherit", "The receptionist stays silent with them"],
  );
  assert.match((await p("propose_person_mode", { contact_id: C2, mode: "never" })).result, /no such person/);

  assert.match(
    (await p("propose_policy", { class: "money", mode: "ask" })).result,
    /money stays owner-only by charter/,
  );
  assert.match((await p("propose_policy", { class: "booking", mode: "veto" })).result, /only replies can be held/);
  assert.match((await p("propose_policy", { class: "reply", mode: "" })).result, /say a mode or a confidence/);
  const dial = await p("propose_policy", { class: "reply", mode: "", min_confidence: 0.9 });
  assert.deepEqual(
    [dial.proposal.summary, dial.proposal.payload.previous],
    ["confidence dial 90%", { mode: "auto", min_confidence: 0.6 }],
    "the previous values ride along for undo",
  );

  const closure = await p("propose_settings", { change: { op: "add_closure", date: "2026-12-25", note: "Christmas" } });
  assert.deepEqual(
    [closure.proposal.title, closure.proposal.summary, closure.proposal.needs],
    ["Close for a day", "Closed on 2026-12-25 (Christmas)", "owner"],
  );
  assert.match(
    (await p("propose_settings", { change: { op: "add_closure", date: "tomorrow" } })).result,
    /change rejected/,
  );
  assert.match((await p("propose_settings", {})).result, /change is required/);

  const whisper = await p("propose_whisper", { call_id: K1, text: "Saturday is full" });
  assert.deepEqual([whisper.proposal.kind, whisper.proposal.title], ["whisper", "Whisper on the call with Rosa"]);
  assert.ok(tc.read.call.has(K1));
  t.calls[0].status = "ended";
  assert.match((await p("propose_whisper", { call_id: K1, text: "x" })).result, /not in progress/);

  assert.match((await p("propose_invite", { email: "nope", role: "viewer" })).result, /not an email address/);
  assert.match(
    (await p("propose_invite", { email: "ada@example.com", role: "owner" })).result,
    /role must be operator or viewer/,
  );

  const broadcast = await p("propose_broadcast", { template_id: TPL, audience_kind: "everyone", params: [] });
  assert.equal(broadcast.isError, false, broadcast.result);
  assert.deepEqual(
    [broadcast.proposal.kind, broadcast.proposal.payload.count, broadcast.proposal.payload.audience_label],
    ["broadcast", 1, EVERYONE_LABEL],
  );
  assert.match(
    (await p("propose_broadcast", { template_id: TPL, audience_kind: "list", audience_id: "nope" })).result,
    /audience_id must be a People list id/,
  );
  assert.match(
    (await p("propose_broadcast", { template_id: TPL, audience_kind: "everyone", params: ["extra"] })).result,
    /takes 0 values/,
  );

  const playbook = await p("propose_playbook", { trigger: "quiet_30", template_id: TPL, params: [] });
  assert.equal(playbook.isError, false, playbook.result);
  assert.deepEqual(
    [
      playbook.proposal.kind,
      playbook.proposal.payload.trigger,
      playbook.proposal.payload.template_id,
      playbook.proposal.undo,
    ],
    ["playbook", "quiet_30", TPL, "Delete it — nothing will run"],
  );
  assert.match((await p("propose_playbook", { trigger: "never" })).result, /trigger must be/);

  assert.match((await p("teleport", {})).result, /unknown tool teleport/);
  const throwing = newToolContext(
    ctxFor(t, RPCS, { "contacts.select": { message: "permission denied" } }),
    A,
    "owner",
    TZ,
    NOW,
  );
  assert.deepEqual(await buildProposal(throwing, "propose_person_mode", { contact_id: P1, mode: "ask" }), {
    proposal: null,
    result: JSON.stringify({ error: "that could not be checked; say so and suggest the page" }),
    isError: true,
  });
});

test("REGRESSION: a broadcast to nobody is refused with the cause it has -- Ask called a yes with no number to send to 'nobody has said yes', and pointed at a QR 'on this page'", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_WALK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const ANA = "cccccccc-cccc-4ccc-8ccc-cccccccccca1";
  const LUIS = "cccccccc-cccc-4ccc-8ccc-cccccccccca2";
  const day = 86_400_000;
  // As people_list returns them; proposeBroadcast maps them through toPersonRowVM, as the route's adapter does.
  const person = (over) => ({
    display_name: null,
    wa_profile_name: null,
    phone_e164: null,
    email: null,
    consent: "opted_in",
    consent_source: "desk",
    consent_updated_at: iso(NOW.getTime() - 20 * day),
    marketing_consent: null,
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: null,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: iso(NOW.getTime() - 3 * day),
    last_message_direction: "inbound",
    last_message_sender: "client",
    last_inbound_text: "Thanks!",
    last_inbound_at: iso(NOW.getTime() - 3 * day),
    last_call_at: null,
    last_outbound_call_at: null,
    last_inbound_call_at: null,
    created_at: iso(NOW.getTime() - 40 * day),
    ...over,
  });
  const people = [
    // Wrote in by email and said yes to both there: an address, and no number.
    person({
      id: ANA,
      display_name: "Ana Reyes",
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: iso(NOW.getTime() - 20 * day),
    }),
    // A number, and a yes to messages only.
    person({ id: LUIS, display_name: "Luis Mora", phone_e164: "+15555550101" }),
  ];
  const t = tables({
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "fall_offer",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "20% off this week.",
        hidden_at: null,
      },
    ],
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars" },
      { id: S_WALK, tenant_id: A, name: "Walk-ins" },
    ],
    segment_members: [
      { segment_id: S_REG, contact_id: ANA },
      { segment_id: S_REG, contact_id: LUIS },
      { segment_id: S_WALK, contact_id: LUIS },
    ],
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
  /** What the model is told when it proposes an offer to one of the lists: no card, and why. */
  const refusal = async (audience_id) => {
    const r = await buildProposal(tc, "propose_broadcast", {
      template_id: TPL,
      audience_kind: "saved",
      audience_id,
      params: [],
    });
    assert.deepEqual([r.proposal, r.isError], [null, true], r.result);
    return JSON.parse(r.result).error;
  };

  // Ana said yes to offers and has no number: the list is missing a number, not an answer -- People's words (#663).
  const regulars = await refusal(S_REG);
  assert.ok(regulars.includes(noNumberWords("“Regulars”", "marketing")), regulars);
  assert.ok(!regulars.includes("has said yes"), `REGRESSION: the model was told nobody had said yes: ${regulars}`);
  // Nobody on Walk-ins said yes to offers: the QR is where that is got, and it is on Broadcasts -- Ask is no page.
  const walkIns = await refusal(S_WALK);
  assert.ok(walkIns.includes("Nobody there has said yes to offers yet"), walkIns);
  assert.ok(walkIns.includes("or get their yes with the phrase and the QR on Broadcasts."), walkIns);
  assert.ok(!walkIns.includes("on this page"), `REGRESSION: ${walkIns}`);
});

/** A person as people_list returns them: the reads map them through toPersonRowVM, as the page's bridge does. */
const peopleListRow = (over) => ({
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  email: null,
  consent: "opted_in",
  consent_source: "desk",
  consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: null,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: iso(NOW.getTime() - 3 * 86_400_000),
  last_message_direction: "inbound",
  last_message_sender: "client",
  last_inbound_text: "Thanks!",
  last_inbound_at: iso(NOW.getTime() - 3 * 86_400_000),
  last_call_at: null,
  last_outbound_call_at: null,
  last_inbound_call_at: null,
  created_at: iso(NOW.getTime() - 40 * 86_400_000),
  ...over,
});
const ANA = "cccccccc-cccc-4ccc-8ccc-cccccccccca1";
const LUIS = "cccccccc-cccc-4ccc-8ccc-cccccccccca2";
const ROSA = "cccccccc-cccc-4ccc-8ccc-cccccccccca3";
/** Three answers: a yes to offers with no number, a number with a yes to messages only, and a number with both. */
const threeAnswers = () => {
  const yesToOffers = {
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
  };
  return [
    // Wrote in by email and said yes to both there: an address, and no number.
    peopleListRow({
      id: ANA,
      display_name: "Ana Reyes",
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      ...yesToOffers,
    }),
    // A number, and a yes to messages only.
    peopleListRow({ id: LUIS, display_name: "Luis Mora", phone_e164: "+15555550101" }),
    // A number, and a yes to both: the one an offer reaches.
    peopleListRow({ id: ROSA, display_name: "Rosa Diaz", phone_e164: "+15555550102", ...yesToOffers }),
  ];
};

test("REGRESSION: list_audiences tells who said yes from who can be sent it -- 'said_yes_to_offers' was the reach, so a yes with no number to send to read as nobody's yes", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_WALK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const people = threeAnswers();
  const t = tables({
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars" },
      { id: S_WALK, tenant_id: A, name: "Walk-ins" },
    ],
    segment_members: [
      [S_REG, ANA],
      [S_REG, LUIS],
      [S_WALK, LUIS],
      [S_WALK, ROSA],
    ].map(([segment_id, contact_id]) => ({ tenant_id: A, segment_id, contact_id })),
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
  const out = await runTool(tc, { name: "list_audiences", input: {} });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  /** One audience's four counts: said yes to offers, can be sent one; said yes to messages, can be sent one. */
  const counts = (label) => {
    const a = read.audiences.find((x) => x.label === label);
    return a && [a.said_yes_to_offers, a.can_be_sent_offers, a.said_yes_to_messages, a.can_be_sent_messages];
  };
  // Ana's yes to offers is a yes: what Regulars lacks is a number to send it to (#663).
  assert.deepEqual(
    counts("Regulars"),
    [1, 0, 2, 1],
    "REGRESSION: Regulars read 'said_yes_to_offers: 0', and the model said nobody on it had said yes",
  );
  assert.deepEqual(counts("Walk-ins"), [1, 1, 2, 2], "where everyone who said yes has a number, the two are one");
  assert.deepEqual(counts(EVERYONE_LABEL), [2, 1, 3, 2]);
  // The note tells the model which count is the send, and why the other can be larger, in the product's one spelling.
  assert.ok(read.note.includes(NO_NUMBER_REACH), read.note);
  for (const name of ["said_yes_to_offers", "can_be_sent_offers", "said_yes_to_messages", "can_be_sent_messages"]) {
    assert.ok(read.note.includes(name), `the note names ${name}: ${read.note}`);
    assert.ok(
      READ_TOOLS.find((d) => d.name === "list_audiences").description.includes(name),
      `and so does the tool's description: ${name}`,
    );
  }
});

test("REGRESSION: list_audiences counts everyone and every member, and names a calendar's lists only with a calendar -- it read the first thousand people with no appointments, and one select of members, so past a thousand it said less than the send enrols", async () => {
  const S_ALL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const people = Array.from({ length: 1200 }, (_, i) =>
    peopleListRow({
      id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`,
      display_name: `Person ${i}`,
      phone_e164: `+1555${String(1000000 + i)}`,
    }),
  );
  const t = tables({
    segments: [{ id: S_ALL, tenant_id: A, name: "Everyone we know" }],
    segment_members: people.map((r) => ({ tenant_id: A, segment_id: S_ALL, contact_id: r.id })),
  });
  // people_list answers a page at a time, as the database does; a select answers at most max_rows.
  const pages = {
    ...RPCS,
    people_list: (args) => people.slice(args?.p_offset ?? 0, (args?.p_offset ?? 0) + (args?.p_limit ?? 1000)),
  };
  const ctx = { supabase: fakeDb(t, {}, pages, { maxRows: 1000 }), userId: USER, email: "ada@example.com", params: {} };
  const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), { name: "list_audiences", input: {} });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  const reach = (label) => read.audiences.find((x) => x.label === label)?.can_be_sent_messages;
  assert.equal(reach(EVERYONE_LABEL), 1200, "REGRESSION: the first thousand people");
  assert.equal(reach("Everyone we know"), 1200, "REGRESSION: the first thousand members");
  assert.deepEqual(
    read.audiences.filter((a) => ["booked_week", "booked", "asked_never_booked", "lapsed"].includes(a.audience_id)),
    [],
    "REGRESSION: with no calendar, the calendar's lists were offered, each counting nobody",
  );
});

test("the deal lists reach Ask only where deals are a thing here -- list_audiences and search_people filtered People's lists on the calendar alone, so a salon was offered Proposal out and Clients, each counting nobody", async () => {
  const DEAL_LISTS = ["consultation_booked", "proposal_out", "clients", "deal_ended"];
  const ask = async (t) => {
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "list_audiences", input: {} });
    assert.equal(out.isError, false, out.result);
    const ids = JSON.parse(out.result).audiences.map((a) => a.audience_id);
    const clients = await runTool(tc, { name: "search_people", input: { query: "", list: "clients" } });
    return { named: DEAL_LISTS.filter((id) => ids.includes(id)), clients: JSON.parse(clients.result) };
  };
  // No deal ever recorded, no consult-first service listed: a salon. None of the four is named.
  const salon = await ask(tables());
  assert.deepEqual(salon.named, [], "REGRESSION: the deal lists were offered where deals are not a thing");
  assert.match(salon.clients.error, /deals are a thing here/, "and the narrowing says why, instead of nobody");
  assert.deepEqual(salon.clients.people, []);
  // One deal recorded: the three lists a deal alone makes. Consultation booked also needs a calendar and a
  // consult-first service, and this workspace has neither.
  const agency = await ask(
    tables({
      deals: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9",
          tenant_id: A,
          contact_id: ANA,
          service: "Ad management",
          stage: "proposed",
          proposed_at: iso(NOW.getTime() - 86_400_000),
          created_at: iso(NOW.getTime() - 86_400_000),
        },
      ],
    }),
  );
  assert.deepEqual(agency.named, ["proposal_out", "clients", "deal_ended"]);
  assert.equal(agency.clients.error, undefined, agency.clients.error);
  assert.deepEqual(agency.clients.people, [], "the list is offered; nobody is a client yet");
});

test("a gated list's refusal names the condition that failed: with a calendar and a deal recorded but no consult-first service, Consultation booked is refused for the service alone", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e1",
    "DTSTART:20260915T140000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Consultation with Ana",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const base = tables();
  const t = tables({
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
    deals: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd8",
        tenant_id: A,
        contact_id: ANA,
        service: "Ad management",
        stage: "won",
        proposed_at: iso(NOW.getTime() - 3 * 86_400_000),
        decided_at: iso(NOW.getTime() - 86_400_000),
        created_at: iso(NOW.getTime() - 3 * 86_400_000),
      },
    ],
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const listed = await runTool(tc, { name: "list_audiences", input: {} });
    assert.equal(listed.isError, false, listed.result);
    const ids = JSON.parse(listed.result).audiences.map((a) => a.audience_id);
    assert.ok(ids.includes("booked"), "the calendar was read: its lists are offered");
    assert.ok(
      ids.includes("clients") && !ids.includes("consultation_booked"),
      "deals are a thing; the consultation list needs the service",
    );
    const consult = JSON.parse(
      (await runTool(tc, { name: "search_people", input: { query: "", list: "consultation_booked" } })).result,
    );
    assert.match(consult.error, /lists a consult-first service under Settings › Business/, consult.error);
    assert.doesNotMatch(
      consult.error,
      /deal recorded|calendar connected/,
      "REGRESSION: the refusal named both conditions when only the service was missing",
    );
    assert.deepEqual(consult.people, []);
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("REGRESSION: list_playbooks tells who said yes from who a run can reach -- 'said_yes_now' was the reach, so a moment whose yes had no number read as nobody's", async () => {
  const tc = newToolContext(ctxFor(tables(), { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
  const out = await runTool(tc, { name: "list_playbooks", input: {} });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  /** One trigger's two counts: who its moment names that said the yes it needs, and who of them a run can reach. */
  const counts = (id) => {
    const x = read.triggers.find((y) => y.trigger === id);
    return x && [x.said_yes_now, x.can_be_sent_now];
  };
  // The month's offer names everyone: Ana and Rosa said yes to offers, and only Rosa has a number to send one to.
  assert.deepEqual(
    counts("everyone_monthly"),
    [2, 1],
    "REGRESSION: it read 'said_yes_now: 1', and Ana's yes was nobody's",
  );
  // The visit reminder names tomorrow's visits, and there is no calendar here: nobody, either way.
  assert.deepEqual(counts("visit_tomorrow"), [0, 0]);
  assert.ok(read.note.includes(NO_NUMBER_REACH), read.note);
  for (const name of ["said_yes_now", "can_be_sent_now"]) {
    assert.ok(read.note.includes(name), `the note names ${name}: ${read.note}`);
    assert.ok(
      READ_TOOLS.find((d) => d.name === "list_playbooks").description.includes(name),
      `and so does the tool's description: ${name}`,
    );
  }
});

test("REGRESSION: a proposed playbook's card says who said yes apart from who a run reaches -- '0 on the list said yes now' about a list whose yes had no number", async () => {
  const t = tables({
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "saturday_hours",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "We are open Saturday 9 to 5.",
        hidden_at: null,
      },
    ],
  });
  /** The card's summary, the words the owner approves it from and the model reads back. */
  const summary = async (people) => {
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
    const r = await buildProposal(tc, "propose_playbook", {
      trigger: "everyone_monthly",
      template_id: TPL,
      params: [],
    });
    assert.equal(r.isError, false, r.result);
    return r.proposal.summary;
  };
  // Ana said yes to offers and has no number; Luis has one and said yes to messages only: nobody can be sent a run.
  const [ana, luis] = threeAnswers();
  const noNumber = await summary([ana, luis]);
  assert.ok(
    noNumber.includes(" · 1 person on the list said yes to offers, with no number to send to · "),
    `REGRESSION: ${noNumber}`,
  );
  // Where a run reaches somebody, the count is who it reaches, as People and the send screen say it.
  const reaches = await summary(threeAnswers());
  assert.ok(reaches.includes(" · 1 person on the list said yes to offers · "), reaches);
});

test("the rule the model reads before any broadcast tells nobody's yes from a yes with no number to send to", () => {
  const rule = ASK_RULES.find((r) => r.includes("never propose a broadcast to nobody"));
  assert.ok(rule.includes(NO_NUMBER_REACH), rule);
  assert.ok(rule.includes("how many said yes and how many can be sent it"), rule);
  assert.ok(rule.includes("or the ones who did have no number to send to"), rule);
});

test("the real ports are the real modules, and an override reaches only the field it names", async () => {
  const real = askPorts();
  assert.deepEqual(Object.keys(real).sort(), ["propose", "round", "snapshot", "tool"]);
  assert.equal(real.tool, runTool);
  assert.equal(real.propose, buildProposal);
  assert.equal(real.round, runRound);
});

const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
/** metrics_summary as 00037_hygiene.sql returns it: a calm day with one message and one call. */
const METRICS = {
  workspace: { name: "Harbor", timezone: TZ, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+19295550100" }],
  window: {
    days: 1,
    since: "2026-09-14T04:00:00+00:00",
    since_local: "2026-09-14T00:00:00",
    now_local: "2026-09-14T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 1,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 1,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 1,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 200,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

test("REGRESSION: Today's reply-window rows are the opposite of drafts -- the customer spoke last and nobody has written back", async () => {
  // The field was `drafts_about_to_send`. The prompt's glossary tells the model
  // a held draft "sends itself when the window ends", so under that name the
  // assistant reported a customer being IGNORED as a reply already on its way
  // out, and the owner's correct action was the opposite of the implied one.
  const closing = conversation(C2, {
    last_wa_inbound_at: iso(NOW.getTime() - 22 * 3600_000),
    last_message_at: iso(NOW.getTime() - 22 * 3600_000),
  });
  const theirs = message(M2, C2, {
    sender: "customer", // the schema's word; 'client' is not one
    body: "Can you fit me in Saturday?",
    created_at: iso(NOW.getTime() - 22 * 3600_000),
    channel_ts: iso(NOW.getTime() - 22 * 3600_000),
  });
  const ctx = ctxFor(tables({ conversations: [closing], messages: [theirs] }), {
    ...RPCS,
    metrics_summary: () => METRICS,
  });
  const tc = newToolContext(ctx, A, "operator", TZ, NOW);
  const out = await runTool(tc, { name: "get_today", input: {} });
  assert.equal(out.isError, false, out.result);
  const today = JSON.parse(out.result);

  assert.ok(!("drafts_about_to_send" in today), "no field on Today claims to carry drafts");
  assert.doesNotMatch(
    out.result,
    /draft/i,
    "a Today read holds no draft of any kind: the snapshot's held_drafts and list_threads filter=held do",
  );

  assert.match(
    today.reply_window_closing.note,
    /24 hours/,
    "the rule is the contracts' own hint, not a second spelling",
  );
  assert.deepEqual(
    today.reply_window_closing.rows.map((r) => [r.conversation_id, r.route]),
    [[C2, `inbox/th-${C2}`]],
    "the row names the thread and where it opens",
  );
  assert.match(today.reply_window_closing.rows[0].text, /window closes/);
  assert.ok(tc.read.thread.has(C2), "a row this read returned may be cited and navigated to");

  // list_threads: the count is of everything that matched, not of what the cap kept, and every row names its wire.
  const listed = JSON.parse((await runTool(tc, { name: "list_threads", input: { filter: "recent" } })).result);
  assert.equal(listed.total_matching, listed.threads.length);
  assert.ok(
    listed.threads.every((th) => typeof th.channel === "string" && th.channel.length > 0 && !("tags" in th)),
    "a wire on every row; no field that never carried anything",
  );
});

test("the rules Ask says the receptionist follows are the ones the composer gave it: three are on until switched off, the health rule only once switched on", async () => {
  const { factsBlock } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
  const { composeSystemPrompt, guardrailsInForce } = await import("@chanlytics/contracts");
  const brain = {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const config = (guardrails) => ({
    brain: { ...brain, profile: { address: "1 Pier Rd", ...(guardrails ? { guardrails } : {}) } },
  });
  const PRICE = "never quotes or confirms a price";
  const BOOKING = "never confirms a booking itself";
  const AI = "says it is an automated assistant when asked";
  const HEALTH = "gives no health advice";

  // No `guardrails` key at all: what every workspace that never opened the rules has.
  const absent = workspaceFacts("Harbor", TZ, config(undefined));
  assert.deepEqual(
    absent.guardrails,
    [PRICE, BOOKING, AI],
    "the three that default on, and not the one that is opt-in",
  );
  assert.doesNotMatch(factsBlock(absent), /health/, "Ask's context never claims a rule the receptionist was not given");

  const on = workspaceFacts("Harbor", TZ, config({ no_health_advice: true }));
  assert.deepEqual(on.guardrails, [PRICE, BOOKING, AI, HEALTH]);
  assert.match(factsBlock(on), /The receptionist .*gives no health advice\./);

  const off = workspaceFacts(
    "Harbor",
    TZ,
    config({ never_quote_prices: false, never_confirm_booking: false, disclose_ai: false }),
  );
  assert.deepEqual(off.guardrails, [], "switched off is off, and the health rule is still not on");
  assert.doesNotMatch(factsBlock(off), /The receptionist /);

  // The same three configs through the composer: Ask lists the health rule exactly when the receptionist's prompt holds it.
  for (const [guardrails, facts] of [
    [undefined, absent],
    [{ no_health_advice: true }, on],
    [{ never_quote_prices: false, never_confirm_booking: false, disclose_ai: false }, off],
  ]) {
    const composed = composeSystemPrompt(
      brain,
      { address: "1 Pier Rd", ...(guardrails ? { guardrails } : {}) },
      "whatsapp",
    );
    assert.equal(facts.guardrails.includes(HEALTH), /Never give medical or health advice/.test(composed));
    assert.equal(facts.guardrails.includes(PRICE), /Never quote or confirm a price/.test(composed));
    assert.equal(facts.guardrails.includes(BOOKING), /Never promise or confirm an appointment yourself/.test(composed));
    assert.equal(
      facts.guardrails.includes(AI),
      /say plainly that you are the business's automated assistant/.test(composed),
    );
  }

  // The one reading both go through, with the defaults applied; null and undefined are a workspace with no rules stored.
  assert.deepEqual(guardrailsInForce(undefined), {
    never_quote_prices: true,
    never_confirm_booking: true,
    disclose_ai: true,
    no_health_advice: false,
  });
  assert.deepEqual(guardrailsInForce(null), guardrailsInForce({}));
  assert.deepEqual(guardrailsInForce({ never_quote_prices: false, no_health_advice: true }), {
    never_quote_prices: false,
    never_confirm_booking: true,
    disclose_ai: true,
    no_health_advice: true,
  });
});

test("get_person says where the proposal lives (00154), so a card can carry the address into a reply; and nothing when there is none", async () => {
  const wrote = iso(NOW.getTime() - 2 * 3600_000);
  const rosaRow = {
    id: P1,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+13055550100",
    consent: "opted_in",
    consent_source: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: C1,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: wrote,
    last_message_at: wrote,
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "How much would the move be?",
    last_inbound_at: wrote,
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: wrote,
    earliest_row_at: wrote,
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
  };
  const rpcs = { ...RPCS, people_list: () => [rosaRow] };
  const withLink = tables({
    contacts: [{ ...contact, tenant_id: A, erased_at: null, proposal_url: "https://docs.example.com/p/rosa" }],
  });
  const r = await runTool(newToolContext(ctxFor(withLink, rpcs), A, "operator", TZ, NOW), {
    name: "get_person",
    input: { contact_id: P1 },
  });
  assert.equal(r.isError, false, r.result);
  const person = JSON.parse(r.result);
  assert.ok(person.about.includes("Proposal: docs.example.com"), `About: ${person.about}`);

  const without = await runTool(newToolContext(ctxFor(tables(), rpcs), A, "operator", TZ, NOW), {
    name: "get_person",
    input: { contact_id: P1 },
  });
  assert.equal(without.isError, false, without.result);
  assert.ok(!JSON.parse(without.result).about.some((a) => a.startsWith("Proposal:")), "none on file: no row");
});

test("propose_deal makes a card the route commits: a new proposal has no deal_id, a client's move carries the open row's id and version, a passed proposal sent again moves its own row, a named service picks its own open row or is refused, and a bad stage or an unknown person is refused", async () => {
  const MARIA = "cccccccc-cccc-4ccc-8ccc-cccccccccc21";
  const LUIS = "cccccccc-cccc-4ccc-8ccc-cccccccccc22";
  const NORA = "cccccccc-cccc-4ccc-8ccc-cccccccccc23";
  const t = tables({
    contacts: [
      { ...contact, tenant_id: A, erased_at: null },
      {
        id: MARIA,
        tenant_id: A,
        display_name: "Maria",
        wa_profile_name: null,
        phone_e164: "+15555550121",
        email: null,
        erased_at: null,
      },
      {
        id: LUIS,
        tenant_id: A,
        display_name: "Luis",
        wa_profile_name: null,
        phone_e164: "+15555550122",
        email: null,
        erased_at: null,
      },
      {
        id: NORA,
        tenant_id: A,
        display_name: "Nora",
        wa_profile_name: null,
        phone_e164: "+15555550123",
        email: null,
        erased_at: null,
      },
    ],
    deals: [
      // Nora holds two open rows (already_open is per service): Ads is the newer, SEO the older.
      {
        id: "d4",
        tenant_id: A,
        contact_id: NORA,
        stage: "proposed",
        service: "Ads",
        version: 2,
        created_at: "2026-09-10T00:00:00Z",
      },
      {
        id: "d3",
        tenant_id: A,
        contact_id: NORA,
        stage: "proposed",
        service: "SEO",
        version: 1,
        created_at: "2026-08-15T00:00:00Z",
      },
      {
        id: "d1",
        tenant_id: A,
        contact_id: MARIA,
        stage: "proposed",
        service: "SEO",
        version: 3,
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "d2",
        tenant_id: A,
        contact_id: LUIS,
        stage: "lost",
        service: "Ads",
        version: 2,
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const p = (name, input) => buildProposal(tc, name, input);

  const fresh = await p("propose_deal", { contact_id: MARIA, stage: "proposed", service: "Ads" });
  assert.equal(fresh.isError, false, fresh.result);
  assert.equal(fresh.proposal.kind, "deal");
  assert.equal(fresh.proposal.needs, "operator");
  assert.equal(fresh.proposal.payload.deal_id, undefined, "a proposal beside an open one is a new engagement");
  assert.equal(fresh.proposal.payload.service, "Ads");
  assert.deepEqual(
    [fresh.proposal.title, fresh.proposal.summary, fresh.proposal.undo],
    ["Maria · Proposal out", "Proposal out · Ads", null],
  );
  assert.ok(tc.read.person.has(MARIA), "the person enters the read set, so a citation of them is kept");
  assert.equal(JSON.parse(fresh.result).proposed, true);

  const won = await p("propose_deal", { contact_id: MARIA, stage: "won", amount_cents: 250000, per: "month" });
  assert.equal(won.proposal.payload.deal_id, "d1");
  assert.equal(won.proposal.payload.version, 3);
  assert.equal(won.proposal.payload.service, undefined, "a move keeps the row's own service");
  assert.deepEqual([won.proposal.payload.amount_cents, won.proposal.payload.per], [250000, "month"]);
  assert.equal(won.proposal.summary, "Client · SEO · $2,500 a month");

  const again = await p("propose_deal", { contact_id: LUIS, stage: "proposed", note: "Called back in September" });
  assert.deepEqual(
    [again.proposal.payload.deal_id, again.proposal.payload.version, again.proposal.payload.note],
    ["d2", 2, "Called back in September"],
    "a passed proposal sent again moves its own row (DEAL_MOVES)",
  );
  assert.equal(again.proposal.summary, "Proposal out · Ads");

  // REGRESSION: a move that named a service the open row is not for said that service on the card and moved the
  // open row anyway; the door never changes a row's service, so the card names the row it moves, or refuses.
  const wrong = await p("propose_deal", { contact_id: MARIA, stage: "won", service: "Ads" });
  assert.equal(wrong.isError, true);
  assert.match(wrong.result, /open deal is for SEO; name that service or none/);
  const bySeo = await p("propose_deal", { contact_id: NORA, stage: "won", service: "SEO" });
  assert.deepEqual(
    [bySeo.proposal.payload.deal_id, bySeo.proposal.payload.version, bySeo.proposal.summary],
    ["d3", 1, "Client · SEO"],
    "a named service picks its own open row, not the newest",
  );
  assert.equal(
    (await p("propose_deal", { contact_id: NORA, stage: "won", service: "seo" })).proposal.payload.deal_id,
    "d3",
    "the service folds (case and accents aside)",
  );
  const newest = await p("propose_deal", { contact_id: NORA, stage: "won" });
  assert.deepEqual(
    [newest.proposal.payload.deal_id, newest.proposal.summary],
    ["d4", "Client · Ads"],
    "no service named: the current row, the newest open one",
  );
  assert.match(
    (await p("propose_deal", { contact_id: NORA, stage: "won", service: "Web design" })).result,
    /open deals are for Ads and SEO; name one of those or none/,
  );
  assert.match(
    (await p("propose_deal", { contact_id: P1, stage: "won" })).result,
    /no open deal to move; record a proposal first/,
    "no deal at all: refused in words before it becomes a card the door would refuse",
  );
  // A passed row is movable too (the door allows any move but out of ended); a service that is not its own is not.
  const lostWon = await p("propose_deal", { contact_id: LUIS, stage: "won" });
  assert.deepEqual([lostWon.proposal.payload.deal_id, lostWon.proposal.summary], ["d2", "Client · Ads"]);
  assert.match(
    (await p("propose_deal", { contact_id: LUIS, stage: "won", service: "SEO" })).result,
    /last deal is for Ads; name that service or none/,
  );
  const other = await p("propose_deal", { contact_id: LUIS, stage: "proposed", service: "SEO" });
  assert.deepEqual(
    [other.proposal.payload.deal_id, other.proposal.payload.service, other.proposal.summary],
    [undefined, "SEO", "Proposal out · SEO"],
    "a passed proposal sent again for another service is a new row",
  );

  const bad = await p("propose_deal", { contact_id: MARIA, stage: "banana" });
  assert.equal(bad.isError, true);
  assert.match(bad.result, /stage must be proposed, won, lost or ended/);
  assert.match((await p("propose_deal", { contact_id: C2, stage: "won" })).result, /no such person/);
  assert.match(
    (await p("propose_deal", { contact_id: "c1", stage: "won" })).result,
    /contact_id must be an id a read returned/,
  );
});
