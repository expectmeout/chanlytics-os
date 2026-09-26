/**
 * The plan panel, the plan card and the strip, drawn (release B, Tasks 9, 10; spec F5).
 *
 * Hookless components on the tests' stub React, as refusals-on-the-page does:
 * each is called with the props LeadsScope hands it, pressed, and read. The
 * page itself (Task 2) is proved in leads-honest.test.mjs; here the three
 * components are proved on their own props, so a change to one of them fails
 * here and not four files away. A fresh Find is Ask's, proved in
 * ask-palette.test.mjs: nothing here composes one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LeadSearchPlanSchema,
  LEAD_COUNT_CHOICES,
  LEAD_ROUND_ENDINGS,
  planArea,
  planCeiling,
  planMinutes,
  planSaid,
  planSentence,
  planVersionOf,
  planWhere,
  planWho,
  planWords,
} from "../../../packages/contracts/src/leads/lead-search.ts";
import {
  LEAD_QUESTION_WAIT_LINE,
  leadEndingLine,
  leadPlanAsk,
  leadPlanFacts,
  leadPlanLikely,
} from "../../../packages/contracts/src/leads/leads.ts";
import { hookFrames } from "./_hook-frames.mjs";

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
};
globalThis.ReactDOM = { createPortal: (n) => n };
globalThis.window = globalThis.window || {};
// The derivations bag seed-globals.ts publishes: the card and the strip read
// every word they say from it, never from a spelling of their own.
Object.assign(globalThis.window, {
  __LEAD_VM: {
    planWords,
    planSaid,
    planWhere,
    planWho,
    planArea,
    planMinutes,
    planCeiling,
    planSentence,
    planVersionOf,
    LEAD_COUNT_CHOICES,
    leadEndingLine,
    leadPlanLikely,
    leadPlanFacts,
    leadPlanAsk,
    LEAD_QUESTION_WAIT_LINE,
  },
});
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/pages/leads-finder.jsx");

// Task 10's view model. The plan writes `leadStrip` in contracts (step 4) and
// seeds it on `__LEAD_VM` (step 7a); on this branch neither is there, so it is
// the page's own, published by leads-finder.jsx beside the strip that draws
// it. Its NINE ENDING SENTENCES are still contracts' `leadEndingLine`, read off
// the bag above -- which is what the last test in this file pins.
const leadStrip = (...a) => globalThis.window.leadStrip(...a);

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
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
  return (n.props?.children ?? []).map(textOf).join("");
};
const click = (n) => {
  assert.ok(n, "nothing to press");
  return n.props.onClick({ preventDefault() {}, stopPropagation() {} });
};
const press = (n, key, mods = {}) => {
  let taken = false;
  n.props.onKeyDown({
    key,
    ...mods,
    preventDefault() {
      taken = true;
    },
    stopPropagation() {},
  });
  return taken;
};

/* ------------------------------------------------------------ fixtures */

const PLAN = LeadSearchPlanSchema.parse({
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count: 200,
  contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});
const NEARBY = {
  kind: "city",
  label: "Round Rock, TX",
  state: "TX",
  center: { lat: 30.5083, lng: -97.6789 },
  radius_m: 25_000,
  query: "Round Rock, TX, USA",
};
const FACTS = {
  dupes: 14,
  leadsLeft: 486,
  bound: null,
  prior: { places: 1_200, matched: 700, with_email: 406 },
  priorOf: "trainers",
  cannotSee: null,
  renewsOn: "Oct 1",
  nearby: [NEARBY],
};
const CARD = {
  id: "p1",
  kind: "lead_search",
  needs: "owner",
  title: "Find 200 personal trainers",
  summary: planSentence(PLAN),
  payload: { plan: PLAN, view: { title: "Find 200 personal trainers" }, facts: FACTS },
  undo: "Stop the search",
};
/** The page's panel state, as LeadsReal holds it, with the setters leadAnswerPlan and leadFinderApprove take. */
const page = (over = {}) => {
  const st = {
    open: true,
    stage: "compose",
    words: "",
    trace: null,
    refusal: null,
    proposal: null,
    plan: null,
    pick: null,
    ...over,
  };
  const set = {
    open: (v) => {
      st.open = v;
    },
    stage: (v) => {
      st.stage = v;
    },
    words: (v) => {
      st.words = v;
    },
    trace: (v) => {
      st.trace = v;
    },
    refusal: (v) => {
      st.refusal = v;
    },
    proposal: (v) => {
      st.proposal = v;
    },
    plan: (v) => {
      st.plan = v;
    },
    pick: (v) => {
      st.pick = v;
    },
  };
  return { st, set };
};
/** The panel as LeadsScope draws it. `answering` is the row's discriminator, so it is always said: null at rest. */
const drawFinder = (st, over = {}) => {
  frames.begin();
  return globalThis.window.LeadPlanPanel({
    open: st.open,
    stage: st.stage,
    words: st.words,
    proposal: st.proposal,
    plan: st.plan,
    facts: null,
    refusal: st.refusal,
    busy: false,
    trace: st.trace,
    pick: st.pick,
    answering: null,
    onWords: (v) => {
      st.words = v;
    },
    onAnswer: () => {},
    onChangePlan: (p) => {
      st.plan = p;
    },
    onApprove: () => {},
    onBack: () => {
      st.stage = "compose";
    },
    onClose: () => {
      st.open = false;
    },
    onPick: (v) => {
      st.pick = v;
    },
    ...over,
  });
};

/* ------------------------------------------------------------ the icons */

