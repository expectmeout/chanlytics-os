/**
 * Go live (decision 0073, canvas 5A–5C): the first run's last step, where everything chosen at Where it answers starts.
 *
 * - **Pay** (5A): what starts and what it costs, and the card in the page (R16), or a trial's plan started now, or, for
 *   a workspace that already pays, the press alone. The trial is FIRST_RUN_TRIAL_DAYS, said as it is (R9).
 * - **Switch it on** (5B): one list that fills itself in: the plan, the receptionist's number on its way, the code that
 *   forwards the number kept and the owner's own call that proves it (first-run-phone.ts and first-run-try.ts draw those
 *   two), WhatsApp's approval, the booking-link message with Meta, and what came in. Two rows need the owner's hands; both
 *   can wait, and Today keeps the same list (first-run-card.ts).
 * - **Live** (5C): what answers now, and Ask's first three moves, each waiting for the owner's yes.
 *
 * Every sentence is here; the page composes.
 */
import { formatPhoneDisplay } from "../shared/phone";
import { billingDoorOpen, dayWords, priceWords, FIRST_RUN_TRIAL_DAYS } from "../workspace/billing";
import { GET_YES_ROUTE } from "../people/lists/people-route";
import { newSequenceRoute } from "../sequences/sequence-address";
import { forwardedLineOf, type SetupDto, type SetupVM, type WhatsappChoice } from "./setup";
import type { FirstRunPhoneVM } from "./first-run-phone";
import { importLinesOf, whatsappPartsOf, type WhatsappPartVM } from "../imports/ledger";

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
}

function goLiveFactsOf(i: GoLiveInput): GoLiveFacts {
  const { dto, vm } = i;
  const want = vm.want;
  const kept = want && want.way !== "new" ? formatPhoneDisplay(want.number) : null;
  const waOn = dto.channels.whatsapp.present;
  const waChosen = i.whatsapp === "same" || i.whatsapp === "own";
  return {
    kept,
    always: want?.mode === "always",
    own: formatPhoneDisplay(dto.channels.voice.number ?? (want?.way === "new" ? want.number : null)),
    waOn,
    waChosen,
    hands: (kept ? 1 : 0) + (waChosen && !waOn ? 1 : 0),
    price: priceWords(dto.billing?.price ?? null) || null,
    firstCharge: dto.billing?.current_period_end ? dayWords(dto.billing.current_period_end, i.tz) : null,
  };
}

/** What starts at Go live, a row each (5A): calls, WhatsApp where chosen, bookings where read, email where connected. */
function startsOf(i: GoLiveInput, f: GoLiveFacts): GoLiveStartVM[] {
  const W = FIRST_RUN_GOLIVE_WORDS.starts;
  const mailbox = i.dto.email?.sending?.mailboxes[0] ?? null;
  const out: GoLiveStartVM[] = [
    { key: "calls", label: W.calls(f.kept, f.always, f.own), after: W.callsAfter(!!f.kept) },
  ];
  if (f.waChosen)
    out.push({
      key: "whatsapp",
      label: i.whatsapp === "same" ? W.whatsappSame : W.whatsappOwn,
      after: W.whatsappAfter,
    });
  if (i.dto.calendar.state === "ok")
    out.push({ key: "bookings", label: W.bookings(i.toolName), after: W.bookingsAfter });
  if (mailbox) out.push({ key: "email", label: W.email(mailbox.address), after: W.emailAfter });
  return out;
}

/** 5A: what starts, the price, the trial as it is, and what happens after the press. */
function payOf(i: GoLiveInput, f: GoLiveFacts): NonNullable<FirstRunGoLiveVM["pay"]> {
  const W = FIRST_RUN_GOLIVE_WORDS;
  const days = FIRST_RUN_TRIAL_DAYS;
  const after: string[] = [W.after.number];
  if (f.waChosen) after.push(W.after.template);
  if (f.hands) after.push(W.after.hands(!!f.kept, f.waChosen && !f.waOn));
  return {
    starts: startsOf(i, f),
    price: f.price,
    trial: W.trial(days),
    note: W.note(days, null),
    after,
    secured: W.secured(days),
  };
}

