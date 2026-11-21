/**
 * A clip whose video is kept in Google Drive says where it stands, for every word of the closed sets (packages/
 * apps/dashboard/src/surfaces/files/footage/copy-words.ts over contracts' copy.ts; the footage sources plan's P5, gate 1). Until this, the page read
 * every one of them as "can't play". Each word has a sentence: what is happening, whether it ends by itself, and the
 * one thing to do. Play is a press, so only a clip nobody asked for yet wears it. And the numbers a sentence quotes
 * are the ones the code uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { importSrc } from "../../_source.mjs";

const { FILE_COPY_LOSSES, FILE_COPY_STATES, FILE_COPY_WAITS } = await importSrc("packages/contracts/src/files/copy.ts");
const { COPY_WORDS, copyRowLineOf, copySaidOf, leavesOn, rowReasonOf } = await importSrc(
  "apps/dashboard/src/surfaces/files/footage/copy-words.ts",
);
const { FOOTAGE_NUMBERS } = await importSrc("packages/contracts/src/files/footage-numbers.ts");
const { connectStoppedOf } = await importSrc("packages/contracts/src/files/footage-setup.ts");
const { SOURCE_PACE } = await import(at("apps/edge/lib/files/sources/pace.ts"));
const { RETURN_BUDGETS, SOURCE_GRACE, TAKE_BUDGETS, TAKE_HAND_OUT } = await import(
  at("apps/edge/lib/files/takes/budgets.ts")
);

const { fileDtoOf } = await importSrc("apps/dashboard/src/server/readers/files.ts");
const { VIDEO_TILE_WORDS } = await importSrc("packages/contracts/src/files/tile-words.ts");

const facts = {
  folder: "Salon clips",
  account: "maria@example.com",
  leaves: "Nov 26",
  connected: true,
  uploaded: false,
};
const CODES = /_|\b(null|undefined|copy_state|stream|relay|token|quota|budget|job)\b/i;

test("a clip that plays says nothing; one nobody asked for wears Play, as one press", () => {
  assert.equal(copySaidOf("here", null, facts), null);
  const kept = copySaidOf("away", null, facts);
  assert.deepEqual([kept.mark, kept.act, kept.head], ["play", "play", "This clip is kept in Google Drive"]);
  // On its way, or caught as it steps aside: the same words, and nothing to press.
  for (const copy of ["returning", "going"]) {
    const coming = copySaidOf(copy, null, facts);
    assert.deepEqual([coming.mark, coming.act, coming.mends], ["ring", null, true]);
    assert.equal(coming.head, "Getting it from Google Drive…");
  }
});

test("every reason a copy waits or is lost has its own sentence, with no code in it", () => {
  for (const why of FILE_COPY_WAITS) {
    const said = copySaidOf("away", why, facts);
    assert.ok(said.head && said.body, `${why}: a head and a body`);
    assert.ok(!CODES.test(`${said.head} ${said.body}`), `${why}: "${said.head} ${said.body}" reads like a code`);
  }
  for (const why of FILE_COPY_LOSSES) {
    const said = copySaidOf("lost", why, facts);
    assert.ok(said.head && said.body, `${why}: a head and a body`);
    assert.equal(said.mends, false, `${why}: a lost original never mends by itself here`);
    assert.ok(!CODES.test(`${said.head} ${said.body}`), `${why}: "${said.head} ${said.body}" reads like a code`);
  }
  assert.equal(FILE_COPY_STATES.length, 5);
});

test("what ends by itself says so and asks nothing; what does not names the one thing to do", () => {
  const of = (copy, why) => copySaidOf(copy, why, facts);
  assert.deepEqual([of("away", "room").mends, of("away", "room").act], [true, null], "no room: it waits");
  for (const why of ["busy", "failed", "stopped"])
    assert.equal(of("away", why).head, "Still getting it from Google Drive…", `${why}: one line covers a slow try`);
  // Its account, never its folder, asks for a connect: a folder only stopped still gives its clips back (F1).
  assert.deepEqual(
    [of("away", "connection").act, of("away", "connection").head],
    ["connect", "Google Drive needs to be connected again"],
  );
  // A folder Drive can't open, or a try Drive gave nothing to, is pressed again: nothing else asks for it.
  for (const why of ["cant_open", "unreadable"]) {
    const said = of("away", why);
    assert.deepEqual([said.mark, said.act, said.mends], ["play", "play", false], `${why}: one press asks again`);
    assert.ok(!/connect/i.test(`${said.head} ${said.body}`), `${why}: the account is not blamed`);
  }
  assert.equal(of("lost", "gone").act, "open_drive");
  assert.equal(of("lost", "outside").head, "Its original was moved out of “Salon clips”");
  assert.equal(of("lost", "not_found").act, "add_again", "the bytes its owner gives again bring it back (gate 2)");
  assert.equal(of("lost", "no_access").head, "maria@example.com can no longer open its original");
  // No watched folder holds it: said by whether a Drive is connected at all.
  assert.equal(of("lost", "no_origin").head, "Its folder isn't watched any more");
  assert.equal(copySaidOf("lost", "no_origin", { ...facts, connected: false }).head, "Google Drive isn't connected");
  assert.ok(of("lost", "gone").body.includes("Nov 26"), "the day a removed file leaves, where it is known");
});

test("a row says something only for a clip coming back or one that can't: every other reads as any clip does", () => {
  assert.equal(copyRowLineOf("here", null, facts), null);
  assert.equal(copyRowLineOf("away", null, facts), null, "kept in Drive: no mark (the canvas's call 6)");
  assert.equal(copyRowLineOf("away", "room", facts), null);
  assert.deepEqual(copyRowLineOf("returning", null, facts), {
    line: COPY_WORDS.row.returning,
    tone: "live",
    alone: true,
  });
  assert.equal(copyRowLineOf("lost", "gone", facts).line, "Deleted in Drive · leaves Nov 26");
  assert.equal(copyRowLineOf("lost", "not_found", facts).line, "Can't be found in Drive");
});

test("the numbers a sentence quotes are the code's own", () => {
  assert.deepEqual(FOOTAGE_NUMBERS, {
    firstItems: SOURCE_PACE.firstWatchItems,
    firstDays: SOURCE_PACE.firstWatchDays,
    itemsMax: SOURCE_PACE.itemsMax,
    takesADay: TAKE_BUDGETS.workspaceTakesADay,
    takesAtOnce: TAKE_HAND_OUT.inFlight,
    returnsADay: RETURN_BUDGETS.workspaceReturnsADay,
    // The days a row says a file leaves on are the days the cleanup is asked with.
    graceDays: SOURCE_GRACE.seconds / (24 * 60 * 60),
    // What Health holds the footage day to (00674): the platform's day of Google's units and bytes.
    unitsADay: TAKE_BUDGETS.unitsADay,
    platformBytesADay: TAKE_BUDGETS.platformBytesADay,
  });
  assert.ok(copySaidOf("away", "budget", facts).body.startsWith(`${RETURN_BUDGETS.workspaceReturnsADay} clips a day`));
});

test("a connect that connected nothing says what happened, whether anything changed, and the press that stands", () => {
  assert.deepEqual(connectStoppedOf("closed"), {
    say: "Not connected. Nothing changed.",
    tone: "rest",
    press: "connect",
  });
  assert.equal(connectStoppedOf("scope_missing").press, "again");
  assert.equal(connectStoppedOf("blocked_by_admin").press, "steps");
  assert.equal(connectStoppedOf("not_allowed").say, "Only an owner or a partner can connect a folder.");
  // Every reason the edge's connect gives (apps/edge/lib/files/sources/connect.ts ConnectRefusal) has a sentence.
  for (const why of [
    "not_available",
    "not_enabled",
    "failed",
    "no_account",
    "no_refresh_token",
    "credentials_failed",
    "anything",
  ]) {
    const said = connectStoppedOf(why);
    assert.ok(said.say.length > 10 && !CODES.test(said.say), `${why}: "${said.say}"`);
  }
});

test("a file whose original left its folder says the day it leaves, a photo as a clip, and nothing once it is put back", () => {
  // Left Drive on 19 Nov: it leaves the Library on 26 Nov unless a post used it (the canvas's Removed board).
  const left = { copy: "here", copy_why: null, origin_left: "gone", origin_left_at: "2026-11-19T12:00:00.000Z" };
  assert.equal(leavesOn(left, "UTC"), "Nov 26");
  assert.deepEqual(
    copyRowLineOf(left.copy, rowReasonOf(left), { folder: "Salon clips", leaves: leavesOn(left, "UTC") }),
    {
      line: "Deleted in Drive · leaves Nov 26",
      tone: "you",
      alone: true,
    },
  );
  const moved = { ...left, origin_left: "outside" };
  assert.equal(
    copyRowLineOf(moved.copy, rowReasonOf(moved), { folder: "Salon clips", leaves: leavesOn(moved, "UTC") }).line,
    "Moved out of “Salon clips” · leaves Nov 26",
  );
  const back = { copy: "here", copy_why: null, origin_left: null, origin_left_at: null };
  assert.equal(leavesOn(back, "UTC"), null);
  assert.equal(copyRowLineOf(back.copy, rowReasonOf(back), { folder: "Salon clips", leaves: null }), null);
});

/**
 * A clip its owner added themselves (files.owner_uploaded: their upload met the folder's file) is theirs: the seven-day
 * cleanup never takes it (source_items_grace_end), and one that comes back comes from what they added. The watched
 * folder's live check (21 Nov 2026) found its row saying "Deleted in Drive · leaves Nov 27", and "Getting it from Google
 * Drive…" while it came back from the owner's upload with its original in Drive's bin.
 */
