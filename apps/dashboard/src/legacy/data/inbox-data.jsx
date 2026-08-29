/* global window */
// Chanlytics Inbox — seed data (v2 — enriched for refinement)
//
// New fields per thread:
//   summary          — one-line narrative recap of the situation
//   contextStrip     — 3 micro-events shown under the header
//   approval.evidence — the agent's "why" (sources, similar cases)
//   approval.alternatives — what the agent considered & rejected
//   approval.nextSteps — what happens AFTER you decide
//   approval.outcomes[].dollarDelta — explicit $ impact (number, sign matters)

const INBOX_BUCKETS = [
  { id: "needs",     label: "Needs my call",  hint: "Approvals queued",         icon: "alert",   accent: true,  count: 4 },
  { id: "watching",  label: "Watching",       hint: "Agents handling, you're cc'd", icon: "eye",     count: 12 },
  { id: "drafts",    label: "Drafts",         hint: "Replies prepared, not sent",   icon: "edit",    count: 4 },
  { id: "escalated", label: "Escalated",      hint: "Agent asked for help",         icon: "flag",    count: 1 },
  { id: "snoozed",   label: "Snoozed",        hint: "Come back later",              icon: "clock",   count: 7 },
  { id: "done",      label: "Done",           hint: "Resolved this week",           icon: "check",   count: 48 },
];

const INBOX_VIEWS = [
  { id: "vip",         label: "VIP clients",      icon: "star", count: 4 },
  { id: "at-risk",     label: "At-risk revenue",  icon: "alert", count: 2 },
  { id: "high-conf",   label: "High-confidence approvals", icon: "sparkle", count: 7 },
  { id: "new-leads",   label: "New leads today",  icon: "plus", count: 9 },
];

