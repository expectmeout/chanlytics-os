/**
 * The first run's phone step (docs/superpowers/plans/2026-09-24-first-run-4-phone.md, canvas R3–R5, V4, V5): how calls
 * reach the receptionist, the plan the number starts at its own price, and the receptionist's number on its way. Every sentence
 * is here; the page composes (first-run.jsx FrPhone).
 *
 * Every way buys the receptionist a number of its own. Customers call a new one directly; a number kept or being moved
 * forwards the calls nobody picks up to it (line_forwarding_set needs a line that answers), so customers never see it.
 *
 * Nothing here is stored. The owner's choice is the tab's (the page keeps it across Stripe's round trip), and everything
 * else is Setup's: a case this step does not draw -- no line provider, a line that stopped, billing that needs Billing,
 * a line a person was asked for, a line that answers -- is `rows`, where Setup's own rows say it as they always have.
 */
import { billingDoorOpen, maySpend, priceWords, CHECKOUT_OUTCOME_WORDS } from "./billing";
import { formatPhoneDisplay, normalizePhone } from "./phone";
import { agoWords } from "./time";
import { CARRIER_WORDS, forwardingCodes, isCarrier, isForwardingMode, type Carrier } from "./forwarding";
import { lineStuckProvisioning, SETUP_STATE_WORDS, type SetupDto, type SetupState, type SetupVM } from "./setup";

export const PHONE_WAYS = ["keep", "new", "move"] as const;
export type PhoneWay = (typeof PHONE_WAYS)[number];

/** A number offered to buy, as the search route answers it. Said through formatPhoneDisplay, never Twilio's `friendly`. */
export interface PhonePick {
  e164: string;
  friendly: string;
}

/** Which phone rings when customers call the number kept (canvas R4, V6). */
export const PHONE_RINGS = ["mobile", "landline", "office"] as const;
export type PhoneRings = (typeof PHONE_RINGS)[number];

/**
 * What the owner chose, as the tab keeps it: the way, the number they keep or move (as typed), the new number picked,
 * and whether they pressed the step's button, so the buy goes on once the plan lets it. For a number kept or moved,
 * the two answers that choose its code (which phone rings, and a mobile's phone company), and `redo` once the owner
 * asked to change them after the code was shown.
 */
export interface PhoneChoice {
  way: PhoneWay;
  number: string | null;
  pick: PhonePick | null;
  pending: boolean;
  rings?: PhoneRings | null;
  company?: PhoneCompany | null;
  redo?: boolean;
}

/** A mobile's phone company, as the question asks it. */
export type PhoneCompany = Exclude<Carrier, "office">;

/**
 * The carrier whose codes a phone takes: a mobile's own company's; a landline's the landline codes whoever runs it
 * (forwarding.ts `other`: most landlines take *92 and *72), since the mobile networks' codes are not a landline's; an
 * office phone system's none, since it forwards in its own settings (`office`, 00173).
 */
export function forwardingCarrierOf(
  rings: PhoneRings | null | undefined,
  company: PhoneCompany | null | undefined,
): Carrier | null {
  if (rings === "office") return "office";
  if (rings === "landline") return "other";
  if (rings === "mobile") return company ?? null;
  return null;
}

export type FirstRunPhoneStage = "choose" | "starting" | "buying" | "getting" | "ask" | "code" | "rows";

/** One question with its answers as a row of choices (canvas R4), and the one picked. */
export interface FirstRunPhoneQuestion<K extends string> {
  label: string;
  options: { key: K; label: string }[];
  value: K | null;
}

/** The code to dial (canvas R5, P5), from the forwarding saved on the workspace's line. */
export interface FirstRunPhoneCodeVM {
  /** "Verizon · a mobile", "A landline". */
  label: string;
  dial: string;
  tel: string;
  /** A mobile can take the code as a tap, on the phone in hand (the page offers it where the phone dials one). */
  tap: string | null;
  steps: string[];
  /** What answers before the receptionist can: voicemail, an answering machine. */
  warn: string;
  off: string;
  /** Forwarding's own words for a code the carrier refuses (forwarding.ts notes), behind "The code didn't work". */
  help: { label: string; notes: string[] };
  /** Back to the questions, to save the answers again; null where the saved forwarding has no number to ask about. */
  change: string | null;
  /** Said once a call proved it: Setup's keep row's own sentence. */
  verified: string | null;
  /**
   * An office phone system (canvas V6, decision 3): a person at Chanlytics offered to set it up with the owner on a
   * call, and, once asked, when; null for a phone with a code.
   */
  withMe: { sentence: string; label: string; asked: string | null } | null;
}

