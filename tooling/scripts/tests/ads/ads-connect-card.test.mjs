/**
 * The "Ad accounts" card in Settings › Connections (surfaces/settings/connections/ad-accounts.tsx), drawn on the stub React over
 * the Ads page's fixtures and pressed: what each row says, Disconnect refused while an ad runs (with a door to Ads) and asked
 * before it is done when none does, Connect connecting nothing and saying so, Change account and Choose, and the owner's setting.
 * The words are contracts' (ads-connect.test.mjs holds them); this holds that the card draws and does what it says.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press } from "../_legacy-react.mjs";

installLegacyReact();
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { AdAccounts } = await import("../../../../apps/dashboard/src/surfaces/settings/connections/ad-accounts.tsx");

const flashes = [];
const flash = (f) => flashes.push(f);
/** The example the Ads page keeps for the tab (store.ts): the card starts from the same one. */
const withExample = (example) => {
  globalThis.sessionStorage = { getItem: () => example, setItem() {} };
};
const redraw = () => again(() => globalThis.React.createElement(AdAccounts, { flash }));
/** Drawn twice: the store reads the example kept for the tab after the page mounts (an effect), and the card follows it. */
const draw = () => {
  fresh();
  flashes.length = 0;
  redraw();
  return redraw();
};
const said = (tree, id) => textOf(byTestId(tree, id)).replace(/\s+/g, " ").trim();

