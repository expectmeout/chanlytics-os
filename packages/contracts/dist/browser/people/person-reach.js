import { optOutWords } from "../consent/consent.js";
import { replyWindow } from "../config/policy.js";
import { HOUR_MS } from "../shared/time.js";
import { PERSON_CHANNEL_WORDS, REPLY_VIA } from "./person-words.js";
const EMAIL_STOPPED_TAG = "stopped accepting mail";
export const EMAIL_STOPPED_LINE = EMAIL_STOPPED_TAG.charAt(0).toUpperCase() + EMAIL_STOPPED_TAG.slice(1);
export const EMAIL_CANT_REACH = `Email can't reach them: their address ${EMAIL_STOPPED_TAG}`;
const NO_THREAD_YET = "No conversation with them yet: a conversation begins from the Inbox";
export function bookingLinkAction(reach, stop) {
  const { via, window: win } = reach;
  const notReady = (title, offered = true) => ({
    label: "Send the booking link",
    short: "Send the link",
    title,
    ready: false,
    offered
  });
  if (stop.optedOut) return notReady(optOutWords(stop.who), false);
  if (via === null) return notReady(NO_THREAD_YET, false);
  const ready = (by, title) => ({
    label: `${by} the booking link`,
    short: `${by} the link`,
    title,
    ready: true,
    offered: true
  });
  if (via === "Email")
    return reach.emailStopped ? notReady(EMAIL_CANT_REACH, false) : ready("Email", "Opens the thread with the link ready to send by email");
  if (via === "Text") return ready("Text", "Opens the thread with the link ready to send as a text");
  if (win && win.open)
    return ready("Text", `Opens the thread with the link ready to send \xB7 any message for ${win.hoursLeft}h more`);
  return notReady(
    "Only an approved message reaches them until they write again; their thread offers the one with the link"
  );
}
export function replyReachOf(p, now) {
  const stop = { optedOut: p.optedOut, who: p.who };
  if (!p.wire)
    return {
      replyWindow: null,
      replyVia: null,
      bookingLinkAction: bookingLinkAction({ via: null, window: null, emailStopped: p.emailStopped }, stop)
    };
  const w = replyWindow(p.wire, p.waInboundAt, now);
  const win = {
    open: w.open,
    hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / HOUR_MS)) : 0
  };
  const via = REPLY_VIA[p.wire];
  return {
    replyWindow: win,
    replyVia: via,
    bookingLinkAction: bookingLinkAction({ via, window: win, emailStopped: p.emailStopped }, stop)
  };
}
export function proposalMessage(url) {
  return `Here's the proposal we put together for you: ${url}`;
}
export function proposalAction(reach, sentWords) {
  const { via, window: win } = reach;
  const again = sentWords ? " again" : "";
  const sent = sentWords ? ` \xB7 sent ${sentWords}` : "";
  const notReady = (title) => ({ label: "Send the proposal", title, ready: false });
  if (via === "Email")
    return reach.emailStopped ? notReady(EMAIL_CANT_REACH) : {
      label: `Email the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send by email${sent}`,
      ready: true
    };
  if (via === "Text")
    return {
      label: `Text the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send as a text${sent}`,
      ready: true
    };
  if (win && win.open)
    return {
      label: `Send the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send \xB7 any message for ${win.hoursLeft}h more${sent}`,
      ready: true
    };
  return notReady("Only an approved message reaches them until they write again, so the proposal waits until they do");
}
export function emailFactWords(email, stopped) {
  return stopped ? `${email} \xB7 ${EMAIL_STOPPED_TAG}` : email;
}
export function repliesWords(via, window, stop) {
  if (stop.optedOut) return optOutWords(stop.who);
  if (via === "Email") return stop.emailStopped ? EMAIL_CANT_REACH : "Any time, by email";
  if (via === "Text") return "Any time, by text";
  if (via !== "WhatsApp" || !window) return null;
  if (!window.open) return "Approved messages only, until they write again";
  const h = window.hoursLeft;
  return h >= 1 ? `Any message, for ${h} more ${h === 1 ? "hour" : "hours"}` : "Any message, for less than an hour";
}
const EMAIL_STOPPED_SHORT = "Stopped accepting mail";
const WRITTEN_WIRES = ["whatsapp", "sms", "email"];
export function rowReachWords(p, named) {
  const wrote = p.lastChannel ?? WRITTEN_WIRES.find((c) => p.channels.includes(c)) ?? null;
  const via = wrote ? REPLY_VIA[wrote] : null;
  const wire = via ?? (p.channels.includes("voice") ? PERSON_CHANNEL_WORDS.voice : null);
  const id = !named ? null : via === "Email" ? p.email || p.phone : p.phone || p.email;
  const may = !p.stopped && p.replyVia === "Email" && p.emailSuppressed ? EMAIL_STOPPED_SHORT : null;
  const replies = p.stopped ? null : repliesWords(p.replyVia, p.replyWindow, { optedOut: false, who: p.name, emailStopped: p.emailSuppressed });
  return { wire, id: id ?? null, may, tip: [p.channelWords, replies].filter(Boolean).join(" \xB7 ") };
}
export function mayReach(p) {
  return !!p.openThread && p.consent.state !== "opted_out" && !p.consent.dnc && !(p.replyVia === "Email" && p.emailSuppressed);
}
