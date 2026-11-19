/**
 * The ad account's card (the Ads plan, 4.3; the canvas's Flow and Step2 boards): one card for every state the
 * connection can be in, as a model (apps/dashboard/src/surfaces/campaigns/ads/connect/card-model.ts) over what the
 * server answers (contracts AdAccountDto) and what came back from Meta's window. And the five checks themselves, read
 * in one place from what is kept of an account and the number AI answers (contracts adCardChecksOf).
 *
 * What must hold: the card says one thing at a time, in the canvas's words; a check that is not met names its one act;
 * nothing is said in a provider's code; and the coral button is Connect, Connect again, or absent, never a dead press.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { connectCard, currencyWords } = await import(
  at("apps/dashboard/src/surfaces/campaigns/ads/connect/card-model.ts")
);
const { adCardChecksOf, adStandingOf, metaAdConfigOf } = await import(at("packages/contracts/src/ads/account.ts"));

const MOMENT = { outcome: null, checking: false, timezone: "America/New_York" };
const READY = ["account-active", "payment", "page-linked", "whatsapp-linked", "chanlytics-whatsapp"].map((id) => ({
  id,
  ok: true,
}));
const without = (...ids) => READY.map((check) => (ids.includes(check.id) ? { ...check, ok: false } : check));

const account = (over = {}) => ({
  id: "acc-1",
  external_id: "1200000000000042",
  status: "connected",
  standing: "active",
  name: "Harbor",
  currency: "USD",
  page_name: "Harbor Nails",
  connected_at: "2026-11-18T15:00:00Z",
  revoked_at: null,
  disconnected_at: null,
  read_at: "2026-11-19T14:00:00Z",
  read_failed: false,
  spend_limit_minor: null,
  instagram_handle: null,
  ai_number: "+15550100142",
  checks: READY,
  can_pause: true,
  reads_instagram: true,
  choices: [],
  ...over,
});
const dto = (meta, over = {}) => ({ offered: true, can_connect: true, meta, ...over });
const card = (meta, moment = {}, over = {}) => connectCard(dto(meta, over), { ...MOMENT, ...moment });

test("until the account is read the card says nothing", () => {
  assert.equal(connectCard(null, MOMENT), null);
});

test("nothing connected: what connecting does, who is charged, and Connect for the owner alone", () => {
  const owner = card(null);
  assert.deepEqual([owner.state, owner.word, owner.button], ["none", "Not connected", "Connect"]);
  assert.deepEqual(
    owner.says.map((said) => [said.text, said.strong]),
    [
      [
        "Chanlytics reads your ads and what they cost, and pauses one when you press it. It makes an ad only when you press Turn on.",
        false,
      ],
      ["Meta charges your card, never Chanlytics.", true],
    ],
  );
  assert.equal(owner.need, null);
  const member = card(null, {}, { can_connect: false });
  assert.deepEqual([member.button, member.says.at(1).text], [null, "Only the owner can connect an ad account."]);
  const elsewhere = card(null, {}, { offered: false, can_connect: false });
  assert.deepEqual(
    [elsewhere.button, elsewhere.says.at(1).text],
    [null, "Connecting an ad account isn't available in this workspace yet."],
  );
});

test("back from Meta's window the card checks, line by line, and has no press", () => {
  const checking = card(null, { checking: true });
  assert.deepEqual(
    [checking.state, checking.word, checking.button, checking.need],
    ["checking", "Checking", null, null],
  );
  assert.deepEqual(
    checking.checks.map((check) => [check.label, check.state]),
    [
      ["Ad account is active", "unknown"],
      ["Payment method in Meta", "unknown"],
      ["Page", "unknown"],
      ["WhatsApp number linked to the Page", "unknown"],
      ["That number is the one AI answers", "unknown"],
    ],
  );
  assert.equal(checking.quiet, "A few seconds. It goes on by itself.");
});

test("connected and ready: who Meta charges, the Page, Meta's own limit, and nothing missing", () => {
  const ready = card(account());
  assert.deepEqual(
    [ready.state, ready.word, ready.ready, ready.need, ready.button],
    ["connected", "Connected", null, null, null],
  );
  assert.deepEqual(
    ready.facts.map((fact) => [fact.label, fact.value, fact.door?.words ?? null]),
    [
      ["Meta charges", "Harbor · US dollars", null],
      ["Runs as", "Harbor Nails", null],
      ["Meta's limit", "None", "Set one in Meta"],
    ],
  );
  assert.match(ready.facts.at(2).door.href, /^https:\/\/business\.facebook\.com\//);
  assert.equal(ready.connectedOn, "Connected Wed 18 Nov");
  assert.equal(
    ready.quiet,
    "Reading your ads and Pause need only the connection. No Instagram account is linked to your Page, and nothing here stops for it.",
  );
  const limited = card(account({ spend_limit_minor: 50000, instagram_handle: "harbor.nails" }));
  assert.deepEqual([limited.facts.at(2).value, limited.facts.at(2).door], ["$500", null]);
  assert.match(limited.quiet, /Your Page is linked to @harbor\.nails on Instagram\.$/);
});

test("one thing missing: the rest folds into a count, and the first check not met says its one act", () => {
  const noCard = card(account({ checks: without("payment", "whatsapp-linked", "chanlytics-whatsapp") }));
  assert.equal(noCard.ready, "2 of 5 ready");
  assert.deepEqual(
    [noCard.need.title, noCard.need.line, noCard.need.act.words, noCard.need.act.kind, noCard.need.tone],
    [
      "Meta has no card on file for this ad account",
      "No ad can be turned on until it does. Chanlytics looks again when you come back.",
      "Add it in Meta",
      "meta",
      "warn",
    ],
  );
  assert.match(noCard.need.act.href, /asset_id=1200000000000042/);

  const unlinked = card(account({ checks: without("whatsapp-linked", "chanlytics-whatsapp") }));
  assert.equal(unlinked.ready, "3 of 5 ready");
  assert.deepEqual(
    [unlinked.need.title, unlinked.need.line, unlinked.need.act.words],
    [
      "Your Page isn't linked to your WhatsApp number",
      "No new ad can be made until it is linked to +1 (555) 010-0142, the number AI answers.",
      "Link them",
    ],
  );

  const otherNumber = card(account({ checks: without("chanlytics-whatsapp") }));
  assert.equal(otherNumber.need.title, "Your Page is linked to another WhatsApp number");
  const noWhatsApp = card(account({ ai_number: null, checks: without("chanlytics-whatsapp") }));
  assert.deepEqual(
    [noWhatsApp.need.title, noWhatsApp.need.act.words, noWhatsApp.need.act.kind, noWhatsApp.need.act.to],
    ["AI doesn't answer a WhatsApp number yet", "Connect WhatsApp", "route", "admin/integrations"],
  );
});

test("an account Meta turned off, one it could not charge, and one the sign-in may only look at", () => {
  const off = card(account({ standing: "disabled", checks: without("account-active") }));
  assert.deepEqual([off.need.title, off.need.act.words], ["Meta has this ad account turned off", "Open Meta"]);
  const unpaid = card(account({ standing: "unsettled", checks: without("account-active") }));
  assert.deepEqual(
    [unpaid.need.title, unpaid.need.act.words],
    ["Meta couldn't charge this ad account's card", "Pay it in Meta"],
  );
  const looking = card(account({ can_pause: false }));
  assert.deepEqual(
    [looking.need.title, looking.need.act.words],
    ["You can see this ad account, but not run ads on it", "Use another ad account"],
  );
});

test("a look that failed says so with when the card was last brought up to date, and keeps what it knew", () => {
  const stale = card(account({ read_failed: true }));
  assert.equal(stale.stale, "Couldn't update · Updated Thu 19 Nov");
  assert.equal(stale.facts.length, 3);
  assert.equal(card(account()).stale, null);
});

test("the one question: the likelier account first and picked, with why", () => {
  const choices = [
    { external_id: "1200000000000041", name: "Harbor", currency: "USD", timezone: "America/New_York", runs_page: true },
    {
      external_id: "1200000000000042",
      name: "Harbor UK",
      currency: "GBP",
      timezone: "Europe/London",
      runs_page: false,
    },
  ];
  const asked = card(
    account({ status: "choosing", name: null, currency: null, external_id: null, checks: [], choices }),
  );
  assert.deepEqual([asked.state, asked.word, asked.button], ["question", "One question", null]);
  assert.equal(asked.question.title, "Two ad accounts could run your ads");
  assert.equal(asked.question.picked, "1200000000000041");
  assert.deepEqual(
    asked.question.options.map((option) => [option.title, option.line]),
    [
      ["Harbor · US dollars", "Your Page's ads run from it"],
      ["Harbor UK · British pounds", "Your Page's ads haven't run from it"],
    ],
  );
});

test("what came back from Meta's window with nothing connected: what happened, and the one thing to do", () => {
  const closed = card(null, { outcome: "closed" });
  assert.deepEqual(
    [closed.need.title, closed.need.line, closed.need.act, closed.need.tone, closed.button],
    [
      "Nothing was connected",
      "Meta's window closed before it finished. Nothing was shared and nothing changed. Connect is still at the top.",
      null,
      "calm",
      "Connect",
    ],
  );
  const none = card(null, { outcome: "no_account" });
  assert.deepEqual(
    [none.need.title, none.need.act.words, none.need.act.kind],
    ["Meta shared no ad account", "Make one in Meta", "meta"],
  );
  const taken = card(null, { outcome: "ad_account_taken" });
  assert.deepEqual(
    [taken.need.title, taken.need.act.words, taken.need.act.kind],
    ["This ad account is connected to another workspace", "Use another ad account", "connect"],
  );
  // Any other word a refusal carries is never shown: the card says what it means for the owner.
  for (const code of ["exchange_failed", "edge_502", "state_expired", "XX000"]) {
    const other = card(null, { outcome: code });
    assert.deepEqual([other.need.title, other.need.act], ["Couldn't connect", null]);
    assert.ok(!JSON.stringify(other).includes(code), `${code} never reaches the card`);
  }
});

test("signed out by Meta the button is Connect again; disconnected it is Connect; a member sees neither", () => {
  const signedOut = card(account({ status: "revoked", revoked_at: "2026-11-14T10:00:00Z" }));
  assert.deepEqual([signedOut.state, signedOut.word, signedOut.button], ["signed-out", "Signed out", "Connect again"]);
  const left = card(account({ status: "disconnected", disconnected_at: "2026-11-18T10:00:00Z" }));
  assert.deepEqual([left.state, left.word, left.button], ["left", "Not connected", "Connect"]);
  assert.equal(card(account({ status: "revoked" }), {}, { can_connect: false }).button, null);
});

test("a currency is said as a person says it, and one the runtime does not know is said as its code", () => {
  assert.equal(currencyWords("USD"), "US dollars");
  assert.equal(currencyWords("GBP"), "British pounds");
  assert.equal(currencyWords("JPY"), "Japanese yen");
  assert.equal(currencyWords("not a currency"), "not a currency");
});

test("the five checks are read from what is kept of the account and the number AI answers", () => {
  const kept = (standing, config, aiNumber = "+15550100142") =>
    adCardChecksOf({ standing: adStandingOf(standing), config: metaAdConfigOf(config), aiNumber }).map(
      (check) => check.ok,
    );
  const page = { page_id: "100200300400500", page_whatsapp: "15550100142" };
  assert.deepEqual(kept({ account: "active", funding: "ok" }, page), [true, true, true, true, true]);
  // An account that still shows ads while a payment settles is active; any other standing is not.
  assert.deepEqual(kept({ account: "grace", funding: "none" }, page), [true, false, true, true, true]);
  assert.deepEqual(kept({ account: "disabled", funding: "ok" }, page).at(0), false);
  // Not read yet is not known, never "missing".
  assert.deepEqual(kept({}, page).slice(0, 2), [null, null]);
  assert.deepEqual(kept({ account: "active", funding: "ok" }, {}), [true, true, false, false, false]);
  assert.deepEqual(kept({ account: "active", funding: "ok" }, { ...page, page_whatsapp: "15550109999" }), [
    true,
    true,
    true,
    true,
    false,
  ]);
  assert.deepEqual(kept({ account: "active", funding: "ok" }, page, null).at(4), false, "AI answers no number");
  // What is kept is read defensively: an odd value is left out alone.
  assert.deepEqual(adStandingOf({ account: "thriving", funding: "ok" }), { funding: "ok" });
  assert.deepEqual(metaAdConfigOf({ page_id: 7, choices: [{ external_id: "1" }], scopes: ["ads_read", 3] }), {
    business_id: null,
    page_id: null,
    page_name: null,
    page_whatsapp: null,
    instagram_handle: null,
    spend_limit_minor: null,
    min_daily_minor: null,
    choices: [],
    scopes: ["ads_read"],
    user_id: null,
  });
});

test("the card says nothing of an Instagram account where the sign-in may not read one", () => {
  const unread = card(account({ reads_instagram: false, instagram_handle: null }));
  assert.equal(unread.quiet, "Reading your ads and Pause need only the connection.");
  const read = card(account({ reads_instagram: true, instagram_handle: null }));
  assert.match(read.quiet, /No Instagram account is linked to your Page/);
});
