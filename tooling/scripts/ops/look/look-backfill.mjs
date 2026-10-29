/**
 * Ask the website read again for every workspace that exists today and wears no logo or no colour (decision 0075; the
 * prod-script bar): dry-run DEFAULT, a JSONL backup of every planned row before any write, idempotent, --apply to execute.
 *
 * A new workspace's look is read at its first run (00490: website_read wears what the site declares, where no person
 * set it). The workspaces made before it never had that read with the look in it. This schedules the same job for
 * each of them, once (scheduleJobOnce: one while one waits), and the job runner does the rest within minutes: the
 * page read, the icon remade and stored, the colour read, both worn through wear_found_look, which still fills only
 * what no person set. Nothing here is a second rule for what a look is, and nothing here writes a tenant's row.
 *
 * A dry run lists each workspace with its website and what it lacks; it writes nothing. An apply writes the backup,
 * then schedules the job for each; a workspace whose read already waits is said so. A second apply finds only the
 * workspaces the first could not schedule.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run:
 *   node --import tsx tooling/scripts/ops/look/look-backfill.mjs            (dry run)
 *   node --import tsx tooling/scripts/ops/look/look-backfill.mjs --slug harbor    (one workspace)
 *   node --import tsx tooling/scripts/ops/look/look-backfill.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { feedUrlOk, parseTenantConfig } from "@chanlytics/contracts";
import { scheduleJobOnce } from "../../../../packages/jobs/src/schedule.ts";

/** The website a workspace's read would use: the settings' first, else the linked listing's (website-read.ts askWebsiteRead). */
export function websiteOf(config, listingFacts) {
  const own = parseTenantConfig(config)?.brain?.profile?.website ?? null;
  const listing = listingFacts && typeof listingFacts === "object" ? listingFacts.website : null;
  return feedUrlOk(own) ?? feedUrlOk(typeof listing === "string" ? listing : null) ?? null;
}

/** What each workspace lacks, with the site it would be read from; a workspace with no public website is skipped, said. */
export function planLook(tenants, configs, listings) {
  const plan = [];
  const skipped = [];
  for (const t of tenants) {
    const missing = [t.logo_path ? null : "logo", t.accent ? null : "accent"].filter(Boolean);
    if (!missing.length) continue;
    const website = websiteOf(configs.get(t.id) ?? null, listings.get(t.id) ?? null);
    if (!website) {
      skipped.push({ tenant_id: t.id, slug: t.slug, why: "no public website" });
      continue;
    }
    plan.push({ tenant_id: t.id, slug: t.slug, name: t.name, website, missing });
  }
  return { plan, skipped };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const slugAt = process.argv.indexOf("--slug");
  const onlySlug = slugAt >= 0 ? process.argv[slugAt + 1] : null;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 00490 first: the column, or nothing for the read to wear into.
  const column = await db.from("tenants").select("accent").limit(1);
  if (column.error) {
    console.error(`00490 is not applied here: ${column.error.message}`);
    process.exit(1);
  }

  let q = db
    .from("tenants")
    .select("id, slug, name, status, logo_path, accent")
    .eq("status", "active")
    .or("logo_path.is.null,accent.is.null")
    .order("slug");
  if (onlySlug) q = q.eq("slug", onlySlug);
  const tenants = await q;
  if (tenants.error) {
    console.error(`read tenants: ${tenants.error.message}`);
    process.exit(1);
  }
  const ids = (tenants.data ?? []).map((t) => t.id);
  const [configs, listings] = await Promise.all([
    db.from("tenant_config").select("tenant_id, config").in("tenant_id", ids),
    db.from("google_listings").select("tenant_id, facts").in("tenant_id", ids),
  ]);
  if (configs.error || listings.error) {
    console.error(`read settings: ${configs.error?.message ?? listings.error?.message}`);
    process.exit(1);
  }
  const { plan, skipped } = planLook(
    tenants.data ?? [],
    new Map((configs.data ?? []).map((r) => [r.tenant_id, r.config])),
    new Map((listings.data ?? []).map((r) => [r.tenant_id, r.facts])),
  );
  console.log(
    `${plan.length} workspaces with a website and no logo or no colour; ${skipped.length} with no public website.`,
  );
  for (const p of plan) console.log(`  ${p.slug.padEnd(24)} ${p.missing.join("+").padEnd(12)} ${p.website}`);
  for (const s of skipped) console.log(`  skipped ${s.slug}: ${s.why}`);
  if (!plan.length) return;

  if (!apply) {
    console.log("\nDry run only: nothing was scheduled. Re-run with --apply to ask each read.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `look-backfill-${stamp}.jsonl`);
  const planned = new Set(plan.map((p) => p.tenant_id));
  writeFileSync(
    backupPath,
    (tenants.data ?? [])
      .filter((t) => planned.has(t.id))
      .map((t) => JSON.stringify(t))
      .join("\n") + "\n",
  );
  console.log(`backup: ${plan.length} rows -> ${backupPath}`);

  let scheduled = 0;
  let waiting = 0;
  for (const p of plan) {
    const r = await scheduleJobOnce(db, {
      tenantId: p.tenant_id,
      kind: "website_read",
      dueAt: new Date(),
      payload: { url: p.website },
    });
    if (r === "scheduled") scheduled += 1;
    else waiting += 1;
    console.log(`  ${r.padEnd(18)} ${p.slug}`);
  }
  console.log(
    `\n${scheduled} reads asked, ${waiting} already waiting. The job runner wears what it finds within minutes.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
