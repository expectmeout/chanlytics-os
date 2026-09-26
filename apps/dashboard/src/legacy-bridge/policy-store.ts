import {
  POLICY_CLASS_MODES,
  POLICY_CLASS_WORDS,
  POLICY_MODE_WORDS,
  policyClassOffered,
  policyModeOffered,
  type PolicyClass,
  type PolicyMode,
} from "@chanlytics/contracts";
/**
 * The workspace policy matrix, on the mockup's own store interface.
 *
 * The mockup keeps its charter in `window.POLICY` — rows, modes, `modeOf(id)`,
 * `set(id, mode)` — and three surfaces read it: the Settings matrix, the
 * policy chip beside every approval in the Inbox and Today, and Fleet. Rather
 * than teach each reader about the API, this installs a store with the SAME
 * interface that answers from `window.__POLICIES` (fed by the settings
 * override) and from the seeded store only in the standalone mockup. One
 * swap, every reader truthful.
 *
 * `window.__POLICIES` has three states, and the store treats each as its own:
 *   undefined  the bridge is not running — the standalone mockup, seeds are right
 *   null       the bridge ran and the read FAILED — no modes, never the seeds
 *   object     the workspace's real rows
 *
 * Honesty rule for the rows: every class here has an enforcer — the
 * receptionist for replies, questions and bookings (the prompt's rules and
 * layer two), the playbooks for re-engage, offers and proposal follow-ups
 * (a row only where deals are on, 0006), the review sweep for reviews, and
 * a database trigger for money, which is locked. A class
 * without one is not offered as a switch, and each offers only the modes
 * its enforcer honours (`modes`: contracts POLICY_CLASS_MODES, the rule the
 * policies route refuses by and Ask proposes by).
 */

export type UiMode = "Auto" | "Veto" | "Ask" | "Never";
export const UI_MODES: readonly UiMode[] = ["Auto", "Veto", "Ask", "Never"];
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
      Auto: "answers from your business profile — never a price",
      Ask: "tells them a person will get back with the details, and lands the thread in Needs you",
    },
  },
  {
    id: "book",
    cls: "booking",
    ...W("booking"),
    hints: {
      Auto: "sends your booking link when they want to book, move or cancel",
      Ask: "tells them a person will confirm, never sends the link, and lands the thread in Needs you",
    },
  },
  { id: "reengage", cls: "reengage", ...W("reengage") },
  // Beside Win-back (0006): the proposal follow-up's class, auto, ask or never, where deals are on.
  { id: "follow_up", cls: "follow_up", ...W("follow_up") },
  { id: "campaign", cls: "campaign", ...W("campaign") },
  {
    id: "reviews",
    cls: "reviews",
    ...W("reviews"),
    hints: {
      Auto: "answers each new review on Google within the hour, in the business's name — never about money",
      Ask: "writes a draft when you open a reply on Reports; you send it",
      Never: "writes nothing; you reply in your own words",
    },
  },
  { id: "money", cls: "money", ...W("money"), locked: true },
];

export interface PolicyRecordLike {
  class: string;
  mode: string;
  limits?: Record<string, unknown> | null;
}

/** What the settings override publishes as `window.__POLICIES`. */
export interface PoliciesSurface {
  rows: PolicyRecordLike[];
  role: string | null;
  /** Deals are on here (dealsAreOn, 0008): the follow-ups' row is drawn only then (policyClassOffered). */
  dealsOn: boolean;
}

export interface UiRow extends UiRowMeta {
  /** The stored mode as the UI spells it; null when no row exists. Money is
   *  always Never: the trigger makes anything else impossible. */
  mode: UiMode | null;
  limits: Record<string, unknown>;
}

const EMPTY: PoliciesSurface = { rows: [], role: null, dealsOn: false };

export function modeLabel(dbMode: string | null | undefined): UiMode | null {
  return dbMode ? ((LABELS as Record<string, UiMode>)[dbMode] ?? null) : null;
}

export function dbMode(label: string | null | undefined): string | null {
  if (!label) return null;
  const hit = Object.entries(LABELS).find(([, v]) => v === label);
  return hit ? hit[0] : null;
}

export function uiRows(p: PoliciesSurface): UiRow[] {
  return UI_ROWS.filter((r) => policyClassOffered(r.cls, p.dealsOn)).map((r) => {
    const rec = p.rows.find((x) => x.class === r.cls);
    return {
      ...r,
      mode: r.locked ? "Never" : modeLabel(rec?.mode),
      limits: (rec?.limits as Record<string, unknown> | null | undefined) ?? {},
    };
  });
}

interface SeedStore {
  MODES: readonly string[];
  WORDS?: Record<string, { head: string; sub: string; chip: string; does: string }>;
  ROWS: unknown[];
  forPerm?: Record<string, string>;
  row?: (id: string) => unknown;
  modeOf: (id: string) => string | null;
  set: (id: string, m: string) => void;
}

interface PolicyWindow {
  POLICY?: SeedStore;
  __POLICIES?: PoliciesSurface | null;
  __setPolicy?: (cls: string, mode: string) => Promise<unknown>;
}

/**
 * Replace the seeded store with one that answers from real data. Called once
 * at bridge boot, after the manifest has installed the seeds and before React
 * renders.
 */
export function installPolicyStore(win: PolicyWindow = window as unknown as PolicyWindow): void {
  const seed = win.POLICY;
  const surface = (): PoliciesSurface | null | undefined => win.__POLICIES;
  const store = {
    get MODES(): readonly string[] {
      return surface() === undefined ? (seed?.MODES ?? UI_MODES) : UI_MODES;
    },
    // Contracts' words in every session, the mockup's included: what a mode does
    // is the same fact whether the rows behind it are real or seeded.
    WORDS: UI_MODE_WORDS,
    get ROWS(): unknown[] {
      const s = surface();
      if (s === undefined) return seed?.ROWS ?? [];
      return uiRows(s ?? EMPTY);
    },
    forPerm: seed?.forPerm ?? { booking: "book", money: "money", discount: "money", winback: "reengage", scope: "faq" },
    // By the row's id (book) or by its class (booking): a playbook's chip names the class it runs under.
    row(id: string): unknown {
      const rows = this.ROWS as { id: string; cls?: string }[];
      return rows.find((r) => r.id === id) ?? rows.find((r) => r.cls === id) ?? null;
    },
    modeOf(id: string): string | null {
      const s = surface();
      if (s === undefined) return seed ? seed.modeOf(id) : null;
      // A failed read has no modes. A chip with nothing after the dot is the
      // truth; a chip reading the mockup's "Veto" beside a real approval is not.
      return uiRows(s ?? EMPTY).find((r) => r.id === id)?.mode ?? null;
    },
    set(id: string, m: string): void {
      const s = surface();
      if (s === undefined) {
        seed?.set(id, m);
        return;
      }
      if (!s) return; // the read failed; there is nothing to write against
      const r = UI_ROWS.find((x) => x.id === id);
      const mode = dbMode(m);
      if (!r || r.locked || !mode || !win.__setPolicy) return;
      // A mode the class cannot honour is not written: the pane shows a dash there.
      if (!policyModeOffered(r.cls, mode)) return;
      void win.__setPolicy(r.cls, mode);
    },
    /** True when the store answers from the workspace's real rows. */
    real(): boolean {
      return !!surface();
    },
  };
  win.POLICY = store as unknown as SeedStore;
}
