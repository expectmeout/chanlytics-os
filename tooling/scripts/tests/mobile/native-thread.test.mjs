/**
 * The native thread's words (contracts/native-thread.ts): the title and subtitle, the bubbles as the web's own view
 * model says them, and when a reply may be typed on the phone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeThreadVM, NATIVE_THREAD_WORDS } from "../../../../packages/contracts/src/mobile/native-thread.ts";

const NOW = new Date("2026-09-26T16:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3_600_000;
const msg = (over = {}) => ({
  id: "m1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Hi there",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  channel_ts: ago(HOUR),
  created_at: ago(HOUR),
  ...over,
});
const dto = (over = {}, messages = [msg()]) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contact: {
    id: "k1",
    display_name: "Maria Lopez",
    wa_profile_name: null,
    phone_e164: "+13055550100",
    consent: "opted_in",
    dnc: false,
  },
  messages,
  ...over,
});

test("the title is the person, the subtitle the wire and the number; the bubbles are the web's", () => {
  const vm = nativeThreadVM(
    dto({}, [
      msg(),
      msg({
        id: "m2",
        direction: "outbound",
        sender: "ai",
        body: "Welcome!",
        status: "read",
        created_at: ago(HOUR / 2),
        channel_ts: ago(HOUR / 2),
      }),
    ]),
    "America/New_York",
    NOW,
  );
  assert.equal(vm.id, "c1");
  assert.equal(vm.title, "Maria Lopez");
  assert.equal(vm.subtitle, "WhatsApp · +1 (305) 555-0100");
  assert.equal(vm.bubbles.length, 2);
  assert.equal(vm.bubbles[0].from, "client");
  assert.equal(vm.bubbles[0].text, "Hi there");
  assert.equal(vm.bubbles[1].from, "agent");
  assert.equal(vm.bubbles[1].statusLabel, "Read");
  assert.equal(vm.oldestAt, ago(HOUR));
  assert.deepEqual(vm.composer, { kind: "text", placeholder: "Write a message…" });
});

test("an email thread says the address and asks for an email; a thread of calls alone answers on WhatsApp", () => {
  const email = nativeThreadVM(
    dto(
      { contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: null, email: "sam@example.com" } },
      [msg({ channel: "email" })],
    ),
    "UTC",
    NOW,
  );
  assert.equal(email.title, "sam@example.com");
  assert.equal(email.subtitle, "Email · sam@example.com");
  assert.deepEqual(email.composer, { kind: "text", placeholder: "Write an email…" });
  const calls = nativeThreadVM(
    dto({}, [msg({ type: "call_summary", channel: "phone", body: "[voice call note] Summary: asked about hours" })]),
    "UTC",
    NOW,
  );
  assert.equal(calls.subtitle, "Phone · +1 (305) 555-0100");
  assert.equal(calls.composer.kind, "text", "the window is open: the caller wrote an hour ago");
});

test("the composer closes for an opt-out, an archived thread, and a WhatsApp window that has lapsed, in one sentence each", () => {
  assert.deepEqual(nativeThreadVM(dto({ contact: { ...dto().contact, dnc: true } }), "UTC", NOW).composer, {
    kind: "closed",
    words: NATIVE_THREAD_WORDS.optedOut,
  });
  assert.deepEqual(nativeThreadVM(dto({ state: "archived" }), "UTC", NOW).composer, {
    kind: "closed",
    words: NATIVE_THREAD_WORDS.archived,
  });
  assert.deepEqual(nativeThreadVM(dto({ last_wa_inbound_at: ago(30 * HOUR) }), "UTC", NOW).composer, {
    kind: "closed",
    words: NATIVE_THREAD_WORDS.windowClosed,
  });
  assert.equal(
    nativeThreadVM(dto({ last_wa_inbound_at: ago(30 * HOUR) }, [msg({ channel: "sms" })]), "UTC", NOW).composer.kind,
    "text",
    "a text has no window",
  );
  assert.equal(nativeThreadVM(dto({}, []), "UTC", NOW).oldestAt, null);
});
