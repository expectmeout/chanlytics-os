/**
 * Signing out forgets every phone of the person (00432; the wiring's second audit, R11 S8-3). The sign-out ends every
 * session of theirs on every device (the route's signOut is global), and their phones went on being pushed handoff and
 * call alerts, with the customer's words, until someone else signed in on them. The route asks the database to forget
 * them first, while the session still says who they are, and that step never stands in the sign-out's way.
 *
 * Executed: packages/db's door over the database in memory, and the dashboard's step over one that fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { forgetEveryPhone } = await import(at("packages/db/src/repositories/notices/member-alerts.ts"));
const { forgetPhonesOnSignOut } = await import(at("apps/dashboard/src/server/auth/sign-out.ts"));

test("the door forgets every phone of the person signed in, and says how many", async () => {
  const asked = [];
  const db = fakeDb({}, {}, { push_devices_forget_all: (args) => (asked.push(args), { forgotten: 2 }) });
  assert.equal(await forgetEveryPhone(db), 2);
  assert.equal(asked.length, 1, "one call, on the person's own session");
});

test("a database before 00432 forgets nothing and says so; any other failure is thrown", async () => {
  const before = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "no such function" } }) };
  assert.equal(await forgetEveryPhone(before), null);
  const down = { rpc: async () => ({ data: null, error: { code: "57P01", message: "terminating connection" } }) };
  await assert.rejects(forgetEveryPhone(down), /cannot forget the phones/);
});

test("the sign-out's step never stands in its way: a phone not forgotten is said in the log, and the sign-out goes on", async () => {
  const down = { rpc: async () => ({ data: null, error: { code: "57P01", message: "terminating connection" } }) };
  const said = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    said.push(String(chunk));
    return write(chunk, ...rest);
  };
  const writeErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    said.push(String(chunk));
    return writeErr(chunk, ...rest);
  };
  try {
    await assert.doesNotReject(forgetPhonesOnSignOut(down));
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
  assert.ok(
    said.some((line) => line.includes("signout_phones_not_forgotten")),
    "said, so a phone left registered is not left in silence",
  );
});