export interface FirstRunPhoneWayVM {
  key: PhoneWay;
  title: string;
  sentence: string;
  /** The way most businesses take, marked on its card. */
  recommended: string | null;
}

export interface FirstRunPhoneVM {
  stage: FirstRunPhoneStage;
  heading: string;
  lead: string;
  way: PhoneWay;
  ways: FirstRunPhoneWayVM[];
  /** The number to keep or move, E.164: the one typed, else the listing's; null for neither. */
  number: string | null;
  /** The listing's number, E.164; null for none. */
  listed: string | null;
  /** What the number box shows before the owner types in it: the listing's number, as the app writes one; "" for none. */
  box: string;
  /**
   * What is wrong with what the owner typed in the number box, said on the box itself (the button's `held` says it
   * too): something typed that is not a US number with its area code. Null before anything is typed, and in every
   * stage but choosing.
   */
  boxProblem?: string | null;
  /** The area code a number is bought in: the kept or moved number's, else the listing's; null for neither. */
  area: string | null;
  /**
   * The plan the number starts, where it has not started yet: its price and what it means. A number costs Chanlytics
   * $1.15 a month for as long as it is held, so it is never on a free trial (maySpend): the step's checkout takes no
   * trial, and a workspace already on one starts its plan here.
   */
  plan: { offer: string; note: string } | null;
  /**
   * The step's one coral button, `held` with why it cannot go yet, and what it does: start the plan (by checkout, or
   * early from a free trial), buy the number,
   * save the forwarding (the answers' code), or go on to Try it.
   */
  cta: { label: string; held: string | null; act: "plan" | "startNow" | "buy" | "forward" | "onward" } | null;
  /** The two questions, for a number kept or moved, from the moment the number is on its way. */
  questions: { rings: FirstRunPhoneQuestion<PhoneRings>; company: FirstRunPhoneQuestion<PhoneCompany> | null } | null;
  /** The code to dial, once the forwarding is saved. */
  code: FirstRunPhoneCodeVM | null;
  /**
   * The number the answers are saved for, E.164: the one kept or moved, or, asked again after the code was shown, the
   * number the saved forwarding is for (never the listing's in its place); null where nothing is asked.
   */
  forwardFrom: string | null;
  /** Asked again after the code was shown: the carrier saved then, so the same answers save nothing. */
  saved: { carrier: Carrier } | null;
  /** Asked again: the way back to the code without saving. */
  keepCode: string | null;
  /** What is happening, while the number is on its way: the state (a pill, its word) and the sentence under it. */
  status: { state: SetupState; words: string; sentence: string; detail: string } | null;
}

