/**
 * A reach-out on Playbooks and on Templates (Reach out, Part 4 PR 8), run on the stub React over the surface's own
 * words (surfaces/campaigns/reach-out/surface.ts, contracts reach-out-sheet.ts) and its verbs stubbed on the surface's
 * one `reachOuts` object, which the TSX row imports (a test sets what a verb answers there, as it once set
 * `window.__reachOuts`):
 *
 * - Playbooks: a chain is one row among the moments, with its steps, its search and its next run as they are (R23);
 *   its report is read when the row opens, never before, and its table is the report's counts and nothing else; Pause
 *   or Resume presses the chain's first step; Remove is offered only while the report says it may go (R16), asks
 *   first, and presses the chain's own door; the held open their run (R20); stopping one business is said (R24);
 *   a report that could not be read says so and reads again on Retry; a refusal is said as every refusal is; a
 *   viewer's acts are inert (the real gate); the head counts the chains; a link to a chain opens its row and is
 *   "gone" only once the chains were read; Edit opens the reach-out sheet over the chain, for a role that may change it.
 * - Templates: a chain's emails are their own rows (contracts emailTemplateRowsOf over __REACH_OUTS, R19), with the
 *   Email chip and what sends them (their chain's row); Edit in its reach-out opens the sheet over its chain (its
 *   Playbooks row for a role that may not change it); how many one wrote is read when it opens, never before; no
 *   WhatsApp or Text switch and no delete; the page counts them and says so in its hover; an email-only workspace is
 *   not "nothing on file", and a reach-outs read that failed is said.
 * - The bridge: the verbs press the doors they name, and the surface reads the chains and nothing more.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const went = [];
const toasts = [];
Object.assign(W, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  // The role store's gate is data-bits.jsx's own (window.gate, canDo, gateTitle), over this role and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  usePPToast: () => [null, (t) => toasts.push(t)],
  __surfaceState: () => "live",
  useHotkey: () => {},
});
// The shell's own parts (Confirm, StatePill, the role gate, the record kit) are still JSX the frame loads.
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
// The pages and their rows are TSX (decision 0015): Playbooks, Templates, and the reach-out's row, sheet and email row.
const S = "../../../../apps/dashboard/src/surfaces";
const { ReachOutRow } = await import(`${S}/campaigns/reach-out/row.tsx`);
const { PlaybooksPage } = await import(`${S}/campaigns/playbooks/playbooks-page.tsx`);
const { TemplatesPage } = await import(`${S}/campaigns/templates/templates-page.tsx`);
const { setSurfaceValue, surfaceValue } = await import(`${S}/surface-values.ts`);
const bridge = await import(`${S}/campaigns/reach-out/surface.ts`);
const WORDS = bridge.reachOuts.words;
// The verbs as the surface has them: a test stubs some on the surface's one object, and `realVerbs()` puts every one back.
const REAL_VERBS = { ...bridge.reachOuts };
const realVerbs = (stubs = {}) => Object.assign(bridge.reachOuts, REAL_VERBS, stubs);

const ZONE = "America/Chicago";
const ROOT = "r1";
const chainOf = (over = {}, next = {}) => ({
  root_id: ROOT,
  name: "Reach out · Personal trainers",
  search: { id: "s1", name: "Personal trainers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  domains: [{ host: "harbor-mail.example", sent_days: 0 }],
  steps: [
    {
      id: ROOT,
      n: 0,
      after_days: null,
      subject: "Quick one for {{business}}",
      body: "{{opening}}\n\n{{your name}}",
      template_id: "t1",
      state: "running",
    },
    { id: "n1", n: 1, after_days: 4, subject: null, body: "Just checking in.", template_id: "t2", state: "running" },
  ],
  next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null, ...next },
  ...over,
});
const REPORT = (over = {}) => ({
  steps: [
    {
      id: ROOT,
      n: 0,
      written: 44,
      delivered: 42,
      wrote_back: 5,
      interested: 2,
      booked: 1,
      said_no: 3,
      bounced: 2,
      waiting: 0,
      held: 0,
    },
    // A report read before 00241 says nothing of interested or booked: the row says it does not know, never a zero.
    { id: "n1", n: 1, written: 28, delivered: 28, wrote_back: 3, said_no: 1, bounced: 0, waiting: 5, held: 2 },
  ],
  runs: [
    { id: "b2", step_id: "n1", run_for: "2026-09-25", state: "sending", planned: 7, written: 5, held: 2 },
    { id: "b1", step_id: ROOT, run_for: "2026-09-24", state: "sent", planned: 30, written: 30, held: 0 },
  ],
  can_remove: false,
  ...over,
});
const REACH = { ready: 0, with_unconfirmed: 0, phone_only: 72, of: 160, chain: ROOT };

/** The verbs, stubbed: each press recorded, each report answered as the test says. */
const verbs = (report = REPORT(), ok = true) => {
  const pressed = [];
  realVerbs({
    report: async (id) => (
      pressed.push(["report", id]),
      ok ? { ok: true, data: { report, reach: REACH } } : { ok: false, message: "down" }
    ),
    pause: async (id) => (pressed.push(["pause", id]), { ok: true, data: {} }),
    resume: async (id) => (pressed.push(["resume", id]), { ok: true, data: {} }),
    remove: async (id) => (pressed.push(["remove", id]), { ok: true, data: {} }),
    reach: async (id) => (pressed.push(["reach", id]), { ...REACH, ready: 44, with_unconfirmed: 44 }),
    update: async (id, body) => (
      pressed.push(["update", id, body]),
      { ok: true, data: { root_id: id, step_ids: [], rechecked: 0, start: null } }
    ),
  });
  return pressed;
};

