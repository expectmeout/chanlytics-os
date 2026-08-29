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
import { fileURLToPath } from "node:url";

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
        if (src[i] === "\\") { out += src[i]; i++; }
        if (i < src.length) { out += src[i]; i++; }
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

/** Read as executable code: comments removed, string literals preserved. */
export const readCode = (p) => stripComments(readRaw(p));
