/**
 * The one picker rule (the clean list, step 5b, 15 Nov 2026; the review's finding B).
 *
 * A sequence's step editor, New and the AI's drafter each decided alone which messages to list. So one listed a message
 * the Messages list hides (made in WhatsApp's own tools in a shape this product cannot send whole), another dropped a
 * message whose WhatsApp words were being checked though it holds an email, and none listed one that is only being
 * checked, though a send and a sequence's run now wait for that check. Here one workspace's messages, one in every
 * standing the rule tells apart, are read by the rule, by New and by the AI's drafter, and each lists the same ones by
 * the same channels. The step editor's own list is held the same way where its page can load
 * (broadcasts/preview-by-channel.test.mjs, campaigns/step-sheet-hand.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const SRC = "../../apps/dashboard/src";
const { pickableMessages, isBeingChecked } = await import(`${SRC}/lib/pickable-messages.ts`);
const { knownMessagesOf } = await import(`${SRC}/server/drafts/known-messages.ts`);
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);
const { newChecksOf } = await import(`${SRC}/lib/new-checks.ts`);
const { campaignMessagesOf, messageGoesBy, NEW_WORDS } = await import("@chanlytics/contracts");

/** A row as the templates read hands it: one version of one message. */
const row = (name, channel, over = {}) => ({
  id: `${name}-${channel}`,
  channel,
  name,
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  hidden_at: null,
  blocked: null,
  variables: [{ position: 1, label: "First name", example: "Dani" }],
  body_preview: `Hi {{1}}, ${name} by ${channel}.`,
  title: null,
  source: channel === "whatsapp" ? "meta" : "chanlytics",
  ...over,
});

/** One workspace's messages, one in each standing the rule tells apart: the name says what a picker does with it. */
const ROWS = [
  // Ready: WhatsApp approved, and an email beside it.
  row("ready", "whatsapp"),
  row("ready", "email"),
  // Being checked, with an email beside it: listed, by both.
  row("checked_with_email", "whatsapp", { meta_status: "pending" }),
  row("checked_with_email", "email"),
  // Being checked, alone: listed, by WhatsApp (it was in no picker).
  row("checked_alone", "whatsapp", { meta_status: "pending" }),
  // WhatsApp asked for a change, with an email beside it: listed, by the email alone.
  row("refused_with_email", "whatsapp", { meta_status: "rejected" }),
  row("refused_with_email", "email"),
  // WhatsApp asked for a change, is holding it, or turned it off, alone: listed by none.
  row("refused_alone", "whatsapp", { meta_status: "rejected" }),
  row("held_alone", "whatsapp", { meta_status: "paused" }),
  row("off_alone", "whatsapp", { meta_status: "disabled" }),
  // Approved in a shape this product cannot send whole, alone: the Messages list does not show it, and no picker does.
  row("unsendable_alone", "whatsapp", { blocked: "a picture for a heading" }),
  // The same with an email beside it: listed, by the email.
  row("unsendable_with_email", "whatsapp", { blocked: "a picture for a heading" }),
  row("unsendable_with_email", "email"),
  // Put away by the workspace: listed by none, whatever it holds.
  row("put_away", "whatsapp", { hidden_at: "2026-11-01T00:00:00.000Z" }),
  row("put_away", "email"),
  // A text alone.
  row("text_only", "sms"),
];
const MESSAGES = campaignMessagesOf(ROWS);

/** What every picker lists, and the channels each goes by (as a set: each picker says them in its own order). */
const LISTED = {
  ready: ["email", "whatsapp"],
  checked_with_email: ["email", "whatsapp"],
  checked_alone: ["whatsapp"],
  refused_with_email: ["email"],
  unsendable_with_email: ["email"],
  text_only: ["sms"],
};
const CHECKING = ["checked_with_email", "checked_alone"];
const byName = (pairs) => Object.fromEntries(pairs);
const asSet = (channels) => [...channels].sort();

