/**
 * Campaigns in Glass, the one look (the interface kit's step 5.4, the Campaigns canvas C1 and C2; Classic retired on 2 October
 * 2026): a one-off is one sentence in one pane. Drawn on the stub React: New's draft (sequences/new/new-draft.tsx DraftView),
 * which every one-off is made in since decision 0065's step 7 took the Broadcasts send screen away. The sentence says what it
 * is, to whom, when and by which channels, each a word pressed to change it; who it reaches stands under it, the message under
 * that, and the foot holds the one act the draft is set up for: Send now, or Schedule once a time is picked. Send now asks
 * first, by who it reaches where the workspace counted it and by the name alone where nothing does; paused for billing,
 * the pane says so first and nothing sends, though a sequence can still be kept as a draft.
 *
 * What a look changes by token is not here (the gallery and the harness's shots show it); this holds the few pieces of
 * markup the pane draws, and that each part keeps the testids the tests and specs reach it by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  classes,
  textOf,
  press,
} from "../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const W = contracts.NEW_WORDS;

installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The shell's own components the pages draw by name (PolicyChip, Confirm, the record kit's sheet): the frame's JSX.
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
Object.assign(globalThis, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { DraftView } = await import(`${SRC}/surfaces/campaigns/sequences/new/new-draft.tsx`);
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);

const within = (tree, id, inner) => {
  const outer = byTestId(tree, id);
  return !!outer && !!find(outer, (n) => n.props?.["data-testid"] === inner);
};
/** The host element a testid names (a kit Button is its own node and the host button it draws, both carrying the id). */
const hostOf = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
/** The pane's own head and foot (CmPane's), apart from those of the sheets drawn in its body. */
const paneHead = (pane) => find(pane, (n) => n.type === "header" && classes(n).includes("cm-pane-head"));
const paneFoot = (pane) => find(pane, (n) => n.type === "footer" && classes(n).includes("cm-pane-foot"));

/** One of the workspace's messages, as New holds it (new-model.ts heldMessageOf): news, by WhatsApp or email. */
const MESSAGE = {
  template_id: "tpl-hours",
  title: "Late hours",
  body: "Hi {{1}}, we are open late on Thursdays.",
  channels: ["whatsapp", "email"],
  params: [{ kind: "first_name" }],
  offer: false,
  written: null,
  labels: ["First name"],
};
/** A one-off drafted for a list (contracts NewDraftDto, as POST sequences/draft answers it): now, by WhatsApp and email. */
const ONCE = {
  said: "Tell my VIPs we're open late on Thursdays",
  business: "Northside Studio",
  kind: "once",
  audience: "people",
  name: "Late hours",
  who: { kind: "list", token: "seg:vip", label: "VIP clients" },
  run_hour: 10,
  at: null,
  channels: ["whatsapp", "email"],
  mailbox: null,
  adds_new: false,
  steps: [
    {
      name: "Late hours",
      after_days: null,
      only_if: [],
      does: "message",
      message: MESSAGE,
      email: null,
      hand: "",
    },
  ],
  policy_class: "campaign",
  mode: null,
  reach: { can: 12, of: 14, left: "2 never said yes", held: 0, by: { whatsapp: 9, email: 3 } },
  checks: [],
  twin: null,
  cannot: null,
};
const READY = ["whatsapp", "email"];
/** What the draft reads beside itself (new-page.tsx useNewReads), as a workspace that read its lists and Library holds it. */
const READS = {
  who: {
    moments: [],
    lists: [{ id: "seg:vip", name: "VIP clients", candidates: 14, said: null }],
    everyone: 214,
    everyoneHeld: 0,
    sources: [],
    running: [],
  },
  library: { messages: [], rows: [] },
  ready: READY,
  paused: false,
  today: contracts.zoneDayKey(Date.now(), ZONE),
  timezone: ZONE,
  recount: { counts: { pools: {}, searches: [] }, running: [], ready: READY },
};

/** New's pane over a draft, drawn afresh and drawn again, as the page draws it once its reads are in. */
const open = (draft, made = [], reads = READS) => {
  freshTree();
  const props = {
    draft,
    reads,
    busy: false,
    doing: null,
    redraftingFor: null,
    leaving: null,
    acts: {
      change() {},
      redraft() {},
      undo() {},
      again() {},
      discard() {},
      make: (start) => made.push(start),
      close() {},
    },
  };
  const page = () => again(() => globalThis.React.createElement(DraftView, props));
  page();
  return { tree: page(), page };
};
/** The acts the pane's foot offers: every one a draft can be set up for. */
const ACTS = ["sq-nw-send-now", "sq-nw-schedule", "sq-nw-start", "sq-nw-send", "sq-nw-keep"];

