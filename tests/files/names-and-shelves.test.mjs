/**
 * What a file is called and where it stands (contracts files/files.ts, decision 0099): a name is words a person could read,
 * in any language, that a door will take; its folder is its own; and a file stands on one shelf.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { FILE_NAME_MAX, filePathOf, isFileMime } = await importSrc("packages/contracts/src/files/limits.ts");
const { fileFolderOf, fileNameOf, fileSaidOf, inboxCleanOf, issuesSaidOf, shelfOf } = await importSrc(
  "packages/contracts/src/files/views.ts",
);
const { filesSayOf } = await importSrc("packages/contracts/src/files/files.ts");

/** The door's own shape for a name (00551 files_name_shape), in the words of a regular expression. */
function theDoorTakes(name) {
  const n = [...name].length;
  return (
    n >= 1 &&
    n <= FILE_NAME_MAX &&
    name === name.toLowerCase() &&
    !/[\s\p{Cc}/\\.<>"'&]/u.test(name) &&
    !/^-|-$|--/.test(name)
  );
}

test("a name is lower case and hyphens, with no extension", () => {
  assert.equal(fileNameOf("IMG 2041.JPG"), "img-2041");
  assert.equal(fileNameOf("  front__door--at_night.png "), "front-door-at-night");
});

test("a name keeps its language: an accent stays on its letter, and a word is not broken by an apostrophe", () => {
  assert.equal(fileNameOf("Café Terrace (dusk).jpeg"), "café-terrace-dusk");
  assert.equal(fileNameOf("Año nuevo"), "año-nuevo");
  assert.equal(fileNameOf("Sam's chair"), "sams-chair");
  assert.equal(fileNameOf("Sam’s chair"), "sams-chair");
  assert.equal(fileNameOf("日本語"), "日本語");
  assert.equal(fileNameOf("Ελληνικά φώτα"), "ελληνικά-φώτα");
});

test("a script whose vowels are combining marks comes through whole", () => {
  assert.equal(fileNameOf("नमस्ते सैलून"), "नमस्ते-सैलून");
  assert.equal(fileNameOf("ร้านเสริมสวย"), "ร้านเสริมสวย");
  assert.equal(fileNameOf("தமிழ் கடை"), "தமிழ்-கடை");
});

test("an extension is only an ASCII one, so a word after a dot is not lost", () => {
  assert.equal(fileNameOf("Mr.Año"), "mr-año");
});

test("a name the look gives is held to its words", () => {
  assert.equal(fileNameOf("storefront-dusk-street-corner-sign-lit", 4), "storefront-dusk-street-corner");
});

test("a name that says nothing is empty, for the caller's own fallback", () => {
  assert.equal(fileNameOf("....jpg"), "");
  assert.equal(fileNameOf("🙂🙂"), "");
});

test("however long, a name is one the door takes, and never half a character", () => {
  const long = fileNameOf(`${"word ".repeat(30)}end`);
  assert.ok(long.length <= FILE_NAME_MAX);
  assert.ok(theDoorTakes(long), long);
  const astral = fileNameOf("𝒜".repeat(100));
  assert.equal([...astral].length, FILE_NAME_MAX);
  assert.ok(astral.isWellFormed(), "no lone surrogate, which Postgres would refuse");
});

test("nothing that means something on a page or in a path survives into a name", () => {
  for (const said of ['<b>bold</b> & "quoted"', "a/b\\c.d", "tab\there", "../../etc/passwd"]) {
    const name = fileNameOf(said);
    assert.ok(theDoorTakes(name), name);
  }
});

test("a name reads as words, and what is typed from them comes back to the same name", () => {
  assert.equal(fileSaidOf("storefront-dusk-street"), "Storefront dusk street");
  assert.equal(fileSaidOf("año-nuevo"), "Año nuevo");
  assert.equal(fileSaidOf(""), "");
  for (const name of ["storefront-dusk-street", "año-nuevo", "img-2041", "日本語"]) {
    assert.equal(fileNameOf(fileSaidOf(name)), name);
  }
});

test("what the look found wrong is said as sentences, each ending as one, never a run of phrases", () => {
  // Seen on a made video's card, 11 Nov 2026: three notes joined by spaces read as one sentence with no stops.
  assert.equal(
    issuesSaidOf(["Stylist's hands visible in several frames", "Other people in the background."]),
    "Stylist's hands visible in several frames. Other people in the background.",
  );
  assert.equal(issuesSaidOf(["Too dark!", "  shaky  ", ""]), "Too dark! Shaky.");
  assert.equal(issuesSaidOf(["Ends on a card,"]), "Ends on a card.");
  assert.equal(issuesSaidOf([]), "");
});

test("a file's folder holds it and only it, under its workspace", () => {
  const path = filePathOf("t-1", "f-1", "image/jpeg");
  assert.equal(path, "t-1/f-1/original.jpg");
  assert.ok(path.startsWith(`${fileFolderOf("t-1", "f-1")}/`));
  assert.equal(filePathOf("t-1", "f-1", "image/heif"), "t-1/f-1/original.heic");
});

test("only the kinds we keep are taken", () => {
  for (const ok of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) assert.ok(isFileMime(ok));
  for (const no of ["image/svg+xml", "image/gif", "text/html", "", null, "toString"]) assert.ok(!isFileMime(no));
});

test("a file stands on one shelf: where it waits first, then what it shows", () => {
  assert.equal(shelfOf({ status: "inbox", shows: "work" }), "inbox");
  assert.equal(shelfOf({ status: "set_aside", shows: "work" }), "set_aside");
  assert.equal(shelfOf({ status: "filed", shows: "storefront" }), "place");
  assert.equal(shelfOf({ status: "filed", shows: "interior" }), "place");
  assert.equal(shelfOf({ status: "filed", shows: "work" }), "work");
  assert.equal(shelfOf({ status: "filed", shows: "team" }), "team");
  assert.equal(shelfOf({ status: "filed", shows: "menu" }), "products");
  assert.equal(shelfOf({ status: "filed", shows: "graphic" }), "brand");
  assert.equal(shelfOf({ status: "filed", shows: null }), "other");
});

test("the page counts what is kept, says what waits, and what AI has still to look at", () => {
  assert.equal(filesSayOf({ kept: 0, waiting: 0, looking: 0 }), "0 photos");
  assert.equal(filesSayOf({ kept: 1, waiting: 0, looking: 0 }), "1 photo");
  assert.equal(filesSayOf({ kept: 2, waiting: 1, looking: 0 }), "2 photos, 1 waiting for you");
  assert.equal(filesSayOf({ kept: 1, waiting: 1, looking: 1 }), "1 photo, 1 waiting for you, AI is still looking at 1");
});

test("the Inbox's one press takes what the look read and found nothing against", () => {
  const clean = { look_status: "done", looks_like_stock: false, shows: "work" };
  assert.equal(inboxCleanOf(clean), true);
  assert.equal(inboxCleanOf({ ...clean, shows: null }), true);
  assert.equal(inboxCleanOf({ ...clean, look_status: "waiting" }), false);
  assert.equal(inboxCleanOf({ ...clean, look_status: "failed" }), false);
  assert.equal(inboxCleanOf({ ...clean, looks_like_stock: true }), false);
  assert.equal(inboxCleanOf({ ...clean, shows: "logo" }), false);
  assert.equal(inboxCleanOf({ ...clean, shows: "graphic" }), false);
});
