/**
 * A screen says what docs/words.md says, and each measure of it is kept honest on a source written for it. `_words.mjs`
 * has the measures and `_screen-words.mjs` the list; what still falls is check:debt's (WORD_RATCHETS). One number is at
 * zero and held outright: outside the demo's sample screens, no page calls the product's AI by another name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { parse } from "../../_ast.mjs";
import { screenWordsJudged } from "../../../tooling/scripts/eval-ask-words.mjs";
import { FAMILIES, neverOnAScreen, sentencesOf, voiceMarksIn } from "./_screen-words.mjs";
import {
  WORD_RATCHETS,
  audienceOf,
  filesReadBy,
  isProse,
  isWords,
  refusalWordsIn,
  screenWordsIn,
  titleTooltipsIn,
  voiceMarksOf,
  wordsReadIn,
} from "./_words.mjs";

const source = (...lines) =>
  ts.createSourceFile("probe.tsx", lines.join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const said = (...lines) => wordsReadIn(source(...lines)).map((w) => w.text);
const found = (text, families) => neverOnAScreen(text, families).map((w) => `${w.family}:${w.word}`);

test("the list catches a whole word a person reads, by its family", () => {
  assert.deepEqual(FAMILIES, ["ai", "code", "provider", "retired", "failure"]);
  assert.deepEqual(found("Your receptionist is paused"), ["ai:receptionist"]);
  assert.deepEqual(found("Agents stood down. Claude finds them."), ["ai:Agents", "ai:Claude"]);
  assert.deepEqual(found("It needs provisioning in the database"), ["code:provisioning", "code:database"]);
  assert.deepEqual(found("Twilio refused it (error 30007). Send a template.", ["provider"]), [
    "provider:Twilio",
    "provider:template",
    "provider:error 30007",
  ]);
  assert.deepEqual(found("Hand the thread back and pause the sequence"), ["retired:thread", "retired:sequence"]);
  assert.deepEqual(found("It waits for your OK"), ["retired:your OK"]);
  assert.deepEqual(found("Your calendar could not be read. Something went wrong."), [
    "failure:could not",
    "failure:Something went wrong",
  ]);
  assert.deepEqual(found("Couldn't load the calendar · Try again"), [], "the page's own words pass");
  assert.deepEqual(found("the thread", ["ai", "code"]), [], "only the families asked for");
});

test("a word inside an id, a path, a class or a longer word is not a word", () => {
  for (const id of ["thread-row", "ask_tools", "/api/threads", "x.agent", "agent-rail", "templateId", "#sequence"])
    assert.deepEqual(found(id), [], id);
  assert.deepEqual(found("Pon tu teléfono con el botón de abajo"), [], "botón holds no bot");
  assert.deepEqual(found("1 envío en espera"), [], "envío holds no env");
});

test("Ask is the AI's old name only where it stands as a name", () => {
  assert.deepEqual(found("Made by Ask"), ["ai:Ask"]);
  assert.deepEqual(found("Ask's journal"), ["ai:Ask's"]);
  assert.deepEqual(found("Ask is writing words WhatsApp can take"), ["ai:Ask"]);
  for (const verb of ["Ask Chanlytics", "Ask them to bring it.", "Set to Ask me first", "ask a question"])
    assert.deepEqual(found(verb, ["ai"]), [], verb);
});

test("AI takes no article, and its limit keeps its name", () => {
  assert.deepEqual(found("The AI is down", ["ai"]), ["ai:The AI"]);
  assert.deepEqual(found("Pause your AI", ["ai"]), ["ai:your AI"]);
  assert.deepEqual(found("AI is paused. The daily AI limit is reached.", ["ai"]), []);
  assert.deepEqual(found("the AI limit", ["ai"]), []);
});

test("what a person reads is a sentence, a label or a JSX text, where a person would read it", () => {
  assert.deepEqual(
    said(
      'const WORDS = { title: "Daily limit", hint: "Sends unless you stop it" };',
      "export const Row = () => <p>Nothing here yet</p>;",
      "const line = `${n} people waiting`;",
    ),
    ["Daily limit", "Sends unless you stop it", "Nothing here yet", "… people waiting"],
  );
  assert.ok(
    isWords("Paused") && isWords("no reply yet") && !isWords("thread") && !isWords("POST calendar/visits/[id]"),
  );
  assert.ok(!isWords("select id from threads where tenant_id = $1") && !isWords("var(--ink-dim)"));
});

test("an id's place, a developer's and a model's are not read", () => {
  assert.deepEqual(
    said(
      'import { x } from "./the thread";',
      'type Mode = "The thread";',
      'const cls = <div className="The thread" data-testid="The thread" />;',
      'if (kind === "The thread") throw new Error("The thread is gone");',
      'log.warn("thread_lost", { why: "The thread is gone" });',
      'const row = { kind: "The thread", event: "The thread" };',
      "const q = sql`select The thread`;",
      'const shape = z.string().describe("The thread it belongs to");',
      'const SYSTEM_PROMPT = ["You answer about the thread.", "Never name the tenant."];',
      "function replySystemPrompt() { return `Read the thread and answer`; }",
    ),
    [],
  );
});

test("a line keeps its word when it says why, and so does everything under a marked declaration", () => {
  const text = "It says it's the AI assistant";
  assert.deepEqual(said(`const a = "${text}";`), [text]);
  assert.deepEqual(said(`const a = "${text}"; // screen-word: what callers hear`), []);
  assert.deepEqual(said("// screen-word: what callers hear", `const a = "${text}";`), []);
  assert.deepEqual(
    said(
      "/**",
      " * What the paused line is told.",
      " * screen-word: said to the voice model.",
      " */",
      "export function pausedFacts() {",
      `  return ["${text}", "Their receptionist is paused"];`,
      "}",
      'const after = "Their receptionist answers";',
    ),
    ["Their receptionist answers"],
    "the mark covers its declaration, and nothing after it",
  );
  assert.deepEqual(
    said("const NOTES = {", "  // screen-word: a note AI reads", `  draft: "${text}",`, '  label: "The thread",', "};"),
    ["The thread"],
    "a marked property keeps its own words alone",
  );
});

