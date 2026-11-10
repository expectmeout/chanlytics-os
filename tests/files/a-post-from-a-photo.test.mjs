/**
 * A post made from a photo, by code (decision 0099, step 3). The layout is arithmetic a test can hold; the real composer draws real
 * pixels; the act holds the words to what the owner said; and its card shows one press whose Undo takes back only what it made.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");

const { POST_SIZES, SCRIM_UNDER_WORDS, postCrop, postLayout, postPhotoBox, wordsOverPhoto } = await import(
  at("apps/dashboard/src/server/posts/layout.ts")
);
const { composePost } = await import(at("apps/dashboard/src/server/posts/compose.ts"));
const { MAKE_POST_ASK, buildAskSuggestions } = await import(at("packages/contracts/src/ask/suggestions.ts"));
const { postPathOf, postPhotoProblem, postPlanProblem, postUndrawable, postWordsProblem } = await import(
  at("apps/dashboard/src/server/files/post-check.ts")
);
const { POST_LAYOUTS, POST_LIMITS, POST_SHAPES, POST_WORDS, postPhotoWont, postPlanOf, postPlanTidied, postWordsIn } =
  await import(at("packages/contracts/src/files/post.ts"));
const { postSpec } = await import(at("packages/contracts/src/files/post-spec.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { shelfOf } = await import(at("packages/contracts/src/files/views.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "ffffffff-0000-4000-8000-000000000001";
const TZ = "America/New_York";

/* ------------------------------------------------------------------------- the layout */

/** Every node a layout draws, found by what it holds. */
const nodesOf = (n, out = []) => {
  if (!n || typeof n !== "object") return out;
  out.push(n);
  for (const c of [n.props?.children].flat()) nodesOf(c, out);
  return out;
};
const MARK = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#e8c156" } })
  .png()
  .toBuffer();
const LAYOUT = {
  shape: POST_SIZES.portrait,
  words: { over: "Fall special", line: "20% off balayage", under: "Ends Nov 30", act: "Book · (555) 010-0100" },
  wordsAt: "bottom",
  voice: "classic",
  layout: "over",
  accent: "#e8c156",
  logo: `data:image/png;base64,${MARK.toString("base64")}`,
};

test("white words read over any photo: the scrim under them is past the arithmetic's 0.54", () => {
  assert.ok(SCRIM_UNDER_WORDS >= 0.6, "black at 0.54 is where white reads 4.5:1 on a white photo");
  const words = nodesOf(postLayout(LAYOUT)).find((n) =>
    String(n.props?.style?.backgroundImage ?? "").includes("to bottom, rgba(0,0,0,0) "),
  );
  assert.ok(words.props.style.backgroundImage.includes(`rgba(0,0,0,${SCRIM_UNDER_WORDS})`));
});

test("the words stand at the end they are asked to, and a story's stay clear of the phone's own controls", () => {
  const foot = nodesOf(postLayout({ ...LAYOUT, shape: POST_SIZES.story }));
  const held = foot.find((n) => n.props?.style?.bottom === 0);
  assert.ok(held, "at the foot");
  assert.match(
    held.props.style.padding,
    new RegExp(`${72 + POST_SIZES.story.clearFoot}px$`),
    "over Instagram's reply bar",
  );
  const top = nodesOf(postLayout({ ...LAYOUT, shape: POST_SIZES.story, wordsAt: "top" }));
  const up = top.find(
    (n) => n.props?.style?.top === 0 && String(n.props?.style?.backgroundImage ?? "").includes("to top"),
  );
  assert.ok(up, "at the top");
  assert.ok(parseInt(up.props.style.padding, 10) >= POST_SIZES.story.clearTop, "under the account line");
});

test("no mark and no colour still make a post: white in the colour's place, and nothing drawn where the mark would be", () => {
  const drawn = nodesOf(postLayout({ ...LAYOUT, accent: null, logo: null }));
  assert.equal(drawn.filter((n) => n.type === "img").length, 0);
  const band = drawn.find((n) => n.props?.style?.backgroundColor === "#ffffff");
  assert.ok(band, "the band reads on white");
  assert.equal(band.props.style.color, "#000000");
});

/** The band a layout draws, and its line's size. */
const bandOf = (over) =>
  nodesOf(postLayout({ ...LAYOUT, ...over })).find((n) => n.props?.style?.padding === "16px 34px")?.props.style;
const lineSizeOf = (line, voice) =>
  nodesOf(postLayout({ ...LAYOUT, voice, words: { line } })).find((n) => n.props?.children?.includes?.(line))?.props
    .style.fontSize;

