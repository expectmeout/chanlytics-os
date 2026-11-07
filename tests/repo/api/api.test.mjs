/**
 * What crosses a door is declared once (decision 0109). Each edge door's path and body is contracts' (`edgeDoor` in its
 * domain's `edge-doors.ts`); the door reads its body through that declaration, and every call the dashboard makes names
 * a declared door, whose body tsc then holds it to. A route's field that a closed set of the database names takes that
 * set. And each of `_api.mjs`'s measures is kept honest on a source written for it; what they count is check:debt's to
 * hold (API_RATCHETS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT, importSrc } from "../../_source.mjs";
import { parse, repoFiles } from "../../_ast.mjs";
import {
  OPS_THAT_READ_A_BODY,
  bodyReads,
  declaredDoors,
  defaultStatuses,
  edgeAnswerCasts,
  edgeCalls,
  pageShapesIn,
  readsByHand,
  statusesOffTheirCode,
} from "./_api.mjs";

const doors = declaredDoors();
const byName = new Map(doors.map((d) => [d.name, d]));
const paths = new Set(doors.map((d) => d.aud));
const source = (...lines) => ts.createSourceFile("probe.ts", lines.join("\n"), ts.ScriptTarget.Latest, true);
const walk = (node, visit) => {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
};

test("no two doors are declared on one path, and each is a door the edge has", () => {
  assert.ok(doors.length >= 40, `read ${doors.length} declarations`);
  assert.equal(paths.size, doors.length, "a path declared twice");
  for (const d of doors)
    assert.ok(fs.existsSync(path.join(ROOT, `apps/edge${d.aud}.ts`)), `${d.name}: no apps/edge${d.aud}.ts`);
});

test("every edge door that reads a body reads it through the door declared for its path", () => {
  const edgeModules = repoFiles(["apps/edge/api", "apps/edge/lib"]).filter((f) => f.endsWith(".ts"));
  const reads = bodyReads(edgeModules);
  assert.ok(reads.length >= 40, `read ${reads.length} body reads`);
  const wrong = [];
  for (const r of reads) {
    const want =
      OPS_THAT_READ_A_BODY[r.file] ??
      (r.file.startsWith("apps/edge/api/") ? r.file.replace(/^apps\/edge/, "").replace(/\.ts$/, "") : null);
    const door = r.door ? byName.get(r.door) : null;
    if (!want)
      wrong.push(`${r.file}:${r.line} reads a door's body outside the door's file: name it in OPS_THAT_READ_A_BODY`);
    else if (!door) wrong.push(`${r.file}:${r.line} reads its body through no declared door`);
    else if (door.aud !== want) wrong.push(`${r.file}:${r.line} reads ${door.aud}'s body at ${want}`);
  }
  assert.deepEqual(wrong, []);
});

test("every call the dashboard makes to the edge names a declared door", () => {
  const files = repoFiles(["apps/dashboard/src", "apps/dashboard/app"]).filter((f) => /\.tsx?$/.test(f));
  const calls = edgeCalls(files);
  assert.ok(calls.length >= 40, `read ${calls.length} calls`);
  assert.deepEqual(
    calls
      .filter((c) => !paths.has(c.path))
      .map((c) => `${c.file}:${c.line} ${c.path ?? "(a path the call does not say)"}`),
    [],
  );
});

test("a route's field that a closed set of the database names takes that set, not any string", async () => {
  const { SCHEMA_SETS } = await importSrc("packages/contracts/src/schema-sets.generated.ts");
  const loose = [];
  for (const f of repoFiles(["apps/dashboard/app/api/v1"]).filter((x) => x.endsWith("/route.ts"))) {
    const table = f.split("/")[5].replace(/-/g, "_");
    const columns = new Set(
      Object.keys(SCHEMA_SETS)
        .filter((k) => k.startsWith(`${table}.`))
        .map((k) => k.slice(table.length + 1)),
    );
    if (!columns.size) continue;
    const sf = parse(f);
    walk(sf, (n) => {
      if (!ts.isPropertyAssignment(n) || !ts.isIdentifier(n.name) || !columns.has(n.name.text)) return;
      const written = n.initializer.getText(sf).replace(/\s+/g, "");
      if (/^z\.string\(\)/.test(written) && !/\.(regex|enum)\(/.test(written))
        loose.push(`${f}: ${n.name.text} (${table}.${n.name.text})`);
    });
  }
  assert.deepEqual(loose, []);
});

test("a request read by hand is counted, and one a schema parses or a door declares is not", () => {
  const count = (...lines) => readsByHand(source(...lines)).length;
  assert.equal(count("const body = (await req.json()) as { a?: unknown };"), 1);
  assert.equal(count("const at = new URL(req.url).searchParams.get('at');"), 1);
  assert.equal(count("const body = await readBody(request);"), 1);
  assert.equal(count("const body = Body.parse(await req.json());"), 0);
  assert.equal(
    count(
      "const text = await request.text();",
      "const sent = JSON.parse(text);",
      "const held = Schema.safeParse(sent);",
    ),
    0,
  );
  assert.equal(count("const body = await readBody(request, LINES_DOOR);"), 0);
  assert.equal(count("const at = Date.parse(await req.text());"), 1, "a date's parse is no schema");
});

test("an edge answer cast is counted, and another cast is not", () => {
  assert.equal(edgeAnswerCasts(source("const a = answer.body as { ok?: boolean } | null;")), 1);
  assert.equal(edgeAnswerCasts(source("const b = (r.body ?? {}) as { ok?: boolean };")), 1);
  assert.equal(edgeAnswerCasts(source("const c = row.data as { id: string };")), 0);
  assert.equal(edgeAnswerCasts(source("const d = { body: 1 }.body as const;")), 0);
});

test("a status a code does not have is counted, and the code's own is not", () => {
  const defaults = defaultStatuses();
  assert.equal(defaults.validation, 400);
  assert.deepEqual(statusesOffTheirCode(source('throw new AppError("validation", "No.", 422);'), defaults), [
    "validation 422",
  ]);
  assert.deepEqual(statusesOffTheirCode(source('throw new AppError("validation", "No.", 400);'), defaults), []);
  assert.deepEqual(statusesOffTheirCode(source('throw new AppError("validation", "No.");'), defaults), []);
});

test("a page of results is read by its words of paging", () => {
  assert.deepEqual(
    pageShapesIn(source("interface P { items: string[]; has_more: boolean; next_cursor: string | null }")),
    ["has_more+next_cursor"],
  );
  assert.deepEqual(
    pageShapesIn(source("interface Q { total: number; count: number }")),
    [],
    "a total alone pages nothing",
  );
});
