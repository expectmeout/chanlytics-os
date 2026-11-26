import {
  POLICY_CLASS_MODES,
  POLICY_CLASS_WORDS,
  POLICY_MODE_WORDS,
  policyClassOffered,
  policyModeOffered,
  type FactSuggestionDto,
  type HeldDraftsByIntent,
  type SequenceEvidenceDto,
  type WeekApprovedRecord,
  type OwnModesDto,
  type PolicyClass,
  type PolicyLimits,
  type PolicyMode,
} from "@chanlytics/contracts";
import { provide, provided } from "./provided";
/**
 * The workspace policy matrix, on the mockup's own store interface.
 *
 * The charter keeps the mockup's store interface (rows, modes, `modeOf(id)`, `set(id, mode)`), and what reads it (the
 * Settings matrix, the policy chip beside every approval in the Inbox and Today) asks the bridge for it, provided as
 * `policy`. It answers from the settings surface's `policies` (the settings read's, bridge/surfaces/settings.ts).
 *
 * The rows the settings read holds have three states:
 *   undefined  not read yet: a cold tab before settings lands, or a settings read that failed twice -- no modes, as
 *              for a failed read (the seeds a demo session read here went with demo mode, 16 Nov 2026)
 *   null       the bridge ran and the read FAILED — no modes, never the seeds
 *   object     the workspace's real rows
 * It answered from the seeds while undefined, so a real workspace's chips said the mockup's modes ("Replies · holds
 * it") until settings landed, or for the whole visit when it did not: a fact the database never said. They were a
 * window global beside the surface, `__POLICIES`, until 12 November 2026.
 *
 * Honesty rule for the rows: every class here has an enforcer — the
 * receptionist for replies, questions and bookings (the prompt's rules and
 * layer two), the playbooks for re-engage, offers and proposal follow-ups
 * (0006, every workspace's), the review sweep for reviews, and
 * a database trigger for money, which is locked. A class
 * without one is not offered as a switch, and each offers only the modes
 * its enforcer honours (`modes`: contracts POLICY_CLASS_MODES, the rule the
 * policies route refuses by).
 */

export type UiMode = "Auto" | "Veto" | "Ask" | "Never";
// screen-word: the modes' ids, as a mode is filed: a page says UI_MODE_WORDS
export const UI_MODES: readonly UiMode[] = ["Auto", "Veto", "Ask", "Never"];
// screen-word: the modes' ids, as a mode is filed: a page says UI_MODE_WORDS
const LABELS: Record<PolicyMode, UiMode> = { auto: "Auto", veto: "Veto", ask: "Ask", never: "Never" };

/**
 * A UiMode is a FILING word, not a word anyone reads. What the pane and the
 * chips show is contracts' POLICY_MODE_WORDS, keyed here by the label the
 * mockup's store already speaks so no reader has to learn a second vocabulary.
 */
export const UI_MODE_WORDS: Record<UiMode, (typeof POLICY_MODE_WORDS)[PolicyMode]> = {
  Auto: POLICY_MODE_WORDS.auto,
  Veto: POLICY_MODE_WORDS.veto,
  Ask: POLICY_MODE_WORDS.ask,
  Never: POLICY_MODE_WORDS.never,
};

export interface UiRowMeta {
  /** The mockup's id (the chip callers use these). */
  id: string;
  /** The policies.class it maps to. */
  cls: string;
  label: string;
  note: string;
  chip: string;
  locked?: boolean;
  /** The modes the runtime honours for this class (contracts POLICY_CLASS_MODES), as the pane spells them. */
  modes: readonly UiMode[];
  /** What each mode means for THIS class, when the general hint would mislead. */
  hints?: Partial<Record<UiMode, string>>;
}

