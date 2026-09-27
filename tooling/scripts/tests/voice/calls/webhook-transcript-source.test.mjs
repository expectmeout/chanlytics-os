/**
 * Where the live transcript rides, proved by the fourth real call.
 *
 * Every per-turn delivery arrived ongoing, with the agent id, and was
 * ingested — carrying NONE of transcript / transcript_object /
 * transcript_with_tool_calls inside `call`, while call_ended carried all
 * three (delivery rows 03:20:25–03:20:52 UTC, 2026-09-05). So the row held no
 * word until the call was over, realtime dutifully repainted an empty
 * transcript on every turn, and the owner watched "nothing has been said
 * yet" through a conversation. The webhook now reads the fields from the
 * body's top level as well, falls back to the spoken text, and records the
 * key names each delivery carried.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranscriptText, liveTurns } from "@chanlytics/channels";

test("the plain transcript text becomes turns; a line with no speaker continues the turn before it", () => {
  const turns = parseTranscriptText(
    "Agent: Thank you for calling!\nUser: What time are you open?\nAgent: Tomorrow is Saturday,\n9:30 to 7.\n\nUser: Thanks.",
  );
  assert.deepEqual(turns, [
    { role: "agent", content: "Thank you for calling!" },
    { role: "user", content: "What time are you open?" },
    { role: "agent", content: "Tomorrow is Saturday, 9:30 to 7." },
    { role: "user", content: "Thanks." },
  ]);
  assert.equal(parseTranscriptText(""), null);
  assert.equal(parseTranscriptText("just words, no speaker"), null, "nothing attributable is nothing");
  // The same shape the structured path produces, so the page renders both alike.
  assert.deepEqual(liveTurns([{ role: "agent", content: "hi" }]), [{ role: "agent", content: "hi" }]);
});
