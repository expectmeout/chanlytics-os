/**
 * Settings › Cold email (decisions 0113, 0116), EXECUTED on the stub React over the business tab's harness: its cards in
 * their order, a box that opens on what its row shows and stores it only once changed, a row saved as one key of the
 * config's reach_out section and nothing else, a signature refused in the page's words, what a reply sets off with only
 * one row the owner's, and the rail that lists it. Every claim is something the page drew, or something a press on it sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { REACH_OUT_REFUSAL_WORDS } from "@chanlytics/contracts";
import { unmount, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import {
  drawTab,
  foldOf,
  openFold,
  openFolds,
  redrawTab,
  saveFoldOf,
  saving,
  went,
} from "../../_business-tab-harness.mjs";
import {
  SET_TAB,
  SET_TABS,
  paneOfRow,
  settingsRowRoute,
} from "../../../apps/dashboard/src/surfaces/settings/frame/tabs.ts";
import { until } from "../../shared/_until.mjs";

after(() => unmount());

const REACH_OUT = {
  offer: "After-hours cleaning for dental offices.",
  proof: ["We clean 40 clinics across Austin today."],
  signed_by: "Maya",
};
const page = (reachOut = REACH_OUT) => drawTab({ part: "outreach", config: reachOut ? { reach_out: reachOut } : {} });
const boxIn = (tree, fold) =>
  find(foldOf(tree, fold), (n) => (n.type === "input" || n.type === "textarea") && classes(n).includes("rec-input"));
const typeIn = (tree, fold, text) => boxIn(tree, fold).props.onChange({ target: { value: text } });

// The cards are a chunk of their own (business/tab.tsx), fetched as the page is first drawn: the page's other tests
// draw them once it is in, and this one holds that the first draw asks for it and draws them as it lands.
page();
await until(() => byTestId(redrawTab(), "rec-card-pitch") !== null, "Cold email's cards, fetched as drawn");

test("the page says under its name what it is for", () => {
  assert.equal(
    textOf(byTestId(page(), "rec-outreach-sub")),
    "What Chanlytics says when it writes to businesses for you.",
  );
});

test("the page draws its cards in the order a person needs them", () => {
  const cards = all(page(), (n) => n.type === "section" && classes(n).includes("rec-card")).map(
    (n) => n.props["data-testid"],
  );
  assert.deepEqual(cards, [
    "rec-standing",
    "rec-card-sample",
    "rec-card-pitch",
    "rec-card-facts",
    "rec-card-sound",
    "rec-card-ending",
    "rec-card-sending",
    "rec-card-replies",
    "rec-card-never",
    "rec-card-kept",
  ]);
});

/** The page's own read, landed, as the cards draw from it; each test here says the part it is about. */
const READ = {
  standing: {
    kind: "sending",
    headline: "Sending",
    detail: "Clinics · Austin: 34 sent, 5 replies, 2 interested",
    act: null,
    to: "campaigns/sequences/r",
    needs_you: false,
    steps: [],
  },
  sending: {
    from: "maya@brightlinecleaning.example",
    more: 0,
    health: "healthy",
    pace: "10 a day now, 20 after 7 more days of sending",
    ceiling: null,
    checks: [{ ok: true, title: "Your domain is set up to send", detail: "Its email records are in place" }],
    today: { sent: 7, cap: 10 },
    month: "34 sent, of 2,000 included",
    customer_host: null,
  },
  batch_mode: "veto",
  mailbox: null,
  month: { sent: 0, of: 2000 },
  by_hand_per_day: 30,
  claims: [],
  voice: [],
  sequence: null,
  reply_mode: "ask",
  about: null,
  about_from: null,
  known: { name: null, first_name: null, newest_search: null },
  foot: { business: "Brightline Cleaning", address: "1 Main St, Austin, TX 78704" },
  never: { said_no: 0, asked_to_stop: 0 },
};
/**
 * The page drawn with its read answering `read`, once what the test is about is on it: a page takes what the tab holds as
 * its first draw and reads again behind it, and a read still out from the last draw would answer the next one.
 */
const drawOnRead = async (config, read, landed) => {
  globalThis.window.fetch = (url) =>
    Promise.resolve(
      String(url).includes("settings/reach-out")
        ? new Response(JSON.stringify({ ok: true, data: { ...READ, ...read } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ ok: false }), { status: 500 }),
    );
  await until(() => landed(drawTab({ part: "outreach", config })), "the page's read");
  return redrawTab();
};
const GOAL = { ask: { goal: "Twenty new clinics a month" } };

test("a row with nothing set says what the writers read in its place, and its box opens on those words", () => {
  const tree = drawTab({ part: "outreach", config: GOAL });
  assert.match(textOf(byTestId(tree, "rec-card-pitch")), /Twenty new clinics a month/);
  assert.match(textOf(byTestId(tree, "rec-card-pitch")), /Read from your goal on Details, until you write it here\./);
  openFold(tree, "offer");
  const opened = redrawTab();
  assert.equal(boxIn(opened, "offer").props.value, "Twenty new clinics a month");
  assert.match(textOf(foldOf(opened, "offer")), /Read from your goal/, "and says where they came from");
});

test("those words saved as they stand store nothing, and the box closes", () => {
  const sent = saving();
  let tree = drawTab({ part: "outreach", config: GOAL });
  openFold(tree, "offer");
  tree = redrawTab();
  saveFoldOf(tree, "offer");
  assert.equal(sent.length, 0, "opened and saved");
  assert.deepEqual(openFolds(redrawTab()), []);
  // Changed and changed back is the same: they are still not the owner's.
  openFold(redrawTab(), "offer");
  tree = redrawTab();
  typeIn(tree, "offer", "Something else");
  tree = redrawTab();
  typeIn(tree, "offer", "Twenty new clinics a month");
  tree = redrawTab();
  saveFoldOf(tree, "offer");
  assert.equal(sent.length, 0, "typed back to what it opened on");
});

