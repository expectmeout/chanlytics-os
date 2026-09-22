/**
 * The server a signed-in spec is run against, with no deployment, no database and no Supabase.
 *
 *   node tooling/scripts/e2e-harness/server.mjs [port] [nightly|salon]     (from the repo root)
 *
 * Three things, and nothing else:
 *   - the two Supabase auth calls e2e/session.ts makes, answered so `signIn()` mints a harmless local cookie;
 *   - the standalone mockup (apps/dashboard/src/legacy), read from disk on every request, with the fixture first in
 *     its head, so a change to a page or a stylesheet shows on the next load -- which is what makes a mutation run
 *     possible;
 *   - the `/api/v1` reads the spec makes itself, answered from the same record the page was built from.
 *
 * It never writes: there is nowhere to write to. A spec that pressed a Save would be refused by the page's own
 * stand-in saver (fixture-src.ts) and see the refusal.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFixture } from "./fixture.mjs";
import { scenario, WORKSPACE } from "./scenarios.mjs";
import { businessTabBundle, reportsSampleBundle, todaySampleBundle } from "../serve-legacy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(HERE, "../../../apps/dashboard/src/legacy");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/**
 * Every JSON answer the harness gives, as a function of the path, the query and the record: the two auth calls, and
 * the reads the spec makes of its own. `null` means this is not a JSON route. The harness's test calls this
 * directly, so what a spec is answered is checked without a socket.
 */
export function answer(pathname, params, record) {
  if (pathname === "/auth/v1/admin/generate_link") return { status: 200, body: { hashed_token: "hx-token" } };
  if (pathname === "/auth/v1/verify") {
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
  if (!pathname.startsWith("/api/v1/")) return null;
  // Every read the app makes names its workspace (surface-data.ts scoped()); one that did not would be refused in
  // production by memberContext, and is refused here for the same reason.
  if (pathname !== "/api/v1/workspaces" && params.get("workspace") !== WORKSPACE.id) {
    return { status: 400, body: { error: { code: "choose_workspace" } } };
  }
  if (pathname === "/api/v1/workspaces") {
    return {
      status: 200,
      body: {
        data: {
          activeWorkspaceId: WORKSPACE.id,
          workspaces: [{ id: WORKSPACE.id, slug: WORKSPACE.slug, name: WORKSPACE.name }],
        },
      },
    };
  }
  if (pathname === "/api/v1/settings") {
    return {
      status: 200,
      body: {
        data: {
          config: { brain: record.brain, ...(record.calendar ? { calendar: record.calendar } : {}) },
          version: record.version,
          role: record.role,
          configBroken: false,
        },
      },
    };
  }
  return { status: 404, body: { error: { code: "not_found", message: `the harness has no ${pathname}` } } };
}

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

/**
 * Start the harness. Port 0 takes a free one, which is what the runner does. Resolves once it is listening, with the
 * record it is serving and the way to stop it.
 */
export async function startHarness({ name = "nightly", port = 0, now = Date.now() } = {}) {
  const record = scenario(name, now);
  const fixture = await buildFixture(record);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const p = decodeURIComponent(url.pathname);
    try {
      const json = answer(p, url.searchParams, record);
      if (json) {
        send(res, json.status, TYPES[".json"], JSON.stringify(json.body));
        return;
      }
      if (p === "/_hx/fixture.js") {
        send(res, 200, TYPES[".js"], fixture);
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
      if (p === "/data/business-tab.js") {
        send(res, 200, TYPES[".js"], await businessTabBundle());
        return;
      }
      if (p === "/" || p === "/Chanlytics.html") {
        const doc = fs.readFileSync(path.join(LEGACY, "Chanlytics.html"), "utf8");
        send(res, 200, TYPES[".html"], doc.replace("<head>", '<head>\n  <script src="/_hx/fixture.js"></script>'));
        return;
      }
      const file = path.join(LEGACY, p);
      // Nothing outside the mockup, whatever the path says.
      if (!file.startsWith(LEGACY)) {
        send(res, 403, "text/plain", "Forbidden");
        return;
      }
      fs.readFile(file, (err, body) =>
        err
          ? send(res, 404, "text/plain", "Not found")
          : send(res, 200, TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", body),
      );
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
