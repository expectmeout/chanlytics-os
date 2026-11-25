/**
 * The world the tests of routes/ share. Split by behaviour from ask-routes.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Ask, metrics and reports, run through route(): the real route modules,
 * their `run` called with a database in memory. What is proved is the policy
 * each declares and what the handler answers, not its text. The question's
 * answer needs the model, so only its doors are run here: everything up to
 * the point the thread would be saved, and the refusals that keep it from
 * being.
 */
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { needsAnswer } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

delete process.env.ASK_MODEL;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));

export const ask = await import(at("apps/dashboard/app/api/v1/ask/route.ts"));

export const { setAskPorts } = await import(at("apps/dashboard/src/server/ask/loop/turn-head.ts"));

export const proposals = await import(at("apps/dashboard/app/api/v1/ask/messages/[id]/proposals/[pid]/route.ts"));

export const openings = await import(at("apps/dashboard/app/api/v1/ask/openings/route.ts"));

export const quick = await import(at("apps/dashboard/app/api/v1/ask/quick/route.ts"));

export const threads = await import(at("apps/dashboard/app/api/v1/ask/threads/route.ts"));

export const followUpsRoute = await import(at("apps/dashboard/app/api/v1/ask/follow-ups/route.ts"));

export const { followUpsNow } = await import(at("apps/dashboard/src/server/readers/notifications.ts"));

export const thread = await import(at("apps/dashboard/app/api/v1/ask/threads/[id]/route.ts"));

export const metrics = await import(at("apps/dashboard/app/api/v1/metrics/route.ts"));

export const reports = await import(at("apps/dashboard/app/api/v1/reports/route.ts"));

export const campaigns = await import(at("apps/dashboard/app/api/v1/reports/campaigns/route.ts"));

export const reviews = await import(at("apps/dashboard/app/api/v1/reports/reviews/route.ts"));

export const receptionist = await import(at("apps/dashboard/app/api/v1/reports/receptionist/route.ts"));

export const people = await import(at("apps/dashboard/app/api/v1/reports/people/route.ts"));

export const campaignsLedger = await import(at("apps/dashboard/app/api/v1/reports/campaigns/ledger/route.ts"));

export const { readerCache, readerContext } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

export const warm = await import(at("apps/dashboard/app/api/v1/ask/warm/route.ts"));

export const { buildContext, clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));

beforeEach(() => setRateStore(memoryStore()));

// The workspace's facts are kept across turns in the module: each test starts with none kept.
beforeEach(() => readerCache.clear());

// And the page contexts the warm keeps for a minute.
beforeEach(() => clearContextCache());

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";

export const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

export const T3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";

export const PAST_MORNING = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";

export const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

export const USER = "u1";

export const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});

/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
export const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];

export const ctxFor = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});

export const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);

export const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const inA = `?workspace=${A}`;

export const inB = `?workspace=${B}`;

export async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

/** Every row the code under test wrote, changed or removed. */
export const writes = (ctx) =>
  ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

export const threadRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  user_id: USER,
  title: "Who booked this week?",
  scope: null,
  last_at: "2026-09-10T00:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  ...over,
});

export const turn = (id, thread_id, tenant_id, role, content) => ({
  id,
  thread_id,
  tenant_id,
  user_id: USER,
  role,
  content,
  created_at: "2026-09-10T00:00:01Z",
});

/**
 * Every block a question was asked with: the person's last turn, and the turn's words after it as the operator's (the
 * answer canvas, A3). An effort message has none.
 */
export const askedBlocks = (req) => {
  const at = req.messages.findLastIndex((m) => m.role === "user");
  return req.messages
    .slice(at)
    .filter((m) => m.role !== "assistant")
    .flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content) }]));
};

/* ---------------------------------------- a quick answer, kept (the review's A1) */

export const CONV = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

