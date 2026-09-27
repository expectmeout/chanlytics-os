/**
 * The call in progress on the phones (the PRD, PR 7): the rule that starts one activity per phone of the people who
 * take calls, once per call (apps/edge/lib/voice/call-activity.ts, 00220), the payload in the shape expo-widgets reads
 * (contracts live-activity.ts), and Apple's wire executed against a stub of HTTP/2 (apps/edge/lib/ops/apns.ts): one
 * connection, bounded, never throwing, with a provider token that verifies under the key that signed it and is minted
 * once however many deliveries ask.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { tellPhonesCallStarted } = await import(at("apps/edge/lib/voice/call-activity.ts"));
const { apns, apnsJwt, APNS_PRODUCTION, APNS_SANDBOX } = await import(at("apps/edge/lib/ops/apns.ts"));
const live = await import(at("packages/contracts/src/mobile/live-activity.ts"));
const { callActivityStart, callActivityPropsOf, CALL_ACTIVITY_NAME, CALL_ACTIVITY_STALE_MS, CALL_ACTIVITY_ROLES } =
  live;

const T = "11111111-1111-4111-8111-111111111111";
const call = {
  call_id: "c1",
  contact_id: null,
  from_e164: "+16465550123",
  from_raw: "+16465550123",
  to_e164: "+13055550100",
  started_at: "2026-09-26T10:00:00.000Z",
};
const NOW = new Date("2026-09-26T10:00:05.000Z");

test("the payload is a push-to-start of the call's activity, with who is on the line and a stale date", () => {
  const p = callActivityStart(callActivityPropsOf(call), NOW);
  assert.equal(p.aps.event, "start");
  assert.equal(p.aps["attributes-type"], "LiveActivityAttributes");
  assert.equal(p.aps["content-state"].name, CALL_ACTIVITY_NAME);
  assert.deepEqual(JSON.parse(p.aps["content-state"].props), {
    who: "Caller ending 0123",
    line: "+1 (305) 555-0100",
    startedAt: "2026-09-26T10:00:00.000Z",
  });
  assert.equal(p.aps.timestamp, Math.floor(NOW.getTime() / 1000));
  assert.equal(p.aps["stale-date"], p.aps.timestamp + CALL_ACTIVITY_STALE_MS / 1000);
  assert.equal(
    p.aps.alert.body,
    "Caller ending 0123 is on the line.",
    "REGRESSION: a Lock Screen, read by whoever holds the phone, showed the caller's whole number",
  );
  assert.equal(callActivityPropsOf({ ...call, name: " Maria " }).who, "Maria", "a person the workspace knows is named");
  assert.equal(callActivityPropsOf({ ...call, from_e164: null, from_raw: "5550123" }).who, "Caller ending 0123");
  assert.equal(
    callActivityPropsOf({ from_e164: null, from_raw: null, to_e164: null, started_at: null }).who,
    "Someone",
  );
  assert.deepEqual([...CALL_ACTIVITY_ROLES], ["owner", "operator"]);
});

/** A port that answers each token as told: started unless named gone (410) or refused. */
const port = ({ gone = [], refuse = [] } = {}) => {
  const sent = [];
  return {
    sent,
    async startActivities(tokens, payload) {
      sent.push({ tokens: [...tokens], payload });
      return tokens.map((token) =>
        gone.includes(token)
          ? { token, state: "gone" }
          : refuse.includes(token)
            ? { token, state: "refused", error: "apns_rejected 400 BadDeviceToken" }
            : { token, state: "started" },
      );
    },
  };
};
const world = () => ({
  memberships: [
    { tenant_id: T, user_id: "u1", role: "owner" },
    { tenant_id: T, user_id: "u2", role: "operator" },
    { tenant_id: T, user_id: "u4", role: "viewer" },
    { tenant_id: T, user_id: "u5", role: "partner" },
    { tenant_id: "other", user_id: "u3", role: "owner" },
  ],
  push_devices: [
    { user_id: "u1", token: "p1", activity_token: "a1" },
    { user_id: "u1", token: "p2", activity_token: null },
    { user_id: "u2", token: "p3", activity_token: "a2" },
    { user_id: "u2", token: "p4", activity_token: "a2" },
    { user_id: "u3", token: "p5", activity_token: "a3" },
    { user_id: "u4", token: "p6", activity_token: "a4" },
    { user_id: "u5", token: "p7", activity_token: "a5" },
  ],
  calls: [{ id: "c1", tenant_id: T, activity_started_at: null }],
  contacts: [{ id: "k1", tenant_id: T, display_name: "Rosa Díaz", wa_profile_name: null }],
});

