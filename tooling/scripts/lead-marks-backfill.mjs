/**
 * Keep a copy of the mark of every lead found before 00161 (prod-script bar): dry-run DEFAULT, a JSONL backup of
 * every planned row before any write, idempotent, --apply to execute.
 *
 * 00147 stored the address of each lead's logo on its own site, and not one ever drew: the dashboard's content
 * policy lets images in from three hosts. 00161 keeps a copy on our own storage as the collect finds a lead, which
 * reaches only the leads found from then on. This runs the collect's own mark step (core's markPlaces, over the
 * edge's own wires in apps/edge/lib/leads/lead-marks.ts) for every lead with a site and no copy yet, and writes the
 * name of what it kept. Nothing here is a second rule for what a mark is.
 *
 * A dry run reads each home page and logo and says what it would keep; it stores nothing and writes nothing. An
 * apply stores each copy (named by its own hash, so storing it twice is one file), then writes the lead's name only
 * where the lead still has none and is not blanked or erased, counted: an update that matched no row is not a
 * success. A second apply finds only the leads the first could not mark.
 *
 * Needs 00161 applied, the bucket and the column: it checks both first and stops without them.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node --import tsx tooling/scripts/lead-marks-backfill.mjs
 *   node --import tsx tooling/scripts/lead-marks-backfill.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LEAD_MARKS_BUCKET } from "@chanlytics/contracts";
import { JUDGE_MARGIN_MS, MARK_AT_ONCE, markPlaces } from "../../packages/core/src/leads/index.ts";
import { imageBytes, leadMarkPath, pageText, storeLeadMark } from "../../apps/edge/lib/leads/lead-marks.ts";

const COLUMNS = "id, tenant_id, website_host, logo_url, mark_path, blanked_at, erased_at";

/** The leads to mark: a site to read, no copy yet, and neither blanked nor erased. */
export function planMarks(rows) {
  return rows
    .filter((r) => r.website_host && !r.mark_path && !r.blanked_at && !r.erased_at)
    .map((r) => ({ id: r.id, tenant_id: r.tenant_id, website_host: r.website_host, logo_url: r.logo_url ?? null }));
}

/**
 * The collect's mark step over the planned leads, a collect's worth at a time: each lead as the place markPlaces
 * reads (its site; no mark yet), and the ports it runs on. Answers each lead given a copy, with the address it came
 * from and the name it was stored under.
 */
export async function markLeads(plan, ports, now = () => new Date()) {
  const out = [];
  for (let i = 0; i < plan.length; i += MARK_AT_ONCE) {
    const places = plan.slice(i, i + MARK_AT_ONCE).map((lead) => ({
      lead,
      place: { website_host: lead.website_host, logo_url: null, mark_path: null },
      member: { class: "qualified" },
    }));
    // A deadline far enough off that only the step's own allowance bounds it, as in a collect with time to spare.
    await markPlaces({ ...ports, now, deadline: now().getTime() + JUDGE_MARGIN_MS + 60_000 }, places);
    for (const x of places)
      if (x.place.mark_path)
        out.push({
          id: x.lead.id,
          tenant_id: x.lead.tenant_id,
          had: x.lead.logo_url,
          logo_url: x.place.logo_url,
          mark_path: x.place.mark_path,
        });
  }
  return out;
}

/**
 * The apply's write: the name where the lead still has none, and the address it came from where the lead had no
 * address either. Guarded on the state it was planned in, and counted.
 */
export async function writeMarks(db, marked) {
  const written = [];
  const skipped = [];
  for (const m of marked) {
    const patch = m.had ? { mark_path: m.mark_path } : { mark_path: m.mark_path, logo_url: m.logo_url };
    const { data, error } = await db
      .from("leads")
      .update(patch)
      .eq("id", m.id)
      .eq("tenant_id", m.tenant_id)
      .is("mark_path", null)
      .is("blanked_at", null)
      .is("erased_at", null)
      .select("id");
    if (error) skipped.push({ id: m.id, why: `write: ${error.message}` });
    else if (!data?.length) skipped.push({ id: m.id, why: "write matched no row: marked, blanked or erased since" });
    else written.push(m);
  }
  return { written, skipped };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 00161 first: the column and the bucket, or nothing to write into.
  const column = await db.from("leads").select("mark_path").limit(1);
  const bucket = await db.storage.getBucket(LEAD_MARKS_BUCKET);
  if (column.error || bucket.error || !bucket.data?.public) {
    console.error(
      `00161 is not applied here: ${column.error?.message ?? bucket.error?.message ?? `the ${LEAD_MARKS_BUCKET} bucket is not public`}`,
    );
    process.exit(1);
  }

  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("leads")
      .select(COLUMNS)
      .not("website_host", "is", null)
      .is("mark_path", null)
      .is("blanked_at", null)
      .is("erased_at", null)
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (error) {
      console.error(`read leads: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const plan = planMarks(rows);
  console.log(`${plan.length} leads with a site and no copy of their mark.`);
  if (!plan.length) return;

  const wires = {
    fetchText: (u, ms) => pageText(fetch, u, ms),
    fetchBytes: (u, ms, max) => imageBytes(fetch, u, ms, max),
  };

  if (!apply) {
    const seen = new Map();
    const marked = await markLeads(plan, {
      ...wires,
      // Named as it would be, and stored nowhere.
      storeMark: async (bytes, image) => {
        const path = leadMarkPath(bytes, image);
        seen.set(path, `${image.kind} ${image.width}x${image.height}`);
        return path;
      },
    });
    for (const m of marked) console.log(`  ${m.id}  ${seen.get(m.mark_path)}  ${m.logo_url}`);
    console.log(`\n${marked.length} of ${plan.length} would be kept. Dry run only: nothing was stored or written.`);
    console.log("Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `lead-marks-backfill-${stamp}.jsonl`);
  const planned = new Set(plan.map((p) => p.id));
  writeFileSync(
    backupPath,
    rows
      .filter((r) => planned.has(r.id))
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n",
  );
  console.log(`backup: ${plan.length} rows -> ${backupPath}`);

  const marked = await markLeads(plan, { ...wires, storeMark: (bytes, image) => storeLeadMark(db, bytes, image) });
  const { written, skipped } = await writeMarks(db, marked);
  for (const w of written) console.log(`  kept ${w.id}  ${w.mark_path}  ${w.logo_url}`);
  for (const s of skipped) console.log(`  skipped ${s.id}  ${s.why}`);
  console.log(
    `\n${written.length} kept, ${skipped.length} skipped, ${plan.length - marked.length} with no mark worth keeping.`,
  );
  if (skipped.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
