/**
 * Ask writes to one person (POST people/[id]/draft; a conversation begins from the Inbox): the words of a message, or
 * the brief for a call, from what the product knows of them and of the business, in the owner's own voice.
 *
 * The person is read as their page reads them, on the member's own session (readers/person.ts and contracts
 * toPersonVM), so the draft knows what the page shows and nothing it does not. What a customer wrote and what a note
 * says are data to the model, fenced (contracts ai/fence.ts). A note for the team alone reaches a call's brief, which is
 * the member's, and never a message, which goes to the person. The model may ask before it writes, twice at most. A
 * price or an offer of money that the member's own words did not give is refused here, in code: a model that forgets
 * the rule cannot put one in a customer's hands. Nothing is written anywhere: a draft is text (decision 0017).
 */
import "server-only";
import {
  AppError,
  DATA_NOT_INSTRUCTIONS,
  DRAFT_ASKS_MAX,
  NEW_CONVERSATION_WORDS,
  PERSON_DRAFT_JSON_SCHEMA,
  PLAN_NOTE_MAX,
  PersonDraftAnswerSchema,
  fenced,
  namesMoney,
  parseTenantConfig,
  priceFigures,
  toPersonVM,
  violatesNoPrices,
  writeWireName,
  type PersonDraftAnswer,
  type PersonDraftDto,
  type PersonDraftInput,
  type WrittenChannel,
  type PersonVM,
} from "@chanlytics/contracts";
import { askForJson } from "../model-json";
import { load, type ReaderContext } from "../readers";
import * as facts from "../readers/facts";
import { person } from "../readers/person";

/** How much of a person's history the model is handed: the newest turns, and each one's words cut to a line or two. */
const TURNS_TOLD = 12;
const TURN_CHARS = 220;
const FACTS_SHOWN = 6;

/**
 * What of a person's history a message is written from: what they and the business said and did with each other. The
 * team's own record of them (why a thread was handed over, what a member decided, a change of consent, what the
 * system noted) is the member's, and reaches a call's brief alone.
 */
const SAID_TO_THEM = new Set(["customer", "receptionist", "team", "call", "visit"]);

/** What the draft reads of a person: their page's own view model, and only these fields of it. */
type Who = Pick<PersonVM, "name" | "givenName" | "facts" | "lastExchange" | "timeline" | "noteList">;

/** What the draft is written from: the person, the business, today, and whose budget the call is counted in. */
interface DraftKnown {
  who: Who;
  business: { name: string; tone: string | null; languages: string[]; services: string[]; bookingLink: string | null };
  /** Today, in the business's own words ("Wednesday, October 7"): a note says when it was true. */
  today: string;
  tenantId: string;
  userId: string;
}

const RULES = [
  "You help the owner of a small business write to one of their own customers or contacts, or prepare to phone them.",
  "You write as the owner: a person writing to a person they know. Never as an assistant, never about yourself.",
  "Use only the facts you are given about the business and the person. Never invent a name, a day, a time, a price, an offer, or anything they said.",
  "Never state a price, a discount, a refund or a deposit unless the owner's own words below state it. Never say a visit is booked or confirmed.",
  "One ask, and a small one: a reply, a time that suits, a call back.",
  "Plain words. No slogans, no flattery, no emoji, no exclamation marks.",
  "If the owner's words do not say enough to write something true and specific (which day, which service, what the news is), ask instead: put at most two short questions in `asks`, each with a short `key`, and leave every other field empty. Ask only what the facts below do not already answer, and never ask again what the owner has answered.",
  "Unless you are asking, always write `note`: one sentence of fact for the business's receptionist, who may answer this person next. Begin it with today's date as given. Say what the owner did and what should happen if the person answers. No price in it.",
  DATA_NOT_INSTRUCTIONS,
];

