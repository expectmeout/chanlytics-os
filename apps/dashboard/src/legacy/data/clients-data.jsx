/* global window */
// Chanlytics — Clients seed data
// 60 clients (representative slice of a 200-person book). Each carries:
//   - identity, money, package, last visit, channels, tags, therapist
//   - relationship temperature (0..1: cold..warm)
//   - bucket: needs-you | drifting | champion | new | steady
//   - agentActivity: what an agent is currently doing for them (or null)
//   - narrative: one-line agent-written summary of where things stand
//   - signals: micro-tags (e.g. "used waiver", "referred Maya", "second no-show")

const TODAY = "Apr 26";

const CLIENTS = [
  // ============ NEEDS YOU (agents flagged for human judgment) ============
  {
    id: "c-aisha", name: "Aisha Khan", initials: "AK",
    bucket: "needs-you", priority: "P1", temp: 0.34,
    ltv: 1040, lifetimeSpend: 1040, packageBalance: 0, sessionsLeft: 0,
    visits: 7, lastVisit: "Apr 16", lastContact: "today · 11:38",
    primaryChannel: "phone", channels: ["phone", "sms"],
    therapist: "Lena Park", joinedDays: 142, source: "Friend referral",
    tags: ["regular", "high-value"],
    signals: ["2nd no-show this week", "asking refund", "used Q1 waiver"],
    narrative: "Asking for a $120 refund after her second no-show this week. She's a 7-visit regular and used her one quarterly waiver in Q1.",
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Awaiting your call", status: "approval", since: "11:40" },
    nextWith: "You — approve refund decision",
    threadCount: 1,
    why: "Refund above $100 always asks operator",
  },
  {
    id: "c-thewellness", name: "@thewellness.co", initials: "TW",
    bucket: "needs-you", priority: "P2", temp: 0.55,
    ltv: 0, lifetimeSpend: 0, packageBalance: 0, sessionsLeft: 0,
    visits: 0, lastVisit: "—", lastContact: "12m ago",
    primaryChannel: "instagram", channels: ["instagram"],
    therapist: "—", joinedDays: 0, source: "Instagram",
    tags: ["partnership", "outside-scope"],
    signals: ["partnership inquiry", "wants giveaway"],
    narrative: "Local wellness studio reached out about a co-branded giveaway. Out of agent scope — flagged for your review.",
    agentActivity: { agent: "Chat Agent", glyph: "I", verb: "Escalated to you", status: "escalated", since: "11:30" },
    nextWith: "You — partnership decision",
    threadCount: 1,
    why: "Partnership requests aren't in agent scope",
  },
  {
    id: "c-david-chen", name: "David Chen", initials: "DC", nextAppt: "Fri 4:00 · held, unconfirmed",
    bucket: "needs-you", priority: "P2", temp: 0.42,
    ltv: 720, lifetimeSpend: 720, packageBalance: 1, sessionsLeft: 1,
    visits: 5, lastVisit: "Apr 4", lastContact: "Apr 18",
    primaryChannel: "sms", channels: ["sms", "phone"],
    therapist: "Lena Park", joinedDays: 88, source: "Google",
    tags: ["sensitive"],
    signals: ["service complaint", "HR-flagged", "won't email-detail"],
    narrative: "Filed a discomfort complaint about a session with Lena. Won't elaborate over email — wants a human voice.",
    agentActivity: { agent: "Chat Agent", glyph: "I", verb: "Held — sensitive", status: "escalated", since: "10:57" },
    nextWith: "You — call Elena",
    threadCount: 1,
    why: "Service complaints always paused for human",
  },

  // ============ DRIFTING (agents trying to recover) ============
  {
    id: "c-marcus", name: "Marcus Lee", initials: "ML",
    bucket: "drifting", priority: "P2", temp: 0.28,
    ltv: 1280, lifetimeSpend: 1280, packageBalance: 2, sessionsLeft: 2,
    visits: 11, lastVisit: "Mar 8", lastContact: "Apr 19",
    primaryChannel: "sms", channels: ["sms", "instagram"],
    therapist: "Jay Rivera", joinedDays: 312, source: "Friend referral",
    tags: ["regular", "lapsed"],
    signals: ["49 days since visit", "ignored 2 nudges", "had 2 sessions left"],
    narrative: "Was a steady twice-monthly. Hasn't booked in 7 weeks. Said 'maybe next week' on Apr 19 — Recovery Agent has one nudge left in the sequence.",
    agentActivity: { agent: "Recovery Agent", glyph: "X", verb: "Nudge queued for tomorrow 11am", status: "scheduled" },
    nextWith: "Recovery Agent — last sequence step",
    threadCount: 2,
    why: "",
  },
  {
    id: "c-priya", name: "Priya Shah", initials: "PS",
    bucket: "drifting", priority: "P3", temp: 0.31,
    ltv: 540, lifetimeSpend: 540, packageBalance: 0, sessionsLeft: 0,
    visits: 4, lastVisit: "Feb 22", lastContact: "Apr 2",
    primaryChannel: "email", channels: ["email"],
    therapist: "Lena Park", joinedDays: 198, source: "Yelp",
    tags: ["lapsed"],
    signals: ["63 days since visit", "returns today 2:45pm", "no-show risk"],
    narrative: "Bought a 4-pack last fall, hasn't returned since February. Email Agent sent a 30%-off return offer; no response yet.",
    agentActivity: { agent: "Email Agent", glyph: "E", verb: "Awaiting reply (Apr 2 send)", status: "in-flight" },
    nextWith: "Email Agent — second touch on Apr 30",
    threadCount: 1,
    why: "",
  },
  {
    id: "c-david", name: "David Okafor", initials: "DO",
    bucket: "drifting", priority: "P3", temp: 0.36,
    ltv: 880, lifetimeSpend: 880, packageBalance: 1, sessionsLeft: 1,
    visits: 8, lastVisit: "Mar 19", lastContact: "Apr 14",
    primaryChannel: "sms", channels: ["sms", "phone"],
    therapist: "Jay Rivera", joinedDays: 245, source: "Walked in",
    tags: ["regular", "drifting"],
    signals: ["38 days since visit", "1 session unredeemed"],
    narrative: "Has 1 session left from his last package — at risk of expiring May 19. SMS Agent reminded him on the 14th, no booking yet.",
    agentActivity: { agent: "SMS Agent", glyph: "S", verb: "Pkg expiry reminder sent Apr 14", status: "in-flight" },
    nextWith: "SMS Agent — final reminder May 12",
    threadCount: 1,
    why: "",
  },
  {
    id: "c-yuki", name: "Yuki Tanaka", initials: "YT",
    bucket: "drifting", priority: "P3", temp: 0.4,
    ltv: 1620, lifetimeSpend: 1620, packageBalance: 0, sessionsLeft: 0,
    visits: 14, lastVisit: "Mar 26", lastContact: "Apr 22",
    primaryChannel: "email", channels: ["email", "sms"],
    therapist: "Lena Park", joinedDays: 412, source: "Friend referral",
    tags: ["regular", "VIP"],
    signals: ["VIP", "30 days since visit"],
    narrative: "Was a monthly VIP for over a year. Replied 'busy with travel' on Apr 22 — Recovery Agent paused outreach until May 1.",
    agentActivity: { agent: "Recovery Agent", glyph: "X", verb: "Paused per client request", status: "paused" },
    nextWith: "Recovery Agent — resume May 1",
    threadCount: 2,
    why: "",
  },
  {
    id: "c-amelia", name: "Amelia Brooks", initials: "AB",
    bucket: "drifting", priority: "P3", temp: 0.33,
    ltv: 460, lifetimeSpend: 460, packageBalance: 0, sessionsLeft: 0,
    visits: 4, lastVisit: "Feb 9", lastContact: "Mar 15",
    primaryChannel: "sms", channels: ["sms"],
    therapist: "Jay Rivera", joinedDays: 156, source: "Instagram ad",
    tags: ["lapsed"],
    signals: ["76 days since visit", "ghosted 1 follow-up"],
    narrative: "Did 4 visits in late winter then went quiet. SMS Agent has tried twice — last attempt 6 weeks ago.",
    agentActivity: { agent: "Recovery Agent", glyph: "X", verb: "On cold-list — manual review needed", status: "stalled" },
    nextWith: "You — keep nudging or archive",
    threadCount: 1,
    why: "",
  },

  // ============ CHAMPIONS (high LTV, healthy, agents on cruise) ============
  {
    id: "c-jordan", name: "Jordan Patel", initials: "JP", nextAppt: "Sat 11:00 · Couples 90 (hold)",
    bucket: "champion", priority: "P1", temp: 0.92,
    ltv: 0, lifetimeSpend: 0, packageBalance: 0, sessionsLeft: 0,
    visits: 0, lastVisit: "—", lastContact: "28m ago",
    primaryChannel: "sms", channels: ["sms"],
    therapist: "—", joinedDays: 1, source: "Maya (referral)",
    tags: ["new-lead", "referred"],
    signals: ["referred by Maya (VIP)", "asking 20% off"],
    narrative: "New lead via Maya (VIP, $1,800 LTV). Asking for the 20% discount Maya got — campaign ended Apr 1. Phone Rep drafted approval.",
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Drafting approval", status: "approval", since: "11:14" },
    nextWith: "You — his pricing question (intro call)",
    threadCount: 1,
    why: "Referred by Maya — pricing questions route to you",
  },
  {
    id: "c-maya", name: "Maya Rodriguez", initials: "MC", nextAppt: "Thu 3:00 · Deep tissue 60",
    bucket: "champion", priority: "P1", temp: 0.95,
    ltv: 1800, lifetimeSpend: 1800, packageBalance: 4, sessionsLeft: 4,
    visits: 18, lastVisit: "Apr 22", lastContact: "Apr 22",
    primaryChannel: "sms", channels: ["sms", "phone"],
    therapist: "Lena Park", joinedDays: 502, source: "Walked in",
    tags: ["VIP", "regular", "advocate"],
    signals: ["referred Jordan today", "20% retention bonus tier", "VIP"],
    narrative: "18 visits in 16 months, just referred Jordan. Auto-rebooks every 2 weeks. Phone Rep handled her last reschedule with no friction.",
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Auto-rescheduled Fri→Sat", status: "completed", since: "11:35" },
    nextWith: "Nothing — happy on cruise",
    threadCount: 1,
    why: "",
  },
  {
    id: "c-amy", name: "Amy Goldberg", initials: "AG", nextAppt: "Tue 11:00 · Hot stone 90",
    bucket: "champion", priority: "P2", temp: 0.88,
    ltv: 2240, lifetimeSpend: 2240, packageBalance: 6, sessionsLeft: 6,
    visits: 22, lastVisit: "Apr 25", lastContact: "Apr 25",
    primaryChannel: "phone", channels: ["phone", "email"],
    therapist: "Lena Park", joinedDays: 684, source: "Friend referral",
    tags: ["VIP", "regular"],
    signals: ["VIP", "weekly cadence"],
    narrative: "Weekly for 22 months. Just bought a 12-pack. Doesn't need anything from us.",
    agentActivity: null,
    nextWith: "Phone Rep — birthday in 11 days",
    threadCount: 0,
    why: "",
  },
  {
    id: "c-rashid", name: "Rashid Ahmed", initials: "RA", nextAppt: "Fri 2:00 · Deep tissue 60",
    bucket: "champion", priority: "P2", temp: 0.83,
    ltv: 1450, lifetimeSpend: 1450, packageBalance: 3, sessionsLeft: 3,
    visits: 13, lastVisit: "Apr 21", lastContact: "Apr 21",
    primaryChannel: "sms", channels: ["sms"],
    therapist: "Jay Rivera", joinedDays: 388, source: "Google",
    tags: ["regular"],
    signals: ["bi-weekly", "Jay-loyal"],
    narrative: "Bi-weekly with Jay for over a year. Last pkg purchase Apr 1.",
    agentActivity: { agent: "SMS Agent", glyph: "S", verb: "Birthday offer queued May 12", status: "scheduled" },
    nextWith: "SMS Agent — birthday SMS",
    threadCount: 0,
    why: "",
  },
  {
    id: "c-sophie", name: "Sophie Martin", initials: "SM", nextAppt: "Wed 5:30 · Swedish 60",
    bucket: "champion", priority: "P2", temp: 0.86,
    ltv: 1920, lifetimeSpend: 1920, packageBalance: 5, sessionsLeft: 5,
    visits: 17, lastVisit: "Apr 19", lastContact: "Apr 24",
    primaryChannel: "email", channels: ["email", "sms"],
    therapist: "Lena Park", joinedDays: 540, source: "Yelp",
    tags: ["VIP", "advocate"],
    signals: ["wrote 5⭐ review", "VIP"],
    narrative: "Wrote a five-star review last week. Currently on a 6-pack with 5 left.",
    agentActivity: { agent: "Email Agent", glyph: "E", verb: "Thank-you reply queued", status: "scheduled" },
    nextWith: "Email Agent — review thank-you",
    threadCount: 0,
    why: "",
  },

  // ============ NEW (just joined, agents qualifying) ============
  {
    id: "c-claire", name: "Claire Dubois", initials: "CD", nextAppt: "Sat 10:00 · Swedish 60",
    bucket: "new", priority: "P3", temp: 0.7,
    ltv: 75, lifetimeSpend: 75, packageBalance: 0, sessionsLeft: 0,
    visits: 1, lastVisit: "Apr 24", lastContact: "Apr 24",
    primaryChannel: "sms", channels: ["sms"],
    therapist: "Jay Rivera", joinedDays: 8, source: "Walked in",
    tags: ["new-client"],
    signals: ["1st visit done", "no pkg yet"],
    narrative: "First visit on the 24th. Qualifier Agent asked about package interest — no reply yet.",
    agentActivity: { agent: "Qualifier", glyph: "Q", verb: "Awaiting package interest reply", status: "in-flight" },
    nextWith: "Qualifier — follow up Apr 28",
    threadCount: 1,
    why: "",
  },
  {
    id: "c-tom", name: "Tom Reilly", initials: "TR",
    bucket: "new", priority: "P3", temp: 0.65,
    ltv: 85, lifetimeSpend: 85, packageBalance: 0, sessionsLeft: 0,
    visits: 1, lastVisit: "Oct 12", lastContact: "Apr 25",
    primaryChannel: "email", channels: ["email"],
    therapist: "Jay Rivera", joinedDays: 196, source: "Google ad",
    tags: ["new-lead"],
    signals: ["asked pricing", "visited once · Oct"],
    narrative: "One visit with Jay last October, then went quiet. Resurfaced yesterday asking about pricing — Email Agent sent the new-client offer; the open lead is the same person (match on email).",
    agentActivity: { agent: "Email Agent", glyph: "E", verb: "Awaiting reply", status: "in-flight" },
    nextWith: "Email Agent — follow up Apr 29",
    threadCount: 1,
    why: "",
  },
  {
    id: "c-natalie", name: "Natalie Perez", initials: "NP", nextAppt: "Tue 4:15 · Prenatal 60",
    bucket: "new", priority: "P3", temp: 0.78,
    ltv: 150, lifetimeSpend: 150, packageBalance: 0, sessionsLeft: 0,
    visits: 2, lastVisit: "Apr 23", lastContact: "Apr 23",
    primaryChannel: "sms", channels: ["sms", "instagram"],
    therapist: "Lena Park", joinedDays: 14, source: "Instagram ad",
    tags: ["new-client", "considering-pkg"],
    signals: ["2nd visit done", "asked about packages"],
    narrative: "Two singles in two weeks, both with Lena. Asked about package pricing yesterday — Phone Rep sent the 6-pack option.",
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Pkg pitch sent", status: "in-flight" },
    nextWith: "Phone Rep — follow up Apr 28",
    threadCount: 1,
    why: "",
  },

  // ============ STEADY (everyone else, lots of fill rows for the table) ============
  { id: "c-rivera", name: "Sam Rivera", initials: "SR", bucket: "steady", priority: "P3", temp: 0.7, ltv: 600, packageBalance: 4, sessionsLeft: 4, visits: 6, lastVisit: "Apr 12", lastContact: "Apr 12", primaryChannel: "sms", channels:["sms"], therapist: "Jay Rivera", joinedDays: 120, source: "Friend", tags:["regular"], signals:[], narrative: "Steady bi-weekly.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-park", name: "Hannah Park", initials: "HP", bucket: "steady", priority: "P3", temp: 0.68, ltv: 825, packageBalance: 3, sessionsLeft: 3, visits: 9, lastVisit: "Apr 18", lastContact: "Apr 18", primaryChannel: "email", channels:["email"], therapist: "Lena Park", joinedDays: 220, source: "Yelp", tags:["regular"], signals:[], narrative: "Monthly cadence, no issues.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-bell", name: "Theo Bell", initials: "TB", bucket: "steady", priority: "P3", temp: 0.6, ltv: 380, packageBalance: 2, sessionsLeft: 2, visits: 3, lastVisit: "Apr 8", lastContact: "Apr 9", primaryChannel: "sms", channels:["sms"], therapist: "Jay Rivera", joinedDays: 60, source: "Walked in", tags:[], signals:[], narrative: "New-ish, on a 4-pack.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-chen", name: "Lin Chen", initials: "LC", nextAppt: "Mon 10:00 · Swedish 60", bucket: "steady", priority: "P3", temp: 0.72, ltv: 1100, packageBalance: 1, sessionsLeft: 1, visits: 12, lastVisit: "Apr 20", lastContact: "Apr 20", primaryChannel: "sms", channels:["sms","phone"], therapist: "Lena Park", joinedDays: 305, source: "Friend", tags:["regular"], signals:["pkg ending"], narrative: "Almost out of package — usually rebuys.", agentActivity: { agent: "SMS Agent", glyph: "S", verb: "Pkg-end nudge queued", status: "scheduled" }, nextWith: "SMS Agent", threadCount:0 },
  { id: "c-ross", name: "Jordan Ross", initials: "JR", bucket: "steady", priority: "P3", temp: 0.66, ltv: 720, packageBalance: 0, sessionsLeft: 0, visits: 7, lastVisit: "Apr 11", lastContact: "Apr 11", primaryChannel: "phone", channels:["phone"], therapist: "Jay Rivera", joinedDays: 240, source: "Google", tags:["regular"], signals:[], narrative: "Single-session buyer, comes monthly.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-singh", name: "Vik Singh", initials: "VS", nextAppt: "Wed 1:00 · Sports 60", bucket: "steady", priority: "P3", temp: 0.74, ltv: 1340, packageBalance: 5, sessionsLeft: 5, visits: 14, lastVisit: "Apr 23", lastContact: "Apr 23", primaryChannel: "sms", channels:["sms"], therapist: "Lena Park", joinedDays: 410, source: "Friend", tags:["regular"], signals:[], narrative: "Reliable bi-weekly, just rebought.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-howard", name: "Kim Howard", initials: "KH", bucket: "steady", priority: "P3", temp: 0.62, ltv: 410, packageBalance: 2, sessionsLeft: 2, visits: 4, lastVisit: "Apr 6", lastContact: "Apr 6", primaryChannel: "email", channels:["email"], therapist: "Jay Rivera", joinedDays: 95, source: "Yelp", tags:[], signals:[], narrative: "Steady, low-touch.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-yamada", name: "Aki Yamada", initials: "AY", nextAppt: "Thu 9:30 · Swedish 90", bucket: "steady", priority: "P3", temp: 0.71, ltv: 980, packageBalance: 4, sessionsLeft: 4, visits: 10, lastVisit: "Apr 22", lastContact: "Apr 22", primaryChannel: "sms", channels:["sms","email"], therapist: "Lena Park", joinedDays: 268, source: "Walked in", tags:["regular"], signals:[], narrative: "Bi-weekly regular.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-lopez", name: "Carla Lopez", initials: "CL", bucket: "steady", priority: "P3", temp: 0.6, ltv: 305, packageBalance: 0, sessionsLeft: 0, visits: 3, lastVisit: "Apr 1", lastContact: "Apr 1", primaryChannel: "sms", channels:["sms"], therapist: "Jay Rivera", joinedDays: 75, source: "Instagram", tags:[], signals:["no pkg"], narrative: "Singles only so far.", agentActivity: null, nextWith: "Qualifier — pkg pitch May 5", threadCount:0 },
  { id: "c-wong", name: "Lily Wong", initials: "LW", nextAppt: "Fri 11:30 · Swedish 60", bucket: "steady", priority: "P3", temp: 0.69, ltv: 660, packageBalance: 2, sessionsLeft: 2, visits: 6, lastVisit: "Apr 15", lastContact: "Apr 15", primaryChannel: "email", channels:["email"], therapist: "Lena Park", joinedDays: 178, source: "Friend", tags:["regular"], signals:[], narrative: "Monthly email-only client.", agentActivity: null, nextWith: "—", threadCount:0 },
  { id: "c-mendez", name: "Alex Mendez", initials: "AM", bucket: "steady", priority: "P3", temp: 0.64, ltv: 540, packageBalance: 1, sessionsLeft: 1, visits: 5, lastVisit: "Apr 10", lastContact: "Apr 10", primaryChannel: "sms", channels:["sms","phone"], therapist: "Jay Rivera", joinedDays: 130, source: "Walked in", tags:["regular"], signals:[], narrative: "Single session left in pkg.", agentActivity: { agent: "SMS Agent", glyph: "S", verb: "Pkg-end nudge in 5d", status: "scheduled" }, nextWith: "SMS Agent", threadCount:0 },
];

