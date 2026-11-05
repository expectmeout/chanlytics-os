/**
 * The booking link found on a business's website (the first run's Check, 3c-4): what a booking page is (contracts),
 * reading a page for one (core), and the website read's find off the home page it holds (that it is kept with the read
 * is a-website-is-read-for-check.test.mjs's).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPageOf,
  bookingPageOffered,
  BOOKING_PLATFORM_HOSTS,
  BrainConfigSchema,
  LEAD_JUNK_EMAIL_DOMAINS,
  onDomain,
  siteHost,
} from "@chanlytics/contracts";
import { bookingPageLinkedFrom, bookingPageOfSite } from "../../../../packages/core/src/booking-page.ts";

/* ------------------------------------ what a booking page is ------------------------------------ */

test("a business's own page on a booking platform is its booking page, as the https address the config keeps", () => {
  for (const [raw, page] of [
    ["https://www.vagaro.com/example-studio", "https://www.vagaro.com/example-studio"],
    ["http://example-studio.glossgenius.com/", "https://example-studio.glossgenius.com/"],
    ["https://booksy.com/en-us/00000_example-studio", "https://booksy.com/en-us/00000_example-studio"],
    [
      "https://example-studio.zenoti.com/webstoreNew/services",
      "https://example-studio.zenoti.com/webstoreNew/services",
    ],
    [
      "https://www.joinblvd.com/b/example-studio/widget#/visit-type",
      "https://www.joinblvd.com/b/example-studio/widget",
    ],
    ["https://squareup.com/appointments/book/abc/def", "https://squareup.com/appointments/book/abc/def"],
    [
      "https://book.squareup.com/appointments/abc/location/def",
      "https://book.squareup.com/appointments/abc/location/def",
    ],
    ["https://calendly.com/example-studio/consult#top", "https://calendly.com/example-studio/consult"],
    [" https://example-studio.as.me/ ", "https://example-studio.as.me/"],
  ])
    assert.equal(bookingPageOf(raw), page, raw);
});

test("a platform's front door, its own help and news, its pages that are not a booking, another site and junk are none", () => {
  for (const raw of [
    "https://vagaro.com/",
    "https://www.calendly.com/?utm_source=example",
    "https://support.vagaro.com/hc/en-us/articles/1",
    "https://help.glossgenius.com/",
    "https://blog.booksy.com/en-us/tips",
    "https://squareup.com/us/en",
    "https://squareup.com/appointments/features",
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

test("the lead finder reads a website or an email address on a booking platform as not the business's own", () => {
  for (const host of BOOKING_PLATFORM_HOSTS) {
    assert.equal(siteHost(`https://example-studio.${host}/x`), null, host);
    assert.ok(
      LEAD_JUNK_EMAIL_DOMAINS.some((d) => onDomain(host, d)),
      host,
    );
  }
  assert.equal(siteHost("https://studio.example.com/book"), "studio.example.com");
  assert.equal(onDomain("book.squareup.com", "squareup.com"), true);
  assert.equal(onDomain("notsquareup.com", "squareup.com"), false, "a domain, not a suffix");
});

/* ------------------------------------ reading a page for one ------------------------------------ */

const PAGE = "https://studio.example.com/";
const page = (body) => `<!doctype html><html><head><title>Example Studio</title></head><body>${body}</body></html>`;

test("a page's booking page is its link whose words say booking: not a badge, a gift card or a shop on the platform", () => {
  const html = page(`
    <a href="https://www.vagaro.com/example-studio/giftcards">Gift cards</a>
    <a href="https://booksy.com/en-us/00000_example-studio">Powered by Booksy</a>
    <nav><a class="btn" href="https://www.vagaro.com/example-studio/book"><span>Book now</span></a></nav>`);
  assert.equal(bookingPageLinkedFrom(html, PAGE), "https://www.vagaro.com/example-studio/book");
  assert.equal(
    bookingPageLinkedFrom(page(`<a href="https://booksy.com/en-us/00000_example-studio">Powered by Booksy</a>`), PAGE),
    null,
    "a platform named on its own badge says nothing about booking",
  );
});

test("a link's words are its text, its image's alt, its aria-label or its title; its address is read against the page, entities decoded", () => {
  assert.equal(
    bookingPageLinkedFrom(
      page(`<a href="//example-studio.glossgenius.com/services?a=1&amp;b=2">Book a visit</a>`),
      PAGE,
    ),
    "https://example-studio.glossgenius.com/services?a=1&b=2",
  );
  assert.equal(
    bookingPageLinkedFrom(
      page(
        `<a href='https://calendly.com/example-studio/consult' aria-label="Schedule a consult"><img src="x.png"></a>`,
      ),
      PAGE,
    ),
    "https://calendly.com/example-studio/consult",
  );
  assert.equal(
    bookingPageLinkedFrom(
      page(`<a href="https://example-studio.setmore.com/"><img alt="Reservar cita" src="b.png"></a>`),
      PAGE,
    ),
    "https://example-studio.setmore.com/",
  );
});

test("a page with no booking link has none, and a page written to be slow to read is read in one pass", () => {
  assert.equal(bookingPageLinkedFrom(page(`<a href="https://www.vagaro.com/">Book now</a>`), PAGE), null);
  assert.equal(
    bookingPageLinkedFrom(page(`<a href="/contact">Contact</a><a href="mailto:hi@studio.example.com">Mail</a>`), PAGE),
    null,
  );
  assert.equal(bookingPageLinkedFrom("", PAGE), null);
  for (const hostile of ["<a ".repeat(90_000), `${"<a href='x'>".repeat(20_000)}Book`, `<a ${"x".repeat(250_000)}`]) {
    const t = performance.now();
    assert.equal(bookingPageLinkedFrom(hostile, PAGE), null);
    assert.ok(performance.now() - t < 1_000, `read in ${Math.round(performance.now() - t)} ms`);
  }
});

/* ------------------------------------ the website read's find ------------------------------------ */

const FOUND = "https://booksy.com/en-us/00000_example-studio";
/** The home page as the platform's page reader hands it (channels SitePage): where it landed, as a browser drew it. */
const drawn = (body, url = "https://studio.example.com/") => ({ url, html: page(body), markdown: "" });

test("a website that is itself a booking page is its booking page, whatever its page links to; and one that lands on one is too", () => {
  assert.equal(
    bookingPageOfSite("https://www.vagaro.com/example-studio", drawn(`<a href="${FOUND}">Book now</a>`)),
    "https://www.vagaro.com/example-studio",
  );
  assert.equal(
    bookingPageOfSite("https://studio.example.com/", drawn("", "https://www.vagaro.com/example-studio")),
    "https://www.vagaro.com/example-studio",
    "a site that redirects there says so by landing there",
  );
});

test("a website's home page gives the booking page it names, and a page that names none gives none", () => {
  assert.equal(bookingPageOfSite("https://studio.example.com/", drawn(`<a href="${FOUND}">Book now</a>`)), FOUND);
  assert.equal(bookingPageOfSite("https://studio.example.com/", drawn(`<a href="/contact">Contact</a>`)), null);
  assert.equal(bookingPageOfSite("https://studio.example.com/", drawn("")), null);
});

test("the booking page is offered only while the config holds no booking link: the one test, for the read and the page", () => {
  assert.equal(bookingPageOffered(FOUND, false), FOUND);
  assert.equal(bookingPageOffered(FOUND, true), null, "a link the owner has is theirs");
  assert.equal(bookingPageOffered(null, false), null);
  assert.equal(bookingPageOffered(undefined, false), null);
});
