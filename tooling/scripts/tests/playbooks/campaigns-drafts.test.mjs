/**
 * Campaigns, the loading standard's D and G: a playbook's act is said when the server takes it, and a composer's
 * words are kept in the tab, come back when it opens again, and are thrown away only after one question.
 *
 * - The send screen's Cancel and a trip to another page lost a name, a typed value and a picked time; a template
 *   half-written, or a translation the assistant had just been paid to write, went with a Cancel. Each is kept per tab
 *   (tab-memory.ts) under one rule (kit/record/work.tsx useUnsavedWork), the registry holds the tab from closing over it,
 *   and Close asks once.
 * - A one-off is New's since decision 0065's step 7 took the send screen away (sequences/new/new-page.tsx): its draft is
 *   kept under New's address once it says who it is for, comes back when New opens there again, and Close asks Keep as a
 *   draft or Discard; a send the server took keeps nothing, and Send it again opens New on what the run sent. The playbook
 *   composer's went with its Every time (the closed-loop audit of 17 Oct 2026, G): a sequence's draft is New's own too.
 * - What New asks and counts holds to the draft as it now stands: Send now's question goes with any change, so nothing is
 *   sent from a question about a draft that has moved; a draft the tab kept is counted again as it comes back; and where
 *   the channels could not be read, a message picked goes by WhatsApp, as every send did before a channel was read.
 * Run against the pages and the composers on a stub React, with the tab's memory installed as the app installs it, and
 * New's two doors (POST sequences/draft and sequences/new) answered as their routes answer.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  unmount,
  find,
  byTestId,
  textOf,
  press,
  settle,
} from "../_legacy-react.mjs";

const { stateOf, NEW_WORDS: W } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = Date.now();

/* ---------------------------------- the window ---------------------------------- */

const went = [];
const replaced = [];
const toasts = [];
installLegacyReact({
  location: {
    pathname: "/w/studio",
    hash: "#/broadcasts",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The tab's memory, as the app installs it (surface-cache.ts): the one store every composer keeps its words in.
const { installTabMemory, clearTabMemory } = await import(`${SRC}/legacy-bridge/tab-memory.ts`);
installTabMemory(globalThis);
const TM = globalThis.__tabMemory;
// What the shell still owns and the pages draw by name (Confirm, StatePill, PolicyChip, the sheet, the unsaved-work rule):
// the frame's JSX, loaded as the app loads it. The pages are TSX since decision 0015, and their verbs are imported.
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
Object.assign(globalThis, {
  useHotkey: () => {},
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
// React's context, which the react-server condition this suite runs under has none of: Campaigns' toast is held in one at the
// route's mount (home/route-toast.ts), and New, drawn here on its own, reads its default -- none -- and says its own toast.
const react = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), `${SRC}/legacy-bridge/_.js`))(
  "react",
);
react.createContext ??= (value) => ({ value, Provider: "Provider" });
react.useContext ??= (context) => context.value;
const { NewSequence } = await import(`${SRC}/surfaces/campaigns/sequences/new/new-page.tsx`);
const { reachOuts } = await import(`${SRC}/surfaces/campaigns/reach-out/surface.ts`);
const { cmOfferedMessages } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);
// The Library's pane is a chunk of its own (campaigns-code.tsx): fetched here as a reach for a message's door fetches it,
// so every draw below finds it in, as a press after that reach does.
const { warmCampaignsCode } = await import(`${SRC}/surfaces/campaigns/home/campaigns-code.tsx`);
warmCampaignsCode("campaigns/messages/any");
await import(`${SRC}/surfaces/campaigns/parts/message-in-place.tsx`);
await new Promise((r) => setTimeout(r, 0));
const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);
const { Segmented } = await import(`${SRC}/surfaces/kit/segmented/segmented.tsx`);
const { Switch } = await import(`${SRC}/surfaces/kit/switch/switch.tsx`);
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);
const { templates } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

/* ---------------------------------- walking a tree ---------------------------------- */

