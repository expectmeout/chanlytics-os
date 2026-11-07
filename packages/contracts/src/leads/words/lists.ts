/** Words: lists. */

import {
  type LEAD_CLOSED_REASONS,
  type LEAD_EMAIL_STATES,
  type LEAD_FITS,
  LEAD_MEMBER_CLASSES,
  type LEAD_STAGES,
  type LeadMemberClass,
  type LeadStatusGroup,
} from "../search/sets";
import type { Tone } from "../../shell/tone";

/** B's screen word for A's stored set (`lead_search_members.class`): one set, two names, never two lists. */
export const LEAD_CLASSES = LEAD_MEMBER_CLASSES;

export type LeadClass = LeadMemberClass;

export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"] as const;

/** The orders a person picks on Leads (B widens A's three); a view remembers one of these, and Ask reads by them. */
export const LEAD_VIEW_SORTS = [
  "fit",
  "found",
  "distance",
  "business",
  "rating",
  "stage",
  "reviews",
  "contacted",
  "category",
  "city",
  "region",
] as const;

/** leads_page's p_sort: the view's orders and the pile's (00426), which only a pass of the pile asks for. */
export const LEAD_SORTS = [...LEAD_VIEW_SORTS, "pile"] as const;

export const LEAD_CALL_OUTCOMES = [
  "interested",
  "call_back",
  "not_interested",
  "voicemail",
  "no_answer",
  "wrong_number",
] as const;

export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"] as const;

/** A's stored set has no type of its own; the word for one of its members is derived here, not a second list. */
export type LeadStage = (typeof LEAD_STAGES)[number];

export type LeadList = (typeof LEAD_LISTS)[number];

export type LeadSort = (typeof LEAD_SORTS)[number];

export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number];

export type LeadNotAFitWhy = (typeof LEAD_NOT_A_FIT_WHYS)[number];

/**
 * Stored values are never shown (§9.1). A lead nothing has gone to yet is Not contacted, Contacted's other side: "Ready"
 * beside "Waits for your OK" read as ready to send (the phone walk of 3 Nov 2026), and "New" is a person's state in People.
 * A lead in a sequence wears its place there instead (leads/row.ts).
 */
export const LEAD_STAGE_WORDS: Record<LeadStage, string> = {
  ready: "Not contacted",
  nurture: "Contacted",
  converted: "Talking",
  archived: "Closed",
};

/** The status groups in the owner's words: a heading's menu and the group heads say these. */
export const LEAD_STATUS_GROUP_WORDS: Record<LeadStatusGroup, string> = {
  needs: "Needs you",
  in: "In a sequence",
  none: "Not in a sequence",
};

/**
 * What a heading's menu and the foot say around them. Needs you here counts leads, and Today's Need you counts decisions
 * (one OK may cover nine leads): the caption keeps the two numbers from being read as one.
 */
export const LEAD_HEADING_WORDS = {
  caption: "Needs you: leads waiting on you.",
  hide: "Hide column",
  clear: "Clear filters",
} as const;

export const LEAD_CLOSED_WORDS: Record<(typeof LEAD_CLOSED_REASONS)[number], string> = {
  said_no: "Said no",
  not_a_fit: "Not a fit",
  customer: "Already a customer",
  stale: "Went quiet",
  search_removed: "Search removed",
};

export const LEAD_FIT_WORDS: Record<(typeof LEAD_FITS)[number], string> = {
  strong: "Strong fit",
  look: "Worth a look",
  long: "Long shot",
};

/** Claims only what the check saw (S12): a catch-all server accepts anything, so the check cannot tell. */
export const LEAD_EMAIL_WORDS: Record<(typeof LEAD_EMAIL_STATES)[number], string> = {
  none: "No email",
  checking: "Checking",
  ok: "Checked",
  catch_all: "Unconfirmed",
  unknown: "Couldn't check",
  invalid: "Bounces",
};

/** How an outcome reads at a glance (D5): the dot beside its word, never colour alone -- the word is always there. */
/**
 * What each outcome means, in the app's ONE tone vocabulary (tone.ts). This used to carry two words of its own --
 * `quiet` and `bad` -- which no pill and no stylesheet could draw: `.tone-quiet` was never written, so a voicemail
 * and a no-answer both fell through to the faintest grey, and a wrong number drew as if nothing had happened.
 */
export const LEAD_CALL_OUTCOME_TONES: Record<(typeof LEAD_CALL_OUTCOMES)[number], Tone> = {
  interested: "ok",
  call_back: "warn",
  voicemail: "plain",
  no_answer: "plain",
  not_interested: "danger",
  wrong_number: "danger",
};

export const LEAD_CALL_OUTCOME_WORDS: Record<(typeof LEAD_CALL_OUTCOMES)[number], string> = {
  interested: "Interested",
  call_back: "Call back later",
  not_interested: "Not interested",
  voicemail: "Left a voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number",
};

/** The rail's six lists, said once (§6.1). `leadRail` draws from here and nowhere else. */
export const LEAD_LIST_WORDS: Record<LeadList, string> = {
  all: "All leads",
  ready: LEAD_STAGE_WORDS.ready,
  nurture: "Contacted",
  converted: "Talking",
  said_no: "Said no",
  not_a_fit: "Not a fit",
};
