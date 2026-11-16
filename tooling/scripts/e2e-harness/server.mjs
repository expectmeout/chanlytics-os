/**
 * The server a signed-in spec is run against, with no deployment, no database and no Supabase.
 *
 *   node --import tsx tooling/scripts/e2e-harness/server.mjs [port] [kit|ask]     (from the repo root)
 *
 * Three things, and nothing else:
 *   - the two Supabase auth calls e2e/session.ts makes, answered so `signIn()` mints a harmless local cookie;
 *   - a page, for the two records that have one: the kit's gallery for the `kit` record (kit-gallery.mjs), with at
 *     /behaves the page that runs the kit's components with behaviour of their own (kit-behaves.tsx, bundled once as
 *     the harness starts: kit-behaves.mjs), and Ask's states for the `ask` record (ask-states.tsx), each over the
 *     app's stylesheets, read from disk on every request at the paths the app has them (app-styles.mjs), so a change
 *     to an entry or a stylesheet shows on the next load, which is what makes a mutation run possible. The other
 *     records draw no page: the standalone mockup they were drawn in went with demo mode (15 Nov 2026), and the
 *     app's own pages are run against the nightly's stack (decision 0106);
 *   - the `/api/v1` reads a spec makes itself, answered from the record, in the app's own envelope (contracts
 *     `ok`/`err`), which the node suite also draws the app's pages over (e2e/e2e-harness-campaigns.test.mjs).
 *
 * It never writes, and says so: everything but the two auth calls is answered for GET and HEAD alone, and anything
 * else is refused. There is nowhere to write to.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { err, ok } from "@chanlytics/contracts";
import { appStylesheets } from "./app-styles.mjs";
import { buildAskStates } from "./ask-states.mjs";
import { buildBehaves } from "./kit-behaves.mjs";
import { askStatesDocument, behavesDocument, galleryDocument } from "./kit-gallery.mjs";
import { OWNER, scenario, WORKSPACE } from "./scenarios.mjs";
import { templatesRead } from "./templates-read.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../../apps/dashboard/src");

/** What each answer is served as. */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

/**
 * One answer, and never kept by a browser: the harness serves a check and a review, not traffic, and no file it serves
 * carries a version, so a page read twice is the tree as it stands both times.
 */
export const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store, must-revalidate" });
  res.end(body);
};

/**
 * One of the stylesheets the app imports, at the path from src/ a page links it by (app-styles.mjs), read from disk as
 * it stands. Nothing else: a path that is not one of that list's is not found, however it is spelled, so no climb out
 * of src/ (an encoded slash, a backslash) reaches a file.
 */
export function serveSheet(res, rel) {
  const sheet = appStylesheets().find((s) => `/${s}` === rel);
  if (!sheet) {
    send(res, 404, "text/plain", "Not found");
    return;
  }
  fs.readFile(path.join(SRC, sheet), (error, body) =>
    error ? send(res, 404, "text/plain", "Not found") : send(res, 200, TYPES[".css"], body),
  );
}

/** The two calls `signIn()` makes, which are POSTs. Every other route the harness answers is a read. */
const AUTH = { LINK: "/auth/v1/admin/generate_link", VERIFY: "/auth/v1/verify" };

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
        user: { id: OWNER.id, email: OWNER.email },
      },
    };
  }
  if (!pathname.startsWith("/api/v1/")) return read ? null : refused(pathname);
  // A PUT of the settings is what the page's Save would send. Answered as a read it would tell a spec its write
  // landed -- on a harness that has nothing to write to.
  if (!read) return refused(pathname);
  // Every read the app makes names its workspace (surface-data.ts scoped()), by its id or, from a page at its
  // address, by its slug (bridge/workspace.ts getActiveWorkspace); one that did not would be refused in
  // production by getMemberContext, and is refused here for the same reason.
  const named = params.get("workspace");
  if (pathname !== "/api/v1/workspaces" && named !== WORKSPACE.id && named !== WORKSPACE.slug) {
    return { status: 400, body: err("choose_workspace", "Which workspace do you mean?") };
  }
  if (pathname === "/api/v1/workspaces") {
    return {
      status: 200,
      body: ok({
        activeWorkspaceId: WORKSPACE.id,
        // With its word where the record says (the workspace list carries tenants.appointment_word).
        workspaces: [
          {
            id: WORKSPACE.id,
            slug: WORKSPACE.slug,
            name: WORKSPACE.name,
            ...(record.word ? { appointment_word: record.word } : {}),
          },
        ],
      }),
    };
  }
  // The bell's kept rows (scenarios.mjs bellNotes), as the route hands them over, with no seen moment yet.
  if (pathname === "/api/v1/notifications" && record.notifications) {
    return { status: 200, body: ok({ notifications: record.notifications, seen_at: null }) };
  }
  if (pathname === "/api/v1/settings") {
    return {
      status: 200,
      body: ok({ config: record.config, version: record.version, role: record.role, configBroken: false }),
    };
  }
  // The templates read, as the route answers it (templates-read.mjs): the composers', or Settings' with `all`.
  if (pathname === "/api/v1/templates") {
    return { status: 200, body: ok(templatesRead(record.templates ?? [], { all: params.get("all") === "1" })) };
  }
  // The workspace's channels as GET channels hands them over: the rows the record knows, and nothing Meta has said of them.
  if (pathname === "/api/v1/channels") {
    return { status: 200, body: ok({ channels: (record.known?.channels ?? []).map(channelOf) }) };
  }
  // People's reads, where the record has people (the pipeline and email-only scenarios): the list as GET contacts pages
  // it, the member's saved lists (the record's own) and views (none), and one person as the person read hands them over. A
  // record with no people answers none of them.
  if (record.people) {
    const people = peopleAnswer(pathname, params, record);
    if (people) return people;
  }
  return { status: 404, body: err("not_found", `the harness has no ${pathname}`) };
}