test("a word changed in those words makes them the owner's, and only that key is stored", () => {
  const sent = saving();
  let tree = drawTab({ part: "outreach", config: GOAL });
  openFold(tree, "offer");
  tree = redrawTab();
  typeIn(tree, "offer", "Twenty new dental clinics a month");
  tree = redrawTab();
  saveFoldOf(tree, "offer");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].config.reach_out, { offer: "Twenty new dental clinics a month" });
});

test("those words cleared store nothing either: the writers go on reading them, and the row says so", () => {
  const sent = saving();
  let tree = drawTab({ part: "outreach", config: GOAL });
  openFold(tree, "offer");
  tree = redrawTab();
  typeIn(tree, "offer", "");
  tree = redrawTab();
  saveFoldOf(tree, "offer");
  assert.equal(sent.length, 0);
  assert.match(textOf(byTestId(redrawTab(), "rec-card-pitch")), /Twenty new clinics a month/);
});

test("what the website says of the business stands in the row, named as the website's", async () => {
  let tree = await drawOnRead(GOAL, { about: "Evening cleaning for clinics.", about_from: "website" }, (t) =>
    /Evening cleaning for clinics\./.test(textOf(byTestId(t, "rec-card-pitch"))),
  );
  assert.match(textOf(byTestId(tree, "rec-card-pitch")), /Read from your website, until you write it here\./);
  openFold(tree, "offer");
  tree = redrawTab();
  assert.equal(boxIn(tree, "offer").props.value, "Evening cleaning for clinics.");
});

const SEQUENCE_SIGNED_MAYA = {
  root_id: "r",
  name: "Clinics",
  search_id: null,
  include_unconfirmed: false,
  signed_by: "Maya",
  signs_with: "name",
  mailbox_id: null,
  first: { subject: null, body: "Hello" },
  next: null,
};
/** One box of the ending's sheet. */
const endBox = (tree, field) =>
  find(byTestId(tree, `rec-${field}-box`), (n) => n.type === "input" || n.type === "textarea");

test("the tone and the name stand in their rows and open in their boxes too, and stored words open as they are", async () => {
  let tree = await drawOnRead(
    { brain: { profile: { tone: "Warm and short" } } },
    { sequence: SEQUENCE_SIGNED_MAYA },
    (t) => !!byTestId(t, "rec-ending-lines"),
  );
  openFold(tree, "sound");
  tree = redrawTab();
  assert.equal(boxIn(tree, "sound").props.value, "Warm and short");
  openFold(tree, "ending");
  tree = redrawTab();
  assert.equal(endBox(tree, "signed_by").props.value, "Maya");
  tree = page({ tone: "Plain", signed_by: "Sam" });
  openFold(tree, "sound");
  assert.equal(boxIn(redrawTab(), "sound").props.value, "Plain");
});

test("no empty box holds a made-up answer: each says what to put there", () => {
  const said = {
    offer: "What you sell, and what a business gets from it",
    who_for: "The kind of business you want to reach, and where",
    fixes: "The problem they have that you solve",
  };
  for (const [fold, words] of Object.entries(said)) {
    const tree = drawTab({ part: "outreach", config: {} });
    openFold(tree, fold);
    assert.equal(boxIn(redrawTab(), fold).props.placeholder, words, fold);
  }
  openFold(drawTab({ part: "outreach", config: {} }), "ending");
  const tree = redrawTab();
  assert.equal(endBox(tree, "signature").props.placeholder, "Your name, your role, your business");
  assert.equal(endBox(tree, "phone").props.placeholder, "A number people can reach you on");
});

test("a box of sentences grows with its words, and a name or a number is one line with the right keys", () => {
  for (const fold of ["offer", "who_for", "fixes", "sound"]) {
    openFold(drawTab({ part: "outreach", config: {} }), fold);
    const box = boxIn(redrawTab(), fold);
    assert.equal(box.type, "textarea", fold);
    assert.ok(classes(box).includes("rec-input-grows"), fold);
  }
  openFold(drawTab({ part: "outreach", config: {} }), "ending");
  const tree = redrawTab();
  const under = endBox(tree, "signature");
  assert.equal(under.type, "textarea");
  assert.ok(classes(under).includes("rec-input-grows"));
  const name = endBox(tree, "signed_by");
  assert.equal(name.type, "input");
  assert.equal(name.props.autoComplete, "name");
  const phone = endBox(tree, "phone");
  assert.equal(phone.type, "input");
  assert.equal(phone.props.inputMode, "tel");
  assert.equal(phone.props.autoComplete, "tel");
});

test("what is already known is offered under an empty box with one press, and never put there by itself", async () => {
  const known = { name: "Maya Ortiz", first_name: "Maya", newest_search: "Clinics in Austin" };
  const config = { brain: { business_name: "Brightline", phone_display: "(512) 555-0142" } };
  {
    const sent = saving();
    let tree = await drawOnRead(config, { known }, (t) => {
      openFold(t, "who_for");
      return !!byTestId(redrawTab(), "rec-who_for-use");
    });
    assert.equal(boxIn(tree, "who_for").props.value, "", "who_for opens empty");
    assert.equal(textOf(byTestId(tree, "rec-who_for-use")), "Use Clinics in Austin");
    press(byTestId(tree, "rec-who_for-use"));
    tree = redrawTab();
    assert.equal(boxIn(tree, "who_for").props.value, "Clinics in Austin");
    assert.equal(byTestId(tree, "rec-who_for-use"), null, "and has nothing left to offer");
    saveFoldOf(tree, "who_for");
    assert.equal(sent.length, 1);
    unmount();
  }
  const sent = saving();
  let tree = await drawOnRead(config, { known }, (t) => {
    openFold(t, "ending");
    return !!byTestId(redrawTab(), "rec-signed_by-use");
  });
  for (const [field, words] of [
    ["signed_by", "Maya"],
    ["signature", "Maya Ortiz, Brightline"],
    ["phone", "(512) 555-0142"],
  ]) {
    assert.equal(endBox(tree, field).props.value, "", `${field} opens empty`);
    assert.equal(textOf(byTestId(tree, `rec-${field}-use`)), `Use ${words}`);
    press(byTestId(tree, `rec-${field}-use`));
    tree = redrawTab();
    assert.equal(endBox(tree, field).props.value, words, `${field} takes it`);
    assert.equal(byTestId(tree, `rec-${field}-use`), null, "and has nothing left to offer");
  }
  saveFoldOf(tree, "ending");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].config.reach_out, {
    signed_by: "Maya",
    signature: "Maya Ortiz, Brightline",
    phone: "(512) 555-0142",
  });
  unmount();
});

