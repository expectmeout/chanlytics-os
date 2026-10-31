/**
 * What starts a playbook, and the playbook's standing limits: the triggers, the states, the defaults and the hours a
 * run may send in. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import type { SchemaSet } from "../shared/schema-sets";
import { MIN_MS } from "../shared/time";
import { plural } from "../shared/words";
import { waitEndsWords } from "../waits/wait-rules";

/**
 * What starts a playbook. A list trigger sends to a list that keeps itself
 * current; the cadence trigger to everyone, on a rhythm; a visit trigger to
 * the people the calendar names for one day — the day before an appointment,
 * the day after a visit; a saved trigger to one of the workspace's own lists,
 * named on the playbook (list_id, 00155). The reminder runs under the Booking
 * row of the Autonomy pane: the setting that governs bookings governs their
 * reminders.
 */
export const PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  {
    id: "new_week",
    label: "Welcome",
    list: "new_week",
    cls: "campaign",
    kind: "list",
    hint: "First contact in the last 7 days",
  },
  {
    id: "phoned_only",
    label: "Save our number",
    list: "phoned_only",
    cls: "reengage",
    kind: "list",
    hint: "Only ever phoned, never texted",
  },
  {
    id: "everyone_monthly",
    label: "The month's offer",
    list: null,
    cls: "campaign",
    kind: "cadence",
    hint: "Everyone who said yes, on a cadence",
  },
  {
    id: "visit_tomorrow",
    label: "Appointment reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar",
  },
  // Under the Booking row since 2 Oct 2026, as the reminder is: its message asks how the appointment went and offers
  // nothing, so it reaches a yes to texts. The labels here are the default word's (contracts appointmentWords, D42); a
  // page and a new campaign's name say the workspace's own (triggerWords), and a name already stored keeps its words
  // until its owner renames it (D43). The id never changes.
  {
    id: "visited",
    label: "After the appointment",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day after an appointment, when nothing is booked next",
  },
  // People's Lapsed list, by visits rather than silence (00155). Since 2 Oct 2026 it IS the win-back where a calendar is
  // connected, and the quiet one is the win-back where none is: one moment, read the one way the workspace can
  // (momentOffered), so both are called Win-back and their hints say which.
  {
    id: "lapsed",
    label: "Win-back",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No appointment in 45 days, and nothing booked",
  },
  // Any list (decision 0009): one of People's (list_key, 00168) or one of the workspace's own (list_id, 00155), kept by
  // hand or by a rule; the card says which. The id stays: playbooks made before any list could be named keep running.
  {
    id: "saved_list",
    label: "On a list",
    list: null,
    cls: "campaign",
    kind: "saved",
    hint: "Everyone on a list: one of People's, or one you keep",
  },
  // A proposal out that has waited past the workspace's pace with nothing back (0006): one nudge per proposal, with
  // its link, under its own class, in every workspace. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back",
  },
  // A time a cancellation freed on the calendar (decision 0082): one batch per freed appointment, offered within the
  // hour to the people who asked and never booked. Under the follow-ups' row: it answers the person's own ask, so a text
  // may carry it and an email asks no yes (playbook-purpose.ts). Run by the event that freed it, never by the hour.
  {
    id: "slot_opened",
    label: "Fill a cancellation",
    list: "asked_never_booked",
    cls: "follow_up",
    kind: "freed",
    hint: "A time a cancellation freed, offered to the people who asked and never booked",
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email to a lead",
  },
  {
    id: "after_step",
    label: "After the step before",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "A nudge, days after the step before",
  },
] as const;

export type PlaybookTrigger = (typeof PLAYBOOK_TRIGGERS)[number]["id"];

/**
 * The moments: every trigger but a reach-out's two. What the Playbooks page counts, what Ask may propose and what the
 * moments' composer offers read this, so a reach-out's steps never reach them (Reach out, Part 3).
 */
export const MOMENT_TRIGGERS = PLAYBOOK_TRIGGERS.filter(
  (t): t is Exclude<(typeof PLAYBOOK_TRIGGERS)[number], { kind: "reach_out" }> => t.kind !== "reach_out",
);

export type PlaybookTriggerKind = (typeof PLAYBOOK_TRIGGERS)[number]["kind"];

export type PlaybookPolicyClass = SchemaSet<"sequence_steps.policy_class">;

export const PLAYBOOK_STATES = ["running", "paused"] as const;

