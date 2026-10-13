/**
 * What a caller gets while the receptionist cannot do its usual work, said once.
 *
 * Two states stop it, and each was described in several ways by the pages that mention it (the engine and wiring review,
 * finding D1-line-off-words): a phone line that is switched off, and a workspace whose billing stopped. A page that says
 * what happens to someone who rings must say what the code does, and the code does this:
 *
 *   LINE OFF   the control plane routes nothing to a channel that is not active (db routing.ts), so a call to the number
 *              is unrouted -- and a call is never refused: the voice door answers 200 whatever it found (edge
 *              voice/inbound-call.ts), the receptionist is handed the shell's "no facts" words and a greeting that names
 *              nobody (voice/call-start.ts), and the call's later webhooks find no workspace and are dead-lettered
 *              (voice/call-webhook.ts). So a call is picked up, without the business's facts, and is not recorded. A text
 *              or an email to a channel that is off is neither answered nor recorded (alertUnroutable tells the platform).
 *              Connections said the opposite until 12 Sep 2026; Live, Start and Today never moved onto the true sentence.
 *   PAUSED     the workspace is routed and read, and the phone receptionist's whole prompt for the call is the
 *              take-a-message script (billing.ts pausedVoiceFacts); every other message waits in the Inbox for a person.
 *
 * So each state is ONE value here -- what a caller gets, as a clause that follows a dash ("calls are picked up without
 * your facts and are not recorded"), the tone every page draws the state in -- and a page says its own lead-in ("The line
 * is switched off", "This workspace is paused") and then the value. A page-owned sentence about what happens to a caller
 * in either state is a second implementation of it, and contradicted the first four times it was written.
 * tooling/scripts/tests/connections/a-line-off-and-a-pause-are-said-once.test.mjs draws every page's words for both over
 * their real view models and fails one that does.
 *
 * It names no page and reads no data: the states are decided where they always were (a channel's status, the tenant's).
 * It imports nothing, on purpose: shell/chrome.ts and workspace/billing.ts read it, and the phone app's program reaches
 * both, so a type import of shell/tone.ts here would bring that module's whole graph into it. The tone is a local union,
 * held to the vocabulary by caller-gets.type-test.ts.
 */

/** The two states in which what a caller gets is not the receptionist's usual answer. */
type CallerState = "line_off" | "workspace_paused";

export interface CallerGets {
  state: CallerState;
  /** The tone every page draws the state in (shell/tone.ts): a person should look, or the receptionist has stopped. */
  tone: "warn" | "danger";
  /** What the person reaching the workspace gets: a clause that follows a dash, the same on every page. */
  gets: string;
}

/** The clause as a sentence of its own: capitalised, with its full stop. */
export function callerSentence(g: CallerGets): string {
  return `${g.gets.charAt(0).toUpperCase()}${g.gets.slice(1)}.`;
}

/** A switched-off phone line: the call is picked up, without the business's facts, and nothing of it is kept. */
export const PHONE_LINE_OFF: CallerGets = {
  state: "line_off",
  tone: "warn",
  gets: "calls are picked up without your facts and are not recorded",
};

/** What a call to a paused workspace gets, on its own: the back office says only this (its reader is Chanlytics staff). */
export const PAUSED_CALL = "calls are answered only to take a message";

/**
 * What ends with a workspace its last member leaves (00262: paused, its plan cancelled), as deleting an account says it
 * before the press and the data-deletion page says it: its public pages are Not found (the public readers, left_empty_at),
 * and a call to its number is still picked up to take a message, since its line goes back only by the lines sweep. Said
 * from PAUSED_CALL, never "stops answering" (the wiring's second audit review, C1).
 */
export const WORKSPACE_ENDED_WORDS = `its receptionist stops replying to messages and ${PAUSED_CALL}, its plan is cancelled, and its public pages go offline`;

/** A paused workspace: a call is answered only to take a message, and every other message waits for a person. */
export const WORKSPACE_PAUSED: CallerGets = {
  state: "workspace_paused",
  tone: "danger",
  gets: `${PAUSED_CALL}, and new messages wait in the Inbox for you to answer`,
};

/**
 * A switched-off line, by the kind of wire. A call is picked up and a message is dropped (the header says why), so the
 * phone line is one value and the others take their noun ("message", "email") from the wire.
 */
export function lineOffGets(kind: string, noun: string): CallerGets {
  return kind === "voice"
    ? PHONE_LINE_OFF
    : { state: "line_off", tone: "warn", gets: `${noun}s to it are neither answered nor recorded` };
}
