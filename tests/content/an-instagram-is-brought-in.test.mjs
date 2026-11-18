/**
 * A link brought in (apps/edge/lib/imports/bring-in.ts) and an Instagram account read (lib/imports/instagram-read.ts; 00626,
 * 00643), over a database in memory and a scraping platform that answers from memory: the door asks for a website's read or
 * an account's, each on the ledger first; an account is read once in a day, a workspace asks for three reads in a day and
 * the platform for so many, and a paste inside the day spends nothing and says when it was read and what came; the
 * account's run started at its pinned build, asked after, and once done its own posts handed to file_fetch newest first, a
 * carousel a slide each and a reel as a video with its length; another account's post passed over; a run that failed said
 * on the ledger.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.APIFY_TOKEN = "apify-token-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { bringInLink } = await import(at("apps/edge/lib/imports/bring-in.ts"));
const { instagramReader } = await import(at("apps/edge/lib/imports/instagram-read.ts"));
const { FOUND_READ_BUDGETS } = await import(at("apps/edge/lib/files/takes/budgets.ts"));
const readInstagram = (db, job) => instagramReader(db).read(job, Date.now() + 30_000);

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const APIFY = "https://api.apify.com/v2";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A Wednesday afternoon in New York, mid-morning in Los Angeles: well inside one of Google's days. */
const NOW = Date.parse("2026-11-18T18:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
/** The day as Google counts it (Pacific time), which the platform's budget row is kept by. */
const pacificDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(ms));
const ok = (data) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });

/**
 * The database a read meets, its clock the test's (`w.nowMs`): the ledger's door as a read writes it (00477
 * import_ledger_note) and the read's pace and budget (00643 found_read_spend), each as its SQL has it.
 */
function world() {
  const tables = {
    tenants: [{ id: T, name: "Harbor Salon", status: "active" }],
    jobs: [],
    imports: [],
    source_days: [],
  };
  const notes = [];
  const spends = [];
  const w = { tables, notes, spends, nowMs: NOW };
  const lineOf = () => tables.imports.find((i) => i.source === "instagram") ?? null;
  w.line = lineOf;
  w.day = () => tables.source_days.find((d) => d.day === pacificDay(w.nowMs)) ?? null;
  w.db = fakeDb(
    tables,
    {},
    {
      import_ledger_note: (a) => {
        notes.push(a);
        const now = iso(w.nowMs);
        let line = tables.imports.find((i) => i.source === a.p_source);
        if (!line) {
          line = { tenant_id: T, source: a.p_source, connection_id: null, state: null, counts: {}, via: null };
          Object.assign(line, { job_cursor: null, started_at: null, finished_at: null, last_error: null });
          tables.imports.push(line);
        }
        const was = line.state;
        const going = ["queued", "running"].includes(a.p_state);
        const ended = ["done", "failed"].includes(a.p_state);
        // A run that starts again starts its clock again; one still running keeps the clock it started.
        if (["done", "failed"].includes(was) && going) line.started_at = now;
        else line.started_at = line.started_at ?? (a.p_state === "queued" ? null : now);
        line.state = a.p_state;
        const given = a.p_counts ?? {};
        line.counts = a.p_add
          ? Object.fromEntries(
              [...new Set([...Object.keys(line.counts), ...Object.keys(given)])].map((k) => [
                k,
                (line.counts[k] ?? 0) + (given[k] ?? 0),
              ]),
            )
          : given;
        if (a.p_via) line.via = a.p_via;
        line.finished_at = ended ? now : null;
        line.last_error = a.p_state === "failed" ? (a.p_error ?? null) : null;
        return null;
      },
      found_read_spend: (a) => {
        spends.push(a);
        const line = lineOf();
        const reads = (line?.job_cursor?.reads ?? []).filter((r) => Date.parse(r.at) > w.nowMs - DAY);
        const own = reads.filter((r) => r.account === a.p_account).map((r) => Date.parse(r.at));
        const stopped = line?.via === a.p_account && line?.state === "failed";
        if (own.length > 0 && !stopped)
          return {
            fate: "read_lately",
            read_at: iso(Math.max(...own)),
            state: line.via === a.p_account ? line.state : null,
            counts: line.via === a.p_account ? line.counts : {},
          };
        if (reads.length >= a.p_workspace_max)
          return {
            fate: "wait",
            binds: "workspace_reads",
            until: iso(Math.min(...reads.map((r) => Date.parse(r.at))) + DAY),
          };
        let day = w.day();
        if (!day) {
          day = { day: pacificDay(w.nowMs), bytes: 0, takes: 0, units: 0, reads: 0 };
          tables.source_days.push(day);
        }
        if (day.reads + 1 > a.p_platform_max)
          return { fate: "wait", binds: "platform_reads", until: iso(w.nowMs + DAY) };
        day.reads += 1;
        const left = (line?.counts.left_videos ?? 0) + (line?.counts.left_files ?? 0);
        const since = line?.via === a.p_account && line?.state === "done" && left === 0 ? line.started_at : null;
        const next = [...reads, { account: a.p_account, at: iso(w.nowMs) }];
        if (line) line.job_cursor = { ...(line.job_cursor ?? {}), reads: next };
        else
          tables.imports.push({
            tenant_id: T,
            source: "instagram",
            connection_id: null,
            state: "queued",
            counts: {},
            via: a.p_account,
            job_cursor: { reads: next },
            started_at: null,
            finished_at: null,
            last_error: null,
          });
        return { fate: "go", since };
      },
    },
  );
  setPg(w.db);
  return w;
}

