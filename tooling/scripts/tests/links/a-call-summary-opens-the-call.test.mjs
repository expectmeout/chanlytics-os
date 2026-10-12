/**
 * The owner's notice of an analysed call opens THAT CALL (wiring/records-not-pages, task 1.7; finding A2b): it opened the
 * Calls tab, though the notice is about one call and its row names it. The bell, the phone and the mail now open the call's
 * page, `conversations/cv-<call id>`, as the Today queue's "Open the call" and the person's history already do; and the mail
 * ends with the link to it (finding A2a). When the call needs a call back the row is about the THREAD (that is where the work
 * is, and the bell pairs it with the customer's "needs you" row), but the summary it carries is still the call's, so it still
 * opens the call. Run through the real door, over a database in memory.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { openDoor, wire } from "../voice/calls/_retell-webhook-world.mjs";

// The door reads its keys at import; each test file is its own process, so this is the whole environment.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.harbor.test";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg, deliver, world } = await openDoor();
after(() => setPg(null));

/** A workspace with its owner on file and its address word known, and one analysed call delivered. */
async function delivered(over = {}) {
  const w = world();
  w.tables.tenants[0].slug = "harbor";
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: { notifications: { escalation_emails: ["owner@harbor.test"] } },
  });
  w.open();
  const line = wire();
  try {
    const call = w.analysed(w.callId("open"));
    if (over.outcome) call.call_analysis.custom_analysis_data.outcome = over.outcome;
    if (over.outcome) call.call_analysis.custom_analysis_data.follow_up = "Call Rosa back.";
    const res = await deliver("call_analyzed", call);
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    assert.equal(w.tables.notifications.length, 1, "the owner is told once");
    return { w, row: w.tables.notifications[0], call: w.tables.calls[0], mail: line.mail() };
  } finally {
    line.restore();
  }
}

test("the summary of a call opens the call, names it, and its mail ends with the link to it", async () => {
  const { row, call, mail } = await delivered();
  assert.equal(row.kind, "call");
  assert.equal(
    row.route,
    `conversations/cv-${call.id}`,
    "was conversations/phone: the Calls tab, whose top is not this call",
  );
  assert.deepEqual([row.subject_type, row.subject_id], ["call", call.id]);
  assert.equal(mail.length, 1);
  assert.ok(
    mail[0].text.endsWith(`\n\nOpen it: https://app.harbor.test/w/harbor/conversations/cv-${call.id}`),
    mail[0].text.slice(-140),
  );
});

test("a call that needs a call back is about the thread but its summary still opens the call", async () => {
  const { w, row, call } = await delivered({ outcome: "callback_needed" });
  assert.equal(row.route, `conversations/cv-${call.id}`);
  assert.deepEqual(
    [row.subject_type, row.subject_id],
    ["conversation", call.conversation_id],
    "the bell pairs it with the customer's needs-you row, as before",
  );
  assert.ok(w.tables.escalations.length === 1, "and the callback is a hold of its own");
});
