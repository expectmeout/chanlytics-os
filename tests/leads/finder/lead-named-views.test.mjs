/**
 * Named views on Leads (the table review of 5 Nov 2026): a view of the list a member keeps under a name, and three the
 * product offers, in a Saved section of the rail. The rules are contracts' and pure (leads/sheet/lead-named-views.ts); the
 * section and its hook are drawn from the real TSX on the stub React. They are kept at memberships.views["leads-named"],
 * through the door any page's saved view goes through, so nothing about them needs a migration. Every name is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadsRoute, parseLeadsRoute } from "@chanlytics/contracts";
import {
  LEAD_NAMED_MAX,
  LEAD_NAMED_WORDS,
  LEAD_STARTER_VIEWS,
  leadNamedActive,
  leadNamedAdd,
  leadNamedChanged,
  leadNamedRouteFor,
  leadNamedViewsOf,
} from "../../../apps/dashboard/src/surfaces/leads/scope/named-views.ts";
import { installStubReact, fresh, again, all, byTestId, find, textOf } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";

installStubReact();
const { LeadsRailViews, useLeadNamedViews } = await importSrc("apps/dashboard/src/surfaces/leads/scope/rail-views.tsx");

const h = (...a) => globalThis.React.createElement(...a);
const SEARCH = "5e000000-0000-4000-8000-000000000001";
const GONE = "5e000000-0000-4000-8000-00000000dead";

const view = (over = {}) => ({
  id: "v1",
  name: "Call these Monday",
  route: leadsRoute({ chips: { reach: ["phone"] } }),
  sortBy: "stage",
  sortDir: "asc",
  columns: {},
  order: [],
  density: "compact",
  ...over,
});

test("six full views fit what the door takes, with the longest name, a search's id and every chip", () => {
  const route = leadsRoute({
    searchId: SEARCH,
    list: "not_a_fit",
    cls: "qualified",
    chips: {
      excluded_by: "wrong_kind",
      fit: "strong",
      reach: ["email", "phone"],
      status_group: ["needs", "in", "none"],
    },
  });
  let list = [];
  for (let i = 0; i < LEAD_NAMED_MAX; i += 1) {
    const made = leadNamedAdd(list, { ...view({ name: "N".repeat(32), route, sortBy: "business", sortDir: "desc" }) });
    assert.ok(made.list, made.refused);
    list = made.list;
  }
  assert.equal(list.length, 6);
  assert.ok(JSON.stringify({ list }).length <= 2000, `${JSON.stringify({ list }).length} characters`);
});

test("a seventh is refused in words, and so is one the door could not hold", () => {
  const full = Array.from({ length: 6 }, (_, i) => view({ id: `v${i}` }));
  assert.deepEqual(leadNamedAdd(full, view()), { refused: LEAD_NAMED_WORDS.full });
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`column_number_${i}`, true]));
  const heavy = Array.from({ length: 5 }, (_, i) => view({ id: `v${i}`, columns: many }));
  assert.deepEqual(leadNamedAdd(heavy, view()), { refused: LEAD_NAMED_WORDS.long });
});

test("a damaged list reads as none, and a damaged view as gone from it", () => {
  assert.deepEqual(leadNamedViewsOf(undefined), []);
  assert.deepEqual(leadNamedViewsOf("nonsense"), []);
  assert.deepEqual(leadNamedViewsOf({ list: "nonsense" }), []);
  const good = view();
  assert.deepEqual(
    leadNamedViewsOf({
      list: [
        good,
        { id: 3, name: "x", route: good.route },
        { id: "a", name: "", route: good.route },
        { id: "b", name: "Elsewhere", route: "clients/people" },
        null,
      ],
    }),
    [good],
  );
  const many = Array.from({ length: 9 }, (_, i) => view({ id: `v${i}` }));
  assert.equal(leadNamedViewsOf({ list: many }).length, LEAD_NAMED_MAX, "never more than the most");
  const odd = leadNamedViewsOf({ list: [view({ columns: "all", order: 3, density: "huge", sortDir: "up" })] })[0];
  assert.equal(odd.columns, undefined, "a part that is no such thing leaves what stands");
  assert.equal(odd.order, undefined);
  assert.equal(odd.density, undefined);
  assert.equal(odd.sortDir, undefined);
});

test("a view naming a search since removed opens All leads", () => {
  const route = leadsRoute({ searchId: GONE, chips: { reach: ["email"] } });
  assert.equal(leadNamedRouteFor(view({ route }), [SEARCH]), "clients/leads");
  const kept = leadsRoute({ searchId: SEARCH, chips: { reach: ["email"] } });
  assert.equal(leadNamedRouteFor(view({ route: kept }), [SEARCH]), kept);
  assert.equal(leadNamedRouteFor(view(), []), view().route, "a view of no search is not any search's");
});

test("the starters are never stored, and say what the plan says", () => {
  const byName = Object.fromEntries(LEAD_STARTER_VIEWS.map((v) => [v.name, v]));
  assert.deepEqual(Object.keys(byName), ["Needs you", "Call list", "Email list"]);
  assert.deepEqual(parseLeadsRoute(byName["Needs you"].route).chips, { status_group: ["needs"] });
  assert.equal(byName["Needs you"].sortBy, "stage");
  assert.deepEqual(parseLeadsRoute(byName["Call list"].route).chips, { reach: ["phone"] });
  assert.equal(byName["Call list"].density, "compact");
  assert.deepEqual(parseLeadsRoute(byName["Email list"].route).chips, { reach: ["email"] });
});

test("the view in use is marked; a layout changed since offers Update", () => {
  const now = { route: view().route, by: "stage", dir: "asc", columns: {}, order: [], density: "compact" };
  assert.equal(leadNamedActive(view(), now), true);
  assert.equal(leadNamedActive(view({ route: "clients/leads" }), now), false);
  assert.equal(leadNamedChanged(view(), now), false);
  assert.equal(leadNamedChanged(view(), { ...now, density: "comfortable" }), true);
  assert.equal(leadNamedChanged(view(), { ...now, by: "fit" }), true);
  assert.equal(leadNamedChanged(view(), { ...now, columns: { fit: true } }), true);
  assert.equal(leadNamedChanged(view(), { ...now, order: ["reach"] }), true);
  const starter = LEAD_STARTER_VIEWS[2]; // Email list: an address, and no layout of its own
  assert.equal(
    leadNamedChanged(starter, {
      route: starter.route,
      by: "fit",
      dir: "asc",
      columns: {},
      order: [],
      density: "compact",
    }),
    false,
    "what a starter does not name is not its to say changed",
  );
});

/* ------------------------------------------------------------------------------------------- the section, drawn -- */

