/**
 * Nothing that runs is called legacy (decision 0105). The live data layer of every page was `legacy-bridge`, the design tokens
 * sat in `legacy/styles`, and 420 files imported `legacy-verbs`: a reader was told to ignore the code that matters most.
 *
 * A name in that word is allowed only for a format the code still reads on purpose, and each says which. Sentences are not
 * held: an old format, or a file that used to exist, is a fair thing to write about.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";
import { ROOT } from "../../_source.mjs";
import { wordsOf } from "./_names.mjs";

/** History names the paths of its day. */
const HISTORY = /^(docs\/(decisions|plans|superpowers|specs|scorecard|mockup|store|images)\/|supabase\/migrations\/)/;

/** The names that mean it: an older format of data the code still reads. */
const OLDER_FORMATS = new Map([
  ["legacyDigest", "an erased person's digest from before the keyed one"],
  ["legacyErasedPhoneHash", "the same, for a phone"],
  ["legacyErasedEmailHash", "the same, for an email"],
  ["legacyLeadSuppressionHash", "a lead's suppression digest from before the keyed one"],
  ["legacyAddress", "the shell's old hash addresses, which land on the word for ever"],
  ["legacyReply", "a model's plain-text answer, from before its structured one"],
  ["planHoldsLegacy", "a plan name from before decision 0037"],
]);

const declaredNames = (sf) => {
  const out = new Set();
  const walk = (node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isParameter(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    )
      out.add(node.name.text);
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
};

test("no tracked path says legacy", () => {
  const paths = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter((f) => f && !HISTORY.test(f) && /legacy/i.test(f));
  assert.deepEqual(paths, [], "name it for what it is: the frame, the bridge, the mockup");
});

test("no name that runs says legacy, but the older formats listed here", () => {
  const offenders = new Set();
  for (const f of repoFiles(["apps", "packages"], { keep: /\.tsx?$/ }))
    for (const name of declaredNames(parse(f)))
      if (wordsOf(name).includes("legacy") && !OLDER_FORMATS.has(name)) offenders.add(`${f}: ${name}`);
  assert.deepEqual([...offenders].sort(), [], "name it for what it is, or list the format it reads in OLDER_FORMATS");
});
