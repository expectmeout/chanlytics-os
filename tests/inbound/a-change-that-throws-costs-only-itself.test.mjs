/**
 * A delivery from Meta carries several changes, and a change that throws costs only itself (apps/edge/lib/whatsapp/
 * webhook.ts handleChange): until 3 Nov 2026 a throw unwound to the loop's one catch, which answered 200 with every
 * change after it unread, so Meta never sent those again. The changes after it are read; what the failed one carried is
 * asked for again.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fakeDb } from "../_fake-db.mjs";
import { linesOf } from "../_log-lines.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.META_APP_SECRET = "meta-app-secret-for-this-file";
for (const k of ["RESEND_API_KEY", "ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const hook = await import(at("apps/edge/api/whatsapp.ts"));
after(() => setPg(null));

/** A delivery signed the way Meta signs one: sha256 over the raw body with the app's secret. */
function delivery(body) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac("sha256", process.env.META_APP_SECRET).update(raw).digest("hex");
  return new Request("http://edge/api/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${sig}` },
    body: raw,
  });
}

test("a change that throws is said and asked for again, and the change after it is still read", async () => {
  // The first change's number is a workspace's, so its messages are read one by one; the second's is nobody's.
  const line = {
    id: "ch-1",
    tenant_id: "aaaaaaaa-0000-4000-8000-0000000000c1",
    kind: "whatsapp",
    status: "active",
    external_id: "111",
    number_e164: "+13055550199",
    credentials_ref: null,
    config: {},
  };
  setPg(fakeDb({ tenant_channels: [line], events: [] }));
  const body = {
    entry: [
      {
        id: "waba-1",
        changes: [
          // A change whose message is not one: taking it in throws.
          {
            field: "messages",
            value: { metadata: { phone_number_id: "111" }, messages: [null], statuses: [{}] },
          },
          // A message to a number no workspace holds: read, said, and acknowledged as unroutable.
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "222" },
              messages: [{ from: "13055550100", id: "wamid.after", type: "text", text: { body: "hi" } }],
            },
          },
        ],
      },
    ],
  };
  const { result: res, lines } = await linesOf(() => hook.POST(delivery(body)));
  const events = lines.map((l) => l.event);
  const failed = lines.find((l) => l.event === "wa_webhook_error");
  assert.ok(failed, "the throw is said");
  assert.equal(failed.field, "messages", "with the change it came from");
  assert.ok(
    lines.some((l) => l.event === "wa_skip_unroutable" && l.phone_number_id === "222"),
    `the change after it was read: ${events.join(", ")}`,
  );
  assert.equal(res.status, 503, "what the failed change carried is asked for again");
});