test("words are ink on a colour that needs it, white on one that does not", () => {
  assert.equal(bandOf({ accent: "#e8c156" }).color, "#000000");
  assert.equal(bandOf({ accent: "#1a3a5c" }).color, "#ffffff");
});

test("a short line is the picture's headline, a long one still reads", () => {
  const sizes = ["Now booking", "20% off balayage all week", "Your new favourite chair is open today", "x".repeat(60)];
  const big = sizes.map((l) => lineSizeOf(l, "classic"));
  assert.deepEqual(
    big,
    [...big].sort((x, y) => y - x),
  );
  assert.ok(big.at(-1) >= 50, "never below what a phone reads");
  assert.ok(lineSizeOf("Now booking", "modern") < lineSizeOf("Now booking", "classic"), "a heavy sans stands smaller");
});

/** The reckoning WCAG gives, to hold the layouts to it from outside them. */
const contrast = (a, b) => {
  const light = (hex) => {
    const [r, g, c] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * c;
  };
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const groundOf = (node) =>
  nodesOf(node).find((n) => n.props?.style?.flexDirection === "column" && n.props?.style?.backgroundColor)?.props.style
    .backgroundColor;
const ACCENTS = ["#e8c156", "#1a3a5c", "#777777", "#ffffff", "#000000", "#c0392b", "#2ecc71", "#8e44ad"];

test("words on a ground of their own read on it, whatever the business's colour is", () => {
  for (const accent of ACCENTS)
    for (const layout of ["band", "frame"])
      for (const voice of ["classic", "modern"]) {
        const tree = postLayout({ ...LAYOUT, layout, voice, accent });
        const ground = groundOf(tree);
        assert.ok(ground, `${layout} has a ground`);
        const inks = nodesOf(tree)
          .filter((n) => n.props?.style?.color && n.props?.style?.fontSize && !n.props?.style?.backgroundColor)
          .map((n) => n.props.style);
        assert.ok(inks.length >= 3, `${layout}: the words are found`);
        for (const s of inks) {
          const needs = s.fontSize >= 50 ? 3 : s.fontSize === 26 ? 3 : 4.5;
          assert.ok(contrast(s.color, ground) >= needs, `${layout} ${accent} ${s.fontSize}px: ${s.color} on ${ground}`);
        }
      }
});

test("a brand's name is never lost on the scrim: a colour that doesn't read there gives way to cream", () => {
  const over = (accent) =>
    nodesOf(postLayout({ ...LAYOUT, accent })).find((n) => n.props?.style?.textTransform === "uppercase").props.style
      .color;
  assert.equal(over("#e8c156"), "#e8c156", "a colour that reads keeps its place");
  assert.equal(over("#1a3a5c"), "#faf5e8", "navy would vanish on black");
  assert.equal(over(null), "#faf5e8");
});

test("every layout draws in every shape with the words at either end, and the photo stands inside the page", () => {
  for (const layout of POST_LAYOUTS)
    for (const name of POST_SHAPES)
      for (const wordsAt of ["top", "bottom"]) {
        const shape = POST_SIZES[name];
        const box = postPhotoBox({ ...LAYOUT, layout, shape, wordsAt });
        assert.ok(box.left >= 0 && box.top >= 0, `${layout} ${name} ${wordsAt}`);
        assert.ok(box.left + box.width <= shape.width && box.top + box.height <= shape.height, "inside the page");
        assert.ok(box.height >= shape.height * 0.4, `${layout} ${name} ${wordsAt}: the photo is still the picture`);
        assert.ok(nodesOf(postLayout({ ...LAYOUT, layout, shape, wordsAt })).length > 3);
      }
});

test("the longest words a post may say still leave the photo most of the page, and a story's stay clear of its controls", () => {
  const most = {
    over: "o".repeat(32),
    line: "l ".repeat(30).trim(),
    under: "u ".repeat(40).trim(),
    act: "Book · (555) 010-0100",
  };
  for (const layout of ["band", "frame"])
    for (const name of POST_SHAPES) {
      const shape = POST_SIZES[name];
      const box = postPhotoBox({ ...LAYOUT, layout, shape, words: most });
      assert.ok(box.height >= shape.height * 0.4, `${layout} ${name}: ${box.height}`);
    }
  const story = postLayout({ ...LAYOUT, layout: "band", shape: POST_SIZES.story });
  const inner = nodesOf(story).find(
    (n) => typeof n.props?.style?.padding === "string" && n.props.style.padding.endsWith("340px"),
  );
  assert.ok(inner, "the words stand above the story's own controls");
});

test("a post's plan goes out as a person meant it: no spaces left from typing, and an empty part no part", () => {
  const plan = postPlanOf({ file_id: FILE, line: " Now booking ", over: "  ", under: "Soon " });
  assert.deepEqual(
    [postPlanTidied(plan).line, postPlanTidied(plan).over, postPlanTidied(plan).under],
    ["Now booking", null, "Soon"],
  );
});

test("every word a post says to a person is there in both languages", () => {
  const shapeOf = (o) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === "object" ? shapeOf(v) : typeof v]));
  assert.deepEqual(shapeOf(postWordsIn("es")), shapeOf(POST_WORDS));
  assert.equal(postWordsIn("en"), POST_WORDS);
});

