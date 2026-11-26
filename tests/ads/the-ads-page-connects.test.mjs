/**
 * The Ads page before any ad is read (the Ads plan, 4.1 and 4.2): the ad account's card beside the counts, the coral
 * Connect for the owner where Ads is offered, and the one press that opens Meta's own window by the app's route and
 * leaves the card checking. The real page and its hook run on the stub React, over a fetch where the routes would be.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, all, byTestId, find, redrawWanted, textOf } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";
import { HOUR_MS, MIN_MS } from "@chanlytics/contracts";

installStubReact({ CHANLY: { nav() {} } });
const S = "../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { api } = await import(`${S}/bridge/api.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { CARD, CONNECT } = await import(`${S}/surfaces/campaigns/ads/connect/words.ts`);
const { standingSaid } = await import(`${S}/surfaces/kit/head/standing.ts`);

/** The coral button as the page hands it to the frame's head: its word, or null where there is none to press. */
const headConnect = () => standingSaid()?.act?.props ?? {};

const SERIES = { first_came: { by_via: { whatsapp: 3 } }, today: "2031-03-15", days: 30 };
const route = { account: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input instanceof Request ? input.url : input), "https://app.example.org");
  const data = url.pathname === "/api/v1/ads/account" ? route.account : { series: SERIES, now: null };
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const opened = [];
const realOpen = globalThis.window.open;
after(() => {
  globalThis.fetch = realFetch;
  globalThis.window.open = realOpen;
});

/** The page as a workspace's own, its account answered as `account` says, drawn once its reads are in. */
async function pageWith(account) {
  api().forget();
  route.account = account;
  globalThis.sessionStorage.removeItem("ads-mock-scenario");
  fresh();
  const draw = () => AdsPage({ param: "ads" });
  draw();
  await until(redrawWanted, "the page's reads");
  return { draw: () => again(draw) };
}

test("the owner sees the card and the coral Connect", async () => {
  const page = await pageWith({ offered: true, can_connect: true, meta: null });
  const tree = page.draw();
  const card = byTestId(tree, "ads-conn");
  assert.equal(card.props["data-state"], "none");
  assert.match(textOf(card), new RegExp(CARD.name));
  assert.match(textOf(card), new RegExp(CARD.notConnected));
  assert.match(textOf(card), new RegExp(CARD.charges));
  assert.equal(headConnect().connect, CONNECT.connect);
});

test("someone who is not the owner sees the same card with no button, and who can connect", async () => {
  const page = await pageWith({ offered: true, can_connect: false, meta: null });
  const tree = page.draw();
  assert.equal(headConnect().connect, null);
  assert.match(textOf(byTestId(tree, "ads-conn")), new RegExp(CARD.ownerOnly));
});

const MARK = "chanlytics.ads.connect-window.v1";

/** A page that came back from Meta with `outcome` in its address: whether it closed itself. */
async function cameBack({ marked, at = Date.now() }) {
  let closed = false;
  globalThis.close = () => {
    closed = true;
  };
  // Meta's sign-in may clear both a window's name and its tie to the page that opened it.
  Object.assign(globalThis, { name: "", opener: null });
  globalThis.location.search = "?connect=connected";
  if (marked) globalThis.localStorage.setItem(MARK, String(at));
  else globalThis.localStorage.removeItem(MARK);
  await pageWith({ offered: true, can_connect: true, meta: null });
  globalThis.location.search = "";
  return closed;
}

test("Meta's window closes itself on the way back by the page's mark, though Meta cleared its name and its opener", async () => {
  globalThis.window.open = () => ({ closed: false });
  const page = await pageWith({ offered: true, can_connect: true, meta: null });
  page.draw();
  headConnect().onConnect();
  assert.ok(Number(globalThis.localStorage.getItem(MARK)) > 0, "Connect leaves its mark while the window is open");
  assert.equal(await cameBack({ marked: true }), true, "the window that comes back closes");
  assert.equal(globalThis.localStorage.getItem(MARK), null, "and takes the mark, so one page closes");
  // A page that came back in the same tab left no mark: it stays, and so does a mark left an hour ago.
  assert.equal(await cameBack({ marked: false }), false);
  assert.equal(await cameBack({ marked: true, at: Date.now() - HOUR_MS - MIN_MS }), false);
});

test("a browser that opens no window follows the way in the same tab and leaves no mark", async () => {
  globalThis.window.open = () => null;
  const page = await pageWith({ offered: true, can_connect: true, meta: null });
  page.draw();
  headConnect().onConnect();
  assert.equal(globalThis.localStorage.getItem(MARK), null);
});

