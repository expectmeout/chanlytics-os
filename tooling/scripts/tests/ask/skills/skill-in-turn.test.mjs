/**
 * Ask's skills inside a turn (contracts ask-skills): a question that asks for a customer message carries the message
 * writer's guide in the turn's own words (cross-page.ts withSkillGuides), and a question that asks for none carries
 * nothing more; the tools the turn runs are handed the question in the person's words and the turn's end (loop.ts
 * toolContextOf), which the writer behind a message card reads (server/ask/skills); and the guide read answers a skill's
 * guide by its id.
 *
 * Executed through the real loop, its ports stubbed: the model a script, the reads and the cards captured.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
delete process.env.ASK_MODEL;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { withSkillGuides } = await import(at("apps/dashboard/src/server/ask/cross-page.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { guideTool } = await import(at("apps/dashboard/src/server/ask/tools/read/guide.ts"));
const C = await import("@chanlytics/contracts");

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TZ = "America/New_York";
const GUIDE = C.skillGuide("customer_message");

const NONE = { kind: "none", id: "", label: "" };
const answer = (headline) => ({
  type: "text",
  id: "",
  name: "",
  json: "",
  text: JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
    do: { open: { source: NONE, label: "", now: false }, next: [] },
    language: "en",
  }),
});
const ROUND = (blocks) => ({ blocks, stopReason: "end_turn", streamError: null });

/** A turn on People (no page read ahead), its model scripted, its reads and cards captured. */
function turn(text, rounds) {
  const requests = [];
  const seen = { reads: [], proposals: [] };
  const round = async (c) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return r;
  };
  const ports = {
    round,
    context: async () => null,
    shape: async () => "The workspace: Harbor",
    tool: async (tc, run) => {
      seen.reads.push({ tc, run });
      return { result: "{}", isError: false };
    },
    propose: async (tc, name, args) => {
      seen.proposals.push({ tc, name, args });
      return {
        proposal: {
          id: "p-1",
          kind: "message",
          title: "New message: winback, in English",
          summary: "On WhatsApp: Hi Dani",
          payload: {},
          needs: "operator",
          undo: null,
          made_at: new Date().toISOString(),
        },
        result: JSON.stringify({ proposed: true }),
        isError: false,
      };
    },
  };
  const input = {
    ctx: { supabase: fakeDb({}, {}, {}), userId: "u1", email: "ada@example.com", params: {} },
    tenantId: A,
    role: "operator",
    facts: workspaceFacts("Harbor", TZ, null, new Date(), []),
    timezone: TZ,
    personLabel: "ada@example.com (operator)",
    language: "en",
    scope: null,
    surface: "people",
    history: [],
    text,
    emit: () => {},
  };
  return { input, ports, requests, seen };
}

/**
 * Every text the person's message carries in a request: the turn's words and the question. A draft's turn has an effort
 * message after it (effort.ts), so it is the last of the user's, not the last of all.
 */
const textsOf = (request) =>
  (request.messages.findLast((m) => m.role === "user")?.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => String(b.text));

test("a question that asks for a message carries the writer's guide in the turn's words; one that does not, nothing more", async () => {
  const asked = turn("Write a win-back message for people we haven't seen since summer", [
    ROUND([answer("Here it is.")]),
  ]);
  await runAskTurn(asked.input, asked.ports);
  const words = textsOf(asked.requests[0]);
  assert.ok(
    words.some((t) => t.endsWith(`\n\n${GUIDE}`)),
    "the guide follows the turn's words, in the same block",
  );
  assert.equal(words.at(-1), asked.input.text, "the question itself stays last and untouched");

  const plain = turn("Who needs me?", [ROUND([answer("Nobody.")])]);
  await runAskTurn(plain.input, plain.ports);
  assert.ok(
    textsOf(plain.requests[0]).every((t) => !t.includes("Skill: Customer message writer")),
    "no guide where none was asked for",
  );
});

test("the guide rides every form of the turn's words, and a question in Spanish asks for it too", () => {
  const words = (live, dropped) => ({ type: "text", text: `words ${live} ${dropped}` });
  const guided = withSkillGuides(words, "Escríbeme un mensaje para los clientes de siempre");
  for (const [live, dropped] of [
    [true, false],
    [false, false],
    [false, true],
  ])
    assert.equal(guided(live, dropped).text, `words ${live} ${dropped}\n\n${GUIDE}`);
  assert.equal(withSkillGuides(words, "¿quién me escribió hoy?"), words, "no skill asked: the words as they were");
  assert.equal(withSkillGuides(words, "how did last week go?"), words);
});

/** A round that calls propose_sequence's action message: what a card's tool is handed is captured. */
const MESSAGE_CALL = ROUND([
  {
    type: "tool_use",
    id: "t-1",
    name: "propose_sequence",
    text: "",
    json: JSON.stringify({ action: "message", name: "winback", language: "en", category: "marketing", versions: {} }),
  },
]);

/** The turn's end its card's tool was handed, and the window it must fall in: its start plus `budget`. */
async function endHanded(text, budget, spoken) {
  const t = turn(text, [MESSAGE_CALL]);
  if (spoken) t.input.spoken = true;
  const before = Date.now();
  const r = await runAskTurn(t.input, t.ports);
  assert.equal(r.failed, false, r.failure ?? "");
  const [made] = t.seen.proposals;
  assert.ok(made, "the card's tool ran");
  assert.ok(made.tc.endsAt >= before + budget && made.tc.endsAt <= Date.now() + budget, `${made.tc.endsAt}`);
  return made.tc;
}

test("a card's tool is handed the question in the person's words and the turn's end", async () => {
  const text = "Write a win-back message for people we haven't seen since summer";
  const tc = await endHanded(text, C.ASK_TURN_BUDGET_MS, false);
  assert.equal(tc.question, text);
});

test("a spoken turn hands its tools its own, shorter end", async () => {
  assert.ok(C.ASK_SPOKEN_TURN_BUDGET_MS < C.ASK_TURN_BUDGET_MS, "a listener waits less than a reader");
  await endHanded("Write a short reminder text", C.ASK_SPOKEN_TURN_BUDGET_MS, true);
});

test("the guide read answers a skill's guide by its id, and names the skills for a name that is none", async () => {
  const run = guideTool.actions[""].run;
  assert.deepEqual(await run({}, { skill: "customer_message" }), { skill: "customer_message", guide: GUIDE });
  assert.deepEqual(await run({}, { skill: "review_reply" }), {
    error: "No skill is called review_reply. The skills: customer_message.",
  });
  assert.ok(guideTool.actions[""].input.safeParse({}).success, "with no skill it reads the product as before");
});