/** Words typed into one of the kit's Fields (surfaces/kit/field/), which says them as its own `onValueChange`. */
const type = (node, value) => node.props.onValueChange(value);
/** A fresh mount, as React mounts a page a person came back to: every cell forgotten, every listener gone. */
const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  toasts.length = 0;
};
/** The tree drawn again over the same cells, as React draws it after a state change. */
const redraw = (draw) => again(draw);
/** The host element a testid names (a kit Button is its own node and the host button it draws, both carrying the id). */
const hostOf = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
/** What the tab keeps, whole: every draft in the slot. */
const drafts = () => JSON.parse(globalThis.sessionStorage.getItem("chanlytics.drafts.v1") || "{}");
/** The browser's own question before the tab closes: whether the registry's listener held it. */
const tabClosing = () => {
  const ev = {
    type: "beforeunload",
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  globalThis.dispatchEvent(ev);
  return ev.prevented;
};

/* ---------------------------------- the surfaces ---------------------------------- */

const D = 24 * 3_600_000;
const iso = (ms) => new Date(NOW + ms).toISOString();
/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterRow = (key, id) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, "en_US");
  return {
    id,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    source: "starter",
    title: null,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  };
};
/** A message written elsewhere, with one slot to type into. */
const ownTemplate = {
  id: "tpl-own",
  channel: "whatsapp",
  name: "autumn_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  purpose: "marketing",
  source: "meta",
  hidden_at: null,
  title: "Autumn offer",
  body_preview: "Hi {{1}}, {{2}} this autumn.",
  variables: [
    { position: 1, label: "Name", example: "Dani" },
    { position: 2, label: "Value 2", example: "20% off" },
  ],
};
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: iso(-30 * D),
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00 AM",
  next: "tomorrow 10:00 AM",
  // On, before its last day, its moment one that runs here (contracts campaignRunsOn): Run now is offered.
  runs: true,
  candidates: 4,
  held: 0,
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
/** What a moment's count reads as the route answers it: who is on it, and who of them said yes. */
const poolOf = (pool, candidates = pool) => ({
  candidates,
  held: 0,
  pool,
  noYes: 0,
  stopped: 0,
  noNumber: 0,
  saidYes: pool,
});
/** A list Campaigns counts, as its read names it (playbooks/surface.ts): People's by `seg:`, the workspace's own by `list:`. */
const listOf = (id, name, candidates, builtin = false) => ({
  id,
  name,
  smart: builtin,
  builtin,
  candidates,
  held: 0,
  named: null,
});
const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  pools: {
    quiet_30: poolOf(4),
    new_week: poolOf(0),
    visit_tomorrow: poolOf(3),
    visited: poolOf(2),
    everyone_monthly: poolOf(5),
    "seg:vip": poolOf(3, 3),
    "list:s1": poolOf(2, 2),
  },
  lists: [listOf("seg:vip", "VIP clients", 3, true), listOf("list:s1", "Regulars", 2)],
  // The messages a one-off may send, made of the settings read as the surface makes them (parts/channels.ts).
  templates: cmOfferedMessages({ templates: [starterRow("winback_offer", "tpl-1"), ownTemplate] }),
  messages: null,
  // What the workspace can send on now (server/campaigns/channels-ready.ts): its WhatsApp number, and no text line or mailbox.
  ready: contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  triggers: contracts.PLAYBOOK_TRIGGERS.map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    // 2 Oct 2026: every moment offered, so a draft may name any (surface.ts says which a new playbook may start from).
    offered: true,
    candidates: 4,
    held: 0,
  })),
  timezone: ZONE,
  calendar: "none",
  // How the business works (the surface's shape, 9 Oct 2026): the words this file pins are the word "visit"'s.
  shape: { calendar: "none", hasDeals: false, word: "visit" },
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: true,
  fetchedAt: NOW,
  ...over,
});
/**
 * One of New's one-offs as Ask answers it (POST sequences/draft, contracts NewDraftDto): to the list its door named, now, by
 * WhatsApp, of the workspace's offer with a value still to type.
 */
