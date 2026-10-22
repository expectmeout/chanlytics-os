/**
 * The product as Ask tells it (the operator, 15 Oct 2026): each page, what it is for, the verbs it commits that Ask may
 * propose as cards, and what stays on the page with why. Ask's `guide` read says it to a member who asks "what can you
 * do?" or "where do I...?", and the parity test (ask-parity.test.mjs) holds it to the verb table both ways: every verb
 * a card commits is on one page here, and every verb here is one Ask proposes or one this file says stays on the page.
 * Pure words and kinds: nothing here reads a workspace.
 */
import type { AskProposal } from "../ask/ask";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address";

type Kind = AskProposal["kind"];

export interface GuidePage {
  /** The page's name as the sidebar says it. */
  page: string;
  /** Its address in the workspace (the route a card's Open and the Line's jump take). */
  route: string;
  /** What it is for, in a sentence. */
  for: string;
  /** The verbs it commits that are also Ask's cards. */
  verbs: readonly Kind[];
  /** What it does that Ask leaves to it, each with why. */
  pageOnly: readonly { what: string; why: string }[];
}

/** Why a verb stays on its page: the one reason each kind of act is not Ask's to propose. */
const WHY = {
  signIn: "it signs in to another service (Google, Microsoft, Meta), which happens on that service's own screen",
  money: "it spends or changes money on the account, which is the owner's on the billing page",
  legal: "it is a statement to the carriers in the business's legal name",
  file: "it reads or writes a file on the member's own device",
  live: "it acts on a phone call that is happening, where the Live page's button is quicker than a sentence",
  erase: "it erases a person for good, which is asked for and confirmed on their page",
  team: "it changes who is on the team, which the owner does in Settings › Team",
  draft: "Ask writes the draft itself in the conversation, so it never needs the page's drafter",
  made: "Ask makes a sequence with its own card, from the draft it wrote in the conversation; New's Keep and Start make the one the owner shaped on the page",
  learned:
    "a note the owner's correction suggested is kept beside what they wrote, on Settings › Autonomy; Ask adds a note of its own with a settings card",
  test: "it mails a step's message to the member who presses it, beside the step on its page",
  end: "it ends a sequence for good, which is asked and confirmed on its page, beside the history it keeps",
  add: "Ask adds leads to a sequence with a card of its own on the same door (reach_out_add); the page's Add, Move and pick are the lead sheet's presses, beside the lead and the search they act on",
  stop: "it stops a reply in the minutes before it posts, under the review on Reports, where the reply and its time are",
  memory:
    "it changes or forgets a line of what Ask remembers, which a member does on Settings › Memory where every line is listed; Ask keeps a line with its own card and its Undo",
} as const;

