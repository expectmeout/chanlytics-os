/* global window */
// Chanlytics — People seed data: the mockup's leads + Segment detail meta
// These are the MOCKUP's leads and the mockup's stages: new → qualifying →
// ready → nurture (converted/archived are terminal states reached in-session).
// The page that drew them as a queue is retired — Leads is a scope of People
// now (clients/leads), fed by the leads surface — and these seeds stay because
// Segments, the Deal board, the demo Inbox and the demo bell still draw them.
// Nothing real reads any of it: a stored lead's stage is contracts' LEAD_STAGES
// (ready | nurture | converted | archived, with a reason) said in the words of
// LEAD_STAGE_WORDS, and `qualifying` and `new` are never stored.

const LEAD_STAGES = [
  { id: "ready",      label: "Ready for you", sub: "Qualified — your call",        glyph: "alert",   accent: true },
  { id: "qualifying", label: "Qualifying",    sub: "Agents gathering fit",          glyph: "sparkle" },
  { id: "new",        label: "New",           sub: "Just arrived — first touch",    glyph: "bolt" },
  { id: "nurture",    label: "Nurturing",     sub: "Not yet — agents keeping warm", glyph: "clock" },
];

const LEADS = [
  // ============ READY (qualified — operator decision) ============
  {
    id: "ld-gabby", name: "Gabby Moreno", initials: "GM",
    stage: "ready", channel: "instagram", source: "IG reel · Spring stretch promo",
    fit: 0.91, estValue: 340, age: "38m", ageMin: 38, firstTouch: "28s", src: "instagram", priority: "P1",
    inquiry: "Couples massage this Saturday — do you have anything before noon?",
    narrative: "Wants a couples package this weekend. Chat Agent confirmed budget ($300+), held Sat 11:00 with Lena + Jay — hold expires 5pm today.",
    learned: [
      { k: "Intent",  v: "Couples 90-min, this Saturday" },
      { k: "Budget",  v: "\u201cwhatever the couples one costs\u201d — quoted $340, no pushback" },
      { k: "Timing",  v: "Sat before noon · hold at 11:00" },
      { k: "Fit note", v: "Asked about rebooking cadence unprompted" },
    ],
    rec: { action: "convert", label: "Confirm booking & create client", detail: "Take payment link route — hold releases at 5:00pm", confidence: 0.94 },
    agentActivity: { agent: "Chat Agent", glyph: "I", verb: "Hold expires 5:00pm", status: "approval", since: "11:52" },
    transcript: [
      { who: "lead",  text: "Do you do couples? Saturday would be ideal, earlier the better 🙏" },
      { who: "agent", text: "We do — Sat 11:00 with Lena + Jay is open. Want me to hold it while you decide?" },
      { who: "lead",  text: "Yes please! How much is it?" },
    ],
  },
  {
    id: "ld-jordan", name: "Jordan Patel", initials: "JP", clientId: "c-jordan", inboxThreadId: "th-jordan-discount",
    stage: "ready", channel: "sms", source: "Referral · Maya Rodriguez (VIP)",
    fit: 0.86, estValue: 720, age: "1h", ageMin: 60, firstTouch: "41s", src: "referral", priority: "P1",
    inquiry: "Maya said she gets 20% off — can I get the same deal?",
    narrative: "Referred by Maya ($1,800 LTV). Asking for her 20% rate — campaign ended Apr 1. Intro-call offer drafted; the rate is quoted on the call.",
    learned: [
      { k: "Referrer", v: "Maya Rodriguez — VIP, 18 visits" },
      { k: "Ask",      v: "20% off (expired campaign rate)" },
      { k: "Play",     v: "Intro call — Thu 2:00 / 4:30, drafted" },
      { k: "Policy",   v: "Rates are owner-quoted" },
    ],
    rec: { action: "offer", label: "Approve 15% referral offer", detail: "Keeps referrer goodwill; margin holds above floor", confidence: 0.81 },
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Draft awaiting approval", status: "approval", since: "11:14" },
    transcript: [
      { who: "lead",  text: "Hey! Maya Rodriguez sent me. She mentioned she gets 20% off?" },
      { who: "agent", text: "Maya's one of our favorites — that rate was a spring campaign, but let me see what I can do for a referral." },
    ],
  },
  {
    id: "ld-hasan", name: "Hasan Ali", initials: "HA",
    stage: "ready", channel: "email", source: "Web form · Corporate page",
    fit: 0.78, estValue: 1440, age: "3h", ageMin: 180, firstTouch: "2m 10s", src: "website", priority: "P2",
    inquiry: "Monthly chair-massage day for a 12-person team — can you quote?",
    narrative: "Corporate wellness inquiry for a 12-person office, monthly recurring. Custom pricing is out of agent scope — Qualifier gathered the details and escalated.",
    learned: [
      { k: "Team size", v: "12 people, monthly recurring" },
      { k: "Location",  v: "On-site, 15 min away" },
      { k: "Budget",    v: "\u201csend a quote\u201d — no anchor given" },
      { k: "Decision",  v: "He decides; wants it before June" },
    ],
    rec: { action: "call", label: "Take this call yourself", detail: "Custom quote — Qualifier prepped a brief in the thread", confidence: 0.7 },
    agentActivity: { agent: "Qualifier", glyph: "Q", verb: "Escalated — custom pricing", status: "escalated", since: "09:20" },
    transcript: [
      { who: "lead",  text: "We're looking at a monthly wellness day for the team — 12 of us. Do you do on-site?" },
      { who: "agent", text: "We can. I'll have our owner put together a quote — could you share your address and preferred weekday?" },
    ],
  },
  {
    id: "ld-dana", name: "Dana Whitfield", initials: "DW",
    stage: "ready", channel: "phone", source: "Missed call · voicemail left",
    fit: 0.74, estValue: 190, age: "2h", ageMin: 120, firstTouch: "4m", src: "phone", priority: "P2",
    inquiry: "Prenatal massage — and can I get a receipt for insurance?",
    narrative: "Left a voicemail asking about prenatal availability and insurance receipts. Phone Rep can book, but the insurance-documentation question needs a human answer.",
    learned: [
      { k: "Service", v: "Prenatal 60-min, 2nd trimester" },
      { k: "Timing",  v: "Weekday mornings" },
      { k: "Blocker", v: "Insurance receipt format — unanswered" },
    ],
    rec: { action: "call", label: "Call back re: insurance", detail: "Booking is ready to place once the receipt question clears", confidence: 0.66 },
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Held — insurance question", status: "escalated", since: "10:05" },
    transcript: [
      { who: "lead", text: "(voicemail) Hi — I'm looking for prenatal massage, and I'd need receipts my insurance will take. Call me back?" },
    ],
  },

  // ============ QUALIFYING (agents working) ============
  {
    id: "ld-tom", name: "Tom Reilly", initials: "TR", clientId: "c-tom",
    dupe: { clientId: "c-tom", reason: "Same email as an existing client record", note: "1 visit last Oct with Jay — link it, don’t double-message" },
    stage: "qualifying", channel: "email", source: "Google ad · pricing page",
    fit: 0.55, estValue: 150, age: "1d", ageMin: 1440, firstTouch: "55s", src: "google", priority: "P3",
    inquiry: "What are your rates for a first visit?",
    narrative: "Asked about pricing yesterday. Email Agent sent the new-client offer; waiting on a reply before pitching a slot.",
    learned: [{ k: "Ask", v: "First-visit pricing" }, { k: "Offer sent", v: "New-client $75 intro" }],
    rec: null,
    agentActivity: { agent: "Email Agent", glyph: "E", verb: "Awaiting reply · follow-up Apr 29", status: "in-flight" },
    transcript: [
      { who: "lead",  text: "Saw your ad — what does a first session run?" },
      { who: "agent", text: "First visit is $75 with the intro offer. Want me to send a couple of times that work this week?" },
    ],
  },
  {
    id: "ld-leah", name: "Leah Kim", initials: "LK",
    stage: "qualifying", channel: "instagram", source: "IG comment → DM",
    fit: 0.62, estValue: 200, age: "5h", ageMin: 300, firstTouch: "33s", src: "instagram", priority: "P3",
    inquiry: "Do you sell gift cards? It's for my mom's birthday.",
    narrative: "Wants a gift card for her mother's birthday. Chat Agent is confirming amount and delivery date — likely a $150–200 card.",
    learned: [{ k: "Intent", v: "Gift card, mother's birthday" }, { k: "Open", v: "Amount + date pending" }],
    rec: null,
    agentActivity: { agent: "Chat Agent", glyph: "I", verb: "Asking amount & delivery date", status: "in-flight" },
    transcript: [
      { who: "lead",  text: "do you guys do gift cards?? my mom would love this place" },
      { who: "agent", text: "We do! Digital or printed — what amount were you thinking, and when's the big day?" },
    ],
  },
  {
    id: "ld-marcus", name: "Marcus Webb", initials: "MW",
    stage: "qualifying", channel: "sms", source: "Web form · booking page",
    fit: 0.68, estValue: 240, age: "3h", ageMin: 180, firstTouch: "38s", src: "website", priority: "P3",
    inquiry: "Lower back pain from lifting — who should I see?",
    narrative: "Back-pain case, wants the right therapist. SMS Agent proposed three deep-tissue slots with Jay; no pick yet.",
    learned: [{ k: "Need", v: "Deep tissue, lower back" }, { k: "Proposed", v: "3 slots with Jay this week" }],
    rec: null,
    agentActivity: { agent: "SMS Agent", glyph: "S", verb: "3 slots proposed · awaiting pick", status: "in-flight" },
    transcript: [
      { who: "lead",  text: "Tweaked my back deadlifting. Do you have someone good with that?" },
      { who: "agent", text: "Jay's our deep-tissue specialist. He has Thu 2:00, Fri 10:00, or Sat 9:00 — any of those work?" },
    ],
  },
  {
    id: "ld-ines", name: "Ines Ferreira", initials: "IF",
    stage: "qualifying", channel: "chat", source: "Website chat widget",
    fit: 0.44, estValue: 120, age: "1d", ageMin: 1440, firstTouch: "12s", src: "website", priority: "P3",
    inquiry: "Asked about parking and evening hours, then went quiet.",
    narrative: "Practical questions answered, then silence. Qualifier has a re-engage scheduled for tomorrow 10:00am before this goes to nurture.",
    learned: [{ k: "Asked", v: "Parking, evening hours" }, { k: "Signal", v: "Went quiet after answers" }],
    rec: null,
    agentActivity: { agent: "Qualifier", glyph: "Q", verb: "Re-engage tomorrow 10:00am", status: "scheduled" },
    transcript: [
      { who: "lead",  text: "Is there parking nearby? And how late are you open on weekdays?" },
      { who: "agent", text: "Free lot behind the building, and we're open till 8pm Mon–Thu. Want me to check evening availability?" },
    ],
  },

  // ============ NEW (first touch in flight) ============
  {
    id: "ld-ravi", name: "Ravi Narayan", initials: "RN",
    stage: "new", channel: "phone", source: "Missed call · no voicemail",
    fit: null, estValue: null, age: "6m", ageMin: 6, firstTouch: null, src: "phone", priority: "P2",
    inquiry: "Missed call from a new number — no voicemail.",
    narrative: "Called 6 minutes ago from an unrecognized number. Phone Rep is calling back now.",
    learned: [],
    rec: null,
    agentActivity: { agent: "Phone Rep", glyph: "P", verb: "Calling back now", status: "in-flight", since: "12:02" },
    transcript: [],
  },
  {
    id: "ld-chloe", name: "Chloe Bennett", initials: "CB",
    stage: "new", channel: "email", source: "Web form · referral landing page",
    fit: null, estValue: null, age: "22m", ageMin: 22, firstTouch: null, src: "referral", priority: "P3",
    inquiry: "Form: \u201cA friend recommended you — what's your availability like?\u201d",
    narrative: "Came in through the referral landing page 22 minutes ago. Qualifier is drafting the first touch.",
    learned: [],
    rec: null,
    agentActivity: { agent: "Qualifier", glyph: "Q", verb: "Drafting first touch", status: "in-flight" },
    transcript: [],
  },
  {
    id: "ld-sun", name: "@sun.and.stretch", initials: "SS",
    stage: "new", channel: "instagram", source: "IG follow + story reply",
    fit: null, estValue: null, age: "1h", ageMin: 60, firstTouch: "45s", src: "instagram", priority: "P3",
    inquiry: "Replied 🔥 to the spring-promo story and followed.",
    narrative: "Warm social signal, no direct ask yet. Chat Agent is opening a DM with the promo details.",
    learned: [],
    rec: null,
    agentActivity: { agent: "Chat Agent", glyph: "I", verb: "Opening DM", status: "in-flight" },
    transcript: [],
  },

  // ============ NURTURE (keeping warm) ============
  {
    id: "ld-owen", name: "Owen Zhang", initials: "OZ",
    stage: "nurture", channel: "sms", source: "Walk-in inquiry, left card",
    fit: 0.58, estValue: 160, age: "4d", ageMin: 5760, firstTouch: "30s", src: "phone", priority: "P3",
    inquiry: "Interested but said \u201cmaybe after payday.\u201d",
    narrative: "Price-sensitive, asked to be pinged in May. SMS Agent has a nudge queued for May 2 with the intro offer.",
    learned: [{ k: "Blocker", v: "Budget until payday (May 1)" }, { k: "Queued", v: "Nudge May 2, intro offer" }],
    rec: null,
    agentActivity: { agent: "SMS Agent", glyph: "S", verb: "Nudge queued May 2", status: "scheduled" },
    transcript: [
      { who: "lead",  text: "Looks great but money's tight till payday. Can you text me in May?" },
      { who: "agent", text: "Absolutely — I'll check in on the 2nd with our intro rate. Enjoy the rest of your week!" },
    ],
  },
  {
    id: "ld-bri", name: "Bri Tanner", initials: "BT",
    stage: "nurture", channel: "email", source: "Google · compared 2 studios",
    fit: 0.51, estValue: 140, age: "6d", ageMin: 8640, firstTouch: "1m 2s", src: "google", priority: "P3",
    inquiry: "Comparing you with Riverside Bodyworks on price and hours.",
    narrative: "Shopping around. Email Agent is on step 2 of 3 in the comparison drip — reviews and the evening-hours angle.",
    learned: [{ k: "Comparing", v: "Riverside Bodyworks" }, { k: "Drip", v: "Step 2/3 · reviews + hours" }],
    rec: null,
    agentActivity: { agent: "Email Agent", glyph: "E", verb: "Drip step 2 of 3", status: "in-flight" },
    transcript: [
      { who: "lead", text: "How do you compare to Riverside? They're a bit cheaper." },
    ],
  },
];

