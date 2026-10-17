import { agoWords, MIN_MS } from "../shared/time.js";
export const LINE_CODES_WITHIN_MS = 15 * MIN_MS;
export const LINE_CODES_MAX = 3;
export const LINE_CODES_EVERY_MS = 3e3;
const FOOT = "Codes sent to this line are never answered and never become people.";
export function codeNotes(codes, nowMs) {
  const said = codes.filter((c) => !Number.isNaN(Date.parse(c.at)));
  if (said.length === 0) return [];
  return [
    // What the owner is waiting for: on the row, never behind a press (ConnectionNote.live).
    ...said.map((c) => ({
      text: `${c.from ? `Code from ${c.from}` : "A code"}: ${c.code} \xB7 ${agoWords(Date.parse(c.at), nowMs)}`,
      live: true
    })),
    { text: FOOT, live: true }
  ];
}
