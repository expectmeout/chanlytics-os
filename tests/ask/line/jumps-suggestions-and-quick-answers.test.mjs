/**
 * Ask's palette before any model: a citation names a row a tool returned, every jump lands on a real page, suggestions
 * come from the data in the person's language, the page's own questions lead, quick questions are told by their words,
 * and the turn route's ceiling and the gateway's caps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ASK_CITATION_KINDS,
  ASK_PAGE_ROUTES,
  ASK_SCOPE_KINDS,
  ASK_SURFACES,
  ASK_TOKENS_DAY,
  askColumnOf,
  applySettingsChange,
  buildAskSuggestions,
  citationRoute,
  dayFromQuestion,
  describeSettingsChange,
  detectLanguage,
  messageLanguageOf,
  messageLanguagesNext,
  messageLanguagesOf,
  emptyReadSet,
  noteRows,
  askIntent,
  callsAnswer,
  needsAnswer,
  openingsAnswer,
  quickAnswerOf,
  groundCitations,
  isUngrounded,
  scopeFromRoute,
  DATA_NOT_INSTRUCTIONS,
} from "@chanlytics/contracts";
import { ASK_PAGES, askJump, askPages } from "../../../apps/dashboard/src/bridge/ask/jump.ts";
import { ASK_GUIDE_PAGES } from "../../../apps/dashboard/src/server/ask/proposals/guide.ts";
import { importSrc } from "../../_source.mjs";
import { MODEL_QUESTIONS, QUICK_FORMS } from "../quick-path/_questions.mjs";
import {
  ASK_RULES,
  EVERY,
  ID,
  ID2,
  NOW,
  REACHED,
  READ_TOOLS,
  SCOPES,
  SURFACE_STATES,
  here,
  jumpIndexFrom,
  surfaceRetiredTo,
  surfaceStateFor,
  systemBlocks,
  where,
} from "./_line.mjs";
import { bridgeHolds, surfaceValue } from "../../shell/_bridge-holds.mjs";

test("grounding: a citation must name a row a tool returned this turn; pages are always allowed", () => {
  const read = emptyReadSet();
  noteRows(read, [
    { kind: "thread", id: ID, route: `inbox/th-${ID}`, label: "Dani" },
    { kind: "person", id: ID2, route: `clients/${ID2}`, label: "Rosa" },
    { kind: "page", id: "reports", route: "reports", label: "Reports" },
  ]);
  assert.deepEqual(
    Object.entries(read).map(([k, rows]) => [k, [...rows.keys()]]),
    [
      ["thread", [ID]],
      ["conversation", []],
      ["call", []],
      ["person", [ID2]],
      ["lead", []],
      ["search", []],
      ["deal", []],
      ["list", []],
      ["broadcast", []],
      ["playbook", []],
      ["template", []],
      ["mailbox", []],
      ["visit", []],
      ["review", []],
    ],
    "the read set is kind → id → RowRef, one map per row kind; a page needs no read and is not kept",
  );
  const { kept, dropped } = groundCitations(
    [
      { kind: "thread", id: ID, label: "Dani" },
      { kind: "thread", id: ID, label: "Dani again" },
      { kind: "thread", id: "not-read", label: "invented" },
      { kind: "person", id: ID2, label: "Rosa" },
      { kind: "call", id: ID2, label: "a call never read" },
      { kind: "page", id: "reports", label: "Reports" },
      { kind: "page", id: "https://evil.example", label: "out" },
    ],
    read,
  );
  assert.deepEqual(
    kept.map((c) => `${c.kind}:${c.label}`),
    ["thread:Dani", "person:Rosa", "page:Reports"],
  );
  assert.equal(dropped, 4);
  // Where a citation opens is the RowRef the read set holds: the reader's route, never one derived for the citation.
  noteRows(read, [{ kind: "deal", id: ID, route: `clients/${ID2}`, label: "Rosa's move" }]);
  assert.equal(citationRoute({ kind: "deal", id: ID, label: "" }, read), `clients/${ID2}`, "a deal opens its person");
  assert.equal(
    citationRoute({ kind: "deal", id: ID, label: "" }),
    "",
    "a row of a new kind no reader returned: nowhere",
  );
  // A citation stored before answers kept its `to` was a thread, a conversation, a call or a person, each at its own.
  assert.equal(citationRoute({ kind: "thread", id: ID, label: "" }), `inbox/th-${ID}`);
  assert.equal(citationRoute({ kind: "conversation", id: ID, label: "" }), `conversations/${ID}`);
  assert.equal(citationRoute({ kind: "call", id: ID, label: "" }), `conversations/cv-${ID}`);
  assert.equal(citationRoute({ kind: "person", id: ID2, label: "" }), `clients/${ID2}`);
  assert.equal(citationRoute({ kind: "page", id: "admin/autonomy", label: "" }), "admin/autonomy");
  assert.deepEqual(
    groundCitations(
      [
        { kind: "page", id: `clients/list:${ID}`, label: "a list of the workspace's own" },
        { kind: "page", id: "clients/seg:quiet", label: "a People list" },
      ],
      read,
    ).kept.map((c) => c.id),
    ["clients/seg:quiet"],
    "a list of the workspace's own is a row, so its address is no page; People's own view is",
  );
  assert.equal(isUngrounded("We open at 10.", 0), true, "a figure with no read behind it");
  assert.equal(isUngrounded("We open at 10.", 1), false);
  assert.equal(isUngrounded("Nobody wrote today.", 0), false);
});

test("the jump: two words reach a page, a person, a thread or a call; a question is not a jump", () => {
  const index = [
    ...ASK_PAGES,
    { label: "Rosa Pérez", to: `clients/${ID}`, kind: "person" },
    { label: "Dani — thread", to: `inbox/th-${ID2}`, kind: "thread" },
  ];
  assert.deepEqual(
    askJump("inb", index).map((j) => j.to),
    ["inbox"],
  );
  assert.deepEqual(
    askJump("rosa", index).map((j) => j.to),
    [`clients/${ID}`],
  );
  assert.deepEqual(
    askJump("dani", index).map((j) => j.kind),
    ["thread"],
  );
  assert.deepEqual(askJump("what needs me?", index), [], "a question mark is a question");
  assert.deepEqual(askJump("tell rosa we are late today", index), [], "four words are a sentence");
  assert.deepEqual(
    askJump("set", index).map((j) => j.label),
    ["Settings", "Setting up", "Content settings"],
  );
  assert.deepEqual(
    askJump("lea", index).map((j) => j.to),
    ["clients/leads"],
    "Leads is a real page now: the scope of People",
  );
  assert.ok(
    ASK_PAGES.every((p) => !/^(fleet|store|studio|pipeline|content|tasks)\b/.test(p.to)),
    "only real pages: none of the mockup's (People's own Pipeline, clients/pipeline, is every workspace's since 18 Oct 2026)",
  );
});

test("Cold email is still found by the words it went by", () => {
  // Three words at most: four are a question (askJump), so its old name is found by the end of it.
  for (const words of ["cold email", "it reaches out", "reaching out", "outreach"])
    assert.equal(askJump(words, EVERY)[0]?.to, "admin/outreach", words);
});

test("the jump index lists every real surface: each page the registry calls real, and People's scopes, is a jump away", () => {
  // Settings itself is the page every pane is under: it is real so that an address naming no pane opens Profile (A3c), and each
  // of its panes is a jump of its own.
  const real = Object.keys(SURFACE_STATES)
    .filter((k) => SURFACE_STATES[k] === "real" && k !== "admin")
    .sort();
  assert.deepEqual(
    Object.keys(REACHED)
      .filter((k) => !SCOPES.includes(k))
      .sort(),
    real,
    "a real page the table does not list has no jump; a listed one the registry drops is a jump to nowhere",
  );
  for (const [route, [label, to]] of Object.entries(REACHED)) {
    const jump = EVERY.find((e) => e.label === label);
    assert.ok(jump, `${route}: no jump called ${label}`);
    assert.equal(jump.to, to, `${route}: ${label} lands on ${to}`);
    assert.equal(askJump(label, EVERY)[0]?.to, to, `${route}: typing "${label}" finds it first`);
  }
  // A moved address is reached where it is now.
  assert.equal(surfaceRetiredTo("leads", null), REACHED.leads[1]);
});

test("every jump lands on a real page, where the page is now, on a page an answer may name, and no two share a name", () => {
  const labels = EVERY.map((e) => e.label);
  assert.equal(new Set(labels).size, labels.length, `a name twice: ${labels.join(", ")}`);
  const listed = new Set(Object.values(REACHED).map(([label]) => label));
  for (const e of EVERY) {
    assert.equal(e.kind, "page");
    assert.ok(listed.has(e.label), `${e.label}: a jump the table does not account for`);
    const [page, param] = where(e.to);
    assert.equal(surfaceStateFor(page, param), "real", `${e.to} is a real page`);
    assert.equal(surfaceRetiredTo(page, param), undefined, `${e.to} is where the page is, not an address that moves`);
    assert.ok(ASK_PAGE_ROUTES.includes(e.to), `${e.to} is a page a citation or an answer's Open may name`);
  }
  assert.ok(!EVERY.some((e) => e.to === "admin/memory"), "never the pane that says it is not built (#417)");
});

test("the Pipeline is every workspace's jump, after Leads; the back office for Chanlytics staff; every workspace has the rest", () => {
  const names = (has) => askPages(has).map((e) => e.label);
  const none = names({ platformAdmin: false });
  assert.deepEqual(
    none,
    ASK_PAGES.map((e) => e.label),
    "the pages every workspace has",
  );
  assert.equal(none.indexOf("Pipeline"), none.indexOf("Leads") + 1, "People's scopes in the strip's order");
  assert.ok(!none.includes("Back office"));
  const staff = names({ platformAdmin: true });
  assert.equal(staff.at(-1), "Back office");
  // Ads, where it is drawn (decision 0147: the last of Content's Made views), found by its name and the words for it.
  assert.ok(!none.includes("Ads"), "no Ads jump where Ads is not drawn");
  const ads = askPages({ platformAdmin: false, ads: true });
  assert.equal(ads.find((e) => e.label === "Ads")?.to, "campaigns/ads");
  assert.ok(ASK_PAGE_ROUTES.includes("campaigns/ads"), "a page an answer may name");
  assert.equal(askJump("boost", ads)[0]?.label, "Ads", "the word people use for it");
});

test("the bridge's jump index reads the bit the back office's door is drawn by, and a few words reach each new page", () => {
  // Each world is who is looking and what People holds, as the bridge holds them (decision 0151).
  const world = (me, people) => () => bridgeHolds({ who: { me }, values: { people } });
  const index = (w) => (w(), jumpIndexFrom());
  const first = (words, w) => askJump(words, index(w))[0]?.to ?? null;
  const staff = world({ role: "owner", platform_admin: true }, { rows: [] });
  const owner = world({ role: "owner" }, { rows: [] });
  assert.equal(first("pipe", staff), "clients/pipeline");
  assert.ok(
    askJump("deals", index(staff)).some((j) => j.to === "clients/pipeline"),
    "the Pipeline answers to its deals",
  );
  assert.equal(first("back office", staff), "admin/platform");
  assert.equal(first("pipe", owner), "clients/pipeline", "every workspace's Pipeline");
  assert.equal(first("back office", owner), null, "not staff: no back office");
  assert.equal(
    first("pipe", world(null, undefined)),
    "clients/pipeline",
    "and before People is read: the page is there whatever it holds",
  );
  for (const w of [staff, owner]) {
    assert.equal(first("memory", w), "admin/receptionist", "Memory lands on How it answers");
    assert.equal(first("ai memory", w), "admin/receptionist", "and so does the pane's own name");
    assert.equal(first("partner", w), "admin/partner");
    assert.equal(first("setting up", w), "start", "the first run is a jump away");
  }
  // The rest of the index is the browser's own rows, after the pages.
  const people = index(world({ role: "owner", platform_admin: true }, { rows: [{ id: "p-1", name: "Pip Adams" }] }));
  assert.deepEqual(
    askJump("pip", people).map((j) => j.label),
    ["Pipeline", "Reports › Pipeline", "Pip Adams"],
    "the pages before a person: the Pipeline, then the Reports lens whose name holds the word",
  );
});

test("suggestions come from the data, in the person's language, and never offer what the workspace cannot answer", () => {
  const none = buildAskSuggestions({
    surface: "today",
    language: "en",
    needsYou: 0,
    heldDrafts: 0,
    missedToday: 0,
    liveNow: 0,
    hasCalendar: false,
  });
  assert.ok(!none.some((s) => /call/i.test(s.q)), "no missed call, no question about missed calls");
  assert.ok(!none.some((s) => /open/i.test(s.q)), "no calendar, no openings");
  assert.ok(none.some((s) => s.q === "Who needs me right now?" && s.fast));
  const busy = buildAskSuggestions({
    surface: "inbox",
    language: "es",
    needsYou: 2,
    heldDrafts: 1,
    missedToday: 1,
    liveNow: 0,
    hasCalendar: true,
    scope: { kind: "thread", id: ID, label: "Dani" },
  });
  assert.equal(busy[0].q, "¿Qué le dijo la recepcionista a Dani?", "the scope comes first");
  assert.ok(busy.some((s) => s.q === "¿Quién me necesita ahora?" && s.fast));
  assert.ok(busy.some((s) => /sábado/.test(s.q) && s.fast));
  assert.ok(busy.some((s) => /Llamó alguien/.test(s.q)));
  assert.ok(busy.length <= 7);
  assert.equal(new Set(busy.map((s) => s.q)).size, busy.length, "no duplicates");
});

test("the question about proposals is offered once a deal is on file (0004; 0008, amended 18 Oct 2026): People's surface says so, in the person's language", () => {
  const quiet = { needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false };
  const EN = "Who has a proposal out?";
  const ES = "¿Quién tiene una propuesta pendiente?";
  const on = buildAskSuggestions({ ...quiet, surface: "people", language: "en", hasDeals: true });
  assert.ok(
    on.some((s) => s.q === EN && s.kind === "ask"),
    "People, a deal on file: the question is offered",
  );
  assert.ok(
    buildAskSuggestions({ ...quiet, surface: "other", language: "es", hasDeals: true }).some((s) => s.q === ES),
  );
  assert.ok(
    !buildAskSuggestions({ ...quiet, surface: "people", language: "en" }).some((s) => s.q === EN),
    "no deal on file: no question about proposals",
  );
  assert.ok(
    !buildAskSuggestions({ ...quiet, surface: "people", language: "es", hasDeals: false }).some((s) => s.q === ES),
  );
  assert.ok(
    !buildAskSuggestions({ ...quiet, surface: "inbox", language: "en", hasDeals: true }).some((s) => s.q === EN),
    "the Inbox is not where people are looked at",
  );
});

test("on the first run the page's own questions lead: what is left to set up and the hours, then what AI can do, in either language, and never an offer or a playbook; Today opens on what to do next (the operator, D7) and Settings offers no invitation (the Team page's alone); every other page's chips are what they were (Ask Rewired, Phase 7)", () => {
  const quiet = { needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false, canAct: true };
  const chips = (surface, language = "en") =>
    buildAskSuggestions({ ...quiet, surface, language, leadSearches: ["pilates in denver"] }).map(
      (s) => `${s.q}${s.fast ? "*" : ""}`,
    );
  assert.deepEqual(chips("start"), [
    "What is left to set up?",
    "What are my hours this week?",
    "What can you do for me?",
    "Who needs me right now?*",
    "How did the week go?",
    "What can you do on your own?",
    "Remember that ",
  ]);
  assert.deepEqual(chips("start", "es").slice(0, 2), [
    "¿Qué falta por configurar?",
    "¿Cuál es nuestro horario esta semana?",
  ]);
  const first = buildAskSuggestions({ ...quiet, surface: "start", language: "en" })[0];
  assert.equal(first.fast, false, "the model's, over the steps the server's start provider reads: no quick answer");
  // The page questions as one table (PAGE_QUESTIONS): each other surface offers what it did before it, word for word.
  const EVERYONE = ["Who needs me right now?*", "How did the week go?", "What can you do on your own?"];
  const OFFER = ["Remember that ", "Send the ", "Start a win-back campaign for the quiet clients"];
  const CALLS = ["Did anyone call while I was busy?", ...EVERYONE, "Remember that "];
  const was = {
    today: [
      "What should I do next?",
      "Brief me on today",
      "Who wrote today?",
      ...EVERYONE,
      "Remember that ",
      "Close on ",
    ],
    inbox: [
      "Who wrote today?",
      "What can you do on your own?",
      "Who needs me right now?*",
      "How did the week go?",
      "Remember that ",
      "Hold every reply for my review before it sends",
    ],
    people: ["Who wrote today?", ...EVERYONE, ...OFFER],
    leads: ["Find more like: pilates in denver", ...EVERYONE, "Remember that "],
    conversations: CALLS,
    live: CALLS,
    reports: ["How did the week go?", "Who needs me right now?*", "What can you do on your own?", "Remember that "],
    settings: [
      "What can you do on your own?",
      "What are my hours this week?",
      "Who needs me right now?*",
      "How did the week go?",
      "Remember that ",
      "Close on ",
      "Change Saturday's hours to ",
    ],
    pipeline: ["Who wrote today?", ...EVERYONE, ...OFFER],
    calendar: [...EVERYONE, ...OFFER],
    campaigns: [...EVERYONE, ...OFFER],
    other: [...EVERYONE, ...OFFER],
  };
  for (const [surface, chipsWere] of Object.entries(was)) assert.deepEqual(chips(surface), chipsWere, surface);
  assert.deepEqual([...Object.keys(was), "start"].sort(), [...ASK_SURFACES].sort(), "every surface is held here");
});

test("the surfaces are one list, Leads among them, and every kind a scope may have is a kind a citation names, a run as a broadcast: the route and the prompt read the same names", () => {
  assert.ok(ASK_SURFACES.includes("leads"), "Leads is a page AI knows it is on");
  assert.ok(ASK_SURFACES.includes("people") && ASK_SURFACES.includes("other"));
  assert.equal(new Set(ASK_SURFACES).size, ASK_SURFACES.length, "each said once");
  assert.deepEqual(
    ASK_SCOPE_KINDS.filter((k) => !ASK_CITATION_KINDS.includes(k)),
    ["run", "ad", "file", "sequence", "message"],
    "a run is its address's word for a Broadcasts row; an ad is cited as the page it is on until the Ads read lands (0049); a file is seen, not cited (0099); a sequence is cited as the playbook it is; a Library message is seen by its page",
  );
  assert.ok(ASK_CITATION_KINDS.includes("broadcast"), "which a citation names a send");
  // A campaign is one now, open in its drawer (the moment spec, A1): campaigns/moment:<id>.
  assert.deepEqual(
    ASK_CITATION_KINDS.filter((k) => !ASK_SCOPE_KINDS.includes(k)),
    ["deal", "list", "broadcast", "template", "mailbox", "review"],
    "the rows a reader returns that no page opens as a scope (a review's reply box is the page around it; a visit open in its sheet is one now)",
  );
});

test("a campaign's scope is read before the model is asked, by the read of its own record (campaigns.campaign)", async () => {
  const { scopedRead } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/cross-page.ts")).href
  );
  // The one open, as its record shows it (every campaign is a sequence): never the whole list (Ruben, 12 Nov 2026).
  for (const kind of ["playbook", "sequence"])
    assert.deepEqual(scopedRead({ kind, id: "p1", label: "Win-back" }), {
      name: "campaigns",
      input: { action: "campaign", campaign_id: "p1" },
    });
  assert.deepEqual(scopedRead({ kind: "message", id: "reminder_24h", label: "Reminder" }), {
    name: "campaigns",
    input: { action: "messages", name: "reminder_24h" },
  });
  assert.deepEqual(scopedRead({ kind: "visit", id: "v1", label: "this visit" }, "calendar/week:2026-11-12:a-v1"), {
    name: "calendar",
    input: { action: "week", day: "2026-11-12" },
  });
});

test("on Leads, the chips are the first day's ideas, each a search; after that, more like the latest two searches; then the usual questions", () => {
  const quiet = { needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false };
  const ideas = buildAskSuggestions({
    ...quiet,
    surface: "leads",
    language: "en",
    leadIdeas: [
      "100 nail salons in Queens, NY",
      "",
      "50 dentists in Austin, TX",
      "Wedding planners in Miami, FL",
      "Florists in Tampa, FL",
    ],
    leadSearches: ["30 gyms in Boise, ID"],
  });
  assert.deepEqual(
    ideas.slice(0, 3).map((s) => [s.q, s.kind, s.icon]),
    [
      ["100 nail salons in Queens, NY", "ask", "search"],
      ["50 dentists in Austin, TX", "ask", "search"],
      ["Wedding planners in Miami, FL", "ask", "search"],
    ],
    "the ideas first, up to three, an empty one skipped",
  );
  assert.ok(
    !ideas.some((s) => /Florists|more like/.test(s.q)),
    "a fourth idea, and the searches beside ideas, are not offered",
  );
  const busy = buildAskSuggestions({
    ...quiet,
    needsYou: 2,
    heldDrafts: 1,
    missedToday: 1,
    liveNow: 1,
    surface: "leads",
    language: "en",
    leadIdeas: ["100 nail salons in Queens, NY"],
  });
  assert.equal(
    busy[0].q,
    "100 nail salons in Queens, NY",
    "on a busy day the page's own chip still comes first: the section under the field keeps three",
  );
  const more = buildAskSuggestions({
    ...quiet,
    surface: "leads",
    language: "en",
    leadIdeas: [],
    leadSearches: ["50 dentists in Austin, TX", "30 gyms in Boise, ID", "20 plumbers in Reno, NV"],
  });
  assert.deepEqual(
    more.slice(0, 2).map((s) => [s.q, s.icon]),
    [
      ["Find more like: 50 dentists in Austin, TX", "search"],
      ["Find more like: 30 gyms in Boise, ID", "search"],
    ],
    "no ideas: the latest two searches, in the owner's own words",
  );
  assert.ok(!more.some((s) => /Reno/.test(s.q)), "the latest two");
  assert.ok(
    more.some((s) => s.q === "Who needs me right now?" && s.fast),
    "then the usual questions",
  );
  // AI's home draws only what was written for this workspace as chips (Ruben, 17 Nov 2026): the model's ideas and the
  // owner's own searches, never a question from the table.
  assert.ok(
    ideas.slice(0, 3).every((s) => s.own) && more.slice(0, 2).every((s) => s.own),
    "the ideas and the searches are the workspace's own",
  );
  assert.ok(!more.some((s) => s.own && s.q === "Who needs me right now?"), "a question from the table is not");
  assert.ok(more.length <= 7);
  const es = buildAskSuggestions({
    ...quiet,
    surface: "leads",
    language: "es",
    leadSearches: ["50 dentistas en Austin, TX"],
  });
  assert.equal(es[0].q, "Encuentra más como: 50 dentistas en Austin, TX");
  const bare = buildAskSuggestions({ ...quiet, surface: "leads", language: "en" });
  assert.ok(
    bare.some((s) => s.q === "Who needs me right now?"),
    "nothing to offer on Leads: the usual questions alone",
  );
  assert.ok(!bare.some((s) => s.icon === "search"));
});

test("the prompt on Leads: the page is named and words that describe businesses are a search to propose; every other page keeps its one line", async () => {
  const { turnWords } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/prompt.ts")).href
  );
  const facts = {
    role: "owner",
    personLabel: "ada@example.com (owner)",
    scope: null,
    language: "en",
    timezone: "America/New_York",
    closures: [],
    now: new Date(NOW),
  };
  const leads = turnWords({ ...facts, surface: "leads" });
  assert.ok(leads.includes("They are on the Leads page"), leads);
  assert.ok(
    leads.includes("are a lead search to propose, once the searches they have are read"),
    "a search is proposed, never run",
  );
  assert.ok(leads.includes("ask only when the kind or the place is missing"));
  assert.ok(leads.includes("words that answer its question amend it"), "an answer amends the search that asked");
  assert.ok(!leads.includes("They are on the leads page."), "the generic line does not double it");
  const people = turnWords({ ...facts, surface: "people" });
  assert.ok(people.includes("They are on the people page."));
  assert.ok(!people.includes("propose_lead_search"), "People is not the finder");
  assert.ok(!turnWords({ ...facts, surface: null }).includes("They are on the"), "no surface, no line");
  assert.ok(
    turnWords({ ...facts, surface: "pipeline" }).includes("They are on the pipeline page."),
    "a new surface, named",
  );
  // Every row a scope names has a read by its id since PR 4.3 (a lead, a search and a run among them): one whose read did
  // not ride in is one the model reads, and none is said to be unreadable.
  const on = (kind) => turnWords({ ...facts, surface: "leads", scope: { kind, id: "x1", label: `this ${kind}` } });
  for (const kind of ["thread", "call", "person", "lead", "search", "run"]) {
    assert.ok(on(kind).includes("Read it before answering about it."), kind);
    assert.ok(!on(kind).includes("No tool reads it by its id yet"), kind);
  }
  // A row read for the question is said as given, never as one still to read; the page is not claimed with it.
  for (const kind of ["call", "lead", "search", "run"]) {
    const given = turnWords({ ...facts, scope: { kind, id: "x1", label: `this ${kind}` }, scopeRead: true });
    assert.ok(given.includes("It was read for this question and is in the search results"), given);
    assert.ok(!given.includes("Read it before answering about it.") && !given.includes("page://"), given);
  }
  // A reach-out's drawer is the page at its address (contracts scopeFromRoute), which no read names: never said read.
  // Where the page they are on rode in, its rows hold it; else it is read as any scope is.
  const drawer = { kind: "page", id: "campaigns/moment:x1", label: "Movers in Austin" };
  const onPage = turnWords({ ...facts, surface: "campaigns", scope: drawer, context: true, scopeOnPage: true });
  assert.ok(
    onPage.includes(
      "It is the page they are on, in the search results before these words (page://): answer from its rows",
    ),
    onPage,
  );
  assert.ok(!onPage.includes("It was read for this question"), onPage);
  assert.ok(!onPage.includes("Read it before answering about it."), onPage);
  const dropped = turnWords({ ...facts, surface: "campaigns", scope: drawer, scopeOnPage: true });
  assert.ok(dropped.includes("Read it before answering about it."), dropped);
});

test("the three quick questions are told by their words; the answers are ask/answer/normalize.ts's (ask-answer.test.mjs)", () => {
  const TZ = "America/New_York";
  assert.deepEqual(askIntent("who needs me right now?", NOW, TZ), { kind: "needs" });
  assert.deepEqual(askIntent("what's waiting on me", NOW, TZ), { kind: "needs" });
  assert.deepEqual(askIntent("did anyone call while I was busy?", NOW, TZ), { kind: "calls" });
  assert.deepEqual(askIntent("missed calls?", NOW, TZ), { kind: "calls" });
  assert.deepEqual(askIntent("what's open saturday for a balayage", NOW, TZ), {
    kind: "openings",
    day: "sat",
    service: "what's open saturday for a balayage",
  });
  assert.equal(askIntent("qué hay libre mañana", NOW, TZ).day, "2026-09-06");
  assert.equal(dayFromQuestion("any slots today", NOW, TZ), "2026-09-05");
  assert.equal(askIntent("what did AI tell Dani?", NOW, TZ), null, "the long tail is the model's");
  assert.equal(askIntent("tell rosa we are running late", NOW, TZ), null);
});

test("REGRESSION (the review's A1): only a short form, word for word, is quick -- an act, another period, a name, a format or a second ask is the model's", () => {
  const TZ = "America/New_York";
  for (const q of MODEL_QUESTIONS) assert.equal(askIntent(q, NOW, TZ), null, q);
  for (const [q, kind] of QUICK_FORMS) assert.equal(askIntent(q, NOW, TZ)?.kind, kind, q);
  // Each rule on its own, over a form that is otherwise quick.
  assert.equal(askIntent("who needs me right now on WhatsApp or by email", NOW, TZ), null, "past eight words");
  assert.equal(askIntent("reply to who needs me", NOW, TZ), null, "an act");
  assert.equal(askIntent("any missed calls yesterday?", NOW, TZ), null, "a day but today: the answer is today's");
  assert.equal(askIntent("what's open this weekend?", NOW, TZ), null, "a span, not a day");
  assert.equal(askIntent("what's open friday for Ana", NOW, TZ), null, "a name");
  assert.equal(
    askIntent("¿Quién tiene una propuesta pendiente?", NOW, TZ),
    null,
    "a chip of the model's (it was caught)",
  );
  assert.equal(askIntent("¿Por qué espera Rosa?", NOW, TZ), null, "the why chip names someone (it was caught)");
  assert.equal(askIntent("¿Qué hay libre pasado mañana?", NOW, TZ), null, "not tomorrow: the day after");
});

test("a quick answer as POST ask/quick keeps it: the answer the Line drew, cut to its caps, its doors pages of the app; any other shape is no answer", () => {
  const waiting = {
    people: [
      {
        kind: "thread",
        id: ID,
        who: "Nora",
        channel: "WhatsApp",
        when: "waited 2h",
        line: `“${"Can I come at 3? ".repeat(20)}”`,
        to: `inbox/${ID}`,
      },
    ],
    more: 0,
    runs: [],
    searches: [],
    windows: [],
  };
  const drawn = needsAnswer(waiting, "en");
  const kept = quickAnswerOf(JSON.parse(JSON.stringify(drawn)));
  assert.equal(kept.say.headline, drawn.say.headline);
  assert.deepEqual(kept.show.items[0].source, drawn.show.items[0].source, "the row and its door, as drawn");
  assert.ok(drawn.show.items[0].line.length > 160 && kept.show.items[0].line.length <= 160, "a line cut to its cap");
  const calls = callsAnswer([{ callId: ID2, who: "Robin" }], [], "es");
  assert.deepEqual(quickAnswerOf(calls), calls, "a calls answer kept whole");
  const open = openingsAnswer(
    { state: "ok", days: [{ key: "2026-09-06", label: "Sat, Sep 6", windows: ["9:00"] }] },
    "en",
    "sat",
  );
  assert.deepEqual(quickAnswerOf(open), open, "an openings answer kept whole");
  // Parts a quick answer never has are not kept.
  const extra = quickAnswerOf({
    ...calls,
    show: { ...calls.show, figures: [{ value: "9" }], list: { style: "numbers", entries: ["Call Robin"] } },
    do: { ...calls.do, next: ["Why?"] },
  });
  assert.deepEqual([extra.show.figures, extra.show.list, extra.do.next], [[], { style: "bullets", entries: [] }, []]);
  // Shapes the Line never draws.
  const item = (over) => ({
    ...open,
    show: { ...open.show, items: [{ ...open.show.items[0], source: { ...open.show.items[0].source, ...over } }] },
  });
  assert.equal(quickAnswerOf(null), null);
  assert.equal(quickAnswerOf({ ...open, say: { headline: " ", detail: "" } }), null, "no headline");
  assert.equal(quickAnswerOf({ ...open, form: "prose" }), null, "a model's prose");
  assert.equal(quickAnswerOf(item({ to: "https://example.com/x" })), null, "a door off the app");
  assert.equal(quickAnswerOf(item({ to: "javascript:alert(1)" })), null);
  assert.equal(quickAnswerOf(item({ to: "//example.com" })), null);
  assert.equal(quickAnswerOf(item({ to: "/calendar" })), null, "a path from the root");
  assert.equal(quickAnswerOf(item({ kind: "secret" })), null, "a kind no citation has");
  assert.equal(quickAnswerOf(item({ id: "" })), null, "a row with no id");
  assert.equal(quickAnswerOf({ ...open, do: { open: { to: "https://example.com", label: "x" }, next: [] } }), null);
});

test("a message is written in the language its customers read (16 Oct 2026): the business's languages read off its profile in any spelling; none named, the one the person writes in where the business speaks it, else the business's first; a round of messages alone asks next for each of its languages none is written in, and never where it names none", () => {
  assert.deepEqual(messageLanguagesOf(["Spanish", "English"]), ["es", "en"]);
  assert.deepEqual(messageLanguagesOf(["español", "Inglés", "es", "Français"]), ["es", "en"]);
  assert.deepEqual(messageLanguagesOf(["English and Spanish"]), ["en", "es"]);
  assert.deepEqual(messageLanguagesOf(["English (US)", "castellano"]), ["en", "es"]);
  assert.deepEqual(messageLanguagesOf([]), []);
  // None named: the person's own where the business speaks it or names none; else the business's first.
  assert.deepEqual(
    [messageLanguageOf([], "es"), messageLanguageOf([], "en"), messageLanguageOf([], "other")],
    ["es", "en", "en"],
  );
  assert.equal(messageLanguageOf(["es"], "en"), "es", "an English owner of a Spanish-speaking business");
  assert.deepEqual([messageLanguageOf(["en", "es"], "es"), messageLanguageOf(["en", "es"], "en")], ["es", "en"]);
  assert.equal(messageLanguageOf(["es", "en"], "other"), "es");
  // The next question, in the turn's language: one tap writes the other card.
  const card = (language, over = {}) => ({ kind: "message", payload: { language }, ...over });
  const both = ["English", "Spanish"];
  assert.deepEqual(messageLanguagesNext([card("en_US")], both, "en"), ["Can you write it in Spanish too?"]);
  assert.deepEqual(messageLanguagesNext([card("es")], both, "es"), ["¿Puedes escribirlo también en inglés?"]);
  assert.deepEqual(messageLanguagesNext([card("es")], both, "other"), ["Can you write it in English too?"]);
  assert.deepEqual(messageLanguagesNext([card("en_US"), card("es")], both, "en"), []);
  // Never assumed: a business that names no languages, or one, is asked nothing; nor a round with more than messages,
  // nor a plan's message, which its plan sends.
  assert.deepEqual(messageLanguagesNext([card("en_US")], [], "en"), []);
  assert.deepEqual(messageLanguagesNext([card("en_US")], ["English"], "en"), []);
  assert.deepEqual(messageLanguagesNext([card("en_US"), { kind: "playbook", payload: {} }], both, "en"), []);
  assert.deepEqual(messageLanguagesNext([card("en_US", { plan: { id: "plan-1", step: 1, of: 2 } })], both, "en"), []);
});

test("language, scope and settings changes", () => {
  assert.equal(detectLanguage("¿Quién llamó hoy?"), "es");
  assert.equal(detectLanguage("who called today?"), "en");
  assert.equal(detectLanguage("balayage"), "other");
  // Every hint counted, and a word's edges any language's letters: the "a" closing "día" or "consultoría" is no English
  // word, and one hint of each language no longer ties to English (the setup review, 15 Oct 2026).
  for (const es of [
    "Somos una consultoría B2B en línea: primero una llamada, luego casi siempre una propuesta. Prepara mis campañas.",
    "¿Qué día tengo libre mañana?",
    "¿qué le dijo la recepcionista a la última persona que escribió?",
    "Envía una oferta a los clientes que no vienen hace un mes",
  ])
    assert.equal(detectLanguage(es), "es", es);
  for (const en of [
    "We're an online B2B consultancy: people book a discovery call, then most get a proposal. Set up my campaigns.",
    "set up campaigns for a consultancy that sends proposals",
    "send a reminder the day before the appointment",
  ])
    assert.equal(detectLanguage(en), "en", en);
  assert.deepEqual(scopeFromRoute("inbox", `th-${ID}`, "Dani"), { kind: "thread", id: ID, label: "Dani" });
  assert.deepEqual(scopeFromRoute("conversations", `cv-${ID}`, null), { kind: "call", id: ID, label: "this call" });
  assert.deepEqual(scopeFromRoute("clients", ID2, "Rosa"), { kind: "person", id: ID2, label: "Rosa" });
  assert.equal(scopeFromRoute("inbox", null), null);
  assert.equal(scopeFromRoute("clients", "seg:vip"), null);
  const cfg = {
    brain: {
      business_name: "Marisa's",
      profile: { hours: { mon: { open: "10:00", close: "18:00" } }, closures: [{ date: "2026-12-25" }] },
    },
    features: { vision: true },
  };
  const closed = applySettingsChange(cfg, { op: "add_closure", date: "2026-09-12", note: "early" });
  assert.deepEqual(closed.brain.profile.closures, [{ date: "2026-12-25" }, { date: "2026-09-12", note: "early" }]);
  assert.deepEqual(cfg.brain.profile.closures, [{ date: "2026-12-25" }], "the input is not mutated");
  assert.deepEqual(
    applySettingsChange(cfg, { op: "set_hours", day: "sun", open: null, close: null }).brain.profile.hours.sun,
    { open: null, close: null },
  );
  assert.deepEqual(
    applySettingsChange(cfg, { op: "add_note", title: "Parking", text: "Behind the building." }).brain.profile.notes,
    [{ title: "Parking", text: "Behind the building." }],
  );
  // A note with its last day is written with it, and the card's line says it in the date its closure's line uses.
  const holiday = { op: "add_note", title: "Holiday hours", text: "Open 10 to 2 this week.", until: "2026-12-31" };
  assert.deepEqual(applySettingsChange(cfg, holiday).brain.profile.notes, [
    { title: "Holiday hours", text: "Open 10 to 2 this week.", until: "2026-12-31" },
  ]);
  // The card quotes what the receptionist will be told, after its title and its last day: what is approved is the text.
  assert.equal(
    describeSettingsChange(holiday),
    "Note for AI: “Holiday hours”, until 2026-12-31 · “Open 10 to 2 this week.”",
  );
  assert.equal(
    describeSettingsChange({ op: "add_note", title: "Parking", text: "Behind the building.\n\nUse the side door." }),
    "Note for AI: “Parking” · “Behind the building. Use the side door.”",
    "a note with no last day says none, and its text is one line",
  );
  // A long text is cut on a whole word at 160 characters, with an ellipsis inside the quote.
  const long = `${"Ten percent off every colour booked this month ".repeat(4)}and nothing else.`;
  const longLine = describeSettingsChange({ op: "add_note", title: "Offer", text: long });
  const quoted = longLine.slice(longLine.indexOf("· “") + 3, -1);
  assert.ok(longLine.startsWith("Note for AI: “Offer” · “") && longLine.endsWith("…”"), longLine);
  assert.ok(quoted.length <= 161 && long.startsWith(quoted.slice(0, -1)) && long[quoted.length - 1] === " ", quoted);
  assert.equal(
    applySettingsChange(cfg, { op: "add_service", name: "Gloss", duration_min: 45 }).brain.profile.services[0]
      .duration_min,
    45,
  );
  assert.equal(closed.features.vision, true, "the rest of the config rides along");
  assert.equal(
    describeSettingsChange({ op: "add_closure", date: "2026-09-12", note: "early" }),
    "Closed on 2026-09-12 (early)",
  );
  assert.equal(describeSettingsChange({ op: "set_hours", day: "sun", open: null, close: null }), "sun: closed");
});

test("a request's column (contracts askColumnOf): a width in CSS pixels a screen has, rounded, and whether a phone is looking; anything else is none", () => {
  assert.deepEqual(askColumnOf({ px: 358.4, phone: true }), { px: 358, phone: true });
  assert.deepEqual(askColumnOf({ px: 408 }), { px: 408, phone: false }, "a desk unless it says a phone");
  for (const raw of [null, undefined, "wide", 408, { px: 12 }, { px: 9000 }, { px: Number.NaN }, { px: "408" }])
    assert.equal(askColumnOf(raw), null, JSON.stringify(raw) ?? "undefined");
});

test("the bridge: the jump index and Right now come from the surfaces, the quick answers need no route, and a turn is read as JSON lines", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/bridge/ask.ts")).href);
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const lines = [
    '{"t":"thread","id":"t-1","title":"who wrote"}',
    '{"t":"trace","text":"Reading the Inbox"}',
    '{"t":"delta","text":"Two "}',
    '{"t":"delta","text":"people."}',
    '{"t":"final","message":{"id":"m1","role":"assistant","text":"Two people.","citations":[],"followups":[],"proposals":[]}}',
  ];
  const body = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      const joined = lines.join("\n") + "\n";
      c.enqueue(enc.encode(joined.slice(0, 40)));
      c.enqueue(enc.encode(joined.slice(40)));
      c.close();
    },
  });
  const fetched = [];
  // The settings read, landed whole (what follows it reads every part): a calendar is connected, which the palette
  // reads there (a window global, `__SETTINGS`, until 12 Nov 2026).
  const { setSurfaceValue } = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/surfaces/surface-values.ts")).href
  );
  setSurfaceValue("settings", {
    settings: { config: { calendar: { ical_url: "https://x" } } },
    facts: null,
    templatesAll: [],
    templateVersions: [],
    messages: [],
    templateUse: null,
    templateSent: null,
    policies: null,
    team: [],
    invites: [],
  });
  bridgeHolds({
    who: {
      workspaces: [{ id: "w1", slug: "m", name: "Studio", status: "active", timezone: "America/New_York" }],
      activeWorkspaceId: "w1",
    },
    values: {
      inbox: {
        THREADS: [
          { id: "th-1", real: true, who: "Dani", needsYou: true, escalatedAtMs: NOW - 60_000, preview: "hi" },
          { id: "seed", real: false, who: "Aisha Khan", needsYou: true },
        ],
      },
      live: {
        now: [],
        recent: [
          {
            callId: "k1",
            cvId: "cv-k1",
            who: "+1 917 555 0100",
            missed: true,
            live: false,
            // Just now: a minute back fell into yesterday when the suite ran in New York's first minute (17 Oct 2026).
            startedAtMs: Date.now(),
          },
        ],
      },
      people: { rows: [{ id: ID, name: "Rosa Pérez" }] },
      today: {
        queue: {
          rows: [
            {
              id: "q1",
              kind: "handoff",
              conversationId: "c1",
              callId: null,
              who: "Nora",
              channel: "WhatsApp",
              when: "waited 2h",
              sentence: "Can I come at 3?",
              quoted: true,
              cta: { label: "Reply", to: "inbox/th-c1" },
            },
            {
              id: "q2",
              kind: "call",
              conversationId: null,
              callId: "k9",
              who: "Lee",
              channel: "Phone",
              when: "2:14 PM · 1:35",
              sentence: "Asked about a gift card.",
              quoted: false,
              cta: { label: "Listen", to: "conversations/cv-k9" },
            },
          ],
        },
      },
      broadcasts: {
        rows: [
          {
            id: "r1",
            name: "Win-back",
            playbook_id: "pb-win",
            state: "pending_approval",
            recipient_count: 1,
            when: "now",
            counts: { sent: 0, replied: 0 },
            audience: { label: "Win-back · quiet 30 days" },
          },
          {
            id: "r2",
            state: "sent",
            recipient_count: 4,
            when: "Sep 20",
            counts: { sent: 4, replied: 1 },
            audience: { label: "Welcome" },
          },
        ],
      },
    },
  });
  const win = {
    fetch: async (url, init) => {
      fetched.push({ url, init });
      return { ok: true, status: 200, body };
    },
    location: { assign: () => {} },
  };
  const api = mod.installAsk(win, storage);
  // The object it publishes carries every one of the palette's own: the parts composed, not re-implemented.
  const { askPalette } = await importSrc("apps/dashboard/src/bridge/ask/palette.ts");
  for (const k of Object.keys(askPalette({}, null))) assert.ok(k in api, `the palette's ${k}, composed`);
  assert.equal(win.__ask, api, "published for the palette");
  const idx = api.jumpIndex();
  assert.ok(idx.some((j) => j.to === "inbox/th-1" && j.kind === "thread"));
  assert.ok(!idx.some((j) => /Aisha/.test(j.label)), "a seeded thread never reaches the jump list");
  assert.ok(idx.some((j) => j.to === `clients/${ID}`));
  assert.ok(idx.some((j) => j.to === "conversations/cv-k1" && j.sub === "missed"));
  // Right now from Today's queue and its one count, as before the Inbox's threads are counted (needs-you.ts needsYouParts
  // answers nothing until the Inbox is read): the threads above were for the jump list alone.
  bridgeHolds({ values: { inbox: undefined } });
  assert.equal(
    api.rightNow("en"),
    "Nora needs you. A send is waiting for your approval.",
    "the queue's people (a call worth a listen is nobody waiting) and the run waiting for a yes",
  );
  assert.deepEqual(api.waiting().people, [
    {
      id: "c1",
      kind: "thread",
      who: "Nora",
      channel: "WhatsApp",
      when: "waited 2h",
      line: "“Can I come at 3?”",
      to: "inbox/th-c1",
    },
  ]);
  assert.deepEqual(
    api.waiting().runs.map((r) => [r.id, r.label, r.reach, r.to]),
    [["r1", "Win-back", 1, "campaigns/sequences/r1/runs/r1"]],
    "REGRESSION: a run is called by its own name less its day, as Today's queue and the Inbox say it; by its audience's label a one-off sent to a list was the list (18 Oct 2026)",
  );
  // A run whose audience has no name (a reach-out's carries its ids alone) is called the same way (contracts runTitleOf).
  const named = surfaceValue("broadcasts").rows[0].audience;
  surfaceValue("broadcasts").rows[0].audience = null;
  assert.equal(api.waiting().runs[0].label, "Win-back");
  surfaceValue("broadcasts").rows[0].audience = named;
  // How many more wait past the rows is the one count's threads (Today's own copy until the Inbox is read), not a sum of rows.
  const counted = surfaceValue("today").needsYou;
  surfaceValue("today").needsYou = {
    ...(counted ?? { hint: "", rows: [], empty: null }),
    count: 9,
    holds: 9,
    sends: 0,
  };
  assert.equal(api.waiting().more, 8, "the people waiting past the rows the queue draws (the one count's threads)");
  surfaceValue("today").needsYou = counted;
  assert.deepEqual(api.intent("who needs me?"), { kind: "needs" });
  const needs = await api.quick("who needs me?");
  assert.deepEqual(
    needs.show.items.map((i) => i.source.to),
    ["inbox/th-c1", "campaigns/sequences/r1/runs/r1"],
  );
  const called = await api.quick("did anyone call?");
  assert.deepEqual(
    [called.say.headline, called.show.items.map((i) => i.source.to)],
    ["One missed call today.", ["conversations/cv-k1"]],
  );
  assert.equal(api.quick("what did AI tell Dani?"), null, "the long tail is the model's");
  const drawn = api.answer({ text: "Hi", citations: [], navigate: null, followups: [], proposals: [], language: "en" });
  assert.equal(drawn.answer.form, "prose", "an answer made before the Line reads back as prose");
  assert.equal(api.answerText(drawn.answer), "Hi");
  assert.equal(
    api.suggestions("today", null, "en").some((s) => /open tomorrow/i.test(s.q)),
    true,
    "a calendar is connected",
  );
  const proposals = (lang) =>
    api.suggestions("people", null, lang).some((s) => /proposal out|propuesta pendiente/.test(s.q));
  assert.equal(proposals("en"), false, "People's surface has not said a deal is on file");
  surfaceValue("people").hasDeals = true;
  assert.equal(proposals("en"), true, "it has: the question about proposals is offered, read from the surface");
  assert.equal(proposals("es"), true);
  assert.equal(api.timezone(), "America/New_York");
  assert.equal(api.surfaceFor("clients"), "people");
  assert.equal(api.surfaceFor("clients", null), "people");
  assert.equal(api.surfaceFor("clients", ID), "people", "a person's profile is People");
  assert.equal(api.surfaceFor("clients", "leads"), "leads", "the Leads page is the People page's leads param");
  assert.equal(api.surfaceFor("clients", "leads:s-x"), "leads", "a search open is still Leads");
  // The Leads chips read the leads surface: the first day's ideas, else the latest searches' own words (its window
  // mirror, `__LEADS`, until 12 Nov 2026).
  setSurfaceValue("leads", { suggestions: { items: [{ words: "100 nail salons in Queens, NY" }] }, searches: [] });
  assert.ok(
    api.suggestions("leads", null, "en").some((s) => s.q === "100 nail salons in Queens, NY" && s.icon === "search"),
    "the first day's idea is a chip",
  );
  setSurfaceValue("leads", {
    suggestions: null,
    searches: [
      { asked: "50 dentists in Austin, TX" },
      { asked: "30 gyms in Boise, ID" },
      { asked: "20 plumbers in Reno, NV" },
    ],
  });
  assert.deepEqual(
    api
      .suggestions("leads", null, "en")
      .filter((s) => s.icon === "search")
      .map((s) => s.q),
    ["Find more like: 50 dentists in Austin, TX", "Find more like: 30 gyms in Boise, ID"],
    "after the first day, the latest two searches",
  );
  const seen = [];
  await api.send({ text: "who wrote today?", threadId: null, scope: null, surface: "today" }, (ev) => seen.push(ev));
  assert.deepEqual(
    seen.map((e) => e.t),
    ["thread", "trace", "delta", "delta", "final"],
    "every line, across chunk boundaries",
  );
  assert.equal(seen[4].message.text, "Two people.");
  assert.equal(fetched[0].init.method, "POST");
  assert.ok(fetched[0].url.endsWith("/api/v1/ask") || fetched[0].url.includes("/api/v1/ask?"));
  assert.equal(JSON.parse(fetched[0].init.body).surface, "today");
  assert.equal(store.get("chanlytics:ask:lang"), "en", "the person's language is remembered for the suggestions");
});

test("the turn route: a ceiling past the turn's two minutes (the operator: eight rounds), and twenty questions a minute", async () => {
  // Run, not read (25 Nov 2026): the route's policy -- every member's, counted in the `ask` bucket -- is
  // route-policy.json's, held to the declarations by routes/route-policy.test.mjs. The thread kept before the model is
  // asked, the question and the answer its two turns, the JSON lines and their headers, all on the session client, run
  // through the route in ask/routes/ ("a question answered"); a service-role read added to the turn is a new
  // offender of check:debt's `service-role` measure.
  const route = await importSrc("apps/dashboard/app/api/v1/ask/route.ts");
  assert.equal(route.maxDuration, 150, "the platform lets the turn run past its own two minutes");
  const { RATE } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
  assert.deepEqual(RATE.ask, { limit: 20, windowMs: 60_000, noun: "questions" });
});

test("the loop and its reads: several at once, the stable block cached, through the pages' own view models, capped, each recording what an answer may name", () => {
  // How a turn ends -- the answer's format, auto then none, strict and the format retried without, sources grounded,
  // a proposal counted as a read -- runs against scripted rounds in ask/turn/; that a round's reads run at once, there
  // too ("a round's reads run at once").
  // The stable block and the workspace's shape are each a cache breakpoint, and no shape is one block (prompt.ts).
  assert.deepEqual(
    systemBlocks("rules", "shape").map((b) => [b.text, b.cache_control]),
    [
      ["rules", { type: "ephemeral" }],
      ["shape", { type: "ephemeral" }],
    ],
    "the stable block is cached",
  );
  assert.equal(systemBlocks("rules", null).length, 1);
  // The reads as the registry offers them, sorted by name, the fourteen reads before them their actions (D11), and the
  // operator's (15 Oct 2026): the guide, the signals, the ideas, what comes back, the winners, the cold emails.
  // The rest of what this block pinned as text -- the reads go through the pages' own view models, are capped, and
  // record what a citation may name -- runs in ask/turn/: "the fourteen reads, each an action of the nine read
  // tools" (the shapes and the read set), "the day is read once a turn" (recent is the newest twenty).
  assert.deepEqual(
    READ_TOOLS.map((t) => [t.name, t.input_schema.properties.action?.enum ?? []]),
    [
      ["calendar", ["week", "openings", "room"]],
      ["calls", ["list", "get"]],
      [
        "campaigns",
        ["list", "campaign", "moments", "lists", "messages", "sent", "send", "journey", "cold_emails", "edited"],
      ],
      ["files", ["list", "get", "view", "compare", "zoom", "listen", "week", "reasons"]],
      ["guide", []],
      ["inbox", ["list", "conversation", "search"]],
      ["leads", ["searches", "leads", "lead", "ideas", "back", "search"]],
      ["people", ["search", "get", "lists", "winners", "pipeline"]],
      ["recall", []],
      ["report", []],
      ["signals", []],
      ["today", []],
      ["workspace", ["settings", "connections", "notifications", "activity"]],
    ],
  );
  // The rules as the model is told them (prompt.ts ASK_RULES), executed: a customer's words never instruct, Ask never
  // acts, and it states only what it read this turn -- but for a row an earlier answer in the thread named, which is
  // named, cited and opened without a read, and read again for anything about it (the Phase 5 plan, D5).
  const rules = ASK_RULES.join("\n");
  assert.ok(rules.includes(DATA_NOT_INSTRUCTIONS), "the one injection rule line: what a customer wrote is data");
  assert.ok(rules.includes("Every change is a card a person presses"));
  const read = ASK_RULES.filter((r) => r.includes("you did not read this turn"));
  assert.equal(read.length, 1, "one rule says it");
  for (const words of [
    "Answer from the tools. Never state a name, a count, a time, a price or a quote you did not read this turn",
    "a row an earlier answer in this conversation named",
    "may be named, cited and opened by the kind, id and name the earlier turns give it, without a read",
    "anything about it (a count, a time, what was said, where it stands now) is read again",
    "If a tool returns nothing, say so plainly.",
  ])
    assert.ok(read[0].includes(words), words);
});

test("REGRESSION: the rules say what stays on a page and where, from the guide's own table, and which yes a one-off send reaches -- asked to delete everyone, AI said to look for a delete option; of a reminder, it said a one-off send reaches only the yes to offers (the operator stress run, 15 Oct 2026)", () => {
  const one = ASK_RULES.find((r) => r.startsWith("A proposal is one card."));
  // Every act the guide leaves to its page, with its page and why, in the rule that says to name where.
  for (const p of ASK_GUIDE_PAGES)
    for (const x of p.pageOnly) assert.ok(one.includes(`${x.what} (${p.page}: ${x.why})`), `${p.page}: ${x.what}`);
  assert.ok(
    one.includes(
      "Delete a person (People: it deletes a person for good, which is asked for and confirmed on their page)",
    ),
  );
  // A one-off send reaches the yes its message asks for, as the send counts it (broadcastReach by its purpose).
  const door = ASK_RULES.find((r) => r.includes("a one-off send reaches only the people whose yes covers its message"));
  assert.ok(
    door.includes(
      "reaches only the people whose yes covers its message: a reminder or a confirmation reaches the yes to messages, an offer or news the yes to offers",
    ),
    door,
  );
  assert.ok(!/reaches only the people who said yes[;,]/.test(ASK_RULES.join("\n")), "never which yes left unsaid");
});

test("the gateway: the key stays on the edge, AI's tokens have their own event kind and their own cap; the dashboard signs for the door and holds no key", async () => {
  // The door itself -- the knock, purpose 'ask', the budget refused at the
  // cap, the request streamed, the stream forwarded and metered -- runs in
  // llm-door.test.mjs. That the receptionist's day never counts Ask's tokens is proved on the database
  // (receptionist/policies/the-day-s-budget-is-one-sum.db.test.mjs, an Ask row of seven million left out), and that
  // the dashboard reads no model key is a rule of the repository (repo/env-manifest.test.mjs).
  const gateway = await importSrc("apps/edge/lib/ai/ask-gateway.ts");
  assert.equal(gateway.ASK_USAGE_KIND, "usage.ask_tokens", "Ask's tokens have their own event kind");
  assert.equal(
    ASK_TOKENS_DAY,
    3_000_000,
    "sized for a workspace's day with its cache writes counted (1.5M before they were); 400k was spent by one day of eval runs",
  );
  // What the dashboard's call names and binds is run in edge/dashboard-names-its-callers.test.mjs.
  const vercel = createRequire(import.meta.url)("../../../apps/edge/vercel.json");
  assert.equal(
    vercel.builds[0].config.functions["api/admin/llm.ts"]?.maxDuration,
    60,
    "the gateway has the minute the turn may need, as the platform reads its config",
  );
});