const ASKED = {
  said: "Tell my VIPs about the autumn colour offer",
  business: "Northside Studio",
  kind: "once",
  audience: "people",
  name: "Autumn colour",
  who: { kind: "list", token: "seg:vip", label: "VIP clients" },
  run_hour: 10,
  at: null,
  channels: ["whatsapp"],
  mailbox: null,
  adds_new: false,
  steps: [
    {
      name: "Autumn colour",
      after_days: null,
      only_if: [],
      does: "message",
      message: {
        template_id: "tpl-own",
        title: "Autumn offer",
        body: "Hi {{1}}, {{2}} this autumn.",
        channels: ["whatsapp"],
        params: [{ kind: "first_name" }, { kind: "text", value: "" }],
        offer: true,
        written: null,
        labels: ["Name", "Value 2"],
      },
      email: null,
      hand: "",
    },
  ],
  policy_class: "campaign",
  mode: null,
  reach: { can: 3, of: 3, left: null, held: 0, by: { whatsapp: 3 } },
  checks: [],
  twin: null,
  cannot: null,
};
/**
 * New's two doors, answered as their routes answer (the envelope the typed client reads): Ask's draft, and what a make made
 * -- a one-off sent, or kept under Drafts. Every write is kept; any other address is a read that finds nothing.
 */
const posted = [];
globalThis.fetch = async (url, init) => {
  const at = new URL(String(url), "https://app.chanlytics.com").pathname;
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (init?.method === "POST") posted.push({ at, body });
  const data =
    at === "/api/v1/sequences/draft"
      ? ASKED
      : at === "/api/v1/sequences/new"
        ? body.start
          ? { made: "b-new", kind: "once", state: "on", scheduled_for: iso(10 * 60_000) }
          : { made: "s-kept", kind: "once", state: "draft" }
        : null;
  return data
    ? new Response(JSON.stringify({ ok: true, data }), { status: 200 })
    : new Response(JSON.stringify({ ok: false, error: { code: "not_found", message: "Not here." } }), { status: 404 });
};
// The searches whose leads are ready, which New reads as it opens: none here.
reachOuts.sources = async () => [];
// A one-off's Stop, from its toast: the send cancelled through Broadcasts' verb.
const cancelled = [];
broadcasts.cancel = async (id) => {
  cancelled.push(id);
  return { ok: true, data: null };
};

/** New on the address a door gave it (`campaigns/sequences/new:once:to:seg:vip`), and the key it keeps a draft under there. */
const DOOR = { who: "once", to: "seg:vip" };
const HERE = "|once|seg:vip|";
let opened = DOOR;
const page = () => globalThis.React.createElement(NewSequence, opened);
/**
 * What is still to land (the searches read, Ask's answer, a make), landed -- once `done` says so, or after a second at most
 * (the first walk of a verb loads its spec) -- and the page drawn again over it.
 */
const landed = async (done = () => true) => {
  for (let i = 0; i < 200; i += 1) {
    await settle();
    await new Promise((r) => setTimeout(r, 5));
    if (i >= 2 && done()) break;
  }
  return redraw(page);
};
/** New opened by a door, as a mount of its own: drawn as the mount settles, its reads in. */
const openNew = async (props = DOOR) => {
  unmount();
  fresh();
  opened = props;
  redraw(page);
  return landed();
};
/** The line New is asked from, and the value a step's message leaves to type: the kit's Fields, by their test ids. */
const lineBox = (tree) => find(tree, (n) => n.type === Field && n.props["data-testid"] === "sq-nw-line");
const valueBox = (tree) => find(tree, (n) => n.type === Field && n.props["data-testid"] === "sq-nw-value-1-1");
/** New's one-off as Ask drafts it from a line: the line typed, Draft pressed, and its answer in. */
const askDrafts = async (props = DOOR) => {
  const tree = await openNew(props);
  type(lineBox(tree), ASKED.said);
  press(hostOf(redraw(page), "sq-nw-draft"));
  return landed(() => !!byTestId(redraw(page), "sq-nw-sentence"));
};
const messagesPage = () => {
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Northside Studio" } } },
    templatesAll: [],
    messages: [],
  });
  // A WhatsApp number, as the channels read holds it (surfaces/channels/surface.ts).
  setSurfaceValue("channels", { rows: [{ kind: "whatsapp" }] });
  return TemplatesPage();
};

beforeEach(() => {
  unmount();
  fresh();
  clearTabMemory();
  globalThis.__recordFolds.reset();
  posted.length = 0;
  cancelled.length = 0;
  // What New opens on (new-page.tsx): Campaigns' read, and the sequences that run -- none.
  setSurfaceValue("playbooks", playbooksSurface());
  setSurfaceValue("sequences", { sequences: [], timezone: ZONE, word: "visit" });
});

/* ---------------------------------- D: an act is said when the server takes it ---------------------------------- */