test("Connect is one press: Meta's own window opens by the app's route, and the card checks while it is open", async () => {
  const page = await pageWith({ offered: true, can_connect: true, meta: null });
  globalThis.window.open = (url, name) => {
    opened.push([String(url), name]);
    return { closed: false };
  };
  page.draw();
  headConnect().onConnect();
  assert.equal(opened.length, 1, "no sheet of ours first: the press opens the window");
  const [[url, name]] = opened;
  assert.match(url, /\/api\/v1\/ads\/connect(\?|$)/);
  assert.equal(name, "chanlytics-ads-connect");
  const checking = page.draw();
  assert.equal(byTestId(checking, "ads-conn").props["data-state"], "checking");
  assert.equal(headConnect().connect, null, "nothing to press while it checks");
  // Three checks, each one Chanlytics can read (the Page's WhatsApp number is a quiet line, never a check).
  assert.equal(byTestId(checking, "ads-conn-checks").props.children.length, 3);
  // The window says what happened on the app's channel; the page reads the account again and the card goes on.
  route.account = {
    offered: true,
    can_connect: true,
    meta: {
      id: "acc-1",
      external_id: "1200000000000042",
      status: "connected",
      standing: "active",
      name: "Harbor",
      currency: "USD",
      page_name: "Harbor Nails",
      connected_at: "2031-03-15T15:00:00Z",
      revoked_at: null,
      disconnected_at: null,
      read_at: "2031-03-15T15:00:00Z",
      read_failed: false,
      spend_limit_minor: null,
      instagram_handle: null,
      ai_number: "+15550100142",
      checks: ["account-active", "payment", "page-linked"].map((id) => ({
        id,
        ok: true,
      })),
      whatsapp_link: "unsaid",
      can_pause: true,
      reads_instagram: true,
      choices: [],
    },
  };
  const said = new BroadcastChannel("chanlytics-ads-connect");
  said.postMessage({ outcome: "connected", why: null });
  await until(
    () => byTestId(page.draw(), "ads-conn").props["data-state"] === "connected",
    "the card to go on by itself",
  );
  said.close();
  // Connected with every check met: the card folds to its head, and what it holds is behind its caret.
  const connected = byTestId(page.draw(), "ads-conn");
  assert.equal(connected.props["data-folded"], true);
  assert.equal(textOf(connected), "Facebook and InstagramConnected");
  assert.ok(byTestId(connected, "ads-conn-caret"), "its caret opens what it holds");
  // What the caret's sheet draws (connect/card-sheet.tsx): the card's own facts, drawn by the card's own part.
  const { connectCard } = await import(`${S}/surfaces/campaigns/ads/connect/card-model.ts`);
  const { CardFacts } = await import(`${S}/surfaces/campaigns/ads/connect/card.tsx`);
  const vm = connectCard(route.account, { outcome: null, checking: false, timezone: "America/New_York" });
  const facts = CardFacts({ facts: vm.facts });
  assert.match(textOf(facts), /Harbor · US dollars/);
  assert.match(textOf(facts), /Harbor Nails/);
  // Meta's limit and its door into Meta: two pieces that wrap apart, with no mark between them to hang at a line's end.
  const limit = find(facts, (n) => n.props?.className === "ads-conn-fact-door");
  assert.equal(textOf(limit), "NoneSet in Meta");
});

test("Reports › Ads draws its four figures as every lens draws its strip: the kit's figure, four across", async () => {
  const { AdsLiveLens } = await import(`${S}/surfaces/reports/lenses/ads-live.tsx`);
  const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);
  const read = {
    account: {
      status: "connected",
      name: "Harbor",
      currency: "USD",
      timezone: "America/New_York",
      read_at: "2031-03-15T15:00:00Z",
      read_failed: false,
      revoked_at: null,
      disconnected_at: null,
      ready: true,
    },
    window: { from: "2031-02-14", to: "2031-03-15" },
    today: "2031-03-15",
    ads: [],
    unnamed: { people: 0, booked: 0 },
    elsewhere: { people: 0, booked: 0 },
    can_press: true,
    stopped_at: null,
    needs_you: { count: 0, people: [] },
  };
  fresh();
  const strip = byTestId(
    again(() => AdsLiveLens({ dto: read })),
    "ads-lens-figures",
  );
  assert.equal(strip.props.className, "rpt-figures quad");
  const figures = all(strip, (n) => n.type === Figure);
  assert.deepEqual(
    figures.map((figure) => [figure.props.className, figure.props.value]),
    [
      ["rpt-cell", "0"],
      ["rpt-cell", "0"],
      ["rpt-cell", "—"],
      ["rpt-cell", "$0"],
    ],
  );
});

