/**
 * The review link on Settings › Details (22 Nov 2026; contracts config/review-link.ts, the row
 * settings/business/review-link/row.tsx): where customers leave a review, where the owner gives a link of their own. A
 * message's review link is that one, else the one the Google listing keeps, so a business with no listing can send a
 * review ask at all. The row is drawn after the website, says which link messages send, checks what is typed as a web
 * address before any round trip, and saves one key of the brain, of which AI is told nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, all, byTestId, textOf, classes } from "../../_stub-react.mjs";
import {
  boxOf,
  drawTab,
  inline,
  landSettings,
  marisa,
  openFold,
  redrawTab,
  saveRow,
  saving,
  settingsHeld,
  typeInto,
} from "../../_business-tab-harness.mjs";

after(() => unmount());

test("Who you are draws eight rows: the review link after the website, beside the other address a customer is sent to", () => {
  const card = byTestId(drawTab({ profile: marisa }), "rec-card-who");
  const keys = all(card, (n) => classes(n).includes("rec-row-key")).map(textOf);
  // In the spec's order: the logo after the name (00407), its colour after it (00490, decision 0075). The booking link is
  // Booking's (17 Oct 2026) and the transfer number On calls' (18 Oct 2026), so neither is here.
  assert.deepEqual(keys, [
    "Name",
    "Logo",
    "Colour",
    "Address",
    "Website",
    "Review link",
    "Answers on",
    "Tells customers to call",
  ]);
});

test("the review link's row: the owner's own link, checked as a web address, saved as one key, and AI is told nothing of it", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  drawTab({ flash });
  const stored = structuredClone(settingsHeld().config);
  // None of the owner's own, and no Google listing's either (the settings read's `reviewLink`): no message has one.
  landSettings({ ...settingsHeld(), reviewLink: false });
  let tree = redrawTab(flash);
  assert.match(textOf(byTestId(tree, "rec-row-review_link")), /Not set/);
  assert.doesNotMatch(textOf(byTestId(tree, "rec-row-review_link")), /From your Google listing/);
  // The listing keeps one: the row says messages use that, never "Not set".
  landSettings({ ...settingsHeld(), reviewLink: true });
  tree = redrawTab(flash);
  assert.match(textOf(byTestId(tree, "rec-row-review_link")), /From your Google listing/);
  assert.doesNotMatch(textOf(byTestId(tree, "rec-row-review_link")), /Not set/);

  // What is typed must be a web address: said under the box, before any round trip.
  openFold(tree, "review_link");
  tree = redrawTab(flash);
  typeInto(tree, "review_link", "leave us a review");
  tree = redrawTab(flash);
  saveRow(tree, "review_link");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "review_link")), /Use a full web address, like example\.com\/review/);
  assert.equal(boxOf(tree, "review_link").props["aria-invalid"], true);
  assert.deepEqual([sent.length, flashes.length], [0, 0], "nothing sent, and nothing said in a toast");

  // A web address, with the https:// an owner leaves off supplied: one key of the brain, and nothing else moves.
  typeInto(tree, "review_link", " example.com/review/harbor-studio ");
  tree = redrawTab(flash);
  assert.doesNotMatch(textOf(inline(tree, "review_link")), /It will say/, "AI is told nothing of a review link");
  saveRow(tree, "review_link");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, review_link: "https://example.com/review/harbor-studio" },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Saved · messages send this link");

  // Its own link on file, once the settings read lands what was saved: the row states it, whatever the listing keeps.
  landSettings({ ...settingsHeld(), config: sent[0].config, version: settingsHeld().version + 1 });
  tree = redrawTab(flash);
  assert.match(textOf(byTestId(tree, "rec-row-review_link")), /https:\/\/example\.com\/review\/harbor-studio/);
  assert.doesNotMatch(textOf(byTestId(tree, "rec-row-review_link")), /From your Google listing/);

  // Emptied, the key goes: messages use the listing's again, and the row says so.
  openFold(tree, "review_link");
  tree = redrawTab(flash);
  typeInto(tree, "review_link", "  ");
  tree = redrawTab(flash);
  saveRow(tree, "review_link");
  assert.equal(sent.length, 2);
  assert.equal("review_link" in sent[1].config.brain, false, "no key at all, not an empty one");
  assert.deepEqual(sent[1].config, stored);
  assert.equal(textOf(flashes.at(-1).msg), "Saved");
});