/** One row, drawn as the page draws it, open or not; `state` holds the open flag between draws. */
const row = (chain, state) => {
  const draw = () =>
    W.React.createElement(ReachOutRow, {
      chain,
      canAct: true,
      flash: (t) => toasts.push(t),
      tz: ZONE,
      now: new Date("2026-09-28T13:00:00Z"),
      open: state.open,
      onOpen: () => (state.open = !state.open),
    });
  return { draw, redraw: () => again(draw) };
};

test("a chain is one row: its steps and domain, its state, its search, and its next run as it is (R23); nothing read yet", () => {
  const pressed = verbs();
  fresh();
  const r = row(chainOf(), { open: false });
  const tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-hint")), "Your email, a short nudge · from harbor-mail.example");
  assert.equal(textOf(byTestId(tree, "ro-search")), "Personal trainers · Austin");
  assert.equal(textOf(byTestId(tree, "ro-next")), "Next run today 09:00.");
  assert.equal(byTestId(tree, "ro-open-body"), null);
  assert.deepEqual(pressed, [], "the report is read when the row opens, never before (R23)");
  // Paused, set to never, held for billing, a run waiting: each said as it is.
  for (const [c, want] of [
    [chainOf({ state: "paused" }), "Paused. Nothing is planned until you resume it."],
    [chainOf({}, { mode: "never" }), "Outreach is set to Never in Settings › Autonomy, so nothing runs."],
    [chainOf({}, { may_spend: false }), "Held for billing: nothing is planned until billing is sorted."],
  ]) {
    fresh();
    assert.equal(textOf(byTestId(row(c, { open: false }).redraw(), "ro-next")), want);
  }
  fresh();
  went.length = 0;
  const waiting = row(chainOf({}, { waiting_run_id: "b9" }), { open: false }).redraw();
  press(byTestId(waiting, "ro-next-run"));
  assert.deepEqual(went, ["broadcasts/run:b9"], "a run waiting opens that run");
});

