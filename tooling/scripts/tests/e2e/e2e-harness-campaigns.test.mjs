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
 * - New's one-off that reaches nobody (the spec's own draft, e2e/campaigns/nobody-once.ts) holds Send now back and says why,
 *   with the yes it needs as its door, as broadcasts.spec.ts expects; the Library draws the rows the spec counts, the quiet
 *   line where there is no number, and its composer's first step opens where the spec says. Over the email-only record, the
 *   nightly's, the salon's and a workspace that holds a message in every state. (The send screen whose picker the specs once
 *   read went with decision 0065's step 7, and the playbook composer with its Every time: the closed-loop audit of 17 Oct
 *   2026, G.)
 * - A workspace with no WhatsApp number offers New the messages it has written, opens a one-off on a channel it can send on,
 *   and nothing asks it for its number.
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
import { libraryRows, messagesOf } from "../../../../e2e/campaigns/offered.ts";
import { NOBODY_ONCE } from "../../../../e2e/campaigns/nobody-once.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

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
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
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
const { DraftView } = await import(`${SRC}/surfaces/campaigns/sequences/new/new-draft.tsx`);
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { cmOfferedMessages } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);
const { settingsOverride } = await import(`${SRC}/legacy-bridge/surfaces/settings.ts`);
const { channelsOverride } = await import(`${SRC}/surfaces/channels/surface.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { Segmented } = await import(`${SRC}/surfaces/kit/segmented/segmented.tsx`);
const { standingSaid } = await import(`${SRC}/surfaces/kit/head/standing.ts`);
console.error = quiet;

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

/* ---------------------------------- New's one-off ---------------------------------- */

const W = contracts.NEW_WORDS;
/** The channels New can send on, as its page reads them of the record (new-page.tsx: those the channels read says are ready). */
const readyChannelsOf = (record) => contracts.CONSENT_CHANNELS.filter((c) => readyOf(record)[c]?.ready);
/**
 * New's Library over what the harness answers for a record (new-page.tsx): the messages the templates read offers
 * (parts/channels.ts cmOfferedMessages, which the settings surface makes them by), and the rows their values are read from.
 */
const libraryOf = (record) => {
  const offered = cmOfferedMessages(read(record, "/api/v1/templates"));
  return { messages: offered.flatMap((t) => (t.message ? [t.message] : [])), rows: offered };
};
/**
 * New's pane over a draft, as its page draws it once its reads are in (new-page.tsx useNewReads): the record's channels and
 * Library, nobody in its lists, and the draft counted again against nothing new.
 */
const newPane = (record, draft) => {
  const ready = readyChannelsOf(record);
  const props = {
    draft,
    reads: {
      who: { moments: [], lists: [], everyone: 0, everyoneHeld: 0, sources: [], running: [] },
      library: libraryOf(record),
      ready,
      paused: readyOf(record).paused === true,
      today: contracts.zoneDayKey(NOW, "UTC"),
      timezone: "UTC",
      recount: { counts: { pools: {}, searches: [] }, running: [], ready },
    },
    busy: false,
    doing: null,
    redraftingFor: null,
    leaving: null,
    acts: { change() {}, redraft() {}, undo() {}, again() {}, discard() {}, make() {}, close() {} },
  };
  freshTree();
  drawAgain(() => globalThis.React.createElement(DraftView, props));
  return byTestId(
    drawAgain(() => globalThis.React.createElement(DraftView, props)),
    "sq-new",
  );
};
/** The host element a testid names (a kit Button is its own node and the host button it draws, both carrying the id). */
const hostOf = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);

test("New's one-off that reaches nobody holds Send now back and says why, with the yes it needs as its door, as the spec expects, over every record", () => {
  for (const [name, record] of WORKSPACES) {
    const pane = newPane(record, NOBODY_ONCE);
    // broadcasts.spec.ts: the sentence says Once, who it reaches says 0, and Send now is held.
    assert.equal(W.draft.kind.once, "Once", "the word the spec reads");
    assert.ok(
      textOf(byTestId(pane, "sq-nw-sentence")).includes(W.draft.kind.once),
      `${name}: the sentence is the draft's`,
    );
    assert.ok(textOf(byTestId(pane, "sq-nw-reach")).includes("0"), `${name}: nobody can hear it`);
    assert.equal(hostOf(pane, "sq-nw-send-now").props.disabled, true, `${name}: Send now is held`);
    // The card says why and offers the ways: the yes nobody gave (People's Get their yes), and someone else.
    const nobody = byTestId(pane, "sq-nw-nobody");
    assert.ok(nobody, `${name}: the card`);
    assert.ok(hostOf(nobody, "sq-nw-nobody-yes"), `${name}: their yes`);
    assert.ok(hostOf(nobody, "sq-nw-nobody-who"), `${name}: someone else`);
    // Nobody said the yes an offer needs, said as the list's own and the purpose's: never a number, never a channel.
    assert.ok(
      textOf(nobody).includes(contracts.noYesWords(`“${contracts.EVERYONE_LABEL}”`, "marketing")),
      `${name}: the yes to offers`,
    );
    for (const id of ["sq-nw-nobody-connect", "sq-nw-nobody-how"])
      assert.equal(hostOf(nobody, id), null, `${name}: ${id}`);
  }
  // News is heard on the yes to messages: the card names that yes, never the yes to offers it does not need.
  const news = M.setMessage(NOBODY_ONCE, 0, { ...NOBODY_ONCE.steps[0].message, offer: false });
  const said = textOf(byTestId(newPane(scenario("salon", NOW), news), "sq-nw-nobody"));
  assert.ok(said.includes(contracts.noYesWords(`“${contracts.EVERYONE_LABEL}”`, "conversational")), said);
  assert.equal(/yes to offers/.test(said), false, said);
});

