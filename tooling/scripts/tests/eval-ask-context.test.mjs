// The page an eval case is asked on (tooling/scripts/eval-ask-context.mjs; the Phase 2 plan, PR 2.3): built from what
// the page's GETs answer, the way the palette builds it, and held to the schema the route reads it with; the judge's
// excuse for a case the page answers, and what a case's page asks of the answer; the case set's pages, each built
// over fixture answers and placed on its surface as the palette places its route; and the runner's listing, run with
// no credentials, which says every case, the turns and their cost and spends nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PageContextSchema } from "@chanlytics/contracts";
import {
  ROW_KINDS,
  announcement,
  contextFails,
  contextProblems,
  fromContext,
  neededGets,
  ordinal,
  pageProblems,
  parseRows,
  resolveContext,
} from "../eval-ask-context.mjs";

const { surfaceFor } = await import("../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const U = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const hoursAgo = (h) => new Date(Date.UTC(2026, 8, 26, 12) - h * 3_600_000).toISOString();

/** The GETs' answers (their `data`), as the eval workspace would give them: made-up people, 555-01xx numbers. */
const ANSWERS = {
  conversations: {
    conversations: [
      {
        id: U(1),
        last_message_at: hoursAgo(2),
        contact: { id: U(11), display_name: "Robin Example", wa_profile_name: "Robin", phone_e164: "+12125550143" },
        messages: [],
      },
      {
        id: U(2),
        last_message_at: hoursAgo(30),
        contact: { id: U(13), display_name: null, wa_profile_name: null, phone_e164: "+12125550145" },
        messages: [],
      },
    ],
  },
  calls: {
    calls: [
      {
        id: U(3),
        started_at: hoursAgo(26),
        contact: { display_name: "Casey Example", wa_profile_name: null, phone_e164: "+12125550144" },
      },
    ],
  },
  contacts: {
    people: [
      { id: U(11), display_name: "Robin Example", wa_profile_name: "Robin", phone_e164: "+12125550143" },
      { id: U(12), display_name: "Casey Example", wa_profile_name: null, phone_e164: "+12125550144" },
      { id: U(13), display_name: "Sam Example", wa_profile_name: null, phone_e164: "+12125550145" },
    ],
    page: { q: null, offset: 0, limit: 1000, total: 3, has_more: false },
  },
  leads: {
    rows: [
      { id: U(21), business_name: "Example Strength Lab" },
      { id: U(22), business_name: "Example Coaching Co." },
    ],
    next: null,
  },
  "lead-searches": { searches: [{ id: U(31), name: "Pilates studios · Denver" }], counts: {} },
  playbooks: { playbooks: [], deals_on: false },
  broadcasts: { broadcasts: [], more: false, touched: null },
  templates: { templates: [] },
};

const accepted = (context) => {
  const read = PageContextSchema.safeParse(context);
  assert.ok(read.success, `a context the route takes: ${JSON.stringify(read.error?.issues ?? [])}`);
};

test("a page's rows are the first n of its GET, each the kind its surface's provider sends, and the schema takes them", () => {
  const inbox = resolveContext({ surface: "inbox", route: "inbox", rows: "GET conversations:1" }, ANSWERS, 1234);
  accepted(inbox.context);
  assert.deepEqual(inbox.context, {
    v: 1,
    surface: "inbox",
    route: "inbox",
    view: null,
    focus: null,
    rows: [{ kind: "thread", id: U(1) }],
    askedAt: 1234,
  });
  assert.equal(inbox.scope, null, "a list opens no row");
  const people = resolveContext({ surface: "people", route: "clients", view: "all", rows: "GET contacts" }, ANSWERS);
  accepted(people.context);
  assert.deepEqual(
    people.context.rows,
    [U(11), U(12), U(13)].map((id) => ({ kind: "person", id })),
    "every row, in the GET's order, when no n is said",
  );
  assert.equal(people.context.view, "all");
  const leads = resolveContext({ surface: "leads", route: "clients/leads", rows: "GET leads:5" }, ANSWERS);
  assert.deepEqual(
    leads.context.rows.map((r) => r.kind),
    ["lead", "lead"],
  );
  // Conversations merges its threads and its calls newest first, as the page does (surface-data.ts).
  const conv = resolveContext(
    { surface: "conversations", route: "conversations", rows: "GET conversations+calls:40" },
    ANSWERS,
  );
  accepted(conv.context);
  assert.deepEqual(conv.context.rows, [
    { kind: "conversation", id: U(1) },
    { kind: "call", id: U(3) },
    { kind: "conversation", id: U(2) },
  ]);
  // An empty page is an empty list, never a failure: the eval workspace has no playbook.
  const camp = resolveContext(
    { surface: "campaigns", route: "outbound", view: "playbooks", rows: "GET playbooks:40" },
    ANSWERS,
  );
  accepted(camp.context);
  assert.deepEqual(camp.context.rows, []);
  // Forty at most, whatever n says.
  const many = { contacts: { people: Array.from({ length: 60 }, (_, i) => ({ id: U(100 + i), display_name: "X" })) } };
  assert.equal(
    resolveContext({ surface: "people", route: "clients", rows: "GET contacts" }, many).context.rows.length,
    40,
  );
  assert.equal(
    resolveContext({ surface: "people", route: "clients", rows: "GET contacts:99" }, many).context.rows.length,
    40,
  );
  assert.throws(
    () => resolveContext({ surface: "people", route: "clients", rows: "GET contacts" }, {}),
    /GET contacts was not read/,
  );
});

test("the focus is the row at the place the words name; a route that opens a row is the scope, and the focus when none is named", () => {
  const second = resolveContext({ surface: "people", route: "clients", rows: "GET contacts", focus: "2" }, ANSWERS);
  accepted(second.context);
  assert.deepEqual(second.context.focus, { kind: "person", id: U(12), label: "Casey Example" });
  assert.equal(second.scope, null);
  assert.equal(
    resolveContext({ surface: "inbox", route: "inbox", rows: "GET conversations:1", focus: "second" }, ANSWERS).context
      .focus,
    null,
    "a place past the rows drawn names none",
  );
  const opened = resolveContext({ surface: "people", route: "clients/<row:1>", rows: "GET contacts" }, ANSWERS);
  accepted(opened.context);
  assert.equal(opened.context.route, `clients/${U(11)}`);
  assert.deepEqual(opened.scope, { kind: "person", id: U(11), label: "Robin Example" });
  assert.deepEqual(opened.context.focus, opened.scope);
  const thread = resolveContext({ surface: "inbox", route: "inbox/th-<row:1>", rows: "GET conversations" }, ANSWERS);
  assert.deepEqual(thread.scope, { kind: "thread", id: U(1), label: "Robin Example" });
  // A row of another workspace: a literal id the tab claims, labelled as the palette labels a row it cannot name.
  const foreign = U(999);
  const f = resolveContext(
    { surface: "people", route: `clients/${foreign}`, rows: [{ kind: "person", id: foreign }] },
    ANSWERS,
  );
  accepted(f.context);
  assert.deepEqual(f.context.rows, [{ kind: "person", id: foreign }]);
  assert.deepEqual(f.scope, { kind: "person", id: foreign, label: "this person" });
  assert.throws(
    () => resolveContext({ surface: "people", route: "clients/<row:4>", rows: "GET contacts" }, ANSWERS),
    /opens row 4, and the page drew 3/,
  );
});

test("a context the eval cannot build is said in words before anything is read", () => {
  assert.deepEqual(parseRows("GET conversations+calls:5"), { keys: ["conversations", "calls"], n: 5 });
  assert.equal(parseRows("conversations"), null);
  assert.equal(ordinal("#3"), 3);
  assert.equal(ordinal("third"), 3);
  assert.equal(ordinal("the third"), null);
  assert.deepEqual(contextProblems({ surface: "inbox", route: "inbox", rows: "GET conversations:3" }), []);
  const said = (spec) => contextProblems(spec).join("; ");
  assert.match(said({ surface: "moon", route: "x" }), /no surface "moon"/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "GET contacts" }), /the inbox page draws no rows/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "GET gossip" }), /no GET gossip/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "conversations" }), /is not "GET <key>/);
  assert.match(said({ surface: "inbox", route: "inbox", focus: "2" }), /needs rows to count/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "GET conversations", focus: "the one" }), /neither/);
  assert.match(said({ surface: "inbox", route: "inbox", scope: "1" }), /a field the context does not know: scope/);
  assert.match(said({ surface: "people", route: "clients/<row:1>" }), /no rows to open/);
  assert.deepEqual(pageProblems([{ id: "x", surface: "today", context: { surface: "inbox", route: "inbox" } }]), [
    "x: asked on today, its page is inbox",
  ]);
  assert.throws(() => resolveContext({ surface: "inbox" }, ANSWERS), /cannot build/);
});

