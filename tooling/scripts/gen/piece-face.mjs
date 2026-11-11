#!/usr/bin/env node
/**
 * packages/contracts/src/content/piece-face.generated.ts: how wide each character of a made video's words is, read from the font
 * file the words are drawn in (the posts' own Mona Sans at its heaviest, apps/dashboard/src/server/posts/fonts).
 *
 * A video's opening words never wrap: a line is fitted to the frame before anything is drawn, by the plan's checker, which is
 * pure and holds no font. So the widths are written out here once, and the checker, the storyboard Ask looks at and the template
 * all take the size that comes of them. The characters are the ones a post's words may hold (post-check.ts DRAWABLE).
 *
 *   node tooling/scripts/gen/piece-face.mjs            # write it
 *   node tooling/scripts/gen/piece-face.mjs --check    # exit 1 when it is stale
 *
 * tests/content/a-video-is-planned.test.mjs holds the file to this. The font is parsed by the parser satori draws with, reached
 * through satori, so what is measured here is what the storyboard draws.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT = "packages/contracts/src/content/piece-face.generated.ts";
export const FACE_FILE = "apps/dashboard/src/server/posts/fonts/mona-sans-800.woff";

/** What the words may hold: Western Latin, its punctuation, and the few marks beyond it a post's words may. */
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0xff],
];
const MARKS = [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac, 0x2122];

function fontParser() {
  const dashboard = createRequire(path.join(ROOT, "apps/dashboard/package.json"));
  return createRequire(dashboard.resolve("satori"))("@shuding/opentype.js");
}

/** Each character's advance, in thousandths of the type's size. */
export function faceAdvances() {
  const bytes = fs.readFileSync(path.join(ROOT, FACE_FILE));
  const font = fontParser().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const points = [
    ...RANGES.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i)),
    ...MARKS,
  ];
  return Object.fromEntries(
    points.map((point) => {
      const ch = String.fromCodePoint(point);
      return [ch, Math.round((font.charToGlyph(ch).advanceWidth * 1000) / font.unitsPerEm)];
    }),
  );
}

/** The module, as the font says it. */
export function faceModule(advances = faceAdvances()) {
  const rows = Object.entries(advances).map(([ch, width]) => `  ${JSON.stringify(ch)}: ${width},`);
  return [
    "// Written by `node tooling/scripts/gen/piece-face.mjs` from the posts' own font file. Do not edit by hand.",
    "",
    "/** A made video's words are set in Mona Sans at its heaviest: each character's advance, in thousandths of the type's size. */",
    "export const PIECE_FACE_ADVANCES: Readonly<Record<string, number>> = {",
    ...rows,
    "};",
    "",
    "/** A character the table does not hold is taken at the widest it holds, so a line can only come out smaller. */",
    `export const PIECE_FACE_WIDEST = ${Math.max(...Object.values(advances))};`,
    "",
  ].join("\n");
}

function main() {
  const file = path.join(ROOT, OUT);
  const next = faceModule();
  if (process.argv.includes("--check")) {
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\r\n").join("\n") : "";
    if (now !== next) {
      console.error(`${OUT} is stale: node tooling/scripts/gen/piece-face.mjs`);
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(file, next);
  console.log(`wrote ${OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