// What leads-finder.jsx names (the card, the strip, the first day) and what the Leads scope's doors name
// (leads-scope.jsx: the rail's menu, the controls, the band, the phone's bar). No sparkle: it means written by
// Claude, and nothing on Leads presses it; no mic: hold-to-talk is Ask's.
test("every icon these three and the Leads doors name draws a shape of its own, not the fallback circle", () => {
  const Real = globalThis.window.Icon;
  const kids = (n) => (n.props.children || []).filter(Boolean);
  const fallback = (n) => kids(n).length === 1 && kids(n)[0].type === "circle" && kids(n)[0].props.r === "3";
  for (const name of [
    "three",
    "check",
    "x",
    "lock",
    "dashring",
    "clock",
    "users",
    "shield",
    "undo",
    "copy",
    "pencil",
    "ban",
    "external",
    "refresh",
    "search",
    "more",
    "pin",
    "plus",
    "star",
    "phone",
  ]) {
    assert.ok(kids(Real({ name, size: 14 })).length >= 1, name);
    assert.equal(fallback(Real({ name, size: 14 })), false, `${name} falls through to the circle`);
  }
  assert.equal(fallback(Real({ name: "not-an-icon" })), true, "an unknown name still draws the circle");
});

/* ------------------------------------------------- Task 9: the plan card */

const drawCard = (st, over = {}) => {
  frames.begin();
  return globalThis.window.LeadPlanCard({
    plan: st.plan,
    view: { title: "Find 200 personal trainers" },
    facts: FACTS,
    busy: false,
    refusal: st.refusal,
    baseVersion: 1,
    pick: st.pick,
    onPick: (v) => {
      st.pick = v;
    },
    onChange: (p) => {
      st.plan = p;
    },
    onApprove: () => {},
    onBack: () => {},
    ...over,
  });
};
/** Open a picker and take one of its options: what a mouse does, in two presses. */
const pickOption = (st, id, option, over = {}) => {
  click(byTestId(drawCard(st, over), `plan-${id}`));
  click(byTestId(drawCard(st, over), `plan-${id}-${option}`));
};

test("a changed count re-plans without the model, and a changed area makes a new version the owner approves", () => {
  const sent = [];
  globalThis.window.__ask = {
    send: async (i) => {
      sent.push(i);
    },
  };
  const st = { plan: PLAN, pick: null, refusal: null };
  assert.equal(
    textOf(byTestId(drawCard(st), "plan-sentence")),
    "Find 200 personal trainers in Austin, TX with a website, reached by a checked email or a phone.",
  );
  pickOption(st, "count", "50");
  assert.equal(
    textOf(byTestId(drawCard(st), "plan-sentence")),
    "Find 50 personal trainers in Austin, TX with a website, reached by a checked email or a phone.",
  );
  assert.equal(st.plan.version, 2, "the count is one of the five that make a new version (S15; planVersionOf on main)");
  const counts = byTestId((click(byTestId(drawCard(st), "plan-count")), drawCard(st)), "plan-count-50");
  assert.match(
    textOf(counts),
    /about 16 min/,
    "every count says about how long it takes, at the rate five real searches measured",
  );
  st.pick = null;
  pickOption(st, "area", "Round Rock, TX");
  assert.equal(st.plan.version, 3, "and so is the area");
  assert.equal(
    textOf(byTestId(drawCard(st), "plan-sentence")),
    "Find 50 personal trainers in Round Rock, TX with a website, reached by a checked email or a phone.",
  );
  assert.equal(textOf(byTestId(drawCard(st), "plan-changed")), "changed");
  assert.equal(sent.length, 0, "no model call: a picked word re-plans on the page");
});

test("the contact standard is in the sentence and its picker switches it, and the sentence says so", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const tok = byTestId(drawCard(st), "plan-contact");
  assert.equal(textOf(tok), "reached by a checked email or a phone");
  assert.equal(tok.props["aria-haspopup"], "listbox");
  pickOption(st, "contact", "phone");
  assert.equal(textOf(byTestId(drawCard(st), "plan-contact")), "reached by phone or a checked email");
  assert.equal(st.plan.version, 2, "the contact standard makes a new version");
  const open = (click(byTestId(drawCard(st), "plan-contact")), drawCard(st));
  const box = byTestId(open, "plan-contact-options");
  assert.equal(box.props.role, "listbox");
  assert.deepEqual(
    all(box, (n) => n.props?.role === "option").map((n) => n.props["aria-selected"]),
    [false, true],
  );
  assert.equal(
    press(byTestId(open, "plan-contact"), "Escape"),
    true,
    "Esc closes the picker here, before the page's listener",
  );
  assert.equal(st.pick, null);
});

test("a criterion says how sure it has to be, and a fact the card cannot see is said before anything is spent, with the likely version offered", () => {
  const seen = planVersionOf(PLAN, {
    criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }],
  });
  const cannotSee = { key: "otc", text: "Already sell OTC medicine", likely: "Could sell OTC medicine" };
  const st = { plan: seen, pick: null, refusal: null };
  const facts = { ...FACTS, cannotSee };
  const tree = drawCard(st, { facts });
  assert.match(textOf(byTestId(tree, "plan-sentence")), /already sell OTC medicine \(confirmed\)/);
  assert.match(textOf(byTestId(tree, "plan-cannot-see")), /can't be confirmed\. Nothing has been spent\./);
  assert.equal(byTestId(tree, "plan-approve").props.disabled, true, "nothing starts until the owner chooses");
  click(byTestId(tree, "plan-take-likely"));
  assert.deepEqual([st.plan.criteria[0].standard, st.plan.criteria[0].text], ["likely", "Could sell OTC medicine"]);
  assert.equal(byTestId(drawCard(st, { facts }), "plan-approve").props.disabled, false, "chosen: it can start");
  assert.equal(byTestId(drawCard(st, { facts }), "plan-cannot-see"), null);
  const other = { plan: seen, pick: null, refusal: null };
  click(byTestId(drawCard(other, { facts }), "plan-drop-unseen"));
  assert.deepEqual(other.plan.criteria, [], "or the criterion goes, and the sentence with it");
});

