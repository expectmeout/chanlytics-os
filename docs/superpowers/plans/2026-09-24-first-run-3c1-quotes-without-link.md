# The first run, PR 3c-1: a business that quotes saves without a booking link

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A business that says some customers get a proposal first can save its receptionist with no booking link, on
the Business tab and through the create card. Everything an owner reads about the link follows how customers buy, and
the default messages read right with no link. This is decision 2's writing half.

**Architecture:**
- **The rule moves to the pages.** The write schema stops refusing a receptionist with no link: since 3b one is read
  and answered, taking the customer's details instead, so the refusal no longer protects anything. Asking for the link
  is the pages' job, by one predicate, `bookingLinkOptional(sellsBy)` in `deals.ts` beside `dealsAreOn`. It says no for
  a business that books or has not said, and yes for one that quotes.
  - The server cannot see `tenants.sells_by` from the config. The create card saves the receptionist before the
    answer. A server rule on the stored answer would refuse a first save that the page allowed.
- **Emptying the link removes it.** Both writers stored `""`, which fails the read schema's URL check. Today the page
  check never lets an empty link through; after this PR it will.
- **Owner words.**
  - `standingLine` takes the answer: a missing link is no gap for a business that quotes, and the price clause drops
    "or the booking link" when there is none.
  - `abilityRows` takes `linkOptional`: the booking-link row says the receptionist takes their details, and nothing is
    missing.
  - The rules fold's sentence for a stored prompt names the no-link rule (`rulesWithoutFieldsWords`).
  - The link row's empty state and hint, and the create card's hint, follow the answer.
- **Default messages.** `FALLBACK_DEFAULTS` gets one wording that reads right with or without a link. The earlier
  wording is still the product's (`isProductFallback`), so no workspace holding it is told it wrote its own, or offered
  a put-back.

