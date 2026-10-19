export const EXPORT_SECTIONS = [
  "people",
  "conversations",
  "files",
  "calls",
  "consent_history",
  "notes_and_steps",
  "deals",
  "business",
  "team",
  "bookings",
  "lists",
  "list_members",
  "campaigns",
  "sends",
  "templates",
  "holds",
  "rules",
  "reviews",
  "leads",
  "reach_out_replies"
];
export const EXPORT_OF = {
  person: { section: "people" },
  conversation: { section: "conversations" },
  call: { section: "calls" },
  hold: { section: "holds" },
  visit: { section: "bookings" },
  step: { section: "notes_and_steps" },
  deal: { section: "deals" },
  list: { section: "lists" },
  lead: { section: "leads" },
  campaign: { section: "campaigns" },
  send: { section: "sends" },
  template: { section: "templates" },
  reach_out: { section: "reach_out_replies" },
  review: { section: "reviews" },
  facts: { section: "business" },
  rules: { section: "rules" },
  channel: {
    not_exported: {
      what: "The business's numbers, mailboxes and connections",
      why: "They hold the providers' credentials, and each provider keeps its own record of them; Settings \u203A Connections lists them."
    }
  },
  team: { section: "team" },
  workspace: { derived: "The file's header: the workspace's name, zone and id, and when the copy was taken." },
  notification: {
    not_exported: {
      what: "The bell's notices",
      why: "Each one says again what a section of the file holds, and they are cleared as they are read."
    }
  },
  billing: {
    not_exported: {
      what: "The subscription and its invoices",
      why: "The payment provider holds them; Settings \u203A Billing opens them."
    }
  }
};
const LEFT_OUT_BESIDE_THE_KINDS = [
  {
    what: "Call audio",
    why: "It is removed on the schedule the privacy policy states; each call's transcript is in calls."
  },
  {
    what: "The activity log",
    why: "Each change it records is in the section of the record it changed, and every consent change is in consent_history."
  }
];
export const EXPORT_HOLDS_WORDS = "People, conversations with their messages and a link to each file a customer sent, which opens for a day, calls with their transcripts, every consent change with who recorded it, notes and steps, deals, your business details, the team, bookings, lists, campaigns and what each sent, templates, holds, the receptionist's rules, Google reviews, leads, and how each reply from a lead was read.";
export function exportLeftOutWords() {
  const what = exportLeftOut().map((l) => l.what.charAt(0).toLowerCase() + l.what.slice(1));
  return `Not in it: ${what.slice(0, -1).join("; ")}; and ${what.at(-1) ?? ""}. The end of the file says why for each.`;
}
export function exportLeftOut() {
  const kinds = [];
  for (const how of Object.values(EXPORT_OF))
    if ("not_exported" in how) kinds.push(how.not_exported);
  return [...kinds, ...LEFT_OUT_BESIDE_THE_KINDS];
}
export function exportedSections() {
  const named = /* @__PURE__ */ new Set();
  for (const how of Object.values(EXPORT_OF)) if ("section" in how) named.add(how.section);
  return EXPORT_SECTIONS.filter((s) => named.has(s));
}
export const PERSON_EXPORT_SECTIONS = [
  "people",
  "conversations",
  "files",
  "calls",
  "consent_history",
  "notes_and_steps",
  "deals",
  "bookings",
  "lists",
  "list_members",
  "sends",
  "holds",
  "rules",
  "leads",
  "reach_out_replies"
];
const PERSON_LEAVES_OUT = {
  business: {
    what: "The business's own details",
    why: "They are the workspace's, not this person's; the workspace's own copy holds them."
  },
  team: {
    what: "The team",
    why: "Each member is the workspace's; who did something to their record is said on it, as `author_user_id`, `created_by` or `added_by`."
  },
  campaigns: {
    what: "The campaigns",
    why: "A campaign is the workspace's; what each of its runs sent them is in sends, and each message as they received it is in conversations."
  },
  templates: {
    what: "The templates",
    why: "A template is the workspace's; each message written from one is in conversations, as they received it."
  },
  reviews: {
    what: "Google reviews",
    why: "A review is tied to no one in the record: Google names its author as they chose to be shown. The workspace's own copy holds them."
  }
};
const PERSON_LEFT_OUT_BESIDE = [
  {
    what: "Which lists made by a rule they are on",
    why: "A list made by a rule holds whoever its rule matches as the record stands; lists holds the lists they were put on by hand, and the workspace's own copy holds each rule."
  }
];
export function personExportLeftOut() {
  return [...Object.values(PERSON_LEAVES_OUT), ...PERSON_LEFT_OUT_BESIDE, ...LEFT_OUT_BESIDE_THE_KINDS];
}
