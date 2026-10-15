/**
 * The assistant's tool registry (the Phase 3 plan): one definition per tool, the schema the model is shown generated
 * from its zod, the input parsed by that zod before the handler runs, dispatch a map.
 *
 * PR 3.1 moved twenty-six tools here (their names, order and schemas frozen in fixtures/ask-tools-0c136563.json); PR
 * 3.4 consolidated them to nineteen (D11), sorted by name, each read family under an `action` and each act by its card
 * family, and offered each role the acts whose card it may approve (D12). PR 4.3 (the Phase 4 plan, D2) offers each role
 * the ACTIONS it may use, each tool built per role from them; PR 4.6 gave propose_person a note and a person's details
 * beside its mode, an operator's two beside an owner's one; PR 4.5 gave inbox its search; PR 4.7 added propose_list,
 * an operator's (twenty for an owner), gave propose_campaign a waiting run's approval (run), and made
 * propose_thread_verb's words true for every role; 9 Oct 2026 gave propose_campaign a change in place (change), 10 Oct
 * 2026 a new message written for the Library (message) and 11 Oct 2026 an offer or a whole setup made into its cards
 * (plan), and 11 Oct 2026 gave a list's rule a missed visit (missed_visit, decision 0002); 13 Oct 2026 the connections action
 * names the mailboxes a business connected in place of its sending domains (decision 0056), and propose_lead_search
 * proposes named people at companies too (the people card, 00430). What the model is sent is frozen per role in
 * fixtures/ask-tools-4-7.json, and every other tool reads to every role as fixtures/ask-tools-4-6.json froze it (which
 * PR 4.6 and PR 4.5 held to fixtures/ask-tools-4-3.json, and PR 4.3 to PR 3.4's, for the tools each did not change --
 * inbox too, less its search); the rest is held as structure: the order, the four prefixes, the flattened
 * schema of a tool with actions, each action's fields the old tool's (read against the 3.1 fixture through
 * tooling/evals/tool-names.json), the words each description owes, the examples, and the parse, proven by running the
 * registry over the database in memory and watching what reached it. That every action answers what its old tool
 * answered is ask-tool-names.test.mjs. No source text is read here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const {
  toApiTools,
  ACT_TOOL_NAMES,
  READ_DEFS,
  ACT_DEFS,
  toolSchema,
  runTool,
  buildProposal,
  toolLabel,
  calledName,
  newToolContext,
} = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { MOMENT_TRIGGERS, MOMENTS_RETIRED, PLAYBOOK_VETO_DELAY_WORDS, PROPOSAL_SPECS, roleAtLeast, startersForTrigger } =
  await import("@chanlytics/contracts");
/**
 * 2 Oct 2026: the two moments no longer offered for a new playbook (contracts MOMENTS_RETIRED) leave the playbook's
 * trigger enum; 11 Oct 2026 (D2 of the marketing manager's spec): the two appointment moments join it, the reminder the
 * day before and the check after, proposed where a calendar is connected (the handler judges that per workspace, as the
 * route does). So a schema frozen before is held to its own less those two and with these two, in the moments' order:
 * the one change to its fields.
 */
const asProposableNow = (schema) => {
  const out = structuredClone(schema);
  const t = out.properties.trigger;
  if (t)
    t.enum = MOMENT_TRIGGERS.filter(
      (m) => (t.enum.includes(m.id) || m.kind === "visit") && !(m.id in MOMENTS_RETIRED),
    ).map((m) => m.id);
  return out;
};

/**
 * 3 Oct 2026 (review item 11, Ask names channels): a broadcast and a playbook take the channels they may go by, one
 * optional property on each, which no schema frozen before it holds: the one change to their fields. A property, not a
 * tool, so the strict-tools cap (twenty) is untouched.
 */
const CHANNELS = { type: "array", items: { type: "string", enum: ["whatsapp", "sms", "email"] } };
/**
 * Less what an action gained since: its channels (3 Oct 2026), and, a new playbook's, its last day (`until`, 11 Oct 2026:
 * Ask's plan ends an offer's campaign with the offer), one optional day the change action already took in that shape,
 * and the moment's starter to file at Approve (`starter`, 12 Oct 2026: the day after's review ask, named by its key).
 */
/**
 * 13 Oct 2026 (the people card, 00430): the lead search proposes named people at companies too. Its places fields are
 * optional (a people ask names none of them; the places schema still refuses a places ask without them), it takes how
 * senior, the industries and the sizes, and looking_for names the people card. Less those, its fields are the 3.1 tool's.
 */
const asPlacesThen = (schema) => {
  const out = structuredClone(schema);
  for (const k of ["seniority", "industries", "company_sizes"]) delete out.properties[k];
  out.properties.looking_for.enum = out.properties.looking_for.enum.filter((v) => v !== "people_at_companies");
  out.required = [
    "looking_for",
    "country",
    "count",
    "who",
    "who_one",
    "category_key",
    "terms",
    "region",
    "contact",
    "criteria",
    "asked",
  ];
  return out;
};
const lessChannels = (schema) => {
  const out = structuredClone(schema);
  delete out.properties.channels;
  delete out.properties.until;
  delete out.properties.starter;
  return out;
};
/**
 * A new playbook's `starter` (12 Oct 2026): one optional key among the starters of the moments it may be proposed on,
 * none the set replaced, in the moments' order.
 */
const STARTER = {
  type: "string",
  enum: [
    ...new Set(
      MOMENT_TRIGGERS.filter((m) => !(m.id in MOMENTS_RETIRED)).flatMap((m) =>
        startersForTrigger(m.id).flatMap((s) => (s.retired ? [] : [s.key])),
      ),
    ),
  ],
};

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures", name), "utf8"));
/** What the model is sent, per role, frozen from the finished registry. */
const FROZEN = fixture("ask-tools-4-7.json");
/** What PR 4.6 and PR 4.5 sent, per role: every tool PR 4.7 did not change reads the same. */
const TODAY = fixture("ask-tools-4-6.json");
/** What PR 4.3 sent, per role: inbox reads the same less the search PR 4.5 gave it. */
const PR_4_3 = fixture("ask-tools-4-3.json");
/**
 * The tools PR 4.7 changed, on purpose: propose_list is new; propose_campaign gained action run (its description, tail,
 * schema and examples); propose_thread_verb no longer points every role to a person's mode, which only an owner is
 * offered since PR 4.6. people since 12 Oct 2026 names one list as the Inbox words it (HELD_LIST_WORDS). today since
 * 13 Oct 2026 says the one count's parts (the holds, the replies on their way, the runs waiting that can still be approved
 * or whose check holds emails for your say, the searches waiting), and campaigns a run too late to approve (the wiring's second audit, S7-1, W-thread-wait-step-4).
 */
const CHANGED = [
  "calendar",
  "campaigns",
  "people",
  "propose_autonomy",
  "propose_campaign",
  // 13 Oct 2026: named people at companies too (the people card, 00430): its own sentence, and its fields (asPlacesThen).
  "propose_lead_search",
  "propose_list",
  "propose_settings",
  "propose_thread_verb",
  "report",
  "today",
];
/**
 * 6 Oct 2026 (decision 0030, a campaign counted by its channel): report says the Campaigns lens beside the Deals
 * section, and campaigns says a run's channels and that its read is a share of what went by WhatsApp. The one sentence
 * each, and nothing else either says. 11 Oct 2026 (Reports, the Campaigns lens, C4 T16): report says the lens as the page
 * does, from the one fold (toCampaignLensVM), so its sentence names the new shape (the people sent to, the window's mixes,
 * what is stuck now) in the old one's place; it still ends with the words the next sentence follows.
 */
const REPORT_CAMPAIGNS_WORDS =
  "the Deals section where deals are on, and the Campaigns lens, as the page says it: head is its sentence; figures are the people sent to, the share of the messages delivered, the share of those people who wrote back, and the yeses and stops after a campaign, each against the period before; funnel is what was sent, delivered, read (WhatsApp's alone) and answered, counted in messages (a person sent three is three messages here and one in figures); by_channel is the same by channel where more than one sent (read is a share of what went by WhatsApp alone: a text or an email keeps no read receipt); sources are the five that sent the most; window is the period's, from the database's ledger: held (who was held back, and why), runs_stopped (the runs that failed or were canceled), failed_sends (why sends failed after they left), by_message (who wrote back to each message), send_to_first_reply (how soon the first reply came) and wait_for_your_ok (how long approvals waited); stuck is what is stuck now, whatever period is picked: the runs waiting for your OK, the failed runs, the replies waiting on you, the messages Meta stopped and your WhatsApp number; a share is said only of five or more and a count under that, and a mix with nothing to draw says the page's words in empty; window is null where the database does not keep the ledger yet and stuck where it does not keep what is stuck, each with an error beside it where its read failed, and a part of window the database did not count is null too; campaigns says error where its numbers could not be read.";
/**
 * 7 Oct 2026 (Reports phase C, lens 1, T4): report says the Reviews lens after the Campaigns lens: the one sentence, and
 * nothing else it says moved.
 */
const REPORT_REVIEWS_WORDS =
  "campaigns says error where its numbers could not be read. The Reviews lens is in reviews: the sentence at its head and its figures as the page says them (the rating, the count, the reviews written against the period before) and, where the owner's Business Profile is connected, how many were answered and how fast, the mix of stars, and how many wait for a reply (held is how many of the oldest waiting hold a reply the receptionist wrote and did not post); reviews says linked false where no Google listing is linked, and error where its numbers could not be read. Call it for";