test("what can't be drawn is one reading: the same words are refused to a person and to the model", () => {
  for (const [words, why] of [
    ["New floor 🎉", "character"],
    ["See harbor.com", "contact"],
    ["Call 555-010-0100", "number"],
    ["x".repeat(61), "long"],
  ]) {
    assert.equal(postUndrawable(words, POST_LIMITS.line), why, words);
    assert.ok(postWordsProblem(words, words, POST_LIMITS.line), `the model is told too: ${words}`);
  }
  assert.equal(
    postUndrawable("20% off, free consultation", POST_LIMITS.line),
    null,
    "a person's press is their word on the rest",
  );
});

test("only words over the photo soften it", () => {
  assert.deepEqual(POST_LAYOUTS.filter(wordsOverPhoto), ["over", "left"]);
});

/* ------------------------------------------------------------------------- the crop */

test("a crop is the largest piece of the shape the photo holds, never past its edge, and never tighter than it needs", () => {
  const wide = { width: 2000, height: 1000 };
  for (const name of POST_SHAPES) {
    const shape = POST_SIZES[name];
    const c = postCrop(wide, shape, null, "bottom");
    assert.equal(c.height, 1000, `${name}: as tall as the photo`);
    assert.ok(Math.abs(c.width / c.height - shape.width / shape.height) < 0.01, `${name}: its shape`);
    assert.ok(c.left >= 0 && c.left + c.width <= wide.width);
  }
  const tall = postCrop({ width: 800, height: 2000 }, POST_SIZES.square, null, "bottom");
  assert.deepEqual([tall.width, tall.height], [800, 800]);
});

test("a crop stands around what the photo is of, a little away from the words", () => {
  const photo = { width: 1000, height: 2000 };
  const subject = [0.4, 0.2, 0.6, 0.4];
  const atFoot = postCrop(photo, POST_SIZES.square, subject, "bottom");
  const atTop = postCrop(photo, POST_SIZES.square, subject, "top");
  assert.ok(atTop.top < atFoot.top, "words at the top leave it lower in the picture");
  const right = postCrop({ width: 2000, height: 1000 }, POST_SIZES.portrait, [0.8, 0.2, 1, 0.8], "bottom");
  assert.equal(right.left + right.width, 2000, "a subject at the edge takes the crop to the edge, and no further");
});

/* ------------------------------------------------------------------------- the composer, for real */

/** A busy photo: a checkerboard a sign would be, so softening shows. */
async function busyPhoto(width, height) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 235 : 40;
      raw.fill(v, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer();
}
/** How much a band of a picture varies: a sharp checkerboard a lot, one softened and darkened very little. */
async function variesIn(jpeg, top, height) {
  // stats() reads the input and not the pipeline, so the band is cut first.
  const band = await sharp(jpeg).extract({ left: 40, top, width: 1000, height }).greyscale().png().toBuffer();
  return (await sharp(band).stats()).channels[0].stdev;
}

test("every shape comes out its own size, a JPEG with nothing of the camera in it", async () => {
  const photo = await sharp(await busyPhoto(1600, 1200))
    .withExif({ IFD0: { Copyright: "phone" } })
    .toBuffer();
  for (const name of POST_SHAPES) {
    const shape = POST_SIZES[name];
    const out = await composePost({ ...LAYOUT, shape, photo, subject: null });
    const seen = await sharp(out).metadata();
    assert.deepEqual([seen.format, seen.width, seen.height], ["jpeg", shape.width, shape.height], name);
    assert.equal(seen.exif, undefined, `${name}: no camera data`);
    assert.ok(out.length < 1_000_000, `${name}: small enough to send`);
  }
});

