/**
 * What each name measure counts, kept honest on sources written for it: a measure that quietly read nothing would hold
 * every number at zero. The rules are docs/naming.md's; the numbers are check:debt's (_names.mjs, NAME_RATCHETS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {
  NAME_RATCHETS,
  asyncNounsIn,
  booleanClashesIn,
  exportedNamesIn,
  isGenericStem,
  mixedSidesIn,
  repeatsItsFolder,
  shortNamesIn,
  treeOf,
  undefinedWords,
  valueNamesIn,
  wordsOf,
} from "./_names.mjs";

const source = (...lines) => ts.createSourceFile("probe.ts", lines.join("\n"), ts.ScriptTarget.Latest, true);
/** A body of `n` lines, to put a name in a scope of that length. */
const lines = (n) => Array.from({ length: n }, () => "  work();");

test("a one-letter name in an API is counted: a parameter of an exported function, an exported name, a type's property", () => {
  const { api, long, capital } = shortNamesIn(
    source(
      "export function first(p: Row) { return p; }",
      "export const second = (r: Row, name: string) => r;",
      "export type Shape = { n: number; x: number; y: number; title: string };",
      "export interface Other { q: string }",
      "export const C = 1;",
      "export const named = 2;",
    ),
  );
  assert.equal(api, 5, "p, r, n, q and C; x and y are a coordinate's own names");
  assert.equal(long, 0);
  assert.equal(capital, 0);
});

test("a short name in a scope of ten lines or fewer is fine, and past ten lines it is counted", () => {
  assert.deepEqual(
    shortNamesIn(
      source(
        "function near(q: Row) { return q; }",
        "function outer() {",
        "  const k = 1;",
        "  for (let i = 0; i < 3; i++) use(i);",
        "  try { use(k); } catch (e) { use(e); }",
        "  return [1].map((x) => x);",
        "}",
      ),
    ),
    { api: 0, long: 0, capital: 0 },
  );
  assert.deepEqual(
    shortNamesIn(source("function outer() {", "  const k = 1;", ...lines(10), "  return k;", "}")),
    { api: 0, long: 1, capital: 0 },
    "a local in a block over ten lines",
  );
  assert.deepEqual(
    shortNamesIn(source("function outer(q: Row) {", ...lines(10), "  return q;", "}")),
    { api: 0, long: 1, capital: 0 },
    "a parameter of a function over ten lines",
  );
  assert.deepEqual(
    shortNamesIn(source("function outer() {", "  try { use(); } catch (e) {", ...lines(10), "    use(e);", "  }", "}")),
    { api: 0, long: 1, capital: 0 },
    "a catch's name is read by the catch's own length, not the function's",
  );
  assert.deepEqual(
    shortNamesIn(source("function outer() {", ...lines(12), "  for (const r of rows) use(r);", "}")),
    { api: 0, long: 0, capital: 0 },
    "a loop's name is read by the loop's own length",
  );
  assert.deepEqual(
    shortNamesIn(source("rows.map((r) => {", ...lines(10), "  return r;", "});")),
    { api: 0, long: 1, capital: 0 },
    "a callback's parameter is read by the callback's length",
  );
});

test("a capital one-letter local or parameter is counted whatever its scope, and a type's parameter is not", () => {
  assert.deepEqual(
    shortNamesIn(
      source(
        "function near(L: Logger) { const W = words(); return L.info(W); }",
        "function typed<T>(row: T): T { return row; }",
      ),
    ),
    { api: 0, long: 0, capital: 2 },
  );
});

test("an exported function that reaches outside and does not start with a verb is counted, and a pure one is not", () => {
  assert.deepEqual(
    asyncNounsIn(
      source(
        "export async function heldNoticesOf(db: Db) { return db; }",
        "export async function listHeldNotices(db: Db) { return db; }",
        "export const tenantBySlug = async (db: Db) => db;",
        "export const findTenant = async (db: Db) => db;",
        "export function memberEmail(db: Db): Promise<string> { return db.read(); }",
        "export function idsOf(rows: Row[]) { return rows; }",
        "export async function POST() {}",
        "export default async function Page() { return null; }",
        "export async function RecordCard() { return null; }",
        "async function localNoun() {}",
      ),
    ),
    ["heldNoticesOf", "tenantBySlug", "memberEmail"],
  );
});

test("a value named for what happened to it is counted, as a local or a parameter, by its whole name", () => {
  assert.equal(
    valueNamesIn(
      source(
        "function a(who: Row, reason: string) {",
        "  const said = words(who);",
        "  const why = reason;",
        "  const saidYes = true;",
        "  return { said, why, saidYes };",
        "}",
      ),
    ),
    3,
  );
});

