/**
 * The suite's TAP reporter for a run that measures coverage (tooling/scripts/checks/test.mjs).
 *
 * Node's own TAP reporter prints its coverage table into the stream: one row per file the suite loaded, some 1,200 of
 * them, under thousands of tests, where the launcher prints the six lines that are held (per package and tree, with
 * each floor). This is that reporter with the table left out. The lcov reporter, given its own file, still sees every
 * coverage event: this drops it only from what a person reads.
 */
import { tap } from "node:test/reporters";

/** The events of a run but its coverage report. */
export async function* withoutCoverage(source) {
  for await (const event of source) if (event.type !== "test:coverage") yield event;
}

export default async function* report(source) {
  yield* tap(withoutCoverage(source));
}