/* ---------------------------------- G: New's one-off ---------------------------------- */

test("New keeps a one-off once it says who it is for, opens again on it, and Close asks once: a second Close leaves it in the tab, Discard throws it away", async () => {
  // A door to a list New can't send to now says so, where the send screen opened on Everyone in silence.
  let tree = await openNew({ who: "once", to: "no-such-list" });
  assert.equal(textOf(byTestId(tree, "sq-nw-door-gone")), contracts.UNKNOWN_AUDIENCE_WORDS);
  // A line typed is not work: nothing is kept, and the tab closes without asking.
  tree = await openNew();
  type(lineBox(tree), ASKED.said);
  redraw(page);
  assert.deepEqual(drafts(), {}, "a line alone is not work");
  assert.equal(tabClosing(), false);

  // Ask's draft says who it is for (the door's list, which Ask was told to keep): it is work, kept as it changes.
  tree = await askDrafts();
  assert.deepEqual(posted.at(-1).body.who, ASKED.who, "Ask is told the list the door named");
  assert.ok(byTestId(tree, "sq-nw-sentence"), "New on the draft");
  type(valueBox(tree), "20% off colour");
  tree = redraw(page);
  const kept = TM.draft("new", HERE);
  assert.deepEqual(kept.draft.who, ASKED.who, "the draft, under New's address");
  assert.deepEqual(kept.draft.steps[0].message.params[1], { kind: "text", value: "20% off colour" }, "the value typed");
  assert.equal(tabClosing(), true, "the tab asks before closing over it");

  // Close with a draft asks, in the pane's foot where its act was: keep it under Drafts, or discard it.
  press(hostOf(tree, "cm-pane-close"));
  tree = redraw(page);
  assert.ok(hostOf(tree, "sq-nw-leave-discard") && hostOf(tree, "sq-nw-leave-keep"), "asked");
  assert.equal(hostOf(tree, "sq-nw-send-now"), null, "the question stands alone in the foot");
  assert.deepEqual(went, [], "not closed");
  // A second Close while it asks goes, and the draft stays in the tab.
  press(hostOf(tree, "cm-pane-close"));
  assert.deepEqual(went, [contracts.SEQUENCES_ROUTE], "onto Sequences");
  assert.ok(TM.draft("new", HERE), "kept");

  // Come back to: New on the same address opens on the draft, with the value typed.
  tree = await openNew();
  assert.ok(byTestId(tree, "sq-nw-sentence"), "opens on the draft half-written");
  assert.equal(valueBox(tree).props.value, "20% off colour");
  // Discard: closed, cleared, nothing kept -- New opens again on its line.
  press(hostOf(tree, "cm-pane-close"));
  tree = redraw(page);
  press(hostOf(tree, "sq-nw-leave-discard"));
  redraw(page);
  assert.equal(TM.draft("new", HERE), null);
  assert.equal(went.at(-1), contracts.SEQUENCES_ROUTE, "onto Sequences");
  // New goes with the page it left (the route unmounts it), and the tab holds nothing.
  unmount();
  assert.equal(tabClosing(), false, "and the tab holds nothing");
  tree = await openNew();
  assert.equal(byTestId(tree, "sq-nw-sentence"), null, "REGRESSION: the last draft stayed in the page after a Discard");
  assert.ok(lineBox(tree), "New opens on its line");
  assert.equal(
    posted.some((p) => p.at === "/api/v1/sequences/new"),
    false,
    "nothing was made",
  );
});

