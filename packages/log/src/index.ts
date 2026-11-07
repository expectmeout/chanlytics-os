/**
 * Every public name, named (repo/contracts-barrels.test.mjs). One logger and one request's name for every runtime: the edge, the dashboard's server, core, jobs and channels
 * write through it, and it imports no other package, so a verb can log without reaching a provider.
 */
export { errField, logger } from "./logger";
export type { LogFields, Logger, LogLevel } from "./logger";
export { errText, redact } from "./redact";
export {
  noteTenant,
  noteTiming,
  noteTouch,
  requestId,
  requestTenant,
  requestTimings,
  requestTouches,
  withRequestId,
} from "./request";
export type { RequestTiming } from "./request";
