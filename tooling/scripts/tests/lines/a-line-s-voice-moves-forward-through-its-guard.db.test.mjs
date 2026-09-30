/**
 * A line's voice, the whole way, against the real lines_voice_guard (00106, 00116): the owner buys a number through the
 * edge's own door (api/admin/lines.ts, op buy), the line_provision job runs the saga as api/jobs/tick.ts binds it
 * (jobs' dispatchJob -> core provisionLine -> the edge's provisionLineJob and saga, every step saved to the row), the
 * receptionist's provider refuses the number once, the owner retries through the door, and the saga finishes. Then the
 * two late writers the guard exists for: a stale page's retry and a late run of the job, each meeting an answering
 * line. Every voice_state the writers move the row through is asserted where it lands, and nothing they log as a failed
 * save may appear (#1100's lesson: the guard is met by the writer's whole sequence, never a move replayed by hand).
 *
 *   provisioning -> failed (the import refused) -> provisioning (the owner's retry) -> answering
 *   answering: a retry is refused by the door, and a late job does nothing
 *
 * The carrier is the dry provider this deployment runs on previews (LINES_DRY_RUN=1), and the receptionist's provider
 * (Retell) is stubbed at the network: its LLM and agent made, its import refused once and then taken. Everything is kept
 * in the workspace this file makes and deletes, on a number no other suite holds.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no service-role credentials in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and a line"
      : false;

// This process's deployment: the dry carrier, the receptionist's provider under made-up keys, the door's key. Nothing
// here is a Twilio account, and a token-signed knock is not what this suite presents.
const DIAG = "diag-key-for-this-suite";
process.env.LINES_DRY_RUN = "1";
process.env.RETELL_API_KEY = "retell-key-for-this-suite";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-suite";
process.env.DIAG_KEY = DIAG;
for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "EDGE_CALL_SECRET", "VERCEL_ENV", "RESEND_API_KEY"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stamp = Date.now().toString(36);
const NUMBER = "+12145550177";

let db;
let T;
let jobs;
let door;
let provisionLineJob;
let setPg;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/* ---------------------------------------------------------------- Retell, at the network */

/** How Retell answers the number's import, one answer per call, the last repeated. */
const importScript = [];
const retellCalls = [];
const realFetch = globalThis.fetch;
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function stubRetell() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://api.retellai.com/")) {
      const p = new URL(u).pathname;
      retellCalls.push(`${init?.method ?? "GET"} ${p}`);
      if (p === "/create-retell-llm") return reply(201, { llm_id: `llm_fixture_${stamp}`, version: 0 });
      if (p === "/create-agent")
        return reply(201, { agent_id: `agent_fixture_${stamp}`, version: 0, is_published: false });
      if (p.startsWith("/publish-agent-version/")) return reply(200, {});
      if (p.startsWith("/get-agent/"))
        return reply(200, {
          agent_id: p.split("/").pop(),
          version: 0,
          is_published: true,
          response_engine: { type: "retell-llm", llm_id: `llm_fixture_${stamp}`, version: 0 },
        });
      if (p === "/import-phone-number") {
        const how = importScript.length > 1 ? importScript.shift() : importScript[0];
        return how === "refuse"
          ? reply(400, { message: "The number could not be imported: the trunk is not ready" })
          : reply(201, { phone_number: NUMBER, phone_number_type: "custom" });
      }
      throw new Error(`this suite does not answer ${init?.method ?? "GET"} ${u}`);
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(url, init);
    throw new Error(`this suite does not answer ${init?.method ?? "GET"} ${u}`);
  };
}

/** What the saga's writers log when a save of theirs fails: none of it may appear. */
const swallowed = [];
const realError = console.error;
const SWALLOWS = /saving the line|claim_line|line_saga_failed|_write_failed|pg_\w+_failed/;

/* ---------------------------------------------------------------- the door and the job */

/** The owner's knock, as the dashboard's /api/v1/lines verbs make it. */
async function knock(body) {
  const res = await door.POST(
    new Request("https://edge.example/api/admin/lines", {
      method: "POST",
      headers: { "content-type": "application/json", "x-diag-key": DIAG },
      body: JSON.stringify({ tenant_id: T, ...body }),
    }),
  );
  return [res.status, await res.json()];
}

/** The line's job, as the heartbeat runs a claim of it: dispatchJob over the ports api/jobs/tick.ts binds. */
async function runProvision(jobId) {
  const row = ok(await db.from("jobs").select("id, tenant_id, kind, payload").eq("id", jobId).single());
  const ctx = {
    db,
    wire: {},
    alert: async () => undefined,
    provisionLine: (lineId, by, until) => provisionLineJob(db, row.tenant_id, lineId, by, undefined, until),
    schedule: async (kind, dueAt, payload) => {
      await jobs.scheduleJob(db, { tenantId: row.tenant_id, kind, dueAt, payload });
    },
    scheduleOnce: (kind, dueAt, payload) => jobs.scheduleJobOnce(db, { tenantId: row.tenant_id, kind, dueAt, payload }),
    deadline: Date.now() + 45_000,
  };
  try {
    return await jobs.dispatchJob(ctx, { id: row.id, tenant_id: row.tenant_id, kind: row.kind, payload: row.payload });
  } finally {
    // Run here, so withdrawn from the ledger: no claim beside this file may run it again.
    ok(await db.from("jobs").update({ state: "canceled" }).eq("id", row.id).eq("state", "scheduled"));
  }
}
const provisionJobs = async (lineId) =>
  ok(
    await db
      .from("jobs")
      .select("id, payload, created_at")
      .eq("tenant_id", T)
      .eq("kind", "line_provision")
      .eq("payload->>line_id", lineId)
      .order("created_at"),
  );
