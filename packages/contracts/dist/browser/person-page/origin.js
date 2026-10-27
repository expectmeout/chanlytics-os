import { neverConnected } from "../conversations/call-dto.js";
import { isTheirOwnWords, writtenChannelOf } from "../conversations/thread-channel.js";
import { messageAt } from "../conversations/thread-dto.js";
import { CONSENT_CHANNEL_WORDS } from "../consent/consent-channels.js";
import { viaWords } from "../imports/csv.js";
import { clockDate } from "../shared/clock.js";
import { formatterOnUse } from "../shared/time.js";
import { samePhone } from "../shared/phone.js";
import { BEFORE_WORDS, ORIGIN_WORDS, REACH_SOURCE_WORDS } from "./words.js";
export function contactEvidenceOf(d, first) {
  const reachOut = d.lead?.reach_out ?? null;
  return {
    phone: d.row.phone_e164,
    email: d.row.email,
    first,
    calls: d.calls,
    messages: d.conversations.flatMap((c) => c.messages),
    added: d.added ? { source: d.added.source, ms: moment(d.added.at) } : null,
    listing: d.business ? { phone: d.business.lead.phone, email: d.business.lead.email } : null,
    lead: d.lead ? {
      foundMs: moment(d.lead.found_at),
      // A list of the owner's own (00242), never a company the people card found, which no listing named either.
      ownList: reachOut?.source ? reachOut.source === "import" : reachOut?.found_on_listing === false,
      firstSendMs: earliest((reachOut?.sends ?? []).map((x) => moment(x.sent_at)))
    } : null
  };
}
const moment = (iso) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};
const earliest = (xs) => {
  const ok = xs.filter((x) => x !== null);
  return ok.length ? Math.min(...ok) : null;
};
const undated = (m) => m.meta?.backfill === true && !m.channel_ts;
function firstWrote(messages, wires) {
  return earliest(
    messages.filter((m) => isTheirOwnWords(m) && wires.includes(writtenChannelOf(m.channel)) && !undated(m)).map((m) => moment(messageAt(m)))
  );
}
function firstCalled(e) {
  return earliest(
    e.calls.filter((k) => k.direction === "inbound" && !neverConnected(k) && samePhone(k.from_e164, e.phone)).map((k) => moment(k.started_at))
  );
}
function exactFirst(e, wires) {
  return e.first.ts !== null && !e.first.estimate && e.first.cameFrom && wires.includes(e.first.cameFrom) ? e.first.ts : null;
}
export function reachRowsOf(e, tz, nowMs) {
  const day = (t) => clockDate(t, tz, nowMs);
  const P = REACH_SOURCE_WORDS.phone;
  const E = REACH_SOURCE_WORDS.email;
  const called = earliest([firstCalled(e), exactFirst(e, ["call"])]);
  const wrote = earliest([firstWrote(e.messages, ["whatsapp", "sms"]), exactFirst(e, ["whatsapp", "sms"])]);
  const phone = called !== null && (wrote === null || called <= wrote) ? P.called(day(called)) : wrote !== null ? P.wrote(day(wrote)) : e.added?.source === "calendar" ? P.booking : e.listing && samePhone(e.listing.phone, e.phone) ? P.listing : P.none;
  const address = e.email?.trim().toLowerCase() ?? "";
  const emailed = earliest([firstWrote(e.messages, ["email"]), exactFirst(e, ["email"])]);
  const gave = address ? earliest(
    e.calls.filter((k) => k.direction === "inbound" && k.caller_email?.trim().toLowerCase() === address).map((k) => moment(k.started_at))
  ) : null;
  const email = emailed !== null ? E.wrote(day(emailed)) : gave !== null ? E.gaveOnCall(day(gave)) : address && e.listing?.email?.trim().toLowerCase() === address ? E.listing : E.none;
  return { phone, email };
}
function oursFirst(e) {
  const at = e.first.ts;
  if (at === null || e.first.estimate) return null;
  const call = e.calls.find((k) => moment(k.started_at) === at);
  if (call) return call.direction === "outbound" ? { call: true } : null;
  const m = e.messages.find((x) => moment(messageAt(x)) === at);
  return m && m.direction === "outbound" ? { on: FIRST_WRITTEN_ON[writtenChannelOf(m.channel)] } : null;
}
const FIRST_WRITTEN_ON = { ...CONSENT_CHANNEL_WORDS, instagram: "by Instagram DM" };
const firstLowered = (s) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
export function personOriginOf(e, tz, nowMs) {
  const from = e.first.cameFrom;
  if (!from) return null;
  const day = (t) => t !== null ? clockDate(t, tz, nowMs) : null;
  const W = ORIGIN_WORDS;
  if (from === "call" || from === "whatsapp" || from === "sms" || from === "email") {
    if (e.first.ts === null) return null;
    const when = firstLowered(e.first.label);
    const ours = oursFirst(e);
    if (ours) return "call" in ours ? W.weCalledFirst(when) : W.weWroteFirstOn(ours.on, when);
    return W[from](when);
  }
  if (from === "lead") {
    const found = day(e.lead?.foundMs ?? e.added?.ms ?? null);
    if (!found) return null;
    const said = e.lead?.ownList ? W.ownList(found) : W.lead(found);
    const wrote = day(e.lead?.firstSendMs ?? null);
    return wrote ? `${said} \xB7 ${W.weWroteFirst(wrote)}` : said;
  }
  const added = day(e.added?.ms ?? null) ?? (e.first.ts !== null ? firstLowered(e.first.label) : null);
  return added ? W[from](added) : null;
}
const MONTH_DAY = formatterOnUse("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export function personBeforeOf(before, nowMs) {
  if (!before) return null;
  const W = BEFORE_WORDS;
  const [, mm, dd] = (before.birthday ? /(\d{2})-(\d{2})$/.exec(before.birthday) : null) ?? [];
  const parts = [
    before.visits !== void 0 && before.visits > 0 ? W.visits(before.visits) : null,
    before.last_visit ? W.last(clockDate(Date.parse(`${before.last_visit}T12:00:00Z`), "UTC", nowMs)) : null,
    mm && dd ? W.birthday(MONTH_DAY.format(new Date(Date.UTC(2e3, +mm - 1, +dd)))) : null
  ].filter((x) => !!x);
  if (!parts.length) return null;
  return [W.label, ...parts, W.from(viaWords(before.via ?? null))].join(" \xB7 ");
}
