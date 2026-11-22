/**
 * What a connection's row says of its verbs and its state (row.tsx): what each verb does, for the gate's sentence, and
 * the one word a joined row that works says. Pure: the row draws it.
 */
import type { ConnectionLine } from "./setup";

/** What a connection's verb does, for the gate's sentence (contracts refusal.ts roleGate). */
export const VERB_DOING: Readonly<Record<string, string>> = {
  "verb:google-check": "read Google again",
  "verb:google-connect": "connect Google",
  "verb:google-disconnect": "disconnect Google",
  "verb:instagram-connect": "connect Instagram",
  "verb:instagram-disconnect": "disconnect Instagram",
  "verb:meta-connect": "connect Meta",
  "verb:meta-disconnect": "disconnect Meta",
  "verb:whatsapp-connect": "connect WhatsApp",
  "verb:whatsapp-connect-keep": "connect WhatsApp",
  "verb:business-record": "fill in the business record",
  "verb:email-setup": "set up email",
};

/**
 * A joined row that works says one word, On: "Connected", "Watched", "Readable" and "On" said one thing four ways on one
 * card (Ruben, 21 Nov 2026). A row whose words say more than that keeps them ("Not watching", "Waiting for tomorrow").
 */
const SAYS_ON: ReadonlySet<string> = new Set(["On", "Connected", "Watched", "Readable", "Watching"]);

/** The word a row's state says. */
export const rowPillWords = (row: Pick<ConnectionLine, "state" | "stateWords">): string =>
  row.state === "connected" && SAYS_ON.has(row.stateWords) ? "On" : row.stateWords;
