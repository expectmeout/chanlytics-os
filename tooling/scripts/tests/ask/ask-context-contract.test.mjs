// The page context's contract (the Phase 2 plan, PR 2.1): what a page sends with a question is identities and words,
// read by one schema; the surfaces are thirteen; a scope has kinds of its own, each a citation's but the run; and a
// scope is read from every address a page opens a row at, by that page's own parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_CITATION_KINDS,
  ASK_CONTEXT_MAX_ROWS,
  ASK_CONTEXT_ROW_KINDS,
  ASK_SCOPE_KINDS,
  ASK_SURFACES,
  LIFECYCLE_WORDS,
  PageContextSchema,
  buildAskSuggestions,
  scopeFromRoute,
} from "@chanlytics/contracts";

const T1 = "11111111-1111-4111-8111-111111111111";
const CALL = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";
const L = "55555555-5555-4555-8555-555555555555";
const P = "66666666-6666-4666-8666-666666666666";

const ok = {
  v: 1,
  surface: "inbox",
  route: `inbox/th-${T1}`,
  view: "needs_you",
  focus: { kind: "thread", id: T1, label: "Rosa" },
  rows: [{ kind: "thread", id: T1 }],
  askedAt: 1_758_880_000_000,
};

test("a page context: identities and words, never facts, forty rows at most", () => {
  assert.equal(PageContextSchema.safeParse(ok).success, true);
  assert.equal(
    PageContextSchema.safeParse({ ...ok, view: undefined, focus: null }).success,
    true,
    "view and focus may be absent",
  );
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ kind: "person", id: `p${i}` }));
  assert.equal(ASK_CONTEXT_MAX_ROWS, 40);
  assert.equal(PageContextSchema.safeParse({ ...ok, rows: rows(40) }).success, true, "forty is a screen");
  assert.equal(PageContextSchema.safeParse({ ...ok, rows: rows(41) }).success, false, "forty at most");
  assert.equal(
    PageContextSchema.safeParse({ ...ok, surface: "billing" }).success,
    false,
    "a surface Ask does not know",
  );
  assert.equal(
    PageContextSchema.safeParse({ ...ok, rows: [{ kind: "deal", id: "x" }] }).success,
    false,
    "a kind no page shows",
  );
  assert.equal(
    PageContextSchema.safeParse({ ...ok, rows: [{ kind: "thread", id: T1, preview: "hi" }] }).success,
    false,
    "a row carries its kind and id and nothing else: a fact the tab says about a row is never taken",
  );
  assert.equal(PageContextSchema.safeParse({ ...ok, v: 2 }).success, false, "one version");
  assert.equal(
    PageContextSchema.safeParse({ ...ok, counts: { needs_you: 3 } }).success,
    false,
    "no field it does not know",
  );
  assert.equal(
    PageContextSchema.safeParse({ ...ok, rows: [{ kind: "thread", id: "" }] }).success,
    false,
    "an id is something",
  );
  assert.equal(PageContextSchema.safeParse({ ...ok, askedAt: -1 }).success, false);
  assert.equal(
    PageContextSchema.safeParse({ ...ok, focus: { kind: "deal", id: "x", label: "a deal" } }).success,
    false,
    "the focus is a scope, of a scope's kinds",
  );
});

