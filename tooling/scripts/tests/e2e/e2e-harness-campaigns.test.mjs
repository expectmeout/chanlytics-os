/**
 * The Campaigns specs (e2e/campaigns) expect what the pages draw, and the harness's records say what a workspace holds.
 *
 * The three specs run against the nightly's workspace on production, which keeps its WhatsApp number, and every
 * assertion in them must hold as well on a workspace with none. The local harness serves the standalone mockup, which
 * draws none of the Campaigns pages (they are App Router pages), so no spec of them runs on a record here. What can be run
 * is the other half of each assertion: the expectation a spec works out from the rows (e2e/campaigns/offered.ts, which the
 * specs call) held against the real pages, run on the stub React over the surfaces the real bridge publishes from what the
 * harness answers for a record.
 *
 * - The harness answers GET templates as the route's own reader does (templates-read.mjs), for every record and `all` or not.
 * - The broadcast composer's picker lists what the spec expects, and says what it says where there is none or one cannot go
 *   out; the playbook composer says "no message" exactly where the spec expects none, for each kind of moment; the Library
 *   draws the rows the spec counts, the quiet line where there is no number, and its composer's first step opens where the
 *   spec says. Over the email-only record, the nightly's, the salon's and a workspace that holds a message in every state.
 * - A workspace with no WhatsApp number offers the messages it has written, and nothing asks it for its number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  kitPages,
  fresh as freshTree,
  again as drawAgain,
  all,
  find,
  byTestId,
  textOf,
  press,
} from "../_legacy-react.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { scenario, WORKSPACE } from "../../e2e-harness/scenarios.mjs";
import { answer } from "../../e2e-harness/server.mjs";
import { templatesRead } from "../../e2e-harness/templates-read.mjs";
import {
  broadcastSlots,
  libraryRows,
  messagesOf,
  messagesOffered,
  momentSlots,
} from "../../../../e2e/campaigns/offered.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

/**
 * The links the harness gives the composers: the scenario's booking link, and no review link (its GET settings answers
 * no `review_link`, as a workspace whose Google listing keeps none).
 */
const HARNESS_LINKS = { bookingLink: true, reviewLink: false };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const SRC = "../../../../apps/dashboard/src";
const NOW = Date.parse("2026-09-22T09:00:00Z");

/* ---------------------------------- the page's window ---------------------------------- */

// The page's window is the stub React's (installLegacyReact: window IS globalThis), with the harness's workspace in it, as
// the fixture publishes it, and the shell's doors the TSX pages reach through the bridge's verbs.
const toasts = [];
installLegacyReact({
  location: {
    pathname: `/w/${WORKSPACE.slug}/`,
    hash: "#/broadcasts",
    origin: "http://localhost",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: WORKSPACE.id, slug: WORKSPACE.slug, name: WORKSPACE.name, status: "active" }],
  __ACTIVE_WORKSPACE: WORKSPACE.id,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis.window, kitPages);
