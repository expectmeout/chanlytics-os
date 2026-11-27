/**
 * The data layer, read from the schema (decision 0111): the links between tables and the indexes that serve them, read
 * off supabase/schema.sql as pg prints it. data.test.mjs holds every link to an index, or to a reason it has none, and
 * keeps the reading honest on a schema written for it. The dashboard's service-role statements that name no workspace
 * are counted beside the edge's, in _measures.mjs.
 */
import { statementsOf } from "../../../tooling/scripts/gen/schema-snapshot.mjs";

const columnsOf = (list) =>
  list
    .split(",")
    .map((c) => c.trim().replace(/"/g, "").split(/\s+/)[0])
    .filter(Boolean);

/**
 * Every link between tables in the public schema (`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY (…) REFERENCES …`), as
 * `{ table, name, columns, parent }`, and the column lists the indexes on each table lead with: a `CREATE [UNIQUE]
 * INDEX … ON public.t USING … (…)`, a primary key or a unique constraint.
 */
export function linksAndIndexesOf(sql) {
  const links = [];
  const indexes = new Map();
  const add = (table, columns) => (indexes.get(table) ?? indexes.set(table, []).get(table)).push(columns);
  for (const { text } of statementsOf(sql)) {
    const flat = text.replace(/\s+/g, " ");
    const fk =
      /^ALTER TABLE (?:ONLY )?public\.(\w+) ADD CONSTRAINT (\w+) FOREIGN KEY \(([^)]*)\) REFERENCES (\w+)\.(\w+)\(/.exec(
        flat,
      );
    if (fk) links.push({ table: fk[1], name: fk[2], columns: columnsOf(fk[3]), parent: `${fk[4]}.${fk[5]}` });
    const key =
      /^ALTER TABLE (?:ONLY )?public\.(\w+) ADD CONSTRAINT \w+ (?:PRIMARY KEY|UNIQUE(?: NULLS NOT DISTINCT)?) \(([^)]*)\)/.exec(
        flat,
      );
    if (key) add(key[1], columnsOf(key[2]));
    const index = /^CREATE (?:UNIQUE )?INDEX \w+ ON (?:ONLY )?public\.(\w+) USING \w+ \(([^)]*)\)/.exec(flat);
    if (index) add(index[1], columnsOf(index[2]));
  }
  return { links, indexes };
}

/**
 * Whether an index serves a link: one that leads with the link's columns, in any order, or, for a link that carries
 * the workspace beside its parent (`(tenant_id, conversation_id)`), one that leads with the parent's own columns: the
 * planner finds the parent's rows by that index and checks the workspace on them, so a delete of the parent reads only
 * those.
 */
export function servedBy(columns, tableIndexes) {
  const own = columns.filter((c) => c !== "tenant_id");
  const leads = (index, cols) => cols.length > 0 && cols.every((c) => index.slice(0, cols.length).includes(c));
  return tableIndexes.some((index) => leads(index, columns) || (own.length < columns.length && leads(index, own)));
}

/** The links no index serves, each with its key, `table.column[+column]`. */
export function linksWithoutAnIndex(sql) {
  const { links, indexes } = linksAndIndexesOf(sql);
  return links
    .filter((l) => !servedBy(l.columns, indexes.get(l.table) ?? []))
    .map((l) => ({ ...l, key: `${l.table}.${l.columns.join("+")}` }));
}

/**
 * The links left with no index, each with why. A link with no index makes the database read the whole child table when
 * its parent row is deleted or its key changes, and a join from the parent reads it all too: these are links whose
 * parent never goes, on a table where another index would cost every write.
 */
export const LINKS_LEFT_UNINDEXED = {
  "jobs.kind":
    "job_kinds is a registry its migrations write and nothing deletes from, and jobs is the busiest table there is: an index on kind would cost every enqueue and claim to serve a delete that never comes",
};

/**
 * The dashboard's modules that take the service role, each with why: the client with row-level security off, so what a
 * module reads or writes there is fenced by its own code and not by the database. A member's own read and act go on the
 * member's session or through a SQL door that asks who is calling (lane 2 of the code refinement plan, 25 Nov 2026:
 * 108 reaches in 65 modules came down to these, migration 00717). What is left is what no member may do from a browser:
 * the platform's own, a public page, a clock or a machine's door, an invitation before the person is a member, and the
 * server's own work after the route's checks (the ledgers, storage, bytes it proved, what the model wrote, a door that
 * takes what the route worked out). data.test.mjs holds the list to the code both ways; the count is the
 * `service-role` measure's, which may only fall.
 */
