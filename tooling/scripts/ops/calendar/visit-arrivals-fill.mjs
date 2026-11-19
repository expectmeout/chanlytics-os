/**
 * Stamp every visit with when its booking arrived (00647, decision 0141) (prod-script bar): dry-run DEFAULT, a JSONL
 * backup of every planned row before any write, idempotent, --apply to execute.
 *
 * 00647 keeps the moment a booking arrived on its visit as the event is delivered (core SUBSCRIBERS.visit_arrival),
 * which reaches only the bookings that arrive from then on. This reads the ledger's appointment.changed events, asks
 * the same rule of each (contracts bookingArriving) and stamps each visit with the latest moment the rule calls an
 * arrival, through the door the subscriber uses (db stampVisitArrival). Nothing here is a second rule for what a
 * booking is. It is also the mend for a delivery that never ran: it stamps whatever the ledger says arrived and no
 * stamp says.
 *
 * A dry run says how many visits it would stamp and shows five of them; it writes nothing. An apply writes the backup,
 * then stamps each visit only where it has no stamp or a sooner one, counted: a visit gone from the record since is
 * said and skipped. A second apply finds nothing to do.
 *
 * Needs 00647 applied: it checks for the column first and stops without it.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node --import tsx tooling/scripts/ops/calendar/visit-arrivals-fill.mjs
 *   node --import tsx tooling/scripts/ops/calendar/visit-arrivals-fill.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bookingArriving } from "@chanlytics/contracts";
import { stampVisitArrival } from "@chanlytics/db/calendar";

/** PostgREST answers a thousand rows a read at most. */
const PAGE = 1000;

/** How many ids one read names: past a couple of hundred the address is too long. */
const IDS_PER_READ = 100;

/** How many planned visits a dry run shows. */
const SHOWN = 5;

/**
 * The latest moment each visit's booking arrived, by the one rule over the ledger's events: the visit's id, with its
 * workspace and the event's own clock. A hold added and then confirmed arrived when it was confirmed.
 */
export function arrivalsOf(events) {
  const latest = new Map();
  for (const event of events) {
    const arriving = bookingArriving(event);
    if (!arriving) continue;
    const held = latest.get(arriving.appointmentId);
    if (!held || Date.parse(event.created_at) > Date.parse(held.at))
      latest.set(arriving.appointmentId, { tenant_id: event.tenant_id, at: event.created_at });
  }
  return latest;
}

/** The visits to stamp: those on the record, in the event's own workspace, with no stamp or a sooner one. */
export function planStamps(arrivals, rows) {
  return rows.flatMap((row) => {
    const arrival = arrivals.get(row.id);
    if (!arrival || arrival.tenant_id !== row.tenant_id) return [];
    if (row.arrived_at && Date.parse(row.arrived_at) >= Date.parse(arrival.at)) return [];
    return [{ id: row.id, tenant_id: row.tenant_id, had: row.arrived_at, at: arrival.at }];
  });
}

/** The apply's write, the subscriber's own (db stampVisitArrival), counted: a write that moved no row is said. */
export async function writeStamps(db, plan) {
  const written = [];
  const skipped = [];
  for (const stamp of plan) {
    try {
      if (await stampVisitArrival(db, stamp.tenant_id, stamp.id, stamp.at)) written.push(stamp);
      else skipped.push({ id: stamp.id, reason: "write matched no row: stamped or gone since" });
    } catch (e) {
      skipped.push({ id: stamp.id, reason: `write: ${e instanceof Error ? e.message : e}` });
    }
  }
  return { written, skipped };
}

/** Every row of a read, a page at a time, under the read's own order. */
async function everyRow(read, what) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) {
      console.error(`read ${what}: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
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

  // 00647 first: the column, or nothing to stamp.
  const column = await db.from("appointments").select("arrived_at").limit(1);
  if (column.error) {
    console.error(`00647 is not applied here: ${column.error.message}`);
    process.exit(1);
  }

  // A workspace at a time, so each read is a range of the ledger's own index (tenant, kind, moment).
  const workspaces = await everyRow(
    (from, to) => db.from("tenants").select("id").order("id", { ascending: true }).range(from, to),
    "the workspaces",
  );
  const events = [];
  for (const workspace of workspaces)
    events.push(
      ...(await everyRow(
        (from, to) =>
          db
            .from("events")
            .select("id, tenant_id, kind, subject_type, subject_id, data, created_at")
            .eq("tenant_id", workspace.id)
            .eq("kind", "appointment.changed")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        "the visits' changes",
      )),
    );
  const arrivals = arrivalsOf(events);
  const ids = [...arrivals.keys()];
  const rows = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("appointments")
      .select("id, tenant_id, arrived_at, status, source, starts_at")
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) {
      console.error(`read the visits: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
  }
  const plan = planStamps(arrivals, rows);
  console.log(
    `${workspaces.length} workspaces, ${events.length} changes of a visit on the ledger, ${arrivals.size} visits a booking arrived for, ${rows.length} of them on the record, ${plan.length} to stamp.`,
  );
  if (!plan.length) {
    console.log("Nothing to do.");
    return;
  }

  if (!apply) {
    for (const stamp of plan.slice(0, SHOWN)) console.log(`  ${stamp.id}  ${stamp.had ?? "no stamp"} -> ${stamp.at}`);
    console.log(
      `\nWould run: update appointments set arrived_at = <the event's moment> where it has none or a sooner one, for ${plan.length} visits.`,
    );
    console.log("Dry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const moment = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `visit-arrivals-fill-${moment}.jsonl`);
  const planned = new Set(plan.map((stamp) => stamp.id));
  writeFileSync(
    backupPath,
    rows
      .filter((row) => planned.has(row.id))
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n",
  );
  console.log(`backup: ${plan.length} rows -> ${backupPath}`);

  const { written, skipped } = await writeStamps(db, plan);
  for (const miss of skipped) console.log(`  skipped ${miss.id}  ${miss.reason}`);
  console.log(`\n${written.length} stamped, ${skipped.length} skipped.`);
  if (skipped.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
