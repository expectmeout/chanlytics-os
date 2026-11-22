/**
 * Where an entry came from, in one shape (the Ads tracking plan's T4, call 3; the Forms plan, 3.9): the link's code, the
 * page, the site the visitor came from, and the campaign labels a link named. Never a click id. A label with odd
 * characters is dropped alone and costs the entry nothing; the site is kept as its name, never the whole address, which
 * can hold what a person typed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { Source, sourceFromSeen, sourceInWords } = await import(at("packages/contracts/src/forms/source.ts"));

test("the labels a link named, the site and the link's code, and nothing else", () => {
  const source = sourceFromSeen({
    code: "k7q2md",
    page: "/b/luma-salon/colour-consultation",
    referrer: "https://l.instagram.com/?u=https%3A%2F%2Fapp.chanlytics.com%2Fl%2Fk7q2md&e=AT0secret",
    labels: {
      utm_source: " Google ",
      utm_medium: "cpc",
      utm_campaign: "spring-offer",
      gclid: "Cj0KCQiA-click-id",
      fbclid: "IwAR0-click-id",
    },
  });
  assert.deepEqual(source, {
    code: "k7q2md",
    page: "/b/luma-salon/colour-consultation",
    site: "l.instagram.com",
    labels: { utm_source: "Google", utm_medium: "cpc", utm_campaign: "spring-offer" },
  });
  assert.equal(Source.safeParse(source).success, true);
  assert.equal(JSON.stringify(source).includes("click-id"), false, "never a click id");
  assert.equal(JSON.stringify(source).includes("secret"), false, "the site's name, never its whole address");
});

test("a label with odd characters is dropped alone", () => {
  const source = sourceFromSeen({
    labels: { utm_source: "newsletter", utm_campaign: "<script>alert(1)</script>", utm_term: "x".repeat(101) },
  });
  assert.deepEqual(source, { labels: { utm_source: "newsletter" } });
});

test("nothing seen is no source, and the page's own site is not where they came from", () => {
  assert.equal(sourceFromSeen({}), null);
  assert.equal(sourceFromSeen({ referrer: "not an address", labels: { utm_source: "" } }), null);
  assert.equal(
    sourceFromSeen({ referrer: "https://app.chanlytics.com/b/luma-salon", own: "app.chanlytics.com" }),
    null,
    "a move inside the app is no source",
  );
  assert.deepEqual(sourceFromSeen({ referrer: "https://www.Google.com/search?q=luma" }), { site: "google.com" });
});

test("the shape refuses what it does not name", () => {
  assert.equal(Source.safeParse({ labels: { gclid: "x" } }).success, false);
  assert.equal(Source.safeParse({ click: "x" }).success, false);
});

test("said in words: who sent them, and the campaign where one was named", () => {
  assert.equal(
    sourceInWords({ labels: { utm_source: "google", utm_campaign: "spring-offer" } }),
    "Google (spring-offer)",
  );
  assert.equal(sourceInWords({ site: "l.instagram.com" }), "Instagram");
  assert.equal(sourceInWords({ site: "lumasalon.example" }), "lumasalon.example");
  assert.equal(sourceInWords({ code: "k7q2md" }), null, "a link's code alone names no site: its place says it");
  assert.equal(sourceInWords(null), null);
});
