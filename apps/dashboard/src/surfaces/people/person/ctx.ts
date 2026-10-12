/**
 * What the person's page holds and hands to what it draws (decision 0015, step 5): the person as read, who is looking, the
 * page's own state, and the one toast. `ClientProfileReal` builds it once a draw and every part of the page is a function of it.
 */
import type { Dispatch, SetStateAction } from "react";
import type { PersonRowVM, PersonTab, PersonVM } from "@chanlytics/contracts";
import type { useRecordFold } from "../../kit/record/hooks";
import type { FlashFn } from "../person-verbs";

/** The typed-name confirmation to delete a person: open, what was typed, whether the delete is out, and what went wrong. */
export interface DelState {
  open: boolean;
  typed: string;
  busy: boolean;
  error: string | null;
}

/**
 * Two records of one person becoming one (0028): open, the other record chosen, what was typed (the kept person's name,
 * as Delete asks), whether the merge is out, and what went wrong.
 */
export interface MergeState {
  open: boolean;
  pick: string | null;
  typed: string;
  busy: boolean;
  error: string | null;
}

/** A doubt being settled as two people (0034 step 4): which one is out, and what went wrong. */
export interface DoubtState {
  busy: string | null;
  error: string | null;
}

/** The receptionist's mode being set: whether it is out, and what went wrong. */
export interface RmState {
  busy: boolean;
  error: string | null;
}

/** A fold of the card's editors, as the record kit's hook holds it. */
export type Fold = ReturnType<typeof useRecordFold>;

export interface PageCtx {
  p: PersonVM;
  /** The person as the deal card reads them: with the People row's proposal follow-up laid on, where one runs. */
  dealP: PersonVM;
  /** Their first name, or "them" for a person known by number; and how a toast names them. */
  first: string;
  who: string;
  isOwner: boolean;
  /** The roles ROLE_PERMS gives `approve`: operator, the partner (0012) and the owner. */
  canRecord: boolean;
  flash: FlashFn;
  load: () => void;
  /** The reading failed while a copy this tab held is on screen. */
  error: string | null;
  onBack: () => void;
  del: DelState;
  setDel: Dispatch<SetStateAction<DelState>>;
  merge: MergeState;
  setMerge: Dispatch<SetStateAction<MergeState>>;
  /**
   * What a merge may choose from: People's other rows the door could take with this person (not one with a different
   * number or address, which it refuses as two people). Null while People has not been read.
   */
  others: PersonRowVM[] | null;
  doubt: DoubtState;
  setDoubt: Dispatch<SetStateAction<DoubtState>>;
  rm: RmState;
  setRm: Dispatch<SetStateAction<RmState>>;
  tlFilter: string;
  setTlFilter: Dispatch<SetStateAction<string>>;
  tlAll: boolean;
  setTlAll: Dispatch<SetStateAction<boolean>>;
  folds: { rm: Fold; visit: Fold; offers: Fold };
  /** The tab the address names (0052), as this width draws it: a desk's Deals is a phone's Overview, a phone's About a desk's. */
  tab: PersonTab;
  /** Move to a tab: the address replaced, so the page is not mounted again and Back leaves the person. */
  goTab: (tab: PersonTab) => void;
  /** The page as a phone draws it (the People phone's 900px): one column, About a tab of its own. */
  phone: boolean;
  /** The business sheet (0052), open or not; the door that opened it takes focus back as it closes (the kit's Sheet). */
  sheet: boolean;
  setSheet: Dispatch<SetStateAction<boolean>>;
  /** Open their thread with words ready (hero.tsx openWith), for every send the page offers. */
  compose: (text?: string | null) => void;
}

/** The digits of a number, for comparing what was typed with a phone. */
export const digitsOf = (x: string | null | undefined): string => String(x || "").replace(/\D/g, "");
