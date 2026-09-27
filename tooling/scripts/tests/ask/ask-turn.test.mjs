/**
 * The assistant's turn, executed without a model.
 *
 * runAskTurn is the loop: the page's context, the rounds, the reads in parallel,
 * the proposals, the answer, and every way a turn ends without one. Every
 * door around it was executed; the turn itself was read for its text. Here
 * the model round is scripted through the ports the loop now takes (the move
 * whatsapp/ports.ts made for the receptionist's handler), the read tools and
 * the proposal builders run for real against the database in memory, and
 * the round's own gathering runs on a fake event stream.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  ASK_ANSWER_FORMAT,
  ASK_CITATION_KINDS,
  ASK_MAX_ROUNDS,
  ASK_ROW_WORDS,
  ASK_MAX_TOKENS,
  ASK_MODEL,
  ASK_MODEL_PROFILES,
  answerForCards,
  emptyReadSet,
  normalizeAnswer,
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  noNumberWords,
  toPersonVM,
  toPersonRowVM,
  nextRunLabel,
  toReportVM,
  toBookingReportVM,
  toDealReportVM,
  compareTemplates,
  numberHealth,
  sendableTemplates,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
delete process.env.ASK_MODEL;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAskTurn, foldHistory, askPorts } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { dropFor } = await import(at("apps/dashboard/src/server/ask/refusals.ts"));
const { runRound, replayBlocks } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const { runTool, newToolContext, buildProposal, toApiTools, ACT_TOOL_NAMES, READ_DEFS, ACT_DEFS } = await import(
  at("apps/dashboard/src/server/ask/tools/index.ts")
);
// The tools as the loop offers them, sorted by name (D11), the acts among the reads: told apart by the act names the
// loop itself tells apart.
const READ_TOOLS = toApiTools("owner", true).filter((t) => !ACT_TOOL_NAMES.has(t.name));
const ACT_TOOLS = toApiTools("owner", true).filter((t) => ACT_TOOL_NAMES.has(t.name));
const { scopedRead } = await import(at("apps/dashboard/src/server/ask/cross-page.ts"));
const { workspaceFacts, stableSystem, ASK_RULES, ASK_EXAMPLES } = await import(
  at("apps/dashboard/src/server/ask/prompt.ts")
);
const { GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));
const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const workspaceReads = await import(at("apps/dashboard/src/server/readers/facts.ts"));
const { report: reportReader } = await import(at("apps/dashboard/src/server/readers/report.ts"));
const personRoute = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));
const templatesRoute = await import(at("apps/dashboard/app/api/v1/templates/route.ts"));
const { playbooks: playbooksReader } = await import(at("apps/dashboard/src/server/readers/playbooks.ts"));
// The workspace's facts are kept across turns in the module: each test starts with none kept.
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";
const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
const K2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc8";
const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const TPL2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
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
  // The rail's counts (server/leads/lead-searches.ts listCounts), so Today's searches read as none inside a turn rather
  // than as a read that failed: the fake's refusal of an unmodelled door must never be caught into a quiet null.
  lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
};
const ctxFor = (t = tables(), rpcs = RPCS, faults = {}) => ({
  supabase: fakeDb(t, faults, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

const ROUND = (blocks, extra = {}) => ({ blocks, stopReason: "tool_use", streamError: null, ...extra });
const NONE = { kind: "none", id: "", label: "" };
/** The answer's JSON as the model writes it (ASK_ANSWER_FORMAT): nothing but Say unless `over` sets a part. */
const answerJson = (headline, over = {}) =>
  JSON.stringify({
    say: { headline, detail: "", ...over.say },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE }, ...over.show },
    do: { open: { source: NONE, label: "", now: false }, next: [], ...over.do },
    language: over.language ?? "en",
  });
const prose = (text) => ({ type: "text", id: "", name: "", text, json: "" });
/** The answer is a text block of that JSON. */
const answer = (headline, over) => prose(answerJson(headline, over));
/** A call as the model writes it; its id by default the name the turn records for it (`name.action`). */
const tool = (name, input, id = `t-${input?.action ? `${name}.${input.action}` : name}`) => ({
  type: "tool_use",
  id,
  name,
  text: "",
  json: JSON.stringify(input),
});

/** The model, scripted: each call takes the next round; the requests are kept for the assertions. */
function scripted(rounds) {
  const requests = [];
  const round = async (c, onText) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onText) : r;
  };
  return { round, requests };
}
/** What the turn logged under one event name, while `fn` ran. */
async function logged(event, fn) {
  const lines = [];
  const was = { warn: console.warn, error: console.error };
  console.warn = console.error = (name, ...rest) => {
    if (name === event) lines.push(rest.join(" "));
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.warn = was.warn;
    console.error = was.error;
  }
}
/** A page's context as the server builds it (server/ask/context.ts): the page's aggregate, then a row. */
const BUILT = {
  blocks: [
    {
      type: "search_result",
      source: "page://today",
      title: "Today",
      content: [{ type: "text", text: "Today: 2 need you" }],
      citations: { enabled: false },
    },
  ],
  refs: [{ kind: "page", id: "today", route: "today", label: "Today" }],
  rows: 0,
  chars: 30,
  stamp: 1,
  failed: false,
  warm: "hit",
};
/** A page context as the tab sends it (contracts PageContext). */
const PAGE = { v: 1, surface: "today", route: "today", view: null, focus: null, rows: [], askedAt: 1 };
const ports = (round, extra = {}) => ({
  round,
  context: async () => BUILT,
  shape: async () => "The workspace: Harbor · zone America/New_York",
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

test("a read, then the answer: the read runs for real, its rows enter the read set, the second round carries the tool result, and the answer names only rows that were read", async () => {
  const ctx = ctxFor();
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([
      answer("Rosa asked about Saturday; nobody else is waiting.", {
        show: {
          items: [
            { title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa },
            { title: "Nobody", meta: "", line: "", source: { kind: "thread", id: C2, label: "nobody" } },
          ],
        },
        do: { open: { source: rosa, label: "", now: true }, next: ["Reply to Rosa?"] },
      }),
    ]),
  ]);
  const { input, events } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.text, "Rosa asked about Saturday; nobody else is waiting.");
  assert.equal(r.answer.form, "structured");
  assert.deepEqual([r.rounds, r.tools], [2, ["inbox.list"]]);
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [["thread", C1, `inbox/th-${C1}`]],
    "the thread the read returned is an item; the one it did not is dropped",
  );
  assert.deepEqual(
    r.answer.do.open,
    { to: `inbox/th-${C1}`, label: "Open the thread", now: true },
    "one door runs where the answer is drawn: the Open the person asked for keeps its now beside the same row's item",
  );
  assert.deepEqual(r.answer.do.next, ["Reply to Rosa?"]);
  assert.equal(r.ungrounded, false);
  assert.equal(s.requests.length, 2);
  assert.deepEqual(s.requests[0].tool_choice, { type: "auto" });
  assert.deepEqual(
    s.requests[0].output_config,
    { effort: ASK_MODEL_PROFILES[ASK_MODEL].effort, format: { type: "json_schema", schema: ASK_ANSWER_FORMAT } },
    "every round may answer, in the answer's format, at the profile's effort",
  );
  assert.equal(s.requests[0].model, ASK_MODEL);
  assert.ok(
    s.requests[0].system.some((b) => b.text.startsWith("The workspace: Harbor") && b.cache_control),
    "the shape of the workspace rides in system, cached",
  );
  const second = s.requests[1].messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.deepEqual(
    second.at(-1).content.map((c) => [c.type, c.tool_use_id, c.is_error]),
    [["tool_result", "t-inbox.list", false]],
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

test("a model that thinks: its thinking goes back with the tool results exactly as it came, never padded into text, and every round asks for ASK_MAX_TOKENS", async () => {
  const ctx = ctxFor();
  const thought = (signature) => ({ type: "thinking", id: "", name: "", text: "", json: "", thinking: "", signature });
  const hidden = { type: "redacted_thinking", id: "", name: "", text: "", json: "", data: "EmwKAhgB" };
  const s = scripted([
    ROUND([thought("sig-round-1"), hidden, tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([thought("sig-round-2"), answer("Nobody is waiting on you.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.text, "Nobody is waiting on you.");
  assert.deepEqual(
    s.requests.map((q) => q.max_tokens),
    [ASK_MAX_TOKENS, ASK_MAX_TOKENS],
    "one ceiling, the edge's",
  );
  const replayed = s.requests[1].messages.at(-2);
  assert.equal(replayed.role, "assistant");
  assert.deepEqual(
    replayed.content,
    [
      { type: "thinking", thinking: "", signature: "sig-round-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t-inbox.list", name: "inbox", input: { action: "list", filter: "recent" } },
    ],
    "the thinking block keeps its empty words and its signature (Opus 5.5 always thinks and refuses a turn whose thinking was changed)",
  );
});

test("each role is offered its tools, sorted by name: a viewer the reads alone, an operator the acts an operator may approve, a partner the settings and the lead search too, an owner all nineteen (D11, D12); no tool is strict", async () => {
  const offered = {};
  for (const role of ["viewer", "operator", "partner", "owner"]) {
    const s = scripted([ROUND([answer("Nothing waiting.")])]);
    await runAskTurn(turn(ctxFor(), { role }).input, ports(s.round));
    offered[role] = s.requests[0].tools;
    assert.deepEqual(s.requests[0].tools, toApiTools(role, true), `${role}: the registry's tools for the role`);
  }
  const acts = (role) => offered[role].map((t) => t.name).filter((n) => ACT_TOOL_NAMES.has(n));
  assert.deepEqual(
    offered.viewer.map((t) => t.name),
    READ_TOOLS.map((t) => t.name),
    "a viewer: the nine reads",
  );
  assert.deepEqual(acts("operator"), [
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_person",
    "propose_reply",
    "propose_thread_verb",
    "propose_whisper",
  ]);
  assert.deepEqual(
    acts("partner").filter((n) => !acts("operator").includes(n)),
    ["propose_lead_search", "propose_settings"],
  );
  assert.deepEqual(
    acts("owner").filter((n) => !acts("partner").includes(n)),
    ["propose_team"],
  );
  // A person's note and details are an operator's (PR 4.6), a person's mode an owner's: one tool, offered per action.
  const personActions = (role) =>
    offered[role].find((t) => t.name === "propose_person")?.input_schema.properties.action.enum ?? null;
  assert.deepEqual(["viewer", "operator", "partner", "owner"].map(personActions), [
    null,
    ["note", "details"],
    ["note", "details"],
    ["mode", "note", "details"],
  ]);
  assert.deepEqual(
    offered.owner.map((t) => t.name),
    [...READ_TOOLS, ...ACT_TOOLS].map((t) => t.name).sort(),
    "no tool answers: the answer is the round's text; sorted, the acts among the reads",
  );
  assert.ok(
    Object.values(offered)
      .flat()
      .every((t) => t.strict === undefined),
    "REGRESSION: the API refused 26 strict tools, then the act tools' 31 optional parameters (it takes 20 and 24), on every operator turn",
  );
});

test("an answer beside a read is set aside: it was written before its rows, so the model answers next round with them, and its Say is taken back", async () => {
  const early = answerJson("We open at nine.");
  const s = scripted([
    async (_c, onText) => {
      onText(early);
      return ROUND([tool("workspace", { action: "settings" }), prose(early)]);
    },
    ROUND([answer("Monday 9:00 to 17:00; the other days are not set.")]),
  ]);
  const t = turn(ctxFor());
  const { result: r, lines } = await logged("ask_answer_beside_read", () => runAskTurn(t.input, ports(s.round)));
  assert.deepEqual(
    [r.text, r.rounds, r.tools],
    ["Monday 9:00 to 17:00; the other days are not set.", 2, ["workspace.settings"]],
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(
    t.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["We open at nine.", ""],
    "said as it was written, then taken back: the Line shows the read again",
  );
  assert.deepEqual(
    s.requests[1].messages.at(-2).content.map((b) => b.type),
    ["tool_use", "text"],
    "the round goes back whole, in order: nothing earlier is edited",
  );
});

test("an act tool beside the answer stands: the proposal is built for real, the answer is the model's, one round", async () => {
  const s = scripted([
    ROUND([
      tool("propose_autonomy", { class: "reply", mode: "ask" }),
      answer("I proposed asking you first on every reply."),
    ]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual([r.text, r.rounds, r.failed], ["I proposed asking you first on every reply.", 1, false]);
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.title, p.needs]),
    [["policy", "Autonomy: reply", "operator"]],
  );
  assert.deepEqual(r.tools, ["propose_autonomy"]);
  // A proposal counts as a read: its figures are the request, checked against the workspace. With no day read and
  // nothing proposed, a figure is not from the workspace.
  const noDay = {};
  const act = tool("propose_autonomy", { class: "reply", mode: "ask" });
  const proposed = await runAskTurn(
    turn(ctxFor()).input,
    ports(scripted([ROUND([act, answer("I proposed asking you first on 1 kind of reply.")])]).round, noDay),
  );
  assert.equal(proposed.ungrounded, false);
  const bare = await runAskTurn(
    turn(ctxFor()).input,
    ports(scripted([ROUND([answer("You have 3 people waiting.")])]).round, noDay),
  );
  assert.equal(bare.ungrounded, true, "a figure with nothing read behind it");
});

/** An invitation is an owner's card (its route's role): an operator is refused it before any card is made (D7). */
const AN_OWNER = { role: "owner", personLabel: "ada@example.com (owner)" };

test("words beside a card are the model thinking aloud, never the answer; an answer beside a card refused goes back with the round, its Say taken back", async () => {
  const refusedInvite = tool("propose_team", { action: "invite", email: "not-an-address", role: "viewer" });
  const aloud = scripted([
    ROUND([prose("I'll invite them now."), refusedInvite]),
    ROUND([answer("That is not an email address; give me one and I will propose the invitation.")]),
  ]);
  const r1 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(aloud.round));
  assert.deepEqual(
    [r1.text, r1.rounds, r1.proposals.length],
    ["That is not an email address; give me one and I will propose the invitation.", 2, 0],
    "the model hears the refusal and answers; the words beside the card never end the turn",
  );
  const made = scripted([
    ROUND([
      prose("Inviting Ada."),
      tool("propose_team", { action: "invite", email: "ada@example.com", role: "viewer" }),
    ]),
  ]);
  const r2 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(made.round));
  assert.equal(r2.answer.say.headline, "One card to review: Invite ada@example.com.", "the card made is the answer");

  const claimed = answerJson("I proposed the invitation.");
  const back = scripted([
    async (_c, onText) => {
      onText(claimed);
      return ROUND([prose(claimed), refusedInvite]);
    },
    ROUND([answer("That is not an email address.")]),
  ]);
  const t3 = turn(ctxFor(), AN_OWNER);
  const { result: r3, lines } = await logged("ask_answer_beside_refused_card", () =>
    runAskTurn(t3.input, ports(back.round)),
  );
  assert.deepEqual([r3.text, r3.rounds, r3.proposals.length, lines.length], ["That is not an email address.", 2, 0, 1]);
  assert.deepEqual(
    t3.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["I proposed the invitation.", ""],
    "an answer claiming a card that is not there is taken back",
  );
  assert.equal(
    back.requests[1].messages.at(-1).content[0].is_error,
    true,
    "the refusal goes back to the model with the round",
  );
});

test("cards alone are the answer: every card made, no second round, the cards said in a sentence; a refused proposal keeps the round and the model must say why", async () => {
  const alone = scripted([
    ROUND([tool("propose_team", { action: "invite", email: "ada@example.com", role: "viewer" })]),
  ]);
  const { input, events } = turn(ctxFor(), AN_OWNER);
  const r = await runAskTurn(input, ports(alone.round));
  assert.equal(r.rounds, 1);
  assert.equal(r.proposals.length, 1);
  assert.deepEqual(r.answer, answerForCards(r.proposals, "en"));
  assert.equal(
    r.text,
    "One card to review: Invite ada@example.com. Approve it, change it or dismiss it: nothing happens until you do.",
  );
  assert.ok(
    events.some((e) => e.t === "say" && e.headline === r.answer.say.headline),
    "the cards' sentence is said as the answer",
  );
  assert.equal(r.ungrounded, false, "a proposal is checked against the workspace: it counts as a read");

  const refused = scripted([
    ROUND([tool("propose_team", { action: "invite", email: "not-an-address", role: "viewer" })]),
    ROUND([answer("That is not an email address; give me one and I will propose the invitation.")]),
  ]);
  const r2 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(refused.round));
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
    assert.deepEqual([r.text, r.failed, r.failure, r.rounds], [en, true, refusal.kind, 1], refusal.kind);
    assert.deepEqual([r.answer.form, r.answer.say.headline], ["structured", en], "the sentence is the headline");
    const r2 = await runAskTurn(
      turn(ctxFor(), { language: "es" }).input,
      ports(async () => {
        throw new GatewayRefused(refusal);
      }),
    );
    assert.equal(r2.text, es, `${refusal.kind} in Spanish`);
  }
});

test("a format the API refuses is dropped and the same round asked again: words that come back are prose, JSON is read as JSON, and a second refusal is the turn's", async () => {
  const refusing = async (refusals, reply) => {
    const requests = [];
    const round = async (c) => {
      requests.push(c.request);
      const message = refusals.shift();
      if (message) throw new GatewayRefused({ kind: "bad_request", message });
      return ROUND([reply]);
    };
    const { result, lines } = await logged(
      "ask_format_rejected",
      async () => await runAskTurn(turn(ctxFor()).input, ports(round)),
    );
    return { r: result, requests, formatRejected: lines.length };
  };
  const named = await refusing(
    ["400 output_config.format.schema: too many properties"],
    prose("Nobody is waiting on you.\nSam called once."),
  );
  assert.deepEqual(
    [named.r.answer.form, named.r.text, named.r.failed, named.formatRejected],
    ["prose", "Nobody is waiting on you.\nSam called once.", false, 1],
  );
  assert.deepEqual(named.requests[0].output_config.format, { type: "json_schema", schema: ASK_ANSWER_FORMAT });
  assert.deepEqual(
    named.requests[1].output_config,
    { effort: ASK_MODEL_PROFILES[ASK_MODEL].effort },
    "the same round, without the format",
  );
  const shaped = await refusing(["400 output_config.format: not supported"], answer("Nobody is waiting on you."));
  assert.deepEqual(
    [shaped.r.answer.form, shaped.r.text],
    ["structured", "Nobody is waiting on you."],
    "the rules still ask for the shape: JSON written without the format is read as JSON, never shown raw",
  );

  const always = await refusing(["400 schema too complex", "400 schema too complex"], answer("Never read."));
  assert.deepEqual(
    [always.r.text, always.r.failed, always.r.failure, always.requests.length],
    ["The model refused the question. Try it another way.", true, "bad_request", 2],
    "with nothing left to drop, the refusal is the turn's",
  );
  const other = await refusing(["400 messages: too long"], answer("Never read."));
  assert.deepEqual(
    [other.r.failure, other.requests.length],
    ["bad_request", 1],
    "a refusal of something else is not retried",
  );
});

test("a stream that broke before any block ends the turn; one that broke after the answer arrived still answers; a refusal stop reason is its own sentence", async () => {
  const empty = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { streamError: "socket hang up" })),
  );
  assert.deepEqual(
    [empty.text, empty.failed, empty.failure],
    ["The connection to the model dropped. Try again.", true, "socket hang up"],
  );
  const late = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([answer("Nothing waiting.")], { streamError: "socket hang up" })),
  );
  assert.deepEqual([late.text, late.failed], ["Nothing waiting.", false]);
  const midway = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () =>
      ROUND([prose(answerJson("Two calls were missed.").slice(0, 50))], {
        streamError: "terminated",
        stopReason: null,
      }),
    ),
  );
  assert.deepEqual(
    [midway.text, midway.failed, midway.failure],
    ["The connection to the model dropped. Try again.", true, "terminated"],
    "an answer cut off by a broken stream says the connection dropped, not that the answer had no shape",
  );
  const refused = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { stopReason: "refusal" })),
  );
  assert.deepEqual([refused.text, refused.failed, refused.failure], ["I can't answer that here.", true, "refusal"]);
});

