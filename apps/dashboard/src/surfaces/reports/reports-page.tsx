/**
 * Chanlytics, Reports: the page on its App Router route (`reports/[[...lens]]`, decision 0015, and the lenses spec). One page of
 * lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`). The page follows its own
 * address, as People's does (the path the App Router page hands it), so a move between two lenses is a pushed or replaced entry and
 * never a request for a page, and every lens but Reviews draws from the one read the surface holds (the Receptionist's own cards
 * apart, below), so a move asks for nothing and never blanks the body. Reviews draws from a read of its own (reviews-surface.ts, made
 * as it comes on screen) that follows the period shown: the page asks how it stands against it once (`useFollower`) and hands that to
 * the lens, the head and its own dimming. The Receptionist lens draws the cards the report holds from the one read and the rest from
 * a read of its own (receptionist-surface.ts, the route's answer, which the lens folds), followed the same way; so does the People lens
 * (people-surface.ts), whose fold the page makes once, since its head says the fold's sentence as the lens draws the fold's cards. So
 * does the Campaigns lens (campaigns-surface.ts), the whole of whose numbers are its own: the frame reads the report alone, the lens
 * folds its read once (the head says the fold's sentence, and Worth knowing, which the page makes from the report and that read, says
 * the campaign that drew the most replies). The frame draws the strip of lenses (chrome.ts, its `views`) and
 * the head (head.ts); the date range is the page's act at the strip's right, a capsule that opens it (period-picker.tsx), with what
 * its word leaves out beside it on a desk; the page draws the lens's body (lenses/), which is a view of its own: replaced as the lens
 * changes (keyed by it), and moved by the deck every change of view moves by (kit/motion/view-deck.ts), from the side its lens stands
 * on, while the page and what it holds of a range stay. The Ads lens (a demo session's, until a workspace's ad accounts are read)
 * draws a fold of its own over the days the address says, from a chunk fetched on demand (lenses/ads-load.ts), and its one fact
 * stands in Worth knowing. A real workspace draws the bridge's own numbers (`useSurface("reports")`); a
 * demo session draws the same page from the contracts sample (sample.ts); without either, the page says what Reports reads.
 *
 * What it shows is a range: a period by name, kept in this browser, or the days a member picked, which the address says
 * after the lens (`reports/receptionist:2026-09-01~2026-09-20`, contracts lensRoute). The page follows that too: a pick
 * moves the address and reads (period.ts), and a move the address makes by itself (Back, Forward, a link someone sent) is
 * read here, so the address and the numbers under it are never of two ranges.
 */
import { useEffect, useState } from "react";
import {
  REPORT_LENSES,
  REPORT_PERIOD_DEFAULT,
  lensRoute,
  reportFacts,
  reportRangeKey,
  reportsRouteParts,
  routeOfPath,
  type LensId,
  type ReportFactVM,
  type ReportRange,
  type ReportsParts,
  type ReportVM,
} from "@chanlytics/contracts";
import type { CampaignLensVM, PeopleReportVM } from "@chanlytics/contracts/report-lens";
import { reportWindowOf } from "@chanlytics/contracts/report-window";
import { navigate } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { useSlide } from "../kit/motion/use-slide";
import { viewDeck } from "../kit/motion/view-deck";
import { useFollower, useSurface, useSurfaceSettled, type Follower } from "../use-surface";
import { useRptDesk, useRptPhone } from "./blocks";
import type { CampaignsSurface } from "./campaigns-surface";
import { lensShownHere } from "./chrome";
import { useReportsStanding } from "./head";
import { useAdsLens, type AdsDraw } from "./lenses/ads-load";
import { CampaignsLens, useCampaignsFold } from "./lenses/campaigns";
import { OverviewLens } from "./lenses/overview";
import { PeopleLens, usePeopleFold } from "./lenses/people";
import { PipelineLens } from "./lenses/pipeline";
import { ReceptionistLens } from "./lenses/receptionist";
import { ReviewsLens } from "./lenses/reviews";
import { LensEmpty, type LensProps } from "./lenses/shared";
import { backToShown, setReportRange } from "./period";
import { PeriodPicker } from "./period-picker";
import type { PeopleSurface } from "./people-surface";
import type { ReceptionistSurface } from "./receptionist-surface";
import type { ReviewsSurface } from "./reviews-surface";
import { useReportsDemo } from "./demo";
import { shownReportPeriod, type ReportsSurface } from "./surface";

