/**
 * The server a signed-in spec is run against, with no deployment, no database and no Supabase.
 *
 *   node tooling/scripts/e2e-harness/server.mjs [port] [nightly|salon]     (from the repo root)
 *
 * Three things, and nothing else:
 *   - the two Supabase auth calls e2e/session.ts makes, answered so `signIn()` mints a harmless local cookie;
 *   - the standalone mockup (apps/dashboard/src/legacy), read from disk on every request through serve-legacy.mjs's
 *     own static serving, so a change to a page or a stylesheet shows on the next load -- which is what makes a
 *     mutation run possible;
 *   - the `/api/v1` reads the spec makes itself, answered from the same record the page was built from, in the
 *     app's own envelope (contracts `ok`/`err`).
 *
 * It never writes, and says so: everything but the two auth calls is answered for GET and HEAD alone, and anything
 * else is refused. There is nowhere to write to, and a spec that pressed a Save would be refused by the page's own
 * stand-in saver (fixture-src.ts) before it ever reached here.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dealsAreOn, err, ok } from "@chanlytics/contracts";
import { buildFixture } from "./fixture.mjs";
import { scenario, WORKSPACE } from "./scenarios.mjs";
import { mascotBundle, reportsSampleBundle, send, serveStatic, todaySampleBundle, TYPES } from "../serve-legacy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(HERE, "../../../apps/dashboard/src/legacy");

/** The two calls `signIn()` makes, which are POSTs. Every other route the harness answers is a read. */
const AUTH = { LINK: "/auth/v1/admin/generate_link", VERIFY: "/auth/v1/verify" };

/**
 * `data/business-tab.js` in the mockup is the tab's helpers built from `packages/contracts/dist`, and its footer
 * installs them over whatever is there. The fixture has already installed the same helpers FROM SOURCE, so the
 * harness answers this route with nothing at all: what the page runs is the source copy, which is the point of the
 * harness (a change to the bridge or to contracts shows in the next run, not in the next dist build).
 */
export const BUSINESS_TAB_SCRIPT =
  "/* the harness installed the tab's helpers from source (e2e-harness/fixture-src.ts); nothing to do here */\n";

/**
 * Every JSON answer the harness gives, as a function of the method, the path, the query and the record: the two
 * auth calls, and the reads the spec makes of its own. `null` means this is not a JSON route. The harness's test
 * calls this directly, so what a spec is answered is checked without a socket.
 */
export function answer(method, pathname, params, record) {
  const read = method === "GET" || method === "HEAD";
  if (pathname === AUTH.LINK || pathname === AUTH.VERIFY) {
    // These two are POSTs, and only these two.
    if (method !== "POST") return refused(pathname);
    if (pathname === AUTH.LINK) return { status: 200, body: { hashed_token: "hx-token" } };
    const at = Math.floor(Date.now() / 1000);
    return {
      status: 200,
      body: {
        access_token: "hx-access",
        refresh_token: "hx-refresh",
        expires_in: 3600,
        expires_at: at + 3600,
        token_type: "bearer",
        user: { id: "u-e2e-owner", email: "e2e-owner@example.com" },
      },
    };
  }
  if (!pathname.startsWith("/api/v1/")) return read ? null : refused(pathname);
  // A PUT of the settings is what the page's Save would send. Answered as a read it would tell a spec its write
  // landed -- on a harness that has nothing to write to.
  if (!read) return refused(pathname);
  // Every read the app makes names its workspace (surface-data.ts scoped()), by its id or, from a page at its
  // address, by its slug (legacy-bridge/workspace.ts getActiveWorkspace); one that did not would be refused in
  // production by memberContext, and is refused here for the same reason.
  const named = params.get("workspace");
  if (pathname !== "/api/v1/workspaces" && named !== WORKSPACE.id && named !== WORKSPACE.slug) {
    return { status: 400, body: err("choose_workspace", "Which workspace do you mean?") };
  }
  if (pathname === "/api/v1/workspaces") {
    return {
      status: 200,
      body: ok({
        activeWorkspaceId: WORKSPACE.id,
        // With how its customers buy where the record says (the workspace list carries tenants.sells_by).
        workspaces: [
          {
            id: WORKSPACE.id,
            slug: WORKSPACE.slug,
            name: WORKSPACE.name,
            ...(record.sellsBy ? { sells_by: record.sellsBy } : {}),
          },
        ],
      }),
    };
  }
  if (pathname === "/api/v1/settings") {
    return {
      status: 200,
      body: ok({ config: record.config, version: record.version, role: record.role, configBroken: false }),
    };
  }
  // People's reads, where the record has people (the pipeline scenario): the list as GET contacts pages it, the
  // member's saved lists and views (none), and one person as the person read hands them over. A record with no
  // people answers none of them, so People stays the seeded page there, as it always has.
  if (record.people) {
    const people = peopleAnswer(pathname, params, record);
    if (people) return people;
  }
  return { status: 404, body: err("not_found", `the harness has no ${pathname}`) };
}

