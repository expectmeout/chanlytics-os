/**
 * A job kind is declared once a side (decision 0089): its policy in packages/jobs (KIND_POLICY), its handler (HANDLERS),
 * its settler (SETTLERS) and its owner's words (contracts JOB_WORK), each a Record over JOB_KINDS, and its lane and
 * once-only rule in its job_kinds row (00526). These hold the two sides, and the database in memory, to one another,
 * so a kind cannot arrive half-declared, and a rule cannot be spelled two ways.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JOB_KINDS } from "../../packages/contracts/src/shared/enums.ts";
import { KIND_POLICY } from "../../packages/jobs/src/runner/kinds.ts";
import {
  CLAIM_FOR_MS,
  FUNCTION_CEILING_MS,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  PAGES_THE_PLATFORM,
  SPEAKS_TO_A_PERSON,
  TOLD_ELSEWHERE,
} from "../../packages/jobs/src/runner/ledger.ts";
import { SETTLERS } from "../../packages/jobs/src/runner/settle.ts";
import { dispatchJob } from "../../packages/jobs/src/handlers/handlers.ts";
import { FAKE_JOB_KINDS } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The job_kinds rows the migrations seed, as the newest seed of each kind writes them (lane, parts, kept). */
function seededKinds() {
  const dir = path.join(ROOT, "supabase/migrations");
  const rows = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const at = sql.indexOf("insert into public.job_kinds (kind, lane, once_parts, once_kept) values");
    if (at < 0) continue;
    const body = sql.slice(at, sql.indexOf("on conflict (kind)", at));
    for (const m of body.matchAll(
      /\('([a-z_]+)',\s*(\d),\s*(null|array\[[^\]]*\](?:::text\[\])?),\s*(true|false)\)/g,
    )) {
      const parts = m[3] === "null" ? null : [...m[3].matchAll(/'([^']*)'/g)].map((p) => p[1]);
      rows.set(m[1], [Number(m[2]), parts, m[4] === "true"]);
    }
  }
  return rows;
}

test("every kind contracts declares has its policy, its settler, and its job_kinds row, and none has more", () => {
  const seeded = seededKinds();
  assert.deepEqual(Object.keys(KIND_POLICY).sort(), [...JOB_KINDS].sort(), "KIND_POLICY is a Record over JOB_KINDS");
  assert.deepEqual(Object.keys(SETTLERS).sort(), [...JOB_KINDS].sort(), "SETTLERS is a Record over JOB_KINDS");
  assert.deepEqual([...seeded.keys()].sort(), [...JOB_KINDS].sort(), "a kind arrives with its job_kinds row");
});

test("the database in memory holds each kind as the migration seeds it: its lane, its once-only parts, its scope", () => {
  const seeded = seededKinds();
  for (const kind of JOB_KINDS)
    assert.deepEqual(
      FAKE_JOB_KINDS[kind],
      seeded.get(kind),
      `${kind}: _fake-db.mjs FAKE_JOB_KINDS against 00526's seed`,
    );
});

test("a kind settled by the ledger has a settler, and one that leaves nothing has none", () => {
  for (const kind of JOB_KINDS) {
    const settles = KIND_POLICY[kind].settles;
    assert.equal(SETTLERS[kind] !== null, settles === "ledger", `${kind}: settles ${settles}`);
  }
});

test("who hears of a failure is said once: a kind told the platform is paged with words of its own, and no owner's bell rings for a kind told elsewhere", () => {
  for (const kind of JOB_KINDS) {
    const told = KIND_POLICY[kind].told;
    assert.equal(PAGES_THE_PLATFORM.has(kind), told === "platform", `${kind}: told ${told}`);
    assert.equal(TOLD_ELSEWHERE.has(kind), told !== "owner", `${kind}: told ${told}`);
  }
});

