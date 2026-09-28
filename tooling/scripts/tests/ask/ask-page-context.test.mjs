// The page, as Ask is sent it (legacy-bridge/ask/context.ts; the Phase 2 plan, PR 2.1): one provider a surface, each
// over what its page already holds, the rows in the page's order, forty at most, kind and id only; the row the words
// name by its place or its name; and the surfaces as the palette places them. Executed over fixture globals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PageContextSchema } from "@chanlytics/contracts";

const { pageContext, focusFromWords } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/context.ts");
const { surfaceFor } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");

const U = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const route = (hash) => {
  const [page, ...rest] = hash.split("/");
  return { page, param: rest.length ? rest.join("/") : null };
};
/** A context for a page, over `globals`, asked in `thread`; checked against the one schema the route reads it with. */
const ctx = (globals, hash, words, thread) => {
  const c = pageContext(globals, route(hash), words, thread);
  const read = PageContextSchema.safeParse(c);
  assert.ok(read.success, `a context the route takes: ${JSON.stringify(read.error?.issues ?? [])}`);
  return c;
};

test("the palette places every page on a surface: Leads and the Pipeline are People's params, the campaign pages one surface, People's lists People's", () => {
  const at = (hash) => surfaceFor(route(hash).page, route(hash).param);
  assert.equal(at("today"), "today");
  assert.equal(at("inbox/th-x"), "inbox");
  assert.equal(at("clients"), "people");
  assert.equal(at(`clients/${U(1)}`), "people", "a person's page is People");
  assert.equal(at("segments"), "people", "People › Lists");
  assert.equal(at("clients/leads:s-x"), "leads");
  assert.equal(at("clients/pipeline:v-open"), "pipeline", "no longer People");
  assert.equal(at("calendar/2026-09-21"), "calendar");
  for (const p of ["outbound", "broadcasts/run:x", "messages"]) assert.equal(at(p), "campaigns", p);
  assert.equal(at("start/phone"), "start");
  assert.equal(at("admin/autonomy"), "settings");
  assert.equal(at("conversations/phone:cv-x"), "conversations");
  assert.equal(at("live"), "live");
  assert.equal(at("reports"), "reports");
  assert.equal(at("billing"), "other");
});

test("Today: its queue in order -- a person's row as their thread, a call as the call, a search waiting as the search", () => {
  const c = ctx(
    {
      TODAY_DATA: {
        queue: {
          rows: [
            { id: "q1", kind: "handoff", conversationId: U(1), callId: null, who: "Rosa" },
            { id: "q2", kind: "call", conversationId: null, callId: U(2), who: "Luis" },
            { id: `q-s-${U(3)}`, kind: "search", conversationId: null, callId: null, who: "Trainers in Austin" },
            { id: "q4", kind: "window", conversationId: U(4), callId: U(5), who: "Ana" },
          ],
        },
      },
    },
    "today",
  );
  assert.equal(c.surface, "today");
  assert.deepEqual(c.rows, [
    { kind: "thread", id: U(1) },
    { kind: "call", id: U(2) },
    { kind: "search", id: U(3) },
    { kind: "thread", id: U(4) },
  ]);
  assert.equal(c.focus, null);
  assert.equal(c.route, "today");
});

test("the Inbox, People, the Pipeline and the Calendar: what the page said it drew, believed only for the page asked about", () => {
  const shown = { key: "inbox", ids: [U(1), U(2)], labels: ["Rosa", "Ana"], view: "needs" };
  const inbox = ctx({ __askOnScreen: shown }, `inbox/th-${U(2)}`);
  assert.deepEqual(inbox.rows, [
    { kind: "thread", id: U(1) },
    { kind: "thread", id: U(2) },
  ]);
  assert.equal(inbox.view, "needs");
  assert.deepEqual(inbox.focus, { kind: "thread", id: U(2), label: "this thread" }, "the row the route opens");
  assert.deepEqual(ctx({ __askOnScreen: shown }, "clients").rows, [], "the Inbox's rows are not People's");
  const people = ctx({ __askOnScreen: { key: "people", ids: [U(3)], labels: ["Luis"], view: "seg:vip" } }, "clients");
  assert.deepEqual([people.rows, people.view], [[{ kind: "person", id: U(3) }], "seg:vip"]);
  // Where deals are off the Pipeline's address draws People, which says what it drew.
  assert.deepEqual(ctx({ __askOnScreen: { key: "people", ids: [U(3)] } }, "clients/pipeline").rows, [
    { kind: "person", id: U(3) },
  ]);
  const pipe = ctx(
    { __askOnScreen: { key: "pipeline", ids: [U(4)], view: "open" } },
    `clients/pipeline:v-open:p-${U(4)}`,
  );
  assert.deepEqual([pipe.surface, pipe.rows, pipe.view], ["pipeline", [{ kind: "person", id: U(4) }], "open"]);
  assert.deepEqual(pipe.focus, { kind: "person", id: U(4), label: "this person" }, "the peek's person");
  const cal = ctx({ __askOnScreen: { key: "calendar", ids: [U(5)], view: "2026-09-21/7" } }, "calendar");
  assert.deepEqual([cal.rows, cal.view], [[{ kind: "person", id: U(5) }], "2026-09-21/7"]);
  assert.deepEqual(ctx({}, "calendar").rows, [], "a page not drawn yet: no rows");
});

