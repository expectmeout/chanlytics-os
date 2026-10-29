/**
 * The days the billing, imports, line release, channels and campaigns words say are the workspace's, never the
 * machine's. Each was said by the runtime's own zone until 29 Oct 2026 (the `zoneless-dates` measure's six sites): a
 * trial ending at 03:00 UTC was the next day's date to an owner in New York the evening before, on the bell, in Billing
 * and on Setup; a mailbox's "since", a line's quiet week, a campaign's last send and the day a number goes said the
 * browser's day, or the server's UTC. A zone Intl cannot use is UTC (contracts zone-math usableZone), never a throw.
 *
 * This file runs twelve hours east on purpose, and sets the zone before contracts is imported, so a day said by the
 * machine's clock is the day after the one UTC says and two after New York's: nothing below passes by the machine.
 */
process.env.TZ = "Pacific/Auckland";
const { test } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const {
  dayWords,
  fmtDay,
  importLineOf,
  lineReleaseWarning,
  planBilling,
  toBillingVM,
  toCampaignReportVM,
  toChannelVM,
  trialWords,
} = await import("@chanlytics/contracts");

const NY = "America/New_York";
/** 03:00 UTC on 3 November: the evening of the 2nd in New York, the afternoon of the 3rd in Auckland. */
const END = "2026-11-03T03:00:00Z";
const END_MS = Date.parse(END);
const DAY = 86_400_000;

test("the machine is twelve hours east: without that, nothing below could fail", () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, "Pacific/Auckland");
  assert.equal(new Date(END).getDate(), 3);
});

test("a day is the workspace's: New York's evening before, Auckland's own day, and UTC's for a zone that is none", () => {
  assert.equal(dayWords(END, NY), "Nov 2");
  assert.equal(dayWords(END, "Pacific/Auckland"), "Nov 3");
  for (const zone of ["UTC", "Mars/Olympus", "", null, undefined]) assert.equal(dayWords(END, zone), "Nov 3", zone);
  assert.equal(dayWords(null, NY), "");
  assert.equal(dayWords("not a time", NY), "");
});

test("a trial's end on the bell, in Billing and its words: the day it ends where the business is", () => {
  const now = END_MS - 5 * DAY;
  assert.equal(trialWords(END, now, NY), "5 days left on the trial, until Nov 2");
  const plan = planBilling(
    { mode: "stripe", status: "none", tenant_status: "active" },
    {
      id: "sub_1",
      status: "trialing",
      price_id: "price_1",
      current_period_end: END,
      trial_end: END,
      cancel_at: null,
      cancel_at_period_end: false,
      card_brand: "visa",
      card_last4: "4242",
    },
    now,
    NY,
  );
  assert.deepEqual(plan.bell, {
    title: "Your trial has started",
    body: "5 days left on the trial, until Nov 2. Cancel any time from Billing.",
  });
  const account = {
    mode: "stripe",
    status: "trialing",
    price_id: "price_1",
    current_period_end: END,
    trial_end: END,
    cancel_at: END,
    cancel_at_period_end: false,
    card_brand: "visa",
    card_last4: "4242",
    last_payment_failed_at: null,
    last_paid_at: null,
    updated_at: "2026-10-29T14:00:00Z",
  };
  const vm = toBillingVM({ ready: true, account, price: null, trial_days: 14, role: "owner" }, now, NY);
  assert.ok(
    vm.detail.startsWith("Cancelled: the receptionist answers until Nov 2, then stops"),
    `REGRESSION: Billing said the machine's day: ${vm.detail}`,
  );
});

test("the day a released number goes is said by the workspace's calendar", () => {
  const warned = lineReleaseWarning({
    number: "+13055550100",
    on: END_MS,
    tz: NY,
    forwardedFrom: null,
    billingUrl: null,
  });
  assert.match(warned.body, /goes back to the phone company on Nov 2\./);
});

test("how far back a source reached: the day its oldest came, where the business is", () => {
  const row = {
    source: "google_reviews",
    state: "done",
    counts: { reviews: 3 },
    parts_done: 1,
    parts_total: 1,
    oldest: END,
    started_at: null,
    finished_at: null,
    last_error: null,
    via: null,
  };
  assert.equal(importLineOf(row, NY).says, "3 reviews · since Nov 2");
  assert.equal(importLineOf(row, "Mars/Olympus").says, "3 reviews · since Nov 3");
});

test("a quiet line's last word: the day it came, where the business is", () => {
  const line = {
    id: "ch1",
    kind: "whatsapp",
    number_e164: "+17865550181",
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    last_inbound_at: END,
  };
  const vm = toChannelVM(line, new Date(END_MS + 10 * DAY), NY);
  assert.equal(vm.health, "quiet");
  assert.match(vm.healthLabel, / Nov 2$/);
});

test("a campaign's last send: the day it went, in the zone the report was read in", () => {
  const days = Array.from({ length: 14 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 9, 21 + i)).toISOString().slice(0, 10),
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    opt_ins: 0,
    opt_outs: 0,
  }));
  const source = {
    id: "p1",
    kind: "playbook",
    name: "Win-back",
    template_name: "winback_offer",
    runs: 1,
    sent: 4,
    delivered: 4,
    read: 2,
    replied: 1,
    last_at: END,
  };
  const vm = toCampaignReportVM({
    timezone: NY,
    days: 7,
    span_days: 14,
    today: "2026-11-03",
    series: days,
    sources: [source],
  });
  assert.equal(vm.sources[0].lastLabel, "Nov 2");
});

test("a report's day is the date itself, wherever the machine is", () => {
  assert.equal(fmtDay("2026-09-04"), "Sep 4");
  assert.equal(fmtDay("2026-11-01"), "Nov 1");
});