const THREADS = [
  // ============ VERDICT: meeting ended — the one post-meeting human call ============
  {
    id: "th-verdict-gabby",
    who: "Gabby Moreno",
    whoMeta: "Lead · consult held 11:00–11:45",
    avatar: "GM",
    state: "needs",
    channels: ["instagram"], primaryChannel: "instagram",
    agent: { name: "Qualifier", glyph: "Q", autonomy: "Stands down post-meeting", tone: "—" },
    subject: "Verdict — how did the consult go?",
    preview: "Consult ended 11:45 — verdict needed.",
    summary: "IG reel → consult, held 11:00–11:45. Agents stood down at meeting start.",
    contextStrip: [
      { label: "Meeting", value: "Consult · 11:00–11:45" },
      { label: "Est. value", value: "$340" },
      { label: "If ignored", value: "Interested in 48h" },
    ],
    lastAt: "19m", lastAtFull: "11:45",
    unread: true, pinned: false, value: 340,
    tags: ["verdict", "lead"],
    confidence: 1, priority: "P2", hasHumanContact: true,
    verdict: {
      leadId: "ld-gabby", est: 340, apptId: "a-gabby",
      options: [
        { verb: "deal",       label: "Deal created",              sub: "Opens in Pipeline", icon: "deal" },
        { verb: "client",     label: "Became a client",           sub: "Creates the client record", icon: "users" },
        { verb: "interested", label: "No deal — keep interested", sub: "Dormant — inbound reopens it", icon: "eye" },
      ],
    },
    timeline: [
      { type: "event", kind: "booked", at: "Apr 24 · 15:10", body: "Qualifier booked the consult — Tuesday 11:00 with you" },
      { type: "msg", from: "agent", channel: "instagram", at: "Apr 24 · 15:11", body: "You're set for Tuesday at 11:00 with the owner — see you then!" },
      { type: "event", kind: "meeting", at: "11:00", body: "Meeting started — agents stood down" },
      { type: "event", kind: "meeting", at: "11:45", body: "Meeting ended — verdict requested" },
    ],
  },

  // ============ APPROVAL: refund request ============
  {
    id: "th-aisha-refund",
    who: "Aisha Khan",
    whoMeta: "Member · 7 visits · $1,040 LTV",
    avatar: "AK",
    state: "needs",
    clientId: "c-aisha", waitingMin: 42,
    channels: ["phone", "sms"],
    primaryChannel: "phone",
    agent: { name: "Phone Rep", glyph: "P", autonomy: "Asks before $100+", tone: "Empathetic · concise · books when possible" },
    subject: "Refund after second no-show",
    preview: "Aisha is asking for a $120 refund after a second no-show this month…",
    summary: "Aisha messaged 4× across phone & SMS over 6 days. Two no-shows in one week. Just requested a $120 refund.",
    contextStrip: [
      { label: "Next appt", value: "Today 2:45 PM", to: "calendar" },
      { label: "No-shows",   value: "2 this week", warn: true, to: "segments/high-no-show" },
      { label: "Refund history", value: "1 waiver used (Q1)", to: "segments/used-waiver" },
      { label: "Therapist", value: "Lena (regular)" },
    ],
    lastAt: "2m",
    lastAtFull: "11:40",
    unread: true,
    pinned: false,
    value: 1040,
    tags: ["refund", "policy"],
    confidence: 0.62,
    priority: "P1",
    hasHumanContact: true,
    approval: {
      kind: "Refund request · $120",
      policyClass: "money",
      summary: "Second no-show this month. Hold sent — resolution call drafted for 4:30.",
      recommended: "Approve",
      plan: { label: "Resolution call — today 4:30", oneLine: "Hold sent · slot held on your calendar", dollarDelta: 0, ltv: 420, confidence: 0.86, cta: "Book the call" },
      fallback: "acknowledgment sent, no call booked",
      suggestedReply: "Hi Aisha — understood. Refunds are handled by the owner directly; she's free at 4:30 today for a quick call. Should I book it?",
      evidence: [
        { kind: "policy",   label: "Refund policy v4.2 §3.1",       detail: "1 waiver per quarter — used Feb 14", to: "segments/used-waiver" },
        { kind: "policy",   label: "Your guardrail · Multiple no-shows",  detail: "Deposit required before rebooking — set in Autonomy", to: "admin/autonomy" },
        { kind: "case",     label: "Similar case · Maya R · Jan 22", detail: "Owner call resolved — retained" },
        { kind: "case",     label: "Similar case · Brenda L · Mar 8", detail: "Owner call resolved — retained" },
        { kind: "signal",   label: "Churn risk model",                detail: "62% churn if declined flat · 18% after an owner call" },
      ],
      alternatives: [
        { label: "Agent offers a credit or refund", why: "Requires owner — refund policy." },
        { label: "Reply with the policy text",      why: "Impersonal for a $1,040 LTV member." },
        { label: "Wait until you're free to text",  why: "Misses the promised within-the-hour reply." },
      ],
      nextSteps: [
        { label: "Send the call invite + calm hold", auto: true },
        { label: "Hold 4:30 on your calendar", auto: true },
        { label: "Brief you 15 min before the call", auto: false, hint: "LTV, visit history, both no-shows — on your phone at 4:15" },
      ],
    },
    timeline: [
      { type: "msg", from: "client", channel: "phone", at: "Apr 20 · 14:02", body: "Booked a recovery massage for Friday at 4." },
      { type: "msg", from: "agent",  channel: "phone", at: "Apr 20 · 14:02", body: "All set — see you Friday at 4. We'll text a reminder." },
      { type: "event", kind: "no-show", at: "Apr 23 · 16:15", body: "Marked no-show by Front Desk" },
      { type: "msg", from: "client", channel: "sms", at: "Apr 24 · 09:11", body: "Sorry I missed Friday — work emergency. Can I reschedule?" },
      { type: "msg", from: "agent",  channel: "sms", at: "Apr 24 · 09:12", body: "No problem — I see Tuesday 11am open. Want me to book it?" },
      { type: "msg", from: "client", channel: "sms", at: "Apr 24 · 09:14", body: "Yes please" },
      { type: "event", kind: "no-show", at: "Apr 26 · 11:00", body: "Second no-show this week" },
      { type: "msg", from: "client", channel: "phone", at: "11:38", body: "Hey — I think I need a refund. Two no-shows feels like enough penalty." },
      { type: "agent-thinking", at: "11:39", agent: "Phone Rep", body: "Checked policy: one waiver per quarter, she's used it. LTV $1,040. Computing best response…" },
      { type: "agent-decision", at: "11:40", agent: "Phone Rep", body: "Refund request — outside scope. Hold sent; 4:30 slot held." },
      { type: "msg", from: "agent", channel: "phone", at: "11:40", body: "Totally fair to ask — let me check with the owner on the best we can do here. You'll hear back from us within the hour." },
    ],
  },

  // ============ APPROVAL: outside scope (partnership) ============
  {
    id: "th-wellness-partnership",
    who: "@thewellness.co",
    whoMeta: "Instagram · 12.4k followers · No prior contact",
    avatar: "TW",
    state: "needs",
    clientId: null, waitingMin: 12,
    channels: ["instagram"],
    primaryChannel: "instagram",
    agent: { name: "Chat Agent", glyph: "I", autonomy: "Triage only", tone: "Warm · brief · escalates partnerships" },
    subject: "Partnership proposal — outside scope",
    preview: "We'd love to do a giveaway with your studio next month. Can we hop on a call?",
    summary: "Influencer (12k followers) proposed a giveaway. Chat Agent isn't trained for partnerships — flagging for Sarah.",
    contextStrip: [
      { label: "Source",   value: "Instagram DM" },
      { label: "Account",  value: "12.4k followers" },
      { label: "First contact", value: "Yes" },
      { label: "Reach class", value: "Mid-tier", info: true },
    ],
    lastAt: "12m",
    lastAtFull: "11:30",
    unread: true,
    pinned: false,
    value: 0,
    tags: ["partnership", "outside-scope"],
    confidence: 0.4,
    priority: "P2",
    hasHumanContact: false,
    approval: {
      kind: "Outside agent scope",
      summary: "Chat Agent isn't trained for partnerships and wants to escalate.",
      recommended: "Approve",
      plan: { label: "Hand to you — lands in your queue", oneLine: "Best fit — partnership work needs a human", dollarDelta: 0, ltv: 0, confidence: 0.85, cta: "Approve — send to my queue" },
      fallback: "Chat Agent sends a polite pass and closes the thread",
      suggestedReply: "Thanks for reaching out! Partnerships are something Sarah handles directly — she'll be in touch by end of day to set up a call.",
      evidence: [
        { kind: "policy",   label: "Agent scope · Partnerships",    detail: "Chat Agent not authorized" },
        { kind: "case",     label: "Last partnership · @bayareawellness · 5wk ago", detail: "Sarah closed in 1 call" },
        { kind: "signal",   label: "Influencer reach class",        detail: "Mid-tier (10k–50k), warm match for studio audience" },
      ],
      alternatives: [
        { label: "Politely decline",            why: "Closes the door on a ~12k-follower account." },
        { label: "Auto-reply with media kit",   why: "Sets a cold tone for warm prospect." },
        { label: "Schedule on Sarah's calendar", why: "Don't have her availability — needs human." },
      ],
      nextSteps: [
        { label: "Forward thread to Sarah's queue", auto: true },
        { label: "Send acknowledgment to client",   auto: true },
        { label: "Add 'partnership' tag",            auto: true },
      ],
    },
    timeline: [
      { type: "msg", from: "client", channel: "instagram", at: "11:28", body: "Hey! Love what you're doing. We'd love to do a giveaway with your studio next month." },
      { type: "msg", from: "client", channel: "instagram", at: "11:28", body: "Can we hop on a call this week?" },
      { type: "agent-thinking", at: "11:29", agent: "Chat Agent", body: "Detected: partnership inquiry. Not in my scope — flagging for human review." },
      { type: "agent-decision", at: "11:30", agent: "Chat Agent", body: "Escalating to operator. No reply sent yet." },
    ],
  },

  // ============ APPROVAL: discount on package ============
  {
    id: "th-jordan-discount",
    who: "Jordan Patel",
    whoMeta: "Lead · From IG ad · First visit booked",
    avatar: "JP",
    state: "needs",
    clientId: "c-jordan", leadId: "ld-jordan", waitingMin: 26,
    channels: ["sms"],
    primaryChannel: "sms",
    agent: { name: "Phone Rep", glyph: "P", autonomy: "Books calls · quotes list only", tone: "Empathetic · concise · books when possible" },
    subject: "Pricing question — 6-pack, referred by Maya",
    preview: "Friend told me she got 20% off her first package. Can you do that for me?",
    summary: "New lead via Maya's referral. Asked about the 20% rate — intro-call slots drafted.",
    contextStrip: [
      { label: "Source",     value: "IG ad" },
      { label: "Referrer",   value: "Maya R · $1,800 LTV" },
      { label: "Campaign",   value: "Ended Apr 1", warn: true },
      { label: "Lead score", value: "84/100" },
    ],
    lastAt: "28m",
    lastAtFull: "11:14",
    unread: false,
    pinned: false,
    value: 0,
    tags: ["pricing", "new-lead"],
    confidence: 0.82,
    priority: "P2",
    hasHumanContact: false,
    approval: {
      kind: "Pricing question · referral rate",
      policyClass: "money",
      summary: "Asked for Maya's 20% rate. Intro-call slots drafted — Thursday 2:00 / 4:30.",
      recommended: "Approve",
      plan: { label: "Intro call — Thursday 2:00 or 4:30", oneLine: "84/100 fit · referred leads book within 48h", dollarDelta: 0, ltv: 360, confidence: 0.85, cta: "Offer the slots",
        param: { label: "Offer", options: [
          { label: "Both slots", reply: "Hey Jordan — glad Maya sent you! The referral rate is confirmed on a quick intro call. I have Thursday 2:00 or 4:30 — want one?" },
          { label: "Thu 2:00",   reply: "Hey Jordan — glad Maya sent you! The referral rate is confirmed on a quick intro call. Thursday 2:00 is open — shall I lock it in?" },
          { label: "Thu 4:30",   reply: "Hey Jordan — glad Maya sent you! The referral rate is confirmed on a quick intro call. Thursday 4:30 is open — shall I lock it in?" },
        ] } },
      fallback: "list pricing sent, no call offered",
      suggestedReply: "Hey Jordan — glad Maya sent you! The referral rate is confirmed on a quick intro call. I have Thursday 2:00 or 4:30 — want one?",
      evidence: [
        { kind: "policy", label: "Pricing exception · Member referrals", detail: "Allowed up to 25% on member-referred new leads" },
        { kind: "case",   label: "Similar case · Maya R origin",         detail: "20% honored — $1,800 LTV outcome" },
        { kind: "signal", label: "Lead score model",                     detail: "84/100 — books within 48h" },
      ],
      alternatives: [
        { label: "Quote 20% off directly",        why: "Requires owner — rate exceptions." },
        { label: "Send the price sheet and wait", why: "Cold quotes book at 30%." },
      ],
      nextSteps: [
        { label: "Send both slots + hold them 24h", auto: true },
        { label: "Tag both Jordan and Maya as 'referral'", auto: true },
        { label: "Brief you before the call", auto: false, hint: "Maya's history + the referral-rate question" },
      ],
    },
    timeline: [
      { type: "event", kind: "lead-source", at: "Apr 25 · 18:22", body: "New lead from Instagram ad — 'New Client 20% Off' campaign" },
      { type: "msg", from: "client", channel: "sms", at: "Apr 25 · 18:24", body: "Hi! My friend Maya told me about your studio." },
      { type: "msg", from: "agent",  channel: "sms", at: "Apr 25 · 18:24", body: "Welcome Jordan! What brings you in?" },
      { type: "msg", from: "client", channel: "sms", at: "Apr 25 · 18:26", body: "Looking to start regular massage. She said you have packages." },
      { type: "msg", from: "agent",  channel: "sms", at: "Apr 25 · 18:27", body: "Yes — our 6-pack is $450, works out to $75 per session. Want me to book your first one to try us out?" },
      { type: "msg", from: "client", channel: "sms", at: "Apr 26 · 11:10", body: "Friend told me she got 20% off her first package. Can you do that for me?" },
      { type: "agent-thinking", at: "11:13", agent: "Phone Rep", body: "Rate exception — owner-quoted. Finding intro-call slots…" },
      { type: "agent-decision", at: "11:14", agent: "Phone Rep", body: "Intro-call offer drafted — Thursday 2:00 / 4:30 held 24h." },
    ],
  },

  // ============ APPROVAL: booking conflict (two agents, one slot) ============
  {
    id: "th-booking-conflict",
    who: "Tara Ellis",
    whoMeta: "New · online form · no history",
    avatar: "TE",
    state: "needs",
    clientId: null, waitingMin: 4,
    channels: ["mail"],
    primaryChannel: "mail",
    agent: { name: "SMS Agent", glyph: "S", autonomy: "Escalates double-bookings", tone: "Friendly · short · never pushy" },
    subject: "Double-booking — Lena 1:00 PM today",
    preview: "The online form booked Tara into a slot Lena already holds.",
    summary: "Tara's online booking landed on Lena at 1:00 — already held for Jordan Patel. SMS Agent stopped rather than double-book, and needs you to place her.",
    contextStrip: [
      { label: "Contested slot", value: "Lena · 1:00 PM" },
      { label: "Already holds",  value: "Jordan Patel" },
      { label: "Jay",           value: "Open at 1:00" },
      { label: "Tara",          value: "New · via form" },
    ],
    lastAt: "4m",
    lastAtFull: "12:00",
    unread: true,
    pinned: false,
    value: 0,
    tags: ["booking", "conflict"],
    confidence: 0.72,
    priority: "P2",
    hasHumanContact: false,
    approval: {
      kind: "Booking conflict · Lena 1:00",
      summary: "Two agents booked the same therapist and time. Someone has to move.",
      recommended: "Approve",
      plan: { label: "Tara → Jay, 1:00 today", oneLine: "Both keep 1:00 · Jay is open · nobody waits", dollarDelta: 0, ltv: 95, confidence: 0.86, cta: "Approve — move Tara to Jay" },
      fallback: "SMS Agent offers Tara the next open Lena slots instead",
      suggestedReply: "Hi Tara — you're all set for a Swedish 60 at 1:00 today. You'll be with Jay, one of our senior therapists. See you soon!",
      evidence: [
        { kind: "policy", label: "No double-booking", detail: "One therapist, one client per slot — agents must escalate", to: "admin/autonomy" },
        { kind: "case",   label: "Lena · 1:00 held",  detail: "Jordan Patel — pending pricing question", to: "calendar/a-jordan" },
        { kind: "signal", label: "Jay · 1:00 open",   detail: "Free this hour — same-time reassignment, no client waits" },
      ],
      alternatives: [
        { label: "Move Tara to Jay at 1:00",     why: "Already chosen — nobody waits, nobody's discount is touched." },
        { label: "Keep Tara with Lena at 3:00",  why: "Lower fit — makes a brand-new lead wait two hours." },
      ],
      nextSteps: [
        { label: "Book Tara with Jay at 1:00", auto: true },
        { label: "Text Tara the therapist change", auto: true },
        { label: "Leave Jordan's 1:00 untouched", auto: true },
      ],
    },
    timeline: [
      { type: "event", kind: "lead-source", at: "12:00", body: "Online form submitted — Swedish 60, first available today" },
      { type: "agent-thinking", at: "12:03", agent: "SMS Agent", body: "Best match is Lena 1:00 — but that slot already holds Jordan Patel (pending). Won't double-book." },
      { type: "agent-decision", at: "12:04", agent: "SMS Agent", body: "Paused. Jay is open at 1:00 — escalating so you choose who moves." },
    ],
  },

  // ============ WATCHING ============
  {
    id: "th-maya-recovery",
    who: "Maya Rodriguez",
    whoMeta: "Member · 23 visits · $1,800 LTV · VIP",
    avatar: "MR",
    state: "watching",
    clientId: "c-maya",
    channels: ["sms"],
    primaryChannel: "sms",
    agent: { name: "Phone Rep", glyph: "P", autonomy: "Auto-handles routine", tone: "Empathetic · concise · books when possible" },
    subject: "Rescheduling Friday session",
    preview: "Phone Rep moved her Friday 2pm → Saturday 11am. Client confirmed.",
    summary: "Auto-rescheduled Maya from Fri 2pm → Sat 11am with same therapist. She confirmed.",
    contextStrip: [
      { label: "Member since", value: "2023" },
      { label: "Visits",       value: "23 · $1,800 LTV" },
      { label: "Reschedules",  value: "3rd this quarter" },
    ],
    lastAt: "5m",
    lastAtFull: "11:37",
    unread: false,
    pinned: false,
    value: 1800,
    tags: ["reschedule", "vip"],
    confidence: 0.94,
    priority: "P3",
    hasHumanContact: true,
    timeline: [
      { type: "msg", from: "client", channel: "sms", at: "11:33", body: "Hey, can I move Friday 2pm to Saturday morning?" },
      { type: "agent-thinking", at: "11:34", agent: "Phone Rep", body: "Saturday 11am open with same therapist. High-confidence routine reschedule." },
      { type: "msg", from: "agent",  channel: "sms", at: "11:35", body: "Done — Saturday 11am with Lena, same as before. Confirmation sent." },
      { type: "msg", from: "client", channel: "sms", at: "11:37", body: "Perfect, thank you!" },
      { type: "agent-decision", at: "11:37", agent: "Phone Rep", body: "Closed thread — auto-handled, no escalation needed." },
    ],
  },

  {
    id: "th-noah-nurture",
    who: "Noah Williams",
    whoMeta: "Lead · 14 days cold",
    avatar: "NW",
    state: "watching",
    channels: ["mail"],
    primaryChannel: "mail",
    agent: { name: "Email Agent", glyph: "E", autonomy: "Nurture sequence", tone: "Friendly · low-pressure · helpful" },
    subject: "Day-14 nurture: 'Still thinking about it?'",
    preview: "Email Agent sent the day-14 follow-up. Open recorded.",
    summary: "Day-14 nurture email auto-sent. Opened on iPhone, no click yet.",
    contextStrip: [
      { label: "Lead age", value: "14 days" },
      { label: "Sequence", value: "Day 14 / 21" },
      { label: "Engagement", value: "1 open · 0 clicks" },
    ],
    lastAt: "1h",
    lastAtFull: "10:45",
    unread: false,
    pinned: false,
    value: 0,
    tags: ["nurture", "lead"],
    confidence: 0.81,
    priority: "P3",
    hasHumanContact: false,
    timeline: [
      { type: "event", kind: "sent", at: "10:30", body: "Day-14 nurture email sent" },
      { type: "event", kind: "opened", at: "10:45", body: "Email opened on iPhone" },
    ],
  },

  // ============ VETO WINDOW: safe draft on a countdown ============
  {
    id: "th-veto-kayla",
    who: "Kayla Brooks",
    whoMeta: "Lead · pricing question",
    avatar: "KB",
    state: "drafts",
    channels: ["sms"], primaryChannel: "sms",
    agent: { name: "SMS Agent", glyph: "S", autonomy: "Veto window · 45s", tone: "Warm · concise" },
    subject: "Pricing question — 60-min deep tissue",
    preview: "Draft auto-sends in 45s unless edited.",
    summary: "List-price question · 0.92 confidence. Sends after the veto window unless edited or held.",
    contextStrip: [
      { label: "Confidence", value: "0.92" },
      { label: "Risk class", value: "Safe · info only" },
      { label: "Mode", value: "Veto window" },
    ],
    lastAt: "now", lastAtFull: "12:03",
    unread: true, pinned: false, value: 0,
    tags: ["lead", "pricing"],
    confidence: 0.92, priority: "P3", hasHumanContact: false,
    veto: { policyClass: "reply", window: 45, draft: "Hi Kayla! A 60-min deep tissue is $120, or $95/session in the 6-pack. Want me to hold a spot this week?" },
    timeline: [
      { type: "msg", from: "client", channel: "sms", at: "12:03", body: "Hi — how much is a 60 minute deep tissue?" },
      { type: "agent-thinking", at: "12:03", agent: "SMS Agent", body: "List price — in scope, 0.92. Veto window: 45s." },
    ],
  },

  {
    id: "th-veto-marcus",
    who: "Marcus Webb",
    whoMeta: "Lead · hours question",
    avatar: "MW",
    state: "drafts",
    channels: ["sms"], primaryChannel: "sms",
    agent: { name: "SMS Agent", glyph: "S", autonomy: "Veto window · 90s", tone: "Warm · concise" },
    subject: "Hours question — Saturday availability",
    preview: "Draft auto-sends in 90s unless edited.",
    summary: "Hours question · 0.95 confidence. Sends after the veto window unless edited or held.",
    contextStrip: [
      { label: "Confidence", value: "0.95" },
      { label: "Risk class", value: "Safe · info only" },
      { label: "Mode", value: "Veto window" },
    ],
    lastAt: "now", lastAtFull: "12:04",
    unread: true, pinned: false, value: 0,
    tags: ["lead", "hours"],
    confidence: 0.95, priority: "P3", hasHumanContact: false,
    veto: { policyClass: "reply", window: 90, draft: "We're open 9–7 weekdays and 9–5 Saturday. Want me to find you a Saturday slot?" },
    timeline: [
      { type: "msg", from: "client", channel: "sms", at: "12:04", body: "Are you open Saturdays?" },
      { type: "agent-thinking", at: "12:04", agent: "SMS Agent", body: "Hours — in scope, 0.95. Veto window: 90s." },
    ],
  },

  // ============ DRAFT ============
  {
    id: "th-elena-followup",
    who: "Elena Park",
    whoMeta: "Member · Last visit 38 days ago",
    avatar: "EP",
    state: "drafts",
    clientId: null, waitingMin: 8,
    channels: ["sms"],
    primaryChannel: "sms",
    agent: { name: "Recovery Agent", glyph: "X", autonomy: "Drafts only", tone: "Warm · low-pressure · offer-driven" },
    subject: "Win-back draft ready",
    preview: "Hi Elena — it's been a few weeks. We have a 30%-off return offer if you book this week…",
    summary: "Win-back triggered (30+ days). Recovery Agent drafted a 30%-off return offer for your review.",
    contextStrip: [
      { label: "Member tier", value: "Active" },
      { label: "Last visit",  value: "38 days ago", warn: true },
      { label: "Pref",        value: "Deep tissue" },
    ],
    lastAt: "10m",
    lastAtFull: "11:32",
    unread: false,
    pinned: false,
    value: 720,
    tags: ["win-back", "draft"],
    confidence: 0.7,
    priority: "P3",
    hasHumanContact: true,
    approval: {
      kind: "Win-back message",
      policyClass: "reengage",
      summary: "38 days inactive. Offer-free check-in drafted — no discount campaign active.",
      recommended: "Approve",
      plan: { label: "Send the offer-free check-in as drafted", oneLine: "Re-opens the thread · books direct or offers a quick call", dollarDelta: 0, ltv: 305, confidence: 0.42, cta: "Approve & send" },
      fallback: "Recovery Agent skips Elena and closes out the sequence",
      suggestedReply: "Hi Elena — it's been a few weeks since your last deep tissue and Lena has openings this week. Want me to set one up, or a quick call first if anything's changed?",
      evidence: [
        { kind: "case",   label: "Win-back cohort · last 90 days", detail: "42% re-book after a personal check-in" },
        { kind: "signal", label: "Last service preference",        detail: "Deep tissue · Lena · 4× repeat" },
      ],
      alternatives: [
        { label: "Skip this client",          why: "Pulls Elena from the sequence · −$720 expected LTV." },
        { label: "Add a 30% win-back offer",  why: "No active campaign approval." },
        { label: "Wait another week",         why: "Cohort re-engagement drops sharply past 45 days." },
      ],
      nextSteps: [
        { label: "Send SMS",                  auto: true },
        { label: "Snooze thread until reply", auto: true },
        { label: "Offer call slots if she replies unsure", auto: true },
      ],
    },
    timeline: [
      { type: "event", kind: "trigger", at: "11:30", body: "Triggered: 30+ day inactivity, member tier" },
      { type: "agent-thinking", at: "11:31", agent: "Recovery Agent", body: "Pulled win-back template, customized for last-service preference (deep tissue)." },
      { type: "agent-decision", at: "11:32", agent: "Recovery Agent", body: "Draft ready for review." },
    ],
  },

  // ============ ESCALATED ============
  {
    id: "th-david-complaint",
    who: "David Chen",
    whoMeta: "Member · 4 visits · $480 LTV",
    avatar: "DC",
    state: "escalated",
    clientId: "c-david-chen", waitingMin: 58,
    channels: ["mail", "phone"],
    primaryChannel: "mail",
    agent: { name: "Chat Agent", glyph: "I", autonomy: "Hands off complaints", tone: "Warm · brief · escalates partnerships" },
    subject: "Service complaint — therapist behavior",
    preview: "Client emailed about an uncomfortable interaction with therapist Lena last Tuesday.",
    summary: "Sensitive complaint about a therapist. Chat Agent didn't reply — needs human voice.",
    contextStrip: [
      { label: "Sensitivity", value: "HR-flagged", warn: true },
      { label: "Visits",      value: "4" },
      { label: "Therapist",   value: "Lena" },
    ],
    lastAt: "45m",
    lastAtFull: "10:57",
    unread: true,
    pinned: true,
    value: 480,
    tags: ["complaint", "hr-sensitive"],
    confidence: 0.2,
    priority: "P1",
    hasHumanContact: true,
    timeline: [
      { type: "msg", from: "client", channel: "mail", at: "10:42", body: "I had a very uncomfortable experience with Lena on Tuesday. I don't want to go into detail over email but I think you should know." },
      { type: "agent-thinking", at: "10:55", agent: "Chat Agent", body: "Detected: HR-sensitive complaint. Out of scope — escalating immediately." },
      { type: "agent-decision", at: "10:57", agent: "Chat Agent", body: "Escalated to Sarah. No reply drafted; this needs a human voice." },
    ],
  },
];