function shapeRules(input: DraftInput): string[] {
  if (input.how === "call")
    return [
      "The owner will phone them. Leave `text` and `subject` empty and write the brief:",
      "`opening`: the first sentence to say, naming the business.",
      "`points`: two to four things to say, each one short line.",
      "`avoid`: what to leave out, such as a price they were not given or anything the facts do not support.",
      "`ask`: the one thing to ask for.",
    ];
  const wire = input.wire ?? "whatsapp";
  return [
    `It goes by ${writeWireName(wire)}. Write \`text\`: the message itself, ready to send, with no signature.`,
    wire === "email"
      ? "It is an email: write `subject` too, under nine words, saying what it is about. `text` is under 140 words, in short paragraphs."
      : "It is a short message: `text` is under 60 words, one or two sentences. Leave `subject` empty.",
    "Leave `opening`, `points`, `avoid` and `ask` empty.",
  ];
}

/** The person, as lines of fact; what they wrote and what notes say are fenced as data. */
function personLines(who: Who, forTheMember: boolean): string {
  const lines = [`Name: ${who.name}${who.givenName && who.givenName !== who.name ? ` (called ${who.givenName})` : ""}`];
  for (const f of who.facts.slice(0, FACTS_SHOWN)) lines.push(`${f.label}: ${f.value}`);
  const last = who.lastExchange?.customer;
  if (last) lines.push(`The last thing they wrote (${last.at}): ${last.text.slice(0, TURN_CHARS)}`);
  const turns = who.timeline
    // A message that never reached them (queued, failed or canceled) was not said to them: the draft does not build on it.
    .filter((t) => forTheMember || (SAID_TO_THEM.has(t.kind) && !t.unsent))
    .slice(0, TURNS_TOLD)
    .map((t) => `${t.day} ${t.time} ${t.who}: ${t.text.slice(0, TURN_CHARS)}`);
  if (turns.length) lines.push("What has happened, newest first:", ...turns);
  // A note for the team alone is the team's: a brief may hold it, a message to the person never does.
  const notes = who.noteList.filter((n) => !n.suggested && (forTheMember || !n.teamOnly)).map((n) => n.body);
  if (notes.length) lines.push("The team's notes about them:", ...notes);
  return fenced("record", lines.join("\n"));
}