test("a send the server took keeps nothing: New closes, its toast says when it goes with its Stop, and the next New is empty", async () => {
  let tree = await askDrafts();
  type(valueBox(tree), "20% off colour");
  tree = redraw(page);
  assert.ok(TM.draft("new", HERE));
  // Send now asks first; its yes sends it through New's one door, as it stands.
  press(hostOf(tree, "sq-nw-send-now"));
  tree = redraw(page);
  press(hostOf(tree, "sq-nw-send-yes"));
  await landed(() => went.length > 0);
  const made = posted.filter((p) => p.at === "/api/v1/sequences/new");
  assert.equal(made.length, 1, "made once");
  assert.equal(made[0].body.start, true, "sent, not kept");
  assert.deepEqual(made[0].body.steps[0].message.params[1], { kind: "text", value: "20% off colour" });
  assert.equal(TM.draft("new", HERE), null, "and nothing is kept");
  assert.deepEqual(went, [contracts.SEQUENCES_ROUTE], "New closes onto Sequences");
  // Its toast says it goes, with its Stop, which cancels the send it made.
  const said = toasts.at(-1);
  assert.equal(said.tone, "ok");
  assert.ok(textOf(said.msg).startsWith(contracts.NEW_WORDS.sent.goes(ASKED.name, "")), "it goes");
  assert.ok(textOf(said.msg).endsWith(" · " + contracts.NEW_WORDS.draft.people(3)), "to the three who can hear it");
  assert.equal(said.action.label, contracts.NEW_WORDS.sent.stop);
  said.action.onClick();
  assert.deepEqual(cancelled, ["b-new"], "Stop cancels the send it made");
  tree = await openNew();
  assert.equal(byTestId(tree, "sq-nw-sentence"), null, "the next one starts empty");
  assert.equal(lineBox(tree).props.value, "", "on an empty line");
});

test("Send it again opens New's one-off filled with what the run sent, and lets the run's send go once New drops it", async () => {
  // What a sent run's Send it again keeps for the tab (broadcasts/page/runs.tsx bcAgainOf): its list, its message, and
  // what filled each value -- each person's own name, and the words typed.
  TM.keepDraft("broadcast", {
    aud: "saved:s1",
    tplId: "tpl-own",
    sources: { "tpl-own": ["first_name", "text"] },
    params: { "tpl-own": ["", "20% off colour"] },
    name: "",
    whenAt: null,
  });
  let tree = await openNew({ who: "once" });
  const sentence = byTestId(tree, "sq-nw-sentence");
  assert.ok(sentence, "New on a one-off, not its line");
  assert.equal(textOf(hostOf(sentence, "sq-nw-who-pick")), "Regulars", "to the list it went to");
  assert.equal(textOf(hostOf(tree, "sq-nw-pick-1")), "Autumn offer", "with the message it sent");
  assert.equal(valueBox(tree).props.value, "20% off colour", "and the words typed into it");
  assert.equal(
    find(tree, (n) => n.type === Field && n.props["data-testid"] === "sq-nw-name").props.value,
    "Autumn offer",
  );
  assert.equal(TM.draft("new", "|once||"), null, "nothing of New's own is kept until it is changed");
  // Discarded, the run's send goes: New opens on its line the next time.
  press(hostOf(tree, "sq-nw-discard"));
  redraw(page);
  assert.equal(TM.draft("broadcast"), null, "the run's send let go");
  tree = await openNew({ who: "once" });
  assert.equal(byTestId(tree, "sq-nw-sentence"), null);
  assert.ok(lineBox(tree));
});

test("Send now's question goes with any change -- a time picked or a channel unticked through the sheets, the audience drafted again -- and nothing is sent from it", async () => {
  let tree = await askDrafts();
  type(valueBox(tree), "20% off colour");
  tree = redraw(page);
  const asks = () => !!byTestId(tree, "sq-nw-send-confirm");
  const sendNow = () => {
    press(hostOf(tree, "sq-nw-send-now"));
    tree = redraw(page);
    assert.ok(asks(), "Send now asks first");
  };
  // A sheet opened to change something puts the question away.
  sendNow();
  press(hostOf(byTestId(tree, "sq-nw-sentence"), "sq-nw-when-pick"));
  tree = redraw(page);
  assert.equal(asks(), false, "When opened, it is put away");
  // Asked again with When open, a day picked there puts it away: it never asks about now over a time picked since.
  sendNow();
  press(hostOf(tree, "sq-nw-when-day"));
  tree = redraw(page);
  assert.equal(asks(), false, "a time picked puts it away");
  assert.equal(hostOf(tree, "sq-nw-send-yes"), null, "its yes with it");
  assert.ok(hostOf(tree, "sq-nw-schedule"), "Schedule, in Send now's place");
  // Back to now, then How: WhatsApp unticked while it asks puts it away, and with no way left nothing can go.
  press(hostOf(tree, "sq-nw-when-now"));
  tree = redraw(page);
  press(hostOf(byTestId(tree, "sq-nw-sentence"), "sq-nw-channels-pick"));
  tree = redraw(page);
  sendNow();
  const whatsapp = () =>
    find(byTestId(tree, "sq-nw-channels"), (n) => n.type === Switch && n.props.label === W.channels.whatsapp);
  whatsapp().props.onCheckedChange(false);
  tree = redraw(page);
  assert.equal(asks(), false, "a channel unticked puts it away");
  assert.equal(hostOf(tree, "sq-nw-send-now").props.disabled, true, "by no way, it can't go");
  whatsapp().props.onCheckedChange(true);
  tree = redraw(page);
  // The body's toggle drafts it again for leads: asked about the draft it was, the question goes as Ask writes it again.
  sendNow();
  find(tree, (n) => n.type === Segmented && n.props.className === "sq-nw-aud").props.onValueChange("leads");
  tree = redraw(page);
  assert.equal(asks(), false, "drafted again, it is put away");
  const askedFor = () => posted.filter((p) => p.at === "/api/v1/sequences/draft");
  tree = await landed(() => askedFor().length === 2 && !textOf(redraw(page)).includes(W.say.againFor.leads));
  assert.equal(askedFor()[1].body.audience, "leads", "Ask was asked again, for leads");
  assert.equal(asks(), false);
  assert.deepEqual(
    posted.filter((p) => p.at === "/api/v1/sequences/new"),
    [],
    "nothing was sent from a question put away",
  );
});

