/**
 * How names read, measured from the syntax tree: what docs/naming.md asks, as numbers check:debt holds (NAME_RATCHETS,
 * joined to tests/_measures.mjs's RATCHETS). Each may only fall. names-measures.test.mjs holds what each one counts, on
 * sources written for it.
 *
 * The bar was set on 6 November 2026 against eight production monorepos (cal.com, documenso, dub, formbricks, langfuse,
 * midday, trigger.dev, unkey), decision 0105. Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";
import { ROOT } from "../../_source.mjs";

/** The hand-written TypeScript that ships. A test, a type test and what a script writes are not held. */
const SHIPPED = repoFiles(["apps", "packages"], { keep: /\.tsx?$/ }).filter(
  (f) => !/\.test\.|\.type-test\.|(^|\/)test\/|^packages\/[^/]+\/(?!src\/)/.test(f),
);

/** How far a short name may reach: Google's TypeScript guide's ten lines, and docs/naming.md's. */
export const SHORT_SCOPE_LINES = 10;
/** A coordinate's own names: the one place a one-letter property says what it holds. */
const COORDINATES = new Set(["x", "y"]);
/** What a framework names for its file: a route's verbs and Next's route settings. */
const FRAMEWORK_NAMES = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "maxDuration",
  "dynamic",
  "runtime",
  "revalidate",
  "config",
  "metadata",
  "viewport",
  "generateMetadata",
  "generateStaticParams",
]);
/** A file name that says nothing of what is in it. `types`, and the roles a folder repeats, do (docs/naming.md). */
const GENERIC_STEMS = new Set([
  "util",
  "utils",
  "helper",
  "helpers",
  "common",
  "misc",
  "constant",
  "constants",
  "shared",
  "lib",
  "stuff",
]);
/** A value named for what happened to it or for the question it answers, rather than for what it holds. */
const VALUE_WORDS = new Set([
  "said",
  "why",
  "who",
  "what",
  "asked",
  "told",
  "made",
  "got",
  "went",
  "came",
  "gave",
  "whose",
]);

/**
 * The words a function's name may start with when it reaches outside: the general ones and the product's own actions. A
 * product verb that is not here is added here, in the change that first needs it; a noun never is.
 */
export const VERBS = new Set(
  `get set create update delete remove add find fetch load save send build make parse format validate check is has can should
  handle use run start stop read write list map to from ensure assert verify compute calculate resolve normalize render apply
  init register process sync merge filter sort group convert transform clear reset mark open close log emit publish subscribe
  schedule retry claim cancel approve reject invite accept connect disconnect upload download import export insert upsert select
  query count sum track record notify dispatch enqueue dequeue wait sign hash encode decode encrypt decrypt generate extract
  strip trim split join wrap unwrap with without pick omit keep take give tell say ask draw begin end do try on as define
  configure setup test mock require restore refresh invalidate lookup search replace rename move copy clone serialize deserialize
  sanitize escape truncate compare collect prepare complete finish execute trigger invoke call pull push stream flush drain
  reply draft note receive change answer release stamp forget resume hand erase settle watch undo drop post plan judge put offer
  leave pause link unlink report review decline withdraw hold ingest scrub fail follow rewrite resend provision suggest queue
  dismiss refuse discard archive patch append decide recheck submit freeze whisper steer choose sweep assign bulk deploy install
  enable disable revoke grant consume rotate charge confirm activate deactivate retrieve persist reconcile rollback remember
  attach detach purge paginate broadcast exchange renew authenticate authorize login logout redirect respond ping poll batch
  deliver snooze wake mint alert speak bring bind flag mend tend probe earn ring store replan replay reverse resubmit unfile unpost evaluate converge raise rejudge assemble adopt reserve relay become suppress request requeue defer wear see learn craft compose translate aim pass return touch route warm view unsubscribe edit may look let mail shape preview file page act was does redrive step tick holds
  hear listen transcribe digest play exclude reclaim reread swap finalize remind`.split(/\s+/),
);

/** A name's words, in either casing. */
export const wordsOf = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_$-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);

const hasExport = (n) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const isAsync = (fn) =>
  ts.canHaveModifiers(fn) && (ts.getModifiers(fn) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
const isFnValue = (n) => Boolean(n) && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

/** Each function a module exports by name at its top level: `{ name, fn }`. */
function exportedFunctions(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (!hasExport(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name) out.push({ name: st.name.text, fn: st });
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && isFnValue(d.initializer)) out.push({ name: d.name.text, fn: d.initializer });
  }
  return out;
}