/** The owner's press on the card, as the dashboard sends it to the door. */
const paste = async (link) => {
  const res = await bringInLink({ ok: true, via: "token", workspace: T, user: U }, { tenant_id: T, link });
  return { status: res.status, body: await res.json() };
};
const readJobs = (w) => w.tables.jobs.filter((j) => j.kind === "instagram_read");
/** The read's file_fetch batches have landed: the ledger's line says done, with what came. */
const landed = (w, counts) =>
  w.db.rpc("import_ledger_note", {
    p_tenant_id: T,
    p_source: "instagram",
    p_state: "done",
    p_counts: counts,
    p_add: true,
  });

const POSTS = [
  {
    type: "Image",
    shortCode: "A1",
    ownerUsername: "harborsalon",
    displayUrl: "https://cdn.example/a1.jpg",
    timestamp: "2026-11-10T12:00:00.000Z",
  },
  {
    type: "Video",
    shortCode: "B2",
    ownerUsername: "harborsalon",
    displayUrl: "https://cdn.example/b2.jpg",
    videoUrl: "https://cdn.example/b2.mp4",
    videoDuration: 42.5,
    timestamp: "2026-11-16T12:00:00.000Z",
  },
  {
    type: "Sidecar",
    shortCode: "C3",
    ownerUsername: "HarborSalon",
    timestamp: "2026-11-12T12:00:00.000Z",
    childPosts: [
      { type: "Image", displayUrl: "https://cdn.example/c3-0.jpg" },
      { type: "Video", displayUrl: "https://cdn.example/c3-1.jpg", videoUrl: "https://cdn.example/c3-1.mp4" },
    ],
  },
  {
    type: "Image",
    shortCode: "D4",
    ownerUsername: "someone_else",
    displayUrl: "https://cdn.example/d4.jpg",
    timestamp: "2026-11-17T12:00:00.000Z",
  },
];