const LEADS_AGGREGATES = {
  capturedThisWeek: 23,
  qualificationRate: 0.61,       // captured → ready
  medianFirstTouch: "38s",
  convertedThisWeek: { count: 6, value: 2870 },
};

// =============== SEGMENT DETAIL META ===============
// Extends CLIENT_SEGMENTS (data/clients-data.jsx) by id with everything the
// Segments surface needs: trend, rules, usage, membership sample.
// memberIds reference CLIENTS; matchedOn explains why each is in the list.

const SEGMENT_META = {
  "drifting-vips": {
    definition: "VIP-tagged clients with no visit in 30+ days.",
    rules: [{ f: "tags", o: "includes", v: "VIP" }, { f: "last visit", o: "≥", v: "30 days ago" }],
    trend: [2, 2, 3, 3, 2, 3, 4, 4], delta: "+1 this wk", deltaTone: "neg",
    refreshed: "4m ago", cadence: "Live",
    usedBy: [
      { kind: "agent", label: "Recovery Agent · win-back sequence", icon: "agents" },
      { kind: "broadcast", label: "\u201cWe miss you\u201d broadcast · May 2", icon: "wave" },
    ],
    members: [
      { id: "c-yuki",   matchedOn: "VIP · 30d since visit" },
      { id: "c-marcus", matchedOn: "49d since visit" },
      { id: "c-amelia", matchedOn: "76d since visit" },
      { id: "c-priya",  matchedOn: "63d since visit" },
    ],
  },
  "used-waiver": {
    definition: "Clients who used their quarterly no-show waiver this quarter.",
    rules: [{ f: "waiver", o: "used in", v: "Q2" }],
    trend: [4, 5, 6, 7, 8, 9, 10, 11], delta: "+2 this wk", deltaTone: "neg",
    refreshed: "11m ago", cadence: "Live",
    usedBy: [{ kind: "agent", label: "Phone Rep · policy checks", icon: "agents" }],
    members: [
      { id: "c-aisha", matchedOn: "waiver used Q1 · asking refund" },
      { id: "c-lopez", matchedOn: "waiver used Apr 3" },
    ],
  },
  "pkg-ending": {
    definition: "Anyone with 2 or fewer sessions left on a package.",
    rules: [{ f: "sessions left", o: "≤", v: "2" }],
    trend: [12, 14, 13, 15, 16, 17, 17, 18], delta: "+1 this wk", deltaTone: "",
    refreshed: "2m ago", cadence: "Live",
    usedBy: [
      { kind: "outbound", label: "Package-expiry nudges · evergreen", icon: "bolt" },
      { kind: "agent", label: "SMS Agent · rebuy nudges", icon: "agents" },
      { kind: "broadcast", label: "Package renewal offer · monthly", icon: "wave" },
    ],
    members: [
      { id: "c-chen",   matchedOn: "1 session left · usually rebuys" },
      { id: "c-mendez", matchedOn: "1 session left" },
      { id: "c-david",  matchedOn: "1 left · expires May 19" },
      { id: "c-bell",   matchedOn: "2 sessions left" },
    ],
  },
  "lapsed-60": {
    definition: "No visit in the last 60 days, still reachable.",
    rules: [{ f: "last visit", o: "≥", v: "60 days ago" }, { f: "status", o: "≠", v: "unsubscribed" }],
    trend: [26, 25, 25, 24, 24, 23, 23, 23], delta: "−1 this wk", deltaTone: "pos",
    refreshed: "9m ago", cadence: "Daily",
    usedBy: [
      { kind: "outbound", label: "Win-back · 30% return offer · running", icon: "bolt" },
      { kind: "agent", label: "Recovery Agent · cold-list review", icon: "agents" },
    ],
    members: [
      { id: "c-tom",    matchedOn: "on the DNC list \u2014 held from sends" },
      { id: "c-priya",  matchedOn: "63 days" },
      { id: "c-amelia", matchedOn: "76 days" },
    ],
  },
  "advocates": {
    definition: "Wrote a review or referred a friend in the last 6 months.",
    rules: [{ f: "review", o: "or", v: "referral ≤ 6mo" }],
    trend: [9, 10, 11, 11, 12, 13, 13, 14], delta: "+1 this wk", deltaTone: "pos",
    refreshed: "1h ago", cadence: "Daily",
    usedBy: [
      { kind: "outbound", label: "Referral thank-you flow · draft", icon: "bolt" },
      { kind: "broadcast", label: "Referral-bonus announce · quarterly", icon: "wave" },
      { kind: "agent", label: "Email Agent · thank-you flow", icon: "agents" },
    ],
    members: [
      { id: "c-maya",   matchedOn: "referred Jordan today" },
      { id: "c-sophie", matchedOn: "5⭐ review last week" },
    ],
  },
  "new-this-month": {
    definition: "Joined in the last 30 days.",
    rules: [{ f: "joined", o: "≤", v: "30 days" }],
    trend: [5, 6, 6, 7, 7, 8, 9, 9], delta: "+2 this wk", deltaTone: "pos",
    refreshed: "6m ago", cadence: "Live",
    usedBy: [{ kind: "agent", label: "Qualifier · onboarding checks", icon: "agents" }],
    members: [
      { id: "c-claire",  matchedOn: "joined 8d ago" },
      { id: "c-natalie", matchedOn: "joined 14d ago" },
    ],
  },
  "high-no-show": {
    definition: "Two or more no-shows in the last 30 days.",
    rules: [{ f: "no-shows", o: "≥", v: "2 in 30d" }],
    trend: [3, 3, 4, 4, 5, 5, 6, 6], delta: "+1 this wk", deltaTone: "neg",
    refreshed: "18m ago", cadence: "Live",
    usedBy: [{ kind: "agent", label: "Phone Rep · deposit policy", icon: "agents" }],
    members: [
      { id: "c-aisha", matchedOn: "2 no-shows this week" },
    ],
  },
  "lena-clients": {
    definition: "Everyone whose primary therapist is Lena Park.",
    rules: [{ f: "therapist", o: "=", v: "Lena Park" }],
    trend: [44, 45, 45, 46, 46, 47, 47, 47], delta: "no change", deltaTone: "",
    refreshed: "on demand", cadence: "Manual",
    usedBy: [{ kind: "broadcast", label: "Lena's schedule-change note · Apr 12", icon: "wave" }],
    members: [
      { id: "c-maya",   matchedOn: "therapist: Lena" },
      { id: "c-sophie", matchedOn: "therapist: Lena" },
      { id: "c-chen",   matchedOn: "therapist: Lena" },
      { id: "c-park",   matchedOn: "therapist: Lena" },
    ],
  },
  "vip-monthly": {
    definition: "Lifetime value at or above $1,500.",
    rules: [{ f: "LTV", o: "≥", v: "$1,500" }],
    trend: [10, 10, 11, 11, 11, 12, 12, 12], delta: "+1 this mo", deltaTone: "pos",
    refreshed: "on demand", cadence: "Manual",
    usedBy: [{ kind: "broadcast", label: "VIP early-access sends", icon: "wave" }],
    members: [
      { id: "c-amy",    matchedOn: "$2,240 LTV" },
      { id: "c-sophie", matchedOn: "$1,920 LTV" },
      { id: "c-maya",   matchedOn: "$1,800 LTV" },
      { id: "c-yuki",   matchedOn: "$1,620 LTV" },
    ],
  },
  "phone-only": {
    definition: "Clients who only pick up the phone — no SMS or email.",
    rules: [{ f: "primary channel", o: "=", v: "phone" }, { f: "channels", o: "count", v: "1" }],
    trend: [9, 9, 8, 8, 8, 8, 8, 8], delta: "no change", deltaTone: "",
    refreshed: "on demand", cadence: "Manual",
    usedBy: [{ kind: "agent", label: "Phone Rep · call-first routing", icon: "agents" }],
    members: [
      { id: "c-ross", matchedOn: "phone only" },
    ],
  },
};