test("Conversations: the rows of the tab on screen, a call's row as the call; Live: the calls now, then the recent", () => {
  const rows = [
    { id: U(1), who: "Rosa", channel: "whatsapp" },
    { id: `cv-${U(2)}`, who: "Luis", channel: "phone" },
    { id: U(3), who: "Ana", channel: "email" },
  ];
  const g = {
    CONVERSATIONS_DATA: { CONVERSATIONS: rows },
    CV_ROUTE: (w) =>
      w && w.includes(":") ? { channel: w.split(":")[0], id: w.split(":")[1] } : { channel: w || "all", id: null },
    CV_IN_CHANNEL: (c, tab) => tab === "all" || c.channel === tab,
  };
  const all = ctx(g, "conversations");
  assert.deepEqual(all.rows, [
    { kind: "conversation", id: U(1) },
    { kind: "call", id: U(2) },
    { kind: "conversation", id: U(3) },
  ]);
  const phone = ctx(g, `conversations/phone:cv-${U(2)}`);
  assert.deepEqual([phone.view, phone.rows], ["phone", [{ kind: "call", id: U(2) }]]);
  assert.deepEqual(phone.focus, { kind: "call", id: U(2), label: "this call" });
  const live = ctx({ __LIVE: { now: [{ callId: U(7) }], recent: [{ callId: U(8) }, { callId: U(9) }] } }, "live");
  assert.deepEqual(
    live.rows.map((r) => r.id),
    [U(7), U(8), U(9)],
  );
});

test("Leads: its rows in the page's order, its list and class as the view, the peek's lead or the search open as the focus", () => {
  const g = {
    __LEADS: {
      rows: [
        { id: U(1), name: "Iron Gym" },
        { id: U(2), name: "Core Studio" },
      ],
      view: { list: "ready", cls: "strong" },
    },
  };
  const c = ctx(g, `clients/leads:s-${U(9)}:p-${U(2)}`);
  assert.equal(c.surface, "leads");
  assert.deepEqual(c.rows, [
    { kind: "lead", id: U(1) },
    { kind: "lead", id: U(2) },
  ]);
  assert.equal(c.view, "ready/strong");
  assert.deepEqual(c.focus, { kind: "lead", id: U(2), label: "this lead" });
  assert.deepEqual(ctx(g, `clients/leads:s-${U(9)}`).focus, { kind: "search", id: U(9), label: "this search" });
});

test("Reports: the period; Campaigns: the tab's own rows; Settings: the pane; Start: the step", () => {
  assert.deepEqual(ctx({ __REPORTS: { days: 90 } }, "reports").view, "90");
  const g = {
    __PLAYBOOKS: { rows: [{ id: U(1), name: "Win back" }] },
    __BROADCASTS: { rows: [{ id: U(2), name: "Monday" }] },
    __TEMPLATES_ALL: [{ id: U(3), name: "offer_1", title: "The offer" }],
  };
  const out = ctx(g, "outbound");
  assert.deepEqual([out.surface, out.view, out.rows], ["campaigns", "playbooks", [{ kind: "playbook", id: U(1) }]]);
  const runs = ctx(g, `broadcasts/run:${U(2)}`);
  assert.deepEqual([runs.view, runs.rows], ["broadcasts", [{ kind: "run", id: U(2) }]]);
  assert.deepEqual(runs.focus, { kind: "run", id: U(2), label: "this run" });
  assert.deepEqual(ctx(g, "messages").rows, [{ kind: "template", id: U(3) }]);
  assert.equal(ctx({}, "admin/autonomy").view, "autonomy");
  assert.equal(ctx({}, "admin").view, "workspace");
  assert.equal(ctx({}, "start/phone").view, "phone");
});