export const ASK_GUIDE_PAGES: readonly GuidePage[] = [
  {
    page: "Today",
    route: "today",
    for: "Who waits on you right now, replies about to time out, a booking the receptionist asked for (Booked it or Can't), today's calls and bookings, and the day's recap.",
    verbs: ["booking_request"],
    pageOnly: [],
  },
  {
    page: "Inbox",
    route: "inbox",
    for: "Every conversation: answer, take one over, hand it back to the receptionist, snooze, wake or archive it.",
    verbs: ["reply", "steer", "thread_verb"],
    pageOnly: [{ what: "Export a conversation", why: WHY.file }],
  },
  {
    page: "Live",
    route: "live",
    for: "Calls happening now: listen, whisper to the receptionist, hand the call to your phone or end it.",
    verbs: ["whisper", "call_hand_over"],
    pageOnly: [{ what: "End a call", why: WHY.live }],
  },
  {
    page: "People",
    route: "clients",
    for: "Everyone who has written or called: their answers, notes, steps, deals, lists, and what the receptionist does with each.",
    verbs: [
      "person_mode",
      "note",
      "person_details",
      "answer",
      "person_add",
      "person_merge",
      "person_message",
      "answer_many",
      "person_mode_many",
      "note_many",
      "list",
      "list_member",
      "list_change",
      "list_delete",
    ],
    pageOnly: [
      { what: "Import people from a file, or export them", why: WHY.file },
      { what: "Delete a person", why: WHY.erase },
    ],
  },
  {
    page: "Pipeline",
    route: "clients/pipeline",
    for: "Deals by where they stand: consultations, proposals out, clients, and the ones that passed.",
    verbs: ["deal"],
    pageOnly: [],
  },
  {
    page: "Leads",
    route: "clients/leads",
    for: "Find businesses or people to reach, review what a search found, and work each lead to a yes.",
    verbs: [
      "lead_search",
      "people_search",
      "lead_search_more",
      "lead_stage",
      "lead_mark",
      "lead_later",
      "leads_bulk",
      "leads_check",
      "lead_addressee",
      "lead_list",
      "lead_search_aim",
      "reach_out_said",
    ],
    pageOnly: [{ what: "Import leads from a file, or export them", why: WHY.file }],
  },
  {
    page: "Calendar",
    route: "calendar",
    for: "The week's appointments from your booking tool, the open times, and how full the next two weeks are.",
    verbs: [],
    pageOnly: [{ what: "Connect the booking tool", why: WHY.signIn }],
  },
  {
    page: "Campaigns",
    route: SEQUENCES_ROUTE,
    for: "Everything that sends on its own: sequences on a moment or a list, one-off sends, cold email to leads, saved messages.",
    verbs: [
      "broadcast",
      "playbook",
      "run",
      "playbook_channels",
      "playbook_change",
      "message",
      "sequence_make",
      "sequence_step",
      "sequence_step_remove",
      "sequence_words",
      "sequence_start",
      "playbook_run",
      "sequence_leave",
      "sequence_add",
      "sequence_move",
      "sequence_send_decide",
      "sequence_send_said",
      "sequence_discard",
      "sequence_end",
      "sequence_draft",
      "sequence_new",
      "sequence_test",
      "reach_out_make",
      "reach_out_add",
    ],
    pageOnly: [
      { what: "Draft a sequence from a line on the page", why: WHY.draft },
      { what: "Keep or start what New drafted", why: WHY.made },
      { what: "Send yourself a test of a step's message", why: WHY.test },
      { what: "End a sequence for good", why: WHY.end },
    ],
  },
  {
    page: "Reports",
    route: "reports",
    for: "How any period went: replies, calls, people, campaigns, reviews, cold email and the receptionist, against the period before.",
    verbs: ["review_reply", "review_reply_stop"],
    pageOnly: [],
  },
  {
    page: "Settings",
    route: "admin/workspace",
    for: "What the receptionist knows and may do alone, your goal, how you like answers (Profile), what Ask remembers (Memory), connections, notifications, team and billing.",
    verbs: [
      "settings",
      "policy",
      "invite",
      "follow_up",
      "fact_suggestion",
      "answer_style",
      "memory",
      "memory_change",
      "memory_forget",
    ],
    pageOnly: [
      { what: "Connect WhatsApp, Google, a mailbox or a phone line", why: WHY.signIn },
      { what: "Billing and the plan", why: WHY.money },
      { what: "The business on record for texting", why: WHY.legal },
      { what: "Invite or remove a teammate", why: WHY.team },
    ],
  },
];

/**
 * The verbs Ask does not propose, each with why: a card of a kind kept for the threads that already hold one, or a verb
 * the page's own screen does better. The parity test reads it beside the registry.
 */
export const ASK_PAGE_ONLY_VERBS: Readonly<Partial<Record<Kind, string>>> = {
  invite: WHY.team,
  sequence_draft: WHY.draft,
  sequence_new: WHY.made,
  fact_suggestion: WHY.learned,
  sequence_test: WHY.test,
  sequence_end: WHY.end,
  sequence_add: WHY.add,
  sequence_move: WHY.add,
  lead_search_aim: WHY.add,
  review_reply_stop: WHY.stop,
  memory_change: WHY.memory,
  memory_forget: WHY.memory,
};
