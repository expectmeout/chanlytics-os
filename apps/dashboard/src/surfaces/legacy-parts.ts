/**
 * The components and hooks a surface that has left the shell still draws from a page that has not (decision 0015).
 *
 * `legacy-verbs.ts` is the verbs; this is the parts. A house component that other pages still draw (`Confirm`,
 * `StatePill`, `PolicyChip`, `FieldError`, the record kit's `RecordSheet`) is JSX the frame loads and publishes on
 * `window`; a TSX surface cannot import it, so it draws it through a door here, and the element it draws is that very
 * component: the tree is what the JSX drew, node for node. Each door is a line to delete on the day the part moves into
 * the kit as TSX (the plan's Phase 3 table names when: `Confirm`, `StatePill` and `MoreMenu` with the Inbox, the record
 * kit and `FieldError` with People), when the surface imports it instead.
 *
 * A part is asked for as it is drawn, never when this module loads: the surface's module may load before the frame's
 * scripts have, and the part exists once they have. A surface that draws where the part is not (a test that loads the
 * page alone) draws nothing in its place, as it drew where the JSX had no part to name.
 */
import type { ComponentType, ReactNode } from "react";

declare global {
  interface Window {
    Confirm?: ComponentType<ConfirmProps>;
    StatePill?: ComponentType<StatePillProps>;
    PolicyChip?: ComponentType<PolicyChipProps>;
    FieldError?: ComponentType<FieldErrorProps>;
    RecordSheet?: ComponentType<RecordSheetProps>;
    UnsavedAsk?: ComponentType<UnsavedAskProps>;
    useUnsavedWork?: (kind: string, key: string | null, options: UnsavedWorkOptions) => UnsavedWork;
    tabDraft?: (kind: string, key?: string | null) => unknown;
  }
}

/** A part that is not there draws nothing: what a JSX page drew where its store had no such row. */
const nothing = (): null => null;

/** The part the frame published under this name, or a component that draws nothing. */
function part<P>(
  name: "Confirm" | "StatePill" | "PolicyChip" | "FieldError" | "RecordSheet" | "UnsavedAsk",
): ComponentType<P> {
  const found: unknown = Reflect.get(window, name);
  return (typeof found === "function" ? found : nothing) as ComponentType<P>;
}

/** The one way an act is confirmed (data-bits `Confirm`): the question, what it does, a Yes that names the verb, a quiet No. */
export interface ConfirmProps {
  question: ReactNode;
  detail?: ReactNode;
  yes?: string;
  no?: string;
  onYes?: () => void;
  onNo?: () => void;
  busy?: boolean;
  busyLabel?: string;
  danger?: boolean;
  typed?: string | null;
  value?: string;
  onType?: ((value: string) => void) | null;
  ready?: boolean | null;
  error?: ReactNode;
  block?: boolean;
  className?: string;
  testid?: string | null;
}
export const confirmPart = (): ComponentType<ConfirmProps> => part<ConfirmProps>("Confirm");

/** The one pill for a state (data-bits `StatePill`): its tone from contracts, its words the page's or the state's own. */
export interface StatePillProps {
  kind: string;
  value: unknown;
  label?: ReactNode;
  className?: string;
  title?: string | null;
  tip?: string | null;
  testid?: string | null;
}
export const statePillPart = (): ComponentType<StatePillProps> => part<StatePillProps>("StatePill");

/** The one policy-class chip (data-bits `PolicyChip`): it names the class's row and follows `policy:changed`. */
export interface PolicyChipProps {
  cls?: string | null;
  className?: string;
}
export const policyChipPart = (): ComponentType<PolicyChipProps> => part<PolicyChipProps>("PolicyChip");

/** One sentence under the box it belongs to, read out as it appears (data-bits `FieldError`). */
export interface FieldErrorProps {
  id?: string | null;
  message?: ReactNode;
  testid?: string | null;
}
export const fieldErrorPart = (): ComponentType<FieldErrorProps> => part<FieldErrorProps>("FieldError");

/** The record kit's sheet (record-sheet.jsx): a modal beside the page with its title, tools, body and foot. */
export interface RecordSheetProps {
  id?: string | null;
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  tools?: ReactNode;
  foot?: ReactNode;
  closeLabel?: string;
  className?: string;
  testid?: string | null;
  focusOn?: { row: string } | null;
  onSave?: (() => void) | null;
  saving?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  cancelLabel?: string;
  gate?: Record<string, unknown> | null;
  footNote?: ReactNode;
  confirm?: ReactNode;
  children?: ReactNode;
}
export const recordSheetPart = (): ComponentType<RecordSheetProps> => part<RecordSheetProps>("RecordSheet");

/** The one question where a composer's Cancel was (record-fold.jsx `UnsavedAsk`): `what` is what has not happened. */
export interface UnsavedAskProps {
  onYes: () => void;
  onNo: () => void;
  busy?: boolean;
  what?: string;
  testid?: string | null;
}
export const unsavedAskPart = (): ComponentType<UnsavedAskProps> => part<UnsavedAskProps>("UnsavedAsk");

/** What a composer says of its words to the rule that keeps them (record-fold.jsx `useUnsavedWork`). */
export interface UnsavedWorkOptions {
  value: unknown;
  dirty: boolean;
  onLeave: () => void;
}

/** What the rule answers: whether words are held, whether Cancel is asking, and the ways to answer it. */
export interface UnsavedWork {
  dirty: boolean;
  asking: boolean;
  leave: () => void;
  discard: () => void;
  stay: () => void;
  /** The server took it: there is nothing left to keep. */
  done: () => void;
}

/**
 * The one rule for a composer's words (record-fold.jsx `useUnsavedWork`): kept in the tab as they are typed, back when the
 * composer opens again, gone when the server takes them. A hook: the frame's own, called from the surface's component,
 * so its state sits in that component. Where the frame has none (a test that loads the page alone), the words are the
 * page's and Cancel closes at once.
 */
export function useLegacyUnsavedWork(kind: string, key: string | null, options: UnsavedWorkOptions): UnsavedWork {
  if (window.useUnsavedWork) return window.useUnsavedWork(kind, key, options);
  return {
    dirty: options.dirty,
    asking: false,
    leave: options.onLeave,
    discard: options.onLeave,
    stay: () => undefined,
    done: () => undefined,
  };
}

/** What the tab kept of a composer's words, by its kind and key; null where the tab has no memory (record-fold.jsx `tabDraft`). */
export function tabDraft(kind: string, key?: string | null): unknown {
  return window.tabDraft ? window.tabDraft(kind, key) : null;
}

/** One row of the workspace's autonomy matrix (data-bits `POLICY`): its class, its label, its chip and whether money locks it. */
export interface PolicyRow {
  id: string;
  label: string;
  note: string;
  def: string;
  chip: string;
  locked?: boolean;
}

/** The mode words a row is drawn in (contracts POLICY_MODE_WORDS through the app's store): what the mode does, not how it is filed. */
interface PolicyWords {
  head: string;
  sub: string;
  chip: string;
  does: string;
}

/** The workspace policy store the classic pages read (`window.POLICY`); the app's is built by legacy-bridge/policy-store.ts. */
export interface PolicyStore {
  WORDS?: Record<string, PolicyWords>;
  row: (id: string) => PolicyRow | null;
  modeOf: (id: string) => string | null;
}

/** The policy row of a class, or null: the store is the frame's, and absent where the frame is not. */
export function policyRow(cls: string | null | undefined): PolicyRow | null {
  const store = (window as Window & { POLICY?: PolicyStore }).POLICY;
  return cls && store && store.row ? store.row(cls) : null;
}
