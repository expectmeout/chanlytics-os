/**
 * The frame's stylesheets, written as the files a page links (page-sheets.ts says which rules are whose and why).
 *
 * Run as the build's configuration is read (next.config.ts), so a build has them however it was started: the files go
 * under public/sheets, each minified as Next's own build minifies a stylesheet (Lightning CSS, Next's browsers and its
 * older spelling of a media query's range: byte for byte what the one bundle held, 24 Nov 2026) and named by what it
 * holds, so a deploy that changes no rule of a file leaves it in every browser's cache. What comes back is the list the
 * app reads (`NEXT_PUBLIC_SHEETS`): the files in the cascade's order, each page's, and each stylesheet's ladder of
 * nested files, of which a tab keeps one (sheet-ladders.ts).
 *
 * `whole` is the development server's: every page links every stylesheet whole, under names that never change, so an
 * edit shows on the next load and nothing is worked out from code that is being written.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Features, transform } from "lightningcss";
import {
  levelsOf,
  neededClasses,
  pageKeyOf,
  pageReachOf,
  readModule,
  writtenBy,
  type ModuleRead,
  type SheetManifest,
  type SheetRule,
  type Written,
} from "./page-sheets";

/** Where a page's stylesheets are served from: the folder of that name under the app's public one (next.config.ts). */
const SERVED_AT = "/sheets";
/** The stylesheets, in the cascade's order (sheets.json): a path from src/, or one a part of a page links for itself. */
const SHEET_LIST = "src/styles/sheets.json";

/** The browsers Next compiles a stylesheet for (next/dist/shared/lib/modern-browserslist-target), as Lightning CSS counts a version. */
const BROWSERS = { chrome: 111 << 16, edge: 111 << 16, firefox: 111 << 16, safari: (16 << 16) | (4 << 8) };

/** One stylesheet of the order: its name, its source, and whether a part of a page links it for itself. */
interface Sheet {
  name: string;
  file: string;
  apart: boolean;
}

/** A page of the frame: its key, and the modules it starts from (its own entry and each layout over it). */
interface PageEntry {
  key: string;
  starts: string[];
}

/** Minify a stylesheet as the build does, keeping the rules `kept` says (all of them, where it says nothing). */
function minified(file: string, code: Buffer, kept: readonly boolean[] | null): string {
  let at = 0;
  // A rule left as it is answers nothing (handing the rule back makes the minifier read its own answer again, which it
  // cannot for every rule); one taken out answers no rules.
  const drop = () => (kept?.[at++] ? undefined : []);
  const out = transform({
    filename: file,
    code,
    minify: true,
    targets: BROWSERS,
    include: Features.MediaRangeSyntax,
    visitor: kept ? { Rule: { style: drop } } : undefined,
  });
  return out.code.toString();
}

/** A stylesheet's rules in the order the minifier meets them: what each selector needs, and the rule's weight. */
function sheetRulesOf(file: string, code: Buffer): SheetRule[] {
  const rules: SheetRule[] = [];
  transform({
    filename: file,
    code,
    visitor: {
      Rule: {
        style(rule) {
          const declared = rule.value.declarations;
          rules.push({
            needs: rule.value.selectors.map(neededClasses),
            weight: 1 + (declared?.declarations?.length ?? 0) + (declared?.importantDeclarations?.length ?? 0),
          });
        },
      },
    },
  });
  return rules;
}

/** The order's stylesheets (sheets.json), each with where its source is. */
function sheetsOf(app: string): Sheet[] {
  const listed: unknown = JSON.parse(fs.readFileSync(path.join(app, SHEET_LIST), "utf8"));
  const rows = typeof listed === "object" && listed !== null && "sheets" in listed ? listed.sheets : null;
  if (!Array.isArray(rows)) throw new Error(`${SHEET_LIST} lists no stylesheets`);
  const packages = createRequire(path.join(app, "package.json"));
  return rows.map((row: unknown): Sheet => {
    if (typeof row === "string") return { name: path.basename(row, ".css"), file: path.join(app, "src", row), apart: false };
    if (typeof row === "object" && row !== null && "apart" in row && "from" in row) {
      return { name: String(row.apart), file: packages.resolve(String(row.from)), apart: true };
    }
    throw new Error(`${SHEET_LIST} holds a row that names no stylesheet`);
  });
}

