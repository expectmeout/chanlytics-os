/**
 * Every reader of a video's copy goes through the one door (apps/edge/lib/files/copy/ensure.ts; the footage sources
 * plan, "Availability": "a test lists every `media_ref` reader and fails when a new one bypasses the door").
 *
 * A row's `media_ref` is the copy's id at the video platform, and it is empty while the copy is away. So the rule is
 * held where it can be read off the syntax tree: outside the database's own repositories, the column is named in the
 * door and nowhere a row is read. Each module below is on the list with what it does with the id; a module that
 * starts naming it, or one that names it more often, turns this red until it asks the door or is argued here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { importsOf, parse, repoFiles } from "../../_ast.mjs";

const DOOR = "apps/edge/lib/files/copy/ensure.ts";

/** Everywhere a row could be read: the apps, the packages a job or a verb runs in, and the scripts a person runs. */
const TREES = [
  "apps/edge/lib",
  "apps/edge/api",
  "apps/dashboard/src",
  "apps/dashboard/app",
  "apps/relay/src",
  "packages/core/src",
  "packages/jobs/src",
  "packages/channels/src",
  "packages/db/src",
  "tooling/scripts",
];

/**
 * The modules that name the column, each with how many times and why it may. Only the first reads the id off a row
 * to hand it to something that asks the video platform.
 */
const NAMES_IT = {
  [DOOR]: [5, "the door: the one place a row's id is read to be used"],
  "apps/edge/lib/files/video-doors.ts": [
    2,
    "an upload's start: the reservation its own door answered with, compared to the one just made; no row is read",
  ],
  "packages/db/src/repositories/erasure/registry/content.ts": [1, "says the column names nobody"],
  "packages/db/src/repositories/files/copies.ts": [
    6,
    "the copies' doors: the id a return was given, the one a failed attempt is named by, and the sweep's read",
  ],
  "packages/db/src/repositories/files/doors.ts": [
    4,
    "the doors that write a video's row, and the platform's word, by id",
  ],
  "packages/db/src/repositories/files/files.ts": [2, "the sweep's read of uploads the platform has not answered for"],
  "packages/db/src/repositories/files/pieces.ts": [4, "a made video's row begun, and the reservation it answers"],
  "packages/db/src/repositories/files/source-takes.ts": [8, "a take's row written, and which copies a file holds"],
  "tooling/scripts/ops/delete-tenant.mjs": [
    3,
    "erasure: deletes a copy at the platform only where a row holds an id (a script, read from its own backup)",
  ],
};

/** How many times a module names the column: as an identifier, or inside a string it hands the database. */
function namesOf(file) {
  const sf = parse(file);
  let count = 0;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "media_ref") count += 1;
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /\bmedia_ref\b/.test(node.text))
      count += 1;
    else if (ts.isTemplateExpression(node) && /\bmedia_ref\b/.test(node.getText(sf))) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return count;
}

test("a video's id at the platform is named only where the list says, as often as it says", () => {
  const found = Object.fromEntries(
    repoFiles(TREES)
      .map((file) => [file, namesOf(file)])
      .filter(([, count]) => count > 0),
  );
  const listed = Object.fromEntries(Object.entries(NAMES_IT).map(([file, [count]]) => [file, count]));
  assert.deepEqual(
    found,
    listed,
    "a module that reads a video's copy asks the door (ensureCopy), which answers the id; it never reads media_ref off a row",
  );
});

test("no app tree reads the id off a row but the door", () => {
  const outsideTheDatabase = Object.keys(NAMES_IT).filter((file) => file.startsWith("apps/"));
  assert.deepEqual(outsideTheDatabase, [DOOR, "apps/edge/lib/files/video-doors.ts"]);
});

/** What reads a video's copy at the platform, each through the door: the plan's list, as the code has it. */
const READERS = {
  "apps/edge/lib/files/video-doors.ts": "play",
  "apps/edge/lib/files/copies.ts": "AI's moments and frames, and warming",
  "apps/edge/lib/files/piece-make.ts": "making a video",
  "apps/edge/lib/files/video-digest.ts": "a digest's steps",
  "apps/edge/lib/files/look.ts": "a look again, and its poster",
  "apps/edge/lib/files/upkeep.ts": "the sweep's ask after an upload, and a purge",
  "apps/edge/lib/files/copy/sweep.ts": "the sweep's ask after a copy on its way",
};

/** Whether a module imports the copy's door. */
const asksTheDoor = (file) => importsOf(parse(file)).some((imported) => /(^|\/)ensure\.js$/.test(imported.specifier));

test("each reader of a video's copy imports the door", () => {
  for (const [file, reads] of Object.entries(READERS)) assert.ok(asksTheDoor(file), `${file} (${reads}) asks the door`);
});

/**
 * What the letting go protects follows from this list (file_copies_let_go; lane 1 of the "Prove it works" plan, item
 * 7, read on 28 November 2026). Only a video being made reads its clips' copies at a time nobody is watching, so only
 * a clip a piece being made names is held back. A post waiting to go is sent from the made video's own kept file
 * (apps/edge/lib/instagram/post-ready.ts, apps/dashboard/src/server/posts/approve.ts) and an ad sends no video at
 * all yet (apps/edge/lib/ads/launch.ts), so neither needs the copy at the video platform, and a copy that stepped
 * aside holds neither back. A module that starts asking the door changes that: add it above, and where it asks at a
 * time set in advance, protect its video in the let-go by the relation that names it (`posts.file_id`, an ad's
 * picture), never by searching text.
 */
test("nothing else reads a video's copy: a post and an ad send nothing from it", () => {
  const askers = repoFiles(TREES)
    .filter((file) => file !== DOOR && asksTheDoor(file))
    .sort();
  assert.deepEqual(askers, Object.keys(READERS).sort());
});
