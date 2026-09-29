/**
 * The sign-up screen, run: which door it shows, what the form sends at each, and where each answer leaves it.
 *
 * signup.test.mjs and signup-posture.test.mjs pin the page's wiring by its text; this draws the real page on a stub
 * React, the way create-workspace-screen.test.mjs draws the create screen, and presses it. The browser's Supabase
 * client is replaced before the page loads (it reaches the network through the hosted project), so the code step's
 * calls are seen with their arguments. Child components are left as elements: their props are what the page decides.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Module, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SIGNUP_WORDS, deviceTimezone, passwordProblem, verifyCodeWords } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const PAGE = path.join(ROOT, "apps/dashboard/app/signup/page.tsx");
const require = createRequire(PAGE);

/* ------------------------------ the world ------------------------------ */

// The Supabase browser client, as the page's module path resolves it, answered by the test in turn.
let auth = null;
const client = path.join(ROOT, "apps/dashboard/src/lib/supabase/client.ts");
const fake = new Module(client);
fake.filename = client;
fake.loaded = true;
fake.exports = {
  createClient: () => ({
    auth: {
      verifyOtp: async (a) => auth.verifyOtp(a),
      resend: async (a) => auth.resend(a),
    },
  }),
};
require.cache[client] = fake;

// A stub React: the page's hooks in cells by call order, an effect once per mount, a setter marks it changed.
const react = require("react");
let cells = [];
let at = 0;
let dirty = false;
let tree = null;
react.useState = (init) => {
  const k = at++;
  if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
  return [
    cells[k],
    (v) => {
      cells[k] = typeof v === "function" ? v(cells[k]) : v;
      dirty = true;
    },
  ];
};
react.useEffect = (fn) => {
  const k = at++;
  if (!(k in cells)) {
    cells[k] = true;
    fn();
  }
};
react.useRef = (v) => {
  const k = at++;
  if (!(k in cells)) cells[k] = { current: v };
  return cells[k];
};
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, props, ...kids) => ({ type, props: { ...(props || {}), children: kids.flat(Infinity) } }),
};

// What the page asks of the browser: each request, each trip elsewhere.
let asked = [];
let went = [];
let answers = {};
globalThis.fetch = async (url, init = {}) => {
  const method = init.method ?? "GET";
  asked.push({ url: String(url), method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
  const a = answers[method];
  if (a instanceof Error) throw a;
  if (a.raw !== undefined) return new Response(a.raw, { status: a.status });
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
};
globalThis.window = { location: { assign: (to) => went.push(to) } };
globalThis.sessionStorage = { removeItem() {}, getItem: () => null, setItem() {}, key: () => null, length: 0 };

const mod = await import(pathToFileURL(PAGE).href);
const SignupPage = typeof mod.default === "function" ? mod.default : mod.default.default;

/* ------------------------------ driving ------------------------------ */

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
};
const find = (pred) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && pred(n)) hit = n;
  });
  return hit;
};
const card = () => find((n) => String(n.props?.["data-testid"] ?? "").startsWith("signup"));
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf(n.props?.children);
};
const draw = () => {
  at = 0;
  dirty = false;
  tree = SignupPage();
};
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setImmediate(r));
    if (dirty) draw();
  }
};
const open = async (door, post) => {
  cells = [];
  asked = [];
  went = [];
  answers = { GET: { status: 200, body: { ok: true, data: { posture: door } } }, POST: post };
  draw();
  await settle();
};
const type = (id, value) => {
  find((n) => n.type === "input" && n.props.id === id).props.onChange({ target: { value } });
  draw();
};
const press = async () => {
  await find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
};
const fill = (password = "correct horse battery") => {
  type("name", "  Luna Studio ");
  type("email", " Owner+x@Luna.example ");
  if (find((n) => n.props?.id === "password")) type("password", password);
  if (find((n) => n.props?.id === "code")) type("code", "  ABC-123 ");
};
const posted = () => asked.filter((a) => a.method === "POST").map((a) => a.body);
const said = () => textOf(find((n) => n.props?.role === "alert"));
const CONFIRM = { status: 200, body: { ok: true, data: { next: null, sent: true } } };

/* ------------------------------ the tests ------------------------------ */

