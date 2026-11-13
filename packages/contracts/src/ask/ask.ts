/** Ask: ask. */

import { parseLeadsRoute } from "../leads/plan";
import { parsePipelineRoute } from "../deals/pipeline/views";
import { pipelinePersonOf } from "../deals/pipeline/vm";
import { personRouteOf } from "../people/person-page/route";
import { messageOfRoute, parseSequencesRoute } from "../campaigns/sequences/address";
import { templateTitle } from "../campaigns/templates/titles";
import type { ReachOutChainDto } from "../campaigns/reach-out/dtos";
import type { TemplateStatus } from "../shared/enums";
import type { VersionChannel } from "../campaigns/templates/message-versions/channels";
import type { TemplateCategoryChoice } from "../campaigns/templates/templates";
import { UUID } from "../shared/identity";

/** The most files one question goes with. */
export const ASK_ATTACHED_MAX = 10;

export interface AskThreadVM {
  id: string;
  title: string;
  lastAtMs: number;
  scope: AskScope | null;
}

/**
 * The kinds a scope may have: a page and the rows a page opens, each a kind a citation names (citations.ts) but the
 * run, a Broadcasts row, which its address spells so and a citation names a broadcast. A scope is what the person was
 * looking at, a fact about the turn; a citation is a claim about a row read, and builds the answer's grammar. A
 * playbook is a campaign open in its drawer on Campaigns (the moment spec, A1); a reach-out open there is the page at
 * that address (scopeFromRoute). An ad is one paid ad open in its drawer on Campaigns › Ads (`campaigns/ads:ad:<id>`,
 * decision 0049); nothing reads it on the server yet, so a turn about one is a turn about the page until the Ads read lands.
 * A file is a piece or a photo open in Content (`campaigns/content:<id>`), and the turn sees the picture itself. A sequence
 * is one open at its record (`campaigns/sequences/<id>`), a message one the Library has open by its name
 * (`campaigns/messages/<name>`), and a visit one the Calendar has open in its sheet (`calendar/…a-<id>`) (Ruben, 12 Nov 2026:
 * every open thing the chip it is).
 */
export const ASK_SCOPE_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "run",
  "playbook",
  "ad",
  "file",
  "sequence",
  "message",
  "visit",
] as const;

export type AskScopeKind = (typeof ASK_SCOPE_KINDS)[number];

/** What the person was looking at when they asked. Carried into the turn as a fact. */
export interface AskScope {
  kind: AskScopeKind;
  id: string;
  label: string;
}

/**
 * The row People's address names (`clients/<param>`): a lead or a search on Leads, a person in the Pipeline's peek or on
 * their own page, on any of its tabs (`<id>/history`: people/person-page/route.ts personRouteOf, the one parse of a person's
 * address). The Leads and Pipeline peeks are read by their own pages' parsers (leads/plan.ts, pipeline.ts). Ask lost the
 * person on every tab but Overview (the wiring's second audit, S1-2, S5-1).
 */
function clientsScope(param: string, label: string | null | undefined): AskScope | null {
  const leads = parseLeadsRoute(`clients/${param}`);
  if (leads) {
    if (leads.peek) return { kind: "lead", id: leads.peek, label: label || "this lead" };
    if (leads.searchId) return { kind: "search", id: leads.searchId, label: label || "this search" };
    return null;
  }
  const pipeline = parsePipelineRoute(`clients/${param}`);
  // The peek names a row, and a further deal of theirs is a row of its own (0029): the person is whose it is.
  if (pipeline)
    return pipeline.peek
      ? { kind: "person", id: pipelinePersonOf(pipeline.peek), label: label || "this person" }
      : null;
  const { id } = personRouteOf(param);
  if (UUID.test(id)) return { kind: "person", id, label: label || "this person" };
  return null;
}

/** A reach-out as the page read it (GET reach-outs' chains): its first step's id, which its drawer's address names, and its name. */
type ChainRead = Pick<ReachOutChainDto, "root_id" | "name">;

/**
 * The scope a route implies, when it names a row: every address a page opens a row at. Conversations writes
 * `<tab>:<id>` as a row opens (pages/conversations.jsx cvRoute), Live `live/<callId>`, a run its home under its sequence
 * (`campaigns/sequences/<id>/runs/<run>`; Sent's `broadcasts/run:<id>` before it), a campaign `campaigns/moment:<id>`; People's, its Leads and Pipeline peeks among them, are clientsScope's, never a
 * second reading. A reach-out opens in a campaign's drawer at the same address, and no campaigns read holds it: where
 * the chains the page read (`chains`) name it, its scope is the page at that address, named for it, whose row the page's
 * context carries (the moment spec, A2), never a campaign nothing reads.
 */
