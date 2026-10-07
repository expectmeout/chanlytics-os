/**
 * What the bulk bar holds between draws, and what every one of its parts reads (moved from legacy/pages/people.jsx
 * PeopleBulkBar, decision 0015). One hook holds the state, in the order the bar always kept it; the acts, the phone's
 * bar and the desk's are plain functions over the context it makes.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import type { PersonRowVM } from "@chanlytics/contracts";
import type { Flash, SavedList } from "../types";

/** A yes waiting for the note that says which forms: the purpose, and the way it was given. */
interface SlipsAsk {
  purpose: "conversational" | "marketing";
  source: { id: string; label: string };
}

/** The bar's own state: busy, the naming of a new list, the note, and a yes on sign-up forms waiting for its note. */
export function useBulkState() {
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  // A yes on sign-up forms waits for the note that says which forms: a stack of signed slips is attested by it. The
  // spoken ways are recorded at once.
  const [slips, setSlips] = useState<SlipsAsk | null>(null);
  const [slipsNote, setSlipsNote] = useState("");
  return {
    busy,
    setBusy,
    naming,
    setNaming,
    name,
    setName,
    noting,
    setNoting,
    note,
    setNote,
    slips,
    setSlips,
    slipsNote,
    setSlipsNote,
  };
}
export type BulkState = ReturnType<typeof useBulkState>;

/** What the bar was handed, and what it worked out of it: who is picked, in fifties, and where a selection goes next. */
export interface BulkProps {
  sel: ReadonlySet<string>;
  rows: readonly PersonRowVM[];
  saved: readonly SavedList[];
  savedRead: boolean;
  canEdit: boolean;
  canExport: boolean;
  onClear: () => void;
  onKeep: (rest: string[]) => void;
  flash: Flash;
  activeSaved: SavedList | null;
  phone: boolean;
  sheet: string | null;
  onSheet: (step: string | null) => void;
  onSelectAll: (() => void) | null;
  lead: ReactNode;
  acts: readonly string[] | null;
}

export interface BulkCtx extends BulkProps {
  st: BulkState;
  keeps: (act: string) => boolean;
  picked: PersonRowVM[];
  ids: string[];
  batch: string[];
  rest: string[];
  restWords: string;
  isOwner: boolean;
  sources: readonly { id: string; label: string }[];
  offersSources: readonly { id: string; label: string }[];
}