test("the last round may call no tool, so all it can do is answer; a model that reads through every round ends in a stated failure", async () => {
  const s = scripted(Array.from({ length: ASK_MAX_ROUNDS }, () => ROUND([tool("workspace", { action: "settings" })])));
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual(
    [r.text, r.failed, r.failure, r.rounds],
    ["I did not reach an answer. Try again.", true, "rounds_exhausted", ASK_MAX_ROUNDS],
  );
  assert.deepEqual(s.requests.at(-1).tool_choice, { type: "none" }, "the last round may only answer");
  assert.deepEqual(s.requests.at(-2).tool_choice, { type: "auto" });
  assert.equal(r.tools.length, ASK_MAX_ROUNDS, "every read ran");
});

test("an answer that does not shape is a stated failure -- JSON cut off by the cap, or no headline; words where the JSON should be are prose; a round with nothing is its own failure", async () => {
  const one = (blocks, extra, language = "en") =>
    runAskTurn(
      turn(ctxFor(), { language }).input,
      ports(async () => ROUND(blocks, extra)),
    );
  const { result: cut, lines } = await logged("ask_answer_unparsed", () =>
    one([prose(answerJson("Two threads are waiting on you.").slice(0, 60))], { stopReason: "max_tokens" }),
  );
  assert.deepEqual(
    [cut.text, cut.failed, cut.answer.form],
    ["I could not shape the answer. Ask again.", true, "structured"],
  );
  assert.match(cut.failure, /^answer: not JSON/);
  assert.equal(lines.length, 1);
  const headless = await one([answer(" <answer></answer> ")]);
  assert.deepEqual(
    [headless.text, headless.failed, headless.failure],
    ["I could not shape the answer. Ask again.", true, "answer: no headline"],
  );
  assert.equal((await one([answer("")], {}, "es")).text, "No pude dar forma a la respuesta. Pregunta de nuevo.");
  const words = await one([prose("Nothing to read for that.")], { stopReason: "end_turn" });
  assert.deepEqual(
    [words.text, words.failed, words.failure, words.answer.form],
    ["Nothing to read for that.", false, null, "prose"],
  );
  const nothing = await one([], { stopReason: "end_turn" });
  assert.deepEqual(
    [nothing.text, nothing.failed, nothing.failure],
    ["I found nothing to read for that question.", true, "no_tool_no_text"],
  );
});

test("Say streams from the answer's JSON as it is written: only what changed, at most every 50ms, never an empty one; the final message is the answer", async () => {
  const full = answerJson("Two threads are waiting on you.", { say: { detail: "Rosa asked about Saturday." } });
  const cut = (s) => full.slice(0, full.indexOf(s) + s.length);
  const s = scripted([
    async (_c, onText) => {
      onText(cut('"headline":"'));
      onText(cut("Two thr"));
      onText(cut("Two thr"));
      await new Promise((r) => setTimeout(r, 60));
      onText(cut("waiting on you."));
      onText(cut("Rosa asked"));
      onText(full);
      return ROUND([prose(full)], { stopReason: "end_turn" });
    },
  ]);
  const { input, events } = turn(ctxFor());
  const r = await runAskTurn(input, ports(s.round));
  assert.deepEqual(
    events.filter((e) => e.t === "say").map((e) => [e.headline, e.detail]),
    [
      ["Two thr", ""],
      ["Two threads are waiting on you.", ""],
    ],
    "an empty Say is not sent, a repeat is not sent, and the next waits its 50ms: the final message has the rest",
  );
  assert.equal(r.answer.say.detail, "Rosa asked about Saturday.");

  const last = JSON.stringify({ language: "en", say: { headline: "Nobody waits.", detail: "" } });
  const late = scripted([
    async (_c, onText) => {
      onText(last.slice(0, 14));
      onText(last);
      return ROUND([prose(answerJson("Nobody waits."))], { stopReason: "end_turn" });
    },
  ]);
  const t2 = turn(ctxFor());
  const { lines } = await logged("ask_say_not_first", () => runAskTurn(t2.input, ports(late.round)));
  assert.equal(lines.length, 1, "logged when the JSON does not start with say");
  assert.deepEqual(
    t2.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["Nobody waits."],
    "Say is read wherever it appears",
  );

  const tagged = scripted([
    async (_c, onText) => {
      onText('{"say":{"headline":"It handled it.</answer><parameter name=\\"cit');
      return ROUND([answer("It handled it.")], { stopReason: "end_turn" });
    },
  ]);
  const t3 = turn(ctxFor());
  await runAskTurn(t3.input, ports(tagged.round));
  assert.deepEqual(
    t3.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["It handled it."],
    "the preview shows nothing past a tag",
  );
});

test("a page's context or a shape that fails costs its block, never the turn; a round that throws something other than a refusal is the turn's stated failure", async () => {
  const s = scripted([ROUND([answer("Nothing waiting.")])]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: PAGE }).input,
    ports(s.round, {
      context: async () => {
        throw new Error("context read timed out");
      },
      shape: async () => {
        throw new Error("shape read timed out");
      },
    }),
  );
  assert.deepEqual([r.text, r.failed], ["Nothing waiting.", false]);
  assert.equal(s.requests[0].system.length, 1, "no shape block: the rules and facts alone");
  assert.ok(
    !JSON.stringify(s.requests[0].messages).includes("search_result"),
    "no page block: the question goes with its words",
  );
  assert.equal(r.shape.warm, "failed");
  const broken = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => {
      throw new TypeError("blocks is not iterable");
    }),
  );
  assert.deepEqual(
    [broken.text, broken.failed, broken.failure, broken.rounds],
    ["Something went wrong while answering. Try again.", true, "blocks is not iterable", 0],
  );
});

test("a question that names another page's rows reads them before the model is asked, and the read rides in as data, never in system", async () => {
  const s = scripted([ROUND([answer("Quiet week.")])]);
  const t = tables();
  const r = await runAskTurn(
    turn(ctxFor(t, { ...RPCS, report_series: () => ({ error: "empty" }) }), { text: "How did the last 7 days go?" })
      .input,
    ports(s.round),
  );
  assert.equal(r.failed, false);
  // The report function answered with an error, so the read was dropped, not the turn.
  assert.deepEqual(r.tools, []);
  const s2 = scripted([ROUND([answer("Two playbooks run.")])]);
  const r2 = await runAskTurn(turn(ctxFor(t), { text: "Which playbooks are running?" }).input, ports(s2.round));
  assert.deepEqual(
    r2.tools,
    ["campaigns.playbooks"],
    "a read that succeeded is on the turn's tools, as name.action (D11)",
  );
  assert.deepEqual(r2.shape.cross_page, ["campaigns.playbooks"], "and on its shape");
  const q = s2.requests[0].messages.at(-1).content;
  assert.ok(
    q.some((b) => b.type === "search_result" && b.source === "read://campaigns.playbooks"),
    "and in the question's message, as data",
  );
  assert.ok(!JSON.stringify(s2.requests[0].system).includes("read://campaigns.playbooks"), "never in system");
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
    // Her next step (0007, amended), as people_list v5 carries it: said on her line as the pages say it.
    step_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee51",
    step_body: "Send the price list",
    step_due_on: "2026-09-11",
    step_for_user_id: null,
    step_deal_id: null,
  };
  const tc = newToolContext(ctxFor(tables(), { ...RPCS, people_list: () => [rosa] }), A, "operator", TZ, NOW);
  const r = await runTool(tc, { name: "people", input: { action: "search", query: "rosa" } });
  assert.equal(r.isError, false, r.result);
  assert.deepEqual(
    JSON.parse(r.result).people.map((p) => [p.name, p.last_contact, p.next_step]),
    [["Rosa", "2h ago", "Send the price list · Overdue since Fri"]],
  );
  const [row] = JSON.parse(r.result).people;
  assert.equal(row.route, `clients/${row.contact_id}`, "a person says where they open");
});

test("the round gathers the stream: blocks in order, the text so far handed on as it grows, the stop reason, and an error after the start kept beside the blocks", async () => {
  async function* stream() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "inbox" } };
    yield { type: "input_json", index: 0, partial: '{"action": "list", "filter": "rec' };
    yield { type: "input_json", index: 0, partial: 'ent"}' };
    yield { type: "block_stop", index: 0 };
    yield { type: "block_start", index: 1, block: { type: "text" } };
    yield { type: "text", index: 1, text: '{"say": {"headline": "Two thr' };
    yield { type: "text", index: 1, text: 'eads wait"' };
    yield { type: "block_stop", index: 1 };
    yield { type: "stop", stopReason: "end_turn" };
  }
  const seen = [];
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, (s) => seen.push(s), stream);
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.name, b.text, b.json]),
    [
      ["tool_use", "inbox", "", '{"action": "list", "filter": "recent"}'],
      ["text", "", '{"say": {"headline": "Two threads wait"', ""],
    ],
  );
  assert.deepEqual([r.stopReason, r.streamError], ["end_turn", null]);
  assert.deepEqual(
    seen,
    ['{"say": {"headline": "Two thr', '{"say": {"headline": "Two threads wait"'],
    "the text so far, as it grows; a tool call's arguments are not words",
  );
  async function* broken() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "inbox" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "error", message: "connection reset" };
  }
  const b = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, broken);
  assert.deepEqual(
    [b.blocks.length, b.blocks[0].name, b.streamError, b.stopReason],
    [1, "inbox", "connection reset", null],
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
    yield { type: "block_start", index: 2, block: { type: "tool_use", id: "t1", name: "inbox" } };
    yield { type: "input_json", index: 2, partial: '{"action":"list","filter":"recent"}' };
    yield { type: "block_stop", index: 2 };
    yield { type: "stop", stopReason: "tool_use" };
  }
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, stream);
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.thinking, b.signature, b.data, b.name]),
    [
      ["thinking", "The day is in the snapshot.", "sig-1", undefined, ""],
      ["redacted_thinking", undefined, undefined, "EmwKAhgB", ""],
      ["tool_use", undefined, undefined, undefined, "inbox"],
    ],
  );
  assert.deepEqual(
    replayBlocks(r.blocks),
    [
      { type: "thinking", thinking: "The day is in the snapshot.", signature: "sig-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t1", name: "inbox", input: { action: "list", filter: "recent" } },
    ],
    "what the next request carries back: every block, unmodified, in order",
  );
  assert.deepEqual(
    replayBlocks([{ type: "text", id: "", name: "", text: "", json: "" }]),
    [{ type: "text", text: " " }],
    "an empty text block still goes back as a space, as before: the API refuses an empty one",
  );
});

test("the fourteen reads, each an action of the nine read tools, run against the database in memory: each answers in its shape or refuses in words, and a read that fails says so to the model rather than throwing; PR 4.3's ten run beside them (their answers are proven in their domains' suites)", async () => {
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
  // Every action of every read tool, each given its own fields from one set (a field only another action takes is
  // refused), keyed as a turn records it.
  const fields = {
    conversation_id: C1,
    contact_id: P1,
    call_id: K1,
    filter: "recent",
    query: "rosa",
    days: 7,
    day: "today",
    service: "",
  };
  for (const tool of READ_DEFS)
    for (const [action, def] of Object.entries(tool.actions)) {
      const own = Object.fromEntries(Object.entries(fields).filter(([k]) => k in def.input.shape));
      out[action ? `${tool.name}.${action}` : tool.name] = await run(tool.name, action ? { action, ...own } : own);
    }
  assert.deepEqual(
    Object.keys(out).sort(),
    [
      "calendar.openings",
      "calendar.week",
      "calls.get",
      "calls.list",
      "campaigns.audiences",
      "campaigns.broadcast",
      "campaigns.broadcasts",
      "campaigns.playbooks",
      "inbox.list",
      "inbox.thread",
      "leads.lead",
      "leads.leads",
      "leads.search",
      "leads.searches",
      "people.get",
      "people.lists",
      "people.pipeline",
      "people.search",
      "report",
      "today",
      "workspace.activity",
      "workspace.connections",
      "workspace.notifications",
      "workspace.settings",
    ],
    "the reads the loop offers: the fourteen old tools, each an action now, and PR 4.3's ten",
  );
  const threads = JSON.parse(out["inbox.list"].result);
  assert.equal(out["inbox.list"].isError, false, out["inbox.list"].result);
  assert.deepEqual(
    threads.threads.map((x) => [x.conversation_id, x.who, x.state]),
    [[C1, "Rosa", "needs you"]],
  );
  assert.ok(tc.read.thread.has(C1), "a read row enters the read set, so it may be cited");
  const thread = JSON.parse(out["inbox.thread"].result);
  assert.equal(out["inbox.thread"].isError, false, out["inbox.thread"].result);
  assert.equal(thread.conversation_id ?? thread.thread?.conversation_id ?? C1, C1);
  // Each row carries its last exchanges, so one read round answers most questions; and every row a tool returns
  // says where it opens, in the shape the answer's sources take (normalizeAnswer, ask-answer.test.mjs). Both were
  // pinned as source text in ask.test.mjs until the registry (PR 3.1).
  assert.deepEqual(
    threads.threads[0].recent.map((x) => [["customer", "you", "receptionist"].includes(x.from), x.text]),
    [[true, "Are you open Saturday?"]],
  );
  assert.equal(threads.threads[0].route, `inbox/th-${C1}`);
  assert.equal(thread.route, `inbox/th-${C1}`);
  assert.equal(JSON.parse(out["calls.get"].result).route, `conversations/cv-${K1}`);
  assert.equal(JSON.parse(out["calls.list"].result).calls[0].route, `conversations/cv-${K1}`);
  assert.equal(out["calls.get"].isError, false, out["calls.get"].result);
  assert.ok(tc.read.call.has(K1));
  assert.equal(out["calls.list"].isError, false, out["calls.list"].result);
  assert.equal(out["workspace.settings"].isError, false, out["workspace.settings"].result);
  assert.ok(out["workspace.settings"].result.includes("Harbor Moving"));
  assert.equal(out["calendar.openings"].isError, false, out["calendar.openings"].result);
  assert.ok(out["calendar.openings"].result.includes("No calendar feed"), "no feed, said plainly");
  assert.equal(out["calendar.week"].isError, false, out["calendar.week"].result);
  assert.equal(out["campaigns.audiences"].isError, false, out["campaigns.audiences"].result);
  assert.equal(out["campaigns.playbooks"].isError, false, out["campaigns.playbooks"].result);
  assert.equal(out["leads.searches"].isError, false, out["leads.searches"].result);
  assert.deepEqual(
    JSON.parse(out["leads.searches"].result).searches,
    [],
    "no search asked for yet, said as an empty list",
  );
  assert.deepEqual(
    [out["workspace.activity"].isError, JSON.parse(out["workspace.activity"].result).error],
    [true, "workspace: action activity is an owner's"],
    "an operator is refused the owner's log, before it is read",
  );
  assert.deepEqual(JSON.parse(out["people.search"].result).people, [], "nobody matched in an empty people list");
  assert.equal(out["people.get"].isError, true);
  assert.match(out["people.get"].result, /no such person/);
  assert.equal(out.report.isError, true);
  assert.match(out.report.result, /report unavailable/);
  assert.equal(out.today.isError, true, "the metrics function answered an error: the read fails in words");
  assert.match(out.today.result, /that read failed/);
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
  const failed = await runTool(faulted, { name: "calls", input: { action: "list", filter: "recent" } });
  assert.deepEqual(
    [failed.isError, JSON.parse(failed.result).error],
    [true, "that read failed; say so and answer with what you have"],
  );
  // A period the schema does not list is refused before the read runs, in the schema's own words (PR 3.1, D2).
  assert.match(JSON.parse((await run("report", { days: 12 })).result).error, /^report: days Invalid option/);
  assert.equal(
    (await run("inbox", { action: "thread", conversation_id: "nope" })).result,
    JSON.stringify({ error: "conversation_id must be an id a tool returned" }),
  );
});

