/**
 * What the Inbox's read leaves out, read apart. The threads of open holds past the newest hundred, read by their ids in
 * one read (contracts heldThreadIds: the holds that wait on a person first): the Inbox reads them and Today reads them,
 * the same ids in the same order, so the client's read-sharing makes the two one read, and both judge every hold by its
 * own thread (the wiring's second audit, S7-7). And a thread opened, read whole (lane B of the mailbox analysis, 30 Oct
 * 2026): the Inbox's read carries each thread's newest LIST_MESSAGES_EACH messages, which is all its row says; a thread
 * that has more is `partial`, and opened it is read on its own (GET conversations/:id, its newest hundred), once, and
 * kept for the tab. Every read of the Inbox after lays its newest over what was kept, so a message that arrives, a tick
 * or a failure is drawn as it always was. The pane draws a partial thread's conversation when its own read lands, whole:
 * drawn from its newest and grown from above, what it had drawn would move (a thread grows only at its end, earlier.ts),
 * and on a phone nothing anchors it.
 */
import { read } from "@/legacy-bridge/api";
import {
  HELD_BY_ID_MAX,
  inReadingOrder,
  LIST_MESSAGES_EACH,
  toInboxThreadVM,
  type ConversationDto,
  type EscalationDto,
  type InboxThreadVM,
  type MessageDto,
} from "@chanlytics/contracts";
import { setSurfaceValue, surfaceValue } from "../surface-values";
import type { Thread } from "./types";

/** The held threads past the Inbox's hundred, by their ids. Null where the read failed: each hold it asked for then counts as waiting (unknown is not handled). */
export async function readHeldThreads(ids: readonly string[]): Promise<ConversationDto[] | null> {
  if (!ids.length) return [];
  return read("GET conversations", { query: { ids: ids.slice(0, HELD_BY_ID_MAX).join(",") } }).then(
    (d): ConversationDto[] => d.conversations,
    () => null,
  );
}

/** How many threads are kept whole, the last opened last: one opened before them is read again when it is opened. */
const WHOLE_KEPT = 20;

/** A thread as the Inbox draws it: contracts' view model, and whether its conversation waits for its own read. */
type InboxThread = InboxThreadVM & { partial?: true };

/** Each thread read whole: its own read's messages in reading order; what the Inbox's read held, where that read failed. */
const keptWhole = new Map<string, MessageDto[]>();
/** The reads out now, by thread. */
const wholeReads = new Map<string, Promise<void>>();
/** The threads read again since the Inbox's newest stopped meeting what was kept: once, until a read lands. */
const readAgain = new Set<string>();
/** What the Inbox's last read made each thread of, and in which zone: a thread read whole is made again from it. */
let lastRead: { of: Map<string, { dto: ConversationDto; escalation: EscalationDto | null }>; tz: string } | null = null;

/** What was kept of a thread, with the Inbox's newest laid over it: a message both hold is the newest read's. */
function laidOver(kept: readonly MessageDto[], newest: readonly MessageDto[]): MessageDto[] {
  const byId = new Map(kept.map((m) => [m.id, m]));
  for (const m of newest) byId.set(m.id, m);
  return [...byId.values()].sort(inReadingOrder);
}

/**
 * Whether the Inbox's newest no longer meet what was kept: as many as it carries, none of them kept. More arrived since
 * than the read carries, and what came between them is in neither.
 */
const newestMissKept = (kept: readonly MessageDto[], newest: readonly MessageDto[]): boolean =>
  kept.length > 0 && newest.length >= LIST_MESSAGES_EACH && !newest.some((m) => kept.some((k) => k.id === m.id));

function inboxThreadOf(dto: ConversationDto, escalation: EscalationDto | null, tz: string): InboxThread {
  const kept = keptWhole.get(dto.id);
  if (kept) {
    if (newestMissKept(kept, dto.messages) && !readAgain.has(dto.id)) {
      readAgain.add(dto.id);
      void readWhole(dto.id);
    }
    return toInboxThreadVM({ ...dto, messages: laidOver(kept, dto.messages) }, escalation, tz);
  }
  const vm = toInboxThreadVM(dto, escalation, tz);
  return dto.messages.length < LIST_MESSAGES_EACH ? vm : { ...vm, partial: true };
}