test("nothing can be pressed until the server has named the door, and each door sends only what it takes", async () => {
  cells = [];
  answers = { GET: { status: 200, body: { ok: true, data: { posture: "open" } } }, POST: CONFIRM };
  draw();
  assert.equal(find((n) => n.type === "button").props.disabled, true, "disabled before the posture is known");
  await settle();
  assert.equal(card().props["data-posture"], "open");

  const zone = deviceTimezone();
  const who = { name: "Luna Studio", email: "Owner+x@Luna.example" };
  const clock = zone ? { timezone: zone } : {};
  const password = "correct horse battery";
  for (const [door, sent] of [
    ["open", { ...who, password, ...clock }],
    ["invite", { ...who, password, ...clock, code: "ABC-123" }],
    ["waitlist", { ...who, ...clock }],
  ]) {
    await open(door, CONFIRM);
    fill();
    await press();
    assert.deepEqual(posted(), [sent], `${door}: trimmed, and a credential only where an account is made`);
    assert.deepEqual(Object.keys(posted()[0]), Object.keys(sent), `${door}: in the order the route has always read`);
  }
});

test("a weak password is refused before anything is sent, in the rule's own words", async () => {
  await open("open", CONFIRM);
  fill("short");
  await press();
  assert.deepEqual(posted(), []);
  assert.equal(said(), passwordProblem("short"));
  assert.equal(card().props["data-testid"], "signup");
});

test("only a yes both ways leaves the form; every refusal is said in the route's words or ours", async () => {
  for (const [answer, words] of [
    [{ status: 500, body: { ok: true, data: {} } }, "Something went wrong. Try again."],
    [{ status: 200, body: { ok: false, error: { message: "Half an answer." } } }, "Half an answer."],
    [
      { status: 403, body: { ok: false, error: { message: "That invite code is not right." } } },
      "That invite code is not right.",
    ],
    [{ status: 502, raw: "<html>bad gateway</html>" }, "Something went wrong. Try again."],
    [new TypeError("Failed to fetch"), SIGNUP_WORDS.unreachable],
  ]) {
    await open("invite", answer);
    fill();
    await press();
    assert.equal(card().props["data-testid"], "signup", `stays on the form: ${words}`);
    assert.equal(said(), words);
    assert.equal(find((n) => n.type === "button").props.disabled, false, "and can be pressed again");
  }
});

test("each answer has its card: the waitlist joined, the code that did not go out, the code step", async () => {
  await open("waitlist", { status: 200, body: { ok: true, data: { waitlisted: true, sent: false } } });
  fill();
  await press();
  assert.equal(card().props["data-testid"], "signup-joined", "the waitlist wins over an unsent code");
  assert.ok(textOf(card()).includes(SIGNUP_WORDS.waitlistSent("Owner+x@Luna.example")));

  for (const [message, words] of [
    ["We could not send the code just now.", "We could not send the code just now."],
    [undefined, SIGNUP_WORDS.notSent],
  ]) {
    await open("open", { status: 200, body: { ok: true, data: { sent: false, message } } });
    fill();
    await press();
    assert.equal(card().props["data-testid"], "signup-unsent");
    assert.ok(textOf(card()).includes(words));
    assert.equal(find((n) => n.type === "a").props.href, "/login?email=Owner%2Bx%40Luna.example");
  }

  await open("open", CONFIRM);
  fill();
  await press();
  assert.equal(card().props["data-testid"], "signup-confirm");
});

test("the code step confirms the address it was given, resends a confirmation, and goes back to the form", async () => {
  await open("open", CONFIRM);
  fill();
  await press();
  const step = () => find((n) => typeof n.type === "function" && n.type.name === "CodeStep").props;
  assert.equal(step().email, "Owner+x@Luna.example");

  const calls = [];
  auth = {
    verifyOtp: (a) => (calls.push(["verify", a]), { error: { message: "Token has expired or is invalid" } }),
    resend: (a) => (calls.push(["resend", a]), { error: null }),
  };
  assert.equal(await step().onSubmit("123456"), verifyCodeWords("Token has expired or is invalid"));
  assert.deepEqual(went, [], "a wrong code goes nowhere");
  assert.equal(await step().onResend(), null);
  auth.verifyOtp = (a) => (calls.push(["verify", a]), { error: null });
  assert.equal(await step().onSubmit("654321"), null);
  assert.deepEqual(went, ["/"], "a confirmed address opens the create screen");
  assert.deepEqual(calls, [
    ["verify", { email: "Owner+x@Luna.example", token: "123456", type: "email" }],
    ["resend", { type: "signup", email: "Owner+x@Luna.example" }],
    ["verify", { email: "Owner+x@Luna.example", token: "654321", type: "email" }],
  ]);

  step().onBack();
  draw();
  assert.equal(card().props["data-testid"], "signup", "back to the form, with what was typed");
  assert.equal(find((n) => n.props?.id === "email").props.value, " Owner+x@Luna.example ");
});
