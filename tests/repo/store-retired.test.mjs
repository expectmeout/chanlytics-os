/**
 * One memory, and no code for a second one.
 *
 * The receptionist's memory was a Vercel Blob object per thread. Postgres took
 * over behind `PG_READS`, the store stayed as a shadow behind `BLOB_SHADOW`,
 * and this file proved the flag held: reads answered "unknown", writes were
 * refused, deletes still reached Blob. The flag is gone and so is the store —
 * `apps/edge/lib/store.ts`, `@vercel/blob`, the backfill that imported the
 * threads, and the `blob_thread_erase` job that erased one.
 *
 * So this file is now the proof that none of it came back: nothing imports a
 * store, no flag decides where the memory is read from, and the queue declares
 * no kind it cannot run. The behaviour that flag protected — a Postgres miss
 * hands the thread to a person rather than answering from an invented empty
 * history — is run for real in whatsapp/door/ and thread-memory.test.mjs.
 *
 * And the job queue says only what it can carry: every declared kind has a
 * handler and a caller.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JOB_KINDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");

/** Every .ts under the given roots (no dist, no node_modules), joined. */
function sourceTree(roots) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".next") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts")) out.push(fs.readFileSync(full, "utf8"));
    }
  };
  for (const r of roots) walk(path.join(ROOT, r));
  return out.join("\n");
}

/** Every tracked file under the given roots, by repo-relative path. */
function sourceFiles(roots) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".next" || e.name === ".vercel") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js|json)$/.test(e.name)) out.push(path.relative(ROOT, full));
    }
  };
  for (const r of roots) walk(path.join(ROOT, r));
  return out;
}

/** Comments stripped where that is meaningful, so an explanation cannot trip a
 *  rule about what must not appear -- and a JSON manifest read whole. */
const read = (f) => (f.endsWith(".json") ? readRaw(f) : readCode(f));

/** What the store, its flags and its job kind would look like if any came back. */
const GONE =
  /@vercel\/blob|lib\/store\.js|\.\.\/store\.js|blob_thread_erase|PG_READS|PG_WRITES|PG_DEDUPE|BLOB_SHADOW|BLOB_READ_WRITE_TOKEN/;

test("the store is gone: no module, no dependency, no importer, no flag", () => {
  for (const gone of [
    "apps/edge/lib/store.ts",
    "apps/edge/api/admin/backfill.ts",
    "tooling/scripts/run-backfill.mjs",
    "packages/core/src/messages/erase-thread.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, gone)), false, `${gone} must not come back`);
  }
  // The SDK, the importers, the job kind and the four levers, in one sweep:
  // a variable nothing reads is still a lie in the manifest and a value
  // somebody will go looking for, so they go with the code that read them.
  const offenders = sourceFiles(["apps/edge", "apps/dashboard/app", "apps/dashboard/src/server", "packages"]).filter(
    (f) => GONE.test(read(f)),
  );
  assert.deepEqual(offenders, [], "the posture is the code now, not an env flip");
});

test("the manifest documents no lever either", () => {
  // An operator provisioning an environment from this file must not be sent
  // looking for a value that decides nothing.
  const manifest = readRaw("apps/edge/.env.example");
  for (const v of ["PG_READS", "PG_WRITES", "PG_DEDUPE", "BLOB_SHADOW", "BLOB_READ_WRITE_TOKEN"]) {
    assert.ok(!manifest.includes(`${v}=`), `${v} is not documented as if it did something`);
  }
  // That /api/diag names one memory is run in diag-door.test.mjs.
});

test("the queue's kinds: each one handled and each one scheduled somewhere", async () => {
  assert.deepEqual(
    [...JOB_KINDS],
    [
      "outbound_send",
      "broadcast_send",
      "line_provision",
      "email_ingest",
      "lead_round_start",
      "lead_collect",
      "lead_check",
      "push_send",
      "push_receipts",
      "reply_read",
      "booking_read",
      "event_deliver",
      "inbound_answer",
      "history_import",
      "website_read",
      "preview_build",
      "erasure_finish",
      "reply_draft",
      "file_look",
      "file_fetch",
      "instagram_read",
      "file_purge",
      "video_digest",
      "source_take",
      "copy_return",
      "file_shelve",
      "post_prepare",
      "post_publish",
      "post_reconcile",
      "post_google",
      "post_take_down",
      "content_plan",
      "content_week_go",
      "content_week_make",
      "post_observe",
      "comment_reply",
      "piece_make",
      "campaign_moments",
      "reach_out_steps",
      "calendar_read",
      "google_read",
      "texts_read",
      "sequence_occasions",
      "source_walk",
      "source_read",
      "ad_read",
      "posts_read",
      "booking_lapse",
      "canary",
    ],
  );
  // Each declared kind has its handler at compile time: the dispatch map is a Record<JobKind, Handler>
  // (packages/jobs/src/handlers/handlers.ts), so a kind without one, or one of a kind nobody declares, does not build.
  // Until 26 Nov 2026 this read the map as text. What the build does with a kind it retired, run: it is no kind, and the
  // tick keeps its row for a runner that knows it, running nothing.
  const { dispatchJob } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);
  const untouched = new Proxy(
    {},
    {
      get: (_, k) => {
        throw new Error(`a retired kind's job reached its context (${String(k)})`);
      },
    },
  );
  for (const dead of [
    "veto_fire",
    "media_fetch",
    "rollup_daily",
    "report_weekly",
    "snooze_wake",
    "pause_expire",
    "blob_thread_erase",
  ]) {
    assert.ok(!JOB_KINDS.includes(dead), `${dead} is not declared`);
    const job = { id: `job-${dead}`, tenant_id: null, kind: dead, payload: {} };
    assert.equal(await dispatchJob(untouched, job), "unknown_kind", `${dead} is not handled`);
  }
  // Something schedules each kind: a `schedule(...)` / `scheduleJob(...)` /
  // `ctx.schedule(...)` call, their once-per-subject forms (`scheduleOnce`,
  // `scheduleJobOnce`: a reply's reading), or the draft queue's row, naming it -- or a
  // door in SQL that inserts the job itself (the lead finder's, 00140), or a clock that hands it out
  // (decision 0115: `jobKind` names it to its door, and a SQL door names it to jobs_hand_out).
  const src = sourceTree(["apps/edge", "apps/dashboard/app", "apps/dashboard/src", "packages/jobs/src"]);
  const migrations = path.join(ROOT, "supabase/migrations");
  const sql = fs
    .readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(migrations, f), "utf8"))
    .join("\n");
  for (const k of JOB_KINDS) {
    const named = new RegExp(`(schedule(?:Job)?(?:Once)?\\([^;]*"${k}"|(?:k|jobK)ind: "${k}")`, "s");
    const inserted = new RegExp(`(insert into (?:public\\.)?jobs\\b[^;]*|jobs_hand_out\\(\\s*)'${k}'`, "s");
    assert.ok(named.test(src) || inserted.test(sql), `${k} is scheduled by something`);
  }
  // That the database's job_kinds rows agree is held by jobs/job-kinds.test.mjs (decision 0089).
});

// That the retired kind was withdrawn from the database rows first, before the CHECK that would refuse them, was 00151's
// text, held here until 26 Nov 2026. It is an applied migration, and the ledger holds every applied file to the text it
// was recorded with (database/migrations.test.mjs, "every migration is in the ledger"), so the order it was applied in
// cannot change; that the CURRENT CHECK is the declared set is held at compile time (contracts schema-sets.ts) and by
// CI's replay.
