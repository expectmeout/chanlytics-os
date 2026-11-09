/**
 * Ask says a hold once (decision 0088): a card says what holds it, and the Line draws a hold every card shares once and
 * drops a line of the answer that repeats one word for word. A model's paraphrase is its own words and stays, a second
 * saying, so the rule that writes the answer over cards leaves a hold out. It leaves out only that: what no card carries is
 * still said. These hold the words; only a real turn proves what they do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { ASK_SECTIONS } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/ask/prompt-rules.ts")).href
);

const rules = ASK_SECTIONS.find((s) => s.title.startsWith("Cards")).rules;
const setup = rules.find((r) => r.startsWith("Setting up sequences is a few cards"));

test("what holds a card is the card's to say: the answer beside it leaves that out, the setup rule's last word", () => {
  assert.match(
    setup,
    /Never say that anything is set up, started or running\. What holds a card back \(a channel that waits, a review, the month's allowance\) the card already says, so leave it out of the answer beside it\.$/,
  );
  assert.equal(rules.filter((r) => r.includes("What holds a card back")).length, 1, "one rule says it");
});

test("what no card carries is still said beside the cards", () => {
  assert.match(setup, /say that connecting one under Settings › Hours & booking is what it needs/);
  assert.match(rules.join(" "), /a part refused, above their role or already so .* is said beside the cards/);
});
