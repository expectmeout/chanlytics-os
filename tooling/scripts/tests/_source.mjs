/**
 * Reading source as source, for the tests that assert on code.
 *
 * Some invariants have no runtime seam to test through — an edge handler that
 * must ALWAYS supply a field, a middleware that must never call a particular
 * function. Those are pinned by scanning the file. Two things make that honest
 * rather than brittle, and both live here so there is one copy of each:
 *
 *  - comments are removed, because an assertion of the form "this must not
 *    appear" is otherwise tripped by the comment explaining why it must not,
 *    and the only way to go green is to delete the explanation;
 *  - string literals are kept intact, because user-facing copy IS the thing
 *    under test often enough that stripping it would hide real regressions.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Strip comments, keeping string literals (and their escapes) verbatim. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          out += src[i];
          i++;
        }
        if (i < src.length) {
          out += src[i];
          i++;
        }
      }
      out += src[i] ?? "";
      i++;
    } else if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Read normalised to LF — these files are CRLF and patterns must not care. */
export const readRaw = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

/**
 * Read as executable code: comments removed, string literals preserved. Several paths are read as one text, for a
 * door and the module that holds what it does (a route under app/api and its verb under src/server).
 */
export const readCode = (...paths) => paths.map((p) => stripComments(readRaw(p))).join("\n");

/** Import a source module by repo-relative path (tsx loads .ts): for a rule tested by running it. */
export const importSrc = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

/**
 * The trees whose words reach a person: a page, a prompt, a message, a refusal. The trade-neutral scan reads them
 * (repo/trade-neutral.test.mjs), and so does the appointment words' ratchet (journey/journey.test.mjs).
 */
export const READER_SCOPE = [
  "packages/contracts/src",
  "packages/channels/src",
  "packages/jobs/src",
  "apps/dashboard/src/server",
  "apps/dashboard/src/legacy-bridge",
  // A surface that has left the shell (decision 0015) is TSX here, and the words a page draws are scanned where its JSX
  // was: the sample a demo session draws (sample.ts) is scanned with them. The Inbox's own sample, which still says a salon's
  // words as its mockup's twin did, is not yet (its surface's lane).
  "apps/dashboard/src/surfaces/campaigns",
  "apps/dashboard/src/surfaces/live",
  "apps/dashboard/src/legacy/pages",
  "apps/dashboard/src/legacy/demo/pages",
  "apps/dashboard/src/legacy/components",
  "apps/edge/lib",
  "apps/edge/api",
];

const READER_EXT = [".ts", ".tsx", ".jsx", ".js"];

function* readerWalk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") yield* readerWalk(p);
    } else if (READER_EXT.some((e) => name.endsWith(e)) && !name.endsWith(".d.ts") && !name.includes(".test.")) yield p;
  }
}

/** Every source file in the reader scope, by its absolute path: no tests, no declarations, nothing built or installed. */
export function* readerFiles() {
  for (const dir of READER_SCOPE) yield* readerWalk(path.join(ROOT, dir));
}

/** Lines that reach a reader: no comments, no member accesses, no `trade-word:` exemptions. */
export function readerLines(src) {
  const out = [];
  let inBlock = false;
  src.split(/\r?\n/).forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // Block comments that open on this line: drop what they cover.
    for (;;) {
      const start = line.indexOf("/*");
      if (start === -1) break;
      const end = line.indexOf("*/", start + 2);
      if (end === -1) {
        line = line.slice(0, start);
        inBlock = true;
        break;
      }
      line = line.slice(0, start) + line.slice(end + 2);
    }
    if (/trade-word:/.test(raw)) return;
    line = line.replace(/(^|\s)\/\/.*$/, "$1");
    line = line.replace(/\.\w+/g, "");
    if (line.trim()) out.push({ n: i + 1, text: line });
  });
  return out;
}