/**
 * 9 Oct 2026 (a moment holds many campaigns, lane 2, task 6): report says the Reach-outs section after the Reviews lens,
 * through the page's own reader: the one sentence, and nothing else it says moved. 11 Oct 2026 (Reports, the Campaigns lens,
 * C4 T16): and says it in businesses, as the page's new fold does (toReachOutLensVM): the sentence is replaced whole.
 */
const REPORT_REACH_OUTS_WORDS =
  "reviews says linked false where no Google listing is linked, and error where its numbers could not be read. The Reach-outs section is in reach_outs, as the page says it: strip is the emails the reach-outs wrote, the share that landed and the number that bounced, each against the period before; emails is what was written, delivered and bounced, counted in emails; businesses is the businesses written to and how many wrote back, were interested, booked or said no, counted in businesses as they stand now (each counts once, at the last email that wrote to it, and an outcome is set against nothing before); angles is who wrote back, as they stand now, by the opening of the last email; handed is the line on the businesses handed to the owner, null where none were, and empty says nothing was written; reach_outs is null where the workspace has no reach-out, and error where its numbers could not be read. Call it for";
/**
 * 10 Oct 2026 (Reports, the Receptionist lens, C2 T13): report says the Receptionist lens after the Reach-outs section: the
 * one sentence, and nothing else it says moved. It opens with the end of the Reach-outs sentence it follows, which it
 * replaces whole.
 */
const REPORT_RECEPTIONIST_WORDS =
  "reach_outs is null where the workspace has no reach-out, and error where its numbers could not be read. The Receptionist lens is in receptionist, as the page says it: what became of the replies held before they went out (hold), what customers asked about (topics), the languages the receptionist wrote in where it wrote in more than one, how the calls someone spoke on ended, the booking link and how many of the people it went to have booked since (link), your first reply after a handover and the time to settle one (handover), the missed calls answered within an hour (missed), what came while the business was closed and how many of those the receptionist answered (closed), and what is stuck now (stuck: who waits on you, call-backs, the replies held back), with held_back giving the reasons the send door refused a reply; receptionist says available false where the database does not keep these numbers yet, and error where they could not be read.";
/**
 * 10 Oct 2026 (Reports, the People lens, C3 T13): report says the People lens after the Receptionist lens: the one
 * sentence, and nothing else it says moved. It opens with the end of the Receptionist sentence it follows, which it
 * replaces whole.
 */
const REPORT_PEOPLE_WORDS =
  "receptionist says available false where the database does not keep these numbers yet, and error where they could not be read. The People lens is in people, as the page says it: head is its sentence; window is the period, counted in people (one who wrote ten times is one): reached (who reached you, how many were new, the yeses won and the stops, each against the period before), channels (how they reached you), first_came (how the new ones first came), yeses and stops (who gave them), steps_done (the steps finished and how many on their day) and email_stopped (the addresses that stopped working); book is everyone as they stand now, whatever period is picked: wires (the ways they reach you), fresh (how long since they last wrote or called, with quiet saying how many have been quiet over 30 days), stuck (the steps overdue and due today, and the email that stopped working) and stand (how many said yes to messages, can receive offers, opted out or are quiet); a mix with nothing to draw says the page's words in empty; people says window null where the database does not keep the period's numbers yet, book null where the people could not be counted, available false where neither could be read, and error where they could not be read.";
const RUN_CHANNEL_WORDS = [
  "how many were sent, the share of those delivered and read, and how many replied,",
  "how many were sent (sent_by_channel, where it went by more than one), the share of those delivered, the share of those sent by WhatsApp that were read (a text or an email keeps no read receipt), and how many replied,",
];
/**
 * 8 Oct 2026 (Campaigns, one name per thing): a run waiting on its owner says one phrase in what the tool answers, since
 * 11 Oct 2026 "Waiting for your approval" (contracts BROADCAST_STATE_LABELS), so the sentence that tells the model which state that is says the same words. It
 * said the Inbox's "Needs you" over an answer that no longer did. The one phrase, once.
 */
const RUN_WAITING_WORDS = ["is Needs you, with waiting_on_you", "is Waiting for your approval, with waiting_on_you"];
/**
 * 13 Oct 2026 (the wiring's second audit, S7-3): a run whose day has passed waits on nobody (contracts runWaitsOnYou), so the
 * listing marks it too_late_to_approve in place of waiting_on_you, and the sentence that names the state says so. Once.
 */
const TOO_LATE_WORDS = [
  "is Waiting for your approval, with waiting_on_you)",
  "is Waiting for your approval, with waiting_on_you; a run whose day has passed is too_late_to_approve: it can only be skipped, and the hourly sweep skips it itself)",
];
/**
 * 12 Oct 2026 (D1-hold-words): People's list of the threads the member looking has is worded as the Inbox words them,
 * "You have it", so the people tool names that list in the same words; its id, waiting_on_you, stays. The one phrase, once.
 */
const HELD_LIST_WORDS = ["waiting_on_you (Waiting on you)", "waiting_on_you (You have it)"];
/**
 * 15 Oct 2026 (the wiring's last two links: Ask cites a visit and a review): calendar's week names each visit's id, people
 * names a person's next and last visits' ids, and report the reviews waiting and the newest with theirs. The rules say
 * how each is cited (prompt.ts); nothing else any of the three says moved.
 */
const VISIT_ID_WORDS = [
  "with the person in People when the title names one), whether",
  "with the person in People when the title names one, and its visit_id), whether",
];
const PERSON_VISIT_IDS_WORDS = [
  "their conversations and calls with ids, their timeline,",
  "their conversations and calls with ids, their next and last appointments' ids, their timeline,",
];
const REVIEW_ROWS_WORDS = [
  "hold a reply the receptionist wrote and did not post);",
  "hold a reply the receptionist wrote and did not post), the oldest five waiting in rows and the newest five in latest, each with its id;",
];
/**
 * 8 Oct 2026 (Ask names channels, the review of that day): each playbook the listing gives says the channels it goes by
 * now, since propose_campaign with action channels asks for all of them, and the model was told to read them from an
 * answer that did not hold them. The one phrase, once.
 */
const PLAYBOOK_CHANNELS_WORDS = [
  "its message (template), its clock and next run,",
  "its message (template), the channels it goes by now (channels), its clock and next run,",
];
/**
 * 10 Oct 2026 (the final review of "a moment holds many campaigns"): a broadcast row's `by` says "a campaign" where it
 * said "a playbook" (a person reads "campaign", decision 19, and the model repeats the row), so the sentence that names
 * the field says the same word. The one phrase, once.
 */
const BROADCAST_BY_WORDS = ["whether a playbook or a person sent it", "whether a campaign or a person sent it"];
/**
 * 11 Oct 2026 (a one-off send honours the breath, fix round 3): the week's breath counts a message within a week either
 * side, one due included, so the tail says a playbook's people "hear from you within a week of today" where it said they
 * "heard from a broadcast this week". The one phrase, once.
 */
const BREATH_TAIL_WORDS = [
  "or heard from a broadcast this week: say so the same way.",
  "or hear from you within a week of today: say so the same way.",
];
/**
 * 12 Oct 2026 (Ask as the marketing manager, the review after the merge): each playbook says a next run only where it
 * runs, why it runs nothing, the day an ended one ended (its state may still read running: one that ended while paused
 * reads paused) and the last day ahead of one, and the mode its runs go under now, auto reading veto while on trial
 * (effectiveMode turns auto alone), where it said the mode its class runs under. The one phrase, once. 14 Oct 2026 (the
 * wiring's second audit, R13 X5-7): its state is the home's words (lifecycleStateOf), so it no longer says it may read
 * running, nor "whether it is running" beside it.
 */
const PLAYBOOK_END_TRIAL_WORDS = [
  "its clock and next run, whether it is running, the autonomy mode its class runs under,",
  "its clock and next run (next_run, null where it runs nothing here: runs_nothing says why, and ended the day one ended), its last day ahead (ends), its state in the home's words (state: 'Paused', 'Ended Oct 1', 'On · Daily 10:00 AM', a run waiting first), the mode its runs go under now (mode: its class's, but auto reads veto while on trial until on_trial_until),",
];
/**
 * 14 Oct 2026 (the wiring's second audit, R13 X5-2): inbox's needs_you is what waits on you as the Inbox counts it, a hold
 * nobody has taken or a reply counting down that can still be stopped, where it said a thread handed to a person. The one
 * phrase, once; ask-tools-4-6.json and -4-7.json say it as sent.
 */
const NEEDS_YOU_LIST_WORDS = [
  "needs_you (handed to a person)",
  "needs_you (what waits on you, as the Inbox counts it: a hold nobody has taken, or a reply counting down that can still be stopped)",
];
/**
 * 12 Oct 2026 (the same review): how full the book is is action room's to say, so the calendar's tail sends a question
 * of room for an offer there, beside openings. The one phrase, once.
 */