test("Leaving out is chips the owner can take back, Likely says what past searches found, and the facts are in leads with no dollar meter", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const tree = drawCard(st);
  assert.equal(
    textOf(byTestId(tree, "plan-likely")),
    "About 116 will have an email; the rest you call · from past searches for trainers",
  );
  assert.equal(
    textOf(byTestId(tree, "plan-facts")),
    "About 48 minutes — leave the page if you likeAnything already yours is skippedCounts only matches with a checked phone or email · 486 left this month",
  );
  assert.equal(/\$/.test(textOf(tree)), false, "there is no dollar meter");
  const chip = byTestId(tree, "plan-leaving-chain");
  assert.match(textOf(chip), /Chain gyms/);
  click(find(chip, (n) => n.type === "button"));
  assert.deepEqual(st.plan.exclusions, [], "the chip is removable");
  assert.equal(st.plan.version, 2, "and that is a new version");
  assert.equal(byTestId(drawCard(st), "plan-leaving"), null);
  const fresh = drawCard({ plan: PLAN, pick: null, refusal: null }, { facts: { ...FACTS, prior: null } });
  assert.equal(textOf(byTestId(fresh, "plan-likely")), "How many have an email is checked after the first 25.");
});

test("Find N leads commits the card through the route, and a refusal is said under the button in the route's words", async () => {
  const committed = [];
  globalThis.window.__ask = {
    commit: async (p) => {
      committed.push(p);
      return {
        ok: false,
        message: "This month's searching budget is used. A smaller search, or a phone standard, may still fit.",
      };
    },
  };
  const { st, set } = page({ stage: "plan", proposal: CARD, plan: PLAN });
  await globalThis.window.leadFinderApprove(st.proposal, st.plan, set);
  assert.equal(committed.length, 1);
  assert.equal(committed[0].payload.plan.count, 200, "the plan the card holds, not the one the model first wrote");
  assert.deepEqual([st.stage, st.open], ["plan", true], "a refused start leaves the card where it was");
  const refused = byTestId(drawCard({ plan: PLAN, pick: null, refusal: st.refusal }), "plan-refusal");
  assert.equal(
    textOf(refused),
    "This month's searching budget is used. A smaller search, or a phone standard, may still fit.",
  );
  assert.equal(refused.props.role, "alert");
  globalThis.window.__ask = {
    commit: async () => ({
      ok: true,
      receipt: "Finding 200 personal trainers. It carries on if you leave; Leads shows it.",
      undo: { search_id: "s1" },
    }),
  };
  const ok = page({ stage: "plan", proposal: CARD, plan: PLAN, words: "x" });
  const r = await globalThis.window.leadFinderApprove(ok.st.proposal, ok.st.plan, ok.set);
  assert.deepEqual(
    [r.ok, ok.st.open, ok.st.stage, ok.st.proposal, ok.st.words],
    [true, false, "compose", null, ""],
    "the strip takes over from the surface's newest search",
  );
});

/* ------------------------------------------ answering a search's question -- */

/** What the page hands the finder when it opens under a waiting search's question (clients-a.jsx answerOf). */
const ANSWERING = {
  searchId: "s-b",
  purpose: "topup",
  answer: true,
  question: "Most of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?",
  name: "personal trainers",
  asked: PLAN.asked,
  leavingOut: ["Chain gyms"],
  threadId: "t-planned",
};