test("thirteen surfaces, each said once, Conversations and Live among them; each is offered questions", () => {
  assert.deepEqual(
    [...ASK_SURFACES],
    [
      "today",
      "inbox",
      "people",
      "leads",
      "conversations",
      "live",
      "reports",
      "settings",
      "pipeline",
      "calendar",
      "campaigns",
      "start",
      "other",
    ],
  );
  const quiet = {
    needsYou: 0,
    heldDrafts: 0,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
    scope: null,
    canAct: true,
  };
  for (const surface of ASK_SURFACES) {
    const chips = buildAskSuggestions({ ...quiet, surface, language: "en" });
    assert.ok(
      chips.some((c) => c.kind === "ask"),
      `${surface} is offered a question`,
    );
  }
  // A page with no chips of its own yet is offered those it was offered before it had a name: the Pipeline People's,
  // the Calendar and Campaigns other's. The first run has its own since the palette opens there (Ask Rewired, Phase 7;
  // ask.test.mjs holds them).
  for (const [surface, was] of [
    ["pipeline", "people"],
    ["calendar", "other"],
    ["campaigns", "other"],
  ])
    assert.deepEqual(
      buildAskSuggestions({ ...quiet, surface, language: "es", dealsOn: true }),
      buildAskSuggestions({ ...quiet, surface: was, language: "es", dealsOn: true }),
      surface,
    );
  assert.equal(
    buildAskSuggestions({ ...quiet, surface: "start", language: "es", dealsOn: true })[0].q,
    "¿Qué falta por configurar?",
    "the first run asks its own question first",
  );
});

test("Ask at rest on Campaigns (the moment spec, A3): three ideas on the first day, then chips from the rows -- why one waits, what is working -- and a win-back offered only where none runs", () => {
  const base = {
    surface: "campaigns",
    language: "en",
    needsYou: 0,
    heldDrafts: 0,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
    canAct: true,
  };
  const qs = (input) => buildAskSuggestions({ ...base, ...input }).map((s) => s.q);
  const first = qs({ campaigns: { rows: [] } });
  assert.deepEqual(first.slice(0, 3), [
    "Set up my campaigns",
    "Win back customers who went quiet",
    "What should go out this month?",
  ]);
  // The chip and the page's own door (surfaces/campaigns/home/ask-on-campaigns.tsx SetUpAsk) say one sentence.
  assert.equal(first[0], LIFECYCLE_WORDS.ask.setUp);
  const rows = [
    { name: "Win-back", trigger: "quiet_30", runs: true, waiting: true },
    { name: "Monthly offer", trigger: "everyone_monthly", runs: false, waiting: false },
  ];
  const later = qs({ campaigns: { rows } });
  assert.deepEqual(later.slice(0, 2), ["Why is Win-back waiting?", "What's working?"]);
  assert.ok(!later.includes("Win back customers who went quiet"), "a win-back runs");
  assert.ok(!later.includes("Start a win-back campaign for the quiet clients"), "nor its act");
  const none = qs({ campaigns: { rows: [{ ...rows[0], runs: false, waiting: false }] } });
  assert.ok(
    none.includes("Win back customers who went quiet"),
    "a paused win-back runs nothing, nor one past its last day",
  );
  // Offered once: the page's own chip is the win-back, and the Act group does not offer it again.
  assert.ok(!none.includes("Start a win-back campaign for the quiet clients"), "never twice");
  assert.ok(!first.includes("Start a win-back campaign for the quiet clients"), "nor on the first day");
  const winBacks = (q) => q.filter((x) => /win.?back/i.test(x)).length;
  for (const q of [first, none]) assert.equal(winBacks(q), 1, q.join(" | "));
  const es = buildAskSuggestions({ ...base, language: "es", campaigns: { rows: [] } });
  assert.equal(es[0].q, "Prepara mis campañas");
  assert.equal(es.filter((s) => /recupera/i.test(s.q)).length, 1, "once in Spanish too");
  // Where no chip of the page's offers it, the act stands, said as a campaign.
  assert.ok(
    buildAskSuggestions({ ...base, surface: "other", language: "es" }).some(
      (s) => s.kind === "act" && s.q === "Inicia una campaña de recuperación para los clientes inactivos",
    ),
    "the act in Spanish says campaña",
  );
  assert.ok(
    buildAskSuggestions({ ...base, surface: "other" }).some(
      (s) => s.kind === "act" && s.q === "Start a win-back campaign for the quiet clients",
    ),
  );
});