test("the card is the pane's own look: a row for each platform, its state, its facts, what is ready, the owner's setting", () => {
  withExample("running");
  const tree = draw();
  assert.ok(byTestId(tree, "connections-ads"), "a card");
  for (const id of ["meta", "google", "tiktok"]) assert.ok(byTestId(tree, `ad-account-${id}`), id);
  assert.match(said(tree, "ad-account-meta"), /^Facebook and Instagram · Harbor Studio ad account/);
  assert.equal(byTestId(tree, "ad-state-meta").props["data-state"], "ok");
  assert.equal(said(tree, "ad-state-meta"), "Connected");
  assert.equal(said(tree, "ad-facts-meta"), "USD · New York time · set by the account · Read 9:19 AM");
  assert.match(said(tree, "ad-ready-google"), /Chanlytics' access: accepted/);
  assert.match(said(tree, "ad-ready-tiktok"), /Post permission until Wed 4 Nov/);
  assert.equal(said(tree, "ad-adopted-meta"), "1 ad made in Meta Ads Manager is shown in Ads, read-only.");
  assert.equal(byTestId(tree, "ad-pause-switch").props["aria-checked"], false, "off unless the owner chooses it");
  assert.match(said(tree, "ad-pause"), /Pause my ads when the way in closes.*instead of only telling you/);
});

test("Disconnect while an ad runs is refused, with a door to Ads; nothing is asked and nothing changes", () => {
  withExample("running");
  let tree = draw();
  press(byTestId(tree, "ad-disconnect-meta"));
  tree = redraw();
  assert.match(said(tree, "ad-refused-meta"), /^Pause or end your ads first: 2 are on\.\s*See your ads\s*Ok$/);
  assert.match(byTestId(tree, "ad-refused-door-meta").props.href, /campaigns\/ads$/);
  assert.equal(byTestId(tree, "ad-disconnect-meta-confirm"), null, "no question is asked");
  assert.equal(said(tree, "ad-state-meta"), "Connected", "and Meta stays connected");
  assert.equal(flashes.length, 0);
  // Ok puts the refusal away.
  press(all(byTestId(tree, "ad-refused-meta"), (n) => n.type === "button")[0]);
  assert.equal(byTestId(redraw(), "ad-refused-meta"), null);
});

test("with no ad running, Disconnect asks first; yes leaves the row not connected, and no leaves it as it was", () => {
  withExample("no-ads");
  let tree = draw();
  assert.equal(said(tree, "ad-state-google"), "Not connected");
  press(byTestId(tree, "ad-disconnect-meta"));
  tree = redraw();
  assert.match(said(tree, "ad-disconnect-meta-confirm"), /^Disconnect Facebook and Instagram\?/);
  press(byTestId(tree, "ad-disconnect-meta-no"));
  tree = redraw();
  assert.equal(byTestId(tree, "ad-disconnect-meta-confirm"), null);
  assert.equal(said(tree, "ad-state-meta"), "Needs you", "connected, with no payment method yet, as the example is");
  press(byTestId(tree, "ad-disconnect-meta"));
  tree = redraw();
  press(byTestId(tree, "ad-disconnect-meta-yes"));
  tree = redraw();
  assert.equal(said(tree, "ad-state-meta"), "Not connected");
  assert.equal(flashes.at(-1).msg, "Facebook and Instagram is disconnected.");
  assert.ok(byTestId(tree, "ad-connect-meta"), "and it offers Connect");
});

test("Connect connects nothing in a demo and says so; the row reads what connecting does", () => {
  withExample("no-ads");
  const tree = draw();
  assert.match(said(tree, "ad-account-google-under"), /Google bills you; Chanlytics never holds your ad money\./);
  press(byTestId(tree, "ad-connect-google"));
  assert.equal(flashes.at(-1).msg, "This opens Google's sign-in in the real app. Nothing was connected.");
  assert.equal(said(redraw(), "ad-state-google"), "Not connected", "nothing was connected");
});

test("several accounts: the choices with their currency, Use this account waits for a pick, and a pick connects", () => {
  withExample("choose");
  let tree = draw();
  assert.equal(said(tree, "ad-state-meta"), "Choose an account");
  const choose = byTestId(tree, "ad-choose-meta");
  assert.match(textOf(choose), /Which Meta account should Chanlytics use\?/);
  const options = all(choose, (n) => n.props?.role === "radio");
  assert.deepEqual(
    options.map((o) => textOf(o).replace(/\s+/g, " ").trim()),
    ["Harbor Studio ad accountUSD", "Harbor Studio second accountUSD", "Harbor Studio UKGBP"],
  );
  assert.equal(byTestId(tree, "ad-use-meta").props.disabled, true, "no account is chosen for the owner");
  press(options[2]);
  tree = redraw();
  assert.equal(byTestId(tree, "ad-use-meta").props.disabled, false);
  press(byTestId(tree, "ad-use-meta"));
  tree = redraw();
  assert.equal(said(tree, "ad-state-meta"), "Connected");
  assert.match(said(tree, "ad-account-meta"), /Harbor Studio UK/);
  assert.equal(flashes.at(-1).msg, "Facebook and Instagram now uses Harbor Studio UK.");
  assert.match(said(tree, "ad-facts-meta"), /^GBP · London time · set by the account/);
});

test("Change account on a connected row opens the accounts it could use, itself chosen, and Cancel puts them away", () => {
  withExample("running");
  let tree = draw();
  assert.ok(byTestId(tree, "ad-change-meta"), "Meta has other accounts to change to");
  assert.equal(byTestId(tree, "ad-change-google"), null, "Google has none");
  press(byTestId(tree, "ad-change-meta"));
  tree = redraw();
  const options = all(byTestId(tree, "ad-choose-meta"), (n) => n.props?.role === "radio");
  assert.equal(options.length, 3);
  assert.deepEqual(
    options.map((o) => o.props["aria-checked"]),
    [true, false, false],
    "the account in use is the one chosen",
  );
  press(all(byTestId(tree, "ad-choose-meta"), (n) => n.type === "button" && /Cancel/.test(textOf(n)))[0]);
  assert.equal(byTestId(redraw(), "ad-choose-meta"), null);
});

test("the owner's setting turns on and off, and says what it will do each time", () => {
  withExample("running");
  let tree = draw();
  press(byTestId(tree, "ad-pause-switch"));
  tree = redraw();
  assert.equal(byTestId(tree, "ad-pause-switch").props["aria-checked"], true);
  assert.equal(flashes.at(-1).msg, "If the way in closes, Chanlytics will pause your ads.");
  press(byTestId(tree, "ad-pause-switch"));
  assert.equal(flashes.at(-1).msg, "If the way in closes, Chanlytics will tell you.");
});
