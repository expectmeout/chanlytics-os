/**
 * The frame routes only what the registry classifies, and asks it in one place (bridge/surface-registry.ts, decision
 * 0015). The registry inverts what was fifteen per-route demo checks, every one a place to forget: the frame derives its
 * honesty gate from one table, so (1) every page the frame's code can route is classified, and a new route cannot ship
 * unclassified, (2) nothing is classified that nothing routes, (3) no route grows a demo conditional of its own, and (4)
 * the shared viewer, which drew another company's name over invented numbers at a URL anyone could type, is gated.
 *
 * A rule of the repository, held over the frame's code: what is checked is the set of page words the frame's modules
 * name and the absence of a conditional of their own, which no run of one route shows for the others. The gate itself
 * is run: shell/boot/the-frame-draws-what-it-holds.test.mjs ("a demo page is gated by the one interception"). Moved here
 * from shell/surfaces/surface-registry.test.mjs on 27 Nov 2026 (lane 4, area c), the route table read as its rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc, readCode } from "../../_source.mjs";

const registry = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
const { SURFACE_STATES } = registry;
const { SURFACE_ROUTES } = await importSrc("apps/dashboard/src/surfaces/routes.ts");
const { SHELL_ROUTES } = await importSrc("apps/dashboard/src/surfaces/frame/route-table.tsx");

/** The frame's own code: its gate (shell-hooks.ts), the pages it draws outside the table (app-shell.tsx), its landing. */
const FRAME = ["app-shell.tsx", "shell-hooks.ts", "shell-routes.ts"].map((f) =>
  readCode(`apps/dashboard/src/surfaces/frame/${f}`),
);
const frame = FRAME.join("\n");

/**
 * Every page the frame can route: the route table's rows, the retired pages it routes by their move, the routes that
 * left the shell for a page of their own, and every page word the frame's code matches on.
 */
function routedPages() {
  const pages = new Set([
    ...SHELL_ROUTES.map((r) => r.page),
    ...Object.keys(registry.SURFACE_RETIRED),
    ...Object.keys(SURFACE_ROUTES),
  ]);
  for (const m of frame.matchAll(/page(?: ===|:) "([a-z-]+)"/g)) pages.add(m[1]);
  return pages;
}

// Handled by their own honest mechanism, not the registry: soon IS the Coming Soon pane (and NotFound has no page word).
const SELF_HONEST = new Set(["soon"]);

test("every route the frame can draw is classified", () => {
  const missing = [...routedPages()].filter((p) => !SELF_HONEST.has(p) && !(p in SURFACE_STATES));
  assert.deepEqual(missing, [], "unclassified routes: each would render whatever it renders, gated by nothing");
});

test("the registry classifies nothing the frame does not route", () => {
  // A stale entry misleads the next person about what exists. A sub-route is legitimate when its PAGE is routed: the
  // frame reaches admin/workspace through the admin branch, not a word of its own.
  const routed = routedPages();
  const stale = Object.keys(SURFACE_STATES).filter((p) => !routed.has(p) && !routed.has(p.split("/")[0]));
  assert.deepEqual(stale, [], "classified but not routed");
});

test("no route grows a demo conditional of its own, and the shared viewer is gated", () => {
  // Per-route __DEMO_MODE checks are how fifteen branches got missed the first time.
  const adHoc = [...frame.matchAll(/page(?: ===|:) "[a-z-]+"[^\n]*__DEMO_MODE/g)];
  assert.deepEqual(
    adHoc.map((m) => m[0]),
    [],
    "a route re-grew its own demo conditional instead of using the registry",
  );
  assert.match(frame, /page === "shared" && !demoGated/, "the shared early return lost its gate");
});
