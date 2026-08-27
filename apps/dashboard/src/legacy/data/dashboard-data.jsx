/* global React */
// Slice 4 removed TODAY_KPIS, TODAY_SCHEDULE and NEXT_FOUR_HOURS: revenue,
// appointments, conversion and a booking forecast have no backing table in
// this product, and Today now renders from real metrics. Their only readers
// (HeroBrief, NowPlayingRail) are no longer mounted.
// Chanlytics — refined dashboard data.
// Adds AI-native fields: confidence, suggested replies, predicted outcomes,
// live agent activity, autonomy levels, risk signals.


// Top-line narrative for the hero
const MORNING_BRIEF = {
  headline: "Strong morning.",
  body: "Your agents handled 23 conversations, booked $1,840 across 12 appointments, and kept response time under 90 seconds. Three things need your call.",
  forecast: "On pace to clear $4,200 by 6pm — 18% above your weekly average.",
  pulse: { revenue: 1840, target: 4200, conversations: 23, bookings: 12 },
};

// ====== AGENT COMMAND TASKS — enriched ======
const AGENT_TASKS = {
  now: [
    {
      id: "t1",
      threadId: "th-aisha-refund",
      kind: "Refund request",
      policyClass: "money",
      who: "Aisha Khan",
      whoMeta: "Member · 7 visits · $1,040 LTV",
      channel: "phone",
      time: "2m ago",
      receivedAt: "11:40",
      agent: "Phone Rep",
      agentGlyph: "P",
      priority: "P1",
      confidence: 2, // out of 3 — low because it's a money decision
      reason: "Repeated no-show — policy ambiguity",
      detail: "$120 refund requested after a second no-show. Resolution call drafted — today 4:30.",
      value: null,
      plan: { label: "Resolution call — today 4:30", expect: "Hold sent · slot held", note: "Refunds are owner-handled" },
      alternatives: [
        { label: "Agent offers a credit", note: "Requires owner" },
        { label: "Policy-text reply", note: "Cold on a $1,040 LTV member" },
      ],
      recommended: "Book the 4:30 call",
      suggestedReply: "Hi Aisha — completely understand, and I want this sorted properly for you. The owner handles refunds personally: I can get you two on a quick call today at 4:30. Does that work?",
    },
    {
      id: "t2",
      threadId: "th-wellness-partnership",
      kind: "Outside scope",
      who: "@thewellness.co",
      whoMeta: "Wellness brand · 14k followers · partnership pitch",
      channel: "instagram",
      time: "5m ago",
      receivedAt: "11:37",
      agent: "Chat Agent",
      agentGlyph: "I",
      priority: "P2",
      confidence: 1, // human-judgment case — linked thread is 0.4; must never bulk-approve
      reason: "Not a service request",
      detail: "@thewellness.co reached out about a cross-promotion. This is outside the booking flow Chat Agent handles, so it's been flagged for you.",
      value: null,
      plan: { label: "Route to partners@ — lands in your queue", expect: "Async follow-up within 24h", note: "Outside Chat Agent's scope — needs a human" },
      alternatives: [
        { label: "Reply yourself now", note: "Direct path to the deal · costs your time" },
        { label: "Politely decline", note: "Closes a warm partnership opp" },
      ],
      recommended: "Route to partners@",
      suggestedReply: "Thanks for reaching out! Partnership questions are best routed to partners@chanlytics.com — I've cc'd that team. They'll be in touch within 24 hrs.",
    },
    {
      id: "t3",
      threadId: "th-jordan-discount",
      kind: "Pricing question",
      policyClass: "money",
      who: "Jordan Patel",
      whoMeta: "New lead · referred by Maya R. · 6-pack",
      channel: "sms",
      time: "28m ago",
      receivedAt: "11:31",
      agent: "Phone Rep",
      agentGlyph: "P",
      priority: "P1",
      confidence: 3,
      reason: "Rate exception — owner-quoted",
      detail: "Jordan asked about Maya's 20% referral rate. Intro-call offer drafted — Thursday 2:00 / 4:30.",
      value: 360,
      plan: { label: "Intro call — Thu 2:00 / 4:30", expect: "84/100 fit · books within 48h", note: "Rate confirmed on the call" },
      alternatives: [
        { label: "Quote 20% directly", note: "Requires owner" },
        { label: "Price sheet + wait", note: "Cold quotes book at 30%" },
      ],
      recommended: "Offer the intro call",
      suggestedReply: "Hey Jordan — so glad Maya sent you! The referral rate is something the owner confirms on a quick intro call. I've got Thursday 2:00 or 4:30 open — want me to lock one in?",
    },
  ],
  soon: [
    { id: "s1", kind: "Follow-up due", policyClass: "reengage", who: "Marcus Lee", whoMeta: "Cooled lead · 7d since last reply",
      detail: "Said 'maybe next week' on Apr 19 — nudge window closing.", agent: "SMS Agent", agentGlyph: "S",
      time: "in 1h", confidence: 3, recommended: "Send standard nudge" },
    { id: "s2", kind: "Birthday offer", policyClass: "campaign", who: "8 clients", whoMeta: "Eligible for 20% off",
      detail: "SMS Agent queued it for 5:00pm. Review before send.", agent: "SMS Agent", agentGlyph: "S",
      time: "5:00pm", confidence: 3, recommended: "Approve" },
    { id: "s3", kind: "Review request", who: "Maya Rodriguez", whoMeta: "Service completed Apr 24",
      detail: "Auto-send tomorrow 10am unless paused.", agent: "Email Agent", agentGlyph: "E",
      time: "Tmrw 10:00am", confidence: 3, recommended: "Auto-send" },
  ],
  done: [
    { id: "d5", kind: "Reminded",     who: "Priya Shah",    detail: "15-min reminder before hot stone · SMS",  agent: "SMS Agent",   agentGlyph: "S", time: "2m ago" },
    { id: "d1", kind: "Booked",       who: "Selena Cho",    detail: "Swedish 60 · today 11:30",     agent: "Phone Rep",   agentGlyph: "P", time: "12m ago", value: 180 },
    { id: "d2", kind: "Replied",      who: "@marcus_lee",   detail: "Pricing question answered · IG DM",  agent: "Chat Agent",  agentGlyph: "I", time: "5m ago" },
    { id: "d3", kind: "Rescheduled",  who: "Priya Shah",     detail: "Fri 3pm → Sat 11am",                 agent: "Phone Rep",   agentGlyph: "P", time: "14m ago" },
    { threadId: "th-jordan-discount", id: "d4", kind: "Drafted",      who: "Jordan Patel",  detail: "6-pack pricing question · intro-call offer drafted",  agent: "Phone Rep", agentGlyph: "P", time: "28m ago" },
  ],
};

