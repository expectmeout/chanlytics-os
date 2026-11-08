/**
 * What a failure must keep on its way up, read off the syntax tree (layer 9, decision 0114). Four ways one loses it:
 * a reply's failure raised by hand with its code left behind, a catch that goes quiet with nothing to say why, a new
 * error that leaves the one it replaces behind, and a caught failure's own text handed to whoever asked.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern. errors.test.mjs holds the tree to these.
 */
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";

/** The backend, by tree: what runs behind a door, and contracts under it. The browser's code is the frontend pillar's. */
export const BACKEND = [
  "packages/contracts/src",
  "packages/core/src",
  "packages/db/src",
  "packages/channels/src",
  "packages/jobs/src",
  "packages/log/src",
  "apps/edge/api",
  "apps/edge/lib",
  "apps/dashboard/src/server",
  "apps/dashboard/app/api",
];
const NOT = /\.d\.ts$|\.type-test\.ts$|\.generated\.ts$|\/dist\/|\.test\.|\.spec\./;
export const backendModules = () => repoFiles(BACKEND).filter((f) => /\.tsx?$/.test(f) && !NOT.test(f));

/** A name a reply's failure goes by: `error`, `r.error`, `pgError`. */
const REPLY = /^(?:[A-Za-z_]\w*\.)*[A-Za-z_]*[Ee]rror$/;
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** The handler of `p.catch(cb)` or `p.then(ok, cb)`, when `n` is that call. */
function promiseHandler(n) {
  if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return null;
  const method = n.expression.name.text;
  const cb = method === "catch" ? n.arguments[0] : method === "then" ? n.arguments[1] : undefined;
  return cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? cb : null;
}

/** Whether `n` sits in a catch clause or a promise's failure handler. */
function inCaught(n) {
  for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isCatchClause(p)) return true;
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parent && promiseHandler(p.parent) === p)
      return true;
  }
  return false;
}

/** Calls `visit` on each node under `body`, not going into a function it makes: what the handler does now. */
function within(body, visit) {
  const go = (n) => {
    if (n !== body && isFunctionLike(n)) return;
    visit(n);
    ts.forEachChild(n, go);
  };
  go(body);
}

/**
 * Each reply's failure raised without what it carries, outside a catch: `new Error(error.message)`,
 * `new Error(\`label: ${error?.message}\`)`, and `if (error) throw error`, where the client's own reply object goes up
 * as it is. The code a route could answer by (with-route.ts dbRefusal) is gone by the first, and the second is no
 * Error at all. `new DbFailure(error, "label")` keeps both.
 */
export function droppedCodesIn(sf) {
  const out = [];
  const go = (n) => {
    if (ts.isNewExpression(n) && n.expression.getText(sf) === "Error" && n.arguments?.length && !inCaught(n)) {
      if (/(?:^|[^\w.])(?:\w+\.)*\w*[Ee]rror\??\.message/.test(n.arguments[0].getText(sf))) out.push(lineOf(sf, n));
    }
    if (ts.isThrowStatement(n) && n.expression && !inCaught(n) && REPLY.test(n.expression.getText(sf))) {
      const name = n.expression.getText(sf);
      for (let p = n.parent; p && !isFunctionLike(p); p = p.parent) {
        // Only the guard that reads it: `if (error) throw error`. A failure held by `throw halt.error` was caught.
        if (ts.isIfStatement(p) && p.expression.getText(sf) === name) {
          out.push(lineOf(sf, n));
          break;
        }
      }
    }
    ts.forEachChild(n, go);
  };
  go(sf);
  return out;
}

/** What a handler's body does with the failure it holds. */
function handlingOf(body) {
  const did = { throws: false, calls: false, statements: ts.isBlock(body) ? body.statements.length : 1 };
  within(body, (n) => {
    if (ts.isThrowStatement(n)) did.throws = true;
    if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isAwaitExpression(n)) did.calls = true;
  });
  return did;
}

