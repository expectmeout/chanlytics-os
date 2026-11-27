/**
 * Every event name the edge's log carries, and nothing it does not.
 *
 * The names are the contract: alerting and every incident's first query grep
 * for them, so they never change (lib/shared/log.ts). Until this list they were
 * spelled only at their call sites, and a typo was a line nothing would ever
 * find. Now `Logger` takes a `LogEvent`, so a name outside this list is a type
 * error, and tests/repo/log-events.test.mjs holds the list to
 * the call sites both ways, over the syntax tree: a name logged and not here,
 * a name here that nothing logs, a name that is not a literal.
 *
 * The edge's own call sites, and the packages' lines: core, jobs and channels
 * write through the one logger (packages/log), db through the port
 * the apps hand it (packages/db observe.ts), and all four run on the edge. Their
 * loggers take a string (the packages cannot import the edge), so the test holds
 * those. The dashboard's own names are DASHBOARD_LOG_EVENTS, held the same way.
 * Kept by domain, a file each in log-events/ and each sorted, so two changes that add a name each land apart; this
 * index names them all, in one sorted list.
 */
import { ADS_EVENTS } from "./log-events/ads.js";
import { AI_EVENTS } from "./log-events/ai.js";
import { BILLING_EVENTS } from "./log-events/billing.js";
import { CALENDAR_EVENTS } from "./log-events/calendar.js";
import { CAMPAIGNS_EVENTS } from "./log-events/campaigns.js";
import { CONTENT_EVENTS } from "./log-events/content.js";
import { EMAIL_EVENTS } from "./log-events/email.js";
import { GOOGLE_EVENTS } from "./log-events/google.js";
import { INSTAGRAM_EVENTS } from "./log-events/instagram.js";
import { LEADS_EVENTS } from "./log-events/leads.js";
import { LINES_EVENTS } from "./log-events/lines.js";
import { OPS_EVENTS } from "./log-events/ops.js";
import { PLUMBING_EVENTS } from "./log-events/plumbing.js";
import { RECEPTIONIST_EVENTS } from "./log-events/receptionist.js";
import { VOICE_EVENTS } from "./log-events/voice.js";
import { WHATSAPP_EVENTS } from "./log-events/whatsapp.js";

export const LOG_EVENTS = [
  ...ADS_EVENTS,
  ...AI_EVENTS,
  ...BILLING_EVENTS,
  ...CALENDAR_EVENTS,
  ...CAMPAIGNS_EVENTS,
  ...CONTENT_EVENTS,
  ...EMAIL_EVENTS,
  ...GOOGLE_EVENTS,
  ...INSTAGRAM_EVENTS,
  ...LEADS_EVENTS,
  ...LINES_EVENTS,
  ...OPS_EVENTS,
  ...PLUMBING_EVENTS,
  ...RECEPTIONIST_EVENTS,
  ...VOICE_EVENTS,
  ...WHATSAPP_EVENTS,
].sort();

export type LogEvent = (typeof LOG_EVENTS)[number];
