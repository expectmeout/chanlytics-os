/**
 * A day the product says is the same day on any machine: the words are said in a stated zone, never the machine's.
 *
 * Billing's days, a sending domain's hold, a partner's first day and the day Ask's quick answer reads from "tomorrow"
 * with no zone were each formatted with no timeZone, so a browser or a server east of UTC+12 said the day after the
 * one UTC says, and the edge (which runs in UTC) and the page disagreed about one instant. Found by running the suite
 * under Pacific/Auckland on 29 Sep 2026.
 *
 * This file runs twelve hours east on purpose: the zone is set before contracts is imported, since a formatter built at
 * import keeps the zone it was built in. Every instant below is one where UTC and Auckland name different days.
 */
process.env.TZ = "Pacific/Auckland";
const { test } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const { dayWords, trialWords, toBillingVM, lineReleaseWarning, sendingDomainWords, partnerVM, dayFromQuestion } =
  await import("@chanlytics/contracts");

test("the machine is twelve hours east: without that, nothing below could fail", () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, "Pacific/Auckland");
  // 15:00 UTC on 21 September is 03:00 on the 22nd in Auckland (NZST, UTC+12).
  assert.equal(new Date("2026-09-21T15:00:00Z").getDate(), 22);
});

test("billing says Stripe's day as the edge does, in UTC: the trial's end, the pane's sentence, the letter a number goes back in", () => {
  const now = Date.parse("2026-09-07T15:00:00Z");
  assert.equal(dayWords("2026-09-21T15:00:00Z"), "Sep 21");
  assert.equal(trialWords("2026-09-21T15:00:00Z", now), "14 days left on the trial, until Sep 21");
  const vm = toBillingVM(
    {
      ready: true,
      role: "owner",
      trial_days: 14,
      price: { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" },
      account: {
        mode: "stripe",
        status: "active",
        price_id: "price_1",
        current_period_end: "2026-10-21T15:00:00Z",
        trial_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        card_brand: "visa",
        card_last4: "4242",
        last_payment_failed_at: null,
        last_paid_at: null,
        updated_at: "2026-09-21T15:00:00Z",
      },
    },
    now,
  );
  assert.match(vm.detail, /^Next invoice Oct 21 on Visa ending 4242\./);
  const letter = lineReleaseWarning({
    number: "+13055550100",
    on: Date.parse("2026-10-27T15:00:00Z"),
    forwardedFrom: null,
    billingUrl: null,
  });
  assert.equal(letter.subject, "Your number +1 (305) 555-0100 goes back on Oct 27");
});

test("a sending domain's hold names the day it began in UTC, as billing says its days", () => {
  const w = sendingDomainWords({
    id: "d1",
    host: "example.com",
    from_local: "sam",
    from_name: "Sam at Example",
    address: "sam@example.com",
    state: "held",
    held_why: "verification",
    held_at: "2026-09-22T12:00:00Z",
    verified_at: "2026-09-13T12:00:00Z",
    clean_since: "2026-09-13T12:00:00Z",
    provider_status: "verified",
    dmarc: "found",
    records: [],
    checked_at: null,
    created_at: "2026-09-12T12:00:00Z",
    counted_since: null,
    sent_recent: null,
    bounced_recent: null,
    complaints: null,
    sent_days: 0,
  });
  assert.equal(w.line, "Held since Sep 22 · it stopped verifying");
});

test("a partner's first day is said in UTC, as every other day on the partner's pages", () => {
  const vm = partnerVM(
    {
      id: "p1",
      code: "ada",
      status: "active",
      share_bp: 2500,
      terms_accepted_at: "2026-09-01T12:00:00Z",
      created_at: "2026-09-01T12:00:00Z",
    },
    "https://app.example.com",
    0,
  );
  assert.equal(vm.since, "A partner since Sep 1, 2026.");
});

test("Ask's quick answer with no zone reads today and tomorrow in UTC, as it does for a zone it cannot use", () => {
  // Noon UTC on 7 March is already 1 AM on the 8th in Auckland (NZDT, UTC+13).
  const noon = Date.parse("2026-03-07T12:00:00Z");
  for (const zone of [null, undefined, "Mars/Olympus"]) {
    assert.equal(dayFromQuestion("what's open today?", noon, zone), "2026-03-07", String(zone));
    assert.equal(dayFromQuestion("what's open tomorrow?", noon, zone), "2026-03-08", String(zone));
  }
});
