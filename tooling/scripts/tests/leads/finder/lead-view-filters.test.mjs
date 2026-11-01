/**
 * A filtered view of Leads is an address, and the read takes its filters (decision 0083, Phase B; the spec's §21): the
 * Excluded view's criterion, a fit and the Filter's reaches are chips of the route, in release C's grammar
 * (`docs/plans/2026-09-19-lead-finder-C-extras.md`, item 2), and the box's words ride in the read alone. A selection
 * belongs to the view without its chips, so a narrowing never clears it (§6.8).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadsRoute, leadsRouteUnchipped, parseLeadsRoute } from "@chanlytics/contracts";
import {
  LeadExportQuerySchema,
  LeadsBulkSchema,
  LeadsQuerySchema,
} from "../../../../../packages/contracts/src/leads/lead-plan-schema.ts";

const SEARCH = "5e000000-0000-4000-8000-000000000001";
const LEAD = "1ead0000-0000-4000-8000-000000000009";

test("a view's chips are segments of its route, after the class and before the open lead, each once in one order", () => {
  const route = leadsRoute({
    searchId: SEARCH,
    cls: "excluded",
    chips: { excluded_by: "wrong_kind", fit: "strong", reach: ["phone", "email"] },
    peek: LEAD,
  });
  assert.equal(route, `clients/leads:s-${SEARCH}:c-excluded:x-wrong_kind:f-strong:r-email:r-phone:p-${LEAD}`);
  assert.deepEqual(parseLeadsRoute(route), {
    searchId: SEARCH,
    list: "all",
    cls: "excluded",
    chips: { excluded_by: "wrong_kind", fit: "strong", reach: ["email", "phone"] },
    peek: LEAD,
  });
});

test("every set of chips reads back as the route that wrote it", () => {
  const sets = [
    {},
    { fit: "look" },
    { reach: ["email"] },
    { reach: ["phone"] },
    { reach: ["email", "phone"] },
    { excluded_by: "chain" },
    { excluded_by: "unreachable", reach: ["email"] },
    { fit: "long", reach: ["phone"] },
  ];
  for (const chips of sets)
    for (const list of ["all", "ready"]) {
      const route = leadsRoute({ list, chips });
      const back = parseLeadsRoute(route);
      assert.deepEqual(back.chips, chips, route);
      assert.equal(leadsRoute({ list: back.list, chips: back.chips }), route, route);
    }
});

test("a chip the grammar does not hold is dropped, never read as another", () => {
  assert.deepEqual(parseLeadsRoute("clients/leads:f-great:r-fax:x-Not_A_Key:x-").chips, {});
  assert.equal(
    leadsRoute({ chips: { excluded_by: "two words" } }),
    "clients/leads",
    "a criterion that is not a key is no segment",
  );
  assert.deepEqual(parseLeadsRoute("clients/leads:r-phone:r-email:r-phone").chips, { reach: ["email", "phone"] });
});

test("a selection belongs to the view without its chips: a narrowing keeps it, a new search or list does not", () => {
  const view = leadsRoute({ searchId: SEARCH, list: "ready" });
  const chipped = leadsRoute({ searchId: SEARCH, list: "ready", chips: { fit: "strong", reach: ["email"] } });
  assert.equal(leadsRouteUnchipped(chipped), view);
  assert.equal(leadsRouteUnchipped(view), view);
  assert.notEqual(
    leadsRouteUnchipped(leadsRoute({ searchId: SEARCH, list: "nurture", chips: { fit: "strong" } })),
    view,
  );
});

test("the read takes the filters: the words trimmed, a criterion's key, a fit, and the reaches as a query or a body says them", () => {
  const q = LeadsQuerySchema.parse({ q: "  plumb  ", excluded_by: "chain", fit: "strong", reach: "phone,email" });
  assert.equal(q.q, "plumb");
  assert.equal(q.excluded_by, "chain");
  assert.equal(q.fit, "strong");
  assert.deepEqual(q.reach, ["email", "phone"], "a query's reaches, in the set's order");
  assert.deepEqual(LeadsQuerySchema.parse({ reach: ["phone"] }).reach, ["phone"], "a body's list");
  const none = LeadsQuerySchema.parse({});
  for (const k of ["q", "excluded_by", "fit", "reach"]) assert.equal(none[k], undefined, `${k} is not asked`);
  for (const bad of [
    { fit: "great" },
    { excluded_by: "Two Words" },
    { reach: "fax" },
    { reach: "email,email,phone" },
    { q: "x".repeat(81) },
  ])
    assert.equal(LeadsQuerySchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("the export and a bulk act by view carry the filters the read takes, so the file and the act are the rows shown", () => {
  const view = { search: SEARCH, list: "all", sort: "fit", dir: "asc", fit: "strong", reach: ["email"] };
  const file = LeadExportQuerySchema.parse(view);
  assert.equal(file.fit, "strong");
  assert.deepEqual(file.reach, ["email"]);
  const act = LeadsBulkSchema.parse({ by: "view", action: "contacted", view: { ...view, q: "salon" } });
  assert.equal(act.view.q, "salon");
  assert.equal(act.view.fit, "strong");
  assert.deepEqual(act.view.reach, ["email"]);
});
