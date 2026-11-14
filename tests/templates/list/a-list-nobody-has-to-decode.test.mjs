/**
 * Messages, the list an owner never has to decode (the clean list, 13 Nov 2026; Ruben's four choices): its groups by
 * their names (Needs you, Sending, Ready, Ready-made), the starters there to use with nothing about them missing and
 * sorted by what each is for, a message's own words as one person would get them, and what is no row of the list at all.
 * On the stub React, as the sheet's tests draw the page (../sheet/_message-page.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOURS,
  VISIT,
  all,
  byTestId,
  contracts,
  custom,
  headed,
  ownRow,
  page,
  press,
  redraw,
  rowOf,
  sendsIt,
  starterByKey,
  starterRow,
  textOf,
  unfoldedFor,
  usedBy,
} from "../sheet/_message-page.mjs";

/** What each starter is for, as the list sorts the ready-made ones. */
const { STARTER_MOMENTS, starterMoment } =
  await import("../../../apps/dashboard/src/surfaces/campaigns/templates/group.ts");

/** A group of the list by its place, and the name it stands under (the one heading every list draws, kit GroupHead). */
const groupOf = (tree, place) => byTestId(tree, `templates-${place}`);
const nameOf = (group) => textOf(all(group, (n) => n.props?.className === "group-head-name")[0] ?? null);
/** The names over the runs of ready-made starters, in the order drawn. */
const momentsOf = (tree) => all(tree, (n) => n.type === "h4" && n.props?.className === "msg-moment").map(textOf);
/** The rows the list draws, by the place each stands in. */
const placesOf = (tree) => all(tree, (n) => n.props?.["data-place"] && n.props?.["data-template"]);

test("every starter of the set is for one of four moments, read from the class its own moment is filed under", () => {
  const by = Object.fromEntries(STARTER_MOMENTS.map((moment) => [moment, []]));
  for (const s of contracts.STARTER_TEMPLATES.filter((x) => !x.retired)) by[starterMoment(s)].push(s.key);
  for (const keys of Object.values(by)) keys.sort();
  assert.deepEqual(by, {
    appointments: ["after_visit_check", "after_visit_review", "missed_visit", "two_hour_reminder", "visit_reminder"],
    follow_ups: ["booking_follow_up", "proposal_follow_up", "time_freed"],
    offers: ["quick_note", "this_months_offer", "winback_reply"],
    calls: ["call_text"],
  });
  assert.deepEqual([...STARTER_MOMENTS], ["appointments", "follow_ups", "offers", "calls"], "in this order");
});

test("a new business's list is the starters, there to use: one group, open, sorted by what each is for, and nothing about them missing", () => {
  const tree = page({ rows: [] });
  for (const place of ["need", "going", "idle", "away"])
    assert.equal(groupOf(tree, place), null, `no ${place} group where it holds nothing`);
  const made = groupOf(tree, "made");
  assert.equal(nameOf(made), "Ready-made");
  assert.deepEqual(momentsOf(made), ["Appointments", "Follow-ups", "Offers and news", "Calls"]);
  const rows = placesOf(made);
  assert.equal(
    rows.length,
    contracts.startersOffered({ reviewLink: false }).length,
    "a row to each starter offered here",
  );
  assert.ok(rows.every((r) => r.props["data-place"] === "made"));
  // Nothing says a starter is missing, unused or to be added, and no row wears a figure it has not earned.
  const said = textOf(tree);
  for (const gone of ["Not added", "Not in use", "Add the starter set", "Checked with WhatsApp"])
    assert.equal(said.includes(gone), false, `"${gone}" is gone`);
  assert.equal(byTestId(made, "template-sent"), null, "nothing at a starter's right");
  // A starter's line is what it is for, in plain words.
  const visit = rowOf(tree, starterByKey(VISIT).name);
  assert.ok(textOf(visit).includes("For the day before an appointment"), textOf(visit));
  assert.equal(textOf(headed(tree, "messages-count")), "Nothing sending yet");
});

