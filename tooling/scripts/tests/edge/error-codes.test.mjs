/**
 * The edge's refusals are a closed set, EDGE_ERROR_CODES (packages/contracts/src/shared/edge-errors.ts), the way its
 * log names are LOG_EVENTS (log-events.test.mjs): every code a refusal answers in `error` is declared, every declared
 * code is answered by a refusal, and no `error` is a sentence. A refusal's words ride in `detail`.
 *
 * `json` and `refuse` (apps/edge/lib/http.ts) take a body whose `error` is an `EdgeErrorCode`, so tsc refuses a code
 * outside the set wherever a door answers, and a value handed on from a module's result has to be typed as one to
 * reach an answer at all. This holds what the types cannot: a refusal a module returns before any door answers it, a
 * code the set declares and no refusal answers, a code handed on that nothing names (a cast to the type compiles),
 * and a sentence written into an `error`.
 *
 * A refusal is an object literal with `ok: false` and an `error`, a call `refuse(status, code, detail?)`, or
 * sending-domains' `say(status, code, message)`. Its codes are the string literals its code is written as (a
 * conditional's branches, a fallback's), and only these count as answering a declared code. A code that is not a
 * literal is a value handed on, named in FORWARDED: a code typed `EdgeErrorCode` where it is built (`r.error`, the
 * family `token_${v.reason}`, whose members are the reasons its verifier refuses a token with), or a result's words
 * that a door answers only in `detail`. What has a refusal's shape and is no door's answer is named in NOT_ANSWERS,
 * and not measured.
 *
 * A sentence is any whitespace in what a refusal writes into `error` (a literal, a template's parts), or in a string
 * literal written into any other `error` on the edge: a provider's message, a module's own `{ error }` built from one
 * (a sweep's tick, a run's context), a log line's `error`, are words, and a door that answers them puts them in
 * `detail`. Measured on the syntax tree, never the text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../_ast.mjs";
import { EDGE_ERROR_CODES } from "../../../../packages/contracts/src/shared/edge-errors.ts";

const TREE = "apps/edge";
/** A code: snake_case, lower-case words joined by underscores (`line_retry_taken`), never a sentence. */
const CODE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** The calls that refuse, and where each is spelled: `refuse` anywhere on the edge, `say` in sending-domains only. */
const BUILDERS = new Map([
  ["refuse", null],
  ["say", "apps/edge/lib/email/sending-domains.ts"],
]);

/**
 * The refusals whose code is not a literal, by file, as it is written: a code handed on, typed `EdgeErrorCode` where
 * it is built so tsc holds it there (its literals count where they are written), or a result's words, a provider's
 * or a check's, which reach a door only in `detail` or nested in its answer (tsc refuses a body whose `error` is a
 * `string`). A new one is a literal instead, or a value typed where it is built and named here.
 */
