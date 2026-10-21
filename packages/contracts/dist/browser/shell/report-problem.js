import { CLIENT_ERROR_LIMITS, PAGE, WORKSPACE } from "./client-error.js";
export const REPORT_LIMITS = {
  words: 2e3,
  errorId: 8,
  errorName: CLIENT_ERROR_LIMITS.name,
  errorMessage: CLIENT_ERROR_LIMITS.message
};
export const REPORT_KINDS = ["how_to", "setup", "wrong", "billing"];
export const REPORT_KIND_WORDS = {
  how_to: {
    pick: "How do I\u2026",
    hint: "Using the app",
    label: "What are you trying to do?",
    placeholder: "Connect WhatsApp, change the hours, add someone to the team\u2026"
  },
  setup: {
    pick: "Help setting up",
    hint: "A line, forwarding, your calendar",
    label: "What would you like set up?",
    placeholder: "A phone line, forwarding from your number, your calendar\u2026"
  },
  wrong: {
    pick: "Something isn't working",
    hint: "Something didn't do what it should",
    label: "What happened?",
    placeholder: "What you were doing, and what you saw"
  },
  billing: {
    pick: "Billing",
    hint: "Your plan, a charge, an invoice",
    label: "What's your question?",
    placeholder: "An invoice, a charge, your plan\u2026"
  }
};
export function reportKindOf(kind, error) {
  return kind ?? (error ? "wrong" : "how_to");
}
export function reportProblemOf(kind, words, page, error, workspace) {
  const first = (page ?? "").split(/[/?#]/)[0] ?? "";
  return {
    kind,
    words: words.trim().slice(0, REPORT_LIMITS.words),
    page: PAGE.test(first) ? first : null,
    error: error && kind === "wrong" ? {
      id: error.id.slice(0, REPORT_LIMITS.errorId),
      name: error.name.slice(0, REPORT_LIMITS.errorName),
      message: error.message.slice(0, REPORT_LIMITS.errorMessage)
    } : null,
    workspace: workspace && WORKSPACE.test(workspace) ? workspace : null
  };
}
const SUPPORT_ADDRESS = "hi@chanlytics.agency";
export const REPORT_WORDS = {
  door: "Get help",
  doorShort: "Report this",
  title: "Get help",
  sub: "A person at Chanlytics reads every one and answers within one business day.",
  need: "What do you need?",
  sentWith: "Sent with it",
  thisPage: (page) => `This page \xB7 ${page}`,
  theError: (id) => `The error \xB7 ${id}`,
  privacy: (email) => email ? `Nothing about your customers is sent. We answer at ${email}.` : "Nothing about your customers is sent.",
  send: "Send",
  sending: "Sending\u2026",
  empty: "Say what you need first.",
  sent: "Sent",
  sentBody: (email) => email ? `A person answers at ${email} within one business day.` : "A person answers by email within one business day.",
  meanwhile: (hint) => `Until then: ${hint}`,
  done: "Done",
  failed: `That didn't send. Write to ${SUPPORT_ADDRESS} instead, and say what you need.`
};
