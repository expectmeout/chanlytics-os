/**
 * Ask: the workspace assistant, as a contract.
 *
 * What lives here is everything about Ask that is pure and shared: its limits,
 * the cards (what each kind does is its spec, in ask-proposals/), the Line's
 * jump index and suggestions, and the three questions answered without a
 * model. A citation -- its kinds, the rule that keeps it honest, where a row
 * opens -- is citations.ts's; the answer -- its shape and how it is read back
 * -- ask-answer.ts's, and the format the model writes it in answer-format.ts's.
 * The route that runs the model lives in the dashboard; the Line that shows
 * the answer lives in the legacy pages; both read from here.
 *
 * This module holds the limits, the message and its cards (and what became of each), where a question is asked
 * from: the row in view (AskScope, scopeFromRoute) and the pages Ask knows it is on (ASK_SURFACES), and the shapes of
 * what a read hands a plan of Ask's (MessageRead). The rest is beside it: the languages and the guess at a question's
 * (ask-language.ts), the rules an answer's text passes (answer-text.ts), the jump index (ask-jump.ts), the suggestions
 * (ask-suggestions.ts), the three questions answered without a model (ask-fast-paths.ts) and the settings a card may
 * change (ask-settings-change.ts).
 */

/** A proposal the model made; a card the person may approve. Executed by the client through the verbs. */
interface AskProposal {
    id: string;
    kind: "reply" | "steer" | "thread_verb" | "person_mode" | "policy" | "settings" | "whisper" | "invite" | "broadcast" | "playbook" | "lead_search" | "people_search" | "reach_out_add" | "deal" | "note" | "person_details" | "list" | "run" | "playbook_channels" | "playbook_change" | "message" | "answer" | "answer_many" | "person_mode_many" | "note_many" | "person_add" | "person_merge" | "person_message" | "list_member" | "list_change" | "list_delete" | "sequence_step" | "sequence_step_remove" | "sequence_words" | "sequence_leave" | "sequence_add" | "sequence_move" | "lead_search_aim" | "sequence_send_decide" | "sequence_send_said" | "sequence_draft" | "sequence_make" | "sequence_new" | "sequence_start" | "sequence_discard" | "sequence_end" | "sequence_test" | "playbook_run" | "booking_request" | "fact_suggestion" | "call_hand_over" | "lead_stage" | "lead_mark" | "lead_later" | "leads_bulk" | "leads_check" | "lead_addressee" | "lead_list" | "lead_search_more" | "reach_out_make" | "reach_out_said" | "review_reply" | "review_reply_stop" | "follow_up" | "answer_style" | "memory" | "memory_change" | "memory_forget";
    /** The lowest role that may commit it, its spec's (ask-proposals/); the route re-checks on Approve. */
    needs: ProposalNeeds;
    title: string;
    /** The exact change, in the person's words. */
    summary: string;
    payload: Record<string, unknown>;
    /** What undo looks like, when the verb has one. */
    undo: string | null;
    /**
     * What a deal's card writes after the deal (0007, amended): its next step, a note of the team's with its day.
     * Beside the payload, never in it: a tab from before the step hands its payload to the deal route whole, and the
     * route refuses a key it does not know, so such a tab records the deal and leaves the step.
     */
    step?: {
        body: string;
        due_on: string;
    } | null;
    /**
     * When the card was made (ISO), set by its builder. A card is approved while it is fresh (askCardLapsed): what it
     * would change was read then, and the list it sends to, the thread it answers and the setting it replaces all move.
     * Absent on a card made before this, which is not held to it.
     */
    made_at?: string;
    /** The plan the card is a step of, where Ask's plan made it (AskPlanStamp); absent on a card of no plan. */
    plan?: AskPlanStamp;
    /** The change as a sheet (AskCardSheet), where its maker gives one; a card without one draws its summary. */
    sheet?: AskCardSheet;
    /** Set once the person acted on the card. */
    outcome?: AskProposalOutcome | null;
}
/**
 * A card's change as a sheet (the answer canvas, C1, from the 13 Oct 2026 plan's decision 4; a campaign's card was one
 * 678-character sentence): what holds it from sending, read first, then a row a fact in the order an owner checks them
 * (where, when, who it reaches, how it goes, how it sends, its message). Made from the values its summary is made of,
 * which stays its words for copy, reading aloud and a card stored before it.
 */
