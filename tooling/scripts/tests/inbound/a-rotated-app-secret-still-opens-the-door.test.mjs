/**
 * Meta's app secret can be rotated without a refused delivery: while META_APP_SECRET_PREVIOUS is set, a delivery signed
 * with the secret being retired still opens the WhatsApp door (apps/edge/lib/whatsapp/webhook.ts signedByMeta), and the
 * old secret alone, with no current one, opens nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

for (const k of ["META_APP_SECRET", "META_APP_SECRET_PREVIOUS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const hook = await import(at("apps/edge/api/whatsapp.ts"));
after(() => setPg(null));

/** A delivery that asks nothing of the database (a field nobody routes), signed with `secret`. */
function delivery(secret) {
  const raw = JSON.stringify({ entry: [{ id: "waba-1", changes: [{ field: "nothing_we_read", value: {} }] }] });
  const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("http://edge/api/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${sig}` },
    body: raw,
  });
}

async function withSecrets(current, previous, fn) {
  const was = [process.env.META_APP_SECRET, process.env.META_APP_SECRET_PREVIOUS];
  for (const [k, v] of [
    ["META_APP_SECRET", current],
    ["META_APP_SECRET_PREVIOUS", previous],
  ]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of [
      ["META_APP_SECRET", was[0]],
      ["META_APP_SECRET_PREVIOUS", was[1]],
    ]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("while a rotation is under way, the retiring secret opens the door beside the new one; alone, it opens nothing", async () => {
  setPg(fakeDb({}));
  const status = async (current, previous, signedWith) =>
    (await withSecrets(current, previous, () => hook.POST(delivery(signedWith)))).status;
  assert.equal(await status("new-secret", undefined, "new-secret"), 200, "the current secret opens it");
  assert.equal(await status("new-secret", undefined, "old-secret"), 401, "no rotation: the old secret is refused");
  assert.equal(await status("new-secret", "old-secret", "old-secret"), 200, "during the rotation it still opens");
  assert.equal(await status("new-secret", "old-secret", "new-secret"), 200, "and so does the new one");
  assert.equal(await status(undefined, "old-secret", "old-secret"), 401, "the old secret alone is no configuration");
});
