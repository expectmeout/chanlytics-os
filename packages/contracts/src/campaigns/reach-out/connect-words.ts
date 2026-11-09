/**
 * What connecting a mailbox says, on Cold email and on New, the two places a sequence to leads needs one. Apart from the
 * page's words, since a contracts module rides whole into every page that imports it.
 */
export const COLD_EMAIL_CONNECT_WORDS = {
  title: "Connect your mailbox",
  sub: "Chanlytics sends your emails from your own address, so replies come straight back to you.",
  google: "Connect Google",
  cancel: "Cancel",
  promises: [
    ["Starts at 10 a day", "And rises as it sends, so emails reach inboxes"],
    ["Replies land in your Inbox here", "And you're told as they arrive"],
    ["You approve the first run", "Nothing goes out before that"],
  ],
  free: {
    title: "That's a personal address",
    why: "Gmail.com addresses aren't for writing to businesses. Connect one on your own domain, like you@yourbusiness.com.",
    help: "How to get one with Google Workspace",
    later: "Not now",
    again: "Try another account",
  },
  other: {
    title: "Not on Google Workspace?",
    what: "Chanlytics sends through Google Workspace today. Your main email can stay where it is: a Google Workspace mailbox on a second domain works, and is better for cold email anyway.",
    help: "How to set that up",
    tellLabel: "Use something else? We'll tell you when it's ready.",
    placeholder: "Microsoft 365, for example",
    tell: "Tell us",
    thanks: "Thanks. We'll tell you when it's ready.",
  },
} as const;