test("the rule: what a picker lists, by which channels, drawn from which row, and what WhatsApp is still checking", () => {
  const picked = pickableMessages(ROWS, MESSAGES);
  assert.deepEqual(byName(picked.map((p) => [p.message.name, asSet(p.channels)])), LISTED);
  // The channels are the message's own (contracts messageGoesBy), in the product's order: WhatsApp, text, email.
  for (const p of picked) assert.deepEqual(p.channels, messageGoesBy(p.message), p.message.name);
  assert.deepEqual(
    picked.filter((p) => p.checking).map((p) => p.message.name),
    CHECKING,
  );
  // Its words are those of the first channel it goes by: WhatsApp's where it goes by WhatsApp, approved or being checked.
  assert.deepEqual(byName(picked.map((p) => [p.message.name, p.row.id])), {
    ready: "ready-whatsapp",
    checked_with_email: "checked_with_email-whatsapp",
    checked_alone: "checked_alone-whatsapp",
    refused_with_email: "refused_with_email-email",
    unsendable_with_email: "unsendable_with_email-email",
    text_only: "text_only-sms",
  });
  // Made of the rows alone, where the read carries no messages, it lists the same.
  assert.deepEqual(
    pickableMessages(ROWS).map((p) => p.message.name),
    picked.map((p) => p.message.name),
  );
  // A message none of whose rows the read holds is left out, never listed with no words.
  assert.deepEqual(pickableMessages([], MESSAGES), []);
  const named = (name) => MESSAGES.find((m) => m.name === name);
  assert.equal(isBeingChecked(named("held_alone")), false, "a hold is not a check");
  assert.equal(isBeingChecked(named("ready")), false);
});

test("the AI's drafter is offered the same messages by the same channels, keyed in order, and told which WhatsApp is still checking", () => {
  const known = knownMessagesOf({ templates: ROWS, messages: MESSAGES });
  const nameOf = (m) => ROWS.find((r) => r.id === m.templateId).name;
  assert.deepEqual(byName(known.map((m) => [nameOf(m), asSet(m.channels)])), LISTED);
  assert.deepEqual(known.filter((m) => m.checking).map(nameOf), CHECKING);
  assert.deepEqual(
    known.map((m) => m.key),
    known.map((_, i) => `k${i + 1}`),
  );
  // The words it is shown are the ones the step will send: the WhatsApp version's, though WhatsApp is still checking them.
  const alone = known.find((m) => nameOf(m) === "checked_alone");
  assert.deepEqual([alone.templateId, alone.body], ["checked_alone-whatsapp", "Hi {{1}}, checked_alone by whatsapp."]);
  // In the order a draft says its channels: WhatsApp, email, text.
  assert.deepEqual(known.find((m) => nameOf(m) === "ready").channels, ["whatsapp", "email"]);
});

test("New lists the same messages by the same channels, and one being checked says so in the draft's checks and in the question before sending", () => {
  const held = MESSAGES.flatMap((m) => {
    const message = M.heldMessageOf(m, ROWS);
    return message && m.offered ? [[m.name, message]] : [];
  });
  assert.deepEqual(byName(held.map(([name, m]) => [name, asSet(m.channels)])), LISTED);
  assert.deepEqual(
    held.filter(([, m]) => m.checking).map(([name]) => name),
    CHECKING,
  );
  // A one-off of one being checked: the draft's check says it, and the question before sending says who waits.
  const base = M.draftByHand("once", "people", "A note");
  const draftOf = (name, channels) => ({
    ...base,
    who: M.everyoneOf(false),
    channels,
    steps: [{ ...base.steps[0], message: byName(held)[name] }],
    twin: null,
    reach: null,
  });
  const checked = draftOf("checked_with_email", ["whatsapp", "email"]);
  assert.deepEqual(M.whatsappChecksOf(checked), { others: true });
  assert.deepEqual(M.whatsappChecksOf(draftOf("checked_alone", ["whatsapp"])), { others: false });
  assert.equal(M.whatsappChecksOf(draftOf("checked_with_email", ["email"])), null, "by email alone, nothing waits");
  assert.deepEqual(
    newChecksOf(checked, ["whatsapp", "email"]).find((c) => c.tone === "warn"),
    { tone: "warn", words: "WhatsApp is checking step 1’s words", detail: NEW_WORDS.checks.newMessageDetail },
  );
  // One that is ready says what it always said, and nothing waits.
  const ready = draftOf("ready", ["whatsapp", "email"]);
  assert.equal(M.whatsappChecksOf(ready), null);
  assert.ok(newChecksOf(ready, ["whatsapp", "email"]).some((c) => /can go by/.test(c.words)));
  assert.equal(
    newChecksOf(ready, ["whatsapp", "email"]).some((c) => c.tone === "warn"),
    false,
  );
});
