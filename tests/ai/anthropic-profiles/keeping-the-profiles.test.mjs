/**
 * The profiles' keeping (decision 0097, lib/ai/anthropic-profiles/keep.ts): what Anthropic says of each is read off its list,
 * a profile whose person or workspace went is deleted there and then here, a create whose answer was lost is found again or
 * let go, and a few more are made. The real sweep and the channels wire, over a database in memory and a scripted API.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../../_fake-db.mjs";
import { at, withEnv } from "../../_cron-doors-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_PROFILES"]) delete process.env[k];

const { setModelFetch } = await import(at("apps/edge/lib/ai/model.ts"));
const { keepAnthropicProfiles } = await import(at("apps/edge/lib/ai/anthropic-profiles/keep.ts"));
after(() => setModelFetch(null));
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const ON = { ANTHROPIC_PROFILES: "on" };
const LONG_AGO = "2026-01-01T00:00:00Z";

const row = (over = {}) => ({
  id: crypto.randomUUID(),
  kind: "workspace",
  user_id: null,
  tenant_id: T,
  reference_id: `workspace:${T}`,
  profile_id: "uprof_a",
  claimed_at: LONG_AGO,
  enforcement_status: "unrestricted",
  enforcement_actions: [],
  enforcement_at: null,
  tenants: { left_empty_at: null },
  ...over,
});
const remote = (id, over = {}) => ({
  type: "user_profile",
  id,
  created_at: "2026-02-01T00:00:00Z",
  external_user_details: { reference_id: null },
  enforcement_status: "unrestricted",
  enforcement_actions: [],
  ...over,
});
const ACTION = {
  type: "restriction",
  id: "enac_1",
  reason: "fraud_or_abuse",
  action: "verify",
  opened_at: "2026-10-02T19:30:00Z",
  expires_at: null,
};

function pager() {
  const sent = [];
  return { sent, send: async (from, to, subject, body) => (sent.push({ subject, body }), true), now: () => Date.now() };
}

/** Anthropic's list and delete, as the wire answers; `pages` is the list's pages, each its profiles and whether one follows. */
function anthropic({ pages = [{ data: [] }], deletes = {}, listStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? "GET";
    calls.push({ method, path: u.pathname, query: u.search, headers: init.headers ?? {} });
    const reply = (code, body) => new Response(JSON.stringify(body), { status: code });
    if (method === "GET") {
      if (listStatus !== 200)
        return reply(listStatus, { type: "error", error: { type: "overloaded_error", message: "busy" } });
      const at = Number(u.searchParams.get("page")?.slice(1) ?? 0);
      const page = pages[at] ?? { data: [] };
      return reply(200, { data: page.data, next_page: at + 1 < pages.length ? `p${at + 1}` : null });
    }
    if (method === "DELETE") {
      const code = deletes[u.pathname.split("/").pop()] ?? 200;
      return reply(code, code === 200 ? { type: "user_profile_deleted" } : { error: { message: `status ${code}` } });
    }
    if (method === "POST") return reply(200, remote(`uprof_made_${calls.length}`));
    throw new Error(`nothing answers ${method} ${u.pathname}`);
  };
  setModelFetch(fetch);
  return calls;
}

function world(rows, waiting = [], faults = {}) {
  const tables = { anthropic_profiles: rows, operator_pages: [] };
  const claim = ({ p_kind, p_subject }) => {
    const id = crypto.randomUUID();
    const key = p_kind === "person" ? "user_id" : "tenant_id";
    tables.anthropic_profiles.push(
      row({
        id,
        kind: p_kind,
        tenant_id: null,
        [key]: p_subject,
        reference_id: `${p_kind}:${p_subject}`,
        profile_id: null,
        claimed_at: new Date().toISOString(),
      }),
    );
    return { id, reference_id: `${p_kind}:${p_subject}`, onboarded_at: LONG_AGO, email: null };
  };
  const db = fakeDb(tables, faults, {
    anthropic_profile_claim: claim,
    anthropic_profiles_waiting: ({ p_limit }) => waiting.slice(0, p_limit),
  });
  return { tables, db };
}

const ADDRESSED = { ...ON, LEAD_TO: "ops@example.com", LEAD_FROM: "alerts@example.com" };

