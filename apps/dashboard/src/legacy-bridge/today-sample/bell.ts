/**
 * The bell: three rows the edge kept and three this browser derives about rows the queue already holds; six more
 * on a busy day, between Ana's row and Kenia's.
 */
import { agoLabel, SERVER_KEY_PREFIX, NEEDS_KEY_PREFIX, CALL_KEY_PREFIX } from "@chanlytics/contracts";
import { MIN, type SampleClock } from "./clock";
// The row the popover draws, from the bridge that owns it. `import type` is erased, so notifications.ts's
// own `./api` import never reaches this browser-only bundle.
import type { BellRow } from "../notifications";

/** One row as the bell keeps it, `minAgo` minutes old on the sample's clock, with its one primary action. */
const bellRow = (
  nowMs: number,
  id: string,
  kind: BellRow["kind"],
  title: string,
  message: string,
  tone: BellRow["tone"],
  icon: string,
  minAgo: number,
  to: string,
  action: string,
  about: BellRow["about"] = null,
): BellRow => ({
  id,
  kind,
  icon,
  tone,
  unread: true,
  time: agoLabel(nowMs - minAgo * MIN, nowMs),
  title,
  message,
  about,
  actions: [{ label: action, to, primary: true }],
});

/** The busy day's six more: two handoffs past the queue's cap, a rating, a line back up, a voicemail and a run. */
function busyBellRows(nowMs: number): BellRow[] {
  return [
    bellRow(
      nowMs,
      `${NEEDS_KEY_PREFIX}cv-lucia`,
      "needs_you",
      "Lucía Ferreira needs you",
      "I need to speak to someone about my deposit.",
      "warn",
      "alert",
      160,
      "inbox/th-cv-lucia",
      "Open",
    ),
    bellRow(
      nowMs,
      `${NEEDS_KEY_PREFIX}cv-camila`,
      "needs_you",
      "Camila Duarte needs you",
      "My friend wants a refund for last time first.",
      "warn",
      "alert",
      35,
      "inbox/th-cv-camila",
      "Open",
    ),
    bellRow(
      nowMs,
      `${SERVER_KEY_PREFIX}n-4`,
      "review",
      "1 new rating on Google",
      'Four stars from Omar H.: "Easy to book, a bit of a wait."',
      "ok",
      "star",
      95,
      "reports",
      "Open Reports",
    ),
    bellRow(
      nowMs,
      `${SERVER_KEY_PREFIX}n-5`,
      "line",
      "Your email line reconnected",
      "Nothing was lost while it was down.",
      "ok",
      "mail",
      260,
      "admin/integrations",
      "Open Connections",
    ),
    bellRow(
      nowMs,
      `${CALL_KEY_PREFIX}k-voicemail-2`,
      "missed_call",
      "Missed call · +1 (347) 555-0142",
      "Reached voicemail, 45s.",
      "warn",
      "phone",
      130,
      "conversations/cv-k-voicemail-2",
      "See the call",
    ),
    bellRow(
      nowMs,
      `${SERVER_KEY_PREFIX}n-6`,
      "broadcast_sent",
      "Visit reminder went out to 3 people",
      "All three delivered.",
      "ok",
      "bolt",
      400,
      "broadcasts/run:b-visit",
      "Open the run",
      { type: "broadcast", id: "b-visit" },
    ),
  ];
}

/** The bell as the topbar would hold it, in the order the edge and this browser would have added its rows. */
export function sampleBellRows({ nowMs }: SampleClock, busy: boolean): BellRow[] {
  return [
    bellRow(
      nowMs,
      `${SERVER_KEY_PREFIX}n-1`,
      "review",
      "1 new rating on Google",
      'Five stars from Bea L.: "Always on time and the color lasts."',
      "ok",
      "star",
      200,
      "reports",
      "Open Reports",
    ),
    bellRow(
      nowMs,
      `${SERVER_KEY_PREFIX}n-2`,
      "number",
      "Your WhatsApp number's quality rating was flagged",
      "Meta rates the number medium. Nothing is blocked; sends go on.",
      "warn",
      "shield",
      320,
      "admin/integrations",
      "Open Connections",
    ),
    bellRow(
      nowMs,
      `${SERVER_KEY_PREFIX}n-3`,
      "broadcast_sent",
      "Save our number went out to 8 people",
      "1 replied so far.",
      "ok",
      "bolt",
      178,
      "broadcasts/run:b-number",
      "Open the run",
      { type: "broadcast", id: "b-number" },
    ),
    bellRow(
      nowMs,
      `${NEEDS_KEY_PREFIX}cv-ana`,
      "needs_you",
      "Ana Reyes needs you",
      "I'd rather talk to a person about a refund for last time.",
      "warn",
      "alert",
      94,
      "inbox/th-cv-ana",
      "Open",
    ),
    ...(busy ? busyBellRows(nowMs) : []),
    bellRow(
      nowMs,
      `${NEEDS_KEY_PREFIX}cv-kenia`,
      "needs_you",
      "Kenia Duarte needs a call back",
      "Call back to confirm Saturday 10:00.",
      "warn",
      "alert",
      40,
      "inbox/th-cv-kenia",
      "Open",
    ),
    bellRow(
      nowMs,
      `${CALL_KEY_PREFIX}k-voicemail`,
      "missed_call",
      "Missed call · +1 (347) 555-0188",
      "Reached voicemail, 30s.",
      "warn",
      "phone",
      25,
      "conversations/cv-k-voicemail",
      "See the call",
    ),
  ];
}
