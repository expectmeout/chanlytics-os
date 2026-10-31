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
import {
  LEAD_PREVIEW_WORDS,
  SIGNUP_WORDS,
  deviceTimezone,
  passwordProblem,
  verifyCodeWords,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// The screen /signup draws with no preview, and /preview/<token>/mine with one (decision 0079).
const PAGE = path.join(ROOT, "apps/dashboard/src/auth/SignupScreen.tsx");
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
      // Signed in or not, as a preview's link asks (decision 0079); nobody unless the test says.
      getSession: async () => ({ data: { session: auth?.session ?? null } }),
      signOut: async () => auth.signOut(),
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
  // By method and path where the test names one (a preview's link asks two GETs and two POSTs), else by method.
  const a = answers[`${method} ${new URL(String(url), "https://app.example.com").pathname}`] ?? answers[method];
  if (a instanceof Error) throw a;
  if (a.raw !== undefined) return new Response(a.raw, { status: a.status });
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
};
globalThis.window = {
  location: { assign: (to) => went.push(to) },
  fetch: (...a) => globalThis.fetch(...a),
};
globalThis.sessionStorage = { removeItem() {}, getItem: () => null, setItem() {}, key: () => null, length: 0 };

const mod = await import(pathToFileURL(PAGE).href);
const SignupScreen = typeof mod.default === "function" ? mod.default : mod.default.default;
/** The preview the screen is drawn for: none, as /signup draws it, unless a test says. */
let preview = null;

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
  tree = SignupScreen({ preview });
};
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setImmediate(r));
    if (dirty) draw();
  }
};
const open = async (door, post) => {
  preview = null;
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

/* ---- Make it mine (decision 0079, L4) ---- */

const TOKEN = "TokenTokenTokenToken01";
const CLAIM = "POST /api/v1/preview-claims";
const FIXTURE = { token: TOKEN, business: "Fixture Barbers", email: "owner@fixture.example" };
const CLAIMED = {
  status: 200,
  body: {
    ok: true,
    data: {
      workspace: {
        id: "w9",
        slug: "fixture-barbers",
        name: "Fixture Barbers",
        status: "active",
        timezone: "America/Chicago",
        locale: "en",
      },
    },
  },
};
const W = LEAD_PREVIEW_WORDS.signup;

/** The screen drawn for a preview's link (/preview/<token>/mine reads it on the server), under a posture. */
const openFromLink = async (door, more = {}) => {
  preview = FIXTURE;
  cells = [];
  asked = [];
  went = [];
  answers = { GET: { status: 200, body: { ok: true, data: { posture: door } } }, POST: CONFIRM, ...more };
  draw();
  const first = card().props["data-testid"];
  await settle();
  return first;
};
const byId = (id) => find((n) => n.props?.["data-testid"] === id);
const postedTo = (path) => asked.filter((a) => a.method === "POST" && a.url === path).map((a) => a.body);

test("from a preview's link: whose receptionist at once, the address it was sent to, the door open whatever the posture", async () => {
  const zone = deviceTimezone();
  for (const door of ["invite", "waitlist"]) {
    auth = { session: null };
    assert.equal(await openFromLink(door), "signup-preview", `${door}: its head while the session is asked, no form`);
    assert.equal(card().props["data-testid"], "signup", door);
    assert.equal(card().props["data-posture"], "open", `${door}: the link stands for an invite code`);
    assert.equal(textOf(find((n) => n.type === "h1")), W.title("Fixture Barbers"));
    assert.equal(
      find((n) => n.props?.id === "name"),
      null,
      "the business is named already",
    );
    assert.equal(
      find((n) => n.props?.id === "code"),
      null,
      "no invite code is asked",
    );
    assert.equal(
      find((n) => n.props?.id === "email").props.value,
      "owner@fixture.example",
      "the address it was sent to",
    );
    const google = find((n) => typeof n.type === "function" && n.type.name === "GoogleSignIn").props;
    assert.deepEqual(
      [google.next, google.hint],
      [`/preview/${TOKEN}/mine`, W.googleNext],
      "Google comes back here, signed in, to the one press",
    );
    assert.equal(textOf(find((n) => n.type === "button")), W.claim, "the press is Make it mine");
    assert.ok(!textOf(card()).includes("Your clock"), "a preview keeps its business's own clock");
    type("password", "correct horse battery");
    await press();
    assert.deepEqual(postedTo("/api/v1/signup"), [
      {
        name: "Fixture Barbers",
        email: "owner@fixture.example",
        password: "correct horse battery",
        ...(zone ? { timezone: zone } : {}),
        preview: TOKEN,
      },
    ]);
    assert.equal(card().props["data-testid"], "signup-confirm");
  }
});

test("from a preview's link, the code makes it theirs and opens its first run; a claim refused goes home", async () => {
  const step = () => find((n) => typeof n.type === "function" && n.type.name === "CodeStep").props;
  for (const [claim, home] of [
    [CLAIMED, false],
    [{ status: 409, body: { ok: false, error: { message: "Fixture Barbers is already set up." } } }, true],
  ]) {
    auth = { session: null, verifyOtp: () => ({ error: null }) };
    await openFromLink("open", { [CLAIM]: claim });
    type("password", "correct horse battery");
    await press();
    assert.equal(await step().onSubmit("123456"), null);
    assert.deepEqual(postedTo("/api/v1/preview-claims"), [{ token: TOKEN }], "claimed once, signed in now");
    if (home) assert.deepEqual(went, ["/"], "home, where the first screen asks again and says why");
    else assert.match(went[0] ?? "", /^\/w\/fixture-barbers\b.*start/, "its first run");
  }
});

test("signed in, from a preview's link: one press makes it theirs; refused, the door's words; or another account", async () => {
  let signedOut = 0;
  let reloaded = 0;
  window.location.reload = () => (reloaded += 1);
  auth = { session: { user: { email: "ada@example.com" } }, signOut: () => ((signedOut += 1), { error: null }) };
  await openFromLink("invite", { [CLAIM]: CLAIMED });
  assert.equal(card().props["data-testid"], "signup-claim", "no form, no code: one press");
  assert.ok(
    textOf(card()).includes(W.title("Fixture Barbers")) && textOf(card()).includes(W.signedIn("ada@example.com")),
  );
  byId("signup-claim-press").props.onClick();
  await settle();
  assert.deepEqual(postedTo("/api/v1/preview-claims"), [{ token: TOKEN }]);
  assert.match(went[0] ?? "", /^\/w\/fixture-barbers\b.*start/, "its first run");

  await openFromLink("open", {
    [CLAIM]: { status: 409, body: { ok: false, error: { message: "Fixture Barbers is already set up." } } },
  });
  byId("signup-claim-press").props.onClick();
  await settle();
  assert.equal(said(), "Fixture Barbers is already set up.");
  assert.deepEqual(went, [], "and nothing opened");
  assert.equal(byId("signup-claim-press").props.disabled, false, "and it can be pressed again");

  await find((n) => n.type === "button" && textOf(n) === W.other).props.onClick();
  assert.deepEqual([signedOut, reloaded], [1, 1], "signed out, and the page is the form again");
  delete window.location.reload;
  preview = null;
});