Object.assign(globalThis, {
  useHotkey: () => {},
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  // The role store: who is acting (an owner), and the policies a chip reads, each at its default.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner", get: (key, def) => def, set() {} },
  __roleGate: contracts.roleGate,
});
const quiet = console.error;
console.error = () => {};
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { cmOfferedMessages } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);
const { settingsOverride } = await import(`${SRC}/legacy-bridge/surfaces/settings.ts`);
// The Library's numbers are the channels read's (#1595, R6: surfaces/channels/surface.ts), not the settings read's.
const { channelsOverride } = await import(`${SRC}/surfaces/channels/surface.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { Segmented } = await import(`${SRC}/surfaces/kit/segmented/segmented.tsx`);
const { standingSaid } = await import(`${SRC}/surfaces/kit/head/standing.ts`);
console.error = quiet;

/** One of the page's choices, the kit's Picker, by its test id; and its options in their order. */
const pickerOf = (t, id) => find(t, (n) => n.type === Picker && n.props["data-testid"] === id);
const optionsOf = (p) => p.props.groups.flatMap((g) => g.options);
/** A part of the page, or of its head where the page says it to the frame (the page's one act, New, is the frame's). */
const headed = (tree, id) =>
  byTestId(tree, id) ??
  byTestId({ props: { children: [standingSaid()?.sentence ?? null, standingSaid()?.act ?? null] } }, id);

/* ---------------------------------- what the harness answers ---------------------------------- */

/** The harness's wire: the browser's fetch, answered by the harness server's own function from a record. */
const wire = (record) => {
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url), "http://localhost");
    const got = answer((init?.method ?? "GET").toUpperCase(), u.pathname, u.searchParams, record);
    const status = got ? got.status : 404;
    const body = got ? got.body : { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } };
    return { ok: status < 300, status, headers: { get: () => null }, json: async () => body };
  };
};
/** A read of the harness for a record, as the spec makes it (the workspace named, as every read names it). */
const read = (record, route, query = {}) =>
  answer("GET", route, new URLSearchParams({ workspace: WORKSPACE.slug, ...query }), record).body.data;

/* ---------------------------------- a workspace that holds a message in every state ---------------------------------- */

const row = (o) => ({
  language: "en_US",
  category: null,
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  components: [{ type: "BODY", text: o.body_preview }],
  ...o,
});
const valuesOf = (text) => text.slots.map((s, i) => ({ position: i + 1, label: s.label, example: s.example }));
/** A starter's versions on the channels named, as the library files them: WhatsApp's by Meta's status, the rest approved. */
const starterVersions = (key, channels, over = {}) => {
  const s = contracts.starterByKey(key);
  const text = contracts.starterText(s, "en_US");
  const email = contracts.starterEmailText(s, "en_US");
  const sms = contracts.starterSmsText(s, "en_US");
  const common = { name: s.name, category: s.category, variables: valuesOf(text) };
  return channels.map((channel) => {
    const words =
      channel === "email" ? email : channel === "sms" ? { subject: null, body: sms.body } : { subject: null, ...text };
    return row({
      ...common,
      id: `mix-${key}-${channel}`,
      channel,
      meta_status: channel === "whatsapp" ? (over.whatsapp ?? "approved") : "approved",
      hidden_at: channel === "whatsapp" ? (over.hidden ?? null) : null,
      body_preview: words.body,
      components:
        channel === "whatsapp" ? [{ type: "BODY", text: words.body }] : contracts.versionComponents(channel, words),
    });
  });
};
/** One message in every state a workspace holds one: what a picker offers, leaves out, or says why it leaves out. */
const MIXED = [
  // The visit reminder, on every channel: a visit's message, so a broadcast cannot fill it.
  ...starterVersions("visit_reminder", ["whatsapp", "email", "sms"]),
  // Its WhatsApp version still in review, with an email beside it: offered by the email.
  ...starterVersions("after_visit_check", ["whatsapp", "email"], { whatsapp: "pending" }),
  // The workspace hid its WhatsApp version: the message is hidden whole, the email beside it with it.
  ...starterVersions("this_months_offer", ["whatsapp", "email"], { hidden: "2026-09-01T00:00:00Z" }),
  // The proposal's follow-up, written as an email and a text: a deal's message, with no WhatsApp row.
  ...starterVersions("proposal_follow_up", ["email", "sms"]),
  // A message written elsewhere whose heading is a picture: approved, and no send can carry it whole.
  row({
    id: "mix-picture",
    channel: "whatsapp",
    name: "picture_offer",
    meta_status: "approved",
    category: "marketing",
    variables: [],
    body_preview: "A picture of our spring window.",
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "A picture of our spring window." },
    ],
  }),
  // A message the workspace wrote and then hid: not offered, and the Library keeps it in its fold.
  row({
    id: "mix-old",
    channel: "whatsapp",
    name: "old_offer",
    meta_status: "approved",
    hidden_at: "2026-09-01T00:00:00Z",
    category: "marketing",
    variables: [],
    body_preview: "An offer from last year.",
  }),
  // An offer written as an email alone, in two languages.
  row({
    id: "mix-hours-en",
    channel: "email",
    meta_status: "approved",
    name: "hours_note",
    category: "marketing",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    body_preview: "Hi {{1}}, we are open late.",
    components: contracts.versionComponents("email", { subject: "Late hours", body: "Hi {{1}}, we are open late." }),
  }),
  row({
    id: "mix-hours-es",
    channel: "email",
    meta_status: "approved",
    name: "hours_note",
    language: "es",
    category: "marketing",
    variables: [{ position: 1, label: "Nombre", example: "Dani" }],
    body_preview: "Hola {{1}}, abrimos tarde.",
    components: contracts.versionComponents("email", { subject: "Horario", body: "Hola {{1}}, abrimos tarde." }),
  }),
];

/** The workspaces the specs are held to, each with what the harness answers for it: its rows, and whether it has a number. */
const WORKSPACES = [
  ["the email-only record", scenario("email-only", NOW)],
  ["the nightly's record, with no message at all", scenario("nightly", NOW)],
  ["the salon's record, whose one message has a WhatsApp version", scenario("salon", NOW)],
  ["a workspace with a number that holds a message in every state", { ...scenario("salon", NOW), templates: MIXED }],
];
/** What the workspace can send on: the email-only record's own, else a number that can send and a mailbox. */
const readyOf = (record) =>
  record.ready ??
  contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: true, domain: true },
  });
const hasNumber = (record) => (record.known.channels ?? []).some((c) => c.kind === "whatsapp");

/* ---------------------------------- GET templates is the route's own ---------------------------------- */

test("the harness answers GET templates as the route's own reader does, for the composers and for Settings, over the records' rows", async () => {
  const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
  const { templates: reader } = await import(at("apps/dashboard/src/server/readers/templates.ts"));
  const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const [name, record] of WORKSPACES) {
    const tables = {
      templates: record.templates.map((t) => ({ ...t, tenant_id: TENANT })),
      playbooks: [],
      broadcasts: [],
      broadcast_recipients: [],
      messages: [],
    };
    for (const all of [false, true]) {
      const ctx = { supabase: fakeDb(tables, {}), userId: "u1", email: "ada@example.com", params: {} };
      const real = await kernel.load(kernel.readerContext(ctx, { tenantId: TENANT, role: "viewer" }), reader, { all });
      assert.deepEqual(
        JSON.parse(JSON.stringify(real.data)),
        JSON.parse(JSON.stringify(templatesRead(record.templates, { all }))),
        `${name} (all: ${all}): the route's own answer`,
      );
    }
  }
});

