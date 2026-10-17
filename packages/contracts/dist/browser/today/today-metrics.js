import { replySpeedOf } from "../reports/report-speed.js";
export function emailWires(email) {
  return email?.ready && email.mailbox ? [{ kind: "email", status: "active", number: null, address: email.mailbox.address }] : [];
}
export function todayReplySpeed(m) {
  return replySpeedOf(m.period.median_reply_seconds_ai, m.reply_hold ?? null);
}