const ROOM_TAIL_WORDS = [
  "who is booked when, and action openings for when there is room or what is free on a day, the free slots alone, sized to a service.",
  "who is booked when, action openings for when there is room or what is free on a day, the free slots alone, sized to a service, and action room for how full the book is over the next fourteen days, to pace an offer.",
];
/** 9 Oct 2026 (the moment spec, A6, D35): each playbook says its last 30 days, where it said what its runs earned. */
const PLAYBOOK_RESULTS_WORDS = [
  "its list when it runs on one, what its runs earned,",
  "its list when it runs on one, what it sent and how many replied over the last 30 days (last_30_days, null where that could not be read),",
];
/**
 * 7 Oct 2026 (lane 1, T11): campaigns says a message where it said an approved WhatsApp template, and says what its
 * audiences listing gives of each: the `channels` a version of it can be sent on now. The four sentences that moved, each
 * once (the listing's, the playbooks', the playbooks' starter, the tail's), and nothing else it says. And (the lane's
 * review): the listing's four counts are said to be by WhatsApp, a message held on email or text is proposed with the
 * channels its `channels` name and its card counts them, and the tail quotes a zero only for a message that goes by
 * WhatsApp. Three more sentences, each once, said over the words above.
 */
const MESSAGE_WORDS = [
  [
    "It also lists the approved WhatsApp templates with their category, values and body, why the rest cannot be sent, and whether the number may send and its daily limit,",
    "It also lists, under templates, the messages a broadcast may be made on, each with its template_id (any of its versions' ids names the message), category, channels (true for each of whatsapp, email and sms it can be sent on now), values and body, why a WhatsApp version this product cannot send whole is left out (cannot_send), and whether the number may send and its daily limit,",
  ],
  [
    "standing rules that each send one approved template to newly eligible people who said yes: each with what starts it, its template, its clock",
    "standing rules that each send one message to newly eligible people who said yes: each with what starts it, its message (template), its clock",
  ],
  ["and each one's starter template.", "and each one's starter message (starter_template)."],
  [
    "Pick the template first, then quote its can_be_sent count as who the broadcast reaches",
    "Pick the message first, then quote its can_be_sent count as who the broadcast reaches",
  ],
  [
    "four counts, because there are two consents and a yes needs a number to send to: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, template reaches) and",
    "four counts, all by WhatsApp, because there are two consents and a yes needs a number to send to: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, template reaches on WhatsApp) and",
  ],
  [
    "channels (true for each of whatsapp, email and sms it can be sent on now),",
    "channels (true for each of whatsapp, email and sms it can be sent on now; a message that holds email or sms is proposed with channels naming them, and its card then counts the people those channels reach, so a 0 in the four counts above does not mean nobody can be reached),",
  ],
  [
    "never a larger one; when that count is 0 and its said_yes is not, the ones who said yes have no number to send to: say so, and never send the owner to get a yes they already have.",
    "never a larger one, for a message that goes by WhatsApp; for a message whose channels hold email or sms, propose it with channels naming them and quote the card's count, since the can_be_sent counts are by WhatsApp alone and a 0 there does not mean nobody can be reached; when a WhatsApp message's count is 0 and its said_yes is not, and its channels hold no other, the ones who said yes have no number to send to: say so, and never send the owner to get a yes they already have.",
  ],
];
/**
 * 10 Oct 2026 (Ask, the marketing manager): the actions the lane gave a read tool, each taking nothing more, by tool in
 * the order added. campaigns, after broadcast: messages, the library whole, a version in review included (task 3); and
 * journey, the journey as Campaigns' home draws it, with the guide (task 4). calendar, after openings: room, how full the
 * book is over the next fourteen days (task 5). On each tool their words stand between its last action's and the tail,
 * their names close the enum and their one example each closes the examples, and nothing else it says, takes or shows
 * moved.
 */
const LANE_ACTIONS = { calendar: ["room"], campaigns: ["messages", "journey", "sequences", "sequence"] };
/**
 * 9 Oct 2026 (the moment spec, A7): propose_autonomy is judged by the Autonomy page's rule (policyModeRefusal), so its
 * words say each class takes the modes its row offers, where they said veto is for replies only. The one sentence.
 */
const AUTONOMY_MODES_WORDS = [
  "veto is for replies only.",
  `Each class takes the modes its row on the Autonomy page offers (veto holds a reply, or a campaign's run for ${PLAYBOOK_VETO_DELAY_WORDS}, so a person can stop it), and a mode a class does not take is refused in that page's words.`,
];
/**
 * 11 Oct 2026 (Task 13, a note ends): propose_settings' add_note takes the until add_closure already took, a note's last
 * day, and its words say so. The one clause; the flat shape the model is shown held `until` already.
 */
const NOTE_UNTIL_WORDS = [
  "add_note (a title and the text the receptionist reads)",
  "add_note (a title, the text the receptionist reads, and an optional until, its last day)",
];
/**
 * What the report tool's description gained after PR 4.7 (the Reports fix wave, spec D14): its median and p90 reply time
 * include the hold the owner set, and reply_time.hold splits the replies against it. Nothing else of it moved.
 */
const REPORT_HOLD_WORDS =
  "(both include the hold the owner set before a reply goes out; reply_time.hold splits the replies against it: with no hold, as the hold ended, or later, and the most any took past it)";
/** The tool PR 4.5 gave an action, search: that action's words, fields and example are all that moved in it. */
const SEARCHED = "inbox";
/**
 * The one place an operator's tool names a role: propose_thread_verb says whose a person's treatment is to set -- an
 * owner's, as person_mode's spec needs -- so a role not offered propose_person's mode can say who can (PR 4.7).
 */
const THREAD_POINTER = "how the receptionist treats one person is an owner's to set (propose_person with action mode)";
/** The actions added since the rename (the Phase 4 plan, D1): no old tool was any of them. The eval's one list of them. */
const { ADDED_SINCE: PHASE_4 } = await import(at("tooling/evals/rename-ask-tools.mjs"));
/** The twenty-six tools as PR 3.1 froze them: each action's own fields are its old tool's. */
const OLD = fixture("ask-tools-0c136563.json").operator;
/** The rename, old name -> `name.action`: the one table (D13). */
const NAMES = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/evals/tool-names.json"), "utf8"));

const ROLES = ["viewer", "operator", "partner", "owner"];
/** Every definition, by name: the reads and the acts. */
const DEFS = new Map([...READ_DEFS, ...ACT_DEFS].map((d) => [d.name, d]));
/** A tool's actions, as the model names them; a tool with no action has none. */
const actionsOf = (name) => Object.keys(DEFS.get(name).actions).filter((a) => a !== "");

/** A schema without its per-property descriptions: the shape the 3.1 fixture froze, whatever words a property gains. */
const shapeOf = (node) => {
  if (Array.isArray(node)) return node.map(shapeOf);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "description") continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v).map(([p, s]) => [p, shapeOf(s)])) : shapeOf(v);
  }
  return out;
};
/** Sentence ends: a full stop, a question mark or an exclamation mark followed by a space or the end. */
const sentences = (s) => (s.match(/[.!?](\s|$)/g) ?? []).length;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const NOW = new Date("2026-09-14T14:00:00Z");
/** A context over an empty workspace in memory: what a tool reads is in `supabase.seen`. */
const contextFor = (role = "operator") => {
  const supabase = fakeDb({ contacts: [], conversations: [], templates: [] }, {}, {});
  return {
    supabase,
    t: newToolContext(
      { supabase, userId: "u1", email: "ada@example.com", params: {} },
      A,
      role,
      "America/New_York",
      NOW,
    ),
  };
};

const READS = ["calendar", "calls", "campaigns", "inbox", "leads", "people", "report", "today", "workspace"];
/** Each role's tools, sorted by name (D11), the acts a role may approve among the reads (D12, amended for the partner). */
const OFFERED = {
  viewer: READS,
  operator: [
    ...READS.slice(0, 6),
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_list",
    "propose_person",
    "propose_reply",
    "propose_thread_verb",
    "propose_whisper",
    ...READS.slice(6),
  ],
  partner: [
    ...READS.slice(0, 6),
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_lead_search",
    "propose_list",
    "propose_person",
    "propose_reply",
    "propose_settings",
    "propose_thread_verb",
    "propose_whisper",
    ...READS.slice(6),
  ],
  owner: [
    ...READS.slice(0, 6),
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_lead_search",
    "propose_list",
    "propose_person",
    "propose_reply",
    "propose_settings",
    "propose_team",
    "propose_thread_verb",
    "propose_whisper",
    ...READS.slice(6),
  ],
};

