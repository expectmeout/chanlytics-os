/**
 * The phone's rows of Setup: the line, the receptionist that answers it, the test call, and the number the business
 * already has. Their own module because the line's row alone is a ladder from bought to answering and from asked
 * for to paid for; setup-rows.ts holds the table they sit in, setup.ts the words and the context they read.
 */
import { PHONE_LINE_OFF } from "../lines/caller-gets";
import { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "../lines/line-failure";
import { formatPhoneDisplay } from "../shared/phone";
import { agoWords, spanLabel } from "../shared/time";
import {
  CARRIER_WORDS,
  FORWARDING_MODE_WORDS,
  forwardingTestOpen,
  type Carrier,
  type ForwardingMode,
} from "../voice/forwarding";
import { whyCannotSpend, priceWords, billingDoorOpen } from "../workspace/billing";
import { capabilityStatus } from "./capabilities";
import {
  activationWords,
  forwardedLineOf,
  keptPhoneKind,
  lineStuckProvisioning,
  LINE_STEP_WORDS,
  type LineDto,
  type SetupDto,
  type SetupInputs,
  type SetupRowContext,
  type SetupRowDraft,
  type SetupVM,
} from "./setup";
import { KEEP_ROW } from "./setup-put-off";

/**
 * 3. A line for calls and texts — the product's own line when this deployment can get one; a person at Chanlytics otherwise.
 */
export function lineRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
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
        ownLine || texting.done
          ? ""
          : "Texting arrives with lines that register with the carriers; this page will say when",
      ].filter(Boolean),
      verb: { label: "Open Connections", to: "admin/integrations" },
    };
  }
  if (voice.present) {
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_you",
      required: !answering,
      sentence: `Your line ${voice.number ? `${voiceNum} ` : ""}is switched off — ${PHONE_LINE_OFF.gets}.`,
      details: [],
      verb: { label: "Open Connections", to: "admin/integrations" },
    };
  }
  return ownLineRow(ctx) ?? lineToGetRow(i, ctx);
}

/**
 * Where the workspace's own line stands while it is set up, built once from the line and read by Start's row (ownLineRow)
 * and Connections' phone row, so the two say the same in each state (D1-line-row-derivations). Connections' row skipped
 * two rules Start's has: a line that has been setting up for hours said "Usually a minute or two" with no button where Start
 * said the setup stopped and offered Retry, and one stopped at the vault, which a retry cannot fix, offered "Retry it" where
 * Start offered nothing; and its Retry only walked to the first-run phone step.
 *
 * `stuck`: setting up past the deadline (lineStuckProvisioning), a retry offered; `setting_up`: within it; `credentials`:
 * stopped at the vault, which is ours to mend, so no retry; `stopped`: failed elsewhere, a retry offered; `connecting`: set
 * up, being joined to the receptionist. `retry` is the verb that sets the line up again in place (verb:retry-line:<id>).
 */
interface OwnLineStand {
  kind: "stuck" | "setting_up" | "credentials" | "stopped" | "connecting";
  sentence: string;
  details: string[];
  retry: string | null;
}