/** People's reads from a record with people; null for a path that is not one of them. */
function peopleAnswer(pathname, params, record) {
  if (pathname === "/api/v1/contacts") {
    // Every person on the first page and none after it: the surface reads pages until has_more is false.
    const offset = Number(params.get("offset") || 0);
    const rows = offset === 0 ? record.people : [];
    return {
      status: 200,
      body: ok({
        people: rows,
        calendar: record.calendar ?? { state: "none" },
        booking_link: record.config?.brain?.booking_link ?? null,
        consult_first: record.config?.brain?.profile?.booking_rules?.consult_first ?? [],
        deals_on: dealsAreOn(record.sellsBy),
        page: { q: params.get("q"), offset, limit: 1000, total: record.people.length, has_more: false },
      }),
    };
  }
  if (pathname === "/api/v1/segments") return { status: 200, body: ok({ lists: [] }) };
  if (pathname === "/api/v1/views") return { status: 200, body: ok({ views: {} }) };
  const one = pathname.match(/^\/api\/v1\/contacts\/([0-9a-f-]{36})$/i);
  if (one) {
    const person = record.details?.[one[1]];
    return person
      ? { status: 200, body: ok({ person }) }
      : { status: 404, body: err("not_found", "This person is not in your workspace.") };
  }
  return null;
}

/**
 * The refusal, in the app's own envelope. The code is `forbidden` because the app's set of codes is closed
 * (contracts ERROR_CODES) and a made-up one would be a shape the client has never seen; the status is 405, which is
 * what the method was wrong about.
 */
const refused = (pathname) => ({
  status: 405,
  body: err("forbidden", `the harness never writes, and ${pathname} was not a read`),
});

/**
 * The app's own rules beside its stylesheets: legacy-bridge/legacy.css, which the app imports (app/(os)/layout.tsx),
 * is the mockup's stylesheets in their order and then rules of its own, the 44px floor under a coarse pointer among
 * them. The mockup's document already links the stylesheets, so the @imports are left out and the rest is served as
 * it stands, read on every request as the pages are. Without it, a spec on a touch phone measured a Save 26px tall
 * that the app draws at 44.
 */
const APP_CSS = path.resolve(HERE, "../../../apps/dashboard/src/legacy-bridge/legacy.css");
export const appRules = () => fs.readFileSync(APP_CSS, "utf8").replace(/^@import[^\n]*\n/gm, "");

/**
 * The mockup's document with the fixture FIRST in its head -- before data/bridge-stubs.jsx, which writes only
 * what is missing, and before data/business-tab.js, which the harness then answers with nothing -- and the app's own
 * rules LAST, after every stylesheet, where the app has them.
 */
export function documentWithFixture() {
  const doc = fs.readFileSync(path.join(LEGACY, "Chanlytics.html"), "utf8");
  return doc
    .replace("<head>", '<head>\n  <script src="/_hx/fixture.js"></script>')
    .replace("</head>", '  <link rel="stylesheet" href="/_hx/app.css" />\n</head>');
}

/**
 * Start the harness. Port 0 takes a free one, which is what the runner does. Resolves once it is listening, with the
 * record it is serving and the way to stop it.
 */
export async function startHarness({ name = "nightly", port = 0, now = Date.now() } = {}) {
  const record = scenario(name, now);
  const fixture = await buildFixture(record);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    // The page may stand at its workspace's address (/w/<slug>/, which the fixture puts it at for a record with
    // people), and every file it names from there is the tree's own.
    const p = decodeURIComponent(url.pathname).replace(new RegExp(`^/w/${WORKSPACE.slug}(?=/|$)`), "") || "/";
    const method = (req.method || "GET").toUpperCase();
    try {
      const json = answer(method, p, url.searchParams, record);
      if (json) {
        send(res, json.status, TYPES[".json"], JSON.stringify(json.body));
        return;
      }
      if (p === "/_hx/fixture.js") {
        send(res, 200, TYPES[".js"], fixture);
        return;
      }
      if (p === "/_hx/app.css") {
        send(res, 200, TYPES[".css"], appRules());
        return;
      }
      if (p === "/data/business-tab.js") {
        send(res, 200, TYPES[".js"], BUSINESS_TAB_SCRIPT);
        return;
      }
      if (p === "/data/reports-sample.js") {
        send(res, 200, TYPES[".js"], await reportsSampleBundle());
        return;
      }
      if (p === "/data/today-sample.js") {
        send(res, 200, TYPES[".js"], await todaySampleBundle());
        return;
      }
      if (p === "/data/mascot.js") {
        send(res, 200, TYPES[".js"], await mascotBundle());
        return;
      }
      if (p === "/" || p === "/Chanlytics.html") {
        send(res, 200, TYPES[".html"], documentWithFixture());
        return;
      }
      serveStatic(res, LEGACY, p);
    } catch (e) {
      send(res, 500, "text/plain", String((e && e.stack) || e));
    }
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const live = server.address().port;
  return {
    record,
    port: live,
    url: `http://localhost:${live}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const started = await startHarness({ port: Number(process.argv[2] || 0), name: process.argv[3] || "nightly" });
  console.log(`the ${started.record.name} record on ${started.url}/#/admin/workspace`);
}
