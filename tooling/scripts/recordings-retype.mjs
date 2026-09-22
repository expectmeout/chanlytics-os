/**
 * Retype the call recordings stored before the copy read their type from the
 * audio (prod-script bar): dry-run DEFAULT, a JSONL backup of every planned
 * row's recording before any write, idempotent, --apply to execute.
 *
 * Retell's CDN serves a call's WAV as binary/octet-stream, and copyRecording
 * (apps/edge/lib/voice/call-recording.ts) used to take its word, so every recording
 * copied before sniffAudioType is in the private bucket as octet-stream and
 * served that way: a browser that goes by the type (Safari above all) has
 * nothing it knows how to play. Storage cannot change an object's type in
 * place, so each one is downloaded and uploaded again over itself, typed as
 * what its first bytes say it is, and its row's recording.mime is set to
 * match. The path is kept even where its extension no longer fits, because
 * the row's storage_path is what the recording route signs.
 *
 * A dry run reads twelve bytes of each object through a link signed for a
 * minute and prints what each would become; it writes nothing anywhere. A
 * second apply finds nothing to do: the plan is only rows not yet typed as
 * audio. A row that changed since the plan (purged, re-copied) is skipped.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node tooling/scripts/recordings-retype.mjs
 *   node tooling/scripts/recordings-retype.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * apps/edge/lib/voice/call-recording.ts's rule, copied because a tooling script
 * cannot import the edge's TypeScript. recordings-retype.test.mjs runs both
 * over the same bytes, so the two cannot drift apart unnoticed.
 */
export function sniffAudioType(bytes, given) {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return given && given.startsWith("audio/") ? given : "audio/wav";
}

/** Every stored recording with a path whose type is not audio: `{ id, tenant_id, storage_path, from }`. */
export function planRetype(rows) {
  const plan = [];
  for (const row of rows) {
    const rec = row.recording;
    if (!rec || rec.fetch_state !== "stored") continue;
    if (typeof rec.storage_path !== "string" || !rec.storage_path) continue;
    const mime = typeof rec.mime === "string" ? rec.mime : null;
    if (mime && mime.startsWith("audio/")) continue;
    plan.push({ id: row.id, tenant_id: row.tenant_id, storage_path: rec.storage_path, from: mime });
  }
  return plan;
}

/** The dry run's look: what each planned object would be typed as, read from its first twelve bytes. */
export async function peekTypes(db, plan) {
  const out = [];
  for (const item of plan) {
    const { data, error } = await db.storage.from("media").createSignedUrl(item.storage_path, 60);
    if (error || !data?.signedUrl) {
      out.push({ id: item.id, from: item.from, to: null, why: `sign: ${error?.message ?? "no link"}` });
      continue;
    }
    const r = await fetch(data.signedUrl, { headers: { Range: "bytes=0-11" } });
    if (!r.ok) {
      out.push({ id: item.id, from: item.from, to: null, why: `read: HTTP ${r.status}` });
      continue;
    }
    out.push({ id: item.id, from: item.from, to: sniffAudioType(await r.arrayBuffer(), item.from) });
  }
  return out;
}

/**
 * The apply. Each row is read again first, and one no longer stored at the
 * planned path is left: the purge may have taken its audio since, and a
 * re-upload would put it back. Then the object is downloaded, uploaded over
 * itself with its type, and the type is merged into the row's recording.
 */
export async function retype(db, plan) {
  const retyped = [];
  const skipped = [];
  for (const item of plan) {
    const { data: row, error: readErr } = await db
      .from("calls")
      .select("recording")
      .eq("id", item.id)
      .eq("tenant_id", item.tenant_id)
      .maybeSingle();
    if (readErr) {
      skipped.push({ id: item.id, why: `read: ${readErr.message}` });
      continue;
    }
    const rec = row?.recording;
    if (!rec || rec.fetch_state !== "stored" || rec.storage_path !== item.storage_path) {
      skipped.push({ id: item.id, why: "no longer stored at the planned path" });
      continue;
    }
    const got = await db.storage.from("media").download(item.storage_path);
    if (got.error || !got.data) {
      skipped.push({ id: item.id, why: `download: ${got.error?.message ?? "empty"}` });
      continue;
    }
    const bytes = await got.data.arrayBuffer();
    const to = sniffAudioType(bytes, item.from);
    const put = await db.storage.from("media").upload(item.storage_path, bytes, { contentType: to, upsert: true });
    if (put.error) {
      skipped.push({ id: item.id, why: `upload: ${put.error.message}` });
      continue;
    }
    // Guarded on the state it was read in, and counted: an update that matched
    // nothing is not a success.
    const { data: marked, error: writeErr } = await db
      .from("calls")
      .update({ recording: { ...rec, mime: to } })
      .eq("id", item.id)
      .eq("tenant_id", item.tenant_id)
      .filter("recording->>fetch_state", "eq", "stored")
      .select("id");
    if (writeErr) {
      skipped.push({ id: item.id, why: `write: ${writeErr.message}` });
      continue;
    }
    if (!marked?.length) {
      skipped.push({ id: item.id, why: "write matched no row" });
      continue;
    }
    retyped.push({ id: item.id, from: item.from, to });
  }
  return { retyped, skipped };
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

  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("calls")
      .select("id, tenant_id, recording")
      .filter("recording->>fetch_state", "eq", "stored")
      .order("started_at", { ascending: true })
      .range(from, from + 499);
    if (error) {
      console.error(`read calls: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const plan = planRetype(rows);
  console.log(`${rows.length} stored recordings; ${plan.length} not typed as audio.`);
  if (!plan.length) return;

  if (!apply) {
    for (const p of await peekTypes(db, plan)) {
      console.log(`  ${p.id}  ${p.from ?? "(none)"} -> ${p.to ?? `? (${p.why})`}`);
    }
    console.log("\nDry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `recordings-retype-${stamp}.jsonl`);
  const planned = new Set(plan.map((p) => p.id));
  writeFileSync(
    backupPath,
    rows
      .filter((r) => planned.has(r.id))
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n",
  );
  console.log(`backup: ${plan.length} rows -> ${backupPath}`);

  const { retyped, skipped } = await retype(db, plan);
  for (const r of retyped) console.log(`  retyped ${r.id}  ${r.from ?? "(none)"} -> ${r.to}`);
  for (const s of skipped) console.log(`  skipped ${s.id}  ${s.why}`);
  console.log(`\n${retyped.length} retyped, ${skipped.length} skipped.`);
  if (skipped.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
