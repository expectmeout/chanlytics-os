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
import { readCode } from "./_source.mjs";

test("the plain transcript text becomes turns; a line with no speaker continues the turn before it", () => {
  const turns = parseTranscriptText("Agent: Thank you for calling!\nUser: What time are you open?\nAgent: Tomorrow is Saturday,\n9:30 to 7.\n\nUser: Thanks.");
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

test("a transcript_updated delivery is read from the call object OR the body, then the text — and says which keys it carried", () => {
  const hook = readCode("apps/edge/api/retell-webhook.ts");
  const guard = hook.indexOf('if (event === "transcript_updated") {');
  const norm = hook.indexOf("const n = normalizeCall(call);");
  assert.ok(guard > 0 && guard < norm, "sourced BEFORE normalising");
  assert.ok(hook.includes("call.transcript_with_tool_calls = top.transcript_with_tool_calls as"));
  assert.ok(hook.includes("call.transcript_object = top.transcript_object as"));
  assert.ok(hook.includes('if (!call.transcript && typeof top.transcript === "string") call.transcript = top.transcript;'));
  assert.ok(hook.includes("call.transcript_object = parseTranscriptText(call.transcript) ?? undefined;"), "the words alone still become turns");
  assert.ok(hook.includes("body_keys: bodyKeys,") && hook.includes("call_keys: callKeys,"), "key NAMES ride in the delivery row");
  assert.ok(hook.includes('Object.keys(top).filter((k) => k !== "call")'));
  assert.ok(!/body_keys:[^,]*content/.test(hook), "never the words");
});
