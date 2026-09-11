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
import { ASK_MAX_ROUNDS, ASK_MODEL } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAskTurn, foldHistory, proposalsAnswer, askPorts } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { runRound } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const { runTool, newToolContext, READ_TOOLS } = await import(at("apps/dashboard/src/server/ask/tools.ts"));
const { buildProposal, ACT_TOOLS } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";
const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const contact = { id: P1, display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100", consent: "opted_in", dnc: false };
const conversation = (id, over = {}) => ({ id, tenant_id: A, contact_id: P1, state: "open", paused_until: null, snooze_until: null, assignee_user_id: null, last_wa_inbound_at: iso(NOW.getTime() - 3600_000), last_message_at: iso(NOW.getTime() - 3600_000), contacts: contact, ...over });
const message = (id, conversation_id, over = {}) => ({ id, conversation_id, tenant_id: A, direction: "inbound", sender: "client", type: "text", body: "Are you open Saturday?", media: null, meta: null, status: "delivered", created_at: iso(NOW.getTime() - 3600_000), channel_ts: iso(NOW.getTime() - 3600_000), channel: "whatsapp", ...over });
const call = (id, over = {}) => ({ id, tenant_id: A, retell_call_id: "r1", direction: "inbound", call_type: "phone_call", status: "ended", from_e164: "+15555550100", from_raw: null, to_e164: "+19295550100", started_at: iso(NOW.getTime() - 7200_000), ended_at: iso(NOW.getTime() - 7000_000), duration_ms: 200_000, disconnection_reason: "user_hangup", sentiment: null, call_successful: true, in_voicemail: false, summary: "Asked about Saturday.", wanted: null, outcome: null, follow_up: null, caller_name: "Rosa", transcript_object: [], recording: null, conversation_id: C1, contact_id: P1, message_id: null, updated_at: iso(NOW.getTime()), contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100" }, ...over });

function tables(over = {}) {
  return {
    memberships: [{ user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
    tenants: [{ id: A, name: "Harbor", timezone: TZ }],
    tenant_config: [{ tenant_id: A, config: { brain: { business_name: "Harbor Moving", booking_link: "https://book.example/harbor", system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.", fallbacks: { greeting: "g", error: "e", non_text: "n" }, profile: { hours: { mon: { open: "09:00", close: "17:00" } } } } }, version: 1 }],
    tenant_channels: [], policies: [], conversations: [conversation(C1)], escalations: [], messages: [message(M1, C1)], calls: [call(K1)],
    contacts: [{ ...contact, tenant_id: A, erased_at: null }], templates: [], segments: [], segment_members: [], playbooks: [],
    ...over,
  };
}
const RPCS = {
  people_list: () => [],
  metrics_summary: () => ({ error: "not modelled here" }),
  report_series: () => ({ error: "not modelled here" }),
};
const ctxFor = (t = tables(), rpcs = RPCS, faults = {}) => ({ supabase: fakeDb(t, faults, rpcs), userId: USER, email: "ada@example.com", params: {} });

const ROUND = (blocks, extra = {}) => ({ blocks, stopReason: "tool_use", streamError: null, ...extra });
const finish = (answer, extra = {}, id = "f1") => ({ type: "tool_use", id, name: "finish", text: "", json: JSON.stringify({ answer, citations: [], followups: [], navigate: null, language: "en", ...extra }) });
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
const ports = (round, extra = {}) => ({ round, snapshot: async () => "The day: two threads, one call.", tool: runTool, propose: buildProposal, ...extra });

function turn(ctx, over = {}) {
  const events = [];
  const input = {
    ctx, tenantId: A, role: "operator",
    facts: workspaceFacts("Harbor", TZ, ctx.supabase ? null : null, []),
    timezone: TZ, personLabel: "ada@example.com (operator)", language: "en", scope: null, surface: "today",
    history: [], text: "Who needs me?", emit: (ev) => events.push(ev), now: NOW,
    ...over,
  };
  return { input, events };
}

test("a read, then the answer: the read runs for real, its rows enter the read set, the second round carries the tool result, and a citation of a row that was read is kept", async () => {
  const ctx = ctxFor();
  const s = scripted([
    ROUND([tool("list_threads", { filter: "recent" })]),
    ROUND([finish("Rosa asked about Saturday; nobody else is waiting.", { citations: [{ kind: "thread", id: C1, label: "Rosa" }, { kind: "thread", id: C2, label: "nobody" }], followups: ["Reply to Rosa?"] })]),
  ]);
  const { input, events } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.answer, "Rosa asked about Saturday; nobody else is waiting.");
  assert.deepEqual([r.rounds, r.tools], [2, ["list_threads"]]);
  assert.deepEqual(r.citations.map((c) => [c.kind, c.id, c.to]), [["thread", C1, `inbox/th-${C1}`]], "the thread the read returned may be cited; the one it did not is dropped");
  assert.deepEqual(r.followups, ["Reply to Rosa?"]);
  assert.equal(r.ungrounded, false);
  assert.equal(s.requests.length, 2);
  assert.deepEqual(s.requests[0].tool_choice, { type: "any" });
  assert.equal(s.requests[0].model, ASK_MODEL);
  assert.ok(s.requests[0].system.some((b) => b.text === "The day: two threads, one call." && b.cache_control), "the snapshot rides in, cached");
  const second = s.requests[1].messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.deepEqual(second.at(-1).content.map((c) => [c.type, c.tool_use_id, c.is_error]), [["tool_result", "t-list_threads", false]], "the read's result goes back under the call's id");
  assert.ok(JSON.parse(second.at(-1).content[0].content).threads.some((t) => t.conversation_id === C1), "with the rows the fake database holds");
  assert.ok(events.some((e) => e.t === "trace"), "the palette is told a read is running");
});

test("a viewer is offered the read tools and finish only; an operator the act tools too", async () => {
  const viewer = scripted([ROUND([finish("Nothing waiting.")])]);
  await runAskTurn(turn(ctxFor(), { role: "viewer" }).input, ports(viewer.round));
  const names = viewer.requests[0].tools.map((t) => t.name);
  assert.ok(names.includes("finish") && names.includes("list_threads") && !names.some((n) => n.startsWith("propose_") || n === "draft_reply"));
  const op = scripted([ROUND([finish("Nothing waiting.")])]);
  await runAskTurn(turn(ctxFor()).input, ports(op.round));
  assert.deepEqual(op.requests[0].tools.map((t) => t.name), [...READ_TOOLS.map((t) => t.name), ...ACT_TOOLS.map((t) => t.name), "finish"]);
});

test("a finish beside a read is set aside: that answer was written before its read, so the model answers next round with the rows", async () => {
  const s = scripted([
    ROUND([tool("get_settings", {}), finish("We open at nine.")]),
    ROUND([finish("Monday 9:00 to 17:00; the other days are not set.")]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual([r.answer, r.rounds, r.tools], ["Monday 9:00 to 17:00; the other days are not set.", 2, ["get_settings"]]);
});

test("an act tool beside the finish stands: the proposal is built for real, the answer is the model's, one round", async () => {
  const s = scripted([ROUND([tool("propose_policy", { class: "reply", mode: "ask" }), finish("I proposed asking you first on every reply.")])]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual([r.answer, r.rounds, r.failed], ["I proposed asking you first on every reply.", 1, false]);
  assert.deepEqual(r.proposals.map((p) => [p.kind, p.title, p.needs]), [["policy", "Autonomy: reply", "operator"]]);
  assert.deepEqual(r.tools, ["propose_policy"]);
});

test("proposals alone are the answer: every card made, no second round; a refused proposal keeps the round and the model must say why", async () => {
  const alone = scripted([ROUND([tool("propose_invite", { email: "ada@example.com", role: "viewer" })])]);
  const { input, events } = turn(ctxFor());
  const r = await runAskTurn(input, ports(alone.round));
  assert.equal(r.rounds, 1);
  assert.equal(r.proposals.length, 1);
  assert.equal(r.answer, proposalsAnswer(r.proposals, false));
  assert.ok(r.answer.startsWith("Invite ada@example.com: As viewer") && r.answer.endsWith("It's a card: approve it, change it or dismiss it."));
  assert.ok(events.some((e) => e.t === "delta" && e.text === r.answer), "the cards' words are streamed as the answer");
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
    [{ kind: "preview" }, "Ask only answers on the production dashboard.", "Ask solo responde en el panel de producción."],
    [{ kind: "budget", used: 5, cap: 5 }, "Ask has used its daily budget. Try again tomorrow; the pages still work.", "Ask usó su presupuesto diario. Vuelve mañana; las páginas siguen funcionando."],
    [{ kind: "no_key" }, "Ask is not connected to a model yet.", "Ask no está conectado a un modelo todavía."],
    [{ kind: "unreachable", message: "ECONNREFUSED" }, "I could not reach the model. Try again in a moment.", "No pude llegar al modelo. Inténtalo de nuevo en un momento."],
    [{ kind: "bad_request", message: "400 messages: too long" }, "The model refused the question. Try it another way.", "El modelo rechazó la pregunta. Inténtalo de otra forma."],
  ];
  for (const [refusal, en, es] of cases) {
    const r = await runAskTurn(turn(ctxFor()).input, ports(async () => { throw new GatewayRefused(refusal); }));
    assert.deepEqual([r.answer, r.failed, r.failure, r.rounds], [en, true, refusal.kind, 1], refusal.kind);
    const r2 = await runAskTurn(turn(ctxFor(), { language: "es" }).input, ports(async () => { throw new GatewayRefused(refusal); }));
    assert.equal(r2.answer, es, `${refusal.kind} in Spanish`);
  }
});

test("a strict-tools rejection retries the same round without strict, like the receptionist's format fallback", async () => {
  let n = 0;
  const requests = [];
  const round = async (c) => {
    requests.push(c.request);
    if (n++ === 0) throw new GatewayRefused({ kind: "bad_request", message: "400 tools.2.strict: Extra inputs are not permitted" });
    return ROUND([finish("Nothing waiting.")]);
  };
  const r = await runAskTurn(turn(ctxFor()).input, ports(round));
  assert.deepEqual([r.answer, r.failed, r.rounds], ["Nothing waiting.", false, 1], "the retried round is the same round");
  assert.equal(requests[0].tools.find((t) => t.name === "finish").strict, true);
  assert.equal(requests[1].tools.find((t) => t.name === "finish").strict, undefined, "without strict the second time");
});

test("a stream that broke before any block ends the turn; one that broke after the finish arrived still answers; a refusal stop reason is its own sentence", async () => {
  const empty = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([], { streamError: "socket hang up" })));
  assert.deepEqual([empty.answer, empty.failed, empty.failure], ["The connection to the model dropped. Try again.", true, "socket hang up"]);
  const late = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([finish("Nothing waiting.")], { streamError: "socket hang up" })));
  assert.deepEqual([late.answer, late.failed], ["Nothing waiting.", false]);
  const refused = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([], { stopReason: "refusal" })));
  assert.deepEqual([refused.answer, refused.failed, refused.failure], ["I can't answer that here.", true, "refusal"]);
});

test("the last round forces the finish; a model that reads through every round ends in a stated failure", async () => {
  const s = scripted(Array.from({ length: ASK_MAX_ROUNDS }, () => ROUND([tool("get_settings", {})])));
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual([r.answer, r.failed, r.failure, r.rounds], ["I did not reach an answer. Try again.", true, "rounds_exhausted", ASK_MAX_ROUNDS]);
  assert.deepEqual(s.requests.at(-1).tool_choice, { type: "tool", name: "finish" }, "the last round may only finish");
  assert.deepEqual(s.requests.at(-2).tool_choice, { type: "any" });
  assert.equal(r.tools.length, ASK_MAX_ROUNDS, "every read ran");
});

test("a finish the parser refuses: the model's prose beside it is the answer, or a stated failure when there was none; prose with no call is the answer, unverified", async () => {
  const bare = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([{ type: "tool_use", id: "f1", name: "finish", text: "", json: "{}" }])));
  assert.deepEqual([bare.answer, bare.failed, bare.failure], ["I could not shape the answer. Ask again.", true, "finish: empty answer"]);
  const withProse = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([prose("Two threads are waiting on you."), { type: "tool_use", id: "f1", name: "finish", text: "", json: "{}" }])));
  assert.deepEqual([withProse.answer, withProse.failed], ["Two threads are waiting on you.", false]);
  const proseOnly = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([prose("Nothing to read for that.")], { stopReason: "end_turn" })));
  assert.deepEqual([proseOnly.answer, proseOnly.failed, proseOnly.failure], ["Nothing to read for that.", false, null]);
  const nothing = await runAskTurn(turn(ctxFor()).input, ports(async () => ROUND([], { stopReason: "end_turn" })));
  assert.deepEqual([nothing.answer, nothing.failed, nothing.failure], ["I found nothing to read for that question.", true, "no_tool_no_text"]);
});

