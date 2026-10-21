/**
 * Report a problem (decision 0066, 5): a customer tells a person at Chanlytics what went wrong, from a card that failed,
 * an error screen, or Settings › Profile. What they wrote goes with the page they were on and the last error that page
 * hit (its short id, its name, its first line), and the workspace the tab held; never what was on the page, nor anything
 * of their customers. The route keeps it as a row, then the edge mails it to the support inbox with Reply-To the person,
 * so a reply from the inbox reaches them.
 */
import type { ReportProblemInputDto } from "./report-problem-schema";
import { CLIENT_ERROR_LIMITS, PAGE, WORKSPACE } from "./client-error";

/** How much of each part is kept. */
export const REPORT_LIMITS = {
  words: 2000,
  errorId: 8,
  errorName: CLIENT_ERROR_LIMITS.name,
  errorMessage: CLIENT_ERROR_LIMITS.message,
} as const;

/** The last error a page hit, as the browser keeps it for a report (client/client-error.ts). */
export interface ReportedError {
  id: string;
  name: string;
  message: string;
}

/** The report as it leaves the browser, cut to the limits. */
export function reportProblemOf(
  words: string,
  page: string | null,
  error: ReportedError | null,
  workspace: string | null,
): ReportProblemInputDto {
  const first = (page ?? "").split(/[/?#]/)[0] ?? "";
  return {
    words: words.trim().slice(0, REPORT_LIMITS.words),
    page: PAGE.test(first) ? first : null,
    error: error
      ? {
          id: error.id.slice(0, REPORT_LIMITS.errorId),
          name: error.name.slice(0, REPORT_LIMITS.errorName),
          message: error.message.slice(0, REPORT_LIMITS.errorMessage),
        }
      : null,
    workspace: workspace && WORKSPACE.test(workspace) ? workspace : null,
  };
}

export const REPORT_WORDS = {
  door: "Report a problem",
  doorShort: "Report this",
  title: "Report a problem",
  sub: "A person at Chanlytics reads every one",
  label: "What happened?",
  placeholder: "What you were doing, and what you saw",
  sentWith: "Sent with it",
  thisPage: (page: string) => `This page · ${page}`,
  theError: (id: string) => `The error · ${id}`,
  privacy: (email: string | null) =>
    email ? `Nothing about your customers is sent. We answer at ${email}.` : "Nothing about your customers is sent.",
  send: "Send",
  sending: "Sending…",
  empty: "Say what happened first.",
  sent: "Sent",
  sentBody: (email: string | null) =>
    email
      ? `We'll answer at ${email}, usually within a working day.`
      : "We'll answer by email, usually within a working day.",
  done: "Done",
  failed: "That didn't send. Write to hi@chanlytics.com instead, and say what happened.",
} as const;
