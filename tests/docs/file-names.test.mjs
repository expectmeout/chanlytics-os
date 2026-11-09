/**
 * The file names docs/naming.md asks for, over every tracked script, module and stylesheet in apps, packages, tooling
 * and e2e: kebab-case that says what the file holds; PascalCase only for a component's file (.tsx); a leading
 * underscore only for a test helper under tests; a framework's own names are its own (Expo Router's
 * `_layout.tsx` and `+native-intent.tsx`). The role files a folder repeats on purpose (`surface.ts`, `verbs.ts`,
 * `ports.ts`, `sample.ts`, `types.ts`) are kebab-case like the rest. Built output is not held. A name that says nothing of
 * what is in it (`utils`, `helpers`) is refused too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { isGenericStem } from "../repo/names/_names.mjs";

const files = execFileSync("git", ["ls-files", "apps", "packages", "tooling", "e2e"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(m?[jt]sx?|cjs|css)$/.test(f) && !/(^|\/)(dist|node_modules)\//.test(f));

/**
 * The name without what says its kind: `.test.mjs`, `.db.test.mjs`, `.type-test.ts`, `.generated.ts`, `.config.ts`,
 * Supabase's generated `database.types.ts`, and Metro's platform files (`widget.ios.ts`, picked on that platform).
 */
const stemOf = (f) =>
  path
    .basename(f)
    .replace(/\.(m?[jt]sx?|cjs|css)$/, "")
    .replace(/\.(ios|android|native|web)$/, "")
    .replace(/(\.integration)?(\.db)?\.test$|\.type-test$|\.spec$|\.generated$|\.config$|\.types$|\.d$/, "");

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const EXPO = new Set(["_layout", "+native-intent", "+not-found", "+html"]);

/** Why a name breaks the rule, or null when it keeps it. */
function problem(f) {
  const stem = stemOf(f);
  if (KEBAB.test(stem)) return null;
  if (PASCAL.test(stem)) return f.endsWith(".tsx") ? null : "PascalCase is for a component's file (.tsx) only";
  if (f.startsWith("apps/mobile/src/app/") && EXPO.has(stem)) return null;
  if (/^_[a-z0-9]+(-[a-z0-9]+)*$/.test(stem))
    return f.startsWith("tests/") ? null : "a leading underscore is for a test helper only";
  return "not kebab-case";
}

test("every file is named as docs/naming.md says: kebab-case, PascalCase for a component, _ for a test helper", () => {
  assert.ok(files.length > 1500, `the tree is read (${files.length} files)`);
  const broken = files.map((f) => [f, problem(f)]).filter(([, why]) => why);
  assert.deepEqual(
    broken.map(([f, why]) => `${f}: ${why}`),
    [],
    "rename the file, or say in docs/naming.md why its kind is named otherwise",
  );
});

/** Named before the rule (6 November 2026), all in the browser's code: each goes when its surface next moves, and none joins. */
const GENERIC_BEFORE_THE_RULE = new Set([
  "apps/dashboard/src/surfaces/frame/constants.ts",
  "apps/dashboard/src/surfaces/inbox/constants.ts",
  "apps/dashboard/src/surfaces/reports/lenses/shared.tsx",
  "apps/dashboard/src/surfaces/settings/business/gestures/common.tsx",
  "apps/dashboard/src/surfaces/settings/shared.ts",
  "apps/dashboard/src/surfaces/today/helpers.ts",
]);

test("a file's name says what it holds: no utils, helpers, common or constants", () => {
  const generic = files.filter((f) => isGenericStem(stemOf(f)));
  assert.deepEqual(
    generic.filter((f) => !GENERIC_BEFORE_THE_RULE.has(f)),
    [],
    "name it for what is in it (docs/naming.md); a folder of its own says more than `utils` does",
  );
  assert.deepEqual(
    [...GENERIC_BEFORE_THE_RULE].filter((f) => !generic.includes(f)),
    [],
    "take it off GENERIC_BEFORE_THE_RULE: it has a name now",
  );
});

test("the rule refuses what it should", () => {
  assert.equal(problem("packages/core/src/leads/cards.ts"), null);
  assert.equal(problem("apps/dashboard/src/auth/AuthShell.tsx"), null);
  assert.equal(problem("tests/leads/_mark-images.mjs"), null);
  assert.equal(problem("tests/reach-out/reach-out.integration.db.test.mjs"), null);
  assert.equal(problem("apps/mobile/src/app/_layout.tsx"), null);
  assert.equal(problem("apps/mobile/src/shell/widget.ios.ts"), null);
  assert.match(problem("packages/core/src/leads/leadCards.ts"), /not kebab-case/);
  assert.match(problem("packages/core/src/leads/Cards.ts"), /component's file/);
  assert.match(problem("packages/core/src/leads/_cards.ts"), /test helper/);
  assert.match(problem("apps/dashboard/src/server/lead_cards.ts"), /not kebab-case/);
});
