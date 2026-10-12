/**
 * The receptionist for one person: the mode an owner may set for them (answer, ask first or never, else the
 * workspace's), in every word the product says it, and the line a People row says about what the receptionist is
 * doing for them. The row reads the line (person-row.ts); the page's mode control reads the words (person-cards.ts).
 */
import { STOP_WORDS } from "../consent/consent";
import { HELD_WORDS, heldPill } from "../conversations/standing";
import { shortTime } from "../conversations/thread-clock";
import { ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { reasonLabelOf, reasonShort, waitsOnAPerson } from "../conversations/escalations";
import { holderOf, personStanding, type ThreadHolder } from "./person-state";

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
  /** On a snoozed thread: when it wakes, in the page's clock ("Tue 10:00 AM"), where the row says; absent on every other tone. */
  wakes?: string;
}

/**
 * A teammate's name by their user id, from the roster the page reads (the Inbox's ixAnswerer reads the same one): null where
 * the roster is unread or they have left the team, and then the words say "A teammate", never a name made up (heldPill).
 */
export type HolderNames = (userId: string) => string | null | undefined;

/**
 * The receptionist on a thread somebody has, by who has it (holderOf): the member looking's and a teammate's say what
 * the Inbox says of it (HELD_WORDS: its pill, and its pane's sentence), and one held by a person not named, which only a
 * page with no member looking meets, keeps this page's own words. `label` is the Receptionist fact's and the row's;
 * `title` and `detail` are the Right now card's.
 */
const HELD_THREAD: Record<ThreadHolder, { tone: ReceptionistTone; label: string; title: string; detail: string }> = {
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

/**
 * HELD_THREAD with the teammate's name where the roster says it, as the Inbox's row and bar do (heldPill): "Ruben has it"
 * beside "A teammate has it" was one thread worded two ways on two pages (D1-hold-words). A name is only ever the roster's;
 * with none the unnamed words stand, and the member looking has no name to give (it is "You have it").
 */
export function heldThreadOf(
  holder: ThreadHolder,
  name: string | null | undefined,
): { tone: ReceptionistTone; label: string; title: string; detail: string } {
  const held = HELD_THREAD[holder];
  const who = name?.trim();
  if (holder !== "theirs" || !who) return held;
  const said = heldPill("theirs", who);
  return {
    ...held,
    label: said,
    title: said,
    detail: `${who} is answering this. The receptionist stays quiet until they hand it back.`,
  };
}

/** A person who asked to stop, in the receptionist's words (STOP_WORDS says the stop): the row's fact and the Right now card. */
export const SILENT_STOP = {
  label: `Silent, ${STOP_WORDS.pill.toLowerCase()}`,
  detail: `${STOP_WORDS.said("They")} — nothing goes out to them until they ask again.`,
} as const;

/**
 * The reason of the open hold when it waits on a person, else null. A customer's STOP opened a hold before decision 0048
 * and those are still open: they are news told once, not an ask (escalations.ts waitsOnAPerson), so the person reads as
 * silent (SILENT_STOP), never as escalated.
 */
export function askedFor(r: Pick<PersonRowDto, "open_escalation_reason">): string | null {
  return r.open_escalation_reason && waitsOnAPerson(r.open_escalation_reason) ? r.open_escalation_reason : null;
}

/**
 * What a snoozed thread still asks for: the reason that flagged it, in the Inbox's label for it (a snooze leaves the request
 * open, standing.ts), or null when nothing flagged it. The Inbox says it under the pill (snoozedThreadWords); People and the
 * person's page say it the same way.
 */
export function snoozedAsk(r: Pick<PersonRowDto, "open_escalation_reason" | "needs_human">): string | null {
  const asked = askedFor(r);
  if (asked) return reasonLabelOf(asked);
  return r.needs_human ? "Waiting for a person" : null;
}

/**
 * A snoozed thread, as the Inbox files it: Snoozed, with when it wakes and that it still asks for a person. A snooze wins over
 * an open escalation and over a pause (standingOf: "that ordering is the whole point"), so this is tested before the
 * escalation is, as the Inbox tests it; People said "escalated" and the person's page said "Needs you" over a thread the
 * Inbox had put aside (D1-snoozed-hold).
 */
function snoozedReceptionist(r: PersonRowDto, tz: string, nowMs: number): PersonReceptionist {
  const wake = ts(r.latest_snooze_until);
  const wakes = wake !== null && wake > nowMs ? shortTime(r.latest_snooze_until, tz, new Date(nowMs)) : null;
  // What the snooze left open, said after a middle dot so a fact that splits its label at the first comma keeps the wake time.
  const asked = askedFor(r);
  const asks = asked ? `still waiting for you (${reasonShort(asked)})` : r.needs_human ? "still waiting for you" : null;
  return {
    tone: "snoozed",
    label: [`Snoozed${wakes ? ` until ${wakes}` : ""}`, asks].filter(Boolean).join(" · "),
    ...(wakes ? { wakes } : {}),
  };
}

/**
 * `viewerId` is the member looking, or null for none (toPersonRowVM's): required, since who has a thread depends on it.
 * `names` is the roster, where the page has read it, so a teammate's thread says whose it is (heldThreadOf).
 */
export function receptionistOf(
  r: PersonRowDto,
  tz: string,
  nowMs: number,
  viewerId: string | null,
  names: HolderNames | null = null,
): PersonReceptionist {
  // One verdict, read once (standing.ts): a snooze puts the thread aside whatever else is open on it. A reply counting down
  // to send is still the thing to say (the receptionist keeps answering a snoozed thread, and People counts it as Needs you).
  if (personStanding(r, nowMs, viewerId).standing === "snoozed")
    return r.queued_reply_at ? { tone: "queued", label: "Reply queued" } : snoozedReceptionist(r, tz, nowMs);
  // A thread a person has is theirs, whatever flagged it — the Inbox says "You have it" or "Ruben has it" for the
  // same row, and the two must not disagree.
  const held = holderOf(r, nowMs, viewerId);
  if (held) {
    const holder = held === "theirs" && r.latest_assignee_user_id ? names?.(r.latest_assignee_user_id) : null;
    const { tone, label } = heldThreadOf(held, holder);
    return { tone, label };
  }
  const asked = askedFor(r);
  if (asked) return { tone: "escalated", label: `Escalated, ${reasonShort(asked)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: SILENT_STOP.label };
  // "Answering" was shown for a person the owner had set to Never.
  if (r.effective_reply_mode === "never")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.never}` };
  if (r.effective_reply_mode === "ask")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.ask}` };
  return { tone: "answering", label: "Answering" };
}
