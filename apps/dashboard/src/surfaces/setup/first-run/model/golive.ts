/**
 * Go live (decision 0073, canvas 5A–5C): the first run's last step, where everything chosen at Where it answers starts.
 *
 * - **Pay** (5A): what starts and what it costs, and the card in the page (R16), or a trial's plan started now, or, for
 *   a workspace that already pays, the press alone. The trial is trialDaysFor's, said as it is (decision 0090).
 * - **Switch it on** (5B): one list that fills itself in: the plan, the receptionist's number on its way, the code that
 *   forwards the number kept and the owner's own call that proves it (first-run-phone.ts and first-run-try.ts draw those
 *   two), WhatsApp's approval, the booking-link message with Meta, and what came in. Two rows need the owner's hands; both
 *   can wait, and Today keeps the same list (first-run-card.ts).
 * - **Live** (5C): what answers now, and Ask's first three moves, each waiting for the owner's yes.
 *
 * Every sentence is here; the page composes.
 */
import {
  formatPhoneDisplay,
  billingDoorOpen,
  billingDayWords,
  priceWords,
  trialDaysFor,
  GET_YES_ROUTE,
  newSequenceRoute,
  forwardedLineOf,
  type SetupDto,
  type SetupVM,
  type WhatsappChoice,
  importLinesOf,
  whatsappPartsOf,
  type WhatsappPartVM,
} from "@chanlytics/contracts";
import type { FirstRunPhoneVM } from "@chanlytics/contracts";

