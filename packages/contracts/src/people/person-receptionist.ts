/**
 * The receptionist for one person: the mode an owner may set for them (answer, ask first or never, else the
 * workspace's), in every word the product says it, and the line a People row says about what the receptionist is
 * doing for them. The row reads the line (person-row.ts); the page's mode control reads the words (person-cards.ts).
 */
import { shortTime } from "../conversations/thread-clock";
import { ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { reasonShort } from "./person-row-facts";
import { isOwned } from "./person-state";

/** What an owner may set for one person: answer, ask first, or stay out. */
export type PersonMode = "auto" | "ask" | "never";
export const PERSON_MODES: readonly PersonMode[] = ["auto", "ask", "never"];
export const PERSON_MODE_LABELS: Record<PersonMode, string> = { auto: "Answer", ask: "Ask me first", never: "Never" };
/**
 * Every word for the receptionist's mode for one person, following the workspace included. The profile,
 * the bulk menu, a pill and an Ask receipt all say these: the mode was worded four ways on one journey
 * (Answer and Answer them, Never and Stay out, "Use the workspace setting" and "Follow the workspace").
 */
export const PERSON_MODE_WORDS: Record<PersonMode | "inherit", string> = {
  ...PERSON_MODE_LABELS,
  inherit: "Follow the workspace",
};

export function asPersonMode(s: string | null | undefined): PersonMode | null {
  return s && (PERSON_MODES as readonly string[]).includes(s) ? (s as PersonMode) : null;
}

export type ReceptionistTone = "answering" | "escalated" | "queued" | "snoozed" | "paused" | "silent";

export interface PersonReceptionist {
  tone: ReceptionistTone;
  label: string;
}

export function receptionistOf(r: PersonRowDto, tz: string, nowMs: number): PersonReceptionist {
  // A thread a person owns is theirs, whatever flagged it — the Inbox says
  // "you have it" for the same row, and the two must not disagree.
  if (isOwned(r, nowMs)) return { tone: "paused", label: "Paused, a person owns the thread" };
  if (r.open_escalation_reason)
    return { tone: "escalated", label: `Escalated, ${reasonShort(r.open_escalation_reason)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  const snooze = ts(r.latest_snooze_until);
  if (r.latest_state === "snoozed" && snooze !== null && snooze > nowMs) {
    return { tone: "snoozed", label: `Snoozed until ${shortTime(r.latest_snooze_until, tz, new Date(nowMs))}` };
  }
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: "Silent, they opted out" };
  // "Answering" was shown for a person the owner had set to Never.
  if (r.effective_reply_mode === "never")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.never}` };
  if (r.effective_reply_mode === "ask")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.ask}` };
  return { tone: "answering", label: "Answering" };
}