test("the open row is the report's: its steps counted, its sentence, its runs, the held opening their run (R20), and how to stop one business (R24)", async () => {
  const pressed = verbs();
  fresh();
  const state = { open: true };
  const r = row(chainOf(), state);
  let tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-reading")), "Reading how it is doing…");
  await settle();
  tree = r.redraw();
  assert.deepEqual(pressed, [["report", ROOT]]);
  assert.match(
    textOf(byTestId(tree, "ro-chain")),
    /Your email → after 4 days, nothing back → A short nudge · Stops for anyone who writes back, books or says no\./,
  );
  const cells = all(byTestId(tree, "ro-steps"), (n) => n.type === "td" || n.type === "th").map(textOf);
  assert.deepEqual(cells.slice(0, 9), [
    "Step",
    "When",
    "Written",
    "Delivered",
    "Wrote back",
    "Interested",
    "Booked",
    "Said no",
    "Bounced",
  ]);
  assert.deepEqual(cells.slice(9, 18), [
    "Your email",
    "Day one, in their hours",
    "44",
    "42 (95%)",
    "5 (11%)",
    "2",
    "1",
    "3",
    "2",
  ]);
  assert.deepEqual(cells.slice(18, 27).slice(5, 7), ["—", "—"]);
  assert.match(
    textOf(byTestId(tree, "ro-sentence")),
    /^30 a day from harbor-mail\.example, one every 12 minutes in each business's hours\. 72 written; 8 wrote back; 4 said no; 2 bounced and their addresses were dropped\. 2 wait for your say\.$/,
  );
  went.length = 0;
  press(byTestId(tree, "ro-waiting"));
  assert.deepEqual(went, ["broadcasts/run:b2"], "the held open the run that holds them");
  assert.deepEqual(all(byTestId(tree, "ro-history"), (n) => n.type === "button").map(textOf), [
    "Sep 25 · 5 written · 2 held",
    "Sep 24 · 30 written",
  ]);
  assert.equal(
    textOf(byTestId(tree, "ro-stop-one")),
    "To stop writing to one business, open its lead and press Stop writing to them.",
  );
  assert.equal(byTestId(tree, "ro-remove"), null, "one that wrote is paused, never removed (R16)");
});

test("Pause and Resume press the chain's first step; Remove is offered only while it may go, asks first, and presses the chain's door (R16)", async () => {
  let pressed = verbs();
  fresh();
  let r = row(chainOf(), { open: true });
  r.redraw();
  await settle();
  let tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-toggle")), "Pause");
  press(byTestId(tree, "ro-toggle"));
  await settle();
  assert.deepEqual(pressed.slice(1), [["pause", ROOT]]);
  assert.match(toasts.at(-1).msg, /is paused/);

  pressed = verbs();
  fresh();
  r = row(chainOf({ state: "paused" }), { open: true });
  r.redraw();
  await settle();
  tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-toggle")), "Resume");
  press(byTestId(tree, "ro-toggle"));
  await settle();
  assert.deepEqual(pressed.slice(1), [["resume", ROOT]]);

  pressed = verbs(
    REPORT({
      can_remove: true,
      steps: REPORT().steps.map((s) => ({
        ...s,
        written: 0,
        delivered: 0,
        wrote_back: 0,
        said_no: 0,
        bounced: 0,
        held: 0,
      })),
      runs: [],
    }),
  );
  fresh();
  r = row(chainOf(), { open: true });
  r.redraw();
  await settle();
  tree = r.redraw();
  press(byTestId(tree, "ro-remove"));
  tree = r.redraw();
  assert.ok(byTestId(tree, "ro-remove-yes") || textOf(tree).includes("Yes, remove"), "it asks first");
  assert.deepEqual(pressed.slice(1), [], "nothing is removed before the yes");
  const yes = all(tree, (n) => n.type === "button" && textOf(n) === "Yes, remove")[0];
  press(yes);
  await settle();
  assert.deepEqual(pressed.slice(1), [["remove", ROOT]]);
});

test("a report that could not be read says so, and draws no count", async () => {
  verbs(REPORT(), false);
  fresh();
  const r = row(chainOf(), { open: true });
  r.redraw();
  await settle();
  const tree = r.redraw();
  assert.ok(byTestId(tree, "ro-failed"));
  assert.equal(byTestId(tree, "ro-steps"), null);
  assert.equal(byTestId(tree, "ro-remove"), null, "nothing read, nothing removed");
});

