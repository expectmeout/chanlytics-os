/**
 * The product is for any trade. The words of one — a salon's — must not sit
 * in the code a customer reads: not in a placeholder, a command, a prompt, a
 * template example or a hint. This scans the sources that reach users and
 * fails on the first salon word, the way the no-fabricated-data spec fails on
 * a mockup name.
 *
 * Comments are skipped (they are not copy), member accesses are skipped
 * (`c.therapist` is a seed field, not a word), and a line may carry
 * `trade-word:` in a comment to say why it must keep one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const SCOPE = [
  "packages/contracts/src",
  "packages/channels/src",
  "packages/jobs/src",
  "apps/dashboard/src/server",
  "apps/dashboard/src/legacy-bridge",
  "apps/dashboard/src/legacy/pages",
  "apps/dashboard/src/legacy/demo/pages",
  "apps/dashboard/src/legacy/components",
  "apps/edge/lib",
  "apps/edge/api",
];
/** Files that may keep a trade's words, and why. */
const ALLOWED = new Map([
  [
    "apps/dashboard/src/legacy/demo/pages/calendar.jsx",
    "the seeded calendar of the design mockup; a real workspace renders pages/calendar.jsx",
  ],
  [
    "apps/dashboard/src/legacy/demo/pages/broadcasts.jsx",
    "the seeded Broadcasts of the mockup; a real workspace renders pages/broadcasts.jsx",
  ],
  [
    "apps/dashboard/src/legacy/demo/pages/segments.jsx",
    "the seeded Segments of the mockup; a real workspace's lists are a view of People (people.jsx)",
  ],
  [
    "apps/dashboard/src/legacy/demo/pages/content-cal.jsx",
    "the seeded content calendar; a real workspace sees the in-design card",
  ],
  [
    "apps/dashboard/src/legacy/demo/pages/agent-studio.jsx",
    "the seeded Studio; a real workspace sees the in-design card",
  ],
]);
const BANNED = /\b(salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(?:es)?)\b/i;
const EXT = new Set([".ts", ".tsx", ".jsx", ".js"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") yield* walk(p);
    } else if ([...EXT].some((e) => name.endsWith(e)) && !name.endsWith(".d.ts") && !name.includes(".test.")) yield p;
  }
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

test("no salon words reach a customer of another trade", () => {
  const hits = [];
  for (const dir of SCOPE) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split(sep).join("/");
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      for (const { n, text } of readerLines(src)) {
        const m = BANNED.exec(text);
        if (m) hits.push(`${rel}:${n}: “${m[0]}” — ${text.trim().slice(0, 110)}`);
      }
    }
  }
  assert.deepEqual(hits, [], `salon words in code a customer reads:\n${hits.join("\n")}`);
});

test("the scanner reads what a reader reads", () => {
  const lines = readerLines(
    `// a stylist in a comment\nconst a = c.therapist; /* salon */ const b = "salon"; // trade-word: kept on purpose\nconst c = "haircut";\n/* stylist\n balayage */\nconst d = 1;`,
  );
  assert.deepEqual(
    lines.map((l) => l.text.trim()),
    ['const c = "haircut";', "const d = 1;"],
    "a comment is not copy, an exempted line is skipped whole, a member access is not a word",
  );
});
