/**
 * The inbox and the calls, run through route(): the real route modules, their
 * `run` called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text. The verbs that reach a
 * provider (a rewrite, a whisper) stop at the production guard on this
 * machine, which is itself the proof that nothing is recorded for a verb that
 * did not happen.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const thread = await import(at("apps/dashboard/app/api/v1/conversations/[id]/route.ts"));
const reply = await import(at("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts"));
const escalations = await import(at("apps/dashboard/app/api/v1/escalations/route.ts"));
const steer = await import(at("apps/dashboard/app/api/v1/messages/[id]/steer/route.ts"));
const calls = await import(at("apps/dashboard/app/api/v1/calls/route.ts"));
const recording = await import(at("apps/dashboard/app/api/v1/calls/[id]/recording/route.ts"));
const whisper = await import(at("apps/dashboard/app/api/v1/calls/[id]/whisper/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const M1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const M2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const M3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const L2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const L3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
const USER = "u1";
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables, params = {}) => ({ supabase: fakeDb(tables), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const post = (body) => new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, why) {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, why ?? e.message); if (status) assert.equal(e.status, status, why); return true; });
}
/** Every row the code under test wrote or changed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => s.op === "insert" || s.op === "update").length;

const contact = (over = {}) => ({ id: "k1", display_name: "Ada", wa_profile_name: null, phone_e164: "+15550000001", consent: "opted_in", dnc: false, marketing_consent: null, ...over });
const conversation = (id, tenant_id, over = {}) => ({
  id, tenant_id, state: "needs_human", paused_until: null, snooze_until: null, assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR), last_message_at: ago(HOUR), contact_id: "k1", contacts: contact(), ...over,
});
const message = (id, conversation_id, tenant_id, over = {}) => ({
  id, conversation_id, tenant_id, direction: "inbound", sender: "customer", type: "text", body: "hi", media: null, meta: null,
  status: "received", channel: "whatsapp", channel_ts: ago(HOUR), created_at: ago(HOUR), ...over,
});
const call = (id, tenant_id, over = {}) => ({
  id, tenant_id, retell_call_id: `rc-${id.slice(-1)}`, direction: "inbound", call_type: "inbound", status: "ended", from_e164: "+15550000001", from_raw: null,
  to_e164: "+15550000002", started_at: "2026-09-01T00:00:00Z", ended_at: null, updated_at: null, duration_ms: null, disconnection_reason: null,
  sentiment: null, call_successful: null, in_voicemail: null, summary: null, conversation_id: C1, recording: null, ...over,
});

test("the seven declare their policy: the reads open to every member, the verbs operator-only and counted, every single-row route judged where its row lives", () => {
  const open = { kind: "read", role: null, rate: null, spend: false };
  assert.deepEqual(escalations.GET.policy, { ...open, scope: "workspace" });
  assert.deepEqual(calls.GET.policy, { ...open, scope: "workspace" });
  assert.deepEqual(thread.GET.policy, { ...open, scope: "row" });
  assert.deepEqual(recording.GET.policy, { ...open, scope: "row" });
  assert.deepEqual(reply.POST.policy, { kind: "write", scope: "row", role: "operator", rate: "reply", spend: false });
  assert.deepEqual(steer.POST.policy, { kind: "write", scope: "row", role: "operator", rate: "whisper", spend: false });
  assert.deepEqual(whisper.POST.policy, { kind: "write", scope: "row", role: "operator", rate: "whisper", spend: false });
});

test("the escalations read answers the workspace the tab named: its open ones unless a state is asked for", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    escalations: [
      { id: "e1", tenant_id: A, state: "open", reason: "price", details: null, created_at: "2026-09-01T00:00:00Z", conversation_id: C1 },
      { id: "e2", tenant_id: A, state: "resolved", reason: "price", details: null, created_at: "2026-09-02T00:00:00Z", conversation_id: C1 },
      { id: "e3", tenant_id: B, state: "open", reason: "booking", details: null, created_at: "2026-09-03T00:00:00Z", conversation_id: C2 },
    ],
  };
  const open = await escalations.GET.run(get(), ctxFor(tables));
  assert.deepEqual(open.escalations.map((e) => e.id), ["e1"], "the oldest membership is the default, and only its open ones");
  const resolved = await escalations.GET.run(get("?state=resolved"), ctxFor(tables));
  assert.deepEqual(resolved.escalations.map((e) => e.id), ["e2"]);
  const bayside = await escalations.GET.run(get(`?workspace=${B}`), ctxFor(tables));
  assert.deepEqual(bayside.escalations.map((e) => e.id), ["e3"]);
});

test("the calls read is the workspace's, newest first, narrowed by status or thread; a malformed thread id is a 404, and the recording's path never leaves", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    calls: [
      call(L1, A, { started_at: "2026-09-01T00:00:00Z", recording: { storage_path: "a/b.mp3", fetch_state: "stored", provider_url: "https://provider.example/x", mime: "audio/mpeg", bytes: 10 } }),
      call(L2, A, { started_at: "2026-09-02T00:00:00Z", status: "ongoing", conversation_id: C2 }),
      call(L3, B),
    ],
  };
  const all = await calls.GET.run(get(), ctxFor(tables));
  assert.deepEqual(all.calls.map((c) => c.id), [L2, L1], "newest first, this workspace only");
  const json = JSON.stringify(all.calls);
  assert.ok(!json.includes("storage_path") && !json.includes("provider.example"), "audio is reachable only through the signed recording route");
  const ongoing = await calls.GET.run(get("?status=ongoing"), ctxFor(tables));
  assert.deepEqual(ongoing.calls.map((c) => c.id), [L2]);
  const ofThread = await calls.GET.run(get(`?conversation_id=${C1}`), ctxFor(tables));
  assert.deepEqual(ofThread.calls.map((c) => c.id), [L1]);
  await refused(calls.GET.run(get("?conversation_id=not-a-uuid"), ctxFor(tables)), "not_found", 404);
});

test("one thread: any member reads it where it lives, older messages page back, and a thread the account cannot reach is a 404", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    conversations: [conversation(C1, B), conversation(C2, B)],
    messages: [
      message("m1", C1, B, { created_at: "2026-09-01T00:00:00Z", body: "first" }),
      message("m2", C1, B, { created_at: "2026-09-02T00:00:00Z", body: "second", direction: "outbound", sender: "ai" }),
      message("m3", C2, B, { created_at: "2026-09-03T00:00:00Z", body: "elsewhere" }),
    ],
  };
  const out = await thread.GET.run(get(), ctxFor(tables, { id: C1 }));
  assert.equal(out.conversation.id, C1);
  assert.equal(out.conversation.contact.phone_e164, "+15550000001");
  assert.deepEqual(out.messages.map((m) => m.body), ["first", "second"], "oldest first, this thread only");
  const older = await thread.GET.run(get("?before=2026-09-02T00:00:00Z"), ctxFor(tables, { id: C1 }));
  assert.deepEqual(older.messages.map((m) => m.body), ["first"]);
  await refused(thread.GET.run(get(), ctxFor(tables, { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9" })), "not_found", 404);
  await refused(thread.GET.run(get(), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
  // A member of harbor only. This double has no RLS, so the row loads; the
  // membership judged where it lives (bayside) is what refuses.
  const harborOnly = { ...tables, memberships: [membership(A, "owner", "harbor", "2026-01-01T00:00:00Z")] };
  await refused(thread.GET.run(get(), ctxFor(harborOnly, { id: C1 })), "not_found", 404);
});

test("a reply: a viewer is refused as a viewer whatever the body says, the body is judged before any row is touched, an opt-out refuses before anything is queued, and a closed window wants a template", async () => {
  const tables = { memberships: both("viewer", "operator"), conversations: [conversation(C1, A), conversation(C2, B)], messages: [] };
  const long = "x".repeat(5000);
  // Harbor's viewer, with a body that would be a 400: refused as a viewer, so
  // the shape of the refusal says nothing about the thread or its person.
  await refused(reply.POST.run(post({ text: long }), ctxFor(tables, { id: C1 })), "forbidden", 403);
  // Bayside's operator, the same body: judged at the door.
  const door = ctxFor(tables, { id: C2 });
  await refused(reply.POST.run(post({ text: long }), door), "validation", 400);
  await refused(reply.POST.run(post({ text: "hi", extra: 1 }), ctxFor(tables, { id: C2 })), "validation", 400, "a stray field is refused, not ignored on the way to Meta");
  assert.equal(writes(door), 0, "nothing was written for a refused body");
  // An opt-out binds the humans too.
  const optedOut = { ...tables, conversations: [conversation(C2, B, { contacts: contact({ dnc: true }) })] };
  const dnc = ctxFor(optedOut, { id: C2 });
  await refused(reply.POST.run(post({ text: "hi" }), dnc), "conflict");
  assert.equal(writes(dnc), 0, "nothing queued for a person who said stop");
  // Outside the 24-hour window, words alone are refused: an approved template is the only way.
  const stale = { ...tables, conversations: [conversation(C2, B, { last_wa_inbound_at: ago(48 * HOUR) })] };
  await refused(reply.POST.run(post({ text: "hi" }), ctxFor(stale, { id: C2 })), "window_closed");
  await refused(reply.POST.run(post({ text: "hi" }), ctxFor(tables, { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9" })), "not_found", 404);
});

test("a rewrite: only an operator where the draft lives, only a draft still waiting, never from a preview — and no decision is recorded for a rewrite that did not happen", async () => {
  const draft = (id, tenant_id, over = {}) => ({ id, tenant_id, conversation_id: C1, sender: "ai", status: "queued", ...over });
  const tables = { memberships: both("viewer", "operator"), messages: [draft(M1, A), draft(M2, B), draft(M3, B, { status: "sent" })] };
  await refused(steer.POST.run(post({ text: "shorter" }), ctxFor(tables, { id: M1 })), "forbidden", 403);
  await refused(steer.POST.run(post({ text: "   " }), ctxFor(tables, { id: M2 })), "validation", 400);
  await refused(steer.POST.run(post({ text: "shorter" }), ctxFor(tables, { id: M3 })), "conflict", 409, "a sent reply cannot be rewritten");
  const preview = ctxFor(tables, { id: M2 });
  await refused(steer.POST.run(post({ text: "shorter" }), preview), "upstream_anthropic", 502, "this machine is not the production dashboard");
  assert.equal(writes(preview), 0);
  await refused(steer.POST.run(post({ text: "shorter" }), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
});

test("a whisper: the call is the row, only into a call in progress, never from a preview; the recording is a 404 until one is stored", async () => {
  const live = (id, tenant_id, over = {}) => call(id, tenant_id, { status: "ongoing", ...over });
  const tables = {
    memberships: both("viewer", "operator"),
    calls: [live(L1, A), live(L2, B), call(L3, B, { recording: { storage_path: "a/b.mp3", fetch_state: "pending" } })],
  };
  await refused(whisper.POST.run(post({ text: "offer the 3pm slot" }), ctxFor(tables, { id: L1 })), "forbidden", 403);
  await refused(whisper.POST.run(post({ text: "offer the 3pm slot" }), ctxFor(tables, { id: L3 })), "conflict", 409, "nobody on the line");
  await refused(whisper.POST.run(post({ text: "x".repeat(501) }), ctxFor(tables, { id: L2 })), "validation", 400);
  const preview = ctxFor(tables, { id: L2 });
  await refused(whisper.POST.run(post({ text: "offer the 3pm slot" }), preview), "upstream_retell", 502, "this machine is not the production dashboard");
  assert.equal(writes(preview), 0, "no decision for a whisper that did not happen");
  await refused(recording.GET.run(get(), ctxFor(tables, { id: L2 })), "not_found", 404, "no recording yet");
  await refused(recording.GET.run(get(), ctxFor(tables, { id: L3 })), "not_found", 404, "fetched but not stored");
  await refused(recording.GET.run(get(), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
});
