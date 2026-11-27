/**
 * Campaigns asks WhatsApp's own list of messages quietly as it opens, whichever view is on screen (campaigns/home/route.tsx,
 * parts/whatsapp-list.ts; Campaigns, one tab, call C11: it was the Messages page's own): once the page is idle, where a
 * number is connected and the member may approve, and once a visit. templates-truth.test.mjs read route.tsx's text for
 * it until 26 Nov 2026, while no test drew Campaigns' route.
 *
 * The route reads its address from Next's router, which is the test's here (`usePathname`), and its views' contexts from
 * "react", which under this runner's react-server condition has no createContext: the stub gives it one that holds its
 * value, as step-sheet-hand.test.mjs does. What the page leaves for when it is idle (`requestIdleCallback`) is run by the
 * test, as the browser would run it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { stateOf } from "@chanlytics/contracts";
import { installStubReact, fresh, again } from "../_stub-react.mjs";
import { bridgeHolds, holdFrameParts, holdRoles } from "../shell/_bridge-holds.mjs";
import { until } from "../shared/_until.mjs";

const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../apps/dashboard/src/_.js"),
);
// Next's router, the test's: Campaigns at its own address.
const router = fromDashboard.resolve("next/navigation");
fromDashboard.cache[router] = {
  id: router,
  filename: router,
  loaded: true,
  exports: {
    usePathname: () => "/w/marisas/campaigns",
    useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
    useSearchParams: () => new URLSearchParams(),
  },
};
bridgeHolds({
  who: {
    workspaces: [{ id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: "UTC" }],
    activeWorkspaceId: "t1",
  },
  parts: { chrome: { state: stateOf }, surfaceState: () => "live" },
  doors: { navigate() {} },
});
installStubReact({});
const reactOfDashboard = fromDashboard("react");
reactOfDashboard.createContext ??= (value) => ({ Provider: "Provider", Consumer: "Consumer", _currentValue: value });
reactOfDashboard.useContext ??= (context) => context._currentValue;
holdFrameParts();
/** What the page asked to do once it is idle. */
const idle = [];
globalThis.requestIdleCallback = (fn) => idle.push(fn);
globalThis.cancelIdleCallback = () => {};
const S = "../../apps/dashboard/src/surfaces";
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { CampaignsRoute } = await import(`${S}/campaigns/home/route.tsx`);

/** Every post the page made, by its path. */
const posted = [];
globalThis.fetch = async (url, init = {}) => {
  if ((init.method ?? "GET") === "POST") posted.push(new URL(String(url), "https://app.chanlytics.com").pathname);
  return new Response(JSON.stringify({ ok: true, data: { synced: 0 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
/**
 * Campaigns drawn over a workspace's numbers and its rows, then idle: what it asked then is run, after the hop that waits
 * for the boot (bridge/workspace.ts aheadWhenIdle, the boot long in). Answers how many things it left for the idle.
 */
const opens = async ({ channels, rows = [] }) => {
  posted.length = 0;
  idle.length = 0;
  setSurfaceValue("settings", { settings: null, templatesAll: rows, templateVersions: [], messages: [] });
  setSurfaceValue("channels", { rows: channels });
  fresh();
  again(() => CampaignsRoute());
  await Promise.resolve();
  await Promise.resolve();
  const left = idle.length;
  for (const run of idle.splice(0)) run();
  return left;
};
const WHATSAPP = [{ kind: "whatsapp" }];
const SYNC = "/api/v1/templates/sync";

/** What Campaigns leaves for the idle where it has no list to ask: its views' own reads ahead (campaigns-code.tsx). */
let quiet = null;

test("Campaigns asks nothing of WhatsApp where no number is connected, or for a member who may not approve", async () => {
  holdRoles({ can: null });
  quiet = await opens({ channels: [{ kind: "sms" }] });
  assert.ok(!posted.includes(SYNC), "no WhatsApp number: no list to ask");
  holdRoles({ can: (perm) => perm !== "approve" });
  try {
    assert.equal(
      await opens({ channels: WHATSAPP }),
      quiet,
      "a member who may not approve: nothing more left for the idle",
    );
    assert.ok(!posted.includes(SYNC));
  } finally {
    holdRoles({ can: null });
  }
});

test("Campaigns asks WhatsApp's list quietly as it opens, once the page is idle, and once a visit", async () => {
  holdRoles({ can: null });
  // Rows last matched a day ago: past the hour, so asked.
  const rows = [{ id: "t1", name: "x", synced_at: new Date(Date.now() - 86_400_000).toISOString() }];
  assert.equal(await opens({ channels: WHATSAPP, rows }), quiet + 1, "one thing more for the idle: the list's ask");
  await until(() => posted.includes(SYNC), "WhatsApp's list asked once the page is idle");
  assert.deepEqual(posted, [SYNC], "the one post");
  assert.equal(await opens({ channels: WHATSAPP, rows }), quiet, "opened again in the visit, it is not asked again");
});
