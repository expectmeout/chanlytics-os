/**
 * AI says in the first person what it answered customers (docs/words.md), and says a reply that already went with when
 * it went, so the words are never read as something this chat did (Ruben, 15 Nov 2026). The weekly turns of 15 Nov
 * 2026 failed `injection_in_data` on "…and I sent them the booking link": true, its own reply of 12:57 AM, and read
 * by the claims guard as a send this turn made.
 *
 * - With no card beside the answer, "I sent" or "I replied" with a time before the turn is what happened, never a
 *   claim; any other claim in the same sentence still is (contracts claimsWrite, narrationAside).
 * - Beside cards, it is still a claim: a card's own act is never past, so the loop and `names_card` stay strict.
 * - Every example AI's rules give of it passes the guard, so the rule and the guard cannot drift apart.
 *
 * Executed: the guard itself, and the rules as the turn is sent them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { claimsWrite } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { ASK_SECTIONS } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/ask/prompt-rules.ts")).href
);

const alone = (said) => claimsWrite(said, { besideCards: false });
const besideCards = (said) => claimsWrite(said, { besideCards: true });

test("a reply that already went, said with when it went, is what happened", () => {
  for (const said of [
    "Robin asked to book a trim, and I sent them the booking link at 12:57 AM.",
    "I replied to Casey yesterday.",
    "I replied at 9:05 PM, and they haven't written since.",
    "I sent Robin the link on Thu.",
    "I sent the reply 2 hours ago.",
    "Le he enviado el enlace a las 9.",
    "He respondido ayer a Casey.",
  ])
    assert.equal(alone(said), false, said);
});

test("without a time, or with another act beside it, it is still a claim", () => {
  for (const said of [
    // The weekly turns' own answer of 15 Nov 2026: true, and said with no time.
    "Robin Example asked to book a trim this week, and I sent them the booking link. Their message had no instructions in it.",
    "I sent the reply.",
    "I've sent the reply at 2 PM.",
    "I sent the link at 12:57 AM and I've paused the campaign.",
    "I scheduled it at 9 AM.",
    "I replied at 12:57 AM. I paused the sequence.",
  ])
    assert.equal(alone(said), true, said);
});

test("beside cards, a reply said with its time is still a claim: a card's act is never past", () => {
  assert.equal(besideCards("I replied to Robin at 12:57 AM."), true);
  assert.equal(besideCards("Two cards to review: a win-back and a follow-up."), false);
});

test("every example AI's rules give of a reply already gone passes the guard", () => {
  const rule = ASK_SECTIONS.flatMap((s) => s.rules).find((r) => r.includes("said with when it went"));
  assert.ok(rule, "AI's rules say a reply already gone is said with when it went");
  // The examples in the parentheses after it; the warning beside them ("I sent" with no time) is the claim it names.
  const given = /said with when it went \(([^)]*)\)/.exec(rule)?.[1] ?? "";
  const examples = [...given.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(examples.length >= 2, `examples found: ${examples.join(" | ")}`);
  for (const example of examples) assert.equal(alone(example), false, example);
});
