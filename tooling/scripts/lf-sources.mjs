/**
 * A package's sources are LF before it builds. tsup's declaration bundler places a doc comment by character offset,
 * so a working copy checked out with CRLF (core.autocrlf on Windows, any checkout older than .gitattributes' eol=lf)
 * built a dist that CI's Linux build did not: stable, wrong, and failing the dist-drift guard on a file nobody edited.
 * Run from a package's folder as the first half of its build script. Rewrites ./src in place, byte for byte except
 * the carriage returns; git sees no change, since the index holds LF.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CR = 0x0d;
const LF = 0x0a;

/** The bytes without the carriage return of each CRLF, or null when there is none (or the file is binary). */
function withoutCarriageReturns(bytes) {
  if (bytes.includes(0)) return null;
  const kept = Buffer.allocUnsafe(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === CR && bytes[i + 1] === LF) continue;
    kept[n++] = bytes[i];
  }
  return n === bytes.length ? null : kept.subarray(0, n);
}

let rewritten = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) {
      const lf = withoutCarriageReturns(readFileSync(path));
      if (lf) {
        writeFileSync(path, lf);
        rewritten++;
      }
    }
  }
};
walk("src");
if (rewritten)
  console.log(`lf-sources: ${rewritten} file(s) under src had CRLF line endings; rewritten as LF before the build`);
