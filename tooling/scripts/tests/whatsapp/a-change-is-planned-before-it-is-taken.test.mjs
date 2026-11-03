/**
 * The WhatsApp door's plan for one change of a delivery (apps/edge/lib/whatsapp/delivery-plan.ts planWhatsappChange),
 * run every way: what is taken in, what is owed (the door's 503), the line it says and the platform's alert. The door
 * itself is run in whatsapp-door.test.mjs; this is the table it follows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { planWhatsappChange } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/delivery-plan.ts")).href
);

const carried = (over = {}) => ({ messages: 0, statuses: 0, echoes: 0, ...over });
const plan = (field, c, routing, isHistory = false) => planWhatsappChange(field, carried(c), routing, isHistory);

test("a customer's messages: taken in when routed; owed when the read failed or there is no database; said and let go when the number is nobody's", () => {
  assert.deepEqual(plan("messages", { messages: 2 }, "routed"), { take: "messages", owed: 0, log: null, alert: null });
  assert.deepEqual(plan("messages", { messages: 2 }, "lookup_failed"), {
    take: null,
    owed: 2,
    log: "wa_skip_routing_failed",
    alert: "whatsapp_unreadable",
  });
  assert.deepEqual(plan("messages", { messages: 2 }, "no_database"), {
    take: null,
    owed: 2,
    log: "wa_skip_routing_failed",
    alert: null,
  });
  assert.deepEqual(plan("messages", { messages: 2 }, "unroutable"), {
    take: null,
    owed: 0,
    log: "wa_skip_unroutable",
    alert: "whatsapp",
  });
});

test("receipts and echoes: kept unless the routing read failed, when every one is owed", () => {
  for (const routing of ["routed", "unroutable", "no_database"]) {
    assert.equal(plan("messages", { statuses: 3 }, routing).take, "receipts", routing);
    assert.equal(plan("smb_message_echoes", { echoes: 1 }, routing).take, "echoes", routing);
  }
  assert.deepEqual(plan("messages", { statuses: 3 }, "lookup_failed"), {
    take: null,
    owed: 3,
    log: "wa_skip_routing_failed",
    alert: null,
  });
  assert.deepEqual(plan("smb_message_echoes", { echoes: 1 }, "lookup_failed"), {
    take: null,
    owed: 1,
    log: "wa_skip_routing_failed",
    alert: null,
  });
});

test("a change of messages and receipts at once is its messages' (Meta sends them apart; the door asks the messages first)", () => {
  assert.equal(plan("messages", { messages: 1, statuses: 1 }, "routed").take, "messages");
});

test("history is handed on whatever its routing (the run says what it could not keep); anything else is said and acknowledged", () => {
  for (const routing of ["routed", "lookup_failed", "unroutable", "no_database"])
    assert.equal(plan("history", {}, routing, true).take, "history", routing);
  assert.deepEqual(plan("calls", {}, "routed"), { take: null, owed: 0, log: "wa_event", alert: null });
});