export function scopeFromRoute(
  page: string,
  param: string | null | undefined,
  label?: string | null,
  chains?: readonly ChainRead[] | null,
): AskScope | null {
  if (!param) return null;
  if (page === "inbox" && param.startsWith("th-"))
    return { kind: "thread", id: param.slice(3), label: label || "this thread" };
  if (page === "conversations") {
    // A row on its tab, or a row alone (on All): the row is after the tab's colon.
    const row = param.includes(":") ? param.slice(param.indexOf(":") + 1) : param;
    if (row.startsWith("cv-")) return { kind: "call", id: row.slice(3), label: label || "this call" };
    if (UUID.test(row)) return { kind: "conversation", id: row, label: label || "this conversation" };
    return null;
  }
  if (page === "live" && UUID.test(param)) return { kind: "call", id: param, label: label || "this call" };
  if (page === "broadcasts" && param.startsWith("run:") && UUID.test(param.slice(4)))
    return { kind: "run", id: param.slice(4), label: label || "this run" };
  if (page === "campaigns" || page === "outbound") return campaignsScope(page, param, label, chains);
  if (page === "clients") return clientsScope(param, label);
  // A visit open in its sheet, on whichever view and day the Calendar shows it (contracts calendar visitRoute).
  const visit = page === "calendar" ? /(?:^|:)a-([0-9a-f-]{36})$/.exec(param)?.[1] : undefined;
  if (visit && UUID.test(visit)) return { kind: "visit", id: visit, label: label || "this visit" };
  return null;
}

/**
 * Campaigns' rows: a campaign open in its drawer on the home (surfaces/campaigns/home/address.ts), and the old Playbooks
 * address it replaced; a reach-out open in the same drawer, which is the page at its address; and a paid ad open in its
 * drawer on Campaigns › Ads (contracts ads/address.ts: `ads:ad:<id>`, decision 0049).
 */
function campaignsScope(
  page: string,
  param: string,
  label: string | null | undefined,
  chains: readonly ChainRead[] | null | undefined,
): AskScope | null {
  if (param.startsWith("moment:") && UUID.test(param.slice(7))) {
    const id = param.slice(7);
    const chain = chains?.find((c) => c.root_id === id);
    if (chain) return { kind: "page", id: `campaigns/moment:${id}`, label: label || chain.name || "this sequence" };
    return { kind: "playbook", id, label: label || "this campaign" };
  }
  if (page === "campaigns" && param.startsWith("ads:ad:") && UUID.test(param.slice(7)))
    return { kind: "ad", id: param.slice(7), label: label || "this ad" };
  // A piece Ask made, or a file of the Library, open in Content's viewer (the content redesign), wherever the address names it:
  // after the Library, a view of Made, or before `:post` (content/address.ts contentPlaceOf reads each part so; content leans
  // on ask, so ask reads the id here rather than leaning back).
  const piece =
    page === "campaigns" && param.startsWith("content:") ? param.split(":").find((p) => UUID.test(p)) : null;
  if (piece) return { kind: "file", id: piece, label: label || "this piece" };
  // A run at its home under its sequence (the Campaigns wiring review's lane 2): the run, as Sent's sheet of it was; else the
  // sequence itself, open at its record.
  const place = page === "campaigns" ? parseSequencesRoute(`campaigns/${param}`) : null;
  if (place?.view === "record" && place.run && UUID.test(place.run))
    return { kind: "run", id: place.run, label: label || "this run" };
  if (place?.view === "record" && UUID.test(place.id))
    return { kind: "sequence", id: place.id, label: label || "this sequence" };
  // A message the Library has open: its id the name it is stored by, its chip the title the page says (templateTitle).
  const message = page === "campaigns" ? messageOfRoute(`campaigns/${param}`) : null;
  if (message) return { kind: "message", id: message, label: label || templateTitle(message) };
  return null;
}

/**
 * The pages Ask knows it is on. The route accepts exactly these; the prompt names them. Thirteen (the Phase 2 plan,
 * D1): the Pipeline, the Calendar, the campaign pages (Playbooks, Broadcasts, Messages) and Start are pages of their
 * own, no longer People's or "other".
 */
export const ASK_SURFACES = [
  "today",
  "inbox",
  "people",
  "leads",
  "conversations",
  "live",
  "reports",
  "settings",
  "pipeline",
  "calendar",
  "campaigns",
  "start",
  "other",
] as const;

export type AskSurface = (typeof ASK_SURFACES)[number];

/* ------------------------------------------------------------ what Ask reads */

/**
 * One message of the library as sequences with action messages reads it (the dashboard's readers/templates.ts
 * messageReadsOf), and what a plan of Ask's is checked against: a name in a language and what the business calls it
 * (`title`), its category as a send judges a yes (an authentication message is a utility one), whether it was put away,
 * each version on its channel with its row's status (a WhatsApp version still in Meta's review among them; an email's or
 * a text's is written approved), its words (an email's subject and body; cut to a line where the library is read whole,
 * whole where one message is asked for by name) and why WhatsApp refused it, the numbered values it fills with what
 * each is called and most likely takes, and the campaigns that send it by name. Ask reads the words before it changes
 * them (the message sheet's review, 12 Nov 2026: it was asked to change words it could not see).
 */
export interface MessageRead {
  name: string;
  title: string;
  language: string;
  category: TemplateCategoryChoice;
  away: boolean;
  versions: {
    channel: VersionChannel;
    id: string;
    state: TemplateStatus;
    words: { subject: string | null; body: string };
    /** WhatsApp's reason, where it refused this version. */
    refused?: string;
  }[];
  slots: { position: number; label: string; kind: string }[];
  used_by: { id: string; name: string }[];
}
