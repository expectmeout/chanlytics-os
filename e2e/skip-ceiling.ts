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
 * A skip the run chose is not a hollow one: the Ask and Leads specs that spend
 * real money and the sign-up probe skip until a switch is set, and each says
 * so in its reason with "set E2E_<SWITCH>". Those are not counted; every other
 * skip is, whatever its reason, and the reasons are printed so a morning that
 * trips the ceiling says what was missing.
 *
 * Only bites on a run that declares it holds credentials, so a developer's
 * credential-free run is untouched.
 */
export const DELIBERATE = /\bset E2E_[A-Z_]+/;

export class SkipCeiling implements Reporter {
  private counted = new Map<string, number>();
  private deliberate = 0;

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== "skipped") return;
    const why = test.annotations.find((a) => a.type === "skip")?.description ?? "(no reason given)";
    if (DELIBERATE.test(why)) {
      this.deliberate += 1;
      return;
    }
    this.counted.set(why, (this.counted.get(why) ?? 0) + 1);
  }

  async onEnd(_result: FullResult): Promise<{ status?: FullResult["status"] } | undefined> {
    if (process.env.REQUIRE_SERVICE_CREDENTIALS !== "1") return undefined;
    const max = Number(process.env.E2E_MAX_SKIPS ?? "8");
    const skipped = [...this.counted.values()].reduce((n, c) => n + c, 0);
    if (skipped <= max) return undefined;
    const reasons = [...this.counted.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([why, n]) => `  ${n} × ${why}`)
      .join("\n");
    console.error(
      `\n${skipped} specs skipped for want of data or credentials, ceiling ${max} (${this.deliberate} more ` +
        `skipped behind a switch the run did not set, which do not count). A credentialed run should skip ` +
        `almost none; this many means the suite covered far less than its size suggests. Give the workspace ` +
        `what these read, or raise E2E_MAX_SKIPS deliberately if it is legitimately quiet:\n${reasons}`,
    );
    return { status: "failed" };
  }
}

export default SkipCeiling;