/** Every file under a folder that `keep` takes, by its whole path. */
function filesUnder(folder: string, keep: (name: string) => boolean): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const whole = path.join(folder, entry.name);
    if (entry.isDirectory()) return filesUnder(whole, keep);
    return keep(entry.name) ? [whole] : [];
  });
}

/** The frame's pages: each `page.tsx` under app/(os), started from with every `layout.tsx` between it and app/. */
function pageEntries(app: string): PageEntry[] {
  const top = path.join(app, "app");
  const os = path.join(top, "(os)");
  return filesUnder(os, (name) => name === "page.tsx").map((page) => {
    const starts = [page];
    for (let folder = path.dirname(page); folder.startsWith(top); folder = path.dirname(folder)) {
      const layout = path.join(folder, "layout.tsx");
      if (fs.existsSync(layout)) starts.push(layout);
    }
    return { key: pageKeyOf(path.relative(os, page)), starts };
  });
}

/** The modules of the app, read once each, and what a set of entries reaches by its imports. */
function moduleGraph(app: string) {
  const read = new Map<string, ModuleRead>();
  const shell = path.join(app, "src/bridge/FrameApp.tsx");
  const moduleAt = (file: string): string | null =>
    ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((end) => file + end)
      .find((candidate) => /\.tsx?$/.test(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
  /** A specifier as a file of the app: its own alias, a path beside the module, or the frame's shell (package.json "imports"). */
  const resolved = (from: string, specifier: string): string | null => {
    if (specifier === "#frame-shell") return shell;
    if (specifier.startsWith("@/")) return moduleAt(path.join(app, "src", specifier.slice(2)));
    if (specifier.startsWith(".")) return moduleAt(path.resolve(path.dirname(from), specifier));
    return null;
  };
  /** Each stylesheet a module reached imports itself, with a module that does. */
  const stylesheets = new Map<string, string>();
  const stylesheetAt = (from: string, specifier: string): string | null => {
    if (specifier.startsWith("@/")) return path.join(app, "src", specifier.slice(2));
    return specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : null;
  };
  const readAt = (file: string): ModuleRead => {
    const had = read.get(file);
    if (had) return had;
    const fresh = readModule(fs.readFileSync(file, "utf8"), file.endsWith("x"));
    read.set(file, fresh);
    return fresh;
  };
  const reached = (starts: readonly string[]): ModuleRead[] => {
    const seen = new Set<string>();
    const todo = [...starts];
    for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of readAt(file).imports) {
        const stylesheet = specifier.endsWith(".css") ? stylesheetAt(file, specifier) : null;
        if (stylesheet) stylesheets.set(stylesheet, file);
        const next = resolved(file, specifier);
        if (next && !seen.has(next)) todo.push(next);
      }
    }
    return [...seen].map(readAt);
  };
  return { readAt, reached, stylesheets };
}

/** What each page's code writes, and the frame's: the contracts' words with what each one's entries reach. */
function writtenByPage(
  app: string,
  pages: readonly PageEntry[],
): { frame: Written; pages: Record<string, Written>; imported: ReadonlyMap<string, string> } {
  const graph = moduleGraph(app);
  const contracts = filesUnder(path.join(app, "../../packages/contracts/src"), (name) => /\.ts$/.test(name) && !/\.(test|type-test)\./.test(name));
  const shared = contracts.map(graph.readAt);
  const frame = ["app/layout.tsx", "app/(os)/layout.tsx", "app/(os)/w/[workspace]/layout.tsx"].map((file) => path.join(app, file));
  const each: Record<string, Written> = {};
  for (const page of pages) each[page.key] = writtenBy([...shared, ...graph.reached(page.starts)]);
  return { frame: writtenBy([...shared, ...graph.reached(frame)]), pages: each, imported: graph.stylesheets };
}

/**
 * Refuse a stylesheet the frame lists that a page's module imports as well. Next ships an import in a chunk of its own,
 * beside the frame's file that holds the same rules, so a tab on that page held them twice, and the later copy decided
 * the cascade (the Content page's post.css, 25 Nov 2026). A page links the listed stylesheets its code can draw.
 */
