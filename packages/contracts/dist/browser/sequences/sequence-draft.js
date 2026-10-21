import { appointmentWords } from "../journey/appointment-word.js";
export const SEQUENCE_DRAFT_THEN_MAX = 3;
export const SEQUENCE_WAIT_DAYS = { min: 1, max: 90 };
export const isListToken = (token) => /^seg:[a-z0-9_]{1,40}$/.test(token) || /^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
export function newSequenceLine(trigger, word) {
  const a = appointmentWords(word);
  switch (trigger) {
    case "visit_tomorrow":
      return `Remind each customer the day before their ${a.one}`;
    case "visited":
      return `Thank each customer the day after their ${a.one}, and ask how it went`;
    case "quiet_30":
    case "lapsed":
      return "Invite back anyone who hasn\u2019t been in for a while";
    case "new_week":
      return "Welcome each new customer in their first week";
    case "phoned_only":
      return "Ask anyone who only phoned to save our number";
    case "everyone_monthly":
      return "Send everyone this month\u2019s offer";
    case "proposal_waiting":
      return "Follow up on a proposal they haven\u2019t answered";
    default:
      return null;
  }
}