/** What the hook reads of the page, each act recorded; `people.views` holds the kept list. */
const world = (over = {}) => {
  const went = [];
  const table = {
    chosen: { by: "fit", dir: "asc" },
    visibility: {},
    columns: [],
    order: [],
    density: "comfortable",
    takeLayout: (v) => went.push(["layout", v]),
  };
  return {
    went,
    args: {
      views: over.views ?? {},
      table: { ...table, ...over.table },
      route: over.route ?? "clients/leads",
      searchIds: [SEARCH],
      nav: (to) => went.push(["nav", to]),
      phone: !!over.phone,
      onPicked: () => went.push(["picked"]),
      flash: (f) => went.push(["flash", f.msg]),
      saver: (v) => went.push(["saved", v]),
    },
  };
};
const Rail = ({ args, compact }) => {
  const named = useLeadNamedViews(args);
  held = named;
  return h(LeadsRailViews, { named, compact });
};
let held = null;
const draw = (args, compact = false) => {
  fresh();
  return again(() => h(Rail, { args, compact }));
};
const redraw = (args, compact = false) => again(() => h(Rail, { args, compact }));

test("the rail says Saved: the three starters, then the member's, and no view shows a count", () => {
  const { args } = world({ views: { "leads-named": { list: [view()] } } });
  const t = draw(args);
  const rows = all(t, (n) => String(n.props?.testid ?? "").startsWith("leads-view-"));
  assert.deepEqual(
    rows.map((r) => r.props.label),
    ["Needs you", "Call list", "Email list", "Call these Monday"],
  );
  assert.ok(
    rows.every((r) => r.props.count === null || r.props.count === undefined),
    "a count would read the status of the whole workspace on every first page",
  );
  assert.equal(find(t, (n) => n.props?.label === "Saved")?.props.testid, "leads-views");
});

test("pressing a view takes its route and its layout in one go, and tells the page", () => {
  const { args, went } = world({ views: { "leads-named": { list: [view()] } } });
  const t = draw(args);
  find(t, (n) => n.props?.testid === "leads-view-v1").props.onPick();
  assert.deepEqual(went, [
    ["layout", { sortBy: "stage", sortDir: "asc", columns: {}, order: [], density: "compact" }],
    ["nav", view().route],
    ["picked"],
  ]);
  went.length = 0;
  find(t, (n) => n.props?.testid === "leads-view-starter-call").props.onPick();
  assert.deepEqual(went[0], ["layout", { density: "compact" }], "a starter leaves what it does not name");
  assert.equal(went[1][1], parseLeadsRoute(went[1][1]) ? LEAD_STARTER_VIEWS[1].route : "");
});

