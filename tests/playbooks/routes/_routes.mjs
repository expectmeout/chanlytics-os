/**
 * The world the tests of routes/ share. Split by behaviour from outbound-routes.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Outbound (broadcasts, templates, playbooks), run through route(): the real
 * route modules, their `run` called with a database in memory. What is
 * proved is the policy each declares and what the handler answers, not its
 * text. The verbs that reach Meta or the ledger's service client stop at the
 * production guard on this machine, which is itself the proof that nothing
 * is written for a verb that did not happen.
 */
import { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { changePlaybookDoor } from "../change/_change-door.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));

export const broadcasts = await import(at("apps/dashboard/app/api/v1/broadcasts/route.ts"));

export const touches = await import(at("apps/dashboard/app/api/v1/broadcasts/touches/route.ts"));

export const approve = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/approve/route.ts"));

export const cancel = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/cancel/route.ts"));

export const templates = await import(at("apps/dashboard/app/api/v1/templates/route.ts"));

export const template = await import(at("apps/dashboard/app/api/v1/templates/[id]/route.ts"));

export const draft = await import(at("apps/dashboard/app/api/v1/templates/draft/route.ts"));

export const starter = await import(at("apps/dashboard/app/api/v1/templates/starter/route.ts"));

export const sync = await import(at("apps/dashboard/app/api/v1/templates/sync/route.ts"));

export const playbooks = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));

export const playbook = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));

export const run = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts"));

export const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

beforeEach(() => setRateStore(memoryStore()));

// The ledger is written as the service role (a session may not insert into events): a test that reads it stands one in.
export const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));

afterEach(() => setServiceClient(null));

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const T1 = "77777777-7777-4777-8777-777777777771";

export const T2 = "77777777-7777-4777-8777-777777777772";

export const T3 = "77777777-7777-4777-8777-777777777773";

export const T4 = "77777777-7777-4777-8777-777777777774";

export const T9 = "77777777-7777-4777-8777-777777777779";

export const B1 = "88888888-8888-4888-8888-888888888881";

export const B2 = "88888888-8888-4888-8888-888888888882";

export const B3 = "88888888-8888-4888-8888-888888888883";

export const B4 = "88888888-8888-4888-8888-888888888884";

export const K1 = "99999999-9999-4999-8999-999999999991";

export const K2 = "99999999-9999-4999-8999-999999999992";

export const K9 = "99999999-9999-4999-8999-999999999999";

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

/**
 * `start_playbook` (00357) for a database in memory: the row the function writes from what the caller named (running,
 * the caller's, a moment, in the workspace named) into `tables.playbooks`, then the start_playbook decision as theirs
 * in `tables.decisions`; the row's id with the decision's. A database that refuses the row (`refusal`: a check, the
 * one-follow-up index) refuses the function, and neither is written, as its one transaction leaves it.
 */
export const withStartDoor = (tables, rpcs = {}, refusal = null) => ({
  ...rpcs,
  start_playbook: (a) => {
    if (refusal) throw Object.assign(new Error(refusal.message), { code: refusal.code });
    const row = {
      id: crypto.randomUUID(),
      tenant_id: a.p_tenant_id,
      ...a.p_playbook,
      state: "running",
      kind: "moment",
      created_by: USER,
      created_at: new Date().toISOString(),
    };
    (tables.playbooks ??= []).push(row);
    const decisions = (tables.decisions ??= []);
    const decision = {
      id: `decision-${decisions.length + 1}`,
      tenant_id: a.p_tenant_id,
      subject_type: "playbook",
      subject_id: row.id,
      verb: "start_playbook",
      actor_type: "user",
      actor_user_id: USER,
      payload: { ...(a.p_decision ?? {}), ...(a.p_via ? { via: a.p_via } : {}) },
      undo_of: a.p_undo_of ?? null,
    };
    decisions.push(decision);
    return { id: row.id, decision_id: decision.id, undo_dropped: false };
  },
});

/** The `change_playbook` door for a database in memory, as 00416 writes it (change/_change-door.mjs), beside `rpcs`. */
export const withChangeDoor = (tables, rpcs = {}) => ({ ...rpcs, ...changePlaybookDoor(tables, USER) });

// The session is the member's: a door that writes as the caller (playbook_edit) writes as them.
export const ctxFor = (tables, params = {}, rpcs = {}, opts = {}) => ({
  supabase: fakeDb(tables, {}, withChangeDoor(tables, withStartDoor(tables, rpcs)), { userId: USER, ...opts }),
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

export const inB = `?workspace=${B}`;

export const inA = `?workspace=${A}`;

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

export const tpl = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  body_preview: "See you at {{1}}",
  variables: [],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "starter",
  hidden_at: null,
  title: null,
  ...over,
});

export const bc = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Reminder",
  template_id: T1,
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: "2026-09-10T00:00:00Z",
  started_at: null,
  finished_at: null,
  recipient_count: 3,
  failure: null,
  created_at: "2026-09-10T00:00:00Z",
  playbook_id: null,
  run_for: null,
  ...over,
});

export const pb = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: T1,
  template_name: "winback_offer",
  template_language: "en_US",
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

/* ---- One message, every channel (step 3): the routes take and judge `channels` ---- */

export const TE = "77777777-7777-4777-8777-777777777775";

/** The workspace's rows a channel is judged by: its number, its texting line, its mailbox, and a message's own versions. */
export const channelRows = {
  number: { id: "ch-wa", tenant_id: B, kind: "whatsapp", status: "active", config: { quality_rating: "GREEN" } },
  line: {
    tenant_id: B,
    messaging_service_sid: "MG1",
    voice_state: "ready",
    sms_state: "active",
    reg_mock: false,
    created_at: "2026-09-01T00:00:00Z",
  },
  mailbox: { tenant_id: B, local_part: "bayside", reply_token: "tok", from_name: "Bayside" },
  textVersion: (over = {}) => tpl(TE, B, { channel: "sms", name: "visit_reminder", ...over }),
  emailVersion: (over = {}) => tpl(TE, B, { channel: "email", name: "visit_reminder", ...over }),
};
