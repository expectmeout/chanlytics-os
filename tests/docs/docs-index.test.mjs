/**
 * docs/README.md says which pages describe the code as it is and which are the record of how it got here (decision 0104).
 * `docs/` is mostly past plans and specs, and nothing told a reader so: a plan reads as current until you check it against
 * the code. Every page and folder at the root of `docs/` is on the index, and every link on the index opens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../_source.mjs";

const INDEX = "docs/README.md";
const tracked = execFileSync("git", ["ls-files", "docs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n")
  .filter(Boolean);
const entries = [...new Set(tracked.map((f) => f.split("/")[1]))].filter((name) => name !== "README.md");
const text = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
const named = new Set([...links.map((l) => l.split("/")[0]), ...[...text.matchAll(/`([a-z-]+)\/`/g)].map((m) => m[1])]);

test("the measure sees the docs", () => {
  assert.ok(entries.includes("architecture.md") && entries.includes("decisions"), entries.join(" "));
});

test("every page and folder at the root of docs/ is on the index", () => {
  assert.deepEqual(
    entries.filter((name) => !named.has(name)),
    [],
    `say in ${INDEX} what each is, and whether it is living or history`,
  );
});

test("every link on the index opens", () => {
  assert.deepEqual(
    links.filter((l) => !fs.existsSync(path.join(ROOT, "docs", l))),
    [],
  );
});
