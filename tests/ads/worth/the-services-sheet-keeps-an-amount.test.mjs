/**
 * Settings › Business › Services keeps a service's amount (the Ads tracking plan's T6): the box beside the price, for an
 * owner who types it or corrects what AI proposed. The fold's own three run (folds.ts draftOf, problemsOf, saveFold), on
 * the stub React as the page tests load them.
 *
 * What must hold. A save of the sheet never loses an amount it did not change: the list was rebuilt from three keys
 * before this, which would have taken every amount AI's card had set. The box holds the amount with its currency
 * ("45 USD"); a number alone takes the currency the list already uses, and is refused where it uses none, since no
 * currency is ever assumed. An emptied box takes the amount away. What is typed is exact text, never a price note read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newReceptionistDefaults } from "@chanlytics/contracts";
import { installStubReact } from "../../_stub-react.mjs";

installStubReact();
await import("../../receptionist/business-tab/_business-parts.mjs");
const S = globalThis.window.__businessTabSave;
const { loadSaveRules } = await import("../../../apps/dashboard/src/bridge/business-tab.ts");
const { amountBoxOf } = await import("../../../apps/dashboard/src/surfaces/settings/business/model/service-amount.ts");
await loadSaveRules();

const stored = (services) => ({
  brain: { ...newReceptionistDefaults("Harbor Studio"), business_name: "Harbor Studio", profile: { services } },
});
const CUT = { name: "Cut", duration_min: 45, price_note: "from $45", amount_minor: 4500, currency: "USD" };
const COLOUR = { name: "Colour", duration_min: 120, price_note: "quoted at a consult" };
const savedOf = (config, draft) => S.saveFold("services", config, draft).brain.profile.services;

test("a save of the sheet that changes nothing keeps every amount", () => {
  const config = stored([CUT, COLOUR]);
  assert.deepEqual(savedOf(config, S.draftOf("services", config)), [CUT, COLOUR]);
});

test("a change to a service's name, minutes or price keeps its amount", () => {
  const config = stored([CUT]);
  const draft = S.draftOf("services", config).map((row) => ({ ...row, price_note: "from $50", duration_min: "50" }));
  assert.deepEqual(savedOf(config, draft), [{ ...CUT, price_note: "from $50", duration_min: 50 }]);
});

test("the box holds the amount with its currency, and nothing for a service with none", () => {
  assert.equal(amountBoxOf(CUT), "45 USD");
  assert.equal(amountBoxOf({ name: "Tint", amount_minor: 4550, currency: "EUR" }), "45.50 EUR");
  assert.equal(amountBoxOf({ name: "Cut", amount_minor: 4500, currency: "JPY" }), "4500 JPY");
  assert.equal(amountBoxOf(COLOUR), "");
  // The pair alone is an amount: a number with no currency, or a currency with no number, is none.
  assert.equal(amountBoxOf({ name: "Cut", amount_minor: 4500 }), "");
  assert.equal(amountBoxOf({ name: "Cut", currency: "USD" }), "");
  assert.equal(amountBoxOf({ name: "Cut", amount_minor: 45.5, currency: "USD" }), "");
  assert.equal(amountBoxOf({ name: "Free consult", amount_minor: 0, currency: "USD" }), "0 USD");
  assert.equal(amountBoxOf({ ...CUT, amount: "60" }), "60", "what is being typed is shown as typed");
});

test("an amount typed with its currency is kept as whole minor units beside the code", () => {
  const config = stored([CUT, COLOUR]);
  const typed = (amount) => savedOf(config, [CUT, { ...COLOUR, amount }])[1];
  assert.deepEqual(typed("120 USD"), { ...COLOUR, amount_minor: 12000, currency: "USD" });
  assert.deepEqual(typed(" 120.50 eur "), { ...COLOUR, amount_minor: 12050, currency: "EUR" });
  assert.deepEqual(typed("120,50 EUR"), { ...COLOUR, amount_minor: 12050, currency: "EUR" });
  assert.deepEqual(typed("9000 JPY"), { ...COLOUR, amount_minor: 9000, currency: "JPY" });
});

test("a number alone takes its own service's currency, else the one the list already uses", () => {
  const config = stored([CUT, COLOUR]);
  assert.deepEqual(savedOf(config, [{ ...CUT, amount: "50" }, COLOUR])[0], { ...CUT, amount_minor: 5000 });
  assert.deepEqual(savedOf(config, [CUT, { ...COLOUR, amount: "120" }])[1], {
    ...COLOUR,
    amount_minor: 12000,
    currency: "USD",
  });
});

test("an emptied box takes the amount away, and leaves the rest of the service", () => {
  const config = stored([CUT]);
  assert.deepEqual(savedOf(config, [{ ...CUT, amount: "  " }]), [
    { name: "Cut", duration_min: 45, price_note: "from $45" },
  ]);
});

test("what is no amount is said under its box, and nothing is saved over it", () => {
  const problem = (rows, at = 0) => S.problemsOf("services", rows)[`service-${at}-amount`];
  const NOT_MONEY = "A number and its currency, like 45 USD.";
  assert.equal(problem([{ ...CUT, amount: "forty-five" }]), NOT_MONEY);
  assert.equal(problem([{ ...CUT, amount: "from $45" }]), NOT_MONEY, "a price note is never read for a number");
  assert.equal(problem([{ ...CUT, amount: "45.555 USD" }]), NOT_MONEY, "a dollar holds no thousandths");
  assert.equal(problem([{ ...CUT, amount: "4500.5 JPY" }]), NOT_MONEY, "a yen holds no fraction");
  assert.equal(problem([{ ...CUT, amount: "-5 USD" }]), NOT_MONEY);
  // No currency is ever assumed: a number alone on a list that uses none is asked for its currency.
  assert.equal(problem([{ ...COLOUR, amount: "120" }]), "Say its currency too, like 120 USD.");
  assert.equal(problem([CUT, { ...COLOUR, amount: "120" }], 1), undefined, "the list's currency is taken");
  assert.equal(problem([{ ...CUT, amount: "50 USD" }]), undefined);
  assert.equal(problem([CUT]), undefined, "a stored amount nobody typed over is never a problem");
});
