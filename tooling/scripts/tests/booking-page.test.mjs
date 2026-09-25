/**
 * The booking link found on a business's website (the first run's Check, 3c-4): what a booking page is (contracts),
 * reading a page for one (core), and the edge's one read of the website when a listing is linked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPageOf,
  bookingPageKept,
  bookingPageOffered,
  BOOKING_PLATFORM_HOSTS,
  BrainConfigSchema,
  LEAD_JUNK_EMAIL_DOMAINS,
  listingFactsOf,
  onDomain,
  siteHost,
} from "@chanlytics/contracts";
import { bookingPageLinkedFrom } from "../../../packages/core/src/booking-page.ts";
import { siteBookingPage } from "../../../apps/edge/lib/google/booking-page.ts";

/* ------------------------------------ what a booking page is ------------------------------------ */

test("a business's own page on a booking platform is its booking page, as the https address the config keeps", () => {
  for (const [raw, page] of [
    ["https://www.vagaro.com/example-studio", "https://www.vagaro.com/example-studio"],
    ["http://example-studio.glossgenius.com/", "https://example-studio.glossgenius.com/"],
    ["https://booksy.com/en-us/00000_example-studio", "https://booksy.com/en-us/00000_example-studio"],
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

/* ------------------------------------ the edge's read of the website ------------------------------------ */

const FOUND = "https://booksy.com/en-us/00000_example-studio";
/** A wire that says what it was asked, answering each ask with `answer`. */
const wire = (answer) => {
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push(String(url));
    assert.equal(init.redirect, "manual", "every redirect is looked at before it is followed");
    return answer(String(url));
  };
  return { asked, fetchImpl };
};
const htmlOf = (body) => new Response(page(body), { headers: { "content-type": "text/html; charset=utf-8" } });
const redirect = (to) => new Response(null, { status: 302, headers: { location: to } });

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

test("a website's home page is read for the booking page it names, following its own redirects on the public internet", async () => {
  const w = wire(() => htmlOf(`<a href="${FOUND}">Book now</a>`));
  assert.equal(await siteBookingPage(w.fetchImpl, "https://studio.example.com"), FOUND);
  assert.deepEqual(w.asked, ["https://studio.example.com/"]);
  const hops = wire((url) =>
    url === "http://studio.example.com/"
      ? redirect("https://www.studio.example.com/")
      : htmlOf(`<a href="${FOUND}">Book</a>`),
  );
  assert.equal(await siteBookingPage(hops.fetchImpl, "http://studio.example.com/"), FOUND);
  assert.deepEqual(hops.asked, ["http://studio.example.com/", "https://www.studio.example.com/"]);
});

test("a redirect into a private network, a private address, no website, a page that is not HTML and a failed read give none", async () => {
  const inward = wire((url) =>
    url === "https://studio.example.com/" ? redirect("http://169.254.169.254/latest/meta-data") : htmlOf(""),
  );
  assert.equal(await siteBookingPage(inward.fetchImpl, "https://studio.example.com/"), null);
  assert.deepEqual(inward.asked, ["https://studio.example.com/"], "the redirect is refused, never followed");
  const quiet = wire(() => htmlOf(`<a href="${FOUND}">Book now</a>`));
  assert.equal(await siteBookingPage(quiet.fetchImpl, null), null);
  assert.equal(await siteBookingPage(quiet.fetchImpl, "http://10.0.0.5/"), null);
  assert.equal(await siteBookingPage(quiet.fetchImpl, "http://[fd00::1]/"), null);
  assert.deepEqual(quiet.asked, [], "a private address is never read");
  const loop = wire(() => redirect("https://studio.example.com/"));
  assert.equal(await siteBookingPage(loop.fetchImpl, "https://studio.example.com/"), null);
  assert.equal(loop.asked.length, 4, "the first ask and three redirects, then no more");
  const json = wire(() => new Response("{}", { headers: { "content-type": "application/json" } }));
  assert.equal(await siteBookingPage(json.fetchImpl, "https://studio.example.com/"), null);
  const down = wire(() => {
    throw new Error("offline");
  });
  assert.equal(await siteBookingPage(down.fetchImpl, "https://studio.example.com/"), null);
});

test("no more of a home page is read than its top: a link past it is not found", async () => {
  const deep = wire(() => htmlOf(`${"x".repeat(300_000)}<a href="${FOUND}">Book now</a>`));
  assert.equal(await siteBookingPage(deep.fetchImpl, "https://studio.example.com/"), null);
  const near = wire(() => htmlOf(`${"x".repeat(200_000)}<a href="${FOUND}">Book now</a>`));
  assert.equal(await siteBookingPage(near.fetchImpl, "https://studio.example.com/"), FOUND);
});

test("a later read keeps the booking page the link found while the website is the one it was found on", () => {
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

test("the booking page is offered only while the config holds no booking link: the one test, for the read and the page", () => {
  assert.equal(bookingPageOffered(FOUND, false), FOUND);
  assert.equal(bookingPageOffered(FOUND, true), null, "a link the owner has is theirs");
  assert.equal(bookingPageOffered(null, false), null);
  assert.equal(bookingPageOffered(undefined, false), null);
});
