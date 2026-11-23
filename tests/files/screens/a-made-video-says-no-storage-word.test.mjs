/**
 * A video made here that has stepped aside is said as any video is (apps/dashboard/src/surfaces/files/footage/
 * copy-words.ts; the archive PRD's section 8). Its owner never chose where it is kept, so no sentence of it names a
 * place: its still, Play, and its sound to listen to; "Getting your video ready…" while it comes back; and, for
 * whatever stands in its way, what is happening and the one thing to do. A watched folder's clip says what it said
 * before, letter for letter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { importSrc } from "../../_source.mjs";

const { FILE_COPY_LOSSES, FILE_COPY_STATES, FILE_COPY_WAITS } = await importSrc("packages/contracts/src/files/copy.ts");
const { copyRowLineOf, copySaidOf } = await importSrc("apps/dashboard/src/surfaces/files/footage/copy-words.ts");
const { FOOTAGE_NUMBERS } = await importSrc("packages/contracts/src/files/footage-numbers.ts");
const { VIDEO_TILE_WORDS } = await importSrc("packages/contracts/src/files/tile-words.ts");

const clip = {
  folder: "Salon clips",
  account: "maria@example.com",
  leaves: "Nov 26",
  connected: true,
  uploaded: false,
  made: false,
};
const made = { ...clip, made: true };
const WHYS = [null, ...FILE_COPY_WAITS, ...FILE_COPY_LOSSES];
/** Where a video is kept, in any of the words a page could say it with. */
const STORAGE = /drive|google|folder|original|clip|cop(y|ies)|shel(f|ves)|stor(e|ed|age)|cache|stream/i;
const CODES = /_|\b(null|undefined|token|quota|budget|job|relay)\b/i;

test("no sentence of a made video names where it is kept, in any state and for any reason", () => {
  for (const copy of FILE_COPY_STATES)
    for (const why of WHYS) {
      const said = copySaidOf(copy, why, made);
      const row = copyRowLineOf(copy, why, made);
      const words = [said?.head, said?.body, row?.line].filter(Boolean).join(" ");
      assert.ok(!STORAGE.test(words), `${copy}/${why}: "${words}" names where it is kept`);
      assert.ok(!CODES.test(words), `${copy}/${why}: "${words}" reads like a code`);
    }
});

test("stepped aside, it is its still with Play: nothing is said, and one press brings it", () => {
  assert.equal(copySaidOf("here", null, made), null);
  assert.deepEqual(copySaidOf("away", null, made), { mark: "play", head: "", body: "", act: "play", mends: false });
  assert.equal(copyRowLineOf("away", null, made), null, "its row reads as any video's");
});

test("coming back, it says it is being made ready and plays by itself", () => {
  for (const copy of ["returning", "going"]) {
    assert.deepEqual(copySaidOf(copy, null, made), {
      mark: "ring",
      head: "Getting your video ready…",
      body: "It plays by itself, here or when you come back.",
      act: null,
      mends: true,
    });
    assert.deepEqual(copyRowLineOf(copy, null, made), {
      line: VIDEO_TILE_WORDS.gettingReady,
      tone: "live",
      alone: true,
    });
  }
});

test("what stands in its way is said as what happens next, with the one thing to do", () => {
  const of = (why) => copySaidOf("away", why, made);
  // No room: the words every video says, and it waits.
  assert.deepEqual(of("room"), copySaidOf("away", "room", clip));
  assert.deepEqual([of("room").mends, of("room").act], [true, null]);
  // The day's are used: tomorrow, with the number the code holds.
  assert.deepEqual(of("budget"), {
    mark: "none",
    head: "It plays again tomorrow",
    body: `${FOOTAGE_NUMBERS.returnsADay} videos a day can be made ready again, and today's are used.`,
    act: null,
    mends: false,
  });
  assert.deepEqual(of("videos_off"), copySaidOf("away", "videos_off", clip));
  // Every other wait ends at the next press, so none says anything keeps trying.
  for (const why of FILE_COPY_WAITS.filter((w) => !["room", "budget", "videos_off"].includes(w)))
    assert.deepEqual(
      of(why),
      {
        mark: "play",
        head: "This video isn't ready just now",
        body: "Its picture and its sound are here. Play to try again.",
        act: "play",
        mends: false,
      },
      why,
    );
});

test("one that can't come back says so once, keeps what it has, and asks nothing it can't act on", () => {
  for (const why of [null, ...FILE_COPY_LOSSES]) {
    assert.deepEqual(
      copySaidOf("lost", why, made),
      {
        mark: "none",
        head: "This video can't be played",
        body: "Its picture and words stay.",
        act: null,
        mends: false,
      },
      String(why),
    );
    assert.deepEqual(copyRowLineOf("lost", why, made), { line: "Can't be played", tone: "you", alone: false });
  }
});

test("a watched folder's clip says what it said before, letter for letter", () => {
  const all = {};
  for (const copy of FILE_COPY_STATES)
    for (const why of WHYS) {
      const said = copySaidOf(copy, why, clip);
      const row = copyRowLineOf(copy, why, clip);
      all[`${copy}/${why ?? "-"}`] = [
        said ? [said.mark, said.head, said.body, said.act, said.mends] : null,
        row ? [row.line, row.tone, row.alone] : null,
      ];
    }
  assert.equal(Object.keys(all).length, 85, "every state with every reason");
  // Its 85 answers, as they stood on main before a made video had words of its own (23 Nov 2026). A sentence of a
  // clip's changed on purpose changes this with it: print `all` to see which.
  assert.equal(
    createHash("sha256").update(JSON.stringify(all)).digest("hex"),
    "ab3e63c0082b73828c043cc21413b2589ca7a9c3ab4586a7c2344233f0836791",
  );
});
