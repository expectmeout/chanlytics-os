/**
 * Google's reviews on the Reports page (moved from legacy/pages/reports.jsx, decision 0015), drawn from the one fold of the
 * Reviews read (contracts `toReviewsReportVM`, held by reviews-surface.ts) that the sentence at the head is said from. With the
 * owner's Business Profile synced, the reviews on record are counted: five figures (the rating, the count, what was written
 * against the period before, how many were answered and how fast), the mix of the period's stars, the weeks, the reviews that
 * wait for a reply with the reply the receptionist held back, and the latest. From the five Google shows first, which count
 * nothing: four figures, the ratings gained day by day, a line on what the profile would add, and the latest, said to be those
 * five. Nothing linked: an honest card that says why, and, for a person who may find the listing or connect the profile, the door.
 * On a phone the reviews that wait come first, ahead of the figures: they are the work.
 *
 * The cards of one row take the whole row, or the share a list needs. Beside each other, a list of five reviews set the row's
 * height and a period of days that gained one rating apiece was stretched to match it, which is a picture of nothing. A run
 * of days wants width; the reviews want a readable measure, which reports.css gives them in columns.
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { WAIT_ACT_WORDS, lensEmpty, lensRoute, waitEndsWords } from "@chanlytics/contracts";
import type { GoogleReviewVM, GoogleVM, LensRange, ReviewWaitingVM, ReviewsReportVM } from "@chanlytics/contracts";
import { draftReply, replyToReview, stopHeldReply } from "@/legacy-bridge/google";
import { canDo, navigate, useLegacyToast, type LegacyFlash } from "../legacy-verbs";
import { BarChart, BarList } from "../kit/charts/bar";
import { ChartCard } from "../kit/charts/card";
import { EmptyState } from "../kit/empty/empty";
import { Button } from "../kit/button/button";
import { Field } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { RptFigure, RptSection } from "./blocks";
import { RPT_GAINED, RPT_WRITTEN } from "./series";

/** What the receptionist does under a new review: the mode Settings holds, `never` opening the box empty. */
type ReplyMode = GoogleVM["reply"]["mode"];

/** The section's toast: raised by a composer, drawn by the section, which outlives the row a reply answers. */
type Flash = (flash: LegacyFlash) => void;

// An answer to a review, on Google, in the business's own words: a link
// under the review, a few lines, Send. Google keeps one reply per review,
// so sending again replaces it. Shown only when the Business Profile is
// connected and the review came through it.
// The composer under a review. A reply the receptionist already holds for it
// (decision 0064: written by the sync under Ask me, or under Holds it until it
// posts) opens in the box, and its line says how its wait ends, with a Stop
// where it would post on its own. Otherwise, under Ask (and Auto, for one the
// receptionist has not reached), opening it asks the receptionist for a draft
// first, so a reply is one tap: read, change anything, send. Under Never the
// box opens empty and nothing is asked.
// A reply that lands moves the review out of the waiting card, and this composer with it, before the toast is raised: the toast
// is the section's (`flash`), so it is still drawn, and so is where focus goes (`sent`, the card's heading), which the row took with it.
// The review a link names (reports/reviews:<id>) opens its box as it is drawn, as a press on Reply would; once it is answered the
// address drops the review (`answered`). The section brings it into view.
/** A held reply stopped, or held under Ask me: it waits for your OK (the wait rule's words). */
const HELD_REPLY_WAITS = `${waitEndsWords("review_ask")}.`;