test("the business's own message nothing sends is Ready, its line its own words as one person would get them, never our notation; the starters fold under it", () => {
  let tree = page({ rows: [custom(HOURS)] });
  const ready = groupOf(tree, "idle");
  assert.equal(nameOf(ready), "Ready");
  const row = rowOf(ready, HOURS);
  assert.equal(row.props["data-place"], "idle");
  assert.ok(textOf(row).includes("“Hi Dani, our hours start Oct 1.”"), textOf(row));
  assert.equal(/[{}]/.test(textOf(row)), false, "no braces");
  // Ready-made folds where the business has something of its own to read: its name, its count, one press.
  const fold = byTestId(tree, "templates-fold-made");
  assert.equal(fold.props["aria-expanded"], false);
  assert.equal(rowOf(tree, starterByKey(VISIT).name), null, "its rows are a press away");
  tree = unfoldedFor(tree, starterByKey(VISIT).name);
  assert.equal(rowOf(tree, starterByKey(VISIT).name).props["data-place"], "made");
});

test("a value the business has not given yet is said in plain words in a row's line, never as a blank in brackets", () => {
  const tree = page({
    rows: [
      custom("come_back", {
        body_preview: "Hi {{1}}, book your next visit here: {{2}}",
        variables: [
          { position: 1, label: "First name", example: "Dani" },
          { position: 2, label: "Booking link", example: "https://example.com/book" },
        ],
      }),
    ],
  });
  const said = textOf(rowOf(tree, "come_back"));
  assert.ok(said.includes("“Hi Dani, book your next visit here: your booking link”"), said);
  assert.equal(/[[\]{}]/.test(said), false, "no brackets, no braces");
});

test("what a sequence sends is Sending, and the head counts it; a starter a sequence of theirs names is theirs, not ready-made", () => {
  const name = starterByKey(VISIT).name;
  page({ rows: [starterRow(VISIT)] });
  sendsIt(usedBy(name));
  let tree = redraw();
  assert.equal(nameOf(groupOf(tree, "going")), "Sending");
  assert.equal(rowOf(tree, name).props["data-place"], "going");
  assert.equal(textOf(headed(tree, "messages-count")), "1 sending");
  // Its sequence stopped: nothing sends it now, and it is the business's own (a sequence of theirs names it), in Ready.
  sendsIt(usedBy(name, { running: false, note: "paused" }));
  tree = redraw();
  assert.equal(rowOf(tree, name).props["data-place"], "idle");
  assert.equal(groupOf(tree, "going"), null);
});

test("a message made in WhatsApp's own tools that cannot be sent whole from here is no row of the list, unless something sends it or it has words of its own", () => {
  const PICTURE = "autumn_picture";
  const picture = custom(PICTURE, { source: "meta", blocked: "a picture for a heading" });
  // Nothing sends it and it has nothing else: not listed, in any group, however the list is unfolded.
  let tree = page({ rows: [picture, custom(HOURS)] });
  for (const id of ["templates-fold-idle", "templates-fold-made", "templates-hidden"]) {
    const head = byTestId(tree, id);
    if (head && head.props["aria-expanded"] === false) {
      press(head);
      tree = redraw();
    }
  }
  assert.equal(rowOf(tree, PICTURE), null, "not a message of this product");
  assert.ok(rowOf(tree, HOURS), "the business's own beside it is listed");
  // A sequence sends it: that needs you, with the one thing to know, since its sends go nowhere.
  sendsIt(usedBy(PICTURE));
  tree = redraw();
  const row = rowOf(groupOf(tree, "need"), PICTURE);
  assert.equal(nameOf(groupOf(tree, "need")), "Needs you");
  assert.ok(textOf(row).includes("a picture for a heading"), textOf(row));
  // With an email of its own it is a message here: listed, and its line is its words, never the channel's reason.
  tree = page({ rows: [picture], versions: [ownRow("email", PICTURE)] });
  const own = rowOf(groupOf(tree, "idle"), PICTURE);
  assert.ok(own, "listed under Ready");
  assert.equal(textOf(own).includes("cannot be sent"), false, textOf(own));
});
