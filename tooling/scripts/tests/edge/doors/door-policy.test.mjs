/**
 * Who may knock on each edge door, as the code declares it: read from the doors' syntax trees, held to one file, as
 * route-policy.json holds the dashboard's routes.
 *
 * A door under apps/edge/api is a wrapper around a handler (`door` and `adminDoor` in apps/edge/lib/log.ts, `sweepDoor`
 * in apps/edge/lib/ops/sweep-door.ts), and what lets a knock in is a check the wrapper or the handler calls: an admin
 * door's authorizeAdmin, with the audience its token must name and what else may open it; a clock's authorizeCron; a
 * provider's signature, checked by the verb the door hands the request to. Each door's file is read as a syntax tree
 * (_ast.mjs, never the text). The wrapper is read first, then the handler, followed to the function it names and into
 * the functions that one calls in the edge's own modules, DEPTH calls deep. Every call of a check in KNOCKS it reaches
 * is kept, in the order the code runs, with the values the door writes at it: the first is the door's knock, and
 * any after it its later knocks. A call is a check only where its name resolves, through the caller's imports, to the
 * module KNOCKS names for it, so a function of the door's own that borrows a check's name is none.
 *
 * What door-policy.json holds is the checks each door reaches, where each is called and what the door hands it. Whether
 * every path through a door passes its check before acting is not read here: an answer before the check (Graph's
 * validation echo, a refusal of a malformed delivery, a dry line's skipped signature) is each door's own tests' to
 * prove, as edge/diag-door.test.mjs and edge/page-door.test.mjs do for the platform's two. A change of what is held is
 * a change to door-policy.json, read in the diff and reviewed as one.
 *
 * A door that reaches none of KNOCKS is open, and says why in OPEN; a verb whose check is not statically clear reads
 * the same, and fails until its check joins KNOCKS. authorizeAdmin is read once more, apart from the doors: every use
 * of it in the edge's tracked modules is a call in a door's own file, for that door's path, that the door's reading
 * reaches, and only PLATFORM_KEY's doors hand it options that may let the platform's key in. No call escapes the pin.
 *
 *   UPDATE_DOOR_POLICY=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/doors/door-policy.test.mjs
 *       rewrites tooling/scripts/tests/edge/door-policy.json from the doors
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../../_source.mjs";
import { parse, repoFiles } from "../../_ast.mjs";
import { METHODS, doorFiles, doorPath } from "./_doors.mjs";

const FILE = path.join(ROOT, "tooling/scripts/tests/edge/door-policy.json");

/** What every drift from the file says, whichever test finds it. */
const DRIFT =
  "who may knock on a door changed, and a change here is a change to who may knock on the edge: review it as one, then UPDATE_DOOR_POLICY=1";

/** The wrappers a door is, each with the module that declares it: a function of the same name elsewhere is none. */
const WRAPPERS = {
  door: "apps/edge/lib/log.ts",
  adminDoor: "apps/edge/lib/log.ts",
  sweepDoor: "apps/edge/lib/ops/sweep-door.ts",
};

/** The packages' stand-in the edge imports channels through: a check of the package is declared there. */
const CHANNELS = "apps/edge/lib/packages/channels.ts";

/**
 * The checks that decide whether a knock comes in, each by the name its module exports it under, with that module
 * (`from`). Stripe's is a method of the client the code builds, so it is read by its shape instead,
 * `<client>.webhooks.constructEvent` (`on`). A closed set: a check it does not name is not seen, so a door whose only
 * check is a new one reads as open until the check joins here. verifyEdgeToken is not one: log.ts reads a token only to
 * name the request, and authorizeAdmin is what lets it in.
 */
const KNOCKS = {
  authorizeAdmin: { from: "apps/edge/lib/admin-auth.ts" }, // a token minted for this door, or the platform's key where it allows
  authorizeCron: { from: "apps/edge/lib/cron-auth.ts" }, // the sweep key held in Vault
  voiceDoorAuth: { from: "apps/edge/lib/voice/voice-door-auth.ts" }, // Retell's signature, or the shared secret while it is read
  retellSigned: { from: "apps/edge/lib/voice/voice-door-auth.ts" }, // the same module: Retell's signature alone
  verifyTwilioSignature: { from: CHANNELS }, // Twilio's signature, with the token of the line's own account
  verifyGooglePushToken: { from: CHANNELS }, // the token Google signs on a Gmail push
  clientStateMatches: { from: CHANNELS }, // the secret a Graph subscription echoes on each notification
  signedByMeta: { from: "apps/edge/lib/whatsapp/webhook.ts" }, // Meta's HMAC over the raw body
  signedByInstagramApp: { from: "apps/edge/lib/instagram/webhook.ts" }, // the same HMAC, with the Instagram app's secret or the Meta app's
  askVoiceWebhookSigned: { from: "apps/edge/lib/voice/ask-voice.ts" }, // ElevenLabs' HMAC over the raw body
  verifyResendWebhook: { from: CHANNELS }, // svix's signature over Resend's event
  constructEvent: { on: "webhooks" }, // Stripe's own library: Stripe's signature
  tokenMatches: { from: "apps/edge/lib/leads/apify-ingress.ts" }, // the lead run's own webhook token, against its hash
};
const ADMIN_AUTH = KNOCKS.authorizeAdmin.from;

