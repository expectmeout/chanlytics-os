/**
 * What a new sequence starts from (decisions 0060 and 0065): the line New opens on where a door names a moment, the token a
 * list is named by, and the bounds of a customer's steps that the routes and Ask's cards hold (the one New drafts with
 * new-draft.ts). No zod here: the page reads these in the browser.
 */
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";

/** How many steps may follow a customer's first, as Ask's card and POST sequences take them. */
export const SEQUENCE_DRAFT_THEN_MAX = 3;
/** The wait before a step after the first, in days: the steps' own bounds (00441 sequence_steps_shape). */
export const SEQUENCE_WAIT_DAYS = { min: 1, max: 90 } as const;

/** Whether a token names a list as the composer writes one: `seg:<key>` (People's) or `list:<uuid>` (the workspace's). */
export const isListToken = (token: string): boolean =>
  /^seg:[a-z0-9_]{1,40}$/.test(token) ||
  /^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

/**
 * The owner's line New starts from on a moment a door asked for (`new:moment:<trigger>`): what they would have said, so
 * Draft it is one press. Null for a moment with no line of its own: New starts on a moment with an empty line, as it does
 * with none asked for. In the workspace's word for an appointment.
 */
export function newSequenceLine(trigger: string, word: AppointmentWord): string | null {
  const a = appointmentWords(word);
  switch (trigger) {
    case "visit_tomorrow":
      return `Remind each customer the day before their ${a.one}`;
    case "visited":
      return `Thank each customer the day after their ${a.one}, and ask how it went`;
    case "quiet_30":
    case "lapsed":
      return "Invite back anyone who hasn’t been in for a while";
    case "new_week":
      return "Welcome each new customer in their first week";
    case "phoned_only":
      return "Ask anyone who only phoned to save our number";
    case "everyone_monthly":
      return "Send everyone this month’s offer";
    case "proposal_waiting":
      return "Follow up on a proposal they haven’t answered";
    default:
      return null;
  }
}
