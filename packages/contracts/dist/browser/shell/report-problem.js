import { CLIENT_ERROR_LIMITS, PAGE, WORKSPACE } from "./client-error.js";
export const REPORT_LIMITS = {
  words: 2e3,
  errorId: 8,
  errorName: CLIENT_ERROR_LIMITS.name,
  errorMessage: CLIENT_ERROR_LIMITS.message
};
export function reportProblemOf(words, page, error, workspace) {
  const first = (page ?? "").split(/[/?#]/)[0] ?? "";
  return {
    words: words.trim().slice(0, REPORT_LIMITS.words),
    page: PAGE.test(first) ? first : null,
    error: error ? {
      id: error.id.slice(0, REPORT_LIMITS.errorId),
      name: error.name.slice(0, REPORT_LIMITS.errorName),
      message: error.message.slice(0, REPORT_LIMITS.errorMessage)
    } : null,
    workspace: workspace && WORKSPACE.test(workspace) ? workspace : null
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
  thisPage: (page) => `This page \xB7 ${page}`,
  theError: (id) => `The error \xB7 ${id}`,
  privacy: (email) => email ? `Nothing about your customers is sent. We answer at ${email}.` : "Nothing about your customers is sent.",
  send: "Send",
  sending: "Sending\u2026",
  empty: "Say what happened first.",
  sent: "Sent",
  sentBody: (email) => email ? `We'll answer at ${email}, usually within a working day.` : "We'll answer by email, usually within a working day.",
  done: "Done",
  failed: "That didn't send. Write to hi@chanlytics.com instead, and say what happened."
};
