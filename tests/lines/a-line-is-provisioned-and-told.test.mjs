/**
 * A line provisioned the whole way, and everyone told — run, not read.
 *
 * Two things provision a line: a person pressing Get a line (or Retry), and the sweep that resumes one the lambda
 * killed. Both reach `provisionLine` (lib/lines/provision.ts), so the bell, the platform's mail and the ledger's event
 * are said once, in one set of words; a sweep with its own "and then tell everybody" would be a second answer to what a
 * customer is told about their own phone number. Run here over a database in memory, the dry carrier this deployment
 * runs on previews, and the receptionist's provider (Retell) stubbed at the network: the receptionist made once and
 * kept, the routing row naming its line, the line's secrets through the vault's doors, and the words each person hears
 * on success and on failure. (The wiring test of lines-saga.test.mjs pinned the four modules' text until 26 Nov 2026.)
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { dryProvider } from "@chanlytics/channels/lines";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

for (const k of ["RESEND_API_KEY", "LEAD_TO", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await importSrc("apps/edge/lib/shared/pg.ts");
const { provisionLine } = await importSrc("apps/edge/lib/lines/provision.ts");
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "11111111-1111-4111-8111-111111111111";
const TENANT = { id: T, name: "Harbor Moving" };
const DRY = { name: "dry", provider: dryProvider(7), master: { sid: "ACdryrun", token: "dry" } };

/** The line as Get a line leaves it: a number asked for, nothing made yet. */
const fresh = () => ({
  id: LINE,
  tenant_id: T,
  e164: "+13055550100",
  provider: "dry",
  area_code: 305,
  subaccount_sid: null,
  number_sid: null,
  trunk_sid: null,
  credential_list_sid: null,
  termination_uri: null,
  messaging_service_sid: null,
  retell_agent_id: null,
  voice_state: "provisioning",
  step: null,
  last_error: null,
  state_since: "2026-09-07T00:00:00Z",
  facts: {},
});

/** Retell at the network: every call kept; the number's import taken, or refused in Retell's words. */
function retell({ refuseImport = false } = {}) {
  const calls = [];
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.host !== "api.retellai.com") throw new Error(`this test does not answer ${u}`);
    calls.push({ at: `${init?.method ?? "GET"} ${u.pathname}`, body: init?.body ? JSON.parse(init.body) : null });
    const p = u.pathname;
    if (p === "/create-retell-llm") return reply(201, { llm_id: "llm_made", version: 0 });
    if (p === "/create-agent") return reply(201, { agent_id: "agent_made", version: 0, is_published: false });
    if (p.startsWith("/publish-agent-version/")) return reply(200, {});
    if (p.startsWith("/get-agent/"))
      return reply(200, {
        agent_id: p.split("/").pop(),
        version: 0,
        is_published: true,
        response_engine: { type: "retell-llm", llm_id: "llm_made", version: 0 },
      });
    if (p === "/import-phone-number")
      return refuseImport
        ? reply(400, { message: "The number could not be imported: the trunk is not ready" })
        : reply(201, { phone_number: "+13055550100", phone_number_type: "custom" });
    throw new Error(`this test does not answer ${init?.method ?? "GET"} ${u}`);
  };
  return calls;
}

/** A workspace's world, the vault's two doors keeping what was put in them. */
function world(over = {}) {
  const vault = new Map();
  const tables = {
    lines: [fresh()],
    tenants: [{ id: T, name: TENANT.name, slug: "harbor-moving", status: "active" }],
    tenant_channels: [],
    voice_agents: [],
    notifications: [],
    events: [],
    ...over,
  };
  const db = fakeDb(
    tables,
    {},
    {
      get_line_credentials: (a) => vault.get(a.p_line_id) ?? null,
      put_line_credentials: (a) => {
        vault.set(a.p_line_id, a.p_secret);
        return null;
      },
    },
  );
  setPg(db);
  return { db, tables, vault };
}
const run = (db) =>
  provisionLine(db, DRY, { apiKey: "retell-key" }, { fnSecret: "fn-secret" }, TENANT, fresh(), "owner");

