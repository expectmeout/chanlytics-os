/**
 * route(): the policy a route declares, run.
 *
 * Every /v1 route states its scope, role, rate, spend and input, and one
 * pipeline enforces them in a fixed order. These build routes here and call
 * their `run` (everything after the session) against a database in memory, so
 * what is proved is the refusals and their order, not the text of a handler.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// The platform scope builds its service client from these. Nothing here dials
// it: the limiter is held in memory below, and the platform check is an RPC
// the fake database answers.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const { read, write, workspace, account, platform, row } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/route.ts")).href);
const { setRateStore, memoryStore } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/rate-limit.ts")).href);

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** Harbor is the older membership, Bayside the newer. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const only = (role) => [membership(A, role, "harbor", "2026-01-01T00:00:00Z")];

const ctxFor = (tables, { params = {}, rpcs = {} } = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const post = (q = "", body) =>
  new Request(`http://localhost/api/v1/x${q}`, { method: "POST", body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}

/** A handler that reports what the pipeline handed it. */
const echo = async ({ member, row: r, input, office }) => ({ tenantId: member?.tenantId ?? null, role: member?.role ?? null, row: r ?? null, input: input ?? null, office: !!office });

test("a named workspace resolves by id or slug, and one the caller is not in is a 404", async () => {
  const GET = read({ scope: workspace, handle: echo });
  const tables = { memberships: both("owner", "viewer") };
  assert.equal((await GET.run(get(`?workspace=${B}`), ctxFor(tables))).tenantId, B);
  assert.equal((await GET.run(get("?workspace=bayside"), ctxFor(tables))).tenantId, B, "by slug");
  await refused(GET.run(get("?workspace=someone-elses"), ctxFor(tables)), "not_found", 404);
});

test("naming nothing: an account in two workspaces is refused as choose_workspace, on a read as on a write; one membership is never ambiguous", async () => {
  const GET = read({ scope: workspace, handle: echo });
  const POST = write({ scope: workspace, role: "viewer", rate: null, handle: echo });
  const tables = { memberships: both("viewer", "owner") };
  await refused(GET.run(get(), ctxFor(tables)), "choose_workspace", 400);
  assert.equal((await GET.run(get(`?workspace=${B}`), ctxFor(tables))).tenantId, B, "named, it proceeds");
  assert.equal((await GET.run(get(), ctxFor({ memberships: only("viewer") }))).tenantId, A, "one membership is never ambiguous");
  await refused(POST.run(post(), ctxFor(tables)), "choose_workspace", 400);
  assert.equal((await POST.run(post(`?workspace=${B}`), ctxFor(tables))).tenantId, B, "named, it proceeds");
  assert.equal((await POST.run(post(), ctxFor({ memberships: only("viewer") }))).tenantId, A, "one membership is never ambiguous");
});

async function loadConversation(ctx, params) {
  const { data, error } = await ctx.supabase.from("conversations").select("id, tenant_id").eq("id", params.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "Conversation not found.");
  return data;
}

test("row(): the workspace is the row's, and the role is judged where the row lives", async () => {
  const POST = write({ scope: row(loadConversation), role: "operator", rate: null, handle: echo });
  const conversations = [{ id: "c-in-bayside", tenant_id: B }];
  // An owner of Harbor who is only a viewer at Bayside, with Harbor open in the tab.
  await refused(
    POST.run(post(`?workspace=${A}`), ctxFor({ memberships: both("owner", "viewer"), conversations }, { params: { id: "c-in-bayside" } })),
    "forbidden",
    403,
  );
  const ok = await POST.run(post(`?workspace=${A}`), ctxFor({ memberships: both("viewer", "operator"), conversations }, { params: { id: "c-in-bayside" } }));
  assert.equal(ok.tenantId, B, "the row's workspace, whatever the tab named");
  assert.equal(ok.row.id, "c-in-bayside", "and the handler gets the row it was judged by");
  await refused(POST.run(post(), ctxFor({ memberships: both("owner", "owner"), conversations }, { params: { id: "c-elsewhere" } })), "not_found", 404);
});

test("a viewer is refused before a token is spent: every token is still there afterwards", async () => {
  // lines_buy allows three an hour.
  const POST = write({ scope: workspace, role: "operator", rate: "lines_buy", handle: echo });
  const tables = { memberships: only("viewer") };
  for (let i = 0; i < 5; i++) await refused(POST.run(post(), ctxFor(tables)), "forbidden", 403);
  tables.memberships[0].role = "operator";
  for (let i = 0; i < 3; i++) await POST.run(post(), ctxFor(tables));
  await refused(POST.run(post(), ctxFor(tables)), "rate_limited", 429);
});

test("a null rate takes no token", async () => {
  const POST = write({ scope: workspace, role: "viewer", rate: null, handle: echo });
  const tables = { memberships: only("viewer") };
  for (let i = 0; i < 10; i++) await POST.run(post(), ctxFor(tables));
});

test("spend: no billing record, or no card on a Stripe workspace, is a 402; a direct one may", async () => {
  const POST = write({ scope: workspace, role: "owner", rate: null, spend: true, handle: echo });
  const memberships = only("owner");
  await refused(POST.run(post(), ctxFor({ memberships, billing_accounts: [] })), "payment_required", 402);
  await refused(POST.run(post(), ctxFor({ memberships, billing_accounts: [{ tenant_id: A, mode: "stripe", status: "none" }] })), "payment_required", 402);
  assert.equal((await POST.run(post(), ctxFor({ memberships, billing_accounts: [{ tenant_id: A, mode: "direct", status: "none" }] }))).tenantId, A);
});

