/**
 * Move stored thread state from the old flat key to the tenant-scoped one.
 *
 *   threads/<phone digits>.json   ->   threads/<tenant uuid>/<phone digits>.json
 *
 * The old key had no tenant in it, so one object carried a customer's
 * conversation history, pause state, dedupe list and reply cap for EVERY
 * business that has them as a customer. With one live tenant nothing has
 * actually crossed; this moves the data before a second tenant makes that
 * theoretical leak real, and leaves no un-namespaced personal data behind.
 *
 *   node tooling/scripts/migrate-thread-namespace.mjs               # dry run
 *   node tooling/scripts/migrate-thread-namespace.mjs --apply
 *   node tooling/scripts/migrate-thread-namespace.mjs --apply --purge-legacy
 *
 * Requires BLOB_READ_WRITE_TOKEN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * The tenant for each key is resolved from the DATABASE — the phone number is
 * matched against contacts. A number that matches zero tenants, or more than
 * one, is REPORTED AND SKIPPED rather than guessed: guessing here would put one
 * business's conversation into another's namespace, which is the very thing
 * this migration exists to prevent.
 *
 * Follows the house rules for anything that writes to production: dry run by
 * default, --apply to mean it, idempotent, and a JSONL record of every change.
 */
import fs from "node:fs";
import { list, get, put, del } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PURGE = process.argv.includes("--purge-legacy");
const LOG = "tooling/scripts/migrate-thread-namespace.log.jsonl";

const { BLOB_READ_WRITE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = new Date().toISOString();

function record(action, detail) {
  console.log(`${APPLY ? "APPLY" : "DRY  "}  ${action.padEnd(16)} ${JSON.stringify(detail)}`);
  if (APPLY) fs.appendFileSync(LOG, JSON.stringify({ at: stamp, action, ...detail }) + "\n");
}

/** Every blob under threads/, paged. */
async function allThreadBlobs() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: "threads/", cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Which tenants have this phone number as a contact? */
async function tenantsForPhone(digits) {
  const e164 = `+${digits}`;
  const { data, error } = await db
    .from("contacts")
    .select("tenant_id")
    .eq("phone_e164", e164);
  if (error) throw new Error(`contacts lookup: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.tenant_id))];
}

const blobs = await allThreadBlobs();
// A legacy key has exactly one segment after "threads/". A migrated one has two.
const legacy = blobs.filter((b) => b.pathname.split("/").length === 2);
const already = blobs.length - legacy.length;

console.log(`${blobs.length} thread objects — ${legacy.length} on the legacy flat key, ${already} already namespaced\n`);
if (legacy.length === 0) {
  console.log("Nothing to migrate.");
  process.exit(0);
}

const skipped = [];
let moved = 0;
let purged = 0;

for (const b of legacy) {
  const digits = b.pathname.replace(/^threads\//, "").replace(/\.json$/, "");
  if (!/^\d{8,15}$/.test(digits)) {
    skipped.push({ pathname: b.pathname, why: "not a phone-number key" });
    continue;
  }

  let tenants;
  try {
    tenants = await tenantsForPhone(digits);
  } catch (e) {
    skipped.push({ pathname: b.pathname, why: e.message });
    continue;
  }

  if (tenants.length !== 1) {
    // Zero: no contact anywhere — orphaned state, safe to purge but never to
    // assign. More than one: the shared-customer case this migration exists
    // for, and the one time guessing would cause the harm we are preventing.
    skipped.push({
      pathname: b.pathname,
      why: tenants.length === 0 ? "no tenant has this contact" : `AMBIGUOUS — ${tenants.length} tenants share this contact`,
      tenants,
    });
    continue;
  }

  const target = `threads/${tenants[0]}/${digits}.json`;
  if (blobs.some((x) => x.pathname === target)) {
    record("already-moved", { from: b.pathname, to: target });
    continue;
  }

  record("move", { from: b.pathname, to: target, tenant: tenants[0], size: b.size });
  if (APPLY) {
    // Read-then-write rather than copy(): the body is small JSON, and this
    // verifies the object is readable and parseable before the original is
    // eligible for deletion.
    const res = await get(b.pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) {
      skipped.push({ pathname: b.pathname, why: "unreadable at migration time" });
      continue;
    }
    const text = await new Response(res.stream).text();
    JSON.parse(text); // throws rather than migrating a corrupt object
    await put(target, text, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    moved++;
    if (PURGE) {
      await del(b.url);
      purged++;
      record("purge-legacy", { pathname: b.pathname });
    }
  } else {
    moved++;
  }
}

console.log(`\n${moved} ${APPLY ? "moved" : "would move"}${PURGE ? `, ${purged} legacy objects deleted` : ""}`);
if (skipped.length) {
  console.log(`\n${skipped.length} SKIPPED — these need a decision, not a script:`);
  for (const s of skipped) console.log(`  ${s.pathname}\n     ${s.why}${s.tenants ? ` (${s.tenants.join(", ")})` : ""}`);
}
if (!APPLY) console.log("\nDry run. Re-run with --apply to write, and add --purge-legacy to remove the old keys.");
