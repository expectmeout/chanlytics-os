/**
 * The sign-in screen, drawn: what the address brings, the password door, the code door and the code step's resend.
 *
 * auth-gate.test.mjs and signup.test.mjs hold the page's text (the calls it must make, the words it must not say).
 * These run it: the real page (app/login/page.tsx) with its real children and contracts, on a stub React whose hook
 * cells sit where React keeps them (_hook-frames.mjs), over a stand-in window and a stand-in for the Supabase browser
 * client, which answers each auth call as the test says and records what it was asked.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PASSWORD_WORDS, SIGNUP_WORDS, requestCodeWords } from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCREEN = path.join(ROOT, "apps/dashboard/app/login/page.tsx");
const requireHere = createRequire(SCREEN);

// The code step counts its resend wait down a second at a time: its interval never fires here.
mock.timers.enable({ apis: ["setInterval"] });

/* ------------------------------ a stand-in Supabase client ------------------------------ */

// The page makes its client from @/lib/supabase/client. That module is put in the require cache before the page is
// loaded, so the page (and GoogleSignIn beside it) get the stand-in, which records each auth call and answers it.
let asked = [];
let answers = {};
const answer = (kind, arg) => {
  asked.push([kind, arg]);
  const a = answers[kind];
  const next = Array.isArray(a) ? (a.length > 1 ? a.shift() : a[0]) : a;
  return Promise.resolve(next ?? { data: {}, error: null });
};
const clientPath = requireHere.resolve("@/lib/supabase/client");
requireHere.cache[clientPath] = {
  id: clientPath,
  filename: clientPath,
  loaded: true,
  exports: {
    createClient: () => ({
      auth: {
        signInWithPassword: (x) => answer("signInWithPassword", x),
        resend: (x) => answer("resend", x),
        signInWithOtp: (x) => answer("signInWithOtp", x),
        verifyOtp: (x) => answer("verifyOtp", x),
        signInWithOAuth: (x) => answer("signInWithOAuth", x),
        mfa: { getAuthenticatorAssuranceLevel: () => answer("aal") },
      },
    }),
  },
};

/* ------------------------------ a stub React ------------------------------ */

const react = requireHere("react");
const frames = hookFrames();
let cells = new Map();
let effects = [];
let dirty = false;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));
react.useState = (init) => {
  const k = frames.key();
  if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
  return [
    cells.get(k),
    (v) => {
      const was = cells.get(k);
      cells.set(k, typeof v === "function" ? v(was) : v);
      if (!Object.is(was, cells.get(k))) dirty = true;
    },
  ];
};
react.useRef = (init) => {
  const k = frames.key();
  if (!cells.has(k)) cells.set(k, { current: init });
  return cells.get(k);
};
react.useCallback = (fn, deps) => {
  const k = frames.key();
  const was = cells.get(k);
  if (was && same(was.deps, deps)) return was.fn;
  cells.set(k, { fn, deps });
  return fn;
};
// An effect runs after the draw, again when its dependencies change, as React runs it.
react.useEffect = (fn, deps) => {
  const k = frames.key();
  const was = cells.get(k);
  if (was && same(was.deps, deps)) return;
  cells.set(k, { deps });
  effects.push(fn);
};
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, props, ...kids) => {
    const node = { type, props: { ...(props || {}), children: kids.flat(Infinity) } };
    if (typeof type === "function") node.rendered = frames.render(type, node.props);
    return node;
  },
};

/* ------------------------------ a stand-in window ------------------------------ */

let went = [];
let replaced = [];
let warned = [];
const at = (url) => {
  const u = new URL(url, "https://app.chanlytics.example");
  const location = {
    origin: u.origin,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    assign: (to) => went.push(to),
  };
  globalThis.window = {
    location,
    history: {
      replaceState: (_s, _t, to) => {
        replaced.push(to);
        const v = new URL(to, u.origin);
        Object.assign(location, { pathname: v.pathname, search: v.search, hash: v.hash });
      },
    },
  };
};
const store = new Map();
globalThis.sessionStorage = {
  get length() {
    return store.size;
  },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
// GoogleSignIn asks the project whether Google is on: it is not, here.
globalThis.fetch = async () => new Response(JSON.stringify({ external: { google: false } }));
console.warn = (...a) => warned.push(a);

const pageModule = await import(pathToFileURL(SCREEN).href);
const LoginPage = typeof pageModule.default === "function" ? pageModule.default : pageModule.default.default;

/* ------------------------------ drawing and pressing ------------------------------ */

let tree = null;
const draw = () => {
  frames.begin();
  dirty = false;
  effects = [];
  tree = globalThis.React.createElement(LoginPage, null);
  for (const fn of effects) fn();
  return tree;
};
const flush = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await flush();
    if (dirty) draw();
  }
  return tree;
};
const open = async (url, auth = {}) => {
  cells = new Map();
  frames.reset();
  asked = [];
  answers = auth;
  went = [];
  replaced = [];
  warned = [];
  store.clear();
  at(url);
  draw();
  return settle();
};
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (pred) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && pred(n)) hit = n;
  });
  return hit;
};
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const field = (id) => find((n) => n.type === "input" && n.props.id === id);
const type = async (id, value) => {
  field(id).props.onChange({ target: { value } });
  return settle();
};
const submit = async () => {
  find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  return settle();
};
const codeInstead = async () => {
  find((n) => n.type === "button" && textOf(n) === PASSWORD_WORDS.codeInstead).props.onClick();
  return settle();
};
const codeStep = () => find((n) => typeof n.type === "function" && n.type.name === "CodeStep");
const heading = () => textOf(find((n) => n.type === "h1"));
const lead = () => textOf(find((n) => n.type === "p"));
const alerts = () => textOf(find((n) => n.props?.role === "alert" && n.props["aria-live"] === "assertive"));

