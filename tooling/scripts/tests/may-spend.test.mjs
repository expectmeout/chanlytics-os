/**
 * Who may spend money on Chanlytics' own account.
 *
 * THE DEFECT THIS EXISTS FOR. `receptionistOn` answered one question — may the
 * receptionist answer? — and two money routes were written as though it
 * answered a second: may this workspace buy things on our Twilio account?
 * It admits `none`, which is what a workspace has before anybody enters a
 * card, so:
 *
 *   signup -> owner of a new workspace -> POST /lines/buy      $1.15 a month
 *                                      -> POST /lines/register $19.50 one time
 *
 * three times an hour, with every check in the request passing. A hundred
 * signups doing that is about two thousand dollars on a balance that was
 * $12.85 on the day this was found.
 *
 * The two questions have opposite risk profiles, which is why they are now two
 * functions: getting `receptionistOn` wrong drops a live conversation the
 * customer feels immediately, so it is generous; getting `maySpend` wrong costs
 * real money the customer never notices, so it is strict.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maySpend, whyCannotSpend, receptionistOn,
  BILLING_STATUSES, BILLING_MODES,
} from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

test("the whole matrix: two modes by nine statuses, stated rather than inferred", () => {
  // Written out so a change to either function shows up as a diff a reviewer
  // reads, not as a test that still passes because it derives its expectation
  // from the code under test.
  const SPEND = {
    stripe: {
      none: false, incomplete: false, incomplete_expired: false,
      trialing: true, active: true, past_due: false,
      canceled: false, unpaid: false, paused: false,
    },
    // Every workspace that predates Stripe. Invoiced by hand, never asked for
    // a card, so the question does not apply — the same carve-out
    // tenantStatusFor already makes.
    direct: Object.fromEntries(BILLING_STATUSES.map((s) => [s, true])),
  };
  for (const mode of BILLING_MODES) {
    for (const status of BILLING_STATUSES) {
      assert.equal(maySpend(mode, status), SPEND[mode][status], `${mode}/${status}`);
    }
  }
});

test("answering is generous where spending is strict, and the gap is the point", () => {
  // The two statuses where they deliberately disagree. `none` is a workspace
  // that never entered a card; `incomplete` is the minutes between Checkout
  // opening and the first payment, which is exactly what an abandoned Checkout
  // leaves behind. Both are fine reasons to keep answering someone who is
  // mid-conversation. Neither is a reason to spend.
  // past_due joins them: the last charge failed and Stripe is retrying, so the
  // receptionist keeps answering while nothing new is bought on our account.
  for (const status of ["none", "incomplete", "past_due"]) {
    assert.equal(receptionistOn(status), true, `${status}: still answers`);
    assert.equal(maySpend("stripe", status), false, `${status}: does not spend`);
  }
  assert.equal(whyCannotSpend("stripe", "past_due"), "Your last payment did not go through. Update the card in Billing, then try again.");
  // And where they agree, they agree for the same reason.
  for (const status of ["trialing", "active"]) {
    assert.equal(receptionistOn(status), true);
    assert.equal(maySpend("stripe", status), true);
  }
  for (const status of ["canceled", "unpaid", "paused", "incomplete_expired"]) {
    assert.equal(receptionistOn(status), false);
    assert.equal(maySpend("stripe", status), false);
  }
});

test("a refusal says what to do about it, because it lands where somebody is trying to pay", () => {
  assert.equal(whyCannotSpend("stripe", "active"), null);
  assert.equal(whyCannotSpend("direct", "none"), null, "a grandfathered workspace is never refused");

  const none = whyCannotSpend("stripe", "none");
  assert.match(none, /Add a card/);
  assert.match(none, /nothing is charged until your trial ends/, "the reassurance is the half that gets them to do it");

  assert.match(whyCannotSpend("stripe", "incomplete"), /Finish checkout/);
  for (const dead of ["paused", "canceled", "incomplete_expired"]) {
    assert.match(whyCannotSpend("stripe", dead), /not subscribed/, dead);
  }
  // Every refusal names a destination. A 402 with no next step is a dead end.
  for (const status of BILLING_STATUSES) {
    const why = whyCannotSpend("stripe", status);
    if (why) assert.match(why, /Billing|checkout|card/i, `${status}: says where to go`);
  }
});

test("both money routes carry the second door, and so does the edge behind them", () => {
  // requireRole asks whether this PERSON may act for the workspace.
  // requireSpend asks whether the WORKSPACE may spend our money. A money route
  // needs both, and for months had only the first.
  for (const route of ["buy", "register"]) {
    // Both doors are declared on the export; route() performs them, and its
    // pipeline refuses a workspace that may not spend BEFORE it spends a
    // rate-limit token on a request that cannot proceed.
    const src = readCode(`apps/dashboard/app/api/v1/lines/${route}/route.ts`);
    assert.ok(src.includes('role: "owner",'), `${route}: role`);
    assert.ok(src.includes("spend: true,"), `${route}: spend`);
  }

  const guard = readCode("apps/dashboard/src/server/with-route.ts");
  assert.ok(guard.includes("export async function requireSpend("));
  assert.ok(guard.includes('throw new AppError("payment_required"'), "402, not 403: the fix is a card, not a different account");
  assert.ok(guard.includes('if (!data) throw new AppError("payment_required"'), "no billing row is not permission");

  // The edge is reachable with the diagnostic key alone, so it must not take
  // the dashboard's word for it.
  const edge = readCode("apps/edge/api/admin/lines.ts");
  assert.ok(edge.includes('if (op === "buy") {\n    const refused = await refuseIfCannotSpend();'));
  assert.ok(edge.includes("whyCannotSpend(bill.data.mode as BillingMode, bill.data.status as BillingStatus)"));
  assert.ok(edge.includes('json(402, { ok: false, error: "payment_required"'));
  // The gate asks what the FILING will be, not what the flag is called. Only
  // the in-place resubmit of a rejected campaign is the free correction a
  // lapsed card must not stop; a rehearsal made real files the workspace's
  // first real brand ($19.50) and `replace` files a fresh campaign ($15).
  assert.ok(edge.includes("const correctingInPlace = refile && onFile && row.data.sms_state === \"rejected\" && !replace;"), "the one free path is named");
  assert.ok(edge.includes("if (!correctingInPlace) {"), "and everything else that files is gated like a first filing");
  assert.ok(!edge.includes('body.refile !== true'), "REGRESSION: the flag is not the question");
});

test("payment_required is its own code, mapped to 402", () => {
  // A client that renders it as "forbidden" sends the owner to the wrong page:
  // nothing is wrong with their account or their role.
  const errors = readCode("packages/contracts/src/errors.ts");
  assert.ok(errors.includes('"payment_required",'));
  assert.ok(errors.includes("payment_required: 402,"));
});

test("Setup does not offer a button the server will refuse", async () => {
  const { setupSteps } = await import("@chanlytics/contracts");
  const base = {
    business: { name: "Northside Movers", hours: true, services: 3, bookingLink: true, address: true, handoff: null, broken: false },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0 }, requests: { line: null }, later: [],
    lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  };
  const bill = (status, mode = "stripe") => ({
    ready: true, mode, status, trial_end: null, current_period_end: null, trial_days: 14,
  });
  const lineRow = (vm) => vm.rows.find((r) => r.id === "line");

  // No card: the honest next step is the card, and the row says so rather than
  // offering a number the route will refuse with a 402.
  const unpaid = lineRow(setupSteps({ ...base, billing: bill("none") }, Date.now()));
  assert.equal(unpaid.verb.to, "admin/billing");
  assert.match(unpaid.sentence, /Add a card/);
  assert.ok(unpaid.details.some((d) => /Nothing is charged until your trial ends/.test(d)), "and the reassurance travels with it");

  // On trial with a card: unchanged.
  const paying = lineRow(setupSteps({ ...base, billing: bill("trialing") }, Date.now()));
  assert.deepEqual(paying.verb, { label: "Get a line", to: "verb:choose-line" });

  // Grandfathered, and workspaces on deployments with no billing at all.
  const direct = lineRow(setupSteps({ ...base, billing: bill("none", "direct") }, Date.now()));
  assert.equal(direct.verb.to, "verb:choose-line", "a direct workspace is never asked for a card");
  const noBilling = lineRow(setupSteps(base, Date.now()));
  assert.equal(noBilling.verb.to, "verb:choose-line", "and neither is a deployment that cannot charge");
});
