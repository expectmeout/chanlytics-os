/** Pure-function tests for the WhatsApp normalizer — identity attachment is a
 *  PERMANENT mapping, so the contact-match rules get pinned here.
 *  Run: node --test tooling/tests */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeInbound } from "@chanlytics/channels";

const msg = (over = {}) => ({
  from: "15550001111", id: "wamid.t", type: "text",
  timestamp: "1700000000", text: { body: "hola" }, ...over,
});

test("matching wa_id attaches identity + profile name", () => {
  const n = normalizeInbound(msg(), {
    contacts: [{ wa_id: "15550001111", profile: { name: "Ana" } }],
  });
  assert.equal(n.waId, "15550001111");
  assert.equal(n.profileName, "Ana");
});

test("single mismatched contact (BR-style wa_id) is still used", () => {
  const n = normalizeInbound(msg({ from: "5511987654321" }), {
    contacts: [{ wa_id: "551187654321", profile: { name: "Bruna" } }],
  });
  assert.equal(n.waId, "551187654321");
  assert.equal(n.profileName, "Bruna");
});

test("batched multi-sender webhook NEVER guesses another sender's identity", () => {
  const n = normalizeInbound(msg({ from: "15550002222" }), {
    contacts: [
      { wa_id: "15550009999", profile: { name: "Wrong Person" } },
      { wa_id: "15550008888", profile: { name: "Also Wrong" } },
    ],
  });
  assert.equal(n.waId, "15550002222"); // falls back to the message's own sender id
  assert.equal(n.profileName, null);
});

test("media message normalizes with pending fetch state", () => {
  const n = normalizeInbound(
    msg({ type: "image", text: undefined, image: { id: "media-1", mime_type: "image/jpeg", caption: "look" } }),
    { contacts: [{ wa_id: "15550001111" }] },
  );
  assert.equal(n.type, "media");
  assert.equal(n.media?.provider_media_id, "media-1");
  assert.equal(n.media?.fetch_state, "pending");
  assert.equal(n.media?.caption, "look");
  assert.equal(n.body, null);
});

test("opt-out detection: STOP/BAJA variants, not substrings", () => {
  const optOut = (body) => normalizeInbound(msg({ text: { body } }), {}).optOut;
  assert.equal(optOut("STOP"), true);
  assert.equal(optOut(" baja! "), true);
  assert.equal(optOut("Unsubscribe"), true);
  assert.equal(optOut("please stop calling me maybe"), false);
  assert.equal(optOut("can I stop by today?"), false);
});

test("missing timestamp yields null channel ts", () => {
  const n = normalizeInbound(msg({ timestamp: undefined }), {});
  assert.equal(n.channelTsIso, null);
});
