/**
 * The reach-out routes (Reach out, Part 4 PR 5), run through route(): the real route modules, their `run` called with
 * a database in memory, the doors (00211) answered through the double's rpcs, the service role's save through a
 * double of its own, and the edge through a stubbed fetch. What is proved is the policy each declares, what reaches
 * the doors, and the words each answer says (contracts'): R13–R18, R22, R23.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REACH_OUT_REFUSALS, reachOutSendsFrom, startWords } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The edge is reached from here (a stubbed fetch): a deployment that may reach the providers, with a credential.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const server = await import(at("apps/dashboard/src/server/campaigns/reach-outs.ts"));
const chains = await import(at("apps/dashboard/app/api/v1/reach-outs/route.ts"));
const chain = await import(at("apps/dashboard/app/api/v1/reach-outs/[id]/route.ts"));
const preview = await import(at("apps/dashboard/app/api/v1/reach-outs/preview/route.ts"));
const reach = await import(at("apps/dashboard/app/api/v1/reach-outs/reach/route.ts"));
const decide = await import(at("apps/dashboard/app/api/v1/reach-out-sends/[id]/decide/route.ts"));
const recheck = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/recheck/route.ts"));
const playbook = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const ROOT_ID = "22222222-2222-4222-8222-222222222222";
const STEP2 = "33333333-3333-4333-8333-333333333333";
const SEARCH = "44444444-4444-4444-8444-444444444444";
const RUN = "55555555-5555-4555-8555-555555555555";
const SEND = "66666666-6666-4666-8666-666666666666";
const T1 = "77777777-7777-4777-8777-777777777771";
const T2 = "77777777-7777-4777-8777-777777777772";

const membership = (role) => [
  { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
];
const paying = [{ tenant_id: A, mode: "direct", status: "active" }];
const pgError = (code, message) => Object.assign(new Error(message), { code });

/** Harbor's one chain over its trainers search: the first email and a nudge four days on. */
const tables = (role = "operator", over = {}) => ({
  memberships: membership(role),
  billing_accounts: paying,
  tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/Chicago" }],
  tenant_config: [{ tenant_id: A, config: { brain: { booking_link: "https://example.com/book" } } }],
  policies: [{ tenant_id: A, class: "outreach", mode: "ask", subject_type: null }],
  lead_searches: [{ id: SEARCH, tenant_id: A, name: "Personal trainers · Austin" }],
  playbooks: [
    {
      id: STEP2,
      tenant_id: A,
      kind: "reach_out",
      name: "Reach out · Personal trainers · a nudge",
      state: "running",
      trigger: "after_step",
      lead_search_id: null,
      after_playbook_id: ROOT_ID,
      after_days: 4,
      gap_minutes: 12,
      domain_ids: [],
      signed_by: null,
      include_unconfirmed: false,
      template_id: T2,
      run_hour: 9,
      last_run_for: null,
      created_at: "2026-09-20T00:00:00Z",
    },
    {
      id: ROOT_ID,
      tenant_id: A,
      kind: "reach_out",
      name: "Reach out · Personal trainers",
      state: "running",
      trigger: "lead_first",
      lead_search_id: SEARCH,
      after_playbook_id: null,
      after_days: null,
      gap_minutes: 12,
      domain_ids: [],
      signed_by: "Sam",
      include_unconfirmed: false,
      template_id: T1,
      run_hour: 9,
      last_run_for: "2026-09-24",
      created_at: "2026-09-20T00:00:00Z",
    },
    {
      id: "99999999-9999-4999-8999-999999999999",
      tenant_id: A,
      kind: "moment",
      name: "Win-back",
      state: "running",
      trigger: "quiet_30",
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  templates: [
    {
      id: T1,
      tenant_id: A,
      channel: "email",
      components: [
        { type: "HEADER", format: "TEXT", text: "Quick one for {{business}}" },
        { type: "BODY", text: "{{opening}}\n\nI run Harbor.\n\n{{your name}}" },
      ],
      body_preview: "{{opening}}",
    },
    {
      id: T2,
      tenant_id: A,
      channel: "email",
      components: [{ type: "BODY", text: "Just checking in." }],
      body_preview: "",
    },
  ],
  broadcasts: [
    {
      id: RUN,
      tenant_id: A,
      name: "Reach out · Personal trainers",
      state: "pending_approval",
      audience: { kind: "reach_out", root_id: ROOT_ID, step_id: ROOT_ID, search_id: SEARCH },
      playbook_id: ROOT_ID,
      run_for: "2026-09-28",
      recipient_count: 3,
    },
  ],
  reach_out_sends: [],
  sending_domains: [],
  decisions: [],
  ...over,
});
const CLEAN = "2026-09-01T00:00:00Z";
const ctxFor = (t, params = {}, rpcs = {}) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const inA = `?workspace=${A}`;
const get = (q = inA) => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = inA) =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

/** The edge, as a stubbed fetch: each call recorded, each door answered by `doors[path]`. */
function edge(doors = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push({ path: u.pathname, body: JSON.parse(String(init?.body ?? "{}")), headers: init?.headers ?? {} });
    const answer = doors[u.pathname];
    if (answer instanceof Error) throw answer;
    const [status, body] = answer ?? [404, { ok: false, error: "not_found" }];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return calls;
}

/** The service role's save, as the door answers it: what it was asked, recorded. */
function serviceSave(answer = () => ({ root_id: ROOT_ID, step_ids: [ROOT_ID, STEP2], rechecked: 0 })) {
  const asked = [];
  setServiceClient(
    fakeDb(
      {},
      {},
      {
        reach_out_save: (a) => {
          asked.push(a);
          return answer(a);
        },
      },
    ),
  );
  return asked;
}

const CHAIN = (over = {}) => ({
  name: "Reach out · Personal trainers",
  search_id: SEARCH,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps: [
    { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null },
    { subject: null, body: "Just checking in.", after_days: 4 },
  ],
  ...over,
});

beforeEach(() => {
  setRateStore(memoryStore());
  globalThis.fetch = realFetch;
});

test("each route declares its policy: members read, owners and operators write, the preview spends in its own bucket (R12, R18)", () => {
  const p = (h) => ({ ...h.policy });
  assert.deepEqual(p(chains.GET), { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
  assert.deepEqual(p(chains.POST), {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "playbook",
    spend: false,
  });
  assert.deepEqual(p(chain.GET), { kind: "read", scope: "row", role: null, rate: null, spend: false });
  assert.deepEqual(p(chain.PUT).scope, "row");
  assert.deepEqual(p(chain.DELETE).role, "operator");
  assert.deepEqual(p(preview.POST), {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "reach_out_preview",
    spend: true,
  });
  assert.deepEqual(p(decide.POST), { kind: "write", scope: "row", role: "operator", rate: "playbook", spend: false });
  assert.deepEqual(p(recheck.POST).scope, "row");
});

test("GET reach-outs lists each chain, steps in order, with what decides its next run, and reads no report (R23)", async () => {
  const ctx = ctxFor(tables("viewer"));
  const { chains: list } = await chains.GET.run(get(), ctx);
  assert.equal(list.length, 1, "the moment is not a chain");
  const c = list[0];
  assert.deepEqual(
    [c.root_id, c.name, c.search, c.state, c.gap_minutes, c.signed_by],
    [
      ROOT_ID,
      "Reach out · Personal trainers",
      { id: SEARCH, name: "Personal trainers · Austin" },
      "running",
      12,
      "Sam",
    ],
  );
  assert.deepEqual(
    c.steps.map((s) => [s.id, s.n, s.after_days, s.subject, s.body]),
    [
      [ROOT_ID, 0, null, "Quick one for {{business}}", "{{opening}}\n\nI run Harbor.\n\n{{your name}}"],
      [STEP2, 1, 4, null, "Just checking in."],
    ],
  );
  assert.deepEqual(c.next, {
    run_hour: 9,
    last_run_for: "2026-09-24",
    mode: "ask",
    may_spend: true,
    waiting_run_id: RUN,
  });
  assert.equal(
    ctx.supabase.seen.some((s) => s.rpc === "reach_out_chain_report"),
    false,
    "the report is read when a row is opened",
  );
});

test("POST reach-outs: an operator's chain is validated, saved by the service role with the member's id, then started through the run-now door; its answer is said (R13–R15)", async () => {
  const asked = serviceSave();
  const calls = edge({
    "/api/admin/playbooks-run": [
      200,
      { ok: true, outcome: "held", reason: "waiting_for_you", planned: 30, run_id: RUN, run_for: "2026-09-28" },
    ],
  });
  const ctx = ctxFor(tables());
  const out = await chains.POST.run(send("POST", CHAIN()), ctx);
  assert.deepEqual(asked[0], {
    p_tenant_id: A,
    p_user_id: USER,
    p_chain: { ...CHAIN(), root_id: null },
  });
  assert.deepEqual(
    calls.map((c) => [c.path, c.body]),
    [["/api/admin/playbooks-run", { tenant_id: A, playbook_id: ROOT_ID, user_id: USER }]],
    "no second run-now door",
  );
  assert.deepEqual(out, {
    root_id: ROOT_ID,
    step_ids: [ROOT_ID, STEP2],
    rechecked: 0,
    start: { outcome: "held", reason: "waiting_for_you", planned: 30, run_id: RUN },
  });
  assert.equal(startWords(out.start).text, "Planned 30 emails. The first run waits on you: open it to approve.");
  assert.equal(ctx.supabase.seen.filter((s) => s.table === "decisions" && s.op === "insert").length, 1);

  // Held for billing: said as it is, never "within the hour" (R14).
  edge({
    "/api/admin/playbooks-run": [200, { ok: true, outcome: "held", reason: "billing", planned: 0, run_id: null }],
  });
  const billing = await chains.POST.run(send("POST", CHAIN()), ctxFor(tables()));
  assert.deepEqual(billing.start, { outcome: "held", reason: "billing", planned: 0, run_id: null });
  // The edge not reached: the sweep plans it, and only then is "within the hour" said.
  edge({ "/api/admin/playbooks-run": new TypeError("fetch failed") });
  const down = await chains.POST.run(send("POST", CHAIN()), ctxFor(tables()));
  assert.deepEqual(down.start, { outcome: "unreached", reason: null, planned: 0, run_id: null });
  assert.equal(startWords(down.start).text, "Saved. The first run is planned within the hour.");
});

test("POST reach-outs refuses before the door: a viewer, a slot that is none of six, a booking link the workspace lacks, a pace the sheet does not offer", async () => {
  const asked = serviceSave();
  edge();
  await refused(chains.POST.run(send("POST", CHAIN()), ctxFor(tables("viewer"))), "forbidden", 403);
  const firstName = CHAIN({
    steps: [{ subject: "Hi", body: "Hi {{first name}}", after_days: null }],
  });
  await refused(
    chains.POST.run(send("POST", firstName), ctxFor(tables())),
    "validation",
    422,
    "{{first name}} isn't one of the slots. Use the chips below.",
  );
  const link = CHAIN({ steps: [{ subject: "Hi", body: "Book here: {{booking link}}", after_days: null }] });
  await refused(
    chains.POST.run(send("POST", link), ctxFor(tables("operator", { tenant_config: [] }))),
    "validation",
    422,
    "Your words name {{booking link}}. Add your booking link in Settings › Business first.",
  );
  await refused(chains.POST.run(send("POST", CHAIN({ gap_minutes: 7 })), ctxFor(tables())), "validation", 400);
  assert.equal(asked.length, 0, "the door was never asked");
});

test("the door's refusals are said in contracts' words: a search with a chain is 409, a step out of its place 422 (R15)", async () => {
  serviceSave(() => {
    throw pgError("23505", REACH_OUT_REFUSALS.exists);
  });
  edge();
  await refused(chains.POST.run(send("POST", CHAIN()), ctxFor(tables())), "conflict", 409, REACH_OUT_REFUSALS.exists);
  const asked = serviceSave(() => {
    throw pgError("22023", REACH_OUT_REFUSALS.outOfPlace);
  });
  await refused(
    chain.PUT.run(send("PUT", CHAIN()), ctxFor(tables(), { id: ROOT_ID })),
    "validation",
    422,
    REACH_OUT_REFUSALS.outOfPlace,
  );
  assert.equal(asked[0].p_chain.root_id, ROOT_ID, "an edit names its chain");
  // A message that is not one of contracts' is never shown as it is.
  serviceSave(() => {
    throw pgError("23514", 'new row for relation "playbooks" violates check constraint "playbooks_reach_out_gap"');
  });
  await refused(
    chain.PUT.run(send("PUT", CHAIN()), ctxFor(tables(), { id: ROOT_ID })),
    "validation",
    422,
    REACH_OUT_REFUSALS.unsaved,
  );
});

test("a chain ending in a call reaches the door with its hand, an email with none; 00228's refusals are said (G20)", async () => {
  const asked = serviceSave();
  edge();
  const hand = { kind: "call", words: "Ask whether our quote suited them" };
  const body = CHAIN({ steps: [CHAIN().steps[0], { subject: null, body: "", after_days: 5, hand }] });
  const out = await chain.PUT.run(send("PUT", body), ctxFor(tables(), { id: ROOT_ID }));
  assert.equal(out.root_id, ROOT_ID);
  const [first, last] = asked[0].p_chain.steps;
  assert.equal("hand" in first, false, "the door reads a step with the key as a call or a note");
  assert.deepEqual(last.hand, hand);
  // A null hand is an email: sent without the key.
  const plain = CHAIN();
  plain.steps[1].hand = null;
  await chain.PUT.run(send("PUT", plain), ctxFor(tables(), { id: ROOT_ID }));
  assert.equal("hand" in asked[1].p_chain.steps[1], false);
  // Checked before the door: a hand step first, or with nothing to do.
  const empty = CHAIN({
    steps: [CHAIN().steps[0], { subject: null, body: "", after_days: 5, hand: { ...hand, words: " " } }],
  });
  await refused(
    chain.PUT.run(send("PUT", empty), ctxFor(tables(), { id: ROOT_ID })),
    "validation",
    422,
    "Say what to do when they come up.",
  );
  const early = CHAIN({ steps: [{ subject: null, body: "", after_days: 5, hand }, CHAIN().steps[1]] });
  await refused(chain.PUT.run(send("PUT", early), ctxFor(tables(), { id: ROOT_ID })), "validation", 422);
  assert.equal(asked.length, 2, "the door was not asked for either");
  // The door's own, said as they are.
  serviceSave(() => {
    throw pgError("22023", REACH_OUT_REFUSALS.handLast);
  });
  await refused(
    chain.PUT.run(send("PUT", body), ctxFor(tables(), { id: ROOT_ID })),
    "validation",
    422,
    REACH_OUT_REFUSALS.handLast,
  );
  serviceSave(() => {
    throw pgError("23503", REACH_OUT_REFUSALS.stepRan);
  });
  await refused(
    chain.PUT.run(send("PUT", body), ctxFor(tables(), { id: ROOT_ID })),
    "conflict",
    409,
    REACH_OUT_REFUSALS.stepRan,
  );
});

test("PUT reach-outs/[id] saves an edit and runs nothing; a step is not a chain (404)", async () => {
  serviceSave(() => ({ root_id: ROOT_ID, step_ids: [ROOT_ID], rechecked: 7 }));
  const calls = edge();
  const out = await chain.PUT.run(send("PUT", CHAIN({ steps: [CHAIN().steps[0]] })), ctxFor(tables(), { id: ROOT_ID }));
  assert.deepEqual(out, { root_id: ROOT_ID, step_ids: [ROOT_ID], rechecked: 7, start: null });
  assert.equal(calls.length, 0);
  await refused(
    chain.PUT.run(send("PUT", CHAIN()), ctxFor(tables(), { id: STEP2 })),
    "not_found",
    404,
    REACH_OUT_REFUSALS.notFound,
  );
});

test("GET reach-outs/[id] reads its report and its search's reach; DELETE goes through its door, and one that wrote is paused instead (R16)", async () => {
  const report = { steps: [], runs: [], can_remove: false };
  const reachOf = { ready: 44, with_unconfirmed: 88, phone_only: 72, of: 160, chain: ROOT_ID };
  const rpcs = { reach_out_chain_report: () => report, reach_out_reach: () => reachOf };
  const read = await chain.GET.run(get(), ctxFor(tables("viewer"), { id: ROOT_ID }, rpcs));
  assert.deepEqual(read, { report, reach: reachOf });

  const removed = [];
  const ok = ctxFor(tables(), { id: ROOT_ID }, { reach_out_remove: (a) => (removed.push(a), { root_id: ROOT_ID }) });
  assert.deepEqual(await chain.DELETE.run(send("DELETE"), ok), { removed: true, id: ROOT_ID });
  assert.deepEqual(removed, [{ p_tenant_id: A, p_root_id: ROOT_ID }]);
  const wrote = ctxFor(
    tables(),
    { id: ROOT_ID },
    {
      reach_out_remove: () => {
        throw pgError("23503", "This reach-out has written already. Pause it instead.");
      },
    },
  );
  await refused(
    chain.DELETE.run(send("DELETE"), wrote),
    "conflict",
    409,
    "This reach-out has written already. Pause it instead.",
  );
  await refused(chain.DELETE.run(send("DELETE"), ctxFor(tables("viewer"), { id: ROOT_ID })), "forbidden", 403);
});

test("DELETE playbooks/[id] refuses a reach-out's step: its history is never deleted there (R16)", async () => {
  for (const id of [ROOT_ID, STEP2]) {
    const ctx = ctxFor(tables(), { id });
    await refused(playbook.DELETE.run(send("DELETE"), ctx), "conflict", 409, REACH_OUT_REFUSALS.notHere);
    assert.equal(ctx.supabase.seen.filter((s) => s.op === "delete").length, 0);
  }
});

test("POST reach-outs/preview asks the edge with who asked, and says the budget, the deployment and a failure in words (R12)", async () => {
  const p = {
    lead: null,
    subject: null,
    body: null,
    opening: null,
    angle: null,
    hold: null,
    detail: null,
    refused: null,
    unavailable: false,
  };
  const calls = edge({ "/api/admin/reach-out-preview": [200, { ok: true, preview: p }] });
  const body = {
    search_id: SEARCH,
    index: 3,
    include_unconfirmed: false,
    words: { subject: "Hi", body: "{{opening}}" },
    signed_by: "Sam",
  };
  assert.deepEqual(await preview.POST.run(send("POST", body), ctxFor(tables())), { preview: p });
  assert.deepEqual(calls[0].body, { ...body, language: "en", tenant_id: A, user_id: USER });
  assert.ok(calls[0].headers["x-edge-token"], "a token for the door's full path");
  edge({ "/api/admin/reach-out-preview": [429, { ok: false, error: "ask_budget" }] });
  await refused(preview.POST.run(send("POST", body), ctxFor(tables())), "rate_limited", 429, REACH_OUT_REFUSALS.budget);
  edge({ "/api/admin/reach-out-preview": new TypeError("fetch failed") });
  await refused(
    preview.POST.run(send("POST", body), ctxFor(tables())),
    "upstream_anthropic",
    502,
    REACH_OUT_REFUSALS.previewDown,
  );
  await refused(preview.POST.run(send("POST", { ...body, index: 200 }), ctxFor(tables())), "validation", 400);
  // A workspace that may not spend is refused before the model is asked.
  const calls2 = edge();
  await refused(
    preview.POST.run(send("POST", body), ctxFor(tables("operator", { billing_accounts: [] }))),
    "payment_required",
    402,
  );
  assert.equal(calls2.length, 0);
});

test("GET reach-outs/reach answers the door's reach for any member; a search that is not an id is a 400", async () => {
  const r = { ready: 44, with_unconfirmed: 88, phone_only: 72, of: 160, chain: null };
  const asked = [];
  const ctx = ctxFor(tables("viewer"), {}, { reach_out_reach: (a) => (asked.push(a), r) });
  assert.deepEqual(await reach.GET.run(get(`${inA}&search=${SEARCH}`), ctx), r);
  assert.deepEqual(asked, [{ p_tenant_id: A, p_search_id: SEARCH }]);
  await refused(reach.GET.run(get(`${inA}&search=trainers`), ctx), "validation", 400);
});

test("POST reach-out-sends/[id]/decide: the email is the row; each answer passes to the one door, not_a_fit included; past the fortnight Include is refused in words (R10, R18)", async () => {
  const sends = [{ id: SEND, tenant_id: A, broadcast_id: RUN, state: "held", reason: "chain" }];
  const decided = [];
  const rpcs = { reach_out_send_decide: (a) => (decided.push(a), { send_id: a.p_send_id, decision: a.p_decision }) };
  for (const decision of ["include", "rewrite", "skip", "not_a_fit"])
    assert.deepEqual(
      await decide.POST.run(
        send("POST", { decision }),
        ctxFor(tables("operator", { reach_out_sends: sends }), { id: SEND }, rpcs),
      ),
      { send_id: SEND, decision },
    );
  assert.deepEqual(
    decided.map((d) => d.p_decision),
    ["include", "rewrite", "skip", "not_a_fit"],
  );
  await refused(
    decide.POST.run(
      send("POST", { decision: "archive" }),
      ctxFor(tables("operator", { reach_out_sends: sends }), { id: SEND }, rpcs),
    ),
    "validation",
    400,
  );
  await refused(
    decide.POST.run(send("POST", { decision: "skip" }), ctxFor(tables("operator"), { id: SEND }, rpcs)),
    "not_found",
    404,
    REACH_OUT_REFUSALS.sendNotFound,
  );
  await refused(
    decide.POST.run(
      send("POST", { decision: "include" }),
      ctxFor(
        tables("operator", { reach_out_sends: sends }),
        { id: SEND },
        {
          reach_out_send_decide: () => {
            throw pgError("22023", REACH_OUT_REFUSALS.givenUp);
          },
        },
      ),
    ),
    "validation",
    422,
    "This email waited two weeks for your answer and was given up.",
  );
  await refused(
    decide.POST.run(
      send("POST", { decision: "skip" }),
      ctxFor(tables("viewer", { reach_out_sends: sends }), { id: SEND }, rpcs),
    ),
    "forbidden",
    403,
  );
});

test("POST broadcasts/[id]/recheck puts a run's unanswered holds back in one call (R18)", async () => {
  const asked = [];
  const ctx = ctxFor(
    tables(),
    { id: RUN },
    {
      reach_out_run_recheck: (a) => (asked.push(a), { broadcast_id: RUN, rechecked: 200 }),
    },
  );
  assert.deepEqual(await recheck.POST.run(send("POST"), ctx), { broadcast_id: RUN, rechecked: 200 });
  assert.deepEqual(asked, [{ p_broadcast_id: RUN }]);
});

test("a reach-out run's block: today and later from the checked only, the still-checking counted apart, the held with their dates, the first email as it reads, the domains from its sends (R21, R22)", async () => {
  const DOM = "88888888-8888-4888-8888-888888888888";
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const lead = (name) => ({
    business_name: name,
    email: `owner@${name.toLowerCase().replace(/ /g, "")}.example`,
    city: "Austin",
  });
  const s = (id, over) => ({
    id,
    tenant_id: A,
    broadcast_id: RUN,
    lead_id: `lead-${id}`,
    state: "planned",
    reason: null,
    hold_detail: null,
    opening: null,
    angle: null,
    send_at: iso(now + 60_000),
    checked_at: null,
    created_at: iso(now - 3_600_000),
    domain_id: DOM,
    lead: lead(`Studio ${id}`),
    ...over,
  });
  const t = tables("viewer", {
    reach_out_sends: [
      s("a", {
        checked_at: iso(now),
        opening: "A 4.9 from 16 reviews.",
        send_at: iso(now + 120_000),
        angle: "reviews",
      }),
      s("b", { checked_at: iso(now), send_at: iso(now + 3 * 86_400_000) }),
      s("c", {}),
      s("d", { state: "held", reason: "chain", hold_detail: "site:3" }),
      s("e", { state: "skipped", reason: "closed_every_day", domain_id: null }),
    ],
    sending_domains: [{ id: DOM, tenant_id: A, host: "harbor-mail.example", sent_days: 12 }],
  });
  const run = await server.reachOutRunOf(ctxFor(t), A, t.broadcasts[0]);
  assert.deepEqual([run.today, run.later, run.checking], [1, 1, 1]);
  assert.equal(run.first_at, iso(now + 120_000));
  assert.deepEqual(
    run.held.map((h) => [h.send_id, h.reason, h.detail, h.planned_at]),
    [["d", "chain", "site:3", iso(now - 3_600_000)]],
  );
  assert.deepEqual(run.skipped, { closed_every_day: 1 });
  assert.deepEqual(run.first, {
    business_name: "Studio a",
    subject: "Quick one for Studio a",
    body: "A 4.9 from 16 reviews.\n\nI run Harbor.\n\nSam",
    opening: "A 4.9 from 16 reviews.",
    angle: "reviews",
  });
  assert.deepEqual(run.domains, [{ host: "harbor-mail.example", sent_days: 12 }]);
  assert.deepEqual([run.step_n, run.chain_name, run.include_unconfirmed], [0, "Reach out · Personal trainers", false]);
  assert.equal(await server.reachOutRunOf(ctxFor(t), A, { ...t.broadcasts[0], audience: { kind: "everyone" } }), null);
  // A run whose step was dropped from the chain since: no step, said so by the words (R17).
  const dropped = await server.reachOutRunOf(ctxFor(t), A, { ...t.broadcasts[0], playbook_id: null });
  assert.deepEqual([dropped.step_id, dropped.step_n, dropped.first], [null, null, null]);
});

test("the chains read the step's run's own readings: a paused workspace may not spend, and the outreach row is the workspace's own", async () => {
  const paused = await chains.GET.run(
    get(),
    ctxFor(
      tables("viewer", {
        tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/Chicago", status: "paused" }],
      }),
    ),
  );
  assert.equal(paused.chains[0].next.may_spend, false, "a paused workspace may not spend (workspaceMaySpend)");
  const never = await chains.GET.run(
    get(),
    ctxFor(
      tables("viewer", {
        policies: [
          { tenant_id: A, class: "outreach", mode: "never", subject_type: null },
          { tenant_id: A, class: "reengage", mode: "auto", subject_type: null },
        ],
      }),
    ),
  );
  assert.equal(never.chains[0].next.mode, "never");
  // The domains it sends from: every verified one when it names none, with the days each has sent (PR 8's pace).
  const withDomains = await chains.GET.run(
    get(),
    ctxFor(
      tables("viewer", {
        sending_domains: [
          { id: "d1", tenant_id: A, host: "harbor-mail.example", state: "verified", clean_since: CLEAN, sent_days: 12 },
          { id: "d2", tenant_id: A, host: "pending.example", state: "pending", clean_since: null, sent_days: 0 },
        ],
      }),
    ),
  );
  assert.deepEqual(withDomains.chains[0].domains, [{ host: "harbor-mail.example", sent_days: 12 }]);
  // A domain the chain names is its pace only as the run reads it (contracts reachOutSendsFrom): verified and clean. A
  // named held one, a named one still verifying and a named verified one with no clean clock (the run's share of 0) are
  // not said, and neither is a verified one it does not name.
  const domains = [
    { id: "d1", tenant_id: A, host: "harbor-mail.example", state: "verified", clean_since: CLEAN, sent_days: 12 },
    { id: "d2", tenant_id: A, host: "other.example", state: "verified", clean_since: CLEAN, sent_days: 30 },
    { id: "d3", tenant_id: A, host: "held.example", state: "held", clean_since: CLEAN, sent_days: 40 },
    { id: "d4", tenant_id: A, host: "verifying.example", state: "verifying", clean_since: null, sent_days: 0 },
    { id: "d5", tenant_id: A, host: "unclean.example", state: "verified", clean_since: null, sent_days: 0 },
  ];
  const names = ["d1", "d3", "d4", "d5"];
  const named = await chains.GET.run(
    get(),
    ctxFor(
      tables("viewer", {
        playbooks: tables("viewer").playbooks.map((p) => (p.id === ROOT_ID ? { ...p, domain_ids: names } : p)),
        sending_domains: domains,
      }),
    ),
  );
  assert.deepEqual(named.chains[0].domains, [{ host: "harbor-mail.example", sent_days: 12 }]);
  // The run's own rule, the same function: the edge's timetable and re-plan filter by it (run-context.ts, replan.ts).
  assert.deepEqual(
    domains.map((d) => reachOutSendsFrom(d, names)),
    [true, false, false, false, false],
  );
  const none = await chains.GET.run(get(), ctxFor(tables("viewer", { policies: [] })));
  assert.equal(none.chains[0].next.mode, "ask", "no row reads as ask, as the run reads it");
});

test("Not a fit on a lead that is gone says so, in lead_set_stage's own words", async () => {
  const sends = [{ id: SEND, tenant_id: A, broadcast_id: RUN, state: "held", reason: "chain" }];
  await refused(
    decide.POST.run(
      send("POST", { decision: "not_a_fit" }),
      ctxFor(
        tables("operator", { reach_out_sends: sends }),
        { id: SEND },
        {
          reach_out_send_decide: () => {
            throw pgError("P0002", "This lead is gone.");
          },
        },
      ),
    ),
    "not_found",
    404,
    REACH_OUT_REFUSALS.leadGone,
  );
});
