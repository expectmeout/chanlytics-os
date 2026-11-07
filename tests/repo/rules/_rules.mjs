/**
 * Whether a rule is said once: a function the same as another but for its names, a sentence in several modules, a call to the outside past a client, and the patterns that say what an id, a day
 * or a number looks like. The numbers check:debt holds (RULE_RATCHETS) and the homes rules.test.mjs holds outright (decision 0108).
 */
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";
import { backendModules, browserModules } from "../size/_size.mjs";

/** Shorter than this, two functions agree by chance: a guard, a getter. */
const MIN_FUNCTION_TOKENS = 40;
/** Shorter than this, a string is a label, not something said. */
const MIN_SENTENCE = 40;

/** A rule's pattern, by what it says and where it lives. The flags are the reader's: a copy with other flags is still a copy. */
export const RULE_PATTERNS = [
  {
    rule: "what an id looks like",
    home: "packages/contracts/src/shared/identity.ts",
    sources: ["^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "^[0-9a-f-]{36}$"],
  },
  {
    rule: "what a workspace's address looks like",
    home: "packages/contracts/src/shared/identity.ts",
    sources: ["^[a-z0-9][a-z0-9-]{0,62}$"],
  },
  {
    rule: "what a day key looks like",
    home: "packages/contracts/src/shared/zone/day-keys.ts",
    sources: ["^\\d{4}-\\d{2}-\\d{2}$"],
  },
  {
    rule: "what a template's numbered slot looks like",
    home: "packages/contracts/src/shared/words.ts",
    sources: ["\\{\\{(\\d+)\\}\\}"],
  },
  {
    rule: "what may not ride into a prompt unseen",
    home: "packages/contracts/src/shared/words.ts",
    sources: ["[\\p{Cc}\\p{Cf}]"],
  },
  {
    rule: "what a phone number looks like",
    home: "packages/contracts/src/shared/phone.ts",
    sources: ["^\\+[1-9]\\d{6,14}$", "^\\+[1-9][0-9]{6,14}$"],
  },
  { rule: "what a US area code looks like", home: "packages/contracts/src/shared/phone.ts", sources: ["^\\d{3}$"] },
  { rule: "what a US ZIP looks like", home: "packages/contracts/src/leads/search/caps.ts", sources: ["^\\d{5}$"] },
  {
    rule: "how a database says something is not there",
    home: "packages/db/src/shared/missing-door.ts",
    sources: ["does not exist|could not find"],
  },
];

const isFunction = (n) =>
  ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);
const nameOf = (fn) => {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
    return p.name.text;
  return "(anonymous)";
};

/** A function's tokens, each name by the order it first appears, so the same function under other names reads the same. Literals stay: they are the rule. */
function shapeOf(text, jsx) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    text,
  );
  const seen = new Map();
  const out = [];
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    const word = scanner.getTokenText();
    if (k !== ts.SyntaxKind.Identifier) out.push(word);
    else {
      if (!seen.has(word)) seen.set(word, seen.size);
      out.push(`v${seen.get(word)}`);
    }
  }
  return { shape: out.join(" "), tokens: out.length };
}