test("a scope has kinds of its own, and so do the context's rows; each is a kind a citation names, but the run, which a citation names a broadcast, and a reach-out, which a citation names the playbook its first step is", () => {
  assert.notDeepEqual([...ASK_SCOPE_KINDS], [...ASK_CITATION_KINDS], "no longer an alias");
  for (const k of ["lead", "search", "run"]) assert.ok(ASK_SCOPE_KINDS.includes(k), `a page opens a ${k}`);
  for (const k of ["playbook", "template", "lead", "search", "run", "reach_out"])
    assert.ok(ASK_CONTEXT_ROW_KINDS.includes(k));
  assert.ok(!ASK_SCOPE_KINDS.includes("reach_out"), "a reach-out open is the page over its row");
  assert.equal(ASK_CITATION_KINDS.length, 15, "fifteen names: a page and fourteen kinds of row");
  // An ad has no read of its own until the Ads read lands (decision 0049): a turn about one cites the page it is on.
  const cited = (k) => (k === "run" ? "broadcast" : k === "reach_out" ? "playbook" : k === "ad" ? "page" : k);
  for (const k of [...ASK_SCOPE_KINDS, ...ASK_CONTEXT_ROW_KINDS])
    assert.ok(ASK_CITATION_KINDS.includes(cited(k)), `a ${k} is cited as a ${cited(k)}`);
  assert.ok(!ASK_CITATION_KINDS.includes("run"), "run is the address's word, never a citation's");
});

test("a scope from every address a page can open, by the page's own parser", () => {
  assert.deepEqual(scopeFromRoute("live", CALL), { kind: "call", id: CALL, label: "this call" });
  assert.equal(scopeFromRoute("live", null), null);
  assert.deepEqual(scopeFromRoute("broadcasts", `run:${RUN}`, "Monday offer"), {
    kind: "run",
    id: RUN,
    label: "Monday offer",
  });
  assert.equal(scopeFromRoute("broadcasts", "run:nope"), null);
  assert.deepEqual(scopeFromRoute("clients", `leads:s-${S}:p-${L}`), { kind: "lead", id: L, label: "this lead" });
  assert.deepEqual(scopeFromRoute("clients", `leads:s-${S}:l-ready`), { kind: "search", id: S, label: "this search" });
  assert.equal(scopeFromRoute("clients", "leads"), null, "the Leads page with nothing open");
  assert.deepEqual(scopeFromRoute("clients", `pipeline:v-open:p-${P}`), {
    kind: "person",
    id: P,
    label: "this person",
  });
  assert.equal(scopeFromRoute("clients", "pipeline:v-open"), null, "the Pipeline with no one open");
  // A further deal of theirs is a row of its own, `<person>_<deal>` (0029): the peek is still on the person.
  const DEAL = "dededede-dede-4ede-8ede-dededededed1";
  assert.deepEqual(scopeFromRoute("clients", `pipeline:v-open:p-${P}_${DEAL}`), {
    kind: "person",
    id: P,
    label: "this person",
  });
  // Conversations writes `<tab>:<id>` as a row opens, a row alone on All, and a tab alone (pages/conversations.jsx).
  assert.deepEqual(scopeFromRoute("conversations", `phone:cv-${CALL}`), { kind: "call", id: CALL, label: "this call" });
  assert.deepEqual(scopeFromRoute("conversations", `whatsapp:${T1}`), {
    kind: "conversation",
    id: T1,
    label: "this conversation",
  });
  assert.deepEqual(scopeFromRoute("conversations", `cv-${CALL}`), { kind: "call", id: CALL, label: "this call" });
  assert.equal(scopeFromRoute("conversations", "whatsapp"), null, "a tab names no row");
  // What it read before, it reads the same.
  assert.deepEqual(scopeFromRoute("inbox", `th-${T1}`, "Dani"), { kind: "thread", id: T1, label: "Dani" });
  assert.deepEqual(scopeFromRoute("clients", P, "Rosa"), { kind: "person", id: P, label: "Rosa" });
  assert.equal(scopeFromRoute("clients", "seg:vip"), null);
});

