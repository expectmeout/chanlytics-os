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

/* ---------------------------------------------------------------------------
 * Tapped replies. A customer who presses a button has said something — the
 * words just arrive in a different field. Before this, m.type was "button" or
 * "interactive", isText was false, and the consequences were two:
 *   - the consent gate never saw it, so a Stop button changed nothing, and
 *   - the handler classified it as unreadable and answered the customer with
 *     the non-text fallback ("sorry, I can't read that").
 * Meta's own webhook reference uses "Unsubscribe" as its example button
 * payload, so the very shape their docs demonstrate was the one being dropped.
 * ------------------------------------------------------------------------ */

const tapped = (over) => msg({ type: "button", text: undefined, ...over });

test("a template quick-reply is text, not an unreadable message", () => {
  const n = normalizeInbound(tapped({ button: { payload: "Book now", text: "Book now" } }), {});
  assert.equal(n.type, "text");
  assert.equal(n.body, "Book now");
  assert.equal(n.rawType, "button");   // the distinction is kept, not erased
  assert.equal(n.media, null);
  assert.equal(n.optOut, false);
});

test("pressing an opt-out button opts the customer out", () => {
  // Meta's documented example payload, verbatim.
  const n = normalizeInbound(tapped({ button: { payload: "Unsubscribe", text: "Unsubscribe" } }), {});
  assert.equal(n.optOut, true);
  assert.equal(n.body, "Unsubscribe");
});

test("interactive button_reply and list_reply both carry consent", () => {
  const btn = normalizeInbound(
    msg({ type: "interactive", text: undefined, interactive: { type: "button_reply", button_reply: { id: "b1", title: "STOP" } } }),
    {},
  );
  assert.equal(btn.type, "text");
  assert.equal(btn.body, "STOP");
  assert.equal(btn.optOut, true);

  const list = normalizeInbound(
    msg({ type: "interactive", text: undefined, interactive: { type: "list_reply", list_reply: { id: "l1", title: "Priority Mail", description: "2 days" } } }),
    {},
  );
  assert.equal(list.type, "text");
  assert.equal(list.body, "Priority Mail");
  assert.equal(list.optOut, false);
});

test("a localised label still opts out when the tenant sets the id", () => {
  // The label is what the customer reads; the id is what the tenant controls.
  // Without this, a Spanish "Detener" button could never opt anyone out.
  const n = normalizeInbound(
    msg({ type: "interactive", text: undefined, interactive: { button_reply: { id: "stop", title: "Detener mensajes" } } }),
    {},
  );
  assert.equal(n.optOut, true);
  assert.equal(n.body, "Detener mensajes"); // staff still see what they tapped
});

test("START via a button lifts the opt-out the same way", () => {
  const n = normalizeInbound(tapped({ button: { payload: "START", text: "START" } }), {});
  assert.equal(n.optIn, true);
  assert.equal(n.optOut, false);
});

test("a tap is still matched as a whole label, never a substring", () => {
  const n = normalizeInbound(tapped({ button: { payload: "Stop by the salon", text: "Stop by the salon" } }), {});
  assert.equal(n.optOut, false, "an anchored pattern must not fire on a phrase that merely starts with stop");
});

test("an empty interactive payload stays unreadable rather than becoming empty text", () => {
  const n = normalizeInbound(msg({ type: "interactive", text: undefined, interactive: { type: "nfm_reply" } }), {});
  assert.equal(n.type, "media");
  assert.equal(n.body, null);
  assert.equal(n.optOut, false);
});