// label, note and chip are the one set of words (contracts POLICY_CLASS_WORDS), and the modes the one rule
// (POLICY_CLASS_MODES); the rest is this pane's.
const W = (cls: PolicyClass) => ({
  label: POLICY_CLASS_WORDS[cls].name,
  note: POLICY_CLASS_WORDS[cls].note,
  chip: POLICY_CLASS_WORDS[cls].short,
  modes: POLICY_CLASS_MODES[cls].map((m) => LABELS[m]),
});

export const UI_ROWS: readonly UiRowMeta[] = [
  { id: "reply", cls: "reply", ...W("reply") },
  {
    id: "faq",
    cls: "faq",
    ...W("faq"),
    hints: {
      Auto: "answers from your business profile · a price only as your settings allow",
      Ask: "tells them a person will get back with the details, and lands the conversation in Needs you",
    },
  },
  {
    id: "book",
    cls: "booking",
    ...W("booking"),
    hints: {
      Auto: "sends your booking link when they want to book, move or cancel",
      Ask: "tells them a person will confirm, never sends the link, and lands the conversation in Needs you",
    },
  },
  { id: "reengage", cls: "reengage", ...W("reengage") },
  // Beside Win-back (0006): the proposal follow-up's class, how a new one starts (decision 0064), in every workspace (0008).
  { id: "follow_up", cls: "follow_up", ...W("follow_up") },
  { id: "campaign", cls: "campaign", ...W("campaign") },
  // Beside the campaigns (Reach out, Part 4 PR 6): how a new sequence to leads starts. Never auto (decision 0064).
  { id: "outreach", cls: "outreach", ...W("outreach") },
  {
    id: "reviews",
    cls: "reviews",
    ...W("reviews"),
    hints: {
      Auto: "answers each new review on Google within the hour, in the business's name · never about money",
      // Holds it and Ask me write each reply ahead and hold it on Reports (decision 0064, step 6).
      Veto: "writes each reply and posts it after 30 minutes on Reports, unless you stop it · never about money",
      Ask: "writes each reply and holds it on Reports for your approval · you send it",
      Never: "writes nothing · you reply in your own words",
    },
  },
  { id: "money", cls: "money", ...W("money"), locked: true },
  // Content (00714; canvas v18, board B5): a row per act, drawn in the pane's own Content card (content-rows.tsx).
  { id: "post", cls: "post", ...W("post") },
  {
    id: "plan_approve",
    cls: "plan_approve",
    ...W("plan_approve"),
    hints: {
      Auto: "approves the week AI plans as soon as it is ready · each post goes up at its time",
      Veto: "holds the week AI plans and approves it at 8:00 AM, unless you stop it on the Week or Today",
      Ask: "waits for your Approve the week · nothing goes up until you press it",
    },
  },
  { id: "ad_change", cls: "ad_change", ...W("ad_change") },
  { id: "comment_reply", cls: "comment_reply", ...W("comment_reply") },
];

export interface PolicyRecordLike {
  class: string;
  mode: string;
  /**
   * The row's dials, as the policies' schema holds them (contracts PolicyLimitsSchema): said, not a record of `unknown`, so
   * the settings read's snapshot has a fingerprint (surface-cache.ts, SURFACE_SHAPES).
   */
  limits?: PolicyLimits | null;
}

/** The policy rows the settings read holds (the settings surface's `policies`). */
export interface PoliciesSurface {
  rows: PolicyRecordLike[];
  role: string | null;
  /** The drafts held for the owner, by intent (decision 0063): each row's line; null where the read failed or is old. */
  held?: HeldDraftsByIntent[] | null;
  /** The notes the owner's corrections suggest, waiting (decision 0063); null where the read failed or is old. */
  suggestions?: FactSuggestionDto[] | null;
  /** The people whose receptionist has a mode of their own (Replies' line); null where the read failed or is old. */
  ownModes?: OwnModesDto | null;
  /** The last week's replies and their tokens, which say the day's budget in replies; null where unread or old. */
  replyTokens?: { replies: number; tokens: number } | null;
  /** What each sequence's batches did (decision 0064): the sequences' rows' line; null where unread or old. */
  evidence?: SequenceEvidenceDto[] | null;
  /** The weeks approved, newest first (00714): AI's suggested rung for Approve the week; null where unread or old. */
  weeksApproved?: WeekApprovedRecord[] | null;
}