test("a sign behind the words does not read through them, and the rest of the photo stays sharp", async () => {
  const photo = await busyPhoto(1600, 2000);
  const out = await composePost({ ...LAYOUT, words: { line: "Now booking" }, logo: null, photo, subject: null });
  const sharpTop = await variesIn(out, 300, 200);
  const underWords = await variesIn(out, 1300, 30);
  assert.ok(sharpTop > 40, `the photo stays itself away from the words (${sharpTop})`);
  assert.ok(underWords < sharpTop / 3, `under the words it is soft and dark (${underWords})`);
});

test("a band or a frame leaves the photo sharp, on a ground the words can stand on", async () => {
  const photo = await busyPhoto(1600, 2000);
  for (const [layout, ground] of [
    ["band", [232, 193, 86]],
    ["frame", [250, 245, 232]],
  ]) {
    const out = await composePost({ ...LAYOUT, layout, logo: null, photo, subject: null });
    const box = postPhotoBox({ ...LAYOUT, layout });
    assert.ok((await variesIn(out, box.top + 100, 200)) > 40, `${layout}: the photo is itself`);
    const foot = await sharp(out).extract({ left: 540, top: 1345, width: 2, height: 2 }).raw().toBuffer();
    for (const [i, want] of ground.entries())
      assert.ok(Math.abs(foot[i] - want) < 8, `${layout}: the ground is its colour (${[...foot.subarray(0, 3)]})`);
  }
});

test("a draft draws the same picture, for less time encoding it: only what is kept takes the slow road", async () => {
  const photo = await busyPhoto(1600, 2000);
  const kept = await composePost({ ...LAYOUT, photo, subject: null, draft: false });
  const draft = await composePost({ ...LAYOUT, photo, subject: null, draft: true });
  const [a, b] = await Promise.all([kept, draft].map((j) => sharp(j).metadata()));
  assert.deepEqual([b.format, b.width, b.height], [a.format, a.width, a.height]);
});

test("whatever a photo is kept as draws: black and white, with a clear ground, or in a printer's colours", async () => {
  const base = { width: 1200, height: 1200 };
  const photos = {
    grey: await sharp(await busyPhoto(1200, 1200))
      .greyscale()
      .jpeg()
      .toBuffer(),
    clear: await sharp({ create: { ...base, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.4 } } })
      .png()
      .toBuffer(),
    cmyk: await sharp(await busyPhoto(1200, 1200))
      .toColourspace("cmyk")
      .jpeg()
      .toBuffer(),
  };
  for (const [name, photo] of Object.entries(photos))
    for (const layout of POST_LAYOUTS) {
      const out = await composePost({ ...LAYOUT, layout, photo, subject: null, draft: true });
      const seen = await sharp(out).metadata();
      assert.deepEqual([seen.format, seen.width, seen.height], ["jpeg", 1080, 1350], `${name} ${layout}`);
    }
});

test("a photo on its side comes upright", async () => {
  const onItsSide = await sharp(await busyPhoto(1200, 800))
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const out = await composePost({ ...LAYOUT, shape: POST_SIZES.square, photo: onItsSide, subject: null });
  assert.deepEqual([(await sharp(out).metadata()).width, (await sharp(out).metadata()).height], [1080, 1080]);
});

/* ------------------------------------------------------------------------- what a post may say */

const OWNER = "Make a post for our fall special, 20% off balayage until Nov 30. Phone: (555) 010-0100";

test("the owner's own words pass, in either language", () => {
  for (const words of [
    "20% off balayage",
    "Fall special",
    "Ends Nov 30",
    "Come see the new floor.",
    "Ven a conocer el salón",
  ])
    assert.equal(postWordsProblem(words, OWNER, POST_LIMITS.line), null, words);
});

test("what the owner did not say is sent back: a price, a share, a number, money, a promise", () => {
  const owner = "Make a post about our new floor";
  const said = (w) => postWordsProblem(w, owner, POST_LIMITS.line);
  assert.match(said("Balayage from $45"), /price/);
  assert.match(said("20% off balayage"), /price or a share/);
  assert.match(said("Open 7 days"), /number 7/);
  assert.match(said("Discount this week"), /money/);
  assert.match(said("Free consultation"), /promise/);
  assert.match(said("Consulta gratis"), /promise/);
  assert.match(said("The best salon in Brooklyn"), /promise/);
  assert.match(said("Guaranteed results"), /promise/);
  assert.match(said("Hurry, limited spots"), /promise/);
  assert.equal(
    postWordsProblem("Free consultation", "We do a free consultation", POST_LIMITS.line),
    null,
    "theirs to promise",
  );
});