interface AskCardSheet {
    holds: string[];
    rows: Array<{
        label: string;
        value: string;
    }>;
}
/**
 * A card's place in a plan of Ask's (the marketing manager's spec §5.4): the plan's id, which step of how many it is,
 * and whether it sends nothing (silent: approved with the plan's other silent steps, commit.ts commitPlan) or is a send,
 * its own press. A step's commit goes under the step's key (`plan:<id>:<step>`), whichever way it is pressed, so the
 * plan pressed twice makes nothing twice; and a token in its payload (`@step:n`) is filled with what step n made. `after`
 * is the steps a send waits for (contracts PlanStep.after: every silent step), none for a silent one.
 */
interface AskPlanStamp {
    id: string;
    step: number;
    of: number;
    silent: boolean;
    after: number[];
}
/** What became of a card, kept with the turn that proposed it. */
interface AskProposalOutcome {
    state: "done" | "dismissed" | "failed" | "undone";
    /** One line: "Sent to Rosa", "Closed on Friday". */
    receipt: string;
    atMs: number;
    /** What Undo needs, when the verb has one: an id, a previous value. */
    undo?: Record<string, unknown> | null;
    /**
     * What the commit made that a later step of its plan names by its token (commit.ts CommitResult.made): kept with the
     * outcome so a plan's made is read back after a reload (planMadeOf). Null, or absent on an outcome saved before, where
     * it made nothing a token names.
     */
    made?: {
        kind: string;
        id: string;
    } | null;
}

/**
 * Every handler under /api/v1, keyed the way route-policy.json keys it: the dashboard's typed client's keys
 * (client/routes.generated.ts), for a contract that names a route. What each takes and answers is the dashboard's.
 */
