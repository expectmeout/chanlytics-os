/**
 * What Google's wire says, for a post a send may have made (channels google): each listed post's words, so a send that
 * got no answer can be found by them as Instagram's is by its caption; and an ask that got no answer, typed, saying
 * whether it provably never reached Google. Before it, the edge read the end of an error's words for `breaker_open`,
 * and a call this door held for a "too many" or for room said nothing the words would match (handed on by lane 5,
 * 28 Nov 2026).
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GoogleUnanswered, listLocalPosts, placesFetch } from "@chanlytics/channels/google";
import { fetchFromProvider, resetBreakers } from "@chanlytics/channels/shared";

beforeEach(() => resetBreakers());

const PARENT = "accounts/1/locations/2";

test("each listed post says its words, as Google holds them", async () => {
  const http = async () => ({
    status: 200,
    body: JSON.stringify({
      localPosts: [
        {
          name: `${PARENT}/localPosts/p1`,
          state: "LIVE",
          createTime: "2026-11-27T10:00:00Z",
          summary: "Open late Friday",
        },
        { name: `${PARENT}/localPosts/p2`, state: "PROCESSING", createTime: "2026-11-27T11:00:00Z" },
      ],
    }),
  });
  const page = await listLocalPosts(http, "tok", PARENT, null);
  assert.deepEqual(
    page.posts.map((p) => [p.name.split("/").at(-1), p.summary]),
    [
      ["p1", "Open late Friday"],
      ["p2", null],
    ],
  );
});

test("an ask that got no answer is typed: it says whether it never reached Google, in the words it always said", async () => {
  const deadFetch = async () => new Response("{}", { status: 503 });
  for (let i = 0; i < 5; i++) await fetchFromProvider("google", "u", { timeoutMs: 1_000 }, { fetch: deadFetch });
  const held = await placesFetch(deadFetch)({
    url: "https://mybusiness.example.com/x",
    method: "POST",
    headers: {},
  }).then(
    () => null,
    (e) => e,
  );
  assert.ok(held instanceof GoogleUnanswered, "the breaker held it: typed");
  assert.deepEqual([held.fault, held.neverLeft, held.message], ["breaker_open", true, "google: breaker_open"]);

  resetBreakers();
  const hung = async () => {
    throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  };
  const lost = await placesFetch(hung)({ url: "https://mybusiness.example.com/x", method: "POST", headers: {} }).then(
    () => null,
    (e) => e,
  );
  assert.ok(lost instanceof GoogleUnanswered);
  assert.deepEqual(
    [lost.fault, lost.neverLeft],
    ["timeout", false],
    "a timeout may have made the post: it may have left",
  );
});
