/**
 * The booking link found on a business's website (the first run's Check, 3c-4): what a booking page is (contracts),
 * reading a page for one (core), and the edge's one read of the website with a listing's first read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPageOf,
  bookingPageKept,
  BOOKING_PLATFORM_HOSTS,
  BrainConfigSchema,
  listingFactsOf,
  siteHost,
} from "@chanlytics/contracts";
import { bookingPageOn } from "../../../packages/core/src/booking-page.ts";
import { siteBookingPage } from "../../../apps/edge/lib/google/booking-page.ts";

/* ------------------------------------ what a booking page is ------------------------------------ */

test("a business's own page on a booking platform is its booking page, as the https address the config keeps", () => {
  for (const [raw, page] of [
    ["https://www.vagaro.com/example-studio", "https://www.vagaro.com/example-studio"],
    ["http://example-studio.glossgenius.com/", "https://example-studio.glossgenius.com/"],
    ["https://booksy.com/en-us/00000_example-studio", "https://booksy.com/en-us/00000_example-studio"],
    ["https://squareup.com/appointments/book/abc/def", "https://squareup.com/appointments/book/abc/def"],
    ["https://calendly.com/example-studio/consult#top", "https://calendly.com/example-studio/consult"],
    [" https://example-studio.as.me/ ", "https://example-studio.as.me/"],
  ])
    assert.equal(bookingPageOf(raw), page, raw);
});

test("a platform's own front door, a platform page that is not a booking, another site and junk are none", () => {
  for (const raw of [
    "https://vagaro.com/",
    "https://www.calendly.com/?utm_source=example",
    "https://squareup.com/us/en",
    "https://studio.example.com/book",
    "mailto:hello@studio.example.com",
    "ftp://vagaro.com/example-studio",
    "not an address",
    "",
    null,
    undefined,
  ])
    assert.equal(bookingPageOf(raw), null, String(raw));
  const cap = BrainConfigSchema.shape.booking_link.unwrap().maxLength;
  assert.equal(cap, 500, "the config's own cap");
  const at = (n) => `https://booksy.com/${"a".repeat(n - "https://booksy.com/".length)}`;
  assert.equal(bookingPageOf(at(cap)), at(cap));
  assert.equal(bookingPageOf(at(cap + 1)), null, "longer than the config keeps");
});

test("the lead finder reads a lead whose website is on a booking platform as having no site of its own", () => {
  for (const host of BOOKING_PLATFORM_HOSTS) assert.equal(siteHost(`https://example-studio.${host}/x`), null, host);
  assert.equal(siteHost("https://studio.example.com/book"), "studio.example.com");
});

/* ------------------------------------ reading a page for one ------------------------------------ */

const PAGE = "https://studio.example.com/";
const page = (body) => `<!doctype html><html><head><title>Example Studio</title></head><body>${body}</body></html>`;

test("a page's booking page is the link whose words say booking, over an earlier one on the platform that does not", () => {
  const html = page(`
    <a href="https://www.vagaro.com/example-studio/giftcards">Gift cards</a>
    <nav><a class="btn" href="https://www.vagaro.com/example-studio/book"><span>Book now</span></a></nav>
    <footer><a href="https://www.vagaro.com/">Powered by Vagaro</a></footer>`);
  assert.equal(bookingPageOn(html, PAGE), "https://www.vagaro.com/example-studio/book");
});

test("a link is read against the page with its entities decoded, and with none saying booking the first platform page is taken", () => {
  assert.equal(
    bookingPageOn(page(`<a href="//example-studio.glossgenius.com/services?a=1&amp;b=2">Our menu</a>`), PAGE),
    "https://example-studio.glossgenius.com/services?a=1&b=2",
  );
  assert.equal(
    bookingPageOn(
      page(
        `<a href='https://calendly.com/example-studio/consult' aria-label="Schedule a consult"><img src="x.png"></a>`,
      ),
      PAGE,
    ),
    "https://calendly.com/example-studio/consult",
  );
});

test("a page whose platform links are all the platform's own front door, or that has none, has no booking page", () => {
  assert.equal(bookingPageOn(page(`<a href="https://www.vagaro.com/">Powered by Vagaro</a>`), PAGE), null);
  assert.equal(
    bookingPageOn(page(`<a href="/contact">Contact</a><a href="mailto:hi@studio.example.com">Mail</a>`), PAGE),
    null,
  );
  assert.equal(bookingPageOn("", PAGE), null);
});

/* ------------------------------------ the edge's read of the website ------------------------------------ */

const FOUND = "https://booksy.com/en-us/00000_example-studio";
/** A wire that says what it was asked, answering each ask with `answer`. */
const wire = (answer) => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(String(url));
    return answer(String(url));
  };
  return { asked, fetchImpl };
};
const htmlOf = (body) => new Response(page(body), { headers: { "content-type": "text/html; charset=utf-8" } });

test("a website that is itself a booking page is the listing's booking page, and is not read", async () => {
  const w = wire(() => {
    throw new Error("must not be read");
  });
  assert.equal(
    await siteBookingPage(w.fetchImpl, "https://www.vagaro.com/example-studio"),
    "https://www.vagaro.com/example-studio",
  );
  assert.deepEqual(w.asked, []);
});

test("a website's home page is read once for the booking page it links to", async () => {
  const w = wire(() => htmlOf(`<a href="${FOUND}">Book now</a>`));
  assert.equal(await siteBookingPage(w.fetchImpl, "https://studio.example.com"), FOUND);
  assert.deepEqual(w.asked, ["https://studio.example.com/"]);
});

test("no website, a private address, a page that is not HTML and a read that fails each give none", async () => {
  const quiet = wire(() => htmlOf(`<a href="${FOUND}">Book now</a>`));
  assert.equal(await siteBookingPage(quiet.fetchImpl, null), null);
  assert.equal(await siteBookingPage(quiet.fetchImpl, "http://10.0.0.5/"), null);
  assert.equal(await siteBookingPage(quiet.fetchImpl, "http://localhost:3000/"), null);
  assert.deepEqual(quiet.asked, [], "a private address is never read");
  const json = wire(() => new Response("{}", { headers: { "content-type": "application/json" } }));
  assert.equal(await siteBookingPage(json.fetchImpl, "https://studio.example.com/"), null);
  const down = wire(() => {
    throw new Error("offline");
  });
  assert.equal(await siteBookingPage(down.fetchImpl, "https://studio.example.com/"), null);
});

test("a later read keeps the booking page the first read found while the website is the one it was found on", () => {
  const prev = listingFactsOf({ website: "https://studio.example.com/", booking_page: FOUND });
  assert.equal(prev.booking_page, FOUND, "stored, and read back for what it is");
  assert.equal(bookingPageKept(prev, "https://studio.example.com/"), FOUND);
  assert.equal(bookingPageKept(prev, "https://new.example.com/"), null, "a new website: nothing found on it yet");
  assert.equal(bookingPageKept(null, "https://studio.example.com/"), null);
  assert.equal(
    listingFactsOf({ website: "https://studio.example.com/", booking_page: "javascript:alert(1)" }).booking_page,
    null,
    "what is stored is read for what it is: the column is jsonb",
  );
});