test("a server's words for a person are a refusal's sentence and an answer's message", () => {
  const sf = source(
    'throw new AppError("conflict", "The thread is closed.");',
    'return refuse(402, "payment_required", "Ask is off while this workspace is paused.");',
    'return { ok: false, message: "The assistant is not available." };',
    'const note = "The thread was read by the sweep";',
    'throw new Error("The thread has no tenant");',
    'await pageOperator({ subject: "The receptionist stopped" });',
  );
  assert.deepEqual(
    refusalWordsIn(sf).map((w) => w.text),
    ["The thread is closed.", "Ask is off while this workspace is paused.", "The assistant is not available."],
  );
});

test("a file's words are counted by family", () => {
  assert.deepEqual(
    screenWordsIn(
      source('const a = "Your receptionist could not reach the thread";', "const b = <b>Send a template</b>;"),
    ),
    { ai: 1, retired: 1, failure: 1, provider: 1 },
  );
  assert.deepEqual(screenWordsIn(source('const a = "AI replied · Open the conversation";')), {});
});

test("the voice's marks: we, an apology, a click, a dash, a semicolon, a Your label, a long line, a paragraph", () => {
  assert.deepEqual(voiceMarksIn("We couldn't load our list"), { we: 2 });
  assert.deepEqual(voiceMarksIn("Sorry, click here"), { sorry: 1, click: 1 });
  assert.deepEqual(voiceMarksIn("Your goal"), { your: 1 });
  assert.deepEqual(voiceMarksIn("Your number is ready."), {}, "a sentence about the owner's own thing keeps its Your");
  assert.deepEqual(voiceMarksIn("Made in the US"), {}, "the country is not us");
  assert.equal(sentencesOf("One. Two? Three!"), 3);
  const long = `${"A calm sentence that goes on and on. ".repeat(4)}`.trim();
  assert.deepEqual(voiceMarksOf(source(`const a = "${long}";`, "const b = <p>Held — it waits; you decide</p>;")), {
    long: 1,
    sentences: 1,
    emDash: 1,
    semicolon: 1,
  });
  assert.ok(isProse("Held, and it waits for you") && !isProse("id; name; created_at; updated_at"));
  assert.deepEqual(
    voiceMarksOf(source('const cols = "id; name; created_at; updated_at";')),
    {},
    "a list of ids is no sentence",
  );
  assert.deepEqual(
    said("const p = <p>Couldn&apos;t load the list, and that&rsquo;s all &amp; nothing more</p>;"),
    ["Couldn't load the list, and that’s all & nothing more"],
    "a JSX text is read as the screen draws its entities",
  );
  assert.deepEqual(
    voiceMarksOf(source("const p = <p>It&apos;s held &mdash; it waits for you to look</p>;")),
    { emDash: 1 },
    "an entity's own semicolon is no semicolon, and a dash written as one is still a dash",
  );
});

test("the notes a page's reads keep on what they leave out are a developer's", () => {
  assert.deepEqual(
    said(
      'const o = { ...declareReads("person", { omit: [{ tables: ["x"], why: "the page names the business a person works at" }] }) };',
    ),
    [],
  );
});

test("a browser's tooltip is a title on an element, never a component's own title", () => {
  const sf = source(
    'const a = <span title="Sent at 2 PM">2 PM</span>;',
    'const b = <Button title="Delete list" />;',
    'const c = <Sheet title="New campaign" />;',
  );
  assert.equal(titleTooltipsIn(sf), 2);
});