test("answering: the panel says the question, sends the owner's words as one turn on the Leads surface, naming the search and the thread it was planned in, and the card comes back carrying amends at the server's version and count", async () => {
  const sent = [];
  const amended = { ...PLAN, count: 50, exclusions: [], asked: "include the chains too" };
  const amends = { search_id: "s-b", name: "personal trainers", question: ANSWERING.question };
  globalThis.window.__ask = {
    send: async (input, on) => {
      sent.push(input);
      on({ t: "trace", text: "Reading what you asked" });
      on({ t: "trace", text: "Sizing the search" });
      on({
        t: "final",
        message: {
          text: "",
          proposals: [{ ...CARD, payload: { ...CARD.payload, plan: { ...amended, version: 2, count: 200 }, amends } }],
        },
      });
    },
  };
  const { st, set } = page({ words: "include the chains too" });
  set.more = ANSWERING;
  const tree = drawFinder(st, { answering: ANSWERING });
  assert.equal(textOf(byTestId(tree, "plan-answering")), ANSWERING.question, "the question stays in view");
  assert.equal(byTestId(tree, "plan-answer-input").props.placeholder, "Tell Claude what you meant");
  assert.equal(byTestId(tree, "lead-plan-panel").props["aria-label"], "Change the search");
  const card = await globalThis.window.leadAnswerPlan(st.words, set);
  assert.equal(sent.length, 1, "one turn");
  assert.deepEqual(
    sent[0],
    {
      text: "include the chains too",
      threadId: "t-planned",
      answering: { searchId: "s-b" },
      scope: null,
      surface: "leads",
    },
    "the owner's words and nothing else as the text; the search by id for the route to read and tell the model " +
      "(ask-routes.test.mjs); the thread the search was planned in",
  );
  assert.deepEqual(
    [st.stage, st.trace, st.refusal, card.id, st.plan.version, st.plan.count, st.plan.exclusions],
    ["plan", "Sizing the search", null, "p1", 2, 200, []],
    "the server's version and count, as the card carries them",
  );
  assert.deepEqual(st.proposal.payload.amends, amends, "the card keeps what it amends for the commit door");
  const planned = drawFinder(st, { answering: ANSWERING });
  assert.ok(byTestId(planned, "lead-plan"), "the card is drawn");
  assert.equal(byTestId(planned, "plan-answer-input"), null, "and the row is gone until Change what I asked");
  assert.equal(byTestId(planned, "plan-thinking"), null);
  // A card without amends is a new search, not an answer, and one amending some other search is not this
  // panel's: both are refused under the input, nothing to approve.
  const refused = "That would start a new search. Say your answer to the question instead.";
  for (const payload of [{ plan: amended }, { plan: amended, amends: { ...amends, search_id: "s-other" } }]) {
    globalThis.window.__ask = {
      send: async (input, on) => {
        sent.push(input);
        on({ t: "final", message: { text: "", proposals: [{ ...CARD, payload: { ...CARD.payload, ...payload } }] } });
      },
    };
    const fresh = page({ words: "include the chains too" });
    fresh.set.more = ANSWERING;
    assert.equal(await globalThis.window.leadAnswerPlan(fresh.st.words, fresh.set), null);
    assert.deepEqual(
      [fresh.st.refusal, fresh.st.stage, fresh.st.proposal, fresh.st.plan],
      [refused, "compose", null, null],
      payload.amends ? "a card for another search" : "a card with no amends",
    );
  }
  assert.equal(sent.length, 3);
  // A search that keeps no thread (made on the page, or before 00172) sends none: the route starts one.
  globalThis.window.__ask = {
    send: async (input, on) => {
      sent.push(input);
      on({ t: "final", message: { text: "", proposals: [] } });
    },
  };
  const unthreaded = page({ words: "  include the chains too " });
  unthreaded.set.more = { ...ANSWERING, threadId: null };
  await globalThis.window.leadAnswerPlan(unthreaded.st.words, unthreaded.set);
  assert.deepEqual(
    [sent[3].text, sent[3].threadId, sent[3].answering],
    ["include the chains too", null, { searchId: "s-b" }],
  );
  sent.pop();
  // Nothing to answer: the panel never composes a fresh Find (that is Ask's), so it refuses rather than sending.
  const idle = page({ words: "gyms in Denver" });
  assert.equal(await globalThis.window.leadAnswerPlan(idle.st.words, idle.set), null);
  assert.deepEqual([idle.st.refusal, idle.st.stage, sent.length], ["Nothing to answer here.", "compose", 3]);
});

test("answering: a refusal is words under the input and no card, with what was typed still there; Enter and Send my answer send, nothing typed sends nothing, and the panel is the page's own overlay", async () => {
  globalThis.window.__ask = {
    send: async (input, on) => {
      on({ t: "trace", text: "Reading what you asked" });
      on({ t: "final", message: { id: "m2", text: "I can only find businesses in the US for now.", proposals: [] } });
    },
  };
  const { st, set } = page({ words: "look in Toronto instead" });
  set.more = ANSWERING;
  const card = await globalThis.window.leadAnswerPlan(st.words, set);
  assert.deepEqual([card, st.stage, st.proposal], [null, "compose", null]);
  const tree = drawFinder(st, { answering: ANSWERING });
  const said = byTestId(tree, "plan-refusal");
  assert.equal(textOf(said), "I can only find businesses in the US for now.");
  assert.equal(said.props.role, "status");
  assert.equal(byTestId(tree, "lead-plan"), null, "no card");
  assert.equal(
    byTestId(tree, "plan-answer-input").props.value,
    "look in Toronto instead",
    "what they typed is still there to change",
  );
  globalThis.window.__ask = {
    send: async (input, on) => on({ t: "error", text: "Chanlytics didn't answer — ask again in a moment." }),
  };
  await globalThis.window.leadAnswerPlan(st.words, set);
  assert.equal(
    st.refusal,
    "Chanlytics didn't answer — ask again in a moment.",
    "the stream's own error is said the same way",
  );
  // The row: Enter and the button send the words; nothing typed sends nothing; close closes.
  let answered = 0;
  const row = drawFinder(st, {
    answering: ANSWERING,
    onAnswer: () => {
      answered += 1;
    },
  });
  const panel = byTestId(row, "lead-plan-panel");
  assert.equal(panel.props.role, "dialog");
  assert.match(panel.props.className, /\bpl-plan\b/, "PL_OVERLAY excludes .pl-plan, so the page's keys stay awake");
  assert.equal(press(byTestId(row, "plan-answer-input"), "Enter"), true);
  assert.match(textOf(byTestId(row, "plan-answer-send")), /^Send my answer/);
  click(byTestId(row, "plan-answer-send"));
  assert.equal(answered, 2);
  click(byTestId(row, "plan-close"));
  assert.equal(st.open, false);
  const empty = page({ words: "" });
  assert.equal(
    byTestId(drawFinder(empty.st, { answering: ANSWERING }), "plan-answer-send").props.disabled,
    true,
    "nothing typed, nothing to send",
  );
  // While Claude reads (open again after the close above): the trace where the button was, the input held, the
  // hairline running.
  const thinking = drawFinder(
    { ...st, open: true, stage: "thinking", trace: "Sizing the search" },
    { answering: ANSWERING },
  );
  assert.equal(textOf(byTestId(thinking, "plan-thinking")), "Sizing the search");
  assert.equal(byTestId(thinking, "plan-answer-input").props.disabled, true);
  assert.equal(byTestId(thinking, "plan-answer-send"), null, "nothing to press while it reads");
  assert.ok(
    find(thinking, (n) => n.props?.className === "lf-sweep"),
    "the hairline runs while it reads",
  );
  // At rest with no question there is no row: the panel composes nothing (a fresh Find is Ask's).
  const rest = drawFinder(page({ words: "" }).st);
  assert.equal(byTestId(rest, "plan-answer-input"), null);
  assert.equal(byTestId(rest, "plan-answering"), null);
  assert.equal(drawFinder({ ...page().st, open: false }), null, "closed, it draws nothing");
});