/**
 * How many calls deep a handler is followed for its knocks: far enough for a verb that hands the check to its plan (the
 * SMS door's), from a handler written inline.
 */
const DEPTH = 2;

/** The doors no check guards, each with why. A door that reaches none of KNOCKS and is not here fails. */
const OPEN = {
  "GET /api/health": "the outside monitor's probe: 200 or 503, never a workspace's name or a secret",
  "GET /api/version": "the commit the deployment was built from: a commit is not a secret",
  "GET /api/whatsapp": "Meta's handshake: the challenge is echoed only for WHATSAPP_VERIFY_TOKEN, compared in the door",
  "GET /api/instagram":
    "Meta's handshake: the challenge is echoed only for INSTAGRAM_VERIFY_TOKEN, compared in the door",
};

/**
 * The doors the platform's shared key (x-diag-key) opens on an edge that also holds the token secret: the diagnostic
 * and the pager, which nothing mints a token for. The list is this test's; door-policy.json holds what each door hands
 * authorizeAdmin, and this holds that no other door drifts in.
 */
const PLATFORM_KEY = ["GET /api/diag", "POST /api/admin/page"];

/* ---- Reading a module ---- */

/** An expression under its parentheses and casts. */
function bare(e) {
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e))
  ) {
    e = e.expression;
  }
  return e;
}

const isFunctionNode = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);
const isExported = (st) =>
  ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const nameText = (n) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText());

/** The module a relative specifier names, as a repo path, or null for a package's name or a file that is not there. */
function moduleOf(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const file = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)).replace(/\.js$/, ".ts");
  return fs.existsSync(path.join(ROOT, file)) ? file : null;
}

/** One of the edge's own modules, followed into: a package's stand-in under apps/edge/lib/packages is the package's. */
const isEdgeOwn = (file) => file.startsWith("apps/edge/") && !file.startsWith("apps/edge/lib/packages/");

/** The names an import or a re-export takes from its module: `{ local, imported, from }` each, types left out. */
function namesFrom(st) {
  const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
  const named = ts.isImportDeclaration(st)
    ? !st.importClause?.isTypeOnly && st.importClause?.namedBindings
    : !st.isTypeOnly && st.exportClause;
  if (!from || !named || !(ts.isNamedImports(named) || ts.isNamedExports(named))) return [];
  return named.elements
    .filter((el) => !el.isTypeOnly)
    .map((el) => ({ local: el.name.text, imported: (el.propertyName ?? el.name).text, from }));
}

/** Whether a binding (a name, or a destructuring pattern) binds `name`. */
function binds(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some((el) => ts.isBindingElement(el) && binds(el.name, name));
}

/** Whether `id`'s name is bound below the module's top, by a parameter or a declaration in an enclosing block. */
function boundInside(id) {
  for (let s = id.parent; s && !ts.isSourceFile(s); s = s.parent) {
    if (ts.isFunctionLike(s) && s.parameters.some((p) => binds(p.name, id.text))) return true;
    if (!ts.isBlock(s)) continue;
    for (const st of s.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === id.text) return true;
      if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => binds(d.name, id.text)))
        return true;
    }
  }
  return false;
}

/**
 * The function `name` stands for at the top of `file`: one declared there, a `const` bound to one, or one imported or
 * re-exported by name from another of the edge's modules, followed there. `{ file, fn, name }`, or null for a
 * parameter, a package's function or anything else.
 */
