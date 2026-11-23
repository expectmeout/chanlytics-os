/**
 * Letting a workspace's videos step aside now, by hand (tooling/scripts/ops/files/let-go-now.mjs, the archive plan's
 * B2): the tool that lets a made video be seen stepping aside and coming back without two weeks of waiting. It asks
 * the let-go's own door with now as its two times, and nothing else: which video may go is the door's rule. The
 * script's main (the environment, the backup's file, the lines it says) needs production and is not run here; these
 * are its parts, run for real over the copies' world in memory.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { A_RUN, askOf, letGoNow } from "../../../tooling/scripts/ops/files/let-go-now.mjs";
import { T, madeVideo, realFetch, setPg, shelfWorld, shelveNow, theWeb, videoBytes, videoRow } from "./_world.mjs";

let open = null;
function theWorld(options) {
  open = shelfWorld(options);
  return open;
}
afterEach(() => {
  open?.close();
  open = null;
  resetBreakers();
});
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const letGoAsks = (w) => w.asked.filter((ask) => ask.door === "file_copies_let_go");

test("a run names one workspace by its id, and writes only when told to", () => {
  const run = ["node", "let-go-now.mjs"];
  assert.equal(askOf(run), null, "no workspace named: nothing to do");
  assert.equal(askOf([...run, "--workspace"]), null);
  assert.equal(askOf([...run, "--workspace", "harbor-salon"]), null, "by its id, never its name");
  assert.deepEqual(askOf([...run, "--workspace", T]), { workspace: T, apply: false });
  assert.deepEqual(askOf([...run, "--apply", "--workspace", T.toUpperCase()]), { workspace: T, apply: true });
});

test("a workspace whose made videos keep no copy is left alone, and so is one that does not exist", async () => {
  const file = madeVideo();
  theWeb();
  const w = theWorld({ files: [file], shelfOn: false });
  assert.deepEqual(await letGoNow(w.db, { workspace: T, apply: true }), { fate: "switch_off", name: "Harbor Salon" });
  assert.equal(letGoAsks(w).length, 0, "the door is not asked");
  assert.equal(w.file(file.id).copy_state, "here");
  const nobody = "99999999-9999-4999-8999-999999999999";
  assert.deepEqual(await letGoNow(w.db, { workspace: nobody, apply: true }), { fate: "no_workspace" });
});

test("a dry run says what each video that is here may do, and marks nothing", async () => {
  const shelved = madeVideo();
  const unshelved = madeVideo();
  const upload = videoRow({ source: "upload" });
  const away = madeVideo({ copy_state: "away", media_ref: null });
  theWeb();
  const w = theWorld({ files: [shelved, unshelved, upload, away] });
  await shelveNow(w, shelved, videoBytes(1));

  const read = await letGoNow(w.db, { workspace: T, apply: false });
  assert.equal(read.fate, "dry");
  assert.deepEqual(
    Object.fromEntries(read.weighed.map((video) => [video.id, video.says])),
    {
      [shelved.id]: "may step aside",
      [unshelved.id]: "stays: no checked copy is kept",
      [upload.id]: "the door decides",
    },
    "one that stepped aside already is not weighed",
  );
  assert.equal(letGoAsks(w).length, 0, "the door is not asked");
  assert.ok([shelved, unshelved, upload].every((file) => w.file(file.id).copy_state === "here"));
});

test("an apply asks the door once, with now as its two times, and only what can come back is marked", async () => {
  const shelved = madeVideo();
  const unshelved = madeVideo();
  const upload = videoRow({ source: "upload" });
  theWeb();
  const w = theWorld({ files: [shelved, unshelved, upload] });
  await shelveNow(w, shelved, videoBytes(1));
  // Made a moment ago: by itself the door would hold it for its rest, and for two weeks unused.
  const now = new Date(Date.now() + 1000);

  const done = await letGoNow(w.db, { workspace: T, apply: true }, now);
  assert.equal(done.fate, "marked");
  assert.deepEqual(
    done.going.map((copy) => copy.id),
    [shelved.id],
  );
  const [ask, ...more] = letGoAsks(w);
  assert.equal(more.length, 0, "asked once");
  assert.deepEqual(
    { ...ask, door: undefined },
    {
      door: undefined,
      p_tenant_id: T,
      p_seconds: null,
      p_unused_before: now.toISOString(),
      p_rested_before: now.toISOString(),
      p_limit: A_RUN,
    },
  );
  assert.equal(w.file(shelved.id).copy_state, "going", "marked, and left for the pass to finish");
  assert.equal(w.file(unshelved.id).copy_state, "here", "a made video with no checked copy never steps aside");
  assert.equal(w.file(upload.id).copy_state, "here", "nor an upload");
  assert.ok(w.onShelf(shelved.id), "its kept copy is untouched");
  // Nothing left to weigh that may go: a second apply marks none.
  assert.deepEqual((await letGoNow(w.db, { workspace: T, apply: true }, now)).going, []);
});
