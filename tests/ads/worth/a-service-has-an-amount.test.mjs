/**
 * A service has an amount beside its price note (the Ads tracking plan's T6 and its call 5): what one visit of it is
 * worth to the business, a whole number of a currency's minor units beside the currency's code. AI proposes it from
 * the note on one card, for every service at once, and the owner approves it once. Nothing reads a note for a number
 * by itself.
 *
 * What must hold. Settings keep an amount only as a pair, a number with its currency. The card sets the amount of a
 * service already listed and adds none; it says each amount in its own currency. AI's proposal names services as the
 * list has them, or it is refused with the names it got wrong. A service's price note, its minutes and what customers
 * are told of it are untouched by any of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AskSettingsChangeSchema,
  PROPOSAL_SPECS,
  ServiceSchema,
  allowedPrices,
  applySettingsChange,
  describeSettingsChange,
  newReceptionistDefaults,
  parseTenantConfigResult,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

/* ------------------------------------------------------------- what settings keep */

test("a service keeps an amount beside its price note: whole minor units and a currency's code", () => {
  const cut = { name: "Cut", duration_min: 45, price_note: "from $45", amount_minor: 4500, currency: "USD" };
  assert.deepEqual(ServiceSchema.parse(cut), cut);
  assert.deepEqual(ServiceSchema.parse({ name: "Cut", price_note: "from $45" }), {
    name: "Cut",
    price_note: "from $45",
  });
  const free = { name: "Free consult", amount_minor: 0, currency: "USD" };
  assert.deepEqual(ServiceSchema.parse(free), free, "nothing is an amount too");
});

test("settings refuse an amount that is not money: a fraction of a minor unit, below none, or no currency code", () => {
  const bad = (more) => ServiceSchema.safeParse({ name: "Cut", ...more }).success;
  assert.equal(bad({ amount_minor: 45.5, currency: "USD" }), false);
  assert.equal(bad({ amount_minor: -1, currency: "USD" }), false);
  assert.equal(bad({ amount_minor: 4500, currency: "usd" }), false);
  assert.equal(bad({ amount_minor: 4500, currency: "dollars" }), false);
  assert.equal(bad({ amount_minor: 4500, currency: "EUR" }), true);
});

test("the whole settings record takes a service with an amount and hands it back", () => {
  const parsed = parseTenantConfigResult({
    brain: {
      ...newReceptionistDefaults("Harbor Studio"),
      business_name: "Harbor Studio",
      profile: { services: [{ name: "Cut", price_note: "from $45", amount_minor: 4500, currency: "USD" }] },
    },
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues));
  assert.deepEqual(parsed.config.brain.profile.services[0], {
    name: "Cut",
    price_note: "from $45",
    amount_minor: 4500,
    currency: "USD",
  });
});

test("an amount is never a price AI may say: what customers are told still reads the note alone", () => {
  const brain = {
    business_name: "Harbor Studio",
    profile: {
      guardrails: { never_quote_prices: false },
      services: [{ name: "Cut", price_note: "quoted at a consult", amount_minor: 4500, currency: "USD" }],
    },
  };
  assert.deepEqual(allowedPrices(brain, "America/New_York", new Date("2026-11-21T12:00:00Z")), []);
});

/* ---------------------------------------------------------------------- the card */

/** A stored service's amount as its pair. */
const amountOf = (service) => [service.amount_minor, service.currency];

const AMOUNTS = {
  op: "set_service_amounts",
  amounts: [
    { name: "Cut", amount_minor: 4500, currency: "USD" },
    { name: "balayage ", amount_minor: 18000, currency: "USD" },
  ],
};
const CONFIG = {
  features: { vision: true },
  brain: {
    ...newReceptionistDefaults("Harbor Studio"),
    business_name: "Harbor Studio",
    profile: {
      services: [
        { name: "Cut", duration_min: 45, price_note: "from $45" },
        { name: "Balayage", duration_min: 180, price_note: "$180+" },
        { name: "Colour correction", price_note: "quoted at a consult" },
      ],
    },
  },
};

test("the card's change is every service's amount at once, each a name, whole minor units and a currency", () => {
  // A name is kept without the space around it; nothing else of it is touched.
  assert.deepEqual(AskSettingsChangeSchema.parse(AMOUNTS), {
    op: "set_service_amounts",
    amounts: [AMOUNTS.amounts[0], { name: "balayage", amount_minor: 18000, currency: "USD" }],
  });
  const bad = (amounts) => AskSettingsChangeSchema.safeParse({ op: "set_service_amounts", amounts }).success;
  assert.equal(bad([]), false, "a card with nothing on it");
  assert.equal(bad([{ name: "Cut", amount_minor: 45.5, currency: "USD" }]), false);
  assert.equal(bad([{ name: "Cut", amount_minor: 4500, currency: "usd" }]), false);
  assert.equal(bad([{ name: "", amount_minor: 4500, currency: "USD" }]), false);
});

test("approved, it sets the amount of each service named, by its name as the owner reads it, and touches nothing else", () => {
  const after = applySettingsChange(CONFIG, AMOUNTS);
  assert.deepEqual(after.brain.profile.services, [
    { name: "Cut", duration_min: 45, price_note: "from $45", amount_minor: 4500, currency: "USD" },
    { name: "Balayage", duration_min: 180, price_note: "$180+", amount_minor: 18000, currency: "USD" },
    { name: "Colour correction", price_note: "quoted at a consult" },
  ]);
  assert.equal(after.features.vision, true, "the rest of the settings ride along");
  assert.deepEqual(CONFIG.brain.profile.services[0], { name: "Cut", duration_min: 45, price_note: "from $45" });
});