/* ---------------------------------- the broadcast composer ---------------------------------- */

const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, conversational: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, conversational: 1 } },
  ],
  templates: [],
  rows: [],
  more: false,
  heldReasons: contracts.HELD_REASONS,
  chunk: contracts.BROADCAST_CHUNK,
  number: null,
  optIn: null,
  getYes: contracts.GET_YES_ROUTE,
  listsRead: true,
  scheduleMaxDays: 30,
  businessName: "Northside Studio",
  bookingLink: true,
  ...over,
});
/** The composer, opened the way the home hosts it: the surface as it publishes the templates read, the page's own offer. */
const broadcastComposer = (record) => {
  const number = hasNumber(record)
    ? {
        present: true,
        display: "+1 305-555-0100",
        health: contracts.numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
      }
    : { present: false, display: null, health: contracts.numberHealth({ quality: null, event: null, limit: null }) };
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: cmOfferedMessages(read(record, "/api/v1/templates")),
      ready: readyOf(record),
      number,
    }),
  );
  freshTree();
  const props = { initialSegment: "no-such-list", initialRun: null };
  BroadcastsPage(props);
  return drawAgain(() => BroadcastsPage(props));
};

test("the broadcast composer's picker lists what the spec expects of the rows, and says what it says where there is none or one cannot go out", () => {
  for (const [name, record] of WORKSPACES) {
    const templates = read(record, "/api/v1/templates");
    const { groups, why } = messagesOffered(templates, broadcastSlots(HARNESS_LINKS));
    const tree = broadcastComposer(record);
    if (groups.length === 0) {
      assert.ok(byTestId(tree, "bc-no-template"), `${name}: the honest line`);
      assert.equal(pickerOf(tree, "bc-template"), null, `${name}: no picker`);
      assert.equal(!!byTestId(tree, "bc-blocked"), !!why, `${name}: the reason, as a line of its own`);
      if (why) assert.equal(textOf(byTestId(tree, "bc-blocked")), why, name);
    } else {
      assert.equal(byTestId(tree, "bc-no-template"), null, `${name}: nothing to say there is none`);
      const picker = pickerOf(tree, "bc-template");
      // One option per message, whatever languages it has, in the order the spec expects and with the words it expects.
      assert.deepEqual(
        optionsOf(picker).map((o) => o.value),
        groups.map((g) => g.name),
        `${name}: one option a message, in the library's order`,
      );
      assert.deepEqual(
        optionsOf(picker).map((o) => o.label),
        groups.map((g) => g.title),
        `${name}: each by its title`,
      );
      assert.equal(picker.props.note ?? null, why, `${name}: why the rest is not there, under the list`);
      assert.equal(byTestId(tree, "bc-blocked"), null, `${name}: never both`);
    }
    // The number a send goes out on is drawn where it goes by WhatsApp, and where the number holds a ticked WhatsApp off
    // (broadcasts-honest.test.mjs): the spec reads the tick, and the line's words where it stands with the tick off. No
    // number here holds WhatsApp off, so the line follows the tick exactly.
    const byWhatsApp = byTestId(tree, "bc-via-whatsapp").props["data-on"] === "true";
    assert.equal(!!byTestId(tree, "bc-number"), byWhatsApp, `${name}: the number line follows WhatsApp's tick`);
    assert.equal(
      !!byTestId(tree, "bc-number") && textOf(byTestId(tree, "bc-number")).includes("No WhatsApp number"),
      false,
      `${name}: and a send by WhatsApp has a number to say, where a workspace can send on it`,
    );
  }
});