/** Each function of a syntax tree long enough to be a copy of something: `{ name, shape }`. */
export function functionsIn(sf) {
  const jsx = sf.fileName.endsWith("x");
  const out = [];
  const walk = (n) => {
    if (isFunction(n) && n.body) {
      const { shape, tokens } = shapeOf(sf.text.slice(n.getStart(sf), n.end), jsx);
      if (tokens >= MIN_FUNCTION_TOKENS) out.push({ name: nameOf(n), shape });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/** The functions the same as another but for their names, each `<file>::<name>`, from `[file, syntax tree]` pairs. */
export function sameFunctions(modules) {
  const byShape = new Map();
  for (const [file, sf] of modules)
    for (const { name, shape } of functionsIn(sf))
      (byShape.get(shape) ?? byShape.set(shape, []).get(shape)).push(`${file}::${name}`);
  const out = {};
  for (const group of byShape.values()) if (group.length > 1) for (const key of group) out[key] = (out[key] ?? 0) + 1;
  return out;
}

/** A run of tokens this long the same as written is a copy, whatever it holds. */
const RUN_TOKENS = 70;

/** A module's tokens past its imports, which repeat by nature. */
function tokensPastImports(sf) {
  const last = sf.statements.filter(ts.isImportDeclaration).at(-1);
  const jsx = sf.fileName.endsWith("x");
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    sf.text,
    undefined,
    last ? last.end : 0,
  );
  const out = [];
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) out.push(scanner.getTokenText());
  return out;
}

/** How many tokens of each module stand in a run an earlier module also holds, from `[file, syntax tree]` pairs. A run is kept as a rolling hash, so the whole backend costs numbers and not its text. */
export function copiedRuns(modules) {
  const P = 67108859;
  const Q = 67108837;
  const BASE = 131;
  let topP = 1;
  let topQ = 1;
  for (let i = 1; i < RUN_TOKENS; i += 1) {
    topP = (topP * BASE) % P;
    topQ = (topQ * BASE) % Q;
  }
  const ids = new Map();
  const seen = new Set();
  const out = {};
  for (const [file, sf] of modules) {
    const tokens = tokensPastImports(sf).map((t) => ids.get(t) ?? ids.set(t, ids.size + 1).get(t));
    const here = [];
    let a = 0;
    let b = 0;
    let covered = 0;
    let until = 0;
    tokens.forEach((id, i) => {
      if (i >= RUN_TOKENS) {
        a = (a + P - ((tokens[i - RUN_TOKENS] * topP) % P)) % P;
        b = (b + Q - ((tokens[i - RUN_TOKENS] * topQ) % Q)) % Q;
      }
      a = (a * BASE + id) % P;
      b = (b * BASE + id) % Q;
      if (i < RUN_TOKENS - 1) return;
      const key = a * 67108864 + b;
      here.push(key);
      if (seen.has(key)) {
        covered += i + 1 - Math.max(i - RUN_TOKENS + 1, until);
        until = i + 1;
      }
    });
    for (const key of here) seen.add(key);
    if (covered) out[file] = covered;
  }
  return out;
}

/** The sentences a syntax tree says: strings long enough, with a space and a lower-case letter; not an import's path or a type. */
export function sentencesIn(sf) {
  const out = new Set();
  const walk = (n) => {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      !ts.isImportDeclaration(n.parent) &&
      !ts.isExportDeclaration(n.parent) &&
      !ts.isLiteralTypeNode(n.parent)
    ) {
      const v = n.text.trim();
      if (v.length >= MIN_SENTENCE && /\s/.test(v) && /[a-z]/.test(v)) out.add(v);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/** Each sentence said in more than one module, with how many, from syntax trees. */
export function repeatedSentences(trees) {
  const modules = new Map();
  for (const sf of trees) for (const v of sentencesIn(sf)) modules.set(v, (modules.get(v) ?? 0) + 1);
  return Object.fromEntries([...modules].filter(([, n]) => n > 1));
}

/** The calls a syntax tree makes to the global `fetch`: a port's or a client's method of that name is not one. */
export function fetchesIn(sf) {
  let n = 0;
  const walk = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === "fetch") n += 1;
      else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "fetch" &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "globalThis"
      )
        n += 1;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
}

/** Where a provider's wire belongs is `packages/channels`; these trees should reach the outside through it or through one client of their own. */
const PAST_A_CLIENT_TREES = [
  "apps/edge/lib",
  "apps/edge/api",
  "apps/dashboard/src/server",
  "apps/dashboard/app/api",
  "packages/core/src",
  "packages/jobs/src",
  "packages/db/src",
];
const NOT = /\.d\.ts$|\.generated\.|database\.types\.ts$|\.type-test\.|(^|\/)test\/|\.test\./;

/** The patterns a syntax tree writes that are some rule's, as `{ rule, written }`. */
export function rulePatternsIn(sf) {
  const out = [];
  const walk = (n) => {
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const written = n.getText(sf);
      const source = written.slice(1, written.lastIndexOf("/"));
      const row = RULE_PATTERNS.find((r) => r.sources.includes(source));
      if (row) out.push({ rule: row.rule, home: row.home, written });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/** Every rule's pattern written anywhere but its home. */
export function patternsOutsideTheirHomes() {
  const out = [];
  for (const f of [...backendModules(), ...browserModules()])
    for (const { rule, home, written } of rulePatternsIn(parse(f)))
      if (home !== f) out.push(`${f}: ${rule}, ${written}`);
  return out;
}

export const RULE_RATCHETS = [
  {
    name: "functions the same as another but for their names",
    file: "same-functions.json",
    measure: () => sameFunctions(backendModules().map((f) => [f, parse(f)])),
    advice:
      "Give the rule one home and import it. Two that only look alike take different names for what differs, or a function over what they share.",
  },
  {
    name: "tokens in a long run copied from another module",
    file: "copied-runs.json",
    measure: () => copiedRuns(backendModules().map((f) => [f, parse(f)])),
    advice:
      "Seventy tokens the same as written is a copy, whatever it holds. Give what they share a home, or say why they differ.",
  },
  {
    name: "sentences said in more than one module",
    file: "repeated-sentences.json",
    measure: () => repeatedSentences(backendModules().map((f) => parse(f))),
    advice:
      "A word a person reads is contracts' (decision 0027), or a words module beside the doors that say it. Name it once and import it.",
  },
  {
    name: "fetch calls past a client",
    file: "fetches-outside-a-client.json",
    measure: () =>
      Object.fromEntries(
        repoFiles(PAST_A_CLIENT_TREES)
          .filter((f) => /\.tsx?$/.test(f) && !NOT.test(f))
          .map((f) => [f, fetchesIn(parse(f))])
          .filter(([, n]) => n > 0),
      ),
    advice:
      "A provider's wire is packages/channels': it owns the timeout, the error and the log line. Layer 12 moves what is left.",
  },
];