export type PlaybookState = (typeof PLAYBOOK_STATES)[number];

/** Whether a value is one of a playbook's states: a row's, read as the database types it, or a change's, as asked. */
export function isPlaybookState(v: unknown): v is PlaybookState {
  return PLAYBOOK_STATES.some((s) => s === v);
}

export const PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 } as const;

/**
 * A freed time's own (decision 0082): one time is taken by one person, so four are written to, and nobody hears of
 * another freed time within a week (the limits' floor). What a new step on `slot_opened` starts with where none is asked.
 */
export const FREED_TIME_DEFAULTS = { capPerRun: 4, gapDays: 7 } as const;

export const PLAYBOOK_HOURS = { min: 9, max: 20 } as const;

/** The hour the day's sending hours end at (21): nextOpenMoment moves to the next day from it (sendingEndsAt). */
export const SENDING_HOURS_END = PLAYBOOK_HOURS.max + 1;

/**
 * The whole numbers a playbook keeps, each with its range and the words a refusal names it by: what a new playbook's
 * check (core checkPlaybook), a change's (core checkPlaybookPatch) and Ask's starter card read, so a bound is written once.
 */
export const PLAYBOOK_LIMITS = {
  run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
  cap_per_run: { min: 1, max: 500, what: "The cap" },
  gap_days: { min: 7, max: 365, what: "The gap" },
  cadence_days: { min: 1, max: 90, what: "The cadence" },
} as const;

/**
 * The caps the composer offers, a few sensible ones chosen in place (a campaign made before them keeps its own among
 * them): what GET playbooks counts one run's split at (playbook-run-split.ts), beside each campaign's own cap.
 */
export const PLAYBOOK_CAP_CHOICES: readonly number[] = [5, 10, 25, 50, 100, 250, 500];

/**
 * The hours a send may go out in, as the pages say them: "9:00–20:59", "between 9:00 and 20:59", the hour a moved send
 * waits for, and the hour they end at ("21:00"), when a visit's batch made for today can no longer go today
 * (sendingEndsAt).
 */