export const FIRST_RUN_PHONE_WORDS = {
  chooseHeading: "How should calls reach your receptionist?",
  chooseLead:
    "Most businesses keep the number customers already know. Your team still answers first, and your receptionist gets the rest.",
  readyHeading: "Getting your receptionist's number ready",
  readyLeadForwarded: "Customers never see this number: the calls nobody picks up at yours are sent to it.",
  readyLeadNew: "Customers call this number directly. Put it on your website and your Google listing.",
  recommended: "Recommended",
  keepTitle: (display: string | null) => (display ? `Keep ${display}` : "Keep the number you have"),
  keepListed:
    "The number on your Google listing. Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  keepTyped: "Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  newTitle: "Get a new number",
  newSentence: "For a business that doesn't have one yet. Customers call it directly.",
  moveTitle: "Move my number to Chanlytics",
  moveSentence: "Takes 7–14 business days. Your number forwards in the meantime, so nothing changes for customers.",
  numberLabel: "The number customers call",
  numberPlaceholder: "(305) 555-0100",
  areaLabel: "Area code",
  areaPlaceholder: "305",
  find: "Find numbers",
  finding: "Looking…",
  pickLabel: "Pick your receptionist's number",
  noneFree: (area: string) => `Nothing free in ${area} right now. Try a nearby area code.`,
  threeDigits: "Three digits, like 305.",
  local: "Local",
  held: {
    number: "Type the number customers call.",
    us: "Forwarding works for a US number: type it with its area code.",
    pick: "Pick a number first.",
  },
  cta: {
    planKeep: "Start my plan",
    planNew: (number: string | null) => (number ? `Start my plan with ${number}` : "Start my plan"),
    planMove: "Start my plan and ask for the move",
    keep: "Keep this number",
    new: (number: string | null) => (number ? `Get ${number}` : "Get this number"),
    move: "Ask for the move",
  },
  planOffer: (price: string) => (price ? `${price}, starting today` : "Your plan, starting today"),
  planNote: "Your number is included. The first charge is today, and you can cancel anytime from Billing.",
  /** A workspace on a free trial: the trial covers no number, so getting one starts the plan early. */
  planNoteTrial: "Your free trial ends today and your plan starts, on the card you gave. Your number is included.",
  starting: "Starting your plan…",
  startingDetail: "Your card is on file. This page updates as Stripe confirms it.",
  buyingIn: (area: string | null) =>
    area ? `Getting your receptionist's number in ${area}…` : "Getting your receptionist's number…",
  buyingNew: (number: string) => `Getting ${number}…`,
  usually: "Usually a minute or two; this page updates by itself",
  /** What the page says when a buy or a search is refused, over the door's own sentence. */
  notBought: "No number yet",
  moveAsked: "We'll move your number with you and reach you by email. Until then, it forwards.",
  moveNotAsked: "The move wasn't asked for. Ask again from Settings later; your number forwards meanwhile.",
  cancelled: CHECKOUT_OUTCOME_WORDS.cancel,
  /** The two questions while the number is on its way (canvas R4), and the button they lead to. */
  ringsLabel: (display: string | null) =>
    display ? `Which phone rings when customers call ${display}?` : "Which phone rings when customers call?",
  rings: { mobile: "A mobile", landline: "A landline", office: "An office phone system" } as Record<PhoneRings, string>,
  companyLabel: "Who's the phone company?",
  company: { verizon: "Verizon", att: "AT&T", tmobile: "T-Mobile", other: "Another company" } as Record<
    PhoneCompany,
    string
  >,
  show: "Show me what to dial",
  showOffice: "Show me where to forward",
  readySoon: "Ready in a moment",
  answerFirst: "Answer the questions first.",
  askHeading: "One more thing",
  askLead: "How the calls are sent to your receptionist depends on the phone that rings.",
  /** The code (canvas R5, P5). */
  codeHeading: "Dial this on the phone customers call",
  codeLead:
    "It tells your phone company to send the calls nobody picks up to your receptionist. You only do this once.",
  codeLeadAll: "It tells your phone company to send every call to your receptionist. You only do this once.",
  codeLabel: (company: string | null, rings: PhoneRings) =>
    rings === "landline" ? "A landline" : company ? `${company} · a mobile` : "A mobile",
  stepsLandline: ["Pick up the phone customers call.", "Dial the code above.", "Wait for the tone, then hang up."],
  stepsMobile: ["On the phone customers call, dial the code above.", "Wait for the tone, then hang up."],
  /** A tab that lost the answers: what rings is not known, so neither is said. */
  stepsAny: ["Dial the code above on the phone customers call.", "Wait for the tone, then hang up."],
  // Not a promise the code replaces voicemail: forwarding.ts says a voicemail that picks up first keeps calls away.
  warnMobile:
    "Voicemail on this phone? If it still picks up after you dial the code, calls never reach your receptionist: see The code didn't work.",
  warnLandline:
    "If an answering machine is on this line, turn it off. Otherwise it answers before your receptionist can.",
  warnAny:
    "Voicemail or an answering machine on that phone? If it picks up first, calls never reach your receptionist: see The code didn't work.",
  off: (code: string) => `To switch it off later, dial ${code}.`,
  tap: "Tap to dial",
  done: "Done, let's try it",
  help: "The code didn't work",
  change: "Change the answers",
  keepCode: "Keep what I have",
  /** An office phone system (canvas V6): the number to forward to, and a person to do it with. */
  officeHeading: "Forward missed calls in your phone system",
  officeLead: "Office phone systems set this in their own settings, under “forwarding” or “when no one answers”.",
  officeLabel: (always: boolean) => (always ? "Forward every call to" : "Forward unanswered calls to"),
  officeSteps: [
    "Open your phone system's settings.",
    "Find forwarding, or what happens when no one answers.",
    "Forward the calls to the number above: your receptionist's number. Customers never see it.",
  ],
  officeWarn: "Voicemail in the system? The forwarding has to come before it, or calls never reach your receptionist.",
  officeOff: "To switch it off later, take the forwarding out in the same settings.",
  withMe: "Not sure where it is? A person at Chanlytics can do it with you on a call.",
  withMeLabel: "Do it with me",
  helpOffice: "It didn't work",
  withMeAsked: (ago: string) => `Asked ${ago}: a person at Chanlytics will email you to find a time.`,
  withMeFailed: "Not asked",
  withMeSent: "We'll email you to find a time for a call.",
  notForwarded: "Forwarding not saved",
} as const;