test("the phones of the people who take calls are started, each token once, and one Apple calls gone is forgotten", async () => {
  const tables = world();
  const p = port({ gone: ["a2"] });
  const out = await tellPhonesCallStarted(fakeDb(tables), T, call, p, NOW);
  assert.deepEqual(p.sent[0].tokens, ["a1", "a2"], "REGRESSION: a viewer's and a partner's phones were shown the call");
  assert.deepEqual(out, { started: 1, refused: [], gone: 1, already: false });
  assert.equal(
    tables.push_devices.filter((d) => d.activity_token === "a2").length,
    0,
    "a gone token is forgotten, so the next call does not try it",
  );
  assert.equal(p.sent[0].payload.aps["content-state"].name, CALL_ACTIVITY_NAME);
});

test("a redelivered call_started starts nothing twice; a refusal is named, never thrown", async () => {
  const tables = world();
  const p = port({ refuse: ["a1"] });
  const first = await tellPhonesCallStarted(fakeDb(tables), T, call, p, NOW);
  assert.deepEqual(first.refused, [{ token: "a1", error: "apns_rejected 400 BadDeviceToken" }]);
  assert.ok(tables.calls[0].activity_started_at, "the start is claimed on the call's row");
  const again = await tellPhonesCallStarted(fakeDb(tables), T, call, p, NOW);
  assert.deepEqual(again, { started: 0, refused: [], gone: 0, already: true });
  assert.equal(p.sent.length, 1, "REGRESSION: Retell's redelivery started the activity on every phone again");
});

test("a caller the workspace knows is named on the Lock Screen", async () => {
  const p = port();
  await tellPhonesCallStarted(fakeDb(world()), T, { ...call, contact_id: "k1" }, p, NOW);
  assert.equal(JSON.parse(p.sent[0].payload.aps["content-state"].props).who, "Rosa Díaz");
  assert.equal(p.sent[0].payload.aps.alert.body, "Rosa Díaz is on the line.");
});

test("no port, or nobody who takes calls with a phone: nothing is sent and nothing is claimed", async () => {
  assert.deepEqual(await tellPhonesCallStarted(fakeDb({}), T, call, null, NOW), {
    started: 0,
    refused: [],
    gone: 0,
    already: false,
  });
  const p = port();
  const tables = { ...world(), memberships: [{ tenant_id: T, user_id: "u4", role: "viewer" }] };
  assert.equal((await tellPhonesCallStarted(fakeDb(tables), T, call, p, NOW)).started, 0);
  assert.equal(p.sent.length, 0);
  assert.equal(tables.calls[0].activity_started_at, null, "a call no phone was shown is not marked shown");
});

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const P8 = privateKey.export({ type: "pkcs8", format: "pem" });
const keys = { teamId: "TEAM123456", keyId: "KEY1234567", p8: P8, bundleId: "com.example.app", sandbox: false };
const b64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

