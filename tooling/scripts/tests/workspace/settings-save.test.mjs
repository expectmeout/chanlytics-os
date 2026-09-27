/**
 * The settings save from the tab, executed.
 *
 * A save that lost the race came back as "someone else saved settings after
 * you loaded them", and the tab kept the version it had loaded: every later
 * save from it failed the same way until a reload, because nothing re-read
 * the surface on a conflict. Now the bridge re-reads it, and the Business
 * card says who last changed the config from the row's own author.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { saveSettings } = await import(at("apps/dashboard/src/legacy-bridge/inbox-verbs.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const refusal = (status, code, message) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), { status });

function tab(answer) {
  const sent = [];
  const events = [];
  const client = createApi({
    fetch: async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return answer();
    },
    workspace: () => A,
    onSignedOut: () => events.push("signed-out"),
    onChooseWorkspace: () => events.push("choose-workspace"),
    refresh: async (key) => {
      events.push(`refresh:${key}`);
    },
    now: () => 1_000,
  });
  return { client, sent, events };
}

test("a save the server accepts: the body carries the config and the version, the caller is told the moment it lands, and the map re-reads", async () => {
  const t = tab(() => envelope({ config: { brain: { business_name: "Harbor" } }, version: 4 }));
  const order = [];
  const r = await saveSettings({ brain: { business_name: "Harbor" } }, 3, () => order.push("accepted"), {
    client: t.client,
    refresh: async () => order.push("settings re-read"),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(t.sent[0].body, { config: { brain: { business_name: "Harbor" } }, version: 3 });
  assert.deepEqual(order, ["accepted"], "no extra re-read on success: the refresh map already re-reads settings first");
  assert.ok(t.events.includes("refresh:PUT settings"));
});

test("a save that lost the race: the server's sentence comes back, and the settings surface is re-read so the next save carries the current version", async () => {
  const t = tab(() =>
    refusal(409, "conflict", "Someone else saved settings after you loaded them — reload and reapply."),
  );
  const order = [];
  const r = await saveSettings({}, 3, () => order.push("accepted"), {
    client: t.client,
    refresh: async () => order.push("settings re-read"),
  });
  // A5: the refusal carries the kind of no (refusals-in-our-words) beside the server's own sentence.
  assert.deepEqual(r, {
    ok: false,
    code: "conflict",
    status: 409,
    title: "Not possible right now",
    message: "Someone else saved settings after you loaded them — reload and reapply.",
    retryAfterS: null,
    fields: null,
  });
  assert.deepEqual(order, ["settings re-read"], "re-read on the conflict, never accepted");
  const other = tab(() => refusal(403, "forbidden", "Only an owner can change settings."));
  const seen = [];
  await saveSettings({}, 3, undefined, { client: other.client, refresh: async () => seen.push("re-read") });
  assert.deepEqual(seen, [], "any other refusal leaves the tab as it is");
});