test("Settings › Connections: the ad account stands in its group as a row does, and the group counts it", async () => {
  const { adsPlaceOf } = await import(`${S}/surfaces/settings/connections/ad-account-real.tsx`);
  const { CONNECTION_GROUP_WORDS } = await import(`${S}/surfaces/settings/connections/model/setup.ts`);
  const vm = (state, tone = null) => ({ state, need: tone ? { tone } : null });
  // Not read yet: nowhere. Connected: in Connected, needing attention only where something stops its ads.
  assert.equal(adsPlaceOf(null, null), null);
  assert.deepEqual(adsPlaceOf("connected", vm("connected")), { group: "connected", state: "connected" });
  assert.deepEqual(adsPlaceOf("connected", vm("connected", "warn")), { group: "connected", state: "attention" });
  assert.deepEqual(adsPlaceOf("connected", vm("connected", "calm")), { group: "connected", state: "connected" });
  // AI stopped with ads still on: the card says so with its press, and the row needs attention until they are paused.
  assert.deepEqual(adsPlaceOf("connected", vm("connected"), true), { group: "connected", state: "attention" });
  assert.deepEqual(adsPlaceOf("revoked", vm("signed-out")), { group: "connected", state: "attention" });
  // Before one is connected: Available, waiting on the owner while two are to be chosen from.
  assert.deepEqual(adsPlaceOf(null, vm("none")), { group: "available", state: "none" });
  assert.deepEqual(adsPlaceOf("choosing", vm("question")), { group: "available", state: "waiting_you" });
  assert.deepEqual(adsPlaceOf(null, vm("checking")), { group: "available", state: "waiting_them" });
  assert.deepEqual(adsPlaceOf("disconnected", vm("left")), { group: "available", state: "none" });
  // The group's head counts the card with its rows: three rows and the ad account are four, and its need is said.
  const W = CONNECTION_GROUP_WORDS;
  const rows = [{ state: "connected" }, { state: "connected" }, { state: "connected" }];
  assert.equal(W.connected.sub([...rows, { state: "connected" }]), "4 connected");
  assert.equal(W.connected.sub([...rows, { state: "attention" }]), "4 connected · 1 needs attention");
  assert.equal(W.available.sub([{ state: "none" }, { state: "waiting_you" }]), "something here waits on you");
});

test("the card says its name as its page gives it: the Ads page's own, and the ads in Connections", async () => {
  const { CARD } = await import(`${S}/surfaces/campaigns/ads/connect/words.ts`);
  assert.equal(CARD.inConnections, "Facebook and Instagram ads");
  const page = await pageWith({ offered: true, can_connect: true, meta: null });
  const card = byTestId(page.draw(), "ads-conn");
  assert.equal(card.props["aria-label"], CARD.name);
});

test("a check met is still, a check not known yet turns, and a check not met warns", async () => {
  const { CardChecks } = await import(`${S}/surfaces/campaigns/ads/connect/card.tsx`);
  fresh();
  const tree = again(() =>
    CardChecks({
      checks: [
        { id: "page-linked", label: "Page", neededFor: "A new ad", state: "ok" },
        { id: "payment", label: "Payment method in Meta", neededFor: "Turn on, Resume", state: "unknown" },
        { id: "account-active", label: "Ad account is active", neededFor: "Turn on, Resume", state: "missing" },
      ],
      neededFor: false,
    }),
  );
  const [met, checking, missing] = all(tree, (n) => n.type === "li");
  const dotOf = (li) => find(li, (n) => n.props?.className === "ads-dot").props;
  assert.deepEqual([dotOf(met)["data-state"], dotOf(met)["data-turning"]], ["ok", undefined]);
  assert.equal(dotOf(checking)["data-turning"], "true");
  assert.equal(dotOf(missing)["data-state"], "warn");
  assert.equal(textOf(met), "Page");
});

test("Chanlytics looks again at Meta when the owner comes back to the tab, never at the focus a page is given as it opens", async () => {
  const checks = ["account-active", "payment", "page-linked"];
  const page = await pageWith({
    offered: true,
    can_connect: true,
    meta: {
      id: "acc-2",
      external_id: "1200000000000043",
      status: "connected",
      standing: "active",
      name: "Harbor",
      currency: "USD",
      page_name: "Harbor Nails",
      connected_at: "2031-03-15T15:00:00Z",
      revoked_at: null,
      disconnected_at: null,
      read_at: "2031-03-15T15:00:00Z",
      read_failed: false,
      spend_limit_minor: null,
      instagram_handle: null,
      ai_number: "+15550100142",
      // Meta has no payment method: the one thing an owner goes to Meta to mend, and comes back from.
      checks: checks.map((id) => ({ id, ok: id !== "payment" })),
      whatsapp_link: "unsaid",
      can_pause: true,
      reads_instagram: true,
      choices: [],
    },
  });
  page.draw();
  const looked = [];
  const network = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/v1/ads/account/check")) looked.push(url);
    return network(input, init);
  };
  try {
    globalThis.document.visibilityState = "visible";
    // The focus a page is given as it opens: the owner has not been anywhere, and Meta is not asked.
    globalThis.window.dispatchEvent({ type: "focus" });
    assert.deepEqual(looked, [], "no look at Meta on the page's own first focus");
    // Away to Meta and back: one look.
    globalThis.window.dispatchEvent({ type: "blur" });
    globalThis.window.dispatchEvent({ type: "focus" });
    await until(() => looked.length === 1, "one look at Meta on coming back");
    // A second focus with no leaving between is no coming back.
    globalThis.window.dispatchEvent({ type: "focus" });
    assert.equal(looked.length, 1);
  } finally {
    globalThis.fetch = network;
    delete globalThis.document.visibilityState;
  }
});
