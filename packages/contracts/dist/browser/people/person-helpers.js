import { clockDate } from "../shared/clock.js";
import { DAY_MS } from "../shared/time.js";
import { adRoute } from "../ads/address.js";
import { PERSON_AD_ON, PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "./person-words.js";
import {
  THREAD_CHANNEL_WORDS,
  isChatMessage,
  isFromTheirSide,
  isTheirOwnWords,
  writtenChannelOf
} from "../conversations/thread-channel.js";
import { HELD_REASONS, isReplyTo } from "../broadcasts/run-words.js";
import { addressOf } from "../activity/record-address.js";
export const MONTH_MS = 30 * DAY_MS;
export const ts = (iso) => iso ? new Date(iso).getTime() : null;
export function fmtDate(ms, tz, nowMs) {
  return clockDate(ms, tz, nowMs);
}
export function replyChannelOfThreads(conversations) {
  let own = null;
  let any = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (!isFromTheirSide(m)) continue;
      const at = Date.parse(m.channel_ts ?? m.created_at);
      if (!Number.isFinite(at)) continue;
      if (!any || at > any.at) any = { at, channel: m.channel };
      if (isTheirOwnWords(m) && (!own || at > own.at)) own = { at, channel: m.channel };
    }
  }
  const latest = own ?? any;
  return latest ? writtenChannelOf(latest.channel) : null;
}
export function ourWireOfThreads(conversations) {
  let last = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.direction !== "outbound" || !isChatMessage(m)) continue;
      const at = Date.parse(m.channel_ts ?? m.created_at);
      if (Number.isFinite(at) && (!last || at > last.at)) last = { at, channel: m.channel };
    }
  }
  return last ? writtenChannelOf(last.channel) : null;
}
export function proposalSent(conversations, url) {
  let best = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.direction !== "outbound" || !m.body || !m.body.includes(url)) continue;
      if (m.status && ["queued", "canceled", "failed"].includes(m.status)) continue;
      const iso = m.channel_ts ?? m.created_at;
      const at = Date.parse(iso);
      if (Number.isFinite(at) && (!best || at > best.at)) best = { at, iso, channel: m.channel ?? null };
    }
  }
  if (!best) return null;
  const via = best.channel && best.channel in PERSON_CHANNEL_WORDS ? PERSON_CHANNEL_WORDS[best.channel] : null;
  return { at: best.iso, via };
}
export function proposalSending(conversations, url) {
  return conversations.some(
    (c) => c.messages.some((m) => m.direction === "outbound" && m.status === "queued" && !!m.body && m.body.includes(url))
  );
}
export function addedBy(added) {
  if (added.source === "import") return { who: "You", how: "from a spreadsheet", to: null };
  if (added.source === "ad") return addedByAd(added.ad ?? null);
  if (added.source !== "calendar" && added.source !== "lead" && added.source !== "website")
    return { who: "You", how: "by hand", to: null };
  const from = PERSON_CAME_FROM_WORDS[added.source];
  return {
    who: added.source === "calendar" ? "Calendar" : added.source === "lead" ? "Leads" : "Website",
    how: `from ${from.charAt(0).toLowerCase()}${from.slice(1)}${added.source === "calendar" && added.title ? ` (${added.title})` : ""}`,
    to: null
  };
}
function addedByAd(ad) {
  const from = PERSON_CAME_FROM_WORDS.ad.toLowerCase();
  if (!ad) return { who: "Ads", how: `from ${from}`, to: null };
  return { who: "Ads", how: `from ${from} (${ad.name}, on ${PERSON_AD_ON[ad.platform]})`, to: adRoute(ad.id) };
}
export function campaignsOf(d, tz, nowMs) {
  const threadOf = /* @__PURE__ */ new Map();
  const repliesIn = /* @__PURE__ */ new Map();
  for (const c of d.conversations) {
    for (const m of c.messages) {
      threadOf.set(m.id, c.id);
      if (isTheirOwnWords(m)) repliesIn.set(c.id, [...repliesIn.get(c.id) ?? [], m.created_at]);
    }
  }
  return (d.campaigns ?? []).map((c) => {
    const at = ts(c.sent_at ?? c.scheduled_for);
    const thread = c.message_id ? threadOf.get(c.message_id) : void 0;
    const sentAt = c.sent_at;
    const replied = c.state === "sent" && !!sentAt && !!thread && (repliesIn.get(thread) ?? []).some((x) => isReplyTo(sentAt, x));
    const why = c.reason ? HELD_REASONS[c.reason] : void 0;
    const outcome = c.state === "sent" ? replied ? "Replied" : "Sent" : c.state === "skipped" ? `Held \u2014 ${why ?? "held back"}` : c.state === "failed" ? why ? `Didn't send \u2014 ${why}` : "Didn't send" : "Waiting to send";
    return {
      id: c.broadcast_id,
      kind: c.playbook_id ? "playbook" : "broadcast",
      title: c.playbook_id ? c.playbook_name || c.name : c.name,
      when: at !== null ? clockDate(at, tz, nowMs) : "\u2014",
      outcome,
      // Which wire it went by, or would have: a person on three channels is not told "Sent" with nowhere to look.
      line: `${c.playbook_id ? "Campaign" : "Sent once"} \xB7 ${THREAD_CHANNEL_WORDS[writtenChannelOf(c.channel)]} \xB7 ${outcome}`,
      tone: replied ? "ok" : c.state === "skipped" || c.state === "failed" ? "warn" : "plain",
      to: addressOf({ kind: "send", id: c.broadcast_id })
    };
  });
}
export function inSequencesOf(d, tz, nowMs) {
  return (d.sequences ?? []).map((q) => ({
    id: q.id,
    name: q.name,
    line: q.next_at ? `step ${q.place} \xB7 next ${clockDate(Date.parse(q.next_at), tz, nowMs)}` : `step ${q.place}`,
    to: addressOf({ kind: "campaign", id: q.id })
  }));
}
