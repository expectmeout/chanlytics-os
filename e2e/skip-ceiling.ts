import type { Reporter, TestCase, TestResult, FullResult } from "@playwright/test/reporter";

/**
 * A hollow run is not a green one.
 *
 * coverage.spec.ts catches a suite that cannot sign in. This catches the
 * quieter version: 27 of this suite's conditional skips are gated on the live
 * workspace HAVING data ("no conversations in this workspace", "this
 * workspace has nobody to open"). A slow month at the salon can therefore
 * hollow the run out while it still exits 0 -- which is the same defect that
 * let the nightly report success for four mornings while running 24 of 128
 * specs, wearing different clothes.
 *
 * Only bites on a run that declares it holds credentials, so a developer's
 * credential-free run is untouched.
 */
class SkipCeiling implements Reporter {
  private skipped = 0;

  onTestEnd(_test: TestCase, result: TestResult): void {
    if (result.status === "skipped") this.skipped += 1;
  }

  async onEnd(_result: FullResult): Promise<{ status?: FullResult["status"] } | undefined> {
    if (process.env.REQUIRE_SERVICE_CREDENTIALS !== "1") return undefined;
    const max = Number(process.env.E2E_MAX_SKIPS ?? "8");
    if (this.skipped <= max) return undefined;
    console.error(
      `\n${this.skipped} specs skipped, ceiling ${max}. A credentialed run should skip almost ` +
        `none; this many means the suite covered far less than its size suggests. Raise ` +
        `E2E_MAX_SKIPS deliberately if the workspace is legitimately quiet.`,
    );
    return { status: "failed" };
  }
}

export default SkipCeiling;
