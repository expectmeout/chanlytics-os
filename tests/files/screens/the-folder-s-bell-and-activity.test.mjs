/**
 * What a watched folder tells away from its own screens (the footage sources plan's P5, part 2; the screens canvas's
 * Bell and Removed boards): the bell's two kinds, a line on the bell and nothing more, each saying how its row ends; and
 * Activity's line for a file Chanlytics removed a week after it was deleted in Drive. What the database writes is held
 * by a-watched-folder-rings-the-bell.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { NOTICE_ENDS } = await import(at("packages/contracts/src/waits/notice-closes.ts"));
const { EMAILED_NOTIFICATION_KINDS, BELL_LINE_KINDS } = await import(
  at("packages/contracts/src/today/notification-kinds.ts")
);
const { activityWords } = await import(at("packages/contracts/src/workspace/activity/words.ts"));

test("a folder that needs someone closes when mended; the day's new files are news, counted up in place", () => {
  // Told once; the database closes it when mended (00656), so no mend the edge keeps is waited for.
  assert.equal(NOTICE_ENDS.footage.ends, "news");
  assert.equal(NOTICE_ENDS.footage_in.ends, "news");
  for (const kind of ["footage", "footage_in"]) {
    assert.ok(!EMAILED_NOTIFICATION_KINDS.includes(kind), `${kind}: no mail`);
    assert.ok(BELL_LINE_KINDS.includes(kind), `${kind}: a line on the bell, nothing to choose`);
  }
});

test("Activity names Chanlytics, and why, for a file removed a week after it left Drive; a person's removal is theirs", () => {
  assert.equal(
    activityWords("file.removed", { file_id: "f", why: "source_gone" }),
    "Chanlytics removed a file · deleted in Google Drive a week ago, and never used",
  );
  assert.equal(activityWords("file.removed", { file_id: "f" }), "A photo was deleted");
});

test("what a folder brought, removed with it at once, is one line with its count", () => {
  assert.equal(
    activityWords("file.removed", { by: "u", bulk: true, count: 42, why: "from_folder" }),
    "42 photos and videos from the watched folder were removed",
  );
});