const FORWARDED = {
  // A case's result, nested in the answer's `results`: the model's failure, in its words.
  "apps/edge/api/admin/eval.ts": ["String(e instanceof Error ? e.message : e).slice(0, 200)"],
  "apps/edge/api/admin/llm.ts": ["v.error"], // validateGatewayRequest's (ask-gateway.ts)
  "apps/edge/lib/admin-auth.ts": ["`token_${v.reason}`"], // the token family (TOKEN, below)
  "apps/edge/lib/email/sending-domains.ts": ["error"], // say()'s code
  // connectAnswer's, chosenLocation's and bindFailedAnswer's, from profile-connection.ts
  "apps/edge/lib/google/google-ops.ts": ["r.error", "r.error", "bound.error"],
  "apps/edge/lib/google/listing-check.ts": ["error"], // a listing's read (CheckResult): Google's words
  "apps/edge/lib/google/profile-connection.ts": ["bound.error"], // bindLocation's
  "apps/edge/lib/google/profile-sync.ts": ["error"], // a sync's read (CheckResult): Google's words, or the token's
  "apps/edge/lib/google/review-answers.ts": ["d.error"], // the draft's
  "apps/edge/lib/http.ts": ["code", "code"], // refuse(), the envelope itself
  "apps/edge/lib/lines/a2p-sync.ts": ["fresh.error"], // refreshLineToken's (sms.ts)
  // releaseLine's (line-release.ts), and the refile steps' (a2p-refile.ts) behind this door's own fallbacks
  "apps/edge/lib/lines/line-ops.ts": [
    "r.error",
    'again.error ?? "record_incomplete"',
    'again.error ?? "resubmit_failed"',
    'off.error ?? "record_incomplete"',
    'off.error ?? (takeOff === "replace" ? "replace_failed" : "unfile_failed")',
  ],
  // The database's words, for a log and the job ledger (a resume's count) or for `detail` (a release's routing rows).
  "apps/edge/lib/lines/line-resume.ts": ["error.message"],
  "apps/edge/lib/lines/lines.ts": ["error"],
  // Meta's own answers, in Meta's words: a door answers its code with them in `detail`.
  "apps/edge/lib/whatsapp/meta-graph.ts": [
    "e instanceof Error ? e.message : String(e)",
    "body.error?.message ?? `graph ${res.status}`",
  ],
  "apps/edge/lib/whatsapp/meta-templates.ts": [
    "e instanceof Error ? e.message : String(e)",
    "body?.error?.message ?? `HTTP ${res.status}`",
    "e instanceof Error ? e.message : String(e)",
    "body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${res.status}`",
    "e instanceof Error ? e.message : String(e)",
    "body?.error?.message ?? `HTTP ${res.status}`",
  ],
};

/**
 * What has a refusal's shape and is no door's answer, by file, as its `error` is written: nothing compares it as a
 * code, so its `error` keeps its words. A new one is a refusal, or is named here with why no door answers it.
 */
const NOT_ANSWERS = {
  // The provision job's outcome, the job ledger's alone: packages/jobs writes a stopped run's `error` into its message.
  "apps/edge/lib/lines/line-provision-job.ts": [
    '"no_line_provider"',
    '!apiKey ? "no_provider_key" : "no_fn_secret"',
    '"no such workspace"',
    '"automatic resumes exhausted; a person retries it from Setup"',
    "`counting the automatic resume: ${counted.error}`",
    "r.error",
  ],
  // Meta's answer stood in for a template never synced: a 404, which the door reads as a delete already done.
  "apps/edge/api/admin/whatsapp/templates-delete.ts": ['"not synced: no template id on file, so Meta was not asked"'],
};

/**
 * The one family of codes: an edge token's refusal (apps/edge/lib/admin-auth.ts) is `token_${v.reason}`, over the
 * reasons the verifier refuses a token with. tsc holds each member to the set at the refusal; while it stands, each
 * member is answered.
 */
const TOKEN = { head: "token_", verifier: "packages/channels/src/edge-token.ts" };

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

/** A conditional's two branches, or a fallback's two sides; else null. */
const sidesOf = (x) =>
  ts.isConditionalExpression(x) ? [x.whenTrue, x.whenFalse] : isFallback(x) ? [x.left, x.right] : null;

/**
 * The codes a refusal's code is written as: its string literals, through conditionals and fallbacks; `handed` when a
 * part is not one (a value handed on, a template, whose head is kept), which FORWARDED names.
 */
function codeParts(e) {
  const x = bare(e);
  if (!x) return { codes: [], handed: true, head: null };
  if (ts.isStringLiteralLike(x)) return { codes: [x.text], handed: false };
  const sides = sidesOf(x);
  if (!sides) return { codes: [], handed: true, head: ts.isTemplateExpression(x) ? x.head.text : null };
  const [a, b] = sides.map(codeParts);
  return { codes: [...a.codes, ...b.codes], handed: a.handed || b.handed };
}

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

/**
 * What a refusal spells into its `error`, templates included. Not a fallback behind a value handed on (Meta's
 * `body.error?.message ?? \`HTTP ${status}\``): those are a provider's words, which the door that answers them puts in
 * `detail`, and their fallback is words of the same kind.
 */
const spelledTexts = (e) => texts(e, { templates: true, fallbacks: false });
/** What any other `error` spells: its string literals (a log line's `error` hands on a message, and is words). */
const plainTexts = (e) => texts(e, { templates: false, fallbacks: false });