/** The three digits a US number is bought in: `+13055550100` → `305`; null for anything else. */
export function areaCodeOf(raw: string | null | undefined): string | null {
  const e164 = normalizePhone(raw);
  return e164 && /^\+1\d{10}$/.test(e164) ? e164.slice(2, 5) : null;
}

export interface FirstRunPhoneInput {
  dto: SetupDto;
  vm: SetupVM;
  /** The owner's choice as the tab keeps it; null before one is made (the way then shown is the first). */
  choice: PhoneChoice | null;
  /** This tab came back from checkout with a card given, and the plan has not landed yet. */
  returned: boolean;
  nowMs: number;
}

export function firstRunPhoneOf({ dto, vm, choice, returned, nowMs }: FirstRunPhoneInput): FirstRunPhoneVM {
  const W = FIRST_RUN_PHONE_WORDS;
  const way: PhoneWay = choice?.way ?? "keep";
  const forwarded = way !== "new";
  const listed = normalizePhone(dto.google?.phone ?? null);
  const typed = normalizePhone(choice?.number ?? null);
  // The box starts from the listing's number; what the owner typed replaces it, and an emptied box is none.
  const number = choice && choice.number !== null ? typed : listed;
  const area = areaCodeOf(forwarded ? number : null) ?? areaCodeOf(listed);
  const billing = dto.billing;
  const lines = dto.lines;
  const ownLine = lines?.rows.find((l) => l.voice_state !== "none") ?? null;
  const lineRow = vm.rows.find((r) => r.id === "line") ?? null;
  const canSpend = !billing || maySpend(billing.mode, billing.status);
  const pick = choice?.pick ?? null;
  const picked = pick ? formatPhoneDisplay(pick.e164) : null;
  const waiting = (sentence: string, detail: string) => ({
    state: "waiting_them" as const,
    words: SETUP_STATE_WORDS.waiting_them,
    sentence,
    detail,
  });

  const base = {
    way,
    ways: [
      {
        key: "keep" as const,
        title: W.keepTitle(formatPhoneDisplay(number)),
        sentence: number && number === listed ? W.keepListed : W.keepTyped,
        recommended: W.recommended,
      },
      { key: "new" as const, title: W.newTitle, sentence: W.newSentence, recommended: null },
      { key: "move" as const, title: W.moveTitle, sentence: W.moveSentence, recommended: null },
    ],
    number,
    listed,
    box: formatPhoneDisplay(listed) ?? "",
    area,
  };
  // Who sees the number depends on the way chosen; a tab that lost the choice says neither.
  const ready = {
    heading: W.readyHeading,
    lead: !choice ? "" : forwarded ? W.readyLeadForwarded : W.readyLeadNew,
    plan: null,
    cta: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null,
  };
  const rows: FirstRunPhoneVM = { ...base, ...ready, stage: "rows", status: null };

  // The two questions, for a number kept or moved (a choice this tab holds, with a number to forward from).
  const rings = choice?.rings ?? null;
  const company = choice?.company ?? null;
  const asking = !!choice && forwarded && !!number;
  const questionsFor = (about: string): NonNullable<FirstRunPhoneVM["questions"]> => ({
    rings: {
      label: W.ringsLabel(formatPhoneDisplay(about)),
      options: PHONE_RINGS.map((k) => ({ key: k, label: W.rings[k] })),
      value: rings,
    },
    // A landline takes the landline codes whoever runs it, so only a mobile is asked its company.
    company:
      rings === "mobile"
        ? {
            label: W.companyLabel,
            options: (["verizon", "att", "tmobile", "other"] as const).map((k) => ({
              key: k,
              label: W.company[k],
            })),
            value: company,
          }
        : null,
  });
  const questions = asking && number ? questionsFor(number) : null;
  const answered = !!forwardingCarrierOf(rings, company);
  const show = (lineAnswers: boolean) => ({
    label: rings === "office" ? W.showOffice : W.show,
    held: !lineAnswers ? W.readySoon : answered ? null : W.answerFirst,
    act: "forward" as const,
  });

  // A line that answers: the code, once the forwarding is saved; the questions, while a number kept or moved has none
  // yet (or the owner asked to change the answers); Setup's rows otherwise. One switched off is the rows' to say.
  if (dto.channels.voice.present) {
    const dest = dto.channels.voice.active ? dto.channels.voice.number : null;
    const fw = lines?.rows.find((l) => l.kind === "forwarded") ?? null;
    const f = fw?.forwarding ?? null;
    const saved =
      !!fw &&
      !!f &&
      isCarrier(f.carrier) &&
      (fw.forwarding_state === "instructed" || fw.forwarding_state === "verified");
    if (!dest) return rows;
    const savedFrom = saved ? normalizePhone(fw!.e164) : null;
    // Asked again after the code was shown: about the number the saved forwarding is for, whatever the tab holds.
    if (saved && choice?.redo && savedFrom) {
      return {
        ...base,
        stage: "ask",
        heading: W.askHeading,
        lead: W.askLead,
        plan: null,
        status: null,
        questions: questionsFor(savedFrom),
        cta: show(true),
        code: null,
        forwardFrom: savedFrom,
        saved: { carrier: f!.carrier as Carrier },
        keepCode: W.keepCode,
      };
    }
    if (saved && f!.carrier === "office") {
      const mode = isForwardingMode(f!.mode) ? f!.mode : "unanswered";
      const codes = forwardingCodes("office", mode, f!.destination_e164 ?? dest);
      const keepRow = vm.rows.find((r) => r.id === "keep") ?? null;
      // One ask a day (setup_request): an ask older than that is offered again, in case it reached nobody.
      const askedAt = dto.requests.forwarding ? Date.parse(dto.requests.forwarding) : NaN;
      const asked = !Number.isNaN(askedAt) && nowMs - askedAt < 86_400_000 ? askedAt : null;
      return {
        ...base,
        stage: "code",
        heading: W.officeHeading,
        lead: W.officeLead,
        plan: null,
        status: null,
        questions: null,
        cta: { label: W.done, held: null, act: "onward" },
        code: {
          label: W.officeLabel(mode === "always"),
          dial: formatPhoneDisplay(f!.destination_e164 ?? dest) ?? dest,
          tel: codes.on.tel,
          tap: null,
          steps: [...W.officeSteps],
          warn: W.officeWarn,
          off: W.officeOff,
          help: { label: W.helpOffice, notes: codes.notes },
          change: savedFrom ? W.change : null,
          verified: fw!.forwarding_state === "verified" && keepRow ? keepRow.sentence : null,
          withMe: {
            sentence: W.withMe,
            label: W.withMeLabel,
            asked: asked !== null ? W.withMeAsked(agoWords(asked, nowMs)) : null,
          },
        },
        forwardFrom: null,
        saved: null,
        keepCode: null,
      };
    }
    if (saved) {
      // Not an office phone system (drawn above): a company with its codes.
      const carrier = f!.carrier as PhoneCompany;
      // The mode saved, which Setup's own card may have set to every call: the code and the lead follow it.
      const mode = isForwardingMode(f!.mode) ? f!.mode : "unanswered";
      const codes = forwardingCodes(carrier, mode, f!.destination_e164 ?? dest);
      // What rings, as answered; a tab that lost the answers says neither (a mobile with another company is `other` too).
      // An office answer the saved forwarding does not bear out (another tab changed it) is not said either.
      const said = rings === "office" ? null : rings;
      const keepRow = vm.rows.find((r) => r.id === "keep") ?? null;
      return {
        ...base,
        stage: "code",
        heading: W.codeHeading,
        lead: mode === "always" ? W.codeLeadAll : W.codeLead,
        plan: null,
        status: null,
        questions: null,
        cta: { label: W.done, held: null, act: "onward" },
        code: {
          label: said
            ? W.codeLabel(said === "mobile" && carrier !== "other" ? W.company[carrier] : null, said)
            : CARRIER_WORDS[carrier],
          dial: codes.on.code,
          tel: codes.on.tel,
          tap: said === "mobile" ? W.tap : null,
          steps: said === "mobile" ? [...W.stepsMobile] : said === "landline" ? [...W.stepsLandline] : [...W.stepsAny],
          warn: said === "mobile" ? W.warnMobile : said === "landline" ? W.warnLandline : W.warnAny,
          off: W.off(codes.off.code),
          help: { label: W.help, notes: codes.notes },
          change: savedFrom ? W.change : null,
          verified: fw!.forwarding_state === "verified" && keepRow ? keepRow.sentence : null,
          withMe: null,
        },
        forwardFrom: null,
        saved: null,
        keepCode: null,
      };
    }
    if (questions) {
      return {
        ...base,
        stage: "ask",
        heading: W.askHeading,
        lead: W.askLead,
        plan: null,
        status: null,
        questions,
        cta: show(true),
        code: null,
        forwardFrom: number,
        saved: null,
        keepCode: null,
      };
    }
    return rows;
  }
  if (ownLine) {
    // On its way: the line row's own words (canvas R4, "the step words are Setup's own"). Stopped: the row's Retry.
    const onItsWay =
      (ownLine.voice_state === "provisioning" && !lineStuckProvisioning(ownLine, nowMs)) ||
      ownLine.voice_state === "answering";
    return onItsWay && lineRow
      ? {
          ...base,
          ...ready,
          stage: "getting",
          status: {
            state: lineRow.state,
            words: lineRow.stateWords,
            sentence: lineRow.sentence,
            detail: lineRow.details[0] ?? "",
          },
          questions,
          cta: questions ? show(false) : null,
        }
      : rows;
  }
  // No provider here, or a person was asked for a line: the row says who has it.
  if (!lines?.ready || dto.requests.line || dto.requests.port) return rows;

  // The plan the number starts: none yet (the step's checkout, which takes no trial), or a free trial (its plan starts
  // early, here). Anything else that cannot spend (a failed card, a subscription that ended) is Billing's, on the row.
  const onTrial = billingDoorOpen(billing) && billing.status === "trialing";
  const plan =
    billingDoorOpen(billing) && (billing.status === "none" || onTrial)
      ? {
          offer: W.planOffer(priceWords(billing.price ?? null)),
          note: onTrial ? W.planNoteTrial : W.planNote,
        }
      : null;
  if (!canSpend && !plan) return rows;
  if (plan && returned) {
    return {
      ...base,
      ...ready,
      stage: "starting",
      status: waiting(W.starting, W.startingDetail),
    };
  }
  // Pressed, and the workspace may spend: the page buys, once, and this is what it says meanwhile, with the questions
  // for a number kept or moved (canvas R4: the owner answers while the number gets ready).
  if (canSpend && choice?.pending) {
    return {
      ...base,
      ...ready,
      stage: "buying",
      status: waiting(way === "new" && picked ? W.buyingNew(picked) : W.buyingIn(forwarded ? area : null), W.usually),
      questions,
      cta: questions ? show(false) : null,
    };
  }
  // A number to keep or move is forwarded from, so it must be one a US phone company forwards: a US number with its
  // area code, which is also where the receptionist's own is bought.
  const typedSome = !!choice && typeof choice.number === "string" && choice.number.trim() !== "";
  const boxProblem = way !== "new" && typedSome && !(number && areaCodeOf(number)) ? W.held.us : null;
  const held =
    way === "new"
      ? pick
        ? null
        : W.held.pick
      : (boxProblem ?? (!number ? W.held.number : areaCodeOf(number) ? null : W.held.us));
  const label = plan
    ? way === "keep"
      ? W.cta.planKeep
      : way === "new"
        ? W.cta.planNew(picked)
        : W.cta.planMove
    : way === "keep"
      ? W.cta.keep
      : way === "new"
        ? W.cta.new(picked)
        : W.cta.move;
  return {
    ...base,
    stage: "choose",
    heading: W.chooseHeading,
    lead: W.chooseLead,
    plan,
    boxProblem,
    cta: { label, held, act: plan ? (onTrial ? "startNow" : "plan") : "buy" },
    status: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null,
  };
}
