/**
 * The palette's jump: the pages a real workspace has (ASK_PAGES, and askPages with the two a workspace has only
 * sometimes), and a few typed words matched against them and against the people, threads and calls the browser already
 * holds (askJump). A question is not a jump.
 */

/* ------------------------------------------------------------------- jump */

export interface JumpEntry {
  label: string;
  to: string;
  kind: "page" | "person" | "thread" | "call";
  sub?: string;
  /**
   * Other words that find this page. A page is not always called what someone
   * types: Templates was "Messages" until the word came to mean three things,
   * and a person who learned it then still types it. Matched after the label,
   * so the name a page goes by always wins.
   */
  also?: readonly string[];
}

/**
 * The pages every real workspace has. Nothing here is seeded or demo-only, and every real page is here or in askPages
 * (ask-jumps.test.mjs holds it against the shell's registry): the list once stopped at the pages that were real before
 * the Calendar, Lists, Campaigns, Setup, Billing and Activity shipped, so ⌘K "calendar" offered only to ask about it
 * (the wiring audit's N18).
 */
export const ASK_PAGES: JumpEntry[] = [
  { label: "Today", to: "today", kind: "page" },
  { label: "Inbox", to: "inbox", kind: "page" },
  { label: "People", to: "clients", kind: "page" },
  // Leads is the other scope of People, and it is its own place to an owner: the businesses
  // a search found, worked. `leads` was the mockup's page and is not offered.
  { label: "Leads", to: "clients/leads", kind: "page", sub: "businesses Claude found for you" },
  // The lists are a view of People (its rail); `segments/<id>` still names one and lands there.
  { label: "Lists", to: "clients", kind: "page", sub: "the people you keep together, on People", also: ["segments"] },
  { label: "Conversations", to: "conversations", kind: "page" },
  { label: "Calls", to: "live", kind: "page", sub: "live and recent" },
  { label: "Calendar", to: "calendar", kind: "page", sub: "taken, open and closed times" },
  { label: "Playbooks", to: "outbound", kind: "page", sub: "campaigns that run on their own" },
  { label: "Broadcasts", to: "broadcasts", kind: "page", sub: "one message to the people who said yes" },
  {
    label: "Templates",
    to: "messages",
    kind: "page",
    sub: "the wording the receptionist and the campaigns send",
    also: ["messages", "wording"],
  },
  { label: "Reports", to: "reports", kind: "page" },
  { label: "Settings", to: "admin/workspace", kind: "page" },
  {
    label: "Setting up",
    to: "start",
    kind: "page",
    sub: "the four steps to a receptionist that answers",
    also: ["setup"],
  },
  { label: "Billing", to: "admin/billing", kind: "page" },
  { label: "Activity", to: "admin/activity", kind: "page", sub: "who did what, for owners" },
  { label: "Profile", to: "admin/profile", kind: "page", sub: "your name and how you sign in" },
  { label: "Autonomy", to: "admin/autonomy", kind: "page", sub: "what the receptionist may do alone" },
  { label: "Team", to: "admin/team", kind: "page", sub: "members and invitations" },
  { label: "Notifications", to: "admin/notifications", kind: "page" },
  { label: "Connections", to: "admin/integrations", kind: "page", sub: "WhatsApp, phone line, calendar" },
  // A partner's account and link (0012): in every workspace's rail, beside Profile.
  { label: "Partner", to: "admin/partner", kind: "page", sub: "bring a business to Chanlytics" },
  // What the receptionist knows lives in Business details; the AI memory pane says it is not built and points here, so
  // its name lands here too, never on that pane (#417).
  {
    label: "Receptionist memory",
    to: "admin/workspace",
    kind: "page",
    sub: "hours, services and notes, in Business details",
    also: ["ai memory"],
  },
];

/** What a workspace has, of the pages it has only sometimes. */
interface AskPagesHas {
  /** Deals are on here: People's surface says so (0008), and People draws the Pipeline as its third scope. */
  dealsOn: boolean;
  /** The person is Chanlytics staff: the rail draws the back office for them alone. */
  platformAdmin: boolean;
}

/**
 * The Pipeline: People's third scope where deals are on (0008, people.jsx plScopes). Where they are off its address
 * draws People, so it is no jump there.
 */
const PIPELINE: JumpEntry = {
  label: "Pipeline",
  to: "clients/pipeline",
  kind: "page",
  sub: "your deals, by stage",
  also: ["deals"],
};

/** The back office, Chanlytics staff's alone (settings.jsx SET_TABS_PLATFORM); anyone else there lands on Profile. */
const BACK_OFFICE: JumpEntry = {
  label: "Back office",
  to: "admin/platform",
  kind: "page",
  sub: "every workspace, for Chanlytics staff",
};

/** The pages this workspace has, for this person: every workspace's, the Pipeline after Leads, and the back office. */
export function askPages(has: AskPagesHas): JumpEntry[] {
  const out: JumpEntry[] = [];
  for (const p of ASK_PAGES) {
    out.push(p);
    if (p.to === "clients/leads" && has.dealsOn) out.push(PIPELINE);
  }
  if (has.platformAdmin) out.push(BACK_OFFICE);
  return out;
}

/**
 * Two words jump to a page, a person, a thread or a call from what the browser already holds. A question mark or a
 * long sentence is a question, not a jump.
 */
export function askJump(query: string, index: JumpEntry[], limit = 6): JumpEntry[] {
  const s = query.trim().toLowerCase();
  if (s.length < 2 || s.split(/\s+/).length > 3 || /[?¿]$/.test(s)) return [];
  const out: JumpEntry[] = [];
  const seen = new Set<string>();
  const push = (e: JumpEntry) => {
    if (seen.has(e.to)) return;
    seen.add(e.to);
    out.push(e);
  };
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().startsWith(s)) push(p);
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().includes(s)) push(p);
  // Then the other words a page answers to, so a name it used to go by still finds it.
  for (const p of index) if (p.kind === "page" && (p.also ?? []).some((w) => w.toLowerCase().includes(s))) push(p);
  for (const p of index) if (p.kind !== "page" && p.label.toLowerCase().includes(s)) push(p);
  return out.slice(0, limit);
}
