/**
 * A customer's photo, looked at when the workspace lets it, and carried to every place the thread is drawn — run, not
 * read.
 *
 * Where the workspace turned the photo row on, a text's turn shows the model the picture itself, first, then the words
 * that restate the rules, and where it did not, the photo takes
 * the unreadable path. The switch is the config's, read with the runtime. The decision's other halves -- nothing
 * downloaded for a reply that will not happen, one download per message, a fetch that failed handed over -- are run in
 * inbound/phases/. And both view models carry the attachment: the Inbox's timeline entry and Conversations' message.
 * Pinned as unreadable.ts's, model-turn.ts's, receptionist-brain.ts's, tenant-runtime.ts's and the two view models' text
 * in media.test.mjs until 26 Nov 2026.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { runtime, world } from "../../inbound/_world.mjs";
import { photo, sure } from "../../inbound/phases/_fixtures.mjs";
import { scripted, json } from "../../ai/_model-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
const { setModelFetch } = await importSrc("apps/edge/lib/ai/model.ts");
const { generateReply } = await importSrc("apps/edge/lib/ai/receptionist-brain.ts");
const { loadTenantRuntime } = await importSrc("apps/edge/lib/shared/tenant-runtime.ts");
const { toConversationVM } = await importSrc("apps/dashboard/src/surfaces/inbox/model/thread-vm.ts");
after(() => setModelFetch(null));

const BYTES = new Uint8Array([104, 105]);
/** A model that keeps what it was asked. */
const looking = () => {
  const asked = [];
  return {
    asked,
    turn: {
      brain: async () => ({
        generateReply: async (a) => (
          asked.push(a),
          { text: "A little, yes.", escalate: false, meta: sure, usage: { input_tokens: 40 } }
        ),
      }),
    },
  };
};

test("with the photo row on, the model is shown the picture and the rules beside it", async () => {
  const m = looking();
  const w = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ features: { vision: true } }),
    media: { mime: "image/jpeg", bytes: BYTES },
  });
  await w.run(photo("wamid.pic1", "  is this shade too dark?  "), m.turn);
  assert.equal(m.asked.length, 1);
  assert.deepEqual(m.asked[0].image, { mime: "image/jpeg", base64: "aGk=" }, "the picture itself");
  assert.ok(m.asked[0].userText.startsWith('The customer sent this photo with the message: "is this shade too dark?"'));
  for (const rule of ["no price", "never a confirmed appointment"]) assert.ok(m.asked[0].userText.includes(rule), rule);
  assert.deepEqual(
    w.seen.sent.map((s) => s.body),
    ["A little, yes."],
  );
});

test("with the photo row off, the photo takes the unreadable path and the model is never asked", async () => {
  const m = looking();
  const w = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ features: null }),
    media: { mime: "image/jpeg", bytes: BYTES },
  });
  await w.run(photo("wamid.pic2", "is this shade too dark?"), m.turn);
  assert.equal(m.asked.length, 0);
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["non_text"],
  );
});

test("the picture goes to the model first, then the words", async () => {
  const api = scripted(
    json({
      reply: "A little, yes.",
      intent: "other",
      escalate: false,
      reason: "",
      confidence: 0.9,
      facts_used: [],
      language: "en",
    }),
  );
  setModelFetch(api.fetch);
  await generateReply({
    history: [],
    userText: "The customer sent this photo, with no words.",
    systemPrompt: "You answer for Harbor Nails.",
    fallbackText: "Hold on.",
    image: { mime: "image/png", base64: "aGk=" },
    call: { tenantId: null },
  });
  assert.deepEqual(api.calls[0].body.messages.at(-1), {
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "aGk=" } },
      { type: "text", text: "The customer sent this photo, with no words." },
    ],
  });
});

test("the switch is the workspace's config, read with the runtime; a load that fails turns nothing on", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-00000000f070";
  const tables = (config) => ({
    tenants: [{ id: T, name: "Harbor", timezone: "America/New_York", status: "active" }],
    tenant_channels: [],
    tenant_config: [{ tenant_id: T, config }],
    policies: [],
    google_listings: [],
  });
  const routed = { tenantId: T, channelId: "wa-1", kind: "whatsapp", credentialsRef: null };
  const brain = {
    business_name: "Harbor",
    system_prompt: "x".repeat(40),
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const on = await loadTenantRuntime(
    fakeDb(tables({ brain, features: { vision: true } }), {}, { runtime_stamp: () => "stamp-on" }),
    routed,
  );
  assert.equal(on.features?.vision, true);
  const down = await loadTenantRuntime(
    fakeDb(
      tables({ brain, features: { vision: true } }),
      { "tenant_config.select": { message: "down" } },
      {
        runtime_stamp: () => "stamp-down",
      },
    ),
    { ...routed, channelId: "wa-2" },
  );
  assert.equal(down.features, null, "nothing on that was not read");
});

test("both view models carry the attachment: the Inbox's timeline entry and Conversations' message", () => {
  const media = { mime_type: "image/jpeg", fetch_state: "stored", filename: null, caption: "this one" };
  const dto = {
    id: "c1",
    state: "open",
    paused_until: null,
    last_wa_inbound_at: "2026-08-27T12:00:00Z",
    last_message_at: "2026-08-27T12:00:00Z",
    contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: "+13475550101" },
    messages: [
      {
        id: "m1",
        direction: "inbound",
        sender: "customer",
        type: "media",
        body: null,
        media,
        meta: { raw_type: "image" },
        status: "received",
        created_at: "2026-08-27T12:00:00Z",
      },
    ],
  };
  const now = new Date("2026-08-27T15:00:00Z");
  const inbox = toInboxThreadVM(dto, null, "America/New_York", now);
  const entry = inbox.timeline.find((e) => e.media);
  assert.ok(entry, "the Inbox's timeline entry carries it");
  const vm = toConversationVM(dto, null, "America/New_York", now);
  const message = vm.messages.find((x) => x.media);
  assert.ok(message, "and Conversations' message");
  assert.equal(message.media.available, true, "a stored attachment is one to serve");
});

test("a photo past what the model takes is never shown it: handed over as one nobody could look at", async () => {
  const { VISION_MAX_BYTES } = await importSrc("packages/core/src/inbound/vision.ts");
  const m = looking();
  const w = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ features: { vision: true } }),
    media: { mime: "image/jpeg", bytes: new Uint8Array(VISION_MAX_BYTES + 1) },
  });
  await w.run(photo("wamid.pic3", "is this shade too dark?"), m.turn);
  assert.ok(
    m.asked.every((a) => !a.image),
    "no picture reaches the model",
  );
  assert.equal(w.seen.media, 1, "fetched once, and no more");
});
