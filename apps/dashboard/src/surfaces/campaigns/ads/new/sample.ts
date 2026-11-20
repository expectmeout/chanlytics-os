/**
 * New ad on the page's example (a demo session, or an example chosen from the page's menu): the same one screen, fed
 * from the example's own business and Services, so the example draws the product as it is. Nothing leaves the
 * browser: no model writes these words, no draft is judged by the server, and nothing is made anywhere. The amount and
 * the end are held to the same rules a real draft is (contracts ads/draft.ts); the words are three plain lines that
 * name the example's own business and service, in no one trade's words.
 */
import {
  AD_DRAFT_MILES,
  AD_RUN_DAYS,
  adAmountIssue,
  adEndIssue,
  adLeastTotal,
  addDays,
  daysBetween,
  minorPerUnit,
} from "@chanlytics/contracts";
import type { AdsRead, AdVersion } from "@chanlytics/contracts";
import type { AdCheckDto, AdDraftAnswer, AdDraftState } from "@/server/ads/draft-shape";
import { ADS_DEFAULT_CURRENCY } from "../model/money";
import type { AdSource } from "./source";

/** The least a day the example's account takes, in whole units of its currency: what Meta asks of most accounts. */
const SAMPLE_LEAST_A_DAY = 5;
/** The fewest and the most miles, as a real draft's. */
const SAMPLE_MILES = { least: 1, most: 50 } as const;

/** Three plain versions for the example: what the service is, the business, and how to ask. */
const sampleVersions = (business: string, service: string): AdVersion[] => [
  { headline: service, text: `${service} at ${business}. Message us on WhatsApp and we'll send open times.` },
  { headline: business, text: `${business} has open times for ${service}. Message us on WhatsApp to pick one.` },
  { headline: `Ask about ${service}`, text: `Ask ${business} about ${service}. Message us on WhatsApp.` },
];

/** The example's draft, judged by the rules that need no server: the amount, the end and the area. */
function sampleAnswer(read: AdsRead, sent: AdDraftState | null): AdDraftAnswer {
  const [first] = read.services;
  if (!first) return { can: false, missing: "service" };
  const meta = read.accounts.find((one) => one.platform === "meta");
  const currency = meta?.currency ?? ADS_DEFAULT_CURRENCY;
  const account = { currency, minDailyMinor: SAMPLE_LEAST_A_DAY * minorPerUnit(currency) };
  const service = read.services.find((one) => one.name === sent?.service) ?? first;
  const endDay = sent?.end_day ?? addDays(read.today, AD_RUN_DAYS.draft);
  const days = daysBetween(read.today, endDay);
  const least = adLeastTotal(account, days);
  const total = sent?.total_minor ?? least;
  const miles = sent?.miles ?? AD_DRAFT_MILES;
  const amount = adAmountIssue({ totalMinor: total, days, account, ownerMostMinor: null });
  const end = adEndIssue(read.today, endDay);
  const checks: AdCheckDto[] = [
    ...(amount ? [{ code: "amount" as const, fault: amount.code, nearest_minor: amount.nearestMinor }] : []),
    ...(end ? [{ code: "end" as const, nearest_day: end.nearestDay }] : []),
    ...(miles >= SAMPLE_MILES.least && miles <= SAMPLE_MILES.most
      ? []
      : [{ code: "area" as const, nearest_miles: Math.min(SAMPLE_MILES.most, Math.max(SAMPLE_MILES.least, miles)) }]),
  ];
  return {
    can: true,
    draft: {
      service: service.name,
      // The example has no file of its own: the frame draws its plain tile.
      picture: { id: "", kind: "photo", name: "", made: false },
      miles,
      total_minor: total,
      end_day: endDay,
      versions: sent?.versions ?? [],
      answers: {},
    },
    today: read.today,
    days,
    account: { name: meta?.name ?? "", currency, page: read.business.name, min_daily_minor: account.minDailyMinor },
    amount: { starting: total === least, least_minor: least, history: false },
    picked: service === first ? "first" : null,
    checks,
    question: null,
    declared: "none",
    turn_on: "not_yet",
    owner: true,
  };
}

/** The example's source: every answer made here, from the example the page holds. */
export function sampleAdSource(read: AdsRead): AdSource {
  return {
    sample: true,
    draft: (body) => Promise.resolve(sampleAnswer(read, body.draft ?? null)),
    words: (body) => {
      const judged = sampleAnswer(read, body.draft);
      if (!judged.can) return Promise.resolve(judged);
      // "Tell AI" changes a real draft: on the example it says so, and changes nothing.
      if (body.job === "change") return Promise.resolve({ ...judged, changed: { kind: "none", fault: null } });
      const versions = sampleVersions(read.business.name, judged.draft.service);
      return Promise.resolve({ ...judged, draft: { ...judged.draft, versions }, wrote: { ok: true } });
    },
  };
}
