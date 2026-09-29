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

test("a scope has kinds of its own, and so do the context's rows; each is a kind a citation names, but the run, which a citation names a broadcast", () => {
  assert.notDeepEqual([...ASK_SCOPE_KINDS], [...ASK_CITATION_KINDS], "no longer an alias");
  for (const k of ["lead", "search", "run"]) assert.ok(ASK_SCOPE_KINDS.includes(k), `a page opens a ${k}`);
  for (const k of ["playbook", "template", "lead", "search", "run"]) assert.ok(ASK_CONTEXT_ROW_KINDS.includes(k));
  assert.equal(ASK_CITATION_KINDS.length, 13, "thirteen names: a page and twelve kinds of row");
  const cited = (k) => (k === "run" ? "broadcast" : k);
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
