/**
 * What a selection can become: people on a list, a yes on record, a file (moved from legacy/pages/people.jsx
 * PeopleBulkBar, decision 0015). Adding to a list and recording a yes are owner-or-operator on the server; the bar shows
 * what the role allows and says why when it does not. `phone`: the bar is docked along the foot of a phone's pane and
 * scrolls sideways, so its menus are placed against the window (MoreMenu escape), which that scroll cannot cut off.
 * `lead` is a page's own act, drawn first after the count (the Pipeline's Mark as passed · N); `acts` names which of
 * People's own it keeps ("lists", "consent", "receptionist", "note", "export"), every one where it is not given.
 * The hooks are one hook's (bulk-state.ts), in the order the bar always kept its state.
 */
import type { ReactNode } from "react";
import type { PersonRowVM } from "@chanlytics/contracts";
import type { Flash, SavedList } from "../types";
import { bulkActs, bulkCtx } from "./bulk-acts";
import { useBulkState } from "./bulk-state";
import { deskBulk } from "./desk-bulk";
import { phoneBulk } from "./phone-bulk";

export function PeopleBulkBar({
  sel,
  rows,
  saved,
  savedRead = true,
  canEdit,
  canExport,
  onClear,
  onKeep = () => undefined,
  flash,
  activeSaved = null,
  phone = false,
  sheet = null,
  onSheet = () => undefined,
  onSelectAll = null,
  lead = null,
  acts = null,
}: {
  sel: ReadonlySet<string>;
  rows: readonly PersonRowVM[];
  saved: readonly SavedList[];
  savedRead?: boolean;
  canEdit: boolean;
  canExport: boolean;
  onClear: () => void;
  onKeep?: (rest: string[]) => void;
  flash: Flash;
  activeSaved?: SavedList | null;
  phone?: boolean;
  sheet?: string | null;
  onSheet?: (step: string | null) => void;
  onSelectAll?: (() => void) | null;
  lead?: ReactNode;
  acts?: readonly string[] | null;
}) {
  const st = useBulkState();
  const b = bulkCtx(
    {
      sel,
      rows,
      saved,
      savedRead,
      canEdit,
      canExport,
      onClear,
      onKeep,
      flash,
      activeSaved,
      phone,
      sheet,
      onSheet,
      onSelectAll,
      lead,
      acts,
    },
    st,
  );
  const a = bulkActs(b);
  return phone ? phoneBulk(b, a) : deskBulk(b, a);
}
