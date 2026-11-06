import type { Page } from "@playwright/test";

const VIOLATION = /Content Security Policy|Report Only|Refused to (load|execute|apply|connect|frame)/i;
// A directive the browser ignores in a report-only policy is a note about the header, not a page the policy would break.
const NOTE = /is ignored when delivered in a report-only policy/i;

/** Every violation the console reports on this page from now on, each saying where, until it is stopped. */
export function watchViolations(page: Page, where: string): { seen: string[]; stop: () => void } {
  const seen: string[] = [];
  const onConsole = (m: { text(): string }) => {
    const t = m.text();
    if (VIOLATION.test(t) && !NOTE.test(t)) seen.push(`${where}: ${t.slice(0, 240)}`);
  };
  page.on("console", onConsole);
  return { seen, stop: () => page.off("console", onConsole) };
}