test("a campaign's drawer is a scope of its own (the moment spec, A1): campaigns/moment:<id>, and the old outbound address, name its playbook", () => {
  assert.ok(ASK_SCOPE_KINDS.includes("playbook"));
  assert.deepEqual(scopeFromRoute("campaigns", `moment:${RUN}`, "Win-back"), {
    kind: "playbook",
    id: RUN,
    label: "Win-back",
  });
  assert.deepEqual(scopeFromRoute("outbound", `moment:${RUN}`), { kind: "playbook", id: RUN, label: "this campaign" });
  assert.equal(scopeFromRoute("campaigns", "moment:nope"), null);
  assert.equal(scopeFromRoute("campaigns", "new:moment:quiet_30"), null, "the composer is no row");
  assert.equal(scopeFromRoute("campaigns", `new:edit:${RUN}`), null, "a change in the composer is no scope either");
  assert.equal(scopeFromRoute("campaigns", "in:before"), null, "a group is a view, not a row");
  assert.equal(scopeFromRoute("campaigns", null), null);
  // A paid ad open in its drawer on Campaigns › Ads (decision 0049) is a scope of its own; the page and New ad are not.
  assert.ok(ASK_SCOPE_KINDS.includes("ad"));
  assert.deepEqual(scopeFromRoute("campaigns", `ads:ad:${RUN}`, "Spring offer"), {
    kind: "ad",
    id: RUN,
    label: "Spring offer",
  });
  assert.deepEqual(scopeFromRoute("campaigns", `ads:ad:${RUN}`), { kind: "ad", id: RUN, label: "this ad" });
  assert.equal(scopeFromRoute("campaigns", "ads"), null);
  assert.equal(scopeFromRoute("campaigns", "ads:new:call"), null);
  assert.equal(scopeFromRoute("campaigns", "ads:ad:spring-offer"), null, "an id that is no uuid names nothing");
  // The tab sends it, and the one schema takes it.
  const sent = PageContextSchema.safeParse({
    ...ok,
    surface: "campaigns",
    route: `campaigns/moment:${RUN}`,
    focus: { kind: "playbook", id: RUN, label: "Win-back" },
  });
  assert.ok(sent.success, JSON.stringify(sent.error?.issues));
});

test("a reach-out's drawer, at the same address, is the page over its row (A2): named for its chain where the chains the page read hold it, never a playbook no campaigns read holds; and a reach-out is a row the context carries", () => {
  const chains = [{ root_id: RUN, name: "Movers in Austin" }];
  const drawer = { kind: "page", id: `campaigns/moment:${RUN}`, label: "Movers in Austin" };
  assert.deepEqual(scopeFromRoute("campaigns", `moment:${RUN}`, null, chains), drawer);
  assert.deepEqual(scopeFromRoute("outbound", `moment:${RUN}`, null, chains), drawer, "the old address, the same page");
  assert.deepEqual(
    scopeFromRoute("campaigns", `moment:${RUN}`, "Chain", chains),
    { ...drawer, label: "Chain" },
    "a label the page gave wins",
  );
  // Another's chain, unread chains or none: the campaign it would be.
  for (const c of [[{ root_id: S, name: "Other" }], null, undefined, []])
    assert.deepEqual(scopeFromRoute("campaigns", `moment:${RUN}`, null, c), {
      kind: "playbook",
      id: RUN,
      label: "this campaign",
    });
  const sent = PageContextSchema.safeParse({
    ...ok,
    surface: "campaigns",
    route: `campaigns/moment:${RUN}`,
    focus: drawer,
    rows: [{ kind: "reach_out", id: RUN }],
  });
  assert.ok(sent.success, JSON.stringify(sent.error?.issues));
});
