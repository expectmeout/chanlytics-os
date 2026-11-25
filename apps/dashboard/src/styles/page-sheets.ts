/**
 * Each page its own styles: which rules of the frame's stylesheets a page's code can draw, worked out from the code.
 *
 * Until 24 November 2026 every page loaded every stylesheet (bridge/frame.css imported all of them: 183 KB gzipped,
 * 1 MB of rules, of which a page matched 4 to 7 in a hundred). A page now links, for each stylesheet, the smallest of up
 * to three files that holds every rule its code can draw.
 *
 * - A rule can match only where every class it needs is on the page, and a class is on a page only where a module the
 *   page loads writes it. A rule's needs are the classes of its selector that stand outside any `:is()`, `:where()`,
 *   `:not()` or `:has()` (what stands inside one is an alternative or a denial, so it is asked of nobody). A module
 *   writes every word of every string it holds, and every name that starts with a piece a string or a template ends on
 *   before something is joined to it (`"cl-" + kind`): wider than the classes it draws, never narrower. Measured on 58
 *   draws of 29 pages (24 Nov 2026): every one of the 26,223 rules a browser matched was one this gave its page.
 * - What a page loads is what its entry reaches by `import`, `import()` included and a type's import left out: the
 *   page's own entry and the layouts over it (write-page-sheets.ts). The contracts' words are every page's.
 * - A stylesheet's files are nested: the frame's part, that with what the pages reaching a little of the rest add, and
 *   every rule some page can draw. Nested, so whatever a tab has collected by moving from page to page is the widest
 *   of them with copies of its own earlier rules before it, and the cascade reads as it did when one file held it all.
 *   A rule no page can draw is in none of them.
 *
 * Nothing here reads a file: write-page-sheets.ts does, as the build's configuration is read (next.config.ts).
 */
import type { Selector } from "lightningcss";
import ts from "typescript";

/** A module as the split reads it: what it imports, the words of its strings, and the pieces it builds names on. */
export interface ModuleRead {
  imports: string[];
  words: string[];
  stems: string[];
}

/** The specifier a statement loads a module by, where it loads one: an import or an `export … from`, a type's aside. */
function loadedBy(node: ts.Node): string | null {
  const typed = ts.isImportDeclaration(node) && node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
  if (ts.isImportDeclaration(node) && !typed && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [asked] = node.arguments;
    return asked && ts.isStringLiteralLike(asked) ? asked.text : null;
  }
  return null;
}

/** A string's text, and whether something is joined on after it (a template's hole, a `+`), where the node is a string. */
function stringOf(node: ts.Node): { text: string; joined: boolean } | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { text: node.text, joined: ts.isBinaryExpression(node.parent) && node.parent.left === node };
  }
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) return { text: node.text, joined: true };
  if (ts.isTemplateTail(node)) return { text: node.text, joined: false };
  return null;
}