export const SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00–${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`,
  end: `${SENDING_HOURS_END}:00`,
} as const;

/**
 * Why a send moved past the night, in the clause every place that says the moment it moved to says beside it: the send
 * screen's notes (surfaces/campaigns/broadcasts/when.tsx) and Ask's broadcast card. Read from the hours it is handed (the
 * page's clock hands these), when it is said.
 */
export const sendsWaitWords = (hours: Pick<typeof SENDING_HOURS_WORDS, "range"> = SENDING_HOURS_WORDS): string =>
  `sends wait for ${hours.range}`;

/** A send that goes now, as every receipt says it: what whenItGoes answers when there is no later moment to name. */
export const SENDING_NOW_WORDS = "sending now";

/** What a send's or an approve's answer says of its time: when it goes, and where the server moved it, from when. */
export interface WhenItGoesReceipt {
  scheduled_for?: string | null;
  moved_from?: string | null;
  /** A message sent once, pressed for now: it goes SEND_ONCE_STOP_MS on, unless it is stopped (decision 0064, step 3). */
  pressed_now?: boolean | null;
}

/**
 * When a send or an approved run goes, from the server's answer, in the one sentence every receipt says it: Sent's toast,
 * Today's, a campaign's drawer and Ask's card (the wiring's second audit, S9-9 and S9-10: the page's bcWhenWords and Ask's
 * runGoes were two implementations). The server moves a send asked for outside the sending hours to the next open one
 * (`moved_from` set), and the receipt says so rather than "sending now" over a run that waits until morning. `when` words an
 * instant by the business's clock (the page's own, or the zone Ask's card carries); a moment within a minute is now.
 */
export function whenItGoes(
  receipt: WhenItGoesReceipt | null | undefined,
  when: (atMs: number) => string,
  nowMs: number,
): string {
  const at = receipt?.scheduled_for ? Date.parse(receipt.scheduled_for) : NaN;
  if (Number.isNaN(at)) return SENDING_NOW_WORDS;
  if (receipt?.moved_from)
    return `scheduled for ${when(at)} — messages go out ${SENDING_HOURS_WORDS.between} by your clock`;
  // Pressed for now, it goes in ten minutes unless stopped (decision 0064, step 3), as the wait rule says it.
  if (receipt?.pressed_now && at > nowMs) {
    const goes = waitEndsWords("one_off", when(at));
    return `${goes.charAt(0).toLowerCase()}${goes.slice(1)}`;
  }
  return at - nowMs > MIN_MS ? `scheduled for ${when(at)}` : SENDING_NOW_WORDS;
}

// One playbook message per person per week, across playbooks: declared with the playbooks' clock (playbook-time.ts), so
// a broadcast's breath (broadcasts/run-words.ts) reads it without this module's triggers.
export { PLAYBOOK_BREATH_MS } from "./playbook-time";

/** Under veto, a run is scheduled this far ahead with a Stop. */
export const PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;

/**
 * A message sent once and pressed for now goes this far ahead, with a Stop (decision 0064, step 3): long enough to catch a
 * typo on a phone, through the cancel every scheduled run has. Shorter than a batch's hold: the person just pressed Send.
 */
export const SEND_ONCE_STOP_MS = 10 * MIN_MS;

/** A wait a page promises, in whole minutes or hours as a sentence says it: "30 minutes", "an hour", "2 hours". */
export function delayWords(ms: number): string {
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 60 || minutes % 60) return plural(minutes, "minute");
  return minutes === 60 ? "an hour" : plural(minutes / 60, "hour");
}

/**
 * The veto window in those words. Every sentence that promises it (How it runs, the reach-out sheet, Ask's definitions
 * and cards) says this, so a change to the wait changes what each one says.
 */
export const PLAYBOOK_VETO_DELAY_WORDS = delayWords(PLAYBOOK_VETO_DELAY_MS);

/** The ten minutes a message sent once waits for a Stop, in a sentence's words: "10 minutes". */
export const SEND_ONCE_STOP_WORDS = delayWords(SEND_ONCE_STOP_MS);

/**
 * Whether a batch of this moment (`trigger`, its audience's) can be approved only while the day's sending hours last: a
 * visit's, whose words name the day ("tomorrow at 2:00 PM"), so that approved after them it would go a day late. THE
 * reading of it, for the approve verb's refusal (contracts runApprovalRefusal) and for the words of its wait
 * (batchWaitWords) and of its skip (skippedRunNotice), so a notice says 21:00 for exactly the batches refused then.
 */
export function approvalEndsWithSendingHours(trigger: string | null | undefined): boolean {
  return triggerOf(trigger ?? "")?.kind === "visit";
}

/**
 * How a customer's batch waiting for an OK ends, by its wait rule (contracts waitEndsWords): a visit's with the day's
 * sending hours, after which it reaches nobody (visit_ask), a freed time's with the time it offers (freed_ask, 0082: `at`
 * says the time where the caller has it), any other's with its day (batch_ask). The ready notice and Today's row
 * (contracts todayRunWords) both say it from here.
 */
export function batchWaitWords(trigger: string | null | undefined, at?: string | null): string {
  if (triggerOf(trigger ?? "")?.kind === "freed") return waitEndsWords("freed_ask", at);
  return approvalEndsWithSendingHours(trigger)
    ? waitEndsWords("visit_ask", SENDING_HOURS_WORDS.end)
    : waitEndsWords("batch_ask");
}

/**
 * What the owner is told when a customer's batch waits for their OK (decision 0064: its sequence asks, or its step's words
 * are new): who it reaches, and how the wait ends (batchWaitWords). Its title is the one Today's away card and the bell's
 * close find a waiting run by ("Campaign “X” is ready").
 */
export function readyRunNotice(
  name: string,
  people: number,
  trigger: string | null,
  /** The time a freed time's batch offers, in the business's words ("Tue 3:00 PM", 0082): its wait ends then. */
  at?: string | null,
): { subject: string; body: string } {
  return {
    subject: `Campaign “${name}” is ready: ${plural(people, "person", "people")}`,
    body: `${plural(people, "person has", "people have")} become eligible for “${name}”. Approve or skip it from your Inbox or Today. ${batchWaitWords(trigger, at)}.`,
  };
}

/**
 * What the owner is told when a batch held for a stop is made (its sequence's mode is veto): who it reaches, and that it
 * goes at its time unless stopped (contracts waitEndsWords, batch_hold). `when` is said with its day ("today 10:30 AM").
 */
export function vetoRunNotice(name: string, people: number, when: string): { subject: string; body: string } {
  const who = plural(people, "person", "people");
  return {
    subject: `Campaign “${name}” sends ${when}: ${who}`,
    body: `${who} will be sent “${name}”. ${waitEndsWords("batch_hold", when)}, from Today or its run.`,
  };
}

/**
 * Why a skipped batch's next one waits too, said for every mode, since the sweep's row knows neither the mode nor whether
 * its words are new: a skip leaves both as they were. One approval ends the wait of new words, and under Ask me every
 * batch waits (batchModeOf), so it says both.
 */
const NEXT_BATCH_WAITS =
  "its batches wait until you approve one, and every one waits while “Before each batch” in its How it runs says to ask";

/**
 * What the owner is told when the sweep skips a customer's batch that waited for an OK past its day (decision 0064):
 * it did not go, because nobody approved it, and its people are in line for the sequence's next batch (00453 puts them
 * back; a skipped run touched nobody). A visit's are not (approvalEndsWithSendingHours): the next day's batch names the
 * next day's, so it says it did not reach them, that they can be written to by hand from the run, which lists them, and
 * that the next day's waits until 21:00 too. Said on the bell and by mail, as its "is ready" was, so a skip is never silent.
 */
export function skippedRunNotice(
  name: string,
  people: number,
  trigger: string | null,
  /** The time a freed time's batch offered, in the business's words ("Tue 3:00 PM", 0082): its wait ended then. */
  at?: string | null,
): { subject: string; body: string } {
  const who = plural(people, "person", "people");
  const subject = `“${name}” didn’t go: nobody approved it`;
  if (at && triggerOf(trigger ?? "")?.kind === "freed")
    return {
      subject,
      body: `${who} waited for your OK until ${at} came, and nothing was sent: that time has passed. The next cancellation offers its own time, and waits for your OK too: ${NEXT_BATCH_WAITS}.`,
    };
  if (approvalEndsWithSendingHours(trigger))
    return {
      subject,
      body: `${who} waited for your OK until ${SENDING_HOURS_WORDS.end}, and it did not reach them: no later batch sends it in its place. Open it to see who, and write to them yourself. The next day’s “${name}” waits for your OK too, until ${SENDING_HOURS_WORDS.end}: ${NEXT_BATCH_WAITS}.`,
    };
  return {
    subject,
    body: `${who} waited for your OK until the day ended, and nothing was sent. They are in line for its next batch, which waits for your OK too: ${NEXT_BATCH_WAITS}.`,
  };
}

/**
 * A freed time's batch stopped before it went because the time was booked since it was offered (decision 0082), told once,
 * as a stopped run is. `at` is the time in the business's words ("Tue 3:00 PM").
 */
export function freedTimeTakenNotice(name: string, at: string): { subject: string; body: string } {
  return {
    subject: `“${name}” didn’t go: ${at} was taken`,
    body: `${at} was taken before it went: someone booked it since it freed up, so nobody was offered it. The next cancellation offers its own time.`,
  };
}

export const PLAYBOOK_NAME_MAX = 80;

/** A campaign the caller cannot see, or one that is gone: every door's 404 for one, in the word a person reads (D19). */
export const CAMPAIGN_NOT_FOUND = "Campaign not found.";

/** What a moment's doors say when handed a reach-out's step: the one refusal, in one place. */
export const REACH_OUT_IS_NOT_A_MOMENT = "A sequence to leads starts from a search's leads, not at a moment.";

export function triggerOf(id: string): (typeof PLAYBOOK_TRIGGERS)[number] | null {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}

/**
 * The moments a visit decides (the reminder the day before, the thank-you the day after): owed once per visit, so no two
 * sequences run on one of them (the routes refuse a second, the run skips whom a twin reached; sequence-words.ts).
 */
export const VISIT_TRIGGERS: readonly string[] = PLAYBOOK_TRIGGERS.filter((t) => t.kind === "visit").map((t) => t.id);

/**
 * Whether a moment is offered in a workspace (0006): every one, a proposal's too, since every workspace has deals
 * (0008, amended 18 Oct 2026). The Playbooks page, its counts, Ask and the check that makes a playbook all read it. A
 * reach-out's steps are never moments: the reach-out sheet makes them (Reach out, Part 4).
 */
export function triggerOffered(t: { kind: string }): boolean {
  return t.kind !== "reach_out";
}

/**
 * The moments no longer offered for a new playbook (2 Oct 2026), each with why. A playbook already made on one keeps
 * running: the run asks triggerOffered, which they still pass.
 */
export const MOMENTS_RETIRED: Partial<Record<PlaybookTrigger, string>> = {
  new_week:
    "Your receptionist answers a first contact itself, and asks there for the yes to offers that a welcome would need.",
  phoned_only:
    "The call's text does this during the call: the booking link and your WhatsApp, sent when a caller asks for them.",
};

/**
 * The two win-backs, which are one moment read the one way a workspace can: by silence (quiet_30) where no calendar is
 * connected, by visits (lapsed) where one is. momentOffered offers the one; the Playbooks page counts a playbook on
 * either as the win-back made.
 */
const WIN_BACKS: readonly string[] = ["quiet_30", "lapsed"];

export function isWinBack(id: string): boolean {
  return WIN_BACKS.includes(id);
}

/**
 * A trigger's label and hint in the workspace's word (J1): an appointment moment's say it ("Session reminder", "After
 * the session", "No session in 45 days…"); every other trigger's are its own. What the composer, the drawer, Ask's card
 * and a new campaign's name read, so a page says one word.
 */
export function triggerWords(
  t: { id: string; label: string; hint: string },
  word: AppointmentWord,
): { label: string; hint: string } {
  const W = appointmentWords(word);
  if (t.id === "visit_tomorrow") return { label: W.before.name, hint: W.before.hint };
  if (t.id === "visited") return { label: W.after.caps, hint: W.after.hint };
  if (t.id === "lapsed") return { label: t.label, hint: W.lapsedHint };
  return { label: t.label, hint: t.hint };
}

/** What the check says of the win-back this workspace cannot read, when a new campaign asks for it, in its word. */
export function winBackWords(word: AppointmentWord): { quiet_30: string; lapsed: string } {
  const W = appointmentWords(word);
  const silence = (triggerOf("quiet_30")?.hint ?? "").toLowerCase();
  return {
    quiet_30: `A calendar is connected here, so the win-back goes ${W.byMany}: ${W.lapsedHint.toLowerCase()}. Start that one.`,
    lapsed: `The win-back ${W.byMany} needs your calendar, and none is connected. Start the one that goes by silence: ${silence}.`,
  };
}

/**
 * Whether a new campaign on a moment is offered by whether a calendar is connected here: the two win-backs (by visits
 * only with one, by silence only without), the appointment moments and a freed time (only with one: a time is freed on the
 * calendar, decision 0082). The calendar set, declared once: momentOffered reads it, and so does the check that makes a
 * campaign, which asks for the calendar only here and says why a moment of it is refused.
 */
export function momentReadsCalendar(t: { id: string; kind: string }): boolean {
  return isWinBack(t.id) || t.kind === "visit" || t.kind === "freed";
}

/**
 * Whether a moment is offered for a NEW campaign (2 Oct 2026, the lifecycle set): offered here at all
 * (triggerOffered), not retired (MOMENTS_RETIRED), of the two win-backs the one this workspace can read (by visits where
 * a calendar is connected, by silence where none is), and an appointment moment only where a calendar is connected
 * (decision 44 of 9 Oct 2026): without one its run reads nothing and skips every day. Campaigns' moments, its composer,
 * Ask's proposals and the check that makes a campaign ask this; the run never does, so one made before keeps running.
 * `calendarOn` is a calendar connected here, whether or not its feed can be read just now: the page's calendar state is
 * not "none".
 */
export function momentOffered(t: { id: string; kind: string }, o: { calendarOn: boolean }): boolean {
  if (!triggerOffered(t)) return false;
  if (t.id in MOMENTS_RETIRED) return false;
  if (!momentReadsCalendar(t)) return true;
  return t.id === "quiet_30" ? !o.calendarOn : o.calendarOn;
}

/**
 * Whether an Autonomy class is offered in a workspace: a class no moment runs under, or one a moment offered here
 * runs under, or the reach-outs', which the reach-out sheet makes. Every workspace has deals (0008, amended 18 Oct
 * 2026), so the follow-ups' row is everywhere, as every other row is.
 */
export function policyClassOffered(cls: string): boolean {
  // The reach-outs' row: no moment runs under it, but its own sheet makes chains that do (Reach out, Part 4 PR 6).
  if (cls === "outreach") return true;
  const runs = PLAYBOOK_TRIGGERS.filter((t) => t.cls === cls);
  return runs.length === 0 || runs.some((t) => triggerOffered(t));
}
