/**
 * The erasure domain: `@chanlytics/db/erasure`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export { ERASURE_LEGS } from "./leg-words";
export type { ErasureLeg } from "./leg-words";
export {
  beginErasure,
  beginPeopleErasure,
  dropPersonPolicy,
  eraseContactRows,
  erasureKeys,
  findErasableContact,
  FINISHED_JOB_STATES,
  inWorkspace,
  listIdentityExternalIds,
  listMediaPaths,
  listRecordingPaths,
  removeMediaObjects,
  scrubAskTurns,
  scrubErasedJobs,
  visitNeedles,
} from "./legs";
export type { ErasedRows } from "./legs";
export { ERASURE_STRATEGIES } from "./registry";
export type { ErasureStrategy } from "./strategy";
