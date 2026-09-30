/**
 * What a log line holds (packages/channels log/): the one logger the edge, the dashboard's server, core, jobs and db
 * write through, run as it is, with every person's number, address and words and every credential planted in it.
 *
 * A line is one JSON object: `level`, `event`, the request it belongs to (`request_id`), the workspace once the request
 * has said (`tenant_id`), then its own fields, each redacted where it is written so no caller can forget: by the key
 * it is under (a contact, a person's words, a credential), and by what it looks like in any string (a provider's error
 * text quoting a number, an exception's message quoting an address, a URL with its key in the query). Nothing else is
 * touched: ids, times and counts are what a log is for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logger, noteTenant, requestId, withRequestId } from "@chanlytics/channels";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

/** Every line `fn` writes, as the raw text a log drain would receive and as parsed. */
async function written(fn) {
  const raw = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"]) console[level] = (...args) => raw.push(String(args[0]));
  try {
    await fn();
  } finally {
    Object.assign(console, real);
  }
  return { raw, lines: raw.map((r) => logLineOf([r])) };
}

const L = logger();

// Made-up values, 555-01xx numbers and example.com addresses: what is planted is what must not come out.
const PHONE = "+15555550142";
const PHONE_SPACED = "+1 (555) 555-0143";
const PHONE_US = "(555) 555-0144";
const EMAIL = "Ana.Perez@example.com";
const WORDS = "Saturday at three, and my card ends in 4242";
const ANTHROPIC_KEY = "sk-ant-api03-Zk9xQ2mV7rT4nB8wL1pC6hD3fG5j";
const TYPESAFE_KEY = "sk-ts-live-Zk9xQ2mV7rT4nB8wL1pC6hD3fG5j";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXBsYW50ZWQ";
const BEARER = "Bearer 7f3a9c1e5b2d4a68b0c9e1f2a3b4c5d6";
const STRIPE = "sk_live_51NabcDEFghijkLMNop";
const WEBHOOK = "whsec_Zk9xQ2mV7rT4nB8wL1pC";
const META = "EAAGm0PX4ZCpsBAKZCplantedplantedplanted12345";

test("a line is one JSON object: level, event, the request's name, the workspace, then its own fields", async () => {
  const { lines } = await written(async () => {
    await withRequestId("iad1::req-0123456789", async () => {
      noteTenant("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      L.info("wa_inbound", { message_id: "m1", count: 3, on: true, none: null, absent: undefined });
      L.child({ sweep: "health" }).warn("sweep_health_checked", { broken: 0 });
    });
    L.error("route_failed", { route: "/api/v1/x" });
  });
  assert.deepEqual(lines, [
    {
      level: "info",
      event: "wa_inbound",
      request_id: "iad1::req-0123456789",
      tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      message_id: "m1",
      count: 3,
      on: true,
      none: null,
    },
    {
      level: "warn",
      event: "sweep_health_checked",
      request_id: "iad1::req-0123456789",
      tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sweep: "health",
      broken: 0,
    },
    { level: "error", event: "route_failed", route: "/api/v1/x" },
  ]);
});

test("a name is held for what its request awaits and ends with it: the next request in the same instance never inherits it", async () => {
  assert.equal(requestId(), null, "outside any request there is none");
  await withRequestId("iad1::first-0123456789", async () => {
    await Promise.resolve();
    assert.equal(requestId(), "iad1::first-0123456789");
  });
  assert.equal(requestId(), null, "it ended with the request");
  const [a, b] = await Promise.all([
    withRequestId("iad1::aaaa-0123456789", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return requestId();
    }),
    withRequestId("iad1::bbbb-0123456789", async () => requestId()),
  ]);
  assert.deepEqual([a, b], ["iad1::aaaa-0123456789", "iad1::bbbb-0123456789"], "two at once keep their own");
});

test("a field that would replace the envelope rides under its own name, an error is its name and message, and an error line carries where it was thrown", async () => {
  const { lines } = await written(async () => {
    L.info("wa_inbound", { event: "wa_status", level: "debug", request_id: "someone-elses", ok: true });
    L.warn("brain_failed", { error: new TypeError("no answer") });
    L.error("brain_failed", { error: new RangeError("too long"), reason: "budget" });
  });
  assert.equal(lines[0].event, "wa_inbound", "the line's name is the logger's");
  assert.deepEqual(
    [lines[0].event_field, lines[0].level_field, lines[0].request_id_field],
    ["wa_status", "debug", "someone-elses"],
  );
  assert.equal(lines[1].error, "TypeError: no answer");
  assert.equal(lines[1].error_stack, undefined, "a warning is not a crash: no stack");
  assert.equal(lines[2].error, "RangeError: too long");
  assert.match(lines[2].error_stack, /log-line\.test\.mjs/, "the frames that threw it, trimmed to its first few");
  assert.ok(lines[2].error_stack.split(" | ").length <= 8);
});

