/**
 * Loads Reports' Ads lens on demand (MOCKUP): its body (lenses/ads.tsx) and its demo fold (ads-demo.ts) are one chunk of their
 * own, fetched only where the lens is shown (a demo session for now, `adsAreOn`), so the Ads models, words and fixtures are not
 * part of the Reports page every workspace loads. Nothing draws until the chunk lands. `useAdsLens` is what the page asks: the
 * head's sentence, the Overview's one fact and what the lens draws, each none where the Ads are not on.
 */
import { useEffect, useState } from "react";
import { ADS_SCOPE_ALL, adsReportRoute, isAdsScope } from "@chanlytics/contracts";
import type { AdsScope, LensId, ReportFactVM, ReportsParts } from "@chanlytics/contracts";
import type { AdsResultsVM } from "@chanlytics/contracts/ads-page";
import { navigate } from "../../legacy-verbs";
import { adsAreOn } from "../chrome";
import type { ReportsSurface } from "../surface";

/** The lens's body, the fold it draws, and the fact the Overview makes of the same days. */
interface AdsParts {
  Lens: (typeof import("./ads"))["AdsLens"];
  fold: (typeof import("../ads-demo"))["adsDemoFold"];
  fact: (typeof import("../ads-demo"))["adsDemoFact"];
}

/** What the Ads lens draws: its body, once fetched, the fold it draws, and the write of its scope. */
export interface AdsDraw {
  parts: AdsParts;
  fold: AdsResultsVM;
  onScope: (scope: AdsScope) => void;
}

/** The parts of the Ads lens, once they have been fetched; null before that, and always null where `on` is false. */
function useAdsParts(on: boolean): AdsParts | null {
  const [parts, setParts] = useState<AdsParts | null>(null);
  useEffect(() => {
    if (!on || parts !== null) return undefined;
    let live = true;
    const lens = import("./ads").then((m) => m.AdsLens);
    const fold = import("../ads-demo").then((m) => m.adsDemoFold);
    const fact = import("../ads-demo").then((m) => m.adsDemoFact);
    void Promise.all([lens, fold, fact]).then(([Lens, f, g]) => {
      if (live) setParts({ Lens, fold: f, fact: g });
    });
    return () => {
      live = false;
    };
  }, [on, parts]);
  return on ? parts : null;
}

/** What Reports asks of the Ads in a demo session. */
interface AdsHere {
  /** The Ads lens's head: the fold's own sentence, none where the lens is not the one drawn or has nothing to say. */
  head: { head: string | null } | null;
  /** The Overview's one Worth-knowing fact: what the ads brought over the same days. */
  fact: ReportFactVM | null;
  draw: AdsDraw | null;
}

const LENS_NOTHING: AdsHere = { head: null, fact: null, draw: null };

/** The sentence at the head, its two halves as one line; none where the fold has nothing to draw. */
const lensSentenceOf = (fold: AdsResultsVM): string | null =>
  fold.head ? `${fold.head.strong}${fold.head.rest}` : null;

/**
 * The Ads of the lens on screen: its fold over the days the address says, else the range shown, narrowed to the scope the address
 * says (the Overview folds every ad, for its one fact). Narrowing replaces the entry: a scope is a setting of the page, not a place
 * Back returns to, and the days stay.
 */
export function useAdsLens(lens: LensId, at: ReportsParts, R: ReportsSurface | null): AdsHere {
  const parts = useAdsParts(adsAreOn());
  if (!parts || !R || (lens !== "ads" && lens !== "overview")) return LENS_NOTHING;
  const scope = at.scope && isAdsScope(at.scope) ? at.scope : ADS_SCOPE_ALL;
  const fold = parts.fold(at.days ?? R.range, scope, R.vm.today);
  if (lens === "overview") return { ...LENS_NOTHING, fact: parts.fact(fold) };
  const onScope = (scope: AdsScope) => navigate(adsReportRoute(at.days, scope), { replace: true });
  return { head: { head: lensSentenceOf(fold) }, fact: null, draw: { parts, fold, onScope } };
}
