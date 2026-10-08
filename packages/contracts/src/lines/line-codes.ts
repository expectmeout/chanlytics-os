/**
 * The one-time codes texted to a workspace's own line, as the Connections page holds them.
 *
 * Meta texts a code to the number an owner connects to WhatsApp; when that number is the workspace's own Chanlytics line the
 * text reaches the line like a customer's, and nobody could see it. The receptionist never answers such a code and no
 * person or message is made of it (apps/edge/lib/sms/inbound-text.ts); the owner reads it from the provider's own record,
 * on demand (`GET /api/v1/lines/codes`), and it is never stored here. This is how the page says it.
 */
import { agoWords, MIN_MS } from "../shared/time";
import type { ConnectionNote } from "./connection-note";

/** A code that was sent to the line lately: the code as the sender wrote it, who sent it (a name it read, else null), and when. */
export interface LineCodeDto {
  code: string;
  from: string | null;
  /** When the provider says it was sent: an ISO instant. */
  at: string;
}

/** How far back a code is still one an owner is waiting for. */
export const LINE_CODES_WITHIN_MS = 15 * MIN_MS;
/** The most codes the page is told of: the newest. */
export const LINE_CODES_MAX = 3;
/** How often the page asks while Meta's sign-up window is open: a code is wanted within seconds of being sent. */
export const LINE_CODES_EVERY_MS = 3_000;

const FOOT = "Codes sent to this line are never answered and never become people.";

/**
 * The Texting row's notes for the codes sent to the line, newest first, then the one line that says what becomes of them. A
 * code with no time is not said (the time is what tells an owner it is the one they are waiting for). None, none.
 */
export function codeNotes(codes: readonly LineCodeDto[], nowMs: number): ConnectionNote[] {
  const said = codes.filter((c) => !Number.isNaN(Date.parse(c.at)));
  if (said.length === 0) return [];
  return [
    // What the owner is waiting for: on the row, never behind a press (ConnectionNote.live).
    ...said.map((c) => ({
      text: `${c.from ? `Code from ${c.from}` : "A code"}: ${c.code} · ${agoWords(Date.parse(c.at), nowMs)}`,
      live: true as const,
    })),
    { text: FOOT, live: true as const },
  ];
}
