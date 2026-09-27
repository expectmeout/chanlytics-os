/**
 * The Ask tools' rename, carried into the eval cases (Ask Rewired, Phase 3, D13).
 *
 * PR 3.4 consolidated the twenty-six tools to nineteen, each old tool now one tool and action, recorded by a turn as
 * `name.action` (D11). `tooling/evals/tool-names.json` is the one table of it: old name -> new. This rewrites a case
 * file's `expect.tools_any` and `expect.tools_also_any` through that table, once; a name already new is kept, so a
 * second run changes nothing, and a name the table does not know is refused by case and name, with nothing written.
 * The judge (eval-ask.mjs) reads names through the table too (`usedAny`), on both sides: a case or a stored turn that still says
 * an old name is judged as the new one, so PR 2.3's baseline stays comparable.
 *
 *   node tooling/evals/rename-ask-tools.mjs [tooling/evals/ask-cases.json]           # say what would change
 *   node tooling/evals/rename-ask-tools.mjs --apply [tooling/evals/ask-cases.json]   # write it (then prettier)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Old tool name -> `name.action`, or `name` for a tool with no action. */
export const TOOL_NAMES = JSON.parse(readFileSync(new URL("./tool-names.json", import.meta.url), "utf8"));
const NOW = new Set(Object.values(TOOL_NAMES));

/** A tool name as the registry records it today: an old one through the table, any other as it is. */
export function toolNow(name) {
  return Object.prototype.hasOwnProperty.call(TOOL_NAMES, name) ? TOOL_NAMES[name] : name;
}

/**
 * Whether a turn used any of a case's tools, both sides read through the table: the judge's one reading (eval-ask.mjs),
 * so a case that still says an old name, or a turn stored before the rename, is judged by the new names.
 */
export function usedAny(names, tools) {
  const used = new Set((tools ?? []).map(toolNow));
  return names.some((n) => used.has(toolNow(n)));
}

/** The keys of a case's `expect` that name tools. */
const TOOL_KEYS = ["tools_any", "tools_also_any"];

/**
 * The cases with every tool name new: `{ cases, changed, unknown }`. `changed` counts the names rewritten; `unknown`
 * lists each name neither old nor new as `<case id>: <name>`, and a caller writes nothing while it is not empty.
 */
export function renameCases(cases) {
  let changed = 0;
  const unknown = [];
  const out = cases.map((c) => {
    if (!c.expect) return c;
    const expect = { ...c.expect };
    for (const key of TOOL_KEYS) {
      if (!Array.isArray(expect[key])) continue;
      expect[key] = expect[key].map((name) => {
        const to = toolNow(name);
        if (!NOW.has(to)) unknown.push(`${c.id}: ${name}`);
        if (to !== name) changed++;
        return to;
      });
    }
    return { ...c, expect };
  });
  return { cases: out, changed, unknown };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const apply = process.argv.includes("--apply");
  const file = process.argv.slice(2).find((a) => !a.startsWith("--")) || "tooling/evals/ask-cases.json";
  const { cases, changed, unknown } = renameCases(JSON.parse(readFileSync(file, "utf8")));
  if (unknown.length) {
    console.error(`names neither old nor new, so nothing was written:\n  ${unknown.join("\n  ")}`);
    process.exit(1);
  }
  const touched = cases.filter((c) => TOOL_KEYS.some((k) => Array.isArray(c.expect?.[k]))).length;
  console.log(`${changed} name(s) to rewrite across ${touched} case(s) that name tools, in ${file}`);
  if (apply && changed) {
    writeFileSync(file, JSON.stringify(cases, null, 2) + "\n");
    console.log("written; run prettier over it (the pre-commit hook does)");
  } else if (!apply) console.log("dry run: --apply writes it");
}
