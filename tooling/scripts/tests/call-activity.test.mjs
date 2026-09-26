/**
 * The call in progress on the phones (the PRD, PR 7): the rule that starts one activity per phone of the workspace's
 * people (apps/edge/lib/voice/call-activity.ts), the payload in the shape expo-widgets reads (contracts
 * live-activity.ts), and Apple's wire executed against a stub of HTTP/2 (apps/edge/lib/ops/apns.ts) with a provider
 * token that verifies under the key that signed it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { tellPhonesCallStarted } = await import(at("apps/edge/lib/voice/call-activity.ts"));
const { apns, apnsJwt, APNS_PRODUCTION, APNS_SANDBOX } = await import(at("apps/edge/lib/ops/apns.ts"));
const live = await import(at("packages/contracts/src/live-activity.ts"));
const { callActivityStart, callActivityPropsOf, CALL_ACTIVITY_NAME, CALL_ACTIVITY_STALE_MS } = live;

const T = "11111111-1111-4111-8111-111111111111";
const call = {
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
    who: "+16465550123",
    line: "+13055550100",
    startedAt: "2026-09-26T10:00:00.000Z",
  });
  assert.equal(p.aps.timestamp, Math.floor(NOW.getTime() / 1000));
  assert.equal(p.aps["stale-date"], p.aps.timestamp + CALL_ACTIVITY_STALE_MS / 1000);
  assert.equal(p.aps.alert.body, "+16465550123 is on the line.");
  assert.equal(callActivityPropsOf({ ...call, who: "Maria" }).who, "Maria", "a name when the line has one");
  assert.equal(
    callActivityPropsOf({ from_e164: null, from_raw: null, to_e164: null, started_at: null }).who,
    "Someone",
  );
});

const port = (refuse = []) => {
  const sent = [];
  return {
    sent,
    async startActivity(token, payload) {
      if (refuse.includes(token)) throw new Error('apns_rejected 410 {"reason":"Unregistered"}');
      sent.push({ token, payload });
    },
  };
};

test("every phone of the workspace's people that has an activity token is started once; a refusal is named, never thrown", async () => {
  const tables = {
    memberships: [
      { tenant_id: T, user_id: "u1" },
      { tenant_id: T, user_id: "u2" },
      { tenant_id: "other", user_id: "u3" },
    ],
    push_devices: [
      { user_id: "u1", token: "p1", activity_token: "a1" },
      { user_id: "u1", token: "p2", activity_token: null },
      { user_id: "u2", token: "p3", activity_token: "a2" },
      { user_id: "u2", token: "p4", activity_token: "a2" },
      { user_id: "u3", token: "p5", activity_token: "a3" },
    ],
  };
  const p = port(["a2"]);
  const out = await tellPhonesCallStarted(fakeDb(tables), T, call, p, NOW);
  assert.deepEqual(
    p.sent.map((s) => s.token),
    ["a1"],
  );
  assert.equal(out.started, 1);
  assert.deepEqual(
    out.refused.map((r) => r.token),
    ["a2"],
    "one token, one try, one refusal",
  );
  assert.equal(p.sent[0].payload.aps["content-state"].name, CALL_ACTIVITY_NAME);
});

test("no port, or nobody in the workspace: nothing is sent and nothing is read that need not be", async () => {
  assert.deepEqual(await tellPhonesCallStarted(fakeDb({}), T, call, null, NOW), { started: 0, refused: [] });
  const p = port();
  assert.deepEqual(await tellPhonesCallStarted(fakeDb({ memberships: [], push_devices: [] }), T, call, p, NOW), {
    started: 0,
    refused: [],
  });
  assert.equal(p.sent.length, 0);
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

/** A stub of node:http2's session: one request, the answer given, the headers and body kept. */
const http2Stub = (status, body = "") => {
  const seen = { origins: [], requests: [], closed: 0 };
  const connect = (origin) => {
    seen.origins.push(origin);
    return {
      request(headers) {
        const cbs = {};
        const req = {
          on(ev, cb) {
            cbs[ev] = cb;
          },
          end(payload) {
            seen.requests.push({ headers, payload: JSON.parse(payload) });
            queueMicrotask(() => {
              cbs.response({ ":status": status });
              if (body) cbs.data(Buffer.from(body));
              cbs.end();
            });
          },
        };
        return req;
      },
      close() {
        seen.closed += 1;
      },
    };
  };
  return { seen, connect };
};

test("a start is a liveactivity push to the token's path with the topic's suffix; the token is minted once an hour; a refusal throws its status", async () => {
  let t = Date.UTC(2026, 8, 26, 10, 0, 0);
  const ok = http2Stub(200);
  const port = apns(keys, ok.connect, () => t);
  await port.startActivity("tokA", { aps: { event: "start" } });
  t += 10 * 60_000;
  await port.startActivity("tokB", { aps: { event: "start" } });
  assert.deepEqual(ok.seen.origins, [APNS_PRODUCTION, APNS_PRODUCTION]);
  const [a, b] = ok.seen.requests;
  assert.equal(a.headers[":path"], "/3/device/tokA");
  assert.equal(a.headers["apns-push-type"], "liveactivity");
  assert.equal(a.headers["apns-topic"], "com.example.app.push-type.liveactivity");
  assert.equal(a.headers["apns-priority"], "10");
  assert.match(a.headers.authorization, /^bearer /);
  assert.equal(a.headers.authorization, b.headers.authorization, "the same token within the hour");
  assert.deepEqual(a.payload, { aps: { event: "start" } });
  assert.equal(ok.seen.closed, 2, "the session is closed after each push");
  t += 55 * 60_000;
  await port.startActivity("tokC", { aps: {} });
  assert.notEqual(ok.seen.requests[2].headers.authorization, a.headers.authorization, "a fresh token after the hour");

  const no = http2Stub(410, '{"reason":"Unregistered"}');
  await assert.rejects(
    apns({ ...keys, sandbox: true }, no.connect).startActivity("dead", {}),
    /apns_rejected 410 .*Unregistered/,
  );
  assert.deepEqual(no.seen.origins, [APNS_SANDBOX]);
  assert.equal(no.seen.closed, 1);
});
