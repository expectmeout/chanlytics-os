import "server-only";
import { z } from "zod";
import { ASK_CAPS, abandonedCall, noteRows, toCallVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { call } from "../../../readers/call";
import { calls as callsReader } from "../../../readers/calls";
import { UUID, defineActions, noteRow, readAction, str, unlessNotFound, type ToolContext } from "../context";

function dayKey(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return null;
  }
}

async function listCalls(t: ToolContext, input: { filter: string }): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  // The business's zone, as the turn read it (the route's facts): not read again.
  const { timezone } = t;
  // The hundred newest, as the Calls page reads them (readers/calls.ts), once in the turn.
  const calls = (await load(t.rc, callsReader, {})).data.calls;
  const todayKey = dayKey(t.now.toISOString(), timezone);
  const vms = calls.map((c) => toCallVM(c, timezone, t.now));
  const abandoned = new Set(calls.filter(abandonedCall).map((c) => c.id));
  const picked = vms
    .filter((v, i) => {
      const c = calls[i];
      switch (filter) {
        case "missed":
          return v.outcome === "missed" && dayKey(c.started_at, timezone) === todayKey;
        case "abandoned":
          return abandoned.has(c.id) && dayKey(c.started_at, timezone) === todayKey;
        case "today":
          return dayKey(c.started_at, timezone) === todayKey;
        case "live":
          return v.outcome === "live";
        default:
          return true;
      }
    })
    .slice(0, ASK_CAPS.calls);
  for (const v of picked) noteRow(t, "call", v.callId, v.who, `conversations/cv-${v.callId}`);
  return {
    filter,
    calls: picked.map((v) => ({
      call_id: v.callId,
      route: `conversations/cv-${v.callId}`,
      who: v.who,
      at: v.at,
      duration: v.duration ?? null,
      outcome: v.outcome,
      ...(abandoned.has(v.callId) ? { abandoned: true } : {}),
      summary: v.summary.headline,
      conversation_id: v.threadId ? v.threadId.replace(/^th-/, "") : null,
      contact_id: v.clientId,
    })),
  };
}

async function getCall(t: ToolContext, input: { call_id: string }): Promise<unknown> {
  const id = str(input.call_id);
  if (!UUID.test(id)) return { error: "call_id must be an id a tool returned" };
  // The call as the Calls page maps it, under this workspace's own filter (readers/call.ts), once a turn; a call not
  // here is the reader's 404.
  const r = await unlessNotFound(load(t.rc, call, { id }));
  if (!r) return { error: "no such call in this workspace" };
  const v = toCallVM(r.data.call, t.timezone, t.now);
  // The call and its person, as the reader gave them.
  noteRows(t.read, r.rows);
  return {
    call_id: id,
    route: `conversations/cv-${id}`,
    who: v.who,
    at: v.at,
    duration: v.duration ?? null,
    outcome: v.outcome,
    summary: v.summary,
    recording: v.recordingState,
    contact_id: v.clientId,
    transcript: v.transcript
      .slice(0, ASK_CAPS.transcript)
      .map((x) => `${x.speaker === "client" ? "caller" : x.speaker}: ${x.text}`),
    transcript_turns: v.transcript.length,
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
