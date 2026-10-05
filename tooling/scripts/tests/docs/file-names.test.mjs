/**
 * The file names docs/naming.md asks for, over every tracked script, module and stylesheet in apps, packages, tooling
 * and e2e: kebab-case that says what the file holds; PascalCase only for a component's file (.tsx); a leading
 * underscore only for a test helper under tooling/scripts/tests; a framework's own names are its own (Expo Router's
 * `_layout.tsx` and `+native-intent.tsx`). The role files a folder repeats on purpose (`surface.ts`, `verbs.ts`,
 * `ports.ts`, `sample.ts`) are kebab-case like the rest. Built output is not held.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT } from "../_source.mjs";

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
    return f.startsWith("tooling/scripts/tests/") ? null : "a leading underscore is for a test helper only";
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

test("the rule refuses what it should", () => {
  assert.equal(problem("packages/core/src/leads/cards.ts"), null);
  assert.equal(problem("apps/dashboard/src/auth/AuthShell.tsx"), null);
  assert.equal(problem("tooling/scripts/tests/leads/_mark-images.mjs"), null);
  assert.equal(problem("tooling/scripts/tests/reach-out/reach-out.integration.db.test.mjs"), null);
  assert.equal(problem("apps/mobile/src/app/_layout.tsx"), null);
  assert.equal(problem("apps/mobile/src/shell/widget.ios.ts"), null);
  assert.match(problem("packages/core/src/leads/leadCards.ts"), /not kebab-case/);
  assert.match(problem("packages/core/src/leads/Cards.ts"), /component's file/);
  assert.match(problem("packages/core/src/leads/_cards.ts"), /test helper/);
  assert.match(problem("apps/dashboard/src/server/lead_cards.ts"), /not kebab-case/);
});
