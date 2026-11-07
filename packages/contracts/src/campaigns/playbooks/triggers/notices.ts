/** Triggers: notices. */

import { appointmentWords, type AppointmentWord } from "../../../journey/appointment-word";
import { MIN_MS } from "../../../shared/time";
import { plural } from "../../../shared/words";
import { waitEndsWords } from "../../../waits/rules";
import { PLAYBOOK_TRIGGERS, PLAYBOOK_VETO_DELAY_MS, SENDING_HOURS_WORDS, type PlaybookTrigger } from "./kinds";

// One playbook message per person per week, across playbooks: declared with the playbooks' clock (playbooks/time.ts), so
// a broadcast's breath (campaigns/broadcasts/run-words.ts) reads it without this module's triggers.
export { PLAYBOOK_BREATH_MS } from "../time";

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
  const phrase = plural(people, "person", "people");
  return {
    subject: `Campaign “${name}” sends ${when}: ${phrase}`,
    body: `${phrase} will be sent “${name}”. ${waitEndsWords("batch_hold", when)}, from Today or its run.`,
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
  const phrase = plural(people, "person", "people");
  const subject = `“${name}” didn’t go: nobody approved it`;
  if (at && triggerOf(trigger ?? "")?.kind === "freed")
    return {
      subject,
      body: `${phrase} waited for your OK until ${at} came, and nothing was sent: that time has passed. The next cancellation offers its own time, and waits for your OK too: ${NEXT_BATCH_WAITS}.`,
    };
  if (approvalEndsWithSendingHours(trigger))
    return {
      subject,
      body: `${phrase} waited for your OK until ${SENDING_HOURS_WORDS.end}, and it did not reach them: no later batch sends it in its place. Open it to see who, and write to them yourself. The next day’s “${name}” waits for your OK too, until ${SENDING_HOURS_WORDS.end}: ${NEXT_BATCH_WAITS}.`,
    };
  return {
    subject,
    body: `${phrase} waited for your OK until the day ended, and nothing was sent. They are in line for its next batch, which waits for your OK too: ${NEXT_BATCH_WAITS}.`,
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
 * sequences run on one of them (the routes refuse a second, the run skips whom a twin reached; sequences/words/next.ts).
 */
export const VISIT_TRIGGERS: readonly string[] = PLAYBOOK_TRIGGERS.filter((t) => t.kind === "visit").map((t) => t.id);

/**
 * Whether a moment is offered in a workspace (0006): every one, a proposal's too, since every workspace has deals
 * (0008, amended 18 Oct 2026). The Playbooks page, its counts, Ask and the check that makes a playbook all read it. A
 * reach-out's steps are never moments: the reach-out sheet makes them (Reach out, Part 4).
 */
export function triggerOffered(target: { kind: string }): boolean {
  return target.kind !== "reach_out";
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
  target: { id: string; label: string; hint: string },
  word: AppointmentWord,
): { label: string; hint: string } {
  const words = appointmentWords(word);
  if (target.id === "visit_tomorrow") return { label: words.before.name, hint: words.before.hint };
  if (target.id === "visited") return { label: words.after.caps, hint: words.after.hint };
  if (target.id === "lapsed") return { label: target.label, hint: words.lapsedHint };
  return { label: target.label, hint: target.hint };
}

/** What the check says of the win-back this workspace cannot read, when a new campaign asks for it, in its word. */
export function winBackWords(word: AppointmentWord): { quiet_30: string; lapsed: string } {
  const words = appointmentWords(word);
  const silence = (triggerOf("quiet_30")?.hint ?? "").toLowerCase();
  return {
    quiet_30: `A calendar is connected here, so the win-back goes ${words.byMany}: ${words.lapsedHint.toLowerCase()}. Start that one.`,
    lapsed: `The win-back ${words.byMany} needs your calendar, and none is connected. Start the one that goes by silence: ${silence}.`,
  };
}

/**
 * Whether a new campaign on a moment is offered by whether a calendar is connected here: the two win-backs (by visits
 * only with one, by silence only without), the appointment moments and a freed time (only with one: a time is freed on the
 * calendar, decision 0082). The calendar set, declared once: momentOffered reads it, and so does the check that makes a
 * campaign, which asks for the calendar only here and says why a moment of it is refused.
 */
export function momentReadsCalendar(target: { id: string; kind: string }): boolean {
  return isWinBack(target.id) || target.kind === "visit" || target.kind === "freed";
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
export function momentOffered(target: { id: string; kind: string }, options: { calendarOn: boolean }): boolean {
  if (!triggerOffered(target)) return false;
  if (target.id in MOMENTS_RETIRED) return false;
  if (!momentReadsCalendar(target)) return true;
  return target.id === "quiet_30" ? !options.calendarOn : options.calendarOn;
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
