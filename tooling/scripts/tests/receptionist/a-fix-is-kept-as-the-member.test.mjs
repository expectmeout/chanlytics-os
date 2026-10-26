/**
 * Keep, run through route(): POST receptionist/keep (decision 0069, R4), the real route module, its `run` called with a
 * database in memory. A change kept from a rehearsal is the settings' own write on the member's session, then the fix on
 * its rehearsal through its door, rehearsal_fix_keep (00481), on that same session: the service role writes the
 * settings' ledger row and nothing of the rehearsal. The door's answer is the count the page says; a door that refuses
 * leaves the settings kept and the count read with the rehearsal.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const keep = await import(at("apps/dashboard/app/api/v1/receptionist/keep/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "u1";
const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
};
const KEPT = {
  op: "add_note",
  field: "Things it should know",
  said: "Earlier fix",
  version: 1,
  at: "2026-10-25T10:00:00Z",
};

const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: { brain: BRAIN }, version: 1, updated_at: "2026-09-01T00:00:00Z" }],
  tenant_channels: [],
  google_listings: [],
  policies: [],
  events: [],
  rehearsals: [
    {
      id: R,
      tenant_id: A,
      kind: "typed",
      retell_call_id: null,
      call_id: null,
      agent_id: null,
      config_version: 1,
      instructions: "Answer as the front desk.",
      transcript: [{ role: "user", content: "Do you open on Sundays?" }],
      started_at: null,
      ended_at: null,
      seconds: null,
      end_reason: null,
      review: null,
      reviewed_at: null,
      fixes: [KEPT],
      created_by: USER,
      created_at: "2026-10-25T09:00:00Z",
      updated_at: "2026-10-25T09:00:00Z",
    },
  ],
});

/** The member's session and the service role, each over the same tables, each with its own record of what reached it. */
function world(door) {
  const t = tables();
  const service = fakeDb(t);
  setServiceClient(service);
  const ctx = {
    supabase: fakeDb(t, {}, { rehearsal_fix_keep: door }),
    userId: USER,
    email: "ada@example.com",
    aal: "aal2",
    params: {},
  };
  return { t, ctx, service };
}
const send = (body) =>
  new Request(`http://localhost/api/v1/receptionist/keep?workspace=${A}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
const BODY = {
  rehearsal_id: R,
  change: { op: "set_tone", tone: "Warm and brief" },
  via: "rehearsal",
  channel: "whatsapp",
};
/** Every table and door a client was asked about. */
const touched = (client) => client.seen.map((s) => s.rpc ?? s.table).filter(Boolean);

test("Keep is the settings' policy: a partner or the owner, the settings' rate, no spend", () => {
  assert.deepEqual(keep.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "settings",
    spend: false,
  });
});

test("the fix goes through its door on the member's session, and the door's count is the answer", async () => {
  const asked = [];
  const { t, ctx, service } = world((args) => (asked.push(args), 7));
  const out = await keep.POST.run(send(BODY), ctx);
  assert.equal(out.version, 2, "the settings' own write went through, on the member's session");
  assert.equal(t.tenant_config[0].config.brain.profile.tone, "Warm and brief");
  assert.deepEqual(asked, [
    { p_tenant_id: A, p_rehearsal_id: R, p_fix: { op: "set_tone", field: out.field, said: out.line, version: 2 } },
  ]);
  assert.equal(out.fixes, 7, "the count the door answered, which counts a Keep made beside this one");
  assert.ok(!touched(service).includes("rehearsals"), "the service role reads and writes no rehearsal");
  assert.ok(!touched(service).includes("rehearsal_fix_keep"), "and calls no door of one");
  assert.deepEqual(t.rehearsals[0].fixes, [KEPT], "nothing but the door appends a fix");
});

test("a door that refuses leaves the settings kept and says the count read with the rehearsal", async () => {
  const { t, ctx } = world(() => {
    throw Object.assign(new Error("Rehearsal not found."), { code: "P0002" });
  });
  const out = await keep.POST.run(send(BODY), ctx);
  assert.equal(out.version, 2, "the settings are kept: a fix short is no refusal of what was written");
  assert.equal(t.tenant_config[0].version, 2);
  assert.equal(out.fixes, 2, "the one kept before, and this one");
});
