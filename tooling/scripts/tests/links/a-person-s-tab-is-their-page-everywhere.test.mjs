/**
 * A person's tab is their page everywhere their address is read (the wiring's second audit, R3: S1-2, S5-1, S5-2).
 *
 * A tab's press replaces the address with the person's and the tab's word (`clients/<id>/history`, decision 0052), and
 * contracts' personRouteOf is the one parse of it. Every other reader read the person's address as `clients/<id>` alone: Ask
 * lost the person on every tab but Overview (its scope was set only there), the address table opened nothing at a tab, and the
 * page-speed field data counted a tab's press as a visit to the People list. Each reader is run here over every tab a person
 * page has (PERSON_TAB_WORDS), and the address the record writer writes for a tab is read back as that tab.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSON_TAB_WORDS, addressOf, personRouteOf, scopeFromRoute, vitalsPageOf } from "@chanlytics/contracts";

const S = "../../../../apps/dashboard/src";
const { opensRoute } = await import(`${S}/surfaces/addresses.ts`);
const { personRouteId } = await import(`${S}/legacy-bridge/surface-registry.ts`);

const ID = "11111111-2222-4333-8444-555555555555";
const TABS = Object.keys(PERSON_TAB_WORDS).filter((t) => t !== "overview");

test("every tab of a person's page is that person's, by the one parse: Ask's scope, the address table, the registry and the field data", () => {
  assert.ok(TABS.length >= 5, `the tabs a person's page has: ${TABS.join(", ")}`);
  for (const tab of TABS) {
    const param = `${ID}/${tab}`;
    assert.deepEqual(personRouteOf(param), { id: ID, tab }, `${tab}: the one parse`);
    assert.deepEqual(
      scopeFromRoute("clients", param, "Rosa", undefined),
      { kind: "person", id: ID, label: "Rosa" },
      `REGRESSION (S1-2, S5-1): on ${tab}, Ask lost the person it was about`,
    );
    assert.deepEqual(
      opensRoute(`clients/${param}`),
      { ref: { kind: "person", id: ID, tab } },
      `${tab}: the address table opens the person, on that tab`,
    );
    assert.equal(personRouteId("clients", param), ID, `${tab}: the registry's person page`);
    assert.equal(
      vitalsPageOf(`clients/${param}`),
      "person",
      `REGRESSION (S5-2): a press of ${tab} was counted as the People list`,
    );
  }
});

test("the record writer writes a tab as the person's address with its word, and the page reads it back as that tab", () => {
  assert.equal(addressOf({ kind: "person", id: ID }), `clients/${ID}`, "Overview is the person's own address");
  assert.equal(addressOf({ kind: "person", id: ID, tab: "overview" }), `clients/${ID}`);
  for (const tab of TABS) {
    const route = addressOf({ kind: "person", id: ID, tab });
    assert.equal(route, `clients/${ID}/${tab}`, tab);
    assert.deepEqual(opensRoute(route), { ref: { kind: "person", id: ID, tab } }, `${tab}: read back as written`);
  }
});

test("a slash under a person that is no tab of theirs opens nothing, and the scope still finds the person", () => {
  assert.equal(opensRoute(`clients/${ID}/nonsense`), null, "a tab word the page does not know is no address of it");
  assert.equal(opensRoute(`clients/${ID}/history/extra`), null, "nor one with more after it");
  // The scope is the person's whatever the tab says: personRouteOf reads an unknown word as Overview.
  assert.deepEqual(scopeFromRoute("clients", `${ID}/nonsense`, null, undefined), {
    kind: "person",
    id: ID,
    label: "this person",
  });
  assert.equal(scopeFromRoute("clients", "seg:vip", null, undefined), null, "a list is no person");
});
