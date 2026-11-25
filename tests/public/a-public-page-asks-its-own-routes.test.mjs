/**
 * A page's call to one of the dashboard's own routes that the typed client does not hold (decision 0149, step 4):
 * sign-up's, a lead's preview's doors, and the version a tab checks, through `askOwnRoute`
 * (apps/dashboard/src/client/own-route.ts). Same-origin, its JSON read, never thrown: no answer is status 0, and the page
 * says what that means. Before it each page wrote its own fetch and read its answer its own way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { askOwnRoute } = await importSrc("apps/dashboard/src/client/own-route.ts");
const { previewVerbs } = await importSrc("apps/dashboard/src/surfaces/preview/verbs.ts");

test("an answer is its status, whether it was a yes, and its JSON; one that is not JSON is none", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, data: { posture: "invite" } }), { status: 200 });
  };
  const yes = await askOwnRoute("/api/v1/signup", { headers: { accept: "application/json" } }, { fetch });
  assert.deepEqual(yes, { status: 200, ok: true, json: { ok: true, data: { posture: "invite" } } });
  assert.deepEqual(calls, [{ url: "/api/v1/signup", init: { headers: { accept: "application/json" } } }]);

  const page = await askOwnRoute("/api/version", {}, { fetch: async () => new Response("<html>", { status: 502 }) });
  assert.deepEqual(page, { status: 502, ok: false, json: null });
});

test("no answer at all is never thrown: status 0, and the page says what that means", async () => {
  const none = await askOwnRoute(
    "/api/v1/signup",
    { method: "POST", body: "{}" },
    {
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    },
  );
  assert.deepEqual(none, { status: 0, ok: false, json: null });
});

test("a preview's door is asked through it, by the page's own fetch, and a refusal keeps its words and its wait", async () => {
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push({ url, method: init.method, body: init.body });
    return new Response(
      JSON.stringify({ ok: false, error: { message: "One at a time.", details: { retry_after_s: 60 } } }),
      { status: 429 },
    );
  };
  try {
    const opened = await previewVerbs.opened("tok/en");
    assert.deepEqual(opened, { ok: false, message: "One at a time.", waitS: 60 });
    assert.deepEqual(asked, [{ url: "/api/v1/previews/tok%2Fen/opened", method: "POST", body: "{}" }]);
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    assert.deepEqual(await previewVerbs.opened("t1"), { ok: false, message: null, waitS: null }, "offline");
  } finally {
    globalThis.fetch = real;
  }
});
