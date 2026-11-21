/**
 * Meta's own preview of an ad not yet made, on the wire (packages/channels/src/ads/meta-preview.ts): the read that asks
 * the ad account for one version in one place, and what Meta's answer says. Pure: every request is built and read here
 * and none is sent, over Meta's request and answer as its pages document them (read 21 November 2026).
 *
 * What must hold. It is a read of the ad account, with the token and its proof, that makes nothing: no dry run, no key,
 * no picture placed in the library. The creative is the one Turn on makes (the Page, the words, the WhatsApp button,
 * every one of Meta's own changes switched off, Facebook alone), with the picture given by its address. Each place is
 * Meta's own name for it on a phone. And nothing of Meta's HTML is kept but the address of its own preview page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const {
  META_PREVIEW_PLACES,
  metaPreviewFrameSrc,
  metaPreviewNamedSize,
  metaPreviewRequest,
  metaPreviewShape,
  parseMetaPreview,
} = await import(at("packages/channels/src/ads/meta-preview.ts"));
const { META_OWN_CHANGES, metaCreativeSpec } = await import(at("packages/channels/src/ads/meta-make.ts"));

const TOKEN = "token-for-this-file";
const SECRET = "app-secret-for-this-file";
const PROOF = createHmac("sha256", SECRET).update(TOKEN).digest("hex");
const ACCOUNT = "1200000000000042";
const PAGE = "100000000000077";
const PICTURE = "https://project.example.com/storage/v1/object/sign/files/one.png?token=signed-for-a-day";
const ASK = {
  accountId: ACCOUNT,
  pageId: PAGE,
  text: "A first appointment at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  headline: "First appointment",
  pictureUrl: PICTURE,
  place: "feed",
};
const FRAME = "https://www.facebook.com/ads/api/preview_iframe.php?d=AQKuwYcWpyFgVKLO&t=AQJws9t";
/** Meta's answer, as its pages show one: the frame's HTML in `body`, its address escaped as HTML escapes it. */
const answerWith = (body) => ({ data: [{ body }] });
const META_BODY = `<iframe src="${FRAME.replace("&", "&amp;")}" width="335" height="580" scrolling="yes" style="border: none;"></iframe>`;

test("a preview is a read of the ad account, with the token and its proof, that makes nothing", () => {
  const request = metaPreviewRequest(TOKEN, SECRET, ASK);
  assert.equal(request.method, "GET");
  assert.equal(request.body, undefined, "nothing is posted");
  assert.equal(request.headers?.["X-Client-Idempotent-Key"], undefined, "a read carries no key of a make");
  const url = new URL(request.url);
  assert.match(url.pathname, new RegExp(`/v\\d+\\.\\d+/act_${ACCOUNT}/generatepreviews$`));
  assert.equal(url.searchParams.get("access_token"), TOKEN);
  assert.equal(url.searchParams.get("appsecret_proof"), PROOF);
  assert.equal(url.searchParams.get("execution_options"), null, "not a dry run of a make: a read");
});

test("each place is Meta's own name for its preview on a phone: the feed, stories and Reels, as Turn on names them", () => {
  assert.deepEqual(META_PREVIEW_PLACES, ["feed", "story", "reel"]);
  const formatOf = (place) =>
    new URL(metaPreviewRequest(TOKEN, SECRET, { ...ASK, place }).url).searchParams.get("ad_format");
  assert.deepEqual(META_PREVIEW_PLACES.map(formatOf), [
    "MOBILE_FEED_STANDARD",
    "FACEBOOK_STORY_MOBILE",
    "FACEBOOK_REELS_MOBILE",
  ]);
});