test("what can't go on a picture is sent back, whoever said it", () => {
  const said = (w) => postWordsProblem(w, w, POST_LIMITS.line);
  assert.match(said("See harbor.example"), /link/);
  assert.match(said("Follow @harbor"), /handle/);
  assert.match(said("Call (555) 010-0100"), /phone number/);
  assert.match(said("New floor 🎉"), /emoji/);
  assert.match(said("x".repeat(61)), /over 60/);
  assert.match(said("   "), /empty/);
});

test("a plan's problem names the part it is in, and a part left out has none", () => {
  assert.equal(postPlanProblem({ line: "Now booking", over: null, under: null }, ""), null);
  assert.match(postPlanProblem({ line: "Now booking", over: "Best in town", under: null }, ""), /^over:/);
  assert.match(postPlanProblem({ line: "Now booking", over: null, under: "x".repeat(81) }, ""), /^under:/);
});

test("a post is made from a photo: what waits, what already has words, and what Ask made are sent back", () => {
  assert.equal(postPhotoProblem({ status: "filed", source: "upload", shows: "work" }), null);
  assert.match(postPhotoProblem({ status: "inbox", source: "website", shows: "work" }), /Inbox/);
  assert.match(postPhotoProblem({ status: "filed", source: "upload", shows: "graphic" }), /already has words/);
  assert.match(postPhotoProblem({ status: "filed", source: "upload", shows: "logo" }), /already has words/);
  assert.match(postPhotoProblem({ status: "filed", source: "made", shows: "graphic" }), /already made/);
});

test("why a photo can't be a post is one reading: the model is told what to do about it, and a person is told in the post's language", () => {
  const cases = [
    [{ status: "filed", source: "made", shows: "graphic" }, "made"],
    [{ status: "inbox", source: "website", shows: "work" }, "unkept"],
    [{ status: "set_aside", source: "upload", shows: "work" }, "unkept"],
    [{ status: "filed", source: "upload", shows: "graphic" }, "design"],
    [{ status: "filed", source: "upload", shows: "logo" }, "design"],
    [{ status: "filed", source: "upload", shows: "work" }, null],
    [{ status: "filed", source: "upload", shows: null }, null],
  ];
  for (const [file, wont] of cases) {
    assert.equal(postPhotoWont(file), wont, JSON.stringify(file));
    assert.equal(postPhotoProblem(file) === null, wont === null, "the model hears of the same photos");
  }
  for (const language of ["en", "es"])
    for (const wont of ["made", "unkept", "design"])
      assert.ok(postWordsIn(language).photoWont[wont], `${language}: ${wont} is said to a person`);
  assert.notEqual(postWordsIn("es").photoWont.unkept, postWordsIn("en").photoWont.unkept);
});

test("a photo in Ask's scope is offered what it is good for, and a post to whoever may act, in the person's language", () => {
  const quiet = { needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false };
  const scope = { kind: "file", id: "f1", label: "Storefront" };
  const of = (language, canAct) => buildAskSuggestions({ ...quiet, surface: "settings", language, scope, canAct });
  assert.deepEqual(
    of("en", true)
      .slice(0, 2)
      .map((s) => s.q),
    [MAKE_POST_ASK.en, "What is this photo good for?"],
    "the scope's own come first, in what the Line shows when it opens: the sentence its sheet's press asks, then the question",
  );
  assert.deepEqual(
    of("es", true)
      .slice(0, 2)
      .map((s) => s.q),
    [MAKE_POST_ASK.es, "¿Para qué sirve esta foto?"],
  );
  assert.equal(of("en", true)[0].kind, "ask", "asked at once: there is nothing to finish, and the card is the press");
  assert.equal(of("en", false)[0].q, "What is this photo good for?", "a viewer is offered no card, only the question");
  assert.ok(!of("en", false).some((s) => s.q === MAKE_POST_ASK.en));
  assert.ok(
    !buildAskSuggestions({ ...quiet, surface: "settings", language: "en", canAct: true }).some(
      (s) => s.q === MAKE_POST_ASK.en,
    ),
    "with no photo in hand, no post is offered",
  );
});

/* ------------------------------------------------------------------------- the act */

const fileRow = (over = {}) => ({
  id: FILE,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "storefront-dusk",
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 900,
  look: { line: "A shopfront at dusk.", people: { count: 0, recognizable: 0 } },
  look_status: "done",
  shows: "storefront",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  ...over,
});