/** `number` is how the sentences name the line (Start names it; Connections shows the number beside the row and says none). */
export function ownLineStandOf(line: LineDto, nowMs: number, number: string | null): OwnLineStand | null {
  const n = number ? ` ${number}` : "";
  const step = LINE_STEP_WORDS[line.step ?? ""] ?? "working on it";
  const ago = agoWords(Date.parse(line.state_since), nowMs);
  const retry = `verb:retry-line:${line.id}`;
  if (lineStuckProvisioning(line, nowMs)) {
    // IT SAYS WHAT WILL HAPPEN, NOT WHAT HAS. This row used to read "A person at
    // Chanlytics has it" and "We have been told" -- and nothing had been: a saga
    // cut off by its lambda returns nothing, and the failure email only fires on a
    // returned failure. Now the lines sweep tells the platform the first time it
    // picks a stuck line up (edge/lib/line-resume.ts), which is usually within a
    // quarter of an hour of the deadline and not before it. So until then the true
    // sentence is the one about the future.
    // PAST THE DEADLINE. The same words and the same button the `failed` branch
    // below gives, because it is the same situation: the setup stopped and a
    // person can restart it. It used to read "usually a minute or two; this page
    // updates by itself" with no verb, which after an hour is untrue twice over —
    // and the retry it withheld is the only thing that would have finished the job.
    return {
      kind: "stuck",
      sentence: `Setting up${n} stopped while ${step}, ${ago}.`,
      details: [
        "It is retried automatically, usually within a quarter of an hour, and Chanlytics is told when it is",
        "Retry from here — it picks up where it stopped and buys nothing twice",
      ],
      retry,
    };
  }
  if (line.voice_state === "provisioning") {
    return {
      kind: "setting_up",
      sentence: `Setting up${n} — ${step}, since ${ago}.`,
      details: ["Usually a minute or two; this page updates by itself"],
      retry: null,
    };
  }
  if (line.voice_state === "failed" && lineCredentialFailure(line.last_error)) {
    // Not a carrier failure and not the owner's to retry: the wall is ours.
    return {
      kind: "credentials",
      sentence: `Setting up${n} stopped at ${LINE_CREDENTIALS_SENTENCE}. A person at Chanlytics has it.`,
      details: [
        "A retry cannot help until the credentials are restored; we have been told and will finish it with you",
      ],
      retry: null,
    };
  }
  if (line.voice_state === "failed") {
    return {
      kind: "stopped",
      sentence: `Setting up${n} stopped while ${step}. A person at Chanlytics has it.`,
      details: ["Retry from here; we have been told"],
      retry,
    };
  }
  if (line.voice_state === "answering") {
    return {
      kind: "connecting",
      sentence: `${number ?? "Your number"} is set up — connecting it to the receptionist.`,
      details: [],
      retry: null,
    };
  }
  return null;
}

/**
 * The workspace's own line, from bought to answering: stuck, still setting up, stopped at the vault or at a carrier,
 * or set up and being connected. Null without one, and the ask decides (lineToGetRow).
 */
function ownLineRow(ctx: SetupRowContext): SetupRowDraft | null {
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
    verb: stand.retry ? { label: "Retry", to: stand.retry } : null,
  };
}

/**
 * No line of its own yet: the number being brought over, the line asked for, the number to get — when this
 * deployment can get one, and whatever stands between the workspace and paying for it — or the ask.
 */
function lineToGetRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { answering, lines, canSpend, nowMs } = ctx;
  if (i.requests.port && !(i.requests.line && Date.parse(i.requests.line) > Date.parse(i.requests.port))) {
    // Bringing the number they have (S14): its own ask, and while it waits, the one thing that loses a number.
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_them",
      required: !answering,
      sentence: `Requested ${agoWords(Date.parse(i.requests.port), nowMs)} — a person at Chanlytics will move your number onto Chanlytics with you and reach you by email.`,
      details: [
        "Keep your current phone service until the move is finished — cancelling it first can lose the number",
        "Carriers take 7 to 14 business days once the move is filed",
      ],
      verb: null,
    };
  }
  if (i.requests.line) {
    return {
      id: "line",
      icon: "phone",
      title: "A line for calls and texts",
      state: "waiting_them",
      required: !answering,
      sentence: `Requested ${agoWords(Date.parse(i.requests.line), nowMs)} — a person at Chanlytics will set up your line with you and reach you by email.`,
      details: [],
      verb: null,
    };
  }
  if (lines.ready) {
    // A workspace that cannot spend is not shown a button that will refuse it.
    // Buying a number costs Chanlytics money whatever the workspace does next
    // (requireSpend), so the honest next step here is the card, not the number
    // -- and saying so on THIS row is what stops an owner pressing Get a line
    // and reading a 402 they did not expect.
    return canSpend
      ? {
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
            "A local number, included in your plan · your receptionist answers it · texting arrives when the carriers register it",
          ],
          verb: { label: "Get a line", to: "verb:choose-line" },
        }
      : billingDoorOpen(i.billing) && (i.billing.status === "none" || i.billing.status === "trialing")
        ? // No plan yet, or a free trial, which covers no number (maySpend): the number starts the plan, and the first
          // run's phone step is where both happen -- its checkout takes no trial, and a trial's plan starts from there.
          {
            id: "line",
            icon: "phone",
            title: "A line for calls and texts",
            state: "waiting_you",
            required: !answering,
            sentence: "Get a number for calls: it starts your plan.",
            details: [
              priceWords(i.billing.price ?? null)
                ? `A local number, included in your plan · ${priceWords(i.billing.price ?? null)}, from the day you get it`
                : "A local number, included in your plan, from the day you get it",
            ],
            // Where it answers chooses the number, Go live buys it (decision 0073).
            verb: { label: "Get a number", to: "start/channels" },
          }
        : billingDoorOpen(i.billing)
          ? {
              id: "line",
              icon: "phone",
              title: "A line for calls and texts",
              state: "waiting_you",
              required: !answering,
              sentence: whyCannotSpend(i.billing.mode, i.billing.status) ?? "Billing needs attention first.",
              details: ["A local number, included in your plan"],
              verb: { label: "Open Billing", to: "admin/billing" },
            }
          : // CANNOT SPEND, AND THERE IS NO CARD TO ADD. Three states, not two: this
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
                "Billing is not open on this deployment yet, so there is nothing to add a card to",
              ],
              verb: { label: "Ask for a line", to: "verb:request-line" },
            };
  }
  // Until lines provision themselves, the ask is the owner's move; from then on it is ours.
  return {
    id: "line",
    icon: "phone",
    title: "A line for calls and texts",
    state: "waiting_you",
    required: !answering,
    sentence: "We set up your phone line with you.",
    details: ["A number, the receptionist answering it, and forwarding from the number you have"],
    verb: { label: "Ask for a line", to: "verb:request-line" },
  };
}

/**
 * 4. The phone receptionist — answering on the line, transferring to a person.
 */
export function receptionistRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { voice, voiceReady, voiceNum, answering, handoffNum, ownLine, nowMs } = ctx;
  if (voiceReady) {
    const last = voice.lastInboundAt ? `Last call ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}` : "No calls yet";
    const cap = capabilityStatus("voice", i, nowMs);
    // A line can be bought in a minute and the facts take longer, so a
    // receptionist can be answering with nothing to answer WITH. It does not
    // invent — it says someone will confirm and takes a message — but the
    // page said "Answering", which reads as ready, and the one thing that
    // would fix it was three rows up with no mention of the phone.
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
          "Fill in your name, hours and services and it answers properly from the next call",
        ],
        // The first of the two it answers with that is missing, open on the page that holds it (the hours left Details
        // for Hours & booking on 17 Oct 2026).
        verb: { label: "Add your facts", to: `admin/workspace/${!i.business.name ? "name" : "hours"}` },
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
          handoffNum
            ? `Transfers to ${handoffNum} when a caller insists on a person`
            : "No hand-off number yet — callers who insist on a person are told someone will call back",
          last,
          activationWords(cap, nowMs),
        ],
        verb:
          cap.tested && !cap.live
            ? { label: "Activate", to: "verb:activate:voice" }
            : voice.number
              ? { label: "Call it", to: `tel:${voice.number}` }
              : null,
        undo: cap.live ? { label: "Withdraw activation", to: "verb:deactivate:voice" } : null,
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
      verb: null,
    };
  }
  if (ownLine && (ownLine.voice_state === "provisioning" || ownLine.voice_state === "answering")) {
    return {
      id: "receptionist",
      icon: "headphones",
      title: "Phone receptionist",
      state: "waiting_them",
      required: !answering,
      sentence: "Being created with your line — it answers the moment the line does.",
      details: [],
      verb: null,
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
    verb: null,
  };
}

/**
 * 4a. Try it (the first run's third step): once calls are answered, until one has reached the receptionist. The number
 * to call is the one customers call: the kept number while its forwarding is saved, else the receptionist's own.
 */
