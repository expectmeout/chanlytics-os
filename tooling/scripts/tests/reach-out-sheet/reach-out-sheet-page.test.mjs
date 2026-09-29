/**
 * The reach-out sheet and the Leads door (Reach out, Part 4 PR 6), run on the stub React over the bridge's own words
 * (legacy-bridge/reach-out/reach-outs.ts, contracts reach-out-draft.ts and reach-out-sheet.ts) and a stubbed
 * `window.__reachOuts`: who gets it as the database counts it; each field's problems in contracts' words and Start held
 * until there are none; a slot put in at the caret; the steps; the pace and the domains; one business's email at a time,
 * asked for by a press, its refusals said; Start saving exactly ReachOutChainSchema's shape and the sheet staying open
 * to say what the run did (R14); an edit passing its steps' ids; the domains and the booking link unread said as
 * reading, never as none; and the door on a search, by role and by what the search holds (F10). The bridge's verbs
 * press the routes they name, and a search's reach is held by read-cache.ts until a write. The shell's own toast
 * (data-bits usePPToast) is the real one here: nothing the sheet says rides on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const went = [];
/** Roles through the one role table the server enforces (contracts ROLE_PERMS), View-as on top, as settings.jsx has it. */
const role = { real: "owner", viewAs: null };
Object.assign(W, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  ST_STORE: {
    myRole: () => role.viewAs || role.real,
    can: (a) => !!(contracts.ROLE_PERMS[role.viewAs || role.real] || {})[a],
    get: (k, fallback) => fallback,
  },
  __ME: { id: "u1", display_name: "Sam Rivera" },
  __SETTINGS: { config: { brain: { business_name: "Harbor Moving Co" } }, broken: null },
});
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/components/record-fold.jsx`);
await import(`${L}/components/record-sheet.jsx`);
await import(`${L}/pages/playbook-bits.jsx`);
await import(`${L}/pages/reach-out/reach-out-sheet.jsx`);
await import(`${L}/pages/reach-out/reach-out-door.jsx`);
const bridge = await import("../../../../apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts");
const WORDS = bridge.reachOuts.words;

const SEARCH = { id: "44444444-4444-4444-8444-444444444444", name: "Personal trainers · Austin" };
const REACH = { ready: 44, with_unconfirmed: 88, phone_only: 72, of: 160, chain: null };
const DOMAIN = (over = {}) => ({
  id: "d1",
  host: "harbor-mail.example",
  from_local: "sam",
  from_name: "Sam at Harbor",
  address: "sam@harbor-mail.example",
  state: "verified",
  sent_days: 0,
  ...over,
});
const setup = (domains = [DOMAIN()]) => {
  W.__SETUP = { dto: { email: { mailbox: { address: "harbor@mail.example" }, sending: { ready: true, domains } } } };
};

/** The verbs, stubbed: each call recorded, each answered as the test says. */
const verbs = (answers = {}) => {
  const calls = [];
  W.__reachOuts = {
    words: WORDS,
    reach: async (id) => (calls.push(["reach", id]), answers.reach === undefined ? REACH : answers.reach),
    save: async (body) => (calls.push(["save", body]), answers.save ?? { ok: true, data: SAVED() }),
    update: async (id, body) => (calls.push(["update", id, body]), { ok: true, data: { ...SAVED(), start: null } }),
    preview: async (body) => (
      calls.push(["preview", body]),
      answers.preview ? answers.preview(body) : { ok: true, data: { preview: PREVIEW(body.index) } }
    ),
  };
  return calls;
};
const SAVED = () => ({
  root_id: "r1",
  step_ids: ["r1"],
  rechecked: 0,
  start: { outcome: "held", reason: "waiting_for_you", planned: 30, run_id: "b1" },
});
const PREVIEW = (index) => ({
  lead: { id: `l${index}`, business_name: `Studio ${index + 1}`, email: `owner@studio${index + 1}.example` },
  subject: `A quick one for Studio ${index + 1}`,
  body: "A 4.9 from 16 reviews says people find you.\n\nI run Harbor Moving Co.\n\nSam",
  opening: "A 4.9 from 16 reviews says people find you.",
  angle: "their reviews",
  hold: null,
  detail: null,
  refused: null,
  unavailable: false,
});

/** The sheet, drawn as the door or a row draws it; `state` holds what the test pressed between draws. */
const sheet = (props = {}) => {
  const done = [];
  const draw = () =>
    W.React.createElement(W.ReachOutSheet, {
      search: SEARCH,
      onClose: () => done.push("closed"),
      onDone: (saved) => done.push(saved),
      ...props,
    });
  fresh();
  again(draw);
  return { draw: () => again(draw), done };
};
const typeInto = (node, value, at = value.length) => node.props.onChange({ target: { value, selectionStart: at } });

test("who gets it: the search's reach as the database counts it, the unconfirmed held with their door", async () => {
  setup();
  const calls = verbs();
  const s = sheet();
  await settle();
  const tree = s.draw();
  assert.deepEqual(calls[0], ["reach", SEARCH.id]);
  assert.equal(textOf(byTestId(tree, "ro-reach-count")), "44");
  assert.match(textOf(byTestId(tree, "ro-reach")), /of 160 on the search/);
  assert.match(textOf(byTestId(tree, "ro-reach")), /44 unconfirmed addresses, held/);
  assert.equal(textOf(byTestId(tree, "ro-who-line")), contracts.REACH_OUT_SHEET_WORDS.who);
  press(byTestId(tree, "ro-include"));
  const included = s.draw();
  assert.match(
    textOf(byTestId(included, "ro-who-line")),
    /unconfirmed/,
    "R22: who it writes to says them once included",
  );
  assert.notEqual(textOf(byTestId(included, "ro-who-line")), contracts.REACH_OUT_SHEET_WORDS.who);
  assert.equal(byTestId(tree, "ro-name").props.value, "Reach out · Personal trainers · Austin");
  assert.equal(byTestId(tree, "ro-signed").props.value, "Sam", "signed with the member's first name");
  assert.equal(
    textOf(byTestId(tree, "ro-stop-one")),
    "To stop writing to one business, mark its lead Said no or Not a fit.",
  );
});

test("each field's problems are said under it in contracts' words, and Start waits until there are none", async () => {
  setup();
  verbs();
  const s = sheet();
  await settle();
  let tree = s.draw();
  assert.equal(byTestId(tree, "ro-start").props.disabled, false, "the starting words go as they are");
  typeInto(byTestId(tree, "ro-body"), "Hi {{first name}}");
  tree = s.draw();
  assert.match(
    textOf(byTestId(tree, "ro-body-issues-0")),
    /\{\{first name\}\} isn't one of the slots\. Use the chips below\./,
  );
  assert.equal(byTestId(tree, "ro-start").props.disabled, true);
  typeInto(byTestId(tree, "ro-body"), "Book here: {{booking link}}");
  tree = s.draw();
  assert.match(textOf(byTestId(tree, "ro-chain-issues")), /Add your booking link in Settings › Business first/, "F8");
});

test("a slot chip puts its slot in at the caret of the field last focused", async () => {
  setup();
  verbs();
  const s = sheet();
  await settle();
  let tree = s.draw();
  typeInto(byTestId(tree, "ro-body"), "Hello  there");
  tree = s.draw();
  byTestId(tree, "ro-body").props.onFocus({ target: { selectionStart: 6 } });
  press(byTestId(tree, "ro-slot-business"));
  tree = s.draw();
  assert.equal(byTestId(tree, "ro-body").props.value, "Hello {{business}} there");
});

test("steps: another is a short nudge four days on, up to five, and the last may be taken off", async () => {
  setup();
  verbs();
  const s = sheet();
  await settle();
  let tree = s.draw();
  press(byTestId(tree, "ro-add"));
  tree = s.draw();
  assert.match(textOf(byTestId(tree, "ro-step-1")), /A short nudge/);
  assert.equal(byTestId(tree, "ro-after-1").props.value, 4);
  for (let i = 0; i < 5; i += 1) {
    const add = byTestId(s.draw(), "ro-add");
    if (add) press(add);
  }
  tree = s.draw();
  assert.equal(all(tree, (n) => /^ro-step-\d$/.test(n.props?.["data-testid"] || "")).length, 4, "five in all");
  assert.equal(byTestId(tree, "ro-add"), null);
  press(byTestId(tree, "ro-remove"));
  assert.equal(all(s.draw(), (n) => /^ro-step-\d$/.test(n.props?.["data-testid"] || "")).length, 3);
});

test("a call or a note for you ends the chain: offered, written, saved with its hand, and the door's refusal said (G20)", async () => {
  setup();
  const calls = verbs({ save: { ok: false, message: contracts.REACH_OUT_REFUSALS.handLast } });
  const s = sheet();
  await settle();
  let tree = s.draw();
  assert.equal(textOf(byTestId(tree, "ro-add-call")).trim(), "A call for you");
  assert.equal(textOf(byTestId(tree, "ro-add-note")).trim(), "A note for you");
  press(byTestId(tree, "ro-add-call"));
  tree = s.draw();
  assert.match(textOf(byTestId(tree, "ro-step-1")), /A call for you/);
  assert.equal(byTestId(tree, "ro-step-body-1"), null, "no email's words, and no subject");
  assert.equal(byTestId(tree, "ro-slots-1"), null);
  assert.equal(byTestId(tree, "ro-add"), null, "nothing after a call");
  assert.equal(byTestId(tree, "ro-add-note"), null);
  assert.deepEqual(textOf(byTestId(tree, "ro-body-issues-1")), "Say what to do when they come up.");
  assert.equal(byTestId(tree, "ro-start").props.disabled, true);
  typeInto(byTestId(tree, "ro-hand-words-1"), "Ask whether our quote suited them");
  tree = s.draw();
  assert.equal(byTestId(tree, "ro-start").props.disabled, false);
  press(byTestId(tree, "ro-start"));
  await settle();
  const [, body] = calls.find((c) => c[0] === "save");
  assert.equal(contracts.ReachOutChainSchema.safeParse(body).success, true, JSON.stringify(body));
  assert.equal("hand" in body.steps[0], false);
  assert.deepEqual(body.steps[1], {
    subject: null,
    body: "",
    after_days: 4,
    hand: { kind: "call", words: "Ask whether our quote suited them" },
  });
  assert.equal(textOf(byTestId(s.draw(), "ro-foot-say")), "A call or a note ends the chain.");
  // Taken off, the chain may go on with an email again.
  press(byTestId(s.draw(), "ro-remove"));
  assert.ok(byTestId(s.draw(), "ro-add"));
});

test("Start saves exactly the chain's shape, with the unconfirmed included when asked, and says what its first run did (R14)", async () => {
  setup();
  const calls = verbs();
  const s = sheet();
  await settle();
  let tree = s.draw();
  press(byTestId(tree, "ro-include"));
  tree = s.draw();
  press(byTestId(tree, "ro-start"));
  await settle();
  const [, body] = calls.find((c) => c[0] === "save");
  assert.equal(contracts.ReachOutChainSchema.safeParse(body).success, true, JSON.stringify(body));
  assert.deepEqual(
    [body.search_id, body.include_unconfirmed, body.gap_minutes, body.domain_ids, body.signed_by, body.steps.length],
    [SEARCH.id, true, 12, [], "Sam", 1],
  );
  assert.ok(
    s.done.find((d) => d && d.root_id),
    "the opener hears the save",
  );
  // The sheet stays, and says what the first run did where the words were; its door goes on to the run.
  tree = s.draw();
  assert.ok(byTestId(tree, "ro-sheet"), "still open");
  assert.equal(
    textOf(byTestId(tree, "ro-saved")),
    "Planned 30 emails. The first run waits on you: open it to approve.",
  );
  assert.equal(byTestId(tree, "ro-start"), null);
  went.length = 0;
  press(byTestId(tree, "ro-saved-go"));
  assert.deepEqual(went, ["broadcasts/run:b1"], "on to where the run waits, when the owner says so");
  assert.ok(s.done.includes("closed"));
  // Held for billing: said as it is, and the door on is the chain's row.
  verbs({
    save: { ok: true, data: { ...SAVED(), start: { outcome: "held", reason: "billing", planned: 0, run_id: null } } },
  });
  const b = sheet();
  await settle();
  press(byTestId(b.draw(), "ro-start"));
  await settle();
  tree = b.draw();
  assert.equal(textOf(byTestId(tree, "ro-saved")), "Saved. Nothing is planned until billing is sorted: open Billing.");
  assert.equal(
    byTestId(tree, "ro-saved-go").props.onClick && textOf(byTestId(tree, "ro-saved-go")),
    "Open its reach-out",
  );
  went.length = 0;
  press(byTestId(tree, "ro-saved-go"));
  assert.deepEqual(went, ["outbound/r1"]);
  // A refusal is the route's sentence, at the foot, and the sheet stays.
  const refusedCalls = verbs({ save: { ok: false, message: "This search has a reach-out already." } });
  const r = sheet();
  await settle();
  press(byTestId(r.draw(), "ro-start"));
  await settle();
  assert.equal(textOf(byTestId(r.draw(), "ro-foot-say")), "This search has a reach-out already.");
  assert.equal(refusedCalls.filter((c) => c[0] === "save").length, 1);
  assert.equal(r.done.length, 0);
  assert.equal(byTestId(r.draw(), "ro-saved"), null);
});

test("editing a chain passes its steps' ids and says Save", async () => {
  setup();
  const calls = verbs();
  const chain = {
    root_id: "r1",
    name: "Reach out · Trainers",
    search: SEARCH,
    state: "running",
    include_unconfirmed: false,
    gap_minutes: 20,
    domain_ids: [],
    signed_by: "Ruben",
    steps: [
      {
        id: "r1",
        n: 0,
        after_days: null,
        subject: "Hi {{business}}",
        body: "{{opening}}\n\n{{your name}}",
        template_id: "t1",
        state: "running",
      },
      { id: "n1", n: 1, after_days: 5, subject: null, body: "Checking in.", template_id: "t2", state: "running" },
    ],
    domains: [],
    next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
    created_at: "2026-09-20T00:00:00Z",
  };
  const s = sheet({ chain });
  await settle();
  const tree = s.draw();
  assert.equal(textOf(byTestId(tree, "ro-start")), "Save");
  assert.equal(byTestId(tree, "ro-signed").props.value, "Ruben");
  press(byTestId(tree, "ro-start"));
  await settle();
  const [, id, body] = calls.find((c) => c[0] === "update");
  assert.equal(id, "r1");
  assert.deepEqual(
    body.steps.map((x) => [x.id, x.after_days]),
    [
      ["r1", null],
      ["n1", 5],
    ],
  );
  assert.equal(body.gap_minutes, 20);
  assert.equal(textOf(byTestId(s.draw(), "ro-saved")), "Saved. Its next run writes these words.");
});

test("with no verified domain it says where to add one, and Start waits", async () => {
  setup([DOMAIN({ state: "pending" })]);
  verbs();
  const s = sheet();
  await settle();
  const tree = s.draw();
  assert.equal(
    textOf(byTestId(tree, "ro-no-domain")),
    "Add a domain you send from in Settings › Connections › Email first.",
  );
  assert.equal(byTestId(tree, "ro-start").props.disabled, true);
});

test("the domains and the booking link unread are said as reading, never as none, and Start waits for them", async () => {
  verbs();
  const keepSettings = W.__SETTINGS;
  try {
    W.__SETUP = undefined;
    let s = sheet();
    await settle();
    let tree = s.draw();
    assert.equal(textOf(byTestId(tree, "ro-unread")), "Reading your sending domains and your booking link…");
    assert.equal(byTestId(tree, "ro-no-domain"), null, "not read is not none");
    assert.equal(byTestId(tree, "ro-start").props.disabled, true);
    assert.equal(textOf(byTestId(tree, "ro-foot-say")), "Reading your sending domains and your booking link…");
    // Setup's read lands: the sheet draws the domains as the surface says so.
    setup();
    W.dispatchEvent(new Event("surface:setup"));
    tree = s.draw();
    assert.equal(byTestId(tree, "ro-unread"), null);
    assert.ok(byTestId(tree, "ro-domain-d1"));
    // Settings not in yet: words naming the booking link are not told it is missing, and Start still waits.
    W.__SETTINGS = undefined;
    s = sheet();
    await settle();
    typeInto(byTestId(s.draw(), "ro-body"), "Book here: {{booking link}}\n\n{{your name}}");
    tree = s.draw();
    assert.equal(byTestId(tree, "ro-chain-issues"), null, "an unread link is not a missing one");
    assert.equal(byTestId(tree, "ro-start").props.disabled, true);
    // Setup's read failed: said so, and Start waits.
    W.__SETTINGS = keepSettings;
    W.__SETUP = null;
    s = sheet();
    await settle();
    tree = s.draw();
    assert.match(textOf(byTestId(tree, "ro-unread")), /couldn't be read/);
    assert.equal(byTestId(tree, "ro-start").props.disabled, true);
  } finally {
    W.__SETTINGS = keepSettings;
    setup();
  }
});

test("From: up to five domains picked, as the chain's schema allows, and said so at the cap", async () => {
  const six = ["d1", "d2", "d3", "d4", "d5", "d6"].map((id) => DOMAIN({ id, address: `sam@${id}.example` }));
  setup(six);
  verbs();
  const s = sheet();
  await settle();
  for (const id of ["d1", "d2", "d3", "d4", "d5"]) byTestId(s.draw(), `ro-domain-${id}`).props.onChange();
  const tree = s.draw();
  assert.equal(byTestId(tree, "ro-domain-d6").props.disabled, true);
  assert.equal(byTestId(tree, "ro-domain-d1").props.disabled, false, "a picked one may still be let go");
  assert.equal(textOf(byTestId(tree, "ro-domains-max")), "Up to 5 domains, or every verified one.");
  setup();
});

test("a draft kept in the tab comes back as typed, but who it writes to is the door's", async () => {
  setup();
  verbs();
  const keep = W.tabDraft;
  const kept = {
    ...contracts.reachOutDraftOf({ chain: null, searchName: SEARCH.name, signedBy: "Sam" }),
    name: "Kept",
  };
  W.tabDraft = () => kept;
  try {
    const s = sheet({ includeUnconfirmed: true });
    await settle();
    const tree = s.draw();
    assert.equal(byTestId(tree, "ro-name").props.value, "Kept");
    assert.match(textOf(byTestId(tree, "ro-reach")), /44 unconfirmed addresses, included/);
  } finally {
    W.tabDraft = keep;
  }
});

test("before it goes: one business at a time, by a press; Next and Rewrite ask again; a refusal is said (F12, R12)", async () => {
  setup();
  const calls = verbs();
  const s = sheet();
  await settle();
  let tree = s.draw();
  assert.equal(byTestId(tree, "ro-frame"), null, "the sheet never asks the model on its own");
  press(byTestId(tree, "ro-preview"));
  await settle();
  tree = s.draw();
  assert.match(textOf(byTestId(tree, "ro-reader")), /as Studio 1 reads it · 1 of 44/);
  assert.match(textOf(byTestId(tree, "ro-reader")), /their reviews/);
  assert.match(textOf(byTestId(tree, "ro-frame")), /A 4\.9 from 16 reviews says people find you\./);
  assert.equal(byTestId(tree, "ro-prev").props.disabled, true);
  press(byTestId(tree, "ro-next"));
  await settle();
  tree = s.draw();
  assert.match(textOf(byTestId(tree, "ro-reader")), /Studio 2 reads it · 2 of 44/);
  press(byTestId(tree, "ro-rewrite"));
  await settle();
  const asked = calls.filter((c) => c[0] === "preview").map((c) => c[1].index);
  assert.deepEqual(asked, [0, 1, 1], "Rewrite asks again for the same business");
  const first = calls.find((c) => c[0] === "preview")[1];
  assert.deepEqual(Object.keys(first).sort(), ["include_unconfirmed", "index", "search_id", "signed_by", "words"]);
  assert.equal(contracts.ReachOutPreviewSchema.safeParse(first).success, true);
  // Words changed: the preview says so, and asks nothing until pressed.
  typeInto(byTestId(tree, "ro-body"), "{{opening}}\n\nNew words.\n\n{{your name}}");
  tree = s.draw();
  assert.equal(textOf(byTestId(tree, "ro-preview")), "Your words changed · Read it again");
  // The budget spent: the route's sentence, said.
  verbs({ preview: () => ({ ok: false, message: contracts.REACH_OUT_REFUSALS.budget }) });
  press(byTestId(tree, "ro-preview"));
  await settle();
  assert.equal(textOf(byTestId(s.draw(), "ro-preview-refused")), contracts.REACH_OUT_REFUSALS.budget);
  // A search past a run's cap pages as far as a preview may go.
  verbs({ reach: { ...REACH, ready: 500, with_unconfirmed: 500 } });
  const big = sheet();
  await settle();
  press(byTestId(big.draw(), "ro-preview"));
  await settle();
  assert.match(textOf(byTestId(big.draw(), "ro-reader")), /1 of 200/);
});

/* ------------------------------ the Leads door ------------------------------ */

const door = (search = SEARCH, phone = false) => {
  const draw = () => W.React.createElement(W.ReachOutDoor, { search, phone });
  fresh();
  again(draw);
  return () => again(draw);
};

test("the Leads door: its search's chain, else its ready, else its unconfirmed included, else nothing; by role (F10)", async () => {
  setup();
  verbs();
  let redraw = door();
  await settle();
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "leads-write")).trim(), "Write to the 44 ready");
  assert.match(byTestId(tree, "leads-write").props.className, /btn-primary ro-door btn-sm/);
  const onPhone = door(SEARCH, true);
  await settle();
  assert.match(
    byTestId(onPhone(), "leads-write").props.className,
    /ph-big ro-door-phone/,
    "a phone's is the full-width one",
  );
  redraw = door();
  await settle();
  tree = redraw();
  press(byTestId(tree, "leads-write"));
  tree = redraw();
  assert.ok(byTestId(tree, "ro-sheet"), "opens the sheet over the search");

  verbs({ reach: { ...REACH, chain: "r9" } });
  redraw = door();
  await settle();
  went.length = 0;
  press(byTestId(redraw(), "leads-write"));
  assert.deepEqual(went, ["outbound/r9"], "one chain per search: its row");

  verbs({ reach: { ready: 0, with_unconfirmed: 12, phone_only: 0, of: 30, chain: null } });
  redraw = door();
  await settle();
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "leads-write")).trim(), "Write to the 12 unconfirmed");
  press(byTestId(tree, "leads-write"));
  redraw();
  await settle();
  tree = redraw();
  assert.match(textOf(byTestId(tree, "ro-reach")), /12 unconfirmed addresses, included/, "opens with them included");

  verbs({ reach: { ready: 0, with_unconfirmed: 0, phone_only: 3, of: 3, chain: null } });
  redraw = door();
  await settle();
  assert.equal(byTestId(redraw(), "leads-write"), null, "none of either: nothing");

  verbs();
  redraw = door(null);
  await settle();
  assert.equal(byTestId(redraw(), "leads-write"), null, "on the all-leads list: nothing");

  // The page's primary act: shown to every role, gated by the one role table to those who may not write.
  for (const [real, viewAs, may] of [
    ["owner", null, true],
    ["operator", null, true],
    ["partner", null, true],
    ["viewer", null, false],
    ["owner", "viewer", false],
  ]) {
    const who = `${real}${viewAs ? ` viewing as ${viewAs}` : ""}`;
    Object.assign(role, { real, viewAs });
    verbs();
    redraw = door();
    await settle();
    const b = byTestId(redraw(), "leads-write");
    assert.ok(b, `${who}: shown`);
    assert.equal(b.props["aria-disabled"] === true, !may, `${who}: gated ${!may}`);
    if (!may) {
      assert.equal(b.props["data-tip"], W.gateTitle("approve", "write to these leads"));
      b.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: null });
      assert.equal(byTestId(redraw(), "ro-sheet"), null, `${who}: pressing opens nothing`);
    }
  }
  Object.assign(role, { real: "owner", viewAs: null });
});

test("through the door: saved, the sheet stays and says what the run did, and the door reads its search again (R14)", async () => {
  setup();
  let chain = null;
  const calls = verbs({ reach: undefined });
  const reach = W.__reachOuts.reach;
  W.__reachOuts.reach = async (id) => {
    await reach(id);
    return { ...REACH, chain };
  };
  const redraw = door();
  await settle();
  press(byTestId(redraw(), "leads-write"));
  redraw();
  await settle();
  press(byTestId(redraw(), "ro-start"));
  chain = "r1";
  await settle();
  redraw();
  await settle();
  const tree = redraw();
  assert.equal(
    textOf(byTestId(tree, "ro-saved")),
    "Planned 30 emails. The first run waits on you: open it to approve.",
  );
  assert.equal(textOf(byTestId(tree, "leads-write")).trim(), "Open its reach-out", "the door behind it, read again");
  assert.equal(calls.filter((c) => c[0] === "reach").length >= 3, true);
  press(byTestId(tree, "ro-close"));
  assert.equal(byTestId(redraw(), "ro-sheet"), null);
});

test("Leads reads Setup and Settings next, after its own surface: the sheet sends from one and checks the other", async () => {
  const reg = await import("../../../../apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.deepEqual(reg.ROUTE_DRAWS.leads, ["setup", "settings"]);
  assert.deepEqual(reg.routeDrawsFor("clients", "leads:s-1"), ["setup", "settings"]);
  assert.deepEqual(reg.routeDrawsFor("clients", "leads"), ["setup", "settings"]);
  assert.deepEqual(reg.routeDrawsFor("clients", null), [], "People's list is not Leads");
});

/* ------------------------------ the bridge ------------------------------ */

test("the bridge's verbs press the routes they name, and a search's reach is read once until a chain changes", async () => {
  const calls = [];
  const was = W.fetch;
  W.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.example");
    calls.push([init.method || "GET", u.pathname.replace(/^.*\/api\/v1\//, ""), u.searchParams.get("search")]);
    const data = u.pathname.endsWith("/reach")
      ? REACH
      : u.pathname.endsWith("/preview")
        ? { preview: PREVIEW(0) }
        : SAVED();
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const V = bridge.reachOuts;
  const body = contracts.reachOutChainBodyOf(
    contracts.reachOutDraftOf({ chain: null, searchName: "S", signedBy: "Sam" }),
    SEARCH.id,
  );
  try {
    await V.reach(SEARCH.id);
    await V.reach(SEARCH.id);
    await V.save(body);
    await V.reach(SEARCH.id);
    await V.update("r1", body);
    await V.preview({
      search_id: SEARCH.id,
      index: 0,
      include_unconfirmed: false,
      words: { subject: "Hi", body: "Hi" },
      signed_by: "Sam",
    });
    await V.decide("s1", "skip");
  } finally {
    W.fetch = was;
  }
  assert.deepEqual(
    calls.filter(([m, p]) => m !== "GET" || p === "reach-outs/reach"),
    [
      ["GET", "reach-outs/reach", SEARCH.id],
      ["POST", "reach-outs", null],
      ["GET", "reach-outs/reach", SEARCH.id],
      ["PUT", "reach-outs/r1", null],
      ["POST", "reach-outs/preview", null],
      ["POST", "reach-out-sends/s1/decide", null],
    ],
    "a second read of the same search is the first one's; any write lets it go (api.ts refresh)",
  );
});
