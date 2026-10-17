/**
 * The platform's way to set up a workspace's phone line by hand (tooling/scripts/ops/voice/voice-provision.mjs), run against
 * a local host that admits a knock as the edge's voice door does on production: a token minted for this door, this
 * workspace and this body, used once, and never the platform's key alone (admin-auth.ts: the door names no
 * `platformKey`, so the key there is 403 token_required). The setup-request mail names the script; before it, the
 * mail's own instructions (the key in a curl) were refused by that rule.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { edgeBodyMatches, verifyEdgeToken } from "@chanlytics/channels";

const SCRIPT = fileURLToPath(new URL("../../ops/voice/voice-provision.mjs", import.meta.url));
const DOOR = "/api/admin/voice-provision";
const SECRET = "test-edge-call-secret-0123456789abcdef";
const KEY = "test-diag-key";
const A = "0d6f1b52-3c4e-4a1b-9f2e-8a7b6c5d4e3f";

const PLAN = {
  ok: true,
  errors: [],
  nothing: false,
  reason: null,
  steps: [
    { id: "llm", action: "create", detail: "the shell's LLM" },
    { id: "agent", action: "create", detail: "Harbor Moving front desk" },
    { id: "number", action: "buy", detail: "a local number in 305" },
    { id: "channel", action: "insert", detail: "the voice row" },
  ],
  names: { agent: "Harbor Moving front desk", nickname: "Harbor Moving · Chanlytics" },
};
const TENANT = { id: A, slug: "harbor-moving", name: "Harbor Moving" };

/**
 * The voice door as production holds it. `answer(body)` says what it answers a knock it lets in; every knock it sees is
 * kept, with whether it came in and why not.
 */
async function edge(answer) {
  const knocks = [];
  const used = new Set();
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const send = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const seen = { path: req.url, headers: req.headers, raw, body: JSON.parse(raw || "{}") };
      knocks.push(seen);
      if (req.method !== "POST" || req.url !== DOOR) return send(404, { error: "not_found" });
      const token = req.headers["x-edge-token"];
      if (!token) {
        seen.refused = "token_required";
        return send(403, { ok: false, error: "token_required" });
      }
      const v = verifyEdgeToken(SECRET, token, DOOR);
      if (!v.ok) return send(403, { ok: false, error: `token_${v.reason}` });
      if (!edgeBodyMatches(v.claims, raw)) return send(403, { ok: false, error: "token_body" });
      if (used.has(v.claims.nonce)) return send(403, { ok: false, error: "token_replayed" });
      used.add(v.claims.nonce);
      if (v.claims.ws !== seen.body.tenant_id) return send(403, { ok: false, error: "wrong_workspace" });
      seen.claims = v.claims;
      const [status, body] = answer(seen.body);
      return send(status, body);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  return { base: `http://127.0.0.1:${server.address().port}`, knocks };
}

const backups = fs.mkdtempSync(path.join(os.tmpdir(), "voice-provision-"));
after(() => fs.rmSync(backups, { recursive: true, force: true }));

const run = (args, env) =>
  new Promise((resolve) => {
    const clean = { ...process.env };
    for (const k of ["BASE_URL", "EDGE_CALL_SECRET", "DIAG_KEY", "BACKUP_DIR"]) delete clean[k];
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...clean, BACKUP_DIR: backups, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });

test("a dry run by default: one knock with a token for this door, this workspace and this body, and the plan printed", async () => {
  const { base, knocks } = await edge(() => [
    200,
    { ok: true, apply: false, tenant: TENANT, plan: PLAN, preview: { agent_name: PLAN.names.agent, voice_id: "v1" } },
  ]);
  const { code, out } = await run(["--tenant", A, "--area-code", "305"], { BASE_URL: base, EDGE_CALL_SECRET: SECRET });
  assert.equal(code, 0, out);
  assert.equal(knocks.length, 1);
  assert.deepEqual(
    knocks[0].body,
    { tenant_id: A, area_code: 305, apply: false },
    "the area code as a number, no apply",
  );
  assert.equal(knocks[0].claims.ws, A, "the token names the workspace");
  assert.equal(knocks[0].claims.aud, DOOR, "and this door");
  assert.ok(knocks[0].claims.bh, "and this body, so it opens the door for nothing else");
  assert.equal(knocks[0].headers["x-diag-key"], undefined, "the key never rides beside a token");
  assert.match(out, /voice-provision for Harbor Moving \(harbor-moving\): dry run/);
  assert.match(out, /- number: buy — a local number in 305/);
  assert.match(out, /an apply would create:\n {2}agent_name: Harbor Moving front desk/);
  assert.match(out, /Dry run only\. Re-run with --apply to do it\./);
  assert.ok(!out.includes(SECRET), "the secret is never printed");
  assert.deepEqual(fs.readdirSync(backups), [], "a dry run keeps nothing");
});

