/**
 * Slice 1: the Conversations surface flips to real data (moved from legacy-bridge/surfaces/conversations.ts, decision
 * 0015). Fetch → map through the contracts viewmodel → publish the surface's value → dispatch its refresh event.
 * Siblings keep their seeds. Realtime message inserts re-run this apply (debounced in the bridge).
 *
 * Also the tab strip Conversations draws, one tab per wire. Part of the SurfaceData seam (legacy-bridge/surface-data.ts);
 * the page reads what it publishes through `useSurface("conversations")`.
 */
import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { deliveryTicksOnly, isLiveCallTurn, LEFT_THE_QUEUE } from "@/legacy-bridge/surface-realtime";
import type { Output } from "@/client/api";
import { declareReads } from "@/legacy-bridge/surface-registry";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import { toConversationVM, toCallVM, type CallDto, type ConversationDto } from "@chanlytics/contracts";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";
import { namedByRoute } from "./address";
import { cvCallsStandAsTheirThread } from "./cv-rules";
import type { ConversationRow } from "./types";

// The pages that have not moved (a person's profile, Ask) still read this under its old name.
declareSurfaceValue("conversations", "CONVERSATIONS_DATA");

/**
 * The written wires a conversation can be on, in the words the page already
 * uses for them (contracts THREAD_CHANNEL_WORDS), in a fixed order.
 */
const WRITTEN_TABS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "Text" },
  { id: "email", label: "Email" },
] as const;

/**
 * The tab strip Conversations draws: All, the calls when there are any, and
 * ONE TAB PER WIRE this workspace actually has threads on.
 *
 * It was a single tab labelled "WhatsApp" matching WhatsApp, SMS and Instagram
 * alike, so a text already sat under a tab naming the wrong app -- and email
 * matched no tab at all (the page filtered on the mockup's "mail" while the
 * view model says "email"), so an email conversation was reachable only under
 * All. A workspace with nothing but WhatsApp sees exactly the strip it saw.
 *
 * The order is fixed rather than first-seen, so the strip does not rearrange
 * itself between two reads of the same workspace.
 */
export function conversationTabs(
  hasCalls: boolean,
  channels: ReadonlyArray<string>,
): Array<{ id: string; label: string }> {
  const present = new Set(channels);
  return [
    { id: "all", label: "All" },
    ...(hasCalls ? [{ id: "phone", label: "Calls" }] : []),
    ...WRITTEN_TABS.filter((t) => present.has(t.id)).map((t) => ({ id: t.id, label: t.label })),
  ];
}

/** The open holds and the calls as the last read answered them: what a read the receipts alone asked for keeps (S10-2). */
let lastBeside: { holds: Output<"GET escalations">; calls: Output<"GET calls"> | Error } | null = null;

export const conversationsOverride: SurfaceOverride = {
  key: "conversations",
  value: "conversations",
  events: ["surface:conversations"],
  refreshOnMessageInserts: true,
  // The rows' last words carry the same ticks as the thread (00327): see the Inbox's.
  refreshOnMessageStatuses: LEFT_THE_QUEUE,
  // And the person each row names (0047): a teammate's rename, their number or address, a yes or a stop, a merge. A few a day,
  // so heard on every page, as the messages are. And the calls its Calls tab draws: a call with no number, which no message or
  // thread tells, and a recording that finishes after the call's note (the wiring's second audit, X3-2). A call starting,
  // ending or filed again is heard; a transcript turn of one in progress is Live's, and moves no row here.
  ...declareReads("conversations", {
    reads: ["conversation", "hold", "person", "call"],
    fresh: "live",
    when: (c) => !isLiveCallTurn(c),
  }),
  apply: async (heard) => {
    // The open escalations too: a row's standing is the Inbox's rule over the thread AND its escalation
    // (contracts standingOf), and without the second this surface read an escalated thread as quiet. The Inbox
    // override reads the same two doors in the same tick, so the client's read-sharing window answers both once.
    // A delivery's receipts move the rows' ticks alone: the holds and the calls are the last read's (S10-2), where it read them.
    const kept = deliveryTicksOnly(heard) && lastBeside && !(lastBeside.calls instanceof Error) ? lastBeside : null;
    const [data, escData, callsRes, tz] = await Promise.all([
      read("GET conversations"),
      kept?.holds ?? read("GET escalations", { query: { state: "open" } }),
      kept?.calls ?? read("GET calls").catch((e: unknown) => e as Error),
      workspaceZone(),
    ]);
    lastBeside = { holds: escData, calls: callsRes };
    const openByConv = new Map(escData.escalations.map((e) => [e.conversation_id, e]));
    // The chat or the call the address names, when it is older than the hundred each read holds (a bell row from last week,
    // an Activity line, a person's page, an Ask citation): read by its id, never looked for in the window (finding A2c).
    // The workspace scopes both reads, so another's id answers nothing and the page still says it is not here.
    const named =
      typeof window !== "undefined" && window.location ? namedByRoute(routeOnScreen()) : { chat: null, call: null };
    const chatId = named.chat && !data.conversations.some((c) => c.id === named.chat) ? named.chat : null;
    const callId =
      named.call && !(callsRes instanceof Error) && !callsRes.calls.some((c) => c.id === named.call)
        ? named.call
        : null;
    const [chatExtra, callExtra] = await Promise.all([
      chatId
        ? read("GET conversations", { query: { ids: chatId } }).then(
            (d): ConversationDto[] => d.conversations,
            (): ConversationDto[] => [],
          )
        : Promise.resolve<ConversationDto[]>([]),
      callId
        ? read("GET calls", { query: { ids: callId } }).then(
            (d): CallDto[] => d.calls,
            (): CallDto[] => [],
          )
        : Promise.resolve<CallDto[]>([]),
    ]);
    // Each call is read as a row, and the page folds a person's rows into one (cv-rules.ts cvOnePerPerson): the call
    // opens in their thread, which holds every call, transcript and recording. A call stands as its thread does.
    const allThreads = [...data.conversations, ...chatExtra].map((c) =>
      toConversationVM(c, openByConv.get(c.id) ?? null, tz),
    );
    let callRows: ConversationRow[] = [];
    try {
      if (callsRes instanceof Error) throw callsRes;
      callRows = cvCallsStandAsTheirThread(
        [...callsRes.calls, ...callExtra].map((c) => toCallVM(c, tz)),
        allThreads,
      );
    } catch (e) {
      console.error("calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    // A customer who has only ever phoned is fully represented by their call
    // rows; a chat row for them would preview a call that is already on screen.
    const threads = allThreads.filter((t) => t.hasChat);
    // Newest first by REAL timestamp. The previous sort localeCompare'd the
    // display strings ("Aug 26" vs "3:22 AM"), which is not an ordering at all
    // — a message sent this morning listed below yesterday's calls.
    const merged: ConversationRow[] = [...threads, ...callRows].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    setSurfaceValue("conversations", {
      CONVERSATIONS: merged,
      // A calls read that failed is its own state: the page says so instead
      // of listing no calls (the audit's D9 family).
      CALLS_READ: !(callsRes instanceof Error),
      CV_CHANNELS: conversationTabs(
        callRows.length > 0,
        threads.map((t) => t.channel),
      ),
    });
  },
};