test("who reads a file is said by where it lives", () => {
  const reads = (file) => audienceOf(file);
  assert.equal(reads("apps/dashboard/src/surfaces/today/page.tsx"), "owner");
  assert.equal(reads("packages/contracts/src/today/bands.ts"), "owner");
  assert.equal(reads("apps/dashboard/src/surfaces/console/health/page.tsx"), "staff");
  assert.equal(reads("packages/contracts/src/console/support-playbooks.ts"), "staff");
  assert.equal(reads("apps/dashboard/src/yes/page.tsx"), "customer");
  assert.equal(reads("apps/dashboard/src/server/ask/prompt-rules.ts"), "taught");
  assert.equal(reads("apps/dashboard/src/server/campaigns/policy-write.ts"), "server");
  assert.equal(reads("apps/edge/lib/inbound/steps.ts"), "server");
  assert.equal(reads("apps/dashboard/src/bridge/refresh-map.ts"), "nobody");
  assert.equal(reads("packages/contracts/src/config/workspace-config/compose.ts"), "nobody");
  assert.equal(reads("packages/db/src/repositories/people/people.ts"), null);
});

/**
 * The demo's sample screens, which still call the AI an agent: invented rows a prospect reads first, renamed in the
 * Inbox's pass (docs/words.md, the cleanup, 3). The list may only shrink.
 */
const THE_DEMO_STILL_SAYS_AGENT = [];

test("outside the demo's sample screens, no page calls the product's AI by another name", () => {
  const naming = filesReadBy("owner").filter((f) => Object.keys(screenWordsIn(parse(f), ["ai"])).length > 0);
  assert.deepEqual(
    naming.filter((f) => !THE_DEMO_STILL_SAYS_AGENT.includes(f)),
    [],
    "the product's AI is called AI (docs/words.md): say AI, or say why the line keeps its word, `screen-word: <why>`",
  );
  assert.deepEqual(
    THE_DEMO_STILL_SAYS_AGENT.filter((f) => !naming.includes(f)),
    [],
    "this screen says AI now: take it off the list",
  );
});

test("an answer of AI's is read for the same words: another name for itself fails, a word its tools teach is noted", () => {
  assert.deepEqual(screenWordsJudged("I answered 12 of 16 messages. Open the conversation to reply."), {
    fails: [],
    notes: [],
  });
  assert.deepEqual(screenWordsJudged("The receptionist never decides a refund. Leads are businesses Claude found."), {
    fails: ["the answer calls AI by another name (receptionist, claude): it is AI, and it says I"],
    notes: [],
  });
  assert.deepEqual(screenWordsJudged("I hand the thread to you. Robin's thread is the newest; the sequence waits."), {
    fails: [],
    notes: ["words that never reach a screen: thread ×2, sequence"],
  });
  assert.deepEqual(
    screenWordsJudged("Casey wrote “can I talk to your receptionist?” and I answered."),
    { fails: [], notes: [] },
    "what a person wrote, quoted, is theirs",
  );
  assert.deepEqual(
    screenWordsJudged("I found 3 real estate agents in Austin.", ["agents"]),
    { fails: [], notes: [] },
    "a case whose people are agents by trade keeps the word",
  );
  assert.equal(screenWordsJudged("I found 3 real estate agents in Austin.").fails.length, 1);
});

test("the ratchets say what they hold and read the tree", () => {
  assert.deepEqual(WORD_RATCHETS.map((r) => r.file).sort(), [
    "customer-words.json",
    "screen-voice.json",
    "screen-words.json",
    "server-words.json",
    "taught-words.json",
    "title-tooltips.json",
  ]);
  // A ratchet that has fallen to nothing is earned while it still reads its files: the customer's pages lost their last
  // provider word on 16 Nov 2026 ("the carriers" became the phone networks), the pages their last word that never
  // reaches a screen on 25 Nov 2026, what AI is taught its last the same day (what is left are the tools' own names,
  // each marked), and the server's refusals theirs on 26 Nov 2026 (what is left is staff's and operators', each marked).
  const EARNED_ZERO = {
    "customer-words.json": () => filesReadBy("customer").length,
    "screen-words.json": () => filesReadBy("owner").length,
    "server-words.json": () => filesReadBy("server").length,
    "taught-words.json": () => filesReadBy("taught").length,
  };
  for (const r of WORD_RATCHETS) {
    assert.ok(r.advice && r.name, r.file);
    assert.ok(
      Object.keys(r.measure()).length > 0 || (EARNED_ZERO[r.file]?.() ?? 0) > 0,
      `${r.file} measured nothing: a falling number should be earned, not a broken reading`,
    );
  }
});