test("each role is offered its tools, sorted by name, the same bytes every build and the bytes the fixture froze: a viewer the nine reads, an operator eight acts more, a partner the settings and the lead search too, an owner all twenty", () => {
  for (const role of ROLES) {
    const tools = toApiTools(role, true);
    assert.deepEqual(
      tools.map((t) => t.name),
      OFFERED[role],
      `${role}: the names, in order`,
    );
    assert.deepEqual(
      tools.map((t) => t.name),
      [...tools.map((t) => t.name)].sort(),
      `${role}: sorted by name, the acts among the reads`,
    );
    assert.equal(JSON.stringify(tools), JSON.stringify(toApiTools(role, true)), `${role}: built twice, one prefix`);
    assert.deepEqual(tools, FROZEN[role], `${role}: what the model is sent, frozen`);
    assert.deepEqual(
      toApiTools(role, false),
      tools.map(({ input_examples: _, ...t }) => t),
      `${role}: without examples, the same tools less their examples`,
    );
  }
  for (const role of ROLES) assert.ok(toApiTools(role, true).length <= 20, `${role}: at most the documented twenty`);
  assert.deepEqual(
    ROLES.map((role) => toApiTools(role, true).length),
    [9, 17, 19, 20],
    "a viewer nine, an operator seventeen, a partner nineteen, an owner twenty (the Phase 4 plan, D1)",
  );
  assert.deepEqual(
    [...ACT_TOOL_NAMES].sort(),
    OFFERED.owner.filter((n) => !READS.includes(n)),
    "the act names the loop tells apart",
  );
  // A role that stands lower is offered no tool a higher one is not.
  for (let i = 1; i < ROLES.length; i++)
    for (const t of toApiTools(ROLES[i - 1], true))
      assert.ok(OFFERED[ROLES[i]].includes(t.name), `${t.name}: offered to ${ROLES[i - 1]}, so to ${ROLES[i]}`);
});

/** The least role an action may be used by (D2): a read's own needs, or every member; an act's, its card's. */
const needsOf = (def) => ("kind" in def ? PROPOSAL_SPECS[def.kind].needs : (def.needs ?? "viewer"));
/** The actions of a tool a role may use, in the tool's order; a tool with no action, its one, under "". */
const usable = (name, role) =>
  Object.entries(DEFS.get(name).actions)
    .filter(([, def]) => roleAtLeast(role, needsOf(def)))
    .map(([a]) => a);

test("every role is offered exactly the actions it may use (D2): a tool with none is not offered; one with some is built from them alone -- its action enum, its fields, its examples and its description, which says each of them and names no other", () => {
  for (const role of ROLES) {
    const tools = toApiTools(role, true);
    for (const [name, d] of DEFS) {
      const own = usable(name, role);
      const t = tools.find((x) => x.name === name);
      assert.equal(!!t, own.length > 0, `${name} to ${role}: offered exactly when an action is its`);
      if (!t || !actionsOf(name).length) continue;
      assert.deepEqual(t.input_schema.properties.action.enum, own, `${role} ${name}: its actions, in the tool's order`);
      assert.deepEqual(
        Object.keys(t.input_schema.properties),
        ["action", ...new Set(own.flatMap((a) => Object.keys(d.actions[a].input.shape)))],
        `${role} ${name}: its actions' fields, once each, and no other`,
      );
      assert.ok(
        (t.input_examples ?? []).every((ex) => own.includes(ex.action)),
        `${role} ${name}: examples of its actions alone`,
      );
      assert.equal(
        t.description,
        [d.description, ...own.map((a) => d.actions[a].words), d.tail].filter(Boolean).join(" "),
        `${role} ${name}: the tool's words, its actions' in order, the tail`,
      );
      for (const a of actionsOf(name))
        assert.equal(
          new RegExp(`\\baction ${a}\\b`, "i").test(t.description),
          own.includes(a),
          `${role} ${name}: the description names action ${a} only when it is offered`,
        );
    }
  }
  // Every action has its own words, and a role that stands lower is offered no action a higher one is not.
  for (const [name, d] of DEFS)
    for (const a of actionsOf(name)) assert.ok(d.actions[a].words, `${name}.${a}: its own words`);
  for (let i = 1; i < ROLES.length; i++)
    for (const name of DEFS.keys())
      for (const a of usable(name, ROLES[i - 1]))
        assert.ok(usable(name, ROLES[i]).includes(a), `${name}.${a}: ${ROLES[i - 1]}'s, so ${ROLES[i]}'s`);
});

