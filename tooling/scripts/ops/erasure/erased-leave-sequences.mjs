/**
 * End the places an erasure left standing in a sequence (prod-script bar): dry-run DEFAULT, a JSONL backup of every row
 * it will change before any write, idempotent, --apply to execute.
 *
 * Until 00548 an erasure ended no place. A person erased while they, or their lead, were in a sequence stayed counted
 * among its people: a lead's later step finds whom it writes to by the email its step before sent, erase_contact
 * deletes that email, and so the step never saw them again to pass them over. An email still planned for them stayed
 * planned. Nothing was sent to anyone (there is no address left to send to); the sequence's counts were wrong, and the
 * places would have stood for good. 00548 ends them as the erasure commits. This ends the ones from before it.
 *
 * It reads every place still `in`, and takes the ones whose lead is erased (a lead's place) or whose person is (a
 * customer's place, one with no lead). Each leaves through the door every leave goes through
 * (sequence_enrollments_leave, by db's leaveSequence), with why `erased`: the door ends the place and skips each send
 * of theirs in that sequence not yet gone (planned, held, queued, drafted) with the same word, and a run left with
 * nothing to send ends by its own trigger. Nothing here is a second rule for what leaving is.
 *
 * A dry run changes nothing: it lists each place (ids only: the people are erased, and nothing names them) and each
 * send the door would skip. An apply writes every place and send it will change, as they stand, to
 * tooling/backups/erased-leave-sequences-<stamp>.jsonl (one {table, row} per line), asks the door a workspace at a
 * time, then reads again: none it planned may still stand. A second apply finds nothing. Runs before or after 00548:
 * the door is 00441's.
 *
 * The backup is the record of what stood. A place can be put back from it (state `in`, why, ended_at and left_by
 * null, next_at the backup's); a skipped send cannot be planned again (sequence_sends_guard), so a person brought back
 * from a database backup is planned anew by their step's next run. No erased person's place should need either.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node --import tsx tooling/scripts/ops/erasure/erased-leave-sequences.mjs
 *   node --import tsx tooling/scripts/ops/erasure/erased-leave-sequences.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leaveSequence } from "@chanlytics/db";

const PAGE = 500;
const IDS_AT_ONCE = 100;
/** Why they leave: the word the clock already skips an erased person's queued email with. */
const WHY = "erased";
/** The sends a leave skips: sequence_enrollments_leave's own list. */
const OPEN_SENDS = ["planned", "held", "queued", "drafted"];

/** Whether a send is the place's, as the door chooses it: its lead's in that sequence, or its person's with no lead. */
const sendOf = (e, s) =>
  s.tenant_id === e.tenant_id &&
  s.sequence_id === e.sequence_id &&
  (e.lead_id === null ? s.lead_id === null && s.contact_id === e.contact_id : s.lead_id === e.lead_id);

/**
 * The places to end and the sends the door will skip with them: a place still in whose lead is erased, or, with no
 * lead, whose person is. A lead's place is its lead's, never judged by a person: a lead someone else at the business
 * stands in for is still written to.
 */
export function planLeaves({ enrollments, erasedLeads, erasedContacts, sends }) {
  const places = enrollments.filter(
    (e) => e.state === "in" && (e.lead_id !== null ? erasedLeads.has(e.lead_id) : erasedContacts.has(e.contact_id)),
  );
  return {
    places,
    sends: sends.filter((s) => OPEN_SENDS.includes(s.state) && places.some((e) => sendOf(e, s))),
  };
}

/**
 * The plan's places, handed to the door a workspace at a time (`leave`: db's leaveSequence). Answers how many left, and
 * each workspace where the door ended fewer than planned: a place that ended between the read and the write.
 */
export async function applyLeaves(plan, leave) {
  const byTenant = new Map();
  for (const e of plan.places) byTenant.set(e.tenant_id, [...(byTenant.get(e.tenant_id) ?? []), e.id]);
  let left = 0;
  const short = [];
  for (const [tenantId, enrollmentIds] of byTenant) {
    const n = await leave({ tenantId, enrollmentIds, why: WHY });
    left += n;
    if (n !== enrollmentIds.length) short.push({ tenant_id: tenantId, planned: enrollmentIds.length, left: n });
  }
  return { left, short };
}