/** The forwarding row: a number kept, proved by its code; or the workspace's own, proved by a call that came in. */
function forwardItemOf(
  i: GoLiveInput,
  f: GoLiveFacts,
  proof: { proved: boolean; tested: boolean },
): GoLiveItemVM | null {
  const W = FIRST_RUN_GOLIVE_WORDS.switchOn;
  if (f.kept) {
    const later = i.vm.rows.find((r) => r.id === "keep")?.later;
    return {
      key: "forward",
      state: proof.proved ? "done" : later ? "later" : "needs",
      label: f.always ? W.forwardAll(f.kept, null) : W.forward(f.kept, null),
      sub: proof.proved ? W.proved : W.check(f.kept),
    };
  }
  if (!f.own) return null;
  return {
    key: "forward",
    state: proof.tested ? "done" : i.vm.trySkipped ? "later" : "needs",
    label: W.checkOwn(f.own),
    sub: proof.tested ? W.answered : null,
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
function switchItemsOf(i: GoLiveInput, f: GoLiveFacts, proof: { proved: boolean; tested: boolean }): GoLiveItemVM[] {
  const W = FIRST_RUN_GOLIVE_WORDS.switchOn;
  const voice = i.dto.channels.voice.present;
  const approved = i.dto.templates.startersApproved > 0;
  const items: GoLiveItemVM[] = [
    {
      key: "number",
      state: voice ? "done" : "waiting",
      label: f.own ? W.number(f.own) : W.numberUnknown,
      sub: voice ? W.numberReady : W.numberComing,
    },
  ];
  const forward = forwardItemOf(i, f, proof);
  if (forward) items.push(forward);
  if (f.waChosen)
    items.push({
      key: "whatsapp",
      state: f.waOn ? "done" : "needs",
      label: i.whatsapp === "same" ? W.whatsapp : W.whatsappOwn,
      sub: null,
    });
  if (f.waOn || f.waChosen)
    items.push({
      key: "template",
      state: approved ? "done" : "waiting",
      label: approved ? W.templateOk : W.template,
      sub: null,
    });
  return [...items, ...importItemsOf(i.dto, i.tz)];
}

/** 5B: paid, now one list that fills itself in, and Ask's count beside it. */
function switchOnOf(i: GoLiveInput, f: GoLiveFacts): NonNullable<FirstRunGoLiveVM["switchOn"]> {
  const W = FIRST_RUN_GOLIVE_WORDS.switchOn;
  const { dto } = i;
  const fw = forwardedLineOf(dto.lines);
  const proof = { proved: !!fw && fw.forwarding_state === "verified", tested: !!dto.channels.voice.lastInboundAt };
  const items = switchItemsOf(i, f, proof);
  const callsOn = f.kept ? proof.proved : proof.tested;
  const answers: NonNullable<FirstRunGoLiveVM["switchOn"]>["answers"] = [
    { key: "email", label: "Email", value: W.answers.email },
  ];
  if (f.waChosen)
    answers.push({ key: "whatsapp", label: "WhatsApp", value: f.waOn ? W.answers.whatsappOn : W.answers.whatsapp });
  answers.push({ key: "calls", label: "Calls", value: callsOn ? W.answers.callsOn : W.answers.calls });
  const billing = dto.billing;
  const started = billingDoorOpen(billing) && (billing.status === "active" || billing.status === "trialing");
  const plan = started
    ? W.plan(f.price, f.firstCharge, billing.status === "trialing" ? FIRST_RUN_TRIAL_DAYS : 0)
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
export function firstRunGoLiveOf(i: GoLiveInput): FirstRunGoLiveVM {
  const { dto, phone } = i;
  const f = goLiveFactsOf(i);
  const hands = f.hands;
  // Everything else is done: what answers now (5C).
  const none = { pay: null, switchOn: null, live: null, noProvider: null, hands, rows: [] };
  if (i.complete) return { ...none, stage: "live", live: liveOf(i, f) };
  // No provider here, or a person was asked for the line: we set it up with them (5A·d), and say what goes live now of
  // what is connected, never more.
  if (phone.stage === "rows" && !dto.channels.voice.present && (!dto.lines?.ready || dto.requests.line)) {
    const email = !!dto.email?.mailbox || (dto.email?.sending?.mailboxes.length ?? 0) > 0;
    const now = FIRST_RUN_GOLIVE_WORDS.noProvider.now(f.waOn, email);
    return { ...none, stage: "noProvider", noProvider: { now } };
  }
  if (phone.stage === "starting") return { ...none, stage: "confirming", pay: payOf(i, f) };
  if (phone.stage === "go") return { ...none, stage: "pay", pay: payOf(i, f) };
  // Paid: Switch it on (5B), with Setup's rows above it where the phone has nothing to draw of its own.
  const rows =
    phone.stage === "rows"
      ? i.vm.rows.filter((r) => (r.id === "billing" || r.id === "line") && r.state !== "ready").map((r) => r.id)
      : [];
  return { ...none, stage: "switch", switchOn: switchOnOf(i, f), rows };
}

/** What answers now, and Ask's three moves (canvas 5C, 5C·a–c). */
function liveOf(
  i: GoLiveInput,
  n: { kept: string | null; always: boolean; own: string | null; waOn: boolean },
): NonNullable<FirstRunGoLiveVM["live"]> {
  const L = FIRST_RUN_GOLIVE_WORDS.live;
  const { dto, vm } = i;
  const parts = [
    n.kept ? L.callsKept(n.kept, n.always) : n.own ? L.callsOwn(n.own) : null,
    n.waOn
      ? i.whatsapp === "same"
        ? L.whatsappSame
        : L.whatsappOn(formatPhoneDisplay(dto.channels.whatsapp.number) ?? "")
      : null,
    L.email,
  ].filter((x): x is string => !!x);
  const moves: NonNullable<FirstRunGoLiveVM["live"]>["moves"] = [
    { key: "yes", title: L.yes.title, says: L.yes.says(dto.consent.yes, i.people), act: L.yes.act, to: GET_YES_ROUTE },
  ];
  if (vm.calendarLinked && !vm.dayBeforeOn)
    moves.push({
      key: "remind",
      title: L.remind.title,
      says: L.remind.says,
      act: L.remind.act,
      to: newSequenceRoute("visit_tomorrow"),
    });
  moves.push({
    key: "winBack",
    title: L.winBack.title,
    says: L.winBack.says,
    act: L.winBack.act,
    to: newSequenceRoute(vm.calendarLinked ? "lapsed" : "quiet_30"),
  });
  const notes: NonNullable<FirstRunGoLiveVM["live"]>["notes"] = [];
  const waChosen = i.whatsapp === "same" || i.whatsapp === "own";
  const SO = FIRST_RUN_GOLIVE_WORDS.switchOn;
  if (n.waOn && !dto.channels.whatsapp.active)
    notes.push({ key: "whatsapp_waiting", title: L.whatsappWaiting, says: L.whatsappWaitingSays, act: null });
  // Chosen and never connected: going live never waits on WhatsApp, so its approval is offered here, and Today keeps it.
  if (!n.waOn && waChosen)
    notes.push({
      key: "whatsapp_connect",
      title: i.whatsapp === "same" ? SO.whatsapp : SO.whatsappOwn,
      says: L.whatsappConnectSays,
      act: { kind: "connect", label: SO.whatsappGo },
    });
  if (!n.waOn && !waChosen)
    notes.push({
      key: "whatsapp_later",
      title: L.whatsappLater,
      says: L.whatsappLaterSays,
      act: { kind: "choose", label: L.whatsappConnect },
    });
  const since = timeWords(answeringSince(dto), i.tz);
  return { since: since ? L.since(since) : null, channels: L.channels(parts), moves, notes };
}
