/**
 * The facts a list may name (decision 0009): each field, its label, what it needs, and the closed sets its facts take.
 * Data alone, read by the rules' grammar (list-rules.ts), the matcher (list-match.ts) and the built-in lists
 * (builtin-lists.ts), so a page that judges or names a list carries no schema with it.
 */
/**
 * What a list may need that a workspace, a reader or a moment may not have: a calendar read, a consult-first service
 * on the profile, a deal recorded here (every workspace has deals, 0008 amended 18 Oct 2026; the deal lists fill a rail
 * only once one is), and someone looking (for "me"). Derived from a rule, never written beside it.
 */
export type ListNeed = "calendar" | "consult" | "deals" | "viewer";

/** The order a list's unmet needs are said in: the first one is the reason it cannot be counted. */
export const LIST_NEEDS: readonly ListNeed[] = ["calendar", "consult", "deals", "viewer"];

export type ListFieldKind =
  "days" | "yesno" | "channel" | "came_from" | "count" | "purpose" | "standing" | "assigned" | "deal_stage" | "list";

/**
 * Every fact a rule may name: its id, its label (a chip's first words), its kind, what it always needs, and the line
 * the drafting model reads about it. The model's instructions are written from this table, never typed beside it.
 */
export const LIST_RULE_FIELDS: readonly {
  id: string;
  label: string;
  kind: ListFieldKind;
  needs: readonly ListNeed[];
  draft: string;
}[] = [
  {
    id: "last_visit",
    label: "Last on the calendar",
    kind: "days",
    needs: ["calendar"],
    draft: "days since their last appointment on the calendar",
  },
  {
    id: "next_visit",
    label: "Next on the calendar",
    kind: "days",
    needs: ["calendar"],
    draft: "days until their next appointment; op this_week is Monday to Sunday of this week",
  },
  {
    id: "missed_visit",
    label: "Missed one",
    kind: "days",
    needs: ["calendar"],
    draft: "days since an appointment they did not come to, as a member marked it missed on the calendar",
  },
  { id: "booked", label: "Booked ahead", kind: "yesno", needs: ["calendar"], draft: "an appointment booked ahead" },
  {
    id: "asked_not_booked",
    label: "Asked, never booked",
    kind: "yesno",
    needs: ["calendar"],
    draft: "wrote or called in the last 30 days and nothing on the calendar answers it",
  },
  {
    id: "last_heard",
    label: "Last heard from",
    kind: "days",
    needs: [],
    draft: "days since THEY last wrote or called",
  },
  { id: "first_contact", label: "First contact", kind: "days", needs: [], draft: "days since they first got in touch" },
  {
    id: "channel",
    label: "Reaches you by",
    kind: "channel",
    needs: [],
    draft: "a way they reach the business: whatsapp, sms, voice (phone calls) or email",
  },
  {
    id: "came_from",
    label: "Came from",
    kind: "came_from",
    needs: [],
    draft: "how they first came: whatsapp, sms, email, call, calendar, manual, import or lead",
  },
  { id: "calls", label: "Calls", kind: "count", needs: [], draft: "how many calls" },
  { id: "conversations", label: "Conversations", kind: "count", needs: [], draft: "how many conversations" },
  {
    id: "has_chat",
    label: "Has written with you",
    kind: "yesno",
    needs: [],
    draft: "a written conversation either way (no means they have only phoned)",
  },
  {
    id: "said_yes",
    label: "Said yes to",
    kind: "purpose",
    needs: [],
    draft: "said yes to offers, or to messages (to: offers or messages)",
  },
  {
    id: "can_receive",
    label: "Can be sent",
    kind: "purpose",
    needs: [],
    draft: "can be sent offers or messages: the yes and a number to send to (to: offers or messages)",
  },
  { id: "stopped", label: "Asked to stop", kind: "yesno", needs: [], draft: "asked to stop, or on do-not-contact" },
  {
    id: "standing",
    label: "Standing",
    kind: "standing",
    needs: [],
    draft:
      "value needs_you (waiting for a person) or waiting_on_you (a thread you have: you took it over, or your reply paused the receptionist)",
  },
  {
    id: "assigned",
    label: "Thread is with",
    kind: "assigned",
    needs: [],
    draft: "who has their thread: value me, teammate or nobody",
  },
  {
    id: "deal_stage",
    label: "Deal",
    kind: "deal_stage",
    needs: ["deals"],
    draft: "where they are on the way to a deal: value consultation, proposed, won, lost (passed) or ended",
  },
  {
    id: "consultation",
    label: "A consultation",
    kind: "yesno",
    needs: ["calendar", "consult"],
    draft: "their next or last appointment is a consultation",
  },
  { id: "step_due", label: "A next step due", kind: "yesno", needs: [], draft: "a next step whose day has come" },
  {
    id: "in_list",
    label: "On the list",
    kind: "list",
    needs: [],
    draft: "on another list, by its token (list); never use it in a draft",
  },
] as const;

/** A field's row in the table above, by its id: a rule names only these (ListRuleSchema), so any other is a bug. */
export function listFieldOf(id: string): (typeof LIST_RULE_FIELDS)[number] {
  const field = LIST_RULE_FIELDS.find((f) => f.id === id);
  if (!field) throw new Error(`No list field "${id}"`);
  return field;
}

export const LIST_PURPOSES = ["offers", "messages"] as const;
export const LIST_STANDINGS = ["needs_you", "waiting_on_you"] as const;
export const LIST_ASSIGNED = ["me", "teammate", "nobody"] as const;
export const LIST_DEAL_STAGES = ["consultation", "proposed", "won", "lost", "ended"] as const;

/** How many conditions a rule may hold, and how many facts one "any" group. */
export const LIST_RULE_MAX = 12;
export const LIST_ANY_MAX = 6;

/** The ways a day fact counts: since, within, never, ever, this week. */
export const LIST_DAY_OPS = ["more_than", "within", "never", "ever", "this_week"] as const;
