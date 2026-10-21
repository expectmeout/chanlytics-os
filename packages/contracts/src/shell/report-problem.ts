/**
 * Get help (decision 0066, 5; decision 0067): a member asks a person at Chanlytics for help, from Settings › Profile, a
 * card that failed, or an error screen. They say what they need first (REPORT_KINDS): a question about using the app,
 * help setting something up, something that isn't working, or billing. "Something isn't working" goes to the Console's
 * Health, everything else to its Support, and every one is answered by email within one business day.
 *
 * What they wrote goes with the page they were on and the workspace the tab held; the last error that page hit (its short
 * id, its name, its first line) goes only with "Something isn't working". Never what was on the page, nor anything of
 * their customers. The route keeps it as a row, then the edge mails it to the support inbox with Reply-To the person, so
 * a reply from the inbox reaches them.
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

/**
 * What a member needs, picked first on Get help. `wrong` is the Console's Health's (a bug); the rest are its Support's.
 * An error screen and a failed card open the sheet on `wrong`; Settings opens it on `how_to`.
 */
export const REPORT_KINDS = ["how_to", "setup", "wrong", "billing"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** What the member reads for each kind: the choice and the line under it, the question it asks, the box's example. */
export const REPORT_KIND_WORDS: Record<ReportKind, { pick: string; hint: string; label: string; placeholder: string }> =
  {
    how_to: {
      pick: "How do I…",
      hint: "Using the app",
      label: "What are you trying to do?",
      placeholder: "Connect WhatsApp, change the hours, add someone to the team…",
    },
    setup: {
      pick: "Help setting up",
      hint: "A line, forwarding, your calendar",
      label: "What would you like set up?",
      placeholder: "A phone line, forwarding from your number, your calendar…",
    },
    wrong: {
      pick: "Something isn't working",
      hint: "Something didn't do what it should",
      label: "What happened?",
      placeholder: "What you were doing, and what you saw",
    },
    billing: {
      pick: "Billing",
      hint: "Your plan, a charge, an invoice",
      label: "What's your question?",
      placeholder: "An invoice, a charge, your plan…",
    },
  };

/** The kind a report is kept as when the sheet named none: an error caught means something wasn't working. */
export function reportKindOf(kind: ReportKind | null | undefined, error: unknown): ReportKind {
  return kind ?? (error ? "wrong" : "how_to");
}

/** The report as it leaves the browser, cut to the limits. The error rides only with "Something isn't working". */
export function reportProblemOf(
  kind: ReportKind,
  words: string,
  page: string | null,
  error: ReportedError | null,
  workspace: string | null,
): ReportProblemInputDto {
  const first = (page ?? "").split(/[/?#]/)[0] ?? "";
  return {
    kind,
    words: words.trim().slice(0, REPORT_LIMITS.words),
    page: PAGE.test(first) ? first : null,
    error:
      error && kind === "wrong"
        ? {
            id: error.id.slice(0, REPORT_LIMITS.errorId),
            name: error.name.slice(0, REPORT_LIMITS.errorName),
            message: error.message.slice(0, REPORT_LIMITS.errorMessage),
          }
        : null,
    workspace: workspace && WORKSPACE.test(workspace) ? workspace : null,
  };
}

/** The support inbox a member can write to when the sheet cannot send. */
const SUPPORT_ADDRESS = "hi@chanlytics.agency";

export const REPORT_WORDS = {
  door: "Get help",
  doorShort: "Report this",
  title: "Get help",
  sub: "A person at Chanlytics reads every one and answers within one business day.",
  need: "What do you need?",
  sentWith: "Sent with it",
  thisPage: (page: string) => `This page · ${page}`,
  theError: (id: string) => `The error · ${id}`,
  privacy: (email: string | null) =>
    email ? `Nothing about your customers is sent. We answer at ${email}.` : "Nothing about your customers is sent.",
  send: "Send",
  sending: "Sending…",
  empty: "Say what you need first.",
  sent: "Sent",
  sentBody: (email: string | null) =>
    email
      ? `A person answers at ${email} within one business day.`
      : "A person answers by email within one business day.",
  meanwhile: (hint: string) => `Until then: ${hint}`,
  done: "Done",
  failed: `That didn't send. Write to ${SUPPORT_ADDRESS} instead, and say what you need.`,
} as const;
