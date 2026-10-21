/**
 * Support's playbooks (decision 0067): for each topic a question is about, and each thing a workspace can ask a person
 * to set up, what to check first in the Console, the steps, and a reply with their first name filled in. The same steps
 * are what the inbox is mailed when an ask comes in (apps/edge/lib/ops/setup-request.ts), so the Console and the mail
 * never disagree; the one line a member reads after sending is here too.
 *
 * Written once, here, for a person on the team: the drafts are copied into the inbox and sent from there, in their
 * name, never from the Console. They are drafts to check against the app as it changes. Only the Console and the
 * edge's mail read this module; a member's page must not, since its steps name the team's own tools.
 */
import type { SupportTopic } from "./support";
import type { SupportRowKind } from "./support-queue";

/** What a playbook's words are filled with. */
export interface PlaybookFill {
  /** Their first name; "there" when they gave none. */
  first: string | null;
  workspace: string;
  /** Who on the team signs the reply. */
  me: string;
  tenantId: string | null;
}

export interface SupportPlaybook {
  /** "WhatsApp": what the panel heads it with. */
  title: string;
  /** What to look at in the Console before answering. */
  check: string;
  steps: (p: PlaybookFill) => readonly string[];
  /** The reply, filled in: short, the exact place in the app, one next step, a short call offered, signed. */
  reply: (p: PlaybookFill) => string;
  /** The one line a member reads after sending, until a person answers; null where there is nothing to say yet. */
  meanwhile: string | null;
}

/** An ask's playbook, and what the inbox is told of it: the mail's subject after the workspace's name. */
interface AskPlaybook extends SupportPlaybook {
  subject: string;
}

const hi = (p: PlaybookFill) => `Hi ${p.first || "there"},`;
const signed = (p: PlaybookFill) => `— ${p.me}, Chanlytics`;
const letter = (p: PlaybookFill, body: string) => `${hi(p)} ${body}\n${signed(p)}`;