/** The lenses in the order the strip stands them: which side a lens arrives from. */
const LENS_ORDER: readonly string[] = REPORT_LENSES.map((l) => l.id);

/** Reports read nothing: a session with no workspace, and no demo to draw. */
function readsAWorkspace() {
  return (
    <div className="rpt" data-testid="reports-none">
      <div className="rpt-inner">
        <EmptyState
          kind="page"
          glyph="wave"
          title="Reports reads a workspace's own numbers"
          body="Open a workspace to see what its receptionist answered, who reached it, and what its campaigns sent."
        />
      </div>
    </div>
  );
}

/**
 * What is said of a range that failed to load, on a row over the body: the page keeps the one it shows. A period is said
 * by its name ("90 days"), days a member picked by their dates, on both sides of the sentence.
 */
function failedRow(failed: ReportRange | null, R: ReportsSurface) {
  if (!failed) return null;
  const tried = reportWindowOf(failed, R.vm.today);
  return (
    <div className="rpt-head">
      <span className="rpt-failed" role="status" aria-live="polite">
        Couldn't load {tried.period ? tried.short : tried.dates}. Still showing{" "}
        {R.vm.live ? R.vm.rangeLabel : R.vm.period.now}.
      </span>
    </div>
  );
}

/** The reads a lens draws beside the report's own: each follows the period shown, and says where it stands against it. */
interface OwnReads {
  reviews: Follower<ReviewsSurface>;
  receptionist: Follower<ReceptionistSurface>;
  people: Follower<PeopleSurface>;
  campaigns: Follower<CampaignsSurface>;
}

/**
 * Each of those reads is its own: a pick lands it after the report or before it, and what it says of that is its state. A demo has no
 * read to follow: the samples answer at once, in a demo alone.
 */
function useOwnReads(
  live: ReportsSurface | undefined,
  R: ReportsSurface | null,
  demo: ReturnType<typeof useReportsDemo>,
): OwnReads {
  const reviews = useFollower("reports_reviews");
  const receptionist = useFollower("reports_receptionist");
  const people = useFollower("reports_people");
  const campaigns = useFollower("reports_campaigns");
  if (live || !R || !demo) return { reviews, receptionist, people, campaigns };
  return {
    reviews: { value: demo.reviewsSample(R.range), state: "current" },
    receptionist: { value: demo.receptionistSample(R.range), state: "current" },
    people: { value: demo.peopleSample(R.range), state: "current" },
    campaigns: { value: demo.campaignsSample(R.range), state: "current" },
  };
}

/** What a read folds to, while that read is of the period shown: nothing before it lands, while it is of another period or where it could not be made. */
const whileCurrent = <V,>(read: Follower<unknown>, fold: V | null): V | null =>
  read.state === "current" ? fold : null;

/**
 * Worth knowing: from the report and, for the campaign that drew the most replies, the Campaigns read's sources while it is current.
 * Where the workspace has ads (a demo session's), the one line the Ads fold makes of the same days is the last of the three.
 */
const worthKnowing = (vm: ReportVM, campaigns: CampaignLensVM | null, ads: ReportFactVM | null): ReportFactVM[] =>
  reportFacts(vm, campaigns?.report ?? null, ads);

/** Whether the lens waits on a read of its own for the period shown (one that failed is the lens's own card, not a dimming). */
const waitsOnItsRead = (lens: LensId, own: OwnReads): boolean =>
  (lens === "reviews" && own.reviews.state === "coming") ||
  (lens === "receptionist" && own.receptionist.state === "coming") ||
  (lens === "people" && own.people.state === "coming") ||
  (lens === "campaigns" && own.campaigns.state === "coming");

/**
 * A demo's pick moves its address, as a workspace's does (period.ts), where the address says days or the pick is days: the days
 * the address says are the lenses', and Ads reads them. A period by name over an address that says none moves nothing.
 */
function moveDemoAddress(at: ReportsParts, range: ReportRange): void {
  if (at.days !== null || typeof range !== "string") {
    navigate(lensRoute(at.lens, typeof range === "string" ? null : range, at.scope ?? null));
  }
}