/**
 * The Inbox's threads, as its read is published (surface.ts): each from what the read carries, and one read whole from
 * what was kept of it as well. What each was made of is kept, so a thread whose own read lands later is made again alone.
 */
export function inboxThreadsOf(
  dtos: readonly ConversationDto[],
  escalationOf: (conversationId: string) => EscalationDto | null,
  tz: string,
): InboxThread[] {
  lastRead = { of: new Map(dtos.map((dto) => [dto.id, { dto, escalation: escalationOf(dto.id) }])), tz };
  return dtos.map((dto) => inboxThreadOf(dto, escalationOf(dto.id), tz));
}

/**
 * The thread made again from its own read, in place in what the Inbox published, and the pages told (surface:inbox).
 * Only its messages changed: the reader's mark the tab carried into its row (seen-carry.ts) is kept as it was.
 */
function republish(conversationId: string): void {
  const held = surfaceValue("inbox");
  const made = lastRead?.of.get(conversationId);
  if (!held || !made || !lastRead) return;
  const thread = inboxThreadOf(made.dto, made.escalation, lastRead.tz);
  setSurfaceValue("inbox", {
    ...held,
    THREADS: held.THREADS.map((t) =>
      t.real && t.conversationId === conversationId ? { ...thread, unread: t.unread, markAtMs: t.markAtMs } : t,
    ),
  });
  window.dispatchEvent(new CustomEvent("surface:inbox"));
}

/** Kept as the last opened: past WHOLE_KEPT, the one opened longest ago is let go. */
function keepWhole(conversationId: string, messages: MessageDto[]): void {
  keptWhole.delete(conversationId);
  keptWhole.set(conversationId, messages);
  for (const id of keptWhole.keys()) {
    if (keptWhole.size <= WHOLE_KEPT) break;
    keptWhole.delete(id);
  }
}

function readWhole(conversationId: string): Promise<void> {
  const asked = wholeReads.get(conversationId);
  if (asked) return asked;
  const landed = read("GET conversations/[id]", { params: { id: conversationId } })
    .then(
      (page) => {
        readAgain.delete(conversationId);
        keepWhole(conversationId, page.messages);
      },
      // Not read: the thread is drawn from what the Inbox's read holds of it, rather than waiting on nothing.
      () => keepWhole(conversationId, keptWhole.get(conversationId) ?? []),
    )
    .finally(() => {
      wholeReads.delete(conversationId);
      republish(conversationId);
    });
  wholeReads.set(conversationId, landed);
  return landed;
}

/**
 * A partial thread, opened (the pane, and the thread the Inbox's first draw opens on): read whole, and drawn again when it
 * lands. Settles when it is drawn, read or not; at once for a thread kept whole.
 */
export function readThreadWhole(conversationId: string): Promise<void> {
  return keptWhole.has(conversationId) ? Promise.resolve() : readWhole(conversationId);
}

/** A thread's messages in its drawn conversation: its words, and the team's notes between them. */
const messagesDrawn = (t: Thread): number =>
  t.timeline.filter((e) => e.type === "msg" || (e.type === "event" && e.kind === "note")).length;

/**
 * A thread the tab's cache paints (surface.ts revivesFromCache): partial again where it holds as many messages as the
 * Inbox's read carries, since nothing is kept whole across a load. Painted whole from a thread read before the refresh, it
 * would be drawn, then emptied by the first read, then drawn again.
 */
export function revivedThread(t: Thread): Thread {
  return t.real && !t.partial && !keptWhole.has(t.conversationId) && messagesDrawn(t) >= LIST_MESSAGES_EACH
    ? { ...t, partial: true as const }
    : t;
}