/* ------------------------------ what the address brings ------------------------------ */

test("the address it arrives at: the email fills the field and leaves the address, the route after # stays", async () => {
  await open("/login?email=ann%40luna.example#/inbox/t1");
  assert.equal(field("email").props.value, "ann@luna.example");
  assert.deepEqual(replaced, ["/login#/inbox/t1"], "the query goes, the thread it was sent to does not");
  assert.equal(alerts(), "");
});

test("a provider's refusal in the fragment is said once and taken off; a Cancel is not apologised for", async () => {
  await open("/login#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange");
  assert.equal(alerts(), SIGNUP_WORDS.googleFailed);
  assert.deepEqual(replaced, ["/login"]);
  assert.equal(warned.length, 1);
  assert.equal(warned[0][0], "oauth_provider_refused");

  await open("/login#error=access_denied");
  assert.equal(alerts(), "", "pressing Cancel is not a failure");
  assert.deepEqual(replaced, ["/login"]);

  await open("/login?error=oauth#/x");
  assert.equal(alerts(), SIGNUP_WORDS.googleFailed, "the callback's own refusal, from the query");
  assert.deepEqual(replaced, ["/login#/x"]);
});

/* ------------------------------ the password door ------------------------------ */

test("a refused password is one sentence for every cause, with the nudge, and the address trimmed", async () => {
  await open("/login", { signInWithPassword: { data: {}, error: { message: "Invalid login credentials" } } });
  await type("email", "  ann@luna.example  ");
  await type("password", "hunter2");
  await submit();
  assert.deepEqual(asked, [["signInWithPassword", { email: "ann@luna.example", password: "hunter2" }]]);
  assert.equal(alerts(), PASSWORD_WORDS.wrong + PASSWORD_WORDS.wrongNudge);
  assert.equal(heading(), "Welcome back");
  assert.deepEqual(went, [], "nobody is let in");
});

test("a right password on an unconfirmed address sends a confirmation and asks for it; a refused send stays put", async () => {
  const unconfirmed = { data: {}, error: { code: "email_not_confirmed", message: "Email not confirmed" } };
  await open("/login", { signInWithPassword: unconfirmed });
  await type("email", "ann@luna.example");
  await type("password", "hunter2");
  await submit();
  assert.deepEqual(asked[1], ["resend", { type: "signup", email: "ann@luna.example" }]);
  assert.equal(heading(), "Check your email");
  assert.equal(lead(), SIGNUP_WORDS.confirmFromSignIn("ann@luna.example"));

  const wait = { message: "For security purposes, you can only request this after 42 seconds." };
  await open("/login", { signInWithPassword: unconfirmed, resend: { data: {}, error: wait } });
  await type("email", "ann@luna.example");
  await type("password", "hunter2");
  await submit();
  assert.equal(heading(), "Welcome back", "no code box for a code that is not coming");
  assert.equal(alerts(), requestCodeWords(wait));
});

test("in: the tab's cache goes, and the second step comes first for an account with an authenticator (0013)", async () => {
  await open("/login?email=ann%40luna.example#/inbox/t1", {
    signInWithPassword: { data: {}, error: null },
    aal: { data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null },
  });
  store.set("chanlytics.surfaces.v1", "{}");
  await type("password", "hunter2");
  await submit();
  assert.equal(store.has("chanlytics.surfaces.v1"), false, "the previous account's rows are gone");
  assert.deepEqual(went, ["/verify#/inbox/t1"]);
});

/* ------------------------------ the code door ------------------------------ */

test("the code door never makes an account, and reaches the code step whether or not the address has one", async () => {
  await open("/login", { signInWithOtp: { data: {}, error: { message: "Signups not allowed for otp" } } });
  await type("email", " ann@luna.example");
  await codeInstead();
  assert.deepEqual(asked, [["signInWithOtp", { email: "ann@luna.example", options: { shouldCreateUser: false } }]]);
  assert.equal(heading(), "Check your email");
  assert.equal(lead(), "We sent a one-time code to your work email.");
  assert.equal(alerts(), "");
});

test("the code step's resend: a sign-in code at the code door, a confirmation for an unconfirmed address", async () => {
  await open("/login");
  await type("email", "ann@luna.example");
  await codeInstead();
  asked = [];
  assert.equal(await codeStep().props.onResend(), null);
  assert.deepEqual(asked, [["signInWithOtp", { email: "ann@luna.example", options: { shouldCreateUser: false } }]]);

  await open("/login", { signInWithPassword: { data: {}, error: { code: "email_not_confirmed" } } });
  await type("email", "ann@luna.example");
  await type("password", "hunter2");
  await submit();
  asked = [];
  assert.equal(await codeStep().props.onResend(), null);
  assert.deepEqual(asked, [["resend", { type: "signup", email: "ann@luna.example" }]]);

  // And back to the password: the confirmation's words go with it.
  codeStep().props.onBack();
  await settle();
  assert.equal(heading(), "Welcome back");
  assert.equal(lead(), "Sign in to your workspace.");
});