declare const ROUTE_KEYS: readonly ["DELETE ask/memory/[id]", "DELETE ask/threads/[id]", "DELETE capabilities/[kind]", "DELETE contacts/[id]", "DELETE google/connection", "DELETE google/link", "DELETE lead-searches/[id]", "DELETE leads/[id]", "DELETE mailbox-connections/[id]", "DELETE me", "DELETE me/devices", "DELETE people/[id]/business", "DELETE playbooks/[id]", "DELETE reach-outs/[id]", "DELETE segments/[id]", "DELETE sequences/[id]", "DELETE sequences/[id]/steps/[step]", "DELETE team/[id]", "DELETE team/partner", "DELETE templates/[id]", "DELETE templates/versions/[id]", "DELETE workspaces/accent", "DELETE workspaces/logo", "GET activity", "GET ask/follow-ups", "GET ask/memory", "GET ask/morning", "GET ask/openings", "GET ask/threads", "GET ask/threads/[id]", "GET billing", "GET billing/invoices", "GET broadcasts", "GET broadcasts/[id]", "GET broadcasts/touches", "GET business-record", "GET calendar", "GET calendar/runs", "GET calls", "GET calls/[id]/export", "GET calls/[id]/recording", "GET channels", "GET channels/instagram", "GET channels/instagram/callback", "GET channels/instagram/connect", "GET channels/whatsapp/signup", "GET consent/qr", "GET contacts", "GET contacts/[id]", "GET contacts/export", "GET conversations", "GET conversations/[id]", "GET conversations/[id]/export", "GET conversations/drafts", "GET escalations", "GET export", "GET google", "GET google/callback", "GET google/connect", "GET google/locations", "GET lead-searches", "GET lead-suggestions", "GET leads", "GET leads/[id]", "GET leads/[id]/place", "GET leads/back", "GET lines/codes", "GET mailbox-connections/callback", "GET mailbox-connections/connect", "GET mailbox-senders", "GET me/alerts", "GET messages/[id]/media", "GET metrics", "GET notifications", "GET open", "GET partner", "GET partner/invitations", "GET partner/workspaces", "GET people/[id]/reach", "GET people/list-counts", "GET platform/acts", "GET platform/find", "GET platform/health", "GET platform/home", "GET platform/me", "GET platform/overview", "GET platform/requests", "GET platform/support", "GET platform/support/bugs", "GET platform/tenants/[id]", "GET platform/workspaces/[slug]", "GET playbooks", "GET policies", "GET reach-out-replies", "GET reach-outs", "GET reach-outs/[id]", "GET reach-outs/[id]/people", "GET reach-outs/leads", "GET reach-outs/reach", "GET reach-outs/sources", "GET receptionist/rehearsals/[id]", "GET reports", "GET reports/campaigns", "GET reports/campaigns/ledger", "GET reports/headline", "GET reports/people", "GET reports/reach-outs", "GET reports/receptionist", "GET reports/reviews", "GET segments", "GET sequences", "GET sequences/[id]", "GET sequences/[id]/history", "GET sequences/[id]/people", "GET sequences/[id]/reach", "GET sequences/[id]/replies", "GET settings", "GET setup", "GET team", "GET team/partner", "GET templates", "GET today", "GET views", "GET workspaces", "PATCH ask/memory/[id]", "PATCH lead-searches/[id]", "PATCH mailbox-connections/[id]", "PATCH partner", "PATCH team/[id]", "PATCH workspaces", "POST ask", "POST ask/idea", "POST ask/memory", "POST ask/messages/[id]/proposals/[pid]", "POST ask/morning", "POST ask/quick", "POST ask/speech", "POST ask/voice", "POST ask/voice/end", "POST ask/voice/page", "POST ask/warm", "POST ask/warm/model", "POST billing/checkout", "POST billing/portal", "POST billing/resume", "POST billing/start-now", "POST billing/sync", "POST broadcasts", "POST broadcasts/[id]/approve", "POST broadcasts/[id]/cancel", "POST broadcasts/[id]/recheck", "POST calendar/notices/[id]/dismiss", "POST calendar/notices/[id]/read-again", "POST calendar/preview", "POST calendar/visits/[id]", "POST calls/[id]/end", "POST calls/[id]/hand-over", "POST calls/[id]/whisper", "POST capabilities/[kind]", "POST channels/instagram/disconnect", "POST channels/whatsapp/connect", "POST channels/whatsapp/standing", "POST client-errors", "POST contacts", "POST contacts/[id]/call", "POST contacts/[id]/deal", "POST contacts/[id]/doubts/dismiss", "POST contacts/[id]/merge", "POST contacts/[id]/not-a-person", "POST contacts/[id]/notes", "POST contacts/[id]/notes/decide", "POST contacts/[id]/notes/done", "POST contacts/[id]/notes/remove", "POST contacts/[id]/notes/seen", "POST contacts/[id]/signup-confirm", "POST contacts/import", "POST conversations/[id]/archive", "POST conversations/[id]/booking-request", "POST conversations/[id]/draft", "POST conversations/[id]/hand-back", "POST conversations/[id]/reply", "POST conversations/[id]/snooze", "POST conversations/[id]/take-over", "POST conversations/[id]/wake", "POST escalations/[id]/resolve", "POST fact-suggestions/[id]", "POST google/link", "POST google/locations", "POST google/refresh", "POST google/reviews/[id]/draft", "POST google/reviews/[id]/reply", "POST google/reviews/[id]/stop", "POST google/search", "POST handovers/[id]/accept", "POST handovers/[id]/decline", "POST imports/again", "POST lead-operations/[id]/undo", "POST lead-searches", "POST lead-searches/[id]/aim", "POST lead-searches/[id]/answer", "POST lead-searches/[id]/more", "POST lead-searches/[id]/stop", "POST lead-searches/[id]/undo", "POST lead-searches/chosen", "POST lead-searches/import", "POST lead-searches/people", "POST lead-suggestions", "POST leads/[id]/addressee", "POST leads/[id]/draft", "POST leads/[id]/exclude", "POST leads/[id]/keep", "POST leads/[id]/later", "POST leads/[id]/put-back", "POST leads/[id]/stage", "POST leads/bulk", "POST leads/check-again", "POST leads/export", "POST lines/buy", "POST lines/forwarding", "POST lines/forwarding/test", "POST lines/lookup", "POST lines/register", "POST lines/retry", "POST lines/search", "POST mailbox-connections/[id]/check", "POST mailbox-connections/[id]/resume", "POST mailbox-connections/[id]/test", "POST mailbox-senders", "POST mailboxes", "POST me/invitations/accept", "POST messages/[id]/cancel-send", "POST messages/[id]/steer", "POST notifications/test", "POST partner", "POST partner/invitations/[id]/accept", "POST partner/invitations/[id]/decline", "POST partner/workspaces", "POST partner/workspaces/[id]/resend", "POST people/[id]/draft", "POST people/[id]/message", "POST people/[id]/name", "POST people/[id]/say", "POST platform/claims", "POST platform/deliveries/redrive", "POST platform/jobs/requeue", "POST platform/lines/refile", "POST platform/lines/release", "POST platform/lines/replace", "POST platform/lines/retry", "POST platform/partners/payout", "POST platform/partners/second-factor", "POST platform/partners/standing", "POST platform/partners/status", "POST platform/requests", "POST platform/requests/step", "POST platform/support/kind", "POST platform/support/mark", "POST platform/support/resend", "POST platform/waitlist/invited", "POST playbooks", "POST playbooks/[id]/run", "POST reach-out-replies/[id]/undo", "POST reach-out-sends/[id]/decide", "POST reach-out-sends/[id]/said", "POST reach-outs", "POST reach-outs/[id]/leads", "POST reach-outs/[id]/leads/check", "POST reach-outs/[id]/leads/leave", "POST reach-outs/leads/[id]/said", "POST reach-outs/leads/[id]/stop", "POST reach-outs/preview", "POST receptionist/agent", "POST receptionist/fix", "POST receptionist/keep", "POST receptionist/rehearsals", "POST receptionist/review", "POST receptionist/try", "POST segments", "POST segments/draft", "POST sequences", "POST sequences/[id]/leads", "POST sequences/[id]/leads/check", "POST sequences/[id]/leave", "POST sequences/[id]/move", "POST sequences/[id]/return", "POST sequences/[id]/steps", "POST sequences/[id]/steps/[step]/test", "POST sequences/[id]/steps/[step]/words", "POST sequences/draft", "POST sequences/new", "POST settings/receptionist", "POST setup/request", "POST support/report", "POST team/invite", "POST team/invite/[id]/resend", "POST team/leave", "POST team/partner", "POST templates", "POST templates/draft", "POST templates/message", "POST templates/starter", "POST templates/sync", "POST templates/versions", "POST templates/versions/rewrite", "POST vitals", "POST workspaces/create", "POST workspaces/logo/lookup", "PUT business-record", "PUT contacts/[id]/consent", "PUT contacts/[id]/details", "PUT contacts/[id]/marketing-consent", "PUT contacts/[id]/receptionist", "PUT contacts/[id]/seen", "PUT contacts/consent", "PUT contacts/marketing-consent", "PUT contacts/notes", "PUT contacts/receptionist", "PUT lead-suggestions", "PUT mailboxes/[id]", "PUT me", "PUT me/alerts", "PUT me/devices", "PUT notifications", "PUT people/[id]/business", "PUT playbooks/[id]", "PUT policies", "PUT reach-outs/[id]", "PUT segments/[id]", "PUT sequences/[id]/chain", "PUT sequences/[id]/steps/[step]", "PUT settings", "PUT templates/[id]", "PUT views/[page]", "PUT workspaces/accent", "PUT workspaces/logo"];
/** A route by its key: "POST conversations/[id]/reply". */
type ApiRouteKey = (typeof ROUTE_KEYS)[number];