test("--apply says so to the door, prints what was made, and keeps the answer", async () => {
  const result = {
    llm: { llm_id: "llm_abc123", version: 0, created: true },
    agent: { agent_id: "agent_def456", version: 0, created: true },
    number: { phone_number: "+13055550100" },
    channel: { id: "c1", status: "active" },
  };
  const { base, knocks } = await edge((body) => [
    200,
    { ok: true, apply: body.apply, tenant: TENANT, plan: PLAN, result },
  ]);
  const { code, out } = await run(["--tenant", A, "--number", "+13055550100", "--apply"], {
    BASE_URL: base,
    EDGE_CALL_SECRET: SECRET,
  });
  assert.equal(code, 0, out);
  assert.deepEqual(knocks[0].body, { tenant_id: A, number: "+13055550100", apply: true });
  assert.match(out, /: APPLY against/);
  assert.match(out, /channel: \{"id":"c1","status":"active"\}/);
  const kept = fs.readdirSync(backups).filter((f) => f.startsWith(`voice-provision-${A}-`));
  assert.equal(kept.length, 1, out);
  const record = JSON.parse(fs.readFileSync(path.join(backups, kept[0]), "utf8"));
  assert.equal(record.status, 200);
  assert.deepEqual(record.answer.result, result);
  fs.rmSync(path.join(backups, kept[0]));
});

test("a failed apply says what to resume with: the ids it made, passed back on the next run", async () => {
  const { base } = await edge(() => [
    502,
    {
      ok: false,
      error: "provider_refused",
      detail: "number: no numbers in 305",
      result: { llm: { llm_id: "llm_abc123" }, agent: { agent_id: "agent_def456" } },
    },
  ]);
  const { code, out } = await run(["--tenant", A, "--area-code", "305", "--apply"], {
    BASE_URL: base,
    EDGE_CALL_SECRET: SECRET,
  });
  assert.equal(code, 1);
  assert.match(out, /refused: provider_refused — number: no numbers in 305/);
  assert.match(out, /resume with the same flags and: --llm-id llm_abc123 --agent-id agent_def456/);
  for (const f of fs.readdirSync(backups)) fs.rmSync(path.join(backups, f));
});

test("the resume flags ride in the body, and the next run's token is a new one", async () => {
  const { base, knocks } = await edge(() => [200, { ok: true, apply: false, tenant: TENANT, plan: PLAN }]);
  const args = ["--tenant", A, "--area-code", "305", "--llm-id", "llm_abc123", "--agent-id", "agent_def456"];
  assert.equal((await run(args, { BASE_URL: base, EDGE_CALL_SECRET: SECRET })).code, 0);
  assert.equal(
    (await run(args, { BASE_URL: base, EDGE_CALL_SECRET: SECRET })).code,
    0,
    "a token is used once, so each run mints its own",
  );
  assert.deepEqual(knocks[0].body, {
    tenant_id: A,
    area_code: 305,
    llm_id: "llm_abc123",
    agent_id: "agent_def456",
    apply: false,
  });
  assert.notEqual(knocks[0].claims.nonce, knocks[1].claims.nonce);
});

test("the platform's key alone is what production refuses: it is sent only where no secret is held, and the refusal is said", async () => {
  const { base, knocks } = await edge(() => [200, { ok: true }]);
  const { code, out } = await run(["--tenant", A, "--area-code", "305"], { BASE_URL: base, DIAG_KEY: KEY });
  assert.equal(knocks[0].headers["x-diag-key"], KEY, "a preview's edge, which holds no secret, takes the key");
  assert.equal(knocks[0].refused, "token_required", "an edge that holds the secret does not");
  assert.equal(code, 1);
  assert.match(out, /refused: token_required/);
});

test("what it needs is said before any knock: a credential, a workspace id, and a number or an area code of three digits", async () => {
  const { base, knocks } = await edge(() => [200, { ok: true }]);
  const cases = [
    [["--tenant", A, "--area-code", "305"], {}, /EDGE_CALL_SECRET \(or DIAG_KEY/],
    [["--area-code", "305"], { EDGE_CALL_SECRET: SECRET }, /--tenant <workspace id> is required/],
    [
      ["--tenant", "harbor-moving", "--area-code", "305"],
      { EDGE_CALL_SECRET: SECRET },
      /--tenant <workspace id> is required/,
    ],
    [["--tenant", A], { EDGE_CALL_SECRET: SECRET }, /give --area-code <3 digits>/],
    [
      ["--tenant", A, "--area-code", "30"],
      { EDGE_CALL_SECRET: SECRET },
      /--area-code takes three digits, like 305 \(given: 30\)/,
    ],
  ];
  for (const [args, env, said] of cases) {
    const { code, out } = await run(args, { BASE_URL: base, ...env });
    assert.equal(code, 2, out);
    assert.match(out, said);
  }
  assert.equal(knocks.length, 0, "nothing knocked for any of them");
});
