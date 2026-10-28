/**
 * An email reply drafted in Need you shows what it will be signed with (00487, the email canvas's lane B): what is sent
 * is what is seen. On production on 27 Oct 2026 the draft ended on "Talk soon," and left that way, unsigned, with
 * nothing on the card to say so; then it said "Signed: a · b · c", cut after three parts. The signature is the drafts
 * read's (a thread whose reply leaves from a connected mailbox), drawn under the words as the email carries it, its
 * lines kept (the mailbox canvas, 27 Oct 2026), with the way to change it; a reply that carries none says nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, all, textOf, press } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
const { Words } = await import("../../../../apps/dashboard/src/surfaces/today/need-you/parts.tsx");

const lineOf = (tree) => all(tree, (n) => n.props?.["data-testid"] === "ny-signed")[0];
const wordsOf = (line) => all(line, (n) => n.props?.className === "ny-signed-words")[0];

test("the draft shows the signature it will leave with, under its words, its lines as sent, and where to change it", () => {
  fresh();
  let changed = 0;
  const signature = "Rubén Segura\nFounder · Chanlytics\nwww.chanlytics.agency  |  3495 US-1, Princeton, NJ 08540";
  const tree = Words({
    by: NEED_YOU_WORDS.drafted,
    text: "Hi Ruben,\n\nThanks for reaching out.\n\nTalk soon.",
    who: "Ruben Segura",
    onEdit: null,
    signed: signature,
    onSigned: () => changed++,
  });
  const line = lineOf(tree);
  assert.ok(line, "REGRESSION: the card never said the reply would leave unsigned, or signed");
  assert.equal(textOf(wordsOf(line)), signature, "every line, as the email carries it, never cut to one");
  assert.doesNotMatch(textOf(line), /^Signed:/, "the signature itself, not a summary of it");
  const change = all(line, (n) => n.props?.title === NEED_YOU_WORDS.changeSignatureTip)[0];
  assert.equal(textOf(change).trim(), "Change");
  press(change);
  assert.equal(changed, 1, "it opens where the mailbox's signature is chosen");
});

test("a reply that carries no signature says nothing about one", () => {
  fresh();
  const tree = Words({ by: NEED_YOU_WORDS.drafted, text: "Friday works.", who: "Ana", onEdit: null });
  assert.equal(lineOf(tree), undefined);
});
