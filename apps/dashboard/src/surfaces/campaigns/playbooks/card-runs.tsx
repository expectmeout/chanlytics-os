/**
 * A playbook's drawer, its runs (Ruben, 11 Oct 2026: the drawer's facts a line each, its runs under its message; then
 * "more compact without scrolling"): one line of what they earned in all, which folds open onto the newest of them, a
 * line each, each opening as itself on Sent (the kit's fold, RecordDisclosure). Apart from card-detail.tsx, which draws
 * the rest of the drawer and holds its verbs.
 */
import { BROADCAST_STATE_LABELS, DELIVERY_RECEIPTS_TIP } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { CmLines } from "../parts/lines";
import type { PlaybookCardVM } from "./surface";
import { pbDay, pbReplyTip } from "./words";

type History = PlaybookCardVM["totals"]["history"][number];

/** One run, a line that opens as itself on Sent (broadcasts/run:<id>), read by its id however old it is. */
function historyRow(h: History) {
  return (
    <LinkButton
      key={h.id}
      className="ob-history-row"
      onClick={() => navigate(`broadcasts/run:${h.id}`)}
      data-testid="pb-run-open"
    >
      <span className="ob-history-day tabular">
        {pbDay(h.run_for || (h.scheduled_for ? h.scheduled_for.slice(0, 10) : ""))}
      </span>
      <span className="ob-history-said">
        {h.state === "sent" ? (
          <>
            {h.sent} sent
            {h.held > 0 ? ` · ${h.held} held` : ""}
            {h.replied > 0 ? ` · ${h.replied} replied` : ""}
          </>
        ) : h.state === "pending_approval" ? (
          `${BROADCAST_STATE_LABELS.pending_approval} · ${h.recipient_count} people`
        ) : h.state === "sending" ? (
          `${BROADCAST_STATE_LABELS.sending} · ${h.sent} so far`
        ) : h.state === "scheduled" ? (
          `${BROADCAST_STATE_LABELS.scheduled} · ${h.recipient_count} people`
        ) : (
          h.state
        )}
      </span>
      <Icon name="chevron" size={11} />
    </LinkButton>
  );
}

/**
 * Its runs: one line of what they earned in all ("38 runs · 212 sent · 208 delivered · 41 replied", each number with its
 * tip), and the newest of them, a line each, newest first, from the same rows the totals are summed over. One run says
 * itself once, on its row, with when it ran over it (the sum and the row disagreed about which numbers to show); a
 * campaign that never ran says so in the line's place.
 */
export function CardRuns({ p }: { p: PlaybookCardVM }) {
  const t = p.totals;
  const runs = t.history && t.history.length > 0 ? t.history : null;
  const head = (
    <span className="ob-runs-head" data-testid={t.runs > 1 ? "pb-results" : undefined}>
      {t.runs > 1 ? (
        <>
          <span className="tabular">{t.runs}</span> runs &middot; <span className="tabular">{t.sent}</span> sent
          &middot;{" "}
          <span className="tabular" data-tip={DELIVERY_RECEIPTS_TIP}>
            {t.delivered}
          </span>{" "}
          delivered &middot;{" "}
          <span className="tabular" data-tip={pbReplyTip()}>
            {t.replied}
          </span>{" "}
          replied
          {t.held > 0 ? (
            <>
              {" "}
              &middot; <span className="tabular">{t.held}</span> held back
            </>
          ) : null}
        </>
      ) : p.last_run_for ? (
        <>Last ran {pbDay(p.last_run_for)}</>
      ) : (
        <>It has not run yet</>
      )}
    </span>
  );
  return (
    <section className="ob-runs" data-testid="pb-history">
      {runs ? (
        <RecordDisclosure id={`pb-runs-${p.id}`} label={head} testid="pb-runs-fold">
          <CmLines>{runs.map((h) => historyRow(h))}</CmLines>
          {t.runs > runs.length ? (
            <span className="ob-history-more" data-testid="pb-history-more">
              The newest {runs.length} of {t.runs} runs
            </span>
          ) : null}
        </RecordDisclosure>
      ) : (
        head
      )}
    </section>
  );
}