// =============== SEGMENTS ===============
// Mix of agent-built (smart, auto-populated) and manual saved.

const CLIENT_SEGMENTS = [
  { id: "drifting-vips",   label: "Drifting VIPs",            count: 4,  kind: "agent",  query: "VIP · 30+d since visit", agent: "Recovery Agent" },
  { id: "used-waiver",     label: "Used Q1 waiver",           count: 11, kind: "agent",  query: "had waiver this quarter", agent: "Phone Rep" },
  { id: "pkg-ending",      label: "Package ending soon",      count: 18, kind: "agent",  query: "≤2 sessions left",        agent: "SMS Agent" },
  { id: "lapsed-60",       label: "Lapsed 60+ days",          count: 23, kind: "agent",  query: "60d since visit",         agent: "Recovery Agent" },
  { id: "advocates",       label: "Advocates",                count: 14, kind: "agent",  query: "wrote review OR referred",agent: "Email Agent" },
  { id: "new-this-month",  label: "New this month",           count: 9,  kind: "agent",  query: "joinedDays ≤ 30",         agent: "Qualifier" },
  { id: "high-no-show",    label: "Multiple no-shows",        count: 6,  kind: "agent",  query: "≥2 no-shows in 30d",      agent: "Phone Rep" },
  { id: "lena-clients",    label: "Lena's clients",           count: 47, kind: "manual", query: "therapist = Lena" },
  { id: "vip-monthly",     label: "VIPs (LTV ≥ $1500)",       count: 12, kind: "manual", query: "ltv ≥ 1500" },
  { id: "phone-only",      label: "Phone-only clients",       count: 8,  kind: "manual", query: "primaryChannel = phone" },
];

