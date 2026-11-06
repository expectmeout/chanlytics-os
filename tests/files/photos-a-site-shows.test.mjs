/**
 * The photographs a page shows (core look/site-photos.ts, decision 0099), read from its markup: the one it declares for
 * sharing first, each at the widest it offers, and what is plainly not a photograph spared the read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { SITE_PHOTOS_MAX, sitePhotosFrom } = await importSrc("packages/core/src/look/site-photos.ts");

const PAGE = "https://harbor.example/services/";

test("the picture a page declares comes first, then those it draws, made whole", () => {
  const html = `<meta property="og:image" content="/hero.jpg"><img src="work/one.jpg"><img src="https://cdn.example/two.webp?x=1&amp;y=2">`;
  assert.deepEqual(sitePhotosFrom(html, PAGE), [
    "https://harbor.example/hero.jpg",
    "https://harbor.example/services/work/one.jpg",
    "https://cdn.example/two.webp?x=1&y=2",
  ]);
});

test("the widest a srcset offers is the one asked for, and a late-loading picture's real address", () => {
  const html = `<img src="small.jpg" srcset="a-480.jpg 480w, a-1600.jpg 1600w, a-800.jpg 800w"><img src="blank.png" data-src="/late.jpg">`;
  assert.deepEqual(sitePhotosFrom(html, "https://harbor.example/"), [
    "https://harbor.example/a-1600.jpg",
    "https://harbor.example/late.jpg",
  ]);
});

test("a vector, an animation, an icon and a logo are passed over by their address", () => {
  const html = [
    "a.svg",
    "b.gif",
    "favicon.ico",
    "assets/logo.png",
    "icons/star.png",
    "sprite-1.png",
    "site-logo-dark.jpg",
  ]
    .map((s) => `<img src="/${s}">`)
    .join("");
  assert.deepEqual(sitePhotosFrom(html, PAGE), []);
});

test("a word that only holds one of those is no reason to pass a photo over", () => {
  assert.deepEqual(
    sitePhotosFrom(`<img src="/catalogue-page.jpg"><img src="/lexicon.jpg">`, "https://harbor.example/"),
    ["https://harbor.example/catalogue-page.jpg", "https://harbor.example/lexicon.jpg"],
  );
});

test("a picture that says it is small is passed over, and one that says nothing is read", () => {
  const html = `<img src="/thumb.jpg" width="80"><img src="/wide.jpg" width="1200"><img src="/unsaid.jpg">`;
  assert.deepEqual(sitePhotosFrom(html, "https://harbor.example/"), [
    "https://harbor.example/wide.jpg",
    "https://harbor.example/unsaid.jpg",
  ]);
});

test("an address is decoded as a browser decodes it, so a WordPress site's picture is not asked for wrongly", () => {
  assert.deepEqual(sitePhotosFrom(`<img src="/a.jpg?w=1800&#038;h=1200">`, "https://harbor.example/"), [
    "https://harbor.example/a.jpg?w=1800&h=1200",
  ]);
  assert.deepEqual(
    sitePhotosFrom(`<meta content="/o.jpg?a=1&amp;b=2" property="og:image">`, "https://harbor.example/"),
    ["https://harbor.example/o.jpg?a=1&b=2"],
  );
});

test("a section's painted picture is offered after the shared one and before the drawn ones, so the cap keeps a hero", () => {
  const page = `
    <img src="/first.jpg">
    <section style="color:red; background-image:url(&quot;/hero.jpg&quot;)">x</section>
    <div style='background: #000 url(/second.jpg) no-repeat'>y</div>
    <meta property="og:image" content="/shared.jpg">`;
  assert.deepEqual(sitePhotosFrom(page, "https://harbor.example/"), [
    "https://harbor.example/shared.jpg",
    "https://harbor.example/hero.jpg",
    "https://harbor.example/second.jpg",
    "https://harbor.example/first.jpg",
  ]);
  const many = Array.from({ length: 40 }, (_, i) => `<img src="/p${i}.jpg">`).join("");
  assert.ok(
    sitePhotosFrom(`${many}<div style="background-image:url(/hero.jpg)"></div>`, PAGE).some((u) =>
      u.endsWith("/hero.jpg"),
    ),
  );
});

test("a style that paints nothing, or paints a gradient, offers nothing", () => {
  assert.deepEqual(
    sitePhotosFrom(
      `<div style="color:red"></div><div style="background:linear-gradient(red,blue)"></div><div style="background-image:url(/icon.svg)"></div>`,
      "https://harbor.example/",
    ),
    [],
  );
});

test("a width in percent says nothing of how small a picture is", () => {
  assert.deepEqual(sitePhotosFrom(`<img src="/hero.jpg" width="100%">`, "https://harbor.example/"), [
    "https://harbor.example/hero.jpg",
  ]);
});

test("nothing but the public web is an address, and a page offers each once, within its number", () => {
  assert.deepEqual(
    sitePhotosFrom(
      `<img src="data:image/png;base64,AAAA"><img src="javascript:alert(1)"><img src="file:///a.jpg">`,
      PAGE,
    ),
    [],
  );
  assert.deepEqual(sitePhotosFrom(`<img src="/a.jpg"><img src="/a.jpg">`, "https://harbor.example/"), [
    "https://harbor.example/a.jpg",
  ]);
  const many = Array.from({ length: 40 }, (_, i) => `<img src="/p${i}.jpg">`).join("");
  assert.equal(sitePhotosFrom(many, PAGE).length, SITE_PHOTOS_MAX);
});