const SEGMENTS_AGGREGATES = {
  total: 12,
  inActiveUse: 9,
  autoRefreshed: 9,
  broadcastsThisMonth: 4,
};

// =============== VIP META (guardrails reference) ===============
SEGMENT_META["vip-monthly"] = SEGMENT_META["vip-monthly"] || {
  definition: "VIP-tagged clients on a monthly-or-faster visit cadence.",
  rules: [{ f: "tags", o: "includes", v: "VIP" }, { f: "cadence", o: "≤", v: "30 days" }],
  trend: [10, 10, 11, 11, 12, 12, 12, 12], delta: "no change", deltaTone: "",
  refreshed: "12m ago", cadence: "Live",
  usedBy: [{ kind: "broadcast", label: "“Meet Jay” announce · Mar 18", icon: "wave" }],
  members: [
    { id: "c-maya",   matchedOn: "VIP · every 3 weeks" },
    { id: "c-amy",    matchedOn: "VIP · 22 visits" },
    { id: "c-rashid", matchedOn: "monthly since ’24" },
    { id: "c-sophie", matchedOn: "VIP · monthly ritual" },
  ],
};

// =============== LEAD SOURCES (weekly funnel by origin) ===============
// captured → ready → converted · est = first-year value of conversions.
// Sums match LEADS_AGGREGATES (23 captured, 6 converted, $2,870 est).
const LEAD_SOURCES = [
  { id: "instagram", label: "Instagram",      icon: "instagram", captured: 7, ready: 4, converted: 2, est: 520,  touch: "31s" },
  { id: "website",   label: "Website & chat", icon: "chat",      captured: 6, ready: 4, converted: 2, est: 1610, touch: "24s" },
  { id: "google",    label: "Google",         icon: "search",    captured: 4, ready: 2, converted: 1, est: 150,  touch: "58s" },
  { id: "referral",  label: "Referrals",      icon: "users",     captured: 3, ready: 3, converted: 1, est: 590,  touch: "40s" },
  { id: "phone",     label: "Phone & walk-in",icon: "phone",     captured: 3, ready: 1, converted: 0, est: 0,    touch: "3m 40s" },
];

