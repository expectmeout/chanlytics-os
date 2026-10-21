/**
 * Which campaign Reports › Campaigns is narrowed to, as the page holds it (Ruben, 21 Oct 2026: each campaign separated as
 * Reports › Ads separates each ad): the scope the address says (`reports/campaigns:<days>:seq:<id>`, contracts
 * campaignReportRoute), its write, and one sequence's read where it names one. The picker, one campaign's cards, their fold
 * and their reads are a chunk of their own (campaigns-one.tsx), fetched only where the Campaigns lens is drawn, as the Ads lens
 * is (ads-load.ts), so the Reports page every workspace loads carries none of them. The Sequences list the picker lists is read
 * once the picker is reached for (`warm`: a pointer over it, its focus, a press), so a move between lenses asks for nothing.
 */
import { useEffect, useReducer, useState } from "react";
import {
  CAMPAIGN_SCOPE_ALL,
  campaignReportRoute,
  type CampaignChoice,
  type CampaignOneVM,
  type CampaignScope,
  type LensId,
  type ReportsParts,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { reportWindowOf } from "@chanlytics/contracts/report-window";
import { navigate } from "../../legacy-verbs";
import type { ReportsSurface } from "../surface";
import type { OneRead } from "./campaigns-one";

/** What the chunk holds: its reads, its fold, and what it draws. */
interface OneParts {
  readRows: (typeof import("./campaigns-one"))["readRows"];
  readCampaignOne: (typeof import("./campaigns-one"))["readCampaignOne"];
  oneStateOf: (typeof import("./campaigns-one"))["oneStateOf"];
  choicesOf: (typeof import("./campaigns-one"))["choicesOf"];
  Row: (typeof import("./campaigns-one"))["CampaignScopeRow"];
  OneLens: (typeof import("./campaigns-one"))["CampaignOneLens"];
}

/** What one campaign's read draws: reading, failed (with its Retry), gone, or its fold. */
export type OneState =
  | { state: "reading" }
  | { state: "failed"; retry: () => void }
  | { state: "gone" }
  | { state: "read"; vm: CampaignOneVM; counting: boolean };

/** What Reports asks of the Campaigns lens's scope: the picker's choices and its write, and one campaign's read where it names one. */
export interface CampaignsScopeHere {
  scope: CampaignScope;
  choices: CampaignChoice[];
  onScope: (scope: CampaignScope) => void;
  /** Read the Sequences list the picker lists, once: the picker reached for. */
  warm: () => void;
  /** One campaign's read; null for every campaign. */
  one: OneState | null;
  /** The frame's sentence for one campaign, once read; null for every campaign, which says the lens's own. */
  head: string | null;
  /** The chunk, once fetched: what the lens draws the scope's row and one campaign with; null before it lands. */
  parts: OneParts | null;
}

/** The chunk, once it has been fetched; null before that, and always null where `on` is false. */
function useOneParts(on: boolean): OneParts | null {
  const [parts, setParts] = useState<OneParts | null>(null);
  useEffect(() => {
    if (!on || parts !== null) return undefined;
    let live = true;
    void import("./campaigns-one").then((m) => {
      if (!live) return;
      setParts({
        readRows: m.readRows,
        readCampaignOne: m.readCampaignOne,
        oneStateOf: m.oneStateOf,
        choicesOf: m.choicesOf,
        Row: m.CampaignScopeRow,
        OneLens: m.CampaignOneLens,
      });
    });
    return () => {
      live = false;
    };
  }, [on, parts]);
  return on ? parts : null;
}

/** The sequences the picker lists, read once the picker is reached for; null until then. */
function useRows(parts: OneParts | null, asked: boolean): readonly SequenceRowDto[] | null {
  const [rows, setRows] = useState<readonly SequenceRowDto[] | null>(null);
  useEffect(() => {
    if (!parts || !asked || rows) return undefined;
    let live = true;
    void parts.readRows().then((r) => {
      if (live && r) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [parts, asked, rows]);
  return rows;
}

/** One sequence's record and its batches over the days shown, as the chunk reads them, page by page. */
function useOne(parts: OneParts | null, id: string | null, from: string, again: number): OneRead | null {
  const [read, setRead] = useState<OneRead | null>(null);
  const key = `${id ?? ""}|${from}|${again}`;
  useEffect(() => {
    if (!parts || !id) return undefined;
    let live = true;
    void parts.readCampaignOne(
      id,
      from,
      (r) => {
        if (live) setRead({ ...r, key });
      },
      () => live,
    );
    return () => {
      live = false;
    };
  }, [parts, id, from, key]);
  return read && read.key === key ? read : null;
}

/**
 * The scope the address says and what it draws: every campaign, or one sequence over the days shown. Narrowing replaces the
 * entry, as Ads' does: a scope is a setting of the page, and the days stay.
 */
export function useCampaignsScope(lens: LensId, at: ReportsParts, R: ReportsSurface | null): CampaignsScopeHere {
  const on = lens === "campaigns" && R !== null;
  const parts = useOneParts(on);
  const scope: CampaignScope = at.scope && at.scope.kind === "sequence" ? at.scope : CAMPAIGN_SCOPE_ALL;
  const id = on && scope.kind === "sequence" ? scope.id : null;
  const [asked, warm] = useReducer(() => true, false);
  const rows = useRows(parts, asked);
  const window = R ? reportWindowOf(R.range, R.vm.today) : null;
  const [again, retry] = useReducer((n: number) => n + 1, 0);
  const read = useOne(parts, id, window?.from ?? "", again);
  const onScope = (next: CampaignScope) =>
    navigate(campaignReportRoute(at.days, next.kind === "all" ? CAMPAIGN_SCOPE_ALL : next), { replace: true });
  const choices = parts ? parts.choicesOf(rows ?? [], scope) : [];
  const base = { scope, choices, onScope, warm, parts };
  if (!id || !window) return { ...base, one: null, head: null };
  if (!parts) return { ...base, one: { state: "reading" }, head: null };
  const one = parts.oneStateOf(read, { id, from: window.from, to: window.to }, retry);
  return { ...base, one, head: one.state === "read" ? one.vm.head : null };
}