test("the caller who hung up in seconds: calls.list finds them under their own word", async () => {
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
  const listed = async (filter) =>
    JSON.parse((await runTool(tc, { name: "calls", input: { action: "list", filter } })).result);

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
      {
        id: TPL2,
        tenant_id: A,
        channel: "whatsapp",
        name: "month_offer",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [{ position: 1, label: "offer", example: "20% off cuts" }],
        body_preview: "This month: {{1}}.",
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

  const steer = await p("propose_reply", {
    action: "steer",
    message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
    instruction: "shorter",
  });
  assert.equal(steer.isError, false, steer.result);
  assert.deepEqual(
    [steer.proposal.kind, steer.proposal.payload.conversation_id, steer.proposal.payload.current, steer.proposal.undo],
    ["steer", C1, "Yes, Saturday 9 to 5.", null],
  );
  assert.match(
    (await p("propose_reply", { action: "steer", message_id: M1, instruction: "shorter" })).result,
    /not waiting any more/,
  );

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
  // A verb the schema does not list is refused before the builder runs, in the schema's own words (PR 3.1, D2).
  assert.match(
    JSON.parse((await p("propose_thread_verb", { conversation_id: C1, verb: "delete" })).result).error,
    /^propose_thread_verb: verb Invalid option/,
  );

  const mode = await p("propose_person", { action: "mode", contact_id: P1, mode: "never" });
  assert.deepEqual(
    [mode.proposal.kind, mode.proposal.needs, mode.proposal.payload.previous, mode.proposal.summary],
    ["person_mode", "owner", "inherit", "The receptionist stays silent with them"],
  );
  assert.match((await p("propose_person", { action: "mode", contact_id: C2, mode: "never" })).result, /no such person/);

  assert.match(
    (await p("propose_autonomy", { class: "money", mode: "ask" })).result,
    /money stays owner-only by charter/,
  );
  assert.match((await p("propose_autonomy", { class: "booking", mode: "veto" })).result, /only replies can be held/);
  assert.match((await p("propose_autonomy", { class: "reply", mode: "" })).result, /say a mode or a confidence/);
  const dial = await p("propose_autonomy", { class: "reply", mode: "", min_confidence: 0.9 });
  assert.deepEqual(
    [dial.proposal.summary, dial.proposal.payload.previous],
    ["confidence dial 90%", { mode: "auto", min_confidence: 0.6 }],
    "the previous values ride along for undo",
  );

  const closure = await p("propose_settings", { change: { op: "add_closure", date: "2026-12-25", note: "Christmas" } });
  assert.deepEqual(
    [closure.proposal.title, closure.proposal.summary, closure.proposal.needs],
    ["Close for a day", "Closed on 2026-12-25 (Christmas)", "partner"],
    "a settings card needs a partner: its route, PUT settings, is a partner's door",
  );
  assert.match(
    (await p("propose_settings", { change: { op: "add_closure", date: "tomorrow" } })).result,
    /change rejected/,
  );
  assert.match(
    JSON.parse((await p("propose_settings", {})).result).error,
    /^propose_settings: change Invalid input/,
    "no change at all is refused by the schema, before the builder (PR 3.1, D2)",
  );

  const whisper = await p("propose_whisper", { call_id: K1, text: "Saturday is full" });
  assert.deepEqual([whisper.proposal.kind, whisper.proposal.title], ["whisper", "Whisper on the call with Rosa"]);
  assert.ok(tc.read.call.has(K1));
  t.calls[0].status = "ended";
  assert.match((await p("propose_whisper", { call_id: K1, text: "x" })).result, /not in progress/);

  assert.match(
    (await p("propose_team", { action: "invite", email: "nope", role: "viewer" })).result,
    /not an email address/,
  );
  assert.match(
    JSON.parse((await p("propose_team", { action: "invite", email: "ada@example.com", role: "owner" })).result).error,
    /^propose_team: role Invalid option/,
    "a role the schema does not list is refused by the schema (PR 3.1, D2)",
  );

  const broadcast = await p("propose_campaign", {
    action: "broadcast",
    template_id: TPL,
    audience_kind: "everyone",
    params: [],
  });
  assert.equal(broadcast.isError, false, broadcast.result);
  assert.deepEqual(
    [
      broadcast.proposal.kind,
      broadcast.proposal.needs,
      broadcast.proposal.payload.count,
      broadcast.proposal.payload.audience_label,
    ],
    ["broadcast", "operator", 1, EVERYONE_LABEL],
  );
  assert.match(
    (await p("propose_campaign", { action: "broadcast", template_id: TPL, audience_kind: "list", audience_id: "nope" }))
      .result,
    /audience_id must be a People list id/,
  );
  assert.match(
    (
      await p("propose_campaign", {
        action: "broadcast",
        template_id: TPL,
        audience_kind: "everyone",
        params: ["extra"],
      })
    ).result,
    /takes 0 values/,
  );

  const playbook = await p("propose_campaign", {
    action: "playbook",
    trigger: "quiet_30",
    template_id: TPL,
    params: [],
  });
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
  assert.match(
    (await p("propose_campaign", { action: "playbook", trigger: "never" })).result,
    /propose_campaign: trigger Invalid option/,
    "a moment the schema does not list is refused by the schema (PR 3.1, D2)",
  );

  // What the model is told of every card, and the reply refused for a person who opted out (pinned as text in
  // ask.test.mjs until PR 3.1).
  assert.equal(
    JSON.parse(broadcast.result).note,
    "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done.",
  );
  const was = t.conversations[0].contacts;
  t.conversations[0].contacts = { ...was, dnc: true };
  assert.match(
    (await p("propose_reply", { action: "draft", conversation_id: C1, text: "See you Saturday", voice: "you" })).result,
    /Rosa opted out; nothing can be sent to them/,
  );
  t.conversations[0].contacts = was;
  // A playbook with no template takes the trigger's starter, and says so when the workspace does not hold it; a
  // template with a typed slot and no words is a question for the person, never invented words (pinned as text in
  // playbooks.test.mjs until PR 3.1).
  assert.match(
    (await p("propose_campaign", { action: "playbook", trigger: "new_week" })).result,
    /starter is not approved on this workspace yet/,
  );
  assert.match(
    (await p("propose_campaign", { action: "playbook", trigger: "everyone_monthly", template_id: TPL2 })).result,
    /ask the person what to say there, then propose again with params/,
  );
  assert.ok(
    !tc.ctx.supabase.seen.some((q) => ["insert", "update", "upsert", "delete"].includes(q.op)),
    "a proposal reads; it never writes",
  );
  assert.match((await p("teleport", {})).result, /unknown tool teleport/);
  const throwing = newToolContext(
    ctxFor(t, RPCS, { "contacts.select": { message: "permission denied" } }),
    A,
    "owner",
    TZ,
    NOW,
  );
  assert.deepEqual(await buildProposal(throwing, "propose_person", { action: "mode", contact_id: P1, mode: "ask" }), {
    proposal: null,
    result: JSON.stringify({ error: "that could not be checked; say so and suggest the page" }),
    isError: true,
  });
});

test("a card above an operator is refused to a member below it in its route's words, before anything is read: a partner gets a settings card and is refused a person's mode and an invitation, an owner gets all three (D7)", async () => {
  const as = (role) => {
    const ctx = ctxFor();
    return { ctx, tc: newToolContext(ctx, A, role, TZ, NOW) };
  };
  // Each ask, and the refusal a member below its card's role hears: an owner's card names the owner; a partner's
  // names the owner and the workspace's partner, as the lead search's words do (#1159, decision 0012). A member below
  // the card's role is not offered its tool (D12) or its action (D2); should a call arrive anyway, an action is refused
  // by the registry in its words, and the builder, past it, still refuses in its route's.
  const ASKS = [
    [
      "propose_person",
      { action: "mode", contact_id: P1, mode: "never" },
      "only an owner can change how the receptionist treats one person; say so, and that an owner can ask",
      "propose_person: action mode is an owner's",
    ],
    [
      "propose_settings",
      { change: { op: "add_closure", date: "2026-12-25", note: "Christmas" } },
      "only an owner or the workspace's partner can change the workspace's settings; say so, and that one of them can ask",
      null,
    ],
    [
      "propose_team",
      { action: "invite", email: "ada@example.com", role: "viewer" },
      "only an owner can invite someone to the team; say so, and that an owner can ask",
      "propose_team: action invite is an owner's",
    ],
  ];
  /** The builder, past the registry: the action's own, or the tool's one. */
  const builder = (name, input) => {
    const def = READ_DEFS.concat(ACT_DEFS).find((d) => d.name === name);
    const { action = "", ...rest } = input;
    return (tc) => def.actions[action].build(tc, action ? rest : input);
  };
  for (const [name, input, refusal, registry] of ASKS) {
    const { ctx, tc } = as("operator");
    const out = await buildProposal(tc, name, input);
    assert.deepEqual(
      [out.proposal, out.isError, JSON.parse(out.result).error],
      [null, true, registry ?? refusal],
      name,
    );
    const own = await builder(name, input)(tc);
    assert.equal(JSON.parse(own.result).error, refusal, `${name}: its builder's own check stays`);
    assert.deepEqual(ctx.supabase.seen, [], `${name}: an operator is refused before anything is read`);
  }
  // REGRESSION (D7): an operator used to be handed these three cards, which the palette gated and the routes refused.
  const partner = as("partner").tc;
  const settings = await buildProposal(partner, "propose_settings", ASKS[1][1]);
  assert.equal(settings.isError, false, settings.result);
  assert.deepEqual([settings.proposal.kind, settings.proposal.needs], ["settings", "partner"]);
  for (const [name, input, refusal, registry] of [ASKS[0], ASKS[2]]) {
    assert.equal(JSON.parse((await buildProposal(partner, name, input)).result).error, registry, name);
    assert.equal(JSON.parse((await builder(name, input)(partner)).result).error, refusal, name);
  }
  // An owner gets all three, each needing its route's role and wearing its spec's undo words.
  const owner = as("owner").tc;
  const made = [];
  for (const [name, input] of ASKS) {
    const out = await buildProposal(owner, name, input);
    assert.equal(out.isError, false, `${name}: ${out.result}`);
    made.push([out.proposal.kind, out.proposal.needs, out.proposal.undo]);
  }
  assert.deepEqual(made, [
    ["person_mode", "owner", "Set it back"],
    ["settings", "partner", "Put the previous settings back"],
    ["invite", "owner", null],
  ]);
});

test("every card's role and undo words are its spec's: a wake's card offers no undo, a snooze's offers Wake (D8)", async () => {
  const t = tables({
    conversations: [
      conversation(C1),
      conversation(C2, { state: "snoozed", snooze_until: iso(NOW.getTime() + 86_400_000), assignee_user_id: USER }),
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const card = async (verb, id) =>
    (await buildProposal(tc, "propose_thread_verb", { conversation_id: id, verb })).proposal;
  const cards = [
    await card("take_over", C1),
    await card("hand_back", C2),
    await card("snooze", C1),
    await card("wake", C2),
  ];
  assert.deepEqual(
    cards.map((p) => [p.payload.verb, p.needs, p.undo]),
    [
      ["take_over", "operator", "Hand back"],
      ["hand_back", "operator", "Take over again"],
      ["snooze", "operator", "Wake"],
      ["wake", "operator", null],
    ],
    "REGRESSION: a woken thread's card offered 'Snooze again', a snooze with no until that core always refused",
  );
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
    // As the table holds them: every member row carries its workspace (00044), which the send reads every list by.
    segment_members: [
      { segment_id: S_REG, contact_id: ANA, tenant_id: A },
      { segment_id: S_REG, contact_id: LUIS, tenant_id: A },
      { segment_id: S_WALK, contact_id: LUIS, tenant_id: A },
    ],
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
  /** What the model is told when it proposes an offer to one of the lists: no card, and why. */
  const refusal = async (audience_id) => {
    const r = await buildProposal(tc, "propose_campaign", {
      action: "broadcast",
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

test("REGRESSION: campaigns.audiences tells who said yes from who can be sent it -- 'said_yes_to_offers' was the reach, so a yes with no number to send to read as nobody's yes", async () => {
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
  const out = await runTool(tc, { name: "campaigns", input: { action: "audiences" } });
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
      READ_TOOLS.find((d) => d.name === "campaigns").description.includes(name),
      `and so does the tool's description: ${name}`,
    );
  }
});

test("REGRESSION: campaigns.audiences counts everyone and every member, and names a calendar's lists only with a calendar -- it read the first thousand people with no appointments, and one select of members, so past a thousand it said less than the send enrols", async () => {
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
  const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), {
    name: "campaigns",
    input: { action: "audiences" },
  });
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

test("the deal lists reach Ask only where deals are on -- campaigns.audiences and people.search filtered People's lists on the calendar alone, so a salon was offered Proposal out and Clients, each counting nobody", async () => {
  const DEAL_LISTS = ["consultation_booked", "proposal_out", "clients", "deal_ended"];
  const ask = async (t) => {
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "campaigns", input: { action: "audiences" } });
    assert.equal(out.isError, false, out.result);
    const ids = JSON.parse(out.result).audiences.map((a) => a.audience_id);
    const clients = await runTool(tc, { name: "people", input: { action: "search", query: "", list: "clients" } });
    return { named: DEAL_LISTS.filter((id) => ids.includes(id)), clients: JSON.parse(clients.result) };
  };
  // Not asked how its customers buy, and no deal: a salon. None of the four is named.
  const salon = await ask(tables());
  assert.deepEqual(salon.named, [], "REGRESSION: the deal lists were offered where deals are not on");
  assert.match(salon.clients.error, /deals are on/, "and the narrowing says why, instead of nobody");
  assert.match(salon.clients.error, /How customers buy.*Some get a proposal first/, "in the words of the switch");
  assert.deepEqual(salon.clients.people, []);
  // A deal on file switches nothing (0008): the answer does.
  const deal = {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9",
    tenant_id: A,
    contact_id: ANA,
    service: "Ad management",
    stage: "proposed",
    proposed_at: iso(NOW.getTime() - 86_400_000),
    created_at: iso(NOW.getTime() - 86_400_000),
  };
  const booking = await ask(
    tables({ tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "booking" }], deals: [deal] }),
  );
  assert.deepEqual(booking.named, [], "a workspace whose customers book keeps its deals out of sight");
  // The workspace says some customers get a proposal first: the three lists the answer alone makes. Consultation
  // booked also needs a calendar and a consult-first service, and this workspace has neither.
  const agency = await ask(tables({ tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }] }));
  assert.deepEqual(agency.named, ["proposal_out", "clients", "deal_ended"]);
  assert.equal(agency.clients.error, undefined, agency.clients.error);
  assert.deepEqual(agency.clients.people, [], "the list is offered; nobody is a client yet");
});

test("Ask reaches any list by its reference: a People list or one of the workspace's own, to search, to count and to propose, and one it can't count says why (decision 0009)", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_CAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const S_BAD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
  const t = tables({
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars", rule: null },
      // A rule that reads the calendar, in a workspace with none connected: it can't be counted here.
      {
        id: S_CAL,
        tenant_id: A,
        name: "Lapsed regulars",
        rule: { all: [{ field: "last_visit", op: "more_than", days: 60 }] },
      },
      // A rule this version can't read.
      { id: S_BAD, tenant_id: A, name: "From the future", rule: { v: 3, all: [{ field: "future_fact" }] } },
    ],
    segment_members: [
      { segment_id: S_REG, contact_id: LUIS, tenant_id: A },
      { segment_id: S_REG, contact_id: ROSA, tenant_id: A },
    ],
  });
  const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
  const run = async (name, input) => JSON.parse((await runTool(tc, { name, input })).result);

  // The audiences carry each list's token; one of the workspace's own that can't be counted says why, with no counts.
  const { audiences } = await run("campaigns", { action: "audiences" });
  const byLabel = Object.fromEntries(audiences.map((a) => [a.label, a]));
  assert.equal(byLabel.Regulars.list, `list:${S_REG}`);
  assert.equal(byLabel["Phoned only"].list, "seg:phoned_only");
  assert.match(byLabel["Lapsed regulars"].cannot_count, /reads your calendar/);
  assert.equal(byLabel["Lapsed regulars"].can_be_sent_offers, undefined, "no count it can't stand behind");
  assert.match(byLabel["From the future"].cannot_count, /written by a newer version/);

  // Search by any list: its token, or a People list's bare id.
  const regulars = await run("people", { action: "search", query: "", list: `list:${S_REG}` });
  assert.deepEqual(regulars.people.map((p) => p.name).sort(), ["Luis Mora", "Rosa Diaz"]);
  assert.equal(regulars.list, `list:${S_REG}`);
  assert.deepEqual((await run("people", { action: "search", query: "", list: "seg:phoned_only" })).people, []);
  assert.match(
    (await run("people", { action: "search", query: "", list: `list:${S_CAL}` })).error,
    /Lapsed regulars: .*calendar/,
  );
  assert.match(
    (await run("people", { action: "search", query: "", list: "list:bbbbbbbb-bbbb-4bbb-8bbb-000000000000" })).error,
    /no such list/,
  );

  // Propose a broadcast to a saved list and to a People list alike; one it can't count is refused with why.
  const tpl = {
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
  };
  t.templates = [tpl];
  const propose = (audience_kind, audience_id) =>
    buildProposal(tc, "propose_campaign", {
      action: "broadcast",
      template_id: TPL,
      audience_kind,
      audience_id,
      params: [],
    });
  const toRegulars = await propose("saved", S_REG);
  assert.equal(toRegulars.isError, false, toRegulars.result);
  assert.deepEqual([toRegulars.proposal.payload.audience_label, toRegulars.proposal.payload.count], ["Regulars", 1]);
  // A playbook on any list (00168): a saved list as a win-back, its list and class carried to the commit.
  const onRegulars = await buildProposal(tc, "propose_campaign", {
    action: "playbook",
    trigger: "saved_list",
    list: `list:${S_REG}`,
    policy_class: "reengage",
    template_id: TPL,
    params: [],
  });
  assert.equal(onRegulars.isError, false, onRegulars.result);
  assert.deepEqual(
    [
      onRegulars.proposal.payload.list_id,
      onRegulars.proposal.payload.list_key,
      onRegulars.proposal.payload.policy_class,
    ],
    [S_REG, null, "reengage"],
  );
  assert.equal(onRegulars.proposal.payload.candidates, 1, "Rosa: on the list, a yes to offers and a number");
  const onMine = await buildProposal(tc, "propose_campaign", {
    action: "playbook",
    trigger: "saved_list",
    list: "seg:waiting_on_you",
    template_id: TPL,
    params: [],
  });
  assert.equal(onMine.isError, true);
  assert.match(JSON.parse(onMine.result).error, /a playbook runs with no one looking/);
  const toCal = await propose("saved", S_CAL);
  assert.equal(toCal.isError, true);
  assert.match(JSON.parse(toCal.result).error, /can't be counted here: This list reads your calendar/);
});

test("a gated list's refusal names the condition that failed: with a calendar and deals on but no consult-first service, Consultation booked is refused for the service alone", async () => {
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
    tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }],
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
    const listed = await runTool(tc, { name: "campaigns", input: { action: "audiences" } });
    assert.equal(listed.isError, false, listed.result);
    const ids = JSON.parse(listed.result).audiences.map((a) => a.audience_id);
    assert.ok(ids.includes("booked"), "the calendar was read: its lists are offered");
    assert.ok(
      ids.includes("clients") && !ids.includes("consultation_booked"),
      "deals are a thing; the consultation list needs the service",
    );
    const consult = JSON.parse(
      (await runTool(tc, { name: "people", input: { action: "search", query: "", list: "consultation_booked" } }))
        .result,
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

test("calendar.week reads the people it names: a person on the calendar enters the read set, so the answer may name them and open their profile (F5)", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e2",
    "DTSTART:20260915T140000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Estimate",
    "DESCRIPTION:Call +15555550101 first",
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
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "calendar", input: { action: "week", day: "tomorrow" } });
    assert.equal(out.isError, false, out.result);
    assert.equal(
      JSON.parse(out.result).note,
      "Taken is the owner's own calendar; open is what the receptionist would offer a caller.",
      "the note keeps the rows' facts; that nothing is booked from here is the tool's description now (PR 3.3)",
    );
    assert.ok(
      READ_TOOLS.find((d) => d.name === "calendar").description.includes("nothing is booked from here"),
      "the description says nothing is booked from here",
    );
    assert.deepEqual(
      JSON.parse(out.result).days[0].taken.map((b) => b.person && b.person.contact_id),
      [LUIS],
      "the event names Luis by his number",
    );
    assert.deepEqual(
      [...tc.read.person.values()].map((r) => [r.id, r.route]),
      [[LUIS, `clients/${LUIS}`]],
      "he is a row read, opened at his profile; nobody else is",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("calendar.week reads the board as its page reads it (ledger #11): with no day asked, the page's own week from its Monday, not today alone, or as many days from that Monday as were asked for; a day asked is that day, as before; the zone and the settings the turn already read are not read again; and nothing is written, even for an owner whose calendar names someone People does not hold", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:w1",
    "DTSTART:20260916T190000Z",
    "DTEND:20260916T200000Z",
    "SUMMARY:Estimate",
    "DESCRIPTION:Call +15555550199 first",
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
  });
  // A Wednesday at 10:00 in New York: this week's Monday is two days back.
  const WEDNESDAY = new Date("2026-09-16T14:00:00Z");
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const made = [];
    const ctx = ctxFor(t, {
      ...RPCS,
      create_person: (a) => {
        made.push(a);
        return { contact_id: "p-new", existed: false };
      },
    });
    // The Ask route reads the workspace's facts, config, policies and sells_by through the turn's readers first.
    const rc = readerContext(ctx, { tenantId: A, role: "owner" }, WEDNESDAY);
    await Promise.all(
      [workspaceReads.facts, workspaceReads.config, workspaceReads.policies, workspaceReads.sellsBy].map((r) =>
        load(rc, r, undefined),
      ),
    );
    const before = ctx.supabase.seen.length;
    const tc = newToolContext(ctx, A, "owner", TZ, WEDNESDAY, rc);
    const week = await runTool(tc, { name: "calendar", input: { action: "week", day: "" } });
    assert.equal(week.isError, false, week.result);
    const read = JSON.parse(week.result);
    assert.deepEqual(
      read.days.map((d) => d.day),
      ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      "the week from its Monday, as the Calendar page opens",
    );
    assert.deepEqual(
      read.days.find((d) => d.day === "2026-09-16").taken.map((b) => [b.title, b.person]),
      [["Estimate", null]],
      "the appointment, naming nobody People holds",
    );
    assert.deepEqual(
      ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)),
      ["rpc:people_list", "policies.select"],
      "everyone to match the appointments to, and nothing the turn already read: no tenants, no tenant_config",
    );
    assert.deepEqual(made, [], "nobody put in People: Ask never writes");
    assert.ok(
      !ctx.supabase.seen.some(
        (q) => q.rpc === "create_person" || ["insert", "update", "upsert", "delete"].includes(q.op),
      ),
    );
    const threeDays = await runTool(tc, { name: "calendar", input: { action: "week", day: "", days: 3 } });
    assert.deepEqual(
      JSON.parse(threeDays.result).days.map((d) => d.day),
      ["2026-09-14", "2026-09-15", "2026-09-16"],
      "days without a day: that many from the page's Monday",
    );
    // A null on days is absent before the parse (PR 3.1, decision 1): the handler sees no days and gives the page's
    // week, where it once read the null as one day -- the one value the null-strip changed.
    const nullDays = await runTool(tc, { name: "calendar", input: { action: "week", day: "", days: null } });
    assert.equal(JSON.parse(nullDays.result).days.length, 7, "no days asked is the page's week");
    const tomorrow = await runTool(tc, { name: "calendar", input: { action: "week", day: "tomorrow" } });
    assert.deepEqual(
      JSON.parse(tomorrow.result).days.map((d) => d.day),
      ["2026-09-17"],
      "a day asked is that day",
    );
    assert.equal(
      ctx.supabase.seen.slice(before).filter((q) => q.table === "tenants" || q.table === "tenant_config").length,
      0,
      "the tenant and its settings are the turn's: read by the route before any tool, and never again",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("calendar.openings is the palette's own read (ledger #13): the service asked for is cut where the route cuts it, at 160, so a question that names the service past its eightieth character still reaches it; the zone and the settings the turn already read are not read again", async () => {
  const base = tables();
  const profile = {
    ...base.tenant_config[0].config.brain.profile,
    services: [{ name: "Moving estimate", duration_min: 60 }],
  };
  const t = tables({
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, brain: { ...base.tenant_config[0].config.brain, profile } },
      },
    ],
  });
  const asked =
    "Please look for any free time later this week, or else early next week if you can, for a moving estimate";
  assert.ok(asked.toLowerCase().indexOf("moving estimate") >= 80, "the service is named past the eightieth character");
  const ctx = ctxFor(t);
  // The Ask route reads the workspace's facts, config, policies and sells_by through the turn's readers first.
  const rc = readerContext(ctx, { tenantId: A, role: "operator" }, NOW);
  await Promise.all(
    [workspaceReads.facts, workspaceReads.config, workspaceReads.policies, workspaceReads.sellsBy].map((r) =>
      load(rc, r, undefined),
    ),
  );
  const before = ctx.supabase.seen.length;
  const tc = newToolContext(ctx, A, "operator", TZ, NOW, rc);
  const out = await runTool(tc, { name: "calendar", input: { action: "openings", day: "", service: asked } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.equal(read.service, "Moving estimate", "cut at 80, the question named no service at all");
  assert.equal(read.state, "no_calendar");
  assert.deepEqual(
    ctx.supabase.seen.slice(before),
    [],
    "nothing read: the zone and the settings were the turn's, and no calendar is connected",
  );
});

