/**
 * Conversations' rules, said once and pure (moved from pages/conversations.jsx, decision 0015, step 3): which tab a row is
 * in, the glyph of each wire, and the two spellings of the address (`conversations/<tab>:<row>`). The page reads them, and
 * so do the frame's crumbs and Ask (which took `CV_ROUTE` and `CV_IN_CHANNEL` off the window: the app publishes those two
 * names from here). No React, so it stays light for whoever imports it. And the one row a person has in the list.
 */
import type { SeenReading } from "@chanlytics/contracts";
import type { ConversationRow, Picked } from "./types";

// Keyed on what the view model says (writtenChannelOf): "email", not "mail".
// The map carried "mail" while nothing ever sent it, so the day a real email
// conversation arrived it would have fallen through to the default glyph.
export const CV_ICON: Record<string, string> = {
  phone: "phone",
  sms: "chat",
  whatsapp: "chat",
  instagram: "instagram",
  email: "mail",
};

// ONE rule for "is this row in that tab", read by the filter AND the counts, so
// a tab can never show a number it does not then list. `chats` is the mockup's
// grouped tab; a real workspace gets one tab per wire (legacy-bridge
// surface-data.ts). "mail" is the seed's spelling of what the view model calls
// "email" — the filter carried only the seed's, so the Email tab was empty on
// the mockup and matched nothing at all on a real workspace.
const CV_TAB_KEYS: Record<string, string[]> = {
  chats: ["instagram", "sms", "whatsapp"],
  email: ["email", "mail"],
  mail: ["email", "mail"],
};

/** Whether a row is in a tab: `all` holds every row, a grouped tab its wires, any other tab its own wire. */
export const inChannel = (c: { channel: string }, id: string): boolean =>
  id === "all" || (CV_TAB_KEYS[id] || [id]).includes(c.channel);

// ONE rule for the word after "conversations/", which the shell asks: a tab either kind of workspace draws -- a wire a
// row can be on, in the view model's words (CV_ICON's keys; a real workspace draws one tab per wire, surface-data.ts
// conversationTabs), or one of the mockup's grouped tabs -- or a row's id, a conversation's or a call's (cv-) -- or
// both, `<tab>:<id>`: the tab in view and the row open on it, which is what the page writes as a row opens (cvAddress),
// so a refresh opens the same row on the same tab. Replaced on a desktop, where Back leaves the page; pushed on a
// phone, where the row is the screen and Back closes it to its list (ConversationsPage openRow).
// The shell knew only the mockup's three tabs, so on a real workspace WhatsApp and Email were read as the ids of
// conversations nobody could find: the list stayed on All, and the pane said the conversation wasn't shown. And the
// address held a tab OR a row, so the row a person had open was nobody's after a refresh.
const cvOwn = (map: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key);
const cvIsTab = (word: string): boolean => word === "all" || cvOwn(CV_ICON, word) || cvOwn(CV_TAB_KEYS, word);

/** What the word after "conversations/" names: the tab in view and the row open on it. */
export const cvRoute = (word: string | null | undefined): { channel: string; id: string | null } => {
  if (!word || word === "all") return { channel: "all", id: null };
  const at = word.indexOf(":");
  if (at < 0) return cvIsTab(word) ? { channel: word, id: null } : { channel: "all", id: word };
  const tab = word.slice(0, at);
  const id = word.slice(at + 1) || null;
  return cvIsTab(tab) ? { channel: tab, id } : { channel: "all", id: word };
};

// The one spelling of the other direction: a tab alone, a row alone (on All), or a row on its tab.
export const cvAddress = (channel: string | null | undefined, id: string | null | undefined): string => {
  const tab = !channel || channel === "all" ? null : channel;
  if (!tab) return id ? `conversations/${id}` : "conversations";
  return id ? `conversations/${tab}:${id}` : `conversations/${tab}`;
};

/* ------------------------------ one row per person ------------------------------ */

/**
 * Each call stands as its thread does (contracts standingOf, the Inbox's word). A person who has only ever phoned has
 * no chat row (the surface leaves out a thread with nothing written), so without it their row could never say what
 * the Inbox says of them: a call-back flagged at noon read "Hung up early" under the call at one. And it is new to the
 * reader as its thread is (contracts isUnseen): the reader's mark is on the person, whichever row of theirs is drawn.
 */
export function cvCallsStandAsTheirThread(
  calls: ReadonlyArray<ConversationRow>,
  threads: ReadonlyArray<ConversationRow>,
): ConversationRow[] {
  const byThread = new Map<string, ConversationRow>();
  for (const t of threads) if (t.threadId) byThread.set(t.threadId, t);
  return calls.map((c) => {
    const t = c.threadId ? byThread.get(c.threadId) : undefined;
    if (!t) return c;
    return {
      ...c,
      ...(t.standing ? { standing: t.standing } : {}),
      ...(t.holderId !== undefined ? { holderId: t.holderId } : {}),
      ...(t.unseen !== undefined ? { unseen: t.unseen } : {}),
      ...(t.heardAtMs !== undefined ? { heardAtMs: t.heardAtMs } : {}),
      ...(t.markAtMs !== undefined ? { markAtMs: t.markAtMs } : {}),
    };
  });
}