test("Retry on a report that could not be read reads it again, and draws it once it reads", async () => {
  let ok = false;
  const pressed = [];
  realVerbs({
    report: async (id) => (
      pressed.push(id),
      ok ? { ok: true, data: { report: REPORT(), reach: REACH } } : { ok: false }
    ),
  });
  fresh();
  const r = row(chainOf(), { open: true });
  r.redraw();
  await settle();
  let tree = r.redraw();
  assert.ok(byTestId(tree, "ro-failed"));
  ok = true;
  press(byTestId(tree, "ro-failed-retry"));
  r.redraw();
  await settle();
  tree = r.redraw();
  assert.deepEqual(pressed, [ROOT, ROOT], "the report is read again, not the moments' surface");
  assert.equal(byTestId(tree, "ro-failed"), null);
  assert.ok(byTestId(tree, "ro-steps"));
});

test("a refused Pause is said as every refusal is (window.refusalToast), never a blank toast", async () => {
  verbs();
  bridge.reachOuts.pause = async () => ({
    ok: false,
    title: "Not allowed",
    message: "Only an owner or operator can pause a reach-out.",
  });
  fresh();
  const r = row(chainOf(), { open: true });
  r.redraw();
  await settle();
  press(byTestId(r.redraw(), "ro-toggle"));
  await settle();
  const said = toasts.at(-1);
  assert.equal(said.tone, "danger");
  assert.equal(textOf(said.msg), "Not allowed — Only an owner or operator can pause a reach-out.");
});

test("a viewer's Pause, Resume and Remove are inert: the real gate refuses them and nothing is pressed", async () => {
  const was = W.ST_STORE;
  W.ST_STORE = { can: (a) => !!contracts.ROLE_PERMS.viewer[a], myRole: () => "viewer" };
  try {
    for (const c of [chainOf(), chainOf({ state: "paused" })]) {
      const pressed = verbs(REPORT({ can_remove: true }));
      fresh();
      const r = row(c, { open: true });
      r.redraw();
      await settle();
      let tree = r.redraw();
      const toggle = byTestId(tree, "ro-toggle");
      assert.equal(toggle.props["aria-disabled"], true);
      assert.equal(
        toggle.props["data-tip"],
        "Only an owner or operator can " + (c.state === "running" ? "pause" : "resume") + " a reach-out.",
      );
      press(toggle);
      press(byTestId(tree, "ro-remove"));
      await settle();
      tree = r.redraw();
      assert.deepEqual(pressed, [["report", ROOT]], "nothing but the report is read");
      assert.equal(byTestId(tree, "ro-remove-yes"), null, "Remove does not even ask");
      assert.equal(all(tree, (n) => n.type === "button" && textOf(n) === "Yes, remove").length, 0);
    }
  } finally {
    W.ST_STORE = was;
  }
});

/* ------------------------------ the Playbooks page ------------------------------ */

const surface = (over = {}) => ({
  rows: [],
  timezone: ZONE,
  countsRead: true,
  lists: [],
  calendar: "none",
  triggers: [],
  templates: [],
  number: { present: true, health: { state: "ok" } },
  businessName: "Harbor",
  bookingLink: false,
  replyWindow: "24 hours",
  fetchedAt: Date.now(),
  ...over,
});
/** The Playbooks page over its surface and the reach-outs surface (its own: the seam's "reach_outs"). */
const playbooksPage = (s, props = {}, chains = [chainOf()]) => {
  setSurfaceValue("playbooks", s);
  setSurfaceValue("reach_outs", chains);
  fresh();
  return again(() => W.React.createElement(PlaybooksPage, props));
};

