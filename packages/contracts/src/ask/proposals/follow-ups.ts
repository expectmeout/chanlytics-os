/**
 * Ask's follow-ups (the operator, 15 Oct 2026, D3): Ask's own note to come back to something when it happens -- a lead
 * search finishing, replies arriving on a sequence or a cold email, or a day coming -- with what it will ask itself then
 * and the line the member reads. A follow-up never acts: when it is due, the member's Ask reads it (the `signals` read
 * says it first) and proposes cards, which they approve.
 *
 * Kept where a member's own small state is kept, their views in this workspace (memberships.views, PUT views/:page,
 * member_view_set 00113), under the page `ask`: one member's, never a teammate's, and nothing new to store. A view is a
 * small object (2,000 characters at most), so a member holds at most ASK_FOLLOW_UPS_MAX at once, each in a few words.
 */

/** The page a member's follow-ups are kept under in their views. */
export const ASK_VIEW_PAGE = "ask";
/** How many follow-ups a member holds at once: a view is a small object. */
export const ASK_FOLLOW_UPS_MAX = 3;
/** The line the member reads, in characters. */
export const FOLLOW_UP_SAID_MAX = 100;
/** What Ask asks itself when it is due, in characters. */
export const FOLLOW_UP_PROMPT_MAX = 200;

/** What wakes a follow-up: a lead search finishing, replies on a sequence or a cold email, or a day. */
export const FOLLOW_UP_WAKES = ["search_done", "replies", "date"] as const;
export type FollowUpWake = (typeof FOLLOW_UP_WAKES)[number];

export interface AskFollowUp {
  id: string;
  /** The line the member reads: what Ask will come back to. */
  said: string;
  /** What Ask asks itself when it is due, as if the member had asked it. */
  prompt: string;
  wake: FollowUpWake;
  /** The search, the sequence or the cold email it waits on; null for a day. */
  subject: string | null;
  /** The day it waits for (YYYY-MM-DD, by the business's calendar); null for an event. */
  on: string | null;
  /** When it was made (ISO): replies count from it. */
  made_at: string;
}

const isWake = (v: unknown): v is FollowUpWake =>
  typeof v === "string" && (FOLLOW_UP_WAKES as readonly string[]).includes(v);
const clipped = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** One follow-up as a view keeps it, or null where it is not one: a view is the member's, and read leniently. */
function followUpOf(v: unknown): AskFollowUp | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const id = clipped(r.id, 40);
  const said = clipped(r.said, FOLLOW_UP_SAID_MAX);
  const prompt = clipped(r.prompt, FOLLOW_UP_PROMPT_MAX);
  if (!id || !said || !prompt || !isWake(r.wake)) return null;
  const subject = clipped(r.subject, 40) || null;
  const on = typeof r.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.on) ? r.on : null;
  if (r.wake === "date" ? !on : !subject) return null;
  return { id, said, prompt, wake: r.wake, subject, on, made_at: clipped(r.made_at, 40) };
}

/** A member's follow-ups, from their views (GET views' `views`), oldest first: none where the view holds none. */
export function followUpsOf(views: unknown): AskFollowUp[] {
  const ask = views && typeof views === "object" ? (views as Record<string, unknown>)[ASK_VIEW_PAGE] : null;
  const list = ask && typeof ask === "object" ? (ask as Record<string, unknown>).follow_ups : null;
  return Array.isArray(list) ? list.map(followUpOf).filter((f): f is AskFollowUp => f !== null) : [];
}

/** What the world says of a follow-up's wake: a search's state, a subject's replies since it was made, today's date. */
export interface FollowUpWorld {
  /** A lead search's latest round state by its id (lead_rounds.state), where it was read. */
  searches: ReadonlyMap<string, string>;
  /** Replies waiting on a sequence or a cold email, by its id, where it was read. */
  replies: ReadonlyMap<string, number>;
  /** Today, YYYY-MM-DD by the business's calendar. */
  today: string;
}

/**
 * A search's round states (lead_rounds.state) a follow-up on it wakes at: the round ended, or it stopped to ask the owner
 * something, which Ask comes back to answer.
 */
const SEARCH_WAKES = new Set(["ended", "waiting_on_owner"]);

/** Whether a follow-up is due, by what the world says now; never due on what could not be read. */
export function followUpDue(f: AskFollowUp, w: FollowUpWorld): boolean {
  if (f.wake === "date") return !!f.on && f.on <= w.today;
  if (!f.subject) return false;
  if (f.wake === "search_done") {
    const state = w.searches.get(f.subject);
    return state !== undefined && SEARCH_WAKES.has(state);
  }
  return (w.replies.get(f.subject) ?? 0) > 0;
}

/**
 * How a member likes Ask's answers (the answer canvas, D, 16 Oct 2026: "a per-member 'how I like answers' note: length,
 * format habits, language ... visible and editable in Settings, so it's never hidden magic"): their own few sentences,
 * kept in their views under a page of its own, apart from `ask`, whose follow-ups a card writes whole. Ask reads it with
 * each of their questions; Settings › Profile shows it and edits it.
 */
export const ASK_STYLE_PAGE = "ask_style";
/** The note, in characters: a few sentences. */
export const ASK_STYLE_MAX = 300;

/** A member's note on how they like answers, from their views (GET views' `views`): "" where they keep none. */
export function answerStyleOf(views: unknown): string {
  const page = views && typeof views === "object" ? (views as Record<string, unknown>)[ASK_STYLE_PAGE] : null;
  const words = page && typeof page === "object" ? (page as Record<string, unknown>).words : null;
  return typeof words === "string" ? words.trim().slice(0, ASK_STYLE_MAX) : "";
}
