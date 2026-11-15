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
const sources = (website = {}, listing = {}, instagram = {}) => ({
  places: [
    place({ place: "website", ...website }),
    place({ place: "google_listing", ...listing }),
    place({ place: "instagram", ...instagram }),
  ],
});
const READ = "2026-11-14T14:18:22Z";

test("nothing known: where are your photos, and no lines to say", () => {
  const said = contentSourcesSaid(sources(), true);
  assert.equal(said.state, "unknown");
  assert.equal(said.title, "Where are your photos and videos?");
  assert.deepEqual(said.lines, []);
  assert.equal(said.ask.placeholder, "Paste a link");
  assert.equal(
    contentSourcesSaid(sources(), false).title,
    "Where are your photos?",
    "a workspace that takes no videos",
  );
});

test("a website being read: looking, its line live, and Instagram offered to paste", () => {
  const said = contentSourcesSaid(
    sources({ address: "https://www.harbor.example/", reading: true }, { address: "listing" }),
    true,
  );
  assert.equal(said.state, "looking");
  assert.deepEqual(
    said.lines.map((l) => [l.place, l.name, l.status, l.tone]),
    [
      ["website", "harbor.example", "Looking", "live"],
      ["google_listing", "Your Google listing", "Not read yet", "rest"],
      ["instagram", "Instagram", "Not linked", "rest"],
    ],
  );
  assert.equal(said.lines[2].sub, "Paste it below to add it");
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
