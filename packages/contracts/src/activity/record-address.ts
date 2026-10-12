import { visitRoute } from "../calendar/appointment-key";
import { pipelineRoute } from "../deals/pipeline/pipeline-views";
import { pipelineRowId } from "../deals/pipeline/pipeline-vm";
import { leadsRoute } from "../leads/lead-plan";
import { listToken } from "../people/lists/lists";
import { lensRoute, reviewRoute } from "../reports/lenses";
import type { RecordKind } from "./record-kinds";

/**
 * Where each kind of record opens, written once (decision 0047; wiring/records-not-pages, task 4.1; findings A1, A2g and
 * D1-visit-open). A link to a person, a thread, a call, a visit, a list, a lead, a campaign, a run, a message of the Library,
 * a reach-out, the reviews, the lines or the team was written by hand at each of a hundred places -- a bell row, an Activity
 * line, an Ask citation, a timeline row, a Today row, a People cell, a mail -- and each place spelled it as it remembered
 * it, so two of them could say two addresses for one record and a page could be handed a shape it did not parse. Now the
 * shape of an address is said here, by the record's kind, in the shell's own route (the word `workspacePath` turns into the
 * path), and `addressOf` is the one writer a place calls with the record it means.
 *
 * Its reader is the other direction: each page parses the param of its own address (the Inbox's thread, Conversations'
 * tab and row, the Calendar's day and visit, People's person, list, lead and deal, Campaigns' moment, Sent's run, Reports'
 * lens, Settings' pane), and the dashboard's address registry (surfaces/addresses.ts) holds those parses in one table and
 * says what each shape opens. The test that reads one against the other (tests/links/every-record-has-one-address) is what
 * keeps a writer from drifting from its page.
 *
 * Pure. It lives beside RECORD_KINDS and not under shell/, which the phone app types strictly (apps/mobile): it builds on the
 * helpers each kind's page reads its own parse from (the visit's, Leads', the Pipeline's, the lists', Reports' lenses), and
 * those reach a good deal.
 */

/**
 * A record, by its kind and what names it. The kinds are RECORD_KINDS' (record-kinds.ts) that have a page, and a kind that
 * opens as another's says so in its ref:
 *
 *   a hold is told in its thread, so it names the conversation it holds;
 *   a step is a line on its person's page, so it names the person;
 *   a deal opens its person's page, or the Pipeline with their row open (`on: "pipeline"`);
 *   a reach-out is a moment of Campaigns, open in its drawer at the first step's id, as a campaign is.
 *
 * A conversation opens in the Inbox (`inbox/th-<id>`), where its reply box is, unless it is asked for in Conversations
 * (`conversations/<id>`, its row in the list of every thread and call). A call opens in Conversations as a row
 * (`conversations/cv-<id>`), or on Live while it is going (`live/<id>`). A visit opens its panel on the Calendar, on its day
 * where the writer knows the day (visitRoute). A list is a built-in's word or a kept list's id. A lead names the lead open,
 * the search it is of, or both; with neither, Leads itself. A template is the Library's message, which is addressed by its
 * name. The reviews are the Reviews lens, and, named by a review's id, that review with its reply box open
 * (`reports/reviews:<id>`). The lines, the team, the business's facts, its rules and its bill are one pane each.
 */
export type RecordRef =
  | { kind: "person"; id: string }
  | { kind: "conversation"; id: string; in?: "inbox" | "conversations" }
  | { kind: "hold"; conversationId: string }
  | { kind: "call"; id: string; on?: "live" }
  | { kind: "visit"; id: string; day?: string | null }
  | { kind: "step"; personId: string }
  | { kind: "deal"; personId: string; dealKey?: string | null; on?: "pipeline" }
  | { kind: "list"; id: string; saved?: boolean }
  | { kind: "lead"; id?: string | null; searchId?: string | null }
  | { kind: "campaign"; id: string }
  | { kind: "send"; id: string }
  | { kind: "template"; name: string }
  | { kind: "reach_out"; id: string }
  | { kind: "review"; id?: string | null }
  | { kind: "facts" }
  | { kind: "rules" }
  | { kind: "channel" }
  | { kind: "team" }
  | { kind: "billing" };

/**
 * The kinds of record that open nowhere, and why: the other half of RECORD_KINDS, so a kind added there says where it opens
 * (a variant of RecordRef) or why it cannot (a row here) before it compiles.
 */
export const RECORDS_WITHOUT_AN_ADDRESS = {
  notification:
    "a kept notice opens where its own row says (noticeRoute), which is the address of the record it is about; the notice has no page of its own",
  workspace:
    "the workspace has no page of its own: what is about it is the business's facts, its rules, its lines, its team and its bill, each a kind with its address",
} as const satisfies Partial<Record<RecordKind, string>>;

/** Settings' panes a record kind is the whole of: the route is Settings' (`admin`), and the pane is the word after it. */
const PANE = { channel: "admin/integrations", team: "admin/team", billing: "admin/billing" } as const;

/**
 * Where a record opens, as a route without its slash (the shell's own word: `clients/<id>`, which `workspacePath` turns into
 * the path's `people/<id>`). Over a workspace's slug, `workspacePath(slug, addressOf(ref))` is the link, and `appLink` the
 * same for a mail or a push.
 */
export function addressOf(ref: RecordRef): string {
  switch (ref.kind) {
    case "person":
      return `clients/${ref.id}`;
    case "conversation":
      return ref.in === "conversations" ? `conversations/${ref.id}` : `inbox/th-${ref.id}`;
    case "hold":
      return `inbox/th-${ref.conversationId}`;
    case "call":
      return ref.on === "live" ? `live/${ref.id}` : `conversations/cv-${ref.id}`;
    case "visit":
      return visitRoute(ref.id, ref.day);
    case "step":
      return `clients/${ref.personId}`;
    case "deal":
      return ref.on === "pipeline"
        ? pipelineRoute({ peek: pipelineRowId(ref.personId, ref.dealKey ?? null) })
        : `clients/${ref.personId}`;
    case "list":
      return `clients/${listToken({ kind: ref.saved ? "saved" : "builtin", id: ref.id })}`;
    case "lead":
      return leadsRoute({ peek: ref.id ?? null, searchId: ref.searchId ?? null });
    case "campaign":
    case "reach_out":
      return `campaigns/moment:${ref.id}`;
    case "send":
      return `broadcasts/run:${ref.id}`;
    case "template":
      return `campaigns/message:${ref.name}`;
    case "review":
      return ref.id ? reviewRoute(ref.id) : lensRoute("reviews");
    case "facts":
      return "admin/workspace";
    case "rules":
      return "admin/autonomy";
    case "channel":
      return PANE.channel;
    case "team":
      return PANE.team;
    case "billing":
      return PANE.billing;
  }
}
