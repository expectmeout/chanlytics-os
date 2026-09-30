/* global window */
// Chanlytics — Pipeline seed data
// Deals carry agent attribution (who's working it, what happens next) and
// link to client profiles where the person exists in the book.

const PIPELINE_STAGES = [
  { id: "new",       label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "booked",    label: "Booked" },
  { id: "won",       label: "Won" },
];

// Prior wins this week (before today's board) — stats add live session wins on top
const PIPE_BASELINE = { wonPrior: 5620, deltaLabel: "↑ 18% vs last wk" };

const PIPELINE_DEALS = [
  // ---- New ----
  { id: "d-tom", stage: "new", who: "Tom Reilly", initials: "TR", clientId: "c-tom", leadId: "ld-tom",
    label: "Intro session", value: 95, inStage: "1d",
    agent: { glyph: "E", name: "Email Agent" }, next: "Awaiting reply · follow-up Apr 29",
    source: "Google ad" },
  { id: "d-rivera-ref", stage: "new", who: "Dana Ortiz", initials: "DO2", clientId: null,
    label: "Intro session", value: 95, inStage: "3h",
    agent: { glyph: "Q", name: "Qualifier" }, next: "Scoring — IG comment lead",
    source: "Instagram" },
  { id: "d-walkin", stage: "new", who: "Priya Nair", initials: "PN", clientId: null,
    label: "Single · deep tissue", value: 120, inStage: "5h",
    agent: { glyph: "Q", name: "Qualifier" }, next: "Scored 71 — routing to SMS Agent",
    source: "Walked in" },

  // ---- Contacted ----
  { id: "d-claire", stage: "contacted", who: "Claire Dubois", initials: "CD", clientId: "c-claire",
    label: "4-pack pitch", value: 340, inStage: "2d",
    agent: { glyph: "Q", name: "Qualifier" }, next: "Package-interest reply · follow-up Apr 28",
    source: "Walked in" },
  { id: "d-noah", stage: "contacted", who: "Noah Williams", initials: "NW", clientId: null,
    label: "Intro session", value: 95, inStage: "14d",
    agent: { glyph: "E", name: "Email Agent" }, next: "Day-14 nurture opened · day-21 is last",
    source: "Yelp" },
  { id: "d-marcus", stage: "contacted", who: "Marcus Lee", initials: "ML", clientId: "c-marcus",
    label: "Win-back · 2 sessions left", value: 240, inStage: "7d",
    agent: { glyph: "X", name: "Recovery Agent" }, next: "Last nudge tomorrow 11am",
    source: "Win-back" },

  // ---- Qualified ----
  { id: "d-jordan", stage: "qualified", who: "Jordan Patel", initials: "JP", clientId: "c-jordan",
    label: "6-pack · 20% referral", value: 360, inStage: "28m",
    agent: { glyph: "P", name: "Phone Rep" }, next: "Pricing question in your Inbox",
    approval: true, threadId: "th-jordan-discount", source: "Maya referral" },
  { id: "d-natalie", stage: "qualified", who: "Natalie Perez", initials: "NP", clientId: "c-natalie",
    label: "6-pack pitch", value: 450, inStage: "1d",
    agent: { glyph: "P", name: "Phone Rep" }, next: "Pitch sent · follow-up Apr 28",
    source: "Instagram ad" },
  { id: "d-elena", stage: "qualified", who: "Elena Park", initials: "EP", clientId: null,
    label: "Win-back · 30% offer", value: 305, inStage: "10m",
    agent: { glyph: "X", name: "Recovery Agent" }, next: "Draft awaiting your approval",
    approval: true, threadId: "th-elena-followup", source: "Win-back" },

  // ---- Booked ----
  { id: "d-lin", stage: "booked", who: "Lin Chen", initials: "LC", clientId: "c-chen",
    label: "Pkg renewal · 6-pack", value: 450, inStage: "4h",
    agent: { glyph: "S", name: "SMS Agent" }, next: "Pkg-end nudge queued — usually rebuys",
    source: "Renewal" },
  { id: "d-selena", stage: "booked", who: "Selena Cho", initials: "SC2", clientId: null,
    label: "Swedish 60 · today 11:30", value: 180, inStage: "2h",
    agent: { glyph: "P", name: "Phone Rep" }, next: "On call now — confirming details",
    live: true, source: "Phone" },
  { id: "d-priya-return", stage: "booked", who: "Priya Shah", initials: "PS", clientId: "c-priya",
    label: "Hot stone 75 · today 2:45", value: 150, inStage: "2d",
    agent: { glyph: "P", name: "Phone Rep" }, next: "No-show risk — confirmation requested",
    source: "Win-back" },

  // ---- Won ----
  { id: "d-maya", stage: "won", who: "Maya Rodriguez", initials: "MR", clientId: "c-maya",
    label: "Deep tissue 60", value: 280, inStage: "2h",
    agent: { glyph: "P", name: "Phone Rep" }, next: "Review ask tomorrow 10am",
    source: "Phone" },
  { id: "d-amy", stage: "won", who: "Amy Goldberg", initials: "AG", clientId: "c-amy",
    label: "12-pack renewal", value: 900, inStage: "1d",
    agent: { glyph: "P", name: "Phone Rep" }, next: "Nothing — happy on cruise",
    source: "Renewal" },
];

window.PIPELINE_DATA = { PIPELINE_STAGES, PIPELINE_DEALS, PIPE_BASELINE };
