/**
 * Settings › How it reaches out (decision 0113), EXECUTED on the stub React over the business tab's harness: its cards in
 * their order, a row saved as one key of the config's reach_out section and nothing else, a signature refused in the
 * page's words, what a reply sets off with only one row the owner's, and the rail that lists it. Every claim is
 * something the page drew, or something a press on it sent.
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
import { SET_TABS, paneOfRow, settingsRowRoute } from "../../../apps/dashboard/src/surfaces/settings/frame/tabs.ts";

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

test("the page draws its cards in the order a person needs them", () => {
  const cards = all(page(), (n) => n.type === "section" && classes(n).includes("rec-card")).map(
    (n) => n.props["data-testid"],
  );
  assert.deepEqual(cards, [
    "rec-card-offer",
    "rec-card-proof",
    "rec-card-writes",
    "rec-card-sign-off",
    "rec-card-sends-from",
    "rec-card-writes-back",
    "rec-card-rules",
    "rec-card-told",
    "rec-card-try",
  ]);
});

test("a row with nothing set says what the writers read in its place, never as the owner's words", () => {
  const tree = drawTab({ part: "outreach", config: { ask: { goal: "Twenty new clinics a month" } } });
  assert.match(textOf(byTestId(tree, "rec-card-offer")), /Twenty new clinics a month/);
  assert.match(textOf(byTestId(tree, "rec-card-offer")), /Read from your goal on Details, until you write it here\./);
  openFold(tree, "offer");
  assert.equal(boxIn(redrawTab(), "offer").props.value, "", "the fold opens on what is stored: nothing");
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
  openFold(tree, "signature");
  tree = redrawTab();
  typeIn(tree, "signature", "Maya Ortiz · brightlinecleaning.com");
  tree = redrawTab();
  saveFoldOf(tree, "signature");
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.match(textOf(foldOf(tree, "signature")), new RegExp(REACH_OUT_REFUSAL_WORDS.signature));
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

test("the rail lists it under Receptionist, after How it answers, and its rows open on it", () => {
  const ids = SET_TABS.map((t) => t.id);
  assert.equal(ids[ids.indexOf("receptionist") + 1], "outreach");
  assert.equal(SET_TABS.find((t) => t.id === "outreach").group, "Receptionist");
  for (const row of ["offer", "proof", "cold_tone", "signed_by", "signature", "sign_phone", "reply_offer"])
    assert.equal(paneOfRow(row), "outreach", row);
  assert.equal(settingsRowRoute("offer"), "admin/outreach/offer");
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
