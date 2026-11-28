/**
 * The bridge stays narrow (the reviews of 28 Nov 2026: R2.16, R3.12).
 *
 * What the bridge installs at boot is held by name in one typed store (bridge/provided.ts, decision 0151). It took the
 * window's place, and the window's failing was that anything could be hung on it: a read's answer beside a verb, with
 * nothing to say which a name was. The store's names are one interface, `BridgeParts`, which each owner adds to beside
 * its own code, so no one file lists them and a new one arrives unremarked.
 *
 * This reads every declaration of a part in the syntax tree and holds it to bridge-parts.json: a part with no row there
 * fails, a row for a part that is gone fails, and each row says where the part is declared, which of four things it is
 * and why it is installed and not imported. And a part's type is a tool's: a function, a number the frame is told, or a
 * thing of verbs, never a row, a list of them or a read's answer, which are the seam's to hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT, importSrc } from "../../_source.mjs";
import { parse } from "../../_ast.mjs";
import { DASHBOARD, browserFiles } from "./_stores.mjs";

const LIST = "tests/shell/stores/bridge-parts.json";
const KINDS = ["gate", "tool", "courier", "dial"];
const listed = JSON.parse(fs.readFileSync(path.join(ROOT, LIST), "utf8")).parts;

/** The members of each `interface BridgeParts` a module declares: its own, or one it adds to the store's by its path. */
function partsDeclaredIn(sf) {
  const out = [];
  const take = (statements) => {
    for (const statement of statements) {
      if (ts.isInterfaceDeclaration(statement) && statement.name.text === "BridgeParts")
        for (const member of statement.members)
          if (member.name && ts.isIdentifier(member.name)) out.push({ name: member.name.text, type: member.type });
      if (
        ts.isModuleDeclaration(statement) &&
        ts.isStringLiteral(statement.name) &&
        /(^|\/)provided$/.test(statement.name.text) &&
        statement.body &&
        ts.isModuleBlock(statement.body)
      )
        take(statement.body.statements);
    }
  };
  take(sf.statements);
  return out;
}

/** Every part declared anywhere in the browser's code: its name, the module that declares it, and its type's node. */
function partsDeclared() {
  const out = [];
  for (const file of browserFiles()) {
    const sf = parse(file);
    for (const part of partsDeclaredIn(sf)) out.push({ ...part, from: file.slice(DASHBOARD.length), sf });
  }
  return out;
}

/** A type reference whose name says it is data: a row, a list of them, a view model, a read's answer. */
const NAMES_DATA = /(Dto|VM|Row|Rows|Surface|Answer|Read)$|^(Array|ReadonlyArray|Map|Set|Record|Partial)$/;

/** Why a part's type is not a tool's, or null where it is: a function, `typeof` one, a number, or a thing of those. */
function notATool(type, sf) {
  if (!type) return "it has no type";
  if (ts.isFunctionTypeNode(type) || ts.isTypeQueryNode(type)) return null;
  if (type.kind === ts.SyntaxKind.NumberKeyword) return null;
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText(sf);
    return NAMES_DATA.test(name) ? `its type, ${name}, is data's` : null;
  }
  if (ts.isTypeLiteralNode(type)) {
    for (const member of type.members) {
      if (ts.isMethodSignature(member)) continue;
      const inner = ts.isPropertySignature(member) ? notATool(member.type, sf) : "it holds something that is no verb";
      if (inner) return inner;
    }
    return null;
  }
  return `its type is ${type.getText(sf)}`;
}

const declared = partsDeclared();

test("every part the bridge holds has a row: where it is declared, what it is, and why it is not an import", () => {
  const unlisted = declared.filter((part) => !listed[part.name]).map((part) => `${part.name}  (${part.from})`);
  assert.deepEqual(
    unlisted,
    [],
    `a new part of the bridge's store has no row in ${LIST}. A plain import is the first choice; a part earns its row ` +
      `by saying what an import would break. Give it "from", "is" (${KINDS.join(", ")}) and "why".`,
  );
  const names = new Set(declared.map((part) => part.name));
  assert.deepEqual(
    Object.keys(listed).filter((name) => !names.has(name)),
    [],
    `rows in ${LIST} for parts that are gone`,
  );
  assert.equal(names.size, declared.length, "no part is declared twice");
});

test("each row says where its part is declared, one of the four things it is, and a reason in words", () => {
  const off = [];
  for (const part of declared) {
    const row = listed[part.name];
    if (!row) continue;
    if (row.from !== part.from) off.push(`${part.name}: declared in ${part.from}, and its row says ${row.from}`);
    if (!KINDS.includes(row.is)) off.push(`${part.name}: "is" is one of ${KINDS.join(", ")}`);
    if (typeof row.why !== "string" || row.why.trim().split(/\s+/).length < 8)
      off.push(`${part.name}: "why" says why it is installed and not imported`);
  }
  assert.deepEqual(off, []);
});

test("a part is a tool of the frame's, never a workspace's records: its type is a function, a number or a thing of verbs", () => {
  const data = declared.flatMap((part) => {
    const reason = notATool(part.type, part.sf);
    return reason ? [`${part.name} (${part.from}): ${reason}`] : [];
  });
  assert.deepEqual(
    data,
    [],
    "a read's answer is the seam's (surfaces/surface-values.ts) or the bridge module's that read it (held-reads.ts), " +
      "never a part of the bridge's store",
  );
  // And the check itself tells data from a tool, on parts written out here.
  const sf = ts.createSourceFile(
    "made-up.ts",
    "interface BridgeParts {\n" +
      "  people: PersonDto[];\n  page: AdsLiveDto | null;\n  rows: PeopleSurface;\n  held: { rows: PersonRow };\n" +
      "  go: (to: string) => void;\n  verbs: { open(): void; close: () => void };\n  waitMs: number;\n  bell: BellApi;\n" +
      "  toast: typeof raise;\n}",
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const judged = Object.fromEntries(partsDeclaredIn(sf).map((part) => [part.name, notATool(part.type, sf) === null]));
  assert.deepEqual(judged, {
    people: false,
    page: false,
    rows: false,
    held: false,
    go: true,
    verbs: true,
    waitMs: true,
    bell: true,
    toast: true,
  });
});

test("the store holds a part by its name from when it is provided until it is taken away, and nothing before", async () => {
  const store = await importSrc("apps/dashboard/src/bridge/provided.ts");
  const was = store.provided("routeWaitMs");
  try {
    store.provide("routeWaitMs", undefined);
    assert.equal(store.provided("routeWaitMs"), undefined, "nothing before the bridge has installed it");
    store.provide("routeWaitMs", 1200);
    assert.equal(store.provided("routeWaitMs"), 1200);
    assert.equal(store.provided("afterTheMoveMs"), undefined, "and no other name answers for it");
    store.provide("routeWaitMs", undefined);
    assert.equal(store.provided("routeWaitMs"), undefined, "taken away");
  } finally {
    store.provide("routeWaitMs", was);
  }
});