test("REGRESSION: a draft the tab kept is counted again as it comes back, against the playbooks read as it is now: a count from before never stands", async () => {
  // Kept while nobody on VIP clients could hear it, its value typed; since, five of the seven on it can.
  const kept = {
    ...ASKED,
    steps: [
      {
        ...ASKED.steps[0],
        message: {
          ...ASKED.steps[0].message,
          params: [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
        },
      },
    ],
    reach: { can: 0, of: 3, left: W.reach.neverYes(3), held: 0, by: { whatsapp: 0 }, nobody: "no_yes" },
  };
  TM.keepDraft("new", { draft: kept, line: ASKED.said }, HERE);
  const read = playbooksSurface();
  setSurfaceValue("playbooks", { ...read, pools: { ...read.pools, "seg:vip": poolOf(7, 5) } });
  let tree = await openNew();
  assert.ok(byTestId(tree, "sq-nw-sentence"), "New opens on the kept draft");
  assert.ok(textOf(byTestId(tree, "sq-nw-reach")).startsWith(`5 ${W.reach.ofList(7)}`), "who can hear it now");
  assert.equal(byTestId(tree, "sq-nw-nobody"), null, "never the card for nobody, from before");
  assert.equal(hostOf(tree, "sq-nw-send-now").props.disabled, false, "and it can go");
  press(hostOf(tree, "sq-nw-send-now"));
  tree = redraw(page);
  assert.ok(
    textOf(byTestId(tree, "sq-nw-send-confirm")).includes(W.confirm.title(ASKED.name, 5)),
    "asked for the five",
  );
});

test("REGRESSION: a draft the tab kept by a channel closed since comes back on the channels the workspace sends on now, and goes by them", async () => {
  // Kept by WhatsApp and email; the workspace sends on WhatsApp alone now (the read's ready), so How could not untick email.
  const both = ["whatsapp", "email"];
  const step = ASKED.steps[0];
  const kept = {
    ...ASKED,
    channels: both,
    steps: [
      {
        ...step,
        message: {
          ...step.message,
          channels: both,
          params: [{ kind: "first_name" }, { kind: "text", value: "20% off" }],
        },
      },
    ],
  };
  TM.keepDraft("new", { draft: kept, line: ASKED.said }, HERE);
  let tree = await openNew();
  assert.equal(
    textOf(hostOf(byTestId(tree, "sq-nw-sentence"), "sq-nw-channels-pick")),
    M.channelsSaidOf(["whatsapp"], ""),
    "by WhatsApp alone",
  );
  press(hostOf(tree, "sq-nw-send-now"));
  tree = redraw(page);
  press(hostOf(tree, "sq-nw-send-yes"));
  await landed(() => went.length > 0);
  const made = posted.filter((p) => p.at === "/api/v1/sequences/new");
  assert.deepEqual(made.at(-1).body.channels, ["whatsapp"], "never by the mailbox it no longer has");
});

test("where the channels could not be read, a message picked goes by WhatsApp, as every send did before a channel was read: ticked, and Send now live", async () => {
  // Campaigns' read without its channels (server/campaigns/channels-ready.ts failed): no pause either.
  setSurfaceValue("playbooks", playbooksSurface({ ready: null }));
  // A one-off built by hand to the list the door named, its message still to pick, as the tab kept it.
  const byHand = M.setWho(M.draftByHand("once", "people", "Northside Studio"), ASKED.who);
  TM.keepDraft("new", { draft: byHand, line: null }, HERE);
  let tree = await openNew();
  assert.equal(hostOf(tree, "sq-nw-send-now").props.disabled, true, "a message still to pick");
  press(hostOf(tree, "sq-nw-pick-1"));
  tree = redraw(page);
  press(hostOf(tree, "sq-nw-message-tpl-1"));
  tree = redraw(page);
  assert.equal(
    textOf(hostOf(byTestId(tree, "sq-nw-sentence"), "sq-nw-channels-pick")),
    M.channelsSaidOf(["whatsapp"], ""),
  );
  assert.equal(byTestId(tree, "sq-nw-paused"), null, "a read that failed is no pause");
  assert.equal(
    hostOf(tree, "sq-nw-send-now").props.disabled,
    false,
    "REGRESSION: an unread read ticked nothing, and Send now stayed shut",
  );
  press(hostOf(tree, "sq-nw-send-now"));
  tree = redraw(page);
  press(hostOf(tree, "sq-nw-send-yes"));
  await landed(() => went.length > 0);
  const made = posted.filter((p) => p.at === "/api/v1/sequences/new");
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].body.channels, ["whatsapp"], "sent by WhatsApp");
  assert.equal(made[0].body.steps[0].message.template_id, "tpl-1");
});

