/**
 * What crosses a door, read from the syntax trees (decision 0109): the doors contracts declares for the edge, who reads
 * and calls them, and the numbers check:debt holds (API_RATCHETS): a request read by hand, an edge's answer cast
 * instead of read, a refusal answered with a status its code does not have, and the shapes a page of results comes in.
 * api.test.mjs holds the doors outright and keeps each measure honest on a source written for it.
 */
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";

const NOT = /\.d\.ts$|\.generated\.|\.type-test\.|\.test\.|(^|\/)test\//;
const modules = (trees) => repoFiles(trees).filter((f) => /\.tsx?$/.test(f) && !NOT.test(f));
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const walk = (node, visit) => {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
};

/* ------------------------------------------------------------------ the doors contracts declares */

/** Every door declared in contracts, as `{ name, aud, module }`: `export const X_DOOR = edgeDoor("/api/...", ...)`. */
export function declaredDoors() {
  const out = [];
  for (const f of modules(["packages/contracts/src"])) {
    if (!f.endsWith("/edge-doors.ts")) continue;
    const sf = parse(f);
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        const call = d.initializer;
        if (
          ts.isIdentifier(d.name) &&
          call &&
          ts.isCallExpression(call) &&
          call.expression.getText(sf) === "edgeDoor" &&
          call.arguments[0] &&
          ts.isStringLiteral(call.arguments[0])
        )
          out.push({ name: d.name.text, aud: call.arguments[0].text, module: f });
      }
    }
  }
  return out;
}

/** The ops that read their own door's body, for the door they serve. Every other read is in the door's own file. */
export const OPS_THAT_READ_A_BODY = {
  "apps/edge/lib/files/copies.ts": "/api/admin/files/copies",
  "apps/edge/lib/ops/ask-turn.ts": "/api/admin/llm",
  "apps/edge/lib/voice/provision.ts": "/api/admin/voice-provision",
};

/** Each `readBody(...)` in an edge module, as `{ file, line, door }`: the name its second argument gives, or null. */
export function bodyReads(files) {
  const out = [];
  for (const f of files) {
    const sf = parse(f);
    walk(sf, (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "readBody") {
        const door = n.arguments[1] && ts.isIdentifier(n.arguments[1]) ? n.arguments[1].text : null;
        out.push({ file: f, line: lineOf(sf, n), door });
      }
    });
  }
  return out;
}

/**
 * The door each dashboard call to the edge names, as `{ file, line, path }`: a string at the call, or a constant of the
 * module (or one it imports by name) that holds one; `path` null where neither says.
 */
export function edgeCalls(files) {
  const out = [];
  const constants = (sf) => {
    const m = new Map();
    for (const st of sf.statements)
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations)
          if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteral(d.initializer))
            m.set(d.name.text, d.initializer.text);
    return m;
  };
  for (const f of files) {
    const sf = parse(f);
    const here = constants(sf);
    /** The path an argument holds: a string, a constant of the module, or one it imports by name (ask/doors' DOOR). */
    const pathOf = (a) => {
      if (!a) return null;
      if (ts.isStringLiteral(a)) return a.text;
      if (!ts.isIdentifier(a)) return null;
      if (here.has(a.text)) return here.get(a.text);
      for (const st of sf.statements) {
        if (
          !ts.isImportDeclaration(st) ||
          !st.importClause?.namedBindings ||
          !ts.isNamedImports(st.importClause.namedBindings)
        )
          continue;
        if (!st.importClause.namedBindings.elements.some((e) => e.name.text === a.text)) continue;
        const spec = st.moduleSpecifier.text.replace(/^@\//, "apps/dashboard/src/");
        const target = [`${spec}.ts`, `${spec}/index.ts`].find((c) => files.includes(c));
        if (target) return constants(parse(target)).get(a.text) ?? null;
      }
      return null;
    };
    walk(sf, (n) => {
      if (
        !ts.isCallExpression(n) ||
        !ts.isIdentifier(n.expression) ||
        !["callEdge", "edgeHeaders"].includes(n.expression.text)
      )
        return;
      const p = pathOf(n.arguments[0]);
      // A header made for a path its caller holds as a parameter is callEdge's own, and that call is read where it is made.
      if (n.expression.text === "edgeHeaders" && p === null) return;
      out.push({ file: f, line: lineOf(sf, n), path: p });
    });
  }
  return out;
}

/* ------------------------------------------------------------------ a request read by hand */

