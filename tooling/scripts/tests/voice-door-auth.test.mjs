/**
 * The three voice doors Retell calls besides the webhook -- the inbound-call webhook, the booking link and open times
 * -- run with what a knock carries: the shared secret, Retell's signature, both, neither. Retell's signature opens
 * every door on its own, over the raw body or the body as Retell's example re-serialises it, as it does the webhook.
 * The secret opens a door only where that door says it still reads one (the URL for inbound, a header for the two
 * tools; lib/voice/voice-door-auth.ts lists them and why), compared in constant time, and each knock that comes in
 * logs whether it was signed; with RETELL_DOORS_SIGNED=1 no door reads the secret at all.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SECRET = "fn-secret-for-this-file";
const BADGED = "badged-webhook-key-for-this-file";
process.env.RETELL_FN_SECRET = SECRET;
process.env.RETELL_WEBHOOK_KEY = BADGED;
process.env.RETELL_API_KEY = "api-key-for-this-file";
for (const k of ["RETELL_DOORS_SIGNED", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "LEAD_TO"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const DOORS = {
  inbound: await import(at("apps/edge/api/retell-inbound.ts")),
  fn: await import(at("apps/edge/api/retell-fn.ts")),
  availability: await import(at("apps/edge/api/retell-availability.ts")),
};
// No database: past the door each one answers what it answers without one. What is proven here is only whether the
// door opened -- 401 or not.
setPg(null);
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  throw new Error(`nothing on the wire: ${url}`);
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/** Retell's signature as Retell makes it: `v={ts},d={hmac}`, the badged key over the body and the timestamp. */
const sign = (body, { key = BADGED, at: ts = Date.now() } = {}) =>
  `v=${ts},d=${crypto
    .createHmac("sha256", key)
    .update(body + ts)
    .digest("hex")}`;

const BODIES = {
  inbound: { call_inbound: { call_id: "c1", from_number: "+13055550100", agent_id: "agent_x" } },
  fn: {
    call: { call_id: "c1", from_number: "+13055550100", agent_id: "agent_x" },
    args: { phone_number: "3055550100" },
  },
  availability: { call: { call_id: "c1", agent_id: "agent_x" }, args: { day: "today" } },
};

/**
 * A knock on `door`: the secret where that door takes it (URL for inbound, header for the tools) -- or, `elsewhere`,
 * in the other place, to prove it is not read there -- a signature, a body.
 */
function knock(door, { secret = null, elsewhere = false, signature = null, raw = JSON.stringify(BODIES[door]) } = {}) {
  const url = new URL(`https://edge.test/api/retell-${door}`);
  const headers = { "content-type": "application/json" };
  if (secret !== null) {
    if ((door === "inbound") !== elsewhere) url.searchParams.set("key", secret);
    else headers["x-fn-secret"] = secret;
  }
  if (signature !== null) headers["x-retell-signature"] = signature;
  return DOORS[door].POST(new Request(url, { method: "POST", headers, body: raw }));
}

/** What the doors logged while `fn` ran: voice_door_auth lines, as fields. */
async function logged(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...args) => {
    for (const a of args) {
      try {
        const o = JSON.parse(String(a));
        if (o.event === "voice_door_auth") lines.push(o);
      } catch {
        /* not a log line */
      }
    }
  };
  try {
    await fn();
  } finally {
    console.log = real;
  }
  return lines;
}

async function withSigned(value, fn) {
  const was = process.env.RETELL_DOORS_SIGNED;
  if (value === undefined) delete process.env.RETELL_DOORS_SIGNED;
  else process.env.RETELL_DOORS_SIGNED = value;
  try {
    return await fn();
  } finally {
    if (was === undefined) delete process.env.RETELL_DOORS_SIGNED;
    else process.env.RETELL_DOORS_SIGNED = was;
  }
}

