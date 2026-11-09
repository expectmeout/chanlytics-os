/**
 * Settings › How it reaches out (decision 0113), EXECUTED on the stub React over the business tab's harness: its cards in
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
await until(() => byTestId(redrawTab(), "rec-card-offer") !== null, "How it reaches out's cards, fetched as drawn");

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
    "rec-card-offer",
    "rec-card-proof",
    "rec-card-sound",
    "rec-card-ending",
    "rec-card-sends-from",
    "rec-card-writes-back",
    "rec-card-rules",
    "rec-card-told",
    "rec-card-try",
  ]);
});

/** The page's own read, landed, as the cards draw from it; each test here says the part it is about. */
const READ = {
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
  assert.match(textOf(byTestId(tree, "rec-card-offer")), /Twenty new clinics a month/);
  assert.match(textOf(byTestId(tree, "rec-card-offer")), /Read from your goal on Details, until you write it here\./);
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
  assert.match(textOf(byTestId(redrawTab(), "rec-card-offer")), /Twenty new clinics a month/);
});

test("what the website says of the business stands in the row, named as the website's", async () => {
  let tree = await drawOnRead(GOAL, { about: "Evening cleaning for clinics.", about_from: "website" }, (t) =>
    /Evening cleaning for clinics\./.test(textOf(byTestId(t, "rec-card-offer"))),
  );
  assert.match(textOf(byTestId(tree, "rec-card-offer")), /Read from your website, until you write it here\./);
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

test("what a reply sets off: the answer's offer is the owner's to change, the other four are code's", () => {
  const tree = page();
  assert.ok(byTestId(tree, "rec-row-act-reply_offer"), "the offer opens its fold");
  for (const id of ["not_now", "said_no", "wrong_person", "away"]) {
    const row = byTestId(tree, `rec-row-${id}`);
    assert.ok(row, id);
    assert.equal(
      find(row, (n) => classes(n).includes("rec-row-act")),
      null,
      `${id} has no act`,
    );
  }
});

test("the reply offer saves as one key, and the booking link, as before the page, is stored as nothing", () => {
  const sent = saving();
  let tree = page();
  openFold(tree, "reply_offer");
  tree = redrawTab();
  const choice = byTestId(tree, "rec-reply-offer-choice");
  find(choice, (n) => n.props?.["aria-checked"] !== undefined && textOf(n) === "A call with you").props.onClick();
  tree = redrawTab();
  saveFoldOf(tree, "reply_offer");
  assert.equal(sent[0].config.reach_out.reply_offer, "call");
});

test("Connections and To send are doors, never settings of this page", () => {
  const tree = page();
  press(byTestId(tree, "rec-row-act-send_mailbox"));
  assert.equal(went.at(-1), "admin/integrations");
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
  assert.match(textOf(byTestId(tree, "rec-try-none")), /Start a sequence first/);
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
