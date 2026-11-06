/**
 * Every workspace says what it is (decision 0104). One in nine did, so a newcomer met `packages/contracts` or `apps/edge`
 * with nothing to read but its code. A README here opens with a heading and says what the workspace is under it; what it
 * says beyond that is its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../_source.mjs";

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n")
  .filter(Boolean);
const IS_WORKSPACE = /^(apps\/[^/]+|packages\/[^/]+|tooling\/[^/]+|tests)\/package\.json$/;
const workspaces = tracked.filter((f) => IS_WORKSPACE.test(f)).map((f) => path.posix.dirname(f));

/** What a README says first: its heading, and the line that follows it, or null when it opens with neither. */
function opening(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const body = lines.slice(1).find((line) => line.trim());
  return /^# \S/.test(lines[0] ?? "") && body ? { heading: lines[0], body } : null;
}

test("the measure sees the workspaces", () => {
  for (const w of ["apps/dashboard", "apps/edge", "packages/contracts", "packages/core", "tooling/scripts", "tests"])
    assert.ok(workspaces.includes(w), `${w} is read`);
});

test("every workspace has a README that opens with what it is", () => {
  const silent = workspaces.filter((w) => {
    const file = path.join(ROOT, w, "README.md");
    return !fs.existsSync(file) || !opening(fs.readFileSync(file, "utf8"));
  });
  assert.deepEqual(silent, [], "write what the workspace is, what is where and what it may import in its README.md");
});

test("a README with no heading, or nothing under it, does not count", () => {
  assert.equal(opening("Some words\n"), null);
  assert.equal(opening("# A name\n\n"), null);
  assert.ok(opening("# A name\n\nWhat it is.\n"));
});