**Tech Stack:** TypeScript contracts and bridge, classic-script JSX pages, `node:test`, committed dists. No migration,
no route change, no environment variable.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-quotes-without-link`, off `origin/main`
at `41ae34f7`.

## 3c in three parts

1. **3c-1 (this plan).** Decision 2's writing half on the Business tab: proposal sellers save with no link, and the
   words follow.
2. **3c-2, Check.** The first run's Check screen:
   - Google's facts become the receptionist's first config;
   - the Business tab's editors on the first run;
   - "How do customers buy?";
   - services suggested from the Google category;
   - languages;
   - not on Google (V2) and a service-area business (V3).
3. **3c-3.** The booking link found on the business's website.

## What is not in this PR

- The first run's receptionist card ("Books with"): 3c-2, with Check.
- People's "Asked, never booked" list, whose act sends the booking link as a broadcast. With no link, the broadcast
  route refuses it in words ("This message takes the booking link, and none is on file").
- The booking-link starter template, offered to every workspace. Offering a template sends nothing.
- Setup's detail "No booking link — the receptionist answers, but cannot send one". It is true for every business.

## Tasks

### Task 1: One predicate, and the save takes a receptionist with no link

**Files:**
- `packages/contracts/src/deals.ts` and `config.ts`;
- `tooling/scripts/tests/no-booking-link.test.mjs` and `settings-routes.test.mjs`.

- [ ] Test: `bookingLinkOptional("proposal")` is true; `"booking"`, `null` and `undefined` are false.
  `TenantConfigWriteSchema` takes `{ brain: QUOTES }`. The settings PUT of a brain with no link is taken (version up).
- [ ] Code:
  - `deals.ts`: `export function bookingLinkOptional(sellsBy) { return sellsBy === "proposal"; }`, with its doc.
  - `config.ts`: drop the rule from `TenantConfigWriteSchema`. Keep `BOOKING_LINK_NEEDED` (the pages' words). Rewrite
    the doc on the schema's link field and the no-booking-link module's "Read, not yet written" line.

### Task 2: Emptying the link removes it

**Files:** `business-tab-save.jsx` (`btPatchBookingLink`), `business-tab-folds.jsx` (`BT_WRITE.receptionist`), and
their tests.

- [ ] Test: a proposal seller's link emptied on the Business tab sends a brain with no `booking_link` key. So does a
  create with the box left empty and "Some get a proposal first".
- [ ] Code:
  - `btPatchBookingLink`: set the link when there is one, delete the key when there is none.
  - `receptionist`: `btPut(b, "booking_link", btfTrimmed(d.link) || undefined)`.

### Task 3: The page asks for the link by the answer

**Files:**
- `business-tab-save.jsx` (`btCheckBookingLink`);
- `business-tab-who.jsx` (the link row);
- `business-tab-folds.jsx` (`problemsOf("receptionist")`);
- `business-tab-create.jsx` (the hint);
- `legacy-bridge/business-tab.ts` (publish `bookingLinkOptional`, `BOOKING_LINK_NEEDED`);
- tests.

- [ ] Test:
  - On the Business tab, emptying the link of a business that books is refused with `BOOKING_LINK_NEEDED`, and of one
    that quotes is saved.
  - The link row's empty state reads "None — it takes their details instead" for one that quotes, and "Not set"
    otherwise.
  - The create card with "Some get a proposal first" and no link saves. With "They book an appointment" it is
    refused. Its hint follows the choice.
- [ ] Code:
  - `btCheckBookingLink(d, sellsBy)`: an empty link is fine when `bookingLinkOptional(sellsBy)`, otherwise
    `BOOKING_LINK_NEEDED`, read from `__businessTab`.
  - The row passes `window.btSellsByNow()`; the create fold passes its draft's answer, or the stored one, or the
    first.

### Task 4: The Business tab's words follow the answer and the link

**Files:**
- `packages/contracts/src/business-tab.ts` (`standingLine`, `abilityRows`, `rulesWithoutFieldsWords`, `WONT_PRICE`);
- `business-tab.jsx`, `business-can.jsx` and `business-tab-answers.jsx`;
- the bridge;
- tests.

- [ ] Test:
  - `standingLine(brain, calls, "proposal")` with no link names no link gap, and its price clause says "a consult"
    with no "booking link". Missing the answer is a TypeError.
  - `abilityRows({ ...live, hasBookingLink: false, linkOptional: true })`: the link row takes their details, with
    nothing missing. Missing `linkOptional` is a TypeError.
  - `rulesWithoutFieldsWords(false)` names the no-link rule, and `(true)` is today's sentence, byte for byte.
- [ ] Code as tested. Every caller passes the answer: `btSellsByNow()`, and `tab.bookingLinkOptional(...)` for the
  abilities.

### Task 5: The default messages read right with no link

**Files:**
- `config.ts` (`FALLBACK_DEFAULTS`, `EARLIER_FALLBACK_DEFAULTS`, `isProductFallback`);
- `business-tab.ts` (`fallbacksWords`);
- `business-tab-answers.jsx` (the put-back);
- the bridge;
- `fallback-messages.test.mjs` and the answers tests.

- [ ] Test:
  - With no link, the defaults read "Hi! Thanks for reaching out to Harbor Moving.\n\nReply here with any question."
    and "Thanks for reaching out to Harbor Moving! A member of our team will reply here soon."
  - With a link, each still offers it.
  - A workspace holding the earlier wording reads "the product's wording", and no message offers a put-back.
- [ ] Code: the new wording, the earlier one kept as the product's, and one test, `isProductFallback(key, text)`, which
  `fallbacksWords` and the page both use.

### Task 6: The gates, the look, the review, the PR

- [ ] Bump `?v=` for each edited page in `Chanlytics.html`.
- [ ] Rebuild the dists, keeping only real diffs. Run typecheck, lint, format:check, the route types and the whole
  suite.
- [ ] Look at the Business tab for a business that quotes, with no link, on the probe.
- [ ] One review round and one fix round. Merge main, open the PR, watch CI, squash-merge, check main's run.