function declaration(file, name, hops = 0) {
  if (hops > 4) return null;
  for (const st of parse(file).statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name && st.body) return { file, fn: st, name };
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = bare(d.initializer);
        if (ts.isIdentifier(d.name) && d.name.text === name && init && isFunctionNode(init))
          return { file, fn: init, name };
      }
    }
    if (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) continue;
    const taken = namesFrom(st).find((n) => n.local === name);
    if (!taken) continue;
    const target = moduleOf(file, taken.from);
    return target && isEdgeOwn(target) ? declaration(target, taken.imported, hops + 1) : null;
  }
  return null;
}

const origins = new Map();

/**
 * Where `name` at the top of `file` is declared: `{ file, name }`, the module and the name it has there, through
 * imports and re-exports of the edge's own modules; a package's stand-in is where the package's names are. Null for a
 * name nothing at the top binds, or one a package's own name brings in.
 */
function originOf(file, name, hops = 0) {
  const key = `${file}\0${name}`;
  if (!origins.has(key)) origins.set(key, hops > 4 ? null : findOrigin(file, name, hops));
  return origins.get(key);
}

function findOrigin(file, name, hops) {
  for (const st of parse(file).statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return { file, name };
    if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => binds(d.name, name)))
      return { file, name };
    if (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) continue;
    const taken = namesFrom(st).find((n) => n.local === name);
    if (!taken) continue;
    const target = moduleOf(file, taken.from);
    if (!target) return null;
    return isEdgeOwn(target) ? originOf(target, taken.imported, hops + 1) : { file: target, name: taken.imported };
  }
  return null;
}

/**
 * The check of KNOCKS a call is, by the name its module exports it under, or null: a name resolved through the caller's
 * imports to the module KNOCKS names for it, or a method of the shape KNOCKS gives it.
 */
function knockOf(file, call) {
  const callee = bare(call.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    const name = callee.name.text;
    const on = bare(callee.expression);
    const k = Object.hasOwn(KNOCKS, name) ? KNOCKS[name] : null;
    return k?.on && ts.isPropertyAccessExpression(on) && on.name.text === k.on ? name : null;
  }
  if (!ts.isIdentifier(callee) || boundInside(callee)) return null;
  const o = originOf(file, callee.text);
  return o && Object.hasOwn(KNOCKS, o.name) && KNOCKS[o.name].from === o.file ? o.name : null;
}

/**
 * What a `const` holds where `id` reads it (`const AUD = "/api/admin/whisper"`): the initializer in the nearest block
 * or module that declares the name with `const`, or null where a parameter or nothing declares it.
 */
function constantOf(id) {
  for (let s = id.parent; s; s = s.parent) {
    const bound = ts.isFunctionLike(s) && s.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === id.text);
    if (bound) return null;
    if (!ts.isSourceFile(s) && !ts.isBlock(s)) continue;
    for (const st of s.statements) {
      if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
      const d = st.declarationList.declarations.find((x) => ts.isIdentifier(x.name) && x.name.text === id.text);
      if (d) return bare(d.initializer) ?? null;
    }
  }
  return null;
}

const isLiteral = (n) =>
  ts.isStringLiteralLike(n) ||
  ts.isNumericLiteral(n) ||
  n.kind === ts.SyntaxKind.TrueKeyword ||
  n.kind === ts.SyntaxKind.FalseKeyword ||
  n.kind === ts.SyntaxKind.NullKeyword;

/**
 * Whether a door writes this argument as a value: a literal, an object of options at the call, or a `const` holding a
 * literal. A `const` holding an object is not one: a form filled from the request is a `const {}` too.
 */
function isWritten(e) {
  const v = bare(e);
  return isLiteral(v) || ts.isObjectLiteralExpression(v) || heldLiteral(v) !== null;
}

/** The literal an identifier's `const` holds, through a `const` naming another, or null. */
function heldLiteral(v, hops = 0) {
  const held = ts.isIdentifier(v) && hops < 8 ? constantOf(v) : null;
  if (!held) return null;
  return isLiteral(held) ? held : heldLiteral(held, hops + 1);
}

/** A property an object's options are read by: a name, or a name written short, never a spread, a method or `[key]`. */
const isPlainProperty = (p) =>
  (ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && !ts.isPrivateIdentifier(p.name)) ||
  ts.isShorthandPropertyAssignment(p);

/**
 * A value as the door writes it: a literal as itself, a constant as what it holds, an object of plain properties as its
 * options; anything else, a value the request computes or an object with a spread, a method or a computed key, as its
 * expression, `{ expr }`, which may hold anything.
 */
