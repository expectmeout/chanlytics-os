#!/usr/bin/env node
/**
 * The barrels, in order: every lane that adds a name adds it where its letters put it, so two lanes' lines land apart
 * (decision 0074, section 4).
 *
 * A barrel (each package's `src/index.ts`, each folder's `index.ts` under it, and the four under the apps that only
 * re-export) is a list several lanes add to: in the 30 days to 28 October 2026, 216 changes touched a contracts
 * domain's barrel and 109 db's, and a new line went wherever its author was, which is where the next lane's line went
 * too. Here each barrel is written in one order: its statements by the module they name (a value export before the
 * type export of the same module), and the names within each statement alphabetically, ignoring case. A comment that
 * stands over a statement moves with it; the barrel's first comment, its header, stays at the top. What each barrel
 * names is unchanged: only the order is written.
 *
 * Contracts' root index is not sorted: its zod setting runs first and its activity folder last, each for a reason its
 * comment says, and contracts-barrels.test.mjs holds its list of folders.
 *
 *   node tooling/scripts/gen/sorted-lists.mjs           # write the order
 *   node tooling/scripts/gen/sorted-lists.mjs --check   # exit 1 when a barrel is out of it
 *
 * repo/sorted-lists.test.mjs holds every barrel to the order in memory.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as prettier from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The barrels that keep an order of their own, each with its reason in its own comments. */
export const OWN_ORDER = ["packages/contracts/src/index.ts"];

/** The barrels: every index.ts of a package's source, and the apps' that hold nothing but re-exports. */
export function barrels(root = ROOT) {
  const tracked = execFileSync("git", ["ls-files", "packages/*/src/**index.ts", "apps/**/index.ts"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /(^|\/)index\.ts$/.test(f) && !f.includes("/dist/") && !OWN_ORDER.includes(f));
  return tracked.filter((f) => isBarrel(fs.readFileSync(path.join(root, f), "utf8"), f));
}

/** Whether a module holds re-exports and nothing else. */
export function isBarrel(text, file = "index.ts") {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return sf.statements.length > 0 && sf.statements.every((s) => ts.isExportDeclaration(s) && s.moduleSpecifier);
}

/** The order of two names, ignoring case first, so `emailDomainOf` and `MAILBOX_RESERVED` sit where a reader looks. */
const byName = (a, b) => {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/** A statement's place: the module it names, then a value export before a type export, then `export *` last. */
function placeOf(s) {
  const spec = s.moduleSpecifier.text;
  const kind = !s.exportClause ? 2 : s.isTypeOnly ? 1 : 0;
  return { spec, kind };
}

/** A statement written with its names in order. */
function written(s, text) {
  if (!s.exportClause || !ts.isNamedExports(s.exportClause)) return text.slice(s.getStart(), s.end);
  const names = s.exportClause.elements
    .map((e) => ({ key: e.name.text, text: text.slice(e.getStart(), e.end) }))
    .sort((a, b) => byName(a.key, b.key))
    .map((e) => e.text);
  const attributes = s.attributes ? ` ${text.slice(s.attributes.getStart(), s.attributes.end)}` : "";
  return `export ${s.isTypeOnly ? "type " : ""}{ ${names.join(", ")} } from ${JSON.stringify(s.moduleSpecifier.text)}${attributes};`;
}

/** A barrel's text in order, formatted as Prettier formats the file. */
export async function sortedBarrel(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const statements = [...sf.statements];
  let header = "";
  const parts = statements.map((s, i) => {
    const ranges = ts.getLeadingCommentRanges(text, s.pos) ?? [];
    const own = i === 0 ? ranges.slice(1) : ranges;
    if (i === 0 && ranges[0]) header = text.slice(ranges[0].pos, ranges[0].end);
    const comments = own.map((r) => text.slice(r.pos, r.end));
    return { s, comments, place: placeOf(s) };
  });
  parts.sort(
    (a, b) => (a.place.spec < b.place.spec ? -1 : a.place.spec > b.place.spec ? 1 : 0) || a.place.kind - b.place.kind,
  );
  const body = parts.map((p) => [...p.comments, written(p.s, text)].join("\n")).join("\n");
  const out = `${header ? `${header}\n` : ""}${body}\n`;
  const options = (await prettier.resolveConfig(path.join(ROOT, file))) ?? {};
  return prettier.format(out, { ...options, filepath: path.join(ROOT, file) });
}

/** Each barrel out of order, with the text it should hold. */
export async function outOfOrder(root = ROOT) {
  const found = [];
  for (const file of barrels(root)) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const sorted = await sortedBarrel(text, file);
    if (sorted !== text) found.push({ file, sorted });
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const found = await outOfOrder();
  if (check) {
    for (const { file } of found) console.error(`out of order: ${file}`);
    if (found.length) console.error("write the order: node tooling/scripts/gen/sorted-lists.mjs");
    process.exit(found.length ? 1 : 0);
  }
  for (const { file, sorted } of found) fs.writeFileSync(path.join(ROOT, file), sorted);
  console.log(`sorted-lists: ${found.length} barrel${found.length === 1 ? "" : "s"} written in order`);
}