test("what Anthropic says is written where it changed, and the platform told once of a new action", async () => {
  const quiet = row({ profile_id: "uprof_b", tenant_id: "aaaaaaaa-0000-4000-8000-000000000002" });
  const w = world([row(), quiet]);
  const list = anthropic({
    pages: [
      {
        data: [
          remote("uprof_a", { enforcement_status: "restricted", enforcement_actions: [ACTION] }),
          remote("uprof_b"),
        ],
      },
    ],
  });
  const p = pager();
  const kept = await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, p));
  assert.equal(kept.acted, 1);
  const [a, b] = w.tables.anthropic_profiles;
  assert.equal(a.enforcement_status, "restricted");
  assert.equal(a.enforcement_actions[0].reason, "fraud_or_abuse");
  assert.ok(a.enforcement_at, "and when we saw it");
  assert.equal(b.enforcement_at, null, "a profile with nothing new is not written");
  assert.equal(p.sent.length, 1);
  assert.match(p.sent[0].subject, /Anthropic has limited one account's model calls/);
  assert.ok(p.sent[0].body.includes(`Workspace ${T}`));
  assert.ok(p.sent[0].body.includes("Restricted: fraud or abuse. They can clear it with an identity check."));
  assert.ok(p.sent[0].body.includes("Its calls still go"));

  const again = await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, p));
  assert.equal(again.acted, 0);
  assert.equal(p.sent.length, 1, "an action already told is not told every half hour");
  assert.ok(!list.some((c) => "anthropic-beta" in c.headers), "a user-profiles beta would hide the very fields read");
  assert.ok(
    list.every((c) => !c.query.includes("enforcement_status")),
    "unfiltered: a filter would miss a new value",
  );
});

test("a restriction that becomes a ban is told again, because that is when its calls stop", async () => {
  const w = world([row({ enforcement_status: "restricted", enforcement_actions: [ACTION] })]);
  anthropic({
    pages: [{ data: [remote("uprof_a", { enforcement_status: "banned", enforcement_actions: [ACTION] })] }],
  });
  const p = pager();
  const kept = await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, p));
  assert.equal(kept.acted, 1);
  assert.equal(p.sent.length, 1);
  assert.match(p.sent[0].subject, /Anthropic has paused one account's model calls/);
  assert.ok(p.sent[0].body.includes("Its calls are held here"));
});

test("every page is read: a status on the last one counts", async () => {
  const w = world([row()]);
  const list = anthropic({
    pages: [{ data: [] }, { data: [] }, { data: [remote("uprof_a", { enforcement_status: "banned" })] }],
  });
  await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, pager()));
  assert.equal(w.tables.anthropic_profiles[0].enforcement_status, "banned");
  assert.equal(
    list.filter((c) => c.method === "GET").length,
    3,
    "short pages do not end a listing: only next_page does",
  );
});

test("a pause that ends is seen, and an answer that names no status changes nothing", async () => {
  const paused = row({ enforcement_status: "restricted", enforcement_actions: [ACTION] });
  const w = world([paused]);
  anthropic({ pages: [{ data: [remote("uprof_a", { enforcement_status: undefined })] }] });
  await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, pager()));
  assert.equal(
    w.tables.anthropic_profiles[0].enforcement_status,
    "restricted",
    "silence lifts nothing, and pauses nobody",
  );

  anthropic({ pages: [{ data: [remote("uprof_a")] }] });
  const kept = await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, pager()));
  assert.equal(kept.cleared, 1);
  assert.equal(w.tables.anthropic_profiles[0].enforcement_status, "unrestricted");
  assert.deepEqual(w.tables.anthropic_profiles[0].enforcement_actions, []);
});

test("a listing that fails, or a profile it did not reach, clears nothing", async () => {
  const paused = row({ enforcement_status: "banned" });
  const w = world([paused]);
  anthropic({ listStatus: 529 });
  await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, pager()));
  assert.equal(w.tables.anthropic_profiles[0].enforcement_status, "banned");

  anthropic({ pages: [{ data: [] }] });
  await withEnv(ADDRESSED, () => keepAnthropicProfiles(w.db, pager()));
  assert.equal(w.tables.anthropic_profiles[0].enforcement_status, "banned", "nothing is inferred from an absence");
});

