import "server-only";
import { z } from "zod";
import { ASK_CAPS, abandonedCall, toCallVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { call } from "../../../readers/call";
import { calls as callsReader } from "../../../readers/calls";
import { UUID, defineRead, str, unlessNotFound, type ToolContext } from "../context";

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
  for (const v of picked) t.read.call.add(v.callId);
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
  t.read.call.add(id);
  if (v.clientId) t.read.person.add(v.clientId);
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

export const list_calls = defineRead({
  name: "list_calls",
  description:
    "Phone calls. filter: missed (today's missed calls), abandoned (today's inbound callers who reached the receptionist and hung up within seconds, so they got nothing), today, live (on the line now), recent (newest first).",
  input: z.object({ filter: z.enum(["missed", "abandoned", "today", "live", "recent"]) }),
  label: "Reading the calls",
  run: listCalls,
});

export const get_call = defineRead({
  name: "get_call",
  description:
    "One phone call: who, when, how it ended, the summary and the transcript (capped). Use the call id from list_calls or get_person.",
  input: z.object({ call_id: z.string() }),
  label: "Reading the call",
  run: getCall,
});