export function tryRow(_i: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  const { voice, voiceReady, voiceNum, lines, nowMs } = ctx;
  if (!voiceReady) return null;
  const fwTry = forwardedLineOf(lines);
  const through = fwTry?.e164 ? (formatPhoneDisplay(fwTry.e164) ?? fwTry.e164) : voiceNum;
  return {
    id: "try",
    icon: "phone",
    title: "Try it",
    state: voice.lastInboundAt ? "ready" : "waiting_you",
    required: false,
    sentence: voice.lastInboundAt
      ? `A call reached your receptionist ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}.`
      : fwTry
        ? // A phone cannot call itself: only an office phone system's owner is sure to hold another phone, their cell.
          `Call ${through} from ${keptPhoneKind(fwTry) === "office" ? "your cell" : "another phone"} and don't pick up.`
        : `Call ${through} from your cell.`,
    details: [],
    // The first run's Go live checks the line with this call (decision 0073; firstRunStepRoute("live")), spelled here:
    // that file reads this one.
    verb: voice.lastInboundAt ? null : { label: "Check my line", to: "start/live" },
  };
}

/**
 * 4b. The number you already have — forwarded to the receptionist's line, proven by a test call.
 */
export function keepRow(_i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { voice, voiceReady, voiceNum, lines, nowMs } = ctx;
  const fw = lines.rows.find((l) => l.kind === "forwarded") ?? null;
  const f = fw?.forwarding ?? null;
  const kept = fw?.e164 ? (formatPhoneDisplay(fw.e164) ?? fw.e164) : "your number";
  const dest = voiceReady && voice.number ? voiceNum : null;
  const how = f
    ? `${FORWARDING_MODE_WORDS[f.mode as ForwardingMode] ?? "Forwarded"} · ${CARRIER_WORDS[f.carrier as Carrier] ?? "your carrier"}`
    : "";
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
      verb: { label: "Change it", to: "verb:forwarding" },
    };
  }
  if (fw && f && forwardingTestOpen(f, nowMs)) {
    return {
      id: "keep",
      icon: "refresh",
      title,
      state: "waiting_you",
      required: false,
      sentence: `Testing — call ${kept} from another phone. This page updates by itself.`,
      details: [`Window open for ${spanLabel(Date.parse(f.test_until ?? "") - nowMs)}`],
      verb: { label: "Show the code", to: "verb:forwarding" },
    };
  }
  if (fw && f) {
    return {
      id: "keep",
      icon: "refresh",
      title,
      state: "waiting_you",
      required: false,
      sentence:
        f.carrier === "office"
          ? `Forward ${kept} to your receptionist in your phone system's settings, then test it.`
          : `Dial the code on the phone with ${kept}, then test it.`,
      details: [how],
      verb: { label: "Test it", to: `verb:forwarding-test:${fw.id}` },
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
      verb: null,
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
    verb: { label: "Set up forwarding", to: "verb:forwarding" },
  };
}

/**
 * "The number you already have" in Settings › How it answers › On calls, its home once the first run is done
 * (settings/business/phone/kept-number.tsx): Setup's own row (keepRow, above), by its own name, so the page and Today's
 * card say one thing, with the number kept as its value and the row's act opening the forwarding card. Forwarding was
 * set up on Setup's rows alone, so the row could never be put off for good. Null while there is no line to forward to.
 */
export interface KeptNumberRowVM {
  label: string;
  /** The number kept, as the app writes one; null while none is saved. */
  value: string | null;
  empty: string;
  /** Where it stands, in Setup's row's own sentence. */
  hint: string;
  /** The row's act: Setup's own verb words while the card is shut, `close` while it is open. */
  act: string;
  close: string;
}

export function keptNumberRowOf(vm: SetupVM, lines: SetupDto["lines"] | null | undefined): KeptNumberRowVM | null {
  const row = vm.rows.find((r) => r.id === KEEP_ROW);
  if (!row || !row.verb) return null;
  const kept = lines?.rows.find((l) => l.kind === "forwarded")?.e164 ?? null;
  return {
    label: row.title,
    value: kept ? (formatPhoneDisplay(kept) ?? kept) : null,
    empty: "Not forwarded",
    hint: row.sentence,
    act: row.verb.label,
    close: "Close",
  };
}
