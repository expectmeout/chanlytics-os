export const RECORD_KINDS = {
  person: ["contacts"],
  conversation: ["messages", "conversations"],
  call: ["calls"],
  hold: ["escalations"],
  visit: ["appointments", "appointment_notices"],
  step: ["person_notes"],
  deal: ["deals"],
  list: ["segments", "segment_members"],
  lead: ["leads", "lead_searches", "lead_rounds", "lead_search_members"],
  campaign: ["sequences", "sequence_steps"],
  send: ["sequence_batches"],
  template: ["templates"],
  reach_out: ["sequence_replies"],
  review: ["google_reviews", "google_listings", "google_connections"],
  facts: ["tenant_config"],
  rules: ["policies"],
  channel: [
    "tenant_channels",
    "lines",
    "mailboxes",
    "mailbox_connections",
    "capability_activations",
    "business_records"
  ],
  team: ["memberships", "invitations"],
  workspace: ["tenants"],
  notification: ["notifications"],
  billing: ["billing_accounts"],
  /** What a connection brought in, and what the Business Profile and the website say (decision 0073). */
  brought: ["imports", "business_reads"],
  /** A conversation rehearsed, or a call reviewed (decision 0069). */
  rehearsal: ["rehearsals"]
};
export function liveTablesOf(kinds) {
  const tables = [];
  for (const kind of kinds) for (const table of RECORD_KINDS[kind]) if (!tables.includes(table)) tables.push(table);
  return tables;
}
