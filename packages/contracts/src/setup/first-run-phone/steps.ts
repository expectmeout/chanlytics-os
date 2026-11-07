/** First run phone: steps. */

import { maySpend } from "../../workspace/billing/dtos";
import { areaCodeOf, formatPhoneDisplay, normalizePhone } from "../../shared/phone";
import { agoWords, DAY_MS } from "../../shared/time";
import {
  CARRIER_WORDS,
  forwardingCarrierOf,
  forwardingCodes,
  isCarrier,
  isForwardingMode,
  PHONE_RINGS,
  type Carrier,
  type PhoneChoice,
  type PhoneCompany,
  type PhonePick,
  type PhoneRings,
  type PhoneWay,
} from "../../voice/forwarding";
import { lineStuckProvisioning, type LineDto, type SetupDto, type SetupRowVM } from "../lines";
import type { SetupVM } from "../setup";
import { FIRST_RUN_PHONE_WORDS, type FirstRunPhoneCodeVM, type FirstRunPhoneVM, type FirstRunPhoneWayVM } from "./vm";

export interface FirstRunPhoneInput {
  dto: SetupDto;
  vm: SetupVM;
  /** The owner's choice as the tab keeps it; null before one is made (the way then shown is the first). */
  choice: PhoneChoice | null;
  /** This tab came back from checkout with a card given, and the plan has not landed yet. */
  returned: boolean;
  nowMs: number;
  /** Which step asks (decision 0073): Where it answers chooses, Go live spends. Absent is Go live. */
  at?: "channels" | "live";
}

/** What every stage says alike: the way, the three ways, the numbers, the box and the area code. */
type PhoneStepBase = Pick<FirstRunPhoneVM, "way" | "ways" | "number" | "listed" | "box" | "area">;

/** What the step says while the number is on its way, and over Setup's rows: who sees the number, nothing to press. */
type PhoneStepReady = Pick<
  FirstRunPhoneVM,
  "heading" | "lead" | "plan" | "cta" | "questions" | "code" | "forwardFrom" | "saved" | "keepCode"
>;

/**
 * What every stage of the step is drawn from, read once (as Setup's rows read their context): the input, the number
 * the step is about, the line and the money, the owner's two answers, and the parts the stages say alike.
 */
export interface PhoneStep extends FirstRunPhoneInput {
  way: PhoneWay;
  /** A number kept or moved: the calls nobody picks up at it are forwarded to the receptionist's. */
  forwarded: boolean;
  number: string | null;
  area: string | null;
  /** The workspace's own line, past "none"; null before one is bought. */
  ownLine: LineDto | null;
  /** Setup's line row, whose words the step says while the number is on its way. */
  lineRow: SetupRowVM | null;
  /** Whether this workspace may put a charge on Chanlytics' account (maySpend). */
  canSpend: boolean;
  pick: PhonePick | null;
  /** The number picked, as the app writes one. */
  picked: string | null;
  base: PhoneStepBase;
  ready: PhoneStepReady;
  /** Every case this step does not draw: Setup's own rows say it. */
  rows: FirstRunPhoneVM;
  rings: PhoneRings | null;
  company: PhoneCompany | null;
  /** The two questions about the number kept or moved, for a choice this tab holds; null otherwise. */
  questions: FirstRunPhoneVM["questions"];
  /** Both answered: the carrier whose code they choose is known. */
  answered: boolean;
}

export function phoneStepOf(input: FirstRunPhoneInput): PhoneStep {
  const { dto, vm, choice } = input;
  const { way, forwarded, listed, number, area } = numbersOf(dto, choice);
  const billing = dto.billing;
  const ownLine = dto.lines?.rows.find((l) => l.voice_state !== "none") ?? null;
  const lineRow = vm.rows.find((r) => r.id === "line") ?? null;
  const pick = choice?.pick ?? null;
  const base: PhoneStepBase = {
    way,
    ways: waysOf(number, listed),
    number,
    listed,
    box: formatPhoneDisplay(listed) ?? "",
    area,
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
    ...answersOf(choice, forwarded, number),
  };
}