// =============== LEAD LISTS ===============
// Slices of People › Leads — join CLIENT_SEGMENTS so every targeting surface
// (Broadcasts, Outbound drips, Ask) sees one segment vocabulary.
const LEAD_SEGMENTS = [
  { id: "price-sensitive",     label: "Price-sensitive nurture", count: 3, kind: "lead", query: "leads · blocker = budget",     agent: "Qualifier" },
  { id: "corporate-inquiries", label: "Corporate inquiries",     count: 1, kind: "lead", query: "leads · team / on-site ask",  agent: "Qualifier" },
];
if (window.CLIENT_SEGMENTS && !window.CLIENT_SEGMENTS.some(s => s.kind === "lead")) {
  window.CLIENT_SEGMENTS.push(...LEAD_SEGMENTS);
}

SEGMENT_META["price-sensitive"] = {
  definition: "Leads who want in but named budget as the blocker.",
  rules: [{ f: "type", o: "=", v: "lead" }, { f: "blocker", o: "=", v: "budget" }],
  trend: [1, 1, 2, 2, 2, 3, 3, 3], delta: "+1 this wk", deltaTone: "",
  refreshed: "3m ago", cadence: "Live",
  usedBy: [{ kind: "agent", label: "Email Agent · price-sensitive drip (draft)", icon: "agents", to: "fleet/email-agent" }],
  members: [
    { id: "ld-owen", lead: true, matchedOn: "“after payday” · nudge May 2" },
    { id: "ld-bri",  lead: true, matchedOn: "comparing on price" },
    { id: "ld-ines", lead: true, matchedOn: "went quiet after hours ask" },
  ],
};
SEGMENT_META["corporate-inquiries"] = {
  definition: "Leads asking about team or on-site sessions — custom quotes.",
  rules: [{ f: "type", o: "=", v: "lead" }, { f: "ask", o: "includes", v: "team / on-site" }],
  trend: [0, 0, 0, 1, 1, 1, 1, 1], delta: "+1 this mo", deltaTone: "pos",
  refreshed: "3h ago", cadence: "Live",
  usedBy: [{ kind: "agent", label: "Qualifier · corporate intake brief (draft)", icon: "agents", to: "fleet/qualifier" }],
  members: [
    { id: "ld-hasan", lead: true, matchedOn: "12-person team · monthly" },
  ],
};