test("a workspace with no WhatsApp number offers the messages it has written, opens on a channel it can send on, and is never asked for its number", () => {
  const record = scenario("email-only", NOW);
  assert.equal(hasNumber(record), false);
  const { groups } = messagesOffered(read(record, "/api/v1/templates"), broadcastSlots(HARNESS_LINKS));
  assert.deepEqual(
    groups.map((g) => g.name),
    ["after_visit_check", "spring_offer"],
    "the starter, in the library's order, then the offer",
  );
  const tree = broadcastComposer(record);
  assert.equal(byTestId(tree, "bc-no-template"), null);
  assert.deepEqual(
    optionsOf(pickerOf(tree, "bc-template")).map((o) => o.value),
    ["after_visit_check", "spring_offer"],
  );
  assert.equal(byTestId(tree, "bc-via-whatsapp").props["data-on"], "false", "it opens on Email");
  assert.equal(byTestId(tree, "bc-via-email").props["data-on"], "true");
  assert.equal(byTestId(tree, "bc-number"), null, "a send that does not go by WhatsApp never asks for its number");
});

/* ---------------------------------- the playbook composer ---------------------------------- */

/** The moments the composer is asked to open on, one of each kind the slot rule tells apart. */
const MOMENTS = ["quiet_30", "visit_tomorrow", "proposal_waiting"];
const playbooksSurface = (record) => ({
  rows: [],
  templates: cmOfferedMessages(read(record, "/api/v1/templates")),
  ready: readyOf(record),
  triggers: contracts.PLAYBOOK_TRIGGERS.filter((t) => MOMENTS.includes(t.id)).map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    offered: true,
    candidates: 0,
    held: 0,
  })),
  lists: [],
  timezone: "America/New_York",
  calendar: "ok",
  // How the business works (the surface's shape, 9 Oct 2026): a calendar, no deals, the word the derivation gives it.
  shape: { calendar: "feed", dealsOn: false, word: "appointment" },
  number: hasNumber(record)
    ? { present: true, health: contracts.numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }) }
    : { present: false, health: contracts.numberHealth({ quality: null, event: null, limit: null }) },
  businessName: "Northside Studio",
  bookingLink: true,
  fetchedAt: NOW,
});
const playbookComposer = (record, trigger) => {
  const data = playbooksSurface(record);
  setSurfaceValue("playbooks", data);
  freshTree();
  const props = { data, editing: null, initialTrigger: trigger, onDone() {}, onCancel() {} };
  PlaybookComposer(props);
  return drawAgain(() => PlaybookComposer(props));
};

