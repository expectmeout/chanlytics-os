/**
 * Every public name, named (repo/contracts-barrels.test.mjs). One logger and one request's name for every runtime: the edge, the dashboard's server, core, jobs and channels
 * write through it, and it imports no other package, so a verb can log without reaching a provider.
 */
export { errField, logAndGoOn, logger, logKeptGoing, withRequestId } from "./logger";
export type { LogFields, Logger, LogLevel } from "./logger";
export { errText, redact } from "./redact";
export {
  noteOutsideCall,
  noteTenant,
  noteTiming,
  noteTouch,
  requestAttempt,
  requestId,
  requestTenant,
  requestTimings,
  requestTouches,
  sharedReads,
  shareReads,
} from "./request";
export type { RequestTiming, ServingAbout } from "./request";