export const FIRST_RUN_GOLIVE_WORDS = {
  lead: (n: number) =>
    n
      ? `Everything you chose starts at once. ${n === 1 ? "One thing needs" : `${n === 2 ? "Two" : "Three"} things need`} you for a minute after.`
      : "Everything you chose starts at once.",
  starts: {
    calls: (kept: string | null, always: boolean, own: string | null) =>
      kept
        ? `Calls to ${kept} ${always ? "· every one" : "nobody picks up"}`
        : own
          ? `Calls to its own number, ${own}`
          : "Calls to its own number",
    callsAfter: (kept: boolean) => (kept ? "one code, then one call" : "about a minute"),
    whatsappSame: "WhatsApp on the same number, keeping the app",
    whatsappOwn: "WhatsApp on its own number",
    whatsappAfter: "approve on your phone, after",
    bookings: (tool: string | null) => (tool ? `Bookings from your ${tool} calendar` : "Bookings from your calendar"),
    bookingsAfter: "nothing to do",
    email: (address: string) => `Email at ${address}`,
    emailAfter: "connected",
  },
  price: (price: string) => price,
  trial: (days: number) => (days ? `${days} days free` : "Charged today"),
  note: (days: number, firstCharge: string | null) =>
    days
      ? `Its number, calls and WhatsApp included. First charge on ${firstCharge ?? `day ${days + 1}`}. Cancel anytime from Billing.`
      : "Its number, calls and WhatsApp included. Cancel anytime from Billing.",
  afterTitle: "After you press",
  after: {
    number: "Its number is bought for you",
    template: "Your booking-link message goes to Meta for approval · minutes to a day",
    hands: (code: boolean, wa: boolean) =>
      `Then on your phone: ${[code ? "dial one code" : null, code ? "call your number once" : null, wa ? "approve WhatsApp" : null].filter(Boolean).join(", ")}`,
  },
  card: "Your card",
  /** Stripe's checkout could not be mounted in the page (Stripe.js refused, or blocked). */
  checkoutFailed: "Stripe's checkout couldn't open here. Try again in a moment; nothing was charged.",
  secured: (days: number) => (days ? "Nothing is charged today · secured by Stripe" : "Secured by Stripe"),
  confirming: "Confirming with your bank…",
  confirmingLead: "Some banks ask you to approve in their app. This page moves on by itself.",
  confirmingFoot: "Usually a few seconds",
  noProvider: {
    heading: "We set up your line with you",
    lead: "Phone lines aren't automatic here yet. A person at Chanlytics sets yours up and writes to you within a day.",
    /** What goes live now without the line, of what is connected: WhatsApp's number, a mailbox's mail; null for none. */
    now: (whatsapp: boolean, email: boolean): string | null =>
      whatsapp && email
        ? "WhatsApp goes live now; emails keep coming to the Inbox"
        : whatsapp
          ? "WhatsApp goes live now"
          : email
            ? "Emails keep coming to the Inbox"
            : null,
    calls: "Calls, once your line is ready",
    ask: "Ask for my line",
    without: "Go live without calls",
  },
  switchOn: {
    heading: "Everything is connecting",
    lead: "Stay and watch, or leave: it keeps going, and Today shows this same list.",
    plan: (price: string | null, firstCharge: string | null, days: number) =>
      `Plan started${price ? ` · ${price}` : ""}${days ? `, ${days} days free` : ""}${firstCharge ? ` · first charge ${firstCharge}` : ""}`,
    planSub: "Paid here, with Stripe",
    number: (n: string) => `Its number · ${n}`,
    /** Before its number is known (bought in the area code of the number kept): the row's name alone. */
    numberUnknown: "Its number",
    numberReady: "Bought",
    numberComing: "On its way",
    forward: (kept: string, carrier: string | null) =>
      `Send missed calls to it · on ${kept}${carrier ? `, ${carrier}` : ""}`,
    forwardAll: (kept: string, carrier: string | null) =>
      `Send every call to it · on ${kept}${carrier ? `, ${carrier}` : ""}`,
    check: (kept: string) =>
      `Then call ${kept} from any other phone and let it ring. When it answers, forwarding is proved.`,
    checkOwn: (own: string) => `Call ${own} once from your cell. When it answers, it's live.`,
    later: "Do it later",
    checkLine: "Check my line",
    proved: "Forwarding works",
    answered: "It answered",
    whatsapp: "WhatsApp · approve the connection in WhatsApp Business on that phone",
    whatsappOwn: "WhatsApp · connect it on its own number",
    whatsappGo: "Connect WhatsApp",
    /** Meta's own steps for keeping the WhatsApp Business app (canvas 5B·g), said before its window opens (R12, R21). */
    keepApp: "Connect WhatsApp, keep the app",
    keepAppSteps: (n: string | null) => [
      `In Meta's window, ${n ?? "your number"} is filled in. Copy the code it shows.`,
      "In WhatsApp Business, open the message from Facebook Business and tap Connect.",
      "When the app asks to share your chat history, say yes: your one-to-one chats of the last 6 months come into Inbox. Group chats stay in the app.",
      "Paste the code in Meta's window. Done.",
    ],
    keepAppAfter:
      "You keep using the app. Your receptionist answers what you don't; your replies from the app show in Inbox too, and your WhatsApp contacts come into People.",
    ifNot: "If you'd rather not share your chats",
    ifNotSays: [
      "WhatsApp still connects, and you keep the app.",
      "Every chat from now on comes into Inbox, and your receptionist answers what you don't.",
      "Your older chats stay only in the app. Meta offers the history once, while the number connects; to bring it later, WhatsApp has to be connected again from Settings.",
    ],
    openMeta: "Open Meta's window",
    skipWhatsapp: "Skip WhatsApp for now",
    template: "Your booking-link message · Meta is reviewing it · until then it takes a caller's details",
    templateOk: "Your booking-link message · approved",
    needsYou: "Needs you",
    open: "Open Today, it keeps going",
    askTitle: (name: string | null) => `Getting ${name ?? "your receptionist"} ready`,
    askDone: (done: number, of: number) => `${done} of ${of} done`,
    answersTitle: (name: string | null) => `${name ?? "It"} answers`,
    answers: {
      email: "Waits for you in the Inbox",
      whatsapp: "Once you approve",
      whatsappOn: "On",
      calls: "Once your line is proved",
      callsOn: "On",
    },
  },
  live: {
    since: (time: string) => `Answering since ${time}`,
    channels: (parts: string[]) => parts.join(" · "),
    callsKept: (kept: string, always: boolean) =>
      always ? `Every call to ${kept}` : `Calls to ${kept} nobody picks up`,
    callsOwn: (own: string) => `Calls to ${own}`,
    whatsappSame: "WhatsApp on the same number",
    whatsappOn: (n: string) => `WhatsApp on ${n}`,
    email: "your emails in the Inbox",
    movesTitle: "Ask's first three moves",
    movesLead: "Drafted from what's connected; each waits for your yes",
    yes: {
      title: "Ask your customers for their yes",
      says: (yes: number, of: number | null) =>
        `A sign-up QR for the desk, and it asks once at the end of a chat · ${of ? `${yes} of ${of.toLocaleString()} said yes` : `${yes} said yes`}`,
      act: "Get the QR",
    },
    remind: {
      title: "Remind each customer the day before",
      says: "By email to those with an address, by WhatsApp to those who say yes",
      act: "Turn on",
    },
    winBack: {
      title: "Win back the ones you haven't seen in a while, by email",
      says: "To those with an address who have been in before · WhatsApp offers don't reach US numbers",
      act: "See the draft",
    },
    brief: "Hear your first brief",
    briefSays: "Ask, in its own voice · 15 seconds",
    team: "Invite your team",
    /** Where the two quiet presses go: Team, and Today, where Ask's brief is heard. */
    teamTo: "admin/team",
    briefTo: "today",
    whatsappWaiting: "WhatsApp · Meta is approving",
    whatsappWaitingSays:
      "Usually a few minutes, sometimes a day. Nothing to do: it switches on by itself, and your chat history comes in with it.",
    whatsappLater: "WhatsApp · later",
    whatsappLaterSays:
      "Without WhatsApp it can't send a caller your booking link: it takes their details for you, or points them to your website. Connect any time from Today; your last six months of chats come in then.",
    whatsappConnect: "Connect WhatsApp now",
    /** Chosen at Where it answers and not connected yet: everything else answers, and WhatsApp joins once approved. */
    whatsappConnectSays:
      "Calls and email answer now. WhatsApp joins once you approve it on your phone; Today keeps this until then.",
  },
} as const;