test("the door asks for an Instagram's read, its pace and budget first, the ledger next, under its handle", async () => {
  const w = world();
  const pasted = await paste("instagram.com/HarborSalon");
  assert.equal(pasted.status, 200);
  assert.deepEqual(pasted.body, { ok: true, fate: "instagram" });
  assert.deepEqual(
    [w.spends[0].p_source, w.spends[0].p_account, w.spends[0].p_workspace_max, w.spends[0].p_platform_max],
    ["instagram", "harborsalon", FOUND_READ_BUDGETS.workspaceReadsADay, FOUND_READ_BUDGETS.platformReadsADay],
    "every number of the budget is the edge's one setting",
  );
  assert.deepEqual([w.notes[0].p_source, w.notes[0].p_state, w.notes[0].p_via], ["instagram", "queued", "harborsalon"]);
  const [job] = readJobs(w);
  assert.deepEqual(job.payload, { handle: "harborsalon", step: "start", try: "0" }, "a first read asks for it whole");
  assert.equal(w.day().reads, 1, "the platform's day counts the read");
});

test("the door asks for a website's read with its photos, and refuses a player's link in words", async () => {
  const w = world();
  assert.equal((await paste("harbor.example")).body.fate, "website");
  assert.equal(w.notes[0].p_source, "website_media");
  assert.equal(w.tables.jobs.find((j) => j.kind === "website_read").payload.url, "https://harbor.example/");
  assert.equal(w.spends.length, 0, "a website's read is not an account's: it spends none of the day's reads");
  const refused = await paste("https://youtu.be/x");
  assert.equal(refused.status, 400);
  assert.match(refused.body.detail, /YouTube or Vimeo/);
});

test("ACCEPTANCE 32: the same account pasted twice in a day is read once, and the second paste says when it was read", async () => {
  const w = world();
  await paste("instagram.com/harborsalon");
  w.nowMs += 20 * 60_000;
  const again = await paste("@HarborSalon");
  assert.equal(again.status, 200, "no refusal: the card says it in words");
  assert.deepEqual(again.body, {
    ok: true,
    fate: "read_lately",
    read_at: iso(NOW),
    reading: true,
    photos: 0,
    videos: 0,
  });
  assert.equal(readJobs(w).length, 1, "no second read is started");
  assert.equal(w.day().reads, 1, "and nothing is spent");
  assert.equal(w.notes.length, 1, "the ledger's line is left as the first paste wrote it");

  // The read lands: a paste three hours on says what came, and still reads nothing.
  await landed(w, { photos: 12, videos: 4 });
  w.nowMs = NOW + 3 * HOUR;
  assert.deepEqual((await paste("instagram.com/harborsalon")).body, {
    ok: true,
    fate: "read_lately",
    read_at: iso(NOW),
    reading: false,
    photos: 12,
    videos: 4,
  });
  assert.equal(readJobs(w).length, 1);
});

test("a day on the account is read again, and only for what is newer than its last read", async () => {
  const w = world();
  await paste("instagram.com/harborsalon");
  await readInstagramStart(w, readJobs(w)[0]);
  const began = w.line().started_at;
  await landed(w, { photos: 12, videos: 4 });
  // A day on, the first read's jobs are long done: the ledger holds a read to one only while one waits.
  w.tables.jobs.length = 0;
  w.nowMs = NOW + 25 * HOUR;
  assert.equal((await paste("instagram.com/harborsalon")).body.fate, "instagram");
  const [again] = readJobs(w);
  assert.equal(again.payload.since, began, "what is newer than when the last whole read began");
  assert.deepEqual(w.line().counts, {}, "the line starts again for the new read");
});

test("an account whose last read left something behind is read whole again, so what was left can come", async () => {
  const w = world();
  await paste("instagram.com/harborsalon");
  await landed(w, { photos: 12, videos: 4, left_videos: 14 });
  w.nowMs = NOW + 25 * HOUR;
  assert.equal((await paste("instagram.com/harborsalon")).body.fate, "instagram");
  assert.equal("since" in readJobs(w).at(-1).payload, false);
});

