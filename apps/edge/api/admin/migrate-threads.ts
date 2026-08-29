/**
 * One-shot: move stored thread state from the legacy flat key to the
 * tenant-scoped one.
 *
 *   threads/<phone digits>.json  ->  threads/<tenant uuid>/<phone digits>.json
 *
 * Runs HERE rather than as a local script because BLOB_READ_WRITE_TOKEN is a
 * sensitive Vercel variable — unretrievable by design — and this function
 * already holds it. Same internal-endpoint pattern as admin/backfill and
 * admin/pause: x-diag-key auth, dry-run by default, and REMOVED once it has
 * run (a one-shot migration endpoint left deployed is an attack surface with
 * no remaining purpose).
 *
 * The tenant for each object is resolved from the DATABASE: the phone number
 * is matched against contacts. Zero matches or more than one -> reported and
 * SKIPPED, never guessed — assigning a shared customer's history to the wrong
 * business is the exact harm the namespaced key exists to prevent.
 *
 * Body: { apply?: boolean, purge_legacy?: boolean }
 */
import { list, get, put, del } from "@vercel/blob";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";

export const config = { maxDuration: 60 };

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  let body: { apply?: boolean; purge_legacy?: boolean } = {};
  try { body = JSON.parse(await request.text()); } catch { /* dry run */ }
  const APPLY = body.apply === true;
  const PURGE = body.purge_legacy === true;

  // Every object under threads/, paged.
  const blobs: Array<{ pathname: string; url: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "threads/", cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  // Legacy = exactly one segment after "threads/". Migrated = two.
  const legacy = blobs.filter((b) => b.pathname.split("/").length === 2);
  const report = {
    ok: true,
    apply: APPLY,
    total: blobs.length,
    already_namespaced: blobs.length - legacy.length,
    legacy: legacy.length,
    moved: [] as Array<{ from: string; to: string; tenant: string }>,
    purged: [] as string[],
    skipped: [] as Array<{ pathname: string; why: string; tenants?: string[] }>,
  };

  for (const b of legacy) {
    const digits = b.pathname.replace(/^threads\//, "").replace(/\.json$/, "");
    if (!/^\d{8,15}$/.test(digits)) {
      report.skipped.push({ pathname: b.pathname, why: "not a phone-number key" });
      continue;
    }

    const { data, error } = await db
      .from("contacts")
      .select("tenant_id")
      .eq("phone_e164", `+${digits}`);
    if (error) {
      report.skipped.push({ pathname: b.pathname, why: `contacts lookup: ${error.message}` });
      continue;
    }
    const tenants = [...new Set((data ?? []).map((r) => r.tenant_id))];
    if (tenants.length !== 1) {
      report.skipped.push({
        pathname: b.pathname,
        why: tenants.length === 0 ? "no tenant has this contact" : "AMBIGUOUS — multiple tenants share this contact",
        tenants,
      });
      continue;
    }

    const target = `threads/${tenants[0]}/${digits}.json`;
    if (blobs.some((x) => x.pathname === target)) {
      // Idempotent: a re-run after a partial apply just reports the move done.
      report.moved.push({ from: b.pathname, to: target, tenant: tenants[0] });
      if (APPLY && PURGE) { await del(b.url); report.purged.push(b.pathname); }
      continue;
    }

    report.moved.push({ from: b.pathname, to: target, tenant: tenants[0] });
    if (APPLY) {
      // Read-then-write, not copy: verifies the object is readable AND
      // parseable before the original becomes eligible for deletion.
      const res = await get(b.pathname, { access: "private", useCache: false });
      if (!res || res.statusCode !== 200 || !res.stream) {
        report.moved.pop();
        report.skipped.push({ pathname: b.pathname, why: "unreadable at migration time" });
        continue;
      }
      const text = await new Response(res.stream as ReadableStream).text();
      try { JSON.parse(text); } catch {
        report.moved.pop();
        report.skipped.push({ pathname: b.pathname, why: "corrupt JSON — not migrating" });
        continue;
      }
      await put(target, text, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      if (PURGE) { await del(b.url); report.purged.push(b.pathname); }
    }
  }

  console.log("admin_migrate_threads", JSON.stringify({
    apply: APPLY, purge: PURGE, legacy: report.legacy,
    moved: report.moved.length, purged: report.purged.length, skipped: report.skipped.length,
  }));
  return json(200, report);
}
