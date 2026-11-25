/**
 * Each dependency declared once, in one pin style.
 *
 * A third-party dependency that two workspace projects name has its version written once, in pnpm-workspace.yaml's
 * catalog, and each package.json that names it says `catalog:`. Until 25 Nov 2026 zod was written ^4.6.7 in six
 * package.json files and @supabase/supabase-js ^2.119.2 in seven, beside exact pins of other names, and Dependabot
 * moved each line on its own: nothing kept two projects on one zod but luck.
 *
 * Every version the repository writes is exact (decision 0054: "pinned exactly, no caret"), the catalog's and each
 * package.json's own, so a line says what the lockfile installs. pnpm-workspace.yaml says why beside the catalog.
 *
 * The phone app keeps the pins Expo sets for it: the SDK's React, the eslint Expo's lint config takes, and the packages
 * the SDK pins, written as `expo install` writes them. The last are the names Dependabot leaves to the SDK
 * (.github/dependabot.yml, read here as github-config.test.mjs reads it), so the two lists cannot drift apart.
 * typescript-is-declared-once.test.mjs holds the one TypeScript among these, with its history.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import { settingBlock, workspaceProjects } from "../../_pnpm-workspace.mjs";

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
/** An exact version: no range, no tag, nothing pnpm could resolve two ways. */
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const CATALOG = "catalog:";
const isWorkspace = (spec) => spec.startsWith("workspace:");

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const manifestPath = (project) => (project === "." ? "package.json" : `${project}/package.json`);
const projects = workspaceProjects();
const manifests = new Map(projects.map((p) => [p, JSON.parse(read(manifestPath(p)))]));
const catalog = settingBlock("catalog");

/** Every dependency a project names, from a registry (not one of the workspace's own): its field, name and specifier. */
const namesOf = (project) =>
  FIELDS.flatMap((field) =>
    Object.entries(manifests.get(project)[field] ?? {})
      .filter(([, spec]) => !isWorkspace(spec))
      .map(([name, spec]) => ({ project, field, name, spec })),
  );
const named = projects.flatMap(namesOf);

const PHONE = "apps/mobile";
/** The phone's own pins beside the catalog's, each with why it is not the catalog's. */
const PHONE_OWN = new Map([
  ["react", "the Expo SDK's React (19.2.3 beside the dashboard's 19.3), which moves with the SDK, by hand"],
  ["react-dom", "react's pair, at react's version"],
  ["eslint", "Expo's lint config brings eslint-plugin-react 7 and eslint-plugin-import 2, whose eslint stops at 9"],
]);
/** The names Dependabot leaves to the Expo SDK: an ignore with no update-types or versions ignores every version. */
const dependabot = read(".github/dependabot.yml");
const npmRules = dependabot.slice(0, dependabot.indexOf('package-ecosystem: "github-actions"'));
const sdkPatterns = [...npmRules.matchAll(/- dependency-name: "([^"]+)"\n(?!\s+(update-types|versions))/g)].map(
  (m) => m[1],
);
const isSdkPinned = (name) => sdkPatterns.some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p));
/** A name the phone app pins itself, apart from the catalog. */
const isPhoneOwn = ({ project, name }) => project === PHONE && (PHONE_OWN.has(name) || isSdkPinned(name));
const where = ({ project, field, name, spec }) => `${manifestPath(project)}: ${field}["${name}"] is "${spec}"`;

test("the reader sees the workspace, its catalog and the phone's Expo packages", () => {
  assert.ok(projects.length >= 10, `read ${projects.length} projects from pnpm-workspace.yaml: ${projects.join(", ")}`);
  for (const p of ["apps/dashboard", "apps/edge", PHONE, "packages/db", "tests", "tooling/scripts"])
    assert.ok(projects.includes(p), `${p} is a workspace project`);
  for (const name of ["typescript", "zod", "@supabase/supabase-js", "react"])
    assert.ok(name in catalog, `pnpm-workspace.yaml's catalog names ${name}`);
  assert.ok(sdkPatterns.includes("expo") && sdkPatterns.includes("expo-*"), "dependabot.yml's SDK ignores were read");
  assert.ok(named.filter(isPhoneOwn).length > 25, "the phone's own pins were found");
});