test("it adds no service: a name the list does not hold is left alone", () => {
  const after = applySettingsChange(CONFIG, {
    op: "set_service_amounts",
    amounts: [{ name: "Perm", amount_minor: 9000, currency: "USD" }],
  });
  assert.deepEqual(after.brain.profile.services, CONFIG.brain.profile.services);
});

test("a second card replaces an amount: the owner's last approval stands", () => {
  const once = applySettingsChange(CONFIG, AMOUNTS);
  const twice = applySettingsChange(once, {
    op: "set_service_amounts",
    amounts: [{ name: "Cut", amount_minor: 5000, currency: "USD" }],
  });
  assert.deepEqual(amountOf(twice.brain.profile.services[0]), [5000, "USD"]);
  assert.deepEqual(amountOf(twice.brain.profile.services[1]), [18000, "USD"]);
});

test("the card says each service with its amount, in the amount's own currency", () => {
  assert.equal(describeSettingsChange(AMOUNTS), "Cut $45 · balayage $180");
  assert.equal(
    describeSettingsChange({
      op: "set_service_amounts",
      amounts: [{ name: "Corte", amount_minor: 4000, currency: "EUR" }],
    }),
    "Corte €40",
  );
  const yen = { op: "set_service_amounts", amounts: [{ name: "Cut", amount_minor: 4500, currency: "JPY" }] };
  assert.equal(describeSettingsChange(yen), "Cut ¥4,500", "a yen has no cents");
  const cents = { op: "set_service_amounts", amounts: [{ name: "Gloss", amount_minor: 3550, currency: "USD" }] };
  assert.equal(describeSettingsChange(cents), "Gloss $35.50");
});

test("approved, the card saves the settings with the amounts in them, says itself, opens Services and can be put back", () => {
  const spec = PROPOSAL_SPECS.settings;
  const proposal = { kind: "settings", summary: describeSettingsChange(AMOUNTS), payload: { change: AMOUNTS } };
  const tab = { settings: { config: CONFIG, version: 4 } };
  const call = spec.commit(proposal, tab);
  assert.equal(call.route, "PUT settings");
  assert.equal(call.body.version, 4);
  assert.deepEqual(amountOf(call.body.config.brain.profile.services[0]), [4500, "USD"]);
  assert.equal(spec.receipt(proposal), "Cut $45 · balayage $180");
  assert.equal(spec.open(proposal), "admin/workspace/services", "the card opens where a service's amount is kept");
  // Put back: the settings as they were before the card, while nothing else has been saved since.
  const undo = spec.undo.record(proposal, { version: 5 }, tab);
  assert.deepEqual(spec.undo.call(undo, { settings: { config: call.body.config, version: 5 } }), {
    route: "PUT settings",
    body: { config: CONFIG, version: 5 },
  });
});

/* ---------------------------------------------------------------- AI's proposal */

const T = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-21T19:10:00Z");
function toolWorld(role = "owner") {
  readerCache.clear();
  const supabase = fakeDb({ tenant_config: [{ tenant_id: T, version: 4, config: CONFIG }] }, {}, {});
  const context = { supabase, userId: "u1", email: "ada@example.com", params: {} };
  return newToolContext(context, T, role, "America/New_York", NOW);
}
const proposeWorth = (amounts, role) =>
  buildProposal(toolWorld(role), "propose_settings", { action: "worth", amounts });

test("AI proposes every amount on one card, in whole units of a currency, as it read them from the price notes", async () => {
  const out = await proposeWorth([
    { name: "Cut", amount: 45, currency: "USD" },
    { name: " balayage", amount: 180.5, currency: "usd" },
  ]);
  assert.equal(out.isError, false, out.result);
  assert.equal(out.proposal.kind, "settings");
  assert.equal(out.proposal.title, "What each service is worth");
  assert.equal(out.proposal.summary, "Cut $45 · Balayage $180.50");
  assert.deepEqual(out.proposal.payload.change, {
    op: "set_service_amounts",
    amounts: [
      { name: "Cut", amount_minor: 4500, currency: "USD" },
      { name: "Balayage", amount_minor: 18050, currency: "USD" },
    ],
  });
});

test("a yen has no cents: the amount is kept in the currency's own minor units", async () => {
  const out = await proposeWorth([{ name: "Cut", amount: 4500, currency: "JPY" }]);
  assert.deepEqual(out.proposal.payload.change.amounts, [{ name: "Cut", amount_minor: 4500, currency: "JPY" }]);
});

test("a service the list does not hold is refused by name, and no card is made", async () => {
  const out = await proposeWorth([
    { name: "Cut", amount: 45, currency: "USD" },
    { name: "Perm", amount: 90, currency: "USD" },
  ]);
  assert.equal(out.isError, true);
  assert.match(JSON.parse(out.result).error, /Perm/);
  assert.match(JSON.parse(out.result).error, /Cut, Balayage, Colour correction/, "it is told the names the list holds");
});

test("a service given two amounts is refused: the card would say one and keep another", async () => {
  const out = await proposeWorth([
    { name: "Cut", amount: 45, currency: "USD" },
    { name: "cut ", amount: 50, currency: "USD" },
  ]);
  assert.equal(out.isError, true);
  assert.match(JSON.parse(out.result).error, /named twice/);
});

test("an amount that is no money is refused: below none, or no currency code", async () => {
  for (const one of [
    { name: "Cut", amount: -5, currency: "USD" },
    { name: "Cut", amount: 45, currency: "dollars" },
  ]) {
    const out = await proposeWorth([one]);
    assert.equal(out.isError, true, JSON.stringify(one));
  }
});

test("it is the owner's and the admin's card: a member below them is refused", async () => {
  const out = await proposeWorth([{ name: "Cut", amount: 45, currency: "USD" }], "viewer");
  assert.equal(out.isError, true);
});