test("Playbooks draws each chain as a row among the moments, counts it in the head, and a link to it opens its row", () => {
  verbs();
  let tree = playbooksPage(surface(), {}, [
    chainOf(),
    chainOf({ root_id: "r2", name: "Reach out · Florists", state: "paused" }),
  ]);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-row").length, 2);
  assert.match(textOf(byTestId(tree, "pb-standing")), /1running.*1paused/);
  tree = playbooksPage(surface(), { initialPlaybook: ROOT });
  assert.ok(byTestId(tree, "ro-open-body"), "outbound/<root_id> opens its row");
  assert.equal(byTestId(tree, "pb-gone"), null);
  const refreshed = [];
  W.__refreshSurface = (k) => refreshed.push(k);
  tree = playbooksPage(surface(), {}, null);
  assert.ok(byTestId(tree, "pb-chains-failed"), "a chains read that failed is said, not an empty list");
  press(byTestId(tree, "pb-chains-failed-retry"));
  assert.deepEqual(refreshed, ["reach_outs"], "its Retry reads the reach-outs, not the moments");
});

test("a link to a chain is 'gone' only once the chains were read, and lands on its row when the row arrives", () => {
  verbs();
  // Unread (undefined) or failed (null): a chain's id is not known to be missing.
  for (const unread of [undefined, null]) {
    const tree = playbooksPage(surface(), { initialPlaybook: ROOT }, unread);
    assert.equal(byTestId(tree, "pb-gone"), null, `no "isn't here any more" while the chains are ${unread}`);
  }
  assert.ok(
    byTestId(playbooksPage(surface(), { initialPlaybook: "gone" }, []), "pb-gone"),
    "read, and not there: gone",
  );
  // The row brought into view: again when the chain's row lands after the page drew.
  const scrolled = [];
  const was = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => ({
    getBoundingClientRect: () => ({ top: 2000 }),
    scrollIntoView: () => scrolled.push(id),
  });
  try {
    setSurfaceValue("playbooks", surface());
    setSurfaceValue("reach_outs", undefined);
    fresh();
    again(() => W.React.createElement(PlaybooksPage, { initialPlaybook: ROOT }));
    setSurfaceValue("reach_outs", [chainOf()]);
    again(() => W.React.createElement(PlaybooksPage, { initialPlaybook: ROOT }));
    assert.deepEqual(scrolled, [`pb-${ROOT}`, `pb-${ROOT}`], "brought into view again as its row arrives");
  } finally {
    globalThis.document.getElementById = was;
  }
});

/* ------------------------------ Templates ------------------------------ */

/** The chain Templates lists: its first email, and a nudge whose words have a slot. */
const templatesChain = () =>
  chainOf({
    steps: [
      { ...chainOf().steps[0], body: "{{opening}}" },
      { ...chainOf().steps[1], body: "Just checking in, {{business}}." },
    ],
  });
const WHATSAPP_ROW = {
  id: "w1",
  channel: "whatsapp",
  name: "offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  source: "chanlytics",
  hidden_at: null,
  title: null,
  body_preview: "Our offer.",
  variables: [],
};
// What Templates reads through the seam: the settings surface holds the WhatsApp rows, the numbers and the business's
// words (what `__TEMPLATES_ALL`, `__CHANNELS` and `__SETTINGS` held), the reach_outs surface the chains. `over` names them
// as the test always has; a key that is present and undefined is a read not landed.
const drawTemplates = () => W.React.createElement(TemplatesPage, {});
const templatesPage = (over = {}) => {
  const o = {
    __TEMPLATES_ALL: [WHATSAPP_ROW],
    __REACH_OUTS: [templatesChain()],
    __TEMPLATE_USE: null,
    __TEMPLATE_SENT: null,
    __PLAYBOOKS: undefined,
    __CHANNELS: [{ kind: "whatsapp" }],
    __SETTINGS: { config: { brain: { business_name: "Harbor" } } },
    ...over,
  };
  setSurfaceValue("settings", {
    settings: o.__SETTINGS,
    facts: null,
    channels: o.__CHANNELS,
    templatesAll: o.__TEMPLATES_ALL,
    templateUse: o.__TEMPLATE_USE,
    templateSent: o.__TEMPLATE_SENT,
  });
  setSurfaceValue("reach_outs", o.__REACH_OUTS);
  setSurfaceValue("playbooks", o.__PLAYBOOKS);
  fresh();
  return again(drawTemplates);
};