test("the invariant (PR 4.7): every tool but propose_list, propose_campaign, propose_thread_verb, propose_autonomy (the modes a class takes), propose_settings (a note's last day), report (its reply times say the hold, and it says the Campaigns lens, the Reviews lens, the Receptionist lens and the People lens), campaigns (a run's channels, a message where it said a template, the library whole and the journey), calendar (the room in the book), people (a list in the Inbox's words) and today (the one count's parts) reads to every role byte for byte as PR 4.6 and PR 4.5 sent it -- per tool, per role, with its examples and without -- and every tool they offered a role is offered it still", () => {
  const bare = ({ input_examples: _, ...t }) => t;
  for (const role of ROLES) {
    const was = new Map(TODAY[role].map((t) => [t.name, t]));
    for (const examples of [true, false])
      for (const t of toApiTools(role, examples)) {
        if (CHANGED.includes(t.name)) continue;
        const then = examples ? was.get(t.name) : bare(was.get(t.name));
        assert.equal(JSON.stringify(t), JSON.stringify(then), `${role} ${t.name}: PR 4.6's and PR 4.5's bytes`);
      }
    for (const name of was.keys())
      assert.ok(
        toApiTools(role, true).some((t) => t.name === name),
        `${role} ${name}: still offered`,
      );
  }
  // What moved, and to whom: propose_list reaches every role that may approve its card, an operator and above;
  // propose_campaign's run reaches every role its broadcast and its playbook reach; propose_thread_verb says one
  // sentence less.
  const gained = (role) =>
    toApiTools(role, true)
      .map((t) => t.name)
      .filter((n) => !TODAY[role].some((t) => t.name === n));
  assert.deepEqual(ROLES.map(gained), [[], ["propose_list"], ["propose_list"], ["propose_list"]]);
  const tool = (role, name) => toApiTools(role, true).find((t) => t.name === name);
  assert.deepEqual(
    ROLES.map((role) => tool(role, "propose_campaign")?.input_schema.properties.action.enum ?? null),
    // 8 Oct 2026: and its channels, the channels a playbook that exists goes by, to every role its playbook reaches; 9
    // Oct 2026: and its change, a playbook that exists paused, resumed, renamed or retimed, to the same roles; 10 Oct
    // 2026: and its message, a new message written for the Library, to the same roles; 11 Oct 2026: and its plan, an
    // offer or a whole setup made into its cards, to the same roles; 13 Oct 2026: and its leads, leads added to a
    // reach-out fed by a list (00426), to the same roles; 15 Oct 2026: and its sequence, a sequence's steps changed by
    // its page's own verbs (decision 0060), to the same roles.
    [
      null,
      ["broadcast", "playbook", "run", "channels", "change", "message", "plan", "leads", "sequence"],
      ["broadcast", "playbook", "run", "channels", "change", "message", "plan", "leads", "sequence"],
      ["broadcast", "playbook", "run", "channels", "change", "message", "plan", "leads", "sequence"],
    ],
  );
  const was = (role, name) => TODAY[role].find((t) => t.name === name);
  const words = ({ description: _, ...rest }) => rest;
  /**
   * A tool the lane gave actions (LANE_ACTIONS), to one role: what it said before, `said`, with their words before its
   * tail; their names closing its enum and their one example each closing its examples; and, less those, what it takes
   * and shows PR 4.6's and PR 4.5's.
   */
  const laneAdded = (role, name, said) => {
    const d = DEFS.get(name);
    const lane = LANE_ACTIONS[name];
    const added = lane.map((a) => d.actions[a].words).join(" ");
    assert.equal(tool(role, name).description, said.replace(` ${d.tail}`, ` ${added} ${d.tail}`), `${role} ${name}`);
    const now = words(tool(role, name));
    const n = lane.length;
    assert.deepEqual(now.input_schema.properties.action.enum.slice(-n), lane, `${role} ${name}: the lane's, last`);
    assert.deepEqual(
      now.input_examples.slice(-n),
      lane.map((action) => ({ action, ...d.actions[action].examples[0] })),
      `${role} ${name}: their one example each, last`,
    );
    // A field only the lane's actions take (15 Oct 2026: campaigns.sequence's sequence_id) is theirs, and leaves with them.
    const before = words(was(role, name)).input_schema.properties;
    const theirs = new Set(lane.flatMap((a) => Object.keys(d.actions[a].input.shape)).filter((f) => !(f in before)));
    const kept = Object.fromEntries(Object.entries(now.input_schema.properties).filter(([f]) => !theirs.has(f)));
    assert.deepEqual(
      {
        ...now,
        input_schema: {
          ...now.input_schema,
          properties: {
            ...kept,
            action: { type: "string", enum: now.input_schema.properties.action.enum.slice(0, -n) },
          },
        },
        input_examples: now.input_examples.slice(0, -n),
      },
      words(was(role, name)),
      `${role} ${name}`,
    );
  };
  // report (spec D14): the sentence about the reply times says the hold is in them, and nothing else it says moved.
  for (const role of ROLES) {
    assert.equal(
      tool(role, "report").description,
      was(role, "report")
        .description.replace("the median and p90 reply time,", `the median and p90 reply time ${REPORT_HOLD_WORDS},`)
        .replace("and the Deals section where deals are on.", REPORT_CAMPAIGNS_WORDS)
        .replace("campaigns says error where its numbers could not be read. Call it for", REPORT_REVIEWS_WORDS)
        .replace(
          "reviews says linked false where no Google listing is linked, and error where its numbers could not be read. Call it for",
          REPORT_REACH_OUTS_WORDS,
        )
        .replace(
          "reach_outs is null where the workspace has no reach-out, and error where its numbers could not be read.",
          REPORT_RECEPTIONIST_WORDS,
        )
        .replace(
          "receptionist says available false where the database does not keep these numbers yet, and error where they could not be read.",
          REPORT_PEOPLE_WORDS,
        )
        .replace(...REVIEW_ROWS_WORDS),
      role,
    );
    assert.deepEqual(words(tool(role, "report")), words(was(role, "report")), role);
    // campaigns (0030): a run's line says its channels and a read WhatsApp's alone; (lane 1, T11): a message, where it said
    // an approved WhatsApp template; (8 Oct 2026) a waiting run's one name, and the channels each playbook goes by; (10
    // Oct 2026) a broadcast sent by a campaign, and the library whole and the journey (LANE_ACTIONS); nothing else it
    // says moved.
    laneAdded(
      role,
      "campaigns",
      MESSAGE_WORDS.reduce(
        (said, [from, to]) => said.replace(from, to),
        was(role, "campaigns")
          .description.replace(...RUN_CHANNEL_WORDS)
          .replace(...RUN_WAITING_WORDS)
          .replace(...TOO_LATE_WORDS),
        // Said over the message words above ("its message (template)"), so after them.
      )
        .replace(...PLAYBOOK_CHANNELS_WORDS)
        .replace(...PLAYBOOK_RESULTS_WORDS)
        .replace(...BROADCAST_BY_WORDS)
        .replace(...BREATH_TAIL_WORDS)
        .replace(...PLAYBOOK_END_TRIAL_WORDS),
    );
    // calendar (10 Oct 2026): the room in the book (LANE_ACTIONS), which its tail names (12 Oct 2026), and nothing else it
    // says moved.
    laneAdded(
      role,
      "calendar",
      was(role, "calendar")
        .description.replace(...ROOM_TAIL_WORDS)
        .replace(...VISIT_ID_WORDS),
    );
    // people (12 Oct 2026): the list of the threads the member looking has says the Inbox's words, and nothing else moved.
    assert.equal(
      tool(role, "people").description,
      was(role, "people")
        .description.replace(...HELD_LIST_WORDS)
        .replace(...PERSON_VISIT_IDS_WORDS),
      role,
    );
    assert.deepEqual(words(tool(role, "people")), words(was(role, "people")), role);
  }
  for (const role of ["operator", "partner", "owner"]) {
    // propose_thread_verb: the sentence that sent every role to an owner's action now says whose it is, which is true for
    // every role, and nothing else moved.
    assert.equal(
      tool(role, "propose_thread_verb").description,
      was(role, "propose_thread_verb").description.replace(
        ", and how the receptionist treats the person is propose_person with action mode.",
        `, and ${THREAD_POINTER}.`,
      ),
      role,
    );
    assert.deepEqual(words(tool(role, "propose_thread_verb")), words(was(role, "propose_thread_verb")), role);
    // propose_autonomy (9 Oct 2026, A7): the sentence on which modes a class takes is the Autonomy page's rule, and
    // nothing else it says, takes or shows moved.
    assert.equal(
      tool(role, "propose_autonomy").description,
      was(role, "propose_autonomy").description.replace(...AUTONOMY_MODES_WORDS),
      role,
    );
    assert.deepEqual(words(tool(role, "propose_autonomy")), words(was(role, "propose_autonomy")), role);
    // propose_settings (11 Oct 2026, Task 13): a note's last day, in the one clause that names add_note's fields, to
    // the roles it was offered (a partner and an owner); nothing else it says, takes or shows moved.
    if (was(role, "propose_settings")) {
      assert.equal(
        tool(role, "propose_settings").description,
        was(role, "propose_settings").description.replace(...NOTE_UNTIL_WORDS),
        role,
      );
      assert.deepEqual(words(tool(role, "propose_settings")), words(was(role, "propose_settings")), role);
    }
    // propose_campaign: what it sent before is now's less the run and less the channels action (8 Oct 2026: its one
    // field of its own, playbook_id, beside the channels the broadcast and the playbook already take) -- the
    // broadcast's and the playbook's own fields and examples, byte for byte -- and the run's own words and the channels
    // action's stand between the playbook's and the tail.
    const before = was(role, "propose_campaign");
    const now = tool(role, "propose_campaign");
    const {
      broadcast_id: _b,
      verb: _v,
      playbook_id: playbookId,
      channels,
      state: _s,
      gap_days: _g,
      cadence_days: _c,
      until: _u,
      trial_until: _t,
      language: _l,
      category: _k,
      versions: _w,
      slots: _o,
      intent: _i,
      offer: _f,
      say: _y,
      stages: _g2,
      starter,
      root_id: rootId,
      lead_ids: leadIds,
      sequence_id: sequenceId,
      step_id: stepId,
      after_days: afterDays,
      only_if: onlyIf,
      remove,
      ...fields
    } = now.input_schema.properties;
    // 15 Oct 2026 (decision 0060): the sequence action's own five fields; its template_id and params are the playbook's,
    // one shape.
    assert.deepEqual(
      [sequenceId, stepId, afterDays, onlyIf, remove].map(shapeOf),
      [
        { type: "string" },
        { type: "string" },
        { type: "number" },
        { type: "array", items: { type: "string" } },
        { type: "boolean" },
      ],
      `${role}: sequence's sequence_id, step_id, after_days, only_if and remove`,
    );
    // 13 Oct 2026 (00426): the leads action's own two fields, the reach-out and the leads it takes, as many as a list holds.
    assert.deepEqual(
      [rootId, leadIds].map(shapeOf),
      [{ type: "string" }, { type: "array", items: { type: "string" }, maxItems: 500, minItems: 1 }],
      `${role}: leads' root_id and lead_ids`,
    );
    // 12 Oct 2026: a new playbook's starter, named by its key, the one field the playbook action gained of its own.
    assert.deepEqual(shapeOf(starter), STARTER, `${role}: the playbook's starter`);
    assert.ok(STARTER.enum.includes("after_visit_review"), "the day after's review ask among them");
    // 11 Oct 2026: the plan action's own four fields (contracts PlanIntent, flat); its language is the message's, one
    // shape; and a new playbook's until is the change's, one shape.
    assert.deepEqual(
      [_i, _y, _g2].map(shapeOf),
      [
        { type: "string", enum: ["offer", "cover_journey"] },
        { type: "string" },
        { type: "array", items: { type: "string", enum: ["first_contact", "before", "after", "proposal", "quiet"] } },
      ],
      `${role}: plan's intent, say and stages`,
    );
    assert.deepEqual(
      Object.keys(shapeOf(_f).properties),
      ["words", "from", "until", "service", "who", "channels"],
      `${role}: plan's offer, PlanIntent's own fields`,
    );
    assert.deepEqual(shapeOf(_f).required, ["words", "from", "until"], `${role}: an offer's words and its two days`);
    // 9 Oct 2026: the change action's own three fields; its name, run_hour and cap_per_run are the playbook's, one shape.
    assert.deepEqual(
      [_s, _g, _c].map(shapeOf),
      [{ type: "string", enum: ["running", "paused"] }, { type: "number" }, { type: "number" }],
      `${role}: change's own three fields`,
    );
    // 11 Oct 2026 (00416): and its last day and its trial's end, a null ending the trial; its words are params, the
    // broadcast's and the playbook's, one shape.
    assert.deepEqual(
      [_u, _t].map(shapeOf),
      [{ type: "string" }, { type: ["string", "null"] }],
      `${role}: change's until and trial_until`,
    );
    // 10 Oct 2026: the message action's own four fields; its name is the broadcast's and the playbook's, one shape.
    const versionOf = (props) => ({
      type: "object",
      properties: props,
      required: Object.keys(props),
      additionalProperties: false,
    });
    assert.deepEqual(
      [_l, _k, _w, _o].map(shapeOf),
      [
        { type: "string", enum: ["en", "es"] },
        { type: "string", enum: ["marketing", "utility"] },
        {
          type: "object",
          properties: {
            whatsapp: versionOf({ body: { type: "string" } }),
            email: versionOf({ subject: { type: "string" }, body: { type: "string" } }),
            sms: versionOf({ body: { type: "string" } }),
          },
          required: [],
          additionalProperties: false,
        },
        {
          type: "array",
          items: versionOf({
            position: { type: "integer" },
            label: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "text",
                "first_name",
                "business_name",
                "booking_link",
                "review_link",
                "visit_when",
                "visit_service",
                "proposal_link",
              ],
            },
          }),
        },
      ],
      `${role}: message's own four fields`,
    );
    assert.deepEqual(shapeOf(playbookId), { type: "string" }, `${role}: playbook_id, the channels action's own field`);
    assert.deepEqual(channels, CHANNELS, `${role}: channels, one optional list of the three, for both actions`);
    assert.equal(now.input_schema.required.includes("channels"), false, `${role}: and never required`);
    assert.deepEqual(
      { ...fields, action: { type: "string", enum: ["broadcast", "playbook"] } },
      asProposableNow(before.input_schema).properties,
    );
    // Less the examples of the actions added since, and the playbook's one naming its starter (12 Oct 2026).
    assert.deepEqual(
      now.input_examples.filter(
        (ex) =>
          !["run", "channels", "change", "message", "plan", "leads", "sequence"].includes(ex.action) &&
          !("starter" in ex),
      ),
      before.input_examples,
    );
    assert.deepEqual(
      now.input_examples.filter((ex) => "starter" in ex),
      [{ action: "playbook", trigger: "visited", starter: "after_visit_review" }],
      `${role}: the starter's one example, the day after's review ask`,
    );
    assert.ok(now.description.includes(` ${DEFS.get("propose_campaign").actions.run.words} `), role);
    assert.ok(now.description.includes(` ${DEFS.get("propose_campaign").actions.channels.words} `), role);
    assert.ok(now.description.includes(` ${DEFS.get("propose_campaign").actions.change.words} `), role);
    assert.ok(now.description.includes(` ${DEFS.get("propose_campaign").actions.message.words} `), role);
    assert.ok(now.description.includes(` ${DEFS.get("propose_campaign").actions.plan.words} `), role);
    assert.ok(now.description.includes(` ${DEFS.get("propose_campaign").actions.leads.words} `), role);
    assert.deepEqual(
      now.input_examples.filter((ex) => ex.action === "plan").map((ex) => ex.intent),
      ["offer", "cover_journey"],
      `${role}: the plan's two examples, the offer and a whole setup`,
    );
  }
});