test("the ending opened on the name a sequence signs with, saved as it stands, stores nothing", async () => {
  const sent = saving();
  let tree = await drawOnRead({}, { sequence: SEQUENCE_SIGNED_MAYA }, (t) => !!byTestId(t, "rec-ending-lines"));
  openFold(tree, "ending");
  tree = redrawTab();
  assert.match(textOf(foldOf(tree, "ending")), /From your newest sequence/);
  saveFoldOf(tree, "ending");
  assert.equal(sent.length, 0);
  unmount();
});

test("the ending's row is what is sent, and never claims an address the business has not added", async () => {
  const config = { reach_out: { signed_by: "Maya", signature: "Maya Ortiz, Owner", phone: "(512) 555-0148" } };
  let tree = await drawOnRead(config, { foot: { business: "Brightline Cleaning", address: "1 Main St" } }, (t) =>
    /The law asks for them/.test(textOf(byTestId(t, "rec-card-ending"))),
  );
  assert.equal(textOf(byTestId(tree, "rec-ending-lines")), "MayaMaya Ortiz, Owner(512) 555-0148");
  openFold(tree, "ending");
  tree = redrawTab();
  const sheet = textOf(byTestId(tree, "rec-ending-preview"));
  assert.match(sheet, /I found your business on Google Maps\./);
  assert.match(sheet, /This is a marketing email\./);
  assert.match(sheet, /Brightline Cleaning · 1 Main St/);
  assert.match(sheet, /no thanks/);
  unmount();
  tree = await drawOnRead(config, { foot: { business: "Brightline Cleaning", address: null } }, (t) =>
    /No address yet/.test(textOf(byTestId(t, "rec-card-ending"))),
  );
  assert.doesNotMatch(textOf(byTestId(tree, "rec-card-ending")), /The law asks for them/);
  unmount();
});

test("How you sound is one sheet: the tone, what was learned, and the way to teach it more", async () => {
  const voice = [
    { id: "1", text: "Short sentences, no exclamation marks" },
    { id: "2", text: "Opens with the point" },
  ];
  let tree = await drawOnRead({ reach_out: { tone: "Direct" } }, { voice }, (t) =>
    /Plus 2 things learned from your emails/.test(textOf(byTestId(t, "rec-card-sound"))),
  );
  openFold(tree, "sound");
  tree = redrawTab();
  const lines = textOf(byTestId(tree, "rec-cold-voice-lines"));
  assert.match(lines, /Short sentences/);
  assert.match(lines, /Opens with the point/);
  assert.match(textOf(byTestId(tree, "rec-sound-note")), /Your receptionist keeps its own voice\./);
  assert.ok(byTestId(tree, "rec-sound-paste"));
  unmount();
});

test("a box says how much of it is used only as it nears its limit, and a signature always says its rule", () => {
  let tree = drawTab({ part: "outreach", config: {} });
  openFold(tree, "offer");
  tree = redrawTab();
  typeIn(tree, "offer", "x".repeat(1599));
  assert.doesNotMatch(textOf(foldOf(redrawTab(), "offer")), /of 2,000/);
  typeIn(redrawTab(), "offer", "x".repeat(1600));
  assert.match(textOf(foldOf(redrawTab(), "offer")), /1,600 of 2,000/);
  unmount();
  openFold(drawTab({ part: "outreach", config: {} }), "ending");
  assert.match(textOf(foldOf(redrawTab(), "ending")), /Up to 3 lines, no links\./);
});

test("with no claim yet the sheet opens on a box to type in, with nothing to take away", () => {
  const sent = saving();
  let tree = drawTab({ part: "outreach", config: {} });
  press(byTestId(tree, "rec-row-act-proof"));
  tree = redrawTab();
  const box = find(byTestId(tree, "rec-claim-0"), (n) => n.type === "textarea");
  assert.equal(box.props.value, "");
  assert.equal(byTestId(tree, "rec-claim-remove-0"), null);
  saveFoldOf(tree, "proof");
  assert.equal(sent.length, 0, "an empty box is no claim");
  press(byTestId(redrawTab(), "rec-row-act-proof"));
  tree = redrawTab();
  find(byTestId(tree, "rec-claim-0"), (n) => n.type === "textarea").props.onChange({
    target: { value: "We are insured." },
  });
  tree = redrawTab();
  saveFoldOf(tree, "proof");
  assert.deepEqual(sent[0].config.reach_out.proof, ["We are insured."]);
});