test("a clip its owner added never says it leaves, and coming back from what they added never names Google Drive", () => {
  const theirs = {
    copy: "here",
    copy_why: null,
    origin_left: "gone",
    origin_left_at: "2026-11-19T12:00:00.000Z",
    owner_uploaded: true,
  };
  assert.equal(leavesOn(theirs, "UTC"), null, "it stays: no day to leave");
  assert.equal(rowReasonOf(theirs), null, "its original leaving takes nothing from the Library");
  assert.equal(copyRowLineOf(theirs.copy, rowReasonOf(theirs), { ...facts, leaves: leavesOn(theirs, "UTC") }), null);

  const fromUpload = { ...facts, uploaded: true };
  assert.deepEqual(copyRowLineOf("returning", null, fromUpload), {
    line: VIDEO_TILE_WORDS.gettingReady,
    tone: "live",
    alone: true,
  });
  const coming = copySaidOf("returning", null, fromUpload);
  assert.deepEqual(
    [coming.mark, coming.act, coming.mends],
    ["ring", null, true],
    "it ends by itself, nothing to press",
  );
  assert.equal(coming.head, VIDEO_TILE_WORDS.gettingReady);
  assert.ok(!/Google Drive/.test(`${coming.head} ${coming.body}`), `"${coming.head} ${coming.body}" names Drive`);
  // A clip of the folder's own still comes back from Google Drive, and says so.
  assert.equal(copySaidOf("returning", null, facts).head, "Getting it from Google Drive…");

  // The page hears whose it is from the file the Library reads.
  const row = {
    id: "f1",
    kind: "video",
    status: "filed",
    source: "drive",
    name: "salon-clip",
    bytes: 1,
    width: null,
    height: null,
    seconds: 10,
    media_status: "ready",
    sound_said: null,
    copy_state: "here",
    copy_why: null,
    origin_left: "gone",
    origin_left_at: "2026-11-19T12:00:00.000Z",
    owner_uploaded: true,
    shows: null,
    who_in_it: "not_asked",
    yes_for: [],
    yes_back: [],
    look: null,
    look_status: "done",
    created_at: "2026-11-19T12:00:00.000Z",
  };
  assert.equal(fileDtoOf(row).owner_uploaded, true);
  assert.equal(fileDtoOf({ ...row, owner_uploaded: false }).owner_uploaded, false);
});
