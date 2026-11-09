import "server-only";
import { z } from "zod";
import { ASK_CAPS, abandonedCall, askCallOutcome, dayInZone, noteRows, toCallVM, UUID } from "@chanlytics/contracts";
import { load } from "../../../shared/reader";
import { call } from "../../../readers/call";
import { calls as callsReader } from "../../../readers/calls";
import { notePerson, noteRow, str, readUnlessNotFound } from "../context/tool-reads";
import { defineActions, readAction, type ToolContext } from "../context/tool-defs";

/** The business's day a call fell on (zone-math), or none for a time or a zone that is none. */
function dayKey(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return dayInZone(tz, Date.parse(iso)).key;
  } catch {
    // A zone or a code the runtime does not know.
    return null;
  }
}

async function listCalls(toolContext: ToolContext, input: { filter: string }): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  // The business's zone, as the turn read it (the route's facts): not read again.
  const { timezone } = toolContext;
  // The hundred newest, as the Calls page reads them (readers/calls.ts), once in the turn.
  const calls = (await load(toolContext.rc, callsReader, {})).data.calls;
  const todayKey = dayKey(toolContext.now.toISOString(), timezone);
  const vms = calls.map((c) => toCallVM(c, timezone, toolContext.now));
  const abandoned = new Set(calls.filter(abandonedCall).map((c) => c.id));
  const picked = vms
    .filter((value, index) => {
      const item = calls[index];
      if (!item) return false;
      switch (filter) {
        case "missed":
          // The outcome the rows below say: a dial the receptionist placed that nobody answered is not_connected, not missed.
          return askCallOutcome(value) === "missed" && dayKey(item.started_at, timezone) === todayKey;
        case "abandoned":
          return abandoned.has(item.id) && dayKey(item.started_at, timezone) === todayKey;
        case "today":
          return dayKey(item.started_at, timezone) === todayKey;
        case "live":
          return value.outcome === "live";
        default:
          return true;
      }
    })
    .slice(0, ASK_CAPS.calls);
  // Each call, and its caller where People holds them: the rows say contact_id, so their profile opens.
  for (const v of picked) {
    noteRow(toolContext, "call", v.callId, v.who, `conversations/cv-${v.callId}`);
    notePerson(toolContext, v.clientId, v.who);
  }
  return {
    filter,
    calls: picked.map((call) => ({
      call_id: call.callId,
      route: `conversations/cv-${call.callId}`,
      who: call.who,
      direction: call.direction,
      at: call.at,
      duration: call.duration ?? null,
      outcome: askCallOutcome(call),
      ...(abandoned.has(call.callId) ? { abandoned: true } : {}),
      summary: call.summary.headline,
      conversation_id: call.threadId ? call.threadId.replace(/^th-/, "") : null,
      contact_id: call.clientId,
    })),
  };
}

async function getCall(toolContext: ToolContext, input: { call_id: string }): Promise<unknown> {
  const id = str(input.call_id);
  if (!UUID.test(id)) return { error: "call_id must be an id a tool returned" };
  // The call as the Calls page maps it, under this workspace's own filter (readers/call.ts), once a turn; a call not
  // here is the reader's 404.
  const result = await readUnlessNotFound(load(toolContext.rc, call, { id }));
  if (!result) return { error: "no such call in this workspace" };
  const callVM = toCallVM(result.data.call, toolContext.timezone, toolContext.now);
  // The call and its person, as the reader gave them.
  noteRows(toolContext.read, result.rows);
  return {
    call_id: id,
    route: `conversations/cv-${id}`,
    who: callVM.who,
    direction: callVM.direction,
    at: callVM.at,
    duration: callVM.duration ?? null,
    outcome: askCallOutcome(callVM),
    summary: callVM.summary,
    recording: callVM.recordingState,
    contact_id: callVM.clientId,
    transcript: callVM.transcript
      .slice(0, ASK_CAPS.transcript)
      .map((x) => `${x.speaker === "client" ? "caller" : x.speaker}: ${x.text}`),
    transcript_turns: callVM.transcript.length,
  };
}

/** Phone calls (D11): the list (list, once list_calls) and one call with its transcript (get, once get_call). */
export const callsTool = defineActions({
  name: "calls",
  description: "Phone calls, as the Calls page and a call's page read them.",
  tail: `Call action list to find calls by day, outcome or whether they are live, and a live call before proposing a whisper; a count of calls is the today tool's or the page's own, since the rows here are capped. Call action get when the transcript or the full summary is needed and the page on screen holds only the call's row. list returns at most ${ASK_CAPS.calls} calls from the newest hundred; nothing changes because it was read. get caps the transcript at ${ASK_CAPS.transcript} turns, with transcript_turns saying how many there are; a call the workspace does not hold is an error, said in words.`,
  actions: {
    list: readAction({
      input: z.object({ filter: z.enum(["missed", "abandoned", "today", "live", "recent"]) }),
      examples: [{ filter: "missed" }],
      label: "Reading the calls",
      words:
        "Action list takes filter and lists calls newest first: who, when, how long, how it ended, a one-line summary, and the ids of the call, its conversation and the person; filter is missed (today's missed calls), abandoned (today's inbound callers who reached the receptionist and hung up within seconds, so they got nothing), today, live (on the line now), or recent (newest first).",
      run: listCalls,
    }),
    get: readAction({
      input: z.object({ call_id: z.string() }),
      examples: [{ call_id: "7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f" }],
      label: "Reading the call",
      words:
        "Action get takes call_id, the id a row here, the today tool or people with action get returned, and reads one call: who, when, how long, how it ended, its summary, the state of its recording, the caller's contact id, and the transcript turn by turn.",
      run: getCall,
    }),
  },
});