test("the judge excuses a missing read when the page answered: the snapshot's overview, or an on-page case's rows", () => {
  const onPage = {
    expect: { on_page: true, tools_any: ["search_people"] },
    context: { surface: "people", route: "clients", rows: "GET contacts" },
  };
  const rode = { rows: [{ kind: "person", id: U(11) }] };
  assert.equal(fromContext(onPage, { tools: [] }, rode), true, "its rows rode");
  assert.equal(fromContext(onPage, { tools: [] }, { rows: [] }), false, "the GET drew nothing: no rows rode");
  assert.equal(fromContext(onPage, { tools: [] }, null), false, "no page was sent");
  assert.equal(
    fromContext({ ...onPage, expect: { tools_any: ["search_people"] } }, { tools: [] }, rode),
    false,
    "a case not marked on the page must read",
  );
  const aggregate = {
    expect: { on_page: true, tools_any: ["get_report"] },
    context: { surface: "reports", route: "reports" },
  };
  assert.equal(fromContext(aggregate, { tools: [] }, { rows: [] }), true, "a page of no rows rides as itself");
  assert.equal(
    fromContext({ expect: { tools_any: ["get_today"] } }, { tools: [] }, null),
    true,
    "today's excuse stands",
  );
});

test("a case's page asks of the answer: never the foreign row, and the row the words pointed at by name", () => {
  const foreign = U(999);
  const c = { expect: { never_cites: [foreign] } };
  assert.deepEqual(contextFails(c, { text: "I can't find them.", citations: [] }, null), []);
  for (const m of [
    { text: "", citations: [{ kind: "person", id: foreign, label: "x" }] },
    { text: "", citations: [], navigate: { to: `clients/${foreign}`, now: true } },
    { text: "", citations: [], answer: { show: { items: [{ source: { to: `clients/${foreign}` } }] }, do: {} } },
  ])
    assert.equal(contextFails(c, m, null).length, 1, JSON.stringify(m));
  const named = { expect: { names_focus: true } };
  const sent = { focus: { kind: "person", id: U(12), label: "Casey Example" }, rows: [] };
  assert.deepEqual(contextFails(named, { text: "Casey called about the hours." }, sent), []);
  assert.match(contextFails(named, { text: "Robin wrote." }, sent)[0], /does not name Casey Example/);
  assert.match(contextFails(named, { text: "Nobody." }, { focus: null, rows: [] })[0], /drew none there/);
});