export interface UiRow extends UiRowMeta {
  /** The stored mode as the UI spells it; null when no row exists. Money is
   *  always Never: the trigger makes anything else impossible. */
  mode: UiMode | null;
  limits: PolicyLimits;
}

const EMPTY: PoliciesSurface = { rows: [], role: null };

export function modeLabel(dbMode: string | null | undefined): UiMode | null {
  return dbMode ? ((LABELS as Record<string, UiMode>)[dbMode] ?? null) : null;
}

export function dbMode(label: string | null | undefined): string | null {
  if (!label) return null;
  const hit = Object.entries(LABELS).find(([, v]) => v === label);
  return hit ? hit[0] : null;
}

export function uiRows(p: PoliciesSurface): UiRow[] {
  return UI_ROWS.filter((r) => policyClassOffered(r.cls)).map((r) => {
    const rec = p.rows.find((x) => x.class === r.cls);
    return {
      ...r,
      mode: r.locked ? "Never" : modeLabel(rec?.mode),
      limits: rec?.limits ?? {},
    };
  });
}

/**
 * Hold the store that answers from real data. Called once at bridge boot, before React renders. `held` is where the rows are read, each time they are asked for: the settings surface's
 * (settings/business/shell.ts policiesNow), in their three states (the header above).
 */
export function installPolicyStore(held: () => PoliciesSurface | null | undefined): void {
  provide("policy", policyStoreOver(held));
}

/** The store over the rows `held` reads, each time they are asked for. */
function policyStoreOver(held: () => PoliciesSurface | null | undefined) {
  // Not read yet is no modes, as a failed read is (the header above).
  const surface = (): PoliciesSurface | null => held() ?? null;
  return {
    get MODES(): readonly string[] {
      return UI_MODES;
    },
    // Contracts' words: what a mode does is the same fact whatever rows are behind it.
    WORDS: UI_MODE_WORDS,
    get ROWS(): UiRow[] {
      return uiRows(surface() ?? EMPTY);
    },
    forPerm: { booking: "book", money: "money", discount: "money", winback: "reengage", scope: "faq" },
    // By the row's id (book) or by its class (booking): a playbook's chip names the class it runs under.
    row(id: string): UiRow | null {
      const rows = this.ROWS;
      return rows.find((r) => r.id === id) ?? rows.find((r) => r.cls === id) ?? null;
    },
    modeOf(id: string): string | null {
      // A failed read has no modes. A chip with nothing after the dot is the
      // truth; a chip reading the mockup's "Veto" beside a real approval is not.
      return uiRows(surface() ?? EMPTY).find((r) => r.id === id)?.mode ?? null;
    },
    set(id: string, m: string): void {
      const s = surface();
      if (!s) return; // not read, or the read failed: there is nothing to write against
      const r = UI_ROWS.find((x) => x.id === id);
      const mode = dbMode(m);
      const setPolicy = provided("setPolicy");
      if (!r || r.locked || !mode || !setPolicy) return;
      // A mode the class cannot honour is not written: the pane shows a dash there.
      if (!policyModeOffered(r.cls, mode)) return;
      void setPolicy(r.cls, mode);
    },
    /** True when the store answers from the workspace's real rows. */
    real(): boolean {
      return !!surface();
    },
  };
}

/** The workspace's charter as the chips and the matrix read it. */
export type PolicyStore = ReturnType<typeof policyStoreOver>;

declare module "./provided" {
  interface BridgeParts {
    /** The workspace's charter (installPolicyStore), answered from the settings read's rows. */
    policy: PolicyStore;
  }
}