/** What starts at Go live, a row each (canvas 5A): what it is, and what it asks of the owner after. */
export interface GoLiveStartVM {
  key: "calls" | "whatsapp" | "bookings" | "email";
  label: string;
  after: string;
}

/** One row of Switch it on (canvas 5B). */
export interface GoLiveItemVM {
  key: "plan" | "number" | "forward" | "whatsapp" | "template" | "imports";
  /** `stopped`: what came in stopped, and there is nothing to press here (Meta offers the kept app's history once). */
  state: "done" | "needs" | "waiting" | "later" | "stopped";
  label: string;
  sub: string | null;
  /** The kept app's chats in Meta's three parts (canvas 5B·i), under WhatsApp's line of what came in. */
  parts?: WhatsappPartVM[];
}

export interface FirstRunGoLiveVM {
  stage: "pay" | "confirming" | "switch" | "live" | "noProvider";
  /** 5A: what starts, the price, the trial as it is, and what happens after the press. */
  pay: {
    starts: GoLiveStartVM[];
    price: string | null;
    trial: string;
    note: string;
    after: string[];
    secured: string;
  } | null;
  /** 5B: the list, and Ask's count beside it. */
  switchOn: {
    /** The plan, started: null where none runs by card (a direct arrangement, or a card that did not pay: Billing's row says it). */
    plan: string | null;
    items: GoLiveItemVM[];
    /** The rows that need the owner's hands: the code and the call, WhatsApp. */
    needs: number;
    done: number;
    of: number;
    answers: { key: "email" | "whatsapp" | "calls"; label: string; value: string }[];
  } | null;
  /** 5C: what answers now, Ask's three moves, and what is still connecting. */
  live: {
    since: string | null;
    channels: string;
    moves: { key: "yes" | "remind" | "winBack"; title: string; says: string; act: string; to: string }[];
    /**
     * What is still connecting or left for later, said once each. `act`, the press beside it: Meta's window for WhatsApp
     * chosen and not connected (`connect`, its steps drawn in place), Where it answers for WhatsApp left for later
     * (`choose`, with its label); null for nothing to press. Calls switched off never reach here: Go live is not done
     * while they are, and Switch it on says it in Setup's own line row.
     */
    notes: {
      key: "whatsapp_waiting" | "whatsapp_connect" | "whatsapp_later";
      title: string;
      says: string;
      act: { kind: "connect" | "choose"; label: string } | null;
    }[];
  } | null;
  /** 5A·d, no line provider here: what goes live now without the line (connected WhatsApp, a mailbox), null for none. */
  noProvider: { now: string | null } | null;
  /** How many things need the owner after the press, for the head's lead. */
  hands: number;
  /**
   * Setup's own rows for what Switch it on cannot do itself, by id, drawn above its list with their verbs: the line
   * stopped part-way (its Retry), a card that did not pay (Billing's). Empty for none.
   */
  rows: string[];
}