export const SERVICE_ROLE_KEPT = {
  // The platform's own, and what every page reports to it.
  "apps/dashboard/src/server/shared/back-office.ts":
    "The Console: platform staff act on every workspace, through the BackOffice handle made here alone (decision 0066)",
  "apps/dashboard/src/server/console/health.ts":
    "An error a member's page hit, kept for Health (client_errors, 00469): the platform's table, which no session reads or writes",
  "apps/dashboard/src/server/console/report.ts":
    "A problem a member reports: the platform's table, named to a workspace only where the member belongs; no session writes it",
  "apps/dashboard/src/server/console/vitals.ts":
    "A page load's timings (page_vitals, 00255): the platform's measure, naming no person or workspace, which no session writes",
  "apps/dashboard/src/server/shared/rate-limit.ts":
    "The rate limiter: every request is counted (rate_hits), before a member is known or with none",
  "apps/dashboard/src/server/shared/log.ts":
    "The pager's memory of a read that stopped at the 1,000-row cap (operator_pages, decision 0149): a platform row no member may write",
  // A page anyone may open, and a door with no member behind it.
  "apps/dashboard/src/server/public/facts.ts": "A workspace's public page, read by its slug with no session",
  "apps/dashboard/src/server/public/link-page.ts": "A public link page, read with no session",
  "apps/dashboard/src/server/public/live-forms.ts": "A public site's live forms, read with no session",
  "apps/dashboard/src/server/ask/voice-door.ts":
    "The voice provider's call into Ask: the session row is read by the hash the provider carries, before any member is known",
  "apps/dashboard/src/server/ask/notice/sweep.ts": "A clock across every business whose morning it is: no member",
  "apps/dashboard/src/server/content/week-made.ts":
    "The edge's signed door for a week AI makes under the owner's rung (00714): no member, the service role at the doors",
  // Before the person is a member.
  "apps/dashboard/src/server/workspace/signup.ts": "The waitlist, joined before there is an account (deny-all)",
  "apps/dashboard/src/server/workspace/handover.ts":
    "A workspace handed to its owner: the platform's invitation to an address that is not yet a member",
  "apps/dashboard/src/server/workspace/team.ts":
    "An invitation sent, read and seated by the address before the person is a member; and the team's doors (00277), which take the session's verified user as their actor and check the owner themselves",
  // The server's own work after the route's checks.
  "apps/dashboard/src/server/shared/ledgers/jobs.ts": "The jobs ledger: what happens later, which no session may write",
  "apps/dashboard/src/server/shared/storage.ts":
    "Storage: no policy on storage.objects lets a session write, and the media bucket is private; a caller is handed a bucket, never the client",
  "apps/dashboard/src/server/files/upload.ts":
    "A file filed after the server proved its bytes (file_found): no file is filed on a member's word alone",
  "apps/dashboard/src/server/posts/make.ts":
    "What AI made, kept as a file after the server stored its bytes (file_made, 00553)",
  "apps/dashboard/src/server/posts/caption.ts":
    "How a piece was made keeps its words (files.made, a piece's plan), written by the server alone",
  "apps/dashboard/src/server/posts/google.ts":
    "A post's attempt at Google and its moves (post_attempts, post_moved): every move of a post is the service role's door",
  "apps/dashboard/src/server/leads/suggestions.ts":
    "The ideas the model writes for a search: no member writes lead_suggestions (00142), and its one writer is the service role's (00400)",
  "apps/dashboard/src/server/leads/send.ts":
    "A cold email judged and sent: the mailbox's day, the draft's facts, the person it makes and the email's row are the send door's (00424, 00429)",
  "apps/dashboard/src/server/campaigns/ports.ts":
    "A broadcast assembled whole with its send job (assemble_broadcast, 00282), and those past the month's allowance held: no session puts a job on the ledger",
  "apps/dashboard/src/server/campaigns/reach-out-leads.ts":
    "What a lead wrote back, with the plan the dashboard made (reach_out_reply_said, 00429): a door that takes what the route worked out",
  "apps/dashboard/src/server/campaigns/reach-outs/chain-acts.ts":
    "A sequence to leads saved whole after the route checked the chain (reach_out_save, held no session's by privileges.db.test.mjs)",
  "apps/dashboard/src/server/campaigns/template-versions.ts":
    "A message's version filed with its category after the route's checks (create_message_version, 00343: no session's)",
  "apps/dashboard/src/server/people/erase-contact.ts":
    "An erasure (decision 0036): its legs reach storage, the provider and rows no member may write",
  // A read the server makes for a member that the member may not make: the answer would reach their browser.
  "apps/dashboard/src/server/workspace/config-row.ts":
    "The settings as stored where a member's own read hides an address (tenant_config is the owner's to read): the calendar feed's link opens the owner's calendar, so a door a member's session could call would hand it to their browser; the server reads it whole for the member's own sends and never answers it",
};