/** Every row of a read, a page at a time; a read that fails stops the run: unread is not none. */
async function pages(what, query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`read ${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** The ids among `ids` whose row in `table` is erased. */
async function erasedAmong(db, table, ids) {
  const erased = new Set();
  for (let i = 0; i < ids.length; i += IDS_AT_ONCE) {
    const { data, error } = await db
      .from(table)
      .select("id")
      .in("id", ids.slice(i, i + IDS_AT_ONCE))
      .not("erased_at", "is", null);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    for (const r of data ?? []) erased.add(r.id);
  }
  return erased;
}

/** What stands now: every place still in, which of their leads and people are erased, and their sequences' open sends. */
async function readStanding(db) {
  const enrollments = await pages("the places", (from, to) =>
    db.from("sequence_enrollments").select("*").eq("state", "in").order("id", { ascending: true }).range(from, to),
  );
  const unique = (xs) => [...new Set(xs.filter(Boolean))];
  const erasedLeads = await erasedAmong(db, "leads", unique(enrollments.map((e) => e.lead_id)));
  const erasedContacts = await erasedAmong(
    db,
    "contacts",
    unique(enrollments.filter((e) => e.lead_id === null).map((e) => e.contact_id)),
  );
  const taken = planLeaves({ enrollments, erasedLeads, erasedContacts, sends: [] }).places;
  const sends = [];
  const sequences = unique(taken.map((e) => e.sequence_id));
  for (let i = 0; i < sequences.length; i += IDS_AT_ONCE)
    sends.push(
      ...(await pages("the sends", (from, to) =>
        db
          .from("sequence_sends")
          .select("*")
          .in("sequence_id", sequences.slice(i, i + IDS_AT_ONCE))
          .in("state", OPEN_SENDS)
          .order("id", { ascending: true })
          .range(from, to),
      )),
    );
  return planLeaves({ enrollments, erasedLeads, erasedContacts, sends });
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

  const plan = await readStanding(db);
  console.log(
    `${plan.places.length} places still in a sequence for someone erased; ${plan.sends.length} sends of theirs not yet gone.`,
  );
  if (!plan.places.length) return;
  for (const e of plan.places)
    console.log(
      `  place ${e.id}  workspace ${e.tenant_id}  sequence ${e.sequence_id}  ` +
        `${e.lead_id ? `lead ${e.lead_id}` : `person ${e.contact_id}`}  step ${e.place}  next ${e.next_at ?? "none"}`,
    );
  for (const s of plan.sends)
    console.log(`  send  ${s.id}  sequence ${s.sequence_id}  ${s.state}  due ${s.send_at ?? "none"}`);

  if (!apply) {
    console.log(`\nEach place would leave as "${WHY}", and each send be skipped with it.`);
    console.log("Dry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `erased-leave-sequences-${stamp}.jsonl`);
  writeFileSync(
    backupPath,
    [
      ...plan.places.map((row) => JSON.stringify({ table: "sequence_enrollments", row })),
      ...plan.sends.map((row) => JSON.stringify({ table: "sequence_sends", row })),
    ].join("\n") + "\n",
  );
  console.log(`\nbackup: ${plan.places.length + plan.sends.length} rows -> ${backupPath}`);

  const { left, short } = await applyLeaves(plan, (p) => leaveSequence(db, p));
  for (const s of short)
    console.log(`  workspace ${s.tenant_id}: ${s.left} of ${s.planned} left (the rest ended since they were read)`);
  const still = await readStanding(db);
  const planned = new Set(plan.places.map((e) => e.id));
  const standing = still.places.filter((e) => planned.has(e.id));
  console.log(`\n${left} places left as "${WHY}"; ${standing.length} of them still stand.`);
  if (standing.length) {
    for (const e of standing) console.log(`  still in: ${e.id}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