function agentActivityFor(thread) {
  if (!thread || !thread.timeline) return [];
  return thread.timeline.filter((e) => e.type === "agent-thinking" || e.type === "agent-decision");
}

const CHANNEL_LABELS = {
  phone: "Phone",
  sms: "SMS",
  mail: "Email",
  chat: "Chat",
  instagram: "Instagram",
};


// =============== SESSION DECISION STORE ===============
// Shared across Inbox, Tasks, and the shell badge. Decisions made anywhere
// overlay THREADS for the rest of the session and broadcast two events:
//   inbox:decisions — something changed, re-render
//   inbox:counts    — { needs } for the sidebar badge
// ---- Veto-window helpers (shared: Inbox strip + Today rail) ----
// VW_STORE holds per-thread countdown state; these helpers own seed/read/hold.
// The presence rule (Away freezes every countdown) lives HERE so it applies on
// every surface, not just when Inbox is mounted.
const VW_UTIL = {
  store() { return (window.VW_STORE = window.VW_STORE || { state: {} }); },
  seed(threads) {
    const VW = this.store();
    (threads || []).forEach((t) => {
      // Real threads are skipped: their countdown belongs to a scheduled job,
      // and this store simulates one. Seeding both would put two clocks on the
      // same draft, disagreeing about when the customer hears from us.
      if (t.real) return;
      if (t.veto && !VW.state[t.id] && !(window.IX_STORE && window.IX_STORE.get(t.id))) {
        VW.state[t.id] = (!window.__DEMO_MODE || (window.PR_STORE && window.PR_STORE.away))
          ? { frozen: (t.veto.window || 30) * 1000 } // outside demo: countdowns render frozen, never auto-send
          : { endsAt: Date.now() + (t.veto.window || 30) * 1000 };
      }
    });
  },
  remaining(id) {
    const s = this.store().state[id];
    if (!s || s.held || s.sent) return null;
    if (s.frozen != null) return Math.ceil(s.frozen / 1000);
    if (!s.endsAt) return null;
    return Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
  },
  holdAll(ids) {
    const VW = this.store();
    (ids || []).forEach((id) => { const s = VW.state[id] || (VW.state[id] = {}); if (!s.sent) s.held = true; });
  },
  onPresence() {
    const away = window.PR_STORE && window.PR_STORE.away;
    Object.values(this.store().state).forEach((s) => {
      if (s.held || s.sent) return;
      if (away && s.endsAt) { s.frozen = Math.max(0, s.endsAt - Date.now()); delete s.endsAt; }
      else if (!away && s.frozen != null) { s.endsAt = Date.now() + s.frozen; delete s.frozen; }
    });
  },
};
window.VW_UTIL = VW_UTIL;
window.addEventListener("presence:changed", () => VW_UTIL.onPresence());

