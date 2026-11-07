/**
 * The first mark a page declares that is a picture worth keeping (core look/found-logo.ts, decision 0075): shared by
 * the Logo row's lookup and the website read, so both take the same picture from the same page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { LOGO_TRIES, askableMark, markFits, findSiteLogo } = await importSrc("packages/core/src/look/found-logo.ts");

/** A PNG's first bytes, saying its size: all the header read looks at. */
function pngHead(w, h) {
  const b = Buffer.alloc(64);
  b.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return new Uint8Array(b);
}

const SITE = "https://harbor.example";

/** The images a test serves by address, and what was asked for. */
function images(byUrl) {
  const asked = [];
  return {
    asked,
    image: async (url) => {
      asked.push(url);
      return byUrl[url] ?? null;
    },
  };
}

test("a candidate is asked for only when it could be a picture: not a vector, not a favicon file, not an odd port", () => {
  assert.equal(askableMark(`${SITE}/apple-touch-icon.png`), true);
  assert.equal(askableMark(`${SITE}/logo.svg`), false);
  assert.equal(askableMark(`${SITE}/favicon.ico`), false);
  assert.equal(askableMark(`${SITE}:8443/logo.png`), false);
  assert.equal(askableMark("not a url"), false);
  assert.equal(markFits({ kind: "png", width: 180, height: 180, contentType: "image/png" }), true);
  assert.equal(markFits({ kind: "png", width: 64, height: 64, contentType: "image/png" }), false, "too small");
  assert.equal(markFits({ kind: "png", width: 2049, height: 400, contentType: "image/png" }), false, "a poster");
  assert.equal(markFits({ kind: "ico", width: 180, height: 180, contentType: "image/x-icon" }), false);
});

test("the first mark the page declares that fits is taken, in the page's own order of trust, and vectors are never asked for", async () => {
  const html = `<html><head>
    <link rel="icon" type="image/svg+xml" href="/logo.svg">
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="icon" sizes="32x32" href="/icon-32.png">
  </head></html>`;
  const net = images({ [`${SITE}/apple-touch-icon.png`]: pngHead(180, 180), [`${SITE}/icon-32.png`]: pngHead(32, 32) });
  const found = await findSiteLogo(net.image, html, SITE);
  assert.equal(found?.url, `${SITE}/apple-touch-icon.png`);
  assert.deepEqual([found.head.width, found.head.height, found.head.kind], [180, 180, "png"]);
  assert.deepEqual(net.asked, [`${SITE}/apple-touch-icon.png`], "the first that fits, and nothing after it");
});

test("the mark the page's reader saw goes first, held to the same rules; a builder's stock mark is passed over, whoever saw it", async () => {
  const html = `<link rel="apple-touch-icon" href="/touch.png">`;
  const seen = "https://cdn.example/seen.png";
  const both = images({ [seen]: pngHead(256, 256), [`${SITE}/touch.png`]: pngHead(180, 180) });
  assert.equal((await findSiteLogo(both.image, html, SITE, seen)).url, seen);
  assert.deepEqual(both.asked, [seen]);

  const small = images({ [seen]: pngHead(8, 8), [`${SITE}/touch.png`]: pngHead(180, 180) });
  assert.equal(
    (await findSiteLogo(small.image, html, SITE, seen)).url,
    `${SITE}/touch.png`,
    "too small: the page's own",
  );

  const stock = "https://static.parastorage.com/client/pfavico.ico";
  const builder = images({ [`${SITE}/touch.png`]: pngHead(180, 180) });
  assert.equal((await findSiteLogo(builder.image, html, SITE, stock)).url, `${SITE}/touch.png`);
  assert.deepEqual(builder.asked, [`${SITE}/touch.png`], "never asked for");

  const same = images({ [`${SITE}/touch.png`]: pngHead(8, 8) });
  assert.equal(await findSiteLogo(same.image, html, SITE, `${SITE}/touch.png`), null);
  assert.equal(same.asked.length, 1, "one address is one try, whoever names it");
});

test("a page whose marks are too small, too big or unreachable gives none, and no more than three are asked for", async () => {
  const html = `<head>
    <script type="application/ld+json">{"@type":"Organization","logo":"${SITE}/poster.png"}</script>
    <link rel="apple-touch-icon" href="/a.png">
    <link rel="icon" sizes="64x64" href="/b.png">
    <link rel="icon" sizes="48x48" href="/c.png">
    <link rel="icon" sizes="16x16" href="/d.png">
  </head>`;
  const net = images({ [`${SITE}/poster.png`]: pngHead(2400, 800), [`${SITE}/b.png`]: pngHead(64, 64) });
  assert.equal(await findSiteLogo(net.image, html, SITE), null);
  assert.equal(net.asked.length, LOGO_TRIES);
  assert.equal(await findSiteLogo(net.image, "", SITE), null, "no page, no mark");
});