test("a workspace asks for three reads in a day; the fourth starts nothing and says until when", async () => {
  const w = world();
  for (const [i, account] of ["harborsalon", "harbor.color", "harbor_nails"].entries()) {
    w.nowMs = NOW + i * HOUR;
    assert.equal((await paste(`instagram.com/${account}`)).body.fate, "instagram");
  }
  w.nowMs = NOW + 4 * HOUR;
  assert.deepEqual((await paste("instagram.com/harbor.brows")).body, {
    ok: true,
    fate: "wait",
    binds: "workspace_reads",
    until: iso(NOW + DAY),
  });
  assert.equal(readJobs(w).length, 3);
  assert.equal(w.day().reads, 3);
  // The first read is a day old: there is room for one again.
  w.nowMs = NOW + DAY + 60_000;
  assert.equal((await paste("instagram.com/harbor.brows")).body.fate, "instagram");
});

test("the platform's reads of the day are used: nothing starts, and the answer says so", async () => {
  const w = world();
  w.tables.source_days.push({
    day: pacificDay(NOW),
    bytes: 0,
    takes: 0,
    units: 0,
    reads: FOUND_READ_BUDGETS.platformReadsADay,
  });
  const pasted = await paste("instagram.com/harborsalon");
  assert.deepEqual([pasted.status, pasted.body.fate, pasted.body.binds], [200, "wait", "platform_reads"]);
  assert.equal(readJobs(w).length, 0);
  assert.equal(w.line(), null, "and the page's card is not told a read is on its way");
});

test("an account whose read stopped may be asked again inside the day, as one of the workspace's reads", async () => {
  const w = world();
  await paste("instagram.com/harborsalon");
  await w.db.rpc("import_ledger_note", {
    p_tenant_id: T,
    p_source: "instagram",
    p_state: "failed",
    p_via: "harborsalon",
    p_error: "Instagram didn't answer. Paste the link again in a while.",
  });
  w.nowMs = NOW + 10 * 60_000;
  assert.equal((await paste("instagram.com/harborsalon")).body.fate, "instagram");
  assert.equal(w.day().reads, 2);
  assert.equal(w.line().job_cursor.reads.length, 2, "the try that stopped is still one of the day's three");
});

/** The scraping platform, answering from memory; every call is kept, with the input a run was started with. */
function platform({ status = () => "SUCCEEDED", posts = POSTS } = {}) {
  const calls = [];
  answer = async (url, init = {}) => {
    calls.push({ method: init.method ?? "GET", url, input: init.body ? JSON.parse(String(init.body)) : null });
    if (url.startsWith(`${APIFY}/actors/apify~instagram-scraper/runs`))
      return ok({ id: "run-1", status: "READY", defaultDatasetId: "ds-1" });
    if (url.startsWith(`${APIFY}/actor-runs/run-1`))
      return ok({ id: "run-1", status: status(), defaultDatasetId: "ds-1" });
    if (url.startsWith(`${APIFY}/datasets/ds-1/items`))
      return new Response(JSON.stringify(posts), {
        status: 200,
        headers: { "content-type": "application/json", "x-apify-pagination-total": String(posts.length) },
      });
    throw new Error(`nothing answers ${url}`);
  };
  return calls;
}
const job = (payload) => ({ id: "j", tenant_id: T, kind: "instagram_read", attempts: 1, payload });
/** A read's first step run, over a platform that starts it. */
async function readInstagramStart(w, started) {
  platform();
  await readInstagram(w.db, job(started.payload));
}

