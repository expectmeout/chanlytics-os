import { reachFor } from "../broadcasts/reach-for.js";
import { enrolPurpose } from "../playbooks/playbook-purpose.js";
export const FOLLOW_UP_CONDITIONS = ["no_booking", "no_reply"];
export function followUpStop(person, onlyIf, sentAtMs) {
  if (onlyIf.includes("no_booking") && person.booked) return "booked";
  if (onlyIf.includes("no_reply") && person.askedMs !== null && sentAtMs !== null && person.askedMs > sentAtMs)
    return "replied";
  return null;
}
export function messageAboutOfClass(policyClass) {
  return policyClass === "booking" || policyClass === "follow_up" ? "theirs" : "ours";
}
export function followUpReach(due, step) {
  const purpose = enrolPurpose(step.policy_class, step.message);
  const how = {
    channels: step.channels,
    ready: step.ready,
    about: messageAboutOfClass(step.policy_class)
  };
  const reach = {
    pool: due.length,
    will: 0,
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: 0
  };
  const byChannel = { whatsapp: 0, sms: 0, email: 0 };
  const channelOf = {};
  const eligible = [];
  const held = [];
  for (const r of due) {
    const pick = reachFor(r, purpose, how);
    if (pick.channel) {
      channelOf[r.id] = pick.channel;
      byChannel[pick.channel] += 1;
      eligible.push(r);
      continue;
    }
    held.push({ id: r.id, why: pick.held });
    if (pick.held === "no_number") reach.noNumber += 1;
    else if (pick.held === "stopped" || pick.held === "unsubscribed") reach.stopped += 1;
    else if (pick.held === "no_yes") reach.noYes += 1;
    else if (pick.held === "no_address") reach.no_address = (reach.no_address ?? 0) + 1;
    else if (pick.held === "address_stopped") reach.address_stopped = (reach.address_stopped ?? 0) + 1;
    else reach.no_channel = (reach.no_channel ?? 0) + 1;
  }
  reach.will = eligible.length;
  reach.by_channel = byChannel;
  return { eligible, reach, channelOf, held };
}