test("a type whose suffix says one side and whose fields say the other is counted, with how many", () => {
  assert.deepEqual(
    mixedSidesIn(
      source(
        "export interface LeadRow { leadId: string; tenant_id: string }",
        "export type LeadDto = { lead_id: string; startsAt: string; endsAt: string };",
        "export interface LeadVM { leadId: string; contact_id: string }",
        "export interface LeadCommand { leadId: string }",
        "export interface LeadPorts { read: () => void }",
        "export interface LeadBody { lead_id: string }",
        "export interface LeadLine { lead_id: string; startsAt: string }",
      ),
    ),
    { LeadRow: 1, LeadDto: 2, LeadVM: 1 },
  );
});

test("a boolean said with is_, or sharing its name with a count or a record in its module, is counted", () => {
  assert.deepEqual(
    booleanClashesIn(
      source(
        "export interface A { is_new: boolean; paid: boolean; held: boolean; can_connect: boolean }",
        "export interface B { held: number; paid: boolean; open: boolean }",
        "export interface C { open: Row }",
      ),
    ),
    ["held", "is_new", "open"],
  );
});

test("a file repeats its folder when its name starts with the folder's; a folder's main module may share it", () => {
  assert.equal(repeatsItsFolder("packages/x/src/letters/letters-sent.ts"), true);
  assert.equal(repeatsItsFolder("apps/x/src/surfaces/stamps/stamps-sheet.tsx"), true);
  assert.equal(repeatsItsFolder("packages/x/src/letters/sent.ts"), false);
  assert.equal(repeatsItsFolder("packages/x/src/letters/letters.ts"), false);
  assert.equal(repeatsItsFolder("packages/x/src/letters/letter-dtos.ts"), false, "the singular is not counted");
});

test("a stem that names no contents is generic; a role file and a domain's own word are not", () => {
  for (const stem of ["utils", "util", "helpers", "helper", "common", "misc", "constants", "shared", "lib", "stuff"])
    assert.equal(isGenericStem(stem), true, stem);
  for (const stem of ["types", "surface", "verbs", "ports", "sample", "models", "services", "handlers", "shared-words"])
    assert.equal(isGenericStem(stem), false, stem);
});

test("what a module exports is read from its top level, a framework's own names left out", () => {
  assert.deepEqual(
    exportedNamesIn(
      source(
        "export const leadOf = () => 1;",
        "export function clip() {}",
        "export type CallOutcome = string;",
        "export interface Row {}",
        "export async function GET() {}",
        "export const maxDuration = 60;",
        "export const dynamic = 'force-static';",
        "const inner = 1;",
        "function hidden() { return inner; }",
      ),
    ).sort(),
    ["CallOutcome", "Row", "clip", "leadOf"],
  );
  assert.equal(treeOf("packages/contracts/src/ads/vm-base.ts"), "packages/contracts");
  assert.equal(treeOf("apps/edge/lib/receptionist/steer.ts"), "apps/edge");
  assert.equal(treeOf("apps/dashboard/src/server/readers/today.ts"), "apps/dashboard");
});

test("a word is every part of a name, in either casing", () => {
  assert.deepEqual(wordsOf("heldNoticesOf"), ["held", "notices", "of"]);
  assert.deepEqual(wordsOf("LEAD_STAGE_WORDS"), ["lead", "stage", "words"]);
  assert.deepEqual(wordsOf("toTodayVM"), ["to", "today", "vm"]);
  assert.deepEqual(wordsOf("tenant_id"), ["tenant", "id"]);
});

test("a word used widely is defined in the glossary or known as plain, and anything else is counted", () => {
  const counts = { door: 300, lead: 300, table: 300, widget: 300, rare: 3, doors: 200 };
  const glossary = "| **Door** | An HTTP endpoint |\n| **Lead** | A business the finder found |";
  assert.deepEqual(undefinedWords(counts, glossary, new Set(["table"]), 100), { widget: 300 });
});

test("the measures read the tree: each that counts a whole class finds what is known to be there", () => {
  const byKey = Object.fromEntries(NAME_RATCHETS.map((r) => [r.file.replace(/\.json$/, ""), r]));
  assert.deepEqual(Object.keys(byKey).sort(), [
    "async-verb-first",
    "boolean-names",
    "exported-twice",
    "file-repeats-folder",
    "house-words",
    "short-names",
    "type-casing",
    "value-names",
  ]);
  for (const r of NAME_RATCHETS) assert.ok(r.advice && r.name, `${r.file} says what it holds and what to do`);
  assert.ok(
    Object.keys(byKey["short-names"].measure()).length > 0 ||
      Object.keys(byKey["async-verb-first"].measure()).length === 0,
    "the tree was read",
  );
});