/**
 * A channel of the record as GET channels hands it over (contracts ChannelDto): its kind, number and status, with no word
 * from Meta and nobody heard on it yet. The record keeps no id or date for a line, so these are the harness's own.
 */
const channelOf = (c) => ({
  id: `hx-channel-${c.kind}`,
  kind: c.kind,
  number_e164: c.number_e164 ?? null,
  status: c.status ?? "active",
  created_at: "2026-09-01T00:00:00.000Z",
  last_inbound_at: null,
});

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
        calendar: record.calendar ?? { state: "none", source: "your calendar", timezone: record.zone },
        booking_link: record.config?.brain?.booking_link?.trim() || null,
        // Whether the profile lists a consult-first service (withVisits): a flag; the names stay on the server.
        consult_first: (record.config?.brain?.profile?.booking_rules?.consult_first ?? []).length > 0,
        has_deals: !!record.hasDeals,
        appointment_word: record.word ?? "appointment",
        page: { q: params.get("q"), offset, limit: 1000, total: record.people.length, has_more: false },
      }),
    };
  }
  if (pathname === "/api/v1/segments") return { status: 200, body: ok({ lists: record.lists ?? [] }) };
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
 * The app's own rules beside its stylesheets: bridge/frame.css, which the app imports (app/(os)/layout.tsx), is the
 * stylesheets in their order and then rules of its own, the 44px floor under a coarse pointer among them. A page here
 * already links the stylesheets (app-styles.mjs), so the @imports are left out and the rest is served as it stands,
 * read on every request as the pages are. Without it, a spec on a touch phone measured a Save 26px tall that the app
 * draws at 44.
 */
const APP_CSS = path.join(SRC, "bridge/frame.css");
export const appRules = () => fs.readFileSync(APP_CSS, "utf8").replace(/^@import[^\n]*\n/gm, "");

/**
 * The page a record's harness serves at `/`: the kit's gallery for the `kit` record and Ask's states for the `ask`
 * record; null for every other, which draws no page.
 */
export const pageOf = (record) => (record.gallery ? galleryDocument() : record.askStates ? askStatesDocument() : null);

/**
 * Start the harness. Port 0 takes a free one, which is what the runner does. Resolves once it is listening, with the
 * record it is serving and the way to stop it.
 */
export async function startHarness({ name = "kit", port = 0, now = Date.now() } = {}) {
  const record = scenario(name, now);
  const behaves = record.gallery ? await buildBehaves() : null;
  const askStates = record.askStates ? await buildAskStates() : null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    // A page may stand at its workspace's address (/w/<slug>/, where the style-equality recorder opens every record), and
    // every file it names from there, by a path relative to it, is the harness's own.
    const p = decodeURIComponent(url.pathname).replace(new RegExp(`^/w/${WORKSPACE.slug}(?=/|$)`), "") || "/";
    const method = (req.method || "GET").toUpperCase();
    try {
      const json = answer(method, p, url.searchParams, record);
      if (json) {
        send(res, json.status, TYPES[".json"], JSON.stringify(json.body));
        return;
      }
      if (p === "/_hx/kit-behaves.js" && behaves) {
        send(res, 200, TYPES[".js"], behaves);
        return;
      }
      if (p === "/_hx/ask-states.js" && askStates) {
        send(res, 200, TYPES[".js"], askStates);
        return;
      }
      if (p === "/behaves" && behaves) {
        send(res, 200, TYPES[".html"], behavesDocument());
        return;
      }
      if (p === "/_hx/app.css") {
        send(res, 200, TYPES[".css"], appRules());
        return;
      }
      if (p === "/") {
        const page = pageOf(record);
        if (page) send(res, 200, TYPES[".html"], page);
        else send(res, 404, "text/plain", `The ${record.name} record draws no page here: the kit and ask records do.`);
        return;
      }
      serveSheet(res, p);
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
  const started = await startHarness({ port: Number(process.argv[2] || 0), name: process.argv[3] || "kit" });
  console.log(`the ${started.record.name} record on ${started.url}/`);
}