export interface GoLiveInput {
  dto: SetupDto;
  vm: SetupVM;
  /** Go live's phone, as first-run-phone.ts says it at `live`. */
  phone: FirstRunPhoneVM;
  /** Every step but this one is done: Go live is drawn. */
  complete: boolean;
  whatsapp: WhatsappChoice | null;
  /** The booking tool's name, where one was found. */
  toolName: string | null;
  /** The workspace's people, for the yes's count. */
  people: number | null;
  /** The workspace's clock, for "Answering since". */
  tz: string;
  nowMs: number;
}

/** When the receptionist started answering calls: the owner's activation, else the line's own change to answering. */
function answeringSince(dto: SetupDto): string | null {
  const act = (dto.activations ?? []).find((a) => a.capability === "voice" && !a.deactivated_at);
  if (act?.activated_at) return act.activated_at;
  const line = dto.lines?.rows.find((l) => l.voice_state === "answering");
  return line?.state_since ?? null;
}

/** "4:12 PM" in the workspace's clock. */
function timeWords(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** What every part of Go live reads of the choices and the workspace: the number kept and how, its own, WhatsApp. */
interface GoLiveFacts {
  kept: string | null;
  always: boolean;
  own: string | null;
  waOn: boolean;
  waChosen: boolean;
  /** How many things need the owner after the press: the forwarding code, WhatsApp's approval. */
  hands: number;
  price: string | null;
  firstCharge: string | null;
  /** Not by phone (decision 0091): no number, no forwarding and no call are part of going live. */
  noCalls: boolean;
}

function goLiveFactsOf(goLiveInput: GoLiveInput): GoLiveFacts {
  const { dto, vm } = goLiveInput;
  const want = vm.want;
  const kept = want && want.way !== "new" ? formatPhoneDisplay(want.number) : null;
  const waOn = dto.channels.whatsapp.present;
  const waChosen = goLiveInput.whatsapp === "same" || goLiveInput.whatsapp === "own";
  return {
    kept,
    always: want?.mode === "always",
    own: formatPhoneDisplay(dto.channels.voice.number ?? (want?.way === "new" ? want.number : null)),
    waOn,
    waChosen,
    hands: (kept ? 1 : 0) + (waChosen && !waOn ? 1 : 0),
    price: priceWords(dto.billing?.price ?? null) || null,
    firstCharge: dto.billing?.current_period_end
      ? billingDayWords(dto.billing.current_period_end, goLiveInput.tz)
      : null,
    noCalls: vm.noCalls,
  };
}

/** What starts at Go live, a row each (5A): calls, WhatsApp where chosen, bookings where read, email where connected. */
function startsOf(goLiveInput: GoLiveInput, goLiveFacts: GoLiveFacts): GoLiveStartVM[] {
  const starts = FIRST_RUN_GOLIVE_WORDS.starts;
  const mailbox = goLiveInput.dto.email?.sending?.mailboxes[0] ?? null;
  const out: GoLiveStartVM[] = goLiveFacts.noCalls
    ? []
    : [
        {
          key: "calls",
          label: starts.calls(goLiveFacts.kept, goLiveFacts.always, goLiveFacts.own),
          after: starts.callsAfter(!!goLiveFacts.kept),
        },
      ];
  if (goLiveFacts.waChosen)
    out.push({
      key: "whatsapp",
      label: goLiveInput.whatsapp === "same" ? starts.whatsappSame : starts.whatsappOwn,
      after: starts.whatsappAfter,
    });
  if (goLiveInput.dto.calendar.state === "ok")
    out.push({ key: "bookings", label: starts.bookings(goLiveInput.toolName), after: starts.bookingsAfter });
  if (mailbox) out.push({ key: "email", label: starts.email(mailbox.address), after: starts.emailAfter });
  return out;
}

/**
 * The trial Go live says: the checkout's own rule (contracts trialDaysFor), over the length the edge said for this
 * deployment, so the pane never promises a trial the checkout does not give. A workspace that had a plan before has
 * none.
 */
function goLiveTrialDays(billing: GoLiveInput["dto"]["billing"]): number {
  if (!billing) return 0;
  return trialDaysFor({ hadSubscription: billing.status !== "none", deploymentDays: billing.trial_days });
}

/** 5A: what starts, the price, the trial as it is, and what happens after the press. */
function payOf(goLiveInput: GoLiveInput, goLiveFacts: GoLiveFacts): NonNullable<FirstRunGoLiveVM["pay"]> {
  const words = FIRST_RUN_GOLIVE_WORDS;
  const days = goLiveTrialDays(goLiveInput.dto.billing);
  const after: string[] = goLiveFacts.noCalls ? [] : [words.after.number];
  if (goLiveFacts.waChosen) after.push(words.after.template);
  if (goLiveFacts.hands) after.push(words.after.hands(!!goLiveFacts.kept, goLiveFacts.waChosen && !goLiveFacts.waOn));
  return {
    starts: startsOf(goLiveInput, goLiveFacts),
    price: goLiveFacts.price,
    trial: words.trial(days),
    note: words.note(days, null),
    after,
    secured: words.secured(days),
  };
}

/** The forwarding row: a number kept, proved by its code; or the workspace's own, proved by a call that came in. */
function forwardItemOf(
  goLiveInput: GoLiveInput,
  goLiveFacts: GoLiveFacts,
  proof: { proved: boolean; tested: boolean },
): GoLiveItemVM | null {
  const switchOn = FIRST_RUN_GOLIVE_WORDS.switchOn;
  if (goLiveFacts.kept) {
    const later = goLiveInput.vm.rows.find((r) => r.id === "keep")?.later;
    return {
      key: "forward",
      state: proof.proved ? "done" : later ? "later" : "needs",
      label: goLiveFacts.always
        ? switchOn.forwardAll(goLiveFacts.kept, null)
        : switchOn.forward(goLiveFacts.kept, null),
      sub: proof.proved ? switchOn.proved : switchOn.check(goLiveFacts.kept),
    };
  }
  if (!goLiveFacts.own) return null;
  return {
    key: "forward",
    state: proof.tested ? "done" : goLiveInput.vm.trySkipped ? "later" : "needs",
    label: switchOn.checkOwn(goLiveFacts.own),
    sub: proof.tested ? switchOn.answered : null,
  };
}

/** What came in, a row a source; the kept app's chats in Meta's three parts under theirs (5B·i). */
function importItemsOf(dto: SetupDto, tz: string): GoLiveItemVM[] {
  const chats = whatsappPartsOf(
    (dto.imports ?? []).find((r) => r.source === "whatsapp_history"),
    tz,
  );
  return importLinesOf(dto.imports, tz, { whatsappWaiting: false }).lines.map((l): GoLiveItemVM => {
    const state = l.state === "done" ? "done" : l.state !== "failed" ? "waiting" : l.retry ? "needs" : "stopped";
    const parts = l.source === "whatsapp_history" && chats.length ? { parts: chats } : {};
    return { key: "imports", state, label: `${l.title} · ${l.says}`, sub: null, ...parts };
  });
}

/** 5B's list: the number, the forwarding, WhatsApp, the booking-link message with Meta, and what came in. */
function switchItemsOf(
  goLiveInput: GoLiveInput,
  goLiveFacts: GoLiveFacts,
  proof: { proved: boolean; tested: boolean },
): GoLiveItemVM[] {
  const switchOn = FIRST_RUN_GOLIVE_WORDS.switchOn;
  const voice = goLiveInput.dto.channels.voice.present;
  const approved = goLiveInput.dto.templates.startersApproved > 0;
  const items: GoLiveItemVM[] = goLiveFacts.noCalls
    ? []
    : [
        {
          key: "number",
          state: voice ? "done" : "waiting",
          label: goLiveFacts.own ? switchOn.number(goLiveFacts.own) : switchOn.numberUnknown,
          sub: voice ? switchOn.numberReady : switchOn.numberComing,
        },
      ];
  const forward = goLiveFacts.noCalls ? null : forwardItemOf(goLiveInput, goLiveFacts, proof);
  if (forward) items.push(forward);
  if (goLiveFacts.waChosen)
    items.push({
      key: "whatsapp",
      state: goLiveFacts.waOn ? "done" : "needs",
      label: goLiveInput.whatsapp === "same" ? switchOn.whatsapp : switchOn.whatsappOwn,
      sub: null,
    });
  if (goLiveFacts.waOn || goLiveFacts.waChosen)
    items.push({
      key: "template",
      state: approved ? "done" : "waiting",
      label: approved ? switchOn.templateOk : switchOn.template,
      sub: null,
    });
  return [...items, ...importItemsOf(goLiveInput.dto, goLiveInput.tz)];
}

/** 5B: paid, now one list that fills itself in, and Ask's count beside it. */
function switchOnOf(goLiveInput: GoLiveInput, goLiveFacts: GoLiveFacts): NonNullable<FirstRunGoLiveVM["switchOn"]> {
  const switchOn = FIRST_RUN_GOLIVE_WORDS.switchOn;
  const { dto } = goLiveInput;
  const fw = forwardedLineOf(dto.lines);
  const proof = { proved: !!fw && fw.forwarding_state === "verified", tested: !!dto.channels.voice.lastInboundAt };
  const items = switchItemsOf(goLiveInput, goLiveFacts, proof);
  const callsOn = goLiveFacts.kept ? proof.proved : proof.tested;
  const answers: NonNullable<FirstRunGoLiveVM["switchOn"]>["answers"] = [
    { key: "email", label: "Email", value: switchOn.answers.email },
  ];
  if (goLiveFacts.waChosen)
    answers.push({
      key: "whatsapp",
      label: "WhatsApp",
      value: goLiveFacts.waOn ? switchOn.answers.whatsappOn : switchOn.answers.whatsapp,
    });
  if (!goLiveFacts.noCalls)
    answers.push({ key: "calls", label: "Calls", value: callsOn ? switchOn.answers.callsOn : switchOn.answers.calls });
  const billing = dto.billing;
  const started = billingDoorOpen(billing) && (billing.status === "active" || billing.status === "trialing");
  const plan = started
    ? switchOn.plan(
        goLiveFacts.price,
        goLiveFacts.firstCharge,
        billing.status === "trialing" ? goLiveTrialDays(billing) : 0,
      )
    : null;
  return {
    plan,
    items,
    needs: items.filter((x) => x.state === "needs").length,
    done: items.filter((x) => x.state === "done").length + (plan ? 1 : 0),
    of: items.length + (plan ? 1 : 0),
    answers,
  };
}

/** Go live, as the page draws it: Pay (5A), its confirming, Switch it on (5B), or what answers now (5C). */
export function firstRunGoLiveOf(goLiveInput: GoLiveInput): FirstRunGoLiveVM {
  const { dto, phone } = goLiveInput;
  const goLiveFacts = goLiveFactsOf(goLiveInput);
  const hands = goLiveFacts.hands;
  // Everything else is done: what answers now (5C).
  const none = { pay: null, switchOn: null, live: null, noProvider: null, hands, rows: [] };
  if (goLiveInput.complete) return { ...none, stage: "live", live: liveOf(goLiveInput, goLiveFacts) };
  // No provider here, or a person was asked for the line: we set it up with them (5A·d), and say what goes live now of
  // what is connected, never more.
  if (phone.stage === "rows" && !dto.channels.voice.present && (!dto.lines?.ready || dto.requests.line)) {
    const email = !!dto.email?.mailbox || (dto.email?.sending?.mailboxes.length ?? 0) > 0;
    const now = FIRST_RUN_GOLIVE_WORDS.noProvider.now(goLiveFacts.waOn, email);
    return { ...none, stage: "noProvider", noProvider: { now } };
  }
  if (phone.stage === "starting") return { ...none, stage: "confirming", pay: payOf(goLiveInput, goLiveFacts) };
  if (phone.stage === "go") return { ...none, stage: "pay", pay: payOf(goLiveInput, goLiveFacts) };
  // Paid: Switch it on (5B), with Setup's rows above it where the phone has nothing to draw of its own.
  const rows =
    phone.stage === "rows"
      ? goLiveInput.vm.rows
          .filter((r) => (r.id === "billing" || r.id === "line") && r.state !== "ready")
          .map((r) => r.id)
      : [];
  return { ...none, stage: "switch", switchOn: switchOnOf(goLiveInput, goLiveFacts), rows };
}

/** What answers now, and Ask's three moves (canvas 5C, 5C·a–c). */
function liveOf(
  goLiveInput: GoLiveInput,
  input: { kept: string | null; always: boolean; own: string | null; waOn: boolean },
): NonNullable<FirstRunGoLiveVM["live"]> {
  const log = FIRST_RUN_GOLIVE_WORDS.live;
  const { dto, vm } = goLiveInput;
  const parts = [
    input.kept ? log.callsKept(input.kept, input.always) : input.own ? log.callsOwn(input.own) : null,
    input.waOn
      ? goLiveInput.whatsapp === "same"
        ? log.whatsappSame
        : log.whatsappOn(formatPhoneDisplay(dto.channels.whatsapp.number) ?? "")
      : null,
    log.email,
  ].filter((x): x is string => !!x);
  const moves: NonNullable<FirstRunGoLiveVM["live"]>["moves"] = [
    {
      key: "yes",
      title: log.yes.title,
      says: log.yes.says(dto.consent.yes, goLiveInput.people),
      act: log.yes.act,
      to: GET_YES_ROUTE,
    },
  ];
  if (vm.calendarLinked && !vm.dayBeforeOn)
    moves.push({
      key: "remind",
      title: log.remind.title,
      says: log.remind.says,
      act: log.remind.act,
      to: newSequenceRoute("visit_tomorrow"),
    });
  moves.push({
    key: "winBack",
    title: log.winBack.title,
    says: log.winBack.says,
    act: log.winBack.act,
    to: newSequenceRoute(vm.calendarLinked ? "lapsed" : "quiet_30"),
  });
  const notes: NonNullable<FirstRunGoLiveVM["live"]>["notes"] = [];
  const waChosen = goLiveInput.whatsapp === "same" || goLiveInput.whatsapp === "own";
  const SO = FIRST_RUN_GOLIVE_WORDS.switchOn;
  if (input.waOn && !dto.channels.whatsapp.active)
    notes.push({ key: "whatsapp_waiting", title: log.whatsappWaiting, says: log.whatsappWaitingSays, act: null });
  // Chosen and never connected: going live never waits on WhatsApp, so its approval is offered here, and Today keeps it.
  if (!input.waOn && waChosen)
    notes.push({
      key: "whatsapp_connect",
      title: goLiveInput.whatsapp === "same" ? SO.whatsapp : SO.whatsappOwn,
      says: log.whatsappConnectSays,
      act: { kind: "connect", label: SO.whatsappGo },
    });
  if (!input.waOn && !waChosen)
    notes.push({
      key: "whatsapp_later",
      title: log.whatsappLater,
      says: log.whatsappLaterSays,
      act: { kind: "choose", label: log.whatsappConnect },
    });
  const since = timeWords(answeringSince(dto), goLiveInput.tz);
  return { since: since ? log.since(since) : null, channels: log.channels(parts), moves, notes };
}