test("a line that answers: the receptionist made once and kept, the routing row naming the line, and the owner told it is ready", async () => {
  const w = world();
  const calls = retell();
  const r = await run(w.db);
  assert.equal(r.ok, true, r.ok ? "" : `${r.step}: ${r.error}`);
  const row = w.tables.lines[0];
  assert.deepEqual([row.voice_state, row.retell_agent_id, row.last_error], ["answering", "agent_made", null]);

  // The receptionist: its LLM, the agent over it, published, kept on the workspace so the next asker finds it.
  const at = calls.map((c) => c.at);
  assert.deepEqual(
    at.filter((c) => !c.startsWith("GET")),
    [
      "POST /create-retell-llm",
      "POST /create-agent",
      "POST /publish-agent-version/agent_made",
      "POST /import-phone-number",
    ],
  );
  assert.equal(calls.find((c) => c.at === "POST /create-agent").body.agent_name, "Harbor Moving front desk");
  assert.deepEqual(
    w.tables.voice_agents.map((v) => [v.tenant_id, v.agent_id, v.llm_id]),
    [[T, "agent_made", "llm_made"]],
  );
  const imported = calls.find((c) => c.at === "POST /import-phone-number").body;
  assert.equal(imported.phone_number, "+13055550100", "the number the carrier sold, carried to the receptionist");

  // The routing row: one per agent, naming the line it was made for, the way a call finds its workspace.
  const voice = w.tables.tenant_channels.filter((c) => c.kind === "voice");
  assert.deepEqual(
    voice.map((c) => [c.tenant_id, c.external_id, c.status, c.config.provider, c.config.line_id]),
    [[T, "agent_made", "active", "twilio-sip", LINE]],
  );

  // The line's secrets went through the vault's door and nowhere else.
  const kept = w.vault.get(LINE);
  assert.ok(kept?.sip_username && kept?.sip_password, "the SIP credentials, kept in the vault");
  assert.ok(!JSON.stringify(row).includes(kept.sip_password), "and not on the row");

  // Each person told: the owner's bell, in the owner's words, and the ledger.
  assert.deepEqual(
    w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.subject_type, n.subject_id]),
    [[T, "number", "Your phone line is ready: +1 (305) 555-0100", "line", LINE]],
  );
  assert.match(w.tables.notifications[0].body, /^AI answers calls on \+1 \(305\) 555-0100\./);
  assert.deepEqual(
    w.tables.events.filter((e) => e.kind.startsWith("line.")).map((e) => [e.kind, e.data.provider, e.data.by]),
    [["line.answering", "dry", "owner"]],
  );
});

test("a workspace whose receptionist already answers keeps it: the voice row is read before anything is made", async () => {
  // A number bought after the receptionist answers rides on the same agent; making a second one would leave the first
  // answering nobody and the owner hearing a stranger.
  const w = world({
    tenant_channels: [
      {
        id: "ch-voice",
        tenant_id: T,
        kind: "voice",
        external_id: "agent_theirs",
        number_e164: null,
        status: "active",
        config: { llm_id: "llm_theirs" },
      },
    ],
  });
  const calls = retell();
  const r = await run(w.db);
  assert.equal(r.ok, true, r.ok ? "" : `${r.step}: ${r.error}`);
  const at = calls.map((c) => c.at);
  assert.ok(!at.includes("POST /create-agent") && !at.includes("POST /create-retell-llm"), "nothing made");
  assert.equal(w.tables.lines[0].retell_agent_id, "agent_theirs");
  const imported = JSON.stringify(calls.find((c) => c.at === "POST /import-phone-number").body);
  assert.ok(imported.includes('"agent_theirs"'), "the number is answered by the receptionist the workspace has");
});

test("a line that stops: the owner's bell says where and that Chanlytics is on it, and the ledger keeps the step", async () => {
  const w = world();
  retell({ refuseImport: true });
  const r = await run(w.db);
  assert.equal(r.ok, false);
  const row = w.tables.lines[0];
  assert.equal(row.voice_state, "failed");
  assert.match(row.last_error, /the trunk is not ready/, "Retell's own words on the row");
  assert.deepEqual(
    w.tables.notifications.map((n) => [n.kind, n.title, n.subject_id]),
    [["alert", "Setting up your phone line stopped · Chanlytics is on it", LINE]],
  );
  assert.match(
    w.tables.notifications[0].body,
    /^Setting up \+1 \(305\) 555-0100 stopped while .+\. You can try again from Setup\. Chanlytics has been told/,
  );
  const failed = w.tables.events.filter((e) => e.kind === "line.failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].data.step, r.step);
  assert.match(failed[0].data.error, /the trunk is not ready/);
  // The platform's mail for a stopped line, in reportLineFailed's words, is run in
  // cron/doors-b/a-purge-google-and-lines-provisioned.test.mjs.
});