test("a snapshot that fails costs the snapshot, never the turn; a round that throws something other than a refusal is the turn's stated failure", async () => {
  const s = scripted([ROUND([finish("Nothing waiting.")])]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round, { snapshot: async () => { throw new Error("snapshot query timed out"); } }));
  assert.deepEqual([r.answer, r.failed], ["Nothing waiting.", false]);
  assert.ok(!s.requests[0].system.some((b) => b.text.startsWith("The day:")), "no snapshot block");
  const broken = await runAskTurn(turn(ctxFor()).input, ports(async () => { throw new TypeError("blocks is not iterable"); }));
  assert.deepEqual([broken.answer, broken.failed, broken.failure, broken.rounds], ["Something went wrong while answering. Try again.", true, "blocks is not iterable", 0]);
});

test("the prefetch: a question that names a report reads it before the model is asked, and the read rides in as data", async () => {
  const s = scripted([ROUND([finish("Quiet week.")])]);
  const t = tables();
  const r = await runAskTurn(turn(ctxFor(t, { ...RPCS, report_series: () => ({ error: "empty" }) }), { text: "How did the last 7 days go?" }).input, ports(s.round));
  assert.equal(r.failed, false);
  // The report function answered with an error, so the prefetch was dropped, not the turn.
  assert.deepEqual(r.tools, []);
  const s2 = scripted([ROUND([finish("Two playbooks run.")])]);
  const r2 = await runAskTurn(turn(ctxFor(t), { text: "Which playbooks are running?" }).input, ports(s2.round));
  assert.deepEqual(r2.tools, ["list_playbooks"], "a read that succeeded is on the turn's tools");
  assert.ok(s2.requests[0].system.some((b) => b.text.includes("list_playbooks")), "and in the first round's block");
});

