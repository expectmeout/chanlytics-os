/**
 * Asked how the folder is doing, AI says it with no card and no tool (the footage sources plan, P5; the canvas's Confirm
 * 12): where a watched folder stands rides every turn's facts as one line (apps/dashboard/src/server/files/line.ts
 * folderLineOf), in the words Settings says. Its time of day is left out, so the line changes only when the folder does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { folderLineOf } = await import(at("apps/dashboard/src/server/files/line.ts"));
const { factsBlock } = await import(at("apps/dashboard/src/server/ask/prompt/stable-system.ts"));

const account = (over = {}) => ({
  id: "a",
  email: "maria@example.com",
  health: "ok",
  connected_by: null,
  by_you: true,
  ...over,
});
const folder = (over = {}) => ({
  id: "s",
  provider_id: "drive-folder",
  name: "Salon clips",
  state: "watching",
  subfolders: true,
  looking: false,
  held: null,
  over_listed: false,
  updated_at: "2026-11-19T19:14:00.000Z",
  counts: {
    found: 258,
    in: 46,
    away: 0,
    coming: 0,
    landed: 0,
    processing: 0,
    waits: { budget: 0, room: 0, library_full: 0, videos_off: 0 },
    missed: { failed: 0, too_long: 0, too_large: 0 },
  },
  ...over,
});
const footage = (over = {}) => ({ offered: true, can_change: true, account: account(), folder: folder(), ...over });

test("a watched folder is one line: which folder, whose Drive, and where it stands, with no time of day", () => {
  assert.equal(
    folderLineOf(footage()),
    "Google Drive folder “Salon clips” (maria@example.com), watched: Watching. 46 photos and videos in.",
  );
  const waits = folderLineOf(
    footage({
      folder: folder({
        counts: {
          found: 258,
          in: 100,
          away: 0,
          coming: 0,
          landed: 0,
          processing: 0,
          waits: { budget: 40, room: 0, library_full: 0, videos_off: 0 },
          missed: { failed: 0, too_long: 0, too_large: 0 },
        },
      }),
    }),
  );
  assert.equal(
    waits,
    "Google Drive folder “Salon clips” (maria@example.com), watched: 40 wait for tomorrow. 100 a day come in from a folder. The rest follow tomorrow by themselves.",
  );
  assert.doesNotMatch(waits, /\d{1,2}:\d{2}/, "no clock in it, so the turn's cached facts hold");
});

test("an account with no folder, one signed out, and none at all", () => {
  assert.equal(
    folderLineOf(footage({ folder: null })),
    "Google Drive (maria@example.com): Not watching. Google Drive is connected as maria@example.com. No folder is watched.",
  );
  assert.match(
    folderLineOf(footage({ account: account({ health: "needs_reconnect" }), folder: folder({ state: "paused" }) })),
    /: Needs you\. Google signed maria@example\.com out, so nothing new comes in\./,
  );
  assert.equal(folderLineOf(footage({ account: null, folder: null })), null, "nothing connected: no line");
});

test("the line rides the facts AI reads every turn, after the Files line", () => {
  const facts = {
    businessName: "Harbor Salon",
    timezone: "America/New_York",
    hoursLines: [],
    closures: [],
    services: [],
    languages: [],
    guardrails: [],
    autonomy: [],
    notes: [],
    bookingNotes: [],
    calendar: null,
    filesLine: "Files: 46 photos and videos.",
    folderLine: folderLineOf(footage()),
  };
  const block = factsBlock(facts);
  const files = block.indexOf("Files: 46 photos and videos.");
  const folderAt = block.indexOf("Google Drive folder “Salon clips”");
  assert.ok(files >= 0 && folderAt > files, block);
  assert.doesNotMatch(factsBlock({ ...facts, folderLine: null }), /Google Drive folder/);
});
