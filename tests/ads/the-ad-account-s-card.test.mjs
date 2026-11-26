/**
 * The ad account's card (the Ads plan, 4.3; the canvas's Flow and Step2 boards): one card for every state the
 * connection can be in, as a model (apps/dashboard/src/surfaces/campaigns/ads/connect/card-model.ts) over what the
 * server answers (contracts AdAccountDto) and what came back from Meta's window. And the three checks themselves, read
 * in one place from what is kept of an account (contracts adCardChecksOf): only what Chanlytics can read, so the count
 * can always be finished. The Page's link to the number AI answers is a quiet line, never a check (settled 20 Nov 2026).
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
const READY = ["account-active", "payment", "page-linked"].map((id) => ({
  id,
  ok: true,
}));
const without = (...ids) => READY.map((check) => (ids.includes(check.id) ? { ...check, ok: false } : check));

const account = (over = {}) => ({
  id: "acc-1",
  external_id: "1200000000000042",
  business_id: null,
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
  whatsapp_link: "unsaid",
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
        "Chanlytics reads your ads and their cost, and pauses one when you press it. It makes an ad only when you press Turn on.",
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
    ],
  );
  assert.equal(checking.quiet, "A few seconds. It goes on by itself.");
  assert.equal(checking.whatsapp, null, "nothing is said of WhatsApp before an account is read");
});

test("connected and ready: the ad account, its Page, Meta's limit, where people reach you, and nothing missing", () => {
  const ready = card(account());
  assert.deepEqual(
    [ready.state, ready.word, ready.ready, ready.need, ready.button],
    ["connected", "Connected", null, null, null],
  );
  assert.deepEqual(
    ready.facts.map((fact) => [fact.label, fact.value, fact.door?.words ?? null]),
    [
      ["Ad account", "Harbor · US dollars", null],
      ["Page", "Harbor Nails", null],
      ["Spending limit", "None", "Set in Meta"],
    ],
  );
  // Where the people an ad brings reach the business: the number AI answers, and what is known of the Page's link to it.
  assert.deepEqual(ready.reach, [
    { label: "WhatsApp", value: "+1 (555) 010-0142", note: "Meta checks it's linked when an ad is made", door: null },
    { label: "Instagram", value: "None linked", door: null },
  ]);
  assert.match(ready.facts.at(2).door.href, /^https:\/\/business\.facebook\.com\//);
  assert.equal(ready.connectedOn, "Connected Wed 18 Nov");
  assert.equal(
    ready.quiet,
    "Reading your ads and Pause need only the connection. No Instagram account is linked to your Page, and nothing here stops for it.",
  );
  const limited = card(account({ spend_limit_minor: 50000, instagram_handle: "harbor.nails" }));
  assert.deepEqual([limited.facts.at(2).value, limited.facts.at(2).door], ["$500", null]);
  assert.deepEqual(limited.reach.at(-1), { label: "Instagram", value: "@harbor.nails", door: null });
  assert.match(limited.quiet, /Your Page is linked to @harbor\.nails on Instagram\.$/);
});

test("one thing missing: the rest folds into a count, and the first check not met says its one act", () => {
  const noCard = card(account({ checks: without("payment", "page-linked") }));
  assert.equal(noCard.ready, "1 of 3 ready");
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

  const noPage = card(account({ checks: without("page-linked") }));
  assert.deepEqual([noPage.ready, noPage.need.title, noPage.need.act], ["2 of 3 ready", "Meta shared no Page", null]);

  // A standing Meta has not said yet is not known: its dot turns, nothing is asked of the owner, and the count waits.
  const unread = card(
    account({ checks: READY.map((check) => (check.id === "payment" ? { ...check, ok: null } : check)) }),
  );
  assert.equal(unread.need, null);
  assert.equal(unread.ready, "2 of 3 ready");
  assert.deepEqual(
    unread.checks.map((check) => check.state),
    ["ok", "unknown", "ok"],
  );
});

test("the Page's WhatsApp number is a quiet line, never a count that could not be finished", () => {
  // Meta named no WhatsApp number (it names one only to an app with its Page Public Content or Metadata Access): the
  // card is ready and says Meta's own check of an ad settles the link. Before 20 Nov 2026 it read "3 of 5" forever.
  const unsaid = card(account());
  assert.deepEqual([unsaid.ready, unsaid.need], [null, null]);
  assert.deepEqual(
    unsaid.checks.map((check) => check.label),
    ["Ad account is active", "Payment method in Meta", "Page"],
  );
  assert.equal(
    unsaid.whatsapp,
    "Meta doesn't share whether your Page is linked to +1 (555) 010-0142, the number AI answers. Meta checks it when an ad is made.",
  );
  assert.equal(
    card(account({ whatsapp_link: "ai_number" })).whatsapp,
    "Your Page is linked to +1 (555) 010-0142, the number AI answers.",
  );
  // AI answers no number: still no check and no stop on the card (New ad asks for one, the plan's G13), said plainly.
  const none = card(account({ ai_number: null, whatsapp_link: "no_number" }));
  assert.deepEqual([none.ready, none.need], [null, null]);
  assert.equal(
    none.whatsapp,
    "AI doesn't answer a WhatsApp number yet, and an ad opens a WhatsApp chat. Connect one before making an ad.",
  );
  // Signed out or disconnected, the card says nothing of a link it cannot use.
  assert.equal(card(account({ status: "revoked" })).whatsapp, null);
});

test("an account Meta turned off, one it could not charge, and one the sign-in may only look at", () => {
  const off = card(account({ standing: "disabled", checks: without("account-active") }));
  assert.deepEqual([off.need.title, off.need.act.words], ["Meta has this ad account turned off", "Open Meta"]);
  // "Open Meta" opens the account's own page, where Meta says why and the review is asked for, where both ids are kept;
  // Meta's general page where the business is not.
  assert.equal(
    card(account({ standing: "disabled", checks: without("account-active"), business_id: "583355900000001" })).need.act
      .href,
    "https://business.facebook.com/business-support-home/583355900000001/1200000000000042/?business_id=583355900000001",
  );
  assert.equal(off.need.act.href, "https://business.facebook.com/accountquality");
  const unpaid = card(account({ standing: "unsettled", checks: without("account-active") }));
  assert.deepEqual(
    [unpaid.need.title, unpaid.need.act.words],
    ["Meta couldn't charge this ad account's card", "Pay it in Meta"],
  );
  // A sign-in Meta let read and not change (a business connecting between Meta's two reviews): a calm fact, with no
  // act, since connecting again would ask the same and get the same; it stands before a check that is not met.
  const looking = card(account({ can_pause: false, checks: without("payment") }));
  assert.deepEqual(
    [looking.need.title, looking.need.tone, looking.need.act],
    ["Chanlytics can show these ads, not change them yet", "calm", null],
  );
  assert.match(looking.need.line, /^Meta hasn't approved Chanlytics to pause or make ads yet\./);
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
  // Shared, and Meta would not describe it: said as unread, never as none shared, and Connect again is the one act.
  const unread = card(null, { outcome: "accounts_unreadable" });
  assert.deepEqual(
    [unread.need.title, unread.need.line, unread.need.act.words, unread.need.act.kind],
    [
      "Couldn't read your ad account",
      "Meta shared it, but didn't let Chanlytics read it, so nothing was kept. Connect again in a few minutes.",
      "Connect again",
      "connect",
    ],
  );
  // Meta's window took longer than the way there and back may: nothing kept here, what was made in Meta stays.
  const late = card(null, { outcome: "state_expired" });
  assert.deepEqual(
    [late.need.title, late.need.act.words, late.need.act.kind],
    ["Connect took too long", "Connect again", "connect"],
  );
  const taken = card(null, { outcome: "ad_account_taken" });
  assert.deepEqual(
    [taken.need.title, taken.need.act.words, taken.need.act.kind],
    ["This ad account is connected to another workspace", "Use another ad account", "connect"],
  );
  // Any other word a refusal carries is never shown: the card says what it means for the owner.
  for (const code of ["exchange_failed", "edge_502", "state_signature", "XX000"]) {
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

test("the three checks are read from what is kept of the account", () => {
  const kept = (standing, config) =>
    adCardChecksOf({ standing: adStandingOf(standing), config: metaAdConfigOf(config) }).map((check) => check.ok);
  const page = { page_id: "100200300400500", page_whatsapp: "15550100142" };
  assert.deepEqual(kept({ account: "active", funding: "ok" }, page), [true, true, true]);
  // An account that still shows ads while a payment settles is active; any other standing is not.
  assert.deepEqual(kept({ account: "grace", funding: "none" }, page), [true, false, true]);
  assert.deepEqual(kept({ account: "disabled", funding: "ok" }, page).at(0), false);
  // Not read yet is not known, never "missing".
  assert.deepEqual(kept({}, page).slice(0, 2), [null, null]);
  assert.deepEqual(kept({ account: "active", funding: "ok" }, {}), [true, true, false], "no Page shared");
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

test("Disconnect says what is left on as what it is: an ad running, an ad Meta is still checking, or both", async () => {
  const { DISCONNECT } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/connect/words.ts"));
  // Running only: as the canvas draws it.
  assert.equal(DISCONNECT.on(["Spring offer"], []), "Spring offer is running.");
  assert.equal(DISCONNECT.on(["Spring offer", "Autumn offer"], []), "2 ads are running.");
  assert.equal(DISCONNECT.pauseFirst(1, 0), "Pause it first and it stops. Meta still bills what it already showed.");
  assert.equal(DISCONNECT.leaveTitle(1, 0), "Disconnect and leave it running?");
  assert.equal(DISCONNECT.staysOn(["Spring offer"], []), "Spring offer keeps running and Meta keeps charging");
  // One Meta is still checking: it is not running, and it starts by itself once approved.
  assert.equal(DISCONNECT.on([], ["Weekend offer"]), "Meta is still checking Weekend offer.");
  assert.equal(DISCONNECT.on([], ["Weekend offer", "Winter offer"]), "Meta is still checking 2 ads.");
  assert.equal(DISCONNECT.pauseFirst(0, 1), "Pause it first and it won't start when Meta approves it.");
  assert.equal(DISCONNECT.leaveTitle(0, 1), "Disconnect and leave it on?");
  assert.equal(
    DISCONNECT.staysOn([], ["Weekend offer"]),
    "Weekend offer starts when Meta approves it, and Meta charges while it runs",
  );
  // Both: one sentence each, and the button counts every ad it pauses.
  assert.equal(
    DISCONNECT.on(["Spring offer"], ["Weekend offer"]),
    "Spring offer is running, and Meta is still checking Weekend offer.",
  );
  assert.match(DISCONNECT.pauseFirst(1, 1), /what is running stops, and what Meta approves won't start/);
  assert.equal(DISCONNECT.leaveTitle(1, 1), "Disconnect and leave them on?");
  assert.equal(
    DISCONNECT.staysOn(["Spring offer"], ["Weekend offer"]),
    "2 ads stay on: Meta keeps charging for what runs, and what it approves starts",
  );
  assert.equal(DISCONNECT.pauseAndGo(2), "Pause 2 ads and disconnect");
});
