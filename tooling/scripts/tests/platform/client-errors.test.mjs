/**
 * The client error beacon (POST /api/v1/client-errors), run end to end over doubles: the browser's reporter and its
 * three boundaries' hook, the contracts shape a report is cut to, and the route through the real route wrapper.
 *
 * A page that broke for a customer broke in silence: the shell's pane boundary drew its card, `(os)/error.tsx` wrote to
 * the browser's own console, and the root boundary drew its screen; none told the server. Now each says what it caught,
 * once, and the server logs it as `client_error` under the request's name and beside the workspace the member holds.
 * What it carries is the error, never the person: a report is cut to its limits, the logger redacts what an exception
 * quotes, and a workspace the member does not belong to is not taken.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLIENT_ERROR_BOUNDARIES, CLIENT_ERROR_LIMITS, ClientErrorInput, clientErrorOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";
import {
  clientErrorReporter,
  listenForShellErrors,
  SHELL_ERROR_EVENT,
} from "../../../../apps/dashboard/src/client/client-error.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/bearer.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/client-errors/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLATFORM_ID = "iad1::platform-0123456789";
const part = (v) => Buffer.from(v).toString("base64url");
const JWT = [part('{"alg":"ES256"}'), part('{"sub":"u-1"}'), part("signature-signature")].join(".");

/** The route as production runs it: the wrapper, a signed-in stand-in, the member's own rows. */
function signedInWith(memberships) {
  setBearerVerifier(async () => ({
    supabase: fakeDb({ memberships }),
    claims: { sub: "u-1", email: "ada@example.com" },
    error: null,
  }));
}
const membership = (tenant_id, slug) => ({
  user_id: "u-1",
  tenant_id,
  role: "owner",
  tenants: { slug },
  created_at: "2026-01-01T00:00:00Z",
});
const report = (over = {}) => ({
  boundary: "shell",
  page: "inbox",
  name: "TypeError",
  message: "x is not a function",
  stack: "at Inbox (app-shell.jsx:12:3)",
  digest: null,
  workspace: null,
  ...over,
});
const post = (body, headers = {}) =>
  new Request("http://localhost/api/v1/client-errors", {
    method: "POST",
    headers: {
      authorization: `Bearer ${JWT}`,
      "content-type": "application/json",
      "x-vercel-id": PLATFORM_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
const send = (request) => route.POST(request, { params: Promise.resolve({}) });

/** Every logger line `fn` writes, parsed. */
async function said(fn) {
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

test("one route, on the account, counted: a page in a render loop is twenty reports an hour, not a stream", () => {
  assert.deepEqual(route.POST.policy, {
    kind: "write",
    scope: "account",
    role: null,
    rate: "client_errors",
    spend: false,
  });
});

test("a report is cut to its limits before it leaves the browser: an error's name, message and first frames, its page as a route's first segment", () => {
  assert.deepEqual(CLIENT_ERROR_BOUNDARIES, ["shell", "os", "root"]);
  const long = new Error("m".repeat(2000));
  long.name = "N".repeat(200);
  long.stack = `Error: m\n${"    at f (chunk.js:1:1)\n".repeat(200)}`;
  const cut = clientErrorOf("os", long, "clients/5f0c9a3e?tab=1", "d".repeat(500), A);
  assert.deepEqual(
    [cut.name.length, cut.message.length, cut.stack.length, cut.digest.length],
    [CLIENT_ERROR_LIMITS.name, CLIENT_ERROR_LIMITS.message, CLIENT_ERROR_LIMITS.stack, CLIENT_ERROR_LIMITS.digest],
  );
  assert.deepEqual([cut.boundary, cut.page, cut.workspace], ["os", "clients", A]);
  // Anything thrown is a report; a page that is no route's name and a workspace that is no name are left out.
  const thrown = clientErrorOf("root", "a string was thrown", "Über/Straße", null, "not a workspace!");
  assert.deepEqual(
    { ...thrown, stack: typeof thrown.stack },
    {
      boundary: "root",
      page: null,
      name: "Error",
      message: "a string was thrown",
      stack: "string",
      digest: null,
      workspace: null,
    },
  );
  assert.equal(ClientErrorInput.safeParse(cut).success, true, "what a boundary sends is what the route takes");
});

test("the route refuses what the shape refuses: no boundary named, one that is not a boundary, a page that is not a route, a field over its limit", () => {
  const ok = report();
  assert.equal(ClientErrorInput.safeParse(ok).success, true);
  for (const bad of [
    { ...ok, boundary: undefined },
    { ...ok, boundary: "worker" },
    { ...ok, page: "Inbox/../etc" },
    { ...ok, name: "n".repeat(CLIENT_ERROR_LIMITS.name + 1) },
    { ...ok, message: "m".repeat(CLIENT_ERROR_LIMITS.message + 1) },
    { ...ok, stack: "s".repeat(CLIENT_ERROR_LIMITS.stack + 1) },
    { ...ok, workspace: "../etc/passwd" },
    { ...ok, message: 12 },
  ])
    assert.equal(ClientErrorInput.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
});

test("through the real route wrapper: the report is a client_error line under the request's name, beside the member and the workspace they belong to", async () => {
  signedInWith([membership(A, "harbor")]);
  const { result, lines } = await said(() =>
    send(
      post(
        report({
          workspace: A,
          message: "Could not reach ana@example.com or +15555550142",
          stack: "at Inbox (app-shell.jsx:12:3) token=hunter2hunter2",
        }),
      ),
    ),
  );
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).data, { logged: true });
  assert.equal(result.headers.get("x-request-id"), PLATFORM_ID, "the answer carries the request's name");
  const line = lines.find((l) => l.event === "client_error");
  assert.ok(line, `a client_error line was written: ${lines.map((l) => l.event).join(", ")}`);
  assert.equal(line.level, "error");
  assert.equal(line.request_id, PLATFORM_ID, "the same name the answer carries: one search");
  assert.equal(line.tenant_id, A, "the workspace the member belongs to, said by the wrapper's own resolver");
  assert.deepEqual(fieldsOf(line), {
    tenant_id: A,
    user: "u-1",
    boundary: "shell",
    page: "inbox",
    name: "TypeError",
    message: "Could not reach …@example.com or …0142",
    stack: "at Inbox (app-shell.jsx:12:3) token=[redacted]",
    digest: null,
  });
  assert.ok(!JSON.stringify(line).includes("ana@example.com"), "what an exception quoted stays out of the log");
});

test("a workspace the member does not belong to is no name: the line is theirs alone, never filed under someone else's", async () => {
  signedInWith([membership(A, "harbor")]);
  const { result, lines } = await said(() => send(post(report({ workspace: B }))));
  assert.equal(result.status, 200, "the report is still taken");
  const line = lines.find((l) => l.event === "client_error");
  assert.equal(line.tenant_id, undefined);
  assert.equal(line.user, "u-1");
  // The sign-in pages hold no workspace at all.
  const { lines: bare } = await said(() => send(post(report({ boundary: "root", workspace: null }))));
  assert.equal(bare.find((l) => l.event === "client_error").tenant_id, undefined);
});

test("no session is no report: refused before anything is logged; and the twenty-first an hour is refused as a flood", async () => {
  setBearerVerifier(async () => ({ supabase: {}, claims: null, error: null }));
  const { result, lines } = await said(() => send(post(report())));
  assert.equal(result.status, 401);
  assert.deepEqual(
    lines.filter((l) => l.event === "client_error"),
    [],
  );
  signedInWith([]);
  const statuses = [];
  await said(async () => {
    for (let i = 0; i < 21; i++) statuses.push((await send(post(report({ message: `loop ${i}` })))).status);
  });
  assert.deepEqual([statuses.slice(0, 20).every((s) => s === 200), statuses[20]], [true, 429]);
});

test("the browser's reporter sends each error once, five at most a load, as JSON through the beacon, naming the workspace the shell holds; a beacon that will not queue is a report lost", () => {
  const beacons = [];
  const nav = { sendBeacon: (url, blob) => (beacons.push({ url, blob }), true) };
  const reportError = clientErrorReporter(nav, () => A);
  assert.equal(reportError("shell", new Error("a"), "inbox"), true);
  assert.equal(reportError("shell", new Error("a"), "inbox"), false, "the same error twice is one report");
  for (const m of ["b", "c", "d", "e"]) reportError("os", new Error(m), "inbox");
  assert.equal(reportError("os", new Error("f"), "inbox"), false, "a sixth is a stream, not a report");
  assert.equal(beacons.length, 5);
  assert.equal(beacons[0].url, "/api/v1/client-errors");
  assert.equal(beacons[0].blob.type, "application/json");
  const refusing = clientErrorReporter({ sendBeacon: () => false });
  assert.equal(refusing("root", new Error("x"), null), false);
  const throwing = clientErrorReporter({
    sendBeacon: () => {
      throw new Error("blocked");
    },
  });
  assert.equal(throwing("root", new Error("y"), null), false, "never a second error");
  assert.equal(clientErrorReporter(undefined)("root", new Error("z"), null), false, "no beacon at all");
});

test("the shell's boundary says what it caught as an event on the window, and the host sends it; unhooked, it hears nothing", async () => {
  const listeners = new Map();
  const win = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const sent = [];
  const unhook = listenForShellErrors(win, (...args) => sent.push(args));
  const caught = new Error("boundary caught");
  listeners.get(SHELL_ERROR_EVENT)({ detail: { error: caught, page: "people/5f0c9a3e" } });
  listeners.get(SHELL_ERROR_EVENT)({ detail: null });
  assert.deepEqual(sent, [
    ["shell", caught, "people/5f0c9a3e"],
    ["shell", undefined, null],
  ]);
  unhook();
  assert.equal(listeners.has(SHELL_ERROR_EVENT), false);
});