test("a one-off is one sentence in one pane: what, to whom, when and by which channels, who it reaches under it, the message, and the one act it is set up for", () => {
  const { tree } = open(ONCE);
  const pane = byTestId(tree, "sq-new");
  assert.ok(pane, "New's pane");
  // The sentence, in the pane: each of its words a press that opens its sheet.
  assert.ok(within(tree, "sq-new", "sq-nw-sentence"), "the sentence, in the pane");
  const sentence = byTestId(tree, "sq-nw-sentence");
  const word = (id) => textOf(hostOf(sentence, id));
  assert.equal(word("sq-nw-kind-pick"), W.draft.kind.once, "what it is");
  assert.equal(word("sq-nw-who-pick"), "VIP clients", "to whom");
  assert.equal(word("sq-nw-when-pick"), W.draft.now, "when");
  assert.equal(word("sq-nw-channels-pick"), M.channelsSaidOf(ONCE.channels, " or "), "and by which channels");
  // Who it reaches, under the sentence; then the message, under that.
  assert.equal(textOf(byTestId(tree, "sq-nw-reach")).startsWith(`12 ${W.reach.ofList(14)}`), true);
  assert.ok(within(tree, "sq-new", "sq-nw-steps"), "the message, in the pane");
  assert.equal(
    textOf(hostOf(byTestId(tree, "sq-nw-steps"), "sq-step-open-1")),
    MESSAGE.title,
    "its one box, with no rail",
  );
  assert.ok(within(tree, "sq-nw-steps", "message-preview"), "its words as the customer reads them");
  assert.equal(textOf(hostOf(tree, "sq-nw-pick-1")), MESSAGE.title, "the message it sends, a press to change it");
  const order = all(pane, (n) => ["sq-nw-sentence", "sq-nw-reach", "sq-nw-steps"].includes(n.props?.["data-testid"]));
  assert.deepEqual(
    [...new Set(order.map((n) => n.props["data-testid"]))],
    ["sq-nw-sentence", "sq-nw-reach", "sq-nw-steps"],
    "the sentence, who it reaches, then the message",
  );
  // The foot holds one act: Send now, live, with who it reaches and when it goes said beside it.
  const foot = paneFoot(pane);
  assert.deepEqual(
    ACTS.filter((id) => hostOf(foot, id)),
    ["sq-nw-send-now"],
    "one act in the foot",
  );
  assert.equal(hostOf(foot, "sq-nw-send-now").props.disabled, false);
  assert.ok(textOf(foot).includes(W.draft.people(12)), "who it reaches, beside the act");
  // Close is the pane head's ×, the one corner every sheet closes from; Discard is a word, never a bare ⋯.
  const head = paneHead(pane);
  assert.ok(hostOf(head, "cm-pane-close"), "the head's close");
  assert.equal(textOf(hostOf(head, "sq-nw-discard")), W.draft.discard);
  assert.equal(textOf(pane).includes("⋯"), false, "no three dots");
});

test("a one-off with a time picked is scheduled, never sent now: the sentence says the time, and Send now asks first where it is the act", () => {
  // Nine in the morning, two days on by the business's clock: a time still ahead whenever the suite runs.
  const at = `${contracts.zonedInputValue(Date.now() + 2 * contracts.DAY_MS, ZONE).slice(0, 10)}T09:00`;
  const { tree } = open({ ...ONCE, at });
  assert.equal(textOf(hostOf(byTestId(tree, "sq-nw-sentence"), "sq-nw-when-pick")), M.atWords(at));
  const foot = paneFoot(byTestId(tree, "sq-new"));
  assert.deepEqual(
    ACTS.filter((id) => hostOf(foot, id)),
    ["sq-nw-schedule"],
    "Schedule, in Send now's place",
  );
  assert.ok(textOf(foot).includes(W.draft.goesAt(M.atWords(at))), "and when it goes, said beside it");

  // Sent now, it asks first, in the foot where it was pressed: nothing is made until the question's yes.
  const made = [];
  const now = open(ONCE, made);
  press(hostOf(now.tree, "sq-nw-send-now"));
  const asking = paneFoot(byTestId(now.page(), "sq-new"));
  assert.deepEqual(made, [], "pressing Send now sends nothing yet");
  assert.ok(byTestId(asking, "sq-nw-send-confirm"), "the question, in the foot");
  assert.ok(textOf(asking).includes(W.confirm.title(ONCE.name, 12)), "who it goes to, by its count");
  assert.equal(hostOf(asking, "sq-nw-send-now"), null, "in the act's place");
  press(hostOf(asking, "sq-nw-send-yes"));
  assert.deepEqual(made, [true], "its yes makes it, sent");
});

