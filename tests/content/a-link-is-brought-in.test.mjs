/**
 * A link to a business's photos and videos, read in code (contracts content/bring-in.ts): its website, its Instagram account,
 * or a place nothing here brings in and why; and the card's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { bringInOf, bringInSpec, BRING_IN_WORDS } = await importSrc("packages/contracts/src/content/bring-in.ts");

test("a website, with or without https, is read at its address", () => {
  assert.deepEqual(bringInOf("harbor.example"), { place: "website", url: "https://harbor.example/" });
  assert.deepEqual(bringInOf(" https://www.harbor.example/work "), {
    place: "website",
    url: "https://www.harbor.example/work",
  });
  assert.deepEqual(bringInOf("http://harbor.example/."), { place: "website", url: "http://harbor.example/" });
});

test("an Instagram account, by its link or its @name, is its handle", () => {
  assert.deepEqual(bringInOf("https://www.instagram.com/Harbor.Salon/"), {
    place: "instagram",
    handle: "harbor.salon",
  });
  assert.deepEqual(bringInOf("instagram.com/harbor_salon?igsh=abc"), { place: "instagram", handle: "harbor_salon" });
  assert.deepEqual(bringInOf("@harborsalon"), { place: "instagram", handle: "harborsalon" });
});

test("one post, a player, a folder or another social page is refused, each with its reason", () => {
  assert.deepEqual(bringInOf("https://www.instagram.com/p/C1abc/"), { place: "none", why: "post" });
  assert.deepEqual(bringInOf("https://www.instagram.com/reel/C1abc/"), { place: "none", why: "post" });
  assert.deepEqual(bringInOf("https://youtu.be/abc"), { place: "none", why: "player" });
  assert.deepEqual(bringInOf("https://vimeo.com/42"), { place: "none", why: "player" });
  assert.deepEqual(bringInOf("https://drive.google.com/drive/folders/x"), { place: "none", why: "drive" });
  assert.deepEqual(bringInOf("https://www.tiktok.com/@harbor"), { place: "none", why: "social" });
  assert.deepEqual(bringInOf("my photos are on my phone"), { place: "none", why: "not_a_link" });
  assert.deepEqual(bringInOf("javascript:alert(1)"), { place: "none", why: "not_a_link" });
  for (const why of ["post", "player", "drive", "social", "not_a_link"]) assert.ok(BRING_IN_WORDS.refused[why]);
});

test("the card says what it brings in, and videos only where the workspace takes them", () => {
  const site = bringInOf("harbor.example");
  assert.equal(BRING_IN_WORDS.title(site), "Bring in what harbor.example shows");
  assert.match(BRING_IN_WORDS.summary(site, true), /photos and videos/);
  assert.doesNotMatch(BRING_IN_WORDS.summary(site, false), /videos/);
  assert.equal(BRING_IN_WORDS.title(bringInOf("@harborsalon")), "Bring in @harborsalon's posts and reels");
});

test("the card's receipt says what its press did: a read began, or why none did, never as a failure", () => {
  const card = { payload: { link: "instagram.com/harborsalon" } };
  const said = (answer) => bringInSpec.receipt(card, answer);
  const began = "AI is bringing them in. They wait in the Library for your approval.";
  assert.equal(said({ fate: "instagram" }), began);
  assert.equal(said({ fate: "website" }), began);
  assert.equal(said(undefined), began, "an answer that says nothing is a read begun, as it was before");
  // ACCEPTANCE 32: read inside the day, so nothing is read again: when it was, and what came.
  assert.equal(
    said({ fate: "read_lately", read_ms_ago: 3 * 3_600_000, reading: false, photos: 12, videos: 4 }),
    "AI read this account 3h ago and brought in 12 photos and 4 videos. It reads an account once a day.",
  );
  assert.equal(
    said({ fate: "read_lately", read_ms_ago: 40_000, reading: false, photos: 1, videos: 0 }),
    "AI read this account just now and brought in 1 photo. It reads an account once a day.",
  );
  assert.equal(
    said({ fate: "read_lately", read_ms_ago: 5 * 3_600_000, reading: false, photos: 0, videos: 0 }),
    "AI read this account 5h ago and found nothing new. It reads an account once a day.",
  );
  assert.equal(
    said({ fate: "read_lately", read_ms_ago: 60_000, reading: true, photos: 0, videos: 0 }),
    "AI is already reading this account. What it finds waits in the Library for your approval.",
  );
  // A day's reads are used: the workspace's says how long until the next, the platform's to come back tomorrow.
  assert.equal(
    said({ fate: "wait", binds: "workspace_reads", wait_ms: 5 * 3_600_000 }),
    "AI has read Instagram as often as it can for you today. Paste the link again in 5h.",
  );
  assert.equal(
    said({ fate: "wait", binds: "platform_reads", wait_ms: 9 * 3_600_000 }),
    "AI can't read Instagram right now. Paste the link again tomorrow.",
  );
});
