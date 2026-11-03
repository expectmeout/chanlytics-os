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
  maySpend,
  whyCannotSpend,
  receptionistOn,
  trialDaysFor,
  trialSpentOf,
  trialUseWords,
  leadAllowanceFor,
  BILLING_STATUSES,
  BILLING_TRIAL_DAYS,
  LEAD_MONTHLY_ALLOWANCE,
  LEAD_TRIAL_ALLOWANCE,
  SPEND_KINDS,
  SPEND_REHEARSE,
  SPEND_REVIEW,
  SPEND_TEXTING,
  SPEND_TRY,
  TRIAL_COVERS,
  TRIAL_INCLUDES,
} from "@chanlytics/contracts";
import { readCode } from "../_source.mjs";

test("the whole matrix: two modes by nine statuses by four kinds, stated rather than inferred", () => {
  // Written out so a change to either function shows up as a diff a reviewer
  // reads, not as a test that still passes because it derives its expectation
  // from the code under test. The trial covers everything (decision 0090, Ruben, 3 Nov 2026): a number, texting and the
  // finder may spend on a trial as on a plan; a rehearsal before any plan too, since the first run rehearses first.
  const paying = { trialing: true, active: true };
  const SPEND = {
    number: paying,
    texting: paying,
    leads: paying,
    rehearse: { none: true, ...paying },
  };
  for (const kind of SPEND_KINDS) {
    for (const status of BILLING_STATUSES) {
      assert.equal(maySpend("stripe", status, kind), SPEND[kind][status] === true, `stripe/${status}/${kind}`);
      // Every workspace that predates Stripe. Invoiced by hand, never asked for a card, so the question does not
      // apply -- the same carve-out tenantStatusFor already makes.
      assert.equal(maySpend("direct", status, kind), true, `direct/${status}/${kind}`);
    }
  }
  // The default is the number's row, as every lines route has always asked it.
  for (const status of BILLING_STATUSES) assert.equal(maySpend("stripe", status), maySpend("stripe", status, "number"));
});

test("answering is generous where spending is strict, and the gap is the point", () => {
  // The statuses where they deliberately disagree. `none` is a workspace that never entered a card; `incomplete` is the
  // minutes between Checkout opening and the first payment, which is exactly what an abandoned Checkout leaves behind.
  // Both are fine reasons to keep answering someone who is mid-conversation. Neither is a reason to spend money with a
  // provider. past_due joins them: the last charge failed and Stripe is retrying, so the receptionist keeps answering
  // while nothing new is bought on our account.
  for (const status of ["none", "incomplete", "past_due"]) {
    assert.equal(receptionistOn(status), true, `${status}: still answers`);
    assert.equal(maySpend("stripe", status), false, `${status}: does not spend`);
  }
  assert.equal(
    whyCannotSpend("stripe", "past_due"),
    "Your last payment did not go through. Update the card in Billing, then try again.",
  );
  // And where they agree, they agree for the same reason: a trial and a plan answer and spend alike (decision 0090).
  for (const status of ["trialing", "active"]) {
    assert.equal(receptionistOn(status), true);
    assert.equal(maySpend("stripe", status), true);
  }
  for (const status of ["canceled", "unpaid", "paused", "incomplete_expired"]) {
    assert.equal(receptionistOn(status), false);
    assert.equal(maySpend("stripe", status), false);
  }
});

test("a rehearsal is open before any plan, which is where the first run's Rehearse stands", () => {
  // The first run's step 3 comes before Go live. Its call, its typed try, its review and its fix each declared a spend,
  // and the spend rule refused a workspace that had never entered a card: every new owner met a 402 there.
  for (const words of [SPEND_REHEARSE, SPEND_REVIEW, SPEND_TRY]) {
    assert.equal(words.kind, "rehearse");
    assert.equal(whyCannotSpend("stripe", "none", words), null, `${words.before}: open before the plan`);
    assert.equal(whyCannotSpend("stripe", "trialing", words), null);
    assert.match(whyCannotSpend("stripe", "past_due", words), /Update the card/);
  }
});

