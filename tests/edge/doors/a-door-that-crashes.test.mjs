/**
 * The one place a failure no door caught lands (decision 0114). A throw used to crash the function: the platform
 * answered with a page of its own and an unstructured stack, with no request name to find it by. Now the door logs one
 * line and answers a code, at a failure's status, so a provider still redelivers and a clock still counts a failed tick.
 * And a read or a write a door could not do answers plain words, its text in the log only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { logLineOf } from "../../_log-lines.mjs";

const { door, adminDoor, logFailure, refuseFailure } = await importSrc("apps/edge/lib/shared/log.ts");

/** Every logger line written while `fn` ran, parsed, and what it answered. */
async function run(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"]) console[level] = (...args) => lines.push(logLineOf(args));
  try {
    return { out: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}
const SECRET_TEXT = 'duplicate key value violates unique constraint "contacts_phone_key"';
const knock = () =>
  new Request("https://edge.example.com/api/inbound-sms", { method: "POST", headers: { "x-vercel-id": "iad1::abc" } });

test("a door that throws answers its code at a failure's status, its text and stack in one line, named as the request", async () => {
  for (const wrap of [door, adminDoor]) {
    const crashing = wrap(async () => {
      throw new Error(SECRET_TEXT);
    });
    const { out: res, lines } = await run(() => crashing(knock()));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { ok: false, error: "door_failed" });
    assert.ok(res.headers.get("x-request-id"), "the answer carries the request's name");
    const line = lines.find((l) => l.event === "door_failed");
    assert.equal(line?.level, "error");
    assert.equal(line?.door, "/api/inbound-sms");
    assert.equal(line?.error, `Error: ${SECRET_TEXT}`);
    assert.match(line?.error_stack ?? "", /^at /, "the line says where it was raised");
    assert.equal(line?.request_id, res.headers.get("x-request-id"));
  }
});

test("a throw of something that is no error, and a door with no request, are caught all the same", async () => {
  const strange = door(async () => {
    throw "not an error";
  });
  const { out: res, lines } = await run(() => strange());
  assert.equal(res.status, 500);
  assert.equal(lines.find((l) => l.event === "door_failed")?.error, "not an error");
});

test("a door that answers keeps its answer: a refusal is no crash", async () => {
  const fine = door(async () => new Response("ok", { status: 202 }));
  const { out: res, lines } = await run(() => fine(knock()));
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "ok");
  assert.equal(
    lines.some((l) => l.event === "door_failed"),
    false,
  );
});

test("a read or a write a door could not do says a try-again, and the failure's text only in the log", async () => {
  for (const [status, code, failure, words] of [
    [
      503,
      "read_failed",
      { code: "57014", message: SECRET_TEXT },
      "That could not be read just now. Try again in a moment.",
    ],
    [503, "query_failed", new Error(SECRET_TEXT), "That could not be read just now. Try again in a moment."],
    [
      500,
      "write_failed",
      { code: "23505", message: SECRET_TEXT },
      "That could not be saved just now. Try again in a moment.",
    ],
    [500, "run_failed", new Error(SECRET_TEXT), "That could not be run just now. Try again in a moment."],
  ]) {
    const { out: res, lines } = await run(() => refuseFailure(status, code, failure));
    assert.equal(res.status, status);
    const body = await res.json();
    assert.deepEqual(body, { ok: false, error: code, detail: words });
    assert.equal(JSON.stringify(body).includes(SECRET_TEXT), false);
    const line = lines.find((l) => l.event === "door_reply_failed");
    assert.ok(line?.error.includes(SECRET_TEXT), "the log keeps it");
    if (failure.code) assert.equal(line.db_code, failure.code);
  }
});

test("logFailure gives a door's own result its words, whatever it was handed", async () => {
  const { out, lines } = await run(() => logFailure("write", "no answer"));
  assert.equal(out, "That could not be saved just now. Try again in a moment.");
  assert.equal(lines[0].error, "no answer");
});
