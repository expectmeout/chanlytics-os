/**
 * The Inbox's and Conversations' names for the standalone mockup and the e2e harness (serve-legacy.mjs
 * `/data/inbox-globals.js`): what the app publishes from seed-globals.ts (surfaces/inbox/legacy-globals.ts), and a
 * demo's seeded rows with them, which the app fetches only in a demo session (surfaces/inbox/shell.ts demoCode). The mockup is a
 * demo, and draws its Inbox from them as it loads.
 */
import { conversationsSample, inboxSample } from "@/surfaces/inbox/sample";

export { INBOX_GLOBALS, hearPresence } from "@/surfaces/inbox/legacy-globals";

/** A demo's seeded threads and calls, under the names the pages that have not moved read. */
export const INBOX_DEMO = { INBOX_DATA: inboxSample, CONVERSATIONS_DATA: conversationsSample };
