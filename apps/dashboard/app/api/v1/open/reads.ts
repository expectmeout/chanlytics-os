import { OPEN_READ_PATHS, openReadPathOf, type OpenReadPath } from "@chanlytics/contracts";
import type { OpenRead } from "@/server/workspace/page-open";
import { GET as workspaces } from "../workspaces/route";
import { GET as today } from "../today/route";
import { GET as todayPeople } from "../today/people/route";
import { GET as conversations } from "../conversations/route";
import { GET as escalations } from "../escalations/route";
import { GET as calls } from "../calls/route";
import { GET as setup } from "../setup/route";
import { GET as views } from "../views/route";
import { GET as calendar } from "../calendar/route";
import { GET as calendarRuns } from "../calendar/runs/route";
import { GET as broadcasts } from "../broadcasts/route";
import { GET as broadcastTouches } from "../broadcasts/touches/route";
import { GET as contacts } from "../contacts/route";
import { GET as segments } from "../segments/route";
import { GET as channels } from "../channels/route";
import { GET as settings } from "../settings/route";
import { GET as headline } from "../reports/headline/route";
import { GET as playbooks } from "../playbooks/route";
import { GET as notifications } from "../notifications/route";
import { GET as google } from "../google/route";
import { GET as replies } from "../reach-out-replies/route";
import { GET as reachOuts } from "../reach-outs/route";
import { GET as morning } from "../ask/morning/route";
import { GET as followUps } from "../ask/follow-ups/route";
import { GET as drafts } from "../conversations/drafts/route";
import { GET as team } from "../team/route";
import { GET as policies } from "../policies/route";
import { GET as templates } from "../templates/route";
import { GET as coldEmailNote } from "../settings/reach-out/note/route";
import { GET as contentNote } from "../content/note/route";
import { GET as changes } from "../changes/route";
import { GET as leads } from "../leads/route";
import { GET as leadSearches } from "../lead-searches/route";
import { GET as sequences } from "../sequences/route";
import { GET as billing } from "../billing/route";
import { GET as partner } from "../partner/route";
import { GET as person } from "../contacts/[id]/route";

/**
 * Every read GET open and GET open/rest answer, by the path the client asks it at (contracts OPEN_READ_PATHS), each
 * answered by its own route: the routes are named here by their path, and page-open.test.mjs holds the two lists to one.
 * A page's first reads (GET open) and the rest of a load's (GET open/rest) are the same reads, asked at different moments.
 */
const READS: Readonly<Record<OpenReadPath, OpenRead>> = {
  workspaces,
  // Today's day whole, its one read (GET today, Today in three zones, 2 Nov 2026).
  today,
  // What Today draws from People, in its first tier (GET today/people): its People's first page is GET contacts', read once.
  "today/people": todayPeople,
  conversations,
  escalations,
  calls,
  setup,
  views,
  calendar,
  "calendar/runs": calendarRuns,
  broadcasts,
  "broadcasts/touches": broadcastTouches,
  contacts,
  segments,
  channels,
  settings,
  "reports/headline": headline,
  playbooks,
  notifications,
  google,
  "reach-out-replies": replies,
  "reach-outs": reachOuts,
  "ask/morning": morning,
  "ask/follow-ups": followUps,
  "conversations/drafts": drafts,
  team,
  policies,
  templates,
  // Cold email's one line on Today (the page's own read, no surface's: surfaces/today/cold-email-note-read.ts).
  "settings/reach-out/note": coldEmailNote,
  // Content's card on Today, the same kind of read (surfaces/today/content-note-read.ts): answered here, not on its own.
  "content/note": contentNote,
  changes,
  leads,
  "lead-searches": leadSearches,
  sequences,
  billing,
  partner,
  // A person's page, by the id its key names (openReadOf hands it to the route as the route's own param).
  "contacts/[id]": person,
};

/**
 * The route that answers a read, by its key as the client spells it (`contacts?sort=name`, `contacts/<id>`): its path's, if it
 * has one (contracts openReadPathOf), with the id the path names handed to it as its `id`, as its own request's would be.
 */
export function openReadOf(key: string): OpenRead | undefined {
  const path = key.replace(/\?.*$/, "");
  const listed = OPEN_READ_PATHS.find((known) => known === openReadPathOf(path));
  if (!listed) return undefined;
  const route = READS[listed];
  const id = path.split("/").find((part, at) => listed.split("/")[at] === "[id]");
  return id === undefined ? route : { run: (req, ctx) => route.run(req, { ...ctx, params: { ...ctx.params, id } }) };
}
