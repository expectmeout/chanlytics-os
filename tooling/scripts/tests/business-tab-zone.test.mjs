/**
 * The zone is the workspace's, and what the receptionist is told names it: the preview's zone follows a zone change.
 *
 * The timezone is saved through its own route (PATCH workspaces, window.__workspace.setTimezone), not through the
 * settings save, and nothing re-read settings after it. So the settings read's prompt preview, which carries the zone
 * every fold's "Your receptionist will be told" is resolved with, kept the old zone until something else was saved:
 * the hours fold would have shown "all times America/New_York" to an owner who had just moved the business to Chicago.
 *
 * RUN, never read: the real courier (identity.ts), the real typed client and its refresh map, the real runner and the
 * real settings surface, over a stand-in for the server that composes the preview as the settings route does
 * (composePromptPreview) in whatever zone the workspace row holds at that moment.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "./_legacy-react.mjs";

installLegacyReact();
const W = globalThis.window;
const SRC = "../../../apps/dashboard/src";
const { startSurfaces } = await import(`${SRC}/legacy-bridge/surface-runner.ts`);
const { settingsOverride } = await import(`${SRC}/legacy-bridge/surface-data.ts`);
const { AFTER } = await import(`${SRC}/legacy-bridge/refresh-map.ts`);
const { installIdentity } = await import(`${SRC}/legacy-bridge/identity.ts`);
const { installBusinessTab } = await import(`${SRC}/legacy-bridge/business-tab.ts`);
const { composePromptPreview } = await import(`${SRC}/server/prompt-preview.ts`);

const brain = {
  business_name: "Marisa's Beauty Salon",
  booking_link: "https://book.example.com/en-us/4471902",
  system_prompt: "You are the WhatsApp assistant for Marisa's Beauty Salon. Answer warmly and briefly.",
  fallbacks: {
    greeting: "Hi! Someone will be with you shortly.",
    error: "Sorry, something went wrong on our side.",
    non_text: "Thanks, a person will look at this.",
  },
  profile: { hours: { mon: { open: "09:30", close: "18:00" }, sun: {} } },
};

/** The server: one workspace row with a zone and an answer, and a settings read that composes its preview in that zone. */
const server = (zone) => {
  const state = { zone, sellsBy: null, asked: [], bodies: [] };
  const json = (data, status = 200) =>
    new Response(
      JSON.stringify(
        status < 300 ? { ok: true, data } : { ok: false, error: { code: "internal", message: "not in this test" } },
      ),
      { status, headers: { "content-type": "application/json" } },
    );
  state.fetch = async (url, init = {}) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "");
    const method = init.method || "GET";
    state.asked.push(`${method} ${path}`);
    const row = {
      id: "t-marisa",
      slug: "studio",
      name: "Marisa's Beauty Salon",
      status: "active",
      timezone: state.zone,
    };
    if (path === "workspaces" && method === "PATCH") {
      // As the route does: only what was sent is written, and only what was written is read back (0008).
      const sent = JSON.parse(init.body);
      state.bodies.push(sent);
      if (sent.timezone !== undefined) state.zone = sent.timezone;
      if (sent.sells_by !== undefined) state.sellsBy = sent.sells_by;
      return json({
        workspace: {
          ...row,
          timezone: state.zone,
          ...(sent.sells_by !== undefined ? { sells_by: state.sellsBy } : {}),
        },
      });
    }
    if (path === "workspaces") return json({ workspaces: [row], activeWorkspaceId: row.id });
    if (path === "settings") {
      const known = { workspace: { name: row.name, timezone: state.zone }, channels: [], listing: null };
      return json({
        config: { brain },
        version: 7,
        role: "owner",
        facts: {},
        conflicts: [],
        prompt: composePromptPreview(brain, { tz: state.zone, policy: {}, known, openings: null }),
      });
    }
    // The team, the matrix, the channels and the templates ride on the same surface; a failed one is its own state and
    // never blanks the business beside it.
    return json(null, 500);
  };
  return state;
};

const quiet = async (fn) => {
  const was = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = was;
  }
};
const pause = () => new Promise((r) => setTimeout(r, 5));