test("PR 4.5 gave inbox one action, search, and moved nothing else it says: less the search's words, its two fields and its one example, inbox reads to every role byte for byte as PR 4.3 sent it (which was PR 3.4's)", () => {
  const d = DEFS.get(SEARCHED);
  for (const role of ROLES) {
    const t = toApiTools(role, true).find((x) => x.name === SEARCHED);
    const was = PR_4_3[role].find((x) => x.name === SEARCHED);
    assert.equal(
      t.description,
      was.description.replace(...NEEDS_YOU_LIST_WORDS).replace(` ${d.tail}`, ` ${d.actions.search.words} ${d.tail}`),
      `${role}: the search's words, between the thread's and the tail, and needs_you as the Inbox counts it`,
    );
    const { words, days, ...rest } = t.input_schema.properties;
    assert.deepEqual([words, days], [{ type: "string" }, { type: "number" }], `${role}: words and days, and no other`);
    assert.deepEqual(rest.action.enum, ["list", "thread", "search"], `${role}: search last`);
    assert.equal(
      JSON.stringify({
        ...t.input_schema,
        properties: { ...rest, action: { type: "string", enum: ["list", "thread"] } },
      }),
      JSON.stringify(was.input_schema),
      `${role}: every other field PR 4.3's, in its order`,
    );
    assert.deepEqual(
      t.input_examples,
      [...was.input_examples, { action: "search", words: "parking", days: 30 }],
      `${role}: one example more`,
    );
  }
});

test("the rename is a bijection: every old tool is one tool and action of the registry, every action but those Phase 4 added one old tool, and each action takes exactly the fields its old tool took", () => {
  const pairs = Object.values(NAMES);
  const registry = [...DEFS.keys()].flatMap((name) =>
    actionsOf(name).length ? actionsOf(name).map((a) => `${name}.${a}`) : [name],
  );
  assert.deepEqual(
    [...pairs].sort(),
    registry.filter((n) => !PHASE_4.includes(n)).sort(),
    "twenty-six old tools, twenty-six actions",
  );
  assert.deepEqual(
    registry.filter((n) => PHASE_4.includes(n)).sort(),
    PHASE_4,
    "and those Phase 4 added, each an action of a tool that was or a tool of its own (propose_list)",
  );
  for (const [old, to] of Object.entries(NAMES)) {
    const [name, action = ""] = to.split(".");
    const def = DEFS.get(name).actions[action];
    const was = OLD.find((t) => t.name === old);
    assert.ok(was, `${old} is in the 3.1 fixture`);
    const gainedChannels = old === "propose_broadcast" || old === "propose_playbook";
    const now = toolSchema(def.input);
    assert.deepEqual(
      shapeOf(gainedChannels ? lessChannels(now) : old === "propose_lead_search" ? asPlacesThen(now) : now),
      shapeOf(old === "propose_playbook" ? asProposableNow(was.input_schema) : was.input_schema),
      `${old} -> ${to}: the same fields`,
    );
    if (gainedChannels)
      assert.deepEqual(shapeOf(toolSchema(def.input).properties.channels), CHANNELS, `${to}: and channels`);
    if (old === "propose_playbook") {
      assert.deepEqual(shapeOf(toolSchema(def.input).properties.until), { type: "string" }, `${to}: and until`);
      assert.deepEqual(shapeOf(toolSchema(def.input).properties.starter), STARTER, `${to}: and starter`);
    } else if (gainedChannels) {
      assert.equal("until" in toolSchema(def.input).properties, false, `${to}: no until`);
      assert.equal("starter" in toolSchema(def.input).properties, false, `${to}: no starter`);
    }
  }
});

test("a tool with actions is sent as ONE object schema: action an enum of its actions in their order and required alone, every action's other fields once each and in the shape that action gives them; never a root oneOf or anyOf", () => {
  for (const t of toApiTools("owner", true)) {
    const s = t.input_schema;
    assert.equal(s.type, "object", `${t.name}: an object schema`);
    assert.ok(!("oneOf" in s) && !("anyOf" in s) && !("$schema" in s), `${t.name}: no root union`);
    assert.equal(s.additionalProperties, false, t.name);
    const actions = actionsOf(t.name);
    if (!actions.length) {
      assert.ok(!("action" in s.properties), `${t.name} takes no action`);
      assert.deepEqual(s, toolSchema(DEFS.get(t.name).actions[""].input), `${t.name}: toolSchema of its own zod`);
      continue;
    }
    assert.deepEqual(s.properties.action, { type: "string", enum: actions }, `${t.name}: its actions, in order`);
    assert.deepEqual(s.required, ["action"], `${t.name}: action alone required`);
    const fields = {};
    for (const a of actions)
      for (const [k, v] of Object.entries(toolSchema(DEFS.get(t.name).actions[a].input).properties)) {
        if (k in fields) assert.deepEqual(v, fields[k], `${t.name}.${a}: ${k} has the shape another action gave it`);
        fields[k] ??= v;
      }
    assert.deepEqual(s.properties, { action: s.properties.action, ...fields }, `${t.name}: every field once, in order`);
  }
  // The normaliser's moves, on the zod each shows: no $schema anywhere, no safe-integer bounds on an integer, the three
  // periods as an integer enum, and `required: []` where nothing is required.
  const flat = JSON.stringify(toApiTools("owner", true));
  assert.ok(!flat.includes("$schema") && !flat.includes("9007199254740991"));
  const tool = (name) => toApiTools("owner", true).find((x) => x.name === name);
  assert.deepEqual(tool("report").input_schema.properties.days, { type: "integer", enum: [7, 30, 90] });
  assert.deepEqual(tool("today").input_schema.required, []);
});

test("every description is at least three sentences, says what each of its actions takes, names no tool that is gone, and no two are the same; an act's names, to each role, who may approve each card it is offered, as the card's spec says it and in that action's own words", () => {
  const all = toApiTools("owner", true);
  const gone = Object.keys(NAMES).filter((old) => !DEFS.has(old));
  for (const t of all) {
    assert.ok(sentences(t.description) >= 3, `${t.name}: ${sentences(t.description)} sentence(s)`);
    for (const a of actionsOf(t.name))
      assert.ok(new RegExp(`\\baction ${a}\\b`, "i").test(t.description), `${t.name} says action ${a}`);
    for (const old of gone) assert.ok(!new RegExp(`\\b${old}\\b`).test(t.description), `${t.name} names ${old}`);
  }
  assert.equal(new Set(all.map((t) => t.description)).size, all.length, "no two descriptions are equal");
  // The whole clause, head and tail, per `needs`: one derivation in the registry (tools/context.ts approvalWords),
  // said per action in the actions' own words (D2), so an action a role is not offered takes its clause with it.
  const CLAUSE = {
    partner: "Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask.",
    owner: "Only an owner can approve it: for anyone else, say so and that an owner can ask.",
  };
  for (const role of ROLES)
    for (const d of ACT_DEFS) {
      const t = toApiTools(role, true).find((x) => x.name === d.name);
      if (!t) continue;
      const needs = usable(d.name, role).map((a) => PROPOSAL_SPECS[d.actions[a].kind].needs);
      assert.ok(!/owner-only/i.test(t.description), `${t.name}: the role is said in the spec's words`);
      for (const n of needs)
        if (n !== "operator") assert.ok(t.description.includes(CLAUSE[n]), `${role} ${t.name}: needs ${n}`);
      if (needs.every((n) => n === "owner")) assert.ok(!/partner/i.test(t.description), `${t.name} needs an owner`);
      if (needs.every((n) => n === "operator"))
        assert.ok(
          !/\b(owners?|partners?)\b/i.test(t.description.replace(THREAD_POINTER, "")),
          `${t.name} needs an operator: no role named, but whose a person's treatment is`,
        );
    }
  for (const d of ACT_DEFS)
    for (const a of actionsOf(d.name)) {
      const n = PROPOSAL_SPECS[d.actions[a].kind].needs;
      if (n !== "operator") assert.ok(d.actions[a].words.includes(CLAUSE[n]), `${d.name}.${a}: its own clause`);
    }
  for (const role of ["operator", "partner", "owner"])
    assert.ok(
      toApiTools(role, true)
        .find((x) => x.name === "propose_thread_verb")
        .description.includes(`, and ${THREAD_POINTER}.`),
      `${role}: propose_thread_verb says whose a person's treatment is`,
    );
  assert.equal(PROPOSAL_SPECS.person_mode.needs, "owner", "the pointer says an owner's, as the mode's spec needs");
});

