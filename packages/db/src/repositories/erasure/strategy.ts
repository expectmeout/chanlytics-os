/**
 * One column's erasure strategy, and the words the registry writes each in (repositories/erasure/registry.ts says
 * what each means).
 */
import type { RETENTION_DAYS } from "@chanlytics/contracts";
import type { ErasureLeg } from "./leg-words";

/** One column's strategy. */
export type ErasureStrategy =
  | { readonly kind: "with_person"; readonly by: ErasureLeg }
  | { readonly kind: "scrubbed"; readonly by: readonly ErasureLeg[] }
  | { readonly kind: "digest" }
  | { readonly kind: "by_age"; readonly days: keyof typeof RETENTION_DAYS }
  | { readonly kind: "with_workspace" }
  | { readonly kind: "as_record" }
  | { readonly kind: "not_personal" };

export const withPerson = (by: ErasureLeg): ErasureStrategy => ({ kind: "with_person", by });
export const scrubbedBy = (...by: ErasureLeg[]): ErasureStrategy => ({ kind: "scrubbed", by });
export const byAge = (days: keyof typeof RETENTION_DAYS): ErasureStrategy => ({ kind: "by_age", days });
export const DIGEST: ErasureStrategy = { kind: "digest" };
export const WITH_WORKSPACE: ErasureStrategy = { kind: "with_workspace" };
export const AS_RECORD: ErasureStrategy = { kind: "as_record" };
export const NOT_PERSONAL: ErasureStrategy = { kind: "not_personal" };

/** Every column in `names` with one strategy. */
export const all = (strategy: ErasureStrategy, ...names: string[]): Record<string, ErasureStrategy> =>
  Object.fromEntries(names.map((n) => [n, strategy]));