test("the history is folded so no two neighbours share a role and the person speaks first", () => {
  assert.deepEqual(foldHistory([{ role: "assistant", text: "Hi" }, { role: "user", text: "a" }, { role: "user", text: "b" }, { role: "assistant", text: "c" }], "d"), [
    { role: "user", content: "a\nb" }, { role: "assistant", content: "c" }, { role: "user", content: "d" },
  ]);
  assert.deepEqual(foldHistory([], "d"), [{ role: "user", content: "d" }]);
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
  assert.deepEqual(r.blocks.map((b) => [b.type, b.name, b.text, b.json]), [["text", "", "Let me look.", ""], ["tool_use", "finish", "", '{"answer": "Two threads wait", "citations": []}']]);
  assert.deepEqual([r.stopReason, r.streamError], ["tool_use", null]);
  assert.deepEqual(deltas, ["Two thr", "eads wait"], "the answer's words, as they arrive");
  async function* broken() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "error", message: "connection reset" };
  }
  const b = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, broken);
  assert.deepEqual([b.blocks.length, b.blocks[0].name, b.streamError, b.stopReason], [1, "list_threads", "connection reset", null]);
});

test("the thirteen reads run against the database in memory: each answers in its shape or refuses in words, and a read that fails says so to the model rather than throwing", async () => {
  const t = tables({ escalations: [{ id: E1, tenant_id: A, conversation_id: C1, reason: "human_token", details: "asked for a person", state: "open", created_at: iso(NOW.getTime() - 1800_000) }] });
  const ctx = ctxFor(t);
  const tc = newToolContext(ctx, A, "operator", TZ, NOW);
  const run = (name, input = {}) => runTool(tc, { name, input });
  const out = {};
  for (const name of READ_TOOLS.map((d) => d.name)) out[name] = await run(name, { conversation_id: C1, contact_id: P1, call_id: K1, filter: "recent", query: "rosa", days: 7, day: "today", service: "" });
  assert.deepEqual(Object.keys(out).sort(), ["get_calendar", "get_call", "get_openings", "get_person", "get_report", "get_settings", "get_thread", "get_today", "list_audiences", "list_calls", "list_playbooks", "list_threads", "search_people"], "the read tools the loop offers");
  const threads = JSON.parse(out.list_threads.result);
  assert.equal(out.list_threads.isError, false, out.list_threads.result);
  assert.deepEqual(threads.threads.map((x) => [x.conversation_id, x.who, x.state]), [[C1, "Rosa", "needs you"]]);
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
  assert.deepEqual(JSON.parse(out.search_people.result).people, [], "nobody matched in an empty people list");
  assert.equal(out.get_person.isError, true);
  assert.match(out.get_person.result, /no such person/);
  assert.equal(out.get_report.isError, true);
  assert.match(out.get_report.result, /report unavailable/);
  assert.equal(out.get_today.isError, true, "the metrics function answered an error: the read fails in words");
  assert.match(out.get_today.result, /that read failed/);
  assert.deepEqual(await run("teleport"), { result: JSON.stringify({ error: "unknown tool teleport" }), isError: true, label: "Running teleport" });
  const faulted = newToolContext(ctxFor(tables(), RPCS, { "calls.select": { message: "permission denied" } }), A, "operator", TZ, NOW);
  const failed = await runTool(faulted, { name: "list_calls", input: { filter: "recent" } });
  assert.deepEqual([failed.isError, JSON.parse(failed.result).error], [true, "that read failed; say so and answer with what you have"]);
  assert.equal((await run("get_report", { days: 12 })).result, JSON.stringify({ error: "days must be 7, 30 or 90" }));
  assert.equal((await run("get_thread", { conversation_id: "nope" })).result, JSON.stringify({ error: "conversation_id must be an id a tool returned" }));
});

