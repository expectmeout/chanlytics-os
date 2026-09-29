/**
 * 00280 migration_head(), on the replayed stack: the newest version the CLI's ledger has applied and how many, which
 * keyed /api/diag answers, and the service role's alone.
 *
 * The replay applies every file in supabase/migrations, so the head is the folder's highest version and the count is
 * the folder's; a member's session and the anon key are refused the function, since which migration a database runs is
 * the platform's to read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ROOT } from "../_source.mjs";
import { readFolder } from "../../checks/migration-ledger.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: the replay's head is the folder's, production's is not"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the refusal is proved with it"
        : false;

test("the head is the folder's highest version, and every file in it is applied", { skip }, async () => {
  const db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("migration_head");
  assert.equal(error, null, error?.message);
  const folder = readFolder(ROOT);
  assert.deepEqual(data, [{ head: folder.at(-1).version, applied: folder.length }]);
});

test("only the service role may ask: the anon key is refused", { skip }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.rpc("migration_head");
  assert.equal(data, null);
  assert.ok(error, "refused");
});