test("the playbook composer says there is no message exactly where the spec expects none, for a moment of each kind, with or without a number", () => {
  for (const [name, record] of WORKSPACES) {
    const templates = read(record, "/api/v1/templates");
    for (const trigger of MOMENTS) {
      const tree = playbookComposer(record, trigger);
      // The spec reads the moment from the picker's face and works its slot rule out from it.
      const face = textOf(pickerOf(tree, "pb-moment").props.face).trim();
      const { groups } = messagesOffered(templates, momentSlots(face, HARNESS_LINKS));
      assert.ok(byTestId(tree, "pb-message"), `${name}, ${face}: the section is always drawn`);
      // With nothing to send, the moment's own message is offered to add (Turn on adds it), else the honest line says so.
      const starter = !!byTestId(tree, "pb-starter");
      assert.equal(
        !!byTestId(tree, "pb-no-template"),
        groups.length === 0 && !starter,
        `${name}, ${face}: the honest line where the spec expects ${groups.length} messages`,
      );
      if (groups.length === 0) assert.ok(starter || byTestId(tree, "pb-no-template"), `${name}, ${face}: never silent`);
    }
  }
});

test("the slot rule the spec reads a moment by is the page's: a visit's message is offered on a visit moment and not to a win-back, a proposal's on its follow-up alone", () => {
  const record = { ...scenario("salon", NOW), templates: MIXED };
  const templates = read(record, "/api/v1/templates");
  const offered = (trigger) => {
    const face = textOf(pickerOf(playbookComposer(record, trigger), "pb-moment").props.face).trim();
    return messagesOffered(templates, momentSlots(face, HARNESS_LINKS)).groups.map((g) => g.name);
  };
  assert.ok(offered("visit_tomorrow").includes("visit_reminder"));
  assert.ok(!offered("quiet_30").includes("visit_reminder"));
  assert.ok(offered("proposal_waiting").includes("proposal_follow_up"));
  assert.ok(!offered("quiet_30").includes("proposal_follow_up"));
  // And the broadcast's: a visit's message is none of it.
  assert.ok(!messagesOffered(templates, broadcastSlots(HARNESS_LINKS)).groups.some((g) => g.name === "visit_reminder"));
  // The messages the page leaves out are the ones the spec leaves out: hidden whole, and a version in review kept by its email.
  const names = messagesOffered(templates, broadcastSlots(HARNESS_LINKS)).groups.map((g) => g.name);
  assert.ok(
    !names.includes("this_months_offer"),
    "a hidden WhatsApp version hides the message with the email beside it",
  );
  assert.ok(names.includes("after_visit_check"), "a version in review is offered by the email beside it");
  assert.ok(names.includes("hours_note"), "an email in two languages is one option");
  const why = messagesOffered(templates, broadcastSlots(HARNESS_LINKS)).why;
  assert.match(why, /a picture for a heading/, "a message no send can carry whole is said, not offered");
});

/* ---------------------------------- the Library ---------------------------------- */

/**
 * The Library over what the real settings and channels surfaces publish of a record's answers: the bridge's own reads, not
 * stand-ins.
 */
