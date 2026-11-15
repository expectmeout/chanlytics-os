/**
 * One picture is one file, whichever road brought it (decision 0134, amended 15 Nov 2026; 00630): a picture's print, read from
 * its pixels, is the same for two sizes of one scene and far apart for two scenes; a found photo carries its print to the door
 * that keeps it, and goes no further where the door says it is here already; a photo not printed as it came is printed as its
 * look starts, and one that went as a twin costs no model call. Which of two twins stays is the database's rule
 * (files/one-picture-is-one-file.db.test.mjs, against the replayed stack).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setPublicFetch } from "@chanlytics/channels/shared";
import { FILE_LOOK_EDITION } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { scenePng, squarePng } from "../look/_png.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const realFetch = globalThis.fetch;
const asked = [];
globalThis.fetch = async (url) => {
  asked.push(String(url));
  throw new Error(`nothing answers ${url}`);
};

const { PRINT_TWIN_BITS, picturePrintOf, printDistance } = await import(at("packages/core/src/look/picture-print.ts"));
const { readPicturePrint } = await import(at("apps/edge/lib/files/prints.ts"));
const { keepFoundFile } = await import(at("apps/edge/lib/files/found.ts"));
const { fileJobs } = await import(at("apps/edge/lib/files/upkeep.ts"));
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const F = "ffffffff-0000-4000-8000-000000000001";

/** A salon's window at dusk: a lit pane, a dark frame and an awning stripe. Any size draws the same scene. */
const shopfront = (x, y) => {
  if (y < 0.18) return Math.floor(x * 8) % 2 ? [40, 40, 40] : [200, 170, 90];
  if (x > 0.15 && x < 0.85 && y > 0.3 && y < 0.85) return [230 - Math.round(80 * y), 190, 120];
  return [30 + Math.round(60 * x), 30, 50];
};
/** A wash bar: rows of dark basins under a bright wall. */
const washBar = (x, y) => {
  if (y > 0.55 && Math.floor(x * 5) % 2 === 0) return [20, 20, 25];
  return [Math.round(240 - 120 * y), Math.round(235 - 100 * x), 220];
};

test("a print reads a picture's 9×9 grey: 32 hex characters, none for a plain picture or the wrong size", () => {
  const ramp = Array.from({ length: 81 }, (_, i) => ((i * 37) % 81) * 3);
  const print = picturePrintOf(ramp);
  assert.match(print, /^[0-9a-f]{32}$/);
  assert.equal(printDistance(print, print), 0);
  assert.equal(
    picturePrintOf(new Array(81).fill(128)),
    null,
    "a plain colour prints as nothing: it would twin every plain one",
  );
  assert.equal(picturePrintOf([1, 2, 3]), null);
});

test("two sizes of one scene print within the twin bits; two scenes print far apart", async () => {
  const big = await readPicturePrint(scenePng(1080, 1350, shopfront));
  const small = await readPicturePrint(scenePng(320, 400, shopfront));
  const other = await readPicturePrint(scenePng(1080, 1350, washBar));
  assert.ok(printDistance(big, small) <= PRINT_TWIN_BITS, `one scene: ${printDistance(big, small)} bits`);
  assert.ok(printDistance(big, other) > PRINT_TWIN_BITS, `two scenes: ${printDistance(big, other)} bits`);
  assert.equal(await readPicturePrint(squarePng(600)), null, "one flat colour is too plain to print");
  assert.equal(await readPicturePrint(new Uint8Array([1, 2, 3])), null, "bytes no picture reads from print as nothing");
});

/** The database and the bucket a found photo meets: the door answers as the test says. */
function foundWorld(answerFound) {
  const found = [];
  const db = fakeDb(
    { files: [], files_let_go: [], jobs: [], notifications: [], events: [] },
    {},
    {
      file_found: (a) => {
        found.push(a);
        return answerFound(a);
      },
    },
  );
  const bucket = { uploaded: [], removed: [] };
  db.storage = {
    from: () => ({
      upload: async (path) => (bucket.uploaded.push(path), { error: null }),
      remove: async (paths) => (bucket.removed.push(...paths), { error: null }),
    }),
  };
  return { db, found, bucket };
}