// ====== TODAY'S SCHEDULE — with risk signals ======

// ====== LIVE AGENT FLEET — with autonomy + current activity ======
const AGENT_FLEET = [
  {
    name: "Phone Rep", glyph: "P", status: "active",
    activity: { verb: "On call", target: "Selena Cho", elapsed: "0:42", channel: "phone" },
    today: { convos: 28, bookings: 7, conv: "25%", revenue: 1840 },
    autonomy: 3,
    pendingReviews: 2,
  },
  {
    name: "Chat Agent", glyph: "I", status: "active",
    activity: { verb: "Drafting reply", target: "@marcus_lee", elapsed: "0:08", channel: "instagram" },
    today: { convos: 41, bookings: 4, conv: "9.7%", revenue: 640 },
    autonomy: 4,
    pendingReviews: 1,
  },
  {
    name: "SMS Agent", glyph: "S", status: "scheduled",
    activity: { verb: "Scheduled", target: "Birthday offer · 5:00pm", elapsed: null, channel: "chat" },
    today: { convos: 9, bookings: 2, conv: "22%", revenue: 220 },
    autonomy: 3,
    pendingReviews: 2,
  },
  {
    name: "Review Bot", glyph: "R", status: "scheduled",
    activity: { verb: "Scheduled", target: "Maya R. review · tmrw 10:00am", elapsed: null, channel: "mail" },
    today: { convos: 6, bookings: 0, conv: "—", revenue: 0 },
    autonomy: 4,
    pendingReviews: 0,
  },
  {
    name: "Email Agent", glyph: "E", status: "idle",
    activity: { verb: "Idle", target: "Last action 3m ago", elapsed: null, channel: "mail" },
    today: { convos: 12, bookings: 1, conv: "8.3%", revenue: 360 },
    autonomy: 2,
    pendingReviews: 1,
  },
  {
    name: "Qualifier", glyph: "Q", status: "idle",
    activity: { verb: "Idle", target: "Waiting for new leads", elapsed: null, channel: "chat" },
    today: { convos: 18, bookings: 0, conv: "—", revenue: 0 },
    autonomy: 4,
    pendingReviews: 0,
  },
  {
    name: "Objection Coach", glyph: "O", status: "idle",
    activity: { verb: "Standby", target: "Triggers on price pushback", elapsed: null, channel: "chat" },
    today: { convos: 4, bookings: 1, conv: "25%", revenue: 180 },
    autonomy: 2,
    pendingReviews: 0,
  },
  {
    name: "Recovery Agent", glyph: "X", status: "idle",
    activity: { verb: "Idle", target: "3 cold leads queued", elapsed: null, channel: "mail" },
    today: { convos: 7, bookings: 0, conv: "—", revenue: 0 },
    autonomy: 3,
    pendingReviews: 1,
  },
];