test("forty rows at most, kind and id only -- a row's name never leaves the tab -- and a global in a shape no provider knows gives none rather than a throw", () => {
  const ids = Array.from({ length: 55 }, (_, i) => U(i + 1));
  const c = ctx({ __askOnScreen: { key: "people", ids, labels: ids.map((_, i) => `P${i}`) } }, "clients");
  assert.equal(c.rows.length, 40);
  assert.deepEqual(c.rows[0], { kind: "person", id: U(1) });
  assert.ok(!JSON.stringify(c).includes("P0"), "labels stay in the tab");
  assert.deepEqual(ctx({ TODAY_DATA: { queue: { rows: "nope" } } }, "today").rows, []);
  assert.deepEqual(ctx({ __LEADS: { rows: null } }, "clients/leads").rows, []);
  const throws = {
    get TODAY_DATA() {
      throw new Error("a global that throws");
    },
  };
  assert.deepEqual(ctx(throws, "today").rows, [], "a provider that throws gives no rows");
});

test("the row the words name: by its place, in English or Spanish, or by its name, whole; a place in time is not a row; the words win over the route", () => {
  const rows = [
    { kind: "thread", id: U(1), label: "Rosa Díaz" },
    { kind: "thread", id: U(2), label: "Ana" },
    { kind: "thread", id: U(3), label: "Ana María" },
    { kind: "template", id: U(4), label: "Offer" },
  ];
  const f = (w) => focusFromWords(w, rows)?.id ?? null;
  assert.equal(f("what did the second one say?"), U(2));
  assert.equal(f("¿qué dijo el segundo?"), U(2));
  assert.equal(f("la tercera"), U(3));
  assert.equal(f("open the first thread"), U(1), "a row's noun after the place");
  assert.equal(f("reply to #1"), U(1));
  assert.equal(f("and number 3?"), U(3));
  assert.equal(f("what did rosa diaz ask for"), U(1), "two words: case and accents aside");
  assert.equal(f("did Ana María book?"), U(3), "the longest name wins");
  assert.equal(f("did Ana book?"), U(2), "one word, written as a name");
  assert.equal(f("what did ana's reply say"), U(2), "one word, as someone's");
  assert.equal(f("bananas"), null, "a name is whole: Ana is not in bananas");
  // Ordinary questions name no row (the review of PR 2.1 ran these through it).
  assert.equal(f("who called the first time?"), null, "a place in time");
  assert.equal(f("how was last week"), null);
  assert.equal(f("la primera vez"), null);
  assert.equal(f("Am I open on the 2nd?"), null, "a date, not a row");
  assert.equal(f("What's the first thing I should do today?"), null);
  assert.equal(f("what is the second most common question"), null);
  assert.equal(f("where is invoice #3"), null, "a numbered thing that is not a row");
  assert.equal(f("the fourth"), null, "a template is not a scope");
  assert.equal(f("the ninth"), null, "no ninth row");
  const grace = [{ kind: "thread", id: U(9), label: "Grace" }];
  assert.equal(
    focusFromWords("how long is the grace period?", grace),
    null,
    "a word that is also a name, written as a word",
  );
  assert.equal(focusFromWords("did Grace pay?", grace)?.id, U(9));
  assert.equal(focusFromWords("the first", [{ kind: "thread", id: U(1), label: "Al" }])?.label, "Al");
  assert.equal(
    focusFromWords("al said", [{ kind: "thread", id: U(1), label: "Al" }]),
    null,
    "a name under three letters never",
  );
  // Through the page, asked in no thread: the words name a row, over the route's own.
  const g = { __askOnScreen: { key: "inbox", ids: [U(1), U(2)], labels: ["Rosa Díaz", "Ana"] } };
  assert.deepEqual(ctx(g, `inbox/th-${U(1)}`, "and the second one?").focus, { kind: "thread", id: U(2), label: "Ana" });
  assert.deepEqual(ctx(g, `inbox/th-${U(1)}`, "what now?").focus, { kind: "thread", id: U(1), label: "this thread" });
});

