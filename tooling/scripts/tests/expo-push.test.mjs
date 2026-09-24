/**
 * The push transport, executed against a stub of Expo's push service: batches of a hundred, the token when one is
 * set, a receipt per message in order, and a refusal thrown with its status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { expoPush, EXPO_PUSH_URL, PUSH_BATCH } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/push.ts")).href
);

const msg = (i) => ({
  to: `tok-${i}`,
  title: "t",
  body: "b",
  sound: "default",
  data: { route: null, notification_id: "n", tenant_id: "t" },
});
const stub = (answer) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization ?? null, n: body.length });
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return { ok: false, status: answer, text: async () => "no" };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: body.map((m) =>
          m.to === "tok-1"
            ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }
            : { status: "ok", id: "r" },
        ),
      }),
    };
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
  assert.deepEqual(receipts[0], { to: "tok-0", status: "ok" });
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