for (const door of ["inbound", "fn", "availability"]) {
  test(`${door}: the secret opens it where this door reads one, Retell's signature opens it on its own, and the log says what each knock carried; nothing else does`, async () => {
    const raw = JSON.stringify(BODIES[door]);
    const lines = await logged(async () => {
      assert.notEqual((await knock(door, { secret: SECRET })).status, 401, "the secret");
      assert.notEqual((await knock(door, { secret: SECRET, signature: sign(raw) })).status, 401, "the secret, signed");
      assert.notEqual(
        (await knock(door, { signature: sign(raw) })).status,
        401,
        "the signature alone: the caller signs, so that is a credential before the switch says it is the only one",
      );
      for (const [opts, why] of [
        [{}, "nothing"],
        [{ secret: "" }, "an empty secret"],
        [{ secret: SECRET.slice(0, -1) }, "all but the last character of the secret"],
        [{ secret: `${SECRET}x` }, "the secret and one more"],
        [{ secret: SECRET, elsewhere: true }, "the secret where this door does not read it"],
        [
          { signature: sign(raw, { key: "api-key-for-this-file" }) },
          "a signature with a key that is not the badged one",
        ],
        [{ signature: sign(raw, { at: Date.now() - 6 * 60_000 }) }, "a signature six minutes old"],
      ])
        assert.equal((await knock(door, opts)).status, 401, why);
    });
    assert.deepEqual(
      lines.map((l) => [l.door, l.sig, l.secret, l.signed_only, l.ok]),
      [
        [door, false, true, false, true],
        [door, true, true, false, true],
        [door, true, false, false, true],
      ],
      "each knock that came in, and what it carried; the refusals say nothing",
    );
    // An unset secret matches nothing, an empty knock included.
    const was = process.env.RETELL_FN_SECRET;
    delete process.env.RETELL_FN_SECRET;
    try {
      assert.equal((await knock(door, { secret: "" })).status, 401);
      assert.equal((await knock(door, { secret: "anything" })).status, 401);
    } finally {
      process.env.RETELL_FN_SECRET = was;
    }
  });

  test(`${door}: with RETELL_DOORS_SIGNED=1 the signature alone opens it -- over the raw body or the re-serialised one -- and a refusal is logged`, async () => {
    // Non-ASCII escaped on the wire: the raw body and its re-serialised form differ, as the webhook's deliveries do.
    const raw = JSON.stringify(BODIES[door]).replace("c1", "c\\u00e91");
    const reser = JSON.stringify(JSON.parse(raw));
    assert.notEqual(raw, reser);
    const lines = await logged(() =>
      withSigned("1", async () => {
        assert.notEqual((await knock(door, { raw, signature: sign(raw) })).status, 401, "signed over the raw body");
        assert.notEqual((await knock(door, { raw, signature: sign(reser) })).status, 401, "signed as Retell's example");
        for (const [opts, why] of [
          [{ raw, secret: SECRET }, "the secret alone, once the signature is required"],
          [
            { raw, signature: sign(raw, { key: "api-key-for-this-file" }) },
            "signed with a key that is not the badged one",
          ],
          [{ raw, signature: sign(raw, { at: Date.now() - 6 * 60_000 }) }, "a signature six minutes old"],
          [{ raw: `${raw} `, signature: sign(raw) }, "a body that is not the one signed"],
        ])
          assert.equal((await knock(door, opts)).status, 401, why);
      }),
    );
    assert.deepEqual(
      lines.map((l) => [l.sig, l.ok]),
      [
        [true, true],
        [true, true],
        [false, false],
        [false, false],
        [false, false],
        [false, false],
      ],
      "every knock, the refusals too: once required, a refusal may be Retell's",
    );
  });
}

test("the webhook checks the signature the same one way (retellSigned), and still takes nothing but the signature", async () => {
  const { retellSigned } = await import(at("apps/edge/lib/voice/voice-door-auth.ts"));
  const raw = '{"event":"call_ended","call":{"call_id":"c\\u00e91"}}';
  assert.deepEqual(retellSigned(raw, sign(raw)), { ok: true, raw: true, restringified: true });
  assert.deepEqual(retellSigned(raw, sign(JSON.stringify(JSON.parse(raw)))), {
    ok: true,
    raw: false,
    restringified: true,
  });
  assert.deepEqual(retellSigned(raw, null), { ok: false, raw: false, restringified: false });
  // With no badged key the API key is tried, as the webhook always has.
  const was = process.env.RETELL_WEBHOOK_KEY;
  delete process.env.RETELL_WEBHOOK_KEY;
  try {
    assert.equal(retellSigned(raw, sign(raw, { key: "api-key-for-this-file" })).ok, true);
  } finally {
    process.env.RETELL_WEBHOOK_KEY = was;
  }
});