test("Templates: a chain's emails are their own rows, with the Email chip and what sends them; the page counts them, and its hover says so", () => {
  const pressed = verbs();
  went.length = 0;
  const tree = templatesPage();
  const rows = all(tree, (n) => n.props?.["data-testid"] === "template-email");
  assert.equal(rows.length, 2);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "custom-row").length, 1, "the WhatsApp row is unchanged");
  assert.match(textOf(byTestId(tree, "messages-standing")), /3 templates/, "the page counts both");
  assert.match(
    byTestId(tree, "messages-count").props["data-tip"],
    /on WhatsApp.* The count takes 2 emails of your reach-outs too: their own words, sent by email, with no review\.$/,
    "the hover says what the count takes (contracts' words)",
  );
  const nudge = rows[1];
  assert.equal(textOf(byTestId(nudge, "template-email-chip")), "Email");
  assert.equal(textOf(byTestId(nudge, "template-email-sends")), "Reach out · Personal trainers");
  assert.match(textOf(nudge), /step 2 · after 4 days with nothing back/);
  for (const r of rows) assert.equal(textOf(byTestId(r, "template-email-sent")), "", "closed, no count");
  assert.deepEqual(pressed, [], "the list reads no report (R23)");
  press(byTestId(nudge, "template-email-sends"));
  assert.deepEqual(went, [`outbound/${ROOT}`]);
});

test("an email row says how many it wrote once it opens and its chain's report reads, and nothing when it cannot", async () => {
  let pressed = verbs();
  let tree = templatesPage();
  press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "template-email")[1], "template-email-open"));
  again(drawTemplates);
  await settle();
  tree = again(drawTemplates);
  assert.deepEqual(pressed, [["report", ROOT]], "its chain's report, read as it opens");
  const nudge = all(tree, (n) => n.props?.["data-testid"] === "template-email")[1];
  assert.equal(textOf(byTestId(nudge, "template-email-sent")), "28 sent", "the report's own count for its step");

  pressed = verbs(REPORT(), false);
  tree = templatesPage();
  press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "template-email")[1], "template-email-open"));
  again(drawTemplates);
  await settle();
  tree = again(drawTemplates);
  assert.deepEqual(pressed, [["report", ROOT]]);
  assert.equal(
    textOf(byTestId(all(tree, (n) => n.props?.["data-testid"] === "template-email")[1], "template-email-sent")),
    "",
    "not read, not counted: never a 0",
  );
});

test("Templates: an email-only workspace is not 'nothing on file'; unread says nothing; a reach-outs read that failed is said, with its Retry", () => {
  verbs();
  const bare = { __TEMPLATES_ALL: [], __CHANNELS: [] };
  let tree = templatesPage(bare);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "template-email").length, 2);
  assert.equal(byTestId(tree, "templates-nothing"), null, "its email rows are on file");
  tree = templatesPage({ ...bare, __REACH_OUTS: [] });
  assert.ok(byTestId(tree, "templates-nothing"), "read, and nothing of any kind");
  tree = templatesPage({ ...bare, __REACH_OUTS: undefined });
  assert.equal(byTestId(tree, "templates-nothing"), null, "the chains not read yet: no claim");
  const refreshed = [];
  W.__refreshSurface = (k) => refreshed.push(k);
  tree = templatesPage({ __REACH_OUTS: null });
  assert.equal(byTestId(tree, "templates-nothing"), null);
  assert.match(textOf(byTestId(tree, "templates-email-failed")), /Couldn't read your reach-outs' emails/);
  press(byTestId(tree, "templates-email-failed-retry"));
  assert.deepEqual(refreshed, ["reach_outs"]);
});