/** Read one module's source: its imports, every word of its strings, and each piece a name is built on. */
export function readModule(source: string, tsx: boolean): ModuleRead {
  const file = ts.createSourceFile(
    tsx ? "module.tsx" : "module.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  const words = new Set<string>();
  const stems = new Set<string>();
  const visit = (node: ts.Node): void => {
    const loaded = loadedBy(node);
    if (loaded !== null) imports.push(loaded);
    const held = stringOf(node);
    if (held) {
      for (const word of held.text.split(/[^\w-]+/)) if (word) words.add(word);
      const stem = /([a-zA-Z][\w-]*-)$/.exec(held.text)?.[1];
      if (stem && held.joined) stems.add(stem);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { imports, words: [...words], stems: [...stems] };
}

/** What a set of modules writes: every word of their strings, and the pieces their names are built on. */
export interface Written {
  words: Set<string>;
  stems: Set<string>;
}

/** What the modules write, together. */
export function writtenBy(modules: Iterable<ModuleRead>): Written {
  const written: Written = { words: new Set(), stems: new Set() };
  for (const read of modules) {
    for (const word of read.words) written.words.add(word);
    for (const stem of read.stems) written.stems.add(stem);
  }
  return written;
}

/** Whether a class is one the modules write: whole, or on a piece they build names from. */
function writes(written: Written, name: string): boolean {
  if (written.words.has(name)) return true;
  for (const stem of written.stems) if (name.startsWith(stem)) return true;
  return false;
}

/** The classes one selector needs on the page to match anything: those outside every functional pseudo-class. */
export function neededClasses(selector: Selector): string[] {
  const needed = new Set<string>();
  for (const part of selector) if (part.type === "class") needed.add(part.name);
  return [...needed];
}

/** A rule as the split reads it: what each of its selectors needs, and its weight (one, and one a declaration). */
export interface SheetRule {
  needs: string[][];
  weight: number;
}

/** Which of a stylesheet's rules the modules can draw: one of its selectors needs nothing they do not write. */
export function pageReachOf(rules: readonly SheetRule[], written: Written): boolean[] {
  return rules.map((rule) => rule.needs.some((needs) => needs.every((name) => writes(written, name))));
}

/** A page that reaches this share or more of what lies past the frame's part takes the whole stylesheet. */
const WHOLE_FROM = 0.25;

/** The nested files of one stylesheet, and which of them each page links (-1: none, no rule of it is the page's). */
interface SheetLevels {
  levels: boolean[][];
  of: Record<string, number>;
}

const weightOf = (rules: readonly SheetRule[], kept: readonly boolean[]) =>
  rules.reduce((sum, rule, at) => sum + (kept[at] ? rule.weight : 0), 0);
const foldsInto = (inner: readonly boolean[], outer: readonly boolean[]) => inner.every((kept, at) => !kept || outer[at]);
const beyond = (reach: readonly boolean[], frame: readonly boolean[]) => reach.map((kept, at) => kept && !frame[at]);

/**
 * A stylesheet's nested files, from what the frame and each page reach of it: the frame's part; that and what the
 * pages reaching a little of the rest add; and every rule a page reaches. A page links the first that holds all it
 * reaches, so a page of the stylesheet's own takes it whole and a page that draws one part of another's does not.
 */
export function levelsOf(
  rules: readonly SheetRule[],
  frame: readonly boolean[],
  pages: Readonly<Record<string, readonly boolean[]>>,
): SheetLevels {
  const reaches = Object.values(pages);
  const live = rules.map((_, at) => reaches.some((reach) => reach[at]));
  const past = weightOf(rules, beyond(live, frame));
  const light = reaches.filter((reach) => weightOf(rules, beyond(reach, frame)) < WHOLE_FROM * past);
  const base = rules.map((_, at) => Boolean(frame[at]) && Boolean(live[at]));
  const middle = rules.map((_, at) => Boolean(base[at]) || light.some((reach) => reach[at]));
  const levels = [base, middle, live];
  const of: Record<string, number> = {};
  for (const [page, reach] of Object.entries(pages)) {
    of[page] = reach.some(Boolean) ? levels.findIndex((level) => foldsInto(reach, level)) : -1;
  }
  return { levels, of };
}

/** What the app reads of the build's answer: each file's place in the cascade and address, and each page's files. */
export interface SheetManifest {
  /** Every file in the cascade's order: `[slot, href]`. A slot is the file's precedence, as React orders stylesheets. */
  files: [string, string][];
  /** A page's files, as places in `files`, in order. */
  pages: Record<string, number[]>;
  /** A stylesheet a part of a page links for itself (the map's): its place in `files`, by name. */
  apart: Record<string, number>;
}

/**
 * The page key of an entry under app/(os), by its folders: the workspace's, a group's and a segment in brackets left
 * out (`w/[workspace]/people/[[...param]]/page.tsx` is `people`). The workspace's own catch-all is `route`, the home `home`.
 */
export function pageKeyOf(entry: string): string {
  const folders = entry.replace(/\\/g, "/").split("/").slice(0, -1);
  const named = folders.filter((folder) => folder && folder !== "w" && !/^[[(]/.test(folder));
  if (named.length > 0) return named.join("/");
  return folders.includes("[workspace]") ? "route" : "home";
}