/** The topics' playbooks: a question about using the app. */
const TOPIC_PLAYBOOKS: Record<SupportTopic, SupportPlaybook> = {
  whatsapp: {
    title: "WhatsApp",
    check: "Their Setup's WhatsApp row, and whether Connections shows a WhatsApp number.",
    steps: () => [
      "They need the Meta Business account that owns the number. Ask which account they sign in to Facebook with.",
      "In their app: Settings › Connections › WhatsApp › Connect, signed in with that account.",
      "A number on the WhatsApp Business app today has to come off it first, or they use another number.",
      "Once it's connected, the Setup row says so.",
    ],
    reply: (p) =>
      letter(
        p,
        "WhatsApp connects from Settings › Connections › WhatsApp › Connect, signed in with the Facebook account that owns your business. If your number is on the WhatsApp Business app today, it has to come off it first; I can walk you through it on a 10-minute call. Which account do you use for Facebook?",
      ),
    meanwhile: "WhatsApp connects from Settings › Connections › WhatsApp.",
  },
  forwarding: {
    title: "Forwarding",
    check:
      "Their Setup: whether the receptionist's line answers, and whether the number they keep passed its test call.",
    steps: () => [
      "Calls reach the receptionist when the number they keep forwards to its number, which Setup shows beside it.",
      "A mobile or a landline forwards in the carrier's settings: unanswered calls, or every call, as their Setup row says.",
      "An office phone system (RingCentral, Vonage, 8x8 and the like) forwards in its own settings, before any voicemail. Offer a call to do it together.",
      "Then they press Test it on Setup's row for the number they keep.",
    ],
    reply: (p) =>
      letter(
        p,
        "calls reach the receptionist once your number forwards to it: the number to forward to is on your Setup page, beside the number you keep. Set the forwarding in your phone's or phone system's settings, before any voicemail, then press Test it on that row. If your office phone system makes it fiddly, I can do it with you on a 10-minute call.",
      ),
    meanwhile: "Setup shows the number to forward to, and Test it checks it.",
  },
  line: {
    title: "A line or number",
    check: "Their Setup's row A line for calls and texts, and the workspace's Setup and lines tab here.",
    steps: () => [
      "A new number: Setup's row A line for calls and texts; where it can't get one by itself, it asks a person (a setup ask).",
      "Keeping the number they have: they forward it to the receptionist's line (the forwarding playbook).",
      "Moving their number to us for good: a port, which a person files; they keep their current service until it completes.",
      "Texting needs the carriers' registration; the same Setup row says where it stands.",
    ],
    reply: (p) =>
      letter(
        p,
        "there are two ways to have the receptionist answer: a new number from us, or the number you have, forwarded to it. Setup's row \"A line for calls and texts\" starts either. Which would you like? If you'd rather move your number to us for good, I can start that for you.",
      ),
    meanwhile: "Setup's row A line for calls and texts starts a line.",
  },
  calendar: {
    title: "Calendar",
    check: "Their Setup's Calendar row, and whether Connections shows a calendar.",
    steps: () => [
      "Their calendar connects from Settings › Connections, signed in with the calendar's account.",
      "Opening hours, closed days and booking rules are in Settings › Hours & booking.",
      "The receptionist offers open times only where the calendar can be read.",
    ],
    reply: (p) =>
      letter(
        p,
        "the receptionist books into your calendar once it's connected: Settings › Connections, signed in with your calendar's account. Your opening hours and booking rules are in Settings › Hours & booking, and it offers only the times your calendar shows free. Want me to check it with you on a short call?",
      ),
    meanwhile: "Your calendar connects from Settings › Connections.",
  },
  billing: {
    title: "Billing",
    check: "Their workspace's card here: the plan, the trial, how it pays.",
    steps: () => [
      "The plan, the card and the invoices are in Settings › Billing, which an owner sees.",
      "A charge to correct or a refund is the Billing role's: hand it over if it isn't yours.",
      "Never take card details by email.",
    ],
    reply: (p) =>
      letter(
        p,
        "your plan, card and invoices are in Settings › Billing (an owner sees it). Tell me which invoice or charge you mean and I'll look at it today.",
      ),
    meanwhile: "Your plan and invoices are in Settings › Billing.",
  },
  language: {
    title: "Language",
    check: "Settings › How it answers: the languages it answers in.",
    steps: () => [
      "The receptionist answers each customer in the language they write in; How it answers sets which ones.",
      "Their business facts can stay in one language: it answers from them in the customer's.",
    ],
    reply: (p) =>
      letter(
        p,
        "yes: the receptionist answers each customer in the language they write in, and you choose which languages under Settings › How it answers. Your business details can stay as they are; it answers from them in the customer's language.",
      ),
    meanwhile: "Languages are chosen in Settings › How it answers.",
  },
  facts: {
    title: "Hours and prices",
    check: "Their Setup's Business facts row: what it knows, and what it lacks.",
    steps: () => [
      "Services, prices and the address are their business facts: Setup's Business facts row.",
      "Opening hours and closed days are in Settings › Hours & booking.",
      "Notes in their own words, and what never to say, are in Settings › How it answers.",
      "What it doesn't know, it hands over: more facts mean fewer hand-offs.",
    ],
    reply: (p) =>
      letter(
        p,
        "the receptionist answers from your business facts: your services, prices and address on Setup's Business facts row, and your hours in Settings › Hours & booking. Anything it doesn't know, it hands to you. Want me to fill them in with you on a 15-minute call?",
      ),
    meanwhile: "Your services and prices are on Setup's Business facts row.",
  },
  team: {
    title: "Team and alerts",
    check: "Settings › Team, and their Setup's rows A person to hand off to and Team and alerts.",
    steps: () => [
      "Someone is added from Settings › Team: they get an invite and sign in with the address it went to.",
      "Who is told when the receptionist hands a conversation over: Setup's A person to hand off to, and Settings › Notifications.",
    ],
    reply: (p) =>
      letter(
        p,
        'you add someone from Settings › Team: they get an invite at their address and sign in with it. Who is told when the receptionist hands a conversation over is set on Setup\'s "A person to hand off to" row and in Settings › Notifications.',
      ),
    meanwhile: "People are added from Settings › Team.",
  },
  other: {
    title: "A question",
    check: "Their workspace's card, and the page they wrote from.",
    steps: () => [
      "Answer the question they asked, in their words.",
      "Name the exact place in the app.",
      "Offer a short call when it takes more than a reply.",
    ],
    reply: (p) => letter(p, "thanks for writing in."),
    meanwhile: null,
  },
};

/**
 * The asks' playbooks: what a person at Chanlytics does for a workspace that asked (setup_request, 00439). Their steps
 * are the inbox's how-to, as the edge mails it; the line's is a command run as it is, with the workspace's id.
 */