/** Who needs me, as the Line draws it from Today's queue (contracts needsAnswer): Nora, waiting on her thread. */
export const noraWaits = () =>
  needsAnswer(
    {
      people: [
        {
          kind: "thread",
          id: CONV,
          who: "Nora",
          channel: "WhatsApp",
          when: "waited 2h",
          line: "“Can I come at 3?”",
          to: `inbox/${CONV}`,
        },
      ],
      more: 0,
      runs: [],
      searches: [],
      windows: [],
    },
    "en",
  );

/* ---------------------------------------- Ask's follow-ups, come due (the closed-loop read, 17 Oct 2026) */

/** A follow-up as the member's views keep it (contracts AskFollowUp): a day's on the 17th, an event's on its subject. */
export const kept = (id, wake, over = {}) => ({
  id,
  said: `When ${id} comes, I'll look at it`,
  prompt: `${id} came: look at it and propose what fits.`,
  wake,
  subject: wake === "date" ? null : `subject-${id}`,
  on: wake === "date" ? "2026-10-17" : null,
  made_at: "2026-10-15T09:00:00Z",
  ...over,
});

/** The caller's membership in harbor, with their views, the workspace's clock beside it as the sign-in reads it. */
export const keeping = (views) => [
  {
    user_id: USER,
    tenant_id: A,
    role: "owner",
    tenants: { slug: "harbor", name: "Harbor", timezone: "America/New_York" },
    created_at: "2026-01-01T00:00:00Z",
    views,
  },
];

/* ------------------------------------------------ a search keeps its thread (00172) -- */

export const SEARCH = "55555555-5555-4555-8555-555555555551";

export const PLANNED = "dddddddd-dddd-4ddd-8ddd-ddddddddddd9";

/** A search waiting on its question, as lead_searches_view answers it. */
export const waitingSearch = (over = {}) => ({
  id: SEARCH,
  tenant_id: A,
  name: "Pilates studios · Denver",
  asked: "Pilates studios in Denver, no franchises",
  plan: { ...PLAN, exclusions: [{ key: "franchises", text: "Franchises", origin: "you_said" }] },
  state: "waiting_on_owner",
  question: { sentence: "Most of the first 25 are franchises, which I'm leaving out. Is that what you meant?" },
  plan_version: 1,
  thread_id: PLANNED,
  ...over,
});

export const nothing = { kind: "none", id: "", label: "" };

export const answered = JSON.stringify({
  say: { headline: "Here is the search with the franchises in.", detail: "" },
  show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: nothing } },
  do: { open: { source: nothing, label: "", now: false }, next: [] },
  language: "en",
});

/** The model, scripted: every round answers in words; what it was sent each round is kept. `ports` adds to the ports. */
export function wordsOnly(ports = {}) {
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(call.request);
      onText(answered);
      return {
        blocks: [{ type: "text", id: "", name: "", text: answered, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    ...ports,
  });
  return requests;
}

export const leadWorld = (threads = [], messages = []) => ({
  memberships: both("owner", "owner"),
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
  policies: [],
  ask_threads: threads,
  ask_messages: messages,
  lead_searches_view: [waitingSearch()],
});

/** The question itself: the last text of the question's message, after the page's data; the turn's words follow it. */
export const lastUser = (req) => {
  const m = req.messages.findLast((x) => x.role === "user");
  return typeof m.content === "string" ? m.content : (m.content.filter((c) => c.type === "text").at(-1)?.text ?? "");
};

export const linesOf = async (res) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

/* ------------------------------------------------ a long thread, and the scope of each turn (Phase 5, 5.1) -- */

/** A stored thread of `n` rows, a question and its answer in turn, a minute apart, the first at `from`. */
export const longThread = (n, from = Date.parse("2026-09-20T12:00:00Z")) =>
  Array.from({ length: n }, (_, i) => ({
    ...turn(
      `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}`,
      T1,
      A,
      i % 2 ? "assistant" : "user",
      i % 2 ? { v: 2, text: `Answer ${i}.` } : { text: `Question ${i}?` },
    ),
    created_at: new Date(from + i * 60_000).toISOString(),
  }));

export const askWorld = (threads = [], messages = []) => ({
  memberships: both("owner", "viewer"),
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
  policies: [],
  ask_threads: threads,
  ask_messages: messages,
});

/* ------------------------------------ the turn as the model was sent it, kept on its row (Phase 5, 5.3) -- */

export const { GatewayRefused } = await import(at("apps/dashboard/src/server/shared/model/gateway.ts"));

/**
 * The prefix a request says (the Phase 5 plan, D2): the sha256 of what it sent besides its messages -- system and tools
 * as sent, the tool choice, and the output config.
 */
export const prefixOf = (request) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        system: request.system,
        tools: request.tools,
        tool_choice: request.tool_choice,
        output_config: request.output_config,
      }),
    )
    .digest("hex");

