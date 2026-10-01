/**
 * The few things the lead peek still draws or asks of the legacy shell (decision 0015): Leads' own cells, which move with
 * the page that draws the table (`LeadCallMenu`, `LeadSlotShape`, leads-cells.jsx), the reach-out block of a lead
 * (`LeadReachOut`, reach-out-leads.jsx), the house ⋯ menu (`MoreMenu`, data-bits), the role store and the courier the
 * acts go out through. Each is read as it is asked for, never when this module loads: the peek's module may load before the
 * shell's scripts have, and a part that is not there draws nothing where the JSX's bare global would have thrown. A door
 * is a line to delete on the day its owner moves.
 */
import type { ComponentType, ReactNode } from "react";
import { nothing } from "../../legacy-parts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import type { draftForLead } from "@/legacy-bridge/leads";
import type { Flash, LeadCourier } from "./types";

/** The component the shell published under this name, or nothing where it has not. */
function legacyPart<P>(name: string): ComponentType<P> | undefined {
  const found: unknown = Reflect.get(window, name);
  return typeof found === "function" ? (found as ComponentType<P>) : undefined;
}

/** What the house ⋯ menu takes (data-bits `MoreMenu`): a title, its items, and whether it escapes the pane that scrolls. */
interface MoreMenuProps {
  items: { label: string; icon: string; danger?: boolean; onClick?: () => void }[];
  escape?: boolean;
  title?: string;
  testid?: string | null;
}
export const moreMenuPart = (): ComponentType<MoreMenuProps> => legacyPart<MoreMenuProps>("MoreMenu") ?? nothing;

/** The ways of calling (leads-cells.jsx `LeadCallMenu`): the house menu behind Call, which says how before it rings. */
interface LeadCallMenuProps {
  name: string;
  number: string;
  onDial: () => void;
  onCopy: () => void;
  onLog: () => void;
  btnClass: string;
  label?: ReactNode;
  heading?: boolean;
  size?: number;
  testid?: string;
}
export const leadCallMenuPart = (): ComponentType<LeadCallMenuProps> =>
  legacyPart<LeadCallMenuProps>("LeadCallMenu") ?? nothing;

/** The shape alone, for the peek's reach rows (leads-cells.jsx `LeadSlotShape`): the five shapes the table's rows wear. */
interface LeadSlotShapeProps {
  state: LeadPeekVM["slots"]["phone"]["state"];
}
export const leadSlotShapePart = (): ComponentType<LeadSlotShapeProps> =>
  legacyPart<LeadSlotShapeProps>("LeadSlotShape") ?? nothing;

/** A lead's story with its reach-out and its doors (reach-out-leads.jsx `LeadReachOut`); undefined where none is drawn. */
interface LeadReachOutProps {
  lead: LeadPeekVM;
  flash: Flash;
}
export const leadReachOutPart = (): ComponentType<LeadReachOutProps> | undefined =>
  legacyPart<LeadReachOutProps>("LeadReachOut");

/** The role the member is acting as, View-as included (the role store's `myRole`); a role nobody can read is a viewer's. */
export function myRole(): string {
  return window.ST_STORE && window.ST_STORE.myRole ? window.ST_STORE.myRole() : "viewer";
}

/** The call that must be there to be made: a courier the bridge has not installed is a thrown TypeError, as a missing method was. */
const installed = <F>(act: F | undefined): F => {
  if (!act) throw new TypeError("the leads courier is not installed");
  return act;
};

/** The acts the bridge publishes on the window (`legacy-bridge/leads.ts`), asked for by name as each is called. */
export const windowCourier: LeadCourier = {
  __leadStage: (id, input) => installed(window.__leadStage)(id, input),
  __leadUndo: (opId, version) => installed(window.__leadUndo)(opId, version),
  // The wire's own type wants a draft's words; the pane hands it what the page holds, and the route refuses what is not one.
  __leadDraft: (id, input) => installed(window.__leadDraft)(id, input as Parameters<typeof draftForLead>[1]),
  __leadErase: (id) => installed(window.__leadErase)(id),
};
