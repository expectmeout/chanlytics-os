/**
 * Every edge door names the request it serves (apps/edge/lib/log.ts `door`, `adminDoor`), its lines carry the name,
 * its answer says it in x-request-id, and a name ends with its request.
 *
 * Until 29 September only the admin doors named a request, by entering the name for the rest of the execution
 * (AsyncLocalStorage.enterWith, in authorizeAdmin). Entered from a door called in turn after another, the name
 * outlived its request: run below against main, the deadman sweep's own line carried the admin call's name. A door
 * now runs its request inside the name (AsyncLocalStorage.run), and every door, a webhook's and a clock's included,
 * has one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";
import { logLineOf } from "../_log-lines.mjs";

const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RETELL_API_KEY"]) delete process.env[k];

const stopCall = await importSrc("apps/edge/api/admin/stop-call.ts");
const deadman = await importSrc("apps/edge/api/cron/deadman.ts");
const { door, adminDoor, logger } = await importSrc("apps/edge/lib/log.ts");

const DASHBOARD_ID = "iad1::dash-0123456789";

/** Every logger line written while `fn` ran, parsed. */
async function linesOf(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"])
    console[level] = (...args) => {
      const line = logLineOf(args);
      if (line) lines.push(line);
    };
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}

const adminKnock = (headers) =>
  new Request("https://edge.test/api/admin/stop-call", {
    method: "POST",
    headers: {
      "x-edge-token": signEdgeToken(SECRET, "/api/admin/stop-call", { workspace: "ws-1", user: "u-1" }),
      ...headers,
    },
    body: "{}",
  });

test("two doors in turn in one instance: the second door's lines carry its own name, never the first's", async () => {
  const { result, lines } = await linesOf(async () => {
    const first = await stopCall.POST(adminKnock({ "x-request-id": DASHBOARD_ID }));
    const second = await deadman.POST(new Request("https://edge.test/api/cron/deadman", { method: "POST" }));
    return { first, second };
  });
  assert.equal(result.first.status, 503, "the admin door let the token in, and had no provider key");
  assert.equal(result.first.headers.get("x-request-id"), DASHBOARD_ID, "an admin door answers the dashboard's name");
  assert.equal(result.second.status, 503, "the clock's door had no database");
  const second = result.second.headers.get("x-request-id");
  assert.ok(second && second !== DASHBOARD_ID, "the clock's door named its own request");
  const deadmanLine = lines.find((l) => l.event === "deadman_no_db");
  assert.ok(deadmanLine, "the clock's door logged that it had no database");
  assert.equal(deadmanLine.request_id, second, "under its own name, the one its answer carries");
  assert.ok(
    lines.every((l) => l.event === "admin_stop_call" || l.request_id !== DASHBOARD_ID),
    "no line of the second door carries the first door's name",
  );
});

test("an admin door takes the dashboard's name when it is one, and names a knock without a sane one itself", async () => {
  const handler = adminDoor(async () => {
    logger({ tenant_id: "ws-1" }).info("admin_whisper", { chars: 3 });
    return new Response("{}", { status: 200 });
  });
  const { result, lines } = await linesOf(async () => [
    await handler(adminKnock({ "x-request-id": DASHBOARD_ID })),
    await handler(adminKnock({ "x-request-id": "not a name!" })),
  ]);
  assert.deepEqual(lines[0], {
    level: "info",
    event: "admin_whisper",
    request_id: DASHBOARD_ID,
    tenant_id: "ws-1",
    chars: 3,
  });
  assert.match(lines[1].request_id, /^[0-9a-f-]{36}$/, "a header that is no name is not taken");
  assert.equal(result[1].headers.get("x-request-id"), lines[1].request_id, "and the answer says the name it took");
});

test("a webhook's door never takes the caller's name: a delivery is named by the platform, or freshly", async () => {
  const handler = door(async () => {
    logger().info("wa_inbound", {});
    return Response.redirect("https://example.com/", 302);
  });
  const { result, lines } = await linesOf(async () => [
    await handler(new Request("https://edge.test/api/whatsapp", { headers: { "x-request-id": DASHBOARD_ID } })),
    await handler(new Request("https://edge.test/api/whatsapp", { headers: { "x-vercel-id": "iad1::abcd-1234567" } })),
  ]);
  assert.notEqual(lines[0].request_id, DASHBOARD_ID, "a provider cannot name its delivery after someone else's");
  assert.equal(lines[1].request_id, "iad1::abcd-1234567", "the platform's id for the invocation");
  assert.equal(result[0].status, 302, "a redirect, whose headers are fixed, still carries the name");
  assert.equal(result[0].headers.get("x-request-id"), lines[0].request_id);
});