/**
 * What a card's spec is (Ask Rewired, Phase 3, D6), and the few helpers every family of specs shares. The specs
 * themselves are one file per family beside this one; index.ts puts them together and derives the readings.
 */

/**
 * What a spec reads of what it commits: a card of Ask's, or the same act pressed on a sheet (the dashboard's
 * legacy-bridge/verbs), which is a card with no plan and no summary of its own (the sheets as verbs, 14 Oct 2026).
 */
type VerbCard = Pick<AskProposal, "id" | "payload" | "step" | "summary" | "plan"> & {
    kind: string;
};
/** The lowest role that may commit a card: its commit route's policy role. A viewer commits nothing. */
type ProposalNeeds = "operator" | "partner" | "owner";
/** The client gate (data-bits `gate`, ROLE_PERMS) a card checks before Approve; the route re-checks the role. */
type ProposalGate = "approve" | "autonomy" | "settings" | "team" | "find";
/** A window event, sent once the call that carries it lands: the surfaces a page repaints from. */
interface ProposalEvent {
    type: string;
    detail?: Record<string, unknown>;
}
/** One request a card makes: the route by its key, its params and body as the route takes them. */
interface ProposalCall {
    route: ApiRouteKey;
    params?: Record<string, string>;
    body?: unknown;
    /** The reply's: the card's id, so a second press on Approve queues no second message (D8). */
    idempotencyKey?: string;
    /** "behind": answered when the server accepts, the surfaces read again behind it (client/api.ts). */
    refresh?: "behind";
    /** What the window is told once this call lands. */
    events?: ProposalEvent[];
    /**
     * An undo's call whose row may already be gone (deleted by an earlier press of Undo whose later call was refused, or by
     * hand): its route's 404 counts as done, since what it undoes is not there, and the walk goes on. A row-scoped write
     * reads its row before its key (server/route.ts), so a pressed-again delete is never answered from the key.
     */
    goneIsDone?: true;
}
/** A call the card cannot make from this tab, in the person's words; nothing is sent. */
interface ProposalRefusal {
    refused: string;
}
/** What the tab holds that a card reads: the settings Settings loaded (`__SETTINGS`), which a settings card writes over. */
interface ProposalTab {
    settings: {
        config?: Record<string, unknown> | null;
        version?: number;
    } | null;
}
/** How the second call went, for the receipt: the first one stands either way. */
type ProposalThen = {
    ok: true;
} | {
    ok: false;
    message: string;
};
interface ProposalUndo {
    /** The undo button's words, written onto the card by its builder; null where this card has none. */
    label(p: Pick<AskProposal, "payload">): string | null;
    /**
     * How long it stays true (askUndoOpen): `cancelable` while the send's own cancel window is open; `ten_minutes`
     * for ASK_UNDO_MS; `version` for ASK_UNDO_MS and only while nobody has saved the settings since.
     */
    window: "cancelable" | "ten_minutes" | "version";
    /** What the commit keeps for the undo, from the card, the route's answer and the tab at Approve; null for none. */
    record(p: VerbCard, data: unknown, tab: ProposalTab): Record<string, unknown> | null;
    /**
     * The call that reverses it, from what the commit kept and what the tab holds now; or the calls, made in order and
     * stopping at the first refused, where what the commit made is several rows each with its own door (a message's
     * versions).
     */
    call(record: Record<string, unknown>, tab: ProposalTab): ProposalCall | readonly ProposalCall[] | ProposalRefusal;
    /** What the undo did: from the last call's answer, and what the commit kept. */
    receipt(data: unknown, record: Record<string, unknown>): string;
    /**
     * What an undo of several calls says when one after the first is refused: what the `landed` calls before it did, then
     * the refusal, so a person is never told only of the refusal after part of it went. Absent, the refusal alone.
     */
    partial?(record: Record<string, unknown>, landed: number, refused: string): string;
}
interface ProposalSpec {
    needs: ProposalNeeds;
    /** What the card does, for the refusal a member below `needs` hears: every kind above operator says it. */
    doing?: string;
    gate: ProposalGate;
    /**
     * The call Approve makes; `tab` is what the tab held when Approve was pressed. Or the calls, made in order and stopping
     * at the first refused, where one act is several requests of its door: a selection bigger than its batch door takes
     * (fifty people a request), one card for all of them (the operator, 15 Oct 2026: selection by rule).
     */
    commit(p: VerbCard, tab: ProposalTab): ProposalCall | readonly ProposalCall[] | ProposalRefusal;
    /**
     * What several calls answered, as one answer the receipt, the undo and `made` read: absent, the last call's. A batch
     * door's (`done`, `failed`, `skipped`) is summed by `gatherCounts`.
     */
    gather?(answers: readonly unknown[]): unknown;
    /**
     * A second call on the first one's answer, or null for none: a deal's next step names the row the door wrote. A
     * refusal sends nothing and is said on the receipt as the second call's failure; the first call stands.
     */
    then?(p: VerbCard, data: unknown): ProposalCall | ProposalRefusal | null;
    receipt(p: VerbCard, data: unknown, then?: ProposalThen): string;
    /**
     * The id of what the commit made, from the route's answer, that a later step of a plan names by its token
     * (`@step:n`, contracts resolveSteps): a message's version, which a send names the message by. Absent, or null, where
     * the card makes nothing a step names.
     */
    made?(p: VerbCard, data: unknown): string | null;
    undo?: ProposalUndo;
    /** Where the card's Open goes, or null; `outcome` is what became of it. */
    open(p: Pick<AskProposal, "payload">, outcome: AskProposalOutcome | null): string | null;
}
/** A kind above operator: a member below it is refused in words, so its spec says what the card does. */
interface ProposalSpecAboveOperator extends ProposalSpec {
    needs: "partner" | "owner";
    doing: string;
}

