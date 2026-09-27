/**
 * The first-workspace screen: joining the waitlist where it is offered, and a way out of the screen.
 *
 * - With sign-up on a waitlist, the screen's "Join the list" sent a signed-in person to /signup, and the middleware
 *   sends a signed-in person away from /signup, back to the same screen: a loop (the wiring audit's N1). Sign-up is
 *   open today, so no one meets it yet.
 * - The screen had no sign-out, no way back and no Terms or Privacy (N2): somebody signed in with the wrong account
 *   could only close the tab.
 * The joining is run through its bridge helper over a stand-in window, the way apiFor is run in
 * shell-status.test.mjs, and through the real screen on a stub React, the way the legacy pages are rendered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SIGNUP_WORDS, SignupSchema } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCREEN = path.join(ROOT, "apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx");

/* ------------------------------ a stub React ------------------------------ */

// The screen imports useState from "react", and under this runner's react-server condition React exports none. The
// stub is set on that same module object before the screen runs, so the screen's own calls reach it; the elements it
// draws come from the global React its JSX compiles to. A setter marks the screen changed, and `settle` draws again.
const react = createRequire(SCREEN)("react");
let cells = [];
let at = 0;
let dirty = false;
let last = null;
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
// An effect runs once per mount, on arrival, as React runs it; a ref keeps its box across draws. Both sit in the
// same cells as the state, so `render` (a fresh mount) starts them over.
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
  createElement: (type, props, ...kids) => {
    const node = { type, props: { ...(props || {}), children: kids.flat(Infinity) } };
    if (typeof type === "function") node.rendered = type(node.props);
    return node;
  },
};
const screenModule = await import(pathToFileURL(SCREEN).href);
const CreateWorkspace =
  typeof screenModule.default === "function" ? screenModule.default : screenModule.default.default;
const helper = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/legacy-bridge/waitlist.ts")).href).catch(
  () => null,
);
const HAS = "the screen has a way to join the list itself";

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
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const pressOf = () => ({
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});
const flush = () => new Promise((r) => setImmediate(r));
const draw = (props) => {
  at = 0;
  dirty = false;
  last = CreateWorkspace(props);
  return last;
};
const render = (props) => {
  cells = [];
  return draw(props);
};
const settle = async (props) => {
  for (let i = 0; i < 8; i++) {
    await flush();
    if (dirty) draw(props);
  }
  return last;
};