// =============== FLEET PLAYBOOKS ===============
// Lives HERE (not fleet-data) because playbooks are segment-joined — see CLAUDE.md.
// Segment-triggered work, keyed by agent id. `segId` playbooks read as
// "when someone enters <segment> → run · stops when <stop>"; `event` ones are event-triggered.
const FLEET_PLAYBOOKS = {
  "recovery-agent": [
    { id: "pb-winback",  name: "Win-back sequence", segId: "lapsed-60",    trigger: "enters", stop: "they book or opt out", status: "running", note: "3 touches · SMS → email · offers ≤ 20%" },
    { id: "pb-vipdrift", name: "VIP drift watch",   segId: "drifting-vips", trigger: "enters", stop: "they book again",      status: "running", note: "softer cadence · discounts always ask you" },
  ],
  "sms-agent": [
    { id: "pb-rebuy",    name: "Package rebuy nudges", segId: "pkg-ending", trigger: "enters", stop: "they rebuy", status: "running", note: "14 days before expiry · quiet hours respected" },
    { id: "pb-birthday", name: "Birthday offers",      event: "birthday this week",                              status: "running", note: "batches over 5 ask you first" },
  ],
  "phone-rep": [
    { id: "pb-deposit", name: "Deposit policy", segId: "high-no-show", trigger: "enters", stop: "3 clean visits", status: "running", note: "requires deposit before any new booking" },
    { id: "pb-waiver",  name: "Waiver checks",  segId: "used-waiver",  trigger: "is in",                          status: "running", note: "no second waiver — asks you instead" },
  ],
  "email-agent": [
    { id: "pb-advocate",  name: "Advocate thank-you flow", segId: "advocates",       trigger: "enters", stop: "thanked + gifted",      status: "running", note: "in your voice · small gift on referral" },
    { id: "pb-pricedrip", name: "Price-sensitive drip",    segId: "price-sensitive", trigger: "enters", stop: "they book or opt out", status: "draft",   note: "intro offer timed after payday" },
  ],
  "review-bot": [
    { id: "pb-review",   name: "Review capture",      event: "5★ visit",                                      status: "running", note: "next morning, 10:00" },
    { id: "pb-advthank", name: "Advocate follow-ups", segId: "advocates", trigger: "enters",                   status: "running", note: "responds to every review same-day" },
  ],
  "qualifier": [
    { id: "pb-onboard", name: "Onboarding checks",       segId: "new-this-month",      trigger: "enters", stop: "30 days in", status: "running", note: "package interest at visit 2" },
    { id: "pb-corp",    name: "Corporate intake brief",  segId: "corporate-inquiries", trigger: "enters",                     status: "draft",   note: "preps a quote brief for you" },
  ],
  "chat-agent": [],
  "objection-coach": [],
};