const RAW_METHODS = new Set(["json", "text", "formData", "arrayBuffer"]);
const REQUEST = /^(req|request|raw|ctx\.req)$/;
const HAND_READERS = new Set(["readJsonBody", "parseRequestBody"]);
const NOT_A_SCHEMA = /^(JSON|Date|URL|Number|BigInt)$/;

/**
 * The reads of what a request carries that no schema parses, in one module: a body read as JSON, text or a form, or a
 * query's value, kept and picked apart by hand. A read a schema's `parse`/`safeParse` takes (directly, or through the
 * names it is kept under) is not one, nor is a door's body read through its declared door (`readBody(request, DOOR)`),
 * nor route()'s own parse of a route's declared input.
 */
export function readsByHand(sf) {
  const raws = [];
  const parses = [];
  const isRaw = (n) => {
    if (!ts.isCallExpression(n)) return false;
    const c = n.expression;
    if (ts.isPropertyAccessExpression(c)) {
      const left = c.expression.getText(sf).replace(/\s+/g, "");
      if (RAW_METHODS.has(c.name.text) && REQUEST.test(left)) return true;
      if (c.name.text === "get" && /searchParams$/.test(left)) return true;
    }
    if (ts.isIdentifier(c) && HAND_READERS.has(c.text)) return true;
    if (ts.isIdentifier(c) && c.text === "readBody" && n.arguments.length < 2) return true;
    return false;
  };
  walk(sf, (n) => {
    if (isRaw(n)) raws.push(n);
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const method =
        ts.isPropertyAccessExpression(c) &&
        ["parse", "safeParse", "parseAsync", "safeParseAsync"].includes(c.name.text) &&
        !NOT_A_SCHEMA.test(c.expression.getText(sf));
      const routeParse = ts.isIdentifier(c) && c.text === "parse" && n.arguments.length === 2;
      if (method || routeParse) parses.push(n);
    }
  });
  // The names a parse reaches, back through what each was made from.
  const inits = new Map();
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer)
      inits.set(n.name.text, n.initializer.getText(sf));
  });
  const reached = new Set();
  const reach = (text) => {
    for (const [name, init] of inits)
      if (!reached.has(name) && new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`).test(text)) {
        reached.add(name);
        reach(init);
      }
  };
  for (const p of parses) for (const a of p.arguments) reach(a.getText(sf));
  const parsed = (raw) => {
    for (let p = raw.parent; p && p !== sf; p = p.parent) {
      if (parses.includes(p)) return true;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return reached.has(p.name.text);
    }
    return false;
  };
  return raws.filter((r) => !parsed(r)).map((r) => lineOf(sf, r));
}

/** The trees whose modules take what a request carries. */
export const HANDLER_TREES = ["apps/dashboard/app", "apps/dashboard/src/server", "apps/edge/api", "apps/edge/lib"];

/* ------------------------------------------------------------------ an edge's answer cast */

/** The casts of an edge answer's body (`answer.body as { ... }`, `(r.body ?? {}) as X`): a shape the caller supposes. */
export function edgeAnswerCasts(sf) {
  let n = 0;
  walk(sf, (node) => {
    if (!ts.isAsExpression(node) || node.type.getText(sf) === "const") return;
    let e = node.expression;
    while (
      ts.isParenthesizedExpression(e) ||
      (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    )
      e = ts.isParenthesizedExpression(e) ? e.expression : e.left;
    if ((ts.isPropertyAccessExpression(e) || ts.isPropertyAccessChain?.(e)) && e.name.text === "body") n += 1;
  });
  return n;
}

/* ------------------------------------------------------------------ a code and its status */

/** Each code's status, as contracts' errors.ts says it (DEFAULT_STATUS). */
export function defaultStatuses() {
  const sf = parse("packages/contracts/src/shared/errors.ts");
  const out = {};
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "DEFAULT_STATUS" &&
      n.initializer &&
      ts.isObjectLiteralExpression(n.initializer)
    )
      for (const p of n.initializer.properties)
        if (ts.isPropertyAssignment(p) && ts.isNumericLiteral(p.initializer))
          out[p.name.getText(sf)] = Number(p.initializer.text);
  });
  return out;
}

/** The refusals a module makes with a status their code does not have: `new AppError("validation", words, 422)`. */
export function statusesOffTheirCode(sf, defaults) {
  const out = [];
  walk(sf, (n) => {
    if (!ts.isNewExpression(n) || n.expression.getText(sf) !== "AppError" || !n.arguments) return;
    const [code, , status] = n.arguments;
    if (
      code &&
      ts.isStringLiteral(code) &&
      status &&
      ts.isNumericLiteral(status) &&
      defaults[code.text] !== undefined &&
      Number(status.text) !== defaults[code.text]
    )
      out.push(`${code.text} ${status.text}`);
  });
  return out;
}

/** The edge's codes and the statuses each is refused with: `refuse(400, "bad_request", ...)`. */
export function edgeRefusals(files) {
  const out = new Map();
  for (const f of files) {
    const sf = parse(f);
    walk(sf, (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "refuse" &&
        n.arguments[1] &&
        ts.isStringLiteral(n.arguments[1]) &&
        ts.isNumericLiteral(n.arguments[0])
      ) {
        const code = n.arguments[1].text;
        (out.get(code) ?? out.set(code, new Set()).get(code)).add(Number(n.arguments[0].text));
      }
    });
  }
  return out;
}

/* ------------------------------------------------------------------ a page of results */

const PAGE_WORDS = new Set([
  "has_more",
  "next_cursor",
  "cursor",
  "before",
  "after",
  "after_key",
  "after_id",
  "more",
  "since",
  "page",
  "page_size",
  "offset",
  "limit",
  "total",
  "next",
  "prev",
]);
const PAGE_MARKS = new Set(["has_more", "next_cursor", "cursor", "after_key", "after_id", "more"]);

/** The shapes a page of results comes in, in one module: a type with two words of paging, one of them a mark. */
export function pageShapesIn(sf) {
  const out = [];
  walk(sf, (n) => {
    if (!ts.isInterfaceDeclaration(n) && !ts.isTypeLiteralNode(n)) return;
    const words = n.members
      .map((m) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : null))
      .filter((w) => w && PAGE_WORDS.has(w));
    if (words.length >= 2 && words.some((w) => PAGE_MARKS.has(w))) out.push(words.sort().join("+"));
  });
  return out;
}

/* ------------------------------------------------------------------ the numbers check:debt holds */

const byFile = (files, measure) =>
  Object.fromEntries(
    files
      .map((f) => [f, measure(parse(f))])
      .map(([f, v]) => [f, Array.isArray(v) ? v.length : v])
      .filter(([, n]) => n > 0),
  );

export const API_RATCHETS = [
  {
    name: "request reads no schema parses",
    file: "hand-read-requests.json",
    measure: () => byFile(modules(HANDLER_TREES), readsByHand),
    advice:
      "Declare what a route takes (route()'s input, or a read's query), or read a door's body through the door contracts declares for it (readBody(request, X_DOOR)). A provider's delivery is layer 12's to give a schema.",
  },
  {
    name: "edge answers cast instead of read",
    file: "edge-answer-casts.json",
    measure: () => byFile(modules(["apps/dashboard/src/server", "apps/dashboard/app"]), edgeAnswerCasts),
    advice:
      "Read the field the answer carries, as EdgeAnswerBody types it; a door's answer joins its declaration in contracts when both sides read it.",
  },
  {
    name: "refusals answered with a status their code does not have",
    file: "codes-off-their-status.json",
    measure: () => {
      const defaults = defaultStatuses();
      return byFile(modules(["apps/dashboard", "packages"]), (sf) => statusesOffTheirCode(sf, defaults));
    },
    advice:
      "A code answers one status (contracts errors.ts DEFAULT_STATUS). A refusal that needs another status is another code; the browser reads some of these statuses, so a change is a change to it.",
  },
  {
    name: "edge codes refused with more than one status",
    file: "edge-codes-with-two-statuses.json",
    measure: () =>
      [...edgeRefusals(modules(["apps/edge"]))]
        .filter(([, statuses]) => statuses.size > 1)
        .map(([code, statuses]) => `${code}: ${[...statuses].sort().join(", ")}`)
        .sort(),
    advice:
      "One status for each edge code: the dashboard compares codes, and a code that means two statuses makes it read the status too.",
  },
  {
    name: "shapes a page of results comes in",
    file: "page-shapes.json",
    measure: () =>
      [
        ...new Set(
          modules([
            "packages/contracts/src",
            "packages/db/src",
            "packages/core/src",
            "apps/dashboard/src/server",
          ]).flatMap((f) => pageShapesIn(parse(f))),
        ),
      ].sort(),
    advice: "A new list pages in a shape already here; the data layer (layer 8) brings them to one.",
  },
];
