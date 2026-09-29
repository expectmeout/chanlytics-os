/**
 * The push transport, executed against a stub of Expo's push service: batches of a hundred, the token when one is
 * set, a receipt per message in order, and a refusal thrown with its status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { expoPush, EXPO_PUSH_URL, EXPO_RECEIPTS_URL, PUSH_BATCH, RECEIPTS_BATCH } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/push.ts")).href
);

const msg = (i) => ({
  to: `tok-${i}`,
  title: "t",
  body: "b",
  sound: "default",
  data: { route: null, notification_id: "n", tenant_id: "t" },
});
/** The service's answer as fetch hands it over: a real Response, which the transport reads through providerFetch. */
const reply = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const stub = (answer) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization ?? null, n: body.length });
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return reply(answer, "no");
    return reply(200, {
      data: body.map((m) =>
        m.to === "tok-1"
          ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }
          : { status: "ok", id: "r" },
      ),
    });
  };
  return { calls, fetchImpl };
};

test("one request per hundred, the receipts in the messages' order, a gone device named", async () => {
  const s = stub();
  const receipts = await expoPush(s.fetchImpl).send(Array.from({ length: PUSH_BATCH + 1 }, (_, i) => msg(i)));
  assert.deepEqual(
    s.calls.map((c) => c.n),
    [PUSH_BATCH, 1],
  );
  assert.equal(s.calls[0].url, EXPO_PUSH_URL);
  assert.equal(s.calls[0].auth, null, "no token, no header");
  assert.equal(receipts.length, PUSH_BATCH + 1);
  assert.deepEqual(receipts[1], { to: "tok-1", status: "error", error: "DeviceNotRegistered" });
  assert.deepEqual(receipts[0], { to: "tok-0", status: "ok", id: "r" }, "the ticket's id, for its receipt");
});

test("the access token rides as a bearer when set; a refusal or a dead wire throws with what happened", async () => {
  process.env.EXPO_ACCESS_TOKEN = "expo-secret";
  try {
    const s = stub();
    await expoPush(s.fetchImpl).send([msg(0)]);
    assert.equal(s.calls[0].auth, "Bearer expo-secret");
  } finally {
    delete process.env.EXPO_ACCESS_TOKEN;
  }
  await assert.rejects(expoPush(stub(503).fetchImpl).send([msg(0)]), /push_rejected 503/);
  await assert.rejects(expoPush(stub(new Error("ECONNRESET")).fetchImpl).send([msg(0)]), /ECONNRESET/);
  assert.deepEqual(await expoPush(stub().fetchImpl).send([]), [], "nothing to send is nothing sent");
});

test("once a batch has left, a later batch's refusal or dead wire is said in its receipts, never thrown", async () => {
  // A retry after a throw would send the first hundred again (RETRY_WAITS_MS push_send): the ledger's rule.
  const answers = [
    (init) => reply(200, { data: JSON.parse(init.body).map(() => ({ status: "ok", id: "r" })) }),
    () => reply(503, "busy"),
  ];
  const fetchImpl = async (url, init) => answers.shift()(init);
  const receipts = await expoPush(fetchImpl).send(Array.from({ length: PUSH_BATCH + 2 }, (_, i) => msg(i)));
  assert.equal(receipts.length, PUSH_BATCH + 2);
  assert.deepEqual(receipts[0], { to: "tok-0", status: "ok", id: "r" });
  assert.deepEqual(receipts[PUSH_BATCH], { to: `tok-${PUSH_BATCH}`, status: "error", error: "push_rejected 503 busy" });
  const dead = [
    (init) => reply(200, { data: JSON.parse(init.body).map(() => ({ status: "ok", id: "r" })) }),
    () => {
      throw new Error("ECONNRESET");
    },
  ];
  const dying = async (url, init) => dead.shift()(init);
  const r2 = await expoPush(dying).send(Array.from({ length: PUSH_BATCH + 1 }, (_, i) => msg(i)));
  assert.deepEqual(r2[PUSH_BATCH], { to: `tok-${PUSH_BATCH}`, status: "error", error: "push_rejected ECONNRESET" });
});

test("tokens of two apps in one batch: the service refuses the whole batch, so each app's go in a request of their own", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.map((m) => m.to));
    const tokens = body.map((m) => m.to);
    if (tokens.includes("tok-0") && tokens.includes("tok-2")) {
      return reply(400, {
        errors: [
          {
            code: "PUSH_TOO_MANY_EXPERIENCE_IDS",
            message: "All push notification messages in the same request must be for the same project",
            details: { "@ours/chanlytics": ["tok-0", "tok-1"], "@someone/else": ["tok-2"] },
          },
        ],
      });
    }
    if (tokens.includes("tok-2")) return reply(400, "not yours");
    return reply(200, { data: tokens.map(() => ({ status: "ok", id: "r" })) });
  };
  const receipts = await expoPush(fetchImpl).send([msg(0), msg(1), msg(2), msg(3)]);
  assert.deepEqual(calls, [["tok-0", "tok-1", "tok-2", "tok-3"], ["tok-0", "tok-1"], ["tok-2"]]);
  assert.deepEqual(
    receipts.map((r) => [r.to, r.status, r.error ?? r.id]),
    [
      ["tok-0", "ok", "r"],
      ["tok-1", "ok", "r"],
      ["tok-2", "error", "push_rejected 400"],
      ["tok-3", "error", "push_rejected 400"],
    ],
    "this app's phones are told; the other app's token and one the service named nowhere are refused, not thrown",
  );
});

test("the receipts, a thousand ids a request, by id; a phone gone in its receipt is named; a refusal throws", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, n: body.ids.length });
    if (body.ids.includes("boom")) return reply(500, "down");
    const data = {};
    for (const id of body.ids) {
      if (id === "gone") data[id] = { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } };
      else if (id === "late")
        continue; // no receipt yet: absent, not an answer
      else data[id] = { status: "ok" };
    }
    return reply(200, { data });
  };
  const ids = Array.from({ length: RECEIPTS_BATCH + 2 }, (_, i) => (i === 3 ? "gone" : i === 4 ? "late" : `t${i}`));
  const got = await expoPush(fetchImpl).receipts(ids);
  assert.deepEqual(
    calls.map((c) => c.n),
    [RECEIPTS_BATCH, 2],
  );
  assert.equal(calls[0].url, EXPO_RECEIPTS_URL);
  assert.deepEqual(got.gone, { status: "error", error: "DeviceNotRegistered" });
  assert.deepEqual(got.t0, { status: "ok" });
  assert.equal(got.late, undefined, "no receipt yet is no answer");
  await assert.rejects(expoPush(fetchImpl).receipts(["boom"]), /push_receipts_rejected 500/);
  assert.deepEqual(await expoPush(fetchImpl).receipts([]), {}, "nothing asked is nothing answered");
});