test("answering: the card's count is words, its button updates the search, an answer's card commits through Ask's door, and the page's Include posts the plan as given", async () => {
  const st = { plan: { ...PLAN, version: 2, exclusions: [] }, pick: null, refusal: null };
  const tree = drawCard(st, { answering: ANSWERING, facts: { ...FACTS, leadsLeft: 3, bound: "allowance" } });
  assert.equal(byTestId(tree, "plan-count"), null, "the reservation was made for this count: it is not a picker");
  assert.match(textOf(byTestId(tree, "plan-sentence")), /200/);
  assert.match(textOf(byTestId(tree, "plan-approve")), /Update the search/);
  assert.equal(byTestId(tree, "plan-approve").props.disabled, false, "the month's clamp is not this round's");
  assert.equal(byTestId(tree, "plan-covers"), null);
  assert.equal(byTestId(tree, "plan-title"), null, "no Find N title over an answer");
  // The card that came back from Ask carries amends: it commits as any card, and the page never posts the answer.
  const amends = { search_id: "s-b", name: "personal trainers", question: ANSWERING.question };
  const committed = [];
  globalThis.window.__leadSearchAnswer = async () => {
    throw new Error("an answer from Ask never posts from the page");
  };
  globalThis.window.__ask = {
    commit: async (p) => {
      committed.push(p);
      return {
        ok: true,
        receipt: "Answered. Personal trainers carries on with your answer; Leads shows it.",
        undo: null,
      };
    },
  };
  const approved = { ...PLAN, version: 2, count: 200, exclusions: [] };
  const { st: s2, set } = page({
    stage: "plan",
    proposal: { ...CARD, payload: { ...CARD.payload, plan: approved, amends } },
    plan: approved,
  });
  set.more = ANSWERING;
  const r = await globalThis.window.leadFinderApprove(s2.proposal, s2.plan, set);
  assert.equal(r.ok, true);
  assert.equal(committed.length, 1, "one commit");
  assert.deepEqual(committed[0].payload.plan, approved, "the plan approved is the plan committed");
  assert.deepEqual(committed[0].payload.amends, amends, "with what it amends intact");
  assert.deepEqual([s2.open, s2.stage], [false, "compose"]);
  // The page's Include (a strip's step, no card): the plan is sent as given and the route versions it.
  const answered = [];
  globalThis.window.__leadSearchAnswer = async (id, a, plan) => {
    answered.push([id, a, plan.version]);
    return { ok: true };
  };
  globalThis.window.__ask = {
    commit: async () => {
      throw new Error("a plan opened on the page is not a card");
    },
  };
  const { st: s3, set: set3 } = page({ stage: "plan", proposal: null, plan: { ...PLAN, version: 4, count: 50 } });
  set3.more = ANSWERING;
  assert.equal((await globalThis.window.leadFinderApprove(s3.proposal, s3.plan, set3)).ok, true);
  assert.deepEqual(answered, [["s-b", "include", 4]], "the plan as given: the route versions it");
  assert.deepEqual([s3.open, s3.stage], [false, "compose"]);
});

test("near the month's limit the card offers what is left and says when the leads renew", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const month = drawCard(st, { facts: { ...FACTS, leadsLeft: 36, bound: "allowance" } });
  assert.equal(textOf(byTestId(month, "plan-approve")), "Find 36 leads");
  assert.equal(textOf(byTestId(month, "plan-covers")), "You have 36 leads left this month. Your leads renew on Oct 1.");
  const budget = drawCard(st, { facts: { ...FACTS, leadsLeft: 60, bound: "budget" } });
  assert.equal(
    textOf(byTestId(budget, "plan-covers")),
    "Emails for personal trainers are hard to find, so this month covers about 60 more. Find 60 now?",
  );
  let approved = null;
  click(
    byTestId(
      drawCard(st, {
        facts: { ...FACTS, leadsLeft: 36, bound: "allowance" },
        onApprove: (p) => {
          approved = p;
        },
      }),
      "plan-approve",
    ),
  );
  assert.deepEqual(
    [approved.count, approved.version],
    [36, 2],
    "the clamped count is what is approved, as a new version",
  );
  assert.equal(byTestId(drawCard(st), "plan-covers"), null, "nothing to say when nothing binds");
});

/* --------------------------------------------------- Task 10: the strip */

