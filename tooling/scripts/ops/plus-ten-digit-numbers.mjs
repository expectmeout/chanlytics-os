/**
 * Give back their country to the people kept under a North American number they never had (prod-script bar): dry-run
 * DEFAULT, a JSONL backup of every planned row before any write, idempotent, --apply to execute.
 *
 * Until 00366 a number written with its + and ten digits after it (+47 91 23 45 67, a Norwegian mobile; Danish,
 * Singaporean and many New Zealand numbers) was read as North American, and the person was kept as +14791234567. The
 * wire itself still says who they are: a WhatsApp identity is the full international number's digits, a text's the
 * sender's digits, a call's the caller's number with its +. So a person kept as +1 and ten digits, whose own identity
 * on one of those wires is exactly those ten digits (with or without the +), was read wrongly, and their number is +
 * and those ten digits. A North American's identity always carries the 1 (eleven digits), so it never matches.
 *
 * Nothing is merged and no guess is made: a person whose right number another person in the workspace already holds
 * is left as they are and listed, for the merge to join them; a person with no identity on those wires (a member typed
 * the number in) cannot be told from a North American and is not touched. An apply writes the number only where the
 * row still holds the one it was planned from, counted: an update that matched no row is not a success. A second
 * apply finds nothing.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node tooling/scripts/ops/plus-ten-digit-numbers.mjs
 *   node tooling/scripts/ops/plus-ten-digit-numbers.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The wires whose identity is the person's own number. */
const NUMBER_WIRES = ["whatsapp", "sms", "voice"];
/** A number as the old reading kept a + and ten digits: +1 and the ten. */
const MISREAD = /^\+1(\d{10})$/;

/**
 * The people to give back their number: kept as +1 and ten digits, with an identity on a number wire that is exactly
 * those ten digits; each with the number they should hold, or why they are left as they are.
 *
 * `contacts` are {id, tenant_id, phone_e164}; `identities` are {contact_id, channel, external_id}; `held` is every
 * number a living person holds, as `${tenant_id} ${phone_e164}`.
 */
export function planNumbers(contacts, identities, held) {
  const byContact = new Map();
  for (const i of identities) {
    if (!NUMBER_WIRES.includes(i.channel)) continue;
    byContact.set(i.contact_id, [...(byContact.get(i.contact_id) ?? []), String(i.external_id ?? "").trim()]);
  }
  const repairs = [];
  const left = [];
  for (const c of contacts) {
    const ten = MISREAD.exec(c.phone_e164 ?? "")?.[1];
    if (!ten) continue;
    const own = byContact.get(c.id) ?? [];
    if (!own.some((x) => x === ten || x === `+${ten}`)) continue;
    const right = `+${ten}`;
    if (held.has(`${c.tenant_id} ${right}`)) left.push({ ...c, right, why: "another person holds it: merge them" });
    else repairs.push({ ...c, right });
  }
  return { repairs, left };
}

/** The apply's write: the right number where the row still holds the one it was planned from. Counted. */
export async function writeNumbers(db, repairs) {
  const written = [];
  const skipped = [];
  for (const r of repairs) {
    const { data, error } = await db
      .from("contacts")
      .update({ phone_e164: r.right })
      .eq("id", r.id)
      .eq("tenant_id", r.tenant_id)
      .eq("phone_e164", r.phone_e164)
      .select("id");
    if (error) skipped.push({ id: r.id, why: `write: ${error.message}` });
    else if (!data?.length) skipped.push({ id: r.id, why: "write matched no row: the number changed since" });
    else written.push(r);
  }
  return { written, skipped };
}

/** Every row of a read, a page at a time by id. */
async function readAll(read) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read()
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
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

  const living = await readAll(() =>
    db.from("contacts").select("id, tenant_id, phone_e164").is("erased_at", null).not("phone_e164", "is", null),
  );
  const contacts = living.filter((c) => MISREAD.test(c.phone_e164));
  const ids = new Set(contacts.map((c) => c.id));
  const identities = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 200) {
    const page = list.slice(i, i + 200);
    const { data, error } = await db
      .from("contact_identities")
      .select("contact_id, channel, external_id")
      .in("contact_id", page)
      .in("channel", NUMBER_WIRES);
    if (error) throw new Error(`read identities: ${error.message}`);
    identities.push(...(data ?? []));
  }
  const held = new Set(living.map((c) => `${c.tenant_id} ${c.phone_e164}`));
  const { repairs, left } = planNumbers(contacts, identities, held);

  for (const r of repairs) console.log(`  ${r.tenant_id}  ${r.id}  ${r.phone_e164} -> ${r.right}`);
  for (const l of left) console.log(`  left ${l.tenant_id}  ${l.id}  ${l.phone_e164} (${l.right}: ${l.why})`);
  console.log(`\n${repairs.length} people to give back their number, ${left.length} left for a merge.`);
  if (!repairs.length) return;
  if (!apply) {
    console.log("Dry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `plus-ten-digit-numbers-${stamp}.jsonl`);
  writeFileSync(backupPath, repairs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`backup: ${repairs.length} rows -> ${backupPath}`);

  const { written, skipped } = await writeNumbers(db, repairs);
  for (const s of skipped) console.log(`  skipped ${s.id}  ${s.why}`);
  console.log(`\n${written.length} given back their number, ${skipped.length} skipped.`);
  if (skipped.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