const CASES = JSON.parse(readFileSync(path.join(ROOT, "tooling/evals/ask-cases.json"), "utf8"));
const SURFACES = [
  "inbox",
  "people",
  "leads",
  "reports",
  "settings",
  "conversations",
  "calendar",
  "campaigns",
  "pipeline",
];

test("the case set: unique ids, every page built over the GETs' answers and placed on its surface as the palette places it", () => {
  const ids = CASES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "every id once");
  assert.deepEqual(pageProblems(CASES), []);
  const paged = CASES.filter((c) => c.context);
  assert.ok(paged.length >= 27, `${paged.length} cases carry their page`);
  for (const c of CASES.filter((x) => !x.context))
    assert.equal(c.surface, "today", `${c.id} is asked as it always was`);
  assert.deepEqual(
    neededGets(CASES).sort(),
    ["calls", "contacts", "conversations", "leads", "playbooks"],
    "the eval reads only GETs that write nothing",
  );
  for (const c of paged) {
    const { context } = resolveContext(c.context, ANSWERS);
    accepted(context);
    assert.equal(c.surface, c.context.surface, c.id);
    const [page, ...rest] = context.route.split("/");
    assert.equal(surfaceFor(page, rest.length ? rest.join("/") : null), c.surface, `${c.id}: #/${context.route}`);
    for (const k of Object.keys(ROW_KINDS[c.surface] ?? {})) assert.ok(k in ANSWERS);
  }
});