test("a workspace with no WhatsApp number offers New the messages it has written, opens a one-off on a channel it can send on, and is never asked for its number", () => {
  const record = scenario("email-only", NOW);
  assert.equal(hasNumber(record), false);
  assert.deepEqual(readyChannelsOf(record), ["email"], "it sends by email alone");
  const library = libraryOf(record);
  // Its messages, each as New holds it: the starter, in the library's order, then the offer.
  const held = library.messages.map((m) => M.heldMessageOf(m, library.rows)).filter(Boolean);
  const nameOf = (m) => library.rows.find((r) => r.id === m.template_id).name;
  assert.deepEqual(held.map(nameOf), ["after_visit_check", "spring_offer"]);
  // A one-off by hand, its first message the starter: ticked by the channels it holds that the workspace can send on.
  const first = held[0];
  assert.deepEqual(first.channels, ["email", "sms"], "an email and a text, and no WhatsApp version");
  const draft = M.setMessage(M.draftByHand("once", "people", WORKSPACE.name), 0, first, readyChannelsOf(record));
  assert.deepEqual(draft.channels, ["email"], "it opens on Email: there is no text line to send on");
  const pane = newPane(record, draft);
  assert.equal(
    textOf(hostOf(byTestId(pane, "sq-nw-sentence"), "sq-nw-channels-pick")),
    M.channelsSaidOf(["email"], ""),
  );
  // The message sheet offers both, each a press.
  assert.deepEqual(
    held.map((m) => !!hostOf(byTestId(pane, "sq-nw-message"), `sq-nw-message-${m.template_id}`)),
    [true, true],
    "both, in the sheet that picks the message",
  );
  // How it goes, each channel's row saying why it can't be ticked: no WhatsApp version, no text line. No number is asked for.
  const channels = byTestId(pane, "sq-nw-channels");
  const rowOf = (name) => find(channels, (n) => n.props?.className === "sq-nw-switchrow" && textOf(n).startsWith(name));
  for (const [name, why] of [
    [W.channels.whatsapp, W.channels.noVersion],
    [W.channels.sms, W.channels.notReady],
  ]) {
    assert.equal(rowOf(name).props["data-off"], "true", `${name} cannot be ticked`);
    assert.ok(textOf(rowOf(name)).includes(why), `${name}: and says why`);
  }
  assert.equal(rowOf(W.channels.email).props["data-off"], undefined, "Email can");
  assert.equal(
    /WhatsApp number|phone number/i.test(textOf(pane)),
    false,
    "a send that does not go by WhatsApp never asks for its number",
  );

  // Its offer to its list, by email, where those who said yes can't be reached: said as the send's own refusal says it, by
  // what an email asks of a person -- never a number, and never their yes again (the send screen's words, decision 0065
  // step 7). Counted as Ask's draft counts it: nobody, two who said yes.
  const [list] = record.lists;
  const offer = M.setWho(M.setMessage(draft, 0, held[1], readyChannelsOf(record)), {
    kind: "list",
    token: `list:${list.id}`,
    label: list.name,
  });
  const card = byTestId(
    newPane(record, { ...offer, reach: { can: 0, of: 3, left: null, nobody: "no_reach", said_yes: 2 } }),
    "sq-nw-nobody",
  );
  const said = contracts.emptyAudienceRefusal("marketing", list.name, [], { channels: ["email"], about: "ours" });
  assert.ok(textOf(card).includes(said), textOf(card));
  assert.equal(/number/.test(said), false, "an email is never said to need a number");
  assert.equal(hostOf(card, "sq-nw-nobody-yes"), null, "nor their yes, which they gave");
});

/* ---------------------------------- the Library ---------------------------------- */

/**
 * The Library over what the real settings and channels surfaces publish of a record's answers: the bridge's own reads, not a
 * stand-in. The numbers are the channels read's (#1595 moved the page off the settings read's copy of them).
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
  const starterNames = contracts.startersOffered({ reviewLink: false }).map((s) => s.name);
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
