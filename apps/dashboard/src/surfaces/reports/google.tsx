/**
 * Google's reviews on the Reports page (moved from legacy/pages/reports.jsx, decision 0015), drawn from the one fold of the
 * Reviews read (contracts `toReviewsReportVM`, held by reviews-surface.ts) that the sentence at the head is said from. With the
 * owner's Business Profile synced, the reviews on record are counted: five figures (the rating, the count, what was written
 * against the period before, how many were answered and how fast), the mix of the period's stars, the weeks, the reviews that
 * wait for a reply with the reply the receptionist held back, and the latest. From the five Google shows first, which count
 * nothing: four figures, the ratings gained day by day, a line on what the profile would add, and the latest, said to be those
 * five. Nothing linked: an honest card that leads to Setup.
 *
 * The cards of one row take the whole row, or the share a list needs. Beside each other, a list of five reviews set the row's
 * height and a period of days that gained one rating apiece was stretched to match it, which is a picture of nothing. A run
 * of days wants width; the reviews want a readable measure, which reports.css gives them in columns.
 */
import { useState } from "react";
import { lensEmpty } from "@chanlytics/contracts";
import type { GoogleDto, GoogleReviewVM, GoogleVM, LensRange, ReviewsReportVM } from "@chanlytics/contracts";
import { draftReply, replyToReview } from "@/legacy-bridge/google";
import { canDo, useLegacyToast } from "../legacy-verbs";
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

// An answer to a review, on Google, in the business's own words: a link
// under the review, a few lines, Send. Google keeps one reply per review,
// so sending again replaces it. Shown only when the Business Profile is
// connected and the review came through it.
// The composer under a review. Under Ask (and Auto, for one the receptionist
// has not reached), opening it asks the receptionist for a draft first, so a
// reply is one tap: read, change anything, send. Under Never the box opens
// empty and nothing is asked.
function ReviewReply({ r, mode }: { r: GoogleReviewVM; mode: ReplyMode }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.replyText || "");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // null · "yes" (the words in the box are the receptionist's) · a sentence saying why there is none
  const [drafted, setDrafted] = useState<string | null>(null);
  const [toastNode, flash] = useLegacyToast();
  const openIt = async () => {
    setOpen(true);
    if (r.replied || mode === "never") return;
    setDrafting(true);
    const d = await draftReply(r.id);
    setDrafting(false);
    if (d.ok) {
      setText(d.text);
      setDrafted("yes");
    } else setDrafted(d.message || "No draft this time — write the reply yourself.");
  };
  const send = async () => {
    if (busy || drafting || !text.trim()) return;
    setBusy(true);
    const res = await replyToReview(r.id, text);
    setBusy(false);
    flash({
      tone: res.ok ? "ok" : "danger",
      msg: res.ok ? <>Your reply is on Google, under the review.</> : <>{res.message}</>,
    });
    if (res.ok) setOpen(false);
  };
  return (
    <div className="rp2-review-reply">
      {r.replied && !open && (
        <p className="rp2-review-replytext">
          <b>You replied:</b> {r.replyText}
        </p>
      )}
      {!open ? (
        <LinkButton onClick={openIt} data-testid="google-reply">
          {r.replied ? "Change the reply" : "Reply"}
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
      {toastNode}
    </div>
  );
}

/**
 * One review: its stars, who and when, its words (or that there are none), the reply the receptionist wrote and held back
 * (`held`, where the row is one that waits), and the reply, or the door to write one.
 */
function reviewRow(r: GoogleReviewVM, vm: GoogleVM, operator: boolean, held: string | null) {
  return (
    <div key={r.id} className={"rp2-review" + (r.isNew ? " is-new" : "")} data-testid="google-review">
      <div className="rp2-review-head">
        <span className="rp2-review-stars" aria-label={`${r.rating == null ? 0 : r.rating} of 5`}>
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
        <ReviewReply r={r} mode={vm.reply.mode} />
      ) : r.replied ? (
        <p className="rp2-review-replytext">
          <b>Replied:</b> {r.replyText}
        </p>
      ) : null}
    </div>
  );
}

/** Ratings gained, day by day: the count is the tiles'; the card draws its days, with their table. */
function gainedCard(vm: GoogleVM, days: number) {
  return (
    <ChartCard
      className="rpt-span-12"
      title="Ratings gained, day by day"
      testid="chart-google-gained"
      config={RPT_GAINED}
      takeaway={vm.gained.total === null ? "Needs a second day of reading." : null}
      twin={{ data: vm.gained.points, keys: ["gained"], first: "Day" }}
    >
      {vm.gained.points.length && vm.gained.total !== null ? (
        <BarChart
          data={vm.gained.points}
          keys={["gained"]}
          config={RPT_GAINED}
          height={150}
          yTicks={2}
          animKey={days}
          ariaLabel="Ratings gained per day, by Google's count. The arrow keys read each day."
          describe={(d) => `${d.label}: ${d.gained} ${d.gained === 1 ? "rating" : "ratings"} gained`}
        />
      ) : (
        <EmptyState
          kind="line"
          title="The count is read once a day; the first difference shows after the second read."
        />
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
        <EmptyState kind="line" title={V.lines.mix ?? V.lines.history} />
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
        <EmptyState kind="line" title={V.lines.weekly ?? V.lines.history} />
      )}
    </ChartCard>
  );
}