test("Add a claim opens the list with a box to type in, and Change opens it as it stands", () => {
  let tree = page();
  press(byTestId(tree, "rec-row-act-proof-add"));
  tree = redrawTab();
  assert.equal(find(byTestId(tree, "rec-claim-1"), (n) => n.type === "textarea").props.value, "");
  saveFoldOf(tree, "proof");
  tree = redrawTab();
  press(byTestId(tree, "rec-row-act-proof"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-claim-1"), null);
});

test("saving the offer sends that one key of reach_out, and nothing else of the config moves", () => {
  const sent = saving();
  let tree = page();
  const before = structuredClone(globalThis.window.__SETTINGS.config);
  openFold(tree, "offer");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["offer"]);
  typeIn(tree, "offer", "Evening cleaning for clinics, so mornings start spotless.");
  tree = redrawTab();
  saveFoldOf(tree, "offer");
  assert.equal(sent.length, 1);
  const expected = structuredClone(before);
  expected.reach_out.offer = "Evening cleaning for clinics, so mornings start spotless.";
  assert.deepEqual(sent[0].config, expected);
});

test("an emptied offer removes its key, and the section goes once nothing is in it", () => {
  const sent = saving();
  let tree = page({ offer: "Evening cleaning" });
  openFold(tree, "offer");
  tree = redrawTab();
  typeIn(tree, "offer", "   ");
  tree = redrawTab();
  saveFoldOf(tree, "offer");
  assert.equal("reach_out" in sent[0].config, false);
});

test("a claim saves into the list, and an empty one is dropped", () => {
  const sent = saving();
  let tree = page();
  openFold(tree, "proof");
  tree = redrawTab();
  press(byTestId(tree, "rec-proof-add"));
  tree = redrawTab();
  const second = find(byTestId(tree, "rec-claim-1"), (n) => n.type === "textarea");
  second.props.onChange({ target: { value: "Every cleaner is background-checked and insured." } });
  tree = redrawTab();
  press(byTestId(tree, "rec-proof-add"));
  tree = redrawTab();
  saveFoldOf(tree, "proof");
  assert.deepEqual(sent[0].config.reach_out.proof, [
    "We clean 40 clinics across Austin today.",
    "Every cleaner is background-checked and insured.",
  ]);
});

test("a signature with a link is refused under its box, in the page's words, and nothing is sent", () => {
  const sent = saving();
  let tree = page();
  openFold(tree, "ending");
  tree = redrawTab();
  endBox(tree, "signature").props.onChange({ target: { value: "Maya Ortiz · brightlinecleaning.com" } });
  tree = redrawTab();
  saveFoldOf(tree, "ending");
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.match(textOf(foldOf(tree, "ending")), new RegExp(REACH_OUT_REFUSAL_WORDS.signature));
});

test("what a reply sets off is one line and a sheet, and what it offers is the pitch's to change", () => {
  let tree = page();
  assert.ok(byTestId(tree, "rec-row-act-reply_offer"), "the offer's own row is on the pitch");
  assert.ok(find(byTestId(tree, "rec-card-pitch"), (n) => n.props?.["data-testid"] === "rec-row-act-reply_offer"));
  press(byTestId(tree, "rec-row-act-replies"));
  tree = redrawTab();
  const rows = textOf(byTestId(tree, "rec-replies-rows"));
  for (const words of ["Interested, or a question", "Not now", "No", "Wrong person", "Away"])
    assert.ok(rows.includes(words), words);
  press(byTestId(tree, "rec-reply-mode-door"));
  assert.equal(went.at(-1), "admin/autonomy");
});

test("the reply offer saves as one key, and the booking link, as before the page, is stored as nothing", () => {
  const sent = saving();
  let tree = page();
  openFold(tree, "reply_offer");
  tree = redrawTab();
  const choice = byTestId(tree, "rec-reply-offer-choice");
  find(
    choice,
    (n) => n.props?.["aria-checked"] !== undefined && /^Talk on a short call/.test(textOf(n)),
  ).props.onClick();
  tree = redrawTab();
  saveFoldOf(tree, "reply_offer");
  assert.equal(sent[0].config.reach_out.reply_offer, "call");
});

test("Connections is a door, never a setting of this page", async () => {
  let tree = await drawOnRead({}, {}, (t) => !!byTestId(t, "rec-sending-pill"));
  press(byTestId(tree, "rec-row-act-send_from"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sending-connections"));
  assert.equal(went.at(-1), "admin/integrations");
});

test("nothing offers sending by hand", async () => {
  const tree = await drawOnRead({}, {}, (t) => !!byTestId(t, "rec-sending-pill"));
  const words = textOf(tree);
  assert.doesNotMatch(words, /Without a mailbox/);
  assert.doesNotMatch(words, /To send/);
});

test("a read that could not decide draws no answer, and no address is called missing", async () => {
  const tree = await drawOnRead(
    {},
    { standing: null, sending: null, foot: null },
    (t) => byTestId(t, "rec-standing") === null,
  );
  assert.equal(byTestId(tree, "rec-standing"), null);
  assert.doesNotMatch(textOf(byTestId(tree, "rec-card-ending")), /No address yet/);
  assert.equal(byTestId(tree, "rec-sending-pill"), null);
  assert.match(textOf(byTestId(tree, "rec-row-send_from")), /Couldn't check just now/, "unknown, never still loading");
  assert.doesNotMatch(textOf(byTestId(tree, "rec-row-send_from")), /Not connected/);
  unmount();
});

test("where it stands is amber where it waits on the owner, quiet where it does not", async () => {
  const held = {
    kind: "held",
    headline: "Sending paused to protect your name",
    detail: "Fix it, then resume.",
    act: "See what to fix",
    to: "admin/integrations",
    needs_you: true,
    steps: [],
  };
  let tree = await drawOnRead({}, {}, (t) => textOf(byTestId(t, "rec-standing-head")) === "Sending");
  assert.equal(byTestId(tree, "rec-standing").props["data-needs"], "false");
  assert.equal(byTestId(tree, "rec-standing-act"), null, "sending has nothing to press");
  tree = await drawOnRead({}, { standing: held }, (t) =>
    /Sending paused/.test(textOf(byTestId(t, "rec-standing-head"))),
  );
  assert.equal(byTestId(tree, "rec-standing").props["data-needs"], "true");
  press(byTestId(tree, "rec-standing-act"));
  assert.equal(went.at(-1), "admin/integrations");
});

test("a new account's answer lists what is left, each with its own door", async () => {
  const steps = [
    { id: "mailbox", done: false, title: "Connect your mailbox", detail: "Emails go out from your own address" },
    { id: "address", done: true, title: "Add your business address", detail: "The law asks for it in every email" },
    { id: "people", done: false, title: "Find businesses to write to", detail: "Start with clinics" },
  ];
  const standing = {
    kind: "not_started",
    headline: "2 things before your first email",
    detail: null,
    act: null,
    to: null,
    needs_you: true,
    steps,
  };
  const tree = await drawOnRead({}, { standing }, (t) => !!byTestId(t, "rec-steps"));
  assert.ok(byTestId(tree, "rec-step-mailbox-door"));
  assert.equal(byTestId(tree, "rec-step-address-door"), null, "a step that is done has no door");
  press(byTestId(tree, "rec-step-people-door"));
  assert.equal(went.at(-1), "clients/leads");
});

const PITCH_STEP = {
  id: "pitch",
  done: false,
  title: "Say what you sell",
  detail: "So your emails have something to say",
};

test("what it sells is one of the things left: its door opens the pitch, and the page asks once", async () => {
  const standing = {
    kind: "not_started",
    headline: "1 thing before your first email",
    detail: null,
    act: null,
    to: null,
    needs_you: true,
    steps: [PITCH_STEP],
  };
  const tree = await drawOnRead({}, { standing }, (t) => !!byTestId(t, "rec-step-pitch"));
  assert.equal(byTestId(tree, "rec-offer-gap"), null, "the card's own list asks for it, so no second line does");
  press(byTestId(tree, "rec-step-pitch-door"));
  assert.deepEqual(openFolds(redrawTab()), ["offer"]);
  unmount();
});

test("past the first email, a page with nothing to sell still says so in its own line", async () => {
  const tree = await drawOnRead({}, {}, (t) => !!byTestId(t, "rec-standing-head") && !byTestId(t, "rec-steps"));
  assert.ok(byTestId(tree, "rec-offer-gap"));
  unmount();
});

test("someone who can only read is told so, and offered no press", async () => {
  const standing = {
    kind: "no_mailbox",
    headline: "Connect your mailbox to start sending",
    detail: null,
    act: "Connect Google",
    to: null,
    needs_you: true,
    steps: [],
  };
  const tree = await drawOnRead({}, { standing }, (t) => !!byTestId(t, "rec-standing-head"));
  assert.equal(byTestId(tree, "rec-viewer-note"), null, "an owner is not told");
  globalThis.window.fetch = (url) =>
    Promise.resolve(
      String(url).includes("settings/reach-out")
        ? new Response(JSON.stringify({ ok: true, data: { ...READ, standing } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ ok: false }), { status: 500 }),
    );
  const may = globalThis.window.canDo;
  globalThis.window.canDo = () => false;
  try {
    const viewer = drawTab({ part: "outreach", config: {} });
    assert.equal(byTestId(viewer, "rec-standing-act"), null);
    assert.equal(byTestId(viewer, "rec-row-act-offer"), null, "and no row opens");
    assert.equal(textOf(byTestId(viewer, "rec-viewer-note")), "Only an owner can change these, or connect a mailbox.");
  } finally {
    globalThis.window.canDo = may;
  }
  unmount();
});

test("each press shows to whoever may do it: an operator approves a batch, and connects no mailbox and starts no search", async () => {
  const head = (re) => (t) => {
    const h = byTestId(t, "rec-standing-head");
    return !!h && re.test(textOf(h));
  };
  const waiting = {
    kind: "waiting_ok",
    headline: "Your first 12 emails are ready for your OK",
    detail: null,
    act: "Read and approve",
    to: "sends/33333333-3333-4333-8333-333333333333",
    needs_you: true,
    steps: [],
  };
  const mailbox = {
    ...waiting,
    kind: "no_mailbox",
    headline: "Connect your mailbox to start sending",
    act: "Connect Google",
    to: null,
  };
  const fresh = {
    ...waiting,
    kind: "not_started",
    headline: "2 things before your first email",
    act: null,
    to: null,
    steps: [
      { id: "mailbox", done: false, title: "Connect your mailbox", detail: "Emails go out from your own address" },
      {
        id: "people",
        done: false,
        title: "Find businesses to write to",
        detail: "Start with Dental offices in Austin",
      },
    ],
  };
  const may = globalThis.window.canDo;
  globalThis.window.canDo = (action) => action === "approve";
  try {
    let tree = await drawOnRead({}, { standing: waiting }, head(/ready for your OK/));
    assert.equal(textOf(byTestId(tree, "rec-standing-act")), "Read and approve", "an OK is theirs to give");
    tree = await drawOnRead({}, { standing: mailbox }, head(/Connect your mailbox/));
    assert.equal(byTestId(tree, "rec-standing-act"), null, "a mailbox is the settings'");
    tree = await drawOnRead({}, { standing: fresh }, head(/2 things/));
    assert.equal(byTestId(tree, "rec-step-mailbox-door"), null);
    assert.equal(byTestId(tree, "rec-step-people-door"), null, "the lead finder is the owner's and the partner's");
  } finally {
    globalThis.window.canDo = may;
  }
  unmount();
});

test("what they do next says what it reaches today, and whether there is a booking link to offer", async () => {
  let tree = drawTab({ part: "outreach", config: {}, brain: { booking_link: "" } });
  openFold(tree, "reply_offer");
  tree = redrawTab();
  const choice = textOf(byTestId(tree, "rec-reply-offer-choice"));
  assert.match(choice, /Talk on a short call/);
  assert.match(choice, /Answers to interested replies offer a call\./);
  assert.match(choice, /Book through your link/);
  assert.match(choice, /Just reply/);
  // No link to offer, so it opens on what answers do now; choosing the link says there is none yet, and the way to add one.
  assert.equal(byTestId(tree, "rec-reply-offer-link"), null);
  find(
    byTestId(tree, "rec-reply-offer-choice"),
    (n) => n.props?.onClick && textOf(n).trim().startsWith("Book through"),
  ).props.onClick();
  assert.match(textOf(byTestId(redrawTab(), "rec-reply-offer-link")), /no booking link yet/);
  unmount();
  tree = drawTab({ part: "outreach", config: {}, brain: { booking_link: "https://book.example/maya" } });
  openFold(tree, "reply_offer");
  assert.match(textOf(byTestId(redrawTab(), "rec-reply-offer-link")), /book\.example\/maya/);
  unmount();
});

test("each sheet says what the change reaches, as it stands today", () => {
  for (const [fold, words] of [
    ["offer", /Running ones use it for their first line\./],
    ["fixes", /Running ones keep their words\./],
    ["who_for", /Who actually gets an email is the search you pick/],
  ]) {
    openFold(drawTab({ part: "outreach", config: {} }), fold);
    assert.match(textOf(foldOf(redrawTab(), fold)), words, fold);
    unmount();
  }
  openFold(drawTab({ part: "outreach", config: {} }), "ending");
  assert.match(
    textOf(byTestId(redrawTab(), "rec-ending-note")),
    /Signature and phone reach every email as soon as you save\./,
  );
  unmount();
});

test("Sending's sheet shows what Healthy means, and Send more only for a mailbox on the customer's domain", async () => {
  let tree = await drawOnRead({}, {}, (t) => !!byTestId(t, "rec-sending-pill"));
  assert.equal(textOf(byTestId(tree, "rec-sending-pill")), "Healthy");
  press(byTestId(tree, "rec-row-act-send_from"));
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-sending-checks")), /Your domain is set up to send/);
  assert.match(textOf(byTestId(tree, "rec-sending-today")), /7 of 10/);
  assert.match(textOf(byTestId(tree, "rec-sending-month")), /34 sent, of 2,000 included/);
  assert.equal(byTestId(tree, "rec-sending-more"), null);
  unmount();
  const sending = {
    ...READ.sending,
    ceiling: "That's the most for a mailbox on your main domain.",
    customer_host: "brightline.example",
  };
  tree = await drawOnRead({}, { sending }, (t) => {
    press(byTestId(t, "rec-row-act-send_from"));
    return !!byTestId(redrawTab(), "rec-sending-more");
  });
  assert.match(textOf(byTestId(tree, "rec-sending-pace")), /That's the most for a mailbox on your main domain\./);
  press(byTestId(tree, "rec-sending-more"));
  tree = redrawTab();
  const more = textOf(byTestId(tree, "rec-send-more-sheet"));
  assert.match(more, /Like getbrightline\.example, with a mailbox on Google Workspace/);
  assert.match(more, /stays at 20 a day/);
  unmount();
});

test("Before each batch offers holding or asking, never sending on its own, and says it is for new sequences", async () => {
  let tree = await drawOnRead({}, {}, (t) => /Held 30 minutes/.test(textOf(byTestId(t, "rec-row-batch_mode"))));
  openFold(tree, "batch_mode");
  tree = redrawTab();
  const choice = textOf(byTestId(tree, "rec-batch-mode-choice"));
  assert.match(choice, /Hold it 30 minutes so I can stop it/);
  assert.match(choice, /Ask me/);
  assert.doesNotMatch(choice, /Send it/);
  const note = textOf(byTestId(tree, "rec-batch-note"));
  assert.match(note, /For new sequences\. Each sequence can change its own\./);
  assert.match(note, /New words always wait for your OK/);
  unmount();
});

test("the rules say the two they left out: customers, and countries", async () => {
  let tree = await drawOnRead({}, {}, (t) => !!byTestId(t, "rec-row-act-rules"));
  press(byTestId(tree, "rec-row-act-rules"));
  tree = redrawTab();
  const rules = textOf(byTestId(tree, "rec-rules"));
  assert.match(rules, /Never to your customers, or anyone who said no/);
  assert.match(rules, /US, Canada and UK freely\. Elsewhere it asks you first, and never Germany and Austria/);
  unmount();
});

test("who never hears says how many, by address, and a count not read is left out", async () => {
  let tree = await drawOnRead({}, { never: { said_no: 4, asked_to_stop: 2 } }, (t) =>
    /6 so far\./.test(textOf(byTestId(t, "rec-card-never"))),
  );
  press(byTestId(tree, "rec-row-act-never"));
  tree = redrawTab();
  const sheet = textOf(byTestId(tree, "rec-never-sheet"));
  assert.match(sheet, /Said no4/);
  assert.match(sheet, /Asked to stop2/);
  assert.match(sheet, /Always, on its own/);
  unmount();
  tree = await drawOnRead({}, { never: null }, (t) => !/so far/.test(textOf(byTestId(t, "rec-card-never"))));
  assert.doesNotMatch(textOf(byTestId(tree, "rec-card-never")), /so far/);
  unmount();
});

test("the rail lists it as Cold email, in a group of its own after Autonomy, and its rows open on it", () => {
  const ids = SET_TABS.map((t) => t.id);
  assert.equal(ids[ids.indexOf("autonomy") + 1], "outreach");
  const tab = SET_TABS.find((t) => t.id === "outreach");
  assert.equal(tab.label, "Cold email");
  assert.equal(tab.group, "Outreach");
  assert.equal(SET_TAB("outreach").label, "Cold email", "the old address lands, under its new name");
  for (const row of ["offer", "proof", "cold_tone", "signed_by", "signature", "sign_phone", "reply_offer"])
    assert.equal(paneOfRow(row), "outreach", row);
  assert.equal(settingsRowRoute("offer"), "admin/outreach/offer");
});

test("Try it is the role's to press as the preview door is: a viewer's press is refused, and nothing opens", () => {
  // The door that writes the trial takes an operator and spends Ask's day (route-policy.json reach-outs/preview); the
  // stand-in refuses what a viewer may not approve, as the frame's gate does, its handler spread over the act's.
  const before = globalThis.window.gate;
  globalThis.window.gate = (action, doing) =>
    action === "approve" ? { "aria-disabled": true, "data-refused": doing, onClick: () => {} } : {};
  try {
    let tree = page();
    const act = byTestId(tree, "rec-row-act-try_lead");
    assert.equal(act.props["data-refused"], "write a trial email");
    press(act);
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-try-none"), null, "the sheet stays shut");
  } finally {
    globalThis.window.gate = before;
  }
});

test("Try it with no running sequence to leads says to start one, and asks the preview door nothing", () => {
  const asked = [];
  globalThis.window.fetch = (url) => {
    asked.push(String(url));
    return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
  };
  let tree = page();
  press(byTestId(tree, "rec-row-act-try_lead"));
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-try-none")), /Start a sequence to see one/);
  assert.ok(!asked.some((u) => u.includes("reach-outs/preview")), "no sequence, no email written");
});

test("a claim's row says how many emails carried it, from the page's own read", async () => {
  const tree = await drawOnRead(
    { reach_out: REACH_OUT },
    { claims: [{ text: REACH_OUT.proof[0], sends: 9 }] },
    (t) => textOf(byTestId(t, "rec-row-proof-0-meta")) === "In 9 emails",
  );
  assert.equal(textOf(byTestId(tree, "rec-row-proof-0-meta")), "In 9 emails");
});

test("a fact whose count could not be read says nothing, never Not used yet", async () => {
  const facts = [REACH_OUT.proof[0], "Every cleaner is background-checked."];
  const tree = await drawOnRead(
    { reach_out: { ...REACH_OUT, proof: facts } },
    {
      claims: [
        { text: facts[0], sends: 4 },
        { text: facts[1], sends: null },
      ],
    },
    (t) => textOf(byTestId(t, "rec-row-proof-0-meta")) === "In 4 emails",
  );
  assert.equal(byTestId(tree, "rec-row-proof-1-meta"), null, "an unknown count draws no count");
  assert.doesNotMatch(textOf(byTestId(tree, "rec-row-proof-1")), /Not used yet/);
  assert.match(textOf(byTestId(tree, "rec-row-proof-1")), /background-checked/, "and the fact still shows");
});

test("What it's told opens on the drafter's words, and an answer's parts carry no share", () => {
  let tree = page();
  press(byTestId(tree, "rec-row-act-told"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-told-sheet"));
  assert.match(textOf(byTestId(tree, "rec-told-hint")), /Written once by Ask/);
  const kinds = byTestId(tree, "rec-told-kind");
  find(kinds, (n) => n.props?.["aria-checked"] !== undefined && textOf(n) === "An answer").props.onClick();
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-told-part-answers"));
  assert.equal(byTestId(tree, "rec-told-share-answers"), null);
  // A part with nothing fixed to show (the thread is each reply's own) says so when opened, never opens onto nothing.
  press(byTestId(tree, "rec-told-part-thread-press"));
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-told-part-thread")), /Each reply's own/);
});

test("the page reads again as a save changes its config, and as the owner comes back to the tab, at most once a minute", async () => {
  const reads = [];
  const answer = () =>
    new Response(JSON.stringify({ ok: true, data: READ }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const count = (url) => {
    if (/settings\/reach-out(\?|$)/.test(String(url))) reads.push(String(url));
    return Promise.resolve(answer());
  };
  globalThis.window.fetch = count;
  await until(() => {
    drawTab({ part: "outreach", config: GOAL });
    return reads.length > 0 && byTestId(redrawTab(), "rec-card-sending");
  }, "the page's first read");
  // Settled, nothing asks again by itself.
  const settled = reads.length;
  redrawTab();
  assert.equal(reads.length, settled, "a draw alone reads nothing");
  const realNow = Date.now;
  let ahead = 0;
  Date.now = () => realNow() + ahead;
  try {
    // A save brings the config back: an address added moves Where it stands, which only this read says. (The client shares
    // an identical read for two seconds, or until a write, which a save is.)
    ahead = 3_000;
    drawTab({ part: "outreach", config: { ...GOAL, ask: { goal: "Thirty new clinics a month" } } });
    await until(() => {
      redrawTab();
      return reads.length > settled;
    }, "the read after a save");
    const saved = reads.length;
    // Back within the minute, nothing is asked; a minute on, it is.
    ahead += 10_000;
    globalThis.window.dispatchEvent(new Event("chanly:front"));
    redrawTab();
    assert.equal(reads.length, saved, "within the minute");
    ahead += 61_000;
    globalThis.window.dispatchEvent(new Event("chanly:front"));
    await until(() => {
      redrawTab();
      return reads.length > saved;
    }, "the read on coming back");
  } finally {
    Date.now = realNow;
  }
  unmount();
});

test("Sending names the one door to its details, and no mailbox opens the way to connect one", async () => {
  const tree = await drawOnRead(GOAL, {}, (t) => byTestId(t, "rec-row-send_from"));
  assert.ok(byTestId(tree, "rec-row-act-send_from"), "From carries the door");
  assert.equal(
    byTestId(tree, "rec-row-act-send_pace"),
    null,
    "the pace is a fact, not a second door to the same sheet",
  );
  assert.equal(byTestId(tree, "rec-row-act-send_month"), null, "nor the month");
  unmount();
  const none = {
    standing: READ.standing,
    sending: {
      from: null,
      more: 0,
      health: "none",
      pace: null,
      ceiling: null,
      checks: [],
      today: null,
      month: null,
      customer_host: null,
    },
  };
  let empty = await drawOnRead(GOAL, none, (t) => /Connect/.test(textOf(byTestId(t, "rec-row-act-send_from") ?? "")));
  press(byTestId(empty, "rec-row-act-send_from"));
  empty = redrawTab();
  assert.ok(byTestId(empty, "rec-connect-sheet"), "the road to a mailbox, never an empty sheet of checks");
  assert.equal(byTestId(empty, "rec-sending-sheet"), null);
  unmount();
});

test("What they should do next says what is true: with no booking link there is nothing to book, so answers just reply", async () => {
  const brainless = { reach_out: {} };
  const tree = drawTab({ part: "outreach", config: brainless, brain: { booking_link: "" } });
  assert.match(textOf(byTestId(tree, "rec-row-reply_offer")), /Just reply/);
  unmount();
  const linked = drawTab({ part: "outreach", config: brainless });
  assert.match(textOf(byTestId(linked, "rec-row-reply_offer")), /Book through your link/);
  unmount();
});

test("Add a fact is said once, and Who never hears from you's press says what it opens", async () => {
  const tree = drawTab({ part: "outreach", config: { reach_out: { proof: ["We clean 40 clinics."] } } });
  assert.equal(byTestId(tree, "rec-row-proof-add"), null, "no row whose label and act are the same words");
  assert.match(textOf(byTestId(tree, "rec-row-act-proof-add")), /Add a fact/);
  assert.match(textOf(byTestId(tree, "rec-row-act-never")), /See how/);
  unmount();
});

test("Before each batch writes Autonomy's outreach row, and says where the rest of it lives", async () => {
  const puts = [];
  globalThis.window.fetch = (url, init) => {
    const u = String(url);
    if (u.includes("/policies") && init?.method === "PUT") puts.push(JSON.parse(init.body));
    return Promise.resolve(
      new Response(
        JSON.stringify({ ok: true, data: u.includes("settings/reach-out") ? { ...READ, batch_mode: "veto" } : {} }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  };
  let tree;
  await until(() => {
    tree = drawTab({ part: "outreach", config: GOAL });
    return /Held 30 minutes/.test(textOf(byTestId(tree, "rec-row-batch_mode") ?? ""));
  }, "the mode as read");
  press(byTestId(tree, "rec-row-act-batch_mode"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-batch-autonomy"), "a door to the page that holds every kind of message");
  find(
    byTestId(tree, "rec-batch-mode-choice"),
    (n) => n.props?.onClick && textOf(n).trim().startsWith("Ask me"),
  ).props.onClick();
  press(byTestId(redrawTab(), "rec-inline-save-batch_mode") ?? byTestId(redrawTab(), "rec-fold-save-batch_mode"));
  await until(() => puts.length === 1, "the write");
  assert.deepEqual([puts[0].class, puts[0].mode], ["outreach", "ask"]);
  unmount();
});

test("a first read that fails says so and offers a retry, and the retry draws the page", async () => {
  unmount();
  // Nothing held from an earlier page: this is the page's first read in the tab.
  const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");
  clearReadCaches();
  let down = true;
  globalThis.window.fetch = (url) =>
    Promise.resolve(
      String(url).includes("settings/reach-out") && !down
        ? new Response(JSON.stringify({ ok: true, data: READ }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ ok: false }), { status: 500 }),
    );
  let tree = drawTab({ part: "outreach", config: { reach_out: REACH_OUT } });
  await until(() => {
    tree = redrawTab();
    return byTestId(tree, "rec-outreach-read-failed");
  }, "the failed read, said");
  assert.match(textOf(byTestId(tree, "rec-outreach-read-failed")), /Couldn't read Cold email/);
  assert.equal(byTestId(tree, "rec-standing"), null, "no empty card where the answer would be");
  down = false;
  press(byTestId(tree, "rec-outreach-read-retry"));
  await until(() => {
    tree = redrawTab();
    return byTestId(tree, "rec-standing-head");
  }, "the page after a retry");
  assert.match(textOf(byTestId(tree, "rec-standing-head")), /Sending/);
  assert.equal(byTestId(tree, "rec-outreach-read-failed"), null, "the failure is said no longer");
  unmount();
});

const SAMPLE = {
  lead: { id: "l1", business_name: "Bright Smiles Dental", email: "hello@brightsmiles.test" },
  subject: "After-hours cleaning",
  body: "Hi, we clean 40 clinics across Austin today.",
  opening: null,
  angle: null,
  hold: null,
  detail: null,
  refused: null,
  unavailable: false,
};
/** The next business the search found, as Another lead asks for it. */
const NEXT_SAMPLE = {
  ...SAMPLE,
  lead: { id: "l2", business_name: "Lakeside Family Dental", email: "office@lakesidefamily.test" },
};
/**
 * The page over a running sequence to leads, drawn once its read has landed. The read says `door.headline()` at its top,
 * which only this test's read can say; `door.written` counts the emails the preview door was asked for, each answered
 * once `door.hold` (if any) lets go, with the business its `index` asks for.
 */
const drawOverSequence = async (door) => {
  unmount();
  // Nothing held from an earlier page: what this page draws is this test's read.
  const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");
  clearReadCaches();
  const json = (body) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  globalThis.window.fetch = (url, init) => {
    const to = String(url);
    if (to.includes("reach-outs/preview")) {
      door.written.push(to);
      const preview = JSON.parse(init.body).index === 1 ? NEXT_SAMPLE : SAMPLE;
      return (door.hold ?? Promise.resolve()).then(() => json({ ok: true, data: { preview } }));
    }
    if (to.includes("settings/reach-out"))
      return Promise.resolve(
        json({
          ok: true,
          data: {
            ...READ,
            standing: { ...READ.standing, headline: door.headline() },
            sequence: { ...SEQUENCE_SIGNED_MAYA, search_id: "s1" },
          },
        }),
      );
    return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
  };
  drawTab({ part: "outreach", config: { reach_out: REACH_OUT } });
  await until(() => textOf(byTestId(redrawTab(), "rec-standing-head")).includes(door.headline()), "the page's read");
  return redrawTab();
};

test("a sample email is written once per open: the page reading again writes no second one over it", async () => {
  let said = "Sending, read once";
  const door = { written: [], hold: null, headline: () => said };
  let tree = await drawOverSequence(door);
  press(byTestId(tree, "rec-row-act-try_lead"));
  await until(() => {
    tree = redrawTab();
    return byTestId(tree, "rec-try-lead");
  }, "the sample, written");
  assert.equal(door.written.length, 1);
  const realNow = Date.now;
  let ahead = 0;
  Date.now = () => realNow() + ahead;
  try {
    // The owner comes back to the tab a minute on, the sheet still open: the page reads again, and its read is a new
    // object that says the same sequence.
    said = "Sending, read twice";
    ahead += 61_000;
    globalThis.window.dispatchEvent(new Event("chanly:front"));
    await until(() => textOf(byTestId(redrawTab(), "rec-standing-head")).includes(said), "the page's second read");
    tree = redrawTab();
    assert.match(textOf(byTestId(tree, "rec-try-lead")), /Bright Smiles Dental/, "the one being read stays");
    // Only a press writes another. The next business's email is the second written since the sheet opened: had the
    // second read written one of its own, this would be the third.
    press(byTestId(tree, "rec-try-another"));
    await until(
      () => textOf(byTestId(redrawTab(), "rec-try-lead")).includes("Lakeside Family Dental"),
      "the next business's email",
    );
    assert.equal(door.written.length, 2, "the same sequence, read again, is no reason to write another email");
  } finally {
    Date.now = realNow;
  }
  unmount();
});

test("a sample email being written says so in words, until it is there", async () => {
  let letGo;
  const door = { written: [], hold: new Promise((r) => (letGo = r)), headline: () => "Sending, sample out" };
  let tree = await drawOverSequence(door);
  press(byTestId(tree, "rec-row-act-try_lead"));
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-try-body")), /Writing one/);
  letGo();
  await until(() => {
    tree = redrawTab();
    return byTestId(tree, "rec-try-lead");
  }, "the sample, written");
  assert.doesNotMatch(textOf(byTestId(tree, "rec-try-body")), /Writing one/);
  unmount();
});