/** The tools with no action whose input has a shape a sentence does not pin (D9): a window, a change, a plan. */
const SHAPED = [
  "propose_autonomy",
  "propose_deal",
  "propose_lead_search",
  "propose_list",
  "propose_settings",
  "propose_thread_verb",
];

test("input_examples ride on every action of a tool with actions and on the shaped tools, the action first; every one parses with its tool's zod unchanged, as the registry parses an input; a settings example makes its card, and a lead plan plans", async () => {
  const { ProposeLeadSearchSchema, planLeadSearch } = await import("@chanlytics/contracts");
  const tools = toApiTools("owner", true);
  assert.deepEqual(
    tools.filter((t) => t.input_examples).map((t) => t.name),
    tools.filter((t) => actionsOf(t.name).length || SHAPED.includes(t.name)).map((t) => t.name),
    "a tool with actions and the shaped tools carry examples, and no other",
  );
  for (const t of tools.filter((x) => x.input_examples)) {
    const def = DEFS.get(t.name);
    const actions = actionsOf(t.name);
    const want = (actions.length ? actions : [""]).flatMap((a) =>
      (def.actions[a].examples ?? []).map((ex) => (a ? { action: a, ...ex } : ex)),
    );
    assert.deepEqual(t.input_examples, want, `${t.name}: each action's examples, in its order, the action first`);
    for (const a of actions)
      assert.ok(
        t.input_examples.some((ex) => ex.action === a),
        `${t.name}: an example of action ${a}, since the schema cannot say what it requires`,
      );
    for (const ex of t.input_examples) {
      assert.equal(Object.keys(ex)[0], actions.length ? "action" : Object.keys(ex)[0], `${t.name}: action first`);
      // An example the schema refuses would be a 400 on every turn until the retry drops them (D9).
      const { action = "", ...fields } = actions.length ? ex : { ...ex, action: "" };
      const r = def.actions[action].input.safeParse(actions.length ? fields : ex);
      assert.ok(r.success, `${t.name}: ${JSON.stringify(ex)} ${r.success ? "" : r.error.message}`);
      assert.deepEqual(r.data, actions.length ? fields : ex, `${t.name}: nothing stripped or defaulted`);
    }
  }
  // Each role's examples validate against the flattened schema that role is sent (D2): the API refuses one that does
  // not, and a role is sent its own actions' fields alone.
  const fits = (s, v, at) => {
    if (s.enum) assert.ok(s.enum.includes(v), `${at}: ${JSON.stringify(v)} in ${JSON.stringify(s.enum)}`);
    if (s.type === "array") return v.forEach((x, i) => fits(s.items, x, `${at}[${i}]`));
    if (s.type === "object") {
      for (const k of s.required ?? []) assert.ok(k in v, `${at}: ${k} required`);
      for (const [k, x] of Object.entries(v)) {
        assert.ok(k in s.properties || s.additionalProperties !== false, `${at}: ${k} is in the schema`);
        if (s.properties[k]) fits(s.properties[k], x, `${at}.${k}`);
      }
      return;
    }
    const type = s.type === "integer" ? "number" : s.type;
    if (type) assert.equal(typeof v, type, at);
    if (s.type === "integer") assert.ok(Number.isInteger(v), at);
  };
  for (const role of ROLES)
    for (const t of toApiTools(role, true))
      for (const ex of t.input_examples ?? []) fits(t.input_schema, ex, `${role} ${t.name}`);
  // The settings changes pass the change's own schema too: each makes its card, with nothing read.
  const { supabase, t } = contextFor("owner");
  for (const ex of tools.find((x) => x.name === "propose_settings").input_examples) {
    const out = await buildProposal(t, "propose_settings", ex);
    assert.equal(out.isError, false, out.result);
    assert.deepEqual(out.proposal.payload.change, ex.change);
  }
  assert.deepEqual(supabase.seen, [], "a settings card reads nothing");
  // The lead plans pass the plan's own schema and the planner: a US search of businesses, with a card to make.
  for (const ex of tools.find((x) => x.name === "propose_lead_search").input_examples) {
    const planned = planLeadSearch(ProposeLeadSearchSchema.parse(ex));
    assert.ok(planned.ok, `${ex.asked}: ${planned.ok ? "" : planned.refusal.text}`);
  }
});

test("an input a schema refuses comes back in the zod's words, under the tool's name, as an error, and the handler never runs: a field its action needs, an action it does not have, a value it does not list", async () => {
  const { supabase, t } = contextFor();
  const words = async (name, input) => {
    const out = ACT_TOOL_NAMES.has(name) ? await buildProposal(t, name, input) : await runTool(t, { name, input });
    assert.equal(out.isError, true, `${name} ${JSON.stringify(input)}`);
    return JSON.parse(out.result).error;
  };
  assert.deepEqual(await runTool(t, { name: "inbox", input: { action: "thread" } }), {
    result: JSON.stringify({ error: "inbox: conversation_id Invalid input: expected string, received undefined" }),
    isError: true,
    label: "Reading the conversation",
  });
  assert.equal(
    await words("inbox", { action: "delete" }),
    "inbox: action Invalid discriminator value. Expected 'list' | 'thread' | 'search'",
  );
  assert.equal(
    await words("inbox", { filter: "held" }),
    "inbox: action Invalid discriminator value. Expected 'list' | 'thread' | 'search'",
    "an action is required, even where the fields name one",
  );
  assert.equal(await words("report", { days: 8 }), "report: days Invalid option: expected one of 7|30|90");
  assert.equal(
    await words("propose_thread_verb", { conversation_id: C1, verb: "delete" }),
    'propose_thread_verb: verb Invalid option: expected one of "take_over"|"hand_back"|"snooze"|"wake"|"archive"|"resolve"',
  );
  assert.equal(
    await words("propose_campaign", { action: "playbook", trigger: "never" }),
    // 2 Oct 2026: the moments a new playbook may start from; welcome and save our number are no longer among them. 11
    // Oct 2026 (D2): the reminder the day before and the check after an appointment are, where a calendar is connected.
    'propose_campaign: trigger Invalid option: expected one of "quiet_30"|"everyone_monthly"|"visit_tomorrow"|"visited"|"lapsed"|"saved_list"|"proposal_waiting"',
  );
  // An owner's action, asked by an owner: past the role (D2), to the zod.
  const invite = await buildProposal(contextFor("owner").t, "propose_team", {
    action: "invite",
    email: "ada@example.com",
    role: "owner",
  });
  assert.equal(
    JSON.parse(invite.result).error,
    'propose_team: role Invalid option: expected one of "operator"|"viewer"',
  );
  assert.match(await words("inbox", [C1]), /^inbox: Invalid input: expected object, received array$/);
  assert.deepEqual(supabase.seen, [], "nothing was read: the handler never ran");
});

test("an action the caller's role may not use is refused in words, under the tool's name and before its zod or its handler (D2): the second guard, beside the builder's own role check, which stays", async () => {
  const cases = [];
  for (const role of ROLES)
    for (const [name, d] of DEFS)
      for (const a of actionsOf(name))
        if (!usable(name, role).includes(a)) cases.push([role, name, a, needsOf(d.actions[a])]);
  assert.ok(cases.length > 0, "some action is above some role");
  const WHOSE = {
    owner: "an owner's",
    partner: "an owner's or a partner's",
    operator: "an owner's, a partner's or an operator's",
  };
  for (const [role, name, a, needs] of cases) {
    const { supabase, t } = contextFor(role);
    // Its fields left out: a guard after the zod would answer the zod's words.
    const out = ACT_TOOL_NAMES.has(name)
      ? await buildProposal(t, name, { action: a })
      : await runTool(t, { name, input: { action: a } });
    assert.deepEqual(
      [out.isError, JSON.parse(out.result).error],
      [true, `${name}: action ${a} is ${WHOSE[needs]}`],
      `${role} ${name}.${a}`,
    );
    assert.deepEqual(supabase.seen, [], `${role} ${name}.${a}: nothing read`);
  }
  // A call is parsed as the role's own tool: its errors name only the actions and fields that role was shown -- an
  // operator's workspace never names activity or its filters -- and a tool none of whose actions it may use is
  // refused whole, in words.
  const { supabase: seen, t: op } = contextFor("operator");
  const err = async (name, input) => JSON.parse((await runTool(op, { name, input })).result).error;
  const none = await err("workspace", {});
  assert.equal(
    none,
    "workspace: action Invalid discriminator value. Expected 'settings' | 'connections' | 'notifications'",
  );
  const unknown = await err("workspace", { action: "teleport" });
  assert.ok(!/activity|person|kind|day|cursor/.test(unknown), unknown);
  for (const field of ["person", "kind", "day", "cursor"]) {
    const out = await runTool(op, { name: "workspace", input: { action: "notifications", [field]: "x" } });
    assert.ok(!out.result.includes(field) && !out.result.includes("activity"), `${field}: ${out.result}`);
  }
  assert.ok(
    seen.seen.every((q) => q.table !== "decisions" && q.table !== "events"),
    "an operator's workspace reads no ledger",
  );
  const own = contextFor("owner").t;
  assert.equal(
    JSON.parse((await runTool(own, { name: "workspace", input: { action: "notifications", cursor: "x" } })).result)
      .error,
    "workspace: cursor not taken by action notifications",
    "an owner was shown activity's fields, and hears so",
  );
  for (const [role, name, whose] of [
    ["operator", "propose_team", "an owner's"],
    ["partner", "propose_team", "an owner's"],
    ["viewer", "propose_reply", "an owner's, a partner's or an operator's"],
  ]) {
    const out = await buildProposal(contextFor(role).t, name, {});
    assert.equal(JSON.parse(out.result).error, `${name} is ${whose}`, `${role} ${name}`);
  }
  // The builders' own checks stay: an owner's card's builder, called past the registry, refuses an operator in its
  // route's words.
  const { t } = contextFor("operator");
  const mode = await DEFS.get("propose_person").actions.mode.build(t, { contact_id: C1, mode: "never" });
  assert.match(JSON.parse(mode.result).error, /^only an owner can change how the receptionist treats one person/);
});

