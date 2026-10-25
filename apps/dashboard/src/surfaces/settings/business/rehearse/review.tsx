// Chanlytics — How it did (decision 0069, R3 and R4): a conversation's answers judged, and each fixed where it went
// wrong.
//
// One component for every conversation reviewed: a rehearsal on Settings › How it answers (rehearse.tsx) and a real call
// in its thread (inbox/thread/call.tsx, Review this call). The review is the edge's (POST receptionist/review), kept on
// its rehearsal, so drawing it again costs nothing; every word is contracts' (REVIEW_WORDS, FIX_WORDS).
//
// What needs the owner comes first (reviewOrder: a guess, then a fact it did not know, then a wrong manner, then the
// rules it kept, then what was right), each with its pill, what was asked and answered, where it came from and why. An
// answer that was not right carries Fix it: the owner says what it should have said, the page asks where that goes
// (POST receptionist/fix, nothing written) and shows the field and its line ("Add to Services: Balayage · $180"), and
// Keep writes it through the settings' own write (POST receptionist/keep). Then It now reads: the block that changed,
// before and after, as the receptionist reads it. A rule's switch is offered as it is ("Turn off: never quote prices"),
// kept with one press. One fix open at a time, one change per Keep.
//
// Hookless but for each answer's own fix, so it can be drawn wherever a review is.

import { useState, type SyntheticEvent } from "react";
import {
  FIX_WORDS as F,
  guardrailIn,
  reviewHeadline,
  reviewOrder,
  REVIEW_WORDS as W,
  VERDICT_TONE,
  type FixChange,
  type ReviewDto,
  type ReviewItem,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { LinkButton } from "../../../kit/link-button/link-button";
import { StatePill } from "../../../kit/pill/state-pill";
import { RecordField } from "../../../kit/record/field";
import { RecordRow } from "../../../kit/record/row";
import { RecordSays } from "../../../kit/record/says";
import { rehearseVerbs, type FixFound, type Kept } from "./verbs";

/** Where a kept change came from, and which of the receptionist's compositions shows it. */
interface ReviewKeep {
  rehearsalId: string;
  via: "rehearsal" | "call_review";
  channel: "whatsapp" | "voice";
}

/** A correction's longest words: a receptionist's instruction, not an essay. */
const FIX_MAX_CHARS = 500;

/** What a fix is at: being written, found (its field and line, to Keep), or kept (and what it now reads). */
type FixState =
  { at: "writing" } | { at: "found"; found: Extract<FixFound, { change: FixChange }> } | { at: "kept"; kept: Kept };

/** It now reads: the block the change wrote, after and before, in the kit's own words for what a save writes. */
function BtNowReads({ kept, id }: { kept: Kept; id: string }) {
  const n = kept.now_reads;
  return (
    <div className="bt-rh-now" data-testid={`${id}-now`}>
      <p className="rec-hint" data-testid={`${id}-kept`}>
        {F.kept(kept.field)}
      </p>
      {n && (n.after || n.before) ? (
        <RecordSays
          testid={`${id}-now-reads`}
          label={`${F.nowReads} · ${n.label}`}
          text={n.after}
          gone={n.before !== n.after ? n.before : null}
          goneLabel={F.before}
        />
      ) : null}
    </div>
  );
}

/** One answer's fix: the owner's words, where they go, Keep, and what it now reads. */
function BtFix({
  item,
  id,
  keep,
  onKept,
  onClose,
}: {
  item: ReviewItem;
  id: string;
  keep: ReviewKeep;
  onKept: (k: Kept) => void;
  onClose: () => void;
}) {
  const [words, setWords] = useState("");
  const [state, setState] = useState<FixState>({ at: "writing" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A rule's switch, where the instruction it stood on names one: offered as it is.
  const rule = item.verdict === "rule" ? guardrailIn(item.from ?? item.said) : null;
  const said = words.trim();

  const find = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy || !said) return;
    setBusy(true);
    setProblem(null);
    const r = await rehearseVerbs.fix({
      kind: item.fix,
      words: said,
      customer: item.customer,
      answer: item.receptionist,
      rule: item.verdict === "rule" ? item.from : null,
    });
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    if (!r.data.change) return setProblem(r.data.words);
    setState({ at: "found", found: r.data });
  };
  const keepIt = async (change: FixChange) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const r = await rehearseVerbs.keep({
      rehearsal_id: keep.rehearsalId,
      change,
      via: keep.via,
      channel: keep.channel,
    });
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setState({ at: "kept", kept: r.data });
    onKept(r.data);
  };

  if (state.at === "kept") return <BtNowReads kept={state.kept} id={id} />;
  return (
    <form className="bt-try-ask" onSubmit={find} aria-busy={busy || undefined} data-testid={`${id}-fix`}>
      {state.at === "found" ? (
        <p className="bt-rh-line" data-testid={`${id}-line`}>
          {state.found.line}
        </p>
      ) : (
        <RecordField
          id={`${id}-words`}
          label={F.label}
          value={words}
          onChange={setWords}
          placeholder={F.placeholder}
          maxLength={FIX_MAX_CHARS}
          problem={problem}
          readOnly={busy || undefined}
          testid={`${id}-words`}
        />
      )}
      <span className="bt-try-acts">
        {state.at === "found" ? (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void keepIt(state.found.change)}
            data-testid={`${id}-keep`}
          >
            {busy ? F.keeping : F.keep}
          </Button>
        ) : (
          <Button type="submit" size="sm" variant="primary" disabled={busy || !said} data-testid={`${id}-route`}>
            {busy ? F.routing : F.route}
          </Button>
        )}
        {rule && state.at === "writing" ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void keepIt({ op: "set_guardrail", rule, on: false })}
            data-testid={`${id}-switch`}
          >
            {F.switchOff(rule)}
          </Button>
        ) : null}
        <LinkButton
          onClick={state.at === "found" ? () => setState({ at: "writing" }) : onClose}
          disabled={busy}
          data-testid={`${id}-cancel`}
        >
          {state.at === "found" ? F.reword : F.cancel}
        </LinkButton>
      </span>
      {state.at === "found" && problem ? (
        <p className="rec-hint" role="alert" data-testid={`${id}-problem`}>
          {problem}
        </p>
      ) : null}
    </form>
  );
}