test("an open email row: email only, its slots as chips, the check and the foot, Edit in its reach-out; no switch and no delete (R19)", () => {
  went.length = 0;
  verbs();
  let tree = templatesPage();
  press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "template-email")[1], "template-email-open"));
  tree = again(drawTemplates);
  const body = byTestId(tree, "template-email-body");
  assert.equal(textOf(byTestId(body, "template-email-versions")), "a reach-out sends email only");
  assert.deepEqual(
    all(byTestId(body, "template-email-words"), (n) => String(n.props?.className || "").includes("em-slot")).map(
      textOf,
    ),
    ["business"],
  );
  assert.match(textOf(byTestId(body, "template-email-check")), /^Checked before each send/);
  assert.equal(all(body, (n) => n.props?.role === "radiogroup").length, 0, "no WhatsApp or Text switch");
  assert.equal(
    all(body, (n) => /Delete|Rename|Hide/.test(textOf(n)) && n.type === "button").length,
    0,
    "no delete of its own",
  );
  // Edit in its reach-out: the sheet over its chain as the reach_outs surface read it.
  press(byTestId(body, "template-email-edit"));
  tree = again(drawTemplates);
  assert.deepEqual(went, [], "no page change");
  assert.equal(byTestId(tree, "ro-name").props.value, templatesChain().name);
  assert.equal(textOf(byTestId(tree, "ro-start")), "Save");
});

test("an email row's Edit, for a role that may not change the chain, opens its Playbooks row instead", () => {
  went.length = 0;
  verbs();
  const keep = W.ST_STORE;
  W.ST_STORE = { can: (a) => !!contracts.ROLE_PERMS.viewer[a], myRole: () => "viewer" };
  try {
    let tree = templatesPage();
    press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "template-email")[1], "template-email-open"));
    tree = again(drawTemplates);
    press(byTestId(byTestId(tree, "template-email-body"), "template-email-edit"));
    assert.deepEqual(went, [`outbound/${ROOT}`]);
    assert.equal(byTestId(again(drawTemplates), "ro-sheet"), null);
  } finally {
    W.ST_STORE = keep;
  }
});

/* ------------------------------ the bridge ------------------------------ */

