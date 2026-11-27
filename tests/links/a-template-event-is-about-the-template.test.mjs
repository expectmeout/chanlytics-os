/**
 * A message of the Library sent to WhatsApp or deleted is on the ledger about THAT message (wiring/records-not-pages, task 1.6,
 * the second round): the event is written on the template row (subject_type "template", the row's id), with its name and
 * language in the data, where it was written on the workspace and could open nothing. The line reads as it did (its words
 * come from the data), and opens the message's own drawer in the Library by name while the row is there to open; a message
 * that was deleted has no page, and the line says it in words alone. Since 00722 the doors that keep and remove the row write
 * it in the same transaction (template_submitted_keep, template_remove), and the dashboard writes none (00723).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityWords } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const { saveTemplateRow, deleteTemplateRow } = await import("@chanlytics/db/campaigns");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TP = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const USER = "11111111-1111-4111-8111-111111111111";

test("a template sent to WhatsApp and one deleted are written on the template, with its name in the data", async () => {
  const world = { templates: [], events: [] };
  const db = fakeDb(world);
  const saved = await saveTemplateRow(
    db,
    A,
    { id: TP, tenant_id: A, channel: "whatsapp", name: "spring_offer", language: "en", meta_status: "pending" },
    USER,
  );
  assert.equal(saved.error, null);
  const gone = await deleteTemplateRow(db, A, TP, USER);
  assert.equal(gone.data, true);
  assert.deepEqual(
    world.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data]),
    [
      [A, "template.submitted", "template", TP, { name: "spring_offer", language: "en", by: USER }],
      [A, "template.removed", "template", TP, { name: "spring_offer", language: "en", by: USER }],
    ],
    "REGRESSION: both were about the workspace, which opens nothing",
  );
  assert.equal(
    activityWords("template.submitted", world.events[0].data),
    "A message was sent to WhatsApp for approval · spring_offer",
    "and the line reads as it did",
  );
  assert.equal(
    activityWords("template.removed", world.events[1].data),
    "A message was deleted from Messages · spring_offer",
  );
});