test("the creative is the one Turn on makes, its picture given by its address and nothing placed in the library", () => {
  const creative = JSON.parse(new URL(metaPreviewRequest(TOKEN, SECRET, ASK).url).searchParams.get("creative"));
  const story = creative.object_story_spec;
  assert.equal(story.page_id, PAGE);
  assert.equal(story.instagram_user_id, undefined, "Facebook alone, as Turn on makes it");
  assert.deepEqual(story.link_data, {
    link: "https://api.whatsapp.com/send",
    message: ASK.text,
    name: ASK.headline,
    picture: PICTURE,
    call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
  });
  assert.equal(story.link_data.image_hash, undefined, "no picture of the account's library");
  // Every one of Meta's own changes switched off, as on the ad itself, so the preview is what would run.
  const own = creative.degrees_of_freedom_spec.creative_features_spec;
  assert.deepEqual(Object.keys(own).sort(), [...META_OWN_CHANGES].sort());
  assert.ok(Object.values(own).every((one) => one.enroll_status === "OPT_OUT"));
  assert.deepEqual(creative.contextual_multi_ads, { enroll_status: "OPT_OUT" });
  // The same creative as a make's, but for the picture.
  const made = metaCreativeSpec({
    name: creative.name,
    pageId: PAGE,
    instagramUserId: null,
    text: ASK.text,
    headline: ASK.headline,
    picture: { kind: "image", hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90" },
  });
  const { picture: _picture, ...previewed } = story.link_data;
  const { image_hash: _hash, ...madeData } = made.object_story_spec.link_data;
  assert.deepEqual(previewed, madeData);
  assert.deepEqual(creative.degrees_of_freedom_spec, made.degrees_of_freedom_spec);
});

test("a picture's address that is not https, or words Meta would refuse, build no request", () => {
  assert.throws(() => metaPreviewRequest(TOKEN, SECRET, { ...ASK, pictureUrl: "http://project.example.com/one.png" }));
  assert.throws(() => metaPreviewRequest(TOKEN, SECRET, { ...ASK, pictureUrl: "not an address" }));
  assert.throws(() => metaPreviewRequest(TOKEN, SECRET, { ...ASK, text: "  " }));
  assert.throws(() => metaPreviewRequest(TOKEN, SECRET, { ...ASK, headline: "x".repeat(256) }));
  assert.throws(() => metaPreviewRequest(TOKEN, SECRET, { ...ASK, pageId: "a page" }));
});

test("Meta's answer: the address of its own preview page, read out of its HTML, and the size to frame it at", () => {
  // The feed's page is as tall as its ad, 628 on a real account where Meta named its frame 335 × 450 and cut off the
  // headline and the button (21 November 2026): the frame is as wide as Meta wrote and never shorter than 650.
  assert.deepEqual(parseMetaPreview(answerWith(META_BODY), "feed"), { src: FRAME, width: 335, height: 650 });
  const named = (width, height) => `<iframe src="${FRAME}" width="${width}" height="${height}"></iframe>`;
  assert.deepEqual(parseMetaPreview(answerWith(named(335, 450)), "feed"), { src: FRAME, width: 335, height: 650 });
  assert.deepEqual(parseMetaPreview(answerWith(named(360, 720)), "feed"), { src: FRAME, width: 360, height: 720 });
  // An address written plainly reads the same; a size Meta did not write, or one that is not one, is the page's own.
  const plain = `<iframe src="${FRAME}" scrolling="yes"></iframe>`;
  assert.deepEqual(parseMetaPreview(answerWith(plain), "feed"), { src: FRAME, width: 320, height: 650 });
  const odd = `<iframe src="${FRAME}" width="wide" height="9"></iframe>`;
  assert.deepEqual(parseMetaPreview(answerWith(odd), "feed"), { src: FRAME, width: 320, height: 650 });
});

test("the size Meta wrote on its frame is said for the log as it came, with nothing of its address", () => {
  assert.equal(metaPreviewNamedSize(answerWith(META_BODY)), "335x580");
  assert.equal(metaPreviewNamedSize(answerWith(`<iframe src="${FRAME}" height="213"></iframe>`)), "?x213");
  assert.equal(metaPreviewNamedSize(answerWith(`<iframe src="${FRAME}"></iframe>`)), "?x?");
  assert.equal(metaPreviewNamedSize({ data: [] }), "?x?");
  assert.equal(metaPreviewNamedSize(null), "?x?");
});

test("a story's and a Reel's frame is never smaller than Meta's page draws them, whatever size Meta names", () => {
  // Meta's page draws a Reel 320 × 567 and a story 320 × 568. On a real account it named the Reel's frame 274 × 213,
  // which showed the top of the ad alone, and the story's 320 × 567, which drew scroll bars over it (21 November 2026).
  const named = (width, height) => `<iframe src="${FRAME}" width="${width}" height="${height}"></iframe>`;
  const reel = parseMetaPreview(answerWith(named(274, 213)), "reel");
  assert.deepEqual(reel, { src: FRAME, width: 320, height: 567 });
  assert.deepEqual(parseMetaPreview(answerWith(named(320, 567)), "story"), { src: FRAME, width: 320, height: 568 });
  // A size Meta names larger is kept, and one it names not at all is the page's own.
  assert.deepEqual(parseMetaPreview(answerWith(named(360, 640)), "reel"), { src: FRAME, width: 360, height: 640 });
  const unnamed = `<iframe src="${FRAME}"></iframe>`;
  assert.deepEqual(parseMetaPreview(answerWith(unnamed), "story"), { src: FRAME, width: 320, height: 568 });
  assert.deepEqual(parseMetaPreview(answerWith(unnamed), "reel"), { src: FRAME, width: 320, height: 567 });
});

test("anything but a frame of Meta's own preview page is refused, and nothing of it is drawn", () => {
  const elsewhere = [
    `<iframe src="https://example.com/ads/api/preview_iframe.php?d=AQK"></iframe>`,
    `<iframe src="http://www.facebook.com/ads/api/preview_iframe.php?d=AQK"></iframe>`,
    `<iframe src="https://www.facebook.com/login.php?d=AQK"></iframe>`,
    `<iframe src="https://www.facebook.com/ads/api/preview_iframe.php"></iframe>`,
    `<iframe src="javascript:alert(1)"></iframe>`,
    `<script>alert(1)</script>`,
  ];
  for (const body of elsewhere) assert.throws(() => parseMetaPreview(answerWith(body), "feed"), /not a frame/, body);
  assert.equal(metaPreviewFrameSrc("https://www.facebook.com.example.com/ads/api/preview_iframe.php?d=1"), null);
  assert.equal(metaPreviewFrameSrc(FRAME), FRAME);
});

test("an answer with no preview says Meta's own words where it gave some", () => {
  assert.throws(() => parseMetaPreview({ data: [] }, "feed"), /did not answer a preview/);
  assert.throws(
    () => parseMetaPreview({ error: { message: "Invalid parameter", code: 100 } }, "feed"),
    /Invalid parameter/,
  );
  assert.throws(() => parseMetaPreview(null, "feed"), /did not answer a preview/);
});

test("Meta's answer read in every shape it may come in: escaped, in single quotes, with no scheme, or on Meta's other hosts", () => {
  const frame = { src: FRAME, width: 335, height: 650 };
  // The tag itself escaped, as some answers carry HTML.
  const escaped = META_BODY.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  assert.deepEqual(parseMetaPreview(answerWith(escaped), "feed"), frame);
  // Single quotes, and space around the equals sign.
  const single = `<iframe src = '${FRAME.replace("&", "&amp;")}' width='335' height='580'></iframe>`;
  assert.deepEqual(parseMetaPreview(answerWith(single), "feed"), frame);
  // An address with no scheme of its own is taken over https.
  const bare = `<iframe src="${FRAME.replace("https:", "")}" width="335" height="580"></iframe>`;
  assert.deepEqual(parseMetaPreview(answerWith(bare), "feed"), frame);
  // Meta's preview page on its other hosts, each one New ad's page lets a frame open.
  for (const host of ["web.facebook.com", "business.facebook.com"]) {
    const there = FRAME.replace("www.facebook.com", host);
    assert.equal(parseMetaPreview(answerWith(`<iframe src="${there}"></iframe>`), "feed").src, there, host);
  }
  // Never any other host, a port, or plain http.
  for (const odd of [
    FRAME.replace("www.facebook.com", "m.facebook.com"),
    FRAME.replace("www.facebook.com", "www.facebook.com:8443"),
    FRAME.replace("https:", "http:"),
  ])
    assert.equal(metaPreviewFrameSrc(odd), null, odd);
});

test("an answer that can't be read is described for the log with no address and no value in it", () => {
  const described = (json) => metaPreviewShape(json);
  assert.equal(described({ error: { message: "x" } }), "no data; keys error");
  assert.equal(described({ data: [] }), "data 0; first holds nothing");
  assert.equal(described({ data: [{ html: "<div></div>" }] }), "data 1; first holds html");
  assert.equal(described(answerWith("<div>Preview</div>")), "data 1; body 18 chars, div, no src");
  const elsewhere = '<iframe src="https://example.com/ads/x.php?d=SECRET&amp;t=ALSO"></iframe>';
  const said = described(answerWith(elsewhere));
  assert.equal(said, "data 1; iframe src https://example.com/ads/x.php params d,t");
  assert.ok(!/SECRET|ALSO/.test(said), "no value of the address is said");
  assert.equal(
    described(answerWith(META_BODY)),
    "data 1; iframe src https://www.facebook.com/ads/api/preview_iframe.php params d,t",
  );
});