/** The number the step is about: the way chosen (the first, before a choice), the listing's, the one to keep or move. */
function numbersOf(dto: SetupDto, choice: PhoneChoice | null) {
  const way: PhoneWay = choice?.way ?? "keep";
  const forwarded = way !== "new";
  const listed = normalizePhone(dto.google?.phone ?? null);
  const typed = normalizePhone(choice?.number ?? null);
  // The box starts from the listing's number; what the owner typed replaces it, and an emptied box is none.
  const number = choice && choice.number !== null ? typed : listed;
  const area = areaCodeOf(forwarded ? number : null) ?? areaCodeOf(listed);
  return { way, forwarded, listed, number, area };
}

/** The three ways (canvas R3): keeping the number customers know first, and recommended. */
function waysOf(number: string | null, listed: string | null): FirstRunPhoneWayVM[] {
  const words = FIRST_RUN_PHONE_WORDS;
  return [
    {
      key: "keep",
      title: words.keepTitle(formatPhoneDisplay(number)),
      sentence: number && number === listed ? words.keepListed : words.keepTyped,
      recommended: words.recommended,
    },
    { key: "new", title: words.newTitle, sentence: words.newSentence, recommended: null },
    { key: "move", title: words.moveTitle, sentence: words.moveSentence, recommended: null },
  ];
}

/** Said while the number is on its way: who sees it depends on the way chosen; a tab that lost the choice says neither. */
function readyOf(choice: PhoneChoice | null, forwarded: boolean): PhoneStepReady {
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    heading: words.readyHeading,
    lead: !choice ? "" : forwarded ? words.readyLeadForwarded : words.readyLeadNew,
    plan: null,
    cta: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null,
  };
}

/** The owner's two answers, and the questions they answer. */
function answersOf(choice: PhoneChoice | null, forwarded: boolean, number: string | null) {
  const rings = choice?.rings ?? null;
  const company = choice?.company ?? null;
  // The two questions, for a number kept or moved (a choice this tab holds, with a number to forward from).
  const asking = !!choice && forwarded && !!number;
  return {
    rings,
    company,
    questions: asking && number ? questionsAbout(number, rings, company) : null,
    answered: !!forwardingCarrierOf(rings, company),
  };
}

/** The two questions (canvas R4) about the number the forwarding is for: which phone rings, and a mobile's company. */
function questionsAbout(
  about: string,
  rings: PhoneRings | null,
  company: PhoneCompany | null,
): NonNullable<FirstRunPhoneVM["questions"]> {
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    rings: {
      label: words.ringsLabel(formatPhoneDisplay(about)),
      options: PHONE_RINGS.map((k) => ({ key: k, label: words.rings[k] })),
      value: rings,
    },
    // A landline takes the landline codes whoever runs it, so only a mobile is asked its company.
    company:
      rings === "mobile"
        ? {
            label: words.companyLabel,
            options: (["verizon", "att", "tmobile", "other"] as const).map((k) => ({
              key: k,
              label: words.company[k],
            })),
            value: company,
          }
        : null,
  };
}

/** The button the questions lead to: held until the line answers, then until both are answered. */
export function showCtaOf(s: PhoneStep, lineAnswers: boolean): NonNullable<FirstRunPhoneVM["cta"]> {
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    label: s.rings === "office" ? words.showOffice : words.show,
    held: !lineAnswers ? words.readySoon : s.answered ? null : words.answerFirst,
    act: "forward",
  };
}

/** The forwarding saved on the workspace's line: a carrier, with its code shown (instructed) or proven (verified). */
interface SavedForwarding {
  line: LineDto;
  forwarding: NonNullable<LineDto["forwarding"]>;
  carrier: Carrier;
}

/** A line that answers: the receptionist's own number the calls go to, and what is saved to send them there. */
interface AnsweringLine {
  dest: string;
  saved: SavedForwarding | null;
  /** The number the saved forwarding is for, E.164; null where it has none to ask about. */
  from: string | null;
}

/**
 * A line that answers: the code, once the forwarding is saved; the questions, while a number kept or moved has none
 * yet (or the owner asked to change the answers); Setup's rows otherwise. One switched off is the rows' to say.
 */