test("report reads what the Reports page reads (ledger #1): the series, then the booking line and the deals beside it, once a turn, with the calendar's zone and settings and how the workspace's customers buy taken from the turn; the booking line and the Deals section in the page's own words beside the numbers it gave before", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
  const DAY = 86_400_000;
  const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
  // The booking line and the deals count by the server's clock, as the page's own route does.
  const now = Date.now();
  const key = (ms) => new Date(ms).toISOString().slice(0, 10);
  const quiet = {
    messages_in: 0,
    conversations: 0,
    answered_ai: 0,
    answered_you: 0,
    unanswered: 0,
    out_ai: 0,
    out_you: 0,
    escalations: 0,
    calls: 0,
    call_seconds: 0,
    new_contacts: 0,
  };
  /** report_series for `days`: two periods of quiet days, the newest today. */
  const series = (days) => ({
    timezone: TZ,
    days,
    span_days: days * 2,
    today: key(now),
    series: Array.from({ length: days * 2 }, (_, i) => ({ day: key(now - (days * 2 - 1 - i) * DAY), ...quiet })),
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const ics = (ms) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  // Rosa wrote yesterday and has a visit the day after tomorrow; she became a client, found as a lead, five days ago.
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:r1",
    `DTSTART:${ics(now + 2 * DAY)}`,
    `DTEND:${ics(now + 2 * DAY + 3_600_000)}`,
    "SUMMARY:Rosa · Estimate",
    "DESCRIPTION:+15555550100",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const rosa = {
    id: CLIENT,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+15555550100",
    email: null,
    came_from: "lead",
    last_inbound_at: new Date(now - DAY).toISOString(),
  };
  const won = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
    tenant_id: A,
    contact_id: CLIENT,
    stage: "won",
    proposed_at: new Date(now - 5 * DAY).toISOString(),
    decided_at: null,
    amount_cents: 250_000,
    per: "month",
    currency: "usd",
    lost_reason: null,
  };
  const base = tables();
  const world = (calendar, sellsBy = "proposal") =>
    tables({
      tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: sellsBy }],
      tenant_config: [
        {
          ...base.tenant_config[0],
          config: {
            ...base.tenant_config[0].config,
            ...(calendar ? { calendar: { ical_url: "https://calendar.example/harbor.ics" } } : {}),
          },
        },
      ],
      deals: [won],
    });
  const rpcs = { ...RPCS, report_series: (a) => series(a.p_days), people_list: () => [rosa] };
  /** A turn over `t` with the Ask route's own reads made first, and report run in it: its answer and what it asked. */
  const turnOver = async (t) => {
    const ctx = ctxFor(t, rpcs);
    const rc = readerContext(ctx, { tenantId: A, role: "operator" }, NOW);
    await Promise.all(
      [workspaceReads.facts, workspaceReads.config, workspaceReads.policies, workspaceReads.sellsBy].map((r) =>
        load(rc, r, undefined),
      ),
    );
    const before = ctx.supabase.seen.length;
    const out = await runTool(newToolContext(ctx, A, "operator", TZ, NOW, rc), {
      name: "report",
      input: { days: 7 },
    });
    assert.equal(out.isError, false, out.result);
    const asked = ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));
    return { read: JSON.parse(out.result), asked, rc, ctx };
  };
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const { read, asked, rc, ctx } = await turnOver(world(true));
    assert.deepEqual(asked, [
      "rpc:report_series",
      // Everyone, once, for the booking line and the deals alike.
      "rpc:people_list",
      "policies.select",
      // The calendar's zone and settings for the booking line, and how the workspace's customers buy, are the
      // turn's: none read again. The deals.
      "deals.select",
    ]);
    assert.equal(
      asked.filter((x) => x === "tenants.select" || x === "tenant_config.select").length,
      0,
      "the tenant and its settings: the turn's, never read again",
    );
    // The page's own builders over the page's own payload, as the bridge applies them; the same read, once a turn.
    const page = (await load(rc, reportReader, { days: 7 })).data;
    assert.equal(ctx.supabase.seen.filter((q) => q.rpc === "report_series").length, 1, "read once a turn");
    const vm = toReportVM(page.report);
    const booking = toBookingReportVM(page.booking);
    const deals = toDealReportVM(page.deals, vm.rangeLabel);
    assert.equal(read.range, vm.rangeLabel);
    assert.deepEqual(
      read.tiles,
      vm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
      "the numbers it gave before, from the same builder",
    );
    assert.equal(read.booking, booking.headline);
    assert.equal(read.booking, "1 of 1 booked", "Rosa wrote, and has a visit on the calendar");
    assert.deepEqual(read.deals, {
      headline: deals.headline,
      outcomes: deals.outcomes.rows.map((o) => `${o.label}: ${o.value}`),
      lines: deals.lines.map((l) => l.text),
      stock: deals.stock,
    });
    assert.equal(read.deals.stock, "1 client now · $2,500 a month.");
    assert.ok(read.deals.lines.includes("Your new client came from Leads."), read.deals.lines.join(" | "));
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
  // No calendar: the line says why there is nothing to count, in the page's words.
  const bare = await turnOver(world(false));
  assert.equal(bare.read.booking, "Connect your calendar under Settings › Business to see who booked.");
  // Where the workspace's customers book, the page draws no Deals section, and the deals are not even read.
  const booked = await turnOver(world(false, "booking"));
  assert.equal(booked.read.deals, null);
  assert.ok(!booked.asked.includes("deals.select"));
});

