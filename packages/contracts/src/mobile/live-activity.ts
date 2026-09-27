/**
 * The call in progress on the Lock Screen and in the Dynamic Island (the phone app's PRD, PR 7): what the edge
 * pushes to start it, in the shape expo-widgets reads (`content-state.name` is the activity's name, `props` its
 * props as a JSON string), and the name both sides agree on. Pure; the wire is apps/edge/lib/ops/apns.ts.
 */

export const CALL_ACTIVITY_NAME = "CallActivity";
/** A call that nobody ended is stale after this long: the phone stops trusting it (the app ends it earlier). */
export const CALL_ACTIVITY_STALE_MS = 15 * 60_000;

export interface CallActivityProps {
  /** Who is on the line, as the line's words say it: a name, else the number, else "Someone". */
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

/** The activity's props for one call row, in the words the Live page uses. */
export function callActivityPropsOf(call: {
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
  who?: string | null;
}): CallActivityProps {
  const who = (call.who ?? "").trim() || (call.from_e164 ?? "").trim() || (call.from_raw ?? "").trim() || "Someone";
  return {
    who,
    line: (call.to_e164 ?? "").trim() || "your line",
    startedAt: call.started_at ?? new Date(0).toISOString(),
  };
}