const IX_STORE = {
  decisions: {},   // threadId -> { action, at, declined?, kind: "decided" | "snoozed", wake? }
  _broadcast() {
    const needs = THREADS.filter((t) => t.state === "needs" && !this.decisions[t.id]).length;
    window.dispatchEvent(new CustomEvent("inbox:decisions"));
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs } }));
  },
  set(threadId, rec) { this.decisions[threadId] = rec; this._broadcast(); },
  clear(threadId) { delete this.decisions[threadId]; this._broadcast(); },
  get(threadId) { return this.decisions[threadId] || null; },
};
window.IX_STORE = IX_STORE;

// Scripted concurrent change — one thread mutates while you're reading it, to
// exercise stale-view reconciliation (no real-time backend in this build). The
// timer arms when you OPEN the thread and fires once; the view never silently
// overwrites — it offers a Refresh banner (pages/inbox.jsx).
const IX_CONCURRENT = {
  "th-noah-nurture": {
    afterMs: 11000,
    by: "Noah Williams",
    note: "replied to the nurture email",
    append: [
      { type: "event", kind: "opened", at: "12:03", body: "Reply received while you were reading" },
      { type: "msg", from: "client", channel: "mail", at: "12:04", body: "Actually — do you have anything Saturday morning? Been meaning to come back in." },
    ],
  },
};
window.IX_CONCURRENT = IX_CONCURRENT;

const INBOX_BASELINE = { doneThisWeek: 48 }; // resolved before the visible list

window.INBOX_DATA = {
  INBOX_BASELINE,
  INBOX_BUCKETS,
  INBOX_VIEWS,
  THREADS,
  CHANNEL_LABELS,
  agentActivityFor,
};
