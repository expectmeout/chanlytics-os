/**
 * The demo's Conversations: the calls and chats it lists, one of them live, and the tabs over them (moved from
 * data/conversations-data.jsx, decision 0015, step 3).
 */
import type { ConversationRow, ConversationTab, ConversationsSurface } from "../types";

const CONVERSATIONS: ConversationRow[] = [
  {
    id: "cv-selena-live",
    who: "Selena Cho",
    initials: "SC",
    clientId: null,
    channel: "phone",
    agent: { glyph: "P", name: "Phone Rep" },
    at: "Now",
    duration: "0:42",
    outcome: "live",
    snippet: "…yes, 11:30 today works. Do you take walk-in add-ons like the scalp treatment?",
    summary: {
      headline: "Booking a Swedish 60 for today 11:30 — asking about add-ons.",
      bullets: ["Confirmed today 11:30 with Lena", "Asking about scalp treatment add-on ($40)"],
      value: 180,
    },
    transcript: [
      { t: "0:04", speaker: "agent", text: "Serenity Spa, this is the booking line — how can I help?" },
      { t: "0:09", speaker: "client", text: "Hi! I'd like a Swedish massage today if you have anything." },
      { t: "0:15", speaker: "agent", text: "We have 11:30 with Lena for a 60-minute. Shall I hold it for you?" },
      {
        t: "0:22",
        speaker: "client",
        text: "Yes, 11:30 today works. Do you take walk-in add-ons like the scalp treatment?",
      },
      { t: "0:31", speaker: "agent", text: "We do — it's $40 for 15 minutes. I can note it so Lena plans the time…" },
    ],
    live: true,
  },
  {
    id: "cv-aisha-call",
    who: "Aisha Khan",
    initials: "AK",
    clientId: "c-aisha",
    threadId: "th-aisha-refund",
    channel: "phone",
    agent: { glyph: "P", name: "Phone Rep" },
    at: "11:38",
    duration: "2:04",
    outcome: "escalated",
    snippet: "Hey — I think I need a refund. Two no-shows feels like enough penalty.",
    policyClass: "money",
    summary: {
      headline: "Requested a $120 refund after her second no-show this week.",
      bullets: [
        "Cited work emergencies for both misses",
        "Resolution call drafted — today 4:30",
        "Refunds are owner-handled",
      ],
      value: -120,
    },
    transcript: [
      { t: "0:03", speaker: "client", text: "Hey — I think I need a refund. Two no-shows feels like enough penalty." },
      { t: "0:11", speaker: "agent", text: "I hear you, Aisha. Let me pull up your visits — one moment." },
      {
        t: "0:26",
        speaker: "agent",
        text: "I see both misses this week. I can't promise the refund myself, but I'll get you an answer within the hour.",
      },
      { t: "0:38", speaker: "client", text: "Okay. I'd rather not lose the $120 — I do like coming in." },
      { t: "0:47", speaker: "agent", text: "Understood. You'll hear from us shortly, I promise." },
    ],
    approval: true,
  },
  {
    id: "cv-maya-call",
    who: "Maya Rodriguez",
    initials: "MR",
    clientId: "c-maya",
    channel: "phone",
    agent: { glyph: "P", name: "Phone Rep" },
    at: "9:42",
    duration: "3:21",
    outcome: "booked",
    snippet: "…thank you, I'd love to come in for the deep tissue. Tuesday at 10 works perfectly.",
    summary: {
      headline: "Booked a deep tissue 60 — and mentioned she referred a friend.",
      bullets: [
        "Booked Tuesday 10:00 with Lena (+$280 with add-on)",
        "Mentioned referring Jordan — referral flow triggered",
      ],
      value: 280,
    },
    transcript: [
      { t: "0:05", speaker: "client", text: "Morning! I'm due for my deep tissue — anything Tuesday?" },
      { t: "0:12", speaker: "agent", text: "Tuesday at 10 with Lena is open — your usual 60 minutes?" },
      {
        t: "0:18",
        speaker: "client",
        text: "Perfect. Oh — my friend Jordan should be reaching out, I gave him your number.",
      },
      { t: "0:26", speaker: "agent", text: "Wonderful, we'll take good care of him. You're set for Tuesday at 10." },
      {
        t: "0:33",
        speaker: "client",
        text: "…thank you, I'd love to come in for the deep tissue. Tuesday at 10 works perfectly.",
      },
    ],
  },
  {
    id: "cv-jordan-sms",
    policyClass: "money",
    who: "Jordan Patel",
    initials: "JP",
    clientId: "c-jordan",
    threadId: "th-jordan-discount",
    channel: "sms",
    agent: { glyph: "P", name: "Phone Rep" },
    at: "11:10",
    outcome: "escalated",
    snippet: "Friend told me she got 20% off her first package. Can you do that for me?",
    summary: {
      headline: "Asking for Maya's 20% referral discount on the 6-pack.",
      bullets: ["Campaign ended Apr 1, but referrer is a high-LTV member", "Approval drafted — waiting in your Inbox"],
      value: 360,
    },
    messages: [
      { from: "client", at: "Apr 25 · 18:24", text: "Hi! My friend Maya told me about your studio." },
      { from: "agent", at: "Apr 25 · 18:24", text: "Welcome Jordan! What brings you in?" },
      { from: "client", at: "Apr 25 · 18:26", text: "Looking to start regular massage. She said you have packages." },
      {
        from: "agent",
        at: "Apr 25 · 18:27",
        text: "Yes — our 6-pack is $450, works out to $75 per session. Want me to book your first one to try us out?",
      },
      {
        from: "client",
        at: "11:10",
        text: "Friend told me she got 20% off her first package. Can you do that for me?",
      },
    ],
    approval: true,
  },
  {
    id: "cv-marcus-ig",
    who: "@marcus_lee",
    initials: "ML",
    clientId: "c-marcus",
    channel: "instagram",
    agent: { glyph: "I", name: "Chat Agent" },
    at: "11:18",
    outcome: "open",
    snippet: "Hey! Pricing for the couples package? Looking at next month for an anniversary…",
    summary: {
      headline: "Asking couples-package pricing for an anniversary next month.",
      bullets: ["Sent pricing + availability", "No booking yet — follow-up queued if quiet 48h"],
    },
    messages: [
      {
        from: "client",
        at: "11:18",
        text: "Hey! Pricing for the couples package? Looking at next month for an anniversary…",
      },
      {
        from: "agent",
        at: "11:19",
        text: "Congrats! Couples 90-min is $340 — weekends book fast for May. Want me to hold a Saturday?",
      },
    ],
  },
  {
    id: "cv-wellness-ig",
    who: "@thewellness.co",
    initials: "TW",
    clientId: "c-thewellness",
    threadId: "th-wellness-partnership",
    channel: "instagram",
    agent: { glyph: "I", name: "Chat Agent" },
    at: "11:28",
    outcome: "escalated",
    snippet: "We'd love to do a giveaway with your studio next month. Can we hop on a call?",
    summary: {
      headline: "Partnership / giveaway proposal from a 12.4k-follower account.",
      bullets: ["Outside Chat Agent's scope — no reply sent", "Escalated to you for the partnership call"],
    },
    messages: [
      {
        from: "client",
        at: "11:28",
        text: "Hey! Love what you're doing. We'd love to do a giveaway with your studio next month.",
      },
      { from: "client", at: "11:28", text: "Can we hop on a call this week?" },
    ],
    approval: true,
  },
  {
    id: "cv-maya-sms",
    who: "Maya Rodriguez",
    initials: "MR",
    clientId: "c-maya",
    channel: "sms",
    agent: { glyph: "P", name: "Phone Rep" },
    at: "11:37",
    outcome: "handled",
    snippet: "Perfect, thank you!",
    summary: {
      headline: "Routine reschedule, handled end-to-end.",
      bullets: ["Fri 2pm → Sat 11am, same therapist", "No escalation — high-confidence routine"],
    },
    messages: [
      { from: "client", at: "11:33", text: "Hey, can I move Friday 2pm to Saturday morning?" },
      { from: "agent", at: "11:35", text: "Done — Saturday 11am with Lena, same as before. Confirmation sent." },
      { from: "client", at: "11:37", text: "Perfect, thank you!" },
    ],
  },
  {
    id: "cv-noah-mail",
    who: "Noah Williams",
    initials: "NW",
    clientId: null,
    channel: "mail",
    agent: { glyph: "E", name: "Email Agent" },
    at: "10:45",
    outcome: "open",
    snippet: "Day-14 nurture: 'Still thinking about it?' — opened on iPhone, no reply.",
    summary: {
      headline: "Day-14 nurture sent and opened; no reply yet.",
      bullets: ["Sequence step 14 of 21", "Day-21 send is the last touch before parking"],
    },
    messages: [
      {
        from: "agent",
        at: "10:30",
        text: "Hi Noah — still thinking about that first session? This week has a few quiet slots, and your intro rate is still good. No pressure either way.",
      },
    ],
  },
];

const CV_CHANNELS: ConversationTab[] = [
  { id: "all", label: "All" },
  { id: "phone", label: "Calls" },
  { id: "chats", label: "Chats" }, // instagram + sms
  { id: "mail", label: "Email" },
];

/** Conversations in a demo session, and what a page that has not moved reads as `window.CONVERSATIONS_DATA` until a real read replaces it. */
export const conversationsSample: ConversationsSurface = { CONVERSATIONS, CV_CHANNELS };
