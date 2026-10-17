import { formatPhoneDisplay, normalizePhone, samePhone, whyNotAHandoff } from "../shared/phone.js";
import { forwardingTestOpen } from "../voice/forwarding.js";
import { forwardedLineOf, keptPhoneKind } from "./setup.js";
import { MIN_MS } from "../shared/time.js";
import { mmss } from "../shared/clock.js";
export const TRY_QUIET_AFTER_MS = 3 * MIN_MS;
const TRY_SLACK_MS = MIN_MS;
export const FIRST_RUN_TRY_WORDS = {
  listenForwarded: "Call your number from your cell. Don't pick up.",
  /**
   * A number kept on a mobile, or on a phone the saved forwarding does not name as a landline's or an office's: the
   * owner's cell may be the very phone that rings, and a phone cannot call itself.
   */
  listenForwardedOther: "Call your number from another phone. Don't pick up.",
  leadOther: "A phone can't call itself, so use a second one or ask someone to call. Ask what a customer would, like \u201CAre you open on Sunday?\u201D",
  routeOther: (kept) => `Another phone calls ${kept} \u2192 nobody picks up \u2192 your receptionist answers`,
  dial: (number) => `Call ${number}`,
  listenOwn: "Call your receptionist from your cell.",
  lead: "Ask what a customer would, like \u201CAre you open on Sunday?\u201D",
  listening: "Listening for your call",
  listeningDetail: "This page changes the moment it picks up.",
  listeningWindow: (minutes) => `This page changes the moment it picks up. Open for ${minutes} more ${minutes === 1 ? "minute" : "minutes"}.`,
  route: (kept) => `Your cell calls ${kept} \u2192 nobody picks up \u2192 your receptionist answers`,
  quietHeading: "No call has reached your receptionist yet",
  stillListening: "Still listening",
  causesForwarded: [
    {
      question: "Did you hear a tone after dialing the code?",
      answer: "If not, dial the code again, or pick another phone company."
    },
    {
      question: "Did an answering machine or voicemail pick up?",
      answer: "Turn it off. It answers before your receptionist can."
    },
    {
      question: "Did you call from the phone customers call?",
      answer: "Use another phone. A line can't forward a call to itself."
    }
  ],
  causeOwn: (number) => ({
    question: `Did you call ${number}?`,
    answer: "That's the number your receptionist answers."
  }),
  showCode: "Show the code again",
  help: "Ask Chanlytics for help",
  helpSent: "We'll email you to find a time for a call.",
  helpFailed: "Not asked",
  pickedUp: "It picked up.",
  proofForwarded: "Forwarding works",
  proofOwn: "Your receptionist answered",
  onTheCall: "on the call now",
  behind: "Words arrive a moment behind the call.",
  doneHeading: "That's your receptionist.",
  from: (number) => `from ${number}`,
  through: (number) => `through ${number}`,
  receptionist: "Receptionist",
  caller: "You",
  someone: "Caller",
  transferLabel: "When a caller asks for a person",
  putThrough: (number) => `Put them through to ${number}`,
  putThroughCaller: "The phone you just called from. It rings during opening hours; outside them, it takes a message.",
  keepPutting: (number) => `Keep putting them through to ${number}`,
  keepPuttingSentence: "The number on record now.",
  message: "Take a message and email me",
  messageSentence: "Nobody is put through. You get the message right away.",
  notKept: (kept) => `Not ${kept}: while it forwards, that call would ring straight back here.`,
  saved: "Saved. Your receptionist puts callers through as you chose.",
  notSaved: "Not saved",
  notReadYet: "Your settings are still being read. Try again in a moment.",
  inbox: "It's in your Inbox too",
  continue: "Continue",
  skip: "Can't call right now? Skip for now",
  nudge: "Most owners call once. It takes a minute, and it's the only way to know your calls really reach your receptionist.",
  stay: "OK, I'll call",
  anyway: "Skip anyway"
};
function dialOf(toCall, shown, rings) {
  return toCall && shown && rings !== "mobile" ? { label: FIRST_RUN_TRY_WORDS.dial(shown), tel: `tel:${toCall}` } : null;
}
function listenWordsOf(rings, shown, quiet) {
  const W = FIRST_RUN_TRY_WORDS;
  const number = shown ?? "";
  const said = rings === null ? { heading: W.listenOwn, lead: W.lead, route: null } : rings === "office" ? { heading: W.listenForwarded, lead: W.lead, route: W.route(number) } : { heading: W.listenForwardedOther, lead: W.leadOther, route: W.routeOther(number) };
  return quiet ? { heading: W.quietHeading, lead: "", route: said.route } : said;
}
export function firstRunTryOf({ dto, calls, since, nowMs }) {
  const W = FIRST_RUN_TRY_WORDS;
  const voice = dto.channels.voice;
  const own = voice.active ? normalizePhone(voice.number) : null;
  const fw = forwardedLineOf(dto.lines);
  const kept = fw ? normalizePhone(fw.e164) : null;
  const forwarded = !!kept;
  const proven = forwarded && fw.forwarding_state === "verified";
  const shown = formatPhoneDisplay(kept ?? own);
  const f0 = fw?.forwarding ?? null;
  const openTest = fw && f0 && fw.forwarding_state !== "verified" && !forwardingTestOpen(f0, nowMs) ? fw.id : null;
  const base = {
    number: shown,
    forwarded,
    dial: dialOf(kept ?? own, shown, keptPhoneKind(fw)),
    help: forwarded ? W.help : null,
    openTest,
    listening: null,
    causes: [],
    call: null,
    transfer: null,
    skip: { label: W.skip, nudge: W.nudge, stay: W.stay, anyway: W.anyway }
  };
  if (!own) return { ...base, stage: "rows", heading: "", lead: "" };
  const tested = !!voice.lastInboundAt;
  const inbound = calls.filter((c) => c.direction === "inbound" && !c.missed && c.startedAtMs !== null).sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
  const call = inbound.find((c) => (c.startedAtMs ?? 0) >= since - TRY_SLACK_MS) ?? (tested ? inbound[0] ?? null : null);
  if (!call) {
    const open = !!f0 && fw.forwarding_state !== "verified" && forwardingTestOpen(f0, nowMs);
    const left = open && f0.test_until ? Math.max(1, Math.ceil((Date.parse(f0.test_until) - nowMs) / MIN_MS)) : null;
    const quiet = nowMs - since >= TRY_QUIET_AFTER_MS;
    const said = listenWordsOf(keptPhoneKind(fw), shown, quiet);
    return {
      ...base,
      stage: quiet ? "quiet" : "listen",
      heading: said.heading,
      lead: said.lead,
      listening: {
        sentence: quiet ? W.stillListening : W.listening,
        detail: left !== null ? W.listeningWindow(left) : W.listeningDetail,
        route: said.route
      },
      causes: quiet ? forwarded ? W.causesForwarded.map((c) => ({ ...c })) : [W.causeOwn(formatPhoneDisplay(own) ?? own)] : []
    };
  }
  const test = (call.startedAtMs ?? 0) >= since - TRY_SLACK_MS;
  const turns = call.transcript.filter((t) => t.speaker === "agent" || t.speaker === "client").map((t) => ({
    who: t.speaker === "agent" ? W.receptionist : test ? W.caller : W.someone,
    text: t.text,
    agent: t.speaker === "agent"
  }));
  const proof = proven ? W.proofForwarded : W.proofOwn;
  const to = `conversations/${call.cvId}`;
  if (call.live) {
    const secs = Math.max(0, Math.floor((nowMs - (call.startedAtMs ?? nowMs)) / 1e3));
    const clock = mmss(secs * 1e3);
    return {
      ...base,
      stage: "call",
      heading: W.pickedUp,
      lead: "",
      call: { line: [proof, W.onTheCall, clock].join(" \xB7 "), live: true, test, turns, behind: W.behind, to }
    };
  }
  const caller = normalizePhone(call.from);
  const current = normalizePhone(dto.business.handoff);
  const callerOk = test && !!caller && whyNotAHandoff(caller, own, kept) === null;
  const options = [];
  if (callerOk) {
    options.push({
      key: "caller",
      label: W.putThrough(formatPhoneDisplay(caller) ?? caller),
      sentence: W.putThroughCaller,
      to: caller
    });
  }
  if (current && !samePhone(current, caller)) {
    options.push({
      key: "current",
      label: W.keepPutting(formatPhoneDisplay(current) ?? current),
      sentence: W.keepPuttingSentence,
      to: current
    });
  }
  options.push({ key: "message", label: W.message, sentence: W.messageSentence, to: null });
  const value = !current ? "message" : samePhone(current, caller) && callerOk ? "caller" : "current";
  const line = [
    call.duration ?? call.lengthWords,
    call.number ? W.from(call.number) : null,
    proven && shown ? W.through(shown) : null,
    call.startedLabel
  ].filter(Boolean).join(" \xB7 ");
  return {
    ...base,
    stage: "done",
    heading: W.doneHeading,
    lead: "",
    call: { line, live: false, test, turns, behind: null, to },
    transfer: {
      label: W.transferLabel,
      options,
      value,
      note: forwarded && shown ? W.notKept(shown) : null
    }
  };
}
