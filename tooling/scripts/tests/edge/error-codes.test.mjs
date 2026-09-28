/**
 * The edge's refusals are a closed set, EDGE_ERROR_CODES (packages/contracts/src/shared/edge-errors.ts), the way its
 * log names are LOG_EVENTS (log-events.test.mjs): every code a refusal carries in `error` is declared, every declared
 * code is carried, and no `error` is a sentence. A refusal's words ride in `detail`.
 *
 * `json` and `refuse` (apps/edge/lib/http.ts) take a body whose `error` is an `EdgeErrorCode`, so tsc refuses a code
 * outside the set wherever a door answers, and a value handed on from a module's result has to be typed as one to
 * reach an answer at all. This holds what the types cannot: a refusal a module returns before any door answers it, a
 * code the set declares and nothing answers, and a sentence written into an `error`.
 *
 * A refusal is an object literal with `ok: false` and an `error`, or a call `refuse(status, code, detail?)`; its codes
 * are the string literals its `error` is written as (a conditional's branches, a fallback's). A code built from a
 * template (`token_${reason}`) is a family: tsc holds its members to the set, and a declared code the template can
 * spell counts as answered. A sentence is any whitespace in what a refusal writes into `error` (a literal, a
 * template's parts), or in a string literal written into any other `error` on the edge. A value handed on is not
 * written here: a provider's message, a module's own `{ error }` built from one (a sweep's tick, a run's context),
 * a log line's `error`, are words, and a door that answers them puts them in `detail`. Measured on the syntax tree,
 * never the text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../_ast.mjs";
import { EDGE_ERROR_CODES } from "../../../../packages/contracts/src/shared/edge-errors.ts";

const TREE = "apps/edge";
/** A code: lower-case words joined by underscores, domain first (`line_retry_taken`), never a sentence. */
const CODE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** The expression under parentheses, `as`, `satisfies` and `!`: what the value is, not how it is typed. */
function bare(e) {
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e))
  )
    e = e.expression;
  return e;
}

/** `a ?? b` and `a || b`: a value handed on, with what it falls back to. */
const isFallback = (x) =>
  ts.isBinaryExpression(x) &&
  (x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || x.operatorToken.kind === ts.SyntaxKind.BarBarToken);

/**
 * The strings an expression is written as here: a literal; with `templates`, each part of a template; a conditional's
 * branches; with `fallbacks`, each side of `??` and `||`. A part that is none of these (`r.error`) is a value handed
 * on, typed where it is built and held by tsc at the answer.
 */
function texts(e, opts) {
  const x = bare(e);
  if (!x) return [];
  if (ts.isStringLiteralLike(x)) return [x.text];
  if (opts.templates && ts.isTemplateExpression(x)) return [x.head.text, ...x.templateSpans.map((s) => s.literal.text)];
  if (ts.isConditionalExpression(x)) return [...texts(x.whenTrue, opts), ...texts(x.whenFalse, opts)];
  if (opts.fallbacks && isFallback(x)) return [...texts(x.left, opts), ...texts(x.right, opts)];
  return [];
}

/** The codes a refusal can answer as written: its literals, a fallback's included (`again.error ?? "resubmit_failed"`). */
const codeLiterals = (e) => texts(e, { templates: false, fallbacks: true });
/**
 * What a refusal spells into its `error`, templates included. Not a fallback behind a value handed on (Meta's
 * `body.error?.message ?? \`HTTP ${status}\``): those are a provider's words, which the door that answers them puts in
 * `detail`, and their fallback is words of the same kind.
 */
const spelledTexts = (e) => texts(e, { templates: true, fallbacks: false });
/** What any other `error` spells: its string literals (a log line's `error` hands on a message, and is words). */
const plainTexts = (e) => texts(e, { templates: false, fallbacks: false });

