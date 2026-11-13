/**
 * A turn whose first reads brought in words from outside the business (server/ask/loop/turn-head.ts openTurn, D33 of the
 * answers canvas): a question on a page that holds none can still name another page's read (cross-page.ts crossPagePlan:
 * "who wrote recently?" reads the Inbox before round one), and a question can come with a file. Either way the turn has
 * read a stranger's words before the model was asked, so its cards are never Ask's to run alone. The ports are stood in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { openTurn } = await import(at("apps/dashboard/src/server/ask/loop/turn-head.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt/stable-system.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-11-13T15:00:00Z");

/** The reads it made before round one, by name. */
let read;
const ports = {
  round: async () => {
    throw new Error("no round is asked here");
  },
  context: async () => {
    throw new Error("no page is built here");
  },
  shape: async () => "",
  tool: async (_tc, run) => {
    read.push(run.name);
    return { result: "[]", isError: false };
  },
  propose: async () => {
    throw new Error("nothing is proposed here");
  },
};

const opened = async (text) => {
  read = [];
  const turn = await openTurn(
    {
      ctx: { supabase: fakeDb({}), userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", params: {} },
      tenantId: TENANT,
      role: "owner",
      facts: workspaceFacts("Harbor", "UTC", null, NOW, []),
      timezone: "UTC",
      personLabel: "owner",
      language: "en",
      scope: null,
      surface: "settings",
      history: [],
      text,
      emit: () => {},
      now: NOW,
    },
    ports,
  );
  clearTimeout(turn.timer);
  return turn;
};

test("a question on Settings that reads the Inbox first: the turn has read a stranger's words", async () => {
  const turn = await opened("who wrote recently?");
  assert.ok(read.includes("inbox"), "the Inbox was read before round one");
  assert.equal(turn.strangers, true);
});

test("a question on Settings that reads nothing of anyone else's: the turn's cards stay the member's own", async () => {
  const turn = await opened("make the replies wait for me");
  assert.deepEqual(read, []);
  assert.equal(turn.strangers, false);
});
