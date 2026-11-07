/** Rows: steps. */

import { bookingPageOffered } from "../../google/listing";
import { bookingPageRead } from "../../imports/business-reads";
import { rowContextOf, forwardedLineOf, withWorkspaceChoices, type SetupInputs, type SetupVM } from "../setup";
import { SETUP_STATE_WORDS, type SetupRowContext, type SetupRowVM } from "../lines";
import {
  KEEP_ROW,
  RECEPTIONIST_MET,
  CHANNELS_SEEN,
  REHEARSE_SKIPPED,
  GOOGLE_CONNECT_LATER,
  REMIND_SKIPPED,
  TRY_SKIPPED,
  setupBack,
  setupOffNow,
  setupPutOffEver,
  type SetupPutOff,
} from "../put-off";
import { SETUP_ROWS } from "./channels";

/** What the first run's Check reads beside the rows (SetupVM.check): the receptionist's state and Google's facts. */
const checkFactsOf = (i: SetupInputs): SetupVM["check"] => ({
  receptionist: i.business.receptionist,
  listed: !!i.google?.listing,
  unsure: i.google?.unsure ?? [],
  type: i.google?.type ?? null,
  bookingPage: bookingPageOffered(bookingPageRead(i.reads), i.business.bookingLink),
});

/**
 * A number the member chose to keep or move, with no forwarding saved for one yet, and "The number you already have"
 * never put off: the first run's Go live still owes its forwarding (first-run.ts stepDone). A new number owes none. A
 * put-off whose week ended still said the forwarding can wait, so the row back on Today does not reopen the step.
 */
const forwardingOwedOf = (i: SetupInputs, off: SetupPutOff): boolean =>
  !!i.want && i.want.way !== "new" && !forwardedLineOf(i.lines) && !setupPutOffEver(off, KEEP_ROW);

/** Setup's top line: a serious conflict first ("answering" and "answering correctly" differ), else what answers where. */
function readinessSentenceOf(setupInputs: SetupInputs, ctx: SetupRowContext): string {
  const { waReady, voiceReady, waNum, voiceNum, texting } = ctx;
  const seriousConflict = (setupInputs.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  if (seriousConflict) return seriousConflict.sentence;
  if (waReady && voiceReady)
    return `Your receptionist answers calls on ${voiceNum} and WhatsApp on ${waNum}. ${texting.sentence}`;
  if (voiceReady)
    return `Your receptionist answers calls on ${voiceNum}. WhatsApp is not connected. ${texting.sentence}`;
  if (waReady) return `Your receptionist answers WhatsApp on ${waNum}. No phone line yet.`;
  return "Your receptionist is not answering yet.";
}

/** Try it: the numbers that answer, to call or write from a phone; none while nothing answers. */
function tryItOf(ctx: SetupRowContext): SetupVM["tryIt"] {
  const { wa, voice, waReady, voiceReady, answering, waNum, voiceNum } = ctx;
  if (!answering) return null;
  return {
    voice: voiceReady ? voice.number : null,
    voiceLabel: voiceReady ? voiceNum : null,
    whatsapp: waReady ? wa.number : null,
    whatsappLabel: waReady ? waNum : null,
  };
}

/**
 * What the first run reads of Setup beside its rows (decision 0073): what can be found on Google, the member's own
 * put-offs and choices, the forwarding still owed, the rehearsal, Connect it to Google, and Check's facts. The first
 * run's own marks (its receptionist met, the rehearsal skipped, Where it answers seen, Google's connect put off) are
 * answers, written for good; each is read as put off at all (setupPutOffEver), so a step once done is never opened
 * again by a week that ended.
 */
function firstRunFactsOf(setupInputs: SetupInputs, ctx: SetupRowContext, off: SetupPutOff, nowMs: number) {
  const google = setupInputs.google;
  return {
    findable: !!google?.ready && google.places !== false && !google.listing,
    trySkipped: setupOffNow(off, TRY_SKIPPED, nowMs),
    remindSkipped: setupOffNow(off, REMIND_SKIPPED, nowMs),
    remindBack: setupBack(off, REMIND_SKIPPED, nowMs),
    dayBeforeOn: setupInputs.reminders?.day_before === true,
    forwardingOwed: forwardingOwedOf(setupInputs, off),
    receptionistMet: setupPutOffEver(off, RECEPTIONIST_MET),
    rehearseSkipped: setupPutOffEver(off, REHEARSE_SKIPPED),
    googleConnect: {
      offered:
        google?.profile === true &&
        !!google.listing &&
        !google.connected &&
        !setupPutOffEver(off, GOOGLE_CONNECT_LATER),
      connected: !!google?.connected,
      email: google?.connection?.google_email ?? null,
    },
    rehearsal: { reviewed: setupInputs.rehearsal?.reviewed ?? 0, kept: setupInputs.rehearsal?.kept ?? 0 },
    choices: setupInputs.choices ?? { whatsapp: null },
    want: setupInputs.want ?? null,
    noCalls: !!setupInputs.noCalls,
    lineUnderway: !!ctx.ownLine || ctx.voice.present || !!setupInputs.requests.line || !!setupInputs.requests.port,
    numbersHere: !!setupInputs.lines?.ready,
    channelsSeen: setupPutOffEver(off, CHANNELS_SEEN),
    calendarLinked: setupInputs.calendar.state !== "none",
    check: checkFactsOf(setupInputs),
  };
}

/**
 * The fold over SETUP_ROWS: the rows drawn, each with its state's words and whether this member has it put off or back
 * from a week put off; the readiness they add up to; the first open verb; and what the first run's Check reads beside
 * them.
 */
export function setupSteps(given: SetupInputs, nowMs = Date.now()): SetupVM {
  // The workspace's own choices first (decision 0091), so every viewer stands at the same step.
  const workspaceChoices = withWorkspaceChoices(given);
  // A fixture written before rests carries none: no rows rest.
  const off: SetupPutOff = { later: workspaceChoices.later ?? [], rests: workspaceChoices.rests ?? {} };
  const ctx = rowContextOf(workspaceChoices, nowMs);
  const rows: SetupRowVM[] = [];
  for (const build of SETUP_ROWS) {
    const r = build(workspaceChoices, ctx);
    if (r)
      rows.push({
        ...r,
        stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state],
        later: !r.required && setupOffNow(off, r.id, nowMs),
        back: !r.required && setupBack(off, r.id, nowMs),
      });
  }

  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next =
    nextRow && nextRow.verb
      ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title }
      : null;
  const done = rows.filter((r) => r.state === "ready").length;
  return {
    rows,
    readiness: { answering: ctx.answering, sentence: readinessSentenceOf(workspaceChoices, ctx) },
    next,
    done,
    total: rows.length,
    tryIt: tryItOf(ctx),
    ...firstRunFactsOf(workspaceChoices, ctx, off, nowMs),
  };
}
