/**
 * What every repository stands on: `@chanlytics/db/shared`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export { asJson, type Jsonable, jsonCopyOf } from "./json";
export { isMissingDoor, isMissingFunction, saysMissing } from "./missing-door";
export { DB_REQUEST_HEADER, namedFetch, observeDb, touchOfCall } from "./observe";
export type { DbLog, DbObserver, DbTouch } from "./observe";
export { DEFAULT_ROW_CAP, MAX_ROWS, readAllRows, readAllRowsByKey } from "./paged";
export type { Page } from "./paged";
export { readAnswer, readColumn } from "./read-json";
export { createServiceClient } from "./service-client";
export type { ServiceClientConfig } from "./service-client";
export { platformWide, type TenantDb, tenantDb } from "./tenant-db";