test("a person or a workspace that went: the profile deleted there, then here, with the switch off too", async () => {
  const gone = row({ kind: "person", tenant_id: null, reference_id: `person:${U}`, tenants: null });
  const emptied = row({ profile_id: "uprof_e", tenants: { left_empty_at: LONG_AGO } });
  const stays = row({ profile_id: "uprof_s", kind: "person", user_id: U, tenant_id: null, tenants: null });
  const w = world([gone, emptied, stays]);
  const calls = anthropic({});
  const kept = await keepAnthropicProfiles(w.db, pager());
  assert.equal(kept.deleted, 2);
  assert.deepEqual(
    calls
      .filter((c) => c.method === "DELETE")
      .map((c) => c.path)
      .sort(),
    ["/v1/user_profiles/uprof_a", "/v1/user_profiles/uprof_e"],
  );
  assert.deepEqual(
    w.tables.anthropic_profiles.map((r) => r.profile_id),
    ["uprof_s"],
  );
});

test("a delete that fails is kept for the next tick, and a 404 means it went", async () => {
  const gone = row({ tenant_id: null, tenants: null });
  const w = world([gone]);
  anthropic({ deletes: { uprof_a: 503 } });
  assert.equal((await keepAnthropicProfiles(w.db, pager())).deleted, 0);
  assert.equal(w.tables.anthropic_profiles.length, 1, "the row is how the next tick knows");

  anthropic({ deletes: { uprof_a: 404 } });
  assert.equal((await keepAnthropicProfiles(w.db, pager())).deleted, 1);
  assert.equal(w.tables.anthropic_profiles.length, 0);
});

test("a create whose answer was lost is found by its reference, and the oldest kept if there are two", async () => {
  const lost = row({ profile_id: null, claimed_at: LONG_AGO });
  const w = world([lost]);
  const details = { external_user_details: { reference_id: `workspace:${T}` } };
  const calls = anthropic({
    pages: [
      {
        data: [
          remote("uprof_new", { ...details, created_at: "2026-03-01T00:00:00Z" }),
          remote("uprof_old", { ...details, created_at: "2026-02-01T00:00:00Z" }),
        ],
      },
    ],
  });
  const kept = await keepAnthropicProfiles(w.db, pager());
  assert.equal(kept.adopted, 1);
  assert.equal(w.tables.anthropic_profiles[0].profile_id, "uprof_old");
  assert.ok(!calls.some((c) => c.method === "POST"), "found, so never made again");
});

test("a lost claim is let go only on a whole listing; a young one is left alone, in flight", async () => {
  const lost = row({ profile_id: null, claimed_at: LONG_AGO });
  const w = world([lost]);
  anthropic({ listStatus: 529 });
  await keepAnthropicProfiles(w.db, pager());
  assert.equal(w.tables.anthropic_profiles.length, 1, "a listing that failed cannot say there is none");

  anthropic({ pages: [{ data: [] }] });
  await keepAnthropicProfiles(w.db, pager());
  assert.equal(w.tables.anthropic_profiles.length, 0, "a whole listing can");

  const young = row({ profile_id: null, claimed_at: new Date().toISOString() });
  const y = world([young]);
  anthropic({ pages: [{ data: [] }] });
  await keepAnthropicProfiles(y.db, pager());
  assert.equal(y.tables.anthropic_profiles.length, 1, "its create may still be in flight");
});

test("only with the switch on, and only a few a tick, are more made", async () => {
  const subjects = Array.from({ length: 12 }, (_, i) => ({
    kind: "workspace",
    subject: `aaaaaaaa-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
  }));
  const off = world([], subjects);
  const none = anthropic({});
  assert.equal((await keepAnthropicProfiles(off.db, pager())).made, 0);
  assert.equal(none.length, 0, "with the switch off and no row, nothing of Anthropic's is even read");

  const on = world([], subjects);
  const made = anthropic({});
  const kept = await withEnv(ON, () => keepAnthropicProfiles(on.db, pager()));
  assert.equal(kept.made, 5);
  assert.equal(made.filter((c) => c.method === "POST").length, 5, "slow on purpose: Anthropic rate limits creation");
});

test("no key reads nothing, and a database that fails is logged and never thrown to the sweep it rides on", async () => {
  const w = world([row()]);
  const calls = anthropic({});
  await withEnv({ ANTHROPIC_API_KEY: undefined }, () => keepAnthropicProfiles(w.db, pager()));
  assert.equal(calls.length, 0);

  const down = world([], [], { "anthropic_profiles.select": { message: "down" } });
  const out = await keepAnthropicProfiles(down.db, pager());
  assert.deepEqual(out, { acted: 0, cleared: 0, adopted: 0, deleted: 0, made: 0 });
});
