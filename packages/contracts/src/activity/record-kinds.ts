/**
 * The kinds of record a workspace holds, and the tables the live feed tells a workspace of for each (decision 0047,
 * point 3). A page names the kinds it draws (`reads`); the tables it hears are derived from them (`liveTablesOf`), not
 * written beside its reads, so a page that starts to draw a record says so in the one place the feed is read from.
 *
 * Only tables the database tells a workspace of are named (packages/db realtime.ts WATCHED, which the each-workspace-is-told
 * database test holds equal to the triggers): the kinds below list those and no others, each in exactly one kind, and the
 * dashboard's declared-reads test holds this table equal to WATCHED. A table is a kind's when the page that draws the kind
 * draws the table's rows: `conversation` is the thread and its messages, `visit` a booking and the booking email held for a
 * look, `channel` everything Connections draws of how the business is reached.
 *
 * Storage's own words for the tables (docs/glossary.md): the feed names a table as the database does.
 */
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
    "business_records",
  ],
  team: ["memberships", "invitations"],
  workspace: ["tenants"],
  notification: ["notifications"],
  billing: ["billing_accounts"],
} as const satisfies Record<string, readonly string[]>;

/** A kind of record a page can draw. */
export type RecordKind = keyof typeof RECORD_KINDS;

/** A table the live feed tells a workspace of: one of some kind's. */
export type RecordTable = (typeof RECORD_KINDS)[RecordKind][number];

/**
 * The tables whose changes are told for these kinds, each once, in the order the kinds are named and each kind's tables
 * as RECORD_KINDS lists them: what a page that draws the kinds hears, before it says it leaves a table of one unheard.
 */
export function liveTablesOf(kinds: readonly RecordKind[]): RecordTable[] {
  const tables: RecordTable[] = [];
  for (const kind of kinds) for (const table of RECORD_KINDS[kind]) if (!tables.includes(table)) tables.push(table);
  return tables;
}
