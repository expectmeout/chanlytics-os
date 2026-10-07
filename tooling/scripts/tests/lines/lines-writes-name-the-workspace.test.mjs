/**
 * A statement on a workspace's line names the workspace as well as the line (packages/db tenantDb), and the token
 * budget reads one workspace's day and never every workspace's.
 *
 * The edge writes with the service role, which skips row-level security, so `.eq("id", line.id)` alone reaches
 * whatever row that id names, whoever's it is: the saga's modules were safe only because each caller had proved the
 * row first (admin/lines.ts reads it under the token's workspace). Here the pair is deliberately wrong (the id of one
 * workspace's line, held under another workspace's id) and each writer must change nothing: on main every one of
 * them wrote the row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBusinessRecord } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { unfileMockRegistration } = await importSrc("apps/edge/lib/lines/a2p-refile.ts");
const { claimLineForResume, countAutomaticResume } = await importSrc("apps/edge/lib/lines/line-resume.ts");
const { provisionLineJob } = await importSrc("apps/edge/lib/lines/line-provision-job.ts");
const { tokensLast24h } = await importSrc("apps/edge/lib/receptionist/budget.ts");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const LINE_B = "bbbbbbbb-0000-4000-8000-00000000000b";

/** B's line, filed and failed: what every writer below would change. */
const linesOfB = () => [
  {
    id: LINE_B,
    tenant_id: B,
    e164: "+13055550101",
    kind: "chanlytics",
    provider: "dry",
    voice_state: "failed",
    sms_state: "approved",
    reg_mock: true,
    reg_step: "campaign",
    brand_sid: "BN0000000000000000000000000000000",
    campaign_sid: null,
    messaging_service_sid: null,
    last_error: "something old",
    state_since: "2026-09-01T00:00:00Z",
    facts: {},
  },
];
/** What A holds in its hand: B's line under A's workspace, a pair no caller should be able to make. */
const heldByA = (rows) => ({ ...rows[0], tenant_id: A });
const RECORD = {
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC",
  about: "A moving company in Brooklyn: homes and small offices across New York, packing and storage.",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  country: "US",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+19175550123",
};

test("taking a rehearsal off a filing writes only the workspace's own line: B's line under A's id is refused and untouched", async () => {
  const lines = linesOfB();
  const before = JSON.stringify(lines);
  const r = await unfileMockRegistration(fakeDb({ lines }), heldByA(lines), {
    record: RECORD,
    workspaceName: "Harbor Moving",
  });
  assert.equal(r.ok, false, "a write that changed nothing is an error, not a success to file on top of");
  assert.equal(JSON.stringify(lines), before, "B's line is exactly as it was");
});

test("taking a line for a resume and counting the try both write only the workspace's own line", async () => {
  const lines = linesOfB();
  const before = JSON.stringify(lines);
  const db = fakeDb({ lines });
  assert.equal(await claimLineForResume(db, heldByA(lines), Date.now(), "owner"), null, "taken by nobody");
  const counted = await countAutomaticResume(db, heldByA(lines));
  assert.equal(counted.ok, false);
  assert.equal(JSON.stringify(lines), before, "B's line kept its state and its facts");
  // Under its own workspace the same calls do their work.
  const own = await claimLineForResume(db, lines[0], Date.now(), "owner");
  assert.equal(own?.voice_state, "provisioning");
});

test("a provisioning job names its workspace: another workspace's line in its payload is a line that is not there, and the saga never runs", async () => {
  const lines = linesOfB();
  const deps = {
    provider: () => ({ name: "dry", provider: {}, master: {} }),
    env: { apiKey: "k", fnSecret: "s" },
    provision: async () => {
      throw new Error("the saga must not run for a line that is not this workspace's");
    },
    now: () => Date.now(),
  };
  const r = await provisionLineJob(
    fakeDb({ lines, tenants: [{ id: B, name: "B", slug: "b" }] }),
    A,
    LINE_B,
    "sweep",
    deps,
  );
  assert.deepEqual(r, { ok: true, did: "nothing", why: "released" });
  assert.equal(lines[0].voice_state, "failed", "and B's line was not taken");
});

test("a workspace's token day is its own: with no workspace nothing is summed, never every workspace's", async () => {
  const at = new Date().toISOString();
  const usage = (tenant, n) => ({
    id: `e-${tenant.slice(0, 2)}-${n}`,
    tenant_id: tenant,
    kind: "usage.llm_tokens",
    created_at: at,
    data: { input_tokens: 100, output_tokens: 50 },
  });
  const db = fakeDb({ events: [usage(A, 1), usage(A, 2), usage(B, 1)] });
  assert.equal(await tokensLast24h(db, A), 300, "A's two replies");
  assert.equal(await tokensLast24h(db, B), 150, "B's one");
  assert.equal(await tokensLast24h(db, ""), 0, "no workspace, no day to count: not the sum of everyone's");
});
