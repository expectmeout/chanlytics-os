/**
 * Every read the dashboard's browser code makes is a registered surface's, or says how it stays fresh and why that is enough
 * (the wiring's second audit, X2-4; decision 0058).
 *
 * The hearing test (reads-are-heard.test.mjs) holds the surfaces the shell registers to what they hear. A read made anywhere else (a
 * sheet's verb, a person's page, a pane of Settings) was held to nothing, which is how the person's page, a run's sheet and Settings
 * › Activity came to draw records nothing re-reads. This is a ratchet, not a registry: every GET route a module under
 * apps/dashboard/src names, outside a registered surface's own module, is in baselines/on-demand-reads.json, keyed by the module and
 * the route, with its kind and the two sentences. The list may only fall: a read nobody listed is a red build, and one that left the
 * code leaves the file (UPDATE_BASELINES=1).
 *
 * The kinds: `link` (a file or an address the browser fetches; nothing is drawn from it), `search` (asked as the person types),
 * `boot` (the shell's own, before any surface), `surface` (a helper a registered surface's own module imports and reads through, so
 * it is read whenever that surface is: held here by the import), `on-open` (read as a sheet or a pane opens, by a person, about
 * something that the feed's records do not move), `follows` (read as a sheet or a pane opens, and again each time the surface it
 * names publishes a read, while what it shows can still move: a module beside it hears that surface's event), and `owed` (drawn,
 * and kept fresh by nothing: the finding names the lane that gives it a surface).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, stripComments } from "../../_source.mjs";
import { BANK, BANK_HINT, BASELINES_DIR, readBaseline, writeBaseline } from "../../_ratchet.mjs";
import { getsIn, registeredSurfaces, surfaceModulesOf } from "./_reads.mjs";

const FILE = "on-demand-reads.json";
const KINDS = ["link", "search", "boot", "surface", "on-open", "follows", "owed"];
/** A finding of the wiring's second audit, or a lane of it. */
const FINDING = /^(R\d+|[SX]\d+-\d+|W-[a-z-]+-\d+)$/;
const SRC = "apps/dashboard/src";

/**
 * The modules whose reads are a surface's: each registered override's own, and the code it fetches for its read
 * (surfaceModulesOf). Its helpers are held when they read for themselves.
 */
const SURFACE_MODULES = new Set(registeredSurfaces().flatMap((s) => surfaceModulesOf(s.file)));
/** The keys of those surfaces, as their overrides name them. */
const SURFACE_KEYS = new Set(
  registeredSurfaces().flatMap(({ file }) =>
    [...stripComments(fs.readFileSync(path.join(ROOT, file), "utf8")).matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]),
  ),
);
/** Whether a module in this folder hears the surface's own event (`surface:<key>`), as a sheet that follows it does. */
const heardBeside = (module, key) => {
  const folder = path.posix.dirname(module);
  return fs
    .readdirSync(path.join(ROOT, folder))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .some((f) => stripComments(fs.readFileSync(path.join(ROOT, folder, f), "utf8")).includes(`"surface:${key}"`));
};

/** The modules a file imports, from the root, extension and all (`@/x` and relative specifiers; a package is none). */
function importsOf(file) {
  const out = new Set();
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const m of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/")
      ? `${SRC}/${spec.slice(2)}`
      : spec.startsWith(".")
        ? path.posix.join(path.posix.dirname(file), spec)
        : null;
    if (!base) continue;
    for (const ext of [".ts", ".tsx", "/index.ts"])
      if (fs.existsSync(path.join(ROOT, `${base}${ext}`))) out.add(`${base}${ext}`);
  }
  return out;
}

/** Every GET route a browser module names, outside the surfaces' own modules, as `<module> <route>`. */
function readsNow() {
  const pairs = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        // The server answers reads and makes none of a page's; what it names is its own.
        if (rel !== `${SRC}/server`) walk(rel);
      } else if (/\.(ts|tsx|jsx)$/.test(e.name) && !/\.generated\.ts$|\.type-test\.ts$/.test(e.name)) {
        if (SURFACE_MODULES.has(rel)) continue;
        for (const get of getsIn(stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"))))
          pairs.push(`${rel} ${get}`);
      }
    }
  };
  walk(SRC);
  return pairs.sort();
}

const now = readsNow();
if (BANK) {
  const was = readBaseline(FILE);
  if (was)
    writeBaseline(
      path.join(ROOT, BASELINES_DIR, FILE),
      Object.fromEntries(Object.entries(was).filter(([k]) => now.includes(k))),
    );
}
const listed = readBaseline(FILE) ?? {};

test("every read outside a registered surface is listed, with how it stays fresh: nothing new is read unsaid", () => {
  assert.ok(now.length > 10, `the scan found ${now.length} reads; it has stopped seeing the modules`);
  assert.deepEqual(
    now.filter((pair) => !(pair in listed)),
    [],
    `make it a surface the shell registers (LegacyApp.tsx), read it from one, or list it in ${BASELINES_DIR}/${FILE} with its kind, how it stays fresh and why that is enough`,
  );
});

test("the list is not stale: a read that left the code leaves it", () => {
  assert.deepEqual(
    Object.keys(listed).filter((pair) => !now.includes(pair)),
    [],
    `good, now bank it: ${BANK_HINT}`,
  );
});

test("each listed read says its kind, how it stays fresh and why that is enough; an owed one names its finding", () => {
  for (const [pair, entry] of Object.entries(listed)) {
    assert.ok(KINDS.includes(entry.kind), `${pair}: a kind of ${KINDS.join(", ")}`);
    assert.ok(typeof entry.fresh === "string" && entry.fresh.trim().length >= 30, `${pair}: say how it stays fresh`);
    assert.ok(typeof entry.why === "string" && entry.why.trim().length >= 60, `${pair}: say why that is enough`);
    if (entry.kind === "owed") assert.match(entry.finding ?? "", FINDING, `${pair}: an owed read names its finding`);
    else assert.equal("finding" in entry, false, `${pair}: only an owed read waits on a finding`);
    if (entry.kind === "follows") {
      assert.ok(
        SURFACE_KEYS.has(entry.follows),
        `${pair}: it follows ${entry.follows}, which is no surface the shell registers`,
      );
      assert.ok(
        heardBeside(pair.split(" ")[0], entry.follows),
        `${pair}: no module beside it hears surface:${entry.follows}, so nothing reads it again`,
      );
    } else assert.equal("follows" in entry, false, `${pair}: only a read that follows a surface names one`);
    if (entry.kind === "surface") {
      const module = pair.split(" ")[0];
      assert.ok(
        [...SURFACE_MODULES].some((file) => importsOf(file).has(module)),
        `${pair}: no registered surface's own module imports ${module}, so it is not read with one`,
      );
    }
  }
});
