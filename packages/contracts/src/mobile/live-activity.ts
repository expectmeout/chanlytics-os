/**
 * The call in progress on the Lock Screen and in the Dynamic Island (the phone app's PRD, PR 7): what the edge
 * pushes to start it, in the shape expo-widgets reads (`content-state.name` is the activity's name, `props` its
 * props as a JSON string), the name both sides agree on, and who is shown it. Pure; the wire is
 * apps/edge/lib/ops/apns.ts.
 */
import { formatPhoneDisplay, phoneTail } from "../shared/phone";

export const CALL_ACTIVITY_NAME = "CallActivity";
/** A call that nobody ended is stale after this long: the phone stops trusting it (the app ends it earlier). */
export const CALL_ACTIVITY_STALE_MS = 15 * 60_000;
/**
 * Whose phones are shown a call in progress: the people who take calls. A viewer reads the workspace and a partner
 * looks after it from outside; a stranger's number on their Lock Screen is not theirs to see.
 */
export const CALL_ACTIVITY_ROLES = ["owner", "operator"] as const;

export interface CallActivityProps {
  /** Who is on the line: the person's name, else the number's last four digits, else "Someone". */
  who: string;
  /** The receptionist's line they called. */
  line: string;
  /** When the call started, ISO. */
  startedAt: string;
}

/** APNs' payload for a push-to-start of the call's activity, with the alert a phone shows beside it. */
export function callActivityStart(props: CallActivityProps, now: Date): Record<string, unknown> {
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    aps: {
      timestamp: seconds,
      event: "start",
      "attributes-type": "LiveActivityAttributes",
      attributes: {},
      "content-state": { name: CALL_ACTIVITY_NAME, props: JSON.stringify(props) },
      "stale-date": seconds + Math.floor(CALL_ACTIVITY_STALE_MS / 1000),
      alert: { title: "Call in progress", body: `${props.who} is on the line.` },
    },
  };
}

/**
 * The activity's props for one call. A Lock Screen is read by whoever holds the phone, so a caller the workspace
 * knows is named, and one it does not is the number's last four digits, never the whole number.
 */
export function callActivityPropsOf(call: {
  /** The person's name, as the Live page names them (display name, else their WhatsApp name). */
  name?: string | null;
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
}): CallActivityProps {
  const tail = phoneTail(call.from_e164) ?? phoneTail(call.from_raw);
  const who = (call.name ?? "").trim() || (tail ? `Caller ending ${tail}` : "Someone");
  return {
    who,
    line: formatPhoneDisplay(call.to_e164) ?? "your line",
    startedAt: call.started_at ?? new Date(0).toISOString(),
  };
}