/** Send now pressed on New's pane over a draft: the question it asks in the foot, and the pane drawn again. */
const askedToSend = (draft, made = []) => {
  const pane = open(draft, made);
  press(hostOf(pane.tree, "sq-nw-send-now"));
  const foot = paneFoot(byTestId(pane.page(), "sq-new"));
  return { foot, question: textOf(byTestId(foot, "sq-nw-send-confirm")) };
};

test("Send now asks by who it reaches where the workspace counted it, and by the name alone where nothing counts it: never to 0 people", () => {
  // News sent once to a list is counted by no yes (lib/new-checks.ts newReachOf): the draft holds no reach, and can go.
  const uncounted = { ...ONCE, reach: null };
  const { tree } = open(uncounted);
  const foot = paneFoot(byTestId(tree, "sq-new"));
  assert.equal(hostOf(foot, "sq-nw-send-now").props.disabled, false, "nothing uncounted stops it");
  assert.equal(textOf(foot).includes(W.draft.people(0)), false, "and no count is said beside it");
  const made = [];
  const asked = askedToSend(uncounted, made);
  assert.ok(asked.question.includes(W.confirm.titleNow(ONCE.name)), "asked by its name, now");
  assert.equal(
    asked.question.includes(W.confirm.title(ONCE.name, 0)),
    false,
    "REGRESSION: it asked to send to 0 people",
  );
  press(hostOf(asked.foot, "sq-nw-send-yes"));
  assert.deepEqual(made, [true], "its yes sends it");
  // Counted, it asks by the count: one person, said as one.
  const one = askedToSend({ ...ONCE, reach: { can: 1, of: 14, left: null, held: 0, by: { whatsapp: 1 } } });
  assert.ok(one.question.includes(W.confirm.title(ONCE.name, 1)));
  assert.equal(one.question.includes(W.confirm.titleNow(ONCE.name)), false);
});

/** A sequence drafted for people on a moment (contracts NewDraftDto): the day after a visit, its one message by WhatsApp and email. */
const SEQUENCE = {
  ...ONCE,
  said: "Thank them the day after a visit",
  kind: "sequence",
  name: "Thank you",
  who: { kind: "moment", trigger: "visited", label: "the day after a visit" },
  mode: "ask",
  reach: { can: 6, of: null, left: null },
};

test("paused for billing, nothing sends: the card says so first, a one-off's Send now waits, and a sequence keeps Keep as a draft beside a Start that waits", () => {
  const paused = { ...READS, paused: true };
  let { tree } = open(ONCE, [], paused);
  const card = byTestId(tree, "sq-nw-paused");
  assert.ok(card, "the paused card");
  assert.ok(textOf(card).includes(W.paused.lead));
  assert.ok(textOf(card).includes(contracts.CAMPAIGNS_PAUSED_WORDS), "why, and where it resumes");
  assert.equal(
    find(tree, (n) => classes(n).includes("sq-nw-cases")).props.children[0].props.testid,
    "sq-nw-paused",
    "said first, over the sentence",
  );
  let foot = paneFoot(byTestId(tree, "sq-new"));
  assert.equal(hostOf(foot, "sq-nw-send-now").props.disabled, true, "a one-off's Send now waits");
  assert.ok(textOf(foot).includes(W.paused.lead) && textOf(foot).includes(W.paused.sub), "and the foot says why");

  // A sequence: Start waits, and Keep as a draft stays beside it -- keeping sends nothing.
  const made = [];
  ({ tree } = open(SEQUENCE, made, paused));
  assert.ok(byTestId(tree, "sq-nw-paused"));
  foot = paneFoot(byTestId(tree, "sq-new"));
  assert.equal(hostOf(foot, "sq-nw-start").props.disabled, true, "Start waits");
  assert.equal(hostOf(foot, "sq-nw-keep").props.disabled, false, "Keep stays");
  press(hostOf(foot, "sq-nw-keep"));
  assert.deepEqual(made, [false], "kept, not started");

  // Not paused: no card, and each act is live.
  ({ tree } = open(SEQUENCE));
  assert.equal(byTestId(tree, "sq-nw-paused"), null);
  foot = paneFoot(byTestId(tree, "sq-new"));
  assert.deepEqual(
    [hostOf(foot, "sq-nw-start").props.disabled, hostOf(foot, "sq-nw-keep").props.disabled],
    [false, false],
  );
  ({ tree } = open(ONCE));
  assert.equal(byTestId(tree, "sq-nw-paused"), null);
  assert.equal(hostOf(paneFoot(byTestId(tree, "sq-new")), "sq-nw-send-now").props.disabled, false);
});
