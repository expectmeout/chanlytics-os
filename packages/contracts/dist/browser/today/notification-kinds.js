import { ALERT_ADDRESSES_MAX } from "../config/workspace-config/alerts.js";
import { LEAD_QUESTION_WAIT_LINE } from "../leads/lead-plan.js";
import { agoShort } from "../shared/time.js";
import { BELL_LIST_ROWS, BELL_WINDOW_DAYS } from "./push.js";
const NOTIFICATION_DELIVERY = {
  handoff: "email",
  deadman: "email",
  call: "email",
  number: "email",
  sweep: "email",
  job_failed: "email",
  playbook: "email",
  calendar_people: "bell",
  booking_notice: "bell",
  alert: "email",
  review: "bell",
  billing: "email",
  template_ready: "email",
  template_blocked: "email",
  broadcast_sent: "email",
  broadcast_stopped: "email",
  leads_ready: "bell",
  leads_question: "email",
  note_for_you: "bell",
  reach_out_replied: "email",
  reach_out_day: "bell",
  // A customer asked to stop: news and no wait (decision 0048). Emailed only as the business chooses, never always.
  opted_out: "email",
  // A booking that arrived and a teammate who joined: news and no wait, a line on the bell and no mail, no phone.
  booking: "bell",
  member_joined: "bell",
  // A teammate who left: the same, the other way (00437).
  member_left: "bell",
  // A note from an owner's correction, to keep or dismiss on the Autonomy pane (00448): a line on the bell, no more.
  note_to_keep: "bell",
  // A reply counting down to go in the owner's name (decision 0064): the bell and the phone, never a mail for a wait of minutes.
  reply_held: "bell",
  // Ask's morning cards on Today (00471): a line on the member's own bell, no more.
  ask_cards: "bell"
};
export const EMAILED_NOTIFICATION_KINDS = Object.keys(NOTIFICATION_DELIVERY).filter((k) => NOTIFICATION_DELIVERY[k] === "email");
export function emailsNotificationKind(kind) {
  const known = Object.hasOwn(NOTIFICATION_DELIVERY, kind ?? "");
  return NOTIFICATION_DELIVERY[known ? kind : "alert"] === "email";
}
export const EMAIL_ALWAYS_KINDS = ["handoff", "deadman"];
const ALERT_GROUP_TITLES = {
  needs_you: "Needs you",
  worth_knowing: "Worth knowing",
  for_you: "For your information"
};
export const ALERT_TOPICS = [
  {
    key: "handoff",
    group: "needs_you",
    title: "A customer needs a person",
    what: "The receptionist stopped on a conversation and someone is waiting. The alert carries their message.",
    email: "always",
    phone: true,
    kinds: ["handoff"]
  },
  {
    key: "deadman",
    group: "needs_you",
    title: "Still waiting for an answer",
    what: "A customer who needed a person has waited a while, a message went unanswered, or a reply never left.",
    email: "always",
    phone: true,
    kinds: ["deadman"]
  },
  {
    key: "reply_held",
    group: "needs_you",
    title: "A reply waits to go in your name",
    what: "The receptionist wrote a reply that waits before it goes: the hold you set for replies, or one it was not sure of. It says when it goes; stop it in the Inbox before then. Closed once it goes or is stopped.",
    onBell: "replies about to go",
    email: null,
    phone: true,
    kinds: ["reply_held"]
  },
  {
    key: "playbook",
    group: "needs_you",
    title: "A campaign waits for your yes",
    what: "A run waits for your approval, or goes unless you stop it, with how many people it reaches; a sequence to leads holds an email for your call; or a campaign could not run today, and tomorrow's run tries again.",
    email: "choice",
    phone: true,
    kinds: ["playbook"]
  },
  {
    key: "leads_question",
    group: "needs_you",
    title: "A lead search asks you something",
    what: `A lead search stopped to ask you something. ${LEAD_QUESTION_WAIT_LINE}`,
    email: "choice",
    phone: true,
    kinds: ["leads_question"]
  },
  {
    key: "call",
    group: "worth_knowing",
    title: "After every phone call",
    what: "Who called, how long, what they wanted and what to do next. The email carries the transcript.",
    email: "choice",
    phone: true,
    kinds: ["call"]
  },
  {
    key: "reach_out_replied",
    group: "worth_knowing",
    title: "A business wrote back to your sequence",
    what: "What the reply was read as, what was done, and the receptionist's draft when it wrote one.",
    email: "choice",
    phone: true,
    kinds: ["reach_out_replied"]
  },
  {
    key: "opted_out",
    group: "worth_knowing",
    title: "A customer asked to stop",
    what: "Someone texted STOP, unsubscribed from your emails, reported one as spam, or their carrier told us they stopped. Nothing more is sent to them, and nothing waits on you.",
    email: "choice",
    phone: false,
    kinds: ["opted_out"]
  },
  {
    key: "job_failed",
    group: "worth_knowing",
    title: "Something did not finish",
    what: "A reply may not have been sent, or a search, a send or another background job stopped partway. It says what stopped and whether it carries on.",
    email: "choice",
    phone: true,
    kinds: ["job_failed"]
  },
  {
    key: "broadcasts",
    group: "worth_knowing",
    title: "A run finished, or stopped",
    what: "When a run has gone to everyone it could reach, with how many got it and how many were held back; and when one stops partway or never goes out.",
    email: "choice",
    phone: true,
    kinds: ["broadcast_sent", "broadcast_stopped"]
  },
  {
    key: "number",
    group: "worth_knowing",
    title: "Your WhatsApp number needs attention",
    what: "WhatsApp flagged it, lowered how many new conversations it can start, restricted the account or rejected its review, or the business removed Chanlytics from it.",
    email: "choice",
    phone: true,
    kinds: ["number"]
  },
  {
    key: "templates",
    group: "worth_knowing",
    title: "A WhatsApp template was approved or blocked",
    what: "WhatsApp approved a template, or rejected, paused or disabled it, or moved it to marketing, where a send needs the customer's recorded yes.",
    email: "choice",
    phone: false,
    kinds: ["template_ready", "template_blocked"]
  },
  {
    key: "sweep",
    group: "worth_knowing",
    title: "Sending is paused",
    what: "Offers and news by email, or a mailbox your sequences to leads write from, are held after bounces or complaints, or when its provider signs it out, and you are told. Reminders, confirmations and everything on WhatsApp go on.",
    email: "choice",
    phone: false,
    kinds: ["sweep"]
  },
  {
    key: "billing",
    group: "worth_knowing",
    title: "Your plan",
    what: "A card declined, a trial ending, your receptionist paused, or the subscription ended and its number is going back. A declined card, a paused receptionist and the number going back are emailed.",
    email: "choice",
    phone: true,
    kinds: ["billing"]
  },
  {
    key: "leads_ready",
    group: "for_you",
    title: "A search found leads",
    what: "A lead search finished, with how many it found.",
    onBell: "finished searches",
    email: null,
    phone: true,
    kinds: ["leads_ready"]
  },
  {
    key: "review",
    group: "for_you",
    title: "A new Google review",
    what: "Someone reviewed the business on its Google profile.",
    onBell: "new Google reviews",
    email: null,
    phone: true,
    kinds: ["review"]
  },
  {
    key: "note_for_you",
    group: "for_you",
    title: "A note left for you",
    what: "A teammate left you a note on a person. Only you are told.",
    onBell: "notes left for you",
    email: null,
    phone: true,
    kinds: ["note_for_you"]
  }
];
export const BELL_LINE_KINDS = [
  "calendar_people",
  "booking_notice",
  "reach_out_day",
  "alert",
  "booking",
  "member_joined",
  "member_left",
  "note_to_keep",
  "ask_cards"
];
const EMAIL_CHOICE_KINDS = ALERT_TOPICS.flatMap(
  (t) => t.email === "choice" ? t.kinds : []
);
function emailOffOf(notifications) {
  const off = notifications?.email_off;
  if (!Array.isArray(off)) return [];
  return EMAIL_CHOICE_KINDS.filter((k) => off.includes(k));
}
export function emailsFor(notifications, kind) {
  if (!emailsNotificationKind(kind)) return false;
  return !emailOffOf(notifications).includes(kind ?? "");
}
function topicEmailed(topic, notifications) {
  if (topic.email === null) return false;
  const off = emailOffOf(notifications);
  return topic.email === "always" || !topic.kinds.some((k) => off.includes(k));
}
function topicPushed(topic, pushOff) {
  return topic.phone && !topic.kinds.some((k) => pushOff.includes(k));
}
export function withTopicEmail(notifications, topic, on) {
  const off = new Set(emailOffOf(notifications));
  if (topic.email === "choice") switchKinds(off, topic.kinds, on);
  return EMAIL_CHOICE_KINDS.filter((k) => off.has(k));
}
function switchKinds(off, kinds, on) {
  for (const k of kinds) {
    if (on) off.delete(k);
    else off.add(k);
  }
}
export function withTopicPush(pushOff, topic, on) {
  const off = new Set(pushOff);
  if (topic.phone) switchKinds(off, topic.kinds, on);
  return ALERT_TOPICS.flatMap((t) => t.phone ? t.kinds : []).filter((k) => off.has(k));
}
export const ALERT_PANE_WORDS = {
  where: "Where alerts reach you",
  whereSub: "The bell keeps everything. Choose what else reaches you below.",
  bell: "Bell",
  bellValue: `Everything below, for ${BELL_WINDOW_DAYS} days; the newest ${BELL_LIST_ROWS} are listed`,
  bellOn: "Always on",
  email: "Email",
  emailNobody: "Nobody yet",
  emailNobodyHint: "Until one is added, nobody is emailed when a customer needs a person.",
  emailMore: (n) => n === 1 ? "and 1 more" : `and ${n} more`,
  change: "Change",
  done: "Done",
  you: "you",
  notOnTeam: "Not on the team",
  onTeam: "On the team",
  addPlaceholder: "name@yourbusiness.com",
  addLabel: "Add an address to email",
  teammates: "Teammates not emailed:",
  emailFoot: `Each address gets what is ticked under Email. Up to ${ALERT_ADDRESSES_MAX}.`,
  test: "Send a test",
  testing: "Sending\u2026",
  testSent: (n) => n === 1 ? "A test was sent to 1 address." : `A test was sent to ${n} addresses.`,
  testNot: (why) => why === "no_address" ? "There is no address to send a test to." : why === "not_live" ? "Tests are sent from the live app only, not from a preview." : "The test could not be sent. Try again in a minute.",
  phone: (n) => n > 1 ? "Your phones" : "Your phone",
  phoneHint: "Signing out on a phone stops its alerts.",
  browser: "This browser",
  browserValue: "When someone needs you right now",
  browserHint: "While Chanlytics is open in a tab.",
  browserBlocked: "Your browser is blocking alerts from Chanlytics. Allow them in its settings for this site, then switch this on.",
  what: "What you're told about",
  whatSub: "Tick where else each one reaches you. Email is the business's; your phone is yours.",
  emailHead: "Email",
  emailHeadSub: "for the business",
  phoneHead: "Phone",
  phoneHeadSub: "yours",
  always: "Always emailed: the receptionist must always reach someone.",
  ownerChooses: "The owner chooses what the business is emailed.",
  addFirst: "Add an address to email first.",
  phoneTold: "Your phone is told this.",
  notEmailed: "Not sent by email.",
  notPushed: "Not sent to phones.",
  /** The bell's own line: what it holds that nothing else carries, and the topics that have nothing to choose here. */
  bellLine: (also) => {
    const all = [
      ...also,
      "people added from your calendar",
      "a booking that arrives",
      "a booking email that needs a look",
      "the day's numbers for leads at 6 PM",
      "a problem with a line",
      "a teammate who joins or leaves",
      "invitations not yet accepted"
    ];
    return `Also on the bell: ${all.slice(0, -1).join(", ")}, and ${all[all.length - 1]}.`;
  },
  never: "Never sent: text messages, or a daily or weekly email. Today is your brief.",
  /** The address the alerts come from, said only where an operator set one (nothing in the app writes it). */
  sentFrom: (from) => `Sent from ${from}.`
};
export function alertTestMail(o) {
  return {
    subject: `Test alert for ${o.business}`,
    body: `This is a test from Settings \u203A Notifications. If you can read it, alerts for ${o.business} reach this address: a customer who needs a person, and whatever is ticked under Email.

Nothing needs doing.

${o.link}`
  };
}
export function openItLine(link) {
  return `Open it: ${link}`;
}
export function alertGrid(o) {
  const groups = ["needs_you", "worth_knowing", "for_you"];
  return groups.map((group) => ({
    group,
    title: ALERT_GROUP_TITLES[group],
    rows: ALERT_TOPICS.filter((t) => t.group === group && !bellOnly(t, !!o.phone)).map((topic) => ({
      topic,
      email: topic.email === "always" ? { kind: "always" } : topic.email === null ? { kind: "none" } : { kind: "tick", on: topicEmailed(topic, o.notifications), held: o.emailHeld },
      phone: !o.phone ? null : !topic.phone ? { kind: "none" } : o.phone.choosable ? { kind: "tick", on: topicPushed(topic, o.phone.pushOff), held: null } : { kind: "told" }
    }))
  })).filter((g) => g.rows.length > 0);
}
const bellOnly = (t, hasPhone) => t.email === null && !hasPhone;
export function bellLineFor(hasPhone) {
  return ALERT_PANE_WORDS.bellLine(ALERT_TOPICS.filter((t) => bellOnly(t, hasPhone)).map((t) => t.onBell ?? t.title));
}
export function phoneLine(p, now) {
  const what = p.platform === "ios" ? "iPhone" : "Android phone";
  const at = p.last_seen_at ? Date.parse(p.last_seen_at) : NaN;
  if (Number.isNaN(at)) return what;
  const ago = agoShort(at, now);
  return `${what} \xB7 ${ago === "now" ? "seen just now" : `seen ${ago} ago`}`;
}