test("saving a timezone re-reads settings, so the preview's zone and what the hours fold will say follow it", async () => {
  // Settings first, the surface the preview rides on; then the three that how customers buy switches (0008), which
  // is saved through the same route: People's lists and column, Reports' Deals section, Today's proposals waiting.
  assert.deepEqual(
    AFTER["PATCH workspaces"]().map((o) => o.key),
    ["settings", "people", "reports", "today"],
    "the refresh map names the surfaces the workspace's own fields ride on",
  );

  const was = { fetch: W.fetch, settings: W.__SETTINGS, ws: W.__WORKSPACES, active: W.__ACTIVE_WORKSPACE };
  const srv = server("America/New_York");
  Object.assign(W, {
    fetch: srv.fetch,
    __WORKSPACES: [{ id: "t-marisa", timezone: "America/New_York" }],
    __ACTIVE_WORKSPACE: "t-marisa",
  });
  installIdentity(W);
  installBusinessTab();
  const stop = startSurfaces([settingsOverride]);
  try {
    await quiet(async () => {
      for (let i = 0; i < 40 && !(W.__SETTINGS && W.__SETTINGS.prompt); i += 1) await pause();
      assert.equal(W.__SETTINGS.prompt.tz, "America/New_York");
      const told = () => W.__businessTab.consequenceOf("hours", W.__SETTINGS.config.brain, "whatsapp").text;
      assert.match(told(), /America\/New_York/);

      srv.asked.length = 0;
      const r = await W.__workspace.setTimezone("America/Chicago");
      assert.deepEqual([r.ok, r.tz], [true, "America/Chicago"]);
      assert.ok(
        srv.asked.indexOf("GET settings") > srv.asked.indexOf("PATCH workspaces"),
        "settings is read again after the zone is saved, before the save answers the page",
      );
      assert.equal(
        W.__SETTINGS.prompt.tz,
        "America/Chicago",
        "REGRESSION: the preview kept the old zone until something else was saved",
      );
      assert.match(
        told(),
        /America\/Chicago/,
        "so the hours fold names the zone the receptionist will state the times in",
      );
      assert.doesNotMatch(told(), /America\/New_York/);
      assert.equal(W.__WORKSPACES[0].timezone, "America/Chicago", "and the page's own clock follows, as it did");
    });
  } finally {
    stop();
    Object.assign(W, {
      fetch: was.fetch,
      __SETTINGS: was.settings,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("how customers buy is saved through the workspace's own route: only what was said goes, the page's list keeps it, and what it switches is read again", async () => {
  const was = { fetch: W.fetch, settings: W.__SETTINGS, ws: W.__WORKSPACES, active: W.__ACTIVE_WORKSPACE };
  const srv = server("America/New_York");
  Object.assign(W, {
    fetch: srv.fetch,
    __WORKSPACES: [
      { id: "t-marisa", timezone: "America/New_York", sells_by: null },
      { id: "t-other", timezone: "Europe/London", sells_by: null },
    ],
    __ACTIVE_WORKSPACE: "t-marisa",
  });
  installIdentity(W);
  const heard = [];
  const onChange = () => heard.push("workspace:changed");
  W.addEventListener("workspace:changed", onChange);
  const stop = startSurfaces([settingsOverride]);
  try {
    await quiet(async () => {
      for (let i = 0; i < 40 && !(W.__SETTINGS && W.__SETTINGS.prompt); i += 1) await pause();
      srv.asked.length = 0;
      const r = await W.__workspace.patch({ sells_by: "proposal" });
      assert.deepEqual(r, { ok: true, workspace: { sells_by: "proposal" }, message: "" });
      assert.deepEqual(srv.bodies, [{ sells_by: "proposal" }], "the answer alone: the zone is not sent again");
      assert.deepEqual(
        W.__WORKSPACES.map((t) => [t.id, t.timezone, t.sells_by]),
        [
          ["t-marisa", "America/New_York", "proposal"],
          ["t-other", "Europe/London", null],
        ],
        "the active workspace's answer, and no other's; the zone as it was",
      );
      assert.deepEqual(heard, ["workspace:changed"]);
      // Settings, People, Reports and Today (whose day reads the metrics) are read again once the answer is saved.
      const patched = srv.asked.indexOf("PATCH workspaces");
      for (const read of ["GET settings", "GET contacts", "GET reports", "GET metrics"])
        assert.ok(srv.asked.indexOf(read) > patched, `${read} after the save: ${srv.asked.join(", ")}`);
      // The zone's own door is the same courier, for the zone alone.
      srv.bodies.length = 0;
      const tz = await W.__workspace.setTimezone("America/Chicago");
      assert.deepEqual(tz, { ok: true, tz: "America/Chicago", message: "" });
      assert.deepEqual(srv.bodies, [{ timezone: "America/Chicago" }]);
      assert.equal(W.__WORKSPACES[0].sells_by, "proposal", "a zone saved leaves the answer where it was");
    });
  } finally {
    stop();
    W.removeEventListener?.("workspace:changed", onChange);
    Object.assign(W, {
      fetch: was.fetch,
      __SETTINGS: was.settings,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});
