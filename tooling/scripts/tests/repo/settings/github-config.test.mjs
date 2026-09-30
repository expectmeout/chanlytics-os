/**
 * The three files GitHub reads about a pull request before anyone looks at it: who is asked to review (CODEOWNERS),
 * what its body says (the template) and what Dependabot may open (dependabot.yml). Each is a rule with a way to go
 * quietly wrong: an owner for a folder that was moved, a template that lost a section the bodies rely on, an Expo
 * package Dependabot bumps on its own and expo-doctor then refuses (#1126, #1315).
 *
 * The files are read as text, as ops-hygiene.test.mjs reads the workflows: no YAML parser is a dependency here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "../../_source.mjs";

const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

/** CODEOWNERS' rules, in file order: an anchored directory or file, and its owners. */
function ownerRules(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [pattern, ...owners] = l.split(/\s+/);
      return { pattern, owners };
    });
}

/** Who owns a file: the last rule that matches it, as GitHub reads the file. Anchored patterns only. */
function ownersOf(rules, file) {
  let owners = [];
  for (const { pattern, owners: o } of rules) {
    const anchored = pattern.replace(/^\//, "");
    const hit = pattern.endsWith("/") ? file.startsWith(anchored) : file === anchored;
    if (hit) owners = o;
  }
  return owners;
}

test("the code a member of the public meets, and the schema every workspace's rows live in, have an owner", () => {
  const rules = ownerRules(read(".github/CODEOWNERS"));
  for (const file of [
    "apps/edge/api/diag.ts",
    "packages/channels/src/index.ts",
    "supabase/migrations/00001_init.sql",
    "supabase/migrations-ledger.json",
  ])
    assert.deepEqual(ownersOf(rules, file), ["@expectmeout"], file);
  assert.deepEqual(
    ownersOf(rules, "apps/dashboard/src/server/route.ts"),
    [],
    "everything else asks nobody in particular",
  );
});

test("every path CODEOWNERS names exists, so an owner is never asked about a folder that moved", () => {
  for (const { pattern } of ownerRules(read(".github/CODEOWNERS")))
    assert.ok(fs.existsSync(path.join(ROOT, pattern.replace(/^\//, ""))), `${pattern} is not in the tree`);
});

test("the pull request template has the sections a body is judged by", () => {
  const headings = [...read(".github/pull_request_template.md").matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(headings, [
    "What changes for a customer",
    "What moved",
    "To set or apply before merging",
    "Deploy order",
    "Scorecard",
  ]);
});

test("every package the Expo SDK pins for the phone is held back from Dependabot's weekly group", () => {
  const dependabot = read(".github/dependabot.yml");
  const npm = dependabot.slice(0, dependabot.indexOf('package-ecosystem: "github-actions"'));
  // An ignore with no update-types ignores every version: the SDK moves these together, by hand (`expo install`).
  const ignoredWhole = [...npm.matchAll(/- dependency-name: "([^"]+)"\n(?!\s+update-types)/g)].map((m) => m[1]);
  const covered = (name) => ignoredWhole.some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p));
  // The SDK's own list of what it pins: the packages `expo install --check` compares with the installed versions.
  const bundledFile = require.resolve("expo/bundledNativeModules.json", { paths: [path.join(ROOT, "apps/mobile")] });
  const bundled = JSON.parse(fs.readFileSync(bundledFile, "utf8"));
  const mobile = JSON.parse(read("apps/mobile/package.json"));
  const names = Object.keys({ ...mobile.dependencies, ...mobile.devDependencies });
  // React moves by patch beside the dashboard's, and its minor and major with the SDK: a narrower ignore, below.
  const pinned = ["expo", ...names.filter((n) => n in bundled && n !== "react" && n !== "react-dom")];
  assert.ok(pinned.length > 25, "the phone's Expo packages were found");
  const loose = pinned.filter((name) => !covered(name));
  assert.deepEqual(loose, [], "the Expo SDK pins these and Dependabot may open them: add them to its ignore list");
  assert.ok(!covered("@react-native-google-signin/google-signin"), "a package the SDK does not pin is Dependabot's");
  for (const name of ["react", "react-dom"])
    assert.ok(
      npm.includes(
        `- dependency-name: "${name}"\n        update-types: ["version-update:semver-minor", "version-update:semver-major"]`,
      ),
      `${name}: its minor and major move with the SDK`,
    );
});

test("maplibre-gl gets its own pull request, beside its vendored worker", () => {
  assert.match(read(".github/dependabot.yml"), /exclude-patterns: \["maplibre-gl"\]/);
  const dashboard = JSON.parse(read("apps/dashboard/package.json"));
  assert.ok("maplibre-gl" in dashboard.dependencies, "the package the rule is about is still a dependency");
});

test("the secret scan allows the migration ledger by path, that one file and no other", () => {
  // The ledger holds "<migration filename>": "<sha256>". A checksum is high in entropy and a filename can say "keyed",
  // so gitleaks' generic-api-key rule fired on it (#1344); nothing in it is a secret, and the next migration named with
  // key, secret or token would trip it again, so the allowance is by path, not by value.
  const toml = read(".gitleaks.toml");
  const paths = [...toml.matchAll(/^paths = \[(.+)\]$/gm)].flatMap((m) =>
    [...m[1].matchAll(/'''(.+?)'''/g)].map((p) => p[1]),
  );
  assert.deepEqual(paths, ["^supabase/migrations-ledger\\.json$"]);
  const allowed = new RegExp(paths[0]);
  assert.ok(allowed.test("supabase/migrations-ledger.json"));
  for (const other of [
    "supabase/migrations/00263_an_erased_person_s_digest_is_keyed.sql",
    "supabase/migrations-ledger.json.bak",
    "docs/migrations-ledger.json",
    "apps/edge/lib/env.ts",
  ])
    assert.ok(!allowed.test(other), `${other} is still scanned`);
  assert.ok(existsSync(path.join(ROOT, "supabase/migrations-ledger.json")), "the file the path names exists");
});