/**
 * What the lens bodies draw beside the report: the reads that follow the period, the People and Campaigns reads folded (once: the
 * head says their sentences too), Worth knowing, which the Overview draws, and the Ads lens's fold. One object: the surfaces tree
 * takes at most four parameters (max-params).
 */
interface LensReads {
  own: OwnReads;
  people: PeopleReportVM | null;
  campaigns: CampaignLensVM | null;
  facts: ReportFactVM[];
  ads: AdsDraw | null;
  /** The review the address names (reports/reviews:<id>, contracts reviewRoute), which the Reviews lens opens with its reply box. */
  review: string | null;
}

/** The lens's body: nothing where it is not yet known to be shown, what it says where it is not shown, else its cards. */
function lensBody(
  lens: LensId,
  props: LensProps,
  shown: boolean | null,
  { own, people, campaigns, facts, ads, review }: LensReads,
) {
  if (shown === null) return null;
  if (!shown) return <LensEmpty lens={lens} vm={props.R.vm} />;
  switch (lens) {
    case "overview":
      return <OverviewLens {...props} facts={facts} />;
    case "receptionist":
      return <ReceptionistLens {...props} own={own.receptionist} />;
    case "people":
      return <PeopleLens {...props} own={own.people} fold={people} />;
    case "pipeline":
      return <PipelineLens {...props} />;
    case "campaigns":
      return <CampaignsLens {...props} own={own.campaigns} fold={campaigns} />;
    case "ads":
      return ads ? <ads.parts.Lens fold={ads.fold} onScope={ads.onScope} /> : null;
    case "reviews":
      return (
        <ReviewsLens
          reviews={own.reviews}
          range={{ since: props.R.vm.since, until: props.R.vm.until }}
          phone={props.phone}
          review={review}
        />
      );
  }
}