function refuseImported(sheets: readonly Sheet[], imported: ReadonlyMap<string, string>, app: string): void {
  const twice = sheets.flatMap((sheet) => {
    const by = imported.get(sheet.file);
    return by ? [`${path.relative(app, by)} imports ${path.relative(app, sheet.file)}`] : [];
  });
  if (twice.length > 0) throw new Error(`a stylesheet ${SHEET_LIST} lists is the frame's to link, and no module's to import: ${twice.join("; ")}`);
}

/** One stylesheet as it is served: its files from the narrowest to the whole, and which each page links (-1: none). */
interface Cut {
  name: string;
  files: string[];
  of: Record<string, number>;
}

/** A narrower file is worth its own request where it saves a page this share of the wider one, and this many bytes. */
const SAVES_SHARE = 0.25;
const SAVES_BYTES = 4096;

/**
 * A stylesheet cut by what pages draw: its nested files (page-sheets.ts levelsOf), less any that saves too little
 * over the next wider one to be a file of its own. A page that would have linked one of those links the wider. Two
 * files a few rules apart would be fetched once each by a tab that visits both pages, for the same bytes twice.
 */
function cutSheet(sheet: Sheet, written: ReturnType<typeof writtenByPage>): Cut {
  const code = fs.readFileSync(sheet.file);
  const rules = sheetRulesOf(sheet.file, code);
  const reach: Record<string, boolean[]> = {};
  for (const [page, words] of Object.entries(written.pages)) reach[page] = pageReachOf(rules, words);
  const { levels, of } = levelsOf(rules, pageReachOf(rules, written.frame), reach);
  const [base = "", middle = "", live = ""] = levels.map((level) => (level.some(Boolean) ? minified(sheet.file, code, level) : ""));
  const saves = (narrow: string, wide: string) =>
    narrow.length > 0 && wide.length - narrow.length >= Math.max(SAVES_SHARE * wide.length, SAVES_BYTES);
  const keepsMiddle = saves(middle, live);
  const keepsBase = saves(base, keepsMiddle ? middle : live);
  const files = [keepsBase ? base : "", keepsMiddle ? middle : "", live].filter(Boolean);
  // Where each of the three lands among the files kept: its own place, or the next wider one's.
  const top = files.length - 1;
  const middleAt = keepsMiddle ? top - 1 : top;
  const places = [keepsBase ? 0 : middleAt, middleAt, top];
  const linked: Record<string, number> = {};
  for (const [page, depth] of Object.entries(of)) linked[page] = live ? (places[depth] ?? -1) : -1;
  return { name: sheet.name, files, of: linked };
}

/** A stylesheet whole, for every page: the development server's, and a build's for one a part of a page links itself. */
function wholeSheet(sheet: Sheet, pages: readonly PageEntry[]): Cut {
  const css = minified(sheet.file, fs.readFileSync(sheet.file), null);
  return { name: sheet.name, files: [css], of: Object.fromEntries(pages.map((page) => [page.key, sheet.apart ? -1 : 0])) };
}

/** Two neighbours join where it costs no page more than this. */
const JOIN_COSTS = 3072;

/** Whether two neighbours that are one file each may be one file: no page is handed more than a little it did not link. */
function joins(before: Cut, cut: Cut): boolean {
  if (before.files.length !== 1 || cut.files.length !== 1) return false;
  const [first = "", second = ""] = [before.files[0], cut.files[0]];
  return Object.keys({ ...before.of, ...cut.of }).every((page) => {
    const [has, takes] = [(before.of[page] ?? -1) >= 0, (cut.of[page] ?? -1) >= 0];
    if (has === takes) return true;
    return (has ? second.length : first.length) <= JOIN_COSTS;
  });
}

/**
 * The stylesheets as the fewest files that read the same. Two neighbours that are one file each become one where no
 * page is handed more than a little it did not link: nothing stands between them in the cascade.
 *
 * A file never holds a part of another stylesheet's ladder. Until 25 November 2026 a narrowest file of a few rules rode
 * at the end of every file of the stylesheet before it, a request fewer, but its rules are in its own wider file too
 * (they sit among that file's rules in the source), so a tab that held both held them twice, and nothing could take
 * one copy out without reordering the cascade. It is the narrowest rung of its own ladder now.
 */
