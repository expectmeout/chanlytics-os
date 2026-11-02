/**
 * The way to a settings card (2 Nov 2026): asked to teach the receptionist a fact, Ask answered "I couldn't make a card"
 * 1 time in 4, with no tool called, though its search finds the card. propose_settings stays out of the core: 7,237
 * characters on every request would take the owner's core from 30,960 towards its ceiling of 40,000, for a card nobody made
 * in 45 days of production. So the words the model reads on the way there say to search: `remember`, the core tool such a
 * request lands on, and the rule that lets it say a card cannot be made. These hold the words; only a real turn proves
 * what they do, and approve_that_one_settings runs one every week.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { ASK_SECTIONS } = await import(at("apps/dashboard/src/server/ask/prompt-rules.ts"));

const owners = toApiTools("owner", false, true);
const offered = (name) => owners.find((d) => d.name === name);

test("propose_settings is found by the search: it stays out of the cached prefix", () => {
  assert.equal(offered("propose_settings").defer_loading, true);
});

test("remember sends a fact for the receptionist to the search, by the name it will find there", () => {
  assert.match(offered("remember").description, /find propose_settings with tool search/);
});

test("a card is said to be out of reach only after a search for it found none", () => {
  const cards = ASK_SECTIONS.find((s) => s.title.startsWith("Cards")).rules.join(" ");
  assert.match(cards, /or a tool search finds nothing that can propose it, say what they can do and where/);
});
