import { formatPhoneDisplay, phoneTail } from "../shared/phone.js";
import { MIN_MS } from "../shared/time.js";
export const CALL_ACTIVITY_NAME = "CallActivity";
export const CALL_ACTIVITY_STALE_MS = 4 * MIN_MS;
export const CALL_ACTIVITY_ROLES = ["owner", "operator"];
export function callActivityStart(props, now) {
  const seconds = Math.floor(now.getTime() / 1e3);
  return {
    aps: {
      timestamp: seconds,
      event: "start",
      "attributes-type": "LiveActivityAttributes",
      attributes: {},
      "content-state": { name: CALL_ACTIVITY_NAME, props: JSON.stringify(props) },
      "stale-date": seconds + Math.floor(CALL_ACTIVITY_STALE_MS / 1e3),
      alert: { title: "Call in progress", body: `${props.who} is on the line.` }
    }
  };
}
export function callActivityPropsOf(call) {
  const tail = phoneTail(call.from_e164) ?? phoneTail(call.from_raw);
  const who = (call.name ?? "").trim() || (tail ? `Caller ending ${tail}` : "Someone");
  return {
    who,
    line: formatPhoneDisplay(call.to_e164) ?? "your line",
    startedAt: call.started_at ?? (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
