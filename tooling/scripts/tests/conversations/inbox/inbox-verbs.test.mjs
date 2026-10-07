/**
 * The Inbox's verbs, run over a fake wire (surfaces/inbox/verbs.ts, moved from legacy-bridge/inbox-verbs.ts, decision 0015
 * step 3): the three rules a person meets without knowing they are there.
 *
 * - One verb per thread at a time: pressed twice while the first is out, the second is told it is still working and
 *   asks nothing; a different verb on the same thread goes out.
 * - A bulk act keeps four asks out at once, and asks once per thread.
 * - A reply's idempotency key names its intent -- its trimmed words, or the template's name and language -- so a retry
 *   after a timeout is one message, and two different templates are two.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, {
  location: {
    pathname: "/w/marisas",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [
    { id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: "America/New_York" },
  ],
  __ACTIVE_WORKSPACE: "t1",
  setInterval: () => 1,
  clearInterval() {},
});
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const { inboxBulk, inboxVerb } = await quiet(() => import("../../../../../apps/dashboard/src/surfaces/inbox/verbs.ts"));
const thread = (n) => ({ conversationId: `c${n}`, escalationId: null, who: `Person ${n}` });
const ok = (id) => json(200, { ok: true, data: { conversation: { id, state: "open" } } });

test("a verb pressed twice on one thread is asked once and told it is still working; another verb on that thread goes out", async () => {
  const posts = [];
  const gates = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if ((init.method ?? "GET") !== "POST") return json(200, { ok: true, data: {} });
    posts.push(u.pathname);
    await new Promise((r) => gates.push(r));
    return ok("c1");
  };
  const t = thread(1);
  const first = quiet(() => inboxVerb(t, "take-over", undefined, { refresh: false }));
  await tick(20);
  const pressedAgain = await quiet(() => inboxVerb(t, "take-over", undefined, { refresh: false }));
  assert.equal(pressedAgain.ok, false, "the second press is refused");
  assert.match(pressedAgain.message, /Still working on that one/);
  const other = quiet(() => inboxVerb(t, "hand-back", undefined, { refresh: false }));
  await tick(20);
  assert.deepEqual(
    posts,
    ["/api/v1/conversations/c1/take-over", "/api/v1/conversations/c1/hand-back"],
    "one ask for the verb pressed twice, and one for the other verb",
  );
  gates.splice(0).forEach((g) => g());
  assert.equal((await first).ok, true);
  assert.equal((await other).ok, true);
});

test("a bulk act keeps four asks out at once, and asks once per thread", async () => {
  let out = 0;
  let peak = 0;
  const posts = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if ((init.method ?? "GET") !== "POST") return json(200, { ok: true, data: {} });
    posts.push(u.pathname);
    out += 1;
    peak = Math.max(peak, out);
    await tick(15);
    out -= 1;
    return ok(u.pathname.split("/")[4]);
  };
  const threads = Array.from({ length: 9 }, (_, i) => thread(i));
  const result = await quiet(() => inboxBulk(threads, "archive"));
  assert.equal(peak, 4, "four out at once, never more, and the queue keeps them full");
  assert.equal(posts.length, 9, "one ask per thread");
  assert.equal(result.done.length, 9);
  assert.deepEqual(result.refused, []);
});

test("a reply's idempotency key names its intent: trimmed words, or the template's name and language", async () => {
  const keys = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if ((init.method ?? "GET") !== "POST") return json(200, { ok: true, data: {} });
    keys.push(init.headers?.["idempotency-key"] ?? null);
    return ok(u.pathname.split("/")[4]);
  };
  const t = thread(1);
  const say = (verb, payload) => quiet(() => inboxVerb(t, verb, payload, { refresh: false }));
  await say("reply", { text: "See you at four" });
  await say("reply", { text: "  See you at four \n" });
  await say("reply", { text: "See you at five" });
  await say("reply-template", { template: { name: "reminder", language: "en" } });
  await say("reply-template", { template: { name: "reminder", language: "es" } });
  await say("reply-template", { template: { name: "follow_up", language: "en" } });
  const [words, wordsSpaced, otherWords, reminderEn, reminderEs, followUp] = keys;
  assert.ok(words && reminderEn, "a reply carries a key");
  assert.equal(words, wordsSpaced, "the same words, trimmed, are the same intent");
  assert.notEqual(words, otherWords, "other words are another");
  assert.equal(
    new Set([reminderEn, reminderEs, followUp, words]).size,
    4,
    "each template and language is its own intent",
  );
});