const SEARCH = {
  id: "5e000000-0000-4000-8000-000000000001",
  name: "Personal trainers \u00b7 Austin",
  asked: PLAN.asked,
  asked_on: "2026-09-18T10:00:00Z",
  plan: PLAN,
  plan_version: 1,
  round: {
    id: "5e000000-0000-4000-8000-0000000000a1",
    seq: 1,
    purpose: "probe",
    state: "running",
    ending: null,
    ending_pending: null,
    question: null,
    target: 200,
    counted: 86,
    qualified: 80,
    review: 4,
    excluded: 40,
    emails_checked: 41,
    with_phone: 45,
    cost_usd: 0.4,
    ended_at: null,
    undo_op_id: null,
    undo_version: null,
  },
};
const NOW = new Date("2026-09-19T15:00:00Z");
const withRound = (over) => ({ ...SEARCH, round: { ...SEARCH.round, ...over } });
const ended = (ending, over = {}) =>
  withRound({
    state: "ended",
    ending,
    counted: 61,
    excluded: 40,
    emails_checked: 34,
    with_phone: 27,
    qualified: 0,
    review: 0,
    ended_at: "2026-09-19T14:00:00Z",
    ...over,
  });
const ids = (vm) => vm.actions.map((a) => a.id);
const drawStrip = (search, acted, extra = {}) => {
  frames.begin();
  return globalThis.window.LeadStrip({
    vm: leadStrip(search, NOW, extra),
    onAction: (id, arg) => acted.push([id, arg]),
  });
};

test("the running strip says what is true, and its Stop is the only thing to press", () => {
  const acted = [];
  const tree = drawStrip(SEARCH, acted);
  assert.equal(textOf(byTestId(tree, "strip-title")), "Finding personal trainers in Austin, TX");
  assert.equal(
    textOf(byTestId(tree, "strip-parts")),
    " \u00b7 86 of 200 \u00b7 41 emails checked \u00b7 about 27 min left",
  );
  assert.equal(byTestId(tree, "lead-strip").props.role, "status");
  assert.equal(
    all(tree, (n) => n.type === "button").length,
    1,
    "nothing else on a running round is the owner's to press",
  );
  click(byTestId(tree, "strip-stop"));
  assert.deepEqual(acted, [["stop", undefined]], "Stop carries nothing: the search it belongs to is the page's");
  const bar = find(tree, (n) => n.props?.className === "lf-strip-bar");
  assert.equal(bar.props.style.width, "43%");
  const early = drawStrip(withRound({ counted: 12 }), []);
  assert.match(
    textOf(byTestId(early, "strip-parts")),
    /estimates update after the first 25$/,
    "until the first 25 are in the estimate is an assumption and says so",
  );
  assert.equal(
    /estimates update/.test(textOf(byTestId(tree, "strip-parts"))),
    false,
    "past them it is measured, so it stops saying it will change",
  );
});

// "What if the answer is no, and I want the search to change?" A fourth answer, Change what I asked, opens the finder
// under the question (the page's; this hands back its id). Include is drawn only when the plan still holds that
// exclusion: the question's key once reached the page empty, and a generic "Include what I left out" that lifts
// nothing was the button the owner pressed.
test("the question strip is the accent with role alert, and its four answers hand back what they say", () => {
  const acted = [];
  const q = withRound({
    state: "waiting_on_owner",
    counted: 9,
    question: {
      sentence: "Half of the first 25 are chain gyms, which I'm leaving out. Keep going this way?",
      criterion_key: "chain",
    },
  });
  const tree = drawStrip(q, acted);
  const strip = byTestId(tree, "lead-strip");
  assert.equal(strip.props.role, "alert");
  assert.match(strip.props.className, /\bask\b/, "the accent tint");
  assert.equal(
    textOf(byTestId(tree, "strip-title")),
    "Half of the first 25 are chain gyms, which I'm leaving out. Keep going this way?",
  );
  assert.equal(textOf(byTestId(tree, "strip-parts")), LEAD_QUESTION_WAIT_LINE);
  assert.deepEqual(
    all(tree, (n) => n.type === "button").map((n) => textOf(n)),
    ["Yes, keep going", "Include chain gyms", "Change what I asked", "Stop here"],
  );
  click(byTestId(tree, "strip-keep"));
  click(byTestId(tree, "strip-include"));
  click(byTestId(tree, "strip-change"));
  click(byTestId(tree, "strip-stop_here"));
  assert.deepEqual(
    acted,
    [
      ["keep", undefined],
      ["include", "chain"],
      ["change", undefined],
      ["stop_here", undefined],
    ],
    "Include carries the exclusion the owner is taking back",
  );
  const unknown = leadStrip(
    withRound({ state: "waiting_on_owner", question: { sentence: "Keep going?", criterion_key: "gone" } }),
    NOW,
  );
  assert.deepEqual(ids(unknown), ["keep", "change", "stop_here"], "a key the plan no longer holds has nothing to lift");
  const empty = leadStrip(
    withRound({ state: "waiting_on_owner", question: { sentence: "Keep going?", criterion_key: "" } }),
    NOW,
  );
  assert.deepEqual(ids(empty), ["keep", "change", "stop_here"], "nor has no key at all");
  const criterion = leadStrip(
    withRound({ state: "waiting_on_owner", question: { sentence: "Keep going?", criterion_key: "website" } }),
    NOW,
  );
  assert.deepEqual(ids(criterion), ["keep", "change", "stop_here"], "Include lifts an exclusion, never a requirement");
});