test("a found photo carries its print to the door, and one the door says is here already is never stored", async () => {
  const picture = scenePng(900, 1200, shopfront);
  const previous = setPublicFetch(async () => new Response(picture, { headers: { "content-type": "image/png" } }));
  try {
    const file = { url: "https://harbor.example/window.png", ref: "https://harbor.example/window.png" };
    const kept = foundWorld((a) => ({ fate: "kept", file_id: a.p_id }));
    assert.equal(await keepFoundFile(kept.db, T, { source: "website", status: "inbox", file }), "kept");
    assert.equal(kept.found[0].p_print, await readPicturePrint(picture));
    assert.equal(kept.bucket.uploaded.length, 1);

    // Instagram's copy of a picture already here: the door answers with the one that stays, and the bytes go.
    const twin = foundWorld(() => ({ fate: "here", file_id: F }));
    assert.equal(await keepFoundFile(twin.db, T, { source: "instagram", status: "inbox", file }), "here");
    assert.match(twin.found[0].p_print, /^[0-9a-f]{32}$/);
    assert.deepEqual(twin.bucket.removed, twin.bucket.uploaded);
  } finally {
    setPublicFetch(previous);
  }
});

/** A photo kept before 00630, or an upload: no print yet. */
const photoRow = (over = {}) => ({
  id: F,
  tenant_id: T,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "img-2041",
  owner_named: false,
  mime: "image/png",
  bytes: 1000,
  width: 900,
  height: 1200,
  fingerprint: "fp-1",
  claude_copy: null,
  look: null,
  look_status: "waiting",
  shows: null,
  owner_shelved: false,
  who_in_it: "not_asked",
  created_by: null,
  look_edition: null,
  looked_at: "2026-11-15T12:00:00Z",
  created_at: "2026-11-15T12:00:00Z",
  updated_at: "2026-11-15T12:00:00Z",
  removed_at: null,
  kind: "image",
  media_ref: null,
  media_status: null,
  seconds: null,
  sound: null,
  sound_said: null,
  picture_print: null,
  ...over,
});

/** The look's world: the photo's row, Storage's small copy of it, and what the print door answers. */
function lookWorld(row, printFate) {
  const printed = [];
  const downloaded = [];
  const db = fakeDb(
    { files: [row], jobs: [], ai_usage: [], tenants: [{ id: T, name: "Harbor Salon" }], tenant_config: [] },
    {},
    {
      file_printed: (a) => {
        printed.push(a);
        if (printFate === "gone") row.removed_at = "2026-11-15T12:00:01Z";
        return { fate: printFate, twin_id: printFate === "gone" ? "ffffffff-0000-4000-8000-000000000002" : null };
      },
    },
  );
  db.storage = {
    from: () => ({
      download: async (path, options) => {
        downloaded.push({ path, options });
        return { data: new Blob([scenePng(64, 64, shopfront)]), error: null };
      },
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.example/${path}` }, error: null }),
    }),
  };
  setPg(db);
  return { db, printed, downloaded };
}

const lookJob = () => ({
  id: "job-1",
  tenant_id: T,
  kind: "file_look",
  payload: { file_id: F, edition: String(FILE_LOOK_EDITION) },
  attempts: 1,
});

test("a photo not printed as it came is printed as its look starts, from a small copy; one that went costs no model call", async () => {
  asked.length = 0;
  const w = lookWorld(photoRow(), "gone");
  await fileJobs(w.db).look(lookJob(), Date.now() + 30_000);
  assert.equal(w.downloaded.length, 1);
  assert.deepEqual(w.downloaded[0].options, { transform: { width: 64, height: 64, resize: "contain" } });
  assert.equal(w.printed.length, 1);
  assert.match(w.printed[0].p_print, /^[0-9a-f]{32}$/);
  assert.deepEqual(asked, [], "no copy went up and no model was asked");
});

test("a photo printed already is not printed again", async () => {
  const w = lookWorld(photoRow({ picture_print: "9c9890669498a0c29c9890669498a0c2" }), "kept");
  // Nothing past the print is modelled here: the look stops after where a print would have been taken.
  await assert.rejects(fileJobs(w.db).look(lookJob(), Date.now() + 30_000));
  assert.equal(w.downloaded.length, 0);
  assert.equal(w.printed.length, 0);
});
