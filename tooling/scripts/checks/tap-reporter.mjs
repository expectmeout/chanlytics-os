/**
 * The suite's TAP reporter for a run that measures coverage (tooling/scripts/checks/test.mjs).
 *
 * Node's own TAP reporter prints its coverage table into the stream: one row per file the suite loaded, some 1,200 of
 * them, under thousands of tests, where the launcher prints the six lines that are held (per package and tree, with
 * each floor). This is that reporter with the table left out. The lcov reporter, given its own file, still sees every
 * coverage event: this drops it only from what a person reads.
 *
 * It also names each failed test again after the run's totals, as Node's spec reporter (the other legs') does. A full
 * run prints some 60,000 lines, a `not ok` lands where its file's turn came, and the log reader CI's failures are read
 * through gives the last 5,000: on 6 October 2026 a pull request's UTC leg failed one test its log never named there.
 */
import path from "node:path";
import { tap } from "node:test/reporters";

/** The events of a run but its coverage report. */
export async function* withoutCoverage(source) {
  for await (const event of source) if (event.type !== "test:coverage") yield event;
}

/** The events as they are, each failed test kept in `failed`: a test's own failure, not a parent's for its subtests'. */
export async function* noteFailures(source, failed) {
  for await (const event of source) {
    if (event.type === "test:fail" && event.data.details?.error?.failureType !== "subtestsFailed")
      failed.push(event.data);
    yield event;
  }
}

/** The failed tests as the run's last lines, TAP comments: each one's name, where it is, and the first line of why. */
export function failuresLast(failed, root = process.cwd()) {
  if (!failed.length) return "";
  const lines = failed.map((f) => {
    const where = f.file ? ` (${path.relative(root, f.file)}:${f.line})` : "";
    const why = String(f.details?.error?.message ?? "")
      .split("\n")[0]
      .trim();
    return `# not ok - ${f.name}${where}${why ? `: ${why}` : ""}`;
  });
  return [`# failing tests: ${failed.length}`, ...lines].join("\n") + "\n";
}

export default async function* report(source) {
  const failed = [];
  yield* tap(noteFailures(withoutCoverage(source), failed));
  const last = failuresLast(failed);
  if (last) yield last;
}