function joinedCuts(cuts: readonly Cut[], apart: ReadonlySet<string>): Cut[] {
  const out: Cut[] = [];
  for (const each of cuts) {
    const cut = { ...each, files: [...each.files], of: { ...each.of } };
    // One a part of a page links for itself is no page's, and nothing of a page's is written against its classes: the
    // stylesheet before it is the neighbour of the one after it.
    const before = out.findLast((earlier) => !apart.has(earlier.name));
    if (!before || apart.has(cut.name)) {
      out.push(cut);
      continue;
    }
    if (joins(before, cut)) {
      before.files = [`${before.files[0] ?? ""}
${cut.files[0] ?? ""}`];
      for (const [page, place] of Object.entries(cut.of)) before.of[page] = Math.max(before.of[page] ?? -1, place);
    } else out.push(cut);
  }
  return out;
}

/** Write the files a build serves into their folder, and take away the ones an earlier build left there. */
function keepSheetFiles(folder: string, served: ReadonlyMap<string, string>): void {
  fs.mkdirSync(folder, { recursive: true });
  for (const old of fs.readdirSync(folder)) if (!served.has(old)) fs.rmSync(path.join(folder, old), { force: true });
  for (const [name, css] of served) {
    const whole = path.join(folder, name);
    if (!fs.existsSync(whole) || fs.readFileSync(whole, "utf8") !== css) fs.writeFileSync(whole, css);
  }
}

/**
 * Write the pages' stylesheets into `folder` (the app's public/sheets) and answer the list the app reads. `split` works
 * out each page's from its code; `whole` (the development server) gives every page every stylesheet, under its own name.
 */
export function writePageSheets(app: string, mode: "split" | "whole", folder: string): SheetManifest {
  const pages = pageEntries(app);
  const sheets = sheetsOf(app);
  const apart = new Set(sheets.filter((sheet) => sheet.apart).map((sheet) => sheet.name));
  const written = mode === "split" ? writtenByPage(app, pages) : null;
  if (written) refuseImported(sheets, written.imported, app);
  const cuts = sheets.map((sheet) => (written && !sheet.apart ? cutSheet(sheet, written) : wholeSheet(sheet, pages)));
  const manifest: SheetManifest = {
    files: [],
    pages: Object.fromEntries(pages.map((page) => [page.key, []])),
    apart: {},
    ladders: [],
  };
  const served = new Map<string, string>();
  for (const cut of written ? joinedCuts(cuts, apart) : cuts) {
    const ladder = cut.files.map((css, rank) => {
      const called = rank === cut.files.length - 1 ? cut.name : `${cut.name}-${rank + 1}`;
      const name = written ? `${called}.${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css` : `${called}.css`;
      served.set(name, css);
      const place = manifest.files.push([`s${String(manifest.files.length).padStart(2, "0")}`, `${SERVED_AT}/${name}`]) - 1;
      if (apart.has(cut.name)) manifest.apart[cut.name] = place;
      for (const [page, linked] of Object.entries(cut.of)) if (linked === rank) manifest.pages[page]?.push(place);
      return place;
    });
    if (ladder.length > 1) manifest.ladders.push(ladder);
  }
  keepSheetFiles(folder, served);
  return manifest;
}

/** How long after a stylesheet's last change the development server waits before writing the files again. */
const SETTLES_MS = 120;

/**
 * The development server's: a stylesheet saved is written again, so the next load of a page shows it. The files keep
 * their names there, so nothing else has to change. Every stylesheet is written, whichever changed: thirty take a moment.
 */
export function watchPageSheets(app: string, folder: string): void {
  let pending: NodeJS.Timeout | null = null;
  const again = () => {
    pending = null;
    try {
      writePageSheets(app, "whole", folder);
    } catch {
      // A stylesheet caught half-saved does not parse: the next change writes them all again.
    }
  };
  fs.watch(path.join(app, "src"), { recursive: true }, (_event, changed) => {
    if (!changed || !/\.css$|sheets\.json$/.test(changed)) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(again, SETTLES_MS);
  }).unref();
}
