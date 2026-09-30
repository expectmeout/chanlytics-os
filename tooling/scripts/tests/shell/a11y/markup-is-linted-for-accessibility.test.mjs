/**
 * The dashboard's markup is linted for what a person with a screen reader or only a keyboard meets.
 *
 * eslint.config.mjs runs the jsx-a11y rules (eslint-plugin-jsx-a11y-x, the maintained fork: the original supports
 * ESLint 9 at most) over the paths it lists as the dashboard's markup, each rule a warning the lint baseline holds per
 * file, so a new finding fails (tooling/scripts/checks/lint.mjs). The paths are a list rather than one glob over `src`,
 * because a glob would reach markup no block parses; the second test holds the list to the tree, so a new directory of
 * pages cannot be left out of it.
 *
 * Nothing here reads the config's text; it asks ESLint.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ESLint } from "eslint";
import config, { withoutTypes } from "../../../../../eslint.config.mjs";
import { ROOT } from "../../_source.mjs";
import { repoFiles } from "../../_ast.mjs";

// The accessibility rules read the markup, not its types: the probes are linted without the typed rules' programs.
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: withoutTypes(config) });
const A11Y = "jsx-a11y-x/";
/** A click on a bare div: no keyboard reaches it, and a screen reader does not call it a control. */
const CLICKABLE_DIV = "function Probe({ go }) {\n  return <div onClick={go}>Open</div>;\n}\n";
/** The same control, as the element it is. */
const BUTTON = 'function Probe({ go }) {\n  return <button type="button" onClick={go}>Open</button>;\n}\n';

/** The accessibility findings on a snippet linted as if it lived at `file`, as [rule, severity]. */
async function a11yOn(file, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  assert.deepEqual(
    result.messages.filter((m) => m.fatal).map((m) => m.message),
    [],
    `${file} must parse`,
  );
  return result.messages
    .filter((m) => m.ruleId?.startsWith(A11Y))
    .map((m) => [m.ruleId, m.severity])
    .sort();
}

test("a clickable div is flagged in the shell's JSX and in the TSX, a surface's and the kit's included, as a warning the baseline holds; a button is not", async () => {
  const places = [
    "apps/dashboard/src/legacy/pages/a11y-probe.jsx",
    "apps/dashboard/src/legacy-bridge/a11y-probe.tsx",
    "apps/dashboard/app/a11y-probe/page.tsx",
    // A surface that has left the shell (0015), and the kit it draws with.
    "apps/dashboard/src/surfaces/reports/a11y-probe.tsx",
    "apps/dashboard/src/surfaces/kit/a11y-probe.tsx",
  ];
  for (const file of places) {
    assert.deepEqual(
      await a11yOn(file, CLICKABLE_DIV),
      [
        [`${A11Y}click-events-have-key-events`, 1],
        [`${A11Y}no-static-element-interactions`, 1],
      ],
      file,
    );
    assert.deepEqual(await a11yOn(file, BUTTON), [], `${file}: a button is a control`);
  }
});

test("every markup file in the dashboard is under the accessibility rules", async () => {
  const markup = repoFiles(["apps/dashboard"]).filter((f) => /\.(tsx|jsx)$/.test(f));
  // The count is not the point; a scan that found none would pass vacuously.
  assert.ok(markup.length >= 100, `found only ${markup.length} markup files; the scan has stopped seeing them`);
  const missed = [];
  for (const f of markup) {
    const config = await eslint.calculateConfigForFile(path.join(ROOT, f));
    if (!config?.rules?.[`${A11Y}click-events-have-key-events`]) missed.push(f);
  }
  assert.deepEqual(missed, [], "add the path to DASHBOARD_MARKUP in eslint.config.mjs, and to a block that parses it");
});
