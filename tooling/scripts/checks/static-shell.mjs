#!/usr/bin/env node
/**
 * The signed-in frame is static (decision 0053, step 5): every page of the OS is prerendered once for every person and
 * workspace, so a document of it is served without running a function and a page warmed is warmed for every address of
 * its route (workspace.ts warmRoute). It stays so only while nothing under app/(os) reads the request: a layout that
 * read the session, a page that awaited its params, a component that read the clock on the server, and the frame is a
 * render per request again, with no error anywhere. The lint refuses the (os) tree the session, a header and the
 * database; this holds what the build made of it.
 *
 * Run after the dashboard's production build. It reads what Next wrote:
 *
 *   app-path-routes-manifest.json   every page, by its file under app/ (the OS's are the ones under `(os)`)
 *   prerender-manifest.json         how each was prerendered: a route the build knew whole (`routes`), or a shell for
 *                                   any address of a dynamic route (`dynamicRoutes`), with Next's own reading of what
 *                                   is left to do at a request (`compute`: `static` is nothing; `resuming`, a render
 *                                   to finish; `blocking`, a render from nothing)
 *   server/app/<route>.meta         the shell's own record: `postponed` where a render waits on the request
 *   server/app/<route>.segments/    the files a prefetch is answered from, `_tree` first
 *
 * and fails on any page of the OS that is not `compute: static`, holds postponed state, or has no segments; on the
 * home (`/`) not built whole; and on `/api/version` prerendered (it must name the deploy that answers, at each request:
 * app/api/version/route.ts). A build of another shape exits 2, as check:bundle does, rather than holding less.
 *
 *   corepack pnpm check:static-shell                     # after a build
 *   node tooling/scripts/checks/static-shell.mjs --next <dir>
 *
 * checks/static-shell.test.mjs runs `staticShellFaults` over builds made up for the purpose.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OS = "/(os)/";

/** A build that is not the shape this reads. */
class BuildShape extends Error {}

const readJson = (dir, rel) => {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) throw new BuildShape(`no ${rel} under ${dir}: build the dashboard first`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

/**
 * What is wrong with a build's OS pages, in words, or nothing: `pages` is the app-path routes manifest, `prerender`
 * the prerender manifest, and `files` answers whether a file the build should have written is there, and reads a
 * shell's `.meta` (`meta(route)`, null when it has none).
 */
export function staticShellFaults({ pages, prerender, files }) {
  if (!prerender || typeof prerender.routes !== "object" || typeof prerender.dynamicRoutes !== "object")
    throw new BuildShape("the prerender manifest has no routes or dynamicRoutes");
  const faults = [];
  const osRoutes = Object.entries(pages)
    .filter(([file]) => file.startsWith(OS) && file.endsWith("/page"))
    .map(([, route]) => route);
  if (!osRoutes.includes("/")) throw new BuildShape("the app-path routes manifest names no OS home (/(os)/page)");
  for (const route of osRoutes) {
    const whole = prerender.routes[route];
    const shell = prerender.dynamicRoutes[route];
    const entry = whole ?? shell;
    if (!entry) {
      faults.push(`${route}: not prerendered: a request renders it`);
      continue;
    }
    if (entry.compute !== "static")
      faults.push(`${route}: prerendered with a render left to a request (compute ${entry.compute ?? "unsaid"})`);
    if (shell && files.meta(route)?.postponed)
      faults.push(`${route}: its shell waits on the request (postponed state in its .meta)`);
    if (shell && !files.has(`${route}.segments/_tree.segment.rsc`))
      faults.push(`${route}: no segment files: a warm of it would render it`);
  }
  if (!prerender.routes["/"]) faults.push("/: the home is not built whole");
  if (prerender.routes["/api/version"] || prerender.dynamicRoutes["/api/version"])
    faults.push("/api/version: prerendered, so it names the build, not the deploy that answers (connection())");
  return faults;
}

/** The build under `next`, as staticShellFaults reads it. */
export function readBuild(next) {
  const app = path.join(next, "server/app");
  return {
    pages: readJson(next, "app-path-routes-manifest.json"),
    prerender: readJson(next, "prerender-manifest.json"),
    files: {
      has: (rel) => fs.existsSync(path.join(app, rel)),
      meta: (route) => {
        const file = path.join(app, `${route}.meta`);
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
      },
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--next");
  const next = at >= 0 ? path.resolve(args[at + 1]) : path.join(ROOT, "apps/dashboard/.next");
  let faults;
  try {
    faults = staticShellFaults(readBuild(next));
  } catch (e) {
    if (e instanceof BuildShape) {
      console.error(`check:static-shell: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
  if (faults.length) {
    console.error(
      "check:static-shell: the OS's frame is no longer one prerender for everyone (decision 0053, step 5).\n" +
        "Something under app/(os) reads the request; read it in a route, behind withRoute, instead.\n",
    );
    for (const f of faults) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("check:static-shell: every page of the OS is prerendered whole, for every address of its route.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