function ReviewReply({
  r,
  mode,
  flash,
  sent,
  named,
  answered,
}: {
  r: GoogleReviewVM;
  mode: ReplyMode;
  flash: Flash;
  sent: (() => void) | null;
  named: boolean;
  answered: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.replyText || r.heldReply?.text || "");
  // A held reply stopped here: it no longer posts on its own (the read behind it says so too).
  const [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // null · "yes" (the words in the box are the receptionist's) · a sentence saying why there is none
  const [drafted, setDrafted] = useState<string | null>(null);
  const openIt = async () => {
    setOpen(true);
    // The reply it holds is the draft: no second one is asked for.
    if (r.heldReply) {
      setDrafted("yes");
      return;
    }
    if (r.replied || mode === "never") return;
    setDrafting(true);
    const d = await draftReply(r.id);
    setDrafting(false);
    if (d.ok) {
      setText(d.text);
      setDrafted("yes");
    } else setDrafted(d.message || "No draft this time — write the reply yourself.");
  };
  // The review a link names: its box opens as it is drawn (once), and the review is brought into view.
  const opened = useRef(false);
  useEffect(() => {
    if (!named || opened.current) return;
    opened.current = true;
    void openIt();
    // `openIt` is this draw's own; the review named is what asks for it, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [named]);
  const send = async () => {
    if (busy || drafting || !text.trim()) return;
    setBusy(true);
    const res = await replyToReview(r.id, text);
    setBusy(false);
    flash({
      tone: res.ok ? "ok" : "danger",
      msg: res.ok ? <>Your reply is on Google, under the review.</> : <>{res.message}</>,
    });
    if (res.ok) {
      setOpen(false);
      answered(r.id);
      sent?.();
    }
  };
  // Its Stop: a reply that would post on its own waits for your OK instead, its words kept for the box.
  const stop = async () => {
    if (busy) return;
    setBusy(true);
    const res = await stopHeldReply(r.id);
    setBusy(false);
    if (res.ok) setStopped(true);
    // The verb's receipt (contracts reviewReplyStopSpec): stopped, or nothing left to stop.
    flash({ tone: res.ok ? "ok" : "danger", msg: <>{res.message}</> });
  };
  const posts = !!r.heldReply?.posts && !stopped;
  return (
    <div className="rp2-review-reply">
      {r.heldReply && !open && (
        <p className="rp2-review-drafted" data-testid="google-review-held-reply">
          <b>The receptionist wrote:</b> {r.heldReply.text} {posts ? r.heldReply.words : HELD_REPLY_WAITS}
          {posts && (
            <>
              {" "}
              <LinkButton onClick={stop} disabled={busy} data-testid="google-review-stop">
                {WAIT_ACT_WORDS.stop}
              </LinkButton>
            </>
          )}
        </p>
      )}
      {r.replied && !open && (
        <p className="rp2-review-replytext">
          <b>You replied:</b> {r.replyText}
        </p>
      )}
      {!open ? (
        <LinkButton onClick={openIt} data-testid="google-reply">
          {r.replied ? "Change the reply" : r.heldReply ? "Read and send" : "Reply"}
        </LinkButton>
      ) : (
        <div className="rp2-review-composer" data-testid="google-reply-composer">
          <Field
            aria-label="Your reply to this review"
            rows={3}
            value={text}
            maxLength={4096}
            readOnly={drafting}
            onValueChange={(next) => {
              setText(next);
              if (drafted === "yes") setDrafted(null);
            }}
            placeholder={
              drafting
                ? "The receptionist is writing a draft…"
                : "Thank them, or answer them — it appears on Google under the review, in the business's name."
            }
            data-testid="google-reply-text"
          />
          {drafted === "yes" && (
            <span className="rp2-review-drafted" data-testid="google-reply-drafted">
              Drafted by the receptionist — change anything, then send.
            </span>
          )}
          {drafted && drafted !== "yes" && (
            <span className="rp2-review-drafted dim" data-testid="google-reply-undrafted">
              {drafted}
            </span>
          )}
          <div className="bc-chips">
            <Button
              variant="primary"
              size="sm"
              onClick={send}
              disabled={busy || drafting || !text.trim()}
              data-testid="google-reply-send"
            >
              {busy ? "Sending…" : "Send to Google"}
            </Button>
            <LinkButton onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What a list of reviews draws them with: the listing's own figures, who may answer, the toast, where focus goes once a reply has taken
 * a row out of its card, and the review a link names (its box opens) with what to do once it is answered.
 */
interface Rows {
  vm: ReviewsReportVM["google"];
  operator: boolean;
  flash: Flash;
  sent: (() => void) | null;
  named: string | null;
  answered: (id: string) => void;
}

/** What every card of reviews shares: who may answer, the toast, and the review a link names with what to do once it is answered. */
type Shared = Pick<Rows, "operator" | "flash" | "named" | "answered">;

/** The review a link names is brought into view as it is drawn (its `ref`); a browser without the verb leaves the page where it is. */
const bringIntoView = (el: HTMLElement | null) => {
  el?.scrollIntoView?.({ block: "center" });
};

/**
 * One review: its stars, who and when, its words (or that there are none), the reply the receptionist wrote and held back
 * (`held`, which a row that waits carries), and the reply, or the door to write one.
 */
function reviewRow(r: GoogleReviewVM | ReviewWaitingVM, { vm, operator, flash, sent, named, answered }: Rows) {
  const held = "held" in r ? r.held : null;
  const isNamed = r.id === named;
  return (
    <li
      key={r.id}
      className={"rp2-review" + (r.isNew ? " is-new" : "") + (isNamed ? " is-named" : "")}
      data-testid="google-review"
      data-named={isNamed ? "true" : undefined}
      ref={isNamed ? bringIntoView : undefined}
    >
      <div className="rp2-review-head">
        <span
          className="rp2-review-stars"
          role="img"
          aria-label={r.rating == null ? "No rating" : `${r.rating} of 5 stars`}
        >
          {r.stars}
        </span>
        <span className="rp2-review-who">{r.author}</span>
        <span className="rp2-review-when">
          {r.when}
          {r.isNew ? " · new" : ""}
          {r.replied ? " · replied" : ""}
        </span>
      </div>
      {r.text ? (
        <p className="rp2-review-text">{r.text}</p>
      ) : (
        <p className="rp2-review-text dim">A rating without words.</p>
      )}
      {held && (
        <span className="rp2-review-drafted" data-testid="google-review-held">
          {held}
        </span>
      )}
      {vm.canReply && operator && r.fromProfile ? (
        <ReviewReply r={r} mode={vm.reply.mode} flash={flash} sent={sent} named={isNamed} answered={answered} />
      ) : r.replied ? (
        <p className="rp2-review-replytext">
          <b>Replied:</b> {r.replyText}
        </p>
      ) : null}
    </li>
  );
}

/** The reviews of a card, one to a row of a list. */
function reviewList(reviews: ReadonlyArray<GoogleReviewVM | ReviewWaitingVM>, rows: Rows) {
  return <ul className="rp2-reviews">{reviews.map((r) => reviewRow(r, rows))}</ul>;
}

/** Ratings gained, day by day: the count is the tiles'; the card draws its days, with their table. */
function gainedCard(V: ReviewsReportVM) {
  const vm = V.google;
  return (
    <ChartCard
      className="rpt-span-12"
      title="Ratings gained, day by day"
      testid="chart-google-gained"
      config={RPT_GAINED}
      takeaway={V.lines.gained}
      twin={{ data: vm.gained.points, keys: ["gained"], first: "Day" }}
    >
      {vm.gained.points.length && vm.gained.total !== null ? (
        <BarChart
          data={vm.gained.points}
          keys={["gained"]}
          config={RPT_GAINED}
          height={150}
          yTicks={2}
          animKey={V.days}
          ariaLabel="Ratings gained per day, by Google's count. The arrow keys read each day."
          describe={(d) => `${d.label}: ${d.gained} ${d.gained === 1 ? "rating" : "ratings"} gained`}
        />
      ) : (
        <EmptyState kind="line" title={V.lines.gainedEmpty} />
      )}
    </ChartCard>
  );
}

/** The mix of the period's stars, a row to each, over the reviews that carry one; where there is none to count, the words that say why. */
function starsCard(V: ReviewsReportVM) {
  const stars = V.stars;
  return (
    <ChartCard
      className="rpt-span-5"
      title="The mix of stars"
      testid="chart-reviews-stars"
      takeaway={stars ? V.lines.mix : null}
      table={stars ? stars.table : null}
    >
      {stars ? (
        <BarList max={stars.rated} rows={stars.rows} />
      ) : (
        <EmptyState kind="line" title={V.lines.mix ?? V.lines.historyTitle} />
      )}
    </ChartCard>
  );
}

/** The reviews written week by week, over the weeks the history on record covers, with their table. */
function weeklyCard(V: ReviewsReportVM) {
  const weekly = V.weekly;
  return (
    <ChartCard
      className="rpt-span-7"
      title="Written, week by week"
      testid="chart-reviews-weekly"
      config={RPT_WRITTEN}
      takeaway={weekly ? V.lines.weekly : null}
      twin={weekly ? { data: weekly.points, keys: ["written"], first: "Week of" } : null}
    >
      {weekly ? (
        <BarChart
          data={weekly.points}
          keys={["written"]}
          config={RPT_WRITTEN}
          height={150}
          yTicks={2}
          animKey={V.days}
          ariaLabel="Reviews written per week. The arrow keys read each week."
          describe={(d) => `${d.label}: ${d.written} ${d.written === 1 ? "review" : "reviews"} written`}
        />
      ) : (
        <EmptyState kind="line" title={V.lines.weekly ?? V.lines.historyTitle} />
      )}
    </ChartCard>
  );
}

/**
 * The reviews that wait for a reply, the oldest first, each with the reply the receptionist held back where it did, and the door to
 * answer. Its heading takes focus (`heading`) when a reply has landed, since the row that had it is gone.
 */
function waitingCard(V: ReviewsReportVM, shared: Shared, heading: RefObject<HTMLHeadingElement | null>) {
  const { total, rows } = V.waiting;
  return (
    <ChartCard
      className="rpt-span-12"
      title={`Waiting for a reply (${total})`}
      testid="reviews-waiting"
      takeaway={V.lines.waiting}
      titleRef={heading}
    >
      {rows.length ? (
        reviewList(rows, { vm: V.google, sent: () => heading.current?.focus(), ...shared })
      ) : (
        <EmptyState kind="line" title={V.lines.waitingEmpty} />
      )}
    </ChartCard>
  );
}

/** From the five Google shows first: what the Business Profile would add, or the location still to choose, and, for a person who may connect it, the door to Connections. */
function connectCard(V: ReviewsReportVM, may: boolean) {
  const c = V.google.connection;
  const words = V.lines.connect ?? (c?.pending ? c.words : null);
  if (!words) return null;
  return (
    <ChartCard className="rpt-span-12" title="Every review, from your Business Profile" testid="reviews-connect">
      <EmptyState
        kind="line"
        title={words}
        action={may ? { label: "Open Connections", to: "admin/integrations" } : null}
      />
    </ChartCard>
  );
}

/** The latest reviews with their words, and the listing's own address for the rest. A review that waits for a reply is drawn once, above. */
function latestCard(V: ReviewsReportVM, mapsUri: string | null, shared: Shared) {
  const G = V.google;
  return (
    <ChartCard
      className="rpt-span-12"
      title="Latest reviews"
      testid="chart-google-latest"
      table={V.latestTable}
      takeaway={V.latest.length ? (G.reply.words ? `${G.source} · ${G.reply.words}` : G.source) : null}
    >
      {V.latest.length ? (
        reviewList(V.latest, { vm: G, sent: null, ...shared })
      ) : (
        <EmptyState kind="line" title={V.lines.latestEmpty} />
      )}
      {/* The card shows what Google hands back, which is never the whole listing: the rest are on Google, and the
          listing's own address is the one place that has all of them. Google's `maps_uri`, as Setup links it. */}
      {mapsUri && (
        <p className="rp2-reviews-more">
          <LinkButton href={mapsUri} target="_blank" rel="noreferrer" data-testid="google-open-listing">
            Read every review on Google
            <Icon name="external" size={12} />
          </LinkButton>
        </p>
      )}
    </ChartCard>
  );
}

/** What the section says of where its figures come from: the listing and when Google was read, the Business Profile's own words, and where the history on record starts. */
function sectionMeta(V: ReviewsReportVM, L: NonNullable<GoogleVM["listing"]>): string {
  const checked = `${L.checked.charAt(0).toLowerCase()}${L.checked.slice(1)}`;
  return [`${L.name} · ${checked}`, V.google.connection?.words ?? null, V.lines.history]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/**
 * Nothing is linked: the fold's words for why, and the registry's for what the lens would show, with the door to find the listing for
 * a person who may. A deployment that can neither look a listing up nor connect a profile (`unavailable`) has nothing to open.
 */
function notLinked(V: ReviewsReportVM, range: LensRange, may: boolean) {
  const found = lensEmpty("reviews", range);
  const unlinked = V.state === "unlinked";
  const door = unlinked && may ? found.door : null;
  return (
    <RptSection title="Google reviews">
      <div className="rpt-grid">
        <ChartCard className="rpt-span-12" title="Your listing on Google" testid="google-none">
          <EmptyState
            kind="line"
            title={V.lines.empty}
            body={unlinked ? found.body : null}
            action={door ? { label: door.label, to: door.to } : null}
          />
        </ChartCard>
      </div>
    </RptSection>
  );
}

export function GoogleSection({
  V,
  range,
  phone,
  review,
}: {
  V: ReviewsReportVM;
  range: LensRange;
  phone: boolean;
  /** The review the address names (contracts reviewRoute): drawn where it is listed, marked, with its reply box open. */
  review: string | null;
}) {
  const operator = canDo("approve");
  // The doors out of the lens lead to what only an owner (or the workspace's partner) does: finding the listing, connecting the profile.
  const may = canDo("settings");
  // The toast of a reply is drawn here, not by the composer: the answer re-reads the Reviews surface before the verb returns, and
  // the review, answered, leaves the waiting card with its composer.
  const [toastNode, flash] = useLegacyToast();
  const waitingHeading = useRef<HTMLHeadingElement>(null);
  const L = V.google.listing;
  if (V.state !== "linked" || !L) return notLinked(V, range, may);
  const profile = V.source === "profile";
  // Once the review is answered the address is the lens's again, in the entry's own place (Back does not return to a box that is closed).
  const answered = (id: string) => {
    if (id === review) navigate(lensRoute("reviews"), { replace: true });
  };
  const shared: Shared = { operator, flash, named: review, answered };
  // The review a link names is one of those listed (waiting for a reply, or among the latest), or the lens says it is not here.
  const listed = review !== null && [...V.waiting.rows, ...V.latest].some((r) => r.id === review);
  // On a phone the work comes first: reviews that wait for a reply stand ahead of the figures, as they are what the person came to do.
  const waitingFirst = phone && profile && V.waiting.rows.length > 0;
  const waiting = profile ? waitingCard(V, shared, waitingHeading) : null;
  return (
    <RptSection title="Google reviews" meta={sectionMeta(V, L)}>
      {review !== null && !listed && (
        <p className="rp2-review-drafted dim" data-testid="google-review-missing">
          That review is not among the ones listed here. The latest are below.
        </p>
      )}
      {waitingFirst && <div className="rpt-grid">{waiting}</div>}
      {/* The strip's own pattern (RptTiles in blocks.tsx): the kit's figure in a list of terms, named by its metric; five from the profile, four without it. */}
      <dl className={`rpt-figures ${profile ? "profile" : "listing"}`} data-testid="google-tiles">
        {V.tiles.map((t) => (
          <RptFigure key={t.id} t={t} />
        ))}
      </dl>
      <div className="rpt-grid">
        {profile ? (
          <>
            {starsCard(V)}
            {weeklyCard(V)}
            {!waitingFirst && waiting}
          </>
        ) : (
          <>
            {gainedCard(V)}
            {connectCard(V, may)}
          </>
        )}
        {latestCard(V, L.mapsUri, shared)}
      </div>
      {toastNode}
    </RptSection>
  );
}