/** A reason written beside a handler: inside it, or on the statement's own line or the two above it. */
function saysWhy(sf, handlerNode, body) {
  const text = sf.getFullText();
  if (ts.isBlock(body) && /\/\/|\/\*/.test(text.slice(body.getStart(sf) + 1, body.end - 1))) return true;
  let stmt = handlerNode;
  while (stmt.parent && !ts.isBlock(stmt.parent) && !ts.isSourceFile(stmt.parent) && !ts.isModuleBlock(stmt.parent))
    stmt = stmt.parent;
  const lines = text.split("\n");
  const first = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line;
  const own = sf.getLineAndCharacterOfPosition(handlerNode.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(handlerNode.end).line;
  const near = [lines[first - 2] ?? "", lines[first - 1] ?? "", ...lines.slice(own, end + 1)];
  return near.some((l) => /\/\/|\/\*|^\s*\*/.test(l));
}

/**
 * Each catch that goes quiet: it throws nothing and calls nothing (a value stands in for the failure, or nothing at
 * all), and nothing beside it says why. A failed read then looks the same as "nothing there", and a failed write as
 * done. Log it (`quietly`, packages/log), re-raise it, or write the reason down.
 */
export function quietCatchesIn(sf) {
  const out = [];
  const judge = (handlerNode, body) => {
    const did = handlingOf(body);
    if (!did.throws && !did.calls && !saysWhy(sf, handlerNode, body)) out.push(lineOf(sf, handlerNode));
  };
  const go = (n) => {
    if (ts.isCatchClause(n)) judge(n, n.block);
    const cb = promiseHandler(n);
    if (cb) judge(n, cb.body);
    ts.forEachChild(n, go);
  };
  go(sf);
  return out;
}

/** The name a caught failure is held by in a clause or handler, or null where nothing binds it. */
function caughtName(handler) {
  const decl = ts.isCatchClause(handler) ? handler.variableDeclaration?.name : handler.parameters[0]?.name;
  return decl && ts.isIdentifier(decl) ? decl.text : null;
}

/**
 * Each new error raised from a catch that leaves the caught one behind: `throw new X("words")` with neither the
 * caught name nor a `cause` among what it is handed. The log line then says what was tried and not what went wrong.
 */
export function droppedCausesIn(sf) {
  const out = [];
  const judge = (handler, body) => {
    const name = caughtName(handler);
    within(body, (n) => {
      if (!ts.isThrowStatement(n) || !n.expression) return;
      const e = n.expression;
      if (!ts.isNewExpression(e) && !ts.isCallExpression(e)) return;
      const text = (e.arguments ?? []).map((a) => a.getText(sf)).join(" ");
      const holds =
        (name && new RegExp(`\\b${name}\\b`).test(text)) ||
        /\bcause\b/.test(text) ||
        /\.because\(/.test(e.parent.getText(sf));
      if (!holds) out.push(lineOf(sf, n));
    });
  };
  const go = (n) => {
    if (ts.isCatchClause(n)) judge(n, n.block);
    const cb = promiseHandler(n);
    if (cb) judge(cb, cb.body);
    ts.forEachChild(n, go);
  };
  go(sf);
  return out;
}

/** A call that answers whoever asked. */
const ANSWERS = /^(refuse|err|json|jsonResponse|NextResponse\.json|Response\.json|new Response|new NextResponse)$/;

/**
 * Each answer built from a caught failure's own text, where nothing has said the failure was written for a person: an
 * AppError's sentence is; anything else's is the database's or a library's, and it belongs in the log. An `if (e
 * instanceof AppError)` around the answer, or the `refusalWords` read (with-route.ts), says it.
 */
export function textHandedOverIn(sf) {
  const out = [];
  const judge = (handler, body) => {
    const name = caughtName(handler);
    if (!name) return;
    const reads = (a) => new RegExp(`\\b${name}\\.message\\b|String\\(${name}\\)|\\$\\{${name}\\}`).test(a.getText(sf));
    within(body, (n) => {
      if (!ts.isCallExpression(n) && !ts.isNewExpression(n)) return;
      const callee = `${ts.isNewExpression(n) ? "new " : ""}${n.expression.getText(sf)}`;
      if (!ANSWERS.test(callee) || !(n.arguments ?? []).some(reads)) return;
      for (let p = n.parent; p && p !== body; p = p.parent)
        if (ts.isIfStatement(p) && new RegExp(`\\b${name} instanceof AppError\\b`).test(p.expression.getText(sf)))
          return;
      out.push(lineOf(sf, n));
    });
  };
  const go = (n) => {
    if (ts.isCatchClause(n)) judge(n, n.block);
    const cb = promiseHandler(n);
    if (cb) judge(cb, cb.body);
    ts.forEachChild(n, go);
  };
  go(sf);
  return out;
}

/**
 * Each answer that quotes a reply's failure outright, caught or not: `refuse(503, "read_failed", error.message)`, or a
 * door's result `{ error: "write_failed", detail: error.message }`. `detail` is shown as it is (edgeRefusalWords), so
 * the database's sentence reached a person. A provider's refusal (`stripe_refused`) says what the provider said.
 */
export function replyTextAnsweredIn(sf) {
  const out = [];
  const quotes = (a) => /(?:^|[^\w.])(?:\w+\.)*\w*[Ee]rror\??\.message\b/.test(a.getText(sf));
  const go = (n) => {
    if (ts.isCallExpression(n) && ANSWERS.test(n.expression.getText(sf)) && n.arguments.some(quotes)) {
      let guarded = false;
      for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent)
        if (ts.isIfStatement(p) && /\binstanceof AppError\b/.test(p.expression.getText(sf))) guarded = true;
      if (!guarded) out.push(lineOf(sf, n));
    }
    if (ts.isObjectLiteralExpression(n)) {
      const prop = (name) => n.properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText(sf) === name);
      const detail = prop("detail");
      const code = prop("error") ?? prop("code");
      if (
        detail &&
        code &&
        /_(read|write)_failed"$|"(read|write)_failed"$/.test(code.initializer.getText(sf)) &&
        /\.message\b|String\(/.test(detail.initializer.getText(sf))
      )
        out.push(lineOf(sf, n));
    }
    ts.forEachChild(n, go);
  };
  go(sf);
  return out;
}

/** `{ file: [lines] }` for each backend module `measure` finds anything in. */
export function across(measure) {
  const out = {};
  for (const f of backendModules()) {
    const lines = measure(parse(f));
    if (lines.length) out[f] = lines;
  }
  return out;
}
