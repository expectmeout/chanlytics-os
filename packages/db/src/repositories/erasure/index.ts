/**
 * The erasure domain: `@chanlytics/db/erasure`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
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
export { ERASURE_LEGS, ERASURE_STRATEGIES } from "./registry";
export type { ErasureLeg, ErasureStrategy } from "./registry";