test("a contact is reduced by the key it is under: a number to its last four digits, an address to its domain, a body to its length", async () => {
  const { lines } = await written(async () => {
    L.info("wa_inbound", {
      to: PHONE,
      from: PHONE_SPACED,
      phone: PHONE_US,
      e164: PHONE,
      email: EMAIL,
      owner_email: EMAIL,
      customer_phone: PHONE,
      body: WORDS,
      text: WORDS,
      reply_body: WORDS,
      note_text: WORDS,
      channel_from: "sms",
      from_tail: "0142",
      nested: { list: [{ to: PHONE, body: WORDS }] },
    });
  });
  assert.deepEqual(lines[0], {
    level: "info",
    event: "wa_inbound",
    to: "…0142",
    from: "…0143",
    phone: "…0144",
    e164: "…0142",
    email: "…@example.com",
    owner_email: "…@example.com",
    customer_phone: "…0142",
    body: `[${WORDS.length} chars]`,
    text: `[${WORDS.length} chars]`,
    reply_body: `[${WORDS.length} chars]`,
    note_text: `[${WORDS.length} chars]`,
    channel_from: "sms",
    from_tail: "0142",
    nested: { list: [{ to: "…0142", body: `[${WORDS.length} chars]` }] },
  });
});

test("a contact or a credential a message quotes is reduced wherever it sits: an error's words, a provider's answer, a URL's query", async () => {
  const { raw, lines } = await written(async () => {
    L.error("wa_send_failed", {
      error: new Error(`Recipient ${PHONE} is not a WhatsApp user (${EMAIL}, ${PHONE_SPACED}, ${PHONE_US})`),
      detail: `provider said: invalid number ${PHONE} for ${EMAIL}`,
      url: `https://edge.example.com/api/retell?key=hunter2hunter2&call=abc&token=plantedtoken123`,
      header: `Authorization: ${BEARER}`,
      notes: [`key ${ANTHROPIC_KEY}`, `key ${TYPESAFE_KEY}`, `key ${STRIPE}`, `secret ${WEBHOOK}`],
      session: `jwt ${JWT}`,
      graph: `token ${META}`,
    });
  });
  const out = raw.join("\n");
  for (const planted of [
    PHONE.slice(2),
    "555-0143",
    "555-0144",
    "Ana.Perez",
    "hunter2hunter2",
    "plantedtoken123",
    BEARER.slice(7),
    ANTHROPIC_KEY,
    TYPESAFE_KEY,
    STRIPE,
    WEBHOOK,
    JWT,
    META,
  ])
    assert.ok(!out.includes(planted), `${planted} came out in the log line`);
  assert.equal(lines[0].error, "Error: Recipient …0142 is not a WhatsApp user (…@example.com, …0143, …0144)");
  assert.equal(lines[0].detail, "provider said: invalid number …0142 for …@example.com");
  assert.equal(lines[0].url, "https://edge.example.com/api/retell?key=[redacted]&call=abc&token=[redacted]");
  assert.equal(lines[0].header, "Authorization: Bearer [redacted]");
  assert.deepEqual(lines[0].notes, ["key [redacted]", "key [redacted]", "key [redacted]", "secret [redacted]"]);
});

test("a credential is gone by its name, the model's keys included; a field that only says whether there is one stays", async () => {
  const { raw, lines } = await written(async () => {
    L.info("env_read", {
      anthropic_api_key: ANTHROPIC_KEY,
      typesafe_api_key: TYPESAFE_KEY,
      TYPESAFE_API_KEY: TYPESAFE_KEY,
      authorization: BEARER,
      access_token: "not-shaped-like-anything-1234",
      refresh_token: "not-shaped-like-anything-5678",
      webhook_secret: "not-shaped-like-anything-9012",
      cookie: "sb-session=abcdef",
      password: "correct horse battery staple",
      "x-fn-secret": "not-shaped-like-anything-3456",
      has_token: true,
      api_key: null,
      input_tokens: 812,
      output_tokens: 96,
    });
  });
  const out = raw.join("\n");
  for (const planted of [
    "not-shaped-like-anything",
    "correct horse",
    "sb-session",
    ANTHROPIC_KEY,
    TYPESAFE_KEY,
    BEARER.slice(7),
  ])
    assert.ok(!out.includes(planted), `${planted} came out in the log line`);
  assert.equal(lines[0].typesafe_api_key, "[redacted]");
  assert.equal(lines[0].TYPESAFE_API_KEY, "[redacted]");
  assert.equal(lines[0].has_token, true, "whether a token is held is not the token");
  assert.equal(lines[0].api_key, null);
  assert.deepEqual([lines[0].input_tokens, lines[0].output_tokens], [812, 96], "a count of tokens is not a token");
});

