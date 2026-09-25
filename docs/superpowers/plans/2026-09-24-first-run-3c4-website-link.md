# The first run, PR 3c-4: the booking link found on the business's website

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check offers the booking page the business's website links to (or the website itself, when it is one).
It shows "Found on your website", and an owner's "Use it" press saves it as the booking link. This is the spec's
"the booking link only for businesses that book (found on their website when it is there)", and canvas R2's "They
book at … Found on your website".

**Architecture:**
- **What a booking page is, contracts' (`booking-page.ts`).**
  - The booking platforms by host (Vagaro, Booksy, Fresha, GlossGenius, StyleSeat, Schedulicity, Mindbody, Setmore,
    Acuity, Calendly, Square Appointments, SimplyBook.me, YouCanBook.me, Zocdoc, Jane).
  - `bookingPageOf(url)`: whether an address is a business's own page on one, as the https address the config keeps.
    It must be on a subdomain other than `www`, or have a path. So a "Powered by Vagaro" link to vagaro.com's home
    page is not one.
  - The lead finder's `LEAD_PLATFORM_HOSTS` is built from the same hosts plus the site builders and social pages, so
    the platforms are named once.
- **Reading the page, core's (`booking-page.ts`).** `bookingPageOn(html, pageUrl)` reads every `<a href>` on the page,
  resolved against it, through `bookingPageOf`. It prefers a link whose words say booking ("Book", "Schedule",
  "Appointment", "Reserve") over the first one found. It uses the HTML helpers the lead marks read with (`attrsOf`,
  `decodeEntities`), moved to `core/html.ts`.
- **The edge reads the website once, on a listing's first read.**
  - That first read is the one the link op makes at once (`checkListing` with `checked_at` null).
    `siteBookingPage(fetch, website)` returns the website itself when it is a booking page. Otherwise it reads the home
    page (`pageText`, 4 s; public addresses only, `feedUrlOk`) and scans it.
  - What it finds is kept in `google_listings.facts.booking_page`. Every later read keeps it while the website is the
    same (`bookingPageKept`).
  - The sweep reads forty listings a tick inside a 60 s function (vercel.json), with no room for a site each.
- **Setup carries it to Check.**
  - `google.bookingPage` is the found page, only while the config holds no booking link.
  - `SetupVM.check.bookingPage` and then `FirstRunCheckVM.bookingPage` carry it on.
  - It never enters `resolveFacts` or the prompt. Nothing found reaches a customer until the owner saves it.
- **The page.**
  - Under the booking link row, where that row is drawn (a business that books), the found page is drawn with "Found on
    your website" and a "Use it" button.
  - The button is gated as a change to the settings. It saves through the tab's one saver with the row's own patch
    (`PATCH_OF.booking_link`), never over a link that is there.
  - The offer goes as soon as a link is on the config the next save goes on.

**Tech Stack:** TypeScript contracts and core, the edge's Google library, the setup read, classic-script JSX pages,
`node:test`, committed dists. No migration (`facts` is jsonb), no route, no environment variable.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-website-link`, off `origin/main` at
`ac9a5f91`.

## What is not in this PR

- A website read for a listing linked before this ships: it has none until it is linked again. Only the first read
  of a listing reads its site.
- The Business tab's own booking link row offering the found page. Check is where a first config is checked.
- Pages that embed a platform's widget (`<iframe>`, a script) without a link to it.

## Tasks

### Task 1: What a booking page is, in contracts

**Files:**
- `packages/contracts/src/booking-page.ts` (new, exported from index.ts).
- `lead-search.ts`: `LEAD_PLATFORM_HOSTS` built from `BOOKING_PLATFORM_HOSTS` plus its own site builders and
  social pages.
- `tooling/scripts/tests/booking-page.test.mjs` (new).

- [ ] Test:
  - `bookingPageOf` finds these to be booking pages:
    - "https://www.vagaro.com/example-studio"
    - "http://example-studio.glossgenius.com/", which is upgraded to https
    - "https://booksy.com/en-us/00000_example-studio"
    - "https://squareup.com/appointments/book/abc/def"
    - "https://calendly.com/example-studio/consult#top", with the fragment dropped
  - These are none:
    - "https://vagaro.com/" and "https://www.calendly.com/?utm_source=x": a platform's own home page
    - "https://squareup.com/us/en": Square pages that are not appointments
    - "https://studio.example.com/book": a site that is not a platform
    - "mailto:…" and "ftp://…"
    - an address over 500 characters (the config's `booking_link` cap; the test holds the two equal)
    - null and junk
  - `siteHost` reads a booking page as no site of the business's own, for every booking host.
- [ ] Code as tested.

### Task 2: Reading a page for one, in core

**Files:**
- `packages/core/src/html.ts` (new, not exported from the index): `attrsOf` and `decodeEntities`, moved from
  `leads/mark.ts`, which imports them.
- `packages/core/src/booking-page.ts` (new, exported from index.ts).
- The booking page test.

- [ ] Test: `bookingPageOn(html, "https://studio.example.com/")` returns:
  - the link whose words say booking, over an earlier platform link (a footer "Powered by" first, a "Book now" after);
  - a relative href resolved against the page;
  - an href with `&amp;` decoded;
  - null for a page whose platform links are all the platform's home page;
  - null for a page with none.
- [ ] Code as tested; the lead mark tests still pass unchanged.

### Task 3: The edge reads the website with a listing's first read

**Files:**
- `apps/edge/lib/google/booking-page.ts` (new): `siteBookingPage`.
- `apps/edge/lib/google/google.ts`: `checkListing`.
- contracts `google.ts`:
  - `GoogleListingFacts.booking_page`, read by `listingFactsOf` through `bookingPageOf`;
  - `bookingPageKept(prev, website)`.
- channels `google-places.ts`: `factsOf` says `booking_page: null`, since Google names none.
- Tests: `booking-page.test.mjs`, `google.test.mjs`, `google-door.test.mjs`, `cron-doors-b.test.mjs`,
  `first-run.test.mjs`.

- [ ] Test:
  - `siteBookingPage` returns a website that is itself a booking page without reading it.
  - It reads a public site once and returns what the page links to.
  - It never reads a private address (`http://10.0.0.5`).
  - A page that is not HTML, or a read that fails, gives null.
  - `bookingPageKept` keeps the found page while the website is the same, and drops it when the website changed or
    there was none.
  - The link op: the listing's website is read once, after the two Places reads, and its booking page is stored in
    `facts.booking_page`.
  - A refresh reads no site and keeps what the link found.
  - `listingFactsOf` keeps a stored booking page and drops junk.