test("the bridge's verbs press the doors they name: the report, the first step's state, the chain's removal", async () => {
  realVerbs();
  const calls = [];
  W.__apiForTest = null;
  const api = await import("../../../../apps/dashboard/src/legacy-bridge/api.ts");
  const was = W.fetch;
  W.fetch = async (url, init = {}) => {
    calls.push([
      init.method || "GET",
      new URL(String(url), "https://app.example").pathname,
      init.body ? JSON.parse(init.body) : null,
    ]);
    return new Response(JSON.stringify({ ok: true, data: { report: REPORT(), reach: REACH } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.ok(api.api, "the typed client");
    await bridge.reachOuts.report(ROOT);
    await bridge.reachOuts.pause(ROOT);
    await bridge.reachOuts.resume(ROOT);
    await bridge.reachOuts.remove(ROOT);
  } finally {
    W.fetch = was;
  }
  assert.deepEqual(
    calls.map(([m, p, b]) => [m, p.replace(/^.*\/api\/v1\//, ""), b]),
    [
      ["GET", `reach-outs/${ROOT}`, null],
      ["PUT", `playbooks/${ROOT}`, { state: "paused" }],
      ["PUT", `playbooks/${ROOT}`, { state: "running" }],
      ["DELETE", `reach-outs/${ROOT}`, null],
    ],
  );
});

test("the reach-outs surface reads the chains and nothing more: no report, set as soon as they are read, null when unread", async () => {
  const was = W.fetch;
  const read = [];
  W.fetch = async (url) => {
    const path = new URL(String(url), "https://app.example").pathname;
    read.push(path.replace(/^.*\/api\/v1\//, ""));
    return new Response(JSON.stringify({ ok: true, data: { chains: [chainOf()] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await bridge.reachOutsOverride.apply();
    assert.deepEqual(read, ["reach-outs"], "one read, no report: every page pays it, so it scans no audience (R23)");
    // Set on the seam the pages read (`useSurface("reach_outs")`), and mirrored under the name Leads still reads.
    const chains = surfaceValue("reach_outs");
    assert.equal(chains.length, 1);
    assert.equal(W.__REACH_OUTS, chains, "the mirror is the one object");
    // Templates' rows are contracts' over the chains: each step with words, and no count of what it wrote.
    assert.deepEqual(
      WORDS.emailTemplateRowsOf(chains).map((r) => [r.template_id, r.step_id, r.step_n, "written" in r]),
      [
        ["t1", ROOT, 0, false],
        ["t2", "n1", 1, false],
      ],
    );
    W.fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "down" } }), { status: 500 });
    await assert.rejects(bridge.reachOutsOverride.apply());
    assert.equal(surfaceValue("reach_outs"), null, "unread is null, never an empty list");
    assert.equal(W.__REACH_OUTS, null, "and the mirror says the same");
  } finally {
    W.fetch = was;
  }
  assert.equal(bridge.reachOutsOverride.value, "reach_outs", "the tab's cache keeps the value under its seam key");
});

test("who may press is the role store's one answer: a viewer is told by it, and a partner acts as an operator does (00201)", async () => {
  verbs();
  fresh();
  const draw = (canAct) =>
    again(() =>
      W.React.createElement(ReachOutRow, {
        chain: chainOf(),
        canAct,
        flash: () => {},
        tz: ZONE,
        open: true,
        onOpen: () => {},
      }),
    );
  draw(false);
  await settle();
  assert.equal(
    textOf(byTestId(draw(false), "ro-role")),
    W.gateTitle("approve", "change, pause, resume or remove a reach-out"),
    "the gate's own words, never the row's",
  );
  assert.equal(byTestId(draw(true), "ro-role"), null);
  assert.equal(contracts.ROLE_PERMS.partner.approve, true, "a partner may approve, and so press a chain's acts");
});

test("Edit opens the reach-out sheet over the chain as read, saves through its own door, and is out of a viewer's sight", async () => {
  const pressed = verbs();
  // The sheet reads the business's words through the settings seam, and its sending domains from Setup (still the shell's).
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Harbor" } } },
    facts: null,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
  });
  W.__SETUP = {
    dto: {
      email: {
        mailbox: null,
        sending: {
          domains: [
            {
              id: "d1",
              host: "harbor-mail.example",
              from_name: "Sam",
              address: "sam@harbor-mail.example",
              state: "verified",
              sent_days: 0,
            },
          ],
        },
      },
    },
  };
  fresh();
  const state = { open: true };
  const r = row(chainOf(), state);
  r.redraw();
  await settle();
  let tree = r.redraw();
  assert.equal(byTestId(tree, "ro-edit-note"), null, "no note that it can't be changed");
  press(byTestId(tree, "ro-edit"));
  r.redraw();
  await settle();
  tree = r.redraw();
  assert.equal(byTestId(tree, "ro-name").props.value, "Reach out · Personal trainers");
  assert.equal(byTestId(tree, "ro-signed").props.value, "Sam");
  press(byTestId(tree, "ro-start"));
  await settle();
  const [, id, body] = pressed.find((p) => p[0] === "update");
  assert.equal(id, ROOT);
  assert.deepEqual(
    body.steps.map((x) => x.id),
    [ROOT, "n1"],
  );
  assert.equal(textOf(byTestId(r.redraw(), "ro-saved")), "Saved. Its next run writes these words.");
  press(byTestId(r.redraw(), "ro-close"));
  assert.equal(byTestId(r.redraw(), "ro-sheet"), null);
  // A chain whose search is gone has nothing to write to: no Edit.
  fresh();
  const gone = row(chainOf({ search: null }), { open: true });
  gone.redraw();
  await settle();
  assert.equal(byTestId(gone.redraw(), "ro-edit"), null);
  // A viewer: out of sight (a secondary act), and the row says why once.
  const keep = W.ST_STORE;
  W.ST_STORE = { can: (a) => !!contracts.ROLE_PERMS.viewer[a], myRole: () => "viewer" };
  try {
    fresh();
    const v = row(chainOf(), { open: true });
    v.redraw();
    await settle();
    assert.equal(byTestId(v.redraw(), "ro-edit"), null);
  } finally {
    W.ST_STORE = keep;
  }
});
