/**
 * What Setup's rows and the first run still borrow from the shell (decision 0015, step 10): the Business tab's rows, its saver and its doors,
 * which Settings' JSX publishes (pages/business-tab-*.jsx) and which the first run's Check and Live draw as that tab does,
 * so the two screens never disagree. Each is read as it is asked for, never when this module loads. A line here is deleted
 * on the day its owner moves: the Business tab with Settings (step 11).
 */
import type { ComponentType, ReactNode } from "react";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";

/** A row or card of the Business tab, drawn as that tab draws it: its props are its own, handed on as the JSX handed them. */
export type BusinessPart = ComponentType<Record<string, unknown>>;

/** The Business tab's parts the first run draws, under the names Settings' JSX publishes them by. */
type BusinessPartName =
  | "BtHoursRow"
  | "BtZoneRow"
  | "BtAddressRow"
  | "BtWebsiteRow"
  | "BtBookingLinkRow"
  | "BtRulesRow"
  | "BtServicesRow"
  | "BtLanguagesRow"
  | "BtServicesSheet"
  | "BtCanCard";

/** The part Settings' JSX published under this name, or nothing where it has not (a page drawn alone). */
export function businessPart(name: BusinessPartName): BusinessPart | undefined {
  const found: unknown = Reflect.get(window, name);
  return typeof found === "function" ? (found as BusinessPart) : undefined;
}

/** How customers buy, as What you offer draws its choice (`btSellsByChoice`): a function that answers its element. */
type SellsByChoice = (o: {
  id: string;
  vm: unknown;
  value: string | null;
  set: (next: string) => void;
  readOnly: boolean;
  label: boolean;
  testid: string;
}) => ReactNode;

export function sellsByChoice(): SellsByChoice | undefined {
  const found: unknown = Reflect.get(window, "btSellsByChoice");
  return typeof found === "function" ? (found as SellsByChoice) : undefined;
}

/** The config the next save goes on, as the saver holds it. */
export type SaverBase = WorkspaceSettings | null;

/** The tab's one saver: a job at a time, on the config it last read, heard by whoever draws its rows. */
export interface BusinessSaver {
  save(job: unknown): void;
  base(): SaverBase;
  subscribe(fn: () => void): () => void;
}

/** One of the workspace's own doors the tab saves through (the timezone, how customers buy). */
export interface WorkspaceDoor {
  save(o: Record<string, unknown>): void;
  pending(): boolean;
  subscribe(fn: () => void): () => void;
}

/** What the first run takes of the tab's saver and its doors (`window.__businessTabSave`, business-tab-save.jsx). */
export interface BusinessTabSave {
  saver: BusinessSaver;
  zone: WorkspaceDoor;
  sellsBy: WorkspaceDoor;
  draftOf(list: string, base: SaverBase): unknown[];
  foldJob(
    list: string,
    rows: unknown[],
    o: { opened: unknown[]; said: null; done: (() => void) | null; flash: (f: unknown) => void },
  ): unknown;
  /** The patch a row's change is: the first run writes only where a caller asking for a person goes. */
  PATCH_OF: { handoff_number(value: string): unknown };
}

export function businessTabSave(): BusinessTabSave | undefined {
  return (window as Window & { __businessTabSave?: BusinessTabSave }).__businessTabSave;
}