/**
 * A request's messages less the cache's markers it carried (the Phase 5 plan, D10): the markers ride on each request's
 * own copy, so what the turn keeps of a request is these.
 */
export const unmark = (messages) =>
  messages.map((m) =>
    Array.isArray(m.content) ? { ...m, content: m.content.map(({ cache_control: _cc, ...b }) => b) } : m,
  );

/** A card the scripted model proposes, the same bytes every turn. */
export const CARD = {
  id: "p-1",
  kind: "policy",
  needs: "operator",
  title: "Autonomy: reply",
  summary: "Ask first on every reply.",
  payload: { class: "reply", mode: "ask" },
  undo: null,
};

export const SIGNATURE = "EmwKAhgBEgxzaWduYXR1cmU=";

/**
 * The model, scripted: one round that thinks, proposes a card and answers beside it -- a turn that ends on a call no
 * request answered -- each request kept as it was sent.
 */
export function besideACard() {
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      onText(answered);
      return {
        blocks: [
          { type: "thinking", id: "", name: "", text: "", json: "", thinking: "", signature: SIGNATURE },
          {
            type: "tool_use",
            id: "t-card",
            name: "propose_settings",
            text: "",
            json: '{"action":"autonomy","class":"reply","mode":"ask"}',
          },
          { type: "text", id: "", name: "", text: answered, json: "" },
        ],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    propose: async () => ({ proposal: CARD, result: JSON.stringify({ proposed: true, id: CARD.id }), isError: false }),
  });
  return requests;
}

/** What `fn` answered, and every line console.log printed while it ran. */
export async function printed(fn) {
  const said = [];
  const was = console.log;
  console.log = (...parts) => said.push(parts.join(" "));
  try {
    return { value: await fn(), said };
  } finally {
    console.log = was;
  }
}

/** A caller over a database in memory that keeps a turn's content as jsonb does: its objects' keys in jsonb's order. */
export const asJsonb = (tables, params = {}) => ({
  supabase: fakeDb(tables, {}, {}, { jsonb: ["ask_messages.content"] }),
  userId: USER,
  email: "ada@example.com",
  params,
});

/**
 * Every read of a turn's rows `ctx` made: none of the whole content and none of the raw turn, each key of a turn it
 * reads by its JSON path (PostgREST's alias:column->key).
 */
export function readByPath(ctx) {
  const reads = ctx.supabase.seen.filter((q) => q.table === "ask_messages" && q.op === "select");
  assert.ok(reads.length > 0, "the turns were read");
  for (const { columns } of reads) {
    const cols = columns.split(",").map((c) => c.trim());
    assert.ok(!cols.includes("content") && !cols.includes("*"), `never the whole content: ${columns}`);
    assert.ok(!columns.includes("raw"), `never the raw turn: ${columns}`);
    assert.ok(
      cols.filter((c) => c.includes("content")).every((c) => /^\w+:content->\w+$/.test(c)),
      `each key by its path: ${columns}`,
    );
  }
}