test("after Stop the strip says the emails of the found are still being checked, then that the found are the owner's", () => {
  const stopping = drawStrip(withRound({ state: "checking", ending_pending: "stopped", counted: 61 }), []);
  assert.equal(
    `${textOf(byTestId(stopping, "strip-title"))}${textOf(byTestId(stopping, "strip-parts"))}`,
    "Stopping \u00b7 checking the emails of the 61 found \u00b7 nothing else was counted",
  );
  assert.equal(all(stopping, (n) => n.type === "button").length, 0, "nothing to press while it finishes");
  const checking = drawStrip(withRound({ state: "checking", ending_pending: "target_reached", counted: 200 }), []);
  assert.equal(
    textOf(byTestId(checking, "strip-title")),
    "Checking the emails of the 200 found",
    "a round that finished is not Stopping",
  );
  const acted = [];
  const done = drawStrip(
    withRound({ state: "ended", ending: "stopped", counted: 61, ended_at: "2026-09-19T14:30:00Z" }),
    acted,
  );
  assert.equal(textOf(byTestId(done, "strip-title")), "Stopped at 61");
  click(byTestId(done, "strip-carry_on"));
  assert.equal(
    byTestId(done, "strip-undo"),
    null,
    "removing the untouched leads is the search menu's, not the strip's",
  );
  assert.deepEqual([acted[0][0], acted[0][1].count], ["carry_on", 200], "Carry on hands back the plan to approve");
});

test("every ending is one strip with one next step, and each draws its own words", () => {
  for (const ending of LEAD_ROUND_ENDINGS) {
    const acted = [];
    const tree = drawStrip(withRound({ state: "ended", ending, counted: 61, ended_at: "2026-09-19T14:30:00Z" }), acted);
    const strip = byTestId(tree, "lead-strip");
    assert.match(strip.props.className, /\bdone\b/, ending);
    assert.equal(strip.props.role, "status", ending);
    assert.ok(textOf(byTestId(tree, "strip-title")).length > 0, ending);
    // One next step and Sort by fit at most; the ending's numbers ("14 need a look", "4 left out") are quiet links
    // into their piles and are not pressed to decide anything.
    const buttons = all(tree, (n) => n.type === "button" && n.props?.className !== "lnk");
    assert.ok(buttons.length <= 2, `${ending}: ${buttons.length} buttons`);
    assert.ok(
      leadStrip(
        withRound({ state: "ended", ending, counted: 61, ended_at: "2026-09-19T14:30:00Z" }),
        NOW,
      ).actions.filter((a) => globalThis.window.LEAD_ROUND_MAKERS.includes(a.id)).length <= 1,
      `${ending} offers more than one next step`,
    );
    assert.equal(
      /\$|apify|compass|bounceverify/i.test(textOf(tree)),
      false,
      `${ending} says something it must not: ${textOf(tree)}`,
    );
    assert.equal(/undefined|NaN|null/.test(textOf(tree)), false, `${ending}: ${textOf(tree)}`);
    for (const b of buttons) click(b);
    assert.equal(acted.length, buttons.length, ending);
  }
  const reached = drawStrip(
    withRound({
      state: "ended",
      ending: "target_reached",
      counted: 200,
      emails_checked: 88,
      with_phone: 112,
      excluded: 40,
    }),
    [],
  );
  assert.equal(textOf(byTestId(reached, "strip-title")), "Found 200 personal trainers");
  assert.equal(
    textOf(byTestId(reached, "strip-parts")),
    " \u00b7 88 you can email \u00b7 112 by phone \u00b7 40 left out",
  );
  assert.equal(
    byTestId(reached, "strip-excluded").props.className,
    "lnk",
    "40 left out is a link into the view, not a button beside the next step",
  );
  assert.equal(textOf(byTestId(reached, "strip-excluded")), "40 left out");
});