test("nothing else is touched: ids, times, counts, provider ids and a request's name come out as they went in", async () => {
  const fields = {
    message_id: "4318310a-77e7-5d8d-b2fe-1784c78df1e4",
    conversation_id: "91ff7707-29ca-4a90-8d79-56edf5cbee49",
    at: "2026-09-29T16:20:00.000Z",
    ms: 1759166400000,
    phone_number_id: "106540000000004",
    waba_id: "207650000000007",
    wamid: "wamid.HBgLMTU1NTU1NTAxNDIVAgASGBQzQTdG",
    call_id: "call_0123456789abcdef",
    version: "2026-09-29.2",
    range: "555-0142 to 555-0149 is a plan, not a phone",
    reason: "held_for_carriers",
  };
  const { lines } = await written(async () => L.info("wa_inbound", fields));
  const { level: _l, event: _e, ...rest } = lines[0];
  assert.deepEqual(rest, fields);
});

test("a line is never the dump of an object: a cycle is cut, and so is what lies deeper than six", async () => {
  const loop = { name: "loop" };
  loop.again = loop;
  const deep = { a: { b: { c: { d: { e: { f: { g: "too deep" } } } } } } };
  const { lines } = await written(async () => L.info("wa_inbound", { loop, deep }));
  assert.deepEqual(lines[0].loop, { name: "loop", again: "[…]" });
  assert.equal(lines[0].deep.a.b.c.d.e.f, "[…]");
});

test("a line the logger cannot write is still a line: the name, the request and a mark, never a throw", async () => {
  const hostile = {
    get boom() {
      throw new Error("a getter that throws");
    },
  };
  const { lines } = await written(async () => {
    await withRequestId("iad1::req-0123456789", async () => L.error("wa_inbound", { hostile }));
  });
  assert.deepEqual(lines[0], {
    level: "error",
    event: "wa_inbound",
    request_id: "iad1::req-0123456789",
    unwritable: true,
  });
});

test("an error's stack is its frames and nothing of its message: a message that runs over several lines is written once, redacted, under the error's own key", async () => {
  const NL = String.fromCharCode(10);
  const quoted = `provider said:${NL}{"to":"${PHONE}","body":"${WORDS}","email":"${EMAIL}"}${NL}Bearer ${BEARER.slice(7)}`;
  const { raw, lines } = await written(async () => L.error("wa_send_failed", { error: new Error(quoted) }));
  const out = raw.join(NL);
  for (const planted of [PHONE.slice(2), "Ana.Perez", BEARER.slice(7)])
    assert.ok(!out.includes(planted), `${planted} came out in the log line`);
  assert.match(lines[0].error, /^Error: provider said:/);
  assert.ok(lines[0].error_stack.startsWith("at "), "the stack starts at its first frame, not at the message");
  assert.ok(!lines[0].error_stack.includes("provider said"), "and holds none of the message");
});

test("an id or a moment under a contact key is not a number: a workspace in `from` and `to`, a day, a time", async () => {
  const from = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const to = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  const { lines } = await written(async () =>
    L.warn("sending_domain_taken_over", { from, to, at: "2026-09-29T16:20:00.000Z", day: "2026-09-29" }),
  );
  assert.deepEqual(fieldsOf(lines[0]), { from, to, at: "2026-09-29T16:20:00.000Z", day: "2026-09-29" });
  const { lines: moments } = await written(async () =>
    L.warn("sending_domain_taken_over", { from: "2026-09-29", to: "2026-09-29T16:20:00Z" }),
  );
  assert.deepEqual(fieldsOf(moments[0]), { from: "2026-09-29", to: "2026-09-29T16:20:00Z" });
});

test("a long string costs a line time in proportion to its length and no more: a run of address characters with no @ is cut and scanned in linear time", async () => {
  const run = "a".repeat(200_000);
  const start = Date.now();
  const { lines } = await written(async () =>
    L.error("wa_send_failed", { error: new Error(`invalid input syntax "${run}"`) }),
  );
  assert.ok(Date.now() - start < 1_000, `200,000 characters took ${Date.now() - start} ms`);
  assert.match(
    lines[0].error,
    /…\[190\d{3} more chars\]$/,
    "cut where a line stops being a line, and says by how much",
  );
  const { lines: short } = await written(async () => L.info("wa_inbound", { detail: "b".repeat(9_000) }));
  assert.equal(short[0].detail.length, 9_000, "a string under the cut is written whole");
});
