/**
 * 00405 on a real Postgres: provider_code_of, the provider's error code on a failed message, said once in SQL and held to
 * the TypeScript parse that already says it for the thread (contracts conversations/message-words.ts, `providerCodeOf`).
 *
 * The ledger groups why sends failed by this code; the Inbox draws "WhatsApp didn't deliver it (error 131049)" from the
 * other. Two parsers that disagree would put one failure under two numbers, so every shape a writer puts in
 * `messages.error` (and the ones nobody does) goes through both and must come back the same. The one deliberate difference
 * is a number past the integer type: no provider has one, the SQL answers none, and the test says so apart from the table.
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { providerCodeOf } from "@chanlytics/contracts";
import { db, ok, skip } from "./_answers-world.mjs";

/** The unicode space the parse trims along with the plain ones (written from its code, never typed as an escape). */
const NBSP = String.fromCharCode(0xa0);
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/** Every shape of `messages.error` the writers keep (data map, section 5), and the ones that are no code. */
const SHAPES = [
  ["a WhatsApp receipt's errors list", { errors: [{ code: 131049 }] }],
  ["a number needs no digits' count", { code: 12 }],
  ["a code in a string", { errors: [{ code: "131049" }] }],
  ["a text's status callback", { code: 30003 }],
  ["a code with spaces round it", { code: " 30003 " }],
  ["a code with tabs, a line break and unicode spaces round it", { code: `\t${NBSP}30003${IDEOGRAPHIC_SPACE}\n` }],
  ["a space that is not one", { code: `${ZERO_WIDTH_SPACE}30003` }],
  ["a Graph answer cut short", { body: '{"error":{"code":131047,"message":"x"}}' }],
  ["a Graph answer with its spaces", { body: '{"error": {"message": "x", "code" : 131048' }],
  ["a Graph code past six digits is its first six", { body: '{"error":{"code":1234567}}' }],
  ["a Graph code of two digits", { body: '{"error":{"code":12}}' }],
  ["a Twilio answer", { body: "Twilio 30034" }],
  ["a Twilio answer with spaces round it", { body: "  Twilio 30034\n" }],
  ["a Twilio answer of four digits", { body: "Twilio 3003" }],
  ["a Twilio answer with words after it", { body: "Twilio 30034 more" }],
  ["a body that is an object", { body: { error: { code: 132015 } } }],
  ["a body that is an object without its error", { body: { code: 132015 } }],
  ["a body that is an object whose error is a list", { body: { error: [{ code: 132015 }] } }],
  ["a body with nothing in it", { http_status: 400, body: "nothing here" }],
  ["a body that is a number", { body: 131049 }],
  ["a body that is a list", { body: [{ error: { code: 131049 } }] }],
  ["a body that is null", { body: null }],
  ["a text's carrier word", { carrier: "undelivered" }],
  ["an email's provider word", { provider: "bounced" }],
  ["a settled row's reason", { reason: "never_delivered" }],
  ["no error at all", {}],
  ["an empty list", { errors: [] }],
  ["a list whose first is not an object", { errors: [131049] }],
  ["a list that is an object", { errors: { 0: { code: 131049 } } }],
  ["a list that is a string", { errors: "131049" }],
  ["the list's first, then the direct one", { errors: [{ code: "x" }], code: 30003 }],
  ["the list's first wins over the direct one", { errors: [{ code: 131049 }], code: 30003 }],
  ["the direct one wins over the body", { code: 30003, body: "Twilio 30034" }],
  ["a body read when the codes are no codes", { errors: [{ code: 0 }], code: -5, body: "Twilio 30034" }],
  ["zero", { code: 0 }],
  ["a negative number", { code: -5 }],
  ["a fraction", { code: 1.5 }],
  ["a string of two digits", { code: "12" }],
  ["a string of seven digits", { code: "1234567" }],
  ["a string with a letter", { code: "3000x" }],
  ["a string of digits that are not ours", { code: "٣٠٠٠٣" }],
  ["a boolean", { code: true }],
  ["a code that is an object", { code: { code: 30003 } }],
  ["the largest integer", { code: 2147483647 }],
];

test("the SQL and the TypeScript parse say the same code for every shape of error", { skip }, async () => {
  for (const [what, shape] of SHAPES) {
    const sql = ok(await db.rpc("provider_code_of", { p_error: shape }), what);
    assert.equal(sql, providerCodeOf(shape), `${what}: ${JSON.stringify(shape)}`);
  }
});

test("an error that is the JSON null has no code, in the SQL and in the TypeScript given {}", { skip }, async () => {
  const sql = ok(await db.rpc("provider_code_of", { p_error: null }), "a null error");
  assert.equal(sql, null);
  assert.equal(providerCodeOf({}), null);
});

test("the table holds the codes it is meant to find and the ones it is meant to miss", { skip }, async () => {
  // The cases above agree with the parse; these say what each is, so two parsers that both lose a code do not agree in silence.
  const found = [
    [{ errors: [{ code: 131049 }] }, 131049],
    [{ code: 12 }, 12],
    [{ code: " 30003 " }, 30003],
    [{ body: '{"error":{"code":131047,"message":"x"}}' }, 131047],
    [{ body: "Twilio 30034" }, 30034],
    [{ body: { error: { code: 132015 } } }, 132015],
    [{ errors: [{ code: 131049 }], code: 30003 }, 131049],
    [{ errors: [{ code: "x" }], code: 30003 }, 30003],
    [{ body: '{"error":{"code":1234567}}' }, 123456],
  ];
  for (const [shape, code] of found) {
    assert.equal(ok(await db.rpc("provider_code_of", { p_error: shape })), code, JSON.stringify(shape));
  }
  const missed = [
    { carrier: "undelivered" },
    { provider: "bounced" },
    { reason: "never_delivered" },
    {},
    { errors: [] },
    { code: 0 },
    { code: -5 },
    { code: 1.5 },
    { code: "12" },
    { code: "1234567" },
    { body: "nothing here" },
  ];
  for (const shape of missed) {
    assert.equal(ok(await db.rpc("provider_code_of", { p_error: shape })), null, JSON.stringify(shape));
  }
});

test("a number past the integer type is none: no provider has one", { skip }, async () => {
  for (const code of [2147483648, 3000000000, 10 ** 15]) {
    assert.equal(ok(await db.rpc("provider_code_of", { p_error: { code } })), null, `${code} is none`);
    assert.equal(
      ok(await db.rpc("provider_code_of", { p_error: { errors: [{ code }], body: "Twilio 30034" } })),
      30034,
    );
  }
});