test("the provider token is ES256 over the team and the moment, and verifies under the public key; a base64 key reads the same", () => {
  const now = Date.UTC(2026, 8, 26, 10, 0, 0);
  const jwt = apnsJwt(keys, now);
  const [h, c, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(b64u(h)), { alg: "ES256", kid: "KEY1234567" });
  assert.deepEqual(JSON.parse(b64u(c)), { iss: "TEAM123456", iat: now / 1000 });
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, b64u(s)));
  // ECDSA signs with a fresh nonce each time, so two tokens over one key differ: the base64 key's verifies too.
  const [h2, c2, s2] = apnsJwt({ ...keys, p8: Buffer.from(P8).toString("base64") }, now).split(".");
  assert.equal(`${h2}.${c2}`, `${h}.${c}`);
  assert.ok(
    crypto.verify("sha256", Buffer.from(`${h2}.${c2}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, b64u(s2)),
  );
});

/**
 * A stub of node:http2's session: each request answered by `answer(token)` ({status, body} or "hang"), the headers
 * and bodies kept; `fail` breaks the connection the way a refused port does, as a session error.
 */
const http2Stub = (answer, { fail = null } = {}) => {
  const seen = { origins: [], requests: [], closed: 0, destroyed: 0 };
  const connect = (origin) => {
    seen.origins.push(origin);
    const onError = [];
    if (fail) queueMicrotask(() => onError.forEach((cb) => cb(new Error(fail))));
    return {
      on(ev, cb) {
        if (ev === "error") onError.push(cb);
      },
      request(headers) {
        const cbs = {};
        return {
          on(ev, cb) {
            cbs[ev] = cb;
          },
          end(payload) {
            seen.requests.push({ headers, payload: JSON.parse(payload) });
            const a = answer(headers[":path"].split("/").pop());
            if (fail || a === "hang") return;
            queueMicrotask(() => {
              cbs.response({ ":status": a.status });
              if (a.body) cbs.data(Buffer.from(a.body));
              cbs.end();
            });
          },
        };
      },
      close() {
        seen.closed += 1;
      },
      destroy() {
        seen.destroyed += 1;
      },
    };
  };
  return { seen, connect };
};

test("a start is a liveactivity push to each token's path, all over one connection; 410 is gone, the rest refused", async () => {
  const k = { ...keys, keyId: "KEYWIRE001" };
  const answers = { tokA: { status: 200 }, tokB: { status: 410, body: '{"reason":"Unregistered"}' } };
  const wire = http2Stub((t) => answers[t] ?? { status: 400, body: '{"reason":"BadDeviceToken"}' });
  const sends = await apns(k, { connect: wire.connect }).startActivities(["tokA", "tokB", "tokC"], {
    aps: { event: "start" },
  });
  assert.deepEqual(sends, [
    { token: "tokA", state: "started" },
    { token: "tokB", state: "gone" },
    { token: "tokC", state: "refused", error: 'apns_rejected 400 {"reason":"BadDeviceToken"}' },
  ]);
  assert.deepEqual(wire.seen.origins, [APNS_PRODUCTION], "REGRESSION: a connection per phone");
  const [a] = wire.seen.requests;
  assert.equal(a.headers[":path"], "/3/device/tokA");
  assert.equal(a.headers["apns-push-type"], "liveactivity");
  assert.equal(a.headers["apns-topic"], "com.example.app.push-type.liveactivity");
  assert.equal(a.headers["apns-priority"], "10");
  assert.match(a.headers.authorization, /^bearer /);
  assert.deepEqual(a.payload, { aps: { event: "start" } });
  assert.deepEqual([wire.seen.closed, wire.seen.destroyed], [1, 0], "closed once, when every push has answered");
  assert.deepEqual(await apns(k, { connect: wire.connect }).startActivities([], {}), [], "no phones, no connection");
  assert.equal(wire.seen.origins.length, 1);
});

test("a refused connection or a push that never answers is every phone refused, never a throw or a held webhook", async () => {
  const k = { ...keys, keyId: "KEYWIRE002", sandbox: true };
  const down = http2Stub(() => ({ status: 200 }), { fail: "connect ECONNREFUSED" });
  const refused = await apns(k, { connect: down.connect }).startActivities(["t1", "t2"], {});
  assert.deepEqual(
    refused.map((s) => [s.state, s.error]),
    [
      ["refused", "connect ECONNREFUSED"],
      ["refused", "connect ECONNREFUSED"],
    ],
    "REGRESSION: a session error with no listener took the webhook's process down",
  );
  assert.deepEqual(down.seen.origins, [APNS_SANDBOX]);
  assert.equal(down.seen.destroyed, 1);
  const hung = http2Stub((t) => (t === "slow" ? "hang" : { status: 200 }));
  const t0 = Date.now();
  const sends = await apns(k, { connect: hung.connect, waitMs: 30 }).startActivities(["fast", "slow"], {});
  assert.deepEqual(sends, [
    { token: "fast", state: "started" },
    { token: "slow", state: "refused", error: "apns_timeout" },
  ]);
  assert.ok(Date.now() - t0 < 1000, "bounded by the wait, not by the function's own timeout");
  assert.equal(hung.seen.destroyed, 1, "a stream that never answered is not waited for by close()");
});

test("the provider token is minted once for every delivery within the hour, and afresh after it", async () => {
  let t = Date.UTC(2026, 8, 26, 10, 0, 0);
  const k = { ...keys, keyId: "KEYCACHE01" };
  const wire = http2Stub(() => ({ status: 200 }));
  // The webhook builds a port per delivery: the token must outlive the port, or Apple answers 429.
  await apns(k, { connect: wire.connect, now: () => t }).startActivities(["a"], {});
  t += 10 * 60_000;
  await apns(k, { connect: wire.connect, now: () => t }).startActivities(["b"], {});
  const [a, b] = wire.seen.requests.map((r) => r.headers.authorization);
  assert.equal(a, b, "REGRESSION: a new provider token on every webhook delivery");
  t += 55 * 60_000;
  await apns(k, { connect: wire.connect, now: () => t }).startActivities(["c"], {});
  assert.notEqual(wire.seen.requests[2].headers.authorization, a, "a fresh token after the hour");
});
