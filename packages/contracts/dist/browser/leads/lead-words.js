import {
  LEAD_MEMBER_CLASSES
} from "./search/sets.js";
import { LEAD_ENDING_WORDS } from "./search/endings.js";
import { plural } from "../shared/words.js";
export const LEAD_CLASSES = LEAD_MEMBER_CLASSES;
export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"];
export const LEAD_VIEW_SORTS = ["fit", "found", "distance", "business", "rating", "stage"];
export const LEAD_SORTS = [...LEAD_VIEW_SORTS, "pile"];
export const LEAD_CALL_OUTCOMES = [
  "interested",
  "call_back",
  "not_interested",
  "voicemail",
  "no_answer",
  "wrong_number"
];
export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"];
export const LEAD_STAGE_WORDS = {
  ready: "Ready",
  nurture: "Contacted",
  converted: "Talking",
  archived: "Closed"
};
export const LEAD_CLOSED_WORDS = {
  said_no: "Said no",
  not_a_fit: "Not a fit",
  customer: "Already a customer",
  stale: "Went quiet",
  search_removed: "Search removed"
};
export const LEAD_FIT_WORDS = {
  strong: "Strong fit",
  look: "Worth a look",
  long: "Long shot"
};
export const LEAD_EMAIL_WORDS = {
  none: "No email",
  checking: "Checking",
  ok: "Checked",
  catch_all: "Unconfirmed",
  unknown: "Couldn't check",
  invalid: "Bounces"
};
export const LEAD_CALL_OUTCOME_TONES = {
  interested: "ok",
  call_back: "warn",
  voicemail: "plain",
  no_answer: "plain",
  not_interested: "danger",
  wrong_number: "danger"
};
export const LEAD_CALL_OUTCOME_WORDS = {
  interested: "Interested",
  call_back: "Call back later",
  not_interested: "Not interested",
  voicemail: "Left a voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number"
};
export const LEAD_LIST_WORDS = {
  all: "All leads",
  ready: "Ready",
  nurture: "Contacted",
  converted: "Talking",
  said_no: "Said no",
  not_a_fit: "Not a fit"
};
export const LEAD_SOURCE_WORD = "Google Maps listing";
export const LEAD_LOCKED_LINE = "Wait for their yes. Once they write back, they're in People and your yes page works for them.";
export const LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
export const LEAD_NO_ADDRESS = "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";
export const LEAD_CONSENT_REFUSAL = "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";
export const LEAD_NOT_A_FIT_WORDS = {
  chain: "A chain or franchise",
  wrong_kind: "The wrong kind of business",
  too_far: "Too far away",
  customer: "Already a customer",
  other: "Something else"
};
export const LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";
export const LEAD_SUPPRESSING_WHY = "customer";
export const LEAD_REVIEW_WORD = "Needs review";
export const LEAD_LEFT_OUT_WORD = "Left out";
export const LEAD_CLASS_WORDS = {
  qualified: "Qualified",
  review: LEAD_REVIEW_WORD,
  excluded: LEAD_LEFT_OUT_WORD
};
export const LEAD_UNREACHABLE_WORD = "No way to reach them";
export const LEAD_CHECK_UNSURE = "Couldn't tell";
export const LEAD_CHECK_WORDS = {
  // Each unknown names what could not be told: four rows of "Couldn't tell" told the owner nothing.
  on_maps: { yes: "Open for business", no: "Not open for business", unknown: "Open for business: couldn't tell" },
  in_area: {
    yes: "In the area you asked for",
    no: "Outside the area you asked for",
    unknown: "In the area: couldn't tell"
  },
  phone_two_sources: {
    yes: "Phone matches on two sources",
    no: "Phone from one source only",
    unknown: "Phone on two sources: couldn't tell"
  },
  mailbox: { yes: "Mailbox exists", no: "Mailbox doesn't exist", unknown: "Mailbox: couldn't tell" },
  independent: { yes: "Not a chain", no: "Part of a chain", unknown: "Independent: couldn't tell" },
  right_kind: {
    yes: "The kind you asked for",
    no: "Not the kind you asked for",
    unknown: "The kind you asked for: couldn't tell"
  },
  own_address: {
    yes: "The business's own address",
    no: "Not the business's own address",
    unknown: "Their own address: couldn't tell"
  },
  kind: {
    yes: "The kind of business you asked for",
    no: "Not the kind of business you asked for",
    unknown: "The kind of business: couldn't tell"
  }
};
export const LEAD_ERASE_WORDS = {
  act: "Erase this lead",
  ask: (name) => `Erase ${name}? Its record and every trace of it go for good.`,
  yes: "Yes, erase",
  no: "No",
  busy: "Erasing\u2026",
  done: (name) => `${name} is erased. It won't be found again.`,
  refused: "Not erased"
};
export const LEAD_MAILBOX_WORDS = {
  none: "No email found on their site",
  checking: "Checking the mailbox",
  ok: "Mailbox exists",
  catch_all: "Their server accepts every address, so the check can't tell",
  unknown: "Their mail server wouldn't answer",
  invalid: "That mailbox doesn't exist"
};
export const LEAD_CONTACT_STANDARD_WORDS = {
  phone: "This search counts a lead once its phone or email checks out, phone first.",
  email: "This search counts a lead once its email or phone checks out, email first."
};
export const LEAD_NO_EMAIL_LINE = "Checked their home, contact and about pages. Call instead.";
export const LEAD_SENT_QUESTION = "Did you send it?";
export const LEAD_CALL_QUESTION = "How did the call go?";
export const LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
export const LEAD_NOTE_MAX = 280;
export const LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";
export function leadNoteLeft(left, max) {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}
export const LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";
export const LEAD_LOW_SHARE_FLOOR = 0.15;
export function leadRatingSpread(dist) {
  const total = dist.one + dist.two + dist.three + dist.four + dist.five;
  if (total <= 0) return [];
  return [dist.five, dist.four, dist.three, dist.two, dist.one].map((n, i) => ({
    stars: 5 - i,
    pct: Math.round(n / total * 100)
  }));
}
export function leadLowShare(dist) {
  if (!dist) return null;
  const total = dist.one + dist.two + dist.three + dist.four + dist.five;
  if (total <= 0) return null;
  const share = (dist.one + dist.two) / total;
  if (share < LEAD_LOW_SHARE_FLOOR) return null;
  return `${Math.round(share * 100)}% at 1\u20132 stars`;
}
export const LEAD_NO_CARD_LINE = "I can find local businesses for now.";
export const LEAD_OUTSIDE_US_LINE = "I can only find businesses in the US for now. The rules for emailing businesses in Canada, the UK and the EU are different, and Chanlytics follows the US ones.";
export function leadNotBusinessesLine(want) {
  return `I find businesses, not people at home. People who want ${want && want.trim() ? want.trim() : "what you do"} find you, and your receptionist answers them. Businesses whose clients need you next are a good start:`;
}
export function leadNoCardLine(what) {
  return what && what.trim() ? `I can't search ${what.trim()} yet. ${LEAD_NO_CARD_LINE}` : LEAD_NO_CARD_LINE;
}
export const LEAD_PAUSED_TITLE = "Lead searches are paused for now";
export function leadNearWhere(labels) {
  const isNear = (l) => l.toLowerCase().startsWith("near ");
  return labels.length && labels.every(isNear) ? `near ${leadAnd(labels.map((l) => l.slice(5).trim()))}` : `in ${leadAnd(labels)}`;
}
export function leadAnd(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
export function leadEndingLine(ending, f) {
  const mark = LEAD_ENDING_WORDS[ending];
  const yours = `the ${f.counted} found are yours`;
  const one = f.name.replace(/s$/, "");
  switch (ending) {
    case "target_reached":
      return {
        mark,
        title: `Found ${f.counted} ${f.name}`,
        parts: [`${f.emails} you can email`, `${f.phones} by phone`, `${f.excluded} left out`],
        step: f.excluded > 0 ? { id: "excluded", label: `${f.excluded} left out` } : { id: "sort_fit", label: "Sort by fit" }
      };
    case "searched_everything":
      if (f.counted === 0) {
        return {
          mark,
          title: `There are ${plural(f.seen, one, f.name)} in ${f.area}, and ${f.seen === 1 ? "it is" : "all of them are"} ${f.leftOutBy ?? "outside what you asked for"}, which you asked me to leave out.`,
          parts: ["Nothing was counted."],
          step: f.nearby.length ? { id: "nearby", label: `Look ${leadNearWhere(f.nearby)}` } : null
        };
      }
      return {
        mark,
        title: `Found ${f.counted} ${f.name}`,
        parts: [`everything these searches returned in ${f.area}`],
        step: { id: "nearby", label: `Find ${Math.max(0, f.target - f.counted)} more nearby` }
      };
    case "month_leads_used":
      return { mark, title: `Stopped at ${f.counted}`, parts: ["this month's leads are used", yours], step: null };
    case "budget_used":
      return {
        mark,
        title: `Stopped at ${f.counted}`,
        parts: ["this month's searching is used up", yours],
        step: null
      };
    case "few_new_matches":
      return {
        mark,
        // "already yours" read as dedupe. "Found all" says what happened: the area ran dry.
        title: `Found all ${plural(f.seen, one, f.name)} in ${f.area}`,
        parts: [yours, ...f.nearby.length ? [`Look further out, ${leadNearWhere(f.nearby)}?`] : []],
        // One word (Ruben, 25 Sep): the line before it says what was found and where; the parts say where next.
        step: f.nearby.length ? { id: "look_further", label: "Widen" } : null
      };
    case "stopped":
      return f.checking ? {
        mark,
        title: "Stopping",
        parts: [`checking the emails of the ${f.counted} found`, "nothing else was counted"],
        step: null
      } : {
        mark,
        title: `Stopped at ${f.counted}`,
        parts: [yours, "nothing else was counted"],
        step: { id: "carry_on", label: "Carry on" }
      };
    case "source_failed":
      return {
        mark,
        title: `Stopped at ${f.seen}: the source stopped answering`,
        parts: [yours, "nothing more was counted"],
        step: { id: "try_again", label: "Try again" }
      };
    case "question_unanswered":
      return {
        mark,
        title: "Stopped after a day without your answer",
        parts: [`the ${f.foundBefore} found before it asked are yours`],
        step: { id: "answer_now", label: "Answer now" }
      };
    case "paused":
      return {
        mark,
        title: LEAD_PAUSED_TITLE,
        parts: ["your leads are all here", "nothing is being counted"],
        step: null
      };
  }
}
export function leadAllowanceFact(left) {
  return `${left} left this month`;
}
export function outcomeMove(o) {
  switch (o) {
    case "interested":
      return { stage: "converted", closedReason: null, converts: true };
    case "not_interested":
      return { stage: "archived", closedReason: "said_no", converts: false };
    case "wrong_number":
      return { stage: null, closedReason: null, converts: false };
    default:
      return { stage: "nurture", closedReason: null, converts: false };
  }
}
