/**
 * What a video's copy is asked for (apps/edge/lib/files/copy/ensure.ts; the archive PRD 1.1, FR-6.2). A post set for
 * later and an ad want the copy as Play does. AI's early fetch wants it too, and never says the copy was used, so a
 * clip nobody chose is not kept ahead of one somebody played. A look still brings nothing back.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { T, ensureCopy, realFetch, setPg, watchedClip, world } from "./_world.mjs";

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

/** One clip and its world: its copy here and never used, or let go with its folder still holding the original. */
function clip(file) {
  const made = watchedClip({ copy_used_at: null, ...file });
  const w = world({ files: [made.row], items: [made.origin] });
  return { w, id: made.row.id, row: () => w.file(made.row.id) };
}

for (const purpose of ["play", "publish", "ad"])
  test(`a copy that is here, asked for ${purpose}, is used and says so`, async () => {
    const { w, id, row } = clip({ copy_state: "here" });
    const held = await ensureCopy(w.db, T, id, purpose);
    assert.equal(held.copy, "here");
    assert.equal(held.mediaRef, row().media_ref);
    assert.notEqual(row().copy_used_at, null, "when it was used is written");
  });

test("AI's early fetch finds a copy that is here and does not say it was used", async () => {
  const { w, id, row } = clip({ copy_state: "here" });
  const held = await ensureCopy(w.db, T, id, "prefetch");
  assert.equal(held.copy, "here");
  assert.equal(row().copy_used_at, null, "a clip nobody chose is not kept ahead of one somebody played");
});

test("a post set for later, an ad and AI's early fetch each bring back a copy that was let go, once between them", async () => {
  const { w, id } = clip({ copy_state: "away" });
  const answers = [];
  for (const purpose of ["publish", "ad", "prefetch"]) answers.push((await ensureCopy(w.db, T, id, purpose)).copy);
  assert.deepEqual(answers, ["returning", "returning", "returning"]);
  assert.equal(w.returns().length, 1, "one return on the ledger for all three");
  assert.deepEqual(w.returns()[0].payload, { file_id: id });
});

test("a look at a copy that was let go still brings nothing back", async () => {
  const { w, id } = clip({ copy_state: "away" });
  for (const purpose of ["look", "digest", "upkeep"])
    assert.equal((await ensureCopy(w.db, T, id, purpose)).copy, "away");
  assert.equal(w.returns().length, 0);
});