/** A template's shape as a pattern for the codes it can spell (`token_${v.reason}` is /^token_[a-z0-9_]+$/), or null. */
function familyOf(e) {
  const x = bare(e);
  if (!x || !ts.isTemplateExpression(x)) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = [esc(x.head.text), ...x.templateSpans.map((s) => `[a-z0-9_]+${esc(s.literal.text)}`)];
  return new RegExp(`^${parts.join("")}$`);
}

const propName = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);

/** One pass over the edge: every refusal, every `error` a value is written into, and every string spelled. */
function measure() {
  const refusals = [];
  const errors = [];
  const spelled = new Set();
  const families = [];
  for (const file of repoFiles([TREE], { keep: /\.ts$/ })) {
    const sf = parse(file);
    const at = (n) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const visit = (n) => {
      if (ts.isStringLiteralLike(n)) spelled.add(n.text);
      if (ts.isObjectLiteralExpression(n)) {
        let refused = false;
        let error = null;
        let errorAt = null;
        for (const p of n.properties) {
          const name = propName(p);
          if (ts.isPropertyAssignment(p) && name === "ok" && bare(p.initializer)?.kind === ts.SyntaxKind.FalseKeyword)
            refused = true;
          if (ts.isPropertyAssignment(p) && name === "error") {
            error = p.initializer;
            errorAt = at(p);
          } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === "error") error = p.name;
        }
        if (refused && error) refusals.push({ at: at(n), codes: codeLiterals(error), family: familyOf(error) });
        // A refusal's every spelled part; any other `error`'s string literals.
        if (errorAt) errors.push({ at: errorAt, texts: refused ? spelledTexts(error) : plainTexts(error) });
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "refuse") {
        const code = n.arguments[1];
        refusals.push({ at: at(n), codes: codeLiterals(code), family: familyOf(code), viaRefuse: true });
        errors.push({ at: at(n), texts: spelledTexts(code) });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  for (const r of refusals) if (r.family) families.push(r.family);
  return { refusals, errors, spelled, families };
}

const { refusals, errors, spelled, families } = measure();
const declared = new Set(EDGE_ERROR_CODES);

test("the set names each code once, in order, each a code and not a sentence", () => {
  assert.deepEqual(
    [...EDGE_ERROR_CODES],
    [...declared].sort(),
    "sorted and unique: two changes adding a code each touch different lines",
  );
  const bad = EDGE_ERROR_CODES.filter((c) => !CODE.test(c));
  assert.deepEqual(bad, [], "a code is snake_case, domain first: the words go in `detail`");
});

test("every refusal on the edge answers a code in EDGE_ERROR_CODES", () => {
  assert.ok(refusals.length >= 250, `the measure saw ${refusals.length} refusals; the edge answers more than that`);
  const undeclared = [];
  for (const r of refusals) for (const code of r.codes) if (!declared.has(code)) undeclared.push(`${code} <- ${r.at}`);
  assert.deepEqual(
    undeclared,
    [],
    "answered but not in EDGE_ERROR_CODES: reuse a code that says it, or add one (snake_case, domain first) and put the words in `detail`",
  );
  assert.ok(
    refusals.some((r) => r.viaRefuse),
    "the measure sees refuse(status, code, detail?), the edge's one way to refuse",
  );
});

test("every code in EDGE_ERROR_CODES is answered somewhere", () => {
  // A code handed on from a module's result is spelled where that result is built; a family's members by its template.
  const dead = EDGE_ERROR_CODES.filter((code) => !spelled.has(code) && !families.some((f) => f.test(code)));
  assert.deepEqual(
    dead,
    [],
    "declared but nothing on the edge answers it: delete it, or teach this test the shape that does",
  );
});

test("no error on the edge is a sentence: the words ride in detail", () => {
  assert.ok(errors.length >= 300, `the measure saw ${errors.length} errors; the edge writes more than that`);
  const sentences = [];
  for (const e of errors) for (const t of e.texts) if (/\s/.test(t)) sentences.push(`${JSON.stringify(t)} <- ${e.at}`);
  assert.deepEqual(
    sentences,
    [],
    "an `error` is a code a caller can compare; a sentence for a person or for support goes in `detail`",
  );
});
