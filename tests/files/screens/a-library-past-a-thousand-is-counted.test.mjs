/**
 * A Library past a thousand rows (the footage screens' call 4): clips kept in Google Drive do not count toward the
 * Library's thousand, so a Library can hold more rows than one read answers. Its counts come grouped from the database
 * (00656 files_tallied), each group with how many it stands for, and the Library's tally and AI's files line weigh them:
 * the true count, past a thousand as under it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { filesTallyOf } = await import(at("packages/contracts/src/files/views.ts"));
const { filesLineOf } = await import(at("apps/dashboard/src/server/files/line.ts"));

const group = (over) => ({
  status: "filed",
  shows: null,
  source: "drive",
  kind: "video",
  look_status: "done",
  created_at: "2026-11-19T15:00:00.000Z",
  n: 1,
  ...over,
});
const library = [
  group({ n: 1180 }),
  group({ kind: "image", shows: "logo", source: "upload", n: 3, created_at: "2026-11-20T09:30:00.000Z" }),
  group({ status: "inbox", kind: "image", source: "website", look_status: "waiting", n: 7 }),
];

test("the tally counts every file a group stands for, past a thousand", () => {
  const tally = filesTallyOf(library);
  assert.equal(tally.total, 1190);
  assert.equal(tally.kept, 1183);
  assert.equal(tally.videos, 1180);
  assert.equal(tally.waiting, 7);
  assert.equal(tally.looking, 7);
  assert.equal(tally.shelves.inbox, 7);
});

test("AI's files line says the same true count, and the newest arrival of any group", () => {
  const line = filesLineOf(library, "UTC");
  assert.match(line, /^Files: 3 photos and 1180 videos/);
  assert.match(line, /7 in Inbox/);
  assert.match(line, /logo yes/);
  assert.match(line, /last added 20 Nov/);
});

test("rows read one by one still count one each", () => {
  const rows = [group({ n: undefined }), group({ n: undefined, kind: "image" })];
  assert.equal(filesTallyOf(rows).total, 2);
});
