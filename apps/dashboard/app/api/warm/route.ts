import { PREFETCH_OPEN, openReads } from "@chanlytics/contracts";
import { warmRoute } from "@/server/workspace/routes-warm";
import * as open from "../v1/open/route";
import * as activity from "../v1/activity/route";
import * as askMemory from "../v1/ask/memory/route";
import * as billing from "../v1/billing/route";
import * as calendarRuns from "../v1/calendar/runs/route";
import * as instagramDoor from "../v1/channels/instagram/route";
import * as metaDoor from "../v1/channels/meta/route";
import * as whatsappDoor from "../v1/channels/whatsapp/signup/route";
import * as content from "../v1/content/route";
import * as files from "../v1/files/route";
import * as leadSearches from "../v1/lead-searches/route";
import * as leads from "../v1/leads/route";
import * as myAlerts from "../v1/me/alerts/route";
import * as partner from "../v1/partner/route";
import * as reachOutSources from "../v1/reach-outs/sources/route";
import * as reports from "../v1/reports/route";
import * as sequences from "../v1/sequences/route";
import * as reachOutSettings from "../v1/settings/reach-out/route";
import * as teamPartner from "../v1/team/partner/route";

/**
 * GET /api/warm — the routes every page opens on, loaded before a visitor asks (server/workspace/routes-warm.ts says why).
 *
 * This route imports them, so the first ask for it in an instance loads their code: the opening read (GET open), which
 * imports every read it answers for Today and the Inbox, and each other page's first reads (contracts PREFETCH_READS),
 * named here by the path the client asks them at. They are the routes of this route's own function: Vercel groups
 * routes by their configuration, so a route that sets its own (a `maxDuration`) lives in another function and is held by
 * a warm-up there (warm/long). tests/checks/routes-warm.test.mjs holds the list to what the pages open on and to this
 * function. The platform's clock asks for it (vercel.json).
 */
const HELD = {
  open,
  activity,
  "ask/memory": askMemory,
  billing,
  "calendar/runs": calendarRuns,
  "channels/instagram": instagramDoor,
  "channels/meta": metaDoor,
  "channels/whatsapp/signup": whatsappDoor,
  content,
  files,
  "lead-searches": leadSearches,
  leads,
  "me/alerts": myAlerts,
  partner,
  "reach-outs/sources": reachOutSources,
  reports,
  sequences,
  "settings/reach-out": reachOutSettings,
  "team/partner": teamPartner,
};

/**
 * Reads the opening read answers in its own process that are asked for alone in another function: each sets its own
 * `maxDuration`, so a direct ask for it is not this function's to answer, and loading it here warms nothing a page asks.
 */
const ANOTHER_FUNCTIONS = new Set(["playbooks", "ask/morning"]);

/** A read as the client spells it, by its route's path. */
const pathOf = (read: string): string => read.replace(/\?.*$/, "");

/** What the opening read answers, for each page that opens through it: loaded with it. */
const opened = PREFETCH_OPEN.flatMap((page) => openReads(page).flat().map(pathOf));

export const GET = warmRoute([...new Set([...Object.keys(HELD), ...opened])].filter((r) => !ANOTHER_FUNCTIONS.has(r)));