- [ ] Code as tested; the door's and the sweep's wire expectations name the one website read.

### Task 4: Setup carries it to Check

**Files:**
- `apps/dashboard/src/server/setup.ts`.
- contracts:
  - `google.ts`: `SetupGoogleFacts.bookingPage`;
  - `setup.ts`: `check.bookingPage`;
  - `first-run.ts`: `FirstRunCheckVM.bookingPage`, and the words `check.bookingPage: { found, use }`.
- `setup.test.mjs`, `first-run.test.mjs`.

- [ ] Test:
  - `setupDtoFor` gives the facts' booking page when the config has no booking link.
  - It gives null once the config has one, and null with no listing.
  - The VMs carry it on.
- [ ] Code as tested.

### Task 5: The offer on Check

**Files:**
- `first-run.jsx`:
  - `frUseLink`;
  - the offer under `BtBookingLinkRow`;
  - `frRefusals`, shared with the chips.
- `first-run.css`: `.fr-found`.
- `Chanlytics.html`: first-run.jsx v6, first-run.css v5.
- `first-run-check.test.mjs`.

- [ ] Test:
  - A business that books, with no link stored and a page found, sees "Found on your website", the page, and "Use it".
  - "Use it" saves `booking_link` through the tab's saver, and the offer goes at once.
  - No offer is drawn with a link stored.
  - No offer is drawn for a business that quotes, whose row is not drawn.
  - A role that may not change the business sees "Use it" gated, and a press sends nothing.
- [ ] Code as tested.

### Task 6: The gates, the look, the review, the PR

- [ ] Prettier, then the dists (contracts, core, channels), typecheck, lint, format:check, check-dist, and the whole
      suite.
- [ ] Look at the offer on the probe, desktop and phone.
- [ ] One review round and one fix round. Merge main, open the PR, watch CI, squash-merge, check main's run.

## As built (24 September 2026)

Tasks 1 to 6 as planned, with these differences:
- The words a link says booking in include Spanish ("reservar", "cita", "agendar"), since the product's businesses
  write their sites in both languages.
- The platforms' constants are pure (`@__PURE__`), so a bundle that does not use them drops them. The db, channels
  and jobs dists stay as they were.

**Fixed in the review round** (one whole-branch review, standards and spec, then one fix round):
- **The website read reaches no private network.**
  - A shared reader, `apps/edge/lib/public-page.ts` (`publicPageText`), checks each address it asks through
    `feedUrlOk`: the first, and each redirect, three at most. It reads HTML only, and no more than 256 KB, as the
    page arrives.
  - `feedUrlOk` now also refuses:
    - IPv6's private ranges: unique local, link-local, the unspecified address, and an IPv4 address carried in one;
    - the carriers' shared space, 100.64.0.0/10.
  - Calendar feeds get the stricter rule too.
- **Only the link reads the website.**
  - `checkListing` takes `site: "read" | "keep"`, and it is required. The link reads; the refresh and the sweep
    keep.
  - A listing linked through the Business Profile is first read by the sweep, which has no room for a site.
- **A page's booking link is one whose words say booking.**
  - The words are its text, an image's alt, its aria-label or its title, matched as whole words. So a "Powered by"
    badge, a gift card or a shop is not taken.
  - Neither is a platform's own help, news or hiring subdomain, nor a Square page other than its appointments.
  - The reader goes through a page in one pass. It is renamed `bookingPageLinkedFrom` (it was `bookingPageOn`).
- **One test for the offer:** `bookingPageOffered(found, holdsLink)` in contracts `google.ts`. Setup's view model
  and the page both ask it, and the setup read carries the facts' page as it is.
- **The kit draws the offer.** It is the booking link row's disagreement (`other`), with the row's own check, save
  and gate. Its press is offered only to a role that may change the business, like any disagreement's press.
  `FrFoundLink` and its CSS are gone.
  - Found on the probe: the kit marked every row with another answer as "doesn't match". An empty row has nothing to
    disagree with, so its other answer now only fills it, and the row carries no mark (`record-row.jsx`).
- **Named once:**
  - `onDomain` is the one host rule for the booking platforms, the lead finder's platforms and its junk email
    domains. The junk email domains are now built from the booking platforms too.
  - The bot's user agent is the public reader's; the lead marks import it.
- **`booking_page` is not Google's,** so Places' parse no longer states it (it is optional on `GoogleListingFacts`).
  The edge adds it.
- **No counts in prose.**
- **Left as it is:**
  - `feedUrlOk` keeps its name, from the calendar feeds it guarded first.
  - A host name that resolves to a private address is not caught: the rule reads addresses, not DNS, as it does for
    calendar feeds.
  - The lead finder's own page read (`pageText`) still follows redirects unchecked. It is flagged separately.
