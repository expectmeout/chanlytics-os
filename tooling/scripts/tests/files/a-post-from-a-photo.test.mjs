/**
 * A post made from a photo, by code (decision 0099, step 3). The layout is arithmetic a test can hold; the real composer draws real
 * pixels; the act holds the words to what the owner said; and its card shows one press whose Undo takes back only what it made.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");

const { POST_SIZES, SCRIM_UNDER_WORDS, inkOn, lineSizeOf, postCrop, postLayout } = await import(
  at("apps/dashboard/src/server/files/post/layout.ts")
);
const { composePost } = await import(at("apps/dashboard/src/server/files/post/compose.ts"));
const { postPathOf, postPhotoProblem, postPlanProblem, postWordsProblem } = await import(
  at("packages/contracts/src/files/post-check.ts")
);
const { POST_LIMITS, POST_SHAPES, postPlanOf } = await import(at("packages/contracts/src/files/post.ts"));
const { postSpec } = await import(at("packages/contracts/src/ask-proposals/post.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { shelfOf } = await import(at("packages/contracts/src/files/files.ts"));

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
  assert.equal(band.props.style.color, "#0d0b09");
});

test("words are ink on a colour that needs it, white on one that does not", () => {
  assert.equal(inkOn("#e8c156"), "#0d0b09");
  assert.equal(inkOn("#1a3a5c"), "#ffffff");
});

test("a short line is the picture's headline, a long one still reads", () => {
  const sizes = ["Now booking", "20% off balayage all week", "Your new favourite chair is open today", "x".repeat(60)];
  const big = sizes.map((l) => lineSizeOf(l, "classic"));
  assert.deepEqual(
    big,
    [...big].sort((a, b) => b - a),
  );
  assert.ok(big.at(-1) >= 50, "never below what a phone reads");
  assert.ok(lineSizeOf("Now booking", "modern") < lineSizeOf("Now booking", "classic"), "a heavy sans stands smaller");
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
  assert.match(said("See melanys.com"), /link/);
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

function asked(input, { file = {}, question = OWNER, earlier = [], phone = "(555) 010-0100" } = {}) {
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
    language: "en",
    people_agreed: false,
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
    language: "es",
    people_agreed: false,
  });
});

test("Save is one call, its Undo takes back only what that press made, and Files reads again either way", () => {
  const call = postSpec.commit(CARD, { settings: null });
  assert.equal(call.route, "POST files/post");
  assert.deepEqual(call.body, postPlanOf(CARD.payload));
  assert.deepEqual(call.events, [{ type: "surface:files" }]);
  const made = { file_id: "f2", name: "now-booking", twin: false };
  assert.equal(postSpec.receipt(CARD, made), "Saved to Files as now-booking");
  assert.equal(postSpec.made(CARD, made), "f2");
  assert.deepEqual(postSpec.undo.record(CARD, made, { settings: null }), { file_id: "f2" });
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
