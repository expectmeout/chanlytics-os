import { missedCall } from "../conversations/call-dto.js";
export function callJumpSub(c) {
  if (c.live) return "live";
  if (!c.missed) return void 0;
  return missedCall(c) ? "missed" : "didn't connect";
}
export function askCallOutcome(v) {
  return v.outcome === "missed" && !missedCall(v) ? "not_connected" : v.outcome;
}