const lineRow = async (id) =>
  ok(
    await db
      .from("lines")
      .select("voice_state, step, last_error, retell_agent_id, facts, messaging_service_sid")
      .eq("id", id)
      .single(),
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  jobs = await import(at("packages/jobs/src/index.ts"));
  ({ setPg } = await import(at("apps/edge/lib/pg.ts")));
  door = await import(at("apps/edge/api/admin/lines.ts"));
  ({ provisionLineJob } = await import(at("apps/edge/lib/lines/line-provision-job.ts")));
  setPg(db);
  stubRetell();
  console.error = (...args) => {
    if (SWALLOWS.test(String(args[0]))) swallowed.push(args.map(String).join(" "));
    realError(...args);
  };
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `line-voice-${stamp}`, name: "Line Voice Studio" })
      .select("id")
      .single(),
  ).id;
  // A workspace that may spend: billed directly, so the door's spend rule lets the number be bought.
  ok(
    await db
      .from("billing_accounts")
      .upsert({ tenant_id: T, mode: "direct", status: "active" }, { onConflict: "tenant_id" }),
  );
});

after(async () => {
  globalThis.fetch = realFetch;
  console.error = realError;
  if (skip) return;
  setPg(null);
  if (!T) return;
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenant_channels").delete().eq("tenant_id", T);
  await db.from("lines").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

test(
  "bought, refused at the import, retried, answering; then a stale retry is refused and a late job does nothing",
  { skip },
  async () => {
    importScript.push("refuse", "ok");

    // The owner buys the number: the row at the saga's first step, and its job on the ledger.
    const [bought, answer] = await knock({ op: "buy", number: NUMBER });
    assert.equal(bought, 202, JSON.stringify(answer));
    const lineId = answer.line.id;
    let line = await lineRow(lineId);
    assert.deepEqual([line.voice_state, line.step], ["provisioning", "subaccount"]);
    const [first] = await provisionJobs(lineId);
    assert.ok(first, "the saga is scheduled, never run in the door");

    // The job runs the saga: the carrier's steps land, the receptionist is made, and its provider refuses the import.
    await assert.rejects(runProvision(first.id), /line_provision: stopped at import: Retell import: HTTP 400/);
    line = await lineRow(lineId);
    assert.deepEqual([line.voice_state, line.step], ["failed", "import"], "failed at the step that failed");
    assert.match(line.last_error ?? "", /could not be imported/);
    assert.equal(line.retell_agent_id, `agent_fixture_${stamp}`, "what the run made stays on the row");
    const failed = ok(await db.from("events").select("data").eq("tenant_id", T).eq("kind", "line.failed"));
    assert.deepEqual(
      failed.map((e) => e.data.step),
      ["import"],
    );

    // The owner presses Retry: the door takes the failed row back to provisioning and schedules the saga again.
    const [retried, again] = await knock({ op: "retry", line_id: lineId });
    assert.equal(retried, 202, JSON.stringify(again));
    line = await lineRow(lineId);
    assert.deepEqual([line.voice_state, line.last_error], ["provisioning", null]);
    const second = (await provisionJobs(lineId)).at(-1);
    assert.notEqual(second.id, first.id);

    // The saga resumes at the import, which is taken now, and finishes: the line answers.
    const made = retellCalls.filter((c) => c.endsWith("/create-agent")).length;
    assert.equal(await runProvision(second.id), "done");
    line = await lineRow(lineId);
    assert.deepEqual([line.voice_state, line.step, line.last_error], ["answering", null, null]);
    assert.ok(line.messaging_service_sid && line.facts.channel_id && line.facts.sms_channel_id);
    assert.equal(
      retellCalls.filter((c) => c.endsWith("/create-agent")).length,
      made,
      "resumed at its step: the receptionist is not made twice",
    );
    const answering = ok(await db.from("events").select("data").eq("tenant_id", T).eq("kind", "line.answering"));
    assert.equal(answering.length, 1);

    // A page that still shows "failed" retries: the door refuses an answering line, and the row is left alone.
    const [stale, refused] = await knock({ op: "retry", line_id: lineId });
    assert.deepEqual([stale, refused.error], [409, "line_not_retryable"]);
    // The run that finished the saga died before the ledger heard: its lease runs out and the ledger runs the job
    // again. An answering line has nothing to do.
    const calls = retellCalls.length;
    assert.equal(await runProvision(second.id), "done");
    assert.equal(retellCalls.length, calls, "and asks no provider anything");
    line = await lineRow(lineId);
    assert.deepEqual([line.voice_state, line.step], ["answering", null], "never re-provisioned");

    // And a second number is refused while this one answers: one line per workspace.
    const [twice, second_] = await knock({ op: "buy", number: "+12145550178" });
    assert.deepEqual([twice, second_.error], [409, "line_exists"]);
    assert.deepEqual(swallowed, [], "no save of the saga's, the door's or the resume's was refused");
  },
);
