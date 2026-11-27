/**
 * What People hands the frame (decision 0151): the one deal sheet and the one step sheet it draws once, the asks that
 * open them from anywhere (the Inbox's thread, the Calendar, the Pipeline, a person's deal card), and People's scopes,
 * the order of the frame's strip of views. The boot provides them (bridge/boot/installs.ts, `peopleFrameParts`), as
 * people-globals.ts published them on the window until 26 Nov 2026. A module of its own, so People's courier
 * (people-detail.ts), which the bridge's own reads lean on, does not reach the sheets' code through it.
 */
import { provide } from "@/bridge/provided";
import { DealSheetHost, StepSheetHost, askDealSheet, askStepSheet } from "./doors";
import { plScopeRoute, plScopes } from "../words";

declare module "@/bridge/provided" {
  interface BridgeParts {
    /** The one deal sheet and the one step sheet, which the frame draws once, and the asks that open them. */
    sheets: PeopleSheets;
    /** People's scopes and the route of each, for where a route stands on the frame's strip of views. */
    peopleScopes: { list: typeof plScopes; routeOf: typeof plScopeRoute };
  }
}

/** People's two sheets as the frame draws them, and what opens each from anywhere (doors.tsx). */
interface PeopleSheets {
  DealHost: typeof DealSheetHost;
  StepHost: typeof StepSheetHost;
  openDeal: typeof askDealSheet;
  openStep: typeof askStepSheet;
}

/** Provide People's sheets and scopes to the frame. */
export function installPeopleFrameParts(): void {
  provide("sheets", {
    DealHost: DealSheetHost,
    StepHost: StepSheetHost,
    openDeal: askDealSheet,
    openStep: askStepSheet,
  });
  provide("peopleScopes", { list: plScopes, routeOf: plScopeRoute });
}
