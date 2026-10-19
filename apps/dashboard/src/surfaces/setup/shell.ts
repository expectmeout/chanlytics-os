/**
 * What the first run draws of the Business tab (decision 0015, step 10): its rows, its saver and its doors, which the first
 * run's Check and Live draw as that tab does, so the two screens never disagree. They were read off the window, where the
 * frame published them for every page (seed-globals.ts), so each page's first load carried the tab's rows, about 33 KB
 * compressed, that only the first run draws (the loadability review, 19 Oct 2026). Imported here, they come with the
 * first run's own page: only its modules import this one.
 *
 * The tab types the workspace's settings its own way (settings/business/save.tsx Brain and Config), and the first run hands
 * them the settings read as contracts types it (WorkspaceSettings): one value under two hand-written types until the tab's
 * are contracts' (step 11). So the parts cross into the first run under the looser props below, as they did when they
 * were read off the window, and this module is the one place that says so.
 */
import type { ComponentType } from "react";
import { BtLanguagesRow as LanguagesRow, BtRulesRow as RulesRow } from "../settings/business/answers";
import { BtCanCard as CanCard } from "../settings/business/can";
import { BtServicesRow as ServicesRow } from "../settings/business/offer";
import { BtHoursRow as HoursRow, BtZoneRow as ZoneRow } from "../settings/business/open";
import { BtServicesSheet as ServicesSheet } from "../settings/business/services";
import {
  BtAddressRow as AddressRow,
  BtBookingLinkRow as BookingLinkRow,
  BtWebsiteRow as WebsiteRow,
} from "../settings/business/who";

/** A row or card of the Business tab, drawn as that tab draws it: its props are its own, handed on as the JSX handed them. */
type BusinessPart = ComponentType<Record<string, unknown>>;

/** A part of the tab, under the first run's looser props (the module's comment says why). */
const loose = (part: ComponentType<never>): BusinessPart => part as BusinessPart;

export const BtHoursRow = loose(HoursRow);
export const BtZoneRow = loose(ZoneRow);
export const BtAddressRow = loose(AddressRow);
export const BtWebsiteRow = loose(WebsiteRow);
export const BtBookingLinkRow = loose(BookingLinkRow);
export const BtRulesRow = loose(RulesRow);
export const BtServicesRow = loose(ServicesRow);
export const BtLanguagesRow = loose(LanguagesRow);
export const BtServicesSheet = loose(ServicesSheet);
export const BtCanCard = loose(CanCard);

/** The tab's saver and doors, as the first run takes them: their own types, which every call the first run makes fits. */
export { businessTabSave } from "../settings/business/saver";
export type { BusinessTabSave } from "../settings/business/saver";