export function answeringStageOf(phoneStep: PhoneStep): FirstRunPhoneVM {
  const voice = phoneStep.dto.channels.voice;
  const dest = voice.active ? voice.number : null;
  const saved = savedForwardingOf(phoneStep.dto.lines);
  if (!dest) return phoneStep.rows;
  const line: AnsweringLine = { dest, saved, from: saved ? normalizePhone(saved.line.e164) : null };
  for (const stage of ANSWERING_STAGES) {
    const drawn = stage(phoneStep, line);
    if (drawn) return drawn;
  }
  return phoneStep.rows;
}

function savedForwardingOf(lines: SetupDto["lines"]): SavedForwarding | null {
  const fw = lines?.rows.find((l) => l.kind === "forwarded") ?? null;
  const f = fw?.forwarding ?? null;
  return fw && f && isCarrier(f.carrier) && (fw.forwarding_state === "instructed" || fw.forwarding_state === "verified")
    ? { line: fw, forwarding: f, carrier: f.carrier }
    : null;
}

/**
 * The stages over a line that answers, in the order they are decided -- the questions asked again, an office phone
 * system's forwarding, a phone's code, the questions -- each null where it does not draw: the first that draws, draws.
 */
const ANSWERING_STAGES: readonly ((s: PhoneStep, line: AnsweringLine) => FirstRunPhoneVM | null)[] = [
  askedAgainStageOf,
  officeCodeStageOf,
  phoneCodeStageOf,
  questionsStageOf,
];

/** Asked again after the code was shown: about the number the saved forwarding is for, whatever the tab holds. */
function askedAgainStageOf(s: PhoneStep, line: AnsweringLine): FirstRunPhoneVM | null {
  if (!line.saved || !s.choice?.redo || !line.from) return null;
  return askStageOf(s, {
    questions: questionsAbout(line.from, s.rings, s.company),
    forwardFrom: line.from,
    saved: { carrier: line.saved.carrier },
    keepCode: FIRST_RUN_PHONE_WORDS.keepCode,
  });
}

/** An office phone system (canvas V6): the number to forward to, where to set it, and a person to do it with. */
function officeCodeStageOf(phoneStep: PhoneStep, line: AnsweringLine): FirstRunPhoneVM | null {
  const saved = line.saved;
  if (!saved || saved.carrier !== "office") return null;
  const words = FIRST_RUN_PHONE_WORDS;
  const forwarding = saved.forwarding;
  const mode = isForwardingMode(forwarding.mode) ? forwarding.mode : "unanswered";
  const codes = forwardingCodes("office", mode, forwarding.destination_e164 ?? line.dest);
  const keepRow = phoneStep.vm.rows.find((r) => r.id === "keep") ?? null;
  const meAsked = withMeAskedOf(phoneStep);
  return codeStageOf(phoneStep, words.officeHeading, words.officeLead, {
    label: words.officeLabel(mode === "always"),
    dial: formatPhoneDisplay(forwarding.destination_e164 ?? line.dest) ?? line.dest,
    tel: codes.on.tel,
    tap: null,
    steps: [...words.officeSteps],
    warn: words.officeWarn,
    off: words.officeOff,
    help: { label: words.helpOffice, notes: codes.notes },
    change: line.from ? words.change : null,
    verified: saved.line.forwarding_state === "verified" && keepRow ? keepRow.sentence : null,
    withMe: {
      sentence: words.withMe,
      label: words.withMeLabel,
      asked: meAsked !== null ? words.withMeAsked(agoWords(meAsked, phoneStep.nowMs)) : null,
    },
  });
}

/** When the owner asked a person to do it with them. One ask a day (setup_request): an ask older than that is offered
 * again, in case it reached nobody. */
function withMeAskedOf(s: PhoneStep): number | null {
  const askedAt = s.dto.requests.forwarding ? Date.parse(s.dto.requests.forwarding) : NaN;
  return !Number.isNaN(askedAt) && s.nowMs - askedAt < DAY_MS ? askedAt : null;
}

