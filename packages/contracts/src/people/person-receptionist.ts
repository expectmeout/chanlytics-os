/**
 * The receptionist for one person: the mode an owner may set for them (answer, ask first or never, else the
 * workspace's), in every word the product says it, and the line a People row says about what the receptionist is
 * doing for them. The row reads the line (person-row.ts); the page's mode control reads the words (person-cards.ts).
 */
import { HELD_WORDS } from "../conversations/standing";
import { shortTime } from "../conversations/thread-clock";
import { ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { reasonShort } from "../conversations/escalations";
import { holderOf, type ThreadHolder } from "./person-state";

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

export type ReceptionistTone =
  "answering" | "escalated" | "queued" | "snoozed" | "paused" | "silent" | "yours" | "theirs";

export interface PersonReceptionist {
  tone: ReceptionistTone;
  label: string;
}

/**
 * The receptionist on a thread somebody has, by who has it (holderOf): the member looking's and a teammate's say what
 * the Inbox says of it (HELD_WORDS: its pill, and its pane's sentence), and one held by a person not named, which only a
 * page with no member looking meets, keeps this page's own words. `label` is the Receptionist fact's and the row's;
 * `title` and `detail` are the Right now card's.
 */
export const HELD_THREAD: Record<
  ThreadHolder,
  { tone: ReceptionistTone; label: string; title: string; detail: string }
> = {
  yours: {
    tone: "yours",
    label: HELD_WORDS.yours.pill,
    title: HELD_WORDS.yours.pill,
    detail: HELD_WORDS.yours.sentence,
  },
  theirs: {
    tone: "theirs",
    label: HELD_WORDS.theirs.pill,
    title: HELD_WORDS.theirs.pill,
    detail: HELD_WORDS.theirs.sentence,
  },
  someone: {
    tone: "paused",
    label: "Paused, a person owns the thread",
    title: "Paused, a person owns this thread",
    detail: "A person owns this thread; automatic replies resume when it is handed back.",
  },
};

/** `viewerId` is the member looking, or null for none (toPersonRowVM's): required, since who has a thread depends on it. */
export function receptionistOf(
  r: PersonRowDto,
  tz: string,
  nowMs: number,
  viewerId: string | null,
): PersonReceptionist {
  // A thread a person has is theirs, whatever flagged it — the Inbox says "You have it" or "A teammate has it" for the
  // same row, and the two must not disagree.
  const held = holderOf(r, nowMs, viewerId);
  if (held) return { tone: HELD_THREAD[held].tone, label: HELD_THREAD[held].label };
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
