/**
 * Google's reviews on the Reports page (moved from legacy/pages/reports.jsx, decision 0015): the listing as the edge last
 * read it, over the period above. Four measured tiles, the ratings gained day by day (the count is the tiles'; the
 * card draws its days, with their table), and the latest reviews with their words: the five Google shows first, and
 * said so. Nothing linked: an honest card that leads to Setup. Nothing at all when this deployment cannot look
 * listings up.
 *
 * Both cards take the whole row, one above the other. Beside each other, a list of five reviews set the row's height
 * and a period of days that gained one rating apiece was stretched to match it, which is a picture of nothing. A run
 * of days wants width; the reviews want a readable measure, which reports.css gives them in columns.
 */
import { useState } from "react";
import { toGoogleVM } from "@chanlytics/contracts";
import type { GoogleReviewVM, GoogleVM } from "@chanlytics/contracts";
import { draftReply, replyToReview } from "@/legacy-bridge/google";
import { canDo, useLegacyToast } from "../legacy-verbs";
import { BarChart } from "../kit/charts/bar";
import { ChartCard } from "../kit/charts/card";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";
import { RpTile, RptSection } from "./blocks";
import { RPT_GAINED } from "./series";

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
        <button className="cl-bucket-link" onClick={openIt} data-testid="google-reply">
          {r.replied ? "Change the reply" : "Reply"}
        </button>
      ) : (
        <div className="rp2-review-composer" data-testid="google-reply-composer">
          <textarea
            className="rp2-review-textarea"
            rows={3}
            value={text}
            maxLength={4096}
            disabled={drafting}
            onChange={(e) => {
              setText(e.target.value);
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
            <button
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={busy || drafting || !text.trim()}
              data-testid="google-reply-send"
            >
              {busy ? "Sending…" : "Send to Google"}
            </button>
            <button className="cl-bucket-link" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {toastNode}
    </div>
  );
}

/** One review: its stars, who and when, its words (or that there are none), and the reply, or the door to write one. */
function reviewRow(r: GoogleReviewVM, vm: GoogleVM, operator: boolean) {
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

/** The latest reviews with their words, and the listing's own address for the rest. */
function latestCard(vm: GoogleVM, mapsUri: string | null, operator: boolean) {
  return (
    <ChartCard
      className="rpt-span-12"
      title="Latest reviews"
      testid="chart-google-latest"
      table={vm.table}
      takeaway={vm.latest.length ? (vm.reply.words ? `${vm.source} · ${vm.reply.words}` : vm.source) : null}
    >
      {vm.latest.length ? (
        <div className="rp2-reviews">{vm.latest.map((r) => reviewRow(r, vm, operator))}</div>
      ) : (
        <EmptyState kind="line" title="Google shows no written reviews for this listing yet." />
      )}
      {/* The card shows what Google hands back, which is never the whole listing: the rest are on Google, and the
          listing's own address is the one place that has all of them. Google's `maps_uri`, as Setup links it. */}
      {mapsUri && (
        <p className="rp2-reviews-more">
          <a
            className="cl-bucket-link"
            href={mapsUri}
            target="_blank"
            rel="noreferrer"
            data-testid="google-open-listing"
          >
            Read every review on Google
            <Icon name="external" size={12} />
          </a>
        </p>
      )}
    </ChartCard>
  );
}

export function GoogleSection({ days }: { days: number }) {
  const G = useSurface("google");
  if (!G || (!G.dto.ready.places && !G.dto.ready.profile && !G.dto.listing)) return null;
  const vm = toGoogleVM(G.dto, days);
  const operator = canDo("approve");
  const L = vm.listing;
  if (!L) {
    return (
      <RptSection title="Google reviews">
        <div className="rpt-grid">
          <ChartCard className="rpt-span-12" title="Your listing on Google" testid="google-none">
            <EmptyState
              kind="line"
              title="Find your business on Google once."
              body="Its rating, its count and its newest reviews show here for the period, with a line on Today and a row on the bell when one lands."
              action={{ label: "Find it", to: "start/find" }}
            />
          </ChartCard>
        </div>
      </RptSection>
    );
  }
  return (
    <RptSection title="Google reviews" meta={`${L.name} · ${L.checked.charAt(0).toLowerCase()}${L.checked.slice(1)}`}>
      <div className="rp2-tiles rp2-strip-google four" data-testid="google-tiles">
        {vm.tiles.map((t) => (
          <RpTile key={t.id} t={t} />
        ))}
      </div>
      <div className="rpt-grid">
        {gainedCard(vm, days)}
        {latestCard(vm, L.mapsUri, operator)}
      </div>
    </RptSection>
  );
}