// =============== SEGMENT MOVEMENT (Today brief digest) ===============
const SEG_MOVEMENT = [
  { segId: "drifting-vips", dir: "in",  count: 1, who: "Yuki Tanaka",            note: "outreach paused until May 1 — her ask", action: { label: "Review watch", to: "segments/drifting-vips" } },
  { segId: "pkg-ending",    dir: "in",  count: 2, who: "Lin Chen, Alex Mendez",  note: "rebuy nudges queued by SMS Agent",       action: { label: "See nudges", to: "fleet/sms-agent" } },
  { segId: "lapsed-60",     dir: "out", count: 1, who: "Sam Rivera",             note: "booked — win-back worked (+$120)",       action: { label: "In Reports", to: "reports" } },
];

// =============== SEGMENT HEALTH (Reports) ===============
const SEGMENT_HEALTH = [
  { segId: "pkg-ending",    revenue: 3150, conv: "42%", note: "rebuy nudges · best return per send" },
  { segId: "lapsed-60",     revenue: 2740, conv: "22%", note: "win-back running · 9 booked" },
  { segId: "advocates",     revenue: 780,  conv: "—",   note: "referral flow drafted — approve in Outbound" },
  { segId: "drifting-vips", revenue: 0,    conv: "—",   note: "watch list · $6.1k LTV at churn risk" },
];

