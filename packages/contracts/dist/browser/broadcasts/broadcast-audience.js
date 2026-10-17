import { PURPOSE_REFUSALS } from "../consent/consent.js";
import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { PEOPLE_LISTS } from "../people/lists/lists.js";
import { saidYesTo } from "../people/person-consent.js";
import { firstNameOf } from "../templates/templates.js";
import { answeredYes } from "./reach-any.js";
import {
  channelNeverCarries,
  reachFor,
  reachSplit
} from "./reach-for.js";
export const AUDIENCE_KINDS = ["everyone", "list", "saved"];
export function audienceTrigger(audience) {
  const t = audience && typeof audience === "object" ? audience.trigger : null;
  return typeof t === "string" ? t : null;
}
export const EVERYONE_LABEL = "Everyone";
export const EVERYONE_HINT = "Everyone we can reach whose yes covers the message you pick, and by email whoever has dealt with you";
export const CONSENT_LIST_IDS = ["opted_in", "offers_ok", "opted_out"];
const LISTS_THAT_MEAN_EVERYONE = CONSENT_LIST_IDS.filter((id) => id !== "opted_out");
export function doorNamesNoAudience(to, audiences) {
  if (!to || !audiences || LISTS_THAT_MEAN_EVERYONE.includes(to)) return false;
  return !audiences.some((a) => (a.kind === "saved" || a.kind === "list") && a.id === to);
}
export const UNKNOWN_AUDIENCE_WORDS = "That list can't be messaged right now, so check who this is addressed to before you send.";
export function eligibleFor(rows, kind, id, savedIds, purpose, how) {
  return enrolFor(rows, kind, id, savedIds, purpose, how).map((e) => e.row);
}
export function enrolFor(rows, kind, id, savedIds, purpose, how) {
  const out = [];
  for (const row of audienceMembers(rows, kind, id, savedIds)) {
    const p = reachFor(row, purpose, how);
    if (p.channel) out.push({ row, channel: p.channel });
  }
  return out;
}
export function saidYesOnAny(r, purpose, how) {
  return answeredYes(r, purpose) && CONSENT_CHANNELS.some(
    (c) => how.channels.includes(c) && channelNeverCarries(c, purpose) === null && saidYesTo(r, purpose, c, how.about)
  );
}
export function heldWords(held, purpose) {
  switch (held) {
    case "no_number":
      return "No phone number on file, so nothing can be sent.";
    case "no_address":
      return "No email address on file, so nothing can be sent.";
    // The address is on file and mail to it has stopped: the door's own sentence (deliver.ts email_suppressed), which
    // says to correct it.
    case "address_stopped":
      return PURPOSE_REFUSALS.email_suppressed;
    case "no_channel":
      return "No channel this message can go by here.";
    case "stopped":
      return PURPOSE_REFUSALS.opted_out;
    case "unsubscribed":
      return "They unsubscribed from offers by email. Reminders, confirmations and replies still reach them.";
    case "no_yes":
      return PURPOSE_REFUSALS[purpose === "marketing" ? "no_marketing_consent" : "not_opted_in"];
    default: {
      const unreachable = held;
      return unreachable;
    }
  }
}
const LACKS = {
  whatsapp: "no phone number",
  sms: "no phone number",
  email: "no email address that works"
};
export function heldBackWords(channels) {
  const lacks = [...new Set(CONSENT_CHANNELS.filter((c) => channels.includes(c)).map((c) => LACKS[c]))];
  const reach = lacks.length > 0 ? [`have ${lacks.join(" or ")}`] : [];
  return `people who ${["asked to stop", ...reach].join(", ")}, or are mid-thread with a person are held back at the wire`;
}
export function audienceMembers(rows, kind, id, savedIds) {
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    return l ? rows.filter(l.test) : [];
  }
  if (kind === "saved") return savedIds ? rows.filter((r) => savedIds.has(r.id)) : [];
  return rows;
}
function previewPerson(r, refusal, channel) {
  return {
    id: r.id,
    label: r.name,
    firstName: firstNameOf(r.givenName, r.waName, { source: r.nameSource, settled: r.nameSettled }),
    refusal,
    channel
  };
}
const NO_TOUCHES = {};
export function audiencePreview(rows, kind, id, savedIds, purpose, how, limit = 5, touches = NO_TOUCHES) {
  const pool = audienceMembers(rows, kind, id, savedIds);
  const picks = pool.map((r) => ({ r, p: reachFor(r, purpose, how) }));
  const sending = picks.filter((x) => x.p.channel !== null);
  const held = picks.filter((x) => x.p.channel === null);
  const named = sending.filter(
    (x) => firstNameOf(x.r.givenName, x.r.waName, { source: x.r.nameSource, settled: x.r.nameSettled }) !== null
  );
  const unnamed = sending.filter(
    (x) => firstNameOf(x.r.givenName, x.r.waName, { source: x.r.nameSource, settled: x.r.nameSettled }) === null
  );
  const order = [...named.slice(0, 1), ...unnamed.slice(0, 1), ...named.slice(1), ...unnamed.slice(1)];
  const people = order.slice(0, limit).map((x) => previewPerson(x.r, null, x.p.channel));
  for (const { r, p } of held.slice(0, 2))
    people.push(previewPerson(r, p.held ? heldWords(p.held, purpose) : null, null));
  const heardTouches = [];
  for (const x of sending) {
    const times = touches[x.r.id];
    if (times && times.length > 0 && x.p.channel)
      heardTouches.push({ times: times.map(Date.parse), channel: x.p.channel });
  }
  return {
    people,
    split: reachSplit(pool, purpose, how),
    sending: sending.length,
    held: held.length,
    saidYes: pool.filter((r) => saidYesOnAny(r, purpose, how)).length,
    heardTouches
  };
}