test("a read starts its run at the pinned build, asks after it while it runs, and hands the account's posts on once done", async () => {
  const w = world();
  let status = "RUNNING";
  const calls = platform({ status: () => status });
  await readInstagram(w.db, job({ handle: "harborsalon", step: "start", try: "0" }));
  const started = calls.find((c) => c.method === "POST");
  assert.ok(started, "the run is started");
  assert.equal(new URL(started.url).searchParams.get("build"), "0.0.867", "at its pinned build, never the latest");
  assert.equal(started.input.resultsLimit, 50);
  assert.equal("onlyPostsNewerThan" in started.input, false, "a first read asks for the account whole");
  const next = w.tables.jobs.find((j) => j.kind === "instagram_read" && j.payload.step === "collect");
  assert.deepEqual([next.payload.run_id, next.payload.dataset_id, next.payload.try], ["run-1", "ds-1", "1"]);
  assert.equal(w.notes.at(-1).p_state, "running");

  await readInstagram(w.db, job(next.payload));
  assert.ok(
    w.tables.jobs.some((j) => j.kind === "instagram_read" && j.payload.try === "2"),
    "still running: asked after again",
  );

  status = "SUCCEEDED";
  await readInstagram(w.db, job({ ...next.payload, try: "2" }));
  const asked = new URL(calls.find((c) => c.url.includes("/datasets/ds-1/items")).url).searchParams.get("fields");
  assert.ok(asked.split(",").includes("videoDuration"), "a reel's length is asked for in the read already paid for");
  const fetch = w.tables.jobs.find((j) => j.kind === "file_fetch");
  assert.equal(fetch.payload.source, "instagram");
  // Newest first; a reel as a video with the length it says; a carousel a slide each (a slide that says no length is
  // judged when the video platform says it); and only the account's own: another's post is passed over.
  assert.deepEqual(fetch.payload.items, [
    { url: "https://cdn.example/b2.mp4", ref: "instagram:B2", kind: "video", seconds: 42.5 },
    { url: "https://cdn.example/c3-0.jpg", ref: "instagram:C3:0" },
    { url: "https://cdn.example/c3-1.mp4", ref: "instagram:C3:1", kind: "video" },
    { url: "https://cdn.example/a1.jpg", ref: "instagram:A1" },
  ]);
});

test("a read after the first asks the platform only for posts newer than the last", async () => {
  const w = world();
  const calls = platform();
  const since = "2026-11-17T18:00:00.000Z";
  await readInstagram(w.db, job({ handle: "harborsalon", step: "start", try: "0", since }));
  assert.equal(calls.find((c) => c.method === "POST").input.onlyPostsNewerThan, since);
});

test("a read hands on 150 files at most, newest first, a carousel's slides counted", async () => {
  const w = world();
  // Fifty posts of four slides each, written oldest first, as a pinned post can come before a newer one.
  const posts = Array.from({ length: 50 }, (_, i) => ({
    type: "Sidecar",
    shortCode: `S${i}`,
    ownerUsername: "harborsalon",
    timestamp: iso(Date.parse("2026-09-01T00:00:00Z") + i * DAY),
    childPosts: Array.from({ length: 4 }, (_slide, s) => ({
      type: "Image",
      displayUrl: `https://cdn.example/s${i}-${s}.jpg`,
    })),
  }));
  platform({ posts });
  await readInstagram(
    w.db,
    job({ handle: "harborsalon", step: "collect", try: "1", run_id: "run-1", dataset_id: "ds-1" }),
  );
  const { items } = w.tables.jobs.find((j) => j.kind === "file_fetch").payload;
  assert.equal(items.length, FOUND_READ_BUDGETS.filesARead);
  assert.equal(items[0].ref, "instagram:S49:0", "the newest post's first slide");
  assert.equal(items.at(-1).ref, "instagram:S12:1", "and the read stops inside the post its number falls in");
});

test("a run that failed is said on the ledger, and no key is said too", async () => {
  const w = world();
  answer = async (url) => {
    if (url.startsWith(`${APIFY}/actor-runs/run-9`))
      return ok({ id: "run-9", status: "FAILED", defaultDatasetId: "ds-9" });
    throw new Error(`nothing answers ${url}`);
  };
  await readInstagram(
    w.db,
    job({ handle: "harborsalon", step: "collect", try: "3", run_id: "run-9", dataset_id: "ds-9" }),
  );
  assert.deepEqual([w.notes.at(-1).p_state, w.notes.at(-1).p_source], ["failed", "instagram"]);
  const token = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;
  try {
    await readInstagram(w.db, job({ handle: "harborsalon", step: "start", try: "0" }));
  } finally {
    process.env.APIFY_TOKEN = token;
  }
  assert.match(w.notes.at(-1).p_error, /can't be read/);
});
