/**
 * A run that was not told to spend asks the model for nothing.
 *
 * Measured 2 Nov 2026 on the workspace the nightly signs in to: seven rounds a run, about $1.15 a day, on the balance
 * the receptionist answers customers with, and none of them chosen. Three were the morning Today asks for as its owner
 * arrives, three the warm that words typed on the Line send ahead of a question, one the turn Today's Ask why asks. The
 * specs gated their own paid tests, so nothing in them looked like spending: the page did it. e2e/session.ts stops those
 * doors at the sign-in every signed-in spec goes through, and these run that sign-in over a page in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2e-ref.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.E2E_USER_EMAIL = "e2e-owner@example.com";
process.env.E2E_BASE_URL = "https://app.example.com";
delete process.env.E2E_PAID_MODEL;
delete process.env.E2E_PAID_LEADS;

const { signIn } = await import("../../../../e2e/session.ts");

// The two calls a session is minted with (session.ts mintFresh); no other leaves this file.
globalThis.fetch = async (url) =>
  String(url).includes("generate_link")
    ? Response.json({ hashed_token: "hash" })
    : Response.json({ access_token: "a", refresh_token: "r", expires_in: 3600, expires_at: 2_000_000_000, user: {} });

const WORKSPACE = "aaaaaaaa-0000-4000-8000-000000000001";
const doorUrl = (door) => `https://app.example.com/api/v1/${door}?workspace=${WORKSPACE}`;

/** A page signed in, and what a request of its meets: routes newest first, as Playwright runs them. */
async function aPageSignedIn() {
  const routes = [];
  const context = {
    addCookies: async () => {},
    route: async (match, handler) => void routes.unshift({ match, handler }),
  };
  await signIn({ context: () => context });
  return async (method, url) => {
    for (const { match, handler } of routes) {
      if (!match.test(url)) continue;
      let met = "";
      await handler({
        request: () => ({ method: () => method, url: () => url }),
        abort: async () => void (met = "stopped"),
        continue: async () => void (met = "sent"),
        fallback: async () => void (met = "passed on"),
      });
      if (met !== "passed on") return met;
    }
    return "sent";
  };
}

const ASKS_THE_MODEL = ["POST ask", "POST ask/morning", "POST ask/warm/model"];
/** Counted as questions, and no model runs: an idea's card is its own plan, a quick answer the page already drew. */
const ASKS_NO_MODEL = ["POST ask/idea", "POST ask/quick"];

for (const key of ASKS_THE_MODEL)
  test(`signed in without a paid switch, ${key} never leaves the browser`, async () => {
    const meets = await aPageSignedIn();
    const door = key.replace("POST ", "");
    assert.equal(await meets("POST", doorUrl(door)), "stopped");
    assert.equal(
      await meets("POST", `https://app.example.com/api/v1/${door}`),
      "stopped",
      "and with no workspace named",
    );
  });

test("what asks no model goes as it did: the morning's read, the page's warm, a quick answer, an idea, a thread", async () => {
  const meets = await aPageSignedIn();
  assert.equal(await meets("GET", doorUrl("ask/morning")), "sent", "Today still reads its morning");
  assert.equal(await meets("POST", doorUrl("ask/warm")), "sent", "reads the page, no model");
  assert.equal(await meets("POST", doorUrl("ask/quick")), "sent");
  assert.equal(await meets("POST", doorUrl("ask/idea")), "sent");
  assert.equal(await meets("GET", doorUrl("ask/threads")), "sent");
  assert.equal(await meets("DELETE", doorUrl("ask/threads/1")), "sent");
});

for (const paid of ["E2E_PAID_MODEL", "E2E_PAID_LEADS"])
  test(`${paid}=1 is a run told to spend: nothing is stopped, a morning included`, async (t) => {
    process.env[paid] = "1";
    t.after(() => delete process.env[paid]);
    const meets = await aPageSignedIn();
    for (const key of ASKS_THE_MODEL) assert.equal(await meets("POST", doorUrl(key.replace("POST ", ""))), "sent", key);
  });

test("every Ask door counted as a question is said to ask the model or not, so a new one cannot slip past the stop", () => {
  const { routes } = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8"));
  const doors = Object.entries(routes)
    .filter(([key, p]) => /^POST ask(\/|$)/.test(key) && p.rate === "ask")
    .map(([key]) => key);
  assert.deepEqual(doors.sort(), [...ASKS_THE_MODEL, ...ASKS_NO_MODEL].sort());
});
