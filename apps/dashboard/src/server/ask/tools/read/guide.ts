import "server-only";
import { z } from "zod";
import { ASK_GUIDE_PAGES, type AskProposal } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { connections } from "../../../readers/connections";
import { NO_ACTION, defineRead, offeredTo, unread, type ActTool, type ToolContext } from "../context";
import { propose_call } from "../act/call";
import { propose_deal } from "../act/deal";
import { propose_follow_up } from "../act/follow-up";
import { propose_lead_search } from "../act/lead-search";
import { propose_leads } from "../act/leads";
import { propose_list } from "../act/list";
import { propose_people } from "../act/people";
import { propose_person } from "../act/person";
import { propose_reply } from "../act/reply";
import { propose_review } from "../act/review";
import { propose_sequence } from "../act/sequence";
import { propose_settings } from "../act/settings";
import { propose_thread_verb } from "../act/thread-verb";

/**
 * The product as Ask tells it (the operator, 15 Oct 2026): each page, what it is for, what Ask can do there for this
 * member (every page verb an act tool proposes, by its tool and action, offered to their role), and what stays on the
 * page with why (contracts ASK_GUIDE_PAGES, which the parity test holds to the verb table); then what Setup says the
 * workspace has and lacks, and what each missing piece stops. For "what can you do?", "where do I...?", and a new owner.
 */

/** The act tools a guide names: the page verbs Ask proposes, each by "tool with action". */
const ACT_TOOLS: readonly ActTool[] = [
  propose_reply,
  propose_thread_verb,
  propose_call,
  propose_person,
  propose_people,
  propose_list,
  propose_deal,
  propose_settings,
  propose_lead_search,
  propose_leads,
  propose_sequence,
  propose_review,
  propose_follow_up,
];

/** How a member asks for a kind of card: "tool with action", each that makes it and is offered to their role. */
function askedFor(t: ToolContext): Map<AskProposal["kind"], string[]> {
  const out = new Map<AskProposal["kind"], string[]>();
  for (const tool of ACT_TOOLS)
    for (const [action, def] of Object.entries(tool.actions)) {
      if (!offeredTo(def, t.role)) continue;
      const said = action === NO_ACTION ? tool.name : `${tool.name} with action ${action}`;
      out.set(def.kind, [...(out.get(def.kind) ?? []), said]);
    }
  return out;
}

async function readGuide(t: ToolContext): Promise<unknown> {
  const asked = askedFor(t);
  const setup = await load(t.rc, connections, undefined).then((r) => r.data.setup, unread(t, "guide", "setup"));
  const missing: string[] = [];
  if (setup) {
    const b = setup.business;
    if (!b.hours) missing.push("Opening hours: the receptionist cannot say when you are open (Settings › Business).");
    if (!b.services) missing.push("Services: the receptionist cannot say what you offer (Settings › Business).");
    if (!b.bookingLink && setup.calendar.state === "none")
      missing.push("A booking link or a calendar: nobody can be booked by the receptionist (Settings › Business).");
    if (!setup.channels.whatsapp.active)
      missing.push(
        "WhatsApp: no customer can write to you there, and no WhatsApp sequence can send (Settings › Connections).",
      );
    if (!setup.channels.voice.active)
      missing.push("A phone line: no call reaches the receptionist (Setup › Your phone).");
    if (setup.email && !setup.email.sending?.mailboxes?.length)
      missing.push("A mailbox to send from: no cold email can go from your own address (Settings › Connections).");
    if (setup.calendar.state === "unavailable")
      missing.push(
        `The calendar cannot be read: ${setup.calendar.problem ?? "its link or its emails stopped"} (Settings › Business).`,
      );
    if (!setup.templates.approved)
      missing.push(
        "No approved WhatsApp message: nothing but a reply can go on WhatsApp (sequences with action messages).",
      );
  }
  return {
    route: "today",
    pages: ASK_GUIDE_PAGES.map((p) => ({
      page: p.page,
      route: p.route,
      for: p.for,
      ask_can: [...new Set(p.verbs.flatMap((k) => asked.get(k) ?? []))],
      on_the_page_only: p.pageOnly.map((x) => `${x.what}: ${x.why}`),
    })),
    setup: setup
      ? {
          business: setup.business.name,
          missing,
          consent: { yes_to_messages: setup.consent.yes, yes_to_offers: setup.consent.offersSaidYes },
        }
      : { error: "Setup could not be read just now" },
    note: 'Answer "what can you do" from ask_can in plain words, a few examples a page; a missing piece is said with what it stops and where it is fixed, and a sign-in is the page\'s (open it), never yours.',
  };
}

export const guideTool = defineRead({
  name: "guide",
  description:
    "How Chanlytics works, page by page, for this member: what each page is for, what you can do there for them by card (tool and action), what stays on the page and why, and what Setup says is missing and what each missing piece stops. Read it when they ask what you can do, where something is, or how to start; for a new owner, before anything else. It takes nothing and changes nothing.",
  input: z.object({}),
  label: "Reading how it works",
  run: readGuide,
});