// Live ticker — recent agent actions, newest first
const LIVE_TICKER = [
  { time: "11:42", agent: "Phone Rep",  glyph: "P", verb: "started call",   target: "Selena Cho",            channel: "phone",     state: "live",  duration: "0:42" },
  { time: "11:14", agent: "Phone Rep",  glyph: "P", verb: "proposed intro call", target: "Jordan Patel", channel: "chat", state: "done", to: "inbox/th-jordan-discount" },
  { time: "11:18", agent: "Chat Agent", glyph: "I", verb: "captured",       target: "@thewellness.co",       channel: "instagram", state: "done", to: "inbox/th-wellness-partnership" },
  { time: "10:42", agent: "Phone Rep",  glyph: "P", verb: "rescheduled",    target: "Priya Shah",             channel: "phone",     state: "done", to: "calendar/a-priya" },
  { time: "10:30", agent: "Email Agent",glyph: "E", verb: "sent day-14 nurture", target: "Noah Williams", channel: "mail", state: "done", to: "conversations/cv-noah-mail" },
  { time: "9:42",  agent: "Phone Rep",  glyph: "P", verb: "booked",         target: "Maya Rodriguez",        channel: "phone",     state: "done", value: 280, to: "conversations/cv-maya-call" },
];

const RECENT_TRANSCRIPTS = [
  { who: "Maya Rodriguez", channel: "phone", booked: true, time: "9:42 AM", duration: "3:21",
    snippet: "…thank you, I'd love to come in for the deep tissue. Yes, Tuesday at 10 works perfectly…" },
  { who: "@marcus_lee",    channel: "instagram", booked: false, time: "11:18 AM",
    snippet: "Hey! Pricing for the couples package? Looking at next month for an anniversary…" },
  { who: "Jordan Patel",   channel: "chat", booked: false, time: "11:10 AM",
    snippet: "…Friend told me she got 20% off her first package. Can you do that for me?…" },
];

const REVENUE_BY_DAY = [3200, 4100, 3800, 5200, 4600, 5800, 6400, 5900, 7100, 6800, 7400, 8200, 7800, 8900];

// Suggested questions for the Ask Chanlytics surface
const ASK_SUGGESTIONS = [
  { q: "What's waiting on me?",                kind: "ask" },
  { q: "How's revenue pacing today?",         kind: "ask" },
  { q: "What can agents do on their own?",    kind: "ask" },
  { q: "Are agents earning more autonomy?",   kind: "ask" },
  { q: "Who's in my Drifting VIPs?",          kind: "ask" },
  { q: "How booked is Lena this week?",       kind: "ask" },
  { q: "Book Jordan's intro call",            kind: "act" },
  { q: "Approve all safe drafts",             kind: "act" },
  { q: "Book Aisha's resolution call",         kind: "act" },
  { q: "Pause the SMS Agent",                 kind: "act" },
  { q: "Set me to Away",                      kind: "act" },
  { q: "Draft a win-back to Drifting VIPs",   kind: "draft" },
  { q: "Teach the agents a new answer",       kind: "draft" },
];

// Forecast for the Now-playing rail

window.CHANLY_DATA = {
  MORNING_BRIEF, AGENT_TASKS, AGENT_FLEET,
  LIVE_TICKER, RECENT_TRANSCRIPTS, REVENUE_BY_DAY, ASK_SUGGESTIONS,
  // Backwards-compat alias for any older dashboard-b that reads AGENT_BREAKDOWN
  AGENT_BREAKDOWN: AGENT_FLEET.map(a => ({
    name: a.name, glyph: a.glyph, calls: a.today.convos, bookings: a.today.bookings,
    conv: a.today.conv, revenue: a.today.revenue ? `$${a.today.revenue.toLocaleString()}` : "—", status: a.status === "active" ? "active" : "idle",
  })),
};