export function ReportsPage({ pathname }: { pathname: string | null }) {
  // The lens the address names, and the days a member picked where it says them; the frame hands the page only the
  // addresses it takes (surfaces/routes.ts), so an address that is neither is not drawn here at all.
  const at: ReportsParts = reportsRouteParts(routeOfPath(pathname) ?? "reports") ?? {
    lens: "overview",
    days: null,
    review: null,
  };
  const lens = at.lens;
  const phone = useRptPhone();
  const live = useSurface("reports");
  // Whether a read of the report has come back in this document: nothing is asked of the address while the first is out.
  const settled = useSurfaceSettled("reports");
  // A demo's own range: the sample answers at once, so a pick switches it here. It opens on the days the address says.
  const [sampleRange, setSampleRange] = useState<ReportRange>(at.days ?? REPORT_PERIOD_DEFAULT);
  // The range picked and not yet shown: what the control says, and what dims the body until its answer lands.
  const [pending, setPending] = useState<ReportRange | null>(null);
  // The range that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useState<ReportRange | null>(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  useEffect(() => {
    setPending(null);
  }, [fetchedAt]);
  const demo = useReportsDemo();
  const R = live || (demo ? demo.reportsSample(sampleRange) : null);
  const own = useOwnReads(live, R, demo);
  // The Ads (a demo session's): the lens's head, the Overview's one fact, and what the lens draws, from a chunk fetched on demand.
  const adsHere = useAdsLens(lens, at, R);
  const desk = useRptDesk();
  const slide = useSlide(LENS_ORDER, lens);
  const pendingKey = pending ? reportRangeKey(pending) : null;
  // What the address says: the days a member picked, or none, which is the period kept in this browser.
  const wanted: ReportRange = at.days ?? shownReportPeriod();
  const wantedKey = reportRangeKey(wanted);
  // What the address says and the page does not show yet, with no pick behind it: a link opened over the numbers the
  // cache kept, Back to a range this tab let go. The control says it and the body dims, as for a pick, so the numbers
  // of one range are never drawn undimmed under the name of another.
  const arriving = live && live.key !== wantedKey && !failed ? wanted : null;
  const coming = pending ?? arriving;
  const comingKey = coming ? reportRangeKey(coming) : null;
  /** Read a range and say so while it is on its way; one that could not be read is said, and the page keeps what it shows. */
  const show = async (range: ReportRange) => {
    setPending(range);
    setFailed(null);
    const ok = await setReportRange(range);
    if (!ok) {
      setPending(null);
      setFailed(range);
    }
  };
  const pick = async (range: ReportRange) => {
    // The one shown, or the one on its way: nothing to read. Any other pick is read, whatever else is out.
    if (!R || reportRangeKey(range) === (comingKey ?? R.key)) return;
    if (!live) {
      setSampleRange(range);
      moveDemoAddress(at, range);
      return;
    }
    await show(range);
  };
  // The page follows its own address. A pick has moved it already (period.ts) and is on its way, so there is nothing
  // to do. Anything else is a move the address made by itself (Back, Forward, a link opened over the page): the range
  // it names is read.
  const addressKey = at.days ? reportRangeKey(at.days) : null;
  const liveKey = live ? live.key : null;
  useEffect(() => {
    // The document's first read is still out. It is of what the address says (surface.ts reads the address), and what
    // the surface holds meanwhile is only what the cache kept from an earlier visit: nothing to ask, and nothing to say.
    // Nothing is asked where nothing is drawn either: a report that could not be read at all is the shell's to say.
    if (!settled || !live) return;
    if (liveKey === wantedKey || pendingKey === wantedKey) return;
    // The report refused the days the address says (days to come, more than a report reads, a database that cannot
    // read picked days yet) and answered with the period kept (surface.ts). The page says which days it could not
    // read, and the address takes the period's place, so Back never returns to days that fail.
    if (live.refused && reportRangeKey(live.refused) === wantedKey) {
      setFailed(wanted);
      backToShown();
      return;
    }
    void show(wanted);
    // `show`, `wanted`, `live` and `pendingKey` are this draw's own; the four below say the address and the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, wantedKey, liveKey, settled]);
  // The date range is the head's act at every width: a capsule at the strip's right, with what its word leaves out
  // beside it on a desk.
  const act = R ? (
    <PeriodPicker chosen={coming ?? R.range} today={R.vm.today} timezone={R.vm.timezone} pick={pick} desk={desk} />
  ) : null;
  // The People and Campaigns reads folded once per value, whatever the lens: the cards draw them and the head says their sentences.
  const people = usePeopleFold(own.people);
  const campaigns = useCampaignsFold(own.campaigns);
  const campaignsNow = whileCurrent(own.campaigns, campaigns);
  // Its sentence names its period: nothing is said of one the lens cannot show. The People lens's own is the fold's head, until its
  // read lands (or when it could not be made) the frame's count of new people. The Campaigns lens's is the fold's head while its
  // read is of the period shown, and nothing before that or when it could not be made.
  useReportsStanding(
    lens,
    R,
    {
      reviews: own.reviews.state === "failed" ? null : (own.reviews.value?.vm ?? null),
      people: own.people.state === "failed" ? null : people,
      campaigns: campaignsNow,
      ads: adsHere.head,
    },
    act,
  );
  if (!R) return readsAWorkspace();
  // Worth knowing, once: the campaign that drew the most replies is the Campaigns read's, while it is of the period shown.
  const facts = worthKnowing(R.vm, campaignsNow, adsHere.fact);
  // Dimmed while the page shows another period than the one picked. A pick painted at once from a held view (a pick back to
  // the period on screen, made while another loads) waits on nothing, though the read behind it is still out. On the Reviews lens
  // the same, while its own read is of another period than the one shown (one that failed is the lens's own card, not a dimming);
  // and so on the Receptionist lens, whose cards of its own wait on its read.
  const busy = (comingKey !== null && comingKey !== R.key) || waitsOnItsRead(lens, own);
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div
      className="rpt"
      data-testid={live ? "reports-real" : "reports-sample"}
      data-lens={lens}
      data-loading={busy ? "" : undefined}
    >
      <div className="rpt-inner">
        {/* The period is the head's act (period-picker.tsx); a period that failed to load is said here, over the body. The
            frame's head says Reports and the lens's answer; the page does not title itself. */}
        {failedRow(failed, R)}
        <div
          className="rpt-body"
          key={lens}
          ref={viewDeck.view("reports")}
          data-slide={slide}
          data-dims
          aria-busy={busy ? "true" : "false"}
        >
          {lensBody(lens, { R, pick, phone }, lensShownHere(lens), {
            own,
            people,
            campaigns,
            facts,
            ads: adsHere.draw,
            review: at.review,
          })}
        </div>
      </div>
    </div>
  );
}