const library = async (record) => {
  wire(record);
  console.error = () => {};
  try {
    await settingsOverride.apply();
    await channelsOverride.apply();
  } finally {
    console.error = quiet;
  }
  setSurfaceValue("reach_outs", []);
  setSurfaceValue("playbooks", undefined);
  freshTree();
  return drawAgain(() => TemplatesPage());
};

test("the Library draws the rows the spec counts, the quiet line only where there is no number, and its composer opens where the spec says", async () => {
  // The recorded settings answers say no review link (none predates it), so the Library offers no review ask.
  const starterNames = contracts
    .startersOffered({ dealsOn: contracts.dealsAreOn(null), reviewLink: false })
    .map((s) => s.name);
  for (const [name, record] of WORKSPACES) {
    const tree = await library(record);
    const messages = messagesOf(read(record, "/api/v1/templates", { all: "1" }));
    // The bridge made the page the same messages the route answers.
    assert.deepEqual(
      JSON.parse(JSON.stringify(surfaceValue("settings").messages)),
      JSON.parse(JSON.stringify(messages)),
      `${name}: the messages the page holds are the route's`,
    );
    const rows = libraryRows(messages, starterNames);
    const count = (id) => all(tree, (n) => n.props?.["data-testid"] === id).length;
    assert.equal(
      count("starter-row"),
      rows.starterRows,
      `${name}: a row to each starter, whatever the workspace holds`,
    );
    assert.equal(
      count("custom-row"),
      rows.customRows,
      `${name}: a row to each message it wrote, whatever channels it holds`,
    );
    // (The fold is one element in a browser: a link a press opens. In this tree a component and what it draws both carry
    // the test id, so it is said as there or not.)
    assert.equal(!!byTestId(tree, "templates-hidden"), rows.hidden, `${name}: the fold for what it hid`);
    assert.equal(textOf(tree).includes("hello_world"), false, `${name}: Meta's sample is never shown`);
    // The quiet line where the number is missing, and the list below it either way.
    assert.equal(
      !!byTestId(tree, "messages-no-number"),
      !hasNumber(record),
      `${name}: the line says where the number is missing`,
    );
    // The first starter opens in the pane on a bubble, whatever it holds and whether or not there is a number.
    const first = find(tree, (n) => n.props?.["data-testid"] === "starter-row");
    assert.ok(textOf(first).includes("Win-back"), `${name}: the set opens on its win-back`);
    press(find(first, (n) => n.props?.["data-testid"] === "template-open"));
    const open = drawAgain(() => TemplatesPage());
    const pane = byTestId(open, "template-pane");
    assert.ok(pane, `${name}: the message opens beside the list`);
    assert.ok(byTestId(pane, "message-preview"), `${name}: on the bubble the customer sees`);
    assert.equal(all(pane, (n) => n.type === Picker && n.props["data-testid"] === "template-lang").length, 1);
    // New asks where the message is sent: Email, Text, WhatsApp, opening on WhatsApp with a number and on Email without.
    press(headed(open, "template-new"));
    const writing = drawAgain(() => TemplatesPage());
    const step = find(byTestId(writing, "messages-composer"), (n) => n.type === Segmented);
    assert.deepEqual(
      step.props.options.map((o) => o.testid),
      ["tpl-where-email", "tpl-where-sms", "tpl-where-whatsapp"],
      `${name}: where it is sent, three ways`,
    );
    assert.equal(
      step.props.value,
      hasNumber(record) ? "whatsapp" : "email",
      `${name}: it opens where something can be written`,
    );
    assert.equal(!!byTestId(writing, "tpl-composer"), hasNumber(record), `${name}: WhatsApp's rows only with a number`);
    assert.equal(!!byTestId(writing, "tpl-own"), !hasNumber(record), `${name}: an email's form where there is none`);
    // Closed with nothing written, it asks nothing and the composer is gone.
    press(byTestId(writing, "tpl-close"));
    assert.equal(
      byTestId(
        drawAgain(() => TemplatesPage()),
        "messages-composer",
      ),
      null,
      `${name}: and the way out`,
    );
  }
});