test("a view naming a removed search opens All leads when pressed, and does not fail", () => {
  const stale = view({ id: "old", route: leadsRoute({ searchId: GONE }) });
  const { args, went } = world({ views: { "leads-named": { list: [stale] } } });
  find(draw(args), (n) => n.props?.testid === "leads-view-old").props.onPick();
  assert.deepEqual(went[1], ["nav", "clients/leads"]);
});

test("the view in use is marked, and Update is offered where its layout changed since", () => {
  const { args } = world({
    views: { "leads-named": { list: [view()] } },
    route: view().route,
    table: { chosen: { by: "fit", dir: "asc" }, density: "compact" },
  });
  const t = draw(args);
  const row = find(t, (n) => n.props?.testid === "leads-view-v1");
  assert.equal(row.props.active, true);
  const items = row.props.menu ? find(row.props.menu, (n) => Array.isArray(n.props?.groups)).props.groups : [];
  const labels = items.flatMap((g) => (g.items ?? []).map((i) => i.label));
  assert.deepEqual(labels, ["Update", "Rename", "Remove"], "its sort moved from stage to fit");
  const same = world({
    views: { "leads-named": { list: [view()] } },
    route: view().route,
    table: { chosen: { by: "stage", dir: "asc" }, density: "compact" },
  });
  const quiet = find(draw(same.args), (n) => n.props?.testid === "leads-view-v1");
  const left = find(quiet.props.menu, (n) => Array.isArray(n.props?.groups)).props.groups;
  assert.deepEqual(
    left.flatMap((g) => (g.items ?? []).map((i) => i.label)),
    ["Rename", "Remove"],
  );
});

test("Save this view names it in place, keeps it, and marks it", () => {
  const { args, went } = world({ route: leadsRoute({ chips: { reach: ["email"] } }) });
  const t = draw(args);
  assert.match(textOf(byTestId(t, "leads-view-save")), new RegExp(LEAD_NAMED_WORDS.save));
  byTestId(t, "leads-view-save").props.onClick();
  const asking = redraw(args);
  assert.ok(byTestId(asking, "leads-view-name"), "a field where the press was");
  held.saveNew("  Friday's emails  ");
  const saved = went.find((w) => w[0] === "saved");
  assert.equal(saved[1].list.length, 1);
  assert.equal(saved[1].list[0].name, "Friday's emails", "trimmed");
  assert.equal(saved[1].list[0].route, args.route);
  assert.deepEqual(
    [saved[1].list[0].sortBy, saved[1].list[0].sortDir, saved[1].list[0].density],
    ["fit", "asc", "comfortable"],
  );
  const after = redraw(args);
  assert.equal(byTestId(after, "leads-view-name"), null, "the field is gone");
  assert.equal(
    all(after, (n) => n.props?.label === "Friday's emails").length,
    1,
    "the row stands at once, the save behind it",
  );
  went.length = 0;
  held.saveNew("   ");
  assert.equal(went.length, 0, "no name, no view");
});

test("a seventh says why in a toast; Rename and Remove change the list and keep it", () => {
  const full = Array.from({ length: 6 }, (_, i) => view({ id: `v${i}`, name: `View ${i}` }));
  const { args, went } = world({ views: { "leads-named": { list: full } } });
  draw(args);
  held.saveNew("One more");
  assert.deepEqual(went, [["flash", LEAD_NAMED_WORDS.full]]);
  went.length = 0;
  held.rename("v1", "  Renamed ");
  assert.equal(went[0][1].list[1].name, "Renamed");
  went.length = 0;
  held.remove("v0");
  assert.deepEqual(
    went[0][1].list.map((v) => v.id),
    ["v1", "v2", "v3", "v4", "v5"],
  );
  redraw(args);
  went.length = 0;
  held.update("v1");
  assert.deepEqual(
    [went[0][1].list[0].sortBy, went[0][1].list[0].density],
    ["fit", "comfortable"],
    "Update keeps the view's name and route, and takes the layout as it stands",
  );
});

test("a phone lists the views and offers no Save, and no menu", () => {
  const { args } = world({ views: { "leads-named": { list: [view()] } }, phone: true });
  const t = draw(args, true);
  assert.equal(byTestId(t, "leads-view-save"), null);
  const row = find(t, (n) => n.props?.testid === "leads-view-v1");
  assert.equal(row.props.menu, null);
});