test("a workspace's hourly job that failed for good pages once for its kind, however many workspaces fail, and says where to look", () => {
  const job = (kind, tenant_id) => ({ id: "11111111-1111-4111-8111-111111111111", tenant_id, kind, payload: {} });
  const keys = new Set();
  const handedOut = [
    "campaign_moments",
    "reach_out_steps",
    "calendar_read",
    "google_read",
    "texts_read",
    "sequence_occasions",
  ];
  for (const kind of handedOut) {
    const page = PAGES_THE_PLATFORM.get(kind);
    const first = page(job(kind, "workspace-a"), "the database did not answer", null);
    const second = page(job(kind, "workspace-b"), "the database did not answer", null);
    assert.equal(first.key, second.key, `${kind}: a thousand workspaces in one hour are one page`);
    assert.match(first.body, /workspace-a/, `${kind}: names the workspace that failed first`);
    assert.match(first.body, new RegExp(`where kind = '${kind}'`), `${kind}: and the query for the others`);
    assert.match(first.body, /late, not lost/, `${kind}: and that the work is still due`);
    keys.add(first.key);
  }
  assert.equal(keys.size, handedOut.length, "one kind's fault does not hide another's");
});

test("a kind that speaks is never tried again, and every wait a kind names is reached and outlasts the lease", () => {
  for (const kind of JOB_KINDS) {
    const p = KIND_POLICY[kind];
    assert.equal(SPEAKS_TO_A_PERSON.has(kind), p.speaks, kind);
    if (p.speaks) assert.equal(p.retryWaitsMs.length, 0, `${kind}: a second try could reach a real person twice`);
    assert.ok(p.retryWaitsMs.length <= MAX_ATTEMPTS - 1, `${kind}: a wait past the last try is never reached`);
    for (const w of p.retryWaitsMs) assert.ok(w > LEASE_SECONDS * 1000, `${kind}: a wait no longer than a lease`);
  }
});

test("no kind's longest call outlives the function: a job claimed at the end of the claim window still has room for it", () => {
  // Jobs are claimed only in the first CLAIM_FOR_MS (ledger.ts), so the last one claimed has the ceiling less that for
  // its work; a kind whose one call cannot fit there would be killed mid-call on every late claim and, three claims on,
  // given up (the lead judge's own case, tick-geometry.test.mjs, before LEAD_YIELD_AT_MS).
  for (const kind of JOB_KINDS) {
    const { longestCallMs } = KIND_POLICY[kind];
    assert.ok(
      CLAIM_FOR_MS + longestCallMs <= FUNCTION_CEILING_MS,
      `${kind}: a ${longestCallMs} ms call begun at ${CLAIM_FOR_MS} ms runs past the ${FUNCTION_CEILING_MS} ms ceiling`,
    );
  }
});

test("a payload names the ids its handler needs, and never what belongs on its row", () => {
  for (const kind of JOB_KINDS) {
    const { ids, never } = KIND_POLICY[kind];
    assert.equal(new Set(ids).size, ids.length, `${kind}: an id named twice`);
    assert.ok(!ids.some((id) => never.includes(id)), `${kind}: an id it must name and must never carry`);
  }
  assert.deepEqual(KIND_POLICY.outbound_send.never, ["body"], "a reply's words stay on its message");
});

test("a payload without the ids its kind runs on that reaches the claim fails certain, paged, never run (the write's refusal: a-schedule-once-writes-its-key)", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  // A row the ledger holds without them (a SQL writer's slip, or an older build's) is not handed to its handler: it ends
  // failed as never run, with no second try, and the platform hears, since a writer of ours wrote it.
  const pages = [];
  const ran = [];
  const ctx = {
    page: async (key, subject) => {
      pages.push([key, subject]);
    },
    // The handler's first act is a read of the database (erasure.ts findErasableContact): any reach for it is a run.
    db: new Proxy(
      {},
      {
        get: (_t, name) => {
          ran.push(String(name));
          throw new Error("the handler ran");
        },
      },
    ),
  };
  await assert.rejects(
    dispatchJob(ctx, { id: "j1", tenant_id: T, kind: "erasure_finish", payload: { request_id: "r1" }, attempts: 1 }),
    (e) => e.name === "CertainFailure" && e.message === "erasure_finish: the payload names no contact_id",
  );
  assert.deepEqual(pages, [["job_payload_refused:erasure_finish", "erasure_finish: a job could not run"]]);
  assert.deepEqual(ran, [], "its handler never ran");
});
