/**
 * A made video is drawn on a machine started from a saved image, and the image holds the template as it was when the image was
 * built. So a change to anything the image is made of is a new edition with a new image, built before the change is merged
 * (tooling/video/README.md): this fails the change that forgets, in the words that say what to do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { PIECE_SHAPES } = await import(at("packages/contracts/src/content/pieces.ts"));
const { PIECE_TEMPLATE, pieceCompositionOf } = await import(at("packages/contracts/src/content/piece-making.ts"));
const { templateFiles, templateHash } = await import(at("tooling/video/template-hash.mjs"));

test("the template is the one its edition's image was built from", () => {
  assert.equal(
    PIECE_TEMPLATE.hash,
    templateHash(),
    "the video template changed: raise PIECE_TEMPLATE.edition, write this hash beside it, and build the edition's image before merging (tooling/video/README.md)",
  );
  assert.ok(Number.isInteger(PIECE_TEMPLATE.edition) && PIECE_TEMPLATE.edition >= 1);
});

test("the hash reads the template, what its machine runs, its pinned versions, the drawing numbers and the face", () => {
  const files = templateFiles();
  for (const needed of [
    "tooling/video/src/blocks.tsx",
    "tooling/video/src/hook-cut.tsx",
    "tooling/video/machine/make.mjs",
    "tooling/video/package-lock.json",
    "packages/contracts/src/content/piece-frame.ts",
    "packages/contracts/src/content/piece-face.generated.ts",
    "apps/dashboard/src/server/posts/fonts/mona-sans-800.woff",
  ])
    assert.ok(files.includes(needed), needed);
  for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  // Nothing built or installed rides into it: the hash is the same on a fresh checkout.
  assert.ok(!files.some((f) => /node_modules|\/build\/|\/public\//.test(f)));
});

test("a plan is drawn by `blocks`, however it was kept; a shape's own composition is its name as the renderer takes one", async () => {
  const { piecePlanOf } = await import(at("packages/contracts/src/content/pieces.ts"));
  // What a row kept as "Hook first" is read as is drawn by the one composition every plan is.
  assert.equal(pieceCompositionOf(piecePlanOf({ shape: "hook_cut", cuts: [] }).shape), "blocks");
  // The template keeps a composition by the kept shape's own name, for an edge a deploy behind: no underscore in it.
  assert.equal(pieceCompositionOf("hook_cut"), "hook-cut");
  for (const shape of PIECE_SHAPES) assert.match(pieceCompositionOf(shape), /^[a-z0-9-]+$/);
  // Both are in the template this tree draws with.
  const index = fs.readFileSync(path.join(ROOT, "tooling/video/src/index.tsx"), "utf8");
  for (const id of ["blocks", "hook-cut"]) assert.ok(index.includes(`id="${id}"`), id);
});

test("an image goes on record only for the template this tree draws with, and one already there is left as it is", async () => {
  const { planImage } = await import(at("tooling/scripts/ops/files/piece-image.mjs"));
  const template = { edition: 3, hash: "aaaaaaaaaaaa" };
  const given = { snapshotId: "snap_Abc123Def456", hash: "aaaaaaaaaaaa" };
  // Nothing on record: the row to write.
  assert.deepEqual(planImage(template, "aaaaaaaaaaaa", given, null), {
    ok: true,
    write: { edition: 3, snapshotId: "snap_Abc123Def456", hash: "aaaaaaaaaaaa" },
    replaces: null,
  });
  // Another image on record for the edition: replaced, and said, so its backup can be written first.
  const older = { snapshot_id: "snap_Older0000000", hash: "aaaaaaaaaaaa" };
  assert.deepEqual(planImage(template, "aaaaaaaaaaaa", given, older).replaces, older);
  // The same image on record: nothing to write.
  const same = planImage(template, "aaaaaaaaaaaa", given, { snapshot_id: given.snapshotId, hash: given.hash });
  assert.deepEqual([same.ok, same.write], [true, null]);
  // An image built from another template would draw something else than the storyboard showed: refused, with what to do.
  const other = planImage(template, "aaaaaaaaaaaa", { ...given, hash: "bbbbbbbbbbbb" }, null);
  assert.equal(other.ok, false);
  assert.match(other.why, /build the image from this tree/);
  // A tree whose template changed without its edition's hash written is refused before anything is asked.
  const stale = planImage(template, "cccccccccccc", given, null);
  assert.equal(stale.ok, false);
  assert.match(stale.why, /PIECE_TEMPLATE/);
  // What is given must be an image's id.
  assert.equal(planImage(template, "aaaaaaaaaaaa", { ...given, snapshotId: "" }, null).ok, false);
  assert.equal(planImage(template, "aaaaaaaaaaaa", { ...given, snapshotId: "sbx_machine" }, null).ok, false);
});
