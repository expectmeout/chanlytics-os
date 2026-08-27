/* global window */
// Chanlytics — Tasks ledger seed data
// Every unit of agent work: pending (you), scheduled, running, done, failed.
// Failures carry the error + what the agent learned (feeds AI memory).

const TASKS = [
  { id: "t-refund", status: "pending", threadId: "th-aisha-refund", policyClass: "money", task: "Refund decision — $120", agent: "P", agentName: "Phone Rep",
    target: "Aisha Khan", when: "11:40 AM", result: "Paused — calm hold sent; 4:30 resolution call proposed.",
    link: { label: "Decide in Inbox", to: "inbox/th-aisha-refund" } },
  { id: "t-discount", status: "pending", threadId: "th-jordan-discount", policyClass: "money", task: "Pricing question — intro-call offer", agent: "P", agentName: "Phone Rep",
    target: "Jordan Patel", when: "11:14 AM", result: "Intro-call offer drafted — Thursday 2:00 / 4:30.",
    link: { label: "Decide in Inbox", to: "inbox/th-jordan-discount" } },
  { id: "t-winback", status: "pending", threadId: "th-elena-followup", policyClass: "reengage", task: "Win-back send — offer-free check-in", agent: "X", agentName: "Recovery Agent",
    target: "Elena Park", when: "11:32 AM", result: "Offer-free draft ready — no active discount campaign.",
    link: { label: "Review draft", to: "inbox/th-elena-followup" } },
  { id: "t-verdict-timer", status: "scheduled", threadId: "th-verdict-gabby", task: "Verdict auto-file — Gabby → Interested", agent: "Q", agentName: "Qualifier",
    target: "Gabby Moreno", when: "in 48h", result: "Deadman switch — unanswered verdicts file as Interested, never as a deal.", noRetry: true,
    link: { label: "Record the verdict", to: "inbox/th-verdict-gabby" } },
  { id: "t-call", status: "running", task: "Inbound call — booking", agent: "P", agentName: "Phone Rep",
    target: "Selena Cho", when: "now · 0:42", result: "Confirming Swedish 60 for 11:30 today, discussing add-on.",
    link: { label: "Live monitor", to: "live" } },
  { id: "t-birthday", status: "scheduled", policyClass: "campaign", task: "Birthday offer — batch of 8", agent: "S", agentName: "SMS Agent",
    target: "8 clients", when: "Today 5:00 PM", result: "Queued — sends automatically unless paused.",
    link: { label: "View clients", to: "clients" } },
  { id: "t-review", status: "scheduled", task: "Review request", agent: "R", agentName: "Review Bot",
    target: "Maya Rodriguez", when: "Tomorrow 10:00 AM", result: "Auto-send after yesterday's 5★ visit." },
  { id: "t-nudge", status: "scheduled", task: "Last win-back nudge", agent: "X", agentName: "Recovery Agent",
    target: "Marcus Lee", when: "Tomorrow 11:00 AM", result: "Final sequence step — stops after this per your cadence rule." },
  { id: "t-resched", status: "done", task: "Reschedule Fri → Sat", agent: "P", agentName: "Phone Rep",
    target: "Maya Rodriguez", when: "11:37 AM", result: "Handled end-to-end in 4 minutes — client confirmed.",
    learning: "Maya prefers Lena, weekend mornings — saved to AI memory",
    link: { label: "Transcript", to: "conversations" } },
  { id: "t-booking", status: "done", task: "Booked deep tissue 60", agent: "P", agentName: "Phone Rep",
    target: "Maya Rodriguez", when: "9:42 AM", result: "+$280 booked · referral mention triggered Jordan's flow.",
    learning: "Member-referred leads may get the referrer's rate — saved to AI memory",
    link: { label: "Transcript", to: "conversations" } },
  { id: "t-qualify", status: "done", task: "Lead scoring — IG ad batch", agent: "Q", agentName: "Qualifier",
    target: "3 new leads", when: "11:12 AM", result: "84/100 top score → routed to Phone Rep; 2 parked in nurture." },
  { id: "t-escalate", status: "done", threadId: "th-david-complaint", task: "Complaint escalation", agent: "I", agentName: "Chat Agent",
    target: "David Chen", when: "10:57 AM", result: "No reply sent — HR-sensitive, handed straight to you.",
    link: { label: "Open thread", to: "inbox/th-david-complaint" } },
  { id: "t-sms-fail", status: "failed", task: "Package-expiry reminder SMS", agent: "S", agentName: "SMS Agent",
    target: "David Okafor", when: "10:14 AM", result: "SMS bounced.",
    error: "Carrier rejected — number opted out of SMS on Apr 20.",
    retry: "Auto-retried via email 10:16 AM ✓ delivered",
    learning: "David's channel preference switched to email — saved to AI memory" },
  { id: "t-gmail-fail", status: "failed", task: "Nurture send — day 14", agent: "E", agentName: "Email Agent",
    target: "Noah Williams", when: "Apr 25 · 4:02 PM", result: "Send deferred.",
    error: "Gmail token expiring — provider returned auth warning.",
    retry: "Queued · sends automatically once Gmail is reauthorized",
    link: { label: "Fix in Integrations", to: "admin/integrations" } },
];

const TASKS_BASELINE = { completedToday: 41 }; // prior completions before the visible ledger

window.TASKS_DATA = {
  TASKS_BASELINE, TASKS };