function askedOnce(input, { file = {}, question = OWNER, earlier = [], phone = "(555) 010-0100" } = {}) {
  const config = {
    brain: {
      business_name: "Harbor",
      system_prompt: "Answer as the front desk of Harbor: brief and warm, never a price.",
      fallbacks: { greeting: "g", error: "e", non_text: "n" },
      ...(phone ? { phone_display: phone } : {}),
    },
  };
  const tables = {
    files: [fileRow(file)],
    memberships: [],
    tenants: [{ id: A, name: "Harbor", slug: "harbor", timezone: TZ, status: "active" }],
    tenant_config: [{ tenant_id: A, config, version: 1 }],
  };
  const ctx = { supabase: fakeDb(tables, {}, {}), userId: USER, email: "ada@example.com", params: {} };
  const tc = {
    ...newToolContext(ctx, A, "owner", TZ, new Date("2026-11-05T12:00:00Z")),
    question,
    askedEarlier: earlier,
    language: "en",
  };
  return buildProposal(tc, "propose_post", {
    file: "storefront-dusk",
    line: "20% off balayage",
    book: true,
    words_at: "bottom",
    voice: "classic",
    ...input,
  });
}

/** The edge's door as the act knocks it: the drawn post is decoded, so it must be a real JPEG, and comes back as a copy at its size. */
const doorKnocks = [];
let doorHolds = true;
/** And as a video's moment is asked of it: whether it cuts one, and whether one has been cut into the folder. */
const frameKnocks = [];
let frameCuts = true;
let frameCut = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/files/copies")) return realFetch(input, init);
  const body = JSON.parse(init.body);
  if (body.frames) {
    frameKnocks.push({ tenant_id: body.tenant_id, frames: body.frames });
    frameCut = frameCuts;
    return new Response(
      JSON.stringify({
        ok: true,
        copies: [],
        frames: body.frames.map((f) =>
          frameCuts ? { key: f.key, kept: true, width: 1080, height: 1920 } : { key: f.key, kept: false, wont: "no" },
        ),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  const pictures = [];
  for (const p of body.pictures ?? []) {
    const meta = await sharp(Buffer.from(p.bytes, "base64")).metadata();
    doorKnocks.push({
      key: p.key,
      mime: p.mime,
      name: p.name,
      format: meta.format,
      width: meta.width,
      height: meta.height,
    });
    pictures.push(
      doorHolds
        ? { key: p.key, file_id: "file_post", width: meta.width, height: meta.height }
        : { key: p.key, file_id: null, width: null, height: null },
    );
  }
  return new Response(JSON.stringify({ ok: true, copies: [], pictures }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

/** A photo in Storage, as the service reads it to draw: made when first asked for, never by a top-level await after the tests. */
let stored = null;
const storedOf = () => (stored ??= busyPhoto(1600, 1200));
function photoInStorage() {
  const service = fakeDb({ files: [] }, {}, {});
  service.storage = { from: () => ({ download: async () => ({ data: new Blob([await storedOf()]), error: null }) }) };
  setServiceClient(service);
}

/** The act as a turn runs it: the first call draws the post for a look, and the second, with the look's key, makes the card. */
async function asked(input, opts) {
  photoInStorage();
  const first = await askedOnce(input, opts);
  if (first.proposal || first.isError) return first;
  return askedOnce({ ...input, looked: JSON.parse(first.result).look_key }, opts);
}

test("a card from the owner's words: the photo by its id, and the plan its Save will draw", async () => {
  const out = await asked({ over: "Fall special", under: "Ends Nov 30" });
  assert.equal(out.proposal?.kind, "post", out.result);
  assert.equal(out.proposal.needs, "partner");
  assert.equal(out.proposal.title, "Post: 20% off balayage");
  assert.deepEqual(postPlanOf(out.proposal.payload), {
    file_id: FILE,
    line: "20% off balayage",
    over: "Fall special",
    under: "Ends Nov 30",
    book: true,
    words_at: "bottom",
    voice: "classic",
    layout: "over",
    language: "en",
    people_agreed: false,
    at: null,
  });
});

test("the words may rest on what they said earlier in the thread, and on what they wrote in Settings", async () => {
  const later = await asked({ book: false }, { question: "use the other photo", earlier: [OWNER] });
  assert.equal(later.proposal?.kind, "post", later.result);
  const none = await asked({ book: false }, { question: "use the other photo" });
  assert.equal(none.proposal, null);
  assert.match(none.refusal, /price or a share/);
  const settings = await asked({ line: "Call the 555 line", book: false }, { question: "make a post" });
  assert.equal(settings.proposal?.kind, "post", "their Settings say 555");
});

test("a morning's question is Ask's own, so it lends the words nothing", async () => {
  const { ASK_MORNING_QUESTION } = await import(at("packages/contracts/src/ask/ask-morning.ts")).catch(() => ({}));
  if (!ASK_MORNING_QUESTION) return;
  const out = await asked({ line: "20% off balayage", book: false }, { question: ASK_MORNING_QUESTION });
  assert.equal(out.proposal, null);
});

test("the act refuses what it should, each in words the model can act on", async () => {
  assert.match((await asked({ file: "no-such" })).refusal, /no file named no-such/);
  assert.match((await asked({}, { file: { status: "inbox" } })).refusal, /Inbox/);
  assert.match((await asked({}, { file: { shows: "graphic" } })).refusal, /already has words/);
  assert.match((await asked({}, { phone: null })).refusal, /no phone number/);
  assert.match((await asked({ line: "Free balayage" })).refusal, /^line: .*promise/);
});

test("someone recognizable waits for the owner's word, and that word goes with the card", async () => {
  const face = { look: { line: "A client in the chair.", people: { count: 1, recognizable: 1 } } };
  const held = await asked({}, { file: face });
  assert.match(held.refusal, /recognizable/);
  const said = await asked({ people_agreed: true }, { file: face });
  assert.equal(said.proposal.payload.people_agreed, true);
  const agreed = await asked({}, { file: { ...face, who_in_it: "agreed" } });
  assert.equal(agreed.proposal?.kind, "post", "already said");
});

/* ------------------------------------------------------------------- from a video */

const VIDEO = {
  name: "salon-tour",
  mime: "video/mp4",
  kind: "video",
  width: 1080,
  height: 1920,
  seconds: 24,
  media_status: "ready",
  shows: "interior",
  look: { line: "A walk through the salon.", people: { count: 0, recognizable: 0 }, poster_at: 4.25 },
};
const fromVideo = (input, file = {}) => asked({ file: "salon-tour", ...input }, { file: { ...VIDEO, ...file } });
/** Storage as a video's folder stands: no still of the moment until the edge has cut one. */
function frameNotCutYet() {
  const service = fakeDb({ files: [] }, {}, {});
  const read = [];
  service.storage = {
    from: () => ({
      download: async (p) => {
        read.push(p);
        return frameCut
          ? { data: new Blob([await storedOf()]), error: null }
          : { data: null, error: { message: "no" } };
      },
    }),
  };
  setServiceClient(service);
  return read;
}

test("a post from a video is drawn from one moment of it: the act asks which, holds it inside the clip, and the card's plan carries it", async () => {
  assert.match((await fromVideo({})).refusal, /^salon-tour: it is a video, and a post is drawn from one moment of it/);
  assert.match((await fromVideo({ at: "0:40" })).refusal, /inside the clip/);
  assert.match((await fromVideo({ at: "soon" })).refusal, /call again with at set to that moment/);
  assert.match((await fromVideo({ at: 3 }, { media_status: "processing" })).refusal, /still being made ready/);
  const out = await fromVideo({ at: "0:12.5" });
  assert.equal(out.proposal?.kind, "post", out.result);
  assert.equal(postPlanOf(out.proposal.payload).at, 12.5);
  assert.equal(postPlanOf(out.proposal.payload).file_id, FILE);
  const photo = await asked({ at: "0:03" });
  assert.equal(postPlanOf(photo.proposal.payload).at, null, "a photo has no moment, whatever is named for it");
});

test("the moment is read from the video's own folder, and cut by the edge only where it is not there yet", async () => {
  frameKnocks.length = 0;
  frameCut = false;
  doorKnocks.length = 0;
  const read = frameNotCutYet();
  const first = await askedOnce({ file: "salon-tour", at: 12.5 }, { file: VIDEO });
  assert.equal(first.isError, false, first.result);
  assert.equal(JSON.parse(first.result).drawn, true);
  assert.deepEqual(frameKnocks, [{ tenant_id: A, frames: [{ key: "one", id: FILE, at: 12.5 }] }]);
  assert.deepEqual(read, [`${A}/${FILE}/frame-1250.jpg`, `${A}/${FILE}/frame-1250.jpg`], "asked for, cut, read");
  assert.equal(doorKnocks.at(-1).name, "salon-tour-post.jpg", "and the post drawn from it is shown to Ask");
  frameCut = false;
  frameCuts = false;
  try {
    frameNotCutYet();
    const other = await askedOnce({ file: "salon-tour", at: 20 }, { file: VIDEO });
    assert.match(other.refusal ?? other.result, /salon-tour/);
    assert.equal(other.proposal, null, "a moment that could not be cut makes no card");
  } finally {
    frameCuts = true;
  }
});

/* ------------------------------------------------------------------------- the card */

const CARD = {
  id: "c1",
  payload: { file_id: FILE, line: "Now booking", words_at: "top", voice: "modern", language: "es" },
};

test("a card's plan reads back the same, and what it does not hold it does not invent", () => {
  assert.deepEqual(postPlanOf(CARD.payload), {
    file_id: FILE,
    line: "Now booking",
    over: null,
    under: null,
    book: false,
    words_at: "top",
    voice: "modern",
    layout: "over",
    language: "es",
    people_agreed: false,
    at: null,
  });
});

test("Save is one call, and its Undo takes back only what that press made", () => {
  const call = postSpec.commit(CARD, { settings: null });
  assert.equal(call.route, "POST files/post");
  assert.deepEqual(call.body, postPlanOf(CARD.payload));
  const made = { file_id: "f2", name: "now-booking", twin: false };
  assert.equal(postSpec.receipt(CARD, made), "Guardada en Archivos como now-booking", "in the post's own language");
  assert.equal(postSpec.receipt({ payload: { language: "en" } }, made), "Saved to Files as now-booking");
  assert.equal(postSpec.undo.label(CARD), "Deshacer");
  assert.equal(postSpec.made(CARD, made), "f2");
  assert.deepEqual(postSpec.undo.record(CARD, made, { settings: null }), {
    file_id: "f2",
    language: "es",
    plan: postPlanOf(CARD.payload),
  });
  assert.equal(postSpec.undo.receipt({}, { language: "es" }), "Quitada de Archivos");
  assert.equal(postSpec.undo.record(CARD, { ...made, twin: true }, { settings: null }), null, "it was already there");
  const undo = postSpec.undo.call({ file_id: "f2" }, { settings: null });
  assert.deepEqual([undo.route, undo.params.id, undo.goneIsDone], ["DELETE files/[id]", "f2", true]);
});

/* ------------------------------------------------------------------------- as a file */

test("a made file's shapes sit in its folder, so deleting it lets them all go", () => {
  assert.deepEqual(
    POST_SHAPES.map((s) => postPathOf(A, FILE, s)),
    [`${A}/${FILE}/original.jpg`, `${A}/${FILE}/square.jpg`, `${A}/${FILE}/story.jpg`],
  );
});

test("what Ask made stands on a shelf of its own, unless a person moved it", () => {
  assert.equal(shelfOf({ status: "filed", shows: "graphic", source: "made" }), "made");
  assert.equal(shelfOf({ status: "set_aside", shows: "graphic", source: "made" }), "set_aside");
  assert.equal(shelfOf({ status: "filed", shows: "graphic", source: "upload" }), "brand");
});

test("Ask looks at the post before it offers it: the first call draws it and shows it, and the card waits for the look's key", async () => {
  photoInStorage();
  doorKnocks.length = 0;
  const first = await askedOnce({ over: "Fall special" });
  assert.equal(first.proposal, null);
  assert.equal(first.isError, false);
  const said = JSON.parse(first.result);
  assert.equal(said.drawn, true);
  assert.match(said.look_key, /^[0-9a-f]{10}$/);
  assert.match(said.note, /call again with looked/);
  assert.deepEqual(first.pictures, [
    { name: "storefront-dusk", what: "The post drawn from storefront-dusk", fileId: "file_post", size: [1080, 1350] },
  ]);
  assert.deepEqual(doorKnocks, [
    { key: "one", mime: "image/jpeg", name: "storefront-dusk-post.jpg", format: "jpeg", width: 1080, height: 1350 },
  ]);
  const second = await askedOnce({ over: "Fall special", looked: said.look_key });
  assert.equal(second.proposal?.kind, "post", second.result);
  assert.equal(postPlanOf(second.proposal.payload).over, "Fall special");
  const changed = await askedOnce({ over: "Autumn special", looked: said.look_key });
  assert.equal(changed.proposal, null);
  assert.match(changed.refusal, /changed since you looked/);
  assert.equal(doorKnocks.length, 1, "a key that is not the plan's draws nothing");
});

test("a post that could not be shown is still the owner's to have: the card is made on the key, and the model is told to say it could not check it", async () => {
  photoInStorage();
  doorHolds = false;
  try {
    const first = await askedOnce({});
    const said = JSON.parse(first.result);
    assert.equal(said.could_not_show, true);
    assert.equal(first.pictures, undefined);
    const second = await askedOnce({ looked: said.look_key });
    assert.equal(second.proposal?.kind, "post", second.result);
  } finally {
    doorHolds = true;
  }
});