// =============== BUCKETS (hero) ===============

const BUCKETS = [
  {
    id: "needs-you",
    label: "Needs you",
    sub: "Agents flagged for human judgment",
    accent: true,
    glyph: "alert",
  },
  {
    id: "drifting",
    label: "Drifting",
    sub: "Cooling off — agents trying to recover",
    glyph: "trending-up",
  },
  {
    id: "champion",
    label: "Champions",
    sub: "Healthy & high-value — keep on cruise",
    glyph: "star",
  },
  {
    id: "new",
    label: "New",
    sub: "Just joined — agents qualifying",
    glyph: "sparkle",
  },
];

// =============== Aggregates ===============
const TOTAL_BOOK = 207;
const ACTIVE_AGENT_TOUCHES_TODAY = 34;
const HEALTH_INDEX = { score: 0.74, delta: -0.02, deltaLabel: "vs last week" };

window.CLIENTS = CLIENTS;
window.CLIENT_SEGMENTS = CLIENT_SEGMENTS;
window.CLIENT_BUCKETS = BUCKETS;
window.CLIENTS_AGGREGATES = { total: TOTAL_BOOK, activeAgentTouches: ACTIVE_AGENT_TOUCHES_TODAY, health: HEALTH_INDEX, newThisMonth: 9, agentsActive: 6, healthDelta: "↓ 2 vs last wk" };

// =============== COMPLIANCE (consent + DNC) ===============
// Contact-level. Absent = consented + clear — only exceptions live here.
window.COMPLIANCE = {
  "c-aisha": { consent: "granted", method: "web form", date: "Oct 1" },
  "c-tom":   { dnc: true, date: "Apr 2" },
  "ld-chloe": { consent: "pending", method: "referral landing form" },
};