/** A window that records what is asked of it: each request, each trip elsewhere, each sign-out. */
const standIn = (answer) => {
  const w = { asked: [], went: [], signedOut: 0 };
  w.location = { origin: "https://app.chanlytics.com", assign: (to) => w.went.push(to) };
  w.__shell = {
    signOut: () => {
      w.signedOut += 1;
    },
  };
  w.fetch = async (url, init = {}) => {
    w.asked.push({
      url: String(url),
      method: init.method,
      type: new Headers(init.headers).get("content-type"),
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  };
  return w;
};
const LUNA = { name: "Luna Studio", email: "owner@luna.example" };
const ON_THE_LIST = { status: 200, body: { ok: true, data: { sent: true, waitlisted: true, next: null } } };

/* ------------------------------ the helper ------------------------------ */

test("REGRESSION (N1): joining the list from the first-workspace screen posts the list and says so -- it sent a signed-in person to /signup, which sent them back", async () => {
  assert.ok(
    helper && typeof helper.joinWaitlistFrom === "function",
    `REGRESSION: ${HAS}; its button only went to /signup`,
  );
  const w = standIn(ON_THE_LIST);
  const out = await helper.joinWaitlistFrom(w, { name: "  Luna Studio  ", email: "owner@luna.example" });
  assert.deepEqual(w.went, [], "REGRESSION: no trip to /signup, which bounces a signed-in person back to this screen");
  assert.deepEqual(
    w.asked,
    [{ url: "/api/v1/signup", method: "POST", type: "application/json", body: LUNA }],
    "one same-origin post of the list's two details",
  );
  assert.deepEqual(out, { ok: true, sentence: SIGNUP_WORDS.waitlistSent("owner@luna.example") });
});

test("the list's refusal is said in the server's own words, and nothing else happens", async () => {
  assert.ok(helper, HAS);
  const w = standIn({
    status: 429,
    body: { ok: false, error: { code: "rate_limited", message: "Too many tries from this network. Wait a minute." } },
  });
  assert.deepEqual(await helper.joinWaitlistFrom(w, LUNA), {
    ok: false,
    message: "Too many tries from this network. Wait a minute.",
  });
  assert.deepEqual(w.went, []);
});

test("a name the list would refuse is said before anything is sent, in the list's own words", async () => {
  assert.ok(helper, HAS);
  const w = standIn(ON_THE_LIST);
  const said = SignupSchema.safeParse({ name: "L", email: LUNA.email }).error.issues[0].message;
  assert.deepEqual(await helper.joinWaitlistFrom(w, { name: "L", email: LUNA.email }), { ok: false, message: said });
  assert.deepEqual(w.asked, [], "nothing went out");
});

test("a network that fails is said as one, for a person, not as the browser's error", async () => {
  assert.ok(helper, HAS);
  const out = await helper.joinWaitlistFrom(standIn(new TypeError("Failed to fetch")), LUNA);
  assert.deepEqual(out, { ok: false, message: SIGNUP_WORDS.unreachable });
  assert.ok(typeof out.message === "string" && !out.message.includes("Failed to fetch"), "said for a person");
});

test("an answer that is not the list's is not taken for a yes", async () => {
  assert.ok(helper, HAS);
  const out = await helper.joinWaitlistFrom(
    standIn({ status: 200, body: { ok: true, data: { sent: true, next: null } } }),
    LUNA,
  );
  assert.deepEqual(
    out,
    { ok: false, message: SIGNUP_WORDS.waitlistNotJoined },
    "a sign-up that was not put on the list did not join it",
  );
});

/* ------------------------------ the screen ------------------------------ */

const FIRST = (posture) => ({ email: "owner@luna.example", posture, onCreated() {} });

test("REGRESSION (N1): behind a waitlist the screen is the list's own form, and Join the list joins it there -- the button went to /signup", async () => {
  const w = standIn({
    status: 429,
    body: { ok: false, error: { code: "rate_limited", message: "Too many tries from this network. Wait a minute." } },
  });
  globalThis.window = w;
  const props = FIRST("waitlist");
  let tree = render(props);
  assert.ok(
    find(tree, (n) => n.type === "form"),
    "REGRESSION: the card was a button to /signup, with no form",
  );
  const nameBox = () => find(last, (n) => n.type === "input" && n.props["aria-label"] === "Business name");
  assert.ok(nameBox(), "it asks for the business's name, as the list does");
  assert.ok(
    textOf(tree).includes(SIGNUP_WORDS.waitlistWriteTo("owner@luna.example")),
    "and says where the list will write",
  );
  nameBox().props.onChange({ target: { value: "Luna Studio" } });
  tree = draw(props);

  // A refusal: said where the press was, and the button is pressable again.
  let press = pressOf();
  find(tree, (n) => n.type === "form").props.onSubmit(press);
  assert.ok(press.prevented, "the page stays where it is");
  tree = await settle(props);
  assert.deepEqual(w.went, [], "REGRESSION: no trip to /signup");
  assert.equal(
    textOf(find(tree, (n) => n.props?.role === "alert")),
    "Too many tries from this network. Wait a minute.",
  );
  assert.notEqual(byTestId(tree, "create-workspace-join").props.disabled, true, "and it can be pressed again");

  // A yes: the list's sentence, in place of the form.
  const yes = standIn(ON_THE_LIST);
  globalThis.window = yes;
  press = pressOf();
  find(tree, (n) => n.type === "form").props.onSubmit(press);
  assert.equal(
    textOf(byTestId(draw(props), "create-workspace-join")),
    "Joining…",
    "the press is answered while it goes",
  );
  tree = await settle(props);
  assert.deepEqual(
    yes.asked.map((a) => [a.url, a.body]),
    [["/api/v1/signup", LUNA]],
    "the list's two details, posted from this screen",
  );
  assert.equal(textOf(byTestId(tree, "create-workspace-joined")), SIGNUP_WORDS.waitlistSent("owner@luna.example"));
  assert.equal(nameBox(), null, "and nothing is left to fill in");
});

test("REGRESSION (N2): every first-workspace screen offers Sign out, the terms and the privacy policy -- the screen had no way out and no legal links", () => {
  const w = standIn(ON_THE_LIST);
  globalThis.window = w;
  for (const posture of ["open", "invite", "waitlist"]) {
    const tree = render(FIRST(posture));
    const links = all(tree, (n) => typeof n.props?.href === "string").map((n) => [n.props.href, textOf(n).trim()]);
    assert.deepEqual(
      links,
      [
        ["/terms", "Terms of service"],
        ["/privacy", "Privacy policy"],
      ],
      `REGRESSION: the ${posture} screen had no legal links`,
    );
    const out = byTestId(tree, "create-workspace-signout");
    assert.ok(out, `REGRESSION: the ${posture} screen had no way out`);
    assert.equal(textOf(out).trim(), "Sign out");
    out.props.onClick(pressOf());
  }
  assert.equal(w.signedOut, 3, "each signs out through the shell, as the account menu does");
  const another = render({ email: "owner@luna.example", onCreated() {}, onCancel() {} });
  assert.equal(
    byTestId(another, "create-workspace-signout"),
    null,
    "another workspace, opened from inside the app, keeps Back and the app's own menu",
  );
  assert.ok(byTestId(another, "create-workspace-back"));
});

/* ------------------------------ create once (F5) ------------------------------ */

const MADE = {
  status: 200,
  body: {
    ok: true,
    data: {
      workspace: {
        id: "w1",
        slug: "luna-studio",
        name: "Luna Studio",
        status: "active",
        timezone: "America/New_York",
        locale: "en",
      },
    },
  },
};
const KEPT = { name: "Luna Studio", timezone: "America/New_York" };

test("create once (F5): a first workspace whose name sign-up kept is made as the screen opens -- nothing asked twice", async () => {
  const w = standIn(MADE);
  globalThis.window = w;
  const created = [];
  const props = { email: "owner@luna.example", posture: "open", initial: KEPT, onCreated: (x) => created.push(x) };
  const tree = render(props);
  const making = byTestId(tree, "cw-making");
  assert.ok(making, "the screen says the workspace is being made");
  assert.equal(textOf(making), `Luna Studio${SIGNUP_WORDS.making}`);
  assert.equal(
    find(tree, (n) => n.type === "form"),
    null,
    "and asks nothing: the name and the clock are sign-up's",
  );
  await settle(props);
  assert.deepEqual(
    w.asked.map((a) => [a.url, a.method, a.body]),
    [["/api/v1/workspaces/create", "POST", { name: "Luna Studio", timezone: "America/New_York" }]],
    "one create, from sign-up's answers",
  );
  assert.deepEqual(
    created.map((x) => x.slug),
    ["luna-studio"],
  );
});

test("create once: a refusal leaves the form, filled in, with the server's sentence, and the owner can press again", async () => {
  const w = standIn({
    status: 403,
    body: { ok: false, error: { code: "forbidden", message: SIGNUP_WORDS.codeWrong } },
  });
  globalThis.window = w;
  const props = { email: "owner@luna.example", posture: "invite", initial: KEPT, onCreated() {} };
  render(props);
  const tree = await settle(props);
  assert.equal(byTestId(tree, "cw-making"), null, "the making screen gives way to the form");
  assert.ok(
    find(tree, (n) => n.type === "form"),
    "the form, to press again",
  );
  assert.ok(
    find(tree, (n) => n.type === "input" && n.props.value === "Luna Studio"),
    "with sign-up's name in it",
  );
  assert.equal(textOf(find(tree, (n) => n.props?.role === "alert")), SIGNUP_WORDS.codeWrong);
  assert.equal(w.asked.length, 1, "asked once on arrival, and not again by itself");
});

test("create once: another workspace, from inside the app, is never made on arrival", async () => {
  const w = standIn(MADE);
  globalThis.window = w;
  const props = { email: "owner@luna.example", initial: KEPT, onCreated() {}, onCancel() {} };
  const tree = render(props);
  await settle(props);
  assert.equal(byTestId(tree, "cw-making"), null);
  assert.deepEqual(w.asked, [], "nothing posted until it is pressed");
});

test("V1: a first workspace with no name kept from sign-up (a Google sign-up) is asked for the business, and nothing else", () => {
  globalThis.window = standIn(MADE);
  const tree = render({ email: "owner@luna.example", posture: "open", onCreated() {} });
  assert.equal(textOf(byTestId(tree, "cw-kicker")), "Step 1 of 4 · Your business", "the first run's first step, begun");
  assert.equal(textOf(find(tree, (n) => n.type === "h1")), SIGNUP_WORDS.nameTitle);
  assert.equal(
    find(tree, (n) => n.type === "select"),
    null,
    "the zone is the device's, as email sign-up keeps it",
  );
  assert.equal(textOf(find(tree, (n) => n.type === "button" && n.props.type === "submit")), SIGNUP_WORDS.nameCta);
  assert.equal(
    find(tree, (n) => n.props?.["aria-label"] === "Invite code"),
    null,
    "no code while sign-up is open",
  );
  const invite = render({ email: "owner@luna.example", posture: "invite", onCreated() {} });
  assert.ok(
    find(invite, (n) => n.props?.["aria-label"] === "Invite code"),
    "the code is asked here while sign-up is by invitation",
  );
  assert.ok(byTestId(invite, "create-workspace-signout"), "and the way out stays");
});

test("V1: another workspace, from inside the app, keeps its own form -- its title, its zone and Back", () => {
  globalThis.window = standIn(MADE);
  const tree = render({ email: "owner@luna.example", onCreated() {}, onCancel() {} });
  assert.equal(byTestId(tree, "cw-kicker"), null);
  assert.equal(textOf(find(tree, (n) => n.type === "h1")), "New workspace");
  assert.ok(
    find(tree, (n) => n.type === "select"),
    "the zone is asked",
  );
  assert.ok(byTestId(tree, "create-workspace-back"));
});

/* ------------------------------ a partner's link (0012) ------------------------------ */

test("a partner's link: the screen asks before the partner joins the team, sends their code only with the yes, and forgets the link", async () => {
  const w = standIn(MADE);
  globalThis.window = w;
  globalThis.document = { cookie: "sb-a=1; chanlytics_partner=ada-co" };
  try {
    const props = { email: "owner@luna.example", posture: "open", initial: KEPT, onCreated() {} };
    let tree = render(props);
    await settle(props);
    assert.equal(byTestId(tree, "cw-making"), null, "not made on arrival: there is a question first");
    assert.deepEqual(w.asked, []);
    assert.match(textOf(byTestId(tree, "create-workspace-partner")), /Add ada-co, who sent you here, to your team/);
    assert.equal(
      byTestId(tree, "create-workspace-partner-yes").props.checked,
      true,
      "yes is the default, and theirs to take back",
    );

    const form = find(tree, (n) => n.type === "form");
    await form.props.onSubmit({ preventDefault() {} });
    tree = await settle(props);
    assert.deepEqual(w.asked.at(-1).body, {
      name: "Luna Studio",
      timezone: "America/New_York",
      partner: "ada-co",
    });
    assert.match(globalThis.document.cookie, /^chanlytics_partner=; Max-Age=0/, "the link is used once");

    // Said no: the same screen, and the code is not sent.
    globalThis.document = { cookie: "chanlytics_partner=ada-co" };
    const w2 = standIn(MADE);
    globalThis.window = w2;
    let again = render(props);
    byTestId(again, "create-workspace-partner-yes").props.onChange({ target: { checked: false } });
    again = draw(props);
    await find(again, (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
    await settle(props);
    assert.equal("partner" in w2.asked.at(-1).body, false, "no yes, no partner");
  } finally {
    delete globalThis.document;
  }
});