/* ---------------------------------- G: the template composer ---------------------------------- */

test("a template half-written is kept, comes back with the page, and Close asks once; a translation the assistant wrote is kept too, and is not written again", async () => {
  const keep = { ...templates };
  const drafted = [];
  Object.assign(templates, {
    draft: async (body) => {
      drafted.push(body);
      return {
        ok: true,
        data: {
          draft: {
            name: "autumn_offer",
            body: "Hola {{1}}, {{2}} este otoño.",
            footer: "",
            examples: ["Dani", "20%"],
            variables: [{ label: "Name" }, { label: "Offer" }],
            warnings: [],
          },
        },
      };
    },
    create: async (b) => ({ ok: true, data: { name: b.name } }),
  });
  try {
    // New, drawn on its own.
    let closed = 0;
    const composeNew = () =>
      TemplateComposer({
        businessName: "Northside Studio",
        onDone() {},
        onCancel() {
          closed += 1;
        },
      });
    let tree = composeNew();
    type(byTestId(tree, "tpl-body"), "Hi {{1}}, 20% off any colour service this week.");
    tree = redraw(composeNew);
    assert.equal(
      TM.draft("template", "new").body,
      "Hi {{1}}, 20% off any colour service this week.",
      "kept as it is typed",
    );
    press(byTestId(tree, "tpl-close"));
    tree = redraw(composeNew);
    assert.equal(closed, 0, "not closed");
    assert.ok(byTestId(tree, "tpl-leave-confirm"), "Close with words asks");
    assert.equal(byTestId(tree, "tpl-submit"), null, "where the submit was");
    press(byTestId(tree, "tpl-leave-no"));
    tree = redraw(composeNew);
    assert.ok(byTestId(tree, "tpl-submit"));
    // Campaigns > Templates, come back to: the composer is open, on the words.
    unmount();
    tree = messagesPage();
    assert.ok(byTestId(tree, "messages-composer"), "come back to, the composer is open");
    assert.equal(
      byTestId(tree, "tpl-body").props.value,
      "Hi {{1}}, 20% off any colour service this week.",
      "on the words",
    );
    // Submitted and taken: nothing kept.
    unmount();
    tree = composeNew();
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hi {{1}}, 20% off any colour service this week.");
    type(byTestId(tree, "tpl-name"), "autumn_colour");
    tree = redraw(composeNew);
    const ex = find(tree, (n) => n.type === Field && n.props?.placeholder === "Ana");
    type(ex, "Dani");
    tree = redraw(composeNew);
    await press(byTestId(tree, "tpl-submit"));
    assert.equal(TM.draft("template", "new"), null, "submitted and taken: nothing kept");
    unmount();
    tree = messagesPage();
    assert.equal(byTestId(tree, "messages-composer"), null, "and Templates opens on its rows");

    // A translation: written once by the assistant, kept under the message and its language, and never paid for twice.
    fresh();
    const translate = { ref: "tpl-own", from: "en_US", name: "autumn_offer", language: "es", title: "Autumn offer" };
    const compose = () => TemplateComposer({ businessName: "Northside Studio", translate, onDone() {}, onCancel() {} });
    tree = compose();
    await settle();
    assert.equal(drafted.length, 1, "written once");
    tree = redraw(compose);
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hola {{1}}, {{2}} este otoño.");
    assert.equal(
      TM.draft("template", "autumn_offer|es").body,
      "Hola {{1}}, {{2}} este otoño.",
      "the assistant's words are work too",
    );
    unmount();
    tree = compose();
    await settle();
    assert.equal(
      drafted.length,
      1,
      "REGRESSION: opened again, it was drafted again -- and the assistant is paid per draft",
    );
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hola {{1}}, {{2}} este otoño.", "the words it had");
    press(byTestId(tree, "tpl-cancel"));
    tree = redraw(compose);
    assert.ok(byTestId(tree, "tpl-leave-confirm"), "Cancel asks");
    press(byTestId(tree, "tpl-leave-yes"));
    assert.equal(TM.draft("template", "autumn_offer|es"), null, "thrown away");
  } finally {
    Object.assign(templates, keep);
  }
});

