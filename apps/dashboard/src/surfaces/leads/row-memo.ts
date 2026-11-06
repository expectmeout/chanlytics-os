/**
 * A lead's row made only when it says something else (decision 0103): a change while a member reads rebuilt every row loaded,
 * 763 ms at 12,000, and drew them all again. Now what a refresh found the same keeps its object, and a row's words, keyed by
 * that object, are made again only for a row that changed, a search whose plan changed, or a new minute, since they say times.
 * Apart from surface.ts, which stands at its file limit.
 */
import { MIN_MS, leadRowOf, type LeadRowDto, type LeadRowVM, type LeadSearchDto } from "@chanlytics/contracts";

/** The held rows, each replaced by its fresh copy only where that says something else. */
export function keptRows(held: readonly LeadRowDto[], fresh: ReadonlyMap<string, LeadRowDto>): LeadRowDto[] {
  return held.map((r) => {
    const copy = fresh.get(r.id);
    return copy && JSON.stringify(copy) !== JSON.stringify(r) ? copy : r;
  });
}

/** What of a search a row's words read (what a review waits on, the term it was found for), as one text, made once a search. */
const plans = new WeakMap<LeadSearchDto, string>();
const planWordsOf = (search: LeadSearchDto | null): string => {
  if (!search) return "";
  const held = plans.get(search);
  if (held !== undefined) return held;
  const plan = JSON.stringify(search.plan ?? null);
  plans.set(search, plan);
  return plan;
};

/** A row's words, and what they were made from. */
const madeWords = new WeakMap<LeadRowDto, { vm: LeadRowVM; minute: number; tz: string; plan: string }>();

/** Each row's words, made again only for a row that changed, a search that changed, or a new minute. */
export function leadRowsOf(
  rows: readonly LeadRowDto[],
  at: { tz: string; now: Date; searchOf: (id: string) => LeadSearchDto | null },
): LeadRowVM[] {
  const minute = Math.floor(at.now.getTime() / MIN_MS);
  return rows.map((r) => {
    const search = at.searchOf(r.search_id);
    const plan = planWordsOf(search);
    const was = madeWords.get(r);
    if (was && was.minute === minute && was.tz === at.tz && was.plan === plan) return was.vm;
    const vm = leadRowOf(r, at.tz, at.now, search);
    madeWords.set(r, { vm, minute, tz: at.tz, plan });
    return vm;
  });
}