test("a refusal says what to do about it, because it lands where somebody is trying to pay", () => {
  assert.equal(whyCannotSpend("stripe", "active"), null);
  assert.equal(whyCannotSpend("stripe", "trialing"), null, "a trial buys its number");
  assert.equal(whyCannotSpend("stripe", "trialing", SPEND_TEXTING), null, "and files for texting");
  assert.equal(whyCannotSpend("direct", "none"), null, "a grandfathered workspace is never refused");

  assert.equal(whyCannotSpend("stripe", "none"), "Start your free trial from Billing before buying a number.");
  assert.equal(
    whyCannotSpend("stripe", "none", SPEND_TEXTING),
    "Start your free trial from Billing before registering for texting.",
  );

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

test("one trial from every door: the deployment's length, once", () => {
  assert.equal(trialDaysFor({ hadSubscription: false }), BILLING_TRIAL_DAYS);
  assert.equal(trialDaysFor({ hadSubscription: false, deploymentDays: 7 }), 7);
  assert.equal(trialDaysFor({ hadSubscription: false, deploymentDays: 0 }), 0, "a deployment may choose none");
  assert.equal(
    trialDaysFor({ hadSubscription: false, deploymentDays: 120 }),
    BILLING_TRIAL_DAYS,
    "past 90 is no setting",
  );
  assert.equal(trialDaysFor({ hadSubscription: true, deploymentDays: 14 }), 0, "a trial applies once");
  // The checkout asks it, whichever door it was pressed from (billing.test.mjs reads the checkout's call).
});

test("what a trial includes: near at four fifths of either, spent at all of either", () => {
  const minutes = TRIAL_INCLUDES.callMinutes * 60;
  assert.deepEqual(trialSpentOf({ callSeconds: 0, replies: 0 }), { share: 0, near: false, spent: false });
  assert.equal(trialSpentOf({ callSeconds: minutes * 0.79, replies: 0 }).near, false);
  assert.equal(trialSpentOf({ callSeconds: minutes * 0.8, replies: 0 }).near, true);
  assert.equal(trialSpentOf({ callSeconds: 0, replies: TRIAL_INCLUDES.replies }).spent, true, "replies alone spend it");
  assert.equal(trialSpentOf({ callSeconds: minutes, replies: 0 }).spent, true, "minutes alone spend it");
  assert.equal(
    trialUseWords({ callSeconds: 62 * 60 + 59, replies: 310 }),
    "62 of 150 call minutes · 310 of 1,000 replies",
  );
  assert.match(TRIAL_COVERS, /150 call minutes, 1,000 replies and 50 leads/);
  assert.equal(TRIAL_INCLUDES.leads, LEAD_TRIAL_ALLOWANCE);
  assert.equal(leadAllowanceFor("trialing"), LEAD_TRIAL_ALLOWANCE);
  assert.equal(leadAllowanceFor("active"), LEAD_MONTHLY_ALLOWANCE);
});

test("both money routes carry the second door", () => {
  // requireRole asks whether this PERSON may act for the workspace.
  // requireSpend asks whether the WORKSPACE may spend our money. A money route
  // needs both, and for months had only the first. The edge behind them is
  // reachable with the diagnostic key alone, so it asks the same question on
  // its own side of the wire -- run, not read, in lines-door.test.mjs: `buy`
  // and `register` refused with the reason for every status that may not
  // spend, and the one free filing (a rejected campaign corrected in place)
  // let through a lapsed card.
  for (const route of ["buy", "register"]) {
    // Both doors are declared on the export; route() performs them, and its
    // pipeline refuses a workspace that may not spend BEFORE it spends a
    // rate-limit token on a request that cannot proceed.
    const src = readCode(`apps/dashboard/app/api/v1/lines/${route}/route.ts`);
    // The partner who brought the workspace gets its number (0012); the workspace's own plan pays for it.
    assert.ok(src.includes('role: "partner",'), `${route}: role`);
    assert.ok(src.includes("spend: true,"), `${route}: spend`);
  }

  const guard = readCode("apps/dashboard/src/server/with-route.ts");
  assert.ok(guard.includes("export async function requireSpend("));
  assert.ok(
    guard.includes('throw new AppError("payment_required"'),
    "402, not 403: the fix is a card, not a different account",
  );
  assert.ok(/if \(!data\)\s*throw new AppError\("payment_required"/.test(guard), "no billing row is not permission");
});

test("payment_required is its own code, mapped to 402", () => {
  // A client that renders it as "forbidden" sends the owner to the wrong page:
  // nothing is wrong with their account or their role.
  const errors = readCode("packages/contracts/src/shared/errors.ts");
  assert.ok(errors.includes('"payment_required",'));
  assert.ok(errors.includes("payment_required: 402,"));
});

test("Setup does not offer a button the server will refuse", async () => {
  const { setupSteps } = await import("@chanlytics/contracts");
  const base = {
    business: {
      name: "Northside Movers",
      hours: true,
      services: 3,
      bookingLink: true,
      address: true,
      handoff: null,
      broken: false,
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0 },
    requests: { line: null },
    later: [],
    lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  };
  const bill = (status, mode = "stripe") => ({
    ready: true,
    mode,
    status,
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
  });
  const lineRow = (vm) => vm.rows.find((r) => r.id === "line");

  // No plan yet: the number starts the free trial, and the row says so and goes where both happen -- the first run's
  // Where it answers, where the number is chosen, then Go live, whose checkout starts the trial (decisions 0073, 0090)
  // -- rather than offering a number the route will refuse with a 402.
  const none = lineRow(setupSteps({ ...base, billing: bill("none") }, Date.now()));
  assert.deepEqual(none.verb, { label: "Get a number", to: "start/channels" });
  assert.equal(none.sentence, "Get a number for calls: it starts your free trial.");
  // A trial already running covers the number (decision 0090): the button, as a plan's.
  const trial = lineRow(setupSteps({ ...base, billing: bill("trialing") }, Date.now()));
  assert.deepEqual(trial.verb, { label: "Get a line", to: "verb:choose-line" });
  // Anything else that may not spend is Billing's, in the refusal's own words.
  const lapsed = lineRow(setupSteps({ ...base, billing: bill("past_due") }, Date.now()));
  assert.deepEqual(lapsed.verb, { label: "Open Billing", to: "admin/billing" });
  assert.equal(lapsed.sentence, whyCannotSpend("stripe", "past_due"));

  // Paying: the button.
  const paying = lineRow(setupSteps({ ...base, billing: bill("active") }, Date.now()));
  assert.deepEqual(paying.verb, { label: "Get a line", to: "verb:choose-line" });

  // Grandfathered, and workspaces on deployments with no billing at all.
  const direct = lineRow(setupSteps({ ...base, billing: bill("none", "direct") }, Date.now()));
  assert.equal(direct.verb.to, "verb:choose-line", "a direct workspace is never asked for a card");
  const noBilling = lineRow(setupSteps(base, Date.now()));
  assert.equal(noBilling.verb.to, "verb:choose-line", "and neither is a deployment that cannot charge");
});