test("the body is judged last, names every field it refuses, and reaches the handler parsed", async () => {
  const Input = z.object({ until: z.string().datetime({ message: "must be a time" }), note: z.string().max(5).optional() });
  const POST = write({ scope: workspace, role: "operator", rate: null, input: Input, handle: echo });
  const op = { memberships: only("operator") };
  await refused(POST.run(post("", { until: 5 }), ctxFor({ memberships: only("viewer") })), "forbidden", 403);
  await assert.rejects(POST.run(post("", { until: 5, note: "far too long" }), ctxFor(op)), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /until: /);
    assert.match(e.message, /note: /);
    // A5: the envelope carries each field by name, for the form to mark the box it belongs to.
    assert.deepEqual(Object.keys(e.details?.fields ?? {}).sort(), ["note", "until"], "REGRESSION: the fields were only ever joined into one sentence");
    assert.ok(e.message.includes(`until: ${e.details.fields.until}`), "each field's sentence is the one the message joins");
    return true;
  });
  await assert.rejects(POST.run(post("", "{not json"), ctxFor(op)), (e) => e.code === "validation" && /Expected a JSON body/.test(e.message));
  await assert.rejects(POST.run(post("", ""), ctxFor(op)), (e) => e.code === "validation" && /until/.test(e.message), "an empty body is {} and the schema decides");
  assert.deepEqual((await POST.run(post("", { until: "2026-09-11T15:00:00Z" }), ctxFor(op))).input, { until: "2026-09-11T15:00:00Z" });
});

test("A5: a refusal names what the page can act on -- the role the door wanted, and when a limit lifts, in the header a client reads", async () => {
  const OWNER = write({ scope: workspace, role: "owner", rate: null, handle: echo });
  await assert.rejects(OWNER.run(post(), ctxFor({ memberships: only("operator") })), (e) => e.code === "forbidden" && e.details?.needs === "owner");
  const OPERATOR = write({ scope: workspace, role: "operator", rate: null, handle: echo });
  await assert.rejects(OPERATOR.run(post(), ctxFor({ memberships: only("viewer") })), (e) => e.code === "forbidden" && e.details?.needs === "operator");
  const { refusalHeaders } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/with-route.ts")).href);
  assert.deepEqual(refusalHeaders(new AppError("rate_limited", "Too many replies in a short time — try again in 40 seconds.", 429, { retry_after_s: 40 })), { "retry-after": "40" }, "REGRESSION: a 429 never carried Retry-After");
  assert.deepEqual(refusalHeaders(new AppError("rate_limited", "Too many.", 429, { retry_after_s: 12.2 })), { "retry-after": "13" }, "whole seconds, rounded up");
  assert.deepEqual(refusalHeaders(new AppError("rate_limited", "Too many.", 429)), {}, "nothing counted, nothing promised");
  assert.deepEqual(refusalHeaders(new AppError("forbidden", "Only an owner can do this.", 403, { needs: "owner" })), {}, "only a limit says when");
});

test("the order holds: 403, then 429, then 400", async () => {
  const POST = write({ scope: workspace, role: "operator", rate: "lines_buy", input: z.object({ n: z.number() }), handle: echo });
  await refused(POST.run(post("", { n: "x" }), ctxFor({ memberships: only("viewer") })), "forbidden");
  const op = { memberships: only("operator") };
  for (let i = 0; i < 3; i++) await refused(POST.run(post("", { n: "x" }), ctxFor(op)), "validation");
  await refused(POST.run(post("", { n: "x" }), ctxFor(op)), "rate_limited", 429);
});

test("a read's query is parsed, without the workspace in it", async () => {
  const GET = read({ scope: workspace, query: z.object({ days: z.coerce.number().int().max(90) }).strict(), handle: echo });
  const tables = { memberships: only("viewer") };
  assert.deepEqual((await GET.run(get(`?workspace=${A}&days=30`), ctxFor(tables))).input, { days: 30 });
  await refused(GET.run(get("?days=500"), ctxFor(tables)), "validation", 400);
});

test("platform: the database decides who is staff; account: nothing is resolved", async () => {
  const GET = read({ scope: platform, handle: echo });
  await refused(GET.run(get(), ctxFor({}, { rpcs: { is_platform_admin: () => false } })), "not_found", 404);
  assert.equal((await GET.run(get(), ctxFor({}, { rpcs: { is_platform_admin: () => true } }))).office, true);
  // No memberships table at all: an account-scoped route never asks.
  const PUT = write({ scope: account, role: null, rate: null, handle: async ({ ctx }) => ctx.userId });
  assert.equal(await PUT.run(post(), ctxFor({})), USER);
});

test("the policy a route declares is the policy it carries", () => {
  const POST = write({ scope: row(loadConversation), role: "operator", rate: "reply", handle: echo });
  assert.deepEqual({ ...POST.policy }, { kind: "write", scope: "row", role: "operator", rate: "reply", spend: false });
  assert.deepEqual({ ...read({ scope: account, handle: echo }).policy }, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  assert.equal(typeof POST, "function", "and it is still the handler Next calls");
});

test("the export carries what the route takes and answers, as a type the client can read, and nothing at runtime", () => {
  // Types are erased, so the executed half is that nothing is added at runtime;
  // the typed half is the generated registry compiling against every export.
  const GET = read({ scope: workspace, query: z.object({ days: z.string().optional() }), handle: async () => ({ n: 1 }) });
  assert.deepEqual(Object.keys(GET).sort(), ["policy", "run"], "a phantom type adds nothing at runtime");
  assert.deepEqual(Object.getOwnPropertySymbols(GET), [], "and no symbol either");
});
