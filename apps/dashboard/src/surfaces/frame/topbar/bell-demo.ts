/**
 * The demo's seeded bell notes (moved from legacy/components/topbar.jsx, the one-system plan's step 7d; demo mode kept,
 * Ruben, 20 Oct 2026). Demo theater (Aisha's refund, a trust milestone, a Gmail outage): none of it happened, so only a
 * demo session reads them (bell-demo-acts.tsx), and a real workspace's bell draws the server's rows alone.
 */
import type { BellNote } from "./notif-popover";

/** A seeded note: a bell note, with the seeded thread it is about where it has one. */
export interface DemoNote extends BellNote {
  threadId?: string;
  seg?: { dir: string };
  intId?: string;
}

export const TB_NOTIFS: readonly DemoNote[] = [
  {
    id: "n1",
    icon: "alert",
    tone: "accent",
    unread: true,
    time: "2m",
    threadId: "th-aisha-refund",
    title: "Aisha Khan — refund request",
    message: "Phone Rep holds a 4:30 resolution-call slot — needs your go.",
    actions: [
      { label: "Decide", to: "inbox/th-aisha-refund", primary: true },
      { label: "Open client", to: "clients/c-aisha" },
    ],
  },
  {
    id: "n-trust",
    icon: "trending-up",
    tone: "accent",
    unread: true,
    time: "9m",
    title: "Email Agent is earning more autonomy",
    message:
      "7 clean approvals in a row on Re-engage — 3 more unlocks the veto window (drafts send unless you stop them).",
    actions: [
      { label: "Review agent", to: "fleet/email-agent", primary: true },
      { label: "Policy matrix", to: "admin/autonomy" },
    ],
  },
  {
    id: "n2",
    icon: "phone",
    tone: "ok",
    unread: true,
    time: "12m",
    title: "Call completed — Maya Rodriguez",
    message: "Booked deep tissue 60 (+$280) · referral mentioned.",
    actions: [{ label: "Transcript", to: "conversations/cv-maya-call", primary: true }],
  },
  {
    id: "n-seg1",
    icon: "users",
    tone: "warn",
    unread: true,
    time: "28m",
    seg: { dir: "in" },
    title: "Drifting VIPs — Yuki Tanaka entered",
    message: "30 days since her last visit. VIP drift watch started — outreach paused until May 1 per her ask.",
    actions: [
      { label: "Open list", to: "segments/drifting-vips", primary: true },
      { label: "Client", to: "clients/c-yuki" },
    ],
  },
  {
    id: "n3",
    icon: "x",
    tone: "danger",
    unread: true,
    time: "1h",
    intId: "gmail",
    title: "Task failed — nurture send",
    message: "Gmail token expiring; send queued until reauthorized.",
    actions: [
      { label: "Reconnect", to: "admin/integrations", primary: true },
      { label: "View task", to: "tasks" },
    ],
  },
  {
    id: "n4",
    icon: "calendar",
    tone: "warn",
    unread: false,
    time: "2h",
    title: "No-show risk — Priya Shah",
    message: "Rescheduled 2× · 2:45 PM hot stone today.",
    actions: [{ label: "Calendar", to: "calendar/a-priya", primary: true }],
  },
  {
    id: "n-seg2",
    icon: "users",
    tone: "ok",
    unread: false,
    time: "6h",
    seg: { dir: "out" },
    title: "Lapsed 60+ — Sam Rivera left",
    message: "Booked after win-back touch 2 (+$120). Recovery Agent closed the sequence.",
    actions: [
      { label: "Open list", to: "segments/lapsed-60", primary: true },
      { label: "In Reports", to: "reports" },
    ],
  },
  {
    id: "n5",
    icon: "deal",
    tone: "ok",
    unread: false,
    time: "1d",
    title: "Deal won — Amy Goldberg",
    message: "12-pack renewal · $900.",
    actions: [{ label: "Pipeline", to: "pipeline", primary: true }],
  },
  {
    id: "n6",
    icon: "shield",
    tone: "",
    unread: false,
    time: "2d",
    title: "Milestone — Phone Rep",
    message: "Earned booking auto-approval after 10 clean approvals.",
    actions: [{ label: "View agent", to: "fleet/phone-rep", primary: true }],
  },
];