const ASK_PLAYBOOKS: Record<string, AskPlaybook> = {
  // The voice door takes a token minted for it, never the platform's key on an edge that holds EDGE_CALL_SECRET
  // (admin-auth.ts): the script mints one, as the dashboard does. The key in a curl was refused there (token_required).
  line: {
    title: "A phone line",
    subject: "asked for a phone line",
    check: "Whether the workspace has a line yet: its Setup and lines tab here.",
    steps: (p) => [
      "Set it up from the repository with EDGE_CALL_SECRET (the secret the dashboard signs with) in the environment, a dry run first:",
      `  node tooling/scripts/ops/voice/voice-provision.mjs --tenant ${p.tenantId ?? "<workspace id>"} --area-code <3 digits>`,
      "then the same with --apply. Their Setup page reads the line as ready by itself once the row exists.",
    ],
    reply: (p) =>
      letter(
        p,
        "I'm setting up your line: a number in your area, with the receptionist answering it. Which area code would you like? Once it's ready, Setup shows the number, and you can call it to hear the receptionist.",
      ),
    meanwhile: null,
  },
  // Bringing the number they have (S14): a person files the port with the carrier; nothing here provisions it.
  port: {
    title: "Bringing their number",
    subject: "asked to bring their phone number",
    check: "Their Setup's row for the number they keep, and whether they still pay their current carrier.",
    steps: () => [
      "Reply for what the losing carrier asks for: the number, the carrier, the account holder's name and service address as the carrier has them, the account number and the port-out PIN, and a recent bill.",
      "File the port with Twilio, and tell them to keep their current service until it completes -- cancelling it first can lose the number. Their Setup row says so meanwhile.",
    ],
    reply: (p) =>
      letter(
        p,
        "to move your number to us I need, from your current carrier: the account holder's name and service address as they have them, the account number, the port-out PIN, and a recent bill. Keep your current service until the move is finished; cancelling it first can lose the number.",
      ),
    meanwhile: null,
  },
  // Forwarding in an office phone system (00173, the first run's decision 3): no star code, so a person does it with them.
  forwarding: {
    title: "Forwarding in their phone system",
    subject: "asked for help setting up forwarding in their office phone system",
    check:
      "Their Setup's row for the number they keep: the number to forward to, and whether a test call came through.",
    steps: () => [
      "Reply to find a time for a call. Their phone system (RingCentral, Vonage, 8x8 and the like) forwards calls in its own settings, under forwarding or what happens when no one answers: forward the calls (unanswered, or every call, as their Setup row for the number they keep says) to the receptionist's number, which their first run and Setup show.",
      "Put the forwarding before any voicemail. Then have them press Test it on Setup's row for the number they keep.",
    ],
    reply: (p) =>
      letter(
        p,
        "happy to set up the forwarding in your phone system with you; it takes about 15 minutes on a call, with its admin sign-in to hand. When suits you this week?",
      ),
    meanwhile: null,
  },
  // A configuration the receptionist can no longer read (S8): only a person can repair it.
  repair: {
    title: "Repairing their settings",
    subject: "asked for their business settings to be repaired",
    check: "Their Setup's Business facts row: it names what the receptionist can't read.",
    steps: () => [
      "Their saved configuration no longer passes the receptionist's checks, so it is silent. GET /api/v1/settings answers the problems as broken.issues, and their Business pane lists them.",
      "Correct tenant_config.config for this workspace; the receptionist answers again within a minute of the fix.",
    ],
    reply: (p) =>
      letter(
        p,
        "I'm repairing your settings now; the receptionist answers again within a minute of the fix, and I'll write when it's done.",
      ),
    meanwhile: null,
  },
  // A name the carriers hold (X4-5): the campaign's name is in its filed confirmation, and only a new campaign changes it.
  name: {
    title: "The name the carriers hold",
    subject: "asked to change the name the carriers hold for their texting",
    check: "The workspace's Setup and lines tab: the campaign its line was filed under.",
    steps: () => [
      "They renamed the business in Settings. Their sign-up page and sign say the new name now; the text confirming a START still says the name their campaign was filed under (lines.facts.a2p_campaign_name), and the brand keeps its own (a2p_filed_name).",
      "Reply to confirm the new name is the one customers know them by, and that it is on their business record (its legal or trading name). Then register a new campaign for their line under it -- the carriers vet it again, which takes days -- and retire the old one once the new one is approved.",
    ],
    reply: (p) =>
      letter(
        p,
        `before I file texting under the new name: is "${p.workspace}" the name your customers know you by, and is it on your business record (its legal or trading name)? The carriers check it again, which takes a few days; until then, the text confirming a START says the old name.`,
      ),
    meanwhile: null,
  },
};

/** An ask the playbooks have no page for. */
const ASK_UNKNOWN: AskPlaybook = {
  title: "A setup ask",
  subject: "asked a person for something",
  check: "Their workspace's Setup and lines tab here.",
  steps: () => ["Find out what they need, and do it with them."],
  reply: (p) => letter(p, "thanks for asking; what would you like set up?"),
  meanwhile: null,
};

/** The playbook a row opens: its ask's, or its topic's. */
export function playbookOf(row: { kind: SupportRowKind; topic: SupportTopic; what: string | null }): SupportPlaybook {
  return row.kind === "ask" ? (ASK_PLAYBOOKS[row.what ?? ""] ?? ASK_UNKNOWN) : TOPIC_PLAYBOOKS[row.topic];
}

/** The things a workspace can ask a person for, as the inbox is told them: known, or not. */
export function setupAskMail(what: string): { subject: string; steps: (p: PlaybookFill) => readonly string[] } | null {
  const a = ASK_PLAYBOOKS[what];
  return a ? { subject: a.subject, steps: a.steps } : null;
}

/** What a member reads after sending, for a question's topic: the one line that helps until a person answers. */
export function supportMeanwhile(topic: SupportTopic): string | null {
  return TOPIC_PLAYBOOKS[topic].meanwhile;
}
