import { billingDoorOpen, maySpend, priceWords, CHECKOUT_OUTCOME_WORDS } from "../workspace/billing.js";
import { formatPhoneDisplay, normalizePhone } from "../shared/phone.js";
import { agoWords, DAY_MS } from "../shared/time.js";
import {
  CARRIER_WORDS,
  forwardingCarrierOf,
  forwardingCodes,
  isCarrier,
  isForwardingMode,
  PHONE_RINGS
} from "../voice/forwarding.js";
import {
  lineStuckProvisioning,
  SETUP_STATE_WORDS
} from "./setup.js";
export const FORWARDING_WAIT_WORDS = "Until it is set up, only calls to your receptionist's own number are answered.";
export const FIRST_RUN_PHONE_WORDS = {
  chooseHeading: "How should calls reach your receptionist?",
  /** Where it answers' tile (canvas 4). */
  calls: "Calls",
  mode: { unanswered: "When nobody picks up", always: "Every call" },
  orNew: "get a new number",
  orMove: "move it to Chanlytics",
  /** Under the calls choice: when the receptionist's line is bought, kept or moved (it answers what is forwarded) or new. */
  ownLater: "Your receptionist answers on a line of its own, bought when you go live.",
  newLater: "The number is bought when you go live, not before.",
  chooseLead: "Most businesses keep the number customers already know. Your team still answers first, and your receptionist gets the rest.",
  readyHeading: "Getting your receptionist's number ready",
  readyLeadForwarded: "Customers never see this number: the calls nobody picks up at yours are sent to it.",
  readyLeadNew: "Customers call this number directly. Put it on your website and your Google listing.",
  recommended: "Recommended",
  keepTitle: (display) => display ? `Keep ${display}` : "Keep the number you have",
  keepListed: "The number on your Google listing. Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  keepTyped: "Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  newTitle: "Get a new number",
  newSentence: "For a business that doesn't have one yet. Customers call it directly.",
  moveTitle: "Move my number to Chanlytics",
  moveSentence: "Takes 7\u201314 business days. Your number forwards in the meantime, so nothing changes for customers.",
  numberLabel: "The number customers call",
  numberPlaceholder: "(305) 555-0100",
  areaLabel: "Area code",
  areaPlaceholder: "305",
  find: "Find numbers",
  finding: "Looking\u2026",
  pickLabel: "Pick your receptionist's number",
  noneFree: (area) => `Nothing free in ${area} right now. Try a nearby area code.`,
  threeDigits: "Three digits, like 305.",
  local: "Local",
  held: {
    number: "Type the number customers call.",
    us: "Forwarding works for a US number: type it with its area code.",
    pick: "Pick a number first."
  },
  cta: {
    /** Go live's press (canvas 5A): the plan started by checkout, a trial's plan started now, or the number bought. */
    plan: "Start my plan",
    startNow: "Start my plan and go live",
    buy: "Go live"
  },
  planOffer: (price) => price ? `${price}, starting today` : "Your plan, starting today",
  planNote: "Your number is included. The first charge is today, and you can cancel anytime from Billing.",
  /** A workspace on a free trial: the trial covers no number, so getting one starts the plan early. */
  planNoteTrial: "Your free trial ends today and your plan starts, on the card you gave. Your number is included.",
  starting: "Starting your plan\u2026",
  startingDetail: "Your card is on file. This page updates as Stripe confirms it.",
  buyingIn: (area) => area ? `Getting your receptionist's number in ${area}\u2026` : "Getting your receptionist's number\u2026",
  buyingNew: (number) => `Getting ${number}\u2026`,
  usually: "Usually a minute or two; this page updates by itself",
  /** What the page says when a buy or a search is refused, over the door's own sentence. */
  notBought: "No number yet",
  moveAsked: "We'll move your number with you and reach you by email. Until then, it forwards.",
  moveNotAsked: "The move wasn't asked for. Ask again from Settings later; your number forwards meanwhile.",
  cancelled: CHECKOUT_OUTCOME_WORDS.cancel,
  /** The two questions while the number is on its way (canvas R4), and the button they lead to. */
  ringsLabel: (display) => display ? `Which phone rings when customers call ${display}?` : "Which phone rings when customers call?",
  rings: { mobile: "A mobile", landline: "A landline", office: "An office phone system" },
  companyLabel: "Who's the phone company?",
  company: { verizon: "Verizon", att: "AT&T", tmobile: "T-Mobile", other: "Another company" },
  show: "Show me what to dial",
  showOffice: "Show me where to forward",
  readySoon: "Ready in a moment",
  answerFirst: "Answer the questions first.",
  askHeading: "One more thing",
  askLead: "How the calls are sent to your receptionist depends on the phone that rings.",
  /** The code (canvas R5, P5). */
  codeHeading: "Dial this on the phone customers call",
  codeLead: "It tells your phone company to send the calls nobody picks up to your receptionist. You only do this once.",
  codeLeadAll: "It tells your phone company to send every call to your receptionist. You only do this once.",
  codeLabel: (company, rings) => rings === "landline" ? "A landline" : company ? `${company} \xB7 a mobile` : "A mobile",
  stepsLandline: ["Pick up the phone customers call.", "Dial the code above.", "Wait for the tone, then hang up."],
  stepsMobile: ["On the phone customers call, dial the code above.", "Wait for the tone, then hang up."],
  /** A tab that lost the answers: what rings is not known, so neither is said. */
  stepsAny: ["Dial the code above on the phone customers call.", "Wait for the tone, then hang up."],
  // Not a promise the code replaces voicemail: forwarding.ts says a voicemail that picks up first keeps calls away.
  warnMobile: "Voicemail on this phone? If it still picks up after you dial the code, calls never reach your receptionist: see The code didn't work.",
  warnLandline: "If an answering machine is on this line, turn it off. Otherwise it answers before your receptionist can.",
  warnAny: "Voicemail or an answering machine on that phone? If it picks up first, calls never reach your receptionist: see The code didn't work.",
  off: (code) => `To switch it off later, dial ${code}.`,
  tap: "Tap to dial",
  done: "Done, let's try it",
  help: "The code didn't work",
  change: "Change the answers",
  keepCode: "Keep what I have",
  /** The forwarding put off from the questions: what the link says, and what the page says once it is. */
  putOff: "Set up forwarding later",
  putOffSaid: `Put off for a week, then it's back on Today. ${FORWARDING_WAIT_WORDS}`,
  /** The code, or the number to forward to, copied for the phone it is typed on. */
  copy: "Copy",
  copied: "Copied",
  notCopied: "Not copied. Select the code and copy it yourself.",
  /** An office phone system (canvas V6): the number to forward to, and a person to do it with. */
  officeHeading: "Forward missed calls in your phone system",
  officeLead: "Office phone systems set this in their own settings, under \u201Cforwarding\u201D or \u201Cwhen no one answers\u201D.",
  officeLabel: (always) => always ? "Forward every call to" : "Forward unanswered calls to",
  officeSteps: [
    "Open your phone system's settings.",
    "Find forwarding, or what happens when no one answers.",
    "Forward the calls to the number above: your receptionist's number. Customers never see it."
  ],
  officeWarn: "Voicemail in the system? The forwarding has to come before it, or calls never reach your receptionist.",
  officeOff: "To switch it off later, take the forwarding out in the same settings.",
  withMe: "Not sure where it is? A person at Chanlytics can do it with you on a call.",
  withMeLabel: "Do it with me",
  helpOffice: "It didn't work",
  withMeAsked: (ago) => `Asked ${ago}: a person at Chanlytics will email you to find a time.`,
  withMeFailed: "Not asked",
  withMeSent: "We'll email you to find a time for a call.",
  notForwarded: "Forwarding not saved"
};
export function areaCodeOf(raw) {
  const e164 = normalizePhone(raw);
  return e164 && /^\+1\d{10}$/.test(e164) ? e164.slice(2, 5) : null;
}
export function firstRunPhoneOf(input) {
  const { dto } = input;
  const s = phoneStepOf(input);
  if (input.at === "channels") return channelsStageOf(s);
  if (dto.channels.voice.present) return answeringStageOf(s);
  if (s.ownLine) return onItsWayStageOf(s, s.ownLine);
  return noLineYetStageOf(s);
}
function phoneStepOf(input) {
  const { dto, vm, choice } = input;
  const { way, forwarded, listed, number, area } = numbersOf(dto, choice);
  const billing = dto.billing;
  const ownLine = dto.lines?.rows.find((l) => l.voice_state !== "none") ?? null;
  const lineRow = vm.rows.find((r) => r.id === "line") ?? null;
  const pick = choice?.pick ?? null;
  const base = {
    way,
    ways: waysOf(number, listed),
    number,
    listed,
    box: formatPhoneDisplay(listed) ?? "",
    area
  };
  const ready = readyOf(choice, forwarded);
  return {
    ...input,
    way,
    forwarded,
    number,
    area,
    ownLine,
    lineRow,
    canSpend: !billing || maySpend(billing.mode, billing.status),
    pick,
    picked: pick ? formatPhoneDisplay(pick.e164) : null,
    base,
    ready,
    rows: { ...base, ...ready, stage: "rows", status: null },
    ...answersOf(choice, forwarded, number)
  };
}
function numbersOf(dto, choice) {
  const way = choice?.way ?? "keep";
  const forwarded = way !== "new";
  const listed = normalizePhone(dto.google?.phone ?? null);
  const typed = normalizePhone(choice?.number ?? null);
  const number = choice && choice.number !== null ? typed : listed;
  const area = areaCodeOf(forwarded ? number : null) ?? areaCodeOf(listed);
  return { way, forwarded, listed, number, area };
}
function waysOf(number, listed) {
  const W = FIRST_RUN_PHONE_WORDS;
  return [
    {
      key: "keep",
      title: W.keepTitle(formatPhoneDisplay(number)),
      sentence: number && number === listed ? W.keepListed : W.keepTyped,
      recommended: W.recommended
    },
    { key: "new", title: W.newTitle, sentence: W.newSentence, recommended: null },
    { key: "move", title: W.moveTitle, sentence: W.moveSentence, recommended: null }
  ];
}
function readyOf(choice, forwarded) {
  const W = FIRST_RUN_PHONE_WORDS;
  return {
    heading: W.readyHeading,
    lead: !choice ? "" : forwarded ? W.readyLeadForwarded : W.readyLeadNew,
    plan: null,
    cta: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null
  };
}
function answersOf(choice, forwarded, number) {
  const rings = choice?.rings ?? null;
  const company = choice?.company ?? null;
  const asking = !!choice && forwarded && !!number;
  return {
    rings,
    company,
    questions: asking && number ? questionsAbout(number, rings, company) : null,
    answered: !!forwardingCarrierOf(rings, company)
  };
}
function questionsAbout(about, rings, company) {
  const W = FIRST_RUN_PHONE_WORDS;
  return {
    rings: {
      label: W.ringsLabel(formatPhoneDisplay(about)),
      options: PHONE_RINGS.map((k) => ({ key: k, label: W.rings[k] })),
      value: rings
    },
    // A landline takes the landline codes whoever runs it, so only a mobile is asked its company.
    company: rings === "mobile" ? {
      label: W.companyLabel,
      options: ["verizon", "att", "tmobile", "other"].map((k) => ({
        key: k,
        label: W.company[k]
      })),
      value: company
    } : null
  };
}
function showCtaOf(s, lineAnswers) {
  const W = FIRST_RUN_PHONE_WORDS;
  return {
    label: s.rings === "office" ? W.showOffice : W.show,
    held: !lineAnswers ? W.readySoon : s.answered ? null : W.answerFirst,
    act: "forward"
  };
}
function answeringStageOf(s) {
  const voice = s.dto.channels.voice;
  const dest = voice.active ? voice.number : null;
  const saved = savedForwardingOf(s.dto.lines);
  if (!dest) return s.rows;
  const line = { dest, saved, from: saved ? normalizePhone(saved.line.e164) : null };
  for (const stage of ANSWERING_STAGES) {
    const drawn = stage(s, line);
    if (drawn) return drawn;
  }
  return s.rows;
}
function savedForwardingOf(lines) {
  const fw = lines?.rows.find((l) => l.kind === "forwarded") ?? null;
  const f = fw?.forwarding ?? null;
  return fw && f && isCarrier(f.carrier) && (fw.forwarding_state === "instructed" || fw.forwarding_state === "verified") ? { line: fw, forwarding: f, carrier: f.carrier } : null;
}
const ANSWERING_STAGES = [
  askedAgainStageOf,
  officeCodeStageOf,
  phoneCodeStageOf,
  questionsStageOf
];
function askedAgainStageOf(s, line) {
  if (!line.saved || !s.choice?.redo || !line.from) return null;
  return askStageOf(s, {
    questions: questionsAbout(line.from, s.rings, s.company),
    forwardFrom: line.from,
    saved: { carrier: line.saved.carrier },
    keepCode: FIRST_RUN_PHONE_WORDS.keepCode
  });
}
function officeCodeStageOf(s, line) {
  const saved = line.saved;
  if (!saved || saved.carrier !== "office") return null;
  const W = FIRST_RUN_PHONE_WORDS;
  const f = saved.forwarding;
  const mode = isForwardingMode(f.mode) ? f.mode : "unanswered";
  const codes = forwardingCodes("office", mode, f.destination_e164 ?? line.dest);
  const keepRow = s.vm.rows.find((r) => r.id === "keep") ?? null;
  const asked = withMeAskedOf(s);
  return codeStageOf(s, W.officeHeading, W.officeLead, {
    label: W.officeLabel(mode === "always"),
    dial: formatPhoneDisplay(f.destination_e164 ?? line.dest) ?? line.dest,
    tel: codes.on.tel,
    tap: null,
    steps: [...W.officeSteps],
    warn: W.officeWarn,
    off: W.officeOff,
    help: { label: W.helpOffice, notes: codes.notes },
    change: line.from ? W.change : null,
    verified: saved.line.forwarding_state === "verified" && keepRow ? keepRow.sentence : null,
    withMe: {
      sentence: W.withMe,
      label: W.withMeLabel,
      asked: asked !== null ? W.withMeAsked(agoWords(asked, s.nowMs)) : null
    }
  });
}
function withMeAskedOf(s) {
  const askedAt = s.dto.requests.forwarding ? Date.parse(s.dto.requests.forwarding) : NaN;
  return !Number.isNaN(askedAt) && s.nowMs - askedAt < DAY_MS ? askedAt : null;
}
function phoneCodeStageOf(s, line) {
  const saved = line.saved;
  if (!saved || saved.carrier === "office") return null;
  const W = FIRST_RUN_PHONE_WORDS;
  const carrier = saved.carrier;
  const f = saved.forwarding;
  const mode = isForwardingMode(f.mode) ? f.mode : "unanswered";
  const codes = forwardingCodes(carrier, mode, f.destination_e164 ?? line.dest);
  const said = s.rings === "office" ? null : s.rings;
  const keepRow = s.vm.rows.find((r) => r.id === "keep") ?? null;
  return codeStageOf(s, W.codeHeading, mode === "always" ? W.codeLeadAll : W.codeLead, {
    label: said ? W.codeLabel(said === "mobile" && carrier !== "other" ? W.company[carrier] : null, said) : CARRIER_WORDS[carrier],
    dial: codes.on.code,
    tel: codes.on.tel,
    ...ringWordsOf(said),
    off: W.off(codes.off.code),
    help: { label: W.help, notes: codes.notes },
    change: line.from ? W.change : null,
    verified: saved.line.forwarding_state === "verified" && keepRow ? keepRow.sentence : null,
    withMe: null
  });
}
function ringWordsOf(said) {
  const W = FIRST_RUN_PHONE_WORDS;
  return {
    tap: said === "mobile" ? W.tap : null,
    steps: said === "mobile" ? [...W.stepsMobile] : said === "landline" ? [...W.stepsLandline] : [...W.stepsAny],
    warn: said === "mobile" ? W.warnMobile : said === "landline" ? W.warnLandline : W.warnAny
  };
}
function questionsStageOf(s) {
  if (!s.questions) return null;
  return askStageOf(s, { questions: s.questions, forwardFrom: s.number, saved: null, keepCode: null });
}
function askStageOf(s, asked) {
  const W = FIRST_RUN_PHONE_WORDS;
  return {
    ...s.base,
    stage: "ask",
    heading: W.askHeading,
    lead: W.askLead,
    plan: null,
    status: null,
    questions: asked.questions,
    cta: showCtaOf(s, true),
    code: null,
    forwardFrom: asked.forwardFrom,
    saved: asked.saved,
    keepCode: asked.keepCode,
    // Asked again after a code was saved, the way back is Keep what I have: there is nothing left to put off.
    putOff: asked.saved ? null : W.putOff
  };
}
function codeStageOf(s, heading, lead, code) {
  return {
    ...s.base,
    stage: "code",
    heading,
    lead,
    plan: null,
    status: null,
    questions: null,
    cta: { label: FIRST_RUN_PHONE_WORDS.done, held: null, act: "onward" },
    code,
    forwardFrom: null,
    saved: null,
    keepCode: null
  };
}
function onItsWayStageOf(s, ownLine) {
  const onItsWay = ownLine.voice_state === "provisioning" && !lineStuckProvisioning(ownLine, s.nowMs) || ownLine.voice_state === "answering";
  const row = s.lineRow;
  if (!onItsWay || !row) return s.rows;
  return {
    ...s.base,
    ...s.ready,
    stage: "getting",
    status: { state: row.state, words: row.stateWords, sentence: row.sentence, detail: row.details[0] ?? "" },
    questions: s.questions,
    cta: s.questions ? showCtaOf(s, false) : null
  };
}
function channelsStageOf(s) {
  const { dto } = s;
  if (dto.channels.voice.present || s.ownLine) return s.rows;
  if (!dto.lines?.ready || dto.requests.line || dto.requests.port) return s.rows;
  const boxProblem = boxProblemOf(s);
  return {
    ...s.base,
    stage: "choose",
    heading: FIRST_RUN_PHONE_WORDS.calls,
    lead: FIRST_RUN_PHONE_WORDS.chooseLead,
    plan: null,
    boxProblem,
    cta: null,
    held: ctaHeldOf(s, boxProblem),
    status: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null
  };
}
function noLineYetStageOf(s) {
  const { dto, choice, returned } = s;
  if (!dto.lines?.ready || dto.requests.line || dto.requests.port) return s.rows;
  const onTrial = billingDoorOpen(dto.billing) && dto.billing.status === "trialing";
  const plan = phonePlanOf(dto.billing, onTrial);
  if (!s.canSpend && !plan) return s.rows;
  if (plan && returned) return startingStageOf(s);
  if (s.canSpend && choice?.pending) return buyingStageOf(s);
  return goStageOf(s, plan, onTrial);
}
function phonePlanOf(billing, onTrial) {
  const W = FIRST_RUN_PHONE_WORDS;
  return billingDoorOpen(billing) && (billing.status === "none" || onTrial) ? { offer: W.planOffer(priceWords(billing.price ?? null)), note: onTrial ? W.planNoteTrial : W.planNote } : null;
}
function startingStageOf(s) {
  const W = FIRST_RUN_PHONE_WORDS;
  return { ...s.base, ...s.ready, stage: "starting", status: waitingOn(W.starting, W.startingDetail) };
}
function buyingStageOf(s) {
  const W = FIRST_RUN_PHONE_WORDS;
  return {
    ...s.base,
    ...s.ready,
    stage: "buying",
    status: waitingOn(
      s.way === "new" && s.picked ? W.buyingNew(s.picked) : W.buyingIn(s.forwarded ? s.area : null),
      W.usually
    ),
    questions: s.questions,
    cta: s.questions ? showCtaOf(s, false) : null
  };
}
function waitingOn(sentence, detail) {
  return { state: "waiting_them", words: SETUP_STATE_WORDS.waiting_them, sentence, detail };
}
function goStageOf(s, plan, onTrial) {
  const W = FIRST_RUN_PHONE_WORDS;
  const boxProblem = boxProblemOf(s);
  const act = plan ? onTrial ? "startNow" : "plan" : "buy";
  return {
    ...s.base,
    stage: "go",
    heading: W.chooseHeading,
    lead: W.chooseLead,
    plan,
    boxProblem,
    cta: {
      label: ctaLabelOf(act),
      held: ctaHeldOf(s, boxProblem),
      act
    },
    status: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null
  };
}
function boxProblemOf(s) {
  const typedSome = !!s.choice && typeof s.choice.number === "string" && s.choice.number.trim() !== "";
  return s.way !== "new" && typedSome && !(s.number && areaCodeOf(s.number)) ? FIRST_RUN_PHONE_WORDS.held.us : null;
}
function ctaHeldOf(s, boxProblem) {
  const W = FIRST_RUN_PHONE_WORDS;
  if (s.way === "new") return s.pick ? null : W.held.pick;
  return boxProblem ?? (!s.number ? W.held.number : areaCodeOf(s.number) ? null : W.held.us);
}
function ctaLabelOf(act) {
  return FIRST_RUN_PHONE_WORDS.cta[act];
}