test("a dependency two projects name is written once, in the catalog, and each names it `catalog:`", () => {
  // The phone's own pins are its own; every other naming of a name counts, so a second project that writes a version
  // of a name another project already names fails here, whichever of the two came first.
  const shared = named.filter((d) => !isPhoneOwn(d));
  const projectsNaming = (name) => new Set(shared.filter((d) => d.name === name).map((d) => d.project));
  const alsoNaming = (d) => [...projectsNaming(d.name)].filter((p) => p !== d.project).join(", ") || "the catalog";
  const off = shared
    .filter(({ name, spec }) => spec !== CATALOG && (name in catalog || projectsNaming(name).size > 1))
    .map((d) => `${where(d)}, and ${alsoNaming(d)} names it too`);
  assert.deepEqual(off, [], 'write its version once in pnpm-workspace.yaml\'s catalog and name it "catalog:" in each');
  const unknown = shared.filter(({ name, spec }) => spec === CATALOG && !(name in catalog)).map(where);
  assert.deepEqual(unknown, [], "a `catalog:` the catalog does not hold: add its line to pnpm-workspace.yaml");
});

test("the catalog holds what the projects name: each entry is named `catalog:` somewhere, react with react-dom", () => {
  const used = new Set(named.filter(({ spec }) => spec === CATALOG).map(({ name }) => name));
  assert.deepEqual(
    Object.keys(catalog).filter((name) => !used.has(name)),
    [],
    "a catalog line nothing names: remove it",
  );
  assert.equal(catalog["react-dom"], catalog.react, "react and react-dom move as one");
  assert.deepEqual(settingBlock("catalogs"), {}, "one catalog, the default: a named one is a second place to look");
});

test("every version the repository writes is exact, but the packages Expo's SDK pins for the phone", () => {
  const ranged = Object.entries(catalog)
    .filter(([, version]) => !EXACT.test(version))
    .map(([name, version]) => `pnpm-workspace.yaml: catalog["${name}"] is "${version}"`);
  for (const d of named) {
    if (d.spec === CATALOG || EXACT.test(d.spec)) continue;
    // `expo install` writes the SDK's own range (~57.0.25) and expo-doctor compares the install with the SDK; neither
    // is ours to restyle, and Dependabot never opens them.
    if (d.project === PHONE && isSdkPinned(d.name) && /^~\d+\.\d+\.\d+$/.test(d.spec)) continue;
    ranged.push(where(d));
  }
  assert.deepEqual(ranged, [], "pin the version the lockfile installs, with no caret or tilde (decision 0054)");
});

test("the phone keeps its own React and eslint, each exact, its React the pair the SDK pins", () => {
  const phone = manifests.get(PHONE);
  const own = (name) => phone.dependencies?.[name] ?? phone.devDependencies?.[name];
  for (const [name, why] of PHONE_OWN) {
    const spec = own(name);
    assert.ok(spec, `${PHONE} names ${name}`);
    assert.match(spec, EXACT, `${PHONE}: ${name} is "${spec}": pin it exactly, apart from the catalog (${why})`);
  }
  assert.equal(own("react-dom"), own("react"), "the phone's react-dom is its react's version");
});

test("the lockfile's catalog is pnpm-workspace.yaml's, each line at the version it says", () => {
  // CI's --frozen-lockfile refuses a specifier the lockfile does not hold; this says which, and that the exact line is
  // what was installed.
  const lock = read("pnpm-lock.yaml");
  const block = /^catalogs:\n {2}default:\n((?: {4}.*\n)+)/m.exec(lock);
  assert.ok(block, "pnpm-lock.yaml has a default catalog");
  const locked = {};
  let name = null;
  for (const line of block[1].split("\n")) {
    const key = /^ {4}'?([^':]+)'?:$/.exec(line);
    if (key) name = key[1];
    const field = /^ {6}(specifier|version): '?([^']+?)'?$/.exec(line);
    if (field && name) locked[name] = { ...locked[name], [field[1]]: field[2] };
  }
  assert.deepEqual(Object.keys(locked).sort(), Object.keys(catalog).sort(), "the lockfile's catalog names the yaml's");
  const off = Object.entries(catalog)
    .filter(([n, version]) => locked[n].specifier !== version || locked[n].version !== version)
    .map(([n, version]) => `${n}: the yaml says ${version}, the lockfile ${JSON.stringify(locked[n])}`);
  assert.deepEqual(off, [], "run `corepack pnpm install` and commit the lockfile it writes");
});
