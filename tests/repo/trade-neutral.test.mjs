/**
 * The product is for any trade. The words of one — a salon's — must not sit
 * in the code a customer reads: not in a placeholder, a command, a prompt, a
 * template example or a hint. This scans the sources that reach users and
 * fails on the first salon word, the way the no-fabricated-data spec fails on
 * a mockup name.
 *
 * Comments are skipped (they are not copy), member accesses are skipped
 * (`c.therapist` is a seed field, not a word), and a line may carry
 * `trade-word:` in a comment to say why it must keep one. The trees it reads and the lines a reader reads are
 * `_source.mjs`'s (READER_SCOPE, readerFiles, readerLines), which the appointment words' ratchet reads too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { ROOT as REPO, readerFiles, readerLines } from "../_source.mjs";

/** Files that may keep a trade's words, and why. */
const ALLOWED = new Map([]);
const BANNED = /\b(salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(?:es)?)\b/i;

test("no salon words reach a customer of another trade", () => {
  const hits = [];
  for (const file of readerFiles()) {
    const rel = relative(REPO, file).split(sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    for (const { n, text } of readerLines(src)) {
      const m = BANNED.exec(text);
      if (m) hits.push(`${rel}:${n}: “${m[0]}” — ${text.trim().slice(0, 110)}`);
    }
  }
  assert.deepEqual(hits, [], `salon words in code a customer reads:\n${hits.join("\n")}`);
});

test("what a customer of any trade reads says appointment, never one trade's visit (decision 6)", async () => {
  const c = await import("@chanlytics/contracts");
  const VISIT = /(?<![\w-])visit(?:a)?s?(?![\w-])/i;
  const both = { businessName: "Harbor Studio", whatsappE164: "+13055550100", smsE164: "+13055550100" };
  // Both asks, and the one a workspace with its texting line alone shows, whose lead names what it is for.
  const pages = [both, { ...both, whatsappE164: null }].map((f) => c.consentPageVM(f));
  const consent = pages.flatMap((page) => [
    page.title,
    page.lead,
    ...page.asks.flatMap((a) => [a.title, a.lead, ...a.terms]),
  ]);
  const form = c.consentFormVM(both);
  const paper = [form.title, form.lead, ...form.sections.flatMap((s) => [s.title, s.lead, s.box, ...s.terms])];
  const unsubscribe = ["en", "es"].flatMap((language) =>
    ["ask", "done", "stop_ask", "stopped"].flatMap((kind) => {
      const w = c.offerUnsubscribeWords({ kind, business: "Harbor Studio" }, language);
      return [w.title, w.lead, w.body, w.foot ?? ""];
    }),
  );
  const foot = Object.values(c.SENDER_WORDS).flatMap((w) => [
    w.visitProposal("Harbor Studio"),
    w.visitBooked("Harbor Studio"),
    w.visitInTouch("Harbor Studio"),
  ]);
  // Every version of every starter, the retired among them: WhatsApp's, the email's and the text's.
  const starters = c.STARTER_TEMPLATES.flatMap((s) =>
    [s.texts, s.email ?? {}, s.sms ?? {}].flatMap((set) =>
      Object.values(set).flatMap((t) => [t.body, t.subject ?? "", t.footer ?? ""]),
    ),
  );
  const said = [...consent, ...paper, ...unsubscribe, ...foot, ...starters];
  assert.ok(said.length > 20, "the builders were read");
  assert.deepEqual(
    said.filter((s) => VISIT.test(s)),
    [],
    "a customer reads the glossary's word, appointment (cita), whatever the business's trade",
  );
  assert.equal(
    c.CONVERSATIONAL_ASK_TITLE,
    "Messages about your appointment",
    "the consent page's heading, in one place",
  );
  assert.equal(pages[0].asks[0].title, c.CONVERSATIONAL_ASK_TITLE);
});

test("the scanner reads what a reader reads", () => {
  const lines = readerLines(
    `// a stylist in a comment\nconst a = c.therapist; /* salon */ const b = "salon"; // trade-word: kept on purpose\nconst c = "haircut";\n/* stylist\n balayage */\nconst d = 1;`,
  );
  assert.deepEqual(
    lines.map((l) => l.text.trim()),
    ['const c = "haircut";', "const d = 1;"],
    "a comment is not copy, an exempted line is skipped whole, a member access is not a word",
  );
});