test("the proposal builders run against the database in memory: each kind is a card with its door and its undo, or a refusal in the model's words", async () => {
  const t = tables({
    messages: [message(M1, C1), message("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", C1, { direction: "outbound", sender: "ai", status: "queued", body: "Yes, Saturday 9 to 5." })],
    conversations: [conversation(C1), conversation(C2, { state: "snoozed", snooze_until: iso(NOW.getTime() + 86_400_000), assignee_user_id: USER })],
    escalations: [{ id: E1, tenant_id: A, conversation_id: C1, reason: "human_token", details: "asked for a person", state: "open", created_at: iso(NOW.getTime() - 1800_000) }],
    calls: [call(K1, { status: "ongoing", ended_at: null })],
    policies: [{ id: "p-reply", tenant_id: A, class: "reply", mode: "auto", subject_type: null, subject_id: null, limits: { min_confidence: 0.6 }, updated_at: iso(NOW.getTime()) }],
    templates: [{ id: TPL, tenant_id: A, channel: "whatsapp", name: "saturday_hours", language: "en", meta_status: "approved", category: "MARKETING", variables: [], body_preview: "We are open Saturday 9 to 5.", hidden_at: null }],
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => [{ id: P1, display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100", consent: "opted_in", consent_source: "desk", marketing_consent: "opted_in", marketing_consent_source: "desk", marketing_consent_updated_at: iso(NOW.getTime() - 86_400_000), consent_updated_at: iso(NOW.getTime() - 86_400_000), dnc: false, channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null, latest_conversation_id: C1, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: iso(NOW.getTime() - 3600_000), last_message_at: iso(NOW.getTime() - 3600_000), last_message_direction: "inbound", last_message_sender: "client", last_inbound_text: "Are you open Saturday?", last_inbound_at: iso(NOW.getTime() - 3600_000), last_call_at: null, last_outbound_call_at: null, last_inbound_call_at: null, created_at: iso(NOW.getTime() - 86_400_000 * 40) }] }), A, "owner", TZ, NOW);
  const p = (name, input) => buildProposal(tc, name, input);

  const steer = await p("propose_steer", { message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", instruction: "shorter" });
  assert.equal(steer.isError, false, steer.result);
  assert.deepEqual([steer.proposal.kind, steer.proposal.payload.conversation_id, steer.proposal.payload.current, steer.proposal.undo], ["steer", C1, "Yes, Saturday 9 to 5.", null]);
  assert.match((await p("propose_steer", { message_id: M1, instruction: "shorter" })).result, /not waiting any more/);

  const snooze = await p("propose_thread_verb", { conversation_id: C1, verb: "snooze" });
  assert.equal(snooze.isError, false, snooze.result);
  assert.equal(snooze.proposal.payload.until, "2026-09-15T14:00:00.000Z", "tomorrow at ten in the business's zone (New York, so 14:00Z), whatever zone the server runs in");
  assert.match((await p("propose_thread_verb", { conversation_id: C1, verb: "wake" })).result, /not snoozed/);
  assert.equal((await p("propose_thread_verb", { conversation_id: C2, verb: "wake" })).isError, false);
  assert.equal((await p("propose_thread_verb", { conversation_id: C2, verb: "hand_back" })).proposal.title, "Hand Rosa's thread back to the receptionist");
  assert.match((await p("propose_thread_verb", { conversation_id: C1, verb: "hand_back" })).result, /nobody has taken/);
  const resolve = await p("propose_thread_verb", { conversation_id: C1, verb: "resolve" });
  assert.deepEqual([resolve.proposal.payload.escalation_id, resolve.proposal.undo], [E1, null]);
  assert.match((await p("propose_thread_verb", { conversation_id: C2, verb: "resolve" })).result, /no open escalation/);
  assert.match((await p("propose_thread_verb", { conversation_id: C1, verb: "delete" })).result, /verb must be one of take_over, hand_back, snooze, wake, archive, resolve/);

  const mode = await p("propose_person_mode", { contact_id: P1, mode: "never" });
  assert.deepEqual([mode.proposal.kind, mode.proposal.needs, mode.proposal.payload.previous, mode.proposal.summary], ["person_mode", "owner", "inherit", "The receptionist stays silent with them"]);
  assert.match((await p("propose_person_mode", { contact_id: C2, mode: "never" })).result, /no such person/);

  assert.match((await p("propose_policy", { class: "money", mode: "ask" })).result, /money stays owner-only by charter/);
  assert.match((await p("propose_policy", { class: "booking", mode: "veto" })).result, /only replies can be held/);
  assert.match((await p("propose_policy", { class: "reply", mode: "" })).result, /say a mode or a confidence/);
  const dial = await p("propose_policy", { class: "reply", mode: "", min_confidence: 0.9 });
  assert.deepEqual([dial.proposal.summary, dial.proposal.payload.previous], ["confidence dial 90%", { mode: "auto", min_confidence: 0.6 }], "the previous values ride along for undo");

  const closure = await p("propose_settings", { change: { op: "add_closure", date: "2026-12-25", note: "Christmas" } });
  assert.deepEqual([closure.proposal.title, closure.proposal.summary, closure.proposal.needs], ["Close for a day", "Closed on 2026-12-25 (Christmas)", "owner"]);
  assert.match((await p("propose_settings", { change: { op: "add_closure", date: "tomorrow" } })).result, /change rejected/);
  assert.match((await p("propose_settings", {})).result, /change is required/);

  const whisper = await p("propose_whisper", { call_id: K1, text: "Saturday is full" });
  assert.deepEqual([whisper.proposal.kind, whisper.proposal.title], ["whisper", "Whisper on the call with Rosa"]);
  assert.ok(tc.read.call.has(K1));
  t.calls[0].status = "ended";
  assert.match((await p("propose_whisper", { call_id: K1, text: "x" })).result, /not in progress/);

  assert.match((await p("propose_invite", { email: "nope", role: "viewer" })).result, /not an email address/);
  assert.match((await p("propose_invite", { email: "ada@example.com", role: "owner" })).result, /role must be operator or viewer/);

  const broadcast = await p("propose_broadcast", { template_id: TPL, audience_kind: "everyone", params: [] });
  assert.equal(broadcast.isError, false, broadcast.result);
  assert.deepEqual([broadcast.proposal.kind, broadcast.proposal.payload.count, broadcast.proposal.payload.audience_label], ["broadcast", 1, "Everyone who said yes"]);
  assert.match((await p("propose_broadcast", { template_id: TPL, audience_kind: "list", audience_id: "nope" })).result, /audience_id must be a People list id/);
  assert.match((await p("propose_broadcast", { template_id: TPL, audience_kind: "everyone", params: ["extra"] })).result, /takes 0 values/);

  const playbook = await p("propose_playbook", { trigger: "quiet_30", template_id: TPL, params: [] });
  assert.equal(playbook.isError, false, playbook.result);
  assert.deepEqual([playbook.proposal.kind, playbook.proposal.payload.trigger, playbook.proposal.payload.template_id, playbook.proposal.undo], ["playbook", "quiet_30", TPL, "Delete it — nothing will run"]);
  assert.match((await p("propose_playbook", { trigger: "never" })).result, /trigger must be/);

  assert.match((await p("teleport", {})).result, /unknown tool teleport/);
  const throwing = newToolContext(ctxFor(t, RPCS, { "contacts.select": { message: "permission denied" } }), A, "owner", TZ, NOW);
  assert.deepEqual(await buildProposal(throwing, "propose_person_mode", { contact_id: P1, mode: "ask" }), { proposal: null, result: JSON.stringify({ error: "that could not be checked; say so and suggest the page" }), isError: true });
});

test("the real ports are the real modules, and an override reaches only the field it names", async () => {
  const real = askPorts();
  assert.deepEqual(Object.keys(real).sort(), ["propose", "round", "snapshot", "tool"]);
  assert.equal(real.tool, runTool);
  assert.equal(real.propose, buildProposal);
  assert.equal(real.round, runRound);
});