/** Each kind only Ask's cards commit, by its spec. Each keeps its own type, so the kinds above operator are known. */
declare const ASK_ONLY_SPECS: {
    whisper: ProposalSpec;
    call_hand_over: ProposalSpec;
    policy: ProposalSpec;
    invite: ProposalSpecAboveOperator;
    broadcast: ProposalSpec;
    playbook: ProposalSpec;
    playbook_channels: ProposalSpec;
    message: ProposalSpec;
    person_details: ProposalSpec;
    list: ProposalSpec;
    list_change: ProposalSpec;
    list_delete: ProposalSpec;
    lead_search: ProposalSpecAboveOperator;
    people_search: ProposalSpecAboveOperator;
    reach_out_add: ProposalSpec;
    lead_stage: ProposalSpec;
    lead_mark: ProposalSpecAboveOperator;
    lead_later: ProposalSpec;
    leads_bulk: ProposalSpec;
    leads_check: ProposalSpecAboveOperator;
    lead_addressee: ProposalSpecAboveOperator;
    lead_list: ProposalSpec;
    lead_search_more: ProposalSpecAboveOperator;
    reach_out_make: ProposalSpec;
    reach_out_said: ProposalSpec;
    review_reply: ProposalSpec;
    follow_up: ProposalSpec;
};
/** The kinds only Ask's cards commit. */
type AskOnlyKind = keyof typeof ASK_ONLY_SPECS;

export { ASK_ONLY_SPECS, type AskOnlyKind };
