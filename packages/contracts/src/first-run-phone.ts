/**
 * The first run's phone step (docs/superpowers/plans/2026-09-24-first-run-4-phone.md, canvas R3–R5, V4, V5): how calls
 * reach the receptionist, the trial with the plan's own price, and the receptionist's number on its way. Every sentence
 * is here; the page composes (first-run.jsx FrPhone).
 *
 * Every way buys the receptionist a number of its own. Customers call a new one directly; a number kept or being moved
 * forwards the calls nobody picks up to it (line_forwarding_set needs a line that answers), so customers never see it.
 *
 * Nothing here is stored. The owner's choice is the tab's (the page keeps it across Stripe's round trip), and everything
 * else is Setup's: a case this step does not draw -- no line provider, a line that stopped, billing that needs Billing,
 * a line a person was asked for, a line that answers -- is `rows`, where Setup's own rows say it as they always have.
 */
import { billingDoorOpen, dayWords, maySpend, priceWords, CHECKOUT_OUTCOME_WORDS } from "./billing";
import { formatPhoneDisplay, normalizePhone } from "./phone";
import { lineStuckProvisioning, type SetupDto, type SetupVM } from "./setup";

export const PHONE_WAYS = ["keep", "new", "move"] as const;
export type PhoneWay = (typeof PHONE_WAYS)[number];

/** A number offered to buy, as the search route answers it. */
export interface PhonePick {
  e164: string;
  friendly: string;
}

/**
 * What the owner chose, as the tab keeps it: the way, the number they keep or move (as typed), the new number picked,
 * and whether they pressed the step's button, so the buy goes on once the trial lets it.
 */
export interface PhoneChoice {
  way: PhoneWay;
  number: string | null;
  pick: PhonePick | null;
  pending: boolean;
}

export type FirstRunPhoneStage = "choose" | "starting" | "buying" | "getting" | "rows";

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
  /** The listing's number, E.164, which the number box starts from; null for none. */
  listed: string | null;
  /** The area code a number is bought in: the kept or moved number's, else the listing's; null for neither. */
  area: string | null;
  /** The trial, where a card is still to be given: its offer and what it means. */
  trial: { offer: string; note: string } | null;
  /** The step's one coral button while choosing, `held` with why it cannot go yet. */
  cta: { label: string; held: string | null } | null;
  /** What is happening, while the number is on its way. */
  status: { sentence: string; detail: string } | null;
  /** The trial that started, said once it has; null before, and where the workspace does not pay by card. */
  started: string | null;
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
    pick: "Pick a number first.",
  },
  cta: {
    trialKeep: "Start my free trial",
    trialNew: (friendly: string | null) => (friendly ? `Start my trial with ${friendly}` : "Start my free trial"),
    trialMove: "Start my trial and ask for the move",
    keep: "Keep this number",
    new: (friendly: string | null) => (friendly ? `Get ${friendly}` : "Get this number"),
    move: "Ask for the move",
  },
  trialOffer: (days: number, price: string) =>
    days > 0 ? (price ? `${days} days free, then ${price}` : `${days} days free`) : price,
  trialNote: (day: string | null) =>
    day
      ? `We ask for a card now, and nothing is charged until ${day}. You can cancel anytime from Billing.`
      : "We ask for a card now, and the first charge is today. You can cancel anytime from Billing.",
  started: (day: string) => `Your trial has started. Nothing is charged until ${day}.`,
  starting: "Starting your trial…",
  buyingIn: (area: string | null) =>
    area ? `Getting your receptionist's number in ${area}…` : "Getting your receptionist's number…",
  buyingNew: (friendly: string) => `Getting ${friendly}…`,
  usually: "Usually a minute or two; this page updates by itself",
  /** What the page says when a buy or a search is refused, over the door's own sentence. */
  notBought: "No number yet",
  moveAsked: "We'll move your number with you and reach you by email. Until then, it forwards.",
  moveNotAsked: "The move wasn't asked for. Ask again from Settings later; your number forwards meanwhile.",
  cancelled: CHECKOUT_OUTCOME_WORDS.cancel,
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
  /** This tab came back from checkout with a card given, and the trial has not landed yet. */
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
  const trialing = billing && billing.mode === "stripe" && billing.status === "trialing" ? billing : null;
  const started = trialing && trialing.trial_end ? W.started(dayWords(trialing.trial_end)) : null;

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
    area,
    started,
  };
  const ready = {
    heading: W.readyHeading,
    lead: forwarded ? W.readyLeadForwarded : W.readyLeadNew,
    trial: null,
    cta: null,
  };
  const rows: FirstRunPhoneVM = { ...base, ...ready, stage: "rows", status: null };

  // A line that answers, or one switched off: Setup's rows say it, and the step is done or asks Connections.
  if (dto.channels.voice.present) return rows;
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
          status: { sentence: lineRow.sentence, detail: lineRow.details[0] ?? "" },
        }
      : rows;
  }
  // No provider here, or a person was asked for a line: the row says who has it.
  if (!lines?.ready || dto.requests.line || dto.requests.port) return rows;

  const trial =
    billingDoorOpen(billing) && billing.status === "none"
      ? (() => {
          const days = billing.trial_days;
          const end = days > 0 ? dayWords(new Date(nowMs + days * 86_400_000).toISOString()) : null;
          return { offer: W.trialOffer(days, priceWords(billing.price ?? null)), note: W.trialNote(end) };
        })()
      : null;
  if (!canSpend && !trial) return rows;
  if (trial && returned) {
    return {
      ...base,
      ...ready,
      stage: "starting",
      status: { sentence: W.starting, detail: CHECKOUT_OUTCOME_WORDS.success },
    };
  }
  // Pressed, and the workspace may spend: the page buys, once, and this is what it says meanwhile.
  if (canSpend && choice?.pending) {
    return {
      ...base,
      ...ready,
      stage: "buying",
      status: {
        sentence:
          way === "new" && choice.pick ? W.buyingNew(choice.pick.friendly) : W.buyingIn(forwarded ? area : null),
        detail: W.usually,
      },
    };
  }
  const pick = choice?.pick ?? null;
  const held = way === "new" ? (pick ? null : W.held.pick) : number ? null : W.held.number;
  const label = trial
    ? way === "keep"
      ? W.cta.trialKeep
      : way === "new"
        ? W.cta.trialNew(pick?.friendly ?? null)
        : W.cta.trialMove
    : way === "keep"
      ? W.cta.keep
      : way === "new"
        ? W.cta.new(pick?.friendly ?? null)
        : W.cta.move;
  return {
    ...base,
    stage: "choose",
    heading: W.chooseHeading,
    lead: W.chooseLead,
    trial,
    cta: { label, held },
    status: null,
  };
}