test("REGRESSION: campaigns.playbooks tells who said yes from who a run can reach -- 'said_yes_now' was the reach, so a moment whose yes had no number read as nobody's", async () => {
  const tc = newToolContext(ctxFor(tables(), { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
  const out = await runTool(tc, { name: "campaigns", input: { action: "playbooks" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.ok(
    read.note.startsWith("A run is a broadcast, and ") && !read.note.includes("say so"),
    "the note keeps the rows' facts; what to say of a zero, and that nothing ran, are the description's now (PR 3.3)",
  );
  assert.ok(
    READ_TOOLS.find((d) => d.name === "campaigns").description.includes("nothing has run because it was read"),
    "the description says nothing ran because it was read",
  );
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
      READ_TOOLS.find((d) => d.name === "campaigns").description.includes(name),
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
    const r = await buildProposal(tc, "propose_campaign", {
      action: "playbook",
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

test("what the model reads before any broadcast tells nobody's yes from a yes with no number to send to: since PR 3.3 the rule is campaigns.audiences' and propose_campaign.broadcast's descriptions, and no rule of the prompt's", () => {
  assert.ok(!ASK_RULES.some((r) => r.includes("never propose a broadcast to nobody")), "out of the rules");
  const audiences = READ_TOOLS.find((d) => d.name === "campaigns").description;
  assert.ok(audiences.includes(NO_NUMBER_REACH), audiences);
  assert.ok(audiences.includes("read before any broadcast"), audiences);
  const broadcast = ACT_TOOLS.find((d) => d.name === "propose_campaign").description;
  assert.ok(broadcast.includes("reading campaigns with action audiences first"), broadcast);
  assert.ok(broadcast.includes("or the ones who did have no number to send to"), broadcast);
  assert.ok(broadcast.includes("never propose a broadcast to nobody"), broadcast);
});

test("the answers the model is shown fit the format key for key, ride in the cached block, and the count's breakdown adds up", () => {
  const fits = (s, v, path) => {
    if (s.enum) return assert.ok(s.enum.includes(v), `${path}: ${v}`);
    if (s.type === "array") return v.forEach((x, i) => fits(s.items, x, `${path}[${i}]`));
    if (s.type !== "object") return assert.equal(typeof v, s.type, path);
    assert.deepEqual(Object.keys(v).sort(), Object.keys(s.properties).sort(), path);
    for (const k of Object.keys(s.properties)) fits(s.properties[k], v[k], `${path}.${k}`);
  };
  const system = stableSystem(workspaceFacts("Harbor", TZ, null, []));
  for (const [question, example] of ASK_EXAMPLES) {
    fits(ASK_ANSWER_FORMAT, example, question);
    assert.ok(system.includes(JSON.stringify(example)), `${question} is in the cached block`);
  }
  const week = normalizeAnswer(JSON.stringify(ASK_EXAMPLES[0][1]), emptyReadSet(), "en");
  assert.equal(week.ok && week.answer.show.breakdown?.total, 16, "7 + 3 + 6 is 16, so it draws");
  assert.ok(
    !ASK_RULES.some((r) => /\bfinish\b|navigate|citation/.test(r)),
    "no rule names what the answer no longer has",
  );
});

test("the real ports are the real modules, and an override reaches only the field it names", async () => {
  const real = askPorts();
  assert.deepEqual(Object.keys(real).sort(), ["context", "propose", "round", "shape", "tool"]);
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

test("REGRESSION: a call on Today opens where the Today page opens it -- today said conversations/<id> where the call is conversations/cv-<id>", async () => {
  // A caller gone in six seconds with nothing: the simplest call worth an ear (contracts today.ts, abandonedCall).
  const quick = call(K2, {
    retell_call_id: "r2",
    started_at: iso(NOW.getTime() - 3600_000),
    ended_at: iso(NOW.getTime() - 3594_000),
    duration_ms: 6_000,
    summary: null,
  });
  const ctx = ctxFor(tables({ calls: [quick] }), { ...RPCS, metrics_summary: () => METRICS });
  const out = await runTool(newToolContext(ctx, A, "operator", TZ, NOW), { name: "today", input: {} });
  assert.equal(out.isError, false, out.result);
  const [row] = JSON.parse(out.result).calls.rows;
  assert.deepEqual(
    [row.call_id, row.route],
    [K2, `conversations/cv-${K2}`],
    "the call's own id, and the route calls.list and calls.get give it",
  );
  const listed = JSON.parse(
    (
      await runTool(newToolContext(ctx, A, "operator", TZ, NOW), {
        name: "calls",
        input: { action: "list", filter: "today" },
      })
    ).result,
  );
  assert.equal(listed.calls.find((c) => c.call_id === K2)?.route, row.route, "one route for one call, whichever tool");
});

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
  const out = await runTool(tc, { name: "today", input: {} });
  assert.equal(out.isError, false, out.result);
  const today = JSON.parse(out.result);

  assert.ok(!("drafts_about_to_send" in today), "no field on Today claims to carry drafts");
  assert.doesNotMatch(
    out.result,
    /draft/i,
    "a Today read holds no draft of any kind: the snapshot's held_drafts and inbox.list filter=held do",
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

  // inbox.list: the count is of everything that matched, not of what the cap kept, and every row names its wire.
  const listed = JSON.parse((await runTool(tc, { name: "inbox", input: { action: "list", filter: "recent" } })).result);
  assert.equal(listed.total_matching, listed.threads.length);
  assert.ok(
    listed.threads.every((th) => typeof th.channel === "string" && th.channel.length > 0 && !("tags" in th)),
    "a wire on every row; no field that never carried anything",
  );
});

test("the day is read once a turn, each tool as its page reads it: today, inbox.list and calls.list in one round read the conversations twice at most and the calls once; Today counts the customer waiting past the newest hundred as the Today page does, the Inbox fetches their thread and needs_you keeps it first past the cap, recent is the newest twenty, and the missed call past the newest forty is there", async () => {
  // A hundred threads newer than the one still waiting on a person: the Inbox fetches that one by its id (ledger #6),
  // the Today page does not. Twenty-one of the hundred wait on a person too, so needs_you runs past the cap of twenty.
  // And forty-five calls this morning whose oldest never connected (ledger #8: calls.list read the newest forty).
  const hundred = Array.from({ length: 100 }, (_, i) =>
    conversation(`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`, {
      last_message_at: iso(NOW.getTime() - (i + 1) * 60_000),
    }),
  );
  const waiting = conversation(C2, {
    last_message_at: iso(NOW.getTime() - 48 * 3600_000),
    contacts: { ...contact, display_name: "Quinn" },
  });
  const morning = Array.from({ length: 45 }, (_, i) =>
    call(`dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`, {
      retell_call_id: `r-${i}`,
      started_at: iso(NOW.getTime() - (i + 1) * 60_000),
      ...(i === 44 ? { status: "not_connected", duration_ms: null } : {}),
    }),
  );
  const escalation = (id, conversation_id, created_at) => ({
    id,
    tenant_id: A,
    conversation_id,
    reason: "human_token",
    details: "asked for a person",
    state: "open",
    created_at,
  });
  const escalations = [
    // The quiet thread's, the oldest: an hour ago. The twenty-one inside the hundred asked in the last half hour.
    escalation(E1, C2, iso(NOW.getTime() - 3600_000)),
    ...hundred
      .slice(0, 21)
      .map((c, i) =>
        escalation(
          `eeeeeeee-eeee-4eee-8eee-${String(100 + i).padStart(12, "0")}`,
          c.id,
          iso(NOW.getTime() - (i + 1) * 60_000),
        ),
      ),
  ];
  const ctx = ctxFor(tables({ conversations: [...hundred, waiting], escalations, calls: morning }), {
    ...RPCS,
    metrics_summary: () => METRICS,
  });
  const s = scripted([
    ROUND([
      tool("today", {}),
      tool("inbox", { action: "list", filter: "needs_you" }),
      tool("inbox", { action: "list", filter: "recent" }, "t-recent"),
      tool("calls", { action: "list", filter: "missed" }),
    ]),
    ROUND([answer("Twenty-two people are waiting on you, and one call never connected.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    ["conversations", "calls", "escalations", "tenants"].map(selects),
    [2, 1, 1, 0],
    "the newest hundred once, shared; the escalated one past it once, for the Inbox; the calls and the escalations once; and no tenant: the zone is the turn's",
  );
  const out = Object.fromEntries(
    s.requests[1].messages.at(-1).content.map((c) => [c.tool_use_id, JSON.parse(c.content)]),
  );
  const [longest] = out["t-today"].needs_you.rows;
  assert.equal(longest.route, `inbox/th-${longest.conversation_id}`, "a Today row says where it opens");
  assert.deepEqual(
    [out["t-today"].needs_you.count, longest.conversation_id, longest.who],
    [22, C2, "Unknown"],
    "Today counts the customer waiting past the newest hundred as the Today page does, whose thread it does not read: the longest wait, first",
  );
  const needs = out["t-inbox.list"];
  const [first] = needs.threads;
  assert.deepEqual(
    [needs.total_matching, needs.threads.length, first.conversation_id, first.who, first.state],
    [22, 20, C2, "Quinn", "needs you"],
    "the Inbox fetches the escalated thread past the newest hundred, and needs_you keeps it first, as the page does: the cap of twenty never drops it",
  );
  assert.deepEqual(
    needs.threads.slice(1).map((x) => x.conversation_id),
    hundred.slice(0, 19).map((c) => c.id),
    "then the hundred's own, in the Inbox's order",
  );
  assert.deepEqual(
    [out["t-recent"].total_matching, out["t-recent"].threads.map((x) => x.conversation_id)],
    [101, hundred.slice(0, 20).map((c) => c.id)],
    "recent is the newest twenty: the old escalated thread the Inbox's rows put first is not one of them",
  );
  assert.deepEqual(
    out["t-calls.list"].calls.map((x) => [x.call_id, x.outcome]),
    [[morning[44].id, "missed"]],
    "the forty-fifth call is read, as the Calls page reads a hundred",
  );
});

test("inbox.thread and calls.get read through the readers (ledger #5): the thread as its page reads it, its messages with their wire and their attachment, so a text thread's window is the text's rule and it says Text, and an email thread says Email; the open escalation is the one the Inbox shows, the oldest; the row once and the messages once in the turn; the call under the workspace's own filter; another workspace's thread or call is an error, never a row", async () => {
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
  const C4 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
  const C5 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
  const K3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc7";
  const M3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
  const M4 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4";
  const M6 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6";
  const M9 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9";
  const NEWER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7";
  const OLDER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8";
  const H = 3600_000;
  const earlier = (ms) => iso(NOW.getTime() - ms);
  // A text thread whose WhatsApp window, read from last_wa_inbound_at, closed a day ago: a text has no window.
  const texting = conversation(C2, { last_wa_inbound_at: earlier(48 * H), last_message_at: earlier(46 * H) });
  const texted = [
    message(M2, C2, {
      sender: "customer",
      channel: "sms",
      body: "Can I come at five?",
      created_at: earlier(47 * H),
      channel_ts: earlier(47 * H),
    }),
    message(M3, C2, {
      sender: "customer",
      channel: "sms",
      type: "media",
      body: null,
      media: {
        mime_type: "image/jpeg",
        fetch_state: "stored",
        caption: "this one",
        filename: null,
        storage_path: "t/c/m.jpg",
      },
      created_at: earlier(46 * H),
      channel_ts: earlier(46 * H),
    }),
  ];
  const escalation = (id, reason, ago) => ({
    id,
    tenant_id: A,
    conversation_id: C2,
    reason,
    details: null,
    state: "open",
    created_at: earlier(ago),
  });
  const t = tables({
    conversations: [
      conversation(C1),
      texting,
      conversation(C3, { last_wa_inbound_at: null }),
      conversation(C4, { tenant_id: B }),
      conversation(C5, {
        last_wa_inbound_at: null,
        contacts: { ...contact, display_name: null, phone_e164: null, email: "rosa@example.com" },
      }),
    ],
    messages: [
      message(M1, C1),
      ...texted,
      message(M4, C3, { sender: "customer", channel: "email", body: "Hello" }),
      message(M6, C4, { tenant_id: B }),
      message(M9, C5, { sender: "customer", channel: "email", body: "Is Saturday free?" }),
    ],
    escalations: [escalation(NEWER, "manual", H), escalation(OLDER, "human_token", 40 * H)],
    calls: [call(K1), call(K3, { tenant_id: B, retell_call_id: "r3" })],
  });

  const ctx = ctxFor(t);
  const s = scripted([
    ROUND([
      tool("inbox", { action: "thread", conversation_id: C2 }, "t-text"),
      tool("calls", { action: "get", call_id: K1 }, "t-call"),
    ]),
    ROUND([answer("Rosa texted a photo, and the text can be answered now.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select");
  assert.deepEqual(
    ["conversations", "messages", "escalations", "calls"].map((x) => selects(x).length),
    [1, 1, 1, 1],
    "the thread's row once, through the loader the page's scope uses; its messages once; the open escalations once; the call once",
  );
  assert.deepEqual(
    selects("calls")[0].filters,
    [
      ["eq", "tenant_id", A],
      ["eq", "id", K1],
    ],
    "the call under the workspace's own filter",
  );
  const out = Object.fromEntries(
    s.requests[1].messages.at(-1).content.map((c) => [c.tool_use_id, JSON.parse(c.content)]),
  );
  const text = out["t-text"];
  assert.deepEqual(
    [text.channel, text.window_open],
    ["Text", true],
    "the messages carry their wire: a text has no window, where WhatsApp's rule read this thread closed and named it WhatsApp",
  );
  assert.deepEqual(
    text.messages.map((m) => [m.from, m.text]),
    [
      ["customer", "Can I come at five?"],
      ["customer", "Photo: this one"],
    ],
    "and their attachment: a photo with its caption, where it read as an unnamed attachment",
  );
  assert.deepEqual(
    text.escalation,
    { id: OLDER, reason: "Customer asked for a person", details: null },
    "the open escalation the Inbox shows on the thread, the oldest, where it read the newest",
  );
  assert.deepEqual([out["t-call"].call_id, out["t-call"].who], [K1, "Rosa"]);

  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const email = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "thread", conversation_id: C3 } })).result,
  );
  assert.deepEqual(
    [email.channel, email.window_open],
    ["Email", true],
    "an email thread says Email, and an email may be answered whenever",
  );
  // A person reached only by email is their address, as the Inbox row names them and as this tool always said: the
  // thread's own payload carries no email, and its view model alone would say "Unknown".
  const byAddress = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "thread", conversation_id: C5 } })).result,
  );
  const inTheInbox = JSON.parse(
    (await runTool(tc, { name: "inbox", input: { action: "list", filter: "recent" } })).result,
  );
  assert.deepEqual(
    [byAddress.who, inTheInbox.threads.find((x) => x.conversation_id === C5).who],
    ["rosa@example.com", "rosa@example.com"],
  );

  // Another workspace's thread and call, which RLS would show a member of both: not here, in the tools' own words, and
  // not a read that failed.
  const elsewhere = ctxFor(t);
  const away = newToolContext(elsewhere, A, "operator", TZ, NOW);
  const { result: refused, lines } = await logged("ask_tool_failed", async () => [
    await runTool(away, { name: "inbox", input: { action: "thread", conversation_id: C4 } }),
    await runTool(away, { name: "calls", input: { action: "get", call_id: K3 } }),
  ]);
  assert.deepEqual(
    refused.map((x) => [x.isError, JSON.parse(x.result)]),
    [
      [true, { error: "no such conversation in this workspace" }],
      [true, { error: "no such call in this workspace" }],
    ],
  );
  assert.deepEqual(lines, [], "a row that is not here is not a failed read");
  assert.equal(elsewhere.supabase.seen.filter((q) => q.table === "messages").length, 0, "none of its messages is read");
  assert.ok(
    !away.read.thread.has(C4) && !away.read.conversation.has(C4) && !away.read.call.has(K3),
    "nothing of another workspace enters the read set",
  );
});

test("people.get is the person page's one read (ledger #3): the reader's one round, every read keyed on the person asked for at once and only their threads' own waiting for the ids; the config and sells_by the turn already read are not read again; read once a turn; the page's own view model over the page's payload, so the About rows and the timeline say what the profile says; another workspace's person is an error, never a row", async () => {
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const P2 = "abababab-abab-4aba-8aba-abababababa2";
  const C3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
  const wrote = iso(NOW.getTime() - 3600_000);
  const days = (n) => iso(NOW.getTime() - n * 86_400_000);
  // Rosa as people_list answers her: one thread, one call.
  const rosa = {
    id: P1,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+15555550100",
    email: null,
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
    last_call_at: iso(NOW.getTime() - 7200_000),
    call_count: 1,
    call_seconds: 200,
    first_contact_at: days(10),
    earliest_row_at: days(10),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
  };
  // Harbor's Rosa, and Bea, who is bayside's: people_list answers each for their own workspace alone.
  const rpcs = {
    ...RPCS,
    people_list: (a) =>
      a.p_tenant_id === A && a.p_contact_id === P1
        ? [rosa]
        : a.p_tenant_id === B && a.p_contact_id === P2
          ? [{ ...rosa, id: P2, display_name: "Bea", latest_conversation_id: C3 }]
          : [],
  };
  const t = tables({
    contacts: [
      { ...contact, tenant_id: A, erased_at: null },
      { ...contact, id: P2, display_name: "Bea", tenant_id: B, erased_at: null },
    ],
    conversations: [
      conversation(C1),
      conversation(C3, { tenant_id: B, contact_id: P2, contacts: { ...contact, id: P2, display_name: "Bea" } }),
    ],
    contact_identities: [{ contact_id: P1, channel: "whatsapp", external_id: "15555550100", created_at: days(10) }],
    // Where she came from, and a yes she gave: the profile says both; the tool's own read said neither.
    events: [
      {
        tenant_id: A,
        kind: "contact.added",
        subject_type: "contact",
        subject_id: P1,
        data: { source: "calendar", title: "Local move" },
        created_at: days(10),
      },
      {
        id: "ev-1",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P1,
        data: { consent: "opted_in", source: "customer_message", channel: "whatsapp", words: "START" },
        created_at: days(5),
      },
    ],
  });

  // The Ask route reads the workspace's facts, config, policies and sells_by through the turn's readers first.
  const ctx = ctxFor(t, rpcs);
  const rc = readerContext(ctx, { tenantId: A, role: "operator" }, NOW);
  await Promise.all(
    [workspaceReads.facts, workspaceReads.config, workspaceReads.policies, workspaceReads.sellsBy].map((r) =>
      load(rc, r, undefined),
    ),
  );
  const before = ctx.supabase.seen.length;
  const tc = newToolContext(ctx, A, "operator", TZ, NOW, rc);
  const out = await runTool(tc, { name: "people", input: { action: "get", contact_id: P1 } });
  assert.equal(out.isError, false, out.result);
  assert.equal(JSON.parse(out.result).route, `clients/${P1}`, "a profile says where it opens");
  const seen = ctx.supabase.seen.slice(before);
  const order = seen.map((q) => q.rpc ?? q.table);
  const waited = order.indexOf("messages");
  for (const read of [
    "people_list",
    "conversations",
    "calls",
    "policies",
    "events",
    "contacts",
    "deals",
    "contact_identities",
    "leads",
    "broadcast_recipients",
    "person_notes",
  ]) {
    const asked = order.indexOf(read);
    assert.ok(asked >= 0 && asked < waited, `REGRESSION: ${read} waited for another round (${order.join(", ")})`);
  }
  assert.deepEqual(
    order.slice(waited),
    ["messages", "escalations", "decisions"],
    "only the threads' own reads wait, for their ids",
  );
  assert.deepEqual(
    ["people_list", "policies", "events"].map((x) => order.filter((o) => o === x).length),
    [1, 2, 2],
    "the row once; both reply modes; where she came from, and her consent changes",
  );
  const columns = (table) => seen.filter((q) => q.table === table).map((q) => q.columns);
  assert.deepEqual(
    [columns("tenants"), columns("tenant_config")],
    [["name, timezone"], ["config"]],
    "the config and sells_by are the turn's; only the calendar's own lookup, which is not a reader, reads the zone and the config, as the page's read does",
  );
  const reads = ctx.supabase.seen.length;
  await runTool(tc, { name: "people", input: { action: "get", contact_id: P1 } });
  assert.equal(ctx.supabase.seen.length, reads, "read once a turn: the second call is the first read");

  // The page's own view model over the page's own payload: GET contacts/:id, then toPersonVM for the member looking, as
  // the profile builds it (legacy-bridge/people-detail.ts).
  const page = await personRoute.GET.run(new Request(`http://localhost/api/v1/contacts/${P1}?workspace=${A}`), {
    ...ctxFor(t, rpcs),
    params: { id: P1 },
  });
  const vm = toPersonVM(page.person, TZ, NOW, USER);
  const said = JSON.parse(out.result);
  assert.deepEqual(
    said.about,
    vm.about.map((a) => `${a.k}: ${a.v}`),
    "the profile's About rows",
  );
  assert.deepEqual(
    said.timeline,
    vm.timeline
      .slice(0, 20)
      .map((i) => ({ day: i.day, time: i.time, kind: i.kind, who: i.who, text: i.text.slice(0, 240) })),
    "the profile's timeline",
  );
  assert.deepEqual(said.right_now, { title: vm.rightNow.title, detail: vm.rightNow.detail });
  assert.ok(
    said.about.some((a) => /^Added: .* · from your calendar \(Local move\)$/.test(a)),
    `where she came from, which the tool's own read never said: ${said.about}`,
  );
  assert.ok(
    said.timeline.some((i) => i.kind === "system" && i.text === "Added from your calendar (Local move)") &&
      said.timeline.some((i) => i.kind === "consent"),
    "and on the timeline, with the yes she gave",
  );
  assert.deepEqual([said.conversations.map((c) => c.conversation_id), said.calls.map((c) => c.call_id)], [[C1], [K1]]);
  assert.deepEqual(
    [tc.read.person, tc.read.thread, tc.read.conversation, tc.read.call].map((m) =>
      [...m.values()].map((r) => [r.id, r.route]),
    ),
    [
      [[P1, `clients/${P1}`]],
      [[C1, `inbox/th-${C1}`]],
      [[C1, `conversations/${C1}`]],
      [[K1, `conversations/cv-${K1}`]],
    ],
    "the person, each thread, each call: rows a citation may name, each where the reader said it opens",
  );

  // Bea is bayside's: a harbor turn is told she is not here, in the tool's own words, and nothing of hers is a row.
  const away = newToolContext(ctxFor(t, rpcs), A, "operator", TZ, NOW);
  const { result: refused, lines } = await logged("ask_tool_failed", () =>
    runTool(away, { name: "people", input: { action: "get", contact_id: P2 } }),
  );
  assert.deepEqual(
    [refused.isError, JSON.parse(refused.result)],
    [true, { error: "no such person in this workspace" }],
  );
  assert.deepEqual(lines, [], "a person who is not here is not a failed read");
  assert.deepEqual(
    Object.values(away.read).map((s) => s.size),
    Array(12).fill(0),
    "nothing of another workspace enters the read set, of any of the twelve kinds of row",
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

test("people.get says where the proposal lives (00154), so a card can carry the address into a reply; nothing when there is none, and nothing of a deal where deals are off (0008)", async () => {
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
  // The workspace says some customers get a proposal first (0008): a proposal is a deal's, and said only then.
  const dealsOn = [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }];
  const withLink = tables({
    tenants: dealsOn,
    contacts: [{ ...contact, tenant_id: A, erased_at: null, proposal_url: "https://docs.example.com/p/rosa" }],
  });
  const r = await runTool(newToolContext(ctxFor(withLink, rpcs), A, "operator", TZ, NOW), {
    name: "people",
    input: { action: "get", contact_id: P1 },
  });
  assert.equal(r.isError, false, r.result);
  const person = JSON.parse(r.result);
  assert.ok(person.about.includes("Proposal: docs.example.com"), `About: ${person.about}`);

  const without = await runTool(newToolContext(ctxFor(tables({ tenants: dealsOn }), rpcs), A, "operator", TZ, NOW), {
    name: "people",
    input: { action: "get", contact_id: P1 },
  });
  assert.equal(without.isError, false, without.result);
  assert.ok(!JSON.parse(without.result).about.some((a) => a.startsWith("Proposal:")), "none on file: no row");

  // The deal holds the proposal now (0008): its value in the Deal fact, and where its link lives -- the host, never
  // the address -- even where nothing is left on the person.
  const onDeal = {
    ...rosaRow,
    deal_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    deal_stage: "proposed",
    deal_service: "Local move",
    deal_proposed_at: iso(NOW.getTime() - 3 * 86_400_000),
    deal_decided_at: null,
    deal_ended_at: null,
    deal_amount_cents: 120000,
    deal_per: "once",
    deal_proposal_url: "https://www.quotes.example.com/p/rosa",
  };
  const dealt = await runTool(
    newToolContext(
      ctxFor(tables({ tenants: dealsOn }), { ...RPCS, people_list: () => [onDeal] }),
      A,
      "operator",
      TZ,
      NOW,
    ),
    { name: "people", input: { action: "get", contact_id: P1 } },
  );
  assert.equal(dealt.isError, false, dealt.result);
  const said = JSON.parse(dealt.result);
  const fact = said.facts.find((f) => f.startsWith("Deal: "));
  assert.match(
    fact,
    /^Deal: Proposal out \(Local move · Proposal out · since \w{3} \d+ · \$1,200 · proposal at quotes\.example\.com\)$/,
  );
  assert.ok(!fact.includes("https://"), "the host, never the address");
  assert.ok(said.about.includes("Proposal: quotes.example.com"), `About: ${said.about}`);

  // Where deals are off -- the workspace books, or was never asked -- no Deal fact, no proposal, no deal line.
  for (const tenants of [[{ id: A, name: "Harbor", timezone: TZ, sells_by: "booking" }], undefined]) {
    const off = await runTool(
      newToolContext(
        ctxFor(
          tables({
            ...(tenants ? { tenants } : {}),
            contacts: [{ ...contact, tenant_id: A, erased_at: null, proposal_url: "https://docs.example.com/p/rosa" }],
          }),
          { ...RPCS, people_list: () => [onDeal] },
        ),
        A,
        "operator",
        TZ,
        NOW,
      ),
      { name: "people", input: { action: "get", contact_id: P1 } },
    );
    assert.equal(off.isError, false, off.result);
    const p = JSON.parse(off.result);
    assert.ok(!p.facts.some((f) => f.startsWith("Deal:")), `no Deal fact: ${p.facts}`);
    assert.ok(!p.about.some((a) => a.startsWith("Proposal:")), `no proposal: ${p.about}`);
    assert.ok(!p.timeline.some((i) => i.kind === "deal"), "no deal on the timeline");
  }
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
    "a passed proposal sent again moves its own row",
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

  // A proposal's link, its value and the day it stands until (0008): the card says the value and where the link lives,
  // and carries each into the route's body; a pass says why.
  const linked = await p("propose_deal", {
    contact_id: MARIA,
    stage: "proposed",
    service: "Ads",
    amount_cents: 120000,
    per: "once",
    proposal_url: "docs.example.com/p/maria",
    valid_until: "2026-09-30",
  });
  assert.equal(linked.isError, false, linked.result);
  assert.deepEqual(
    [linked.proposal.payload.proposal_url, linked.proposal.payload.valid_until, linked.proposal.payload.amount_cents],
    ["https://docs.example.com/p/maria", "2026-09-30", 120000],
    "the link as the one normalizer stores it",
  );
  assert.equal(linked.proposal.summary, "Proposal out · Ads · $1,200 · docs.example.com");
  const passed = await p("propose_deal", { contact_id: MARIA, stage: "lost", lost_reason: "price" });
  assert.deepEqual([passed.proposal.payload.deal_id, passed.proposal.payload.lost_reason], ["d1", "price"]);
  assert.equal(passed.proposal.summary, "Passed · SEO · Price");
  assert.match(
    (await p("propose_deal", { contact_id: MARIA, stage: "proposed", proposal_url: "mailto:maria@example.com" }))
      .result,
    /proposal_url: That needs to be a web address, starting with https:\/\//,
  );
  assert.match(
    (await p("propose_deal", { contact_id: MARIA, stage: "proposed", valid_until: "2026-02-31" })).result,
    /valid_until must be a day, like 2026-09-30/,
  );
  assert.match(
    JSON.parse((await p("propose_deal", { contact_id: MARIA, stage: "lost", lost_reason: "banana" })).result).error,
    /^propose_deal: lost_reason Invalid option/,
    "a reason the schema does not list is refused by the schema (PR 3.1, D2)",
  );
  assert.match(
    (await p("propose_deal", { contact_id: MARIA, stage: "won", lost_reason: "price" })).result,
    /lost_reason goes only with stage lost/,
  );

  const bad = await p("propose_deal", { contact_id: MARIA, stage: "banana" });
  assert.equal(bad.isError, true);
  assert.match(
    JSON.parse(bad.result).error,
    /^propose_deal: stage Invalid option/,
    "a stage the schema does not list is refused by the schema (PR 3.1, D2)",
  );
  assert.match((await p("propose_deal", { contact_id: C2, stage: "won" })).result, /no such person/);
  assert.match(
    (await p("propose_deal", { contact_id: "c1", stage: "won" })).result,
    /contact_id must be an id a read returned/,
  );
  assert.ok(
    !tc.ctx.supabase.seen.some((q) => ["insert", "update", "upsert", "delete"].includes(q.op)),
    "a proposal reads; it never writes",
  );
});

test("propose_deal carries a next step with its day: the card says it, the body takes the words whole, and a step without its day, a day without a step, or a day not real or gone is refused in words", async () => {
  const MARIA = "cccccccc-cccc-4ccc-8ccc-cccccccccc31";
  const t = tables({
    contacts: [
      {
        id: MARIA,
        tenant_id: A,
        display_name: "Maria",
        wa_profile_name: null,
        phone_e164: "+15555550131",
        email: null,
        erased_at: null,
      },
    ],
    deals: [
      {
        id: "d1",
        tenant_id: A,
        contact_id: MARIA,
        stage: "proposed",
        service: "SEO",
        version: 3,
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "operator", TZ, NOW);
  const p = (input) => buildProposal(tc, "propose_deal", { contact_id: MARIA, stage: "won", ...input });
  // Monday 14 September in New York: Friday is the 18th.
  const words = "Send the onboarding form and book the kickoff call";
  const won = await p({ next_step: `  ${words} `, next_step_due: "2026-09-18" });
  assert.equal(won.isError, false, won.result);
  assert.deepEqual([won.proposal.step, won.proposal.payload.deal_id], [{ body: words, due_on: "2026-09-18" }, "d1"]);
  // Beside the payload, never in it: a tab from before the step hands the payload to the strict deal route whole.
  assert.deepEqual(
    Object.keys(won.proposal.payload).filter((k) => k.includes("step")),
    [],
    "REGRESSION: an old tab's deal was refused for the step's keys",
  );
  assert.equal(won.proposal.summary, `Client · SEO · Next step: ${words}, due Fri`);
  assert.equal(
    (await p({ next_step: "Call", next_step_due: "2026-09-14" })).proposal.summary,
    "Client · SEO · Next step: Call, due today",
  );
  const long = "Call ".repeat(40).trim();
  const clipped = (await p({ next_step: long, next_step_due: "2026-09-18" })).proposal;
  assert.equal(clipped.step.body, long, "the note keeps the words whole");
  assert.ok(clipped.summary.length < 140, "the card clips them at a word");
  assert.equal((await p({})).proposal.step, undefined, "no step: nothing beside the body");
  for (const [input, why] of [
    [{ next_step: "Call" }, /next_step needs next_step_due, the day it is due/],
    [{ next_step_due: "2026-09-18" }, /next_step_due goes only with next_step/],
    [{ next_step: "Call", next_step_due: "2026-09-31" }, /next_step_due must be a day, like 2026-09-30/],
    [{ next_step: "Call", next_step_due: "2026-09-13" }, /next_step_due must be today or later/],
    [{ next_step: "x".repeat(601), next_step_due: "2026-09-18" }, /next_step is at most 600 characters/],
  ]) {
    const r = await p(input);
    assert.equal(r.isError, true, JSON.stringify(input));
    assert.match(r.result, why);
  }
});

test("the proposal follow-up in Ask (0006): listed where deals are on and counted as the page counts it; proposed there once, with its link; refused where deals are off", async () => {
  const DAY = 86_400_000;
  const luis = peopleListRow({
    id: LUIS,
    display_name: "Luis Mora",
    phone_e164: "+15555550101",
    deal_id: "dl1",
    deal_stage: "proposed",
    deal_proposed_at: iso(NOW.getTime() - 10 * DAY),
    deal_proposal_url: "https://docs.example.com/proposal/luis",
    last_inbound_at: iso(NOW.getTime() - 40 * DAY),
    latest_wa_inbound_at: iso(NOW.getTime() - 40 * DAY),
  });
  const deals = [
    { id: "dl1", tenant_id: A, contact_id: LUIS, stage: "proposed", proposed_at: iso(NOW.getTime() - 10 * DAY) },
  ];
  const on = (over = {}) =>
    tables({ tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }], deals, ...over });
  const context = (t) => newToolContext(ctxFor(t, { ...RPCS, people_list: () => [luis] }), A, "owner", TZ, NOW);
  const listed = async (t) =>
    JSON.parse((await runTool(context(t), { name: "campaigns", input: { action: "playbooks" } })).result);
  const counts = (read) => {
    const x = read.triggers.find((y) => y.trigger === "proposal_waiting");
    return x && [x.said_yes_now, x.can_be_sent_now];
  };
  assert.deepEqual(counts(await listed(on())), [1, 1], "Luis waits, with his link and a yes");
  // Followed up already, by a playbook since deleted: counted out, as the page counts him.
  const link = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }];
  const followed = on({
    broadcasts: [
      {
        id: "old-run",
        tenant_id: A,
        playbook_id: null,
        state: "sent",
        scheduled_for: iso(NOW.getTime() - 3 * DAY),
        created_at: iso(NOW.getTime() - 3 * DAY),
        run_for: null,
        params: link,
      },
    ],
    broadcast_recipients: [
      { tenant_id: A, broadcast_id: "old-run", contact_id: LUIS, state: "sent", sent_at: iso(NOW.getTime() - 3 * DAY) },
    ],
  });
  assert.deepEqual(counts(await listed(followed)), [1, 0]);
  assert.equal(counts(await listed(tables({ deals }))), undefined, "deals off: not listed");
  // Proposed where deals are on, with its link; never where they are off, and never a second.
  const tpl = {
    id: TPL,
    tenant_id: A,
    channel: "whatsapp",
    name: "proposal_follow_up",
    language: "en_US",
    meta_status: "approved",
    category: "UTILITY",
    variables: [{ position: 1 }, { position: 2 }, { position: 3 }],
    body_preview: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}}.",
    hidden_at: null,
  };
  const propose = (t) =>
    buildProposal(context(t), "propose_campaign", { action: "playbook", trigger: "proposal_waiting" });
  // Said before anything else is read: a workspace whose customers book holds no follow-up's starter, and was told the
  // starter was not approved yet.
  assert.match((await propose(tables({ deals }))).result, /need deals/);
  assert.match((await propose(tables({ deals, templates: [tpl] }))).result, /need deals/);
  assert.match(
    (await propose(on({ templates: [tpl], playbooks: [{ id: "pb", tenant_id: A, trigger: "proposal_waiting" }] })))
      .result,
    /already has a proposal follow-up/,
  );
  const made = await propose(on({ templates: [tpl] }));
  assert.equal(made.isError, false, made.result);
  assert.deepEqual(
    [made.proposal.payload.policy_class, made.proposal.payload.params, made.proposal.payload.candidates],
    ["follow_up", link, 1],
  );
  // The card counts as the page does: Luis had his follow-up, so a run reaches nobody.
  const again = await propose({ ...followed, templates: [tpl] });
  assert.equal(again.isError, false, again.result);
  assert.equal(again.proposal.payload.candidates, 0);
});

/* ------------------------------------------------------------------------ the pool, once a turn (PR 1.6) */

/** An approved offer to everyone, with no values to fill. */
const OFFER = {
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
};

test("everyone in People is read once a turn, through the readers: a turn that lists the playbooks and the audiences and proposes a playbook and a broadcast reads every page of People once, and their reply modes once -- where the listing and the playbooks each read them -- a search by a list counts over that same pool, and a search by words reads its own page once; the zone and the settings once each, and the memo is gone from the tools' context", async () => {
  // A thousand and one people, each with a number and a yes to offers: People is read a page at a time.
  const many = Array.from({ length: 1001 }, (_, i) =>
    peopleListRow({
      id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`,
      display_name: `Person ${i}`,
      phone_e164: `+1555${String(1000000 + i)}`,
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
    }),
  );
  const doors = {
    ...RPCS,
    people_list: (a) =>
      a.p_query
        ? many.filter((p) => p.display_name.includes(a.p_query))
        : many.slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000)),
  };
  const ctx = {
    supabase: fakeDb(tables({ templates: [OFFER] }), {}, doors, { maxRows: 1000 }),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  assert.equal("memo" in tc, false, "the tools' context holds the turn's readers and nothing else to remember");
  const everyone = () =>
    ctx.supabase.seen.filter((q) => q.rpc === "people_list").map((q) => q.args.p_query ?? q.args.p_offset ?? 0);
  const replyModes = () =>
    ctx.supabase.seen.filter((q) => q.table === "policies" && q.columns === "subject_type, subject_id, mode").length;
  // The prefetch's pair for "start a win-back playbook for the quiet clients", then the two cards.
  for (const action of ["playbooks", "audiences"]) {
    const out = await runTool(tc, { name: "campaigns", input: { action } });
    assert.equal(out.isError, false, out.result);
  }
  const playbook = await buildProposal(tc, "propose_campaign", {
    action: "playbook",
    trigger: "quiet_30",
    template_id: TPL,
    params: [],
  });
  assert.equal(playbook.isError, false, playbook.result);
  const card = await buildProposal(tc, "propose_campaign", {
    action: "broadcast",
    template_id: TPL,
    audience_kind: "everyone",
    audience_id: null,
    params: [],
  });
  assert.equal(card.isError, false, card.result);
  assert.equal(card.proposal.payload.count, 1001, "every page, as the send enrols them");
  assert.deepEqual(
    [everyone(), replyModes()],
    [[0, 1000], 1],
    "every page of People once and the reply modes once, for the Playbooks page's pools and the audience pool alike, where each read its own",
  );
  const byList = await runTool(tc, { name: "people", input: { action: "search", query: "", list: "seg:phoned_only" } });
  assert.equal(byList.isError, false, byList.result);
  assert.deepEqual([everyone(), replyModes()], [[0, 1000], 1], "a list is counted over the same pool");
  const byWords = await runTool(tc, { name: "people", input: { action: "search", query: "Person 7" } });
  assert.equal(byWords.isError, false, byWords.result);
  assert.deepEqual(
    [everyone(), replyModes()],
    [[0, 1000, "Person 7"], 2],
    "a search by words reads the People page's own page, once, with its reply modes",
  );
  const reads = (key, columns) =>
    ctx.supabase.seen.filter(
      (q) =>
        (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`) === key && (columns === undefined || q.columns === columns),
    ).length;
  assert.deepEqual(
    [reads("tenants.select", "name, timezone"), reads("tenant_config.select")],
    [1, 1],
    "the zone and the settings once each, whichever read asked first",
  );
});

test("the assistant counts with the calendar too: a visit tomorrow on the owner's calendar is counted by campaigns.playbooks' reminder from the feed, over the same people the page counts, and the Bookings class's mode is said beside the others", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e-tomorrow",
    "DTSTART:20260915T140000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Colour",
    "DESCRIPTION:Rosa +15555550102",
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
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: () => threeAnswers() }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "campaigns", input: { action: "playbooks" } });
    assert.equal(out.isError, false, out.result);
    const read = JSON.parse(out.result);
    const reminder = read.triggers.find((x) => x.trigger === "visit_tomorrow");
    assert.deepEqual(
      [reminder.said_yes_now, reminder.can_be_sent_now],
      [1, 1],
      "Rosa's visit tomorrow, read from the feed: her yes to messages and her number",
    );
    assert.equal(read.modes.booking, "ask", "the Bookings class, which the reminder runs under, with no row: ask");
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

/* ------------------------------------------------- the three tools read what the pages read (PR 1.6) */

/**
 * Luis waits on a person; Rosa, whose WhatsApp name is Rosi, was last heard from six weeks ago. people_list as the
 * database answers p_query (00125): a name, a WhatsApp name or an address, or three digits of the number.
 */
const twoPeople = () => [
  peopleListRow({
    id: LUIS,
    display_name: "Luis Mora",
    phone_e164: "+15555550101",
    latest_conversation_id: C1,
    needs_human: true,
    open_escalation_reason: "human_token",
    open_escalation_since: iso(NOW.getTime() - 3_600_000),
  }),
  peopleListRow({
    id: ROSA,
    display_name: "Rosa Diaz",
    wa_profile_name: "Rosi",
    phone_e164: "+15555550182",
    latest_conversation_id: C2,
    last_message_at: iso(NOW.getTime() - 45 * 86_400_000),
    last_inbound_at: iso(NOW.getTime() - 45 * 86_400_000),
  }),
];
const peopleListMatching = (rows) => (a) => {
  if (a.p_tenant_id !== A) return [];
  if (!a.p_query) return rows;
  const q = a.p_query.toLowerCase();
  const digits = q.replace(/\D/g, "");
  return rows.filter(
    (r) =>
      [r.display_name, r.wa_profile_name, r.email].some((v) => (v ?? "").toLowerCase().includes(q)) ||
      (digits.length >= 3 && (r.phone_e164 ?? "").replace(/\D/g, "").includes(digits)),
  );
};
/** The workspace's contacts behind the rows, for the page's count of who matches. */
const contactsOf = (rows) =>
  rows.map((r) => ({
    id: r.id,
    tenant_id: A,
    display_name: r.display_name,
    wa_profile_name: r.wa_profile_name,
    email: r.email,
    phone_e164: r.phone_e164,
    erased_at: null,
  }));

test("people.search reads what the People page reads (ledger #7): one SQL page for the query, so a WhatsApp name and three digits of a number find who the page finds, where the old match on the name alone and four digits found nobody; the page's order and its count; each person in the People row's own words for where they stand; and the pool is never read", async () => {
  const rows = twoPeople();
  const ctx = ctxFor(tables({ contacts: contactsOf(rows) }), { ...RPCS, people_list: peopleListMatching(rows) });
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  const search = async (query) => {
    const out = await runTool(tc, { name: "people", input: { action: "search", query } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };
  const byWhatsAppName = await search("Rosi");
  assert.deepEqual(
    [byWhatsAppName.people.map((p) => p.name), byWhatsAppName.matches],
    [["Rosa Diaz"], 1],
    "her WhatsApp name finds her, as the page's search does; the name alone did not",
  );
  const byThreeDigits = await search("018");
  assert.deepEqual(
    [byThreeDigits.people.map((p) => p.contact_id), byThreeDigits.matches],
    [[ROSA], 1],
    "three digits of her number, as the page matches them; the old match wanted four",
  );
  const everyone = await search("");
  assert.deepEqual(
    [everyone.people.map((p) => p.contact_id), everyone.matches],
    [[LUIS, ROSA], 2],
    "no query is the page's first page, in the function's order, counted where the rows are",
  );
  // Where they stand, in the People row's own words: its builder, for the member asking (surface-data.ts personRowOf).
  const vm = (r) => toPersonRowVM({ ...r, effective_reply_mode: null, visits: null }, TZ, NOW, USER);
  assert.deepEqual(
    everyone.people.map((p) => [p.state, p.state_detail]),
    rows.map((r) => [vm(r).stateLabel, vm(r).stateDetail || null]),
  );
  assert.deepEqual(
    everyone.people.map((p) => p.state),
    ["Needs you", "Quiet"],
    "Rosa was 'Active' in the tool's own three states: the page says Quiet",
  );
  assert.ok(tc.read.person.has(ROSA) && tc.read.thread.has(C2), "a person found is a row read, and their thread");
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "people_list").map((q) => q.args.p_query ?? null),
    ["Rosi", "018", null],
    "the page's read, one per query; never everyone for a pool",
  );
});

test("people.search answers who booked and who never did, a list counted over the audience pool as the People rail counts one: everyone with their visits from the owner's calendar, and the Booked and Asked, never booked lists judged with the pool's calendar", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:e-rosa",
    "DTSTART:20260916T140000Z",
    "DTEND:20260916T150000Z",
    "SUMMARY:Colour",
    "DESCRIPTION:Rosa +15555550182",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const rows = twoPeople().map((r) => ({
    ...r,
    last_message_at: iso(NOW.getTime() - 3 * 86_400_000),
    last_inbound_at: iso(NOW.getTime() - 3 * 86_400_000),
  }));
  const base = tables();
  const t = tables({
    contacts: contactsOf(rows),
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
  });
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    const tc = newToolContext(ctxFor(t, { ...RPCS, people_list: peopleListMatching(rows) }), A, "owner", TZ, NOW);
    const on = async (list) =>
      JSON.parse((await runTool(tc, { name: "people", input: { action: "search", query: "", list } })).result);
    const booked = await on("booked");
    assert.deepEqual(
      booked.people.map((p) => p.name),
      ["Rosa Diaz"],
    );
    assert.match(booked.people[0].next_visit, /Colour$/, "her next visit, from the feed");
    const never = await on("asked_never_booked");
    assert.deepEqual(
      [never.people.map((p) => p.name), never.people[0].next_visit],
      [["Luis Mora"], null],
      "wrote this month, and the calendar never had him",
    );
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("campaigns.audiences offers the templates the composer offers (ledger #9): approved and not hidden by the workspace -- the one the workspace hid is never offered, as the composer's own read never offers it", async () => {
  const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const T3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
  const tpl = (id, name, over = {}) => ({ ...OFFER, id, name, ...over });
  const t = tables({
    templates: [
      tpl(TPL, "fall_offer"),
      tpl(T2, "summer_offer", { hidden_at: iso(NOW.getTime() - 86_400_000) }),
      tpl(T3, "winter_offer", { meta_status: "pending" }),
    ],
  });
  const out = await runTool(newToolContext(ctxFor(t), A, "owner", TZ, NOW), {
    name: "campaigns",
    input: { action: "audiences" },
  });
  assert.equal(out.isError, false, out.result);
  const offered = JSON.parse(out.result).templates.map((x) => x.template_id);
  assert.deepEqual(offered, [TPL], "REGRESSION: the hidden summer_offer was offered to the model");
  const composer = await templatesRoute.GET.run(new Request(`http://localhost/api/v1/templates?workspace=${A}`), {
    ...ctxFor(t),
    params: {},
  });
  assert.deepEqual(
    offered,
    composer.templates.filter((x) => x.channel === "whatsapp").map((x) => x.id),
    "the composer's own list",
  );
});

test("campaigns.playbooks says the Playbooks page's numbers (ledger #10): every moment's and every list's counts are the page's chips -- over everyone with no one looking and the week's touches applied, so Rosa, reached by a broadcast yesterday, waits out the week where the tool's own count reached her -- its rows and next runs are the page's, and a list the page cannot count says why as far as the page's read says, never a reason it does not give", async () => {
  const DAY = 86_400_000;
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const S_MINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const S_NEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
  const GONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9";
  const sent = iso(NOW.getTime() - DAY);
  const pbRow = (id, over) => ({
    id,
    tenant_id: A,
    kind: "moment",
    name: "Win-back",
    trigger: "saved_list",
    list_id: null,
    list_key: null,
    template_id: TPL,
    template_name: "fall_offer",
    template_language: "en",
    params: [],
    policy_class: "reengage",
    state: "running",
    run_hour: 10,
    cap_per_run: 50,
    gap_days: 30,
    cadence_days: 0,
    last_run_for: null,
    last_run_at: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  });
  const t = tables({
    playbooks: [
      pbRow("pb-regulars", { list_id: S_REG }),
      pbRow("pb-booked", { list_key: "booked", created_at: "2026-09-02T00:00:00Z" }),
      pbRow("pb-gone", { list_id: GONE, created_at: "2026-09-03T00:00:00Z" }),
      pbRow("pb-monthly", {
        trigger: "everyone_monthly",
        policy_class: "campaign",
        created_at: "2026-09-04T00:00:00Z",
      }),
      pbRow("pb-quiet", { list_key: "quiet", created_at: "2026-09-05T00:00:00Z" }),
      pbRow("pb-mine", { list_id: S_MINE, created_at: "2026-09-06T00:00:00Z" }),
      pbRow("pb-newer", { list_id: S_NEWER, created_at: "2026-09-07T00:00:00Z" }),
    ],
    segments: [
      { id: S_REG, tenant_id: A, name: "Regulars", rule: null },
      // About whoever is looking: a run has no one (the page's read says so).
      { id: S_MINE, tenant_id: A, name: "Mine", rule: { all: [{ field: "assigned", op: "is", value: "me" }] } },
      // A rule this version can't read: the page counts it for nobody, and People says why on the list.
      { id: S_NEWER, tenant_id: A, name: "From the future", rule: { v: 3, all: [{ field: "future_fact" }] } },
    ],
    segment_members: [
      { tenant_id: A, segment_id: S_REG, contact_id: LUIS },
      { tenant_id: A, segment_id: S_REG, contact_id: ROSA },
    ],
    broadcasts: [
      {
        id: "b-yesterday",
        tenant_id: A,
        playbook_id: null,
        state: "sent",
        scheduled_for: sent,
        created_at: sent,
        run_for: null,
        params: [],
      },
    ],
    broadcast_recipients: [
      { tenant_id: A, broadcast_id: "b-yesterday", contact_id: ROSA, state: "sent", sent_at: sent },
    ],
  });
  const doors = { ...RPCS, people_list: () => threeAnswers() };
  const out = await runTool(newToolContext(ctxFor(t, doors), A, "owner", TZ, NOW), {
    name: "campaigns",
    input: { action: "playbooks" },
  });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  // The page's own read of the same workspace, on the same clock (readers/playbooks.ts, GET playbooks' body).
  const page = (
    await load(readerContext(ctxFor(t, doors), { tenantId: A, role: "owner" }, NOW), playbooksReader, undefined)
  ).data;
  const chip = (key) => ({ said_yes_now: page.pools[key].saidYes, can_be_sent_now: page.pools[key].candidates });
  for (const x of read.triggers.filter((y) => !y.counted_per_list))
    assert.deepEqual({ said_yes_now: x.said_yes_now, can_be_sent_now: x.can_be_sent_now }, chip(x.trigger), x.trigger);
  const monthly = read.triggers.find((x) => x.trigger === "everyone_monthly");
  assert.deepEqual(
    [monthly.said_yes_now, monthly.can_be_sent_now],
    [2, 0],
    "Ana and Rosa said yes to offers; only Rosa has a number, and a broadcast reached her yesterday: the tool said 1",
  );
  assert.deepEqual(
    read.playbooks.map((p) => [p.playbook_id, p.next_run]),
    page.playbooks.map((p) => [p.id, nextRunLabel(p, page.timezone, NOW)]),
    "the page's rows, and its next-run words",
  );
  const byId = Object.fromEntries(read.playbooks.map((p) => [p.playbook_id, p]));
  assert.deepEqual(
    [byId["pb-regulars"].list, byId["pb-regulars"].said_yes_now, byId["pb-regulars"].can_be_sent_now],
    [`list:${S_REG}`, chip(`list:${S_REG}`).said_yes_now, chip(`list:${S_REG}`).can_be_sent_now],
    "a list of the workspace's own, counted as the page counts it",
  );
  assert.deepEqual(
    [byId["pb-booked"].list, byId["pb-booked"].cannot_count],
    ["seg:booked", "This list reads your calendar. Connect it under Settings › Business to count it."],
  );
  assert.deepEqual([byId["pb-gone"].cannot_count, byId["pb-gone"].said_yes_now], ["its list was deleted", undefined]);
  assert.deepEqual(
    [byId["pb-quiet"].said_yes_now, byId["pb-quiet"].can_be_sent_now],
    [chip("seg:quiet").said_yes_now, chip("seg:quiet").can_be_sent_now],
  );
  assert.deepEqual(
    [byId["pb-mine"].cannot_count, byId["pb-newer"].cannot_count],
    [
      "This list is about whoever is looking, so only a person can count it.",
      "it could not be counted just now; People says why on the list",
    ],
    "the page's reason where its read carries one, and never a reason guessed for a list of the workspace's own",
  );
  assert.ok(read.note.includes("can_be_sent_now") && read.note.includes("this week"), read.note);
  assert.ok(read.note.includes("A null count means the page could not count it just now."), read.note);
  // Everyone could not be read: no moment and no list is counted, and each says so -- never a calendar to connect or a
  // service to add, which is what a People read that failed looked like (no People list offered at all).
  const { result: blindOut, lines } = await logged("playbook_pools_people_failed", () =>
    runTool(
      newToolContext(
        ctxFor(t, {
          ...doors,
          people_list: () => {
            throw new Error("canceling statement due to statement timeout");
          },
        }),
        A,
        "owner",
        TZ,
        NOW,
      ),
      { name: "campaigns", input: { action: "playbooks" } },
    ),
  );
  assert.equal(blindOut.isError, false, blindOut.result);
  assert.equal(lines.length, 1, "said once in the log");
  const blind = JSON.parse(blindOut.result);
  const blindById = Object.fromEntries(blind.playbooks.map((p) => [p.playbook_id, p]));
  assert.deepEqual(
    ["pb-booked", "pb-quiet", "pb-regulars", "pb-mine"].map((id) => blindById[id].cannot_count),
    [
      "it could not be counted just now",
      "it could not be counted just now",
      "its list could not be read just now",
      "its list could not be read just now",
    ],
  );
  assert.ok(
    blind.triggers
      .filter((x) => !x.counted_per_list)
      .every((x) => x.said_yes_now === null && x.can_be_sent_now === null),
  );
  assert.ok(!/Settings/.test(JSON.stringify(blind.playbooks)), "REGRESSION: a failed read was told to fix Settings");
});

/** The workspace's WhatsApp number, with the quality Meta assigned it, and its line. */
const CHANNELS = [
  {
    id: "ch-wa",
    tenant_id: A,
    kind: "whatsapp",
    number_e164: "+19295550199",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    config: { quality_rating: "YELLOW", messaging_limit: "TIER_1K" },
  },
  {
    id: "ch-voice",
    tenant_id: A,
    kind: "voice",
    number_e164: "+19295550100",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    config: {},
  },
];
/** A search as lead_searches_view answers it: one round, stopped to ask the owner a question. */
const WAITING_SEARCH = {
  id: "55555555-5555-4555-8555-555555555551",
  tenant_id: A,
  created_by: USER,
  card: "local_businesses",
  name: "Personal trainers in Austin",
  asked: "find me 200 personal trainers in Austin",
  via: "ask",
  plan: { version: 1, count: 200 },
  removed_at: null,
  created_at: "2026-09-12T15:00:00Z",
  round_id: "66666666-6666-4666-8666-666666666661",
  seq: 1,
  purpose: "probe",
  state: "waiting_on_owner",
  ending: null,
  question: { sentence: "Most of the first 25 are chain gyms. Include them?", criterionKey: "chains" },
  answered: null,
  target: 200,
  plan_version: 1,
  cost_usd: 0.4,
  qualified: 20,
  review: 2,
  excluded: 3,
  counted: 20,
  judge_tokens: 900,
};

test("the workspace's pages are read once a turn, each tool as its page reads it: workspace.settings and campaigns.audiences read the channels once between them and campaigns.audiences the composers' templates once, leads.searches the searches and the rail's counts once each -- however often the model asks; workspace.settings says the channels in the page's order, campaigns.audiences the page's number, leads.searches the rail's six counts (ledger #12)", async () => {
  const COUNTS = { all: 12, ready: 7, nurture: 2, converted: 1, said_no: 1, not_a_fit: 1 };
  const ctx = ctxFor(tables({ tenant_channels: CHANNELS, templates: [OFFER], lead_searches_view: [WAITING_SEARCH] }), {
    ...RPCS,
    lead_list_counts: () => COUNTS,
  });
  const s = scripted([
    ROUND([
      tool("workspace", { action: "settings" }),
      tool("campaigns", { action: "audiences" }),
      tool("leads", { action: "searches" }),
    ]),
    ROUND([
      tool("campaigns", { action: "audiences" }, "t-audiences-again"),
      tool("leads", { action: "searches" }, "t-searches-again"),
    ]),
    ROUND([answer("Your WhatsApp number is fine and one search is waiting on you.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    ["tenant_channels", "templates", "lead_searches_view"].map(selects),
    [1, 1, 1],
    "the channels once for workspace.settings and campaigns.audiences alike, the templates once, the searches once",
  );
  assert.equal(ctx.supabase.seen.filter((q) => q.rpc === "lead_list_counts").length, 1, "the rail's counts once");
  // Every tool result the model was handed, by its call's id, across both rounds.
  const out = Object.fromEntries(
    s.requests
      .at(-1)
      .messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((c) => c.type === "tool_result")
      .map((c) => [c.tool_use_id, JSON.parse(c.content)]),
  );
  assert.deepEqual(
    out["t-workspace.settings"].channels,
    [
      { kind: "voice", status: "active", number: "+19295550100" },
      { kind: "whatsapp", status: "active", number: "+19295550199" },
    ],
    "the same three fields, in the page's order: by kind",
  );
  // The page's own builder, over what the page reads of the number: Meta's quality and limit from the row's config.
  const health = numberHealth({ quality: "YELLOW", event: null, limit: "TIER_1K" });
  assert.deepEqual(
    out["t-campaigns.audiences"].number,
    { present: true, health: health.label, can_send: health.canSend, limit_per_day: 1000 },
    "the number the Broadcasts page picks, and its health from the quality Meta assigned it",
  );
  assert.deepEqual(out["t-audiences-again"], out["t-campaigns.audiences"], "the same answer from the turn's reads");
  const searches = out["t-leads.searches"];
  assert.deepEqual(searches.counts, COUNTS, "the rail's six counts, as the Leads page shows them");
  assert.deepEqual(
    searches.searches.map((x) => [x.id, x.state, x.question]),
    [[WAITING_SEARCH.id, "waiting for an answer from you", "Most of the first 25 are chain gyms. Include them?"]],
  );
  assert.deepEqual(out["t-searches-again"], searches);
});

test("thirteen names in a turn (PR 4.2): the rows leads.searches, campaigns.audiences and campaigns.playbooks returned are cited as a search, a People list by its name, a template and a playbook, each opening where its reader said; a playbook no read returned is dropped, and said in the log", async () => {
  const PB = "abababab-0000-4000-8000-00000000000b";
  const NOT_READ = "abababab-0000-4000-8000-0000000000ff";
  const winBack = {
    id: PB,
    tenant_id: A,
    kind: "moment",
    name: "Win-back",
    trigger: "quiet_30",
    list_id: null,
    list_key: null,
    template_id: TPL,
    template_name: "fall_offer",
    template_language: "en",
    params: [],
    policy_class: "reengage",
    state: "running",
    run_hour: 10,
    cap_per_run: 50,
    gap_days: 30,
    cadence_days: 0,
    last_run_for: null,
    last_run_at: null,
    created_at: "2026-09-01T00:00:00Z",
  };
  const world = () =>
    ctxFor(tables({ templates: [OFFER], lead_searches_view: [WAITING_SEARCH], playbooks: [winBack] }), {
      ...RPCS,
      people_list: () => threeAnswers(),
    });
  // A People list the listing offers here, by the id it gives it (audience_id): a name, never a uuid.
  const offered = JSON.parse(
    (await runTool(newToolContext(world(), A, "owner", TZ, NOW), { name: "campaigns", input: { action: "audiences" } }))
      .result,
  ).audiences.find((a) => a.kind === "list");
  assert.ok(offered && !/^[0-9a-f-]{36}$/.test(offered.audience_id), JSON.stringify(offered));
  const item = (kind, id, title) => ({ title, meta: "", line: "", source: { kind, id, label: title } });
  const s = scripted([
    ROUND([
      tool("leads", { action: "searches" }),
      tool("campaigns", { action: "audiences" }),
      tool("campaigns", { action: "playbooks" }),
    ]),
    ROUND([
      answer("One search waits on you, and the win-back runs on its own.", {
        show: {
          items: [
            item("search", WAITING_SEARCH.id, "Personal trainers in Austin"),
            item("list", offered.audience_id, offered.label),
            item("template", TPL, "fall_offer"),
            item("playbook", PB, "Win-back"),
            item("playbook", NOT_READ, "A playbook nobody read"),
          ],
        },
      }),
    ]),
  ]);
  const { input } = turn(world(), { role: "owner" });
  const { result: r, lines } = await logged("ask_sources_dropped", () => runAskTurn(input, ports(s.round)));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [
      ["search", WAITING_SEARCH.id, `clients/leads:s-${WAITING_SEARCH.id}`],
      ["list", offered.audience_id, `clients/seg:${offered.audience_id}`],
      ["template", TPL, "messages"],
      ["playbook", PB, `outbound/${PB}`],
    ],
    "each where its reader said: a search on Leads, a People list on People, a template on Templates, a playbook at its card",
  );
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).dropped),
    [1],
    "the playbook no read returned is dropped, and counted",
  );
});

test("campaigns.audiences offers what the composer offers (ledger #14): a template this product cannot put on the wire -- a button that takes a value -- is withheld as the Broadcasts composer withholds it, and cannot_send says why in the composer's own sentence; nothing withheld, it says nothing", async () => {
  const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const bookNow = {
    ...OFFER,
    id: T2,
    name: "book_now",
    category: "UTILITY",
    body_preview: "Book your next visit.",
    components: [
      { type: "BODY", text: "Book your next visit." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://book.example/{{1}}" }] },
    ],
  };
  const t = tables({ templates: [OFFER, bookNow] });
  const out = await runTool(newToolContext(ctxFor(t), A, "owner", TZ, NOW), {
    name: "campaigns",
    input: { action: "audiences" },
  });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.deepEqual(
    read.templates.map((x) => x.template_id),
    [TPL],
    "REGRESSION: a template whose button takes a value was offered, and became a card whose send failed for everyone",
  );
  assert.equal(
    read.cannot_send,
    "One of your messages can't go out from here — it has a button that takes a value. It still works in WhatsApp Manager.",
  );
  // The composer's own split, over the composers' own read: the same templates, the same sentence.
  const composer = await templatesRoute.GET.run(new Request(`http://localhost/api/v1/templates?workspace=${A}`), {
    ...ctxFor(t),
    params: {},
  });
  const split = sendableTemplates(
    composer.templates.filter((x) => x.channel === "whatsapp" && x.meta_status === "approved").sort(compareTemplates),
  );
  assert.deepEqual(
    [read.templates.map((x) => x.template_id), read.cannot_send],
    [split.sendable.map((x) => x.id), split.why],
    "the composer's own list and its words",
  );
  const clear = JSON.parse(
    (
      await runTool(newToolContext(ctxFor(tables({ templates: [OFFER] })), A, "owner", TZ, NOW), {
        name: "campaigns",
        input: { action: "audiences" },
      })
    ).result,
  );
  assert.deepEqual([clear.templates.map((x) => x.template_id), clear.cannot_send], [[TPL], null]);
});

test("a list of the workspace's own is read once a turn: campaigns.audiences reads the lists and their members, and people.search and propose_campaign.broadcast count a list from them, never reading it again", async () => {
  const S_REG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const t = tables({
    segments: [{ id: S_REG, tenant_id: A, name: "Regulars", rule: null, archived_at: null }],
    segment_members: [
      { segment_id: S_REG, contact_id: LUIS, tenant_id: A },
      { segment_id: S_REG, contact_id: ROSA, tenant_id: A },
    ],
    templates: [OFFER],
  });
  const ctx = ctxFor(t, { ...RPCS, people_list: () => threeAnswers() });
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  const listed = await runTool(tc, { name: "campaigns", input: { action: "audiences" } });
  assert.equal(listed.isError, false, listed.result);
  const search = JSON.parse(
    (await runTool(tc, { name: "people", input: { action: "search", query: "", list: `list:${S_REG}` } })).result,
  );
  assert.deepEqual(search.people.map((p) => p.name).sort(), ["Luis Mora", "Rosa Diaz"]);
  const card = await buildProposal(tc, "propose_campaign", {
    action: "broadcast",
    template_id: TPL,
    audience_kind: "saved",
    audience_id: S_REG,
    params: [],
  });
  assert.equal(card.isError, false, card.result);
  assert.deepEqual([card.proposal.payload.audience_label, card.proposal.payload.count], ["Regulars", 1]);
  const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    [selects("segments"), selects("segment_members")],
    [1, 1],
    "the lists and their members once, for the listing, the search and the card alike",
  );
});

test("a read the page tolerates, Ask tolerates as the page does and says so: a failed channels read is workspace.settings' channels and campaigns.audiences' number null, a failed templates read campaigns.audiences' templates null -- each with its sentence, never none and never a failed tool, said once in the log; everything else still answers; the turn keeps no failure, so the next tool reads again", async () => {
  const world = () => tables({ tenant_channels: CHANNELS, templates: [OFFER] });
  const answers = async (faults, names) => {
    const ctx = ctxFor(world(), RPCS, faults);
    const tc = newToolContext(ctx, A, "owner", TZ, NOW);
    const out = {};
    const { lines } = await logged("ask_tool_read_failed", async () => {
      for (const name of names) {
        const [tool, action] = name.split(".");
        out[name] = await runTool(tc, { name: tool, input: { action } });
      }
    });
    return { ctx, out, lines };
  };
  const parsed = (o) => JSON.parse(o.result);
  const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  const healthy = await answers({}, ["workspace.settings", "campaigns.audiences"]);
  const settings = parsed(healthy.out["workspace.settings"]);
  const listing = parsed(healthy.out["campaigns.audiences"]);
  assert.equal("could_not_read" in settings || "could_not_read" in listing, false, "nothing to say when all was read");

  // The channels: workspace.settings, then campaigns.audiences, in one turn.
  const noChannels = await answers({ "tenant_channels.select": { message: "channels down" } }, [
    "workspace.settings",
    "campaigns.audiences",
  ]);
  const s = parsed(noChannels.out["workspace.settings"]);
  assert.equal(noChannels.out["workspace.settings"].isError, false, noChannels.out["workspace.settings"].result);
  assert.deepEqual(
    [s.channels, s.could_not_read],
    [null, ["The channels could not be read just now."]],
    "never [] -- no channels read is not no channels",
  );
  assert.deepEqual(without(s, "channels", "could_not_read"), without(settings, "channels"), "the rest still answers");
  const a = parsed(noChannels.out["campaigns.audiences"]);
  assert.equal(noChannels.out["campaigns.audiences"].isError, false, noChannels.out["campaigns.audiences"].result);
  assert.deepEqual(
    [a.number, a.could_not_read],
    [null, ["The WhatsApp number's state could not be read just now."]],
    "no number known, never 'no number'",
  );
  assert.deepEqual(without(a, "number", "could_not_read"), without(listing, "number"), "the audiences still answer");
  assert.equal(
    noChannels.ctx.supabase.seen.filter((q) => q.table === "tenant_channels" && q.op === "select").length,
    2,
    "the failure was not kept: campaigns.audiences read the channels again",
  );
  assert.deepEqual(
    noChannels.lines.map((l) => JSON.parse(l)).map((x) => [x.tool, x.read, x.tenant]),
    [
      ["workspace.settings", "channels", A],
      ["campaigns.audiences", "channels", A],
    ],
  );

  // The templates.
  const noTemplates = await answers({ "templates.select": { message: "templates down" } }, ["campaigns.audiences"]);
  const t = parsed(noTemplates.out["campaigns.audiences"]);
  assert.equal(noTemplates.out["campaigns.audiences"].isError, false, noTemplates.out["campaigns.audiences"].result);
  assert.deepEqual(
    [t.templates, t.cannot_send, t.could_not_read],
    [null, null, ["The messages could not be read just now: say so, and propose no broadcast until they can."]],
    "the templates' own state, never 'no template yet'",
  );
  assert.deepEqual(
    without(t, "templates", "cannot_send", "could_not_read"),
    without(listing, "templates", "cannot_send"),
    "the audiences and the number still answer",
  );
  assert.equal(noTemplates.lines.length, 1, "said once in the log");
});

test("the row the scope names rides in whole, read by its own tool and action: a call, a person, a thread; since PR 4.3 a lead, a search and a run (the Broadcasts row its address names) too; a page needs no read", () => {
  const X = "77777777-7777-4777-8777-777777777777";
  assert.deepEqual(scopedRead({ kind: "call", id: X, label: "this call" }), {
    name: "calls",
    input: { action: "get", call_id: X },
  });
  assert.deepEqual(scopedRead({ kind: "person", id: X, label: "Rosa" }), {
    name: "people",
    input: { action: "get", contact_id: X },
  });
  for (const kind of ["thread", "conversation"])
    assert.deepEqual(scopedRead({ kind, id: X, label: "Rosa" }), {
      name: "inbox",
      input: { action: "thread", conversation_id: X, more: false },
    });
  assert.deepEqual(scopedRead({ kind: "lead", id: X, label: "Zilker Strength" }), {
    name: "leads",
    input: { action: "lead", lead_id: X },
  });
  // On a search's view, the lead is read as that search found it: the membership its peek shows, never its newest.
  const S = "66666666-6666-4666-8666-666666666666";
  assert.deepEqual(scopedRead({ kind: "lead", id: X, label: "Zilker Strength" }, `clients/leads:s-${S}:p-${X}`), {
    name: "leads",
    input: { action: "lead", lead_id: X, search_id: S },
  });
  assert.deepEqual(scopedRead({ kind: "lead", id: X, label: "Zilker Strength" }, `clients/leads:l-ready:p-${X}`), {
    name: "leads",
    input: { action: "lead", lead_id: X },
  });
  assert.deepEqual(scopedRead({ kind: "search", id: X, label: "Trainers" }), {
    name: "leads",
    input: { action: "search", search_id: X },
  });
  assert.deepEqual(scopedRead({ kind: "run", id: X, label: "Monday offer" }), {
    name: "campaigns",
    input: { action: "broadcast", broadcast_id: X },
  });
  assert.equal(scopedRead({ kind: "page", id: "reports", label: "Reports" }), null, "a page");
  assert.equal(scopedRead(null), null);
  // Each is a read every role is offered: the scope's row is never refused for the role that looks at it.
  for (const kind of ["call", "person", "thread", "lead", "search", "run"]) {
    const run = scopedRead({ kind, id: X, label: kind });
    const t = toApiTools("viewer", false).find((x) => x.name === run.name);
    assert.ok(t.input_schema.properties.action.enum.includes(run.input.action), `${kind}: a viewer's`);
  }
});

test("a run the person is looking at is the Broadcasts row the page drew: the answer cites it as a broadcast, opened at its run; run is no citation's kind", async () => {
  const RUN = "abababab-0000-4000-8000-0000000000c1";
  const built = builtWith([{ kind: "broadcast", id: RUN, route: `broadcasts/run:${RUN}`, label: "Monday offer" }]);
  const s = scripted([
    ROUND([
      answer("Monday offer went to 40 people; 3 replied.", {
        show: {
          items: [
            {
              title: "Monday offer",
              meta: "",
              line: "",
              source: { kind: "broadcast", id: RUN, label: "Monday offer" },
            },
          ],
        },
        do: { open: { source: { kind: "run", id: RUN, label: "Monday offer" }, label: "", now: false }, next: [] },
      }),
    ]),
  ]);
  const scope = { kind: "run", id: RUN, label: "Monday offer" };
  assert.deepEqual(
    scopedRead(scope),
    { name: "campaigns", input: { action: "broadcast", broadcast_id: RUN } },
    "a run is read by its id, as the broadcast it is",
  );
  const r = await runAskTurn(
    turn(ctxFor(), {
      surface: "campaigns",
      scope,
      context: { ...PAGE, surface: "campaigns", route: `broadcasts/run:${RUN}`, view: "broadcasts" },
    }).input,
    ports(s.round, { context: async () => built }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [["broadcast", RUN, `broadcasts/run:${RUN}`]],
  );
  assert.equal(r.answer.do.open, null, "a run is written as a broadcast, never as a run");
});

test("a lead the person has open on a search's view rides in read as that search found it: the turn hands scopedRead the page's address", async () => {
  const LEAD = "abababab-0000-4000-8000-0000000000d1";
  const SEARCH = "abababab-0000-4000-8000-0000000000e1";
  const route = `clients/leads:s-${SEARCH}:p-${LEAD}`;
  const runs = [];
  const s = scripted([ROUND([answer("Zilker Strength is a strong fit.")])]);
  const r = await runAskTurn(
    turn(ctxFor(), {
      surface: "leads",
      scope: { kind: "lead", id: LEAD, label: "Zilker Strength" },
      context: { ...PAGE, surface: "leads", route, view: "all" },
    }).input,
    ports(s.round, {
      tool: async (_t, run) => {
        runs.push(run);
        return { result: "{}", isError: false, label: "" };
      },
    }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(runs, [{ name: "leads", input: { action: "lead", lead_id: LEAD, search_id: SEARCH } }]);
});

/* ------------------------------------------------ the turn reads the page (the Phase 2 plan, PR 2.4) */

/** The page as the server built it, with one row a citation may name. */
const builtWith = (refs = [], rows = []) => ({
  ...BUILT,
  blocks: [
    ...BUILT.blocks,
    ...rows.map((id) => ({
      type: "search_result",
      source: `thread://${id}`,
      title: "Rosa",
      content: [{ type: "text", text: "Rosa · needs you · route: inbox/th-" + id }],
      citations: { enabled: false },
    })),
  ],
  refs: [...BUILT.refs, ...refs],
  rows: rows.length,
});

test("the request: system is two blocks with two breakpoints; the question's message is the page's data, its last block the third breakpoint, then the turn's words, then the question -- and the clock, the person and the page are never in system", async () => {
  const s = scripted([ROUND([answer("Rosa needs you.")])]);
  const built = builtWith([{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }], [C1]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: { ...PAGE, rows: [{ kind: "thread", id: C1 }] } }).input,
    ports(s.round, { context: async () => built }),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const req = s.requests[0];
  assert.deepEqual(
    req.system.map((b) => !!b.cache_control),
    [true, true],
    "the rules and facts, then the shape",
  );
  assert.ok(!JSON.stringify(req.system).includes("You are speaking with"), "the person is not in system");
  const q = req.messages.at(-1);
  assert.equal(q.role, "user");
  assert.deepEqual(
    q.content.map((c) => [c.type, c.source ?? null, !!c.cache_control]),
    [
      ["search_result", "page://today", false],
      ["search_result", `thread://${C1}`, true],
      ["text", null, false],
      ["text", null, false],
    ],
    "the page's figures, its row with the breakpoint, the turn's words, the question",
  );
  assert.ok(q.content[2].text.includes("You are speaking with ada@example.com"), "the words say who is asking");
  assert.ok(q.content[2].text.includes("The page they are on is in the search results before these words"));
  assert.equal(q.content[3].text, "Who needs me?", "the question last, alone");
  assert.deepEqual([r.shape.context_rows, r.shape.warm, r.shape.context_chars], [1, "hit", 30]);
});

test("the bytes before the messages are the same on two pages and for two people of one role, for each of the four roles: the tools and system cache for everyone of that role (D12)", async () => {
  const prefix = (r) => JSON.stringify({ system: r.system, tools: r.tools, model: r.model });
  const byRole = {};
  for (const role of ["viewer", "operator", "partner", "owner"]) {
    const requests = [];
    const run = async (over) => {
      const s = scripted([ROUND([answer("Fine.")])]);
      await runAskTurn(turn(ctxFor(), { role, ...over }).input, ports(s.round));
      requests.push(s.requests[0]);
    };
    await run({ surface: "today", context: PAGE });
    await run({ surface: "inbox", context: { ...PAGE, surface: "inbox", route: "inbox" } });
    await run({ surface: "reports", personLabel: `sam@example.com (${role})` });
    assert.equal(prefix(requests[1]), prefix(requests[0]), `${role}: another page`);
    assert.equal(prefix(requests[2]), prefix(requests[0]), `${role}: another person of the same role`);
    byRole[role] = prefix(requests[0]);
  }
  assert.equal(new Set(Object.values(byRole)).size, 4, "four prefixes, one per role");
});

test("the request's tools are the registry's: the three fields, and input_examples on the tools that carry them and no other; the same bytes on every round of a turn", async () => {
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([answer("Nobody is waiting on you.")]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  // An operator's tools (D12), in the registry's order: sorted by name.
  const registry = toApiTools("operator", true);
  assert.equal(s.requests[0].tools.length, registry.length);
  for (const [i, sent] of s.requests[0].tools.entries()) {
    const own = registry[i];
    assert.equal(sent.name, own.name);
    assert.deepEqual(
      Object.keys(sent),
      ["name", "description", "input_schema", ...(own.input_examples ? ["input_examples"] : [])],
      `${own.name}: the fields the API takes, the examples last`,
    );
    assert.deepEqual(sent.input_examples, own.input_examples, own.name);
  }
  const withExamples = s.requests[0].tools.filter((t) => t.input_examples).map((t) => t.name);
  assert.ok(withExamples.includes("calendar") && withExamples.includes("propose_campaign"), withExamples);
  assert.ok(
    !withExamples.includes("today") && !withExamples.includes("propose_whisper"),
    "a plain input with no action has none",
  );
  assert.equal(JSON.stringify(s.requests[1].tools), JSON.stringify(s.requests[0].tools), "the second round, the same");
});

test("a request refused for its input_examples is asked once more without them: the same round, the schemas, the page's data and the answer's format kept; a second such refusal is the turn's, and only a 400 that names them is one", async () => {
  const refusing = async (refusals, over = { context: PAGE }) => {
    const requests = [];
    const round = async (c) => {
      requests.push(structuredClone(c.request));
      const message = refusals.shift();
      if (message) throw new GatewayRefused({ kind: "bad_request", message });
      return ROUND([answer("2 people need you.")]);
    };
    const { result, lines } = await logged(
      "ask_examples_rejected",
      async () => await runAskTurn(turn(ctxFor(), over).input, ports(round)),
    );
    return { r: result, requests, said: lines.length };
  };
  const once = await refusing(["400 tools.3.input_examples.0: does not match the tool's input_schema"]);
  assert.equal(once.r.failed, false, once.r.failure ?? "");
  assert.deepEqual([once.requests.length, once.said], [2, 1], "asked again, once; said once");
  const [first, retry] = once.requests;
  assert.ok(
    first.tools.some((t) => t.input_examples) && !retry.tools.some((t) => "input_examples" in t),
    "the examples were sent, then dropped from every tool",
  );
  assert.deepEqual(
    retry.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    first.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    "nothing else about the tools moved",
  );
  assert.ok(retry.output_config.format, "the answer's format kept");
  assert.ok(JSON.stringify(retry.messages).includes("search_result"), "the page's data kept");
  assert.equal(JSON.stringify(retry.messages), JSON.stringify(first.messages), "the same round");
  assert.equal(once.r.shape.context_dropped, false);
  // The real refusal names input_schema, which the format's predicate also matches: a second one, with the examples
  // already gone, is the turn's and never the format's.
  const twice = await refusing([
    "400 tools.3.input_examples.0: does not match the tool's input_schema",
    "400 tools.3.input_examples.0: does not match the tool's input_schema",
  ]);
  assert.deepEqual(
    [twice.r.failure, twice.requests.length, twice.said],
    ["bad_request", 2, 1],
    "with the examples already gone, the refusal is the turn's",
  );
  assert.ok(twice.requests[1].output_config.format, "the format was never given up for it");
  const other = await refusing(["500 input_examples upstream"]);
  assert.deepEqual([other.r.failure, other.requests.length, other.said], ["bad_request", 1, 0], "a 400 only");
  // The one decision the loop asks (refusals.ts): what to give up for this refusal, given what the turn still carries.
  const all = { context: true, examples: true, format: true };
  assert.equal(dropFor("400 tools.3.input_examples: Extra inputs are not permitted", all), "examples");
  assert.equal(dropFor("400 tools: too many", all), null, "a refusal of the tools for something else");
  assert.equal(dropFor("500 input_examples", all), null, "a 400 only");
  const real = "400 tools.3.input_examples.0: does not match the tool's input_schema";
  assert.equal(dropFor(real, all), "examples");
  assert.equal(dropFor(real, { ...all, examples: false }), null, "a second is the turn's, never the format's");
  assert.equal(dropFor("400 messages.0.content.0: search_result is not supported", all), "context");
  assert.equal(dropFor("400 output_config.format: not supported", all), "format");
  assert.equal(dropFor("400 output_config.format: not supported", { ...all, format: false }), null);
  assert.equal(dropFor("", all), null, "no message, nothing to drop");
});

test("the three retries run in their order, each once: the page's data, then the examples, then the answer's format; the fourth request carries none of them and the turn answers", async () => {
  const requests = [];
  const refusals = [
    "400 messages.0.content.0: search_result is not supported here",
    "400 tools.3.input_examples.0: does not match the tool's input_schema",
    "400 output_config.format.schema: too many properties",
  ];
  const round = async (c) => {
    requests.push(structuredClone(c.request));
    const message = refusals.shift();
    if (message) throw new GatewayRefused({ kind: "bad_request", message });
    return ROUND([answer("2 people need you.")]);
  };
  // Every refusal the turn logged, in the order it logged them.
  const said = [];
  const was = console.error;
  console.error = (name) => {
    if (typeof name === "string" && /^ask_.*_rejected$/.test(name)) said.push(name);
  };
  let r;
  try {
    r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round));
  } finally {
    console.error = was;
  }
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(requests.length, 4, "three retries, then the answer");
  const has = (q) => ({
    data: JSON.stringify(q.messages).includes("search_result"),
    examples: q.tools.some((t) => t.input_examples),
    format: !!q.output_config.format,
  });
  assert.deepEqual(requests.map(has), [
    { data: true, examples: true, format: true },
    { data: false, examples: true, format: true },
    { data: false, examples: false, format: true },
    { data: false, examples: false, format: false },
  ]);
  assert.deepEqual(
    said,
    ["ask_context_rejected", "ask_examples_rejected", "ask_format_rejected"],
    "each said once, in that order",
  );
  assert.deepEqual([r.shape.context_dropped, r.shape.format], [true, false]);
});

test("thirteen names move five spans of the request (PR 4.2): the format's kind enum, its source's words and its items' words, the rules' items list and their source rule", async () => {
  const s = scripted([ROUND([answer("Fine.")])]);
  await runAskTurn(turn(ctxFor(), { role: "owner" }).input, ports(s.round));
  const req = s.requests[0];
  const { show, do: act } = req.output_config.format.schema.properties;
  const sources = [
    show.properties.figures.items.properties.source,
    show.properties.items.items.properties.source,
    show.properties.breakdown.properties.source,
    act.properties.open.properties.source,
  ];
  for (const source of sources) {
    assert.deepEqual(source.properties.kind.enum, [...ASK_CITATION_KINDS, "none"], "a page, twelve rows, and none");
    assert.ok(source.description.includes("(a page's id is its route; a run is kind broadcast)"), source.description);
  }
  const every = "people, threads, calls, leads, searches, deals, lists, broadcasts, playbooks, templates, domains";
  assert.equal(ASK_ROW_WORDS, every, "the rows an answer's items may name, said once");
  assert.ok(
    show.properties.items.description.startsWith(`The rows the answer names (${every}), at most 5;`),
    show.properties.items.description,
  );
  const rules = req.system[0].text;
  assert.ok(rules.includes(`items for the rows it names (${every})`), "the rules' items list says the same words");
  assert.ok(
    rules.includes(
      "A row the Broadcasts page calls a run is kind broadcast; a list is kind list, with the audience_id campaigns gave it.",
    ),
    "the source rule says how the two rows whose word differs are cited",
  );
  assert.ok(!rules.includes("items for the rows it names (people, threads, calls),"), "the three-kind list is gone");
});

test("a rule that described one tool is that tool's description now, and out of the rules block (PR 3.3, D9); a rule about answering in general stays", async () => {
  // An owner, offered every tool (D12).
  const s = scripted([ROUND([answer("Fine.")])]);
  await runAskTurn(turn(ctxFor(), { role: "owner" }).input, ports(s.round));
  const rules = s.requests[0].system[0].text;
  const said = (name) => s.requests[0].tools.find((t) => t.name === name).description;
  // [what left the rules in PR 3.3, in the old tools' names, the tool it landed in since PR 3.4, how that tool says it]
  const moved = [
    [
      "get_settings is for the reply policy's dials, the channels and the notifications",
      "workspace",
      "Call it for the reply policy's dials, the channels and the notifications",
    ],
    ["(get_thread, get_call)", "inbox", "when the whole conversation is needed"],
    ["(get_today, list_threads, list_calls)", "inbox", "for what the page on screen does not hold"],
    [
      "(a reply, a rewrite, an Inbox action, a setting, an invitation, a whisper, a broadcast, a lead search)",
      "propose_reply",
      "a rewrite in words",
    ],
    ["Read list_audiences before any broadcast", "campaigns", "read before any broadcast"],
    ["never propose a broadcast to nobody", "propose_campaign", "never propose a broadcast to nobody"],
    [
      "read list_lead_searches, then propose_lead_search: one plan, never a search",
      "propose_lead_search",
      "Read leads with action searches first, so a plan is not repeated: one plan, never a search",
    ],
    [
      "words that answer it are propose_lead_search with amends",
      "leads",
      "words that answer it are propose_lead_search with amends set to that search's id",
    ],
    [
      "never say a search has started until the card is approved",
      "propose_lead_search",
      "never say a search has started until the card is approved",
    ],
    ["(read list_audiences)", "propose_campaign", "reading campaigns with action audiences first"],
  ];
  for (const [gone, name, landed] of moved) {
    assert.ok(!rules.includes(gone), `out of the rules: ${gone}`);
    assert.ok(said(name).includes(landed), `${name} says: ${landed}`);
  }
  for (const kept of [
    "You never act.",
    "Answer from it when it is enough, in one round.",
    "Read only for what it does not hold: a whole conversation or transcript, a person's profile",
    "name the door: a broadcast reaches only the people who said yes, and anyone else",
    "Leads are businesses Claude found for the owner to reach",
    "Only in the US.",
  ])
    assert.ok(rules.includes(kept), `kept, about answering in general: ${kept}`);
});

test("a row the page carried can be cited; one it did not, and one another workspace holds, cannot; a figure answered from the page is grounded, and with no page it is not", async () => {
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const foreign = { kind: "thread", id: "99999999-9999-4999-8999-999999999999", label: "Someone" };
  const s = scripted([
    ROUND([
      answer("2 people need you.", {
        show: {
          items: [
            { title: "Rosa", meta: "", line: "", source: rosa },
            { title: "Someone", meta: "", line: "", source: foreign },
          ],
        },
      }),
    ]),
  ]);
  const built = builtWith([{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }], [C1]);
  const r = await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(s.round, { context: async () => built }));
  assert.deepEqual(
    r.answer.show.items.map((i) => i.source.id),
    [C1],
    "the page's row is a source; a row nobody read is dropped",
  );
  assert.equal(r.ungrounded, false, "a figure from the page is from the workspace");
  const bare = await runAskTurn(turn(ctxFor()).input, ports(scripted([ROUND([answer("2 people need you.")])]).round));
  assert.equal(bare.ungrounded, true, "with no page and no read, a figure is not");
});

test("the row the scope names rides in whole, read by its own tool, as data beside the page -- never as a tool the model called", async () => {
  const s = scripted([ROUND([answer("Rosa asked about Saturday.")])]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: PAGE, scope: { kind: "thread", id: C1, label: "Rosa" } }).input,
    ports(s.round),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const data = s.requests[0].messages.at(-1).content.filter((c) => c.type === "search_result");
  assert.deepEqual(
    data.map((b) => [b.source, !!b.cache_control]),
    [
      ["page://today", false],
      ["read://inbox.thread", true],
    ],
    "the page, then the scope's row, the breakpoint on the last",
  );
  assert.ok(JSON.parse(data[1].content[0].text).messages, "the thread, as inbox.thread reads it");
  assert.deepEqual(r.tools, [], "the model called nothing");
});

test("a request refused while it carries the page's data is asked once more without it, before the answer's format is ever given up; the words stop pointing at it, and its reads leave the count", async () => {
  const requests = [];
  const refusals = ["400 messages.0.content.0: search_result is not supported here"];
  const round = async (c) => {
    requests.push(structuredClone(c.request));
    const message = refusals.shift();
    if (message) throw new GatewayRefused({ kind: "bad_request", message });
    return ROUND([answer("2 people need you.")]);
  };
  const { result: r, lines } = await logged(
    "ask_context_rejected",
    async () => await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round)),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(requests.length, 2, "asked again, once");
  assert.equal(lines.length, 1, "said once");
  const retry = requests[1];
  assert.ok(!JSON.stringify(retry.messages).includes("search_result"), "without the page's data");
  assert.ok(
    !JSON.stringify(retry.messages).includes("search results before these words"),
    "the words point at nothing",
  );
  assert.ok(retry.output_config.format, "the answer's format kept");
  assert.equal(r.ungrounded, true, "the page it could not read grounds nothing");
  assert.equal(r.shape.context_dropped, true, "the drop is recorded");
});

test("only a refusal that names the data blocks drops them: the format's refusal drops the format and keeps the page, and an overload or a size is the turn's, the page never dropped for it", async () => {
  const refusing = async (refusals) => {
    const requests = [];
    const round = async (c) => {
      requests.push(structuredClone(c.request));
      const message = refusals.shift();
      if (message) throw new GatewayRefused({ kind: "bad_request", message });
      return ROUND([answer("2 people need you.")]);
    };
    const { result } = await logged(
      "ask_",
      async () => await runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round)),
    );
    return { r: result, requests };
  };
  const format = await refusing(["400 output_config.format.schema: too many properties"]);
  assert.equal(format.r.failed, false, format.r.failure ?? "");
  assert.equal(format.requests.length, 2, "asked again, once");
  assert.ok(JSON.stringify(format.requests[1].messages).includes("search_result"), "the page kept");
  assert.equal(format.requests[1].output_config.format, undefined, "the format dropped");
  assert.equal(format.r.shape.context_dropped, false);
  for (const m of ["529 overloaded", "429 rate limited", "413 request too large", "400 messages: too long"]) {
    const other = await refusing([m]);
    assert.deepEqual([other.r.failure, other.requests.length], ["bad_request", 1], m);
    assert.equal(other.r.shape.context_dropped, false, m);
  }
  const all = { context: true, examples: true, format: true };
  assert.equal(dropFor("400 messages.0.content.1.cache_control: too many breakpoints", all), "context");
  assert.equal(dropFor("500 search_result upstream", all), null, "a 400 only");
});

test("a page counts as a read only when something on it was read: not one whose read failed, nor the address alone of a page Ask does not draw", async () => {
  const ask = async (context, built) =>
    await runAskTurn(
      turn(ctxFor(), { context }).input,
      ports(scripted([ROUND([answer("2 people need you.")])]).round, { context: async () => built }),
    );
  assert.equal((await ask(PAGE, BUILT)).ungrounded, false, "a page read grounds its figures");
  const failed = await ask(PAGE, { ...BUILT, failed: true, warm: "miss" });
  assert.equal(failed.ungrounded, true, "a page that could not be read grounds nothing");
  assert.equal(failed.shape.warm, "failed", "and is said as failed");
  const other = { ...PAGE, surface: "other", route: "billing" };
  assert.equal((await ask(other, BUILT)).ungrounded, true, "an address alone grounds nothing");
});

test("the history folds a question of blocks: words joined with words, and words beside blocks as one list, the words first", () => {
  const q = [
    { type: "search_result", source: "page://today" },
    { type: "text", text: "Who?" },
  ];
  assert.deepEqual(foldHistory([{ role: "assistant", text: "Hi" }], q), [{ role: "user", content: q }]);
  assert.deepEqual(foldHistory([{ role: "user", text: "a" }], q), [
    { role: "user", content: [{ type: "text", text: "a" }, ...q] },
  ]);
  assert.deepEqual(
    foldHistory(
      [
        { role: "user", text: "a" },
        { role: "assistant", text: "b" },
      ],
      q,
    ),
    [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: q },
    ],
  );
});