test("a null on an optional key is absent, in an action's fields too; a null on a required key is refused; an unknown key is stripped, not refused; a field only another action takes is refused, so a card never quietly becomes another", async () => {
  const { supabase, t } = contextFor("owner");
  // audience_id: null passes the parse as no audience_id: the handler runs, and refuses the template id itself.
  const nul = await buildProposal(t, "propose_campaign", {
    action: "broadcast",
    template_id: "nope",
    audience_kind: "everyone",
    audience_id: null,
  });
  assert.equal(JSON.parse(nul.result).error, "template_id must be an id campaigns with action audiences returned");
  // Nested too: a null inside the change is dropped, and the change becomes a card.
  const nested = await buildProposal(t, "propose_settings", {
    change: { op: "add_closure", date: "2026-12-25", note: null, until: null },
  });
  assert.equal(nested.isError, false, nested.result);
  assert.deepEqual(nested.proposal.payload.change, { op: "add_closure", date: "2026-12-25" });
  // A required key given null stays null, and the zod refuses it by name.
  const required = await runTool(t, { name: "inbox", input: { action: "thread", conversation_id: null } });
  assert.deepEqual(
    [required.isError, JSON.parse(required.result).error],
    [true, "inbox: conversation_id Invalid input: expected string, received null"],
  );
  // An extra key no action takes is dropped on the way in: the card is made without it.
  const extra = await buildProposal(t, "propose_team", {
    action: "invite",
    email: "ada@example.com",
    role: "viewer",
    extra: 1,
  });
  assert.equal(extra.isError, false, extra.result);
  assert.deepEqual(extra.proposal.payload, { email: "ada@example.com", role: "viewer" });
  // A field only the tool's other action takes is refused by name, before the handler runs: stripped, the broadcast
  // below would have gone out now, and to everyone, where a playbook's run_hour and list were asked for.
  const other = await buildProposal(t, "propose_campaign", {
    action: "broadcast",
    template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
    audience_kind: "everyone",
    params: [],
    run_hour: 15,
    list: "seg:quiet",
  });
  assert.deepEqual(
    [other.proposal, other.isError, JSON.parse(other.result).error],
    [null, true, "propose_campaign: list, run_hour not taken by action broadcast"],
  );
  const read = await runTool(t, { name: "inbox", input: { action: "list", filter: "held", conversation_id: C1 } });
  assert.deepEqual(
    [read.isError, JSON.parse(read.result).error, read.label],
    [true, "inbox: conversation_id not taken by action list", "Reading the Inbox"],
  );
  // A field both actions take is the one named; a null on another action's field is absent, as any null is.
  const nullOther = await buildProposal(t, "propose_campaign", {
    action: "broadcast",
    template_id: "nope",
    audience_kind: "everyone",
    trigger: null,
    name: "October",
  });
  assert.equal(
    JSON.parse(nullOther.result).error,
    "template_id must be an id campaigns with action audiences returned",
  );
  assert.deepEqual(supabase.seen, [], "none of these reached the database");
});

test("an unknown tool is refused as it always was, for a read and for an act, an old name among them; each action's trace line is its old tool's words; a turn records name.action from the arguments as they came", async () => {
  const { t } = contextFor();
  assert.deepEqual(await runTool(t, { name: "teleport", input: {} }), {
    result: JSON.stringify({ error: "unknown tool teleport" }),
    isError: true,
    label: "Running teleport",
  });
  assert.deepEqual(await buildProposal(t, "teleport", {}), {
    proposal: null,
    result: JSON.stringify({ error: "unknown tool teleport" }),
    isError: true,
    // The refusal as the model is told it, kept beside the result (context.ts refuse): what a plan names its step's by.
    refusal: "unknown tool teleport",
  });
  assert.equal(
    JSON.parse((await runTool(t, { name: "get_thread", input: {} })).result).error,
    "unknown tool get_thread",
  );
  assert.equal(JSON.parse((await buildProposal(t, "draft_reply", {})).result).error, "unknown tool draft_reply");
  // The words each old tool's trace line said, now its action's: the palette's line while the call runs.
  const LABELS = {
    get_today: "Reading Today",
    list_threads: "Reading the Inbox",
    get_thread: "Reading the conversation",
    search_people: "Looking through People",
    get_person: "Reading the profile",
    list_calls: "Reading the calls",
    get_call: "Reading the call",
    get_report: "Reading Reports",
    get_settings: "Reading Settings",
    get_openings: "Checking the calendar",
    list_audiences: "Reading the lists and templates",
    list_playbooks: "Reading the campaigns",
    get_calendar: "Reading the calendar",
    list_lead_searches: "Reading your searches",
    draft_reply: "Drafting a reply",
    propose_steer: "Preparing a rewrite",
    propose_thread_verb: "Preparing an Inbox action",
    propose_person_mode: "Preparing a receptionist change",
    propose_deal: "Preparing a deal",
    propose_policy: "Preparing an autonomy change",
    propose_settings: "Preparing a settings change",
    propose_whisper: "Preparing a whisper",
    propose_broadcast: "Preparing a broadcast",
    propose_playbook: "Preparing a campaign",
    propose_invite: "Preparing an invitation",
    propose_lead_search: "Planning a search",
  };
  assert.deepEqual(Object.keys(LABELS).sort(), Object.keys(NAMES).sort());
  for (const [old, to] of Object.entries(NAMES)) {
    const [name, action] = to.split(".");
    assert.equal(toolLabel(name, action ? { action } : {}), LABELS[old], `${old} -> ${to}`);
  }
  // Before a call names its action, or with one the tool does not have: the tool's first action's line.
  assert.equal(toolLabel("campaigns"), "Reading the lists and templates");
  assert.equal(toolLabel("campaigns", { action: "teleport" }), "Reading the lists and templates");
  assert.equal(toolLabel("campaigns", { action: "broadcasts" }), "Reading the broadcasts", "PR 4.3's own line");
  assert.equal(toolLabel("teleport", {}), "Running teleport");
  // What a turn records: the action where the tool takes one and the call named one as a string, else the name.
  assert.deepEqual(
    [
      calledName("inbox", { action: "list", filter: "held" }),
      calledName("inbox", { action: "delete" }),
      calledName("inbox", {}),
      calledName("inbox", null),
      calledName("inbox", { action: 3 }),
      calledName("today", { action: "list" }),
      calledName("propose_campaign", { action: "playbook" }),
      calledName("propose_deal", { stage: "won" }),
      calledName("teleport", { action: "x" }),
    ],
    [
      "inbox.list",
      "inbox.delete",
      "inbox",
      "inbox",
      "inbox",
      "today",
      "propose_campaign.playbook",
      "propose_deal",
      "teleport",
    ],
  );
});

test("the lead search keeps its order: the owner check comes before the plan's own schema, so a member below a partner with a malformed plan hears the owner words, and an owner the plan's", async () => {
  const ask = {
    looking_for: "local_businesses",
    country: "US",
    count: 0,
    who: "personal trainers",
    who_one: "personal trainer",
    category_key: "Personal-Trainer",
    terms: ["personal trainers"],
    region: "TX",
    contact: "email",
    criteria: [],
    asked: "find me personal trainers in Texas",
  };
  const operator = await buildProposal(contextFor("operator").t, "propose_lead_search", ask);
  assert.match(JSON.parse(operator.result).error, /^only an owner or the workspace's partner can start a lead search/);
  const owner = await buildProposal(contextFor("owner").t, "propose_lead_search", ask);
  assert.equal(JSON.parse(owner.result).error, "the plan is not complete: count Too small: expected number to be >=1");
  // The partner has `find` (ROLE_PERMS, 0012): past the role check, to the plan's own words, as the owner is.
  const partner = await buildProposal(contextFor("partner").t, "propose_lead_search", ask);
  assert.equal(
    JSON.parse(partner.result).error,
    "the plan is not complete: count Too small: expected number to be >=1",
  );
  // The owner check wins over the plan's semantic schema only: D2 orders every tool's parse before its handler, so an
  // ask malformed at the flat schema hears the zod's words whatever the role; the role check (D7) is the handler's
  // first line, after that parse.
  const flat = await buildProposal(contextFor("operator").t, "propose_lead_search", {
    looking_for: "local_businesses",
  });
  assert.match(JSON.parse(flat.result).error, /^propose_lead_search: country Invalid input/);
});