test("in an open thread a row by its place is the last answer's item at that place (the Phase 5 plan, D7), in the answer's order: a broadcast as the run its page spells, an answer from before the Line by the rows it cited; an item of a kind no focus has names none -- never the page's row at that place; past the answer's items, the page's rows; a name is the page's; no thread, the page's as ever", () => {
  const g = { __askOnScreen: { key: "inbox", ids: [U(1), U(2), U(3)], labels: ["Rosa Díaz", "Ana", "Luis"] } };
  const item = (kind, id, label) => ({
    title: label,
    meta: "",
    line: "",
    source: { kind, id, label, to: "", door: true },
  });
  const answered = (items) => ({
    id: "a-1",
    role: "assistant",
    text: "Here they are.",
    citations: [],
    followups: [],
    proposals: [],
    answer: {
      v: 2,
      form: "structured",
      say: { headline: "Here they are.", detail: "" },
      show: { figures: [], items, breakdown: null },
      do: { open: null, next: [] },
      language: "en",
    },
  });
  const asked = { id: "u-1", role: "user", text: "Who wrote?", citations: [], followups: [], proposals: [] };
  const thread = [asked, answered([item("thread", U(7), "Nora"), item("person", U(9), "Sam Ortiz")])];
  const focus = (hash, words, th) => ctx(g, hash, words, th).focus;
  assert.deepEqual(
    focus("inbox", "and the second one?", thread),
    { kind: "person", id: U(9), label: "Sam Ortiz" },
    "the answer's second item, not the page's second row (Ana)",
  );
  assert.deepEqual(focus("inbox", "open the first", thread), { kind: "thread", id: U(7), label: "Nora" });
  assert.deepEqual(focus("inbox", "#2", thread), { kind: "person", id: U(9), label: "Sam Ortiz" });
  assert.deepEqual(
    focus("inbox", "the third", thread),
    { kind: "thread", id: U(3), label: "Luis" },
    "past the answer's two items: the page's third row",
  );
  assert.deepEqual(
    focus("inbox", "what did Ana say?", thread),
    { kind: "thread", id: U(2), label: "Ana" },
    "a name is the page's",
  );
  assert.deepEqual(focus("inbox", "and the second one?"), { kind: "thread", id: U(2), label: "Ana" }, "no thread");
  // The newest answer's items: an earlier one's are not what "the second" points at.
  const older = [asked, answered([item("thread", U(4), "Old")]), asked, answered([item("call", U(8), "Luis's call")])];
  assert.deepEqual(focus("inbox", "the first one", older), { kind: "call", id: U(8), label: "Luis's call" });
  // A broadcast is the run its page spells; a deal, a list, a playbook, a template or a domain is no focus a scope may
  // be, and the page's row at that place is not what the words meant: none, or the row the route opens.
  const kinds = [asked, answered([item("broadcast", U(5), "Monday"), item("deal", U(6), "Rosa's move")])];
  assert.deepEqual(focus("inbox", "the first", kinds), { kind: "run", id: U(5), label: "Monday" });
  assert.equal(focus("inbox", "the second", kinds), null, "a deal: none, never Ana");
  assert.deepEqual(
    focus(`inbox/th-${U(3)}`, "the second", kinds),
    { kind: "thread", id: U(3), label: "this thread" },
    "the row open, never the page's second",
  );
  // An answer from before the Line: its items are the rows it cited, pages aside (answerFromV1).
  const v1 = {
    id: "a-0",
    role: "assistant",
    text: "Two called.",
    citations: [
      { kind: "page", id: "reports", label: "Reports", to: "reports" },
      { kind: "call", id: U(8), label: "Luis's call", to: `conversations/cv-${U(8)}` },
      { kind: "person", id: U(9), label: "Sam Ortiz", to: `clients/${U(9)}` },
    ],
    followups: [],
    proposals: [],
  };
  assert.deepEqual(focus("inbox", "the second", [asked, v1]), { kind: "person", id: U(9), label: "Sam Ortiz" });
  // A thread with no answer yet, or messages in no shape a thread has: the page's, never a throw.
  assert.deepEqual(focus("inbox", "the second", [asked]), { kind: "thread", id: U(2), label: "Ana" });
  assert.deepEqual(focus("inbox", "the second", [{ role: "assistant", answer: { v: 2 } }]).id, U(2));
});
