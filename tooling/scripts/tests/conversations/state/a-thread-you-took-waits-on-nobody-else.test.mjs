/**
 * Which threads and which people wait on a person, read by the one standing rule (packages/db threadIdsWaitingOnYou,
 * personIdsWaitingOnYou over contracts standingOfThread). A campaign run's replies and a business's people said "Needs you"
 * from the raw needs_human column, so a reply a member had already taken still said it on the run's sheet, and a colleague
 * whose thread the reader held wore a Needs you dot on the business sheet (the wiring's second audit, R11 S9-1). Run over a
 * database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { threadIdsWaitingOnYou, personIdsWaitingOnYou } = await import(
  pathToFileURL(path.join(ROOT, "packages/db/src/repositories/waiting-on-you.ts")).href
);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = Date.parse("2026-10-14T12:00:00Z");
const at = (ms) => new Date(ms).toISOString();
const H = 3_600_000;

const thread = (id, contact, over = {}) => ({
  id,
  tenant_id: T,
  contact_id: contact,
  state: "needs_human",
  paused_until: null,
  assignee_user_id: null,
  last_message_at: at(NOW - H),
  ...over,
});
const hold = (conversation, reason = "human_token") => ({
  id: `e-${conversation}`,
  tenant_id: T,
  conversation_id: conversation,
  reason,
  state: "open",
});

function world() {
  return fakeDb({
    conversations: [
      thread("c-waiting", "p-1"),
      // Taken by a member: theirs to answer, nobody else's wait.
      thread("c-taken", "p-2", { assignee_user_id: "u-1" }),
      // The receptionist answers it again: not flagged.
      thread("c-open", "p-3", { state: "open" }),
      // A STOP's hold, left open: it waits on nobody, and the receptionist answers the thread.
      thread("c-stopped", "p-4", { state: "open" }),
      // A hold that waits on a person, whatever the thread's column says: it waits on you.
      thread("c-held", "p-6", { state: "open" }),
      // An old flagged thread under a newer one the receptionist answers: the person waits on nobody.
      thread("c-old", "p-5", { last_message_at: at(NOW - 48 * H) }),
      thread("c-new", "p-5", { state: "open", last_message_at: at(NOW - H) }),
    ],
    escalations: [hold("c-waiting"), hold("c-taken"), hold("c-stopped", "opt_out"), hold("c-old"), hold("c-held")],
  });
}

test("of a run's replies, only a thread flagged that nobody has taken waits on you, flagged by its column or by a hold that waits on someone: a taken one, one the receptionist answers and one with a STOP's hold do not", async () => {
  const waiting = await threadIdsWaitingOnYou(
    world(),
    T,
    ["c-waiting", "c-taken", "c-open", "c-stopped", "c-held"],
    NOW,
  );
  assert.deepEqual(
    [...waiting].sort(),
    ["c-held", "c-waiting"],
    "and one an open hold flags, whatever its column says",
  );
  assert.deepEqual([...(await threadIdsWaitingOnYou(world(), T, [], NOW))], [], "nothing asked, nothing read");
});

test("of a business's people, one waits on you by their latest thread alone: never a colleague whose thread a member holds, or one whose old flagged thread a newer one answers", async () => {
  const waiting = await personIdsWaitingOnYou(world(), T, ["p-1", "p-2", "p-3", "p-4", "p-5", "p-6"], NOW);
  assert.deepEqual([...waiting].sort(), ["p-1", "p-6"]);
});