// =============== PER-SEGMENT GUARDRAILS (Settings › Autonomy) ===============
const SEG_GUARDRAILS = [
  { segId: "vip-monthly",   label: "VIP outreach",      hint: "How agents touch this list — rates stay owner-quoted", value: "White-glove · confirmations only", options: ["White-glove · confirmations only", "Normal cadence"] },
  { segId: "high-no-show",  label: "No-show bookings",  hint: "Deposit before any new booking",             value: "Require deposit", options: ["Require deposit", "Ask me", "Book freely"] },
  { segId: "lapsed-60",     label: "Win-back offers",   hint: "The deepest discount the win-back campaign may run on this list", value: "Max 20% off", options: ["Max 20% off", "Ask me first", "No offers — check-ins only"] },
  { segId: "drifting-vips", label: "Win-back touches",  hint: "Recovery Agent stays offer-free — discounts need a standing campaign", value: "Check-in + call offer", options: ["Check-in only", "Check-in + call offer", "Pause list"] },
];

window.LEADS = LEADS;

// =============== SESSION LEAD ARRIVAL (DEMO ONLY) ===============
// One scripted inbound moment so the top of the funnel is demoable live:
// ~18s into a session Riley texts back after a missed call; Qualifier scores
// them 8s later. What is left to see is the bell (topbar.jsx starts the timer
// only in a demo and listens for leads:arrived) — the page that drew the row
// and the source strip is retired. Both beats still mutate LEADS +
// LEAD_SOURCES (+ aggregates, guarded) together so the sums contract holds
// mid-session. A real workspace never fires this: its lead news is the bell's
// own leads_ready / leads_question rows.
const LD_ARRIVAL = {
  id: "ld-riley", name: "Riley Nguyen", initials: "RN",
  stage: "new", channel: "sms", source: "Missed call · texted back the main line",
  fit: 0.62, estValue: 180, age: "just now", ageMin: 0, firstTouch: "9s", src: "phone", priority: "P2",
  arrivedNow: true,
  inquiry: "Hi — I called about a prenatal massage but no one picked up. Do you have anything this week?",
  narrative: "Called the main line at 12:04, no pickup — texted back within a minute. SMS Agent acknowledged in 9 seconds; Qualifier is scoring intent now.",
  learned: [
    { k: "Intent", v: "Prenatal massage, this week" },
    { k: "Channel", v: "Missed call → SMS callback" },
  ],
  agentActivity: { agent: "Qualifier", glyph: "Q", verb: "Scoring intent", status: "in-flight", since: "12:04" },
  transcript: [
    { who: "lead", text: "Hi — I called about a prenatal massage but no one picked up. Anything this week?" },
    { who: "agent", text: "So sorry we missed you! Checking prenatal openings this week now — which days work best?" },
  ],
};

