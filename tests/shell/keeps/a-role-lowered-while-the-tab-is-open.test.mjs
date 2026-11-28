/**
 * A member's role is lowered while their tab is open: what they may no longer do is gone from the page, and a press that
 * beat it is refused by the server in its own word (the reviews of 28 Nov 2026: R3.12; lane 11's item 2).
 *
 * Nothing answers 401, since the session is good. What says the role moved is the workspace read, which the live feed
 * asks for again when a seat changes (bridge/surface-data.ts workspaceOverride hears the team's tables). The role every
 * gate asks is read off that answer as it is asked (bridge/identity.ts), so the read landing is the page losing the
 * control. Held as it stands: this found nothing to mend. Run on the real workspace surface through the seam, the real
 * role store, the page's own gate (surfaces/frame/gate.ts) and the real client, over a scripted wire.
 *
 * What it does not hold, said plainly: with the live feed down, the read is made at the tab's next pass (a return to it,
 * the network back, the quarter-hour heal), and until then the page still offers what the server now refuses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { bridgeHolds, provided } from "../_bridge-holds.mjs";

const HARBOR = {
  id: "id-harbor",
  slug: "harbor",
  name: "Harbor Moving",
  status: "active",
  timezone: "America/New_York",
};
const told = [];
const wire = { role: "owner", asked: [] };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.window = {
  location: { pathname: `/w/${HARBOR.slug}/admin/team`, search: "", hash: "", replace() {}, assign() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: (event) => (told.push(event.type), true),
  fetch: async (url, init = {}) => {
    const asked = `${init.method ?? "GET"} ${new URL(String(url), "https://app.example.org").pathname.replace("/api/v1/", "")}`;
    wire.asked.push(asked);
    if (asked === "GET workspaces")
      return json(200, {
        ok: true,
        data: {
          workspaces: [{ ...HARBOR, role: wire.role }],
          active_workspace_id: HARBOR.id,
          user: { id: "u1", email: "ada@example.com", role: wire.role, invited: false },
        },
      });
    // Every write is the owner's here: the server asks the database who this is at the press, whatever the page thought.
    if (init.method && init.method !== "GET" && wire.role !== "owner")
      return json(403, { ok: false, error: { code: "forbidden", message: "Only an owner can change this." } });
    return json(200, { ok: true, data: {} });
  },
};
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};

const { api } = await importSrc("apps/dashboard/src/bridge/api.ts");
const data = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
const feed = await importSrc("apps/dashboard/src/bridge/surface-realtime.ts");
const identity = await importSrc("apps/dashboard/src/bridge/identity.ts");
const page = await importSrc("apps/dashboard/src/surfaces/frame/gate.ts");

bridgeHolds({}, { fresh: true });
identity.installRoleStore();
identity.installRoles();

/** The workspace surface read through the seam, as the runner reads it: its answer held, its event said. */
async function readWhoIsLooking() {
  api().forget();
  told.length = 0;
  assert.equal(await data.activateOverride(data.workspaceOverride), true);
}

test("an owner's page offers what an owner may do", async () => {
  await readWhoIsLooking();
  assert.equal(provided("roles").myRole(), "owner");
  assert.equal(page.canDo("settings"), true);
  assert.deepEqual(page.gate("settings"), {}, "the control is open");
  assert.equal(page.mayAtLeast("owner"), true);
});

test("a seat that changes asks for the workspace read again, wherever the tab is", () => {
  const change = { table: "memberships", event: "UPDATE", row: { tenant_id: HARBOR.id, role: "viewer" } };
  assert.equal(feed.wantsRefresh(data.workspaceOverride, "memberships", change), true);
});

test("the role lowered to a viewer's: as the read lands the page loses what an owner does, and says why", async () => {
  wire.role = "viewer";
  await readWhoIsLooking();
  assert.ok(told.includes("surface:workspace"), "every page that draws a gate is told");
  assert.equal(provided("roles").myRole(), "viewer");
  assert.equal(page.canDo("settings"), false, "REGRESSION: a viewer still offered what an owner does");
  assert.equal(page.mayAtLeast("operator"), false);
  const gated = page.gate("settings");
  assert.equal(gated["aria-disabled"], true, "the control refuses");
  assert.equal(typeof gated["aria-description"], "string");
  assert.ok(gated["aria-description"].length > 0, "and says why, in the role's own words");
});

test("a press that beat the read is refused by the server, in its word, and nothing is taken for done", async () => {
  wire.asked.length = 0;
  const answer = await api()("PUT settings", { body: { config: {}, version: 1 } });
  assert.deepEqual(wire.asked, ["PUT settings"], "the press reached the server");
  assert.equal(answer.ok, false);
  assert.equal(answer.code, "forbidden");
  assert.equal(answer.status, 403);
  assert.equal(answer.message, "Only an owner can change this.", "the page says the server's own sentence");
});

test("raised again, the control comes back with the next read", async () => {
  wire.role = "owner";
  await readWhoIsLooking();
  assert.equal(page.canDo("settings"), true);
  assert.deepEqual(page.gate("settings"), {});
});
