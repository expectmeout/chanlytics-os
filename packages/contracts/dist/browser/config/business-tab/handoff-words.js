import { hardLimitsWords } from "../policy.js";
import { pluralGrouped } from "./counts.js";
const HANDED_OVER_ANYWAY = "a customer asks for a person or it can't help";
export function handoffChatWords(i) {
  const when = i.hasEscalateWhen ? `On your reasons, or when ${HANDED_OVER_ANYWAY}, it` : `When ${HANDED_OVER_ANYWAY}, it`;
  const pause = heldFor(hardLimitsWords({ pause_hours: i.pauseHours }).hours);
  return `${when} stops answering, the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed. It holds off for ${pause}, then answers the customer's next message itself.`;
}
export function transferWords(hasHandoffNumber) {
  return hasHandoffNumber ? "During opening hours it rings the number you gave and stays on until someone picks up. Outside them, or if nobody answers, it takes a message." : "No number yet, so it takes a message.";
}
export function handoffChatRow(pauseHours) {
  const pause = heldFor(hardLimitsWords({ pause_hours: pauseHours }).hours);
  return { name: "Stops and marks it Needs you", sub: `Sends your alerts \xB7 replies again after ${pause}` };
}
export function handoffCallRow(transfer) {
  const number = typeof transfer === "string" ? transfer.trim() : "";
  return number ? {
    name: `Rings ${number}`,
    sub: "In opening hours, otherwise takes a message",
    act: "Change",
    actName: "Change the transfer number"
  } : { name: "Takes a message", sub: "No transfer number", act: "Add one", actName: "Add a transfer number" };
}
export const HANDOFF_ANYWAY = "Anyone who asks for a person, or needs help it can't give, is handed over too.";
export function handoffWords(reasons, transfer) {
  const list = (Array.isArray(reasons) ? reasons : []).filter((r) => typeof r === "string" && r.trim() !== "").map((r) => r.trim());
  const n = list.length;
  const number = typeof transfer === "string" ? transfer.trim() : "";
  const phone = number ? `transfers to ${number}` : "takes a message";
  return {
    line: `${n ? `For ${pluralGrouped(n, "reason", "reasons")}` : `When ${HANDED_OVER_ANYWAY}`} \xB7 on a call, ${phone}`,
    phone
  };
}
function heldFor(pauseHours) {
  const hours = Math.max(1, Math.round(pauseHours));
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}