/** One answer judged: its pill and where it came from, the exchange, why, and its fix. Hookless. */
function BtJudged({
  item,
  id,
  canEdit,
  keep,
  open,
  onOpen,
  onClose,
  onKept,
}: {
  item: ReviewItem;
  id: string;
  canEdit: boolean;
  keep: ReviewKeep;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onKept: (k: Kept) => void;
}) {
  // A rule kept is not wrong, so its fix can be none; its switch is still the owner's to change where one names it.
  const switchable = item.verdict === "rule" && guardrailIn(item.from ?? item.said) !== null;
  const fixable = canEdit && item.verdict !== "right" && (item.fix !== "none" || switchable);
  return (
    <div className="bt-rh-item" data-verdict={item.verdict} data-testid={id}>
      <span className="bt-rh-verdict">
        <StatePill
          kind="tone"
          value={VERDICT_TONE[item.verdict]}
          label={W.verdicts[item.verdict]}
          testid={`${id}-pill`}
        />
        <span className="rec-hint">{W.because[item.verdict](item.block)}</span>
      </span>
      <RecordRow id={`${id}-asked`} label={W.you} value={item.customer} />
      <RecordRow id={`${id}-said`} label={W.it} value={item.receptionist} />
      <p className="bt-rh-why" data-testid={`${id}-why`}>
        {item.why}
        {item.hint ? ` ${item.hint}` : ""}
      </p>
      {fixable && !open ? (
        <LinkButton onClick={onOpen} data-testid={`${id}-fix-it`}>
          {item.verdict === "rule" ? W.changeIt : W.fixIt}
        </LinkButton>
      ) : null}
      {fixable && open ? <BtFix item={item} id={id} keep={keep} onKept={onKept} onClose={onClose} /> : null}
    </div>
  );
}

/**
 * How it did: the headline, what the check could not judge, whether it was judged against the settings now, every
 * answer in the order the owner reads them, and the count of what was trained. `trained` is what was kept from this
 * conversation before; `onKept` hears each Keep, so the page can say it and ask again.
 */
export function RehearsalReview({
  review,
  keep,
  canEdit,
  trained,
  onKept,
  testid = "bt-rh-review",
}: {
  review: ReviewDto;
  keep: ReviewKeep;
  canEdit: boolean;
  trained: number;
  onKept?: (k: Kept) => void;
  testid?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [count, setCount] = useState(trained);
  const items = reviewOrder(review.items);
  const kept = (k: Kept) => {
    setCount(k.fixes);
    onKept?.(k);
  };
  return (
    <div className="bt-rh-review" data-testid={testid}>
      <RecordRow id={`${testid}-head`} label={W.title} value={reviewHeadline(review.items)} />
      {review.judged_against === "now" ? (
        <p className="rec-hint">{review.version === null ? W.unversioned : W.now}</p>
      ) : null}
      {review.dropped ? <p className="rec-hint">{W.dropped(review.dropped)}</p> : null}
      {items.map((item) => (
        <BtJudged
          key={item.n}
          item={item}
          id={`${testid}-${item.n}`}
          canEdit={canEdit}
          keep={keep}
          open={open === item.n}
          onOpen={() => setOpen(item.n)}
          onClose={() => setOpen(null)}
          onKept={kept}
        />
      ))}
      {count ? (
        <p className="rec-hint" data-testid={`${testid}-trained`}>
          {F.trained(count)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Review this call: a real call, in its thread, judged as a rehearsal is (decision 0069, item 11), against the settings
 * version it was composed from where it carried one. The press asks once; the review is kept on its own rehearsal (kind
 * `call_review`), so it is read again for nothing. A fix kept from it is `via: call_review`, on the voice composition.
 */
export function CallReview({ callId }: { callId: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [got, setGot] = useState<{ rehearsalId: string; review: ReviewDto } | null>(null);
  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const r = await rehearseVerbs.review({ call_id: callId });
    setBusy(false);
    if (!r.ok) return setProblem(r.message || W.failed);
    setGot({ rehearsalId: r.data.rehearsal_id, review: r.data.review });
  };
  if (got)
    return (
      <RehearsalReview
        review={got.review}
        keep={{ rehearsalId: got.rehearsalId, via: "call_review", channel: "voice" }}
        canEdit
        trained={0}
        testid="tl-call-review"
      />
    );
  return (
    <span className="bt-try-acts">
      <LinkButton onClick={() => void ask()} disabled={busy} data-testid="tl-call-review-ask">
        {busy ? W.reviewingCall : W.reviewCall}
      </LinkButton>
      {problem ? (
        <span className="rec-hint" role="alert" data-testid="tl-call-review-problem">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