/** A phone with a code (canvas R5, P5): not an office phone system (the stage before), a company with its codes. */
function phoneCodeStageOf(phoneStep: PhoneStep, line: AnsweringLine): FirstRunPhoneVM | null {
  const saved = line.saved;
  if (!saved || saved.carrier === "office") return null;
  const words = FIRST_RUN_PHONE_WORDS;
  const carrier = saved.carrier;
  const forwarding = saved.forwarding;
  // The mode saved, which Setup's own card may have set to every call: the code and the lead follow it.
  const mode = isForwardingMode(forwarding.mode) ? forwarding.mode : "unanswered";
  const codes = forwardingCodes(carrier, mode, forwarding.destination_e164 ?? line.dest);
  // What rings, as answered; a tab that lost the answers says neither (a mobile with another company is `other` too).
  // An office answer the saved forwarding does not bear out (another tab changed it) is not said either.
  const sentence = phoneStep.rings === "office" ? null : phoneStep.rings;
  const keepRow = phoneStep.vm.rows.find((r) => r.id === "keep") ?? null;
  return codeStageOf(phoneStep, words.codeHeading, mode === "always" ? words.codeLeadAll : words.codeLead, {
    label: sentence
      ? words.codeLabel(sentence === "mobile" && carrier !== "other" ? words.company[carrier] : null, sentence)
      : CARRIER_WORDS[carrier],
    dial: codes.on.code,
    tel: codes.on.tel,
    ...ringWordsOf(sentence),
    off: words.off(codes.off.code),
    help: { label: words.help, notes: codes.notes },
    change: line.from ? words.change : null,
    verified: saved.line.forwarding_state === "verified" && keepRow ? keepRow.sentence : null,
    withMe: null,
  });
}

/** For the phone that rings: a mobile's tap to dial, the steps, and what answers before the receptionist can. */
function ringWordsOf(sentence: PhoneRings | null): Pick<FirstRunPhoneCodeVM, "tap" | "steps" | "warn"> {
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    tap: sentence === "mobile" ? words.tap : null,
    steps:
      sentence === "mobile"
        ? [...words.stepsMobile]
        : sentence === "landline"
          ? [...words.stepsLandline]
          : [...words.stepsAny],
    warn: sentence === "mobile" ? words.warnMobile : sentence === "landline" ? words.warnLandline : words.warnAny,
  };
}

/** The line answers and nothing is saved yet: the questions for a number kept or moved (a new one is done). */
function questionsStageOf(s: PhoneStep): FirstRunPhoneVM | null {
  if (!s.questions) return null;
  return askStageOf(s, { questions: s.questions, forwardFrom: s.number, saved: null, keepCode: null });
}

/** The two questions, and the button that saves the forwarding their answers choose. */
function askStageOf(
  phoneStep: PhoneStep,
  firstRunPhone: Pick<FirstRunPhoneVM, "questions" | "forwardFrom" | "saved" | "keepCode">,
): FirstRunPhoneVM {
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    ...phoneStep.base,
    stage: "ask",
    heading: words.askHeading,
    lead: words.askLead,
    plan: null,
    status: null,
    questions: firstRunPhone.questions,
    cta: showCtaOf(phoneStep, true),
    code: null,
    forwardFrom: firstRunPhone.forwardFrom,
    saved: firstRunPhone.saved,
    keepCode: firstRunPhone.keepCode,
    // Asked again after a code was saved, the way back is Keep what I have: there is nothing left to put off.
    putOff: firstRunPhone.saved ? null : words.putOff,
  };
}

/** The code to dial, or where to forward: its heading and lead, the code, and the button on to Try it. */
function codeStageOf(phoneStep: PhoneStep, heading: string, lead: string, code: FirstRunPhoneCodeVM): FirstRunPhoneVM {
  return {
    ...phoneStep.base,
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
    keepCode: null,
  };
}

/** On its way: the line row's own words (canvas R4, "the step words are Setup's own"). Stopped: the row's Retry. */
export function onItsWayStageOf(phoneStep: PhoneStep, ownLine: LineDto): FirstRunPhoneVM {
  const onItsWay =
    (ownLine.voice_state === "provisioning" && !lineStuckProvisioning(ownLine, phoneStep.nowMs)) ||
    ownLine.voice_state === "answering";
  const row = phoneStep.lineRow;
  if (!onItsWay || !row) return phoneStep.rows;
  return {
    ...phoneStep.base,
    ...phoneStep.ready,
    stage: "getting",
    status: { state: row.state, words: row.stateWords, sentence: row.sentence, detail: row.details[0] ?? "" },
    questions: phoneStep.questions,
    cta: phoneStep.questions ? showCtaOf(phoneStep, false) : null,
  };
}