test("a template composer drawn where there is no number to write to says so in place of its rows, and its submit stays shut over words the tab kept", () => {
  const compose = (over = {}) =>
    TemplateComposer({ pane: true, businessName: "Northside Studio", onDone() {}, onCancel() {}, ...over });
  // Words kept in the tab from a composer that had a number, as a person typed them.
  let tree = TemplateComposer({ businessName: "Northside Studio", onDone() {}, onCancel() {} });
  type(byTestId(tree, "tpl-body"), "Hi {{1}}, 20% off any colour service this week.");
  type(byTestId(tree, "tpl-name"), "autumn_colour");
  tree = redraw(() => TemplateComposer({ businessName: "Northside Studio", onDone() {}, onCancel() {} }));
  type(
    find(tree, (n) => n.type === Field && n.props?.placeholder === "Ana"),
    "Dani",
  );
  redraw(() => TemplateComposer({ businessName: "Northside Studio", onDone() {}, onCancel() {} }));
  unmount();
  // With a number the same words are ready to submit.
  tree = compose();
  assert.equal(byTestId(tree, "tpl-submit").props.disabled, false, "the words the tab kept are a template to submit");
  assert.equal(byTestId(tree, "tpl-no-number"), null);
  // Without one the composer says why, once, where its rows were, and submits nothing.
  unmount();
  const why = "Connect a WhatsApp number first — templates belong to a number's account.";
  tree = compose({ numberWhy: why });
  assert.ok(textOf(byTestId(tree, "tpl-no-number")).startsWith(why));
  assert.equal(byTestId(tree, "tpl-composer"), null, "none of its rows");
  assert.equal(byTestId(tree, "tpl-submit").props.disabled, true, "shut over words that would otherwise be ready");
});

test("the registry's hold: a composer's words hold the tab and the rail, as an open fold's do, and never stand between two folds", () => {
  const folds = globalThis.__recordFolds;
  assert.equal(tabClosing(), false);
  let words = true;
  const release = folds.hold("send", () => words);
  assert.equal(tabClosing(), true, "the tab asks");
  assert.equal(globalThis.__settingsUnsaved(), true, "the rail asks");
  words = false;
  assert.equal(tabClosing(), false, "read at the moment it asks");
  words = true;
  // A fold asked for while a composer holds opens at once: the hold is not a fold's unsaved changes.
  assert.equal(folds.request("hours", { dirty: () => false }), true);
  assert.equal(
    folds.request("services", { dirty: () => false }),
    true,
    "a clean fold gives way whatever a composer holds",
  );
  release();
  assert.equal(tabClosing(), false, "released, it holds nothing");
  release();
  folds.reset();
});
