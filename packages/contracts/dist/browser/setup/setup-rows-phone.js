import { PHONE_LINE_OFF } from "../lines/caller-gets.js";
import { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "../lines/line-failure.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { agoWords, spanLabel } from "../shared/time.js";
import {
  CARRIER_WORDS,
  FORWARDING_MODE_WORDS,
  forwardingTestOpen
} from "../voice/forwarding.js";
import { whyCannotSpend, priceWords, billingDoorOpen } from "../workspace/billing.js";
import { capabilityStatus } from "./capabilities.js";
import {
  activationWords,
  forwardedLineOf,
  keptPhoneKind,
  lineStuckProvisioning,
  LINE_STEP_WORDS
} from "./setup.js";
export function lineRow(i, ctx) {
  const { voice, voiceReady, voiceNum, answering, ownLine, texting } = ctx;
  if (voiceReady) {
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "ready",
      required: !answering,
      sentence: `Calls are answered on ${voiceNum}. ${texting.sentence}`,
      details: [
        ownLine?.voice_state === "answering" ? "Your own number through Chanlytics" : "",
        ownLine || texting.done ? "" : "Texting arrives with lines that register with the carriers; this page will say when"
      ].filter(Boolean),
      verb: { label: "Open Connections", to: "admin/integrations" }
    };
  }
  if (voice.present) {
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_you",
      required: !answering,
      sentence: `Your line ${voice.number ? `${voiceNum} ` : ""}is switched off \u2014 ${PHONE_LINE_OFF.gets}.`,
      details: [],
      verb: { label: "Open Connections", to: "admin/integrations" }
    };
  }
  return ownLineRow(ctx) ?? lineToGetRow(i, ctx);
}
export function ownLineStandOf(line, nowMs, number) {
  const n = number ? ` ${number}` : "";
  const step = LINE_STEP_WORDS[line.step ?? ""] ?? "working on it";
  const ago = agoWords(Date.parse(line.state_since), nowMs);
  const retry = `verb:retry-line:${line.id}`;
  if (lineStuckProvisioning(line, nowMs)) {
    return {
      kind: "stuck",
      sentence: `Setting up${n} stopped while ${step}, ${ago}.`,
      details: [
        "It is retried automatically, usually within a quarter of an hour, and Chanlytics is told when it is",
        "Retry from here \u2014 it picks up where it stopped and buys nothing twice"
      ],
      retry
    };
  }
  if (line.voice_state === "provisioning") {
    return {
      kind: "setting_up",
      sentence: `Setting up${n} \u2014 ${step}, since ${ago}.`,
      details: ["Usually a minute or two; this page updates by itself"],
      retry: null
    };
  }
  if (line.voice_state === "failed" && lineCredentialFailure(line.last_error)) {
    return {
      kind: "credentials",
      sentence: `Setting up${n} stopped at ${LINE_CREDENTIALS_SENTENCE}. A person at Chanlytics has it.`,
      details: [
        "A retry cannot help until the credentials are restored; we have been told and will finish it with you"
      ],
      retry: null
    };
  }
  if (line.voice_state === "failed") {
    return {
      kind: "stopped",
      sentence: `Setting up${n} stopped while ${step}. A person at Chanlytics has it.`,
      details: ["Retry from here; we have been told"],
      retry
    };
  }
  if (line.voice_state === "answering") {
    return {
      kind: "connecting",
      sentence: `${number ?? "Your number"} is set up \u2014 connecting it to the receptionist.`,
      details: [],
      retry: null
    };
  }
  return null;
}
function ownLineRow(ctx) {
  const { answering, ownLine, lineNum, nowMs } = ctx;
  const stand = ownLine ? ownLineStandOf(ownLine, nowMs, lineNum) : null;
  if (!stand) return null;
  return {
    id: "line",
    icon: "phone",
    title: "A line for calls and texts",
    state: "waiting_them",
    required: !answering,
    sentence: stand.sentence,
    details: stand.details,
    verb: stand.retry ? { label: "Retry", to: stand.retry } : null
  };
}
function lineToGetRow(i, ctx) {
  const { answering, lines, canSpend, nowMs } = ctx;
  if (i.requests.port && !(i.requests.line && Date.parse(i.requests.line) > Date.parse(i.requests.port))) {
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_them",
      required: !answering,
      sentence: `Requested ${agoWords(Date.parse(i.requests.port), nowMs)} \u2014 a person at Chanlytics will move your number onto Chanlytics with you and reach you by email.`,
      details: [
        "Keep your current phone service until the move is finished \u2014 cancelling it first can lose the number",
        "Carriers take 7 to 14 business days once the move is filed"
      ],
      verb: null
    };
  }
  if (i.requests.line) {
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_them",
      required: !answering,
      sentence: `Requested ${agoWords(Date.parse(i.requests.line), nowMs)} \u2014 a person at Chanlytics will set up your line with you and reach you by email.`,
      details: [],
      verb: null
    };
  }
  if (lines.ready) {
    return canSpend ? {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_you",
      required: !answering,
      sentence: "Get a number for calls, or keep the one you have.",
      // The number is part of the plan (Ruben, 24 Sep 2026; docs/superpowers/specs/2026-09-24-first-run-design.md):
      // Checkout bills one price and nothing bills a number fee, so no row quotes one. The DTO still carries what a
      // number costs Chanlytics (lines.costs); nothing an owner reads says it.
      details: [
        "A local number, included in your plan \xB7 your receptionist answers it \xB7 texting arrives when the carriers register it"
      ],
      verb: { label: "Get a line", to: "verb:choose-line" }
    } : billingDoorOpen(i.billing) && (i.billing.status === "none" || i.billing.status === "trialing") ? (
      // No plan yet, or a free trial, which covers no number (maySpend): the number starts the plan, and the first
      // run's phone step is where both happen -- its checkout takes no trial, and a trial's plan starts from there.
      {
        id: "line",
        icon: "phone",
        title: "A line for calls and texts",
        state: "waiting_you",
        required: !answering,
        sentence: "Get a number for calls: it starts your plan.",
        details: [
          priceWords(i.billing.price ?? null) ? `A local number, included in your plan \xB7 ${priceWords(i.billing.price ?? null)}, from the day you get it` : "A local number, included in your plan, from the day you get it"
        ],
        verb: { label: "Get a number", to: "start/phone" }
      }
    ) : billingDoorOpen(i.billing) ? {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_you",
      required: !answering,
      sentence: whyCannotSpend(i.billing.mode, i.billing.status) ?? "Billing needs attention first.",
      details: ["A local number, included in your plan"],
      verb: { label: "Open Billing", to: "admin/billing" }
    } : (
      // CANNOT SPEND, AND THERE IS NO CARD TO ADD. Three states, not two: this
      // row used to collapse the last into the middle one and send a brand-new
      // self-serve workspace to a Billing page with every action false. The
      // billing row above already drew nothing for exactly this case, so the two
      // rows disagreed about one fact — which is why they now read one predicate.
      //
      // The honest offer is the one the branch below already makes for a
      // deployment that cannot provision at all: a person sets the line up with
      // them. It is true, it is actionable, and it does not require the owner to
      // discover on a dead page that the product cannot take their money yet.
      {
        id: "line",
        icon: "phone",
        title: "A line for calls and texts",
        state: "waiting_you",
        required: !answering,
        sentence: "We set up your phone line with you.",
        details: [
          "A number, the receptionist answering it, and forwarding from the number you have",
          "Billing is not open on this deployment yet, so there is nothing to add a card to"
        ],
        verb: { label: "Ask for a line", to: "verb:request-line" }
      }
    );
  }
  return {
    id: "line",
    icon: "phone",
    title: "A line for calls and texts",
    state: "waiting_you",
    required: !answering,
    sentence: "We set up your phone line with you.",
    details: ["A number, the receptionist answering it, and forwarding from the number you have"],
    verb: { label: "Ask for a line", to: "verb:request-line" }
  };
}
export function receptionistRow(i, ctx) {
  const { voice, voiceReady, voiceNum, answering, handoffNum, ownLine, nowMs } = ctx;
  if (voiceReady) {
    const last = voice.lastInboundAt ? `Last call ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}` : "No calls yet";
    const cap = capabilityStatus("voice", i, nowMs);
    if (!i.business.name || !i.business.hours) {
      return {
        id: "receptionist",
        icon: "headphones",
        title: "Phone receptionist",
        state: "waiting_you",
        required: !answering,
        sentence: `Picking up on ${voiceNum}, but it has no facts to answer with yet.`,
        details: [
          "Callers are told someone will confirm and are offered to leave a message",
          "Fill in your name, hours and services and it answers properly from the next call"
        ],
        verb: { label: "Add your facts", to: "admin/workspace" }
      };
    } else {
      return {
        id: "receptionist",
        icon: "headphones",
        title: "Phone receptionist",
        state: "ready",
        required: !answering,
        sentence: `Answering on ${voiceNum}.`,
        details: [
          handoffNum ? `Transfers to ${handoffNum} when a caller insists on a person` : "No hand-off number yet \u2014 callers who insist on a person are told someone will call back",
          last,
          activationWords(cap, nowMs)
        ],
        verb: cap.tested && !cap.live ? { label: "Activate", to: "verb:activate:voice" } : voice.number ? { label: "Call it", to: `tel:${voice.number}` } : null,
        undo: cap.live ? { label: "Withdraw activation", to: "verb:deactivate:voice" } : null
      };
    }
  }
  if (voice.present) {
    return {
      id: "receptionist",
      icon: "headphones",
      title: "Phone receptionist",
      state: "waiting_you",
      required: !answering,
      sentence: "Switched off with the line.",
      details: [],
      verb: null
    };
  }
  if (ownLine && (ownLine.voice_state === "provisioning" || ownLine.voice_state === "answering")) {
    return {
      id: "receptionist",
      icon: "headphones",
      title: "Phone receptionist",
      state: "waiting_them",
      required: !answering,
      sentence: "Being created with your line \u2014 it answers the moment the line does.",
      details: [],
      verb: null
    };
  }
  return {
    id: "receptionist",
    icon: "headphones",
    title: "Phone receptionist",
    state: "waiting_them",
    required: !answering,
    sentence: "The phone receptionist arrives with your line.",
    details: [],
    verb: null
  };
}
export function tryRow(_i, ctx) {
  const { voice, voiceReady, voiceNum, lines, nowMs } = ctx;
  if (!voiceReady) return null;
  const fwTry = forwardedLineOf(lines);
  const through = fwTry?.e164 ? formatPhoneDisplay(fwTry.e164) ?? fwTry.e164 : voiceNum;
  return {
    id: "try",
    icon: "phone",
    title: "Try it",
    state: voice.lastInboundAt ? "ready" : "waiting_you",
    required: false,
    sentence: voice.lastInboundAt ? `A call reached your receptionist ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}.` : fwTry ? (
      // A phone cannot call itself: only an office phone system's owner is sure to hold another phone, their cell.
      `Call ${through} from ${keptPhoneKind(fwTry) === "office" ? "your cell" : "another phone"} and don't pick up.`
    ) : `Call ${through} from your cell.`,
    details: [],
    // The first run's own step (first-run.ts firstRunStepRoute("try")), spelled here: that file reads this one.
    verb: voice.lastInboundAt ? null : { label: "Try it", to: "start/try" }
  };
}
export function keepRow(_i, ctx) {
  const { voice, voiceReady, voiceNum, lines, nowMs } = ctx;
  const fw = lines.rows.find((l) => l.kind === "forwarded") ?? null;
  const f = fw?.forwarding ?? null;
  const kept = fw?.e164 ? formatPhoneDisplay(fw.e164) ?? fw.e164 : "your number";
  const dest = voiceReady && voice.number ? voiceNum : null;
  const how = f ? `${FORWARDING_MODE_WORDS[f.mode] ?? "Forwarded"} \xB7 ${CARRIER_WORDS[f.carrier] ?? "your carrier"}` : "";
  const title = "The number you already have";
  if (fw && f && fw.forwarding_state === "verified") {
    return {
      id: "keep",
      icon: "refresh",
      title,
      state: "ready",
      required: false,
      sentence: `Calls to ${kept} reach your receptionist.`,
      details: [f.verified_at ? `Verified ${agoWords(Date.parse(f.verified_at), nowMs)}` : "Verified", how],
      verb: { label: "Change it", to: "verb:forwarding" }
    };
  }
  if (fw && f && forwardingTestOpen(f, nowMs)) {
    return {
      id: "keep",
      icon: "refresh",
      title,
      state: "waiting_you",
      required: false,
      sentence: `Testing \u2014 call ${kept} from another phone. This page updates by itself.`,
      details: [`Window open for ${spanLabel(Date.parse(f.test_until ?? "") - nowMs)}`],
      verb: { label: "Show the code", to: "verb:forwarding" }
    };
  }
  if (fw && f) {
    return {
      id: "keep",
      icon: "refresh",
      title,
      state: "waiting_you",
      required: false,
      sentence: f.carrier === "office" ? `Forward ${kept} to your receptionist in your phone system's settings, then test it.` : `Dial the code on the phone with ${kept}, then test it.`,
      details: [how],
      verb: { label: "Test it", to: `verb:forwarding-test:${fw.id}` }
    };
  }
  if (!dest) {
    return {
      id: "keep",
      icon: "refresh",
      title,
      state: "not_started",
      required: false,
      sentence: "Once your receptionist has a line, keep the number customers know by forwarding its calls to it.",
      details: [],
      verb: null
    };
  }
  return {
    id: "keep",
    icon: "refresh",
    title,
    state: "not_started",
    required: false,
    sentence: `Keep the number your customers know: forward its calls to ${dest}.`,
    details: ["You keep your phone, your carrier and your texts"],
    verb: { label: "Set up forwarding", to: "verb:forwarding" }
  };
}