/** The members of a type declared as an interface or a literal, those with a plain name. */
function propertiesOf(decl) {
  const members = ts.isInterfaceDeclaration(decl)
    ? decl.members
    : decl.type && ts.isTypeLiteralNode(decl.type)
      ? decl.type.members
      : [];
  return [...members].filter((m) => ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name));
}

const spanOf = (sf, node) =>
  sf.getLineAndCharacterOfPosition(node.getEnd()).line - sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** The node a declared name is alive in: a catch, a loop, its function, or the nearest block. */
function scopeOf(decl) {
  if (ts.isParameter(decl)) return decl.parent;
  if (ts.isCatchClause(decl.parent)) return decl.parent;
  const list = decl.parent;
  if (ts.isVariableDeclarationList(list)) {
    const owner = list.parent;
    if (ts.isForStatement(owner) || ts.isForOfStatement(owner) || ts.isForInStatement(owner)) return owner;
  }
  let at = decl.parent;
  while (at && !ts.isBlock(at) && !ts.isSourceFile(at) && !ts.isModuleBlock(at) && !ts.isCaseClause(at)) at = at.parent;
  return at;
}

const inFunction = (node) => {
  for (let at = node.parent; at; at = at.parent) if (ts.isFunctionLike(at)) return true;
  return false;
};

/**
 * One-letter names: `api` in an exported function's parameters, among a module's exports and in an exported type's
 * properties; `capital` as a local or a parameter, whatever its scope (an alias: `const L = logger()`); `long` any other
 * in a scope over ten lines. A type's parameter and a type signature's are documentation, and are not read.
 */