test("the case set: every surface has an on-page case, an off-page read and a decline; the focus, the scope and the foreign row", () => {
  for (const s of SURFACES) {
    const on = CASES.filter((c) => c.surface === s);
    assert.ok(
      on.some((c) => c.expect.on_page || /_empty$/.test(c.id)),
      `${s}: a case the page answers, or an empty page said as one`,
    );
    assert.ok(
      on.some((c) => !c.expect.on_page && c.expect.tools_any?.length),
      `${s}: a case that needs a read off the page`,
    );
    assert.ok(
      on.some((c) => c.must_never && c.expect.no_write),
      `${s}: a decline, held on every repetition`,
    );
  }
  // Calendar, Campaigns and the Pipeline are empty on the nightly's workspace (D16): what they say is graded.
  for (const s of ["calendar", "campaigns", "pipeline"]) {
    const empty = CASES.find((c) => c.surface === s && /_empty$/.test(c.id));
    assert.ok(empty?.expect.includes_any?.length && empty.expect.excludes?.length, `${s} grades how empty is said`);
  }
  for (const s of ["inbox", "people"])
    assert.ok(
      CASES.some((c) => c.surface === s && typeof c.context?.focus === "string" && c.expect.names_focus),
      `${s}: a row named by its place`,
    );
  const scoped = CASES.find((c) => /<row:\d+>/.test(c.context?.route ?? ""));
  assert.ok(scoped, "a case asked on a row its route opens");
  assert.ok(resolveContext(scoped.context, ANSWERS).scope, "and it carries that row as its scope");
  const foreign = CASES.filter((c) => c.expect.never_cites?.length);
  assert.ok(foreign.length >= 1 && foreign.every((c) => c.must_never));
  for (const c of foreign) {
    const { context } = resolveContext(c.context, ANSWERS);
    for (const id of c.expect.never_cites) {
      assert.ok(
        context.rows.some((r) => r.id === id),
        `${c.id}: the page names the foreign row`,
      );
      assert.ok(!JSON.stringify(ANSWERS).includes(id), `${c.id}: a row the workspace does not hold`);
    }
  }
});

test("--list says every case, its page, the turns and their cost, with no credentials, and spends nothing", () => {
  const env = { ...process.env, REPS: "3" };
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "E2E_USER_EMAIL"])
    delete env[k];
  const run = spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  for (const c of CASES) assert.ok(run.stdout.includes(`${c.id} · ${c.surface ?? "today"}`), c.id);
  const n = CASES.length;
  assert.ok(
    run.stdout.includes(`${n} cases × 3 = ${n * 3} turns ≈ $${(n * 3 * 0.012).toFixed(2)}`),
    run.stdout.slice(-600),
  );
  assert.match(run.stdout, /inbox: 4 case\(s\) \(4 with the page\) × 3 = 12 turns/);
  assert.match(run.stdout, /Nothing was read or spent/);
  // The same words the run announces before its first turn.
  assert.ok(
    run.stdout.includes(
      announcement(
        CASES.map((c) => ({ ...c, surface: c.surface ?? "today" })),
        3,
        0.012,
      ),
    ),
  );
});