// Whose a row is: the person, else their thread, else the row alone (a caller who withheld their number is nobody's).
// A person's row keeps this name from one read to the next, where its id is its newest part's: a pick is held by it.
export const cvWhose = (c: ConversationRow): string =>
  c.clientId ? `p:${c.clientId}` : c.threadId ? `t:${c.threadId}` : `r:${c.id}`;

/**
 * One row per person. Each call stood as a row of its own beside their thread, so a person who rang five times was
 * five rows of their name down the list, where the thread they open holds every call, transcript and recording in
 * one. The rows come newest first, as the surface sorts them, and a person's row is their newest: its time, its
 * words, its wire and where it opens, with every row it stands for under `parts`. Run on the rows a tab and a
 * search kept, so the Calls tab leads with a person's last call and a search with what matched.
 */
export function cvOnePerPerson(rows: ReadonlyArray<ConversationRow>): ConversationRow[] {
  const byWho = new Map<string, ConversationRow[]>();
  for (const c of rows) {
    const k = cvWhose(c);
    const mine = byWho.get(k);
    if (mine) mine.push(c);
    else byWho.set(k, [c]);
  }
  return [...byWho.values()].map((parts) => {
    const [newest] = parts as [ConversationRow, ...ConversationRow[]];
    return parts.length === 1 ? newest : { ...newest, parts };
  });
}

/** What a person's row stands for: itself alone, or its parts. */
const cvPartsOf = (c: ConversationRow): ConversationRow[] => c.parts ?? [c];

/**
 * The part whose standing the row's pill says: a call going on now, else a thread somebody has or needs to (the
 * Inbox's word, which a call after it does not take back: "Hung up early" over a thread that needs you hid the
 * ask), else the newest.
 */
export const cvLeadOf = (c: ConversationRow): ConversationRow =>
  c.live ? c : (cvPartsOf(c).find((p) => p.standing && p.standing !== "quiet") ?? c);

/**
 * Whose a row is, for the reader's marks (surfaces/seen.ts): the person, and the conversation their thread is. A
 * caller who withheld their number is nobody, and their row is never called new.
 */
export const cvWhoseRow = (c: ConversationRow): { personId: string | null; conversationId: string | null } => ({
  personId: c.clientId,
  conversationId: c.threadId && c.threadId.startsWith("th-") ? c.threadId.slice(3) : null,
});

/**
 * Whether the person a row stands for asked to stop (contracts isOptedOutContact, as each row's view model carries it):
 * the mark beside the name says it. It is the person's, so any row it stands for may say so, a call's as well as the thread's.
 */
export const cvStopped = (c: ConversationRow): boolean => cvPartsOf(c).some((p) => !!p.stopped);

/**
 * What the last read said of a person's row (contracts SeenReading): new to the reader when any row it stands for is, when
 * they were last heard from, and the stamp of the reader's mark, each the latest among the rows it stands for.
 */
export const cvSeenOf = (c: ConversationRow): SeenReading => ({
  unseen: cvPartsOf(c).some((p) => !!p.unseen),
  heardAtMs: Math.max(0, ...cvPartsOf(c).map((p) => p.heardAtMs ?? 0)),
  markAtMs: Math.max(0, ...cvPartsOf(c).map((p) => p.markAtMs ?? 0)),
});

/**
 * A person's row as a pick reads it (pages/pick.tsx): the thread Snooze and Archive act on, the person the reader's
 * mark is on, and how it stands. Null for a row with neither behind it (a caller who withheld their number, a call
 * still going that no thread holds): nothing a pick does applies, so it wears no box. The page says whether it is new
 * to the reader now and whether its thread is archived, which the row itself does not hold.
 */
export function cvPicked(
  c: ConversationRow,
  said: { unread: boolean; archived: (conversationId: string) => boolean },
): Picked | null {
  const conversationId =
    cvPartsOf(c)
      .map((p) => cvWhoseRow(p).conversationId)
      .find((id) => !!id) ?? null;
  if (!c.clientId && !conversationId) return null;
  return {
    id: cvWhose(c),
    who: c.who,
    conversationId,
    personId: c.clientId,
    unread: said.unread,
    reading: cvSeenOf(c),
    snoozed: cvLeadOf(c).standing === "snoozed",
    archived: !!conversationId && said.archived(conversationId),
  };
}

/** The row of `rows` that holds `id`, and the part it names: a link to one call opens its person's row at that call. */
export function cvFind(
  rows: ReadonlyArray<ConversationRow>,
  id: string | null | undefined,
): { row: ConversationRow; part: ConversationRow } | null {
  if (!id) return null;
  for (const row of rows) {
    const part = cvPartsOf(row).find((p) => p.id === id);
    if (part) return { row, part };
  }
  return null;
}

/**
 * How many calls a person's row holds, said where the row does not already: "5 calls", or a thread's "1 call". Counted
 * from what the page read, the workspace's newest hundred calls (readers/calls.ts); the thread holds every one.
 */
export function cvCallsWords(c: ConversationRow): string | null {
  const calls = cvPartsOf(c).filter((p) => p.callId || p.channel === "phone").length;
  if (calls >= 2) return `${calls} calls`;
  return calls === 1 && c.parts && !(c.callId || c.channel === "phone") ? "1 call" : null;
}
