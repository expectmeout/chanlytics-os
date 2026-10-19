import { REPORT_LENSES, lensRoute } from "../reports/lenses.js";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address.js";
const lensJump = (lens) => ({
  label: `Reports \u203A ${lens.label}`,
  to: lensRoute(lens.id),
  kind: "page",
  sub: lens.sub
});
const LENS_JUMPS = REPORT_LENSES.filter((l) => l.id !== "overview" && l.shownWhen === "always").map(
  lensJump
);
export const ASK_PAGES = [
  { label: "Today", to: "today", kind: "page" },
  { label: "Inbox", to: "inbox", kind: "page" },
  { label: "People", to: "clients", kind: "page" },
  // Leads is the other scope of People, and it is its own place to an owner: the businesses
  // a search found, worked. `leads` was the mockup's page and is not offered.
  { label: "Leads", to: "clients/leads", kind: "page", sub: "businesses Claude found for you" },
  // People's third scope, every workspace's (0008, amended 18 Oct 2026: deals for everyone).
  { label: "Pipeline", to: "clients/pipeline", kind: "page", sub: "your deals, by stage", also: ["deals"] },
  // The lists are a view of People (its rail); `segments/<id>` still names one and lands there.
  { label: "Lists", to: "clients", kind: "page", sub: "the people you keep together, on People", also: ["segments"] },
  { label: "Conversations", to: "conversations", kind: "page" },
  { label: "Calls", to: "live", kind: "page", sub: "live and recent" },
  { label: "Calendar", to: "calendar", kind: "page", sub: "taken, open and closed times" },
  // Campaigns (3 Oct 2026), which is Sequences (decision 0060): what goes out on its own, and what is sent by hand. The old
  // Playbooks list was `outbound`, which lands here; the name it went by still finds it.
  {
    label: "Campaigns",
    to: SEQUENCES_ROUTE,
    kind: "page",
    sub: "what goes out on its own, and what you send yourself",
    also: ["playbooks", "moments"]
  },
  // Campaigns › Sequences by its own name, and by what the old pages were called: Sent's list went to each sequence's
  // History (D3), so its names find it.
  {
    label: "Sequences",
    to: "campaigns/sequences",
    kind: "page",
    sub: "everything that sends on its own",
    also: ["automations", "follow-ups", "drip", "sent", "broadcasts"]
  },
  // Campaigns' Messages (D4: it was the Library), found too by the names it went by, which people learned and still type.
  {
    label: "Messages",
    to: "messages",
    kind: "page",
    sub: "the wording the receptionist and the campaigns send",
    also: ["templates", "library", "wording"]
  },
  { label: "Reports", to: "reports", kind: "page" },
  ...LENS_JUMPS,
  { label: "Settings", to: "admin/workspace", kind: "page" },
  {
    label: "Hours & booking",
    to: "admin/hours",
    kind: "page",
    sub: "opening hours, closed days, booking rules",
    also: ["hours", "booking link", "booking tool"]
  },
  {
    label: "How it answers",
    to: "admin/receptionist",
    kind: "page",
    sub: "the receptionist's voice, languages and notes",
    also: ["voice", "greeting", "languages"]
  },
  {
    label: "Setting up",
    to: "start",
    kind: "page",
    sub: "the four steps to a receptionist that answers",
    also: ["setup"]
  },
  { label: "Billing", to: "admin/billing", kind: "page" },
  { label: "Activity", to: "admin/activity", kind: "page", sub: "who did what, for owners" },
  { label: "Profile", to: "admin/profile", kind: "page", sub: "your name and how you sign in" },
  { label: "Autonomy", to: "admin/autonomy", kind: "page", sub: "what the receptionist may do alone" },
  { label: "Team", to: "admin/team", kind: "page", sub: "members and invitations" },
  { label: "Notifications", to: "admin/notifications", kind: "page" },
  { label: "Connections", to: "admin/integrations", kind: "page", sub: "WhatsApp, phone line, calendar" },
  // A partner's account and link (0012): beside Profile in a partner's rail, and a row on Profile for everyone else.
  { label: "Partner", to: "admin/partner", kind: "page", sub: "bring a business to Chanlytics" },
  // What the receptionist knows beyond the business's details lives in How it answers; the AI memory pane says it is not
  // built and points here, so its name lands here too, never on that pane (#417).
  {
    label: "Receptionist memory",
    to: "admin/receptionist",
    kind: "page",
    sub: "notes and your own words, in How it answers",
    also: ["ai memory"]
  }
];
const BACK_OFFICE = {
  label: "Back office",
  to: "admin/platform",
  kind: "page",
  sub: "every workspace, for Chanlytics staff"
};
export function askPages(has) {
  return has.platformAdmin ? [...ASK_PAGES, BACK_OFFICE] : [...ASK_PAGES];
}
export function askJump(query, index, limit = 6) {
  const s = query.trim().toLowerCase();
  if (s.length < 2 || s.split(/\s+/).length > 3 || /[?¿]$/.test(s)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (e) => {
    if (seen.has(e.to)) return;
    seen.add(e.to);
    out.push(e);
  };
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().startsWith(s)) push(p);
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().includes(s)) push(p);
  for (const p of index) if (p.kind === "page" && (p.also ?? []).some((w) => w.toLowerCase().includes(s))) push(p);
  for (const p of index) if (p.kind !== "page" && p.label.toLowerCase().includes(s)) push(p);
  return out.slice(0, limit);
}
