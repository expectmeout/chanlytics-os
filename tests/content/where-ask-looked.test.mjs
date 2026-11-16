/**
 * Where Ask looked for a business's photos and videos, and what came of it (contracts content/sources.ts, the empty state of
 * Content, 14 Nov 2026): the card's state over every place, and the line each place says.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { contentSourcesSaid } = await importSrc("packages/contracts/src/content/sources.ts");
const { contentMoving } = await importSrc("packages/contracts/src/content/page.ts");

const place = (over) => ({
  address: null,
  reading: false,
  reading_until: null,
  read_at: null,
  photos: 0,
  videos: 0,
  seen: null,
  unread: null,
  ...over,
});
const sources = (website = {}, listing = {}, instagram = {}, film = []) => ({
  places: [
    place({ place: "website", ...website }),
    place({ place: "google_listing", ...listing }),
    place({ place: "instagram", ...instagram }),
  ],
  film,
});
const READ = "2026-11-14T14:18:22Z";

test("nothing known: where are your photos, what to paste said once, and no lines to say", () => {
  const said = contentSourcesSaid(sources(), true);
  assert.equal(said.state, "unknown");
  assert.equal(said.title, "Where are your photos and videos?");
  assert.equal(said.body, "Paste your Instagram or website, and AI brings them in.");
  assert.deepEqual(said.lines, []);
  assert.deepEqual(
    said.ask,
    { placeholder: "instagram.com/yourbusiness" },
    "the input's words are an example of a link; no hint under it says it again (docs/words.md, Placeholder)",
  );
  assert.equal(
    contentSourcesSaid(sources(), false).title,
    "Where are your photos?",
    "a workspace that takes no videos",
  );
});

test("a website being read: looking, its line live, and Instagram not linked, each line its glyph's name and its status", () => {
  const said = contentSourcesSaid(
    sources({ address: "https://www.harbor.example/", reading: true }, { address: "listing" }),
    true,
  );
  assert.equal(said.state, "looking");
  assert.deepEqual(
    said.lines.map((l) => [l.place, l.name, l.status, l.tone]),
    [
      ["website", "harbor.example", "Looking", "live"],
      ["google_listing", "Google listing", "Not read yet", "rest"],
      ["instagram", "Instagram", "Not linked", "rest"],
    ],
  );
  assert.ok(
    said.lines.every((l) => !("sub" in l)),
    "no second line under a place: its glyph says what it is, and the input under the lines takes the link",
  );
});

test("found in one place: the title says the count, so that place's line says it was checked, not the count again", () => {
  const said = contentSourcesSaid(
    sources({ address: "https://harbor.example", read_at: READ, photos: 1 }, {}, {}),
    true,
  );
  assert.equal(said.state, "found");
  assert.equal(said.title, "AI found 1 photo");
  assert.equal(said.body, "Keep the ones that are yours.");
  assert.deepEqual(
    said.lines.map((l) => [l.name, l.status, l.tone]),
    [
      ["harbor.example", "Checked", "ok"],
      ["Instagram", "Not linked", "rest"],
    ],
  );
});

test("the clips to film fold under one line: how many, their length once where they share it, else each its own", () => {
  const shot = (what, seconds) => ({ what, how: "Hold the phone over the desk.", seconds });
  const same = contentSourcesSaid(sources({}, {}, {}, [shot("The chat", 8), shot("The count", 8)]), true).film;
  assert.equal(same.head, "Film 2 clips for a video");
  assert.equal(same.each, "8s each");
  assert.deepEqual(
    same.shots.map((s) => s.seconds),
    [null, null],
    "said once over them",
  );
  const apart = contentSourcesSaid(sources({}, {}, {}, [shot("The chat", 8), shot("The count", 12)]), true).film;
  assert.equal(apart.each, null);
  assert.deepEqual(
    apart.shots.map((s) => s.seconds),
    ["8s", "12s"],
  );
  const before = contentSourcesSaid(sources({}, {}, {}, [shot("A read before 16 Nov", null)]), true).film;
  assert.equal(before.head, "Film a clip for a video");
  assert.equal(before.each, null, "a read that wrote no seconds says none");
  assert.equal(
    contentSourcesSaid(sources({}, {}, {}, [shot("x", 8)]), false).film,
    null,
    "no clips where no videos are made",
  );
  assert.equal(contentSourcesSaid(sources(), true).film, null, "none where the read wrote none");
});

test("found: what came in, counted across the places, and each line says its own", () => {
  const said = contentSourcesSaid(
    sources(
      { address: "https://harbor.example", read_at: READ, photos: 9, videos: 4 },
      { address: "listing", read_at: READ, photos: 5 },
    ),
    true,
  );
  assert.equal(said.state, "found");
  assert.equal(said.title, "AI found 14 photos and 4 videos");
  assert.equal(said.lines[0].status, "9 photos · 4 videos");
  assert.equal(said.lines[1].status, "5 photos");
  assert.equal(
    contentSourcesSaid(sources({ address: "https://harbor.example", read_at: READ, videos: 2 }), false).state,
    "none",
    "a video where videos are not taken is not counted as found",
  );
});

test("looked and nothing came: what was looked at, and why", () => {
  const small = contentSourcesSaid(
    sources(
      { address: "https://harbor.example", read_at: READ, seen: { photos: 3, videos: 0, embedded: 0 } },
      { address: "listing", read_at: READ },
    ),
    true,
  );
  assert.equal(small.state, "none");
  assert.equal(
    small.body,
    "AI looked at your website and your Google listing. The photos there are too small to post.",
  );
  assert.deepEqual(
    small.lines.map((l) => l.status),
    ["Too small to use", "None posted by you", "Not linked"],
  );
  const embedded = contentSourcesSaid(
    sources({ address: "https://harbor.example", read_at: READ, seen: { photos: 0, videos: 0, embedded: 2 } }),
    true,
  );
  assert.match(embedded.body, /YouTube or Vimeo/);
  const unread = contentSourcesSaid(
    sources({ address: "https://harbor.example", unread: "Your site didn't answer." }),
    true,
  );
  assert.equal(unread.state, "none");
  assert.match(unread.body, /couldn't read it/);
  assert.equal(unread.lines[0].status, "Couldn't read it");
});

test("an Instagram pasted is a line of its own, by its handle", () => {
  const said = contentSourcesSaid(sources({}, {}, { address: "harborsalon", reading: true }), true);
  assert.equal(said.state, "looking");
  assert.deepEqual(
    said.lines.map((l) => [l.name, l.status]),
    [["@harborsalon", "Reading"]],
  );
});

test("a place being read is not asked after: what it brings is told as it lands, so the page rests while it runs", () => {
  const page = {
    making: [],
    made: [],
    lines: [],
    sources: sources({ address: "https://harbor.example", reading: true, reading_until: new Date().toISOString() }),
  };
  assert.equal(contentMoving(page, Date.now()), false);
  assert.equal(contentMoving({ ...page, making: [{ status: "making" }] }, Date.now()), true, "a video made still is");
});