export function shortNamesIn(sf) {
  const out = { api: 0, long: 0, capital: 0 };
  const exportedFns = new Set(exportedFunctions(sf).map((e) => e.fn));
  for (const st of sf.statements) {
    if (!hasExport(st)) continue;
    if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st)) &&
      st.name?.text.length === 1
    )
      out.api += 1;
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text.length === 1) out.api += 1;
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st))
      for (const p of propertiesOf(st)) if (p.name.text.length === 1 && !COORDINATES.has(p.name.text)) out.api += 1;
  }
  const walk = (node) => {
    const isName =
      (ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text.length === 1;
    if (
      isName &&
      !ts.isFunctionTypeNode(node.parent) &&
      !ts.isMethodSignature(node.parent) &&
      !ts.isConstructorTypeNode(node.parent) &&
      !ts.isCallSignatureDeclaration(node.parent)
    ) {
      const isFnName = ts.isVariableDeclaration(node) && isFnValue(node.initializer);
      if (ts.isParameter(node) && exportedFns.has(node.parent)) out.api += 1;
      else if (!isFnName && (ts.isParameter(node) || inFunction(node))) {
        if (/[A-Z]/.test(node.name.text)) out.capital += 1;
        else {
          const scope = scopeOf(node);
          if (scope && spanOf(sf, scope) > SHORT_SCOPE_LINES) out.long += 1;
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/** The exported functions that reach outside (async, or typed as a promise) and do not start with a verb. */
export function asyncNounsIn(sf) {
  return exportedFunctions(sf)
    .filter(({ fn }) => isAsync(fn) || (fn.type && /^Promise</.test(fn.type.getText(sf))))
    .filter(({ name }) => !FRAMEWORK_NAMES.has(name) && !/^[A-Z]/.test(name))
    .filter(({ name }) => !VERBS.has(wordsOf(name)[0] ?? ""))
    .map(({ name }) => name);
}

/** Locals and parameters named for what happened to a value (`said`, `why`), by their whole name. */
export function valueNamesIn(sf) {
  let n = 0;
  const walk = (node) => {
    if (
      (ts.isParameter(node) || (ts.isVariableDeclaration(node) && !isFnValue(node.initializer))) &&
      ts.isIdentifier(node.name) &&
      VALUE_WORDS.has(node.name.text) &&
      !ts.isFunctionTypeNode(node.parent) &&
      !ts.isMethodSignature(node.parent)
    )
      n += 1;
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
}

const SNAKE_SIDE = new Set(["Row", "Dto", "Body"]);
const isSnake = (s) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(s);
const isCamel = (s) => /^[a-z]+[a-z0-9]*[A-Z]/.test(s);

/** `{ type: fields }` for each type whose suffix says one side and whose fields say the other (docs/naming.md). */
export function mixedSidesIn(sf) {
  const out = {};
  const walk = (node) => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
      const side = /(Row|Dto|Body|VM|Command|Ports|Context)$/.exec(node.name.text)?.[1];
      if (side) {
        const wrong = propertiesOf(node).filter((p) =>
          SNAKE_SIDE.has(side) ? isCamel(p.name.text) : isSnake(p.name.text),
        );
        if (wrong.length) out[node.name.text] = wrong.length;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/** The property names of a module that break the boolean rule: said with `is_`, or also a count or a record in it. */
export function booleanClashesIn(sf) {
  const kinds = new Map();
  const walk = (node) => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))
      for (const p of propertiesOf(node)) {
        const t = p.type;
        if (!t) continue;
        const kind =
          t.kind === ts.SyntaxKind.BooleanKeyword
            ? "boolean"
            : t.kind === ts.SyntaxKind.NumberKeyword || ts.isTypeReferenceNode(t) || ts.isTypeLiteralNode(t)
              ? "other"
              : null;
        if (!kind) continue;
        if (!kinds.has(p.name.text)) kinds.set(p.name.text, new Set());
        kinds.get(p.name.text).add(kind);
      }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return [...kinds]
    .filter(([name, set]) => set.has("boolean") && (set.has("other") || /^is_/.test(name)))
    .map(([name]) => name)
    .sort();
}

/** A folder's word for one of what it holds: `leads` is `lead`, `replies` is `reply`, `mailbox` has none. */
const singularOf = (word) =>
  /ies$/.test(word)
    ? `${word.slice(0, -3)}y`
    : /(ch|sh|x|ss)es$/.test(word)
      ? word.slice(0, -2)
      : /s$/.test(word)
        ? word.slice(0, -1)
        : null;

/**
 * A file whose name starts with its folder's, or with the singular of it (`mailbox/mailbox-gmail.ts`, `leads/dtos.ts`). A folder's
 * main module may share the name, as Go's `ring/ring.go` does.
 */
export function repeatsItsFolder(file) {
  const parts = file.split("/");
  const folder = parts.at(-2) ?? "";
  const stem = (parts.at(-1) ?? "").replace(/\.[^/]+$/, "");
  return stem.startsWith(`${folder}-`) || Boolean(singularOf(folder) && stem.startsWith(`${singularOf(folder)}-`));
}

export const isGenericStem = (stem) => GENERIC_STEMS.has(stem);

/** What a module exports by name at its top level, a framework's own names left out. */
export function exportedNamesIn(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (!hasExport(st)) continue;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push(d.name.text);
    } else if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st)) &&
      st.name
    )
      out.push(st.name.text);
  }
  return out.filter((n) => !FRAMEWORK_NAMES.has(n));
}

/** A package or an app: what a name's reader imports it from. */
export const treeOf = (file) => file.split("/").slice(0, 2).join("/");

/** The words of every name a module declares, each counted once per name. */
function countWordsIn(sf, counts) {
  const walk = (node) => {
    const named =
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isParameter(node)) &&
      node.name &&
      ts.isIdentifier(node.name);
    if (named) for (const w of new Set(wordsOf(node.name.text))) if (w.length > 2) counts[w] = (counts[w] ?? 0) + 1;
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

/** `{ word: uses }` for the words used at least `least` times that the glossary does not define and no one calls plain. */
export function undefinedWords(counts, glossary, plain, least) {
  const text = glossary.toLowerCase();
  const defined = (w) => {
    const word = `${w.replace(/(es|s)$/, "")}(s|es)?`;
    return new RegExp(`\\*\\*[^*\\n]*\\b${word}\\b[^*\\n]*\\*\\*|\`${word}\``).test(text);
  };
  return Object.fromEntries(Object.entries(counts).filter(([w, n]) => n >= least && !plain.has(w) && !defined(w)));
}

/** A word used this often is one a newcomer has to know: the glossary says what it means, or it is plain English. */
export const WIDE_USE = 100;
const PLAIN_WORDS = path.join(ROOT, "tests/repo/names/plain-words.json");
const plainWords = () => new Set(JSON.parse(fs.readFileSync(PLAIN_WORDS, "utf8")));

/** `{ file: n }` for each shipped file `count` puts over zero. */
const perFile = (count) => Object.fromEntries(SHIPPED.map((f) => [f, count(parse(f))]).filter(([, n]) => n > 0));

export const NAME_RATCHETS = [
  {
    name: "one-letter names outside a short scope",
    file: "short-names.json",
    measure: () => {
      const out = {};
      for (const f of SHIPPED) {
        const { api, long, capital } = shortNamesIn(parse(f));
        if (api) out[`${f}::api`] = api;
        if (long) out[`${f}::long`] = long;
        if (capital) out[`${f}::capital`] = capital;
      }
      return out;
    },
    advice:
      "Name it for what it holds. A one-letter name is fine in a scope of ten lines or fewer, never in an API (a parameter of an exported function, an exported name, a property), and never as a capital alias: `log`, not `L` (docs/naming.md).",
  },
  {
    name: "functions that reach outside and do not start with a verb",
    file: "async-verb-first.json",
    measure: () => perFile((sf) => asyncNounsIn(sf).length),
    advice:
      "A function that reaches outside starts with its verb, so a reader can tell a database call from a pure helper: `list` for many, `find` for one or null, `get` for one or it throws, or the product's own action. A product verb the list lacks joins VERBS in tests/repo/names/_names.mjs (docs/naming.md).",
  },
  {
    name: "values named for what happened to them",
    file: "value-names.json",
    measure: () => perFile(valueNamesIn),
    advice:
      "A value is named for what it holds: `reason`, not `why`; `recipient`, not `who`; `sentence`, not `said` (docs/naming.md).",
  },
  {
    name: "files that repeat their folder",
    file: "file-repeats-folder.json",
    measure: () => Object.fromEntries(SHIPPED.filter(repeatsItsFolder).map((f) => [f, 1])),
    advice: "The folder already says it: `mailbox/gmail.ts`, not `mailbox/mailbox-gmail.ts` (docs/naming.md).",
  },
  {
    name: "types whose suffix says one side and whose fields the other",
    file: "type-casing.json",
    measure: () => {
      const out = {};
      for (const f of SHIPPED) for (const [type, n] of Object.entries(mixedSidesIn(parse(f)))) out[`${f}::${type}`] = n;
      return out;
    },
    advice:
      "`…Row`, `…Dto` and `…Body` are snake_case, `…VM`, `…Command`, `…Ports` and `…Context` camelCase, and a line on a page is a `…Line`, not a `…Row` (docs/naming.md). A `…Dto` that says camelCase is on the wire, and moves with its domain (wire-casing).",
  },
  {
    name: "booleans said with is_, or sharing a name with a count or a record",
    file: "boolean-names.json",
    measure: () => {
      const out = {};
      for (const f of SHIPPED) for (const name of booleanClashesIn(parse(f))) out[`${f}::${name}`] = 1;
      return out;
    },
    advice:
      "A boolean is a state or a question (`paid`, `archived`, `can_connect`), with no `is_`, and never shares its name with a count or a record (docs/naming.md).",
  },
  {
    name: "an exported name declared twice inside one tree",
    file: "exported-twice.json",
    measure: () => {
      const modules = {};
      for (const f of SHIPPED.filter((x) => !/\.(ios|android|native|web)\.tsx?$/.test(x)))
        for (const name of new Set(exportedNamesIn(parse(f)))) (modules[`${treeOf(f)}::${name}`] ??= new Set()).add(f);
      return Object.fromEntries(
        Object.entries(modules)
          .filter(([, set]) => set.size > 1)
          .map(([k, set]) => [k, set.size]),
      );
    },
    advice:
      "One name, one thing, inside a package or an app. Say which thing each is, or make them one (docs/naming.md).",
  },
  {
    name: "words used widely that the glossary does not define",
    file: "house-words.json",
    mode: "set",
    measure: () => {
      const counts = {};
      for (const f of SHIPPED) countWordsIn(parse(f), counts);
      return undefinedWords(
        counts,
        fs.readFileSync(path.join(ROOT, "docs/glossary.md"), "utf8"),
        plainWords(),
        WIDE_USE,
      );
    },
    advice: `A word in ${WIDE_USE} names is one a newcomer has to learn: give it a row in docs/glossary.md, with the term other codebases use, or add it to tests/repo/names/plain-words.json if it is plain English.`,
  },
];