/** The reviews that wait for a reply, the oldest first, each with the reply the receptionist held back where it did, and the door to answer. */
function waitingCard(V: ReviewsReportVM, operator: boolean) {
  const { total, rows } = V.waiting;
  return (
    <ChartCard
      className="rpt-span-12"
      title={`Waiting for a reply (${total})`}
      testid="reviews-waiting"
      takeaway={total > rows.length ? `Showing the oldest ${rows.length}.` : null}
    >
      {rows.length ? (
        <div className="rp2-reviews">{rows.map((r) => reviewRow(r, V.google, operator, r.held))}</div>
      ) : (
        <EmptyState kind="line" title="Nothing is waiting for a reply." />
      )}
    </ChartCard>
  );
}

/** From the five Google shows first: what the Business Profile would add, or the location still to choose, and the door to Connections. */
function connectCard(V: ReviewsReportVM) {
  const c = V.google.connection;
  const words = V.lines.connect ?? (c?.pending ? c.words : null);
  if (!words) return null;
  return (
    <ChartCard className="rpt-span-12" title="Every review, from your Business Profile" testid="reviews-connect">
      <EmptyState kind="line" title={words} action={{ label: "Open Connections", to: "admin/integrations" }} />
    </ChartCard>
  );
}

/** The latest reviews with their words, and the listing's own address for the rest. A review that waits for a reply is drawn once, above. */
function latestCard(V: ReviewsReportVM, mapsUri: string | null, operator: boolean) {
  const G = V.google;
  return (
    <ChartCard
      className="rpt-span-12"
      title="Latest reviews"
      testid="chart-google-latest"
      table={G.table}
      takeaway={V.latest.length ? (G.reply.words ? `${G.source} · ${G.reply.words}` : G.source) : null}
    >
      {V.latest.length ? (
        <div className="rp2-reviews">{V.latest.map((r) => reviewRow(r, G, operator, null))}</div>
      ) : (
        <EmptyState
          kind="line"
          title={
            G.latest.length
              ? "The latest reviews are the ones waiting for a reply, above."
              : "Google shows no written reviews for this listing yet."
          }
        />
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

/** Whether Reviews has anything to draw: this deployment can look listings up, or connect a profile, or a listing is kept (the one predicate: the lens asks it). */
export const googleReadable = (g: GoogleDto): boolean => g.ready.places || g.ready.profile || !!g.listing;

/** What the section says of where its figures come from: the listing and when Google was read, the Business Profile's own words, and where the history on record starts. */
function sectionMeta(V: ReviewsReportVM, L: NonNullable<GoogleVM["listing"]>): string {
  const checked = `${L.checked.charAt(0).toLowerCase()}${L.checked.slice(1)}`;
  return [`${L.name} · ${checked}`, V.google.connection?.words ?? null, V.lines.history]
    .filter((part): part is string => !!part)
    .join(" · ");
}

export function GoogleSection({ V, range }: { V: ReviewsReportVM; range: LensRange }) {
  const operator = canDo("approve");
  const L = V.google.listing;
  if (!L) {
    const none = lensEmpty("reviews", range);
    return (
      <RptSection title="Google reviews">
        <div className="rpt-grid">
          <ChartCard className="rpt-span-12" title="Your listing on Google" testid="google-none">
            <EmptyState
              kind="line"
              title={none.title}
              body={none.body}
              action={none.door ? { label: none.door.label, to: none.door.to } : null}
            />
          </ChartCard>
        </div>
      </RptSection>
    );
  }
  const profile = V.source === "profile";
  return (
    <RptSection title="Google reviews" meta={sectionMeta(V, L)}>
      {/* The strip's own pattern (RptTiles in blocks.tsx): the kit's figure in a list of terms, named by its metric; five from the profile, four without it. */}
      <dl className={`rpt-figures${profile ? "" : " four"}`} data-testid="google-tiles">
        {V.tiles.map((t) => (
          <RptFigure key={t.id} t={t} />
        ))}
      </dl>
      <div className="rpt-grid">
        {profile ? (
          <>
            {starsCard(V)}
            {weeklyCard(V)}
            {waitingCard(V, operator)}
          </>
        ) : (
          <>
            {gainedCard(V.google, V.days)}
            {connectCard(V)}
          </>
        )}
        {latestCard(V, L.mapsUri, operator)}
      </div>
    </RptSection>
  );
}