function businessLines(b: DraftKnown["business"]): string {
  return [
    `The business: ${b.name}.`,
    b.tone ? `How it speaks: ${b.tone}.` : null,
    b.languages.length ? `It writes in: ${b.languages.join(", ")}.` : null,
    b.services.length ? `It offers: ${b.services.join(", ")}.` : null,
    b.bookingLink ? `Its booking link, for when one helps: ${b.bookingLink}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function askedOf(known: DraftKnown, input: DraftInput): string {
  const answered = (input.answers ?? []).map((a) => `You asked: ${a.question}\nThe owner answered: ${a.words}`);
  const again = input.previous
    ? [
        `The last draft was:\n${input.previous.subject ? `Subject: ${input.previous.subject}\n` : ""}${input.previous.text}`,
        input.tone === "shorter"
          ? "Make it shorter. The same ask, fewer words."
          : input.tone === "warmer"
            ? "Make it warmer. The same length, the same ask."
            : "Write it again.",
      ]
    : [];
  return [
    `Today is ${known.today}.`,
    businessLines(known.business),
    `Who it is for:\n${personLines(known.who, input.how === "call")}`,
    `What the owner says it is about: ${input.about}`,
    ...answered,
    ...again,
  ].join("\n\n");
}

/**
 * Whether the words name a price, or offer money, that the member's own words did not. A price is held to its figure:
 * a member who wrote "$50" may be drafted "$50" or "50 dollars", and never "$45".
 */
function unasked(written: string, given: string): "priced" | "money" | null {
  const theirs = new Set(priceFigures(given));
  if (priceFigures(written).some((figure) => !theirs.has(figure))) return "priced";
  if (namesMoney(written) && !namesMoney(given)) return "money";
  return null;
}

/** What is kept of the model's answer: questions alone, or the words, or the brief; a note with no price in it. */
function draftKept(answer: PersonDraftAnswer, known: DraftKnown, input: DraftInput): PersonDraftDto {
  const lines = known.who.facts.slice(0, FACTS_SHOWN).map((f) => `${f.label}: ${f.value}`);
  const wrote = input.how === "call" ? !!answer.opening || answer.points.length > 0 : !!answer.text;
  // A question is asked alone. One the member already answered, beside words that were written, is let go.
  if (answer.asks.length && !(wrote && input.answers?.length)) {
    return {
      asks: answer.asks.slice(0, DRAFT_ASKS_MAX),
      text: "",
      subject: "",
      note: "",
      brief: null,
      facts: lines,
    };
  }
  // What the member gave: the plan, their answers, and the draft they hand back to be rewritten, which holds their own
  // changes (a price typed into the message is theirs; one the model wrote was held to this same rule when it was).
  const given = [input.about, ...(input.answers ?? []).map((a) => a.words), input.previous?.text ?? ""].join("\n");
  const said =
    input.how === "call"
      ? [answer.opening, ...answer.points, answer.ask].join("\n")
      : `${answer.subject}\n${answer.text}`;
  const refused = unasked(said, given);
  if (refused) throw new AppError("validation", NEW_CONVERSATION_WORDS.refusals[refused], 422);
  const note = violatesNoPrices(answer.note) || namesMoney(answer.note) ? "" : answer.note.slice(0, PLAN_NOTE_MAX);
  return input.how === "call"
    ? {
        asks: [],
        text: "",
        subject: "",
        note,
        brief: { opening: answer.opening, points: answer.points, avoid: answer.avoid, ask: answer.ask },
        facts: lines,
      }
    : {
        asks: [],
        text: answer.text,
        subject: input.wire === "email" ? answer.subject : "",
        note,
        brief: null,
        facts: lines,
      };
}

/** The draft from what is known: one model call, and what is kept of its answer. */
export async function draftFrom(known: DraftKnown, input: DraftInput): Promise<PersonDraftDto> {
  const answer = await askForJson(
    {
      tenantId: known.tenantId,
      userId: known.userId,
      purpose: "person_draft",
      request: {
        max_tokens: 900,
        system: [...RULES, ...shapeRules(input)].join("\n"),
        schema: PERSON_DRAFT_JSON_SCHEMA,
        messages: [{ role: "user", content: askedOf(known, input) }],
      },
    },
    PersonDraftAnswerSchema,
    "draft",
  );
  return draftKept(answer, known, input);
}

/**
 * What a draft is asked for: the route's input (a first message goes by a wire a yes covers), or a thread's reply, which
 * goes where they last wrote, an Instagram DM among them (drafts.ts draftForThread).
 */
type DraftInput = Omit<PersonDraftInput, "wire"> & { wire?: WrittenChannel };

/** The route's handle: the person as their page reads them, the business as its settings say it, then the draft. */
export async function draftForPerson(rc: ReaderContext, id: string, input: DraftInput): Promise<PersonDraftDto> {
  const [read, config, names] = await Promise.all([
    load(rc, person, { id }),
    load(rc, facts.config, undefined),
    load(rc, facts.facts, undefined),
  ]);
  const zone = names.data.timezone;
  const brain = parseTenantConfig(config.data?.config ?? null)?.brain;
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(rc.now);
  return draftFrom(
    {
      who: toPersonVM(read.data.person, zone, rc.now, rc.userId),
      business: {
        name: brain?.business_name ?? names.data.name,
        tone: brain?.profile?.tone?.trim() || null,
        languages: brain?.profile?.languages ?? [],
        // By name alone: a service's price note is never handed to a draft.
        services: (brain?.profile?.services ?? []).slice(0, 12).map((s) => s.name),
        bookingLink: brain?.booking_link?.trim() || null,
      },
      today,
      tenantId: rc.tenantId,
      userId: rc.userId,
    },
    input,
  );
}