const LD_STORE = {
  arrived: false,
  arrive() {
    if (!window.__DEMO_MODE) return; // scripted lead is demo theater
    if (this.arrived) return;
    this.arrived = true;
    LEADS.unshift(LD_ARRIVAL);
    const src = LEAD_SOURCES.find(s => s.id === "phone");
    if (src) src.captured += 1;
    if (typeof LEADS_AGGREGATES.capturedThisWeek === "number") LEADS_AGGREGATES.capturedThisWeek += 1;
    window.dispatchEvent(new CustomEvent("leads:arrived", { detail: { leadId: LD_ARRIVAL.id, phase: "arrived" } }));
    // Beat 2 — Qualifier finishes scoring; the same row updates in place.
    setTimeout(() => {
      LD_ARRIVAL.stage = "qualifying";
      LD_ARRIVAL.fit = 0.78;
      LD_ARRIVAL.age = "1m"; LD_ARRIVAL.ageMin = 1;
      LD_ARRIVAL.narrative = "Missed call at 12:04, texted back within a minute. Qualifier scored 78 — prenatal cert is the constraint; Emma has Thursday 2:00 open. Books itself if she confirms a day.";
      LD_ARRIVAL.agentActivity = { agent: "Qualifier", glyph: "Q", verb: "Scored 78 · routing", status: "in-flight", since: "12:05" };
      window.dispatchEvent(new CustomEvent("leads:arrived", { detail: { leadId: LD_ARRIVAL.id, phase: "scored" } }));
    }, 9000);
  },
};
window.LD_STORE = LD_STORE;
window.LEAD_STAGES = LEAD_STAGES;
window.LEADS_AGGREGATES = LEADS_AGGREGATES;
window.SEGMENT_META = SEGMENT_META;
window.SEGMENTS_AGGREGATES = SEGMENTS_AGGREGATES;
window.FLEET_PLAYBOOKS = FLEET_PLAYBOOKS;
window.SEG_MOVEMENT = SEG_MOVEMENT;
window.SEGMENT_HEALTH = SEGMENT_HEALTH;
window.SEG_GUARDRAILS = SEG_GUARDRAILS;
window.LEAD_SOURCES = LEAD_SOURCES;