const propName = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);
/** An expression as written, on one line: what FORWARDED and NOT_ANSWERS name. */
const written = (e, sf) => e.getText(sf).replace(/\s+/g, " ");

/** One pass over the edge: every refusal, every `error` a value is written into, and what NOT_ANSWERS names. */
function measure() {
  const refusals = [];
  const errors = [];
  const notAnswers = {};
  for (const file of repoFiles([TREE], { keep: /\.ts$/ })) {
    const sf = parse(file);
    const at = (n) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const refusal = (n, code, via) =>
      refusals.push({ file, at: at(n), via, text: code ? written(code, sf) : "(none)", ...codeParts(code) });
    const visit = (n) => {
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
        const named = refused && error && NOT_ANSWERS[file]?.includes(written(error, sf));
        if (named) (notAnswers[file] ??= []).push(written(error, sf));
        else {
          if (refused && error) refusal(n, error, "literal");
          // A refusal's every spelled part; any other `error`'s string literals.
          if (errorAt) errors.push({ at: errorAt, texts: refused ? spelledTexts(error) : plainTexts(error) });
        }
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && BUILDERS.has(n.expression.text)) {
        const only = BUILDERS.get(n.expression.text);
        if (only === null || only === file) {
          const code = n.arguments[1];
          refusal(n, code, n.expression.text);
          errors.push({ at: at(n), texts: spelledTexts(code) });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { refusals, errors, notAnswers };
}

/** The token family's members: `token_` and each reason the verifier refuses a token with. */
function tokenFamily() {
  const reasons = new Set();
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && propName(n) === "reason" && ts.isStringLiteralLike(n.initializer))
      reasons.add(n.initializer.text);
    ts.forEachChild(n, visit);
  };
  visit(parse(TOKEN.verifier));
  return [...reasons].map((r) => `${TOKEN.head}${r}`);
}

const { refusals, errors, notAnswers } = measure();
const declared = new Set(EDGE_ERROR_CODES);

test("the set names each code once, in order, each a code and not a sentence", () => {
  assert.deepEqual(
    [...EDGE_ERROR_CODES],
    [...declared].sort(),
    "sorted and unique: two changes adding a code each touch different lines",
  );
  const bad = EDGE_ERROR_CODES.filter((c) => !CODE.test(c));
  assert.deepEqual(bad, [], "a code is snake_case: the words go in `detail`");
});

test("every refusal on the edge answers a code in EDGE_ERROR_CODES, with a literal", () => {
  assert.ok(refusals.length >= 250, `the measure saw ${refusals.length} refusals; the edge answers more than that`);
  const undeclared = [];
  for (const r of refusals) for (const code of r.codes) if (!declared.has(code)) undeclared.push(`${code} <- ${r.at}`);
  assert.deepEqual(
    undeclared,
    [],
    "answered but not in EDGE_ERROR_CODES: reuse a code that says it, or add one (snake_case) and put the words in `detail`",
  );
  assert.ok(
    refusals.some((r) => r.via === "refuse") && refusals.some((r) => r.via === "say"),
    "the measure sees refuse(status, code, detail?), the edge's one way to refuse, and sending-domains' say()",
  );

  const forwarded = {};
  for (const r of refusals.filter((x) => x.handed)) (forwarded[r.file] ??= []).push(r.text);
  assert.deepEqual(
    forwarded,
    FORWARDED,
    "a refusal whose code is not a literal: write the literal, or type the value EdgeErrorCode and name it in FORWARDED",
  );
  assert.deepEqual(notAnswers, NOT_ANSWERS, "NOT_ANSWERS names what the edge has, as often as it has it");
});

test("every code in EDGE_ERROR_CODES is answered by a refusal", () => {
  // A literal in a refusal's code, a fallback's included; the token family's members while its refusal stands.
  const answered = new Set(refusals.flatMap((r) => r.codes));
  if (refusals.some((r) => r.head === TOKEN.head)) for (const code of tokenFamily()) answered.add(code);
  const dead = EDGE_ERROR_CODES.filter((code) => !answered.has(code));
  assert.deepEqual(dead, [], "declared but no refusal on the edge answers it: delete it, or write the refusal");
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
