/**
 * What the finder set aside, per search (decision 0133, step 4): the team's view of the places a search judged and
 * did not count, which the owner never sees. A search shows its finished leads alone; what it set aside stays among its
 * members for dedupe and the priors, and is read here, where a search that came back short is looked into. Read on
 * the back office's client, one workspace by id, and worded by the Leads page's own rules (leadExclusionWord, the
 * class words), so the team reads what the owner would have.
 */
import {
  DbFailure,
  LEAD_CLASS_WORDS,
  isLeadList,
  leadExclusionWord,
  type LeadSearchDto,
  type TenantId,
} from "@chanlytics/contracts";
import { listSearchSpend, listSetAsidePlaces } from "@chanlytics/db/ops";
import { listSearches, toSearchDto } from "../leads/searches";
import type { BackOffice } from "../shared/back-office";
import { embedded } from "@chanlytics/db/shared";

/** The places one search's view shows, newest first. */
const SET_ASIDE_SHOWN = 200;

/** One search in the view: what it counted and set aside, and what it spent on the provider and its judge. */
interface SetAsideSearch {
  id: string;
  name: string;
  asked_on: string;
  counted: number;
  review: number;
  excluded: number;
  cost_usd: number;
}

/** One place a search set aside: its name, why, in the Leads page's words, the term that found it, and when. */
interface SetAsidePlace {
  name: string;
  why: string;
  term: string | null;
  at: string;
}

/** What each search spent, every round's provider and judge together, to the cent. */
async function spendOf(office: BackOffice, tenantId: TenantId, ids: string[]): Promise<Map<string, number>> {
  const spent = new Map<string, number>();
  if (!ids.length) return spent;
  const { data, error } = await listSearchSpend(office.db, tenantId, ids);
  if (error) throw new DbFailure(error, "cannot read what the searches spent");
  for (const r of data)
    spent.set(r.search_id, (spent.get(r.search_id) ?? 0) + Number(r.cost_usd) + Number(r.judge_usd));
  return new Map([...spent].map(([id, usd]) => [id, Math.round(usd * 100) / 100]));
}

/** The places one search set aside, each worded as its Leads page would. */
async function setAsideOf(office: BackOffice, tenantId: TenantId, search: LeadSearchDto): Promise<SetAsidePlace[]> {
  const { data, error } = await listSetAsidePlaces(office.db, tenantId, search.id, SET_ASIDE_SHOWN);
  if (error) throw new DbFailure(error, "cannot read what the search set aside");
  return data.map((m) => ({
    name: embedded(m.lead)?.business_name ?? "",
    why: m.class === "review" ? LEAD_CLASS_WORDS.review : leadExclusionWord(search, m.excluded_by),
    term: m.term,
    at: m.created_at,
  }));
}

/** A workspace's searches the finder ran, and what the one asked for (else the newest) set aside. */
export async function getSetAside(
  office: BackOffice,
  tenantId: TenantId,
  searchId: string | null,
): Promise<{ searches: SetAsideSearch[]; search_id: string | null; places: SetAsidePlace[] }> {
  const searches = (await listSearches({ supabase: office.db }, tenantId))
    .map(toSearchDto)
    .filter((s) => !isLeadList(s));
  const spent = await spendOf(
    office,
    tenantId,
    searches.map((s) => s.id),
  );
  const open = searches.find((s) => s.id === searchId) ?? searches[0] ?? null;
  return {
    searches: searches.map((s) => ({
      id: s.id,
      name: s.name,
      asked_on: s.asked_on,
      counted: s.round?.counted ?? 0,
      review: s.round?.review ?? 0,
      excluded: s.round?.excluded ?? 0,
      cost_usd: spent.get(s.id) ?? 0,
    })),
    search_id: open?.id ?? null,
    places: open ? await setAsideOf(office, tenantId, open) : [],
  };
}
