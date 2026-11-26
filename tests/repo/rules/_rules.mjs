/**
 * Whether a rule is said once: a function the same as another but for its names, a sentence in several modules, a call to the outside past a client, a line past the logger, and the patterns that say what an id, a day
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

/** The global object, by each name a module reaches it by: `window.fetch` is the global fetch as `fetch` is. */
const GLOBAL_OBJECTS = new Set(["globalThis", "window", "self"]);

/** Where an identifier named `fetch` is a name and no reach for the global: a member, a key, a declaration, a type. */
function fetchIsAName(id) {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return true;
  if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)) && p.name === id)
    return true;
  if (ts.isMethodSignature(p) || ts.isQualifiedName(p) || ts.isTypeQueryNode(p) || ts.isTypeOfExpression(p))
    return true;
  return (
    (ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isBindingElement(p)) &&
    p.name === id
  );
}

/** Whether a module declares a `fetch` of its own (a parameter, a binding, an import), which its bare `fetch` may be. */
function declaresFetch(sf) {
  let found = false;
  const walk = (node) => {
    if (found) return;
    const name = node.name;
    if (
      name &&
      ts.isIdentifier(name) &&
      name.text === "fetch" &&
      (ts.isParameter(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isImportSpecifier(node))
    )
      found = true;
    else ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

/**
 * Each reach a syntax tree makes for the global `fetch`: a call of it, or the function handed on (`deps.fetch ?? fetch`,
 * `apifyClient(fetch, token)`), by its own name or through the global object (`globalThis.fetch`, `window.fetch`,
 * `self.fetch`). Until 26 Nov 2026 only a bare call or `globalThis.fetch(…)` was counted, so a page's `window.fetch`
 * and a fetch handed to a client went unseen. A port's or a client's method of that name is not one, nor `typeof
 * fetch`, nor, in a module that declares a `fetch` of its own, its bare name (that is the module's).
 */
export function fetchesIn(sf) {
  let n = 0;
  const bareIsGlobal = !declaresFetch(sf);
  const walk = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "fetch" &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text)
    )
      n += 1;
    else if (bareIsGlobal && ts.isIdentifier(node) && node.text === "fetch" && !fetchIsAName(node)) n += 1;
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
}

const NOT = /\.d\.ts$|\.generated\.|database\.types\.ts$|\.type-test\.|(^|\/)test\/|\.test\./;

/**
 * Where a global `fetch` may still be written, each with why (layer 12, 25 Nov 2026). Every other call out leaves through
 * one door: a provider's, the edge's, the dashboard's own and the bucket's through channels' `fetchFromProvider`, a page's
 * through the API client or `client/own-route.ts`, and a client takes the fetch it calls as its dependency. These are
 * not on it. A path names a file, or a whole tree with its trailing slash. (The map's worker, the vendored maplibre file
 * under `apps/dashboard/public`, is a file the browser loads as it is, and no tree read here.)
 */
export const FETCH_EXCEPTIONS = {
  "packages/channels/":
    "the providers' wire: every adapter leaves through fetchFromProvider, and a byte download from a provider's CDN (Retell's recordings, WhatsApp's media) counts toward no provider's breaker",
  "apps/relay/": "a Cloudflare Worker: its own runtime and deploy, which bundles nothing of ours",
  "apps/mobile/":
    "the phone app (paused, 7 Oct 2026): it reads the site's version itself and shares no client with the site",
  "apps/dashboard/src/auth/GoogleSignIn.tsx":
    "a page's read of Supabase's auth settings, as the person: a page's call to the identity store stays in the browser (CLAUDE.md, Where new code goes)",
  "apps/dashboard/src/bridge/api.ts":
    "the API client's transport: every route key a page asks leaves from here on the window's fetch (client/api.ts calls the one it is handed), and the sign-out beside it",
  "apps/dashboard/src/client/own-route.ts":
    "the page's own-route client (decision 0149, rule 4): the one fetch for a route of the dashboard's outside the typed set",
  "apps/dashboard/src/surfaces/files/verbs.ts":
    "a file's bytes, which no JSON client carries: a photo PUT to the bucket at the signed address its route gave, and a kept file read as a blob for a phone's share sheet",
  "apps/dashboard/src/surfaces/files/video/send.ts":
    "a clip's resumable upload, from the browser to Cloudflare Stream at the address its route gave: the bytes never pass a server of ours",
  "packages/db/src/shared/observe.ts":
    "the database client's transport: supabase-js reads PostgREST and auth through it, timed under `db`; db leans on contracts alone (decision 0110), so it cannot reach channels' door, and a read of our own database is no call out",
  "packages/db/src/shared/service-client.ts":
    "the same transport, bounded (boundedFetch): a read of the database stops at its timeout",
};

const excepted = (f) => Object.keys(FETCH_EXCEPTIONS).some((at) => (at.endsWith("/") ? f.startsWith(at) : f === at));

/** Each module of apps and packages that calls the global fetch, by how many calls: past the one door, or excepted. */
export function fetchesBy({ exceptions }) {
  return Object.fromEntries(
    repoFiles(["apps", "packages"])
      .filter((f) => /\.(m?[jt]sx?)$/.test(f) && !NOT.test(f) && excepted(f) === exceptions)
      .map((f) => [f, fetchesIn(parse(f))])
      .filter(([, n]) => n > 0),
  );
}

/** The calls a syntax tree makes to `console`: a line no query can read, where the logger writes one that can. */
export function consoleCallsIn(sf) {
  let n = 0;
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "console"
    )
      n += 1;
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
}

/**
 * The three places a line is written with `console` on purpose, each with why: the logger's own transport, db's stand-in
 * for it before an app hands its logger in, and the browser's one report seam (decision 0151). Every other server and
 * package line goes through the logger (the lint refuses `console` in those trees), every page's through the seam; the
 * phone app's are counted, and wait for the phone app.
 */
export const CONSOLE_SINKS = {
  "packages/log/src/logger.ts":
    "the logger's transport: Vercel keeps stdout per invocation, and the level rides the method",
  "packages/db/src/shared/observe.ts":
    "db's lines before an app hands it the logger (a script, a test of db alone): db leans on contracts alone, so it writes the logger's envelope itself",
  "apps/dashboard/src/client/page-report.ts":
    "the browser's report seam: a page's lines stay in the browser's console, and leave from here alone (decision 0151)",
};

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
    name: "console calls past the logger",
    file: "console-calls.json",
    measure: () =>
      Object.fromEntries(
        repoFiles(["apps", "packages"])
          .filter((f) => /\.(m?[jt]sx?)$/.test(f) && !NOT.test(f) && !(f in CONSOLE_SINKS))
          .map((f) => [f, consoleCallsIn(parse(f))])
          .filter(([, n]) => n > 0),
      ),
    advice:
      "A line is the logger's: log.info|warn|error(name, fields) on the server and in the packages (one JSON object, a name of the closed set). A page's goes through the browser's report seam (apps/dashboard/src/client/page-report.ts pageReport).",
  },
];
