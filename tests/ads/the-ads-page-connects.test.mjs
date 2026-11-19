/**
 * The Ads page before any ad is read (the Ads plan, 4.1 and 4.2): the ad account's card beside the counts, the coral
 * Connect for the owner where Ads is offered, and the one press that opens Meta's own window by the app's route and
 * leaves the card checking. The real page and its hook run on the stub React, over a fetch where the routes would be.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, redrawWanted, textOf } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";

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

test("the owner sees the card and the coral Connect; the platforms that come later are one quiet line", async () => {
  const page = await pageWith({ offered: true, can_connect: true, meta: null });
  const tree = page.draw();
  const card = byTestId(tree, "ads-conn");
  assert.equal(card.props["data-state"], "none");
  assert.match(textOf(card), new RegExp(CARD.name));
  assert.match(textOf(card), new RegExp(CARD.notConnected));
  assert.match(textOf(card), new RegExp(CARD.charges));
  assert.equal(headConnect().connect, CONNECT.connect);
  assert.equal(textOf(byTestId(tree, "ads-later")), CARD.later);
});

test("someone who is not the owner sees the same card with no button, and who can connect", async () => {
  const page = await pageWith({ offered: true, can_connect: false, meta: null });
  const tree = page.draw();
  assert.equal(headConnect().connect, null);
  assert.match(textOf(byTestId(tree, "ads-conn")), new RegExp(CARD.ownerOnly));
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
  assert.equal(byTestId(checking, "ads-conn-checks").props.children.length, 5);
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
      checks: ["account-active", "payment", "page-linked", "whatsapp-linked", "chanlytics-whatsapp"].map((id) => ({
        id,
        ok: true,
      })),
      can_pause: true,
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
  const connected = byTestId(page.draw(), "ads-conn");
  assert.match(textOf(connected), /Harbor · US dollars/);
  assert.match(textOf(connected), /Harbor Nails/);
});