function valueOf(e) {
  const v = bare(e);
  if (ts.isStringLiteralLike(v)) return v.text;
  if (ts.isNumericLiteral(v)) return Number(v.text);
  if (v.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (v.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (v.kind === ts.SyntaxKind.NullKeyword) return null;
  const literal = heldLiteral(v);
  if (literal) return valueOf(literal);
  if (ts.isObjectLiteralExpression(v) && v.properties.every(isPlainProperty)) {
    return Object.fromEntries(
      v.properties.map((p) =>
        ts.isPropertyAssignment(p) ? [nameText(p.name), valueOf(p.initializer)] : [p.name.text, valueOf(p.name)],
      ),
    );
  }
  return { expr: v.getText() };
}

/* ---- Reading a door ---- */

/**
 * Every call of a check of KNOCKS a function reaches, in the order its code runs: a call's callee and arguments before
 * the call, and a call of a function the edge declares followed into, `depth` calls deep (never a check's, nor a
 * wrapper's, which is read on its own), each function once. `{ knock, call, local, file, where }` each, `where` naming
 * the function it sits in.
 */
function knocksOf(file, fn, where, depth, seen = new Set()) {
  const out = [];
  const visit = (n) => {
    ts.forEachChild(n, visit);
    if (!ts.isCallExpression(n)) return;
    const callee = bare(n.expression);
    const knock = knockOf(file, n);
    if (knock) {
      out.push({ knock, call: n, local: ts.isIdentifier(callee) ? callee.text : knock, file, where });
      return;
    }
    if (depth === 0 || !ts.isIdentifier(callee) || Object.hasOwn(WRAPPERS, callee.text) || boundInside(callee)) return;
    const d = declaration(file, callee.text);
    if (!d || seen.has(d.fn)) return;
    seen.add(d.fn);
    out.push(...knocksOf(d.file, d.fn, `${d.name} in ${d.file}`, depth - 1, seen));
  };
  ts.forEachChild(fn, visit);
  return out;
}

/**
 * What a door writes at a knock, under the names the knock gives its parameters (authorizeAdmin's `aud` and `opts`,
 * voiceDoorAuth's `door`); what the request carries (the request, its body, a database) is not written, and is left
 * out. authorizeAdmin's every argument after the request is kept whatever it is, `{ expr }` when it is not written, so
 * an audience or options the call does not spell out are seen as such.
 */
function knockArgs({ knock, call, local, file }) {
  const params = declaration(file, local)?.fn.parameters ?? [];
  const out = {};
  call.arguments.forEach((a, i) => {
    const p = params[i]?.name;
    const key = p && ts.isIdentifier(p) ? p.text : `arg${i}`;
    if (isWritten(a)) out[key] = valueOf(a);
    else if (knock === "authorizeAdmin" && i > 0) out[key] = { expr: bare(a).getText() };
  });
  return out;
}

/** One knock as door-policy.json writes it. */
function pinnedKnock(k) {
  const args = knockArgs(k);
  return { knock: k.knock, knock_in: k.where, ...(Object.keys(args).length > 0 ? { knock_args: args } : {}) };
}

/** The handlers a door's module exports, by method: each `export const <METHOD> = …`'s value, or a function. */
function handlersOf(file) {
  const out = {};
  for (const st of parse(file).statements) {
    if (!isExported(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name && METHODS.includes(st.name.text)) out[st.name.text] = st;
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && METHODS.includes(d.name.text)) out[d.name.text] = d.initializer;
    }
  }
  return out;
}

/** The wrapper a handler is a call of, `{ name, call, decl }`, when the name is one of WRAPPERS from its own module. */
function wrapperOf(file, handler) {
  const call = bare(handler);
  const callee = call && ts.isCallExpression(call) ? bare(call.expression) : null;
  if (!callee || !ts.isIdentifier(callee) || !Object.hasOwn(WRAPPERS, callee.text)) return null;
  const decl = declaration(file, callee.text);
  return decl && decl.file === WRAPPERS[callee.text] ? { name: callee.text, call, decl } : null;
}

/** Every call of a check some door's reading reaches. */
const reachedCalls = new Set();

/** Who may knock on one handler of a door, as door-policy.json writes it. */
function policyOf(file, handler) {
  const wrapper = wrapperOf(file, handler);
  if (!wrapper) return { wrapper: null, knock: null };
  const entry = { wrapper: wrapper.name };
  const [first, second] = wrapper.call.arguments;
  let inner = first;
  if (wrapper.name === "sweepDoor") {
    const { sweep, ...options } = valueOf(first);
    if (sweep !== undefined) entry.sweep = sweep;
    if (Object.keys(options).length > 0) entry.sweep_options = options;
    inner = second;
  } else if (second) entry.wrapper_options = valueOf(second);
  const h = bare(inner);
  let target = null;
  if (h && isFunctionNode(h)) target = { file, fn: h, where: `${h.name?.text ?? "(inline)"} in ${file}` };
  else if (h && ts.isIdentifier(h)) {
    const d = declaration(file, h.text);
    entry.verb = d ? `${d.name} in ${d.file}` : h.text;
    if (d) target = { file: d.file, fn: d.fn, where: entry.verb };
  }
  const reached = [
    ...knocksOf(wrapper.decl.file, wrapper.decl.fn, `${wrapper.name} in ${wrapper.decl.file}`, DEPTH),
    ...(target ? knocksOf(target.file, target.fn, target.where, DEPTH) : []),
  ];
  for (const k of reached) reachedCalls.add(k.call);
  const [knock, ...later] = reached.map(pinnedKnock);
  Object.assign(entry, knock ?? { knock: null });
  if (later.length > 0) entry.later_knocks = Object.fromEntries(later.map((k, i) => [String(i + 2), k]));
  return entry;
}

/** Every knock a pinned entry holds: its first, then its later ones. */
const knocksIn = (p) => (p.knock === null ? [] : [p, ...Object.values(p.later_knocks ?? {})]);

/* ---- Every door, then the file ---- */

const doors = {};
const fileOf = {};
const handlerless = [];
for (const file of doorFiles()) {
  const handlers = handlersOf(file);
  const methods = METHODS.filter((m) => Object.hasOwn(handlers, m));
  if (methods.length === 0) handlerless.push(file);
  for (const m of methods) {
    const key = `${m} ${doorPath(file)}`;
    doors[key] = policyOf(file, handlers[m]);
    fileOf[key] = file;
  }
}

const NOTE =
  "Written by edge/doors/door-policy.test.mjs (UPDATE_DOOR_POLICY=1). A change here is a change to who may knock on the edge: which wrapper names the request, which checks a door reaches and where each is called, and what the door hands them (an admin door's audience, the platform's key). Whether every path passes the check is each door's own tests'. Review it as one.";
const current = { note: NOTE, doors };
if (process.env.UPDATE_DOOR_POLICY === "1") fs.writeFileSync(FILE, `${JSON.stringify(current, null, 2)}\n`);
const pinned = JSON.parse(fs.readFileSync(FILE, "utf8"));

test("what the doors declare is what the file says", () => {
  assert.deepEqual(doors, pinned.doors, DRIFT);
});

test("every door exports a handler, and every handler is door(), adminDoor() or sweepDoor() from its own module", () => {
  assert.deepEqual(handlerless, [], "a file under apps/edge/api is a door: it exports GET, POST, PUT, PATCH or DELETE");
  const unwrapped = Object.keys(doors).filter((key) => doors[key].wrapper === null);
  assert.deepEqual(unwrapped, [], "a handler no wrapper holds names no request, and its knock is not read here");
});

test("an admin door is adminDoor(), and every authorizeAdmin is handed its own door's path: a token minted for another door opens none", () => {
  const wrong = [];
  for (const [key, p] of Object.entries(doors)) {
    const at = key.slice(key.indexOf(" ") + 1);
    if (at.startsWith("/api/admin/") && (p.wrapper !== "adminDoor" || p.knock !== "authorizeAdmin"))
      wrong.push(`${key}: ${p.wrapper} and ${p.knock}`);
    for (const k of knocksIn(p).filter((x) => x.knock === "authorizeAdmin")) {
      if (k.knock_args?.aud !== at) wrong.push(`${key}: the audience is ${JSON.stringify(k.knock_args?.aud)}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("a clock's door is let in by the sweep key", () => {
  const wrong = Object.entries(doors)
    .filter(([key, p]) => / \/api\/(cron|jobs)\//.test(key) && p.knock !== "authorizeCron")
    .map(([key, p]) => `${key}: ${p.knock}`);
  assert.deepEqual(wrong, []);
});

/**
 * Whether authorizeAdmin's options may let the platform's key in: `platformKey` anything but false, or options the
 * call does not spell out (`{ expr }`, a spread, a value that is not an object). No options at all let it in nowhere.
 */
const opensWithTheKey = (opts) =>
  opts !== undefined &&
  (typeof opts !== "object" || opts === null || opts.expr !== undefined || (opts.platformKey ?? false) !== false);

test("the platform's key opens the doors PLATFORM_KEY names and no other", () => {
  const keyed = (all) =>
    Object.entries(all)
      .filter(([, p]) => knocksIn(p).some((k) => k.knock === "authorizeAdmin" && opensWithTheKey(k.knock_args?.opts)))
      .map(([key]) => key)
      .sort();
  assert.deepEqual(
    keyed(doors),
    [...PLATFORM_KEY].sort(),
    "the platform's key opens another door: argue it in PLATFORM_KEY",
  );
  assert.deepEqual(keyed(pinned.doors), keyed(doors), DRIFT);
});

/**
 * Every use of authorizeAdmin in the edge's tracked modules, apart from how a door is read: `{ file, call }` for a
 * call, `{ file, use }` for anything else (a name handed on, a namespace import), which a call DEPTH does not reach
 * could hide behind.
 */
function adminAuthUses() {
  const uses = [];
  for (const file of repoFiles(["apps/edge"], { keep: /\.ts$/ })) {
    const sf = parse(file);
    const local = new Set();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const ns = st.importClause?.namedBindings;
      if (ns && ts.isNamespaceImport(ns) && moduleOf(file, st.moduleSpecifier.text) === ADMIN_AUTH)
        uses.push({ file, use: st.getText() });
      for (const n of namesFrom(st)) {
        const o = originOf(file, n.local);
        if (o?.file === ADMIN_AUTH && o.name === "authorizeAdmin") local.add(n.local);
      }
    }
    if (local.size === 0) continue;
    const visit = (n) => {
      ts.forEachChild(n, visit);
      if (!ts.isIdentifier(n) || !local.has(n.text) || isNameOnly(n) || boundInside(n)) return;
      let e = n;
      while (ts.isParenthesizedExpression(e.parent) || ts.isAsExpression(e.parent) || ts.isNonNullExpression(e.parent))
        e = e.parent;
      if (ts.isCallExpression(e.parent) && e.parent.expression === e) uses.push({ file, call: e.parent });
      else uses.push({ file, use: e.parent.getText() });
    };
    visit(sf);
  }
  return uses;
}

/** An identifier that only names (an import's or export's specifier, a property), and reads no binding. */
function isNameOnly(n) {
  const p = n.parent;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return true;
  if (ts.isPropertyAccessExpression(p)) return p.name === n;
  return (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === n;
}

test("every authorizeAdmin in the edge is called in a door's own file, for that door's path, and lets the platform's key in only where PLATFORM_KEY says", () => {
  const doorOf = new Map(doorFiles().map((f) => [f, doorPath(f)]));
  const keyFiles = new Set(PLATFORM_KEY.map((key) => fileOf[key]));
  const wrong = [];
  for (const u of adminAuthUses()) {
    if (u.use !== undefined) {
      wrong.push(`${u.file}: authorizeAdmin is used, not called: ${u.use}`);
      continue;
    }
    const [, aud, opts] = u.call.arguments;
    const at = doorOf.get(u.file);
    if (at === undefined) wrong.push(`${u.file}: authorizeAdmin is called outside a door`);
    else if (!aud || valueOf(aud) !== at) wrong.push(`${u.file}: the audience is ${aud ? aud.getText() : "missing"}`);
    if (opensWithTheKey(opts && valueOf(opts)) && !keyFiles.has(u.file))
      wrong.push(`${u.file}: the platform's key may open it: ${opts.getText()}`);
    if (!reachedCalls.has(u.call))
      wrong.push(`${u.file}: a call no door's reading reaches, so door-policy.json misses it`);
  }
  assert.deepEqual(
    wrong,
    [],
    "authorizeAdmin is called by name in the handler of the door it guards, with the door's path; the platform's key is argued in PLATFORM_KEY",
  );
});

test("a door no check guards is open on purpose, and OPEN says why", () => {
  const open = Object.keys(doors)
    .filter((key) => doors[key].knock === null)
    .sort();
  assert.deepEqual(
    open,
    Object.keys(OPEN).sort(),
    "a door that reaches none of KNOCKS: name its check in KNOCKS, with the module that declares it, or argue the door open in OPEN",
  );
});

test("every check KNOCKS names is some door's knock: the set holds no name nothing calls", () => {
  const used = new Set(Object.values(doors).flatMap((p) => knocksIn(p).map((k) => k.knock)));
  assert.deepEqual(
    Object.keys(KNOCKS).filter((k) => !used.has(k)),
    [],
    "a check no door calls leaves KNOCKS",
  );
});