test("each ending says contracts' own sentence, with this round's numbers in it, and Undo goes once it is a day old or has been used", () => {
  assert.deepEqual(
    LEAD_ROUND_ENDINGS.map((e) => {
      const v = leadStrip(ended(e), NOW);
      return [e, [v.title, ...v.parts].join(" \u00b7 "), ids(v)];
    }),
    [
      [
        "target_reached",
        "Found 61 personal trainers \u00b7 34 you can email \u00b7 27 by phone \u00b7 40 left out",
        ["excluded", "sort_fit"],
      ],
      [
        "searched_everything",
        "Found 61 personal trainers \u00b7 everything these searches returned in Austin, TX",
        ["nearby", "sort_fit", "excluded"],
      ],
      [
        "month_leads_used",
        "Stopped at 61 \u00b7 this month's leads are used \u00b7 the 61 found are yours",
        ["excluded"],
      ],
      [
        "budget_used",
        "Stopped at 61 \u00b7 this month's searching is used up \u00b7 the 61 found are yours",
        ["excluded"],
      ],
      ["few_new_matches", "Found all 40 personal trainers in Austin, TX \u00b7 the 61 found are yours", ["excluded"]],
      [
        "stopped",
        "Stopped at 61 \u00b7 the 61 found are yours \u00b7 nothing else was counted",
        ["carry_on", "excluded"],
      ],
      [
        "source_failed",
        "Stopped at 40: the source stopped answering \u00b7 the 61 found are yours \u00b7 nothing more was counted",
        ["try_again", "excluded"],
      ],
      [
        "question_unanswered",
        "Stopped after a day without your answer \u00b7 the 61 found before it asked are yours",
        ["answer_now", "excluded"],
      ],
      [
        "paused",
        "Lead searches are paused for now \u00b7 your leads are all here \u00b7 nothing is being counted",
        ["excluded"],
      ],
    ],
  );
  assert.equal(leadStrip(ended("target_reached"), NOW).actions[0].label, "40 left out");
  assert.equal(leadStrip(ended("searched_everything"), NOW).actions[0].label, "Find 139 more nearby");
  const nearby = leadStrip(ended("searched_everything", { counted: 0, excluded: 3 }), NOW, {
    nearby: ["Alpine", "Fort Davis"],
  });
  assert.equal(
    nearby.title,
    "There are 3 personal trainers in Austin, TX, and all of them are chain gyms, which you asked me to leave out.",
  );
  assert.deepEqual(
    [nearby.parts, ids(nearby)],
    [["Nothing was counted."], ["nearby", "excluded"]],
    "nothing was counted, so nothing is worth re-sorting; the 3 left out are a link",
  );
  assert.deepEqual(
    ids(leadStrip(ended("searched_everything", { counted: 0, excluded: 3 }), NOW)),
    ["excluded"],
    "with nowhere else to look there is no next step to offer",
  );
  // The round's own nearby areas (00145): the step names them and opens the plan on the nearest.
  const far = [
    {
      kind: "zip",
      label: "near 78660",
      state: "TX",
      center: { lat: 30.44, lng: -97.62 },
      radius_m: 8000,
      zip: "78660",
      query: "78660, TX, USA",
    },
    {
      kind: "zip",
      label: "near 78664",
      state: "TX",
      center: { lat: 30.51, lng: -97.66 },
      radius_m: 8000,
      zip: "78664",
      query: "78664, TX, USA",
    },
  ];
  const dry = ended("searched_everything", { counted: 0, excluded: 3, nearby: far });
  const step = leadStrip(dry, NOW).actions[0];
  assert.deepEqual(
    [step.id, step.label, step.primary, step.arg.area],
    ["nearby", "Look near 78660 and 78664", true, far[0]],
    "the round wrote where to look; the plan opens there",
  );
  assert.equal(
    leadStrip(dry, NOW, { nearby: ["Round Rock"] }).actions[0].label,
    "Look in Round Rock",
    "what the caller knows comes first",
  );
  // Removing the untouched leads is the search menu's now, named for what it does (contracts leadUndoable); an
  // "Undo" on the strip beside "the 61 found are yours" read as deleting what was just paid for.
  for (const e of LEAD_ROUND_ENDINGS)
    assert.equal(ids(leadStrip(ended(e), NOW)).includes("undo"), false, `${e}: the strip never offers Undo`);
  assert.equal(ids(leadStrip(SEARCH, NOW)).includes("undo"), false, "a round still going has nothing to undo");
});

test("an ending never re-sorts by itself: it offers Sort by fit, and says how many new ones are waiting", () => {
  const acted = [];
  const tree = drawStrip(
    withRound({ state: "ended", ending: "target_reached", counted: 200, emails_checked: 88, with_phone: 112 }),
    acted,
    { offered: 12 },
  );
  assert.equal(textOf(byTestId(tree, "strip-take_offered")), "12 new");
  click(byTestId(tree, "strip-take_offered"));
  click(byTestId(tree, "strip-sort_fit"));
  assert.deepEqual(acted, [
    ["take_offered", undefined],
    ["sort_fit", undefined],
  ]);
  assert.equal(
    byTestId(drawStrip(withRound({ state: "ended", ending: "target_reached" }), []), "strip-take_offered"),
    null,
    "nothing waiting, nothing said",
  );
  assert.equal(globalThis.window.LeadStrip({ vm: null, onAction() {} }), null);
});

test("the nine ending sentences are contracts' leadEndingLine, never the strip's own: with no leadEndingLine there is no ended strip", () => {
  const bag = globalThis.window.__LEAD_VM;
  try {
    globalThis.window.__LEAD_VM = { ...bag, leadEndingLine: undefined };
    assert.equal(
      leadStrip(ended("target_reached"), NOW),
      null,
      "a word this file cannot read from contracts is a word it does not say",
    );
    assert.equal(globalThis.window.LeadStrip({ vm: leadStrip(ended("target_reached"), NOW), onAction() {} }), null);
    const running = leadStrip(SEARCH, NOW);
    assert.equal(
      running.title,
      "Finding personal trainers in Austin, TX",
      "the running, checking and question lines are the strip's own and still draw",
    );
  } finally {
    globalThis.window.__LEAD_VM = bag;
  }
});

test("holding the band, the strip drops its own ways into each pile -- the band's tabs are those doors -- and keeps its one next step", () => {
  const search = ended("target_reached", { qualified: 21, review: 14, excluded: 40 });
  frames.begin();
  const alone = globalThis.window.LeadStrip({ vm: leadStrip(search, NOW), onAction: () => {} });
  assert.ok(byTestId(alone, "strip-review"), "with no band, the strip is the way into the pile");
  frames.begin();
  const held = globalThis.window.LeadStrip({ vm: leadStrip(search, NOW), onAction: () => {}, children: "the band" });
  assert.equal(
    byTestId(held, "strip-review"),
    null,
    "the band's tab says 14 need a look; the strip does not say it again",
  );
  assert.equal(
    textOf(byTestId(held, "strip-excluded")),
    "40 left out",
    "a step that opens a pile is the step, and stays",
  );
  assert.ok(
    find(held, (n) => n.props?.className === "lf-strip-band"),
    "the band sits in the strip's own row",
  );
});
